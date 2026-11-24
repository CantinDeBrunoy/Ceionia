import * as THREE from 'three';
import { Parts, type Glow } from '../parts';
import { mulberry32 } from '../../core/rng';
import { asianJunk } from './asianShips';

/**
 * Les modèles de la ville du peuple asiatique (décor de l'archipel, voir `townModels.ts`, `rivalTowns.ts` et
 * `docs/iles.md`). Charpente et chaume à l'Antiquité ; puis enduit blanc ou ocre, piliers laqués rouges, consoles
 * peintes, toits courbes à coins relevés couverts de tuiles en couvre-joints ; maisons-boutiques à lanternes à
 * l'Industriel ; béton, enseignes et néons au Moderne ; verre et toits flottants au Futuriste. Mêmes conventions que
 * `models.ts` : coordonnées locales au lot, origine au centre, façade vers +z, 1 = une case, couleurs de sommets
 */

// ---------- Palette ----------

export const A = {
  red: 0xa8352a, lacquer: 0xb8402f, redDark: 0x7a2a22, ochre: 0xc9873f, ochreWall: 0xb5533c,
  darkwood: 0x4a3226, timber: 0x7a5a40, wood: 0x9a7350, rafter: 0x5a3c2c,
  plaster: 0xefe8da, wattle: 0xd6c09a, stone: 0xb3ada2, darkstone: 0x7d7a74, marble: 0xe9e5db, paving: 0xc9c4b8,
  tile: 0x5a636c, tileG: 0x3f7262, tileB: 0x4a5a74, tileGold: 0xd09a32, thatch: 0xc4a46a, shingle: 0x8a6a4a,
  beam: 0x3e7a72, beamB: 0x3d5f86, gold: 0xd8b04a, bronze: 0x6f6448, paper: 0xf6e4b6, lantern: 0xd8402e,
  maple: 0xc4553a, pine: 0x3f6b48, bamboo: 0x7fa85a, leaf: 0x6a9a50, willow: 0x8ab060, blossom: 0xf2b8c6,
  water: 0x5fb3c4, lotus: 0x5f9a4a, moss: 0x7aa060, grass: 0x86a85e,
  concrete: 0xd8d6d0, concreteD: 0xb8b6b0, glass: 0xb4c6ca, steel: 0x8a9096, cyan: 0x5ae0ff, pink: 0xff5a8a, amber: 0xffc060,
  win: 0xf0d8a0,
};

/** L'élément `i` d'une liste, en boucle (aussi pour un `i` négatif) */
const pick = <T,>(a: T[], i: number) => a[((Math.round(i) % a.length) + a.length) % a.length];
/** Une couleur assombrie (k < 1) ou éclaircie */
export const dark = (c: number, k: number) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
};
/** Tuiles de toit des maisons selon l'âge et la variante */
const houseTile = (age: number, v: number) => (age <= 1 ? A.thatch : age === 2 ? pick([A.tile, A.tile, A.tile, A.tileG], v) : pick([A.tile, A.tileG, A.tileB, A.tile], v));
/** Tuiles des grands édifices */
const templeTile = (age: number) => (age <= 1 ? A.shingle : age === 2 ? A.tile : age === 3 ? A.tileG : age === 4 ? A.tileG : A.tileB);

// ---------- Géométrie brute ----------

export type V3 = [number, number, number];

/** Pousse un triangle dont la normale s'écarte du point `ref` (les faces sont vues de face) ; un triangle plat est ignoré */
export function tri(out: number[], a: V3, b: V3, c: V3, ref: V3) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * nx + ny * ny + nz * nz < 1e-12) return;
  const cx = (a[0] + b[0] + c[0]) / 3 - ref[0], cy = (a[1] + b[1] + c[1]) / 3 - ref[1], cz = (a[2] + b[2] + c[2]) / 3 - ref[2];
  if (nx * cx + ny * cy + nz * cz >= 0) out.push(...a, ...b, ...c);
  else out.push(...a, ...c, ...b);
}
export const quad = (out: number[], a: V3, b: V3, c: V3, d: V3, ref: V3) => { tri(out, a, b, c, ref); tri(out, a, c, d, ref); };

/** Ajoute une liste plate de triangles comme une pièce */
export function mesh(p: Parts, pts: number[], x: number, y: number, z: number, col: number, ry = 0, glow: Glow = false) {
  if (!pts.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  p.add(g, x, y, z, col, ry, glow);
}

/** Côte en toit (arête saillante) le long d'une polyligne : deux pans de `rw` de demi-largeur (direction `q`, horizontale) et `rh` de haut */
export function rib(out: number[], pts: V3[], qx: number, qz: number, rw: number, rh: number) {
  const UP: V3 = [0, -60, 0];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const l1: V3 = [a[0] + qx * rw, a[1], a[2] + qz * rw], l2: V3 = [b[0] + qx * rw, b[1], b[2] + qz * rw];
    const r1: V3 = [a[0] - qx * rw, a[1], a[2] - qz * rw], r2: V3 = [b[0] - qx * rw, b[1], b[2] - qz * rw];
    const t1: V3 = [a[0], a[1] + rh, a[2]], t2: V3 = [b[0], b[1] + rh, b[2]];
    quad(out, l1, t1, t2, l2, UP);
    quad(out, t1, r1, r2, t2, UP);
  }
}

/**
 * Dessine dans un repère à part (origine en (x, y, z), tourné de `ry`, mis à l'échelle `k`) : la fonction dessine face à
 * +z autour de l'origine, comme pour un lot
 */
export function inFrame(p: Parts, x: number, y: number, z: number, ry: number, draw: (q: Parts) => void, k = 1) {
  const q = new Parts();
  draw(q);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(k, k, k));
  for (const g of q.body) { g.applyMatrix4(m); p.body.push(g); }
  for (const g of q.glow) { g.applyMatrix4(m); p.glow.push(g); }
}

/** Une pièce pointue (cône à `seg` pans) de la base `at` vers la direction `dir` */
export function spike(p: Parts, r: number, len: number, at: V3, dir: V3, col: number, x: number, y: number, z: number, ry: number, seg = 4) {
  const d = new THREE.Vector3(...dir).normalize();
  const g = new THREE.ConeGeometry(r, len, seg, 1, true).translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)).translate(...at);
  p.add(g, x, y, z, col, ry);
}

// ---------- Le toit courbe ----------

/** Options d'un toit : relevé des coins, rangs de tuiles (0 aucun, 1 grands pans, 2 tous), pas des rangs, couleurs, néon de l'égout */
export interface RoofO {
  lift?: number; rows?: 0 | 1 | 2; step?: number; ridge?: number; edge?: number; under?: number; t?: number;
  hips?: boolean; tips?: boolean; ends?: boolean; glow?: Glow; hipRidge?: number;
  /** toit simplifié (petits toits, maisons) : huit points par anneau, trois anneaux */
  lod?: boolean;
}
/** Points d'un anneau du toit (positions réduites : coins en ±1) */
const RING8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const RING: [number, number][] = [[-1, -1], [-0.5, -1], [0, -1], [0.5, -1], [1, -1], [1, 0], [1, 1], [0.5, 1], [0, 1], [-0.5, 1], [-1, 1], [-1, 0]];
/** Anneaux du toit, de l'égout (0) au faîte (1) */
const SS5 = [0, 0.24, 0.5, 0.76, 1];
/** Points des rangs de tuiles (moins serrés que les anneaux : la corde reste à fleur du pan) */
const RS5 = [0, 0.24, 0.6];
const SS3 = [0, 0.35, 0.7, 1], RS3 = [0, 0.35, 0.7];
/** Relevé selon la position réduite (linéaire par morceaux, comme le maillage) */
const liftK12 = (n: number) => { const a = Math.abs(n); return a <= 0.5 ? a * 0.5 : 0.25 + (a - 0.5) * 1.5; };

/**
 * Toit en croupe courbe (peuple asiatique) d'emprise w × d et de hauteur h, posé en (x, y, z) et tourné de `ry` : pans
 * creusés (plats à l'égout, raides au faîte), coins relevés et un peu évasés, rangs de tuiles en couvre-joints, arêtiers,
 * faîtage à queues recourbées, épis aux coins, égout épais et sous-face de chevrons. Un toit carré donne une pyramide
 */
export function hipRoof(p: Parts, w: number, d: number, h: number, x: number, y: number, z: number, col: number, ry = 0, o: RoofO = {}) {
  // le chaume : épais, sans tuiles ni arêtiers, à peine relevé
  if (col === A.thatch) o = { ...o, rows: 0, hips: false, tips: false, ends: false, t: 0.07, lift: (o.lift ?? Math.min(0.13, h * 0.5, Math.min(w, d) * 0.16)) * 0.3, edge: dark(A.thatch, 0.82), ridge: dark(A.thatch, 0.7) };
  let A0 = w / 2, B = d / 2, R = ry;
  if (B > A0) { [A0, B] = [B, A0]; R += Math.PI / 2; }
  const ring = o.lod ? RING8 : RING, NR = ring.length, SS = o.lod ? SS3 : SS5, RS = o.lod ? RS3 : RS5;
  const liftK = o.lod ? (n: number) => Math.abs(n) : liftK12;
  const AA = A0, L = o.lift ?? Math.min(0.13, h * 0.5, B * 0.32), t = o.t ?? 0.035;
  const hx = (s: number) => AA - s * B, hz = (s: number) => B * (1 - s), yy = (s: number) => h * Math.pow(s, 1.65);
  const pt = (s: number, nx: number, nz: number): V3 => {
    const f = (1 - s) ** 2 * liftK(nx) * liftK(nz), fl = 1 + 0.08 * f;
    return [nx * hx(s) * fl, yy(s) + L * f, nz * hz(s) * fl];
  };
  const top: number[] = [], edge: number[] = [], under: number[] = [], rows: number[] = [], ridges: number[] = [];
  const UP: V3 = [0, -60, 0];
  for (let i = 0; i + 1 < SS.length; i++)
    for (let k = 0; k < NR; k++) {
      const [a1, b1] = ring[k], [a2, b2] = ring[(k + 1) % NR];
      quad(top, pt(SS[i], a1, b1), pt(SS[i], a2, b2), pt(SS[i + 1], a2, b2), pt(SS[i + 1], a1, b1), UP);
    }
  for (let k = 0; k < NR; k++) {
    const a = pt(0, ...ring[k]), b = pt(0, ...ring[(k + 1) % NR]);
    const a2: V3 = [a[0], a[1] - t, a[2]], b2: V3 = [b[0], b[1] - t, b[2]];
    quad(edge, a, b, b2, a2, [0, (a[1] + b[1]) / 2 - t / 2, 0]);
    tri(under, [0, -t * 0.5, 0], a2, b2, [0, 60, 0]);
  }
  // rangs de tuiles : des côtes de l'égout jusqu'au faîte ou à l'arêtier
  const step = o.step ?? 0.1, rw = Math.min(0.016, step * 0.2), rh = 0.014;
  if ((o.rows ?? 1) >= 1) {
    const n = Math.max(2, Math.round((2 * AA) / step));
    for (const side of [-1, 1])
      for (let i = 0; i < n; i++) {
        const xr = -AA + (2 * AA * (i + 0.5)) / n, smax = Math.min(1, (AA - Math.abs(xr)) / B);
        if (smax < 0.12) continue;
        const ss = [...RS.filter((s) => s < smax - 0.04), smax];
        rib(rows, ss.map((s) => {
          const nx = Math.min(1, Math.abs(xr) / Math.max(1e-3, hx(s))), f = (1 - s) ** 2 * liftK(nx), fl = 1 + 0.08 * f;
          return [xr * fl, yy(s) + L * f + 0.003, side * hz(s) * fl] as V3;
        }), 1, 0, rw, rh);
      }
  }
  if ((o.rows ?? 1) >= 2) {
    const n = Math.max(2, Math.round((2 * B) / step));
    for (const side of [-1, 1])
      for (let i = 0; i < n; i++) {
        const zr = -B + (2 * B * (i + 0.5)) / n, smax = 1 - Math.abs(zr) / B;
        if (smax < 0.12) continue;
        const ss = [...RS.filter((s) => s < smax - 0.04), smax];
        rib(rows, ss.map((s) => {
          const nz = Math.min(1, Math.abs(zr) / Math.max(1e-3, hz(s))), f = (1 - s) ** 2 * liftK(nz), fl = 1 + 0.08 * f;
          return [side * hx(s) * fl, yy(s) + L * f + 0.003, zr * fl] as V3;
        }), 0, 1, rw, rh);
      }
  }
  // arêtiers
  if (o.hips !== false)
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const q = Math.SQRT1_2;
      rib(ridges, SS.map((s) => { const v = pt(s, sx, sz); return [v[0], v[1] + 0.004, v[2]] as V3; }), sz * q, -sx * q, 0.022, 0.03);
    }
  const ridgeC = o.ridge ?? dark(col, 0.72);
  mesh(p, top, x, y, z, col, R);
  mesh(p, rows, x, y, z, dark(col, 0.8), R);
  mesh(p, edge, x, y, z, o.edge ?? dark(col, 0.7), R, o.glow ?? false);
  mesh(p, under, x, y, z, o.under ?? A.rafter, R);
  mesh(p, ridges, x, y, z, o.hipRidge ?? ridgeC, R);
  // faîtage, et ses queues recourbées
  const rl = AA - B;
  if (rl > 0.02) {
    p.add(new THREE.BoxGeometry(2 * rl + 0.05, 0.045, 0.05).translate(0, h + 0.012, 0), x, y, z, ridgeC, R);
    if (o.ends !== false)
      for (const sx of [-1, 1]) {
        p.add(new THREE.BoxGeometry(0.04, 0.07, 0.05).translate(sx * (rl + 0.03), h + 0.04, 0), x, y, z, ridgeC, R);
        spike(p, 0.026, 0.09, [sx * (rl + 0.03), h + 0.07, 0], [sx * 0.9, 1, 0], ridgeC, x, y, z, R);
      }
  }
  // épis des coins : la pointe relevée de l'égout
  if (o.tips !== false)
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const c = pt(0, sx, sz);
      spike(p, 0.02, Math.min(0.12, 0.05 + B * 0.08), [c[0], c[1] - 0.01, c[2]], [sx * 0.8, 1.1, sz * 0.8], ridgeC, x, y, z, R);
    }
}

// ---------- Petits éléments ----------

/** Tronc de pyramide : rectangle w0 × d0 en y, rectangle w1 × d1 en y + h (d1 ≈ 0 : un faîtage le long de x) */
function frustum(p: Parts, w0: number, d0: number, w1: number, d1: number, h: number, x: number, y: number, z: number, col: number, ry = 0, glow: Glow = false) {
  const a = w0 / 2, b = d0 / 2, c = w1 / 2, e = d1 / 2, out: number[] = [];
  const B = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b]] as V3[], T = [[-c, h, -e], [c, h, -e], [c, h, e], [-c, h, e]] as V3[];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(out, B[i], B[j], T[j], T[i], [0, h * 0.3, 0]); }
  if (c > 0.001 && e > 0.001) quad(out, T[0], T[1], T[2], T[3], [0, -60, 0]);
  mesh(p, out, x, y, z, col, ry, glow);
}
/** Chaperon de tuiles sur un mur w × d (le long du plus grand côté), son égout sombre */
function coping(p: Parts, w: number, d: number, y: number, x: number, z: number, col: number) {
  const along = w >= d, L = along ? w : d, T = along ? d : w;
  p.box(along ? L + 0.06 : T + 0.12, 0.025, along ? T + 0.12 : L + 0.06, x, y, z, dark(col, 0.72));
  frustum(p, L + 0.06, T + 0.12, L + 0.02, 0.02, 0.08, x, y + 0.025, z, col, along ? 0 : Math.PI / 2);
}

/** Lanterne ronde de papier rouge, chapeaux dorés et gland ; allumée la nuit */
export function lantern(p: Parts, x: number, y: number, z: number, r = 0.04, col = A.lantern) {
  p.add(new THREE.CylinderGeometry(r * 0.85, r * 0.85, r * 1.7, 6, 1, true), x, y, z, col, 0, true);
  p.add(new THREE.ConeGeometry(r * 0.88, r * 0.5, 6, 1, true), x, y + r * 1.05, z, A.gold);
  p.add(new THREE.ConeGeometry(r * 0.88, r * 0.5, 6, 1, true).rotateX(Math.PI), x, y - r * 1.05, z, A.gold);
}
/** Lanterne de pierre : socle, fût, chambre de lumière, chapeau courbe */
function stoneLantern(p: Parts, x: number, z: number, s = 1, lit = true) {
  p.box(0.12 * s, 0.04 * s, 0.12 * s, x, 0, z, A.stone);
  p.cyl(0.03 * s, 0.035 * s, 0.18 * s, 6, x, 0.04 * s, z, A.stone);
  p.box(0.1 * s, 0.02 * s, 0.1 * s, x, 0.22 * s, z, A.stone);
  p.box(0.07 * s, 0.07 * s, 0.07 * s, x, 0.24 * s, z, 0xfff0c0, 0, lit);
  p.pyramid(0.16 * s, 0.07 * s, 0.16 * s, x, 0.31 * s, z, A.stone);
  p.sphere(0.018 * s, x, 0.39 * s, z, A.stone);
}
/** Brûle-parfum en bronze à trois pieds, sous son petit toit */
function censer(p: Parts, x: number, z: number, s = 1) {
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; p.box(0.025 * s, 0.1 * s, 0.025 * s, x + Math.sin(a) * 0.08 * s, 0, z + Math.cos(a) * 0.08 * s, A.bronze); }
  p.cyl(0.13 * s, 0.1 * s, 0.12 * s, 8, x, 0.08 * s, z, A.bronze);
  p.cyl(0.14 * s, 0.14 * s, 0.02 * s, 8, x, 0.2 * s, z, dark(A.bronze, 0.8));
  for (const sx of [-1, 1]) p.box(0.02 * s, 0.07 * s, 0.05 * s, x + sx * 0.12 * s, 0.2 * s, z, A.bronze);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.01 * s, 0.01 * s, 0.16 * s, 4, x + sx * 0.08 * s, 0.22 * s, z + sz * 0.08 * s, A.bronze);
  p.pyramid(0.3 * s, 0.1 * s, 0.3 * s, x, 0.38 * s, z, A.bronze);
}
/** Lion de garde en pierre, assis sur son socle, tourné vers +z */
function lion(p: Parts, x: number, z: number, s = 1, col = A.stone, ry = 0) {
  inFrame(p, x, 0, z, ry, (q) => {
    q.box(0.16, 0.1, 0.2, 0, 0, 0, A.darkstone);
    q.box(0.1, 0.1, 0.13, 0, 0.1, -0.02, col);
    q.box(0.1, 0.1, 0.06, 0, 0.1, 0.06, col);
    q.sphere(0.065, 0, 0.25, 0.04, col, 0, 1.0);
    q.box(0.06, 0.03, 0.04, 0, 0.22, 0.1, dark(col, 0.85));
    q.sphere(0.03, 0.04, 0.12, 0.09, col);
  }, s);
}
/**
 * Faîtage archaïque d'un toit de chaume ou de bardeaux (Antiquité) : le rondin du faîte, des rondins posés en travers et les
 * planches croisées qui dépassent aux deux bouts ; `len` le long de x, au sommet (x, y, z), tourné de `ry`
 */
