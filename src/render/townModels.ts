import * as THREE from 'three';
import { Parts, type Glow } from './parts';
import { mergeLit } from './materials';
import { mulberry32 } from '../core/rng';
import type { People } from '../world/archipelago';
import type { TownKind } from '../world/rivalTown';
import * as asian from './models/asian';

/**
 * Les modèles des villes des deux peuples rivaux (décor de l'archipel, voir `rivalTowns.ts` et `docs/iles.md`) : un jeu
 * propre à chaque peuple, de l'Antiquité au Futuriste, sans reprendre nos modèles. Le peuple oriental : brique crue puis
 * enduit blanc et sable, toits en terrasse, arcs, coupoles turquoise, mosquée, souk, caravansérail, palais, bains. Le peuple
 * asiatique : charpente et toits courbes, tuiles grises ou vertes, colonnes rouges, temple à pagode, jardins, palais en
 * terrasses. Mêmes conventions que `models.ts` : coordonnées locales au lot, origine au centre, façade vers +z, 1 = une case
 */

// ---------- Outils de construction ----------

/** L'élément `i` d'une liste, en boucle (aussi pour un `i` négatif) */
const pick = <T,>(a: T[], i: number) => a[((Math.round(i) % a.length) + a.length) % a.length];

/** Tronc de pyramide : rectangle w0 × d0 en y, rectangle w1 × d1 en y + h (d1 ≈ 0 : un faîtage le long de x) */
function frustum(p: Parts, w0: number, d0: number, w1: number, d1: number, h: number, x: number, y: number, z: number, col: number, ry = 0, glow: Glow = false) {
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

/** Coupole (demi-sphère ou bulbe) de rayon r et de hauteur h, posée en y */
function dome(p: Parts, r: number, h: number, x: number, y: number, z: number, col: number, onion = false, seg = 10, glow: Glow = false) {
  const pts = onion
    ? [[r * 0.92, 0], [r * 1.06, h * 0.22], [r, h * 0.45], [r * 0.62, h * 0.72], [r * 0.2, h * 0.9], [0, h]]
    : [[r, 0], [r * 0.95, h * 0.31], [r * 0.81, h * 0.59], [r * 0.59, h * 0.81], [r * 0.31, h * 0.95], [0, h]];
  p.add(new THREE.LatheGeometry(pts.map(([u, v]) => new THREE.Vector2(u, v)), seg), x, y, z, col, 0, glow);
}

/** Arc (ouverture sombre au cintre en plein cintre) sur un mur de normale (sin ry, cos ry), centre bas en (x, y, z) */
function arch(p: Parts, w: number, h: number, x: number, y: number, z: number, col: number, ry = 0, depth = 0.02, glow: Glow = false) {
  const r = w / 2, low = Math.max(0.01, h - r);
  const g = new THREE.BoxGeometry(w, low, depth).translate(0, low / 2, 0);
  const top = new THREE.CylinderGeometry(r, r, depth, 7, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, low, 0);
  p.add(g, x, y, z, col, ry, glow);
  p.add(top, x, y, z, col, ry, glow);
}

/** Toit courbe (peuple asiatique) : trois pans de plus en plus raides, faîtage, coins relevés ; `ry` d'un quart de tour au plus */
function curvedRoof(p: Parts, w: number, d: number, h: number, x: number, y: number, z: number, col: number, ridge = 0x2e3236, tips = true) {
  frustum(p, w, d, w * 0.84, d * 0.74, h * 0.18, x, y, z, col);
  frustum(p, w * 0.84, d * 0.74, w * 0.66, d * 0.4, h * 0.34, x, y + h * 0.18, z, col);
  frustum(p, w * 0.66, d * 0.4, w * 0.54, 0.02, h * 0.48, x, y + h * 0.52, z, col);
  p.box(w * 0.58, 0.05, 0.05, x, y + h - 0.025, z, ridge);
  if (!tips) return;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const a = Math.atan2(sx * w, sz * d);
      const g = new THREE.ConeGeometry(0.03, 0.2, 4).rotateX(Math.PI / 2 - 0.6).rotateY(a);
      p.add(g, x + sx * w * 0.5, y + 0.03, z + sz * d * 0.5, col);
    }
  for (const sx of [-1, 1]) p.box(0.06, 0.09, 0.06, x + sx * w * 0.29, y + h - 0.02, z, ridge);
}

/** Toit courbe pyramidal (pagode, pavillon) : pans courbes vers une pointe */
function curvedSpire(p: Parts, w: number, h: number, x: number, y: number, z: number, col: number, seg = 4) {
  const cone = (r0: number, r1: number, hh: number, yy: number) => p.add(new THREE.CylinderGeometry(r1, r0, hh, seg).rotateY(seg === 4 ? Math.PI / 4 : 0).translate(0, hh / 2, 0), x, yy, z, col);
  const k = seg === 4 ? Math.SQRT2 / 2 : 0.5;
  cone(w * k * 1.0, w * k * 0.74, h * 0.2, y);
  cone(w * k * 0.74, w * k * 0.34, h * 0.4, y + h * 0.2);
  cone(w * k * 0.34, 0.01, h * 0.4, y + h * 0.6);
  if (seg === 4)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const g = new THREE.ConeGeometry(0.03, 0.18, 4).rotateX(Math.PI / 2 - 0.6).rotateY(Math.atan2(sx, sz));
        p.add(g, x + sx * w * 0.5, y + 0.03, z + sz * w * 0.5, col);
      }
}

/** Palmier : stipe un peu penché, couronne de palmes */
function palm(p: Parts, x: number, z: number, h: number, seed: number, trunk = 0x8a6a48, leaf = 0x5f9442) {
  const lean = ((seed * 7) % 5 - 2) * 0.04;
  p.add(new THREE.CylinderGeometry(0.025, 0.04, h, 5).translate(0, h / 2, 0), x, 0, z, trunk, 0, false, lean);
  const tx = x - Math.sin(lean) * h, ty = Math.cos(lean) * h;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed;
    const g = new THREE.BoxGeometry(0.06, 0.012, 0.34).translate(0, 0, 0.17).rotateX(0.35).rotateY(a);
    p.add(g, tx, ty, z, i % 2 ? leaf : 0x6fa64e);
  }
}

/** Arbre rond (feuillu, érable) et pin étagé */
function roundTree(p: Parts, x: number, z: number, h: number, col: number, trunk = 0x6b4a34) {
  p.cyl(0.03, 0.045, h * 0.5, 5, x, 0, z, trunk);
  p.sphere(h * 0.32, x, h * 0.62, z, col, 0, 0.85);
}
function pine(p: Parts, x: number, z: number, h: number, col = 0x3f6b48) {
  p.cyl(0.03, 0.045, h * 0.45, 5, x, 0, z, 0x5e4130);
  for (let i = 0; i < 3; i++) p.add(new THREE.CylinderGeometry(h * (0.1 + 0.03 * (2 - i)), h * (0.32 - 0.07 * i), h * 0.1, 6).translate(0, h * 0.05, 0), x + (i - 1) * 0.04, h * (0.38 + i * 0.17), z, col);
}

/** Fenêtres allumées la nuit sur une façade (normale +z, plan z), rangées sur `floors` étages de hauteur `fh` */
function windowRows(p: Parts, w: number, z: number, y0: number, floors: number, fh: number, col: number, n: number, ww = 0.08, wh = 0.1, glow: Glow = true, ry = 0) {
  for (let f = 0; f < floors; f++)
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      const g = new THREE.BoxGeometry(ww, wh, 0.016).translate(0, wh / 2, 0);
      const c = Math.cos(ry), s = Math.sin(ry);
      p.add(g, x * c + z * s, y0 + f * fh + fh * 0.35, -x * s + z * c, col, ry, glow);
    }
}

/**
 * Fenêtres sur les quatre façades d'un bloc w × d (immeubles) : un bandeau vitré par étage, allumé la nuit, recoupé en
 * fenêtres par des trumeaux de la couleur du mur (bien moins de triangles qu'une fenêtre par fenêtre)
 */
function windowsAround(p: Parts, w: number, d: number, y0: number, floors: number, fh: number, col: number, step = 0.32, _ww = 0.08, wh = 0.1, glow: Glow = true, wall = 0xeeeeee) {
  for (let f = 0; f < floors; f++) p.box(w + 0.012, wh, d + 0.012, 0, y0 + f * fh + fh * 0.35, 0, col, 0, glow);
  const h = floors * fh;
  for (const [ry, len, off] of [[0, w, d / 2], [Math.PI / 2, d, w / 2]] as const) {
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const u = Math.max(-len / 2 + 0.05, Math.min(len / 2 - 0.05, -len / 2 + (len / n) * i)), pw = i === 0 || i === n ? 0.1 : len / n - 0.1;
      p.box(pw, h - 0.02, off * 2 + 0.024, ry ? 0 : u, y0, ry ? u : 0, wall, ry);
    }
  }
}

/** Parapet autour d'un toit en terrasse (rectangle w × d, posé en y) */
function parapet(p: Parts, w: number, d: number, y: number, col: number, h = 0.06, t = 0.04, x = 0, z = 0) {
  p.box(w, h, t, x, y, z + d / 2 - t / 2, col); p.box(w, h, t, x, y, z - d / 2 + t / 2, col);
  p.box(t, h, d - 2 * t, x + w / 2 - t / 2, y, z, col); p.box(t, h, d - 2 * t, x - w / 2 + t / 2, y, z, col);
}

/** Merlons sur un mur de longueur `len` le long de x (en y), arrondis (peuple oriental) ou carrés */
function merlons(p: Parts, len: number, y: number, z: number, col: number, step = 0.22, round = false, ry = 0) {
  const n = Math.max(1, Math.floor(len / step));
  for (let i = 0; i < n; i++) {
    const lx = -len / 2 + (len / n) * (i + 0.5), c = Math.cos(ry), s = Math.sin(ry);
    const x = lx * c + z * s, zz = -lx * s + z * c;
    if (round) { p.box(step * 0.5, 0.06, 0.06, x, y, zz, col, ry); p.add(new THREE.CylinderGeometry(step * 0.25, step * 0.25, 0.06, 6, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, 0.06, 0), x, y, zz, col, ry); }
    else p.box(step * 0.5, 0.08, 0.07, x, y, zz, col, ry);
  }
}

// ---------- Le peuple oriental ----------

const O = {
  mud: 0xc9a273, mudDark: 0xa58357, sand: 0xe6d3a8, white: 0xf3eee3, cream: 0xeee2c6, turq: 0x2f9e9a, turqL: 0x5cc4b9,
  blue: 0x2f6f9e, gold: 0xd9b24a, wood: 0x7a5536, darkwood: 0x5a3e2a, hole: 0x3b3029, win: 0xf0cf8a, water: 0x6cc4d0,
  concrete: 0xe8e4dc, glass: 0x9fd4e0, green: 0x6f9a4a, tile: 0x3f8fb0, stone: 0xd8c7a2,
};
const AWNING = [0xc7563e, 0xd9a43c, 0x3f8f8a, 0xe9e1cf, 0x8a4f7a, 0x4f7fb0];
/** Enduit des murs selon l'âge et la variante */
const oWall = (age: number, v: number) => (age <= 1 ? [O.mud, 0xd2ae7e, 0xbf9868][v % 3] : age <= 3 ? [O.white, O.sand, O.cream, 0xf0e6d6][v % 4] : [O.concrete, O.white, 0xf1e7d4, 0xe6d2a8, 0xdcc097][v % 5]);

