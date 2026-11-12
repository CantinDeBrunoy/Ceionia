import * as THREE from 'three';
import { paint, merge } from './battleUnits';
import { HellSiteKind, Z_EMBER, Z_RIVER, Z_CLIFFS, Z_BONES, Z_CRYSTAL } from '../world/hell';

/**
 * Les bâtiments démoniaques (face au nord, l'avant vers −z) : pièces opaques, pièces qui luisent (fenêtres, braises, yeux,
 * runes), où flottent les étendards, d'où montent la fumée et les étincelles. Chaque zone a sa pierre, et ses ornements :
 * coulées de lave à la rivière, pierre cendrée sur les falaises, défenses et crânes dans la gorge des os, cristaux dans la
 * forêt de cristaux
 */

type V3 = [number, number, number];
export interface SiteParts {
  solid: THREE.BufferGeometry; shine: THREE.BufferGeometry;
  /** pieds des mâts d'étendard */
  flags: V3[];
  /** fumées (cheminées, braseros) et gerbes d'étincelles (forge) : points en repère local */
  smoke: V3[]; sparks: V3[];
}

/** Pierre, pierre sombre et toit, par zone (seuil, braises, rivière, falaises, os, cristaux, royaume) */
const STONE_OF = [0x4a3440, 0x5a3438, 0x3a2e36, 0x5e585c, 0x6a5c4c, 0x3e3456, 0x4a3440];
const DARK_OF = [0x2c1e26, 0x341a1e, 0x1e161c, 0x36323a, 0x3c3228, 0x221c34, 0x2c1e26];
const ROOF_OF = [0xc23a2a, 0xc23a2a, 0x9a2a1e, 0x8a3a30, 0xa8482a, 0x7a3ab0, 0xc23a2a];
const BONE = 0xeadcc0, GOLD = 0xe0a83a, LAVA = 0xffa040, EYE = 0xffe14a, PURPLE = 0x6a2a8a, WOOD = 0x4a3224, IRON = 0x3a3640, CLOTH = 0x5a1a6a;
const CRYST = [0xc77dff, 0xff5fc8, 0x7fdcff];