function oldRidge(p: Parts, len: number, x: number, y: number, z: number, ry = 0, col = A.darkwood) {
  inFrame(p, x, y, z, ry, (q) => {
    q.add(new THREE.CylinderGeometry(0.03, 0.03, len + 0.08, 5).rotateZ(Math.PI / 2), 0, 0.01, 0, dark(A.thatch, 0.62));
    const n = Math.max(2, Math.round(len / 0.12));
    for (let i = 0; i < n; i++) q.add(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 5).rotateX(Math.PI / 2), -len / 2 + (len * (i + 0.5)) / n, 0.04, 0, col);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) q.add(new THREE.BoxGeometry(0.014, 0.17, 0.028).translate(0, 0.085, 0).rotateX(sz * 0.5), sx * (len / 2 + 0.03), -0.04, 0, col);
  });
}
/** Mât à oriflamme rouge */
function banner(p: Parts, x: number, z: number, h: number, col = A.red, y = 0) {
  p.cyl(0.012, 0.016, h, 4, x, y, z, A.darkwood);
  p.box(0.012, h * 0.4, 0.09, x, y + h * 0.52, z + 0.05, col);
  p.sphere(0.02, x, y + h, z, A.gold);
}

/** Pin aux étages de feuillage plats et penchés */
function pine(p: Parts, x: number, z: number, h: number, col = A.pine, seed = 0) {
  const lean = ((seed * 7) % 5 - 2) * 0.05;
  p.cyl(0.025, 0.04, h * 0.7, 5, x, 0, z, 0x5e4130);
  for (let i = 0; i < 3; i++) {
    const a = seed + i * 2.1, r = h * (0.24 - i * 0.05), ox = Math.sin(a) * h * 0.12 + lean * i * h, oz = Math.cos(a) * h * 0.12;
    p.cyl(r * 0.7, r, h * 0.09, 7, x + ox, h * (0.42 + i * 0.2), z + oz, i % 2 ? dark(col, 1.12) : col);
  }
}
/** Érable, cerisier ou feuillu : une grappe de boules */
function roundTree(p: Parts, x: number, z: number, h: number, col: number, seed = 0) {
  p.cyl(0.025, 0.04, h * 0.5, 5, x, 0, z, 0x6b4a34);
  p.sphere(h * 0.26, x, h * 0.6, z, col, 0, 0.8);
  p.sphere(h * 0.18, x + Math.sin(seed) * h * 0.2, h * 0.56, z + Math.cos(seed) * h * 0.2, dark(col, 0.9), 0, 0.85);
  p.sphere(h * 0.15, x - Math.sin(seed + 1) * h * 0.18, h * 0.72, z - Math.cos(seed + 1) * h * 0.16, dark(col, 1.08), 0, 0.85);
}
/** Saule : tronc et rideau de branches tombantes */
function willow(p: Parts, x: number, z: number, h: number) {
  p.cyl(0.03, 0.045, h * 0.6, 5, x, 0, z, 0x6b5a40);
  p.sphere(h * 0.22, x, h * 0.66, z, A.willow, 0, 0.7);
  p.cyl(h * 0.24, h * 0.3, h * 0.42, 7, x, h * 0.24, z, dark(A.willow, 0.9));
}
/** Touffe de bambous */
function bamboo(p: Parts, x: number, z: number, h: number, seed = 0) {
  for (let j = 0; j < 4; j++) {
    const a = seed + j * 1.7, ox = Math.sin(a) * 0.05, oz = Math.cos(a) * 0.05;
    p.cyl(0.011, 0.012, h * (0.8 + (j % 2) * 0.2), 4, x + ox, 0, z + oz, A.bamboo);
    p.sphere(0.05, x + ox, h * (0.78 + (j % 2) * 0.2), z + oz, dark(A.bamboo, 0.85), 0, 1.6);
  }
}
/** Rocher de jardin dressé, troué, gris */
function rock(p: Parts, x: number, z: number, s: number, seed = 0) {
  p.sphere(0.08 * s, x, 0.06 * s, z, 0x8a8a84, 0, 1.3);
  p.sphere(0.06 * s, x + Math.sin(seed) * 0.04 * s, 0.17 * s, z + Math.cos(seed) * 0.03 * s, 0x9a968c, 0, 1.5);
  p.sphere(0.04 * s, x - 0.02 * s, 0.26 * s, z, 0x76746e, 0, 1.4);
}

/** Balustrade de marbre (ou de bois) le long de x, centrée en (x, y, z), tournée de `ry` */
export function rail(p: Parts, len: number, x: number, y: number, z: number, ry = 0, col = A.marble, h = 0.07, step = 0.24) {
  const c = Math.cos(ry), s = Math.sin(ry);
  p.box(len, 0.018, 0.026, x, y + h - 0.018, z, col, ry);
  p.box(len, 0.014, 0.02, x, y + 0.012, z, col, ry);
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const u = -len / 2 + (len * i) / n;
    p.box(0.026, h + 0.016, 0.026, x + u * c, y, z - u * s, col, ry);
  }
}
/** Escalier de `n` marches montant vers -z jusqu'à la hauteur `h`, dont le pied est en z (façade +z) */
function stairs(p: Parts, w: number, h: number, depth: number, x: number, y: number, z: number, col = A.stone, n = 3, ramp?: number) {
  for (let i = 0; i < n; i++) p.box(w, (h * (i + 1)) / n, depth * (1 - i / n), x, y, z - (depth * (1 + i / n)) / 2, col);
  // (rampe sculptée au milieu, dalle inclinée, pour les escaliers impériaux)
  if (ramp) p.add(new THREE.BoxGeometry(w * 0.32, 0.02, Math.hypot(depth, h)).rotateX(Math.atan2(h, depth)).translate(0, h / 2 + 0.01, -depth / 2), x, y, z, ramp);
}

/**
 * Salle à colonnes (face +z, origine au centre de son sol) : socle de pierre et son rebord, escalier, colonnes laquées sur
 * bases de pierre, murs en retrait à portes à claire-voie (papier allumé la nuit), poutre peinte, consoles, toit courbe à
 * un ou deux avant-toits
 */
export interface HallO {
  w: number; d: number; h: number; roof: number; col?: number; wall?: number; beam?: number; podium?: number; double?: boolean;
  rows?: 0 | 1 | 2; step?: number; roofH?: number; lift?: number; balus?: boolean; stairs?: boolean; bays?: number; glass?: boolean;
  neon?: number; side?: boolean; back?: boolean; under?: number; ridge?: number; ramp?: number;
  /** toits simplifiés (voir `RoofO.lod`) */
  lod?: boolean;
}
function hall(p: Parts, o: HallO) {
  const W = o.w, D = o.d, H = o.h, ph = o.podium ?? 0.1, col = o.col ?? A.red, wall = o.wall ?? A.plaster, beam = o.beam ?? A.beam;
  // socle
  if (ph > 0) {
    p.box(W + 0.3, ph - 0.02, D + 0.3, 0, 0, 0, A.stone);
    if (W > 1.6) p.box(W + 0.34, 0.02, D + 0.34, 0, ph - 0.02, 0, A.marble);
    if (o.stairs !== false) stairs(p, Math.min(0.7, W * 0.4), ph, 0.18, 0, 0, D / 2 + 0.17 + 0.18, A.stone, 2, o.ramp);
    if (o.balus) {
      const y = ph, e = 0.01;
      rail(p, W + 0.3, 0, y, -D / 2 - 0.15 + e, 0);
      for (const sx of [-1, 1]) rail(p, D + 0.3, sx * (W / 2 + 0.15 - e), y, 0, Math.PI / 2);
      const gap = Math.min(0.7, W * 0.4) + 0.06, seg = (W + 0.3 - gap) / 2;
      for (const sx of [-1, 1]) rail(p, seg, sx * (gap / 2 + seg / 2), y, D / 2 + 0.15 - e, 0);
    }
  }
  const y0 = ph;
  // murs en retrait, ou verre allumé (Futuriste)
  const iw = W - 0.16, id = D - 0.16;
  if (o.glass) p.box(iw, H - 0.06, id, 0, y0, 0, A.glass, 0, true);
  else p.box(iw, H - 0.06, id, 0, y0, 0, wall);
  // colonnes : façade, arrière, flancs
  const bays = o.bays ?? Math.max(3, Math.round(W / 0.42)), bw = W / bays;
  const cols: [number, number][] = [];
  for (let i = 0; i <= bays; i++) for (const sz of [-1, 1]) cols.push([-W / 2 + i * bw, sz * D / 2]);
  const sideN = Math.max(1, Math.round(D / 0.45));
  for (let j = 1; j < sideN; j++) for (const sx of [-1, 1]) cols.push([sx * W / 2, -D / 2 + (D * j) / sideN]);
  for (const [cx, cz] of cols) {
    if (W > 1.6) p.box(0.075, 0.03, 0.075, cx, y0, cz, A.stone);
    p.add(new THREE.CylinderGeometry(0.03, 0.034, H, 6, 1, true).translate(0, H / 2, 0), cx, y0, cz, col);
  }
  // portes à claire-voie de la façade : papier (allumé) dans un cadre, montant et traverses
  if (!o.glass)
    for (let i = 0; i < bays; i++) {
      const cx = -W / 2 + (i + 0.5) * bw, fz = id / 2 + 0.006, pw = bw - 0.1, phh = H * 0.62;
      p.box(pw, phh, 0.014, cx, y0 + 0.05, fz, A.paper, 0, true);
      p.box(0.012, phh, 0.02, cx, y0 + 0.05, fz + 0.004, A.redDark);
      for (const t of [0.35, 0.7]) p.box(pw, 0.01, 0.02, cx, y0 + 0.05 + phh * t, fz + 0.004, A.redDark);
      if (o.back) p.box(pw * 0.6, phh * 0.5, 0.014, cx, y0 + 0.15, -id / 2 - 0.006, A.paper, 0, true);
    }
  if (o.side && !o.glass) for (const sx of [-1, 1]) p.box(0.014, H * 0.4, id * 0.5, sx * (iw / 2 + 0.006), y0 + 0.12, 0, A.paper, 0, true);
  // poutre peinte et consoles sous l'avant-toit
  const by = y0 + H - 0.08;
  p.box(W + 0.06, 0.07, D + 0.06, 0, by, 0, beam);
  p.box(W + 0.07, 0.012, D + 0.07, 0, by + 0.02, 0, A.gold);
  for (const [cx, cz] of cols) if (cz > D / 2 - 0.01) {
    p.box(0.08, 0.035, 0.11, cx, by + 0.07, cz, A.beam);
    p.box(0.05, 0.025, 0.15, cx, by + 0.06, cz, A.redDark);
  }
  const ry = y0 + H + 0.04, rh = o.roofH ?? Math.max(0.3, Math.min(0.62, D * 0.42));
  const ro: RoofO = { lod: o.lod, rows: o.rows ?? 2, step: o.step ?? 0.1, lift: o.lift, glow: o.neon !== undefined ? 'neon' : false, edge: o.neon, under: o.under, ridge: o.ridge };
  if (o.double) {
    // avant-toit bas, étage en retrait (poutre, claire-voie), toit haut
    hipRoof(p, W + 0.42, D + 0.42, rh * 0.42, 0, ry - 0.02, 0, o.roof, 0, { ...ro, rows: 1, hips: true, ends: false });
    const uw = W * 0.76, ud = D * 0.64, uh = 0.24;
    p.box(uw, uh, ud, 0, ry + rh * 0.3, 0, col);
    p.box(uw * 0.86, uh * 0.55, 0.012, 0, ry + rh * 0.3 + 0.05, ud / 2 + 0.006, o.glass ? A.glass : A.paper, 0, true);
    p.box(uw + 0.05, 0.05, ud + 0.05, 0, ry + rh * 0.3 + uh - 0.05, 0, beam);
    hipRoof(p, uw + 0.42, ud + 0.42, rh, 0, ry + rh * 0.3 + uh, 0, o.roof, 0, ro);
  } else hipRoof(p, W + 0.42, D + 0.42, rh, 0, ry, 0, o.roof, 0, ro);
}

/**
 * Pagode carrée de `n` étages, de côté `w` à la base (origine au pied) : socle, étages en retrait à colonnes d'angle,
 * claire-voies allumées, balcons, toits courbes empilés, flèche d'anneaux dorés. Rend la hauteur du sommet
 */
function pagoda(p: Parts, n: number, w: number, age: number) {
  const roofC = templeTile(age), wall = age <= 1 ? A.timber : age >= 5 ? A.glass : A.lacquer, col = age <= 1 ? A.darkwood : A.red;
  const glass = age >= 5, neon: Glow = age >= 5 ? 'neon' : false;
  let y = 0, s = w;
  p.box(w + 0.32, 0.1, w + 0.32, 0, 0, 0, A.stone);
  p.box(w + 0.36, 0.02, w + 0.36, 0, 0.1, 0, A.marble);
  if (age >= 2) for (const sx of [-1, 1]) rail(p, w + 0.3, sx * (w / 2 + 0.15), 0.12, 0, Math.PI / 2, A.marble, 0.06, 0.2);
  y = 0.12;
  for (let i = 0; i < n; i++) {
    const hh = i === 0 ? 0.42 : 0.26, bw = s * 0.66;
    p.box(bw, hh, bw, 0, y, 0, wall, 0, glass);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.024, 0.024, hh, 5, sx * bw / 2, y, sz * bw / 2, col);
    if (!glass)
      for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const ox = Math.sin(r) * (bw / 2 + 0.006), oz = Math.cos(r) * (bw / 2 + 0.006);
        p.box(bw * 0.34, hh * 0.5, 0.012, ox, y + hh * 0.22, oz, age <= 1 ? 0x3a2a22 : A.paper, r, age >= 2);
        if (age >= 2) p.box(0.01, hh * 0.5, 0.018, ox, y + hh * 0.22, oz, A.redDark, r);
      }
    p.box(bw + 0.04, 0.04, bw + 0.04, 0, y + hh - 0.04, 0, age <= 1 ? A.darkwood : A.beam);
    // balcon sous l'étage (à partir du second)
    if (i > 0 && age >= 2) {
      p.box(bw + 0.14, 0.02, bw + 0.14, 0, y - 0.005, 0, A.darkwood);
      for (const r of [0, Math.PI / 2]) for (const sg of [-1, 1]) p.box(bw + 0.14, 0.012, 0.012, Math.sin(r) * sg * (bw / 2 + 0.07), y + 0.06, Math.cos(r) * sg * (bw / 2 + 0.07), A.red, r);
    }
    y += hh;
    const rw = s * 1.22, rh = 0.16 + s * 0.06;
    hipRoof(p, rw, rw, rh, 0, y + 0.02, 0, roofC, 0, { lod: true, rows: 2, step: 0.13, lift: 0.1, glow: neon, edge: age >= 5 ? A.amber : undefined, ridge: age >= 4 ? A.gold : undefined });
    if (age >= 3) for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) lantern(p, sx * rw * 0.5, y - 0.02, sz * rw * 0.5, 0.022);
    y += rh * 0.55;
    s *= 0.84;
  }
  // flèche : socle, neuf anneaux, perle
  const fc = A.gold;
  p.cyl(0.07, 0.09, 0.08, 8, 0, y, 0, fc);
  p.cyl(0.016, 0.02, 0.62, 5, 0, y + 0.08, 0, fc);
  for (let k = 0; k < 7; k++) p.cyl(0.06 - k * 0.006, 0.06 - k * 0.006, 0.022, 8, 0, y + 0.14 + k * 0.055, 0, fc);
  p.sphere(0.045, 0, y + 0.66, 0, age >= 5 ? A.amber : fc);
  if (age >= 5) p.box(0.06, 0.06, 0.06, 0, y + 0.64, 0, A.amber, 0, 'neon');
  return y + 0.7;
}

// ---------- Le temple ----------

/**
 * Le temple (lot 5 × 5) : enceinte ocre à chaperon de tuiles et porte à pavillon, cour au brûle-parfum, tours de la cloche
 * et du tambour, grande salle de prière sur terrasse (double avant-toit à partir du Médiéval), pagode derrière (trois
 * étages, puis cinq), pins et lanternes de pierre
 */
