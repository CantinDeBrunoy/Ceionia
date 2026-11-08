import * as THREE from 'three';
import { Parts } from './parts';
import { hash2 } from '../core/rng';

/**
 * Les défenses de l'île du portail à chaque âge : la tour de garde (1 × 1) et la caserne (2 × 2). Même faction à tous les âges
 * (oriflamme rouge à liseré d'or, boule dorée au faîte) et même plan (porte face à +z, entrée de la cour devant), mais le style
 * change : pierre claire et bois (Antiquité), donjon à hourds (Moyen Âge), brique et tôle (industriel), béton et radar
 * (moderne), composite et anneaux lumineux (futuriste). Les aides du moteur de modèles (cheminées, pièces qui se balancent)
 * arrivent par `DefKit` pour ne pas importer models.ts
 */
type V3 = [number, number, number];
export interface DefKit {
  sway: (pivot: V3, axis: V3, amp: number, freq: number) => Parts;
  smoke: (x: number, y: number, z: number, kind: number) => void;
  turn: (pivot: V3, axis: V3, speed: number) => Parts;
  pipe: (p: Parts, a: V3, b: V3, r: number, color: number) => void;
  roof: (p: Parts, x: number, y: number, z: number, o: { w: number; d: number; h: number; color: number; wall: number; ry?: number; len?: number; dx?: number; ov?: number; tiles?: boolean; courses?: boolean; rows?: boolean }) => void;
}

const RED = 0xc8402e, GOLD = 0xe8c66a, FLAME = 0xffb15c, WARM = 0xffd890, IRON = 0x4a4f56;
const H = (i: number, k: number) => hash2(i, k, 77);
const dk = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const lt = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
const PI = Math.PI;

/** Point à `r` du centre dans la direction de la face `a` (0 = +z, la porte), décalé de `u` le long de la face */
const fx = (a: number, r: number, u = 0) => Math.sin(a) * r + Math.cos(a) * u;
const fz = (a: number, r: number, u = 0) => Math.cos(a) * r - Math.sin(a) * u;
/** Boîte posée contre la face `a` (w le long de la face, d en profondeur) */
function onFace(p: Parts, a: number, r: number, u: number, y: number, w: number, h: number, d: number, color: number, glow = false) {
  p.box(w, h, d, fx(a, r, u), y, fz(a, r, u), color, a, glow);
}
const FACES = [0, PI / 2, PI, -PI / 2];

/** Drapeau de la faction : mât, boule dorée, oriflamme rouge à liseré d'or et losange qui flotte au vent */
function flag(p: Parts, kit: DefKit, x: number, y: number, z: number, h: number, w = 0.16, ht = 0.09, pole = 0x7a6355) {
  p.cyl(0.008, 0.011, h, 5, x, y, z, pole);
  p.sphere(0.017, x, y + h + 0.008, z, GOLD);
  const f = kit.sway([x, 0, z], [0, 1, 0], 0.35, 0.9), top = y + h - 0.015;
  f.box(w, ht, 0.006, w / 2 + 0.01, top - ht, 0, RED);
  f.box(w, 0.013, 0.008, w / 2 + 0.01, top - 0.013, 0, GOLD);
  f.box(w, 0.013, 0.008, w / 2 + 0.01, top - ht, 0, GOLD);
  f.box(0.034, 0.034, 0.009, w * 0.55, top - ht * 0.62, 0, GOLD, 0, false, PI / 4);
  f.box(0.04, ht * 0.9, 0.006, w + 0.03, top - ht * 0.95, 0, RED, 0, false, 0);
}

/** Pan de maçonnerie en assises : le volume, un bandeau fin à chaque assise (teinte qui varie) et le chaînage d'angle en blocs alternés */
function shaft(p: Parts, hw: number, y0: number, y1: number, wall: number, edge: number, step: number, seed: number, hd = hw) {
  p.box(hw * 2, y1 - y0, hd * 2, 0, y0, 0, wall);
  const n = Math.max(1, Math.round((y1 - y0) / step)), s = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const y = y0 + i * s;
    if (i > 0) p.box(hw * 2 + 0.012, 0.008, hd * 2 + 0.012, 0, y - 0.004, 0, dk(wall, 0.84 + 0.14 * H(i, seed)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const long = (i + (sx > 0 ? 1 : 0) + (sz > 0 ? 1 : 0)) % 2, a = long ? 0.11 : 0.065, b = long ? 0.065 : 0.11;
      p.box(a, s - 0.012, b, sx * (hw - a / 2 + 0.006), y + 0.003, sz * (hd - b / 2 + 0.006), dk(edge, 0.9 + 0.2 * H(i * 4 + sx + 2 * sz + 5, seed)));
    }
  }
}

/** Fente de tir avec linteau et appui ; `lit` : une lueur chaude derrière */
function slit(p: Parts, a: number, r: number, u: number, y: number, frame: number, lit = false, w = 0.028, h = 0.1) {
  onFace(p, a, r + 0.002, u, y, w, h, 0.03, lit ? WARM : 0x24201c, lit);
  onFace(p, a, r + 0.008, u, y + h, w + 0.034, 0.022, 0.05, frame);
  onFace(p, a, r + 0.012, u, y - 0.014, w + 0.034, 0.016, 0.055, frame);
}

/** Torche murale : support, coupelle, flamme qui luit la nuit */
function torch(p: Parts, x: number, y: number, z: number, wood = 0x6e523c) {
  p.cyl(0.009, 0.012, 0.13, 5, x, y, z, wood);
  p.cyl(0.024, 0.012, 0.03, 6, x, y + 0.12, z, 0x4a4f56);
  p.box(0.038, 0.055, 0.038, x, y + 0.15, z, FLAME, 0, true);
}

/** Tonneau cerclé de fer */
function barrel(p: Parts, x: number, z: number, s = 1, c = 0x9a7550) {
  p.cyl(0.05 * s, 0.045 * s, 0.11 * s, 8, x, 0, z, c);
  p.cyl(0.054 * s, 0.054 * s, 0.012 * s, 8, x, 0.02 * s, z, IRON);
  p.cyl(0.054 * s, 0.054 * s, 0.012 * s, 8, x, 0.08 * s, z, IRON);
}
function crate(p: Parts, x: number, y: number, z: number, s: number, ry = 0, c = 0xa8805a) {
  p.box(s, s, s, x, y, z, c, ry);
  p.box(s + 0.008, 0.012, s + 0.008, x, y + s * 0.45, z, dk(c, 0.78), ry);
  p.box(s + 0.008, 0.012, s + 0.008, x, y + s * 0.05, z, dk(c, 0.78), ry);
}
/** Bouclier rond à bordure d'or et à ombilic, posé de face contre le mur `a` */
function shield(p: Parts, a: number, r: number, u: number, y: number, rad: number, color = RED) {
  const x = fx(a, r, u), z = fz(a, r, u);
  p.add(new THREE.CylinderGeometry(rad, rad, 0.016, 10).rotateX(PI / 2), x, y, z, color, a);
  p.add(new THREE.TorusGeometry(rad, 0.007, 4, 12), x + Math.sin(a) * 0.009, y, z + Math.cos(a) * 0.009, GOLD, a);
  p.sphere(rad * 0.3, x + Math.sin(a) * 0.012, y, z + Math.cos(a) * 0.012, GOLD);
}

