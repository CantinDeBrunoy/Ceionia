import * as THREE from 'three';
import { World, SNOW_LINE } from '../world/world';
import { Building, sizeOf } from '../build/catalog';
import { Parts } from './parts';
import { mats } from './materials';
import { Puffs } from './particles';
import { hash2 } from '../core/rng';
import { HUMAN_K } from './assets';
import { ALPINE_LIFT } from './models';
import type { BuildingView } from './buildings';

const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const JACKETS = [0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860, 0xb45ad8, 0xff8a3c];
/** à l'âge industriel : pulls de laine et culottes de drap */
const WOOLS = [0xb8322c, 0x2c3e6a, 0x3f6a4a, 0x8a5a3e];
const SKIN = 0xe8b894;
/** vitesse des sièges du télésiège (cases par seconde) et écart entre deux sièges */
const CHAIR_V = 0.4, CHAIR_GAP = 0.75;

/** Boîte tendue entre deux points (câbles, cordes) */
function bar(p: Parts, a: THREE.Vector3, b: THREE.Vector3, w: number, color: number) {
  const d = b.clone().sub(a), len = d.length();
  if (len < 1e-4) return;
  const g = new THREE.BoxGeometry(w, w, len).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  p.add(g, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, color);
}

/** Montagnard debout, tourné vers +z, dessiné pour des habitants de 0,3 : bottes, pantalon, veste, bras, tête, bonnet ou casque, lunettes, sac */
function personGeo(jacket: number, pants: number, hat: number, bag: boolean) {
  const p = new Parts();
  for (const s of [-1, 1]) {
    p.box(0.034, 0.035, 0.05, s * 0.02, 0, 0.006, 0x2a2a2e);
    p.box(0.03, 0.1, 0.034, s * 0.02, 0.03, 0, pants);
    p.add(new THREE.BoxGeometry(0.028, 0.1, 0.03), s * 0.058, 0.17, 0.012, jacket, 0, false, s * 0.12, -0.3);
    p.box(0.026, 0.026, 0.026, s * 0.064, 0.105, 0.035, 0x2a2a2e);
  }
  p.box(0.09, 0.11, 0.06, 0, 0.125, 0, jacket);
  p.box(0.092, 0.014, 0.062, 0, 0.14, 0, 0xf4f2ee);
  p.box(0.05, 0.05, 0.05, 0, 0.235, 0, SKIN);
  p.sphere(0.031, 0, 0.27, -0.002, hat, 1, 0.75);
  p.box(0.054, 0.014, 0.012, 0, 0.247, 0.026, 0x2a2a2e);
  p.box(0.046, 0.009, 0.006, 0, 0.249, 0.031, 0xf2a03a);
  if (bag) { p.box(0.07, 0.085, 0.034, 0, 0.12, -0.046, 0x5d6878); p.box(0.05, 0.02, 0.03, 0, 0.205, -0.05, 0xd84a3e); }
  return p.build(false).body;
}

/** Paire de skis (spatules relevées) et bâtons, sous les pieds du skieur */
function skisGeo(color: number) {
  const p = new Parts();
  for (const s of [-1, 1]) {
    p.box(0.016, 0.006, 0.24, s * 0.02, 0, 0.02, color);
    p.add(new THREE.BoxGeometry(0.016, 0.006, 0.04), s * 0.02, 0.012, 0.15, color, 0, false, 0, -0.6);
    p.add(new THREE.BoxGeometry(0.006, 0.17, 0.006), s * 0.07, 0.06, -0.01, 0x3c3c40, 0, false, s * 0.15, 0.45);
  }
  return p.build(false).body;
}

/** Homme-oiseau en wingsuit, à plat ventre, tête vers +z : ailes entre bras et corps, et entre les jambes */
function wingsuitGeo(main: number, trim: number) {
  const p = new Parts();
  p.box(0.08, 0.035, 0.13, 0, 0, 0, main);
  p.box(0.07, 0.03, 0.13, 0, 0.002, -0.12, trim);
  p.sphere(0.028, 0, 0.018, 0.09, main, 1, 0.9);
  p.box(0.05, 0.012, 0.012, 0, 0.022, 0.112, 0x2a2a2e);
  for (const s of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.12, 0.008, 0.11), s * 0.095, 0.012, -0.005, main, 0, false, s * -0.08);
    p.box(0.02, 0.012, 0.11, s * 0.15, 0.006, -0.005, trim);
  }
  p.box(0.07, 0.006, 0.1, 0, 0.01, -0.2, main);
  return p.build(false).body;
}

