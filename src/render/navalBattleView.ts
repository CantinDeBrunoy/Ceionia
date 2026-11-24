import * as THREE from 'three';
import { World, SEA } from '../world/world';
import type { People } from '../world/archipelago';
import { navalSites, warshipKind, WEAPON, DEEP, type ShipWeapon } from '../sim/navalConflict';
import { NavalBattle, NShip, START, FLEE, type NavalKind } from '../sim/navalBattle';
import { shipClass } from '../sim/fleet';
import { warshipModel, debrisGeo } from './warships';
import { ourShipModel, pirateLook } from './models/ourShips';
import { vesselModel, merchantKind } from './seaTraffic';
import { CombatFx } from './combatFx';
import { Puffs } from './particles';
import { mats } from './materials';

/**
 * La bataille navale à l'écran (chantier B du nouveau monde) : la simulation (`sim/navalBattle.ts`) donne où sont les navires,
 * qui tire sur qui, qui coule ; la vue les pose sur l'eau du bras de mer et met en scène ce qu'elle dit, avec les morceaux de
 * l'escarmouche de décor (`navalConflict.ts`) : bordées et volées de flèches, gerbes, éclats, incendies, naufrages, débris,
 * fumée des cheminées. Nos navires (`models/ourShips.ts`) à nos couleurs, ceux de l'allié et du rival (`warships.ts`), les
 * marchands du convoi (`seaTraffic.ts`) et les pirates aux voiles noires
 */

type P = [number, number];
const rnd = Math.random;
const ease = (k: number) => k * k * (3 - 2 * k);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** La taille d'un navire à l'écran (les modèles font environ une case de long) */
const SHIP_K = 1.75, MERCHANT_K = 1.45;
const WHITE = new THREE.Color(0xe8f4f8), SMOKE = new THREE.Color(0.28, 0.26, 0.26), FIRE = new THREE.Color(1.6, 0.6, 0.2), STEAM = new THREE.Color(0.55, 0.55, 0.56);
/** Le temps du naufrage (s) ; l'épave fume encore, puis s'efface */
const SINK = 8, WRECK = 30;

/** Le repère de la bataille sur la carte : le centre, l'axe du bras de mer (de notre côté vers l'ennemi), l'échelle */
export interface NavalFrame { cx: number; cz: number; ux: number; uz: number; k: number }

/**
 * Où se livre la bataille : au milieu du bras de mer entre le port de l'allié et celui du rival (le blocus : devant le port
 * rival), l'axe de l'un vers l'autre ; l'échelle la plus grande (jusqu'à 1) pour que la scène tienne sur l'eau, au besoin un
 * peu à côté. Null sans archipel
 */
export function navalFrame(w: World, kind: NavalKind, ally: People, rival: People): NavalFrame | null {
  const s = navalSites(w);
  if (!s) return null;
  const [ax, az] = s.ports[ally], [bx, bz] = s.ports[rival], l = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / l, uz = (bz - az) / l;
  const base: P = kind === 'blockade' ? [bx - ux * 16, bz - uz * 16] : s.battle;
  const water = (x: number, z: number) => { const ix = Math.floor(x), iz = Math.floor(z); return w.inCells(ix, iz) && !w.lake[w.ci(ix, iz)] && w.cellAvg(ix, iz) < DEEP; };
  const fits = (cx: number, cz: number, k: number) => {
    for (let x = -START - 6; x <= START + 4; x += 3) for (let z = -8; z <= 14; z += 3) {
      const px = cx + (ux * x - uz * z) * k, pz = cz + (uz * x + ux * z) * k;
      if (!water(px, pz)) return false;
    }
    return true;
  };
  for (const k of [1, 0.85, 0.72, 0.62, 0.54])
    for (const [a, b] of [[0, 0], [0, 8], [0, -8], [6, 0], [-6, 0], [0, 16], [0, -16], [8, 8], [-8, -8]])
      { const cx = base[0] + ux * a - uz * b, cz = base[1] + uz * a + ux * b; if (fits(cx, cz, k)) return { cx, cz, ux, uz, k }; }
  return { cx: base[0], cz: base[1], ux, uz, k: 0.54 };
}

