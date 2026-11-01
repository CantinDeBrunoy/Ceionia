import * as THREE from 'three';
import { Parts } from './parts';
import { KindId, KINDS } from '../build/catalog';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeFit, hasModel, ModelName } from './assets';

/**
 * Bâtiments importés (CC0), par sorte puis par âge : leurs variantes ; null ou absent, le modèle procédural.
 * Chaumières et maisons, forge, marché, église, moulin, château et puits du Moyen Âge : KayKit Medieval Hexagon ;
 * maisons de brique, usines et éolienne : City Kits de Kenney ; résidences et bureaux modernes : KayKit City Builder Bits
 */
const IMPORTED: Partial<Record<KindId, (ModelName[] | null)[]>> = {
  house: [null, ['b_cottage_red', 'b_cottage_yellow'],
    ['b_house_blue', 'b_house_red', 'b_house_green', 'b_house_yellow', 'b_cottage_blue', 'b_cottage_green'],
    ['b_brick_c', 'b_brick_d', 'b_brick_j', 'b_brick_o', 'b_brick_u'], ['b_flat_a', 'b_flat_b', 'b_flat_d', 'b_flat_h']],
  well: [null, ['b_well_red'], ['b_well_blue']],
  workshop: [null, null, ['b_forge_blue', 'b_forge_red'], ['b_factory_m', 'b_factory_c', 'b_factory_e'], ['b_office_c', 'b_office_e', 'b_office_f', 'b_office_g']],
  gather: [null, null, ['b_market_blue', 'b_market_red']],
  temple: [null, null, ['b_church_blue', 'b_church_red'], ['b_church_red', 'b_church_blue']],
  mill: [null, null, ['b_windmill_blue', 'b_windmill_red'], ['b_plant_n', 'b_plant_h'], ['b_turbine']],
  landmark: [null, null, ['b_castle_blue', 'b_castle_red'], ['b_station_s']],
};
/** Tours de l'époque moderne : quatre immeubles sur la parcelle de 2 × 2 */
const TOWERS: ModelName[] = ['b_office_g', 'b_flat_h', 'b_office_c', 'b_flat_b'];
/** Maisons de brique (maisons de banlieue de Kenney recolorées) : murs de brique, toits d'ardoise ou de tuile */
const BRICK_WALL = [0xb4685c, 0xc27a5e, 0xa85e50, 0xc98a62, 0xb06a58].map((c) => new THREE.Color(c));
const BRICK_ROOF = [0x5d6a80, 0x9a4a3c, 0x4f5966, 0x8c5040, 0x5a6478].map((c) => new THREE.Color(c));
function brickRemap(i: number) {
  return (c: THREE.Color) => {
    const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
    if (c.g > c.r * 1.6 && c.g > c.b * 1.3) c.copy(BRICK_ROOF[i % 5]).multiplyScalar(0.6 + c.g);
    else if (mn > 0.7 && mx - mn < 0.12) c.copy(BRICK_WALL[i % 5]).multiplyScalar(0.75 + 0.3 * mx);
  };
}
/** Modèles dont la porte est au dos : on les retourne pour que la façade regarde la route */
const BACKWARD = new Set<ModelName>(['b_factory_c', 'b_factory_e', 'b_plant_n', 'b_plant_h', 'b_station_s']);
/** Part de la case occupée par un modèle importé (sa plus grande largeur) ; les maisons laissent une ruelle entre voisines */
const FIT: Partial<Record<KindId, number>> = { well: 0.62, mill: 0.9, landmark: 0.95, house: 0.84 };

/** Modèle importé de la sorte et de l'âge, s'il y en a : façade vers +z, à l'échelle de la case ; fumée au sommet des ateliers */
function importedModel(kind: KindId, age: number, v: number, size: number): Model | null {
  const names = IMPORTED[kind]?.[age]?.filter(hasModel);
  if (!names?.length) return null;
  const name = names[v % names.length], key = `m|${kind}|${age}|${name}|${size}`;
  const known = cache.get(key);
  if (known) return known;
  const body = bakeFit(name, size * (FIT[kind] ?? 0.92), BACKWARD.has(name) ? Math.PI : 0, name.startsWith('b_brick_') ? brickRemap(names.indexOf(name)) : undefined);
  if (!body) return null;
  // la forge et les usines fument par leur plus haute cheminée (le sommet du modèle)
  const smokeAt: number[] = [];
  if ((kind === 'workshop' || kind === 'mill') && age >= 2 && age <= 3) {
    const p = body.attributes.position;
    let top = 0;
    for (let i = 1; i < p.count; i++) if (p.getY(i) > p.getY(top)) top = i;
    smokeAt.push(p.getX(top), p.getY(top) + 0.02, p.getZ(top), age === 2 ? 1 : 2);
  }
  const m: Model = { body, glow: null, smoke: smokeAt };
  cache.set(key, m);
  return m;
}

export const C = {
  cream: 0xf4e8d0, pink: 0xf1c9c4, mint: 0xcde8d6, sky: 0xcfe2f0, butter: 0xf8e5a6, lav: 0xd8cdea, white: 0xf7f3ec,
  terracotta: 0xe39a86, thatch: 0xdcc080, slate: 0x8e9bb4, brown: 0xb48a68, red: 0xd8786c, teal: 0x86c4b8,
  wood: 0xb08968, darkwood: 0x7a6355, stone: 0xcfcac2, darkstone: 0x9d9890, dirt: 0xcdb08a, gold: 0xe8c66a,
  green: 0x9ccf92, darkgreen: 0x7fb87f, door: 0x7a5a48, win: 0x9db4c6, brick: 0xd98f80, darkbrick: 0xb4685c,
  glass: 0xbfe0ee, roofdark: 0x6f7c96, metal: 0x9aa3ad, flame: 0xffb15c, water: 0x8fd0e0, hide: 0xd9b99b,
};
const WALLS = [C.cream, C.pink, C.mint, C.sky, C.butter, C.lav];
const ROOFS = [C.terracotta, C.teal, C.red, C.slate, C.brown, C.thatch];

export interface ModelOpts { v: number; L: boolean; R: boolean; F: boolean; /** resté en 1 × 1 (ancienne partie) */ small?: boolean }

/** Bâtiments passés en 2 × 2 dont le modèle procédural est dessiné pour une case : on l'agrandit d'autant */
const UPSCALE: KindId[] = ['temple', 'workshop', 'mill'];
const UP = 1.85;
/** Géométries d'un bâtiment, et sommets de ses cheminées (x, y, z, sorte : 0 foyer, 1 feu de bois, 2 forge ou usine) */
export interface Model { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; smoke: number[] }

/** Cheminées du modèle en cours de construction */
let smokeOut: number[] = [];
function smoke(x: number, y: number, z: number, kind: number) { smokeOut.push(x, y, z, kind); }

/** Modèles importés posés sur la parcelle du modèle en cours (ex. la tour de guet KayKit de la caserne médiévale) */
let attachOut: THREE.BufferGeometry[] = [];
/** Pose une variante du modèle importé, large de `width`, en (x, z) ; false s'il n'est pas chargé */
function attach(names: ModelName[], v: number, width: number, x: number, z: number, ry = 0): boolean {
  const ok = names.filter(hasModel);
  const g = ok.length ? bakeFit(ok[v % ok.length], width, ry) : null;
  if (!g) return false;
  attachOut.push(g.translate(x, 0, z));
  return true;
}

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
  if (age === 0) { prehistoricHut(p, o.v); return; }
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
  if (age === 2) { medievalHouse(p, o, x0, x1, cx, d, zc, rw, rcx); return; }
  const h = age === 3 ? 0.55 : 0.32;
  const wc = age === 3 ? C.brick : wall;
  const rc = age === 3 ? C.slate : roofC;
  const frame = age === 3 ? C.white : C.wood;
  // soubassement de pierre, murs, toit
  p.box(w + 0.03, 0.05, d + 0.03, cx, 0, zc, age === 3 ? C.darkstone : C.stone);
  p.box(w, h - 0.05, d, cx, 0.05, zc, wc);
  const roofH = age === 3 ? 0.3 : 0.22;
  roof(p, cx, h, zc, { w, d, h: roofH, color: rc, wall: wc, len: rw, dx: rcx - cx });
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
  };
  const floors = age === 3 ? [0.14, 0.36] : [0.14];
  const off = 0.23;
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

