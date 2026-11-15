import * as THREE from 'three';
import { Parts } from '../parts';
import type { WarshipKind } from '../../sim/navalConflict';
import type { WarshipModel } from '../warships';

/**
 * Les navires de guerre du peuple oriental, par âge (voir `warships.ts`) : galère à éperon, boutre (sambouk) à deux voiles
 * latines, frégate à trois mâts et batterie, vapeur cuirassé à casemate, vedette lance-roquettes, vedette à coussin d'air et
 * ses drones. Bois clair et miel, turquoise, blanc et laiton. Coques à facettes, dessinées couple par couple ; voiles bombées,
 * gréement, matelots à turban. Proue vers +z, flottaison à y = 0, environ une case de long
 */

const TURQ = 0x2fa8a0, TURQ_D = 0x1f7470, BRASS = 0xd8a840, WHITE = 0xf2ece0, SAIL = 0xf4ecd8, SAIL2 = 0xe8dcc0;
const HONEY = 0xa8743e, WOOD = 0x8a5a32, DARK = 0x4a3426, DECK = 0xc4a272, ROPE = 0x6a5236, IRON = 0x3a3c40, TAR = 0x2e2620;
const WIN = 0xffd890, LIGHT = 0x4af0d8;

// ---------- Outils ----------

type V3 = [number, number, number];

