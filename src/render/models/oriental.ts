import * as THREE from 'three';
import { Parts, type Glow } from '../parts';
import { mulberry32 } from '../../core/rng';

/**
 * Les modèles du peuple oriental (ville de décor de l'archipel, voir `townModels.ts`, `rivalTowns.ts` et `docs/iles.md`).
 * Brique crue et rondins à l'Antiquité ; puis enduit blanc et sable, arcs outrepassés, coupoles turquoise, mosaïques,
 * merlons à gradins (Médiéval) ; faïence bleue, moucharabiehs, minarets ronds à balcons (Industriel) ; marbre blanc,
 * coupoles dorées, béton blanc (Moderne) ; verre, coupoles lumineuses, liserés turquoise (Futuriste).
 * Mêmes conventions que `models.ts` : coordonnées locales au lot, origine au centre, façade vers +z, 1 = une case.
 */

// ---------- Palette ----------

export const O = {
  mud: 0xc9a273, mudD: 0xa58357, mudL: 0xd6b483, straw: 0xc8b07a, sand: 0xe6d3a8, white: 0xf3eee3, cream: 0xeee2c6,
  marble: 0xf7f4ee, stone: 0xd8c7a2, stoneD: 0xb9a47c, turq: 0x2f9e9a, turqL: 0x5cc4b9, turqD: 0x1f7470, blue: 0x2f6f9e,
  cobalt: 0x274f8c, gold: 0xd9b24a, wood: 0x7a5536, darkwood: 0x5a3e2a, beam: 0x6b4a30, hole: 0x3b3029, shade: 0x7d6a55,
  win: 0x9db4c6, water: 0x6cc4d0, glass: 0xa8d0da, green: 0x6f9a4a, greenD: 0x50783a, cypress: 0x3f6440, terra: 0xb4744a,
  concrete: 0xe8e4dc, steel: 0x9aa3a8, red: 0xb8483a, ochre: 0xd9a43c, rose: 0xc9767a,
};
/** Toiles des auvents et des étals */
export const AWNING = [0xc7563e, 0xd9a43c, 0x2f6e6a, 0xe9e1cf, 0x8a4f7a, 0x34506a];
/** Jeux de couleurs des mosaïques (fond, motif, liseré) */
const TILES = [[O.turq, O.white, O.cobalt], [O.cobalt, O.turqL, O.gold], [O.turqD, O.sand, O.turq], [O.blue, O.white, O.ochre]];

/** L'élément `i` d'une liste, en boucle (aussi pour un `i` négatif) */
export const pick = <T,>(a: T[], i: number) => a[((Math.round(i) % a.length) + a.length) % a.length];

// ---------- Outils de construction ----------

/**
 * Une face d'un volume : repère local (u le long de la face, y vers le haut, n vers l'extérieur), d'origine (ox, oy, oz) et
 * tournée de `ry` (la normale est (sin ry, cos ry)). Les décors d'une façade s'écrivent une fois et se posent sur les quatre
 */
export class Face {
  readonly c: number;
  readonly s: number;
  constructor(readonly p: Parts, readonly ry: number, readonly ox = 0, readonly oz = 0, readonly oy = 0) {
    this.c = Math.cos(ry); this.s = Math.sin(ry);
  }
  x(u: number, n: number) { return this.ox + u * this.c + n * this.s; }
  z(u: number, n: number) { return this.oz - u * this.s + n * this.c; }
  add(g: THREE.BufferGeometry, u: number, y: number, n: number, col: number, glow: Glow = false, rz = 0, ry = 0) {
    this.p.add(g, this.x(u, n), this.oy + y, this.z(u, n), col, this.ry + ry, glow, rz);
  }
  /** Boîte (y = base), d le long de la normale */
  box(w: number, h: number, d: number, u: number, y: number, n: number, col: number, glow: Glow = false) {
    this.add(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), u, y, n, col, glow);
  }
  /** Plaque plate tournée vers l'extérieur, centrée en (u, yc), tournée de `rz` dans son plan */
  plane(w: number, h: number, u: number, yc: number, n: number, col: number, glow: Glow = false, rz = 0) {
    this.add(new THREE.PlaneGeometry(w, h), u, yc, n, col, glow, rz);
  }
  /** Forme plate (contour dans le plan de la face, base en y) */
  shape(pts: THREE.Vector2[], u: number, y: number, n: number, col: number, glow: Glow = false) {
    this.add(new THREE.ShapeGeometry(new THREE.Shape(pts)), u, y, n, col, glow);
  }
  cyl(rt: number, rb: number, h: number, seg: number, u: number, y: number, n: number, col: number, glow: Glow = false) {
    this.add(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0), u, y, n, col, glow);
  }
}

/** Les quatre faces d'un bloc W × D centré en (cx, cz) : avant (+z), droite (+x), arrière, gauche ; avec leur longueur */
export function faces(p: Parts, W: number, D: number, cx = 0, cz = 0, oy = 0): [Face, number][] {
  return [
    [new Face(p, 0, cx, cz + D / 2, oy), W], [new Face(p, Math.PI / 2, cx + W / 2, cz, oy), D],
    [new Face(p, Math.PI, cx, cz - D / 2, oy), W], [new Face(p, -Math.PI / 2, cx - W / 2, cz, oy), D],
  ];
}

/** `n` faces régulièrement réparties sur un cercle de rayon r (tambour, minaret), tournées vers l'extérieur */
export function ring(p: Parts, n: number, r: number, cx: number, cz: number, oy = 0, a0 = 0): Face[] {
  const out: Face[] = [];
  for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI * 2; out.push(new Face(p, a, cx + Math.sin(a) * r, cz + Math.cos(a) * r, oy)); }
  return out;
}

export type ArchKind = 'round' | 'horse' | 'pointed' | 'flat';

/** Contour d'une baie de largeur w et de hauteur h (base au centre) : plein cintre, outrepassé, brisé ou droit */
export function archPts(w: number, h: number, kind: ArchKind, seg = 6): THREE.Vector2[] {
  const r = w / 2, V = (x: number, y: number) => new THREE.Vector2(x, y);
  if (kind === 'flat') return [V(-r, 0), V(r, 0), V(r, h), V(-r, h)];
  const pts: THREE.Vector2[] = [];
  if (kind === 'horse') {
    // arc outrepassé : le cercle descend sous sa ligne de naissance, les piédroits sont plus serrés que lui
    const b = 0.55, j = r * Math.cos(b), hc = Math.max(r * Math.sin(b), h - r);
    pts.push(V(j, 0));
    for (let i = 0; i <= seg; i++) { const a = -b + ((Math.PI + 2 * b) * i) / seg; pts.push(V(r * Math.cos(a), hc + r * Math.sin(a))); }
    pts.push(V(-j, 0));
    return pts;
  }
  if (kind === 'round') {
    const hs = Math.max(0, h - r);
    pts.push(V(r, 0));
    for (let i = 0; i <= seg; i++) { const a = (Math.PI * i) / seg; pts.push(V(r * Math.cos(a), hs + r * Math.sin(a))); }
    pts.push(V(-r, 0));
    return pts;
  }
  // arc brisé à deux centres
  const R = r * 1.5, phi = Math.acos((r - R) / R), hs = Math.max(0, h - R * Math.sin(phi)), k = Math.max(2, Math.round(seg / 2));
  const left: THREE.Vector2[] = [];
  for (let i = 0; i <= k; i++) { const a = Math.PI - ((Math.PI - phi) * i) / k; left.push(V(-r + R + R * Math.cos(a), hs + R * Math.sin(a))); }
  pts.push(V(r, 0));
  for (let i = 0; i < left.length; i++) { const q = left[i]; pts.push(V(-q.x, q.y)); }
  for (let i = left.length - 2; i >= 0; i--) pts.push(left[i]);
  pts.push(V(-r, 0));
  return pts;
}

/**
 * Une baie en arc peinte sur une façade : encadrement (`frame`, un peu plus grand), puis le creux ou le vitrage. `alfiz` :
 * le cadre rectangulaire qui entoure l'arc (art andalou), d'une troisième couleur
 */
export function bay(f: Face, u: number, y: number, w: number, h: number, kind: ArchKind, col: number, opt: { frame?: number; alfiz?: number; glow?: Glow; n?: number; seg?: number } = {}) {
  const n = opt.n ?? 0, seg = opt.seg ?? 6;
  if (opt.alfiz !== undefined) f.plane(w + 0.12, h + 0.08, u, y + (h + 0.08) / 2 - 0.02, n + 0.003, opt.alfiz);
  if (opt.frame !== undefined) f.shape(archPts(w + 0.05, h + 0.03, kind, seg), u, y, n + 0.006, opt.frame);
  f.shape(archPts(w, h, kind, seg), u, y, n + 0.009, col, opt.glow ?? false);
}

/** Fenêtre en arc : encadrement, vitrage allumé la nuit, grille (deux barreaux et une traverse) et appui */
export function win(f: Face, u: number, y: number, w: number, h: number, kind: ArchKind, frame: number, opt: { grille?: number; sill?: number; glow?: Glow; n?: number } = {}) {
  const n = opt.n ?? 0;
  bay(f, u, y, w, h, kind, O.win, { frame, glow: opt.glow ?? true, n, seg: 4 });
  if (opt.grille !== undefined) {
    for (const s of [-1, 1]) f.plane(0.008, h * 0.8, u + s * w * 0.18, y + h * 0.4, n + 0.013, opt.grille);
    f.plane(w * 0.9, 0.008, u, y + h * 0.42, n + 0.013, opt.grille);
  }
  if (opt.sill !== undefined) f.box(w + 0.05, 0.016, 0.035, u, y - 0.016, n + 0.012, opt.sill);
}

/** Porte en arc : encadrement, vantaux de bois (deux planches marquées), heurtoir et marche */
export function door(f: Face, u: number, w: number, h: number, kind: ArchKind, frame: number, leaf: number, opt: { step?: number; n?: number; y?: number } = {}) {
  const n = opt.n ?? 0, y = opt.y ?? 0;
  bay(f, u, y, w, h, kind, leaf, { frame, n, seg: 6 });
  f.plane(0.006, h * 0.8, u, y + h * 0.4, n + 0.012, dark(leaf, 0.7));
  f.box(0.014, 0.014, 0.012, u + w * 0.2, y + h * 0.45, n + 0.012, O.gold);
  if (opt.step !== undefined) f.box(w + 0.08, 0.025, 0.07, u, y, n + 0.035, opt.step);
}

/** Bandeau de mosaïque : fond, losanges de couleur, liserés ; `u` au centre, `yc` au milieu de la bande */
export function mosaic(f: Face, u: number, len: number, yc: number, h: number, cols: number[], n = 0, step = 0) {
  const st = step || h * 1.1, k = Math.max(1, Math.floor(len / st));
  f.plane(len, h, u, yc, n + 0.004, cols[0]);
  for (let i = 0; i < k; i++) f.plane(h * 0.5, h * 0.5, u - len / 2 + (len / k) * (i + 0.5), yc, n + 0.007, i % 2 ? cols[1] : cols[2], false, Math.PI / 4);
  for (const s of [-1, 1]) f.plane(len, h * 0.12, u, yc + s * h * 0.44, n + 0.007, cols[2]);
}

/** Panneau de mosaïque (tympan, cadre de l'iwan) : quadrillage de losanges sur un fond */
export function panel(f: Face, u: number, yc: number, w: number, h: number, cols: number[], n = 0, cell = 0.12) {
  f.plane(w, h, u, yc, n + 0.004, cols[0]);
  const nx = Math.max(1, Math.round(w / cell)), ny = Math.max(1, Math.round(h / cell));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++)
      if ((i + j) % 2 === 0) f.plane(cell * 0.45, cell * 0.45, u - w / 2 + (w / nx) * (i + 0.5), yc - h / 2 + (h / ny) * (j + 0.5), n + 0.007, (i + j) % 4 ? cols[1] : cols[2], false, Math.PI / 4);
}

/** Boîte sans sa face du dessous (posée sur un mur ou au sol : 10 triangles au lieu de 12), base en y = 0 */
export function openBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const idx = Array.from(g.index!.array);
  idx.splice(18, 6);
  g.setIndex(idx);
  return g;
}

/** Colonne sans fonds (cachés par la base et le chapiteau) */
export function column(p: Parts, r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number, col: number) {
  p.add(new THREE.CylinderGeometry(r1, r0, h, seg, 1, true).translate(0, h / 2, 0), x, y, z, col);
}

export type MerlonKind = 'step' | 'round' | 'tooth';

/** Merlons sur le haut d'un mur (face `f`, longueur `len`, en y), posés au nu de la face, épaisseur t */
export function merlons(f: Face, len: number, y: number, col: number, kind: MerlonKind = 'step', step = 0.3, h = 0.09, t = 0.05) {
  // pas moins de 0,28 case entre deux merlons d'un long mur : ce sont eux qui coûtent le plus de triangles
  const k = Math.max(1, Math.round(len / Math.max(step, len > 0.6 ? 0.28 : 0)));
  for (let i = 0; i < k; i++) {
    const u = -len / 2 + (len / k) * (i + 0.5), w = Math.min(0.17, (len / k) * 0.55);
    if (kind === 'step') { f.add(openBox(w, h * 0.6, t), u, y, -t / 2, col); f.add(openBox(w * 0.5, h * 0.4, t), u, y + h * 0.6, -t / 2, col); }
    else if (kind === 'round') { f.add(openBox(w, h * 0.55, t), u, y, -t / 2, col); f.add(new THREE.CylinderGeometry(w / 2, w / 2, t, 3, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, h * 0.55, 0), u, y, -t / 2, col); }
    else f.add(openBox(w, h, t), u, y, -t / 2, col);
  }
}

/** Corniche : un listel saillant et un rang de denticules sous lui */
export function cornice(f: Face, len: number, y: number, col: number, dent?: number, out = 0.03) {
  f.box(len + out, 0.03, out * 2, 0, y, 0, col);
  if (dent === undefined) return;
  const k = Math.floor(len / 0.09);
  for (let i = 0; i < k; i++) f.plane(0.035, 0.025, -len / 2 + (len / k) * (i + 0.5), y - 0.0125, 0.01, dent);
}

/** Abouts des rondins de la terrasse (brique crue) : une rangée qui dépasse du mur sous le toit */
export function vigas(f: Face, len: number, y: number, col = O.beam, step = 0.2, out = 0.05) {
  const k = Math.max(1, Math.floor(len / step));
  for (let i = 0; i < k; i++) f.add(new THREE.CylinderGeometry(0.016, 0.016, out, 3, 1, true).rotateX(Math.PI / 2), -len / 2 + (len / k) * (i + 0.5), y, out / 2, col);
}

/** Moucharabieh : balcon fermé de bois ajouré, en encorbellement sur une façade */
export function mashrabiya(f: Face, u: number, y: number, w: number, h: number, wood = O.darkwood, lit = true) {
  const d = 0.12;
  f.box(w, 0.035, d + 0.02, u, y - 0.035, d / 2, wood);
  for (const s of [-1, 1]) f.add(new THREE.BoxGeometry(0.02, 0.06, d).rotateX(-0.6), u + s * (w / 2 - 0.02), y - 0.06, d / 2 - 0.02, wood);
  f.box(w, h, d, u, y, d / 2, wood);
  // le treillis : un vitrage chaud derrière une grille de baguettes
  f.plane(w - 0.04, h - 0.06, u, y + h / 2, d + 0.003, lit ? O.win : dark(wood, 0.7), lit);
  const kx = Math.max(2, Math.round(w / 0.05)), ky = Math.max(2, Math.round(h / 0.05));
  for (let i = 1; i < kx; i++) f.plane(0.01, h - 0.06, u - (w - 0.04) / 2 + ((w - 0.04) / kx) * i, y + h / 2, d + 0.006, wood);
  for (let j = 1; j < ky; j++) f.plane(w - 0.04, 0.01, u, y + 0.03 + ((h - 0.06) / ky) * j, d + 0.006, wood);
  f.box(w + 0.03, 0.03, d + 0.03, u, y + h, d / 2, wood);
}

/** Frise peinte de triangles le long d'une face (décor des maisons de terre), centrée, base en y : un triangle par motif */
export function frieze(f: Face, len: number, y: number, col: number, step = 0.07, n = 0.004) {
  const k = Math.max(2, Math.floor(len / step)), V = (x: number, yy: number) => new THREE.Vector2(x, yy);
  for (let i = 0; i < k; i++) f.shape([V(-step * 0.32, 0), V(step * 0.32, 0), V(0, step * 0.5)], -len / 2 + (len / k) * (i + 0.5), y, n, col);
}
/** Pinacles de terre aux quatre coins d'une terrasse w × d posée en y (architecture de terre crue) */
function pinnacles(p: Parts, w: number, d: number, y: number, col: number, r = 0.04, h = 0.12, x = 0, z = 0) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cone(r, h, 4, x + sx * (w / 2 - r * 0.7), y, z + sz * (d / 2 - r * 0.7), col, false, Math.PI / 4);
}
/** Torche murale sur une face : hampe de bois, flamme qui vacille la nuit */
function wallTorch(f: Face, u: number, y: number) {
  f.add(new THREE.BoxGeometry(0.014, 0.1, 0.014).rotateX(0.5), u, y, 0.02, O.darkwood);
  f.box(0.03, 0.045, 0.03, u, y + 0.045, 0.045, 0xffa040, true);
}

/** Assombrit une couleur */
export function dark(c: number, k: number) {
  const col = new THREE.Color(c).multiplyScalar(k);
  return col.getHex();
}

/** Tronc de pyramide : rectangle w0 × d0 en y, rectangle w1 × d1 en y + h (d1 ≈ 0 : un faîtage le long de x) */
export function frustum(p: Parts, w0: number, d0: number, w1: number, d1: number, h: number, x: number, y: number, z: number, col: number, ry = 0, glow: Glow = false) {
  const a = w0 / 2, b = d0 / 2, c = w1 / 2, e = d1 / 2;
  const B = [[-a, 0, -b], [a, 0, -b], [a, 0, b], [-a, 0, b]], T = [[-c, h, -e], [c, h, -e], [c, h, e], [-c, h, e]];
  const tri: number[][] = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; tri.push(B[j], B[i], T[i], B[j], T[i], T[j]); }
  if (c > 0.001 && e > 0.001) tri.push(T[0], T[2], T[1], T[0], T[3], T[2]);
  const pos = new Float32Array(tri.length * 3);
  tri.forEach((v, i) => pos.set(v, i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  p.add(g, x, y, z, col, ry, glow);
}

export type DomeKind = 'half' | 'onion' | 'persian' | 'saucer';

/** Coupole de rayon r et de hauteur h posée en y : demi-sphère, bulbe, profil persan (légèrement brisé), calotte basse */
export function dome(p: Parts, r: number, h: number, x: number, y: number, z: number, col: number, kind: DomeKind = 'half', seg = 12, glow: Glow = false, alt?: number, band?: number) {
  const prof: Record<DomeKind, number[][]> = {
    half: [[1, 0], [0.97, 0.22], [0.9, 0.44], [0.78, 0.63], [0.6, 0.8], [0.36, 0.93], [0, 1]],
    onion: [[0.9, 0], [1.06, 0.18], [1.04, 0.36], [0.82, 0.56], [0.5, 0.74], [0.2, 0.88], [0, 1]],
    persian: [[1, 0], [1.02, 0.2], [0.96, 0.42], [0.8, 0.62], [0.55, 0.8], [0.25, 0.93], [0, 1]],
    saucer: [[1, 0], [0.86, 0.45], [0.55, 0.82], [0, 1]],
  };
  const all = prof[kind].map(([u, v]) => new THREE.Vector2(u * r, v * h)), pts = all.slice(0, -1);
  // la calotte du sommet, à part : presque à plat, une couleur bleue y prendrait les reflets de l'eau (shader `addWater`)
  p.add(new THREE.LatheGeometry(all.slice(-2), seg), x, y, z, glow ? col : notWater(col), 0, glow);
  if (alt === undefined && band === undefined) { p.add(new THREE.LatheGeometry(pts, seg), x, y, z, col, 0, glow); return; }
  // côtes de deux couleurs (un fuseau sur deux) au-dessus d'une ceinture de faïence : autant de triangles qu'une coupole unie
  const k = band === undefined ? 0 : 1;
  if (k) p.add(new THREE.LatheGeometry(pts.slice(0, k + 1), seg), x, y, z, band!, 0, glow);
  const up = pts.slice(k), step = (Math.PI * 2) / seg;
  for (let i = 0; i < seg; i++) p.add(new THREE.LatheGeometry(up, 1, i * step, step), x, y, z, i % 2 && alt !== undefined ? alt : col, 0, glow);
}

/** Une couleur que le shader de l'eau ne prend pas pour de l'eau sur une face à plat (bleu ou turquoise : on grise un peu) */
export function notWater(c: number) {
  const k = new THREE.Color(c);
  if (k.b < 0.45 || (k.b - k.r) / k.b < 0.3 || (k.g - k.r) / Math.max(k.g, 0.01) < 0.22) return c;
  k.r = k.b * 0.72;
  return k.getHex();
}

/** Épi de faîtage doré d'une coupole (tige et trois boules) */
export function finial(p: Parts, x: number, y: number, z: number, k = 1, col = O.gold) {
  p.cyl(0.012 * k, 0.016 * k, 0.24 * k, 4, x, y - 0.02, z, col);
  p.add(new THREE.OctahedronGeometry(0.04 * k), x, y + 0.06 * k, z, col);
  p.add(new THREE.OctahedronGeometry(0.03 * k), x, y + 0.13 * k, z, col);
  p.cone(0.02 * k, 0.07 * k, 4, x, y + 0.16 * k, z, col);
}

/** Palmier : stipe en deux tronçons un peu courbés, couronne de palmes retombantes, régimes de dattes */
export function palm(p: Parts, x: number, z: number, h: number, seed: number, trunk = 0x8a6a48, leaf = 0x5f9442, dates = true) {
  const lean = (((seed * 7) % 5) - 2) * 0.05, dir = seed * 1.7;
  const lx = Math.cos(dir) * lean, lz = Math.sin(dir) * lean;
  // le stipe : deux tronçons, le second plus penché, avec des anneaux
  const h1 = h * 0.55, h2 = h * 0.45;
  p.add(new THREE.CylinderGeometry(0.03, 0.045, h1, 5).translate(0, h1 / 2, 0), x, 0, z, trunk, 0, false, -lx, lz);
  const mx = x + Math.sin(lx) * h1, mz = z + Math.sin(lz) * h1, my = h1 * Math.cos(lean);
  p.add(new THREE.CylinderGeometry(0.026, 0.031, h2, 5).translate(0, h2 / 2, 0), mx, my - 0.01, mz, dark(trunk, 1.08), 0, false, -lx * 1.8, lz * 1.8);
  const tx = mx + Math.sin(lx * 1.8) * h2, tz = mz + Math.sin(lz * 1.8) * h2, ty = my + h2 * Math.cos(lean * 1.8);
  p.sphere(0.045, tx, ty, tz, dark(trunk, 0.85));
  // les palmes : des lames pliées sur leur nervure, qui montent puis retombent
  const n = 8, L = 0.2 + h * 0.12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed, c = i % 2 ? leaf : dark(leaf, 1.15);
    p.add(frondGeo(L, i % 2 ? 0.8 : 1).rotateY(a), tx, ty, tz, c);
  }
  if (dates) for (let i = 0; i < 2; i++) { const a = seed + i * 3; p.sphere(0.035, tx + Math.sin(a) * 0.05, ty - 0.06, tz + Math.cos(a) * 0.05, 0xb5652a, 0, 1.4); }
}