/** Huttes de la Préhistoire, trois variantes : hutte ronde de clayonnage au chaume épais, maison longue, tipi de peaux peint */
function prehistoricHut(p: Parts, v: number) {
  const straw = [0xe2c472, 0xd9b964, 0xe8cf86][v % 3], strawDark = dark(straw, 0.78), wattle = 0xc59f72, stake = 0x7a5a3e;
  const ring = (n: number, r: number, y: number) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.3; p.sphere(0.03 + (i % 3) * 0.006, Math.cos(a) * r, y, Math.sin(a) * r, i % 2 ? C.stone : C.darkstone, 0, 0.6); } };
  if (v % 3 === 0) {
    // hutte ronde : mur de clayonnage cerclé, pieux qui dépassent, chaume en trois couches, perches croisées au faîte
    ring(12, 0.34, 0.01);
    p.cyl(0.3, 0.32, 0.26, 10, 0, 0, -0.02, wattle);
    for (const y of [0.07, 0.17]) p.add(new THREE.CylinderGeometry(0.316 - y * 0.06, 0.318 - y * 0.06, 0.03, 10, 1, true), 0, y, -0.02, dark(wattle, 0.75));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.31; p.cyl(0.011, 0.013, 0.3, 4, Math.cos(a) * 0.318, 0, Math.sin(a) * 0.318 - 0.02, stake); }
    p.cone(0.47, 0.14, 10, 0, 0.21, -0.02, strawDark);
    p.cone(0.44, 0.3, 10, 0, 0.25, -0.02, straw);
    p.cone(0.3, 0.26, 10, 0, 0.42, -0.02, dark(straw, 0.92));
    p.cone(0.14, 0.16, 8, 0, 0.6, -0.02, strawDark);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.011, 0.011, 0.26, 4), s * 0.03, 0.78, -0.02, C.darkwood, 0, false, s * 0.38);
    smoke(0, 0.8, -0.02, 1);
    // porte : linteau, ouverture sombre, peau relevée
    p.box(0.16, 0.025, 0.05, 0, 0.21, 0.29, C.darkwood);
    p.box(0.12, 0.2, 0.03, 0, 0, 0.3, 0x3d2c22);
    p.box(0.07, 0.15, 0.012, 0.075, 0.05, 0.315, C.hide, 0.15);
  } else if (v % 3 === 1) {
    // maison longue : murs bas de clayonnage, grand toit de chaume qui descend presque au sol, cornes de perches aux pignons
    p.box(0.66, 0.035, 0.44, 0, 0, -0.04, C.darkstone);
    p.box(0.62, 0.17, 0.4, 0, 0.03, -0.04, wattle);
    for (const z of [0.161, -0.241]) for (let x = -0.27; x <= 0.27; x += 0.09) p.box(0.016, 0.2, 0.016, x, 0.02, z, stake);
    roof(p, 0, 0.2, -0.04, { w: 0.62, d: 0.4, h: 0.36, color: straw, wall: wattle, len: 0.78, ov: 0.12 });
    p.box(0.8, 0.04, 0.06, 0, 0.555, -0.04, strawDark);
    // rangs de chaume sur chaque pan
    const ang = Math.atan2(0.36, 0.2);
    for (const s of [-1, 1]) for (const f of [0.18, 0.46, 0.74]) p.add(new THREE.BoxGeometry(0.79, 0.02, 0.06).rotateX(s * ang), 0, 0.2 + f * 0.36 + 0.012, -0.04 + s * ((1 - f) * 0.2 + 0.016), strawDark);
    for (const s of [-1, 1]) for (const k of [-1, 1]) p.add(new THREE.CylinderGeometry(0.01, 0.012, 0.22, 4), s * 0.37, 0.6, -0.04 + k * 0.03, C.darkwood, 0, false, 0, k * 0.5);
    smoke(0.18, 0.6, -0.04, 1);
    p.box(0.13, 0.17, 0.03, 0, 0.02, 0.165, 0x3d2c22);
    p.box(0.17, 0.025, 0.04, 0, 0.19, 0.17, C.darkwood);
  } else {
    // tipi de peaux peint de bandes d'ocre, perches au sommet, rabat ouvert
    ring(10, 0.3, 0.01);
    p.add(new THREE.ConeGeometry(0.3, 0.62, 9, 1, true), 0, 0.31, -0.02, C.hide);
    for (const [y, r, c] of [[0.1, 0.26, 0xb5553c], [0.15, 0.24, 0x7a5a3e], [0.36, 0.13, 0xb5553c]] as [number, number, number][]) p.add(new THREE.CylinderGeometry(r - 0.012, r, 0.028, 9, 1, true), 0, y, -0.02, c);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; p.add(new THREE.CylinderGeometry(0.008, 0.009, 0.26, 4).rotateZ(-0.35), Math.cos(a) * 0.03, 0.66, Math.sin(a) * 0.03 - 0.02, C.darkwood, -a); }
    smoke(0, 0.7, -0.02, 1);
    p.add(new THREE.BoxGeometry(0.11, 0.2, 0.01).translate(0, 0.1, 0), 0, 0, 0.255, 0x3d2c22, 0, false, 0, -0.45);
    p.add(new THREE.BoxGeometry(0.07, 0.18, 0.01).translate(0, 0.09, 0), 0.07, 0, 0.25, C.hide, -0.5, false, 0, -0.45);
  }
  // bois empilé, pot de terre, peau étendue devant
  log(p, 0.2, 0.026, 0.3, 0, 0.28, 0.5); log(p, 0.2, 0.026, 0.34, 0, 0.22, 0.5); log(p, 0.2, 0.026, 0.32, 0.046, 0.25, 0.5);
  p.cyl(0.035, 0.028, 0.06, 7, -0.28, 0, 0.3, 0xb5764f); p.cyl(0.03, 0.035, 0.015, 7, -0.28, 0.06, 0.3, 0x9c6445);
  p.add(new THREE.CircleGeometry(0.1, 7).rotateX(-Math.PI / 2).scale(1.3, 1, 0.9), -0.12, 0.005, 0.38, C.hide);
}

/**
 * Maison du Moyen Âge : rez-de-chaussée de pierre aux angles chaînés, étage à colombages en encorbellement, toit raide
 * bleu-vert, bleu ou de tuile ; selon la variante, une tourelle d'angle à toit pointu ou une lucarne
 */
