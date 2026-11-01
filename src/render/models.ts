import * as THREE from 'three';
import { Parts } from './parts';
import { KindId } from '../build/catalog';

export const C = {
  cream: 0xf4e8d0, pink: 0xf1c9c4, mint: 0xcde8d6, sky: 0xcfe2f0, butter: 0xf8e5a6, lav: 0xd8cdea, white: 0xf7f3ec,
  terracotta: 0xe39a86, thatch: 0xdcc080, slate: 0x8e9bb4, brown: 0xb48a68, red: 0xd8786c, teal: 0x86c4b8,
  wood: 0xb08968, darkwood: 0x7a6355, stone: 0xcfcac2, darkstone: 0x9d9890, dirt: 0xcdb08a, gold: 0xe8c66a,
  green: 0x9ccf92, darkgreen: 0x7fb87f, door: 0x7a5a48, win: 0x9db4c6, brick: 0xd98f80, darkbrick: 0xb4685c,
  glass: 0xbfe0ee, roofdark: 0x6f7c96, metal: 0x9aa3ad, flame: 0xffb15c, water: 0x8fd0e0, hide: 0xd9b99b,
};
const WALLS = [C.cream, C.pink, C.mint, C.sky, C.butter, C.lav];
const ROOFS = [C.terracotta, C.teal, C.red, C.slate, C.brown, C.thatch];

export interface ModelOpts { v: number; L: boolean; R: boolean; F: boolean }
/** Géométries d'un bâtiment, et sommets de ses cheminées (x, y, z, sorte : 0 foyer, 1 feu de bois, 2 forge ou usine) */
export interface Model { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; smoke: number[] }

/** Cheminées du modèle en cours de construction */
let smokeOut: number[] = [];
function smoke(x: number, y: number, z: number, kind: number) { smokeOut.push(x, y, z, kind); }

/** Assombrit une couleur (sous-faces, bordures) */
const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const SHUTTERS = [C.teal, C.red, C.darkgreen, C.slate];

interface RoofOpts {
  /** largeur des murs (le long du faîtage, x local) et profondeur (z local) */
  w: number; d: number; h: number;
  color: number; wall: number;
  ry?: number;
  /** longueur des pans (débords compris) et décalage de leur centre le long du faîtage */
  len?: number; dx?: number;
  /** débord à l'égout */
  ov?: number;
}

/** Toit à deux pans épais avec débords ; les pignons gardent la couleur des murs */
function roof(p: Parts, x: number, y: number, z: number, o: RoofOpts) {
  const ry = o.ry ?? 0, len = o.len ?? o.w + 0.12, dx = o.dx ?? 0, ov = o.ov ?? 0.07, t = 0.035;
  p.gable(o.w, o.h, o.d, x, y, z, o.wall, ry);
  const hd = o.d / 2, a = Math.atan2(o.h, hd);
  for (const sg of [1, -1]) {
    const g = new THREE.BoxGeometry(len, t, Math.hypot(hd, o.h) + ov).rotateX(sg * a);
    g.translate(dx, o.h / 2 + Math.cos(a) * t / 2 - Math.sin(a) * ov / 2, sg * (hd / 2 + Math.sin(a) * t / 2 + Math.cos(a) * ov / 2));
    p.add(g.rotateY(ry), x, y, z, o.color);
  }
  p.add(new THREE.BoxGeometry(len, 0.03, 0.06).translate(dx, o.h + 0.012, 0).rotateY(ry), x, y, z, dark(o.color, 0.82));
}

/** Rondin couché le long de x */
function log(p: Parts, len: number, r: number, x: number, y: number, z: number, ry = 0, color = C.wood) {
  p.add(new THREE.CylinderGeometry(r, r, len, 6).rotateZ(Math.PI / 2), x, y + r, z, color, ry);
}

