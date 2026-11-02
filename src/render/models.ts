import * as THREE from 'three';
import { Parts } from './parts';
import { KindId, KINDS } from '../build/catalog';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeFit, bakeFitSplit, hasModel, ModelName } from './assets';
import { hash2 } from '../core/rng';

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
  farm: [null, ['a_farm', 'a_farm2']],
  workshop: [null, null, ['b_forge_blue', 'b_forge_red'], null, ['b_office_c', 'b_office_e', 'b_office_f', 'b_office_g']],
  gather: [null, null, ['b_market_blue', 'b_market_red']],
  temple: [null, null, ['b_church_blue', 'b_church_red']],
  mill: [null, null, ['b_windmill_blue', 'b_windmill_red'], ['b_plant_n', 'b_plant_h'], ['b_turbine']],
  landmark: [null, null, ['b_castle_blue', 'b_castle_red']],
};
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
const BACKWARD = new Set<ModelName>(['b_plant_n', 'b_plant_h']);
/** Part de la case occupée par un modèle importé (sa plus grande largeur) ; les maisons laissent une ruelle entre voisines */
const FIT: Partial<Record<KindId, number>> = { well: 0.62, mill: 0.9, landmark: 0.95, house: 0.84 };
/** Pièces qui tournent : ailes des moulins à vent (autour de leur axe z), pales de l'éolienne (axe x) ; tours par seconde */
const ROTORS: Partial<Record<ModelName, { part: RegExp; axis: [number, number, number]; speed: number }>> = {
  b_windmill_blue: { part: /_fan_/, axis: [0, 0, 1], speed: 0.12 },
  b_windmill_red: { part: /_fan_/, axis: [0, 0, 1], speed: 0.12 },
  b_turbine: { part: /^blades$/, axis: [1, 0, 0], speed: 0.3 },
};

/**
 * Rangs d'un toit importé : sur chaque pan incliné, des baguettes à hauteurs régulières, d'un ton plus sombre que le pan
 * (ardoises, tuiles ou bottes de chaume en rangs), là où le modèle n'a qu'une grande face lisse
 */
function roofLines(g: THREE.BufferGeometry, step: number): THREE.BufferGeometry | null {
  const pos = g.attributes.position, col = g.attributes.color, out: THREE.BufferGeometry[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), cc = new THREE.Color();
  const m = new THREE.Matrix4(), ax = new THREE.Vector3(), az = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const area = n.length() / 2;
    n.normalize();
    if (n.y < 0.3 || n.y > 0.93 || area < 0.0015) continue;
    if (col) cc.fromBufferAttribute(col, t).multiplyScalar(0.78); else cc.setRGB(0.4, 0.4, 0.45);
    const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
    for (let h = Math.ceil(lo / step + 0.3) * step; h < hi - step * 0.3; h += step) {
      const pts: THREE.Vector3[] = [];
      for (const [p, q] of [[a, b], [b, c], [c, a]]) if ((p.y - h) * (q.y - h) < 0) pts.push(p.clone().lerp(q, (h - p.y) / (q.y - p.y)));
      if (pts.length < 2) continue;
      const len = pts[0].distanceTo(pts[1]);
      if (len < 0.02) continue;
      ax.subVectors(pts[1], pts[0]).normalize();
      az.crossVectors(ax, n).normalize();
      const box = new THREE.BoxGeometry(len, 0.006, 0.014).toNonIndexed();
      box.applyMatrix4(m.makeBasis(ax, n, az).setPosition(pts[0].clone().add(pts[1]).multiplyScalar(0.5).addScaledVector(n, 0.004)));
      for (const name of Object.keys(box.attributes)) if (!(name in g.attributes)) box.deleteAttribute(name);
      if (col) box.setAttribute('color', new THREE.BufferAttribute(new Float32Array(box.attributes.position.count * 3).map((_, i) => [cc.r, cc.g, cc.b][i % 3]), 3));
      if (Object.keys(g.attributes).some((name) => !(name in box.attributes))) continue;
      out.push(box);
    }
  }
  return out.length ? mergeGeometries(out, false) : null;
}

/** Modèle importé de la sorte et de l'âge, s'il y en a : façade vers +z, à l'échelle de la case ; fumée au sommet des ateliers */
function importedModel(kind: KindId, age: number, v: number, size: number): Model | null {
  const names = IMPORTED[kind]?.[age]?.filter(hasModel);
  if (!names?.length) return null;
  const name = names[v % names.length], key = `m|${kind}|${age}|${name}|${size}`;
  const known = cache.get(key);
  if (known) return known;
  const width = size * (FIT[kind] ?? 0.92), rot = BACKWARD.has(name) ? Math.PI : 0, spin = ROTORS[name];
  // un moulin à vent, une éolienne : les ailes à part, pour les faire tourner
  const split = spin ? bakeFitSplit(name, width, rot, spin.part) : null;
  let body = split ? split.body : bakeFit(name, width, rot, name.startsWith('b_brick_') ? brickRemap(names.indexOf(name)) : undefined);
  if (!body) return null;
  // les toits des maisons prennent des rangs d'ardoises, de tuiles ou de chaume
  if (kind === 'house') { const lines = roofLines(body, 0.032); if (lines) body = mergeGeometries([body, lines], false) ?? body; }
  const rotor = split && spin ? { geo: split.part, pivot: split.pivot.toArray() as [number, number, number], axis: new THREE.Vector3(...spin.axis).applyQuaternion(split.quat).toArray() as [number, number, number], speed: spin.speed * Math.PI * 2 } : null;
  // la forge, les usines et les centrales fument par leur plus haute cheminée (le sommet du modèle) ; pas les moulins à vent
  const smokeAt: number[] = [];
  if ((kind === 'workshop' && age >= 2 && age <= 3) || (kind === 'mill' && age === 3)) {
    const p = body.attributes.position;
    let top = 0;
    for (let i = 1; i < p.count; i++) if (p.getY(i) > p.getY(top)) top = i;
    smokeAt.push(p.getX(top), p.getY(top) + 0.02, p.getZ(top), age === 2 ? 1 : 2);
  }
  const m: Model = { body, glow: null, smoke: smokeAt, rotor };
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
export interface Model {
  body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; smoke: number[];
  /** pièce qui tourne (ailes, pales) : centrée sur son moyeu `pivot`, autour de `axis`, à `speed` radians par seconde */
  rotor?: { geo: THREE.BufferGeometry; pivot: [number, number, number]; axis: [number, number, number]; speed: number } | null;
}

/** Cheminées du modèle en cours de construction */
let smokeOut: number[] = [];
function smoke(x: number, y: number, z: number, kind: number) { smokeOut.push(x, y, z, kind); }

/** Modèles importés posés sur la parcelle du modèle en cours (ex. la tour de guet KayKit de la caserne médiévale) */
let attachOut: THREE.BufferGeometry[] = [];
/** Pose une variante du modèle importé, large de `width`, en (x, z) ; false s'il n'est pas chargé */
function attach(names: ModelName[], v: number, width: number, x: number, z: number, ry = 0, remap?: (c: THREE.Color) => void, sy = 1, skip?: RegExp): boolean {
  const ok = names.filter(hasModel);
  const g = ok.length ? bakeFit(ok[v % ok.length], width, ry, remap, skip) : null;
  if (!g) return false;
  attachOut.push(g.scale(1, sy, 1).translate(x, 0, z));
  return true;
}

/** Recolore le rouge vif d'un modèle importé (toiles, tuiles) : peaux tannées, chaume… pour la Préhistoire */
const unRed = (to: number) => {
  const t = new THREE.Color(to);
  return (c: THREE.Color) => { if (c.r > c.g * 1.6 && c.r > c.b * 1.6) { const l = c.r * 0.6 + 0.55; c.copy(t).multiplyScalar(Math.min(1.15, l)); } };
};

/** Le dessus du dernier modèle posé (faces tournées vers le ciel au-dessus de `minY`) prend une couleur, nuancée face à face */
function recolorTop(minY: number, color: number) {
  const g = attachOut[attachOut.length - 1], pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); d.fromBufferAttribute(pos, t + 2);
    if ((a.y + b.y + d.y) / 3 < minY || b.clone().sub(a).cross(d.clone().sub(a)).normalize().y < 0.3) continue;
    c.setHex(color).multiplyScalar(0.9 + ((t / 3) % 5) * 0.04);
    for (let j = 0; j < 3; j++) col.setXYZ(t + j, c.r, c.g, c.b);
  }
}

/** La plus haute cheminée du dernier modèle posé fume */
function smokeTop(kind: number) {
  const pos = attachOut[attachOut.length - 1].attributes.position;
  let top = 0;
  for (let i = 1; i < pos.count; i++) if (pos.getY(i) > pos.getY(top)) top = i;
  smoke(pos.getX(top), pos.getY(top) + 0.02, pos.getZ(top), kind);
}

/** Soulève le dernier modèle posé (sur un dallage, un socle) */
const lift = (h: number) => { attachOut[attachOut.length - 1].translate(0, h, 0); };

/** Marbre trop blanc : une pierre crème, plus chaude */
const toMarble = (c: THREE.Color) => { if (c.r > 0.85 && c.g > 0.85 && c.b > 0.85) c.setRGB(0.95, 0.91, 0.82); };

/**
 * Toit de tuiles sur le dernier modèle posé : ses pans (faces inclinées au-dessus de `minY`) prennent la couleur des tuiles,
 * puis on y pose des rangées de tuiles couvre-joints, un faîtage, des antéfixes le long des égouts et des acrotères aux angles
 */
function tileRoof(p: Parts, minY: number, color: number) {
  const g = attachOut[attachOut.length - 1], pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color(color);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let t = 0; t < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); d.fromBufferAttribute(pos, t + 2);
    if ((a.y + b.y + d.y) / 3 < minY) continue;
    const ny = Math.abs(b.clone().sub(a).cross(d.clone().sub(a)).normalize().y);
    if (ny < 0.3) continue;
    for (let j = 0; j < 3; j++) col.setXYZ(t + j, c.r, c.g, c.b);
    // les pans inclinés donnent l'emprise du toit, l'égout et le faîte
    if (ny > 0.95) continue;
    for (const v of [a, b, d]) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  }
  if (x0 > x1) return;
  // faîtage le long du plus grand côté ; u le long du faîtage, v en travers des pans
  const alongX = x1 - x0 >= z1 - z0;
  const [u0, u1, v0, v1] = alongX ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
  const vc = (v0 + v1) / 2, half = (v1 - v0) / 2, rise = y1 - y0, slope = Math.atan2(rise, half), len = Math.hypot(rise, half);
  const at = (u: number, y: number, v: number): [number, number, number] => (alongX ? [u, y, v] : [v, y, u]);
  const tileC = dark(color, 0.84), capC = dark(color, 0.74), marble = 0xf2ead8;
  const n = Math.max(4, Math.round((u1 - u0) / 0.045));
  for (const side of [-1, 1])
    for (let i = 0; i <= n; i++) {
      const u = u0 + 0.012 + ((u1 - u0 - 0.024) * i) / n, [x, y, z] = at(u, (y0 + y1) / 2 + 0.008, vc + (side * half) / 2);
      if (alongX) p.add(new THREE.BoxGeometry(0.011, 0.011, len * 0.98), x, y, z, tileC, 0, false, 0, side * slope);
      else p.add(new THREE.BoxGeometry(len * 0.98, 0.011, 0.011), x, y, z, tileC, 0, false, -side * slope, 0);
      // antéfixes de marbre au bout d'une rangée sur deux
      if (i % 2 === 0) { const [ex, ey, ez] = at(u, y0 - 0.004, vc + side * half); p.box(0.014, 0.022, 0.014, ex, ey, ez, marble); }
    }
  // faîtage
  const [rx, ry, rz] = at((u0 + u1) / 2, y1 - 0.004, vc);
  p.box(alongX ? u1 - u0 : 0.03, 0.018, alongX ? 0.03 : u1 - u0, rx, ry, rz, capC);
  // acrotères : palmettes aux deux bouts du faîte, petits socles aux angles
  for (const u of [u0 + 0.01, u1 - 0.01]) {
    const [ax, ay, az] = at(u, y1, vc);
    p.cone(0.022, 0.05, 5, ax, ay, az, marble);
    for (const side of [-1, 1]) { const [cx, cy, cz] = at(u, y0, vc + side * half * 0.96); p.sphere(0.014, cx, cy + 0.014, cz, marble); }
  }
}

/** Cyprès : tronc court, flamme vert sombre */
function cypress(p: Parts, x: number, z: number, h = 0.24) {
  p.cyl(0.012, 0.016, 0.05, 5, x, 0, z, C.wood);
  p.cone(h * 0.19, h, 6, x, 0.04, z, C.darkgreen);
}

/** Le bois orange vif du Survival Kit de Kenney devient un bois brun, patiné */
const toWood = (c: THREE.Color) => {
  if (c.r > 0.35 && c.r > c.g * 1.25 && c.g > c.b * 1.3) { const l = 0.55 + c.r * 0.5; c.setRGB(0.42 * l, 0.27 * l, 0.16 * l); }
};
/** Poulailler rouge et blanc des fermes modernes, en bois brut pour les premiers âges */
const toTimber = (c: THREE.Color) => {
  if (c.r > c.g * 1.4) { const l = 0.6 + c.r * 0.4; c.setRGB(0.5 * l, 0.34 * l, 0.22 * l); }
  else if (c.r > 0.8 && c.g > 0.8 && c.b > 0.8) c.setRGB(0.78, 0.66, 0.5);
};
/** Couchages : la natte verte devient une fourrure brune, le coussin une peau claire */
const toFur = (c: THREE.Color) => {
  if (c.g > c.r * 1.15) { if (c.r + c.g + c.b > 1.9) c.setRGB(0.86, 0.78, 0.64); else c.setRGB(0.5, 0.36, 0.24); }
};

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
  /** rangées de tuiles couvre-joints sur les pans */
  tiles?: boolean;
  /** rangs d'ardoises ou de bardeaux, pièce par pièce, de l'égout au faîte */
  courses?: boolean;
}

/** Toit à deux pans épais avec débords ; les pignons gardent la couleur des murs */
function roof(p: Parts, x: number, y: number, z: number, o: RoofOpts) {
  const ry = o.ry ?? 0, len = o.len ?? o.w + 0.12, dx = o.dx ?? 0, ov = o.ov ?? 0.07, t = 0.035;
  p.gable(o.w, o.h, o.d, x, y, z, o.wall, ry);
  const hd = o.d / 2, a = Math.atan2(o.h, hd);
  for (const sg of [1, -1]) {
    const sl = Math.hypot(hd, o.h) + ov;
    const cy = o.h / 2 + Math.cos(a) * t / 2 - Math.sin(a) * ov / 2, cz = sg * (hd / 2 + Math.sin(a) * t / 2 + Math.cos(a) * ov / 2);
    p.add(new THREE.BoxGeometry(len, t, sl).rotateX(sg * a).translate(dx, cy, cz).rotateY(ry), x, y, z, o.color);
    if (o.courses) {
      // rangs décalés, chaque pièce un peu plus claire ou plus sombre : le pan prend le grain des ardoises
      const rows = Math.max(3, Math.round(sl / 0.042)), rl = sl / rows;
      for (let j = 0; j < rows; j++)
        for (let u = -len / 2 + (j % 2 ? 0.035 : 0), i = 0; u < len / 2 - 0.01; i++) {
          const pw = Math.min(0.07 + hash2(j, i, 31) * 0.06, len / 2 - u);
          const pg = new THREE.BoxGeometry(pw - 0.006, 0.007, rl + 0.004).translate(dx + u + pw / 2, t / 2 + 0.0035, -sl / 2 + (j + 0.5) * rl);
          p.add(pg.rotateX(sg * a).translate(0, cy, cz).rotateY(ry), x, y, z, dark(o.color, 0.84 + hash2(i, j, 33 + sg) * 0.24));
          u += pw;
        }
    }
    if (!o.tiles) continue;
    // couvre-joints posés sur le pan, de l'égout au faîte
    const ny = Math.cos(a) * (t / 2 + 0.0055), nz = sg * Math.sin(a) * (t / 2 + 0.0055);
    const n = Math.max(3, Math.round(len / 0.045));
    for (let i = 0; i <= n; i++) {
      const tg = new THREE.BoxGeometry(0.011, 0.011, sl).rotateX(sg * a).translate(dx - len / 2 + 0.015 + (i * (len - 0.03)) / n, cy + ny, cz + nz);
      p.add(tg.rotateY(ry), x, y, z, dark(o.color, 0.84));
    }
  }
  p.add(new THREE.BoxGeometry(len, 0.03, 0.06).translate(dx, o.h + 0.012, 0).rotateY(ry), x, y, z, dark(o.color, 0.82));
}

/** Colonne à l'antique : base, fût, chapiteau */
function column(p: Parts, x: number, z: number, h: number, y = 0, r = 0.032) {
  p.cyl(r * 1.35, r * 1.45, 0.025, 8, x, y, z, C.stone);
  p.cyl(r * 0.92, r * 1.06, h - 0.05, 8, x, y + 0.025, z, 0xf2ead8);
  p.cyl(r * 1.3, r, 0.012, 8, x, y + h - 0.037, z, C.stone);
  p.box(r * 2.5, 0.025, r * 2.5, x, y + h - 0.025, z, C.stone);
}

/**
 * Toit d'un seul pan, en tuiles : dalle inclinée de (w × d), rangées de couvre-joints dans le sens de la pente, faîtage en
 * haut, antéfixes au bas. Pente le long de z (vers -z quand tilt > 0) ou, avec alongX, le long de x
 */
function tiledShed(p: Parts, x: number, y: number, z: number, w: number, d: number, tilt: number, alongX = false) {
  const tc = dark(C.terracotta, 0.84), cap = dark(C.terracotta, 0.74);
  if (!alongX) {
    p.add(new THREE.BoxGeometry(w, 0.025, d), x, y, z, C.terracotta, 0, false, 0, -tilt);
    const n = Math.max(3, Math.round(w / 0.047));
    for (let i = 0; i <= n; i++) p.add(new THREE.BoxGeometry(0.011, 0.011, d), x - w / 2 + 0.015 + (i * (w - 0.03)) / n, y + 0.0185, z, tc, 0, false, 0, -tilt);
    p.box(w, 0.016, 0.026, x, y + 0.004 + (d / 2) * Math.sin(tilt), z + d / 2 * Math.cos(tilt), cap);
    for (let i = 0; i <= n; i += 2) p.box(0.012, 0.02, 0.012, x - w / 2 + 0.015 + (i * (w - 0.03)) / n, y - 0.02 - (d / 2) * Math.sin(tilt), z - d / 2 * Math.cos(tilt), 0xf2ead8);
  } else {
    p.add(new THREE.BoxGeometry(w, 0.025, d), x, y, z, C.terracotta, 0, false, tilt);
    const n = Math.max(3, Math.round(d / 0.047));
    for (let i = 0; i <= n; i++) p.add(new THREE.BoxGeometry(w, 0.011, 0.011), x, y + 0.0185, z - d / 2 + 0.015 + (i * (d - 0.03)) / n, tc, 0, false, tilt);
  }
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
/** Enclos (2 × 2) : un pré clôturé, porte devant, abri au fond à gauche, auge et foin ; les bêtes vivent à part (PenView) */
function pen(p: Parts, age: number) {
  const R = 0.88, grass = age === 0 ? 0x9cb86a : 0x8cbf6c, mud = dark(C.dirt, 0.78);
  p.box(1.84, 0.012, 1.84, 0, 0, 0, grass);
  // pré : touffes plus vertes ou jaunies, sentier piétiné de la porte à l'abri, boue et flaque autour de l'auge
  for (const [x, z, r, k] of [[0.3, -0.12, 0.24, 1.1], [-0.38, 0.32, 0.2, 0.9], [0.6, 0.2, 0.16, 1.06], [-0.1, -0.3, 0.14, 0.94], [0.1, 0.5, 0.12, 1.12], [-0.6, -0.05, 0.13, 0.88], [0.66, -0.2, 0.1, 0.92], [-0.3, 0.7, 0.1, 1.08]] as number[][])
    p.cyl(r, r * 0.92, 0.004, 9, x, 0.012, z, dark(grass, k));
  p.box(0.26, 0.005, 1.05, -0.2, 0.012, 0.3, dark(C.dirt, 0.9), 0.32);
  p.cyl(0.22, 0.2, 0.005, 10, 0.45, 0.012, 0.52, mud);
  p.cyl(0.07, 0.065, 0.004, 8, 0.22, 0.017, 0.62, 0x6fa8c0);
  // herbes folles et fleurs
  for (let i = 0; i < 40; i++) {
    const x = Math.sin(i * 2.39) * 0.74, z = Math.cos(i * 1.71 + i * 0.13) * 0.74;
    if (x < -0.1 && z < -0.25) continue;
    if (i % 5 === 0) p.sphere(0.014, x, 0.03, z, [0xf2e27a, 0xffffff, 0xd88ab8][i % 3]);
    else p.cone(0.016, 0.06, 4, x, 0.012, z, dark(grass, 0.78));
  }
  // cailloux, seau
  for (const [x, z, r] of [[0.68, -0.68, 0.03], [0.74, -0.6, 0.022], [-0.72, 0.68, 0.026]]) p.sphere(r, x, 0.015, z, C.stone, 0, 0.6);
  p.cyl(0.035, 0.028, 0.06, 7, 0.24, 0.012, 0.48, age >= 3 ? C.metal : C.darkwood);
  // clôture : branchages, piquets, pierre sèche au Moyen Âge, barrières blanches ensuite
  const wall = age === 2, post = age >= 3 ? C.white : age === 0 ? C.darkwood : C.wood;
  const side = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
    if (wall) { p.box(len, 0.09, 0.07, (x0 + x1) / 2, 0, (z0 + z1) / 2, C.darkstone, ry); p.box(len, 0.03, 0.08, (x0 + x1) / 2, 0.09, (z0 + z1) / 2, C.stone, ry); return; }
    const n = Math.max(1, Math.round(len / 0.2));
    for (let i = 0; i <= n; i++) p.box(0.026, age === 0 ? 0.15 : 0.13, 0.026, x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * i) / n, post);
    for (const y of age === 0 ? [0.05, 0.1, 0.13] : [0.05, 0.1]) p.box(len, 0.018, 0.014, (x0 + x1) / 2, y, (z0 + z1) / 2, post, ry + (age === 0 ? (y - 0.09) * 0.4 : 0));
  };
  side(-R, -R, R, -R); side(R, -R, R, R); side(-R, -R, -R, R);
  side(-R, R, -0.24, R); side(0.24, R, R, R);
  // portail : deux battants ouverts vers l'extérieur ; dès l'Antiquité, un linteau et une lanterne qui luit la nuit
  for (const s of [-1, 1]) {
    p.box(0.035, age === 0 ? 0.2 : 0.24, 0.035, s * 0.25, 0, R, wall ? C.darkstone : post);
    p.box(0.014, 0.1, 0.13, s * 0.27, 0.025, R + 0.07, wall ? C.wood : post, s * 0.35);
    p.box(0.014, 0.018, 0.13, s * 0.27, 0.06, R + 0.07, wall ? C.darkwood : post, s * 0.35, false, s * 0.6);
  }
  if (age >= 1) {
    p.box(0.56, 0.03, 0.045, 0, 0.24, R, wall ? C.darkstone : post);
    p.box(0.012, 0.05, 0.012, 0.25, 0.19, R + 0.035, C.darkwood);
    p.box(0.035, 0.045, 0.035, 0.25, 0.15, R + 0.035, C.flame, 0, true);
  }
  // abri : appentis de branchages, cabane de bois, écurie à colombages, grange ouverte
  const sx = -0.5, sz = -0.56;
  if (age === 2 && attach(['f_stable'], 0, 0.64, sx, sz - 0.04)) { /* écurie importée */ }
  else if (age >= 3 && attach(['f_barn'], 0, 0.62, sx, sz - 0.02)) { /* grange importée */ }
  else if (age === 0) {
    for (const [x, z] of [[-0.2, 0.15], [0.2, 0.15], [-0.2, -0.15], [0.2, -0.15]]) p.box(0.03, z > 0 ? 0.26 : 0.36, 0.03, sx + x, 0, sz + z, C.darkwood);
    p.box(0.5, 0.03, 0.42, sx, 0.31, sz, C.thatch, 0, false, 0);
  } else if (age === 1 && attach(['f_hut'], 0, 0.54, sx, sz - 0.02, Math.PI / 2)) {
    // toit de chaume et son faîtage de paille ; dessous la meule et les sacs de grain
    recolorTop(0.16, C.thatch);
    p.box(0.5, 0.03, 0.05, sx, 0.345, sz - 0.02, dark(C.thatch, 0.82));
    stack(p, sx - 0.1, sz - 0.04, 0.55);
    for (const [x, z] of [[0.14, -0.06], [0.2, 0.02], [0.17, -0.01]]) p.sphere(0.035, sx + x, 0.035, sz + z, 0xd9c4a0, 0, 1.15);
    // devant : la mangeoire pleine de grain, le tas de bûches, la fourche contre le poteau, la lanterne sur son piquet
    p.box(0.26, 0.06, 0.08, sx + 0.1, 0, sz + 0.25, C.darkwood); p.box(0.22, 0.012, 0.06, sx + 0.1, 0.05, sz + 0.25, C.gold);
    for (let k = 0; k < 5; k++) log(p, 0.18, 0.022, sx - 0.17 + (k > 2 ? 0.0 : 0), k > 2 ? 0.038 : 0, sz + 0.23 + (k > 2 ? (k - 3) * 0.045 + 0.022 : k * 0.045));
    p.box(0.012, 0.3, 0.012, sx + 0.34, 0, sz + 0.12, C.wood, 0, false, 0.25);
    p.box(0.012, 0.008, 0.05, sx + 0.266, 0.29, sz + 0.12, C.metal);
    for (const d of [-0.02, 0, 0.02]) p.box(0.006, 0.05, 0.006, sx + 0.266, 0.29, sz + 0.12 + d, C.metal);
    p.box(0.016, 0.28, 0.016, sx + 0.3, 0, sz + 0.27, C.darkwood);
    p.box(0.03, 0.04, 0.03, sx + 0.3, 0.28, sz + 0.27, C.flame, 0, true);
    p.pyramid(0.045, 0.03, 0.045, sx + 0.3, 0.32, sz + 0.27, C.metal);
  } else if (age <= 2) {
    const wallC = age === 1 ? C.wood : C.stone;
    p.box(0.52, 0.26, 0.36, sx, 0, sz, wallC);
    roof(p, sx, 0.26, sz, { w: 0.52, d: 0.36, h: 0.18, color: age === 1 ? C.thatch : C.slate, wall: wallC, ov: 0.05 });
    p.box(0.16, 0.18, 0.02, sx, 0, sz + 0.185, C.darkwood);
  } else {
    p.box(0.56, 0.34, 0.4, sx, 0, sz, 0xb4473c);
    roof(p, sx, 0.34, sz, { w: 0.56, d: 0.4, h: 0.2, color: C.roofdark, wall: 0xb4473c, ov: 0.05 });
    p.box(0.2, 0.24, 0.02, sx, 0, sz + 0.205, C.white);
  }
  // auge d'eau, râtelier à foin contre l'abri, foin et brins éparpillés
  p.box(0.34, 0.07, 0.11, 0.45, 0, 0.56, C.darkwood); p.box(0.3, 0.01, 0.08, 0.45, 0.065, 0.56, C.water);
  for (const x of [-0.24, -0.06]) p.box(0.022, 0.2, 0.022, x, 0, -0.5, C.darkwood);
  p.box(0.22, 0.02, 0.1, -0.15, 0.08, -0.52, C.darkwood);
  for (let i = 0; i < 6; i++) p.box(0.012, 0.12, 0.012, -0.24 + i * 0.036, 0.09, -0.47, C.wood, 0, false, 0.25);
  p.box(0.18, 0.07, 0.06, -0.15, 0.1, -0.53, C.gold);
  for (let i = 0; i < 7; i++) p.box(0.06, 0.004, 0.012, -0.15 + Math.sin(i * 1.9) * 0.14, 0.013, -0.38 + Math.cos(i * 2.3) * 0.08, C.gold, i * 0.9);
  // le coin du fond à droite : foin, gerbes et, dès l'Antiquité, le poulailler (bois brut avant l'âge industriel)
  if (age === 0) stack(p, 0.55, -0.5, 0.7);
  else {
    bale(p, 0.28, -0.6, 0.3); bale(p, 0.4, -0.44, 1.2);
    if (!attach(['f_coop'], 0, 0.28, 0.62, -0.6, -Math.PI / 2, age < 3 ? toTimber : undefined)) stack(p, 0.66, -0.66, 0.55);
  }
  attach(['f_hay'], 0, 0.1, 0.12, -0.7); attach(['f_hay'], 0, 0.085, 0.2, -0.76, 1.3);
  // un banc le long de la clôture, une barrique d'eau à partir du Moyen Âge
  if (age >= 1) attach(['f_bench'], 0, 0.26, -0.7, 0.5, Math.PI / 2);
  if (age >= 2) attach(['f_barrel'], 0, 0.1, 0.72, 0.22);
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
    // grange rouge à pignon sur rue : soubassement de pierre, planches à couvre-joints, angles blancs, toit de bardeaux,
    // porte en croix, fenil ouvert sur le foin sous sa poulie, girouette ; fenêtre éclairée sur le côté, lanterne à la porte
    const bx = -0.06, bz = -0.16, W = 0.56, D = 0.38, H = 0.3, red2 = dark(C.red, 0.82);
    p.box(0.6, 0.05, 0.42, bx, 0, bz, C.stone);
    stones(p, bx, bz + 0.21, 0.6, 0, 0.05, 0, C.stone, 0.85, 1);
    for (const s of [-1, 1]) stones(p, bx + s * 0.3, bz, 0.42, 0, 0.05, s * Math.PI / 2, C.stone, 0.85, 2 + s);
    p.box(W, H, D, bx, 0.05, bz, C.red);
    roof(p, bx, 0.35, bz, { w: D, d: W, h: 0.3, color: C.darkbrick, wall: C.red, ry: Math.PI / 2, len: 0.48, courses: true });
    const zf = bz + D / 2 + 0.006;
    // couvre-joints : sur les pignons (jusque sous le toit), sur les longs pans
    for (let u = -W / 2 + 0.035; u < W / 2 - 0.02; u += 0.052) {
      const top = 0.35 + 0.3 * (1 - Math.abs(u) / (W / 2)) - 0.02;
      for (const s of [-1, 1]) {
        const y0 = s > 0 && Math.abs(u) < 0.12 ? 0.3 : 0.05;
        p.box(0.012, top - y0, 0.008, bx + u, y0, bz + s * (D / 2 + 0.003), red2);
      }
    }
    for (let v = -D / 2 + 0.04; v < D / 2 - 0.02; v += 0.052) for (const s of [-1, 1]) p.box(0.008, H, 0.012, bx + s * (W / 2 + 0.003), 0.05, bz + v, red2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.024, H, 0.024, bx + sx * W / 2, 0.05, bz + sz * D / 2, C.white);
    for (const s of [-1, 1]) p.box(0.012, 0.02, D + 0.02, bx + s * (W / 2 + 0.004), 0.33, bz, C.white);
    // porte de grange à deux battants, croix blanches
    p.box(0.22, 0.25, 0.014, bx, 0.05, zf - 0.003, C.white);
    p.box(0.2, 0.22, 0.02, bx, 0.05, zf, dark(C.red, 0.78));
    p.box(0.008, 0.22, 0.024, bx, 0.05, zf, C.white);
    for (const d of [-0.05, 0.05]) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.2, 0.014, 0.01), bx + d, 0.16, zf + 0.012, C.white, 0, false, s * 1.1);
    // fenil : ouverture sombre sur le foin, poutre et poulie
    p.box(0.14, 0.13, 0.014, bx, 0.39, zf - 0.002, C.white);
    p.box(0.11, 0.1, 0.016, bx, 0.405, zf, 0x3c3028);
    p.box(0.1, 0.045, 0.02, bx, 0.405, zf + 0.002, C.gold);
    p.box(0.024, 0.024, 0.12, bx, 0.56, zf + 0.04, C.darkwood);
    p.cyl(0.016, 0.016, 0.01, 8, bx, 0.535, zf + 0.085, C.metal);
    p.box(0.004, 0.09, 0.004, bx, 0.45, zf + 0.085, 0xc9b48a);
    // girouette au faîte
    p.box(0.008, 0.1, 0.008, bx, 0.66, bz + 0.12, C.darkwood);
    p.box(0.1, 0.008, 0.008, bx, 0.74, bz + 0.12, C.darkwood, 0.6);
    p.box(0.035, 0.03, 0.008, bx, 0.75, bz + 0.12, 0x3c3530, 0.6);
    // fenêtre éclairée sur le côté, lanterne près de la porte
    p.box(0.014, 0.1, 0.11, bx + W / 2 + 0.004, 0.17, bz - 0.04, C.white);
    p.box(0.02, 0.08, 0.09, bx + W / 2 + 0.006, 0.18, bz - 0.04, C.win, 0, true);
    p.box(0.006, 0.08, 0.008, bx + W / 2 + 0.017, 0.18, bz - 0.04, C.darkwood); p.box(0.006, 0.008, 0.09, bx + W / 2 + 0.017, 0.22, bz - 0.04, C.darkwood);
    p.box(0.012, 0.012, 0.05, bx + 0.15, 0.27, zf + 0.02, C.darkwood);
    p.box(0.032, 0.042, 0.032, bx + 0.15, 0.22, zf + 0.04, C.flame, 0, true);
    p.pyramid(0.045, 0.025, 0.045, bx + 0.15, 0.262, zf + 0.04, 0x3c3530);
    // devant : terre battue jonchée de paille, fourche contre le mur ; bottes, meule, clôture
    p.cyl(0.17, 0.18, 0.006, 10, bx, 0, zf + 0.13, dark(C.dirt, 0.82));
    for (let i = 0; i < 7; i++) p.box(0.05, 0.004, 0.006, bx - 0.12 + hash2(i, 1, 51) * 0.24, 0.007, zf + 0.06 + hash2(i, 2, 51) * 0.16, C.gold, hash2(i, 3, 51) * 3);
    p.add(new THREE.BoxGeometry(0.01, 0.3, 0.01).translate(0, 0.15, 0), bx - 0.2, 0, zf + 0.07, C.wood, 0, false, 0, -0.2);
    for (const d of [-0.016, 0, 0.016]) p.add(new THREE.BoxGeometry(0.005, 0.05, 0.005).translate(0, 0.025, 0), bx - 0.2 + d, 0.29, zf + 0.012, C.metal, 0, false, 0, -0.2);
    bale(p, 0.33, -0.28, 0.3); bale(p, 0.33, -0.1, -0.2); bale(p, 0.3, 0.2, 1.2);
    fence(p, -0.45, 0.44, 0.45, 0.44);
    stack(p, -0.32, 0.26, 0.8);
  } else if (age === 3) {
    // grange de planches à angles blancs et portes en croix, silo et son échelle, éolienne de pompage, auge, boîte aux lettres
    const bx = -0.14, bz = -0.18, red = 0xb4473c, zf = bz + 0.17;
    p.box(0.48, 0.05, 0.38, bx, 0, bz, C.darkstone);
    stones(p, bx, bz + 0.19, 0.48, 0, 0.05, 0, C.darkstone, 0.8, 330);
    p.box(0.44, 0.28, 0.34, bx, 0.05, bz, red);
    roof(p, bx, 0.33, bz, { w: 0.44, d: 0.34, h: 0.2, color: C.roofdark, wall: red, len: 0.52, courses: true });
    for (let u = -0.2; u <= 0.2; u += 0.045) for (const s of [-1, 1]) p.box(0.01, 0.28, 0.008, bx + u, 0.05, bz + s * 0.173, dark(red, 0.82));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.02, 0.28, 0.02, bx + sx * 0.22, 0.05, bz + sz * 0.17, C.white);
    p.box(0.46, 0.02, 0.36, bx, 0.33, bz, C.white);
    p.box(0.18, 0.21, 0.014, bx, 0.05, zf + 0.004, C.white); p.box(0.16, 0.19, 0.016, bx, 0.05, zf + 0.008, dark(red, 0.78));
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.22, 0.012, 0.008), bx, 0.145, zf + 0.018, C.white, 0, false, s * 0.86);
    p.box(0.008, 0.19, 0.02, bx, 0.05, zf + 0.012, C.white);
    p.box(0.09, 0.07, 0.014, bx, 0.36, zf + 0.004, C.white); p.box(0.07, 0.05, 0.016, bx, 0.37, zf + 0.007, 0x3c3028); p.box(0.07, 0.02, 0.018, bx, 0.37, zf + 0.008, C.gold);
    p.cyl(0.11, 0.11, 0.58, 10, 0.3, 0, -0.22, C.metal);
    for (const y of [0.08, 0.2, 0.32, 0.44, 0.55]) p.cyl(0.113, 0.113, 0.012, 10, 0.3, y, -0.22, dark(C.metal, 0.8));
    p.sphere(0.11, 0.3, 0.58, -0.22, C.metal, 1, 0.6); p.cyl(0.015, 0.015, 0.03, 6, 0.3, 0.68, -0.22, dark(C.metal, 0.8));
    for (const s of [-1, 1]) p.box(0.006, 0.56, 0.006, 0.3 + s * 0.025, 0.02, -0.105, dark(C.metal, 0.7));
    for (let y = 0.06; y < 0.58; y += 0.05) p.box(0.05, 0.005, 0.005, 0.3, y, -0.105, dark(C.metal, 0.7));
    p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6).rotateZ(1.05), 0.12, 0.5, -0.22, dark(C.metal, 0.85));
    // éolienne de pompage : pylône d'acier, roue à pales qui tourne, gouvernail, réservoir
    const wx = 0.36, wz = 0.3;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.01, 0.46, 0.01).translate(0, 0.23, 0), wx + dx * 0.045, 0, wz + dz * 0.045, 0x8a8f96, 0, false, -dx * 0.09, dz * 0.09);
    for (const y of [0.12, 0.26]) p.box(0.08 - y * 0.12, 0.006, 0.08 - y * 0.12, wx, y, wz, 0x8a8f96);
    p.box(0.03, 0.03, 0.06, wx, 0.45, wz, 0x6a6f78); p.add(new THREE.BoxGeometry(0.004, 0.06, 0.08), wx, 0.46, wz - 0.07, 0xd84a3e);
    const r = spinner([wx, 0.47, wz + 0.04], [0, 0, 1], 2.2);
    for (let i = 0; i < 12; i++) r.add(new THREE.BoxGeometry(0.018, 0.08, 0.004).translate(0, 0.05, 0).rotateZ((i / 12) * Math.PI * 2), 0, 0, 0, C.white);
    r.add(new THREE.TorusGeometry(0.075, 0.004, 3, 16), 0, 0, 0, 0x8a8f96);
    p.cyl(0.07, 0.07, 0.06, 10, wx - 0.12, 0, wz + 0.1, 0x6a7a8a); p.cyl(0.062, 0.062, 0.006, 10, wx - 0.12, 0.058, wz + 0.1, C.water);
    // bottes, tracteur, boîte aux lettres
    bale(p, -0.3, 0.25, 0.2); bale(p, -0.14, 0.3, -0.1);
    tractor(p, 0.12, 0.22);
    p.box(0.01, 0.12, 0.01, -0.42, 0, 0.44, C.wood); p.box(0.05, 0.035, 0.03, -0.42, 0.12, 0.44, 0x4a6aa8); p.box(0.004, 0.025, 0.012, -0.393, 0.14, 0.45, 0xd84a3e);
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
  // Préhistoire : margelle de pierre, seau et petit toit de chaume (puits de Quaternius, tuiles recolorées)
  if (age === 0 && attach(['p_well'], 0, 0.6, 0, 0, Math.PI, unRed(C.thatch))) {
    // sol piétiné et humide autour de la margelle, eau sombre juste sous son rebord
    p.cyl(0.36, 0.37, 0.008, 10, 0, 0, 0, dark(C.dirt, 0.82));
    p.cyl(0.155, 0.155, 0.012, 14, 0, 0.17, 0.052, 0x4f9cc0);
    return;
  }
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
    // fontaine de la place : dallage en couronnes, bassin octogonal à margelle, vasques étagées, jets en gerbe vers le
    // centre, lumières sous l'eau la nuit, bancs tournés vers elle, bornes lumineuses, jardinières fleuries
    const rim = 0xf2ece0, jet = 0xcdeef7;
    p.cyl(0.47, 0.47, 0.012, 16, 0, 0, 0, 0xd8d2c4);
    p.cyl(0.41, 0.41, 0.004, 16, 0, 0.012, 0, 0xc8c0b0);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; p.box(0.004, 0.003, 0.06, Math.cos(a) * 0.44, 0.012, Math.sin(a) * 0.44, 0xb8b0a0, -a); }
    p.cyl(0.32, 0.34, 0.1, 8, 0, 0.016, 0, 0xe8e2d4, false, Math.PI / 8);
    p.cyl(0.335, 0.335, 0.022, 8, 0, 0.112, 0, rim, false, Math.PI / 8);
    p.cyl(0.29, 0.29, 0.01, 8, 0, 0.1, 0, 0x6fb8d0, false, Math.PI / 8);
    for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * Math.PI * 2; p.box(0.024, 0.008, 0.024, Math.cos(a) * 0.26, 0.098, Math.sin(a) * 0.26, 0xbfe8ff, 0, true); }
    // vasques et jet central
    p.cyl(0.05, 0.07, 0.16, 8, 0, 0.1, 0, rim);
    p.cyl(0.16, 0.06, 0.045, 12, 0, 0.255, 0, rim);
    p.cyl(0.14, 0.14, 0.008, 12, 0, 0.292, 0, 0x8fd0e4);
    p.cyl(0.03, 0.04, 0.12, 8, 0, 0.3, 0, rim);
    p.cyl(0.085, 0.035, 0.03, 10, 0, 0.415, 0, rim);
    p.cyl(0.07, 0.07, 0.006, 10, 0, 0.44, 0, 0x8fd0e4);
    p.cyl(0.01, 0.018, 0.16, 6, 0, 0.44, 0, jet);
    p.sphere(0.028, 0, 0.61, 0, 0xe4f6ff, 1);
    // nappes qui tombent des vasques, gerbes de la margelle vers le centre
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.04, 0.15, 0.006, Math.cos(a) * 0.15, 0.11, Math.sin(a) * 0.15, jet, -a + Math.PI / 2); }
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      p.add(new THREE.CylinderGeometry(0.005, 0.009, 0.17, 4).translate(0, 0.085, 0).rotateZ(0.62).rotateY(-a), Math.cos(a) * 0.29, 0.11, Math.sin(a) * 0.29, jet);
    }
    // bancs, bornes lumineuses, jardinières
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 0.405, z = Math.sin(a) * 0.405;
      p.box(0.14, 0.018, 0.045, x, 0.04, z, C.wood, -a + Math.PI / 2);
      for (const d of [-0.05, 0.05]) p.box(0.016, 0.03, 0.04, x - Math.sin(a) * d, 0.012, z + Math.cos(a) * d, 0x5d6878, -a + Math.PI / 2);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2, x = Math.cos(a) * 0.43, z = Math.sin(a) * 0.43;
      if (i % 2) { p.cyl(0.012, 0.014, 0.08, 6, x, 0.012, z, 0x5d6878); p.cyl(0.016, 0.016, 0.016, 6, x, 0.09, z, 0xffe2a0, true); }
      else { p.box(0.08, 0.05, 0.08, x, 0.012, z, 0x8a8a8a); for (let k = 0; k < 4; k++) p.sphere(0.018, x + (k % 2 ? 0.018 : -0.018), 0.075, z + (k < 2 ? 0.018 : -0.018), [C.pink, C.butter, 0xd84a3e, C.lav][k], 0, 0.8); }
    }
  }
}