/** Une palme : lame pliée sur sa nervure (montée puis retombée), visible des deux côtés */
function frondGeo(L: number, k: number) {
  const w = 0.045, up = L * 0.35 * k, B = [0, 0, 0], M = [0, up + 0.012, L * 0.95], ML = [-w, up - 0.01, L * 0.9], MR = [w, up - 0.01, L * 0.9];
  const T = [0, up - L * 0.45 * k, L * 1.75], tri = [B, M, ML, B, MR, M, ML, M, T, M, MR, T];
  const both = [...tri, ...tri.slice().reverse()];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(both.flat()), 3));
  return g;
}

/** Cyprès des jardins : fuseau sombre */
export function cypress(p: Parts, x: number, z: number, h: number, col = O.cypress) {
  p.cyl(0.02, 0.025, h * 0.15, 4, x, 0, z, O.darkwood);
  p.add(new THREE.LatheGeometry([[0, 0], [0.07, 0.1], [0.09, 0.35], [0.06, 0.7], [0, 1]].map(([u, v]) => new THREE.Vector2(u * h * 1.2, v * h * 0.9)), 6), x, h * 0.1, z, col);
}

/** Jarre de terre cuite */
export function jar(p: Parts, x: number, z: number, s: number, col = O.terra, y = 0) {
  p.add(new THREE.LatheGeometry([[0.02, 0], [0.05, 0.02], [0.065, 0.06], [0.05, 0.11], [0.025, 0.13], [0.03, 0.15]].map(([u, v]) => new THREE.Vector2(u * s, v * s)), 6), x, y, z, col);
}

/** Fontaine : vasque à pans, eau, colonnette et coupe ; `canopy` : petit kiosque à coupole sur colonnes */
export function fountain(p: Parts, x: number, z: number, r: number, rim: number, y = 0, canopy?: { dome: number; col: number; h: number }) {
  p.cyl(r, r * 1.04, 0.09, 8, x, y, z, rim);
  p.cyl(r * 0.86, r * 0.86, 0.092, 8, x, y, z, O.water);
  p.cyl(0.03, 0.045, 0.2, 6, x, y + 0.09, z, rim);
  p.cyl(r * 0.32, r * 0.12, 0.05, 8, x, y + 0.27, z, rim);
  p.cyl(r * 0.26, r * 0.26, 0.052, 8, x, y + 0.27, z, O.water);
  if (!canopy) return;
  const R = r * 1.1;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; p.cyl(0.02, 0.02, canopy.h, 5, x + Math.sin(a) * R, y + 0.09, z + Math.cos(a) * R, canopy.col); }
  p.cyl(R + 0.06, R + 0.06, 0.06, 8, x, y + 0.09 + canopy.h, z, canopy.col);
  dome(p, R, R * 0.7, x, y + 0.15 + canopy.h, z, canopy.dome, 'half', 8);
  finial(p, x, y + 0.15 + canopy.h + R * 0.7, z, 0.6);
}

/** Parterre de fleurs : planche de verdure et quelques touffes de couleur */
export function bed(p: Parts, w: number, d: number, x: number, z: number, seed: number, border = O.stone, y = 0) {
  p.box(w + 0.04, 0.04, d + 0.04, x, y, z, border);
  p.box(w, 0.05, d, x, y, z, O.green);
  const r = mulberry32(seed), cols = [0xd8577a, 0xe8c14a, 0xf2efe6, 0xb85ac0, 0xe0703a];
  const k = Math.max(2, Math.round((w * d) / 0.22));
  for (let i = 0; i < k; i++) p.add(new THREE.TetrahedronGeometry(0.04), x + (r() - 0.5) * (w - 0.08), y + 0.07, z + (r() - 0.5) * (d - 0.08), pick(cols, Math.floor(r() * 5)));
  if (k < 0) p.box(0.05, 0.05, 0.05, x + (r() - 0.5) * (w - 0.08), y + 0.04, z + (r() - 0.5) * (d - 0.08), pick(cols, Math.floor(r() * 5)));
}

/** Fenêtres de verre sur les quatre façades d'un bloc w × d (immeubles) : un bandeau vitré par étage, recoupé de trumeaux */
export function bandsAround(p: Parts, w: number, d: number, y0: number, floors: number, fh: number, col: number, wall: number, step = 0.24, wh = 0.12, glow: Glow = true) {
  for (let f = 0; f < floors; f++) p.box(w + 0.012, wh, d + 0.012, 0, y0 + f * fh + fh * 0.35, 0, col, 0, glow);
  const h = floors * fh;
  for (const [ry, len, off] of [[0, w, d / 2], [Math.PI / 2, d, w / 2]] as const) {
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const u = Math.max(-len / 2 + 0.05, Math.min(len / 2 - 0.05, -len / 2 + (len / n) * i)), pw = i === 0 || i === n ? 0.1 : Math.min(0.07, len / n - 0.06);
      p.box(pw, h - 0.02, off * 2 + 0.024, ry ? 0 : u, y0, ry ? u : 0, wall, ry);
    }
  }
}

// ---------- Le style de chaque âge ----------

interface Style {
  mud: boolean;
  /** enduit des murs, encadrements et corniches, soubassement */
  wall: number; trim: number; base: number;
  /** couleur des coupoles, profil, verre lumineux (Futuriste) */
  dome: number; domeKind: DomeKind; domeGlow: Glow;
  arch: ArchKind;
  tiles: number[];
  merlon: MerlonKind;
  /** liseré néon (Futuriste) */
  neon?: number;
}
function style(age: number): Style {
  if (age <= 1) return { mud: true, wall: O.mud, trim: O.mudD, base: O.mudD, dome: O.mudL, domeKind: 'saucer', domeGlow: false, arch: 'round', tiles: [O.mudD, O.straw, O.wood], merlon: 'tooth' };
  if (age === 2) return { mud: false, wall: O.white, trim: O.sand, base: O.stoneD, dome: O.turq, domeKind: 'half', domeGlow: false, arch: 'horse', tiles: TILES[0], merlon: 'step' };
  if (age === 3) return { mud: false, wall: O.cream, trim: O.stone, base: O.stoneD, dome: O.blue, domeKind: 'persian', domeGlow: false, arch: 'pointed', tiles: TILES[1], merlon: 'step' };
  if (age === 4) return { mud: false, wall: O.marble, trim: O.sand, base: O.stone, dome: O.gold, domeKind: 'persian', domeGlow: false, arch: 'pointed', tiles: TILES[3], merlon: 'round' };
  return { mud: false, wall: O.marble, trim: 0xdfe6e6, base: 0xc9ced0, dome: O.glass, domeKind: 'persian', domeGlow: true, arch: 'pointed', tiles: [O.turqD, O.turqL, O.white], merlon: 'round', neon: O.turqL };
}

// ---------- La mosquée (au centre, lot de 5 × 5) ----------

/** Minaret de hauteur H posé en (x, z), du style de l'âge */
function minaret(p: Parts, age: number, s: Style, x: number, z: number, H: number) {
  if (s.mud) {
    // tour de brique crue, effilée, hérissée de rondins, coiffée d'une lanterne et d'un pinacle
    frustum(p, 0.62, 0.62, 0.4, 0.4, H * 0.82, x, 0, z, s.wall);
    for (const [f] of faces(p, 0.5, 0.5, x, z)) {
      for (let k = 0; k < 3; k++) vigas(f, 0.4, 0.35 + k * H * 0.22, O.beam, 0.13, 0.07);
      f.shape(archPts(0.08, 0.14, 'round', 4), 0, H * 0.62, 0.012, O.hole);
    }
    p.box(0.46, 0.06, 0.46, x, H * 0.82, z, s.trim);
    p.box(0.3, H * 0.12, 0.3, x, H * 0.82 + 0.06, z, s.wall);
    for (const [f] of faces(p, 0.3, 0.3, x, z)) f.shape(archPts(0.07, 0.1, 'round', 4), 0, H * 0.85, 0.006, O.hole);
    p.cone(0.12, 0.22, 4, x, H * 0.94 + 0.06, z, s.wall);
    p.sphere(0.035, x, H * 0.94 + 0.3, z, O.terra);
    return;
  }
  if (age === 2) {
    // tour carrée à l'andalouse : panneaux de mosaïque en losanges, baies géminées, lanternon à coupole
    const w = 0.52;
    p.box(w + 0.08, 0.12, w + 0.08, x, 0, z, s.base);
    p.box(w, H * 0.78, w, x, 0.12, z, s.wall);
    for (const [f] of faces(p, w, w, x, z)) {
      f.plane(w * 0.7, H * 0.18, 0, H * 0.48, 0.004, s.tiles[0]);
      panel(f, 0, H * 0.48, w * 0.62, H * 0.15, [s.tiles[0], s.tiles[1], s.tiles[2]], 0.003, 0.08);
      for (const sx of [-1, 1]) bay(f, sx * 0.08, H * 0.26, 0.1, 0.2, 'horse', O.hole, { frame: s.trim, seg: 5 });
      f.box(0.03, 0.2, 0.03, 0, H * 0.26, 0.015, s.trim);
      bay(f, 0, H * 0.64, 0.16, 0.18, 'horse', O.win, { frame: s.tiles[0], glow: true, seg: 5 });
      mosaic(f, 0, w, H * 0.75, 0.06, s.tiles);
      merlons(f, w, H * 0.78 + 0.12, s.wall, 'step', 0.17, 0.1, 0.05);
    }
    const y = H * 0.78 + 0.12;
    p.box(w * 0.5, H * 0.14, w * 0.5, x, y, z, s.wall);
    for (const [f] of faces(p, w * 0.5, w * 0.5, x, z, y)) bay(f, 0, 0.04, 0.1, 0.16, 'horse', O.win, { frame: s.tiles[0], glow: true, seg: 4 });
    p.box(w * 0.56, 0.03, w * 0.56, x, y + H * 0.14, z, s.trim);
    dome(p, w * 0.24, w * 0.3, x, y + H * 0.14 + 0.03, z, s.dome, 'half', 8);
    finial(p, x, y + H * 0.14 + 0.03 + w * 0.3, z, 0.8);
    return;
  }
  // minaret rond : socle à pans, fût, balcons sur consoles à gradins, fût plus fin, flèche
  const r0 = age === 3 ? 0.2 : age === 4 ? 0.17 : 0.15, seg = 12;
  p.cyl(r0 + 0.1, r0 + 0.12, 0.45, 8, x, 0, z, s.base);
  p.cyl(r0 + 0.12, r0 + 0.12, 0.04, 8, x, 0.45, z, s.trim);
  const balconies = age === 3 ? [0.55] : [0.5, 0.74];
  let y = 0.49, r = r0;
  for (let i = 0; i <= balconies.length; i++) {
    const top = i < balconies.length ? H * balconies[i] : H * 0.9, rr = r * (age === 5 ? 0.86 : 0.92);
    column(p, r, rr, top - y, seg, x, y, z, s.wall);
    if (age === 3 && i === 0) for (const f of ring(p, 8, r * 0.98, x, z, y)) f.plane(0.05, (top - y) * 0.06, 0, (top - y) * 0.9, 0.002, s.tiles[0]);
    if (i === balconies.length) { y = top; r = rr; break; }
    // consoles à gradins (muqarnas), le balcon et son garde-corps, une porte sur le balcon
    for (let k = 0; k < 3; k++) column(p, rr + k * 0.03, rr + 0.03 + k * 0.03, 0.04, seg, x, top - 0.12 + k * 0.04, z, k === 1 ? s.tiles[0] : s.trim);
    p.cyl(rr + 0.11, rr + 0.11, 0.025, seg, x, top, z, s.trim);
    // le garde-corps : un cylindre ouvert ajouré (liseré lumineux au Futuriste)
    p.add(new THREE.CylinderGeometry(rr + 0.1, rr + 0.1, 0.06, seg, 1, true).translate(0, 0.03, 0), x, top + 0.025, z, s.trim);
    p.add(new THREE.CylinderGeometry(rr + 0.106, rr + 0.106, 0.015, seg, 1, true).translate(0, 0.0075, 0), x, top + 0.07, z, age === 5 ? O.turqL : s.tiles[0], 0, age === 5 ? 'neon' : false);
    for (const f of ring(p, 4, rr * 0.92, x, z, top + 0.025)) f.shape(archPts(0.06, 0.12, s.arch, 4), 0, 0, 0.004, O.win, true);
    y = top + 0.025; r = rr * 0.9;
  }
  // le lanternon et la flèche
  if (age === 3) { p.cyl(r * 1.15, r, 0.04, seg, x, y, z, s.trim); p.cone(r * 1.15, H * 0.2, seg, x, y + 0.04, z, s.dome); finial(p, x, y + 0.04 + H * 0.2, z, 0.7); return; }
  if (age === 4) { p.cone(r * 1.05, H * 0.17, seg, x, y, z, O.gold); finial(p, x, y + H * 0.17, z, 0.7); return; }
  // Futuriste : lanternon de verre lumineux, aiguille
  p.cyl(r * 0.9, r * 0.9, 0.18, seg, x, y, z, O.glass, true);
  p.cyl(r * 1.1, r * 1.1, 0.03, seg, x, y + 0.18, z, O.white);
  p.cone(r * 0.6, H * 0.18, 8, x, y + 0.21, z, O.white);
  p.cyl(0.008, 0.008, 0.2, 4, x, y + 0.21 + H * 0.18, z, O.turqL, 'neon');
}

/** La grande coupole sur son tambour (base carrée, tambour à pans percé de fenêtres, bandeau de mosaïque, coupole, épi) */
function bigDome(p: Parts, age: number, s: Style, x: number, y: number, z: number, R: number) {
  const seg = 16;
  p.box(R * 2.1, 0.12, R * 2.1, x, y, z, s.wall);
  for (const [f, len] of faces(p, R * 2.1, R * 2.1, x, z, y)) cornice(f, len, 0.12, s.trim);
  // les trompes : quatre pans coupés qui passent du carré à l'octogone
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; frustum(p, R * 0.55, R * 0.5, R * 0.3, R * 0.3, 0.18, x + Math.sin(a) * R * 0.86, y + 0.12, z + Math.cos(a) * R * 0.86, s.wall, a); }
  const dh = s.mud ? 0.14 : 0.36;
  p.cyl(R * 0.98, R, dh, 8, x, y + 0.12, z, s.wall, false, Math.PI / 8);
  if (!s.mud) {
    for (const f of ring(p, 8, R * 0.93, x, z, y + 0.12)) {
      bay(f, 0, 0.07, 0.15, dh * 0.62, s.arch, O.win, { frame: s.tiles[0], glow: true, seg: 4 });
      f.plane(R * 0.7, 0.05, 0, dh - 0.035, 0.003, s.tiles[0]);
      f.plane(0.06, 0.025, 0, dh - 0.035, 0.006, s.tiles[1], false, Math.PI / 4);
    }
    p.cyl(R * 1.03, R * 1.03, 0.04, seg, x, y + 0.12 + dh, z, s.trim);
  }
  const H = s.mud ? R * 0.75 : s.domeKind === 'onion' ? R * 1.3 : R * 1.12, y0 = y + 0.12 + dh + (s.mud ? 0 : 0.04);
  const alt = s.mud || age === 5 ? undefined : dark(s.dome, age === 4 ? 0.86 : 0.9);
  dome(p, R * (s.mud ? 1 : 0.97), H, x, y0, z, s.dome, s.domeKind, seg, s.domeGlow, alt, age === 3 ? s.tiles[1] : undefined);
  if (age === 5) {
    // côtes lumineuses de la coupole de verre
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.add(new THREE.BoxGeometry(0.015, H * 0.9, 0.015).translate(0, H * 0.45, 0).rotateX(-0.75).rotateY(a), x + Math.sin(a) * R * 0.5, y0 + H * 0.12, z + Math.cos(a) * R * 0.5, O.turqL, 0, 'neon'); }
    p.add(new THREE.TorusGeometry(R * 0.98, 0.012, 3, seg).rotateX(Math.PI / 2), x, y0 + 0.02, z, O.turqL, 0, 'neon');
  } else if (!s.mud) {
    // ceinture de mosaïque au pied de la coupole, pointes de couleur
    p.cyl(R * 0.99, R, 0.07, seg, x, y0, z, s.tiles[0]);
    for (const f of ring(p, 12, R * 0.995, x, z, y0)) f.plane(0.05, 0.05, 0, 0.035, 0.003, s.tiles[1], false, Math.PI / 4);
  }
  finial(p, x, y0 + H, z, s.mud ? 0.6 : 1.1, s.mud ? O.terra : O.gold);
}

