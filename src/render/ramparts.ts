import * as THREE from 'three';
import { Parts } from './parts';
import { hash2 } from '../core/rng';
import { flag, type DefKit } from './defenses';
import { WALL_N, WALL_E, WALL_S, WALL_W, gateAlongX } from './hellBase';

/**
 * Les remparts du village, âge par âge : un pan de mur par case, raccordé à ses voisins (un nœud au centre de la case, un bras
 * vers chaque côté relié jusqu'au bord : deux pans voisins se rejoignent sans couture), et la porte de la ville. Même faction que
 * les tours de garde et les casernes (oriflamme rouge à liseré d'or, boule dorée). 1 Antiquité : palissade de pieux liés, chemin
 * de ronde, guérites de bois ; 2 Médiéval : muraille de pierre crénelée, tours rondes à toit d'ardoise ; 3 Industriel : enceinte
 * de brique, grille de fer, lanternes à gaz, tours carrées ; 4 Moderne : mur de béton, barbelés, projecteurs, pylônes ; 5
 * Futuriste : pylônes blancs et champ d'énergie cyan. Le nœud change selon ses côtés reliés : simple pilier en ligne droite,
 * tourelle (ou pylône) aux bouts, aux angles et aux carrefours, avec torche ou lampe la nuit et le drapeau aux bouts
 */

const RED = 0xc8402e, GOLD = 0xe8c66a, FLAME = 0xffb15c, WARM = 0xffd890, IRON = 0x4a4f56;
const PI = Math.PI;
const H = (i: number, k: number) => hash2(i, k, 91);
const dk = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
/** Les côtés reliés, avec la rotation qui amène un bras construit vers +x sur le côté voulu */
const DIRS: [number, number][] = [[WALL_N, PI / 2], [WALL_E, 0], [WALL_S, -PI / 2], [WALL_W, PI]];

/** Ce qu'est le nœud d'une case selon ses côtés reliés : bout de mur, ligne droite, angle, carrefour */
export type NodeKind = 'end' | 'straight' | 'corner' | 'junction';
export function nodeKind(mask: number): NodeKind {
  const m = mask & 15, n = [WALL_N, WALL_E, WALL_S, WALL_W].filter((b) => m & b).length;
  if (n <= 1) return 'end';
  if (n >= 3) return 'junction';
  return m === (WALL_N | WALL_S) || m === (WALL_E | WALL_W) ? 'straight' : 'corner';
}

/** Verse les pièces de `sub` dans `p`, tournées de `ry` autour de l'axe de la case (les couleurs de chaque pièce sont gardées) */
function pour(p: Parts, sub: Parts, ry: number) {
  for (const g of sub.body) p.body.push(ry ? g.rotateY(ry) : g);
  for (const g of sub.glow) p.glow.push(ry ? g.rotateY(ry) : g);
}

/** Miroir d'une géométrie (x → −x, ou z → −z) : les triangles sont retournés pour que les faces restent tournées dehors */
function mirror(g: THREE.BufferGeometry, axis: 'x' | 'z') {
  g.scale(axis === 'x' ? -1 : 1, 1, axis === 'z' ? -1 : 1);
  for (const name of ['position', 'normal', 'color', 'aLight']) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!a) continue;
    const arr = a.array as Float32Array, n = a.itemSize;
    for (let t = 0; t + 3 * n <= arr.length; t += 3 * n) for (let k = 0; k < n; k++) { const tmp = arr[t + n + k]; arr[t + n + k] = arr[t + 2 * n + k]; arr[t + 2 * n + k] = tmp; }
    a.needsUpdate = true;
  }
  return g;
}

/**
 * Oriente un bras dessiné vers +x (face extérieure vers +z, chemin de ronde vers −z) sur le côté `bit` : à l'est tel quel, au
 * nord tourné d'un quart de tour, à l'ouest et au sud en miroir (et non tourné d'un demi-tour) : le chemin de ronde reste du
 * même côté tout le long d'un mur droit, au lieu de passer d'un bord à l'autre à chaque case
 */
function orient(p: Parts, sub: Parts, bit: number) {
  for (const [list, into] of [[sub.body, p.body], [sub.glow, p.glow]] as const) {
    for (const g of list) {
      if (bit === WALL_E) into.push(g);
      else if (bit === WALL_N) into.push(g.rotateY(PI / 2));
      else if (bit === WALL_W) into.push(mirror(g, 'x'));
      else into.push(mirror(g.rotateY(PI / 2), 'z'));
    }
  }
}

/**
 * Le chemin de ronde de chaque âge (repère du bras est : x le long du mur, z < 0 vers l'intérieur) : hauteur où marche la
 * sentinelle et son écart à l'axe du mur ; `gate` : le dessus de la porte, où elle passe ; `frame` : la couleur de la porte
 * percée dans la tour ; `tower` : où se tient la sentinelle d'une tour de garde (dans le repère de la tour)
 */
export interface Walkway { y: number; z: number; gate: number; frame: number; tower: [number, number, number] }
const WALK_ANTIQUE: Walkway = { y: 0.325, z: -0.155, gate: 0.8, frame: 0x6a4426, tower: [0, 1.1, 0.2] };
export const WALK: Walkway[] = [
  WALK_ANTIQUE, WALK_ANTIQUE,
  { y: 0.43, z: -0.02, gate: 0.89, frame: 0x6f6a66, tower: [0, 1.065, 0.24] },
  { y: 0.44, z: -0.04, gate: 0.92, frame: 0x8a8590, tower: [0, 1.18, 0.26] },
  // moderne : la passerelle d'acier à l'intérieur ; la sentinelle de la tour sur le toit du blockhaus
  { y: 0.52, z: -0.13, gate: 1.01, frame: 0x4a4650, tower: [0.22, 0.37, 0.22] },
  // futuriste : sur la passerelle lumineuse ; la tour n'a pas de plate-forme, la sentinelle garde son embase
  { y: 0.675, z: -0.1, gate: 1.03, frame: 0x4a5664, tower: [0.25, 0.08, 0.25] },
];
/** Rayon de la tour de garde de chaque âge à la hauteur du chemin de ronde : le mur vient s'y souder */
export const TOWER_R = [0.25, 0.25, 0.263, 0.25, 0.15, 0.15];
/** Dans le masque d'un rempart, les bits << TOWER_SHIFT disent qu'une tour de garde est le voisin de ce côté */
export const TOWER_SHIFT = 4;

/**
 * Le raccord d'un bras à une tour de garde voisine : le mur continue au-delà du bord de la case jusqu'à la face de la tour (les
 * pièces qui finiraient à l'intérieur de la tour sont retirées), et une porte de chemin de ronde est percée dans cette face,
 * avec sa marche
 */