function medievalHouse(p: Parts, o: ModelOpts, x0: number, x1: number, cx: number, d: number, zc: number, rw: number, rcx: number) {
  const w = x1 - x0, stone = [0xd3cbbd, 0xc6beb0][o.v % 2], wall = [0xf4ead8, 0xf1e4cc, 0xf6efe2][o.v % 3];
  const rc = [0x5f9a94, 0x6f86c4, 0x5f8f7a, 0xb06a52][o.v % 4], beam = C.darkwood, shutter = SHUTTERS[o.v % 4];
  const g0 = 0.25, h = 0.54, jet = 0.03, zf0 = zc + d / 2 + 0.006, zf1 = zc + d / 2 + jet + 0.006, zb1 = zc - d / 2 - jet - 0.006;
  // socle, rez-de-chaussée de pierre et pierres d'angle
  p.box(w + 0.03, 0.04, d + 0.03, cx, 0, zc, C.darkstone);
  p.box(w, g0 - 0.04, d, cx, 0.04, zc, stone);
  for (const bx of [x0 + 0.035, x1 - 0.035]) for (let k = 0, y = 0.05; y < g0 - 0.03; y += 0.06, k++) p.box(k % 2 ? 0.07 : 0.05, 0.045, 0.012, bx, y, zf0, dark(stone, 0.88));
  // étage en encorbellement, crème, et ses colombages devant et derrière
  p.box(w, h - g0, d + 2 * jet, cx, g0, zc, wall);
  for (const z of [zf1, zb1]) {
    p.box(w + 0.012, 0.032, 0.02, cx, g0, z, beam);
    p.box(w + 0.012, 0.03, 0.02, cx, h - 0.03, z, beam);
    for (const bx of [x0 + 0.02, x1 - 0.02]) p.box(0.032, h - g0, 0.02, bx, g0, z, beam);
    for (let x = x0 + 0.13; x < x1 - 0.1; x += 0.26) {
      // entre deux fenêtres : un poteau et deux décharges en V
      p.box(0.022, h - g0, 0.02, x + 0.13, g0, z, beam);
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.018, 0.17, 0.02), x + 0.13 + s * 0.045, g0 + 0.15, z, beam, 0, false, s * 0.55);
    }
  }
  // pignons à colombages (sauf contre une maison voisine)
  for (const [x, side] of [[x0 - 0.006, -1], [x1 + 0.006, 1]]) {
    if ((side < 0 && o.L) || (side > 0 && o.R)) continue;
    for (const z of [zc - d / 2 - jet + 0.02, zc + d / 2 + jet - 0.02]) p.box(0.02, h - g0, 0.035, x, g0, z, beam);
    const hh = h - g0 - 0.06, dd = d + 2 * jet - 0.08, ang = Math.atan2(dd, hh), len = Math.hypot(hh, dd);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.02, len, 0.02), x, g0 + 0.03 + hh / 2, zc, beam, 0, false, 0, s * ang);
  }
  roof(p, cx, h, zc, { w, d: d + 2 * jet, h: 0.42, color: rc, wall, len: rw, dx: rcx - cx, ov: 0.09 });
  // porte de bois sous un linteau, marche ; fenêtres à volets
  p.box(0.17, 0.2, 0.014, cx, 0.04, zf0 - 0.002, dark(stone, 0.8));
  p.box(0.13, 0.18, 0.02, cx, 0.04, zf0, C.door);
  p.box(0.2, 0.025, 0.07, cx, 0, zf0 + 0.035, C.stone);
  const win = (x: number, y: number, z: number, sh: boolean) => {
    p.box(0.12, 0.13, 0.014, x, y - 0.015, z - 0.002, beam);
    p.box(0.09, 0.1, 0.02, x, y, z, C.win, 0, true);
    if (sh) for (const s of [-1, 1]) p.box(0.04, 0.12, 0.014, x + s * 0.085, y - 0.01, z + 0.004, shutter);
  };
  for (const sx of [-0.22, 0.22]) { const x = cx + sx * (w > 0.9 ? 1.2 : 1); if (x - 0.08 > x0 && x + 0.08 < x1) win(x, 0.1, zf0, false); }
  for (let x = x0 + 0.13; x < x1 - 0.05; x += 0.26) win(x, 0.34, zf1, true);
  // tourelle d'angle ou lucarne, cheminée
  const corner = o.v % 3 === 0 ? (!o.R ? x1 - 0.02 : !o.L ? x0 + 0.02 : null) : null;
  if (corner !== null) {
    const tz = zc + d / 2 + jet - 0.04;
    p.cyl(0.085, 0.07, h - g0 + 0.16, 8, corner, g0 - 0.06, tz, wall);
    p.add(new THREE.CylinderGeometry(0.088, 0.088, 0.025, 8, 1, true), corner, g0 + 0.02, tz, beam);
    p.add(new THREE.CylinderGeometry(0.088, 0.088, 0.025, 8, 1, true), corner, h + 0.06, tz, beam);
    p.box(0.05, 0.07, 0.02, corner, h - 0.06, tz + 0.08, C.win, 0, true);
    p.cone(0.115, 0.34, 8, corner, h + 0.1, tz, rc);
    p.sphere(0.018, corner, h + 0.45, tz, C.gold);
  } else if (o.v % 3 === 1) {
    const dz = zc + d * 0.2;
    p.box(0.14, 0.13, 0.16, cx, h + 0.04, dz, wall);
    p.box(0.08, 0.08, 0.02, cx, h + 0.07, dz + 0.081, C.win, 0, true);
    roof(p, cx, h + 0.17, dz, { w: 0.16, d: 0.15, h: 0.09, color: rc, wall, ry: Math.PI / 2, ov: 0.03 });
  }
  if (o.v % 2 === 0) {
    p.box(0.09, 0.62, 0.09, rcx + rw * 0.28, h - 0.1, zc - 0.12, stone);
    p.box(0.11, 0.03, 0.11, rcx + rw * 0.28, h + 0.52, zc - 0.12, C.darkstone);
    smoke(rcx + rw * 0.28, h + 0.57, zc - 0.12, 0);
  }
  // jardinet clôturé quand la maison ne donne pas sur une route
  if (!o.F) {
    for (let i = 0; i < 5; i++) p.box(0.03, 0.1, 0.03, -0.4 + i * 0.2, 0, 0.46, C.wood);
    p.box(0.84, 0.025, 0.02, 0, 0.06, 0.46, C.wood);
    p.sphere(0.045, -0.2, 0.03, 0.37, C.pink, 0, 0.8);
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
    // forge : maison de pierre au toit d'ardoise et grande cheminée, appentis où rougeoie le foyer, enclume et tonneau devant
    p.box(0.58, 0.04, 0.44, 0.08, 0, -0.12, C.darkstone); p.box(0.56, 0.32, 0.42, 0.08, 0.04, -0.12, C.stone);
    roof(p, 0.08, 0.36, -0.12, { w: 0.56, d: 0.42, h: 0.28, color: C.slate, wall: C.stone, ov: 0.07 });
    p.box(0.13, 0.66, 0.13, 0.28, 0.04, -0.2, C.darkstone); p.box(0.15, 0.04, 0.15, 0.28, 0.7, -0.2, 0x7d7870);
    smoke(0.28, 0.76, -0.2, 1);
    p.box(0.12, 0.2, 0.02, 0.16, 0.04, 0.1, C.door); p.box(0.09, 0.08, 0.02, -0.06, 0.16, 0.1, C.win, 0, true);
    // appentis de planches sur deux poteaux
    for (const x of [-0.38, -0.04]) p.box(0.03, 0.3, 0.03, x, 0, 0.36, C.darkwood);
    p.add(new THREE.BoxGeometry(0.4, 0.02, 0.3), -0.21, 0.32, 0.24, C.wood, 0, false, 0, 0.22);
    // foyer maçonné, braises, hotte
    p.box(0.2, 0.12, 0.14, -0.22, 0, 0.17, C.darkstone); p.box(0.14, 0.02, 0.09, -0.22, 0.12, 0.17, C.flame, 0, true);
    p.pyramid(0.17, 0.13, 0.13, -0.22, 0.18, 0.15, 0x6f6a64);
    // enclume sur billot, tonneau d'eau
    p.cyl(0.04, 0.045, 0.07, 7, 0.08, 0, 0.32, C.darkwood); p.box(0.09, 0.03, 0.04, 0.08, 0.07, 0.32, 0x55595f); p.box(0.04, 0.02, 0.03, 0.135, 0.08, 0.32, 0x55595f);
    p.cyl(0.045, 0.04, 0.09, 8, 0.24, 0, 0.3, 0x9a6a44); p.cyl(0.04, 0.04, 0.005, 8, 0.24, 0.09, 0.3, C.water);
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
    // marché : étals de bois sous des auvents rayés à lambrequin, fruits, caisses et tonneaux
    const cols = [0xd8584e, 0x4f7fc4, 0x6fae6a];
    for (const [x, z] of [[0.38, 0.32], [-0.4, 0.3]]) { p.cyl(0.05, 0.045, 0.1, 8, x, 0, z, 0x9a6a44); p.cyl(0.052, 0.052, 0.008, 8, x, 0.04, z, C.darkwood); }
    [[-0.22, -0.2], [0.22, -0.2], [0, 0.2]].forEach(([x, z], i) => {
      p.box(0.3, 0.1, 0.16, x, 0, z, C.wood);
      for (const sx of [-0.14, 0.14]) { p.box(0.022, 0.32, 0.022, x + sx, 0, z - 0.08, C.darkwood); p.box(0.022, 0.25, 0.022, x + sx, 0, z + 0.08, C.darkwood); }
      for (let k = 0; k < 4; k++) {
        const sxk = x - 0.13 + k * 0.087, col = k % 2 ? 0xf4e8d0 : cols[i];
        p.add(new THREE.BoxGeometry(0.088, 0.012, 0.26), sxk, 0.29, z, col, 0, false, 0, 0.27);
        for (const t of [-0.022, 0.022]) p.add(new THREE.ConeGeometry(0.022, 0.04, 3).rotateZ(Math.PI), sxk + t, 0.21, z + 0.125, col);
      }
      for (const [fx, fc] of [[-0.08, C.red], [0, C.gold], [0.08, 0x7cc46a]] as [number, number][]) p.sphere(0.035, x + fx, 0.12, z + 0.02, fc, 0, 0.8);
      p.box(0.07, 0.06, 0.07, x + 0.18, 0, z + 0.12, 0xb48a5e, 0.4);
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
    // moulin à vent : tour octogonale à colombages sur socle de pierre, chapeau conique de bardeaux, quatre ailes en treillis
    p.cyl(0.28, 0.3, 0.08, 8, 0, 0, 0, C.stone);
    p.cyl(0.2, 0.26, 0.64, 8, 0, 0.08, 0, C.cream);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.add(new THREE.BoxGeometry(0.024, 0.65, 0.02), Math.cos(a) * 0.232, 0.4, Math.sin(a) * 0.232, C.darkwood, -a, false, 0.094); }
    for (const [y, r] of [[0.3, 0.244], [0.56, 0.222]]) p.add(new THREE.CylinderGeometry(r, r, 0.028, 8, 1, true), 0, y, 0, C.darkwood);
    p.cyl(0.235, 0.235, 0.035, 8, 0, 0.72, 0, C.darkwood);
    p.cone(0.28, 0.32, 8, 0, 0.755, 0, 0x8a5a44);
    p.sphere(0.022, 0, 1.08, 0, C.darkwood);
    p.box(0.1, 0.16, 0.02, 0, 0.08, 0.262, C.door); p.box(0.07, 0.08, 0.02, 0, 0.42, 0.226, C.win, 0, true);
    // ailes : un longeron, une toile tendue d'un côté, un treillis
    const hub = [0, 0.64, 0.3];
    p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8).rotateX(Math.PI / 2), hub[0], hub[1], hub[2] - 0.04, C.darkwood);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      p.add(new THREE.BoxGeometry(0.022, 0.6, 0.02).translate(0, 0.33, 0), hub[0], hub[1], hub[2], C.wood, 0, false, a);
      p.add(new THREE.BoxGeometry(0.12, 0.42, 0.008).translate(0.07, 0.4, -0.006), hub[0], hub[1], hub[2], 0xf4ead8, 0, false, a);
      p.add(new THREE.BoxGeometry(0.012, 0.44, 0.012).translate(0.135, 0.4, 0), hub[0], hub[1], hub[2], C.wood, 0, false, a);
      for (let j = 0; j < 4; j++) p.add(new THREE.BoxGeometry(0.15, 0.01, 0.012).translate(0.065, 0.22 + j * 0.12, 0.004), hub[0], hub[1], hub[2], C.wood, 0, false, a);
    }
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

/** Croix rouge sur fond blanc, face à +z, centrée en (x, y, z) */
function redCross(p: Parts, x: number, y: number, z: number, s = 1) {
  p.box(0.16 * s, 0.16 * s, 0.015, x, y - 0.08 * s, z, C.white);
  p.box(0.11 * s, 0.035 * s, 0.01, x, y - 0.0175 * s, z + 0.01, 0xd84a3e);
  p.box(0.035 * s, 0.11 * s, 0.01, x, y - 0.055 * s, z + 0.01, 0xd84a3e);
}

/** Rangée de fenêtres éclairées la nuit sur la façade z */
function windows(p: Parts, xs: number[], y: number, z: number, w = 0.08, h = 0.1) {
  for (const x of xs) p.box(w, h, 0.02, x, y, z, C.win, 0, true);
}

/** Pieu, mât, poteau : cylindre fin incliné de (rx, rz) */
function pole(p: Parts, r: number, h: number, x: number, z: number, color: number, rx = 0, rz = 0, y = 0) {
  p.add(new THREE.CylinderGeometry(r, r * 1.2, h, 5).translate(0, h / 2, 0), x, y, z, color, 0, false, rz, rx);
}

/** Petit arbre rond sur son tronc */
function tree(p: Parts, x: number, z: number, s = 1, leaf = C.darkgreen) {
  p.cyl(0.018 * s, 0.024 * s, 0.14 * s, 5, x, 0, z, C.wood);
  p.sphere(0.1 * s, x, 0.2 * s, z, leaf, 0, 0.9);
}

/** Cercle de pierres et flammes d'un feu (avec sa fumée) */
function campfire(p: Parts, x: number, z: number, s = 1) {
  for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; p.sphere(0.03 * s, x + Math.cos(a) * 0.085 * s, 0.01, z + Math.sin(a) * 0.085 * s, i % 2 ? C.darkstone : C.stone, 0, 0.7); }
  p.cone(0.045 * s, 0.12 * s, 5, x, 0.02, z, C.flame, true);
  smoke(x, 0.16 * s, z, 1);
}

