import * as THREE from 'three';
import { Parts, type Glow } from '../parts';
import { TEAM_A, TEAM_BANNER, TEAM_EMBLEM, TEAM_FLAG, team } from '../teamPaint';
import { hash2 } from '../../core/rng';

/**
 * La tête de pont sur l'île rivale (campagne de guerre du nouveau monde) : nos bâtiments, à nos couleurs, au style de notre
 * village à l'âge donné. Infirmerie de campagne et forge du front, le fort (3 × 3, le bâtiment phare), la batterie côtière,
 * puis la ville de garnison : caserne, hôpital militaire, foyer du soldat, maisons des sous-officiers, héliport, station radar.
 * Même plan partout : origine au centre de l'emprise, 1 = une case, porte vers +z, sol à y = 0,012 (le moteur descend le
 * modèle d'autant, `sink(0.012)`) ; pas de dalle pleine, le vrai sol se voit entre les détails. Drapeaux, écus, brassards et
 * liserés au blason du joueur (sentinelles de `teamPaint.ts`). Les aides du moteur (pièces qui se balancent ou tournent, fumée,
 * personnages animés) arrivent par `FrontKit` pour ne pas importer models.ts
 */
type V3 = [number, number, number];
export type FrontPose = 'idle' | 'cheer' | 'run';
export interface FrontKit {
  /** Pièce qui se balance au vent autour de `pivot` (dessinée autour du pivot) : drapeaux, manche à air, linge */
  sway: (pivot: V3, axis: V3, amp: number, freq: number) => Parts;
  /** Pièce qui tourne sans fin autour de `axis` passant par `pivot`, à `speed` tours par seconde : radar, rotors, drones */
  turn: (pivot: V3, axis: V3, speed: number) => Parts;
  /** Fumée qui monte de (x, y, z) ; sorte : 0 foyer, 1 feu de bois, 2 forge ou moteur */
  smoke: (x: number, y: number, z: number, kind: number) => void;
  /** Personnage animé du village (`figure` de models.ts) en (x, z), tourné de `ry` ; `hair` sert de calot ou de coiffe */
  figure: (p: Parts, x: number, z: number, body: number, ry?: number, sit?: boolean, hair?: number, pose?: FrontPose, up?: number) => void;
}

const PI = Math.PI, G = 0.012;
const H = (i: number, k: number) => hash2(i, k, 151);
const dk = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const lt = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();

const IRON = 0x3c4046, STEEL = 0x474d55, GUN = 0x2f3338, OLIVE = 0x5a6444, OLIVE_D = 0x3c4630, KHAKI = 0xb8a878, CANVAS = 0xe6dcc4;
const WHITE = 0xf2f0ea, REDX = 0xc8302c, GLASS = 0xa8d4ec, WARM = 0xffe2a0, FLAME = 0xff9a3a, GOLD = 0xe8c66a, SKIN = 0xe8b894;
const WOOD = 0xb08968, DWOOD = 0x7a6355, LEAF = 0x6fa85a, LEAF_D = 0x4f8a4e, CONC = 0xb8b8b2, CONC_D = 0x8e9196, CONC_L = 0xd0d0ca;
const BRICK = 0xa8502e, BRICK_D = 0x8a3e24, TIN = 0x7c858c, ASPH = 0x5d6168;
const FWALL = 0xe4ebf1, FDARK = 0x4a5664, NEON = 0x5ae0ff, NEON_G = 0x5aff9a, FGLASS = 0x8fd4f4;
const GREY_LEGS = 0x4a4a40;

/** Tube de rayon r entre deux points du monde */
function tubeW(p: Parts, a: V3, b: V3, r: number, color: number, glow: Glow = false, seg = 4) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), L = d.length();
  if (L < 1e-4) return;
  const g = new THREE.CylinderGeometry(r, r, L, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  p.add(g, A.x + d.x / 2, A.y + d.y / 2, A.z + d.z / 2, color, 0, glow);
}

/** Repère local posé sur la parcelle : origine (x0, z0), tourné de `ry` (+z local vers (sin ry, cos ry)), au ras du sol */
class Fr {
  readonly c: number; readonly s: number;
  constructor(readonly p: Parts, readonly x0: number, readonly z0: number, readonly ry = 0, readonly y0 = G) { this.c = Math.cos(ry); this.s = Math.sin(ry); }
  X(u: number, v: number) { return this.x0 + u * this.c + v * this.s; }
  Z(u: number, v: number) { return this.z0 - u * this.s + v * this.c; }
  w(u: number, y: number, v: number): V3 { return [this.X(u, v), this.y0 + y, this.Z(u, v)]; }
  sub(u: number, v: number, ry = 0, y = 0) { return new Fr(this.p, this.X(u, v), this.Z(u, v), this.ry + ry, this.y0 + y); }
  box(w: number, h: number, d: number, u: number, y: number, v: number, color: number, glow: Glow = false, rz = 0) {
    this.p.box(w, h, d, this.X(u, v), this.y0 + y, this.Z(u, v), color, this.ry, glow, rz);
  }
  cyl(rt: number, rb: number, h: number, seg: number, u: number, y: number, v: number, color: number, glow: Glow = false) {
    this.p.cyl(rt, rb, h, seg, this.X(u, v), this.y0 + y, this.Z(u, v), color, glow, this.ry);
  }
  cone(r: number, h: number, seg: number, u: number, y: number, v: number, color: number, glow: Glow = false) { this.cyl(0, r, h, seg, u, y, v, color, glow); }
  sphere(r: number, u: number, y: number, v: number, color: number, detail = 0, sy = 1) { this.p.sphere(r, this.X(u, v), this.y0 + y, this.Z(u, v), color, detail, sy); }
  /** Boule qui peut luire (feu, voyant, néon) */
  ball(r: number, u: number, y: number, v: number, color: number, glow: Glow = false, detail = 0) { this.add(new THREE.IcosahedronGeometry(r, detail), u, y, v, color, glow); }
  add(g: THREE.BufferGeometry, u: number, y: number, v: number, color: number, glow: Glow = false) { this.p.add(g, this.X(u, v), this.y0 + y, this.Z(u, v), color, this.ry, glow); }
  /** Boîte penchée autour de l'axe x local (positif : le haut part vers +z) */
  tilt(w: number, h: number, d: number, u: number, y: number, v: number, color: number, rx: number, glow: Glow = false) {
    this.add(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0).rotateX(rx), u, y, v, color, glow);
  }
  /** Boîte penchée autour de l'axe z local (positif : le haut part vers -x) */
  roll(w: number, h: number, d: number, u: number, y: number, v: number, color: number, rz: number, glow: Glow = false) {
    this.add(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0).rotateZ(rz), u, y, v, color, glow);
  }
  /** Cylindre couché le long de l'axe local x ou z, centré en (u, y, v) */
  lying(r: number, len: number, seg: number, u: number, y: number, v: number, color: number, ax: 'x' | 'z' = 'z', glow: Glow = false, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, len, seg);
    if (ax === 'x') g.rotateZ(-PI / 2); else g.rotateX(PI / 2);
    this.add(g, u, y, v, color, glow);
  }
  tube(a: V3, b: V3, r: number, color: number, glow: Glow = false, seg = 4) { tubeW(this.p, this.w(...a), this.w(...b), r, color, glow, seg); }
  gable(w: number, h: number, d: number, u: number, y: number, v: number, color: number, rot = 0) { this.p.gable(w, h, d, this.X(u, v), this.y0 + y, this.Z(u, v), color, this.ry + rot); }
  pyramid(w: number, h: number, d: number, u: number, y: number, v: number, color: number) { this.p.pyramid(w, h, d, this.X(u, v), this.y0 + y, this.Z(u, v), color, this.ry); }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* PIÈCES COMMUNES                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Notre drapeau sur son mât : socle, hampe, pommeau, drisse, toile au blason qui flotte au vent */
function mast(f: Fr, kit: FrontKit, u: number, v: number, h: number, w = 0.2, ht = 0.11, pole = 0xdcdcd4, ball = GOLD) {
  f.cyl(0.026, 0.032, 0.03, 6, u, 0, v, dk(pole, 0.7));
  f.cyl(0.007, 0.011, h, 6, u, 0.03, v, pole);
  f.sphere(0.015, u, h + 0.04, v, ball);
  f.tube([u + 0.012, 0.06, v], [u + 0.012, h + 0.02, v], 0.0015, 0xe8e4dc, false, 3);
  const [x, y, z] = f.w(u, 0.03, v), s = kit.sway([x, 0, z], [0, 1, 0], 0.35, 0.9);
  s.box(w, ht, 0.006, w / 2 + 0.01, y + h - 0.012 - ht, 0, TEAM_FLAG);
}

/** Pavillon de la Croix-Rouge sur un mât (blanc à croix rouge, il flotte aussi) */
function crossFlag(f: Fr, kit: FrontKit, u: number, v: number, h: number, y = 0, pole = 0xdcdcd4) {
  f.cyl(0.006, 0.009, h, 5, u, y, v, pole);
  f.sphere(0.012, u, y + h + 0.008, v, pole);
  const [x, yy, z] = f.w(u, y, v), s = kit.sway([x, 0, z], [0, 1, 0], 0.3, 1.0), top = yy + h - 0.012;
  s.box(0.15, 0.1, 0.006, 0.085, top - 0.1, 0, WHITE);
  s.box(0.08, 0.022, 0.009, 0.085, top - 0.061, 0, REDX);
  s.box(0.022, 0.07, 0.009, 0.085, top - 0.085, 0, REDX);
}

/** Croix rouge sur fond blanc, face à +z du repère (s : côté du carré, y : son bas) ; `lit` : le fond luit la nuit */
function cross(f: Fr, u: number, y: number, v: number, s: number, lit: Glow = false, back = WHITE, red = REDX, redGlow: Glow = false) {
  f.box(s, s, 0.008, u, y, v, back, lit);
  f.box(s * 0.66, s * 0.2, 0.006, u, y + s * 0.4, v + 0.006, red, redGlow);
  f.box(s * 0.2, s * 0.66, 0.006, u, y + s * 0.17, v + 0.006, red, redGlow);
}
/** La même à plat (toit, bâche), posée à la hauteur y */
function crossFlat(f: Fr, u: number, y: number, v: number, s: number, back = WHITE) {
  f.box(s, 0.006, s, u, y, v, back);
  f.box(s * 0.66, 0.006, s * 0.2, u, y + 0.003, v, REDX);
  f.box(s * 0.2, 0.006, s * 0.66, u, y + 0.003, v, REDX);
}

/** Fenêtre face à +z : vitre (qui luit la nuit si `lit`), linteau, appui */
function win(f: Fr, u: number, y: number, v: number, w: number, h: number, lit: boolean, frame: number, glass = GLASS, sill = true) {
  f.box(w, h, 0.01, u, y, v, glass, lit);
  f.box(w + 0.02, 0.012, 0.022, u, y + h, v + 0.004, frame);
  if (sill) f.box(w + 0.024, 0.01, 0.028, u, y - 0.01, v + 0.006, frame);
}
/** Rangée de fenêtres le long de u, une sur trois éteinte (au hasard de `seed`) */
function winRow(f: Fr, us: number[], y: number, v: number, w: number, h: number, frame: number, glass: number, seed: number, sill = true) {
  us.forEach((u, i) => win(f, u, y, v, w, h, H(i, seed) > 0.3, frame, glass, sill));
}

/** Porte face à +z : vantail, encadrement, marche */
function door(f: Fr, u: number, v: number, w: number, h: number, leaf: number, frame: number, y = 0, step = true) {
  f.box(w, h, 0.012, u, y, v, leaf);
  f.box(w + 0.03, 0.016, 0.024, u, y + h, v + 0.004, frame);
  for (const s of [-1, 1]) f.box(0.012, h, 0.02, u + s * (w / 2 + 0.006), y, v + 0.004, frame);
  if (step) f.box(w + 0.06, 0.02, 0.05, u, 0, v + 0.03, dk(frame, 0.9));
}

/** Soldat figé (garde-à-vous, l'arme à l'épaule ou au salut) en (u, v) du repère, face à +z une fois tourné de ry */
function trooper(f: Fr, u: number, v: number, ry: number, coat: number, helm: number, o: { legs?: number; rifle?: boolean; salute?: boolean; band?: boolean; y?: number } = {}) {
  // (le grand fort : le soldat garde sa taille, à sa place agrandie)
  const g = BIG ? new Fr(BIG.p, f.X(u, v) * BIG.s, f.Z(u, v) * BIG.s, f.ry + ry, G + (f.y0 + (o.y ?? 0) - G) * BIG.sy) : f.sub(u, v, ry, o.y ?? 0), legs = o.legs ?? GREY_LEGS;
  g.box(0.02, 0.072, 0.024, -0.014, 0, 0.002, legs); g.box(0.02, 0.072, 0.024, 0.014, 0, 0.002, legs);
  g.box(0.056, 0.074, 0.036, 0, 0.068, 0, coat);
  g.box(0.058, 0.01, 0.038, 0, 0.078, 0, 0x3a3028);
  g.box(0.016, 0.064, 0.02, -0.037, 0.078, 0, coat);
  if (o.salute) g.roll(0.016, 0.06, 0.02, 0.04, 0.125, 0.012, coat, 0.9); else g.box(0.016, 0.064, 0.02, 0.037, 0.078, 0, coat);
  g.box(0.03, 0.03, 0.03, 0, 0.142, 0.002, SKIN);
  g.box(0.04, 0.02, 0.04, 0, 0.165, 0.002, helm);
  if (o.band !== false) g.box(0.018, 0.014, 0.022, -0.038, 0.12, 0, TEAM_A);
  if (o.rifle) g.box(0.008, 0.16, 0.012, 0.05, 0.05, 0.012, 0x4a3a2e);
}

/** Personnage animé du village posé en (u, v) du repère ; `cap` : sa coiffe (cheveux, calot, voile) */
function folk(f: Fr, kit: FrontKit, u: number, v: number, ry: number, body: number, cap: number, sit = false, pose: FrontPose = 'idle', up = 0) {
  kit.figure(f.p, f.X(u, v), f.Z(u, v), body, f.ry + ry, sit, cap, pose, up + f.y0 - G);
}

/** Blessé couché (sur un brancard, un lit) : jambes sous la couverture, buste, tête bandée ; le long de z, la tête vers -z */
function patient(f: Fr, u: number, y: number, v: number, ry: number, blanket: number, coat: number) {
  const g = f.sub(u, v, ry, y);
  g.box(0.05, 0.026, 0.1, 0, 0, 0.03, blanket);
  g.box(0.054, 0.03, 0.06, 0, 0, -0.05, coat);
  g.box(0.03, 0.026, 0.03, 0, 0.004, -0.095, SKIN);
  g.box(0.032, 0.012, 0.032, 0, 0.026, -0.095, WHITE);
}

/** Brancard posé au sol (montants, toile), avec ou sans blessé */
function stretcher(f: Fr, u: number, v: number, ry: number, hurt: boolean, coat = OLIVE, y = 0, canvas = 0xc8bc98) {
  const g = f.sub(u, v, ry, y);
  for (const s of [-1, 1]) g.box(0.008, 0.008, 0.28, s * 0.034, 0.024, 0, DWOOD);
  for (const a of [-0.09, 0.09]) for (const s of [-1, 1]) g.box(0.008, 0.024, 0.008, s * 0.034, 0, a, IRON);
  g.box(0.06, 0.005, 0.2, 0, 0.028, 0, canvas);
  if (hurt) patient(g, 0, 0.033, 0.01, 0, 0x8a8a6a, coat);
}

/** Caisse de bois : planches, cerclage, marquage */
function crate(f: Fr, u: number, y: number, v: number, s: number, ry = 0, c = 0xa8805a, mark = 0x5a4434) {
  const g = f.sub(u, v, ry);
  g.box(s, s * 0.8, s, 0, y, 0, c);
  g.box(s + 0.006, s * 0.1, s + 0.006, 0, y + s * 0.35, 0, dk(c, 0.75));
  g.box(s * 0.5, s * 0.2, 0.004, 0, y + s * 0.5, s / 2 + 0.002, mark);
}
/** Caisse de munitions : vert armée, liseré jaune, poignée */
function ammo(f: Fr, u: number, y: number, v: number, ry = 0, c = OLIVE) {
  const g = f.sub(u, v, ry);
  g.box(0.11, 0.042, 0.055, 0, y, 0, c);
  g.box(0.112, 0.008, 0.057, 0, y + 0.028, 0, 0xe8c64a);
  g.box(0.03, 0.008, 0.012, 0, y + 0.042, 0, dk(c, 0.6));
}
/** Pile de caisses de munitions (n de large, k de haut) */
function ammoStack(f: Fr, u: number, v: number, ry: number, n: number, k: number, c = OLIVE) {
  const g = f.sub(u, v, ry);
  for (let j = 0; j < k; j++) for (let i = 0; i < n - j; i++) ammo(g, (i - (n - j - 1) / 2) * 0.115, j * 0.044, 0, 0.04 * (H(i, j) - 0.5), c);
}
/** Fût de métal cerclé (essence, huile) */
function drum(f: Fr, u: number, v: number, c = 0x4a6a8a, y = 0) {
  f.cyl(0.032, 0.032, 0.09, 8, u, y, v, c);
  f.cyl(0.034, 0.034, 0.008, 8, u, y + 0.03, v, dk(c, 0.7));
  f.cyl(0.01, 0.01, 0.006, 5, u + 0.012, y + 0.09, v, dk(c, 0.6));
}
/** Tonneau de bois cerclé */
function barrel(f: Fr, u: number, v: number, s = 1, c = 0x9a7550) {
  f.cyl(0.045 * s, 0.04 * s, 0.1 * s, 8, u, 0, v, c);
  f.cyl(0.048 * s, 0.048 * s, 0.01 * s, 8, u, 0.02 * s, v, IRON);
  f.cyl(0.048 * s, 0.048 * s, 0.01 * s, 8, u, 0.072 * s, v, IRON);
}
/** Rangée de sacs de sable de (u0, v0) à (u1, v1), `rows` rangs croisés */
function bags(f: Fr, u0: number, v0: number, u1: number, v1: number, rows = 2, y = 0, c = 0xb8a878) {
  const L = Math.hypot(u1 - u0, v1 - v0), a = Math.atan2(u1 - u0, v1 - v0), n = Math.max(1, Math.round(L / 0.075)), l = L / n;
  for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) {
    const t = (i + 0.5 + (r % 2) * 0.5) / n;
    f.sub(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, a).box(0.05 - r * 0.004, 0.034, l - 0.008, 0, y + r * 0.033, 0, dk(c, 0.84 + 0.24 * H(i + r * 31, Math.round(L * 100))));
  }
}
/** Barbelés : piquets en croix et deux brins */
function wire(f: Fr, u0: number, v0: number, u1: number, v1: number, y = 0) {
  const L = Math.hypot(u1 - u0, v1 - v0), a = Math.atan2(u1 - u0, v1 - v0), n = Math.max(1, Math.round(L / 0.22));
  for (let i = 0; i <= n; i++) { const t = i / n, g = f.sub(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, a); g.roll(0.006, 0.09, 0.006, 0, y, 0, 0x5a5048, 0.4); g.roll(0.006, 0.09, 0.006, 0, y, 0, 0x5a5048, -0.4); }
  for (const h of [0.035, 0.065]) f.sub((u0 + u1) / 2, (v0 + v1) / 2, a).box(0.003, 0.003, L, 0, y + h, 0, 0x8a8a8a);
}

/** Buisson rond */
function bush(f: Fr, u: number, v: number, r: number, c = LEAF) { f.sphere(r, u, r * 0.55, v, c, 0, 0.75); }
/** Arbre feuillu : tronc, deux masses de feuillage */
function tree(f: Fr, u: number, v: number, s = 1, leaf = LEAF) {
  f.cyl(0.013 * s, 0.02 * s, 0.17 * s, 5, u, 0, v, 0x7a5a3c);
  f.sphere(0.1 * s, u, 0.23 * s, v, leaf, 0, 0.9);
  f.sphere(0.07 * s, u + 0.045 * s, 0.31 * s, v - 0.02 * s, lt(leaf, 0.12), 0, 0.9);
}
/** Conifère : tronc, deux étages */
function pine(f: Fr, u: number, v: number, s = 1, leaf = 0x4f7f4e) {
  f.cyl(0.012 * s, 0.016 * s, 0.08 * s, 5, u, 0, v, 0x6a4a34);
  f.cone(0.1 * s, 0.2 * s, 7, u, 0.06 * s, v, leaf);
  f.cone(0.075 * s, 0.18 * s, 7, u, 0.16 * s, v, lt(leaf, 0.08));
}
/** Herbes folles et quelques fleurs, hors des zones occupées `busy` ([u0, v0, u1, v1]) */
function tufts(f: Fr, n: number, seed: number, half: number, busy: number[][], flowers = true) {
  const free = (u: number, v: number) => !busy.some(([a, b, c, d]) => u > a && u < c && v > b && v < d);
  for (let i = 0, k = 0; i < n * 5 && k < n; i++) {
    const u = (H(i, seed) * 2 - 1) * half, v = (H(i, seed + 1) * 2 - 1) * half;
    if (!free(u, v)) continue;
    k++;
    f.cone(0.016, 0.035 + 0.025 * H(i, seed + 2), 3, u, 0, v, dk(0x6f9e4e, 0.8 + 0.35 * H(i, seed + 3)));
    if (flowers && k % 3 === 0) f.box(0.014, 0.012, 0.014, u + 0.012, 0.03, v + 0.006, [0xf2d25a, 0xece6f4, 0xd84a5a, 0x9a7ae0][k % 4]);
  }
}
/** Dalles (ou gravier) d'une allée, de (u0, v0) à (u1, v1) : petites pièces, jamais un aplat */
function path(f: Fr, u0: number, v0: number, u1: number, v1: number, w: number, color: number, seed: number, step = 0.09) {
  const L = Math.hypot(u1 - u0, v1 - v0), a = Math.atan2(u1 - u0, v1 - v0), n = Math.max(1, Math.round(L / step));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, g = f.sub(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, a);
    for (const s of w > 0.14 ? [-1, 1] : [0]) g.box(w > 0.14 ? w / 2 - 0.01 : w, 0.005, L / n - 0.012, s * w / 4 + 0.01 * (H(i, seed) - 0.5), 0, 0, dk(color, 0.88 + 0.2 * H(i * 2 + s, seed)));
  }
}

/** Réverbère : moderne (crosse et lanterne), futuriste (fût à néon), sinon bec de gaz */
function lamp(f: Fr, u: number, v: number, age: number, h = 0.3, ry = 0) {
  if (age >= 5) {
    f.cyl(0.008, 0.014, h, 6, u, 0, v, FDARK);
    f.box(0.01, h * 0.5, 0.016, u, h * 0.35, v, NEON, 'neon');
    f.ball(0.02, u, h + 0.015, v, 0xe8f8ff, 'neon');
  } else if (age === 4) {
    const g = f.sub(u, v, ry);
    g.cyl(0.007, 0.011, h, 5, 0, 0, 0, STEEL);
    g.box(0.008, 0.008, 0.07, 0, h - 0.01, 0.03, STEEL);
    g.box(0.034, 0.014, 0.05, 0, h - 0.024, 0.065, WARM, true);
    g.box(0.04, 0.008, 0.056, 0, h - 0.012, 0.065, STEEL);
  } else {
    f.cyl(0.02, 0.026, 0.03, 6, u, 0, v, IRON);
    f.cyl(0.007, 0.01, h, 5, u, 0.03, v, IRON);
    f.box(0.04, 0.012, 0.008, u, h * 0.75, v, IRON);
    f.box(0.03, 0.04, 0.03, u, h + 0.028, v, 0xfff1c9, true);
    f.pyramid(0.046, 0.026, 0.046, u, h + 0.068, v, IRON);
  }
}

/** Projecteur sur sa lyre, braqué vers +z du repère tourné de ry, penché de `tilt` */
function searchlight(f: Fr, u: number, y: number, v: number, ry: number, tilt = 0.25, body = 0x3a4048) {
  const g = f.sub(u, v, ry, y);
  g.box(0.06, 0.012, 0.04, 0, 0, 0, body);
  for (const s of [-1, 1]) g.box(0.008, 0.05, 0.012, s * 0.033, 0.012, 0, body);
  g.add(new THREE.CylinderGeometry(0.026, 0.022, 0.06, 8).rotateX(PI / 2 - tilt), 0, 0.05, 0, body);
  g.add(new THREE.CylinderGeometry(0.023, 0.023, 0.006, 8).rotateX(PI / 2 - tilt), 0, 0.05 + Math.sin(tilt) * 0.03, Math.cos(tilt) * 0.031, 0xfffbe0, true);
}

/** Jeep : caisse, capot, pare-brise, sièges, bâche, roue de secours, phares, notre écu sur les portières */
function jeep(f: Fr, u: number, v: number, ry: number, col = OLIVE, roof = true) {
  const g = f.sub(u, v, ry);
  g.box(0.11, 0.04, 0.22, 0, 0.028, 0, col);
  g.box(0.1, 0.014, 0.08, 0, 0.068, 0.068, dk(col, 0.92));
  g.box(0.104, 0.04, 0.006, 0, 0.068, 0.026, 0x9fc4dc);
  g.box(0.11, 0.006, 0.01, 0, 0.108, 0.026, dk(col, 0.7));
  g.box(0.09, 0.024, 0.04, 0, 0.068, -0.01, 0x3a3028); g.box(0.09, 0.03, 0.012, 0, 0.068, -0.03, 0x3a3028);
  if (roof) { g.box(0.108, 0.006, 0.12, 0, 0.13, -0.035, KHAKI); for (const s of [-1, 1]) g.box(0.006, 0.062, 0.006, s * 0.05, 0.068, -0.09, dk(col, 0.7)); }
  g.lying(0.026, 0.016, 8, 0, 0.06, -0.12, 0x1e1e22);
  for (const [a, b] of [[-0.058, 0.07], [0.058, 0.07], [-0.058, -0.07], [0.058, -0.07]]) g.lying(0.027, 0.02, 8, a, 0.027, b, 0x1e1e22, 'x');
  for (const s of [-1, 1]) { g.box(0.018, 0.014, 0.004, s * 0.035, 0.05, 0.112, 0xfff1c9, true); g.box(0.003, 0.03, 0.04, s * 0.056, 0.035, -0.02, TEAM_EMBLEM); }
}

/** Camion bâché (ou ambulance : caisson blanc à croix rouge), cabine vers +z du repère tourné de ry */
function truck(f: Fr, u: number, v: number, ry: number, col = OLIVE, ambulance = false) {
  const g = f.sub(u, v, ry), back = ambulance ? 0xe8e8e0 : KHAKI;
  g.box(0.13, 0.03, 0.4, 0, 0.035, 0, dk(col, 0.6));
  g.box(0.13, 0.1, 0.1, 0, 0.06, 0.14, col); g.box(0.12, 0.04, 0.006, 0, 0.11, 0.192, 0x9fc4dc);
  g.box(0.13, 0.04, 0.05, 0, 0.06, 0.205, dk(col, 0.92));
  for (const s of [-1, 1]) { g.box(0.004, 0.035, 0.06, s * 0.066, 0.1, 0.145, 0x9fc4dc); g.box(0.022, 0.016, 0.004, s * 0.04, 0.075, 0.231, 0xfff1c9, true); }
  g.box(0.14, 0.13, 0.26, 0, 0.065, -0.06, back);
  if (!ambulance) for (let i = 0; i < 4; i++) g.box(0.144, 0.006, 0.012, 0, 0.19, -0.17 + i * 0.075, dk(back, 0.8));
  else {
    for (const s of [-1, 1]) cross(g.sub(s * 0.071, -0.06, s * PI / 2), 0, 0.085, 0, 0.08);
    cross(g.sub(0, -0.191, PI), 0, 0.085, 0, 0.07);
    crossFlat(g, 0, 0.195, -0.06, 0.09);
    g.box(0.04, 0.014, 0.03, 0, 0.16, 0.14, 0x3a8aff, true);
  }
  for (const [a, b] of [[-0.066, 0.14], [0.066, 0.14], [-0.066, -0.08], [0.066, -0.08], [-0.066, -0.15], [0.066, -0.15]]) g.lying(0.03, 0.022, 8, a, 0.03, b, 0x1e1e22, 'x');
  if (!ambulance) g.box(0.003, 0.05, 0.06, 0.071, 0.09, -0.06, TEAM_EMBLEM);
}

/** Canon de campagne : affût et flèche, bouclier, bouche vers +z du repère tourné de ry, roues à rayons */
function fieldGun(f: Fr, u: number, v: number, ry: number, metal = GUN, wood = 0x6e523c, elev = 0.12) {
  const g = f.sub(u, v, ry);
  g.tilt(0.032, 0.024, 0.24, 0, 0.012, -0.1, wood, 0.22);
  g.box(0.13, 0.016, 0.022, 0, 0.055, 0, IRON);
  g.add(new THREE.CylinderGeometry(0.016, 0.024, 0.26, 8).rotateX(PI / 2 - elev), 0, 0.095, 0.06, metal);
  g.box(0.046, 0.046, 0.05, 0, 0.07, -0.05, metal);
  g.box(0.12, 0.07, 0.008, 0, 0.065, 0.0, dk(metal, 1.25));
  for (const s of [-1, 1]) {
    g.lying(0.062, 0.012, 12, s * 0.075, 0.062, 0, wood, 'x');
    g.lying(0.05, 0.014, 12, s * 0.075, 0.062, 0, dk(wood, 0.45), 'x');
    g.lying(0.016, 0.03, 6, s * 0.075, 0.062, 0, IRON, 'x');
  }
}

/** Obus en pyramide (boulets avant le Moderne) */
function shells(f: Fr, u: number, v: number, round: boolean) {
  const rows: [number, number][] = [[-1, 0], [0, 0], [1, 0], [-0.5, 1], [0.5, 1], [0, 2]];
  if (round) { for (const [k, r] of rows) f.sphere(0.018, u + k * 0.036, 0.018 + r * 0.03, v - r * 0.004, 0x2a2a2e); return; }
  for (const [k, r] of rows.slice(0, 5)) {
    const x = u + k * 0.028, y = 0.013 + r * 0.024;
    f.lying(0.013, 0.07, 6, x, y, v, 0xc8a050);
    f.add(new THREE.ConeGeometry(0.013, 0.026, 6).rotateX(PI / 2), x, y, v + 0.048, 0x6a6e72);
  }
}

/** Lanterne pendue (à une perche, une potence) : anse, cage, flamme qui luit la nuit, chapeau */
function lantern(f: Fr, u: number, y: number, v: number, cage = IRON) {
  f.box(0.004, 0.02, 0.004, u, y, v, cage);
  f.box(0.026, 0.034, 0.026, u, y - 0.036, v, 0xffc870, true);
  f.pyramid(0.034, 0.014, 0.034, u, y - 0.002, v, cage); f.box(0.03, 0.006, 0.03, u, y - 0.04, v, cage);
}
/** Pied à perfusion : socle, tige, poche */
function drip(f: Fr, u: number, v: number) {
  f.cyl(0.02, 0.022, 0.006, 5, u, 0, v, 0x8a8f96); f.cyl(0.003, 0.003, 0.2, 3, u, 0.006, v, 0xb8bcc2);
  f.box(0.04, 0.004, 0.004, u, 0.2, v, 0xb8bcc2); f.box(0.016, 0.03, 0.008, u + 0.016, 0.165, v, 0xe8f0f4);
}
/** Écran holographique sur son pied : socle sombre, plan lumineux, quelques signes */
function holo(f: Fr, u: number, v: number, ry: number, w = 0.16, c = 0x7ac8f0) {
  const g = f.sub(u, v, ry);
  g.cyl(0.03, 0.04, 0.03, 8, 0, 0, 0, FDARK); g.cyl(0.006, 0.006, 0.06, 4, 0, 0.03, 0, FDARK);
  g.box(w, w * 0.6, 0.004, 0, 0.09, 0, c, 'neon');
  for (let i = 0; i < 3; i++) g.box(w * 0.22, 0.012, 0.006, -w * 0.25 + i * w * 0.25, 0.11 + 0.02 * (i % 2), 0.002, i === 1 ? NEON_G : 0xff6a6a, 'neon');
}

/** Toit à deux pans, faîtage le long de u : pignons de la couleur du mur, deux pans qui débordent, nervures, faîtière */
function roof2(f: Fr, u: number, y: number, v: number, W: number, D: number, h: number, color: number, wall: number, ov = 0.04, ribs = 0) {
  f.gable(W, h, D, u, y, v, wall);
  const run = D / 2 + ov, a = Math.atan2(h, D / 2), L = run / Math.cos(a);
  for (const s of [-1, 1]) {
    const cv = v + s * (run / 2), cy = y + h - (run / 2) * Math.tan(a) + 0.008;
    f.add(new THREE.BoxGeometry(W + 2 * ov, 0.014, L).rotateX(s * a), u, cy, cv, color);
    for (let i = 0; i < ribs; i++) f.add(new THREE.BoxGeometry(0.008, 0.008, L).rotateX(s * a), u - W / 2 + (W * (i + 0.5)) / ribs, cy + 0.009, cv, dk(color, 0.8));
  }
  f.box(W + 2 * ov, 0.016, 0.022, u, y + h, v, dk(color, 0.7));
}

/** Cheval de trait (ou de selle) : corps, encolure, tête, crinière, pattes, queue ; face à +z du repère tourné de ry */
function horse(f: Fr, u: number, v: number, ry: number, coat = 0x7a5236, mane = 0x2a2420) {
  const g = f.sub(u, v, ry);
  g.box(0.06, 0.06, 0.16, 0, 0.075, 0, coat);
  g.tilt(0.04, 0.08, 0.04, 0, 0.11, 0.07, coat, 0.5);
  g.box(0.034, 0.034, 0.07, 0, 0.17, 0.12, dk(coat, 0.95));
  g.tilt(0.012, 0.07, 0.02, 0, 0.12, 0.06, mane, 0.5);
  for (const [a, b] of [[-0.02, 0.06], [0.02, 0.06], [-0.02, -0.06], [0.02, -0.06]]) g.box(0.016, 0.08, 0.018, a, 0, b, dk(coat, 0.85));
  g.tilt(0.012, 0.07, 0.012, 0, 0.06, -0.085, mane, -2.6);
}

/** Robot infirmier ou de service (futuriste) : socle flottant, buste en gélule, tête, œil de néon */
function robot(f: Fr, u: number, v: number, ry: number, body = FWALL, eye = NEON) {
  const g = f.sub(u, v, ry);
  g.cyl(0.022, 0.016, 0.02, 7, 0, 0.012, 0, FDARK);
  g.add(new THREE.TorusGeometry(0.02, 0.004, 3, 8).rotateX(PI / 2), 0, 0.008, 0, eye, 'neon');
  g.cyl(0.024, 0.02, 0.07, 8, 0, 0.034, 0, body);
  g.sphere(0.02, 0, 0.12, 0, body, 1);
  g.box(0.028, 0.008, 0.006, 0, 0.12, 0.018, eye, 'neon');
  for (const s of [-1, 1]) g.roll(0.008, 0.05, 0.01, s * 0.03, 0.06, 0.01, FDARK, s * 0.4);
}

/** Lit de camp (pieds de bois, toile, oreiller), avec ou sans blessé ; le long de z, la tête vers -z */
function cot(f: Fr, u: number, v: number, ry: number, hurt: boolean, wood = WOOD, blanket = 0x8a7a5a, coat = 0xe8e0d0) {
  const g = f.sub(u, v, ry);
  for (const s of [-1, 1]) g.box(0.01, 0.01, 0.24, s * 0.04, 0.05, 0, wood);
  for (const a of [-0.11, 0.11]) for (const s of [-1, 1]) g.box(0.01, 0.05, 0.01, s * 0.04, 0, a, dk(wood, 0.8));
  g.box(0.08, 0.008, 0.22, 0, 0.056, 0, 0xe8e0cc);
  g.box(0.05, 0.014, 0.03, 0, 0.064, -0.09, WHITE);
  if (hurt) patient(g, 0, 0.064, 0.02, 0, blanket, coat);
}

