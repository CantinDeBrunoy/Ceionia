import * as THREE from 'three';
import { Parts, type Glow } from '../parts';
import type { People } from '../../world/archipelago';
import { O, Face, bay, frustum, dome, finial, palm, dark } from './oriental';
import { A, hipRoof, lantern, mesh, tri, quad, type V3 } from './asian';

/**
 * Les repères des âges récents dans les villes des peuples de l'archipel (voir `townModels.ts`, `rivalTown.ts` et
 * `docs/iles.md`) : l'usine et la gare (Industriel, puis centrale et gare moderne, puis fabrique propre et maglev), le
 * gratte-ciel (Moderne : tours jumelles reliées par une passerelle chez les Orientaux, tour à étages évasés chez les
 * Asiatiques) et l'arcologie (Futuriste : ziggourat de terrasses sous une coupole de verre, ou trois tours reliées par
 * des anneaux et des jardins suspendus). Chaque peuple garde ses couleurs : sable, faïence turquoise, arcs brisés et
 * coupoles chez les Orientaux ; brique grise, laque rouge, toits courbes chez les Asiatiques.
 * Mêmes conventions que `models.ts` : coordonnées locales au lot, origine au centre, façade vers +z, 1 = une case
 */

/** Palette d'un peuple à un âge */
interface Pal {
  /** mur, encadrements, brique, toit, accents, vitrage (allumé la nuit), néon, métal */
  wall: number; trim: number; brick: number; roof: number; accent: number; accent2: number; glass: number; neon: number; metal: number;
  arch: boolean;
}
function pal(people: People, age: number): Pal {
  const or = people === 'orient';
  if (age <= 3) return or
    ? { wall: O.cream, trim: O.stone, brick: 0xc8946a, roof: 0x8a6a58, accent: O.turq, accent2: O.cobalt, glass: O.win, neon: O.turqL, metal: 0x4a4e54, arch: true }
    : { wall: 0xe6dccb, trim: 0xb8b2a8, brick: 0x8e8278, roof: A.tile, accent: A.red, accent2: A.tileG, glass: A.win, neon: A.amber, metal: 0x3e4248, arch: false };
  if (age === 4) return or
    ? { wall: O.concrete, trim: O.sand, brick: 0xd8cbb0, roof: 0xb8bcc0, accent: O.turq, accent2: O.gold, glass: 0x8fb0c4, neon: O.turqL, metal: 0x9aa3a8, arch: true }
    : { wall: A.concrete, trim: A.concreteD, brick: 0xa8a29a, roof: 0x9aa0a6, accent: A.red, accent2: A.tileG, glass: 0x9ec0b8, neon: A.pink, metal: A.steel, arch: false };
  return or
    ? { wall: O.marble, trim: 0xdfe6e6, brick: 0xeef2f2, roof: 0xd8dee0, accent: O.turqD, accent2: O.gold, glass: O.glass, neon: O.turqL, metal: 0xc9ced0, arch: true }
    : { wall: 0xf2f0ea, trim: 0xd8d8d0, brick: 0xe8e6e0, roof: A.tileB, accent: A.red, accent2: A.tileG, glass: A.glass, neon: A.cyan, metal: 0xc8ccd0, arch: false };
}

// ---------- Outils ----------

/** Une rangée de `n` fenêtres sur une face (arc brisé chez les Orientaux, croisée rectangulaire sinon), allumées la nuit */
function windows(f: Face, len: number, y: number, ww: number, h: number, n: number, c: Pal, glow: Glow = true) {
  for (let i = 0; i < n; i++) {
    const u = -len / 2 + (len / n) * (i + 0.5);
    if (c.arch) bay(f, u, y, ww, h, 'pointed', c.glass, { frame: c.trim, glow, seg: 4 });
    else {
      f.plane(ww + 0.03, h + 0.03, u, y + h / 2, 0.004, c.trim);
      f.plane(ww, h, u, y + h / 2, 0.008, c.glass, glow);
      f.plane(ww, 0.01, u, y + h * 0.55, 0.012, c.trim);
    }
  }
}

/** Toit en dents de scie (n sheds sur la largeur W, faîtages le long de z), le versant vitré tourné vers -x */
function sawtooth(p: Parts, cx: number, y: number, cz: number, W: number, D: number, n: number, h: number, roof: number, glass: number, glow: Glow) {
  const s = W / n, out: number[] = [], gl: number[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = cx - W / 2 + i * s, x1 = x0 + s, z0 = cz - D / 2, z1 = cz + D / 2, ref: V3 = [x0 + s * 0.35, y + h * 0.3, cz];
    const A0: V3 = [x0, y, z0], A1: V3 = [x0, y, z1], B0: V3 = [x0, y + h, z0], B1: V3 = [x0, y + h, z1], C0: V3 = [x1, y, z0], C1: V3 = [x1, y, z1];
    quad(gl, A0, A1, B1, B0, ref);
    quad(out, B0, B1, C1, C0, ref);
    tri(out, A0, B0, C0, ref); tri(out, A1, B1, C1, ref);
  }
  mesh(p, out, 0, 0, 0, roof);
  mesh(p, gl, 0, 0, 0, glass, 0, glow);
}

/** Cheminée d'usine : fût de brique ou de béton, bagues, couronne ; rend le haut (pour la fumée) */
function stack(p: Parts, x: number, z: number, h: number, r: number, col: number, band: number, bands: number[]): V3 {
  p.cyl(r * 0.72, r, h, 8, x, 0, z, col);
  for (const k of bands) p.cyl(r * (1 - k * 0.28) + 0.012, r * (1 - k * 0.28) + 0.012, h * 0.06, 8, x, h * k, z, band);
  p.cyl(r * 0.82, r * 0.76, 0.06, 8, x, h - 0.02, z, dark(col, 0.55));
  return [x, h + 0.08, z];
}

/** Château d'eau sur quatre pieds */
function waterTower(p: Parts, x: number, z: number, h: number, c: Pal) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.03, h, 0.03, x + sx * 0.12, 0, z + sz * 0.12, c.metal);
  p.box(0.3, 0.02, 0.02, x, h * 0.5, z + 0.12, c.metal); p.box(0.3, 0.02, 0.02, x, h * 0.5, z - 0.12, c.metal);
  p.cyl(0.19, 0.19, 0.26, 8, x, h, z, c.arch ? c.accent : dark(c.brick, 0.8));
  p.cone(0.22, 0.12, 8, x, h + 0.26, z, c.roof);
}

