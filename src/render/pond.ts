import * as THREE from 'three';
import { Parts } from './parts';
import { hash2 } from '../core/rng';

/**
 * Deux décorations d'eau, débloquées par des expéditions (1 case, origine au centre, rien ne dépasse de 0,46) :
 * - la **mare** (« Les grands bancs ») : une eau aux bords irréguliers, plus sombre vers le fond, sa berge de terre et
 *   d'herbe, des pierres, des touffes de roseaux et de massettes, des nénuphars en fleurs. Par âge : dalles de travertin et
 *   amphore couchée (Antiquité), canards, cabane sur pilotis et ponton de planches (Moyen Âge), margelle de pierre et
 *   poissons rouges (âge industriel), pas japonais et carpes koï (époque moderne), rebord blanc à liseré de lumière et
 *   nénuphars lumineux (futur) ;
 * - le **bassin à coraux** (« Le récif ») : un bassin d'eau de mer clair, des coraux de toutes les couleurs (branches,
 *   éventails, boules) qui affleurent, des poissons du récif, une étoile de mer ; au futur, un rebord blanc et un anneau de
 *   lumière.
 * Tout est en géométries simples fusionnées par `Parts`, comme les autres décorations (`decor.ts`)
 */

const PI = Math.PI;
const H = (i: number, k: number, s = 0) => hash2(i, k, 53 + s);
const dk = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

const EARTH = 0x7a5a3a, MUD = 0x5e4630, GRASS = 0x6f9a48, GRASS2 = 0x5a8a3c, STONE = 0xa8a298, TRAV = 0xd8ccb4;
const SHALLOW = 0x7cc4cc, WATER = 0x4a9ab4, DEEP = 0x2f7494, PAD = 0x4f8f3a, PAD2 = 0x6aa848;
const REED = 0x7a9a4a, REED2 = 0x9aa858, CATTAIL = 0x6a4428, WOOD = 0x8a6440, WOOD2 = 0x6e4e30;
const WHITE = 0xf2f4f6, NEON = 0x5af0ff, SEA = 0x58c8d8, SEA2 = 0x3aa8c4;

/** Un contour d'eau irrégulier (rayons rx, rz), qui change d'une mare à l'autre (`v`) */
function blob(rx: number, rz: number, v: number, n = 22, wob = 1) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * PI * 2, k = 1 + wob * (0.07 * Math.sin(3 * t + v * 2.1) + 0.045 * Math.sin(5 * t + v * 3.7));
    const x = Math.cos(t) * rx * k, z = Math.sin(t) * rz * k;
    // (dessinée en x, −z : couchée face vers le ciel, elle retombe sur x, z)
    if (i === 0) s.moveTo(x, -z); else s.lineTo(x, -z);
  }
  return new THREE.ShapeGeometry(s, 1).rotateX(-PI / 2);
}
/** Un point du bord de la mare (angle t, à la part `k` du rayon) */
function rim(rx: number, rz: number, v: number, t: number, k = 1): [number, number] {
  const w = 1 + 0.07 * Math.sin(3 * t + v * 2.1) + 0.045 * Math.sin(5 * t + v * 3.7);
  return [Math.cos(t) * rx * w * k, Math.sin(t) * rz * w * k];
}

/** L'eau : trois nappes de plus en plus sombres vers le milieu, à la hauteur `y` */
function water(p: Parts, rx: number, rz: number, v: number, y: number, c = [SHALLOW, WATER, DEEP], wob = 1) {
  p.add(blob(rx, rz, v, 22, wob), 0, y, 0, c[0]);
  p.add(blob(rx * 0.74, rz * 0.72, v + 0.6, 18, wob), 0.02, y + 0.0008, 0.01, c[1]);
  p.add(blob(rx * 0.42, rz * 0.4, v + 1.3, 14, wob), 0.03, y + 0.0016, 0.02, c[2]);
}

