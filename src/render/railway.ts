import * as THREE from 'three';
import { World, N } from '../world/world';
import { Railway, Line, TRAIN_LEN } from '../sim/railway';
import { Parts } from './parts';
import { mats } from './materials';
import { Puffs } from './particles';
import { hash2 } from '../core/rng';

/** pas d'échantillonnage de la voie (en cases) */
const STEP = 0.15;
/** voitures du train, du côté de la gare à celui de l'avant-poste : centre (cases depuis le bout du train) et demi-entraxe */
const CARS: { kind: 'loco' | 'coach' | 'wagon'; at: number; half: number; flip?: boolean }[] = [
  { kind: 'loco', at: 0.22, half: 0.14, flip: true },
  { kind: 'coach', at: 0.71, half: 0.13 },
  { kind: 'wagon', at: 1.16, half: 0.1 },
  { kind: 'wagon', at: 1.58, half: 0.1 },
  { kind: 'loco', at: 2.04, half: 0.14 },
];
const SMOKE = new THREE.Color(0xdcd8d0);

/** Petit assembleur de géométrie colorée : quadrilatères et pavés orientés, sans index */
class Mesher {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  quad(a: number[], b: number[], c: number[], d: number[], color: number) {
    this.c.setHex(color);
    for (const p of [a, b, c, a, c, d]) { this.pos.push(p[0], p[1], p[2]); this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  /** pavé centré en (x, y bas, z), tourné de `h` autour de y (longueur `l` le long du cap) */
  block(x: number, y: number, z: number, h: number, w: number, ht: number, l: number, color: number) {
    const s = Math.sin(h), c = Math.cos(h);
    const P = (u: number, v: number, t: number) => [x + c * u + s * t, y + v, z - s * u + c * t];
    const [a, b, cc, d] = [P(-w / 2, ht, -l / 2), P(w / 2, ht, -l / 2), P(w / 2, ht, l / 2), P(-w / 2, ht, l / 2)];
    const [e, f, g, k] = [P(-w / 2, 0, -l / 2), P(w / 2, 0, -l / 2), P(w / 2, 0, l / 2), P(-w / 2, 0, l / 2)];
    this.quad(d, cc, b, a, color);
    const side = new THREE.Color(color).multiplyScalar(0.82).getHex();
    this.quad(k, g, cc, d, side); this.quad(f, e, a, b, side); this.quad(g, f, b, cc, side); this.quad(e, k, d, a, side);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Locomotive (avant = +z) : à vapeur, chaudière noire et roues rouges, à l'âge industriel ; diesel jaune ensuite */
function locoGeo(age: number) {
  const p = new Parts();
  if (age >= 4) {
    const body = 0xf2c84b, band = 0xd8553c;
    p.box(0.17, 0.035, 0.42, 0, 0.05, 0, 0x3c3c40);
    p.box(0.15, 0.16, 0.4, 0, 0.085, -0.01, body);
    p.box(0.152, 0.03, 0.402, 0, 0.13, -0.01, band);
    p.box(0.14, 0.1, 0.1, 0, 0.245, 0.12, body);
    p.box(0.12, 0.05, 0.004, 0, 0.27, 0.172, 0x2e3c48, 0, true);
    for (const s of [-1, 1]) p.box(0.004, 0.04, 0.07, s * 0.071, 0.27, 0.12, 0x2e3c48);
    for (let k = 0; k < 3; k++) p.box(0.1, 0.012, 0.05, 0, 0.245, -0.16 + k * 0.07, 0x5a5e66);
    p.box(0.03, 0.025, 0.006, 0, 0.17, 0.192, 0xfff0c0, 0, true);
    for (const z of [-0.13, 0.13]) { p.box(0.15, 0.05, 0.12, 0, 0.012, z, 0x2a2a2e); for (const s of [-1, 1]) for (const d of [-0.035, 0.035]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 8).rotateZ(Math.PI / 2), s * 0.07, 0.035, z + d, 0x3c3c40); }
    return p.build(false);
  }
  const boiler = 0x2a2a2e, brass = 0xc8a050, red = 0xb83a2e;
  p.box(0.16, 0.03, 0.42, 0, 0.05, 0, 0x3c3c40);
  p.add(new THREE.CylinderGeometry(0.065, 0.065, 0.26, 12).rotateX(Math.PI / 2), 0, 0.15, 0.06, boiler);
  for (const z of [-0.02, 0.08]) p.add(new THREE.CylinderGeometry(0.067, 0.067, 0.012, 12).rotateX(Math.PI / 2), 0, 0.15, z, brass);
  p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12).rotateX(Math.PI / 2), 0, 0.15, 0.19, 0x3c3c40);
  p.cyl(0.022, 0.03, 0.1, 8, 0, 0.2, 0.15, boiler); p.cyl(0.036, 0.026, 0.02, 8, 0, 0.3, 0.15, boiler);
  p.sphere(0.03, 0, 0.215, 0.04, brass, 1, 0.8);
  // réservoirs latéraux et cabine
  for (const s of [-1, 1]) p.box(0.04, 0.08, 0.2, s * 0.06, 0.08, 0.04, 0x3f6a4a);
  p.box(0.16, 0.17, 0.13, 0, 0.08, -0.14, 0x3f6a4a); p.box(0.18, 0.02, 0.16, 0, 0.25, -0.14, 0x8a2a2a);
  for (const s of [-1, 1]) p.box(0.004, 0.045, 0.06, s * 0.081, 0.18, -0.13, 0xffe2a0, 0, true);
  for (const z of [-0.12, 0.0, 0.12]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 10).rotateZ(Math.PI / 2), s * 0.075, 0.045, z, red);
  p.box(0.17, 0.035, 0.02, 0, 0.04, 0.205, red);
  p.add(new THREE.BoxGeometry(0.12, 0.05, 0.05), 0, 0.02, 0.23, red, 0, false, 0, -0.5);
  p.box(0.025, 0.025, 0.025, 0, 0.22, 0.2, 0xffe2a0, 0, true);
  return p.build(false);
}