function workshop(p: Parts, age: number, o: ModelOpts) {
  if (age === 0 && hasModel('p_roof')) {
    // atelier du tailleur de pierre : appentis de bois, établi dessous, meule, blocs à tailler, rondins, éclats au sol
    p.cyl(0.47, 0.48, 0.01, 12, 0, 0, 0, dark(C.dirt, 0.95));
    attach(['p_roof'], 0, 0.36, -0.22, -0.26, 0, toWood, 0.6);
    attach(['p_workbench'], 0, 0.24, 0.02, 0.04, 0, toWood);
    attach(['p_grind'], 0, 0.2, 0.28, -0.18, -0.7, toWood);
    attach(['p_stone'], 0, 0.12, 0.3, 0.24, 0.4);
    attach(['p_stone'], 0, 0.09, 0.16, 0.34, 1.2);
    attach(['p_logs'], 0, 0.26, -0.26, 0.28, 0.35);
    for (let i = 0; i < 8; i++) p.sphere(0.016, 0.05 + Math.cos(i * 2.3) * 0.12, 0.008, 0.26 + Math.sin(i * 2.3) * 0.06, i % 2 ? C.stone : C.darkstone, 0, 0.5);
  } else if (age === 0) {
    p.cone(0.38, 0.5, 5, -0.12, 0, -0.1, C.hide);
    p.box(0.16, 0.1, 0.12, 0.28, 0, 0.2, C.darkstone); p.box(0.1, 0.06, 0.08, 0.28, 0.1, 0.2, C.stone);
    p.box(0.04, 0.34, 0.04, -0.34, 0, 0.3, C.wood); p.box(0.04, 0.34, 0.04, 0.0, 0, 0.3, C.wood); p.box(0.4, 0.03, 0.03, -0.17, 0.32, 0.3, C.wood);
    p.box(0.1, 0.1, 0.02, -0.12, 0, 0.12, C.win, 0, true);
  } else if (age === 1 && attach(['a_stall2'], 0, 0.42, -0.14, -0.2, Math.PI)) {
    // atelier du potier : échoppe au toit de tuiles, jarres, amphores et vases devant, four de brique à la gueule rougeoyante
    p.cyl(0.47, 0.48, 0.01, 12, 0, 0, 0, dark(C.dirt, 0.95));
    attach(['a_pot'], 0, 0.11, 0.2, 0.16);
    attach(['a_pot'], 0, 0.08, 0.32, 0.04, 1.3);
    attach(['a_amphora'], 0, 0.06, 0.06, 0.3);
    attach(['a_amphora'], 0, 0.055, 0.15, 0.34, 0.6);
    attach(['a_vases'], 0, 0.18, -0.24, 0.28);
    attach(['a_jug'], 0, 0.05, 0.36, 0.26);
    p.cyl(0.1, 0.11, 0.12, 9, 0.28, 0, -0.28, 0xb4624a);
    p.sphere(0.1, 0.28, 0.12, -0.28, 0xa8573f, 1, 0.75);
    p.cyl(0.025, 0.03, 0.08, 6, 0.28, 0.18, -0.28, 0x8a4a38);
    p.box(0.07, 0.06, 0.02, 0.28, 0.01, -0.18, C.flame, 0, true);
    smoke(0.28, 0.28, -0.28, 1);
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
    // usine de brique : grande halle aux toits en dents de scie vitrés, haute cheminée cerclée, bureaux à l'avant ; et sa cour
    p.box(0.98, 0.012, 0.98, 0, 0, 0, 0xc9c4ba);
    const brick = 0xa85e50, hx = -0.08, hz = -0.16, W = 0.62, D = 0.42, H = 0.24;
    p.box(W, H, D, hx, 0.012, hz, brick);
    stones(p, hx, hz + D / 2, W, 0.012, H, 0, dark(brick, 0.86), 0.45, 370);
    stones(p, hx - W / 2, hz, D, 0.012, H, -Math.PI / 2, dark(brick, 0.86), 0.45, 371);
    for (const x of [hx - W / 2, hx + W / 2]) quoins(p, x, hz + D / 2, 0.012, H, x < hx ? -1 : 1, 1, 0xd8d0c0);
    p.box(W + 0.02, 0.02, D + 0.02, hx, H, hz, 0xd8d0c0);
    for (let i = 0; i < 4; i++) {
      const x = hx - W / 2 + (i + 0.5) * (W / 4);
      p.add(new THREE.BoxGeometry(W / 4 + 0.01, 0.012, D + 0.02).translate(0, 0.045, 0), x, H + 0.01, hz, 0x5d6878, 0, false, 0.5);
      p.box(0.01, 0.085, D, x + W / 8 - 0.004, H + 0.012, hz, C.glass, 0, true);
      for (let k = 0; k < 4; k++) p.box(0.012, 0.085, 0.008, x + W / 8 - 0.002, H + 0.012, hz - D / 2 + (k + 0.5) * (D / 4), 0x3c4a54);
    }
    windows(p, [hx - 0.22, hx - 0.07, hx + 0.22], 0.08, hz + D / 2 + 0.01, 0.08, 0.1, 0xd8d0c0);
    p.box(0.13, 0.17, 0.016, hx + 0.08, 0.012, hz + D / 2 + 0.006, 0x4a5a64); for (let y = 0.04; y < 0.17; y += 0.03) p.box(0.13, 0.004, 0.018, hx + 0.08, y, hz + D / 2 + 0.008, 0x3a4a54);
    p.add(new THREE.BoxGeometry(0.18, 0.01, 0.08), hx + 0.08, 0.2, hz + D / 2 + 0.04, 0x5d6878, 0, false, 0, 0.25);
    // haute cheminée de brique cerclée de fer, qui fume
    p.cyl(0.035, 0.055, 0.86, 10, 0.3, 0.012, -0.34, brick);
    for (const y of [0.3, 0.55, 0.78]) p.cyl(0.046 - y * 0.012, 0.046 - y * 0.012, 0.014, 10, 0.3, y, -0.34, 0x3c3c40);
    p.cyl(0.045, 0.04, 0.03, 10, 0.3, 0.86, -0.34, 0xd8d0c0);
    smoke(0.3, 0.92, -0.34, 2);
    // bureaux sur deux niveaux, enseigne
    p.box(0.22, 0.3, 0.16, -0.3, 0.012, 0.12, 0xd8c8a8); p.box(0.24, 0.02, 0.18, -0.3, 0.31, 0.12, 0x5d6878);
    windows(p, [-0.35, -0.25], 0.06, 0.205, 0.05, 0.07, C.white); windows(p, [-0.35, -0.25], 0.19, 0.205, 0.05, 0.07, C.white);
    p.box(0.2, 0.045, 0.01, -0.3, 0.33, 0.12, C.cream); for (let k = 0; k < 5; k++) p.box(0.022, 0.025, 0.004, -0.37 + k * 0.035, 0.34, 0.127, 0x3c3530);
    const tx = 0.36, tz = -0.3;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.014, 0.32, 0.014).translate(0, 0.16, 0), tx + dx * 0.05, 0.012, tz + 0.18 + dz * 0.05, 0x4a5560, 0, false, -dx * 0.08, dz * 0.08);
    p.cyl(0.075, 0.075, 0.1, 10, tx, 0.32, tz + 0.18, 0x8a6a4a); for (const y of [0.34, 0.39]) p.cyl(0.077, 0.077, 0.008, 10, tx, y, tz + 0.18, 0x4a4a4a);
    p.cone(0.085, 0.05, 10, tx, 0.42, tz + 0.18, 0x5d6878);
    for (let i = 0; i < 9; i++) p.box(0.1, 0.008, 0.02, 0.4, 0.012, -0.05 + i * 0.06, C.darkwood);
    for (const s of [-1, 1]) p.box(0.006, 0.01, 0.52, 0.4 + s * 0.03, 0.02, 0.19, C.metal);
    p.box(0.08, 0.07, 0.17, 0.4, 0.04, 0.24, 0x8a3a2e); p.box(0.085, 0.01, 0.18, 0.4, 0.11, 0.24, 0x5a2a22);
    for (const d of [-0.05, 0.05]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateZ(Math.PI / 2), 0.4 + s * 0.035, 0.03, 0.24 + d, 0x2a2a2a);
    for (const [x, z, r] of [[0.15, 0.3, 0], [0.22, 0.34, 0.5], [0.17, 0.38, 1.1]]) p.box(0.06, 0.05, 0.06, x, 0.012, z, 0xb48a5e, r);
    for (const [x, z] of [[-0.05, 0.36], [0.02, 0.38]]) { p.cyl(0.026, 0.026, 0.06, 8, x, 0.012, z, 0x6a7a8a); p.cyl(0.027, 0.027, 0.006, 8, x, 0.04, z, 0x3c3c40); }
    p.cone(0.11, 0.09, 8, -0.36, 0.012, 0.3, 0x2a2826);
    p.box(0.012, 0.16, 0.012, -0.32, 0.012, 0.44, 0x3c4a44); p.box(0.012, 0.16, 0.012, -0.12, 0.012, 0.44, 0x3c4a44);
    p.box(0.22, 0.05, 0.01, -0.22, 0.14, 0.44, C.cream); for (let k = 0; k < 5; k++) p.box(0.022, 0.025, 0.004, -0.29 + k * 0.035, 0.152, 0.447, 0x3c3530);
    p.cyl(0.005, 0.007, 0.2, 5, 0.06, 0.012, 0.44, 0x3c4a44); p.box(0.025, 0.03, 0.025, 0.06, 0.21, 0.44, 0xffe2a0, 0, true);
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
  } else if (age === 1 && attach(['a_plaza'], 0, 0.86, 0, -0.02)) {
    // agora : la place dallée à fontaine remplit la parcelle ; sur les dalles des coins du fond l'étal du marchand et ses
    // jarres, sur celles de devant deux bancs de marbre tournés vers la fontaine. Rien ne déborde sur la rue
    const top = 0.03;
    if (attach(['a_stall'], 0, 0.19, 0.33, -0.35, -0.78)) lift(top);
    if (attach(['a_pot'], 0, 0.06, -0.37, -0.3)) lift(top);
    if (attach(['a_jug'], 0, 0.045, -0.3, -0.38, 0.8)) lift(top);
    if (attach(['a_amphora'], 0, 0.05, -0.38, -0.39)) lift(top);
    for (const [x, r] of [[0.34, Math.PI / 4], [-0.34, -Math.PI / 4]]) {
      for (const d of [-0.055, 0.055]) p.box(0.03, 0.04, 0.06, x + Math.cos(r) * d, top, 0.31 - Math.sin(r) * d, C.stone, r);
      p.box(0.16, 0.018, 0.07, x, top + 0.04, 0.31, 0xf2ead8, r);
    }
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
  if (age === 1 && attach(['a_temple'], 0, 0.86, 0, -0.03, 0, toMarble, 1, /mat25/)) {
    // temple grec : marbre crème, toit de tuiles au-dessus des colonnes, cyprès aux angles du parvis
    tileRoof(p, 0.4, C.terracotta);
    p.box(0.94, 0.012, 0.86, 0, 0, 0, 0xd9cdb6);
    for (const x of [-0.42, 0.42]) cypress(p, x, 0.38);
  } else if (age === 1) {
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
    // cathédrale gothique : façade à deux tours et rosace, nef et bas-côtés, arcs-boutants, transept, flèche à la croisée, abside
    const st = 0xd8d0c2, sl = 0x6f7c96, glass = 0x6a7ad8, rose = 0xb48ad8;
    p.box(0.98, 0.012, 0.98, 0, 0, 0, 0xd9d2c4);
    for (let i = 0; i < 18; i++) p.box(0.1, 0.004, 0.1, -0.42 + (i % 6) * 0.17, 0.012, 0.3 + Math.floor(i / 6) * 0.06, dark(0xd9d2c4, 0.9 + (i % 3) * 0.04));
    // nef et bas-côtés
    p.box(0.28, 0.36, 0.52, 0, 0.012, -0.1, st);
    for (const s of [-1, 1]) stones(p, s * 0.14, -0.1, 0.52, 0.22, 0.37, s * Math.PI / 2, st, 0.4, 310 + s);
    roof(p, 0, 0.372, -0.1, { w: 0.52, d: 0.28, h: 0.2, color: sl, wall: st, ry: Math.PI / 2, len: 0.56, ov: 0.03, courses: true });
    for (const s of [-1, 1]) {
      p.box(0.1, 0.2, 0.52, s * 0.19, 0.012, -0.1, st);
      p.add(new THREE.BoxGeometry(0.13, 0.015, 0.54), s * 0.2, 0.232, -0.1, sl, 0, false, -s * 0.35);
      for (const z of [-0.3, -0.06, 0.06]) {
        // fenêtres hautes et basses à vitraux, contrefort, arc-boutant et pinacle
        p.box(0.012, 0.075, 0.035, s * 0.141, 0.26, z, glass, 0, true); p.box(0.012, 0.06, 0.03, s * 0.241, 0.08, z, glass, 0, true);
        p.box(0.035, 0.28, 0.04, s * 0.3, 0.012, z, st); p.cone(0.024, 0.08, 4, s * 0.3, 0.29, z, st);
        p.add(new THREE.BoxGeometry(0.17, 0.02, 0.025), s * 0.22, 0.31, z, st, 0, false, -s * 0.36);
      }
    }
    // transept, rosaces des croisillons, tour et flèche de la croisée
    p.box(0.6, 0.36, 0.14, 0, 0.012, -0.2, st);
    roof(p, 0, 0.372, -0.2, { w: 0.6, d: 0.14, h: 0.1, color: sl, wall: st, len: 0.62, ov: 0.02, courses: true });
    for (const s of [-1, 1]) {
      p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12).rotateZ(Math.PI / 2), s * 0.301, 0.24, -0.2, rose, 0, true);
      p.add(new THREE.TorusGeometry(0.047, 0.008, 4, 12).rotateY(Math.PI / 2), s * 0.304, 0.24, -0.2, st);
    }
    p.box(0.13, 0.12, 0.13, 0, 0.5, -0.2, st);
    for (const [dx, dz, w, d] of [[0, 0.066, 0.05, 0.01], [0.066, 0, 0.01, 0.05]]) for (const s of [-1, 1]) p.box(w, 0.07, d, dx * s, 0.52, -0.2 + dz * s, 0x2a2622);
    p.cone(0.085, 0.36, 8, 0, 0.62, -0.2, sl);
    p.box(0.01, 0.07, 0.01, 0, 0.97, -0.2, C.gold); p.box(0.04, 0.01, 0.01, 0, 1.01, -0.2, C.gold);
    // abside au chevet
    p.cyl(0.14, 0.14, 0.36, 10, 0, 0.012, -0.36, st);
    p.cone(0.16, 0.16, 10, 0, 0.372, -0.36, sl);
    for (const a of [-0.9, 0, 0.9]) p.box(0.035, 0.075, 0.012, Math.sin(Math.PI + a) * 0.141, 0.22, -0.36 + Math.cos(Math.PI + a) * 0.141, glass, Math.PI + a, true);
    // façade : deux tours carrées à balustrade et pinacles, galerie des rois, rosace, portails
    for (const s of [-1, 1]) {
      const x = s * 0.17;
      p.box(0.13, 0.66, 0.13, x, 0.012, 0.2, st);
      stones(p, x, 0.265, 0.13, 0.03, 0.67, 0, st, 0.45, 320 + s);
      quoins(p, x + s * 0.065, 0.265, 0.03, 0.67, s, 1, 0xece4d4);
      for (const y of [0.3, 0.52]) p.box(0.14, 0.015, 0.14, x, y, 0.2, 0xece4d4);
      p.box(0.035, 0.12, 0.012, x - 0.025, 0.56, 0.266, 0x2a2622); p.box(0.035, 0.12, 0.012, x + 0.025, 0.56, 0.266, 0x2a2622);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.cone(0.012, 0.07, 4, x + dx * 0.058, 0.672, 0.2 + dz * 0.058, st);
      p.box(0.14, 0.02, 0.14, x, 0.672, 0.2, st);
      p.box(0.05, 0.1, 0.012, x, 0.012, 0.266, C.door); p.gable(0.014, 0.035, 0.06, x, 0.112, 0.266, st, Math.PI / 2);
    }
    p.box(0.21, 0.5, 0.08, 0, 0.012, 0.2, st); p.gable(0.21, 0.12, 0.08, 0, 0.512, 0.2, st);
    for (let i = 0; i < 7; i++) p.box(0.018, 0.035, 0.008, -0.075 + i * 0.025, 0.27, 0.242, 0x5a5048);
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14).rotateX(Math.PI / 2), 0, 0.38, 0.241, rose, 0, true);
    p.add(new THREE.TorusGeometry(0.062, 0.01, 4, 14), 0, 0.38, 0.246, st);
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.11, 0.006, 0.006).rotateZ((k * Math.PI) / 4), 0, 0.38, 0.248, st);
    p.box(0.1, 0.16, 0.014, 0, 0.012, 0.241, C.door); p.gable(0.02, 0.07, 0.13, 0, 0.172, 0.243, st, Math.PI / 2);
    p.box(0.07, 0.04, 0.006, 0, 0.18, 0.252, C.gold);
    // parvis : réverbères, bancs, arbres
    for (const s of [-1, 1]) {
      p.cyl(0.006, 0.008, 0.2, 5, s * 0.32, 0.012, 0.36, 0x3c4a44); p.box(0.025, 0.03, 0.025, s * 0.32, 0.21, 0.36, 0xffe2a0, 0, true);
      p.box(0.1, 0.012, 0.03, s * 0.32, 0.03, 0.44, C.wood); for (const d of [-0.04, 0.04]) p.box(0.008, 0.03, 0.025, s * 0.32 + d, 0.012, 0.44, 0x3c4a44);
      tree(p, s * 0.42, 0.18, 0.8, 0x8fbf72);
    }
  } else {
    // église moderne : nef blanche à lames de béton sous un grand toit d'ardoise à joints debout, verrière de vitraux
    // colorés et grande croix en façade, auvent et perron, abside au chevet, chapelle basse, campanile ajouré (abat-sons,
    // horloge, deux cloches, croix dorée), parvis dallé entouré d'un muret fleuri, statue sur son socle, arbres, bancs,
    // réverbères, panneau d'affichage et vélos
    const white = 0xf2f0ea, roofC = 0x5d6878, glassC = [0xd84a5a, 0x3c7fd8, 0xe8c66a, 0x4fa860, 0x9a5ad8];
    p.box(0.96, 0.02, 0.96, 0, 0, 0, 0xe2ddd2);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) p.box(0.075, 0.003, 0.075, -0.24 + i * 0.09, 0.02, 0.27 + j * 0.08, (i + j) % 2 ? 0xd2ccc0 : 0xdcd6ca);
    // nef, lames de béton, toit à joints debout, abside
    p.box(0.42, 0.3, 0.6, -0.06, 0.02, -0.1, white);
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) p.box(0.03, 0.3, 0.02, -0.06 + sx * 0.222, 0.02, -0.37 + k * 0.105, 0xe4e2dc);
    p.gable(0.66, 0.2, 0.48, -0.06, 0.32, -0.1, roofC, Math.PI / 2);
    for (let k = 0; k < 7; k++) for (const sx of [-1, 1]) p.add(new THREE.BoxGeometry(0.31, 0.008, 0.008).rotateZ(-sx * 0.695), -0.06 + sx * 0.12, 0.427, -0.4 + k * 0.1, 0x7d8a9a);
    p.box(0.02, 0.02, 0.66, -0.06, 0.515, -0.1, 0x7d8a9a);
    p.cyl(0.14, 0.14, 0.26, 10, -0.06, 0.02, -0.4, white);
    p.cone(0.15, 0.1, 10, -0.06, 0.28, -0.4, roofC);
    for (let i = 0; i < 3; i++) { const a = Math.PI + (i - 1) * 0.6; p.box(0.02, 0.12, 0.012, -0.06 + Math.sin(a) * 0.142, 0.1, -0.4 + Math.cos(a) * 0.142, glassC[i + 1], a, true); }
    // pignon de façade, verrière de vitraux, grande croix en relief, auvent, perron, portes
    p.gable(0.02, 0.2, 0.42, -0.06, 0.32, 0.205, white, Math.PI / 2);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
      const x = -0.06 + (i - 2) * 0.05, y = 0.12 + j * 0.06, top = 0.32 + 0.2 * (1 - Math.abs(i - 2) / 2.6);
      if (y + 0.05 < top && !(i === 2)) p.box(0.042, 0.052, 0.012, x, y, 0.205, glassC[(i + j * 2) % glassC.length], 0, true);
    }
    for (let i = -3; i <= 3; i++) { const dx = i * 0.05 + (i > 0 ? -0.025 : i < 0 ? 0.025 : 0); p.box(0.006, 0.31 - Math.abs(dx) * 0.95, 0.016, -0.06 + dx, 0.1, 0.21, 0x5d6878); }
    p.box(0.03, 0.34, 0.02, -0.06, 0.12, 0.218, C.white); p.box(0.16, 0.03, 0.02, -0.06, 0.34, 0.218, C.white);
    p.box(0.12, 0.09, 0.016, -0.06, 0.02, 0.212, C.door); p.box(0.003, 0.09, 0.018, -0.06, 0.02, 0.214, 0x5a4232);
    for (const sx of [-1, 1]) p.box(0.006, 0.02, 0.008, -0.06 + sx * 0.012, 0.06, 0.222, C.gold);
    p.add(new THREE.BoxGeometry(0.22, 0.012, 0.1), -0.06, 0.12, 0.25, roofC, 0, false, 0, 0.08);
    for (const sx of [-1, 1]) p.box(0.008, 0.1, 0.008, -0.06 + sx * 0.1, 0.02, 0.29, 0x5d6878);
    for (let k = 0; k < 2; k++) p.box(0.26 + k * 0.04, 0.01, 0.04, -0.06, 0.02 - k * 0.0, 0.24 + k * 0.035, 0xd2ccc0);
    // fentes de lumière sur les côtés
    for (const sx of [-1, 1]) for (const z of [-0.32, -0.21, -0.1, 0.01, 0.12]) p.box(0.012, 0.2, 0.025, -0.06 + sx * 0.212, 0.06, z + 0.05, glassC[Math.abs(Math.round(z * 100)) % 5], 0, true);
    // chapelle basse
    p.box(0.16, 0.16, 0.24, -0.36, 0.02, -0.22, 0xe8e4dc); p.box(0.18, 0.02, 0.26, -0.36, 0.18, -0.22, roofC);
    p.box(0.012, 0.1, 0.05, -0.441, 0.05, -0.22, glassC[1], 0, true); p.box(0.05, 0.08, 0.012, -0.36, 0.02, -0.098, C.door);
    // campanile ajouré : fût, horloge, abat-sons, deux cloches, toit, croix
    const tx = 0.3, tz = -0.24;
    p.box(0.13, 0.5, 0.13, tx, 0.02, tz, white);
    for (const sx of [-1, 1]) p.box(0.012, 0.5, 0.135, tx + sx * 0.06, 0.02, tz, 0xe4e2dc);
    for (let y = 0.1; y < 0.36; y += 0.12) p.box(0.02, 0.07, 0.012, tx, y, tz + 0.066, glassC[1], 0, true);
    p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.01, 14).rotateX(Math.PI / 2), tx, 0.44, tz + 0.068, C.white);
    p.box(0.004, 0.025, 0.004, tx, 0.445, tz + 0.074, 0x2a2a2a); p.box(0.018, 0.004, 0.004, tx + 0.006, 0.44, tz + 0.074, 0x2a2a2a);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.022, 0.16, 0.022, tx + dx * 0.054, 0.52, tz + dz * 0.054, white);
    for (const [ry, dx, dz] of [[0, 0, 1], [0, 0, -1], [Math.PI / 2, 1, 0], [Math.PI / 2, -1, 0]] as [number, number, number][]) for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.08, 0.008, 0.02), tx + dx * 0.058, 0.55 + k * 0.035, tz + dz * 0.058, 0x8a96a2, ry, false, 0, 0.5);
    p.sphere(0.03, tx - 0.02, 0.6, tz, C.gold, 1, 1.1); p.sphere(0.022, tx + 0.025, 0.59, tz, C.gold, 1, 1.1);
    p.box(0.1, 0.008, 0.008, tx, 0.65, tz, 0x5a4a3a);
    p.box(0.15, 0.025, 0.15, tx, 0.68, tz, roofC); p.pyramid(0.14, 0.06, 0.14, tx, 0.705, tz, roofC);
    p.box(0.012, 0.14, 0.012, tx, 0.765, tz, C.gold); p.box(0.07, 0.012, 0.012, tx, 0.85, tz, C.gold);
    // parvis : muret fleuri, statue sur son socle, arbres, bancs, réverbères, panneau d'affichage, vélos
    for (const sx of [-1, 1]) { p.box(0.3, 0.05, 0.03, -0.06 + sx * 0.3, 0.02, 0.46, 0xd2ccc0); for (let k = 0; k < 6; k++) p.sphere(0.02, -0.06 + sx * (0.18 + k * 0.045), 0.08, 0.46, [C.pink, C.butter, 0xd84a3e, C.lav, C.white, 0xe8a83c][k], 0, 0.8); }
    p.box(0.06, 0.08, 0.06, 0.22, 0.02, 0.32, 0xd2ccc0); p.box(0.03, 0.08, 0.025, 0.22, 0.1, 0.32, 0xf2f2f2); p.sphere(0.016, 0.22, 0.2, 0.32, 0xf2f2f2); p.cone(0.03, 0.06, 6, 0.22, 0.1, 0.32, 0x8fb8e4);
    for (const x of [-0.4, 0.38]) tree(p, x, 0.3, 0.7);
    for (const x of [-0.26, 0.08]) { p.box(0.1, 0.014, 0.035, x, 0.045, 0.4, C.wood); p.box(0.1, 0.035, 0.008, x, 0.06, 0.418, C.wood); for (const d of [-0.035, 0.035]) p.box(0.012, 0.025, 0.03, x + d, 0.02, 0.4, 0x5d6878); }
    for (const x of [-0.44, 0.44]) { p.cyl(0.006, 0.008, 0.2, 5, x, 0.02, 0.2, 0x5d6878); p.box(0.025, 0.025, 0.025, x, 0.22, 0.2, 0xffe2a0, 0, true); }
    p.box(0.01, 0.12, 0.01, -0.36, 0.02, 0.0, 0x5d6878); p.box(0.1, 0.07, 0.01, -0.36, 0.1, 0.0, 0x8a6a4a); p.box(0.08, 0.05, 0.004, -0.36, 0.11, 0.006, 0xf2ece0);
    for (let k = 0; k < 3; k++) { const x = 0.34 + k * 0.05; for (const d of [-0.025, 0.025]) p.add(new THREE.TorusGeometry(0.02, 0.004, 4, 10).rotateY(Math.PI / 2), x, 0.04, 0.0 + d, 0x3c3c40); p.box(0.004, 0.004, 0.05, x, 0.05, 0.0, [0xd8553c, 0x3c7fd8, 0x4fa860][k]); }
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
    // gare : bâtiment des voyageurs en brique à pavillon central et horloge, tour de l'horloge, quai sous marquise de fonte,
    // voie où s'arrêtent les trains des lignes, bancs, réverbères, chariot à bagages
    const brick = 0xb4685c, bz = -0.55, W = 1.36, D = 0.46, H = 0.46, zf = bz + D / 2;
    p.box(1.9, 0.03, 1.9, 0, 0, 0, 0xd9d2c4);
    p.box(W, H, D, -0.16, 0.03, bz, brick);
    stones(p, -0.16, zf, W, 0.03, H + 0.03, 0, dark(brick, 0.86), 0.45, 380);
    for (const x of [-0.16 - W / 2, -0.16 + W / 2]) quoins(p, x, zf, 0.03, H + 0.03, x < -0.16 ? -1 : 1, 1);
    for (const y of [0.03, 0.27, H + 0.02]) p.box(W + 0.02, 0.025, D + 0.02, -0.16, y, bz, C.cream);
    roof(p, -0.16, H + 0.03, bz, { w: W, d: D, h: 0.22, color: C.slate, wall: brick, courses: true });
    for (const x of [-0.7, -0.5, -0.3, 0.0, 0.2, 0.4]) { windows(p, [x], 0.08, zf + 0.01, 0.08, 0.14, C.cream); p.gable(0.014, 0.035, 0.1, x, 0.234, zf + 0.005, C.cream, Math.PI / 2); windows(p, [x], 0.32, zf + 0.01, 0.07, 0.09, C.cream); }
    // pavillon central : fronton, horloge, enseigne, grande porte
    p.box(0.3, 0.6, 0.08, -0.15, 0.03, zf + 0.03, C.cream); p.gable(0.32, 0.12, 0.1, -0.15, 0.63, zf + 0.03, C.slate);
    p.cyl(0.06, 0.06, 0.012, 14, -0.15, 0.52, zf + 0.075, C.white); p.add(new THREE.CylinderGeometry(0.055, 0.055, 0.014, 14).rotateX(Math.PI / 2), -0.15, 0.52, zf + 0.078, C.white);
    p.box(0.005, 0.045, 0.004, -0.15, 0.52, zf + 0.087, 0x2a2a2a); p.box(0.035, 0.005, 0.004, -0.137, 0.52, zf + 0.087, 0x2a2a2a);
    p.box(0.22, 0.045, 0.01, -0.15, 0.42, zf + 0.075, 0x3f5a4a); for (let k = 0; k < 4; k++) p.box(0.03, 0.025, 0.004, -0.205 + k * 0.037, 0.43, zf + 0.081, C.gold);
    p.box(0.14, 0.26, 0.02, -0.15, 0.03, zf + 0.075, 0x4a3a2e); p.gable(0.02, 0.05, 0.16, -0.15, 0.29, zf + 0.075, C.cream, Math.PI / 2);
    // tour de l'horloge
    const tx = 0.66;
    p.box(0.26, 1.02, 0.26, tx, 0.03, bz, dark(brick, 0.9));
    stones(p, tx, bz + 0.13, 0.26, 0.03, 1.05, 0, dark(brick, 0.78), 0.45, 381);
    for (const y of [0.5, 0.95]) p.box(0.29, 0.025, 0.29, tx, y, bz, C.cream);
    for (const [dx, dz, ry] of [[0, 0.131, 0], [0.131, 0, Math.PI / 2]]) {
      p.add(new THREE.CylinderGeometry(0.075, 0.075, 0.014, 14).rotateX(Math.PI / 2).rotateY(ry), tx + dx, 0.82, bz + dz, C.white);
      p.add(new THREE.BoxGeometry(0.006, 0.06, 0.004).rotateY(ry), tx + dx * 1.06, 0.84, bz + dz * 1.06, 0x2a2a2a);
    }
    p.pyramid(0.34, 0.26, 0.34, tx, 1.05, bz, C.slate); p.box(0.01, 0.1, 0.01, tx, 1.31, bz, C.gold);
    farPlatform(p, false);
    // quai et marquise de fonte, voie (les trains des lignes s'y arrêtent)
    p.box(1.9, 0.08, 0.36, 0, 0.03, -0.12, C.stone); p.box(1.9, 0.014, 0.04, 0, 0.11, 0.04, 0xece4d4);
    for (let i = 0; i < 6; i++) { const x = -0.8 + i * 0.32; p.cyl(0.012, 0.016, 0.34, 6, x, 0.11, 0.0, 0x3f6a4a); p.add(new THREE.BoxGeometry(0.1, 0.012, 0.012), x, 0.43, 0.0, 0x3f6a4a, 0, false, 0.6); }
    p.add(new THREE.BoxGeometry(1.86, 0.016, 0.44), 0, 0.46, -0.12, C.slate, 0, false, 0, 0.12);
    for (let k = 0; k < 6; k++) p.add(new THREE.BoxGeometry(1.86, 0.006, 0.03).translate(0, 0.011, -0.19 + k * 0.075), 0, 0.46, -0.12, dark(C.slate, k % 2 ? 0.86 : 1.05), 0, false, 0, 0.12);
    for (let x = -0.92; x <= 0.92; x += 0.1) p.box(0.04, 0.016, 0.24, x, 0.03, 0.34, C.darkwood);
    for (const z of [0.28, 0.4]) p.box(1.9, 0.02, 0.014, 0, 0.046, z, C.metal);
    // bancs, réverbères, chariot à bagages, bacs de fleurs
    for (const x of [-0.6, 0.0]) { p.box(0.16, 0.02, 0.05, x, 0.15, -0.2, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.04, 0.04, x + d, 0.11, -0.2, 0x3c4a44); }
    for (const x of [-0.85, -0.3, 0.3, 0.85]) { p.cyl(0.007, 0.009, 0.3, 5, x, 0.11, 0.0, 0x3c4a44); p.box(0.035, 0.04, 0.035, x, 0.41, 0.0, 0xffe2a0, 0, true); }
    p.box(0.12, 0.03, 0.07, 0.3, 0.15, -0.22, C.wood); for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8).rotateX(Math.PI / 2), 0.3 + s * 0.04, 0.13, -0.22 + s * 0.0, C.darkwood);
    for (const [x, c] of [[0.24, 0x8a5a3a], [0.32, 0x4a6aa8]] as [number, number][]) p.box(0.05, 0.035, 0.035, x, 0.18, -0.22, c);
    for (const x of [-0.9, 0.1]) { p.box(0.14, 0.04, 0.05, x, 0.03, zf + 0.12, C.wood); for (let k = 0; k < 4; k++) p.sphere(0.018, x - 0.045 + k * 0.03, 0.08, zf + 0.12, [C.pink, C.butter, 0xd84a3e, C.lav][k], 0, 0.8); }
  } else {
    // gare centrale moderne : grand hall de pierre claire sous une voûte de zinc, verrière en arc sur le quai, tour de
    // l'horloge effilée, quai sous un auvent ondulé porté par des piliers en arbre, voie devant (comme à la gare)
    const stone = 0xebe6dc, zinc = 0x7d8fa0, steel = 0x5d6878, glass = 0x9cc8dc;
    p.box(1.9, 0.03, 1.9, 0, 0, 0, 0xd8d4cc);
    platformTrack(p, 0.03, true);
    farPlatform(p, true);
    p.box(1.9, 0.08, 0.38, 0, 0.03, -0.03, 0xc8c4bc);
    p.box(1.9, 0.004, 0.03, 0, 0.11, 0.14, 0xf2c84b);
    // le hall : socle, pilastres, corniche, voûte et ses côtes
    const hz = -0.6, hd = 0.62, hw = 1.5, hh = 0.42;
    p.box(hw, hh, hd, -0.12, 0.03, hz, stone);
    p.box(hw + 0.04, 0.05, hd + 0.04, -0.12, 0.03, hz, dark(stone, 0.86));
    p.box(hw + 0.04, 0.035, hd + 0.04, -0.12, 0.03 + hh, hz, dark(stone, 0.92));
    for (let i = 0; i < 7; i++) p.box(0.04, hh - 0.05, 0.02, -0.82 + i * 0.233, 0.08, hz + hd / 2 + 0.01, dark(stone, 0.94));
    p.add(new THREE.CylinderGeometry(0.31, 0.31, hw, 10, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2), -0.12, 0.03 + hh + 0.035, hz, zinc);
    for (let i = 0; i < 6; i++) p.add(new THREE.TorusGeometry(0.312, 0.012, 4, 12, Math.PI).rotateY(Math.PI / 2), -0.82 + i * 0.28, 0.03 + hh + 0.035, hz, steel);
    // verrière en arc au-dessus de l'entrée, côté quai, et ses meneaux
    p.add(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), -0.12, 0.2, hz + hd / 2 + 0.012, glass, 0, true);
    for (let k = -2; k <= 2; k++) p.box(0.012, 0.27 * Math.cos(Math.asin(Math.min(1, Math.abs(k) / 3))) + 0.0, 0.012, -0.12 + k * 0.09, 0.2, hz + hd / 2 + 0.026, steel);
    p.box(0.56, 0.17, 0.02, -0.12, 0.03, hz + hd / 2 + 0.012, glass, 0, true);
    for (let k = -2; k <= 2; k++) p.box(0.012, 0.17, 0.014, -0.12 + k * 0.13, 0.03, hz + hd / 2 + 0.026, steel);
    p.box(0.6, 0.012, 0.02, -0.12, 0.2, hz + hd / 2 + 0.026, steel);
    // fenêtres hautes des ailes, enseigne lumineuse
    for (const x of [-0.7, -0.52, 0.28, 0.46]) { p.box(0.1, 0.22, 0.012, x, 0.12, hz + hd / 2 + 0.012, glass, 0, true); p.box(0.11, 0.012, 0.016, x, 0.34, hz + hd / 2 + 0.014, steel); }
    p.box(0.42, 0.05, 0.012, -0.12, 0.5, hz + hd / 2 + 0.02, 0x2e3c48); p.box(0.36, 0.024, 0.004, -0.12, 0.513, hz + hd / 2 + 0.028, 0xfff0c0, 0, true);
    // façade arrière, côté parvis : hautes fenêtres, porte vitrée sous un auvent, pignons des ailes
    const bz = hz - hd / 2 - 0.012;
    for (const x of [-0.72, -0.5, 0.26, 0.48]) { p.box(0.1, 0.24, 0.012, x, 0.1, bz, glass, 0, true); p.box(0.11, 0.012, 0.016, x, 0.35, bz - 0.002, steel); }
    p.box(0.36, 0.22, 0.012, -0.12, 0.03, bz, glass, 0, true);
    for (let k = -1; k <= 1; k++) p.box(0.012, 0.22, 0.016, -0.12 + k * 0.12, 0.03, bz - 0.004, steel);
    p.add(new THREE.BoxGeometry(0.5, 0.014, 0.14), -0.12, 0.27, bz - 0.06, steel, 0, false, 0, 0.12);
    p.box(0.3, 0.04, 0.012, -0.12, 0.31, bz - 0.004, 0x2e3c48); p.box(0.25, 0.02, 0.004, -0.12, 0.32, bz - 0.012, 0xfff0c0, 0, true);
    for (const sx of [-1, 1]) p.box(0.012, hh - 0.05, 0.36, -0.12 + sx * (hw / 2 + 0.006), 0.08, hz, dark(stone, 0.94));
    for (const sx of [-1, 1]) for (const z of [-0.75, -0.6, -0.45]) p.box(0.012, 0.18, 0.08, -0.12 + sx * (hw / 2 + 0.008), 0.14, z, glass, 0, true);
    // tour de l'horloge, effilée, horloges sur deux faces, flèche
    const tx = 0.78, tz = -0.62;
    p.box(0.2, 1.15, 0.2, tx, 0.03, tz, stone);
    for (let y = 0.2; y < 0.95; y += 0.18) p.box(0.04, 0.1, 0.012, tx, y, tz + 0.106, glass, 0, true);
    p.box(0.24, 0.03, 0.24, tx, 1.0, tz, dark(stone, 0.9));
    for (const [dx, dz, ry] of [[0, 0.101, 0], [0.101, 0, Math.PI / 2]]) {
      p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 16).rotateX(Math.PI / 2).rotateY(ry), tx + dx, 1.08, tz + dz, C.white);
      p.add(new THREE.BoxGeometry(0.006, 0.05, 0.004).rotateY(ry), tx + dx * 1.07, 1.095, tz + dz * 1.07, 0x2a2a2a);
      p.add(new THREE.BoxGeometry(0.04, 0.006, 0.004).rotateY(ry), tx + dx * 1.07 + (ry ? 0 : 0.012), 1.08, tz + dz * 1.07 + (ry ? 0.012 : 0), 0x2a2a2a);
    }
    p.box(0.22, 0.02, 0.22, tx, 1.15, tz, dark(stone, 0.9));
    p.pyramid(0.2, 0.22, 0.2, tx, 1.17, tz, zinc);
    p.cyl(0.006, 0.006, 0.14, 4, tx, 1.39, tz, C.gold);
    // auvent ondulé du quai, porté par des piliers en arbre
    for (let i = 0; i < 4; i++) {
      const x = -0.72 + i * 0.48;
      p.cyl(0.016, 0.022, 0.24, 6, x, 0.11, -0.04, steel);
      for (const a of [-0.5, 0.5]) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4).translate(0, 0.07, 0), x, 0.33, -0.04, steel, 0, false, a, 0);
      for (const a of [-0.5, 0.5]) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4).translate(0, 0.06, 0), x, 0.33, -0.04, steel, 0, false, 0, a);
    }
    for (let k = 0; k < 8; k++) p.add(new THREE.BoxGeometry(0.24, 0.016, 0.44), -0.84 + k * 0.24, 0.45 + (k % 2 ? 0.02 : -0.01), -0.04, k % 2 ? 0xf2f2ee : 0xe2e6ea, 0, false, 0, (k % 2 ? 1 : -1) * 0.06);
    p.box(1.9, 0.015, 0.02, 0, 0.44, 0.18, 0xf2c84b);
    // sur le quai : écrans des départs, bancs, distributeur, réverbères, arbres en bac
    for (const x of [-0.45, 0.45]) { p.box(0.01, 0.12, 0.01, x, 0.31, -0.04, steel); p.box(0.18, 0.06, 0.014, x, 0.33, -0.04, 0x2e3c48); p.box(0.15, 0.035, 0.004, x, 0.343, -0.031, 0xffb84a, 0, true); }
    for (const x of [-0.7, -0.2, 0.2]) p.box(0.16, 0.02, 0.05, x, 0.15, -0.16, 0x8a96a2);
    p.box(0.07, 0.14, 0.05, 0.7, 0.11, -0.16, 0xd8553c); p.box(0.04, 0.03, 0.006, 0.7, 0.2, -0.132, 0x9de0ff, 0, true);
    for (const x of [-0.92, 0.92]) { p.box(0.1, 0.06, 0.1, x, 0.11, -0.12, 0x8a8a8a); p.cyl(0.01, 0.012, 0.08, 5, x, 0.17, -0.12, C.darkwood); p.sphere(0.06, x, 0.3, -0.12, C.darkgreen, 1); }
    // parvis derrière : bacs fleuris, drapeaux, vélos
    for (const x of [-0.6, 0.35]) { p.box(0.22, 0.05, 0.08, x, 0.03, -0.95, 0x8a8a8a); for (let k = 0; k < 5; k++) p.sphere(0.02, x - 0.08 + k * 0.04, 0.09, -0.95, [C.pink, C.butter, 0xd84a3e, C.lav, C.white][k], 0, 0.8); }
    for (let k = 0; k < 3; k++) { const x = -0.95 + k * 0.08; p.cyl(0.005, 0.005, 0.5, 4, x, 0.03, -0.28, 0xd8dde2); p.box(0.06, 0.04, 0.004, x + 0.03, 0.47, -0.28, [0x3c7fd8, C.white, 0xd8553c][k]); }
  }
}