function oHouse(p: Parts, age: number, v: number, w: number, d: number) {
  const r = mulberry32(v + 11), wall = oWall(age, v), W = w * 0.92, D = d * 0.92;
  if (age <= 1) {
    const h = 0.3 + r() * 0.12;
    p.box(W, h, D, 0, 0, 0, wall);
    parapet(p, W, D, h, wall, 0.05, 0.04);
    for (let i = 0; i < 3; i++) p.box(0.03, 0.03, 0.06, -W * 0.3 + i * W * 0.3, h - 0.07, D / 2 + 0.02, O.wood);
    p.box(0.12, 0.17, 0.02, W * 0.18, 0, D / 2, O.hole);
    p.box(0.07, 0.06, 0.02, -W * 0.22, 0.15, D / 2, O.win, 0, true);
    if (r() < 0.35) { const ux = (r() - 0.5) * W * 0.3; p.box(W * 0.45, 0.24, D * 0.5, ux, h, -D * 0.2, wall); parapet(p, W * 0.45, D * 0.5, h + 0.24, wall, 0.04, 0.03, ux, -D * 0.2); }
    else if (r() < 0.5) { for (const sx of [-1, 1]) p.box(0.02, 0.16, 0.02, sx * W * 0.25, h, D * 0.15, O.wood); p.box(W * 0.6, 0.015, D * 0.45, 0, h + 0.16, 0, pick(AWNING, v)); }
    return;
  }
  if (age <= 3) {
    const floors = age === 2 ? 1 + (r() < 0.45 ? 1 : 0) : 2 + (r() < 0.35 ? 1 : 0), fh = 0.3, h = floors * fh;
    p.box(W, h, D, 0, 0, 0, wall);
    p.box(W + 0.02, 0.03, D + 0.02, 0, h, 0, age === 3 ? O.stone : wall);
    // parapet à créneaux en gradins
    parapet(p, W, D, h + 0.03, wall, 0.04, 0.035);
    for (const sx of [-1, 1]) p.box(0.06, 0.06, 0.035, sx * W * 0.32, h + 0.07, D / 2 - 0.018, wall);
    // porte en arc, de bois peint
    arch(p, 0.13, 0.2, W * 0.15, 0, D / 2 + 0.006, age === 2 ? O.turq : O.blue);
    // fenêtres étroites à grilles turquoise, allumées la nuit
    for (let f = 0; f < floors; f++)
      for (const sx of f === 0 ? [-0.25] : [-0.25, 0.22]) {
        p.box(0.07, 0.11, 0.016, sx * W, f * fh + 0.11, D / 2 + 0.004, O.win, 0, true);
        p.box(0.09, 0.014, 0.03, sx * W, f * fh + 0.1, D / 2 + 0.01, O.turq);
      }
    windowRows(p, D, W / 2 + 0.004, 0, floors, fh, O.win, 2, 0.06, 0.09, true, Math.PI / 2);
    if (age === 3 && floors >= 2) {
      // moucharabieh : balcon de bois ajouré à l'étage
      p.box(W * 0.42, fh * 0.75, 0.12, -W * 0.05, fh * 1.08, D / 2 + 0.06, O.darkwood);
      p.box(W * 0.36, fh * 0.5, 0.012, -W * 0.05, fh * 1.2, D / 2 + 0.122, O.win, 0, true);
      p.box(W * 0.46, 0.03, 0.15, -W * 0.05, fh * 1.83, D / 2 + 0.06, O.wood);
    }
    const kind = v % 6;
    if (kind === 0) { p.cyl(W * 0.2, W * 0.2, 0.06, 8, W * 0.15, h + 0.03, -D * 0.1, wall); dome(p, W * 0.2, W * 0.22, W * 0.15, h + 0.09, -D * 0.1, age === 2 ? O.white : O.turq, false, 8); }
    else if (kind === 1) {
      // tour à vent
      p.box(0.18, 0.32, 0.18, -W * 0.25, h, -D * 0.22, wall);
      for (const [ry, ox, oz] of [[0, 0, 0.091], [Math.PI / 2, 0.091, 0]] as const) for (const s of [-0.04, 0.04]) p.box(0.025, 0.18, 0.012, -W * 0.25 + ox + (ry ? 0 : s), h + 0.1, -D * 0.22 + oz + (ry ? s : 0), O.hole, ry);
      p.box(0.22, 0.03, 0.22, -W * 0.25, h + 0.32, -D * 0.22, wall);
    } else if (kind === 2) { for (const sx of [-1, 1]) p.box(0.02, 0.15, 0.02, sx * W * 0.28, h + 0.03, D * 0.2, O.wood); p.box(W * 0.62, 0.015, D * 0.5, 0, h + 0.18, 0, pick(AWNING, (v >> 2))); }
    else if (kind === 3) { p.cyl(0.05, 0.06, 0.1, 6, W * 0.25, h + 0.03, D * 0.2, 0xb4744a); p.cyl(0.04, 0.05, 0.08, 6, W * 0.32, h + 0.03, D * 0.05, 0xb4744a); }
    return;
  }
  if (age === 4) {
    // immeuble blanc à balcons, citerne et climatiseurs sur le toit
    const floors = 3 + Math.floor(r() * 3), fh = 0.26, h = floors * fh;
    p.box(W, h, D, 0, 0, 0, wall);
    for (let f = 1; f < floors; f++) p.box(W + 0.05, 0.025, 0.08, 0, f * fh, D / 2 + 0.03, O.white);
    windowsAround(p, W, D, 0, floors, fh, O.win, 0.24, 0.1, 0.12, true, wall);
    p.box(0.18, 0.2, 0.012, 0, 0, D / 2 + 0.005, O.hole);
    // un motif de façade : bandes verticales turquoise ou sable
    if (v % 2) for (const sx of [-1, 1]) p.box(0.05, h, 0.02, sx * W * 0.47, 0, D / 2 + 0.01, v % 4 === 1 ? O.turq : O.sand);
    parapet(p, W, D, h, wall, 0.05, 0.03);
    p.cyl(0.07, 0.07, 0.12, 8, W * 0.22, h, -D * 0.2, 0xd8d8d8);
    p.box(0.1, 0.06, 0.07, -W * 0.25, h, D * 0.15, 0xbcbcbc);
    if (v % 3 === 0) p.sphere(0.06, -W * 0.2, h + 0.12, -D * 0.25, 0xeeeeee, 0, 0.4);
    return;
  }
  // âge futuriste : tour blanche arrondie, bandeaux de verre turquoise, jardin sur le toit ; ou (une sur trois) un bloc blanc
  // bas à grandes arcades vitrées sous une coupole de verre
  if (v % 3 === 0) {
    const h = 0.5 + r() * 0.3;
    p.box(W, h, D, 0, 0, 0, O.white);
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const s of [-1, 1]) arch(p, 0.26, h * 0.75, Math.cos(ry) * s * W * 0.22 + Math.sin(ry) * (W / 2 + 0.005), 0.04, -Math.sin(ry) * s * D * 0.22 + Math.cos(ry) * (D / 2 + 0.005), O.glass, ry, 0.02, true);
    p.box(W + 0.02, 0.02, D + 0.02, 0, h - 0.06, 0, O.turqL, 0, 'neon');
    dome(p, Math.min(W, D) * 0.4, Math.min(W, D) * 0.34, 0, h, 0, O.glass, false, 10, true);
    return;
  }
  const floors = 4 + Math.floor(r() * 5), fh = 0.24, h = floors * fh, rad = Math.min(W, D) * 0.48;
  p.cyl(rad, rad * 1.04, h, 10, 0, 0, 0, O.white);
  for (let f = 0; f < floors; f++) p.cyl(rad + 0.012, rad + 0.012, 0.07, 10, 0, f * fh + 0.09, 0, O.glass, true);
  for (let f = 2; f < floors; f += 3) p.cyl(rad + 0.02, rad + 0.02, 0.015, 10, 0, f * fh + 0.2, 0, O.turqL, 'neon');
  p.cyl(rad * 0.9, rad * 0.9, 0.04, 10, 0, h, 0, O.green);
  if (v % 2) palm(p, rad * 0.3, 0, 0.3, v);
  else dome(p, rad * 0.55, rad * 0.4, 0, h + 0.04, 0, O.glass, false, 8, true);
  // socle
  p.box(W, 0.12, D, 0, 0, 0, 0xddd6c8);
}