export function aTemple(p: Parts, age: number, v: number) {
  const roofC = templeTile(age), wallC = age <= 1 ? A.wattle : A.ochreWall, neonE = age >= 5 ? A.amber : undefined;
  // sol : dallage et allée
  p.box(4.9, 0.03, 4.9, 0, 0, 0, age <= 1 ? 0xb8a888 : A.paving);
  p.box(0.7, 0.012, 4.6, 0, 0.03, 0.1, age <= 1 ? 0xc8b898 : A.marble);
  // l'enceinte
  const E = 2.38;
  if (age <= 1) {
    // palissade de pieux
    for (const [x0, z0, x1, z1] of [[-E, -E, E, -E], [-E, -E, -E, E], [E, -E, E, E], [-E, E, -0.6, E], [0.6, E, E, E]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.14);
      for (let i = 0; i <= n; i++) p.cyl(0.03, 0.035, 0.4 + ((i * 7) % 3) * 0.03, 5, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, A.timber);
      const ry = Math.atan2(-(z1 - z0), x1 - x0);
      p.box(len, 0.03, 0.03, (x0 + x1) / 2, 0.28, (z0 + z1) / 2, A.darkwood, ry);
    }
  } else {
    for (const [x, z, w, d] of [[-1.5, E, 1.76, 0.12], [1.5, E, 1.76, 0.12], [0, -E, 4.76, 0.12], [-E, 0, 0.12, 4.64], [E, 0, 0.12, 4.64]] as const) {
      p.box(w, 0.08, d, x, 0, z, A.darkstone);
      p.box(w, 0.36, d, x, 0.08, z, wallC);
      coping(p, w, d, 0.44, x, z, roofC);
    }
  }
  // la porte à pavillon (shanmen)
  inFrame(p, 0, 0, E, 0, (q) => hall(q, {
    w: 1.2, d: 0.5, h: 0.4, roof: roofC, col: age <= 1 ? A.darkwood : A.red, wall: age <= 1 ? A.wattle : A.red, podium: 0.08, rows: 2, step: 0.1,
    roofH: 0.26, stairs: true, bays: 3, neon: neonE, ridge: age >= 4 ? A.gold : undefined,
  }));
  // la cour : brûle-parfum, lanternes de pierre, oriflammes
  censer(p, 0, 1.45, age <= 1 ? 0.8 : 1);
  for (const sx of [-1, 1]) {
    stoneLantern(p, sx * 0.55, 1.75, 1.1, age >= 2);
    stoneLantern(p, sx * 0.55, 1.15, 1.1, age >= 2);
    if (age >= 3) banner(p, sx * 0.85, 1.9, 0.7, sx > 0 ? A.red : A.gold);
  }
  // tours de la cloche et du tambour (Médiéval et après)
  if (age >= 2)
    for (const sx of [-1, 1])
      inFrame(p, sx * 1.7, 0, 1.55, -sx * Math.PI / 2, (q) => {
        q.box(0.62, 0.36, 0.62, 0, 0, 0, A.ochreWall);
        q.box(0.66, 0.03, 0.66, 0, 0.36, 0, A.marble);
        q.box(0.22, 0.2, 0.012, 0, 0.04, 0.316, A.redDark);
        for (const cx of [-1, 1]) for (const cz of [-1, 1]) q.cyl(0.022, 0.022, 0.3, 5, cx * 0.24, 0.39, cz * 0.24, A.red);
        if (sx < 0) { q.cyl(0.07, 0.1, 0.16, 8, 0, 0.5, 0, A.bronze); q.box(0.02, 0.06, 0.02, 0, 0.66, 0, A.bronze); }
        else { q.add(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8).rotateX(Math.PI / 2), 0, 0.55, 0, A.red); q.cyl(0.101, 0.101, 0.012, 8, 0, 0.5, 0, A.gold); }
        q.box(0.58, 0.04, 0.58, 0, 0.66, 0, A.beam);
        hipRoof(q, 0.82, 0.82, 0.3, 0, 0.7, 0, roofC, 0, { lod: true, rows: 2, step: 0.12, lift: 0.09, glow: age >= 5 ? 'neon' : false, edge: neonE, ridge: age >= 4 ? A.gold : undefined });
        q.sphere(0.03, 0, 1.0, 0, A.gold);
      });
  // la salle de prière
  inFrame(p, 0, 0, 0.2, 0, (q) => {
    hall(q, {
      w: 2.5, d: 1.3, h: 0.52, roof: roofC, col: age <= 1 ? A.darkwood : A.red, wall: age <= 1 ? A.wattle : A.red, podium: age <= 1 ? 0.1 : 0.18,
      double: age >= 2, rows: 2, step: 0.1, roofH: 0.5, balus: age >= 2, bays: 5, glass: age >= 5, neon: neonE, side: true,
      ridge: age >= 4 ? A.gold : undefined, beam: age <= 1 ? A.darkwood : A.beam,
    });
    // la plaque au-dessus de la porte
    if (age >= 2 && age <= 4) { q.box(0.32, 0.12, 0.02, 0, 0.9, 0.43, A.beamB); q.box(0.26, 0.07, 0.022, 0, 0.925, 0.435, A.gold); }
  });
  if (age >= 3) for (let i = 0; i < 6; i++) lantern(p, -1.25 + i * 0.5, 0.86 + (age >= 2 ? 0.1 : 0), 1.02, 0.035);
  // la pagode, derrière
  inFrame(p, 0, 0, -1.5, 0, (q) => pagoda(q, age <= 1 ? 3 : 5, 1.08, age));
  // arbres
  for (const sx of [-1, 1]) {
    pine(p, sx * 1.75, -0.6, 0.95, A.pine, sx + v);
    pine(p, sx * 1.6, -1.95, 0.85, A.pine, sx * 3 + v);
    if (age >= 2) roundTree(p, sx * 2.0, 0.55, 0.6, sx > 0 ? 0xd9b23a /* ginkgo */ : A.maple, sx);
  }
}

// ---------- Le palais ----------

/**
 * Le palais (lot 6 × 5) : enceinte rouge à chaperon de tuiles dorées, porte à pavillon sur un massif percé de trois
 * passages, cour traversée d'un canal à trois petits ponts, salles latérales, grande salle sur trois terrasses de marbre
 * à balustrades et rampe impériale (double avant-toit à partir du Médiéval), lions, vasques de bronze, oriflammes
 */
export function aPalace(p: Parts, age: number, v: number) {
  const gold = age <= 1 ? A.thatch : A.tileGold, wallC = age <= 1 ? A.wattle : A.ochreWall, neonE = age >= 5 ? A.amber : undefined;
  const glow: Glow = age >= 5 ? 'neon' : false;
  p.box(5.9, 0.03, 4.9, 0, 0, 0, age <= 1 ? 0xb8a888 : A.paving);
  // enceinte
  const X = 2.88, Z = 2.38;
  for (const [x, z, w, d] of [[-1.85, Z, 1.94, 0.14], [1.85, Z, 1.94, 0.14], [0, -Z, 5.9, 0.14], [-X, 0, 0.14, 4.62], [X, 0, 0.14, 4.62]] as const) {
    p.box(w, 0.06, d, x, 0, z, A.darkstone);
    p.box(w, 0.42, d, x, 0.06, z, wallC);
    coping(p, w, d, 0.48, x, z, gold);
  }
  // la porte : massif percé de trois passages, pavillon à double toit
  inFrame(p, 0, 0, Z, 0, (q) => {
    q.box(1.8, 0.5, 0.5, 0, 0, 0, age <= 1 ? A.wattle : A.ochreWall);
    q.box(1.84, 0.03, 0.54, 0, 0.5, 0, A.marble);
    for (const [x, w, h] of [[0, 0.3, 0.34], [-0.55, 0.22, 0.26], [0.55, 0.22, 0.26]] as const) {
      q.box(w, h - w / 2, 0.52, x, 0, 0, 0x2a1e18);
      q.add(new THREE.CylinderGeometry(w / 2, w / 2, 0.52, 8, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), x, h - w / 2, 0, 0x2a1e18);
      q.box(w * 0.9, h - w / 2, 0.02, x, 0, 0.26, age <= 1 ? A.darkwood : A.red);
    }
    if (age >= 2) for (const sx of [-1, 1]) rail(q, 0.6, sx * 0.55, 0.53, 0.24, 0, A.marble, 0.06);
    inFrame(q, 0, 0.53, 0, 0, (r) => hall(r, {
      w: 1.3, d: 0.36, h: 0.3, roof: gold, col: age <= 1 ? A.darkwood : A.red, wall: age <= 1 ? A.wattle : A.red, podium: 0, rows: 2, step: 0.09,
      roofH: 0.22, double: age >= 2, bays: 5, stairs: false, neon: neonE, glass: age >= 5,
    }));
  });
  // cour : canal et petits ponts
  const cz = 1.45;
  p.box(4.2, 0.035, 0.32, 0, 0.01, cz, A.marble);
  p.box(4.1, 0.04, 0.24, 0, 0.012, cz, A.water);
  for (const bx of [-0.7, 0, 0.7]) {
    for (let i = 0; i < 5; i++) { const t = i / 4, yy = Math.sin(t * Math.PI) * 0.06; p.box(0.26, 0.03, 0.09, bx, 0.03 + yy, cz - 0.18 + t * 0.36, A.marble); }
    for (const sx of [-1, 1]) p.box(0.02, 0.05, 0.4, bx + sx * 0.12, 0.08, cz, A.marble);
  }
  // salles latérales, tournées vers la cour
  for (const sx of [-1, 1])
    inFrame(p, sx * 2.15, 0, 0.5, -sx * Math.PI / 2, (q) => hall(q, {
      w: 1.5, d: 0.5, h: 0.34, roof: gold, col: age <= 1 ? A.darkwood : A.red, wall: age <= 1 ? A.wattle : A.red, podium: 0.08,
      rows: 1, step: 0.11, roofH: 0.22, lift: 0.07, bays: 4, stairs: true, neon: neonE, glass: age >= 5,
    }));
  // trois terrasses de marbre, balustrades, rampe impériale
  const tz = -1.15;
  for (let i = 0; i < 3; i++) {
    const tw = 4.0 - i * 0.42, td = 2.3 - i * 0.26, y = i * 0.13;
    p.box(tw, 0.13, td, 0, y, tz - i * 0.06, age <= 1 ? [0xa8916a, 0xb59e76, 0xbfa880][i] : i === 0 ? 0xcfcac0 : A.marble);
    if (age >= 2 && i !== 1) {
      for (const sx of [-1, 1]) rail(p, td - 0.04, sx * (tw / 2 - 0.02), y + 0.13, tz - i * 0.06, Math.PI / 2, A.marble, 0.06, 0.2);
      const seg = (tw - 0.9) / 2;
      for (const sx of [-1, 1]) rail(p, seg, sx * (0.45 + seg / 2), y + 0.13, tz - i * 0.06 + td / 2 - 0.02, 0, A.marble, 0.06, 0.2);
    }
  }
  stairs(p, 0.8, 0.39, 0.5, 0, 0, tz + 1.15 + 0.5, age <= 1 ? 0xa8916a : A.marble, 4, age >= 2 ? 0xd8cfae : undefined);
  // la grande salle
  inFrame(p, 0, 0.39, tz - 0.12, 0, (q) => hall(q, {
    w: 2.9, d: 1.3, h: 0.58, roof: gold, col: age <= 1 ? A.darkwood : A.red, wall: age <= 1 ? A.wattle : A.red, podium: 0.06, double: age >= 2,
    rows: 2, step: 0.1, roofH: 0.56, bays: 7, stairs: false, glass: age >= 5, neon: neonE, side: true,
    beam: age <= 1 ? A.darkwood : A.beam, ridge: age >= 2 ? dark(A.tileGold, 0.75) : undefined,
  }));
  // lions de la porte, vasques et grues de bronze sur la terrasse
  for (const sx of [-1, 1]) {
    lion(p, sx * 0.62, 1.95, 1, age >= 4 ? A.bronze : A.stone);
    if (age >= 2) {
      censer(p, sx * 0.85, -0.05, 0.8);
      p.cyl(0.12, 0.09, 0.14, 8, sx * 1.45, 0.39, -0.62, A.bronze);
      p.cyl(0.13, 0.13, 0.02, 8, sx * 1.45, 0.53, -0.62, dark(A.bronze, 0.8));
    }
    roundTree(p, sx * 1.6, 1.9, 0.55, sx > 0 ? A.maple : A.leaf, sx + v);
    pine(p, sx * 2.5, -1.95, 0.8, A.pine, sx * 2);
    stoneLantern(p, sx * 1.1, 1.0, 1.0, age >= 2);
    if (age >= 3) banner(p, sx * 1.9, -0.05, 0.85, sx > 0 ? A.red : A.gold, 0);
  }
  if (age >= 3) for (let i = 0; i < 8; i++) lantern(p, -1.4 + i * 0.4, 0.39 + 0.06 + 0.5, tz + 0.66, 0.035);
  if (age >= 4) {
    // projecteurs au pied des terrasses (Moderne), liserés au Futuriste
    for (const sx of [-1, 1]) p.box(0.06, 0.04, 0.06, sx * 1.3, 0, tz + 1.12, 0xfff4d0, 0, true);
    if (glow) for (const sx of [-1, 1]) p.box(0.02, 0.02, 2.2, sx * 2.0, 0.135, tz, A.amber, 0, 'neon');
  }
}

// ---------- Les maisons ----------

/** Fenêtre à claire-voie : cadre de bois, papier allumé la nuit, croisillon (face +z en (x, y, z), ou tournée de `ry`) */
function win(p: Parts, x: number, y: number, z: number, w: number, h: number, ry = 0, frame = A.darkwood, paper = A.paper) {
  const c = Math.cos(ry), s = Math.sin(ry);
  p.box(w + 0.024, h + 0.024, 0.01, x - s * 0.003, y - 0.012, z - c * 0.003, frame, ry);
  p.box(w, h, 0.014, x, y, z, paper, ry, true);
  p.box(0.008, h, 0.02, x, y, z, frame, ry);
  p.box(w, 0.008, 0.02, x, y + h * 0.5, z, frame, ry);
}
/** Porte à deux battants sous son linteau, et sa marche (façade +z) */
function door(p: Parts, x: number, z: number, w: number, h: number, col = A.red, frame = A.darkwood) {
  p.box(w + 0.04, h + 0.03, 0.012, x, 0, z - 0.002, frame);
  p.box(w, h, 0.016, x, 0, z + 0.002, col);
  p.box(0.006, h, 0.02, x, 0, z + 0.003, dark(col, 0.7));
  p.box(w + 0.08, 0.025, 0.07, x, 0, z + 0.03, A.stone);
}
/** Corps d'une maison (façade +z) : soubassement de pierre, murs, poteaux d'angle, sablière */
function body(p: Parts, W: number, D: number, H: number, wall: number, post = A.darkwood, x = 0, z = 0) {
  p.box(W + 0.04, 0.05, D + 0.04, x, 0, z, A.stone);
  p.box(W, H, D, x, 0.05, z, wall);
  for (const sx of [-1, 1]) p.box(0.035, H, 0.035, x + sx * (W / 2 - 0.012), 0.05, z + D / 2 - 0.012, post);
  p.box(W + 0.01, 0.03, 0.03, x, 0.05 + H - 0.03, z + D / 2 - 0.008, post);
}
/** Plante en pot (ou bonsaï) */
function potPlant(p: Parts, x: number, z: number, s = 1, col = A.leaf) {
  p.cyl(0.045 * s, 0.035 * s, 0.06 * s, 6, x, 0, z, 0x8a5a3a);
  p.sphere(0.055 * s, x, 0.1 * s, z, col, 0, 0.9);
}
/** Parapet autour d'un toit en terrasse (rectangle w × d, posé en y) */
function parapet(p: Parts, w: number, d: number, y: number, col: number, h = 0.05, t = 0.03) {
  p.box(w, h, t, 0, y, d / 2 - t / 2, col); p.box(w, h, t, 0, y, -d / 2 + t / 2, col);
  p.box(t, h, d - 2 * t, w / 2 - t / 2, y, 0, col); p.box(t, h, d - 2 * t, -w / 2 + t / 2, y, 0, col);
}

