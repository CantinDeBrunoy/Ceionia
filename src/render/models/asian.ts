import * as THREE from 'three';
import { Parts, type Glow } from '../parts';
import { mulberry32 } from '../../core/rng';

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
const dark = (c: number, k: number) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
};
/** Tuiles de toit des maisons selon l'âge et la variante */
const houseTile = (age: number, v: number) => (age <= 1 ? A.thatch : age === 2 ? pick([A.tile, A.tile, A.tile, A.tileG], v) : pick([A.tile, A.tileG, A.tileB, A.tile], v));
/** Tuiles des grands édifices */
const templeTile = (age: number) => (age <= 1 ? A.shingle : age === 2 ? A.tile : age === 3 ? A.tileG : age === 4 ? A.tileG : A.tileB);

// ---------- Géométrie brute ----------

type V3 = [number, number, number];

/** Pousse un triangle dont la normale s'écarte du point `ref` (les faces sont vues de face) ; un triangle plat est ignoré */
function tri(out: number[], a: V3, b: V3, c: V3, ref: V3) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * nx + ny * ny + nz * nz < 1e-12) return;
  const cx = (a[0] + b[0] + c[0]) / 3 - ref[0], cy = (a[1] + b[1] + c[1]) / 3 - ref[1], cz = (a[2] + b[2] + c[2]) / 3 - ref[2];
  if (nx * cx + ny * cy + nz * cz >= 0) out.push(...a, ...b, ...c);
  else out.push(...a, ...c, ...b);
}
const quad = (out: number[], a: V3, b: V3, c: V3, d: V3, ref: V3) => { tri(out, a, b, c, ref); tri(out, a, c, d, ref); };

/** Ajoute une liste plate de triangles comme une pièce */
function mesh(p: Parts, pts: number[], x: number, y: number, z: number, col: number, ry = 0, glow: Glow = false) {
  if (!pts.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  p.add(g, x, y, z, col, ry, glow);
}

/** Côte en toit (arête saillante) le long d'une polyligne : deux pans de `rw` de demi-largeur (direction `q`, horizontale) et `rh` de haut */
function rib(out: number[], pts: V3[], qx: number, qz: number, rw: number, rh: number) {
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
function inFrame(p: Parts, x: number, y: number, z: number, ry: number, draw: (q: Parts) => void, k = 1) {
  const q = new Parts();
  draw(q);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(k, k, k));
  for (const g of q.body) { g.applyMatrix4(m); p.body.push(g); }
  for (const g of q.glow) { g.applyMatrix4(m); p.glow.push(g); }
}

/** Une pièce pointue (cône à `seg` pans) de la base `at` vers la direction `dir` */
function spike(p: Parts, r: number, len: number, at: V3, dir: V3, col: number, x: number, y: number, z: number, ry: number, seg = 4) {
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
function lantern(p: Parts, x: number, y: number, z: number, r = 0.04, col = A.lantern) {
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
function rail(p: Parts, len: number, x: number, y: number, z: number, ry = 0, col = A.marble, h = 0.07, step = 0.24) {
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
  const ro: RoofO = { rows: o.rows ?? 2, step: o.step ?? 0.1, lift: o.lift, glow: o.neon !== undefined ? 'neon' : false, edge: o.neon, under: o.under, ridge: o.ridge };
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