/** Croix rouge sur fond blanc, face à +z, centrée en (x, y, z) */
function redCross(p: Parts, x: number, y: number, z: number, s = 1) {
  p.box(0.16 * s, 0.16 * s, 0.015, x, y - 0.08 * s, z, C.white);
  p.box(0.11 * s, 0.035 * s, 0.01, x, y - 0.0175 * s, z + 0.01, 0xd84a3e);
  p.box(0.035 * s, 0.11 * s, 0.01, x, y - 0.055 * s, z + 0.01, 0xd84a3e);
}

/** Rangée de fenêtres éclairées la nuit sur la façade z : encadrement, appui, croisée de bois qui partage les carreaux */
function windows(p: Parts, xs: number[], y: number, z: number, w = 0.08, h = 0.1, frame = 0xece4d4) {
  for (const x of xs) {
    p.box(w, h, 0.02, x, y, z, C.win, 0, true);
    p.box(w + 0.022, h + 0.022, 0.014, x, y - 0.011, z - 0.005, frame);
    p.box(w + 0.034, 0.014, 0.034, x, y - 0.016, z + 0.004, frame);
    p.box(0.008, h, 0.006, x, y, z + 0.012, C.darkwood);
    p.box(w, 0.008, 0.006, x, y + h * 0.55, z + 0.012, C.darkwood);
  }
}

/**
 * Moellons d'un mur : rangs décalés de pierres de longueurs et de teintes variées, en léger relief, sur la face de centre
 * (cx, cz) tournée selon ry (0 : vers +z), large de `len`, de y0 à y1 ; `fill` : part des pierres posées
 */
function stones(p: Parts, cx: number, cz: number, len: number, y0: number, y1: number, ry: number, color: number, fill = 0.6, seed = 0) {
  const c = Math.cos(ry), s = Math.sin(ry), rh = 0.042;
  for (let r = 0; y0 + r * rh + 0.02 < y1; r++) {
    const y = y0 + r * rh, hh = Math.min(rh, y1 - y) - 0.007;
    for (let u = -len / 2 + (r % 2 ? 0.035 : 0.004), i = 0; u < len / 2 - 0.02; i++) {
      const sw = Math.min(0.05 + hash2(r, i, seed) * 0.06, len / 2 - u), m = u + sw / 2;
      if (hash2(i, r, seed + 1) < fill) p.box(sw - 0.007, hh, 0.008, cx + m * c, y + 0.0035, cz - m * s, dark(color, 0.86 + hash2(r + 9, i, seed + 2) * 0.2), ry);
      u += sw;
    }
  }
}

/** Chaîne d'angle : pierres de taille alternées, longues sur une face puis sur l'autre ; (sx, sz) : côtés vers l'extérieur */
function quoins(p: Parts, x: number, z: number, y0: number, y1: number, sx: number, sz: number, color = 0xe9e2d4) {
  for (let i = 0, y = y0; y + 0.03 < y1; i++, y += 0.055) {
    const a = i % 2 ? 0.085 : 0.05, b = i % 2 ? 0.05 : 0.085;
    p.box(a, 0.047, b, x - sx * (a / 2 - 0.006), y + 0.004, z - sz * (b / 2 - 0.006), color);
  }
}

/**
 * Pans de bois sur une face (centre cx, cz, tournée selon ry) : poteaux, sablières, et dans les travées que `braced` retient
 * des décharges en croix de Saint-André
 */
function timbers(p: Parts, cx: number, cz: number, len: number, y0: number, y1: number, ry: number, n: number, braced: (i: number) => boolean = () => true, color = C.darkwood) {
  const c = Math.cos(ry), s = Math.sin(ry), h = y1 - y0, bay = len / n;
  for (let i = 0; i <= n; i++) { const u = -len / 2 + i * bay; p.box(0.024, h, 0.012, cx + u * c, y0, cz - u * s, color, ry); }
  for (const y of [y0, y1 - 0.022]) p.box(len, 0.022, 0.012, cx, y, cz, color, ry);
  const dl = Math.hypot(bay, h) * 0.94, ang = Math.atan2(h, bay);
  for (let i = 0; i < n; i++) {
    if (!braced(i)) continue;
    const u = -len / 2 + (i + 0.5) * bay;
    for (const sg of [1, -1]) p.add(new THREE.BoxGeometry(dl, 0.018, 0.01), cx + u * c, y0 + h / 2, cz - u * s, color, ry, false, sg * ang);
  }
}