/** La mosquée : cour à portiques et fontaine devant, salle de prière à coupoles derrière, minarets (un, deux, puis quatre) */
function oMosque(p: Parts, age: number) {
  const s = style(age);
  if (s.mud) { mudMosque(p, s); return; }
  const hh = age === 2 ? 0.78 : age === 3 ? 0.86 : 0.92, ch = 0.55, t = 0.12;
  // le parvis et la plate-forme
  p.box(4.9, 0.06, 4.9, 0, 0, 0, s.base);
  p.box(4.7, 0.012, 2.4, 0, 0.06, 1.05, age >= 4 ? O.marble : O.stone);
  // dalles de la cour, en damier
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2) p.box(0.6, 0.004, 0.55, -1.4 + i * 0.7, 0.072, 0.4 + j * 0.62, s.trim);
  // les murs de la cour : devant (coupé par le portail) et côtés
  for (const sx of [-1, 1]) p.box(1.75, ch, t, sx * 1.42, 0.06, 2.39, s.wall);
  for (const sx of [-1, 1]) p.box(t, ch, 2.75, sx * 2.39, 0.06, 1.0, s.wall);
  // dehors : soubassement, corniche, merlons, petites fenêtres grillagées
  for (const sx of [-1, 1]) {
    const fr = new Face(p, 0, sx * 1.42, 2.45, 0.06);
    cornice(fr, 1.75, ch, s.trim, s.trim);
    merlons(fr, 1.75, ch + 0.03, s.wall, s.merlon, 0.2);
    fr.plane(1.75, 0.08, 0, 0.04, 0.002, s.base);
    for (const u of [-0.45, 0.45]) win(fr, u, 0.2, 0.12, 0.2, s.arch, s.trim, { grille: O.darkwood, glow: false });
    const fs = new Face(p, (sx * Math.PI) / 2, sx * 2.45, 1.0, 0.06);
    cornice(fs, 2.75, ch, s.trim, s.trim);
    merlons(fs, 2.75, ch + 0.03, s.wall, s.merlon, 0.2);
    fs.plane(2.75, 0.08, 0, 0.04, 0.002, s.base);
    for (const u of [-0.8, 0, 0.8]) win(fs, u, 0.2, 0.12, 0.2, s.arch, s.trim, { grille: O.darkwood, glow: false });
  }
  // dedans : les portiques (galerie couverte sur colonnes) le long des trois côtés
  const gd = 0.42, gh = 0.46;
  const gallery = (cx: number, cz: number, len: number, ry: number) => {
    const f = new Face(p, ry, cx, cz, 0.06);
    f.box(len, 0.06, gd, 0, gh, -gd / 2, s.wall);
    f.box(len + 0.02, 0.025, gd + 0.03, 0, gh + 0.06, -gd / 2 + 0.015, s.trim);
    f.plane(len, gh, 0, gh / 2, -gd + 0.005, s.mud ? O.hole : O.shade);
    const k = Math.max(2, Math.round(len / 0.5));
    for (let i = 0; i <= k; i++) {
      const u = -len / 2 + (len / k) * i;
      column(p, 0.032, 0.028, gh - 0.06, 6, f.x(u, -0.04), f.oy, f.z(u, -0.04), s.trim);
      f.box(0.07, 0.04, 0.07, u, gh - 0.06, -0.04, s.trim);
    }
    for (let i = 0; i < k; i++) {
      // l'arc entre deux colonnes : une bande de mur percée d'un arc (peint sur sa face)
      const u = -len / 2 + (len / k) * (i + 0.5), bw = len / k - 0.06;
      f.plane(bw + 0.06, gh * 0.4, u, gh * 0.8, 0.0, s.wall);
      f.shape(archPts(bw, gh * 0.45, s.arch, 5), u, gh * 0.56, 0.003, O.shade);
      if (i % 2 === 0) f.plane(0.05, 0.05, u, gh * 0.92, 0.006, s.tiles[0], false, Math.PI / 4);
    }
  };
  gallery(0, 2.33 - gd, 4.66, Math.PI);
  gallery(-2.33 + gd, 1.05, 2.55, Math.PI / 2);
  gallery(2.33 - gd, 1.05, 2.55, -Math.PI / 2);
  // la fontaine des ablutions au milieu de la cour, palmiers et orangers
  fountain(p, 0, 1.0, 0.36, s.trim, 0.06, age >= 3 ? { dome: s.dome, col: s.wall, h: 0.38 } : undefined);
  for (const [x, z] of [[-1.2, 1.55], [1.2, 1.55], [-1.2, 0.45], [1.2, 0.45]]) {
    p.cyl(0.13, 0.13, 0.08, 8, x, 0.06, z, s.trim);
    if (age === 5 || (x + z) % 2) palm(p, x, z, 0.95, x * 5 + z, 0x8a6a48, 0x5f9442, false);
    else { p.cyl(0.025, 0.03, 0.22, 5, x, 0.06, z, O.darkwood); p.sphere(0.2, x, 0.4, z, O.greenD, 1, 0.9); for (let k = 0; k < 4; k++) p.sphere(0.025, x + Math.sin(k * 1.6) * 0.17, 0.38 + (k % 2) * 0.08, z + Math.cos(k * 1.6) * 0.17, O.ochre); }
  }
  // le portail d'entrée (pishtaq) : haut cadre de mosaïque autour d'une niche en arc
  const pw = 1.2, ph = ch + 0.72;
  p.box(pw, ph, 0.34, 0, 0.06, 2.38, s.wall);
  const fp = new Face(p, 0, 0, 2.55, 0.06);
  panel(fp, 0, ph * 0.5, pw - 0.08, ph - 0.12, s.tiles, 0, 0.1);
  fp.box(0.7, ph * 0.82, 0.02, 0, 0, 0.006, s.trim);
  fp.shape(archPts(0.62, ph * 0.78, s.arch, 7), 0, 0, 0.03, s.tiles[0]);
  fp.shape(archPts(0.5, ph * 0.72, s.arch, 7), 0, 0, 0.034, O.shade);
  // la niche et ses alvéoles (muqarnas) : trois gradins de cubes sous l'arc
  for (let k = 0; k < 3; k++) for (let i = -2 + k; i <= 2 - k; i++) fp.box(0.07, 0.05, 0.03, i * 0.08, ph * 0.45 + k * 0.06, 0.035 + k * 0.004, k % 2 ? s.tiles[1] : s.wall);
  door(fp, 0, 0.3, ph * 0.38, s.arch, s.trim, O.darkwood, { n: 0.036, step: s.base });
  fp.plane(pw, 0.07, 0, ph - 0.12, 0.006, s.tiles[2]);
  merlons(fp, pw, ph, s.wall, s.merlon, 0.2, 0.1, 0.06);
  for (const sx of [-1, 1]) { p.cyl(0.05, 0.06, ph + 0.12, 8, sx * (pw / 2 + 0.02), 0.06, 2.55, s.wall); p.cone(0.06, 0.14, 8, sx * (pw / 2 + 0.02), ph + 0.18, 2.55, s.dome); }
  p.box(pw + 0.4, 0.04, 0.5, 0, 0, 2.66, s.base);
  // le revers du portail, sur la cour : un arc et sa porte
  const fq = new Face(p, Math.PI, 0, 2.21, 0.06);
  bay(fq, 0, 0, 0.5, ch + 0.25, s.arch, O.shade, { frame: s.trim, alfiz: s.tiles[0] });
  fq.plane(pw - 0.1, 0.06, 0, ph - 0.15, 0.004, s.tiles[2]);
  // la salle de prière
  p.box(4.66, hh, 2.0, 0, 0.06, -1.3, s.wall);
  const fh = new Face(p, 0, 0, -0.3, 0.06);
  for (const u of [-2.0, -1.45, -0.9, 0.9, 1.45, 2.0]) {
    bay(fh, u, 0.02, 0.38, hh * 0.68, s.arch, O.shade, { frame: s.trim, alfiz: s.tiles[0], seg: 6 });
    fh.shape(archPts(0.2, hh * 0.32, s.arch, 4), u, 0.06, 0.012, O.win, true);
  }
  // le grand arc au milieu de la façade de la salle, plus haut
  p.box(1.1, hh + 0.36, 0.2, 0, 0.06, -0.26, s.wall);
  const fm = new Face(p, 0, 0, -0.16, 0.06);
  panel(fm, 0, (hh + 0.36) / 2, 1.0, hh + 0.28, s.tiles, 0, 0.1);
  fm.shape(archPts(0.66, hh + 0.12, s.arch, 7), 0, 0, 0.01, s.trim);
  fm.shape(archPts(0.56, hh + 0.04, s.arch, 7), 0, 0, 0.014, O.shade);
  fm.shape(archPts(0.24, hh * 0.42, s.arch, 5), 0, 0.02, 0.018, O.win, true);
  merlons(fm, 1.1, hh + 0.36, s.wall, s.merlon, 0.2, 0.1, 0.06);
  for (const [f, len] of faces(p, 4.66, 2.0, 0, -1.3, 0.06)) {
    cornice(f, len, hh, s.trim, s.trim);
    if (f.ry !== 0) mosaic(f, 0, len - 0.1, hh - 0.08, 0.07, s.tiles);
    merlons(f, len, hh + 0.03, s.wall, s.merlon, 0.21);
    if (Math.abs(f.ry) === Math.PI / 2) for (const u of [-0.55, 0.55]) win(f, u, 0.24, 0.13, 0.3, s.arch, s.trim, { grille: O.darkwood, sill: s.trim });
  }
  // le mur du fond : contreforts, et la saillie du mihrab au milieu
  const fb = new Face(p, Math.PI, 0, -2.3, 0.06);
  for (const u of [-1.9, -1.1, 1.1, 1.9]) fb.box(0.12, hh - 0.08, 0.1, u, 0, 0.05, s.wall);
  p.cyl(0.32, 0.32, hh * 0.8, 8, 0, 0.06, -2.3, s.wall);
  dome(p, 0.32, 0.22, 0, 0.06 + hh * 0.8, -2.3, s.dome, 'half', 8, s.domeGlow);
  // la grande coupole et ses deux petites sœurs
  bigDome(p, age, s, 0, 0.06 + hh, -1.3, age === 2 ? 0.78 : 0.88);
  for (const sx of [-1, 1]) {
    const y = 0.06 + hh;
    p.cyl(0.36, 0.38, 0.16, 8, sx * 1.62, y, -1.3, s.wall, false, Math.PI / 8);
    for (const f of ring(p, 8, 0.35, sx * 1.62, -1.3, y)) f.shape(archPts(0.07, 0.1, s.arch, 4), 0, 0.03, 0.006, O.win, true);
    dome(p, 0.36, age === 2 ? 0.34 : 0.4, sx * 1.62, y + 0.16, -1.3, s.dome, age === 2 ? 'half' : s.domeKind, 12, s.domeGlow);
    finial(p, sx * 1.62, y + 0.16 + (age === 2 ? 0.34 : 0.4), -1.3, 0.6);
  }
  // les minarets
  const H = age === 2 ? 2.9 : age === 3 ? 3.4 : age === 4 ? 3.8 : 4.3;
  const mins = age === 2 ? [[-2.12, 2.12]] : age <= 4 ? [[-2.12, 2.12], [2.12, 2.12]] : [[-2.12, 2.12], [2.12, 2.12], [-2.12, -2.12], [2.12, -2.12]];
  for (const [x, z] of mins) minaret(p, age, s, x, z, H);
  if (s.neon) {
    // Futuriste : liserés turquoise le long des corniches
    for (const [f, len] of faces(p, 4.66, 2.0, 0, -1.3, 0.06)) f.plane(len, 0.018, 0, hh - 0.02, 0.035, s.neon, 'neon');
    for (const sx of [-1, 1]) new Face(p, 0, sx * 1.42, 2.45, 0.06).plane(1.75, 0.018, 0, ch - 0.02, 0.035, s.neon, 'neon');
  }
}

/** La mosquée de brique crue (Antiquité) : murs à contreforts terminés en pinacles, rondins en saillie, tours du mur de fond */
function mudMosque(p: Parts, s: Style) {
  p.box(4.9, 0.08, 4.9, 0, 0, 0, s.base);
  const ch = 0.5, t = 0.16, hh = 0.7;
  // la cour
  for (const sx of [-1, 1]) p.box(1.7, ch, t, sx * 1.45, 0.08, 2.35, s.wall);
  for (const sx of [-1, 1]) p.box(t, ch, 2.7, sx * 2.35, 0.08, 1.0, s.wall);
  const butt = (f: Face, len: number, h: number, step = 0.42) => {
    const k = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= k; i++) {
      const u = -len / 2 + (len / k) * i;
      frustum(p, 0.13, 0.1, 0.09, 0.07, h + 0.04, f.x(u, 0.04), f.oy, f.z(u, 0.04), s.wall, f.ry);
      p.cone(0.05, 0.16, 4, f.x(u, 0.04), f.oy + h + 0.04, f.z(u, 0.04), s.wall, false, f.ry + Math.PI / 4);
      p.sphere(0.022, f.x(u, 0.04), f.oy + h + 0.2, f.z(u, 0.04), O.terra);
    }
    vigas(f, len, h * 0.62, O.beam, 0.2, 0.06);
    vigas(f, len, h * 0.3, O.beam, 0.26, 0.05);
  };
  for (const sx of [-1, 1]) {
    const fr = new Face(p, 0, sx * 1.45, 2.43, 0.08);
    butt(fr, 1.7, ch);
    merlons(fr, 1.7, ch, s.wall, 'tooth', 0.2, 0.06, 0.06);
    const fs = new Face(p, (sx * Math.PI) / 2, sx * 2.43, 1.0, 0.08);
    butt(fs, 2.7, ch);
  }
  // la porte : une tour d'entrée effilée
  frustum(p, 1.0, 0.5, 0.82, 0.4, 1.05, 0, 0.08, 2.38, s.wall);
  const fg = new Face(p, 0, 0, 2.63, 0.08);
  fg.shape(archPts(0.36, 0.5, 'round', 6), 0, 0, 0.01, O.hole);
  fg.shape(archPts(0.44, 0.56, 'round', 6), 0, 0, 0.005, s.trim);
  for (let k = 0; k < 3; k++) vigas(fg, 0.7, 0.62 + k * 0.14, O.beam, 0.12, 0.06);
  for (const sx of [-1, 1]) { p.cone(0.07, 0.28, 4, sx * 0.36, 1.13, 2.38, s.wall, false, Math.PI / 4); p.sphere(0.03, sx * 0.36, 1.43, 2.38, O.terra); }
  p.cone(0.09, 0.32, 4, 0, 1.13, 2.38, s.wall, false, Math.PI / 4); p.sphere(0.035, 0, 1.47, 2.38, O.terra);
  // la cour : sol de sable battu, bassin, jarres, palmiers, nattes à l'ombre
  p.box(4.4, 0.01, 2.5, 0, 0.08, 1.0, 0xd9bf8c);
  p.cyl(0.4, 0.42, 0.1, 8, 0, 0.08, 1.0, s.trim); p.cyl(0.34, 0.34, 0.102, 8, 0, 0.08, 1.0, O.water);
  for (let i = 0; i < 5; i++) jar(p, -1.9 + i * 0.12, 1.9, 1.1, O.terra, 0.08);
  for (const [x, z] of [[1.5, 1.6], [-1.4, 0.6], [1.3, 0.3]]) palm(p, x, z, 0.85, x * 3 + z);
  p.box(0.6, 0.008, 0.4, -1.4, 0.08, 1.4, 0xb8873a); p.box(0.5, 0.008, 0.35, 0.8, 0.08, 1.95, 0xa0503a);
  // la salle de prière : un toit de terre sur rondins, des baies sombres, contreforts sur toutes les faces
  p.box(4.6, hh, 2.0, 0, 0.08, -1.3, s.wall);
  const fh = new Face(p, 0, 0, -0.3, 0.08);
  for (let i = 0; i < 7; i++) fh.shape(archPts(0.32, hh * 0.62, 'round', 5), -1.8 + i * 0.6, 0, 0.012, O.hole);
  for (const [f, len] of faces(p, 4.6, 2.0, 0, -1.3, 0.08)) { butt(f, len, hh, 0.5); merlons(f, len, hh, s.wall, 'tooth', 0.22, 0.06, 0.06); }
  // le mur de fond : trois tours effilées, la plus haute au milieu (le mihrab), hérissées de rondins
  for (const [x, H] of [[-1.5, 1.35], [0, 1.85], [1.5, 1.35]] as const) {
    frustum(p, 0.62, 0.5, 0.36, 0.3, H, x, 0.08, -2.35, s.wall);
    const f = new Face(p, Math.PI, x, -2.6, 0.08);
    for (let k = 0; k < 4; k++) vigas(f, 0.4, 0.4 + k * H * 0.2, O.beam, 0.12, 0.07);
    p.cone(0.1, 0.3, 4, x, 0.08 + H, -2.35, s.wall, false, Math.PI / 4);
    p.sphere(0.035, x, 0.08 + H + 0.32, -2.35, O.terra);
  }
  // le minaret, au coin de la cour
  minaret(p, 1, s, -2.1, 2.1, 2.1);
  // une petite coupole basse de terre sur la salle
  bigDome(p, 1, s, 0, 0.08 + hh, -1.3, 0.6);
}

// ---------- Le palais (au point haut, lot de 6 × 5) ----------

/** Tour d'angle ronde (ou carrée, en brique crue) */
function cornerTower(p: Parts, s: Style, x: number, z: number, h: number, r: number) {
  if (s.mud) {
    frustum(p, r * 2.1, r * 2.1, r * 1.7, r * 1.7, h, x, 0, z, s.wall);
    for (const [f, len] of faces(p, r * 1.7, r * 1.7, x, z, h)) merlons(f, len, 0, s.wall, 'tooth', 0.17, 0.08, 0.06);
    for (const [f] of faces(p, r * 1.9, r * 1.9, x, z)) { vigas(f, r * 1.4, h * 0.7, O.beam, 0.12, 0.06); f.shape(archPts(0.06, 0.1, 'round', 3), 0, h * 0.5, 0.004, O.hole); }
    return;
  }
  column(p, r * 1.08, r, h, 10, x, 0, z, s.wall);
  p.cyl(r * 1.1, r * 1.1, 0.12, 10, x, 0, z, s.base);
  for (let k = 0; k < 3; k++) p.add(new THREE.CylinderGeometry(r + 0.02 + k * 0.025, r + k * 0.025, 0.035, 10, 1, k < 2).translate(0, 0.0175, 0), x, h + k * 0.035, z, k === 1 ? s.tiles[0] : s.trim);
  const R = r + 0.07;
  for (const f of ring(p, 7, R - 0.02, x, z, h + 0.1)) merlons(f, 0.2, 0, s.wall, s.merlon, 0.2, 0.09, 0.05);
  for (const f of ring(p, 3, r * 0.98, x, z, 0, Math.PI / 6)) win(f, 0, h * 0.55, 0.08, 0.14, s.arch, s.trim, { glow: true });
  p.cyl(r * 0.62, r * 0.62, 0.2, 10, x, h + 0.1, z, s.wall);
  dome(p, r * 0.62, r * 0.7, x, h + 0.3, z, s.dome, s.domeKind === 'saucer' ? 'half' : s.domeKind, 8, s.domeGlow);
  finial(p, x, h + 0.3 + r * 0.7, z, 0.6);
}

/** Talar : portique à hautes colonnes de bois (ou de marbre) sous un toit plat à caissons, devant la façade */
function talar(p: Parts, s: Style, age: number, x: number, z: number, w: number, d: number, h: number) {
  const col = age <= 3 ? O.wood : age === 4 ? O.marble : O.white, k = Math.round(w / 0.5);
  for (let i = 0; i <= k; i++)
    for (const j of [0, 1]) {
      const cx = x - w / 2 + (w / k) * i, cz = z + d / 2 - j * (d - 0.1) - 0.05;
      column(p, 0.036, 0.03, h, 6, cx, 0.06, cz, col);
      p.cyl(0.06, 0.035, 0.06, 6, cx, 0.06 + h - 0.06, cz, s.tiles[1]);
      p.box(0.09, 0.05, 0.09, cx, 0.06, cz, s.trim);
    }
  p.box(w + 0.16, 0.08, d + 0.1, x, 0.06 + h, z, age <= 3 ? O.darkwood : s.wall);
  p.box(w + 0.2, 0.03, d + 0.14, x, 0.14 + h, z, s.trim);
  const f = new Face(p, 0, x, z + (d + 0.1) / 2, 0.06 + h);
  mosaic(f, 0, w + 0.16, 0.04, 0.07, s.tiles, 0.002);
  // le plafond à caissons, vu d'en dessous : quelques poutres
  for (let i = 1; i < k; i++) p.box(0.03, 0.03, d, x - w / 2 + (w / k) * i, 0.03 + h, z, age <= 3 ? O.beam : s.trim);
  p.box(w, 0.02, d, x, 0.06, z, age >= 4 ? O.marble : O.stone);
  if (s.neon) p.box(w + 0.2, 0.018, 0.02, x, 0.15 + h, z + d / 2 + 0.08, s.neon, 0, 'neon');
}