/** Maison de l'Antiquité : charpente, torchis, toit de chaume ; grenier sur pilotis, claie de séchage ou auvent selon la variante */
function hutHouse(p: Parts, v: number, w: number, d: number) {
  const W = w * 0.72, D = d * 0.62, H = 0.26, kind = v % 3, z = -d * 0.06, lac = A.redDark, fz = z + D / 2;
  body(p, W, D, H, A.wattle, lac, 0, z);
  // la charpente apparente sur le torchis : la traverse à mi-hauteur, les poteaux de l'arrière
  p.box(W + 0.012, 0.024, 0.012, 0, 0.05 + H * 0.55, fz + 0.002, A.timber);
  for (const sx of [-1, 1]) p.box(0.012, 0.024, D + 0.012, sx * (W / 2 + 0.002), 0.05 + H * 0.55, z, A.timber);
  for (const sx of [-1, 1]) p.box(0.03, H, 0.03, sx * (W / 2 - 0.01), 0.05, z - D / 2 + 0.01, A.timber);
  // la véranda de planches sur la façade, l'avant-toit porté par deux poteaux laqués
  p.box(W + 0.06, 0.035, 0.13, 0, 0.04, fz + 0.065, A.wood);
  for (const sx of [-1, 1]) p.box(0.026, H + 0.02, 0.026, sx * (W / 2 - 0.02), 0.075, fz + 0.1, lac);
  p.box(0.12, 0.03, 0.06, -W * 0.18, 0, fz + 0.15, A.stone);
  door(p, -W * 0.18, fz + 0.006, 0.12, 0.19, A.timber, A.darkwood);
  // fenêtres de papier à croisillons, allumées la nuit ; la lanterne pendue sous l'avant-toit
  win(p, W * 0.22, 0.13, fz + 0.008, 0.12, 0.09);
  win(p, W / 2 + 0.008, 0.13, z, 0.1, 0.08, Math.PI / 2);
  lantern(p, -W * 0.18 + 0.13, 0.25, fz + 0.09, 0.026);
  p.box(0.004, 0.03, 0.004, -W * 0.18 + 0.13, 0.28, fz + 0.09, A.darkwood);
  hipRoof(p, W + 0.2, D + 0.22, 0.3, 0, 0.05 + H, z, A.thatch);
  oldRidge(p, Math.max(0.12, W - D), 0, 0.05 + H + 0.3, z);
  // les pierres de gué jusqu'à la porte ; derrière, la clôture de bambou du potager et ses rangs de légumes
  for (let i = 0; i < 3; i++) p.cyl(0.045, 0.05, 0.015, 6, -W * 0.18 + (i % 2 ? 0.03 : -0.02), 0, fz + 0.26 + i * 0.1, A.stone);
  const gx = (v % 2 ? 1 : -1) * (w / 2 - 0.1), gz = -d / 2 + 0.06;
  for (let i = 0; i < 4; i++) p.box(0.016, 0.14, 0.016, gx, 0, gz + i * 0.12, A.bamboo);
  for (const y of [0.05, 0.11]) p.box(0.012, 0.012, 0.38, gx, y, gz + 0.18, dark(A.bamboo, 0.85));
  p.box(0.16, 0.025, 0.3, gx - Math.sign(gx) * 0.1, 0, gz + 0.17, 0x7a5a3a);
  for (let i = 0; i < 3; i++) p.box(0.04, 0.05, 0.26, gx - Math.sign(gx) * (0.04 + i * 0.05), 0.02, gz + 0.17, i % 2 ? A.leaf : dark(A.leaf, 1.15));
  if (kind === 0) {
    // grenier sur pilotis
    const gx = -w * 0.32, gz = d * 0.32;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.025, 0.14, 0.025, gx + sx * 0.07, 0, gz + sz * 0.07, A.timber);
    p.box(0.2, 0.14, 0.2, gx, 0.14, gz, A.wood);
    hipRoof(p, 0.3, 0.3, 0.14, gx, 0.28, gz, A.thatch);
  } else if (kind === 1) {
    // claie de séchage et jarre
    for (const sz of [-1, 1]) p.box(0.02, 0.2, 0.02, w * 0.34, 0, d * 0.32 + sz * 0.12, A.timber);
    p.box(0.012, 0.012, 0.28, w * 0.34, 0.19, d * 0.32, A.timber);
    for (let i = 0; i < 3; i++) p.box(0.006, 0.1, 0.05, w * 0.34, 0.09, d * 0.22 + i * 0.09, [0xb8a040, 0xa85a3a, 0x8a9a4a][(i + v) % 3]);
    p.cyl(0.04, 0.03, 0.08, 6, -w * 0.3, 0, d * 0.34, 0x8a5a3a);
  } else {
    // auvent sur deux poteaux et bois empilé
    for (const sx of [-1, 1]) p.box(0.025, 0.24, 0.025, sx * W * 0.4, 0, z + D / 2 + 0.16, A.timber);
    p.box(W * 0.9, 0.02, 0.2, 0, 0.24, z + D / 2 + 0.08, A.thatch);
    for (let i = 0; i < 3; i++) p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5).rotateX(Math.PI / 2), W / 2 + 0.06, 0.03 + i * 0.035, z, 0x8a6a48);
  }
}

/** Maison à cour (Médiéval, Industriel) : corps principal au fond, deux ailes, mur de façade et sa porte couverte, cour plantée */
function courtHouse(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.9, D = d * 0.86, tile = houseTile(age, v), wall = pick([A.plaster, A.plaster, 0xe8dcc6], v), H = 0.26;
  p.box(W, 0.03, D, 0, 0, 0, A.paving);
  // corps principal
  const md = D * 0.36, mz = -D / 2 + md / 2;
  body(p, W, md, H, wall, A.red, 0, mz);
  door(p, 0, mz + md / 2 + 0.006, 0.12, 0.19);
  for (const sx of [-1, 1]) win(p, sx * W * 0.28, 0.12, mz + md / 2 + 0.008, 0.14, 0.1);
  hipRoof(p, W + 0.16, md + 0.2, 0.24, 0, 0.05 + H, mz, tile, 0, { lod: true, rows: 1, step: 0.1 });
  // ailes
  const ww = W * 0.24, wd = D * 0.36, wz = mz + md / 2 + wd / 2 + 0.02;
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - ww / 2);
    p.box(ww, H * 0.86, wd, x, 0.05, wz, wall);
    win(p, x - sx * (ww / 2 + 0.006), 0.11, wz, 0.12, 0.09, -sx * Math.PI / 2);
    hipRoof(p, ww + 0.12, wd + 0.12, 0.17, x, 0.05 + H * 0.86, wz, tile, 0, { lod: true, rows: 1, step: 0.13, tips: false, ends: false });
  }
  // mur de façade et porte couverte
  const fz = D / 2 - 0.03;
  for (const sx of [-1, 1]) {
    p.box(W * 0.4, 0.22, 0.05, sx * W * 0.3, 0, fz, wall);
    p.box(W * 0.42, 0.025, 0.09, sx * W * 0.3, 0.22, fz, dark(tile, 0.85));
  }
  p.box(0.22, 0.27, 0.07, 0, 0, fz, A.red);
  p.box(0.14, 0.2, 0.08, 0, 0, fz, A.darkwood);
  hipRoof(p, 0.32, 0.18, 0.1, 0, 0.27, fz, tile, 0, { lod: true, rows: 0, hips: false });
  if (age >= 3) for (const sx of [-1, 1]) lantern(p, sx * 0.1, 0.23, fz + 0.06, 0.026);
  // la cour : arbre, jarre à poissons, pot
  const s = v % 2 ? 1 : -1;
  roundTree(p, W * 0.12 * s, 0.02, 0.36, pick([A.maple, A.leaf, A.blossom, 0xd9b23a], v >> 2), v);
  p.cyl(0.05, 0.04, 0.07, 6, -W * 0.12 * s, 0, 0.06, A.bronze);
  potPlant(p, 0.15, D * 0.3, 0.7);
}

/** Maison à véranda (Médiéval) : colonnes rouges, claire-voies, toit courbe, appentis et réserve d'eau */
function porchHouse(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.78, D = d * 0.56, H = 0.28, tile = houseTile(age, v), wall = pick([A.plaster, 0xeee4d0, A.wattle], v), z = -d * 0.08;
  p.box(W + 0.1, 0.06, D + 0.22, 0, 0, z + 0.06, A.stone);
  p.box(W, H, D, 0, 0.06, z, wall);
  for (let i = 0; i < 4; i++) p.add(new THREE.CylinderGeometry(0.02, 0.022, H, 5, 1, true).translate(0, H / 2, 0), -W / 2 + 0.03 + (i * (W - 0.06)) / 3, 0.06, z + D / 2 + 0.12, A.red);
  door(p, 0, z + D / 2 + 0.006, 0.14, 0.2);
  for (const sx of [-1, 1]) win(p, sx * W * 0.3, 0.15, z + D / 2 + 0.008, 0.16, 0.12);
  p.box(W + 0.02, 0.035, 0.03, 0, 0.06 + H - 0.035, z + D / 2 + 0.12, A.darkwood);
  hipRoof(p, W + 0.22, D + 0.42, 0.28, 0, 0.06 + H, z + 0.06, tile, 0, { lod: true, rows: 1, step: 0.1 });
  // appentis sur le côté, réserve d'eau, pot fleuri
  const sx = v % 2 ? 1 : -1;
  p.box(0.16, 0.2, D * 0.7, sx * (W / 2 + 0.08), 0.05, z - D * 0.1, A.timber);
  frustum(p, 0.2, D * 0.74, 0.04, D * 0.74, 0.08, sx * (W / 2 + 0.08) - sx * 0.08, 0.25, z - D * 0.1, tile);
  p.cyl(0.06, 0.05, 0.1, 7, -sx * (W / 2 - 0.02), 0, d * 0.36, A.darkstone);
  p.cyl(0.05, 0.05, 0.102, 7, -sx * (W / 2 - 0.02), 0, d * 0.36, A.water);
  potPlant(p, sx * W * 0.25, d * 0.38, 0.8, A.blossom);
}

/** Maison à étage (Médiéval, Industriel) : rez-de-chaussée, avant-toit, étage en retrait à balcon, toit haut */
function tallHouse(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.76, D = d * 0.66, h1 = 0.26, h2 = 0.22, tile = houseTile(age, v), wall = pick([A.plaster, 0xe9dfca], v), z = -d * 0.04;
  body(p, W, D, h1, wall, A.red, 0, z);
  door(p, -W * 0.22, z + D / 2 + 0.006, 0.12, 0.19);
  win(p, W * 0.18, 0.13, z + D / 2 + 0.008, 0.22, 0.11);
  hipRoof(p, W + 0.2, D + 0.2, 0.1, 0, 0.05 + h1, z, tile, 0, { lod: true, rows: 1, step: 0.1, hips: false, ends: false });
  const y2 = 0.05 + h1 + 0.06, uw = W * 0.84, ud = D * 0.78;
  p.box(uw, h2, ud, 0, y2, z, wall);
  for (const sx of [-1, 1]) win(p, sx * uw * 0.22, y2 + 0.06, z + ud / 2 + 0.008, 0.14, 0.1);
  rail(p, uw + 0.06, 0, y2 - 0.01, z + ud / 2 + 0.05, 0, A.red, 0.06, 0.15);
  p.box(uw + 0.06, 0.015, 0.08, 0, y2 - 0.015, z + ud / 2 + 0.03, A.darkwood);
  hipRoof(p, uw + 0.18, ud + 0.2, 0.24, 0, y2 + h2, z, tile, 0, { lod: true, rows: 1, step: 0.1 });
  if (age >= 3) for (const sx of [-1, 1]) lantern(p, sx * W * 0.4, 0.05 + h1 - 0.03, z + D / 2 + 0.08, 0.026);
  bamboo(p, (v % 2 ? 1 : -1) * w * 0.38, d * 0.36, 0.4, v);
}

/** Maison-boutique (Industriel) : rez ouvert sur la rue (comptoir, marchandises), étage à balcon, enseigne et lanternes */
function shopHouse(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.86, D = d * 0.74, h1 = 0.3, h2 = 0.26, tile = houseTile(age, v), wall = pick([A.plaster, 0xe6dccb, 0xd9cdb8, 0xe8d4b8], v), z = -d * 0.04;
  p.box(W + 0.04, 0.05, D + 0.04, 0, 0, z, A.stone);
  p.box(W, h1, D - 0.12, 0, 0.05, z - 0.06, wall);
  // la boutique : intérieur éclairé, comptoir, marchandises, piliers
  p.box(W * 0.8, h1 * 0.6, 0.014, 0, 0.1, z + D / 2 - 0.11, A.win, 0, true);
  p.box(W * 0.8, 0.1, 0.06, 0, 0.05, z + D / 2 - 0.06, A.timber);
  for (let i = 0; i < 4; i++) p.box(0.06, 0.04, 0.04, -W * 0.3 + i * W * 0.2, 0.15, z + D / 2 - 0.06, [0xd9a43c, 0x9a3a2a, 0x6a8a3a, 0xc8783a][(i + v) % 4]);
  for (const sx of [-1, 1]) p.box(0.03, h1, 0.03, sx * (W / 2 - 0.015), 0.05, z + D / 2 - 0.015, A.red);
  p.box(W + 0.18, 0.02, 0.18, 0, 0.05 + h1, z + D / 2 + 0.03, dark(tile, 0.9));
  // l'étage
  const y2 = 0.07 + h1;
  p.box(W, h2, D, 0, y2, z, wall);
  for (let i = 0; i < 3; i++) win(p, -W * 0.3 + i * W * 0.3, y2 + 0.07, z + D / 2 + 0.008, 0.12, 0.12);
  rail(p, W, 0, y2, z + D / 2 + 0.06, 0, A.red, 0.06, 0.15);
  p.box(W, 0.015, 0.08, 0, y2 - 0.005, z + D / 2 + 0.03, A.darkwood);
  hipRoof(p, W + 0.18, D + 0.2, 0.26, 0, y2 + h2, z, tile, 0, { lod: true, rows: 1, step: 0.1 });
  // l'enseigne verticale (des traits dorés figurent l'écriture) et les lanternes
  const sx = v % 2 ? 1 : -1;
  p.box(0.05, 0.36, 0.1, sx * (W / 2 + 0.03), 0.12, z + D / 2 - 0.04, pick([A.red, 0x2f4f6f, 0x1f3a2a], v >> 1));
  for (let i = 0; i < 3; i++) p.box(0.054, 0.05, 0.05, sx * (W / 2 + 0.03), 0.18 + i * 0.09, z + D / 2 - 0.04, A.gold);
  for (const lx of [-1, 1]) lantern(p, lx * W * 0.36, 0.05 + h1 - 0.05, z + D / 2 + 0.08, 0.03);
}

/** Maison de brique grise à arcades (Industriel) : galerie couverte sur la rue, deux étages, balcon de fer */
function arcadeHouse(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.86, D = d * 0.72, H = 0.62, brick = pick([0x8e8a84, 0x9a948a, 0xa08a7a], v), tile = houseTile(age, v), z = -d * 0.05, fz = z + D / 2;
  p.box(W, H, D - 0.16, 0, 0, z - 0.08, brick);
  p.box(W, H - 0.26, 0.16, 0, 0.26, fz - 0.08, brick);
  for (let i = 0; i <= 3; i++) p.box(0.04, 0.26, 0.04, -W / 2 + 0.02 + (i * (W - 0.04)) / 3, 0, fz - 0.02, brick);
  for (let i = 0; i < 3; i++) p.box(W / 3 - 0.08, 0.18, 0.012, -W / 3 + (i * W) / 3, 0.04, fz - 0.154, A.win, 0, true);
  for (let f = 0; f < 2; f++) for (let i = 0; i < 3; i++) win(p, -W * 0.3 + i * W * 0.3, 0.32 + f * 0.15, fz + 0.006, 0.09, 0.1, 0, 0x5a4a3a, A.win);
  rail(p, W * 0.9, 0, 0.3, fz + 0.05, 0, 0x3a3a3e, 0.06, 0.12);
  p.box(W * 0.92, 0.012, 0.06, 0, 0.3, fz + 0.025, 0x3a3a3e);
  p.box(W * 0.5, 0.06, 0.012, 0, 0.27, fz + 0.006, pick([A.red, 0x2f4f6f], v));
  p.box(W + 0.02, 0.03, D + 0.02, 0, H, z, 0xb8b2a8);
  hipRoof(p, W + 0.12, D + 0.12, 0.2, 0, H + 0.03, z, tile, 0, { lod: true, rows: 1, step: 0.1 });
}

/** Immeuble (Moderne) : béton, balcons, climatiseurs, enseignes au néon ; un jardin et un pavillon courbe sur le toit pour certains */
function modernBlock(p: Parts, v: number, w: number, d: number, r: () => number) {
  const W = w * 0.86, D = d * 0.8, kind = v % 3, floors = kind === 1 ? 3 : 4 + Math.floor(r() * 3), fh = 0.24, H = floors * fh;
  const wall = pick([A.concrete, 0xe8e2d6, 0xcfd3d6, 0xe0d0c0, 0xc9d3c8, 0xd9c0b0, 0xe8dcc0, 0xb8c4cc], v);
  p.box(W, H, D, 0, 0, 0, wall);
  // la boutique du rez : store de couleur et étal sur le trottoir
  const awn = pick([A.red, 0x2f6f9e, 0x3f7a6a, A.ochre, 0x8a4f7a], v + 1);
  p.add(new THREE.BoxGeometry(W * 0.86, 0.012, 0.14).rotateX(0.35), 0, 0.2, D / 2 + 0.07, awn);
  for (let i = 0; i < 3; i++) p.box(0.07, 0.05, 0.06, -W * 0.25 + i * W * 0.25, 0, D / 2 + 0.06, pick([0xd9a43c, 0x9a3a2a, 0x6a8a3a, 0xc8783a], i + v));
  // bandeaux vitrés par étage, trumeaux
  for (let f = 1; f < floors; f++) p.box(W + 0.012, 0.1, D + 0.012, 0, f * fh + 0.08, 0, 0x9eb8c4, 0, true);
  for (const sx of [-1, -0.33, 0.33, 1]) p.box(0.05, H - fh, D + 0.024, sx * (W / 2 - 0.025), fh, 0, wall);
  // balcons de façade et climatiseurs
  for (let f = 1; f < floors; f++) {
    p.box(W * 0.8, 0.02, 0.09, 0, f * fh, D / 2 + 0.045, 0xbababa);
    p.box(W * 0.8, 0.05, 0.01, 0, f * fh + 0.02, D / 2 + 0.09, 0x9a9a9a);
    if ((f + v) % 2) p.box(0.07, 0.05, 0.05, W * 0.3, f * fh + 0.13, D / 2 + 0.03, 0xdadada);
  }
  // rez : vitrine, enseigne lumineuse, enseigne verticale
  p.box(W * 0.8, 0.14, 0.012, 0, 0.03, D / 2 + 0.006, 0x9eb8c4, 0, true);
  p.box(W * 0.84, 0.06, 0.03, 0, 0.18, D / 2 + 0.015, pick([0xff4040, 0x40c0ff, 0xffa030, 0x60ff90], v >> 1), 0, 'neon');
  p.box(0.05, Math.min(H * 0.6, 0.8), 0.12, (v % 2 ? 1 : -1) * (W / 2 + 0.03), fh, D * 0.3, pick([A.pink, A.cyan, A.amber], v), 0, 'neon');
  if (kind === 2) {
    p.box(W * 0.9, 0.04, D * 0.9, 0, H, 0, A.moss);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 4, 1, true).translate(0, 0.08, 0), sx * 0.12, H + 0.04, sz * 0.12, A.red);
    hipRoof(p, 0.4, 0.4, 0.14, 0, H + 0.2, 0, A.tileG, 0, { lod: true, rows: 0 });
    potPlant(p, W * 0.3, D * 0.3, 1.2); potPlant(p, -W * 0.3, -D * 0.25, 1.2, A.maple);
  } else {
    parapet(p, W, D, H, wall);
    p.cyl(0.06, 0.06, 0.12, 7, -W * 0.22, H, -D * 0.2, 0xd8d8d8);
    p.box(0.12, 0.08, 0.1, W * 0.2, H, D * 0.1, 0xbcbcbc);
    if (kind === 1) {
      // l'enseigne sur le toit
      for (const sx of [-1, 1]) p.box(0.02, 0.14, 0.02, sx * W * 0.3, H, D * 0.3, 0x6a6a6a);
      p.box(W * 0.7, 0.13, 0.02, 0, H + 0.1, D * 0.3, pick([A.pink, A.cyan, A.amber, 0x9aff6a], v + 1), 0, 'neon');
    }
    // la vie du toit : château d'eau en tonneau sur ses pieds, linge qui sèche, ou dalle de couleur et paraboles
    const roof = (v >> 2) % 3;
    if (roof === 0) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.015, 0.12, 0.015, W * 0.22 + sx * 0.06, H, -D * 0.2 + sz * 0.06, A.darkwood);
      p.cyl(0.09, 0.09, 0.14, 8, W * 0.22, H + 0.12, -D * 0.2, A.timber);
      p.cone(0.1, 0.07, 8, W * 0.22, H + 0.26, -D * 0.2, A.darkwood);
      for (const y of [0.15, 0.22]) p.cyl(0.093, 0.093, 0.012, 8, W * 0.22, H + y, -D * 0.2, 0x3a3a3e);
    } else if (roof === 1) {
      for (const sx of [-1, 1]) p.box(0.012, 0.16, 0.012, sx * W * 0.36, H, D * 0.05, 0x8a9096);
      p.box(W * 0.72, 0.004, 0.004, 0, H + 0.15, D * 0.05, 0x3a3a3e);
      for (let i = 0; i < 4; i++) p.box(0.07, 0.07, 0.004, -W * 0.26 + i * W * 0.17, H + 0.08, D * 0.05, pick([0xf2ead8, A.red, 0x2f6f9e, A.amber, 0x6a8a3a], v + i));
    } else {
      p.box(W * 0.5, 0.008, D * 0.4, -W * 0.15, H, D * 0.12, pick([0x3f7a6a, 0x9a5a4a, 0x5a6a8a], v));
      for (let i = 0; i < 2; i++) p.add(new THREE.CylinderGeometry(0.05, 0.008, 0.02, 8).rotateX(-0.8), W * 0.3, H + 0.06, D * 0.25 - i * 0.12, 0xf0f0f0);
    }
  }
}