function oTemple(p: Parts, age: number) {
  const mud = age <= 1, wall = mud ? O.mud : age === 4 ? 0xf6f3ec : O.white, trim = mud ? O.mudDark : age >= 4 ? O.sand : O.stone;
  const domeCol = mud ? O.mud : age === 2 ? O.turq : age === 3 ? O.tile : age === 4 ? O.gold : O.glass;
  const S = age >= 3 ? 1.08 : 1;
  // cour à arcades (devant), salle de prière (derrière), grande coupole sur tambour
  p.box(4.8, 0.05, 4.8, 0, 0, 0, trim);
  const cw = 0.12, ch = mud ? 0.38 : 0.48;
  // murs de la cour, percés d'arcs sur leur face intérieure
  for (const [x, z, w, d] of [[0, 2.34, 4.6, cw], [-2.34, 0.9, cw, 2.9], [2.34, 0.9, cw, 2.9]] as const) p.box(w, ch, d, x, 0.05, z, wall);
  if (!mud) {
    for (let i = 0; i < 6; i++) arch(p, 0.32, 0.36, -1.85 + i * 0.74, 0.05, 2.27, O.hole, Math.PI);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) arch(p, 0.32, 0.36, sx * 2.27, 0.05, 0.1 + i * 0.75, O.hole, sx * -Math.PI / 2);
    merlons(p, 4.6, 0.05 + ch, 2.34, wall, 0.25, true);
  }
  // le portail (iwan) sur la façade
  p.box(1.1, ch + 0.45, 0.3, 0, 0.05, 2.36, wall);
  arch(p, 0.62, ch + 0.2, 0, 0.05, 2.52, mud ? O.hole : O.turq);
  arch(p, 0.46, ch + 0.08, 0, 0.05, 2.525, O.hole);
  // bassin des ablutions
  p.cyl(0.42, 0.42, 0.1, 8, 0, 0.05, 1.1, trim);
  p.cyl(0.36, 0.36, 0.102, 8, 0, 0.05, 1.1, O.water);
  if (age >= 2) p.cyl(0.04, 0.05, 0.22, 6, 0, 0.05, 1.1, trim);
  // salle de prière
  const hh = (mud ? 0.6 : 0.78) * S;
  p.box(4.6, hh, 2, 0, 0.05, -1.3, wall);
  for (let i = 0; i < 7; i++) arch(p, 0.36, hh * 0.7, -1.8 + i * 0.6, 0.05, -0.29, i === 3 ? (mud ? O.hole : O.turq) : O.hole, 0, 0.02, i % 2 === 1 && !mud);
  p.box(4.66, 0.05, 2.06, 0, 0.05 + hh, -1.3, trim);
  if (!mud) merlons(p, 4.6, 0.1 + hh, -0.3, wall, 0.26, true);
  // tambour et coupole
  const dr = (mud ? 0.7 : 0.92) * S, dy = 0.1 + hh;
  p.cyl(dr * 0.98, dr, 0.3 * S, 12, 0, dy, -1.3, wall);
  if (!mud) for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.08, 0.14, 0.02, Math.sin(a) * (dr + 0.005), dy + 0.08, -1.3 + Math.cos(a) * (dr + 0.005), O.win, a, true); }
  dome(p, dr, dr * (mud ? 0.8 : age === 3 ? 1.25 : 1.05), 0, dy + 0.3 * S, -1.3, domeCol, age === 3, 12, age === 5 ? 'neon' : false);
  if (age === 2 || age === 3) p.cyl(dr + 0.01, dr + 0.01, 0.06, 12, 0, dy + 0.3 * S, -1.3, age === 2 ? O.blue : O.turq);
  const top = dy + 0.3 * S + dr * (mud ? 0.8 : age === 3 ? 1.25 : 1.05);
  p.cyl(0.015, 0.015, 0.22, 4, 0, top - 0.02, -1.3, O.gold);
  p.sphere(0.045, 0, top + 0.12, -1.3, O.gold);
  // petites coupoles des ailes
  if (!mud) for (const sx of [-1, 1]) { p.cyl(0.36, 0.38, 0.12, 10, sx * 1.6, dy, -1.3, wall); dome(p, 0.36, 0.36, sx * 1.6, dy + 0.12, -1.3, domeCol, false, 10, age === 5 ? 'neon' : false); }
  // minarets
  const mins = age <= 1 ? [[-2.15, 2.1]] : age === 2 ? [[-2.15, 2.15]] : age <= 4 ? [[-2.15, 2.15], [2.15, 2.15]] : [[-2.15, 2.15], [2.15, 2.15], [-2.15, -2.15], [2.15, -2.15]];
  for (const [x, z] of mins) {
    if (mud) {
      p.box(0.42, 1.7, 0.42, x, 0.05, z, wall);
      p.box(0.5, 0.08, 0.5, x, 1.75, z, trim);
      p.box(0.32, 0.28, 0.32, x, 1.83, z, wall);
      p.box(0.06, 0.12, 0.02, x, 1.9, z + 0.161, O.hole);
      continue;
    }
    const H = age === 2 ? 2.8 : age === 3 ? 3.2 : age === 4 ? 3.8 : 4.2, r0 = age >= 4 ? 0.17 : 0.22;
    p.cyl(r0 + 0.06, r0 + 0.08, 0.5, 8, x, 0.05, z, wall);
    p.cyl(r0 * 0.85, r0, H * 0.62, 10, x, 0.55, z, wall);
    for (const t of age >= 4 ? [0.62, 0.86] : [0.66]) {
      p.cyl(r0 + 0.08, r0 * 0.9, 0.06, 10, x, 0.55 + H * t * 0.9, z, trim);
      p.cyl(r0 + 0.09, r0 + 0.09, 0.05, 10, x, 0.61 + H * t * 0.9, z, age >= 4 ? O.gold : O.turq, age === 5 ? 'neon' : false);
    }
    p.cyl(r0 * 0.65, r0 * 0.8, H * 0.26, 10, x, 0.55 + H * 0.62, z, wall);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; p.box(0.04, 0.09, 0.02, x + Math.sin(a) * r0 * 0.7, 0.55 + H * 0.7, z + Math.cos(a) * r0 * 0.7, O.win, a, true); }
    if (age === 4) p.cone(r0 * 0.75, 0.5, 10, x, 0.55 + H * 0.88, z, O.gold);
    else dome(p, r0 * 0.7, r0 * 1.3, x, 0.55 + H * 0.88, z, domeCol, true, 8, age === 5 ? 'neon' : false);
    p.cyl(0.01, 0.01, 0.2, 4, x, 0.55 + H * 0.88 + (age === 4 ? 0.48 : r0 * 1.2), z, O.gold);
  }
  if (mud) for (const [x, z] of [[1.6, 1.4], [-1.4, 0.7]]) palm(p, x, z, 0.8, x * 3);
  else for (const [x, z] of [[1.4, 1.6], [-1.4, 1.6], [1.6, 0.5], [-1.6, 0.5]]) palm(p, x, z, 0.85, x * 5 + z);
}

function oPalace(p: Parts, age: number) {
  const mud = age <= 1, wall = mud ? O.mud : age >= 4 ? 0xf7f4ee : O.sand, trim = mud ? O.mudDark : O.stone;
  const domeCol = mud ? O.mud : age === 2 ? O.turq : age === 3 ? O.tile : age === 4 ? O.gold : O.glass;
  const glow: Glow = age === 5 ? 'neon' : false;
  // enceinte et tours d'angle
  const W = 5.8, D = 4.8, eh = mud ? 0.5 : 0.6;
  for (const [x, z, w, d] of [[0, D / 2 - 0.06, W, 0.12], [0, -D / 2 + 0.06, W, 0.12], [W / 2 - 0.06, 0, 0.12, D], [-W / 2 + 0.06, 0, 0.12, D]] as const) {
    if (z > 0) { p.box((W - 1.1) / 2, eh, d, -(W + 1.1) / 4, 0, z, wall); p.box((W - 1.1) / 2, eh, d, (W + 1.1) / 4, 0, z, wall); }
    else p.box(w, eh, d, x, 0, z, wall);
  }
  merlons(p, W, eh, D / 2 - 0.06, wall, 0.24, !mud);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    if (mud) { p.box(0.6, eh + 0.4, 0.6, sx * (W / 2 - 0.2), 0, sz * (D / 2 - 0.2), wall); merlons(p, 0.6, eh + 0.4, sz * (D / 2 - 0.2) + 0.27, wall, 0.2); }
    else { p.cyl(0.32, 0.36, eh + 0.45, 10, sx * (W / 2 - 0.2), 0, sz * (D / 2 - 0.2), wall); dome(p, 0.3, 0.32, sx * (W / 2 - 0.2), eh + 0.45, sz * (D / 2 - 0.2), domeCol, age === 3, 8, glow); }
  }
  // porte d'honneur
  p.box(1.3, eh + 0.55, 0.32, 0, 0, D / 2 - 0.06, wall);
  arch(p, 0.62, eh + 0.3, 0, 0, D / 2 + 0.11, mud ? O.hole : O.turq);
  arch(p, 0.46, eh + 0.18, 0, 0, D / 2 + 0.115, O.hole);
  merlons(p, 1.3, eh + 0.55, D / 2 + 0.02, wall, 0.22, !mud);
  // jardin à quatre parterres et canaux en croix, bassin au centre, palmiers
  p.box(W - 0.3, 0.03, 2.4, 0, 0, 0.9, mud ? 0xc9b27e : 0xd9c9a2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(1.9, 0.05, 0.9, sx * 1.25, 0, 0.9 + sz * 0.6, O.green);
  p.box(0.16, 0.035, 2.3, 0, 0.012, 0.9, O.water); p.box(4.6, 0.035, 0.16, 0, 0.012, 0.9, O.water);
  p.cyl(0.3, 0.3, 0.06, 8, 0, 0, 0.9, trim); p.cyl(0.25, 0.25, 0.062, 8, 0, 0, 0.9, O.water);
  for (const [x, z] of [[-2.1, 1.85], [2.1, 1.85], [-2.1, 0], [2.1, 0], [-0.8, 1.9], [0.8, 1.9]]) palm(p, x, z, mud ? 0.8 : 1, x * 7 + z);
  // le palais : deux étages à galerie d'arcs, grand iwan, coupole
  const fl = age >= 4 ? 3 : 2, fh = mud ? 0.42 : 0.48, h = fl * fh;
  p.box(4.8, h, 1.6, 0, 0, -1.35, wall);
  for (let f = 0; f < fl; f++) {
    for (let i = 0; i < 9; i++) if (Math.abs(i - 4) > 1 || f === fl - 1) arch(p, 0.3, fh * 0.75, -2.2 + i * 0.55, f * fh + 0.04, -0.54, O.hole, 0, 0.02, f > 0 && i % 2 === 0);
    p.box(4.86, 0.04, 1.66, 0, (f + 1) * fh - 0.04, -1.35, trim);
  }
  // l'iwan : une haute voûte au milieu de la façade
  p.box(1.6, h + 0.4, 0.35, 0, 0, -0.45, wall);
  arch(p, 1.0, h + 0.05, 0, 0, -0.27, mud ? O.hole : age >= 4 ? O.gold : O.turq);
  arch(p, 0.8, h - 0.1, 0, 0, -0.265, O.hole, 0, 0.02, !mud);
  merlons(p, 4.8, h, -0.56, wall, 0.25, !mud);
  // coupole et pavillons du toit
  p.cyl(0.62, 0.64, 0.25, 12, 0, h, -1.45, wall);
  dome(p, 0.64, mud ? 0.5 : 0.8, 0, h + 0.25, -1.45, domeCol, age === 3, 12, glow);
  p.sphere(0.04, 0, h + 0.25 + (mud ? 0.5 : 0.8) + 0.03, -1.45, O.gold);
  for (const sx of [-1, 1]) {
    for (const c of [-0.18, 0.18]) for (const d of [-0.18, 0.18]) p.cyl(0.025, 0.025, 0.36, 5, sx * 1.8 + c, h, -1.45 + d, trim);
    p.box(0.5, 0.05, 0.5, sx * 1.8, h + 0.36, -1.45, trim);
    if (!mud) dome(p, 0.24, 0.22, sx * 1.8, h + 0.41, -1.45, domeCol, false, 8, glow);
  }
  if (age === 4) for (let i = 0; i < 8; i++) p.cyl(0.05, 0.05, h * 0.92, 6, -2.1 + i * 0.6, 0, -0.42, 0xf7f4ee);
}

function oMarket(p: Parts, age: number, v: number) {
  const wall = oWall(age, v), trim = age <= 1 ? O.mudDark : O.stone;
  p.box(3.8, 0.04, 3.8, 0, 0, 0, age <= 1 ? 0xcdb488 : 0xd6c6a0);
  if (age <= 1 || age === 3) {
    // étals à auvents de toile, en deux rangées, sacs et paniers
    const rows = age <= 1 ? [-0.9, 0.9] : [1.25];
    for (const z of rows)
      for (let i = 0; i < 4; i++) {
        const x = -1.35 + i * 0.9, c = pick(AWNING, (i + Math.round(z * 3) + v));
        p.box(0.7, 0.16, 0.42, x, 0, z, O.wood);
        for (const s of [-1, 1]) p.box(0.025, 0.42, 0.025, x + s * 0.32, 0, z - 0.2, O.wood);
        frustum(p, 0.8, 0.6, 0.8, 0.02, 0.1, x, 0.38, z, c);
        for (let j = 0; j < 3; j++) p.cyl(0.06, 0.07, 0.07, 6, x - 0.2 + j * 0.2, 0.16, z + 0.06, [0xc98a3a, 0x9a3a2a, 0xe0b440, 0x6a8a3a][(i + j) % 4]);
      }
  }
  if (age >= 2) {
    // le souk couvert : une longue halle voûtée sous une rangée de petites coupoles
    const z = age === 3 ? -0.6 : 0, n = 4, hh = age >= 4 ? 0.7 : 0.55;
    p.box(3.6, hh, 1.5, 0, 0, z, wall);
    for (let i = 0; i < n; i++) {
      const x = -1.35 + i * 0.9;
      arch(p, 0.42, hh * 0.85, x, 0, z + 0.755, O.hole, 0, 0.02, i % 2 === 0);
      arch(p, 0.42, hh * 0.85, x, 0, z - 0.755, O.hole, Math.PI);
      if (age === 5) dome(p, 0.4, 0.34, x, hh, z, O.glass, false, 8, true);
      else { p.cyl(0.36, 0.38, 0.06, 8, x, hh, z, trim); dome(p, 0.36, 0.3, x, hh + 0.06, z, age === 4 ? O.white : age === 2 ? wall : O.turq, false, 8); p.box(0.05, 0.05, 0.05, x, hh + 0.35, z, O.win, 0, true); }
    }
    p.box(3.66, 0.04, 1.56, 0, hh, z, trim);
    if (age >= 4) for (const s of [-1, 1]) p.box(0.4, 0.32, 0.6, s * 1.7, 0, z + (age === 4 ? 1.1 : 1.2), pick(AWNING, (v + s + 2)));
    if (age === 3) {
      // tour de l'horloge
      p.box(0.5, 1.7, 0.5, 1.55, 0, 0.5, wall);
      p.cyl(0.14, 0.14, 0.02, 10, 1.55, 1.35, 0.76, 0xf6f2e6, true);
      p.box(0.6, 0.06, 0.6, 1.55, 1.7, 0.5, trim);
      dome(p, 0.25, 0.3, 1.55, 1.76, 0.5, O.turq, true, 8);
    }
    if (age >= 4) for (let i = 0; i < 5; i++) palm(p, -1.6 + i * 0.8, 1.55, 0.7, i + v);
  }
}