/** Haie taillée : un bloc de buis bosselé de touffes un peu plus claires ou plus sombres */
function hedge(p: Parts, x: number, z: number, w: number, d: number, h = 0.07, y = 0.03) {
  p.box(w, h, d, x, y, z, C.darkgreen);
  const n = Math.max(1, Math.round(Math.max(w, d) / 0.07)), along = w >= d;
  for (let i = 0; i < n; i++) {
    const u = -0.5 + (i + 0.5) / n;
    p.sphere(Math.min(w, d) * 0.5 + 0.008, x + (along ? u * w : 0), y + h, z + (along ? 0 : u * d), dark(C.darkgreen, 0.9 + hash2(i, n, 41) * 0.2), 0, 0.55);
  }
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
    // tentes de peaux (Survival Kit de Kenney, toiles recolorées), sinon huttes coniques
    const tents = attach(['p_tent'], 0, 0.62, -0.44, -0.46, 0.25, unRed(C.hide)) && attach(['p_tent'], 0, 0.5, 0.46, -0.52, -0.4, unRed(0xc9a98a));
    if (!tents) {
      p.cone(0.36, 0.64, 7, -0.46, 0, -0.44, C.hide); p.add(new THREE.ConeGeometry(0.12, 0.28, 3), -0.46, 0.14, -0.1, C.darkwood);
      for (const a of [-0.25, 0.25]) pole(p, 0.008, 0.24, -0.46 + a * 0.1, -0.44, C.wood, 0, a, 0.58);
      p.cone(0.28, 0.5, 6, 0.46, 0, -0.52, 0xc9a98a); p.add(new THREE.ConeGeometry(0.09, 0.22, 3), 0.46, 0.11, -0.26, C.darkwood);
    }
    for (const x of [0.02, 0.4, 0.78]) p.box(0.03, 0.44, 0.03, x, 0, 0.1, C.wood);
    p.box(0.8, 0.025, 0.025, 0.4, 0.42, 0.1, C.wood);
    for (let i = 0; i < 9; i++) p.add(new THREE.ConeGeometry(0.03, 0.12, 5).rotateZ(Math.PI), 0.06 + i * 0.085, 0.35, 0.1, [0x8fbf6a, 0x6fa35a, C.lav][i % 3]);
    // le feu et sa marmite de tisanes (modèle de Kenney), la flamme luit la nuit et fume
    if (attach(['p_campfire'], 0, 0.3, -0.22, 0.32, 0, toWood)) {
      p.cone(0.035, 0.09, 5, -0.22, 0.015, 0.32, C.flame, true);
      smoke(-0.22, 0.2, 0.32, 1);
    } else {
      campfire(p, -0.22, 0.32);
      for (const a of [0, 2.1, 4.2]) pole(p, 0.007, 0.3, -0.22 + Math.cos(a) * 0.09, 0.32 + Math.sin(a) * 0.09, C.darkwood, -Math.sin(a) * 0.3, Math.cos(a) * 0.3);
      p.sphere(0.06, -0.22, 0.17, 0.32, 0x4a4440, 0, 0.8);
    }
    // couchages des malades, seau d'eau
    for (const [x, z] of [[-0.62, 0.02], [-0.66, 0.3]]) if (!attach(['p_bedroll'], 0, 0.28, x, z, Math.PI / 2, toFur)) { p.box(0.3, 0.015, 0.16, x + 0.04, 0, z, C.hide); p.box(0.07, 0.04, 0.12, x - 0.08, 0.015, z, 0xe8dcc0); }
    if (!attach(['p_bucket'], 0, 0.09, 0.12, 0.6)) { p.cyl(0.05, 0.04, 0.07, 7, 0.12, 0, 0.6, C.darkstone); pole(p, 0.008, 0.12, 0.13, 0.6, C.wood, 0, -0.4, 0.05); }
    for (const [x, z, c] of [[0.45, 0.55, 0x8fbf6a], [0.68, 0.55, C.lav], [0.45, 0.76, 0x6fa35a], [0.68, 0.76, 0xd8c060]] as [number, number, number][]) {
      p.box(0.18, 0.03, 0.16, x, 0, z, dark(C.dirt, 0.7));
      for (const d of [-0.05, 0.05]) p.sphere(0.035, x + d, 0.04, z + d * 0.6, c, 0, 0.7);
    }
    log(p, 0.36, 0.035, 0.05, 0, 0.4, 0.4);
  } else if (age === 1) {
    // sanctuaire d'Asclépios : temple à colonnes, portique, bassin de l'eau sacrée, cyprès et jardin des simples
    p.box(1.76, 0.05, 1.16, 0, 0, -0.36, C.stone); p.box(1.66, 0.05, 1.06, 0, 0.05, -0.36, 0xe6dccb);
    if (attach(['a_temple'], 0, 1.0, -0.4, -0.42, 0, toMarble, 1, /mat25/)) tileRoof(p, 0.46, C.terracotta);
    else {
      p.box(0.66, 0.4, 0.5, -0.38, 0.1, -0.56, C.white);
      for (let i = 0; i < 4; i++) p.cyl(0.035, 0.04, 0.4, 7, -0.62 + i * 0.16, 0.1, -0.2, C.white);
      p.box(0.74, 0.05, 0.84, -0.38, 0.5, -0.42, C.white);
      p.gable(0.86, 0.18, 0.76, -0.38, 0.55, -0.42, C.terracotta, Math.PI / 2);
      p.box(0.12, 0.2, 0.02, -0.38, 0.1, -0.305, C.door);
    }
    // portique couvert
    p.box(0.62, 0.32, 0.08, 0.48, 0.1, -0.82, 0xe6dccb);
    for (let i = 0; i < 4; i++) p.cyl(0.03, 0.034, 0.32, 7, 0.22 + i * 0.17, 0.1, -0.5, C.white);
    p.add(new THREE.BoxGeometry(0.7, 0.025, 0.42), 0.48, 0.44, -0.66, C.terracotta, 0, false, 0, -0.12);
    for (let i = 0; i <= 14; i++) p.add(new THREE.BoxGeometry(0.011, 0.011, 0.42), 0.15 + i * 0.0471, 0.459, -0.66, dark(C.terracotta, 0.84), 0, false, 0, -0.12);
    p.box(0.7, 0.016, 0.026, 0.48, 0.452 + 0.21 * Math.sin(0.12), -0.66 + 0.21, dark(C.terracotta, 0.74));
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
    stones(p, -0.18, -0.325, 1.36, 0.03, 0.33, 0, C.stone, 0.55, 11);
    stones(p, -0.86, -0.6, 0.55, 0.03, 0.33, -Math.PI / 2, C.stone, 0.55, 12);
    quoins(p, -0.86, -0.325, 0.03, 0.33, -1, 1);
    // étage en encorbellement : pans de bois, une travée sur deux en croix, l'autre percée d'une fenêtre
    p.box(1.4, 0.26, 0.59, -0.18, 0.33, -0.6, C.cream);
    p.box(1.42, 0.02, 0.61, -0.18, 0.325, -0.6, C.darkwood);
    timbers(p, -0.18, -0.302, 1.4, 0.345, 0.59, 0, 8, (i) => i % 2 === 1);
    timbers(p, -0.882, -0.6, 0.59, 0.345, 0.59, -Math.PI / 2, 3, (i) => i !== 1);
    roof(p, -0.18, 0.59, -0.6, { w: 1.4, d: 0.59, h: 0.4, color: 0x8a5a44, wall: C.cream, courses: true });
    for (const x of [-0.56, 0.18]) {
      p.box(0.13, 0.18, 0.17, x, 0.62, -0.415, C.cream);
      roof(p, x, 0.8, -0.415, { w: 0.17, d: 0.13, h: 0.07, color: 0x8a5a44, wall: C.cream, ry: Math.PI / 2, len: 0.21, ov: 0.025 });
      windows(p, [x], 0.69, -0.325, 0.06, 0.07, C.darkwood);
    }
    p.box(0.09, 0.32, 0.09, -0.66, 0.78, -0.74, C.stone); p.box(0.11, 0.025, 0.11, -0.66, 1.1, -0.74, C.darkstone);
    smoke(-0.66, 1.16, -0.74, 0);
    p.box(0.14, 0.22, 0.02, -0.18, 0.03, -0.32, C.door);
    p.box(0.18, 0.025, 0.04, -0.18, 0.25, -0.31, C.darkwood);
    windows(p, [-0.72, -0.46, 0.1, 0.34], 0.12, -0.32, 0.07, 0.1); windows(p, [-0.7925, -0.4425, -0.0925, 0.2575], 0.39, -0.29, 0.06, 0.09, C.darkwood);
    // chapelle à contreforts et clocher de pierre
    p.box(0.36, 0.48, 0.66, 0.7, 0.03, -0.58, C.stone);
    stones(p, 0.88, -0.58, 0.66, 0.03, 0.51, Math.PI / 2, C.stone, 0.5, 13);
    for (const z of [-0.8, -0.5]) { p.box(0.05, 0.32, 0.06, 0.905, 0.03, z, C.darkstone); p.add(new THREE.BoxGeometry(0.05, 0.02, 0.085), 0.9, 0.36, z, C.darkstone, 0, false, 0.6); }
    roof(p, 0.7, 0.51, -0.58, { w: 0.66, d: 0.36, h: 0.26, color: C.slate, wall: C.stone, ry: Math.PI / 2, courses: true });
    p.box(0.18, 0.86, 0.18, 0.7, 0.03, -0.18, C.stone); p.pyramid(0.24, 0.34, 0.24, 0.7, 0.89, -0.18, C.slate);
    stones(p, 0.7, -0.09, 0.18, 0.03, 0.89, 0, C.stone, 0.5, 14);
    stones(p, 0.79, -0.18, 0.18, 0.03, 0.89, Math.PI / 2, C.stone, 0.5, 15);
    for (const x of [0.61, 0.79]) quoins(p, x, -0.09, 0.03, 0.89, x > 0.7 ? 1 : -1, 1);
    p.box(0.21, 0.025, 0.21, 0.7, 0.56, -0.18, C.darkstone);
    p.box(0.012, 0.09, 0.012, 0.7, 1.22, -0.18, C.gold); p.box(0.05, 0.012, 0.012, 0.7, 1.27, -0.18, C.gold);
    p.box(0.08, 0.1, 0.02, 0.7, 0.66, -0.085, 0x3c3530); p.sphere(0.03, 0.7, 0.66, -0.12, C.gold, 0, 1.2);
    p.box(0.08, 0.16, 0.02, 0.7, 0.2, -0.085, C.win, 0, true);
    p.box(0.1, 0.18, 0.012, 0.7, 0.19, -0.094, 0xece4d4); p.gable(0.014, 0.05, 0.1, 0.7, 0.37, -0.092, 0xece4d4, Math.PI / 2);
    p.box(0.008, 0.16, 0.006, 0.7, 0.2, -0.073, C.darkwood);
    // jardin clos : haies de buis, carrés de simples bordés de planches, allées de gravier, puits au milieu
    for (const [x, z, w, d] of [[-0.48, 0.86, 0.8, 0.05], [0.48, 0.86, 0.8, 0.05], [-0.86, 0.32, 0.05, 1.04], [0.86, 0.32, 0.05, 1.04]]) hedge(p, x, z, w, d, 0.08);
    p.box(0.08, 0.006, 1.0, 0, 0.03, 0.34, 0xe9dfca); p.box(1.6, 0.006, 0.08, 0, 0.03, 0.34, 0xe9dfca);
    for (const [x, z, c] of [[-0.5, 0.12, 0x8fbf6a], [0.5, 0.12, C.lav], [-0.5, 0.56, 0xd8c060], [0.5, 0.56, 0x6fa35a]] as [number, number, number][]) {
      p.box(0.42, 0.045, 0.3, x, 0.03, z, C.wood);
      p.box(0.39, 0.046, 0.27, x, 0.03, z, dark(C.dirt, 0.72));
      for (const dz of [-0.07, 0.07]) for (const d of [-0.14, -0.047, 0.047, 0.14]) p.sphere(0.034, x + d, 0.085, z + dz, dark(c, 0.92 + hash2(d * 100, dz * 100, 61) * 0.16), 0, 0.75);
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
    roof(p, 0, 0.65, -0.66, { w: 0.92, d: 0.44, h: 0.22, color: C.slate, wall: C.brick, courses: true });
    stones(p, 0, -0.439, 0.92, 0.03, 0.65, 0, dark(C.brick, 0.86), 0.45, 350);
    for (const x of [-0.46, 0.46]) quoins(p, x, -0.44, 0.03, 0.65, x < 0 ? -1 : 1, 1);
    for (const x of [-0.3, 0.3]) { p.box(0.07, 0.22, 0.07, x, 0.75, -0.78, 0xa85e50); p.box(0.085, 0.025, 0.085, x, 0.97, -0.78, C.cream); smoke(x, 1.0, -0.78, 0); }
    // mât au drapeau à croix rouge, bancs et massifs de fleurs dans la cour, réverbères au portail
    p.cyl(0.008, 0.01, 0.7, 5, -0.24, 0.03, -0.36, C.metal); p.box(0.006, 0.1, 0.15, -0.24, 0.6, -0.285, C.white); p.box(0.008, 0.025, 0.06, -0.24, 0.64, -0.285, 0xd84a3e); p.box(0.008, 0.07, 0.02, -0.24, 0.617, -0.285, 0xd84a3e);
    for (const x of [-0.24, 0.24]) { p.box(0.16, 0.02, 0.05, x, 0.07, 0.1, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.045, 0.04, x + d, 0.025, 0.1, 0x3c4a44); }
    for (let i = 0; i < 14; i++) p.sphere(0.022, -0.46 + (i % 7) * 0.15, 0.05, i < 7 ? -0.3 : 0.15, [C.pink, C.butter, C.lav, 0xd84a3e][i % 4], 0, 0.8);
    for (const s of [-1, 1]) { p.cyl(0.007, 0.009, 0.3, 5, s * 0.26, 0.025, 0.86, 0x3c4a44); p.box(0.04, 0.045, 0.04, s * 0.26, 0.32, 0.86, 0xffe2a0, 0, true); }
    p.box(0.34, 0.78, 0.1, 0, 0.03, -0.41, C.cream); p.gable(0.36, 0.16, 0.12, 0, 0.81, -0.41, C.slate);
    p.cyl(0.055, 0.055, 0.012, 12, 0, 0.66, -0.355, C.white); p.box(0.005, 0.04, 0.004, 0, 0.675, -0.348, C.darkwood); p.box(0.03, 0.005, 0.004, 0.012, 0.66, -0.348, C.darkwood);
    p.box(0.14, 0.24, 0.02, 0, 0.03, -0.355, C.door); redCross(p, 0, 0.52, -0.352, 0.85);
    for (const s of [-1, 1]) {
      p.box(0.36, 0.52, 0.88, s * 0.72, 0.03, -0.3, C.brick); p.box(0.38, 0.035, 0.9, s * 0.72, 0.29, -0.3, C.cream);
      roof(p, s * 0.72, 0.55, -0.3, { w: 0.88, d: 0.36, h: 0.2, color: C.slate, wall: C.brick, ry: Math.PI / 2, courses: true });
      stones(p, s * 0.54, -0.3, 0.88, 0.03, 0.55, -s * Math.PI / 2, dark(C.brick, 0.86), 0.45, 352 + s);
      stones(p, s * 0.72, 0.14, 0.36, 0.03, 0.55, 0, dark(C.brick, 0.86), 0.45, 354 + s);
      quoins(p, s * 0.54, 0.14, 0.03, 0.55, -s, 1); quoins(p, s * 0.9, 0.14, 0.03, 0.55, s, 1);
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
    // meneaux des bandeaux vitrés, fenêtres des côtés et de la tour
    for (let x = -0.86; x <= 0.46; x += 0.11) for (const y of [0.14, 0.36, 0.58]) p.box(0.012, 0.12, 0.024, x, y, -0.133, 0xd8dde2);
    for (const y of [0.14, 0.36, 0.58]) p.box(0.02, 0.12, 0.6, -0.905, y, -0.5, 0x9fd0e4, 0, true);
    for (let y = 0.14; y < 1.1; y += 0.16) p.box(0.02, 0.09, 0.4, 0.895, y, -0.55, 0x9fd0e4, 0, true);
    // toit : groupes de ventilation, cage d'escalier, balises de l'héliport, manche à air
    for (const [x, z] of [[0.05, -0.7], [0.22, -0.7], [0.05, -0.36]]) { p.box(0.12, 0.07, 0.1, x, 0.87, z, 0xb8bcc2); p.cyl(0.03, 0.03, 0.012, 8, x, 0.94, z, 0x5d6878); }
    p.box(0.16, 0.12, 0.14, 0.28, 0.87, -0.4, 0xe4e2dc);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.025, 0.012, 0.025, -0.45 + Math.cos(a) * 0.28, 0.885, -0.5 + Math.sin(a) * 0.28, i % 2 ? 0x8aff8a : 0xffe2a0, 0, true); }
    p.cyl(0.005, 0.005, 0.18, 4, -0.82, 0.87, -0.8, 0x9aa3ad);
    p.add(new THREE.ConeGeometry(0.025, 0.1, 6).rotateZ(Math.PI / 2), -0.77, 1.03, -0.8, 0xf28a3c);
    // enseigne des urgences au-dessus de l'auvent, bandeau rouge, bornes, mâts et drapeaux, banc
    p.box(0.46, 0.06, 0.02, 0.1, 0.32, 0.17, 0xd84a3e); p.box(0.38, 0.03, 0.006, 0.1, 0.335, 0.181, 0xfff4e0, 0, true);
    p.box(0.562, 0.02, 0.342, 0.1, 0.3, 0.0, 0xd84a3e);
    for (const x of [-0.24, -0.34, 0.5, 0.6]) p.cyl(0.012, 0.012, 0.06, 6, x, 0.03, 0.22, 0x5d6878);
    for (const [x, c] of [[-0.6, 0x3c7fd8], [-0.5, C.white], [-0.4, 0xd84a3e]] as [number, number][]) { p.cyl(0.005, 0.005, 0.5, 4, x, 0.03, 0.12, 0xd8dde2); p.box(0.07, 0.045, 0.004, x + 0.035, 0.47, 0.12, c); }
    p.box(0.16, 0.02, 0.05, 0.62, 0.07, 0.05, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.04, 0.04, 0.62 + d, 0.03, 0.05, 0x5d6878);
    // haie du parking, passage piéton, voitures des visiteurs
    hedge(p, -0.15, 0.86, 1.5, 0.06, 0.06);
    for (let k = 0; k < 5; k++) p.box(0.04, 0.004, 0.14, 0.24 + k * 0.07, 0.036, 0.22, C.white);
    for (const [x, c] of [[0.27, 0x3c7fd8], [0.53, 0xe8c66a]] as [number, number][]) { p.box(0.14, 0.06, 0.22, x, 0.045, 0.58, c); p.box(0.12, 0.05, 0.12, x, 0.105, 0.56, 0xcfe2f0); }
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
    // académie : portiques en U autour d'une cour dallée, colonnes à chapiteaux et toits de tuiles, oliviers, statue,
    // bancs, cadran solaire
    p.box(1.84, 0.05, 1.84, 0, 0, 0, C.stone); p.box(1.74, 0.02, 1.74, 0, 0.05, 0, 0xe6dccb);
    for (let i = 0; i < 5; i++) for (let k = 0; k < 6; k++) if ((i + k) % 2) p.box(0.17, 0.004, 0.17, -0.36 + i * 0.18, 0.07, -0.36 + k * 0.2, 0xd7cab2);
    // portique du fond : mur, colonnade, architrave, toit de tuiles
    p.box(1.6, 0.36, 0.08, 0, 0.07, -0.8, 0xe6dccb);
    for (let i = 0; i < 7; i++) column(p, -0.66 + i * 0.22, -0.5, 0.34, 0.07);
    p.box(1.42, 0.035, 0.07, 0, 0.405, -0.5, 0xeee4d0);
    tiledShed(p, 0, 0.45, -0.66, 1.72, 0.42, 0.12);
    for (const s of [-1, 1]) {
      // portiques des côtés
      p.box(0.08, 0.36, 1.0, s * 0.8, 0.07, -0.2, 0xe6dccb);
      for (let i = 0; i < 4; i++) column(p, s * 0.5, -0.2 + i * 0.2, 0.34, 0.07);
      p.box(0.07, 0.035, 0.7, s * 0.5, 0.405, 0.1, 0xeee4d0);
      tiledShed(p, s * 0.66, 0.45, 0.06, 0.42, 1.04, -s * 0.12, true);
    }
    // cour : oliviers, statue sur son socle, bancs tournés vers elle, cadran solaire
    const olive = (c: THREE.Color) => { if (c.g > c.r * 1.15) c.setRGB(0.5, 0.58, 0.38); };
    for (const x of [-0.26, 0.26]) if (!attach(['tree_round'], 0, 0.3, x, -0.18, x * 4, olive)) { p.cyl(0.03, 0.045, 0.24, 5, x, 0.07, -0.18, C.darkwood); p.sphere(0.15, x, 0.38, -0.18, 0x9ab07a, 0, 0.75); }
    if (!attach(['a_statue'], 0, 0.2, 0, 0.42, Math.PI)) { p.box(0.12, 0.12, 0.12, 0, 0.07, 0.42, C.stone); p.cyl(0.035, 0.045, 0.2, 6, 0, 0.19, 0.42, C.white); p.sphere(0.04, 0, 0.43, 0.42, C.white); }
    // bancs de marbre : siège sur deux pieds
    for (const [x, z, r] of [[-0.3, 0.42, Math.PI / 2], [0.3, 0.42, Math.PI / 2], [0, 0.18, 0]] as number[][]) {
      for (const d of [-0.09, 0.09]) p.box(0.04, 0.05, 0.08, x + Math.cos(r) * d, 0.07, z - Math.sin(r) * d, C.stone, r);
      p.box(0.26, 0.022, 0.09, x, 0.12, z, 0xf2ead8, r);
    }
    p.cyl(0.06, 0.07, 0.1, 6, 0.42, 0.07, 0.68, C.stone); p.cyl(0.08, 0.08, 0.01, 8, 0.42, 0.17, 0.68, C.white); p.add(new THREE.ConeGeometry(0.02, 0.07, 3), 0.42, 0.2, 0.68, C.gold);
  } else if (age === 2) {
    // école du monastère : grande salle de pierre, haut clocher, galerie de cloître, jardin de buis et puits
    p.box(1.84, 0.03, 1.84, 0, 0, 0, 0xd9cdb8);
    p.box(1.24, 0.4, 0.52, -0.22, 0.03, -0.62, C.cream);
    stones(p, -0.22, -0.36, 1.24, 0.03, 0.43, 0, C.cream, 0.18, 21);
    for (const x of [-0.84, 0.4]) { p.box(0.05, 0.4, 0.54, x, 0.03, -0.62, C.stone); quoins(p, x + (x < 0 ? -0.025 : 0.025), -0.35, 0.03, 0.43, x < 0 ? -1 : 1, 1); }
    stones(p, -0.865, -0.62, 0.54, 0.03, 0.43, -Math.PI / 2, C.stone, 0.6, 22);
    roof(p, -0.22, 0.43, -0.62, { w: 1.24, d: 0.52, h: 0.42, color: 0x6b7f8f, wall: C.cream, courses: true });
    // fenêtres hautes à arc brisé au-dessus de la galerie, contreforts entre elles
    windows(p, [-0.62, -0.38, -0.06, 0.18], 0.2, -0.355, 0.06, 0.13);
    for (const x of [-0.62, -0.38, -0.06, 0.18]) p.gable(0.014, 0.045, 0.082, x, 0.341, -0.36, 0xece4d4, Math.PI / 2);
    for (const x of [-0.74, -0.5, -0.22, 0.06, 0.3]) p.box(0.04, 0.28, 0.045, x, 0.03, -0.338, C.stone);
    // clocher : pierres appareillées, chaînes d'angle, cordons, abat-sons, croix
    p.box(0.26, 1.1, 0.26, 0.66, 0.03, -0.66, C.stone);
    stones(p, 0.66, -0.53, 0.26, 0.03, 1.13, 0, C.stone, 0.5, 23);
    stones(p, 0.79, -0.66, 0.26, 0.03, 1.13, Math.PI / 2, C.stone, 0.5, 24);
    for (const x of [0.53, 0.79]) quoins(p, x, -0.53, 0.03, 1.13, x > 0.66 ? 1 : -1, 1);
    for (const y of [0.45, 0.76]) p.box(0.29, 0.025, 0.29, 0.66, y, -0.66, C.darkstone);
    for (const [dx, dz, w, d] of [[0, 0.135, 0.1, 0.02], [0.135, 0, 0.02, 0.1]]) {
      p.box(w, 0.14, d, 0.66 + dx, 0.82, -0.66 + dz, 0x3c3530);
      for (const y of [0.85, 0.89, 0.93]) p.box(w * 0.9 + 0.004, 0.008, d * 0.9 + 0.004, 0.66 + dx * 1.04, y, -0.66 + dz * 1.04, C.darkwood);
    }
    p.pyramid(0.34, 0.42, 0.34, 0.66, 1.13, -0.66, 0x6b7f8f); p.sphere(0.035, 0.66, 0.86, -0.58, C.gold, 0, 1.2);
    p.box(0.012, 0.1, 0.012, 0.66, 1.53, -0.66, C.gold); p.box(0.055, 0.012, 0.012, 0.66, 1.59, -0.66, C.gold);
    p.box(0.1, 0.18, 0.02, 0.66, 0.03, -0.525, C.door); p.gable(0.016, 0.05, 0.12, 0.66, 0.21, -0.522, C.darkstone, Math.PI / 2);
    // galerie de cloître : colonnettes à chapiteau, arcades, cordon de pierre, appentis d'ardoises
    for (let i = 0; i < 6; i++) {
      const x = -0.8 + i * 0.22;
      p.box(0.05, 0.02, 0.05, x, 0.03, -0.2, C.darkstone);
      p.cyl(0.02, 0.023, 0.13, 6, x, 0.05, -0.2, C.stone);
      p.box(0.05, 0.02, 0.05, x, 0.17, -0.2, C.stone);
      if (i < 5) p.add(new THREE.TorusGeometry(0.11, 0.014, 4, 9, Math.PI), x + 0.11, 0.19, -0.2, C.stone);
    }
    p.box(1.2, 0.03, 0.05, -0.25, 0.29, -0.2, C.stone);
    p.add(new THREE.BoxGeometry(1.24, 0.025, 0.27), -0.25, 0.335, -0.27, 0x6b7f8f, 0, false, 0, 0.2);
    for (let j = 0; j < 6; j++) {
      const l = -0.11 + j * 0.044;
      p.add(new THREE.BoxGeometry(1.24, 0.007, 0.04).translate(0, 0.016, l), -0.25, 0.335, -0.27, dark(0x6b7f8f, j % 2 ? 0.88 : 1.04), 0, false, 0, 0.2);
    }
    // jardin : quatre parterres bordés de buis, simples et fleurs, if taillé au milieu, allées de gravier, puits couvert
    p.box(0.08, 0.006, 0.76, -0.1, 0.03, 0.41, 0xe9dfca); p.box(1.0, 0.006, 0.08, -0.1, 0.03, 0.41, 0xe9dfca);
    for (const [x, z, fc] of [[-0.42, 0.2, C.lav], [0.22, 0.2, C.pink], [-0.42, 0.62, C.butter], [0.22, 0.62, C.lav]] as [number, number, number][]) {
      for (const [hx, hz, hw, hd] of [[x, z - 0.12, 0.4, 0.04], [x, z + 0.12, 0.4, 0.04], [x - 0.18, z, 0.04, 0.2], [x + 0.18, z, 0.04, 0.2]]) hedge(p, hx, hz, hw, hd, 0.05);
      p.box(0.32, 0.03, 0.2, x, 0.03, z, dark(C.dirt, 0.72));
      for (const dz of [-0.05, 0.05]) for (const d of [-0.11, -0.06, 0.06, 0.11]) p.sphere(0.026, x + d, 0.075, z + dz, Math.abs(d) > 0.08 ? fc : 0x8fbf6a, 0, 0.8);
      p.cone(0.035, 0.12, 6, x, 0.05, z, dark(C.darkgreen, 0.85));
    }
    p.cyl(0.08, 0.09, 0.1, 8, -0.1, 0.03, 0.41, C.stone); p.cyl(0.06, 0.06, 0.012, 8, -0.1, 0.122, 0.41, C.water);
    p.add(new THREE.TorusGeometry(0.075, 0.014, 4, 10).rotateX(Math.PI / 2), -0.1, 0.13, 0.41, C.darkstone);
    for (const x of [-0.17, -0.03]) p.box(0.02, 0.2, 0.02, x, 0.12, 0.41, C.wood);
    p.box(0.16, 0.012, 0.012, -0.1, 0.3, 0.41, C.wood);
    p.gable(0.2, 0.07, 0.18, -0.1, 0.31, 0.41, 0x6b7f8f);
    p.box(0.02, 0.13, 0.02, 0.66, 0.03, 0.3, C.darkwood); p.add(new THREE.BoxGeometry(0.1, 0.012, 0.08), 0.66, 0.17, 0.3, 0x9a3a32, 0, false, 0, -0.4);
    tree(p, 0.68, 0.7, 1.1);
  } else if (age === 3) {
    // école communale : bâtiment de brique à clocheton et horloge, préau, cour fermée, marelle, mât au drapeau, platanes
    p.box(1.86, 0.025, 1.86, 0, 0, 0, 0xddd3bf);
    p.box(1.3, 0.48, 0.5, -0.24, 0.025, -0.64, 0xc98a72); p.box(1.32, 0.03, 0.52, -0.24, 0.26, -0.64, C.cream);
    roof(p, -0.24, 0.505, -0.64, { w: 1.3, d: 0.5, h: 0.24, color: C.slate, wall: 0xc98a72, courses: true });
    // briques, chaînes d'angle et cordon de pierre, linteaux, cheminées qui fument
    stones(p, -0.24, -0.389, 1.3, 0.025, 0.505, 0, dark(0xc98a72, 0.86), 0.45, 340);
    stones(p, -0.89, -0.64, 0.5, 0.025, 0.505, -Math.PI / 2, dark(0xc98a72, 0.86), 0.45, 341);
    for (const x of [-0.89, 0.41]) quoins(p, x, -0.39, 0.025, 0.505, x < 0 ? -1 : 1, 1);
    for (const y of [0.08, 0.32]) for (const x of [-0.78, -0.62, -0.46, -0.02, 0.14, 0.3]) p.box(0.1, 0.018, 0.024, x, y + 0.135, -0.385, C.cream);
    for (const x of [-0.7, 0.22]) { p.box(0.07, 0.24, 0.07, x, 0.62, -0.72, 0xa85e50); p.box(0.085, 0.025, 0.085, x, 0.86, -0.72, C.cream); smoke(x, 0.9, -0.72, 0); }
    p.box(0.3, 0.6, 0.08, -0.24, 0.025, -0.37, 0xc98a72); p.gable(0.32, 0.14, 0.1, -0.24, 0.625, -0.37, C.slate);
    p.box(0.24, 0.05, 0.012, -0.24, 0.27, -0.325, C.cream); for (let k = 0; k < 5; k++) p.box(0.026, 0.028, 0.006, -0.31 + k * 0.035, 0.282, -0.318, 0x3c3530);
    p.cyl(0.055, 0.055, 0.012, 12, -0.24, 0.5, -0.325, C.white); p.box(0.005, 0.04, 0.004, -0.24, 0.515, -0.318, C.darkwood); p.box(0.03, 0.005, 0.004, -0.228, 0.5, -0.318, C.darkwood);
    p.box(0.12, 0.13, 0.12, -0.24, 0.72, -0.64, C.white); p.pyramid(0.16, 0.14, 0.16, -0.24, 0.85, -0.64, C.roofdark);
    p.box(0.12, 0.2, 0.02, -0.24, 0.025, -0.325, C.door);
    for (const y of [0.08, 0.32]) windows(p, [-0.78, -0.62, -0.46, -0.02, 0.14, 0.3], y, -0.385, 0.08, 0.12);
    // préau
    for (const [x, z] of [[0.5, -0.5], [0.86, -0.5], [0.5, 0.0], [0.86, 0.0]]) p.box(0.03, 0.3, 0.03, x, 0.025, z, C.darkwood);
    p.add(new THREE.BoxGeometry(0.48, 0.025, 0.66), 0.68, 0.34, -0.25, C.slate, 0, false, -0.1);
    for (let k = 0; k < 9; k++) p.add(new THREE.BoxGeometry(0.48, 0.007, 0.02).translate(0, 0.016, -0.3 + k * 0.075), 0.68, 0.34, -0.25, dark(C.slate, k % 2 ? 0.86 : 1.04), 0, false, -0.1);
    p.box(0.3, 0.05, 0.07, 0.68, 0.025, -0.25, C.wood);
    for (const z of [-0.45, -0.05]) { p.box(0.22, 0.02, 0.06, 0.68, 0.07, z, C.wood); for (const d of [-0.09, 0.09]) p.box(0.02, 0.05, 0.05, 0.68 + d, 0.025, z, 0x3c4a44); }
    for (const s of [-1, 1]) { p.cyl(0.007, 0.009, 0.3, 5, s * 0.16, 0.025, 0.86, 0x3c4a44); p.box(0.04, 0.045, 0.04, s * 0.16, 0.32, 0.86, 0xffe2a0, 0, true); }
    // cour : marelle, grille, mât, arbres
    for (let i = 0; i < 4; i++) p.box(0.07, 0.003, 0.07, -0.2, 0.027, 0.0 + i * 0.09, C.white);
    p.cyl(0.008, 0.008, 0.7, 5, -0.82, 0.025, 0.25, C.metal); p.box(0.14, 0.08, 0.005, -0.75, 0.62, 0.25, 0x4f7fc4); p.box(0.05, 0.08, 0.006, -0.77, 0.62, 0.25, C.white);
    for (let x = -0.9; x <= 0.9; x += 0.08) if (Math.abs(x - 0.0) > 0.12) p.box(0.012, 0.1, 0.012, x, 0.025, 0.9, C.white);
    for (const s of [-1, 1]) p.box(0.78, 0.012, 0.012, s * 0.51, 0.1, 0.9, C.white);
    for (const [x, z] of [[0.5, 0.5], [0.3, 0.75], [-0.6, 0.65]]) tree(p, x, z, 1.15, 0x8fbf72);
  } else {
    // université : grand portique à colonnes cannelées sur un perron, fronton sculpté et ses statues, bannières des
    // expositions, coupole de la bibliothèque sur un tambour à colonnade, ailes à pilastres et toits de cuivre, parvis avec
    // bassin à jets, allée bordée de sculptures, de bancs et de réverbères, pelouses, haies et massifs
    const stone = 0xf2eee6, trim = 0xe0dad0, copper = 0x6fa898, glassC = 0x9fd0e4;
    p.box(1.9, 0.04, 1.9, 0, 0, 0, 0xe9e2d4);
    // corps central : soubassement, murs, corniche, frise
    p.box(1.04, 0.06, 0.54, 0, 0.04, -0.62, trim);
    p.box(1.0, 0.5, 0.5, 0, 0.1, -0.62, stone);
    p.box(1.04, 0.035, 0.54, 0, 0.58, -0.62, trim);
    // perron et colonnade : bases, fûts cannelés, chapiteaux, architrave, frise à triglyphes, fronton sculpté
    for (let k = 0; k < 4; k++) p.box(0.9 - k * 0.04, 0.016, 0.1, 0, 0.04 + k * 0.016, -0.18 - k * 0.035, trim);
    for (let i = 0; i < 6; i++) {
      const x = -0.3 + i * 0.12;
      p.box(0.07, 0.02, 0.07, x, 0.1, -0.3, trim);
      p.cyl(0.03, 0.034, 0.42, 10, x, 0.12, -0.3, stone);
      for (let f = 0; f < 4; f++) p.box(0.006, 0.4, 0.004, x + Math.cos(f * 1.57 + 0.4) * 0.031, 0.13, -0.3 + Math.sin(f * 1.57 + 0.4) * 0.031, trim);
      p.box(0.075, 0.025, 0.075, x, 0.54, -0.3, trim);
    }
    p.box(0.8, 0.05, 0.16, 0, 0.565, -0.3, stone);
    for (let i = 0; i < 9; i++) p.box(0.022, 0.034, 0.006, -0.36 + i * 0.09, 0.573, -0.218, i % 2 ? trim : 0xd2cabe);
    p.gable(0.18, 0.16, 0.84, 0, 0.615, -0.3, trim, Math.PI / 2);
    p.gable(0.012, 0.11, 0.7, 0, 0.625, -0.205, 0xd8d0c4, Math.PI / 2);
    for (const [x, h] of [[-0.2, 0.04], [-0.1, 0.06], [0, 0.08], [0.1, 0.06], [0.2, 0.04]] as [number, number][]) p.box(0.04, h, 0.012, x, 0.63, -0.2, 0xc8c0b4);
    for (const sx of [-1, 1]) { p.box(0.04, 0.012, 0.04, sx * 0.41, 0.615, -0.3, trim); p.box(0.025, 0.07, 0.025, sx * 0.41, 0.627, -0.3, 0xb8b4ac); p.sphere(0.014, sx * 0.41, 0.705, -0.3, 0xb8b4ac); }
    p.box(0.03, 0.03, 0.03, 0, 0.775, -0.3, trim); p.box(0.02, 0.07, 0.02, 0, 0.805, -0.3, 0xb8b4ac);
    // portes et fenêtres derrière la colonnade, bannières des expositions
    p.box(0.14, 0.24, 0.02, 0, 0.1, -0.365, C.door); p.gable(0.02, 0.04, 0.16, 0, 0.34, -0.365, trim, Math.PI / 2);
    for (const x of [-0.3, -0.18, 0.18, 0.3]) { p.box(0.07, 0.16, 0.012, x, 0.16, -0.367, glassC, 0, true); p.box(0.08, 0.012, 0.016, x, 0.33, -0.367, trim); }
    for (const [x, c] of [[-0.24, 0xc8382e], [0.24, 0x3c5aa8], [-0.12, 0xe8a83c], [0.12, 0x4f8a5a]] as [number, number][]) {
      p.box(0.06, 0.24, 0.006, x, 0.26, -0.25, c); p.box(0.04, 0.03, 0.007, x, 0.4, -0.25, C.white); p.box(0.05, 0.004, 0.007, x, 0.31, -0.25, C.white);
      p.box(0.07, 0.008, 0.008, x, 0.5, -0.25, 0x8a8f96);
    }
    p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14).rotateX(Math.PI / 2), 0, 0.68, -0.205, C.white);
    p.box(0.004, 0.03, 0.004, 0, 0.685, -0.198, 0x2a2a2a); p.box(0.022, 0.004, 0.004, 0.008, 0.68, -0.198, 0x2a2a2a);
    // coupole : tambour à colonnade, dôme de cuivre à côtes, lanternon et sa flèche dorée
    p.cyl(0.24, 0.24, 0.05, 16, 0, 0.615, -0.66, trim);
    p.cyl(0.2, 0.2, 0.16, 16, 0, 0.665, -0.66, stone);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.cyl(0.014, 0.014, 0.15, 6, Math.cos(a) * 0.225, 0.665, -0.66 + Math.sin(a) * 0.225, stone); }
    for (let i = 0; i < 12; i++) { const a = ((i + 0.5) / 12) * Math.PI * 2; p.box(0.03, 0.08, 0.012, Math.cos(a) * 0.202, 0.69, -0.66 + Math.sin(a) * 0.202, glassC, -a + Math.PI / 2, true); }
    p.cyl(0.245, 0.245, 0.03, 16, 0, 0.815, -0.66, trim);
    p.sphere(0.215, 0, 0.84, -0.66, copper, 1, 0.75);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.add(new THREE.TorusGeometry(0.217, 0.006, 3, 10, Math.PI / 2).rotateZ(Math.PI / 2).rotateY(a), 0, 0.84, -0.66, 0xe4e2dc); }
    p.cyl(0.045, 0.045, 0.07, 8, 0, 1.0, -0.66, stone); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.box(0.01, 0.05, 0.004, Math.cos(a) * 0.046, 1.01, -0.66 + Math.sin(a) * 0.046, glassC, -a + Math.PI / 2, true); }
    p.sphere(0.05, 0, 1.07, -0.66, copper, 1, 0.7); p.cone(0.02, 0.1, 5, 0, 1.1, -0.66, C.gold);
    // ailes : soubassement, pilastres, fenêtres encadrées sur deux niveaux, corniche, toit de cuivre en croupe, verrière
    for (const sx of [-1, 1]) {
      const x0 = sx * 0.72;
      p.box(0.4, 0.05, 0.78, x0, 0.04, -0.48, trim);
      p.box(0.38, 0.42, 0.76, x0, 0.09, -0.48, 0xf0ece4);
      p.box(0.4, 0.03, 0.78, x0, 0.5, -0.48, trim);
      p.pyramid(0.4, 0.12, 0.78, x0, 0.53, -0.48, copper, 0);
      p.box(0.16, 0.012, 0.4, x0, 0.6, -0.48, glassC, 0, true);
      for (const x of [x0 - 0.17, x0 - 0.06, x0 + 0.06, x0 + 0.17]) p.box(0.022, 0.4, 0.014, x, 0.09, -0.095, trim);
      for (const y of [0.13, 0.31]) for (const x of [x0 - 0.115, x0, x0 + 0.115]) {
        p.box(0.07, 0.11, 0.012, x, y, -0.097, glassC, 0, true);
        p.box(0.085, 0.014, 0.018, x, y + 0.11, -0.097, trim); p.box(0.08, 0.01, 0.022, x, y - 0.01, -0.097, trim);
      }
      for (const y of [0.13, 0.31]) for (const z of [-0.75, -0.6, -0.45, -0.3, -0.18]) p.box(0.012, 0.11, 0.07, sx * 0.906, y, z, glassC, 0, true);
      for (let k = 0; k < 9; k++) p.box(0.014, 0.04, 0.014, x0 - 0.17 + k * 0.0425, 0.53, -0.1, C.white);
      p.box(0.38, 0.012, 0.02, x0, 0.57, -0.1, C.white);
      p.box(0.1, 0.2, 0.014, x0, 0.09, -0.098, C.door); p.gable(0.016, 0.04, 0.12, x0, 0.29, -0.098, trim, Math.PI / 2);
    }
    // parvis : pelouses, allée dallée, bassin à jets, sculptures sur socles, bancs, réverbères, haies, massifs, drapeaux, vélos
    for (const sx of [-1, 1]) p.box(0.58, 0.012, 0.74, sx * 0.4, 0.04, 0.5, C.green);
    p.box(0.22, 0.014, 0.8, 0, 0.043, 0.48, 0xd8d0c0);
    for (let k = 0; k < 8; k++) p.box(0.22, 0.003, 0.006, 0, 0.057, 0.12 + k * 0.1, 0xc8c0b0);
    p.cyl(0.13, 0.14, 0.05, 12, 0, 0.04, 0.5, trim); p.cyl(0.115, 0.115, 0.006, 12, 0, 0.085, 0.5, 0x6fb8d0);
    p.cyl(0.02, 0.03, 0.1, 8, 0, 0.08, 0.5, trim); p.cyl(0.005, 0.008, 0.08, 5, 0, 0.18, 0.5, 0xcdeef7); p.sphere(0.018, 0, 0.27, 0.5, 0xe4f6ff, 1);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.add(new THREE.CylinderGeometry(0.003, 0.006, 0.09, 4).translate(0, 0.045, 0).rotateZ(0.6).rotateY(-a), Math.cos(a) * 0.11, 0.09, 0.5 + Math.sin(a) * 0.11, 0xcdeef7); }
    for (const [x, z, kind] of [[-0.16, 0.22, 0], [0.16, 0.22, 1], [-0.16, 0.8, 1], [0.16, 0.8, 0]] as [number, number, number][]) {
      p.box(0.06, 0.08, 0.06, x, 0.04, z, trim);
      if (kind) { p.sphere(0.03, x, 0.15, z, 0xb8b4ac, 1, 1.2); p.box(0.02, 0.03, 0.02, x, 0.12, z, 0xb8b4ac); }
      else { p.add(new THREE.TorusKnotGeometry(0.022, 0.007, 24, 4), x, 0.16, z, 0x9aa3ad); }
    }
    for (const z of [0.35, 0.65]) for (const sx of [-1, 1]) { p.box(0.05, 0.014, 0.12, sx * 0.15, 0.06, z, C.wood); for (const d of [-0.04, 0.04]) p.box(0.04, 0.02, 0.012, sx * 0.15, 0.044, z + d, 0x5d6878); }
    for (const z of [0.15, 0.5, 0.85]) for (const sx of [-1, 1]) { p.cyl(0.006, 0.008, 0.24, 5, sx * 0.125, 0.04, z, 0x3c4a44); p.box(0.03, 0.035, 0.03, sx * 0.125, 0.28, z, 0xffe2a0, 0, true); }
    for (const sx of [-1, 1]) {
      hedge(p, sx * 0.62, 0.86, 0.6, 0.05, 0.06, 0.04); hedge(p, sx * 0.9, 0.5, 0.05, 0.7, 0.06, 0.04);
      for (let k = 0; k < 6; k++) p.sphere(0.028, sx * 0.3, 0.06, 0.18 + k * 0.12, [C.pink, C.butter, 0xd84a3e, C.lav, C.white, 0xe8a83c][k], 0, 0.8);
      for (const [x, z] of [[0.5, 0.32], [0.5, 0.68], [0.75, 0.5]]) tree(p, sx * x, z, x > 0.6 ? 0.9 : 1.05);
    }
    for (const [x, c] of [[-0.06, 0x3c4a8a], [0.06, 0xd8a83c]] as [number, number][]) { p.cyl(0.005, 0.005, 0.55, 4, x, 0.04, 0.9, 0xd8dde2); p.box(0.07, 0.045, 0.004, x + 0.035, 0.53, 0.9, c); }
    for (let k = 0; k < 4; k++) { const x = 0.62 + k * 0.07; for (const d of [-0.03, 0.03]) p.add(new THREE.TorusGeometry(0.025, 0.005, 4, 10).rotateY(Math.PI / 2), x, 0.07, 0.06 + d, 0x3c3c40); p.box(0.005, 0.005, 0.06, x, 0.08, 0.06, [0xd8553c, 0x3c7fd8, 0x4fa860, 0xe8c66a][k]); }
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
    // poste des vigiles : tour de guet de pierre au toit de tuiles, caserne tuilée, grande citerne, amphores d'eau,
    // râtelier de seaux, échelle, tonneaux
    p.box(1.84, 0.025, 1.84, 0, 0, 0, 0xddd0b8);
    for (let i = 0; i < 9; i++) p.box(0.2, 0.004, 0.2, -0.7 + (i % 3) * 0.24, 0.025, 0.1 + Math.floor(i / 3) * 0.24, (i % 2) ? 0xd0c2a6 : 0xcabd9f);
    if (!attach(['a_tower'], 0, 0.66, -0.5, -0.46, Math.PI)) {
      p.cyl(0.24, 0.27, 0.92, 9, -0.5, 0.025, -0.46, C.stone);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; p.box(0.08, 0.08, 0.06, -0.5 + Math.cos(a) * 0.24, 0.94, -0.46 + Math.sin(a) * 0.24, C.stone, -a); }
      p.cone(0.3, 0.26, 9, -0.5, 1.0, -0.46, C.terracotta);
    }
    // échelle appuyée à la tour
    for (const x of [-0.07, 0.07]) p.box(0.016, 0.62, 0.016, -0.18 + x, 0.025, -0.2, C.wood, 0, false, 0);
    for (let k = 0; k < 7; k++) p.box(0.15, 0.012, 0.012, -0.18, 0.08 + k * 0.08, -0.2, C.wood);
    // caserne
    p.box(0.74, 0.32, 0.4, 0.42, 0.025, -0.58, C.cream);
    p.box(0.76, 0.04, 0.42, 0.42, 0.025, -0.58, 0xd9cdb8);
    roof(p, 0.42, 0.345, -0.58, { w: 0.74, d: 0.4, h: 0.2, color: C.terracotta, wall: C.cream, tiles: true });
    p.box(0.1, 0.17, 0.02, 0.42, 0.025, -0.375, C.door); windows(p, [0.2, 0.64], 0.15, -0.375, 0.07, 0.08);
    // citerne : margelle épaisse, eau, bec de bronze
    p.cyl(0.3, 0.32, 0.16, 14, 0.4, 0.025, 0.32, C.stone);
    p.add(new THREE.TorusGeometry(0.29, 0.03, 4, 18).rotateX(Math.PI / 2), 0.4, 0.19, 0.32, 0xe6dccb);
    p.cyl(0.27, 0.27, 0.012, 14, 0.4, 0.184, 0.32, C.water);
    p.box(0.04, 0.04, 0.12, 0.4, 0.14, 0.66, 0xb08a4a);
    // amphores d'eau
    for (const [x, z, r] of [[-0.72, 0.22, 0], [-0.6, 0.34, 1], [-0.76, 0.44, 2], [-0.62, 0.56, 3]] as number[][])
      if (!attach(['a_amphora'], 0, 0.08, x, z, r)) { p.cyl(0.055, 0.035, 0.16, 8, x, 0.025, z, C.terracotta); p.cyl(0.03, 0.03, 0.005, 8, x, 0.185, z, C.water); }
    // râtelier de seaux
    p.box(0.42, 0.02, 0.03, -0.12, 0.28, 0.7, C.wood); for (const x of [-0.32, 0.08]) p.box(0.02, 0.28, 0.02, x, 0.025, 0.7, C.wood);
    for (let i = 0; i < 4; i++) if (!attach(['p_bucket'], 0, 0.07, -0.26 + i * 0.09, 0.71)) p.cyl(0.028, 0.022, 0.06, 6, -0.26 + i * 0.09, 0.2, 0.72, 0x9a6a44);
    for (const [x, z] of [[0.86, -0.2], [0.78, -0.12]]) attach(['f_barrel'], 0, 0.1, x, z);
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
    roof(p, -0.22, 0.62, -0.52, { w: 1.3, d: 0.64, h: 0.2, color: C.slate, wall: C.brick, courses: true });
    stones(p, -0.22, -0.199, 1.3, 0.025, 0.585, 0, dark(C.brick, 0.86), 0.45, 360);
    stones(p, -0.87, -0.52, 0.64, 0.025, 0.585, -Math.PI / 2, dark(C.brick, 0.86), 0.45, 361);
    for (const x of [-0.87, 0.43]) quoins(p, x, -0.2, 0.025, 0.585, x < 0 ? -1 : 1, 1);
    p.box(0.07, 0.2, 0.07, -0.66, 0.7, -0.66, 0xa85e50); p.box(0.085, 0.025, 0.085, -0.66, 0.9, -0.66, C.cream); smoke(-0.66, 0.94, -0.66, 0);
    // enseigne « POMPIERS », lanterne rouge, seaux accrochés au mur, dévidoir de tuyau
    for (let k = 0; k < 8; k++) p.box(0.028, 0.03, 0.006, -0.36 + k * 0.04, 0.535, -0.183, 0xb8342c);
    p.box(0.012, 0.012, 0.05, 0.38, 0.4, -0.18, 0x3c3c40); p.box(0.04, 0.05, 0.04, 0.38, 0.34, -0.16, 0xff5a3a, 0, true);
    for (let k = 0; k < 4; k++) { p.cyl(0.018, 0.014, 0.035, 7, -0.86 + k * 0.05, 0.2, -0.18, 0xd84a3e); p.box(0.004, 0.01, 0.004, -0.86 + k * 0.05, 0.24, -0.185, 0x3c3c40); }
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10).rotateZ(Math.PI / 2), 0.62, 0.09, 0.05, 0xb8342c); p.add(new THREE.CylinderGeometry(0.062, 0.062, 0.02, 10).rotateZ(Math.PI / 2), 0.62, 0.09, 0.05, 0xd8d0c0);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 8).rotateZ(Math.PI / 2), 0.62 + s * 0.05, 0.05, 0.05, C.darkwood);
    for (const x of [-0.64, -0.22, 0.2]) {
      p.box(0.3, 0.32, 0.02, x, 0.025, -0.195, 0xb8342c); p.box(0.006, 0.32, 0.022, x, 0.025, -0.194, 0x7a2420);
      p.add(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), x, 0.345, -0.195, 0xb8342c);
      windows(p, [x], 0.44, -0.195, 0.14, 0.06);
    }
    p.box(0.6, 0.06, 0.012, -0.22, 0.52, -0.19, C.cream);
    p.box(0.28, 1.24, 0.28, 0.68, 0.025, -0.62, C.darkbrick); p.box(0.32, 0.05, 0.32, 0.68, 1.27, -0.62, C.cream); p.pyramid(0.32, 0.16, 0.32, 0.68, 1.32, -0.62, C.slate);
    // tour de séchage : briques, cordons, tuyaux pendus à sécher sur le côté
    stones(p, 0.68, -0.479, 0.28, 0.025, 1.27, 0, dark(C.darkbrick, 0.86), 0.45, 362);
    stones(p, 0.821, -0.62, 0.28, 0.025, 1.27, Math.PI / 2, dark(C.darkbrick, 0.86), 0.45, 363);
    for (const y of [0.45, 0.8]) p.box(0.3, 0.025, 0.3, 0.68, y, -0.62, C.cream);
    p.box(0.012, 0.012, 0.22, 0.83, 1.15, -0.62, 0x3c3c40);
    for (const z of [-0.69, -0.62, -0.55]) p.box(0.012, 0.5, 0.025, 0.835, 0.64, z, 0xe8e0d0);
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
    // tour d'entraînement : fenêtres sur les côtés, balcons à garde-corps, tuyaux qui sèchent, sirène et antenne
    for (let y = 0.25; y < 1.25; y += 0.24) {
      for (const sx of [-1, 1]) p.box(0.02, 0.1, 0.14, 0.72 + sx * 0.161, y, -0.62, 0x9fd0e4, 0, true);
      p.box(0.3, 0.012, 0.1, 0.72, y - 0.04, -0.405, 0x8a96a2);
      for (let k = 0; k < 5; k++) p.box(0.008, 0.06, 0.008, 0.6 + k * 0.06, y - 0.03, -0.36, 0x8a96a2);
      p.box(0.3, 0.008, 0.008, 0.72, y + 0.03, -0.36, 0x8a96a2);
    }
    for (let k = 0; k < 3; k++) p.box(0.02, 0.36, 0.02, 0.64 + k * 0.08, 0.96, -0.79, [0xf2f2f2, 0xd84a3e, 0xf2f2f2][k]);
    p.cyl(0.03, 0.035, 0.05, 8, 0.66, 1.37, -0.68, 0x9aa3ad); p.cone(0.04, 0.04, 8, 0.66, 1.42, -0.68, 0xd84a3e);
    p.cyl(0.005, 0.005, 0.3, 4, 0.8, 1.37, -0.56, 0x9aa3ad);
    // toit : mât radio et parabole, panneaux solaires, groupes de ventilation
    p.cyl(0.008, 0.012, 0.42, 5, -0.7, 0.62, -0.7, 0x9aa3ad);
    p.add(new THREE.SphereGeometry(0.06, 10, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-1.0), -0.55, 0.66, -0.68, C.white);
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.2, 0.012, 0.14), -0.32 + k * 0.22, 0.65, -0.6, 0x2e3c5a, 0, false, 0, -0.35);
    for (const x of [-0.25, 0.15]) p.box(0.12, 0.06, 0.1, x, 0.62, -0.38, 0xb8bcc2);
    // emblème au-dessus des portes, numéros, bureau vitré à côté
    p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 16).rotateX(Math.PI / 2), -0.18, 0.475, -0.218, C.white); p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.016, 16).rotateX(Math.PI / 2), -0.18, 0.475, -0.212, 0xd84a3e);
    p.add(new THREE.ConeGeometry(0.03, 0.06, 5).rotateX(Math.PI / 2), -0.18, 0.475, -0.2, 0xffd84a);
    for (const x of [-0.72, -0.36, 0.0, 0.36]) p.box(0.05, 0.04, 0.004, x, 0.34, -0.223, C.white);
    // borne d'incendie, cônes, banc, mât et drapeau, voiture de commandement, haie
    p.cyl(0.02, 0.025, 0.08, 8, 0.86, 0.03, 0.2, 0xd84a3e); p.sphere(0.022, 0.86, 0.11, 0.2, 0xd84a3e, 1, 0.7);
    for (const [x, z] of [[-0.86, 0.1], [-0.86, 0.3], [-0.86, 0.5]]) { p.cone(0.025, 0.06, 6, x, 0.03, z, 0xf28a3c); p.cyl(0.02, 0.02, 0.008, 6, x, 0.05, z, C.white); }
    p.box(0.16, 0.02, 0.05, 0.62, 0.07, 0.86, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.04, 0.04, 0.62 + d, 0.03, 0.86, 0x5d6878);
    p.cyl(0.005, 0.005, 0.55, 4, 0.9, 0.03, -0.1, 0xd8dde2); p.box(0.08, 0.05, 0.004, 0.94, 0.53, -0.1, 0xd84a3e); p.box(0.08, 0.016, 0.005, 0.94, 0.547, -0.1, C.white);
    p.box(0.15, 0.08, 0.26, 0.72, 0.03, 0.35, 0xd84a3e); p.box(0.14, 0.06, 0.14, 0.72, 0.11, 0.33, 0x9fd0e4); p.box(0.1, 0.02, 0.04, 0.72, 0.17, 0.33, 0x6aa8ff, 0, true);
    for (const z of [0.26, 0.44]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8).rotateZ(Math.PI / 2), 0.72, 0.035, z, 0x3c3c40);
    hedge(p, 0.0, 0.9, 1.1, 0.05, 0.05, 0.03);
  }
}