/** Lieux de soins (2 × 2) : camp du guérisseur, asclépiéion, hôtel-Dieu, hôpital en U, centre hospitalier */
function health(p: Parts, age: number) {
  if (age === 0) {
    // deux huttes de peaux, un grand séchoir à herbes, la marmite sur le feu, nattes des malades, carrés de simples
    p.cyl(0.86, 0.88, 0.012, 14, 0, 0, 0, dark(C.dirt, 0.92));
    p.cone(0.36, 0.64, 7, -0.46, 0, -0.44, C.hide); p.add(new THREE.ConeGeometry(0.12, 0.28, 3), -0.46, 0.14, -0.1, C.darkwood);
    for (const a of [-0.25, 0.25]) pole(p, 0.008, 0.24, -0.46 + a * 0.1, -0.44, C.wood, 0, a, 0.58);
    p.cone(0.28, 0.5, 6, 0.46, 0, -0.52, 0xc9a98a); p.add(new THREE.ConeGeometry(0.09, 0.22, 3), 0.46, 0.11, -0.26, C.darkwood);
    for (const x of [0.02, 0.4, 0.78]) p.box(0.03, 0.44, 0.03, x, 0, 0.1, C.wood);
    p.box(0.8, 0.025, 0.025, 0.4, 0.42, 0.1, C.wood);
    for (let i = 0; i < 9; i++) p.add(new THREE.ConeGeometry(0.03, 0.12, 5).rotateZ(Math.PI), 0.06 + i * 0.085, 0.35, 0.1, [0x8fbf6a, 0x6fa35a, C.lav][i % 3]);
    campfire(p, -0.22, 0.32);
    for (const a of [0, 2.1, 4.2]) pole(p, 0.007, 0.3, -0.22 + Math.cos(a) * 0.09, 0.32 + Math.sin(a) * 0.09, C.darkwood, -Math.sin(a) * 0.3, Math.cos(a) * 0.3);
    p.sphere(0.06, -0.22, 0.17, 0.32, 0x4a4440, 0, 0.8);
    for (const z of [0.5, 0.72]) { p.box(0.3, 0.015, 0.16, -0.62, 0, z, C.hide); p.box(0.07, 0.04, 0.12, -0.74, 0.015, z, 0xe8dcc0); }
    p.cyl(0.05, 0.04, 0.07, 7, 0.12, 0, 0.6, C.darkstone); pole(p, 0.008, 0.12, 0.13, 0.6, C.wood, 0, -0.4, 0.05);
    for (const [x, z, c] of [[0.45, 0.55, 0x8fbf6a], [0.68, 0.55, C.lav], [0.45, 0.76, 0x6fa35a], [0.68, 0.76, 0xd8c060]] as [number, number, number][]) {
      p.box(0.18, 0.03, 0.16, x, 0, z, dark(C.dirt, 0.7));
      for (const d of [-0.05, 0.05]) p.sphere(0.035, x + d, 0.04, z + d * 0.6, c, 0, 0.7);
    }
    log(p, 0.36, 0.035, 0.05, 0, 0.4, 0.4);
  } else if (age === 1) {
    // sanctuaire d'Asclépios : temple à colonnes, portique, bassin de l'eau sacrée, cyprès et jardin des simples
    p.box(1.76, 0.05, 1.16, 0, 0, -0.36, C.stone); p.box(1.66, 0.05, 1.06, 0, 0.05, -0.36, 0xe6dccb);
    p.box(0.66, 0.4, 0.5, -0.38, 0.1, -0.56, C.white);
    for (let i = 0; i < 4; i++) p.cyl(0.035, 0.04, 0.4, 7, -0.62 + i * 0.16, 0.1, -0.2, C.white);
    p.box(0.74, 0.05, 0.84, -0.38, 0.5, -0.42, C.white);
    p.gable(0.86, 0.18, 0.76, -0.38, 0.55, -0.42, C.terracotta, Math.PI / 2);
    p.box(0.12, 0.2, 0.02, -0.38, 0.1, -0.305, C.door);
    // portique couvert
    p.box(0.62, 0.32, 0.08, 0.48, 0.1, -0.82, 0xe6dccb);
    for (let i = 0; i < 4; i++) p.cyl(0.03, 0.034, 0.32, 7, 0.22 + i * 0.17, 0.1, -0.5, C.white);
    p.add(new THREE.BoxGeometry(0.7, 0.025, 0.42), 0.48, 0.44, -0.66, C.terracotta, 0, false, 0, -0.12);
    for (const x of [0.32, 0.62]) p.box(0.2, 0.05, 0.08, x, 0.1, -0.72, C.stone);
    // bassin sacré
    p.box(0.96, 0.07, 0.36, -0.05, 0, 0.45, C.stone); p.box(0.86, 0.012, 0.26, -0.05, 0.062, 0.45, C.water);
    p.cyl(0.03, 0.04, 0.16, 6, -0.05, 0.07, 0.45, C.white); p.sphere(0.03, -0.05, 0.25, 0.45, C.white);
    for (const x of [-0.86, 0.86]) { p.cyl(0.02, 0.025, 0.1, 5, x, 0, 0.46, C.wood); p.cone(0.09, 0.42, 6, x, 0.08, 0.46, C.darkgreen); }
    for (const [x, c] of [[0.55, 0x8fbf6a], [0.72, C.lav]] as [number, number][]) { p.box(0.14, 0.04, 0.24, x, 0, 0.78, C.darkwood); p.sphere(0.04, x, 0.05, 0.72, c, 0, 0.7); p.sphere(0.04, x, 0.05, 0.84, c, 0, 0.7); }
    // bâton au serpent devant le temple
    p.box(0.08, 0.06, 0.08, -0.38, 0.1, 0.0, C.stone);
    p.cyl(0.01, 0.01, 0.32, 5, -0.38, 0.16, 0.0, C.gold);
    for (const y of [0.28, 0.36, 0.43]) p.add(new THREE.TorusGeometry(0.022, 0.006, 4, 8).rotateX(Math.PI / 2), -0.38, y, 0.0, 0x6fa35a);
  } else if (age === 2) {
    // hôtel-Dieu : grande salle des malades (pierre et colombages), chapelle et clocher, jardin clos de simples autour d'un puits
    p.box(1.82, 0.03, 1.82, 0, 0, 0, 0xd9cdb8);
    p.box(1.36, 0.3, 0.55, -0.18, 0.03, -0.6, C.stone);
    p.box(1.4, 0.26, 0.59, -0.18, 0.33, -0.6, C.cream);
    for (let x = -0.86; x <= 0.5; x += 0.17) p.box(0.022, 0.26, 0.02, x, 0.33, -0.3, C.darkwood);
    for (const y of [0.33, 0.57]) p.box(1.4, 0.025, 0.02, -0.18, y, -0.3, C.darkwood);
    roof(p, -0.18, 0.59, -0.6, { w: 1.4, d: 0.59, h: 0.4, color: 0x8a5a44, wall: C.cream });
    p.box(0.14, 0.22, 0.02, -0.18, 0.03, -0.32, C.door);
    windows(p, [-0.72, -0.46, 0.1, 0.34], 0.12, -0.32, 0.07, 0.1); windows(p, [-0.72, -0.46, -0.18, 0.1, 0.34], 0.39, -0.29, 0.06, 0.09);
    // chapelle et clocher
    p.box(0.36, 0.48, 0.66, 0.7, 0.03, -0.58, C.stone);
    roof(p, 0.7, 0.51, -0.58, { w: 0.66, d: 0.36, h: 0.26, color: C.slate, wall: C.stone, ry: Math.PI / 2 });
    p.box(0.18, 0.86, 0.18, 0.7, 0.03, -0.18, C.stone); p.pyramid(0.24, 0.34, 0.24, 0.7, 0.89, -0.18, C.slate);
    p.box(0.08, 0.1, 0.02, 0.7, 0.66, -0.085, 0x3c3530); p.sphere(0.03, 0.7, 0.66, -0.12, C.gold, 0, 1.2);
    p.box(0.08, 0.16, 0.02, 0.7, 0.2, -0.085, C.win, 0, true);
    // jardin clos : haies de buis, carrés de simples, puits au milieu
    for (const [x, z, w, d] of [[-0.48, 0.86, 0.8, 0.05], [0.48, 0.86, 0.8, 0.05], [-0.86, 0.32, 0.05, 1.04], [0.86, 0.32, 0.05, 1.04]]) p.box(w, 0.08, d, x, 0.03, z, C.darkgreen);
    for (const [x, z, c] of [[-0.5, 0.12, 0x8fbf6a], [0.5, 0.12, C.lav], [-0.5, 0.56, 0xd8c060], [0.5, 0.56, 0x6fa35a]] as [number, number, number][]) {
      p.box(0.4, 0.04, 0.28, x, 0.03, z, dark(C.dirt, 0.75));
      for (const d of [-0.12, 0, 0.12]) p.sphere(0.04, x + d, 0.08, z, c, 0, 0.7);
    }
    p.cyl(0.11, 0.12, 0.12, 8, 0, 0.03, 0.34, C.stone); p.cyl(0.08, 0.08, 0.01, 8, 0, 0.15, 0.34, C.water);
    for (const x of [-0.1, 0.1]) p.box(0.025, 0.24, 0.025, x, 0.03, 0.34, C.wood);
    p.gable(0.26, 0.1, 0.2, 0, 0.27, 0.34, C.slate);
    // bannière à croix rouge
    p.cyl(0.009, 0.009, 0.6, 4, -0.7, 0.03, 0.62, C.darkwood);
    p.box(0.12, 0.15, 0.006, -0.64, 0.45, 0.62, C.white); p.box(0.08, 0.025, 0.008, -0.64, 0.51, 0.622, 0xd84a3e); p.box(0.025, 0.08, 0.008, -0.64, 0.475, 0.622, 0xd84a3e);
  } else if (age === 3) {
    // hôpital de brique en U : corps central à fronton et horloge, deux ailes, cour plantée et fontaine, grille et ambulances à cheval
    p.box(1.86, 0.025, 1.86, 0, 0, 0, 0xd9d2c4);
    p.box(0.92, 0.62, 0.44, 0, 0.03, -0.66, C.brick); p.box(0.94, 0.035, 0.46, 0, 0.33, -0.66, C.cream);
    roof(p, 0, 0.65, -0.66, { w: 0.92, d: 0.44, h: 0.22, color: C.slate, wall: C.brick });
    p.box(0.34, 0.78, 0.1, 0, 0.03, -0.41, C.cream); p.gable(0.36, 0.16, 0.12, 0, 0.81, -0.41, C.slate);
    p.cyl(0.055, 0.055, 0.012, 12, 0, 0.66, -0.355, C.white); p.box(0.005, 0.04, 0.004, 0, 0.675, -0.348, C.darkwood); p.box(0.03, 0.005, 0.004, 0.012, 0.66, -0.348, C.darkwood);
    p.box(0.14, 0.24, 0.02, 0, 0.03, -0.355, C.door); redCross(p, 0, 0.52, -0.352, 0.85);
    for (const s of [-1, 1]) {
      p.box(0.36, 0.52, 0.88, s * 0.72, 0.03, -0.3, C.brick); p.box(0.38, 0.035, 0.9, s * 0.72, 0.29, -0.3, C.cream);
      roof(p, s * 0.72, 0.55, -0.3, { w: 0.88, d: 0.36, h: 0.2, color: C.slate, wall: C.brick, ry: Math.PI / 2 });
      for (const y of [0.1, 0.36]) {
        for (const z of [-0.6, -0.36, -0.12]) p.box(0.02, 0.1, 0.07, s * 0.535, 0.03 + y, z, C.win, 0, true);
        p.box(0.07, 0.1, 0.02, s * 0.72, 0.03 + y, 0.145, C.win, 0, true);
      }
      for (const x of [0.3, 0.18]) windows(p, [s * x], 0.13 + (x === 0.3 ? 0 : 0.26), -0.43, 0.07, 0.1);
      windows(p, [s * 0.3], 0.39, -0.43, 0.07, 0.1);
    }
    p.box(1.0, 0.02, 0.5, 0, 0.025, -0.08, C.green);
    p.cyl(0.1, 0.11, 0.05, 10, 0, 0.03, -0.08, C.stone); p.cyl(0.08, 0.08, 0.01, 10, 0, 0.075, -0.08, C.water); p.cyl(0.015, 0.02, 0.12, 5, 0, 0.08, -0.08, C.stone);
    for (const x of [-0.36, 0.36]) tree(p, x, -0.08, 0.9);
    // grille et portail, deux charrettes d'ambulance
    for (let x = -0.9; x <= 0.9; x += 0.075) if (Math.abs(x) > 0.16) p.box(0.012, 0.1, 0.012, x, 0.025, 0.9, 0x3c4a44);
    for (const s of [-1, 1]) { p.box(0.74, 0.012, 0.012, s * 0.53, 0.1, 0.9, 0x3c4a44); p.box(0.05, 0.16, 0.05, s * 0.18, 0.025, 0.9, C.cream); }
    for (const x of [-0.5, 0.45]) {
      p.box(0.18, 0.11, 0.11, x, 0.07, 0.55, C.white); p.box(0.19, 0.02, 0.12, x, 0.18, 0.55, C.slate); p.box(0.05, 0.035, 0.005, x, 0.12, 0.608, 0xd84a3e);
      for (const d of [-0.07, 0.07]) p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 8).rotateX(Math.PI / 2), x + d, 0.045, 0.55, C.darkwood);
    }
  } else {
    // centre hospitalier : grand bloc blanc à bandeaux vitrés, tour, héliport sur le toit, auvent, parking et ambulances
    p.box(1.9, 0.03, 1.9, 0, 0, 0, 0xd8d6d0);
    p.box(1.4, 0.8, 0.72, -0.2, 0.03, -0.5, C.white);
    for (const y of [0.14, 0.36, 0.58]) p.box(1.34, 0.12, 0.02, -0.2, y, -0.135, 0x9fd0e4, 0, true);
    p.box(1.44, 0.04, 0.76, -0.2, 0.83, -0.5, 0xe4e2dc);
    p.box(0.42, 1.2, 0.56, 0.68, 0.03, -0.55, 0xe8eef2);
    for (const x of [0.56, 0.68, 0.8]) p.box(0.06, 1.0, 0.02, x, 0.12, -0.265, 0x9fd0e4, 0, true);
    p.box(0.46, 0.04, 0.6, 0.68, 1.23, -0.55, 0xe4e2dc);
    p.box(0.26, 0.26, 0.02, 0.68, 0.88, -0.255, C.white); p.box(0.18, 0.06, 0.012, 0.68, 0.98, -0.243, 0xd84a3e); p.box(0.06, 0.18, 0.012, 0.68, 0.92, -0.243, 0xd84a3e);
    p.cyl(0.3, 0.3, 0.015, 16, -0.45, 0.87, -0.5, 0x8a8f96);
    for (const dx of [-0.07, 0.07]) p.box(0.03, 0.006, 0.18, -0.45 + dx, 0.888, -0.5, C.white);
    p.box(0.14, 0.006, 0.03, -0.45, 0.888, -0.5, C.white);
    // auvent d'entrée et porte vitrée
    p.box(0.56, 0.03, 0.34, 0.1, 0.27, 0.0, C.white); for (const x of [-0.14, 0.34]) p.cyl(0.014, 0.014, 0.24, 5, x, 0.03, 0.15, C.metal);
    p.box(0.26, 0.2, 0.02, 0.1, 0.03, -0.135, 0x86c4d8);
    // parking et ambulances
    p.box(1.5, 0.012, 0.5, -0.15, 0.03, 0.58, 0x6f747a);
    for (let x = -0.8; x <= 0.5; x += 0.26) p.box(0.012, 0.004, 0.3, x, 0.043, 0.58, C.white);
    for (const x of [-0.67, -0.15]) {
      p.box(0.15, 0.11, 0.24, x, 0.045, 0.58, C.white); p.box(0.15, 0.08, 0.08, x, 0.045, 0.74, C.white);
      p.box(0.152, 0.02, 0.24, x, 0.105, 0.58, 0xd84a3e); p.box(0.04, 0.025, 0.04, x, 0.16, 0.66, 0x6aa8ff, 0, true);
      for (const z of [0.5, 0.72]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8).rotateZ(Math.PI / 2), x, 0.035, z, 0x3c3c40);
    }
    for (const x of [0.45, 0.8]) tree(p, x, 0.62, 0.9);
    tree(p, -0.86, 0.1, 0.8);
  }
}