function oCaravan(p: Parts, age: number, v: number) {
  const wall = age <= 1 ? O.mud : age >= 4 ? O.white : O.sand, trim = age <= 1 ? O.mudDark : O.stone;
  const fl = age <= 3 ? 1 : age === 4 ? 3 : 4, fh = 0.42, h = fl * fh + 0.1, t = 0.9, S = 3.8;
  // quatre ailes autour d'une cour, galerie d'arcs sur la cour
  for (const [x, z, w, d] of [[0, -(S - t) / 2, S, t], [0, (S - t) / 2, S, t], [-(S - t) / 2, 0, t, S - 2 * t], [(S - t) / 2, 0, t, S - 2 * t]] as const) p.box(w, h, d, x, 0, z, wall);
  // les arcs de la galerie, sur les faces de la cour, et les fenêtres des étages sur les façades
  const inner = S / 2 - t - 0.006, n = 4;
  for (const ry of [0, Math.PI, Math.PI / 2, -Math.PI / 2]) {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    for (let i = 0; i < n; i++) {
      const u = -inner + ((2 * inner) / n) * (i + 0.5);
      arch(p, 0.3, 0.32, -nx * inner + nz * u, 0, -nz * inner + nx * u, O.hole, ry);
    }
    if (fl > 1) windowRows(p, S * 0.9, S / 2 + 0.004, fh, fl - 1, fh, O.win, 8, 0.09, 0.12, true, ry);
  }
  parapet(p, S, S, h, wall, 0.06, 0.06);
  merlons(p, S, h + 0.06, S / 2 - 0.03, wall, 0.25, age >= 2);
  // l'entrée monumentale
  p.box(1.2, h + 0.4, 0.3, 0, 0, S / 2 - 0.1, wall);
  arch(p, 0.6, Math.min(h + 0.15, 0.85), 0, 0, S / 2 + 0.06, age <= 1 ? O.hole : O.turq);
  arch(p, 0.44, Math.min(h, 0.7), 0, 0, S / 2 + 0.065, O.hole);
  // la cour : puits, ballots, et sous les âges anciens, des chameaux couchés
  p.box(S - 2 * t, 0.02, S - 2 * t, 0, 0, 0, age <= 1 ? 0xcdb488 : 0xd9c9a2);
  p.cyl(0.18, 0.2, 0.14, 8, 0, 0, 0, trim);
  p.cyl(0.14, 0.14, 0.142, 8, 0, 0, 0, O.water);
  if (age >= 4) { p.cyl(0.6, 0.6, 0.03, 10, 0, 0, 0, O.water); palm(p, 0.6, 0.6, 0.6, v); }
  else for (let i = 0; i < 3; i++) p.box(0.18, 0.12, 0.14, -0.6 + i * 0.2, 0, 0.6, [0xb88a5a, 0x9a6a3a, 0xc8a070][i]);
  if (age <= 2) for (const [x, z] of [[0.6, -0.5], [-0.55, -0.6]]) {
    p.box(0.34, 0.12, 0.13, x, 0, z, 0xc19a68);
    p.sphere(0.06, x + 0.06, 0.14, z, 0xb08858, 0, 0.9);
    p.box(0.05, 0.16, 0.05, x + 0.2, 0.06, z, 0xc19a68, 0, false, -0.3);
    p.box(0.1, 0.05, 0.05, x + 0.25, 0.2, z, 0xb08858);
  }
  if (age === 5) dome(p, 1.0, 0.45, 0, h, 0, O.glass, false, 10, true);
}

function oBaths(p: Parts, age: number, v: number) {
  const wall = oWall(Math.max(2, age), v), trim = O.stone, W = 2.8, D = 2.4;
  p.box(W, 0.5, D, 0, 0, 0, wall);
  p.box(W + 0.04, 0.04, D + 0.04, 0, 0.5, 0, trim);
  arch(p, 0.36, 0.42, 0, 0, D / 2 + 0.006, O.turq); arch(p, 0.26, 0.34, 0, 0, D / 2 + 0.01, O.hole);
  // coupoles percées d'oculi (de petites lumières)
  for (const [x, z, r] of [[0, -0.2, 0.62], [-0.95, 0.5, 0.36], [0.95, 0.5, 0.36], [-0.95, -0.6, 0.32], [0.95, -0.6, 0.32]] as const) {
    p.cyl(r, r + 0.02, 0.08, 10, x, 0.54, z, wall);
    dome(p, r, r * 0.85, x, 0.62, z, age === 5 ? O.glass : age >= 3 ? O.turq : wall, false, 10, age === 5 ? 'neon' : false);
    for (let i = 0; i < (r > 0.5 ? 6 : 3); i++) { const a = (i / 6) * Math.PI * 2 + 0.3; p.box(0.04, 0.02, 0.04, x + Math.sin(a) * r * 0.55, 0.62 + r * 0.68, z + Math.cos(a) * r * 0.55, 0xfff1c8, 0, true); }
  }
  p.box(0.22, 0.6, 0.22, W / 2 - 0.2, 0.5, -D / 2 + 0.2, wall);
}

function oGarden(p: Parts, age: number, v: number, w: number, d: number) {
  const wall = oWall(Math.max(2, age), v), W = w * 0.94, D = d * 0.94;
  // muret, parterres en croix, fontaine, palmiers et orangers
  for (const [x, z, ww, dd] of [[0, D / 2, W, 0.06], [0, -D / 2, W, 0.06], [W / 2, 0, 0.06, D], [-W / 2, 0, 0.06, D]] as const) p.box(ww, 0.18, dd, x, 0, z, wall);
  p.box(W - 0.1, 0.02, D - 0.1, 0, 0, 0, 0xd9c9a2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(W * 0.38, 0.05, D * 0.38, sx * W * 0.24, 0, sz * D * 0.24, O.green);
  p.box(0.08, 0.03, D - 0.2, 0, 0.01, 0, O.water); p.box(W - 0.2, 0.03, 0.08, 0, 0.01, 0, O.water);
  p.cyl(0.18, 0.2, 0.08, 8, 0, 0, 0, O.stone); p.cyl(0.15, 0.15, 0.082, 8, 0, 0, 0, O.water);
  p.cyl(0.03, 0.04, 0.16, 5, 0, 0.08, 0, O.stone);
  for (const [sx, sz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) {
    if ((v + sx + sz * 2) % 3 === 0) roundTree(p, sx * W * 0.24, sz * D * 0.24, 0.45, 0x5f8f3e);
    else palm(p, sx * W * 0.24, sz * D * 0.24, 0.6 + ((v >> 2) % 3) * 0.08, v + sx * 3 + sz);
  }
  if (age === 5) for (const sx of [-1, 1]) p.box(0.04, 0.02, D * 0.8, sx * W * 0.45, 0.18, 0, O.turqL, 0, 'neon');
}

function oWorkshop(p: Parts, age: number, v: number, w: number, d: number) {
  const wall = oWall(age, v), W = w * 0.92, D = d * 0.92;
  if (age <= 2) {
    // atelier de teinturier : appentis ouvert, cuves de couleur, étoffes qui sèchent
    p.box(W, 0.32, D * 0.45, 0, 0, -D * 0.27, wall);
    for (const sx of [-1, 1]) p.box(0.03, 0.3, 0.03, sx * W * 0.42, 0, D * 0.05, O.wood);
    p.box(W, 0.02, D * 0.4, 0, 0.3, D * 0.0, O.wood);
    for (let i = 0; i < 3; i++) { p.cyl(0.1, 0.1, 0.1, 8, -W * 0.3 + i * W * 0.3, 0, D * 0.32, O.mudDark); p.cyl(0.08, 0.08, 0.102, 8, -W * 0.3 + i * W * 0.3, 0, D * 0.32, [0x2f5fa0, 0xc0442a, 0xd9a43c][(i + v) % 3]); }
    p.box(W * 0.8, 0.12, 0.005, 0, 0.16, D * 0.15, pick(AWNING, v));
    return;
  }
  if (age === 3) {
    // atelier de brique et sa cheminée
    p.box(W, 0.36, D * 0.8, 0, 0, 0, 0xc98a6a);
    frustum(p, W + 0.04, D * 0.84, W + 0.04, 0.02, 0.18, 0, 0.36, 0, 0x8a6a5a);
    p.cyl(0.06, 0.08, 0.8, 6, W * 0.3, 0, -D * 0.25, 0xa86a50);
    windowRows(p, W, D * 0.4 + 0.004, 0, 1, 0.36, O.win, 3, 0.12, 0.12);
    return;
  }
  p.box(W, age === 4 ? 0.42 : 0.36, D * 0.85, 0, 0, 0, age === 4 ? 0xd8d4cc : O.white);
  windowRows(p, W, D * 0.425 + 0.004, 0, 1, 0.42, O.win, 3, 0.16, 0.12);
  if (age === 4) p.box(W * 0.3, 0.2, 0.2, W * 0.2, 0.42, 0, 0xbcbcbc);
  else for (let i = 0; i < 2; i++) p.box(W * 0.42, 0.02, D * 0.6, -W * 0.22 + i * W * 0.44, 0.42, 0, 0x2a4a6a, 0, false, 0.25);
}

function oPort(p: Parts, age: number, v: number) {
  const stone = age <= 1 ? 0xbca27a : 0xc9b994, wall = oWall(age, v);
  // le quai de pierre avance sur l'eau (+z) ; il plonge jusqu'au fond
  p.box(4, 1.6, 2.4, 0, -1.5, 0.9, stone);
  p.box(4.04, 0.05, 2.44, 0, 0.08, 0.9, age >= 4 ? 0xbdb6a8 : 0xd8c8a4);
  for (let i = 0; i < 5; i++) p.cyl(0.04, 0.05, 0.12, 6, -1.7 + i * 0.85, 0.1, 2.05, O.darkwood);
  // l'entrepôt à arcades derrière le quai
  const wh = age >= 4 ? 0.6 : 0.45;
  p.box(3.3, 1.5, 1.1, -0.2, -1.5, -1.1, stone);
  p.box(3.2, wh, 1.0, -0.2, 0, -1.1, wall);
  for (let i = 0; i < 5; i++) arch(p, 0.32, wh * 0.75, -1.5 + i * 0.65, 0, -0.594, O.hole, 0, 0.02, i % 2 === 1);
  parapet(p, 3.2, 1.0, wh, wall, 0.05, 0.04, -0.2, -1.1);
  // ballots et jarres
  for (let i = 0; i < 4; i++) p.box(0.18, 0.13, 0.16, -1.2 + i * 0.24, 0.1, 0.5, [0xb88a5a, 0x9a6a3a, 0xc8a070, 0x7a8a5a][i]);
  // le phare (Médiéval et après) : tour ronde au bout du quai
  if (age >= 2) {
    const H = age >= 4 ? 2.1 : 1.6;
    p.cyl(0.24, 0.3, H, 10, 1.65, 0.1, 1.75, age === 5 ? O.white : wall);
    if (age === 3) for (let k = 1; k < 4; k++) p.cyl(0.255, 0.27, 0.08, 10, 1.65, 0.1 + k * H * 0.25, 1.75, O.turq);
    p.cyl(0.32, 0.32, 0.05, 10, 1.65, 0.1 + H, 1.75, O.stone);
    p.cyl(0.15, 0.15, 0.16, 8, 1.65, 0.15 + H, 1.75, 0xffd88a, true);
    dome(p, 0.18, 0.18, 1.65, 0.31 + H, 1.75, age >= 4 ? O.white : O.turq, false, 8);
  }
  if (age === 3) {
    // grue de bois
    p.box(0.08, 1.1, 0.08, -1.6, 0.1, 1.5, O.darkwood);
    p.box(0.05, 0.05, 1.0, -1.6, 1.1, 1.85, O.darkwood, 0, false, 0);
  }
  if (age >= 4) {
    // conteneurs, grue métallique
    for (let i = 0; i < 3; i++) for (let j = 0; j < (i === 1 ? 2 : 1); j++) p.box(0.7, 0.24, 0.28, -0.9 + i * 0.4, 0.1 + j * 0.24, 1.0 + (i % 2) * 0.3, [0xc0442a, 0x2f6f9e, 0xd9a43c][(i + j) % 3]);
    p.box(0.08, 1.6, 0.08, 0.6, 0.1, 1.9, age === 5 ? O.white : 0xd9a43c);
    p.box(0.06, 0.06, 1.6, 0.6, 1.66, 1.7, age === 5 ? O.white : 0xd9a43c);
    if (age === 5) p.box(3.4, 0.02, 0.04, 0, 0.13, 2.1, O.turqL, 0, 'neon');
  }
  // le boutre amarré le long du quai
  oBoat(p, age, -0.2, 2.55);
}

/** Boutre (puis navire de son âge) amarré, de flanc, en (x, z) */
function oBoat(p: Parts, age: number, x: number, z: number) {
  const hull = age <= 3 ? 0x8a6040 : age === 4 ? 0xeeeeee : 0xf4f4f4;
  frustum(p, 1.7, 0.38, 2.1, 0.5, 0.2, x, -0.08, z, hull);
  p.box(1.6, 0.02, 0.36, x, 0.12, z, age <= 3 ? 0xb08a60 : 0xd8d8d8);
  if (age <= 3) {
    p.cyl(0.02, 0.025, 1.0, 4, x + 0.1, 0.12, z, O.darkwood);
    // voile latine : un triangle sur une longue vergue penchée
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.7, 0.1, 0, 0.6, 0.9, 0, 0.3, 0.05, 0, -0.7, 0.1, 0, 0.3, 0.05, 0, 0.6, 0.9, 0]), 3));
    p.add(g, x + 0.1, 0.25, z + 0.03, 0xf2ead6);
  } else {
    p.box(0.6, 0.22, 0.3, x - 0.3, 0.12, z, age === 5 ? O.glass : 0xf8f8f8, 0, age === 5);
    if (age === 5) p.box(1.8, 0.02, 0.02, x, 0.02, z + 0.26, O.turqL, 0, 'neon');
  }
}

