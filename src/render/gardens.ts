import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N } from '../world/world';
import { findGardens, layoutGarden, Garden, Item } from '../world/gardens';
import { Parts } from './parts';
import { C } from './models';
import { mats } from './materials';
import { SeasonState } from './season';
import { hash2, smoothstep, clamp } from '../core/rng';

/**
 * Jardins : le décor de chaque zone, construit d'après son plan (voir world/gardens) et fusionné en quelques maillages ;
 * flammes des feux, chevaliers qui joutent, balançoires, bascules, tourniquets et jets d'eau animés
 */

/** Canaux d'un élément : décor, feuillage caduc (teinté par la saison), persistant, fleurs, eau, verre ; feux et pièces animées */
interface Ch { p: Parts; leaf: Parts; ever: Parts; fl: Parts; water: Parts; glass: Parts; fires: number[]; dyn: DynSpec[] }
/**
 * Pièce animée : sorte, pivot dans le repère de l'élément, géométrie autour du pivot (ses néons compris). hover flotte et
 * tourne doucement (bulle d'eau, jardinière volante) ; orbit tourne autour du pivot en flottant (drone-jardinier)
 */
interface DynSpec { kind: 'swing' | 'seesaw' | 'spin' | 'jet' | 'hover' | 'orbit'; x: number; y: number; z: number; parts: Parts; ph: number }
type Builder = (c: Ch, it: Item, age: number) => void;

interface Dyn { kind: DynSpec['kind']; obj: THREE.Object3D; ph: number; base: number; s0: number; spin: number; y0: number }
interface Knight { root: THREE.Group; legs: THREE.Object3D[]; lance: THREE.Object3D; x0: number; z0: number; x1: number; z1: number; lx: number; lz: number; team: number; ph: number }
interface Entry { sig: string; age: number; g: Garden; y0: number; group: THREE.Group; flowers: THREE.Mesh | null; dyn: Dyn[]; knights: Knight[]; fires: number[]; pop: number }

const MAX_FLAMES = 128;
/** profondeur sous terre des socles (bassins, fontaines, kiosques, gradins) : posés au plus haut de leur emprise, ils ne flottent pas */
const SKIRT = 0.3;
/** éléments rigides posés au plus haut de leur emprise, et leur rayon (à l'échelle 1) */
const FLAT: Record<string, number> = { fountain: 0.31, fountain4: 0.45, kiosk: 0.36, folly: 0.31, dome: 0.69, gravpool: 0.4, hoverpad: 0.26 };
const MARBLE = 0xf1ece2;
const STEEL = 0xc4cad2;
const FLOWERS = [0xf28fb0, 0xf6d04d, 0xb48ae0, 0xf27a5e, 0xffffff];
/** couleurs des champions et de leurs bannières */
const TEAM = [[0xd8584e, 0xf4e8d0], [0x4f7fc4, 0xf2d272], [0x6fae6a, 0xf4e8d0], [0x9a6fc0, 0xf2d272]];
const PLAY = [0xf2c94c, 0xe8705c, 0x6fb8e8, 0x7cc46a];
/** Âge futuriste : blanc nacré, terre sombre, néons (cyan, rose, violet, vert acide) et feuillages d'un autre monde */
const WHITE = 0xf4f6f8, PEARL = 0xe4ecf2, SOIL = 0x34404a;
const NEON = [0x5ff2ff, 0xff6ad5, 0xb48aff, 0x9cff6a];
const ALIEN = [0x2fbf8a, 0x7a62d8, 0x26a6b8, 0x4fcf6a];
const UP = new THREE.Vector3(0, 1, 0);

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

/** Rondin couché le long de x (y = sol) */
function log(p: Parts, len: number, r: number, x: number, y: number, z: number, ry = 0, color = C.wood) {
  p.add(new THREE.CylinderGeometry(r, r, len, 6).rotateZ(Math.PI / 2), x, y + r, z, color, ry);
}
/** Bâton centré en (x, y, z), incliné de rz autour de z puis de rx autour de x */
function stick(p: Parts, len: number, r: number, x: number, y: number, z: number, color: number, rz = 0, rx = 0, ry = 0) {
  p.add(new THREE.CylinderGeometry(r * 0.8, r, len, 4), x, y, z, color, ry, false, rz, rx);
}
function blob(p: Parts, r: number, x: number, y: number, z: number, col: number, sy = 1) {
  p.add(new THREE.IcosahedronGeometry(r, 1).scale(1, sy, 1), x, y, z, col);
}
function flower(c: Ch, x: number, y: number, z: number, col: number, s = 1) {
  c.fl.add(new THREE.IcosahedronGeometry(0.022 * s, 0), x, y, z, col);
}
function lathe(pts: number[], seg: number) {
  const v: THREE.Vector2[] = [];
  for (let i = 0; i < pts.length; i += 2) v.push(new THREE.Vector2(pts[i], pts[i + 1]));
  return new THREE.LatheGeometry(v, seg);
}
/** Jet d'eau animé (cône qui monte et sa gerbe), pivot à sa base */
function jet(c: Ch, x: number, y: number, z: number, h: number, r: number, ph: number) {
  const q = new Parts();
  q.add(new THREE.ConeGeometry(r, h, 6, 1, true).translate(0, h / 2, 0), 0, 0, 0, 0xffffff);
  q.add(new THREE.IcosahedronGeometry(r * 1.8, 0).scale(1, 0.55, 1), 0, h, 0, 0xffffff);
  c.dyn.push({ kind: 'jet', x, y, z, parts: q, ph });
}

/** Tipi de peaux, perches qui dépassent du faîte */
function teepee(c: Ch) {
  const p = c.p;
  p.add(new THREE.ConeGeometry(0.22, 0.42, 8, 1, true), 0, 0.21, 0, C.hide);
  p.add(new THREE.CylinderGeometry(0.19, 0.205, 0.05, 8, 1, true), 0, 0.055, 0, dark(C.hide, 0.78));
  for (const a of [0, 2.1, 4.2]) p.add(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 4).rotateZ(-0.3), Math.cos(a) * 0.02, 0.45, Math.sin(a) * 0.02, C.darkwood, -a);
  p.add(new THREE.BoxGeometry(0.08, 0.15, 0.01).translate(0, 0.075, 0), 0, 0, 0.2, 0x5a4636, 0, false, 0, -0.48);
}

/** Tente de tournoi : toile rayée aux couleurs du champion, lambrequin, mât et fanion */
function pavilion(c: Ch, v: number) {
  const p = c.p, [a, b] = TEAM[v % 4], n = 10, r = 0.2, dt = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? b : a;
    p.add(new THREE.CylinderGeometry(r, r, 0.22, 2, 1, true, i * dt, dt), 0, 0.11, 0, col);
    p.add(new THREE.ConeGeometry(r + 0.05, 0.2, 2, 1, true, i * dt, dt), 0, 0.32, 0, col);
  }
  p.add(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.035, n, 1, true), 0, 0.205, 0, a);
  p.cyl(0.006, 0.006, 0.14, 4, 0, 0.4, 0, C.darkwood);
  p.add(new THREE.BoxGeometry(0.08, 0.04, 0.004).translate(0.04, 0, 0), 0, 0.52, 0, b);
  p.box(0.09, 0.15, 0.01, 0, 0, r - 0.002, dark(a, 0.55));
}