/** Le palais : enceinte à tours, porte d'honneur, jardin en croix (canaux, bassin, parterres, cyprès et palmiers), palais à iwan */
function oPalace(p: Parts, age: number) {
  const s = style(age);
  const W = 5.8, D = 4.8, eh = s.mud ? 0.55 : 0.62, t = 0.14;
  p.box(W + 0.1, 0.06, D + 0.1, 0, 0, 0, s.base);
  // l'enceinte : avant coupé par la porte, côtés, arrière
  for (const sx of [-1, 1]) p.box((W - 1.3) / 2, eh, t, sx * (W + 1.3) / 4, 0, D / 2 - t / 2, s.wall);
  p.box(W, eh, t, 0, 0, -D / 2 + t / 2, s.wall);
  for (const sx of [-1, 1]) p.box(t, eh, D - 2 * t, sx * (W / 2 - t / 2), 0, 0, s.wall);
  for (const sx of [-1, 1]) {
    const f = new Face(p, 0, sx * (W + 1.3) / 4, D / 2, 0);
    merlons(f, (W - 1.3) / 2, eh, s.wall, s.merlon, 0.22, 0.1, 0.06);
    f.plane((W - 1.3) / 2, 0.1, 0, 0.05, 0.002, s.base);
    if (s.mud) vigas(f, (W - 1.3) / 2, eh * 0.7, O.beam, 0.24, 0.06);
    else { cornice(f, (W - 1.3) / 2, eh - 0.04, s.trim); mosaic(f, 0, (W - 1.3) / 2 - 0.2, eh - 0.13, 0.07, s.tiles); }
    const fs = new Face(p, (sx * Math.PI) / 2, sx * W / 2, 0, 0);
    merlons(fs, D, eh, s.wall, s.merlon, 0.22, 0.1, 0.06);
    if (s.mud) vigas(fs, D, eh * 0.7, O.beam, 0.24, 0.06);
    else cornice(fs, D, eh - 0.04, s.trim);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cornerTower(p, s, sx * (W / 2 - 0.22), sz * (D / 2 - 0.22), eh + 0.5, 0.32);
  // la porte d'honneur : un pavillon haut à grand arc, encadré de mosaïque, deux tourelles
  const gh = eh + 0.75;
  p.box(1.3, gh, 0.42, 0, 0, D / 2 - 0.1, s.wall);
  const fg = new Face(p, 0, 0, D / 2 + 0.11, 0);
  if (!s.mud) panel(fg, 0, gh * 0.5, 1.2, gh - 0.14, s.tiles, 0, 0.11);
  fg.shape(archPts(0.66, gh * 0.72, s.arch, 7), 0, 0, 0.01, s.trim);
  fg.shape(archPts(0.54, gh * 0.66, s.arch, 7), 0, 0, 0.014, O.hole);
  door(fg, 0, 0.36, gh * 0.48, s.arch, s.trim, O.darkwood, { n: 0.016 });
  merlons(fg, 1.3, gh, s.wall, s.merlon, 0.2, 0.1, 0.06);
  if (s.mud) for (let k = 0; k < 2; k++) vigas(fg, 1.2, gh * 0.6 + k * 0.18, O.beam, 0.14, 0.06);
  for (const sx of [-1, 1]) {
    p.cyl(0.09, 0.1, gh + 0.2, 8, sx * 0.7, 0, D / 2 + 0.06, s.wall);
    if (s.mud) p.cone(0.1, 0.22, 4, sx * 0.7, gh + 0.2, D / 2 + 0.06, s.wall, false, Math.PI / 4);
    else { dome(p, 0.1, 0.16, sx * 0.7, gh + 0.2, D / 2 + 0.06, s.dome, 'onion', 8, s.domeGlow); p.sphere(0.02, sx * 0.7, gh + 0.38, D / 2 + 0.06, O.gold); }
    // gardes de la porte : deux lanternes (ou deux braseros)
    p.cyl(0.03, 0.03, 0.4, 4, sx * 0.85, 0, D / 2 + 0.2, s.mud ? O.wood : O.darkwood);
    p.box(0.07, 0.09, 0.07, sx * 0.85, 0.4, D / 2 + 0.2, O.win, 0, true);
  }
  p.box(1.6, 0.03, 0.4, 0, 0, D / 2 + 0.2, s.base);
  // le jardin en croix : allées, canaux, bassin central, quatre parterres, cyprès et palmiers, jets d'eau
  const gz = 0.95;
  p.box(W - 0.4, 0.03, 2.4, 0, 0.06, gz, s.mud ? 0xc9b27e : 0xdccca6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bed(p, 2.0, 0.85, sx * 1.3, gz + sz * 0.62, 40 + sx * 3 + sz, s.trim, 0.06);
  p.box(0.22, 0.04, 2.3, 0, 0.06, gz, s.trim); p.box(0.14, 0.042, 2.3, 0, 0.06, gz, O.water);
  p.box(4.9, 0.04, 0.22, 0, 0.06, gz, s.trim); p.box(4.9, 0.042, 0.14, 0, 0.06, gz, O.water);
  p.cyl(0.42, 0.44, 0.1, 8, 0, 0.06, gz, s.trim); p.cyl(0.36, 0.36, 0.102, 8, 0, 0.06, gz, O.water);
  if (!s.mud) {
    for (const zz of [gz - 0.9, gz + 0.9]) { p.cyl(0.015, 0.015, 0.14, 4, 0, 0.1, zz, O.water); p.sphere(0.03, 0, 0.24, zz, 0xbfe6ee); }
    p.cyl(0.05, 0.07, 0.25, 8, 0, 0.16, gz, s.trim); p.cyl(0.14, 0.06, 0.05, 8, 0, 0.41, gz, s.trim);
  }
  for (const sx of [-1, 1]) for (const zz of [gz - 1.2, gz + 0.95]) palm(p, sx * 2.45, zz, s.mud ? 0.8 : 1.0, sx * 7 + zz);
  if (!s.mud) for (const sx of [-1, 1]) for (const zz of [gz - 0.25, gz + 0.25]) cypress(p, sx * 0.32, zz + Math.sign(zz - gz) * 0.6, 0.7);
  // le palais : un corps à deux étages (trois au Moderne et au Futuriste), galeries d'arcs, grand iwan au milieu
  const fl = age >= 4 ? 3 : 2, fh = s.mud ? 0.42 : 0.46, h = fl * fh, bz = -1.45, bd = 1.5;
  p.box(4.9, h, bd, 0, 0.06, bz, s.wall);
  const fr = new Face(p, 0, 0, bz + bd / 2, 0.06);
  for (let f = 0; f < fl; f++) {
    for (let i = 0; i < 9; i++) {
      const u = -2.2 + i * 0.55;
      if (Math.abs(i - 4) <= 1) continue;
      if (s.mud) fr.shape(archPts(0.22, fh * 0.6, 'round', 4), u, f * fh + 0.08, 0.004, O.hole);
      else if (f === 0) { bay(fr, u, 0.02, 0.34, fh * 0.78, s.arch, O.shade, { frame: s.trim, alfiz: s.tiles[0] }); fr.shape(archPts(0.16, fh * 0.4, s.arch, 4), u, 0.06, 0.012, O.win, true); }
      else if (age === 3 && f === 1 && i % 2 === 1) mashrabiya(fr, u, f * fh + 0.08, 0.3, fh * 0.62);
      else win(fr, u, f * fh + 0.1, 0.16, fh * 0.55, s.arch, s.trim, { glow: true, grille: s.tiles[0], sill: s.trim });
    }
    if (f > 0) { fr.box(4.9, 0.035, 0.05, 0, f * fh, 0.02, s.trim); if (!s.mud) mosaic(fr, 0, 4.88, f * fh - 0.05, 0.06, s.tiles); }
  }
  if (s.mud) for (let f = 0; f < fl; f++) vigas(fr, 4.8, (f + 1) * fh - 0.06, O.beam, 0.2, 0.06);
  for (const [f, len] of faces(p, 4.9, bd, 0, bz, 0.06)) {
    if (s.mud) merlons(f, len, h, s.wall, 'tooth', 0.22, 0.07, 0.06);
    else { cornice(f, len, h - 0.03, s.trim, s.trim); merlons(f, len, h, s.wall, s.merlon, 0.22, 0.09, 0.05); }
    if (Math.abs(f.ry) === Math.PI / 2) for (let fl2 = 0; fl2 < fl; fl2++) win(f, 0, fl2 * fh + 0.12, 0.14, fh * 0.5, s.arch, s.trim, { glow: true, sill: s.trim });
  }
  // l'iwan : haute voûte ouverte au milieu de la façade, dans un cadre de mosaïque plus haut que le toit
  const ih = h + 0.5;
  p.box(1.5, ih, 0.32, 0, 0.06, bz + bd / 2 + 0.1, s.wall);
  const fi = new Face(p, 0, 0, bz + bd / 2 + 0.26, 0.06);
  if (!s.mud) { panel(fi, 0, ih / 2, 1.42, ih - 0.08, s.tiles, 0, 0.11); fi.plane(1.42, 0.08, 0, ih - 0.12, 0.008, s.tiles[2]); }
  fi.shape(archPts(1.0, h + 0.1, s.arch, 8), 0, 0, 0.012, s.mud ? s.trim : age >= 4 ? O.gold : s.trim);
  fi.shape(archPts(0.86, h, s.arch, 8), 0, 0, 0.016, O.shade);
  // le fond de l'iwan : alvéoles en gradins, une porte et une fenêtre allumée
  if (!s.mud) for (let k = 0; k < 3; k++) for (let i = -3 + k; i <= 3 - k; i++) fi.box(0.1, 0.07, 0.03, i * 0.11, h * 0.62 + k * 0.08, 0.018, k % 2 ? s.tiles[1] : s.wall);
  door(fi, 0, 0.3, h * 0.42, s.arch, s.trim, O.darkwood, { n: 0.018 });
  fi.shape(archPts(0.22, 0.2, s.arch, 4), 0, h * 0.46, 0.02, O.win, true);
  merlons(fi, 1.5, ih, s.wall, s.merlon, 0.2, 0.1, 0.06);
  for (const sx of [-1, 1]) { p.cyl(0.06, 0.07, ih + 0.16, 8, sx * 0.76, 0.06, bz + bd / 2 + 0.26, s.wall); if (!s.mud) p.cone(0.075, 0.18, 8, sx * 0.76, ih + 0.22, bz + bd / 2 + 0.26, s.dome); }
  // le portique à colonnes devant les ailes (Médiéval à Moderne)
  if (!s.mud && age <= 4) for (const sx of [-1, 1]) talar(p, s, age, sx * 1.62, bz + bd / 2 + 0.27, 1.35, 0.45, fh * 1.25);
  // la coupole, les pavillons du toit (kiosques à colonnettes), la terrasse
  const y = 0.06 + h;
  bigDome(p, age, s, 0, y, bz - 0.1, s.mud ? 0.5 : 0.62);
  for (const sx of [-1, 1]) {
    const kx = sx * 1.75, kz = bz - 0.15;
    for (const c of [-0.18, 0.18]) for (const d of [-0.18, 0.18]) p.cyl(0.022, 0.022, 0.34, 5, kx + c, y, kz + d, s.mud ? O.wood : s.trim);
    p.box(0.52, 0.05, 0.52, kx, y + 0.34, kz, s.mud ? O.darkwood : s.trim);
    if (s.mud) { p.box(0.56, 0.03, 0.56, kx, y + 0.39, kz, O.straw); continue; }
    dome(p, 0.24, 0.24, kx, y + 0.39, kz, s.dome, s.domeKind, 8, s.domeGlow);
    finial(p, kx, y + 0.63, kz, 0.5);
    // tapis et coussins sous le kiosque
    p.box(0.34, 0.01, 0.34, kx, y, kz, O.red);
  }
  // Moderne : drapeaux et colonnade de façade ; Futuriste : deux tours de verre à l'arrière, liserés
  if (age === 4) for (const sx of [-1, 1]) { p.cyl(0.012, 0.012, 0.7, 4, sx * 2.2, y, bz - 0.5, O.steel); p.box(0.24, 0.14, 0.008, sx * 2.2 + 0.12, y + 0.52, bz - 0.5, sx < 0 ? O.turq : O.red); }
  if (age === 5) {
    for (const sx of [-1, 1]) {
      const tx = sx * 1.9, tz = -2.0, th = 2.3;
      p.cyl(0.32, 0.36, th, 12, tx, 0.06, tz, O.white);
      for (let k = 0; k < 6; k++) p.cyl(0.335, 0.335, 0.1, 12, tx, 0.3 + k * 0.32, tz, O.glass, true);
      p.cyl(0.34, 0.34, 0.02, 12, tx, 0.06 + th - 0.12, tz, O.turqL, 'neon');
      dome(p, 0.3, 0.32, tx, 0.06 + th, tz, O.glass, 'persian', 12, true);
      finial(p, tx, 0.06 + th + 0.32, tz, 0.6);
    }
    fr.plane(4.9, 0.018, 0, h - 0.02, 0.04, O.turqL, 'neon');
  }
}

// ---------- Les maisons (lots de 0,9 à 1,35 case) ----------

const DOORS = [O.turq, O.blue, 0x2f8f5a, O.red, O.wood, O.cobalt, O.turqD, 0x8a4f3a];
const houseWall = (age: number, v: number) =>
  age <= 1 ? pick([O.mud, 0xd2ae7e, 0xbf9868, 0xc8a070], v) : age <= 3 ? pick([O.white, 0xebd3a4, O.white, 0xe3bf8c, 0xf6efe4, 0xd9ad84, O.cream], v) : age === 4 ? pick([O.concrete, O.white, 0xf1e7d4, 0xe6d2a8, 0xdcc097], v) : pick([O.white, O.marble, 0xeef2f2], v);

/** Garde-corps plein d'un toit en terrasse (rectangle w × d posé en y), sans ses faces cachées */
function parapet(p: Parts, w: number, d: number, y: number, col: number, h = 0.06, t = 0.035, x = 0, z = 0) {
  for (const [f, len] of faces(p, w, d, x, z, y)) f.add(openBox(len - (Math.abs(f.ry) === Math.PI / 2 ? 2 * t : 0), h, t), 0, 0, -t / 2, col);
}

/** Lanterne de façade allumée la nuit */
function wallLamp(f: Face, u: number, y: number, col = O.darkwood) {
  f.box(0.012, 0.012, 0.05, u, y + 0.06, 0.025, col);
  f.box(0.04, 0.06, 0.04, u, y, 0.06, O.win, true);
  f.add(new THREE.ConeGeometry(0.035, 0.03, 4).rotateY(Math.PI / 4), u, y + 0.06, 0.06, col);
}

/** Tour à vent (badgir) : tour carrée à fentes sous un chapeau plat */
function windTower(p: Parts, x: number, z: number, y: number, h: number, wall: number, trim: number) {
  p.box(0.18, h, 0.18, x, y, z, wall);
  for (const [f] of faces(p, 0.18, 0.18, x, z, y)) for (const u of [-0.045, 0, 0.045]) f.plane(0.025, h * 0.45, u, h * 0.68, 0.002, O.hole);
  p.box(0.22, 0.025, 0.22, x, y + h, z, trim);
  p.box(0.12, 0.03, 0.12, x, y + h + 0.025, z, wall);
}

function oHouse(p: Parts, age: number, v: number, w: number, d: number) {
  const s = style(age), r = mulberry32(v * 7 + 11), W = w * 0.9, D = d * 0.9, wall = houseWall(age, v), leaf = pick(DOORS, v + age);
  const sd = v % 2 ? 1 : -1;
  if (age <= 1) { mudHouse(p, s, r, v, W, D, wall); return; }
  if (age <= 3) {
    const floors = age === 2 ? 1 + (r() < 0.5 ? 1 : 0) : 2 + (r() < 0.4 ? 1 : 0), fh = 0.3, h = floors * fh;
    // une maison sur trois, quand le lot est assez grand, s'ouvre sur un patio planté (bien lisible vu d'en haut)
    const patio = v % 3 === 0 && W >= 0.95 && D >= 0.85, cw = W * 0.46, cd = D * 0.42;
    if (patio) {
      const dz = (D - cd) / 2, dx = (W - cw) / 2;
      p.box(W, h, dz, 0, 0, D / 2 - dz / 2, wall); p.box(W, h, dz, 0, 0, -D / 2 + dz / 2, wall);
      for (const sx of [-1, 1]) p.box(dx, h, cd, sx * (W / 2 - dx / 2), 0, 0, wall);
      courtyard(p, s, v, cw, cd, h);
    } else p.box(W, h, D, 0, 0, 0, wall);
    const fs = faces(p, W, D), f = fs[0][0];
    // l'acrotère : un bandeau de couleur en haut des murs, et le tapis ou la natte qui sèche sur la terrasse
    const cap = pick([s.tiles[0], O.turq, O.blue, O.ochre, s.tiles[0], O.red], v >> 1);
    for (const [ff, len] of fs) ff.plane(len + 0.004, 0.05, 0, h - 0.055, 0.003, cap);
    if (!patio && v % 5 !== 2) p.box(W * 0.3, 0.008, D * 0.24, sd * W * 0.2, h, D * 0.18, pick([O.red, 0xc98a3a, 0x8a4f7a, O.rose, 0xd9a43c], v + 2));
    // soubassement de pierre, porte en arc (encadrement de faïence une fois sur deux), lanterne, banquette et pot de fleurs
    for (const [ff, len] of fs) ff.plane(len, 0.06, 0, 0.03, 0.002, s.base);
    const du = sd * W * 0.22;
    if (v % 2 === 0) f.plane(0.22, 0.27, du, 0.135, 0.002, s.tiles[0]);
    door(f, du, 0.14, 0.22, s.arch, s.trim, leaf, { step: s.base });
    wallLamp(f, du + sd * 0.12, 0.2);
    f.box(W * 0.3, 0.05, 0.06, -du * 0.9, 0, 0.03, s.base);
    p.cyl(0.035, 0.025, 0.06, 6, -sd * W * 0.42, 0, D / 2 + 0.04, O.terra);
    p.add(new THREE.IcosahedronGeometry(0.05, 0), -sd * W * 0.42, 0.09, D / 2 + 0.04, O.greenD);
    win(f, -du, 0.12, 0.07, 0.11, s.arch, s.trim, { grille: O.darkwood });
    // les étages : fenêtres grillagées sur la rue, moucharabieh à l'Industriel, bandeau de faïence entre les étages
    for (let k = 1; k < floors; k++) {
      const y = k * fh;
      if (age === 3) mosaic(f, 0, W, y - 0.02, 0.04, s.tiles);
      else f.box(W + 0.01, 0.02, 0.02, 0, y - 0.02, 0.01, s.trim);
      if (age === 3 && k === 1 && v % 3 !== 2) { mashrabiya(f, -W * 0.08, y + 0.04, W * 0.5, fh * 0.62); win(f, W * 0.34, y + 0.08, 0.07, 0.13, s.arch, s.trim, { glow: true }); }
      else for (const u of [-W * 0.24, W * 0.24]) {
        win(f, u, y + 0.08, 0.08, 0.13, s.arch, s.trim, { grille: age === 2 ? O.darkwood : undefined, sill: s.trim });
        if (age === 3) for (const sx of [-1, 1]) f.plane(0.045, 0.14, u + sx * 0.07, y + 0.15, 0.006, leaf);
      }
    }
    // les côtés et l'arrière : une fenêtre par étage
    for (const [ff, len] of fs.slice(1)) for (let k = 0; k < floors; k++) if (k > 0 || ff.ry !== Math.PI) win(ff, (k % 2 ? 0.15 : -0.15) * len, k * fh + 0.1, 0.07, 0.11, s.arch, s.trim);
    // le toit en terrasse : corniche et merlons à gradins sur la rue, garde-corps ailleurs, gouttières de bois
    cornice(f, W, h - 0.03, s.trim);
    merlons(f, W, h, wall, 'step', 0.28, 0.09, 0.04);
    for (const [ff, len] of fs.slice(1)) ff.add(openBox(len - (Math.abs(ff.ry) === Math.PI / 2 ? 0.08 : 0), 0.05, 0.04), 0, h, -0.02, wall);
    for (const u of [-W * 0.35, W * 0.35]) f.add(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 3, 1, true).rotateX(Math.PI / 2), u, h - 0.04, 0.035, O.beam);
    const kind = patio ? -1 : v % 5;
    if (kind === 0 || kind === 3 || patio) {
      // coupole sur un tambour, turquoise (ou blanche une fois sur trois), au-dessus de la pièce principale
      const R = Math.min(W, D) * (patio ? 0.17 : 0.26), dx = patio ? sd * (W / 2 - (W - cw) / 4) : -sd * W * 0.15, dz = patio ? -D / 2 + (D - cd) / 4 : -D * 0.12;
      const dc = v % 3 === 1 ? O.white : age === 2 ? O.turq : s.dome;
      p.cyl(R * 1.05, R * 1.12, 0.08, 8, dx, h, dz, wall);
      p.cyl(R * 1.07, R * 1.07, 0.02, 8, dx, h + 0.07, dz, cap);
      dome(p, R, R * 1.05, dx, h + 0.08, dz, dc, 'half', 10, false, dark(dc, 0.9));
      p.add(new THREE.OctahedronGeometry(0.022), dx, h + 0.09 + R * 1.05, dz, O.gold);
    }
    if (kind === 1) windTower(p, sd * W * 0.28, -D * 0.25, h, 0.32, wall, s.trim);
    else if (kind === 2) {
      // tonnelle de bois, vigne (Industriel) ou toile tendue (Médiéval)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.012, 0.012, 0.18, 4, sx * W * 0.3, h, sz * D * 0.25, O.wood);
      if (age === 3) { for (let i = 0; i < 4; i++) p.box(0.02, 0.02, D * 0.56, -W * 0.3 + i * W * 0.2, h + 0.18, 0, O.wood); p.add(new THREE.IcosahedronGeometry(0.12, 0).scale(1.6, 0.4, 1.2), sx0(v) * W * 0.12, h + 0.21, 0, O.greenD); }
      else frustum(p, W * 0.66, D * 0.56, W * 0.6, 0.02, 0.05, 0, h + 0.18, 0, pick(AWNING, v));
      p.box(0.12, 0.012, 0.18, 0, h, 0.05, O.red);
    } else if (kind === 3) {
      // chambre haute sur le toit, sa porte et ses jarres
      const uw = W * 0.4, ud = D * 0.4, ux = sd * W * 0.25, uz = D * 0.08;
      p.box(uw, 0.25, ud, ux, h, uz, wall);
      parapet(p, uw, ud, h + 0.25, wall, 0.04, 0.03, ux, uz);
      const fu = new Face(p, 0, ux, uz + ud / 2, h);
      door(fu, 0, 0.09, 0.16, s.arch, s.trim, leaf);
      for (let i = 0; i < 3; i++) jar(p, -sd * W * 0.2 + i * 0.07, D * 0.25, 0.9, O.terra, h);
    } else if (kind === 4) {
      // jarres d'eau et linge qui sèche
      for (const sx of [-1, 1]) p.cyl(0.01, 0.01, 0.18, 3, sx * W * 0.32, h, 0.05, O.wood);
      p.box(W * 0.64, 0.005, 0.005, 0, h + 0.17, 0.05, O.darkwood);
      for (let i = 0; i < 3; i++) new Face(p, 0, -W * 0.18 + i * W * 0.18, 0.05, h + 0.09).plane(0.09, 0.08, 0, 0.04, 0, pick([...AWNING, O.white], v + i), false);
      for (let i = 0; i < 2; i++) jar(p, sd * W * 0.3, -D * 0.25 + i * 0.12, 1.1, O.terra, h);
    }
    return;
  }
  if (age === 4) { modernHouse(p, s, r, v, W, D, wall, leaf); return; }
  futureHouse(p, r, v, W, D);
}
const sx0 = (v: number) => (v % 3) - 1;

/** Le patio d'une maison (cw × cd au centre, murs de hauteur h) : dallage, galerie d'arcs, bassin, oranger ou palmier, pots */
function courtyard(p: Parts, s: Style, v: number, cw: number, cd: number, h: number) {
  p.box(cw, 0.035, cd, 0, 0, 0, pick([0xd9c9a2, 0xc9d6cc, 0xe6d3a8], v));
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) p.box(cw / 2 - 0.01, 0.037, cd / 2 - 0.01, (i - 0.5) * cw / 2, 0, (j - 0.5) * cd / 2, s.tiles[0]);
  // sur les murs du patio, une arcade peinte au rez-de-chaussée
  for (const [f, len] of faces(p, cw, cd)) {
    const g = new Face(p, f.ry + Math.PI, f.ox, f.oz);
    bay(g, 0, 0, Math.min(0.2, len * 0.5), 0.2, s.arch, O.shade, { frame: s.trim, seg: 4 });
    g.plane(len, 0.035, 0, h - 0.07, 0.003, s.tiles[0]);
  }
  p.cyl(0.08, 0.085, 0.05, 8, cw * 0.18, 0.01, -cd * 0.15, s.trim);
  p.cyl(0.065, 0.065, 0.052, 8, cw * 0.18, 0.01, -cd * 0.15, O.water);
  if (v % 2) palm(p, -cw * 0.15, cd * 0.12, Math.min(0.75, h + 0.3), v, 0x8a6a48, 0x5f9442, false);
  else orangeTree(p, -cw * 0.15, cd * 0.12, Math.min(0.55, h + 0.15), 0.01);
  p.cyl(0.03, 0.022, 0.05, 6, cw * 0.3, 0.01, cd * 0.3, O.terra);
  p.add(new THREE.IcosahedronGeometry(0.04, 0), cw * 0.3, 0.08, cd * 0.3, O.green);
}

