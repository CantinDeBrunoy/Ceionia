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
  win: 0xf0cf8a, water: 0x6cc4d0, glass: 0x9fd4e0, green: 0x6f9a4a, greenD: 0x50783a, cypress: 0x3f6440, terra: 0xb4744a,
  concrete: 0xe8e4dc, steel: 0x9aa3a8, red: 0xb8483a, ochre: 0xd9a43c, rose: 0xc9767a,
};
/** Toiles des auvents et des étals */
export const AWNING = [0xc7563e, 0xd9a43c, 0x3f8f8a, 0xe9e1cf, 0x8a4f7a, 0x4f7fb0];
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
  const pts = prof[kind].map(([u, v]) => new THREE.Vector2(u * r, v * h));
  if (alt === undefined && band === undefined) { p.add(new THREE.LatheGeometry(pts, seg), x, y, z, col, 0, glow); return; }
  // côtes de deux couleurs (un fuseau sur deux) au-dessus d'une ceinture de faïence : autant de triangles qu'une coupole unie
  const k = band === undefined ? 0 : 1;
  if (k) p.add(new THREE.LatheGeometry(pts.slice(0, k + 1), seg), x, y, z, band!, 0, glow);
  const up = pts.slice(k), step = (Math.PI * 2) / seg;
  for (let i = 0; i < seg; i++) p.add(new THREE.LatheGeometry(up, 1, i * step, step), x, y, z, i % 2 && alt !== undefined ? alt : col, 0, glow);
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

// ---------- Point d'entrée ----------

/**
 * Dessine le lot `kind` du peuple oriental dans `p` (âge 1 à 5, variante, emprise) ; rend `false` si la sorte n'a pas
 * encore de modèle ici (l'ancien modèle de `townModels.ts` sert alors)
 */
export function orientModel(p: Parts, kind: string, age: number, _v: number, _w: number, _d: number): boolean {
  switch (kind) {
    case 'temple': oMosque(p, age); return true;
    case 'palace': oPalace(p, age); return true;
  }
  return false;
}