const B: Record<string, Builder> = {
  // ---------- Préhistoire : lieu de rassemblement ----------
  fire: (c, it) => {
    const p = c.p;
    p.cyl(0.15, 0.16, 0.012, 9, 0, 0, 0, dark(C.dirt, 0.5));
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283; p.sphere(0.05, Math.cos(a) * 0.17, 0.015, Math.sin(a) * 0.17, i % 2 ? C.darkstone : C.stone, 0, 0.65); }
    for (const a of [0.3, 1.9, 3.5, 5.0]) p.add(new THREE.CylinderGeometry(0.016, 0.022, 0.2, 5).rotateZ(0.55), Math.cos(a) * 0.055, 0.075, Math.sin(a) * 0.055, C.darkwood, -a);
    c.fires.push(0, 0.03, 0, 1);
    // broche : deux fourches, la perche et un quartier de viande qui rôtit
    if (it.v === 1) {
      for (const s of [-1, 1]) { stick(p, 0.26, 0.012, s * 0.21, 0.13, 0, C.darkwood); stick(p, 0.06, 0.007, s * 0.225, 0.27, 0, C.darkwood, -s * 0.6); }
      p.add(new THREE.CylinderGeometry(0.007, 0.007, 0.48, 4).rotateZ(Math.PI / 2), 0, 0.25, 0, C.wood);
      p.add(new THREE.IcosahedronGeometry(0.05, 0).scale(1.4, 0.8, 0.9), 0, 0.25, 0, 0xa0523c);
    }
  },
  logseat: (c, it) => { log(c.p, 0.3, 0.036, 0, 0, 0); if (it.v % 2) c.p.box(0.12, 0.012, 0.08, 0.02, 0.066, 0, C.hide); },
  stoneseat: (c) => c.p.add(new THREE.DodecahedronGeometry(0.075, 0).scale(1.1, 0.5, 0.9), 0, 0.02, 0, C.stone),
  butcher: (c) => {
    const p = c.p;
    p.add(new THREE.DodecahedronGeometry(0.11, 0).scale(1.3, 0.45, 0.9), 0, 0.03, -0.02, C.darkstone);
    p.add(new THREE.IcosahedronGeometry(0.055, 0).scale(1.5, 0.75, 1), -0.02, 0.1, -0.02, 0xc0564a);
    p.add(new THREE.CylinderGeometry(0.012, 0.016, 0.08, 5).rotateZ(Math.PI / 2), 0.085, 0.1, -0.02, 0xf2ead8);
    p.add(new THREE.TetrahedronGeometry(0.03).scale(1.6, 0.5, 0.6), 0.06, 0.08, 0.06, 0x4a4f5a);
    p.add(new THREE.CircleGeometry(0.13, 7).rotateX(-Math.PI / 2).scale(1.3, 1, 1), -0.18, 0.006, 0.12, C.hide);
    p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 4).rotateZ(Math.PI / 2), 0.17, 0.008, -0.1, 0xf2ead8, 0.5);
    p.sphere(0.022, 0.2, 0.012, -0.05, 0xefe6d2, 0, 0.8);
  },
  flint: (c) => {
    const p = c.p;
    p.add(new THREE.DodecahedronGeometry(0.07, 0).scale(1.2, 0.6, 1), 0, 0.02, -0.04, C.stone);
    p.add(new THREE.DodecahedronGeometry(0.035, 0), 0.01, 0.07, -0.04, 0x5c6878);
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.08 + (i % 3) * 0.04; p.add(new THREE.TetrahedronGeometry(0.018 + (i % 2) * 0.008).scale(1.4, 0.4, 0.8), Math.cos(a) * r, 0.006, -0.04 + Math.sin(a) * r * 0.8, i % 2 ? 0x4a5462 : 0x6e7a8a, a); }
    p.add(new THREE.CircleGeometry(0.09, 6).rotateX(-Math.PI / 2), -0.15, 0.005, 0.02, C.hide);
    for (let i = 0; i < 3; i++) p.add(new THREE.ConeGeometry(0.014, 0.06, 3).rotateX(Math.PI / 2), -0.18 + i * 0.03, 0.01, 0.02, 0x55606e);
  },
  rack: (c) => {
    const p = c.p;
    for (const s of [-1, 1]) { stick(p, 0.3, 0.013, s * 0.2, 0.15, 0, C.darkwood); stick(p, 0.07, 0.007, s * 0.215, 0.32, 0, C.darkwood, -s * 0.5); }
    p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.46, 4).rotateZ(Math.PI / 2), 0, 0.3, 0, C.wood);
    for (let i = 0; i < 5; i++) { const h = 0.09 + (i % 2) * 0.03; p.box(0.03, h, 0.008, -0.14 + i * 0.07, 0.3 - h, 0, i % 2 ? 0x9a4a3c : 0xb35f4a); }
  },
  hides: (c) => {
    const p = c.p, a = 0.3, s = Math.sin(a), co = Math.cos(a);
    for (const x of [-0.16, 0.16]) p.add(new THREE.CylinderGeometry(0.009, 0.011, 0.36, 4), x, 0.18 * co, -0.18 * s, C.darkwood, 0, false, 0, -a);
    for (const h of [0.06, 0.31]) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4).rotateZ(Math.PI / 2), 0, h * co, -h * s, C.wood, 0, false, 0, -a);
    p.add(new THREE.BoxGeometry(0.28, 0.22, 0.008), 0, 0.185 * co, -0.185 * s, C.hide, 0, false, 0, -a);
    p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4), 0, 0.13, -0.16, C.darkwood, 0, false, 0, 0.5);
  },
  woodpile: (c) => { for (const [x, l] of [[-0.052, 0], [0, 0], [0.052, 0], [-0.026, 1], [0.026, 1], [0, 2]]) log(c.p, 0.22, 0.026, x, l * 0.045, 0, Math.PI / 2, l === 1 ? C.wood : C.darkwood); },
  pots: (c, it) => {
    for (let i = 0; i < 2 + (it.v % 2); i++) {
      const a = i * 2.2;
      c.p.add(lathe([0, 0, 0.03, 0, 0.045, 0.03, 0.04, 0.06, 0.026, 0.075, 0.032, 0.085], 7), Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06, i % 2 ? 0x9c6445 : 0xb5764f);
    }
  },
  spears: (c) => {
    for (const a of [0.4, 2.5, 4.6]) {
      c.p.add(new THREE.CylinderGeometry(0.006, 0.008, 0.42, 4).rotateZ(-0.2), Math.cos(a) * 0.04, 0.2, Math.sin(a) * 0.04, C.wood, -a);
      c.p.add(new THREE.ConeGeometry(0.012, 0.04, 4), Math.cos(a) * 0.005, 0.42, Math.sin(a) * 0.005, 0x55606e, -a);
    }
  },
  bones: (c) => {
    const p = c.p;
    p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 4).rotateZ(Math.PI / 2), 0, 0.008, 0, 0xf2ead8, 0.4);
    p.add(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 4).rotateZ(Math.PI / 2), 0.02, 0.008, 0.03, 0xf2ead8, -0.7);
    p.sphere(0.022, -0.04, 0.012, 0.01, 0xefe6d2, 0, 0.8);
  },
  rug: (c, it) => {
    c.p.add(new THREE.CircleGeometry(0.12, 7).rotateX(-Math.PI / 2).scale(1.3, 1, 0.85), 0, 0.006, 0, it.v % 2 ? C.hide : 0xb08a66);
    for (const [x, z] of [[0.05, 0.02], [-0.06, -0.03], [0.0, -0.05]]) c.p.add(new THREE.CircleGeometry(0.022, 5).rotateX(-Math.PI / 2), x, 0.009, z, 0x7a5a42);
  },
  basket: (c) => {
    const p = c.p;
    p.add(lathe([0, 0, 0.04, 0, 0.05, 0.03, 0.055, 0.06, 0.05, 0.062], 8), 0, 0, 0, 0xc9a46a);
    p.add(new THREE.TorusGeometry(0.052, 0.006, 3, 10).rotateX(Math.PI / 2), 0, 0.06, 0, 0xa8854f);
    for (let i = 0; i < 3; i++) p.sphere(0.018, Math.cos(i * 2.1) * 0.02, 0.06, Math.sin(i * 2.1) * 0.02, [0xc0564a, 0x7a5aa0, 0xe0b040][i], 0);
  },
  firewood: (c) => { for (let i = 0; i < 3; i++) log(c.p, 0.12, 0.012, 0, i === 2 ? 0.022 : 0, i === 2 ? 0 : (i ? 1 : -1) * 0.013, 0.3 + i * 0.2, i % 2 ? C.wood : C.darkwood); },
  pebbles: (c) => { for (let i = 0; i < 3; i++) c.p.sphere(0.02 + i * 0.006, Math.cos(i * 2.1) * 0.035, 0.006, Math.sin(i * 2.1) * 0.035, i % 2 ? C.stone : C.darkstone, 0, 0.6); },
  tent: (c, it, age) => (age === 0 ? teepee(c) : pavilion(c, it.v)),
  menhir: (c) => {
    c.p.add(new THREE.DodecahedronGeometry(0.09, 0).scale(1, 3.2, 0.7), 0, 0.24, 0, 0xa9a49b, 0, false, 0.06, 0.04);
    c.p.add(new THREE.TorusGeometry(0.025, 0.006, 4, 10), 0, 0.3, 0.066, 0xb5553c);
  },

  // ---------- Antiquité : jardin antique ----------
  basin: (c, it) => {
    const p = c.p, w = it.w ?? 1, d = it.d ?? 0.6, t = 0.05, h = 0.07;
    p.box(w, h + SKIRT, t, 0, -SKIRT, d / 2 - t / 2, MARBLE); p.box(w, h + SKIRT, t, 0, -SKIRT, -d / 2 + t / 2, MARBLE);
    p.box(t, h + SKIRT, d - 2 * t, w / 2 - t / 2, -SKIRT, 0, MARBLE); p.box(t, h + SKIRT, d - 2 * t, -w / 2 + t / 2, -SKIRT, 0, MARBLE);
    p.box(w - 2 * t, 0.02 + SKIRT, d - 2 * t, 0, -SKIRT, 0, 0x6fa8bc);
    c.water.box(w - 2 * t, 0.012, d - 2 * t, 0, 0.042, 0, 0xffffff);
  },
  statue: (c) => {
    const p = c.p, m = MARBLE;
    p.box(0.13, 0.12, 0.13, 0, 0, 0, C.stone); p.box(0.15, 0.02, 0.15, 0, 0.12, 0, m);
    // personnage drapé : robe, buste, tête, un bras levé
    p.cyl(0.035, 0.05, 0.15, 7, 0, 0.14, 0, m);
    p.cyl(0.03, 0.036, 0.06, 7, 0, 0.29, 0, m);
    p.sphere(0.028, 0, 0.375, 0, m, 1);
    p.add(new THREE.CylinderGeometry(0.009, 0.01, 0.08, 5), 0.04, 0.37, 0, m, 0, false, -0.4);
  },
  column: (c) => { const p = c.p; p.box(0.075, 0.02, 0.075, 0, 0, 0, MARBLE); p.cyl(0.026, 0.03, 0.32, 8, 0, 0.02, 0, MARBLE); p.box(0.075, 0.025, 0.075, 0, 0.34, 0, MARBLE); },
  beam: (c, it) => { const w = it.w ?? 1; c.p.box(w, 0.04, 0.08, 0, 0.365, 0, MARBLE); c.p.box(w + 0.02, 0.015, 0.09, 0, 0.405, 0, 0xe6dccb); },
  cypress: (c, it) => { c.p.cyl(0.012, 0.016, 0.06, 5, 0, 0, 0, C.darkwood); c.ever.add(new THREE.IcosahedronGeometry(0.075, 1).scale(1, 3.4, 1), 0, 0.3, 0, it.v % 2 ? 0x4c7d52 : 0x557f4a); },
  olive: (c, it) => {
    const p = c.p, tr = 0x8a7a66;
    p.add(new THREE.CylinderGeometry(0.018, 0.03, 0.16, 5), 0, 0.08, 0, tr, 0, false, 0.2);
    p.add(new THREE.CylinderGeometry(0.012, 0.018, 0.12, 5), 0.03, 0.18, 0.01, tr, 0, false, -0.5);
    for (const [x, y, z, r] of [[0, 0.24, 0, 0.1], [0.08, 0.22, 0.03, 0.075], [-0.07, 0.21, -0.03, 0.08], [0.02, 0.29, -0.04, 0.07]]) blob(c.ever, r, x, y, z, it.v % 2 ? 0x9aae7a : 0x8fa674, 0.75);
  },
  marblebench: (c) => { const p = c.p; p.box(0.04, 0.06, 0.07, -0.08, 0, 0, C.stone); p.box(0.04, 0.06, 0.07, 0.08, 0, 0, C.stone); p.box(0.24, 0.018, 0.09, 0, 0.06, 0, MARBLE); },
  amphora: (c, it) => {
    const g = lathe([0, 0, 0.012, 0, 0.03, 0.03, 0.042, 0.065, 0.038, 0.095, 0.02, 0.115, 0.014, 0.13, 0.02, 0.14], 8);
    // une sur trois est couchée
    if (it.v % 3 === 0) c.p.add(g, 0, 0.04, -0.07, 0xc9825a, 0, false, 0, Math.PI / 2 - 0.15);
    else c.p.add(g, 0, 0, 0, 0xc9825a);
  },
  herbbed: (c, it) => {
    const p = c.p, w = 0.42, d = 0.2;
    p.box(w, 0.035, 0.025, 0, 0, d / 2, C.stone); p.box(w, 0.035, 0.025, 0, 0, -d / 2, C.stone);
    p.box(0.025, 0.035, d, w / 2, 0, 0, C.stone); p.box(0.025, 0.035, d, -w / 2, 0, 0, C.stone);
    p.box(w - 0.02, 0.03, d - 0.02, 0, 0, 0, 0x7a5a42);
    for (let i = 0; i < 5; i++) for (const zz of [-0.04, 0.04]) {
      const x = -0.16 + i * 0.08;
      blob(c.ever, 0.028, x, 0.05, zz, 0x7f9f6a, 0.8);
      flower(c, x, 0.075, zz, (i + it.v) % 2 ? 0xb48ae0 : 0x9d7fd0, 0.8);
    }
  },
  altar: (c) => { const p = c.p; p.box(0.12, 0.1, 0.1, 0, 0, 0, MARBLE); p.box(0.14, 0.02, 0.12, 0, 0.1, 0, C.stone); p.cyl(0.03, 0.02, 0.02, 7, 0, 0.12, 0, 0xc9a14a); c.fires.push(0, 0.135, 0, 0.35); },

  // ---------- Moyen Âge : tournoi et lices ----------
  tilt: (c, it) => {
    const p = c.p, w = it.w ?? 2, n = Math.max(2, Math.round(w / 0.36)), seg = Math.max(2, Math.round(w / 0.18));
    for (let i = 0; i <= n; i++) p.box(0.026, 0.13, 0.026, -w / 2 + (i * w) / n, 0, 0, C.darkwood);
    for (let i = 0; i < seg; i++) p.box(w / seg + 0.002, 0.035, 0.03, -w / 2 + (i + 0.5) * (w / seg), 0.1, 0, i % 2 ? 0xf4e8d0 : 0xd8584e);
    p.box(w, 0.018, 0.02, 0, 0.045, 0, C.wood);
  },
  stand: (c, it) => {
    const p = c.p, w = it.w ?? 1.6, n = Math.max(2, Math.round(w / 0.5)), seg = Math.max(3, Math.round(w / 0.2));
    // deux gradins (le plus bas côté lice : +z), poteaux, auvent rayé et fanions
    p.box(w, 0.05 + SKIRT, 0.13, 0, -SKIRT, 0.06, C.wood);
    p.box(w, 0.1 + SKIRT, 0.13, 0, -SKIRT, -0.06, dark(C.wood, 0.88));
    for (let i = 0; i <= n; i++) { const x = -w / 2 + (i * w) / n; p.box(0.022, 0.42 + SKIRT, 0.022, x, -SKIRT, -0.12, C.darkwood); p.box(0.022, 0.36 + SKIRT, 0.022, x, -SKIRT, 0.12, C.darkwood); }
    for (let i = 0; i < seg; i++) {
      const col = i % 2 ? 0xf4e8d0 : TEAM[it.v % 4][0], x = -w / 2 + (i + 0.5) * (w / seg);
      p.add(new THREE.BoxGeometry(w / seg + 0.002, 0.012, 0.3), x, 0.39, 0, col, 0, false, 0, 0.2);
      p.add(new THREE.ConeGeometry(0.022, 0.05, 3).rotateZ(Math.PI), x, 0.335, 0.155, col);
    }
  },
  banner: (c, it) => {
    const p = c.p, [a, b] = TEAM[it.v % 4];
    p.cyl(0.007, 0.008, 0.42, 4, 0, 0, 0, C.darkwood);
    p.box(0.11, 0.008, 0.008, 0, 0.4, 0.01, C.darkwood);
    p.box(0.09, 0.15, 0.006, 0, 0.245, 0.012, a);
    p.add(new THREE.ConeGeometry(0.045, 0.04, 3).rotateZ(Math.PI).scale(1, 1, 0.12), 0, 0.225, 0.012, a);
    p.add(new THREE.CircleGeometry(0.025, 6), 0, 0.33, 0.016, b);
  },
  target: (c) => {
    const p = c.p;
    for (const x of [-0.06, 0.06]) p.add(new THREE.CylinderGeometry(0.006, 0.007, 0.26, 4), x, 0.12, -0.03, C.darkwood, 0, false, 0, -0.25);
    p.add(new THREE.CylinderGeometry(0.006, 0.007, 0.24, 4), 0, 0.11, -0.09, C.darkwood, 0, false, 0, 0.4);
    p.add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10).rotateX(Math.PI / 2), 0, 0.17, 0, 0xe0c27a);
    for (const [r, col, z] of [[0.08, 0xf7f3ec, 0.021], [0.056, 0xd8584e, 0.023], [0.03, 0xf2c94c, 0.025]]) p.add(new THREE.CircleGeometry(r, 10), 0, 0.17, z, col);
    for (const [x, y] of [[0.02, 0.19], [-0.04, 0.15]]) p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.09, 3).rotateX(Math.PI / 2), x, y, 0.06, C.wood);
  },
  quintain: (c) => {
    const p = c.p;
    p.cyl(0.02, 0.026, 0.34, 5, 0, 0, 0, C.darkwood);
    p.box(0.36, 0.022, 0.022, 0.04, 0.3, 0, C.wood);
    p.box(0.07, 0.09, 0.012, 0.2, 0.22, 0.012, TEAM[0][0]);
    p.add(new THREE.CircleGeometry(0.02, 6), 0.2, 0.265, 0.02, TEAM[0][1]);
    p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 3), -0.13, 0.27, 0, 0x6b5a48);
    p.sphere(0.035, -0.13, 0.2, 0, 0xb59a6a, 0, 1.2);
  },
  fence: (c, it) => {
    const p = c.p, w = it.w ?? 1;
    for (const x of [-w / 2 + 0.02, 0, w / 2 - 0.02]) p.box(0.024, 0.15, 0.024, x, 0, 0, C.darkwood);
    for (const y of [0.06, 0.115]) p.box(w, 0.018, 0.016, 0, y, 0, C.wood);
  },
  stall: (c, it) => {
    const p = c.p, col = [0xd8584e, 0x4f7fc4, 0x6fae6a, 0xe0a83c][it.v % 4];
    // étal, poteaux, auvent rayé incliné vers l'avant, lambrequin ; pains, cruches, une caisse
    p.box(0.32, 0.1, 0.16, 0, 0, 0, C.wood);
    for (const sx of [-0.15, 0.15]) { p.box(0.022, 0.32, 0.022, sx, 0, -0.08, C.darkwood); p.box(0.022, 0.25, 0.022, sx, 0, 0.08, C.darkwood); }
    for (let k = 0; k < 4; k++) {
      const sx = -0.135 + k * 0.09, cl = k % 2 ? 0xf4e8d0 : col;
      p.add(new THREE.BoxGeometry(0.091, 0.012, 0.26), sx, 0.29, 0, cl, 0, false, 0, 0.27);
      for (const t of [-0.022, 0.022]) p.add(new THREE.ConeGeometry(0.022, 0.04, 3).rotateZ(Math.PI), sx + t, 0.21, 0.125, cl);
    }
    for (const fx of [-0.09, -0.03]) p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1.4, 0.7, 1), fx, 0.115, 0.02, 0xc98f4e);
    for (const fx of [0.05, 0.1]) p.cyl(0.018, 0.015, 0.05, 6, fx, 0.1, 0.02, 0xb5764f);
    p.box(0.07, 0.06, 0.07, 0.2, 0, 0.1, 0xb48a5e, 0.4);
  },
  barrels: (c) => {
    const p = c.p;
    for (const [x, z, s] of [[0, 0, 1], [0.08, 0.04, 0.9], [-0.03, 0.09, 0.85]]) {
      p.cyl(0.036 * s, 0.032 * s, 0.085 * s, 8, x, 0, z, 0x9a6a44);
      for (const y of [0.018, 0.064]) p.cyl(0.038 * s, 0.038 * s, 0.008, 8, x, y * s, z, 0x6f5640);
    }
    p.box(0.07, 0.06, 0.07, -0.09, 0, -0.04, 0xb48a5e, 0.5);
  },
  brazier: (c) => {
    const p = c.p;
    for (const a of [0, 2.1, 4.2]) p.add(new THREE.CylinderGeometry(0.006, 0.008, 0.17, 4).rotateZ(-0.25), Math.cos(a) * 0.03, 0.08, Math.sin(a) * 0.03, 0x3c3a38, -a);
    p.cyl(0.06, 0.04, 0.05, 8, 0, 0.15, 0, 0x4a4644);
    p.cyl(0.052, 0.052, 0.01, 8, 0, 0.19, 0, 0xc0563a);
    c.fires.push(0, 0.19, 0, 0.42);
  },
  bunting: (c, it) => {
    const p = c.p, w = it.w ?? 1.1, n = 9;
    for (const s of [-1, 1]) p.cyl(0.007, 0.009, 0.36, 4, (s * w) / 2, 0, 0, C.darkwood);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = -w / 2 + t * w, y = 0.34 - Math.sin(t * Math.PI) * 0.06;
      p.add(new THREE.ConeGeometry(0.022, 0.05, 3).rotateZ(Math.PI).scale(1, 1, 0.2), x, y - 0.025, 0, TEAM[(i + it.v) % 4][i % 2 ? 1 : 0]);
    }
    p.add(new THREE.BoxGeometry(w, 0.004, 0.004), 0, 0.32, 0, 0x6b5a48);
  },
  hay: (c) => { const p = c.p; p.box(0.14, 0.08, 0.09, 0, 0, 0, 0xe2c46e); for (const x of [-0.035, 0.035]) p.box(0.012, 0.082, 0.092, x, 0, 0, 0xb8964a); },
  weaponrack: (c) => {
    const p = c.p;
    for (const x of [-0.12, 0.12]) p.box(0.02, 0.2, 0.02, x, 0, 0, C.darkwood);
    p.box(0.28, 0.02, 0.025, 0, 0.18, 0, C.wood); p.box(0.28, 0.02, 0.025, 0, 0.06, 0, C.wood);
    for (let i = 0; i < 3; i++) p.add(new THREE.CylinderGeometry(0.006, 0.008, 0.48, 4), -0.08 + i * 0.08, 0.22, -0.03, i % 2 ? TEAM[1][0] : TEAM[0][0], 0, false, 0, -0.18);
    for (const [x, t] of [[-0.06, 0], [0.07, 1]]) p.box(0.07, 0.09, 0.012, x, 0.08, 0.02, TEAM[t][0]);
  },

  // ---------- Âge industriel : jardins à la française et à l'anglaise ----------
  hedge: (c, it) => c.ever.box(0.235, 0.085 + (it.v % 3) * 0.006, 0.235, 0, 0, 0, it.v % 2 ? 0x5f9a5a : 0x5a9455),
  lowbox: (c) => blob(c.ever, 0.05, 0, 0.04, 0, 0x6fa865, 0.8),
  fl: (c, it) => {
    const col = FLOWERS[it.v % 5];
    c.ever.add(new THREE.IcosahedronGeometry(0.07, 0).scale(1, 0.32, 1), 0, 0.01, 0, 0x7fb069);
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + it.v; flower(c, Math.cos(a) * 0.05, 0.035, Math.sin(a) * 0.05, col, 1.1); }
  },
  topiary: (c, it) => {
    c.p.cyl(0.012, 0.014, 0.08, 5, 0, 0, 0, C.darkwood);
    if (it.v % 2) { blob(c.ever, 0.06, 0, 0.11, 0, 0x4f8f55); blob(c.ever, 0.04, 0, 0.2, 0, 0x4f8f55); }
    else c.ever.cone(0.07, 0.28, 7, 0, 0.05, 0, 0x4f8a52);
  },
  fountain: (c) => {
    const p = c.p;
    p.add(new THREE.CylinderGeometry(0.3, 0.31, 0.07 + SKIRT, 14, 1, true), 0, (0.07 - SKIRT) / 2, 0, C.stone);
    p.add(new THREE.TorusGeometry(0.3, 0.018, 4, 14).rotateX(Math.PI / 2), 0, 0.07, 0, MARBLE);
    p.cyl(0.29, 0.29, 0.02 + SKIRT, 14, 0, -SKIRT, 0, 0x6f9fae);
    c.water.cyl(0.29, 0.29, 0.01, 14, 0, 0.05, 0, 0xffffff);
    p.cyl(0.03, 0.04, 0.16, 7, 0, 0, 0, MARBLE);
    p.cyl(0.1, 0.035, 0.035, 10, 0, 0.16, 0, MARBLE);
    c.water.cyl(0.092, 0.092, 0.006, 10, 0, 0.19, 0, 0xffffff);
    p.cyl(0.018, 0.024, 0.06, 6, 0, 0.19, 0, MARBLE);
    jet(c, 0, 0.25, 0, 0.16, 0.025, 0);
  },
  gaslamp: (c) => {
    const p = c.p, k = 0x3c4a44;
    p.cyl(0.01, 0.014, 0.36, 5, 0, 0, 0, k);
    p.box(0.04, 0.012, 0.04, 0, 0.36, 0, k);
    p.box(0.034, 0.05, 0.034, 0, 0.372, 0, 0xffe2a0, 0, true);
    p.pyramid(0.05, 0.03, 0.05, 0, 0.422, 0, k);
  },
  bench: (c, it) => {
    const p = c.p, iron = it.v ? 0x8a9098 : 0x3c4a44, wood = it.v ? 0xc79a6a : C.wood;
    for (const x of [-0.09, 0.09]) { p.box(0.012, 0.06, 0.07, x, 0, 0, iron); p.box(0.012, 0.08, 0.012, x, 0.06, -0.03, iron); }
    for (const z of [-0.022, 0, 0.022]) p.box(0.22, 0.01, 0.018, 0, 0.06, z, wood);
    for (const y of [0.09, 0.115]) p.box(0.22, 0.018, 0.008, 0, y, -0.034, wood);
  },
  tree: (c, it) => {
    c.p.cyl(0.02, 0.03, 0.2, 5, 0, 0, 0, C.wood);
    // branches nues, cachées par le feuillage à la belle saison
    stick(c.p, 0.16, 0.012, 0.05, 0.27, 0.01, C.wood, -0.65); stick(c.p, 0.15, 0.012, -0.045, 0.27, -0.03, C.wood, 0.6, -0.3);
    stick(c.p, 0.13, 0.01, 0.0, 0.31, 0.0, C.wood, 0.1, 0.2);
    const sh = [0xffffff, 0xe2ecd8, 0xf2f7ea][it.v % 3];
    blob(c.leaf, 0.14, 0, 0.3, 0, sh, 0.9); blob(c.leaf, 0.1, 0.09, 0.25, 0.03, sh, 0.85);
    blob(c.leaf, 0.1, -0.07, 0.27, -0.05, sh, 0.85); blob(c.leaf, 0.08, 0.02, 0.41, -0.02, sh, 0.9);
  },
  bush: (c, it) => { blob(c.ever, 0.07, 0, 0.04, 0, it.v % 2 ? 0x6fa865 : 0x78ae62, 0.75); blob(c.ever, 0.05, 0.05, 0.03, 0.02, 0x6a9f60, 0.7); },
  bed: (c, it) => {
    c.p.add(new THREE.CylinderGeometry(0.2, 0.21, 0.02, 9).scale(1, 1, 0.75), 0, 0, 0, 0x7a5a42);
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4, r = 0.05 + (i % 3) * 0.05, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.7;
      blob(c.ever, 0.03, x, 0.03, z, 0x6f9f5f, 0.8);
      flower(c, x, 0.06, z, FLOWERS[(i + it.v) % 5]);
    }
  },
  pond: (c, it) => {
    // eau aux contours irréguliers, berge de pierres, nénuphars et roseaux
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = 0.5 * (0.8 + hash2(i, it.v, 31) * 0.35); pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.8)); }
    const shape = new THREE.Shape(pts);
    // berge : le contour prolongé sous terre, l'étang ne flotte pas sur une pente
    c.p.add(new THREE.ExtrudeGeometry(shape, { depth: SKIRT, bevelEnabled: false }).rotateX(-Math.PI / 2), 0, 0.004 - SKIRT, 0, 0x8a7a66);
    c.p.add(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), 0, 0.006, 0, 0x5f8f8a);
    c.water.add(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).scale(0.97, 1, 0.97), 0, 0.016, 0, 0xffffff);
    for (let i = 0; i < 12; i++) c.p.sphere(0.035 + hash2(i, 3, it.v) * 0.025, pts[i].x * 1.04, 0.008, -pts[i].y * 1.04, i % 2 ? C.stone : C.darkstone, 0, 0.55);
    for (const [x, z] of [[0.12, 0.05], [-0.1, -0.08], [0.02, 0.15]]) c.p.add(new THREE.CircleGeometry(0.035, 7).rotateX(-Math.PI / 2), x, 0.02, z, 0x6fae5a);
    for (let i = 0; i < 6; i++) { const a = 0.6 + i * 0.25, v = pts[Math.floor((a / (Math.PI * 2)) * 12) % 12]; c.ever.cone(0.008, 0.12 + (i % 3) * 0.03, 3, v.x * 0.9, 0, -v.y * 0.9, 0x6f9a4e); }
    // deux canards (un colvert à tête verte, une cane brune) qui glissent sur l'eau
    for (const [x, z, r, body, head] of [[0.14, -0.06, 0.6, 0xf2efe6, 0x2f7a4a], [-0.12, 0.1, 2.4, 0xa07a54, 0x8a6a48]]) {
      c.p.add(new THREE.IcosahedronGeometry(0.026, 0).scale(1, 0.7, 1.5), x, 0.03, z, body, r);
      c.p.sphere(0.015, x + Math.sin(r) * 0.03, 0.055, z + Math.cos(r) * 0.03, head);
      c.p.box(0.01, 0.006, 0.014, x + Math.sin(r) * 0.045, 0.05, z + Math.cos(r) * 0.045, 0xf2a03a, r);
    }
  },
  kiosk: (c) => {
    const p = c.p, n = 8, r = 0.3;
    p.cyl(r, r + 0.02, 0.05 + SKIRT, n, 0, -SKIRT, 0, MARBLE);
    for (let i = 0; i < n; i++) { const a = ((i + 0.5) / n) * Math.PI * 2; p.cyl(0.01, 0.01, 0.28, 4, Math.cos(a) * (r - 0.03), 0.05, Math.sin(a) * (r - 0.03), 0xf7f3ec); }
    p.cyl(r + 0.08, r + 0.08, 0.02, n, 0, 0.32, 0, 0xf7f3ec);
    p.cone(r + 0.08, 0.2, n, 0, 0.34, 0, 0x7fb8a8);
    p.sphere(0.025, 0, 0.55, 0, C.gold);
  },
  folly: (c) => {
    const p = c.p, n = 6, r = 0.25;
    p.cyl(r + 0.04, r + 0.06, 0.05 + SKIRT, 12, 0, -SKIRT, 0, C.stone);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.cyl(0.02, 0.024, 0.3, 7, Math.cos(a) * r, 0.05, Math.sin(a) * r, MARBLE); }
    p.cyl(r + 0.04, r + 0.04, 0.04, 12, 0, 0.35, 0, MARBLE);
    p.add(new THREE.SphereGeometry(r + 0.02, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.39, 0, 0xe9e2d4);
    p.sphere(0.02, 0, 0.66, 0, C.gold);
  },

  // ---------- Époque moderne : parc et aire de jeux ----------
  slide: (c, it) => {
    const p = c.p, col = PLAY[it.v % 4], metal = 0x9aa3ad;
    for (const x of [-0.06, 0.06]) { p.box(0.014, 0.26, 0.014, x, 0, -0.16, metal); p.box(0.014, 0.22, 0.014, x, 0, -0.05, metal); }
    for (let i = 0; i < 4; i++) p.box(0.12, 0.01, 0.012, 0, 0.05 + i * 0.05, -0.165, metal);
    p.box(0.14, 0.02, 0.12, 0, 0.2, -0.105, col);
    // toboggan qui descend vers l'avant
    const len = Math.hypot(0.3, 0.2), a = Math.atan2(0.2, 0.3);
    p.add(new THREE.BoxGeometry(0.1, 0.012, len), 0, 0.115, 0.1, col, 0, false, 0, a);
    for (const x of [-0.055, 0.055]) p.add(new THREE.BoxGeometry(0.012, 0.03, len), x, 0.13, 0.1, dark(col, 0.85), 0, false, 0, a);
  },
  swings: (c, it) => {
    const p = c.p, frame = PLAY[(it.v + 1) % 4];
    for (const x of [-0.2, 0.2]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), x, 0.165, s * 0.06, frame, 0, false, 0, -s * 0.35);
    p.add(new THREE.CylinderGeometry(0.01, 0.01, 0.44, 5).rotateZ(Math.PI / 2), 0, 0.33, 0, frame);
    for (const [x, ph] of [[-0.09, 0], [0.09, 1.7]]) {
      const q = new Parts();
      for (const dx of [-0.03, 0.03]) q.box(0.004, 0.25, 0.004, dx, -0.26, 0, 0x6b7280);
      q.box(0.08, 0.012, 0.045, 0, -0.27, 0, 0x3c4a54);
      c.dyn.push({ kind: 'swing', x, y: 0.33, z: 0, parts: q, ph });
    }
  },
  seesaw: (c, it) => {
    const col = PLAY[it.v % 4];
    c.p.box(0.05, 0.06, 0.04, 0, 0, 0, 0x9aa3ad);
    const q = new Parts();
    q.box(0.05, 0.014, 0.5, 0, 0, 0, col);
    for (const z of [-0.17, 0.17]) { q.box(0.008, 0.05, 0.008, 0, 0.014, z, 0x6b7280); q.box(0.05, 0.008, 0.008, 0, 0.06, z, 0x6b7280); }
    c.dyn.push({ kind: 'seesaw', x: 0, y: 0.06, z: 0, parts: q, ph: it.v });
  },
  sandbox: (c) => {
    const p = c.p, s = 0.42;
    for (const [x, z, w, d] of [[0, s / 2, s, 0.03], [0, -s / 2, s, 0.03], [s / 2, 0, 0.03, s], [-s / 2, 0, 0.03, s]]) p.box(w, 0.04, d, x, 0, z, C.wood);
    p.box(s - 0.02, 0.025, s - 0.02, 0, 0, 0, 0xead7a0);
    p.cyl(0.022, 0.017, 0.035, 7, 0.08, 0.025, 0.05, 0xe8705c);
    p.box(0.012, 0.006, 0.07, -0.06, 0.028, -0.04, 0xf2c94c, 0.6);
    p.sphere(0.03, -0.05, 0.02, 0.07, 0xead7a0, 0, 0.6);
  },
  spring: (c, it) => {
    const p = c.p, col = PLAY[it.v % 4];
    p.cyl(0.03, 0.03, 0.01, 8, 0, 0, 0, 0x6b7280);
    for (let i = 0; i < 4; i++) p.add(new THREE.TorusGeometry(0.018, 0.005, 3, 8).rotateX(Math.PI / 2), 0, 0.02 + i * 0.016, 0, 0x8a9098);
    // canard à bascule
    p.add(new THREE.IcosahedronGeometry(0.045, 1).scale(0.8, 0.7, 1.3), 0, 0.11, 0, col);
    p.sphere(0.03, 0, 0.16, 0.05, col, 1);
    p.add(new THREE.ConeGeometry(0.012, 0.03, 4).rotateX(Math.PI / 2), 0, 0.155, 0.085, 0xe8913a);
    p.box(0.07, 0.006, 0.006, 0, 0.17, 0.035, 0x3c4a54);
  },
  roundabout: (c, it) => {
    c.p.cyl(0.03, 0.04, 0.04, 6, 0, 0, 0, 0x6b7280);
    const q = new Parts();
    for (let i = 0; i < 4; i++) q.add(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 4, 1, false, (i * Math.PI) / 2, Math.PI / 2), 0, 0, 0, PLAY[(i + it.v) % 4]);
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; q.box(0.008, 0.1, 0.008, Math.cos(a) * 0.08, 0.012, Math.sin(a) * 0.08, 0x9aa3ad); }
    q.add(new THREE.TorusGeometry(0.08, 0.006, 3, 10).rotateX(Math.PI / 2), 0, 0.11, 0, 0x9aa3ad);
    c.dyn.push({ kind: 'spin', x: 0, y: 0.045, z: 0, parts: q, ph: it.v });
  },
  climber: (c, it) => {
    const col = PLAY[(it.v + 2) % 4];
    for (let i = 0; i < 4; i++) c.p.add(new THREE.TorusGeometry(0.22, 0.008, 3, 12, Math.PI), 0, 0, 0, col, (i * Math.PI) / 4);
    for (const [y, r] of [[0.1, 0.197], [0.18, 0.12]]) c.p.add(new THREE.TorusGeometry(r, 0.008, 3, 12).rotateX(Math.PI / 2), 0, y, 0, dark(col, 0.85));
  },
  lamp: (c) => { const p = c.p; p.cyl(0.008, 0.011, 0.4, 5, 0, 0, 0, 0x8a9098); p.box(0.06, 0.012, 0.03, 0.02, 0.4, 0, 0x6b7280); p.box(0.05, 0.006, 0.024, 0.025, 0.394, 0, 0xfff1c9, 0, true); },
  bin: (c) => { c.p.cyl(0.022, 0.02, 0.07, 7, 0, 0, 0, 0x5f8f6a); c.p.cyl(0.024, 0.024, 0.008, 7, 0, 0.07, 0, 0x4a7356); },
  picnic: (c) => {
    const p = c.p, w = C.wood;
    p.box(0.26, 0.012, 0.12, 0, 0.1, 0, w);
    for (const s of [-1, 1]) { p.box(0.26, 0.01, 0.045, 0, 0.055, s * 0.125, w); p.box(0.012, 0.1, 0.3, s * 0.1, 0, 0, dark(w, 0.85)); }
  },
  fountain4: (c) => {
    const p = c.p, s = 0.42;
    for (const [x, z, w, d] of [[0, s, 2 * s + 0.05, 0.05], [0, -s, 2 * s + 0.05, 0.05], [s, 0, 0.05, 2 * s], [-s, 0, 0.05, 2 * s]]) p.box(w, 0.06 + SKIRT, d, x, -SKIRT, z, 0xd8d4cc);
    p.box(2 * s, 0.02 + SKIRT, 2 * s, 0, -SKIRT, 0, 0x6f9fae);
    c.water.box(2 * s - 0.02, 0.01, 2 * s - 0.02, 0, 0.045, 0, 0xffffff);
    for (const [x, z, ph] of [[-0.18, 0, 0], [0, 0, 1], [0.18, 0, 2], [0, 0.18, 3], [0, -0.18, 4]]) jet(c, x, 0.04, z, 0.14 + (ph % 2) * 0.06, 0.014, ph);
  },
  icecream: (c, it) => {
    // la carriole du glacier : caisse blanche à bandeau rose, roues, parasol rayé, cornets sur le comptoir
    const p = c.p, col = [0xff8ab8, 0x6fc8e8, 0xf2c94c][it.v % 3];
    p.box(0.16, 0.1, 0.09, 0, 0.03, 0, C.white); p.box(0.162, 0.025, 0.092, 0, 0.07, 0, col);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8).rotateX(Math.PI / 2), s * 0.05, 0.03, 0.05, 0x3c4a54);
    p.box(0.012, 0.05, 0.012, -0.075, 0, -0.035, 0x9aa3ad);
    p.cyl(0.004, 0.004, 0.2, 4, 0.04, 0.13, 0, 0x9aa3ad);
    for (let i = 0; i < 6; i++) p.add(new THREE.ConeGeometry(0.13, 0.05, 2, 1, true, (i * Math.PI) / 3, Math.PI / 3), 0.04, 0.355, 0, i % 2 ? C.white : col);
    for (const [x, sc] of [[-0.05, 0xf4e2b8], [-0.015, 0xff9ac0], [0.02, 0x8fd88a]] as number[][]) {
      p.add(new THREE.ConeGeometry(0.009, 0.03, 5).rotateX(Math.PI), x, 0.145, 0, 0xd8a868);
      p.sphere(0.012, x, 0.165, 0, sc);
    }
  },
  meadow: (c, it) => {
    // pré de fleurs sauvages : herbe plus claire, coquelicots, bleuets, marguerites
    c.ever.add(new THREE.CircleGeometry(0.26, 9).rotateX(-Math.PI / 2).scale(1, 1, 0.7), 0, 0.008, 0, 0x9ad870);
    const cols = [0xe84a3e, 0x6a8ef2, 0xffffff, 0xf6d04d];
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4 + it.v, r = 0.04 + ((i * 7) % 11) * 0.018, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.7;
      if (i % 2) c.ever.add(new THREE.ConeGeometry(0.012, 0.07, 3).translate(0, 0.035, 0), x, 0, z, 0x6fb85a, a);
      flower(c, x, 0.05, z, cols[i % 4], 0.8);
    }
  },

  // ---------- Herbe plus riche, à tous les âges ----------
  tuft: (c, it) => {
    for (let i = 0; i < 3; i++) c.ever.add(new THREE.ConeGeometry(0.012, 0.07 + i * 0.015, 3).translate(0, 0.035 + i * 0.008, 0), 0, 0, 0, [0x6fb85a, 0x7cc45e, 0x5fa850][i], i * 2.1, false, 0.25 * (i - 1));
    if (it.v % 2 === 0) [[0.02, 0.01], [-0.015, 0.02]].forEach(([x, z], i) => flower(c, x, 0.07, z, FLOWERS[(it.v + i * 3) % 5], 0.75));
  },
  fern: (c, it) => {
    for (let i = 0; i < 5; i++) c.ever.add(new THREE.ConeGeometry(0.016, 0.13, 3).scale(1, 1, 0.35).translate(0, 0.065, 0), 0, 0, 0, it.v % 2 ? 0x5f9a4a : 0x6aa452, i * 1.257, false, 0.75);
  },
  glowgrass: (c, it) => {
    for (let i = 0; i < 3; i++) c.ever.add(new THREE.ConeGeometry(0.012, 0.08 + i * 0.02, 3).translate(0, 0.04 + i * 0.01, 0), 0, 0, 0, ALIEN[(it.v + i) % 4], i * 2.1, false, 0.25 * (i - 1));
    c.p.add(new THREE.IcosahedronGeometry(0.013, 0), 0, 0.12, 0, NEON[it.v % 4], 0, 'neon');
  },

  // ---------- Préhistoire : totem, baies ----------
  totem: (c) => {
    const p = c.p;
    p.cyl(0.036, 0.042, 0.46, 6, 0, 0, 0, 0x8a6a4a);
    for (const [y, col] of [[0.08, 0xc8763a], [0.2, 0xe2d6bc], [0.32, 0xb8443a]] as number[][]) {
      p.cyl(0.04, 0.04, 0.07, 6, 0, y, 0, col);
      p.box(0.05, 0.012, 0.012, 0, y + 0.04, 0.036, 0x2a2018);
      for (const s of [-1, 1]) p.box(0.012, 0.012, 0.01, s * 0.014, y + 0.055, 0.04, 0xf2ead8);
    }
    // les ailes et la tête d'oiseau au sommet
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.14, 0.05, 0.012).translate(s * 0.07, 0, 0), 0, 0.42, 0, s > 0 ? 0xc8763a : 0xb8443a, 0, false, s * 0.25);
    p.add(new THREE.ConeGeometry(0.03, 0.08, 4).rotateX(Math.PI / 2), 0, 0.47, 0.04, 0xe2b04a);
  },
  berrybush: (c, it) => {
    blob(c.ever, 0.085, 0, 0.06, 0, it.v % 2 ? 0x4f8f4a : 0x5a9a4e, 0.8); blob(c.ever, 0.06, 0.06, 0.045, 0.03, 0x4a8a46, 0.75);
    for (let i = 0; i < 7; i++) { const a = i * 2.3 + it.v; c.p.sphere(0.012, Math.cos(a) * 0.075, 0.06 + (i % 3) * 0.02, Math.sin(a) * 0.07, i % 3 ? 0xd8344a : 0x6a3a9a); }
  },

  // ---------- Antiquité : vases, rosiers, treille ----------
  urn: (c, it) => {
    c.p.box(0.07, 0.03, 0.07, 0, 0, 0, C.stone);
    c.p.add(lathe([0, 0, 0.025, 0, 0.03, 0.02, 0.05, 0.06, 0.055, 0.09, 0.04, 0.11, 0.05, 0.12], 8), 0, 0.03, 0, it.v % 2 ? MARBLE : 0xd8865a);
    blob(c.ever, 0.045, 0, 0.17, 0, 0x5f9a4e, 0.7);
    for (let i = 0; i < 4; i++) flower(c, Math.cos(i * 1.6) * 0.035, 0.19, Math.sin(i * 1.6) * 0.035, FLOWERS[(i + it.v) % 4], 0.9);
  },
  rosebush: (c, it) => {
    blob(c.ever, 0.065, 0, 0.05, 0, 0x4f8a4a, 0.85); blob(c.ever, 0.045, 0.04, 0.04, -0.03, 0x5a944e, 0.8);
    const cols = [0xe8485e, 0xf28fb0, 0xffffff];
    for (let i = 0; i < 6; i++) { const a = i * 1.1 + it.v; flower(c, Math.cos(a) * 0.055, 0.07 + (i % 2) * 0.03, Math.sin(a) * 0.05, cols[(i + it.v) % 3], 1.15); }
  },
  pergola: (c) => {
    const p = c.p;
    for (const x of [-0.2, 0.2]) for (const z of [-0.12, 0.12]) p.cyl(0.016, 0.018, 0.3, 7, x, 0, z, MARBLE);
    for (const z of [-0.12, 0.12]) p.box(0.5, 0.025, 0.03, 0, 0.3, z, MARBLE);
    for (let i = 0; i < 6; i++) p.box(0.016, 0.016, 0.34, -0.22 + i * 0.088, 0.325, 0, C.wood);
    // la vigne sur le toit et ses grappes ; un banc de marbre à l'ombre
    for (let i = 0; i < 6; i++) blob(c.ever, 0.06, -0.2 + i * 0.08, 0.35, (i % 2 ? 0.05 : -0.05), i % 2 ? 0x5a944e : 0x6a9f52, 0.55);
    for (const [x, z] of [[-0.13, 0.08], [0.02, -0.07], [0.15, 0.06]]) c.p.add(new THREE.ConeGeometry(0.02, 0.05, 6).rotateX(Math.PI), x, 0.28, z, 0x7a4a9a);
    p.box(0.22, 0.016, 0.07, 0, 0.05, 0, MARBLE); for (const x of [-0.08, 0.08]) p.box(0.03, 0.05, 0.06, x, 0, 0, C.stone);
  },

  // ---------- Âge industriel : saule, arches de rosiers ----------
  willow: (c) => {
    const p = c.p;
    p.add(new THREE.CylinderGeometry(0.022, 0.035, 0.32, 6).translate(0, 0.16, 0), 0, 0, 0, 0x8a7458, 0, false, 0, 0.15);
    stick(p, 0.16, 0.012, 0.05, 0.33, 0.08, 0x8a7458, -0.6, 0.3);
    blob(c.leaf, 0.2, 0, 0.42, 0.06, 0xf2f7ea, 0.6);
    // le rideau de branches qui retombe jusqu'à l'eau
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = i % 2 ? 0.17 : 0.12; c.leaf.add(new THREE.ConeGeometry(0.04, 0.3 - (i % 2) * 0.06, 4).rotateZ(Math.PI), Math.cos(a) * r, 0.28 + (i % 2) * 0.03, 0.06 + Math.sin(a) * r, 0xe8f0dc, a); }
  },
  arch: (c, it) => {
    // arche de fer (blanche, ou verte au parc), roses qui grimpent ; elle enjambe l'allée (le long de x)
    const p = c.p, iron = it.v ? 0x4f8a6a : 0xf2efe6;
    for (const s of [-1, 1]) p.box(0.016, 0.28, 0.016, s * 0.2, 0, 0, iron);
    p.add(new THREE.TorusGeometry(0.2, 0.009, 3, 10, Math.PI), 0, 0.28, 0, iron);
    const cols = it.v ? [0xf6d04d, 0xffffff] : [0xe8485e, 0xf28fb0];
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI, x = Math.cos(a) * 0.2, y = 0.28 + Math.sin(a) * 0.2;
      blob(c.ever, 0.03, x, y, 0, 0x4f8a4a, 0.9);
      flower(c, x, y + 0.02, 0.02, cols[i % 2], 1.1);
    }
    for (const s of [-1, 1]) for (const y of [0.06, 0.16]) { blob(c.ever, 0.028, s * 0.2, y, 0, 0x5a944e, 1.1); flower(c, s * 0.2, y + 0.02, 0.025, cols[0], 1); }
  },

  // ---------- Âge futuriste : jardin bioluminescent ----------
  dome: (c) => {
    // la serre-dôme : socle blanc, sol de mousse, coupole de verre sur ses nervures, anneaux lumineux, porte en arc
    const p = c.p, R = 0.62, y = 0.05;
    p.cyl(R + 0.06, R + 0.075, y + SKIRT, 20, 0, -SKIRT, 0, WHITE);
    p.cyl(R - 0.01, R - 0.01, 0.006, 20, 0, y, 0, 0x4fc77e);
    c.glass.add(new THREE.SphereGeometry(R, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0, y, 0, 0xd8fbff);
    for (let k = 0; k < 6; k++) p.add(new THREE.TorusGeometry(R + 0.004, 0.01, 3, 14, Math.PI), 0, y, 0, WHITE, (k * Math.PI) / 6);
    p.add(new THREE.TorusGeometry(R * Math.cos(0.65), 0.009, 3, 24).rotateX(Math.PI / 2), 0, y + R * Math.sin(0.65), 0, NEON[0], 0, 'neon');
    p.add(new THREE.TorusGeometry(R + 0.012, 0.01, 3, 28).rotateX(Math.PI / 2), 0, y + 0.006, 0, NEON[0], 0, 'neon');
    p.add(new THREE.IcosahedronGeometry(0.04, 0), 0, y + R + 0.02, 0, NEON[1], 0, 'neon');
    p.add(new THREE.TorusGeometry(0.11, 0.012, 3, 8, Math.PI), 0, y, R, NEON[1], 0, 'neon');
    // l'allée de nacre qui traverse la serre
    p.box(0.16, 0.006, R * 2 - 0.06, 0, y + 0.003, 0, PEARL);
    // le grand arbre-lumière du milieu et, tout autour, feuilles géantes et bulbes qui luisent
    p.cyl(0.018, 0.03, 0.36, 6, 0, y, 0, WHITE);
    for (const s of [-1, 1]) stick(p, 0.16, 0.01, s * 0.05, y + 0.32, 0, WHITE, -s * 0.7);
    p.add(new THREE.IcosahedronGeometry(0.17, 1).scale(1, 0.55, 1), 0, y + 0.42, 0, NEON[1], 0, 'neon');
    p.add(new THREE.CylinderGeometry(0.15, 0.06, 0.03, 9), 0, y + 0.37, 0, WHITE);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2, r = 0.3 + (i % 2) * 0.12, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 0.1) continue;
      blob(c.ever, 0.07, x, y + 0.04, z, ALIEN[i % 4], 0.7);
      c.ever.add(new THREE.ConeGeometry(0.03, 0.16, 3).scale(1, 1, 0.3).translate(0, 0.08, 0), x, y, z, ALIEN[(i + 1) % 4], a, false, 0.5);
      p.cyl(0.003, 0.004, 0.12, 3, x + 0.03, y, z, 0x3a8a6a);
      p.add(new THREE.IcosahedronGeometry(0.024, 0), x + 0.03, y + 0.13, z, NEON[(i + 2) % 4], 0, 'neon');
    }
  },
  lighttree: (c, it) => {
    // arbre-lumière : tronc blanc, ombelle qui luit de sa couleur, gouttes de lumière suspendues, cercle lumineux au pied
    const p = c.p, col = NEON[it.v % 4];
    p.cyl(0.012, 0.022, 0.32, 6, 0, 0, 0, WHITE);
    for (const s of [-1, 1]) stick(p, 0.12, 0.008, s * 0.035, 0.27, 0, WHITE, -s * 0.75);
    p.add(new THREE.CylinderGeometry(0.12, 0.05, 0.03, 9), 0, 0.31, 0, WHITE);
    p.add(new THREE.IcosahedronGeometry(0.13, 1).scale(1, 0.55, 1), 0, 0.36, 0, col, 0, 'neon');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4, x = Math.cos(a) * 0.09, z = Math.sin(a) * 0.09;
      p.cyl(0.002, 0.002, 0.06, 3, x, 0.25, z, WHITE);
      p.add(new THREE.IcosahedronGeometry(0.016, 0), x, 0.245, z, NEON[(it.v + 1) % 4], 0, 'neon');
    }
    p.add(new THREE.TorusGeometry(0.055, 0.006, 3, 12).rotateX(Math.PI / 2), 0, 0.008, 0, col, 0, 'neon');
  },
  pathlight: (c, it) => {
    const p = c.p;
    p.cyl(0.014, 0.02, 0.07, 6, 0, 0, 0, WHITE);
    p.cyl(0.017, 0.017, 0.025, 6, 0, 0.07, 0, NEON[it.v % 4], 'neon');
    p.cyl(0.02, 0.018, 0.01, 6, 0, 0.095, 0, WHITE);
  },
  podbench: (c, it) => {
    // banc-cocon : coque blanche sur son pied, dossier galbé, liseré lumineux sous l'assise
    const p = c.p;
    p.cyl(0.03, 0.045, 0.045, 8, 0, 0, 0, PEARL);
    p.box(0.24, 0.022, 0.085, 0, 0.045, 0, WHITE);
    p.add(new THREE.BoxGeometry(0.24, 0.1, 0.02).translate(0, 0.05, 0), 0, 0.06, -0.035, WHITE, 0, false, 0, -0.25);
    for (const s of [-1, 1]) p.box(0.02, 0.05, 0.08, s * 0.12, 0.06, 0, PEARL);
    p.box(0.2, 0.006, 0.006, 0, 0.04, 0.045, NEON[it.v % 4], 0, 'neon');
  },
  gravpool: (c, it) => {
    // bassin anti-gravité : margelle blanche et son anneau lumineux, trois pylônes, une bulle d'eau qui flotte dans ses anneaux
    const p = c.p, R = 0.36;
    p.add(new THREE.CylinderGeometry(R, R + 0.025, 0.07 + SKIRT, 18, 1, true), 0, (0.07 - SKIRT) / 2, 0, WHITE);
    p.add(new THREE.TorusGeometry(R + 0.005, 0.012, 3, 24).rotateX(Math.PI / 2), 0, 0.07, 0, NEON[0], 0, 'neon');
    p.cyl(R - 0.01, R - 0.01, 0.02 + SKIRT, 18, 0, -SKIRT, 0, 0x2fb8d8);
    c.water.cyl(R - 0.01, R - 0.01, 0.01, 18, 0, 0.05, 0, 0xffffff);
    p.cyl(0.05, 0.07, 0.07, 8, 0, 0, 0, WHITE); p.cyl(0.04, 0.04, 0.006, 8, 0, 0.07, 0, NEON[0], 'neon');
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5, x = Math.cos(a) * (R + 0.01), z = Math.sin(a) * (R + 0.01);
      p.cyl(0.014, 0.02, 0.3, 6, x, 0.05, z, WHITE);
      p.add(new THREE.IcosahedronGeometry(0.022, 0), x, 0.36, z, NEON[(it.v + k) % 4], 0, 'neon');
    }
    const q = new Parts();
    q.add(new THREE.IcosahedronGeometry(0.1, 1), 0, 0, 0, 0x7fe6ff);
    for (let i = 0; i < 3; i++) q.sphere(0.02, Math.cos(i * 2.1) * 0.15, 0.04 * (i - 1), Math.sin(i * 2.1) * 0.15, 0xa8f0ff);
    q.add(new THREE.TorusGeometry(0.17, 0.007, 3, 20).rotateX(Math.PI / 2 + 0.4), 0, 0, 0, NEON[1], 0, 'neon');
    q.add(new THREE.TorusGeometry(0.2, 0.006, 3, 20).rotateX(Math.PI / 2 - 0.5), 0, 0, 0, NEON[2], 0, 'neon');
    c.dyn.push({ kind: 'hover', x: 0, y: 0.32, z: 0, parts: q, ph: it.v });
  },
  hoverpad: (c, it) => {
    // trampoline lumineux : galette blanche, toile qui luit, anneau rose, bulles de lumière au-dessus
    const p = c.p;
    p.cyl(0.25, 0.26, 0.04 + SKIRT, 16, 0, -SKIRT, 0, WHITE);
    p.cyl(0.21, 0.21, 0.006, 16, 0, 0.04, 0, [0x7a6aff, 0x3ad8e8, 0xff6ad5, 0x6ad86a][it.v % 4], 'neon');
    p.add(new THREE.TorusGeometry(0.235, 0.012, 3, 24).rotateX(Math.PI / 2), 0, 0.045, 0, NEON[(it.v + 1) % 4], 0, 'neon');
    for (let i = 0; i < 3; i++) p.add(new THREE.IcosahedronGeometry(0.025, 0), Math.cos(i * 2.1) * 0.1, 0.2 + i * 0.05, Math.sin(i * 2.1) * 0.1, NEON[(it.v + i) % 4], 0, 'neon');
  },
  gyro: (c, it) => {
    // gyroscope où l'on grimpe : socle, mât, trois anneaux de couleur qui tournent
    const p = c.p;
    p.cyl(0.07, 0.09, 0.04, 10, 0, 0, 0, WHITE);
    p.cyl(0.012, 0.014, 0.2, 6, 0, 0.04, 0, PEARL);
    const q = new Parts();
    q.add(new THREE.TorusGeometry(0.19, 0.012, 4, 20), 0, 0, 0, PLAY[it.v % 4]);
    q.add(new THREE.TorusGeometry(0.17, 0.012, 4, 20), 0, 0, 0, PLAY[(it.v + 1) % 4], Math.PI / 2);
    q.add(new THREE.TorusGeometry(0.15, 0.012, 4, 20).rotateX(Math.PI / 2), 0, 0, 0, PLAY[(it.v + 2) % 4]);
    q.add(new THREE.IcosahedronGeometry(0.03, 0), 0, 0, 0, NEON[it.v % 4], 0, 'neon');
    c.dyn.push({ kind: 'spin', x: 0, y: 0.22, z: 0, parts: q, ph: it.v });
  },
  hexbed: (c, it) => {
    // massif hexagonal : bac blanc, liseré lumineux, terre sombre, feuilles d'ailleurs, bulbes et fleurs phosphorescents
    const p = c.p, col = NEON[it.v % 4];
    p.cyl(0.2, 0.21, 0.08, 6, 0, 0, 0, WHITE);
    p.cyl(0.185, 0.185, 0.01, 6, 0, 0.08, 0, SOIL);
    p.add(new THREE.TorusGeometry(0.2, 0.007, 3, 6).rotateX(Math.PI / 2), 0, 0.083, 0, col, Math.PI / 6, 'neon');
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.4, x = Math.cos(a) * 0.1, z = Math.sin(a) * 0.1;
      blob(c.ever, 0.05, x, 0.12, z, ALIEN[(i + it.v) % 4], 0.75);
      flower(c, x * 0.5, 0.15, z * 0.5, [0xffffff, 0xff9ad8, 0xfff07a, 0x9af0ff][i], 1.1);
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 1.2, x = Math.cos(a) * 0.06, z = Math.sin(a) * 0.06;
      p.cyl(0.004, 0.005, 0.14 + i * 0.03, 4, x, 0.09, z, 0x3a9a6a);
      p.add(new THREE.IcosahedronGeometry(0.024, 0).scale(1, 1.3, 1), x, 0.24 + i * 0.03, z, NEON[(it.v + i) % 4], 0, 'neon');
    }
  },
  drone: (c, it) => {
    // drone-jardinier : coque blanche, quatre rotors, œil lumineux, brumisateur ; il tourne au-dessus du massif
    const q = new Parts(), x = 0.17;
    q.add(new THREE.IcosahedronGeometry(0.032, 1).scale(1.2, 0.6, 1), x, 0, 0, WHITE);
    for (const [dx, dz] of [[0.035, 0.035], [-0.035, 0.035], [0.035, -0.035], [-0.035, -0.035]]) { q.box(0.006, 0.006, 0.05, x + dx * 0.5, 0.008, dz * 0.5, 0x8a9aa8, Math.atan2(dx, dz)); q.cyl(0.02, 0.02, 0.003, 7, x + dx, 0.014, dz, 0x5a6672); }
    q.box(0.012, 0.01, 0.03, x, 0, 0.03, NEON[it.v % 4], 0, 'neon');
    q.add(new THREE.ConeGeometry(0.03, 0.08, 6, 1, true).translate(0, -0.04, 0), x, -0.015, 0, 0xc8f4ff);
    c.dyn.push({ kind: 'orbit', x: 0, y: 0.36, z: 0, parts: q, ph: it.v });
  },
  floater: (c, it) => {
    // jardinière qui flotte au-dessus de son socle émetteur : coque blanche, buissons, fleurs, anneau lumineux dessous
    const p = c.p;
    p.cyl(0.05, 0.065, 0.02, 8, 0, 0, 0, PEARL); p.cyl(0.035, 0.035, 0.005, 8, 0, 0.02, 0, NEON[it.v % 4], 'neon');
    const q = new Parts();
    q.add(new THREE.CylinderGeometry(0.13, 0.07, 0.07, 8), 0, 0, 0, WHITE);
    q.cyl(0.12, 0.12, 0.006, 8, 0, 0.033, 0, SOIL);
    q.sphere(0.06, -0.03, 0.08, 0.01, ALIEN[it.v % 4], 1, 0.8); q.sphere(0.045, 0.05, 0.065, -0.03, ALIEN[(it.v + 1) % 4], 1, 0.8);
    for (let i = 0; i < 4; i++) q.sphere(0.016, Math.cos(i * 1.6) * 0.07, 0.07, Math.sin(i * 1.6) * 0.07, [0xff9ad8, 0xfff07a, 0xffffff, 0x9af0ff][i]);
    q.add(new THREE.TorusGeometry(0.09, 0.007, 3, 14).rotateX(Math.PI / 2), 0, -0.04, 0, NEON[it.v % 4], 0, 'neon');
    c.dyn.push({ kind: 'hover', x: 0, y: 0.26, z: 0, parts: q, ph: it.v * 1.3 });
  },
  crystal: (c, it) => {
    // buisson de cristal : trois prismes qui luisent, sur une touffe d'herbe bleutée
    blob(c.ever, 0.05, 0, 0.02, 0, ALIEN[(it.v + 2) % 4], 0.5);
    for (let i = 0; i < 3; i++) c.p.add(new THREE.OctahedronGeometry(0.035, 0).scale(0.55, 1.8 - i * 0.3, 0.55), Math.cos(i * 2.1) * 0.03, 0.06, Math.sin(i * 2.1) * 0.03, NEON[(it.v + i) % 4], i * 0.7, 'neon', 0.25 * (i - 1));
  },
};