function towerJoin(a: number, sub: Parts) {
  const ext = new Parts(), face = 1 - TOWER_R[a], wk = WALK[a];
  ARMS[a](ext, 9);
  for (const k of ['body', 'glow'] as const) for (const g of ext[k]) {
    g.translate(0.5, 0, 0);
    g.computeBoundingBox();
    if (g.boundingBox!.min.x > face + 0.04) { g.dispose(); continue; }
    sub[k].push(g);
  }
  const dz = a <= 1 ? wk.z : wk.z * 0.5;
  sub.box(0.03, 0.26, 0.13, face + 0.012, wk.y - 0.005, dz, 0x24201c);
  for (const s of [-1, 1]) sub.box(0.05, 0.28, 0.025, face + 0.01, wk.y - 0.01, dz + s * 0.077, wk.frame);
  sub.box(0.05, 0.03, 0.18, face + 0.01, wk.y + 0.26, dz, wk.frame);
  sub.box(0.14, 0.02, 0.15, face - 0.06, wk.y - 0.02, dz, dk(wk.frame, 1.1));
}

/** Torche murale : support, coupelle, flamme qui luit la nuit */
function torch(p: Parts, x: number, y: number, z: number, wood = 0x6e523c) {
  p.cyl(0.009, 0.012, 0.12, 5, x, y, z, wood);
  p.cyl(0.024, 0.012, 0.03, 6, x, y + 0.11, z, IRON);
  p.box(0.038, 0.055, 0.038, x, y + 0.14, z, FLAME, 0, true);
}
/** Lanterne pendue à une potence (gaz, puis électrique) */
function lantern(p: Parts, x: number, y: number, z: number, metal = IRON, light = WARM) {
  p.box(0.012, 0.012, 0.09, x, y, z - 0.045, metal);
  p.box(0.05, 0.012, 0.05, x, y - 0.012, z - 0.09, metal);
  p.box(0.036, 0.05, 0.036, x, y - 0.062, z - 0.09, light, 0, true);
  p.cone(0.03, 0.025, 4, x, y - 0.012, z - 0.09, metal, false, PI / 4);
}
/** Bouclier rond rouge à bordure et ombilic d'or, accroché de face vers +z */
function shield(p: Parts, x: number, y: number, z: number, r: number) {
  p.add(new THREE.CylinderGeometry(r, r, 0.014, 10).rotateX(PI / 2), x, y, z, RED);
  p.add(new THREE.TorusGeometry(r, 0.006, 4, 12), x, y, z + 0.008, GOLD);
  p.sphere(r * 0.3, x, y, z + 0.012, GOLD);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Les bras : du centre de la case (x = 0) au bord (x = 0,5), le mur dans l'axe x, sa face extérieure vers +z            */
/* ------------------------------------------------------------------------------------------------------------------ */

function armPalisade(p: Parts, side: number) {
  const wd = 0x9a6a3c, dark = 0x6a4426, tip = 0xc89a6a, hemp = 0xc8b078;
  // les pieux pointus, serrés, de hauteurs qui varient un peu
  for (let i = 0; i < 5; i++) {
    const x = 0.05 + i * 0.1, h = 0.46 + H(i + side * 7, 1) * 0.06;
    p.cyl(0.048, 0.054, h, 6, x, 0, 0, dk(wd, 0.9 + 0.2 * H(i, side + 2)));
    p.cone(0.048, 0.1, 6, x, h, 0, tip);
  }
  // deux traverses et les cordes qui lient les pieux
  for (const y of [0.16, 0.36]) { p.box(0.5, 0.035, 0.03, 0.25, y, -0.065, dark); p.box(0.5, 0.012, 0.11, 0.25, y + 0.035, 0, hemp); }
  // le chemin de ronde derrière : plancher sur deux poteaux, garde-corps
  for (const x of [0.12, 0.38]) p.box(0.03, 0.3, 0.03, x, 0, -0.2, dark);
  p.box(0.5, 0.025, 0.17, 0.25, 0.3, -0.155, dk(wd, 0.85));
  p.box(0.5, 0.012, 0.012, 0.25, 0.42, -0.235, dark);
  for (const x of [0.12, 0.38]) p.box(0.012, 0.12, 0.012, x, 0.325, -0.235, dark);
  // des pieux de défense plantés en biais devant
  for (const x of [0.16, 0.36]) p.add(new THREE.ConeGeometry(0.014, 0.2, 4).translate(0, 0.1, 0), x, 0.02, 0.13, dark, 0, false, 0, 0.9);
}

function armStone(p: Parts, side: number) {
  const stone = 0xa8a19a, edge = 0x8d867b, dark = 0x6f6a66;
  p.box(0.5, 0.4, 0.2, 0.25, 0, 0, stone);
  for (const y of [0.1, 0.2, 0.3]) p.box(0.5, 0.008, 0.206, 0.25, y, 0, dk(stone, 0.86));
  // quelques blocs en saillie, le chaperon, le parapet intérieur
  for (let i = 0; i < 4; i++) p.box(0.07, 0.05, 0.208, 0.07 + i * 0.12 + H(i, side + 3) * 0.03, 0.04 + Math.floor(H(i, 9) * 3) * 0.1, 0, dk(stone, 0.92 + 0.16 * H(i, 4)));
  p.box(0.5, 0.03, 0.24, 0.25, 0.4, 0, edge);
  p.box(0.5, 0.05, 0.03, 0.25, 0.43, -0.1, edge);
  // les créneaux côté extérieur, la fente de tir qui luit, le contrefort
  for (const x of [0.08, 0.25, 0.42]) p.box(0.09, 0.1, 0.07, x, 0.43, 0.08, dk(stone, 0.95 + 0.1 * H(x * 10, side)));
  p.box(0.024, 0.08, 0.012, 0.25, 0.2, 0.1, WARM, 0, true);
  p.box(0.05, 0.016, 0.03, 0.25, 0.28, 0.104, dark); p.box(0.05, 0.016, 0.03, 0.25, 0.19, 0.104, dark);
  p.box(0.08, 0.3, 0.07, 0.25, 0, 0.13, edge); p.box(0.1, 0.03, 0.09, 0.25, 0.3, 0.13, dark);
  // les corbeaux sous le chaperon, un anneau de fer, la mousse au pied
  for (const x of [0.12, 0.38]) p.box(0.04, 0.05, 0.04, x, 0.35, 0.11, dark);
  p.add(new THREE.TorusGeometry(0.02, 0.005, 4, 8), 0.4, 0.12, 0.105, IRON);
  for (let i = 0; i < 3; i++) p.box(0.08, 0.03, 0.016, 0.08 + i * 0.16, 0.0, 0.104, dk(0x5a7a3a, 0.9 + 0.2 * H(i, side + 11)));
}

function armBrick(p: Parts, side: number) {
  const brick = 0xa4553a, mortar = 0x6a3424, cap = 0x8a8590, iron = 0x2a2a30;
  p.box(0.5, 0.4, 0.16, 0.25, 0, 0, brick);
  for (const y of [0.08, 0.16, 0.24, 0.32]) p.box(0.5, 0.012, 0.164, 0.25, y, 0, mortar);
  for (let i = 0; i < 6; i++) p.box(0.012, 0.07, 0.164, 0.04 + i * 0.085 + (i % 2) * 0.03, 0.09 + (i % 3) * 0.08, 0, mortar);
  // chaperon de pierre, pilastre à mi-chemin, grille de fer à pointes au sommet
  p.box(0.5, 0.04, 0.2, 0.25, 0.4, 0, cap);
  p.box(0.1, 0.46, 0.2, 0.25, 0, 0, dk(brick, 0.85)); p.box(0.12, 0.03, 0.22, 0.25, 0.46, 0, cap);
  // (la grille sur le bord extérieur : derrière, le chaperon fait chemin de ronde)
  for (const y of [0.48, 0.58]) p.box(0.5, 0.012, 0.012, 0.25, y, 0.06, iron);
  for (let i = 0; i < 5; i++) { const x = 0.05 + i * 0.1; p.cyl(0.007, 0.007, 0.2, 4, x, 0.44, 0.06, iron); p.cone(0.012, 0.035, 4, x, 0.64, 0.06, iron); }
  // la lanterne à gaz sur le pilastre, côté rue
  lantern(p, 0.25, 0.58, 0.19, iron);
  void side;
}

function armConcrete(p: Parts, side: number) {
  const conc = 0xc8cacc, conc2 = 0x9a9ca0, steel = 0x6a6c70, yellow = 0xe0b030;
  p.box(0.5, 0.5, 0.1, 0.25, 0, 0, conc);
  p.box(0.5, 0.08, 0.22, 0.25, 0, 0, conc2);
  p.box(0.5, 0.03, 0.14, 0.25, 0.5, 0, 0xaeb0b4);
  // les joints de dilatation, les bandes jaunes et noires au pied côté rue
  for (const x of [0.17, 0.33]) p.box(0.01, 0.5, 0.104, x, 0, 0, steel);
  for (let i = 0; i < 4; i++) p.box(0.06, 0.04, 0.006, 0.07 + i * 0.12, 0.09, 0.052, i % 2 ? yellow : 0x2a2a2e);
  // le barbelé en rouleaux sur ses potences, deux fils tendus
  for (const x of [0.1, 0.4]) p.add(new THREE.BoxGeometry(0.012, 0.16, 0.012).translate(0, 0.08, 0), x, 0.52, 0, steel, 0, false, 0, 0.35);
  for (const y of [0.6, 0.66]) p.box(0.5, 0.008, 0.008, 0.25, y, 0.03, steel);
  for (let i = 0; i < 3; i++) p.add(new THREE.TorusGeometry(0.035, 0.004, 4, 8).rotateY(PI / 2), 0.08 + i * 0.17, 0.6, 0.03, 0x8e9092);
  // un panneau d'avertissement rouge, un petit témoin lumineux
  p.box(0.06, 0.05, 0.006, 0.25, 0.3, 0.054, 0xd8dde2); p.box(0.05, 0.04, 0.004, 0.25, 0.305, 0.058, 0xd84a3e);
  p.box(0.012, 0.012, 0.01, 0.25, 0.44, 0.054, 0x5ae08a, 0, true);
  // la passerelle d'acier du chemin de ronde, côté intérieur : caillebotis sur ses consoles, lisse de garde-corps
  p.box(0.5, 0.02, 0.16, 0.25, 0.5, -0.13, steel);
  for (const x of [0.12, 0.38]) { p.box(0.03, 0.03, 0.12, x, 0.47, -0.11, 0x4a4650); p.box(0.012, 0.14, 0.012, x, 0.52, -0.2, 0x4a4650); }
  p.box(0.5, 0.01, 0.01, 0.25, 0.65, -0.2, 0x8e9092);
  void side;
}

function armEnergy(p: Parts, side: number) {
  const white = 0xdfe6ee, cyan = 0x40f0ff, dkc = 0x4a5664;
  // le rail au sol et sa lisse haute, liserés cyan
  p.box(0.5, 0.06, 0.14, 0.25, 0, 0, white); p.box(0.5, 0.012, 0.15, 0.25, 0.06, 0, cyan, 0, 'neon');
  p.box(0.5, 0.04, 0.08, 0.25, 0.62, 0, white); p.box(0.5, 0.012, 0.085, 0.25, 0.66, 0, cyan, 0, 'neon');
  // les émetteurs, leurs anneaux, et la nappe d'énergie en barres lumineuses
  for (const x of [0.17, 0.33]) {
    p.cyl(0.018, 0.022, 0.56, 6, x, 0.06, 0, dkc);
    for (const y of [0.16, 0.5]) p.add(new THREE.TorusGeometry(0.03, 0.006, 3, 10).rotateX(PI / 2), x, y, 0, cyan, 0, 'neon');
  }
  for (let i = 0; i < 4; i++) p.box(0.5, 0.012, 0.016, 0.25, 0.14 + i * 0.13, 0, cyan, 0, 'neon');
  for (let i = 0; i < 3; i++) p.box(0.012, 0.5, 0.01, 0.08 + i * 0.17, 0.1, 0, 0x9af4ff, 0, 'neon');
  // la passerelle lumineuse du chemin de ronde, en encorbellement côté intérieur
  p.box(0.5, 0.015, 0.16, 0.25, 0.66, -0.1, white);
  p.box(0.5, 0.008, 0.012, 0.25, 0.675, -0.174, cyan, 0, 'neon');
  for (const x of [0.12, 0.38]) p.box(0.03, 0.03, 0.1, x, 0.63, -0.1, dkc);
  void side;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Les nœuds : un pilier en ligne droite ; une tourelle aux bouts, aux angles et aux carrefours (torche, drapeau)        */
/* ------------------------------------------------------------------------------------------------------------------ */

function nodePalisade(p: Parts, kit: DefKit, k: NodeKind) {
  const wd = 0x9a6a3c, dark = 0x6a4426, tip = 0xc89a6a, thatch = 0xd8bc74;
  if (k === 'straight') { p.cyl(0.07, 0.08, 0.56, 7, 0, 0, 0, dark); p.cone(0.07, 0.12, 7, 0, 0.56, 0, tip); p.cyl(0.085, 0.085, 0.04, 7, 0, 0.3, 0, 0xc8b078); torch(p, 0, 0.36, 0.1); return; }
  // la guérite : quatre poteaux, plancher, garde-corps, toit de chaume, torche, bouclier et drapeau
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.034, 0.78, 0.034, sx * 0.17, 0, sz * 0.17, dark);
  p.cyl(0.08, 0.09, 0.5, 7, 0, 0, 0, dk(wd, 0.9)); p.cone(0.08, 0.12, 7, 0, 0.5, 0, tip);
  p.box(0.4, 0.03, 0.4, 0, 0.5, 0, dk(wd, 0.85));
  for (let i = 0; i < 4; i++) { const a = (i * PI) / 2; p.box(0.4, 0.012, 0.012, Math.sin(a) * 0.19, 0.64, Math.cos(a) * 0.19, dark, a); p.box(0.4, 0.05, 0.012, Math.sin(a) * 0.19, 0.53, Math.cos(a) * 0.19, wd, a); }
  p.pyramid(0.52, 0.1, 0.52, 0, 0.78, 0, dk(thatch, 0.8)); p.pyramid(0.46, 0.26, 0.46, 0, 0.8, 0, thatch);
  for (const s of [-1, 1]) p.box(0.012, 0.012, 0.5, s * 0.19, 0.8, 0, dark);
  torch(p, 0, 0.56, 0.21);
  shield(p, 0.12, 0.62, 0.195, 0.045);
  if (k !== 'junction') flag(p, kit, 0, 1.04, 0, 0.32, 0.16, 0.09);
}

function nodeStone(p: Parts, kit: DefKit, k: NodeKind) {
  const stone = 0xa8a19a, edge = 0x8d867b, dark = 0x6f6a66, roof = 0x3a5a9a;
  if (k === 'straight') { p.box(0.26, 0.46, 0.26, 0, 0, 0, edge); p.box(0.3, 0.03, 0.3, 0, 0.46, 0, dark); for (const s of [-1, 1]) p.box(0.09, 0.1, 0.09, s * 0.1, 0.49, 0, stone); return; }
  // la tour ronde : talus, fût en assises, mâchicoulis, créneaux, toit d'ardoise bleue, torche et fenêtre qui luit
  p.cyl(0.21, 0.24, 0.1, 10, 0, 0, 0, dark);
  p.cyl(0.2, 0.21, 0.56, 10, 0, 0.1, 0, stone);
  for (const y of [0.22, 0.36, 0.5]) p.add(new THREE.CylinderGeometry(0.204, 0.204, 0.008, 10, 1, true), 0, y, 0, dk(stone, 0.85));
  p.cyl(0.24, 0.2, 0.08, 10, 0, 0.66, 0, edge);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; p.box(0.08, 0.09, 0.06, Math.sin(a) * 0.21, 0.74, Math.cos(a) * 0.21, dk(stone, 0.95 + 0.1 * H(i, 5)), a); }
  p.cone(0.24, 0.3, 10, 0, 0.8, 0, roof); p.cone(0.03, 0.08, 6, 0, 1.08, 0, dark);
  p.box(0.03, 0.08, 0.012, 0, 0.42, 0.205, WARM, 0, true); p.box(0.06, 0.016, 0.03, 0, 0.5, 0.21, dark);
  torch(p, 0.14, 0.4, 0.17);
  shield(p, -0.1, 0.5, 0.185, 0.05);
  if (k !== 'junction') flag(p, kit, 0, 1.1, 0, 0.3, 0.16, 0.09);
}