/** Une touffe de roseaux (tiges fines et feuilles en lame) et de massettes (l'épi brun au bout de la tige) */
function reeds(p: Parts, x: number, z: number, i: number, n = 8, h = 0.16) {
  for (let k = 0; k < n; k++) {
    const a = H(i, k) * PI * 2, r = 0.012 + H(i, k, 1) * 0.03, hh = h * (0.6 + H(i, k, 2) * 0.5);
    const lx = x + Math.cos(a) * r, lz = z + Math.sin(a) * r, lean = (H(i, k, 3) - 0.5) * 0.35;
    // une lame de feuille, couchée un peu vers l'extérieur
    p.add(new THREE.ConeGeometry(0.007, hh, 3).scale(1, 1, 0.35).translate(0, hh / 2, 0), lx, 0.01, lz, k % 2 ? REED : REED2, a, false, lean, Math.cos(a) * 0.12);
  }
  for (let k = 0; k < 3; k++) {
    const a = H(i, k, 5) * PI * 2, r = 0.01 + H(i, k, 6) * 0.02, hh = h * (1 + H(i, k, 7) * 0.25);
    const lx = x + Math.cos(a) * r, lz = z + Math.sin(a) * r;
    p.cyl(0.0022, 0.003, hh, 4, lx, 0.01, lz, REED);
    // l'épi de massette, puis la pointe de la tige
    p.cyl(0.008, 0.008, 0.034, 6, lx, 0.01 + hh - 0.05, lz, CATTAIL);
    p.cyl(0.0015, 0.0022, 0.022, 3, lx, 0.01 + hh - 0.016, lz, REED2);
  }
}

/** Un nénuphar : la feuille ronde fendue, et parfois sa fleur (pétales en étoile, cœur jaune) */
function lily(p: Parts, x: number, y: number, z: number, r: number, rot: number, flower: number | null, glow = false) {
  p.add(new THREE.CircleGeometry(r, 10, 0.35, PI * 2 - 0.7).rotateX(-PI / 2), x, y, z, glow ? 0x5ad8a8 : PAD, rot, glow ? 'neon' : false);
  p.add(new THREE.CircleGeometry(r * 0.55, 8, 0.4, PI * 2 - 0.8).rotateX(-PI / 2), x, y + 0.0006, z, PAD2, rot);
  if (flower === null) return;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2;
    p.add(new THREE.ConeGeometry(0.008, 0.022, 3).rotateZ(-PI / 2 + 0.6).translate(0.008, 0, 0), x, y + 0.008, z, flower, a + rot, glow ? 'neon' : false);
  }
  p.sphere(0.006, x, y + 0.012, z, 0xf2d24a);
}

/** Des pierres de berge, posées sur le bord, de `t0` à `t1` (angle) */
function stones(p: Parts, rx: number, rz: number, v: number, t0: number, t1: number, n: number, c = STONE, s = 0.03) {
  for (let k = 0; k < n; k++) {
    const t = t0 + ((t1 - t0) * (k + 0.5)) / n, [x, z] = rim(rx, rz, v, t, 1.04);
    p.add(new THREE.DodecahedronGeometry(s * (0.7 + H(k, 9, v) * 0.6), 0).scale(1, 0.6, 1), x, 0.012, z, dk(c, 0.85 + H(k, 4, v) * 0.3), t * 3);
  }
}

/** Un canard qui flotte : corps, queue relevée, tête au cou vert (le colvert) ou brune (la cane), bec orange */
function duck(p: Parts, x: number, y: number, z: number, ry: number, male: boolean) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (u: number, h: number): [number, number, number] => [x + s * u, y + h, z + c * u];
  p.add(new THREE.IcosahedronGeometry(0.03, 1).scale(0.75, 0.6, 1.15), ...at(0, 0.012), male ? 0xd8d4c8 : 0x9a7a52, ry);
  p.add(new THREE.ConeGeometry(0.014, 0.03, 4).rotateX(-PI / 2 - 0.5), ...at(-0.036, 0.022), male ? 0x3a3a3a : 0x7a5a3a, ry);
  p.sphere(0.016, ...at(0.028, 0.04), male ? 0x2a7a4a : 0x8a6a42, 1);
  p.add(new THREE.BoxGeometry(0.01, 0.005, 0.018), ...at(0.046, 0.037), 0xe8902a, ry);
  if (male) p.add(new THREE.TorusGeometry(0.011, 0.002, 3, 8).rotateX(PI / 2), ...at(0.024, 0.026), WHITE, ry);
}