/** Maison de brique crue (Antiquité) : cube à rondins, porte à linteau de bois, toit en terrasse, coupoles en ruche ou chambre haute */
function mudHouse(p: Parts, s: Style, r: () => number, v: number, W: number, D: number, wall: number) {
  const h = 0.3 + r() * 0.1, kind = v % 4, sd = v % 2 ? 1 : -1;
  const fs = faces(p, W, D), f = fs[0][0], paint = pick([O.white, 0xe8d8b0, O.ochre, O.red, O.turqD], v >> 2);
  if (kind === 2) {
    // maison à coupoles en ruche : deux pièces carrées sous des cônes de terre
    for (const sx of [-1, 1]) {
      const x = sx * W * 0.24, ww = W * 0.48;
      p.box(ww, h * 0.8, D, x, 0, 0, wall);
      p.add(new THREE.LatheGeometry([[0.5, 0], [0.46, 0.3], [0.32, 0.65], [0.12, 0.92], [0, 1]].map(([u, y]) => new THREE.Vector2(u * Math.min(ww, D) * 0.98, y * 0.42)), 7), x, h * 0.8, 0, wall);
      p.cyl(0.025, 0.025, 0.03, 5, x, h * 0.8 + 0.42, 0, s.trim);
    }
    door(f, -W * 0.24, 0.12, 0.18, 'round', paint, O.wood, { step: s.trim });
    mashrabiya(f, W * 0.24, 0.1, 0.13, 0.11, O.wood);
    frieze(f, W * 0.9, h * 0.8 - 0.06, paint, 0.08);
  } else {
    p.box(W, h, D, 0, 0, 0, wall);
    vigas(f, W, h - 0.06, O.beam, 0.17, 0.05);
    vigas(fs[1][0], D, h - 0.06, O.beam, 0.2, 0.05);
    parapet(p, W, D, h, wall, 0.05, 0.04);
    // le pied enduit d'une boue plus sombre, les pinacles de terre aux coins de la terrasse
    for (const [ff, len] of fs) ff.plane(len, 0.05, 0, 0.025, 0.002, O.mudD);
    pinnacles(p, W, D, h + 0.05, wall);
    // la porte en plein cintre : encadrement peint, vantail de planches clouté, marche ; la frise peinte au-dessus
    const du = sd * W * 0.2;
    door(f, du, 0.14, 0.22, 'round', paint, O.wood, { step: s.trim });
    for (let k = 0; k < 3; k++) for (const s2 of [-1, 1]) f.box(0.012, 0.012, 0.008, du + s2 * 0.035, 0.05 + k * 0.06, 0.012, 0x3a3a3e);
    frieze(f, W * 0.86, h - 0.14, paint, 0.075);
    // la fenêtre sur la rue : un claustra de bois en saillie (le moucharabieh de l'Antiquité), la banquette de terre dessous
    mashrabiya(f, -du, 0.14, 0.15, 0.12, O.wood);
    f.box(W * 0.35, 0.045, 0.07, -du, 0, 0.035, s.trim);
    fs[1][0].plane(0.05, 0.05, 0, h * 0.6, 0.004, O.hole);
    fs[3][0].plane(0.05, 0.05, 0, h * 0.6, 0.004, O.hole);
    // les gargouilles de bois qui rejettent l'eau des pluies loin des murs
    for (const ff of [fs[1][0], fs[3][0]]) ff.add(new THREE.BoxGeometry(0.03, 0.025, 0.11).rotateX(-0.15), D * 0.2, h - 0.02, 0.05, O.beam);
    if (kind === 0) {
      // chambre haute et son échelle
      const ux = -sd * W * 0.2, uw = W * 0.45, ud = D * 0.5;
      p.box(uw, 0.22, ud, ux, h, -D * 0.18, wall);
      const fu = new Face(p, 0, ux, -D * 0.18 + ud / 2, h);
      vigas(fu, uw, 0.17, O.beam, 0.15, 0.04);
      fu.plane(0.07, 0.12, 0, 0.06, 0.004, O.hole);
      parapet(p, uw, ud, h + 0.22, wall, 0.035, 0.03, ux, -D * 0.18);
      for (const sx of [-1, 1]) p.add(new THREE.BoxGeometry(0.012, 0.36, 0.012).translate(0, 0.18, 0), W / 2 + 0.03, 0, sx * 0.04 + D * 0.15, O.wood, 0, false, 0.12);
      for (let i = 0; i < 4; i++) p.box(0.012, 0.012, 0.09, W / 2 + 0.03 - i * 0.01, 0.06 + i * 0.08, D * 0.15, O.wood);
    } else if (kind === 1) {
      // auvent de palmes sur quatre perches, natte et galettes de bouse qui sèchent
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.012, 0.012, 0.17, 3, sx * W * 0.28, h, sz * D * 0.22, O.wood);
      frustum(p, W * 0.66, D * 0.54, W * 0.6, D * 0.48, 0.03, 0, h + 0.17, 0, O.straw);
      p.box(W * 0.4, 0.008, D * 0.3, 0, h, 0, pick(AWNING, v));
    } else {
      // une petite coupole de terre sur la pièce du fond ; jarres, sacs de grain et dattes au soleil sur le toit
      p.cyl(0.15, 0.16, 0.05, 8, -sd * W * 0.22, h, -D * 0.2, wall);
      dome(p, 0.15, 0.13, -sd * W * 0.22, h + 0.05, -D * 0.2, O.mudL, 'saucer', 8);
      p.cyl(0.02, 0.025, 0.04, 4, -sd * W * 0.22, h + 0.18, -D * 0.2, O.mudD);
      for (let i = 0; i < 3; i++) jar(p, sd * W * 0.12 + i * 0.09 * sd, -D * 0.25, 1, O.terra, h);
      p.box(W * 0.35, 0.012, D * 0.3, sd * W * 0.14, h, D * 0.12, 0xa0502a);
      p.add(new THREE.IcosahedronGeometry(0.05, 0).scale(1, 0.8, 1), -sd * W * 0.22, h + 0.04, D * 0.22, O.straw);
    }
  }
  // jarre d'eau près de la porte, et un palmier-dattier à l'angle de derrière (trois maisons sur quatre)
  jar(p, -sd * W * 0.42, D / 2 + 0.05, 1.2);
  if (v % 4 !== 1) palm(p, sd * (W / 2 + 0.05), -D / 2 + 0.06, 0.56 + (v % 3) * 0.05, v);
}

/** Immeuble blanc (Moderne) : boutique ou arcades au rez-de-chaussée, balcons, claustra, citernes, climatiseurs, paraboles */
function modernHouse(p: Parts, s: Style, r: () => number, v: number, W: number, D: number, wall: number, leaf: number) {
  const floors = 3 + Math.floor(r() * 3), fh = 0.26, h = floors * fh, sd = v % 2 ? 1 : -1;
  p.box(W, h, D, 0, 0, 0, wall);
  bandsAround(p, W, D, fh, floors - 1, fh, O.win, wall, 0.22, 0.12);
  const f = new Face(p, 0, 0, D / 2);
  // le rez-de-chaussée : boutique à rideau et auvent, ou arcade, ou porte d'entrée à marquise
  const g = v % 3;
  if (g === 0) {
    f.plane(W * 0.62, 0.17, -sd * W * 0.12, 0.1, 0.004, O.win, true);
    for (let i = 0; i < 3; i++) f.plane(0.012, 0.17, -sd * W * 0.12 - W * 0.2 + i * W * 0.2, 0.1, 0.008, O.steel);
    f.add(new THREE.BoxGeometry(W * 0.66, 0.012, 0.16).rotateX(0.3), -sd * W * 0.12, 0.21, 0.07, pick(AWNING, v));
    f.plane(W * 0.4, 0.04, -sd * W * 0.12, 0.235, 0.006, O.white, 'neon');
  } else if (g === 1) for (const u of [-W * 0.3, 0, W * 0.3]) bay(f, u, 0, W * 0.24, 0.2, 'pointed', O.shade, { frame: s.trim, seg: 4 });
  else f.plane(W * 0.5, 0.17, 0, 0.1, 0.004, O.win, true);
  door(f, sd * W * 0.36, 0.1, 0.18, 'flat', s.trim, leaf);
  f.box(0.22, 0.015, 0.1, sd * W * 0.36, 0.2, 0.05, s.trim);
  // balcons de béton (une travée sur deux, alternée) et leur garde-corps
  for (let k = 1; k < floors; k++) {
    const u = (k + v) % 2 ? -W * 0.22 : W * 0.22;
    f.box(W * 0.4, 0.02, 0.09, u, k * fh, 0.045, wall);
    f.plane(W * 0.4, 0.06, u, k * fh + 0.05, 0.09, v % 4 === 3 ? O.turq : O.steel);
  }
  // claustra de béton à motif de losanges sur la moitié de la façade
  if (v % 4 === 1) panel(f, W * 0.25, fh + (h - fh) / 2, W * 0.42, h - fh - 0.04, [wall, dark(wall, 0.7), dark(wall, 0.8)], 0.012, 0.08);
  else if (v % 4 === 2) for (const sx of [-1, 1]) f.plane(0.05, h, sx * W * 0.47, h / 2, 0.006, s.tiles[0]);
  // le toit : garde-corps, citernes, climatiseurs, parabole ou chauffe-eau solaire
  parapet(p, W, D, h, wall, 0.05, 0.03);
  p.cyl(0.07, 0.07, 0.13, 8, W * 0.22, h, -D * 0.2, 0xdedede);
  p.cyl(0.072, 0.072, 0.012, 8, W * 0.22, h + 0.13, -D * 0.2, 0x3a8ad0);
  p.box(0.1, 0.06, 0.07, -W * 0.25, h, D * 0.15, 0xc4c4c4);
  p.box(0.1, 0.06, 0.07, -W * 0.05, h, D * 0.2, 0xc4c4c4);
  if (v % 3 === 0) p.add(new THREE.CylinderGeometry(0.07, 0.01, 0.03, 8).rotateX(-0.9), -W * 0.2, h + 0.1, -D * 0.25, 0xf0f0f0);
  else if (v % 3 === 1) { p.add(new THREE.BoxGeometry(0.22, 0.012, 0.16).rotateX(-0.5), 0, h + 0.08, -D * 0.22, 0x2a4a7a); p.cyl(0.03, 0.03, 0.2, 6, 0, h + 0.13, -D * 0.32, O.white, false, Math.PI / 2); }
  // enseigne lumineuse au-dessus de la boutique
  if (g === 0 && v % 2) f.plane(0.18, 0.06, sd * W * 0.36, 0.28, 0.01, pick([O.turqL, 0xff6a4a, 0xffd04a], v), 'neon');
}

/** Maison futuriste : tour ronde à bandeaux de verre et jardin suspendu, bloc bas sous coupole de verre, ou tour à résille */
function futureHouse(p: Parts, r: () => number, v: number, W: number, D: number) {
  const k = v % 3;
  if (k === 0) {
    const h = 0.5 + r() * 0.3;
    p.box(W, h, D, 0, 0, 0, O.white);
    for (const [f, len] of faces(p, W, D)) for (const u of [-len * 0.22, len * 0.22]) {
      f.shape(archPts(0.26, h * 0.78, 'pointed', 5), u, 0.03, 0.004, O.turqD);
      f.shape(archPts(0.22, h * 0.72, 'pointed', 5), u, 0.05, 0.008, O.glass, true);
    }
    p.box(W + 0.02, 0.02, D + 0.02, 0, h - 0.06, 0, O.turqL, 0, 'neon');
    parapet(p, W, D, h, O.white, 0.05, 0.03);
    dome(p, Math.min(W, D) * 0.38, Math.min(W, D) * 0.34, 0, h, 0, O.glass, 'persian', 12, true);
    p.cyl(Math.min(W, D) * 0.39, Math.min(W, D) * 0.39, 0.03, 12, 0, h, 0, O.white);
    palm(p, W * 0.38, D * 0.38, 0.4, v, 0x9a8a6a, 0x5f9442, false);
    return;
  }
  const floors = 4 + Math.floor(r() * 5), fh = 0.24, h = floors * fh, rad = Math.min(W, D) * 0.46, seg = 12;
  p.box(W, 0.1, D, 0, 0, 0, 0xddd6c8);
  if (k === 1) {
    column(p, rad * 1.04, rad, h, seg, 0, 0.1, 0, O.white);
    for (let f = 0; f < floors; f++) column(p, rad + 0.012, rad + 0.012, 0.08, seg, 0, 0.1 + f * fh + 0.08, 0, O.glass);
    for (let f = 0; f < floors; f++) p.add(new THREE.CylinderGeometry(rad + 0.014, rad + 0.014, 0.08, seg, 1, true).translate(0, 0.04, 0), 0, 0.1 + f * fh + 0.08, 0, O.glass, 0, true);
    for (let f = 2; f < floors; f += 3) p.add(new THREE.CylinderGeometry(rad + 0.02, rad + 0.02, 0.014, seg, 1, true), 0, 0.1 + f * fh + 0.2, 0, O.turqL, 0, 'neon');
    // le jardin suspendu : une terrasse en encorbellement plantée
    const ty = 0.1 + Math.floor(floors * 0.6) * fh;
    p.cyl(rad + 0.1, rad + 0.08, 0.04, seg, 0, ty, 0, O.white);
    p.add(new THREE.IcosahedronGeometry(0.08, 0).scale(1.4, 0.6, 1), rad * 0.7, ty + 0.06, rad * 0.5, O.green);
    p.cyl(rad * 0.92, rad * 0.92, 0.04, seg, 0, 0.1 + h, 0, O.green);
    if (v % 2) palm(p, rad * 0.3, 0, 0.32, v, 0x9a8a6a, 0x5f9442, false);
    else { dome(p, rad * 0.55, rad * 0.45, 0, 0.14 + h, 0, O.glass, 'persian', 10, true); }
    return;
  }
  // tour à résille de losanges (claustra lumineux), couronnée d'un kiosque
  const tw = W * 0.86, td = D * 0.86;
  p.box(tw, h, td, 0, 0.1, 0, O.white);
  for (const [f, len] of faces(p, tw, td, 0, 0, 0.1)) {
    f.plane(len - 0.08, h - 0.1, 0, h / 2, 0.003, O.glass, true);
    const nx = Math.max(2, Math.round(len / 0.14)), ny = Math.round(h / 0.14);
    for (let j = 0; j < ny; j += 2) for (let i = 0; i < nx; i++) f.plane(0.07, 0.07, -len / 2 + 0.04 + ((len - 0.08) / nx) * (i + 0.5), 0.07 + j * ((h - 0.1) / ny), 0.006, O.white, false, Math.PI / 4);
  }
  p.box(tw + 0.04, 0.03, td + 0.04, 0, 0.1 + h, 0, O.white);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.015, 0.015, 0.16, 4, sx * tw * 0.3, 0.13 + h, sz * td * 0.3, O.white);
  p.box(tw * 0.7, 0.025, td * 0.7, 0, 0.29 + h, 0, O.white);
  dome(p, tw * 0.28, tw * 0.24, 0, 0.31 + h, 0, O.turq, 'persian', 8);
  p.box(tw + 0.05, 0.015, td + 0.05, 0, 0.1 + h * 0.5, 0, O.turqL, 0, 'neon');
}

// ---------- Le souk, puis la bourse (lot de 4 × 4) ----------

/** Étal de marchand sous sa toile, avec ses marchandises */
function stall(p: Parts, x: number, z: number, ry: number, c: number, v: number) {
  const f = new Face(p, ry, x, z);
  f.box(0.62, 0.15, 0.36, 0, 0, 0, O.wood);
  f.box(0.66, 0.02, 0.4, 0, 0.15, 0, O.beam);
  for (const su of [-1, 1]) for (const sn of [-1, 1]) f.box(0.025, sn < 0 ? 0.46 : 0.36, 0.025, su * 0.31, 0, sn * 0.17, O.wood);
  f.add(new THREE.BoxGeometry(0.76, 0.012, 0.5).rotateX(0.22), 0, 0.42, 0.02, c);
  f.plane(0.76, 0.06, 0, 0.36, 0.27, dark(c, 0.85));
  const goods = [[0xc98a3a, 0xe0b440, 0x9a3a2a], [0x6a8a3a, 0xd8577a, 0xe8c14a], [O.terra, O.turq, O.white], [0x8a4f7a, 0x4f7fb0, 0xd9a43c]][v % 4];
  for (let j = 0; j < 3; j++) f.add(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 6), -0.2 + j * 0.2, 0.2, 0.04, goods[j]);
  f.add(new THREE.IcosahedronGeometry(0.035, 0), -0.2, 0.25, 0.04, goods[1]);
  jar(p, f.x(0.38, 0.1), f.z(0.38, 0.1), 1.1);
}

function oMarket(p: Parts, age: number, v: number) {
  const s = style(age);
  p.box(3.9, 0.04, 3.9, 0, 0, 0, s.mud ? 0xcdb488 : age >= 4 ? 0xe2dccd : 0xd6c6a0);
  if (age <= 3) {
    // les étals à toile autour de la place
    const rows = age <= 1 ? [[-0.95, 0], [0.95, Math.PI]] : [[1.35, 0]];
    for (const [z, ry] of rows) for (let i = 0; i < 4; i++) stall(p, -1.35 + i * 0.9, z, ry, pick(AWNING, i + Math.round(z * 3) + v), i + v);
    if (age <= 1) {
      // l'Antiquité : un puits, des sacs, des chameaux couchés
      p.cyl(0.2, 0.22, 0.16, 8, 0, 0.04, 0, s.trim); p.cyl(0.15, 0.15, 0.162, 8, 0, 0.04, 0, O.water);
      for (const sx of [-1, 1]) p.cyl(0.015, 0.015, 0.35, 4, sx * 0.2, 0.04, 0, O.wood);
      p.box(0.5, 0.025, 0.025, 0, 0.39, 0, O.wood);
      camel(p, 1.3, 0.1, 1.2, true); camel(p, -1.4, -0.2, -0.4, true);
      for (let i = 0; i < 4; i++) p.add(new THREE.IcosahedronGeometry(0.07, 0).scale(1, 0.8, 1), -0.4 + i * 0.25, 0.08, 0.35, O.straw);
      palm(p, 1.7, -1.6, 0.9, v); palm(p, -1.7, 1.7, 0.85, v + 3);
      return;
    }
    // le souk couvert : une longue halle voûtée sous une rangée de coupoles percées de jours, deux portails
    const z = -0.6, hh = age === 3 ? 0.62 : 0.56, n = 4;
    p.box(3.6, hh, 1.5, 0, 0.04, z, s.wall);
    for (const [f, len] of faces(p, 3.6, 1.5, 0, z, 0.04)) {
      if (Math.abs(f.ry) === Math.PI / 2) { bay(f, 0, 0, 0.5, hh * 0.85, s.arch, O.shade, { frame: s.trim, alfiz: s.tiles[0] }); continue; }
      for (let i = 0; i < n; i++) {
        const u = -1.35 + i * 0.9;
        bay(f, u, 0, 0.5, hh * 0.78, s.arch, O.shade, { frame: s.trim });
        // l'échoppe dans l'arcade : marchandises et lumière
        f.plane(0.36, 0.14, u, 0.13, 0.014, pick([0xc98a3a, 0x9a3a2a, 0xe0b440, 0x4f7fb0, 0x8a4f7a], i + v + f.ry));
        f.shape(archPts(0.2, 0.14, s.arch, 3), u, hh * 0.45, 0.014, O.win, true);
      }
      f.box(len + 0.04, 0.03, 0.04, 0, hh - 0.03, 0.01, s.trim);
      if (f.ry === 0) mosaic(f, 0, len - 0.1, hh - 0.08, 0.06, s.tiles);
    }
    for (let i = 0; i < n; i++) {
      const x = -1.35 + i * 0.9;
      p.cyl(0.36, 0.38, 0.07, 8, x, 0.04 + hh, z, s.trim);
      dome(p, 0.36, 0.3, x, 0.11 + hh, z, age === 2 ? s.wall : s.dome, 'half', 10, false, age === 3 ? dark(s.dome, 0.9) : undefined);
      // les jours de la coupole et le lanterneau
      for (const fr of ring(p, 5, 0.3, x, z, 0.2 + hh)) fr.plane(0.04, 0.04, 0, 0, 0.02, O.win, true);
      p.cyl(0.06, 0.06, 0.06, 6, x, 0.38 + hh, z, s.wall);
      p.add(new THREE.OctahedronGeometry(0.03), x, 0.47 + hh, z, O.gold);
    }
    parapet(p, 3.6, 1.5, 0.04 + hh, s.wall, 0.05, 0.04, 0, z);
    if (age === 3) {
      // la tour de l'horloge, au coin de la place
      const tx = 1.55, tz = 0.75, th = 1.8;
      p.box(0.5, th, 0.5, tx, 0.04, tz, s.wall);
      for (const [f] of faces(p, 0.5, 0.5, tx, tz, 0.04)) {
        f.add(new THREE.CircleGeometry(0.13, 10), 0, th - 0.35, 0.004, 0xf6f2e6, true);
        f.box(0.012, 0.09, 0.006, 0, th - 0.36, 0.008, O.darkwood); f.box(0.06, 0.012, 0.006, 0.025, th - 0.355, 0.009, O.darkwood);
        win(f, 0, th * 0.35, 0.1, 0.2, s.arch, s.trim, { glow: true });
        mosaic(f, 0, 0.5, th - 0.12, 0.06, s.tiles);
        merlons(f, 0.5, th, s.wall, 'step', 0.17, 0.09, 0.04);
      }
      p.box(0.32, 0.22, 0.32, tx, 0.04 + th, tz, s.wall);
      dome(p, 0.2, 0.32, tx, 0.26 + th, tz, O.turq, 'onion', 8);
      finial(p, tx, 0.58 + th, tz, 0.6);
    }
    // chalands, ballots et palmiers sur la place
    for (let i = 0; i < 3; i++) p.box(0.16, 0.12, 0.12, -1.5 + i * 0.2, 0.04, 0.55, pick([0xc9a26a, 0xb07a4a, 0xe3d2a8], i + v));
    camel(p, -0.9, 0.55, 1.4, false);
    palm(p, 1.7, -1.75, 0.9, v); palm(p, -1.7, -1.75, 0.95, v + 2);
    return;
  }
  // la bourse : un palais de commerce à arcades sur deux niveaux, horloge et coupole ; de verre au Futuriste
  const bw = 3.4, bd = 2.0, bz = -0.75, fl = 2, fh = 0.5, h = fl * fh;
  p.box(bw, h, bd, 0, 0.04, bz, s.wall);
  for (const [f, len] of faces(p, bw, bd, 0, bz, 0.04)) {
    const k = Math.max(2, Math.round(len / 0.48));
    for (let fl2 = 0; fl2 < fl; fl2++)
      for (let i = 0; i < k; i++) {
        const u = -len / 2 + (len / k) * (i + 0.5);
        if (fl2 === 0 && f.ry === 0) { bay(f, u, 0, 0.34, fh * 0.85, s.arch, O.shade, { frame: s.trim }); f.shape(archPts(0.2, fh * 0.5, s.arch, 4), u, 0.04, 0.014, age === 5 ? O.glass : O.win, true); }
        else win(f, u, fl2 * fh + 0.1, 0.18, fh * 0.6, s.arch, s.trim, { glow: true, sill: s.trim });
      }
    f.box(len + 0.04, 0.035, 0.05, 0, fh, 0.02, s.trim);
    cornice(f, len, h - 0.03, s.trim, f.ry === 0 ? s.trim : undefined);
    if (age === 5) f.plane(len, 0.018, 0, h - 0.06, 0.04, O.turqL, 'neon');
    else merlons(f, len, h, s.wall, 'round', 0.3, 0.08, 0.04);
  }
  // le perron et le fronton de l'horloge
  for (let k = 0; k < 3; k++) p.box(1.4 - k * 0.12, 0.03, 0.18, 0, 0.04 + k * 0.03, bz + bd / 2 + 0.25 - k * 0.06, s.base);
  p.box(1.1, h + 0.4, 0.2, 0, 0.04, bz + bd / 2 + 0.02, s.wall);
  const fc = new Face(p, 0, 0, bz + bd / 2 + 0.12, 0.04);
  panel(fc, 0, (h + 0.4) / 2, 1.0, h + 0.32, s.tiles, 0, 0.1);
  fc.shape(archPts(0.7, h * 0.85, s.arch, 7), 0, 0, 0.01, s.trim);
  fc.shape(archPts(0.58, h * 0.8, s.arch, 7), 0, 0, 0.014, age === 5 ? O.glass : O.shade, age === 5);
  fc.add(new THREE.CircleGeometry(0.15, 12), 0, h + 0.15, 0.012, 0xf6f2e6, true);
  fc.box(0.012, 0.1, 0.006, 0, h + 0.14, 0.016, O.darkwood);
  merlons(fc, 1.1, h + 0.4, s.wall, 'round', 0.22, 0.09, 0.05);
  // le panneau des cours : lettres lumineuses qui défilent
  fc.plane(0.9, 0.08, 0, h + 0.02, 0.02, age === 5 ? O.turqL : 0xffb84a, 'neon');
  // la coupole
  p.cyl(0.52, 0.55, 0.16, 12, 0, 0.04 + h, bz, s.wall);
  for (const f of ring(p, 8, 0.53, 0, bz, 0.04 + h)) f.plane(0.06, 0.08, 0, 0.08, 0.004, O.win, true);
  dome(p, 0.55, 0.58, 0, 0.2 + h, bz, s.dome, 'persian', 14, s.domeGlow, age === 4 ? dark(s.dome, 0.86) : undefined);
  finial(p, 0, 0.78 + h, bz, 0.8);
  if (age === 5) {
    // Futuriste : anneau d'affichage holographique qui tourne autour de la coupole
    p.add(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 16, 1, true), 0, 0.5 + h, bz, O.turqL, 0, 'neon');
    for (const sx of [-1, 1]) { p.cyl(0.1, 0.12, 1.6, 8, sx * 1.75, 0.04, -1.6, O.white); p.cyl(0.13, 0.13, 0.03, 8, sx * 1.75, 1.64, -1.6, O.turqL, 'neon'); }
  }
  // la place : fontaine, palmiers en bacs, bancs, réverbères ; quelques voitures (Moderne)
  fountain(p, 0, 1.15, 0.4, s.trim, 0.04);
  for (const sx of [-1, 1]) for (const zz of [0.6, 1.7]) { p.box(0.24, 0.12, 0.24, sx * 1.4, 0.04, zz, s.trim); palm(p, sx * 1.4, zz, 0.85, sx * 3 + zz * 7, 0x8a6a48, 0x5f9442, false); }
  for (const sx of [-1, 1]) { p.box(0.4, 0.04, 0.1, sx * 0.75, 0.1, 1.75, O.wood); p.box(0.4, 0.06, 0.02, sx * 0.75, 0.14, 1.8, O.wood); }
  for (const sx of [-1, 1]) { p.cyl(0.012, 0.016, 0.5, 4, sx * 0.75, 0.04, 0.45, O.darkwood); p.box(0.05, 0.07, 0.05, sx * 0.75, 0.54, 0.45, O.win, 0, true); }
  if (age === 4) for (const [x, z, c] of [[-1.6, 0.0, 0xc0442a], [1.55, -0.05, 0x2f6f9e]] as const) { p.box(0.16, 0.06, 0.32, x, 0.06, z, c); p.box(0.13, 0.05, 0.17, x, 0.12, z - 0.02, 0xbfd8e0); }
}

