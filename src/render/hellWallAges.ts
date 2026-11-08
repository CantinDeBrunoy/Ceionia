import * as THREE from 'three';
import { paint, merge } from './battleUnits';
import { baseAgeOf } from './hellBaseAges';
import { gateGeo, WALL_N, WALL_E, WALL_S, WALL_W } from './hellBase';

/**
 * Les murs de la base des Enfers, âge par âge : une case chacun, raccordés à leurs voisins (un nœud au centre de la case, un bras
 * vers chaque côté relié, jusqu'au bord : deux pans voisins se rejoignent sans couture). 1 Antiquité : pieux de bois pointus liés
 * de cordes ; 2 Médiéval : mur de pierre crénelé, contreforts, porte de bois cloutée sous une herse ; 3 Industriel : brique,
 * fil de fer barbelé, porte de fonte rivetée ; 4 Moderne : béton en L, projecteurs, porte métallique coulissante ; 5 Futuriste :
 * piliers blancs liserés de cyan reliés par un champ d'énergie, porte à champ de force qui s'efface. Mêmes emprise et hauteur
 * de porte (un peu au-dessus du mur) à chaque âge. Les formes sont gardées par (âge, voisinage) : une seule géométrie par cas
 */

export interface WallParts { solid: THREE.BufferGeometry; shine: THREE.BufferGeometry | null; field: THREE.BufferGeometry | null }
export interface GateParts extends WallParts {
  /** le battant (pièce à part, charnière en x = 0 de sa géométrie, qui s'étend vers +x sur 0,7) */
  leaf: THREE.BufferGeometry;
  /** le battant est un champ translucide (matériau d'énergie) */
  leafField: boolean;
  /** s'ouvre en coulissant le long du mur (au lieu de pivoter) */
  slide: boolean;
  /** s'ouvre en s'effaçant */
  fade: boolean;
}

const WOOD = 0x9a6a3c, DARKWOOD = 0x6a4426, TIP = 0xc89a6a, HEMP = 0xc8b078;
const STONE = 0x8a8590, STONE2 = 0x5e5a66, BRICK = 0xa4553a, IRON = 0x2a2a30, CAST = 0x4a4c56, CONCRETE = 0xc8cacc, CONCRETE2 = 0x9a9ca0;
const WHITE = 0xdfe6ee, CYAN = 0x40f0ff, WARM = 0xfff0b0;
/** Les côtés reliés, avec la rotation qui ramène un bras construit vers +x sur le côté voulu */
const DIRS: [number, number][] = [[WALL_N, Math.PI / 2], [WALL_E, 0], [WALL_S, -Math.PI / 2], [WALL_W, Math.PI]];

type Add = { solid: THREE.BufferGeometry[]; shine: THREE.BufferGeometry[]; field: THREE.BufferGeometry[] };
const shadeUp = (y: number) => 0.78 + y * 0.3;
/** Boîte dont le pied est en `y` ; cylindre de même (rt, rb : rayons haut, bas) */
const box = (l: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, c: number, rz = 0) => { l.push(paint(new THREE.BoxGeometry(w, h, d).rotateZ(rz).translate(x, y + h / 2, z), c, shadeUp)); };
const cyl = (l: THREE.BufferGeometry[], rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, c: number) => { l.push(paint(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z), c, shadeUp)); };

/** Le nœud d'un mur : le poteau au centre de la case, à chaque angle et à chaque bout */
function node(a: number, o: Add) {
  const s = o.solid;
  if (a === 1) { cyl(s, 0.1, 0.115, 1.02, 6, 0, 0, 0, WOOD); s.push(paint(new THREE.ConeGeometry(0.1, 0.2, 6).translate(0, 1.12, 0), TIP)); cyl(s, 0.115, 0.115, 0.05, 6, 0, 0.3, 0, HEMP); }
  else if (a === 2) { box(s, 0.3, 0.78, 0.3, 0, 0, 0, STONE); box(s, 0.35, 0.06, 0.35, 0, 0.78, 0, STONE2); s.push(paint(new THREE.ConeGeometry(0.2, 0.2, 4).rotateY(Math.PI / 4).translate(0, 0.94, 0), 0x3a5a9a)); }
  else if (a === 3) { box(s, 0.26, 0.7, 0.26, 0, 0, 0, BRICK); box(s, 0.32, 0.06, 0.32, 0, 0.7, 0, STONE2); cyl(s, 0.05, 0.05, 0.08, 6, 0, 0.76, 0, IRON); }
  else if (a === 4) { cyl(s, 0.07, 0.085, 1.0, 6, 0, 0, 0, 0x8e9092); box(s, 0.22, 0.07, 0.14, 0, 1.0, 0, 0x4a4650); box(o.shine, 0.17, 0.03, 0.1, 0, 0.99, 0.0, WARM); }
  else { cyl(s, 0.06, 0.075, 1.0, 8, 0, 0, 0, WHITE); cyl(o.shine, 0.088, 0.088, 0.03, 8, 0, 0.08, 0, CYAN); cyl(o.shine, 0.088, 0.088, 0.03, 8, 0, 0.86, 0, CYAN); o.shine.push(paint(new THREE.SphereGeometry(0.06, 8, 6).translate(0, 1.04, 0), CYAN)); }
}