/** Les éléments que le rendu sait dessiner (le sol souple de l'aire de jeux à part) */
export const GARDEN_PIECES = new Set([...Object.keys(B), 'pad']);

/** Flamme : un cœur orangé et trois langues jaunes */
function flameGeo() {
  const p = new Parts();
  p.add(new THREE.ConeGeometry(0.06, 0.2, 6).translate(0, 0.1, 0), 0, 0, 0, 0xff8a3c);
  for (let i = 0; i < 3; i++) { const a = i * 2.1; p.add(new THREE.ConeGeometry(0.034, 0.13 - i * 0.02, 5).translate(0, 0.065, 0), Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035, 0xffd66b); }
  return p.build(false).body;
}

/** Occlusion factice : le pied des objets s'assombrit au contact du sol (repère de l'élément, y = sol) */
function shade(geo: THREE.BufferGeometry) {
  const py = geo.attributes.position, col = geo.attributes.color;
  if (!col) return;
  for (let i = 0; i < py.count; i++) {
    const t = clamp(py.getY(i) / 0.22, 0, 1), f = 0.72 + 0.28 * t * t * (3 - 2 * t);
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
}

export class GardenView {
  group = new THREE.Group();
  private entries = new Map<number, Entry>();
  /** feuillage caduc : teinte de la saison */
  private leafMat = new THREE.MeshStandardMaterial({ color: 0x8fc070, roughness: 0.95, vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0 });
  /** part du feuillage caduc encore aux branches (1 l'été, un petit reste neigeux l'hiver) */
  private uLeaf = { value: 1 };
  /** son ombre suit le feuillage */
  private leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  /** buis, cyprès, oliviers : toujours verts */
  private everMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0 });
  private waterMat = new THREE.MeshStandardMaterial({ color: 0x7cc6dc, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 });
  /** verre de la serre-dôme futuriste, commun à tous les jardins */
  private glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
  /** dalles des allées, tirées vers la caméra pour ne pas scintiller sur le sol */
  private tileMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  private flames: THREE.InstancedMesh;
  private flowersOn = true;
  private frozen = false;
  private t = 0;
  private dummy = new THREE.Object3D();

  constructor(private world: World) {
    // les touffes de feuillage se resserrent sur leur centre selon la saison (ombre comprise)
    for (const m of [this.leafMat, this.leafDepth]) {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uLeaf = this.uLeaf;
        sh.vertexShader = 'attribute vec3 aCenter;\nuniform float uLeaf;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed = aCenter + (transformed - aCenter) * uLeaf;');
      };
      m.customProgramCacheKey = () => 'gardenLeaf';
    }
    this.flames = new THREE.InstancedMesh(flameGeo(), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.25, 1.25, 1.25) }), MAX_FLAMES);
    this.flames.count = 0;
    this.flames.frustumCulled = false;
    this.group.add(this.flames);
  }

  /** Refait les jardins qui ont changé (cases, relief, routes) ou tous, au changement d'âge (ils repoussent) */
  sync(age: number) {
    const w = this.world, seen = new Set<number>();
    for (const g of findGardens(w)) {
      seen.add(g.id);
      let hs = 0, hk = 0;
      for (const k of g.cells) { hs += w.cellAvg(k % N, Math.floor(k / N)); hk = (hk * 31 + k + (w.road[k] ? 7 : 0) + (w.occ[k] ? 13 : 0)) | 0; }
      const sig = `${age}|${g.cells.length}|${hk}|${hs.toFixed(2)}`;
      const old = this.entries.get(g.id);
      if (old && old.sig === sig) continue;
      if (old) this.dispose(old);
      const e = this.build(g, age, sig);
      if (old && old.age !== age) { e.pop = 0; e.group.scale.setScalar(0.001); }
      this.entries.set(g.id, e);
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) { this.dispose(e); this.entries.delete(id); }
  }

  /**
   * Sol sous un élément : le plus bas sous son emprise (rien ne flotte), le plus haut pour un socle qui s'enfonce dans le sol,
   * la moyenne pour un étang (sa berge descend sous terre)
   */
  private ground(x: number, z: number, r: number, mode: 'low' | 'high' | 'avg' = 'low') {
    const w = this.world;
    let lo = w.hAt(x, z), hi = lo, sum = lo;
    for (let a = 0; a < 8; a++) { const h = w.hAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r); lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; }
    return (mode === 'low' ? lo : mode === 'high' ? hi : sum / 9) - 0.005;
  }

  private build(g: Garden, age: number, sig: string): Entry {
    const w = this.world, L = layoutGarden(w, g, age), y0 = w.hAt(g.cx, g.cz);
    const group = new THREE.Group();
    group.position.set(g.cx, y0, g.cz);
    const out: Record<'p' | 'glow' | 'leaf' | 'ever' | 'fl' | 'water' | 'glass', THREE.BufferGeometry[]> = { p: [], glow: [], leaf: [], ever: [], fl: [], water: [], glass: [] };
    const fires: number[] = [], dyn: Dyn[] = [], pads: Item[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const it of L.items) {
      // le sol souple de l'aire de jeux épouse le relief (plus bas)
      if (it.k === 'pad') { pads.push(it); continue; }
      const b = B[it.k];
      if (!b) continue;
      const ch: Ch = { p: new Parts(), leaf: new Parts(), ever: new Parts(), fl: new Parts(), water: new Parts(), glass: new Parts(), fires: [], dyn: [] };
      b(ch, it, age);
      const high = it.k === 'basin' || it.k === 'stand' || it.k in FLAT, pond = it.k === 'pond';
      const rad = high ? (it.w ? Math.hypot(it.w, it.d ?? 0.26) / 2 : FLAT[it.k]) * it.s : pond ? 0.45 * it.s : Math.min(0.12 * it.s, 0.4);
      m.compose(v.set(it.x - g.cx, this.ground(it.x, it.z, rad, high ? 'high' : pond ? 'avg' : 'low') - y0, it.z - g.cz), q.setFromEuler(e.set(0, it.r, 0)), sc.setScalar(it.s));
      const take = (src: THREE.BufferGeometry[], dst: THREE.BufferGeometry[], ao: boolean) => { for (const geo of src) { if (ao) shade(geo); geo.applyMatrix4(m); dst.push(geo); } };
      take(ch.p.body, out.p, true); take(ch.p.glow, out.glow, false);
      take(ch.leaf.body, out.leaf, true); take(ch.ever.body, out.ever, true);
      // chaque touffe de feuillage retient son centre : l'hiver, elle se resserre sur sa branche
      for (const geo of ch.leaf.body) {
        geo.computeBoundingBox();
        const c = geo.boundingBox!.getCenter(v), n = geo.attributes.position.count, a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) a.set([c.x, c.y, c.z], i * 3);
        geo.setAttribute('aCenter', new THREE.BufferAttribute(a, 3));
      }
      take(ch.fl.body, out.fl, false); take(ch.water.body, out.water, false); take(ch.glass.body, out.glass, false);
      for (let i = 0; i < ch.fires.length; i += 4) { v.set(ch.fires[i], ch.fires[i + 1], ch.fires[i + 2]).applyMatrix4(m); fires.push(v.x + g.cx, v.y + y0, v.z + g.cz, ch.fires[i + 3] * it.s); }
      for (const d of ch.dyn) {
        const water = d.kind === 'jet', built = d.parts.build(false);
        const mesh = new THREE.Mesh(built.body, water ? this.waterMat : mats.body);
        mesh.castShadow = !water;
        // ses néons (anneaux de la bulle d'eau, œil du drone) bougent avec elle
        if (built.glow) mesh.add(new THREE.Mesh(built.glow, mats.glow));
        mesh.position.copy(v.set(d.x, d.y, d.z).applyMatrix4(m));
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = it.r;
        mesh.scale.setScalar(it.s);
        group.add(mesh);
        dyn.push({ kind: d.kind, obj: mesh, ph: d.ph + it.x * 1.7, base: it.r, s0: it.s, spin: 0, y0: mesh.position.y });
      }
    }
    // dalles des allées, couchées sur la pente
    const tiles = new Parts(), tcol = age >= 5 ? 0xf0f5f8 : age === 4 ? 0xd8d4ca : age === 1 ? 0xeee2c8 : 0xe4d2a8, nq = new THREE.Quaternion(), n = new THREE.Vector3();
    for (let i = 0; i < L.paths.length; i += 2) {
      const x = L.paths[i], z = L.paths[i + 1], s = 0.15;
      n.set(w.hAt(x - s, z) - w.hAt(x + s, z), 2 * s, w.hAt(x, z - s) - w.hAt(x, z + s)).normalize();
      const geo = new THREE.CylinderGeometry(0.14, 0.14, 0.01, 7).applyQuaternion(nq.setFromUnitVectors(UP, n));
      tiles.add(geo, x - g.cx, w.hAt(x, z) - y0 + 0.006, z - g.cz, new THREE.Color(tcol).multiplyScalar(0.94 + hash2(i, 5, g.id) * 0.1).getHex(), hash2(i, 7, g.id) * 6);
      // âge futuriste : chaque dalle a son cœur de lumière, l'allée brille la nuit
      if (age >= 5) tiles.add(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 6).applyQuaternion(nq), x - g.cx, w.hAt(x, z) - y0 + 0.013, z - g.cz, i % 9 ? 0xa8f4ff : 0xffb0ec, hash2(i, 7, g.id) * 6, 'neon');
    }
    out.glow.push(...tiles.glow);
    tiles.glow = [];
    // sol souple de l'aire de jeux : un disque drapé sur le relief, bordé d'un liseré clair
    // (et un anneau d'une autre couleur, comme les marelles peintes des cours de récréation)
    for (const it of pads) for (const [r0, r1, col, dy] of [[0, it.s, it.v ? 0x6fb8b0 : 0xd98a6a, 0.012], [it.s * 0.95, it.s, 0xe9e2d4, 0.016], [it.s * 0.6, it.s * 0.66, it.v ? 0xf2c94c : 0x6fb8e8, 0.015]]) {
      const geo = new THREE.RingGeometry(r0, r1, 28, r0 ? 1 : 6).rotateX(-Math.PI / 2), pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) { const x = it.x + pos.getX(k), z = it.z + pos.getZ(k); pos.setXYZ(k, x - g.cx, w.hAt(x, z) - y0 + dy, z - g.cz); }
      tiles.add(geo, 0, 0, 0, col);
    }
    const mk = (list: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
      if (!list.length) return null;
      const geo = mergeGeometries(list, false);
      for (const l of list) l.dispose();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    mk(out.p, mats.body); mk(out.glow, mats.glow, false); mk(out.ever, this.everMat);
    const leaves = mk(out.leaf, this.leafMat);
    if (leaves) leaves.customDepthMaterial = this.leafDepth;
    const flowers = mk(out.fl, mats.body, false);
    if (flowers) flowers.visible = this.flowersOn;
    mk(out.water, this.waterMat, false);
    mk(out.glass, this.glassMat, false);
    mk(tiles.body, this.tileMat, false);
    const knights: Knight[] = [];
    for (let i = 0; i < L.lanes.length; i += 4) for (const team of [0, 1]) knights.push(this.knight(group, L.lanes, i, team, g.id));
    this.group.add(group);
    return { sig, age, g, y0, group, flowers, dyn, knights, fires, pop: 1 };
  }

  /** Chevalier en armure sur son destrier caparaçonné, lance au poing ; il charge le long de la lice, la lice à sa gauche */
  private knight(group: THREE.Group, lanes: number[], i: number, team: number, id: number): Knight {
    const [a, b] = TEAM[team], horse = team ? 0xe4ded4 : 0x8a6248;
    const body = new Parts();
    body.add(new THREE.IcosahedronGeometry(0.07, 1).scale(0.85, 0.85, 1.9), 0, 0.2, 0, horse);
    body.add(new THREE.BoxGeometry(0.05, 0.13, 0.06), 0, 0.27, 0.13, horse, 0, false, 0, 0.55);
    body.add(new THREE.BoxGeometry(0.048, 0.05, 0.11), 0, 0.32, 0.2, horse, 0, false, 0, 0.5);
    body.box(0.16, 0.1, 0.3, 0, 0.13, -0.005, a);
    body.box(0.162, 0.025, 0.302, 0, 0.13, -0.005, b);
    body.add(new THREE.ConeGeometry(0.02, 0.1, 4), 0, 0.17, -0.17, dark(horse, 0.7), 0, false, 0, -2.4);
    for (const s of [-1, 1]) body.box(0.03, 0.09, 0.05, s * 0.07, 0.2, 0.01, STEEL);
    body.box(0.085, 0.11, 0.06, 0, 0.27, 0, STEEL);
    body.box(0.09, 0.075, 0.065, 0, 0.255, 0, a);
    body.cyl(0.032, 0.034, 0.065, 7, 0, 0.38, 0, STEEL);
    body.box(0.04, 0.008, 0.01, 0, 0.415, 0.032, 0x3c4a54);
    body.sphere(0.025, 0, 0.465, -0.01, b, 0, 1.3);
    // écu au bras gauche (x local), aux couleurs inversées
    body.box(0.012, 0.09, 0.07, 0.065, 0.24, 0.01, b);
    body.box(0.014, 0.03, 0.072, 0.066, 0.27, 0.01, a);
    const root = new THREE.Group();
    const hull = new THREE.Mesh(body.build(false).body, mats.body);
    hull.castShadow = true;
    root.add(hull);
    const legs: THREE.Object3D[] = [];
    for (const [x, z, ph] of [[0.04, 0.09, 0], [-0.04, 0.09, Math.PI], [0.04, -0.09, Math.PI], [-0.04, -0.09, 0]]) {
      const lp = new Parts();
      lp.cyl(0.013, 0.015, 0.13, 5, 0, -0.13, 0, horse);
      lp.box(0.03, 0.02, 0.03, 0, -0.145, 0, dark(horse, 0.55));
      const leg = new THREE.Mesh(lp.build(false).body, mats.body);
      leg.position.set(x, 0.14, z);
      leg.userData.ph = ph;
      leg.castShadow = true;
      root.add(leg);
      legs.push(leg);
    }
    // lance rayée, garde en cône, tenue de la main droite
    const lp = new Parts();
    for (let k = 0; k < 5; k++) lp.add(new THREE.CylinderGeometry(0.0075 - k * 0.0008, 0.0085 - k * 0.0008, 0.12, 5).rotateX(Math.PI / 2), 0, 0, -0.06 + k * 0.12 + 0.06, k % 2 ? b : a);
    lp.add(new THREE.ConeGeometry(0.026, 0.05, 6).rotateX(Math.PI / 2), 0, 0, 0.03, STEEL);
    const lance = new THREE.Mesh(lp.build(false).body, mats.body);
    lance.position.set(-0.05, 0.28, 0.02);
    lance.rotation.order = 'YXZ';
    lance.castShadow = true;
    root.add(lance);
    group.add(root);
    const x0 = lanes[i], z0 = lanes[i + 1], x1 = lanes[i + 2], z1 = lanes[i + 3], len = Math.hypot(x1 - x0, z1 - z0) || 1;
    // la gauche d'un cavalier qui va de x0 vers x1 ; chacun garde son côté de la lice
    const lx = (z1 - z0) / len, lz = -(x1 - x0) / len, side = team ? 1 : -1;
    return { root, legs, lance, x0, z0, x1, z1, lx: lx * side * 0.2, lz: lz * side * 0.2, team, ph: hash2(id, i, 3) * 10 };
  }

  private animKnight(k: Knight, e: Entry, t: number, day: number) {
    const H = 5, T = (t + k.ph) % (2 * H), half = T < H ? 0 : 1, lt = T - half * H, on = day > 0.5;
    // demi-cycle pair : le premier va de x0 vers x1, le second en sens inverse ; puis retour
    const dirA = on && half ? -1 : 1, charge = on ? smoothstep(2.0, 4.3, lt) : 0;
    const fA = dirA > 0 ? charge : 1 - charge, f = k.team === 0 ? fA : 1 - fA, dir = k.team === 0 ? dirA : -dirA;
    const x = k.x0 + (k.x1 - k.x0) * f + k.lx, z = k.z0 + (k.z1 - k.z0) * f + k.lz;
    const gallop = on ? Math.sin(Math.PI * clamp((lt - 2.0) / 2.3, 0, 1)) : 0, beat = lt * 15;
    k.root.position.set(x - e.g.cx, this.world.hAt(x, z) - e.y0 + Math.abs(Math.sin(beat)) * 0.022 * gallop, z - e.g.cz);
    // demi-tour au bout de la lice, avant de repartir
    k.root.rotation.y = Math.atan2((k.x1 - k.x0) * dir, (k.z1 - k.z0) * dir) + (on ? (1 - smoothstep(0, 0.9, lt)) * Math.PI : 0);
    k.root.rotation.x = Math.sin(beat) * 0.04 * gallop;
    for (const l of k.legs) l.rotation.x = Math.sin(beat + l.userData.ph) * 0.7 * gallop;
    // lance dressée à l'attente, couchée pendant la charge, pointée par-dessus la lice
    const low = on ? smoothstep(1.7, 2.3, lt) * (1 - smoothstep(4.3, 4.9, lt)) : 0;
    k.lance.rotation.x = -1.0 * (1 - low) - 0.04;
    k.lance.rotation.y = 0.15 * low * (k.team === 0 ? dirA : -dirA);
  }

  update(dt: number, hour: number) {
    this.t += dt;
    const t = this.t, day = smoothstep(7, 8, hour) * (1 - smoothstep(19.5, 20.5, hour)), d = this.dummy;
    let n = 0;
    for (const e of this.entries.values()) {
      if (e.pop < 1) { e.pop = Math.min(1, e.pop + dt / 0.6); e.group.scale.setScalar(Math.max(0.001, easeOutBack(e.pop))); }
      for (let i = 0; i < e.fires.length && n < MAX_FLAMES; i += 4) {
        const s = e.fires[i + 3] * Math.min(1, e.pop * 1.5), ph = e.fires[i] * 3.1 + e.fires[i + 2] * 1.7;
        d.position.set(e.fires[i], e.fires[i + 1], e.fires[i + 2]);
        d.rotation.set(0, t * 1.5 + ph, 0);
        d.scale.set(s * (0.92 + 0.1 * Math.sin(t * 17 + ph)), s * (0.85 + 0.22 * Math.sin(t * 11 + ph) + 0.1 * Math.sin(t * 27 + ph * 2)), s * (0.92 + 0.1 * Math.cos(t * 15 + ph)));
        d.updateMatrix();
        this.flames.setMatrixAt(n++, d.matrix);
      }
      for (const k of e.dyn) {
        if (k.kind === 'swing') k.obj.rotation.x = Math.sin(t * 2.6 + k.ph) * 0.45 * day;
        else if (k.kind === 'seesaw') k.obj.rotation.x = Math.sin(t * 1.5 + k.ph) * 0.2 * day;
        else if (k.kind === 'spin') { k.spin += dt * 0.9 * day; k.obj.rotation.y = k.base + k.spin; }
        else if (k.kind === 'hover') { k.obj.position.y = k.y0 + Math.sin(t * 1.4 + k.ph) * 0.025 * k.s0; k.obj.rotation.y = k.base + t * 0.35; }
        else if (k.kind === 'orbit') { k.spin += dt * 0.8; k.obj.rotation.y = k.base + k.spin; k.obj.position.y = k.y0 + Math.sin(t * 2.2 + k.ph) * 0.012 * k.s0; }
        else { k.obj.scale.y = k.s0 * (0.85 + 0.15 * Math.sin(t * 7 + k.ph)); k.obj.visible = !this.frozen; }
      }
      for (const k of e.knights) this.animKnight(k, e, t, day);
    }
    this.flames.count = n;
    this.flames.instanceMatrix.needsUpdate = true;
  }

  /** Teintes de la saison : feuillage, neige, fleurs (pas l'hiver), eau gelée */
  applySeason(s: SeasonState) {
    // comme les arbres de la forêt : branches nues l'hiver, une touffe de neige au bout
    this.uLeaf.value = Math.max(0.25, s.leaf);
    this.leafMat.color.copy(s.foliage2);
    this.leafMat.emissiveIntensity = this.everMat.emissiveIntensity = s.snow * 0.3;
    this.flowersOn = s.leaf > 0.5 && s.snow < 0.3;
    this.frozen = s.snow > 0.55;
    this.waterMat.color.setHex(this.frozen ? 0xdbeaf0 : 0x7cc6dc);
    this.waterMat.opacity = this.frozen ? 1 : 0.88;
    for (const e of this.entries.values()) if (e.flowers) e.flowers.visible = this.flowersOn;
  }

  /** Feux des jardins (x, z, rayon, intensité à la suite) : leur halo de lumière la nuit */
  lights(out: number[]) {
    for (const e of this.entries.values()) for (let i = 0; i < e.fires.length; i += 4) out.push(e.fires[i], e.fires[i + 2], 0.6 + 0.6 * e.fires[i + 3], 0.55 + 0.25 * e.fires[i + 3]);
  }

  /** Feux des jardins (x, y, z, 1 = feu de bois) : la fumée et le crépitement s'y ajoutent à ceux des cheminées */
  chimneys(out: number[]) {
    for (const e of this.entries.values()) for (let i = 0; i < e.fires.length; i += 4) out.push(e.fires[i], e.fires[i + 1] + 0.22 * e.fires[i + 3], e.fires[i + 2], 1);
  }

  private dispose(e: Entry) {
    this.group.remove(e.group);
    e.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }
}