/** Créneaux en couronne : `n` merlons de largeur `w` sur le cercle de rayon `r` (une face sur deux), assise `y` */
function merlons(p: Parts, r: number, y: number, n: number, w: number, h: number, d: number, color: number, skipFront = false) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    if (skipFront && Math.abs(Math.sin(a / 2)) < 0.001) continue;
    p.box(w, h, d, Math.sin(a) * r, y, Math.cos(a) * r, dk(color, 0.94 + 0.12 * H(i, 9)), a);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* ANTIQUITÉ : tour carrée de pierre claire à chaînages, poutres, galerie de bois sous un toit de chaume                */
/* ------------------------------------------------------------------------------------------------------------------ */
function towerAntique(p: Parts, kit: DefKit) {
  const wall = 0xd9cfb6, edge = 0xc9bd9c, base = 0xa89c82, wd = 0x9a7550, wdd = 0x6e523c, thatch = 0xd8bc74;
  // fondations : dalle et gros blocs irréguliers jetés autour du pied
  p.box(0.7, 0.04, 0.7, 0, 0, 0, dk(base, 0.9));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2 + H(i, 1) * 0.2, r = 0.34 + 0.03 * H(i, 2), s = 0.04 + 0.03 * H(i, 3);
    p.sphere(s, Math.sin(a) * r, 0.01, Math.cos(a) * r, dk(base, 0.8 + 0.35 * H(i, 4)), 0, 0.62);
  }
  p.box(0.58, 0.035, 0.58, 0, 0.04, 0, base);
  shaft(p, 0.25, 0.075, 0.5, wall, edge, 0.1, 1);
  p.box(0.54, 0.03, 0.54, 0, 0.5, 0, base);
  shaft(p, 0.23, 0.53, 0.86, wall, edge, 0.1, 2);
  p.box(0.5, 0.03, 0.5, 0, 0.86, 0, base);
  shaft(p, 0.21, 0.89, 1.06, wall, edge, 0.085, 3);
  // poutres des planchers qui affleurent
  for (const [y, hw] of [[0.52, 0.25], [0.88, 0.23]]) for (const a of FACES) for (const u of [-0.12, 0, 0.12]) onFace(p, a, hw + 0.03, u, y - 0.02, 0.032, 0.032, 0.1, wd);
  // la porte surélevée : jambages, linteau de pierre, vantail à ferrures, marches de bois
  p.box(0.04, 0.3, 0.05, -0.1, 0.1, 0.255, base); p.box(0.04, 0.3, 0.05, 0.1, 0.1, 0.255, base);
  p.box(0.27, 0.05, 0.06, 0, 0.4, 0.258, dk(base, 1.05));
  p.box(0.16, 0.28, 0.024, 0, 0.1, 0.25, wd);
  for (const x of [-0.045, 0.045]) p.box(0.004, 0.28, 0.027, x, 0.1, 0.25, dk(wd, 0.8));
  for (const y of [0.16, 0.3]) p.box(0.17, 0.014, 0.03, 0, y, 0.25, IRON);
  p.sphere(0.012, 0.055, 0.25, 0.268, GOLD);
  for (let k = 0; k < 3; k++) p.box(0.3 - k * 0.03, 0.1 - k * 0.034, 0.06, 0, 0.0, 0.3 + k * 0.058, dk(wd, 0.9 + 0.1 * k));
  for (const s of [-1, 1]) torch(p, s * 0.2, 0.3, 0.262);
  // fenêtre à volets au premier étage, fentes de tir sur les autres faces
  p.box(0.075, 0.11, 0.02, 0, 0.6, 0.23, WARM, 0, true);
  p.box(0.12, 0.022, 0.05, 0, 0.71, 0.24, base); p.box(0.12, 0.016, 0.055, 0, 0.58, 0.24, base);
  for (const s of [-1, 1]) p.box(0.04, 0.11, 0.012, s * 0.064, 0.6, 0.246, wd, s * 0.5);
  for (const a of [PI / 2, PI, -PI / 2]) { slit(p, a, 0.25, 0, 0.25, base); slit(p, a, 0.23, 0, 0.62, base, a === PI); }
  for (const a of [PI / 2, PI, -PI / 2]) slit(p, a, 0.21, 0, 0.94, base, true, 0.03, 0.08);
  slit(p, 0, 0.25, 0.14, 0.22, base);
  // bouclier et lances croisées sur le haut du fût, râtelier à droite de la porte
  shield(p, 0, 0.21, 0, 0.98, 0.05);
  kit.pipe(p, [-0.1, 0.9, 0.222], [0.1, 1.04, 0.222], 0.006, wd); kit.pipe(p, [0.1, 0.9, 0.222], [-0.1, 1.04, 0.222], 0.006, wd);
  p.box(0.012, 0.12, 0.014, 0.3, 0.2, 0.36, wdd); p.box(0.012, 0.12, 0.014, 0.4, 0.2, 0.36, wdd);
  p.box(0.12, 0.014, 0.02, 0.35, 0.17, 0.36, wd); p.box(0.12, 0.014, 0.02, 0.35, 0.27, 0.36, wd);
  for (let i = 0; i < 4; i++) { const x = 0.31 + i * 0.03; p.cyl(0.004, 0.004, 0.34, 3, x, 0.02, 0.365, wd); p.cone(0.01, 0.035, 4, x, 0.36, 0.365, 0xb8bec6); }
  // échelle de bois jusqu'à la galerie, sur le flanc droit
  for (const z of [-0.045, 0.045]) p.box(0.014, 1.12, 0.014, 0.275, 0.04, z, wd);
  for (let i = 0; i < 9; i++) p.box(0.016, 0.01, 0.09, 0.275, 0.1 + i * 0.115, 0, dk(wd, 0.85));
  // galerie : corbeaux, plancher, garde-corps, poteaux
  for (const a of FACES) for (const u of [-0.12, 0, 0.12]) onFace(p, a, 0.25, u, 1.03, 0.036, 0.04, 0.17, wd);
  for (let i = 0; i < 6; i++) p.box(0.68, 0.022, 0.108, 0, 1.075, -0.27 + i * 0.108, dk(wd, 0.85 + 0.2 * H(i, 7)));
  for (const a of FACES) {
    onFace(p, a, 0.325, 0, 1.1, 0.66, 0.09, 0.02, dk(wd, 0.9));
    onFace(p, a, 0.325, 0, 1.22, 0.66, 0.018, 0.026, wd);
    for (const u of [-0.16, 0.16]) { onFace(p, a, 0.325, u, 1.1, 0.026, 0.14, 0.026, wdd); p.cone(0.02, 0.03, 4, fx(a, 0.325, u), 1.24, fz(a, 0.325, u), wdd); }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.034, 0.4, 0.034, sx * 0.32, 1.1, sz * 0.32, wdd);
  // toit de chaume : jupe, pan principal, solives apparentes, faîtage
  for (const s of [-1, 1]) { p.box(0.7, 0.026, 0.026, 0, 1.48, s * 0.32, wd); p.box(0.026, 0.026, 0.7, s * 0.32, 1.48, 0, wd); }
  p.pyramid(0.96, 0.12, 0.96, 0, 1.46, 0, dk(thatch, 0.82));
  p.pyramid(0.88, 0.44, 0.88, 0, 1.51, 0, thatch);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.pipe(p, [sx * 0.41, 1.53, sz * 0.41], [0, 1.94, 0], 0.011, dk(thatch, 0.62));
  for (let k = 1; k <= 2; k++) { const t = k * 0.28; p.pyramid(0.88 * (1 - t) + 0.03, 0.03, 0.88 * (1 - t) + 0.03, 0, 1.51 + 0.44 * t, 0, dk(thatch, 0.72)); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2 + PI / 8; p.box(0.012, 0.012, 0.3, Math.sin(a) * 0.23, 1.55, Math.cos(a) * 0.23, dk(thatch, 0.7), a, false, 0.0); }
  // le feu de veille, une lanterne, la cloche d'alerte
  p.cyl(0.055, 0.03, 0.05, 8, -0.1, 1.09, 0.08, IRON); p.box(0.075, 0.075, 0.075, -0.1, 1.14, 0.08, FLAME, 0, true);
  p.box(0.02, 0.2, 0.02, 0.22, 1.2, 0.1, wd); kit.pipe(p, [0.22, 1.43, 0.1], [0.22, 1.37, 0.1], 0.004, IRON); p.box(0.034, 0.05, 0.034, 0.22, 1.32, 0.1, WARM, 0, true);
  p.cone(0.034, 0.05, 8, -0.22, 1.3, 0.22, 0xc8913c); kit.pipe(p, [-0.22, 1.35, 0.22], [-0.22, 1.47, 0.22], 0.004, wdd);
  // oriflamme au faîte, bannière sur le garde-corps, tonneaux et caisses au pied
  flag(p, kit, 0, 1.92, 0, 0.34, 0.2, 0.11);
  p.box(0.11, 0.22, 0.01, -0.22, 0.9, 0.345, RED); p.box(0.11, 0.016, 0.014, -0.22, 1.1, 0.347, GOLD); p.box(0.11, 0.016, 0.014, -0.22, 0.9, 0.347, GOLD);
  p.box(0.032, 0.032, 0.012, -0.22, 0.99, 0.35, GOLD, 0, false, PI / 4);
  barrel(p, -0.32, 0.33, 1.1); barrel(p, -0.4, 0.26, 0.9);
  crate(p, -0.24, 0, 0.41, 0.09, 0.3); crate(p, -0.24, 0.09, 0.41, 0.07, -0.2);
}