/** Géométrie de triangles, chacun retourné au besoin pour que sa face regarde du côté que choisit `out(centre, normale)` */
function triGeo(tris: V3[][], out: (c: THREE.Vector3, n: THREE.Vector3) => boolean) {
  const pos: number[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (const t of tris) {
    a.set(...t[0]); b.set(...t[1]); c.set(...t[2]);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    const ctr = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
    const ok = out(ctr, n);
    pos.push(...(ok ? [...t[0], ...t[1], ...t[2]] : [...t[0], ...t[2], ...t[1]]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return g;
}

interface HullOpts {
  L: number; B: number;
  /** creux sous la flottaison, hauteur du plat-bord au milieu, tonture à l'avant et à l'arrière */
  depth: number; top: number; bow: number; stern: number;
  /** largeur du tableau arrière (part de la largeur), finesse de l'avant (plus grand : plus effilé) */
  transom: number; fine: number;
  under: number; side: number; band?: number; deck: number; inner: number;
}

/**
 * Coque à facettes : des couples de l'arrière à l'avant, chacun un V à cinq points (quille, deux bouchains à la flottaison,
 * deux plats-bords), le plat-bord qui remonte vers l'étrave et la poupe. Œuvres vives et œuvres mortes de deux couleurs, un
 * liseré, le pont un peu sous le plat-bord (pavois sombre dedans), le tableau arrière fermé. Rend la hauteur du plat-bord en z
 */
function shipHull(p: Parts, o: HullOpts) {
  const n = 9, st: { z: number; b: number; g: number; k: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = -o.L / 2 + o.L * t;
    const b = (o.B / 2) * (t < 0.4 ? o.transom + (1 - o.transom) * Math.sin((t / 0.4) * Math.PI / 2) : Math.pow(Math.cos(((t - 0.4) / 0.6) * Math.PI / 2), 1 / o.fine));
    st.push({ z, b: Math.max(0, b), g: o.top + o.bow * t * t * t + o.stern * Math.pow(1 - t, 3), k: -o.depth * (1 - 0.5 * Math.pow(t, 4)) });
  }
  const P = (s: typeof st[0], j: number): V3 => {
    const pts: [number, number][] = [[-s.b, s.g], [-s.b * 0.92, 0], [0, s.k], [s.b * 0.92, 0], [s.b, s.g]];
    return [pts[j][0], pts[j][1], s.z];
  };
  const under: V3[][] = [], side: V3[][] = [], deck: V3[][] = [], inner: V3[][] = [];
  const dk = 0.022;
  for (let i = 0; i < n; i++) {
    const a = st[i], b = st[i + 1];
    for (let j = 0; j < 4; j++) {
      const q = [P(a, j), P(a, j + 1), P(b, j + 1), P(b, j)], to = j === 1 || j === 2 ? under : side;
      to.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
    }
    const L0: V3 = [-a.b * 0.96, a.g - dk, a.z], R0: V3 = [a.b * 0.96, a.g - dk, a.z], L1: V3 = [-b.b * 0.96, b.g - dk, b.z], R1: V3 = [b.b * 0.96, b.g - dk, b.z];
    deck.push([L0, R0, R1], [L0, R1, L1]);
    for (const sg of [-1, 1]) {
      const u0: V3 = [sg * a.b * 0.97, a.g, a.z], u1: V3 = [sg * b.b * 0.97, b.g, b.z], d0: V3 = [sg * a.b * 0.96, a.g - dk, a.z], d1: V3 = [sg * b.b * 0.96, b.g - dk, b.z];
      inner.push([d0, u0, u1], [d0, u1, d1]);
    }
  }
  // le tableau arrière
  const s0 = st[0], tp = [0, 1, 2, 3, 4].map((j) => P(s0, j));
  const transom: V3[][] = [[tp[0], tp[1], tp[2]], [tp[0], tp[2], tp[4]], [tp[2], tp[3], tp[4]]];
  const outward = (c: THREE.Vector3, nn: THREE.Vector3) => nn.x * c.x + nn.y * (c.y - 0.02) * 0.6 > 0;
  p.add(triGeo(under, outward), 0, 0, 0, o.under);
  p.add(triGeo(side, outward), 0, 0, 0, o.side);
  p.add(triGeo(transom, (_c, nn) => nn.z < 0), 0, 0, 0, o.side);
  p.add(triGeo(deck, (_c, nn) => nn.y > 0), 0, 0, 0, o.deck);
  p.add(triGeo(inner, (c, nn) => nn.x * c.x < 0), 0, 0, 0, o.inner);
  // le liseré sous le plat-bord, et le plat-bord lui-même
  if (o.band !== undefined) {
    const band: V3[][] = [];
    for (let i = 0; i < n; i++) {
      const a = st[i], b = st[i + 1];
      for (const sg of [-1, 1]) {
        const f = 1.004, A0: V3 = [sg * a.b * f, a.g - 0.005, a.z], A1: V3 = [sg * a.b * 0.985 * f, a.g - 0.035, a.z], B0: V3 = [sg * b.b * f, b.g - 0.005, b.z], B1: V3 = [sg * b.b * 0.985 * f, b.g - 0.035, b.z];
        band.push([A0, A1, B1], [A0, B1, B0]);
      }
    }
    p.add(triGeo(band, outward), 0, 0, 0, o.band);
  }
  return (z: number) => { const t = Math.min(1, Math.max(0, (z + o.L / 2) / o.L)); return o.top + o.bow * t * t * t + o.stern * Math.pow(1 - t, 3); };
}

/** Un espar (ou un cordage) entre deux points, dans l'espace du navire */
function rod(p: Parts, a: V3, b: V3, r: number, col: number) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), l = d.length();
  if (l < 1e-4) return;
  const g = new THREE.CylinderGeometry(r, r, l, r > 0.006 ? 5 : 3, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  p.add(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, col);
}

/** Voile triangulaire bombée (vue des deux bords) : coins a, b, c ; le ventre gonfle vers +x de `belly` */
function sail3(p: Parts, a: V3, b: V3, c: V3, col: number, belly = 0.03, stripe?: number) {
  const m: V3 = [(a[0] + b[0] + c[0]) / 3 + belly, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  const t = [[a, b, m], [b, c, m], [c, a, m]] as V3[][];
  const both = [...t, ...t.map((x) => [x[0], x[2], x[1]] as V3[])];
  p.add(triGeo(both, () => true), 0, 0, 0, col);
  if (stripe !== undefined) {
    // une laize de couleur le long de l'antenne
    const k = 0.12, a2: V3 = [a[0] + (c[0] - a[0]) * k + 0.002, a[1] + (c[1] - a[1]) * k, a[2] + (c[2] - a[2]) * k], b2: V3 = [b[0] + (c[0] - b[0]) * k + 0.002, b[1] + (c[1] - b[1]) * k, b[2] + (c[2] - b[2]) * k];
    const s = [[a, b, b2], [a, b2, a2]] as V3[][];
    p.add(triGeo([...s, ...s.map((x) => [x[0], x[2], x[1]] as V3[])], () => true), 0.003, 0, 0, stripe);
  }
}

/** Voile carrée bombée sur sa vergue : largeur w, chute h, centre haut (y, z) */
function squareSail(p: Parts, w: number, h: number, y: number, z: number, col: number, belly = 0.025) {
  const g = new THREE.PlaneGeometry(w, h, 2, 2), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const u = pos.getX(i) / (w / 2), v = pos.getY(i) / (h / 2); pos.setZ(i, belly * (1 - u * u) * (1 - v * v * 0.6)); }
  g.translate(0, -h / 2, 0);
  p.add(g, 0, y, z, col);
  p.add(g.clone().rotateY(Math.PI), 0, y, z, col);
}

/** Matelot : robe, ceinture, tête, turban (ou casque, casquette) */
function sailor(p: Parts, x: number, y: number, z: number, robe: number, hat = WHITE, ry = 0) {
  p.add(new THREE.CylinderGeometry(0.009, 0.014, 0.045, 5).translate(0, 0.0225, 0), x, y, z, robe, ry);
  p.add(new THREE.CylinderGeometry(0.0105, 0.0105, 0.006, 5), x, y + 0.03, z, BRASS);
  p.add(new THREE.OctahedronGeometry(0.0095), x, y + 0.054, z, 0xb07a52);
  p.add(new THREE.CylinderGeometry(0.008, 0.011, 0.01, 5), x, y + 0.064, z, hat);
}

/** Pavillon turquoise à bande blanche en haut d'un mât */
function flag(p: Parts, y: number, z: number, w = 0.09) {
  p.box(0.004, w * 0.6, w, 0, y, z - w / 2, TURQ);
  p.box(0.005, w * 0.16, w, 0, y + w * 0.22, z - w / 2, WHITE);
}

/** Ballots, jarres et tonneaux sur le pont */
function cargo(p: Parts, y: number, z0: number, n: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const x = ((i % 2) - 0.5) * 0.06, z = z0 + Math.floor(i / 2) * 0.05;
    if ((i + seed) % 3 === 0) p.cyl(0.016, 0.018, 0.04, 6, x, y, z, 0x8a5a32);
    else p.box(0.04, 0.03, 0.035, x, y, z, [0xc9a26a, 0xb07a4a, 0xb8483a, 0xe3d2a8][(i + seed) % 4]);
  }
}

/** Banc de rames (côté +x) : neuf rames, pelle au bout, depuis le plat-bord vers l'eau */
function oarBank(): THREE.BufferGeometry {
  const p = new Parts();
  for (let k = 0; k < 9; k++) {
    const z = -0.32 + k * 0.08;
    p.add(new THREE.BoxGeometry(0.3, 0.007, 0.007).translate(0.15, 0, 0), 0, 0, z, 0x8a6a44, 0, false, -0.42);
    p.add(new THREE.BoxGeometry(0.06, 0.004, 0.026).translate(0.3, 0, 0), 0, 0, z, TURQ, 0, false, -0.42);
  }
  return p.build(false).body;
}

// ---------- Les navires ----------

function galley(p: Parts): Partial<WarshipModel> {
  const gw = shipHull(p, { L: 0.92, B: 0.2, depth: 0.05, top: 0.07, bow: 0.06, stern: 0.12, transom: 0.4, fine: 1.4, under: DARK, side: HONEY, band: TURQ, deck: DECK, inner: WOOD });
  // éperon de bronze à la flottaison, étambot recourbé en volute, à la pointe de laiton
  p.add(new THREE.ConeGeometry(0.028, 0.16, 4).rotateX(Math.PI / 2), 0, -0.01, 0.53, BRASS);
  rod(p, [0, 0.17, -0.46], [0, 0.3, -0.52], 0.016, HONEY); rod(p, [0, 0.3, -0.52], [0, 0.32, -0.45], 0.012, HONEY); p.sphere(0.016, 0, 0.32, -0.45, BRASS);
  // l'œil peint à la proue, les boucliers turquoise et laiton le long des plats-bords
  for (const s of [-1, 1]) { p.add(new THREE.CircleGeometry(0.014, 6).rotateY(s * Math.PI / 2 - s * 0.35), s * 0.045, 0.06, 0.36, WHITE); p.add(new THREE.CircleGeometry(0.007, 5).rotateY(s * Math.PI / 2 - s * 0.35), s * 0.047, 0.06, 0.362, TAR); }
  for (let k = 0; k < 7; k++) for (const s of [-1, 1]) {
    const z = -0.28 + k * 0.09, y = gw(z) + 0.012;
    p.add(new THREE.CylinderGeometry(0.024, 0.024, 0.008, 8).rotateZ(Math.PI / 2), s * 0.1, y, z, k % 2 ? TURQ : WHITE);
    p.add(new THREE.CylinderGeometry(0.007, 0.007, 0.01, 5).rotateZ(Math.PI / 2), s * 0.104, y, z, BRASS);
  }
  // la tente du capitaine à la poupe, le mât et sa voile carrée rayée
  p.box(0.13, 0.06, 0.12, 0, 0.08, -0.3, WOOD); frustum4(p, 0.15, 0.14, 0.04, 0, 0.14, -0.3, TURQ);
  p.cyl(0.008, 0.011, 0.56, 5, 0, 0.07, 0.04, DARK);
  rod(p, [-0.22, 0.54, 0.05], [0.22, 0.54, 0.05], 0.007, DARK);
  for (let k = 0; k < 4; k++) squareSail(p, 0.4, 0.085, 0.53 - k * 0.085, 0.055, k % 2 ? TURQ : SAIL, 0.02);
  for (const s of [-1, 1]) { rod(p, [0, 0.6, 0.04], [s * 0.09, 0.09, 0.04], 0.002, ROPE); rod(p, [0, 0.6, 0.04], [0, 0.12, 0.42], 0.002, ROPE); }
  flag(p, 0.66, 0.04, 0.07);
  // le timonier, le chef de nage, deux archers
  sailor(p, 0, 0.14, -0.4, 0x6a4a8a); sailor(p, 0, 0.09, 0.2, TURQ_D); sailor(p, 0.04, 0.09, 0.3, 0x8a3a2a); sailor(p, -0.04, 0.09, -0.12, 0x8a3a2a);
  return { oars: oarBank(), oarAt: [0.1, 0.06, 0], muzzles: [[0.05, 0.16, 0.3], [-0.05, 0.16, -0.12], [0.06, 0.16, 0.1], [-0.06, 0.2, -0.36]] };
}

/** Tronc de pyramide carré (tente, rouf) : base w × d, sommet en arête, posé en y */
function frustum4(p: Parts, w: number, d: number, h: number, x: number, y: number, z: number, col: number) {
  p.add(new THREE.ConeGeometry(0.70711, 1, 4, 1).rotateY(Math.PI / 4).scale(w, h, d).translate(0, h / 2, 0), x, y, z, col);
}

function dhow(p: Parts): Partial<WarshipModel> {
  const gw = shipHull(p, { L: 0.84, B: 0.23, depth: 0.07, top: 0.09, bow: 0.12, stern: 0.12, transom: 0.72, fine: 1.2, under: 0xe8e0cc, side: HONEY, band: TURQ, deck: DECK, inner: WOOD });
  // la longue étrave en bec, et le tableau arrière haut, sculpté, à fenêtres et galerie
  rod(p, [0, 0.12, 0.4], [0, 0.3, 0.56], 0.016, HONEY); p.box(0.012, 0.03, 0.03, 0, 0.29, 0.55, TURQ);
  const sz = -0.42, sy = gw(sz);
  p.box(0.17, 0.11, 0.012, 0, sy - 0.06, sz - 0.004, WOOD);
  p.box(0.15, 0.045, 0.006, 0, sy - 0.04, sz - 0.012, TURQ);
  for (let k = 0; k < 3; k++) p.box(0.03, 0.025, 0.006, -0.045 + k * 0.045, sy - 0.035, sz - 0.016, WIN, 0, true);
  p.add(new THREE.CircleGeometry(0.03, 8, 0, Math.PI).rotateY(Math.PI), 0, sy + 0.045, sz - 0.008, BRASS);
  // la dunette : plancher haut sur l'arrière, garde-corps à balustres, la barre et le timonier
  const py = sy - 0.005;
  p.box(0.2, 0.012, 0.2, 0, py, -0.31, DECK);
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) p.box(0.006, 0.035, 0.006, s * 0.095, py + 0.012, -0.39 + k * 0.04, WHITE);
  for (const s of [-1, 1]) p.box(0.006, 0.006, 0.2, s * 0.095, py + 0.047, -0.31, TURQ);
  p.add(new THREE.TorusGeometry(0.022, 0.004, 3, 8), 0, py + 0.05, -0.27, DARK);
  sailor(p, 0, py + 0.012, -0.33, 0x6a4a8a);
  // le grand mât penché vers l'avant, l'artimon ; voiles latines blanches à laize turquoise sur leurs longues antennes
  const m1: V3 = [0, 0.86, 0.17], m2: V3 = [0, 0.56, -0.22];
  rod(p, [0, 0.08, 0.1], m1, 0.011, DARK); rod(p, [0, py, -0.25], m2, 0.008, DARK);
  const y1a: V3 = [0.02, 0.17, 0.56], y1b: V3 = [0.02, 0.92, -0.2], y2a: V3 = [0.02, 0.2, -0.04], y2b: V3 = [0.02, 0.6, -0.48];
  rod(p, y1a, y1b, 0.007, DARK); rod(p, y2a, y2b, 0.006, DARK);
  sail3(p, [0.024, 0.18, 0.54], [0.024, 0.9, -0.18], [0.02, 0.14, -0.12], SAIL, 0.05, TURQ);
  sail3(p, [0.022, 0.21, -0.06], [0.022, 0.58, -0.46], [0.02, py + 0.04, -0.4], SAIL2, 0.035, TURQ);
  // le gréement : haubans, drisses, écoutes
  for (const s of [-1, 1]) { rod(p, m1, [s * 0.11, gw(0.05), 0.05], 0.0022, ROPE); rod(p, m1, [s * 0.11, gw(0.25), 0.25], 0.0022, ROPE); rod(p, m2, [s * 0.1, gw(-0.2), -0.2], 0.002, ROPE); }
  rod(p, m1, [0, 0.27, 0.54], 0.002, ROPE); rod(p, [0.02, 0.14, -0.12], [0.08, gw(-0.15), -0.15], 0.002, ROPE);
  // le pont : ballots, jarres, une chaloupe retournée, les matelots
  cargo(p, gw(0.0) - 0.02, -0.08, 6, 1);
  p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 6, 1, false, 0, Math.PI).rotateX(Math.PI / 2).scale(1, 0.6, 1), 0, gw(0.3) - 0.02, 0.28, WOOD);
  sailor(p, 0.05, gw(0.1) - 0.02, 0.12, TURQ_D); sailor(p, -0.05, gw(0.2) - 0.02, 0.22, WHITE, 0x8a3a2a); sailor(p, 0.04, gw(-0.15) - 0.02, -0.17, 0x8a3a2a);
  flag(p, 0.6, -0.22, 0.07);
  p.box(0.004, 0.03, 0.12, 0, 0.95, -0.12, TURQ);
  p.box(0.025, 0.035, 0.025, 0, sy + 0.08, sz + 0.02, WIN, 0, true);
  return { muzzles: [[0.06, 0.16, 0.25], [-0.06, 0.16, 0.05], [0.06, 0.22, -0.3], [-0.06, 0.22, -0.34]] };
}