function house(p: Parts, age: number, o: ModelOpts) {
  const wall = WALLS[o.v % 6], roofC = ROOFS[(o.v * 5 + 2) % 6];
  if (age === 0) {
    // hutte de peaux, chaume épais, perches au faîte, tas de bois
    p.cyl(0.3, 0.32, 0.26, 7, 0, 0, -0.02, C.hide);
    p.cone(0.48, 0.12, 7, 0, 0.21, -0.02, dark(C.thatch, 0.7));
    p.cone(0.46, 0.52, 7, 0, 0.26, -0.02, C.thatch);
    p.box(0.14, 0.2, 0.04, 0, 0, 0.29, C.door);
    p.box(0.08, 0.12, 0.03, 0, 0.03, 0.31, C.win, 0, true);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 4), s * 0.03, 0.8, -0.02, C.darkwood, 0, false, s * 0.35);
    // le foyer fume par le trou du faîte
    smoke(0, 0.84, -0.02, 1);
    log(p, 0.2, 0.028, 0.31, 0, 0.27, 0.5); log(p, 0.2, 0.028, 0.35, 0, 0.21, 0.5); log(p, 0.2, 0.028, 0.33, 0.048, 0.24, 0.5);
    p.sphere(0.035, -0.13, 0.01, 0.35, C.darkstone, 0, 0.6); p.sphere(0.03, 0.14, 0.01, 0.37, C.stone, 0, 0.6);
    return;
  }
  const x0 = -0.36 - (o.L ? 0.14 : 0), x1 = 0.36 + (o.R ? 0.14 : 0);
  const w = x1 - x0, cx = (x0 + x1) / 2, d = 0.5, zc = -0.04;
  const zf = zc + d / 2 + 0.006;
  const rw = w + (o.L ? 0 : 0.08) + (o.R ? 0 : 0.08), rcx = cx + ((o.R ? 0 : 0.08) - (o.L ? 0 : 0.08)) / 2;
  if (age === 4) {
    const tall = o.v % 3 === 2;
    const h = tall ? 1.0 : 0.6;
    const ww = tall && !o.L && !o.R ? 0.62 : w;
    p.box(ww + 0.02, 0.04, d + 0.08, cx, 0, zc, C.darkstone);
    p.box(ww, h - 0.04, d + 0.06, cx, 0.04, zc, o.v % 2 ? C.white : C.cream);
    p.box(ww + 0.06, 0.05, d + 0.12, cx, h, zc, C.darkstone);
    for (let y = 0.1; y < h - 0.1; y += 0.25) {
      p.box(ww * 0.8, 0.15, 0.015, cx, y - 0.01, zc + d / 2 + 0.03, C.roofdark);
      p.box(ww * 0.78, 0.13, 0.02, cx, y, zc + d / 2 + 0.035, C.win, 0, true);
      if (y > 0.2) p.box(ww * 0.82, 0.015, 0.06, cx, y - 0.02, zc + d / 2 + 0.06, C.metal);
    }
    p.box(0.1, 0.18, 0.02, cx + ww * 0.3, 0, zc + d / 2 + 0.035, C.door);
    p.box(ww * 0.6, 0.06, d * 0.6, cx, h + 0.05, zc, C.darkgreen);
    if (!o.F) { p.sphere(0.07, cx - 0.25, 0.04, 0.42, C.green, 0, 0.9); p.sphere(0.06, cx + 0.2, 0.04, 0.4, C.pink, 0, 0.9); }
    return;
  }
  const h = age === 3 ? 0.55 : age === 2 ? 0.42 : 0.32;
  const wc = age === 3 ? C.brick : wall;
  const rc = age === 3 ? C.slate : roofC;
  const frame = age === 3 ? C.white : age === 2 ? C.darkwood : C.wood;
  const shutter = SHUTTERS[o.v % 4];
  // soubassement de pierre, murs, toit
  p.box(w + 0.03, 0.05, d + 0.03, cx, 0, zc, age === 3 ? C.darkstone : C.stone);
  p.box(w, h - 0.05, d, cx, 0.05, zc, wc);
  const roofH = age === 3 ? 0.3 : age === 2 ? 0.34 : 0.22;
  roof(p, cx, h, zc, { w, d, h: roofH, color: rc, wall: age === 2 ? C.cream : wc, len: rw, dx: rcx - cx });
  if (age === 2) {
    // colombages : poteaux d'angle, lisse au-dessus des fenêtres, sablière
    for (const bx of [x0 + 0.02, x1 - 0.02]) p.box(0.035, h - 0.05, 0.02, bx, 0.05, zf, C.darkwood);
    p.box(w, 0.03, 0.02, cx, 0.3, zf, C.darkwood);
    p.box(w + 0.01, 0.04, d + 0.04, cx, h - 0.04, zc, C.darkwood);
  }
  // cheminée
  if (age === 3) {
    p.box(0.09, 0.32, 0.09, rcx + rw * 0.25, h + 0.05, zc, C.darkbrick);
    p.box(0.11, 0.03, 0.11, rcx + rw * 0.25, h + 0.37, zc, C.darkstone);
    smoke(rcx + rw * 0.25, h + 0.42, zc, 0);
  } else if (o.v % 2 === 0) {
    p.box(0.08, roofH + 0.1, 0.08, rcx + rw * 0.27, h, zc - 0.1, C.stone);
    p.box(0.1, 0.025, 0.1, rcx + rw * 0.27, h + roofH + 0.1, zc - 0.1, C.darkstone);
    smoke(rcx + rw * 0.27, h + roofH + 0.15, zc - 0.1, 0);
  }
  // porte : encadrement, battant, marche
  p.box(0.155, 0.215, 0.014, cx, 0, zf - 0.003, frame);
  p.box(0.12, 0.19, 0.02, cx, 0, zf, C.door);
  p.box(0.2, 0.025, 0.07, cx, 0, zf + 0.035, C.stone);
  // fenêtres : cadre, vitre (s'allume la nuit), appui, volets au Moyen Âge
  const win = (x: number, y: number) => {
    p.box(0.135, 0.155, 0.014, x, y - 0.018, zf - 0.003, frame);
    p.box(0.1, 0.12, 0.02, x, y, zf, C.win, 0, true);
    p.box(0.16, 0.022, 0.045, x, y - 0.03, zf + 0.012, frame);
    if (age === 2) for (const s of [-1, 1]) p.box(0.04, 0.14, 0.014, x + s * 0.09, y - 0.01, zf + 0.004, shutter);
  };
  const floors = age === 3 ? [0.14, 0.36] : [0.14];
  const off = age === 2 ? 0.2 : 0.23;
  for (const y of floors)
    for (const sx of [-off, off]) {
      const wx = cx + sx * (w > 0.9 ? 1.2 : 1);
      if (Math.abs(wx - x0) < 0.1 || Math.abs(wx - x1) < 0.1) continue;
      win(wx, y);
    }
  if (age === 3) win(cx, 0.36);
  // jardinet clôturé quand la maison ne donne pas sur une route
  if (!o.F) {
    for (let i = 0; i < 5; i++) p.box(0.03, 0.1, 0.03, -0.4 + i * 0.2, 0, 0.46, C.wood);
    p.box(0.84, 0.025, 0.02, 0, 0.06, 0.46, C.wood);
    p.sphere(0.045, -0.2, 0.03, 0.37, C.pink, 0, 0.8);
    p.sphere(0.04, 0.24, 0.03, 0.36, C.butter, 0, 0.8);
    p.sphere(0.05, 0.36, 0.03, 0.33, C.darkgreen, 0, 0.8);
  }
}