function nodeBrick(p: Parts, kit: DefKit, k: NodeKind) {
  const brick = 0xa4553a, cap = 0x8a8590, iron = 0x2a2a30, slate = 0x4a4c56;
  if (k === 'straight') { p.box(0.24, 0.52, 0.24, 0, 0, 0, dk(brick, 0.85)); for (const y of [0.1, 0.2, 0.3, 0.4]) p.box(0.244, 0.01, 0.244, 0, y, 0, 0x6a3424); p.box(0.28, 0.04, 0.28, 0, 0.52, 0, cap); p.sphere(0.04, 0, 0.6, 0, iron); return; }
  // la tour carrée de brique : chaînages de pierre, corniche, toit d'ardoise à quatre pans, girouette, lanterne et drapeau
  p.box(0.4, 0.06, 0.4, 0, 0, 0, cap);
  p.box(0.36, 0.66, 0.36, 0, 0.06, 0, brick);
  for (let i = 0; i < 7; i++) p.box(0.364, 0.01, 0.364, 0, 0.12 + i * 0.09, 0, 0x6a3424);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 6; i++) p.box(i % 2 ? 0.08 : 0.05, 0.08, i % 2 ? 0.05 : 0.08, sx * 0.16, 0.08 + i * 0.1, sz * 0.16, dk(cap, 0.95 + 0.1 * H(i, sx + sz * 3)));
  p.box(0.44, 0.04, 0.44, 0, 0.72, 0, cap);
  for (const a of [0, PI / 2, PI, -PI / 2]) { p.box(0.06, 0.1, 0.014, Math.sin(a) * 0.182, 0.46, Math.cos(a) * 0.182, WARM, a, true); p.box(0.09, 0.016, 0.03, Math.sin(a) * 0.19, 0.56, Math.cos(a) * 0.19, cap, a); }
  p.pyramid(0.48, 0.3, 0.48, 0, 0.76, 0, slate);
  p.cyl(0.006, 0.006, 0.12, 4, 0, 1.06, 0, iron); p.box(0.08, 0.012, 0.006, 0.02, 1.16, 0, iron); p.cone(0.012, 0.03, 4, 0.06, 1.15, 0, iron, false, -PI / 2);
  lantern(p, 0.12, 0.44, 0.26, iron);
  shield(p, -0.1, 0.3, 0.185, 0.045);
  if (k !== 'junction') flag(p, kit, -0.14, 0.76, -0.14, 0.34, 0.16, 0.09, iron);
}

