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
export interface Model { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }

function house(p: Parts, age: number, o: ModelOpts) {
  const wall = WALLS[o.v % 6], roof = ROOFS[(o.v * 5 + 2) % 6];
  if (age === 0) {
    p.cyl(0.3, 0.32, 0.26, 7, 0, 0, -0.02, C.hide);
    p.cone(0.46, 0.52, 7, 0, 0.26, -0.02, C.thatch);
    p.box(0.14, 0.2, 0.04, 0, 0, 0.29, C.door);
    p.box(0.08, 0.12, 0.03, 0, 0.03, 0.31, C.win, 0, true);
    p.cone(0.05, 0.1, 5, 0, 0.76, -0.02, C.wood);
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
    p.box(ww, h, d + 0.06, cx, 0, zc, o.v % 2 ? C.white : C.cream);
    p.box(ww + 0.06, 0.05, d + 0.12, cx, h, zc, C.darkstone);
    for (let y = 0.1; y < h - 0.1; y += 0.25) p.box(ww * 0.78, 0.13, 0.02, cx, y, zc + d / 2 + 0.035, C.win, 0, true);
    p.box(0.1, 0.18, 0.02, cx + ww * 0.3, 0, zc + d / 2 + 0.035, C.door);
    p.box(ww * 0.6, 0.06, d * 0.6, cx, h + 0.05, zc, C.darkgreen);
    if (!o.F) { p.sphere(0.07, cx - 0.25, 0.04, 0.42, C.green, 0, 0.9); p.sphere(0.06, cx + 0.2, 0.04, 0.4, C.pink, 0, 0.9); }
    return;
  }
  const h = age === 3 ? 0.55 : age === 2 ? 0.38 : 0.3;
  const wc = age === 3 ? C.brick : wall;
  p.box(w, h, d, cx, 0, zc, wc);
  const roofH = age === 3 ? 0.3 : age === 2 ? 0.36 : 0.2;
  p.gable(rw, roofH, d + 0.12, rcx, h, zc, age === 3 ? C.slate : roof);
  if (age === 2) {
    // colombages
    for (const bx of [x0 + 0.025, x1 - 0.025, cx - 0.12, cx + 0.12]) p.box(0.03, h, 0.02, bx, 0, zf, C.darkwood);
    p.box(w, 0.03, 0.02, cx, h * 0.55, zf, C.darkwood);
    p.box(w, 0.04, d + 0.04, cx, h - 0.03, zc, C.darkwood);
  }
  if (age === 3) {
    p.box(0.09, 0.32, 0.09, rcx + rw * 0.25, h + 0.05, zc, C.darkbrick);
    p.box(0.11, 0.03, 0.11, rcx + rw * 0.25, h + 0.37, zc, C.darkstone);
  }
  if (age === 1) p.box(0.1, 0.05, 0.1, rcx + rw * 0.25, h + 0.12, zc, C.stone);
  // porte & fenêtres
  p.box(0.12, 0.19, 0.02, cx, 0, zf, C.door);
  const floors = age === 3 ? [0.12, 0.34] : [0.12];
  for (const y of floors)
    for (const sx of [-0.24, 0.24]) {
      if (Math.abs(cx + sx - x0) < 0.08 || Math.abs(cx + sx - x1) < 0.08) continue;
      p.box(0.1, 0.12, 0.02, cx + sx * (w > 0.9 ? 1.2 : 1), y + (sx === 0 ? 0 : 0), zf, C.win, 0, true);
    }
  if (age === 3) p.box(0.1, 0.12, 0.02, cx, 0.34, zf, C.win, 0, true);
  // jardin / clôture
  if (!o.F) {
    for (let i = 0; i < 5; i++) p.box(0.03, 0.1, 0.03, -0.4 + i * 0.2, 0, 0.46, C.wood);
    p.box(0.84, 0.025, 0.02, 0, 0.06, 0.46, C.wood);
    p.sphere(0.04, -0.2, 0.03, 0.36, C.pink, 0, 0.8);
    p.sphere(0.04, 0.22, 0.03, 0.34, C.butter, 0, 0.8);
  }
}