/** Wagonnet ou camion : caisse sur quatre roues */
function wagon(p: Parts, x: number, z: number, ry: number, len: number, col: number, load: number) {
  const f = new Face(p, ry, x, z);
  f.box(len, 0.1, 0.18, 0, 0.05, 0, col);
  f.box(len * 0.86, 0.05, 0.14, 0, 0.15, 0, load);
  for (const su of [-1, 1]) for (const sn of [-1, 1]) f.add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 6).rotateX(Math.PI / 2), su * len * 0.32, 0.035, sn * 0.09, 0x2a2a2e);
}

/** Camion : cabine, caisse, roues (le long de x) */
function truck(p: Parts, x: number, z: number, ry: number, cab: number, box: number) {
  const f = new Face(p, ry, x, z);
  f.box(0.16, 0.14, 0.17, 0.27, 0.04, 0, cab);
  f.box(0.1, 0.06, 0.172, 0.29, 0.12, 0, 0x2a3a4a);
  f.box(0.42, 0.2, 0.19, -0.05, 0.05, 0, box);
  for (const su of [0.27, -0.12]) for (const sn of [-1, 1]) f.add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 6).rotateX(Math.PI / 2), su, 0.035, sn * 0.09, 0x2a2a2e);
}

/** Toit plat : garde-corps sur les quatre côtés */
function parapet(p: Parts, w: number, d: number, y: number, col: number, x = 0, z = 0, h = 0.05, t = 0.03) {
  p.box(w, h, t, x, y, z + d / 2 - t / 2, col); p.box(w, h, t, x, y, z - d / 2 + t / 2, col);
  p.box(t, h, d - 2 * t, x + w / 2 - t / 2, y, z, col); p.box(t, h, d - 2 * t, x - w / 2 + t / 2, y, z, col);
}

/** Les fumées des repères (sommets des cheminées, coordonnées du lot) à cet âge ; vide sans fumée */
export function landmarkSmoke(kind: string, age: number): V3[] {
  if (kind === 'factory' && age <= 3) return [[1.25, 2.38, -0.85], [0.75, 2.03, -1.0]];
  if (kind === 'factory' && age === 4) return [[1.3, 3.28, -0.8]];
  if (kind === 'station' && age <= 3) return [[-1.62, 0.6, -0.55]];
  return [];
}

// ---------- L'usine (lot 3,2 × 2,4) ----------