/** Le bras d'un mur vers +x (du centre de la case au bord, 0 à 0,5) */
function arm(a: number, side: number, o: Add) {
  const s = o.solid;
  if (a === 1) {
    for (let i = 1; i <= 2; i++) {
      const t = i * 0.2, h = 0.74 + ((side * 7 + i * 5) % 5) * 0.03;
      cyl(s, 0.075, 0.085, h, 6, t, 0, 0, WOOD);
      s.push(paint(new THREE.ConeGeometry(0.075, 0.17, 6).translate(t, h + 0.085, 0), TIP));
    }
    // les cordes qui lient les pieux (un tour à mi-hauteur et vers le haut)
    for (const y of [0.3, 0.62]) { box(s, 0.5, 0.035, 0.2, 0.25, y, 0, HEMP); }
    box(s, 0.5, 0.05, 0.045, 0.25, 0.18, 0.1, DARKWOOD);
  } else if (a === 2) {
    box(s, 0.5, 0.62, 0.22, 0.25, 0, 0, STONE);
    box(s, 0.5, 0.03, 0.225, 0.25, 0.3, 0, STONE2);
    for (const x of [0.08, 0.25, 0.42]) box(s, 0.1, 0.14, 0.26, x, 0.62, 0, STONE);
    box(s, 0.12, 0.5, 0.1, 0.3, 0, 0.15, STONE2);
  } else if (a === 3) {
    box(s, 0.5, 0.52, 0.2, 0.25, 0, 0, BRICK);
    for (const y of [0.13, 0.26, 0.39]) box(s, 0.5, 0.015, 0.205, 0.25, y, 0, 0x6a3424);
    box(s, 0.5, 0.05, 0.24, 0.25, 0.52, 0, STONE2);
    // le fil de fer barbelé : un piquet, deux fils, des barbes
    cyl(s, 0.02, 0.02, 0.34, 4, 0.25, 0.57, 0, IRON);
    for (const y of [0.74, 0.88]) {
      box(s, 0.5, 0.014, 0.014, 0.25, y, 0, IRON);
      for (let i = 0; i < 4; i++) box(s, 0.02, 0.05, 0.02, 0.07 + i * 0.12, y - 0.018, 0, IRON, 0.8);
    }
  } else if (a === 4) {
    // un élément de béton en L : la dalle debout et son patin
    box(s, 0.5, 0.85, 0.13, 0.25, 0, 0, CONCRETE);
    box(s, 0.5, 0.09, 0.34, 0.25, 0, 0.1, CONCRETE2);
    box(s, 0.5, 0.04, 0.16, 0.25, 0.85, 0, 0xaeb0b4);
    box(s, 0.012, 0.85, 0.135, 0.495, 0, 0, 0x6a6c70);
  } else {
    // le champ d'énergie entre deux piliers : rails blancs, liseré cyan, nappe translucide
    box(s, 0.5, 0.06, 0.1, 0.25, 0, 0, WHITE);
    box(s, 0.5, 0.035, 0.05, 0.25, 0.9, 0, WHITE);
    box(o.shine, 0.5, 0.014, 0.054, 0.25, 0.935, 0, CYAN);
    o.field.push(paint(new THREE.BoxGeometry(0.5, 0.8, 0.012).translate(0.25, 0.5, 0), CYAN));
  }
}

const wallCache = new Map<string, WallParts>();
/** Un pan de mur à un âge, selon ses côtés reliés (`mask` : WALL_N, E, S, W ; aucun : un court pan d'est en ouest) */
export function wallPartsAged(ageIn: number, mask: number): WallParts {
  const a = baseAgeOf(ageIn), m = mask & 15 ? mask & 15 : WALL_E | WALL_W, key = `${a}:${m}`;
  let p = wallCache.get(key);
  if (p) return p;
  const o: Add = { solid: [], shine: [], field: [] };
  node(a, o);
  for (const [bit, rot] of DIRS) {
    if (!(m & bit)) continue;
    const arms: Add = { solid: [], shine: [], field: [] };
    arm(a, bit, arms);
    for (const k of ['solid', 'shine', 'field'] as const) for (const g of arms[k]) o[k].push(g.rotateY(rot));
  }
  p = { solid: merge(o.solid), shine: o.shine.length ? merge(o.shine) : null, field: o.field.length ? merge(o.field) : null };
  wallCache.set(key, p);
  return p;
}