/** Botte de foin ronde couchée */
function bale(p: Parts, x: number, z: number, ry = 0) {
  p.add(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 9).rotateX(Math.PI / 2), x, 0.075, z, C.gold, ry);
}
/** Meule de foin */
function stack(p: Parts, x: number, z: number, s = 1) {
  p.cyl(0.11 * s, 0.15 * s, 0.14 * s, 7, x, 0, z, C.thatch);
  p.cone(0.12 * s, 0.16 * s, 7, x, 0.14 * s, z, C.gold);
}
/** Clôture de piquets entre deux points */
function fence(p: Parts, x0: number, z0: number, x1: number, z1: number) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.16));
  for (let i = 0; i <= n; i++) p.box(0.022, 0.12, 0.022, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, C.wood);
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  for (const y of [0.04, 0.09]) p.box(len, 0.018, 0.012, (x0 + x1) / 2, y, (z0 + z1) / 2, C.wood, ry);
}
/** Charrette chargée de foin (orientée selon x) */
function cart(p: Parts, x: number, z: number) {
  p.box(0.24, 0.04, 0.14, x, 0.07, z, C.wood);
  for (const s of [-1, 1]) {
    p.box(0.24, 0.05, 0.012, x, 0.11, z + s * 0.065, C.wood);
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8).rotateX(Math.PI / 2), x, 0.06, z + s * 0.085, C.darkwood);
    p.box(0.16, 0.014, 0.014, x + 0.19, 0.07, z + s * 0.04, C.wood);
  }
  p.box(0.2, 0.06, 0.11, x, 0.11, z, C.gold);
}
/** Petit tracteur (orienté selon x) */
function tractor(p: Parts, x: number, z: number) {
  p.box(0.2, 0.08, 0.1, x, 0.06, z, C.red);
  p.box(0.09, 0.1, 0.1, x - 0.05, 0.14, z, C.red);
  p.box(0.07, 0.06, 0.102, x - 0.05, 0.17, z, C.glass);
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.035, 9).rotateX(Math.PI / 2), x - 0.06, 0.07, z + s * 0.07, C.darkstone);
    p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8).rotateX(Math.PI / 2), x + 0.07, 0.04, z + s * 0.065, C.darkstone);
  }
  p.cyl(0.012, 0.012, 0.08, 5, x + 0.05, 0.14, z, C.metal);
}

function farm(p: Parts, age: number) {
  if (age === 0) {
    // grenier sur pilotis, séchoir à gerbes, meules
    const gx = -0.18, gz = -0.18;
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.035, 0.15, 0.035, gx + a * 0.11, 0, gz + b * 0.11, C.darkwood);
    p.box(0.3, 0.03, 0.3, gx, 0.15, gz, C.wood);
    p.cyl(0.13, 0.13, 0.16, 7, gx, 0.18, gz, C.hide);
    p.cone(0.27, 0.1, 7, gx, 0.3, gz, dark(C.thatch, 0.7));
    p.cone(0.26, 0.28, 7, gx, 0.33, gz, C.thatch);
    p.box(0.03, 0.3, 0.03, 0.08, 0, 0.14, C.wood); p.box(0.03, 0.3, 0.03, 0.42, 0, 0.14, C.wood);
    p.box(0.38, 0.025, 0.025, 0.25, 0.28, 0.14, C.wood);
    for (let i = 0; i < 4; i++) p.cyl(0.035, 0.02, 0.13, 5, 0.13 + i * 0.08, 0.15, 0.14, C.gold);
    stack(p, 0.3, -0.24); stack(p, 0.02, 0.36, 0.75);
    p.cyl(0.05, 0.04, 0.06, 6, -0.32, 0, 0.3, C.brown);
  } else if (age === 1) {
    // ferme de bois et chaume, meule, charrette, enclos
    p.box(0.5, 0.04, 0.34, -0.08, 0, -0.22, C.stone);
    p.box(0.46, 0.2, 0.3, -0.08, 0.04, -0.22, C.wood);
    roof(p, -0.08, 0.24, -0.22, { w: 0.46, d: 0.3, h: 0.2, color: C.thatch, wall: C.wood });
    p.box(0.1, 0.15, 0.02, -0.08, 0, -0.065, C.door);
    p.box(0.08, 0.07, 0.02, -0.24, 0.1, -0.065, C.win, 0, true);
    stack(p, 0.34, -0.22);
    cart(p, 0.1, 0.24);
    fence(p, -0.45, 0.44, 0.45, 0.44); fence(p, -0.45, 0.06, -0.45, 0.44);
  } else if (age === 2) {
    // grange rouge à pignon sur rue, bottes de foin, clôture
    const bx = -0.06, bz = -0.16;
    p.box(0.6, 0.05, 0.42, bx, 0, bz, C.stone);
    p.box(0.56, 0.3, 0.38, bx, 0.05, bz, C.red);
    roof(p, bx, 0.35, bz, { w: 0.38, d: 0.56, h: 0.3, color: C.darkbrick, wall: C.red, ry: Math.PI / 2, len: 0.48 });
    const zf = bz + 0.19 + 0.006;
    p.box(0.22, 0.24, 0.014, bx, 0.05, zf - 0.003, C.white);
    p.box(0.18, 0.21, 0.02, bx, 0.05, zf, dark(C.red, 0.8));
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.27, 0.016, 0.01), bx, 0.155, zf + 0.012, C.white, 0, false, s * 0.86);
    p.box(0.09, 0.08, 0.02, bx, 0.4, zf - 0.003, C.win, 0, true);
    bale(p, 0.33, -0.28, 0.3); bale(p, 0.33, -0.1, -0.2); bale(p, 0.3, 0.2, 1.2);
    fence(p, -0.45, 0.44, 0.45, 0.44);
    stack(p, -0.32, 0.26, 0.8);
  } else if (age === 3) {
    // grange, silo métallique, bottes, tracteur
    const bx = -0.14, bz = -0.18;
    p.box(0.48, 0.05, 0.38, bx, 0, bz, C.darkstone);
    p.box(0.44, 0.28, 0.34, bx, 0.05, bz, C.red);
    roof(p, bx, 0.33, bz, { w: 0.44, d: 0.34, h: 0.2, color: C.roofdark, wall: C.red, len: 0.52 });
    p.box(0.16, 0.2, 0.02, bx, 0.05, bz + 0.176, C.white);
    p.cyl(0.11, 0.11, 0.58, 10, 0.3, 0, -0.22, C.metal);
    for (const y of [0.15, 0.3, 0.45]) p.cyl(0.113, 0.113, 0.015, 10, 0.3, y, -0.22, dark(C.metal, 0.8));
    p.sphere(0.11, 0.3, 0.58, -0.22, C.metal, 1, 0.6);
    bale(p, -0.3, 0.25, 0.2); bale(p, -0.14, 0.3, -0.1);
    tractor(p, 0.22, 0.24);
  } else {
    // serre vitrée, bacs de culture
    p.box(0.84, 0.04, 0.6, 0, 0, -0.1, C.stone);
    p.box(0.8, 0.2, 0.56, 0, 0.04, -0.1, C.glass);
    roof(p, 0, 0.24, -0.1, { w: 0.8, d: 0.56, h: 0.14, color: 0xdff3f6, wall: C.glass, len: 0.82, ov: 0.02 });
    for (const x of [-0.4, -0.13, 0.13, 0.4]) p.box(0.02, 0.2, 0.58, x, 0.04, -0.1, C.white);
    p.box(0.5, 0.06, 0.02, 0, 0.1, 0.19, C.green, 0, true);
    for (const x of [-0.25, 0.25]) { p.box(0.34, 0.07, 0.12, x, 0, 0.36, C.wood); p.box(0.3, 0.03, 0.09, x, 0.07, 0.36, C.darkgreen); }
  }
}