/** Anneau sans couvercles (cylindre ouvert) : assise, ceinture, bague */
function band(p: Parts, rt: number, rb: number, h: number, seg: number, y: number, color: number, ry = 0, x = 0, z = 0, glow = false) {
  p.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, true).translate(0, h / 2, 0), x, y, z, color, ry, glow);
}

/** Fût octogonal en assises : bandeaux fins tous les `step`, blocs de chaînage aux huit angles une assise sur deux */
function octShaft(p: Parts, r0: number, r1: number, y0: number, y1: number, wall: number, edge: number, step: number, seed: number) {
  const h = y1 - y0, n = Math.max(1, Math.round(h / step)), s = h / n, ry = PI / 8;
  p.cyl(r1, r0, h, 8, 0, y0, 0, wall, false, ry);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, r = r0 + (r1 - r0) * (1 - t) * 0 + (r1 - r0) * t, y = y0 + i * s;
    if (i > 0) band(p, r, r, 0.008, 8, y - 0.004, dk(wall, 0.84 + 0.14 * H(i, seed)), ry);
    if (i % 2 === 0) for (let v = 0; v < 8; v++) {
      const a = ry + (v * PI) / 4, wide = (i / 2 + v) % 2 ? 0.1 : 0.062;
      p.box(wide, s * 0.94, 0.07, Math.sin(a) * (r * 1.0 - 0.012), y + 0.002, Math.cos(a) * (r * 1.0 - 0.012), dk(edge, 0.9 + 0.2 * H(i * 8 + v, seed)), a);
    }
  }
}

