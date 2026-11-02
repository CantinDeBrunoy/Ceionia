import * as THREE from 'three';
import { Parts } from './parts';
import { caveLit } from './caveLight';
import { N } from '../world/world';
import { Underground, POOL_WATER } from '../world/underground';
import { hash2 } from '../core/rng';
import { HUMAN_K } from './assets';

/**
 * Camp souterrain : il se dresse de lui-même au pied du puits du premier avant-poste et grandit avec ses quêtes (voir
 * sim/depths). Chaque pièce est posée sur le sol dégagé, sans en chevaucher une autre, tournée vers le puits ; sa place ne
 * change pas quand le camp grandit. Feux et braseros vacillent, la roue du monte-charge tourne
 */

export type CampPiece = 'fire' | 'tent' | 'crates' | 'tower' | 'barricade' | 'banner' | 'forge' | 'carts' | 'orepile'
  | 'barracks' | 'brazier' | 'infirmary' | 'crystal' | 'lift' | 'shrine' | 'smelter' | 'warehouse' | 'keep' | 'statue'
  | 'rack' | 'barrels' | 'lantern' | 'bedrolls' | 'table' | 'woodpile' | 'dummy' | 'sacks' | 'cauldron';

/** Pièces dans l'ordre où elles s'ajoutent : niveau du camp requis, rayon d'emprise, distance au puits (en pas, min et max) */
const PIECES: { kind: CampPiece; level: number; r: number; near: [number, number] }[] = [
  { kind: 'fire', level: 1, r: 0.3, near: [1, 3] },
  { kind: 'tent', level: 1, r: 0.42, near: [1, 4] },
  { kind: 'tent', level: 1, r: 0.42, near: [1, 4] },
  { kind: 'crates', level: 1, r: 0.3, near: [1, 4] },
  { kind: 'bedrolls', level: 1, r: 0.24, near: [1, 3] },
  { kind: 'rack', level: 1, r: 0.2, near: [1, 4] },
  { kind: 'barrels', level: 1, r: 0.16, near: [1, 4] },
  { kind: 'lantern', level: 1, r: 0.1, near: [2, 5] },
  { kind: 'tower', level: 2, r: 0.42, near: [3, 7] },
  { kind: 'barricade', level: 2, r: 0.5, near: [4, 8] },
  { kind: 'barricade', level: 2, r: 0.5, near: [4, 8] },
  { kind: 'banner', level: 2, r: 0.2, near: [1, 3] },
  { kind: 'table', level: 2, r: 0.26, near: [1, 5] },
  { kind: 'woodpile', level: 2, r: 0.2, near: [2, 6] },
  { kind: 'lantern', level: 2, r: 0.1, near: [3, 7] },
  { kind: 'forge', level: 3, r: 0.48, near: [2, 6] },
  { kind: 'carts', level: 3, r: 0.55, near: [2, 6] },
  { kind: 'orepile', level: 3, r: 0.3, near: [2, 6] },
  { kind: 'dummy', level: 3, r: 0.18, near: [2, 6] },
  { kind: 'sacks', level: 3, r: 0.18, near: [2, 6] },
  { kind: 'lantern', level: 3, r: 0.1, near: [3, 8] },
  { kind: 'barracks', level: 4, r: 0.72, near: [2, 7] },
  { kind: 'brazier', level: 4, r: 0.18, near: [1, 5] },
  { kind: 'brazier', level: 4, r: 0.18, near: [2, 6] },
  { kind: 'brazier', level: 4, r: 0.18, near: [3, 7] },
  { kind: 'cauldron', level: 4, r: 0.2, near: [1, 5] },
  { kind: 'rack', level: 4, r: 0.2, near: [2, 7] },
  { kind: 'barrels', level: 4, r: 0.16, near: [2, 7] },
  { kind: 'infirmary', level: 5, r: 0.5, near: [2, 7] },
  { kind: 'crystal', level: 5, r: 0.16, near: [2, 6] },
  { kind: 'crystal', level: 5, r: 0.16, near: [3, 8] },
  { kind: 'lantern', level: 5, r: 0.1, near: [4, 9] },
  { kind: 'sacks', level: 5, r: 0.18, near: [3, 8] },
  { kind: 'lift', level: 6, r: 0.5, near: [1, 3] },
  { kind: 'table', level: 6, r: 0.26, near: [2, 8] },
  { kind: 'dummy', level: 6, r: 0.18, near: [3, 8] },
  { kind: 'shrine', level: 7, r: 0.45, near: [3, 9] },
  { kind: 'lantern', level: 7, r: 0.1, near: [5, 10] },
  { kind: 'woodpile', level: 7, r: 0.2, near: [3, 9] },
  { kind: 'smelter', level: 8, r: 0.45, near: [3, 9] },
  { kind: 'warehouse', level: 8, r: 0.6, near: [3, 9] },
  { kind: 'barrels', level: 8, r: 0.16, near: [3, 9] },
  { kind: 'rack', level: 8, r: 0.2, near: [3, 9] },
  { kind: 'keep', level: 9, r: 0.7, near: [3, 10] },
  { kind: 'statue', level: 9, r: 0.22, near: [1, 5] },
];

export interface Placed { kind: CampPiece; x: number; z: number; ry: number; r: number }
/**
 * Les pièces sont dessinées pour des habitants de 0,3 : les petits objets (tonneaux, caisses, râteliers…) sont ramenés à la
 * taille des habitants, les bâtiments un peu agrandis pour qu'on les lise de loin
 */
const SMALL = new Set<CampPiece>(['fire', 'crates', 'orepile', 'brazier', 'crystal', 'rack', 'barrels', 'lantern', 'bedrolls', 'table', 'woodpile', 'dummy', 'sacks', 'cauldron', 'statue', 'banner']);
const scaleOf = (k: CampPiece) => (SMALL.has(k) ? HUMAN_K * 1.08 : 1);