/** Un petit outillage de formes, qui empile dans les pièces opaques ou lumineuses */
class Kit {
  solid: THREE.BufferGeometry[] = [];
  shine: THREE.BufferGeometry[] = [];
  flags: V3[] = [];
  smoke: V3[] = [];
  sparks: V3[] = [];
  constructor(readonly zone: number) {}
  get stone() { return STONE_OF[this.zone] ?? STONE_OF[0]; }
  get dark() { return DARK_OF[this.zone] ?? DARK_OF[0]; }
  get roof() { return ROOF_OF[this.zone] ?? ROOF_OF[0]; }
  s(g: THREE.BufferGeometry, c: number, f?: (y: number) => number) { this.solid.push(paint(g, c, f)); return this; }
  g(g: THREE.BufferGeometry, c: number, f?: (y: number) => number) { this.shine.push(paint(g, c, f)); return this; }
  box(w: number, h: number, d: number, x: number, y: number, z: number, c: number, glow = false, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z);
    return glow ? this.g(g, c) : this.s(g, c, (t) => 0.85 + t * 0.25);
  }
  /** Corne ou pointe : un cône penché (`lean` autour de z, `tilt` autour de x) */
  horn(x: number, y: number, z: number, r: number, h: number, lean = 0, tilt = 0, c = BONE) {
    return this.s(new THREE.ConeGeometry(r, h, 5).translate(0, h / 2, 0).rotateX(tilt).rotateZ(lean).translate(x, y, z), c, (t) => 0.8 + t * 0.3);
  }
  /** Un crâne tourné vers −z : boîte crânienne, mâchoire, orbites noires (ou qui luisent) */
  skull(x: number, y: number, z: number, s: number, eyes = false) {
    this.s(new THREE.IcosahedronGeometry(s, 1).scale(1, 0.9, 1).translate(x, y, z), BONE, (t) => 0.85 + t * 0.2);
    this.s(new THREE.BoxGeometry(s * 1.1, s * 0.5, s * 0.9).translate(x, y - s * 0.75, z - s * 0.15), BONE);
    for (const sd of [-1, 1]) {
      const g = new THREE.BoxGeometry(s * 0.34, s * 0.3, s * 0.2).translate(x + sd * s * 0.36, y - s * 0.05, z - s * 0.88);
      if (eyes) this.g(g, 0xff6a1a); else this.s(g, 0x1a1012);
    }
    return this;
  }
  /** Brasero : un pied, une vasque, une flamme qui luit ; la fumée monte au-dessus */
  brazier(x: number, y: number, z: number, s = 1) {
    this.s(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.3 * s, 5).translate(x, y + 0.15 * s, z), IRON);
    this.s(new THREE.CylinderGeometry(0.17 * s, 0.09 * s, 0.13 * s, 6).translate(x, y + 0.36 * s, z), IRON);
    this.g(new THREE.ConeGeometry(0.13 * s, 0.32 * s, 5).translate(x, y + 0.58 * s, z), LAVA, (t) => 1.1 - t * 0.3);
    this.g(new THREE.ConeGeometry(0.07 * s, 0.22 * s, 4).translate(x + 0.03 * s, y + 0.6 * s, z), 0xffe070);
    this.smoke.push([x, y + 0.8 * s, z]);
    return this;
  }
  /** Bannière qui pend d'un mur (face −z) : tissu violet, frange d'or, sceau qui luit */
  banner(x: number, y: number, z: number, w = 0.3, h = 0.62) {
    this.s(new THREE.BoxGeometry(w + 0.08, 0.04, 0.04).translate(x, y + h / 2 + 0.02, z), IRON);
    this.s(new THREE.BoxGeometry(w, h, 0.025).translate(x, y, z), CLOTH);
    this.s(new THREE.ConeGeometry(w / 2, 0.14, 3).rotateZ(Math.PI).scale(1, 1, 0.12).translate(x, y - h / 2 - 0.06, z), CLOTH);
    this.s(new THREE.BoxGeometry(w + 0.01, 0.03, 0.03).translate(x, y - h / 2 + 0.06, z - 0.005), GOLD);
    this.g(new THREE.OctahedronGeometry(w * 0.26, 0).scale(1, 1.3, 0.2).translate(x, y + h * 0.1, z - 0.02), 0xff7a2a);
    return this;
  }
  /** Mât et étendard (le tissu flotte, voir la vue) */
  flag(x: number, y: number, z: number, h = 0.7) {
    this.s(new THREE.CylinderGeometry(0.025, 0.025, h, 4).translate(x, y + h / 2, z), this.dark);
    this.horn(x, y + h, z, 0.03, 0.1, 0, 0, GOLD);
    this.flags.push([x, y + h - 0.12, z]);
    return this;
  }
  /** Pieux de pointe en cercle (avec un vide devant, l'entrée) */
  stakes(r: number, n: number, h: number, c = BONE, gap = 0.5, y = 0) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a + Math.PI), Math.cos(a + Math.PI))) < gap) continue;
      const x = Math.sin(a) * r, z = Math.cos(a) * r, hh = h * (0.8 + ((i * 37) % 7) / 20);
      this.s(new THREE.ConeGeometry(0.05, hh, 4).translate(0, hh / 2, 0).rotateX(Math.cos(a) * 0.3).rotateZ(-Math.sin(a) * 0.3).translate(x, y, z), c, (t) => 0.75 + t * 0.35);
    }
    return this;
  }
  /** Chaîne d'un point à un autre (maillons plats alternés) */
  chain(a: V3, b: V3, link = 0.06) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = va.distanceTo(vb), n = Math.max(2, Math.round(d / (link * 1.6)));
    const dir = vb.clone().sub(va).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    for (let i = 0; i < n; i++) {
      const p = va.clone().lerp(vb, (i + 0.5) / n);
      const g = new THREE.TorusGeometry(link * 0.5, link * 0.14, 3, 6).scale(0.7, 1.3, 1).rotateY(i % 2 ? Math.PI / 2 : 0).applyQuaternion(q).translate(p.x, p.y, p.z);
      this.s(g, 0x2a2a30);
    }
    return this;
  }
  /** Amas de cristaux qui luisent (forêt de cristaux) */
  crystals(x: number, y: number, z: number, s: number, n = 3, seed = 0) {
    for (let i = 0; i < n; i++) {
      const a = seed + i * 2.1, h = s * (1.2 + (i % 3) * 0.5);
      this.g(new THREE.OctahedronGeometry(1, 0).scale(s * 0.35, h, s * 0.35).rotateZ(Math.sin(a) * 0.4).rotateX(Math.cos(a) * 0.4).translate(x + Math.sin(a) * s * 0.3, y + h * 0.7, z + Math.cos(a) * s * 0.3), CRYST[i % 3]);
    }
    return this;
  }
  /** Défense recourbée (gorge des os) : trois cônes qui se suivent en arc */
  tusk(x: number, y: number, z: number, s: number, sd: number) {
    for (let i = 0; i < 3; i++) this.s(new THREE.ConeGeometry(0.09 * s * (1 - i * 0.25), 0.4 * s, 5).translate(0, 0.2 * s, 0).rotateZ(-sd * (0.3 + i * 0.45)).translate(x + sd * i * 0.17 * s, y + i * 0.3 * s - i * i * 0.06 * s, z), BONE, (t) => 0.8 + t * 0.3);
    return this;
  }
  done(): SiteParts {
    return { solid: merge(this.solid), shine: this.shine.length ? merge(this.shine) : new THREE.BufferGeometry(), flags: this.flags, smoke: this.smoke, sparks: this.sparks };
  }
}