function well(p: Parts, age: number) {
  if (age <= 2) {
    p.cyl(0.22, 0.24, 0.2, 8, 0, 0, 0, C.stone);
    p.cyl(0.17, 0.17, 0.02, 8, 0, 0.19, 0, C.water);
    if (age === 0) { p.box(0.03, 0.4, 0.03, -0.2, 0, 0, C.wood); p.box(0.03, 0.4, 0.03, 0.2, 0, 0, C.wood); p.box(0.44, 0.03, 0.03, 0, 0.4, 0, C.wood); }
    else {
      p.box(0.04, 0.42, 0.04, -0.21, 0, 0, C.wood); p.box(0.04, 0.42, 0.04, 0.21, 0, 0, C.wood);
      if (age === 1) p.gable(0.56, 0.18, 0.42, 0, 0.4, 0, C.terracotta);
      else p.pyramid(0.56, 0.24, 0.5, 0, 0.4, 0, C.slate, 0);
      p.box(0.07, 0.07, 0.07, 0, 0.22, 0.0, C.wood);
    }
  } else if (age === 3) {
    p.box(0.4, 0.1, 0.2, 0.0, 0, 0.1, C.darkstone);
    p.box(0.14, 0.2, 0.14, -0.12, 0, -0.1, C.metal);
    p.cyl(0.035, 0.05, 0.4, 6, -0.12, 0.2, -0.1, C.roofdark);
    p.box(0.18, 0.03, 0.04, -0.04, 0.55, -0.1, C.roofdark);
    p.box(0.3, 0.02, 0.14, 0.05, 0.1, 0.1, C.water);
  } else {
    p.cyl(0.4, 0.42, 0.14, 12, 0, 0, 0, C.stone);
    p.cyl(0.34, 0.34, 0.02, 12, 0, 0.13, 0, C.water);
    p.cyl(0.05, 0.07, 0.3, 6, 0, 0.1, 0, C.white);
    p.cone(0.12, 0.14, 6, 0, 0.4, 0, 0xcdeef7);
    p.cyl(0.2, 0.2, 0.03, 10, 0, 0.14, 0, C.white);
  }
}