function factory(p: Parts, people: People, age: number, v: number) {
  const c = pal(people, age), or = people === 'orient';
  p.box(3.1, 0.03, 2.3, 0, 0, 0, age >= 4 ? 0xb8b6b0 : or ? 0xc4b08a : 0x9a948a);
  if (age <= 3) {
    // la halle de brique, ses hautes fenêtres, son toit en dents de scie vitré
    const hx = -0.4, hz = -0.3, HW = 2.2, HD = 1.6, H = 0.85;
    p.box(HW, H, HD, hx, 0, hz, c.brick);
    p.box(HW + 0.03, 0.12, HD + 0.03, hx, 0, hz, dark(c.brick, 0.8));
    const front = new Face(p, 0, hx, hz + HD / 2), side = new Face(p, -Math.PI / 2, hx - HW / 2, hz);
    windows(front, HW - 0.5, 0.22, 0.17, 0.42, 5, c);
    windows(side, HD - 0.2, 0.22, 0.17, 0.42, 4, c);
    windows(new Face(p, Math.PI, hx, hz - HD / 2), HW - 0.2, 0.22, 0.17, 0.42, 6, c);
    windows(new Face(p, Math.PI / 2, hx + HW / 2, hz), HD - 0.5, 0.22, 0.17, 0.42, 3, c);
    for (let i = 0; i <= 5; i++) front.box(0.05, H - 0.12, 0.03, -HW / 2 + 0.25 + ((HW - 0.5) / 5) * i, 0.12, 0.015, dark(c.brick, 0.86));
    // la grande porte à deux battants, l'enseigne au-dessus
    front.plane(0.42, 0.5, HW / 2 - 0.15, 0.25, 0.006, or ? O.darkwood : 0x3a3a3e);
    front.plane(0.01, 0.5, HW / 2 - 0.15, 0.25, 0.01, dark(c.brick, 0.6));
    front.box(0.9, 0.14, 0.03, -0.1, H - 0.2, 0.015, c.accent);
    for (let i = 0; i < 5; i++) front.plane(0.08, 0.05, -0.42 + i * 0.16, H - 0.13, 0.034, O.gold);
    if (or) { for (const [f, len] of [[front, HW], [side, HD]] as const) { f.plane(len, 0.05, 0, H - 0.04, 0.004, c.accent); f.plane(len, 0.02, 0, H - 0.07, 0.006, c.accent2); } }
    p.box(HW + 0.06, 0.04, HD + 0.06, hx, H, hz, c.trim);
    sawtooth(p, hx, H + 0.04, hz, HW, HD - 0.1, 5, 0.3, c.roof, c.glass, true);
    // les deux cheminées, le château d'eau, les bureaux à étage
    stack(p, 1.25, -0.85, 2.3, 0.14, 0xb5704f, dark(0xb5704f, 0.7), [0.3, 0.6, 0.92]);
    stack(p, 0.75, -1.0, 1.95, 0.11, or ? 0xc08060 : 0x8a6a5a, c.accent, [0.5, 0.9]);
    waterTower(p, -1.35, 0.85, 0.55, c);
    const ox = 1.15, oz = 0.35;
    p.box(0.75, 0.7, 0.9, ox, 0, oz, c.wall);
    const fo = new Face(p, 0, ox, oz + 0.45);
    for (const y of [0.1, 0.4]) windows(fo, 0.6, y, 0.1, 0.18, 3, c);
    windows(new Face(p, Math.PI / 2, ox + 0.375, oz), 0.7, 0.4, 0.1, 0.18, 3, c);
    if (or) {
      p.box(0.79, 0.04, 0.94, ox, 0.7, oz, c.trim);
      parapet(p, 0.75, 0.9, 0.7, c.wall, ox, oz, 0.06);
      p.cyl(0.18, 0.2, 0.08, 8, ox, 0.7, oz, c.wall);
      dome(p, 0.18, 0.2, ox, 0.78, oz, O.blue, 'persian', 8);
      finial(p, ox, 0.98, oz, 0.5);
      fo.plane(0.6, 0.04, 0, 0.36, 0.006, c.accent);
    } else {
      hipRoof(p, 0.95, 1.08, 0.3, ox, 0.7, oz, c.roof, 0, { lod: true, rows: 1, step: 0.12 });
      for (const sx of [-1, 1]) lantern(p, ox + sx * 0.2, 0.32, oz + 0.5, 0.03);
    }
    // la cour : tas de charbon, caisses, voie étroite et son wagonnet
    p.cone(0.3, 0.22, 6, 0.25, 0, 0.85, 0x2e2c2c);
    for (let i = 0; i < 3; i++) p.box(0.14, 0.12, 0.14, -0.55 + i * 0.17, 0, 0.75 + (i % 2) * 0.12, [0x9a7a5a, 0x7a6a4a, 0xb8a070][(i + v) % 3]);
    for (const sz of [-0.05, 0.05]) p.box(2.2, 0.02, 0.02, -0.2, 0.01, 1.05 + sz, 0x5a5a5e);
    for (let i = 0; i < 12; i++) p.box(0.04, 0.012, 0.16, -1.25 + i * 0.19, 0, 1.05, 0x6a5040);
    wagon(p, -0.75, 1.05, 0, 0.36, 0x5a4a3e, 0x2e2c2c);
    wagon(p, -0.3, 1.05, 0, 0.36, 0x5a4a3e, 0xb8a070);
    return;
  }
  if (age === 4) {
    // la centrale : deux halles de béton à bardage, silos, conduites, haute cheminée rayée, quai de chargement
    const hx = -0.45, hz = -0.25, HW = 2.1, HD = 1.5, H = 0.95;
    p.box(HW, H, HD, hx, 0, hz, c.wall);
    const front = new Face(p, 0, hx, hz + HD / 2), side = new Face(p, -Math.PI / 2, hx - HW / 2, hz);
    for (const [f, len] of [[front, HW], [side, HD]] as const) {
      const n = Math.round(len / 0.16);
      for (let i = 0; i < n; i++) f.plane(0.07, H * 0.55, -len / 2 + (len / n) * (i + 0.5), H * 0.55 / 2 + 0.02, 0.004, dark(c.wall, 0.9));
      f.plane(len - 0.1, 0.16, 0, H - 0.2, 0.006, c.glass, true);
      f.plane(len, 0.04, 0, H - 0.04, 0.006, c.accent);
    }
    p.box(HW + 0.02, 0.04, HD + 0.02, hx, H, hz, c.trim);
    for (const f of [new Face(p, Math.PI, hx, hz - HD / 2), new Face(p, Math.PI / 2, hx + HW / 2, hz)]) f.plane(1.3, 0.16, 0, H - 0.2, 0.006, c.glass, true);
    for (let i = 0; i < 4; i++) { p.cyl(0.05, 0.05, 0.12, 6, hx - 0.7 + i * 0.45, H, hz - 0.3, 0xb0b4b8); p.cyl(0.07, 0.07, 0.02, 6, hx - 0.7 + i * 0.45, H + 0.12, hz - 0.3, 0x8a8e92); }
    sawtooth(p, hx + 0.25, H + 0.04, hz + 0.2, 1.4, 0.8, 4, 0.18, c.roof, c.glass, true);
    // les quais : trois portes roulantes et deux camions
    for (let i = 0; i < 3; i++) {
      front.plane(0.36, 0.42, -0.65 + i * 0.5, 0.21, 0.006, 0x8a9096);
      for (let k = 1; k < 5; k++) front.plane(0.36, 0.008, -0.65 + i * 0.5, k * 0.085, 0.01, 0x6a7076);
    }
    p.box(1.7, 0.08, 0.25, hx - 0.15, 0, hz + HD / 2 + 0.12, c.trim);
    truck(p, -0.8, 0.85, Math.PI / 2, people === 'orient' ? 0xe8e4dc : 0xc0442a, 0x2f6f9e);
    truck(p, -0.2, 0.9, Math.PI / 2 + 0.15, 0xd9a43c, 0xe8e4dc);
    // la cheminée rayée rouge et blanc, ses feux de balisage
    const top = stack(p, 1.3, -0.8, 3.2, 0.15, 0xe8e4dc, 0xc0442a, [0.62, 0.72, 0.82, 0.93]);
    p.box(0.05, 0.05, 0.05, 1.3, top[1] - 0.06, -0.8 + 0.11, 0xff4030, 0, true);
    // les silos et leur convoyeur
    for (const [x, z] of [[0.95, 0.15], [1.45, 0.15]]) { p.cyl(0.24, 0.24, 1.3, 10, x, 0, z, 0xd8d8d4); p.cone(0.25, 0.16, 10, x, 1.3, z, 0xb8b8b4); p.cyl(0.25, 0.25, 0.05, 10, x, 0.6, z, c.accent); }
    p.add(new THREE.BoxGeometry(1.0, 0.06, 0.1).rotateZ(0.55), 0.55, 1.0, 0.15, 0x8a8e92);
    // les conduites qui courent de la halle aux silos
    for (const y of [0.45, 0.6]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 6).rotateZ(Math.PI / 2), 1.0, y, -0.4, y < 0.5 ? c.accent : 0xb0b4b8);
    for (const x of [0.75, 1.25]) p.box(0.04, 0.6, 0.04, x, 0, -0.4, 0x8a8e92);
    // les bureaux vitrés
    p.box(0.7, 0.55, 0.5, 1.2, 0, 0.85, c.wall);
    p.box(0.72, 0.3, 0.52, 1.2, 0.18, 0.85, c.glass, 0, true);
    p.box(0.74, 0.04, 0.54, 1.2, 0.55, 0.85, c.trim);
    p.box(0.5, 0.1, 0.02, 1.2, 0.6, 1.1, c.accent, 0, 'neon');
    return;
  }
  // la fabrique propre : halle blanche à voûte vitrée, panneaux solaires, éolienne, aire des drones
  const hx = -0.35, hz = -0.3, HW = 2.2, HD = 1.5, H = 0.6;
  p.box(HW, H, HD, hx, 0, hz, c.wall);
  p.box(HW + 0.02, 0.2, HD + 0.02, hx, 0.15, hz, c.glass, 0, true);
  p.add(new THREE.CylinderGeometry(HD / 2, HD / 2, HW, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), hx, H, hz, c.roof);
  p.add(new THREE.CylinderGeometry(HD / 2 + 0.01, HD / 2 + 0.01, HW * 0.9, 12, 1, true, -0.25, 0.5).rotateZ(Math.PI / 2), hx, H, hz, c.glass, 0, true);
  for (let i = 0; i < 4; i++) p.add(new THREE.TorusGeometry(HD / 2 + 0.02, 0.018, 3, 10, Math.PI).rotateY(Math.PI / 2), hx - HW / 2 + 0.2 + i * ((HW - 0.4) / 3), H, hz, c.trim);
  p.box(HW + 0.04, 0.02, HD + 0.04, hx, 0.02, hz, c.neon, 0, 'neon');
  // l'entrée : auvent, liseré
  const front = new Face(p, 0, hx, hz + HD / 2);
  front.plane(0.5, 0.36, 0.4, 0.18, 0.006, c.glass, true);
  front.box(0.7, 0.03, 0.3, 0.4, 0.42, 0.15, c.trim);
  front.box(0.7, 0.012, 0.012, 0.4, 0.41, 0.3, c.neon, 'neon');
  // panneaux solaires sur des supports, dans la cour
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const x = 0.95 + j * 0.42, z = -0.95 + i * 0.4;
    p.box(0.03, 0.12, 0.03, x, 0, z, c.metal);
    p.add(new THREE.BoxGeometry(0.36, 0.015, 0.26).rotateX(-0.5), x, 0.16, z, 0x24406a);
  }
  // l'éolienne : mât, nacelle, trois pales
  const tx = 0.95, tz = 0.8, th = 2.4;
  p.cyl(0.03, 0.06, th, 6, tx, 0, tz, c.trim);
  p.box(0.08, 0.08, 0.2, tx, th, tz, c.trim);
  for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.05, 0.6, 0.012).translate(0, 0.3, 0), tx, th + 0.04, tz + 0.11, c.trim, 0, false, (k * Math.PI * 2) / 3 + v);
  p.box(0.012, 0.012, 0.012, tx, th + 0.1, tz, 0xff4030, 0, true);
  // l'aire des drones et son anneau lumineux, haies taillées
  p.cyl(0.24, 0.24, 0.02, 10, 0.3, 0, 0.85, 0xdcdcdc);
  p.add(new THREE.TorusGeometry(0.19, 0.012, 3, 12).rotateX(Math.PI / 2), 0.3, 0.025, 0.85, c.neon, 0, 'neon');
  p.box(0.08, 0.02, 0.08, 0.3, 0.06, 0.85, 0x3a3a40);
  for (let i = 0; i < 4; i++) p.box(0.3, 0.1, 0.1, -1.3 + i * 0.36, 0, 0.75, people === 'orient' ? O.greenD : A.pine);
  if (people === 'orient') palm(p, -1.4, 1.0, 0.7, v, 0x9a8a6a, 0x5f9442, false);
}