/** Voiture des mineurs : banquettes sous un auvent ; `riders` mineurs casqués assis dedans */
function coachGeo(age: number, riders: number) {
  const p = new Parts(), wood = age >= 4 ? 0x4a6a8a : 0x7a5a42, roofC = age >= 4 ? 0xd8dde2 : 0x5a4a3a;
  p.box(0.16, 0.03, 0.4, 0, 0.05, 0, 0x3c3c40);
  p.box(0.16, 0.012, 0.38, 0, 0.08, 0, dark(wood, 1.15));
  for (const s of [-1, 1]) p.box(0.012, 0.07, 0.38, s * 0.074, 0.08, 0, wood);
  for (const z of [-1, 1]) p.box(0.16, 0.07, 0.012, 0, 0.08, z * 0.185, wood);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.012, 0.16, 0.012, x * 0.07, 0.15, z * 0.17, 0x3c3c40);
  p.box(0.19, 0.016, 0.42, 0, 0.31, 0, roofC);
  for (let k = 0; k < 3; k++) p.box(0.14, 0.03, 0.04, 0, 0.09, -0.12 + k * 0.12, dark(wood, 0.8));
  const helmets = age >= 4 ? [0xf2c84b, 0xf2f2f2, 0xd8553c] : [0x8a6a3a, 0x5a5a62, 0x8a6a3a];
  for (let i = 0; i < Math.min(6, riders); i++) {
    const x = (i % 2 ? 1 : -1) * 0.035, z = -0.12 + Math.floor(i / 2) * 0.12;
    p.box(0.045, 0.06, 0.04, x, 0.12, z, [0x5a6a8a, 0x8a5a4a, 0x6a7a5a][i % 3]);
    p.sphere(0.022, x, 0.2, z, 0xf0c8a8, 1);
    p.sphere(0.026, x, 0.21, z, helmets[i % 3], 1, 0.6);
    p.box(0.012, 0.012, 0.008, x, 0.215, z + 0.024, 0xfff0c0, 0, true);
  }
  for (const z of [-0.13, 0.13]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8).rotateZ(Math.PI / 2), s * 0.075, 0.035, z, 0x2a2a2e);
  return p.build(false);
}

