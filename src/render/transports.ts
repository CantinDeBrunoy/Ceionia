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

interface Plane {
  root: THREE.Group;
  /** étape en cours et ses points de passage (repère de l'aéroport), vitesse visée */
  phase: number;
  wp: number;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  t: number;
}

/** Les étapes du vol (repère de l'aéroport, y au-dessus de la piste) : points de passage et vitesse */
const LEGS: { pts: [number, number, number][]; v: number }[] = [
  { pts: [[0.95, 0, -0.25]], v: 0 },
  { pts: [[0.95, 0, 0.8]], v: 0.35 },
  { pts: [[-0.75, 0, 0.8]], v: 2.6 },
  { pts: [[-6, 2.2, 0.8], [-9, 3.6, 5], [0, 4, 9.5], [9, 3.6, 5], [11, 3, 0.8]], v: 3.2 },
  { pts: [[5, 1.3, 0.8], [1.35, 0.02, 0.8]], v: 2.2 },
  { pts: [[-0.45, 0, 0.8]], v: 0.9 },
  { pts: [[0.95, 0, 0.8], [0.95, 0, -0.25]], v: 0.35 },
];

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

  private stepPlane(b: Building, g: THREE.Group, dt: number) {
    let pl = this.planes.get(b.id);
    if (!pl) {
      const root = new THREE.Group(), mesh = new THREE.Mesh(this.planeGeo, mats.body);
      mesh.castShadow = true;
      root.add(mesh);
      root.scale.setScalar(1.1);
      root.rotation.order = 'YXZ';
      this.group.add(root);
      pl = { root, phase: 0, wp: 0, pos: new THREE.Vector3(0.95, 0, -0.25), heading: 0, speed: 0, t: 10 + (b.id % 4) * 6 };
      this.planes.set(b.id, pl);
    }
    g.updateMatrixWorld();
    const leg = LEGS[pl.phase];
    let turn = 0, climb = 0;
    if (pl.phase === 0) {
      pl.t -= dt;
      pl.speed = 0;
      if (pl.t <= 0) { pl.phase = 1; pl.wp = 0; }
    } else {
      const [tx, ty, tz] = leg.pts[pl.wp];
      // vitesse : on accélère sur la piste, on freine à l'atterrissage ; on roule au pas sur les voies
      const acc = pl.phase === 2 ? 1.1 : pl.phase === 5 ? 1.6 : 2;
      pl.speed += Math.sign(leg.v - pl.speed) * Math.min(Math.abs(leg.v - pl.speed), acc * dt);
      const dx = tx - pl.pos.x, dy = ty - pl.pos.y, dz = tz - pl.pos.z, dist = Math.hypot(dx, dy, dz), step = Math.max(0.15, pl.speed) * dt;
      const want = Math.atan2(dx, dz);
      let da = want - pl.heading;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const rate = pl.phase === 3 ? 0.9 : 3;
      turn = Math.max(-rate, Math.min(rate, da * 3));
      pl.heading += turn * dt;
      if (dist <= step + 0.02) {
        pl.pos.set(tx, ty, tz);
        if (++pl.wp >= leg.pts.length) {
          pl.wp = 0;
          pl.phase = (pl.phase + 1) % LEGS.length;
          if (pl.phase === 0) pl.t = 25 + Math.random() * 30;
        }
      } else {
        // en vol, on file dans son cap (les virages s'arrondissent) ; au sol, droit sur le point
        const fly = pl.phase === 3 || pl.phase === 4;
        if (fly) {
          pl.pos.x += Math.sin(pl.heading) * step * Math.hypot(dx, dz) / dist;
          pl.pos.z += Math.cos(pl.heading) * step * Math.hypot(dx, dz) / dist;
          pl.pos.y += (dy / dist) * step;
        } else pl.pos.addScaledVector(this.v.set(dx, dy, dz).normalize(), step);
        climb = (dy / dist) * pl.speed;
      }
      // décollage : le nez se lève en fin de roulage
      if (pl.phase === 2 && pl.pos.x < 0.1) pl.pos.y = Math.min(0.3, (0.1 - pl.pos.x) * 0.35);
    }
    const world = this.v.copy(pl.pos).applyMatrix4(g.matrixWorld);
    // jamais dans la montagne
    if (pl.phase === 3) world.y = Math.max(world.y, this.world.surfaceAt(world.x, world.z) + 1.2);
    pl.root.position.copy(world);
    pl.root.rotation.set(-Math.atan2(climb, Math.max(0.5, pl.speed)) * 0.8 - (pl.phase === 2 && pl.pos.y > 0.01 ? 0.15 : 0), g.rotation.y + pl.heading, pl.phase === 3 ? -turn * 0.35 : 0);
  }
}