// ---------- La gare (lot 3,6 × 1,8 ; la façade sur la ville, les voies derrière) ----------

/** Voie ferrée le long de x (rails et traverses), centrée en z, de x0 à x1 */
function track(p: Parts, x0: number, x1: number, z: number, y = 0) {
  for (const s of [-1, 1]) p.box(x1 - x0, 0.02, 0.02, (x0 + x1) / 2, y + 0.012, z + s * 0.06, 0x5a5a60);
  const n = Math.round((x1 - x0) / 0.18);
  for (let i = 0; i < n; i++) p.box(0.04, 0.012, 0.18, x0 + ((x1 - x0) / n) * (i + 0.5), y, z, 0x5a4636);
}

function station(p: Parts, people: People, age: number, v: number) {
  const c = pal(people, age), or = people === 'orient', tz = -0.55;
  p.box(3.6, 0.03, 1.75, 0, 0, 0, age >= 4 ? 0xbcb8b0 : or ? 0xc9b994 : 0xa8a298);
  // le quai
  p.box(3.5, 0.08, 0.3, 0, 0, -0.2, c.trim);
  if (age <= 3) {
    track(p, -1.8, 1.8, tz);
    // le bâtiment des voyageurs : hall à grande verrière, deux ailes, tour de l'horloge
    p.box(1.3, 0.75, 0.7, 0.1, 0, 0.42, c.wall);
    const fh = new Face(p, 0, 0.1, 0.77);
    if (or) bay(fh, 0, 0.08, 0.6, 0.6, 'pointed', c.glass, { frame: c.trim, alfiz: c.accent, glow: true, seg: 6 });
    else { fh.plane(0.62, 0.5, 0, 0.33, 0.004, c.trim); fh.plane(0.56, 0.45, 0, 0.32, 0.008, c.glass, true); for (let i = 1; i < 4; i++) fh.plane(0.01, 0.45, -0.28 + i * 0.14, 0.32, 0.012, c.trim); }
    for (const sx of [-1, 1]) {
      const x = 0.1 + sx * 1.0;
      p.box(0.72, 0.5, 0.6, x, 0, 0.42, c.wall);
      windows(new Face(p, 0, x, 0.72), 0.6, 0.12, 0.1, 0.22, 3, c);
      if (or) { p.box(0.76, 0.04, 0.64, x, 0.5, 0.42, c.trim); parapet(p, 0.72, 0.6, 0.5, c.wall, x, 0.42); dome(p, 0.16, 0.16, x, 0.53, 0.42, O.blue, 'persian', 8); }
      else hipRoof(p, 0.86, 0.76, 0.22, x, 0.5, 0.42, c.roof, 0, { lod: true, rows: 1, step: 0.12 });
    }
    if (or) {
      p.box(1.34, 0.05, 0.74, 0.1, 0.75, 0.42, c.trim);
      fh.plane(1.3, 0.06, 0, 0.7, 0.006, c.accent);
      parapet(p, 1.3, 0.7, 0.75, c.wall, 0.1, 0.42, 0.07);
    } else hipRoof(p, 1.5, 0.92, 0.34, 0.1, 0.75, 0.42, c.roof, 0, { lod: true, rows: 1, step: 0.12 });
    // la tour de l'horloge
    const kx = -0.62, kz = 0.55, kh = 1.55;
    p.box(0.3, kh, 0.3, kx, 0, kz, or ? c.wall : c.brick);
    for (const [ry, ox, oz] of [[0, 0, 0.151], [Math.PI / 2, 0.151, 0]] as const) {
      const f = new Face(p, ry, kx + ox, kz + oz);
      f.add(new THREE.CircleGeometry(0.1, 10), 0, kh - 0.2, 0.004, 0xf6f0e0, true);
      f.plane(0.012, 0.07, 0, kh - 0.18, 0.008, 0x2a2a2e);
      f.plane(0.05, 0.012, 0.02, kh - 0.2, 0.008, 0x2a2a2e);
    }
    if (or) { p.box(0.36, 0.04, 0.36, kx, kh, kz, c.trim); dome(p, 0.15, 0.2, kx, kh + 0.04, kz, O.turq, 'persian', 8); finial(p, kx, kh + 0.24, kz, 0.5); }
    else { hipRoof(p, 0.46, 0.46, 0.28, kx, kh, kz, c.accent2, 0, { lod: true, rows: 0 }); }
    // la grande halle des voies : voûte de verre sur arcs de fer, colonnes
    const sx0 = -0.45, sx1 = 1.85, sl = sx1 - sx0, scx = (sx0 + sx1) / 2;
    p.add(new THREE.CylinderGeometry(0.5, 0.5, sl, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), scx, 0.42, tz + 0.05, 0x9fb6c4, 0, true);
    for (let i = 0; i < 5; i++) {
      const x = sx0 + 0.05 + i * ((sl - 0.1) / 4);
      p.add(new THREE.TorusGeometry(0.51, 0.02, 3, 10, Math.PI).rotateY(Math.PI / 2), x, 0.42, tz + 0.05, c.metal);
      for (const s of [-1, 1]) p.box(0.04, 0.42, 0.04, x, 0, tz + 0.05 + s * 0.49, c.metal);
    }
    // la locomotive à vapeur devant la halle, ses deux voitures dessous
    const lx = -1.3;
    p.add(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8).rotateZ(Math.PI / 2), lx - 0.12, 0.17, tz, 0x2a2a2e);
    p.box(0.24, 0.3, 0.26, lx + 0.25, 0.06, tz, 0x2a2a2e);
    p.box(0.28, 0.03, 0.3, lx + 0.25, 0.36, tz, or ? c.accent : c.accent);
    p.box(0.14, 0.08, 0.27, lx + 0.25, 0.22, tz, c.glass, 0, true);
    p.cyl(0.035, 0.05, 0.16, 6, lx - 0.3, 0.27, tz, 0x1e1e22);
    p.cyl(0.045, 0.045, 0.06, 6, lx + 0.0, 0.27, tz, 0xb8902a);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8).rotateX(Math.PI / 2), lx - 0.28 + i * 0.16, 0.06, tz + s * 0.12, 0xa8352a);
    p.add(new THREE.ConeGeometry(0.1, 0.12, 4).rotateZ(Math.PI / 2), lx - 0.43, 0.06, tz, 0x3a3a3e);
    for (let i = 0; i < 2; i++) {
      const x = 0.05 + i * 0.78, col = or ? [O.turqD, 0x7a2a2a][i] : [A.redDark, A.tileG][i];
      p.box(0.72, 0.24, 0.24, x, 0.06, tz, col);
      p.box(0.66, 0.08, 0.25, x, 0.16, tz, c.glass, 0, true);
      p.box(0.74, 0.03, 0.26, x, 0.3, tz, dark(col, 0.7));
      for (const s of [-1, 1]) p.box(0.04, 0.05, 0.22, x + s * 0.25, 0, tz, 0x2a2a2e);
    }
    // les réverbères du quai, bancs, malles
    for (let i = 0; i < 3; i++) { p.cyl(0.012, 0.016, 0.4, 4, -1.4 + i * 1.3, 0.08, -0.12, c.metal); p.box(0.05, 0.06, 0.05, -1.4 + i * 1.3, 0.48, -0.12, c.glass, 0, true); }
    for (let i = 0; i < 3; i++) p.box(0.1, 0.07, 0.07, -1.0 + i * 0.12, 0.08, -0.25, [0x7a4a2a, 0x3a4a6a, 0x6a6a3a][(i + v) % 3]);
    return;
  }
  if (age === 4) {
    track(p, -1.8, 1.8, tz);
    track(p, -1.8, 1.8, tz - 0.34);
    // le bâtiment : verre et béton, grand auvent plat
    p.box(2.2, 0.6, 0.55, 0.2, 0, 0.45, c.wall);
    p.box(2.0, 0.46, 0.57, 0.2, 0.06, 0.45, c.glass, 0, true);
    for (let i = 0; i <= 8; i++) p.box(0.03, 0.46, 0.58, -0.8 + i * 0.25, 0.06, 0.45, c.trim);
    p.box(2.6, 0.04, 0.9, 0.2, 0.6, 0.5, c.trim);
    p.box(2.62, 0.02, 0.02, 0.2, 0.58, 0.95, c.accent, 0, 'neon');
    p.box(0.9, 0.12, 0.03, 0.2, 0.7, 0.75, c.accent);
    p.box(0.8, 0.07, 0.035, 0.2, 0.72, 0.75, 0xffffff, 0, 'neon');
    // l'horloge sur son mât
    p.cyl(0.015, 0.015, 0.9, 4, -1.3, 0, 0.6, c.metal);
    p.cyl(0.08, 0.08, 0.03, 10, -1.3, 0.9, 0.6, 0xf6f0e0, true, 0);
    // les abris des quais, sur la moitié des quais (la rame reste visible d'en haut) : dalle sur colonnes
    for (const z of [-0.2, tz - 0.17]) {
      p.box(1.3, 0.03, 0.24, 1.05, 0.5, z, c.trim);
      p.box(1.3, 0.012, 0.012, 1.05, 0.49, z + 0.12, c.accent, 0, 'neon');
      for (let i = 0; i < 3; i++) p.box(0.03, 0.5, 0.03, 0.5 + i * 0.55, 0, z, c.metal);
    }
    p.box(3.4, 0.06, 0.18, 0, 0, tz - 0.17, c.trim);
    // les pylônes et la caténaire
    for (let i = 0; i < 4; i++) { const x = -1.6 + i * 1.07; p.box(0.03, 0.62, 0.03, x, 0, tz - 0.55, c.metal); p.box(0.03, 0.03, 0.55, x, 0.6, tz - 0.3, c.metal); }
    for (const z of [tz, tz - 0.34]) p.box(3.5, 0.008, 0.008, 0, 0.56, z, 0x3a3a3e);
    // le train électrique : nez profilé, bandeau vitré, liseré
    const col = or ? O.turq : A.red;
    p.box(2.2, 0.24, 0.22, -0.2, 0.05, tz, 0xf2f0ea);
    frustum(p, 0.3, 0.22, 0.02, 0.18, 0.24, 0.98, 0.05, tz, 0xf2f0ea, -Math.PI / 2);
    p.box(2.22, 0.07, 0.225, -0.2, 0.17, tz, c.glass, 0, true);
    p.box(2.22, 0.03, 0.225, -0.2, 0.09, tz, col);
    p.box(0.12, 0.06, 0.08, -0.6, 0.29, tz, c.metal);
    p.add(new THREE.BoxGeometry(0.02, 0.22, 0.02).rotateZ(0.5), -0.6, 0.4, tz, c.metal);
    return;
  }
  // le maglev : voie suspendue sur pylônes, rame en capsule, gare à coque de verre
  const gy = 0.6;
  for (let i = 0; i < 3; i++) { const x = -1.4 + i * 1.4; p.cyl(0.05, 0.08, gy, 6, x, 0, tz, c.trim); p.box(0.14, 0.05, 0.36, x, gy - 0.05, tz, c.trim); }
  p.box(3.8, 0.08, 0.2, 0, gy, tz, c.wall);
  p.box(3.8, 0.012, 0.012, 0, gy + 0.08, tz + 0.1, c.neon, 0, 'neon');
  p.box(3.8, 0.012, 0.012, 0, gy + 0.08, tz - 0.1, c.neon, 0, 'neon');
  const cap = new THREE.CapsuleGeometry(0.12, 2.0, 3, 8).rotateZ(Math.PI / 2);
  p.add(cap, -0.1, gy + 0.22, tz, 0xf6f6f2);
  p.box(1.9, 0.06, 0.245, -0.1, gy + 0.22, tz, c.glass, 0, true);
  p.box(2.0, 0.015, 0.25, -0.1, gy + 0.14, tz, c.neon, 0, 'neon');
  // le quai haut et l'escalier
  p.box(2.4, 0.04, 0.3, 0.3, gy, tz + 0.3, c.trim);
  for (let i = 0; i < 4; i++) p.box(0.3, 0.04, 0.1, 1.55, i * 0.15, 0.1 - i * 0.1, c.trim);
  // la gare : coque de verre bombée, nervures, liserés
  p.box(2.0, 0.08, 0.7, 0.1, 0, 0.45, c.trim);
  p.add(new THREE.CylinderGeometry(0.45, 0.45, 2.0, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 1.3, 0.8), 0.1, 0.08, 0.45, c.glass, 0, true);
  for (let i = 0; i < 5; i++) p.add(new THREE.TorusGeometry(0.46, 0.015, 3, 10, Math.PI).rotateY(Math.PI / 2).scale(1, 1.3, 0.8), -0.85 + i * 0.47, 0.08, 0.45, c.wall);
  p.box(2.04, 0.015, 0.74, 0.1, 0.09, 0.45, c.neon, 0, 'neon');
  if (or) { dome(p, 0.18, 0.16, 0.1, 0.66, 0.45, O.glass, 'persian', 8, true); finial(p, 0.1, 0.82, 0.45, 0.5); }
  else hipRoof(p, 0.5, 0.36, 0.14, 0.1, 0.66, 0.45, c.roof, 0, { lod: true, rows: 0, glow: 'neon', edge: c.neon, t: 0.02 });
  for (let i = 0; i < 3; i++) p.box(0.16, 0.1, 0.16, -1.4 + i * 0.25, 0, 0.75, or ? O.greenD : A.pine);
}