// ---------- Le peuple asiatique ----------

const A = {
  red: 0xa53a2c, lacquer: 0xb8402f, darkwood: 0x4e3426, timber: 0x7a5a40, plaster: 0xefe8da, stone: 0xb0aba0, darkstone: 0x7d7a74,
  tile: 0x56606a, tileG: 0x4a7566, tileB: 0x3f5f7a, thatch: 0xc9ae74, gold: 0xd8b04a, paper: 0xf6e4b6, lantern: 0xe0503a,
  wattle: 0xd6c09a, maple: 0xc4553a, pine: 0x3f6b48, bamboo: 0x7fa85a, water: 0x5fb3c4, concrete: 0xd8d6d0, glass: 0x9cc8d6,
  green: 0x6e9a50, moss: 0x7aa060,
};
const aTile = (age: number, v: number) => (age <= 1 ? A.thatch : age === 2 ? pick([A.tile, A.tile, A.tileG], v) : age === 3 ? pick([A.tile, A.tileG, A.tileB], v) : pick([A.tileG, A.tile], v));

/** Lanterne ronde allumée la nuit */
const lantern = (p: Parts, x: number, y: number, z: number, r = 0.045, col = A.lantern) => { p.sphere(r, x, y, z, col, 0, 1.2); p.box(r * 1.6, r * 2.6, r * 1.6, x, y - r * 1.3, z, col, 0, true); };

function aHouse(p: Parts, age: number, v: number, w: number, d: number) {
  const r = mulberry32(v + 23), W = w * 0.86, D = d * 0.8;
  if (age <= 2) {
    // socle de pierre, poteaux de bois, murs de torchis (Antiquité) ou d'enduit blanc (Médiéval), toit courbe
    const h = 0.3 + r() * 0.06, wall = age <= 1 ? A.wattle : A.plaster;
    p.box(W + 0.06, 0.05, D + 0.06, 0, 0, 0, A.stone);
    p.box(W, h, D, 0, 0.05, 0, wall);
    for (const sx of [-1, 0, 1]) p.box(0.035, h, 0.035, sx * (W / 2 - 0.02), 0.05, D / 2 + 0.005, A.darkwood);
    p.box(W, 0.03, 0.02, 0, 0.05 + h - 0.03, D / 2 + 0.008, A.darkwood);
    p.box(0.14, 0.2, 0.012, -W * 0.18, 0.05, D / 2 + 0.008, A.darkwood);
    p.box(0.16, 0.1, 0.012, W * 0.22, 0.17, D / 2 + 0.008, A.paper, 0, true);
    curvedRoof(p, W + 0.22, D + 0.24, 0.3, 0, 0.05 + h, 0, aTile(age, v), age <= 1 ? 0x9a8050 : 0x2e3236, age >= 2);
    // une aile en équerre sur les grandes parcelles (maison à cour)
    if (age >= 2 && w > 1 && v % 3 === 0) { p.box(0.38, h, D * 0.5, W / 2 - 0.19, 0.05, D * 0.62, wall); curvedRoof(p, 0.52, D * 0.6, 0.22, W / 2 - 0.19, 0.05 + h, D * 0.62, aTile(age, v)); }
    if (age <= 1 && v % 4 === 0) for (let i = 0; i < 3; i++) p.box(0.02, 0.18, 0.12, -W / 2 - 0.08, 0.05, -D * 0.2 + i * 0.14, 0xb09a60);
    return;
  }
  if (age === 3) {
    // maison-boutique à étage : rez ouvert sur la rue, enseigne verticale, lanternes, balcon de bois
    const h1 = 0.3, h2 = 0.28, wall = [A.plaster, 0xe6dccb, 0xd9cdb8][v % 3];
    p.box(W + 0.06, 0.05, D + 0.06, 0, 0, 0, A.stone);
    p.box(W, h1, D, 0, 0.05, 0, wall);
    p.box(W * 0.8, h1 * 0.75, 0.012, 0, 0.05, D / 2 + 0.006, 0x3a2a22);
    p.box(W * 0.7, h1 * 0.5, 0.014, 0, 0.08, D / 2 + 0.008, A.paper, 0, true);
    p.box(W + 0.16, 0.02, 0.16, 0, 0.05 + h1, D / 2 + 0.06, aTile(age, v));
    p.box(W, h2, D * 0.92, 0, 0.07 + h1, -D * 0.04, wall);
    for (const sx of [-1, 1]) p.box(0.1, 0.07, 0.012, sx * W * 0.24, 0.17 + h1, D * 0.42 + 0.006, A.paper, 0, true);
    p.box(W, 0.04, 0.012, 0, 0.12 + h1, D * 0.5, A.darkwood);
    for (let i = 0; i < 6; i++) p.box(0.012, 0.06, 0.012, -W / 2 + 0.04 + i * (W - 0.08) / 5, 0.08 + h1, D * 0.5, A.darkwood);
    curvedRoof(p, W + 0.2, D + 0.2, 0.26, 0, 0.07 + h1 + h2, -D * 0.04, aTile(age, v));
    // enseigne rouge et lanternes
    p.box(0.05, 0.36, 0.1, W / 2 + 0.03, 0.12, D / 2 - 0.05, A.red);
    p.box(0.052, 0.3, 0.06, W / 2 + 0.03, 0.15, D / 2 - 0.05, 0xf3d27a, 0, true);
    for (const sx of [-1, 1]) lantern(p, sx * W * 0.38, 0.05 + h1 - 0.06, D / 2 + 0.07);
    return;
  }
  if (age === 4) {
    // immeuble de béton à balcons, enseignes lumineuses, couronne de toit courbe
    const floors = 3 + Math.floor(r() * 4), fh = 0.26, h = floors * fh, wall = [A.concrete, 0xe8e2d6, 0xcfd3d6][v % 3];
    p.box(W, h, D, 0, 0, 0, wall);
    windowsAround(p, W, D, 0, floors, fh, 0xf0e2b0, 0.22, 0.1, 0.12, true, wall);
    for (let f = 1; f < floors; f++) p.box(W * 0.7, 0.03, 0.08, 0, f * fh, D / 2 + 0.04, 0xbababa);
    p.box(0.06, Math.min(h * 0.6, 0.9), 0.14, W / 2 + 0.03, fh, D * 0.3, [0xff5a8a, 0x5ae0ff, 0xffd060][v % 3], 0, 'neon');
    p.box(W * 0.6, 0.12, 0.02, 0, 0.12, D / 2 + 0.012, [0xff4040, 0x40c0ff, 0xffa030][(v >> 1) % 3], 0, 'neon');
    if (v % 2) curvedRoof(p, W * 0.8, D * 0.7, 0.2, 0, h, 0, A.tileG);
    else { p.box(0.15, 0.12, 0.15, W * 0.2, h, -D * 0.2, 0xbcbcbc); parapet(p, W, D, h, wall, 0.05, 0.03); }
    return;
  }
  // âge futuriste : tour élancée à étages de toits courbes, terrasses plantées, liserés de néon
  const floors = 5 + Math.floor(r() * 5), fh = 0.24, h = floors * fh, tw = W * 0.82, td = D * 0.82, roofC = pick([A.tileG, A.tileB, 0x8a5a4a, A.tileG], v);
  p.box(W, 0.1, D, 0, 0, 0, 0xd8d8d0);
  for (let f = 0, y = 0.1; f < floors; f++, y += fh) {
    p.box(tw, fh * 0.75, td, 0, y, 0, A.glass, 0, true);
    p.box(tw + 0.02, fh * 0.25, td + 0.02, 0, y + fh * 0.75, 0, 0xf2f0ea);
    if (f % 3 === 2) { p.box(tw + 0.2, 0.025, td + 0.2, 0, y + fh * 0.98, 0, roofC); p.box(tw + 0.21, 0.012, 0.012, 0, y + fh, td / 2 + 0.1, 0x5ae0ff, 0, 'neon'); p.box(tw * 0.8, 0.04, 0.06, 0, y + fh, td / 2 + 0.05, A.moss); }
  }
  curvedRoof(p, tw + 0.12, td + 0.12, 0.24, 0, 0.1 + h, 0, roofC);
}