/** Un petit poisson à fleur d'eau (poisson rouge, carpe koï, poisson du récif) */
function fish(p: Parts, x: number, y: number, z: number, ry: number, c: number, c2 = c, l = 0.03) {
  p.add(new THREE.IcosahedronGeometry(1, 0).scale(l * 0.32, l * 0.12, l * 0.5), x, y, z, c, ry);
  p.add(new THREE.ConeGeometry(l * 0.22, l * 0.32, 3).rotateX(PI / 2).scale(1, 0.3, 1), x - Math.sin(ry) * l * 0.55, y, z - Math.cos(ry) * l * 0.55, c2, ry);
}

/** La mare, d'un âge à l'autre */
export function pondModel(p: Parts, age: number, v: number) {
  const vv = (v % 7) + 1, a = Math.max(1, Math.min(5, age));
  if (a === 3) { pondGarden(p, vv); return; }
  if (a === 5) { pondLight(p, vv); return; }
  const RX = 0.34, RZ = 0.3;
  // la berge : l'herbe, puis la terre mouillée du bord, puis l'eau
  p.add(blob(RX + 0.07, RZ + 0.07, vv, 24), 0, 0.004, 0, a === 4 ? 0x7aa452 : GRASS);
  p.add(blob(RX + 0.035, RZ + 0.035, vv, 22), 0, 0.009, 0, MUD);
  water(p, RX, RZ, vv, 0.013);
  // quelques touffes d'herbe plus haute sur la berge
  for (let k = 0; k < 12; k++) {
    const t = H(k, 1, vv) * PI * 2, [x, z] = rim(RX, RZ, vv, t, 1.16);
    for (let j = 0; j < 3; j++) p.add(new THREE.ConeGeometry(0.008, 0.05 + H(k, j) * 0.03, 3).translate(0, 0.025, 0), x + (j - 1) * 0.012, 0.006, z, GRASS2, j, false, (j - 1) * 0.3);
  }
  // les roseaux et les massettes, de part et d'autre
  const rt = [0.4 + vv * 0.3, 2.6 + vv * 0.2, 4.4];
  for (let i = 0; i < (a === 4 ? 2 : 3); i++) { const [x, z] = rim(RX, RZ, vv, rt[i], 0.9); reeds(p, x, z, i + vv * 3, 11 + i, 0.2 + (i === 0 ? 0.06 : 0)); }
  // des iris d'eau jaunes au pied des roseaux
  for (let i = 0; i < 2; i++) {
    const [x, z] = rim(RX, RZ, vv, rt[i] + 0.35, 0.98);
    for (let k = 0; k < 4; k++) p.add(new THREE.ConeGeometry(0.006, 0.09, 3).scale(1, 1, 0.3).translate(0, 0.045, 0), x + (k - 1.5) * 0.01, 0.01, z, REED2, k * 0.8, false, (k - 1.5) * 0.25);
    for (let k = 0; k < 2; k++) { const fx = x + (k ? 0.012 : -0.008), fz = z + (k ? -0.006 : 0.008); p.cyl(0.0018, 0.0022, 0.1, 3, fx, 0.01, fz, REED); for (let j = 0; j < 3; j++) p.add(new THREE.ConeGeometry(0.007, 0.018, 3).rotateZ(PI / 2 + 0.5).translate(0.007, 0, 0), fx, 0.11, fz, 0xf2d03a, j * 2.1); }
  }
  // les nénuphars, en fleurs (blancs et roses)
  for (let k = 0; k < 5; k++) {
    const t = 1.2 + k * 1.15 + vv * 0.4, [x, z] = rim(RX, RZ, vv, t, 0.45 + H(k, 2, vv) * 0.3);
    lily(p, x, 0.0165, z, 0.032 + H(k, 3, vv) * 0.014, t * 2, k % 2 ? null : k % 4 ? 0xf6c2d6 : 0xf6f2ea);
  }
  if (a === 1) {
    // l'Antiquité : de grandes dalles de travertin sur un côté, où l'on s'assied, et une amphore couchée dans l'herbe
    for (let k = 0; k < 4; k++) { const t = PI * 0.35 + k * 0.32, [x, z] = rim(RX, RZ, vv, t, 1.12); p.box(0.1, 0.022, 0.07, x, 0.004, z, dk(TRAV, 0.92 + H(k, 6) * 0.12), -t); }
    const [ax, az] = rim(RX, RZ, vv, PI * 1.3, 1.25);
    p.add(new THREE.CylinderGeometry(0.018, 0.026, 0.07, 8).rotateZ(PI / 2), ax, 0.026, az, 0xc0703a, 0.6);
    p.add(new THREE.CylinderGeometry(0.008, 0.012, 0.024, 6).rotateZ(PI / 2), ax + 0.04 * Math.cos(0.6), 0.026, az - 0.04 * Math.sin(0.6), 0xb0602e, 0.6);
    stones(p, RX, RZ, vv, PI * 1.5, PI * 2.1, 5);
    return;
  }
  if (a === 2) {
    // le Moyen Âge : la mare aux canards, sa cabane sur pilotis et son ponton de planches
    duck(p, -0.08, 0.016, 0.05, 0.8, true);
    duck(p, -0.02, 0.016, 0.12, 1.2, false);
    duck(p, 0.1, 0.016, -0.06, -2.2, true);
    const [hx, hz] = rim(RX, RZ, vv, PI * 1.6, 0.72);
    for (const [dx, dz] of [[-0.022, -0.02], [0.022, -0.02], [-0.022, 0.02], [0.022, 0.02]]) p.cyl(0.005, 0.005, 0.07, 4, hx + dx, 0.01, hz + dz, WOOD2);
    p.box(0.07, 0.006, 0.07, hx, 0.075, hz, WOOD);
    p.box(0.056, 0.04, 0.05, hx, 0.081, hz, 0xa07a50);
    p.gable(0.07, 0.03, 0.066, hx, 0.121, hz, 0x8a4a2a);
    p.box(0.016, 0.018, 0.004, hx, 0.085, hz + 0.026, 0x2a1e14);
    p.add(new THREE.BoxGeometry(0.014, 0.004, 0.06).rotateX(0.55), hx, 0.05, hz + 0.055, WOOD);
    // le ponton : des planches sur deux pieux, qui avancent sur l'eau
    // (de la berge vers le milieu : `u` le long du rayon, les planches en travers)
    const t = PI * 0.15, [px, pz] = rim(RX, RZ, vv, t, 1.0), ct = Math.cos(t), st = Math.sin(t);
    for (let k = 0; k < 5; k++) { const u = 0.015 + k * 0.03; p.box(0.026, 0.008, 0.075, px - ct * u, 0.022, pz - st * u, dk(WOOD, 0.9 + H(k, 8) * 0.2), -t); }
    for (const u of [0.04, 0.13]) for (const e of [-1, 1]) p.cyl(0.005, 0.005, 0.03, 5, px - ct * u - st * e * 0.032, 0.0, pz - st * u + ct * e * 0.032, WOOD2);
    stones(p, RX, RZ, vv, PI * 0.7, PI * 1.2, 4);
    return;
  }
  // l'époque moderne : bassin paysager, pas japonais de pierre plate, grand rocher moussu, carpes koï
  for (let k = 0; k < 4; k++) { const u = -0.27 + k * 0.17; p.add(new THREE.CylinderGeometry(0.05, 0.054, 0.016, 7).scale(1, 1, 0.8), u, 0.012, -0.02 + Math.sin(k * 1.7) * 0.05, dk(0xb8b4ac, 0.92 + H(k, 7) * 0.1), k); }
  const [bx, bz] = rim(RX, RZ, vv, PI * 1.25, 1.02);
  p.add(new THREE.DodecahedronGeometry(0.075, 0).scale(1.1, 0.75, 0.9), bx, 0.03, bz, 0x9a968c, 0.4);
  p.add(new THREE.DodecahedronGeometry(0.05, 0).scale(1, 0.35, 0.9), bx - 0.01, 0.068, bz + 0.01, 0x6f8a4a, 1.2);
  for (const [x, z, ry, c] of [[0.1, 0.1, 0.5, 0xf28a2a], [-0.14, 0.08, 2.4, 0xf4f0e8], [0.05, -0.12, -1.2, 0xe85a3a]] as [number, number, number, number][]) fish(p, x, 0.0172, z, ry, c, 0xf4f0e8, 0.04);
  stones(p, RX, RZ, vv, PI * 0.1, PI * 0.6, 4, 0xb0aca4, 0.026);
}