/** Arc de porte : deux jambages, voussoirs en plein cintre autour d'un vantail de chêne cloué */
function archDoor(p: Parts, a: number, r: number, y: number, w: number, h: number, stone: number, wood: number) {
  const x = fx(a, r), z = fz(a, r);
  onFace(p, a, r + 0.004, 0, y, w, h - w / 2, 0.026, wood);
  p.add(new THREE.CylinderGeometry(w / 2, w / 2, 0.026, 8, 1, false, 0, PI).rotateX(PI / 2).rotateZ(PI / 2).translate(0, 0, 0), x + Math.sin(a) * 0.004, y + h - w / 2, z + Math.cos(a) * 0.004, wood, a);
  for (const s of [-1, 1]) onFace(p, a, r + 0.012, s * (w / 2 + 0.02), y - 0.005, 0.04, h - w / 2 + 0.03, 0.05, stone);
  p.add(new THREE.TorusGeometry(w / 2 + 0.02, 0.022, 4, 8, PI), x + Math.sin(a) * 0.012, y + h - w / 2, z + Math.cos(a) * 0.012, stone, a);
  onFace(p, a, r + 0.014, 0, y + h + 0.02, 0.04, 0.04, 0.05, dk(stone, 0.9));
  for (const yy of [y + 0.07, y + 0.16]) onFace(p, a, r + 0.02, 0, yy, w, 0.014, 0.026, IRON);
  onFace(p, a, r + 0.03, w * 0.28, y + h * 0.4, 0.02, 0.02, 0.014, GOLD);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* MOYEN ÂGE : donjon octogonal à contreforts, hourds de bois sous un toit d'ardoise, bannières et écus                  */
/* ------------------------------------------------------------------------------------------------------------------ */
function towerMedieval(p: Parts, kit: DefKit) {
  const wall = 0xbdb5a7, edge = 0xa29a8c, base = 0x8d867b, wd = 0x8a6540, wdd = 0x5e4630, roofC = 0x6f6a8a;
  // socle octogonal, talus et ceintures
  p.cyl(0.4, 0.43, 0.06, 8, 0, 0, 0, dk(base, 0.9), false, PI / 8);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * PI * 2 + H(i, 1) * 0.2; p.sphere(0.035 + 0.02 * H(i, 3), Math.sin(a) * 0.41, 0.012, Math.cos(a) * 0.41, dk(base, 0.8 + 0.3 * H(i, 4)), 0, 0.6); }
  p.cyl(0.285, 0.36, 0.16, 8, 0, 0.06, 0, edge, false, PI / 8);
  band(p, 0.288, 0.292, 0.02, 8, 0.22, base, PI / 8);
  octShaft(p, 0.285, 0.278, 0.24, 0.6, wall, edge, 0.085, 11);
  band(p, 0.3, 0.3, 0.024, 8, 0.6, base, PI / 8);
  octShaft(p, 0.27, 0.262, 0.624, 0.98, wall, edge, 0.085, 12);
  // contreforts en retraits sur les faces obliques
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + (k * PI) / 2;
    onFace(p, a, 0.3, 0, 0.06, 0.12, 0.2, 0.11, edge); onFace(p, a, 0.285, 0, 0.26, 0.1, 0.22, 0.085, dk(edge, 1.05)); onFace(p, a, 0.27, 0, 0.48, 0.085, 0.1, 0.06, edge);
  }
  // porte en plein cintre, perron de pierre, lanternes
  archDoor(p, 0, 0.266, 0.24, 0.17, 0.3, base, 0x6e4a32);
  for (let k = 0; k < 4; k++) p.box(0.3 + k * 0.01, 0.24 - k * 0.06, 0.056, 0, 0, 0.3 + k * 0.054, dk(base, 1.0 + k * 0.05));
  p.box(0.06, 0.26, 0.05, -0.19, 0, 0.33, dk(base, 0.95)); p.box(0.06, 0.26, 0.05, 0.19, 0, 0.33, dk(base, 0.95));
  for (const s of [-1, 1]) { p.box(0.02, 0.02, 0.03, s * 0.17, 0.5, 0.275, IRON); p.box(0.03, 0.045, 0.03, s * 0.17, 0.52, 0.285, WARM, 0, true); }
  // fenêtre en arc au premier étage, meurtrières en croix, fentes
  const win = (a: number, y: number, lit: boolean) => {
    onFace(p, a, 0.25, 0, y, 0.07, 0.11, 0.03, lit ? WARM : 0x24201c, lit);
    onFace(p, a, 0.254, 0, y + 0.11, 0.1, 0.03, 0.05, base); onFace(p, a, 0.256, 0, y - 0.016, 0.1, 0.018, 0.055, base);
    for (const s of [-1, 1]) onFace(p, a, 0.254, s * 0.04, y, 0.016, 0.12, 0.04, base);
    onFace(p, a, 0.258, 0, y + 0.05, 0.07, 0.01, 0.02, IRON);
  };
  win(0, 0.62, true); win(PI, 0.66, false);
  for (const a of [PI / 2, -PI / 2, PI]) { slit(p, a, 0.262, 0, 0.34, base); onFace(p, a, 0.277, 0, 0.375, 0.075, 0.016, 0.02, base); }
  for (const a of [PI / 2, -PI / 2, PI / 4, -PI / 4, PI]) slit(p, a, 0.25, 0, 0.78, base, a === PI / 2);
  // l'encorbellement : corbeaux de pierre, couronne de mâchicoulis
  band(p, 0.3, 0.27, 0.05, 8, 0.93, base, PI / 8);
  for (let v = 0; v < 16; v++) { const a = (v * PI) / 8; p.box(0.04, 0.07, 0.07, Math.sin(a) * 0.29, 0.92, Math.cos(a) * 0.29, dk(edge, 0.9 + 0.2 * H(v, 5)), a); }
  p.cyl(0.4, 0.34, 0.06, 8, 0, 0.98, 0, base, false, PI / 8);
  // les hourds : étage de bois en saillie, poteaux, planches, meurtrières et mâchicoulis ouverts
  const hr = 0.43;
  for (let k = 0; k < 8; k++) {
    const a = (k * PI) / 4;
    onFace(p, a, hr, 0, 1.04, 0.3, 0.2, 0.026, dk(wd, 0.92 + 0.12 * H(k, 6)));
    for (let j = 0; j < 4; j++) onFace(p, a, hr + 0.014, -0.11 + j * 0.073, 1.04, 0.004, 0.2, 0.012, dk(wd, 0.7));
    onFace(p, a, hr + 0.006, 0, 1.15, 0.27, 0.016, 0.034, wdd);
    onFace(p, a, hr - 0.012, 0, 1.1, 0.026, 0.07, 0.03, k === 0 || k === 2 || k === 6 ? WARM : 0x24201c, k === 0 || k === 2 || k === 6);
    onFace(p, a, hr - 0.01, 0.1, 1.11, 0.022, 0.05, 0.03, 0x24201c); onFace(p, a, hr - 0.01, -0.1, 1.11, 0.022, 0.05, 0.03, 0x24201c);
    p.box(0.04, 0.2, 0.04, Math.sin(a + PI / 8) * hr * 1.04, 1.04, Math.cos(a + PI / 8) * hr * 1.04, wdd, a + PI / 8);
    for (const u of [-0.1, 0.1]) onFace(p, a, 0.345, u, 0.96, 0.04, 0.045, 0.2, wdd);
  }
  p.cyl(0.5, 0.46, 0.035, 8, 0, 1.03, 0, wdd, false, PI / 8);
  // toit d'ardoise en cône à rangs, lucarnes, plomb au faîte
  p.cone(0.54, 0.46, 8, 0, 1.235, 0, roofC, false, PI / 8);
  for (let i = 1; i < 6; i++) { const t = i / 6.2; band(p, 0.54 * (1 - t) + 0.006, 0.54 * (1 - t) + 0.012, 0.018, 8, 1.235 + 0.46 * t - 0.01, dk(roofC, 0.78 + 0.1 * (i % 2)), PI / 8); }
  for (let k = 0; k < 8; k++) { const a = (k * PI) / 4 + PI / 8, r = 0.52; kit.pipe(p, [Math.sin(a) * r, 1.24, Math.cos(a) * r], [0, 1.69, 0], 0.008, dk(roofC, 0.6)); }
  p.box(0.12, 0.1, 0.12, 0, 1.31, 0.3, wd, 0); p.pyramid(0.17, 0.09, 0.17, 0, 1.4, 0.3, roofC); p.box(0.05, 0.05, 0.015, 0, 1.34, 0.364, 0x24201c);
  p.cyl(0.02, 0.026, 0.05, 6, 0, 1.69, 0, GOLD);
  flag(p, kit, 0, 1.73, 0, 0.3, 0.22, 0.12);
  // écus accrochés aux hourds, bannières pendues aux angles, brasero de la porte
  for (const [u, c] of [[-0.1, RED], [0.0, 0xe8dcc0], [0.1, RED]] as [number, number][]) shield(p, 0, hr + 0.018, u, 1.14, 0.04, c);
  for (const a of [PI / 4, -PI / 4]) { onFace(p, a, hr + 0.026, 0, 0.8, 0.1, 0.24, 0.01, RED); onFace(p, a, hr + 0.03, 0, 0.8, 0.1, 0.016, 0.012, GOLD); onFace(p, a, hr + 0.03, 0, 1.024, 0.1, 0.016, 0.012, GOLD); onFace(p, a, hr + 0.034, 0, 0.9, 0.03, 0.03, 0.012, GOLD); }
  p.cyl(0.05, 0.03, 0.18, 6, -0.31, 0, 0.36, IRON); p.cyl(0.062, 0.05, 0.03, 8, -0.31, 0.17, 0.36, IRON); p.box(0.07, 0.07, 0.07, -0.31, 0.2, 0.36, FLAME, 0, true);
  barrel(p, 0.34, 0.34, 1.0); crate(p, 0.4, 0, 0.26, 0.09, 0.2); p.sphere(0.04, 0.3, 0.03, 0.42, 0xb89a5a, 0, 0.8); p.sphere(0.034, 0.37, 0.025, 0.44, 0xa88a4a, 0, 0.8);
  // un treuil à poulie sous les hourds : potence, corde, seau
  kit.pipe(p, [0.1, 0.99, 0.4], [0.1, 0.99, 0.52], 0.012, wdd); kit.pipe(p, [0.1, 0.99, 0.52], [0.1, 0.86, 0.52], 0.004, 0xb8a98a); p.cyl(0.026, 0.02, 0.04, 6, 0.1, 0.82, 0.52, wd);
}