function workshop(p: Parts, age: number, o: ModelOpts) {
  if (age === 0) {
    p.cone(0.38, 0.5, 5, -0.12, 0, -0.1, C.hide);
    p.box(0.16, 0.1, 0.12, 0.28, 0, 0.2, C.darkstone); p.box(0.1, 0.06, 0.08, 0.28, 0.1, 0.2, C.stone);
    p.box(0.04, 0.34, 0.04, -0.34, 0, 0.3, C.wood); p.box(0.04, 0.34, 0.04, 0.0, 0, 0.3, C.wood); p.box(0.4, 0.03, 0.03, -0.17, 0.32, 0.3, C.wood);
    p.box(0.1, 0.1, 0.02, -0.12, 0, 0.12, C.win, 0, true);
  } else if (age === 1) {
    p.cyl(0.26, 0.3, 0.2, 8, -0.12, 0, -0.12, C.terracotta);
    p.sphere(0.22, -0.12, 0.2, -0.12, C.terracotta, 1, 0.75);
    p.box(0.1, 0.1, 0.03, -0.12, 0.02, 0.17, C.win, 0, true);
    p.box(0.3, 0.2, 0.26, 0.28, 0, 0.22, C.cream); roof(p, 0.28, 0.2, 0.22, { w: 0.3, d: 0.26, h: 0.14, color: C.thatch, wall: C.cream, ov: 0.05 });
    for (const [x, z] of [[-0.3, 0.3], [-0.12, 0.38], [0.0, 0.3]]) p.cyl(0.045, 0.06, 0.1, 6, x, 0, z, C.terracotta);
  } else if (age === 2) {
    p.box(0.66, 0.04, 0.52, 0, 0, -0.04, C.darkstone); p.box(0.64, 0.3, 0.5, 0, 0.04, -0.04, C.stone); roof(p, 0, 0.34, -0.04, { w: 0.64, d: 0.5, h: 0.26, color: C.slate, wall: C.stone });
    p.box(0.1, 0.5, 0.1, 0.22, 0.2, -0.1, C.darkstone);
    smoke(0.22, 0.72, -0.1, 2);
    p.box(0.16, 0.16, 0.02, -0.1, 0.02, 0.215, C.flame, 0, true);
    p.box(0.14, 0.08, 0.1, 0.3, 0, 0.36, C.darkstone); p.box(0.08, 0.05, 0.06, 0.3, 0.08, 0.36, C.metal);
  } else if (age === 3) {
    p.box(0.8, 0.36, 0.6, 0, 0, 0.02, C.brick);
    for (const x of [-0.27, 0, 0.27]) p.gable(0.27, 0.13, 0.62, x, 0.36, 0.02, C.slate);
    p.cyl(0.06, 0.08, 0.75, 8, 0.3, 0.3, -0.18, C.darkbrick); p.cyl(0.07, 0.07, 0.04, 8, 0.3, 1.0, -0.18, C.darkstone);
    smoke(0.3, 1.06, -0.18, 2);
    for (const x of [-0.26, 0, 0.26]) p.box(0.14, 0.12, 0.02, x, 0.12, 0.33, C.win, 0, true);
  } else {
    p.box(0.72, 0.78, 0.52, 0, 0, 0, 0xc9dde8);
    p.box(0.78, 0.05, 0.58, 0, 0.78, 0, C.white);
    for (let y = 0.08; y < 0.7; y += 0.2) p.box(0.6, 0.12, 0.02, 0, y, 0.265, C.win, 0, true);
    p.box(0.2, 0.1, 0.2, 0.2, 0.83, 0, C.darkgreen);
  }
}

function gather(p: Parts, age: number, o: ModelOpts) {
  if (age === 0) {
    p.cyl(0.14, 0.15, 0.015, 8, 0, 0, 0, dark(C.dirt, 0.55));
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; p.sphere(0.055, Math.cos(a) * 0.19, 0.02, Math.sin(a) * 0.19, i % 2 ? C.darkstone : C.stone, 0, 0.7); }
    p.box(0.3, 0.05, 0.05, 0, 0.02, 0, C.darkwood, 0.6); p.box(0.3, 0.05, 0.05, 0, 0.02, 0, C.wood, -0.6);
    p.cone(0.1, 0.28, 5, 0, 0.05, 0, C.flame, true);
    smoke(0, 0.36, 0, 1);
    log(p, 0.32, 0.04, 0, 0, -0.38); log(p, 0.32, 0.04, -0.34, 0, 0.17, 1.1); log(p, 0.32, 0.04, 0.34, 0, 0.17, -1.1);
  } else if (age === 1) {
    p.cyl(0.46, 0.46, 0.04, 12, 0, 0, 0, 0xe6dccb);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; p.cyl(0.04, 0.045, 0.34, 6, Math.cos(a) * 0.34, 0.04, Math.sin(a) * 0.34, C.white); }
    p.box(0.14, 0.14, 0.14, 0, 0.04, 0, C.stone); p.sphere(0.07, 0, 0.2, 0, C.white, 1);
    p.box(0.3, 0.05, 0.1, 0, 0.04, 0.3, C.stone); p.box(0.3, 0.05, 0.1, 0, 0.04, -0.3, C.stone);
  } else if (age === 2) {
    const cols = [C.pink, C.mint, C.butter];
    for (const [x, z] of [[0.36, 0.3], [-0.38, 0.28]]) { p.cyl(0.05, 0.05, 0.11, 8, x, 0, z, C.wood); p.cyl(0.052, 0.052, 0.015, 8, x, 0.05, z, C.darkwood); }
    [[-0.22, -0.2], [0.22, -0.2], [0, 0.22]].forEach(([x, z], i) => {
      p.box(0.3, 0.12, 0.18, x, 0.03, z, C.wood);
      p.gable(0.38, 0.1, 0.3, x, 0.3, z, cols[i], i === 2 ? 0 : 0);
      p.box(0.025, 0.28, 0.025, x - 0.16, 0.03, z + 0.1, C.wood); p.box(0.025, 0.28, 0.025, x + 0.16, 0.03, z + 0.1, C.wood);
      p.sphere(0.04, x, 0.15, z + 0.02, C.red, 0); p.sphere(0.04, x + 0.08, 0.15, z, C.gold, 0);
    });
  } else if (age === 3) {
    p.cyl(0.2, 0.21, 0.015, 12, 0, 0, 0, C.dirt);
    p.cyl(0.14, 0.14, 0.06, 10, 0, 0.0, 0, C.stone); p.cyl(0.1, 0.1, 0.02, 10, 0, 0.05, 0, C.water);
    for (const [x, z, c] of [[-0.3, -0.3, C.pink], [0.32, 0.3, C.butter], [-0.05, -0.36, C.lav]] as [number, number, number][]) { p.sphere(0.05, x, 0.02, z, c, 0, 0.7); p.sphere(0.04, x + 0.06, 0.02, z + 0.03, C.darkgreen, 0, 0.7); }
    for (const [x, z] of [[-0.3, 0.1], [0.3, -0.1]]) { p.cone(0.12, 0.3, 6, x, 0.17, z, C.darkgreen); p.cyl(0.02, 0.025, 0.2, 5, x, 0, z, C.wood); }
    p.box(0.26, 0.04, 0.08, 0, 0.07, 0.34, C.wood); p.box(0.26, 0.06, 0.02, 0, 0.11, 0.38, C.wood);
    for (const x of [-0.11, 0.11]) p.box(0.02, 0.07, 0.07, x, 0, 0.34, C.darkstone);
  } else {
    p.cyl(0.46, 0.47, 0.03, 12, 0, 0, 0, 0xe9e2d4);
    p.cyl(0.04, 0.05, 0.3, 6, 0, 0.03, 0, C.wood); p.sphere(0.24, 0, 0.45, 0, C.darkgreen, 1, 0.8);
    for (const a of [0.6, 2.4, 4.2]) p.box(0.22, 0.05, 0.07, Math.cos(a) * 0.32, 0.03, Math.sin(a) * 0.32, C.wood, -a);
    p.box(0.1, 0.04, 0.1, 0.3, 0.03, 0.3, C.pink); p.box(0.1, 0.04, 0.1, -0.32, 0.03, -0.3, C.butter);
  }
}