/** Corde à linge (bandages, draps) entre deux poteaux, les pièces flottent au vent */
function line(f: Fr, kit: FrontKit, u0: number, v0: number, u1: number, v1: number, h: number, cloth: number[], post = DWOOD) {
  for (const [u, v] of [[u0, v0], [u1, v1]]) f.cyl(0.006, 0.008, h + 0.02, 4, u, 0, v, post);
  f.tube([u0, h, v0], [u1, h, v1], 0.002, 0xe8e4dc, false, 3);
  const n = cloth.length, a = Math.atan2(v1 - v0, u1 - u0);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.7) / (n + 0.4), [x, y, z] = f.w(u0 + (u1 - u0) * t, h, v0 + (v1 - v0) * t);
    const s = kit.sway([x, y, z], [Math.cos(f.ry - a), 0, -Math.sin(f.ry - a)], 0.25, 1.1 + 0.2 * i);
    s.box(0.05, 0.06 + 0.02 * (i % 2), 0.004, 0, -0.065 - 0.02 * (i % 2), 0, cloth[i], f.ry - a);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* INFIRMERIE DE CAMPAGNE (2 × 2)                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Moyen Âge : deux tentes de toile à croix rouge, l'auvent des blessés sur leurs lits, le chaudron des tisanes, la charrette */
function infirmaryMedieval(f: Fr, kit: FrontKit) {
  const canvas = 0xe8dcc0, canvasD = 0xcdbc98, nun = 0xf0ece4, monk = 0x5a4a3e;
  // la grande tente : toile sur faîtière, pans relevés devant, coutures, croix cousue au-dessus de l'entrée, haubans et piquets
  const t = f.sub(-0.38, -0.44);
  t.gable(0.9, 0.42, 0.68, 0, 0, 0, canvas, PI / 2);
  const a = Math.atan2(0.34, 0.42), L = Math.hypot(0.34, 0.42);
  for (const s of [-1, 1]) for (const v of [-0.3, 0, 0.3]) t.add(new THREE.BoxGeometry(0.008, L, 0.012).rotateZ(s * a), s * 0.173, 0.213, v, canvasD);
  t.box(0.2, 0.25, 0.006, 0, 0, 0.452, 0x3a3026);
  for (const s of [-1, 1]) t.add(new THREE.BoxGeometry(0.12, 0.2, 0.008).translate(0, 0.1, 0).rotateY(s * 0.9), s * 0.13, 0.02, 0.47, canvasD);
  t.box(0.1, 0.03, 0.006, 0, 0.3, 0.455, REDX); t.box(0.03, 0.1, 0.006, 0, 0.265, 0.455, REDX);
  t.lying(0.008, 1.02, 4, 0, 0.42, 0, DWOOD);
  for (const v of [-0.47, 0.47]) { t.cyl(0.008, 0.01, 0.44, 4, 0, 0, v, DWOOD); t.tube([0, 0.42, v], [0, 0, v * 1.15], 0.0018, 0xc8b890, false, 3); t.box(0.012, 0.03, 0.012, 0, 0, v * 1.15, DWOOD); }
  for (const v of [-0.35, -0.1, 0.15, 0.38]) for (const s of [-1, 1]) t.box(0.01, 0.025, 0.01, s * 0.37, 0, v, DWOOD);
  const pen = kit.sway(t.w(0, 0.46, 0.47), [0, 1, 0], 0.4, 1.0);
  t.cyl(0.005, 0.005, 0.08, 4, 0, 0.42, 0.47, DWOOD);
  pen.box(0.1, 0.05, 0.005, 0.055, -0.03, 0, TEAM_FLAG);
  // la tente ronde du chirurgien : mur de toile, toit conique, porte, croix, mât et fanion
  const b = f.sub(0.5, -0.56);
  b.cyl(0.25, 0.26, 0.14, 10, 0, 0, 0, canvas);
  b.cone(0.3, 0.3, 10, 0, 0.14, 0, canvasD);
  b.box(0.1, 0.13, 0.01, 0, 0, 0.255, 0x3a3026);
  b.box(0.06, 0.018, 0.006, 0.12, 0.08, 0.23, REDX); b.box(0.018, 0.06, 0.006, 0.12, 0.059, 0.23, REDX);
  b.cyl(0.006, 0.006, 0.12, 4, 0, 0.42, 0, DWOOD);
  for (let i = 0; i < 6; i++) { const q = (i / 6) * PI * 2 + 0.3; b.tube([Math.sin(q) * 0.27, 0.14, Math.cos(q) * 0.27], [Math.sin(q) * 0.36, 0, Math.cos(q) * 0.36], 0.0016, 0xc8b890, false, 3); }
  // l'auvent des blessés : toile tendue sur quatre perches, deux lits, le moine-médecin et la sœur
  for (const [u, v] of [[-0.74, 0.08], [-0.06, 0.08], [-0.74, 0.42], [-0.06, 0.42]]) f.cyl(0.007, 0.009, 0.3, 4, u, 0, v, DWOOD);
  for (let i = 0; i < 6; i++) f.add(new THREE.BoxGeometry(0.124, 0.008, 0.4).rotateX(0.18), -0.71 + i * 0.124, 0.29, 0.25, i % 2 ? canvas : team(TEAM_A, 0.9));
  cot(f, -0.6, 0.25, 0, true, WOOD, 0x8a6a4a, team(TEAM_A, 0.8));
  cot(f, -0.2, 0.25, 0, true, WOOD, 0x6a7a5a, team(TEAM_A, 0.8));
  folk(f, kit, -0.4, 0.22, PI / 2, monk, 0x3a2e26);
  folk(f, kit, -0.4, 0.5, PI, nun, nun);
  // le feu des tisanes : pierres, bûches, flammes, chaudron sur trépied, fumée ; les bûches de réserve
  const c = f.sub(0.25, 0.15);
  for (let i = 0; i < 7; i++) { const q = (i / 7) * PI * 2; c.sub(Math.sin(q) * 0.065, Math.cos(q) * 0.065, q).box(0.035, 0.025, 0.03, 0, 0, 0, dk(0x9a948a, 0.85 + 0.25 * H(i, 7))); }
  c.lying(0.012, 0.09, 5, 0, 0.014, 0, 0x6a4a34, 'x'); c.lying(0.012, 0.09, 5, 0, 0.02, 0, 0x5a3e2c);
  c.cone(0.03, 0.08, 5, 0, 0.012, 0, FLAME, true); c.cone(0.018, 0.06, 4, 0.01, 0.016, -0.008, 0xffd060, true);
  for (let i = 0; i < 3; i++) { const q = i * 2.094; c.tube([Math.sin(q) * 0.08, 0, Math.cos(q) * 0.08], [0, 0.2, 0], 0.004, DWOOD, false, 3); }
  c.sphere(0.045, 0, 0.11, 0, 0x3a3634, 0, 0.8); c.cyl(0.036, 0.036, 0.006, 8, 0, 0.13, 0, 0x6a8a4a);
  kit.smoke(...c.w(0, 0.22, 0), 1);
  for (let i = 0; i < 3; i++) f.lying(0.016, 0.16, 6, 0.46, 0.016 + (i === 2 ? 0.026 : 0), 0.02 + (i === 2 ? 0.016 : i * 0.032), 0x7a5a3c, 'x');
  // la corde des bandages qui sèchent
  line(f, kit, 0.02, -0.1, 0.3, -0.18, 0.22, [WHITE, 0xe8e0cc, WHITE, 0xf0e8d8]);
  // le banc de rondins où attend un soldat blessé, la tête bandée ; le garde à la lance
  f.lying(0.022, 0.26, 6, 0.02, 0.022, 0.6, 0x7a5a3c, 'x');
  folk(f, kit, 0.06, 0.6, 0, team(TEAM_A, 0.85), WHITE, true);
  trooper(f, -0.82, 0.62, 0.3, team(TEAM_A, 0.9), 0x9aa3ad, { band: false, legs: 0x6a5a48 });
  f.cyl(0.004, 0.004, 0.34, 4, -0.77, 0, 0.63, DWOOD); f.cone(0.008, 0.03, 4, -0.77, 0.34, 0.63, 0xc8ccd0);
  // la table des simples : tréteaux, pots, mortier ; le tonneau d'eau et son seau
  f.box(0.24, 0.012, 0.1, 0.72, 0.1, 0.14, WOOD);
  for (const s of [-1, 1]) { f.roll(0.01, 0.1, 0.08, 0.72 + s * 0.09, 0, 0.14, DWOOD, 0.2 * s); f.roll(0.01, 0.1, 0.08, 0.72 + s * 0.09, 0, 0.14, DWOOD, -0.2 * s); }
  for (let i = 0; i < 4; i++) f.cyl(0.012, 0.014, 0.03, 6, 0.64 + i * 0.05, 0.112, 0.13 + (i % 2) * 0.03, [0xb5764f, 0x8a9a7a, 0xd8c8a0, 0x6a8aa8][i]);
  f.cyl(0.02, 0.016, 0.02, 6, 0.8, 0.112, 0.16, 0x9a948a);
  barrel(f, 0.84, -0.14); f.cyl(0.042, 0.042, 0.004, 8, 0.84, 0.1, -0.14, 0x6a9ab8);
  f.cyl(0.022, 0.018, 0.035, 6, 0.74, 0, -0.18, 0x8a6a48);
  // la charrette des blessés : plateau, ridelles, roues, brancards, paille et un brancard chargé
  const k = f.sub(0.6, 0.66, -0.5);
  k.box(0.2, 0.02, 0.3, 0, 0.07, 0, WOOD);
  for (const s of [-1, 1]) { k.box(0.006, 0.04, 0.3, s * 0.1, 0.09, 0, DWOOD); k.lying(0.06, 0.012, 10, s * 0.11, 0.06, -0.02, DWOOD, 'x'); k.lying(0.014, 0.02, 5, s * 0.118, 0.06, -0.02, IRON, 'x'); k.box(0.012, 0.012, 0.24, s * 0.07, 0.06, 0.24, DWOOD); }
  k.box(0.17, 0.02, 0.24, 0, 0.09, -0.02, 0xdcc080);
  stretcher(k, 0, 0.06, 0, true, team(TEAM_A, 0.85), 0.07);
  // palissade d'osier au fond, bottes de foin, notre drapeau, arbres, herbes et fleurs
  for (let i = 0; i < 6; i++) f.box(0.012, 0.16, 0.012, -0.92, 0, -0.9 + i * 0.12, DWOOD);
  for (const y of [0.04, 0.08, 0.12]) f.box(0.01, 0.026, 0.62, -0.92, y, -0.6, 0xb8945a);
  for (const [u, v, r] of [[0.84, 0.36, 0.3], [0.86, 0.48, -0.2]]) { f.sub(u, v, r).box(0.12, 0.07, 0.08, 0, 0, 0, 0xdcc080); f.sub(u, v, r).box(0.124, 0.006, 0.082, 0, 0.035, 0, 0xb89a50); }
  mast(f, kit, -0.9, 0.88, 0.6, 0.2, 0.11, DWOOD);
  tree(f, 0.9, -0.86, 1.1); tree(f, -0.1, -0.9, 0.9, 0x5f9a50); pine(f, -0.88, 0.25, 1);
  bush(f, 0.88, 0.0, 0.05); bush(f, 0.15, -0.88, 0.04, 0x7fb06a);
  path(f, 0.0, 0.95, -0.3, 0.5, 0.12, 0xb8a888, 11, 0.1);
  // seconde passe : les brancardiers qui arrivent par le chemin, lanternes aux perches, linge, billot et hache, poules
  { const g = f.sub(-0.1, 0.78, -2.55); trooper(g, 0, 0.1, 0, team(TEAM_A, 0.9), 0x9aa3ad, { band: false, legs: 0x6a5a48 }); trooper(g, 0, -0.1, 0, team(TEAM_A, 0.9), 0x9aa3ad, { band: false, legs: 0x6a5a48 }); stretcher(g, 0, 0, 0, true, team(TEAM_A, 0.8), 0.07); }
  lantern(f, -0.07, 0.29, 0.1); lantern(f, -0.73, 0.29, 0.1); lantern(f.sub(-0.38, -0.44), 0.0, 0.4, 0.5);
  f.cyl(0.035, 0.03, 0.04, 7, 0.36, 0, -0.24, 0xb8945a); f.cyl(0.03, 0.03, 0.006, 7, 0.36, 0.04, -0.24, WHITE);
  f.cyl(0.03, 0.034, 0.05, 7, 0.56, 0, 0.06, 0x7a5a3c); f.add(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 3).rotateZ(0.6), 0.58, 0.08, 0.06, DWOOD); f.box(0.012, 0.024, 0.03, 0.555, 0.095, 0.06, 0x8a8f96);
  for (const [u, v, r] of [[0.62, -0.3, 0.4], [0.7, -0.22, -1.2], [0.56, -0.18, 2.2]] as V3[]) { const c = f.sub(u, v, r); c.box(0.03, 0.026, 0.04, 0, 0.012, 0, 0xf4eee0); c.box(0.016, 0.02, 0.016, 0, 0.032, 0.022, 0xf4eee0); c.box(0.004, 0.01, 0.012, 0, 0.052, 0.022, REDX); c.box(0.006, 0.012, 0.006, 0, 0, 0, 0xe8a040); }
  tufts(f, 22, 301, 0.94, [[-0.8, -0.95, 0.85, 0.48], [0.1, 0.0, 0.94, 0.94], [-0.2, 0.4, 0.2, 0.75]]);
}

/** Industriel : le pavillon de brique des blessés, la tente ronde, l'ambulance hippomobile, infirmières et brancards */
function infirmaryIndustrial(f: Fr, kit: FrontKit) {
  const nurse = 0xf4f2ee, doc = 0x3a3a48, stone = 0x9a9ca0;
  // le pavillon : soubassement, brique en assises, pilastres, corniche, fenêtres allumées, porte sous marquise, croix au pignon
  const b = f.sub(-0.2, -0.56), W = 1.2, D = 0.46;
  b.box(W + 0.04, 0.05, D + 0.04, 0, 0, 0, stone);
  b.box(W, 0.26, D, 0, 0.05, 0, BRICK);
  for (let i = 1; i < 5; i++) b.box(W + 0.006, 0.006, D + 0.006, 0, 0.05 + i * 0.052, 0, dk(BRICK, 0.84 + 0.12 * H(i, 9)));
  for (const u of [-0.6, -0.3, 0.3, 0.6]) b.box(0.04, 0.26, 0.016, u, 0.05, D / 2 + 0.006, BRICK_D);
  b.box(W + 0.03, 0.02, D + 0.03, 0, 0.3, 0, 0xd8d0c0);
  winRow(b, [-0.45, -0.15, 0.15, 0.45], 0.1, D / 2 + 0.004, 0.08, 0.13, 0xe8e0d0, WARM, 12);
  winRow(b.sub(0, 0, PI), [-0.45, -0.15, 0.15, 0.45], 0.1, D / 2 + 0.004, 0.08, 0.13, 0xe8e0d0, WARM, 13);
  door(b, 0, D / 2 + 0.006, 0.1, 0.18, 0x5a4434, 0xe8e0d0);
  b.tilt(0.24, 0.01, 0.12, 0, 0.24, D / 2 + 0.06, TIN, 0.25);
  for (const s of [-1, 1]) b.tube([s * 0.1, 0.2, D / 2], [s * 0.1, 0.245, D / 2 + 0.1], 0.004, IRON);
  roof2(b, 0, 0.32, 0, W, D, 0.16, 0x6a7078, BRICK, 0.04, 10);
  cross(b.sub(W / 2 + 0.002, 0, PI / 2), 0, 0.34, 0, 0.07);
  for (const u of [-0.42, 0.42]) { b.box(0.06, 0.16, 0.06, u, 0.4, -0.08, BRICK_D); b.box(0.07, 0.012, 0.07, u, 0.56, -0.08, 0x5e2c1a); }
  kit.smoke(...b.w(-0.42, 0.58, -0.08), 0);
  crossFlag(f, kit, 0.4, -0.3, 0.36, 0, IRON);
  b.box(0.008, 0.28, 0.008, -W / 2 - 0.008, 0.04, D / 2 - 0.01, 0x5a5e62);
  // la tente ronde de triage : mur de toile, toit conique, porte relevée, croix rouge, haubans
  const t = f.sub(0.62, -0.02);
  t.cyl(0.2, 0.21, 0.13, 10, 0, 0, 0, CANVAS);
  t.cone(0.25, 0.22, 10, 0, 0.13, 0, 0xd8ccb0);
  t.box(0.09, 0.12, 0.01, -0.06, 0, 0.2, 0x3a3026);
  cross(t, 0.07, 0.035, 0.205, 0.07, false, CANVAS);
  t.cyl(0.005, 0.005, 0.1, 4, 0, 0.34, 0, IRON);
  for (let i = 0; i < 5; i++) { const q = (i / 5) * PI * 2 + 0.6; t.tube([Math.sin(q) * 0.21, 0.13, Math.cos(q) * 0.21], [Math.sin(q) * 0.3, 0, Math.cos(q) * 0.3], 0.0016, 0xc8b890, false, 3); }
  // l'auvent des brancards : bâche sur perches, trois brancards, l'infirmière, le médecin en redingote, un blessé assis
  for (const [u, v] of [[-0.85, 0.02], [-0.25, 0.02], [-0.85, 0.36], [-0.25, 0.36]]) f.cyl(0.006, 0.008, 0.26, 4, u, 0, v, IRON);
  f.add(new THREE.BoxGeometry(0.64, 0.008, 0.38).rotateX(0.15), -0.55, 0.25, 0.19, CANVAS);
  for (const u of [-0.75, -0.55, -0.35]) stretcher(f, u, 0.19, 0, u !== -0.35, team(TEAM_A, 0.8));
  folk(f, kit, -0.45, 0.06, 0, nurse, nurse);
  folk(f, kit, -0.65, 0.4, PI, doc, 0x2a2a30);
  folk(f, kit, -0.35, 0.22, -PI / 2, team(TEAM_A, 0.9), 0x2a2a30, true);
  // l'ambulance hippomobile : caisse, bâche en voûte à croix rouge, roues, cheval attelé
  const w = f.sub(0.38, 0.6, -PI / 2 + 0.15);
  w.box(0.16, 0.02, 0.3, 0, 0.07, 0, DWOOD);
  w.add(new THREE.CylinderGeometry(0.085, 0.085, 0.3, 8, 1, false, -PI / 2, PI).rotateX(PI / 2), 0, 0.09, 0, CANVAS);
  for (const s of [-1, 1]) {
    w.box(0.004, 0.05, 0.05, s * 0.086, 0.1, 0, WHITE); w.box(0.006, 0.014, 0.034, s * 0.087, 0.118, 0, REDX); w.box(0.006, 0.034, 0.012, s * 0.087, 0.108, 0, REDX);
    for (const v of [-0.1, 0.1]) { w.lying(0.06, 0.012, 10, s * 0.09, 0.06, v, DWOOD, 'x'); w.lying(0.014, 0.02, 5, s * 0.098, 0.06, v, IRON, 'x'); }
    w.box(0.008, 0.008, 0.2, s * 0.05, 0.07, 0.24, DWOOD);
  }
  horse(w, 0, 0.32, 0, 0x5a3a26);
  // becs de gaz, caisses de pansements à croix, la pompe et son abreuvoir, le drapeau, le potager
  lamp(f, -0.05, 0.55, 3, 0.3); lamp(f, 0.3, -0.25, 3, 0.3);
  for (const [u, v, r] of [[0.15, 0.2, 0.1], [0.24, 0.25, -0.3]]) crate(f, u, 0, v, 0.08, r, 0xe8e4d8, REDX);
  crate(f, 0.18, 0.064, 0.22, 0.07, 0.4, 0xe8e4d8, REDX);
  f.cyl(0.016, 0.02, 0.16, 6, 0.9, 0, 0.4, IRON); f.box(0.07, 0.01, 0.01, 0.88, 0.15, 0.4, IRON); f.box(0.07, 0.05, 0.18, 0.9, 0, 0.55, 0x8a8a84); f.box(0.06, 0.004, 0.16, 0.9, 0.05, 0.55, 0x6a9ab8);
  barrel(f, 0.86, 0.22, 0.9);
  mast(f, kit, -0.9, 0.86, 0.66, 0.2, 0.11, IRON);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) f.sphere(0.026, -0.84 + j * 0.07, 0.02, 0.55 + i * 0.08, dk(0x7aa860, 0.85 + 0.25 * H(i * 4 + j, 21)), 0, 0.7);
  for (const v of [0.5, 0.74]) f.box(0.3, 0.02, 0.012, -0.75, 0, v, DWOOD);
  tree(f, 0.9, -0.88, 1.1); tree(f, -0.92, -0.2, 0.9, 0x5f9a50); bush(f, 0.72, -0.3, 0.05); bush(f, -0.5, 0.82, 0.045, 0x7fb06a);
  path(f, 0.0, 0.95, 0.0, -0.3, 0.12, 0xa8a49a, 12, 0.1);
  // seconde passe : les brancardiers qui arrivent, le poêle de la tente qui fume, le banc des blessés qui attendent
  trooper(f, 0.07, 0.84, PI, team(TEAM_A, 0.9), 0x2a2a30, { legs: 0x4a4a5a }); trooper(f, 0.07, 0.56, PI, team(TEAM_A, 0.9), 0x2a2a30, { legs: 0x4a4a5a });
  stretcher(f, 0.07, 0.7, 0, true, team(TEAM_A, 0.8), 0.07);
  t.cyl(0.008, 0.008, 0.14, 4, 0.1, 0.2, -0.06, IRON); kit.smoke(...t.w(0.1, 0.36, -0.06), 0);
  const bn = f.sub(-0.5, -0.24); bn.box(0.22, 0.012, 0.05, 0, 0.045, 0, WOOD); bn.box(0.22, 0.05, 0.01, 0, 0.05, -0.024, WOOD); for (const d of [-0.09, 0.09]) bn.box(0.01, 0.045, 0.044, d, 0, 0, IRON);
  folk(bn, kit, -0.05, 0, 0, team(TEAM_A, 0.85), WHITE, true); folk(bn, kit, 0.06, 0, 0, team(TEAM_A, 0.85), 0x2a2a30, true);
  tufts(f, 18, 311, 0.94, [[-0.86, -0.85, 0.46, -0.28], [-0.88, -0.02, -0.2, 0.42], [0.36, -0.26, 0.86, 0.22], [0.05, 0.35, 0.7, 0.9], [-0.08, -0.3, 0.08, 0.95]]);
}

/** Module préfabriqué posé sur plots : panneaux à joints, corniche, bandeau bas ; rend son repère (centre au sol) */
function prefab(f: Fr, u: number, v: number, W: number, D: number, h: number, panel: number, trim: number, ry = 0) {
  const g = f.sub(u, v, ry), n = Math.max(2, Math.round(W / 0.14));
  for (const a of [-W / 2 + 0.06, W / 2 - 0.06]) for (const b of [-D / 2 + 0.05, D / 2 - 0.05]) g.box(0.05, 0.04, 0.05, a, 0, b, CONC_D);
  g.box(W, h, D, 0, 0.04, 0, panel);
  for (let i = 1; i < n; i++) g.box(0.006, h, D + 0.006, -W / 2 + (i * W) / n, 0.04, 0, dk(panel, 0.86));
  g.box(W + 0.02, 0.02, D + 0.02, 0, 0.04 + h, 0, trim);
  g.box(W + 0.024, 0.012, D + 0.024, 0, 0.04, 0, trim);
  return g;
}
/** Marches de métal et rampe devant une porte (face à +z), du sol à la hauteur y */
function stairs(f: Fr, u: number, v: number, y: number, w = 0.1, rail = STEEL) {
  const n = Math.max(1, Math.round(y / 0.022));
  for (let i = 0; i < n; i++) f.box(w, 0.008, 0.03, u, y - (i + 1) * (y / n) + 0.004, v + 0.015 + i * 0.028, 0x6a6e72);
  for (const s of [-1, 1]) f.tube([u + s * w / 2, y + 0.06, v], [u + s * w / 2, 0.06, v + n * 0.028 + 0.02], 0.003, rail, false, 3);
}
/** Groupe électrogène : caisson, ouïes, pot d'échappement qui fume, câble */
function generator(f: Fr, kit: FrontKit, u: number, v: number, ry: number, col = OLIVE) {
  const g = f.sub(u, v, ry);
  g.box(0.16, 0.012, 0.1, 0, 0, 0, IRON);
  g.box(0.15, 0.09, 0.09, 0, 0.012, 0, col);
  for (let i = 0; i < 4; i++) g.box(0.004, 0.06, 0.092, -0.05 + i * 0.022, 0.025, 0, dk(col, 0.7));
  g.box(0.04, 0.02, 0.01, 0.04, 0.06, 0.046, 0x2a2e32); g.box(0.01, 0.01, 0.004, 0.03, 0.065, 0.05, 0x5aff7a, true);
  g.cyl(0.008, 0.008, 0.08, 5, 0.05, 0.1, -0.02, 0x3a3a3e);
  kit.smoke(...g.w(0.05, 0.19, -0.02), 2);
}

/** Moderne : deux modules préfabriqués, la tente-tunnel à croix rouge, l'ambulance, un blessé porté sur son brancard */
function infirmaryModern(f: Fr, kit: FrontKit) {
  const panel = 0xe8e6de, trim = 0x7a8a6a, medic = 0xeeeeea;
  // module des soins : fenêtres, porte et ses marches, climatiseur, croix rouge sur le toit et au mur, pavillon de la Croix-Rouge
  const a = prefab(f, -0.42, -0.6, 0.86, 0.4, 0.24, panel, trim);
  winRow(a, [-0.3, -0.12, 0.26], 0.12, 0.204, 0.1, 0.08, trim, GLASS, 31);
  winRow(a.sub(0, 0, PI), [-0.3, -0.06, 0.18, 0.32], 0.12, 0.204, 0.1, 0.08, trim, GLASS, 32);
  door(a, 0.08, 0.204, 0.08, 0.18, 0x6a7a6a, trim, 0.04, false); stairs(a, 0.08, 0.21, 0.04);
  a.box(0.06, 0.012, 0.03, 0.08, 0.245, 0.22, 0xfff1c9, true);
  crossFlat(a, -0.12, 0.3, 0, 0.2);
  a.box(0.03, 0.1, 0.12, -0.46, 0.1, 0, 0xd8d8d0); for (let i = 0; i < 3; i++) a.box(0.032, 0.006, 0.1, -0.46, 0.12 + i * 0.025, 0, 0x8a8f96);
  crossFlag(a, kit, 0.36, -0.12, 0.3, 0.3, STEEL);
  // module de la pharmacie : fenêtres, porte, croix au mur, antenne et son feu, câble du groupe
  const b = prefab(f, 0.5, -0.66, 0.68, 0.36, 0.22, 0xdcdad0, trim);
  winRow(b, [0.0, 0.22], 0.12, 0.184, 0.1, 0.07, trim, GLASS, 33);
  door(b, -0.2, 0.184, 0.08, 0.17, 0x6a7a6a, trim, 0.04, false); stairs(b, -0.2, 0.19, 0.04);
  cross(b, 0.11, 0.12, 0.186, 0.08);
  b.cyl(0.004, 0.006, 0.36, 4, 0.28, 0.28, -0.1, STEEL); b.ball(0.01, 0.28, 0.65, -0.1, 0xff4a4a, true);
  b.box(0.12, 0.06, 0.09, -0.18, 0.28, -0.06, 0xd0d0c8); b.cyl(0.03, 0.03, 0.01, 8, -0.18, 0.34, -0.06, 0x3c4048);
  generator(f, kit, 0.86, -0.22, -PI / 2);
  f.tube([0.82, 0.03, -0.22], [0.7, 0.03, -0.46], 0.004, 0x2a2a2e, false, 3);
  // la tente-tunnel : voûte de toile verte sur arceaux, porte, croix sur le dos, piquets et haubans
  const t = f.sub(-0.52, 0.2);
  t.add(new THREE.CylinderGeometry(0.2, 0.2, 0.46, 10, 1, false, 0, PI).rotateZ(PI / 2).rotateY(PI / 2), 0, 0, 0, OLIVE);
  for (const v of [-0.16, 0, 0.16]) t.add(new THREE.TorusGeometry(0.203, 0.006, 3, 8, PI), 0, 0, v, OLIVE_D);
  t.box(0.12, 0.15, 0.006, 0, 0, 0.232, 0x2a2e26); t.box(0.14, 0.012, 0.01, 0, 0.15, 0.234, OLIVE_D);
  cross(t, 0, 0.165, 0.232, 0.05);
  crossFlat(t, 0, 0.198, -0.05, 0.13);
  for (const s of [-1, 1]) for (const v of [-0.16, 0.16]) { t.tube([s * 0.17, 0.1, v], [s * 0.3, 0, v], 0.0016, 0x8a8a7a, false, 3); t.box(0.01, 0.02, 0.01, s * 0.3, 0, v, 0x5a5048); }
  // l'ambulance de l'armée, garée, et le blessé que deux soldats portent vers la tente
  truck(f, 0.46, 0.3, -0.4, OLIVE, true);
  trooper(f, -0.12, 0.66, PI, OLIVE, OLIVE_D, { legs: OLIVE_D });
  trooper(f, -0.12, 0.38, PI, OLIVE, OLIVE_D, { legs: OLIVE_D });
  stretcher(f, -0.12, 0.52, 0, true, OLIVE, 0.07);
  // médecins et infirmiers, un blessé assis sur une caisse, la tête bandée
  folk(f, kit, -0.25, 0.48, PI / 2, medic, medic);
  folk(f, kit, 0.12, 0.08, -0.6, medic, 0x2a2a2e);
  crate(f, 0.0, 0, -0.12, 0.08, 0.2, 0x7a8a5a, WHITE); folk(f, kit, 0.0, -0.12, 0.3, OLIVE, WHITE, true, 'idle', 0.012);
  // sacs de sable aux coins, fûts et jerricans, réverbères, notre drapeau, haie, arbres, herbes
  bags(f, 0.62, 0.92, 0.92, 0.92, 2); bags(f, 0.93, 0.88, 0.93, 0.6, 2);
  bags(f, -0.93, -0.1, -0.93, -0.36, 2);
  for (const [u, v, c] of [[0.86, 0.02, 0x4a6a3a], [0.8, 0.08, 0x4a6a3a], [0.88, 0.12, 0x8a3a2a]] as V3[]) drum(f, u, v, c);
  for (let i = 0; i < 3; i++) f.box(0.03, 0.05, 0.045, 0.7 + i * 0.035, 0, 0.12, OLIVE_D);
  lamp(f, 0.1, 0.62, 4, 0.32, -0.4); lamp(f, -0.86, -0.3, 4, 0.32, 0.6);
  mast(f, kit, -0.88, 0.86, 0.72, 0.22, 0.12);
  tree(f, -0.88, 0.5, 1.0); tree(f, 0.9, -0.92, 0.9, 0x5f9a50); bush(f, -0.7, 0.62, 0.05); bush(f, 0.25, 0.86, 0.045); bush(f, 0.0, -0.9, 0.05, 0x7fb06a);
  path(f, 0.1, 0.95, 0.0, -0.36, 0.14, 0x9a9a92, 14, 0.1);
  // seconde passe : perfusion près de la tente, bouteilles d'oxygène, panneau à croix sur son poteau
  drip(f, -0.36, 0.42);
  for (const d of [0, 0.04]) { f.cyl(0.014, 0.014, 0.1, 6, -0.3 + d, 0, -0.32, 0x3a8a4a); f.sphere(0.014, -0.3 + d, 0.1, -0.32, 0x3a8a4a); }
  f.box(0.012, 0.24, 0.012, 0.22, 0, 0.86, STEEL); cross(f.sub(0.22, 0.868), 0, 0.17, 0, 0.09);
  tufts(f, 18, 321, 0.94, [[-0.9, -0.84, 0.86, -0.4], [-0.78, -0.04, -0.24, 0.44], [0.2, 0.05, 0.74, 0.58], [-0.22, 0.3, 0.2, 0.95], [0.55, 0.55, 0.95, 0.95]]);
}

/** Futuriste : le module de soins aux bouts arrondis, capsules de guérison sous arceaux, ambulance volante, drone, robots */
function infirmaryFuture(f: Fr, kit: FrontKit) {
  const medic = 0xf4f8fa, W = 1.0, D = 0.42, h = 0.28;
  // le module : socle sombre, coque blanche, bouts en demi-tours, baies lumineuses, liserés, croix verte au néon
  const m = f.sub(-0.05, -0.56);
  m.box(W + 0.06, 0.03, D + 0.04, 0, 0, 0, FDARK);
  m.box(W, h, D, 0, 0.03, 0, FWALL);
  for (const s of [-1, 1]) { m.cyl(D / 2, D / 2, h, 12, s * W / 2, 0.03, 0, FWALL); m.cyl(D / 2 + 0.004, D / 2 + 0.004, 0.01, 12, s * W / 2, 0.03 + h - 0.04, 0, NEON, 'neon'); }
  for (const s of [-1, 1]) { m.box(0.34, 0.09, 0.008, s * 0.3, 0.13, D / 2 + 0.002, FGLASS, 'neon'); for (let i = 0; i < 4; i++) m.box(0.008, 0.09, 0.012, s * 0.3 - 0.17 + i * 0.113, 0.13, D / 2 + 0.004, FDARK); }
  m.box(W, 0.01, 0.006, 0, h - 0.01, D / 2 + 0.003, NEON, 'neon'); m.box(W, 0.008, 0.006, 0, 0.05, D / 2 + 0.003, NEON, 'neon');
  m.box(0.14, 0.2, 0.01, 0, 0.03, D / 2 + 0.004, FGLASS, 'neon'); m.box(0.004, 0.2, 0.014, 0, 0.03, D / 2 + 0.006, FDARK);
  cross(m, 0, 0.235, D / 2 + 0.006, 0.07, false, FDARK, NEON_G, 'neon');
  m.box(W - 0.06, 0.03, D - 0.1, 0, 0.03 + h, 0, 0xd8e2ea);
  m.cyl(0.11, 0.11, 0.012, 12, 0.3, 0.06 + h, 0, FDARK); m.add(new THREE.TorusGeometry(0.09, 0.005, 3, 14).rotateX(PI / 2), 0.3, 0.074 + h, 0, NEON_G, 'neon');
  m.box(0.08, 0.004, 0.024, 0.3, 0.074 + h, 0, NEON_G, 'neon'); m.box(0.024, 0.004, 0.08, 0.3, 0.074 + h, 0, NEON_G, 'neon');
  for (const u of [-0.32, -0.12]) { m.add(new THREE.BoxGeometry(0.16, 0.008, 0.12).rotateX(-0.3), u, 0.09 + h, -0.04, 0x2a4a8a); m.add(new THREE.BoxGeometry(0.16, 0.004, 0.008).rotateX(-0.3), u, 0.096 + h, -0.04, NEON, 'neon'); }
  // les capsules de guérison : socle, couchette, patient, deux arceaux de néon, écran holographique
  for (let i = 0; i < 3; i++) {
    const c = f.sub(-0.7 + i * 0.24, 0.2);
    c.box(0.1, 0.04, 0.24, 0, 0, 0, FDARK); c.box(0.11, 0.01, 0.25, 0, 0.04, 0, FWALL); c.box(0.112, 0.004, 0.252, 0, 0.03, 0, NEON, 'neon');
    patient(c, 0, 0.05, 0.02, 0, 0xcfe8f4, team(TEAM_A, 0.8));
    for (const v of [-0.06, 0.08]) c.add(new THREE.TorusGeometry(0.06, 0.005, 3, 10, PI), 0, 0.05, v, NEON_G, 'neon');
    c.cyl(0.006, 0.006, 0.12, 4, 0.07, 0, -0.1, FDARK); c.box(0.06, 0.04, 0.004, 0.07, 0.12, -0.1, NEON, 'neon');
  }
  // l'ambulance volante en vol stationnaire au-dessus de son aire, ses patins lumineux
  const pad = f.sub(0.55, 0.42);
  pad.cyl(0.2, 0.21, 0.014, 14, 0, 0, 0, FDARK); pad.add(new THREE.TorusGeometry(0.17, 0.006, 3, 18).rotateX(PI / 2), 0, 0.016, 0, NEON_G, 'neon');
  pad.box(0.08, 0.004, 0.026, 0, 0.016, 0, NEON_G, 'neon'); pad.box(0.026, 0.004, 0.08, 0, 0.016, 0, NEON_G, 'neon');
  const hv = kit.sway(pad.w(0, 0.18, 0), [1, 0, 0], 0.03, 0.45), q = new Fr(hv, 0, 0, pad.ry - 0.5, 0);
  q.box(0.12, 0.06, 0.26, 0, -0.03, -0.02, FWALL); q.add(new THREE.SphereGeometry(0.06, 8, 5).scale(1, 0.55, 1.4), 0, 0.0, 0.1, FGLASS, 'neon');
  q.box(0.124, 0.01, 0.2, 0, 0.0, -0.04, NEON_G, 'neon');
  for (const s of [-1, 1]) { cross(q.sub(s * 0.062, -0.06, s * PI / 2), 0, -0.02, 0, 0.05, false, WHITE, REDX); q.cyl(0.03, 0.03, 0.012, 8, s * 0.08, -0.045, 0.06, FDARK); q.cyl(0.024, 0.024, 0.004, 8, s * 0.08, -0.05, 0.06, NEON, 'neon'); q.cyl(0.03, 0.03, 0.012, 8, s * 0.08, -0.045, -0.1, FDARK); q.cyl(0.024, 0.024, 0.004, 8, s * 0.08, -0.05, -0.1, NEON, 'neon'); }
  // le drone médical qui fait le tour du camp
  const dr = new Fr(kit.turn(f.w(0, 0.62, -0.1), [0, 1, 0], 0.12), 0, 0, 0, 0);
  dr.cyl(0.04, 0.03, 0.02, 8, 0.45, 0, 0, FWALL); dr.add(new THREE.TorusGeometry(0.045, 0.004, 3, 10).rotateX(PI / 2), 0.45, 0.01, 0, NEON_G, 'neon');
  dr.box(0.03, 0.004, 0.01, 0.45, 0.022, 0, NEON_G, 'neon'); dr.box(0.01, 0.004, 0.03, 0.45, 0.022, 0, NEON_G, 'neon');
  for (const s of [-1, 1]) dr.box(0.1, 0.004, 0.008, 0.45, 0.01, s * 0.03, FDARK);
  // robots et médecins, un soldat guéri qui repart, bancs, jardinières, lampadaires, notre drapeau
  robot(f, -0.58, 0.42, 0.4); robot(f, -0.34, 0.0, PI, FWALL, NEON_G);
  folk(f, kit, -0.12, 0.3, -PI / 2, medic, 0xdfe8f0); folk(f, kit, 0.2, -0.08, 0.4, medic, 0x3a3a48);
  trooper(f, 0.15, 0.78, 0.5, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8 });
  for (const [u, v, r] of [[-0.78, 0.68, 0], [0.84, -0.12, PI / 2]] as V3[]) {
    const g = f.sub(u, v, r);
    g.box(0.2, 0.05, 0.08, 0, 0, 0, FDARK); g.box(0.204, 0.006, 0.084, 0, 0.05, 0, NEON, 'neon');
    for (const k of [-0.06, 0.0, 0.06]) g.sphere(0.03, k, 0.08, 0, dk(0x5ac88a, 0.9 + 0.1 * k * 10), 0, 0.9);
  }
  f.box(0.16, 0.012, 0.05, -0.36, 0.05, 0.72, FWALL); f.box(0.16, 0.04, 0.01, -0.36, 0.05, 0.7, FWALL); f.box(0.12, 0.05, 0.04, -0.36, 0, 0.72, FDARK);
  lamp(f, 0.24, 0.66, 5, 0.34); lamp(f, -0.86, -0.12, 5, 0.34);
  mast(f, kit, -0.88, 0.9, 0.74, 0.22, 0.12, FWALL, NEON);
  tree(f, 0.9, -0.88, 1.0, 0x5ab87a); tree(f, -0.9, 0.36, 0.85, 0x5ab87a); bush(f, 0.45, -0.9, 0.05, 0x5ac88a);
  path(f, 0.0, 0.95, -0.05, -0.32, 0.14, 0xc8d4dc, 15, 0.1);
  // seconde passe : l'écran de suivi des capsules, les bordures lumineuses de l'allée, notre bannière au flanc du module
  holo(f, -0.4, 0.45, 0, 0.18, 0x7ae8b0);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) f.box(0.012, 0.012, 0.08, -0.05 + s * 0.1, 0, 0.0 + i * 0.22, NEON, 'neon');
  m.sub(-W / 2 - D / 2 - 0.002, 0, -PI / 2).box(0.12, 0.18, 0.006, 0, 0.06, 0, TEAM_BANNER); m.sub(-W / 2 - D / 2 - 0.004, 0, -PI / 2).box(0.12, 0.01, 0.008, 0, 0.24, 0, NEON, 'neon');
  tufts(f, 14, 331, 0.94, [[-0.92, -0.84, 0.82, -0.3], [-0.84, 0.04, 0.0, 0.36], [0.32, 0.18, 0.78, 0.66], [-0.14, -0.3, 0.14, 0.95], [-0.9, 0.6, -0.66, 0.76], [0.76, -0.24, 0.92, 0.0]], false);
}