/** L'âge industriel : un bassin de jardin, sa margelle de pierre taillée, une petite fontaine en jet, des poissons rouges */
function pondGarden(p: Parts, vv: number) {
  const R = 0.34;
  // (le socle reste sous l'eau : seule la margelle dépasse)
  p.add(new THREE.CylinderGeometry(R + 0.05, R + 0.06, 0.02, 16), 0, 0.01, 0, 0xb4ada0);
  p.add(new THREE.TorusGeometry(R + 0.024, 0.024, 4, 24).rotateX(PI / 2), 0, 0.034, 0, 0xc8c0b0);
  water(p, R, R, vv, 0.024, [0x6ab4c4, 0x4a96b0, 0x2f7494], 0.15);
  // une vasque basse au milieu, d'où monte un filet d'eau
  p.cyl(0.03, 0.04, 0.05, 8, 0, 0.03, 0, 0xc8c0b0);
  p.cyl(0.07, 0.03, 0.02, 10, 0, 0.08, 0, 0xc8c0b0); p.cyl(0.06, 0.06, 0.003, 10, 0, 0.098, 0, 0x6ab4c4);
  p.cyl(0.003, 0.006, 0.06, 4, 0, 0.1, 0, 0xd8f2fa); p.sphere(0.008, 0, 0.16, 0, 0xf2fbff);
  for (let k = 0; k < 4; k++) { const t = (k / 4) * PI * 2 + 0.4; lily(p, Math.cos(t) * 0.2, 0.0275, Math.sin(t) * 0.2, 0.034, t, k % 2 ? 0xf6c2d6 : null); }
  for (let k = 0; k < 4; k++) { const t = (k / 4) * PI * 2 + 1.2; fish(p, Math.cos(t) * 0.13, 0.0272, Math.sin(t) * 0.13, t + PI / 2, 0xf27a1a, 0xf2a84a, 0.032); }
  // deux touffes d'iris d'eau dans les angles, et deux pots de fleurs sur la margelle
  for (const t of [0.8, 3.9]) reeds(p, Math.cos(t) * 0.25, Math.sin(t) * 0.25, Math.round(t * 10), 7, 0.13);
  for (const t of [2.2, 5.4]) { const x = Math.cos(t) * (R + 0.02), z = Math.sin(t) * (R + 0.02); p.cyl(0.026, 0.02, 0.04, 8, x, 0.06, z, 0xb8603a); p.sphere(0.028, x, 0.11, z, 0x5f9a52, 1, 0.8); for (let j = 0; j < 4; j++) p.sphere(0.008, x + Math.cos(j * 1.6) * 0.018, 0.13, z + Math.sin(j * 1.6) * 0.018, 0xe85a6a); }
}