/** Pièce qui tourne du modèle en cours (roues d'un chevalement, coupole, abeilles) : ses pièces, posées autour de son moyeu */
interface Spin { p: Parts; pivot: [number, number, number]; axis: [number, number, number]; speed: number }
let spinOut: Spin | null = null;
function spinner(pivot: [number, number, number], axis: [number, number, number], speed: number) {
  spinOut = { p: new Parts(), pivot, axis, speed };
  return spinOut.p;
}

/** Abeilles qui tournent autour des ruches, centrées en (x, y, z) */
function bees(x: number, y: number, z: number, n = 12) {
  const b = spinner([x, y, z], [0, 1, 0], 1.3);
  for (let i = 0; i < n; i++) {
    const a = i * 2.39, r = 0.1 + (i % 4) * 0.06, h = Math.sin(i * 1.7) * 0.07;
    b.sphere(0.013, Math.cos(a) * r, h, Math.sin(a) * r, 0xf0c040);
    b.box(0.006, 0.014, 0.014, Math.cos(a) * r, h - 0.007, Math.sin(a) * r, 0x3c3028);
  }
}

/** Clôture de paddock : piquets et lisses entre deux points */
function rails(p: Parts, x0: number, z0: number, x1: number, z1: number, color: number, n = 2) {
  const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), k = Math.max(1, Math.round(len / 0.22));
  for (let i = 0; i <= k; i++) p.box(0.026, 0.16, 0.026, x0 + ((x1 - x0) * i) / k, 0, z0 + ((z1 - z0) * i) / k, color);
  for (let j = 0; j < n; j++) p.box(len, 0.018, 0.014, (x0 + x1) / 2, 0.06 + j * (0.08 / Math.max(1, n - 1)), (z0 + z1) / 2, color, ry);
}

/**
 * Écurie (2 × 2) : la longue bâtisse des stalles au fond, et devant le paddock où vivent les chevaux ramenés (voir PenView) :
 * auge, râtelier, selle sur la lisse, obstacles au centre équestre
 */
function stable(p: Parts, age: number) {
  const R = 0.88, grass = 0x8cbf6c, sand = age >= 4 ? 0xe8d6ad : dark(C.dirt, 0.96);
  p.box(1.84, 0.012, 1.84, 0, 0, 0, grass);
  p.box(1.7, 0.006, 1.1, 0, 0.012, 0.32, sand);
  for (let i = 0; i < 10; i++) {
    const r = 0.04 + hash2(i, 1, 71) * 0.06;
    p.cyl(r, r + 0.01, 0.003, 7, -0.72 + hash2(i, 2, 71) * 1.44, 0.018, -0.12 + hash2(i, 3, 71) * 0.86, dark(sand, 0.88 + hash2(i, 4, 71) * 0.16));
  }
  for (let i = 0; i < 22; i++) p.cone(0.016, 0.06, 4, -0.86 + i * 0.082, 0.012, -0.86 + (i % 3) * 0.02, dark(grass, 0.78));
  // paddock : lisses de bois, blanches au haras ; portail entrouvert
  const post = age >= 3 ? C.white : C.wood, nr = age === 1 ? 2 : 3;
  rails(p, -R, -0.26, -R, R, post, nr); rails(p, R, -0.26, R, R, post, nr);
  rails(p, -R, R, -0.24, R, post, nr); rails(p, 0.24, R, R, R, post, nr);
  for (const s of [-1, 1]) p.box(0.04, 0.24, 0.04, s * 0.24, 0, R, age >= 3 ? C.white : C.darkwood);
  // le battant, ouvert vers l'intérieur autour de son gond
  const ga = 1.2, gl = 0.44, gc = Math.cos(ga), gs = Math.sin(ga);
  for (const y of [0.06, 0.14]) p.box(gl, 0.018, 0.014, 0.24 - (gl / 2) * gc, y, R - (gl / 2) * gs, post, -ga);
  for (const t of [0.02, gl - 0.02]) p.box(0.02, 0.12, 0.02, 0.24 - t * gc, 0.04, R - t * gs, post);
  p.add(new THREE.BoxGeometry(Math.hypot(gl, 0.08) * 0.95, 0.014, 0.012), 0.24 - (gl / 2) * gc, 0.1, R - (gl / 2) * gs, post, -ga, false, 0.18);
  // la bâtisse : soubassement, murs selon l'âge, portes de stalles, toit
  const H = [0, 0.34, 0.42, 0.4, 0.38][age], bz = -0.56, W = 1.5, D = 0.5, zf = bz + D / 2;
  const wall = age === 1 ? C.wood : age === 2 ? C.cream : age === 3 ? C.brick : 0xc9a27a;
  const roofC = age === 1 ? C.thatch : age === 2 ? 0x8a5a44 : age === 3 ? C.slate : 0x5d6878;
  p.box(W + 0.04, 0.05, D + 0.04, 0, 0, bz, age >= 3 ? C.darkstone : C.stone);
  p.box(W, H - 0.05, D, 0, 0.05, bz, wall);
  if (age === 1 || age === 4) {
    // planches à couvre-joints
    for (let u = -W / 2 + 0.03; u < W / 2; u += 0.05) for (const s of [-1, 1]) p.box(0.012, H - 0.05, 0.008, u, 0.05, bz + s * (D / 2 + 0.003), dark(wall, 0.84));
  } else if (age === 2) {
    stones(p, 0, zf, W, 0.05, 0.27, 0, C.stone, 0.75, 81);
    p.box(W + 0.02, 0.02, D + 0.02, 0, 0.26, bz, C.darkwood);
    timbers(p, 0, zf + 0.002, W, 0.27, H, 0, 10, (i) => i % 3 !== 1);
    for (const s of [-1, 1]) timbers(p, s * (W / 2 + 0.002), bz, D, 0.27, H, s * Math.PI / 2, 3);
  } else {
    stones(p, 0, zf, W, 0.05, H, 0, dark(C.brick, 0.9), 0.4, 82);
    for (const s of [-1, 1]) quoins(p, s * W / 2, zf, 0.05, H, s, 1);
    p.box(W + 0.03, 0.025, D + 0.03, 0, H - 0.03, bz, C.white);
  }
  roof(p, 0, H, bz, { w: W, d: D, h: 0.26, color: roofC, wall, len: W + 0.12, ov: 0.08, courses: true });
  const door = age === 3 ? 0x3f7a5a : age === 4 ? 0x5a6470 : C.darkwood, frame = age >= 3 ? C.white : dark(C.wood, 0.75);
  for (const x of [-0.6, -0.3, 0.3, 0.6]) {
    // porte de stalle en deux : le bas fermé en croix, le haut ouvert sur la pénombre, une barre de fer
    p.box(0.19, 0.23, 0.012, x, 0.04, zf + 0.002, frame);
    p.box(0.16, 0.2, 0.012, x, 0.05, zf + 0.005, 0x2e2620);
    p.box(0.16, 0.1, 0.014, x, 0.05, zf + 0.009, door);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.17, 0.01, 0.006), x, 0.1, zf + 0.017, frame, 0, false, s * 0.55);
    for (const d of [-0.04, 0, 0.04]) p.box(0.006, 0.09, 0.006, x + d, 0.155, zf + 0.008, C.metal);
  }
  // porte de l'allée, fer à cheval, lanternes
  p.box(0.24, 0.29, 0.012, 0, 0.04, zf + 0.002, frame);
  p.box(0.21, 0.26, 0.016, 0, 0.05, zf + 0.006, door);
  p.box(0.006, 0.26, 0.02, 0, 0.05, zf + 0.008, frame);
  p.add(new THREE.TorusGeometry(0.026, 0.007, 4, 10, Math.PI * 1.5).rotateZ(Math.PI * 0.75), 0, 0.31, zf + 0.012, C.gold);
  for (const s of [-1, 1]) { p.box(0.012, 0.012, 0.04, s * 0.15, 0.27, zf + 0.02, C.darkwood); p.box(0.03, 0.04, 0.03, s * 0.15, 0.22, zf + 0.035, C.flame, 0, true); }
  if (age === 1) p.box(W + 0.14, 0.035, 0.07, 0, H + 0.26, bz, dark(C.thatch, 0.82));
  if (age >= 2 && age <= 3) {
    // lanternon d'aération sur le faîte, horloge au haras, girouette
    p.box(0.13, 0.12, 0.13, 0, H + 0.24, bz, age === 3 ? C.white : C.wood);
    for (const s of [-1, 1]) p.box(0.006, 0.08, 0.1, s * 0.068, H + 0.26, bz, 0x3c3530);
    p.pyramid(0.19, 0.11, 0.19, 0, H + 0.36, bz, roofC);
    if (age === 3) { p.cyl(0.04, 0.04, 0.01, 12, 0, H + 0.3, bz + 0.07, C.white); p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 12).rotateX(Math.PI / 2), 0, H + 0.3, bz + 0.07, C.white); p.box(0.004, 0.025, 0.004, 0, H + 0.3, bz + 0.078, 0x3c3530); }
    p.box(0.008, 0.1, 0.008, 0, H + 0.47, bz, C.darkwood); p.box(0.09, 0.03, 0.006, 0, H + 0.53, bz, 0x3c3530);
  }
  if (age === 4) {
    // panneaux solaires sur le pan avant, bandeau de fenêtres hautes
    const a = Math.atan2(0.26, D / 2);
    for (const x of [-0.5, -0.25, 0.25, 0.5]) p.add(new THREE.BoxGeometry(0.2, 0.012, 0.16), x, H + 0.155, bz + 0.12, 0x2c3e66, 0, false, 0, a);
    windows(p, [-0.45, -0.15, 0.15, 0.45], 0.27, zf + 0.01, 0.09, 0.05, C.white);
  }
  // auge, râtelier à foin contre la lisse, selle sur la barrière, montoir, bottes
  const trough = age === 1 ? C.darkwood : age === 2 ? C.stone : C.metal;
  p.box(0.34, 0.07, 0.11, 0.6, 0.012, 0.66, trough); p.box(0.3, 0.01, 0.08, 0.6, 0.075, 0.66, C.water);
  for (const z of [0.14, 0.44]) p.box(0.022, 0.22, 0.022, -0.8, 0.012, z, C.darkwood);
  p.box(0.06, 0.02, 0.32, -0.8, 0.2, 0.29, C.darkwood);
  for (let i = 0; i < 6; i++) p.box(0.012, 0.13, 0.012, -0.78, 0.08, 0.16 + i * 0.05, C.wood, 0, false, -0.3);
  p.box(0.07, 0.1, 0.26, -0.79, 0.1, 0.29, C.gold);
  p.box(0.09, 0.035, 0.07, -0.55, 0.15, R, 0x7a4a2e); p.box(0.07, 0.012, 0.08, -0.55, 0.185, R, 0x5e3a24);
  for (const s of [-1, 1]) p.box(0.008, 0.06, 0.008, -0.55 + s * 0.035, 0.09, R + 0.03, C.metal);
  if (age >= 2) { p.box(0.1, 0.05, 0.1, 0.26, 0.012, zf + 0.09, C.stone); p.box(0.1, 0.05, 0.05, 0.26, 0.06, zf + 0.065, C.stone); }
  bale(p, -0.62, -0.2, 0.2); bale(p, 0.72, -0.2, 1.5);
  if (age === 4) {
    // obstacles du manège : chandeliers blancs, barres rayées, bacs de fleurs
    for (const [x, z, ry] of [[-0.42, 0.44, 0], [0.22, 0.1, 0.6]] as number[][]) {
      for (const s of [-1, 1]) p.box(0.03, 0.16, 0.03, x + Math.cos(ry) * s * 0.15, 0.012, z - Math.sin(ry) * s * 0.15, C.white, ry);
      for (let k = 0; k < 4; k++) p.box(0.075, 0.018, 0.018, x + Math.cos(ry) * (-0.11 + k * 0.075), 0.11, z - Math.sin(ry) * (-0.11 + k * 0.075), k % 2 ? C.white : 0xd84a3e, ry);
      for (const s of [-1, 1]) { p.box(0.06, 0.03, 0.04, x + Math.cos(ry) * s * 0.2, 0.012, z - Math.sin(ry) * s * 0.2, C.darkgreen, ry); p.sphere(0.014, x + Math.cos(ry) * s * 0.2, 0.05, z - Math.sin(ry) * s * 0.2, C.pink); }
    }
  }
}

/** Ruche de paille (panier tressé) posée en (x, y, z), son trou de vol vers +z */
function skep(p: Parts, x: number, y: number, z: number, r = 0.06) {
  p.add(new THREE.SphereGeometry(r, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1), x, y, z, C.thatch);
  for (const h of [0.25, 0.5, 0.72]) p.add(new THREE.TorusGeometry(r * Math.sqrt(1 - h * h) + 0.002, 0.006, 3, 10).rotateX(Math.PI / 2), x, y + h * r * 1.3, z, dark(C.thatch, 0.78));
  p.box(0.024, 0.014, 0.01, x, y, z + r - 0.004, 0x2a2018);
}