function temple(p: Parts, age: number) {
  if (age === 1) {
    p.box(0.88, 0.06, 0.74, 0, 0, 0, C.stone); p.box(0.78, 0.06, 0.64, 0, 0.06, 0, 0xe6dccb);
    for (const [x, z] of [[-0.3, 0.22], [0.3, 0.22], [-0.3, -0.22], [0.3, -0.22], [0, 0.22], [0, -0.22]]) p.cyl(0.045, 0.05, 0.36, 7, x, 0.12, z, C.white);
    p.box(0.74, 0.04, 0.6, 0, 0.48, 0, C.white);
    p.gable(0.8, 0.2, 0.68, 0, 0.52, 0, C.terracotta, 0);
    p.box(0.16, 0.2, 0.2, 0, 0.12, -0.05, C.stone);
    p.box(0.08, 0.1, 0.02, 0, 0.14, 0.06, C.win, 0, true);
  } else if (age === 2) {
    p.box(0.52, 0.04, 0.74, -0.05, 0, -0.04, C.stone); p.box(0.5, 0.34, 0.72, -0.05, 0.04, -0.04, C.cream); roof(p, -0.05, 0.38, -0.04, { w: 0.72, d: 0.5, h: 0.28, color: C.slate, wall: C.cream, ry: Math.PI / 2 });
    p.box(0.24, 0.7, 0.24, 0.0, 0, 0.3, C.stone); p.pyramid(0.3, 0.38, 0.3, 0.0, 0.7, 0.3, C.slate);
    p.box(0.02, 0.14, 0.02, 0, 1.08, 0.3, C.gold); p.box(0.08, 0.02, 0.02, 0, 1.15, 0.3, C.gold);
    p.box(0.08, 0.14, 0.02, 0, 0.3, 0.425, C.win, 0, true);
    for (const z of [-0.2, 0.05]) p.box(0.02, 0.14, 0.08, 0.205, 0.12, z, C.win, 0, true);
    p.box(0.1, 0.18, 0.02, 0, 0, 0.425, C.door);
  } else if (age === 3) {
    p.box(0.6, 0.55, 0.85, 0, 0, -0.02, C.stone); roof(p, 0, 0.55, -0.02, { w: 0.85, d: 0.6, h: 0.32, color: C.roofdark, wall: C.stone, ry: Math.PI / 2 });
    for (const x of [-0.2, 0.2]) { p.box(0.2, 0.85, 0.2, x, 0, 0.36, C.cream); p.pyramid(0.26, 0.5, 0.26, x, 0.85, 0.36, C.roofdark); }
    p.box(0.14, 0.14, 0.02, 0, 0.35, 0.425 + 0.015, C.win, 0, true);
    p.box(0.12, 0.2, 0.02, 0, 0, 0.45, C.door);
    for (const z of [-0.3, 0, 0.2]) { p.box(0.02, 0.18, 0.1, 0.31, 0.15, z, C.win, 0, true); p.box(0.02, 0.18, 0.1, -0.31, 0.15, z, C.win, 0, true); }
  } else {
    p.cyl(0.42, 0.44, 0.1, 12, 0, 0, 0, C.stone);
    p.cyl(0.34, 0.34, 0.34, 12, 0, 0.1, 0, C.white);
    p.sphere(0.36, 0, 0.44, 0, 0xcfe6f2, 1, 0.7);
    for (let y = 0.15; y < 0.4; y += 0.14) p.box(0.5, 0.07, 0.02, 0, y, 0.345, C.win, 0, true);
    p.cone(0.03, 0.18, 5, 0, 0.7, 0, C.gold);
  }
}