/** L'infirmerie de campagne de la tête de pont (2 × 2), du Moyen Âge (2) au futuriste (5) */
export function frontInfirmary(p: Parts, age: number, kit: FrontKit) {
  const f = new Fr(p, 0, 0);
  if (age <= 2) infirmaryMedieval(f, kit);
  else if (age === 3) infirmaryIndustrial(f, kit);
  else if (age === 4) infirmaryModern(f, kit);
  else infirmaryFuture(f, kit);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* FORGE DU FRONT (2 × 2)                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Enclume sur son billot */
function anvil(f: Fr, u: number, v: number, ry = 0) {
  const g = f.sub(u, v, ry);
  g.cyl(0.034, 0.04, 0.06, 7, 0, 0, 0, 0x6a4a34);
  g.box(0.046, 0.016, 0.03, 0, 0.06, 0, 0x2a2c30); g.box(0.026, 0.016, 0.02, 0, 0.076, 0, 0x2a2c30); g.box(0.07, 0.018, 0.032, -0.006, 0.092, 0, 0x34373c);
  g.add(new THREE.ConeGeometry(0.012, 0.04, 5).rotateZ(-PI / 2), 0.048, 0.101, 0, 0x34373c);
}
/** Râtelier de fusils (ou de lances) contre rien : montants, traverses, armes debout */
function rifleRack(f: Fr, u: number, v: number, ry: number, n: number, wood = DWOOD, arm = 0x5a4434) {
  const g = f.sub(u, v, ry), w = n * 0.035 + 0.03;
  for (const s of [-1, 1]) g.box(0.012, 0.2, 0.03, s * w / 2, 0, 0, wood);
  g.box(w, 0.012, 0.03, 0, 0.04, 0, wood); g.box(w, 0.012, 0.012, 0, 0.16, -0.01, wood);
  for (let i = 0; i < n; i++) { const x = -w / 2 + 0.03 + i * 0.035; g.box(0.008, 0.16, 0.012, x, 0.045, 0.004, arm); g.box(0.005, 0.04, 0.005, x, 0.2, 0.004, IRON); }
}
/** Établi : plateau, pieds, étau, outils posés */
function bench(f: Fr, u: number, v: number, ry: number, top = WOOD, leg = DWOOD) {
  const g = f.sub(u, v, ry);
  g.box(0.24, 0.014, 0.09, 0, 0.09, 0, top);
  for (const s of [-1, 1]) for (const t of [-1, 1]) g.box(0.012, 0.09, 0.012, s * 0.1, 0, t * 0.035, leg);
  g.box(0.22, 0.008, 0.07, 0, 0.03, 0, leg);
  g.box(0.03, 0.03, 0.03, 0.08, 0.104, 0.03, 0x3a5a7a); g.box(0.04, 0.006, 0.006, 0.08, 0.12, 0.05, IRON);
  g.box(0.05, 0.006, 0.012, -0.05, 0.104, 0.0, IRON); g.box(0.014, 0.014, 0.02, -0.075, 0.104, 0.0, 0x5a4434); g.box(0.04, 0.008, 0.008, 0.0, 0.104, -0.02, 0xc83a2a);
}
/** Pile de pneus */
function tires(f: Fr, u: number, v: number, n: number) {
  for (let i = 0; i < n; i++) { f.cyl(0.04, 0.04, 0.026, 10, u + 0.004 * (i % 2), i * 0.026, v, 0x24262a); f.cyl(0.022, 0.022, 0.028, 8, u + 0.004 * (i % 2), i * 0.026, v, 0x3a3c40); }
}

/** Industriel : l'atelier de brique ouvert sur sa forge, l'appentis du maréchal, le canon en réparation, munitions et charbon */
function forgeIndustrial(f: Fr, kit: FrontKit) {
  const stone = 0x9a9ca0, smith = 0x4a3a30;
  // l'atelier : soubassement, brique en assises, chaînages, grande baie ouverte où luit la forge, fenêtres, enseigne, toit de tôle
  const b = f.sub(-0.32, -0.56), W = 1.1, D = 0.56;
  b.box(W + 0.04, 0.04, D + 0.04, 0, 0, 0, stone);
  b.box(W, 0.3, D, 0, 0.04, 0, BRICK);
  for (let i = 1; i < 6; i++) b.box(W + 0.006, 0.006, D + 0.006, 0, 0.04 + i * 0.05, 0, dk(BRICK, 0.84 + 0.12 * H(i, 41)));
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) b.box(0.04, 0.05, 0.04, s * (W / 2 - 0.015), 0.045 + i * 0.06, D / 2 - 0.015, i % 2 ? BRICK_D : stone);
  b.box(0.36, 0.24, 0.006, -0.12, 0.04, D / 2 + 0.003, 0x241c18);
  b.box(0.2, 0.06, 0.006, -0.12, 0.06, D / 2 + 0.007, FLAME, true); b.box(0.1, 0.03, 0.006, -0.08, 0.12, D / 2 + 0.008, 0xffd060, true);
  b.box(0.42, 0.04, 0.03, -0.12, 0.28, D / 2 + 0.01, stone); b.box(0.04, 0.05, 0.034, -0.12, 0.275, D / 2 + 0.012, 0xd8d0c0);
  for (const s of [-1, 1]) b.box(0.03, 0.24, 0.03, -0.12 + s * 0.195, 0.04, D / 2 + 0.01, stone);
  win(b, 0.25, 0.12, D / 2 + 0.004, 0.09, 0.12, true, stone, WARM); win(b, 0.42, 0.12, D / 2 + 0.004, 0.09, 0.12, false, stone, WARM);
  winRow(b.sub(0, 0, PI), [-0.3, 0.0, 0.3], 0.14, D / 2 + 0.004, 0.09, 0.1, stone, WARM, 42);
  b.box(0.22, 0.06, 0.012, 0.33, 0.27, D / 2 + 0.01, 0x3a2e24); for (const s of [-1, 1]) b.roll(0.012, 0.05, 0.004, 0.33, 0.275, D / 2 + 0.018, 0xc8b060, s * 0.7);
  roof2(b, 0, 0.34, 0, W, D, 0.17, 0x6a7078, BRICK, 0.04, 11);
  b.box(0.1, 0.5, 0.1, -0.38, 0.3, -0.12, BRICK_D); b.box(0.12, 0.03, 0.12, -0.38, 0.8, -0.12, 0x5e2c1a); for (const y of [0.5, 0.66]) b.box(0.104, 0.012, 0.104, -0.38, y, -0.12, IRON);
  kit.smoke(...b.w(-0.38, 0.85, -0.12), 2);
  // l'appentis du maréchal : poteaux, tôle penchée, foyer de brique et sa braise, hotte et conduit qui fume, soufflet, enclume, baquet
  const s = f.sub(0.58, -0.42);
  for (const [a, c] of [[-0.26, -0.2], [0.26, -0.2], [-0.26, 0.2], [0.26, 0.2]]) s.box(0.024, 0.32, 0.024, a, 0, c, DWOOD);
  s.tilt(0.62, 0.014, 0.5, 0, 0.31, 0, TIN, 0.15); for (let i = 0; i < 6; i++) s.tilt(0.008, 0.008, 0.5, -0.26 + i * 0.104, 0.323, 0, dk(TIN, 0.75), 0.15);
  s.box(0.22, 0.1, 0.16, 0.08, 0, -0.1, BRICK); s.box(0.23, 0.012, 0.17, 0.08, 0.1, -0.1, stone);
  s.box(0.14, 0.012, 0.1, 0.08, 0.112, -0.1, FLAME, true); s.ball(0.02, 0.06, 0.13, -0.1, 0xffd060, true);
  s.pyramid(0.2, 0.08, 0.16, 0.08, 0.2, -0.1, IRON); s.cyl(0.018, 0.018, 0.2, 6, 0.08, 0.27, -0.1, IRON);
  kit.smoke(...s.w(0.08, 0.5, -0.1), 2);
  s.tilt(0.06, 0.012, 0.1, -0.08, 0.05, -0.1, 0x6a4a34, 0.2); s.tilt(0.06, 0.012, 0.1, -0.08, 0.04, -0.1, 0x6a4a34, -0.1); s.box(0.012, 0.012, 0.06, -0.08, 0.06, -0.02, DWOOD);
  anvil(s, -0.02, 0.08, 0.3);
  folk(s, kit, -0.12, 0.1, PI / 2, smith, 0x2a2420);
  s.box(0.16, 0.05, 0.07, 0.18, 0, 0.12, DWOOD); s.box(0.15, 0.004, 0.06, 0.18, 0.05, 0.12, 0x4a6a7a);
  for (let i = 0; i < 4; i++) s.box(0.006, 0.07, 0.01, 0.23 - i * 0.02, 0.15, 0.2, i % 2 ? IRON : 0x5a4434);
  // devant : le canon en réparation (une roue démontée à plat), l'artilleur, la roue neuve contre le mur
  fieldGun(f, -0.42, 0.3, 0.6);
  f.cyl(0.062, 0.062, 0.012, 12, -0.18, 0, 0.42, 0x6e523c); for (let i = 0; i < 3; i++) f.sub(-0.18, 0.42, (i * PI) / 3).box(0.11, 0.006, 0.008, 0, 0.012, 0, 0x5a4030); f.cyl(0.016, 0.016, 0.02, 6, -0.18, 0.012, 0.42, IRON);
  trooper(f, -0.26, 0.56, -2.4, team(TEAM_A, 0.9), 0x2a2a30, { legs: 0x4a4a5a });
  folk(f, kit, -0.6, 0.5, 0.8, 0x6a5a48, 0x3a2e26);
  // munitions : caisses marquées, obus, tonneaux de poudre ; tas de charbon, râtelier, meule, établi
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3 - j; i++) crate(f, 0.18 + i * 0.09 + j * 0.045, j * 0.072, 0.1, 0.085, 0.05 * (i - 1), 0x9a7a52, 0x2a2420);
  shells(f, 0.5, 0.16, false);
  for (const [u, v] of [[0.82, 0.12], [0.86, 0.24], [0.76, 0.24]]) barrel(f, u, v, 0.85, 0x5a4636);
  for (let i = 0; i < 6; i++) f.sphere(0.04 + 0.01 * (i % 2), 0.82 + 0.05 * Math.sin(i * 2.3), 0.01, -0.85 + 0.04 * Math.cos(i * 1.7), 0x26262a, 0, 0.55);
  rifleRack(f, -0.84, -0.12, PI / 2, 5);
  const gs = f.sub(0.12, 0.62, 0.3);
  gs.lying(0.055, 0.016, 12, 0, 0.09, 0, 0x9a9488, 'x'); gs.lying(0.006, 0.08, 4, 0, 0.09, 0, IRON, 'x');
  for (const s2 of [-1, 1]) gs.box(0.01, 0.09, 0.05, s2 * 0.025, 0, 0, DWOOD); gs.box(0.06, 0.03, 0.06, 0, 0, 0.05, 0x4a6a7a);
  bench(f, 0.45, 0.48, -0.2);
  // la charrette de livraison, le drapeau, le bec de gaz, arbres, herbes
  const k = f.sub(0.7, 0.74, -PI / 2 + 0.3);
  k.box(0.16, 0.02, 0.26, 0, 0.06, 0, WOOD);
  for (const s2 of [-1, 1]) { k.box(0.006, 0.04, 0.26, s2 * 0.08, 0.08, 0, DWOOD); k.lying(0.055, 0.012, 10, s2 * 0.09, 0.055, -0.02, DWOOD, 'x'); k.box(0.01, 0.01, 0.2, s2 * 0.05, 0.05, 0.22, DWOOD); }
  crate(k, -0.03, 0.08, -0.05, 0.07, 0.1, 0x9a7a52); crate(k, 0.03, 0.08, 0.06, 0.06, -0.2, 0x9a7a52);
  mast(f, kit, -0.9, 0.88, 0.66, 0.2, 0.11, IRON);
  lamp(f, 0.0, 0.85, 3, 0.3);
  tree(f, 0.9, 0.0, 0.85); tree(f, -0.9, 0.5, 1.0, 0x5f9a50); bush(f, -0.75, 0.84, 0.045); bush(f, 0.35, 0.9, 0.04, 0x7fb06a);
  path(f, -0.12, 0.95, -0.12, -0.26, 0.16, 0x8a8478, 43, 0.1);
  tufts(f, 16, 341, 0.94, [[-0.9, -0.86, 0.9, -0.15], [-0.62, 0.12, -0.18, 0.62], [0.1, 0.0, 0.95, 0.3], [0.0, 0.36, 0.6, 0.66], [-0.22, -0.2, 0.0, 0.95], [0.5, 0.55, 0.95, 0.9]]);
}

/** Moderne : l'atelier de tôle nervurée, la jeep sur le pont élévateur, le portique et son moteur, le soudeur et ses étincelles */
function forgeModern(f: Fr, kit: FrontKit) {
  const steelW = 0x8a9888, mech = 0x3a4a5a;
  // le hangar : muret de béton, tôle nervurée, baie de la grande porte relevée, bandeau de fenêtres, toit, lanterneaux, extracteurs
  const b = f.sub(-0.2, -0.56), W = 1.3, D = 0.6, h = 0.36;
  b.box(W, 0.06, D, 0, 0, 0, CONC); b.box(W, h - 0.06, D, 0, 0.06, 0, steelW);
  for (let i = 1; i < 18; i++) b.box(0.008, h - 0.07, D + 0.008, -W / 2 + (i * W) / 18, 0.065, 0, dk(steelW, 0.82));
  for (const s of [-1, 1]) b.box(0.02, h, D + 0.01, s * W / 2, 0, 0, dk(steelW, 0.7));
  b.box(0.5, 0.27, 0.008, -0.25, 0.012, D / 2 + 0.004, 0x23272b); b.box(0.52, 0.05, 0.03, -0.25, 0.28, D / 2 + 0.014, 0xa8b0b8);
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) b.box(0.02, 0.054, 0.02, -0.25 + s * 0.27, i * 0.054, D / 2 + 0.01, i % 2 ? 0x2a2a2a : 0xf2c23a);
  b.box(0.16, 0.012, 0.03, -0.12, 0.012, D / 2 - 0.04, 0xffd890, true);
  winRow(b, [0.18, 0.32, 0.46], 0.2, D / 2 + 0.004, 0.11, 0.08, 0x5d6168, GLASS, 51, false);
  door(b, 0.32, D / 2 + 0.006, 0.08, 0.17, 0x5a6a7a, 0x5d6168, 0.012, false);
  b.box(0.16, 0.06, 0.008, 0.25, 0.3, D / 2 + 0.006, OLIVE_D); b.box(0.04, 0.04, 0.004, 0.2, 0.31, D / 2 + 0.011, TEAM_EMBLEM); for (let i = 0; i < 3; i++) b.box(0.016, 0.02, 0.004, 0.26 + i * 0.022, 0.32, D / 2 + 0.011, 0xfff1c9, true);
  b.add(new THREE.BoxGeometry(W + 0.06, 0.02, D + 0.06).rotateX(0.06), 0, h + 0.01, 0, 0x6a7078);
  for (const u of [-0.4, 0.0, 0.4]) b.add(new THREE.BoxGeometry(0.18, 0.02, 0.1).rotateX(0.06), u, h + 0.03, 0.08, 0xcfe4f0, true);
  for (const u of [-0.2, 0.2]) { b.cyl(0.03, 0.03, 0.05, 8, u, h + 0.02, -0.15, 0xa8b0b8); b.cyl(0.04, 0.04, 0.012, 8, u, h + 0.07, -0.15, 0x6a7078); }
  b.cyl(0.018, 0.022, 0.26, 6, 0.55, h, -0.18, 0x3a3a3e); kit.smoke(...b.w(0.55, h + 0.27, -0.18), 2);
  // le pont élévateur et la jeep levée devant la baie, le mécanicien dessous
  const l = f.sub(-0.45, 0.08);
  for (const s of [-1, 1]) { l.box(0.03, 0.2, 0.03, s * 0.1, 0, 0, 0x2a5a9a); l.box(0.02, 0.012, 0.18, s * 0.075, 0.075, 0, 0xf2c23a); }
  l.box(0.24, 0.012, 0.03, 0, 0.2, 0, 0x2a5a9a);
  jeep(l.sub(0, 0, 0, 0.08), 0, 0, 0, OLIVE, false);
  folk(f, kit, -0.3, 0.1, -PI / 2, mech, 0x2a2a2e);
  // la soudure : poutre sur tréteaux, le soudeur, la gerbe d'étincelles, le poste et les bouteilles
  const w = f.sub(0.35, 0.22);
  for (const s of [-1, 1]) { w.roll(0.01, 0.08, 0.05, s * 0.12, 0, 0, IRON, 0.2); w.roll(0.01, 0.08, 0.05, s * 0.12, 0, 0, IRON, -0.2); }
  w.box(0.32, 0.03, 0.03, 0, 0.08, 0, 0x6a6e72);
  for (let i = 0; i < 5; i++) w.box(0.006, 0.006, 0.006, 0.02 + 0.02 * Math.cos(i * 1.3), 0.13 + 0.025 * Math.sin(i * 2.1), 0.03 + 0.012 * i, 0xfff0a0, true);
  w.ball(0.012, 0.02, 0.11, 0.015, 0xe8f4ff, 'neon');
  folk(w, kit, 0.02, 0.1, PI, mech, 0x3a3a3e);
  w.box(0.08, 0.07, 0.06, -0.2, 0, 0.14, 0xc83a2a); for (const [a, c] of [[0.2, 0x3a8a4a], [0.24, 0x3a8a4a], [0.22, 0xe8e4dc]] as [number, number][]) { w.cyl(0.016, 0.016, 0.12, 6, a, 0, 0.12 + (c === 0xe8e4dc ? 0.03 : 0), c); w.sphere(0.014, a, 0.12, 0.12 + (c === 0xe8e4dc ? 0.03 : 0), c); }
  // le portique : deux chevalets, la poutre, le palan, la chaîne et le moteur qui pend
  const g = f.sub(0.62, -0.08);
  for (const s of [-1, 1]) { g.tube([s * 0.17, 0, -0.08], [s * 0.17, 0.36, 0], 0.008, 0xf2c23a); g.tube([s * 0.17, 0, 0.08], [s * 0.17, 0.36, 0], 0.008, 0xf2c23a); }
  g.box(0.38, 0.03, 0.03, 0, 0.36, 0, 0xf2c23a); g.box(0.05, 0.05, 0.05, 0.03, 0.31, 0, 0x3a3a3e); g.cyl(0.003, 0.003, 0.14, 3, 0.03, 0.17, 0, IRON);
  g.box(0.08, 0.06, 0.06, 0.03, 0.11, 0, 0x4a4e52); g.box(0.06, 0.02, 0.04, 0.03, 0.17, 0, 0x6a6e72);
  // munitions et pièces : caisses vertes, obus, pneus, fûts d'huile, jerricans, établi, groupe électrogène
  ammoStack(f, -0.72, 0.42, 0.2, 3, 2); ammoStack(f, -0.42, 0.62, -0.3, 2, 2);
  shells(f, -0.18, 0.52, false);
  tires(f, 0.88, 0.45, 4); tires(f, 0.8, 0.55, 2);
  for (const [u, v, c] of [[0.86, 0.22, 0x2a4a7a], [0.88, 0.32, 0x2a4a7a], [0.8, 0.3, 0x8a3a2a]] as V3[]) drum(f, u, v, c);
  for (let i = 0; i < 4; i++) f.box(0.03, 0.05, 0.045, 0.6 + i * 0.035, 0, 0.5, OLIVE_D);
  bench(f, 0.1, -0.14, 0, 0x8a8f96, STEEL);
  generator(f, kit, -0.86, -0.06, PI / 2);
  // projecteurs, notre drapeau, sacs de sable, arbres, herbes
  lamp(f, 0.32, 0.72, 4, 0.34, PI); lamp(f, -0.9, 0.2, 4, 0.34, PI / 2);
  mast(f, kit, -0.88, 0.88, 0.74, 0.22, 0.12);
  bags(f, -0.7, 0.92, -0.25, 0.92, 2);
  tree(f, 0.9, 0.88, 0.9); bush(f, 0.6, 0.9, 0.05); bush(f, -0.9, 0.62, 0.045);
  path(f, -0.3, 0.95, -0.3, 0.28, 0.2, 0x8a8e92, 52, 0.11);
  // seconde passe : la servante à outils rouge, le compresseur, l'extincteur, le moteur sur son chevalet
  const sv = f.sub(-0.05, 0.36, 0.3); sv.box(0.1, 0.12, 0.06, 0, 0.012, 0, 0xc83a2a); for (let i = 0; i < 3; i++) sv.box(0.102, 0.004, 0.062, 0, 0.04 + i * 0.03, 0, 0x8a2a1e); for (const s of [-1, 1]) sv.lying(0.012, 0.01, 6, s * 0.04, 0.012, 0.02, 0x1e1e22, 'x');
  const cp = f.sub(0.9, -0.12, PI / 2); cp.lying(0.035, 0.14, 8, 0, 0.04, 0, 0xd84a3a, 'x'); cp.box(0.06, 0.04, 0.05, 0, 0.075, 0, 0x3a3e42); for (const s of [-1, 1]) cp.box(0.012, 0.02, 0.06, s * 0.05, 0, 0, IRON);
  f.cyl(0.014, 0.014, 0.07, 6, 0.08, 0, -0.24, REDX); f.box(0.01, 0.012, 0.02, 0.08, 0.07, -0.23, IRON);
  f.box(0.04, 0.06, 0.04, 0.66, 0, -0.08, IRON);
  tufts(f, 14, 351, 0.94, [[-0.9, -0.9, 0.9, -0.22], [-0.66, -0.06, 0.82, 0.68], [-0.45, 0.66, 0.0, 0.95], [0.7, 0.36, 0.95, 0.62]]);
}

/** Futuriste : la halle de fabrication, l'imprimante d'armes à l'anneau qui tourne, le bras robot, la forge à plasma, les drones */
function forgeFuture(f: Fr, kit: FrontKit) {
  const tech = 0xdfe8f0, W = 1.2, D = 0.56;
  // la halle : socle sombre, caisson, voûte nervurée de néon, grande baie lumineuse, porte, liserés
  const b = f.sub(-0.25, -0.58);
  b.box(W + 0.06, 0.04, D + 0.06, 0, 0, 0, FDARK);
  b.box(W, 0.22, D, 0, 0.04, 0, FWALL);
  b.add(new THREE.CylinderGeometry(D / 2 + 0.02, D / 2 + 0.02, W, 12, 1, false, 0, PI).rotateZ(PI / 2).scale(1, 0.55, 1), 0, 0.26, 0, 0xf0f4f8);
  for (let i = 0; i <= 6; i++) b.add(new THREE.TorusGeometry(D / 2 + 0.025, 0.006, 3, 12, PI).rotateY(PI / 2).scale(1, 0.55, 1), -W / 2 + (W * i) / 6, 0.26, 0, i % 2 ? FDARK : NEON, i % 2 ? false : 'neon');
  b.box(0.46, 0.18, 0.008, -0.2, 0.04, D / 2 + 0.004, 0x1a2a3a); b.box(0.4, 0.04, 0.006, -0.2, 0.06, D / 2 + 0.009, 0xff8a3a, 'neon');
  for (const s of [-1, 1]) b.box(0.012, 0.2, 0.02, -0.2 + s * 0.24, 0.04, D / 2 + 0.01, NEON, 'neon');
  b.box(0.12, 0.17, 0.008, 0.3, 0.04, D / 2 + 0.004, FGLASS, 'neon'); b.box(0.2, 0.06, 0.008, 0.3, 0.22, D / 2 + 0.006, FDARK); b.box(0.05, 0.05, 0.004, 0.25, 0.225, D / 2 + 0.011, TEAM_EMBLEM); b.box(0.1, 0.01, 0.004, 0.34, 0.25, D / 2 + 0.011, NEON, 'neon');
  b.box(W, 0.01, 0.01, 0, 0.255, D / 2 + 0.004, NEON, 'neon');
  b.cyl(0.03, 0.04, 0.22, 8, 0.48, 0.36, -0.1, FDARK); b.cyl(0.032, 0.032, 0.01, 8, 0.48, 0.5, -0.1, 0xff8a3a, 'neon'); kit.smoke(...b.w(0.48, 0.6, -0.1), 0);
  // l'imprimante d'armes : socle, plateau lumineux, quatre montants, anneau holographique qui tourne autour de la pièce
  const pr = f.sub(-0.5, 0.18);
  pr.box(0.26, 0.05, 0.22, 0, 0, 0, FDARK); pr.box(0.22, 0.008, 0.18, 0, 0.05, 0, NEON, 'neon');
  for (const [a, c] of [[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.1], [0.12, 0.1]]) pr.box(0.014, 0.26, 0.014, a, 0.05, c, FWALL);
  pr.box(0.26, 0.016, 0.22, 0, 0.31, 0, FWALL); pr.box(0.04, 0.04, 0.04, 0, 0.27, 0, FDARK); pr.cone(0.012, 0.04, 6, 0, 0.23, 0, 0xff8a3a, 'neon');
  pr.box(0.12, 0.02, 0.03, 0, 0.06, 0, 0x6a7684); pr.box(0.04, 0.03, 0.02, -0.03, 0.06, 0.02, 0x6a7684);
  const ring = new Fr(kit.turn(pr.w(0, 0.13, 0), [0, 1, 0], 0.3), 0, 0, 0, 0);
  ring.add(new THREE.TorusGeometry(0.09, 0.004, 3, 16).rotateX(PI / 2), 0, 0, 0, NEON, 'neon');
  for (let i = 0; i < 3; i++) { const q = (i * 2 * PI) / 3; ring.box(0.01, 0.03, 0.01, Math.sin(q) * 0.09, -0.015, Math.cos(q) * 0.09, NEON, 'neon'); }
  // le bras robot articulé : socle tournant, deux segments, pince, articulations lumineuses
  const ar = f.sub(-0.12, 0.3, -0.6);
  ar.cyl(0.05, 0.06, 0.04, 10, 0, 0, 0, FDARK); ar.cyl(0.03, 0.035, 0.05, 8, 0, 0.04, 0, 0xf2a03a);
  ar.tilt(0.03, 0.2, 0.03, 0, 0.09, 0, 0xf2a03a, 0.5); ar.ball(0.022, 0, 0.26, 0.1, NEON, 'neon');
  ar.tilt(0.024, 0.16, 0.024, 0, 0.26, 0.1, 0xf2a03a, 2.1); ar.ball(0.016, 0, 0.18, 0.24, NEON, 'neon');
  for (const s of [-1, 1]) ar.box(0.008, 0.04, 0.012, s * 0.012, 0.13, 0.25, FDARK);
  // la forge à plasma : socle, cage de quatre colonnes, anneaux, cœur orange qui luit
  const pf = f.sub(0.45, 0.02);
  pf.cyl(0.12, 0.14, 0.04, 10, 0, 0, 0, FDARK);
  for (let i = 0; i < 4; i++) { const q = (i * PI) / 2 + PI / 4; pf.box(0.016, 0.3, 0.016, Math.sin(q) * 0.1, 0.04, Math.cos(q) * 0.1, FWALL); }
  for (const y of [0.1, 0.26]) pf.add(new THREE.TorusGeometry(0.1, 0.006, 3, 12).rotateX(PI / 2), 0, y, 0, 0xff8a3a, 'neon');
  pf.ball(0.05, 0, 0.18, 0, 0xffa04a, 'neon', 1); pf.cyl(0.11, 0.11, 0.012, 10, 0, 0.34, 0, FDARK);
  folk(pf, kit, -0.18, 0.1, PI / 2 + 0.3, tech, 0x3a3a48);
  // les drones de réparation sur leur rack, caisses à liseré, le traîneau flottant chargé, robot, technicien
  const dr = f.sub(0.84, -0.2, -PI / 2);
  dr.box(0.36, 0.012, 0.08, 0, 0.0, 0, FDARK); dr.box(0.36, 0.012, 0.08, 0, 0.12, 0, FDARK); for (const s of [-1, 1]) dr.box(0.012, 0.24, 0.08, s * 0.18, 0, 0, FDARK);
  for (let i = 0; i < 3; i++) for (const y of [0.012, 0.132]) { dr.cyl(0.03, 0.026, 0.02, 8, -0.11 + i * 0.11, y, 0, FWALL); dr.box(0.07, 0.004, 0.008, -0.11 + i * 0.11, y + 0.02, 0, FDARK); dr.box(0.01, 0.006, 0.006, -0.11 + i * 0.11, y + 0.02, 0.026, NEON_G, 'neon'); }
  for (const [u, v, r, y] of [[0.62, 0.48, 0.2, 0], [0.72, 0.46, -0.1, 0], [0.66, 0.47, 0.05, 0.08]]) { const c = f.sub(u, v, r, y); c.box(0.09, 0.08, 0.09, 0, 0, 0, FWALL); c.box(0.092, 0.008, 0.092, 0, 0.04, 0, NEON, 'neon'); c.box(0.03, 0.03, 0.004, 0, 0.022, 0.046, TEAM_EMBLEM); }
  const sl = f.sub(0.18, 0.62, 0.4);
  sl.box(0.14, 0.03, 0.24, 0, 0.05, 0, FDARK); sl.box(0.144, 0.006, 0.244, 0, 0.065, 0, NEON, 'neon');
  for (const s of [-1, 1]) for (const v of [-0.08, 0.08]) sl.cyl(0.02, 0.02, 0.004, 8, s * 0.05, 0.044, v, NEON, 'neon');
  ammoStack(sl.sub(0, 0, 0, 0.07), 0, -0.05, 0, 1, 1, FDARK); ammoStack(sl.sub(0, 0, 0, 0.07), 0, 0.05, 0, 1, 1, FDARK);
  robot(f, 0.0, -0.05, 0.3); folk(f, kit, -0.3, 0.55, 0.5, tech, 0x3a3a48);
  trooper(f, 0.38, 0.84, PI + 0.4, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8, rifle: true });
  // lampadaires, notre drapeau, jardinières, arbres, herbes
  lamp(f, -0.82, 0.62, 5, 0.34); lamp(f, 0.88, 0.4, 5, 0.34);
  mast(f, kit, -0.88, 0.88, 0.74, 0.22, 0.12, FWALL, NEON);
  for (const u of [-0.82, -0.55]) { f.box(0.14, 0.04, 0.08, u, 0, 0.88, FDARK); for (const k of [-0.035, 0.035]) f.sphere(0.03, u + k, 0.07, 0.88, 0x5ac88a, 0, 0.9); }
  tree(f, 0.9, 0.9, 0.85, 0x5ab87a); bush(f, 0.9, -0.9, 0.05, 0x5ac88a);
  path(f, -0.45, 0.95, -0.45, 0.32, 0.16, 0xc8d4dc, 53, 0.1);
  // seconde passe : l'exosquelette sur son portique, le drone de réparation qui tourne autour de l'imprimante, l'écran de suivi, le tapis
  const ex = f.sub(-0.82, 0.12, PI / 2);
  for (const s of [-1, 1]) ex.box(0.014, 0.32, 0.014, s * 0.09, 0, -0.04, FDARK); ex.box(0.2, 0.014, 0.03, 0, 0.32, -0.04, FDARK);
  for (const s of [-1, 1]) { ex.box(0.026, 0.1, 0.03, s * 0.025, 0.01, 0, FWALL); ex.box(0.03, 0.02, 0.04, s * 0.025, 0, 0.006, FDARK); ex.box(0.022, 0.09, 0.026, s * 0.07, 0.13, 0, FWALL); ex.ball(0.012, s * 0.07, 0.22, 0, NEON, 'neon'); }
  ex.box(0.1, 0.11, 0.06, 0, 0.11, 0, FWALL); ex.box(0.06, 0.04, 0.004, 0, 0.16, 0.031, TEAM_EMBLEM); ex.box(0.05, 0.05, 0.05, 0, 0.23, 0, FWALL); ex.box(0.04, 0.012, 0.004, 0, 0.25, 0.026, NEON, 'neon');
  const rd = new Fr(kit.turn(pr.w(0, 0.4, 0), [0, 1, 0], 0.25), 0, 0, 0, 0);
  rd.cyl(0.026, 0.02, 0.016, 8, 0.2, 0, 0, FWALL); rd.add(new THREE.TorusGeometry(0.03, 0.003, 3, 8).rotateX(PI / 2), 0.2, 0.008, 0, 0xff8a3a, 'neon'); rd.box(0.004, 0.03, 0.004, 0.2, -0.03, 0, FDARK);
  holo(f, 0.18, 0.18, -0.3, 0.14);
  const cv = f.sub(0.2, -0.16, 0.0); cv.box(0.1, 0.05, 0.3, 0, 0, 0, FDARK); cv.box(0.09, 0.006, 0.3, 0, 0.05, 0, 0x3a4652); for (let i = 0; i < 4; i++) cv.box(0.092, 0.004, 0.01, 0, 0.056, -0.12 + i * 0.08, NEON, 'neon'); cv.box(0.05, 0.04, 0.05, 0, 0.056, 0.06, FWALL);
  tufts(f, 12, 361, 0.94, [[-0.9, -0.92, 0.95, -0.2], [-0.68, 0.0, 0.62, 0.42], [0.0, 0.4, 0.82, 0.8], [-0.6, 0.3, -0.3, 0.95], [0.7, -0.45, 0.95, 0.1]], false);
}