/** Place les pièces du camp de niveau `level` autour de la case `center` (sous le puits) */
export function campLayout(u: Underground, center: number, level: number): Placed[] {
  const d = u.distances(center), cx0 = (center % N) + 0.5, cz0 = Math.floor(center / N) + 0.5;
  const cells: number[] = [];
  for (let k = 0; k < N * N; k++) if (d[k] > 0 && d[k] <= 12) cells.push(k);
  cells.sort((a, b) => d[a] - d[b] || hash2(a, 1, 401) - hash2(b, 1, 401));
  const out: Placed[] = [];
  const floor = (x: number, z: number) => {
    const cx = Math.floor(x), cz = Math.floor(z);
    return u.walkable(cx, cz) && u.pool[cz * N + cx] !== POOL_WATER && u.heightAt(x, z) < 0.3;
  };
  const fits = (x: number, z: number, r: number, lift: boolean) => {
    if (Math.hypot(x - cx0, z - cz0) < r + (lift ? 0.35 : 0.75)) return false;
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2, rr = i === 8 ? 0 : r;
      if (!floor(x + Math.sin(a) * rr, z + Math.cos(a) * rr)) return false;
    }
    return out.every((q) => Math.hypot(q.x - x, q.z - z) >= q.r + r + 0.12);
  };
  for (const pc0 of PIECES) {
    if (pc0.level > level) continue;
    const pc = { ...pc0, r: pc0.r * scaleOf(pc0.kind) };
    let done = false;
    for (let widen = 0; widen <= 4 && !done; widen += 2) {
      for (const k of cells) {
        if (d[k] < pc.near[0] || d[k] > pc.near[1] + widen) continue;
        const x = (k % N) + 0.5 + (hash2(k, 2, 401) - 0.5) * 0.4, z = Math.floor(k / N) + 0.5 + (hash2(k, 3, 401) - 0.5) * 0.4;
        if (!fits(x, z, pc.r, pc.kind === 'lift')) continue;
        out.push({ kind: pc.kind, x, z, ry: Math.atan2(cx0 - x, cz0 - z), r: pc.r });
        done = true;
        break;
      }
    }
  }
  return out;
}

const BLUE = 0x3a6ab8, GOLD = 0xe8c66a, CANVAS = 0xe8dcc0, WOOD = 0xb08968, DARK = 0x7a6355, STONE = 0x9a958c, IRON = 0x55595f;
const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/** Une flamme qui vacille, une roue qui tourne, une lumière du camp */
export interface CampLight { x: number; y: number; z: number; r: number; c: THREE.Color }
export interface Camp {
  group: THREE.Group;
  flames: THREE.Object3D[];
  wheels: THREE.Object3D[];
  lights: CampLight[];
  /** postes de garde (devant les pièces) */
  posts: [number, number][];
}

const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });
const FLAME_IN = new THREE.MeshBasicMaterial({ color: 0xffe08a });
const LIT = new THREE.MeshBasicMaterial({ vertexColors: true });

/** Tente de toile à bandes bleues (kaki à l'époque moderne), ouverte vers +z ; blanche à croix rouge pour l'infirmerie */
function tent(p: Parts, s: number, white: boolean, age = 2) {
  const c = white ? 0xf2efe8 : age >= 4 ? 0x6a7350 : CANVAS;
  p.gable(0.34 * s, 0.3 * s, 0.56 * s, 0, 0, 0, c, Math.PI / 2);
  // piquets et haubans
  for (const k of [-1, 1]) for (const z of [-0.22, 0.22]) {
    p.add(new THREE.BoxGeometry(0.004, 0.004, 0.16 * s).translate(0, 0, 0.08 * s), k * 0.12 * s, 0.14 * s, z * s, 0xd8d0b8, k * Math.PI / 2, false, 0, -0.9);
    p.box(0.014, 0.03, 0.014, k * 0.27 * s, 0, z * s, DARK);
  }
  for (const k of [-1, 1]) {
    const band = white ? 0xd8443a : age >= 4 ? 0x4a5236 : BLUE;
    p.add(new THREE.BoxGeometry(0.006, 0.22 * s, 0.57 * s), k * 0.085 * s, 0.15 * s, 0, band, 0, false, k * 0.52);
  }
  if (white) for (const k of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.008, 0.1, 0.03), k * 0.1 * s, 0.17 * s, 0, 0xd8443a, 0, false, k * 0.52);
    p.add(new THREE.BoxGeometry(0.008, 0.03, 0.1), k * 0.1 * s, 0.17 * s, 0, 0xd8443a, 0, false, k * 0.52);
  }
  p.add(new THREE.BoxGeometry(0.12 * s, 0.2 * s, 0.006), 0, 0.1 * s, 0.281 * s, 0x3a2e26);
  p.box(0.016, 0.34 * s, 0.016, 0, 0, 0.29 * s, DARK);
  for (const k of [-1, 1]) p.box(0.02, 0.05, 0.02, k * 0.22 * s, 0, 0.3 * s, DARK);
}

function crates(p: Parts) {
  for (const [x, z, s, ry] of [[-0.1, 0, 1, 0.2], [0.1, 0.06, 0.85, -0.3], [-0.02, -0.14, 0.75, 0.6]]) {
    p.box(0.14 * s, 0.13 * s, 0.14 * s, x, 0, z, 0xb48a5e, ry);
    p.box(0.145 * s, 0.02, 0.03 * s, x, 0.06 * s, z, dark(0xb48a5e, 0.7), ry);
  }
  p.box(0.12, 0.12, 0.12, -0.06, 0.13, 0.02, 0xa07a50, 0.5);
  p.cyl(0.05, 0.05, 0.13, 8, 0.2, 0, -0.1, 0x9a6a44);
  for (const y of [0.03, 0.1]) p.cyl(0.052, 0.052, 0.01, 8, 0.2, y, -0.1, 0x5a5050);
  p.sphere(0.06, 0.18, 0.04, 0.14, 0xd8c8a0, 0, 0.7);
}