function mill(p: Parts, age: number) {
  if (age === 2) {
    p.cyl(0.17, 0.26, 0.6, 8, 0, 0, 0, C.cream); p.cone(0.26, 0.28, 8, 0, 0.6, 0, C.red);
    p.box(0.1, 0.14, 0.02, 0, 0, 0.255, C.door); p.box(0.08, 0.08, 0.02, 0, 0.32, 0.18, C.win, 0, true);
    p.box(0.07, 0.8, 0.02, 0, 0.1, 0.24, C.wood); p.box(0.8, 0.07, 0.02, -0.4, 0.46, 0.24, C.wood);
    p.box(0.14, 0.34, 0.015, 0, 0.5, 0.25, C.white); p.box(0.14, 0.34, 0.015, 0, 0.1, 0.25, C.white);
    p.box(0.34, 0.14, 0.015, 0.1, 0.43, 0.25, C.white); p.box(0.34, 0.14, 0.015, -0.44, 0.43, 0.25, C.white);
    p.cyl(0.04, 0.04, 0.06, 6, 0, 0.43, 0.24, C.darkwood);
  } else if (age === 3) {
    p.box(0.74, 0.4, 0.56, 0, 0, 0.0, C.brick); p.box(0.78, 0.05, 0.6, 0, 0.4, 0, C.roofdark);
    p.cyl(0.08, 0.1, 0.95, 8, -0.22, 0.4, -0.12, C.darkbrick); p.cyl(0.09, 0.09, 0.05, 8, -0.22, 1.3, -0.12, C.darkstone);
    p.cyl(0.06, 0.07, 0.6, 8, 0.1, 0.4, -0.12, C.darkbrick);
    smoke(-0.22, 1.37, -0.12, 2); smoke(0.1, 1.02, -0.12, 2);
    for (const x of [-0.22, 0.0, 0.22]) p.box(0.12, 0.14, 0.02, x, 0.12, 0.285, C.win, 0, true);
    p.sphere(0.14, -0.22, 1.4, -0.12, 0xe6e6e6, 0, 0.6); p.sphere(0.12, -0.14, 1.55, -0.1, 0xefefef, 0, 0.6);
  } else {
    p.cyl(0.14, 0.17, 0.08, 8, 0, 0, 0, C.stone);
    p.cyl(0.03, 0.06, 1.0, 7, 0, 0.08, 0, C.white);
    p.box(0.1, 0.1, 0.22, 0, 1.02, 0.02, C.white);
    for (let k = 0; k < 3; k++) p.box(0.06, 0.5, 0.015, 0, 1.07, 0.15, k === 0 ? C.pink : C.white, 0, false, k * Math.PI * 2 / 3);
    p.sphere(0.05, 0, 1.07, 0.14, C.white);
  }
}

function landmark(p: Parts, age: number) {
  if (age === 2) {
    p.cyl(0.9, 0.96, 0.06, 4, 0, 0, 0, C.green, false, Math.PI / 4);
    for (const [x, z, w, d] of [[0, -0.8, 1.4, 0.18], [0, 0.8, 1.4, 0.18], [-0.8, 0, 0.18, 1.4], [0.8, 0, 0.18, 1.4]]) p.box(w, 0.4, d, x, 0.06, z, C.stone);
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { p.cyl(0.19, 0.21, 0.7, 8, x, 0.06, z, C.cream); p.cone(0.26, 0.4, 8, x, 0.76, z, C.terracotta); }
    p.box(0.6, 0.75, 0.6, 0, 0.06, -0.05, C.cream); p.pyramid(0.72, 0.45, 0.72, 0, 0.81, -0.05, C.red);
    p.box(0.02, 0.4, 0.02, 0, 1.26, -0.05, C.wood); p.box(0.2, 0.12, 0.01, 0.1, 1.5, -0.05, C.pink);
    p.box(0.3, 0.3, 0.06, 0, 0.06, 0.82, C.door);
    p.box(0.1, 0.14, 0.02, 0, 0.4, 0.26, C.win, 0, true); p.box(0.1, 0.14, 0.02, -0.2, 0.4, 0.26, C.win, 0, true); p.box(0.1, 0.14, 0.02, 0.2, 0.4, 0.26, C.win, 0, true);
  } else if (age === 3) {
    p.box(1.9, 0.05, 0.7, 0, 0, 0.58, C.stone);
    p.box(1.7, 0.5, 0.62, 0, 0, -0.5, C.brick); roof(p, 0, 0.5, -0.5, { w: 1.7, d: 0.62, h: 0.28, color: C.slate, wall: C.brick });
    p.box(0.3, 0.95, 0.3, 0.55, 0, -0.5, C.darkbrick); p.pyramid(0.38, 0.3, 0.38, 0.55, 0.95, -0.5, C.roofdark);
    p.box(0.16, 0.16, 0.02, 0.55, 0.7, -0.345, 0xfff4d6, 0, true);
    for (const x of [-0.6, -0.25, 0.1]) p.box(0.14, 0.2, 0.02, x, 0.15, -0.185, C.win, 0, true);
    for (const z of [0.5, 0.75]) p.box(1.9, 0.03, 0.04, 0, 0.05, z, C.darkstone);
    for (let x = -0.85; x <= 0.9; x += 0.2) p.box(0.04, 0.02, 0.32, x, 0.03, 0.62, C.darkwood);
    p.box(0.8, 0.2, 0.2, -0.45, 0.09, 0.75, C.red); p.box(0.8, 0.04, 0.24, -0.45, 0.29, 0.75, C.roofdark);
    p.box(0.5, 0.26, 0.2, 0.5, 0.09, 0.75, C.butter);
    p.cyl(0.07, 0.07, 0.3, 6, -0.7, 0.29, 0.75, C.roofdark);
  } else {
    p.cyl(0.9, 0.96, 0.08, 4, 0, 0, 0, 0xe9e2d4, false, Math.PI / 4);
    const tw = (x: number, z: number, w: number, h: number, c: number) => {
      p.box(w, h, w, x, 0.08, z, c); p.box(w + 0.06, 0.05, w + 0.06, x, 0.08 + h, z, C.white);
      for (let y = 0.2; y < h - 0.1; y += 0.22) { p.box(w * 0.8, 0.12, 0.02, x, 0.08 + y, z + w / 2 + 0.005, C.win, 0, true); p.box(0.02, 0.12, w * 0.8, x + w / 2 + 0.005, 0.08 + y, z, C.win, 0, true); }
    };
    tw(-0.4, -0.4, 0.6, 1.7, 0xc9dde8); tw(0.45, -0.35, 0.5, 1.15, 0xd8e8f0); tw(0.0, 0.5, 0.55, 0.8, 0xe0d8ec);
    p.cone(0.03, 0.3, 5, -0.4, 1.83, -0.4, C.metal);
  }
}