/** La forge du front (2 × 2), de l'âge industriel (3) au futuriste (5) */
export function frontForge(p: Parts, age: number, kit: FrontKit) {
  const f = new Fr(p, 0, 0);
  if (age <= 3) forgeIndustrial(f, kit);
  else if (age === 4) forgeModern(f, kit);
  else forgeFuture(f, kit);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* LE FORT (3 × 3)                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Prisme posé au sol du repère : le polygone `pts` ([u, v]) agrandi de `k` autour de l'origine, de y à y + h */
function prism(f: Fr, pts: [number, number][], k: number, y: number, h: number, color: number, glow: Glow = false) {
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a * k, -b * k)));
  f.add(new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-PI / 2), 0, y, 0, color, glow);
}
/** Boîte le long du segment a → b (w de large, h de haut, posée à y), décalée de `off` vers sa droite (l'extérieur) */
function along(f: Fr, a: [number, number], b: [number, number], w: number, h: number, y: number, color: number, off = 0, glow: Glow = false, trim = 0) {
  const du = b[0] - a[0], dv = b[1] - a[1], L = Math.hypot(du, dv), nu = -dv / L, nv = du / L;
  f.sub((a[0] + b[0]) / 2 + nu * off, (a[1] + b[1]) / 2 + nv * off, Math.atan2(du, dv)).box(w, h, L - trim, 0, y, 0, color, glow);
}

/** Demi-côté de la courtine (axe des murs) et plan d'un bastion : pointe, épaules, flancs, gorge ; +v vers la pointe */
const FR = 0.9;
const BAST: [number, number][] = [[0, 0.6], [0.33, 0.18], [0.3, -0.2], [0, -0.36], [-0.3, -0.2], [-0.33, 0.18]];
/** Les faces et les flancs d'un bastion, dans l'ordre du polygone (l'extérieur à droite) */
const BFACES: [number, number][] = [[0, 1], [1, 2], [4, 5], [5, 0]];
const bastionFr = (f: Fr, sx: number, sz: number) => f.sub(sx * FR, sz * FR, Math.atan2(sx, sz));
const CORNERS: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

interface FortStyle { scarp: number; wall: number; band: number; top: number; lip: number; h: number; neon?: boolean }

/**
 * L'enceinte en étoile : quatre courtines (la porte au milieu de celle de devant) et quatre bastions à la pointe vers le large,
 * en assises : talus, mur, cordon, terre-plein, parapet ; glacis de terre au pied des courtines. Rend le repère de chaque bastion
 */
function enceinte(f: Fr, st: FortStyle, glacis: number) {
  const h = st.h;
  for (let k = 0; k < 4; k++) {
    const g = f.sub(0, 0, (k * PI) / 2), spans = k === 0 ? [[-0.56, -0.14], [0.14, 0.56]] : [[-0.56, 0.56]];
    for (const [a, b] of spans) {
      const c = (a + b) / 2, L = b - a;
      g.box(L, h * 0.4, 0.22, c, 0, FR + 0.01, st.scarp);
      g.box(L, h * 0.6, 0.17, c, h * 0.4, FR, st.wall);
      g.box(L + 0.004, 0.014, 0.18, c, h * 0.66, FR, st.band, st.neon ? 'neon' : false);
      g.box(L, 0.004, 0.226, c, h * 0.2, FR + 0.01, dk(st.scarp, 0.85));
      g.box(L, 0.006, 0.12, c, h, FR - 0.02, st.top);
      g.box(L, 0.04, 0.035, c, h, FR + 0.066, st.lip);
      if (glacis) g.add(new THREE.BoxGeometry(L + 0.04, 0.014, 0.28).rotateX(0.4), c, h * 0.32, FR + 0.24, glacis);
    }
  }
  const out: Fr[] = [];
  for (const [sx, sz] of CORNERS) {
    const b = bastionFr(f, sx, sz);
    prism(b, BAST, 1.06, 0, h * 0.4, st.scarp);
    prism(b, BAST, 1.0, h * 0.4, h * 0.6, st.wall);
    prism(b, BAST, 1.015, h * 0.66, 0.014, st.band, st.neon ? 'neon' : false);
    prism(b, BAST, 0.9, h, 0.008, st.top);
    for (const [i, j] of BFACES) along(b, BAST[i], BAST[j], 0.035, 0.04, h, st.lip, -0.015, false, 0.01);
    out.push(b);
  }
  return out;
}

/** Canon de rempart sur son affût de place (bouche vers +v), posé à la hauteur y */
function rampartGun(f: Fr, u: number, v: number, y: number, ry = 0) {
  const g = f.sub(u, v, ry, y);
  g.box(0.08, 0.03, 0.12, 0, 0, -0.02, 0x5a4636); g.box(0.06, 0.012, 0.16, 0, 0, -0.04, 0x4a3a2c);
  for (const s of [-1, 1]) { g.box(0.012, 0.05, 0.08, s * 0.03, 0.03, -0.01, 0x5a4636); g.lying(0.026, 0.012, 6, s * 0.046, 0.026, 0.03, 0x4a3a2c, 'x'); }
  g.add(new THREE.CylinderGeometry(0.014, 0.021, 0.2, 8).rotateX(PI / 2 - 0.06), 0, 0.07, 0.05, GUN);
  g.sphere(0.022, 0, 0.07, -0.05, GUN);
}

/** Échauguette au bout d'un bastion : cul-de-lampe, guérite ronde, meurtrières, toit en poivrière, épi */
function sentryBox(f: Fr, u: number, v: number, y: number, stone: number, roof: number) {
  f.cyl(0.045, 0.012, 0.05, 8, u, y - 0.05, v, stone);
  f.cyl(0.042, 0.042, 0.1, 8, u, y, v, stone);
  for (let i = 0; i < 3; i++) { const q = -PI / 2 + (i * PI) / 2; f.box(0.008, 0.035, 0.01, u + Math.sin(q) * 0.042, y + 0.04, v + Math.cos(q) * 0.042, 0x24201c); }
  f.cone(0.055, 0.08, 8, u, y + 0.1, v, roof); f.sphere(0.008, u, y + 0.185, v, GOLD);
}

/** Industriel : le fort en étoile de pierre, ses bastions et leurs canons, la porte, la poudrière, les casemates, la parade */
function fortIndustrial(f: Fr, kit: FrontKit) {
  const stone = 0xb8b0a0, stoneD = 0x8f887a, slate = 0x5a6270, grass = 0x7a9a5a;
  const bs = enceinte(f, { scarp: stoneD, wall: stone, band: 0xd8d0c0, top: 0x8aa868, lip: 0xa8a090, h: 0.2 }, grass);
  // sur chaque bastion : le canon tourné vers le large, ses boulets ; une échauguette aux deux bastions de devant
  bs.forEach((b, i) => {
    rampartGun(b, 0, 0.26, 0.2);
    for (const [k, r] of [[-0.5, 0], [0.5, 0], [0, 1]] as [number, number][]) b.sphere(0.015, 0.12 + k * 0.03, 0.215 + r * 0.025, 0.12, 0x2a2a2e);
    if (i >= 2) sentryBox(b, 0, 0.62, 0.22, stone, slate);
    for (const s of [-1, 1]) b.box(0.03, 0.035, 0.01, s * 0.305, 0.1, -0.06, 0x24201c);
  });
  // la porte : piliers à bossages, arc, fronton à notre écu, vantaux ouverts, lanternes ; le pont et ses chaînes, les deux gardes
  const g = f.sub(0, FR);
  for (const s of [-1, 1]) { g.box(0.07, 0.3, 0.24, s * 0.16, 0, 0.01, stone); for (let i = 0; i < 4; i++) g.box(0.074, 0.03, 0.244, s * 0.16, 0.03 + i * 0.07, 0.01, stoneD); }
  g.box(0.4, 0.08, 0.24, 0, 0.3, 0.01, stone); g.box(0.42, 0.016, 0.25, 0, 0.38, 0.01, 0xd8d0c0);
  g.add(new THREE.CylinderGeometry(0.125, 0.125, 0.245, 8, 1, false, -PI / 2, PI).rotateZ(PI / 2).rotateY(PI / 2), 0, 0.2, 0.01, stone);
  g.box(0.25, 0.2, 0.004, 0, 0, -0.06, 0x2a241e);
  g.gable(0.36, 0.1, 0.06, 0, 0.396, 0.1, stone); g.box(0.07, 0.08, 0.008, 0, 0.4, 0.132, TEAM_EMBLEM);
  for (const s of [-1, 1]) { g.sub(s * 0.125, 0.13, -s * 1.3).box(0.11, 0.2, 0.012, s * 0.055, 0, 0, 0x6a4a30); g.box(0.022, 0.03, 0.022, s * 0.23, 0.22, 0.14, 0xfff1c9, true); g.box(0.012, 0.012, 0.03, s * 0.23, 0.25, 0.125, IRON); }
  for (let i = 0; i < 5; i++) g.box(0.26, 0.012, 0.07, 0, 0.012, 0.18 + i * 0.075, dk(0x8a6a48, 0.85 + 0.25 * H(i, 61)));
  for (const s of [-1, 1]) { g.box(0.02, 0.1, 0.02, s * 0.14, 0, 0.52, DWOOD); g.tube([s * 0.14, 0.1, 0.52], [s * 0.16, 0.28, 0.12], 0.003, IRON, false, 3); }
  trooper(f, -0.22, FR + 0.36, 0, team(TEAM_A, 0.9), 0x2a2a30, { legs: 0x4a4a5a, rifle: true });
  trooper(f, 0.22, FR + 0.36, 0, team(TEAM_A, 0.9), 0x2a2a30, { legs: 0x4a4a5a, rifle: true });
  // les casemates sous le rempart du fond : façade de brique, portes cintrées, terre et herbe par-dessus, évents
  const c = f.sub(0, -0.7);
  c.box(1.0, 0.18, 0.2, 0, 0, 0, BRICK); c.box(1.02, 0.02, 0.21, 0, 0.18, 0, stone);
  c.add(new THREE.BoxGeometry(1.0, 0.02, 0.16).rotateX(-0.4), 0, 0.22, -0.02, 0x8aa868);
  for (const u of [-0.36, -0.12, 0.12, 0.36]) {
    c.box(0.1, 0.11, 0.006, u, 0, 0.102, 0x3a2a20); c.add(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 8, 1, false, -PI / 2, PI).rotateZ(PI / 2).rotateY(PI / 2), u, 0.11, 0.102, 0x3a2a20);
    c.add(new THREE.TorusGeometry(0.06, 0.01, 3, 8, PI), u, 0.11, 0.104, stone);
    c.box(0.04, 0.03, 0.006, u + 0.07, 0.12, 0.103, H(Math.round(u * 10), 62) > 0.4 ? WARM : 0x3a2a20, H(Math.round(u * 10), 62) > 0.4);
  }
  for (const u of [-0.24, 0.24]) { c.cyl(0.02, 0.02, 0.08, 6, u, 0.2, -0.06, stone); c.cyl(0.026, 0.026, 0.01, 6, u, 0.28, -0.06, stoneD); }
  kit.smoke(...c.w(-0.24, 0.3, -0.06), 0);
  // la maison du commandant : brique, deux niveaux, chaînages, fenêtres allumées, perron, toit d'ardoise, cheminée
  const m = f.sub(-0.4, -0.3);
  m.box(0.36, 0.03, 0.26, 0, 0, 0, stoneD); m.box(0.34, 0.28, 0.24, 0, 0.03, 0, 0xb86a4a);
  m.box(0.35, 0.012, 0.25, 0, 0.16, 0, stone);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) m.box(0.03, 0.035, 0.03, s * 0.16, 0.04 + i * 0.07, 0.115, i % 2 ? stone : 0xd8d0c0);
  for (const u of [-0.1, 0.1]) { win(m, u, 0.2, 0.122, 0.06, 0.08, H(Math.round(u * 10), 63) > 0.3, 0xe8e0d0, WARM); }
  win(m, -0.1, 0.06, 0.122, 0.06, 0.08, true, 0xe8e0d0, WARM); door(m, 0.1, 0.122, 0.06, 0.12, 0x4a3426, 0xe8e0d0, 0.03, false);
  for (let i = 0; i < 2; i++) m.box(0.1 - i * 0.02, 0.015, 0.04, 0.1, i * 0.015, 0.14 + 0.02 * (1 - i), stone);
  roof2(m, 0, 0.31, 0, 0.34, 0.24, 0.12, slate, 0xb86a4a, 0.025, 0);
  m.box(0.05, 0.12, 0.05, 0.12, 0.34, -0.04, 0x8a3e24); m.box(0.06, 0.012, 0.06, 0.12, 0.46, -0.04, stoneD); kit.smoke(...m.w(0.12, 0.48, -0.04), 0);
  // la poudrière : murs épais, contreforts, toit de pierre, porte de fer, paratonnerre ; son mur d'enceinte, les tonneaux
  const pw = f.sub(0.42, -0.32);
  pw.box(0.26, 0.17, 0.2, 0, 0, 0, stone);
  for (const s of [-1, 1]) for (const v of [-0.06, 0.06]) pw.tilt(0.03, 0.15, 0.05, s * 0.14, 0, v, stoneD, 0);
  pw.gable(0.28, 0.1, 0.22, 0, 0.17, 0, stoneD, PI / 2);
  pw.box(0.06, 0.11, 0.006, 0, 0, 0.102, 0x3a3e44); for (const y of [0.03, 0.08]) pw.box(0.064, 0.008, 0.008, 0, y, 0.105, 0x24282c);
  pw.cyl(0.003, 0.003, 0.14, 3, 0.0, 0.26, 0, IRON); pw.box(0.14, 0.02, 0.006, 0, 0.13, 0.103, 0xd8c050);
  for (const [a, b, l, r] of [[-0.18, 0, 0.3, PI / 2], [0.18, 0, 0.3, PI / 2], [-0.1, 0.16, 0.14, 0]] as [number, number, number, number][]) pw.sub(a, b, r).box(l, 0.06, 0.025, 0, 0, 0, stoneD);
  for (const [u, v] of [[0.6, -0.08], [0.64, 0.0], [0.56, 0.02]]) barrel(f, u, v, 0.8, 0x5a4636);
  // la cour : mât et notre grand drapeau sur son socle, la parade (le rang, l'officier, le tambour), allées, réverbères
  const fm = f.sub(0, -0.1);
  fm.cyl(0.08, 0.09, 0.03, 8, 0, 0, 0, stoneD); fm.cyl(0.06, 0.065, 0.03, 8, 0, 0.03, 0, stone);
  mast(fm, kit, 0, 0, 0.9, 0.3, 0.17, 0xdcdcd4);
  for (let i = 0; i < 5; i++) trooper(f, -0.3 + i * 0.15, 0.24, PI, team(TEAM_A, 0.9), 0x2a2a30, { legs: 0x4a4a5a, rifle: true });
  trooper(f, 0, 0.06, 0, team(TEAM_A, 1.0), 0x2a2a30, { legs: 0x4a4a5a, salute: true });
  folk(f, kit, 0.42, 0.22, PI, team(TEAM_A, 0.9), 0x2a2a30); f.cyl(0.02, 0.02, 0.025, 8, 0.42, 0.06, 0.2, WHITE);
  folk(f, kit, -0.52, 0.0, 0.8, team(TEAM_A, 0.85), 0x2a2a30);
  folk(f, kit, 0.75, 0.3, -PI / 2, team(TEAM_A, 0.9), 0x2a2a30, false, 'idle', 0.2);
  path(f, 0, 0.82, 0, 0.32, 0.18, 0x9a948a, 64, 0.1); path(f, -0.4, -0.16, 0.42, -0.2, 0.08, 0x9a948a, 65, 0.1);
  lamp(f, -0.24, 0.62, 3, 0.3); lamp(f, 0.24, 0.62, 3, 0.3);
  shells(f, 0.52, 0.4, true);
  // les arbres de la cour, l'herbe des glacis et des fossés, quelques fleurs
  tree(f, -0.6, 0.38, 0.8); tree(f, 0.66, -0.55, 0.75, 0x5f9a50); bush(f, -0.66, -0.5, 0.045);
  tufts(f, 22, 371, 1.45, [[-1.05, -1.05, 1.05, 1.05], [0.75, 0.75, 1.45, 1.45], [-1.45, 0.75, -0.75, 1.45], [0.75, -1.45, 1.45, -0.75], [-1.45, -1.45, -0.75, -0.75], [-0.3, 0.95, 0.3, 1.45]]);
}

/** Tour de guet sur pieds d'acier : cabine, garde-corps, projecteur, échelle */
function watchtower(f: Fr, u: number, v: number, y: number, h: number, ry = 0) {
  const g = f.sub(u, v, ry, y);
  for (const [a, b] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) g.tube([a * 1.3, 0, b * 1.3], [a, h, b], 0.006, STEEL);
  g.tube([-0.075, h * 0.4, 0.075], [0.075, h * 0.4, -0.075], 0.003, STEEL, false, 3);
  g.box(0.16, 0.012, 0.16, 0, h, 0, CONC_D);
  g.box(0.13, 0.08, 0.13, 0, h + 0.012, 0, CONC_L); g.box(0.132, 0.03, 0.132, 0, h + 0.05, 0, 0x2a3038);
  g.box(0.16, 0.014, 0.16, 0, h + 0.1, 0, 0x5d6168);
  searchlight(g, 0.04, h + 0.114, 0.04, 0.6, 0.3);
  for (let i = 0; i < 3; i++) g.box(0.03, 0.004, 0.004, 0.0, 0.06 + i * (h / 3), 0.1, STEEL);
}
/** Char d'assaut : caisse, chenilles et galets, tourelle, canon vers +z, notre écu */
function tank(f: Fr, u: number, v: number, ry: number, col = OLIVE, tur = 0) {
  const g = f.sub(u, v, ry);
  for (const s of [-1, 1]) { g.box(0.05, 0.05, 0.3, s * 0.075, 0, 0, 0x2a2c2e); for (let i = 0; i < 4; i++) g.lying(0.02, 0.054, 6, s * 0.075, 0.024, -0.1 + i * 0.066, 0x4a4e52, 'x'); g.box(0.056, 0.008, 0.3, s * 0.075, 0.05, 0, dk(col, 0.8)); }
  g.box(0.12, 0.06, 0.28, 0, 0.03, 0, col); g.tilt(0.12, 0.012, 0.06, 0, 0.07, 0.15, dk(col, 0.9), 1.0);
  const t = g.sub(0, -0.02, tur, 0.09);
  t.cyl(0.06, 0.07, 0.045, 8, 0, 0, 0, dk(col, 1.05)); t.cyl(0.02, 0.02, 0.02, 6, 0.02, 0.045, -0.02, dk(col, 0.8));
  t.lying(0.011, 0.24, 6, 0, 0.025, 0.17, dk(col, 0.85)); t.lying(0.016, 0.03, 6, 0, 0.025, 0.28, dk(col, 0.7));
  for (const s of [-1, 1]) g.box(0.003, 0.03, 0.04, s * 0.061, 0.04, -0.04, TEAM_EMBLEM);
}

/** Moderne : le fort de béton, bunkers et nids de mitrailleuses, tours de guet et projecteurs, antenne radio, char et jeep */
function fortModern(f: Fr, kit: FrontKit) {
  const grass = 0x7a9060;
  const bs = enceinte(f, { scarp: CONC_D, wall: CONC, band: CONC_L, top: 0x9a9a92, lip: CONC_L, h: 0.2 }, grass);
  // les bastions : bunker à meurtrière à la pointe des deux de devant, nids de mitrailleuses en sacs de sable, tours de guet au fond
  bs.forEach((b, i) => {
    if (i >= 2) {
      b.box(0.2, 0.08, 0.14, 0, 0.2, 0.3, CONC_L); b.box(0.22, 0.016, 0.16, 0, 0.28, 0.3, CONC_D); b.box(0.14, 0.02, 0.006, 0, 0.24, 0.372, 0x1a1e22);
      b.lying(0.008, 0.08, 5, 0.03, 0.25, 0.4, 0x2a2c2e);
    } else watchtower(b, 0, 0.3, 0.2, 0.36, PI / 4);
    if (i >= 2) {
      const n = b.sub(0, 0.02, 0, 0.2);
      for (let k = 0; k < 5; k++) { const q = -PI / 2 + (k * PI) / 4; n.sub(Math.sin(q) * 0.1, Math.cos(q) * 0.1, q).box(0.05, 0.034, 0.06, 0, 0, 0, dk(KHAKI, 0.85 + 0.2 * H(k, 70 + i))); n.sub(Math.sin(q + 0.3) * 0.1, Math.cos(q + 0.3) * 0.1, q + 0.3).box(0.048, 0.032, 0.05, 0, 0.034, 0, dk(KHAKI, 0.9 + 0.15 * H(k, 75 + i))); }
      n.box(0.012, 0.05, 0.012, 0, 0, 0.04, IRON); n.lying(0.008, 0.12, 5, 0, 0.06, 0.08, 0x2a2c2e); n.box(0.04, 0.02, 0.05, 0, 0.05, 0.03, 0x2a2c2e);
    }
    for (const s of [-1, 1]) b.box(0.05, 0.012, 0.01, s * 0.305, 0.12, -0.06, 0x1a1e22);
  });
  for (let k = 1; k < 4; k++) { const g = f.sub(0, 0, (k * PI) / 2); wire(g, -0.5, FR + 0.42, 0.5, FR + 0.42); }
  // la porte : deux massifs de béton, linteau à notre écu, barrière levante, guérite vitrée, panneaux, chicane de sacs
  const g = f.sub(0, FR);
  for (const s of [-1, 1]) { g.box(0.08, 0.3, 0.24, s * 0.17, 0, 0.01, CONC); g.box(0.084, 0.012, 0.244, s * 0.17, 0.2, 0.01, CONC_D); }
  g.box(0.42, 0.08, 0.24, 0, 0.3, 0.01, CONC_L); g.box(0.1, 0.07, 0.006, 0, 0.305, 0.132, TEAM_EMBLEM); for (const s of [-1, 1]) g.box(0.1, 0.03, 0.004, s * 0.13, 0.32, 0.132, 0xe8e8e0);
  g.box(0.02, 0.08, 0.02, -0.12, 0, 0.2, STEEL); for (let i = 0; i < 5; i++) g.box(0.05, 0.012, 0.012, -0.1 + i * 0.05, 0.07, 0.2, i % 2 ? REDX : WHITE);
  const gb = g.sub(0.25, 0.3);
  gb.box(0.12, 0.2, 0.12, 0, 0, 0, CONC_L); gb.box(0.104, 0.06, 0.004, 0, 0.1, 0.06, GLASS, true); gb.box(0.004, 0.06, 0.104, -0.06, 0.1, 0, GLASS, true); gb.box(0.15, 0.02, 0.15, 0, 0.2, 0, CONC_D);
  bags(g, -0.32, 0.36, -0.12, 0.42, 2);
  trooper(g, -0.2, 0.26, 0, OLIVE, OLIVE_D, { legs: OLIVE_D, rifle: true }); trooper(g, 0.12, 0.3, -0.4, OLIVE, OLIVE_D, { legs: OLIVE_D, rifle: true });
  // l'état-major : deux niveaux de béton, bandeaux vitrés, auvent, toit-terrasse, parabole et climatiseurs
  const q = f.sub(-0.36, -0.42), W = 0.46, D = 0.3;
  q.box(W + 0.02, 0.03, D + 0.02, 0, 0, 0, CONC_D); q.box(W, 0.34, D, 0, 0.03, 0, CONC);
  for (const y of [0.18, 0.36]) q.box(W + 0.02, 0.016, D + 0.02, 0, y, 0, CONC_L);
  for (const y of [0.07, 0.24]) { q.box(W - 0.06, 0.08, 0.006, 0, y, D / 2 + 0.002, GLASS, true); for (let i = 0; i < 6; i++) q.box(0.008, 0.08, 0.01, -W / 2 + 0.03 + (i * (W - 0.06)) / 5, y, D / 2 + 0.004, 0x5d6168); }
  q.box(0.08, 0.12, 0.008, 0.12, 0.03, D / 2 + 0.006, 0x3a4a5a); q.tilt(0.16, 0.01, 0.08, 0.12, 0.16, D / 2 + 0.04, CONC_L, 0.1);
  q.box(W + 0.03, 0.03, 0.02, 0, 0.37, D / 2, CONC_L); q.box(0.02, 0.03, D, -W / 2, 0.37, 0, CONC_L);
  q.cyl(0.01, 0.014, 0.06, 5, 0.12, 0.37, -0.05, STEEL); q.add(new THREE.SphereGeometry(0.06, 8, 4, 0, PI * 2, 0, PI / 2.6).rotateX(PI / 2.6), 0.12, 0.46, -0.03, 0xe8e8e0);
  for (const u of [-0.12, -0.02]) { q.box(0.07, 0.05, 0.06, u, 0.37, -0.06, 0xd8d8d0); q.cyl(0.02, 0.02, 0.008, 8, u, 0.42, -0.06, 0x3c4048); }
  // l'antenne radio : pylône en treillis, haubans, feux rouges ; le bunker des munitions sous sa butte d'herbe
  const r = f.sub(0.5, -0.5);
  for (const [a, b] of [[-0.04, -0.04], [0.04, -0.04], [0, 0.05]]) r.tube([a * 1.6, 0, b * 1.6], [a * 0.3, 0.9, b * 0.3], 0.005, 0xd8d8d0);
  for (let i = 0; i < 5; i++) r.add(new THREE.TorusGeometry(0.06 - i * 0.009, 0.003, 3, 3).rotateX(PI / 2), 0, 0.12 + i * 0.16, 0, i % 2 ? REDX : 0xd8d8d0);
  r.ball(0.016, 0, 0.92, 0, 0xff3a3a, true); r.ball(0.012, 0, 0.5, 0, 0xff3a3a, true);
  for (const [a, b] of [[-0.3, 0.1], [0.24, 0.2], [0.05, -0.25]]) r.tube([0, 0.7, 0], [a, 0, b], 0.0014, 0x8a8a8a, false, 3);
  const k = f.sub(0.48, -0.18);
  k.add(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8, 1, false, -PI / 2, PI).rotateX(PI / 2).rotateZ(PI / 2).scale(1, 0.7, 1), 0, 0, 0, 0x7a9a5a);
  k.box(0.18, 0.1, 0.03, 0, 0, 0.15, CONC); k.box(0.07, 0.08, 0.006, 0, 0, 0.167, 0x4a5a3a); k.box(0.2, 0.012, 0.04, 0, 0.1, 0.15, CONC_D);
  k.box(0.05, 0.03, 0.004, 0.06, 0.06, 0.167, 0xf2c23a);
  // la cour : mât et grand drapeau, la parade, le char, la jeep, sacs, caisses, projecteurs, arbres
  const fm = f.sub(0, -0.08);
  fm.cyl(0.08, 0.09, 0.03, 8, 0, 0, 0, CONC_D); for (const s of [-1, 1]) fm.box(0.1, 0.012, 0.012, s * 0.06, 0.03, 0, 0xe8e8e0);
  mast(fm, kit, 0, 0, 0.92, 0.3, 0.17);
  for (let i = 0; i < 5; i++) trooper(f, -0.3 + i * 0.15, 0.26, PI, OLIVE, OLIVE_D, { legs: OLIVE_D, rifle: true });
  trooper(f, 0, 0.08, 0, OLIVE, team(TEAM_A, 0.8), { legs: OLIVE_D, salute: true });
  tank(f, 0.5, 0.36, -0.2, OLIVE, 0.3);
  jeep(f, -0.52, 0.38, 0.5);
  folk(f, kit, -0.5, 0.1, 1.2, OLIVE, OLIVE_D); folk(f, kit, 0.3, -0.25, -0.5, OLIVE, OLIVE_D);
  ammoStack(f, -0.62, -0.06, PI / 2, 3, 2); ammoStack(f, 0.7, 0.05, PI / 2, 2, 2);
  for (const [u, v] of [[0.66, -0.2], [0.72, -0.16]]) drum(f, u, v, 0x4a6a3a);
  lamp(f, -0.24, 0.66, 4, 0.34, PI); lamp(f, 0.24, 0.66, 4, 0.34, PI);
  path(f, 0, 0.82, 0, 0.36, 0.2, 0x8a8e92, 72, 0.1);
  tree(f, -0.66, 0.5, 0.7); bush(f, 0.66, 0.56, 0.04); bush(f, -0.12, -0.6, 0.04);
  tufts(f, 14, 381, 1.45, [[-1.05, -1.05, 1.05, 1.05], [0.75, 0.75, 1.45, 1.45], [-1.45, 0.75, -0.75, 1.45], [0.75, -1.45, 1.45, -0.75], [-1.45, -1.45, -0.75, -0.75], [-0.4, 0.95, 0.4, 1.45]]);
}

/** Futuriste : le fort aux murs lisses à liserés de néon, tourelles à dôme, dôme de bouclier d'énergie, tour de commandement */
function fortFuture(f: Fr, kit: FrontKit) {
  const bs = enceinte(f, { scarp: FDARK, wall: FWALL, band: NEON, top: 0xc8d4dc, lip: 0xd8e2ea, h: 0.22, neon: true }, 0);
  // les bastions : tourelle à dôme et canons jumeaux, anneau lumineux ; pylône de bouclier à la pointe
  bs.forEach((b, i) => {
    const t = b.sub(0, 0.22, 0, 0.22);
    t.cyl(0.08, 0.09, 0.03, 10, 0, 0, 0, FDARK); t.add(new THREE.SphereGeometry(0.07, 8, 3, 0, PI * 2, 0, PI / 2), 0, 0.03, 0, FWALL);
    t.add(new THREE.TorusGeometry(0.072, 0.005, 3, 14).rotateX(PI / 2), 0, 0.035, 0, NEON, 'neon');
    for (const s of [-1, 1]) { t.lying(0.008, 0.16, 6, s * 0.022, 0.06, 0.12, FDARK); t.cyl(0.009, 0.009, 0.006, 6, s * 0.022, 0.054, 0.2, NEON, 'neon'); }
    b.cyl(0.012, 0.02, 0.4, 6, 0, 0.22, 0.52, FDARK); b.ball(0.03, 0, 0.64, 0.52, NEON, 'neon'); b.add(new THREE.TorusGeometry(0.03, 0.004, 3, 10).rotateX(PI / 2), 0, 0.5, 0.52, NEON, 'neon');
    if (i >= 2) trooper(b, 0.12, 0.0, 0, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8, rifle: true, y: 0.22 });
  });
  // le dôme du bouclier d'énergie : méridiens et parallèles de lumière au-dessus de la cour
  for (let i = 0; i < 3; i++) f.add(new THREE.TorusGeometry(0.98, 0.006, 3, 20, PI).scale(1, 0.62, 1).rotateY((i * PI) / 3), 0, 0, 0, NEON, 'neon');
  for (const [r, y] of [[0.85, 0.3], [0.5, 0.51]]) f.add(new THREE.TorusGeometry(r, 0.005, 3, 24).rotateX(PI / 2), 0, y, 0, NEON, 'neon');
  // la porte d'énergie : deux pylônes, arche de néon, rideau lumineux, notre écu, gardes
  const g = f.sub(0, FR);
  for (const s of [-1, 1]) { g.box(0.08, 0.34, 0.24, s * 0.17, 0, 0.01, FWALL); g.box(0.012, 0.3, 0.012, s * 0.13, 0.02, 0.13, NEON, 'neon'); }
  g.add(new THREE.TorusGeometry(0.14, 0.008, 3, 12, PI), 0, 0.2, 0.13, NEON, 'neon');
  g.box(0.24, 0.006, 0.01, 0, 0.1, 0.13, NEON, 'neon'); g.box(0.24, 0.006, 0.01, 0, 0.05, 0.13, NEON, 'neon');
  g.box(0.42, 0.06, 0.24, 0, 0.34, 0.01, FWALL); g.box(0.09, 0.07, 0.006, 0, 0.335, 0.133, TEAM_EMBLEM); g.box(0.42, 0.008, 0.01, 0, 0.395, 0.13, NEON, 'neon');
  trooper(f, -0.24, FR + 0.36, 0, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8, rifle: true }); trooper(f, 0.24, FR + 0.36, 0, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8, rifle: true });
  // la tour de commandement : socle, fût blanc, bandeau vitré lumineux, couronne d'antennes, notre écu holographique
  const c = f.sub(0, -0.42);
  c.cyl(0.24, 0.26, 0.05, 12, 0, 0, 0, FDARK);
  c.cyl(0.17, 0.2, 0.42, 12, 0, 0.05, 0, FWALL);
  c.cyl(0.175, 0.175, 0.07, 12, 0, 0.28, 0, FGLASS, 'neon'); c.cyl(0.19, 0.19, 0.012, 12, 0, 0.36, 0, FDARK); c.cyl(0.2, 0.2, 0.01, 12, 0, 0.27, 0, NEON, 'neon');
  c.cyl(0.12, 0.17, 0.06, 12, 0, 0.47, 0, FWALL); c.cyl(0.012, 0.016, 0.24, 6, 0, 0.53, 0, FDARK); c.ball(0.02, 0, 0.78, 0, 0xff4a4a, 'neon');
  c.add(new THREE.TorusGeometry(0.06, 0.004, 3, 12).rotateX(PI / 2), 0, 0.66, 0, NEON, 'neon');
  c.box(0.1, 0.16, 0.012, 0, 0.08, 0.19, FGLASS, 'neon'); c.box(0.004, 0.16, 0.016, 0, 0.08, 0.195, FDARK);
  c.box(0.16, 0.12, 0.006, 0, 0.5, 0.17, TEAM_EMBLEM); c.box(0.17, 0.006, 0.01, 0, 0.62, 0.17, NEON, 'neon'); c.box(0.17, 0.006, 0.01, 0, 0.495, 0.17, NEON, 'neon');
  mast(f, kit, 0.34, -0.36, 0.86, 0.28, 0.16, FWALL, NEON);
  // le hangar du char flottant (à gauche) et le char qui flotte devant, ses patins lumineux
  const hg = f.sub(-0.52, -0.08, PI / 2);
  hg.add(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 10, 1, false, 0, PI).rotateZ(PI / 2).rotateY(PI / 2), 0, 0, 0, 0xe8eef4);
  for (const v of [-0.12, 0.0, 0.12]) hg.add(new THREE.TorusGeometry(0.163, 0.005, 3, 10, PI), 0, 0, v, NEON, 'neon');
  hg.box(0.18, 0.12, 0.006, 0, 0, 0.172, 0x1a2a3a); hg.box(0.18, 0.006, 0.008, 0, 0.12, 0.174, NEON, 'neon');
  const hv = kit.sway(f.w(-0.3, 0.06, 0.2), [1, 0, 0], 0.025, 0.4), ht = new Fr(hv, 0, 0, 0.4, 0);
  ht.add(new THREE.CylinderGeometry(0.06, 0.1, 0.28, 6).rotateX(PI / 2).scale(1.1, 0.35, 1), 0, 0.0, 0, FWALL); ht.box(0.2, 0.006, 0.26, 0, -0.028, 0, NEON, 'neon');
  ht.cyl(0.045, 0.05, 0.03, 8, 0, 0.018, -0.03, 0xd8e2ea); ht.lying(0.008, 0.18, 6, 0, 0.034, 0.08, FDARK); ht.box(0.03, 0.02, 0.003, 0.06, 0.0, -0.02, TEAM_EMBLEM);
  // la parade : rang de soldats en armure blanche, l'officier, robots de garde ; le drone qui patrouille au-dessus des murs
  for (let i = 0; i < 5; i++) trooper(f, -0.24 + i * 0.12, 0.42, PI, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8, rifle: true });
  trooper(f, 0, 0.24, 0, FWALL, TEAM_A, { legs: 0x9aa8b8, salute: true });
  robot(f, 0.5, 0.36, -0.6); robot(f, -0.6, 0.5, 0.4, FWALL, 0xff5a5a);
  folk(f, kit, 0.42, -0.08, 2.4, 0xdfe8f0, 0x3a3a48);
  const dr = new Fr(kit.turn([0, 0.55, 0], [0, 1, 0], 0.08), 0, 0, 0, 0);
  dr.cyl(0.04, 0.03, 0.02, 8, 1.05, 0, 0, FWALL); dr.add(new THREE.TorusGeometry(0.045, 0.004, 3, 10).rotateX(PI / 2), 1.05, 0.01, 0, NEON, 'neon'); dr.box(0.1, 0.004, 0.008, 1.05, 0.01, 0, FDARK); dr.box(0.03, 0.01, 0.01, 1.05, -0.01, 0.0, 0xff4a4a, 'neon');
  // le dallage de la cour en carreaux, les bornes lumineuses, les jardinières, les caisses
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) if (!(i === 2)) f.box(0.2, 0.006, 0.16, -0.48 + i * 0.24, 0, 0.12 + j * 0.2, dk(0xc8d4dc, 0.9 + 0.12 * H(i * 3 + j, 82)));
  for (const s of [-1, 1]) for (const v of [0.5, 0.72]) { f.cyl(0.014, 0.018, 0.06, 6, s * 0.16, 0, v, FDARK); f.box(0.02, 0.012, 0.02, s * 0.16, 0.06, v, NEON, 'neon'); }
  for (const [u, v] of [[0.62, 0.62], [-0.62, 0.66]]) { f.box(0.16, 0.05, 0.1, u, 0, v, FDARK); f.box(0.164, 0.006, 0.104, u, 0.05, v, NEON, 'neon'); for (const k2 of [-0.04, 0.04]) f.sphere(0.035, u + k2, 0.08, v, 0x5ac88a, 0, 0.9); }
  for (const [u, v, r] of [[0.66, -0.12, 0.2], [0.68, 0.02, -0.1]]) { const cr = f.sub(u, v, r); cr.box(0.1, 0.08, 0.1, 0, 0, 0, FWALL); cr.box(0.102, 0.008, 0.102, 0, 0.04, 0, NEON, 'neon'); }
  tufts(f, 10, 391, 1.45, [[-1.05, -1.05, 1.05, 1.05], [0.75, 0.75, 1.45, 1.45], [-1.45, 0.75, -0.75, 1.45], [0.75, -1.45, 1.45, -0.75], [-1.45, -1.45, -0.75, -0.75], [-0.4, 0.95, 0.4, 1.45]], false);
}