function nodeConcrete(p: Parts, kit: DefKit, k: NodeKind) {
  const conc = 0xc8cacc, conc2 = 0x9a9ca0, steel = 0x4a4650, light = 0xfff0b0;
  if (k === 'straight') { p.box(0.2, 0.58, 0.2, 0, 0, 0, conc2); p.box(0.24, 0.04, 0.24, 0, 0.58, 0, steel); p.sphere(0.02, 0, 0.64, 0, 0xff4a4a); p.box(0.012, 0.012, 0.012, 0, 0.66, 0, 0xff4a4a, 0, true); return; }
  // le pylône de béton : socle, fût, plateforme, projecteur, caméra, antenne, drapeau
  p.box(0.4, 0.08, 0.4, 0, 0, 0, conc2);
  p.box(0.3, 0.82, 0.3, 0, 0.08, 0, conc);
  for (const y of [0.36, 0.64]) p.box(0.304, 0.014, 0.304, 0, y, 0, 0x8e9092);
  for (let i = 0; i < 3; i++) p.box(0.06, 0.04, 0.006, -0.1 + i * 0.1, 0.16, 0.152, i % 2 ? 0x2a2a2e : 0xe0b030);
  p.box(0.4, 0.04, 0.4, 0, 0.9, 0, steel);
  for (const a of [0, PI / 2, PI, -PI / 2]) p.box(0.4, 0.012, 0.012, Math.sin(a) * 0.19, 1.02, Math.cos(a) * 0.19, steel, a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.012, 0.1, 0.012, sx * 0.19, 0.94, sz * 0.19, steel);
  // le projecteur tourné vers la rue, sa lumière ; la caméra ; le témoin rouge
  p.box(0.03, 0.06, 0.03, 0, 0.94, 0.08, steel); p.add(new THREE.BoxGeometry(0.14, 0.09, 0.08).translate(0, 0, 0), 0, 1.03, 0.1, steel, 0, false, 0, 0.5);
  p.add(new THREE.BoxGeometry(0.12, 0.07, 0.01), 0, 1.01, 0.145, light, 0, true, 0, 0.5);
  p.box(0.03, 0.03, 0.06, 0.12, 0.8, 0.15, steel); p.box(0.02, 0.02, 0.012, 0.12, 0.805, 0.185, 0x1a1a1e);
  p.cyl(0.006, 0.008, 0.3, 4, -0.12, 0.94, -0.12, steel); p.sphere(0.014, -0.12, 1.25, -0.12, 0xff4a4a); p.box(0.01, 0.01, 0.01, -0.12, 1.26, -0.12, 0xff4a4a, 0, true);
  p.box(0.06, 0.2, 0.004, -0.1, 0.5, 0.152, 0xd8dde2); p.box(0.05, 0.14, 0.003, -0.1, 0.53, 0.155, 0xd84a3e);
  if (k !== 'junction') flag(p, kit, 0.12, 0.94, -0.12, 0.36, 0.16, 0.09, steel);
}