/** Écoles (2 × 2) : cercle des anciens, académie à portiques, école du monastère, école communale, université */
function school(p: Parts, age: number) {
  if (age === 0) {
    // grand cercle de rondins autour du feu, pierres levées peintes, totem, auvent de peau de l'ancien
    p.cyl(0.86, 0.88, 0.012, 14, 0, 0, 0, dark(C.dirt, 0.88));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; log(p, 0.3, 0.04, Math.cos(a) * 0.5, 0, 0.05 + Math.sin(a) * 0.5, -a + Math.PI / 2); }
    campfire(p, 0, 0.05, 1.2);
    for (const [x, z, h, r] of [[-0.48, -0.72, 0.42, 0.08], [0, -0.82, 0.55, -0.04], [0.48, -0.72, 0.38, 0.1]] as [number, number, number, number][]) {
      p.box(0.18, h, 0.08, x, 0, z, C.stone, -x * 0.5, false, r);
      for (const [dx, dy, c] of [[-0.04, 0.7, 0xb4553a], [0.03, 0.5, 0xc98a3c], [0.02, 0.82, 0x6b4a3a]] as [number, number, number][]) p.box(0.04, 0.03, 0.005, x + dx, h * dy, z + 0.045, c, -x * 0.5);
    }
    // totem : têtes peintes empilées, ailes
    for (const [y, c] of [[0, 0xa07050], [0.16, 0xc9853c], [0.32, 0x8a5a44]] as [number, number][]) p.cyl(0.055, 0.06, 0.16, 6, -0.72, y, 0.5, c);
    p.box(0.3, 0.04, 0.04, -0.72, 0.4, 0.5, 0xb4553a); p.cone(0.06, 0.08, 6, -0.72, 0.48, 0.5, 0xd8c060);
    for (const x of [0.5, 0.86]) p.box(0.03, 0.34, 0.03, x, 0, 0.5, C.wood);
    p.add(new THREE.BoxGeometry(0.44, 0.012, 0.3), 0.68, 0.33, 0.42, C.hide, 0, false, 0, -0.25);
    p.box(0.2, 0.015, 0.14, 0.68, 0, 0.4, 0xd9b99b);
  } else if (age === 1) {
    // académie : portiques en U autour d'une cour, olivier, statue du maître, bancs, cadran solaire
    p.box(1.84, 0.05, 1.84, 0, 0, 0, C.stone); p.box(1.74, 0.02, 1.74, 0, 0.05, 0, 0xe6dccb);
    p.box(1.6, 0.36, 0.08, 0, 0.07, -0.8, 0xe6dccb);
    for (let i = 0; i < 7; i++) p.cyl(0.03, 0.034, 0.34, 7, -0.66 + i * 0.22, 0.07, -0.5, C.white);
    p.add(new THREE.BoxGeometry(1.72, 0.025, 0.42), 0, 0.43, -0.66, C.terracotta, 0, false, 0, -0.12);
    for (const s of [-1, 1]) {
      p.box(0.08, 0.36, 1.0, s * 0.8, 0.07, -0.2, 0xe6dccb);
      for (let i = 0; i < 4; i++) p.cyl(0.03, 0.034, 0.34, 7, s * 0.5, 0.07, -0.2 + i * 0.2, C.white);
      p.add(new THREE.BoxGeometry(0.42, 0.025, 1.04), s * 0.66, 0.43, 0.06, C.terracotta, 0, false, s * 0.12);
      p.box(0.07, 0.05, 0.3, s * 0.7, 0.07, 0.1, C.stone);
    }
    p.box(0.3, 0.05, 0.07, -0.25, 0.07, -0.68, C.stone); p.box(0.3, 0.05, 0.07, 0.25, 0.07, -0.68, C.stone);
    p.cyl(0.03, 0.045, 0.24, 5, 0, 0.07, -0.05, C.darkwood); p.sphere(0.2, 0, 0.42, -0.05, 0x9ab07a, 0, 0.75);
    p.box(0.12, 0.12, 0.12, 0, 0.07, 0.5, C.stone); p.cyl(0.035, 0.045, 0.2, 6, 0, 0.19, 0.5, C.white); p.sphere(0.04, 0, 0.43, 0.5, C.white);
    p.cyl(0.06, 0.07, 0.1, 6, 0.42, 0.07, 0.62, C.stone); p.cyl(0.08, 0.08, 0.01, 8, 0.42, 0.17, 0.62, C.white); p.add(new THREE.ConeGeometry(0.02, 0.07, 3), 0.42, 0.2, 0.62, C.gold);
  } else if (age === 2) {
    // école du monastère : grande salle de pierre, haut clocher, galerie de cloître, jardin de buis et puits
    p.box(1.84, 0.03, 1.84, 0, 0, 0, 0xd9cdb8);
    p.box(1.24, 0.4, 0.52, -0.22, 0.03, -0.62, C.cream);
    for (const x of [-0.84, 0.4]) p.box(0.05, 0.4, 0.54, x, 0.03, -0.62, C.stone);
    roof(p, -0.22, 0.43, -0.62, { w: 1.24, d: 0.52, h: 0.42, color: 0x6b7f8f, wall: C.cream });
    windows(p, [-0.62, -0.38, -0.06, 0.18], 0.2, -0.355, 0.06, 0.13);
    p.box(0.26, 1.1, 0.26, 0.66, 0.03, -0.66, C.stone);
    for (const [dx, dz, w, d] of [[0, 0.135, 0.1, 0.02], [0.135, 0, 0.02, 0.1]]) p.box(w, 0.14, d, 0.66 + dx, 0.82, -0.66 + dz, 0x3c3530);
    p.pyramid(0.34, 0.42, 0.34, 0.66, 1.13, -0.66, 0x6b7f8f); p.sphere(0.035, 0.66, 0.86, -0.58, C.gold, 0, 1.2);
    p.box(0.1, 0.18, 0.02, 0.66, 0.03, -0.525, C.door);
    // galerie de cloître devant la salle
    for (let i = 0; i < 6; i++) p.cyl(0.022, 0.025, 0.22, 6, -0.8 + i * 0.22, 0.03, -0.2, C.stone);
    p.add(new THREE.BoxGeometry(1.2, 0.025, 0.24), -0.25, 0.27, -0.26, 0x6b7f8f, 0, false, 0, 0.2);
    // jardin de buis en croix, puits, pupitre et livre
    for (const [x, z] of [[-0.42, 0.2], [0.22, 0.2], [-0.42, 0.62], [0.22, 0.62]]) p.box(0.4, 0.07, 0.28, x, 0.03, z, C.darkgreen);
    p.cyl(0.08, 0.09, 0.1, 8, -0.1, 0.03, 0.41, C.stone); p.cyl(0.06, 0.06, 0.01, 8, -0.1, 0.13, 0.41, C.water);
    p.box(0.02, 0.13, 0.02, 0.66, 0.03, 0.3, C.darkwood); p.add(new THREE.BoxGeometry(0.1, 0.012, 0.08), 0.66, 0.17, 0.3, 0x9a3a32, 0, false, 0, -0.4);
    tree(p, 0.68, 0.7, 1.1);
  } else if (age === 3) {
    // école communale : bâtiment de brique à clocheton et horloge, préau, cour fermée, marelle, mât au drapeau, platanes
    p.box(1.86, 0.025, 1.86, 0, 0, 0, 0xddd3bf);
    p.box(1.3, 0.48, 0.5, -0.24, 0.025, -0.64, 0xc98a72); p.box(1.32, 0.03, 0.52, -0.24, 0.26, -0.64, C.cream);
    roof(p, -0.24, 0.505, -0.64, { w: 1.3, d: 0.5, h: 0.24, color: C.slate, wall: 0xc98a72 });
    p.box(0.3, 0.6, 0.08, -0.24, 0.025, -0.37, 0xc98a72); p.gable(0.32, 0.14, 0.1, -0.24, 0.625, -0.37, C.slate);
    p.cyl(0.055, 0.055, 0.012, 12, -0.24, 0.5, -0.325, C.white); p.box(0.005, 0.04, 0.004, -0.24, 0.515, -0.318, C.darkwood); p.box(0.03, 0.005, 0.004, -0.228, 0.5, -0.318, C.darkwood);
    p.box(0.12, 0.13, 0.12, -0.24, 0.72, -0.64, C.white); p.pyramid(0.16, 0.14, 0.16, -0.24, 0.85, -0.64, C.roofdark);
    p.box(0.12, 0.2, 0.02, -0.24, 0.025, -0.325, C.door);
    for (const y of [0.08, 0.32]) windows(p, [-0.78, -0.62, -0.46, -0.02, 0.14, 0.3], y, -0.385, 0.08, 0.12);
    // préau
    for (const [x, z] of [[0.5, -0.5], [0.86, -0.5], [0.5, 0.0], [0.86, 0.0]]) p.box(0.03, 0.3, 0.03, x, 0.025, z, C.darkwood);
    p.add(new THREE.BoxGeometry(0.48, 0.025, 0.66), 0.68, 0.34, -0.25, C.slate, 0, false, -0.1);
    p.box(0.3, 0.05, 0.07, 0.68, 0.025, -0.25, C.wood);
    // cour : marelle, grille, mât, arbres
    for (let i = 0; i < 4; i++) p.box(0.07, 0.003, 0.07, -0.2, 0.027, 0.0 + i * 0.09, C.white);
    p.cyl(0.008, 0.008, 0.7, 5, -0.82, 0.025, 0.25, C.metal); p.box(0.14, 0.08, 0.005, -0.75, 0.62, 0.25, 0x4f7fc4); p.box(0.05, 0.08, 0.006, -0.77, 0.62, 0.25, C.white);
    for (let x = -0.9; x <= 0.9; x += 0.08) if (Math.abs(x - 0.0) > 0.12) p.box(0.012, 0.1, 0.012, x, 0.025, 0.9, C.white);
    for (const s of [-1, 1]) p.box(0.78, 0.012, 0.012, s * 0.51, 0.1, 0.9, C.white);
    for (const [x, z] of [[0.5, 0.5], [0.3, 0.75], [-0.6, 0.65]]) tree(p, x, z, 1.15, 0x8fbf72);
  } else {
    // université : portique à colonnes et fronton, coupole de la bibliothèque, ailes vitrées, pelouse, allée et statue
    p.box(1.9, 0.04, 1.9, 0, 0, 0, 0xe9e2d4);
    p.box(1.0, 0.54, 0.5, 0, 0.04, -0.62, C.white);
    for (let i = 0; i < 6; i++) p.cyl(0.032, 0.032, 0.5, 8, -0.3 + i * 0.12, 0.04, -0.3, C.white);
    p.box(0.76, 0.06, 0.16, 0, 0.54, -0.3, C.white); p.gable(0.8, 0.14, 0.18, 0, 0.6, -0.3, 0xe4e2dc);
    p.box(0.14, 0.24, 0.02, 0, 0.04, -0.365, C.door);
    p.cyl(0.22, 0.24, 0.14, 14, 0, 0.58, -0.66, C.white); p.sphere(0.22, 0, 0.72, -0.66, 0x7fb8b0, 1, 0.75); p.cone(0.025, 0.12, 5, 0, 0.88, -0.66, C.gold);
    for (const s of [-1, 1]) {
      p.box(0.38, 0.44, 0.76, s * 0.72, 0.04, -0.48, 0xf0ece4); p.box(0.4, 0.03, 0.78, s * 0.72, 0.48, -0.48, 0xe4e2dc);
      for (const y of [0.12, 0.3]) { p.box(0.3, 0.1, 0.02, s * 0.72, y, -0.095, 0x9fd0e4, 0, true); for (const z of [-0.7, -0.45, -0.2]) p.box(0.02, 0.1, 0.16, s * 0.525, y, z, 0x9fd0e4, 0, true); }
    }
    p.box(1.4, 0.012, 0.72, 0, 0.04, 0.44, C.green);
    p.box(0.16, 0.014, 0.72, 0, 0.043, 0.44, 0xd8d0c0);
    p.box(0.1, 0.1, 0.1, 0, 0.04, 0.42, C.stone); p.cyl(0.03, 0.04, 0.16, 6, 0, 0.14, 0.42, 0x9aa3ad); p.sphere(0.035, 0, 0.33, 0.42, 0x9aa3ad);
    for (const [x, z] of [[-0.5, 0.3], [-0.5, 0.65], [0.5, 0.3], [0.5, 0.65]]) tree(p, x, z, 1.1);
  }
}