/** Plaque inclinée autour de x (rx) : auvents de tôle, pans de verre, rampes */
function tilt(p: Parts, w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx: number, ry = 0, glow = false) {
  p.add(new THREE.BoxGeometry(w, h, d), x, y, z, color, ry, glow, 0, rx);
}
/** Cylindre couché le long de x (chaudière) ou de z */
function lying(p: Parts, r: number, len: number, seg: number, x: number, y: number, z: number, color: number, alongZ = false, glow = false) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  p.add(alongZ ? g.rotateX(PI / 2) : g.rotateZ(PI / 2), x, y, z, color, 0, glow);
}
/** Fenêtre à encadrement, appui, linteau et croisillon, contre la face `a` ; `lit` : vitres qui luisent la nuit */
function win(p: Parts, a: number, r: number, u: number, y: number, w: number, h: number, frame: number, lit: boolean, glass = 0xffd890, cross = true) {
  onFace(p, a, r, u, y, w, h, 0.03, lit ? glass : dk(glass, 0.3), lit);
  onFace(p, a, r + 0.004, u, y + h, w + 0.04, 0.02, 0.05, frame); onFace(p, a, r + 0.008, u, y - 0.016, w + 0.04, 0.016, 0.06, frame);
  for (const s of [-1, 1]) onFace(p, a, r + 0.002, u + s * (w / 2 + 0.008), y, 0.016, h, 0.045, frame);
  if (cross) { onFace(p, a, r + 0.012, u, y, 0.008, h, 0.01, frame); onFace(p, a, r + 0.012, u, y + h * 0.5, w, 0.008, 0.01, frame); }
}
/** Garde-corps carré de montants et lisses autour d'une plate-forme de demi-côté `hw` */
function rails(p: Parts, hw: number, y: number, h: number, n: number, color: number, thick = 0.012, skipFront = false) {
  for (const a of FACES) {
    if (skipFront && a === 0) continue;
    for (let i = 0; i <= n; i++) onFace(p, a, hw, -hw + (2 * hw * i) / n, y, thick, h, thick, color);
    onFace(p, a, hw, 0, y + h - 0.01, hw * 2, 0.012, 0.014, color); onFace(p, a, hw, 0, y + h * 0.5, hw * 2, 0.008, 0.01, color);
  }
}
/** Assises de brique : volume, bandeaux de couleur variable, pilastres d'angle */
function brickShaft(p: Parts, hw: number, y0: number, y1: number, brick: number, pier: number, step: number, seed: number) {
  p.box(hw * 2, y1 - y0, hw * 2, 0, y0, 0, brick);
  const n = Math.round((y1 - y0) / step), s = (y1 - y0) / n;
  for (let i = 1; i < n; i++) p.box(hw * 2 + 0.008, 0.01, hw * 2 + 0.008, 0, y0 + i * s - 0.005, 0, dk(brick, 0.82 + 0.3 * H(i, seed)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.05, y1 - y0, 0.05, sx * (hw - 0.02), y0, sz * (hw - 0.02), pier);
  for (const a of FACES) onFace(p, a, hw + 0.004, 0, y0, 0.04, y1 - y0, 0.014, pier);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* INDUSTRIEL : tour de brique à pilastres, guérite de tôle vitrée, projecteur, cheminée-vigie, chaudière et télégraphe  */
/* ------------------------------------------------------------------------------------------------------------------ */
function towerIndustrial(p: Parts, kit: DefKit) {
  const brick = 0xa8502e, pier = 0x8a3e24, brickD = 0x5e2c1a, stone = 0x9a9ca0, iron = 0x3c4046, tin = 0x98a1a8, copper = 0xb4713c;
  // soubassement de pierre de taille
  p.box(0.72, 0.045, 0.72, 0, 0, 0, dk(stone, 0.82));
  p.box(0.58, 0.14, 0.58, 0, 0.045, 0, stone);
  for (let i = 0; i < 3; i++) p.box(0.59, 0.008, 0.59, 0, 0.09 + i * 0.04, 0, dk(stone, 0.8 + 0.12 * H(i, 2)));
  p.box(0.6, 0.026, 0.6, 0, 0.185, 0, dk(stone, 1.05));
  // premier fût et second fût, corniches de brique sombre
  brickShaft(p, 0.25, 0.21, 0.62, brick, pier, 0.055, 21);
  p.box(0.56, 0.03, 0.56, 0, 0.62, 0, brickD); p.box(0.54, 0.014, 0.54, 0, 0.65, 0, dk(brickD, 1.2));
  brickShaft(p, 0.23, 0.664, 1.1, brick, pier, 0.055, 22);
  p.box(0.54, 0.035, 0.54, 0, 1.1, 0, brickD); p.box(0.58, 0.02, 0.58, 0, 1.135, 0, dk(brickD, 0.85));
  for (const a of FACES) for (let i = 0; i < 6; i++) onFace(p, a, 0.285, -0.2 + i * 0.08, 1.09, 0.035, 0.03, 0.06, dk(brickD, 0.9));
  // fenêtres à croisillons de fonte et encadrements de pierre, porte ferrée sous son auvent de tôle
  for (const s of [-1, 1]) win(p, 0, 0.254, s * 0.135, 0.3, 0.07, 0.17, stone, s > 0, 0xffe6a0);
  for (const a of [PI / 2, PI, -PI / 2]) {
    win(p, a, 0.254, 0, 0.32, 0.07, 0.17, stone, a === PI, 0xffe6a0);
    win(p, a, 0.234, -0.09, 0.78, 0.06, 0.15, stone, a === PI / 2, 0xffe6a0); win(p, a, 0.234, 0.09, 0.78, 0.06, 0.15, stone, a !== -PI / 2, 0xffe6a0);
  }
  win(p, 0, 0.234, -0.09, 0.8, 0.06, 0.15, stone, true, 0xffe6a0); win(p, 0, 0.234, 0.09, 0.8, 0.06, 0.15, stone, true, 0xffe6a0);
  p.box(0.15, 0.25, 0.026, 0, 0.19, 0.255, iron); for (const x of [-0.035, 0.035]) p.box(0.004, 0.25, 0.03, x, 0.19, 0.255, 0x2a2e33);
  for (const y of [0.25, 0.34]) p.box(0.15, 0.01, 0.03, 0, y, 0.256, 0x6a6f76);
  p.box(0.2, 0.04, 0.05, 0, 0.45, 0.268, stone); p.box(0.044, 0.25, 0.05, -0.1, 0.19, 0.262, stone); p.box(0.044, 0.25, 0.05, 0.1, 0.19, 0.262, stone);
  tilt(p, 0.34, 0.016, 0.2, 0, 0.5, 0.35, tin, -0.25);
  for (const s of [-1, 1]) { p.box(0.014, 0.3, 0.014, s * 0.15, 0.185, 0.43, iron); kit.pipe(p, [s * 0.15, 0.42, 0.43], [s * 0.15, 0.52, 0.27], 0.006, iron); }
  for (let k = 0; k < 6; k++) tilt(p, 0.008, 0.01, 0.2, -0.14 + k * 0.056, 0.508, 0.35, 0x6f777e, -0.25);
  for (let k = 0; k < 3; k++) p.box(0.3 + k * 0.03, 0.06 - k * 0.018, 0.06, 0, 0, 0.3 + k * 0.05, dk(stone, 0.95 + k * 0.04));
  p.box(0.03, 0.045, 0.03, -0.17, 0.3, 0.27, WARM, 0, true); p.box(0.03, 0.045, 0.03, 0.17, 0.3, 0.27, WARM, 0, true);
  // la chaudière à vapeur au pied du flanc droit : corps cerclé, dôme, soupape, tuyauterie montant à la guérite
  lying(p, 0.085, 0.26, 10, 0.37, 0.115, -0.04, copper);
  for (const x of [0.28, 0.37, 0.46]) p.add(new THREE.TorusGeometry(0.087, 0.008, 4, 10).rotateY(PI / 2), x, 0.115, -0.04, iron);
  p.sphere(0.07, 0.5, 0.115, -0.04, copper, 1, 1); p.cyl(0.03, 0.04, 0.06, 8, 0.36, 0.19, -0.04, copper); p.cyl(0.008, 0.008, 0.07, 5, 0.36, 0.25, -0.04, iron);
  p.box(0.3, 0.03, 0.14, 0.37, 0.0, -0.04, dk(stone, 0.8)); p.box(0.05, 0.03, 0.05, 0.32, 0.2, 0.0, FLAME, 0, true);
  p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10).rotateZ(PI / 2), 0.46, 0.2, -0.04, 0xf2efe6);
  const pr: V3[] = [[0.31, 0.19, -0.04], [0.31, 0.3, -0.04], [0.31, 1.0, -0.04], [0.27, 1.12, -0.04], [0.22, 1.17, 0.0]];
  for (let i = 1; i < pr.length; i++) { kit.pipe(p, pr[i - 1], pr[i], 0.012, 0x6b4a30); if (i < pr.length - 1) p.sphere(0.017, pr[i][0], pr[i][1], pr[i][2], 0x6b4a30); }
  for (const y of [0.45, 0.75]) { p.box(0.04, 0.018, 0.026, 0.285, y, -0.04, iron); p.cyl(0.02, 0.02, 0.014, 8, 0.31, y - 0.004, -0.04, iron); }
  // la cheminée-vigie de brique, collée au flanc gauche : fût fuselé, frettes de fer, couronne, fumée
  p.box(0.12, 0.05, 0.12, -0.32, 0, -0.16, dk(stone, 0.9));
  p.cyl(0.05, 0.062, 0.45, 8, -0.32, 0.05, -0.16, brick); p.cyl(0.042, 0.05, 0.5, 8, -0.32, 0.5, -0.16, brick); p.cyl(0.036, 0.042, 0.45, 8, -0.32, 1.0, -0.16, brick);
  p.cyl(0.048, 0.036, 0.05, 8, -0.32, 1.45, -0.16, brickD); p.cyl(0.05, 0.05, 0.012, 8, -0.32, 1.5, -0.16, dk(brickD, 0.7));
  for (const y of [0.3, 0.7, 1.1, 1.4]) band(p, 0.056 - y * 0.012, 0.056 - y * 0.012, 0.014, 8, y, iron, 0, -0.32, -0.16);
  for (const y of [0.35, 0.8, 1.2]) p.box(0.1, 0.014, 0.034, -0.275, y, -0.16, iron);
  kit.smoke(-0.32, 1.52, -0.16, 2);
  // la guérite de tôle vitrée sur le chemin de ronde de fonte, garde-corps
  p.box(0.66, 0.026, 0.66, 0, 1.155, 0, iron); rails(p, 0.32, 1.18, 0.1, 6, 0x6a6f76);
  p.box(0.36, 0.1, 0.36, 0, 1.18, 0, tin);
  for (const a of FACES) {
    for (const u of [-0.1, 0.1]) onFace(p, a, 0.178, u, 1.29, 0.14, 0.16, 0.026, 0xffe6a0, true);
    onFace(p, a, 0.183, 0, 1.29, 0.01, 0.16, 0.03, iron); onFace(p, a, 0.18, 0, 1.285, 0.4, 0.014, 0.034, iron); onFace(p, a, 0.18, 0, 1.45, 0.4, 0.014, 0.034, iron);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.026, 0.19, 0.026, sx * 0.18, 1.28, sz * 0.18, iron);
  p.pyramid(0.56, 0.17, 0.56, 0, 1.46, 0, 0x6c747b);
  p.cyl(0.03, 0.03, 0.07, 6, 0, 1.6, 0, iron); p.cone(0.045, 0.035, 6, 0, 1.66, 0, iron);
  // le projecteur à lentille sur son piédestal, angle de la guérite
  p.cyl(0.03, 0.04, 0.1, 6, 0.24, 1.18, 0.24, iron); p.cyl(0.02, 0.026, 0.05, 6, 0.24, 1.28, 0.24, iron);
  p.add(new THREE.CylinderGeometry(0.055, 0.065, 0.14, 10).rotateX(PI / 2), 0.24, 1.36, 0.24, 0x2e3238, PI / 4);
  p.add(new THREE.CylinderGeometry(0.058, 0.058, 0.016, 10).rotateX(PI / 2), 0.24 + Math.sin(PI / 4) * 0.075, 1.36, 0.24 + Math.cos(PI / 4) * 0.075, 0xfff1c9, PI / 4, true);
  p.add(new THREE.TorusGeometry(0.06, 0.008, 4, 10), 0.24 + Math.sin(PI / 4) * 0.08, 1.36, 0.24 + Math.cos(PI / 4) * 0.08, copper, PI / 4);
  // le télégraphe : poteau sur le chemin de ronde, traverses, isolateurs, fils jusqu'au poteau du sol
  p.cyl(0.011, 0.014, 0.4, 5, -0.24, 1.18, 0.24, 0x6e523c); p.box(0.17, 0.014, 0.014, -0.24, 1.5, 0.24, 0x6e523c); p.box(0.12, 0.014, 0.014, -0.24, 1.43, 0.24, 0x6e523c);
  for (const x of [-0.31, -0.24, -0.17]) p.cyl(0.006, 0.008, 0.026, 5, x, 1.51, 0.24, 0xcfe2e0);
  for (const x of [-0.29, -0.19]) p.cyl(0.006, 0.008, 0.026, 5, x, 1.44, 0.24, 0xcfe2e0);
  p.cyl(0.012, 0.016, 0.62, 5, -0.46, 0, 0.46, 0x6e523c); p.box(0.14, 0.014, 0.014, -0.46, 0.58, 0.46, 0x6e523c);
  for (const x of [-0.52, -0.46, -0.4]) p.cyl(0.005, 0.007, 0.022, 5, x, 0.59, 0.46, 0xcfe2e0);
  for (const dx of [-0.07, 0, 0.07]) kit.pipe(p, [-0.24 + dx, 1.52, 0.24], [-0.46 + dx, 0.6, 0.46], 0.003, 0x2a2e33);
  p.box(0.1, 0.07, 0.07, -0.46, 0, 0.36, 0x5a4a3a); p.box(0.08, 0.02, 0.05, -0.46, 0.07, 0.36, copper);
  // oriflamme sur la guérite, bannière à la porte, charbon, caisses et tonneaux
  flag(p, kit, 0, 1.69, 0, 0.3, 0.2, 0.11, 0x4a5058);
  p.box(0.12, 0.22, 0.01, 0.17, 0.5, 0.262, RED); p.box(0.12, 0.014, 0.012, 0.17, 0.708, 0.265, GOLD); p.box(0.12, 0.014, 0.012, 0.17, 0.5, 0.265, GOLD); p.box(0.03, 0.03, 0.012, 0.17, 0.59, 0.268, GOLD, 0, false, PI / 4);
  for (let i = 0; i < 9; i++) p.sphere(0.022 + 0.014 * H(i, 4), 0.13 + 0.07 * (i % 3) + 0.03 * H(i, 5), 0.015, 0.45 - 0.05 * Math.floor(i / 3), 0x2a2a2e, 0, 0.7);
  barrel(p, -0.28, 0.36, 1.1, 0x6a5a48); barrel(p, -0.34, 0.28, 0.9, 0x8a6a40); crate(p, 0.0, 0, 0.5, 0.09, 0.2); crate(p, 0.1, 0, 0.5, 0.07, -0.3);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* MODERNE : blockhaus et fût de béton, cabine de contrôle vitrée, radar tournant, mât d'antennes, projecteurs, drapeau  */
/* ------------------------------------------------------------------------------------------------------------------ */
function towerModern(p: Parts, kit: DefKit) {
  const conc = 0xb8b8b2, concD = 0x8e9196, concL = 0xd0d0ca, steel = 0x474d55, glass = 0xa8d4ec, olive = 0x5a6444;
  /** béton coffré : volume, joints de banchage et joints verticaux */
  const formwork = (hw: number, hd: number, y0: number, y1: number, step: number, seed: number) => {
    p.box(hw * 2, y1 - y0, hd * 2, 0, y0, 0, conc);
    const n = Math.round((y1 - y0) / step), s = (y1 - y0) / n;
    for (let i = 1; i < n; i++) p.box(hw * 2 + 0.008, 0.008, hd * 2 + 0.008, 0, y0 + i * s - 0.004, 0, dk(conc, 0.86 + 0.1 * H(i, seed)));
    for (const sx of [-1, 1]) p.box(0.012, y1 - y0, hd * 2 + 0.008, sx * (hw * 0.5), y0, 0, dk(conc, 0.92));
  };
  p.box(0.76, 0.03, 0.76, 0, 0, 0, concD);
  // blockhaus : volume coffré, créneaux de tir, porte blindée sous auvent
  formwork(0.27, 0.27, 0.03, 0.34, 0.1, 31);
  p.box(0.58, 0.03, 0.58, 0, 0.34, 0, concL);
  for (const a of FACES) for (const u of [-0.15, 0.15]) { onFace(p, a, 0.272, u, 0.2, 0.1, 0.045, 0.02, 0x20262c); onFace(p, a, 0.278, u, 0.245, 0.12, 0.014, 0.035, concD); }
  p.box(0.16, 0.24, 0.026, 0, 0.03, 0.272, steel); for (const y of [0.1, 0.18]) p.box(0.17, 0.012, 0.03, 0, y, 0.274, 0x6a717a);
  p.box(0.03, 0.02, 0.012, 0.1, 0.15, 0.292, 0x20262c); p.box(0.012, 0.012, 0.012, 0.1, 0.15, 0.3, 0x5ae08a, 0, true);
  tilt(p, 0.3, 0.025, 0.16, 0, 0.3, 0.33, concD, -0.18); for (const s of [-1, 1]) p.box(0.024, 0.26, 0.024, s * 0.14, 0.03, 0.4, steel);
  p.box(0.06, 0.016, 0.026, 0, 0.292, 0.285, 0xfff1c9, 0, true);
  // fût de contrôle fin, joints, fentes vitrées, échelle à crinoline
  formwork(0.15, 0.15, 0.37, 1.04, 0.12, 32);
  for (const a of FACES) for (const y of [0.55, 0.8]) onFace(p, a, 0.152, 0, y, 0.025, 0.14, 0.02, glass, a !== -PI / 2);
  for (const z of [-0.04, 0.04]) p.box(0.014, 0.66, 0.014, 0.19, 0.37, z, steel);
  for (let i = 0; i < 9; i++) p.box(0.014, 0.01, 0.08, 0.19, 0.4 + i * 0.07, 0, steel);
  for (const y of [0.55, 0.7, 0.85, 1.0]) p.add(new THREE.TorusGeometry(0.06, 0.005, 3, 8).rotateY(PI / 2), 0.2, y, 0, steel);
  // cabine de contrôle : dalle débordante, vitrage incliné à meneaux, toit-dalle à acrotère
  p.box(0.66, 0.05, 0.66, 0, 1.02, 0, concL); p.box(0.7, 0.02, 0.7, 0, 1.0, 0, concD);
  for (const a of FACES) {
    tilt(p, 0.5, 0.2, 0.012, fx(a, 0.275), 1.17, fz(a, 0.275), glass, 0.12, a, true);
    for (const u of [-0.25, -0.083, 0.083, 0.25]) onFace(p, a, 0.28, u, 1.07, 0.014, 0.25, 0.02, steel);
    onFace(p, a, 0.285, 0, 1.065, 0.6, 0.014, 0.03, steel); onFace(p, a, 0.285, 0, 1.31, 0.6, 0.014, 0.03, steel);
  }
  p.box(0.7, 0.05, 0.7, 0, 1.33, 0, conc); p.box(0.74, 0.016, 0.74, 0, 1.35, 0, concD);
  for (const a of FACES) onFace(p, a, 0.35, 0, 1.38, 0.72, 0.045, 0.026, concL);
  // toit : mât, radar tournant, antennes, parabole, projecteurs d'angle
  p.cyl(0.03, 0.04, 0.12, 8, 0, 1.38, 0, steel); p.cyl(0.012, 0.014, 0.28, 6, 0, 1.5, 0, steel);
  const rad = kit.turn([0, 1.8, 0], [0, 1, 0], 0.4);
  rad.box(0.36, 0.09, 0.025, 0, -0.04, 0, 0xdcdcd4); rad.box(0.36, 0.015, 0.03, 0, 0.05, 0, 0x6a717a); rad.box(0.03, 0.1, 0.03, 0, -0.08, 0, steel);
  p.cyl(0.02, 0.026, 0.03, 8, 0, 1.78, 0, steel);
  for (const [x, z, h] of [[-0.22, -0.2, 0.36], [-0.28, -0.12, 0.26], [0.22, -0.22, 0.2]] as V3[]) { p.cyl(0.005, 0.007, h, 4, x, 1.38, z, steel); p.sphere(0.01, x, 1.38 + h, z, 0xff4a4a); }
  p.cyl(0.012, 0.016, 0.1, 6, -0.2, 1.38, 0.14, steel); p.add(new THREE.SphereGeometry(0.085, 10, 5, 0, PI * 2, 0, PI / 2.6).rotateX(PI / 2.6), -0.2, 1.52, 0.14, 0xe8e8e0, 0.6);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = sx * 0.31, z = sz * 0.31, a = Math.atan2(sx, sz);
    p.cyl(0.012, 0.016, 0.12, 5, x, 1.38, z, steel); p.box(0.06, 0.04, 0.05, x, 1.5, z, 0x2e3238, a);
    p.box(0.045, 0.028, 0.012, x + Math.sin(a) * 0.03, 1.506, z + Math.cos(a) * 0.03, 0xfff1c9, a, true);
  }
  flag(p, kit, 0.31, 1.38, -0.31, 0.45, 0.22, 0.12, 0xdcdcd4);
  // sacs de sable en muret, barrières béton, groupe électrogène, mât de projecteur au sol, bannière à la porte
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6 - r; i++) p.box(0.1, 0.045, 0.06, -0.38 + i * 0.1 + (r % 2) * 0.05, r * 0.042, 0.42, dk(0xb8a878, 0.85 + 0.2 * H(i + r * 7, 6)), 0.1 * (i % 3 - 1));
  for (const x of [0.28, 0.44]) { p.box(0.14, 0.06, 0.07, x, 0, 0.48, concD, 0.08); p.box(0.07, 0.07, 0.07, x, 0.06, 0.48, concD, 0.08); }
  p.box(0.14, 0.1, 0.1, 0.43, 0, -0.18, olive); p.box(0.1, 0.012, 0.08, 0.43, 0.1, -0.18, 0x3c4630); p.cyl(0.008, 0.008, 0.14, 4, 0.47, 0.1, -0.2, steel);
  p.box(0.012, 0.012, 0.012, 0.37, 0.07, -0.13, 0x5ae08a, 0, true);
  p.cyl(0.01, 0.013, 0.42, 5, -0.42, 0, -0.1, steel); p.box(0.07, 0.04, 0.05, -0.42, 0.42, -0.1, 0x2e3238, -0.6); p.box(0.05, 0.026, 0.012, -0.42 + Math.sin(-0.6) * 0.03, 0.428, -0.1 + Math.cos(-0.6) * 0.03, 0xfff1c9, -0.6, true);
  p.box(0.11, 0.18, 0.01, -0.2, 0.18, 0.276, RED); p.box(0.11, 0.014, 0.012, -0.2, 0.34, 0.279, GOLD); p.box(0.11, 0.014, 0.012, -0.2, 0.18, 0.279, GOLD); p.box(0.03, 0.03, 0.012, -0.2, 0.25, 0.28, GOLD, 0, false, PI / 4);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* FUTURISTE : mât effilé de composite à anneaux lumineux, nacelle vitrée, balise, drone de garde, panneaux de bouclier  */