function nodeEnergy(p: Parts, kit: DefKit, k: NodeKind) {
  const white = 0xdfe6ee, cyan = 0x40f0ff, dkc = 0x4a5664;
  if (k === 'straight') { p.cyl(0.055, 0.07, 0.72, 8, 0, 0, 0, white); for (const y of [0.08, 0.62]) p.add(new THREE.TorusGeometry(0.075, 0.008, 4, 10).rotateX(PI / 2), 0, y, 0, cyan, 0, 'neon'); p.sphere(0.05, 0, 0.76, 0, cyan); p.box(0.02, 0.02, 0.02, 0, 0.78, 0, cyan, 0, 'neon'); return; }
  // le grand pylône : socle, fût à facettes, trois anneaux lumineux, couronne flottante, balise, étendard holographique
  p.cyl(0.2, 0.24, 0.05, 8, 0, 0, 0, dkc); p.add(new THREE.TorusGeometry(0.21, 0.008, 4, 16).rotateX(PI / 2), 0, 0.055, 0, cyan, 0, 'neon');
  p.cyl(0.07, 0.11, 0.98, 8, 0, 0.05, 0, white);
  for (const y of [0.12, 0.5, 0.86]) p.add(new THREE.TorusGeometry(0.11, 0.012, 4, 12).rotateX(PI / 2), 0, y, 0, cyan, 0, 'neon');
  for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; p.box(0.03, 0.6, 0.03, Math.sin(a) * 0.1, 0.2, Math.cos(a) * 0.1, dkc, a); }
  p.add(new THREE.TorusGeometry(0.18, 0.016, 5, 16).rotateX(PI / 2), 0, 1.1, 0, white); p.add(new THREE.TorusGeometry(0.18, 0.006, 3, 16).rotateX(PI / 2), 0, 1.12, 0, cyan, 0, 'neon');
  p.sphere(0.06, 0, 1.08, 0, cyan); p.sphere(0.07, 0, 1.08, 0, 0x9af4ff, 1);
  p.box(0.02, 0.02, 0.02, 0, 1.2, 0, cyan, 0, 'neon');
  // l'étendard : la faction en lumière, rouge à liseré d'or, qui flotte
  p.cyl(0.008, 0.01, 0.34, 5, 0.14, 0.98, -0.1, dkc);
  const f = kit.sway([0.14, 0, -0.1], [0, 1, 0], 0.3, 0.9);
  f.box(0.16, 0.09, 0.006, 0.09, 1.2, 0, RED, 0, 'neon'); f.box(0.16, 0.012, 0.008, 0.09, 1.2, 0, GOLD, 0, 'neon'); f.box(0.16, 0.012, 0.008, 0.09, 1.278, 0, GOLD, 0, 'neon');
  // les projecteurs du pylône, vers la rue
  p.box(0.08, 0.04, 0.05, 0, 0.9, 0.12, dkc); p.box(0.06, 0.02, 0.01, 0, 0.9, 0.145, 0xfff0b0, 0, true);
  void k;
}

const ARMS = [armPalisade, armPalisade, armStone, armBrick, armConcrete, armEnergy];
const NODES = [nodePalisade, nodePalisade, nodeStone, nodeBrick, nodeConcrete, nodeEnergy];
export const rampartAge = (age: number) => Math.max(1, Math.min(5, age));

/**
 * Un pan de rempart à l'âge `age`, selon ses côtés reliés (`mask` : WALL_N, E, S, W ; aucun : un court pan d'est en ouest) ;
 * les bits << TOWER_SHIFT disent qu'une tour de garde est de ce côté : le bras s'y soude
 */