function frigate(p: Parts): Partial<WarshipModel> {
  const gw = shipHull(p, { L: 0.98, B: 0.25, depth: 0.09, top: 0.11, bow: 0.06, stern: 0.08, transom: 0.78, fine: 1.1, under: 0x2e2a24, side: 0x3a2a20, band: TURQ, deck: DECK, inner: WOOD });
  // la batterie : une bande blanche, ses sabords et les bouches de canon, des deux bords
  const muzzles: V3[] = [];
  for (const s of [-1, 1]) {
    p.add(new THREE.PlaneGeometry(0.82, 0.04).rotateY(s * Math.PI / 2), s * 0.123, 0.06, 0, WHITE);
    for (let k = 0; k < 8; k++) {
      const z = -0.33 + k * 0.09;
      p.add(new THREE.PlaneGeometry(0.026, 0.024).rotateY(s * Math.PI / 2), s * 0.125, 0.06, z, 0x141210);
      p.add(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 6, 1, true).rotateZ(Math.PI / 2), s * 0.135, 0.06, z, IRON);
      if (k % 2) muzzles.push([s * 0.15, 0.06, z]);
    }
  }
  // le gaillard d'arrière, la galerie de poupe à fenêtres éclairées, l'écusson doré
  const sz = -0.49, sy = gw(sz);
  p.box(0.22, 0.05, 0.22, 0, sy - 0.03, -0.37, 0x5a3a26); p.box(0.23, 0.01, 0.23, 0, sy + 0.02, -0.37, DECK);
  for (let k = 0; k < 5; k++) p.box(0.026, 0.026, 0.006, -0.07 + k * 0.035, sy - 0.04, sz - 0.002, WIN, 0, true);
  p.box(0.2, 0.012, 0.03, 0, sy - 0.06, sz - 0.01, BRASS);
  p.add(new THREE.CircleGeometry(0.025, 8).rotateY(Math.PI), 0, sy + 0.02, sz - 0.005, BRASS);
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) p.box(0.005, 0.03, 0.005, s * 0.105, sy + 0.025, -0.47 + k * 0.04, WHITE);
  // le beaupré, trois mâts, deux étages de voiles carrées blanches à bande turquoise, l'artimon latin
  rod(p, [0, 0.14, 0.42], [0, 0.3, 0.68], 0.009, DARK);
  sail3(p, [0.002, 0.29, 0.66], [0.002, 0.62, 0.3], [0.002, 0.15, 0.4], SAIL, 0.02);
  const masts: [number, number][] = [[0.27, 0.74], [0.03, 0.9], [-0.24, 0.64]];
  for (const [z, h] of masts) {
    p.cyl(0.009, 0.013, h, 5, 0, 0.1, z, DARK);
    p.cyl(0.02, 0.02, 0.01, 6, 0, 0.1 + h * 0.6, z, DARK);
    if (z < -0.1) { sail3(p, [0.004, 0.22, -0.08], [0.004, 0.66, -0.4], [0.004, 0.2, -0.42], SAIL, 0.025, TURQ); continue; }
    for (const [y, w, hh] of [[0.1 + h * 0.58, 0.34, 0.2], [0.1 + h * 0.95, 0.26, 0.16]] as [number, number, number][]) {
      squareSail(p, w, hh, y, z + 0.012, SAIL, 0.03);
      p.box(w * 1.08, 0.009, 0.009, 0, y, z + 0.01, DARK);
      p.box(w, 0.025, 0.004, 0, y - hh * 0.55, z + 0.035, TURQ);
    }
    for (const s of [-1, 1]) for (const k of [-0.05, 0.05]) rod(p, [0, 0.1 + h * 0.92, z], [s * 0.125, gw(z + k), z + k], 0.002, ROPE);
  }
  rod(p, [0, 1.0, 0.03], [0, 0.82, 0.27], 0.002, ROPE); rod(p, [0, 0.82, 0.27], [0, 0.3, 0.66], 0.002, ROPE);
  // le pont : canons de pont, cabestan, chaloupe, matelots et canonniers
  p.cyl(0.02, 0.024, 0.03, 6, 0, gw(0.15) - 0.02, 0.15, WOOD);
  p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 6, 1, false, 0, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.6, 1), 0, gw(-0.12), -0.12, WHITE);
  for (const [x, z, c] of [[0.06, 0.18, TURQ_D], [-0.06, 0.08, 0x8a3a2a], [0.07, -0.05, WHITE], [-0.05, 0.36, 0x6a4a8a]] as [number, number, number][]) sailor(p, x, gw(z) - 0.02, z, c, x > 0 ? WHITE : 0x2a6a8a);
  sailor(p, 0, sy + 0.025, -0.4, 0x6a4a8a, BRASS);
  flag(p, 1.06, 0.03);
  return { muzzles };
}