/** Voile (parachute, parapente) : caissons en arc aux couleurs alternées, suspentes vers le pilote sous elle (à y = 0) */
function canopyGeo(span: number, lift: number, cols: number[]) {
  const p = new Parts(), n = 7;
  for (let i = 0; i < n; i++) {
    const a = ((i - (n - 1) / 2) / n) * 1.9, x = Math.sin(a) * span * 0.5, y = lift + Math.cos(a) * span * 0.22;
    p.add(new THREE.BoxGeometry((span / n) * 1.12, 0.014, span * 0.32), x, y, 0, cols[i % cols.length], 0, false, -a);
  }
  for (const s of [-1, 1]) for (const z of [-0.04, 0.04]) bar(p, new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(s * span * 0.46, lift + span * 0.08, z), 0.003, 0xe8e4dc);
  return p.build(false).body;
}

/** Siège du télésiège pendu à sa pince (à y = 0 sous le câble) : suspente, assise, dossier, garde-corps */
function chairGeo() {
  const p = new Parts();
  p.box(0.008, 0.14, 0.008, 0, -0.14, -0.02, 0x8a8f96);
  p.box(0.02, 0.012, 0.03, 0, -0.008, -0.02, 0x5d6878);
  p.box(0.12, 0.014, 0.06, 0, -0.15, 0, 0x3c6ab8);
  p.box(0.12, 0.06, 0.01, 0, -0.15, -0.03, 0x3c6ab8);
  p.box(0.13, 0.008, 0.008, 0, -0.09, 0.03, 0x8a8f96);
  for (const s of [-1, 1]) p.box(0.008, 0.06, 0.008, s * 0.062, -0.15, 0.03, 0x8a8f96);
  return p.build(false).body;
}

interface Path { pts: THREE.Vector3[]; cum: number[]; len: number }

function makePath(pts: THREE.Vector3[]): Path {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, cum, len: cum[cum.length - 1] };
}

/** Point et cap d'un chemin à la distance s */
function along(p: Path, s: number, out: THREE.Vector3): number {
  const t = Math.max(0, Math.min(p.len, s));
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i] < t) i++;
  const a = p.pts[i - 1], b = p.pts[i], f = (t - p.cum[i - 1]) / Math.max(1e-6, p.cum[i] - p.cum[i - 1]);
  out.lerpVectors(a, b, f);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

interface Skier { root: THREE.Group; body: THREE.Mesh; skis: THREE.Mesh; state: 'ski' | 'wait' | 'ride' | 'walk' | 'down'; s: number; t: number; speed: number; ph: number; chair: number }
interface Flyer { root: THREE.Group; suit: THREE.Mesh; pilot: THREE.Mesh; canopy: THREE.Mesh; state: 'wait' | 'fly' | 'chute' | 'landed'; t: number; vel: THREE.Vector3; smoke: THREE.Color }
interface Climber { root: THREE.Group }

interface Site {
  key: string;
  group: THREE.Group;
  base: THREE.Vector3;
  top: THREE.Vector3 | null;
  ski: Path | null;
  /** télésiège : du moyeu de la gare du bas au moyeu de la gare du haut, hauteur du câble, sièges */
  lift: { a: THREE.Vector3; b: THREE.Vector3; ys: Float32Array; len: number; chairs: THREE.Mesh[]; side: THREE.Vector3 } | null;
  wall: { lo: THREE.Vector3; hi: THREE.Vector3 } | null;
  skiers: Skier[];
  flyers: Flyer[];
  glider: THREE.Group | null;
  climbers: Climber[];
  rope: THREE.Mesh | null;
  climbT: number;
  age: number;
}