export function rampartWall(p: Parts, age: number, mask: number, kit: DefKit) {
  const a = rampartAge(age), m = mask & 15 ? mask & 15 : WALL_E | WALL_W, towers = (mask >> TOWER_SHIFT) & 15;
  NODES[a](p, kit, nodeKind(m));
  for (const [bit] of DIRS) {
    if (!(m & bit)) continue;
    const sub = new Parts();
    ARMS[a](sub, bit);
    if (towers & bit) towerJoin(a, sub);
    orient(p, sub, bit);
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* La porte de la ville : deux tours (de x = 0,3 à 0,5, pour toucher le pan voisin), le passage entre elles, un couronnement  */
/* et les battants ouverts vers l'intérieur (-z) ; le mur court d'est en ouest, la vue la tourne pour un mur nord-sud         */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Un battant grand ouvert, accroché à la tour `s` (−1 : ouest, 1 : est), large de `w`, haut de `h` : rabattu contre le
 * piédroit, le long du passage (vers -z, l'intérieur), hors de la chaussée (|x| < 0,3) qu'il ne barre jamais
 */
function leaf(p: Parts, s: number, w: number, h: number, d: number, color: number, draw?: (q: Parts) => void) {
  const th = -s * (PI / 2), cx = s * (0.3 + d / 2 + 0.006), cz = -0.1 - w / 2;
  p.box(w, h, d, cx, 0.02, cz, color, th);
  if (draw) { const q = new Parts(); draw(q); for (const g of q.body) p.body.push(g.rotateY(th).translate(cx, 0, cz)); for (const g of q.glow) p.glow.push(g.rotateY(th).translate(cx, 0, cz)); }
}

function gatePalisade(p: Parts, kit: DefKit) {
  const wd = 0x9a6a3c, dark = 0x6a4426, tip = 0xc89a6a, thatch = 0xd8bc74;
  for (const s of [-1, 1]) {
    // la tour : gros pieux serrés en carré, plancher de guet, garde-corps, toit de chaume
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { if (i === 1 && j === 1) continue; const h = 0.74 + H(i * 3 + j, s + 2) * 0.06; p.cyl(0.036, 0.04, h, 6, s * (0.33 + i * 0.07), 0, -0.07 + j * 0.07, dk(wd, 0.9 + 0.2 * H(i, j))); p.cone(0.036, 0.08, 6, s * (0.33 + i * 0.07), h, -0.07 + j * 0.07, tip); }
    p.box(0.2, 0.025, 0.2, s * 0.4, 0.78, 0, dk(wd, 0.85));
    for (const [x, z, a] of [[0, 0.1, 0], [0, -0.1, 0], [0.1, 0, PI / 2], [-0.1, 0, PI / 2]] as number[][]) p.box(0.2, 0.012, 0.012, s * 0.4 + x, 0.9, z, dark, a);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.02, 0.26, 0.02, s * 0.4 + sx * 0.095, 0.78, sz * 0.095, dark);
    p.pyramid(0.26, 0.16, 0.26, s * 0.4, 1.02, 0, thatch);
    torch(p, s * 0.3, 0.5, 0.13);
    shield(p, s * 0.4, 0.6, 0.105, 0.04);
  }
  // le linteau et la passerelle entre les tours, l'écriteau à la faction
  p.box(0.6, 0.06, 0.12, 0, 0.72, -0.02, dark);
  p.box(0.6, 0.02, 0.16, 0, 0.78, -0.02, dk(wd, 0.85));
  p.box(0.6, 0.012, 0.012, 0, 0.9, 0.06, dark); for (const x of [-0.2, 0, 0.2]) p.box(0.012, 0.12, 0.012, x, 0.78, 0.06, dark);
  p.box(0.24, 0.1, 0.02, 0, 0.6, 0.06, RED); p.box(0.24, 0.014, 0.024, 0, 0.6, 0.062, GOLD); p.box(0.24, 0.014, 0.024, 0, 0.686, 0.062, GOLD); p.box(0.03, 0.03, 0.026, 0, 0.635, 0.064, GOLD, 0, false, PI / 4);
  flag(p, kit, 0, 1.18, 0, 0.3, 0.16, 0.09);
  // les battants de planches, bandes de bois sombre
  for (const s of [-1, 1]) leaf(p, s, 0.27, 0.56, 0.035, wd, (q) => { for (let i = 0; i < 4; i++) q.box(0.004, 0.56, 0.04, -0.1 + i * 0.066, 0.02, 0, dark); for (const y of [0.12, 0.44]) q.box(0.27, 0.03, 0.04, 0, y, 0, dark); });
}

function gateStone(p: Parts, kit: DefKit) {
  const stone = 0xa8a19a, edge = 0x8d867b, dark = 0x6f6a66, roof = 0x3a5a9a, wd = 0x6e4a32;
  for (const s of [-1, 1]) {
    p.cyl(0.11, 0.12, 0.08, 10, s * 0.4, 0, 0, dark);
    p.cyl(0.1, 0.11, 0.82, 10, s * 0.4, 0.08, 0, stone);
    for (const y of [0.2, 0.36, 0.52, 0.68]) p.add(new THREE.CylinderGeometry(0.103, 0.103, 0.008, 10, 1, true), s * 0.4, y, 0, dk(stone, 0.85));
    p.cyl(0.13, 0.1, 0.06, 10, s * 0.4, 0.9, 0, edge);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * PI * 2; p.box(0.05, 0.07, 0.05, s * 0.4 + Math.sin(a) * 0.11, 0.96, Math.cos(a) * 0.11, dk(stone, 0.95 + 0.1 * H(i, s + 3)), a); }
    p.cone(0.13, 0.26, 10, s * 0.4, 1.0, 0, roof); p.sphere(0.02, s * 0.4, 1.27, 0, GOLD);
    p.box(0.028, 0.08, 0.012, s * 0.4, 0.44, 0.105, WARM, 0, true); p.box(0.028, 0.08, 0.012, s * 0.4, 0.7, 0.105, WARM, 0, true);
    torch(p, s * 0.28, 0.5, 0.1);
  }
  // l'arc en plein cintre, les mâchicoulis, le chemin de ronde crénelé au-dessus, la herse relevée
  p.add(new THREE.TorusGeometry(0.3, 0.045, 6, 14, PI), 0, 0.5, 0, edge);
  p.box(0.6, 0.12, 0.2, 0, 0.74, 0, stone); p.box(0.64, 0.03, 0.24, 0, 0.86, 0, edge);
  for (let i = 0; i < 5; i++) p.box(0.04, 0.04, 0.04, -0.24 + i * 0.12, 0.7, 0.1, dark);
  for (const x of [-0.18, 0, 0.18]) p.box(0.09, 0.08, 0.06, x, 0.89, 0.08, stone);
  p.box(0.6, 0.04, 0.03, 0, 0.89, -0.1, edge);
  for (let i = -3; i <= 3; i++) p.box(0.016, 0.16, 0.016, i * 0.08, 0.62, 0.04, IRON);
  p.box(0.56, 0.016, 0.016, 0, 0.7, 0.04, IRON);
  // blason et drapeau
  shield(p, 0, 0.78, 0.105, 0.05);
  flag(p, kit, 0, 0.89, -0.06, 0.34, 0.18, 0.1);
  // les vantaux de chêne cloutés, bandes de fer
  for (const s of [-1, 1]) leaf(p, s, 0.27, 0.6, 0.04, wd, (q) => { for (const y of [0.14, 0.44]) q.box(0.27, 0.035, 0.044, 0, y, 0, IRON); for (let i = 0; i < 4; i++) for (const y of [0.16, 0.46]) q.sphere(0.01, -0.1 + i * 0.066, y, 0.024, 0x1a1a1e); });
}

function gateBrick(p: Parts, kit: DefKit) {
  const brick = 0xa4553a, cap = 0x8a8590, iron = 0x2a2a30, slate = 0x4a4c56, cast = 0x4a4c56;
  for (const s of [-1, 1]) {
    p.box(0.22, 0.06, 0.22, s * 0.4, 0, 0, cap);
    p.box(0.2, 0.86, 0.2, s * 0.4, 0.06, 0, brick);
    for (let i = 0; i < 9; i++) p.box(0.204, 0.01, 0.204, s * 0.4, 0.12 + i * 0.09, 0, 0x6a3424);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 8; i++) p.box(i % 2 ? 0.06 : 0.04, 0.07, i % 2 ? 0.04 : 0.06, s * 0.4 + sx * 0.09, 0.08 + i * 0.1, sz * 0.09, dk(cap, 0.95 + 0.1 * H(i, sx + sz * 3 + s)));
    p.box(0.26, 0.04, 0.26, s * 0.4, 0.92, 0, cap);
    p.pyramid(0.28, 0.22, 0.28, s * 0.4, 0.96, 0, slate); p.sphere(0.018, s * 0.4, 1.19, 0, iron);
    for (const y of [0.4, 0.66]) { p.box(0.05, 0.08, 0.012, s * 0.4, y, 0.102, WARM, 0, true); p.box(0.07, 0.014, 0.03, s * 0.4, y + 0.08, 0.108, cap); }
    lantern(p, s * 0.27, 0.6, 0.16, iron);
  }
  // le linteau de fonte riveté, le nom de la ville, l'arc de fer forgé, le chemin de ronde à grille
  p.box(0.6, 0.1, 0.16, 0, 0.78, 0, cast);
  for (let i = -3; i <= 3; i++) p.sphere(0.012, i * 0.09, 0.83, 0.082, iron);
  p.box(0.6, 0.04, 0.2, 0, 0.88, 0, cap);
  p.add(new THREE.TorusGeometry(0.3, 0.012, 4, 14, PI), 0, 0.6, 0.06, iron);
  for (let i = -2; i <= 2; i++) p.box(0.01, 0.14, 0.01, i * 0.1, 0.62 + Math.abs(i) * 0.02, 0.06, iron);
  for (const y of [0.92, 1.0]) p.box(0.6, 0.01, 0.01, 0, y, 0.09, iron);
  for (let i = -3; i <= 3; i++) p.box(0.01, 0.1, 0.01, i * 0.09, 0.92, 0.09, iron);
  p.box(0.3, 0.07, 0.02, 0, 0.7, 0.09, 0xd8dde2); p.box(0.28, 0.05, 0.024, 0, 0.71, 0.092, RED); p.box(0.26, 0.012, 0.026, 0, 0.73, 0.094, GOLD);
  flag(p, kit, 0, 0.92, -0.06, 0.34, 0.18, 0.1, iron);
  // les vantaux de fonte à lames, bandes rivetées
  for (const s of [-1, 1]) leaf(p, s, 0.27, 0.66, 0.04, cast, (q) => { for (const y of [0.12, 0.36, 0.6]) { q.box(0.27, 0.04, 0.044, 0, y, 0, iron); for (let i = 0; i < 4; i++) q.sphere(0.009, -0.1 + i * 0.066, y + 0.02, 0.024, 0x16161a); } for (let i = 0; i < 5; i++) q.box(0.004, 0.66, 0.042, -0.108 + i * 0.054, 0.02, 0, iron); });
}