/**
 * Le grand fort (6 × 6 depuis le 24 nov. 2026, demande de l'auteur) : le fort dessiné pour 3 × 3, agrandi deux fois en plan et
 * de `FORT_UP` en hauteur ; ses soldats, ses personnages, ses drapeaux et ses fumées gardent leur taille (`BIG` détourne les
 * soldats vers les pièces du modèle, aux places agrandies)
 */
const FORT_UP = 1.4;
let BIG: { p: Parts; s: number; sy: number } | null = null;

/** Le fort de la tête de pont (6 × 6 ; 3 × 3 pour un ancien fort resté à sa taille), de l'âge industriel (3) au futuriste (5) */
export function fortModel(p: Parts, age: number, kit: FrontKit, size = 6) {
  const draw = (f: Fr, k: FrontKit) => { if (age <= 3) fortIndustrial(f, k); else if (age === 4) fortModern(f, k); else fortFuture(f, k); };
  if (size <= 3) { draw(new Fr(p, 0, 0), kit); return; }
  const s = size / 3, sy = FORT_UP, q = new Parts();
  const at = (v: V3): V3 => [v[0] * s, G + (v[1] - G) * sy, v[2] * s];
  const big: FrontKit = {
    ...kit,
    sway: (pv, ax, a, fq) => kit.sway(at(pv), ax, a, fq),
    turn: (pv, ax, sp) => kit.turn(at(pv), ax, sp),
    smoke: (x, y, z, k) => kit.smoke(...at([x, y, z]), k),
    figure: (_q, x, z, body, ry, sit, hair, pose, up) => kit.figure(p, x * s, z * s, body, ry, sit, hair, pose, (up ?? 0) * sy),
  };
  BIG = { p, s, sy };
  try { draw(new Fr(q, 0, 0), big); } finally { BIG = null; }
  // les pièces agrandies (les normales refaites : l'agrandissement n'est pas le même en hauteur)
  for (const [from, to] of [[q.body, p.body], [q.glow, p.glow]] as const)
    for (const g of from) { g.translate(0, -G, 0).scale(s, sy, s).translate(0, G, 0); g.computeVertexNormals(); to.push(g); }
  // (seconde passe, à taille réelle) la vie de la grande cour : une section à l'exercice et son sergent, deux tentes, les
  // caisses et les tonneaux du ravitaillement, les râteliers d'armes
  const f = new Fr(p, 0, 0), coat = team(TEAM_A, 0.9), helm = age >= 5 ? 0xdfe6ec : 0x2a2a30, legs = age >= 5 ? 0x8a96a4 : 0x4a4a5a;
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) trooper(f, -1.05 + i * 0.11, 0.72 + r * 0.12, PI, coat, helm, { legs, rifle: true });
  trooper(f, -0.78, 0.5, 0, team(TEAM_A, 1.0), helm, { legs, salute: true });
  for (const [u, v] of [[1.05, 0.55], [1.35, 0.55]] as const) {
    const t = f.sub(u, v);
    t.add(new THREE.ConeGeometry(0.17, 0.2, 4).rotateY(PI / 4), 0, 0.1, 0, age >= 5 ? 0xd8dee4 : age === 4 ? 0x6a7a4a : 0xe8e0c8);
    t.box(0.06, 0.1, 0.004, 0, 0, 0.12, 0x3a3028);
  }
  for (let i = 0; i < 4; i++) crate(f, 0.95 + (i % 2) * 0.12, (i >> 1) * 0.1, 0.95, 0.1, 0.1 * i);
  for (const [u, v] of [[1.25, 0.95], [1.32, 1.02], [1.18, 1.04]] as const) barrel(f, u, v, 0.9);
  for (const u of [-1.2, -0.95]) { f.box(0.18, 0.012, 0.03, u, 0.12, 1.05, DWOOD); for (let k = 0; k < 5; k++) f.box(0.008, 0.15, 0.012, u - 0.07 + k * 0.035, 0, 1.06, 0x3a3028); }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* BATTERIE CÔTIÈRE (2 × 2) : les pièces tirent vers +z, le large                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Parapet en ligne brisée par les points `pts` ([u, v]) : talus, mur, couronnement, glacis côté large */
function parapet(f: Fr, pts: [number, number][], h: number, wall: number, cap: number, glacis = 0) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    along(f, a, b, 0.14, h, 0, wall, 0, false, -0.03);
    along(f, a, b, 0.16, 0.016, h, cap, 0.0, false, -0.03);
    if (glacis) {
      const du = b[0] - a[0], dv = b[1] - a[1], L = Math.hypot(du, dv), nu = dv / L, nv = -du / L;
      f.sub((a[0] + b[0]) / 2 + nu * 0.15, (a[1] + b[1]) / 2 + nv * 0.15, Math.atan2(du, dv)).add(new THREE.BoxGeometry(0.2, 0.012, L + 0.03).rotateZ(-0.55), 0, h * 0.45, 0, glacis);
    }
  }
}
const ARC: [number, number][] = [[-0.9, 0.5], [-0.5, 0.76], [0, 0.84], [0.5, 0.76], [0.9, 0.5]];

/** Industriel : deux canons lourds sur plateformes tournantes derrière un parapet de pierre, la traverse, la poudrière enterrée */
function batteryIndustrial(f: Fr, kit: FrontKit) {
  const stone = 0xb0a898, stoneD = 0x8f887a, grass = 0x7a9a5a;
  // le parapet en arc face au large, ses embrasures devant les pièces
  parapet(f, ARC, 0.14, stone, 0xd0c8b8, grass);
  // les deux pièces : plateforme de pierre, rail, affût à glissière, long fût, culasse, tourillons ; boulets et écouvillon
  for (const s of [-1, 1]) {
    const g = f.sub(s * 0.45, 0.28, -s * 0.12);
    g.cyl(0.25, 0.26, 0.03, 12, 0, 0, 0, stoneD); g.cyl(0.21, 0.21, 0.006, 12, 0, 0.03, 0, 0x4a4e52); g.cyl(0.19, 0.19, 0.008, 12, 0, 0.03, 0, stone);
    g.box(0.06, 0.016, 0.34, 0, 0.034, 0, IRON);
    for (const t of [-1, 1]) { g.tilt(0.016, 0.07, 0.2, t * 0.045, 0.04, -0.02, 0x4a4e52, 0); g.lying(0.02, 0.018, 8, t * 0.062, 0.05, -0.12, 0x2a2c2e, 'x'); }
    g.add(new THREE.CylinderGeometry(0.022, 0.036, 0.44, 10).rotateX(PI / 2 - 0.15), 0, 0.15, 0.12, GUN);
    g.cyl(0.04, 0.04, 0.05, 10, 0, 0.12, -0.12, GUN); g.lying(0.012, 0.12, 6, 0, 0.14, -0.02, IRON, 'x');
    g.add(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8).rotateX(PI / 2 - 0.15), 0, 0.18, 0.33, dk(GUN, 0.8));
    g.tube([0.12, 0.0, -0.18], [0.16, 0.2, -0.2], 0.004, DWOOD, false, 3); g.cyl(0.012, 0.012, 0.03, 5, 0.16, 0.2, -0.2, 0x3a3026);
    shells(g.sub(-0.14, -0.2), 0, 0, true);
  }
  // la traverse de terre entre les pièces : butte d'herbe, niche à munitions, porte
  const t = f.sub(0, 0.14);
  t.add(new THREE.CylinderGeometry(0.14, 0.14, 0.34, 8, 1, false, -PI / 2, PI).rotateX(PI / 2).rotateZ(PI / 2).scale(1, 0.8, 1), 0, 0, 0, grass);
  t.box(0.1, 0.09, 0.02, 0, 0, -0.17, stone); t.box(0.06, 0.07, 0.006, 0, 0, -0.18, 0x3a3e44);
  // la poudrière enterrée au fond : butte, façade de pierre, porte de fer, évents ; la grue à munitions et son palan
  const m = f.sub(0.38, -0.66);
  m.add(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8, 1, false, -PI / 2, PI).rotateX(PI / 2).rotateZ(PI / 2).scale(1, 0.8, 1).rotateY(PI / 2), 0, 0, 0, grass);
  m.box(0.3, 0.15, 0.04, 0, 0, 0.24, stone); m.box(0.32, 0.02, 0.05, 0, 0.15, 0.24, 0xd0c8b8); m.box(0.08, 0.11, 0.006, 0, 0, 0.262, 0x3a3e44); m.box(0.12, 0.016, 0.006, 0, 0.12, 0.262, 0xd8c050);
  for (const u of [-0.1, 0.1]) m.cyl(0.014, 0.014, 0.06, 6, u, 0.14, 0.05, stoneD);
  const d = f.sub(0.0, -0.32);
  d.cyl(0.016, 0.02, 0.32, 6, 0, 0, 0, DWOOD); d.box(0.24, 0.016, 0.016, 0.1, 0.3, 0, DWOOD); d.tube([0.0, 0.2, 0], [0.12, 0.3, 0], 0.005, DWOOD, false, 3);
  d.cyl(0.002, 0.002, 0.14, 3, 0.2, 0.16, 0, IRON); d.box(0.03, 0.03, 0.03, 0.2, 0.13, 0, 0x6a6e72); d.box(0.06, 0.04, 0.08, 0.2, 0.0, 0, 0x8a6a48);
  // le poste d'observation (à gauche) : tour de pierre basse, télémètre sur trépied, l'officier à la lunette
  const o = f.sub(-0.6, -0.55);
  o.box(0.3, 0.22, 0.26, 0, 0, 0, stone); o.box(0.32, 0.02, 0.28, 0, 0.22, 0, 0xd0c8b8);
  for (const [a, b, w, dd] of [[0, 0.13, 0.32, 0.02], [0, -0.13, 0.32, 0.02], [0.15, 0, 0.02, 0.28], [-0.15, 0, 0.02, 0.28]]) o.box(w, 0.05, dd, a, 0.24, b, stoneD);
  o.box(0.06, 0.16, 0.006, 0.06, 0, 0.131, 0x3a2e24); o.box(0.2, 0.03, 0.006, -0.02, 0.17, 0.131, 0x24201c);
  for (const k of [0, 2.1, 4.2]) o.tube([Math.sin(k) * 0.03, 0.24, Math.cos(k) * 0.03], [0, 0.32, 0], 0.003, IRON, false, 3);
  o.lying(0.012, 0.2, 6, 0, 0.33, 0, 0x6a6e72, 'x'); for (const s of [-1, 1]) o.box(0.024, 0.024, 0.024, s * 0.1, 0.32, 0, 0x4a4e52);
  trooper(o, -0.08, 0.02, 0.6, team(TEAM_A, 1.0), 0x2a2a30, { legs: 0x4a4a5a, y: 0.24 });
  // les servants, le drapeau, le bec de gaz, les tonneaux de poudre, herbes
  trooper(f, -0.25, 0.08, 0.4, team(TEAM_A, 0.9), 0x2a2a30, { legs: 0x4a4a5a });
  trooper(f, 0.62, 0.02, -0.3, team(TEAM_A, 0.9), 0x2a2a30, { legs: 0x4a4a5a });
  folk(f, kit, 0.28, 0.06, -0.5, team(TEAM_A, 0.9), 0x2a2a30); folk(f, kit, -0.7, 0.18, 0.4, team(TEAM_A, 0.9), 0x2a2a30);
  mast(f, kit, -0.86, -0.12, 0.66, 0.2, 0.11, IRON);
  lamp(f, -0.2, -0.5, 3, 0.3);
  for (const [u, v] of [[0.72, -0.3], [0.8, -0.24], [0.76, -0.38]]) barrel(f, u, v, 0.85, 0x5a4636);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2 - j; i++) crate(f, -0.3 + i * 0.09 + j * 0.045, j * 0.072, -0.7, 0.085, 0.05, 0x9a7a52, 0x2a2420);
  bush(f, 0.88, -0.86, 0.05); bush(f, -0.88, 0.3, 0.04); tree(f, -0.3, -0.9, 0.8, 0x5f9a50);
  path(f, -0.05, -0.95, 0.0, -0.05, 0.12, 0x9a948a, 91, 0.1);
  // seconde passe : la voie étroite du magasin aux pièces et son wagonnet d'obus, le mât de signaux, la ligne du téléphone, la guérite
  { const a: [number, number] = [0.36, -0.42], b: [number, number] = [0.12, 0.02];
    for (const s of [-1, 1]) along(f, [a[0] + s * 0.03, a[1]], [b[0] + s * 0.03, b[1]], 0.008, 0.008, 0.006, 0x5a5e62);
    for (let i = 0; i < 7; i++) { const t = (i + 0.5) / 7; f.sub(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])).box(0.1, 0.008, 0.02, 0, 0, 0, 0x6a4a34); }
    const w = f.sub(0.28, -0.26, Math.atan2(b[0] - a[0], b[1] - a[1]));
    w.box(0.08, 0.03, 0.12, 0, 0.03, 0, 0x5a5e62); for (const s of [-1, 1]) for (const d of [-0.04, 0.04]) w.lying(0.016, 0.006, 6, s * 0.03, 0.02, d, 0x2a2c2e, 'x');
    for (const k of [-0.022, 0.022]) { w.cyl(0.016, 0.018, 0.07, 6, k, 0.06, 0, 0x2a2a2e); w.cone(0.016, 0.03, 6, k, 0.13, 0, 0x2a2a2e); } }
  f.cyl(0.006, 0.008, 0.6, 4, -0.9, 0, -0.88, DWOOD); f.box(0.16, 0.008, 0.008, -0.9, 0.5, -0.88, DWOOD);
  for (const [s, c] of [[-1, REDX], [1, 0xf2d25a]] as [number, number][]) { const [x, , z] = f.w(-0.9 + s * 0.07, 0, -0.88); kit.sway([x, 0.5, z], [1, 0, 0], 0.3, 1.0).box(0.006, 0.05, 0.05, 0, -0.03, 0.0, c); }
  for (const [u, v] of [[-0.42, -0.9], [0.12, -0.9]]) { f.cyl(0.006, 0.008, 0.34, 4, u, 0, v, 0x6a4a34); f.box(0.06, 0.008, 0.008, u, 0.32, v, 0x6a4a34); }
  f.tube([-0.42, 0.33, -0.9], [0.12, 0.33, -0.9], 0.0015, 0x2a2a2a, false, 3); f.tube([-0.42, 0.33, -0.9], [-0.55, 0.3, -0.7], 0.0015, 0x2a2a2a, false, 3);
  sentry(f, 0.86, -0.72, -PI / 2); trooper(f, 0.86, -0.56, -PI / 2, team(TEAM_A, 0.9), 0x2a2a30, { legs: 0x4a4a5a, rifle: true });
  lantern(f.sub(0, -0.32), 0.0, 0.29, 0.03);
  tufts(f, 22, 401, 0.95, [[-0.85, -0.82, 0.62, -0.42], [-0.75, -0.08, 0.75, 0.62], [0.55, -0.45, 0.92, -0.15], [-0.95, 0.45, 0.95, 0.95]]);
}

/** Moderne : deux tourelles blindées sur leurs cuves de béton, filet de camouflage, tour de conduite de tir et son radar */
function batteryModern(f: Fr, kit: FrontKit) {
  const grass = 0x7a9060, camo = [0x5a6444, 0x6a7450, 0x4a5438, 0x7a7a58];
  parapet(f, ARC, 0.13, CONC, CONC_L, grass);
  // les tourelles : cuve de béton, couronne, caisse blindée à pans, masque, long tube, frein de bouche, écoutille, notre écu
  for (const s of [-1, 1]) {
    const g = f.sub(s * 0.45, 0.26, -s * 0.15);
    g.cyl(0.24, 0.25, 0.06, 12, 0, 0, 0, CONC_D); g.cyl(0.2, 0.2, 0.008, 12, 0, 0.06, 0, 0x4a4e52);
    g.box(0.22, 0.1, 0.22, 0, 0.068, -0.03, OLIVE); g.tilt(0.22, 0.012, 0.1, 0, 0.12, 0.1, OLIVE_D, 0.9); g.box(0.24, 0.012, 0.24, 0, 0.168, -0.03, OLIVE_D);
    g.box(0.07, 0.07, 0.04, 0, 0.11, 0.1, dk(OLIVE, 0.85));
    g.lying(0.018, 0.34, 8, 0, 0.16, 0.29, dk(OLIVE, 0.8)); g.lying(0.026, 0.04, 8, 0, 0.16, 0.47, 0x3a3e40);
    g.cyl(0.03, 0.03, 0.016, 8, 0.05, 0.18, -0.08, OLIVE_D); g.box(0.004, 0.05, 0.06, 0.112, 0.09, -0.05, TEAM_EMBLEM);
    g.box(0.06, 0.03, 0.012, -0.06, 0.18, -0.08, 0x2a2c2e);
  }
  // le filet de camouflage sur perches au-dessus de la tourelle de gauche
  for (const [u, v] of [[-0.78, 0.0], [-0.12, 0.0], [-0.78, 0.5], [-0.12, 0.5]]) f.cyl(0.006, 0.008, 0.3, 4, u, 0, v, DWOOD);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) f.add(new THREE.BoxGeometry(0.17, 0.006, 0.17).rotateX(0.08 * (j - 1)).rotateZ(0.06 * (i - 1.5)), -0.7 + i * 0.165, 0.29 + 0.012 * H(i, j), 0.08 + j * 0.165, camo[(i + j * 2) % 4]);
  // la tour de conduite de tir : béton, bandeau de visée, télémètre, radar qui tourne
  const o = f.sub(-0.58, -0.56);
  o.box(0.3, 0.42, 0.28, 0, 0, 0, CONC); o.box(0.32, 0.016, 0.3, 0, 0.2, 0, CONC_L);
  o.box(0.3, 0.04, 0.006, 0, 0.32, 0.142, 0x1a1e22); o.box(0.06, 0.03, 0.006, 0.08, 0.33, 0.145, 0xffe2a0, true);
  o.box(0.08, 0.16, 0.008, -0.06, 0, 0.142, 0x4a5a4a); o.box(0.34, 0.02, 0.32, 0, 0.42, 0, CONC_L);
  o.lying(0.014, 0.28, 6, 0, 0.47, 0, 0x5d6168, 'x'); for (const s of [-1, 1]) o.box(0.03, 0.03, 0.03, s * 0.14, 0.455, 0, 0x4a4e52); o.box(0.03, 0.04, 0.03, 0, 0.42, 0, 0x4a4e52);
  o.cyl(0.008, 0.01, 0.16, 5, 0.1, 0.44, -0.1, STEEL);
  const rd = new Fr(kit.turn(o.w(0.1, 0.62, -0.1), [0, 1, 0], 0.35), 0, 0, 0, 0);
  rd.box(0.2, 0.03, 0.012, 0, 0, 0.02, 0xd8d8d0); rd.box(0.012, 0.012, 0.04, 0, 0, 0.0, STEEL);
  trooper(o, 0.06, 0.06, 0.3, OLIVE, OLIVE_D, { legs: OLIVE_D, y: 0.44 });
  // le magasin à obus : casemate de béton sous sa butte, porte d'acier ; obus alignés, monte-charge
  const m = f.sub(0.4, -0.66);
  m.add(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8, 1, false, -PI / 2, PI).rotateX(PI / 2).rotateZ(PI / 2).scale(1, 0.8, 1).rotateY(PI / 2), 0, 0, 0, grass);
  m.box(0.32, 0.15, 0.04, 0, 0, 0.24, CONC); m.box(0.1, 0.12, 0.006, 0, 0, 0.262, 0x4a5a4a); m.box(0.06, 0.03, 0.004, 0.11, 0.08, 0.262, 0xf2c23a);
  m.box(0.03, 0.02, 0.006, -0.1, 0.12, 0.262, 0xffe2a0, true);
  shells(f.sub(0.08, -0.36), 0, 0, false); shells(f.sub(0.3, -0.3, 0.3), 0, 0, false);
  ammoStack(f, 0.72, -0.25, 0.4, 2, 2);
  // sacs de sable, servants, la jeep, projecteur, le drapeau, réverbère, herbes
  bags(f, -0.25, -0.18, 0.25, -0.18, 2);
  trooper(f, -0.2, 0.0, 0.3, OLIVE, OLIVE_D, { legs: OLIVE_D }); trooper(f, 0.66, 0.0, -0.4, OLIVE, OLIVE_D, { legs: OLIVE_D, rifle: true });
  folk(f, kit, 0.24, 0.02, -0.4, OLIVE, OLIVE_D); folk(f, kit, -0.04, -0.5, 2.6, OLIVE, OLIVE_D);
  jeep(f, -0.18, -0.82, PI / 2 - 0.2);
  searchlight(f, 0.0, 0.0, 0.62, 0, 0.35); f.box(0.08, 0.04, 0.08, 0.0, -0.01, 0.62, CONC_D);
  mast(f, kit, -0.88, -0.12, 0.72, 0.22, 0.12);
  lamp(f, 0.9, -0.45, 4, 0.34, -PI / 2);
  bush(f, 0.88, -0.88, 0.05); bush(f, -0.88, 0.32, 0.04);
  path(f, 0.0, -0.95, 0.0, -0.25, 0.12, 0x8a8e92, 92, 0.1);
  // seconde passe : la mitrailleuse double antiaérienne dans son anneau de sacs, le téléphone de campagne et sa ligne
  const aa = f.sub(0.0, 0.16);
  for (let k = 0; k < 6; k++) { const q = (k / 6) * PI * 2; aa.sub(Math.sin(q) * 0.1, Math.cos(q) * 0.1, q).box(0.055, 0.034, 0.05, 0, 0, 0, dk(KHAKI, 0.85 + 0.2 * H(k, 412))); }
  aa.cyl(0.02, 0.03, 0.06, 6, 0, 0, 0, OLIVE_D); aa.box(0.06, 0.03, 0.05, 0, 0.06, 0, OLIVE);
  for (const s of [-1, 1]) aa.add(new THREE.CylinderGeometry(0.006, 0.008, 0.14, 5).rotateX(PI / 2 - 0.7), s * 0.018, 0.12, 0.05, 0x2a2c2e);
  aa.box(0.04, 0.006, 0.04, 0, 0.05, -0.05, 0x2a2c2e);
  f.box(0.04, 0.03, 0.03, -0.42, 0.03, -0.2, OLIVE_D); f.box(0.02, 0.03, 0.02, -0.42, 0, -0.2, OLIVE_D); f.tube([-0.42, 0.04, -0.2], [-0.58, 0.3, -0.42], 0.0015, 0x2a2a2a, false, 3);
  tufts(f, 20, 411, 0.95, [[-0.9, -0.84, 0.66, -0.4], [-0.82, -0.08, 0.75, 0.62], [0.55, -0.45, 0.92, -0.15], [-0.95, 0.45, 0.95, 0.95], [-0.35, -0.95, 0.05, -0.7]]);
}

/** Futuriste : le lance-missiles sur sa tourelle, le canon électrique et ses anneaux, le mât des capteurs, le parapet d'énergie */
function batteryFuture(f: Fr, kit: FrontKit) {
  parapet(f, ARC, 0.12, FWALL, FDARK);
  for (let i = 0; i + 1 < ARC.length; i++) { const a = ARC[i], b = ARC[i + 1]; along(f, a, b, 0.012, 0.01, 0.125, NEON, 0.02, 'neon', -0.02); along(f, a, b, 0.008, 0.1, 0.14, 0x7ac8f0, 0, 'neon', 0.1); }
  // le lance-missiles : socle tournant, berceau, caisson de douze tubes aux bouches lumineuses, liseré
  const l = f.sub(-0.45, 0.26, 0.15);
  l.cyl(0.22, 0.24, 0.04, 12, 0, 0, 0, FDARK); l.add(new THREE.TorusGeometry(0.2, 0.006, 3, 16).rotateX(PI / 2), 0, 0.042, 0, NEON, 'neon');
  l.cyl(0.1, 0.12, 0.08, 8, 0, 0.04, 0, FWALL);
  for (const s of [-1, 1]) l.box(0.02, 0.12, 0.08, s * 0.11, 0.08, 0, FDARK);
  const box = l.sub(0, 0, 0, 0.2);
  box.add(new THREE.BoxGeometry(0.2, 0.14, 0.3).rotateX(-0.5), 0, 0, 0, FWALL);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const ly = -0.045 + i * 0.03; box.add(new THREE.BoxGeometry(0.03, 0.024, 0.01).rotateX(-0.5), -0.06 + j * 0.06, 0.878 * ly + 0.072, -0.479 * ly + 0.138, i % 2 ? NEON : 0xff6a3a, 'neon'); }
  box.add(new THREE.BoxGeometry(0.204, 0.008, 0.3).rotateX(-0.5), 0, 0.03, 0, NEON, 'neon');
  box.add(new THREE.BoxGeometry(0.004, 0.06, 0.08).rotateX(-0.5), 0.103, 0.0, -0.04, TEAM_EMBLEM);
  // le canon électrique : socle, deux rails, anneaux de bobines lumineuses, condensateurs
  const r = f.sub(0.45, 0.24, -0.15);
  r.cyl(0.22, 0.24, 0.04, 12, 0, 0, 0, FDARK); r.cyl(0.12, 0.14, 0.08, 8, 0, 0.04, 0, FWALL);
  r.box(0.14, 0.08, 0.2, 0, 0.12, -0.04, FWALL);
  for (const s of [-1, 1]) r.add(new THREE.BoxGeometry(0.02, 0.03, 0.5).rotateX(-0.12), s * 0.03, 0.18, 0.26, FDARK);
  for (let i = 0; i < 5; i++) r.add(new THREE.TorusGeometry(0.05, 0.007, 3, 10), 0, 0.17 + i * 0.02 * Math.sin(0.12) * 4, 0.1 + i * 0.08, NEON, 'neon');
  for (const s of [-1, 1]) { r.cyl(0.03, 0.03, 0.12, 8, s * 0.1, 0.12, -0.12, FDARK); r.cyl(0.032, 0.032, 0.01, 8, s * 0.1, 0.2, -0.12, NEON, 'neon'); }
  // le mât des capteurs : fût, anneau qui tourne, boule de détection ; la batterie d'énergie et ses câbles
  const c = f.sub(-0.6, -0.55);
  c.box(0.28, 0.18, 0.24, 0, 0, 0, FWALL); c.box(0.282, 0.01, 0.242, 0, 0.12, 0, NEON, 'neon'); c.box(0.08, 0.14, 0.006, 0.05, 0, 0.122, FGLASS, 'neon');
  c.cyl(0.016, 0.022, 0.5, 6, -0.06, 0.18, -0.04, FDARK); c.ball(0.04, -0.06, 0.72, -0.04, FWALL, false, 1);
  const rg = new Fr(kit.turn(c.w(-0.06, 0.6, -0.04), [0, 1, 0], 0.4), 0, 0, 0, 0);
  rg.add(new THREE.TorusGeometry(0.08, 0.006, 3, 12).rotateX(PI / 2), 0, 0, 0, NEON, 'neon'); rg.box(0.18, 0.04, 0.008, 0, 0, 0.0, FDARK); rg.box(0.17, 0.03, 0.004, 0, 0.005, 0.006, 0x7ac8f0, 'neon');
  const e = f.sub(0.42, -0.62);
  for (let i = 0; i < 3; i++) { e.cyl(0.06, 0.06, 0.2, 10, -0.14 + i * 0.14, 0, 0, FWALL); e.cyl(0.062, 0.062, 0.012, 10, -0.14 + i * 0.14, 0.12, 0, NEON_G, 'neon'); e.cyl(0.04, 0.04, 0.02, 8, -0.14 + i * 0.14, 0.2, 0, FDARK); }
  e.box(0.42, 0.03, 0.14, 0, 0, 0.0, FDARK);
  f.tube([0.42, 0.02, -0.5], [0.45, 0.02, 0.06], 0.008, FDARK, false, 4); f.tube([0.28, 0.02, -0.55], [-0.45, 0.02, 0.08], 0.008, FDARK, false, 4);
  // l'équipage en armure blanche, robot, caisses, le drapeau, lampadaires, jardinières
  trooper(f, -0.15, 0.02, 0.3, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8 }); trooper(f, 0.7, -0.05, -0.4, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8, rifle: true });
  folk(f, kit, 0.18, -0.12, -0.6, 0xdfe8f0, 0x3a3a48); robot(f, -0.05, -0.4, 0.6);
  for (const [u, v, rr] of [[0.0, -0.75, 0.2], [0.1, -0.78, -0.1], [0.05, -0.76, 0.05]]) { const cr = f.sub(u, v, rr, u === 0.05 ? 0.08 : 0); cr.box(0.09, 0.08, 0.09, 0, 0, 0, FWALL); cr.box(0.092, 0.008, 0.092, 0, 0.04, 0, NEON, 'neon'); }
  mast(f, kit, -0.88, -0.12, 0.74, 0.22, 0.12, FWALL, NEON);
  lamp(f, 0.9, -0.3, 5, 0.34); lamp(f, -0.3, -0.25, 5, 0.34);
  for (const [u, v] of [[0.86, -0.86], [-0.86, 0.3]]) { f.box(0.12, 0.04, 0.12, u, 0, v, FDARK); f.sphere(0.045, u, 0.07, v, 0x5ac88a, 0, 0.9); }
  path(f, 0.0, -0.95, 0.0, -0.3, 0.12, 0xc8d4dc, 93, 0.1);
  // seconde passe : la table de visée holographique, les missiles de rechange sur leur berceau, le lanceur de drones
  holo(f, 0.16, -0.3, 0.2, 0.18, 0xff8a5a);
  const mr = f.sub(-0.2, -0.22, PI / 2); for (const s of [-1, 1]) mr.box(0.02, 0.04, 0.12, s * 0.12, 0, 0, FDARK);
  for (let i = 0; i < 3; i++) { mr.lying(0.016, 0.24, 6, 0, 0.05 + (i === 2 ? 0.03 : 0), -0.03 + (i % 2) * 0.034 + (i === 2 ? 0.017 : 0), FWALL, 'x'); mr.add(new THREE.ConeGeometry(0.016, 0.04, 6).rotateZ(-PI / 2), 0.14, 0.05 + (i === 2 ? 0.03 : 0), -0.03 + (i % 2) * 0.034 + (i === 2 ? 0.017 : 0), 0xff6a3a); }
  const dl = f.sub(0.74, -0.24); dl.box(0.16, 0.06, 0.16, 0, 0, 0, FDARK); dl.box(0.162, 0.006, 0.162, 0, 0.06, 0, NEON, 'neon');
  const dd = new Fr(kit.turn(dl.w(0, 0.3, 0), [0, 1, 0], 0.3), 0, 0, 0, 0); dd.cyl(0.03, 0.024, 0.016, 8, 0.12, 0, 0, FWALL); dd.add(new THREE.TorusGeometry(0.034, 0.003, 3, 8).rotateX(PI / 2), 0.12, 0.008, 0, 0xff6a3a, 'neon');
  tufts(f, 16, 421, 0.95, [[-0.9, -0.84, 0.66, -0.36], [-0.82, -0.08, 0.75, 0.62], [-0.95, 0.45, 0.95, 0.95], [-0.2, -0.95, 0.2, -0.3]], false);
}

