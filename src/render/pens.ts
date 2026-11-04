import * as THREE from 'three';
import { World } from '../world/world';
import { HerdKind, penHerds } from '../sim/missions';
import { makeActor, play, hasModel, Actor } from './assets';
import { ANIMAL } from './expeditionScenes';
import { mats } from './materials';

/**
 * Une bête qu'une expédition vient de ramener, laissée au village à la fin de l'expédition (voir ExpeditionView) : l'enclos
 * ou le pré près des fermes (Fauna) la reprend là où elle se trouve et comme elle se tient, au lieu d'en faire paraître une
 * autre ailleurs ; `claimed` : reprise (l'expédition retire alors la sienne)
 */
export interface Arrival { kind: HerdKind; x: number; z: number; heading: number; claimed: boolean }
export const ARRIVALS: Arrival[] = [];

/** Reprend la bête ramenée de cette espèce (la plus proche de (x, z) s'il y en a plusieurs) ; null s'il n'y en a pas */
export function claimArrival(kind: HerdKind, x = 0, z = 0): Arrival | null {
  let best: Arrival | null = null;
  for (const a of ARRIVALS) if (!a.claimed && a.kind === kind && (!best || Math.hypot(a.x - x, a.z - z) < Math.hypot(best.x - x, best.z - z))) best = a;
  if (best) best.claimed = true;
  return best;
}

/**
 * Le chemin d'une bête qui arrive au pré, du point (x, z) où elle se trouve (repère de l'enclos ou de l'écurie, 2 × 2
 * centré) : elle contourne la clôture par le côté le plus proche, se présente devant le portail (au milieu de l'avant, en
 * z = 0,88) et le franchit ; déjà au pré, rien (sur le seuil, un pas à l'intérieur)
 */
export function penWay(x: number, z: number): [number, number][] {
  if (Math.abs(x) < 0.92 && Math.abs(z) < 0.92) return Math.abs(x) < 0.3 && z > 0.7 ? [[0, 0.55]] : [];
  const way: [number, number][] = [], s = x >= 0 ? 1 : -1;
  if (z < 0.92) { if (Math.abs(x) < 1.3) way.push([s * 1.3, z]); way.push([s * 1.3, 1.3]); }
  return [...way, [0, 1.3], [0, 0.55]];
}

/**
 * Une bête de l'enclos (`kind` : son espèce, ou le chien, une poule) ; `route` : les étapes d'une bête qu'une expédition
 * vient de ramener, qui entre par le portail avant de vivre sa vie au pré
 */
interface PenBeast { obj: THREE.Object3D; actor: Actor | null; kind: string; x: number; z: number; tx: number; tz: number; heading: number; wait: number; speed: number; yaw: number; idle: string[]; route?: [number, number][] }
/** centre, orientation et plancher de l'enclos (posé au plus haut de son emprise), et où ses bêtes peuvent aller */
interface Pen { cx: number; cz: number; rot: number; floor: number; beasts: PenBeast[]; free: (x: number, z: number) => boolean }

/** Pré intérieur d'un enclos (repère de l'enclos, 2 × 2 centré) : l'abri occupe le coin du fond à gauche, le foin et le
 * poulailler celui du fond à droite */
const penFree = (x: number, z: number) => Math.abs(x) < 0.7 && Math.abs(z) < 0.7 && !(x < -0.12 && z < -0.22) && !(x > 0.05 && z < -0.36);
/** Paddock d'une écurie : devant la bâtisse, hors de l'auge (devant à droite) et du râtelier (à gauche) */
const paddockFree = (x: number, z: number) => Math.abs(x) < 0.7 && z > -0.1 && z < 0.74 && !(x > 0.42 && z > 0.5) && !(x < -0.62 && z > 0.08 && z < 0.5);
/** Allure d'une bête qui entre au pré par le portail (enclos et écurie ont le leur au milieu de l'avant, en z = 0,88) */
const ENTER = 0.4;

/**
 * Les bêtes ramenées par les expéditions vivent dans les enclos (six au plus par enclos) : elles broutent, flânent d'un bout
 * à l'autre du pré et se reposent ; celles qui n'y trouvent pas de place paissent près des fermes (voir Fauna). Une bête
 * qui arrive y entre à pied, de là où l'équipe l'a laissée ; les autres gardent leur place
 */
export class PenView {
  group = new THREE.Group();
  private pens = new Map<number, Pen>();
  private key = '';

  constructor(private world: World) {}