/** Ruche à cadres : pieds, corps, hausse, toit de tôle, planche d'envol */
function boxHive(p: Parts, x: number, z: number, body: number, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry), at = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c];
  for (const u of [-0.045, 0.045]) { const [a, b] = at(u, 0); p.box(0.02, 0.05, 0.14, a, 0, b, C.darkwood, ry); }
  p.box(0.13, 0.1, 0.15, x, 0.05, z, body, ry);
  p.box(0.13, 0.055, 0.15, x, 0.15, z, dark(body, 0.9), ry);
  p.box(0.15, 0.02, 0.17, x, 0.205, z, C.metal, ry);
  const [ex, ez] = at(0, 0.077), [lx, lz] = at(0, 0.09);
  p.box(0.08, 0.012, 0.006, ex, 0.06, ez, 0x2a2018, ry);
  p.box(0.1, 0.008, 0.03, lx, 0.052, lz, C.wood, ry);
}

/** Rucher (1 × 1) : des ruches dans un pré fleuri, et leurs abeilles qui tournent autour */
function apiary(p: Parts, age: number) {
  const grass = age === 0 ? 0x9cb86a : 0x8cbf6c, FL = [0xf2e27a, 0xffffff, 0xd88ab8, 0xb9a6e6, 0xf29a6a];
  p.cyl(0.46, 0.47, 0.012, 14, 0, 0, 0, grass);
  for (let i = 0; i < 30; i++) {
    const a = i * 2.4, r = 0.2 + (i % 7) * 0.035, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z < 0.05 && Math.abs(x) < 0.34 && r < 0.36) continue;
    p.cone(0.012, 0.05, 4, x, 0.012, z, dark(grass, 0.8));
    p.sphere(0.014, x, 0.06, z, FL[i % 5]);
  }
  if (age === 0) {
    // troncs creux posés sur des pierres plates, couverts d'une lauze
    for (const [x, z] of [[-0.2, -0.12], [0.05, -0.22], [0.25, -0.06]]) {
      p.cyl(0.09, 0.1, 0.03, 7, x, 0, z, C.stone);
      p.cyl(0.065, 0.07, 0.22, 8, x, 0.03, z, C.darkwood);
      for (const y of [0.08, 0.17]) p.cyl(0.072, 0.072, 0.012, 8, x, y, z, dark(C.darkwood, 0.8));
      p.cyl(0.085, 0.08, 0.025, 7, x, 0.25, z, C.darkstone);
      p.box(0.025, 0.02, 0.01, x, 0.1, z + 0.066, 0x2a2018);
    }
    log(p, 0.3, 0.035, -0.12, 0, 0.22, 0.4);
    p.cyl(0.04, 0.035, 0.05, 7, 0.2, 0.012, 0.2, C.brown); p.cyl(0.03, 0.03, 0.006, 7, 0.2, 0.06, 0.2, C.gold);
    bees(0.03, 0.2, -0.12);
  } else if (age === 1) {
    // ruches d'argile couchées en pyramide sur un banc de terre, sous un auvent de roseaux
    p.box(0.62, 0.08, 0.24, 0, 0.012, -0.2, 0xc9a77c);
    for (const [x, y] of [[-0.11, 0.142], [0, 0.142], [0.11, 0.142], [-0.055, 0.236], [0.055, 0.236], [0, 0.33]]) {
      p.add(new THREE.CylinderGeometry(0.048, 0.048, 0.22, 9).rotateX(Math.PI / 2), x, y, -0.2, C.terracotta);
      p.add(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 9).rotateX(Math.PI / 2), x, y, -0.085, dark(C.terracotta, 0.78));
      p.box(0.016, 0.012, 0.006, x, y - 0.02, -0.078, 0x2a2018);
    }
    for (const x of [-0.3, 0.3]) for (const z of [-0.34, -0.04]) p.box(0.022, z < -0.2 ? 0.48 : 0.42, 0.022, x, 0, z, C.wood);
    p.add(new THREE.BoxGeometry(0.7, 0.025, 0.4), 0, 0.44, -0.19, C.thatch, 0, false, 0, 0.15);
    for (let k = 0; k < 7; k++) p.add(new THREE.BoxGeometry(0.7, 0.008, 0.014).translate(0, 0.016, -0.17 + k * 0.055), 0, 0.44, -0.19, dark(C.thatch, k % 2 ? 0.86 : 0.94), 0, false, 0, 0.15);
    attach(['a_amphora'], 0, 0.07, 0.3, 0.18); attach(['a_pot'], 0, 0.06, 0.2, 0.26, 0.6);
    bees(0, 0.24, -0.05);
  } else if (age === 2) {
    // paniers de paille sur leur banc, à l'abri d'un auvent de chaume adossé à une palissade
    p.box(0.66, 0.36, 0.02, 0, 0.012, -0.34, C.wood);
    for (let u = -0.3; u < 0.33; u += 0.06) p.box(0.012, 0.36, 0.006, u, 0.012, -0.328, dark(C.wood, 0.85));
    p.add(new THREE.BoxGeometry(0.74, 0.03, 0.16), 0, 0.36, -0.29, C.thatch, 0, false, 0, 0.35);
    for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.74, 0.008, 0.012), 0, 0.38 - k * 0.018, -0.34 + k * 0.04, dark(C.thatch, 0.82), 0, false, 0, 0.35);
    for (const x of [-0.33, 0.33]) p.box(0.022, 0.38, 0.03, x, 0.012, -0.32, C.darkwood);
    p.box(0.62, 0.02, 0.16, 0, 0.11, -0.2, C.wood);
    for (const x of [-0.27, 0.27]) p.box(0.02, 0.1, 0.12, x, 0.012, -0.2, C.darkwood);
    for (const x of [-0.21, -0.07, 0.07, 0.21]) skep(p, x, 0.13, -0.2);
    for (const [x, z] of [[-0.3, 0.22], [-0.2, 0.3], [0.32, 0.2]]) p.sphere(0.05, x, 0.05, z, C.lav, 0, 0.8);
    p.box(0.12, 0.06, 0.08, 0.18, 0.012, 0.22, C.wood); for (const d of [-0.03, 0.03]) p.cyl(0.018, 0.016, 0.035, 7, 0.18 + d, 0.072, 0.22, C.gold);
    bees(0, 0.22, -0.04);
  } else if (age === 3) {
    // ruches à cadres blanches en rang, enfumoir sur son tabouret, tournesols contre la clôture
    for (const x of [-0.27, 0, 0.27]) boxHive(p, x, -0.12, C.white);
    for (let i = 0; i < 9; i++) p.box(0.022, 0.16, 0.022, -0.4 + i * 0.1, 0.012, -0.4, C.white);
    p.box(0.84, 0.018, 0.014, 0, 0.12, -0.4, C.white);
    for (const x of [-0.32, -0.18, 0.2, 0.34]) { p.box(0.01, 0.3, 0.01, x, 0.012, -0.34, 0x6a9a4a); p.cyl(0.035, 0.035, 0.012, 9, x, 0.31, -0.33, 0xf2c84b); p.cyl(0.016, 0.016, 0.014, 7, x, 0.312, -0.326, 0x6a4a2e); }
    p.cyl(0.035, 0.035, 0.07, 6, 0.22, 0.012, 0.22, C.darkwood); p.cyl(0.022, 0.022, 0.06, 8, 0.22, 0.082, 0.22, C.metal); p.cone(0.022, 0.03, 8, 0.22, 0.142, 0.22, C.metal);
    smoke(0.22, 0.18, 0.22, 0);
    bees(0, 0.24, -0.1);
  } else {
    // ruches de toutes les couleurs dans la prairie, petite miellerie au bardage de bois et son enseigne
    [[-0.28, 0.06, 0xf2c84b, 0.3], [-0.06, 0.16, 0x8cc4e8, 0.1], [0.16, 0.2, 0x9fd8b8, -0.1], [0.32, 0.06, 0xf0a8b8, -0.3]].forEach(([x, z, c, r]) => boxHive(p, x, z, c, r));
    p.box(0.38, 0.26, 0.24, -0.04, 0.012, -0.3, C.white);
    for (let u = -0.17; u < 0.16; u += 0.04) p.box(0.012, 0.26, 0.006, -0.04 + u, 0.012, -0.177, C.wood);
    p.box(0.42, 0.025, 0.28, -0.04, 0.27, -0.3, 0x5d6878);
    p.box(0.08, 0.16, 0.012, 0.06, 0.012, -0.172, C.glass, 0, true);
    windows(p, [-0.13], 0.12, -0.172, 0.08, 0.07, C.white);
    p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 6).rotateX(Math.PI / 2), -0.04, 0.225, -0.17, C.gold);
    bees(0.02, 0.22, 0.1);
  }
}

/**
 * Thermes (2 × 2) : bassin romain fumant entre deux portiques, caldarium à coupole ; étuves à colombages et cuves de bois ;
 * bains publics de brique à verrière et haute cheminée ; centre aquatique vitré, bassin à lignes et toboggan
 */
function baths(p: Parts, age: number) {
  if (age <= 1) {
    const marble = 0xf2ead8;
    p.box(1.84, 0.03, 1.84, 0, 0, 0, 0xe9e2d4);
    for (let i = 0; i < 16; i++) p.box(0.2, 0.004, 0.2, -0.75 + (i % 4) * 0.5 + (Math.floor(i / 4) % 2) * 0.25, 0.03, -0.1 + Math.floor(i / 4) * 0.3, dark(0xe9e2d4, 0.93));
    // natatio : margelle de marbre, fond de mosaïque, eau qui fume, marches
    const pz = 0.34, pw = 0.86, pd = 0.54;
    for (const s of [-1, 1]) { p.box(pw + 0.1, 0.07, 0.05, 0, 0.03, pz + s * (pd / 2 + 0.025), marble); p.box(0.05, 0.07, pd, s * (pw / 2 + 0.025), 0.03, pz, marble); }
    p.box(pw, 0.01, pd, 0, 0.03, pz, 0x4f9fb4);
    p.box(pw, 0.008, pd, 0, 0.085, pz, 0x7fd0dc);
    for (let k = 0; k < 2; k++) p.box(0.22, 0.02, 0.05, 0, 0.04 + k * 0.022, pz + pd / 2 - 0.03 - k * 0.04, marble);
    smoke(-0.2, 0.12, pz, 0); smoke(0.22, 0.12, pz - 0.1, 0);
    // portiques de part et d'autre, toits de tuiles penchés vers le bassin
    for (const s of [-1, 1]) {
      for (const z of [0.0, 0.25, 0.5, 0.75]) column(p, s * 0.62, z, 0.32, 0.03);
      tiledShed(p, s * 0.68, 0.37, 0.38, 0.3, 0.92, s * 0.25, true);
      p.box(0.24, 0.035, 0.07, s * 0.62, 0.03, 0.38, marble, Math.PI / 2);
    }
    // caldarium : murs de brique, corniche de marbre, toit de tuiles, coupole sur son tambour, porche à fronton
    const bz = -0.6;
    p.box(1.5, 0.42, 0.46, 0, 0.03, bz, C.brick);
    stones(p, 0, bz + 0.23, 1.5, 0.03, 0.45, 0, dark(C.brick, 0.88), 0.45, 91);
    p.box(1.54, 0.03, 0.5, 0, 0.42, bz, marble);
    roof(p, 0, 0.45, bz, { w: 1.5, d: 0.46, h: 0.16, color: C.terracotta, wall: C.brick, tiles: true });
    p.cyl(0.3, 0.3, 0.16, 16, 0, 0.45, bz, C.cream);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.05, 0.08, 0.012, Math.sin(a) * 0.302, 0.48, bz + Math.cos(a) * 0.302, C.win, a, true); }
    p.add(new THREE.SphereGeometry(0.3, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.61, bz, 0xd9d2c4);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; p.add(new THREE.TorusGeometry(0.302, 0.008, 3, 8, Math.PI / 2).rotateY(a), 0, 0.61, bz, dark(0xd9d2c4, 0.86)); }
    p.cyl(0.05, 0.05, 0.03, 8, 0, 0.9, bz, C.stone);
    windows(p, [-0.55, -0.32, 0.32, 0.55], 0.15, bz + 0.235, 0.07, 0.13, marble);
    for (const s of [-1, 1]) column(p, s * 0.13, bz + 0.3, 0.3, 0.03, 0.028);
    p.box(0.36, 0.035, 0.12, 0, 0.33, bz + 0.29, marble); p.gable(0.38, 0.08, 0.12, 0, 0.365, bz + 0.29, marble);
    p.box(0.14, 0.22, 0.02, 0, 0.03, bz + 0.235, 0x6a4a3a);
    p.box(0.08, 0.62, 0.08, 0.66, 0.03, -0.8, C.brick); smoke(0.66, 0.68, -0.8, 1);
    for (const s of [-1, 1]) { if (attach(['a_statue'], 0, 0.13, s * 0.44, 0.74, Math.PI)) lift(0.03); cypress(p, s * 0.82, 0.82, 0.3); }
  } else if (age === 2) {
    p.box(1.84, 0.03, 1.84, 0, 0, 0, 0xd9cdb8);
    // la maison des étuves : pierre au rez-de-chaussée, colombages, tuiles, cheminée qui fume
    const bz = -0.58, W = 1.2, zf = bz + 0.25;
    p.box(W, 0.26, 0.5, -0.2, 0.03, bz, C.stone);
    stones(p, -0.2, zf, W, 0.03, 0.29, 0, C.stone, 0.6, 92);
    p.box(W + 0.04, 0.24, 0.54, -0.2, 0.29, bz, C.cream);
    timbers(p, -0.2, zf + 0.022, W + 0.04, 0.3, 0.53, 0, 7, (i) => i % 2 === 0);
    roof(p, -0.2, 0.53, bz, { w: W + 0.04, d: 0.54, h: 0.32, color: 0x8a5a44, wall: C.cream, courses: true });
    p.box(0.1, 0.36, 0.1, 0.18, 0.62, bz - 0.12, C.stone); smoke(0.18, 1.0, bz - 0.12, 1);
    p.box(0.14, 0.2, 0.02, -0.2, 0.03, zf + 0.01, C.door);
    windows(p, [-0.62, 0.22], 0.12, zf + 0.01, 0.08, 0.09); windows(p, [-0.6, -0.35, -0.05, 0.22], 0.36, zf + 0.032, 0.06, 0.08, C.darkwood);
    // la cour : trois cuves de bois fumantes sous un auvent rayé
    for (const [x, z] of [[-0.45, 0.28], [0, 0.42], [0.42, 0.24]]) {
      p.cyl(0.13, 0.12, 0.1, 12, x, 0.03, z, C.wood);
      for (const y of [0.05, 0.11]) p.cyl(0.133, 0.133, 0.01, 12, x, y, z, C.darkwood);
      p.cyl(0.115, 0.115, 0.01, 12, x, 0.124, z, C.water);
      p.add(new THREE.TorusGeometry(0.122, 0.012, 4, 14).rotateX(Math.PI / 2), x, 0.135, z, C.wood);
      smoke(x, 0.16, z, 0);
    }
    for (const x of [-0.72, -0.2, 0.32]) p.box(0.022, 0.25, 0.022, x, 0.03, -0.1, C.darkwood);
    for (let k = 0; k < 8; k++) p.add(new THREE.BoxGeometry(0.135, 0.012, 0.26), -0.72 + 0.068 + k * 0.13, 0.29, -0.2, k % 2 ? C.white : 0xc85a4e, 0, false, 0, 0.3);
    for (let k = 0; k < 8; k++) for (const t of [-0.03, 0.03]) p.add(new THREE.ConeGeometry(0.03, 0.04, 3).rotateZ(Math.PI), -0.72 + 0.068 + k * 0.13 + t, 0.23, -0.07, k % 2 ? C.white : 0xc85a4e);
    p.box(0.4, 0.03, 0.08, -0.46, 0.08, -0.22, C.wood); for (const s of [-1, 1]) p.box(0.02, 0.05, 0.06, -0.46 + s * 0.16, 0.03, -0.22, C.darkwood);
    // bois de chauffe, seaux, linges qui sèchent
    for (let k = 0; k < 6; k++) log(p, 0.22, 0.026, 0.62, 0.03 + (k > 3 ? 0.048 : 0), -0.25 + (k % 4) * 0.055, Math.PI / 2);
    for (const x of [0.62, 0.76]) p.cyl(0.03, 0.025, 0.05, 7, x, 0.03, 0.82, C.wood);
    for (const x of [-0.82, -0.3]) p.box(0.016, 0.3, 0.016, x, 0.03, 0.84, C.darkwood);
    p.box(0.52, 0.006, 0.006, -0.56, 0.32, 0.84, 0xc9b48a);
    for (const [x, c] of [[-0.7, C.white], [-0.56, 0xa8c8e8], [-0.42, C.white]] as [number, number][]) p.box(0.09, 0.1, 0.008, x, 0.22, 0.84, c);
  } else if (age === 3) {
    p.box(1.84, 0.025, 1.84, 0, 0, 0, 0xddd3bf);
    // établissement de bains : brique, cordons blancs, hautes fenêtres, verrière sur le faîte, cheminée de la chaufferie
    const bz = -0.5, W = 1.56, D = 0.6, H = 0.52, zf = bz + D / 2, brick = 0xb86a58;
    p.box(W, H, D, 0, 0.025, bz, brick);
    stones(p, 0, zf, W, 0.025, H + 0.025, 0, dark(brick, 0.86), 0.45, 93);
    for (const y of [0.025, 0.28, H]) p.box(W + 0.02, 0.03, D + 0.02, 0, y, bz, C.cream);
    roof(p, 0, H + 0.025, bz, { w: W, d: D, h: 0.2, color: C.slate, wall: brick, courses: true });
    p.box(0.7, 0.07, 0.2, 0, H + 0.2, bz, C.glass, 0, true);
    for (let k = 0; k < 8; k++) p.box(0.012, 0.075, 0.21, -0.33 + k * 0.094, H + 0.2, bz, C.metal);
    p.box(0.72, 0.012, 0.012, 0, H + 0.275, bz, C.metal);
    for (const y of [0.08, 0.33]) windows(p, [-0.62, -0.4, -0.18, 0.18, 0.4, 0.62], y, zf + 0.01, 0.08, 0.15, C.cream);
    p.box(0.22, 0.26, 0.03, 0, 0.025, zf + 0.012, C.cream); p.box(0.16, 0.22, 0.02, 0, 0.025, zf + 0.025, 0x3f5a4a);
    p.box(0.42, 0.06, 0.012, 0, 0.42, zf + 0.012, C.cream); for (let k = 0; k < 7; k++) p.box(0.035, 0.03, 0.006, -0.15 + k * 0.05, 0.435, zf + 0.02, 0x3c3530);
    p.cyl(0.05, 0.05, 0.01, 12, 0, 0.54, zf + 0.01, C.white); p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12).rotateX(Math.PI / 2), 0, 0.5, zf + 0.012, C.white);
    p.cyl(0.06, 0.075, 1.1, 8, 0.66, 0.025, bz - 0.2, 0xa85e50); p.cyl(0.07, 0.07, 0.04, 8, 0.66, 1.1, bz - 0.2, C.darkstone); smoke(0.66, 1.16, bz - 0.2, 2);
    // square : haies, fontaine, bancs, réverbères
    for (const s of [-1, 1]) { hedge(p, s * 0.55, 0.42, 0.5, 0.06); hedge(p, s * 0.55, 0.78, 0.5, 0.06); p.box(0.24, 0.03, 0.08, s * 0.55, 0.06, 0.6, 0x3f6a4a); for (const d of [-0.09, 0.09]) p.box(0.02, 0.05, 0.06, s * 0.55 + d, 0.025, 0.6, C.metal); }
    p.cyl(0.16, 0.17, 0.08, 12, 0, 0.025, 0.55, C.stone); p.cyl(0.13, 0.13, 0.01, 12, 0, 0.1, 0.55, C.water);
    p.cyl(0.02, 0.03, 0.18, 6, 0, 0.1, 0.55, C.stone); p.cyl(0.07, 0.04, 0.03, 8, 0, 0.27, 0.55, C.stone);
    for (const s of [-1, 1]) { p.cyl(0.012, 0.016, 0.42, 6, s * 0.2, 0.025, 0.86, 0x3c4a44); p.box(0.05, 0.06, 0.05, s * 0.2, 0.44, 0.86, 0xffe2a0, 0, true); }
  } else {
    p.box(1.84, 0.025, 1.84, 0, 0, 0, 0xe4e0d8);
    // le centre aquatique : grande façade vitrée, auvent, enseigne bleue
    const bz = -0.56, W = 1.5, D = 0.52, H = 0.44, zf = bz + D / 2;
    p.box(W, H, D, 0, 0.025, bz, C.white);
    for (let k = 0; k < 9; k++) for (const y of [0.06, 0.25]) p.box(0.14, 0.16, 0.012, -0.6 + k * 0.15, y, zf + 0.004, C.glass, 0, true);
    for (let k = 0; k < 10; k++) p.box(0.012, 0.38, 0.016, -0.675 + k * 0.15, 0.045, zf + 0.01, C.metal);
    p.box(W + 0.1, 0.035, D + 0.14, 0, H + 0.025, bz + 0.04, C.white);
    p.box(0.5, 0.07, 0.012, -0.3, H - 0.06, zf + 0.08, 0x3f8fd8); for (let k = 0; k < 4; k++) p.box(0.06, 0.012, 0.006, -0.45 + k * 0.1, H - 0.03, zf + 0.088, C.white);
    // bassin extérieur : plage de dalles, lignes d'eau, échelle ; toboggan qui tourne en descendant depuis sa tour
    const pz = 0.32, pw = 1.1, pd = 0.66;
    for (const s of [-1, 1]) { p.box(pw + 0.08, 0.06, 0.04, 0, 0.025, pz + s * (pd / 2 + 0.02), C.white); p.box(0.04, 0.06, pd, s * (pw / 2 + 0.02), 0.025, pz, C.white); }
    p.box(pw, 0.01, pd, 0, 0.025, pz, 0x3fa8c8); p.box(pw, 0.008, pd, 0, 0.07, pz, 0x6cd0e8);
    for (let k = 1; k < 5; k++) p.box(0.012, 0.004, pd - 0.06, -pw / 2 + k * (pw / 5), 0.079, pz, 0x2a5aa0);
    for (const s of [-1, 1]) p.box(0.006, 0.08, 0.006, 0.4 + s * 0.03, 0.06, pz - pd / 2 + 0.01, C.metal);
    for (const [x, z] of [[0.72, -0.12], [0.86, -0.12], [0.72, 0.02], [0.86, 0.02]]) p.box(0.02, 0.5, 0.02, x, 0.025, z, 0xf2c84b);
    p.box(0.18, 0.02, 0.18, 0.79, 0.5, -0.05, 0xf2c84b);
    for (let k = 0; k < 3; k++) p.add(new THREE.TorusGeometry(0.15, 0.03, 6, 12, Math.PI).rotateX(Math.PI / 2).rotateY(k * 1.3), 0.7, 0.42 - k * 0.13, 0.12 + k * 0.06, k % 2 ? 0x4fa3e0 : 0xf2785a);
    // chaises longues, parasols, arbres
    for (const x of [-0.6, -0.42, -0.24]) { p.add(new THREE.BoxGeometry(0.08, 0.012, 0.16), x, 0.05, 0.8, C.white, 0, false, 0, 0); p.add(new THREE.BoxGeometry(0.08, 0.012, 0.07), x, 0.08, 0.7, C.white, 0, false, 0, -0.7); }
    for (const [x, c] of [[-0.51, 0xf2785a], [0.3, 0x4fa3e0]] as [number, number][]) { p.cyl(0.006, 0.006, 0.26, 4, x, 0.025, 0.8, C.metal); p.cone(0.13, 0.06, 8, x, 0.25, 0.8, c); }
    tree(p, -0.82, 0.82, 1.2); tree(p, 0.84, 0.82, 1.1);
  }
}

/** Taverne (1 × 1) : la taverne à colombages de KayKit et sa terrasse ; brasserie de brique ; café vitré */
function tavern(p: Parts, age: number, o: ModelOpts) {
  p.box(0.98, 0.012, 0.98, 0, 0, 0, age >= 4 ? 0xe4e0d8 : 0xd9cdb8);
  if (age <= 2) {
    if (!attach(['b_tavern_blue', 'b_tavern_red'], o.v, 0.78, 0, -0.08)) {
      p.box(0.6, 0.26, 0.46, 0, 0.012, -0.12, C.stone); p.box(0.62, 0.22, 0.48, 0, 0.27, -0.12, C.cream);
      timbers(p, 0, 0.122, 0.62, 0.28, 0.49, 0, 4);
      roof(p, 0, 0.49, -0.12, { w: 0.62, d: 0.48, h: 0.26, color: 0x8a5a44, wall: C.cream, courses: true });
      windows(p, [-0.18, 0.18], 0.1, 0.112, 0.08, 0.09); p.box(0.12, 0.2, 0.02, 0, 0.012, 0.112, C.door);
    }
    // lanterne, tonneaux, table et bancs devant
    p.box(0.03, 0.04, 0.03, -0.22, 0.24, 0.33, C.flame, 0, true); p.box(0.012, 0.012, 0.05, -0.22, 0.29, 0.31, C.darkwood);
    for (const [x, z] of [[0.36, 0.28], [0.42, 0.38]]) { p.cyl(0.04, 0.04, 0.09, 8, x, 0.012, z, 0x9a6a44); for (const y of [0.03, 0.08]) p.cyl(0.042, 0.042, 0.008, 8, x, y, z, 0x6f5640); }
    p.box(0.22, 0.02, 0.1, -0.2, 0.08, 0.4, C.wood); for (const s of [-1, 1]) p.box(0.22, 0.02, 0.04, -0.2, 0.05, 0.4 + s * 0.09, C.darkwood);
    for (const s of [-1, 1]) p.box(0.02, 0.07, 0.08, -0.2 + s * 0.09, 0.012, 0.4, C.darkwood);
    p.cyl(0.012, 0.012, 0.025, 6, -0.25, 0.1, 0.39, C.gold); p.cyl(0.012, 0.012, 0.025, 6, -0.15, 0.1, 0.41, C.gold);
  } else if (age === 3) {
    // brasserie : brique sur deux niveaux, grandes vitrines, store rayé sur la terrasse, enseigne
    const brick = 0xb4685c;
    p.box(0.7, 0.5, 0.5, 0, 0.012, -0.16, brick);
    stones(p, 0, 0.09, 0.7, 0.012, 0.51, 0, dark(brick, 0.86), 0.45, 94);
    for (const y of [0.26, 0.5]) p.box(0.72, 0.025, 0.52, 0, y, -0.16, C.cream);
    roof(p, 0, 0.51, -0.16, { w: 0.7, d: 0.5, h: 0.18, color: C.slate, wall: brick, courses: true });
    p.box(0.07, 0.2, 0.07, 0.22, 0.62, -0.28, brick); smoke(0.22, 0.84, -0.28, 0);
    windows(p, [-0.2, 0.2], 0.05, 0.1, 0.18, 0.16, C.cream); windows(p, [-0.2, 0, 0.2], 0.31, 0.1, 0.08, 0.12, C.cream);
    p.box(0.1, 0.2, 0.02, 0, 0.012, 0.1, 0x3f5a4a);
    p.box(0.4, 0.05, 0.012, 0, 0.42, 0.1, C.cream); for (let k = 0; k < 6; k++) p.box(0.03, 0.025, 0.006, -0.125 + k * 0.05, 0.433, 0.108, 0x3c3530);
    for (let k = 0; k < 8; k++) {
      p.add(new THREE.BoxGeometry(0.09, 0.01, 0.14), -0.315 + k * 0.09, 0.27, 0.165, k % 2 ? C.white : 0xc85a4e, 0, false, 0, 0.45);
      for (const t of [-0.025, 0.025]) p.add(new THREE.ConeGeometry(0.022, 0.035, 3).rotateZ(Math.PI), -0.315 + k * 0.09 + t, 0.225, 0.23, k % 2 ? C.white : 0xc85a4e);
    }
    for (const x of [-0.24, 0.24]) { p.cyl(0.05, 0.05, 0.01, 10, x, 0.1, 0.34, C.white); p.cyl(0.008, 0.012, 0.09, 5, x, 0.012, 0.34, 0x3c4a44); for (const s of [-1, 1]) p.box(0.04, 0.06, 0.04, x + s * 0.08, 0.012, 0.34, 0x3c4a44); }
    for (const [x, z] of [[0.42, 0.04], [0.42, -0.06]]) { p.cyl(0.04, 0.04, 0.09, 8, x, 0.012, z, 0x9a6a44); p.cyl(0.042, 0.042, 0.008, 8, x, 0.05, z, 0x6f5640); }
  } else {
    // café : façade vitrée, toit plat et enseigne, terrasse de tables rondes sous les parasols, pots de plantes
    p.box(0.66, 0.34, 0.46, 0, 0.012, -0.18, 0xe8dccb);
    p.box(0.7, 0.03, 0.5, 0, 0.35, -0.18, 0x5d6878);
    for (const x of [-0.22, 0, 0.22]) p.box(0.2, 0.24, 0.012, x, 0.04, 0.054, C.glass, 0, true);
    for (const x of [-0.33, -0.11, 0.11, 0.33]) p.box(0.016, 0.26, 0.018, x, 0.03, 0.058, C.darkwood);
    p.box(0.66, 0.06, 0.016, 0, 0.29, 0.06, C.darkwood); for (let k = 0; k < 4; k++) p.box(0.04, 0.03, 0.006, -0.09 + k * 0.06, 0.305, 0.07, C.cream);
    p.add(new THREE.BoxGeometry(0.66, 0.012, 0.14), 0, 0.31, 0.12, 0x3f7a5a, 0, false, 0, 0.4);
    for (const [x, z, c] of [[-0.26, 0.3, 0xf2c84b], [0.06, 0.36, 0xf2785a], [0.32, 0.28, 0x8cc4e8]] as [number, number, number][]) {
      p.cyl(0.04, 0.04, 0.008, 10, x, 0.08, z, C.white); p.cyl(0.006, 0.01, 0.07, 5, x, 0.012, z, C.metal);
      for (const s of [-1, 1]) p.box(0.035, 0.05, 0.035, x + s * 0.065, 0.012, z, 0x3c4a44);
      p.cyl(0.004, 0.004, 0.24, 4, x, 0.012, z, C.metal); p.cone(0.1, 0.05, 8, x, 0.24, z, c);
    }
    for (const x of [-0.42, 0.42]) { p.cyl(0.035, 0.03, 0.06, 7, x, 0.012, 0.12, C.terracotta); p.sphere(0.045, x, 0.1, 0.12, C.darkgreen, 0, 0.9); }
  }
}

/**
 * Mine (2 × 2) : l'entrée de KayKit dans sa butte, rails, wagonnet de minerai et tas de pierres ; chevalement d'acier dont
 * les molettes tournent, salle des machines et terril ; carrière moderne : tapis roulant, concasseur, tas de gravier, engins
 */