/** La batterie côtière (2 × 2), de l'âge industriel (3) au futuriste (5) ; les pièces tirent vers +z */
export function coastBattery(p: Parts, age: number, kit: FrontKit) {
  const f = new Fr(p, 0, 0);
  if (age <= 3) batteryIndustrial(f, kit);
  else if (age === 4) batteryModern(f, kit);
  else batteryFuture(f, kit);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* CASERNE DE LA GARNISON (2 × 2)                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Guérite rayée à nos couleurs : caisson, toit, lucarne, rayures */
function sentry(f: Fr, u: number, v: number, ry: number, fut = false) {
  const g = f.sub(u, v, ry);
  g.box(0.1, 0.2, 0.1, 0, 0, 0, fut ? FWALL : 0xe8e4dc);
  for (let i = 0; i < 3; i++) g.box(0.104, 0.03, 0.104, 0, 0.02 + i * 0.06, 0, fut ? NEON : TEAM_A, fut ? 'neon' : false);
  g.pyramid(0.14, 0.06, 0.14, 0, 0.2, 0, fut ? FDARK : 0x5d6168);
  g.box(0.06, 0.12, 0.004, 0, 0.03, 0.052, 0x2a2e32); g.box(0.05, 0.03, 0.004, 0, 0.15, 0.052, GLASS, true);
}

/** Moderne : le bâtiment de béton à deux niveaux, la cour d'exercice, la section en rang devant le sergent, le mât */
function barracksModernG(f: Fr, kit: FrontKit) {
  const W = 1.5, D = 0.46, h = 0.44, frame = 0x5d6168;
  // le bâtiment : socle, béton à joints, bandeaux, deux rangs de fenêtres, entrée sous marquise, perron, toit-terrasse
  const b = f.sub(0, -0.62);
  b.box(W + 0.04, 0.03, D + 0.04, 0, 0, 0, CONC_D); b.box(W, h, D, 0, 0.03, 0, 0xc8c4b8);
  for (let i = 1; i < 10; i++) b.box(0.006, h, D + 0.006, -W / 2 + (i * W) / 10, 0.03, 0, 0xb4b0a4);
  b.box(W + 0.02, 0.016, D + 0.02, 0, 0.24, 0, CONC_L); b.box(W + 0.04, 0.03, D + 0.04, 0, h + 0.03, 0, CONC_L);
  const us = [-0.62, -0.46, -0.3, -0.14, 0.14, 0.3, 0.46, 0.62];
  winRow(b, us, 0.09, D / 2 + 0.004, 0.09, 0.1, frame, GLASS, 101); winRow(b, us, 0.3, D / 2 + 0.004, 0.09, 0.1, frame, GLASS, 102);
  winRow(b, [0, ...us.filter((u) => Math.abs(u) > 0.2)], 0.3, D / 2 + 0.004, 0.09, 0.1, frame, GLASS, 103, false);
  door(b, 0, D / 2 + 0.006, 0.14, 0.18, 0x3a4a5a, frame, 0.03, false);
  b.tilt(0.3, 0.014, 0.14, 0, 0.23, D / 2 + 0.07, CONC_L, 0.06); for (const s of [-1, 1]) b.box(0.014, 0.2, 0.014, s * 0.13, 0.03, D / 2 + 0.13, frame);
  for (let k = 0; k < 2; k++) b.box(0.34 - k * 0.06, 0.015, 0.06, 0, k * 0.015, D / 2 + 0.03 + k * 0.03, CONC_D);
  b.box(0.2, 0.04, 0.008, 0, 0.255, D / 2 + 0.006, OLIVE_D); b.box(0.05, 0.034, 0.004, -0.06, 0.258, D / 2 + 0.011, TEAM_EMBLEM); for (let i = 0; i < 3; i++) b.box(0.02, 0.016, 0.004, 0.0 + i * 0.03, 0.265, D / 2 + 0.011, 0xfff1c9, true);
  for (const u of [-W / 2 + 0.02, W / 2 - 0.02]) b.box(0.012, h, 0.012, u, 0.03, D / 2 + 0.008, 0x6a6e72);
  const wt = b.sub(0.5, -0.06, 0, h + 0.06);
  for (const [a, c] of [[-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05], [0.05, 0.05]]) wt.box(0.01, 0.1, 0.01, a, 0, c, STEEL);
  wt.cyl(0.08, 0.08, 0.1, 10, 0, 0.1, 0, 0xd8d8d0); wt.cone(0.085, 0.04, 10, 0, 0.2, 0, 0x8a8f96);
  b.cyl(0.006, 0.008, 0.3, 4, -0.5, h + 0.06, -0.08, STEEL); b.ball(0.01, -0.5, h + 0.37, -0.08, 0xff4a4a, true);
  for (const u of [-0.2, 0.1]) { b.box(0.1, 0.06, 0.08, u, h + 0.06, 0.02, 0xd8d8d0); b.cyl(0.025, 0.025, 0.008, 8, u, h + 0.12, 0.02, 0x3c4048); }
  // la cour d'exercice : bitume en dalles, lignes blanches, la section en deux rangs face au sergent
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) f.box(0.27, 0.005, 0.2, -0.56 + i * 0.28, 0, -0.18 + j * 0.21, dk(ASPH, 0.92 + 0.12 * H(i * 3 + j, 104)));
  for (const v of [-0.08, 0.4]) f.box(1.1, 0.003, 0.012, 0, 0.005, v, 0xe8e8e0);
  for (let i = 0; i < 4; i++) f.box(0.012, 0.003, 0.08, -0.36 + i * 0.24, 0.005, 0.16, 0xe8e8e0);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) trooper(f, -0.27 + i * 0.18, 0.24 + r * 0.13, PI, OLIVE, OLIVE_D, { legs: OLIVE_D, rifle: true });
  trooper(f, 0.0, 0.0, 0, OLIVE, team(TEAM_A, 0.8), { legs: OLIVE_D, band: true });
  // le mât et son massif, la guérite, la barrière, la jeep, le parcours (pneus, barre fixe), bancs et réverbères
  const fm = f.sub(-0.76, 0.12);
  fm.cyl(0.09, 0.1, 0.03, 8, 0, 0, 0, CONC_D); for (let i = 0; i < 6; i++) fm.sphere(0.022, Math.sin(i) * 0.065, 0.035, Math.cos(i) * 0.065, [0xd84a5a, 0xf2d25a, 0xe8e4f0][i % 3]);
  mast(fm, kit, 0, 0, 0.86, 0.26, 0.15);
  sentry(f, 0.82, 0.82, -PI / 2);
  f.box(0.03, 0.08, 0.03, 0.62, 0, 0.9, STEEL); for (let i = 0; i < 5; i++) f.box(0.06, 0.012, 0.012, 0.56 - i * 0.06, 0.07, 0.9, i % 2 ? REDX : WHITE);
  jeep(f, 0.7, 0.4, -0.3);
  for (let i = 0; i < 4; i++) f.cyl(0.035, 0.035, 0.024, 10, -0.5 + i * 0.08, 0, 0.72 + (i % 2) * 0.04, 0x24262a);
  for (const s of [-1, 1]) f.box(0.012, 0.2, 0.012, -0.05 + s * 0.08, 0, 0.78, STEEL); f.box(0.17, 0.008, 0.008, -0.05, 0.2, 0.78, STEEL);
  folk(f, kit, 0.08, 0.82, 0.6, OLIVE, OLIVE_D, false, 'run'); folk(f, kit, -0.25, 0.86, 1.4, OLIVE, OLIVE_D, false, 'run');
  for (const u of [-0.42, 0.42]) { f.box(0.16, 0.012, 0.05, u, 0.04, -0.3, WOOD); f.box(0.16, 0.04, 0.01, u, 0.05, -0.322, WOOD); for (const d of [-0.06, 0.06]) f.box(0.01, 0.04, 0.044, u + d, 0, -0.3, STEEL); }
  lamp(f, -0.6, 0.55, 4, 0.34, 0); lamp(f, 0.6, -0.3, 4, 0.34, PI);
  tree(f, -0.9, 0.5, 1.0); tree(f, -0.9, 0.9, 0.8, 0x5f9a50); tree(f, 0.9, -0.1, 0.9); bush(f, 0.35, 0.9, 0.045); bush(f, -0.92, -0.2, 0.045);
  tufts(f, 14, 431, 0.95, [[-0.8, -0.9, 0.8, -0.34], [-0.7, -0.3, 0.75, 0.5], [0.45, 0.2, 0.95, 0.95], [-0.62, 0.6, 0.1, 0.95]]);
}

/** Futuriste : la caserne de composite à baies lumineuses, la cour à hologramme d'exercice, la section en armure blanche */
function barracksFutureG(f: Fr, kit: FrontKit) {
  const W = 1.5, D = 0.46, h = 0.44;
  const b = f.sub(0, -0.62);
  b.box(W + 0.06, 0.04, D + 0.06, 0, 0, 0, FDARK); b.box(W, h, D, 0, 0.04, 0, FWALL);
  for (const s of [-1, 1]) b.cyl(D / 2, D / 2, h, 12, s * W / 2, 0.04, 0, FWALL);
  for (const y of [0.1, 0.28]) { b.box(W - 0.1, 0.1, 0.008, 0, y, D / 2 + 0.002, FGLASS, 'neon'); for (let i = 0; i < 9; i++) b.box(0.01, 0.1, 0.012, -W / 2 + 0.05 + (i * (W - 0.1)) / 8, y, D / 2 + 0.004, FDARK); }
  for (const y of [0.24, h + 0.02]) b.box(W, 0.01, 0.008, 0, y, D / 2 + 0.004, NEON, 'neon');
  b.box(0.2, 0.2, 0.012, 0, 0.04, D / 2 + 0.006, 0x1a2a3a); b.box(0.004, 0.2, 0.016, 0, 0.04, D / 2 + 0.008, NEON, 'neon');
  b.box(0.3, 0.1, 0.012, 0, 0.3, D / 2 + 0.01, FDARK); b.box(0.08, 0.07, 0.004, -0.08, 0.315, D / 2 + 0.017, TEAM_EMBLEM); b.box(0.12, 0.012, 0.004, 0.06, 0.34, D / 2 + 0.017, NEON, 'neon');
  b.box(W - 0.1, 0.04, D - 0.08, 0, h + 0.04, 0, 0xd8e2ea);
  for (const u of [-0.45, -0.15, 0.15]) { b.add(new THREE.BoxGeometry(0.24, 0.008, 0.16).rotateX(-0.3), u, h + 0.1, -0.02, 0x2a4a8a); b.add(new THREE.BoxGeometry(0.24, 0.004, 0.008).rotateX(-0.3), u, h + 0.106, -0.02, NEON, 'neon'); }
  b.cyl(0.01, 0.014, 0.3, 6, 0.5, h + 0.08, -0.04, FDARK); b.ball(0.018, 0.5, h + 0.4, -0.04, 0xff4a4a, 'neon');
  // la cour : carreaux clairs, bornes lumineuses, cercle de lumière, hologramme du plan de bataille
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) f.box(0.27, 0.005, 0.2, -0.56 + i * 0.28, 0, -0.18 + j * 0.21, dk(0xc8d4dc, 0.9 + 0.12 * H(i * 3 + j, 105)));
  f.add(new THREE.TorusGeometry(0.22, 0.008, 3, 20).rotateX(PI / 2), 0.0, 0.008, 0.3, NEON, 'neon');
  f.cyl(0.04, 0.05, 0.03, 8, 0.0, 0, 0.0, FDARK); f.box(0.24, 0.14, 0.004, 0.0, 0.08, 0.0, 0x7ac8f0, 'neon'); for (let i = 0; i < 3; i++) f.box(0.05, 0.03, 0.006, -0.06 + i * 0.06, 0.12 + 0.02 * (i % 2), 0.002, i === 1 ? 0xff6a6a : NEON, 'neon');
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) trooper(f, -0.27 + i * 0.18, 0.26 + r * 0.13, PI, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8, rifle: true });
  trooper(f, 0.16, 0.06, 0.6, FWALL, TEAM_A, { legs: 0x9aa8b8 });
  // le mât, la guérite, le transport flottant, les robots, les bancs, les arbres
  mast(f, kit, -0.76, 0.12, 0.86, 0.26, 0.15, FWALL, NEON);
  f.cyl(0.08, 0.09, 0.03, 10, -0.76, 0, 0.12, FDARK); f.add(new THREE.TorusGeometry(0.085, 0.004, 3, 12).rotateX(PI / 2), -0.76, 0.032, 0.12, NEON, 'neon');
  sentry(f, 0.82, 0.82, -PI / 2, true);
  const hv = kit.sway(f.w(0.62, 0.1, 0.42), [1, 0, 0], 0.025, 0.4), q = new Fr(hv, 0, 0, -0.3, 0);
  q.box(0.14, 0.05, 0.26, 0, -0.025, 0, FWALL); q.add(new THREE.SphereGeometry(0.05, 8, 4).scale(1.2, 0.5, 1.3), 0, 0.02, 0.05, FGLASS, 'neon'); q.box(0.144, 0.008, 0.2, 0, -0.03, -0.02, NEON, 'neon');
  for (const s of [-1, 1]) { q.cyl(0.03, 0.03, 0.01, 8, s * 0.07, -0.04, 0.08, NEON, 'neon'); q.cyl(0.03, 0.03, 0.01, 8, s * 0.07, -0.04, -0.08, NEON, 'neon'); q.box(0.003, 0.03, 0.04, s * 0.072, -0.02, -0.06, TEAM_EMBLEM); }
  robot(f, -0.5, 0.7, 0.5); robot(f, 0.4, 0.75, -0.6, FWALL, 0xff5a5a);
  folk(f, kit, 0.08, 0.82, 0.6, FWALL, team(TEAM_A, 0.9), false, 'run'); folk(f, kit, -0.25, 0.86, 1.4, FWALL, team(TEAM_A, 0.9), false, 'run');
  for (const u of [-0.42, 0.42]) { f.box(0.16, 0.012, 0.05, u, 0.04, -0.3, FWALL); f.box(0.12, 0.04, 0.04, u, 0, -0.3, FDARK); f.box(0.162, 0.004, 0.052, u, 0.036, -0.3, NEON, 'neon'); }
  lamp(f, -0.6, 0.55, 5, 0.36); lamp(f, 0.6, -0.3, 5, 0.36);
  tree(f, -0.9, 0.5, 1.0, 0x5ab87a); tree(f, -0.9, 0.9, 0.8, 0x5ab87a); tree(f, 0.9, -0.1, 0.9, 0x5ab87a); bush(f, 0.3, 0.92, 0.045, 0x5ac88a);
  // seconde passe : les haies d'exercice lumineuses, le portique d'armes à énergie
  for (let i = 0; i < 3; i++) { const u = -0.35 + i * 0.18; for (const s of [-1, 1]) f.box(0.012, 0.08, 0.012, u + s * 0.06, 0, 0.62, FDARK); f.box(0.12, 0.008, 0.008, u, 0.07, 0.62, NEON, 'neon'); }
  for (let i = 0; i < 5; i++) { f.box(0.012, 0.22, 0.014, 0.62 + i * 0.05, 0.02, -0.3, FDARK); f.box(0.008, 0.2, 0.01, 0.62 + i * 0.05, 0.03, -0.298, NEON, 'neon'); } f.box(0.28, 0.012, 0.03, 0.72, 0.1, -0.3, FDARK);
  tufts(f, 12, 441, 0.95, [[-0.8, -0.9, 0.8, -0.34], [-0.7, -0.3, 0.75, 0.55], [0.45, 0.2, 0.95, 0.95], [-0.62, 0.6, 0.1, 0.95]], false);
}

/** La caserne en dur de la ville de garnison (2 × 2), moderne (4) ou futuriste (5) */
export function garrisonBarracks(p: Parts, age: number, kit: FrontKit) {
  const f = new Fr(p, 0, 0);
  if (age <= 4) barracksModernG(f, kit);
  else barracksFutureG(f, kit);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* HÔPITAL MILITAIRE (2 × 2)                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Fauteuil roulant (grandes roues, siège, dossier) et son blessé assis, poussé par une infirmière derrière lui */
function wheelchair(f: Fr, kit: FrontKit, u: number, v: number, ry: number, coat: number, nurse: number) {
  const g = f.sub(u, v, ry);
  for (const s of [-1, 1]) { g.lying(0.036, 0.008, 8, s * 0.034, 0.036, -0.005, 0x3a3c40, 'x'); g.box(0.008, 0.008, 0.03, s * 0.026, 0, 0.035, 0x3a3c40); }
  g.box(0.06, 0.008, 0.05, 0, 0.056, 0, 0x2a4a7a); g.box(0.06, 0.05, 0.008, 0, 0.06, -0.026, 0x2a4a7a);
  folk(g, kit, 0, 0.0, 0, coat, WHITE, true);
  folk(g, kit, 0, -0.08, 0, nurse, nurse);
}

/** Moderne : l'hôpital de béton blanc à trois niveaux, sa croix, l'héliport du toit, l'auvent des ambulances */
function hospitalModern(f: Fr, kit: FrontKit) {
  const W = 1.3, D = 0.52, h = 0.54, wall = 0xeceae2, frame = 0x8a8f96, medic = 0xeeeeea;
  const b = f.sub(-0.1, -0.52);
  b.box(W + 0.04, 0.03, D + 0.04, 0, 0, 0, CONC_D); b.box(W, h, D, 0, 0.03, 0, wall);
  for (const y of [0.2, 0.37]) b.box(W + 0.016, 0.014, D + 0.016, 0, y, 0, CONC_L);
  b.box(W + 0.03, 0.03, D + 0.03, 0, h + 0.03, 0, CONC_L);
  // bandeaux vitrés par étage, de part et d'autre du pilier central à la croix ; l'arrière plus simple
  for (const [k, y] of [[0, 0.07], [1, 0.24], [2, 0.41]]) for (const s of [-1, 1]) {
    const cu = s * 0.37;
    b.box(0.5, 0.09, 0.008, cu, y, D / 2 + 0.002, GLASS, H(k, s + 5) > 0.25);
    for (let i = 0; i <= 4; i++) b.box(0.01, 0.09, 0.012, cu - 0.25 + i * 0.125, y, D / 2 + 0.004, frame);
    b.box(0.5, 0.08, 0.008, cu, y, -D / 2 - 0.002, GLASS, H(k, s + 9) > 0.4);
  }
  b.box(0.18, h, 0.02, 0, 0.03, D / 2 + 0.008, 0xf6f4ee);
  cross(b, 0, 0.36, D / 2 + 0.02, 0.13);
  b.box(0.14, 0.15, 0.01, 0, 0.03, D / 2 + 0.02, GLASS, true); b.box(0.004, 0.15, 0.014, 0, 0.03, D / 2 + 0.024, frame);
  // l'auvent des ambulances : dalle sur deux poteaux, croix sur le bandeau, lampes dessous
  b.box(0.5, 0.025, 0.24, 0, 0.2, D / 2 + 0.13, CONC_L); b.box(0.5, 0.04, 0.012, 0, 0.19, D / 2 + 0.25, REDX);
  for (const s of [-1, 1]) b.box(0.02, 0.2, 0.02, s * 0.23, 0, D / 2 + 0.23, frame);
  for (const s of [-1, 1]) b.box(0.04, 0.008, 0.04, s * 0.12, 0.192, D / 2 + 0.13, 0xfff8e0, true);
  // le toit : acrotère, héliport sur plots (anneau jaune, H, feux), manche à air, cabanon d'escalier, climatiseurs, grande croix
  const r = b.sub(0, 0, 0, h + 0.06);
  for (const s of [-1, 1]) { r.box(W, 0.04, 0.02, 0, 0, s * D / 2, CONC_L); r.box(0.02, 0.04, D, s * W / 2, 0, 0, CONC_L); }
  for (const [a, c] of [[0.28, -0.12], [0.52, -0.12], [0.28, 0.12], [0.52, 0.12]]) r.box(0.03, 0.04, 0.03, a, 0, c, STEEL);
  r.cyl(0.22, 0.22, 0.016, 14, 0.4, 0.04, 0, 0x4f535a); r.add(new THREE.TorusGeometry(0.18, 0.008, 3, 18).rotateX(PI / 2), 0.4, 0.058, 0, 0xf2c23a);
  for (const s of [-1, 1]) r.box(0.02, 0.004, 0.12, 0.4 + s * 0.04, 0.056, 0, WHITE); r.box(0.08, 0.004, 0.02, 0.4, 0.056, 0, WHITE);
  for (let k = 0; k < 8; k++) { const q = (k / 8) * PI * 2; r.box(0.014, 0.012, 0.014, 0.4 + Math.cos(q) * 0.21, 0.052, Math.sin(q) * 0.21, 0x3aff7a, true); }
  r.cyl(0.004, 0.004, 0.14, 4, 0.6, 0.0, -0.22, STEEL);
  const sock = kit.sway(r.w(0.6, 0.13, -0.22), [0, 1, 0], 0.5, 0.4);
  for (let k = 0; k < 3; k++) sock.add(new THREE.CylinderGeometry(0.014 - k * 0.003, 0.012 - k * 0.003, 0.024, 6).rotateZ(PI / 2), -0.016 - k * 0.024, 0, 0, k % 2 ? WHITE : 0xf28a3c);
  r.box(0.14, 0.1, 0.12, -0.42, 0, -0.1, wall); r.box(0.16, 0.014, 0.14, -0.42, 0.1, -0.1, CONC_D); r.box(0.05, 0.08, 0.004, -0.42, 0, -0.038, 0x5a6a7a);
  for (const u of [-0.2, -0.05]) { r.box(0.09, 0.05, 0.07, u, 0, 0.12, 0xd8d8d0); r.cyl(0.022, 0.022, 0.008, 8, u, 0.05, 0.12, 0x3c4048); }
  crossFlat(r, -0.12, 0.0, -0.1, 0.18);
  // l'ambulance garée sous l'auvent, le brancard qu'on décharge, médecins ; le blessé en fauteuil et son infirmière
  truck(f, -0.1, 0.2, 0, OLIVE, true);
  stretcher(f, 0.22, 0.06, PI / 2, true, OLIVE);
  folk(f, kit, 0.22, -0.06, PI, medic, medic); folk(f, kit, 0.36, 0.08, -PI / 2, medic, 0x2a2a2e);
  wheelchair(f, kit, 0.55, 0.42, -0.5, OLIVE, medic);
  // le parvis : lignes des places, bancs, jardinières, arbres, réverbères, nos drapeaux et celui de la Croix-Rouge
  for (let i = 0; i < 4; i++) f.box(0.012, 0.003, 0.2, -0.56 + i * 0.16, 0, 0.66, 0xe8e8e0);
  car(f, -0.48, 0.66, 0, OLIVE_D);
  for (const [u, v, r2] of [[0.42, 0.06, 0], [0.75, 0.18, -PI / 2]]) { const g = f.sub(u, v, r2); g.box(0.16, 0.012, 0.05, 0, 0.04, 0, WOOD); g.box(0.16, 0.04, 0.01, 0, 0.05, -0.022, WOOD); for (const d of [-0.06, 0.06]) g.box(0.01, 0.04, 0.044, d, 0, 0, STEEL); }
  for (const [u, v] of [[-0.82, 0.08], [0.72, -0.08]]) { f.box(0.18, 0.05, 0.08, u, 0, v, 0x9a968e); for (const k of [-0.05, 0.0, 0.05]) f.sphere(0.03, u + k, 0.07, v, dk(LEAF, 0.9 + 6 * k), 0, 0.8); }
  lamp(f, -0.42, 0.4, 4, 0.34, 0.4); lamp(f, 0.45, 0.82, 4, 0.34, PI);
  mast(f, kit, 0.86, 0.86, 0.72, 0.22, 0.12); crossFlag(f, kit, 0.7, 0.88, 0.62);
  tree(f, -0.88, 0.86, 1.0); tree(f, 0.9, 0.42, 0.85, 0x5f9a50); bush(f, -0.9, 0.48, 0.045); bush(f, 0.3, 0.9, 0.04);
  // seconde passe : la tente de triage, le blessé sur béquilles, la perfusion, les massifs fleuris au pied de la façade
  const tt = f.sub(-0.72, 0.38);
  tt.add(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 8, 1, false, 0, PI).rotateZ(PI / 2).rotateY(PI / 2), 0, 0, 0, OLIVE);
  for (const v of [-0.1, 0.1]) tt.add(new THREE.TorusGeometry(0.133, 0.005, 3, 8, PI), 0, 0, v, OLIVE_D);
  tt.box(0.08, 0.1, 0.006, 0, 0, 0.152, 0x2a2e26); cross(tt, 0, 0.1, 0.152, 0.03);
  trooper(f, 0.64, 0.62, 0.4, OLIVE, WHITE, { legs: OLIVE_D }); for (const s of [-1, 1]) f.sub(0.64, 0.62, 0.4).roll(0.006, 0.13, 0.006, s * 0.05, 0, 0.01, 0xb8bcc2, -s * 0.12);
  drip(f, 0.3, 0.12);
  for (const s of [-1, 1]) { f.box(0.4, 0.04, 0.06, -0.1 + s * 0.42, 0, -0.2, 0x9a968e); for (let i = 0; i < 5; i++) f.sphere(0.022, -0.1 + s * 0.42 - 0.16 + i * 0.08, 0.05, -0.2, i % 2 ? LEAF : [0xe84a6a, 0xf2d25a][(i / 2) % 2], 0, 0.8); }
  tufts(f, 12, 451, 0.95, [[-0.78, -0.82, 0.58, -0.2], [-0.4, -0.25, 0.65, 0.55], [-0.72, 0.5, -0.22, 0.82], [0.5, 0.7, 0.95, 0.95]]);
}

/** Futuriste : l'hôpital à la coque blanche arrondie, baies lumineuses, croix verte, drone sur le toit, ambulance volante */
function hospitalFuture(f: Fr, kit: FrontKit) {
  const W = 1.1, D = 0.5, h = 0.5, medic = 0xf4f8fa;
  const b = f.sub(-0.08, -0.52);
  b.box(W + 0.06, 0.04, D + 0.06, 0, 0, 0, FDARK); b.box(W, h, D, 0, 0.04, 0, FWALL);
  for (const s of [-1, 1]) { b.cyl(D / 2, D / 2, h, 14, s * W / 2, 0.04, 0, FWALL); b.cyl(D / 2 + 0.004, D / 2 + 0.004, 0.012, 14, s * W / 2, 0.27, 0, NEON, 'neon'); }
  for (const [k, y] of [[0, 0.1], [1, 0.32]]) for (const s of [-1, 1]) { b.box(0.38, 0.12, 0.008, s * 0.32, y, D / 2 + 0.002, FGLASS, 'neon'); for (let i = 0; i < 4; i++) b.box(0.008, 0.12, 0.012, s * 0.32 - 0.19 + i * 0.127, y, D / 2 + 0.004, FDARK); b.box(0.38, 0.1, 0.008, s * 0.32, y, -D / 2 - 0.002, FGLASS, k ? 'neon' : false); }
  b.box(0.16, 0.2, 0.012, 0, 0.04, D / 2 + 0.006, FGLASS, 'neon'); b.box(0.004, 0.2, 0.016, 0, 0.04, D / 2 + 0.01, FDARK);
  cross(b, 0, 0.3, D / 2 + 0.008, 0.14, false, FDARK, NEON_G, 'neon');
  b.box(W, 0.012, 0.008, 0, 0.27, D / 2 + 0.004, NEON, 'neon'); b.box(W, 0.012, 0.008, 0, h + 0.02, D / 2 + 0.004, NEON, 'neon');
  b.tilt(0.36, 0.014, 0.2, 0, 0.26, D / 2 + 0.1, 0xd8e2ea, 0.05); b.box(0.36, 0.006, 0.012, 0, 0.255, D / 2 + 0.2, NEON_G, 'neon');
  b.box(W - 0.04, 0.03, D - 0.06, 0, h + 0.04, 0, 0xd8e2ea);
  const r = b.sub(0.3, 0, 0, h + 0.07);
  r.cyl(0.18, 0.18, 0.014, 14, 0, 0, 0, FDARK); r.add(new THREE.TorusGeometry(0.15, 0.006, 3, 16).rotateX(PI / 2), 0, 0.016, 0, NEON_G, 'neon');
  r.box(0.1, 0.004, 0.03, 0, 0.016, 0, NEON_G, 'neon'); r.box(0.03, 0.004, 0.1, 0, 0.016, 0, NEON_G, 'neon');
  const dr = new Fr(kit.sway(r.w(0, 0.12, 0), [1, 0, 0], 0.04, 0.5), 0, 0, 0, 0);
  dr.cyl(0.06, 0.05, 0.03, 8, 0, -0.015, 0, FWALL); dr.box(0.04, 0.004, 0.012, 0, 0.016, 0, NEON_G, 'neon'); dr.box(0.012, 0.004, 0.04, 0, 0.016, 0, NEON_G, 'neon');
  for (const [a, c] of [[0.07, 0.07], [-0.07, 0.07], [0.07, -0.07], [-0.07, -0.07]]) dr.add(new THREE.TorusGeometry(0.03, 0.004, 3, 10).rotateX(PI / 2), a, 0.0, c, NEON, 'neon');
  for (const u of [-0.42, -0.18]) { r.add(new THREE.BoxGeometry(0.2, 0.008, 0.14).rotateX(-0.3), u - 0.3, 0.03, -0.04, 0x2a4a8a); r.add(new THREE.BoxGeometry(0.2, 0.004, 0.008).rotateX(-0.3), u - 0.3, 0.036, -0.04, NEON, 'neon'); }
  // l'ambulance volante au-dessus de son aire, les capsules d'arrivée, robots et soignants
  const pad = f.sub(0.5, 0.42);
  pad.cyl(0.2, 0.21, 0.014, 14, 0, 0, 0, FDARK); pad.add(new THREE.TorusGeometry(0.17, 0.006, 3, 18).rotateX(PI / 2), 0, 0.016, 0, NEON_G, 'neon');
  const hv = kit.sway(pad.w(0, 0.17, 0), [1, 0, 0], 0.03, 0.45), q = new Fr(hv, 0, 0, -0.6, 0);
  q.box(0.12, 0.06, 0.26, 0, -0.03, -0.02, FWALL); q.add(new THREE.SphereGeometry(0.06, 8, 5).scale(1, 0.55, 1.4), 0, 0.0, 0.1, FGLASS, 'neon');
  q.box(0.124, 0.01, 0.2, 0, 0.0, -0.04, NEON_G, 'neon');
  for (const s of [-1, 1]) { cross(q.sub(s * 0.062, -0.06, s * PI / 2), 0, -0.02, 0, 0.05); q.cyl(0.026, 0.026, 0.006, 8, s * 0.08, -0.045, 0.06, NEON, 'neon'); q.cyl(0.026, 0.026, 0.006, 8, s * 0.08, -0.045, -0.1, NEON, 'neon'); }
  for (let i = 0; i < 2; i++) { const c = f.sub(-0.62 + i * 0.22, 0.24); c.box(0.1, 0.04, 0.22, 0, 0, 0, FDARK); c.box(0.11, 0.01, 0.23, 0, 0.04, 0, FWALL); patient(c, 0, 0.05, 0.02, 0, 0xcfe8f4, team(TEAM_A, 0.8)); for (const v of [-0.05, 0.07]) c.add(new THREE.TorusGeometry(0.055, 0.005, 3, 10, PI), 0, 0.05, v, NEON_G, 'neon'); }
  robot(f, -0.2, 0.24, 0.4); robot(f, 0.18, 0.1, -0.4, FWALL, NEON_G);
  folk(f, kit, -0.36, 0.44, PI, medic, 0xdfe8f0); folk(f, kit, 0.06, 0.38, 0.3, medic, 0x3a3a48);
  trooper(f, 0.25, 0.74, 0.5, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8 });
  // jardinières, bancs, lampadaires, nos drapeaux, arbres
  for (const [u, v, r2] of [[-0.8, 0.62, 0], [0.84, -0.1, PI / 2]] as V3[]) { const g = f.sub(u, v, r2); g.box(0.2, 0.05, 0.08, 0, 0, 0, FDARK); g.box(0.204, 0.006, 0.084, 0, 0.05, 0, NEON, 'neon'); for (const k of [-0.06, 0, 0.06]) g.sphere(0.03, k, 0.08, 0, 0x5ac88a, 0, 0.9); }
  lamp(f, -0.45, 0.68, 5, 0.36); lamp(f, 0.86, 0.2, 5, 0.36);
  mast(f, kit, -0.88, 0.88, 0.74, 0.22, 0.12, FWALL, NEON);
  tree(f, 0.88, 0.88, 0.9, 0x5ab87a); tree(f, -0.9, 0.3, 0.85, 0x5ab87a); bush(f, 0.0, 0.9, 0.05, 0x5ac88a);
  path(f, -0.08, 0.95, -0.08, 0.08, 0.16, 0xc8d4dc, 106, 0.1);
  // seconde passe : la borne d'accueil à croix verte, le drone de garde qui tourne, deux bancs lumineux
  const pl = f.sub(0.28, 0.02); pl.box(0.06, 0.34, 0.04, 0, 0, 0, FDARK); cross(pl, 0, 0.24, 0.022, 0.07, false, FDARK, NEON_G, 'neon'); pl.box(0.004, 0.2, 0.042, 0.03, 0.02, 0, NEON, 'neon');
  const gd = new Fr(kit.turn(f.w(0, 0.7, -0.1), [0, 1, 0], -0.1), 0, 0, 0, 0); gd.cyl(0.03, 0.024, 0.016, 8, 0.6, 0, 0, FWALL); gd.add(new THREE.TorusGeometry(0.034, 0.003, 3, 8).rotateX(PI / 2), 0.6, 0.008, 0, NEON_G, 'neon');
  for (const u of [-0.62, 0.62]) { f.box(0.16, 0.012, 0.05, u, 0.04, 0.84, FWALL); f.box(0.12, 0.04, 0.04, u, 0, 0.84, FDARK); f.box(0.162, 0.004, 0.052, u, 0.036, 0.84, NEON, 'neon'); }
  tufts(f, 12, 461, 0.95, [[-0.92, -0.84, 0.75, -0.2], [-0.74, 0.1, 0.72, 0.62], [-0.3, 0.6, 0.2, 0.95], [0.7, -0.2, 0.95, 0.05]], false);
}

/** L'hôpital militaire de la garnison (2 × 2), moderne (4) ou futuriste (5) */
export function milHospital(p: Parts, age: number, kit: FrontKit) {
  const f = new Fr(p, 0, 0);
  if (age <= 4) hospitalModern(f, kit);
  else hospitalFuture(f, kit);
}