function tower(p: Parts) {
  const h = 0.72, top = h + 0.3;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.04, top, 0.04).translate(0, top / 2, 0), sx * 0.17, 0, sz * 0.17, DARK, 0, false, sx * 0.04, -sz * 0.04);
  for (const y of [0.22, 0.48]) for (const s of [-1, 1]) { p.box(0.36, 0.025, 0.025, 0, y, s * 0.165, WOOD); p.box(0.025, 0.025, 0.36, s * 0.165, y, 0, WOOD); }
  p.box(0.46, 0.035, 0.46, 0, h, 0, WOOD);
  for (const s of [-1, 1]) { p.box(0.46, 0.12, 0.016, 0, h + 0.035, s * 0.222, dark(WOOD, 0.9)); p.box(0.016, 0.12, 0.46, s * 0.222, h + 0.035, 0, dark(WOOD, 0.9)); }
  p.pyramid(0.56, 0.2, 0.56, 0, top, 0, 0x8a5a44);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.022, h + 0.05, 0.022).translate(0, (h + 0.05) / 2, 0), s * 0.06, 0, 0.25, WOOD, 0, false, 0, 0.12);
  for (let y = 0.08; y < h; y += 0.08) p.box(0.13, 0.014, 0.016, 0, y, 0.25 + y * 0.12, WOOD);
  p.cyl(0.05, 0.035, 0.05, 7, 0.14, h + 0.035, -0.14, IRON);
}

/** Cheval de frise : un rondin hérissé de pieux croisés */
function barricade(p: Parts) {
  p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 7).rotateZ(Math.PI / 2), 0, 0.14, 0, DARK);
  for (let i = 0; i < 5; i++) {
    const x = -0.4 + i * 0.2;
    for (const s of [-1, 1]) {
      p.add(new THREE.CylinderGeometry(0.014, 0.018, 0.4, 5), x, 0.14, 0, WOOD, 0, false, 0, s * 0.75);
      p.add(new THREE.ConeGeometry(0.018, 0.05, 5).translate(0, 0.22, 0), x, 0.14, 0, dark(WOOD, 0.75), 0, false, 0, s * 0.75);
    }
  }
}

function banner(p: Parts) {
  p.cyl(0.018, 0.024, 1.1, 6, 0, 0, 0, DARK);
  p.box(0.012, 0.32, 0.24, 0, 0.72, 0.12, BLUE);
  p.box(0.016, 0.06, 0.24, 0, 0.78, 0.12, GOLD);
  p.sphere(0.03, 0, 1.12, 0, GOLD);
  p.cyl(0.06, 0.08, 0.06, 7, 0, 0, 0, STONE);
}

/** Forge : foyer de pierre à la gueule rougeoyante, cheminée, enclume sur sa souche, soufflet, râtelier d'outils */
function forge(p: Parts) {
  p.box(0.4, 0.3, 0.3, -0.06, 0, -0.06, STONE);
  for (let i = 0; i < 6; i++) p.box(0.42, 0.012, 0.32, -0.06, 0.05 + i * 0.045, -0.06, dark(STONE, 0.86 + (i % 2) * 0.1));
  p.box(0.16, 0.12, 0.02, -0.06, 0.08, 0.095, 0x2a2420);
  p.box(0.13, 0.08, 0.012, -0.06, 0.09, 0.098, 0xff7a30, 0, true);
  p.cyl(0.07, 0.09, 0.6, 7, -0.12, 0.3, -0.12, dark(STONE, 0.8));
  p.cyl(0.08, 0.08, 0.03, 7, -0.12, 0.9, -0.12, dark(STONE, 0.6));
  p.cyl(0.06, 0.07, 0.12, 7, 0.22, 0, 0.12, DARK);
  p.box(0.16, 0.045, 0.07, 0.22, 0.12, 0.12, IRON);
  p.box(0.05, 0.03, 0.05, 0.31, 0.135, 0.12, IRON);
  p.box(0.12, 0.05, 0.08, 0.16, 0.02, -0.12, 0x6a4a34);
  p.box(0.02, 0.24, 0.02, 0.32, 0, -0.16, DARK); p.box(0.2, 0.02, 0.02, 0.24, 0.22, -0.16, DARK);
  for (const x of [0.18, 0.24, 0.3]) p.box(0.012, 0.12, 0.012, x, 0.1, -0.15, IRON);
}

/** Rails et wagonnets chargés de minerai */
function carts(p: Parts) {
  for (let z = -0.5; z <= 0.5; z += 0.1) p.box(0.2, 0.016, 0.04, 0, 0, z, DARK);
  for (const s of [-1, 1]) p.box(0.016, 0.02, 1.08, s * 0.07, 0.016, 0, 0x8a8f96);
  const ores = [0x2c2c30, 0xd8b28c, 0xf5cf45, 0xe3352d, 0x2f58d4];
  for (const z of [-0.2, 0.18]) {
    p.box(0.16, 0.1, 0.22, 0, 0.04, z, 0x6f5640);
    p.box(0.17, 0.016, 0.23, 0, 0.13, z, IRON);
    for (const s of [-1, 1]) for (const t of [-1, 1]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 8).rotateZ(Math.PI / 2), s * 0.085, 0.035, z + t * 0.07, IRON);
    for (let k = 0; k < 6; k++) p.sphere(0.035, Math.sin(k * 2.1) * 0.045, 0.15 + (k > 3 ? 0.025 : 0), z + Math.cos(k * 1.7) * 0.06, ores[(k + (z > 0 ? 2 : 0)) % ores.length], 0, 0.8);
  }
}

function orepile(p: Parts) {
  const ores = [0x2c2c30, 0xd8b28c, 0xf5cf45, 0x5a5650, 0xe3352d, 0x2f58d4, 0x5ef0e4];
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4, r = 0.2 * Math.sqrt((i % 9) / 9), y = i < 9 ? 0.02 : 0.08 + (i % 3) * 0.04;
    p.add(new THREE.IcosahedronGeometry(0.045, 0), Math.cos(a) * r * (i < 9 ? 1 : 0.5), y, Math.sin(a) * r * (i < 9 ? 1 : 0.5), ores[i % ores.length]);
  }
}