function gateConcrete(p: Parts, kit: DefKit) {
  const conc = 0xc8cacc, conc2 = 0x9a9ca0, steel = 0x4a4650, light = 0xfff0b0, yellow = 0xe0b030;
  for (const s of [-1, 1]) {
    p.box(0.24, 0.08, 0.24, s * 0.4, 0, 0, conc2);
    p.box(0.2, 0.9, 0.2, s * 0.4, 0.08, 0, conc);
    for (const y of [0.4, 0.7]) p.box(0.204, 0.014, 0.204, s * 0.4, y, 0, 0x8e9092);
    for (let i = 0; i < 3; i++) p.box(0.05, 0.04, 0.006, s * 0.4 - 0.06 + i * 0.06, 0.14, 0.102, i % 2 ? 0x2a2a2e : yellow);
    p.box(0.26, 0.05, 0.26, s * 0.4, 0.98, 0, steel);
    p.box(0.08, 0.1, 0.012, s * 0.4, 0.5, 0.102, 0x7ac8f0, 0, true); p.box(0.1, 0.014, 0.03, s * 0.4, 0.6, 0.108, steel);
    // projecteur, caméra, antenne sur la tour
    p.box(0.03, 0.05, 0.03, s * 0.4, 1.03, 0.06, steel); p.add(new THREE.BoxGeometry(0.12, 0.08, 0.07), s * 0.4, 1.1, 0.08, steel, 0, false, 0, 0.5); p.add(new THREE.BoxGeometry(0.1, 0.06, 0.01), s * 0.4, 1.085, 0.12, light, 0, true, 0, 0.5);
    p.cyl(0.006, 0.008, 0.26, 4, s * 0.46, 1.03, -0.06, steel); p.sphere(0.012, s * 0.46, 1.3, -0.06, 0xff4a4a); p.box(0.01, 0.01, 0.01, s * 0.46, 1.31, -0.06, 0xff4a4a, 0, true);
    p.box(0.03, 0.03, 0.06, s * 0.32, 0.86, 0.08, steel); p.box(0.02, 0.02, 0.012, s * 0.32, 0.865, 0.115, 0x1a1a1e);
  }
  // le portique : poutre de béton, passerelle à garde-corps, feux de circulation, enseigne lumineuse
  p.box(0.6, 0.14, 0.22, 0, 0.84, 0, conc2); p.box(0.64, 0.03, 0.26, 0, 0.98, 0, steel);
  for (const y of [1.06, 1.12]) p.box(0.6, 0.01, 0.01, 0, y, 0.12, steel);
  for (let i = -2; i <= 2; i++) p.box(0.012, 0.12, 0.012, i * 0.14, 1.01, 0.12, steel);
  p.box(0.3, 0.08, 0.02, 0, 0.88, 0.11, 0x2a2a2e); p.box(0.28, 0.06, 0.012, 0, 0.89, 0.12, RED, 0, true); p.box(0.26, 0.01, 0.014, 0, 0.915, 0.122, GOLD);
  for (const s of [-1, 1]) { p.box(0.03, 0.08, 0.03, s * 0.2, 0.74, 0.1, steel); p.box(0.02, 0.02, 0.012, s * 0.2, 0.79, 0.115, 0x5ae08a, 0, true); p.box(0.02, 0.02, 0.012, s * 0.2, 0.755, 0.115, 0xd84a3e); }
  flag(p, kit, 0, 0.98, -0.08, 0.36, 0.18, 0.1, steel);
  // les panneaux blindés ouverts, lames et poignée jaune
  for (const s of [-1, 1]) leaf(p, s, 0.27, 0.7, 0.04, 0x8e9aa8, (q) => { for (const y of [0.14, 0.34, 0.54]) q.box(0.27, 0.03, 0.046, 0, y, 0, 0x5a6270); q.box(0.03, 0.7, 0.05, -0.12, 0.02, 0, yellow); });
}