/** Voiture de service garée (caisse, vitres, roues, phares), l'avant vers +z une fois tournée de ry */
function car(f: Fr, u: number, v: number, ry: number, col: number) {
  const g = f.sub(u, v, ry);
  g.box(0.12, 0.045, 0.24, 0, 0.022, 0, col); g.box(0.106, 0.04, 0.13, 0, 0.067, -0.015, 0x9fc4dc); g.box(0.11, 0.008, 0.11, 0, 0.107, -0.015, col);
  for (const [a, c] of [[-0.056, 0.075], [0.056, 0.075], [-0.056, -0.075], [0.056, -0.075]]) g.lying(0.024, 0.018, 8, a, 0.024, c, 0x1e1e22, 'x');
  for (const s of [-1, 1]) { g.box(0.024, 0.012, 0.004, s * 0.038, 0.048, 0.121, 0xfff1c9, true); g.box(0.024, 0.012, 0.004, s * 0.038, 0.048, -0.121, 0xc8302c); }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* FOYER DU SOLDAT (2 × 2)                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Table de terrasse ronde, ses deux chaises et son parasol (couleur `top` : sentinelle permise) */
function cafeTable(f: Fr, u: number, v: number, top: number, leg = STEEL, parasol = true, fut = false) {
  const g = f.sub(u, v);
  g.cyl(0.02, 0.03, 0.008, 6, 0, 0, 0, leg); g.cyl(0.006, 0.006, 0.07, 4, 0, 0.008, 0, leg); g.cyl(0.06, 0.06, 0.01, 10, 0, 0.078, 0, fut ? FWALL : 0xf4f0e8);
  if (fut) g.cyl(0.062, 0.062, 0.004, 10, 0, 0.074, 0, NEON, 'neon');
  for (const s of [-1, 1]) { g.box(0.04, 0.006, 0.04, s * 0.09, 0.045, 0, fut ? FDARK : 0x5a6a4a); g.box(0.006, 0.045, 0.04, s * 0.11, 0.045, 0, fut ? FDARK : 0x5a6a4a); for (const d of [-0.014, 0.014]) g.box(0.005, 0.045, 0.005, s * 0.09, 0, d, leg); }
  g.box(0.014, 0.024, 0.014, 0.02, 0.088, 0.01, 0xd8a040); g.box(0.012, 0.02, 0.012, -0.02, 0.088, -0.01, 0xe8e4dc);
  if (parasol) { g.cyl(0.004, 0.004, 0.26, 4, 0, 0.088, 0, 0xe8e4dc); g.cone(0.15, 0.06, 8, 0, 0.3, 0, top); g.cyl(0.152, 0.152, 0.014, 8, 0, 0.29, 0, top === TEAM_A ? WHITE : TEAM_A); }
}

/** Moderne : le foyer de brique et de crépi, son store rayé à nos couleurs, la terrasse aux parasols, le ping-pong, les affiches */
function clubModern(f: Fr, kit: FrontKit) {
  const W = 1.2, D = 0.46, h = 0.3, wall = 0xeadcc0, brick = 0xb86a4a, frame = 0x4a5a3a, roofC = 0x9a4a3a;
  const b = f.sub(0, -0.58);
  b.box(W + 0.03, 0.06, D + 0.03, 0, 0, 0, brick); b.box(W, h - 0.06, D, 0, 0.06, 0, wall);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.box(0.03, 0.05, 0.03, s * (W / 2 - 0.012), 0.065 + i * 0.06, D / 2 - 0.012, i % 2 ? 0xd8c8a8 : brick);
  // les grandes baies chaudes, la porte vitrée, le store rayé et son lambrequin, l'enseigne lumineuse à notre écu
  for (const u of [-0.42, -0.24, 0.24, 0.42]) { b.box(0.15, 0.15, 0.008, u, 0.08, D / 2 + 0.002, WARM, true); b.box(0.16, 0.012, 0.016, u, 0.074, D / 2 + 0.006, frame); b.box(0.008, 0.15, 0.012, u, 0.08, D / 2 + 0.006, frame); }
  b.box(0.12, 0.2, 0.008, 0, 0.04, D / 2 + 0.002, GLASS, true); b.box(0.13, 0.014, 0.014, 0, 0.24, D / 2 + 0.006, frame);
  for (let i = 0; i < 10; i++) b.add(new THREE.BoxGeometry(W / 10, 0.008, 0.2).rotateX(0.32), -W / 2 + (i + 0.5) * (W / 10), 0.24, D / 2 + 0.1, i % 2 ? WHITE : TEAM_A);
  for (let i = 0; i < 10; i++) b.box(W / 10, 0.025, 0.006, -W / 2 + (i + 0.5) * (W / 10), 0.185, D / 2 + 0.195, i % 2 ? WHITE : TEAM_A);
  b.box(0.5, 0.07, 0.02, 0, 0.3, D / 2 + 0.01, 0x2e3a2a); b.box(0.06, 0.06, 0.004, -0.2, 0.305, D / 2 + 0.022, TEAM_EMBLEM);
  for (let i = 0; i < 6; i++) b.box(0.03, 0.035, 0.004, -0.1 + i * 0.05, 0.318, D / 2 + 0.022, 0xffd890, true);
  roof2(b, 0, h, 0, W, D, 0.16, roofC, wall, 0.04, 0);
  b.box(0.06, 0.12, 0.06, 0.36, h + 0.06, -0.06, brick); b.box(0.07, 0.012, 0.07, 0.36, h + 0.18, -0.06, 0x5a3a2a); kit.smoke(...b.w(0.36, h + 0.2, -0.06), 0);
  // le pignon des affiches et le tableau des nouvelles
  const sd = b.sub(W / 2 + 0.002, 0, PI / 2);
  for (const [u, c] of [[-0.12, 0xd84a3a], [0.0, 0x3a6ab8], [0.12, 0xe8c04a]] as [number, number][]) { sd.box(0.08, 0.11, 0.004, u, 0.1, 0, c); sd.box(0.05, 0.03, 0.005, u, 0.15, 0, 0xf4f0e8); }
  b.box(0.16, 0.1, 0.01, -0.55, 0.0, D / 2 + 0.08, DWOOD); b.box(0.14, 0.08, 0.004, -0.55, 0.11, D / 2 + 0.086, 0x6a4a30); for (let i = 0; i < 4; i++) b.box(0.03, 0.035, 0.004, -0.6 + (i % 2) * 0.05 + 0.02 * (i > 1 ? 1 : 0), 0.12 + (i > 1 ? 0.04 : 0), D / 2 + 0.09, 0xf4f0e8);
  // la terrasse : plancher de lattes, tables et parasols alternés, soldats assis, le serveur, guirlande d'ampoules
  for (let i = 0; i < 8; i++) f.box(1.0, 0.016, 0.055, -0.05, 0, -0.3 + i * 0.06, dk(0xa8845a, 0.9 + 0.12 * H(i, 107)));
  const tabs: [number, number, number][] = [[-0.38, -0.16, TEAM_A], [0.0, -0.06, WHITE], [0.34, -0.18, TEAM_A]];
  for (const [u, v, c] of tabs) cafeTable(f.sub(0, 0, 0, 0.016), u, v, c);
  folk(f, kit, -0.47, -0.16, PI / 2, OLIVE, OLIVE_D, true, 'idle', 0.016); folk(f, kit, -0.29, -0.16, -PI / 2, OLIVE, OLIVE_D, true, 'idle', 0.016);
  folk(f, kit, 0.09, -0.06, -PI / 2, OLIVE, 0x3a2e26, true, 'idle', 0.016); folk(f, kit, 0.43, -0.18, -PI / 2, OLIVE, OLIVE_D, true, 'idle', 0.016);
  folk(f, kit, 0.2, 0.12, 2.6, WHITE, 0x2a2a2e, false, 'idle', 0.016);
  for (const s of [-1, 1]) f.cyl(0.006, 0.008, 0.3, 4, s * 0.5, 0, 0.2, STEEL);
  for (const s of [-1, 1]) {
    const a: V3 = [s * 0.5, 0.29, 0.2], c: V3 = [s * 0.12, 0.33, -0.36];
    f.tube(a, c, 0.0015, 0x3a3a3a, false, 3);
    for (let i = 1; i < 5; i++) { const t = i / 5; f.box(0.012, 0.014, 0.012, a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - 0.012 - 0.02 * Math.sin(PI * t), a[2] + (c[2] - a[2]) * t, [0xffd890, 0xff9a6a, 0x9ae0ff][i % 3], true); }
  }
  // le ping-pong et ses deux joueurs, le vélo, les pots de fleurs, la haie, la jeep garée, réverbère, drapeau
  const pp = f.sub(0.56, 0.52, PI / 2);
  pp.box(0.26, 0.008, 0.15, 0, 0.07, 0, 0x2a6a4a); pp.box(0.004, 0.02, 0.16, 0, 0.078, 0, WHITE); pp.box(0.26, 0.002, 0.004, 0, 0.0785, 0, WHITE);
  for (const s of [-1, 1]) for (const t of [-1, 1]) pp.box(0.008, 0.07, 0.008, s * 0.11, 0, t * 0.06, STEEL);
  folk(pp, kit, -0.2, 0, PI / 2, OLIVE, OLIVE_D, false, 'run'); folk(pp, kit, 0.2, 0, -PI / 2, 0xe8e4dc, 0x3a2e26, false, 'cheer');
  const bk = f.sub(-0.68, -0.18, 0.2);
  for (const d of [-0.04, 0.04]) bk.lying(0.028, 0.006, 8, 0, 0.03, d, 0x2a2a2e, 'x'); bk.box(0.006, 0.006, 0.08, 0, 0.042, 0, 0x4a7a4a); bk.box(0.006, 0.035, 0.006, 0, 0.03, -0.015, 0x4a7a4a); bk.box(0.036, 0.005, 0.005, 0, 0.07, 0.035, 0x3c3c40);
  for (const [u, v] of [[-0.58, -0.32], [0.48, -0.32], [-0.58, 0.18], [0.46, 0.18]]) { f.cyl(0.03, 0.022, 0.05, 6, u, 0.016, v, 0xb86a4a); f.sphere(0.035, u, 0.09, v, [0x6fa85a, 0x4f8a4e][Math.round(u * 10) % 2 ? 0 : 1], 0, 0.9); f.box(0.014, 0.012, 0.014, u + 0.02, 0.11, v, 0xe84a6a); }
  for (const u of [-0.88, -0.66]) f.box(0.2, 0.07, 0.06, u + 0.1, 0, 0.36, LEAF_D);
  jeep(f, -0.56, 0.66, PI / 2 + 0.1);
  lamp(f, -0.2, 0.42, 4, 0.34, 0); mast(f, kit, -0.9, -0.1, 0.7, 0.2, 0.11);
  tree(f, 0.88, -0.14, 1.0); tree(f, -0.9, 0.9, 0.8, 0x5f9a50); bush(f, 0.2, 0.88, 0.05); bush(f, 0.88, 0.88, 0.04);
  path(f, 0.0, 0.95, 0.0, 0.2, 0.14, 0x9a968e, 108, 0.1);
  // seconde passe : l'ardoise du menu, le tonneau et les casiers de bouteilles, le chien couché
  const mn = f.sub(0.16, 0.3, 0.3); mn.tilt(0.08, 0.12, 0.006, 0, 0, 0.02, 0x2a2e2a, -0.15); mn.tilt(0.08, 0.12, 0.006, 0, 0, -0.02, 0x2a2e2a, 0.15); for (let i = 0; i < 3; i++) mn.box(0.05, 0.006, 0.004, 0, 0.05 + i * 0.022, 0.03, 0xe8e4dc);
  barrel(f, 0.68, -0.36, 0.8); for (let i = 0; i < 2; i++) { f.box(0.08, 0.04, 0.06, 0.7 + i * 0.01, i * 0.04, -0.24, 0xc8a040); for (let k = 0; k < 3; k++) f.cyl(0.006, 0.006, 0.03, 4, 0.68 + k * 0.022 + i * 0.01, 0.04 + i * 0.04, -0.24, 0x3a6a3a); }
  const dg = f.sub(-0.1, 0.32, 0.8); dg.box(0.03, 0.022, 0.07, 0, 0, 0, 0x8a5a34); dg.box(0.026, 0.024, 0.026, 0, 0.004, 0.044, 0x8a5a34); dg.box(0.01, 0.014, 0.01, 0.01, 0.02, 0.04, 0x5a3a24);
  tufts(f, 12, 471, 0.95, [[-0.78, -0.82, 0.7, 0.22], [0.3, 0.3, 0.82, 0.75], [-0.86, 0.3, -0.3, 0.86], [-0.12, 0.2, 0.12, 0.95]]);
}

/** Futuriste : le foyer de composite à baies lumineuses, enseigne holographique, terrasse aux tables de néon, drone serveur */
function clubFuture(f: Fr, kit: FrontKit) {
  const W = 1.2, D = 0.46, h = 0.32;
  const b = f.sub(0, -0.58);
  b.box(W + 0.06, 0.04, D + 0.06, 0, 0, 0, FDARK); b.box(W, h, D, 0, 0.04, 0, FWALL);
  b.add(new THREE.CylinderGeometry(D / 2 + 0.02, D / 2 + 0.02, W + 0.04, 12, 1, false, 0, PI).rotateZ(PI / 2).scale(1, 0.4, 1), 0, h + 0.04, 0, 0xf0f4f8);
  for (const u of [-0.36, 0.36]) b.box(0.4, 0.2, 0.008, u, 0.08, D / 2 + 0.002, 0xffb8e8, 'neon');
  for (const u of [-0.56, -0.36, -0.16, 0.16, 0.36, 0.56]) b.box(0.01, 0.2, 0.012, u, 0.08, D / 2 + 0.004, FDARK);
  b.box(0.14, 0.24, 0.01, 0, 0.04, D / 2 + 0.004, FGLASS, 'neon'); b.box(0.004, 0.24, 0.014, 0, 0.04, D / 2 + 0.006, FDARK);
  b.box(W, 0.012, 0.008, 0, 0.3, D / 2 + 0.004, 0xff4aa8, 'neon'); b.box(W, 0.008, 0.008, 0, 0.06, D / 2 + 0.004, NEON, 'neon');
  b.tilt(W, 0.012, 0.2, 0, 0.3, D / 2 + 0.1, FDARK, 0.1); b.box(W, 0.008, 0.012, 0, 0.29, D / 2 + 0.2, NEON, 'neon');
  b.cyl(0.012, 0.012, 0.16, 6, -0.3, h + 0.12, 0, FDARK); b.box(0.36, 0.12, 0.006, -0.3, h + 0.28, 0, 0xff4aa8, 'neon'); b.box(0.08, 0.08, 0.004, -0.42, h + 0.3, 0.005, TEAM_EMBLEM);
  for (let i = 0; i < 3; i++) b.box(0.04, 0.04, 0.007, -0.3 + i * 0.06, h + 0.32, 0, 0xffe24a, 'neon');
  const sd = b.sub(W / 2 + 0.002, 0, PI / 2);
  for (const [u, c] of [[-0.12, 0xff4aa8], [0.0, 0x4ae8ff], [0.12, 0xffe24a]] as [number, number][]) sd.box(0.08, 0.12, 0.004, u, 0.1, 0, c, 'neon');
  // la terrasse : dalles claires, tables à pied lumineux, soldats au repos, le drone serveur qui tourne
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) f.box(0.24, 0.012, 0.24, -0.38 + i * 0.25, 0, -0.22 + j * 0.25, dk(0xc8d4dc, 0.9 + 0.12 * H(i * 2 + j, 109)));
  const tabs: [number, number][] = [[-0.38, -0.16], [0.0, -0.06], [0.34, -0.18]];
  for (const [u, v] of tabs) cafeTable(f.sub(0, 0, 0, 0.012), u, v, FWALL, FDARK, false, true);
  folk(f, kit, -0.47, -0.16, PI / 2, FWALL, team(TEAM_A, 0.9), true, 'idle', 0.012); folk(f, kit, -0.29, -0.16, -PI / 2, FWALL, team(TEAM_A, 0.9), true, 'idle', 0.012);
  folk(f, kit, 0.09, -0.06, -PI / 2, FWALL, 0x3a2e26, true, 'idle', 0.012); folk(f, kit, 0.43, -0.18, -PI / 2, FWALL, team(TEAM_A, 0.9), true, 'idle', 0.012);
  const dr = new Fr(kit.turn(f.w(0, 0.32, -0.12), [0, 1, 0], 0.15), 0, 0, 0, 0);
  dr.cyl(0.03, 0.024, 0.02, 8, 0.3, 0, 0, FWALL); dr.add(new THREE.TorusGeometry(0.036, 0.004, 3, 10).rotateX(PI / 2), 0.3, 0.01, 0, 0xff4aa8, 'neon'); dr.box(0.06, 0.006, 0.04, 0.3, -0.008, 0, FDARK); dr.box(0.012, 0.02, 0.012, 0.3, 0.02, 0, 0xffd890, 'neon');
  // le jeu holographique, les bornes et jardinières, le transport flottant, lampadaires, notre drapeau, arbres
  const hg = f.sub(0.56, 0.52);
  hg.cyl(0.1, 0.11, 0.03, 10, 0, 0, 0, FDARK); hg.add(new THREE.TorusGeometry(0.09, 0.005, 3, 14).rotateX(PI / 2), 0, 0.032, 0, NEON, 'neon');
  hg.box(0.12, 0.12, 0.004, 0, 0.08, 0, 0x7ac8f0, 'neon'); hg.box(0.004, 0.12, 0.12, 0, 0.08, 0, 0x7ac8f0, 'neon');
  folk(hg, kit, -0.18, 0, PI / 2, FWALL, team(TEAM_A, 0.9), false, 'cheer'); folk(hg, kit, 0.18, 0.04, -PI / 2, 0xdfe8f0, 0x3a2e26);
  for (const [u, v] of [[-0.58, -0.32], [0.48, -0.32], [-0.58, 0.18], [0.46, 0.18]]) { f.box(0.07, 0.05, 0.07, u, 0.012, v, FDARK); f.box(0.072, 0.006, 0.072, u, 0.062, v, NEON, 'neon'); f.sphere(0.035, u, 0.1, v, 0x5ac88a, 0, 0.9); }
  const hv = kit.sway(f.w(-0.55, 0.1, 0.66), [1, 0, 0], 0.025, 0.4), q = new Fr(hv, 0, 0, PI / 2 + 0.1, 0);
  q.box(0.12, 0.04, 0.24, 0, -0.02, 0, FWALL); q.add(new THREE.SphereGeometry(0.05, 8, 4).scale(1.1, 0.5, 1.2), 0, 0.02, 0.04, FGLASS, 'neon'); q.box(0.124, 0.006, 0.2, 0, -0.024, 0, 0xff4aa8, 'neon');
  lamp(f, -0.2, 0.42, 5, 0.36); lamp(f, 0.88, 0.2, 5, 0.36);
  mast(f, kit, -0.9, -0.1, 0.72, 0.2, 0.11, FWALL, NEON);
  tree(f, 0.88, -0.14, 1.0, 0x5ab87a); tree(f, -0.9, 0.9, 0.8, 0x5ab87a); bush(f, 0.2, 0.88, 0.05, 0x5ac88a);
  path(f, 0.0, 0.95, 0.0, 0.2, 0.14, 0xc8d4dc, 110, 0.1);
  // seconde passe : le comptoir extérieur et son robot serveur, les tabourets, la guirlande de néons, deux soldats qui discutent
  const bar = f.sub(0.62, -0.08, -PI / 2); bar.box(0.36, 0.09, 0.08, 0, 0.012, 0, FWALL); bar.box(0.37, 0.008, 0.09, 0, 0.1, 0, FDARK); bar.box(0.36, 0.006, 0.004, 0, 0.06, 0.042, 0xff4aa8, 'neon');
  for (let i = 0; i < 3; i++) { bar.cyl(0.004, 0.004, 0.06, 4, -0.12 + i * 0.12, 0.012, 0.1, FDARK); bar.cyl(0.02, 0.02, 0.008, 8, -0.12 + i * 0.12, 0.072, 0.1, NEON, 'neon'); }
  robot(bar, 0.0, -0.1, 0, FWALL, 0xff4aa8);
  for (const s of [-1, 1]) f.cyl(0.006, 0.008, 0.3, 4, s * 0.5, 0, 0.2, FDARK);
  for (const s of [-1, 1]) { const a: V3 = [s * 0.5, 0.29, 0.2], c: V3 = [s * 0.12, 0.33, -0.36]; f.tube(a, c, 0.0015, FDARK, false, 3); for (let i = 1; i < 5; i++) { const t = i / 5; f.box(0.012, 0.012, 0.012, a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - 0.012 - 0.02 * Math.sin(PI * t), a[2] + (c[2] - a[2]) * t, [0xff4aa8, 0x4ae8ff, 0xffe24a][i % 3], 'neon'); } }
  trooper(f, -0.2, 0.3, 0.9, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8 }); trooper(f, -0.08, 0.32, -1.9, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8 });
  tufts(f, 10, 481, 0.95, [[-0.78, -0.82, 0.7, 0.22], [0.3, 0.3, 0.82, 0.75], [-0.86, 0.4, -0.3, 0.86], [-0.12, 0.2, 0.12, 0.95]], false);
}

/** Le foyer du soldat (2 × 2), moderne (4) ou futuriste (5) */
export function soldierClub(p: Parts, age: number, kit: FrontKit) {
  const f = new Fr(p, 0, 0);
  if (age <= 4) clubModern(f, kit);
  else clubFuture(f, kit);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* MAISON DE LA GARNISON (1 × 1)                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Moderne : le pavillon du sous-officier, crépi de couleur, toit à deux pans ou terrasse, jardinet, et ce qui le distingue */
function houseModernG(f: Fr, kit: FrontKit, v: number) {
  const wall = [0xe8dcc0, 0xcfd8c0, 0xe0c8a8, 0xd0dce4][v % 4], roofC = [0x9a4a3a, 0x5a6270, 0x7a5a44][v % 3], frame = 0xf4f0e8, W = 0.5, D = 0.34, h = 0.24, flat = v % 2 === 1;
  const b = f.sub(0.02, -0.16);
  b.box(W + 0.02, 0.035, D + 0.02, 0, 0, 0, 0x9a968e); b.box(W, h, D, 0, 0.035, 0, wall);
  for (const s of [-1, 1]) b.box(0.016, h, 0.016, s * (W / 2 - 0.004), 0.035, D / 2 - 0.004, dk(wall, 0.88));
  winRow(b, [-0.15, 0.15], 0.1, D / 2 + 0.002, 0.09, 0.09, frame, WARM, 120 + v);
  for (const u of [-0.15, 0.15]) for (const s of [-1, 1]) b.box(0.03, 0.09, 0.006, u + s * 0.062, 0.1, D / 2 + 0.004, [0x4a6a4a, 0x3a5a8a, 0x8a4a3a][v % 3]);
  win(b.sub(W / 2 + 0.002, 0, PI / 2), 0, 0.1, 0, 0.08, 0.08, v % 3 !== 0, frame, WARM); win(b.sub(0, -D / 2 - 0.002, PI), 0.1, 0.1, 0, 0.1, 0.08, false, frame, WARM);
  door(b, 0.0, D / 2 + 0.004, 0.08, 0.16, [0x5a4434, 0x3a5a7a, 0x6a2a2a][v % 3], frame, 0.035, false);
  b.box(0.16, 0.012, 0.09, 0, 0.21, D / 2 + 0.045, roofC); for (const s of [-1, 1]) b.box(0.008, 0.18, 0.008, s * 0.07, 0.035, D / 2 + 0.085, frame);
  for (let k = 0; k < 2; k++) b.box(0.14 - k * 0.03, 0.017, 0.05, 0, k * 0.017, D / 2 + 0.03 + k * 0.02, 0x9a968e);
  b.box(0.05, 0.035, 0.004, 0.08, 0.17, D / 2 + 0.004, TEAM_EMBLEM);
  if (flat) {
    b.box(W + 0.03, 0.03, D + 0.03, 0, h + 0.035, 0, dk(wall, 0.85)); b.box(W - 0.02, 0.006, D - 0.02, 0, h + 0.065, 0, 0x6a6e72);
    b.box(0.1, 0.06, 0.08, -0.12, h + 0.065, -0.04, 0xd8d8d0); b.cyl(0.024, 0.024, 0.008, 8, -0.12, h + 0.125, -0.04, 0x3c4048);
    b.cyl(0.004, 0.006, 0.2, 4, 0.18, h + 0.065, -0.1, STEEL); for (let i = 0; i < 3; i++) b.box(0.06 - i * 0.015, 0.004, 0.004, 0.18, h + 0.2 + i * 0.025, -0.1, STEEL);
  } else {
    roof2(b, 0, h + 0.035, 0, W, D, 0.16, roofC, wall, 0.035, 0);
    b.box(0.05, 0.12, 0.05, -0.14, h + 0.1, -0.06, 0xb86a4a); b.box(0.06, 0.01, 0.06, -0.14, h + 0.22, -0.06, 0x5a3a2a); kit.smoke(...b.w(-0.14, h + 0.24, -0.06), 0);
  }
  b.box(0.008, h + 0.03, 0.008, W / 2 + 0.006, 0, D / 2 - 0.02, 0x6a6e72);
  // le jardinet : clôture basse et portillon, allée, massif, boîte aux lettres, petit drapeau à notre blason au mur
  for (let i = 0; i < 9; i++) { const x = -0.44 + i * 0.11; if (Math.abs(x) < 0.08) continue; f.box(0.014, 0.08, 0.014, x, 0, 0.44, WHITE); }
  for (const s of [-1, 1]) f.box(0.36, 0.012, 0.008, s * 0.26, 0.05, 0.44, WHITE);
  path(f, 0.02, 0.46, 0.02, 0.08, 0.08, 0x9a968e, 121 + v, 0.07);
  for (const [u, vv, c] of [[-0.3, 0.32, LEAF], [-0.18, 0.36, 0x7fb06a], [0.32, 0.3, LEAF_D]] as V3[]) bush(f, u, vv, 0.045, c);
  for (let i = 0; i < 4; i++) f.box(0.014, 0.012, 0.014, -0.36 + i * 0.05, 0.03, 0.4, [0xe84a6a, 0xf2d25a, 0xece6f4, 0x9a7ae0][(i + v) % 4]);
  f.cyl(0.006, 0.006, 0.08, 4, 0.14, 0, 0.42, STEEL); f.box(0.04, 0.03, 0.05, 0.14, 0.08, 0.42, [0x3a5a8a, 0xc83a2a, 0x4a6a4a][v % 3]);
  const [fx, fy, fz] = b.w(-W / 2 + 0.05, 0.22, D / 2 + 0.02);
  b.tube([-W / 2 + 0.05, 0.2, D / 2], [-W / 2 + 0.05, 0.24, D / 2 + 0.03], 0.003, STEEL, false, 3);
  kit.sway([fx, 0, fz], [0, 1, 0], 0.4, 1.0).box(0.08, 0.05, 0.004, 0.044, fy - 0.03, 0, TEAM_FLAG);
  // ce qui distingue la maison : le linge à l'uniforme, la jeep de service, ou le vélo et le salon de jardin
  const k = v % 3;
  if (k === 0) line(f, kit, -0.42, 0.12, -0.2, 0.2, 0.2, [OLIVE, WHITE, OLIVE_D]);
  else if (k === 1) jeep(f, 0.34, 0.16, 0.1, OLIVE, v % 2 === 0);
  else {
    const g = f.sub(-0.3, 0.16);
    for (const d of [-0.04, 0.04]) g.lying(0.026, 0.006, 8, d + 0.2, 0.026, 0.04, 0x2a2a2e, 'x');
    g.box(0.008, 0.006, 0.08, 0.2, 0.038, 0.04, 0xc83a2a);
    g.cyl(0.04, 0.04, 0.008, 8, 0, 0.06, 0, WHITE); g.cyl(0.005, 0.005, 0.06, 4, 0, 0, 0, WHITE);
    for (const s of [-1, 1]) { g.box(0.03, 0.006, 0.03, s * 0.06, 0.035, 0, WHITE); g.box(0.03, 0.035, 0.004, s * 0.076, 0.035, 0, WHITE); }
    folk(g, kit, 0.06, 0, -PI / 2, OLIVE, OLIVE_D, true);
  }
  // seconde passe : jardinières aux fenêtres, applique allumée, haies des côtés, cabane du fond, potager, antenne de télévision
  for (const u of [-0.15, 0.15]) { b.box(0.1, 0.02, 0.025, u, 0.082, D / 2 + 0.014, 0x8a6a48); for (let i = 0; i < 3; i++) b.box(0.016, 0.014, 0.016, u - 0.03 + i * 0.03, 0.1, D / 2 + 0.014, [0xe84a6a, 0xf2d25a, 0xd84a3a][(i + v) % 3]); }
  b.box(0.02, 0.026, 0.02, -0.07, 0.17, D / 2 + 0.012, 0xffe8b0, true);
  for (const s of [-1, 1]) f.box(0.05, 0.07, 0.4, s * 0.45, 0, 0.2, dk(LEAF_D, 0.9 + 0.1 * s));
  const sh = f.sub(-0.34, -0.42); sh.box(0.14, 0.12, 0.1, 0, 0, 0, 0x8a6a48); sh.add(new THREE.BoxGeometry(0.17, 0.012, 0.13).rotateZ(0.15), 0, 0.13, 0, 0x5a5e62); sh.box(0.05, 0.09, 0.004, 0.02, 0, 0.052, 0x5a4434);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) f.sphere(0.018, 0.12 + j * 0.05, 0.015, -0.42 + i * 0.06, dk(0x7aa860, 0.85 + 0.25 * H(i * 4 + j, 140 + v)), 0, 0.7);
  b.sub(-W / 2 - 0.002, 0, -PI / 2).add(new THREE.SphereGeometry(0.035, 8, 3, 0, PI * 2, 0, PI / 2.6).rotateX(PI / 2), -0.08, 0.2, 0.01, 0xe8e8e0);
  for (const d of [0, 0.06]) { f.cyl(0.022, 0.02, 0.06, 6, 0.4 - d, 0, -0.02, 0x3a5a3a); f.cyl(0.024, 0.024, 0.008, 6, 0.4 - d, 0.06, -0.02, 0x2a4a2a); }
  if (!flat) { b.cyl(0.003, 0.003, 0.12, 3, 0.12, h + 0.17, 0.0, STEEL); for (let i = 0; i < 3; i++) b.box(0.08 - i * 0.02, 0.004, 0.004, 0.12, h + 0.24 + i * 0.02, 0.0, STEEL); }
  tree(f, 0.38, -0.4, 0.8, v % 2 ? 0x5f9a50 : LEAF);
  tufts(f, 8, 491 + v, 0.46, [[-0.3, -0.36, 0.32, 0.06], [-0.06, 0.06, 0.1, 0.46]]);
}

/** Futuriste : le module d'habitation blanc aux bouts arrondis, liserés, panneaux solaires, hublot lumineux, drone domestique */
function houseFutureG(f: Fr, kit: FrontKit, v: number) {
  const trim = [NEON, NEON_G, 0xff4aa8, 0xffe24a][v % 4], W = 0.46, D = 0.32, h = 0.24;
  const b = f.sub(0.0, -0.16);
  b.box(W + 0.04, 0.03, D + 0.04, 0, 0, 0, FDARK); b.box(W, h, D, 0, 0.03, 0, FWALL);
  for (const s of [-1, 1]) b.cyl(D / 2, D / 2, h, 10, s * W / 2, 0.03, 0, FWALL);
  b.box(W, 0.01, 0.006, 0, h - 0.02, D / 2 + 0.002, trim, 'neon'); b.box(W, 0.008, 0.006, 0, 0.05, D / 2 + 0.002, trim, 'neon');
  b.box(0.22, 0.1, 0.008, -0.1, 0.09, D / 2 + 0.002, FGLASS, H(v, 7) > 0.3 ? 'neon' : false); b.box(0.006, 0.1, 0.012, -0.1, 0.09, D / 2 + 0.004, FDARK);
  b.box(0.09, 0.17, 0.008, 0.14, 0.03, D / 2 + 0.003, 0x1a2a3a); b.box(0.004, 0.17, 0.012, 0.14, 0.03, D / 2 + 0.005, trim, 'neon');
  b.lying(0.05, 0.01, 10, -W / 2 - D / 2 + 0.004, 0.14, 0, FGLASS, 'x', 'neon');
  b.box(0.04, 0.03, 0.004, 0.22, 0.16, D / 2 + 0.004, TEAM_EMBLEM);
  b.box(W, 0.02, D, 0, h + 0.03, 0, 0xd8e2ea);
  for (const u of [-0.12, 0.08]) { b.add(new THREE.BoxGeometry(0.16, 0.008, 0.14).rotateX(-0.3), u, h + 0.07, -0.02, 0x2a4a8a); b.add(new THREE.BoxGeometry(0.16, 0.004, 0.008).rotateX(-0.3), u, h + 0.076, -0.02, trim, 'neon'); }
  b.cyl(0.004, 0.006, 0.18, 4, 0.2, h + 0.05, -0.1, FDARK); b.ball(0.012, 0.2, h + 0.24, -0.1, trim, 'neon');
  // le jardinet : bornes lumineuses, dalles, jardinières, drone qui tourne, petit drapeau, l'habitant
  for (let i = 0; i < 4; i++) { const x = -0.4 + i * 0.27; if (Math.abs(x) < 0.08) continue; f.cyl(0.012, 0.014, 0.06, 6, x, 0, 0.44, FDARK); f.box(0.016, 0.01, 0.016, x, 0.06, 0.44, trim, 'neon'); }
  path(f, 0.14, 0.46, 0.14, 0.04, 0.08, 0xc8d4dc, 131 + v, 0.07);
  for (const [u, vv] of [[-0.32, 0.3], [0.36, 0.28]]) { f.box(0.12, 0.04, 0.08, u, 0, vv, FDARK); f.box(0.122, 0.005, 0.082, u, 0.04, vv, trim, 'neon'); for (const d of [-0.03, 0.03]) f.sphere(0.028, u + d, 0.065, vv, 0x5ac88a, 0, 0.9); }
  const dr = new Fr(kit.turn(f.w(0, 0.4, 0.0), [0, 1, 0], 0.2), 0, 0, 0, 0);
  dr.cyl(0.024, 0.02, 0.014, 8, 0.25, 0, 0, FWALL); dr.add(new THREE.TorusGeometry(0.03, 0.003, 3, 8).rotateX(PI / 2), 0.25, 0.007, 0, trim, 'neon');
  mast(f, kit, -0.42, 0.42, 0.4, 0.12, 0.07, FWALL, trim);
  if (v % 2) folk(f, kit, -0.12, 0.24, 0.4, FWALL, team(TEAM_A, 0.9)); else robot(f, -0.12, 0.24, 0.6, FWALL, trim);
  // seconde passe : le potager hydroponique, la capsule de rangement, le banc, l'applique, le scooter flottant
  const hy = f.sub(0.16, -0.44); hy.box(0.24, 0.05, 0.08, 0, 0, 0, FDARK); hy.box(0.242, 0.005, 0.082, 0, 0.05, 0, trim, 'neon'); for (let i = 0; i < 4; i++) hy.sphere(0.02, -0.09 + i * 0.06, 0.07, 0, 0x6ad89a, 0, 0.8);
  const pd = f.sub(-0.36, -0.42); pd.cyl(0.06, 0.07, 0.12, 8, 0, 0, 0, FWALL); pd.cyl(0.062, 0.062, 0.008, 8, 0, 0.08, 0, trim, 'neon'); pd.sphere(0.06, 0, 0.12, 0, FWALL, 0, 0.5);
  f.box(0.14, 0.012, 0.045, 0.32, 0.04, 0.12, FWALL); f.box(0.1, 0.04, 0.035, 0.32, 0, 0.12, FDARK);
  b.box(0.02, 0.03, 0.02, 0.2, 0.16, D / 2 + 0.012, trim, 'neon');
  b.cyl(0.004, 0.004, 0.08, 4, -0.16, h + 0.05, 0.08, FDARK);
  const wt = new Fr(kit.turn(b.w(-0.16, h + 0.17, 0.08), [0, 1, 0], 0.5), 0, 0, 0, 0);
  for (let k = 0; k < 3; k++) { const q = (k * 2 * PI) / 3; wt.box(0.012, 0.08, 0.004, Math.sin(q) * 0.03, -0.04, Math.cos(q) * 0.03, FWALL); } wt.box(0.07, 0.004, 0.004, 0, 0.0, 0, trim, 'neon');
  const sc = kit.sway(f.w(-0.32, 0.06, 0.12), [1, 0, 0], 0.03, 0.5), q = new Fr(sc, 0, 0, 0.3, 0); q.box(0.05, 0.03, 0.16, 0, -0.015, 0, FWALL); q.box(0.052, 0.006, 0.12, 0, -0.02, 0, trim, 'neon'); q.box(0.04, 0.012, 0.05, 0, 0.015, -0.03, FDARK); q.box(0.06, 0.006, 0.006, 0, 0.05, 0.06, FDARK); q.box(0.006, 0.04, 0.006, 0, 0.015, 0.06, FDARK);
  tree(f, 0.38, -0.4, 0.8, 0x5ab87a);
  tufts(f, 6, 501 + v, 0.46, [[-0.34, -0.34, 0.36, 0.04], [0.06, 0.04, 0.22, 0.46]], false);
}