/** Caserne : longue cabane de planches, toit de bardeaux, porte, fenêtres éclairées, lanterne */
function barracks(p: Parts) {
  const W = 1.2, D = 0.5, H = 0.32;
  p.box(W + 0.04, 0.04, D + 0.04, 0, 0, 0, STONE);
  p.box(W, H, D, 0, 0.04, 0, WOOD);
  for (let u = -W / 2 + 0.05; u < W / 2; u += 0.08) p.box(0.012, H, D + 0.008, u, 0.04, 0, dark(WOOD, 0.82));
  p.gable(W + 0.12, 0.22, D + 0.14, 0, H + 0.04, 0, 0x7a5040);
  p.box(0.13, 0.22, 0.012, 0, 0.04, D / 2 + 0.004, 0x4a3426);
  for (const x of [-0.38, -0.2, 0.2, 0.38]) { p.box(0.1, 0.09, 0.012, x, 0.17, D / 2 + 0.004, DARK); p.box(0.08, 0.07, 0.012, x, 0.18, D / 2 + 0.008, 0xffd890, 0, true); }
  p.box(0.012, 0.012, 0.05, 0.1, 0.27, D / 2 + 0.02, IRON);
  p.box(0.04, 0.05, 0.04, 0.1, 0.22, D / 2 + 0.04, 0xffc060, 0, true);
  p.cyl(0.035, 0.035, 0.18, 6, 0.4, H + 0.12, -0.08, STONE);
}

function brazier(p: Parts) {
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; p.add(new THREE.BoxGeometry(0.018, 0.3, 0.018).translate(0, 0.15, 0), Math.sin(a) * 0.06, 0, Math.cos(a) * 0.06, IRON, 0, false, Math.cos(a) * 0.25, -Math.sin(a) * 0.25); }
  p.cyl(0.09, 0.05, 0.07, 8, 0, 0.27, 0, IRON);
  p.cyl(0.075, 0.075, 0.012, 8, 0, 0.33, 0, 0xff8a3a, true);
}

function infirmary(p: Parts) {
  tent(p, 1.25, true);
  for (const s of [-1, 1]) {
    p.box(0.12, 0.05, 0.26, s * 0.3, 0.05, 0.12, 0xf2efe8);
    for (const t of [-1, 1]) for (const u of [-1, 1]) p.box(0.012, 0.05, 0.012, s * 0.3 + t * 0.05, 0, 0.12 + u * 0.11, DARK);
    p.box(0.1, 0.02, 0.06, s * 0.3, 0.1, 0.22, 0xd8c8a0);
  }
}

function crystal(p: Parts) {
  p.cyl(0.02, 0.026, 0.5, 6, 0, 0, 0, DARK);
  p.cyl(0.05, 0.06, 0.04, 6, 0, 0, 0, STONE);
  p.add(new THREE.OctahedronGeometry(0.06).scale(0.7, 1.6, 0.7), 0, 0.6, 0, 0x7ff0ff, 0, true);
  for (const s of [-1, 1]) p.box(0.012, 0.1, 0.012, s * 0.03, 0.5, 0, IRON, 0, false, s * 0.3);
}

/** Monte-charge : chevalement de poutres, cage, câble qui file dans le puits de jour (la roue tourne à part) */
function lift(p: Parts) {
  const H = 1.25;
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) p.add(new THREE.BoxGeometry(0.04, H + 0.05, 0.04).translate(0, (H + 0.05) / 2, 0), s * 0.26, 0, t * 0.14, DARK, 0, false, -s * 0.06, -t * 0.08);
    p.box(0.04, 0.03, 0.3, s * 0.2, 0.5, 0, WOOD);
  }
  p.box(0.6, 0.04, 0.06, 0, H, 0, DARK);
  p.box(0.34, 0.03, 0.34, 0, 0, 0, WOOD);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.02, 0.32, 0.02, x * 0.15, 0.03, z * 0.15, IRON);
  p.box(0.32, 0.02, 0.32, 0, 0.35, 0, IRON);
  p.box(0.08, 0.06, 0.08, 0.06, 0.04, 0, 0xb48a5e);
  p.cyl(0.006, 0.006, H - 0.35, 4, 0, 0.36, 0, 0x3a3a3a);
  p.cyl(0.008, 0.008, 3.2, 4, 0, H + 0.1, 0.11, 0x3a3a3a);
  p.box(0.04, 0.05, 0.04, 0.3, 0.55, 0.16, 0xffc060, 0, true);
}

/** Sanctuaire : dalle, quatre colonnes, petit toit en pyramide, un grand cristal qui luit au milieu */
function shrine(p: Parts) {
  p.box(0.56, 0.05, 0.56, 0, 0, 0, STONE);
  p.box(0.44, 0.03, 0.44, 0, 0.05, 0, dark(STONE, 0.9));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { p.cyl(0.028, 0.034, 0.42, 7, x * 0.18, 0.08, z * 0.18, 0xd8d0c4); p.box(0.08, 0.025, 0.08, x * 0.18, 0.5, z * 0.18, STONE); }
  p.box(0.46, 0.04, 0.46, 0, 0.52, 0, STONE);
  p.pyramid(0.5, 0.24, 0.5, 0, 0.56, 0, 0x5d6878);
  p.sphere(0.03, 0, 0.82, 0, GOLD);
  p.cyl(0.06, 0.07, 0.06, 6, 0, 0.08, 0, dark(STONE, 0.8));
  p.add(new THREE.OctahedronGeometry(0.08).scale(0.7, 2, 0.7), 0, 0.3, 0, 0xb59cff, 0, true);
  for (let k = 0; k < 4; k++) p.add(new THREE.OctahedronGeometry(0.03).scale(0.7, 1.8, 0.7), Math.cos(k * 1.57) * 0.08, 0.17, Math.sin(k * 1.57) * 0.08, 0x8fd0ff, 0, true, Math.cos(k * 1.57) * 0.5, Math.sin(k * 1.57) * 0.5);
}