/** Le futur : un bassin aux bords fluides, rebord blanc et liseré de lumière, nénuphars lumineux, galets clairs */
function pondLight(p: Parts, vv: number) {
  const RX = 0.35, RZ = 0.31;
  p.add(blob(RX + 0.07, RZ + 0.07, vv, 28, 0.6), 0, 0.012, 0, WHITE);
  p.add(blob(RX + 0.03, RZ + 0.03, vv, 28, 0.6), 0, 0.0135, 0, NEON, 0, 'neon');
  water(p, RX, RZ, vv, 0.016, [0x6ad0e0, 0x3aa8c8, 0x1f6a9a], 0.6);
  for (let k = 0; k < 5; k++) { const t = 0.6 + k * 1.25, [x, z] = rim(RX, RZ, vv, t, 0.55); lily(p, x, 0.0195, z, 0.034, t * 2, k % 2 ? 0x9adcff : 0xffa8e0, true); }
  for (let k = 0; k < 7; k++) { const t = PI * 1.1 + k * 0.18, [x, z] = rim(RX, RZ, vv, t, 1.18); p.add(new THREE.IcosahedronGeometry(0.02, 0).scale(1, 0.5, 0.8), x, 0.014, z, 0xe8eef2, t); }
  // un roseau de lumière : trois tiges blanches et leurs perles qui brillent la nuit
  const [rx, rz] = rim(RX, RZ, vv, 0.5, 1.08);
  for (let k = 0; k < 3; k++) { const x = rx + (k - 1) * 0.022, h = 0.13 + k * 0.03; p.cyl(0.003, 0.004, h, 4, x, 0.012, rz, WHITE); p.add(new THREE.IcosahedronGeometry(0.009, 0), x, 0.012 + h, rz, NEON, 0, 'neon'); }
}