/** Tour (Futuriste) : étages de verre allumés, jupes de toits courbes à liseré de néon, terrasses plantées, toit courbe au sommet */
function futureTower(p: Parts, v: number, w: number, d: number, r: () => number) {
  const W = w * 0.8, D = d * 0.76, roofC = pick([A.tileG, A.tileB, 0x8a5a4a, A.tileG], v), neon = pick([A.cyan, A.amber, A.pink], v >> 2);
  if (v % 4 === 3) {
    // pavillon de verre bas, toit flottant, bambous
    p.box(w * 0.92, 0.05, d * 0.92, 0, 0, 0, 0xd8d8d0);
    p.box(W, 0.32, D, 0, 0.05, 0, A.glass, 0, true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.03, 0.4, 0.03, sx * W / 2, 0.05, sz * D / 2, 0xf2f0ea);
    hipRoof(p, W + 0.16, D + 0.16, 0.14, 0, 0.45, 0, roofC, 0, { lod: true, rows: 1, step: 0.12, glow: 'neon', edge: neon, lift: 0.06 });
    for (const sx of [-1, 1]) bamboo(p, sx * w * 0.4, d * 0.38, 0.35, v + sx);
    return;
  }
  const floors = 6 + Math.floor(r() * 6), fh = 0.22, tw = W * 0.8, td = D * 0.8;
  p.box(W, 0.1, D, 0, 0, 0, 0xd8d8d0);
  let y = 0.1;
  for (let f = 0; f < floors; f++, y += fh) {
    p.box(tw, fh * 0.7, td, 0, y, 0, A.glass, 0, true);
    p.box(tw + 0.02, fh * 0.3, td + 0.02, 0, y + fh * 0.7, 0, 0xf2f0ea);
    if (f % 3 === 2 && f < floors - 1) {
      hipRoof(p, tw + 0.24, td + 0.24, 0.08, 0, y + fh * 0.98, 0, roofC, 0, { lod: true, rows: 0, hips: false, glow: 'neon', edge: neon, t: 0.02 });
      p.box(tw * 0.9, 0.04, 0.05, 0, y + fh + 0.02, td / 2 + 0.06, A.moss);
    }
  }
  for (const sx of [-1, 1]) p.box(0.02, y - 0.1, 0.02, sx * (tw / 2 + 0.012), 0.1, td / 2 + 0.012, neon, 0, 'neon');
  hipRoof(p, tw + 0.2, td + 0.2, 0.3, 0, y, 0, roofC, 0, { lod: true, rows: 1, step: 0.11, glow: 'neon', edge: neon });
  p.cyl(0.008, 0.008, 0.3, 4, 0, y + 0.3, 0, 0xdddddd);
  p.sphere(0.02, 0, y + 0.6, 0, neon);
}

/** Une maison de la ville, selon l'âge et la variante (lot w × d, façade +z sur la rue) */
export function aHouse(p: Parts, age: number, v: number, w: number, d: number) {
  const r = mulberry32(v + 23), big = w > 1.05 && d > 0.95;
  if (age <= 1) return hutHouse(p, v, w, d);
  if (age === 2) {
    const k = v % 4;
    if (k === 0 && big) return courtHouse(p, age, v, w, d);
    if (k === 2) return tallHouse(p, age, v, w, d);
    return porchHouse(p, age, v, w, d);
  }
  if (age === 3) {
    const k = v % 4;
    if (k === 0 && big) return courtHouse(p, age, v, w, d);
    if (k === 3) return arcadeHouse(p, age, v, w, d);
    if (k === 2) return tallHouse(p, age, v, w, d);
    return shopHouse(p, age, v, w, d);
  }
  if (age === 4) return modernBlock(p, v, w, d, r);
  return futureTower(p, v, w, d, r);
}

// ---------- Le salon de thé ----------

/**
 * Le salon de thé (lot 1,8 × 1,6) : pavillon de chaume ouvert à l'Antiquité ; puis pavillon à étage, galerie à balustrade,
 * double toit, lanternes, tables sous parasols sur la terrasse ; enseigne au néon et guirlande au Moderne ; verre et toits
 * à liseré au Futuriste
 */
export function aTeahouse(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.62, D = d * 0.56, tile = age >= 4 ? A.tileG : houseTile(Math.max(2, age), v + 1), z = -d * 0.1;
  p.box(w * 0.94, 0.04, d * 0.92, 0, 0, 0, age <= 1 ? 0xa8946c : A.paving);
  const table = (x: number, tz: number, para: boolean) => {
    p.cyl(0.07, 0.07, 0.015, 7, x, 0.1, tz, A.timber);
    p.cyl(0.015, 0.02, 0.1, 4, x, 0, tz, A.darkwood);
    for (const sx of [-1, 1]) p.box(0.05, 0.05, 0.05, x + sx * 0.12, 0, tz, A.timber);
    p.cyl(0.015, 0.015, 0.02, 5, x, 0.115, tz, 0xe8e0d0);
    if (para) { p.cyl(0.006, 0.006, 0.34, 4, x, 0.1, tz, A.darkwood); p.cone(0.16, 0.06, 8, x, 0.42, tz, pick([A.red, 0xe8c070, 0x3f7262], v + Math.round(x * 10))); }
  };
  if (age <= 1) {
    // pavillon ouvert : poteaux laqués, plancher, balustrade sur trois côtés, bancs à coussins, foyer et bouilloire
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.045, 0.32, 0.045, sx * W / 2, 0.04, z + sz * D / 2, A.redDark);
    p.box(W + 0.06, 0.05, D + 0.06, 0, 0.04, z, A.wood);
    p.box(W + 0.1, 0.02, D + 0.1, 0, 0.02, z, A.stone);
    rail(p, W, 0, 0.09, z - D / 2, 0, A.redDark, 0.08, 0.2);
    for (const sx of [-1, 1]) rail(p, D, sx * W / 2, 0.09, z, Math.PI / 2, A.redDark, 0.08, 0.2);
    for (const sz of [-1, 1]) { p.box(W * 0.8, 0.06, 0.1, 0, 0.09, z + sz * D * 0.3, A.timber); for (let i = 0; i < 3; i++) p.box(0.08, 0.016, 0.07, -W * 0.27 + i * W * 0.27, 0.15, z + sz * D * 0.3, pick([0x2f4a6a, A.ochre, 0x6a3a3a], i + v)); }
    p.cyl(0.06, 0.07, 0.06, 6, 0, 0.09, z, A.darkstone);
    p.box(0.05, 0.02, 0.05, 0, 0.12, z, 0xff8a3a, 0, true);
    p.cyl(0.035, 0.04, 0.05, 6, 0, 0.15, z, A.bronze);
    p.add(new THREE.BoxGeometry(0.03, 0.008, 0.008).rotateZ(0.5), 0.045, 0.19, z, A.bronze);
    // l'étagère des jarres à thé, contre la balustrade du fond
    p.box(W * 0.5, 0.012, 0.06, 0, 0.2, z - D / 2 + 0.05, A.timber);
    for (let i = 0; i < 4; i++) p.cyl(0.022, 0.026, 0.05, 6, -W * 0.18 + i * W * 0.12, 0.212, z - D / 2 + 0.05, pick([0x5a6a4a, 0x8a5a3a, 0x3a4a5a], i + v));
    hipRoof(p, W + 0.3, D + 0.3, 0.32, 0, 0.36, z, A.thatch);
    oldRidge(p, Math.max(0.12, W - D), 0, 0.68, z);
    // les lanternes de papier aux quatre coins, sous l'avant-toit, et la bannière du thé à son mât
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { lantern(p, sx * (W / 2 + 0.06), 0.27, z + sz * (D / 2 + 0.06), 0.03); p.box(0.004, 0.05, 0.004, sx * (W / 2 + 0.06), 0.31, z + sz * (D / 2 + 0.06), A.darkwood); }
    p.cyl(0.012, 0.016, 0.62, 4, w * 0.4, 0, d * 0.12, A.darkwood);
    p.box(0.012, 0.26, 0.11, w * 0.4, 0.3, d * 0.12 + 0.06, A.paper); p.box(0.014, 0.12, 0.05, w * 0.4, 0.38, d * 0.12 + 0.06, A.red);
    // les tables de la terrasse, les pierres de gué, le bambou et la lanterne de pierre
    table(-w * 0.28, d * 0.32, false); table(w * 0.18, d * 0.36, false);
    for (let i = 0; i < 3; i++) p.cyl(0.05, 0.055, 0.015, 6, -0.04 + (i % 2) * 0.06, 0.04, z + D / 2 + 0.12 + i * 0.12, A.stone);
    bamboo(p, -w * 0.42, -d * 0.36, 0.45, v);
    stoneLantern(p, w * 0.4, -d * 0.36, 0.8);
    return;
  }
  const glass = age >= 5, wall = glass ? A.glass : A.plaster, col = glass ? 0xf2f0ea : A.red, neon = age >= 5 ? A.cyan : undefined;
  // rez : piliers, claire-voies
  p.box(W + 0.2, 0.06, D + 0.2, 0, 0.04, z, A.stone);
  p.box(W - 0.1, 0.3, D - 0.1, 0, 0.1, z, wall, 0, glass);
  for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 5, 1, true).translate(0, 0.15, 0), sx * W / 2, 0.1, z + sz * D / 2, col);
  if (!glass) for (let i = 0; i < 3; i++) win(p, -W * 0.33 + i * W * 0.33, 0.14, z + D / 2 - 0.044, W * 0.24, 0.18);
  // galerie de l'étage, avant-toit bas
  p.box(W + 0.24, 0.03, D + 0.24, 0, 0.4, z, A.darkwood);
  for (const sz of [-1, 1]) rail(p, W + 0.22, 0, 0.43, z + sz * (D / 2 + 0.11), 0, col, 0.07, 0.12);
  for (const sx of [-1, 1]) rail(p, D + 0.22, sx * (W / 2 + 0.11), 0.43, z, Math.PI / 2, col, 0.07, 0.12);
  hipRoof(p, W + 0.44, D + 0.44, 0.1, 0, 0.36, z, tile, 0, { lod: true, rows: 1, step: 0.11, hips: false, ends: false, glow: neon ? 'neon' : false, edge: neon });
  // l'étage et son toit
  p.box(W * 0.8, 0.26, D * 0.8, 0, 0.43, z, wall, 0, glass);
  if (!glass) for (const sz of [-1, 1]) for (let i = 0; i < 2; i++) win(p, -W * 0.2 + i * W * 0.4, 0.49, z + sz * (D * 0.4 + 0.008), W * 0.26, 0.13, sz < 0 ? Math.PI : 0);
  hipRoof(p, W * 0.8 + 0.4, D * 0.8 + 0.4, 0.34, 0, 0.69, z, tile, 0, { lod: true, rows: 2, step: 0.1, glow: neon ? 'neon' : false, edge: neon });
  // lanternes aux coins, enseigne, tables sur la terrasse
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lantern(p, sx * (W / 2 + 0.16), 0.36, z + sz * (D / 2 + 0.16), 0.032);
  p.box(0.3, 0.09, 0.02, 0, 0.3, z + D / 2 + 0.12, age === 4 ? A.pink : A.redDark, 0, age === 4 ? 'neon' : false);
  if (age < 4) p.box(0.22, 0.05, 0.022, 0, 0.32, z + D / 2 + 0.122, A.gold);
  for (const [tx, tz] of [[-w * 0.3, d * 0.33], [0.02, d * 0.36], [w * 0.32, d * 0.31]]) table(tx, tz, age >= 3);
  if (age === 4) for (let i = 0; i < 7; i++) p.box(0.02, 0.02, 0.02, -w * 0.4 + i * w * 0.13, 0.38 - Math.sin((i / 6) * Math.PI) * 0.06, d * 0.44, 0xffe0a0, 0, true);
  bamboo(p, -w * 0.42, -d * 0.36, 0.45, v);
  if (age >= 3) potPlant(p, w * 0.4, -d * 0.38, 1, A.blossom);
}

// ---------- Le marché, puis la bourse ----------

/** Étal dans la halle : planche, marchandises */
function stallIn(p: Parts, x: number, z: number, goods: number[], i: number) {
  p.box(0.6, 0.13, 0.3, x, 0.06, z, A.timber);
  for (let j = 0; j < 3; j++) p.box(0.14, 0.05, 0.14, x - 0.18 + j * 0.18, 0.19, z, pick(goods, i + j));
}
/** Bandeau de claire-voies allumées sur les quatre faces d'un bloc w × d, posé en y */
function windowStrip(p: Parts, w: number, d: number, y: number, h: number) {
  p.box(w + 0.012, h, d + 0.012, 0, y, 0, A.paper, 0, true);
  const n = Math.max(2, Math.round(w / 0.2));
  for (let i = 0; i <= n; i++) p.box(0.02, h, d + 0.02, -w / 2 + (i * w) / n, y, 0, A.redDark);
}