/** Fonderie : haut fourneau de pierre cerclé de fer, gueule où coule la fonte, creuset, lingots */
function smelter(p: Parts) {
  p.cyl(0.13, 0.2, 0.62, 8, 0, 0, -0.04, STONE);
  for (const y of [0.15, 0.32, 0.5]) p.cyl(0.2 - y * 0.11 + 0.008, 0.2 - y * 0.11 + 0.008, 0.025, 8, 0, y, -0.04, IRON);
  p.cyl(0.07, 0.09, 0.32, 7, 0, 0.62, -0.04, dark(STONE, 0.75));
  p.box(0.12, 0.1, 0.03, 0, 0.06, 0.14, 0x2a2420);
  p.box(0.09, 0.07, 0.012, 0, 0.07, 0.155, 0xffa030, 0, true);
  p.add(new THREE.BoxGeometry(0.04, 0.012, 0.16), 0, 0.08, 0.24, IRON, 0, false, 0, -0.3);
  p.add(new THREE.BoxGeometry(0.028, 0.006, 0.14), 0, 0.087, 0.24, 0xffb040, 0, true, 0, -0.3);
  p.cyl(0.06, 0.05, 0.06, 8, 0, 0, 0.34, IRON);
  p.cyl(0.05, 0.05, 0.01, 8, 0, 0.055, 0.34, 0xffc050, true);
  for (let k = 0; k < 4; k++) p.box(0.08, 0.025, 0.035, 0.2 + (k % 2) * 0.09, (k > 1 ? 0.025 : 0), 0.18, k % 2 ? GOLD : 0xc0c4cc);
}

/** Entrepôt : bâtisse de pierre à grande porte, toit de planches, caisses et sacs empilés devant */
function warehouse(p: Parts) {
  const W = 0.8, D = 0.5, H = 0.36;
  p.box(W, H, D, 0, 0, -0.06, dark(STONE, 0.95));
  for (let i = 0; i < 4; i++) p.box(W + 0.01, 0.012, D + 0.01, 0, 0.06 + i * 0.08, -0.06, dark(STONE, 0.82));
  p.gable(W + 0.1, 0.2, D + 0.12, 0, H, -0.06, 0x7a5040);
  p.box(0.26, 0.26, 0.014, 0, 0, D / 2 - 0.054, 0x5a4232);
  for (const s of [-1, 1]) p.box(0.012, 0.26, 0.016, s * 0.065, 0, D / 2 - 0.05, IRON);
  for (const [x, z, s] of [[-0.3, 0.32, 1], [-0.18, 0.36, 0.85], [0.28, 0.33, 0.9]]) { p.box(0.11 * s, 0.1 * s, 0.11 * s, x, 0, z, 0xb48a5e, x * 2); p.box(0.115 * s, 0.015, 0.03 * s, x, 0.045 * s, z, dark(0xb48a5e, 0.7), x * 2); }
  for (let k = 0; k < 3; k++) p.sphere(0.055, 0.14 + k * 0.08, 0.04, 0.36 - (k % 2) * 0.04, 0xd8c8a0, 0, 0.75);
}

/** Donjon : tour carrée de pierre crénelée, porte, fenêtres éclairées, bannière au sommet */
function keep(p: Parts) {
  const S = 0.62, H = 1.0;
  p.box(S + 0.08, 0.06, S + 0.08, 0, 0, 0, dark(STONE, 0.85));
  p.box(S, H, S, 0, 0.06, 0, STONE);
  for (let i = 0; i < 6; i++) p.box(S + 0.008, 0.014, S + 0.008, 0, 0.18 + i * 0.15, 0, dark(STONE, 0.85));
  p.box(S + 0.06, 0.04, S + 0.06, 0, H + 0.06, 0, dark(STONE, 0.8));
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    const u = -S / 2 + 0.06 + k * ((S - 0.12) / 3);
    p.box(0.09, 0.09, 0.07, u, H + 0.1, s * (S / 2 + 0.01), STONE);
    p.box(0.07, 0.09, 0.09, s * (S / 2 + 0.01), H + 0.1, u, STONE);
  }
  p.box(0.16, 0.26, 0.02, 0, 0.06, S / 2 + 0.005, 0x4a3426);
  p.gable(0.024, 0.06, 0.18, 0, 0.32, S / 2 + 0.006, STONE, Math.PI / 2);
  for (const [x, y] of [[-0.16, 0.5], [0.16, 0.5], [0, 0.78]]) { p.box(0.08, 0.12, 0.02, x, y, S / 2 + 0.004, dark(STONE, 0.6)); p.box(0.06, 0.1, 0.012, x, y + 0.01, S / 2 + 0.012, 0xffd890, 0, true); }
  p.cyl(0.012, 0.016, 0.5, 6, 0, H + 0.1, 0, DARK);
  p.box(0.01, 0.16, 0.24, 0, H + 0.4, 0.12, BLUE);
  p.box(0.012, 0.035, 0.24, 0, H + 0.44, 0.12, GOLD);
}

/** Statue du premier chevalier sur son socle, torche levée */
function statue(p: Parts) {
  p.box(0.3, 0.16, 0.3, 0, 0, 0, STONE);
  p.box(0.34, 0.03, 0.34, 0, 0.16, 0, dark(STONE, 0.85));
  const S = 0xb8b4ac;
  for (const s of [-1, 1]) p.box(0.05, 0.16, 0.06, s * 0.035, 0.19, 0, S);
  p.box(0.12, 0.16, 0.08, 0, 0.35, 0, S);
  p.box(0.13, 0.04, 0.09, 0, 0.45, 0, S);
  p.cyl(0.04, 0.045, 0.07, 8, 0, 0.49, 0, S);
  p.sphere(0.02, 0, 0.58, 0, S);
  p.add(new THREE.BoxGeometry(0.035, 0.16, 0.04).translate(0, 0.08, 0), 0.08, 0.42, 0, S, 0, false, -0.3);
  p.box(0.018, 0.12, 0.018, 0.12, 0.55, 0, DARK);
  p.box(0.012, 0.2, 0.08, -0.08, 0.28, 0.02, S);
}