/** Les pièces d'un bâtiment démoniaque, selon sa zone */
export function siteParts(kind: HellSiteKind, zone: number): SiteParts {
  const k = new Kit(zone);
  if (kind === 'outpost') outpost(k);
  else if (kind === 'forge') forge(k);
  else if (kind === 'fortress') fortress(k);
  else if (kind === 'spire') spire(k);
  else kingdom(k);
  return k.done();
}

/** Avant-poste : tour de guet à quatre pans, plate-forme sur poutres, brasero au sommet, cercle de pieux d'os */
function outpost(k: Kit) {
  const z = k.zone;
  k.s(new THREE.CylinderGeometry(0.8, 0.9, 0.18, 6).translate(0, 0.09, 0), k.dark);
  k.s(new THREE.CylinderGeometry(0.42, 0.62, 1.5, 4).rotateY(Math.PI / 4).translate(0, 0.75, 0), k.stone, (y) => 0.75 + y * 0.35);
  // chaînage de pierre sombre aux angles
  for (const [x, zz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.s(new THREE.BoxGeometry(0.1, 1.45, 0.1).translate(x * 0.38, 0.75, zz * 0.38).rotateY(0), k.dark);
  // poutres en encorbellement sous la plate-forme
  for (const [x, zz] of [[0, -0.55], [0, 0.55], [-0.55, 0], [0.55, 0]]) k.box(Math.abs(x) > 0 ? 0.5 : 0.08, 0.08, Math.abs(zz) > 0 ? 0.5 : 0.08, x * 0.7, 1.42, zz * 0.7, WOOD);
  k.s(new THREE.BoxGeometry(1.1, 0.16, 1.1).translate(0, 1.55, 0), k.dark);
  for (const [x, zz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) k.horn(x, 1.62, zz, 0.08, 0.42, 0, 0, k.roof);
  // garde-corps de pieux entre les pointes
  for (let i = 0; i < 8; i++) { const u = (i % 2) * 0.3 - 0.15; const side = Math.floor(i / 2); const [x, zz] = side === 0 ? [u, -0.5] : side === 1 ? [u, 0.5] : side === 2 ? [-0.5, u] : [0.5, u]; k.box(0.04, 0.22, 0.04, x, 1.74, zz, WOOD); }
  k.brazier(0, 1.62, 0, 1.05);
  // meurtrière de lave, crâne aux yeux qui luisent au-dessus, cornes de part et d'autre
  k.g(new THREE.BoxGeometry(0.14, 0.32, 0.05).translate(0, 0.85, -0.52), LAVA);
  k.skull(0, 1.22, -0.5, 0.1, true);
  k.horn(-0.3, 1.1, -0.45, 0.12, 0.6, 0.6, -0.3).horn(0.3, 1.1, -0.45, 0.12, 0.6, -0.6, -0.3);
  k.banner(0, 0.42, -0.6, 0.22, 0.4);
  k.stakes(1.0, 12, 0.5, z === Z_BONES ? BONE : z === Z_CRYSTAL ? 0x5a4a7a : 0x3a2a24, 0.45);
  k.flag(0.42, 1.62, 0.42);
  // un tas de pierres et de sacs au pied
  for (let i = 0; i < 3; i++) k.s(new THREE.IcosahedronGeometry(0.1 + i * 0.03, 0).scale(1, 0.7, 1).translate(0.62 + i * 0.08, 0.06, 0.2 - i * 0.14), i === 1 ? 0x6a5040 : k.stone);
  if (z === Z_CRYSTAL) k.crystals(-0.6, 0.05, 0.35, 0.22, 3, 1);
  if (z === Z_BONES) k.tusk(-0.36, 1.45, -0.36, 1, -1).tusk(0.36, 1.45, -0.36, 1, 1);
}

/** Forge : atelier de pierre sous un toit violet, bouche de feu, cheminée qui fume, soufflet, enclume, ratelier, minerai */
function forge(k: Kit) {
  const z = k.zone;
  k.s(new THREE.BoxGeometry(1.8, 0.12, 1.5).translate(0, 0.06, 0.1), k.dark);
  k.s(new THREE.BoxGeometry(1.6, 0.75, 1.3).translate(0, 0.375 + 0.1, 0.1), k.stone, (y) => 0.8 + y * 0.3);
  for (const x of [-0.8, 0.8]) for (const zz of [-0.55, 0.75]) k.box(0.16, 0.85, 0.16, x, 0.47, zz, k.dark);
  k.s(new THREE.CylinderGeometry(0.05, 1.1, 0.6, 4).rotateY(Math.PI / 4).scale(1.05, 1, 0.85).translate(0, 1.15, 0.1), PURPLE);
  // crête de pointes sur le faîte
  for (let i = -2; i <= 2; i++) k.horn(i * 0.2, 1.4 - Math.abs(i) * 0.06, 0.1, 0.04, 0.18, 0, 0, BONE);
  // la cheminée et sa couronne de pointes ; la fumée
  k.s(new THREE.CylinderGeometry(0.16, 0.22, 1.25, 6).translate(0.5, 1.22, 0.35), k.dark);
  k.s(new THREE.CylinderGeometry(0.22, 0.18, 0.12, 6).translate(0.5, 1.9, 0.35), IRON);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; k.horn(0.5 + Math.sin(a) * 0.17, 1.92, 0.35 + Math.cos(a) * 0.17, 0.03, 0.14, -Math.sin(a) * 0.4, Math.cos(a) * 0.4, k.roof); }
  k.g(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 6).translate(0.5, 1.97, 0.35), 0xff6a20);
  k.smoke.push([0.5, 2.05, 0.35]);
  // la bouche du four : arche de pierre sombre, feu qui luit ; les étincelles en jaillissent
  k.s(new THREE.TorusGeometry(0.32, 0.07, 4, 8, Math.PI).translate(0, 0.52, -0.57), k.dark);
  k.g(new THREE.BoxGeometry(0.55, 0.42, 0.06).translate(0, 0.38, -0.56), LAVA);
  k.g(new THREE.BoxGeometry(0.35, 0.18, 0.07).translate(0, 0.25, -0.57), 0xffe070);
  k.sparks.push([0, 0.45, -0.75]);
  // le soufflet de cuir, à côté de la bouche
  k.s(new THREE.CylinderGeometry(0.02, 0.16, 0.42, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.6).translate(0.6, 0.3, -0.72), 0x6a4430);
  k.box(0.05, 0.05, 0.34, 0.6, 0.42, -0.72, WOOD);
  // l'enclume sur son billot, un marteau posé
  k.box(0.18, 0.22, 0.18, -0.45, 0.11, -0.85, WOOD);
  k.box(0.34, 0.12, 0.15, -0.45, 0.28, -0.85, 0x3a3a44);
  k.s(new THREE.ConeGeometry(0.06, 0.14, 4).rotateZ(Math.PI / 2).translate(-0.67, 0.3, -0.85), 0x3a3a44);
  k.box(0.03, 0.03, 0.22, -0.4, 0.36, -0.85, WOOD, false, 0.4);
  k.box(0.07, 0.06, 0.1, -0.44, 0.36, -0.95, 0x55545e, false, 0.4);
  // l'auge de trempe pleine de lave
  k.box(0.5, 0.16, 0.24, 0.55, 0.08, -1.0, k.dark);
  k.g(new THREE.BoxGeometry(0.42, 0.02, 0.16).translate(0.55, 0.165, -1.0), 0xff7a20);
  // le ratelier d'armes, sur le flanc
  for (const zz of [-0.25, 0.35]) k.box(0.05, 0.5, 0.05, -0.98, 0.25, zz, WOOD);
  k.box(0.04, 0.04, 0.7, -0.98, 0.46, 0.05, WOOD);
  for (let i = 0; i < 3; i++) { k.box(0.025, 0.42, 0.05, -1.0, 0.27, -0.12 + i * 0.17, 0x9a98a4); k.box(0.1, 0.03, 0.03, -1.0, 0.44, -0.12 + i * 0.17, GOLD); }
  // un tas de minerai qui rougeoie (des cristaux dans la forêt de cristaux), des lingots
  if (z === Z_CRYSTAL) k.crystals(0.95, 0.02, 0.75, 0.2, 4, 2);
  else for (let i = 0; i < 5; i++) { const a = i * 1.3; const g = new THREE.IcosahedronGeometry(0.08 + (i % 3) * 0.02, 0).translate(0.95 + Math.sin(a) * 0.12, 0.07 + (i === 4 ? 0.09 : 0), 0.7 + Math.cos(a) * 0.12); if (i % 2) k.g(g, 0xff7a2a); else k.s(g, 0x3a2a2a); }
  for (let i = 0; i < 3; i++) k.box(0.2, 0.06, 0.08, -0.85 + (i % 2) * 0.1, 0.04 + Math.floor(i / 2) * 0.06, 0.75, 0x8a7a5a);
  k.banner(-0.45, 0.62, -0.58, 0.22, 0.34);
}

/** Forteresse : enceinte crénelée sur un socle, quatre tours, donjon cornu, porte à herse, bannières, braseros, pieux */
function fortress(k: Kit) {
  const z = k.zone;
  // le socle et l'escalier devant la porte
  k.s(new THREE.BoxGeometry(3.5, 0.14, 3.5).translate(0, 0.07, 0), k.dark);
  for (let i = 0; i < 3; i++) k.box(1.1 - i * 0.12, 0.08, 0.2, 0, 0.04 + i * 0.07, -1.95 + i * 0.12, k.dark);
  for (const [w, d, x, zz] of [[3.2, 0.32, 0, -1.45], [3.2, 0.32, 0, 1.45], [0.32, 3.2, -1.45, 0], [0.32, 3.2, 1.45, 0]] as const) {
    k.s(new THREE.BoxGeometry(w, 1, d).translate(x, 0.5 + 0.1, zz), k.stone, (y) => 0.75 + y * 0.35);
    // un bandeau sombre au pied, des chaînages
    k.box(w + 0.04, 0.14, d + 0.04, x, 0.17, zz, k.dark);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5;
      k.box(w > d ? 0.24 : 0.34, 0.2, w > d ? 0.34 : 0.24, x + (w > d ? u * w : 0), 1.2, zz + (w > d ? 0 : u * d), k.stone);
    }
    // contreforts
    for (const u of [-0.25, 0.25]) {
      const bx = x + (w > d ? u * w : Math.sign(x) * 0.22), bz = zz + (w > d ? Math.sign(zz) * 0.22 : u * d);
      k.s(new THREE.CylinderGeometry(0.02, 0.2, 0.8, 4).rotateY(Math.PI / 4).translate(bx, 0.5, bz), k.dark);
    }
  }
  // pointes d'os sur le chemin de ronde, tournées vers l'extérieur (devant et côtés)
  for (let i = 0; i < 9; i++) { const u = (i / 8 - 0.5) * 2.6; if (Math.abs(u) < 0.5) continue; k.horn(u, 1.0, -1.62, 0.045, 0.32, 0, -1.1); }
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) k.horn(sd * 1.62, 1.0, (i / 4 - 0.5) * 2.4, 0.045, 0.3, sd * -1.1, 0);
  for (const [x, zz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
    k.s(new THREE.CylinderGeometry(0.42, 0.52, 1.8, 6).translate(x, 0.95, zz), k.stone, (y) => 0.75 + y * 0.35);
    k.s(new THREE.CylinderGeometry(0.56, 0.46, 0.18, 6).translate(x, 1.9, zz), k.dark);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.box(0.14, 0.16, 0.12, x + Math.sin(a) * 0.5, 2.06, zz + Math.cos(a) * 0.5, k.stone, false, a); }
    k.s(new THREE.ConeGeometry(0.5, 0.9, 6).translate(x, 2.55, zz), k.roof, (t) => 0.8 + t * 0.3);
    k.horn(x, 2.95, zz, 0.04, 0.22, 0, 0, GOLD);
    // meurtrières de lave
    for (const y of [0.7, 1.4]) k.g(new THREE.BoxGeometry(0.09, 0.22, 0.09).translate(x, y, zz - Math.sign(zz) * 0.0 - 0.49), LAVA);
    if (z === Z_BONES) k.tusk(x - Math.sign(x) * 0.1, 1.95, zz, 1.2, Math.sign(x));
    if (z === Z_CRYSTAL) k.crystals(x + Math.sign(x) * 0.35, 1.0, zz + Math.sign(zz) * 0.35, 0.28, 3, x + zz);
  }
  // le donjon : pierre sombre, balcon, fenêtres, face cornue aux yeux de feu
  k.s(new THREE.BoxGeometry(1.3, 2.4, 1.3).translate(0, 1.3, 0.2), k.dark, (y) => 0.75 + y * 0.45);
  k.box(1.5, 0.12, 1.5, 0, 2.5, 0.2, k.stone);
  for (let i = 0; i < 4; i++) k.box(0.2, 0.2, 0.2, -0.6 + i * 0.4, 2.65, -0.52, k.stone);
  k.horn(-0.55, 2.6, 0.2, 0.22, 1.1, 0.55).horn(0.55, 2.6, 0.2, 0.22, 1.1, -0.55);
  k.s(new THREE.ConeGeometry(0.55, 0.9, 4).rotateY(Math.PI / 4).translate(0, 3.0, 0.2), k.roof);
  k.box(0.18, 0.12, 0.05, -0.25, 1.9, -0.47, EYE, true).box(0.18, 0.12, 0.05, 0.25, 1.9, -0.47, EYE, true);
  k.g(new THREE.BoxGeometry(0.5, 0.05, 0.05).translate(0, 1.62, -0.47), 0xff5a1a);
  for (const sd of [-1, 1]) k.box(0.12, 0.3, 0.05, sd * 0.4, 1.15, -0.47, LAVA, true);
  k.smoke.push([0, 3.5, 0.2]);
  // la porte : arc, herse de fer devant la lueur, crâne aux yeux de feu au-dessus, chaînes
  k.g(new THREE.BoxGeometry(0.7, 0.75, 0.08).translate(0, 0.5, -1.62), 0xff5a1a);
  k.s(new THREE.TorusGeometry(0.4, 0.09, 4, 8, Math.PI).translate(0, 0.86, -1.64), k.dark);
  for (let i = 0; i < 5; i++) k.box(0.035, 0.75, 0.035, -0.28 + i * 0.14, 0.5, -1.68, IRON);
  for (const y of [0.35, 0.7]) k.box(0.62, 0.035, 0.035, 0, y, -1.68, IRON);
  k.skull(0, 1.32, -1.66, 0.16, true);
  k.chain([-0.42, 1.0, -1.7], [-0.3, 0.55, -1.72]).chain([0.42, 1.0, -1.7], [0.3, 0.55, -1.72]);
  // bannières sur la façade, braseros sur le chemin de ronde
  k.banner(-0.95, 0.62, -1.63).banner(0.95, 0.62, -1.63);
  k.brazier(-0.62, 1.1, -1.45, 0.9).brazier(0.62, 1.1, -1.45, 0.9);
  // la rivière : la lave court au pied des murs ; la gorge : un crâne de bête sur le donjon
  if (z === Z_RIVER || z === Z_EMBER) for (const sd of [-1, 1]) k.g(new THREE.BoxGeometry(0.06, 0.03, 3.1).translate(sd * 1.68, 0.03, 0), 0xff6a1a);
  if (z === Z_BONES) k.skull(0, 2.25, -0.55, 0.3, true);
  if (z === Z_CLIFFS) for (let i = 0; i < 4; i++) k.s(new THREE.IcosahedronGeometry(0.16 + i * 0.03, 0).translate(1.85 - i * 0.2, 0.08, 1.2 + i * 0.25), k.stone);
  for (const x of [-1.5, 1.5]) k.flag(x, 3.05, -1.5, 0.7);
  // pieux et crânes de part et d'autre de l'escalier
  for (const sd of [-1, 1]) { k.box(0.06, 0.9, 0.06, sd * 0.75, 0.45, -2.05, WOOD); k.skull(sd * 0.75, 0.98, -2.05, 0.09); }
}