/** Chameau, debout ou couché, tourné vers (sin ry, cos ry) */
function camel(p: Parts, x: number, z: number, ry: number, sit = false, col = 0xc8a06a) {
  const f = new Face(p, ry, x, z), y = sit ? 0.04 : 0.15;
  f.box(0.09, 0.09, 0.24, 0, y, 0, col);
  f.add(new THREE.IcosahedronGeometry(0.055, 0).scale(1, 0.9, 1.3), 0, y + 0.1, -0.01, col);
  f.add(new THREE.BoxGeometry(0.045, 0.16, 0.05).translate(0, 0.08, 0).rotateX(0.5), 0, y + 0.05, 0.1, col);
  f.box(0.05, 0.05, 0.1, 0, y + 0.17, 0.2, col);
  f.box(0.1, 0.012, 0.13, 0, y + 0.1, -0.01, pick(AWNING, Math.round(x * 3)));
  if (!sit) for (const su of [-1, 1]) for (const sn of [-1, 1]) f.box(0.025, 0.15, 0.025, su * 0.03, 0, sn * 0.09, dark(col, 0.85));
  else for (const su of [-1, 1]) f.box(0.03, 0.035, 0.22, su * 0.05, 0, 0, dark(col, 0.85));
}

// ---------- Le caravansérail (lot de 4 × 4) ----------

function oCaravan(p: Parts, age: number, v: number) {
  const s = style(age), wall = s.mud ? O.mud : age >= 4 ? O.white : O.sand;
  const fl = age <= 3 ? 1 : age === 4 ? 3 : 4, fh = 0.42, h = fl * fh + 0.12, t = 0.85, S = 3.8, inner = S / 2 - t;
  p.box(S + 0.1, 0.05, S + 0.1, 0, 0, 0, s.base);
  // quatre ailes autour d'une cour
  for (const [x, z, w, d] of [[0, -(S - t) / 2, S, t], [0, (S - t) / 2, S, t], [-(S - t) / 2, 0, t, S - 2 * t], [(S - t) / 2, 0, t, S - 2 * t]] as const) p.box(w, h, d, x, 0.05, z, wall);
  // dehors : murs aveugles à contreforts et petites fenêtres hautes ; corniche, merlons
  for (const [f, len] of faces(p, S, S, 0, 0, 0.05)) {
    if (s.mud) vigas(f, len, h - 0.07, O.beam, 0.22, 0.05);
    else { cornice(f, len, h - 0.03, s.trim); merlons(f, len, h, wall, s.merlon, 0.3, 0.09, 0.05); f.plane(len, 0.1, 0, 0.05, 0.002, s.base); }
    for (const u of [-1.2, -0.4, 0.4, 1.2]) if (!(f.ry === 0 && Math.abs(u) < 0.6)) {
      f.box(0.14, h * 0.85, 0.08, u + (u > 0 ? 0.4 : -0.4) * 0.5, 0, 0.04, wall);
      for (let k = 0; k < fl; k++) if (fl > 1 || !s.mud) win(f, u, k * fh + 0.24, 0.08, 0.12, s.arch, s.trim, { glow: k > 0 || age >= 4, grille: k === 0 ? O.darkwood : undefined });
    }
    // tours d'angle rondes et trapues
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (S / 2 - 0.05), z = sz * (S / 2 - 0.05), th = h + 0.18;
    if (s.mud) { frustum(p, 0.5, 0.5, 0.4, 0.4, th, x, 0.05, z, wall); continue; }
    column(p, 0.3, 0.26, th, 10, x, 0.05, z, wall);
    p.cyl(0.29, 0.29, 0.04, 10, x, 0.05 + th, z, s.trim);
    for (const f of ring(p, 6, 0.27, x, z, 0.09 + th)) merlons(f, 0.2, 0, wall, s.merlon, 0.2, 0.08, 0.04);
  }
  // sur les ailes, une petite coupole basse par chambre (jusqu'à l'Industriel)
  if (age <= 3) {
    const spots: [number, number][] = [];
    for (const x of [-1.35, -0.7, 0.7, 1.35]) spots.push([x, -(S - t) / 2], [x, (S - t) / 2]);
    for (const zz of [-0.5, 0.5]) spots.push([-(S - t) / 2, zz], [(S - t) / 2, zz]);
    for (const [x, z] of spots) dome(p, 0.26, s.mud ? 0.12 : 0.16, x, 0.05 + h, z, s.mud ? O.mudL : age === 3 ? O.white : wall, 'saucer', 8);
  }
  // la cour : galerie d'arcs sur les quatre faces, sur chaque niveau
  for (const ry of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    const f = new Face(p, ry, -Math.sin(ry) * inner, -Math.cos(ry) * inner, 0.05);
    const k = 4;
    for (let lv = 0; lv < fl; lv++) {
      for (let i = 0; i < k; i++) {
        const u = -inner + ((2 * inner) / k) * (i + 0.5);
        bay(f, u, lv * fh, 0.34, fh * 0.8, s.arch, O.shade, { frame: s.trim, seg: 5 });
        if (lv > 0 || age >= 4) f.shape(archPts(0.14, fh * 0.35, s.arch, 3), u, lv * fh + 0.04, 0.014, O.win, true);
      }
      if (lv > 0) f.box(2 * inner, 0.03, 0.06, 0, lv * fh, 0.03, s.trim);
    }
  }
  // l'entrée monumentale
  const ph = h + 0.45;
  p.box(1.3, ph, 0.3, 0, 0.05, S / 2 - 0.08, wall);
  const fp = new Face(p, 0, 0, S / 2 + 0.07, 0.05);
  if (!s.mud) panel(fp, 0, ph / 2, 1.2, ph - 0.1, s.tiles, 0, 0.11);
  fp.shape(archPts(0.66, Math.min(ph * 0.75, 1.1), s.arch, 7), 0, 0, 0.01, s.trim);
  fp.shape(archPts(0.54, Math.min(ph * 0.7, 1.0), s.arch, 7), 0, 0, 0.014, O.shade);
  door(fp, 0, 0.34, 0.42, s.arch, s.trim, O.darkwood, { n: 0.016 });
  merlons(fp, 1.3, ph, wall, s.mud ? 'tooth' : s.merlon, 0.22, 0.09, 0.05);
  if (s.mud) for (let k = 0; k < 2; k++) vigas(fp, 1.2, ph * 0.55 + k * 0.16, O.beam, 0.15, 0.05);
  // la cour : sol, puits ou bassin, et son monde : bêtes, ballots, voyageurs, ou voitures et taxis aux âges modernes
  p.box(2 * inner, 0.02, 2 * inner, 0, 0.05, 0, s.mud ? 0xcdb488 : 0xd9c9a2);
  p.cyl(0.2, 0.22, 0.14, 8, 0, 0.05, 0, s.trim);
  p.cyl(0.16, 0.16, 0.142, 8, 0, 0.05, 0, O.water);
  if (age <= 3) {
    for (const sx of [-1, 1]) p.cyl(0.012, 0.012, 0.32, 4, sx * 0.18, 0.05, 0, O.wood);
    p.box(0.44, 0.025, 0.025, 0, 0.37, 0, O.wood);
    camel(p, -0.6, 0.4, 0.4, true); camel(p, 0.55, -0.5, 2.6, age === 1); camel(p, 0.6, 0.55, -1.2, false);
    for (let i = 0; i < 4; i++) p.box(0.14, 0.1, 0.11, -0.7 + (i % 2) * 0.16, 0.07 + Math.floor(i / 2) * 0.1, -0.6, pick([0xc9a26a, 0xb07a4a, O.red, 0xe3d2a8], i + v));
    jar(p, 0.75, -0.1, 1.2, O.terra, 0.05); jar(p, 0.8, 0.05, 1.1, O.terra, 0.05);
  } else {
    palm(p, -0.6, -0.55, 0.85, v, 0x8a6a48, 0x5f9442, false); palm(p, 0.6, 0.55, 0.9, v + 1, 0x8a6a48, 0x5f9442, false);
    for (const [x, z] of [[-0.6, 0.5], [0.55, -0.55]]) for (const sx of [-0.12, 0.12]) { p.box(0.1, 0.05, 0.08, x + sx, 0.07, z, O.white); p.add(new THREE.ConeGeometry(0.12, 0.08, 8), x, 0.36, z, pick(AWNING, x * 3)); p.cyl(0.008, 0.008, 0.3, 3, x, 0.07, z, O.steel); }
  }
  if (age === 5) {
    // Futuriste : la cour sous une verrière en coupole
    dome(p, inner * 1.1, inner * 0.7, 0, 0.05 + h, 0, O.glass, 'half', 12, true);
    p.add(new THREE.TorusGeometry(inner * 1.1, 0.015, 3, 12).rotateX(Math.PI / 2), 0, 0.06 + h, 0, O.turqL, 0, 'neon');
  }
}

// ---------- Les bains (lot de 3 × 2,6) ----------

/** Coupole de hammam percée de jours en étoile, allumés la nuit */
function bathDome(p: Parts, s: Style, x: number, y: number, z: number, R: number, H: number, col: number) {
  dome(p, R, H, x, y, z, col, s.mud ? 'saucer' : 'half', 12, s.domeGlow);
  for (const [k, n] of [[0.35, 8], [0.62, 5]] as const) {
    const rr = R * (k < 0.5 ? 0.93 : 0.74), yy = y + H * k;
    for (const f of ring(p, n, rr, x, z, yy, k)) f.add(new THREE.CircleGeometry(0.03, 5).rotateX(-0.6 - k), 0, 0, 0.01, O.win, true);
  }
}

function oBaths(p: Parts, age: number, v: number) {
  const s = style(age), wall = s.mud ? O.mud : age >= 4 ? O.white : s.wall;
  p.box(3.0, 0.05, 2.6, 0, 0, 0, s.base);
  if (age >= 4) {
    // Moderne et Futuriste : un spa sous coupoles, un bassin dehors, transats et parasols
    p.box(2.8, 0.6, 1.3, 0, 0.05, -0.55, wall);
    for (const [f, len] of faces(p, 2.8, 1.3, 0, -0.55, 0.05)) {
      for (const u of [-0.9, -0.3, 0.3, 0.9]) if (Math.abs(u) < len / 2 - 0.1) { f.shape(archPts(0.32, 0.46, 'pointed', 5), u, 0.02, 0.004, s.trim); f.shape(archPts(0.26, 0.42, 'pointed', 5), u, 0.04, 0.008, O.glass, true); }
      cornice(f, len, 0.57, s.trim);
      if (age === 5) f.plane(len, 0.018, 0, 0.5, 0.04, O.turqL, 'neon');
    }
    parapet(p, 2.8, 1.3, 0.65, wall, 0.05, 0.03, 0, -0.55);
    for (const [x, R] of [[-0.85, 0.36], [0, 0.5], [0.85, 0.36]] as const) { p.cyl(R + 0.03, R + 0.04, 0.08, 12, x, 0.65, -0.55, wall); bathDome(p, s, x, 0.73, -0.55, R, R * 0.9, age === 5 ? O.glass : x === 0 ? s.dome : O.white); }
    p.box(2.4, 0.06, 0.9, 0, 0.05, 0.75, s.trim);
    p.box(2.26, 0.062, 0.78, 0, 0.05, 0.75, O.water);
    if (age === 5) p.box(2.3, 0.02, 0.82, 0, 0.1, 0.75, O.turqL, 0, 'neon');
    for (let i = 0; i < 4; i++) { const x = -1.2 + i * 0.8; p.add(new THREE.BoxGeometry(0.12, 0.02, 0.28).rotateX(i % 2 ? -0.2 : 0), x + 0.15, 0.08, 1.2 + (i % 2) * 0.02, O.white); }
    for (const sx of [-1, 1]) { p.cyl(0.008, 0.008, 0.32, 3, sx * 1.25, 0.05, 1.15, O.steel); p.add(new THREE.ConeGeometry(0.17, 0.07, 8), sx * 1.25, 0.37, 1.15, pick(AWNING, sx + v)); }
    palm(p, -1.15, 0.15, 0.8, v, 0x8a6a48, 0x5f9442, false); palm(p, 1.15, 0.2, 0.75, v + 2, 0x8a6a48, 0x5f9442, false);
    return;
  }
  // le hammam : vestibule à grande coupole, salle tiède et salle chaude sous des coupoles percées, chaufferie et sa cheminée
  const H = s.mud ? 0.5 : 0.62;
  p.box(1.2, H, 1.2, -0.85, 0.05, 0.4, wall);
  p.box(1.7, H * 0.85, 1.0, 0.55, 0.05, -0.5, wall);
  p.box(0.9, H * 0.9, 0.9, -0.85, 0.05, -0.55, wall);
  for (const [f, len] of [...faces(p, 1.2, 1.2, -0.85, 0.4, 0.05), ...faces(p, 1.7, 1.0, 0.55, -0.5, 0.05)]) {
    if (s.mud) vigas(f, len, f.oy + H * 0.7, O.beam, 0.22, 0.04);
    else { f.plane(len, 0.08, 0, 0.04, 0.002, s.base); f.box(len + 0.03, 0.03, 0.05, 0, H * 0.82, 0.01, s.trim); }
  }
  bathDome(p, s, -0.85, 0.05 + H, 0.4, 0.52, 0.5, s.mud ? wall : s.dome);
  bathDome(p, s, 0.2, 0.05 + H * 0.85, -0.5, 0.4, 0.36, s.mud ? wall : O.white);
  bathDome(p, s, 0.9, 0.05 + H * 0.85, -0.5, 0.4, 0.36, s.mud ? wall : O.white);
  bathDome(p, s, -0.85, 0.05 + H * 0.9, -0.55, 0.36, 0.32, s.mud ? wall : O.white);
  // le portail du vestibule
  p.box(0.62, H + 0.25, 0.14, -0.85, 0.05, 1.04, wall);
  const fq = new Face(p, 0, -0.85, 1.11, 0.05);
  if (!s.mud) panel(fq, 0, (H + 0.25) / 2, 0.56, H + 0.2, s.tiles, 0, 0.09);
  door(fq, 0, 0.24, H * 0.75, s.arch, s.trim, pick(DOORS, v), { n: 0.01, step: s.base });
  merlons(fq, 0.62, H + 0.25, wall, s.mud ? 'tooth' : s.merlon, 0.2, 0.08, 0.04);
  // la chaufferie et sa cheminée, le bois empilé, la citerne
  p.box(0.6, 0.4, 0.6, 1.05, 0.05, 0.6, s.mud ? O.mudD : s.trim);
  p.cyl(0.07, 0.09, 1.25, 6, 1.2, 0.05, 0.45, s.mud ? O.mudD : 0xb8865a);
  p.cyl(0.1, 0.1, 0.06, 6, 1.2, 1.3, 0.45, dark(0xb8865a, 0.6));
  for (let i = 0; i < 6; i++) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 4).rotateZ(Math.PI / 2), 0.35, 0.08 + (i % 3) * 0.05, 0.6 + Math.floor(i / 3) * 0.07 + (i % 3) * 0.02, O.wood);
  p.cyl(0.18, 0.2, 0.3, 8, 0.2, 0.05, 0.6, s.mud ? O.mud : wall);
  // linge des baigneurs qui sèche, palmier
  for (const sx of [-1, 1]) p.cyl(0.01, 0.01, 0.3, 3, sx * 0.25 + 0.15, 0.05, 1.15, O.wood);
  p.box(0.5, 0.005, 0.005, 0.15, 0.34, 1.15, O.darkwood);
  for (let i = 0; i < 3; i++) new Face(p, 0, i * 0.15, 1.15, 0.25).plane(0.11, 0.09, 0, 0.04, 0, i % 2 ? O.white : pick(AWNING, i + v));
  palm(p, 1.25, 1.05, 0.8, v + 4);
}

// ---------- Les jardins (lots carrés de 2 à 3,5 cases) ----------

/** Oranger en pot ou en pleine terre : boule sombre semée de fruits */
function orangeTree(p: Parts, x: number, z: number, h: number, y = 0) {
  p.cyl(0.02, 0.028, h * 0.45, 5, x, y, z, O.darkwood);
  p.add(new THREE.IcosahedronGeometry(h * 0.32, 0), x, y + h * 0.62, z, O.greenD);
  for (let k = 0; k < 3; k++) p.add(new THREE.OctahedronGeometry(0.025), x + Math.sin(k * 2.1) * h * 0.26, y + h * (0.55 + (k % 2) * 0.15), z + Math.cos(k * 2.1) * h * 0.26, O.ochre);
}