/** Râtelier : lances et écus au Moyen Âge, fusils ensuite, fusils d'assaut et casques à l'époque moderne */
function rack(p: Parts, age: number) {
  p.box(0.36, 0.03, 0.06, 0, 0, 0, DARK);
  for (const s of [-1, 1]) p.box(0.025, 0.3, 0.025, s * 0.16, 0, 0, DARK);
  p.box(0.36, 0.025, 0.04, 0, 0.26, 0, WOOD);
  for (let i = 0; i < 5; i++) {
    const x = -0.12 + i * 0.06;
    if (age <= 2) { p.cyl(0.007, 0.008, 0.42, 5, x, 0.02, 0.02, WOOD); p.add(new THREE.ConeGeometry(0.014, 0.05, 4), x, 0.46, 0.02, 0xc4cad2); }
    else if (age === 3) { p.box(0.016, 0.3, 0.012, x, 0.02, 0.02, 0x7a5236); p.box(0.006, 0.08, 0.006, x, 0.32, 0.024, 0xc4cad2); }
    else { p.box(0.016, 0.22, 0.03, x, 0.03, 0.02, 0x2a2a2e); p.box(0.01, 0.04, 0.016, x, 0.1, 0.045, 0x2a2a2e); }
  }
  if (age <= 2) for (const s of [-1, 1]) { p.box(0.012, 0.14, 0.11, s * 0.2, 0.04, 0.04, BLUE); p.box(0.013, 0.14, 0.02, s * 0.2, 0.04, 0.04, GOLD); }
  else for (const s of [-1, 1]) p.sphere(0.035, s * 0.2, 0.06, 0.04, age >= 4 ? 0x4a5236 : 0x1e1e22, 1, 0.7);
}

/** Tonneaux (fûts de métal à l'époque moderne) */
function barrels(p: Parts, age: number) {
  const cols = age >= 4 ? [0x3c6a4a, 0x3c5a8a, 0x8a3c32] : [0x9a6a44, 0x8a5c3a, 0xa0744a];
  for (const [x, z, k] of [[-0.06, 0, 0], [0.07, 0.04, 1], [0.0, -0.1, 2]]) {
    p.cyl(0.045, 0.045, 0.12, 9, x, 0, z, cols[k]);
    for (const y of [0.025, 0.095]) p.cyl(0.047, 0.047, 0.01, 9, x, y, z, age >= 4 ? 0x2a2a2e : 0x4a4448);
  }
  p.cyl(0.045, 0.045, 0.12, 9, 0.0, 0.12, -0.03, cols[1]);
}

/** Lanterne sur son poteau (torchère au Moyen Âge, lanterne à gaz ensuite, projecteur à l'époque moderne) */
function lantern(p: Parts, age: number) {
  p.cyl(0.05, 0.06, 0.05, 7, 0, 0, 0, STONE);
  p.cyl(0.014, 0.018, 0.6, 6, 0, 0.05, 0, age >= 3 ? IRON : DARK);
  if (age >= 4) { p.box(0.1, 0.06, 0.05, 0, 0.62, 0.02, 0x3c3c40); p.box(0.08, 0.045, 0.006, 0, 0.627, 0.046, 0xf8f4e0, 0, true); }
  else if (age === 3) { p.box(0.07, 0.08, 0.07, 0, 0.62, 0, IRON); p.box(0.055, 0.065, 0.055, 0, 0.627, 0, 0xffd890, 0, true); p.pyramid(0.09, 0.05, 0.09, 0, 0.7, 0, IRON); }
  else { p.cyl(0.04, 0.025, 0.05, 6, 0, 0.62, 0, IRON); }
}

/** Couchages autour du feu : paillasses, couvertures roulées, sacs */
function bedrolls(p: Parts) {
  for (const [x, z, ry, c] of [[-0.12, 0.02, 0.3, 0x7a6a8a], [0.12, -0.04, -0.4, 0x8a5a4a], [0.0, 0.14, 1.4, 0x5a7a6a]] as [number, number, number, number][]) {
    p.box(0.1, 0.02, 0.26, x, 0, z, 0xc8b88a, ry);
    p.box(0.1, 0.03, 0.12, x + Math.sin(ry) * 0.06, 0.02, z + Math.cos(ry) * 0.06, c, ry);
    p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 7).rotateZ(Math.PI / 2), x - Math.sin(ry) * 0.11, 0.025, z - Math.cos(ry) * 0.11, c, ry);
  }
}

/** Table des cartes : plan déroulé, chope, lanterne, tabourets */
function table(p: Parts, age: number) {
  p.box(0.3, 0.02, 0.2, 0, 0.16, 0, WOOD);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.02, 0.16, 0.02, x * 0.13, 0, z * 0.08, DARK);
  p.box(0.2, 0.004, 0.13, -0.02, 0.18, 0, 0xe8dcb8);
  for (const [x, z, c] of [[-0.06, -0.02, 0xd8443a], [0.03, 0.03, 0x3a6ab8], [0.0, -0.04, 0x2a2a2a]] as [number, number, number][]) p.box(0.012, 0.006, 0.012, x, 0.185, z, c);
  p.cyl(0.015, 0.014, 0.03, 6, 0.11, 0.18, 0.05, age >= 4 ? 0x5a6a46 : 0x8a8f96);
  p.box(0.03, 0.04, 0.03, 0.11, 0.18, -0.06, IRON); p.box(0.022, 0.03, 0.022, 0.11, 0.185, -0.06, 0xffd890, 0, true);
  for (const [x, z] of [[-0.22, 0], [0.22, 0.02], [0, -0.17]]) { p.cyl(0.04, 0.04, 0.012, 7, x, 0.1, z, WOOD); for (let k = 0; k < 3; k++) p.box(0.01, 0.1, 0.01, x + Math.cos(k * 2.1) * 0.025, 0, z + Math.sin(k * 2.1) * 0.025, DARK); }
}