/** Tour de la citadelle : socle crénelé, fût sombre à meurtrières, chemin de ronde, toit cornu, brasero, bannière */
function spire(k: Kit) {
  k.s(new THREE.CylinderGeometry(0.85, 1.0, 0.4, 6).translate(0, 0.2, 0), k.stone);
  k.stakes(1.1, 10, 0.45, 0x2a1e26, 0.4);
  k.s(new THREE.CylinderGeometry(0.5, 0.66, 2.4, 6).translate(0, 1.6, 0), k.dark, (y) => 0.75 + y * 0.45);
  for (const y of [0.9, 1.9]) k.s(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 6).translate(0, y, 0), k.stone);
  k.s(new THREE.CylinderGeometry(0.72, 0.6, 0.3, 6).translate(0, 2.95, 0), k.stone);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.s(new THREE.BoxGeometry(0.22, 0.24, 0.2).translate(0, 3.2, 0.62).rotateY(a), k.stone); }
  k.s(new THREE.ConeGeometry(0.62, 1.3, 6).translate(0, 3.85, 0), k.roof);
  k.horn(-0.4, 3.3, 0, 0.15, 0.75, 0.7).horn(0.4, 3.3, 0, 0.15, 0.75, -0.7);
  for (const y of [1.2, 2.1]) k.g(new THREE.BoxGeometry(0.12, 0.3, 0.06).translate(0, y, -0.6), LAVA);
  for (const sd of [-1, 1]) k.g(new THREE.BoxGeometry(0.06, 0.22, 0.12).translate(sd * 0.56, 1.5, -0.2), LAVA);
  k.g(new THREE.BoxGeometry(0.16, 0.1, 0.05).translate(0, 3.45, -0.5), EYE);
  k.skull(0, 2.6, -0.6, 0.12, true);
  k.banner(0, 1.55, -0.66, 0.24, 0.5);
  k.brazier(0.35, 3.1, 0.35, 0.8);
  k.flag(0, 4.5, 0, 0.7);
}