interface Ship {
  sim: NShip;
  root: THREE.Group;
  size: number;
  weapon: ShipWeapon;
  muzzles: [number, number, number][];
  funnels: THREE.Vector3[];
  heading: number;
  reload: number;
  /** naufrage : secondes depuis la mort (-1 : à flot) */
  dead: number;
  fire: number;
  seed: number;
  /** grandit à l'apparition, rapetisse en fuyant (0 … 1) */
  vis: number;
}

export class NavalBattleView {
  group = new THREE.Group();
  readonly fx = new CombatFx();
  private smoke = new Puffs(320, 0);
  private ships: Ship[] = [];
  private hits: { t: number; x: number; y: number; z: number; hit: boolean; big: boolean; plasma?: boolean }[] = [];
  private debris: { m: THREE.Mesh; vx: number; vz: number; spin: number; t: number }[] = [];
  private clock = 0;
  private v = new THREE.Vector3();
  /** un bruit de combat proche (pour le son) */
  onShot: ((big: boolean) => void) | null = null;

  constructor(private world: World, readonly battle: NavalBattle, readonly frame: NavalFrame, ally: People, rival: People, age: number) {
    this.group.add(this.fx.group, this.smoke.mesh);
    const a = Math.max(2, age), mine = shipClass(a);
    let ai = 0, fi = 0, mi = 0;
    for (const s of battle.ships) {
      let model: { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; muzzles: [number, number, number][]; funnels: THREE.Vector3[] }, weapon: ShipWeapon, size = SHIP_K;
      if (s.side === 'ours') {
        const m = ourShipModel(mine);
        model = { body: m.body, glow: m.glow, muzzles: m.muzzles, funnels: m.funnels.map((f) => new THREE.Vector3(...f)) };
        weapon = mine === 'destroyer' ? 'guns' : 'cannon';
      } else if (s.side === 'merchant') {
        const m = vesselModel(merchantKind(a, mi++), true);
        model = { body: m.geo, glow: null, muzzles: [], funnels: m.funnel ? [new THREE.Vector3(...m.funnel)] : [] };
        weapon = 'cannon'; size = MERCHANT_K;
      } else if (battle.kind === 'convoy') {
        const m = ourShipModel(pirateLook(fi++));
        model = { body: m.body, glow: m.glow, muzzles: m.muzzles, funnels: [] };
        weapon = 'cannon'; size = SHIP_K * 0.9;
      } else {
        const people = s.side === 'ally' ? ally : rival, k = warshipKind(people, a, s.side === 'ally' ? ai++ : fi++), m = warshipModel(k, people);
        model = { body: m.body, glow: m.glow, muzzles: m.muzzles, funnels: m.funnel ? [new THREE.Vector3(...m.funnel)] : [] };
        weapon = WEAPON[k];
      }
      const root = new THREE.Group(), hull = new THREE.Mesh(model.body, mats.body);
      hull.castShadow = true;
      root.add(hull);
      if (model.glow) root.add(new THREE.Mesh(model.glow, mats.glow));
      root.scale.setScalar(0.001);
      this.group.add(root);
      this.ships.push({ sim: s, root, size: size * Math.max(0.8, frame.k), weapon, muzzles: model.muzzles.length ? model.muzzles : [[0, 0.1, 0.3]], funnels: model.funnels, heading: this.toWorldAngle(s.heading), reload: 1 + rnd() * 2, dead: -1, fire: 0, seed: rnd() * 100, vis: 0 });
    }
  }

  // ---------- Repère ----------

  /** Un point de la bataille sur la carte */
  at(x: number, z: number): P {
    const f = this.frame;
    return [f.cx + (f.ux * x - f.uz * z) * f.k, f.cz + (f.uz * x + f.ux * z) * f.k];
  }
  /** Un cap de la bataille (0 : vers +x) en cap du monde (rotation y d'un modèle à la proue vers +z) */
  private toWorldAngle(h: number) {
    const f = this.frame, dx = Math.cos(h), dz = Math.sin(h), wx = f.ux * dx - f.uz * dz, wz = f.uz * dx + f.ux * dz;
    return Math.atan2(wx, wz);
  }
  /** Le milieu de l'action (les navires à flot ; pendant l'approche, notre flotte ; l'escorte, le convoi), pour la caméra */
  focus(): P {
    const b = this.battle, mine = (s: NShip) => (b.escort ? s.side === 'merchant' || s.side === 'ours' : s.side === 'ours' || s.side === 'ally');
    const live = b.ships.filter((s) => !s.sunk && !s.fled && (b.phase === 'approach' || b.escort ? mine(s) : s.side !== 'merchant'));
    const all = live.length ? live : this.battle.ships;
    const x = all.reduce((a, s) => a + s.x, 0) / all.length, z = all.reduce((a, s) => a + s.z, 0) / all.length;
    return this.at(x, z);
  }