/** Secours (2 × 2) : guetteurs, poste des vigiles, tour de guet et son hangar, caserne de pompiers, centre de secours */
function firehouse(p: Parts, age: number, v: number) {
  if (age === 0) {
    // haute plateforme de guet, hutte, bûcher du signal sur son cercle de pierres, outres d'eau, fosses de sable, tambour
    p.cyl(0.86, 0.88, 0.012, 14, 0, 0, 0, dark(C.dirt, 0.9));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pole(p, 0.022, 1.0, -0.42 + x * 0.14, -0.42 + z * 0.14, C.wood, z * 0.06, -x * 0.06);
    p.box(0.42, 0.03, 0.42, -0.42, 0.96, -0.42, C.wood);
    for (const [x, z, w, d] of [[0, 0.2, 0.42, 0.02], [0, -0.2, 0.42, 0.02], [0.2, 0, 0.02, 0.42], [-0.2, 0, 0.02, 0.42]]) p.box(w, 0.09, d, -0.42 + x, 0.99, -0.42 + z, C.darkwood);
    for (let y = 0.08; y < 0.94; y += 0.1) p.box(0.13, 0.012, 0.012, -0.42, y, -0.12, C.wood);
    for (const x of [-0.065, 0.065]) pole(p, 0.008, 0.98, -0.42 + x, -0.15, C.wood, 0.08, 0);
    p.add(new THREE.ConeGeometry(0.035, 0.14, 6).rotateZ(-Math.PI / 2), -0.28, 1.1, -0.3, 0xe8dcc0);
    p.cone(0.3, 0.52, 6, 0.5, 0, -0.5, C.hide); p.add(new THREE.ConeGeometry(0.09, 0.22, 3), 0.5, 0.11, -0.24, C.darkwood);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; p.sphere(0.04, 0.42 + Math.cos(a) * 0.16, 0.01, 0.32 + Math.sin(a) * 0.16, C.darkstone, 0, 0.7); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; pole(p, 0.018, 0.34, 0.42 + Math.cos(a) * 0.08, 0.32 + Math.sin(a) * 0.08, C.wood, -Math.sin(a) * 0.35, Math.cos(a) * 0.35); }
    for (const [x, z] of [[-0.62, 0.42], [-0.5, 0.52], [-0.66, 0.6]]) p.sphere(0.06, x, 0.05, z, C.hide, 0, 1.1);
    for (const x of [-0.25, 0.0]) p.cone(0.11, 0.08, 7, x, 0, 0.66, 0xd8c69a);
    p.cyl(0.07, 0.06, 0.1, 8, 0.1, 0, 0.32, 0x9a6a44); p.cyl(0.071, 0.071, 0.008, 8, 0.1, 0.1, 0.32, C.hide);
  } else if (age === 1) {
    // poste des vigiles : tour ronde de pierre, caserne aux tuiles, grande citerne, jarres et râtelier de seaux
    p.box(1.84, 0.025, 1.84, 0, 0, 0, 0xddd0b8);
    p.cyl(0.24, 0.27, 0.92, 9, -0.5, 0.025, -0.46, C.stone);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; p.box(0.08, 0.08, 0.06, -0.5 + Math.cos(a) * 0.24, 0.94, -0.46 + Math.sin(a) * 0.24, C.stone, -a); }
    p.cone(0.3, 0.26, 9, -0.5, 1.0, -0.46, C.terracotta);
    p.box(0.1, 0.18, 0.02, -0.5, 0.025, -0.205, C.door); windows(p, [-0.5], 0.56, -0.2, 0.06, 0.09);
    p.box(0.74, 0.32, 0.4, 0.42, 0.025, -0.58, C.cream);
    roof(p, 0.42, 0.345, -0.58, { w: 0.74, d: 0.4, h: 0.2, color: C.terracotta, wall: C.cream });
    p.box(0.1, 0.17, 0.02, 0.42, 0.025, -0.375, C.door); windows(p, [0.2, 0.64], 0.15, -0.375, 0.07, 0.08);
    p.cyl(0.3, 0.32, 0.16, 12, 0.4, 0.025, 0.32, C.stone); p.cyl(0.26, 0.26, 0.01, 12, 0.4, 0.17, 0.32, C.water);
    for (const [x, z] of [[-0.72, 0.2], [-0.6, 0.34], [-0.76, 0.42], [-0.62, 0.56]]) { p.cyl(0.055, 0.035, 0.16, 8, x, 0.025, z, C.terracotta); p.cyl(0.03, 0.03, 0.005, 8, x, 0.185, z, C.water); }
    p.box(0.42, 0.02, 0.03, -0.12, 0.28, 0.7, C.wood); for (const x of [-0.32, 0.08]) p.box(0.02, 0.28, 0.02, x, 0.025, 0.7, C.wood);
    for (let i = 0; i < 4; i++) p.cyl(0.028, 0.022, 0.06, 6, -0.26 + i * 0.09, 0.2, 0.72, 0x9a6a44);
  } else if (age === 2) {
    // tour de guet (modèle KayKit, sinon tour de pierre), hangar à seaux et tonneaux, charrette à eau, échelle, tas de sable
    p.box(1.84, 0.025, 1.84, 0, 0, 0, 0xd9cdb8);
    if (!attach(['b_tower_blue', 'b_tower_red'], v, 0.92, -0.44, -0.42)) {
      p.box(0.46, 1.0, 0.46, -0.44, 0.025, -0.42, C.stone); p.box(0.54, 0.05, 0.54, -0.44, 1.02, -0.42, C.wood); p.pyramid(0.58, 0.36, 0.58, -0.44, 1.07, -0.42, C.slate);
    }
    for (const [x, z] of [[0.18, -0.86], [0.86, -0.86], [0.18, -0.28], [0.86, -0.28]]) p.box(0.035, z < -0.5 ? 0.42 : 0.34, 0.035, x, 0.025, z, C.darkwood);
    p.box(0.72, 0.38, 0.03, 0.52, 0.025, -0.87, C.wood);
    p.add(new THREE.BoxGeometry(0.82, 0.03, 0.7), 0.52, 0.42, -0.57, 0x8a5a44, 0, false, 0, -0.12);
    for (const [x, z] of [[0.3, -0.7], [0.45, -0.72], [0.6, -0.68]]) { p.cyl(0.055, 0.05, 0.13, 8, x, 0.025, z, 0x9a6a44); p.cyl(0.056, 0.056, 0.01, 8, x, 0.07, z, 0x6f5640); }
    for (let i = 0; i < 5; i++) p.cyl(0.03, 0.024, 0.06, 6, 0.32 + i * 0.1, 0.22, -0.84, 0x9a6a44);
    // charrette à eau : tonneau couché sur deux roues, timon
    p.add(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 10).rotateZ(Math.PI / 2), 0.42, 0.17, 0.42, 0x9a6a44);
    p.box(0.3, 0.03, 0.2, 0.42, 0.07, 0.42, C.wood);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 10).rotateZ(Math.PI / 2), 0.42 + s * 0.17, 0.08, 0.42, C.darkwood);
    p.box(0.02, 0.02, 0.3, 0.42, 0.08, 0.66, C.wood);
    p.add(new THREE.BoxGeometry(0.1, 0.6, 0.02), 0.08, 0.3, -0.12, C.wood, 0, false, 0, -0.35);
    p.cone(0.14, 0.1, 8, -0.4, 0.025, 0.5, 0xd8c69a);
  } else if (age === 3) {
    // caserne de brique : trois grandes portes rouges, tour de séchage des tuyaux et sa cloche, pompes à vapeur attelées
    p.box(1.86, 0.025, 1.86, 0, 0, 0, 0xc9c0b2);
    p.box(1.3, 0.56, 0.64, -0.22, 0.025, -0.52, C.brick); p.box(1.32, 0.04, 0.66, -0.22, 0.58, -0.52, C.cream);
    roof(p, -0.22, 0.62, -0.52, { w: 1.3, d: 0.64, h: 0.2, color: C.slate, wall: C.brick });
    for (const x of [-0.64, -0.22, 0.2]) {
      p.box(0.3, 0.32, 0.02, x, 0.025, -0.195, 0xb8342c); p.box(0.006, 0.32, 0.022, x, 0.025, -0.194, 0x7a2420);
      p.add(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), x, 0.345, -0.195, 0xb8342c);
      windows(p, [x], 0.44, -0.195, 0.14, 0.06);
    }
    p.box(0.6, 0.06, 0.012, -0.22, 0.52, -0.19, C.cream);
    p.box(0.28, 1.24, 0.28, 0.68, 0.025, -0.62, C.darkbrick); p.box(0.32, 0.05, 0.32, 0.68, 1.27, -0.62, C.cream); p.pyramid(0.32, 0.16, 0.32, 0.68, 1.32, -0.62, C.slate);
    windows(p, [0.68], 0.9, -0.475, 0.06, 0.16); p.add(new THREE.CylinderGeometry(0.045, 0.065, 0.06, 8), 0.68, 1.12, -0.46, C.gold);
    for (const x of [-0.5, 0.15]) {
      p.box(0.24, 0.1, 0.14, x, 0.06, 0.4, 0xb8342c); p.cyl(0.045, 0.045, 0.14, 8, x + 0.05, 0.16, 0.4, C.gold); p.cyl(0.012, 0.012, 0.1, 5, x + 0.05, 0.3, 0.4, 0x3c3c40);
      for (const d of [-0.08, 0.08]) p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10).rotateX(Math.PI / 2), x + d, 0.06, 0.4, C.darkwood);
      p.box(0.02, 0.02, 0.26, x, 0.07, 0.6, C.wood);
    }
    p.cyl(0.03, 0.035, 0.1, 6, 0.75, 0.025, 0.3, 0xd84a3e); p.sphere(0.03, 0.75, 0.13, 0.3, 0xd84a3e);
  } else {
    // centre de secours : quatre portes rouges, bandeau rouge, tour d'entraînement, deux camions à échelle, marquages au sol
    p.box(1.9, 0.03, 1.9, 0, 0, 0, 0xd8d6d0);
    p.box(1.46, 0.56, 0.62, -0.18, 0.03, -0.54, C.white); p.box(1.48, 0.07, 0.64, -0.18, 0.44, -0.54, 0xd84a3e);
    p.box(1.5, 0.03, 0.66, -0.18, 0.59, -0.54, 0xe4e2dc);
    for (const x of [-0.72, -0.36, 0.0, 0.36]) { p.box(0.28, 0.34, 0.02, x, 0.03, -0.225, 0xc8382e); for (let y = 0.1; y < 0.36; y += 0.08) p.box(0.28, 0.006, 0.022, x, y, -0.224, 0xa82e26); }
    windows(p, [-0.72, -0.36, 0.0, 0.36], 0.5, -0.225, 0.2, 0.05);
    p.box(0.32, 1.3, 0.32, 0.72, 0.03, -0.62, 0xbfc4ca);
    for (let y = 0.25; y < 1.25; y += 0.24) p.box(0.14, 0.1, 0.02, 0.72, y, -0.455, 0x9fd0e4, 0, true);
    p.box(0.36, 0.04, 0.36, 0.72, 1.33, -0.62, 0xd84a3e);
    p.cyl(0.006, 0.006, 0.36, 4, -0.7, 0.62, -0.7, C.metal);
    for (const x of [-0.72, -0.36, 0.0, 0.36]) for (let z = 0.0; z < 0.5; z += 0.12) p.box(0.26, 0.004, 0.05, x, 0.032, z, (z / 0.12) % 2 < 1 ? 0xd84a3e : C.white);
    for (const x of [-0.54, 0.18]) {
      p.box(0.18, 0.13, 0.36, x, 0.045, 0.46, 0xd84a3e); p.box(0.18, 0.12, 0.12, x, 0.045, 0.7, 0xd84a3e);
      p.box(0.17, 0.05, 0.02, x, 0.12, 0.765, 0x9fd0e4);
      p.add(new THREE.BoxGeometry(0.06, 0.03, 0.42), x, 0.2, 0.44, C.metal, 0, false, 0, 0.12);
      for (let z = 0.28; z < 0.62; z += 0.06) p.box(0.07, 0.008, 0.008, x, 0.2 + (0.62 - z) * 0.12, z, C.metal);
      for (const z of [0.36, 0.56, 0.7]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8).rotateZ(Math.PI / 2), x, 0.04, z, 0x3c3c40);
      p.box(0.03, 0.025, 0.03, x - 0.04, 0.18, 0.72, 0x6aa8ff, 0, true); p.box(0.03, 0.025, 0.03, x + 0.04, 0.18, 0.72, 0xff6a5a, 0, true);
    }
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
 * Ponton de pêche, petit et mignon : la façade (+z) donne sur l'eau. Préhistoire : radeau de rondins, séchoir à poissons,
 * pirogue tirée sur la berge et panier ; ensuite une cabane de pêcheur à fenêtre ronde au bout d'un petit ponton de planches,
 * avec lanterne, tonneau, filet et canne à pêche ; la conserverie a sa cheminée, le port moderne sa bouée
 */