/**
 * La citadelle : enceinte octogonale crénelée, six tours, une flèche immense couronnée de cornes et d'un œil de lave ;
 * deux statues de démons gardent la porte, un cercle de runes luit autour du donjon, braseros et bannières
 */
function kingdom(k: Kit) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, rot = (g: THREE.BufferGeometry) => g.rotateY(a);
    k.s(rot(new THREE.BoxGeometry(2.6, 1.6, 0.4).translate(0, 0.8, 3.6)), k.stone, (y) => 0.75 + y * 0.35);
    k.s(rot(new THREE.BoxGeometry(2.7, 0.2, 0.46).translate(0, 0.12, 3.6)), k.dark);
    for (let j = 0; j < 4; j++) k.s(rot(new THREE.BoxGeometry(0.3, 0.26, 0.42).translate(-0.9 + j * 0.6, 1.73, 3.6)), k.stone);
    // pointes tournées vers l'extérieur, bannière sur chaque pan (sauf celui de la porte)
    for (let j = 0; j < 3; j++) k.s(rot(new THREE.ConeGeometry(0.05, 0.4, 4).translate(0, 0.2, 0).rotateX(1.2).translate(-0.6 + j * 0.6, 1.4, 3.85)), BONE, (t) => 0.8 + t * 0.3);
    if (i !== 4) {
      k.s(rot(new THREE.BoxGeometry(0.42, 0.85, 0.03).translate(0, 0.8, 3.82)), CLOTH);
      k.g(rot(new THREE.OctahedronGeometry(0.1, 0).scale(1, 1.3, 0.2).translate(0, 0.9, 3.85)), 0xff7a2a);
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3, x = Math.sin(a) * 3.7, z = Math.cos(a) * 3.7;
    k.s(new THREE.CylinderGeometry(0.55, 0.72, 2.8, 6).translate(x, 1.4, z), k.dark, (y) => 0.75 + y * 0.45);
    k.s(new THREE.CylinderGeometry(0.7, 0.6, 0.2, 6).translate(x, 2.85, z), k.stone);
    k.s(new THREE.ConeGeometry(0.75, 1.2, 6).translate(x, 3.5, z), k.roof);
    k.horn(x, 4.05, z, 0.05, 0.3, 0, 0, GOLD);
    k.g(new THREE.BoxGeometry(0.16, 0.34, 0.16).translate(x * 0.86, 2.1, z * 0.86), LAVA);
    k.g(new THREE.BoxGeometry(0.14, 0.28, 0.14).translate(x * 0.86, 1.2, z * 0.86), LAVA);
    k.flags.push([x, 4.2, z]);
    k.smoke.push([x, 4.1, z]);
  }
  // le donjon, la flèche, les cornes, la couronne d'or, l'œil
  k.s(new THREE.CylinderGeometry(1.3, 2.2, 3.6, 8).translate(0, 1.8, 0), k.stone, (y) => 0.7 + y * 0.45);
  k.s(new THREE.CylinderGeometry(2.25, 2.35, 0.3, 8).translate(0, 0.15, 0), k.dark);
  k.s(new THREE.CylinderGeometry(1.45, 1.35, 0.22, 8).translate(0, 3.65, 0), k.dark);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; k.box(0.3, 0.26, 0.26, Math.sin(a) * 1.35, 3.88, Math.cos(a) * 1.35, k.stone, false, a); }
  k.s(new THREE.CylinderGeometry(0.6, 1.2, 2.8, 8).translate(0, 5, 0), k.dark, (y) => 0.8 + y * 0.4);
  k.s(new THREE.ConeGeometry(0.7, 1.6, 8).translate(0, 7.2, 0), k.roof);
  k.horn(-1, 6, 0, 0.4, 2, 0.7).horn(1, 6, 0, 0.4, 2, -0.7).horn(-1.6, 3.6, 0, 0.3, 1.5, 0.9).horn(1.6, 3.6, 0, 0.3, 1.5, -0.9);
  k.s(new THREE.TorusGeometry(0.75, 0.1, 4, 10).rotateX(Math.PI / 2).translate(0, 6.45, 0), GOLD);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.horn(Math.sin(a) * 0.75, 6.5, Math.cos(a) * 0.75, 0.05, 0.25, 0, 0, GOLD); }
  k.g(new THREE.IcosahedronGeometry(0.42, 1).translate(0, 5.6, -0.72), 0xffd040);
  k.g(new THREE.IcosahedronGeometry(0.2, 1).translate(0, 5.6, -0.98), 0xff3a1a);
  k.s(new THREE.TorusGeometry(0.5, 0.08, 4, 10).translate(0, 5.6, -0.78), k.dark);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.g(new THREE.BoxGeometry(0.2, 0.4, 0.1).translate(0, 2.4, 1.95).rotateY(a), LAVA); k.g(new THREE.BoxGeometry(0.14, 0.3, 0.1).translate(0, 4.6, 1.02).rotateY(a + 0.5), LAVA); }
  // la porte : grande lueur, arc, herse, crâne géant ; marches
  k.g(new THREE.BoxGeometry(1.2, 1.3, 0.1).translate(0, 0.65, -3.72), 0xff5a1a);
  k.s(new THREE.TorusGeometry(0.66, 0.14, 4, 10, Math.PI).translate(0, 1.25, -3.78), k.dark);
  for (let i = 0; i < 7; i++) k.box(0.05, 1.3, 0.05, -0.54 + i * 0.18, 0.65, -3.84, IRON);
  k.skull(0, 1.95, -3.84, 0.3, true);
  for (let i = 0; i < 4; i++) k.box(1.8 - i * 0.15, 0.1, 0.3, 0, 0.05 + i * 0.09, -4.35 + i * 0.16, k.dark);
  // deux statues de démons ailés sur leurs socles, de part et d'autre de la porte
  for (const sd of [-1, 1]) {
    const x = sd * 1.65, z = -4.25;
    k.box(0.7, 0.5, 0.7, x, 0.25, z, k.dark);
    k.box(0.78, 0.08, 0.78, x, 0.52, z, k.stone);
    k.s(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 5).translate(x - 0.12, 0.85, z), k.stone).s(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 5).translate(x + 0.12, 0.85, z), k.stone);
    k.s(new THREE.IcosahedronGeometry(0.32, 0).scale(1, 1.3, 0.8).translate(x, 1.5, z), k.stone, (t) => 0.8 + t * 0.3);
    k.s(new THREE.IcosahedronGeometry(0.2, 1).translate(x, 2.05, z - 0.05), k.stone);
    k.horn(x - 0.14, 2.15, z, 0.06, 0.35, 0.6).horn(x + 0.14, 2.15, z, 0.06, 0.35, -0.6);
    for (const w of [-1, 1]) k.s(new THREE.ConeGeometry(0.4, 0.9, 3).scale(1, 1, 0.15).rotateZ(-w * 0.9).translate(x + w * 0.45, 1.85, z + 0.15), k.dark);
    k.box(0.06, 1.3, 0.06, x + sd * 0.38, 1.4, z - 0.12, IRON);
    k.horn(x + sd * 0.38, 2.05, z - 0.12, 0.06, 0.26, 0, 0, IRON);
    k.box(0.06, 0.05, 0.04, x - 0.07, 2.08, z - 0.22, EYE, true).box(0.06, 0.05, 0.04, x + 0.07, 2.08, z - 0.22, EYE, true);
    k.brazier(sd * 0.95, 0, -4.1, 1.1);
  }
  // le cercle de runes qui luit au pied du donjon
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; k.g(new THREE.BoxGeometry(i % 2 ? 0.08 : 0.2, 0.02, i % 2 ? 0.2 : 0.08).rotateY(a).translate(Math.sin(a) * 2.75, 0.03, Math.cos(a) * 2.75), 0xff4a6a); }
  k.smoke.push([0, 8.2, 0]);
}