/* ------------------------------------------------------------------------------------------------------------------ */
function towerFuture(p: Parts, kit: DefKit) {
  const wall = 0xe4ebf1, dkc = 0x4a5664, glow = 0x5ae0ff, glass = 0x8fd4f4;
  // embase : disque sombre à anneau incrusté, plots lumineux
  p.cyl(0.38, 0.4, 0.04, 12, 0, 0, 0, dkc); p.cyl(0.32, 0.36, 0.04, 12, 0, 0.04, 0, 0x6a7684);
  p.add(new THREE.TorusGeometry(0.34, 0.008, 4, 28).rotateX(PI / 2), 0, 0.085, 0, glow, 0, 'neon');
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; p.box(0.04, 0.02, 0.025, Math.sin(a) * 0.37, 0.04, Math.cos(a) * 0.37, glow, a, 'neon'); }
  // fût effilé en trois tronçons de composite, filets lumineux, nervures
  p.cyl(0.17, 0.26, 0.38, 12, 0, 0.08, 0, wall); p.cyl(0.125, 0.17, 0.4, 12, 0, 0.46, 0, lt(wall, 0.1)); p.cyl(0.09, 0.125, 0.34, 12, 0, 0.86, 0, wall);
  for (const y of [0.46, 0.86]) p.cyl(0.19 - y * 0.08, 0.19 - y * 0.08, 0.02, 12, 0, y - 0.01, 0, dkc);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2 + PI / 6; kit.pipe(p, [Math.sin(a) * 0.262, 0.1, Math.cos(a) * 0.262], [Math.sin(a) * 0.096, 1.2, Math.cos(a) * 0.096], 0.007, glow); }
  // anneaux lumineux : trois fixes, un qui tourne
  for (const [y, r] of [[0.32, 0.215], [0.62, 0.15], [0.96, 0.115]]) p.add(new THREE.TorusGeometry(r, 0.012, 4, 20).rotateX(PI / 2), 0, y, 0, glow, 0, 'neon');
  const rg = kit.turn([0, 0.78, 0], [0, 1, 0], 0.5);
  rg.add(new THREE.TorusGeometry(0.2, 0.014, 4, 22).rotateX(PI / 2), 0, 0, 0, glow, 0, 'neon');
  for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2; rg.box(0.05, 0.03, 0.03, Math.sin(a) * 0.2, -0.015, Math.cos(a) * 0.2, GOLD, a); }
  // sas d'entrée lumineux, face à l'entrée, et son perron
  p.box(0.15, 0.2, 0.04, 0, 0.08, 0.235, 0x7ac8f0, 0, 'neon'); p.box(0.19, 0.03, 0.05, 0, 0.28, 0.23, dkc); for (const s of [-1, 1]) p.box(0.02, 0.2, 0.05, s * 0.095, 0.08, 0.235, dkc);
  p.cyl(0.13, 0.15, 0.025, 10, 0, 0.0, 0.4, 0x6a7684); p.add(new THREE.TorusGeometry(0.13, 0.006, 4, 16).rotateX(PI / 2), 0, 0.03, 0.4, glow, 0, 'neon');
  // nacelle d'observation vitrée : bague, vitrage à montants, toit, anneau
  p.cyl(0.14, 0.09, 0.08, 12, 0, 1.18, 0, dkc);
  p.add(new THREE.CylinderGeometry(0.2, 0.16, 0.16, 12, 1, true).translate(0, 0.08, 0), 0, 1.26, 0, glass, 0, 'neon');
  p.cyl(0.215, 0.2, 0.025, 12, 0, 1.25, 0, wall);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; p.box(0.012, 0.17, 0.012, Math.sin(a) * 0.19, 1.26, Math.cos(a) * 0.19, wall, a); }
  p.cyl(0.14, 0.22, 0.04, 12, 0, 1.42, 0, wall); p.cyl(0.06, 0.14, 0.06, 12, 0, 1.46, 0, lt(wall, 0.05)); p.add(new THREE.TorusGeometry(0.225, 0.008, 4, 24).rotateX(PI / 2), 0, 1.265, 0, glow, 0, 'neon');
  // mât de balise : antenne, disques de relais, balise rouge, drapeau de la faction
  p.cyl(0.008, 0.012, 0.32, 5, 0, 1.52, 0, dkc);
  for (const y of [1.66, 1.74]) p.cyl(0.05 - (y - 1.66) * 0.2, 0.05 - (y - 1.66) * 0.2, 0.012, 10, 0, y, 0, wall);
  p.sphere(0.024, 0, 1.86, 0, 0xff4a4a, 1); p.box(0.012, 0.012, 0.012, 0, 1.9, 0, 0xff4a4a, 0, 'neon');
  flag(p, kit, 0.14, 1.46, -0.1, 0.3, 0.18, 0.1, dkc);
  // panneaux de bouclier flottants : quatre plaques hexagonales inclinées autour du fût, liserés de champ
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4, r = 0.45, y = 0.5 + (i % 2) * 0.42;
    p.add(new THREE.CylinderGeometry(0.1, 0.1, 0.018, 6).rotateX(PI / 2), Math.sin(a) * r, y, Math.cos(a) * r, 0x7ac8f0, a, false, 0, 0.12);
    p.add(new THREE.TorusGeometry(0.1, 0.006, 3, 6), Math.sin(a) * r, y, Math.cos(a) * r, glow, a, 'neon');
    p.box(0.02, 0.02, 0.16, Math.sin(a) * (r - 0.1), y - 0.06, Math.cos(a) * (r - 0.1), dkc, a);
  }
  // le drone de garde en orbite : fuselage, nez lumineux, quatre rotors
  const dr = kit.turn([0, 1.05, 0], [0, 1, 0], 0.18), dx = 0.5;
  dr.sphere(0.034, dx, 0, 0, wall, 1, 0.7); dr.box(0.04, 0.012, 0.09, dx, -0.02, 0, dkc); dr.box(0.016, 0.016, 0.014, dx, -0.006, 0.05, glow, 0, 'neon');
  for (const [ox, oz] of [[-0.05, -0.04], [0.05, -0.04], [-0.05, 0.04], [0.05, 0.04]]) { dr.box(0.012, 0.01, 0.012, dx + ox * 0.5, 0.0, oz * 0.5, dkc); dr.add(new THREE.TorusGeometry(0.026, 0.004, 3, 8).rotateX(PI / 2), dx + ox, 0.01, oz, glow, 0, 'neon'); }
  // balises de sol et caisse de matériel
  for (const [x, z] of [[-0.3, 0.3], [0.3, 0.32]]) { p.cyl(0.012, 0.018, 0.12, 6, x, 0.04, z, dkc); p.sphere(0.022, x, 0.18, z, glow, 1); }
  p.box(0.12, 0.08, 0.08, -0.3, 0.0, -0.3, 0x6a7684, 0.3); p.box(0.12, 0.012, 0.08, -0.3, 0.08, -0.3, glow, 0.3, 'neon');
}

//@@SUITE

/** La tour de garde de l'île du portail à l'âge `age` (0 et 1 : Antiquité) */
export function defTower(p: Parts, age: number, kit: DefKit) {
  if (age <= 1) towerAntique(p, kit);
  else if (age === 2) towerMedieval(p, kit);
  else if (age === 3) towerIndustrial(p, kit);
  else if (age === 4) towerModern(p, kit);
  else towerFuture(p, kit);
}

export function defBarracks(p: Parts, age: number, kit: DefKit) {}