/** Le marché (lot 4 × 4) : étals sous petits toits, puis halle couverte ; la bourse au Moderne et au Futuriste */
export function aMarket(p: Parts, age: number, v: number) {
  p.box(3.9, 0.035, 3.9, 0, 0, 0, age <= 1 ? 0xb4a482 : A.paving);
  const goods = [0x8a9a3a, 0xc8783a, 0xd8c070, 0x9a3a2a, 0xe0b440, 0x6a8a3a];
  const stall = (x: number, z: number, ry: number, i: number) => inFrame(p, x, 0, z, ry, (q) => {
    q.box(0.62, 0.14, 0.36, 0, 0, 0, A.timber);
    for (let j = 0; j < 3; j++) q.cyl(0.06, 0.05, 0.06, 6, -0.18 + j * 0.18, 0.14, 0.04, pick(goods, i + j));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) q.box(0.025, 0.4, 0.025, sx * 0.3, 0, sz * 0.17, A.darkwood);
    if (age <= 1) hipRoof(q, 0.82, 0.58, 0.18, 0, 0.4, 0, A.thatch);
    else {
      hipRoof(q, 0.8, 0.56, 0.16, 0, 0.4, 0, houseTile(age, i + v), 0, { lod: true, rows: 1, step: 0.14 });
      lantern(q, 0.3, 0.36, 0.26, 0.026);
    }
  });
  if (age <= 2) {
    // deux rangées d'étals face à l'allée, un puits au centre, ballots ; le pavillon du gardien du marché (Médiéval)
    for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) if (!(age === 2 && sz < 0 && (i === 1 || i === 2))) stall(-1.35 + i * 0.9, sz * 1.15, sz > 0 ? Math.PI : 0, i + (sz > 0 ? 4 : 0));
    p.cyl(0.16, 0.18, 0.12, 8, 0, 0, 0.1, A.stone); p.cyl(0.13, 0.13, 0.122, 8, 0, 0, 0.1, A.water);
    for (const sx of [-1, 1]) p.box(0.025, 0.3, 0.025, sx * 0.15, 0.12, 0.1, A.timber);
    p.box(0.34, 0.025, 0.025, 0, 0.42, 0.1, A.timber);
    for (let i = 0; i < 5; i++) p.box(0.12, 0.08, 0.1, -1.6 + i * 0.12, 0, 0.55 + (i % 2) * 0.12, [0x9a7a5a, 0x7a6a4a, 0xb8a070][i % 3]);
    if (age === 2) inFrame(p, 0, 0, -1.25, 0, (q) => {
      hall(q, { w: 1.1, d: 0.6, h: 0.3, roof: A.tile, podium: 0.08, rows: 2, step: 0.1, roofH: 0.18, bays: 3, double: true });
      banner(q, 0.7, 0.2, 0.7, A.red);
    });
    return;
  }
  if (age === 3) {
    // la halle : charpente ouverte sur colonnes, lanterneau, étals dedans, lanternes sous l'avant-toit, enseigne
    const W = 3.3, D = 2.3, H = 0.5;
    p.box(W + 0.2, 0.06, D + 0.2, 0, 0, 0, A.stone);
    for (let i = 0; i <= 6; i++) for (const sz of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, H, 6, 1, true).translate(0, H / 2, 0), -W / 2 + (i * W) / 6, 0.06, sz * D / 2, A.red);
    for (const sx of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, H, 6, 1, true).translate(0, H / 2, 0), sx * W / 2, 0.06, 0, A.red);
    p.box(W + 0.06, 0.06, D + 0.06, 0, 0.06 + H - 0.06, 0, A.beam);
    for (let i = 0; i < 4; i++) for (const sz of [-1, 1]) stallIn(p, -1.2 + i * 0.8, sz * 0.55, goods, i + v + (sz > 0 ? 3 : 0));
    hipRoof(p, W + 0.36, D + 0.36, 0.34, 0, 0.06 + H, 0, A.tile, 0, { rows: 1, step: 0.11, ends: false });
    p.box(W * 0.6, 0.36, D * 0.42, 0, 0.06 + H + 0.1, 0, A.plaster);
    windowStrip(p, W * 0.6, D * 0.42, 0.06 + H + 0.3, 0.1);
    hipRoof(p, W * 0.6 + 0.36, D * 0.42 + 0.36, 0.38, 0, 0.06 + H + 0.46, 0, A.tileG, 0, { rows: 2, step: 0.11 });
    for (let i = 0; i < 9; i++) lantern(p, -1.6 + i * 0.4, 0.06 + H - 0.04, D / 2 + 0.16, 0.03);
    p.box(0.5, 0.14, 0.02, 0, 0.06 + H + 0.06, D / 2 + 0.24, A.redDark);
    p.box(0.4, 0.07, 0.022, 0, 0.06 + H + 0.095, D / 2 + 0.242, A.gold);
    for (let i = 0; i < 3; i++) p.box(0.2, 0.12, 0.16, -1.6 + i * 0.24, 0, 1.6, [0x9a7a5a, 0x7a6a4a, 0xb8a070][i]);
    return;
  }
  // la bourse : socle, portique de colonnes, salle vitrée, bandeau des cours au néon, couronne de toit courbe
  const glass = age >= 5, W = 3.0, D = 2.0, fl = age === 4 ? 3 : 2, fh = 0.36, y0 = 0.16;
  p.box(3.6, 0.08, 3.4, 0, 0, -0.2, 0xd6d2c8);
  stairs(p, 2.0, 0.16, 0.36, 0, 0, 1.5, 0xe2ded4, 3);
  p.box(W + 0.1, 0.16, D + 0.1, 0, 0, -0.35, 0xe2ded4);
  if (!glass) {
    p.box(W, fl * fh, D, 0, y0, -0.35, 0xe8e4dc);
    for (let f = 0; f < fl; f++) p.box(W + 0.012, 0.16, D + 0.012, 0, y0 + f * fh + 0.12, -0.35, A.win, 0, true);
    for (let i = 0; i <= 8; i++) p.box(0.05, fl * fh, 0.05, -W / 2 + (i * W) / 8, y0, -0.35 + D / 2 + 0.01, 0xe8e4dc);
    // portique, bandeau des cours, toits
    for (let i = 0; i < 6; i++) p.cyl(0.05, 0.055, fl * fh * 0.66, 8, -1.25 + i * 0.5, y0, 0.85, 0xf2efe8);
    p.box(2.8, 0.1, 0.3, 0, y0 + fl * fh * 0.66, 0.8, 0xf2efe8);
    p.box(2.4, 0.06, 0.02, 0, y0 + fl * fh * 0.66 + 0.02, 0.96, A.amber, 0, 'neon');
    hipRoof(p, 3.0, 0.5, 0.18, 0, y0 + fl * fh * 0.66 + 0.1, 0.8, A.tileG, 0, { rows: 1, step: 0.11, ridge: A.gold });
    hipRoof(p, W + 0.4, D + 0.4, 0.5, 0, y0 + fl * fh, -0.35, A.tileG, 0, { rows: 2, step: 0.11, ridge: A.gold });
    for (const sx of [-1, 1]) { p.cyl(0.012, 0.012, 1.0, 4, sx * 1.6, 0.08, 1.35, 0xcfcfcf); p.box(0.012, 0.16, 0.24, sx * 1.6, 0.88, 1.47, A.red); }
    lion(p, -0.75, 1.6, 1.1, A.bronze); lion(p, 0.75, 1.6, 1.1, A.bronze);
  } else {
    // verre, toits flottants à liseré, anneau des cours au-dessus
    p.box(W, fl * fh, D, 0, y0, -0.35, A.glass, 0, true);
    for (let i = 0; i <= 6; i++) p.box(0.03, fl * fh, D + 0.02, -W / 2 + (i * W) / 6, y0, -0.35, 0xf2f0ea);
    hipRoof(p, W + 0.5, D + 0.5, 0.16, 0, y0 + fh + 0.02, -0.35, A.tileB, 0, { rows: 1, step: 0.12, hips: false, glow: 'neon', edge: A.cyan });
    hipRoof(p, W * 0.8, D * 0.8, 0.5, 0, y0 + fl * fh + 0.1, -0.35, A.tileB, 0, { rows: 2, step: 0.12, glow: 'neon', edge: A.cyan, ridge: A.gold });
    p.add(new THREE.TorusGeometry(0.9, 0.025, 4, 24).rotateX(Math.PI / 2), 0, y0 + fl * fh + 0.9, -0.35, A.amber, 0, 'neon');
    for (let i = 0; i < 4; i++) p.box(0.4, 0.02, 0.02, -0.6 + i * 0.4, 0.17, 1.1, A.cyan, 0, 'neon');
  }
  for (const sx of [-1, 1]) for (const sz of [0.5, 1.4]) potPlant(p, sx * 1.75, sz, 1.4);
}

// ---------- Les ateliers ----------

/** Atelier (lot d'une maison) : potier au four couché, ou teinturier de la soie ; brique et cheminée ; usine ; laboratoire */
export function aWorkshop(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.86, D = d * 0.8, tile = houseTile(age, v);
  if (age <= 2) {
    if (v % 2 === 0) {
      // le potier : long four voûté couché sur la pente, sa cheminée, l'abri, le tour, les jarres qui sèchent
      p.add(new THREE.CylinderGeometry(0.11, 0.11, W * 0.8, 7, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), 0, 0.02, -D * 0.28, 0xa8644a, 0, false, 0.08);
      p.cyl(0.05, 0.06, 0.38, 6, W * 0.4, 0, -D * 0.28, 0x8a5440);
      for (let i = 0; i < 4; i++) p.box(0.04, 0.04, 0.01, -W * 0.3 + i * W * 0.2, 0.05, -D * 0.28 + 0.11, 0x3a2420);
      for (const sx of [-1, 1]) for (const zz of [D * 0.2, -D * 0.02]) p.box(0.025, 0.24, 0.025, sx * W * 0.38, 0, zz, A.timber);
      hipRoof(p, W * 0.9, D * 0.42, 0.16, 0, 0.24, D * 0.09, age <= 1 ? A.thatch : tile, 0, { lod: true, rows: 1, step: 0.1 });
      p.box(0.18, 0.1, 0.12, -W * 0.15, 0, D * 0.09, A.timber);
      p.cyl(0.05, 0.05, 0.02, 8, -W * 0.15, 0.1, D * 0.09, 0x9a7a5a);
      for (let i = 0; i < 6; i++) p.cyl(0.03, 0.04, 0.07, 6, W * 0.05 + (i % 3) * 0.08, 0, D * 0.36 + ((i >> 1) & 1) * 0.08, pick([0x6a8aa0, 0xb88a5a, 0x5a7a6a], i + v));
      // le feu qui luit dans la gueule du four, le bois empilé, le rideau d'enseigne et la lanterne sous l'abri, le bambou
      p.box(0.06, 0.05, 0.012, -W * 0.4, 0.04, -D * 0.28 + 0.1, 0xff8a3a, 0, true);
      for (let i = 0; i < 4; i++) p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 5).rotateX(Math.PI / 2), -W * 0.44 + (i % 2) * 0.04, 0.02 + Math.floor(i / 2) * 0.034, D * 0.12 + (i % 2) * 0.02 - 0.01, 0x8a6a48);
      for (let i = 0; i < 3; i++) p.box(0.07, 0.11, 0.006, -W * 0.08 + i * 0.075, 0.12, D * 0.3 + 0.01, 0x2f4a6a);
      p.box(0.006, 0.03, 0.006, 0, 0.115, D * 0.3 + 0.01, 0xf2ead8);
      lantern(p, W * 0.3, 0.17, D * 0.3, 0.026);
      p.cyl(0.035, 0.035, 0.012, 6, -W * 0.15, 0.115, D * 0.09, 0xb88a5a);
      bamboo(p, W * 0.44, -D * 0.46, 0.5, v);
    } else {
      // le teinturier : petite maison, perches où sèchent les soies de couleur, cuves
      p.box(W * 0.5, 0.24, D * 0.4, -W * 0.22, 0, -D * 0.25, age <= 1 ? A.wattle : A.plaster);
      hipRoof(p, W * 0.5 + 0.14, D * 0.4 + 0.14, 0.18, -W * 0.22, 0.24, -D * 0.25, age <= 1 ? A.thatch : tile, 0, { lod: true, rows: 1, step: 0.1 });
      for (const sx of [-1, 1]) p.box(0.02, 0.36, 0.02, sx * W * 0.42, 0, D * 0.12, A.timber);
      for (const k of [0, 1]) p.box(W * 0.86, 0.015, 0.015, 0, 0.34, D * 0.12 + (k - 0.5) * 0.12, A.timber);
      for (let i = 0; i < 5; i++) for (const k of [0, 1]) p.box(0.1, 0.22, 0.006, -W * 0.34 + i * W * 0.17, 0.12, D * 0.12 + (k - 0.5) * 0.12, pick([0x2f5fa0, 0xc0442a, 0xd9a43c, 0x3f8a6a, 0x8a4f7a], i + k * 2 + v));
      for (let i = 0; i < 3; i++) { p.cyl(0.07, 0.07, 0.08, 7, W * 0.2, 0, -D * 0.3 + i * 0.14, A.timber); p.cyl(0.06, 0.06, 0.082, 7, W * 0.2, 0, -D * 0.3 + i * 0.14, [0x2f5fa0, 0xc0442a, 0xd9a43c][(i + v) % 3]); }
      // la petite maison : porte, fenêtre de papier, poteaux laqués, lanterne ; le faîtage à planches croisées au chaume
      const hz = -D * 0.25 + D * 0.2;
      for (const sx of [-1, 1]) p.box(0.026, 0.24, 0.026, -W * 0.22 + sx * (W * 0.25 - 0.01), 0, hz, A.redDark);
      p.box(0.1, 0.17, 0.012, -W * 0.3, 0, hz + 0.004, A.timber); p.box(0.004, 0.17, 0.016, -W * 0.3, 0, hz + 0.006, A.darkwood);
      win(p, -W * 0.12, 0.1, hz + 0.008, 0.09, 0.08);
      lantern(p, -W * 0.22, 0.2, hz + 0.08, 0.024);
      if (age <= 1) oldRidge(p, 0.14, -W * 0.22, 0.42, -D * 0.25);
      // le baquet à rincer, les écheveaux de soie
      p.cyl(0.08, 0.07, 0.05, 8, -W * 0.2, 0, D * 0.38, A.timber); p.cyl(0.07, 0.07, 0.052, 8, -W * 0.2, 0, D * 0.38, 0x6a8ab0);
      for (let i = 0; i < 3; i++) p.box(0.03, 0.08, 0.03, W * 0.42, 0.02, -D * 0.38 + i * 0.07, pick([0xc0442a, 0xd9a43c, 0x2f5fa0], i + v));
    }
    return;
  }
  if (age === 3) {
    // atelier de brique : toit courbe, haute cheminée, caisses
    p.box(W, 0.36, D * 0.8, 0, 0, 0, 0x9a8a80);
    for (let i = 0; i < 3; i++) win(p, -W * 0.3 + i * W * 0.3, 0.12, D * 0.4 + 0.006, 0.14, 0.14, 0, 0x5a4a3a, A.win);
    p.box(0.16, 0.24, 0.012, -W * 0.38, 0, D * 0.4 + 0.006, 0x4a3a30);
    hipRoof(p, W + 0.12, D * 0.8 + 0.12, 0.22, 0, 0.36, 0, tile, 0, { lod: true, rows: 1, step: 0.1 });
    p.cyl(0.05, 0.07, 0.9, 7, W * 0.32, 0, -D * 0.3, 0x8a5a44);
    p.cyl(0.07, 0.07, 0.04, 7, W * 0.32, 0.9, -D * 0.3, 0x6a4434);
    for (let i = 0; i < 3; i++) p.box(0.12, 0.1, 0.1, -W * 0.25 + i * 0.14, 0, D * 0.46, [0x9a7a5a, 0x7a6a4a, 0xb8a070][i]);
    return;
  }
  if (age === 4) {
    // petite usine à toit en dents de scie, enseigne au néon
    p.box(W, 0.4, D * 0.84, 0, 0, 0, A.concrete);
    p.box(W + 0.012, 0.12, D * 0.84 + 0.012, 0, 0.18, 0, A.win, 0, true);
    for (let i = 0; i < 3; i++) {
      const x = -W / 3 + (i * W) / 3;
      frustum(p, D * 0.84, W / 3 - 0.01, D * 0.84, 0.02, 0.14, x, 0.4, 0, A.concreteD, Math.PI / 2);
    }
    p.box(W * 0.5, 0.08, 0.02, 0, 0.3, D * 0.42 + 0.01, pick([A.pink, A.cyan, A.amber], v), 0, 'neon');
    p.cyl(0.04, 0.05, 0.7, 6, -W * 0.38, 0, -D * 0.3, 0xb0b0b0);
    p.cyl(0.05, 0.05, 0.03, 6, -W * 0.38, 0.7, -D * 0.3, 0xc0442a);
    // porte de chargement, quai, caisses et conteneur
    p.box(0.22, 0.2, 0.014, W * 0.28, 0, D * 0.42 + 0.006, 0x8a9096);
    for (let i = 0; i < 5; i++) p.box(0.2, 0.008, 0.016, W * 0.28, 0.02 + i * 0.04, D * 0.42 + 0.008, 0x6a7076);
    p.box(0.34, 0.05, 0.12, W * 0.28, 0, D * 0.42 + 0.06, A.concreteD);
    p.box(0.3, 0.13, 0.12, -W * 0.18, 0, D * 0.46, pick([0x3f7a6a, 0xc0442a, 0x2f5f9e], v));
    for (let i = 0; i < 2; i++) p.box(0.08, 0.08, 0.08, W * 0.05 + i * 0.1, 0, D * 0.5, 0xb8a070);
    for (const sx of [-1, 1]) p.cyl(0.03, 0.03, 0.06, 6, sx * W * 0.25, 0.54, -D * 0.15, 0x9a9a9a);
    return;
  }
  // laboratoire : verre, panneaux solaires, liseré
  p.box(W, 0.36, D * 0.82, 0, 0, 0, 0xf2f0ea);
  p.box(W + 0.012, 0.18, D * 0.82 + 0.012, 0, 0.1, 0, A.glass, 0, true);
  for (let i = 0; i < 2; i++) p.box(W * 0.42, 0.02, D * 0.5, -W * 0.22 + i * W * 0.44, 0.38, 0, 0x2a4a6a, 0, false, 0.25);
  p.box(W * 0.9, 0.012, 0.012, 0, 0.36, D * 0.41 + 0.01, A.cyan, 0, 'neon');
  for (let i = 0; i <= 4; i++) p.box(0.025, 0.36, 0.025, -W / 2 + (i * W) / 4, 0, D * 0.41, 0xf2f0ea);
  // l'entrée sous auvent courbe, l'aire des drones, une antenne
  hipRoof(p, 0.4, 0.22, 0.08, 0, 0.3, D * 0.45, A.tileB, 0, { lod: true, rows: 0, hips: false, glow: 'neon', edge: A.cyan, t: 0.02 });
  p.cyl(0.14, 0.14, 0.02, 10, W * 0.25, 0, D * 0.38 + 0.12, 0xdcdcdc);
  p.add(new THREE.TorusGeometry(0.11, 0.008, 3, 12).rotateX(Math.PI / 2), W * 0.25, 0.025, D * 0.38 + 0.12, A.cyan, 0, 'neon');
  p.box(0.08, 0.02, 0.08, W * 0.25, 0.08, D * 0.38 + 0.12, 0x3a3a40);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.03, 0.01, 0.03, W * 0.25 + sx * 0.06, 0.09, D * 0.38 + 0.12 + sz * 0.06, 0x3a3a40);
  p.cyl(0.006, 0.006, 0.4, 4, -W * 0.35, 0.36, -D * 0.25, 0xdddddd);
  p.sphere(0.02, -W * 0.35, 0.76, -D * 0.25, A.pink);
}

// ---------- Les jardins ----------