/** Wagon de minerai (tombereau) ; chargé, un tas de pierres et de minerai qui brille */
function wagonGeo(age: number, loaded: boolean) {
  const p = new Parts(), side = age >= 4 ? 0x9a5a44 : 0x6f5640;
  p.box(0.15, 0.03, 0.32, 0, 0.05, 0, 0x3c3c40);
  p.box(0.13, 0.012, 0.28, 0, 0.08, 0, dark(side, 0.8));
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.012, 0.1, 0.3), s * 0.072, 0.13, 0, side, 0, false, s * 0.18);
  for (const z of [-1, 1]) p.box(0.15, 0.1, 0.012, 0, 0.08, z * 0.145, side);
  if (age < 4) for (const z of [-0.08, 0.08]) p.box(0.162, 0.012, 0.014, 0, 0.15, z, 0x3c3c40);
  if (loaded) {
    p.sphere(0.075, 0, 0.16, -0.06, 0x6a6660, 0, 0.55); p.sphere(0.07, 0, 0.16, 0.07, 0x7a746c, 0, 0.55);
    for (let i = 0; i < 6; i++) p.sphere(0.016, (hash2(i, 1, 91) - 0.5) * 0.08, 0.19 + hash2(i, 2, 91) * 0.02, (hash2(i, 3, 91) - 0.5) * 0.22, [0xe8c66a, 0xd84a5a, 0x6ad8e8, 0x4a6ad8][i % 4], 0);
  }
  for (const z of [-0.1, 0.1]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8).rotateZ(Math.PI / 2), s * 0.07, 0.035, z, 0x2a2a2e);
  return p.build(false);
}

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

interface Car { group: THREE.Group; meshes: THREE.Mesh[]; variants: { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }[]; shown: number }

/**
 * Voie ferrée et train : ballast, traverses et rails posés sur le relief de la gare à l'avant-poste, quai de chargement au
 * pied de la grotte, et le train qui fait la navette (mineurs à l'aller, minerai au retour), fumée de la locomotive
 */
export class RailView {
  group = new THREE.Group();
  private track: THREE.Mesh | null = null;
  private line: Line | null = null;
  private vis = -1;
  private age = -1;
  private ys: Float32Array = new Float32Array(0);
  private cars: Car[] = [];
  private train = new THREE.Group();
  private puffs = new Puffs(160, 0);
  private puffT = 0;
  private v = new THREE.Vector3();

  constructor(private world: World, private rail: Railway) {
    this.group.add(this.train, this.puffs.mesh);
  }

  update(dt: number, age: number) {
    const l = this.rail.line, w = this.world;
    if (l !== this.line || w.visVersion !== this.vis || Math.min(age, 4) !== this.age) this.rebuild(l, Math.min(age, 4));
    this.train.visible = !!l;
    if (l) this.place(dt);
    this.puffs.update(dt);
  }

  /** Hauteur des rails à la distance s le long de la ligne */
  private yAt(s: number) {
    const ys = this.ys, f = Math.max(0, Math.min(ys.length - 1.001, s / STEP)), i = Math.floor(f);
    return ys[i] + (ys[i + 1] - ys[i]) * (f - i);
  }