  // ---------- Une image ----------

  /** Une image (`dt` : secondes réelles ; `run` : la bataille avance, sinon elle attend un choix et tout reste en place) */
  update(dt: number, run: boolean) {
    this.clock += dt;
    const b = this.battle;
    for (const sh of this.ships) {
      const s = sh.sim;
      if (s.sunk && sh.dead < 0) this.wreck(sh);
      // (apparition au départ ; un navire qui fuit rapetisse au loin)
      const away = s.fled && (Math.abs(s.z) > 22 || s.x > FLEE - 6);
      sh.vis = Math.max(0, Math.min(1, sh.vis + (away ? -dt * 0.5 : dt * 0.8)));
      if (sh.dead >= 0) { this.sink(sh, dt); continue; }
      // (le brûlot brûle en filant sur l'ennemi ; un navire très abîmé fume et flambe)
      const hp = s.hp / s.max;
      sh.fire = s.role === 'strike' && b.phase === 'engage' ? 1 : s.taken ? 0.3 : Math.max(0, (0.5 - hp) * 1.6);
      this.pose(sh, dt);
      if (run && s.firing && !s.taken) this.shoot(sh, dt);
      this.burn(sh, dt);
      this.puffFunnels(sh, dt);
    }
    this.landHits(dt);
    this.drift(dt);
    this.fx.update(dt);
    this.smoke.update(dt);
  }

  /** Pose le navire où le dit la simulation : roulis, tangage, le cap qui tourne doucement (le flanc vers l'ennemi au combat) */
  private pose(sh: Ship, dt: number) {
    const s = sh.sim, [x, z] = this.at(s.x, s.z);
    let want = this.toWorldAngle(s.heading);
    const moving = Math.hypot(s.gx - s.x, s.gz - s.z) > 0.3;
    // au poste, en combat : le flanc (canons) ou la proue (le reste) vers la cible
    const tgt = s.target >= 0 && !moving ? this.ships.find((o) => o.sim.id === s.target) : undefined;
    if (tgt && this.battle.phase !== 'approach') {
      const a = Math.atan2(tgt.root.position.x - x, tgt.root.position.z - z);
      want = sh.weapon === 'cannon' ? (Math.abs(wrap(a + 1.1 - sh.heading)) < Math.abs(wrap(a - 1.1 - sh.heading)) ? a + 1.1 : a - 1.1) : a;
    }
    sh.heading += wrap(want - sh.heading) * Math.min(1, dt * 1.1);
    const t = this.clock + sh.seed;
    sh.root.scale.setScalar(Math.max(0.001, sh.size * ease(sh.vis)));
    sh.root.position.set(x, SEA + Math.sin(t * 1.1) * 0.012, z);
    sh.root.rotation.set(Math.sin(t * 0.8) * 0.018, sh.heading, Math.sin(t * 0.9) * 0.024 + (s.taken ? 0.06 : 0));
    sh.root.visible = sh.vis > 0.002;
  }

  /** Un point d'un navire dans le monde (repère du navire) */
  private world3(sh: Ship, p: [number, number, number] | THREE.Vector3, out = new THREE.Vector3()) {
    sh.root.updateMatrixWorld();
    return (p instanceof THREE.Vector3 ? out.copy(p) : out.set(p[0], p[1], p[2])).applyMatrix4(sh.root.matrixWorld);
  }