/** Le bassin à coraux : eau de mer claire, coraux qui affleurent, poissons du récif ; au futur, le récif sous verre */
export function coralModel(p: Parts, age: number, v: number) {
  const fut = age >= 5, R = 0.36;
  // le bassin : un rebord de pierre claire (de verre et de blanc au futur), le fond de sable qu'on devine au bord
  // (le socle s'arrête sous l'eau : le rebord en tore dépasse seul)
  p.add(new THREE.CylinderGeometry(R + 0.06, R + 0.07, 0.06, 18), 0, 0.03, 0, fut ? WHITE : 0xd8d0c0);
  p.add(new THREE.TorusGeometry(R + 0.03, 0.026, 4, 28).rotateX(PI / 2), 0, 0.072, 0, fut ? 0xdde6ec : 0xe8e0d0);
  if (fut) p.add(new THREE.TorusGeometry(R + 0.058, 0.006, 3, 32).rotateX(PI / 2), 0, 0.06, 0, NEON, 0, 'neon');
  p.add(new THREE.CylinderGeometry(R, R, 0.004, 18), 0, 0.062, 0, 0xe8dcb8);
  p.add(blob(R - 0.03, R - 0.03, v, 20, 0.3), 0, 0.066, 0, SEA);
  p.add(blob(R * 0.6, R * 0.55, v + 1, 16, 0.6), 0.03, 0.0667, -0.02, SEA2);
  const Y = 0.066;
  // les coraux : branches (le corne de cerf), éventails, boules (le cerveau), en couleurs vives
  const COL = [0xf26a5a, 0xf2a83a, 0xb05ad8, 0xf27ab8, 0xe8d24a, 0x5ad8b8];
  const spots: [number, number][] = [[-0.18, -0.12], [0.16, -0.16], [0.2, 0.12], [-0.12, 0.18], [0.0, 0.02], [-0.24, 0.04], [0.06, 0.22], [-0.04, -0.24], [0.25, -0.02], [-0.2, 0.22]];
  spots.forEach(([x, z], i) => {
    const c = COL[(i + v) % COL.length], kind = (i + v) % 3;
    if (kind === 0) {
      // corne de cerf : un tronc court et des branches qui montent en s'écartant
      p.cyl(0.011, 0.016, 0.03, 5, x, Y - 0.01, z, dk(c, 0.85));
      for (let k = 0; k < 7; k++) { const a = (k / 7) * PI * 2 + i, h = 0.045 + H(i, k) * 0.04; p.add(new THREE.CylinderGeometry(0.005, 0.009, h, 4).translate(0, h / 2, 0), x + Math.cos(a) * 0.01, Y + 0.012, z + Math.sin(a) * 0.01, c, 0, false, Math.cos(a) * 0.6, -Math.sin(a) * 0.6); p.sphere(0.008, x + Math.cos(a) * (0.014 + h * 0.55), Y + 0.012 + h * 0.83, z + Math.sin(a) * (0.014 + h * 0.55), dk(c, 1.15)); }
    } else if (kind === 1) {
      // l'éventail de mer, dressé, et sa résille plus claire
      // (une face de chaque côté : une forme plate ne se voit que de face)
      for (const back of [0, PI]) {
        // (penché en arrière, pour qu'on le voie d'en haut)
        p.add(new THREE.CircleGeometry(0.062, 9, 0, PI), x, Y - 0.005, z, c, i * 0.9 + back, false, 0, back ? 0.65 : -0.65);
        p.add(new THREE.CircleGeometry(0.04, 7, 0, PI).translate(0, 0, 0.001), x, Y - 0.004, z, dk(c, 1.2), i * 0.9 + back, false, 0, back ? 0.65 : -0.65);
      }
      p.cyl(0.004, 0.006, 0.012, 4, x, Y - 0.006, z, dk(c, 0.7));
    } else {
      // le corail cerveau : une boule ridée à demi sortie de l'eau, et ses petits voisins
      p.add(new THREE.IcosahedronGeometry(0.048, 1).scale(1, 0.6, 1), x, Y, z, c);
      for (let k = 0; k < 3; k++) p.add(new THREE.TorusGeometry(0.03 - k * 0.008, 0.0035, 3, 12).rotateX(PI / 2), x, Y + 0.023 - k * 0.002, z, dk(c, 0.8));
      p.sphere(0.014, x + 0.04, Y + 0.002, z + 0.01, COL[(i + 2) % COL.length], 1, 0.7);
    }
  });
  // une anémone et son poisson-clown, une étoile de mer sur le rebord, des poissons du récif à fleur d'eau
  p.cyl(0.024, 0.02, 0.012, 8, 0.08, Y - 0.004, -0.06, 0xe86aa8);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2; p.cyl(0.003, 0.004, 0.02, 3, 0.08 + Math.cos(a) * 0.016, Y + 0.006, -0.06 + Math.sin(a) * 0.016, 0xf6a8d0); }
  fish(p, 0.11, Y + 0.012, -0.03, 0.6, 0xf28a1a, WHITE, 0.03);
  fish(p, -0.06, Y + 0.002, -0.2, 2.2, 0xf2d82a, 0x2a2a3a, 0.034);
  fish(p, -0.2, Y + 0.002, 0.1, -0.8, 0x3a7af2, 0xf2d82a, 0.03);
  fish(p, 0.22, Y + 0.002, 0.0, 1.9, 0xf2d82a, 0xf2d82a, 0.026);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * PI * 2; p.add(new THREE.ConeGeometry(0.008, 0.026, 3).rotateZ(-PI / 2).translate(0.014, 0, 0), -0.28, 0.08, 0.2, 0xe8783a, a + 0.3); }
  p.sphere(0.008, -0.28, 0.082, 0.2, 0xd8602a);
  if (fut) {
    // le récif sous verre : quatre arceaux de lumière au-dessus du bassin, et des bulles qui montent
    for (let k = 0; k < 2; k++) p.add(new THREE.TorusGeometry(R * 0.9, 0.005, 3, 24, PI), 0, 0.066, 0, NEON, (k * PI) / 2, 'neon');
    for (let k = 0; k < 6; k++) p.sphere(0.008 + (k % 3) * 0.003, -0.05 + (k % 3) * 0.05, 0.1 + k * 0.025, 0.04 - (k % 2) * 0.06, 0xd8f6ff);
  }
}