const gateCache = new Map<number, GateParts>();
/** Une porte à un âge (le mur d'est en ouest, fermée) : montants, battant à part, pièces lumineuses */
export function gatePartsAged(ageIn: number): GateParts {
  const a = baseAgeOf(ageIn);
  let g = gateCache.get(a);
  if (g) return g;
  if (a === 1) {
    const o = gateGeo();
    g = { solid: o.solid, leaf: o.leaf, shine: null, field: null, leafField: false, slide: false, fade: false };
  } else {
    const s: THREE.BufferGeometry[] = [], leaf: THREE.BufferGeometry[] = [], shine: THREE.BufferGeometry[] = [];
    const L = 0.7;
    if (a === 2) {
      for (const x of [-0.41, 0.41]) { box(s, 0.18, 1.15, 0.3, x, 0, 0, STONE); box(s, 0.22, 0.05, 0.34, x, 1.15, 0, STONE2); s.push(paint(new THREE.ConeGeometry(0.15, 0.2, 4).rotateY(Math.PI / 4).translate(x, 1.3, 0), 0x3a5a9a)); }
      box(s, 1, 0.14, 0.28, 0, 0.98, 0, STONE2);
      for (const x of [-0.24, 0, 0.24]) box(s, 0.1, 0.1, 0.3, x, 1.12, 0, STONE);
      // la herse relevée sous le linteau
      for (let i = -2; i <= 2; i++) box(s, 0.02, 0.2, 0.02, i * 0.14, 0.78, 0.1, IRON);
      box(s, 0.7, 0.02, 0.02, 0, 0.84, 0.1, IRON);
      // le battant : planches de bois, bandes de fer, clous
      for (let i = 0; i < 5; i++) box(leaf, L / 5 - 0.012, 0.72, 0.05, 0.07 + i * (L / 5), 0.04, 0, WOOD);
      for (const y of [0.18, 0.5]) box(leaf, L, 0.06, 0.04, L / 2, y, 0.045, IRON);
      for (const y of [0.21, 0.53]) for (let i = 0; i < 5; i++) leaf.push(paint(new THREE.SphereGeometry(0.022, 5, 4).translate(0.07 + i * 0.14, y, 0.07), 0x1a1a1e));
    } else if (a === 3) {
      for (const x of [-0.41, 0.41]) { box(s, 0.2, 1.1, 0.26, x, 0, 0, BRICK); box(s, 0.25, 0.06, 0.3, x, 1.1, 0, STONE2); cyl(s, 0.06, 0.06, 0.1, 6, x, 1.16, 0, IRON); }
      box(s, 1, 0.1, 0.14, 0, 1.0, 0, CAST);
      for (let i = -3; i <= 3; i++) s.push(paint(new THREE.SphereGeometry(0.02, 5, 4).translate(i * 0.13, 1.05, 0.075), IRON));
      for (let i = 0; i < 5; i++) box(leaf, L / 5 - 0.01, 0.84, 0.05, 0.07 + i * (L / 5), 0.04, 0, CAST);
      for (const y of [0.16, 0.46, 0.78]) { box(leaf, L, 0.06, 0.04, L / 2, y, 0.045, IRON); for (let i = 0; i < 5; i++) leaf.push(paint(new THREE.SphereGeometry(0.02, 5, 4).translate(0.07 + i * 0.14, y + 0.03, 0.068), 0x16161a)); }
      leaf.push(paint(new THREE.BoxGeometry(0.86, 0.05, 0.04).rotateZ(0.7).translate(L / 2, 0.46, 0.05), IRON));
    } else if (a === 4) {
      for (const x of [-0.41, 0.41]) { box(s, 0.16, 1.2, 0.22, x, 0, 0, CONCRETE); box(s, 0.2, 0.07, 0.16, x, 1.2, 0, 0x4a4650); box(shine, 0.14, 0.03, 0.1, x, 1.19, 0, WARM); }
      box(s, 1, 0.04, 0.06, 0, 0, 0.17, 0x4a4650);
      box(s, 1, 0.08, 0.16, 0, 1.0, 0, CONCRETE2);
      // le panneau de métal qui coulisse devant le mur : lames horizontales
      box(leaf, L, 0.84, 0.05, L / 2, 0.04, 0, 0x8e9aa8);
      for (const y of [0.12, 0.32, 0.52, 0.72]) box(leaf, L, 0.035, 0.06, L / 2, y, 0, 0x5a6270);
      box(leaf, 0.04, 0.84, 0.07, L - 0.02, 0.04, 0, 0xe0b030);
    } else {
      for (const x of [-0.41, 0.41]) {
        cyl(s, 0.07, 0.085, 1.25, 8, x, 0, 0, WHITE);
        cyl(shine, 0.098, 0.098, 0.03, 8, x, 0.08, 0, CYAN); cyl(shine, 0.098, 0.098, 0.03, 8, x, 1.0, 0, CYAN);
        shine.push(paint(new THREE.SphereGeometry(0.065, 8, 6).translate(x, 1.29, 0), CYAN));
      }
      box(shine, 1, 0.02, 0.03, 0, 1.22, 0, CYAN);
      box(s, 0.74, 0.04, 0.1, 0, 0, 0, WHITE);
      leaf.push(paint(new THREE.BoxGeometry(L, 1.02, 0.014).translate(L / 2, 0.58, 0), CYAN));
    }
    g = { solid: merge(s), leaf: merge(leaf), shine: shine.length ? merge(shine) : null, field: null, leafField: a === 5, slide: a === 4, fade: a === 5 };
  }
  gateCache.set(a, g);
  return g;
}
