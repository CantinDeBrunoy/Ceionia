import * as THREE from 'three';
import { World, N, SEA } from '../world/world';
import { Building, sizeOf } from '../build/catalog';
import { Parts } from './parts';
import { mats } from './materials';
import { Puffs } from './particles';
import { airliner, freighter } from './models';
import type { BuildingView } from './buildings';

const SMOKE = new THREE.Color(0.32, 0.3, 0.3);

interface Ship {
  root: THREE.Group;
  age: number;
  funnel: THREE.Vector3 | null;
  state: 'docked' | 'out' | 'away' | 'in';
  t: number;
  /** chemin du quai vers le large (monde), distance parcourue */
  path: THREE.Vector3[];
  s: number;
  heading: number;
  key: string;
}

type PlanePhase = 'stand' | 'out' | 'roll' | 'fly' | 'rollout' | 'in';
interface Plane {
  root: THREE.Group;
  /** pour quelle taille d'aéroport (3 × 3 des anciennes parties, 4 × 4) */
  size: number;
  phase: PlanePhase;
  /** distance parcourue sur le tracé au sol en cours, avancement sur la courbe du vol (0 … 1) */
  s: number;
  u: number;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  bank: number;
  pitch: number;
  t: number;
}

type P2 = [number, number];
/**
 * Le plan de vol d'un aéroport (repère de l'aéroport, piste le long de x, décollage et atterrissage vers -x) : son poste et
 * son cap, le roulage jusqu'au seuil, la course de décollage, le tour du pays (courbe, y au-dessus de la piste), le
 * roulement après le toucher, le retour au poste
 */