function ironclad(p: Parts): Partial<WarshipModel> {
  const gw = shipHull(p, { L: 0.92, B: 0.25, depth: 0.08, top: 0.05, bow: 0.02, stern: 0.02, transom: 0.7, fine: 0.9, under: 0x5a2a24, side: 0x6a6a64, band: TURQ, deck: 0x8a7a62, inner: 0x5a5a54 });
  p.add(new THREE.ConeGeometry(0.03, 0.14, 4).rotateX(Math.PI / 2), 0, -0.03, 0.5, IRON);
  // la casemate de sable aux flancs inclinés, ses sabords et ses rivets, le pont-promenade
  const cas = 0xc8b48a, y0 = gw(0) - 0.02;
  p.add(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 2.2), 0, y0 + 0.04, -0.03, cas);
  for (const s of [-1, 1]) for (const z of [-0.14, 0.0, 0.12]) p.add(new THREE.PlaneGeometry(0.03, 0.022).rotateY(s * Math.PI / 2).rotateZ(s * -0.35), s * 0.11, y0 + 0.04, z, 0x141210);
  p.box(0.15, 0.008, 0.36, 0, y0 + 0.08, -0.03, TURQ);
  for (let k = 0; k < 5; k++) p.box(0.006, 0.03, 0.006, 0.06, y0 + 0.088, -0.18 + k * 0.08, WHITE);
  // la tourelle avant à deux canons, la cheminée cerclée, la passerelle, le mât de signaux
  p.cyl(0.07, 0.075, 0.07, 12, 0, y0, 0.27, 0x8a8a82);
  p.cyl(0.072, 0.072, 0.012, 12, 0, y0 + 0.07, 0.27, TURQ);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.011, 0.012, 0.15, 6).rotateX(Math.PI / 2), s * 0.025, y0 + 0.04, 0.38, IRON);
  p.cyl(0.032, 0.036, 0.24, 8, 0, y0 + 0.08, -0.17, 0x2a2a2a);
  for (const y of [0.16, 0.28]) p.cyl(0.038, 0.038, 0.02, 8, 0, y0 + y, -0.17, y > 0.2 ? WHITE : TURQ);
  p.box(0.12, 0.05, 0.07, 0, y0 + 0.08, 0.1, WHITE); p.box(0.125, 0.015, 0.004, 0, y0 + 0.11, 0.136, 0x1e2a36);
  p.cyl(0.006, 0.008, 0.46, 5, 0, y0 + 0.13, 0.06, IRON); p.box(0.18, 0.007, 0.007, 0, y0 + 0.48, 0.06, IRON);
  for (const s of [-1, 1]) rod(p, [0, y0 + 0.55, 0.06], [s * 0.12, gw(0.0), 0.0], 0.002, ROPE);
  // deux chaloupes sur leurs bossoirs, les matelots
  for (const s of [-1, 1]) { p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 6, 1, false, 0, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.7, 1), s * 0.1, y0 + 0.06, -0.32, WHITE); rod(p, [s * 0.09, y0, -0.36], [s * 0.12, y0 + 0.1, -0.36], 0.003, IRON); }
  sailor(p, 0.04, y0 + 0.13, 0.1, 0x2a3a5a, WHITE); sailor(p, -0.06, y0, 0.2, 0x2a3a5a, WHITE); sailor(p, 0.06, y0, -0.38, 0x2a3a5a, WHITE);
  flag(p, y0 + 0.62, 0.06, 0.08);
  return { muzzles: [[0.025, y0 + 0.04, 0.46], [-0.025, y0 + 0.04, 0.46], [0.12, y0 + 0.04, -0.14], [-0.12, y0 + 0.04, 0.0]], funnel: [0, y0 + 0.33, -0.17] };
}