function mine(p: Parts, age: number) {
  const ore = (x: number, y: number, z: number, s = 1) => {
    for (let k = 0; k < 6; k++) p.sphere(0.03 * s, x + Math.sin(k * 2.1) * 0.035 * s, y + (k > 3 ? 0.03 * s : 0), z + Math.cos(k * 1.7) * 0.03 * s, k % 3 ? C.darkstone : 0xb87a4a, 0, 0.8);
  };
  const cart = (x: number, z: number, ry: number) => {
    p.box(0.12, 0.07, 0.09, x, 0.04, z, 0x6f5640, ry);
    for (const s of [-1, 1]) for (const t of [-1, 1]) p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 8).rotateX(Math.PI / 2), x + Math.cos(ry) * s * 0.04 + Math.sin(ry) * t * 0.05, 0.03, z - Math.sin(ry) * s * 0.04 + Math.cos(ry) * t * 0.05, C.metal);
    ore(x, 0.11, z, 0.9);
  };
  const track = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0), n = Math.round(len / 0.07);
    for (let i = 0; i <= n; i++) p.box(0.03, 0.012, 0.12, x0 + ((x1 - x0) * i) / n, 0.012, z0 + ((z1 - z0) * i) / n, C.darkwood, ry);
    for (const s of [-1, 1]) p.box(len, 0.014, 0.012, (x0 + x1) / 2 - Math.sin(ry) * s * 0.04, 0.024, (z0 + z1) / 2 - Math.cos(ry) * s * 0.04, C.metal, ry);
  };
  if (age <= 2) {
    p.box(1.84, 0.012, 1.84, 0, 0, 0, 0xa89a80);
    if (!attach(['b_mine_blue'], 0, 1.25, -0.12, -0.3)) {
      p.sphere(0.6, -0.12, 0, -0.4, C.darkstone, 1, 0.7);
      p.box(0.26, 0.3, 0.1, -0.12, 0, 0.12, 0x2a2018);
      for (const s of [-1, 1]) p.box(0.04, 0.32, 0.04, -0.12 + s * 0.14, 0, 0.14, C.wood);
      p.box(0.34, 0.04, 0.05, -0.12, 0.32, 0.14, C.wood);
    }
    track(-0.12, 0.3, 0.5, 0.75);
    cart(0.22, 0.53, -0.62);
    for (const [x, z, s] of [[0.62, 0.32, 1.6], [0.74, 0.12, 1.2]]) ore(x, 0.012, z, s);
    for (const [x, z] of [[-0.62, 0.52], [-0.5, 0.62]]) p.box(0.1, 0.08, 0.1, x, 0.012, z, 0xb48a5e, x * 3);
    for (const d of [0, 0.05]) { p.box(0.01, 0.2, 0.01, -0.72 + d, 0.012, 0.3, C.wood, 0, false, 0.15); p.box(0.07, 0.014, 0.014, -0.7 + d, 0.2, 0.3, C.metal); }
    for (const [x, z] of [[0.3, 0.86], [-0.42, 0.24]]) { p.box(0.016, 0.28, 0.016, x, 0.012, z, C.darkwood); p.box(0.034, 0.042, 0.034, x, 0.28, z, C.flame, 0, true); }
  } else if (age === 3) {
    p.box(1.84, 0.012, 1.84, 0, 0, 0, 0x8a8478);
    // chevalement : quatre montants d'acier entretoisés, plateforme, deux molettes qui tournent
    const hx = -0.3, hz = 0.0, top = 1.02;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.03, top, 0.03).translate(0, top / 2, 0), hx + sx * 0.14, 0.012, hz + sz * 0.14, 0x4a5560, 0, false, -sx * 0.05, sz * 0.05);
    for (let y = 0.2; y < top; y += 0.2) for (const s of [-1, 1]) { p.box(0.28, 0.016, 0.016, hx, y, hz + s * 0.14 * (1 - y / 3), 0x4a5560); p.box(0.016, 0.016, 0.28, hx + s * 0.14 * (1 - y / 3), y, hz, 0x4a5560); }
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.02, 0.6, 0.02), hx + s * 0.1, 0.5, hz + 0.3, 0x4a5560, 0, false, 0, -0.6);
    p.box(0.3, 0.025, 0.3, hx, top, hz, 0x3c4650);
    const w = spinner([hx, top + 0.11, hz], [1, 0, 0], 1.6);
    for (const dx of [-0.06, 0.06]) {
      w.add(new THREE.TorusGeometry(0.1, 0.012, 4, 16).rotateY(Math.PI / 2), dx, 0, 0, 0xc84a3e);
      for (let k = 0; k < 4; k++) w.add(new THREE.BoxGeometry(0.008, 0.2, 0.012).rotateX((k * Math.PI) / 4), dx, 0, 0, 0xc84a3e);
    }
    w.add(new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6).rotateZ(Math.PI / 2), 0, 0, 0, C.metal);
    for (const s of [-1, 1]) p.box(0.02, 0.12, 0.02, hx + s * 0.1, top, hz, 0x3c4650);
    p.box(0.2, 0.2, 0.2, hx, 0.012, hz, 0x5a4a40);
    // salle des machines de brique, haute cheminée qui fume, câbles vers les molettes
    const brick = 0xa85e50;
    p.box(0.6, 0.38, 0.4, 0.42, 0.012, -0.5, brick);
    stones(p, 0.42, -0.3, 0.6, 0.012, 0.39, 0, dark(brick, 0.86), 0.45, 95);
    roof(p, 0.42, 0.39, -0.5, { w: 0.6, d: 0.4, h: 0.14, color: C.slate, wall: brick, courses: true });
    windows(p, [0.27, 0.57], 0.12, -0.29, 0.08, 0.14, C.cream);
    p.cyl(0.05, 0.065, 1.0, 8, 0.72, 0.012, -0.72, brick); smoke(0.72, 1.04, -0.72, 2);
    for (const dx of [-0.06, 0.06]) {
      const a = new THREE.Vector3(0.3 + dx, 0.4, -0.32), b = new THREE.Vector3(hx + dx, top + 0.11, hz + 0.1), d = b.clone().sub(a), L = d.length();
      p.add(new THREE.CylinderGeometry(0.004, 0.004, L, 4).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0x2a2a2a);
    }
    // terril strié, wagonnets, rails
    p.cone(0.36, 0.44, 8, 0.5, 0.012, 0.48, 0x3a3634);
    for (const [y, r] of [[0.1, 0.285], [0.22, 0.19]]) p.cyl(r - 0.03, r + 0.005, 0.03, 8, 0.5, y, 0.48, 0x4a4440);
    track(-0.3, 0.18, -0.3, 0.86); cart(-0.3, 0.5, Math.PI / 2); cart(-0.3, 0.72, Math.PI / 2);
    for (const [x, z] of [[-0.75, -0.5], [0.0, 0.84]]) { p.cyl(0.012, 0.016, 0.42, 6, x, 0.012, z, 0x3c4a44); p.box(0.05, 0.06, 0.05, x, 0.43, z, 0xffe2a0, 0, true); }
  } else {
    p.box(1.84, 0.012, 1.84, 0, 0, 0, 0xb8b0a0);
    // carrière : gradins de roche taillée au fond, concasseur, tapis roulant vers le tas de gravier, pelleteuse et camion
    for (let k = 0; k < 3; k++) p.box(1.7 - k * 0.3, 0.16, 0.36 - k * 0.04, 0, 0.012 + k * 0.16, -0.72 + k * 0.04, dark(0xb0a898, 1 - k * 0.06));
    stones(p, 0, -0.54, 1.7, 0.012, 0.17, 0, 0xb0a898, 0.5, 96);
    p.box(0.3, 0.3, 0.26, -0.45, 0.012, -0.08, 0xd8b84a); p.box(0.18, 0.12, 0.18, -0.45, 0.31, -0.08, 0x8a8478);
    p.add(new THREE.BoxGeometry(0.7, 0.03, 0.08), -0.02, 0.26, 0.04, 0x3c3c3c, 0, false, -0.4);
    for (const x of [-0.2, 0.15]) p.box(0.02, x < 0 ? 0.24 : 0.12, 0.02, x, 0.012, 0.04, C.metal);
    p.cone(0.3, 0.3, 9, 0.42, 0.012, 0.2, 0xa8a090); p.cone(0.2, 0.2, 8, 0.66, 0.012, 0.66, 0xc89a6a);
    p.box(0.22, 0.08, 0.14, -0.3, 0.04, 0.6, 0xf2c84b); p.box(0.1, 0.08, 0.12, -0.36, 0.12, 0.6, 0x3c4a54);
    p.add(new THREE.BoxGeometry(0.24, 0.025, 0.03), -0.14, 0.2, 0.6, 0xf2c84b, 0, false, 0.5);
    p.box(0.07, 0.05, 0.06, -0.02, 0.2, 0.6, 0x5a5a5a);
    for (const s of [-1, 1]) p.box(0.24, 0.04, 0.03, -0.3, 0.012, 0.6 + s * 0.06, 0x2a2a2a);
    p.box(0.3, 0.1, 0.16, 0.2, 0.06, 0.82, 0xf2c84b); p.box(0.1, 0.1, 0.15, 0.4, 0.06, 0.82, 0xe8a83a);
    for (const x of [0.12, 0.3, 0.42]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8).rotateX(Math.PI / 2), x, 0.04, 0.82 + s * 0.08, 0x2a2a2a);
    ore(0.2, 0.16, 0.82, 1.3);
    p.box(0.32, 0.18, 0.16, 0.66, 0.012, -0.12, C.white); p.box(0.08, 0.06, 0.01, 0.6, 0.08, -0.039, C.glass, 0, true);
  }
}

/** Observatoire (1 × 1) : tour blanche à coupole d'argent qui tourne lentement, fente ouverte sur la lunette ; annexe et antenne */
/**
 * Avant-poste (2 × 2) devant une grotte ou une faille, d'où partent les troupes armées vers les profondeurs : palissade de
 * pieux, tour de guet, tentes, feu de camp, table aux plans, râtelier d'armes ; muraille de pierre, tour crénelée, caserne et
 * wagonnets à l'âge industriel ; clôture grillagée, conteneurs, préfabriqués et projecteurs ensuite
 */
function outpost(p: Parts, age: number) {
  const R = 0.82, y0 = 0.018;
  const crate = (x: number, z: number, s = 1, ry = 0, y = y0) => { p.box(0.1 * s, 0.09 * s, 0.1 * s, x, y, z, 0xb48a5e, ry); for (const d of [-0.035, 0.035]) p.box(0.104 * s, 0.09 * s + 0.002, 0.014, x + Math.sin(ry) * d * s, y - 0.001, z + Math.cos(ry) * d * s, dark(0xb48a5e, 0.75), ry); };
  const barrel = (x: number, z: number) => { p.cyl(0.035, 0.035, 0.09, 8, x, y0, z, 0x9a6a44); for (const y of [0.02, 0.065]) p.cyl(0.037, 0.037, 0.008, 8, x, y0 + y, z, 0x5a5050); };
  const torch = (x: number, z: number, h = 0.3) => { p.box(0.016, h, 0.016, x, y0, z, C.darkwood); p.cyl(0.022, 0.014, 0.025, 6, x, y0 + h, z, 0x4a3a2e); p.box(0.026, 0.04, 0.026, x, y0 + h + 0.022, z, C.flame, 0, true); };
  const flag = (x: number, y: number, z: number, h: number, c: number, pole = C.darkwood) => { p.cyl(0.007, 0.009, h, 5, x, y, z, pole); p.box(0.006, 0.09, 0.15, x, y + h - 0.1, z + 0.075, c); p.box(0.008, 0.022, 0.15, x, y + h - 0.06, z + 0.075, C.gold); p.sphere(0.012, x, y + h + 0.005, z, C.gold); };
  const lamp = (x: number, z: number, h: number) => { p.cyl(0.008, 0.012, h, 6, x, y0, z, 0x3c4a44); p.box(0.045, 0.05, 0.045, x, y0 + h, z, 0xffe2a0, 0, true); p.pyramid(0.06, 0.03, 0.06, x, y0 + h + 0.05, z, 0x3c4a44); };
  // herbe autour, sol battu dans l'enceinte, chemin vers la porte
  p.box(1.84, 0.012, 1.84, 0, 0, 0, age >= 4 ? 0x9cae84 : 0x9cb86c);
  p.box(2 * R, 0.006, 2 * R, 0, 0.012, 0, age >= 4 ? 0xb8b2a6 : 0xb49e7c);
  p.box(0.34, 0.006, 0.92 - R + 0.02, 0, 0.012, (R + 0.92) / 2, age >= 4 ? 0x8a8a88 : 0xb49e7c);
  for (let i = 0; i < 9; i++) { const r = 0.04 + hash2(i, 1, 91) * 0.05; p.cyl(r, r + 0.01, 0.003, 7, -0.7 + hash2(i, 2, 91) * 1.4, 0.018, -0.7 + hash2(i, 3, 91) * 1.4, dark(age >= 4 ? 0xb8b2a6 : 0xb49e7c, 0.88 + hash2(i, 4, 91) * 0.1)); }
  if (age <= 2) {
    // palissade de pieux appointés, traverses, porte entre deux grands poteaux ; les battants ouverts vers l'intérieur
    let n = 0;
    const stake = (x: number, z: number) => { const h = 0.28 + hash2(n, 7, 90) * 0.06, c = dark(C.wood, 0.78 + hash2(n++, 8, 90) * 0.2); p.cyl(0.03, 0.034, h, 6, x, y0, z, c); p.cone(0.03, 0.06, 6, x, y0 + h, z, dark(c, 0.8)); };
    for (let t = -R; t <= R + 1e-6; t += 0.066) { stake(t, -R); stake(-R, t); stake(R, t); if (Math.abs(t) > 0.2) stake(t, R); }
    for (const y of [0.08, 0.22]) {
      p.box(2 * R, 0.022, 0.02, 0, y, -R + 0.04, C.darkwood); for (const s of [-1, 1]) p.box(0.02, 0.022, 2 * R, s * (R - 0.04), y, 0, C.darkwood);
      for (const s of [-1, 1]) p.box(R - 0.2, 0.022, 0.02, s * (R + 0.2) / 2, y, R - 0.04, C.darkwood);
    }
    for (const s of [-1, 1]) { p.cyl(0.04, 0.045, 0.5, 7, s * 0.22, y0, R, C.darkwood); p.cone(0.042, 0.06, 7, s * 0.22, y0 + 0.5, R, dark(C.darkwood, 0.8)); }
    p.box(0.5, 0.04, 0.05, 0, 0.44, R, C.darkwood);
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10).rotateX(Math.PI / 2), 0, 0.4, R + 0.03, 0xb8342c); p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.014, 8).rotateX(Math.PI / 2), 0, 0.4, R + 0.032, C.gold);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) p.box(0.06, 0.28, 0.022, s * (0.2 - 0.04 - k * 0.06 * Math.cos(1.1)), y0, R - 0.03 - k * 0.06 * Math.sin(1.1), dark(C.wood, 0.85), s * 1.1);
    for (const s of [-1, 1]) torch(s * 0.3, R + 0.07, 0.32);
    // tour de guet : quatre poteaux, croisillons, plateforme à garde-corps, toit de bardeaux, échelle, brasero, bannière
    const tx = -0.46, tz = -0.46, th = 0.6, top = th + 0.24;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(new THREE.BoxGeometry(0.032, top, 0.032).translate(0, top / 2, 0), tx + sx * 0.14, y0, tz + sz * 0.14, C.darkwood, 0, false, sx * 0.03, -sz * 0.03);
    for (const y of [0.18, 0.4]) for (const s of [-1, 1]) { p.box(0.3, 0.02, 0.02, tx, y, tz + s * 0.135, C.wood); p.box(0.02, 0.02, 0.3, tx + s * 0.135, y, tz, C.wood); }
    for (const s of [-1, 1]) { p.add(new THREE.BoxGeometry(0.36, 0.018, 0.016), tx, 0.29, tz + s * 0.137, C.wood, 0, false, s * 0.7); p.add(new THREE.BoxGeometry(0.016, 0.018, 0.36), tx + s * 0.137, 0.29, tz, C.wood, 0, false, 0, s * 0.7); }
    p.box(0.38, 0.03, 0.38, tx, th, tz, C.wood);
    for (const s of [-1, 1]) { p.box(0.38, 0.1, 0.014, tx, th + 0.03, tz + s * 0.183, dark(C.wood, 0.9)); p.box(0.014, 0.1, 0.38, tx + s * 0.183, th + 0.03, tz, dark(C.wood, 0.9)); }
    p.pyramid(0.46, 0.18, 0.46, tx, top, tz, 0x8a5a44);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.018, th + 0.05, 0.018).translate(0, (th + 0.05) / 2, 0), tx + s * 0.05, y0, tz + 0.2, C.wood, 0, false, 0, 0.12);
    for (let y = 0.08; y < th; y += 0.07) p.box(0.1, 0.012, 0.014, tx, y, tz + 0.2 + y * 0.12, C.wood);
    p.cyl(0.03, 0.022, 0.04, 7, tx + 0.11, th + 0.03, tz - 0.11, 0x3c3c40); p.box(0.03, 0.04, 0.03, tx + 0.11, th + 0.07, tz - 0.11, C.flame, 0, true);
    flag(tx, top + 0.17, tz, 0.26, 0xb8342c);
    // tentes de toile rayée, mât et piquets
    for (const [x, z] of [[0.42, -0.5], [0.56, -0.06]]) {
      p.gable(0.42, 0.24, 0.3, x, y0, z, 0xe8dcc0, Math.PI / 2);
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.004, 0.17, 0.43).translate(0, 0, 0), x + s * 0.075, y0 + 0.12, z, 0xc8443a, 0, false, s * 0.89);
      p.box(0.012, 0.29, 0.012, x, y0, z + 0.21, C.darkwood);
      p.add(new THREE.BoxGeometry(0.09, 0.15, 0.004), x, y0 + 0.07, z + 0.212, 0x5a4a3a);
      for (const s of [-1, 1]) p.box(0.012, 0.03, 0.012, x + s * 0.2, y0, z + 0.2, C.darkwood);
    }
    // feu de camp cerclé de pierres, bûches pour s'asseoir ; table aux plans et tabouret ; râtelier de lances ; vivres
    const fx = 0.06, fz = 0.12;
    for (let k = 0; k < 8; k++) p.sphere(0.025, fx + Math.cos(k * 0.785) * 0.07, y0 + 0.01, fz + Math.sin(k * 0.785) * 0.07, C.darkstone, 0, 0.7);
    for (const r of [0.4, 1.9]) p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.11, 6).rotateZ(Math.PI / 2), fx, y0 + 0.02, fz, C.darkwood, r);
    p.cone(0.035, 0.08, 6, fx, y0 + 0.02, fz, C.flame, true); smoke(fx, 0.16, fz, 0);
    for (const [x, z, r] of [[fx - 0.2, fz, 0], [fx + 0.2, fz + 0.04, 0.3], [fx, fz + 0.2, 1.4]]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 7).rotateZ(Math.PI / 2), x, y0 + 0.03, z, C.wood, Math.PI / 2 + r);
    const mx = -0.44, mz = 0.14;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.016, 0.12, 0.016, mx + dx * 0.1, y0, mz + dz * 0.06, C.darkwood);
    p.box(0.24, 0.02, 0.16, mx, y0 + 0.12, mz, C.wood); p.box(0.17, 0.004, 0.11, mx, y0 + 0.14, mz, C.cream, 0.15);
    for (const [dx, dz, c] of [[-0.04, 0.02, 0xb8342c], [0.03, -0.02, 0x3c3530], [0.05, 0.03, 0xb8342c]] as [number, number, number][]) p.box(0.012, 0.012, 0.012, mx + dx, y0 + 0.144, mz + dz, c);
    p.cyl(0.03, 0.03, 0.08, 7, mx, y0, mz + 0.14, C.darkwood);
    p.box(0.34, 0.02, 0.02, -0.06, 0.2, -0.66, C.darkwood); for (const s of [-1, 1]) p.box(0.02, 0.22, 0.02, -0.06 + s * 0.16, y0, -0.66, C.darkwood);
    for (let k = 0; k < 5; k++) { const x = -0.18 + k * 0.06; p.add(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 4).translate(0, 0.18, 0), x, y0, -0.7, C.wood, 0, false, 0, 0.2); p.cone(0.012, 0.04, 4, x, y0 + 0.35, -0.63, C.metal); }
    crate(0.52, 0.52, 1, 0.2); crate(0.62, 0.62, 0.9, -0.3); crate(0.56, 0.56, 0.8, 0.5, y0 + 0.09); barrel(0.4, 0.64); barrel(-0.6, 0.58); barrel(-0.68, 0.48);
    flag(0.3, y0, 0.5, 0.52, 0x3a6ab8);
  } else if (age === 3) {
    // muraille de pierre à couronnement, porte entre deux piliers de brique coiffés de lanternes, grille de fer ouverte
    const wall = 0xb8b2a4, H = 0.24;
    for (const s of [-1, 1]) { p.box(0.08, H, 2 * R, s * (R - 0.04), y0, 0, wall); stones(p, s * R, 0, 2 * R, y0, y0 + H, s * Math.PI / 2, dark(wall, 0.86), 0.5, 300 + s); }
    p.box(2 * R, H, 0.08, 0, y0, -R + 0.04, wall);
    for (const s of [-1, 1]) { p.box(R - 0.24, H, 0.08, s * (R + 0.24) / 2, y0, R - 0.04, wall); stones(p, s * (R + 0.24) / 2, R, R - 0.24, y0, y0 + H, 0, dark(wall, 0.86), 0.5, 303 + s); }
    for (const s of [-1, 1]) { p.box(0.1, 0.025, 2 * R + 0.02, s * (R - 0.04), y0 + H, 0, C.darkstone); p.box(R - 0.22, 0.025, 0.1, s * (R + 0.24) / 2, y0 + H, R - 0.04, C.darkstone); }
    p.box(2 * R + 0.02, 0.025, 0.1, 0, y0 + H, -R + 0.04, C.darkstone);
    for (const s of [-1, 1]) {
      p.box(0.11, 0.38, 0.11, s * 0.24, y0, R - 0.04, C.darkbrick); stones(p, s * 0.24, R + 0.016, 0.11, y0, y0 + 0.38, 0, dark(C.darkbrick, 0.84), 0.5, 306 + s);
      p.box(0.13, 0.025, 0.13, s * 0.24, y0 + 0.38, R - 0.04, C.cream); lamp(s * 0.24, R - 0.04, 0.41);
      for (let k = 0; k < 4; k++) p.box(0.008, 0.22, 0.008, s * (0.18 - k * 0.025 * Math.cos(1.2)) , y0, R - 0.04 - k * 0.04 * Math.sin(1.2), 0x3c3c40);
      p.box(0.006, 0.01, 0.16, s * 0.16, y0 + 0.2, R - 0.1, 0x3c3c40, s * 0.35);
    }
    // tour de guet crénelée, lanterne au sommet, fenêtres éclairées, drapeau
    const tx = -0.46, tz = -0.46, th = 0.74;
    p.box(0.3, th, 0.3, tx, y0, tz, wall);
    stones(p, tx, tz + 0.151, 0.3, y0, y0 + th, 0, dark(wall, 0.84), 0.5, 310); stones(p, tx + 0.151, tz, 0.3, y0, y0 + th, Math.PI / 2, dark(wall, 0.84), 0.5, 311);
    p.box(0.34, 0.03, 0.34, tx, y0 + th, tz, C.darkstone);
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { p.box(0.05, 0.06, 0.04, tx - 0.12 + k * 0.08, y0 + th + 0.03, tz + s * 0.15, wall); p.box(0.04, 0.06, 0.05, tx + s * 0.15, y0 + th + 0.03, tz - 0.12 + k * 0.08, wall); }
    for (const y of [0.22, 0.48]) p.box(0.05, 0.08, 0.01, tx, y, tz + 0.152, C.win, 0, true);
    p.box(0.1, 0.16, 0.012, tx, y0, tz + 0.152, 0x4a3a2e);
    p.box(0.05, 0.06, 0.05, tx + 0.1, y0 + th + 0.03, tz - 0.1, 0xffe2a0, 0, true);
    flag(tx, y0 + th + 0.03, tz, 0.34, 0xb8342c, 0x3c3c40);
    // caserne : longue bâtisse de brique, toit d'ardoise, fenêtres et porte, cheminée qui fume
    const bx = 0.36, bz = -0.5, W = 0.62, D = 0.3, BH = 0.26;
    p.box(W, BH, D, bx, y0, bz, C.brick);
    stones(p, bx, bz + D / 2, W, y0, y0 + BH, 0, dark(C.brick, 0.86), 0.45, 312);
    for (const s of [-1, 1]) quoins(p, bx + s * W / 2, bz + D / 2, y0, y0 + BH, s, 1);
    roof(p, bx, y0 + BH, bz, { w: W, d: D, h: 0.16, color: C.slate, wall: C.brick, courses: true });
    windows(p, [bx - 0.22, bx - 0.1, bx + 0.12, bx + 0.24], 0.1, bz + D / 2 + 0.006, 0.06, 0.08, C.cream);
    p.box(0.08, 0.17, 0.012, bx + 0.01, y0, bz + D / 2 + 0.004, 0x3f5a4a);
    p.box(0.06, 0.16, 0.06, bx + 0.2, y0 + BH + 0.06, bz - 0.06, 0xa85e50); smoke(bx + 0.2, y0 + BH + 0.25, bz - 0.06, 0);
    // voie de wagonnets de la porte vers la grotte, deux wagonnets de minerai, butoir
    for (let z = -0.28; z <= 0.92; z += 0.07) p.box(0.13, 0.01, 0.028, 0, y0, z, C.darkwood);
    for (const s of [-1, 1]) p.box(0.012, 0.014, 1.2, s * 0.045, y0 + 0.01, 0.32, C.metal);
    p.box(0.12, 0.06, 0.04, 0, y0, -0.3, 0xb8342c);
    for (const z of [0.0, 0.2]) {
      p.box(0.1, 0.07, 0.13, 0, y0 + 0.03, z, 0x6f5640);
      for (const s of [-1, 1]) for (const t of [-1, 1]) p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 8).rotateZ(Math.PI / 2), s * 0.053, y0 + 0.025, z + t * 0.045, C.metal);
      for (let k = 0; k < 5; k++) p.sphere(0.024, Math.sin(k * 2.1) * 0.03, y0 + 0.1 + (k > 2 ? 0.02 : 0), z + Math.cos(k * 1.7) * 0.04, k % 2 ? C.darkstone : 0xb87a4a, 0, 0.8);
    }
    // table aux plans sous un auvent de toile, réverbères, caisses et tonneaux
    const mx = -0.46, mz = 0.2;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.012, 0.3, 0.012, mx + dx * 0.16, y0, mz + dz * 0.12, C.darkwood);
    p.add(new THREE.BoxGeometry(0.38, 0.008, 0.3), mx, y0 + 0.3, mz, 0xd8c8a0, 0, false, 0, 0.12);
    p.box(0.24, 0.02, 0.15, mx, y0 + 0.12, mz, C.wood); p.box(0.18, 0.004, 0.11, mx, y0 + 0.14, mz, C.cream, -0.1);
    for (const x of [mx - 0.08, mx + 0.08]) p.box(0.01, 0.12, 0.01, x, y0, mz, C.darkwood);
    lamp(0.5, 0.3, 0.38); lamp(-0.6, -0.12, 0.38);
    crate(0.52, 0.56, 1, 0.2); crate(0.64, 0.66, 0.9, -0.3); crate(0.58, 0.6, 0.8, 0.5, y0 + 0.09); barrel(0.36, 0.66); barrel(0.28, 0.6); barrel(-0.62, 0.62);
  } else {
    // clôture grillagée sur poteaux d'acier, barbelés ; portail coulissant ouvert, guérite et barrière levée
    const post = (x: number, z: number) => p.cyl(0.008, 0.01, 0.36, 5, x, y0, z, 0x6a7078);
    const mesh = (x: number, z: number, len: number, ry: number) => { p.box(len, 0.3, 0.004, x, y0 + 0.03, z, 0xc8ccd0, ry); for (const y of [0.35, 0.38]) p.box(len, 0.004, 0.006, x, y0 + y, z, 0x3c3c40, ry); };
    for (let t = -R; t <= R + 1e-6; t += 0.205) { post(t, -R); post(-R, t); post(R, t); if (Math.abs(t) > 0.25) post(t, R); }
    mesh(0, -R, 2 * R, 0); for (const s of [-1, 1]) { mesh(s * R, 0, 2 * R, Math.PI / 2); mesh(s * (R + 0.26) / 2, R, R - 0.26, 0); }
    p.box(0.5, 0.3, 0.006, 0.52, y0 + 0.03, R + 0.03, 0xb0b6bc); p.box(0.5, 0.02, 0.01, 0.52, y0 + 0.33, R + 0.03, 0x6a7078);
    p.box(0.16, 0.26, 0.16, -0.38, y0, R - 0.14, C.white); p.box(0.18, 0.025, 0.18, -0.38, y0 + 0.26, R - 0.14, 0x5d6878);
    p.box(0.12, 0.07, 0.006, -0.38, y0 + 0.15, R - 0.059, C.glass, 0, true);
    p.box(0.03, 0.12, 0.03, -0.26, y0, R + 0.02, 0x3c3c40);
    p.add(new THREE.BoxGeometry(0.02, 0.4, 0.02).translate(0, 0.2, 0), -0.26, y0 + 0.11, R + 0.02, 0xd84a3e, 0, false, -0.25);
    for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.022, 0.05, 0.022), -0.26 - Math.sin(0.25) * (0.06 + k * 0.13), y0 + 0.11 + Math.cos(0.25) * (0.06 + k * 0.13), R + 0.02, C.white, 0, false, -0.25);
    // sacs de sable devant la guérite
    for (let k = 0; k < 7; k++) p.sphere(0.04, -0.62 + (k % 4) * 0.075 + (k >= 4 ? 0.035 : 0), y0 + 0.02 + (k >= 4 ? 0.04 : 0), R - 0.3, 0xc8b48a, 0, 0.55);
    // conteneurs empilés, nervurés
    const box3 = (x: number, y: number, z: number, c: number, ry = 0) => {
      p.box(0.5, 0.2, 0.2, x, y, z, c, ry);
      for (let k = 0; k < 9; k++) { const u = -0.22 + k * 0.055; for (const s of [-1, 1]) p.box(0.012, 0.19, 0.008, x + Math.cos(ry) * u - Math.sin(ry) * s * 0.102, y + 0.005, z - Math.sin(ry) * u - Math.cos(ry) * s * 0.102, dark(c, 0.82), ry); }
    };
    box3(0.44, y0, -0.62, 0xd8743a); box3(0.44, y0, -0.38, 0x3a6ab8); box3(0.44, y0 + 0.2, -0.5, 0x4a8a5a, 0.1);
    // préfabriqués blancs à bandeau vitré, antenne au feu rouge
    for (const [x, z] of [[-0.42, -0.62], [-0.42, -0.3]]) {
      p.box(0.5, 0.2, 0.22, x, y0, z, 0xeceae4); p.box(0.52, 0.02, 0.24, x, y0 + 0.2, z, 0x8a9098);
      p.box(0.4, 0.05, 0.006, x, y0 + 0.11, z + 0.112, C.glass, 0, true); p.box(0.06, 0.15, 0.006, x + 0.18, y0, z + 0.113, 0x5a6470);
    }
    p.box(0.01, 0.7, 0.01, -0.74, y0, -0.74, 0x8a9098); for (let y = 0.1; y < 0.7; y += 0.1) p.box(0.06, 0.006, 0.006, -0.74, y0 + y, -0.74, 0x8a9098);
    p.sphere(0.018, -0.74, y0 + 0.72, -0.74, 0xff5a3a);
    p.box(0.022, 0.022, 0.022, -0.74, y0 + 0.71, -0.74, 0xff4a3a, 0, true);
    // projecteurs sur mâts, braqués vers l'entrée
    for (const [x, z, ry] of [[0.72, 0.3, -2.2], [-0.12, -0.72, 0.4]]) {
      p.cyl(0.012, 0.016, 0.8, 6, x, y0, z, 0x6a7078);
      p.box(0.14, 0.02, 0.03, x, y0 + 0.8, z, 0x3c3c40, ry);
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.05, 0.04, 0.03), x + Math.cos(ry) * s * 0.045, y0 + 0.8, z - Math.sin(ry) * s * 0.045, 0xfff4d0, ry, true, 0, 0.5);
    }
    // jeep, table aux plans et caisses
    const jx = 0.3, jz = 0.36;
    p.box(0.28, 0.08, 0.15, jx, y0 + 0.04, jz, 0x5a6a44); p.box(0.12, 0.06, 0.14, jx - 0.03, y0 + 0.12, jz, 0x4a5a38);
    p.box(0.006, 0.05, 0.13, jx + 0.04, y0 + 0.13, jz, C.glass);
    for (const x of [-0.09, 0.09]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateX(Math.PI / 2), jx + x, y0 + 0.035, jz + s * 0.075, 0x2a2a2a);
    p.cyl(0.035, 0.035, 0.03, 10, jx - 0.15, y0 + 0.06, jz, 0x2a2a2a, false, 0);
    p.box(0.24, 0.02, 0.15, -0.3, y0 + 0.12, 0.2, 0x8a9098); for (const s of [-1, 1]) p.box(0.012, 0.12, 0.12, -0.3 + s * 0.1, y0, 0.2, 0x6a7078);
    p.box(0.18, 0.004, 0.11, -0.3, y0 + 0.14, 0.2, C.cream, 0.1);
    crate(0.6, 0.58, 1, 0.2); crate(0.7, 0.66, 0.9, -0.3); crate(-0.64, 0.24, 1, 0.1);
    flag(0.08, y0, -0.2, 0.62, 0x3a6ab8, 0xc8ccd0);
  }
}