/** Pagode de `n` étages, de côté `w` à la base */
function pagoda(p: Parts, n: number, w: number, x: number, z: number, y0: number, age: number) {
  const tile = age <= 1 ? 0x6a5a48 : age === 2 ? A.tile : age === 3 ? A.tileG : A.tileG, wall = age <= 1 ? A.timber : A.lacquer;
  let y = y0, s = w;
  p.box(w + 0.3, 0.12, w + 0.3, x, y, z, A.stone);
  y += 0.12;
  for (let i = 0; i < n; i++) {
    const hh = i === 0 ? 0.5 : 0.34;
    p.box(s * 0.7, hh, s * 0.7, x, y, z, wall);
    for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      p.box(0.12, hh * 0.45, 0.012, x + Math.sin(ry) * (s * 0.35 + 0.006), y + hh * 0.3, z + Math.cos(ry) * (s * 0.35 + 0.006), age <= 1 ? 0x3a2a22 : A.paper, ry, age >= 2);
    }
    if (i > 0) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.box(0.02, 0.06, 0.02, x + Math.sin(a) * s * 0.42, y - 0.02, z + Math.cos(a) * s * 0.42, A.darkwood); }
    y += hh;
    curvedRoof(p, s * 1.2, s * 1.2, 0.22, x, y, z, tile, 0x2e3236, true);
    if (age >= 3) for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) lantern(p, x + sx * s * 0.58, y - 0.02, z + sz * s * 0.58, 0.03);
    if (age === 5) p.box(s * 1.2, 0.012, 0.012, x, y + 0.01, z + s * 0.6, 0xffc060, 0, 'neon');
    y += 0.1;
    s *= 0.84;
  }
  // flèche : anneaux dorés et pointe
  p.cyl(0.02, 0.025, 0.7, 5, x, y, z, A.gold);
  for (let k = 0; k < 6; k++) p.cyl(0.07 - k * 0.008, 0.07 - k * 0.008, 0.03, 8, x, y + 0.12 + k * 0.08, z, A.gold);
  p.sphere(0.05, x, y + 0.72, z, A.gold);
}

/** Salle sur terrasse : colonnes rouges, murs à claire-voie, toit courbe (double avant-toit si `double`) */
function hall(p: Parts, w: number, d: number, h: number, x: number, z: number, y0: number, age: number, v: number, double = false) {
  const col = age <= 1 ? A.timber : A.red, wall = age <= 1 ? A.wattle : A.plaster, tile = aTile(Math.max(age, 2), v);
  p.box(w + 0.3, 0.14, d + 0.3, x, y0, z, A.stone);
  const y = y0 + 0.14;
  p.box(w * 0.86, h, d * 0.8, x, y, z, wall);
  for (let i = 0; i <= 5; i++) {
    const cx = x - w * 0.45 + (w * 0.9 * i) / 5;
    p.cyl(0.035, 0.035, h, 6, cx, y, z + d * 0.45, col);
    if (i < 5) p.box(w * 0.14, h * 0.6, 0.012, cx + w * 0.09, y + h * 0.12, z + d * 0.4 + 0.006, A.paper, 0, age >= 2);
  }
  p.box(w * 0.94, 0.06, 0.06, x, y + h - 0.06, z + d * 0.45, age <= 1 ? A.darkwood : A.gold);
  // l'escalier
  p.box(0.6, 0.07, 0.2, x, y0, z + d / 2 + 0.22, A.stone);
  if (double) {
    curvedRoof(p, w + 0.4, d + 0.4, 0.22, x, y + h, z, tile, 0x2e3236, true);
    p.box(w * 0.7, 0.2, d * 0.5, x, y + h + 0.16, z, col);
    curvedRoof(p, w * 0.92, d * 0.72, 0.42, x, y + h + 0.34, z, tile);
  } else curvedRoof(p, w + 0.35, d + 0.4, 0.46, x, y + h, z, tile, age <= 1 ? 0x9a8050 : 0x2e3236, age >= 2);
}

function aTemple(p: Parts, age: number, v: number) {
  const wallC = age <= 1 ? A.wattle : A.plaster;
  p.box(4.8, 0.06, 4.8, 0, 0, 0, A.stone);
  // l'enceinte basse à chaperon de tuiles, et sa porte
  for (const [x, z, w, d] of [[-1.5, 2.35, 1.8, 0.1], [1.5, 2.35, 1.8, 0.1], [0, -2.35, 4.8, 0.1], [-2.35, 0, 0.1, 4.6], [2.35, 0, 0.1, 4.6]] as const) {
    p.box(w, 0.4, d, x, 0.06, z, age >= 4 ? 0xb8402f : wallC);
    p.box(w + 0.08, 0.04, d + 0.12, x, 0.46, z, aTile(Math.max(2, age), v));
  }
  for (const sx of [-0.55, 0.55]) p.cyl(0.05, 0.05, 0.6, 6, sx, 0.06, 2.35, A.red);
  curvedRoof(p, 1.6, 0.5, 0.3, 0, 0.66, 2.35, aTile(Math.max(2, age), v));
  // la salle de prière devant, la pagode derrière
  hall(p, 2.4, 1.3, 0.55, 0, 0.75, 0.06, age, v, age >= 2);
  pagoda(p, age <= 1 ? 3 : 5, 1.15, 0, -1.3, 0.06, age);
  // brûle-parfum, pins et lanternes de pierre
  p.cyl(0.12, 0.08, 0.16, 6, 0, 0.06, 1.9, 0x6a5a48); p.cyl(0.14, 0.14, 0.03, 6, 0, 0.22, 1.9, 0x6a5a48);
  for (const sx of [-1, 1]) {
    pine(p, sx * 1.7, 1.6, 0.9);
    pine(p, sx * 1.75, -1.8, 0.8);
    p.box(0.1, 0.24, 0.1, sx * 0.9, 0.06, 1.9, A.stone); p.box(0.13, 0.08, 0.13, sx * 0.9, 0.3, 1.9, 0xfff0c0, 0, age >= 2); frustum(p, 0.2, 0.2, 0.02, 0.02, 0.1, sx * 0.9, 0.38, 1.9, A.stone);
  }
  if (age >= 3) for (let i = 0; i < 6; i++) lantern(p, -1.2 + i * 0.48, 0.6, 1.6, 0.035);
}

function aPalace(p: Parts, age: number, v: number) {
  const wallC = age <= 1 ? A.wattle : age >= 4 ? A.lacquer : A.red;
  // l'enceinte, la porte à pavillon, la cour
  for (const [x, z, w, d] of [[-1.85, 2.35, 2.1, 0.12], [1.85, 2.35, 2.1, 0.12], [0, -2.35, 5.8, 0.12], [-2.85, 0, 0.12, 4.6], [2.85, 0, 0.12, 4.6]] as const) {
    p.box(w, 0.5, d, x, 0, z, wallC);
    p.box(w + 0.1, 0.05, d + 0.14, x, 0.5, z, aTile(Math.max(2, age), v));
  }
  p.box(1.6, 0.6, 0.4, 0, 0, 2.35, wallC);
  for (const sx of [-1, 1]) p.box(0.5, 0.42, 0.02, sx * 0.4, 0, 2.56, age <= 1 ? A.darkwood : A.lacquer);
  hall(p, 1.4, 0.4, 0.2, 0, 2.35, 0.6, age, v, false);
  p.box(5.4, 0.03, 4.2, 0, 0, 0.2, age <= 1 ? 0xc8b890 : 0xd6d0c2);
  // trois terrasses de pierre blanche et la grande salle à double avant-toit
  for (let i = 0; i < 3; i++) p.box(4.2 - i * 0.4, 0.14, 2.6 - i * 0.25, 0, i * 0.14, -1.0 - i * 0.08, i === 0 ? 0xc8c4ba : 0xe2ded4);
  for (let i = 0; i < 3; i++) p.box(0.7, 0.14 * (i + 1), 0.15, 0, 0, 0.42 - i * 0.15, 0xe2ded4);
  hall(p, 3.0, 1.5, 0.62, 0, -1.15, 0.42, age, v, age >= 2);
  // salles latérales
  for (const sx of [-1, 1]) hall(p, 0.9, 1.6, 0.4, sx * 2.2, 0.6, 0, age, v + sx, false);
  // arbres de la cour, lanternes
  for (const sx of [-1, 1]) { roundTree(p, sx * 1.1, 1.6, 0.55, sx > 0 ? A.maple : 0x6a9a50); p.box(0.1, 0.22, 0.1, sx * 0.6, 0, 1.0, A.stone); p.box(0.13, 0.08, 0.13, sx * 0.6, 0.22, 1.0, 0xfff0c0, 0, true); }
  if (age >= 3) for (let i = 0; i < 6; i++) lantern(p, -1.4 + i * 0.56, 0.95, -0.25, 0.04);
  if (age === 5) for (const sx of [-1, 1]) p.box(0.012, 0.012, 1.6, sx * 1.7, 1.33, -1.15, 0xffc060, 0, 'neon');
}

function aMarket(p: Parts, age: number, v: number) {
  p.box(3.8, 0.04, 3.8, 0, 0, 0, age <= 1 ? 0xbcae8a : 0xc8c2b4);
  if (age <= 2) {
    // étals sous de petits toits courbes, paniers et lanternes
    for (const z of [-1.0, 1.0])
      for (let i = 0; i < 4; i++) {
        const x = -1.35 + i * 0.9;
        p.box(0.7, 0.16, 0.4, x, 0, z, A.timber);
        for (const s of [-1, 1]) p.box(0.03, 0.4, 0.03, x + s * 0.32, 0, z - 0.18, A.darkwood);
        curvedRoof(p, 0.86, 0.6, 0.16, x, 0.4, z, age <= 1 ? A.thatch : aTile(2, i + v), 0x2e3236, age >= 2);
        for (let j = 0; j < 3; j++) p.cyl(0.07, 0.06, 0.06, 6, x - 0.2 + j * 0.2, 0.16, z + 0.05, [0x8a9a3a, 0xc8783a, 0xd8c070, 0x9a3a2a][(i + j) % 4]);
        if (age >= 2) lantern(p, x + 0.3, 0.33, z + 0.28, 0.03);
      }
    return;
  }
  // halle couverte : rez à boutiques, étage en retrait, double toit
  const wall = age === 3 ? A.plaster : age === 4 ? A.concrete : A.glass, h = age === 3 ? 0.42 : 0.55;
  p.box(3.4, h, 2.6, 0, 0, 0, wall, 0, age === 5);
  for (const ry of [0, Math.PI]) for (let i = 0; i < 6; i++) { const x = -1.4 + i * 0.56, c = Math.cos(ry); p.box(0.4, h * 0.6, 0.012, x * c, 0.02, c * 1.306, i % 2 ? A.paper : 0xf0d8a0, ry, true); }
  if (age === 3) {
    p.box(3.6, 0.03, 2.8, 0, h, 0, A.tile);
    p.box(2.8, 0.3, 2.0, 0, h + 0.03, 0, A.plaster);
    windowRows(p, 2.8, 1.004, h + 0.03, 1, 0.3, A.paper, 6, 0.14, 0.1);
    curvedRoof(p, 3.2, 2.4, 0.4, 0, h + 0.33, 0, aTile(3, v));
    for (let i = 0; i < 7; i++) lantern(p, -1.5 + i * 0.5, h - 0.05, 1.42, 0.035);
    p.box(0.08, 0.5, 0.14, 1.75, 0.05, 1.3, A.red);
  } else {
    curvedRoof(p, 3.6, 2.8, 0.5, 0, h, 0, age === 4 ? A.tileG : 0x9fd8d0);
    for (let i = 0; i < 4; i++) p.box(0.06, 0.45, 0.14, -1.6 + i * 1.06, 0.1, 1.38, [0xff5a8a, 0x5ae0ff, 0xffd060, 0x9aff6a][(i + v) % 4], 0, 'neon');
  }
}