// ---------- Le gratte-ciel (lot 2,4 × 2,4 ; Moderne, puis Futuriste) ----------

function skyscraper(p: Parts, people: People, age: number, v: number) {
  const c = pal(people, Math.max(4, age)), fut = age >= 5;
  p.box(2.3, 0.03, 2.3, 0, 0, 0, fut ? 0xdedad2 : 0xbcb8b0);
  if (people === 'orient') {
    // les tours jumelles : fûts à huit pans, retraits, bandeaux vitrés, passerelle à mi-hauteur, flèches dorées
    p.box(2.1, 0.32, 1.3, 0, 0, -0.1, c.wall);
    p.box(2.12, 0.14, 1.32, 0, 0.1, -0.1, c.glass, 0, true);
    for (let i = 0; i < 5; i++) new Face(p, 0, -0.8 + i * 0.4, 0.55).shape([new THREE.Vector2(-0.1, 0), new THREE.Vector2(0.1, 0), new THREE.Vector2(0.1, 0.14), new THREE.Vector2(0, 0.24), new THREE.Vector2(-0.1, 0.14)], 0, 0.04, 0.012, c.trim);
    const steps: [number, number][] = [[0.4, 1.6], [0.35, 1.2], [0.3, 0.9], [0.24, 0.6]], clad = fut ? c.trim : 0xd4d8da;
    for (const sx of [-1, 1]) {
      const x = sx * 0.55, z = -0.12;
      let y = 0.32;
      for (const [r, h] of steps) {
        p.add(new THREE.CylinderGeometry(r, r, h, 8, 1, true).translate(0, h / 2, 0), x, y, z, clad, Math.PI / 8);
        const n = Math.max(1, Math.round(h / 0.16));
        for (let k = 0; k < n; k++) p.add(new THREE.CylinderGeometry(r + 0.008, r + 0.008, 0.11, 8, 1, true).translate(0, 0.055, 0), x, y + (h / n) * k + 0.025, z, c.glass, Math.PI / 8, true);
        p.cyl(r + 0.03, r + 0.03, 0.03, 8, x, y + h, z, fut ? c.neon : O.gold, fut ? 'neon' : false, Math.PI / 8);
        y += h + 0.03;
      }
      p.cone(0.14, 0.4, 8, x, y, z, c.trim);
      p.cyl(0.012, 0.02, 0.6, 4, x, y + 0.3, z, O.gold);
      p.add(new THREE.OctahedronGeometry(0.04), x, y + 0.55, z, fut ? c.neon : O.gold, 0, fut ? 'neon' : false);
      if (fut) p.add(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 8, 1, true), x, 1.5, z, c.neon, Math.PI / 8, 'neon');
    }
    // la passerelle (le pont entre les deux tours) et ses jambes de force
    p.box(0.42, 0.11, 0.16, 0, 1.75, -0.12, c.trim);
    p.box(0.42, 0.05, 0.165, 0, 1.78, -0.12, c.glass, 0, true);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.03, 0.75, 0.03).rotateZ(s * 0.55), s * 0.08, 1.4, -0.12, c.metal);
    // le parvis : bassin, fontaines, palmiers
    p.box(1.2, 0.04, 0.35, 0, 0, 0.85, c.trim);
    p.box(1.12, 0.042, 0.28, 0, 0, 0.85, O.water);
    for (const sx of [-1, 1]) palm(p, sx * 0.95, 0.85, 0.65, v + sx, 0x9a8a6a, 0x5f9442, false);
    return;
  }
  // la tour à étages évasés : socle, huit modules qui s'élargissent vers le haut, disques porte-bonheur, toit courbe, antenne
  p.box(1.8, 0.4, 1.8, 0, 0, 0, c.wall);
  p.box(1.82, 0.18, 1.82, 0, 0.14, 0, c.glass, 0, true);
  hipRoof(p, 2.0, 2.0, 0.12, 0, 0.4, 0, A.tileG, 0, { lod: true, rows: 0, hips: false, ...(fut ? { glow: 'neon' as Glow, edge: c.neon, t: 0.02 } : {}) });
  p.box(0.9, 0.9, 0.9, 0, 0.5, 0, c.trim);
  for (const [f, len] of [[new Face(p, 0, 0, 0.45, 0.5), 0.9], [new Face(p, Math.PI / 2, 0.45, 0, 0.5), 0.9], [new Face(p, Math.PI, 0, -0.45, 0.5), 0.9], [new Face(p, -Math.PI / 2, -0.45, 0, 0.5), 0.9]] as const) {
    for (let k = 0; k < 4; k++) f.plane(len - 0.1, 0.1, 0, 0.12 + k * 0.2, 0.004, c.glass, true);
    f.add(new THREE.CircleGeometry(0.12, 10), 0, 0.68, 0.01, A.gold);
    f.add(new THREE.CircleGeometry(0.06, 8), 0, 0.68, 0.014, A.red);
  }
  let y = 1.4;
  const mod = 0.4;
  for (let i = 0; i < 7; i++) {
    frustum(p, 0.7, 0.7, 0.9, 0.9, mod, 0, y, 0, 0x6f9a8a);
    frustum(p, 0.72, 0.72, 0.86, 0.86, mod * 0.5, 0, y + mod * 0.25, 0, c.glass, 0, true);
    p.box(0.94, 0.03, 0.94, 0, y + mod - 0.015, 0, fut ? c.neon : c.trim, 0, fut ? 'neon' : false);
    y += mod;
  }
  p.box(0.6, 0.3, 0.6, 0, y, 0, 0x6f9a8a);
  hipRoof(p, 0.8, 0.8, 0.28, 0, y + 0.3, 0, A.tileG, 0, { lod: true, rows: 0, ...(fut ? { glow: 'neon' as Glow, edge: c.neon, t: 0.02 } : {}) });
  p.cyl(0.03, 0.05, 0.9, 6, 0, y + 0.55, 0, c.metal);
  p.add(new THREE.OctahedronGeometry(0.04), 0, y + 1.45, 0, fut ? c.neon : 0xff4030, 0, true);
  // le parvis : lions, pins, lanternes
  for (const sx of [-1, 1]) { p.box(0.12, 0.12, 0.12, sx * 0.35, 0, 1.0, A.stone); p.sphere(0.07, sx * 0.35, 0.18, 1.0, A.stone); lantern(p, sx * 0.7, 0.3, 1.0, 0.04); p.cyl(0.01, 0.01, 0.28, 4, sx * 0.7, 0, 1.0, A.darkwood); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.cyl(0.02, 0.03, 0.2, 5, sx * 1.0, 0, sz * 1.0, A.darkwood); p.cone(0.14, 0.3, 6, sx * 1.0, 0.15, sz * 1.0, A.pine); }
}