function pier(p: Parts, age: number, o: ModelOpts) {
  // poisson pendu tête en haut : corps fuselé, queue en éventail en bas
  const fish = (x: number, y: number, z: number, c: number, ry = 0) => {
    p.add(new THREE.IcosahedronGeometry(0.026, 1).scale(0.4, 1.45, 0.85), x, y, z, c, ry);
    p.add(new THREE.ConeGeometry(0.022, 0.03, 4).scale(0.35, 1, 1).translate(0, -0.042, 0), x, y, z, c, ry);
  };
  if (age === 0) {
    // radeau de trois rondins qui s'avance sur l'eau
    for (const x of [-0.075, 0, 0.075]) p.add(new THREE.CylinderGeometry(0.036, 0.036, 0.72, 7).rotateX(Math.PI / 2), x, 0.03, 0.5, x ? C.wood : dark(C.wood, 0.9));
    p.box(0.24, 0.025, 0.03, 0, 0.06, 0.24, C.darkwood); p.box(0.24, 0.025, 0.03, 0, 0.06, 0.76, C.darkwood);
    // séchoir en A : deux croisillons, une perche, des poissons pendus
    for (const x of [-0.2, 0.06]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.009, 0.011, 0.3, 5).translate(0, 0.15, 0), x, 0, -0.22 + s * 0.035, C.darkwood, 0, false, 0, -s * 0.22);
    p.add(new THREE.CylinderGeometry(0.009, 0.009, 0.32, 5).rotateZ(Math.PI / 2), -0.07, 0.28, -0.22, C.darkwood);
    [0xc8d4dc, 0xe8925a, 0xc8d4dc, 0xd8b28c].forEach((c, k) => fish(-0.17 + k * 0.065, 0.225, -0.22, c));
    // canne à pêche plantée au bout du radeau, la ligne dans l'eau
    p.add(new THREE.CylinderGeometry(0.004, 0.006, 0.4, 4).translate(0, 0.2, 0), 0.09, 0.05, 0.8, C.darkwood, 0, false, 0, 0.55);
    p.add(new THREE.CylinderGeometry(0.0015, 0.0015, 0.3, 3).translate(0, -0.15, 0), 0.09, 0.38, 1.02, 0xeeeeee);
    // pirogue tirée sur la berge, sa pagaie, un panier de pêche
    p.add(new THREE.IcosahedronGeometry(1, 1).scale(0.065, 0.035, 0.2), 0.24, 0.035, -0.06, dark(C.wood, 0.75));
    p.add(new THREE.IcosahedronGeometry(1, 1).scale(0.048, 0.012, 0.16), 0.24, 0.066, -0.06, dark(C.darkwood, 0.7));
    p.add(new THREE.BoxGeometry(0.012, 0.012, 0.24), 0.3, 0.02, 0.06, C.wood, 0.4); p.add(new THREE.BoxGeometry(0.05, 0.008, 0.07), 0.35, 0.02, 0.17, C.wood, 0.4);
    p.cyl(0.05, 0.038, 0.07, 8, -0.32, 0, 0.12, 0xc9a46a); p.cyl(0.052, 0.052, 0.012, 8, -0.32, 0.07, 0.12, 0x9a7452);
    fish(-0.32, 0.085, 0.12, 0xe8925a, 1.2);
    // pierres du foyer où l'on fume le poisson
    for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.283; p.sphere(0.025, 0.06 + Math.cos(a) * 0.06, 0.01, -0.02 + Math.sin(a) * 0.06, k % 2 ? C.stone : C.darkstone, 0, 0.6); }
    smoke(0.06, 0.06, -0.02, 1);
    return;
  }
  // petit ponton de planches sur pilotis, qui s'avance au-delà de la case
  const plank = age >= 4 ? 0xd9d2c4 : age === 3 ? 0xa89a88 : C.wood, w = 0.3, z0 = 0.02, z1 = 0.78;
  for (let z = z0, k = 0; z < z1; z += 0.075, k++) p.box(w, 0.025, 0.065, 0, 0.0, z + 0.03, k % 3 === 1 ? dark(plank, 0.9) : plank);
  for (const z of [0.15, 0.45, 0.74]) for (const sx of [-1, 1]) p.cyl(0.02, 0.022, 0.62, 6, sx * (w / 2 - 0.01), -0.56, z, C.darkwood);
  // lanterne au bout du ponton (elle s'allume la nuit), bitte d'amarrage, tonneau et caisse
  p.cyl(0.012, 0.012, 0.26, 5, w / 2 - 0.03, 0.025, 0.74, C.darkwood);
  p.box(0.045, 0.05, 0.045, w / 2 - 0.03, 0.27, 0.74, 0xffd27a, 0, true);
  p.box(0.06, 0.012, 0.06, w / 2 - 0.03, 0.32, 0.74, C.darkwood);
  p.cyl(0.022, 0.026, 0.05, 6, -w / 2 + 0.035, 0.025, 0.72, C.darkwood);
  p.cyl(0.04, 0.045, 0.09, 8, -0.06, 0.025, 0.3, age >= 4 ? 0x4a8ce0 : 0x9a6a44); p.cyl(0.046, 0.046, 0.01, 8, -0.06, 0.07, 0.3, C.darkwood);
  p.box(0.07, 0.06, 0.07, 0.07, 0.025, 0.18, age >= 4 ? 0xf2c94c : C.wood, 0.3);
  // cabane du pêcheur, à l'arrière de la case
  const wall = age >= 4 ? C.white : age === 3 ? C.brick : [0xd9b98f, 0xc9a27a, 0xe0c9a0][o.v % 3];
  const roof = age >= 4 ? C.sky : age === 3 ? C.slate : [C.terracotta, C.teal, C.thatch, C.red][o.v % 4];
  const hw = age === 3 ? 0.42 : 0.32, hd = 0.28, hh = age === 3 ? 0.3 : 0.24, hz = -0.24;
  p.box(hw + 0.03, 0.03, hd + 0.03, 0, 0, hz, C.stone);
  p.box(hw, hh, hd, 0, 0.03, hz, wall);
  if (age >= 4) { p.box(hw + 0.06, 0.03, hd + 0.08, 0, hh + 0.03, hz, C.white); p.box(hw + 0.02, 0.012, 0.12, 0, hh - 0.02, hz + hd / 2 + 0.06, roof, 0, false, 0.25); }
  else p.gable(hw + 0.08, 0.17, hd + 0.08, 0, hh + 0.03, hz, roof);
  // porte, fenêtre ronde (éclairée la nuit) et son volet
  p.box(0.08, 0.15, 0.012, -0.07, 0.03, hz + hd / 2 + 0.004, C.door);
  p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10).rotateX(Math.PI / 2), 0.08, 0.15, hz + hd / 2 + 0.006, C.win, 0, true);
  p.add(new THREE.TorusGeometry(0.037, 0.008, 4, 12), 0.08, 0.15, hz + hd / 2 + 0.01, C.darkwood);
  if (age === 3) { p.cyl(0.035, 0.04, 0.32, 7, 0.14, hh + 0.03, hz - 0.04, C.darkbrick); smoke(0.14, hh + 0.37, hz - 0.04, 2); }
  else if (age <= 2) { p.box(0.05, 0.12, 0.05, -0.1, hh + 0.08, hz - 0.05, C.stone); smoke(-0.1, hh + 0.22, hz - 0.05, 0); }
  // corde tendue entre deux perches, à côté de la cabane : poissons qui sèchent et flotteurs de filet
  for (const z of [-0.36, -0.08]) p.cyl(0.008, 0.01, 0.28, 5, -0.33, 0, z, C.darkwood);
  p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.28, 3).rotateX(Math.PI / 2), -0.33, 0.26, -0.22, 0xd8c8a8);
  [0xc8d4dc, 0xe8925a, 0xc8d4dc].forEach((c, k) => fish(-0.33, 0.21, -0.3 + k * 0.08, c, Math.PI / 2));
  for (let k = 0; k < 2; k++) p.sphere(0.014, -0.33, 0.24, -0.34 + k * 0.24, k ? 0xe8553c : 0xf2c94c);
  p.add(new THREE.CylinderGeometry(0.004, 0.006, 0.42, 4).translate(0, 0.21, 0), 0.2, 0.03, -0.08, C.darkwood, 0, false, -0.5);
  // bouée de sauvetage au port moderne, poisson qui sèche sinon
  if (age >= 4) p.add(new THREE.TorusGeometry(0.045, 0.014, 6, 14), 0.16, 0.14, hz + hd / 2 + 0.012, C.red);
  else for (let k = 0; k < 3; k++) fish(0.15 + k * 0.045, 0.2, hz + hd / 2 + 0.03, k === 1 ? 0xe8925a : 0xc8d4dc);
}