function aGarden(p: Parts, age: number, v: number, w: number, d: number) {
  const big = w > 3, W = w * 0.95, D = d * 0.95, r = mulberry32(v + 5);
  p.box(W, 0.02, D, 0, 0, 0, 0x7aa060);
  if (big) for (const [x, z, ww, dd] of [[0, D / 2, W, 0.08], [0, -D / 2, W, 0.08], [W / 2, 0, 0.08, D], [-W / 2, 0, 0.08, D]] as const) {
    if (z > 0 && Math.abs(x) < 0.01) { p.box(W * 0.4, 0.34, 0.08, -W * 0.3, 0, z, A.plaster); p.box(W * 0.4, 0.34, 0.08, W * 0.3, 0, z, A.plaster); continue; }
    p.box(ww, 0.34, dd, x, 0, z, A.plaster);
    p.box(ww + 0.06, 0.035, dd + 0.08, x, 0.34, z, aTile(Math.max(2, age), v));
  }
  // l'étang, ses rochers et son pont en arc
  const pw = W * 0.5, pd = D * 0.4, px = -W * 0.1, pz = D * 0.05;
  p.cyl(1, 1, 0.03, 10, px, 0.005, pz, A.water);
  p.add(new THREE.CylinderGeometry(1, 1, 0.03, 10).scale(pw * 0.6, 1, pd * 0.6).translate(0, 0.015, 0), px, 0.01, pz, A.water);
  for (let i = 0; i < 5; i++) { const a = r() * 6.28; p.sphere(0.06 + r() * 0.08, px + Math.cos(a) * pw * 0.6, 0.03, pz + Math.sin(a) * pd * 0.6, [0x8a8a84, 0x9a968c, 0x76746e][i % 3], 0, 0.7); }
  for (let i = 0; i < 7; i++) { const t = i / 6, y = Math.sin(t * Math.PI) * 0.16; p.box(0.12, 0.03, 0.2, px - 0.3 + t * 0.6, 0.03 + y, pz, age <= 1 ? A.timber : A.red); }
  // le pavillon
  if (big || v % 2) {
    const hx = W * 0.25, hz = -D * 0.25;
    p.box(0.6, 0.06, 0.6, hx, 0, hz, A.stone);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.025, 0.025, 0.36, 5, hx + sx * 0.22, 0.06, hz + sz * 0.22, age <= 1 ? A.timber : A.red);
    curvedSpire(p, 0.7, 0.32, hx, 0.42, hz, aTile(Math.max(2, age), v));
    if (age >= 3) lantern(p, hx, 0.36, hz, 0.035);
  }
  // érables, pins, bambous
  for (let i = 0; i < (big ? 6 : 3); i++) {
    const x = (r() - 0.5) * W * 0.8, z = (r() - 0.5) * D * 0.8;
    if (Math.hypot((x - px) / pw, (z - pz) / pd) < 0.7) continue;
    const k = i % 3;
    if (k === 0) roundTree(p, x, z, 0.55, A.maple);
    else if (k === 1) pine(p, x, z, 0.6);
    else for (let j = 0; j < 4; j++) p.cyl(0.012, 0.012, 0.6, 4, x + (j % 2) * 0.05, 0, z + (j >> 1) * 0.05, A.bamboo);
  }
  if (age === 5) p.box(W * 0.6, 0.012, 0.012, 0, 0.36, D / 2, 0x5ae0ff, 0, 'neon');
}

function aWorkshop(p: Parts, age: number, v: number, w: number, d: number) {
  const W = w * 0.9, D = d * 0.85;
  if (age <= 2) {
    // four de potier : longue voûte de brique sur la pente, cheminée, poteries qui sèchent
    p.box(W * 0.8, 0.18, D * 0.35, 0, 0, -D * 0.2, 0xa8644a, 0, false, 0.12);
    p.cyl(0.05, 0.06, 0.5, 6, W * 0.38, 0, -D * 0.2, 0x8a5440);
    p.box(W * 0.5, 0.25, D * 0.4, -W * 0.15, 0, D * 0.25, A.wattle);
    curvedRoof(p, W * 0.66, D * 0.55, 0.2, -W * 0.15, 0.25, D * 0.25, aTile(age, v));
    for (let i = 0; i < 4; i++) p.cyl(0.035, 0.045, 0.08, 6, W * 0.2 + (i % 2) * 0.09, 0, D * 0.25 + (i >> 1) * 0.1, 0x6a8aa0);
    return;
  }
  if (age === 3) {
    p.box(W, 0.36, D, 0, 0, 0, 0xb87a5e);
    curvedRoof(p, W + 0.12, D + 0.12, 0.2, 0, 0.36, 0, A.tile);
    p.cyl(0.06, 0.08, 0.9, 6, W * 0.32, 0, -D * 0.3, 0x9a5a44);
    windowRows(p, W, D / 2 + 0.004, 0, 1, 0.36, A.paper, 3, 0.12, 0.12);
    return;
  }
  p.box(W, 0.42, D, 0, 0, 0, age === 4 ? A.concrete : 0xeeeeea);
  windowRows(p, W, D / 2 + 0.004, 0, 1, 0.42, 0xf0e2b0, 3, 0.16, 0.12);
  if (age === 4) p.box(W * 0.4, 0.1, 0.02, 0, 0.3, D / 2 + 0.012, 0xff5a8a, 0, 'neon');
  else for (let i = 0; i < 2; i++) p.box(W * 0.42, 0.02, D * 0.6, -W * 0.22 + i * W * 0.44, 0.42, 0, 0x2a4a6a, 0, false, 0.25);
}

function aPort(p: Parts, age: number, v: number) {
  // jetée de bois (Antiquité) puis quai de pierre ; entrepôt au toit courbe ; jonque amarrée
  const quay = age <= 1 ? A.timber : 0xa8a49a;
  if (age <= 1) {
    p.box(4, 0.06, 2.3, 0, 0.06, 0.9, quay);
    for (let i = 0; i < 5; i++) for (const z of [0, 1.9]) p.cyl(0.04, 0.04, 1.6, 5, -1.8 + i * 0.9, -1.5, z, A.darkwood);
  } else { p.box(4, 1.6, 2.4, 0, -1.5, 0.9, quay); p.box(4.04, 0.05, 2.44, 0, 0.08, 0.9, age >= 4 ? 0x9a9a96 : 0xbab6ac); }
  for (let i = 0; i < 5; i++) p.cyl(0.04, 0.05, 0.12, 6, -1.7 + i * 0.85, 0.1, 2.05, A.darkwood);
  const wh = age >= 4 ? 0.55 : 0.42, wall = age <= 1 ? A.wattle : age >= 4 ? A.concrete : A.plaster;
  p.box(3.3, 1.5, 1.1, -0.2, -1.5, -1.1, A.stone);
  p.box(3.2, wh, 1.0, -0.2, 0, -1.1, wall);
  for (let i = 0; i < 4; i++) p.box(0.42, wh * 0.7, 0.012, -1.4 + i * 0.8, 0, -0.594, age <= 1 ? 0x3a2a22 : A.darkwood);
  windowRows(p, 3.2, -0.594 + 0.006, wh * 0.6, 1, 0.3, A.paper, 6, 0.1, 0.06);
  curvedRoof(p, 3.5, 1.3, 0.34, -0.2, wh, -1.1, aTile(age, v), 0x2e3236, age >= 2);
  for (let i = 0; i < 4; i++) p.box(0.18, 0.14, 0.16, -1.2 + i * 0.24, 0.1, 0.5, [0x9a7a5a, 0x7a6a4a, 0xb8a070, 0x6a7a5a][i]);
  if (age >= 2) for (let i = 0; i < 4; i++) lantern(p, -1.5 + i * 0.9, wh - 0.06, -0.52, 0.035);
  if (age === 3) { p.box(0.08, 1.1, 0.08, -1.6, 0.1, 1.5, A.darkwood); p.box(0.05, 0.05, 1.0, -1.6, 1.1, 1.85, A.darkwood); }
  if (age >= 4) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < (i === 1 ? 2 : 1); j++) p.box(0.7, 0.24, 0.28, -0.9 + i * 0.4, 0.1 + j * 0.24, 1.0 + (i % 2) * 0.3, [0x3f7a6a, 0xc0442a, 0x2f5f9e][(i + j) % 3]);
    p.box(0.08, 1.6, 0.08, 0.6, 0.1, 1.9, age === 5 ? 0xf2f0ea : 0xc0442a);
    p.box(0.06, 0.06, 1.6, 0.6, 1.66, 1.7, age === 5 ? 0xf2f0ea : 0xc0442a);
    if (age === 5) p.box(3.4, 0.02, 0.04, 0, 0.13, 2.1, 0x5ae0ff, 0, 'neon');
  }
  // la tour de guet du port (Médiéval et après)
  if (age >= 2) { p.box(0.6, 0.9, 0.6, 1.65, 0.1, 1.7, A.stone); hall(p, 0.5, 0.5, 0.26, 1.65, 1.7, 1.0, age, v, false); }
  aBoat(p, age, -0.2, 2.55);
}

/** Jonque (puis navire de son âge) amarrée, de flanc */
function aBoat(p: Parts, age: number, x: number, z: number) {
  const hull = age <= 3 ? 0x6a4a34 : 0xeeeeee;
  frustum(p, 1.6, 0.4, 2.0, 0.52, 0.2, x, -0.08, z, hull);
  p.box(0.36, 0.16, 0.48, x - 0.85, 0.08, z, hull);
  if (age <= 3) {
    for (const [mx, mh, sw] of [[0.25, 1.0, 0.6], [-0.35, 0.75, 0.45]] as const) {
      p.cyl(0.02, 0.025, mh, 4, x + mx, 0.12, z, A.darkwood);
      // voile à lattes : panneaux étagés
      for (let i = 0; i < 4; i++) p.box(sw, mh * 0.18, 0.012, x + mx - 0.05, 0.3 + i * mh * 0.19, z + 0.03, i % 2 ? 0xc87a4a : 0xb86a3a);
    }
  } else {
    p.box(0.6, 0.22, 0.3, x - 0.3, 0.12, z, age === 5 ? A.glass : 0xf8f8f8, 0, age === 5);
    if (age === 5) p.box(1.8, 0.02, 0.02, x, 0.02, z + 0.27, 0x5ae0ff, 0, 'neon');
  }
}