/** Pont en arc sur l'étang (le long de x, centre en (x, z)) : tablier en marches, garde-corps, culées */
function archBridge(p: Parts, len: number, x: number, z: number, ry: number, col: number, rise = 0.16) {
  inFrame(p, x, 0, z, ry, (q) => {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, y = Math.sin(t * Math.PI) * rise, a = Math.cos(t * Math.PI) * rise * 2.6 / len;
      q.add(new THREE.BoxGeometry(len / n + 0.01, 0.03, 0.18).rotateZ(a * 0.9), -len / 2 + t * len, 0.02 + y, 0, col);
      for (const sz of [-1, 1]) q.add(new THREE.BoxGeometry(len / n + 0.01, 0.014, 0.014).rotateZ(a * 0.9), -len / 2 + t * len, 0.1 + y, sz * 0.085, col);
    }
    for (let i = 0; i <= 4; i++) for (const sz of [-1, 1]) {
      const t = i / 4;
      q.box(0.016, 0.08, 0.016, -len / 2 + t * len, 0.02 + Math.sin(t * Math.PI) * rise, sz * 0.085, col);
    }
    for (const sx of [-1, 1]) q.box(0.1, 0.05, 0.22, sx * (len / 2 + 0.02), 0, 0, A.stone);
  });
}
/** Pavillon hexagonal du jardin : socle, six colonnes, banc, toit courbe à six pans et sa perle */
function pavilion(p: Parts, x: number, z: number, r: number, age: number, tile: number) {
  const col = age <= 1 ? A.timber : age >= 5 ? 0xf2f0ea : A.red;
  p.cyl(r + 0.06, r + 0.08, 0.06, 6, x, 0, z, A.stone);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 5, 1, true).translate(0, 0.15, 0), x + Math.sin(a) * r, 0.06, z + Math.cos(a) * r, col); }
  for (let i = 1; i < 6; i++) { const a = ((i + 0.5) / 6) * Math.PI * 2; p.box(r * 0.95, 0.025, 0.05, x + Math.sin(a) * r * 0.85, 0.12, z + Math.cos(a) * r * 0.85, col, a + Math.PI / 2); }
  p.cyl(r + 0.03, r + 0.03, 0.04, 6, x, 0.34, z, age <= 1 ? A.darkwood : A.beam);
  // toit : trois troncs de cône à six pans, creusés, coins relevés
  const R = r * 1.55, y = 0.38;
  p.add(new THREE.CylinderGeometry(R * 0.72, R, 0.06, 6), x, y + 0.03, z, tile);
  p.add(new THREE.CylinderGeometry(R * 0.36, R * 0.72, 0.1, 6), x, y + 0.11, z, tile);
  p.add(new THREE.CylinderGeometry(0.01, R * 0.36, 0.12, 6), x, y + 0.22, z, tile);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spike(p, 0.016, 0.09, [x + Math.sin(a) * R, y, z + Math.cos(a) * R], [Math.sin(a) * 0.8, 1, Math.cos(a) * 0.8], dark(tile, 0.72), 0, 0, 0, 0); }
  p.sphere(0.03, x, y + 0.3, z, A.gold);
  if (age >= 3) lantern(p, x, 0.32, z, 0.03);
}
/** Étang irrégulier : berge de galets, eau, nénuphars et lotus */
function pond(p: Parts, x: number, z: number, rx: number, rz: number, r: () => number) {
  p.add(new THREE.CylinderGeometry(1, 1, 0.03, 9).scale(rx + 0.06, 1, rz + 0.06).translate(0, 0.015, 0), x, 0.0, z, 0x9a968c);
  p.add(new THREE.CylinderGeometry(1, 1, 0.03, 9).scale(rx, 1, rz).translate(0, 0.015, 0), x, 0.006, z, A.water);
  for (let i = 0; i < 5; i++) {
    const a = r() * 6.28, k = 0.3 + r() * 0.5;
    p.cyl(0.035, 0.035, 0.01, 6, x + Math.cos(a) * rx * k, 0.036, z + Math.sin(a) * rz * k, A.lotus);
    if (i % 2 === 0) p.sphere(0.014, x + Math.cos(a) * rx * k, 0.05, z + Math.sin(a) * rz * k, A.blossom);
  }
}

/**
 * Jardin (petit, ou le grand jardin du palais, 4 × 4) : mur blanc à chaperon de tuiles et porte-lune (grand jardin), étang
 * et son pont en arc, pavillon, rochers dressés, érables, pins, saule, bambous, allée de pas japonais
 */
export function aGarden(p: Parts, age: number, v: number, w: number, d: number) {
  const big = w > 3, W = w * 0.95, D = d * 0.95, r = mulberry32(v + 5), tile = age <= 1 ? A.thatch : houseTile(Math.max(2, age), v);
  // (au-dessus du sol de la ville, que `RivalTowns` étend dans les murs)
  p.box(W, 0.045, D, 0, 0, 0, A.grass);
  if (big) {
    // le mur et sa porte-lune (un disque sombre, l'ouverture ronde)
    for (const [x, z, ww, dd] of [[0, -D / 2, W, 0.08], [W / 2, 0, 0.08, D], [-W / 2, 0, 0.08, D], [-W * 0.3, D / 2, W * 0.4, 0.08], [W * 0.3, D / 2, W * 0.4, 0.08]] as const) {
      p.box(ww, 0.32, dd, x, 0, z, age <= 1 ? A.wattle : A.plaster);
      coping(p, ww, dd, 0.32, x, z, tile);
    }
    p.box(W * 0.2, 0.32, 0.08, 0, 0, D / 2, age <= 1 ? A.wattle : A.plaster);
    p.add(new THREE.CylinderGeometry(0.14, 0.14, 0.09, 12).rotateX(Math.PI / 2), 0, 0.17, D / 2, 0x6a8a5a);
    p.add(new THREE.TorusGeometry(0.145, 0.015, 4, 12), 0, 0.17, D / 2 + 0.045, A.darkstone);
    coping(p, W * 0.2, 0.08, 0.32, 0, D / 2, tile);
  }
  // l'étang et son pont
  const px = -W * 0.08, pz = D * 0.04, rx = W * (big ? 0.3 : 0.28), rz = D * (big ? 0.22 : 0.2);
  pond(p, px, pz, rx, rz, r);
  archBridge(p, rx * 1.3, px, pz, 0.25, age <= 1 ? A.timber : age >= 5 ? 0xf2f0ea : A.red, big ? 0.16 : 0.1);
  // allée de pas japonais jusqu'au pavillon
  for (let i = 0; i < 5; i++) p.cyl(0.04, 0.04, 0.02, 6, px + rx * 0.7 + i * W * 0.05, 0.02, pz + rz * 0.3 - i * D * 0.08, 0xc8c2b4);
  if (big || v % 2) pavilion(p, W * 0.28, -D * 0.27, big ? 0.22 : 0.16, age, tile);
  // rochers dressés au bord de l'étang
  for (let i = 0; i < (big ? 4 : 2); i++) { const a = r() * 6.28; rock(p, px + Math.cos(a) * (rx + 0.08), pz + Math.sin(a) * (rz + 0.08), big ? 1 : 0.7, i); }
  // arbres
  const spots: [number, number][] = big ? [[-0.4, -0.38], [0.4, 0.3], [-0.38, 0.36], [0.1, -0.4], [-0.42, -0.05], [0.42, -0.02]] : [[-0.38, -0.36], [0.36, 0.34], [-0.36, 0.36]];
  spots.forEach(([sx, sz], i) => {
    const x = sx * W, z = sz * D, k = (i + v) % 5;
    if (k === 0) roundTree(p, x, z, big ? 0.6 : 0.5, A.maple, i);
    else if (k === 1) pine(p, x, z, big ? 0.7 : 0.55, A.pine, i);
    else if (k === 2) willow(p, x, z, big ? 0.65 : 0.5);
    else if (k === 3) bamboo(p, x, z, big ? 0.6 : 0.45, i);
    else roundTree(p, x, z, 0.45, A.blossom, i);
  });
  if (age >= 2) stoneLantern(p, W * 0.12, D * 0.32, 0.9, true);
  if (age >= 5) for (let i = 0; i < 4; i++) p.box(0.03, 0.06, 0.03, -W * 0.3 + i * W * 0.2, 0, D * 0.42, A.cyan, 0, 'neon');
}

// ---------- Le port ----------

/** Jonque (puis navire de son âge), de flanc le long de x, proue vers +x, en (x, z) */
export function aJunk(p: Parts, age: number, x: number, z: number) {
  if (age <= 3) {
    // la jonque marchande de `asianShips.ts`, de flanc, proue vers +x, à l'échelle du port
    inFrame(p, x, -0.02, z, Math.PI / 2, (q) => { asianJunk(q, true); }, 2.2);
    return;
  }
  if (age === 4) {
    // bac à moteur : coque blanche, ponts vitrés, cheminée rouge
    frustum(p, 1.7, 0.4, 2.0, 0.52, 0.22, x, -0.1, z, 0xf2f0ea);
    p.box(2.0, 0.04, 0.52, x, 0.08, z, 0x2f5f9e);
    p.box(1.3, 0.16, 0.42, x - 0.1, 0.12, z, 0xf8f8f8);
    p.box(1.32, 0.06, 0.44, x - 0.1, 0.18, z, A.win, 0, true);
    p.box(0.7, 0.12, 0.34, x - 0.2, 0.28, z, 0xf8f8f8);
    p.box(0.72, 0.05, 0.36, x - 0.2, 0.32, z, A.win, 0, true);
    p.cyl(0.05, 0.06, 0.2, 7, x - 0.45, 0.4, z, A.red);
    p.cyl(0.006, 0.006, 0.3, 4, x + 0.2, 0.4, z, 0xdddddd);
    return;
  }
  // hydroptère : coque effilée, verre, ailes portantes, liseré
  frustum(p, 1.6, 0.3, 1.9, 0.44, 0.16, x, 0.0, z, 0xf4f4f4);
  p.box(1.0, 0.12, 0.34, x - 0.1, 0.16, z, A.glass, 0, true);
  hipRoof(p, 1.1, 0.4, 0.06, x - 0.1, 0.28, z, A.tileB, 0, { lod: true, rows: 0, hips: false, glow: 'neon', edge: A.cyan, t: 0.02 });
  for (const fx of [-0.5, 0.55]) { p.box(0.04, 0.12, 0.04, x + fx, -0.1, z, 0xcccccc); p.box(0.14, 0.015, 0.6, x + fx, -0.1, z, 0xcccccc); }
  p.box(1.8, 0.015, 0.012, x, 0.08, z + 0.22, A.cyan, 0, 'neon');
}

/**
 * Le port (lot 4 × 3,5, le quai avance vers +z sur l'eau) : jetée de bois puis quai de pierre à bittes et escaliers d'eau,
 * entrepôt à toit courbe, pavillon de guet et sa lanterne au bout du quai, grue, marchandises, jonque amarrée ; bac et
 * conteneurs au Moderne, hydroptère au Futuriste
 */
export function aPort(p: Parts, age: number, v: number) {
  const quay = age <= 1 ? A.timber : age >= 4 ? 0x9a9a96 : 0xa8a49a;
  if (age <= 1) {
    p.box(4, 0.06, 2.3, 0, 0.06, 0.9, quay);
    for (let i = 0; i < 9; i++) p.box(0.02, 0.005, 2.3, -1.9 + i * 0.47, 0.12, 0.9, A.darkwood);
    for (let i = 0; i < 5; i++) for (const zz of [0, 1.9]) p.cyl(0.04, 0.04, 1.6, 5, -1.8 + i * 0.9, -1.5, zz, A.darkwood);
  } else {
    p.box(4, 1.6, 2.4, 0, -1.5, 0.9, quay);
    p.box(4.04, 0.05, 2.44, 0, 0.08, 0.9, age >= 4 ? 0xbdbdb6 : 0xbab6ac);
    // assises de pierre visibles au-dessus de l'eau, escalier d'eau
    for (let i = 0; i < 2; i++) p.box(4.02, 0.012, 0.012, 0, -0.04 + i * 0.06, 2.1, dark(quay, 0.85));
    for (let i = 0; i < 4; i++) p.box(0.4, 0.04, 0.12, -1.6, 0.08 - i * 0.05, 2.06 + i * 0.1, quay);
  }
  // bittes d'amarrage
  for (let i = 0; i < 5; i++) { p.cyl(0.04, 0.05, 0.1, 6, -1.4 + i * 0.7, 0.1, 2.0, A.darkwood); p.cyl(0.05, 0.05, 0.02, 6, -1.4 + i * 0.7, 0.2, 2.0, A.darkwood); }
  // l'entrepôt à toit courbe
  const wh = age >= 4 ? 0.55 : 0.42, wall = age <= 1 ? A.wattle : age >= 4 ? A.concrete : A.plaster;
  p.box(3.3, 1.5, 1.1, -0.2, -1.5, -1.1, A.stone);
  p.box(3.2, wh, 1.0, -0.2, 0, -1.1, wall);
  for (let i = 0; i < 4; i++) {
    const x = -1.4 + i * 0.8;
    p.box(0.42, wh * 0.72, 0.014, x, 0, -0.594, age <= 1 ? 0x3a2a22 : age >= 4 ? 0x7a8088 : A.red);
    p.box(0.006, wh * 0.72, 0.018, x, 0, -0.594, A.darkwood);
    if (i < 3) win(p, x + 0.4, wh * 0.5, -0.594 + 0.008, 0.16, 0.1, 0, A.darkwood, age >= 4 ? A.win : A.paper);
  }
  for (const sx of [-1, 1]) p.box(0.04, wh, 0.04, -0.2 + sx * 1.58, 0, -0.6, age <= 1 ? A.timber : A.red);
  hipRoof(p, 3.5, 1.3, 0.36, -0.2, wh, -1.1, age >= 4 ? A.tileG : houseTile(age, v), 0, { rows: 1, step: 0.12 });
  if (age >= 2) for (let i = 0; i < 4; i++) lantern(p, -1.5 + i * 0.9, wh - 0.04, -0.5, 0.032);
  if (age >= 4) p.box(1.2, 0.1, 0.02, -0.2, wh - 0.16, -0.585, pick([A.amber, A.cyan], v), 0, 'neon');
  // marchandises
  const goods = [0x9a7a5a, 0x7a6a4a, 0xb8a070, 0x6a7a5a];
  for (let i = 0; i < 4; i++) p.box(0.18, 0.14, 0.16, -1.2 + i * 0.24, 0.1, 0.4, goods[i]);
  for (let i = 0; i < 3; i++) p.cyl(0.07, 0.06, 0.16, 7, 0.2 + i * 0.16, 0.1, 0.3, 0x8a5a3a);
  if (age <= 3) for (let i = 0; i < 2; i++) p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 7).rotateZ(Math.PI / 2), 0.9, 0.16 + i * 0.12, 0.5, 0x8a6a48);
  // le pavillon de guet au bout du quai (Médiéval et après), le phare au Futuriste
  if (age >= 2) inFrame(p, 1.65, 0.1, 1.65, 0, (q) => {
    q.box(0.62, 0.7, 0.62, 0, 0, 0, A.stone);
    q.box(0.66, 0.03, 0.66, 0, 0.7, 0, A.marble);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) q.add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5, 1, true).translate(0, 0.15, 0), sx * 0.22, 0.73, sz * 0.22, age >= 5 ? 0xf2f0ea : A.red);
    q.box(0.3, 0.2, 0.3, 0, 0.75, 0, 0xfff0c0, 0, true);
    q.box(0.52, 0.04, 0.52, 0, 1.02, 0, A.beam);
    hipRoof(q, 0.7, 0.7, 0.3, 0, 1.06, 0, age >= 4 ? A.tileG : A.tile, 0, { lod: true, rows: 2, step: 0.11, glow: age >= 5 ? 'neon' : false, edge: age >= 5 ? A.cyan : undefined });
    q.sphere(0.03, 0, 1.36, 0, A.gold);
  });
  // grue : de bois (Industriel), de fer (Moderne, Futuriste)
  if (age === 3) {
    p.box(0.08, 1.1, 0.08, -1.6, 0.1, 1.5, A.darkwood);
    p.box(0.05, 0.05, 1.0, -1.6, 1.1, 1.85, A.darkwood);
    p.box(0.006, 0.6, 0.006, -1.6, 0.5, 2.3, 0x8a7a5a);
    p.box(0.12, 0.1, 0.12, -1.6, 0.42, 2.3, 0x9a7a5a);
  }
  if (age >= 4) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < (i === 1 ? 2 : 1); j++) p.box(0.7, 0.24, 0.28, -0.9 + i * 0.4, 0.1 + j * 0.24, 1.0 + (i % 2) * 0.3, [0x3f7a6a, 0xc0442a, 0x2f5f9e][(i + j) % 3]);
    const cc = age === 5 ? 0xf2f0ea : 0xc0442a;
    for (const sx of [-1, 1]) p.box(0.06, 1.5, 0.06, 0.6 + sx * 0.2, 0.1, 1.9, cc);
    p.box(0.5, 0.08, 0.1, 0.6, 1.5, 1.9, cc);
    p.box(0.08, 0.08, 1.8, 0.6, 1.58, 1.6, cc);
    p.box(0.1, 0.08, 0.1, 0.6, 1.2, 2.3, 0x3a3a3e);
    if (age === 5) p.box(3.4, 0.02, 0.04, 0, 0.13, 2.1, A.cyan, 0, 'neon');
  }
  aJunk(p, age, -0.2, 2.55);
}

// ---------- Remparts, tours, portes, paifang ----------

/** Couleurs des remparts du peuple asiatique : terre damée, puis brique grise à chaperon de tuiles */
export function aWallColors(age: number) {
  return age <= 1 ? { wall: 0xb0a48a, top: 0x8a7a5a } : { wall: age >= 4 ? 0x8f8b84 : 0x9a968e, top: age >= 4 ? A.tileG : A.tile };
}