/**
 * La vie autour des clubs alpins : quand la neige tient (l'hiver, ou au sommet dans les neiges éternelles), des skieurs
 * dévalent en godillant du sommet voisin jusqu'au chalet, puis remontent à pied (âge industriel) ou par le télésiège
 * (époque moderne : pylônes, câble, sièges qui défilent, gare du haut) ; sans neige, ce sont des randonneurs. Une cordée
 * grimpe la paroi la plus raide des environs, puis redescend en rappel. À l'époque moderne, des wingsuits s'élancent du
 * sommet en traînant leur fumée, ouvrent leur parachute au-dessus du chalet et s'y posent ; un parapente tourne au-dessus
 * des pentes
 */
export class AlpineView {
  group = new THREE.Group();
  private sites = new Map<number, Site>();
  private puffs = new Puffs(400, 0);
  private chairG = chairGeo();
  private v = new THREE.Vector3();
  private time = 0;

  constructor(private world: World, private buildings: BuildingView) {
    this.group.add(this.puffs.mesh);
  }

  update(dt: number, age: number, snow: number) {
    const w = this.world, live = new Set<number>();
    this.time += dt;
    for (const b of w.buildings.values()) {
      if (b.kind !== 'alpine' || age < 3) continue;
      const g = this.buildings.entries.get(b.id)?.group;
      if (!g) continue;
      live.add(b.id);
      const key = `${b.x}|${b.z}|${b.rot}|${w.visVersion}|${Math.min(age, 4)}`;
      let site = this.sites.get(b.id);
      if (site && site.key !== key) { this.drop(site); site = undefined; }
      if (!site) { site = this.build(b, g, key, Math.min(age, 4)); this.sites.set(b.id, site); }
      this.step(site, dt, snow);
    }
    for (const [id, s] of this.sites) if (!live.has(id)) { this.drop(s); this.sites.delete(id); }
    this.puffs.update(dt);
  }