function launch(p: Parts): Partial<WarshipModel> {
  const gw = shipHull(p, { L: 0.8, B: 0.21, depth: 0.05, top: 0.07, bow: 0.05, stern: 0, transom: 0.85, fine: 0.8, under: 0x2f4f6f, side: 0xece6d8, band: TURQ, deck: 0x9aa0a6, inner: 0xd8d2c4 });
  const y0 = gw(0) - 0.02;
  // la timonerie à vitres sombres et à liseré turquoise, le mât radar, la tourelle avant, les roquettes à la poupe
  p.box(0.15, 0.08, 0.22, 0, y0, -0.04, 0xf2ece0);
  p.add(new THREE.BoxGeometry(0.13, 0.05, 0.12), 0, y0 + 0.08, 0.0, 0xf2ece0);
  p.box(0.135, 0.022, 0.004, 0, y0 + 0.1, 0.061, 0x1e2a36); for (const s of [-1, 1]) p.box(0.004, 0.022, 0.1, s * 0.066, y0 + 0.1, 0.0, 0x1e2a36);
  p.box(0.152, 0.012, 0.222, 0, y0 + 0.06, -0.04, TURQ);
  p.cyl(0.005, 0.006, 0.2, 5, 0, y0 + 0.13, -0.02, 0x8a8f96); p.box(0.1, 0.012, 0.02, 0, y0 + 0.29, -0.02, 0x8a8f96);
  p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 8), 0, y0 + 0.2, -0.02, WHITE);
  p.cyl(0.04, 0.045, 0.04, 8, 0, y0, 0.22, 0xf2ece0);
  p.add(new THREE.CylinderGeometry(0.008, 0.009, 0.12, 6).rotateX(Math.PI / 2), 0, y0 + 0.025, 0.3, IRON);
  p.add(new THREE.BoxGeometry(0.1, 0.05, 0.09), 0, y0 + 0.04, -0.26, 0x8a8a70, 0, false, 0, -0.35);
  for (const s of [-1, 1]) for (const t of [-1, 1]) p.add(new THREE.CylinderGeometry(0.011, 0.011, 0.004, 6).rotateX(Math.PI / 2 - 0.35), s * 0.025, y0 + 0.06 + t * 0.012, -0.215, 0x141414);
  // garde-corps, bouées, matelots en tenue
  for (const s of [-1, 1]) { p.box(0.004, 0.004, 0.5, s * 0.1, y0 + 0.05, 0.02, 0xc4c8cc); for (let k = 0; k < 6; k++) p.box(0.004, 0.05, 0.004, s * 0.1, y0, -0.22 + k * 0.09, 0xc4c8cc); }
  p.add(new THREE.TorusGeometry(0.018, 0.006, 4, 8).rotateY(Math.PI / 2), 0.077, y0 + 0.05, -0.1, 0xe0503a);
  sailor(p, 0.05, y0, 0.14, 0x2a3a5a, WHITE); sailor(p, -0.05, y0, -0.2, 0x2a3a5a, WHITE);
  p.box(0.004, 0.012, 0.6, 0.106, 0.035, 0.0, TURQ); p.box(0.004, 0.012, 0.6, -0.106, 0.035, 0.0, TURQ);
  flag(p, y0 + 0.36, -0.03, 0.06);
  return { muzzles: [[0, y0 + 0.025, 0.37], [0.025, y0 + 0.07, -0.2], [-0.025, y0 + 0.07, -0.2]] };
}

