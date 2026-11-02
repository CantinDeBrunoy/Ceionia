import * as THREE from 'three';
import { World } from '../world/world';
import { HerdKind, penHerds } from '../sim/missions';
import { makeActor, play, hasModel, Actor } from './assets';
import { ANIMAL } from './expeditionScenes';
import { mats } from './materials';

interface PenBeast { obj: THREE.Object3D; actor: Actor | null; x: number; z: number; tx: number; tz: number; heading: number; wait: number; speed: number; yaw: number; idle: string[] }
/** centre, orientation et plancher de l'enclos (posé au plus haut de son emprise), et où ses bêtes peuvent aller */
interface Pen { cx: number; cz: number; rot: number; floor: number; beasts: PenBeast[]; free: (x: number, z: number) => boolean }

/** Pré intérieur d'un enclos (repère de l'enclos, 2 × 2 centré) : l'abri occupe le coin du fond à gauche, le foin et le
 * poulailler celui du fond à droite */
const penFree = (x: number, z: number) => Math.abs(x) < 0.7 && Math.abs(z) < 0.7 && !(x < -0.12 && z < -0.22) && !(x > 0.05 && z < -0.36);
/** Paddock d'une écurie : devant la bâtisse, hors de l'auge (devant à droite) et du râtelier (à gauche) */
const paddockFree = (x: number, z: number) => Math.abs(x) < 0.7 && z > -0.1 && z < 0.74 && !(x > 0.42 && z > 0.5) && !(x < -0.62 && z > 0.08 && z < 0.5);

/**
 * Les bêtes ramenées par les expéditions vivent dans les enclos (six au plus par enclos) : elles broutent, flânent d'un bout
 * à l'autre du pré et se reposent ; celles qui n'y trouvent pas de place paissent près des fermes (voir Fauna)
 */
export class PenView {
  group = new THREE.Group();
  private pens = new Map<number, Pen>();
  private key = '';

  constructor(private world: World) {}

  private rebuild() {
    const w = this.world, { pens, stables } = penHerds(w);
    for (const p of this.pens.values()) for (const b of p.beasts) { b.actor?.mixer.stopAllAction(); this.group.remove(b.obj); }
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
      herd.forEach((k, i) => { const h = this.beast(k, i); h.x = h.tx = -0.45 + (i % 2) * 0.7; h.z = h.tz = i < 2 ? 0.15 : 0.5; pen.beasts.push(h); });
      this.pens.set(id, pen);
    }
    for (const [id, herd] of pens) {
      const b = w.buildings.get(id)!, pen = open(id, penFree);
      herd.forEach((k, i) => pen.beasts.push(this.beast(k, i)));
      // le chien de berger garde l'enclos ; les poules picorent dans le pré (dès l'Antiquité, avec le poulailler)
      const dog = this.extra('dog', 0.17, 0, 0.12, ['Idle', 'Idle_Eating'], 0.15, 0.62);
      if (dog) pen.beasts.push(dog);
      if (b.age >= 1) for (let i = 0; i < 3; i++) { const hen = this.extra('chicken', 0.085, Math.PI, 0.09, ['Idle_Eating', 'Eating', 'Idle'], 0.42 + i * 0.08, -0.35 + i * 0.1); if (hen) pen.beasts.push(hen); }
      this.pens.set(id, pen);
    }
  }

  private beast(k: HerdKind, i: number): PenBeast {
    const [name, len] = ANIMAL[k];
    const actor = hasModel(name) ? makeActor(name, len) : null;
    const obj: THREE.Object3D = actor ? actor.root : new THREE.Mesh(new THREE.IcosahedronGeometry(len * 0.5, 0), mats.body);
    if (actor) actor.mixer.setTime(i * 0.9);
    this.group.add(obj);
    // places de départ réparties dans le pré
    const x = -0.45 + (i % 3) * 0.45, z = (i < 3 ? 0.1 : 0.5);
    return { obj, actor, x, z, tx: x, tz: z, heading: i * 1.7, wait: 1 + i * 0.8, speed: 0.12, yaw: 0, idle: ['Idle_Eating', 'Eating', 'Idle'] };
  }

  /** Une autre bête de l'enclos (chien, poule), seulement si son modèle est chargé */
  private extra(name: 'dog' | 'chicken', len: number, yaw: number, speed: number, idle: string[], x: number, z: number): PenBeast | null {
    if (!hasModel(name)) return null;
    const actor = makeActor(name, len);
    if (!actor) return null;
    actor.mixer.setTime(x * 7);
    this.group.add(actor.root);
    return { obj: actor.root, actor, x, z, tx: x, tz: z, heading: x * 9, wait: 2 + z * 3, speed, yaw, idle };
  }

  update(dt: number) {
    const w = this.world, key = `${w.version}|${w.exp.herd.length}`;
    if (key !== this.key) { this.key = key; this.rebuild(); }
    for (const pen of this.pens.values()) {
      const c = Math.cos(pen.rot), s = Math.sin(pen.rot);
      for (const b of pen.beasts) {
        const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
        let moving = false;
        if (d > 0.02) {
          const step = Math.min(d, b.speed * dt);
          b.x += (dx / d) * step; b.z += (dz / d) * step;
          b.heading = Math.atan2(dx, dz);
          moving = true;
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
        b.obj.position.set(wx, pen.floor, wz);
        b.obj.rotation.y = b.heading + pen.rot + b.yaw;
        if (b.actor) {
          play(b.actor, moving ? ['Walk', 'WalkSlow', 'Idle'] : b.idle);
          b.actor.mixer.update(dt);
        }
      }
    }
  }
}