/** Grumes empilées en pyramide (couchées le long de x), sections claires aux bouts */
function logPile(p: Parts, x: number, z: number, n: number, len: number, ry = 0) {
  const r = 0.035;
  let k = 0;
  for (let row = 0; row < n; row++)
    for (let i = 0; i < n - row; i++, k++) {
      const u = (i - (n - row - 1) / 2) * r * 2.05, y = r + row * r * 1.75;
      const ox = Math.sin(ry) * u, oz = Math.cos(ry) * u;
      p.add(new THREE.CylinderGeometry(r, r, len, 7).rotateZ(Math.PI / 2), x + ox, y, z + oz, dark(0x7a5636, 0.9 + hash2(k, 1, 77) * 0.2), ry);
      for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.004, 7).rotateZ(Math.PI / 2), x + ox + Math.cos(ry) * s * len / 2, y, z + oz - Math.sin(ry) * s * len / 2, 0xd8b88a, ry);
    }
}

/**
 * Bûcherons (en forêt) : abri de rondins et billot à la Préhistoire, camp et cabane de planches, scierie à colombages et
 * sa grande scie, scierie à vapeur de brique qui fume, scierie mécanique au toit de tôle ; toujours des grumes et du bois débité
 */
function lumber(p: Parts, age: number) {
  p.cyl(0.46, 0.47, 0.012, 14, 0, 0, 0, 0x9cae6c);
  for (let i = 0; i < 14; i++) p.cyl(0.012, 0.016, 0.004, 5, -0.4 + hash2(i, 2, 78) * 0.8, 0.012, -0.4 + hash2(i, 3, 78) * 0.8, 0xc8a878);
  // souches et billot à la hache
  for (const [x, z] of [[0.3, 0.3], [-0.34, 0.28], [0.36, -0.06]]) { p.cyl(0.05, 0.06, 0.06, 8, x, 0.012, z, 0x7a5636); p.cyl(0.046, 0.046, 0.004, 8, x, 0.072, z, 0xd8b88a); }
  p.cyl(0.06, 0.065, 0.1, 8, 0.12, 0.012, 0.28, 0x7a5636); p.cyl(0.056, 0.056, 0.004, 8, 0.12, 0.112, 0.28, 0xd8b88a);
  p.add(new THREE.BoxGeometry(0.012, 0.14, 0.012), 0.14, 0.17, 0.28, C.darkwood, 0, false, -0.5);
  p.add(new THREE.BoxGeometry(0.05, 0.035, 0.008), 0.11, 0.115, 0.28, C.metal, 0, false, -0.5);
  if (age <= 1) {
    // appentis de rondins couvert de branchages (puis de planches), grumes, fagots
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.02, 0.022, 0.42, 6).translate(0, 0.21, 0), s * 0.2, 0.012, -0.24, C.darkwood, 0, false, 0, -0.35);
    p.add(new THREE.BoxGeometry(0.5, 0.02, 0.32), 0, 0.3, -0.18, age === 0 ? 0x6f8a4a : C.wood, 0, false, 0, -0.75);
    if (age === 1) for (let k = 0; k < 6; k++) p.add(new THREE.BoxGeometry(0.5, 0.006, 0.05).translate(0, 0.012, -0.12 + k * 0.05), 0, 0.3, -0.18, dark(C.wood, k % 2 ? 0.85 : 1), 0, false, 0, -0.75);
    logPile(p, -0.08, -0.22, 3, 0.36);
    for (let k = 0; k < 3; k++) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6).rotateZ(Math.PI / 2), -0.3, 0.04 + k * 0.035, 0.05 + (k % 2) * 0.03, 0x8a6a3a, 0.5);
  } else if (age === 2) {
    // scierie à colombages : grande scie de long sur son chevalet, planches empilées
    p.box(0.46, 0.26, 0.28, -0.1, 0.012, -0.24, C.cream);
    timbers(p, -0.1, -0.1, 0.46, 0.012, 0.272, 0, 5, (i) => i % 2 === 1);
    roof(p, -0.1, 0.272, -0.24, { w: 0.46, d: 0.28, h: 0.16, color: 0x8a5a44, wall: C.cream, courses: true });
    p.box(0.1, 0.16, 0.012, -0.1, 0.012, -0.096, C.darkwood);
    for (const s of [-1, 1]) p.box(0.02, 0.14, 0.02, 0.22 + s * 0.08, 0.012, 0.08, C.darkwood);
    p.box(0.2, 0.025, 0.06, 0.22, 0.15, 0.08, C.wood);
    p.box(0.006, 0.18, 0.05, 0.22, 0.12, 0.08, C.metal);
    for (let k = 0; k < 4; k++) p.box(0.26, 0.014, 0.08, -0.2, 0.012 + k * 0.016, 0.12, dark(0xd8b88a, k % 2 ? 0.9 : 1), 0.1);
    logPile(p, 0.26, -0.22, 3, 0.3, Math.PI / 2);
  } else if (age === 3) {
    // scierie à vapeur : halle de brique, cheminée qui fume, scie circulaire, rail de chariot
    p.box(0.48, 0.28, 0.3, -0.08, 0.012, -0.22, C.brick);
    stones(p, -0.08, -0.07, 0.48, 0.012, 0.29, 0, dark(C.brick, 0.86), 0.45, 401);
    roof(p, -0.08, 0.292, -0.22, { w: 0.48, d: 0.3, h: 0.14, color: C.slate, wall: C.brick, courses: true });
    windows(p, [-0.22, 0.06], 0.1, -0.065, 0.07, 0.08, C.cream);
    p.box(0.12, 0.17, 0.012, -0.08, 0.012, -0.066, 0x3f5a4a);
    p.cyl(0.035, 0.045, 0.5, 8, 0.12, 0.3, -0.3, C.darkbrick); smoke(0.12, 0.84, -0.3, 2);
    p.box(0.26, 0.08, 0.1, 0.18, 0.012, 0.12, C.darkwood);
    p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 12).rotateX(Math.PI / 2), 0.18, 0.11, 0.12, C.metal);
    logPile(p, -0.26, 0.14, 3, 0.3);
    for (let k = 0; k < 4; k++) p.box(0.24, 0.014, 0.08, 0.26, 0.012 + k * 0.016, -0.02, dark(0xd8b88a, k % 2 ? 0.9 : 1));
  } else {
    // scierie mécanique : hangar à toit de tôle ondulée, grue à grumes, empilements bien rangés
    p.box(0.5, 0.26, 0.3, -0.08, 0.012, -0.22, 0x8a9aa6);
    for (let k = 0; k < 9; k++) p.box(0.012, 0.26, 0.302, -0.32 + k * 0.06, 0.012, -0.22, 0x7a8a96);
    p.add(new THREE.BoxGeometry(0.56, 0.02, 0.38), -0.08, 0.3, -0.22, 0x5d6878, 0, false, 0, -0.12);
    p.box(0.2, 0.18, 0.012, -0.08, 0.012, -0.068, 0x3c4650);
    p.cyl(0.015, 0.02, 0.46, 6, 0.3, 0.012, 0.0, 0xd8b84a);
    p.add(new THREE.BoxGeometry(0.4, 0.02, 0.02), 0.16, 0.46, 0.0, 0xd8b84a, 0.6);
    p.box(0.004, 0.14, 0.004, 0.0, 0.32, 0.1, 0x2a2a2a);
    logPile(p, -0.24, 0.16, 4, 0.34);
    logPile(p, 0.2, 0.22, 3, 0.3, Math.PI / 2);
  }
}

/**
 * Carrière (près des rochers, dans la montagne) : tas de pierres et pic à la Préhistoire ; front de taille en gradins,
 * blocs équarris et chèvre de levage ; treuil à vapeur, rails et wagonnet ; engins jaunes et tas de gravier ensuite
 */
function quarry(p: Parts, age: number) {
  const rock = 0xa8a296, cut = 0xc8c2b4;
  p.cyl(0.46, 0.47, 0.012, 14, 0, 0, 0, 0xb0a890);
  // front de taille : rochers anguleux au fond, entaillés de gradins aux arêtes nettes (plus nombreux avec les âges)
  for (let i = 0; i < 6; i++) {
    const h = (k: number) => hash2(i, k, 402);
    p.add(new THREE.DodecahedronGeometry(0.13 + h(1) * 0.05, 0).scale(1, 0.9 + h(2) * 0.5, 0.75), -0.36 + i * 0.145, 0.1 + h(3) * 0.06, -0.33 + h(4) * 0.05, dark(rock, 0.82 + h(5) * 0.16), h(6) * 3);
  }
  const steps = age === 0 ? 1 : age <= 2 ? 2 : 3;
  for (let k = 0; k < steps; k++) p.box(0.56 - k * 0.14, 0.1, 0.14, -0.04 + k * 0.03, 0.012 + k * 0.1, -0.2 - k * 0.05, dark(cut, 0.98 - k * 0.05));
  stones(p, -0.04, -0.13, 0.56, 0.012, 0.11, 0, dark(cut, 0.86), 0.5, 402);
  // blocs taillés, éclats
  for (const [x, z, s] of [[-0.28, 0.12, 1], [-0.16, 0.2, 0.8], [-0.22, 0.04, 0.7]]) p.box(0.1 * s, 0.07 * s, 0.08 * s, x, 0.012, z, cut, x * 3);
  if (age >= 1) p.box(0.09, 0.06, 0.07, -0.21, 0.08, 0.13, cut, 0.4);
  for (let i = 0; i < 10; i++) p.add(new THREE.IcosahedronGeometry(0.018 + hash2(i, 4, 79) * 0.015, 0), -0.4 + hash2(i, 5, 79) * 0.8, 0.02, -0.05 + hash2(i, 6, 79) * 0.45, dark(rock, 0.8 + hash2(i, 7, 79) * 0.2));
  if (age === 0) {
    p.add(new THREE.BoxGeometry(0.012, 0.16, 0.012), 0.2, 0.07, 0.2, C.darkwood, 0, false, 0.8);
    p.box(0.06, 0.02, 0.014, 0.25, 0.13, 0.2, C.darkstone, 0, false, 0.8);
    return;
  }
  if (age <= 2) {
    // chèvre de levage : trois perches, poulie, bloc suspendu
    for (const a of [0, 2.1, 4.2]) p.add(new THREE.CylinderGeometry(0.012, 0.014, 0.5, 5).translate(0, 0.25, 0), 0.2 + Math.cos(a) * 0.1, 0.012, 0.12 + Math.sin(a) * 0.1, C.darkwood, 0, false, Math.cos(a) * 0.2, -Math.sin(a) * 0.2);
    p.box(0.004, 0.2, 0.004, 0.2, 0.25, 0.12, 0x5a4a3a);
    p.box(0.08, 0.06, 0.07, 0.2, 0.2, 0.12, cut);
  } else if (age === 3) {
    // treuil à vapeur, rails et wagonnet de pierres
    p.box(0.14, 0.12, 0.1, 0.26, 0.012, 0.16, 0x3c3c40); p.cyl(0.03, 0.03, 0.14, 8, 0.3, 0.13, 0.16, 0x3c3c40); smoke(0.3, 0.3, 0.16, 0);
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10).rotateX(Math.PI / 2), 0.2, 0.13, 0.16, 0xb83a2e);
    for (let z = -0.12; z <= 0.4; z += 0.07) p.box(0.14, 0.01, 0.024, 0.0, 0.012, z, C.darkwood);
    for (const s of [-1, 1]) p.box(0.01, 0.012, 0.54, s * 0.05, 0.02, 0.14, C.metal);
    p.box(0.1, 0.06, 0.12, 0.0, 0.035, 0.2, 0x6f5640);
    for (let k = 0; k < 4; k++) p.box(0.04, 0.03, 0.035, -0.02 + (k % 2) * 0.04, 0.095, 0.17 + (k > 1 ? 0.05 : 0), cut);
  } else {
    // engins jaunes : pelleteuse au pied du front, tombereau chargé, trémie et tapis sur pieds vers le tas de gravier,
    // baraque de chantier, cônes et barrière
    const yel = 0xf2c84b, dk = 0x2a2a2e;
    // pelleteuse : chenilles, tourelle, cabine vitrée, flèche, bras et godet tendus vers les gradins
    for (const s of [-1, 1]) p.box(0.17, 0.045, 0.045, 0.28, 0.012, -0.01 + s * 0.05, dk);
    p.box(0.12, 0.06, 0.11, 0.28, 0.057, -0.01, yel); p.box(0.05, 0.06, 0.05, 0.31, 0.117, 0.01, 0x9fd0e4);
    p.box(0.06, 0.03, 0.08, 0.24, 0.117, -0.01, 0x5d6878);
    p.add(new THREE.BoxGeometry(0.03, 0.03, 0.2).translate(0, 0, -0.1), 0.27, 0.12, -0.04, yel, 0, false, 0, 0.55);
    p.add(new THREE.BoxGeometry(0.024, 0.024, 0.13).translate(0, 0, -0.065), 0.27, 0.224, -0.21, yel, 0, false, 0, -0.95);
    p.box(0.07, 0.045, 0.05, 0.27, 0.11, -0.3, 0x5d6878);
    // tombereau : benne pleine, cabine, grosses roues
    p.box(0.22, 0.04, 0.11, 0.26, 0.04, 0.3, dk);
    p.box(0.14, 0.07, 0.12, 0.22, 0.08, 0.3, yel); p.sphere(0.06, 0.22, 0.14, 0.3, 0x9a9488, 0, 0.6);
    p.box(0.06, 0.08, 0.1, 0.35, 0.08, 0.3, yel); p.box(0.004, 0.04, 0.08, 0.382, 0.12, 0.3, 0x9fd0e4);
    for (const x of [0.18, 0.34]) for (const sd of [-1, 1]) p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10).rotateX(Math.PI / 2), x, 0.04, 0.3 + sd * 0.065, dk);
    // trémie, tapis roulant sur ses pieds jusqu'au-dessus du tas de gravier
    p.box(0.1, 0.07, 0.1, 0.04, 0.012, 0.3, 0x5d6878); p.box(0.12, 0.04, 0.12, 0.04, 0.082, 0.3, yel);
    p.add(new THREE.BoxGeometry(0.38, 0.022, 0.06), -0.15, 0.16, 0.3, 0x3c3c3c, 0, false, -0.4);
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.38, 0.012, 0.008), -0.15, 0.175, 0.3 + s * 0.034, yel, 0, false, -0.4);
    for (const [x, h] of [[-0.06, 0.11], [-0.2, 0.17]] as [number, number][]) for (const s of [-1, 1]) p.box(0.01, h, 0.01, x, 0.012, 0.3 + s * 0.03, yel);
    p.cone(0.15, 0.15, 8, -0.33, 0.012, 0.3, 0xa8a090); p.cone(0.09, 0.08, 7, -0.38, 0.012, 0.14, 0x8a8478);
    // baraque de chantier, sa fenêtre éclairée et sa porte
    p.box(0.09, 0.075, 0.15, -0.39, 0.012, -0.06, C.white); p.box(0.1, 0.012, 0.16, -0.39, 0.087, -0.06, 0x5d6878);
    p.box(0.004, 0.03, 0.05, -0.344, 0.05, -0.09, 0xffe2a0, 0, true); p.box(0.004, 0.06, 0.03, -0.344, 0.012, -0.01, 0x3c4a8a);
    // cônes et barrière rouge et blanc
    for (const [x, z] of [[0.08, 0.06], [0.14, 0.12], [0.02, 0.14]]) { p.cone(0.018, 0.045, 6, x, 0.012, z, 0xf28a3c); p.cyl(0.014, 0.014, 0.006, 6, x, 0.027, z, C.white); }
    for (let k = 0; k < 4; k++) p.box(0.04, 0.02, 0.012, 0.32 + k * 0.035, 0.07, 0.44, k % 2 ? C.white : 0xd84a3e);
    for (const x of [0.31, 0.45]) p.box(0.01, 0.07, 0.01, x, 0.012, 0.44, 0x5d6878);
  }
}

/** Voie d'un quai (le long de x, en z = 0.34, comme à la gare) : ballast, traverses, rails ; `y` : dessus de la dalle */
function platformTrack(p: Parts, y: number, modern: boolean) {
  p.box(1.9, 0.012, 0.36, 0, y - 0.006, 0.34, 0xa39a8e);
  for (let x = -0.92; x <= 0.92; x += 0.1) p.box(0.04, 0.016, 0.24, x, y, 0.34, modern ? 0xb8b4ac : C.darkwood);
  for (const z of [0.28, 0.4]) p.box(1.9, 0.02, 0.014, 0, y + 0.016, z, C.metal);
}

/** Quai d'en face, de l'autre côté de la voie : bord peint, abri, bancs tournés vers la voie, réverbères */
function farPlatform(p: Parts, modern: boolean) {
  const steel = 0x5d6878;
  p.box(1.9, 0.08, 0.32, 0, 0.03, 0.74, modern ? 0xc8c4bc : C.stone);
  p.box(1.9, 0.004, 0.03, 0, 0.11, 0.6, modern ? 0xf2c84b : 0xece4d4);
  if (modern) {
    p.box(0.5, 0.012, 0.2, 0.3, 0.33, 0.78, 0xdde4ea);
    for (const x of [0.07, 0.53]) p.box(0.012, 0.22, 0.012, x, 0.11, 0.86, steel);
    p.box(0.46, 0.18, 0.006, 0.3, 0.13, 0.875, C.glass, 0, true);
  } else {
    for (const x of [0.08, 0.52]) p.cyl(0.01, 0.012, 0.22, 6, x, 0.11, 0.82, 0x3f6a4a);
    p.add(new THREE.BoxGeometry(0.54, 0.014, 0.22), 0.3, 0.34, 0.78, 0x8a5a44, 0, false, 0, -0.18);
  }
  for (const x of [0.2, 0.42]) { p.box(0.14, 0.02, 0.045, x, 0.15, 0.82, modern ? 0x8a96a2 : C.wood); p.box(0.14, 0.05, 0.01, x, 0.17, 0.845, modern ? 0x8a96a2 : C.wood); }
  for (const x of [-0.85, -0.3, 0.85]) { p.cyl(0.007, 0.009, 0.28, 5, x, 0.11, 0.8, modern ? steel : 0x3c4a44); p.box(0.035, 0.035, 0.035, x, 0.39, 0.8, 0xffe2a0, 0, true); }
  for (const x of [-0.65, -0.48]) { p.box(0.1, 0.06, 0.1, x, 0.11, 0.8, 0x8a8a8a); p.sphere(0.06, x, 0.22, 0.8, C.darkgreen, 1); }
  p.box(0.01, 0.2, 0.01, -0.1, 0.11, 0.86, steel); p.box(0.16, 0.05, 0.012, -0.1, 0.29, 0.86, modern ? 0x2e3c48 : C.white);
  if (modern) p.box(0.13, 0.026, 0.004, -0.1, 0.302, 0.853, 0xffb84a, 0, true); else p.box(0.12, 0.018, 0.014, -0.1, 0.305, 0.86, 0x3f5a4a);
}

/**
 * Petite gare : à l'âge industriel, bâtiment des voyageurs en brique au fond, quai sous un auvent de bois sur consoles de
 * fonte, horloge, enseigne, bancs, réverbères, chariot à bagages ; gare moderne ensuite : quai de béton bordé de jaune, abri
 * de verre et d'acier, écran des départs, distributeur, vélos. La voie passe devant le quai, comme à la gare
 */
function station(p: Parts, age: number) {
  const modern = age >= 4;
  p.box(1.9, 0.03, 1.9, 0, 0, 0, modern ? 0xd4d0c8 : 0xd9d2c4);
  platformTrack(p, 0.03, modern);
  farPlatform(p, modern);
  // quai, bord peint
  p.box(1.9, 0.08, 0.38, 0, 0.03, -0.03, modern ? 0xc8c4bc : C.stone);
  p.box(1.9, 0.004, 0.04, 0, 0.11, 0.14, modern ? 0xf2c84b : 0xece4d4);
  if (!modern) {
    const brick = 0xb4685c, bz = -0.58, W = 1.1, D = 0.42, H = 0.4, zf = bz + D / 2;
    p.box(W, H, D, -0.2, 0.03, bz, brick);
    stones(p, -0.2, zf, W, 0.03, H + 0.03, 0, dark(brick, 0.86), 0.45, 390);
    for (const x of [-0.2 - W / 2, -0.2 + W / 2]) quoins(p, x, zf, 0.03, H + 0.03, x < -0.2 ? -1 : 1, 1);
    for (const y of [0.03, H + 0.02]) p.box(W + 0.02, 0.025, D + 0.02, -0.2, y, bz, C.cream);
    roof(p, -0.2, H + 0.03, bz, { w: W, d: D, h: 0.2, color: C.slate, wall: brick, courses: true });
    p.cyl(0.03, 0.035, 0.16, 6, 0.15, H + 0.12, bz - 0.08, C.darkbrick);
    for (const x of [-0.6, -0.42, 0.02, 0.2]) { windows(p, [x], 0.1, zf + 0.01, 0.08, 0.14, C.cream); p.gable(0.014, 0.035, 0.1, x, 0.254, zf + 0.005, C.cream, Math.PI / 2); }
    p.box(0.14, 0.24, 0.02, -0.2, 0.03, zf + 0.01, 0x3f5a4a); p.gable(0.02, 0.05, 0.16, -0.2, 0.27, zf + 0.01, C.cream, Math.PI / 2);
    // horloge et enseigne au-dessus de la porte
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14).rotateX(Math.PI / 2), -0.2, 0.36, zf + 0.02, C.white);
    p.box(0.004, 0.035, 0.004, -0.2, 0.36, zf + 0.028, 0x2a2a2a); p.box(0.028, 0.004, 0.004, -0.19, 0.36, zf + 0.028, 0x2a2a2a);
    p.box(0.3, 0.05, 0.012, -0.2, 0.3, zf + 0.02, 0x3f5a4a); for (let k = 0; k < 5; k++) p.box(0.03, 0.022, 0.004, -0.28 + k * 0.04, 0.314, zf + 0.027, C.gold);
    // auvent de bois sur consoles de fonte, lambrequin découpé
    for (let i = 0; i < 4; i++) { const x = -0.72 + i * 0.48; p.cyl(0.012, 0.016, 0.3, 6, x, 0.11, -0.02, 0x3f6a4a); p.add(new THREE.BoxGeometry(0.1, 0.012, 0.012), x, 0.39, 0.02, 0x3f6a4a, 0, false, 0.6); }
    p.add(new THREE.BoxGeometry(1.7, 0.016, 0.42), 0, 0.42, -0.06, 0x8a5a44, 0, false, 0, 0.14);
    for (let k = 0; k < 17; k++) p.add(new THREE.ConeGeometry(0.03, 0.05, 3).rotateX(Math.PI), -0.8 + k * 0.1, 0.38, 0.15, C.cream);
    // bancs, réverbères, chariot à bagages, bacs de fleurs, panneau du quai
    for (const x of [-0.45, 0.35]) { p.box(0.16, 0.02, 0.05, x, 0.15, -0.14, C.wood); for (const d of [-0.06, 0.06]) p.box(0.016, 0.04, 0.04, x + d, 0.11, -0.14, 0x3c4a44); }
    for (const x of [-0.9, 0.9]) { p.cyl(0.007, 0.009, 0.3, 5, x, 0.11, 0.02, 0x3c4a44); p.box(0.035, 0.04, 0.035, x, 0.41, 0.02, 0xffe2a0, 0, true); }
    p.box(0.12, 0.03, 0.07, 0.65, 0.15, -0.12, C.wood); for (const [x, c] of [[0.62, 0x8a5a3a], [0.69, 0x4a6aa8]] as [number, number][]) p.box(0.05, 0.035, 0.035, x, 0.18, -0.12, c);
    for (const x of [-0.85, 0.55]) { p.box(0.14, 0.04, 0.05, x, 0.03, zf + 0.1, C.wood); for (let k = 0; k < 4; k++) p.sphere(0.018, x - 0.045 + k * 0.03, 0.08, zf + 0.1, [C.pink, C.butter, 0xd84a3e, C.lav][k], 0, 0.8); }
    p.box(0.01, 0.2, 0.01, 0.55, 0.11, 0.05, 0x3c4a44); p.box(0.18, 0.06, 0.012, 0.55, 0.3, 0.05, C.white); p.box(0.14, 0.02, 0.014, 0.55, 0.32, 0.05, 0x3f5a4a);
    // clôture de l'arrière-cour
    for (let x = 0.45; x <= 0.9; x += 0.09) p.box(0.012, 0.1, 0.012, x, 0.03, -0.8, C.white);
    p.box(0.48, 0.012, 0.01, 0.67, 0.1, -0.8, C.white);
  } else {
    // bâtiment de verre et de béton, auvent d'acier sur poteaux, écran des départs, distributeur, vélos
    p.box(1.1, 0.34, 0.44, -0.25, 0.03, -0.6, 0xe6e4de);
    p.box(1.0, 0.22, 0.012, -0.25, 0.08, -0.375, C.glass, 0, true);
    for (let k = 0; k < 6; k++) p.box(0.012, 0.22, 0.016, -0.73 + k * 0.19, 0.08, -0.37, 0x5d6878);
    p.box(1.16, 0.03, 0.5, -0.25, 0.37, -0.6, 0x5d6878);
    p.box(0.3, 0.06, 0.014, -0.25, 0.3, -0.37, 0x2e3c48); p.box(0.24, 0.02, 0.004, -0.25, 0.32, -0.36, 0x9de0ff, 0, true);
    for (let i = 0; i < 5; i++) p.cyl(0.012, 0.012, 0.32, 6, -0.8 + i * 0.4, 0.11, -0.05, 0x8a96a2);
    p.box(1.8, 0.016, 0.36, 0, 0.43, -0.03, 0xdde4ea);
    p.box(1.8, 0.02, 0.02, 0, 0.42, 0.14, 0xf2c84b);
    p.box(0.012, 0.16, 0.012, 0.3, 0.27, -0.05, 0x5d6878); p.box(0.2, 0.07, 0.014, 0.3, 0.32, -0.05, 0x2e3c48); p.box(0.16, 0.04, 0.004, 0.3, 0.33, -0.04, 0xffb84a, 0, true);
    p.box(0.07, 0.16, 0.05, 0.62, 0.11, -0.14, 0xd8553c); p.box(0.04, 0.03, 0.006, 0.62, 0.21, -0.112, 0x9de0ff, 0, true);
    for (const x of [-0.5, 0.0]) { p.box(0.2, 0.02, 0.05, x, 0.15, -0.14, 0x8a96a2); p.box(0.2, 0.06, 0.012, x, 0.17, -0.165, 0x8a96a2); }
    for (let k = 0; k < 3; k++) { const x = 0.55 + k * 0.12; for (const d of [-0.04, 0.04]) p.add(new THREE.TorusGeometry(0.03, 0.006, 4, 10).rotateY(Math.PI / 2), x, 0.065, -0.78 + d, 0x3c3c40); p.box(0.006, 0.006, 0.08, x, 0.08, -0.78, [0xd8553c, 0x3c7fd8, 0x4fa860][k]); }
  }
}

function observatory(p: Parts) {
  p.box(0.98, 0.012, 0.98, 0, 0, 0, 0xe4e0d8);
  p.cyl(0.3, 0.32, 0.06, 16, 0, 0.012, -0.08, C.stone);
  p.cyl(0.26, 0.26, 0.3, 16, 0, 0.07, -0.08, C.white);
  p.cyl(0.275, 0.275, 0.02, 16, 0, 0.36, -0.08, C.metal);
  windows(p, [0], 0.16, 0.18, 0.06, 0.08, C.metal);
  const d = spinner([0, 0.37, -0.08], [0, 1, 0], 0.08);
  d.add(new THREE.SphereGeometry(0.26, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0, 0xc8ced6);
  for (let k = 0; k < 6; k++) {
    const e = 0.12 + k * 0.25;
    d.add(new THREE.BoxGeometry(0.08, 0.075, 0.02).rotateX(-e), 0, 0.262 * Math.sin(e), 0.262 * Math.cos(e), 0x2a2e38);
  }
  d.add(new THREE.CylinderGeometry(0.032, 0.04, 0.42, 8).rotateX(Math.PI / 2 - 0.75), 0, 0.2 * Math.sin(0.75), 0.2 * Math.cos(0.75), C.white);
  d.add(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 8).rotateX(Math.PI / 2 - 0.75), 0, 0.41 * Math.sin(0.75), 0.41 * Math.cos(0.75), 0x2a2e38);
  // annexe, antenne parabolique, banc, allée
  p.box(0.3, 0.2, 0.22, 0.28, 0.012, 0.26, C.white); p.box(0.32, 0.02, 0.24, 0.28, 0.21, 0.26, C.metal);
  p.box(0.07, 0.14, 0.012, 0.2, 0.012, 0.372, 0x3f5a6a); windows(p, [0.34], 0.08, 0.372, 0.06, 0.06, C.metal);
  p.cyl(0.008, 0.01, 0.12, 5, 0.28, 0.23, 0.22, C.metal);
  p.add(new THREE.SphereGeometry(0.07, 10, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-0.9), 0.28, 0.36, 0.24, C.white);
  p.box(0.12, 0.004, 0.36, -0.1, 0.014, 0.3, 0xd2ccc0);
  p.box(0.16, 0.025, 0.05, -0.32, 0.06, 0.3, C.wood); for (const s of [-1, 1]) p.box(0.02, 0.06, 0.05, -0.32 + s * 0.06, 0.012, 0.3, C.metal);
  tree(p, -0.36, -0.36, 0.9);
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
export function getModel(kind: KindId, age: number, o: ModelOpts): Model {
  const size = o.small ? 1 : KINDS[kind].size;
  const imported = importedModel(kind, age, o.v, size);
  if (imported) return imported;
  const key = kind === 'house' ? `${kind}|${age}|${o.v}|${+o.L}${+o.R}${+o.F}` : `${kind}|${age}|${o.v % 3}|${size}`;
  let m = cache.get(key);
  if (m) return m;
  const p = new Parts();
  smokeOut = [];
  attachOut = [];
  spinOut = null;
  switch (kind) {
    case 'house': house(p, age, o); break;
    case 'farm': farm(p, age); break;
    case 'pen': pen(p, age); break;
    case 'well': well(p, age); break;
    case 'workshop': workshop(p, age, o); break;
    case 'gather': gather(p, age, o); break;
    case 'temple': temple(p, Math.max(1, age)); break;
    case 'mill': mill(p, Math.max(2, age)); break;
    case 'landmark': landmark(p, Math.max(2, age)); break;
    case 'station': station(p, Math.max(3, age)); break;
    case 'lamp': lamp(p, age); break;
    case 'pier': pier(p, age, o); break;
    case 'health': health(p, age); break;
    case 'school': school(p, age); break;
    case 'fire': firehouse(p, age, o.v); break;
    case 'stable': stable(p, Math.max(1, age)); break;
    case 'apiary': apiary(p, age); break;
    case 'baths': baths(p, Math.max(1, age)); break;
    case 'tavern': tavern(p, Math.max(2, age), o); break;
    case 'mine': mine(p, Math.max(2, age)); break;
    case 'observatory': observatory(p); break;
    case 'outpost': outpost(p, Math.max(2, age)); break;
    case 'lumber': lumber(p, age); break;
    case 'quarry': quarry(p, age); break;
  }
  // un modèle fait seulement de pièces importées (le point d'eau préhistorique) n'a pas de partie procédurale
  if (!p.body.length && attachOut.length) m = { body: mergeGeometries(attachOut, false)!, glow: null, smoke: smokeOut };
  else {
    m = { ...p.build(), smoke: smokeOut };
    if (attachOut.length) m.body = mergeGeometries([m.body, ...attachOut], false)!;
  }
  // roues d'un chevalement, coupole d'un observatoire, abeilles d'un rucher
  const spin = spinOut as Spin | null;
  if (spin) m.rotor = { geo: spin.p.build(false).body, pivot: spin.pivot, axis: spin.axis, speed: spin.speed };
  // dessiné pour une case, posé sur quatre : tout s'agrandit, cheminées comprises
  if (size === 2 && UPSCALE.includes(kind)) {
    m.body.scale(UP, UP, UP);
    m.glow?.scale(UP, UP, UP);
    m.smoke = m.smoke.map((v, i) => (i % 4 === 3 ? v : v * UP));
  }
  cache.set(key, m);
  return m;
}