interface FlightPlan { stand: P2; standHeading: number; out: P2[]; roll: [P2, P2]; air: THREE.CatmullRomCurve3; rollout: [P2, P2]; back: P2[] }
function flightPlan(size: number): FlightPlan {
  const big = size >= 4, rz = big ? 1.12 : 0.8, lift = big ? -1.45 : -1.25, td = big ? 1.65 : 1.3;
  const air = new THREE.CatmullRomCurve3([
    [lift, 0.09, rz], [lift - 2.6, 0.5, rz], [-8, 1.5, rz + 0.8], [-11, 2.8, rz + 5], [-4, 3.8, rz + 10], [5, 3.8, rz + 9],
    [10, 3.2, rz + 4], [11, 2.2, rz + 0.5], [8, 1.25, rz], [4.5, 0.55, rz], [td + 1, 0.18, rz], [td, 0, rz],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  return big
    ? { stand: [0.6, -0.45], standHeading: Math.PI / 2, out: [[0.6, -0.45], [1.72, -0.45], [1.72, rz]], roll: [[1.72, rz], [lift, rz]], air, rollout: [[td, rz], [-0.6, rz]], back: [[-0.6, rz], [-0.6, -0.45], [0.6, -0.45]] }
    : { stand: [0.95, -0.25], standHeading: 0, out: [[0.95, -0.25], [0.95, rz]], roll: [[0.95, rz], [lift, rz]], air, rollout: [[td, rz], [-0.45, rz]], back: [[-0.45, rz], [0.95, rz], [0.95, -0.25]] };
}
const polyLen = (pts: P2[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
/** Point à la distance s le long du tracé, et le cap du tronçon */
function polyAt(pts: P2[], s: number): [number, number, number] {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az);
    if (s <= l || i === pts.length - 1) { const k = l ? Math.min(1, s / l) : 1; return [ax + (bx - ax) * k, az + (bz - az) * k, Math.atan2(bx - ax, bz - az)]; }
    s -= l;
  }
  return [pts[0][0], pts[0][1], 0];
}
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Navires des ports et avions des aéroports. Au port, un navire de l'époque reste amarré le long du quai, puis appareille,
 * gagne le large tout droit tant que l'eau est profonde, disparaît à l'horizon et revient s'amarrer (le vapeur fume par sa
 * cheminée). À l'aéroport, un avion quitte son poste, roule jusqu'à la piste, accélère, décolle, fait un grand tour
 * au-dessus du pays, revient dans l'axe, se pose, freine et regagne son poste
 */
export class Transports {
  group = new THREE.Group();
  private ships = new Map<number, Ship>();
  private planes = new Map<number, Plane>();
  private shipGeos = new Map<number, { geo: THREE.BufferGeometry; funnel: [number, number, number] | null }>();
  private planeGeo: THREE.BufferGeometry;
  private smoke = new Puffs(160, 0);
  private v = new THREE.Vector3();

  constructor(private world: World, private buildings: BuildingView) {
    const p = new Parts();
    airliner(p, 0, 0, 0);
    this.planeGeo = p.build(false).body;
    this.group.add(this.smoke.mesh);
  }

  private waterY(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    if (!w.inCells(cx, cz)) return SEA;
    const k = w.ci(cx, cz);
    return w.lake[k] ? w.lakeLevel[k] : SEA;
  }

  private deep(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    return w.inCells(cx, cz) && (w.lake[w.ci(cx, cz)] === 1 || w.cellAvg(cx, cz) < -0.35);
  }

  update(dt: number, age: number) {
    const w = this.world, liveS = new Set<number>(), liveP = new Set<number>();
    for (const b of w.buildings.values()) {
      const g = this.buildings.entries.get(b.id)?.group;
      if (!g) continue;
      if (b.kind === 'harbor' && b.age >= 2) { liveS.add(b.id); this.stepShip(b, g, dt); }
      else if (b.kind === 'airport' && age >= 4) { liveP.add(b.id); this.stepPlane(b, g, dt); }
    }
    for (const [id, s] of this.ships) if (!liveS.has(id)) { this.group.remove(s.root); this.ships.delete(id); }
    for (const [id, p] of this.planes) if (!liveP.has(id)) { this.group.remove(p.root); this.planes.delete(id); }
    this.smoke.update(dt);
  }

  // ---------- Navires ----------

  private stepShip(b: Building, g: THREE.Group, dt: number) {
    const age = Math.min(b.age, 4), big = sizeOf(b) === 3, key = `${b.x}|${b.z}|${b.rot}|${age}|${+big}|${this.world.visVersion}`;
    let s = this.ships.get(b.id);
    if (s && s.key !== key) { this.group.remove(s.root); s = undefined; }
    if (!s) { s = this.makeShip(g, age, key, b.id, big); this.ships.set(b.id, s); }
    s.t -= dt;
    const L = s.path.length - 1;
    if (s.state === 'docked') {
      if (s.t <= 0 && L > 2) { s.state = 'out'; s.s = 0; }
    } else if (s.state === 'out' || s.state === 'in') {
      s.s += dt * (age >= 4 ? 0.7 : 0.45) * (big ? 1.3 : 1) * (s.state === 'out' ? 1 : -1);
      if (s.state === 'out' && s.s >= L) { s.state = 'away'; s.t = 18 + Math.random() * 25; s.root.visible = false; }
      if (s.state === 'in' && s.s <= 0) { s.state = 'docked'; s.s = 0; s.t = 30 + Math.random() * 30; }
    } else if (s.t <= 0) { s.state = 'in'; s.s = L; s.root.visible = true; }
    // position le long du chemin ; amarré, il longe le quai
    const i = Math.max(0, Math.min(L - 1, Math.floor(s.s))), f = Math.max(0, Math.min(1, s.s - i));
    const a = s.path[i], c = s.path[Math.min(L, i + 1)];
    this.v.lerpVectors(a, c, f);
    // cap : le long du quai à quai (dans le sens le plus proche), puis dans l'axe du chenal, proue vers où il va
    const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    const away = Math.atan2(c.x - a.x, c.z - a.z), along = s.state === 'in' ? away + Math.PI : away;
    const dock = g.rotation.y + Math.PI / 2, quay = Math.abs(wrap(dock - s.heading)) < Math.PI / 2 ? dock : dock + Math.PI;
    const want = s.state === 'docked' || s.state === 'away' ? quay : s.s < 0.6 ? quay + wrap(along - quay) * (s.s / 0.6) : along;
    s.heading += wrap(want - s.heading) * Math.min(1, dt * 1.5);
    s.root.position.set(this.v.x, this.waterY(this.v.x, this.v.z) + Math.sin(performance.now() / 900 + b.id) * 0.006, this.v.z);
    s.root.rotation.set(Math.sin(performance.now() / 1300 + b.id) * 0.01, s.heading, Math.sin(performance.now() / 1100) * 0.015);
    if (s.funnel && s.root.visible && Math.random() < dt * (s.state === 'docked' ? 2 : 7)) {
      s.root.updateMatrixWorld();
      const q = s.funnel.clone().applyMatrix4(s.root.matrixWorld);
      this.smoke.spawn(q.x, q.y, q.z, 0, 0.35, 0, 0.06, 3.5, SMOKE, 0, { grow: 3, drag: 0.2, wind: 0.25, alpha: 0.6 });
    }
  }

  private makeShip(g: THREE.Group, age: number, key: string, id: number, big = false): Ship {
    let geo = this.shipGeos.get(age);
    if (!geo) { const p = new Parts(); const f = freighter(p, age); geo = { geo: p.build(false).body, funnel: f }; this.shipGeos.set(age, geo); }
    const root = new THREE.Group(), mesh = new THREE.Mesh(geo.geo, mats.body);
    mesh.castShadow = true;
    root.add(mesh);
    // au grand port, un navire deux fois plus grand, à quai le long du mur, entre le bord et la jetée
    root.scale.setScalar(big ? 2 : age >= 4 ? 1.15 : 1);
    this.group.add(root);
    // le poste d'amarrage le long du quai, puis tout droit vers le large tant que l'eau est profonde (dix cases au plus)
    g.updateMatrixWorld();
    const berth = (big ? new THREE.Vector3(age >= 4 ? -0.2 : -0.32, 0, age >= 4 ? 1.95 : age === 3 ? 1.84 : 1.76) : new THREE.Vector3(0, 0, age >= 4 ? 1.42 : 1.38)).applyMatrix4(g.matrixWorld);
    const fx = Math.sin(g.rotation.y), fz = Math.cos(g.rotation.y), path = [berth.clone()];
    for (let k = 1; k <= 20; k++) {
      const x = berth.x + fx * k * 0.5, z = berth.z + fz * k * 0.5;
      // près du quai l'eau peut être basse ; au-delà, il lui faut de l'eau profonde
      const cx = Math.floor(x), cz = Math.floor(z), wet = this.world.inCells(cx, cz) && (this.world.lake[this.world.ci(cx, cz)] === 1 || this.world.cellAvg(cx, cz) < -0.08);
      if (!(k <= 4 ? wet : this.deep(x, z)) || x < 1 || z < 1 || x > N - 1 || z > N - 1) break;
      path.push(new THREE.Vector3(x, 0, z));
    }
    return { root, age, funnel: geo.funnel ? new THREE.Vector3(...geo.funnel) : null, state: 'docked', t: 6 + (id % 5) * 4, path, s: 0, heading: g.rotation.y + Math.PI / 2, key };
  }

  // ---------- Avions ----------

  private plans = new Map<number, FlightPlan>();

  /**
   * L'avion : il attend à son poste, roule par les voies jusqu'au seuil de la piste, accélère, lève le nez, quitte le sol
   * en douceur, fait le tour du pays en s'inclinant dans les virages, revient dans l'axe, se pose, freine et regagne son poste
   */
  private stepPlane(b: Building, g: THREE.Group, dt: number) {
    const size = sizeOf(b);
    let pl = this.planes.get(b.id);
    if (pl && pl.size !== size) { this.group.remove(pl.root); pl = undefined; }
    let plan = this.plans.get(size);
    if (!plan) { plan = flightPlan(size); this.plans.set(size, plan); }
    if (!pl) {
      const root = new THREE.Group(), mesh = new THREE.Mesh(this.planeGeo, mats.body);
      mesh.castShadow = true;
      root.add(mesh);
      root.scale.setScalar(1.1);
      root.rotation.order = 'YXZ';
      this.group.add(root);
      pl = { root, size, phase: 'stand', s: 0, u: 0, pos: new THREE.Vector3(plan.stand[0], 0, plan.stand[1]), heading: plan.standHeading, speed: 0, bank: 0, pitch: 0, t: 10 + (b.id % 4) * 6 };
      this.planes.set(b.id, pl);
    }
    g.updateMatrixWorld();
    const ground = (pts: P2[], v: number, acc: number) => {
      pl!.speed += Math.sign(v - pl!.speed) * Math.min(Math.abs(v - pl!.speed), acc * dt);
      pl!.s += pl!.speed * dt;
      const [x, z, h] = polyAt(pts, pl!.s);
      pl!.pos.set(x, 0, z);
      pl!.heading += wrapA(h - pl!.heading) * Math.min(1, dt * 2.5);
      return pl!.s >= polyLen(pts);
    };
    let targetPitch = 0, targetBank = 0;
    if (pl.phase === 'stand') {
      pl.t -= dt; pl.speed = 0;
      pl.pos.set(plan.stand[0], 0, plan.stand[1]); pl.heading = plan.standHeading;
      if (pl.t <= 0) { pl.phase = 'out'; pl.s = 0; }
    } else if (pl.phase === 'out') {
      if (ground(plan.out, 0.35, 0.6)) { pl.phase = 'roll'; pl.s = 0; }
    } else if (pl.phase === 'roll') {
      // la course : il accélère, lève le nez aux deux tiers, quitte le sol au bout
      const L = polyLen(plan.roll), done = ground(plan.roll, 2.9, 1.25);
      targetPitch = -0.2 * smoothstep(L - 0.95, L - 0.55, pl.s);
      pl.pos.y = 0.09 * smoothstep(L - 0.6, L, pl.s);
      if (done) { pl.phase = 'fly'; pl.u = 0; }
    } else if (pl.phase === 'fly') {
      const c = plan.air, len = c.getLength(), v = pl.u > 0.85 ? 3 - 0.8 * smoothstep(0.85, 1, pl.u) : 3;
      pl.speed += Math.sign(v - pl.speed) * Math.min(Math.abs(v - pl.speed), dt);
      pl.u = Math.min(1, pl.u + (pl.speed * dt) / len);
      const p = c.getPointAt(pl.u), t = c.getTangentAt(pl.u), h = Math.atan2(t.x, t.z), dh = wrapA(h - pl.heading);
      pl.pos.copy(p);
      pl.heading = h;
      targetBank = Math.max(-0.55, Math.min(0.55, (-dh / Math.max(1e-3, dt)) * 0.3));
      // le nez suit la pente ; en descente, il reste un peu levé (l'arrondi)
      targetPitch = Math.max(-0.26, Math.min(0.12, -Math.atan2(t.y, Math.hypot(t.x, t.z)) - (t.y < 0 ? 0.12 : 0)));
      if (pl.u >= 1) { pl.phase = 'rollout'; pl.s = 0; pl.pos.y = 0; }
    } else if (pl.phase === 'rollout') {
      if (ground(plan.rollout, 0.4, 1.1)) { pl.phase = 'in'; pl.s = 0; }
    } else if (ground(plan.back, 0.35, 0.6)) { pl.phase = 'stand'; pl.t = 25 + Math.random() * 30; }
    pl.pitch += (targetPitch - pl.pitch) * Math.min(1, dt * 4);
    pl.bank += (targetBank - pl.bank) * Math.min(1, dt * 2);
    const world = this.v.copy(pl.pos).applyMatrix4(g.matrixWorld);
    // jamais dans la montagne
    if (pl.phase === 'fly' && pl.u > 0.12 && pl.u < 0.85) world.y = Math.max(world.y, this.world.surfaceAt(world.x, world.z) + 1.2);
    pl.root.position.copy(world);
    pl.root.rotation.set(pl.pitch, g.rotation.y + pl.heading, pl.bank);
  }
}