  private rebuild(l: Line | null, age: number) {
    const w = this.world, rail = this.rail;
    this.line = l; this.vis = w.visVersion;
    if (this.track) { this.group.remove(this.track); this.track.geometry.dispose(); this.track = null; }
    if (age !== this.age) {
      this.age = age;
      for (const c of this.cars) { this.train.remove(c.group); for (const v of c.variants) { v.body.dispose(); v.glow?.dispose(); } }
      this.cars = CARS.map((d) => {
        const variants = d.kind === 'loco' ? [locoGeo(age)] : d.kind === 'coach' ? [coachGeo(age, 0), coachGeo(age, 6)] : [wagonGeo(age, false), wagonGeo(age, true)];
        const group = new THREE.Group(), body = new THREE.Mesh(variants[0].body, mats.body), glow = new THREE.Mesh(variants[0].glow ?? new THREE.BufferGeometry(), mats.glow);
        body.castShadow = true;
        if (d.flip) { body.rotation.y = Math.PI; glow.rotation.y = Math.PI; }
        group.add(body, glow);
        this.train.add(group);
        return { group, meshes: [body, glow], variants, shown: 0 };
      });
    }
    if (!l) return;
    // hauteur des rails : le relief adouci (la voie ne suit pas chaque bosse), jamais sous le sol
    const n = Math.max(2, Math.ceil(l.len / STEP) + 1), raw = new Float32Array(n), P: [number, number, number][] = [];
    for (let i = 0; i < n; i++) { const p = rail.at(i * STEP); P.push(p); raw[i] = w.hAt(p[0], p[1]); }
    this.ys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - 5); j <= Math.min(n - 1, i + 5); j++) { s += raw[j]; c++; }
      this.ys[i] = Math.max(s / c, raw[i]) + 0.04;
    }
    const m = new Mesher(), ys = this.ys, nx = (h: number) => [Math.cos(h), -Math.sin(h)];
    const sleeper = age >= 4 ? 0xb8b4ac : 0x6e5a4a, gravel = 0xa39a8e, steel = 0x8a8e96, shine = 0xc8ccd2;
    for (let i = 0; i < n - 1; i++) {
      const [x0, z0, h0] = P[i], [x1, z1, h1] = P[i + 1], [ax, az] = nx(h0), [bx, bz] = nx(h1), y0 = ys[i], y1 = ys[i + 1];
      // point à `o` du milieu de la voie (vers la droite du sens de marche), `dy` au-dessus des rails, à l'échantillon i ou i + 1
      const A = (o: number, dy: number) => [x0 + ax * o, y0 + dy, z0 + az * o], B = (o: number, dy: number) => [x1 + bx * o, y1 + dy, z1 + bz * o];
      // ballast : dessus et talus jusque sous le sol (faces tournées vers le dehors)
      const g = hash2(i, 0, 93) > 0.5 ? gravel : dark(gravel, 0.94);
      m.quad(A(-0.2, -0.02), B(-0.2, -0.02), B(0.2, -0.02), A(0.2, -0.02), g);
      m.quad(A(-0.2, -0.02), A(-0.32, -0.16), B(-0.32, -0.16), B(-0.2, -0.02), dark(g, 0.86));
      m.quad(A(0.2, -0.02), B(0.2, -0.02), B(0.32, -0.16), A(0.32, -0.16), dark(g, 0.86));
      // rails : deux barres d'acier, dessus brillant
      for (const sd of [-0.075, 0.075]) {
        m.quad(A(sd - 0.01, 0.022), B(sd - 0.01, 0.022), B(sd + 0.01, 0.022), A(sd + 0.01, 0.022), shine);
        m.quad(A(sd + 0.01, -0.005), A(sd + 0.01, 0.022), B(sd + 0.01, 0.022), B(sd + 0.01, -0.005), steel);
        m.quad(A(sd - 0.01, -0.005), B(sd - 0.01, -0.005), B(sd - 0.01, 0.022), A(sd - 0.01, 0.022), steel);
      }
      // traverses, et un platelage là où la voie croise une route
      const cell = Math.floor(z0) * N + Math.floor(x0);
      if (i % 2 === 0) m.block(x0, y0 - 0.02, z0, h0, 0.3, 0.025, 0.05, sleeper);
      if (w.road[cell] && i % 2 === 0) m.block(x0, y0 - 0.015, z0, h0, 0.42, 0.035, 0.3, 0x8a7a6a);
    }
    // butoir et quai de chargement au pied de la grotte : planches, caisses, tas de minerai, wagonnet
    const [ex, ez, eh] = P[n - 1], ey = ys[n - 1];
    m.block(ex + Math.sin(eh) * 0.05, ey - 0.02, ez + Math.cos(eh) * 0.05, eh, 0.24, 0.12, 0.05, 0x3c3c40);
    m.block(ex + Math.sin(eh) * 0.02, ey + 0.08, ez + Math.cos(eh) * 0.02, eh, 0.3, 0.06, 0.03, 0xd8553c);
    for (const sd of [-0.08, 0.08]) m.block(ex + Math.sin(eh) * 0.02 + Math.cos(eh) * sd, ey + 0.1, ez + Math.cos(eh) * 0.02 - Math.sin(eh) * sd, eh, 0.06, 0.03, 0.035, 0xf2f2f2);
    const side = this.quaySide(P, n);
    for (let s = Math.max(0, l.len - TRAIN_LEN); s < l.len; s += 0.3) {
      const i = Math.min(n - 1, Math.round(s / STEP)), [qx, qz, qh] = P[i], [ux, uz] = nx(qh);
      m.block(qx + ux * side * 0.36, ys[i] - 0.06, qz + uz * side * 0.36, qh, 0.26, 0.1, 0.29, dark(0xa07a56, 0.9 + hash2(i, 5, 93) * 0.2));
    }
    {
      const i = Math.max(0, n - 1 - Math.round(0.5 / STEP)), [qx, qz, qh] = P[i], [ux, uz] = nx(qh), y = ys[i] + 0.04;
      m.block(qx + ux * side * 0.4, y, qz + uz * side * 0.4, qh + 0.3, 0.1, 0.08, 0.1, 0xa07a56);
      m.block(qx + ux * side * 0.4, y + 0.08, qz + uz * side * 0.4, qh + 0.9, 0.07, 0.06, 0.07, 0x8a6a46);
      const j = Math.max(0, n - 1 - Math.round(1.4 / STEP)), [rx, rz, rh] = P[j], [vx, vz] = nx(rh);
      m.block(rx + vx * side * 0.4, ys[j] + 0.04, rz + vz * side * 0.4, rh, 0.16, 0.06, 0.2, 0x4a4a50);
      m.block(rx + vx * side * 0.4, ys[j] + 0.1, rz + vz * side * 0.4, rh + 0.4, 0.12, 0.05, 0.14, 0x6a6660);
    }
    this.track = new THREE.Mesh(m.geometry(), mats.body);
    this.track.receiveShadow = true;
    this.group.add(this.track);
  }

  /** Côté du quai à l'avant-poste : celui où le sol est libre */
  private quaySide(P: [number, number, number][], n: number) {
    const w = this.world, [x, z, h] = P[Math.max(0, n - 1 - Math.round(1 / STEP))];
    for (const sd of [1, -1]) {
      const cx = Math.floor(x + Math.cos(h) * sd * 0.45), cz = Math.floor(z - Math.sin(h) * sd * 0.45);
      if (w.inCells(cx, cz) && !w.occ[cz * N + cx] && !w.decor[cz * N + cx]) return sd;
    }
    return 1;
  }

  /** Chaque voiture posée sur ses deux essieux, penchée dans les pentes ; fumée de la locomotive de tête */
  private place(dt: number) {
    const r = this.rail, moving = r.phase === 'down' || r.phase === 'up';
    // la relève attend sur le quai : on ne la voit assise qu'une fois le train parti
    const riders = r.phase === 'down' ? r.riders.length : r.phase === 'station' ? 0 : r.up.length;
    const loaded = r.cargo.ore + r.cargo.stone > 0;
    CARS.forEach((d, i) => {
      const car = this.cars[i];
      if (!car) return;
      const s = r.pos + d.at, f = r.at(s + d.half), b = r.at(s - d.half), yf = this.yAt(s + d.half), yb = this.yAt(s - d.half);
      car.group.position.set((f[0] + b[0]) / 2, (yf + yb) / 2, (f[1] + b[1]) / 2);
      car.group.rotation.set(0, 0, 0);
      car.group.rotateY(Math.atan2(f[0] - b[0], f[1] - b[1]));
      car.group.rotateX(-Math.atan2(yf - yb, d.half * 2));
      const want = d.kind === 'coach' ? +(riders > 0) : d.kind === 'wagon' ? +loaded : 0;
      if (want !== car.shown && car.variants[want]) {
        car.shown = want;
        car.meshes[0].geometry = car.variants[want].body;
        car.meshes[1].geometry = car.variants[want].glow ?? new THREE.BufferGeometry();
      }
    });
    // à vapeur : la locomotive de tête fume, beaucoup au démarrage, un filet à quai
    if (this.age >= 4) return;
    this.puffT -= dt * (moving ? 2 + r.speed * 3 : 0.6);
    if (this.puffT > 0) return;
    this.puffT = 1;
    const lead = this.cars[r.phase === 'up' || r.phase === 'station' ? 0 : 4];
    if (!lead) return;
    this.v.set(0, 0.32, lead === this.cars[0] ? -0.15 : 0.15);
    lead.group.localToWorld(this.v);
    this.puffs.spawn(this.v.x, this.v.y, this.v.z, (Math.random() - 0.5) * 0.06, 0.45 + Math.random() * 0.15, (Math.random() - 0.5) * 0.06, 0.045, 1.4 + Math.random() * 0.6, SMOKE, 0, { grow: 2.2, drag: 0.5, wind: 0.15, alpha: 0.45 });
  }
}