function farm(p: Parts, age: number, o: ModelOpts) {
  p.box(0.94, 0.03, 0.94, 0, 0, 0, age === 4 ? C.stone : C.dirt);
  const rows = (z0: number) => { for (let i = 0; i < 3; i++) p.box(0.78, 0.07, 0.1, 0, 0.03, z0 + i * 0.16, i % 2 ? C.gold : C.green); };
  if (age === 0) {
    p.cone(0.2, 0.4, 6, -0.22, 0.03, -0.25, C.thatch);
    p.box(0.04, 0.3, 0.04, 0.2, 0.03, -0.3, C.wood); p.box(0.04, 0.3, 0.04, 0.4, 0.03, -0.3, C.wood);
    p.box(0.3, 0.03, 0.03, 0.3, 0.3, -0.3, C.wood);
    rows(0);
  } else if (age === 1) {
    p.box(0.46, 0.24, 0.3, 0, 0.03, -0.28, C.wood); p.gable(0.54, 0.18, 0.4, 0, 0.27, -0.28, C.thatch);
    p.box(0.1, 0.14, 0.02, 0, 0.03, -0.12, C.door);
    rows(0);
  } else if (age === 2) {
    p.box(0.58, 0.3, 0.34, 0, 0.03, -0.27, C.red); p.gable(0.66, 0.26, 0.44, 0, 0.33, -0.27, C.darkbrick);
    p.box(0.16, 0.2, 0.02, 0, 0.03, -0.095, C.white);
    p.cyl(0.07, 0.07, 0.12, 7, 0.32, 0.03, 0.05, C.thatch, false);
    rows(0.0);
  } else if (age === 3) {
    p.box(0.5, 0.28, 0.32, -0.12, 0.03, -0.28, C.red); p.gable(0.58, 0.22, 0.42, -0.12, 0.31, -0.28, C.roofdark);
    p.cyl(0.1, 0.1, 0.5, 8, 0.32, 0.03, -0.28, C.metal); p.cone(0.12, 0.12, 8, 0.32, 0.53, -0.28, C.roofdark);
    rows(0.02);
  } else {
    p.box(0.8, 0.2, 0.62, 0, 0.03, 0, C.glass); p.gable(0.8, 0.14, 0.62, 0, 0.23, 0, 0xdff3f6);
    for (const x of [-0.4, -0.13, 0.13, 0.4]) p.box(0.02, 0.2, 0.64, x, 0.03, 0, C.white);
    p.box(0.5, 0.06, 0.02, 0, 0.1, 0.32, C.green, 0, true);
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
    p.box(0.3, 0.2, 0.26, 0.28, 0, 0.22, C.cream); p.gable(0.36, 0.14, 0.3, 0.28, 0.2, 0.22, C.thatch);
    for (const [x, z] of [[-0.3, 0.3], [-0.12, 0.38], [0.0, 0.3]]) p.cyl(0.045, 0.06, 0.1, 6, x, 0, z, C.terracotta);
  } else if (age === 2) {
    p.box(0.64, 0.34, 0.5, 0, 0, -0.04, C.stone); p.gable(0.74, 0.26, 0.6, 0, 0.34, -0.04, C.darkwood);
    p.box(0.1, 0.5, 0.1, 0.22, 0.2, -0.1, C.darkstone);
    p.box(0.16, 0.16, 0.02, -0.1, 0.02, 0.215, C.flame, 0, true);
    p.box(0.14, 0.08, 0.1, 0.3, 0, 0.36, C.darkstone); p.box(0.08, 0.05, 0.06, 0.3, 0.08, 0.36, C.metal);
  } else if (age === 3) {
    p.box(0.8, 0.36, 0.6, 0, 0, 0.02, C.brick);
    for (const x of [-0.27, 0, 0.27]) p.gable(0.27, 0.13, 0.62, x, 0.36, 0.02, C.slate);
    p.cyl(0.06, 0.08, 0.75, 8, 0.3, 0.3, -0.18, C.darkbrick); p.cyl(0.07, 0.07, 0.04, 8, 0.3, 1.0, -0.18, C.darkstone);
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
    p.cyl(0.45, 0.46, 0.03, 10, 0, 0, 0, C.dirt);
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283; p.sphere(0.06, Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2, C.darkstone); }
    p.box(0.3, 0.05, 0.05, 0, 0.04, 0, C.darkwood, 0.6); p.box(0.3, 0.05, 0.05, 0, 0.04, 0, C.wood, -0.6);
    p.cone(0.1, 0.28, 5, 0, 0.06, 0, C.flame, true);
    p.cyl(0.05, 0.05, 0.3, 6, -0.3, 0.03, 0.2, C.wood); p.cyl(0.05, 0.05, 0.3, 6, 0.3, 0.03, 0.22, C.wood);
  } else if (age === 1) {
    p.cyl(0.46, 0.46, 0.04, 12, 0, 0, 0, 0xe6dccb);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; p.cyl(0.04, 0.045, 0.34, 6, Math.cos(a) * 0.34, 0.04, Math.sin(a) * 0.34, C.white); }
    p.box(0.14, 0.14, 0.14, 0, 0.04, 0, C.stone); p.sphere(0.07, 0, 0.2, 0, C.white, 1);
    p.box(0.3, 0.05, 0.1, 0, 0.04, 0.3, C.stone); p.box(0.3, 0.05, 0.1, 0, 0.04, -0.3, C.stone);
  } else if (age === 2) {
    p.cyl(0.46, 0.46, 0.03, 12, 0, 0, 0, C.dirt);
    const cols = [C.pink, C.mint, C.butter];
    [[-0.22, -0.2], [0.22, -0.2], [0, 0.22]].forEach(([x, z], i) => {
      p.box(0.3, 0.12, 0.18, x, 0.03, z, C.wood);
      p.gable(0.38, 0.1, 0.3, x, 0.3, z, cols[i], i === 2 ? 0 : 0);
      p.box(0.025, 0.28, 0.025, x - 0.16, 0.03, z + 0.1, C.wood); p.box(0.025, 0.28, 0.025, x + 0.16, 0.03, z + 0.1, C.wood);
      p.sphere(0.04, x, 0.15, z + 0.02, C.red, 0); p.sphere(0.04, x + 0.08, 0.15, z, C.gold, 0);
    });
  } else if (age === 3) {
    p.cyl(0.46, 0.47, 0.03, 12, 0, 0, 0, C.green);
    p.cyl(0.14, 0.14, 0.06, 10, 0, 0.03, 0, C.stone); p.cyl(0.1, 0.1, 0.02, 10, 0, 0.08, 0, C.water);
    for (const [x, z] of [[-0.3, 0.1], [0.3, -0.1]]) { p.cone(0.12, 0.3, 6, x, 0.2, z, C.darkgreen); p.cyl(0.02, 0.025, 0.2, 5, x, 0.03, z, C.wood); }
    p.box(0.26, 0.04, 0.08, 0, 0.1, 0.34, C.wood); p.box(0.26, 0.06, 0.02, 0, 0.14, 0.38, C.wood);
    p.sphere(0.05, 0.2, 0.04, -0.3, C.pink, 0, 0.8);
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
    p.box(0.5, 0.38, 0.72, -0.05, 0, -0.04, C.cream); p.gable(0.56, 0.26, 0.8, -0.05, 0.38, -0.04, C.slate, 0);
    p.box(0.24, 0.7, 0.24, 0.0, 0, 0.3, C.stone); p.pyramid(0.3, 0.38, 0.3, 0.0, 0.7, 0.3, C.slate);
    p.box(0.02, 0.14, 0.02, 0, 1.08, 0.3, C.gold); p.box(0.08, 0.02, 0.02, 0, 1.15, 0.3, C.gold);
    p.box(0.08, 0.14, 0.02, 0, 0.3, 0.425, C.win, 0, true);
    for (const z of [-0.2, 0.05]) p.box(0.02, 0.14, 0.08, 0.205, 0.12, z, C.win, 0, true);
    p.box(0.1, 0.18, 0.02, 0, 0, 0.425, C.door);
  } else if (age === 3) {
    p.box(0.6, 0.55, 0.85, 0, 0, -0.02, C.stone); p.gable(0.66, 0.3, 0.9, 0, 0.55, -0.02, C.roofdark, 0);
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
    p.box(1.7, 0.5, 0.62, 0, 0, -0.5, C.brick); p.gable(1.82, 0.28, 0.74, 0, 0.5, -0.5, C.slate);
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

const cache = new Map<string, Model>();

export function getModel(kind: KindId, age: number, o: ModelOpts): Model {
  const key = kind === 'house' ? `${kind}|${age}|${o.v}|${+o.L}${+o.R}${+o.F}` : `${kind}|${age}|${o.v % 3}`;
  let m = cache.get(key);
  if (m) return m;
  const p = new Parts();
  switch (kind) {
    case 'house': house(p, age, o); break;
    case 'farm': farm(p, age, o); break;
    case 'well': well(p, age); break;
    case 'workshop': workshop(p, age, o); break;
    case 'gather': gather(p, age, o); break;
    case 'temple': temple(p, Math.max(1, age)); break;
    case 'mill': mill(p, Math.max(2, age)); break;
    case 'landmark': landmark(p, Math.max(2, age)); break;
    case 'lamp': lamp(p, age); break;
  }
  m = p.build();
  cache.set(key, m);
  return m;
}