function oGarden(p: Parts, age: number, v: number, w: number, d: number) {
  const s = style(Math.max(2, age)), W = w * 0.94, D = d * 0.94, wall = houseWall(Math.max(2, age), v), wh = age >= 4 ? 0.1 : 0.2;
  // le mur d'enceinte (une grille basse aux âges modernes), sa porte sur la façade, ses merlons
  for (const [f, len] of faces(p, W, D)) {
    if (f.ry === 0) for (const sx of [-1, 1]) f.box(len / 2 - 0.22, wh, 0.07, sx * (len / 4 + 0.11), 0, -0.035, wall);
    else f.box(len - (Math.abs(f.ry) === Math.PI / 2 ? 0.14 : 0), wh, 0.07, 0, 0, -0.035, wall);
    if (age <= 3) merlons(f, len, wh, wall, 'step', 0.3, 0.07, 0.05);
    else for (let i = 0; i <= Math.round(len / 0.3); i++) f.cyl(0.012, 0.012, 0.18, 3, -len / 2 + i * (len / Math.round(len / 0.3)), wh, -0.035, O.darkwood);
  }
  const fg = new Face(p, 0, 0, D / 2);
  for (const sx of [-1, 1]) { fg.box(0.1, wh + 0.2, 0.12, sx * 0.24, 0, -0.035, wall); fg.add(new THREE.ConeGeometry(0.07, 0.1, 4).rotateY(Math.PI / 4), sx * 0.24, wh + 0.2, -0.035, s.dome); }
  fg.box(0.58, 0.06, 0.1, 0, wh + 0.14, -0.035, wall);
  if (age <= 3) fg.plane(0.46, 0.05, 0, wh + 0.17, 0.016, s.tiles[0]);
  // les allées de sable, les quatre parterres, les canaux en croix, la fontaine au milieu
  p.box(W - 0.14, 0.035, D - 0.14, 0, 0, 0, age >= 4 ? 0xe2d8c0 : 0xd9c9a2);
  const bw = W * 0.36, bd = D * 0.36;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bed(p, bw, bd, sx * W * 0.24, sz * D * 0.24, v * 4 + sx + sz * 2, s.trim, 0.02);
  p.box(0.14, 0.035, D - 0.24, 0, 0.02, 0, s.trim); p.box(0.08, 0.037, D - 0.26, 0, 0.02, 0, O.water);
  p.box(W - 0.24, 0.035, 0.14, 0, 0.02, 0, s.trim); p.box(W - 0.26, 0.037, 0.08, 0, 0.02, 0, O.water);
  fountain(p, 0, 0, 0.22, s.trim, 0.02, W > 2.6 && age >= 3 && age <= 4 ? { dome: s.dome, col: s.wall, h: 0.26 } : undefined);
  // arbres aux coins des parterres : palmiers, orangers, cyprès ; un kiosque dans un coin une fois sur deux
  for (const [sx, sz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) {
    const x = sx * W * 0.37, z = sz * D * 0.37, k = (v + sx + sz * 2 + 9) % 3;
    if (v % 2 && sx === 1 && sz === -1) {
      for (const cx of [-0.15, 0.15]) for (const cz of [-0.15, 0.15]) p.cyl(0.015, 0.015, 0.28, 4, x + cx - 0.05, 0.02, z + cz + 0.05, s.trim);
      p.box(0.42, 0.04, 0.42, x - 0.05, 0.3, z + 0.05, s.wall);
      dome(p, 0.2, 0.2, x - 0.05, 0.34, z + 0.05, age === 5 ? O.glass : s.dome, 'persian', 8, age === 5);
      p.box(0.26, 0.01, 0.26, x - 0.05, 0.02, z + 0.05, O.red);
      continue;
    }
    if (k === 0) palm(p, x, z, 0.55 + ((v >> 2) % 3) * 0.06, v + sx * 3 + sz);
    else if (k === 1) orangeTree(p, x, z, 0.42);
    else cypress(p, x, z, 0.55);
  }
  // bancs le long des allées, lanternes
  for (const sx of [-1, 1]) { p.box(0.24, 0.04, 0.07, sx * 0.3, 0.06, D * 0.3, s.trim); p.box(0.24, 0.06, 0.02, sx * 0.3, 0.02, D * 0.3, s.trim); }
  if (age >= 3) for (const sx of [-1, 1]) { p.cyl(0.01, 0.014, 0.32, 4, sx * 0.2, 0.02, -D * 0.38, O.darkwood); p.box(0.05, 0.06, 0.05, sx * 0.2, 0.34, -D * 0.38, O.win, 0, true); }
  if (age === 5) for (const [f, len] of faces(p, W, D)) f.plane(len, 0.016, 0, wh - 0.02, 0.004, O.turqL, 'neon');
}

// ---------- Les ateliers (lots de maison, au bord de la ville) ----------

function oWorkshop(p: Parts, age: number, v: number, w: number, d: number) {
  const s = style(age), W = w * 0.9, D = d * 0.9, wall = houseWall(age, v);
  if (age >= 4) {
    // atelier moderne : hangar blanc à toit en sheds, porte roulante, enseigne ; panneaux solaires et drone au Futuriste
    const h = age === 4 ? 0.42 : 0.38;
    p.box(W, h, D * 0.82, 0, 0, -D * 0.05, wall);
    const f = new Face(p, 0, 0, D * 0.36);
    f.plane(W * 0.42, h * 0.65, -W * 0.18, h * 0.33, 0.004, O.steel);
    for (let k = 1; k < 5; k++) f.plane(W * 0.42, 0.008, -W * 0.18, k * h * 0.13, 0.008, dark(O.steel, 0.8));
    f.plane(W * 0.3, 0.14, W * 0.24, h * 0.55, 0.004, O.win, true);
    f.plane(W * 0.5, 0.05, 0, h - 0.06, 0.006, age === 5 ? O.turqL : pick([0xc0442a, O.blue, 0x2f8f5a], v), age === 5 ? 'neon' : false);
    for (let i = 0; i < 3; i++) {
      const z = -D * 0.38 + i * D * 0.27;
      p.add(new THREE.BoxGeometry(W * 0.98, 0.012, D * 0.27).rotateX(-0.45), 0, h + 0.06, z, age === 5 ? 0x2a4a7a : 0xd0ccc4, 0, false, 0);
      p.box(W * 0.98, 0.1, 0.012, 0, h, z + D * 0.12, age === 5 ? O.glass : O.win, 0, true);
    }
    if (age === 4) { p.box(0.16, 0.08, 0.26, W * 0.3, 0, D * 0.42, 0x8a8f94); p.box(0.14, 0.06, 0.12, W * 0.3, 0.08, D * 0.45, 0xbfd8e0); }
    else { p.cyl(0.11, 0.11, 0.012, 8, W * 0.28, 0, D * 0.42, O.turqL, 'neon'); p.box(0.08, 0.025, 0.08, W * 0.28, 0.14, D * 0.42, O.white); for (const a of [0, 1, 2, 3]) p.box(0.1, 0.006, 0.012, W * 0.28, 0.16, D * 0.42, O.steel, a * Math.PI / 4); }
    return;
  }
  const kind = v % 3, h = s.mud ? 0.3 : 0.34;
  // la maison de l'artisan au fond, un appentis sur la rue
  p.box(W, h, D * 0.45, 0, 0, -D * 0.27, wall);
  const fb = new Face(p, 0, 0, -D * 0.045);
  if (s.mud) vigas(fb, W, h - 0.06, O.beam, 0.17, 0.05); else { cornice(fb, W, h - 0.03, s.trim); merlons(fb, W, h, wall, 'step', 0.28, 0.08, 0.04); }
  door(fb, W * 0.32, 0.11, 0.19, s.mud ? 'round' : s.arch, s.trim, s.mud ? O.wood : pick(DOORS, v));
  parapet(p, W, D * 0.45, h, wall, 0.04, 0.03, 0, -D * 0.27);
  if (s.mud) {
    // la maison de terre de l'artisan : pinacles, frise peinte sous les rondins, fenêtre à claustra sur le côté, palmier derrière
    pinnacles(p, W, D * 0.45, h + 0.04, wall, 0.035, 0.1, 0, -D * 0.27);
    frieze(fb, W * 0.9, h - 0.13, pick([O.white, O.ochre, O.red], v), 0.07);
    mashrabiya(new Face(p, Math.PI / 2, W / 2, -D * 0.27), 0, 0.12, 0.13, 0.1, O.wood);
    palm(p, -W * 0.44, -D * 0.47, 0.66, v + 3);
    // les paniers de marchandises et une natte devant l'appentis, une enseigne de toile au poteau
    for (let i = 0; i < 2; i++) p.cyl(0.05, 0.04, 0.06, 6, W * 0.42 - i * 0.1, 0, D * 0.42, i ? 0xb08a50 : 0x9a7040);
    p.box(W * 0.3, 0.006, 0.16, -W * 0.05, 0, D * 0.38, pick(AWNING, v + 1));
    new Face(p, 0, W * 0.42 + 0.03, D * 0.12 + 0.02, 0.12).plane(0.07, 0.1, 0.035, 0.05, 0, pick(AWNING, v + 2));
  }
  for (const sx of [-1, 1]) p.cyl(0.018, 0.018, 0.27, 4, sx * W * 0.42, 0, D * 0.12, O.wood);
  p.add(new THREE.BoxGeometry(W * 0.96, 0.015, D * 0.42).rotateX(0.12), 0, 0.28, D * 0.0, kind === 1 ? pick(AWNING, v) : O.straw);
  p.box(W * 0.96, 0.02, 0.02, 0, 0.25, D * 0.2, O.wood);
  if (kind === 0) {
    // le potier : four en coupole, tour, jarres et plats qui sèchent
    p.cyl(0.17, 0.19, 0.12, 8, -W * 0.25, 0, D * 0.25, s.mud ? O.mudD : 0xb87a58);
    dome(p, 0.17, 0.18, -W * 0.25, 0.12, D * 0.25, s.mud ? O.mudD : 0xb87a58, 'half', 8);
    p.add(new THREE.CircleGeometry(0.05, 6), -W * 0.25, 0.04, D * 0.25 + 0.19, 0xff8a3a, 0, true);
    p.cyl(0.05, 0.05, 0.08, 6, W * 0.1, 0, D * 0.15, O.wood);
    p.cyl(0.06, 0.06, 0.012, 8, W * 0.1, 0.08, D * 0.15, O.terra);
    for (let i = 0; i < 5; i++) jar(p, -W * 0.35 + i * 0.1, -D * 0.02, 0.9 + (i % 2) * 0.25, i % 3 ? O.terra : 0xd8b48a);
    for (let i = 0; i < 3; i++) p.cyl(0.05, 0.035, 0.015, 8, W * 0.3, 0.02 + i * 0.016, D * 0.3, i === 1 ? O.turq : O.terra);
  } else if (kind === 1) {
    // le teinturier : cuves de couleur, étoffes qui sèchent sur des perches
    for (let i = 0; i < 3; i++) {
      const x = -W * 0.3 + i * W * 0.3;
      p.cyl(0.1, 0.11, 0.1, 8, x, 0, D * 0.3, s.mud ? O.mudD : O.stone);
      p.cyl(0.085, 0.085, 0.102, 8, x, 0, D * 0.3, pick([0x2f5fa0, 0xc0442a, 0xd9a43c, 0x6a3a8a], i + v));
    }
    for (const sx of [-1, 1]) p.cyl(0.01, 0.01, 0.4, 3, sx * W * 0.38, h, -D * 0.27, O.wood);
    p.box(W * 0.76, 0.01, 0.01, 0, h + 0.38, -D * 0.27, O.wood);
    for (let i = 0; i < 4; i++) new Face(p, 0, -W * 0.28 + i * W * 0.19, -D * 0.27, h + 0.18).plane(0.14, 0.2, 0, 0.1, 0, pick([0x2f5fa0, 0xc0442a, 0xd9a43c, 0x6a3a8a, O.turq], i + v));
  } else {
    // le dinandier : enclume, forge à soufflet, plateaux de cuivre au mur
    p.box(0.22, 0.14, 0.18, -W * 0.25, 0, D * 0.2, s.mud ? O.mudD : O.stoneD);
    p.add(new THREE.CircleGeometry(0.05, 6).rotateX(-Math.PI / 2), -W * 0.25, 0.141, D * 0.2, 0xff8a3a, 0, true);
    p.box(0.08, 0.06, 0.05, W * 0.05, 0.06, D * 0.22, 0x4a4a4e); p.cyl(0.03, 0.04, 0.06, 5, W * 0.05, 0, D * 0.22, O.wood);
    for (let i = 0; i < 3; i++) fb.add(new THREE.CircleGeometry(0.05, 8), -W * 0.3 + i * 0.12, 0.16, 0.006, 0xc8783a);
    for (let i = 0; i < 2; i++) p.cyl(0.05, 0.04, 0.08, 7, W * 0.25 + i * 0.1, 0, D * 0.3, 0xc8783a);
  }
  if (age === 3) {
    // à l'Industriel : une cheminée de brique sur la maison de l'artisan
    p.cyl(0.05, 0.065, 0.55, 6, -W * 0.3, h, -D * 0.35, 0xb06a50);
    p.cyl(0.07, 0.07, 0.04, 6, -W * 0.3, h + 0.55, -D * 0.35, dark(0xb06a50, 0.6));
  }
}

// ---------- Le port (lot de 4 × 3,5, le quai avance sur l'eau vers +z) ----------

/** Boutre amarré de flanc en (x, z) : coque de bois à étrave relevée, voile latine ; puis navire de son âge */
function oBoat(p: Parts, age: number, x: number, z: number) {
  const L = 1.9, B = 0.44;
  if (age <= 3) {
    const hull = O.wood, rail = O.darkwood;
    // la coque : un tronc de pyramide effilé, étrave haute et tableau arrière relevé
    frustum(p, L * 0.82, B * 0.7, L, B, 0.2, x, -0.08, z, hull);
    p.box(L * 0.95, 0.025, B * 0.92, x, 0.12, z, 0xb08a60);
    p.add(new THREE.ConeGeometry(B * 0.5, 0.42, 4).rotateZ(-Math.PI / 2 + 0.55).rotateY(Math.PI / 4).scale(1, 1, 0.5), x + L * 0.52, 0.12, z, hull);
    p.box(0.26, 0.2, B * 0.96, x - L * 0.42, 0.12, z, hull);
    p.box(0.28, 0.02, B, x - L * 0.42, 0.32, z, rail);
    for (const sz of [-1, 1]) p.box(L * 0.86, 0.04, 0.02, x, 0.14, z + sz * B * 0.47, rail);
    // les deux mâts penchés vers l'avant et leurs voiles latines (triangles sous de longues vergues)
    const masts = age === 1 ? [[0.12, 1.0]] : [[0.18, 1.1], [-0.4, 0.75]];
    for (const [mx, mh] of masts) {
      p.add(new THREE.CylinderGeometry(0.016, 0.022, mh, 4).translate(0, mh / 2, 0), x + mx, 0.13, z, rail, 0, false, -0.12);
      const top = 0.13 + mh * 0.95, tx = x + mx + mh * 0.12;
      p.add(new THREE.CylinderGeometry(0.01, 0.01, mh * 1.3, 3).rotateZ(Math.PI / 2 - 0.42), tx, top - 0.08, z + 0.03, rail);
      const sail = new THREE.BufferGeometry(), a = mh * 0.62, b = mh * 0.26;
      const tri = [[-a, -b * 1.1 + 0.05, 0], [a * 0.9, b * 1.5, 0], [a * 0.15, -mh * 0.78, 0]];
      sail.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...tri.flat(), ...[tri[0], tri[2], tri[1]].flat()]), 3));
      p.add(sail, tx, top - 0.1, z + 0.035, age === 3 ? 0xf2ead6 : 0xe9dcc0);
    }
    // les ballots sur le pont, un fanal à la poupe
    for (let i = 0; i < 3; i++) p.box(0.14, 0.09, 0.14, x + 0.2 + i * 0.17, 0.145, z, pick([0xc9a26a, 0xb07a4a, O.red], i));
    p.box(0.04, 0.06, 0.04, x - L * 0.42, 0.34, z, O.win, 0, true);
    return;
  }
  // Moderne : un caboteur blanc à cheminée ; Futuriste : un navire à foils, verrière et liseré turquoise
  const hull = O.white;
  frustum(p, L * 0.86, B * 0.8, L * 1.05, B, 0.22, x, -0.08, z, age === 4 ? 0x2f4f6f : hull);
  p.add(new THREE.ConeGeometry(B * 0.5, 0.36, 4).rotateZ(-Math.PI / 2).rotateY(Math.PI / 4).scale(1, 1, 1), x + L * 0.6, 0.03, z, age === 4 ? 0x2f4f6f : hull);
  p.box(L * 1.0, 0.03, B * 0.96, x, 0.14, z, age === 4 ? 0xd8d8d8 : O.white);
  p.box(0.55, 0.2, B * 0.8, x - 0.4, 0.17, z, O.white);
  p.box(0.4, 0.12, B * 0.7, x - 0.4, 0.37, z, O.white);
  for (const sz of [-1, 1]) new Face(p, sz > 0 ? 0 : Math.PI, x - 0.4, z + sz * B * 0.4, 0.17).plane(0.5, 0.07, 0, 0.12, 0.002, age === 5 ? O.glass : O.win, true);
  if (age === 4) {
    p.cyl(0.06, 0.07, 0.25, 8, x - 0.55, 0.49, z, O.red);
    for (let i = 0; i < 2; i++) p.box(0.42, 0.18, 0.26, x + 0.25 + i * 0.0, 0.17 + i * 0.18, z, i ? 0x2f6f9e : 0xc0442a);
  } else {
    dome(p, 0.2, 0.14, x - 0.4, 0.49, z, O.glass, 'half', 8, true);
    p.box(L * 1.02, 0.02, 0.02, x, 0.1, z + B * 0.5 + 0.01, O.turqL, 0, 'neon');
    p.box(L * 1.02, 0.02, 0.02, x, 0.1, z - B * 0.5 - 0.01, O.turqL, 0, 'neon');
    p.box(0.5, 0.012, B * 0.6, x + 0.35, 0.155, z, O.turq);
  }
}

function oPort(p: Parts, age: number, v: number) {
  const s = style(age), stone = s.mud ? 0xbca27a : age >= 4 ? 0xc8c2b4 : 0xc9b994, wall = age >= 4 ? O.white : houseWall(Math.max(2, age), v);
  // le quai de pierre avance sur l'eau (+z) ; il plonge jusqu'au fond
  p.box(4, 1.6, 2.4, 0, -1.5, 0.9, stone);
  p.box(4.04, 0.05, 2.44, 0, 0.08, 0.9, age >= 4 ? 0xbdb6a8 : 0xd8c8a4);
  const fq = new Face(p, 0, 0, 2.1, 0.1);
  for (let i = 0; i < 6; i++) { p.cyl(0.04, 0.05, 0.1, 6, -1.75 + i * 0.7, 0.13, 2.0, O.darkwood); p.cyl(0.055, 0.055, 0.02, 6, -1.75 + i * 0.7, 0.23, 2.0, O.darkwood); }
  // les pierres du quai et les marches qui descendent à l'eau
  for (let i = 0; i < 10; i++) fq.plane(0.38, 0.08, -1.8 + i * 0.4, -0.12 - (i % 2) * 0.1, 0.002, dark(stone, 0.88 + (i % 3) * 0.04));
  for (let k = 0; k < 3; k++) p.box(0.4, 0.06, 0.18 - k * 0.05, 1.6, 0.02 - k * 0.12, 2.17 + k * 0.03, stone);
  p.add(new THREE.TorusGeometry(0.03, 0.008, 3, 6), -1.05, 0.1, 2.12, 0x4a4a4e);
  // l'entrepôt à arcades derrière le quai
  const wh = age >= 4 ? 0.62 : 0.46;
  p.box(3.3, 1.5, 1.1, -0.2, -1.5, -1.1, stone);
  p.box(3.2, wh, 1.0, -0.2, 0, -1.1, wall);
  const fw = new Face(p, 0, -0.2, -0.6);
  for (let i = 0; i < 5; i++) {
    const u = -1.3 + i * 0.65;
    bay(fw, u, 0, 0.42, wh * 0.82, s.arch, O.shade, { frame: s.trim, seg: 5 });
    fw.plane(0.3, 0.12, u, 0.08, 0.014, pick([0xc9a26a, 0xb07a4a, 0xe3d2a8, 0x7a8a5a], i + v));
    if (i % 2) fw.shape(archPts(0.14, 0.12, s.arch, 3), u, wh * 0.5, 0.014, O.win, true);
  }
  for (const [f, len] of faces(p, 3.2, 1.0, -0.2, -1.1)) {
    if (s.mud) vigas(f, len, wh - 0.06, O.beam, 0.22, 0.05);
    else { cornice(f, len, wh - 0.03, s.trim); if (f.ry === 0) mosaic(f, 0, len - 0.1, wh - 0.1, 0.06, s.tiles); }
  }
  parapet(p, 3.2, 1.0, wh, wall, 0.05, 0.04, -0.2, -1.1);
  if (age >= 2 && age <= 3) for (let i = 0; i < 3; i++) dome(p, 0.24, 0.16, -1.2 + i * 1.0, wh, -1.1, s.mud ? O.mudL : O.white, 'saucer', 8);
  // ballots, jarres, sacs, filets
  for (let i = 0; i < 4; i++) p.box(0.18, 0.13, 0.16, -1.2 + i * 0.24, 0.1, 0.5, pick([0xb88a5a, 0x9a6a3a, 0xc8a070, 0x7a8a5a], i + v));
  for (let i = 0; i < 3; i++) jar(p, 0.2 + i * 0.12, 0.35, 1.3, O.terra, 0.1);
  // le phare : tour ronde au bout du quai, lanterne qui brille, coupole
  if (age >= 2) {
    const H = age >= 4 ? 2.1 : 1.65, x = 1.65, z = 1.6;
    p.cyl(0.32, 0.36, 0.2, 10, x, 0.1, z, s.base);
    column(p, 0.3, 0.24, H, 10, x, 0.3, z, age === 5 ? O.white : wall);
    if (age === 3) for (let k = 1; k < 4; k++) column(p, 0.27 - k * 0.012, 0.27 - k * 0.012, 0.08, 10, x, 0.3 + k * H * 0.25, z, O.turq);
    for (const f of ring(p, 3, 0.27, x, z, 0.3, 0.5)) win(f, 0, H * 0.5, 0.06, 0.12, s.arch, s.trim, { glow: true });
    for (let k = 0; k < 2; k++) column(p, 0.27 + k * 0.03, 0.3 + k * 0.03, 0.04, 10, x, 0.26 + H + k * 0.04, z, k ? s.tiles[0] : s.trim);
    p.cyl(0.34, 0.34, 0.03, 10, x, 0.34 + H, z, s.trim);
    p.add(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 10, 1, true).translate(0, 0.025, 0), x, 0.37 + H, z, s.trim);
    p.cyl(0.15, 0.15, 0.18, 8, x, 0.37 + H, z, 0xffd88a, true);
    for (const f of ring(p, 4, 0.155, x, z, 0.37 + H)) f.box(0.02, 0.18, 0.02, 0, 0, 0, s.trim);
    dome(p, 0.19, 0.2, x, 0.55 + H, z, age >= 4 ? (age === 5 ? O.glass : O.white) : s.dome, 'half', 8, age === 5);
    finial(p, x, 0.75 + H, z, 0.6);
  }
  if (age === 3) {
    // grue de bois à treuil
    p.box(0.08, 1.1, 0.08, -1.6, 0.1, 1.5, O.darkwood);
    p.add(new THREE.BoxGeometry(0.05, 0.05, 1.0).translate(0, 0, 0.5).rotateX(-0.35), -1.6, 1.1, 1.5, O.darkwood);
    p.cyl(0.005, 0.005, 0.55, 3, -1.6, 0.9, 2.42, 0x3a3a3a);
    p.box(0.16, 0.12, 0.16, -1.6, 0.78, 2.42, 0xb07a4a);
    p.cyl(0.06, 0.06, 0.12, 6, -1.6, 0.2, 1.5, O.wood, false, Math.PI / 2);
  }
  if (age >= 4) {
    // conteneurs, grue portuaire
    for (let i = 0; i < 3; i++) for (let j = 0; j < (i === 1 ? 2 : 1); j++) {
      const c = pick([0xc0442a, 0x2f6f9e, 0xd9a43c], i + j), x = -0.9 + i * 0.4, z = 1.0 + (i % 2) * 0.3, y = 0.1 + j * 0.24;
      p.box(0.7, 0.24, 0.28, x, y, z, c);
      for (let k = 0; k < 6; k++) new Face(p, 0, x, z + 0.14, y).plane(0.012, 0.22, -0.3 + k * 0.12, 0.12, 0.002, dark(c, 0.8));
    }
    const cc = age === 5 ? O.white : 0xd9a43c;
    for (const sx of [-1, 1]) p.box(0.06, 1.6, 0.06, 0.6 + sx * 0.12, 0.1, 1.9, cc);
    p.box(0.3, 0.2, 0.25, 0.6, 1.5, 1.9, cc);
    p.box(0.06, 0.06, 1.8, 0.6, 1.66, 1.75, cc);
    p.cyl(0.004, 0.004, 0.7, 3, 0.6, 0.96, 2.5, 0x3a3a3a);
    if (age === 5) p.box(3.4, 0.02, 0.04, 0, 0.13, 2.12, O.turqL, 0, 'neon');
  }
  // le navire amarré le long du quai
  oBoat(p, age, -0.2, 2.55);
}