const cache = new Map<string, Model>();

/** Les Tours : quatre immeubles modernes, un par quart de la parcelle de 2 × 2, de hauteurs différentes */
function towers(): Model | null {
  const known = cache.get('m|towers');
  if (known) return known;
  if (!TOWERS.every(hasModel)) return null;
  const parts = TOWERS.map((n, i) => {
    const g = bakeFit(n, 0.88)!, k = [1.25, 0.9, 1.5, 1.05][i];
    return g.scale(1, k, 1).translate(i % 2 ? 0.48 : -0.48, 0, i < 2 ? -0.48 : 0.48);
  });
  const m: Model = { body: mergeGeometries(parts, false)!, glow: null, smoke: [] };
  cache.set('m|towers', m);
  return m;
}

export function getModel(kind: KindId, age: number, o: ModelOpts): Model {
  const size = o.small ? 1 : KINDS[kind].size;
  const imported = kind === 'landmark' && age >= 4 ? towers() : importedModel(kind, age, o.v, size);
  if (imported) return imported;
  const key = kind === 'house' ? `${kind}|${age}|${o.v}|${+o.L}${+o.R}${+o.F}` : `${kind}|${age}|${o.v % 3}|${size}`;
  let m = cache.get(key);
  if (m) return m;
  const p = new Parts();
  smokeOut = [];
  attachOut = [];
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
    case 'health': health(p, age); break;
    case 'school': school(p, age); break;
    case 'fire': firehouse(p, age, o.v); break;
  }
  m = { ...p.build(), smoke: smokeOut };
  if (attachOut.length) m.body = mergeGeometries([m.body, ...attachOut], false)!;
  // dessiné pour une case, posé sur quatre : tout s'agrandit, cheminées comprises
  if (size === 2 && UPSCALE.includes(kind)) {
    m.body.scale(UP, UP, UP);
    m.glow?.scale(UP, UP, UP);
    m.smoke = m.smoke.map((v, i) => (i % 4 === 3 ? v : v * UP));
  }
  cache.set(key, m);
  return m;
}