// ---------- Champs, remparts ----------

function field(p: Parts, people: People, age: number, v: number, w: number, d: number) {
  const W = w * 0.95, D = d * 0.95;
  if (people === 'asie') {
    // rizières : bassins d'eau à diguettes, pousses vertes
    const n = 2;
    for (let i = 0; i < n; i++) {
      const z = -D / 2 + (D / n) * (i + 0.5);
      p.box(W, 0.05, D / n - 0.06, 0, 0, z, 0x7a6a4a);
      p.box(W - 0.08, 0.052, D / n - 0.14, 0, 0, z, 0x9cc4a6);
      for (let k = 0; k < 6; k++) p.box(W - 0.2, 0.065, 0.05, 0, 0, z - (D / n) * 0.35 + k * (D / n) * 0.14, age >= 4 ? 0x9ac85a : 0x84b850);
    }
    return;
  }
  // cultures en sillons, palmiers-dattiers au bord
  p.box(W, 0.03, D, 0, 0, 0, 0xb89a6a);
  const rows = Math.round(W / 0.25), col = [0x8aa850, 0xc8b858, 0x6f9a4a][v % 3];
  for (let i = 0; i < rows; i++) p.box(0.1, 0.06, D - 0.15, -W / 2 + (W / rows) * (i + 0.5), 0, 0, col);
  for (let i = 0; i < 2; i++) palm(p, (i ? 1 : -1) * W * 0.46, D * 0.48, 0.65, v + i);
  if (age <= 2) { p.box(0.04, 0.3, 0.04, W * 0.48, 0, -D * 0.4, O.wood); p.box(0.4, 0.03, 0.03, W * 0.48, 0.3, -D * 0.4, O.wood); }
}

/** Couleurs des remparts : pierre ou brique de leur âge */
export function wallColors(people: People, age: number) {
  if (people === 'orient') return age <= 1 ? { wall: O.mud, top: O.mudDark } : age >= 4 ? { wall: 0xe8dcc0, top: O.stone } : { wall: 0xdcc69a, top: O.stone };
  return age <= 1 ? { wall: 0xb0a48a, top: 0x8a7a5a } : { wall: 0x9a968e, top: age >= 4 ? A.tileG : A.tile };
}

/** Pan de rempart de longueur `len` le long de x, centré, plongeant sous le sol de `sink` cases (pentes) */
function wallPiece(p: Parts, people: People, age: number, len: number, sink: number) {
  const { wall, top } = wallColors(people, age), h = people === 'orient' ? (age <= 1 ? 0.6 : 0.85) : age <= 1 ? 0.55 : 0.8, t = 0.36;
  p.box(len, h + sink, t, 0, -sink, 0, wall);
  p.box(len, 0.04, t + 0.06, 0, h, 0, top);
  if (people === 'orient') { merlons(p, len, h + 0.04, t / 2 - 0.03, wall, 0.22, age >= 2); merlons(p, len, h + 0.04, -t / 2 + 0.03, wall, 0.22, age >= 2); }
  else if (age <= 1) for (let i = 0; i < Math.floor(len / 0.3); i++) p.box(0.04, 0.12, t + 0.02, -len / 2 + 0.15 + i * 0.3, h - 0.06, 0, A.darkwood);
  else { merlons(p, len, h + 0.04, t / 2 - 0.03, wall, 0.24); frustum(p, len, t + 0.12, len, 0.02, 0.07, 0, h + 0.12, 0, top); }
  if (age === 5) p.box(len, 0.02, 0.02, 0, h + 0.05, t / 2 + 0.02, people === 'orient' ? O.turqL : 0x5ae0ff, 0, 'neon');
}

function tower(p: Parts, people: People, age: number, v: number) {
  const { wall, top } = wallColors(people, age), sink = 1.5;
  if (people === 'orient') {
    const h = age <= 1 ? 0.95 : 1.2;
    if (age <= 1) { p.box(0.8, h + sink, 0.8, 0, -sink, 0, wall); merlons(p, 0.8, h, 0.37, wall, 0.2); merlons(p, 0.8, h, -0.37, wall, 0.2); return; }
    p.cyl(0.5, 0.56, h + sink, 10, 0, -sink, 0, wall);
    p.cyl(0.56, 0.5, 0.06, 10, 0, h, 0, top);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.12, 0.1, 0.06, Math.sin(a) * 0.5, h + 0.06, Math.cos(a) * 0.5, wall, a); }
    if (v % 3 === 0 || age >= 3) dome(p, 0.28, 0.3, 0, h + 0.06, 0, age === 5 ? O.glass : O.turq, false, 8, age === 5 ? 'neon' : false);
    p.box(0.05, 0.1, 0.02, 0, h * 0.6, 0.55, O.win, 0, true);
    return;
  }
  const h = age <= 1 ? 0.85 : 1.1;
  p.box(0.9, h + sink, 0.9, 0, -sink, 0, wall);
  p.box(0.96, 0.05, 0.96, 0, h, 0, top);
  if (age <= 1) { for (let i = 0; i < 4; i++) p.box(0.04, 0.15, 0.9, -0.36 + i * 0.24, h, 0, A.darkwood); return; }
  // pavillon de guet au toit courbe
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.025, 0.025, 0.3, 5, sx * 0.3, h + 0.05, sz * 0.3, A.red);
  p.box(0.5, 0.16, 0.5, 0, h + 0.05, 0, A.plaster);
  p.box(0.1, 0.07, 0.012, 0, h + 0.1, 0.256, A.paper, 0, true);
  curvedSpire(p, 0.9, 0.36, 0, h + 0.35, 0, top);
  if (age >= 3) lantern(p, 0.36, h + 0.28, 0.36, 0.035);
}

function gate(p: Parts, people: People, age: number, v: number) {
  const { wall, top } = wallColors(people, age), sink = 1.5;
  if (people === 'orient') {
    const h = age <= 1 ? 0.9 : 1.25;
    for (const sx of [-1, 1]) {
      if (age <= 1) { p.box(0.7, h + sink + 0.2, 0.9, sx * 0.85, -sink, 0, wall); merlons(p, 0.7, h + 0.2, 0.42, wall, 0.2, false, 0); continue; }
      p.cyl(0.45, 0.5, h + sink + 0.25, 10, sx * 0.85, -sink, 0, wall);
      dome(p, 0.3, 0.36, sx * 0.85, h + 0.25, 0, age === 5 ? O.glass : O.turq, false, 8, age === 5 ? 'neon' : false);
    }
    p.box(1.1, h + sink, 0.8, 0, -sink, 0, wall);
    arch(p, 0.6, h * 0.72, 0, 0, 0.405, O.hole);
    arch(p, 0.6, h * 0.72, 0, 0, -0.405, O.hole, Math.PI);
    if (age >= 2) { p.box(0.86, 0.06, 0.03, 0, h * 0.75, 0.41, O.turq); merlons(p, 1.1, h, 0.37, wall, 0.22, true); }
    return;
  }
  const h = age <= 1 ? 0.75 : 1.0;
  p.box(2.2, h + sink, 1.0, 0, -sink, 0, wall);
  arch(p, 0.56, h * 0.72, 0, 0, 0.505, 0x3a2a22);
  arch(p, 0.56, h * 0.72, 0, 0, -0.505, 0x3a2a22, Math.PI);
  p.box(2.26, 0.05, 1.06, 0, h, 0, top);
  if (age <= 1) { for (let i = 0; i < 4; i++) p.box(0.04, 0.18, 1.0, -0.9 + i * 0.6, h, 0, A.darkwood); return; }
  // le pavillon de la porte, à double toit
  p.box(1.7, 0.36, 0.7, 0, h + 0.05, 0, age >= 4 ? A.lacquer : A.red);
  windowRows(p, 1.7, 0.356, h + 0.05, 1, 0.36, A.paper, 5, 0.12, 0.1);
  curvedRoof(p, 2.2, 1.1, 0.22, 0, h + 0.41, 0, top);
  p.box(1.4, 0.14, 0.5, 0, h + 0.55, 0, A.red);
  curvedRoof(p, 1.8, 0.9, 0.36, 0, h + 0.67, 0, top);
  if (age >= 3) for (const sx of [-1, 1]) lantern(p, sx * 0.45, h - 0.05, 0.56, 0.045);
}

// ---------- Cache ----------

const cache = new Map<string, THREE.BufferGeometry>();

/** Géométrie (corps et lumières fondus, voir `mergeLit`) d'un lot de la ville, à l'âge `age` (1 à 5) */
export function townModel(people: People, kind: TownKind, age: number, v: number, w: number, d: number): THREE.BufferGeometry {
  const a = Math.max(1, Math.min(5, age));
  const qw = Math.round(w * 5) / 5, qd = Math.round(d * 5) / 5;
  const vv = kind === 'house' || kind === 'workshop' ? v % 12 : kind === 'garden' || kind === 'field' ? v % 4 : v % 3;
  const key = `${people}|${kind}|${a}|${vv}|${qw}|${qd}`;
  let g = cache.get(key);
  if (g) return g;
  const p = new Parts(), o = people === 'orient';
  switch (kind) {
    case 'house': (o ? oHouse : asian.aHouse)(p, a, vv, qw, qd); break;
    case 'workshop': (o ? oWorkshop : asian.aWorkshop)(p, a, vv, qw, qd); break;
    case 'temple': o ? oTemple(p, a) : asian.aTemple(p, a, vv); break;
    case 'palace': o ? oPalace(p, a) : asian.aPalace(p, a, vv); break;
    case 'market': (o ? oMarket : asian.aMarket)(p, a, vv); break;
    case 'teahouse': asian.aTeahouse(p, a, vv, qw, qd); break;
    case 'port': (o ? oPort : aPort)(p, a, vv); break;
    case 'caravan': oCaravan(p, a, vv); break;
    case 'baths': oBaths(p, a, vv); break;
    case 'garden': (o ? oGarden : aGarden)(p, a, vv, qw, qd); break;
    case 'field': field(p, people, a, vv, qw, qd); break;
    case 'tower': tower(p, people, a, vv); break;
    case 'gate': gate(p, people, a, vv); break;
  }
  const { body, glow } = p.build();
  g = mergeLit(body, glow) ?? body;
  cache.set(key, g);
  return g;
}

/** Pan de rempart (longueur arrondie au quart de case) */
export function townWall(people: People, age: number, len: number): THREE.BufferGeometry {
  const a = Math.max(1, Math.min(5, age)), L = Math.max(0.25, Math.round(len * 4) / 4);
  const key = `${people}|wall|${a}|${L}`;
  let g = cache.get(key);
  if (g) return g;
  const p = new Parts();
  wallPiece(p, people, a, L, 1.5);
  const { body, glow } = p.build(false);
  g = mergeLit(body, glow) ?? body;
  cache.set(key, g);
  return g;
}

/** Socle de pierre d'un lot en pente : une boîte d'une case de côté et de haut, posée sur y = 0 (étirée par l'instance) */
export function plinthGeo(people: People): THREE.BufferGeometry {
  const key = `${people}|plinth`;
  let g = cache.get(key);
  if (g) return g;
  const p = new Parts();
  p.box(1, 1, 1, 0, 0, 0, people === 'orient' ? 0xc8b48a : 0x9a968c);
  const { body } = p.build(false);
  g = mergeLit(body, null) ?? body;
  cache.set(key, g);
  return g;
}

/** Nombre de triangles d'une géométrie (pour les tests) */
export const triCount = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