  private drop(s: Site) {
    this.group.remove(s.group);
    s.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && m.geometry !== this.chairG) m.geometry.dispose(); });
  }

  /** Repère le sommet, trace la piste, monte le télésiège, cherche la paroi ; crée skieurs, hommes-oiseaux, parapente, cordée */
  private build(b: Building, g: THREE.Group, key: string, age: number): Site {
    const w = this.world, s = sizeOf(b), f = FRONT[b.rot], group = new THREE.Group();
    this.group.add(group);
    const bx = b.x + s / 2 + f[0] * (s / 2 + 0.35), bz = b.z + s / 2 + f[1] * (s / 2 + 0.35);
    const base = new THREE.Vector3(bx, w.hAt(bx, bz), bz);
    // le sommet : le point le plus haut à dix cases au plus, nettement au-dessus du chalet
    let top: THREE.Vector3 | null = null, best = base.y + 1.4;
    for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) {
      const cx = b.x + dx, cz = b.z + dz;
      if (!w.inCells(cx, cz) || w.isWet(cx, cz) || dx * dx + dz * dz > 100 || dx * dx + dz * dz < 9) continue;
      const h = w.cellAvg(cx, cz);
      if (h > best) { best = h; top = new THREE.Vector3(cx + 0.5, h, cz + 0.5); }
    }
    const site: Site = { key, group, base, top, ski: null, lift: null, wall: null, skiers: [], flyers: [], glider: null, climbers: [], rope: null, climbT: hash2(b.x, b.z, 5) * 10, age };
    if (top) {
      top.y = w.hAt(top.x, top.z);
      const dir = new THREE.Vector3(base.x - top.x, 0, base.z - top.z), L = dir.length();
      dir.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x), bend = hash2(b.x, b.z, 3) < 0.5 ? 1 : -1;
      // piste : du sommet (à côté de la gare du haut) au chalet, en courbe douce
      const p0 = top.clone().addScaledVector(side, 0.6 * bend), p2 = base.clone(), p1 = p0.clone().lerp(p2, 0.5).addScaledVector(side, L * 0.22 * bend), pts: THREE.Vector3[] = [];
      const n = Math.max(4, Math.ceil(L / 0.2));
      for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t, x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, z = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
        pts.push(new THREE.Vector3(x, w.hAt(x, z) + 0.01, z));
      }
      site.ski = makePath(pts);
      if (age >= 4) site.lift = this.buildLift(group, g, top, side);
    }
    // paroi d'escalade : la case la plus raide des environs
    let steep = 0.9;
    for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) {
      const cx = b.x + dx, cz = b.z + dz;
      if (!w.inCells(cx, cz) || w.isWet(cx, cz) || w.occ[w.ci(cx, cz)] || Math.abs(dx) + Math.abs(dz) < 3) continue;
      const sl = w.cellSlope(cx, cz);
      if (sl <= steep) continue;
      const h00 = w.h(cx, cz), h10 = w.h(cx + 1, cz), h01 = w.h(cx, cz + 1), h11 = w.h(cx + 1, cz + 1);
      const gx = (h10 + h11 - h00 - h01) / 2, gz = (h01 + h11 - h00 - h10) / 2, gl = Math.hypot(gx, gz) || 1;
      const lo = new THREE.Vector3(cx + 0.5 - (gx / gl) * 0.42, 0, cz + 0.5 - (gz / gl) * 0.42), hi = new THREE.Vector3(cx + 0.5 + (gx / gl) * 0.42, 0, cz + 0.5 + (gz / gl) * 0.42);
      lo.y = w.hAt(lo.x, lo.z); hi.y = w.hAt(hi.x, hi.z);
      steep = sl;
      site.wall = { lo, hi };
    }
    const k = HUMAN_K;
    const cols = age >= 4 ? JACKETS : WOOLS;
    for (let i = 0; i < (age >= 4 ? 5 : 3); i++) {
      const root = new THREE.Group(), body = new THREE.Mesh(personGeo(cols[(i + b.id) % cols.length], age >= 4 ? 0x2a3448 : 0x6a5040, age >= 4 ? cols[(i + 2) % cols.length] : 0xe8e4dc, false), mats.body);
      const skis = new THREE.Mesh(skisGeo(age >= 4 ? cols[(i + 3) % cols.length] : 0x9a7452), mats.body);
      body.castShadow = skis.castShadow = true;
      root.add(body, skis);
      root.scale.setScalar(k);
      group.add(root);
      site.skiers.push({ root, body, skis, state: 'ski', s: site.ski ? (site.ski.len * i) / 5 : 0, t: 0, speed: 0.9 + hash2(i, b.id, 7) * 0.5, ph: i * 1.7, chair: -1 });
    }
    if (age >= 4 && top && top.y - base.y > 1.8) {
      for (let i = 0; i < 2; i++) {
        const root = new THREE.Group(), main = i ? 0xf2c23a : 0xf2783a;
        const suit = new THREE.Mesh(wingsuitGeo(main, 0x2a2a2e), mats.body);
        const pilot = new THREE.Mesh(personGeo(main, 0x2a2a2e, 0x2a2a2e, true), mats.body);
        const canopy = new THREE.Mesh(canopyGeo(0.5, 0.42, i ? [0xd84a3e, 0xf4f2ee] : [0x3c7fd8, 0xf2c23a]), mats.body);
        suit.castShadow = pilot.castShadow = canopy.castShadow = true;
        root.add(suit, pilot, canopy);
        root.scale.setScalar(k);
        root.visible = false;
        group.add(root);
        site.flyers.push({ root, suit, pilot, canopy, state: 'wait', t: 4 + i * 9 + hash2(b.x, i, 9) * 6, vel: new THREE.Vector3(), smoke: new THREE.Color(i ? 0xff7a5a : 0xffb84a) });
      }
      const gl = new THREE.Group(), pilot = new THREE.Mesh(personGeo(0x3c7fd8, 0x2a2a2e, 0xf4f2ee, true), mats.body);
      pilot.rotation.x = -0.9;
      pilot.position.y = 0.05;
      gl.add(pilot, new THREE.Mesh(canopyGeo(0.9, 0.62, [0xd84a3e, 0xf2c23a, 0x4fa860, 0x3c7fd8, 0xb45ad8]), mats.body));
      gl.scale.setScalar(k);
      group.add(gl);
      site.glider = gl;
    }
    if (site.wall) {
      for (let i = 0; i < 2; i++) {
        const root = new THREE.Group(), body = new THREE.Mesh(personGeo(i ? 0xf2c23a : 0xd84a3e, 0x5d6878, i ? 0xd84a3e : 0xf4f2ee, true), mats.body);
        body.castShadow = true;
        root.add(body);
        root.rotation.order = 'YXZ';
        root.scale.setScalar(k);
        group.add(root);
        site.climbers.push({ root });
      }
    }
    return site;
  }

  /** Télésiège : de la grande roue de la gare du bas au sommet ; pylônes, câble aller et retour, gare du haut, sièges */
  private buildLift(group: THREE.Group, g: THREE.Group, top: THREE.Vector3, side: THREE.Vector3) {
    const w = this.world;
    g.updateMatrixWorld();
    const a = new THREE.Vector3(...ALPINE_LIFT).applyMatrix4(g.matrixWorld), b = top.clone().addScaledVector(side, -0.4);
    b.y = w.hAt(b.x, b.z) + 0.36;
    const len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.ceil(len / 0.25)), ys = new Float32Array(n + 1);
    const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(), lat = new THREE.Vector3(-dir.z, 0, dir.x);
    const at = (t: number) => new THREE.Vector3(a.x + dir.x * t, 0, a.z + dir.z * t);
    // pylônes réguliers ; leur tête tient le câble au-dessus du relief, il pend un peu entre deux
    const knots: [number, number][] = [[0, a.y]], np = Math.max(1, Math.round(len / 1.6));
    for (let i = 1; i < np; i++) {
      const t = (len * i) / np, lin = a.y + ((b.y - a.y) * t) / len;
      let ground = -Infinity;
      for (let d = -0.8; d <= 0.8; d += 0.2) { const q = at(Math.max(0, Math.min(len, t + d))); ground = Math.max(ground, w.hAt(q.x, q.z)); }
      knots.push([t, Math.max(lin, ground + 0.62)]);
    }
    knots.push([len, b.y]);
    for (let i = 0; i <= n; i++) {
      const t = (len * i) / n;
      let j = 1;
      while (j < knots.length - 1 && knots[j][0] < t) j++;
      const [t0, y0] = knots[j - 1], [t1, y1] = knots[j], f = (t - t0) / Math.max(1e-6, t1 - t0), q = at(t);
      ys[i] = Math.max(y0 + (y1 - y0) * f - 0.05 * 4 * f * (1 - f), w.hAt(q.x, q.z) + 0.3);
    }
    const p = new Parts();
    for (const [t, ky] of knots.slice(1, -1)) {
      const q = at(t), gy = w.hAt(q.x, q.z);
      p.add(new THREE.BoxGeometry(0.035, ky + 0.06 - gy, 0.035).translate(0, (ky + 0.06 - gy) / 2, 0), q.x, gy, q.z, 0x8a8f96);
      p.add(new THREE.BoxGeometry(0.34, 0.022, 0.022), q.x, ky + 0.06, q.z, 0x8a8f96, Math.atan2(lat.x, lat.z) - Math.PI / 2);
      for (const sd of [-1, 1]) p.add(new THREE.BoxGeometry(0.03, 0.02, 0.06), q.x + lat.x * sd * 0.13, ky + 0.03, q.z + lat.z * sd * 0.13, 0x5d6878, Math.atan2(dir.x, dir.z));
    }
    // câble aller et retour, de part et d'autre des pylônes
    for (const sd of [-1, 1]) for (let i = 0; i < n; i++) {
      const t0 = (len * i) / n, t1 = (len * (i + 1)) / n, q0 = at(t0), q1 = at(t1);
      bar(p, new THREE.Vector3(q0.x + lat.x * sd * 0.13, ys[i], q0.z + lat.z * sd * 0.13), new THREE.Vector3(q1.x + lat.x * sd * 0.13, ys[i + 1], q1.z + lat.z * sd * 0.13), 0.006, 0x2a2a2e);
    }
    // gare du haut : dalle, piliers, roue, toit
    const gy = w.hAt(b.x, b.z);
    p.add(new THREE.BoxGeometry(0.5, 0.03, 0.5).translate(0, 0.015, 0), b.x, gy, b.z, 0xb8b4ac, Math.atan2(dir.x, dir.z));
    for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) p.add(new THREE.BoxGeometry(0.03, b.y + 0.1 - gy, 0.03).translate(0, (b.y + 0.1 - gy) / 2, 0), b.x + dx, gy, b.z + dz, 0xd04a3e);
    p.add(new THREE.BoxGeometry(0.48, 0.03, 0.48), b.x, b.y + 0.11, b.z, 0xd04a3e);
    p.add(new THREE.TorusGeometry(0.13, 0.012, 4, 20).rotateX(Math.PI / 2), b.x, b.y, b.z, 0x3c3c40);
    const mesh = new THREE.Mesh(p.build(false).body, mats.body);
    mesh.castShadow = true;
    group.add(mesh);
    const chairs: THREE.Mesh[] = [];
    for (let u = 0; u < len * 2; u += CHAIR_GAP) {
      const c = new THREE.Mesh(this.chairG, mats.body);
      c.castShadow = true;
      group.add(c);
      chairs.push(c);
    }
    return { a, b, ys, len, chairs, side: lat };
  }

  /** Place d'un siège (u le long de la boucle : montée puis descente) ; renvoie le cap du siège */
  private chairAt(L: NonNullable<Site['lift']>, u: number, out: THREE.Vector3) {
    const loop = L.len * 2, q = ((u % loop) + loop) % loop, up = q < L.len, t = up ? q : loop - q, n = L.ys.length - 1;
    const f = (t / L.len) * n, i = Math.min(n - 1, Math.floor(f)), y = L.ys[i] + (L.ys[i + 1] - L.ys[i]) * (f - i);
    const dx = (L.b.x - L.a.x) / L.len, dz = (L.b.z - L.a.z) / L.len, sd = up ? 1 : -1;
    out.set(L.a.x + dx * t + L.side.x * sd * 0.13, y, L.a.z + dz * t + L.side.z * sd * 0.13);
    return Math.atan2(dx, dz) + (up ? 0 : Math.PI);
  }

  private step(site: Site, dt: number, snow: number) {
    const w = this.world, v = this.v, T = this.time;
    const snowy = snow > 0.35 || (!!site.top && site.top.y >= SNOW_LINE[0]);
    // sièges du télésiège
    const L = site.lift, u0 = T * CHAIR_V;
    if (L) L.chairs.forEach((c, i) => { const h = this.chairAt(L, u0 + i * CHAIR_GAP, c.position); c.rotation.y = h; });
    // skieurs (ou randonneurs sans neige)
    for (const sk of site.skiers) {
      const P = site.ski;
      if (!P) { sk.root.visible = false; continue; }
      sk.root.visible = true;
      sk.skis.visible = snowy;
      sk.body.position.y = 0;
      sk.body.rotation.set(0, 0, 0);
      sk.skis.rotation.set(0, 0, 0);
      sk.skis.position.set(0, 0, 0);
      sk.root.rotation.z = 0;
      if (!snowy && (sk.state === 'ski' || sk.state === 'ride' || sk.state === 'wait')) sk.state = 'down';
      if (snowy && sk.state === 'down') sk.state = 'ski';
      if (sk.state === 'ski') {
        sk.s += sk.speed * dt;
        const h = along(P, sk.s, v), fade = Math.min(1, sk.s * 0.8, (P.len - sk.s) * 0.8), wv = sk.s * 2.6 + sk.ph;
        const lat = Math.sin(wv) * 0.32 * fade, dl = Math.cos(wv) * 2.6 * 0.32 * fade;
        v.x += Math.cos(h) * lat; v.z -= Math.sin(h) * lat;
        sk.root.position.set(v.x, w.hAt(v.x, v.z) + 0.005, v.z);
        sk.root.rotation.y = h + Math.atan(dl) * 0.8;
        // il se penche dans ses virages, fléchi sur ses skis
        sk.root.rotation.z = Math.sin(wv + Math.PI / 2) * 0.35 * fade;
        sk.body.rotation.x = 0.25;
        if (sk.s >= P.len) { sk.state = 'wait'; sk.t = 1 + Math.random() * 2; sk.chair = -1; }
      } else if (sk.state === 'wait') {
        sk.t -= dt;
        along(P, P.len, v);
        sk.root.position.set(v.x, w.hAt(v.x, v.z), v.z);
        if (sk.t > 0) continue;
        if (!L) { sk.state = 'walk'; continue; }
        // monte dans le premier siège libre qui passe en bas
        let pick = -1;
        L.chairs.forEach((_, i) => {
          const q = (((u0 + i * CHAIR_GAP) % (L.len * 2)) + L.len * 2) % (L.len * 2);
          if (q < 0.25 && !site.skiers.some((o) => o.state === 'ride' && o.chair === i)) pick = i;
        });
        if (pick >= 0) { sk.state = 'ride'; sk.chair = pick; }
      } else if (sk.state === 'ride' && L) {
        const c = L.chairs[sk.chair], q = (((u0 + sk.chair * CHAIR_GAP) % (L.len * 2)) + L.len * 2) % (L.len * 2);
        sk.root.position.set(c.position.x, c.position.y - 0.15 - 0.07 * HUMAN_K, c.position.z);
        sk.root.rotation.y = c.rotation.y;
        // assis, les skis qui pendent
        sk.body.rotation.x = -0.35;
        sk.skis.rotation.x = 0.5;
        sk.skis.position.set(0, -0.02, 0.06);
        if (q >= L.len - 0.15) { sk.state = 'ski'; sk.s = 0; }
      } else if (sk.state === 'walk' || sk.state === 'down') {
        // à pied : remonte vers le sommet, skis à l'épaule ; sans neige, des randonneurs montent et descendent la piste
        const dirS = sk.state === 'walk' ? -1 : sk.t >= 0 ? 1 : -1;
        sk.s = Math.max(0, Math.min(P.len, sk.s + dirS * 0.32 * dt));
        if (sk.state === 'down') { if (sk.s >= P.len) sk.t = -1; else if (sk.s <= 0) sk.t = 1; }
        const h = along(P, sk.s, v);
        sk.root.position.set(v.x, w.hAt(v.x, v.z), v.z);
        sk.root.rotation.y = h + (dirS < 0 ? Math.PI : 0);
        sk.body.position.y = Math.abs(Math.sin(T * 7 + sk.ph)) * 0.01;
        sk.skis.rotation.set(-1.45, 0, 0.3);
        sk.skis.position.set(0.05, 0.2, -0.04);
        if (sk.state === 'walk' && sk.s <= 0) { sk.state = 'ski'; sk.s = 0; }
      }
    }
    // hommes-oiseaux
    for (const fl of site.flyers) {
      const top = site.top!;
      fl.t -= dt;
      if (fl.state === 'wait') {
        fl.root.visible = false;
        if (fl.t <= 0) {
          // il s'élance du sommet vers le chalet, un peu de biais, et plane assez bas pour arriver au-dessus du chalet
          fl.state = 'fly'; fl.t = 8;
          fl.root.position.set(top.x, top.y + 0.5, top.z);
          const a = Math.atan2(site.base.x - top.x, site.base.z - top.z) + (Math.random() - 0.5) * 0.7, d = Math.hypot(site.base.x - top.x, site.base.z - top.z);
          fl.vel.set(Math.sin(a) * 2.4, -Math.max(0.5, (top.y + 0.5 - site.base.y - 2) / (d / 2.4)), Math.cos(a) * 2.4);
        }
        continue;
      }
      fl.root.visible = true;
      const p = fl.root.position, ground = w.surfaceAt(p.x, p.z);
      if (fl.state === 'fly') {
        p.addScaledVector(fl.vel, dt);
        if (p.y < ground + 0.9) p.y = ground + 0.9;
        fl.root.rotation.set(0, Math.atan2(fl.vel.x, fl.vel.z), 0);
        fl.suit.rotation.x = 0.12;
        fl.suit.visible = true; fl.pilot.visible = false; fl.canopy.visible = false;
        if (Math.random() < dt * 30) this.puffs.spawn(p.x - fl.vel.x * 0.04, p.y, p.z - fl.vel.z * 0.04, 0, 0.02, 0, 0.035, 1.6, fl.smoke, 0, { grow: 3, drag: 0.5, wind: 0.15, alpha: 0.55 });
        // voile ouverte au-dessus du chalet : il s'y pose, en dérivant vers lui
        if (fl.t <= 0 || Math.hypot(p.x - site.base.x, p.z - site.base.z) < 2.2) {
          fl.state = 'chute';
          const dx = site.base.x - p.x, dz = site.base.z - p.z, l = Math.hypot(dx, dz) || 1, sp = Math.min(0.55, l / Math.max(1, (p.y - site.base.y) / 0.42));
          fl.vel.set((dx / l) * sp, -0.42, (dz / l) * sp);
        }
      } else if (fl.state === 'chute') {
        p.addScaledVector(fl.vel, dt);
        fl.suit.visible = false; fl.pilot.visible = true; fl.canopy.visible = true;
        fl.root.rotation.set(0, Math.atan2(fl.vel.x, fl.vel.z), Math.sin(T * 1.3) * 0.06);
        fl.canopy.scale.setScalar(Math.min(1, fl.canopy.scale.x + dt * 2.5));
        if (p.y <= ground + 0.01) { p.y = ground; fl.state = 'landed'; fl.t = 2.5; }
      } else if (fl.state === 'landed') {
        fl.canopy.visible = false;
        fl.root.rotation.set(0, fl.root.rotation.y, 0);
        if (fl.t <= 0) { fl.state = 'wait'; fl.t = 12 + Math.random() * 18; fl.canopy.scale.setScalar(0.2); }
      }
    }
    // parapente : de grands cercles au-dessus des pentes, qui montent et descendent avec les ascendances
    if (site.glider && site.top) {
      const c = site.top.clone().lerp(site.base, 0.45), a = T * 0.3, r = 1.7;
      const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
      site.glider.position.set(x, Math.max(w.surfaceAt(x, z) + 1.3, c.y + (site.top.y - site.base.y) * 0.55 + Math.sin(T * 0.13) * 0.5), z);
      site.glider.rotation.set(0, a + Math.PI / 2, -0.22);
    }
    // cordée : le premier grimpe, le second suit au bout de la corde ; au sommet, rappel jusqu'au pied de la paroi
    if (site.wall && site.climbers.length === 2) {
      const { lo, hi } = site.wall, cyc = 26, t = (T + site.climbT) % cyc;
      const lead = t < 18 ? t / 18 : t < 20 ? 1 : Math.max(0, 1 - (t - 20) / 6), second = Math.max(0, Math.min(1, t < 18 ? (t - 3) / 18 : lead - 0.05));
      const h = Math.atan2(hi.x - lo.x, hi.z - lo.z);
      [lead, second].forEach((fz, i) => {
        const r = site.climbers[i].root;
        v.lerpVectors(lo, hi, fz);
        r.position.set(v.x, w.hAt(v.x, v.z) + 0.01, v.z);
        r.rotation.set(0.35, h, 0);
      });
      const a = site.climbers[0].root.position, b = site.climbers[1].root.position;
      if (!site.rope) { site.rope = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 1), new THREE.MeshStandardMaterial({ color: 0xf2783a, roughness: 0.9 })); site.group.add(site.rope); }
      const ra = a.clone().setY(a.y + 0.1), rb = b.clone().setY(b.y + 0.1), d = ra.distanceTo(rb);
      site.rope.visible = d > 0.02;
      site.rope.position.lerpVectors(ra, rb, 0.5);
      site.rope.scale.set(1, 1, Math.max(0.01, d));
      site.rope.lookAt(rb);
    }
  }
}