/** Bois de chauffe : bûches empilées entre deux piquets, hache plantée dans le billot */
function woodpile(p: Parts) {
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
    const x = -0.09 + i * 0.06 + row * 0.03;
    p.add(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 7).rotateX(Math.PI / 2), x, 0.028 + row * 0.05, 0, dark(WOOD, 0.85 + ((i + row) % 2) * 0.12));
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.024, 0.024, 0.004, 7).rotateX(Math.PI / 2), x, 0.028 + row * 0.05, s * 0.101, 0xd8b88a);
  }
  for (const s of [-1, 1]) p.box(0.016, 0.2, 0.016, s * 0.14, 0, 0, DARK);
  p.cyl(0.045, 0.05, 0.07, 8, 0.22, 0, 0.08, DARK); p.cyl(0.042, 0.042, 0.004, 8, 0.22, 0.07, 0.08, 0xd8b88a);
  p.add(new THREE.BoxGeometry(0.01, 0.12, 0.01), 0.24, 0.12, 0.08, WOOD, 0, false, -0.5); p.box(0.04, 0.025, 0.006, 0.21, 0.08, 0.08, IRON, 0, false, -0.5);
}

/** Mannequin d'entraînement : poteau, bras de bois, sac de paille, cible peinte */
function dummy(p: Parts, age: number) {
  p.cyl(0.05, 0.06, 0.03, 7, 0, 0, 0, STONE);
  p.cyl(0.014, 0.016, 0.42, 6, 0, 0.03, 0, DARK);
  p.cyl(0.05, 0.045, 0.14, 8, 0, 0.18, 0, 0xd8c08a);
  p.sphere(0.035, 0, 0.36, 0, 0xd8c08a, 0, 1);
  p.box(0.26, 0.016, 0.016, 0, 0.28, 0, DARK);
  p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 12).rotateX(Math.PI / 2), 0, 0.25, 0.048, 0xd8443a);
  p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.007, 12).rotateX(Math.PI / 2), 0, 0.25, 0.049, 0xf0ece0);
  if (age >= 3) for (const x of [-0.18, -0.12]) p.box(0.04, 0.006, 0.02, x, 0.003, 0.1, 0xb8a060);
}

/** Sacs de vivres et de farine, une caisse, un panier de pain */
function sacks(p: Parts) {
  for (const [x, z, y] of [[-0.06, 0, 0], [0.06, 0.02, 0], [0.0, -0.08, 0], [0.0, 0.0, 0.08]]) {
    p.sphere(0.06, x, y + 0.04, z, 0xd8c8a0, 0, 0.75);
    p.cyl(0.015, 0.02, 0.025, 6, x, y + 0.075, z, 0xb8a880);
  }
  p.box(0.08, 0.06, 0.08, 0.13, 0, -0.06, 0xb48a5e, 0.4);
  p.cyl(0.05, 0.04, 0.04, 8, -0.14, 0, 0.06, 0x9a6a3a); for (let k = 0; k < 4; k++) p.sphere(0.018, -0.14 + Math.cos(k * 1.6) * 0.022, 0.045, 0.06 + Math.sin(k * 1.6) * 0.022, 0xd89a5a, 0, 0.7);
}

/** Marmite sur son trépied, au-dessus d'un petit feu (la flamme vacille à part) */
function cauldron(p: Parts) {
  for (let i = 0; i < 7; i++) p.add(new THREE.IcosahedronGeometry(0.025, 0).scale(1, 0.7, 1), Math.cos(i * 0.9) * 0.08, 0.01, Math.sin(i * 0.9) * 0.08, STONE);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; p.add(new THREE.BoxGeometry(0.014, 0.32, 0.014).translate(0, 0.16, 0), Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12, DARK, 0, false, -Math.cos(a) * 0.35, Math.sin(a) * 0.35); }
  p.cyl(0.004, 0.004, 0.1, 4, 0, 0.2, 0, IRON);
  p.sphere(0.07, 0, 0.15, 0, 0x2a2a2e, 1, 0.8);
  p.cyl(0.06, 0.06, 0.006, 10, 0, 0.19, 0, 0x9a7a4a);
  p.add(new THREE.BoxGeometry(0.008, 0.008, 0.16), 0.03, 0.22, 0.02, WOOD, 0.5, false, 0, 0.6);
}