/** Pan de rempart de longueur `len` le long de x, centré, plongeant sous le sol de `sink` cases */
export function aWallPiece(p: Parts, age: number, len: number, sink: number) {
  const { wall, top } = aWallColors(age), t = 0.4;
  if (age <= 1) {
    // terre damée en lits, palissade de pieux
    const h = 0.5;
    p.box(len, h + sink, t, 0, -sink, 0, wall);
    for (let i = 1; i < 4; i++) p.box(len, 0.01, t + 0.006, 0, (h * i) / 4, 0, dark(wall, 0.88));
    // le pied de pierres sèches, les poteaux du coffrage restés dans la terre, le chaperon de chaume côté ville
    p.box(len, 0.08, t + 0.05, 0, 0, 0, A.darkstone);
    const k = Math.max(1, Math.round(len / 0.5));
    for (let i = 0; i < k; i++) p.box(0.035, h - 0.08, 0.02, -len / 2 + (len * (i + 0.5)) / k, 0.08, t / 2 + 0.008, A.timber);
    frustum(p, len, 0.18, len, 0.03, 0.06, 0, h, -t / 4, A.thatch);
    const n = Math.max(2, Math.floor(len / 0.16));
    for (let i = 0; i < n; i++) p.box(0.05, 0.14 + (i % 2) * 0.03, 0.05, -len / 2 + 0.08 + (i * (len - 0.16)) / (n - 1), h, t / 2 - 0.05, A.timber);
    p.box(len, 0.025, 0.025, 0, h + 0.09, t / 2 - 0.05, A.darkwood);
    return;
  }
  const h = 0.8;
  // socle de pierre, brique, cordon, créneaux à meurtrières dehors (+z), parapet et chaperon dedans
  p.box(len, sink + 0.16, t + 0.06, 0, -sink, 0, A.darkstone);
  p.box(len, h - 0.16, t, 0, 0.16, 0, wall);
  for (let i = 1; i < 4; i++) p.box(len, 0.008, t + 0.006, 0, 0.16 + i * 0.16, 0, dark(wall, 0.9));
  p.box(len, 0.03, t + 0.04, 0, h - 0.03, 0, dark(wall, 0.85));
  const n = Math.max(1, Math.floor(len / 0.24));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len / n) * (i + 0.5);
    p.box((len / n) * 0.56, 0.1, 0.07, x, h, t / 2 - 0.035, wall);
    p.box(0.02, 0.04, 0.072, x, h + 0.03, t / 2 - 0.035, 0x2a2420);
  }
  p.box(len, 0.06, 0.05, 0, h, -t / 2 + 0.025, wall);
  frustum(p, len, 0.12, len, 0.02, 0.04, 0, h + 0.06, -t / 2 + 0.025, top);
  if (age >= 5) p.box(len, 0.02, 0.02, 0, h - 0.06, t / 2 + 0.012, A.cyan, 0, 'neon');
}

/** Tour de guet (lot 1,3 × 1,3) : bastion carré, pavillon à un puis deux toits, lanternes, oriflamme */
export function aTower(p: Parts, age: number, v: number) {
  const { wall, top } = aWallColors(age), sink = 1.5;
  if (age <= 1) {
    p.box(0.9, 0.7 + sink, 0.9, 0, -sink, 0, wall);
    for (let i = 1; i < 4; i++) p.box(0.906, 0.01, 0.906, 0, (0.7 * i) / 4, 0, dark(wall, 0.88));
    // le pied de pierres sèches, les meurtrières dans la terre damée
    p.box(0.96, 0.1, 0.96, 0, 0, 0, A.darkstone);
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) p.box(0.03, 0.1, 0.012, Math.sin(r) * 0.452, 0.42, Math.cos(r) * 0.452, 0x2a2420, r);
    // le pavillon de guet : plancher en débord, poteaux laqués, balustrade, toit de bardeaux aux coins relevés
    p.box(0.86, 0.04, 0.86, 0, 0.7, 0, A.wood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.04, 0.34, 0.04, sx * 0.34, 0.74, sz * 0.34, A.redDark);
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) rail(p, 0.68, Math.sin(r) * 0.36, 0.74, Math.cos(r) * 0.36, r, A.redDark, 0.09, 0.17);
    p.box(0.76, 0.03, 0.76, 0, 1.04, 0, A.beam);
    hipRoof(p, 1.02, 1.02, 0.3, 0, 1.07, 0, A.shingle, 0, { lod: true, rows: 1, step: 0.12, lift: 0.11 });
    // le tambour d'alarme sur son chevalet, les lanternes aux coins de la façade, l'oriflamme
    p.add(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8).rotateX(Math.PI / 2), -0.12, 0.88, -0.1, A.lacquer);
    for (const sz of [-1, 1]) p.add(new THREE.CylinderGeometry(0.092, 0.092, 0.006, 8).rotateX(Math.PI / 2), -0.12, 0.88, -0.1 + sz * 0.05, A.paper);
    for (const sx of [-1, 1]) p.box(0.02, 0.15, 0.02, -0.12 + sx * 0.08, 0.74, -0.1, A.darkwood);
    for (const sx of [-1, 1]) lantern(p, sx * 0.4, 0.98, 0.4, 0.03);
    banner(p, 0.38, -0.38, 0.6, A.red, 1.07);
    // l'échelle de bois appuyée sur le flanc
    for (const sz of [-1, 1]) p.add(new THREE.BoxGeometry(0.02, 0.78, 0.02).translate(0, 0.39, 0), 0.52, 0, sz * 0.07, A.timber, 0, false, 0.18);
    for (let i = 0; i < 5; i++) p.box(0.016, 0.014, 0.15, 0.52 - (0.06 + i * 0.14) * Math.tan(0.18), 0.06 + i * 0.14, 0, A.timber);
    return;
  }
  const h = 1.0;
  p.box(0.96, sink + 0.16, 0.96, 0, -sink, 0, A.darkstone);
  p.box(0.9, h - 0.16, 0.9, 0, 0.16, 0, wall);
  for (let i = 1; i < 5; i++) p.box(0.906, 0.008, 0.906, 0, 0.16 + i * 0.16, 0, dark(wall, 0.9));
  p.box(0.96, 0.04, 0.96, 0, h, 0, dark(wall, 0.85));
  for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const s of [-1, 0, 1]) p.box(0.14, 0.1, 0.06, Math.cos(r) * s * 0.3 + Math.sin(r) * 0.45, h + 0.04, -Math.sin(r) * s * 0.3 + Math.cos(r) * 0.45, wall, r);
  // le pavillon
  const two = age >= 3, col = age >= 5 ? 0xf2f0ea : A.red, neon = age >= 5 ? A.cyan : undefined;
  inFrame(p, 0, h + 0.04, 0, 0, (q) => hall(q, { w: 0.52, d: 0.52, h: 0.28, roof: top, col, wall: age >= 5 ? A.glass : A.plaster, podium: 0, stairs: false, bays: 2, rows: 2, step: 0.13, roofH: 0.26, lift: 0.09, double: two, glass: age >= 5, neon, lod: true }));
  if (age >= 3) for (const [sx, sz] of [[1, 1], [-1, 1]]) lantern(p, sx * 0.4, h + 0.32, sz * 0.4, 0.035);
  if (v % 3 === 0) banner(p, 0.38, -0.38, 0.6, A.red, h + 0.04);
  if (age === 4) p.box(0.1, 0.08, 0.1, 0.4, h + 0.04, 0.4, 0xfff4d0, 0, true);
}

/** Porte de ville (lot 2,4 × 1,4, façade +z au-dehors) : massif percé d'un passage voûté, vantaux, tour-porte à deux toits */
export function aGate(p: Parts, age: number, v: number) {
  const { wall, top } = aWallColors(age), sink = 1.5;
  if (age <= 1) {
    const h = 0.6;
    for (const sx of [-1, 1]) {
      p.box(0.8, h + sink, 1.0, sx * 0.7, -sink, 0, wall);
      for (let i = 1; i < 4; i++) p.box(0.806, 0.01, 1.006, sx * 0.7, (h * i) / 4, 0, dark(wall, 0.88));
    }
    for (const sx of [-1, 1]) p.box(0.82, 0.1, 1.02, sx * 0.7, 0, 0, A.darkstone);
    p.box(0.6, 0.06, 1.0, 0, h - 0.06, 0, A.timber);
    for (const sz of [-1, 1]) p.box(0.6, 0.06, 0.04, 0, h - 0.12, sz * 0.48, A.darkwood);
    // le passage : poteaux laqués, vantaux rouges ouverts cloutés d'or, la plaque du nom
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.045, h, 0.045, sx * 0.28, 0, sz * 0.48, A.redDark);
    for (const sx of [-1, 1]) {
      p.box(0.22, h - 0.14, 0.022, sx * 0.17, 0, 0.42, A.lacquer, -sx * 0.9);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) p.box(0.018, 0.018, 0.026, sx * (0.22 - j * 0.06), 0.1 + i * 0.13, 0.34 + j * 0.065, A.gold);
    }
    p.box(0.3, 0.1, 0.02, 0, h - 0.24, 0.51, A.darkwood); p.box(0.22, 0.06, 0.022, 0, h - 0.22, 0.512, A.gold);
    // dehors, deux mâts à oriflamme et deux lanternes de papier au linteau
    for (const sx of [-1, 1]) { banner(p, sx * 0.4, 0.58, 0.9, sx > 0 ? A.red : A.gold); lantern(p, sx * 0.2, h - 0.2, 0.56, 0.035); p.box(0.004, 0.06, 0.004, sx * 0.2, h - 0.15, 0.56, A.darkwood); }
    // le pavillon : plancher, poteaux laqués, balustrade, toit de bardeaux aux coins relevés, faîtage à planches croisées
    inFrame(p, 0, h, 0, 0, (q) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) q.box(0.045, 0.32, 0.045, sx * 0.7, 0, sz * 0.38, A.redDark);
      for (const sx of [-0.35, 0.35]) for (const sz of [-1, 1]) q.box(0.035, 0.32, 0.035, sx, 0, sz * 0.38, A.redDark);
      q.box(1.6, 0.08, 0.9, 0, 0, 0, A.wood);
      for (const sz of [-1, 1]) rail(q, 1.5, 0, 0.08, sz * 0.42, 0, A.redDark, 0.08, 0.19);
      for (const sx of [-1, 1]) rail(q, 0.8, sx * 0.76, 0.08, 0, Math.PI / 2, A.redDark, 0.08, 0.2);
      q.box(1.5, 0.04, 0.82, 0, 0.32, 0, A.beam);
      hipRoof(q, 1.86, 1.08, 0.36, 0, 0.35, 0, A.shingle, 0, { lod: true, rows: 1, step: 0.12, lift: 0.13 });
      oldRidge(q, 0.78, 0, 0.71, 0);
      for (const sx of [-1, 1]) lantern(q, sx * 0.72, 0.24, 0.46, 0.032);
    });
    return;
  }
  const h = 0.92;
  p.box(2.3, sink + 0.16, 1.1, 0, -sink, 0, A.darkstone);
  p.box(2.2, h - 0.16, 1.0, 0, 0.16, 0, wall);
  for (let i = 1; i < 5; i++) p.box(2.206, 0.008, 1.006, 0, 0.16 + i * 0.16, 0, dark(wall, 0.9));
  // le passage voûté, ses vantaux cloutés
  for (const sz of [-1, 1]) {
    const z = sz * 0.503;
    p.box(0.5, 0.4, 0.012, 0, 0, z, 0x2a1e18, sz < 0 ? Math.PI : 0);
    p.add(new THREE.CylinderGeometry(0.25, 0.25, 0.012, 9, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), 0, 0.4, z, 0x2a1e18, sz < 0 ? Math.PI : 0);
    p.add(new THREE.TorusGeometry(0.29, 0.03, 3, 9, Math.PI), 0, 0.4, z + sz * 0.006, A.stone, sz < 0 ? Math.PI : 0);
  }
  for (const sx of [-1, 1]) {
    p.box(0.2, 0.48, 0.02, sx * 0.13, 0, 0.47, age >= 4 ? 0x7a2a22 : A.red, -sx * 0.6);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) p.box(0.02, 0.02, 0.026, sx * (0.07 + j * 0.08), 0.1 + i * 0.13, 0.43 + j * 0.05, A.gold);
  }
  p.box(2.26, 0.04, 1.06, 0, h, 0, dark(wall, 0.85));
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) p.box(0.16, 0.1, 0.06, -0.9 + i * 0.6, h + 0.04, s * 0.5, wall);
  // la plaque du nom au-dessus du passage
  p.box(0.42, 0.14, 0.02, 0, 0.66, 0.51, A.beamB);
  p.box(0.34, 0.08, 0.022, 0, 0.69, 0.512, A.gold);
  // la tour-porte
  const col = age >= 5 ? 0xf2f0ea : A.red, neon = age >= 5 ? A.cyan : undefined;
  inFrame(p, 0, h + 0.04, 0, 0, (q) => hall(q, { w: 1.6, d: 0.66, h: 0.36, roof: top, col, wall: age >= 5 ? A.glass : A.red, podium: 0, stairs: false, bays: 5, rows: 2, step: 0.11, roofH: 0.34, double: true, glass: age >= 5, neon, ridge: age >= 4 ? A.gold : undefined }));
  if (age >= 3) for (const sx of [-1, 1]) lantern(p, sx * 0.4, 0.62, 0.58, 0.045);
  for (const sx of [-1, 1]) banner(p, sx * 1.0, 0.45, 0.6, v % 2 ? A.red : A.gold, h + 0.04);
}

/**
 * Paifang (lot 1,8 × 0,5, à cheval sur la rue) : portique de quatre piliers sur tambours de pierre, linteaux peints,
 * plaque du nom, trois petits toits courbes (celui du milieu plus haut) ; de bois brut à l'Antiquité, liseré au Futuriste
 */
export function aPaifang(p: Parts, age: number, v: number, w: number) {
  const W = Math.min(w * 0.94, 1.8), col = age <= 1 ? A.timber : age >= 5 ? 0xf2f0ea : A.red, tile = age <= 1 ? A.shingle : age >= 4 ? A.tileG : pick([A.tile, A.tileG, A.tileGold], v);
  const beam = age <= 1 ? A.darkwood : A.beam, xs = [-W / 2 + 0.05, -W * 0.18, W * 0.18, W / 2 - 0.05], H = age <= 1 ? 0.62 : 0.7;
  for (const [i, x] of xs.entries()) {
    const hh = i === 1 || i === 2 ? H : H - 0.12;
    if (age >= 2) { p.box(0.1, 0.06, 0.24, x, 0, 0, A.stone); p.box(0.06, 0.1, 0.16, x, 0.06, 0, A.stone); }
    p.add(new THREE.CylinderGeometry(0.028, 0.032, hh, 6, 1, true).translate(0, hh / 2, 0), x, 0, 0, col);
  }
  // linteaux et plaques
  p.box(W * 0.36 + 0.06, 0.06, 0.06, 0, H - 0.1, 0, beam);
  p.box(W * 0.36 + 0.06, 0.012, 0.064, 0, H - 0.07, 0, A.gold);
  p.box(W * 0.36, 0.05, 0.05, 0, H - 0.24, 0, col);
  p.box(0.24, 0.1, 0.03, 0, H - 0.2, 0, age <= 1 ? A.wood : A.beamB);
  if (age >= 2) p.box(0.18, 0.06, 0.034, 0, H - 0.18, 0, A.gold);
  for (const sx of [-1, 1]) {
    const cx = sx * (W * 0.18 + (W / 2 - 0.05 - W * 0.18) / 2), lw = W / 2 - 0.05 - W * 0.18 + 0.06;
    p.box(lw, 0.05, 0.05, cx, H - 0.22, 0, beam);
    p.box(lw, 0.04, 0.045, cx, H - 0.32, 0, col);
    hipRoof(p, lw + 0.14, 0.26, 0.1, cx, H - 0.17, 0, tile, 0, { lod: true, rows: 1, step: 0.12 });
  }
  hipRoof(p, W * 0.36 + 0.24, 0.3, 0.14, 0, H - 0.04, 0, tile, 0, { lod: true, rows: 1, step: 0.11, glow: age >= 5 ? 'neon' : false, edge: age >= 5 ? A.amber : undefined, ridge: age >= 2 ? A.gold : undefined });
  if (age >= 3) for (const sx of [-1, 1]) lantern(p, sx * W * 0.12, H - 0.3, 0.08, 0.026);
}

// ---------- Les rizières ----------

/** Champ du peuple asiatique : rizières en bassins à diguettes, pousses en rangs ; cabane, épouvantail, puis pompe */
export function aField(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.95, D = d * 0.95, n = 2 + (v % 2);
  for (let i = 0; i < n; i++) {
    const z = -D / 2 + (D / n) * (i + 0.5), dd = D / n;
    p.box(W, 0.05, dd - 0.02, 0, 0, z, 0x7a6a4a);
    p.box(W - 0.08, 0.052, dd - 0.1, 0, 0, z, 0x9cc4a6);
    const rows = Math.max(3, Math.round(dd / 0.12));
    for (let k = 0; k < rows; k++) p.box(W - 0.2, 0.068, 0.04, 0, 0, z - dd / 2 + 0.08 + (k * (dd - 0.16)) / (rows - 1), age >= 4 ? 0x9ac85a : (v + i) % 3 ? 0x84b850 : 0xa8c860);
  }
  if (age <= 3 && v % 2 === 0) {
    // cabane de garde sur pilotis
    const x = W / 2 - 0.2, z = -D / 2 + 0.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.02, 0.16, 0.02, x + sx * 0.08, 0, z + sz * 0.08, A.timber);
    p.box(0.2, 0.02, 0.2, x, 0.16, z, A.wood);
    hipRoof(p, 0.3, 0.3, 0.14, x, 0.3, z, A.thatch);
    for (const sx of [-1, 1]) p.box(0.016, 0.14, 0.016, x + sx * 0.08, 0.16, z + 0.08, A.timber);
  } else if (age <= 3) {
    // épouvantail au chapeau de paille
    p.box(0.02, 0.26, 0.02, -W * 0.2, 0, D * 0.1, A.timber);
    p.box(0.2, 0.02, 0.02, -W * 0.2, 0.18, D * 0.1, A.timber);
    p.box(0.08, 0.1, 0.05, -W * 0.2, 0.12, D * 0.1, 0x6a7a9a);
    p.cone(0.08, 0.04, 8, -W * 0.2, 0.26, D * 0.1, A.thatch);
  } else {
    // pompe et canal d'irrigation
    p.box(0.14, 0.14, 0.14, W / 2 - 0.12, 0, -D / 2 + 0.12, age >= 5 ? 0xf2f0ea : 0x8a9096);
    p.box(0.04, 0.03, D * 0.8, W / 2 - 0.06, 0.03, 0, age >= 5 ? A.cyan : 0x9a9a96, 0, age >= 5 ? 'neon' : false);
  }
}