function hover(p: Parts): Partial<WarshipModel> {
  const skin = 0xf2ead8, trim = BRASS;
  // la jupe noire, la coque blanche profilée à liseré turquoise, la verrière en coupole, deux soufflantes carénées
  p.add(new THREE.CylinderGeometry(0.13, 0.14, 0.06, 16).scale(1, 1, 2.6), 0, 0.02, 0, 0x1a1a1e);
  p.add(new THREE.CylinderGeometry(0.11, 0.125, 0.06, 16).scale(1, 1, 2.6), 0, 0.07, 0, skin);
  p.add(new THREE.CylinderGeometry(0.112, 0.112, 0.012, 16, 1, true).scale(1, 1, 2.6), 0, 0.085, 0, TURQ);
  p.add(new THREE.SphereGeometry(0.07, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1.5), 0, 0.13, 0.1, 0x1e3a5a);
  p.add(new THREE.TorusGeometry(0.07, 0.006, 3, 12).rotateX(Math.PI / 2).scale(1, 1, 1.5), 0, 0.13, 0.1, trim);
  for (const s of [-1, 1]) p.box(0.004, 0.006, 0.5, s * 0.122, 0.08, 0, LIGHT, 0, 'neon');
  p.box(0.2, 0.012, 0.06, 0, 0.1, 0.28, trim);
  for (const s of [-1, 1]) {
    p.add(new THREE.TorusGeometry(0.05, 0.012, 6, 12), s * 0.065, 0.15, -0.3, skin);
    p.add(new THREE.TorusGeometry(0.05, 0.004, 3, 12), s * 0.065, 0.15, -0.288, TURQ);
    p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6).rotateX(Math.PI / 2), s * 0.065, 0.15, -0.3, 0x3a4250);
    for (let k = 0; k < 3; k++) p.box(0.09, 0.006, 0.004, s * 0.065, 0.15, -0.3, 0x3a4250, (k * Math.PI) / 3);
    p.box(0.012, 0.09, 0.012, s * 0.065, 0.07, -0.3, 0x3a4250);
  }
  // l'aire des drones, sa coupole lumineuse, le canon à plasma
  p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 12), 0, 0.105, -0.12, 0x3a4250);
  p.add(new THREE.TorusGeometry(0.045, 0.004, 4, 16).rotateX(Math.PI / 2), 0, 0.112, -0.12, LIGHT, 0, 'neon');
  p.box(0.03, 0.02, 0.05, 0, 0.12, 0.3, 0x3a4250); p.box(0.012, 0.012, 0.012, 0, 0.125, 0.33, LIGHT, 0, 'neon');
  flag(p, 0.3, -0.18, 0.06); p.cyl(0.004, 0.004, 0.2, 3, 0, 0.1, -0.18, 0x8a8f96);
  // le drone : corps, quatre rotors, œil lumineux
  const d = new Parts();
  d.box(0.05, 0.016, 0.05, 0, 0, 0, skin);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { d.box(0.04, 0.006, 0.006, x * 0.02, 0.006, z * 0.02, 0x3a4250, Math.PI / 4 * x * z); d.cyl(0.018, 0.018, 0.004, 8, x * 0.034, 0.014, z * 0.034, 0x9aa4b0); }
  d.box(0.012, 0.008, 0.008, 0, -0.004, 0.026, LIGHT, 0, 'neon');
  return { muzzles: [[0, 0.13, 0.34]], drone: d.build(false).body };
}

const BUILD: Record<WarshipKind, (p: Parts) => Partial<WarshipModel>> = {
  // (une jonque demandée au peuple oriental : son boutre)
  galley, dhow, junk: dhow, frigate, ironclad, launch, hover,
};

/** Dessine dans `p` le navire `kind` du peuple oriental ; rend ses pièces à part (rames, bouches de tir, cheminée, drone) */
export function orientShip(p: Parts, kind: WarshipKind): Partial<WarshipModel> {
  return BUILD[kind](p);
}