// ---------- L'arcologie (lot 5 × 5, Futuriste) ----------

function arcology(p: Parts, people: People, v: number) {
  const c = pal(people, 5);
  p.box(5, 0.04, 5, 0, 0, 0, 0xdedad2);
  if (people === 'orient') {
    // la ziggourat de terrasses : cinq gradins blancs, bandeaux vitrés, jardinières, palmiers sur les terrasses
    const tiers = [4.4, 3.6, 2.8, 2.1, 1.4], th = 0.75;
    let y = 0;
    tiers.forEach((s, i) => {
      p.box(s, th, s, 0, y, 0, c.wall);
      p.box(s + 0.02, th * 0.4, s + 0.02, 0, y + th * 0.3, 0, c.glass, 0, true);
      if (i === 0) for (let k = 0; k < 4; k++) {
        const f = new Face(p, (k * Math.PI) / 2, Math.sin((k * Math.PI) / 2) * s / 2, Math.cos((k * Math.PI) / 2) * s / 2);
        for (let j = 0; j < 5; j++) bay(f, -1.6 + j * 0.8, 0.02, 0.42, 0.6, 'pointed', c.glass, { frame: c.accent, glow: true, seg: 4 });
      }
      p.box(s + 0.06, 0.03, s + 0.06, 0, y + th, 0, c.neon, 0, 'neon');
      const ns = tiers[i + 1] ?? 0;
      if (ns) {
        const g = (s - ns) / 2 - 0.06;
        for (const [sx, sz, w, d] of [[0, 1, s - 0.1, g], [0, -1, s - 0.1, g], [1, 0, g, ns], [-1, 0, g, ns]]) p.box(w, 0.06, d, sx * (s / 2 - g / 2 - 0.05), y + th, sz * (s / 2 - g / 2 - 0.05), O.green);
        if (i < 3) for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + Math.PI / 4 + v, r = ((s + ns) / 2) * 0.62, tx = Math.cos(a) * r * 0.9, tz = Math.sin(a) * r * 0.9;
          p.cyl(0.025, 0.03, 0.22, 5, tx, y + th, tz, 0x9a8a6a);
          p.add(new THREE.IcosahedronGeometry(0.13, 0).scale(1, 0.8, 1), tx, y + th + 0.28, tz, k % 2 ? O.green : O.greenD);
        }
      }
      y += th;
    });
    // la grande coupole de verre, son anneau lumineux, la flèche
    p.cyl(0.75, 0.8, 0.12, 12, 0, y, 0, c.wall);
    dome(p, 0.7, 0.75, 0, y + 0.12, 0, O.glass, 'persian', 12, true);
    p.add(new THREE.TorusGeometry(0.82, 0.03, 3, 16).rotateX(Math.PI / 2), 0, y + 0.1, 0, c.neon, 0, 'neon');
    finial(p, 0, y + 0.87, 0, 1.4);
    // les quatre minarets de verre aux angles du premier gradin
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 2.25, z = sz * 2.25;
      p.cyl(0.12, 0.15, 2.2, 8, x, 0, z, c.wall);
      for (let k = 0; k < 4; k++) p.cyl(0.13, 0.13, 0.08, 8, x, 0.4 + k * 0.45, z, c.glass, true);
      p.cyl(0.18, 0.18, 0.03, 8, x, 2.2, z, c.neon, 'neon');
      dome(p, 0.12, 0.16, x, 2.23, z, O.glass, 'persian', 8, true);
      finial(p, x, 2.39, z, 0.4);
    }
    return;
  }
  // trois tours reliées par des anneaux de verre et des jardins suspendus, sous des toits courbes à liseré
  const towers: [number, number, number, number][] = [[-1.2, -0.9, 0.95, 18], [1.2, -0.9, 0.85, 15], [0, 1.15, 0.9, 13]];
  for (const [x, z, s, n] of towers) {
    const fh = 0.3;
    let y = 0;
    p.box(s + 0.2, 0.15, s + 0.2, x, 0, z, c.trim);
    y = 0.15;
    for (let f = 0; f < n; f++, y += fh) {
      p.box(s, fh * 0.7, s, x, y, z, c.glass, 0, true);
      p.box(s + 0.02, fh * 0.3, s + 0.02, x, y + fh * 0.7, z, c.wall);
      if (f % 4 === 3 && f < n - 1) {
        hipRoof(p, s + 0.34, s + 0.34, 0.1, x, y + fh, z, c.roof, 0, { lod: true, rows: 0, hips: false, glow: 'neon', edge: c.neon, t: 0.02 });
        p.box(s + 0.1, 0.05, 0.08, x, y + fh + 0.02, z + s / 2 + 0.05, A.moss);
      }
    }
    for (const sx of [-1, 1]) p.box(0.025, y - 0.15, 0.025, x + sx * (s / 2 + 0.012), 0.15, z + s / 2 + 0.012, c.neon, 0, 'neon');
    hipRoof(p, s + 0.3, s + 0.3, 0.45, x, y, z, c.roof, 0, { lod: true, rows: 1, step: 0.14, glow: 'neon', edge: c.neon });
    p.cyl(0.01, 0.012, 0.5, 4, x, y + 0.45, z, 0xdddddd);
    p.sphere(0.035, x, y + 0.95, z, c.neon);
  }
  // les jardins suspendus entre les tours (passerelles plantées) et les anneaux lumineux
  for (const [y, i, j] of [[2.0, 0, 1], [2.9, 1, 2], [3.4, 0, 2]] as const) {
    const a = towers[i], b = towers[j], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
    p.box(0.36, 0.08, len, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, c.wall, ry);
    p.box(0.3, 0.05, len - 0.3, (a[0] + b[0]) / 2, y + 0.08, (a[1] + b[1]) / 2, A.moss, ry);
    p.box(0.37, 0.012, len, (a[0] + b[0]) / 2, y - 0.012, (a[1] + b[1]) / 2, c.neon, ry, 'neon');
  }
  p.add(new THREE.TorusGeometry(1.95, 0.04, 3, 24).rotateX(Math.PI / 2), 0, 4.2, -0.2, A.pink, 0, 'neon');
  p.add(new THREE.TorusGeometry(2.1, 0.03, 3, 24).rotateX(Math.PI / 2), 0, 1.2, -0.2, c.neon, 0, 'neon');
  // le jardin au pied : étang, pont, bambous
  p.box(1.4, 0.04, 0.9, 1.4, 0, 1.4, A.moss);
  p.box(1.0, 0.045, 0.5, 1.4, 0, 1.4, A.water);
  p.box(0.12, 0.06, 0.6, 1.4, 0.02, 1.4, A.red);
  for (let i = 0; i < 4; i++) { p.cyl(0.015, 0.015, 0.6, 4, -1.9 + i * 0.12, 0, 1.9, A.bamboo); p.sphere(0.06, -1.9 + i * 0.12, 0.6, 1.9, A.leaf); }
}

/** Dessine un repère ; faux si la sorte n'en est pas un */
export function townLandmark(p: Parts, people: People, kind: string, age: number, v: number): boolean {
  const a = Math.max(3, age);
  switch (kind) {
    case 'factory': factory(p, people, a, v); return true;
    case 'station': station(p, people, a, v); return true;
    case 'skyscraper': skyscraper(p, people, Math.max(4, a), v); return true;
    case 'arcology': arcology(p, people, v); return true;
  }
  return false;
}