function lamp(p: Parts, age: number) {
  if (age === 0) { p.cyl(0.02, 0.03, 0.42, 5, 0, 0, 0, C.wood); p.cone(0.06, 0.14, 5, 0, 0.4, 0, C.flame, true); }
  else if (age === 1) { p.cyl(0.04, 0.06, 0.2, 6, 0, 0, 0, C.stone); p.cyl(0.1, 0.06, 0.06, 7, 0, 0.2, 0, C.darkstone); p.cone(0.07, 0.14, 5, 0, 0.26, 0, C.flame, true); }
  else if (age === 2) { p.cyl(0.02, 0.03, 0.5, 5, 0, 0, 0, C.darkwood); p.box(0.09, 0.1, 0.09, 0, 0.5, 0, 0xfff1c9, 0, true); p.pyramid(0.13, 0.07, 0.13, 0, 0.6, 0, C.darkwood); }
  else if (age === 3) { p.cyl(0.02, 0.035, 0.6, 6, 0, 0, 0, C.roofdark); p.cyl(0.05, 0.05, 0.12, 6, 0, 0.6, 0, 0xfff1c9, true); p.cone(0.08, 0.06, 6, 0, 0.72, 0, C.roofdark); }
  else { p.cyl(0.02, 0.03, 0.65, 6, 0, 0, 0, C.metal); p.box(0.18, 0.025, 0.04, 0.07, 0.65, 0, C.metal); p.box(0.1, 0.02, 0.05, 0.14, 0.64, 0, 0xfaf6e6, 0, true); }
}

/**
 * Ponton de pêche : la façade (+z) donne sur l'eau ; le platelage s'avance au-delà de la case, sur pilotis.
 * Séchoir à poissons à la préhistoire, cabane de pêcheur, conserverie de brique, port moderne
 */
function pier(p: Parts, age: number, o: ModelOpts) {
  const deck = age >= 4 ? C.metal : age === 3 ? C.darkstone : C.wood, post = age >= 3 ? C.darkstone : C.darkwood;
  const len = age === 0 ? 0.55 : 0.85, w = age === 0 ? 0.22 : 0.3;
  p.box(w, 0.035, len, 0, 0.0, 0.1 + len / 2, deck);
  for (let z = 0.2; z <= 0.1 + len; z += 0.28) for (const s of [-1, 1]) p.cyl(0.018, 0.02, 0.6, 5, s * (w / 2 - 0.02), -0.58, z, post);
  if (age === 0) {
    // séchoir : deux perches, une traverse, des poissons pendus ; une pirogue tirée sur la berge
    for (const s of [-1, 1]) p.cyl(0.012, 0.014, 0.42, 4, s * 0.2, 0, -0.18, C.wood);
    p.box(0.44, 0.02, 0.02, 0, 0.4, -0.18, C.darkwood);
    for (let i = 0; i < 4; i++) p.box(0.03, 0.09, 0.012, -0.13 + i * 0.09, 0.3, -0.18, i % 2 ? 0xc8d4dc : 0xd8b28c);
    p.box(0.1, 0.05, 0.42, -0.26, 0.0, 0.0, C.darkwood, 0.2);
    return;
  }
  // cabane, entrepôt ou hangar à l'arrière de la case
  const wall = age === 4 ? C.white : age === 3 ? C.brick : WALLS[o.v % 6], roof = age === 4 ? C.sky : age === 3 ? C.slate : C.thatch;
  const sw = age >= 3 ? 0.6 : 0.42, sd = age >= 3 ? 0.34 : 0.3, sh = age >= 3 ? 0.34 : 0.26;
  p.box(sw, sh, sd, 0, 0, -0.22, wall);
  if (age >= 4) p.box(sw + 0.04, 0.04, sd + 0.04, 0, sh, -0.22, roof);
  else p.gable(sw + 0.06, 0.14, sd + 0.06, 0, sh, -0.22, roof);
  p.box(0.1, 0.16, 0.012, 0, 0, -0.22 + sd / 2 + 0.004, C.door);
  if (age >= 2) p.box(0.1, 0.08, 0.012, sw * 0.3, 0.12, -0.22 + sd / 2 + 0.004, C.win, 0, true);
  // filets, casiers et bitte d'amarrage
  p.box(0.12, 0.06, 0.08, w / 2 - 0.02, 0.035, 0.75, age >= 3 ? C.metal : C.darkwood);
  p.cyl(0.02, 0.02, 0.08, 6, -w / 2 + 0.03, 0.035, 0.9, C.darkstone);
  if (age === 3) { p.cyl(0.04, 0.05, 0.5, 6, -0.22, sh, -0.3, C.darkbrick); smoke(-0.22, sh + 0.52, -0.3, 2); }
  if (age === 4) { p.cyl(0.015, 0.015, 0.7, 5, w / 2, 0, 0.5, C.red); p.box(0.4, 0.02, 0.02, w / 2 - 0.18, 0.7, 0.5, C.red); }
}

const cache = new Map<string, Model>();

export function getModel(kind: KindId, age: number, o: ModelOpts): Model {
  const key = kind === 'house' ? `${kind}|${age}|${o.v}|${+o.L}${+o.R}${+o.F}` : `${kind}|${age}|${o.v % 3}`;
  let m = cache.get(key);
  if (m) return m;
  const p = new Parts();
  smokeOut = [];
  switch (kind) {
    case 'house': house(p, age, o); break;
    case 'farm': farm(p, age); break;
    case 'well': well(p, age); break;
    case 'workshop': workshop(p, age, o); break;
    case 'gather': gather(p, age, o); break;
    case 'temple': temple(p, Math.max(1, age)); break;
    case 'mill': mill(p, Math.max(2, age)); break;
    case 'landmark': landmark(p, Math.max(2, age)); break;
    case 'lamp': lamp(p, age); break;
    case 'pier': pier(p, age, o); break;
  }
  m = { ...p.build(), smoke: smokeOut };
  cache.set(key, m);
  return m;
}