/** La maison d'un sous-officier de la garnison (1 × 1), moderne (4) ou futuriste (5) ; quelques variantes selon `v` */
export function garrisonHouse(p: Parts, age: number, v: number, kit: FrontKit) {
  const f = new Fr(p, 0, 0), k = Math.abs(Math.round(v)) % 12;
  if (age <= 4) houseModernG(f, kit, k);
  else houseFutureG(f, kit, k);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* HÉLIPORT MILITAIRE (2 × 2)                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Hélicoptère militaire posé, le nez vers +z : patins, fuselage, verrière, poutre de queue, dérive, ailettes et paniers de roquettes, rotors qui tournent */
function helicopter(f: Fr, kit: FrontKit, u: number, v: number, ry: number, col = OLIVE, y = 0, spin = 0.4) {
  const g = f.sub(u, v, ry, y);
  for (const s of [-1, 1]) { g.box(0.008, 0.008, 0.3, s * 0.07, 0, 0.01, 0x2a2c2e); for (const c of [-0.07, 0.07]) g.box(0.006, 0.05, 0.006, s * 0.064, 0.006, c, 0x2a2c2e); }
  g.add(new THREE.IcosahedronGeometry(1, 1).scale(0.075, 0.065, 0.16), 0, 0.12, 0.0, col);
  g.add(new THREE.IcosahedronGeometry(1, 1).scale(0.056, 0.048, 0.07), 0, 0.135, 0.1, 0x7a9ab0);
  for (const s of [-1, 1]) g.box(0.004, 0.05, 0.08, s * 0.072, 0.085, -0.03, 0x1e2226);
  g.add(new THREE.CylinderGeometry(0.012, 0.026, 0.34, 6).rotateX(-PI / 2), 0, 0.15, -0.3, col);
  g.box(0.006, 0.09, 0.05, 0, 0.14, -0.46, col); g.box(0.1, 0.006, 0.03, 0, 0.16, -0.42, col);
  for (const s of [-1, 1]) g.box(0.003, 0.03, 0.04, s * 0.021, 0.137, -0.24, TEAM_EMBLEM);
  g.box(0.06, 0.035, 0.1, 0, 0.175, -0.04, dk(col, 0.9)); for (const s of [-1, 1]) g.lying(0.01, 0.03, 6, s * 0.025, 0.19, -0.1, 0x2a2c2e);
  g.box(0.22, 0.008, 0.03, 0, 0.1, -0.03, col); for (const s of [-1, 1]) { g.lying(0.014, 0.07, 6, s * 0.1, 0.09, -0.03, 0x3a3e40); g.cyl(0.012, 0.012, 0.004, 6, s * 0.1, 0.075, 0.005, 0x1e1e22); }
  g.box(0.03, 0.012, 0.012, 0, 0.055, 0.15, 0xfff1c9, true); g.ball(0.008, 0.0, 0.2, -0.45, 0xff3a3a, true);
  g.cyl(0.012, 0.014, 0.04, 6, 0, 0.19, -0.03, 0x3a3e40);
  const r = new Fr(kit.turn(g.w(0, 0.235, -0.03), [0, 1, 0], spin), 0, 0, g.ry, 0);
  r.cyl(0.022, 0.022, 0.016, 8, 0, -0.008, 0, 0x2a2c2e);
  for (let k = 0; k < 4; k++) r.sub(0, 0, (k * PI) / 2).box(0.026, 0.004, 0.3, 0, 0, 0.16, 0x2a2c2e);
  const ax = Math.cos(g.ry), az = -Math.sin(g.ry);
  const tr = new Fr(kit.turn(g.w(0.012, 0.165, -0.47), [ax, 0, az], spin * 4), 0, 0, g.ry, 0);
  tr.box(0.004, 0.09, 0.012, 0, -0.045, 0, 0x2a2c2e); tr.box(0.004, 0.012, 0.09, 0, -0.006, 0, 0x2a2c2e);
}

/** Moderne : l'aire marquée, l'hélicoptère de combat, le hangar en demi-lune, le camion-citerne, la tour de contrôle, la manche à air */
function heliportModern(f: Fr, kit: FrontKit) {
  const pad = 0x4f535a, yel = 0xf2c23a;
  // l'aire : plateau de béton, anneau jaune, H blanc, balises qui luisent la nuit
  const a = f.sub(-0.18, 0.22);
  a.cyl(0.5, 0.52, 0.03, 16, 0, 0, 0, CONC_D); a.cyl(0.47, 0.47, 0.008, 16, 0, 0.03, 0, pad);
  a.add(new THREE.TorusGeometry(0.4, 0.014, 3, 24).rotateX(PI / 2), 0, 0.04, 0, yel);
  for (const s of [-1, 1]) a.box(0.05, 0.004, 0.28, s * 0.09, 0.038, 0, WHITE); a.box(0.13, 0.004, 0.05, 0, 0.038, 0, WHITE);
  for (let k = 0; k < 10; k++) { const q = (k / 10) * PI * 2; a.box(0.022, 0.016, 0.022, Math.cos(q) * 0.49, 0.03, Math.sin(q) * 0.49, k % 2 ? 0x3aff7a : 0xffe24a, true); }
  helicopter(a, kit, 0.02, 0.0, 0.5, OLIVE, 0.038, 0.35);
  // le hangar en demi-lune : tôle ondulée en arceaux, fond, grande porte ouverte, intérieur sombre, enseigne, établi
  const h = f.sub(0.62, -0.6, -PI / 2);
  h.add(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 10, 1, false, 0, PI).rotateZ(PI / 2).rotateY(PI / 2), 0, 0, 0, 0x8a9478);
  for (let i = 0; i <= 5; i++) h.add(new THREE.TorusGeometry(0.283, 0.005, 3, 10, PI), 0, 0, -0.3 + i * 0.12, dk(0x8a9478, 0.75));
  h.box(0.4, 0.2, 0.006, 0, 0, 0.304, 0x1e2226); h.box(0.42, 0.03, 0.01, 0, 0.2, 0.306, 0x6a7058);
  h.box(0.1, 0.04, 0.004, 0, 0.235, 0.304, OLIVE_D); h.box(0.03, 0.03, 0.004, -0.03, 0.24, 0.308, TEAM_EMBLEM); h.box(0.04, 0.012, 0.004, 0.025, 0.248, 0.308, 0xfff1c9, true);
  h.box(0.2, 0.012, 0.03, 0, 0.18, 0.2, 0xfff1c9, true);
  // la tour de contrôle : socle, cabine vitrée qui luit, garde-corps, antennes, feu rouge, le contrôleur
  const t = f.sub(-0.72, -0.62);
  t.box(0.22, 0.3, 0.22, 0, 0, 0, CONC); t.box(0.24, 0.014, 0.24, 0, 0.3, 0, CONC_D);
  t.box(0.2, 0.1, 0.2, 0, 0.314, 0, GLASS, true); for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) t.box(0.012, 0.1, 0.012, x, 0.314, z, 0x5d6168);
  t.box(0.24, 0.016, 0.24, 0, 0.414, 0, 0x5d6168); t.box(0.07, 0.14, 0.006, 0.05, 0, 0.112, 0x4a5a4a);
  t.cyl(0.004, 0.006, 0.22, 4, 0.06, 0.43, -0.06, STEEL); t.ball(0.012, 0.06, 0.66, -0.06, 0xff3a3a, true); t.cyl(0.003, 0.003, 0.14, 3, -0.07, 0.43, 0.05, STEEL);
  const bc = new Fr(kit.turn(t.w(-0.05, 0.45, -0.05), [0, 1, 0], 0.4), 0, 0, 0, 0);
  bc.box(0.04, 0.03, 0.02, 0, 0, 0.012, 0x3aff7a, true); bc.box(0.04, 0.03, 0.02, 0, 0, -0.012, WHITE, true);
  // la manche à air sur son mât
  f.cyl(0.006, 0.008, 0.42, 4, -0.88, 0, -0.14, 0x9aa3ad);
  const sock = kit.sway(f.w(-0.88, 0.4, -0.14), [0, 1, 0], 0.5, 0.4);
  for (let k = 0; k < 4; k++) sock.add(new THREE.CylinderGeometry(0.024 - k * 0.004, 0.02 - k * 0.004, 0.032, 6).rotateZ(PI / 2), -0.03 - k * 0.032, 0, 0, k % 2 ? WHITE : 0xf28a3c);
  // le camion-citerne de kérosène, son tuyau ; fûts, caisses, chariot de munitions ; l'équipage et le mécanicien
  const c = f.sub(0.62, 0.55, PI);
  c.box(0.13, 0.03, 0.38, 0, 0.035, 0, 0x2a2c2e); c.box(0.13, 0.1, 0.1, 0, 0.06, 0.13, OLIVE); c.box(0.12, 0.04, 0.006, 0, 0.11, 0.182, 0x9fc4dc);
  c.lying(0.06, 0.24, 10, 0, 0.12, -0.07, OLIVE_D); for (const v2 of [-0.16, 0.02]) c.lying(0.062, 0.01, 10, 0, 0.12, v2, 0x2a2c2e);
  c.box(0.05, 0.02, 0.004, 0.066, 0.1, -0.07, 0xd8c050);
  for (const [x, z] of [[-0.066, 0.13], [0.066, 0.13], [-0.066, -0.1], [0.066, -0.1], [-0.066, -0.16], [0.066, -0.16]]) c.lying(0.03, 0.022, 8, x, 0.03, z, 0x1e1e22, 'x');
  f.tube([0.62, 0.08, 0.76], [0.3, 0.02, 0.5], 0.006, 0x2a2a2e, false, 4);
  for (const [u, v2, cc] of [[0.88, 0.1, 0x4a6a3a], [0.82, 0.14, 0x4a6a3a], [0.88, 0.2, 0x8a3a2a]] as V3[]) drum(f, u, v2, cc);
  ammoStack(f, 0.36, -0.1, PI / 2, 2, 2);
  const cart = f.sub(0.24, 0.66, 0.4); cart.box(0.1, 0.012, 0.16, 0, 0.03, 0, 0x5d6168); for (const s of [-1, 1]) for (const d of [-0.06, 0.06]) cart.lying(0.016, 0.01, 6, s * 0.05, 0.016, d, 0x1e1e22, 'x');
  for (let i = 0; i < 2; i++) cart.lying(0.015, 0.14, 6, -0.02 + i * 0.04, 0.058, 0, 0x6a7058);
  trooper(f, 0.16, 0.0, -0.8, OLIVE_D, 0x2a2c2e, { legs: OLIVE_D }); folk(f, kit, 0.3, 0.32, -1.2, OLIVE, OLIVE_D); folk(f, kit, 0.5, 0.3, PI / 2, 0x3a4a5a, 0x2a2a2e);
  // le drapeau, les projecteurs, l'herbe et les buissons autour de l'aire
  mast(f, kit, -0.88, 0.88, 0.72, 0.22, 0.12);
  lamp(f, -0.52, -0.3, 4, 0.34, PI / 2); lamp(f, 0.32, -0.25, 4, 0.34, -PI / 2);
  bush(f, -0.9, 0.42, 0.05); bush(f, 0.0, -0.88, 0.045); tree(f, -0.32, -0.86, 0.85);
  // seconde passe : le tracteur de piste, le chariot extincteur, les cales, le pilote qui court vers l'appareil
  const tw = f.sub(0.12, -0.42, 0.6); tw.box(0.08, 0.04, 0.12, 0, 0.02, 0, 0xf2c23a); tw.box(0.05, 0.03, 0.03, 0, 0.06, -0.03, 0x2a2c2e); for (const s of [-1, 1]) for (const d of [-0.04, 0.04]) tw.lying(0.02, 0.014, 6, s * 0.045, 0.02, d, 0x1e1e22, 'x'); tw.box(0.012, 0.012, 0.08, 0, 0.03, 0.1, IRON);
  const ex = f.sub(0.22, -0.28); ex.cyl(0.022, 0.022, 0.1, 6, 0, 0.02, 0, REDX); for (const s of [-1, 1]) ex.lying(0.02, 0.008, 6, s * 0.026, 0.02, 0, 0x1e1e22, 'x'); ex.box(0.012, 0.08, 0.012, 0, 0.02, -0.03, IRON);
  for (const s of [-1, 1]) f.sub(-0.18, 0.22, 0.5).box(0.02, 0.014, 0.03, s * 0.07, 0.038, 0.18, 0xf2c23a);
  folk(f, kit, -0.62, 0.66, -2.4, OLIVE_D, 0x2a2c2e, false, 'run');
  tufts(f, 14, 511, 0.95, [[-0.72, -0.32, 0.36, 0.76], [0.25, -0.9, 0.95, -0.24], [-0.88, -0.8, -0.56, -0.4], [0.36, 0.3, 0.95, 0.95], [0.7, 0.0, 0.95, 0.3]]);
}

/** Futuriste : l'aire à anneaux de lumière, l'aéronef à rotors carénés qui tournent, le hangar lisse, la tour, le robot de piste */
function heliportFuture(f: Fr, kit: FrontKit) {
  const a = f.sub(-0.18, 0.22);
  a.cyl(0.5, 0.52, 0.03, 16, 0, 0, 0, FDARK); a.cyl(0.47, 0.47, 0.008, 16, 0, 0.03, 0, 0x3a4652);
  for (const r of [0.42, 0.3]) a.add(new THREE.TorusGeometry(r, 0.008, 3, 24).rotateX(PI / 2), 0, 0.04, 0, NEON, 'neon');
  for (const s of [-1, 1]) a.box(0.04, 0.004, 0.26, s * 0.09, 0.038, 0, NEON, 'neon'); a.box(0.13, 0.004, 0.04, 0, 0.038, 0, NEON, 'neon');
  // l'aéronef : coque blanche en coin, verrière, ailes, deux rotors carénés qui tournent, liserés, notre écu
  const g = a.sub(0.02, 0.0, 0.5, 0.04);
  for (const s of [-1, 1]) g.box(0.012, 0.03, 0.16, s * 0.06, 0, 0.0, FDARK);
  g.add(new THREE.CylinderGeometry(0.04, 0.08, 0.36, 6).rotateX(PI / 2).scale(1.1, 0.6, 1), 0, 0.08, 0, FWALL);
  g.add(new THREE.IcosahedronGeometry(1, 1).scale(0.045, 0.035, 0.08), 0, 0.11, 0.1, FGLASS, 'neon');
  g.box(0.46, 0.012, 0.08, 0, 0.09, -0.04, FWALL); g.box(0.46, 0.004, 0.012, 0, 0.096, 0.0, NEON, 'neon');
  g.box(0.08, 0.06, 0.006, 0, 0.1, -0.2, FWALL); for (const s of [-1, 1]) g.box(0.003, 0.03, 0.04, s * 0.06, 0.08, -0.06, TEAM_EMBLEM);
  for (const s of [-1, 1]) {
    g.add(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12, 1, true), s * 0.23, 0.08, -0.04, FDARK); g.add(new THREE.TorusGeometry(0.075, 0.006, 3, 14).rotateX(PI / 2), s * 0.23, 0.11, -0.04, NEON, 'neon');
    const fan = new Fr(kit.turn(g.w(s * 0.23, 0.095, -0.04), [0, 1, 0], 1.2 * s), 0, 0, 0, 0);
    for (let k = 0; k < 3; k++) fan.sub(0, 0, (k * 2 * PI) / 3).box(0.014, 0.004, 0.068, 0, 0, 0.034, 0xb8c4cc);
    fan.cyl(0.014, 0.014, 0.01, 6, 0, -0.005, 0, FDARK);
  }
  // le hangar lisse : voûte blanche, nervures lumineuses, porte ouverte sur l'intérieur éclairé
  const h = f.sub(0.62, -0.6, -PI / 2);
  h.add(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 12, 1, false, 0, PI).rotateZ(PI / 2).rotateY(PI / 2).scale(1, 0.8, 1), 0, 0, 0, 0xe8eef4);
  for (let i = 0; i <= 4; i++) h.add(new THREE.TorusGeometry(0.283, 0.005, 3, 12, PI).scale(1, 0.8, 1), 0, 0, -0.3 + i * 0.15, i % 2 ? FDARK : NEON, i % 2 ? false : 'neon');
  h.box(0.4, 0.18, 0.006, 0, 0, 0.304, 0x1a2a3a); h.box(0.36, 0.02, 0.008, 0, 0.02, 0.306, NEON, 'neon'); h.box(0.42, 0.012, 0.01, 0, 0.18, 0.306, NEON, 'neon');
  // la tour de contrôle en fût, sa cabine lumineuse, son anneau qui tourne
  const t = f.sub(-0.72, -0.62);
  t.cyl(0.08, 0.1, 0.32, 10, 0, 0, 0, FWALL); t.cyl(0.13, 0.1, 0.1, 10, 0, 0.32, 0, FGLASS, 'neon'); t.cyl(0.14, 0.14, 0.014, 10, 0, 0.42, 0, FDARK);
  t.cyl(0.006, 0.008, 0.2, 4, 0, 0.434, 0, FDARK); t.ball(0.014, 0, 0.64, 0, 0xff4a4a, 'neon');
  const rg = new Fr(kit.turn(t.w(0, 0.5, 0), [0, 1, 0], 0.3), 0, 0, 0, 0);
  rg.add(new THREE.TorusGeometry(0.06, 0.004, 3, 12).rotateX(PI / 2), 0, 0, 0, NEON, 'neon'); rg.box(0.14, 0.02, 0.006, 0, 0, 0, FDARK);
  // la manche à air, la borne de recharge et son câble, les caisses, les pilotes, le robot de piste, le drapeau, les arbres
  f.cyl(0.006, 0.008, 0.42, 4, -0.88, 0, -0.14, FDARK);
  const sock = kit.sway(f.w(-0.88, 0.4, -0.14), [0, 1, 0], 0.5, 0.4);
  for (let k = 0; k < 4; k++) sock.add(new THREE.CylinderGeometry(0.024 - k * 0.004, 0.02 - k * 0.004, 0.032, 6).rotateZ(PI / 2), -0.03 - k * 0.032, 0, 0, k % 2 ? WHITE : NEON, 0, k % 2 ? false : 'neon');
  f.box(0.08, 0.2, 0.06, 0.4, 0, 0.0, FWALL); f.box(0.05, 0.06, 0.004, 0.4, 0.12, 0.031, NEON_G, 'neon'); f.tube([0.4, 0.06, 0.03], [0.14, 0.05, 0.16], 0.006, FDARK, false, 4);
  for (const [u, v, r] of [[0.84, 0.1, 0.2], [0.86, 0.22, -0.1], [0.84, 0.16, 0.05]]) { const cr = f.sub(u, v, r, r === 0.05 ? 0.08 : 0); cr.box(0.09, 0.08, 0.09, 0, 0, 0, FWALL); cr.box(0.092, 0.008, 0.092, 0, 0.04, 0, NEON, 'neon'); }
  trooper(f, 0.16, 0.0, -0.8, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8 }); folk(f, kit, 0.32, 0.36, -1.2, 0xdfe8f0, 0x3a3a48); robot(f, 0.52, 0.5, -0.8);
  mast(f, kit, -0.88, 0.88, 0.74, 0.22, 0.12, FWALL, NEON);
  lamp(f, -0.52, -0.3, 5, 0.36); lamp(f, 0.32, -0.25, 5, 0.36);
  for (const [u, v] of [[0.84, 0.84], [0.56, 0.86]]) { f.box(0.12, 0.04, 0.12, u, 0, v, FDARK); f.sphere(0.045, u, 0.07, v, 0x5ac88a, 0, 0.9); }
  tree(f, -0.32, -0.86, 0.85, 0x5ab87a); bush(f, -0.9, 0.42, 0.05, 0x5ac88a);
  // seconde passe : le drone cargo qui tourne autour de la base, la palette sanglée, la table des plans, le pilote
  const cg = new Fr(kit.turn(f.w(0.1, 0.62, -0.1), [0, 1, 0], 0.1), 0, 0, 0, 0);
  cg.box(0.08, 0.03, 0.08, 0.7, 0, 0, FWALL); for (const [a, c] of [[0.06, 0.06], [-0.06, 0.06], [0.06, -0.06], [-0.06, -0.06]]) cg.add(new THREE.TorusGeometry(0.026, 0.003, 3, 8).rotateX(PI / 2), 0.7 + a, 0.02, c, NEON, 'neon'); cg.box(0.05, 0.05, 0.05, 0.7, -0.06, 0, 0xd8a040);
  const pal = f.sub(-0.5, -0.22, 0.3); pal.box(0.2, 0.02, 0.16, 0, 0, 0, FDARK); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) pal.box(0.08, 0.07, 0.06, -0.05 + i * 0.1, 0.02, -0.035 + j * 0.07, FWALL); pal.box(0.006, 0.08, 0.17, 0, 0.02, 0, NEON, 'neon');
  holo(f, 0.62, 0.62, -0.6, 0.16);
  folk(f, kit, -0.62, 0.66, -2.4, FWALL, team(TEAM_A, 0.9), false, 'run');
  tufts(f, 10, 521, 0.95, [[-0.72, -0.32, 0.36, 0.76], [0.25, -0.9, 0.95, -0.24], [-0.88, -0.8, -0.56, -0.4], [0.36, 0.0, 0.95, 0.95]], false);
}

/** L'héliport militaire de la garnison (2 × 2), moderne (4) ou futuriste (5) */
export function milHeliport(p: Parts, age: number, kit: FrontKit) {
  const f = new Fr(p, 0, 0);
  if (age <= 4) heliportModern(f, kit);
  else heliportFuture(f, kit);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* STATION RADAR (2 × 2)                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Pylône en treillis : quatre montants qui s'affinent, entretoises en croix, plateforme et garde-corps */
function lattice(f: Fr, u: number, v: number, h: number, r0: number, r1: number, col: number, n = 4) {
  const g = f.sub(u, v), C4: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [a, b] of C4) g.tube([a * r0, 0, b * r0], [a * r1, h, b * r1], 0.006, col);
  for (let i = 0; i < n; i++) {
    const y0 = (i * h) / n, y1 = ((i + 1) * h) / n, ra = r0 + ((r1 - r0) * i) / n, rb = r0 + ((r1 - r0) * (i + 1)) / n;
    for (let k = 0; k < 4; k++) { const [a, b] = C4[k], [c, d] = C4[(k + 1) % 4]; g.tube([a * ra, y0, b * ra], [c * rb, y1, d * rb], 0.0025, col, false, 3); }
  }
  g.box(r1 * 2 + 0.06, 0.012, r1 * 2 + 0.06, 0, h, 0, dk(col, 0.8));
  for (const [a, b] of C4) g.box(0.006, 0.05, 0.006, a * (r1 + 0.028), h, b * (r1 + 0.028), col);
}

/** Moderne : le pylône et son antenne qui tourne, le bâtiment technique, la parabole, le groupe électrogène, la citerne */
function radarModern(f: Fr, kit: FrontKit) {
  const frame = 0x5d6168;
  // le pylône et, au sommet, l'antenne : réflecteur courbe en lattes, bras du cornet, contrepoids ; elle tourne sans fin
  lattice(f, -0.48, -0.42, 0.62, 0.14, 0.07, 0xd8d8d0);
  f.cyl(0.03, 0.04, 0.09, 8, -0.48, 0.632, -0.42, 0x6a6e72);
  const an = new Fr(kit.turn(f.w(-0.48, 0.79, -0.42), [0, 1, 0], 0.25), 0, 0, 0, 0);
  for (let i = 0; i < 7; i++) { const q = -0.6 + (i * 1.2) / 6; an.sub(Math.sin(q) * 0.24, Math.cos(q) * 0.24 - 0.2, q).box(0.075, 0.12, 0.01, 0, -0.06, 0, i % 2 ? 0xe8e8e0 : 0xd8d8d0); }
  an.box(0.012, 0.012, 0.14, 0, -0.06, -0.05, 0x6a6e72); an.box(0.03, 0.03, 0.03, 0, -0.075, -0.12, 0x4a4e52); an.box(0.36, 0.012, 0.012, 0, 0.06, 0.04, 0x6a6e72);
  an.box(0.06, 0.05, 0.05, 0, -0.075, 0.1, 0x3a3e42); an.ball(0.01, 0, 0.08, 0.04, 0xff3a3a, true);
  // le bâtiment technique : béton, bandeau de fenêtres qui luisent, porte, climatiseurs, antennes fouets, chemin de câbles
  const b = f.sub(0.38, -0.56), W = 0.7, D = 0.4, h = 0.3;
  b.box(W + 0.03, 0.03, D + 0.03, 0, 0, 0, CONC_D); b.box(W, h, D, 0, 0.03, 0, CONC);
  for (let i = 1; i < 5; i++) b.box(0.006, h, D + 0.006, -W / 2 + (i * W) / 5, 0.03, 0, 0xa8a8a2);
  b.box(W + 0.03, 0.03, D + 0.03, 0, h + 0.03, 0, CONC_L);
  b.box(0.36, 0.08, 0.008, 0.1, 0.17, D / 2 + 0.002, GLASS, true); for (let i = 0; i <= 4; i++) b.box(0.008, 0.08, 0.012, -0.08 + i * 0.09, 0.17, D / 2 + 0.004, frame);
  door(b, -0.22, D / 2 + 0.004, 0.08, 0.18, 0x4a5a4a, frame, 0.03, false); b.box(0.05, 0.03, 0.004, -0.22, 0.16, D / 2 + 0.012, 0xf2c23a);
  b.box(0.04, 0.02, 0.03, -0.22, 0.23, D / 2 + 0.02, 0xfff1c9, true);
  for (const u of [-0.15, 0.05]) { b.box(0.1, 0.06, 0.08, u, h + 0.06, -0.05, 0xd8d8d0); b.cyl(0.025, 0.025, 0.008, 8, u, h + 0.12, -0.05, 0x3c4048); }
  for (const [u, hh] of [[0.24, 0.34], [0.3, 0.24]]) { b.cyl(0.004, 0.006, hh, 4, u, h + 0.06, 0.1, STEEL); b.ball(0.008, u, h + 0.06 + hh, 0.1, 0xff3a3a, true); }
  f.tube([-0.4, 0.62, -0.42], [-0.4, 0.04, -0.42], 0.006, 0x2a2a2e, false, 4); f.tube([-0.4, 0.04, -0.42], [0.03, 0.2, -0.5], 0.006, 0x2a2a2e, false, 4);
  // la parabole pointée vers le ciel, sur son socle
  const d = f.sub(-0.5, 0.36);
  d.box(0.1, 0.06, 0.1, 0, 0, 0, CONC_D); d.cyl(0.02, 0.026, 0.1, 6, 0, 0.06, 0, 0x8a8f96);
  d.add(new THREE.SphereGeometry(0.16, 10, 4, 0, PI * 2, 0, PI / 2.6).rotateX(PI - 0.7), 0, 0.26, -0.04, 0xe8e8e0);
  d.tube([0, 0.22, -0.02], [0, 0.32, 0.08], 0.004, 0x8a8f96, false, 3); d.box(0.02, 0.02, 0.02, 0, 0.31, 0.08, 0x4a4e52);
  // le groupe électrogène, la citerne sur ses berceaux, les fûts ; la clôture grillagée et son portail
  generator(f, kit, 0.66, 0.06, -PI / 2);
  const tk = f.sub(0.56, 0.4);
  for (const s of [-1, 1]) tk.box(0.04, 0.05, 0.12, s * 0.1, 0, 0, CONC_D);
  tk.lying(0.06, 0.32, 10, 0, 0.1, 0, 0xe8e8e0, 'x'); for (const s of [-1, 1]) tk.lying(0.062, 0.01, 10, s * 0.12, 0.1, 0, 0x8a8f96, 'x');
  tk.box(0.06, 0.02, 0.004, 0, 0.1, 0.061, REDX);
  for (const [u, v] of [[0.86, 0.3], [0.86, 0.4]]) drum(f, u, v, 0x4a6a3a);
  const R = 0.92;
  for (const [x0, z0, x1, z1] of [[-R, -R, R, -R], [-R, -R, -R, R], [R, -R, R, R], [-R, R, -0.2, R], [0.2, R, R, R]]) {
    const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / 0.3));
    f.sub((x0 + x1) / 2, (z0 + z1) / 2, a).box(0.004, 0.16, L, 0, 0.0, 0, 0xaab4bc);
    f.sub((x0 + x1) / 2, (z0 + z1) / 2, a).box(0.008, 0.008, L, 0, 0.16, 0, STEEL);
    for (let i = 0; i <= n; i++) f.box(0.012, 0.18, 0.012, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, STEEL);
  }
  for (const s of [-1, 1]) f.box(0.03, 0.2, 0.03, s * 0.2, 0, R, STEEL); f.sub(-0.1, R + 0.004, 0.4).box(0.18, 0.15, 0.006, 0.0, 0.01, 0, 0xaab4bc);
  // les opérateurs, la jeep, le drapeau, les projecteurs, l'herbe
  folk(f, kit, 0.05, -0.22, 0.4, OLIVE, OLIVE_D); folk(f, kit, -0.2, 0.06, -0.8, OLIVE, OLIVE_D);
  trooper(f, 0.3, 0.84, PI, OLIVE, OLIVE_D, { legs: OLIVE_D, rifle: true });
  jeep(f, 0.1, 0.5, 0.3);
  mast(f, kit, -0.82, 0.78, 0.72, 0.22, 0.12);
  lamp(f, -0.15, -0.2, 4, 0.34, 0.5); lamp(f, 0.82, -0.2, 4, 0.34, -PI / 2);
  bush(f, -0.78, -0.82, 0.045); bush(f, 0.78, 0.8, 0.045);
  // seconde passe : le radar de site sur sa remorque, le touret de câble, la guérite du portail, un arbre
  const tr = f.sub(-0.3, 0.62, 0.3);
  tr.box(0.12, 0.03, 0.22, 0, 0.04, 0, OLIVE); for (const s of [-1, 1]) tr.lying(0.03, 0.02, 8, s * 0.07, 0.03, 0.0, 0x1e1e22, 'x'); tr.box(0.012, 0.012, 0.12, 0, 0.04, 0.16, IRON);
  tr.box(0.04, 0.06, 0.04, 0, 0.07, -0.04, OLIVE_D);
  for (let i = 0; i < 5; i++) tr.box(0.02, 0.2, 0.006, -0.06 + i * 0.03, 0.13, -0.04, i % 2 ? 0xd8d8d0 : 0xe8e8e0);
  const dm = f.sub(0.2, 0.12); dm.lying(0.05, 0.05, 10, 0, 0.05, 0, 0x8a6a48, 'x'); dm.lying(0.03, 0.052, 8, 0, 0.05, 0, 0x2a2a2e, 'x');
  sentry(f, 0.36, 0.76, PI);
  tree(f, 0.78, 0.76, 0.75);
  tufts(f, 18, 531, 0.88, [[-0.68, -0.62, -0.28, -0.22], [0.0, -0.8, 0.78, -0.32], [-0.64, 0.22, -0.36, 0.5], [0.5, -0.06, 0.82, 0.55], [-0.06, 0.32, 0.26, 0.7]]);
}

/** Futuriste : le radôme blanc sur sa tour, l'antenne plate qui tourne au bout de son mât, le centre de calcul, la clôture d'énergie */
function radarFuture(f: Fr, kit: FrontKit) {
  // le radôme : socle, tour courte, boule à facettes, anneau de lumière
  const r = f.sub(-0.48, -0.42);
  r.cyl(0.16, 0.18, 0.05, 12, 0, 0, 0, FDARK); r.cyl(0.08, 0.1, 0.3, 10, 0, 0.05, 0, FWALL); r.cyl(0.1, 0.1, 0.01, 10, 0, 0.2, 0, NEON, 'neon');
  r.add(new THREE.IcosahedronGeometry(0.24, 1), 0, 0.52, 0, 0xf4f8fa); r.add(new THREE.TorusGeometry(0.2, 0.006, 3, 20).rotateX(PI / 2), 0, 0.4, 0, NEON, 'neon');
  r.ball(0.014, 0, 0.78, 0, 0xff4a4a, 'neon');
  // le mât de l'antenne plate : fût, rotule, panneau à grille de lumière qui tourne
  const m = f.sub(0.5, 0.3);
  m.cyl(0.08, 0.1, 0.04, 10, 0, 0, 0, FDARK); m.cyl(0.02, 0.03, 0.46, 8, 0, 0.04, 0, FWALL); m.sphere(0.03, 0, 0.5, 0, FDARK);
  const an = new Fr(kit.turn(m.w(0, 0.56, 0), [0, 1, 0], 0.2), 0, 0, 0, 0);
  an.add(new THREE.BoxGeometry(0.3, 0.18, 0.02).rotateX(-0.25), 0, 0.02, 0, FWALL);
  for (let i = 0; i < 3; i++) an.add(new THREE.BoxGeometry(0.28, 0.006, 0.004).rotateX(-0.25), 0, -0.03 + i * 0.05, 0.012 - (i - 1) * 0.012, NEON, 'neon');
  for (let i = 0; i < 4; i++) an.add(new THREE.BoxGeometry(0.004, 0.16, 0.004).rotateX(-0.25), -0.105 + i * 0.07, 0.02, 0.012, NEON, 'neon');
  an.box(0.04, 0.04, 0.04, 0, -0.05, -0.02, FDARK);
  // le centre de calcul : coque blanche, baies lumineuses, liserés, porte, écran holographique, antennes
  const b = f.sub(0.3, -0.58), W = 0.74, D = 0.38, h = 0.3;
  b.box(W + 0.04, 0.03, D + 0.04, 0, 0, 0, FDARK); b.box(W, h, D, 0, 0.03, 0, FWALL);
  for (const s of [-1, 1]) b.cyl(D / 2, D / 2, h, 10, s * W / 2, 0.03, 0, FWALL);
  b.box(0.36, 0.1, 0.008, 0.1, 0.14, D / 2 + 0.002, FGLASS, 'neon'); for (let i = 0; i <= 3; i++) b.box(0.008, 0.1, 0.012, -0.08 + i * 0.12, 0.14, D / 2 + 0.004, FDARK);
  b.box(W, 0.01, 0.006, 0, h, D / 2 + 0.003, NEON, 'neon'); b.box(W, 0.008, 0.006, 0, 0.05, D / 2 + 0.003, NEON, 'neon');
  b.box(0.1, 0.2, 0.01, -0.22, 0.03, D / 2 + 0.004, 0x1a2a3a); b.box(0.004, 0.2, 0.014, -0.22, 0.03, D / 2 + 0.006, NEON, 'neon'); b.box(0.04, 0.03, 0.004, -0.14, 0.2, D / 2 + 0.006, TEAM_EMBLEM);
  b.box(W - 0.04, 0.03, D - 0.06, 0, h + 0.03, 0, 0xd8e2ea);
  for (const u of [-0.2, 0.04]) { b.add(new THREE.BoxGeometry(0.2, 0.008, 0.14).rotateX(-0.3), u, h + 0.08, -0.02, 0x2a4a8a); b.add(new THREE.BoxGeometry(0.2, 0.004, 0.008).rotateX(-0.3), u, h + 0.086, -0.02, NEON, 'neon'); }
  b.cyl(0.004, 0.006, 0.26, 4, 0.28, h + 0.06, 0.08, FDARK); b.ball(0.01, 0.28, h + 0.33, 0.08, 0xff4a4a, 'neon');
  const hs = f.sub(-0.1, 0.0);
  hs.cyl(0.04, 0.05, 0.03, 8, 0, 0, 0, FDARK); hs.box(0.2, 0.12, 0.004, 0, 0.06, 0, 0x7ac8f0, 'neon'); for (let i = 0; i < 3; i++) hs.box(0.04, 0.012, 0.006, -0.05 + i * 0.05, 0.08 + 0.02 * i, 0.002, 0xff6a6a, 'neon');
  hs.add(new THREE.TorusGeometry(0.05, 0.004, 3, 10), 0.0, 0.12, 0.002, NEON_G, 'neon');
  // la batterie d'énergie, la clôture de pylônes lumineux, les opérateurs, le robot, le drapeau, les jardinières
  const e = f.sub(-0.5, 0.42);
  for (let i = 0; i < 3; i++) { e.cyl(0.05, 0.05, 0.18, 10, -0.12 + i * 0.12, 0, 0, FWALL); e.cyl(0.052, 0.052, 0.012, 10, -0.12 + i * 0.12, 0.11, 0, NEON_G, 'neon'); }
  const R = 0.92;
  for (const [x0, z0, x1, z1] of [[-R, -R, R, -R], [-R, -R, -R, R], [R, -R, R, R], [-R, R, -0.2, R], [0.2, R, R, R]]) {
    const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.32));
    f.sub((x0 + x1) / 2, (z0 + z1) / 2, a).box(0.008, 0.008, L, 0, 0.1, 0, NEON, 'neon');
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n; f.cyl(0.012, 0.016, 0.15, 6, x, 0, z, FDARK); f.box(0.016, 0.012, 0.016, x, 0.15, z, NEON, 'neon'); }
  }
  for (const s of [-1, 1]) { f.cyl(0.018, 0.024, 0.26, 6, s * 0.2, 0, R, FDARK); f.ball(0.022, s * 0.2, 0.28, R, NEON, 'neon'); }
  folk(f, kit, 0.05, -0.2, 0.4, 0xdfe8f0, 0x3a3a48); trooper(f, 0.3, 0.82, PI, FWALL, team(TEAM_A, 0.9), { legs: 0x9aa8b8, rifle: true }); robot(f, -0.2, 0.3, -0.6);
  mast(f, kit, -0.82, 0.78, 0.74, 0.22, 0.12, FWALL, NEON);
  lamp(f, -0.15, -0.2, 5, 0.36); lamp(f, 0.82, -0.2, 5, 0.36);
  for (const [u, v] of [[0.1, 0.6], [-0.78, 0.0]]) { f.box(0.14, 0.04, 0.1, u, 0, v, FDARK); f.box(0.142, 0.005, 0.102, u, 0.04, v, NEON, 'neon'); for (const k of [-0.035, 0.035]) f.sphere(0.03, u + k, 0.07, v, 0x5ac88a, 0, 0.9); }
  // seconde passe : l'antenne de liaison vers les satellites, le drone de garde, un banc, deux arbres
  const sd = f.sub(0.02, 0.58); sd.cyl(0.04, 0.05, 0.04, 8, 0, 0, 0, FDARK); sd.cyl(0.012, 0.016, 0.08, 6, 0, 0.04, 0, FWALL);
  sd.add(new THREE.SphereGeometry(0.11, 10, 3, 0, PI * 2, 0, PI / 2.6).rotateX(PI - 0.5), 0, 0.17, -0.02, FWALL); sd.add(new THREE.TorusGeometry(0.075, 0.004, 3, 12).rotateX(PI / 2 - 0.5), 0, 0.17, -0.02, NEON, 'neon');
  const gd = new Fr(kit.turn(f.w(0, 0.5, 0), [0, 1, 0], 0.12), 0, 0, 0, 0); gd.cyl(0.03, 0.024, 0.016, 8, 0.7, 0, 0, FWALL); gd.add(new THREE.TorusGeometry(0.034, 0.003, 3, 8).rotateX(PI / 2), 0.7, 0.008, 0, 0xff4a4a, 'neon');
  f.box(0.16, 0.012, 0.05, 0.5, 0.04, 0.82, FWALL); f.box(0.12, 0.04, 0.04, 0.5, 0, 0.82, FDARK);
  tree(f, 0.8, 0.78, 0.75, 0x5ab87a); tree(f, -0.8, -0.82, 0.7, 0x5ab87a);
  tufts(f, 12, 541, 0.88, [[-0.72, -0.66, -0.24, -0.18], [-0.12, -0.8, 0.78, -0.36], [-0.68, 0.28, -0.3, 0.56], [0.36, 0.14, 0.64, 0.46], [-0.2, -0.06, 0.0, 0.08]], false);
}

/** La station radar de la garnison (2 × 2), moderne (4) ou futuriste (5) ; l'antenne tourne */
export function radarStation(p: Parts, age: number, kit: FrontKit) {
  const f = new Fr(p, 0, 0);
  if (age <= 4) radarModern(f, kit);
  else radarFuture(f, kit);
}