  /** Un tir quand l'arme est prête : volée de flèches enflammées, bordée de canon, rafale et obus, plasma */
  private shoot(sh: Ship, dt: number) {
    sh.reload -= dt;
    if (sh.reload > 0) return;
    const target = this.ships.find((o) => o.sim.id === sh.sim.target && o.dead < 0);
    if (!target) return;
    const tp = target.root.position, from = new THREE.Vector3();
    const aim = (spread: number) => {
      const hit = rnd() < 0.6;
      const a = rnd() * Math.PI * 2, r = hit ? rnd() * 0.25 * target.size : 0.6 + rnd() * 1.4;
      return { hit, x: tp.x + Math.cos(a) * r * (hit ? 1 : spread), y: SEA + (hit ? 0.12 * target.size : 0.02), z: tp.z + Math.sin(a) * r * (hit ? 0.5 : spread) };
    };
    const near = (m: [number, number, number]) => this.world3(sh, m, from);
    if (sh.weapon === 'arrows') {
      for (let i = 0; i < 3; i++) {
        near(sh.muzzles[i % sh.muzzles.length]);
        const q = aim(1);
        this.fx.arrow(from.x, from.y, from.z, q.x, q.y, q.z, true);
        this.hits.push({ t: Math.max(0.25, Math.hypot(q.x - from.x, q.z - from.z) / 9), x: q.x, y: q.y, z: q.z, hit: q.hit, big: false });
      }
      sh.reload = 1.3 + rnd() * 1.3;
    } else if (sh.weapon === 'cannon') {
      // la bordée : les bouches du flanc tourné vers la cible, coup sur coup
      const local = this.v.copy(tp).sub(sh.root.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -sh.heading), side = Math.sign(local.x) || 1;
      const ports = sh.muzzles.filter((m) => Math.sign(m[0]) === side);
      const k = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < k; i++) {
        near((ports.length ? ports : sh.muzzles)[Math.floor(rnd() * (ports.length || sh.muzzles.length))]);
        const q = aim(1.4);
        this.fx.blast(from.x, from.y, from.z, q.x - from.x, q.z - from.z);
        this.smoke.spawn(from.x, from.y, from.z, (q.x - from.x) * 0.05, 0.08, (q.z - from.z) * 0.05, 0.22, 3, STEAM, 0, { grow: 3.5, drag: 0.6, wind: 0.2, alpha: 0.75 });
        this.hits.push({ t: 0.25 + Math.hypot(q.x - from.x, q.z - from.z) / 14 + i * 0.12, x: q.x, y: q.y, z: q.z, hit: q.hit, big: true });
      }
      this.onShot?.(true);
      sh.reload = 2.4 + rnd() * 1.8;
    } else if (sh.weapon === 'guns') {
      // la rafale de la tourelle, et de temps en temps un obus de la pièce principale
      near(sh.muzzles[0]);
      for (let i = 0; i < 4; i++) {
        const q = aim(1.2);
        this.fx.tracer(from.x, from.y, from.z, q.x, q.y + 0.05, q.z, 0xffc86a, 14);
        if (i === 3) this.hits.push({ t: Math.hypot(q.x - from.x, q.z - from.z) / 14, x: q.x, y: q.y, z: q.z, hit: q.hit, big: false });
      }
      this.fx.flash(from.x, from.y, from.z);
      if (rnd() < 0.45) {
        near(sh.muzzles[1 + Math.floor(rnd() * (sh.muzzles.length - 1))] ?? sh.muzzles[0]);
        const q = aim(1);
        this.fx.blast(from.x, from.y, from.z, q.x - from.x, q.z - from.z);
        this.hits.push({ t: 0.2 + Math.hypot(q.x - from.x, q.z - from.z) / 12, x: q.x, y: q.y, z: q.z, hit: q.hit, big: true });
        this.onShot?.(true);
      }
      sh.reload = 1.5 + rnd() * 1.2;
    } else {
      near(sh.muzzles[0]);
      const q = aim(1);
      this.fx.tracer(from.x, from.y, from.z, q.x, q.y, q.z, 0x5af0ff, 10);
      this.hits.push({ t: Math.hypot(q.x - from.x, q.z - from.z) / 10, x: q.x, y: q.y, z: q.z, hit: q.hit, big: false, plasma: true });
      sh.reload = 1.4 + rnd() * 1.2;
    }
  }

  /** Les impacts arrivés : éclats et flammes sur la coque touchée, gerbe d'eau à côté */
  private landHits(dt: number) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t -= dt;
      if (h.t > 0) continue;
      this.hits.splice(i, 1);
      if (h.hit) {
        if (h.plasma) this.fx.plasmaHit(h.x, h.y, h.z, SEA);
        else if (h.big) this.fx.boom(h.x, h.y, h.z);
        else this.fx.hit(h.x, h.y, h.z, 0xffa040, 8, 'shot');
        this.fx.chips(h.x, h.y, h.z, 0x7a5236, 5);
      } else this.splash(h.x, h.z, h.big ? 1 : 0.6);
    }
  }

  /** Gerbe d'eau : une colonne blanche qui monte et retombe en écume */
  private splash(x: number, z: number, k: number) {
    for (let i = 0; i < 5; i++) this.smoke.spawn(x + (rnd() - 0.5) * 0.15, SEA + 0.02, z + (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.3, (0.8 + rnd() * 0.8) * k, (rnd() - 0.5) * 0.3, 0.1 * k + 0.04, 0.9, WHITE, 0, { grow: 2.2, drag: 2.5, wind: 0.05, alpha: 0.85, fade: 0.3 });
    this.fx.chips(x, SEA + 0.05, z, 0xf4fbff, 6);
  }

  /** Un navire en feu : flammes et fumée noire sur le pont */
  private burn(sh: Ship, dt: number) {
    if (sh.fire <= 0 || !sh.root.visible || Math.random() > dt * 14 * sh.fire) return;
    const p = this.world3(sh, [(rnd() - 0.5) * 0.12, 0.12, (rnd() - 0.5) * 0.6]);
    this.smoke.spawn(p.x, p.y, p.z, 0, 0.5, 0, 0.12 * sh.size, 0.6, FIRE, 1, { grow: 1.6, alpha: 0.9, fade: 0.2 });
    this.smoke.spawn(p.x, p.y + 0.1, p.z, 0, 0.45, 0, 0.16 * sh.size, 4, SMOKE, 0, { grow: 3.4, drag: 0.15, wind: 0.35, alpha: 0.7 });
  }

  /** La fumée des cheminées (vapeur, destroyer, marchands à vapeur) */
  private puffFunnels(sh: Ship, dt: number) {
    if (!sh.funnels.length || !sh.root.visible) return;
    for (const f of sh.funnels) if (Math.random() < dt * 5) {
      const p = this.world3(sh, f);
      this.smoke.spawn(p.x, p.y, p.z, 0, 0.4, 0, 0.08 * sh.size, 3.5, SMOKE, 0, { grow: 3, drag: 0.2, wind: 0.25, alpha: 0.55 });
    }
  }

  /** Un navire coule : l'explosion, les débris qui dérivent */
  private wreck(sh: Ship) {
    sh.dead = 0;
    const p = sh.root.position;
    this.fx.boom(p.x, SEA + 0.15, p.z);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(debrisGeo(), mats.body);
      m.position.set(p.x + (rnd() - 0.5) * 0.6, SEA, p.z + (rnd() - 0.5) * 0.6);
      m.rotation.y = rnd() * 6.28;
      m.scale.setScalar(sh.size * (0.6 + rnd() * 0.5));
      this.group.add(m);
      const a = rnd() * 6.28, v = 0.06 + rnd() * 0.12;
      this.debris.push({ m, vx: Math.cos(a) * v, vz: Math.sin(a) * v, spin: (rnd() - 0.5) * 0.3, t: 0 });
    }
  }

  /** Le naufrage : le navire gîte, pique de l'avant et s'enfonce ; l'épave fume, puis plus rien */
  private sink(sh: Ship, dt: number) {
    sh.dead += dt;
    const k = ease(Math.min(1, sh.dead / SINK)), gone = sh.dead > SINK + WRECK ? Math.min(1, (sh.dead - SINK - WRECK) / 5) : 0;
    if (gone >= 1) { sh.root.visible = false; return; }
    sh.fire = sh.dead < SINK ? 1 : Math.max(0, 1 - (sh.dead - SINK) / 10);
    const t = this.clock + sh.seed;
    sh.root.position.y = SEA - k * 0.11 * sh.size - gone * 0.3 * sh.size + Math.sin(t) * 0.005;
    sh.root.rotation.set(-k * 0.22, sh.heading, k * 0.45 + Math.sin(t * 0.7) * 0.01);
    this.burn(sh, dt);
    if (sh.dead > SINK && Math.random() < dt * 3 * (1 - gone)) {
      const p = this.world3(sh, [0, 0.1, 0]);
      this.smoke.spawn(p.x, Math.max(SEA, p.y), p.z, 0, 0.35, 0, 0.14 * sh.size, 5, SMOKE, 0, { grow: 3.6, drag: 0.15, wind: 0.4, alpha: 0.55 });
    }
  }

  private drift(dt: number) {
    for (const d of this.debris) {
      d.t += dt;
      d.m.position.x += d.vx * dt; d.m.position.z += d.vz * dt;
      d.vx *= 1 - dt * 0.03; d.vz *= 1 - dt * 0.03;
      d.m.rotation.y += d.spin * dt;
      d.m.position.y = SEA - 0.01 + Math.sin(this.clock * 1.4 + d.spin * 30) * 0.008 - Math.max(0, d.t - 40) * 0.01;
      d.m.visible = d.m.position.y > SEA - 0.2;
    }
  }

  /** Mesure : navires et triangles en scène */
  stats() {
    let tris = 0;
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && m.geometry) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    return { ships: this.ships.filter((s) => s.root.visible).length, tris: Math.round(tris) };
  }

  dispose() {
    this.group.removeFromParent();
    for (const d of this.debris) this.group.remove(d.m);
    this.ships = []; this.debris = []; this.hits = [];
  }
}