/** Construit le camp (pièces déjà placées, à l'époque `age`) : maillages, flammes et roues animées, lumières, postes de garde */
export function buildCamp(u: Underground, placed: Placed[], age = 2): Camp {
  const group = new THREE.Group(), flames: THREE.Object3D[] = [], wheels: THREE.Object3D[] = [], lights: CampLight[] = [], posts: [number, number][] = [];
  const body = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), 'camp');
  const flame = (root: THREE.Object3D, x: number, y: number, z: number, s: number) => {
    const f = new THREE.Group();
    f.add(new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.16 * s, 6).translate(0, 0.08 * s, 0), FLAME));
    f.add(new THREE.Mesh(new THREE.ConeGeometry(0.028 * s, 0.1 * s, 6).translate(0, 0.05 * s, 0), FLAME_IN));
    f.position.set(x, y, z);
    f.userData.ph = x * 7 + z * 3;
    root.add(f);
    flames.push(f);
  };
  for (const pc of placed) {
    const p = new Parts();
    switch (pc.kind) {
      case 'fire':
        for (let i = 0; i < 9; i++) p.add(new THREE.IcosahedronGeometry(0.035, 0).scale(1, 0.7, 1), Math.cos(i * 0.7) * 0.12, 0.012, Math.sin(i * 0.7) * 0.12, STONE);
        for (const r of [0.3, 1.4, 2.5]) p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 6).rotateZ(Math.PI / 2), 0, 0.03, 0, DARK, r);
        for (const a of [0.8, 2.9, 4.6]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 7).rotateZ(Math.PI / 2), Math.cos(a) * 0.3, 0.035, Math.sin(a) * 0.3, WOOD, -a);
        break;
      case 'tent': tent(p, 1, false, age); break;
      case 'rack': rack(p, age); break;
      case 'barrels': barrels(p, age); break;
      case 'lantern': lantern(p, age); break;
      case 'bedrolls': bedrolls(p); break;
      case 'table': table(p, age); break;
      case 'woodpile': woodpile(p); break;
      case 'dummy': dummy(p, age); break;
      case 'sacks': sacks(p); break;
      case 'cauldron': cauldron(p); break;
      case 'crates': crates(p); break;
      case 'tower': tower(p); break;
      case 'barricade': barricade(p); break;
      case 'banner': banner(p); break;
      case 'forge': forge(p); break;
      case 'carts': carts(p); break;
      case 'orepile': orepile(p); break;
      case 'barracks': barracks(p); break;
      case 'brazier': brazier(p); break;
      case 'infirmary': infirmary(p); break;
      case 'crystal': crystal(p); break;
      case 'lift': lift(p); break;
      case 'shrine': shrine(p); break;
      case 'smelter': smelter(p); break;
      case 'warehouse': warehouse(p); break;
      case 'keep': keep(p); break;
      case 'statue': statue(p); break;
    }
    const root = new THREE.Group();
    root.position.set(pc.x, u.heightAt(pc.x, pc.z), pc.z);
    root.rotation.y = pc.ry;
    const SCALE = scaleOf(pc.kind);
    root.scale.setScalar(SCALE);
    const built = p.build(false);
    const m = new THREE.Mesh(built.body, body);
    m.castShadow = true; m.receiveShadow = true;
    root.add(m);
    if (built.glow) root.add(new THREE.Mesh(built.glow, LIT));
    // repère de la pièce (à l'échelle du camp) vers le monde
    const y0 = root.position.y, at = (lx: number, lz: number): [number, number] => [pc.x + (Math.cos(pc.ry) * lx + Math.sin(pc.ry) * lz) * SCALE, pc.z + (-Math.sin(pc.ry) * lx + Math.cos(pc.ry) * lz) * SCALE];
    const light = (lx: number, ly: number, lz: number, r: number, c: number, k: number) => { const [x, z] = at(lx, lz); lights.push({ x, y: y0 + ly * SCALE, z, r, c: new THREE.Color(c).multiplyScalar(k) }); };
    // feux, braseros et forge vacillent et éclairent ; la lampe de cristal luit froid ; la roue du monte-charge tourne
    // des lueurs modestes : à plusieurs, elles s'additionnent
    if (pc.kind === 'fire') { flame(root, 0, 0.03, 0, 1.3); light(0, 0.4, 0, 3.6, 0xffa050, 0.85); }
    if (pc.kind === 'brazier') { flame(root, 0, 0.33, 0, 1); light(0, 0.6, 0, 2.8, 0xff9a40, 0.6); }
    if (pc.kind === 'cauldron') { flame(root, 0, 0.012, 0, 0.7); light(0, 0.3, 0, 2.2, 0xffa050, 0.5); }
    if (pc.kind === 'lantern') {
      if (age <= 2) flame(root, 0, 0.66, 0, 0.6);
      light(0, 0.66, 0, 2.6, age >= 4 ? 0xf0f4ff : 0xffc070, age >= 4 ? 0.55 : 0.45);
    }
    if (pc.kind === 'tower') { flame(root, 0.14, 0.78, -0.14, 0.8); light(0.14, 1, -0.14, 3.6, 0xffa050, 0.6); }
    if (pc.kind === 'forge') light(-0.06, 0.25, 0.3, 3, 0xff6a20, 0.8);
    if (pc.kind === 'barracks') light(0.1, 0.3, 0.4, 2.6, 0xffc070, 0.45);
    if (pc.kind === 'crystal') light(0, 0.65, 0, 2.8, 0x7ff0ff, 0.5);
    if (pc.kind === 'shrine') light(0, 0.35, 0, 3.4, 0xb59cff, 0.6);
    if (pc.kind === 'smelter') { light(0, 0.2, 0.3, 3, 0xff7a20, 0.8); }
    if (pc.kind === 'keep') { light(0, 0.6, 0.45, 3, 0xffc070, 0.5); flame(root, 0.12, 0.67, 0, 0.7); }
    if (pc.kind === 'statue') { flame(root, 0.12, 0.67, 0, 0.8); light(0.12, 0.8, 0, 3, 0xffa050, 0.55); }
    if (pc.kind === 'lift') {
      light(0.3, 0.6, 0.2, 2.6, 0xffc070, 0.45);
      const w = new THREE.Group(), wp = new Parts();
      wp.add(new THREE.TorusGeometry(0.13, 0.016, 5, 16).rotateY(Math.PI / 2), 0, 0, 0, 0xb83a2e);
      for (let k = 0; k < 4; k++) wp.add(new THREE.BoxGeometry(0.012, 0.26, 0.02).rotateX((k * Math.PI) / 4), 0, 0, 0, 0xb83a2e);
      wp.add(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6).rotateZ(Math.PI / 2), 0, 0, 0, IRON);
      w.add(new THREE.Mesh(wp.build(false).body, body));
      w.position.set(0, 1.25 + 0.03, 0);
      root.add(w);
      wheels.push(w);
    }
    group.add(root);
    // un garde se poste devant chaque pièce un peu grande, sur une place libre de tout autre décor
    if (pc.r / SCALE < 0.3) continue;
    for (const a of [0, 0.7, -0.7, 1.4, -1.4, Math.PI]) {
      const d = pc.r + 0.16, x = pc.x + Math.sin(pc.ry + a) * d, z = pc.z + Math.cos(pc.ry + a) * d;
      if (!u.walkable(Math.floor(x), Math.floor(z)) || placed.some((q) => q !== pc && Math.hypot(q.x - x, q.z - z) < q.r + 0.1)) continue;
      if (posts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 0.25)) continue;
      posts.push([x, z]);
      break;
    }
  }
  return { group, flames, wheels, lights, posts };
}

/** Flammes qui vacillent, roue qui tourne */
export function stepCamp(c: Camp, t: number, dt: number) {
  for (const f of c.flames) {
    const ph = f.userData.ph as number;
    f.scale.set(0.9 + 0.12 * Math.sin(t * 15 + ph), 0.85 + 0.25 * Math.sin(t * 11 + ph) + 0.1 * Math.sin(t * 27 + ph * 2), 0.9 + 0.12 * Math.cos(t * 13 + ph));
  }
  for (const w of c.wheels) w.rotation.x += dt * 1.6;
}