function gateEnergy(p: Parts, kit: DefKit) {
  const white = 0xdfe6ee, cyan = 0x40f0ff, dkc = 0x4a5664;
  for (const s of [-1, 1]) {
    p.cyl(0.1, 0.11, 0.05, 8, s * 0.4, 0, 0, dkc); p.add(new THREE.TorusGeometry(0.105, 0.006, 4, 12).rotateX(PI / 2), s * 0.4, 0.055, 0, cyan, 0, 'neon');
    p.cyl(0.07, 0.1, 1.0, 8, s * 0.4, 0.05, 0, white);
    for (const y of [0.15, 0.55, 0.9]) p.add(new THREE.TorusGeometry(0.1, 0.01, 4, 12).rotateX(PI / 2), s * 0.4, y, 0, cyan, 0, 'neon');
    for (let i = 0; i < 4; i++) { const a = (i * PI) / 2 + PI / 4; p.box(0.03, 0.7, 0.03, s * 0.4 + Math.sin(a) * 0.09, 0.2, Math.cos(a) * 0.09, dkc, a); }
    p.sphere(0.06, s * 0.4, 1.1, 0, cyan); p.sphere(0.07, s * 0.4, 1.1, 0, 0x9af4ff, 1); p.box(0.02, 0.02, 0.02, s * 0.4, 1.2, 0, cyan, 0, 'neon');
    p.box(0.08, 0.03, 0.04, s * 0.4, 0.8, 0.11, dkc); p.box(0.06, 0.016, 0.01, s * 0.4, 0.806, 0.135, 0xfff0b0, 0, true);
  }
  // l'arche de lumière entre les pylônes, la lisse, l'hologramme de la faction, l'étendard
  p.add(new THREE.TorusGeometry(0.4, 0.02, 6, 20, PI), 0, 0.7, 0, white);
  p.add(new THREE.TorusGeometry(0.4, 0.008, 4, 20, PI), 0, 0.7, 0.02, cyan, 0, 'neon');
  p.box(0.6, 0.03, 0.06, 0, 1.0, 0, white); p.box(0.6, 0.012, 0.07, 0, 1.03, 0, cyan, 0, 'neon');
  for (const x of [-0.2, 0, 0.2]) p.box(0.012, 0.3, 0.012, x, 0.7, 0, dkc);
  p.box(0.24, 0.1, 0.006, 0, 1.08, 0, RED, 0, 'neon'); p.box(0.24, 0.012, 0.008, 0, 1.08, 0, GOLD, 0, 'neon'); p.box(0.24, 0.012, 0.008, 0, 1.168, 0, GOLD, 0, 'neon');
  p.cyl(0.008, 0.01, 0.34, 5, 0, 1.04, -0.06, dkc);
  const f = kit.sway([0, 0, -0.06], [0, 1, 0], 0.3, 0.9);
  f.box(0.16, 0.09, 0.006, 0.09, 1.26, 0, RED, 0, 'neon'); f.box(0.16, 0.012, 0.008, 0.09, 1.26, 0, GOLD, 0, 'neon'); f.box(0.16, 0.012, 0.008, 0.09, 1.338, 0, GOLD, 0, 'neon');
  // les voiles d'énergie ouverts, en lamelles lumineuses sur leur cadre
  for (const s of [-1, 1]) leaf(p, s, 0.27, 0.72, 0.012, white, (q) => { for (let i = 0; i < 5; i++) q.box(0.25, 0.012, 0.016, 0, 0.1 + i * 0.14, 0, cyan, 0, 'neon'); q.box(0.012, 0.72, 0.016, -0.128, 0.02, 0, dkc); });
}

const GATES = [gatePalisade, gatePalisade, gateStone, gateBrick, gateConcrete, gateEnergy];

/** Le raccord d'une porte à une tour de garde voisine du côté `s` : une passerelle du haut de la porte à la face de la tour, et la porte percée dans la tour */
function gateJoin(a: number, p: Parts, s: number) {
  const face = 1 - TOWER_R[a], wk = WALK[a], y = wk.gate - 0.03, x0 = 0.5, x1 = face + 0.02;
  p.box(x1 - x0, 0.03, 0.16, s * (x0 + x1) / 2, y, 0, dk(wk.frame, 1.1));
  for (const z of [-0.08, 0.08]) { p.box(x1 - x0, 0.012, 0.012, s * (x0 + x1) / 2, y + 0.14, z, wk.frame); for (const x of [x0 + 0.04, x1 - 0.04]) p.box(0.012, 0.14, 0.012, s * x, y + 0.03, z, wk.frame); }
  p.box(0.03, 0.26, 0.13, s * (face + 0.012), y + 0.03, 0, 0x24201c);
  for (const t of [-1, 1]) p.box(0.05, 0.28, 0.025, s * (face + 0.01), y + 0.025, t * 0.077, wk.frame);
  p.box(0.05, 0.03, 0.18, s * (face + 0.01), y + 0.295, 0, wk.frame);
}

/**
 * La porte de la ville à l'âge `age` ; `mask` : ses côtés reliés (le mur court d'est en ouest, sinon elle se tourne) ; une
 * tour de garde voisine dans l'axe du mur (bits << TOWER_SHIFT) : une passerelle l'y relie
 */
export function rampartGate(p: Parts, age: number, mask: number, kit: DefKit) {
  const a = rampartAge(age), towers = (mask >> TOWER_SHIFT) & 15;
  if (gateAlongX(mask)) {
    GATES[a](p, kit);
    if (towers & WALL_E) gateJoin(a, p, 1);
    if (towers & WALL_W) gateJoin(a, p, -1);
    return;
  }
  // le mur court du nord au sud : la porte tourne d'un quart de tour (+x devient le sud), et le pied de ses drapeaux avec elle
  const sub = new Parts(), rk: DefKit = { ...kit, sway: (pv, axis, amp, freq) => kit.sway([-pv[2], pv[1], pv[0]], axis, amp, freq) };
  GATES[a](sub, rk);
  if (towers & WALL_S) gateJoin(a, sub, 1);
  if (towers & WALL_N) gateJoin(a, sub, -1);
  pour(p, sub, -PI / 2);
}