  private rebuild() {
    const w = this.world, { pens, stables } = penHerds(w);
    // les bêtes déjà là restent où elles sont et continuent ce qu'elles faisaient : rien ne saute quand une autre arrive
    const old = new Map<string, PenBeast[]>();
    for (const [id, p] of this.pens) for (const b of p.beasts) { const k = `${id}|${b.kind}`; old.set(k, [...(old.get(k) ?? []), b]); }
    const keep = (id: number, kind: string) => old.get(`${id}|${kind}`)?.shift() ?? null;
    this.pens.clear();
    const open = (id: number, free: Pen['free']): Pen => {
      const b = w.buildings.get(id)!;
      let floor = -1e9;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) floor = Math.max(floor, w.h(b.x + i, b.z + j));
      return { cx: b.x + 1, cz: b.z + 1, rot: b.rot * Math.PI / 2, floor: floor + 0.014, beasts: [], free };
    };
    // les chevaux de l'écurie dans le paddock, devant les stalles
    for (const [id, herd] of stables) {
      const pen = open(id, paddockFree);
      herd.forEach((k, i) => pen.beasts.push(keep(id, k) ?? this.beast(pen, k, i, -0.45 + (i % 2) * 0.7, i < 2 ? 0.15 : 0.5)));
      this.pens.set(id, pen);
    }
    for (const [id, herd] of pens) {
      const b = w.buildings.get(id)!, pen = open(id, penFree);
      // places de départ réparties dans le pré
      herd.forEach((k, i) => pen.beasts.push(keep(id, k) ?? this.beast(pen, k, i, -0.45 + (i % 3) * 0.45, i < 3 ? 0.1 : 0.5)));
      // le chien de berger garde l'enclos ; les poules picorent dans le pré (dès l'Antiquité, avec le poulailler)
      const dog = keep(id, 'dog') ?? this.extra('dog', 0.17, 0, 0.12, ['Idle', 'Idle_Eating'], 0.15, 0.62);
      if (dog) pen.beasts.push(dog);
      if (b.age >= 1) for (let i = 0; i < 3; i++) { const hen = keep(id, 'chicken') ?? this.extra('chicken', 0.085, Math.PI, 0.09, ['Idle_Eating', 'Eating', 'Idle'], 0.42 + i * 0.08, -0.35 + i * 0.1); if (hen) pen.beasts.push(hen); }
      this.pens.set(id, pen);
    }
    // celles qui n'ont plus leur place (enclos démoli, cheval parti en expédition) quittent le pré
    for (const list of old.values()) for (const b of list) { b.actor?.mixer.stopAllAction(); this.group.remove(b.obj); }
  }

  /**
   * Une bête de plus au pré, à sa place (x, z). Si une expédition vient de la ramener (voir `claimArrival`), elle part de là
   * où l'équipe l'a laissée : elle gagne le portail, entre, puis va à sa place
   */
  private beast(pen: Pen, k: HerdKind, i: number, x: number, z: number): PenBeast {
    const [name, len] = ANIMAL[k];
    const actor = hasModel(name) ? makeActor(name, len) : null;
    const obj: THREE.Object3D = actor ? actor.root : new THREE.Mesh(new THREE.IcosahedronGeometry(len * 0.5, 0), mats.body);
    if (actor) actor.mixer.setTime(i * 0.9);
    this.group.add(obj);
    const b: PenBeast = { obj, actor, kind: k, x, z, tx: x, tz: z, heading: i * 1.7, wait: 1 + i * 0.8, speed: 0.12, yaw: 0, idle: ['Idle_Eating', 'Eating', 'Idle'] };
    const c = Math.cos(pen.rot), s = Math.sin(pen.rot), arr = claimArrival(k, pen.cx + x * c + z * s, pen.cz - x * s + z * c);
    if (arr) {
      // du monde au repère de l'enclos
      const dx = arr.x - pen.cx, dz = arr.z - pen.cz, lx = dx * c - dz * s, lz = dx * s + dz * c;
      b.x = b.tx = lx; b.z = b.tz = lz; b.heading = arr.heading - pen.rot;
      b.route = [...penWay(lx, lz), [x, z]];
    }
    return b;
  }

  /** Une autre bête de l'enclos (chien, poule), seulement si son modèle est chargé */
  private extra(name: 'dog' | 'chicken', len: number, yaw: number, speed: number, idle: string[], x: number, z: number): PenBeast | null {
    if (!hasModel(name)) return null;
    const actor = makeActor(name, len);
    if (!actor) return null;
    actor.mixer.setTime(x * 7);
    this.group.add(actor.root);
    return { obj: actor.root, actor, kind: name, x, z, tx: x, tz: z, heading: x * 9, wait: 2 + z * 3, speed, yaw, idle };
  }

  update(dt: number) {
    const w = this.world, key = `${w.version}|${w.exp.herd.length}`;
    if (key !== this.key) { this.key = key; this.rebuild(); }
    for (const pen of this.pens.values()) {
      const c = Math.cos(pen.rot), s = Math.sin(pen.rot);
      for (const b of pen.beasts) {
        // une bête qui arrive : par le portail, jusqu'à sa place
        if (b.route) [b.tx, b.tz] = b.route[0];
        const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
        let moving = false;
        if (d > 0.02) {
          const step = Math.min(d, (b.route ? ENTER : b.speed) * dt);
          b.x += (dx / d) * step; b.z += (dz / d) * step;
          b.heading = Math.atan2(dx, dz);
          moving = true;
        } else if (b.route) {
          b.route.shift();
          if (!b.route.length) b.route = undefined;
        } else if ((b.wait -= dt) <= 0) {
          // une autre touffe d'herbe, ailleurs dans le pré
          b.wait = 3 + Math.random() * 6;
          for (let k = 0; k < 8; k++) {
            const x = (Math.random() - 0.5) * 1.4, z = (Math.random() - 0.5) * 1.4;
            if (pen.free(x, z)) { b.tx = x; b.tz = z; break; }
          }
        }
        // du repère de l'enclos (tourné comme le bâtiment) au monde
        const wx = pen.cx + b.x * c + b.z * s, wz = pen.cz - b.x * s + b.z * c;
        // (devant le portail, hors de l'emprise de l'enclos, elle marche sur le terrain)
        b.obj.position.set(wx, Math.abs(b.x) < 0.92 && Math.abs(b.z) < 0.92 ? pen.floor : w.surfaceAt(wx, wz), wz);
        b.obj.rotation.y = b.heading + pen.rot + b.yaw;
        if (b.actor) {
          play(b.actor, moving ? ['Walk', 'WalkSlow', 'Idle'] : b.idle);
          b.actor.mixer.update(dt);
        }
      }
    }
  }
}