/**
 * Nos navires de guerre au mouillage (chantier B) : deux au plus devant chaque chantier naval, à flot sur l'eau la plus proche
 * (à leur classe de l'âge du village : ils se modernisent d'eux-mêmes). Cachés pendant une bataille navale
 */
export class FleetMoorings {
  group = new THREE.Group();
  private key = '';
  private boats: { root: THREE.Group; seed: number }[] = [];
  private clock = 0;
  private wait = 0;
  constructor(private world: World) {}

  update(dt: number, age: number, afloat: number, visible: boolean) {
    this.clock += dt;
    this.group.visible = visible && afloat > 0;
    if (!this.group.visible) return;
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 0.5;
      const yards = [...this.world.buildings.values()].filter((b) => b.kind === 'shipyard').sort((a, b) => a.id - b.id);
      const key = `${shipClass(age)}|${afloat}|${yards.map((b) => `${b.id}:${b.x}:${b.z}`).join(',')}`;
      if (key !== this.key) { this.key = key; this.rebuild(yards, age, afloat); }
    }
    for (const b of this.boats) {
      const t = this.clock + b.seed;
      b.root.position.y = SEA + Math.sin(t * 1.1) * 0.01;
      b.root.rotation.x = Math.sin(t * 0.8) * 0.012; b.root.rotation.z = Math.sin(t * 0.9) * 0.018;
    }
  }

  /** Les places : deux par chantier, sur l'eau libre la plus proche, parallèles à la rive */
  private rebuild(yards: { x: number; z: number; kind: string; size?: number }[], age: number, afloat: number) {
    for (const b of this.boats) this.group.remove(b.root);
    this.boats = [];
    const w = this.world, m = ourShipModel(shipClass(age)), taken: P[] = [];
    const open = (x: number, z: number) => w.inCells(x, z) && !w.lake[w.ci(x, z)] && w.cellAvg(x, z) < -0.2;
    let n = 0;
    for (const y of yards) {
      const s = 3, cx = y.x + s / 2, cz = y.z + s / 2;
      const spots: P[] = [];
      for (let d = 3; d <= 9 && spots.length < 2; d++) for (let a = 0; a < 24 && spots.length < 2; a++) {
        const ang = (a / 24) * Math.PI * 2, x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d;
        // (toute la coque sur l'eau, loin des autres navires)
        if (![[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]].every(([dx, dz]) => open(Math.floor(x + dx), Math.floor(z + dz)))) continue;
        if ([...taken, ...spots].some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.6)) continue;
        spots.push([x, z]);
      }
      for (const [x, z] of spots) {
        if (n >= afloat) break;
        const root = new THREE.Group(), hull = new THREE.Mesh(m.body, mats.body);
        hull.castShadow = true;
        root.add(hull);
        if (m.glow) root.add(new THREE.Mesh(m.glow, mats.glow));
        root.position.set(x, SEA, z);
        // (parallèle à la rive : le flanc vers le chantier)
        root.rotation.y = Math.atan2(x - cx, z - cz) + Math.PI / 2;
        root.scale.setScalar(1.5);
        this.group.add(root);
        this.boats.push({ root, seed: rnd() * 100 });
        taken.push([x, z]);
        n++;
      }
    }
  }
}