// ---------- Les remparts, leurs tours et leurs portes ----------

/** Couleurs des remparts (Antiquité : terre ; puis pierre de sable ; enduit clair aux âges modernes) */
function wallStyle(age: number) {
  const s = style(age);
  return { s, wall: s.mud ? O.mud : age >= 4 ? 0xe8dcc0 : 0xdcc69a, top: s.mud ? O.mudD : O.stone };
}

/** Pan de rempart de longueur `len` le long de x, centré, plongeant sous le sol de `sink` cases (pentes) */
export function orientWall(p: Parts, age: number, len: number, sink: number) {
  const { s, wall, top } = wallStyle(age), h = s.mud ? 0.6 : 0.85, t = 0.36;
  p.box(len, h + sink, t, 0, -sink, 0, wall);
  // le chemin de ronde et ses deux parapets crénelés
  p.box(len, 0.04, t + 0.06, 0, h, 0, top);
  for (const ry of [0, Math.PI]) {
    const f = new Face(p, ry, 0, ry ? -t / 2 - 0.03 : t / 2 + 0.03);
    merlons(f, len, h + 0.04, wall, s.mud ? 'tooth' : age >= 4 ? 'round' : 'step', 0.3, 0.1, 0.05);
    if (s.mud) {
      vigas(f, len, h * 0.55, O.beam, 0.32, 0.05); vigas(f, len, h * 0.85, O.beam, 0.32, 0.05);
      f.plane(len, 0.06, 0, 0.03, 0.03, O.mudD);
      if (!ry) {
        // dehors : des contreforts de terre, et la frise peinte sous le chemin de ronde
        const k = Math.max(1, Math.round(len / 0.55));
        for (let i = 0; i < k; i++) frustum(p, 0.12, 0.12, 0.08, 0.03, h * 0.7, -len / 2 + (len / k) * (i + 0.5), 0, t / 2 + 0.06, O.mudD);
        frieze(f, len, h - 0.1, O.white, 0.1, 0.03);
      }
    }
    else {
      // assises de pierre marquées, meurtrières, bandeau sous le parapet
      for (let k = 0; k < 2; k++) f.plane(len, 0.012, 0, h * (0.3 + k * 0.3), 0.002, dark(wall, 0.9));
      f.plane(0.025, 0.12, 0, h * 0.7, 0.003, O.hole);
      if (age >= 2 && age <= 3) f.plane(len, 0.05, 0, h - 0.04, 0.003, s.tiles[0]);
    }
  }
  if (age === 4) { p.cyl(0.01, 0.01, 0.16, 3, 0, h + 0.04, 0, O.darkwood); p.box(0.05, 0.06, 0.05, 0, h + 0.2, 0, O.win, 0, true); }
  if (age === 5) for (const sz of [-1, 1]) p.box(len, 0.02, 0.02, 0, h + 0.05, sz * (t / 2 + 0.04), O.turqL, 0, 'neon');
}

function oTower(p: Parts, age: number, v: number) {
  const { s, wall, top } = wallStyle(age), sink = 1.5;
  if (s.mud) {
    const h = 1.0;
    frustum(p, 0.86, 0.86, 0.72, 0.72, h + sink, 0, -sink, 0, wall);
    for (const [f, len] of faces(p, 0.72, 0.72, 0, 0, h)) merlons(f, len, 0, wall, 'tooth', 0.18, 0.1, 0.06);
    for (const [f] of faces(p, 0.8, 0.8)) { vigas(f, 0.6, h * 0.55, O.beam, 0.14, 0.06); vigas(f, 0.6, h * 0.85, O.beam, 0.14, 0.05); f.plane(0.03, 0.1, 0, h * 0.7, 0.03, O.hole); }
    p.box(0.74, 0.03, 0.74, 0, h, 0, top);
    // les pinacles aux coins, la frise peinte sous les merlons, le pied enduit de boue plus sombre
    pinnacles(p, 0.74, 0.74, h + 0.03, wall, 0.06, 0.2);
    for (const [f, len] of faces(p, 0.726, 0.726, 0, 0, 0)) frieze(f, len * 0.9, h - 0.09, O.white, 0.08, 0.004);
    for (const [f, len] of faces(p, 0.776, 0.776)) f.plane(len, 0.08, 0, 0.04, 0.002, O.mudD);
    // la porte en plein cintre au pied, son vantail clouté, sa marche
    const fd = new Face(p, 0, 0, 0.39);
    door(fd, 0, 0.16, 0.26, 'round', O.mudD, O.wood, { step: O.mudD });
    for (let k = 0; k < 4; k++) for (const s2 of [-1, 1]) fd.box(0.012, 0.012, 0.008, s2 * 0.04, 0.05 + k * 0.05, 0.012, 0x3a3a3e);
    // le balcon de guet ajouré en encorbellement sur la face, et deux torches
    mashrabiya(new Face(p, 0, 0, 0.372), 0, h * 0.42, 0.26, 0.17, O.wood);
    for (const s2 of [-1, 1]) wallTorch(fd, s2 * 0.15, 0.2);
    // le kiosque du guetteur sur la terrasse : quatre poteaux, une coupole de terre, une hampe à fanion
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.016, 0.016, 0.22, 4, sx * 0.15, h + 0.03, sz * 0.15, O.wood);
    p.box(0.38, 0.03, 0.38, 0, h + 0.25, 0, O.beam);
    dome(p, 0.2, 0.14, 0, h + 0.28, 0, O.mudL, 'saucer', 8);
    p.cyl(0.008, 0.01, 0.34, 3, 0, h + 0.38, 0, O.darkwood);
    new Face(p, Math.PI / 2, 0, 0, h + 0.62).plane(0.18, 0.1, 0.09, 0.05, 0, O.red);
    new Face(p, -Math.PI / 2, 0, 0, h + 0.62).plane(0.18, 0.1, -0.09, 0.05, 0, O.red);
    // un palmier au pied
    palm(p, 0.52, -0.08, 0.72, v + 5);
    return;
  }
  const h = 1.25, R = 0.5;
  column(p, R * 1.08, R, h + sink, 12, 0, -sink, 0, wall);
  p.cyl(R * 1.12, R * 1.12, 0.1, 12, 0, 0, 0, s.base);
  for (let k = 0; k < 3; k++) column(p, R + k * 0.025, R + 0.02 + k * 0.025, 0.035, 12, 0, h + k * 0.035, 0, k === 1 ? (age <= 3 ? s.tiles[0] : top) : top);
  p.cyl(R + 0.07, R + 0.07, 0.03, 12, 0, h + 0.1, 0, top);
  for (const f of ring(p, 8, R + 0.05, 0, 0, h + 0.13)) merlons(f, 0.2, 0, wall, age >= 4 ? 'round' : 'step', 0.2, 0.1, 0.05);
  for (const f of ring(p, 4, R * 1.02, 0, 0, 0, Math.PI / 4)) { f.plane(0.03, 0.14, 0, h * 0.55, 0.004, O.hole); f.plane(0.03, 0.14, 0, h * 0.25, 0.004, O.hole); }
  if (age <= 3) for (const f of ring(p, 8, R * 1.0, 0, 0, 0)) f.plane(0.24, 0.045, 0, h - 0.06, 0.004, s.tiles[0]);
  // le guetteur sous sa coupole (une tour sur trois, et toutes à partir de l'Industriel), ou un mât à fanion
  if (v % 3 === 0 || age >= 3) {
    p.cyl(0.24, 0.26, 0.24, 8, 0, h + 0.13, 0, wall);
    for (const f of ring(p, 4, 0.245, 0, 0, h + 0.13)) f.shape(archPts(0.08, 0.15, s.arch, 3), 0, 0.04, 0.004, age === 5 ? O.glass : O.shade, age === 5);
    dome(p, 0.28, 0.3, 0, h + 0.37, 0, age === 5 ? O.glass : s.dome, age === 3 ? 'onion' : 'half', 10, age === 5 ? 'neon' : false);
    finial(p, 0, h + 0.67, 0, 0.6);
  } else {
    p.cyl(0.012, 0.012, 0.7, 3, 0.2, h + 0.13, 0.2, O.darkwood);
    new Face(p, Math.PI / 2, 0.2, 0.2, h + 0.58).plane(0.22, 0.13, 0.11, 0.06, 0, O.turq);
    new Face(p, -Math.PI / 2, 0.2, 0.2, h + 0.58).plane(0.22, 0.13, -0.11, 0.06, 0, O.turq);
  }
  if (age === 5) p.add(new THREE.CylinderGeometry(R + 0.075, R + 0.075, 0.02, 12, 1, true), 0, h + 0.11, 0, O.turqL, 0, 'neon');
}

function oGate(p: Parts, age: number, v: number) {
  const { s, wall, top } = wallStyle(age), sink = 1.5, h = s.mud ? 0.95 : 1.3;
  // les deux tours qui encadrent la porte
  for (const sx of [-1, 1]) {
    if (s.mud) {
      frustum(p, 0.78, 0.98, 0.64, 0.84, h + 0.2 + sink, sx * 0.85, -sink, 0, wall);
      for (const [f, len] of faces(p, 0.64, 0.84, sx * 0.85, 0, h + 0.2)) merlons(f, len, 0, wall, 'tooth', 0.18, 0.1, 0.06);
      pinnacles(p, 0.64, 0.84, h + 0.2, wall, 0.05, 0.18, sx * 0.85);
      for (const sz of [-1, 1]) {
        const f = new Face(p, sz > 0 ? 0 : Math.PI, sx * 0.85, sz * 0.47);
        vigas(f, 0.6, h * 0.6, O.beam, 0.14, 0.06); vigas(f, 0.6, h * 0.9, O.beam, 0.14, 0.05);
        new Face(p, f.ry, sx * 0.85, sz * 0.44).plane(0.6, 0.08, 0, 0.04, 0.002, O.mudD);
        frieze(new Face(p, f.ry, sx * 0.85, sz * 0.43), 0.56, h + 0.08, O.white, 0.08);
        // dehors, sur chaque tour, un balcon de guet ajouré
        if (sz > 0) mashrabiya(new Face(p, 0, sx * 0.85, 0.455), 0, h * 0.5, 0.24, 0.16, O.wood);
      }
      // la hampe et son fanion sur chaque tour
      p.cyl(0.008, 0.01, 0.4, 3, sx * 0.85, h + 0.2, 0, O.darkwood);
      new Face(p, Math.PI / 2, sx * 0.85, 0, h + 0.5).plane(0.2, 0.11, 0.1, 0.055, 0, O.red);
      new Face(p, -Math.PI / 2, sx * 0.85, 0, h + 0.5).plane(0.2, 0.11, -0.1, 0.055, 0, O.red);
      continue;
    }
    column(p, 0.5, 0.45, h + 0.25 + sink, 12, sx * 0.85, -sink, 0, wall);
    p.cyl(0.52, 0.52, 0.1, 12, sx * 0.85, 0, 0, s.base);
    p.cyl(0.5, 0.47, 0.05, 12, sx * 0.85, h + 0.25, 0, top);
    for (const f of ring(p, 6, 0.46, sx * 0.85, 0, h + 0.3)) merlons(f, 0.2, 0, wall, age >= 4 ? 'round' : 'step', 0.2, 0.09, 0.05);
    for (const sz of [-1, 1]) { const f = new Face(p, sz > 0 ? 0 : Math.PI, sx * 0.85, sz * 0.45); win(f, 0, h * 0.6, 0.07, 0.14, s.arch, s.trim, { glow: true }); f.plane(0.03, 0.12, 0, h * 0.25, 0.004, O.hole); }
    dome(p, 0.3, 0.36, sx * 0.85, h + 0.3, 0, age === 5 ? O.glass : s.dome, age === 3 ? 'onion' : 'persian', 8, age === 5 ? 'neon' : false);
    finial(p, sx * 0.85, h + 0.66, 0, 0.7);
  }
  // le corps de la porte, son grand arc sur chaque face, le cadre de faïence, les vantaux cloutés
  p.box(1.1, h + sink, 0.84, 0, -sink, 0, wall);
  p.box(1.14, 0.04, 0.88, 0, h, 0, top);
  for (const sz of [-1, 1]) {
    const f = new Face(p, sz > 0 ? 0 : Math.PI, 0, sz * 0.42);
    if (!s.mud && age <= 4) panel(f, 0, h * 0.5, 1.0, h * 0.95, s.tiles, 0, 0.13);
    f.shape(archPts(0.66, h * 0.8, s.arch, 7), 0, 0, 0.01, s.mud ? O.mudD : s.trim);
    f.shape(archPts(0.56, h * 0.74, s.arch, 7), 0, 0, 0.014, O.hole);
    if (sz > 0) { f.shape(archPts(0.24, h * 0.62, s.arch, 5), -0.13, 0, 0.018, O.darkwood); f.shape(archPts(0.24, h * 0.62, s.arch, 5), 0.13, 0, 0.018, O.darkwood); for (let k = 0; k < 4; k++) for (const u of [-0.18, -0.08, 0.08, 0.18]) f.plane(0.015, 0.015, u, 0.1 + k * 0.12, 0.022, 0x3a3a3e); }
    merlons(f, 1.1, h + 0.04, wall, s.mud ? 'tooth' : age >= 4 ? 'round' : 'step', 0.24, 0.1, 0.05);
    if (s.mud) {
      vigas(f, 1.0, h * 0.85, O.beam, 0.14, 0.05);
      // l'arc souligné d'un bandeau peint, la frise au-dessus, deux torches qui gardent l'entrée
      f.shape(archPts(0.76, h * 0.86, s.arch, 7), 0, 0, 0.006, sz > 0 ? O.white : O.mudL);
      frieze(f, 1.0, h * 0.74, sz > 0 ? O.red : O.white, 0.08, 0.008);
      for (const sx of [-1, 1]) wallTorch(f, sx * 0.44, h * 0.45);
    }
    // gardes : deux lanternes (Médiéval à Moderne), une arche lumineuse au Futuriste
    if (!s.mud && age <= 4) for (const sx of [-1, 1]) wallLamp(f, sx * 0.38, h * 0.62);
    if (age === 5) f.shape(archPts(0.6, h * 0.78, s.arch, 7), 0, 0, 0.012, O.turqL, 'neon');
  }
  if (age === 5) { p.box(1.1, 0.02, 0.02, 0, h + 0.05, 0.44, O.turqL, 0, 'neon'); p.box(1.1, 0.02, 0.02, 0, h + 0.05, -0.44, O.turqL, 0, 'neon'); }
  // à l'Antiquité, deux palmiers devant la porte, et l'abreuvoir de pierre des caravanes
  if (s.mud) {
    for (const sx of [-1, 1]) palm(p, sx * 0.52, 0.64, 0.8 + (v + sx) % 2 * 0.1, v * 3 + sx);
    p.box(0.3, 0.07, 0.1, 0.78, 0, 0.62, O.mudD); p.box(0.26, 0.072, 0.06, 0.78, 0, 0.62, O.water);
  }
  if (age >= 2 && age <= 4) { p.cyl(0.012, 0.012, 0.6, 3, 0, h + 0.04, 0, O.darkwood); new Face(p, Math.PI / 2, 0, 0, h + 0.44).plane(0.3, 0.18, 0.15, 0.09, 0, O.turq); new Face(p, -Math.PI / 2, 0, 0, h + 0.44).plane(0.3, 0.18, -0.15, 0.09, 0, O.turq); }
}

// ---------- Les champs, hors les murs ----------

function oField(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.95, D = d * 0.95, crop = [0x8aa850, 0xc8b858, 0x6f9a4a, 0xa8b850][v % 4];
  p.box(W, 0.03, D, 0, 0, 0, 0xb89a6a);
  // une rigole d'irrigation au milieu, les planches de culture de part et d'autre
  p.box(0.1, 0.032, D - 0.1, 0, 0, 0, 0x8a7050); p.box(0.06, 0.034, D - 0.12, 0, 0, 0, O.water);
  const rows = Math.max(2, Math.round(W / 0.26));
  for (let i = 0; i < rows; i++) {
    const x = -W / 2 + (W / rows) * (i + 0.5);
    if (Math.abs(x) < 0.12) continue;
    p.box(0.12, 0.06, D - 0.18, x, 0, 0, crop);
  }
  // des palmiers-dattiers au bord, un puits à balancier (Antiquité, Médiéval), une noria (Industriel), une pompe solaire
  for (let i = 0; i < 3; i++) palm(p, -W * 0.36 + i * W * 0.36, D * 0.42, 0.6 + (i % 2) * 0.12, v + i);
  const x = W * 0.42, z = -D * 0.38;
  if (age <= 2) {
    p.cyl(0.1, 0.11, 0.08, 7, x, 0, z, O.stone);
    p.box(0.04, 0.32, 0.04, x - 0.12, 0, z, O.wood);
    p.add(new THREE.BoxGeometry(0.6, 0.025, 0.025).rotateZ(0.35), x, 0.32, z, O.wood);
    p.box(0.08, 0.06, 0.06, x - 0.4, 0.15, z, O.stone);
    p.cyl(0.003, 0.003, 0.3, 3, x + 0.24, 0.12, z, 0x3a3a3a);
  } else if (age === 3) {
    p.add(new THREE.TorusGeometry(0.2, 0.02, 3, 10), x, 0.22, z, O.wood);
    p.box(0.03, 0.42, 0.03, x, 0, z - 0.06, O.darkwood);
    p.box(0.03, 0.42, 0.03, x, 0, z + 0.06, O.darkwood);
  } else {
    p.box(0.08, 0.14, 0.08, x, 0, z, 0x8a8f94);
    p.add(new THREE.BoxGeometry(0.3, 0.012, 0.2).rotateX(-0.5), x, 0.24, z, 0x2a4a7a);
    p.cyl(0.006, 0.006, 0.24, 3, x, 0, z + 0.06, O.steel);
  }
}

// ---------- Point d'entrée ----------

/** Dessine le lot `kind` du peuple oriental dans `p` (âge 1 à 5, variante, emprise) ; `false` pour une sorte inconnue */
export function orientModel(p: Parts, kind: string, age: number, v: number, w: number, d: number): boolean {
  switch (kind) {
    case 'temple': oMosque(p, age); return true;
    case 'palace': oPalace(p, age); return true;
    case 'house': oHouse(p, age, v, w, d); return true;
    case 'market': oMarket(p, age, v); return true;
    case 'caravan': oCaravan(p, age, v); return true;
    case 'baths': oBaths(p, age, v); return true;
    case 'garden': oGarden(p, age, v, w, d); return true;
    case 'workshop': oWorkshop(p, age, v, w, d); return true;
    case 'port': oPort(p, age, v); return true;
    case 'tower': oTower(p, age, v); return true;
    case 'gate': oGate(p, age, v); return true;
    case 'field': oField(p, age, v, w, d); return true;
  }
  return false;
}
