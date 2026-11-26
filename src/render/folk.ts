import * as THREE from 'three';
import { Parts, Glow } from './parts';
import { mats, mergeLit } from './materials';
import { HUMAN_K } from './assets';

/**
 * Les habitants, dessinés comme les soldats, les gendarmes et les pompiers : buste et tête, jambes qui pivotent à la hanche,
 * bras à l'épaule, et la tenue de leur époque (peaux de bêtes à la préhistoire, tunique et sandales dans l'Antiquité, cotte,
 * chaperon et tablier au Moyen Âge, gilet, casquette et jupe longue à l'âge industriel, tee-shirt, sweat et jean à l'époque
 * moderne, combinaison à liserés lumineux à l'âge futuriste), avec leurs accessoires (colliers, fibules, aumônière, chaîne de
 * montre, sac à dos, lunettes, bracelet-écran…), visage, cheveux, barbe, coiffe et couleurs propres à chacun ; quelques
 * figures à part (moine, jongleur, sage, nomade, savant, pêcheur, tambour, astronaute). Posés à y = 0, tournés vers +z, à la
 * taille des soldats. Toujours cinq maillages (buste et tête, deux jambes, deux bras) : ils sont nombreux à l'écran
 */

/** Qui est-ce : un habitant de l'époque, ou l'une des figures qu'on croise en expédition */
export type FolkRole = 'villager' | 'monk' | 'juggler' | 'sage' | 'nomad' | 'scholar' | 'fisher' | 'drummer' | 'thief' | 'astronaut';
/**
 * Ce qu'il fait : debout, au pas, à la course, à l'ouvrage, assis, bras levés, à parler, à jongler ; aux champs : semer à la
 * volée, faucher (ou couper à la faucille), ramasser penché, porter à deux bras (gerbe, panier, cagette) ; en garde, à boxer
 */
export type FolkPose = 'idle' | 'walk' | 'run' | 'work' | 'sit' | 'ride' | 'cheer' | 'talk' | 'juggle' | 'sow' | 'reap' | 'gather' | 'carry' | 'box';
/** Comment il tient ce qu'il a en main : droit (torche, seau, panier), en outil (qui frappe à l'ouvrage), pointé devant (arme) */
export type FolkHold = 'upright' | 'tool' | 'point';

export interface Folk {
  root: THREE.Group;
  /** le buste et la tête (qui respirent, se penchent, descendent quand il s'assied) */
  body: THREE.Group;
  legs: THREE.Object3D[];
  /** bras droit, bras gauche (pivot à l'épaule) */
  arms: THREE.Object3D[];
  /** au bout de chaque bras : ce qu'il tient */
  hands: THREE.Object3D[];
}

/**
 * Un habitant retiré pour de bon : on libère les géométries que `makeFolk` lui a faites (corps, jambes, bras : propres à
 * chacun, marquées `userData.folk`). Ce qu'il tient en main ou porte en plus (outils, coiffes, montures) n'est pas à lui seul
 * et reste
 */
export function disposeFolk(f: Folk) {
  f.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry.userData.folk) m.geometry.dispose(); });
}

/** `farmer` : un habitant qui travaille aux champs (chapeau de paille ou casquette, salopette à l'âge industriel et après) */
export interface FolkLook { age: number; v: number; child?: boolean; woman?: boolean; role?: FolkRole; size?: number; farmer?: boolean }

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const mix = (a: number, b: number, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
/** Teintes de peau, de la plus claire à la plus foncée ; les cheveux, et ceux des peaux foncées (bruns et noirs) */
const SKINS = [0xf6d6bc, 0xf0c8a8, 0xe8b894, 0xdeaa86, 0xd8a07a, 0xc08a62, 0xa8744e, 0x8a5a3a, 0x6e4630];
const HAIRS = [0x2a1e16, 0x4a3020, 0x6a4a2a, 0xa8743a, 0xd8b060, 0x1a1a1e, 0x7a3a22, 0xb4562a, 0xe4d09a, 0x120e0c];
const DARK_HAIRS = [0x2a1e16, 0x1a1a1e, 0x120e0c, 0x4a3020];
const GREY = 0xb8b4ac, WHITE = 0xf2ece0, LEATHER = 0x6a4a30, BLACK = 0x26262a, GOLD = 0xe8c66a, ROPE = 0xc9b48a, BONE = 0xece4d0;
const EYES = 0x2a2a2e;
/** hauteur de la hanche (pivot des jambes, et du buste quand il se penche) */
const HIP = 0.1;
/** la tête des enfants, un peu plus grosse (autour du cou) */
const CHILD_HEAD = 1.16;

/** Un nombre tiré de (v, k), toujours le même : la variété des habitants */
function hv(v: number, k: number) {
  let h = Math.imul((v | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}
const of = <T>(a: T[], v: number, k: number) => a[hv(v, k) % a.length];
/** une chance sur `n`, tirée de (v, k) */
const one = (v: number, k: number, n: number) => hv(v, k) % n === 0;

/** Boîte unité (base à y = 0), déjà défaite en triangles, avec ses normales : copiée à la taille voulue */
const UNIT = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed();
  g.computeVertexNormals();
  return { pos: g.attributes.position.array as Float32Array, normal: g.attributes.normal as THREE.BufferAttribute };
})();

/**
 * Les pièces d'un habitant : une boîte droite se pose par simple copie de la boîte unité (trois fois plus vite que de la
 * bâtir, la moitié du temps de `makeFolk` : un passage d'âge rebâtit tous les habitants proches d'un coup)
 */
class FolkParts extends Parts {
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, glow: Glow = false, rz = 0) {
    if (ry || rz || glow) { super.box(w, h, d, x, y, z, color, ry, glow, rz); return; }
    this.body.push(unitBox(w, h, d, x, y, z, color, 1, 1));
  }
}

/** La boîte unité à sa taille et sa place, le haut resserré de `top` (largeur) et `topD` (profondeur), de la couleur `c` */
function unitBox(w: number, h: number, d: number, x: number, y: number, z: number, c: number, top: number, topD: number) {
  const src = UNIT.pos, n = src.length / 3, pos = new Float32Array(src.length), col = new Float32Array(src.length);
  const k = new THREE.Color(c);
  for (let i = 0; i < n; i++) {
    const up = src[i * 3 + 1] > 0.5;
    pos[i * 3] = src[i * 3] * w * (up ? top : 1) + x;
    pos[i * 3 + 1] = src[i * 3 + 1] * h + y;
    pos[i * 3 + 2] = src[i * 3 + 2] * d * (up ? topD : 1) + z;
    col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (top === 1 && topD === 1) g.setAttribute('normal', UNIT.normal);
  else g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Boîte dont le haut est resserré ou élargi (`top`, `topD` : facteurs de la largeur et de la profondeur en haut) : buste aux
 * épaules plus larges que la taille, bras et jambes plus fins au poignet et à la cheville, menton. y = base, 12 triangles
 */
function slab(p: Parts, w: number, h: number, d: number, x: number, y: number, z: number, c: number, top = 1, topD = top) {
  p.body.push(unitBox(w, h, d, x, y, z, c, top, topD));
}

/** Chaussures : bottes et souliers (bout rapporté), sandales lacées, baskets à semelle claire, bottes de fourrure liées, poulaines */
type Shoe = 'boot' | 'sandal' | 'sneaker' | 'wrap' | 'pointed';

/**
 * Ce qu'on dessine hors du buste : cuisses (`leg`) et bas des jambes (`shin` : chaussettes, jambières, bottes hautes, jambes
 * nues sous un short), chaussures, haut du bras (`arm`) et avant-bras (`fore` : nu sous une manche courte, retroussé), poignet
 * (`cuff`), brassard, montre, genouillères, mains (gants)
 */
interface Wear {
  leg: number | [number, number]; shin?: number | [number, number]; boot: number; shoe: Shoe; sole?: number; strap?: number;
  arm: number | [number, number]; fore?: number | [number, number]; cuff?: number; band?: number; watch?: number; knee?: number;
  hand: number; skin: number; hair: boolean;
}

/** Ce qui se dessine sur la tête en plus des cheveux : peintures de guerre, boucles d'oreilles, lunettes, casque à musique */
interface Face { paint?: number; ears?: number; glasses?: number; phones?: number; bald?: boolean; fringe?: boolean; blush?: boolean }

/**
 * La tête : cou, visage au menton resserré, yeux, sourcils, nez, bouche, oreilles ; cheveux (courts, longs, chignon, queue de
 * cheval, nattes, en épis, crâne dégarni) et barbe, sauf sous une coiffe qui les cache
 */
function head(p: Parts, skin: number, hair: number, style: number, beard: number, f: Face) {
  p.box(0.02, 0.016, 0.02, 0, 0.194, 0, dark(skin, 0.92));
  slab(p, 0.04, 0.046, 0.041, 0, 0.206, 0, skin, 1.1, 1.08);
  for (const s of [-1, 1]) {
    p.box(0.007, 0.009, 0.003, s * 0.011, 0.226, 0.0215, EYES);
    p.box(0.011, 0.003, 0.003, s * 0.011, 0.2375, 0.022, f.bald || style < 0 ? dark(hair, 0.9) : hair);
    p.box(0.005, 0.012, 0.009, s * 0.0215, 0.218, 0.001, dark(skin, 0.9));
    if (f.blush) p.box(0.007, 0.004, 0.002, s * 0.0135, 0.215, 0.0215, mix(skin, 0xe0705e, 0.35));
    if (f.paint !== undefined) p.box(0.011, 0.003, 0.002, s * 0.0135, 0.22, 0.0218, f.paint);
    if (f.ears !== undefined) p.box(0.004, 0.007, 0.004, s * 0.0235, 0.208, 0.002, f.ears);
  }
  p.box(0.008, 0.011, 0.006, 0, 0.216, 0.0225, dark(skin, 0.88));
  p.box(0.012, 0.0028, 0.003, 0, 0.2105, 0.021, dark(skin, 0.66));
  if (style >= 0) {
    // calotte, nuque, tempes ; une frange pour certains ; dégarni : seulement la couronne
    if (!f.bald) p.box(0.048, 0.013, 0.048, 0, 0.249, 0, hair);
    p.box(0.048, 0.034, 0.01, 0, 0.218, -0.02, hair);
    for (const s of [-1, 1]) p.box(0.006, 0.022, 0.03, s * 0.024, 0.23, -0.006, hair);
    if (f.fringe && !f.bald) p.add(new THREE.BoxGeometry(0.044, 0.009, 0.006), 0, 0.2465, 0.022, hair, 0, false, 0.12);
    if (style === 1) { p.box(0.05, 0.07, 0.012, 0, 0.183, -0.022, hair); for (const s of [-1, 1]) p.box(0.008, 0.045, 0.024, s * 0.025, 0.203, -0.01, hair); }
    if (style === 2) { p.sphere(0.017, 0, 0.262, -0.02, hair, 1); p.box(0.026, 0.005, 0.02, 0, 0.255, -0.02, dark(hair, 0.7)); }
    if (style === 3) { p.box(0.014, 0.055, 0.012, 0, 0.188, -0.03, hair); p.box(0.016, 0.006, 0.014, 0, 0.236, -0.029, 0xc83a4a); }
    if (style === 4) for (const s of [-1, 1]) { p.box(0.009, 0.05, 0.009, s * 0.023, 0.172, 0.006, hair); p.box(0.01, 0.006, 0.01, s * 0.023, 0.172, 0.006, 0xc8643a); }
    if (style === 5) for (const [x, z, r] of [[-0.012, 0.008, 0.4], [0.006, 0.012, -0.3], [0.014, -0.01, -0.5], [-0.006, -0.012, 0.3]]) p.add(new THREE.ConeGeometry(0.011, 0.016, 4), x, 0.264, z, hair, 0, false, r);
  }
  if (beard === 1) { p.box(0.044, 0.024, 0.012, 0, 0.19, 0.018, hair); p.box(0.03, 0.006, 0.005, 0, 0.212, 0.023, hair); }
  if (beard === 2) p.box(0.03, 0.006, 0.005, 0, 0.212, 0.023, hair);
  if (beard === 3) { p.box(0.046, 0.05, 0.012, 0, 0.168, 0.018, GREY); p.box(0.03, 0.006, 0.005, 0, 0.212, 0.023, GREY); }
  if (beard === 4) { p.box(0.016, 0.016, 0.01, 0, 0.198, 0.02, hair); p.box(0.03, 0.005, 0.005, 0, 0.212, 0.023, hair); }
  if (f.glasses !== undefined) {
    // lunettes : barre du haut, verres cerclés par en dessous, branches jusqu'aux oreilles
    p.box(0.036, 0.003, 0.003, 0, 0.2315, 0.0235, f.glasses);
    for (const s of [-1, 1]) { p.box(0.012, 0.002, 0.003, s * 0.011, 0.2215, 0.0235, f.glasses); p.box(0.002, 0.003, 0.024, s * 0.0222, 0.2315, 0.011, f.glasses); }
  }
  if (f.phones !== undefined) {
    // casque à musique : arceau et écouteurs
    p.box(0.05, 0.005, 0.009, 0, 0.262, 0, dark(f.phones, 0.5));
    for (const s of [-1, 1]) { p.box(0.004, 0.03, 0.008, s * 0.026, 0.234, 0, dark(f.phones, 0.5)); p.box(0.008, 0.017, 0.015, s * 0.0255, 0.212, 0.001, f.phones); }
  }
}

/**
 * Capuche, voile ou guimpe autour du visage (sans le couvrir) : la calotte en arrière, un bord sur le front, des pans sur les
 * joues ; `gorget` : la guimpe sous le menton
 */
function hood(p: Parts, c: number, y = 0.236, gorget?: number) {
  p.sphere(0.032, 0, y, -0.011, c, 1, 1.05);
  p.box(0.048, 0.012, 0.012, 0, 0.243, 0.016, c);
  for (const s of [-1, 1]) p.box(0.006, 0.04, 0.03, s * 0.0245, 0.205, 0.004, c);
  if (gorget !== undefined) p.box(0.044, 0.014, 0.036, 0, 0.19, 0.003, gorget);
}

/** Petite bourse ou sacoche à la ceinture */
function pouch(p: Parts, x: number, y: number, c: number) {
  p.box(0.016, 0.02, 0.009, x, y, 0.029, c);
  p.box(0.017, 0.006, 0.01, x, y + 0.016, 0.0292, dark(c, 0.8));
}

/** Sac à dos et ses bretelles */
function backpack(p: Parts, c: number) {
  p.box(0.056, 0.07, 0.024, 0, 0.105, -0.04, c);
  p.box(0.046, 0.024, 0.006, 0, 0.11, -0.054, dark(c, 0.8));
  for (const s of [-1, 1]) { p.box(0.008, 0.066, 0.004, s * 0.02, 0.124, 0.0275, dark(c, 0.7)); p.box(0.008, 0.004, 0.058, s * 0.02, 0.198, 0, dark(c, 0.7)); }
}

/** Buste à la mode de l'époque, et ce qu'il porte autour ; renvoie les couleurs du reste */
function wear(p: Parts, era: number, v: number, woman: boolean, child: boolean, skin: number, face: Face): Wear {
  const w: Wear = { leg: skin, boot: LEATHER, shoe: 'boot', arm: skin, hand: skin, skin, hair: true };
  if (era === 0) {
    // peaux de bêtes tachetées, une épaule nue, ourlet découpé, ceinture de corde nouée et sa bourse ; collier de dents
    // (de perles pour les femmes), brassard de cuir, jambières de fourrure liées ; peintures d'ocre sur les joues
    const fur = of([0x8a6a4a, 0x7a5a3a, 0xa08060, 0x6a5040, 0xb09070], v, 10), spot = dark(fur, 0.62);
    p.box(0.078, 0.022, 0.052, 0, 0.188, 0, skin);
    slab(p, 0.076, woman ? 0.14 : 0.12, 0.052, 0, woman ? 0.05 : 0.07, 0, fur, 1.06, 1.04);
    p.add(new THREE.BoxGeometry(0.03, 0.05, 0.056), -0.022, 0.2, 0, fur, 0, false, 0.5);
    for (let k = 0; k < 4; k++) p.box(0.018, 0.016, 0.056, -0.03 + k * 0.02, (woman ? 0.038 : 0.058) - (k % 2) * 0.008, 0, dark(fur, 0.85));
    for (const [x, y, z] of [[-0.018, 0.09, 0.0265], [0.016, 0.15, 0.0265], [0.008, 0.1, -0.0265]]) p.box(0.012, 0.01, 0.002, x, y, z, spot);
    p.box(0.084, 0.008, 0.058, 0, 0.125, 0, ROPE);
    p.box(0.01, 0.014, 0.006, 0.02, 0.112, 0.03, ROPE);
    pouch(p, -0.026, 0.1, LEATHER);
    if (woman) for (let k = 0; k < 3; k++) p.sphere(0.005, -0.012 + k * 0.012, 0.192, 0.027, of([0xf2ece0, 0xd8443a, 0x4a9ac8], v, 11 + k));
    else if (hv(v, 11) % 3) {
      p.box(0.036, 0.003, 0.004, 0.006, 0.199, 0.0262, LEATHER);
      for (let k = 0; k < 3; k++) p.add(new THREE.ConeGeometry(0.004, 0.012, 3), 0.006 + (k - 1) * 0.01, 0.192, 0.028, BONE, 0, false, Math.PI);
    }
    if (!woman && one(v, 12, 2)) w.band = LEATHER;
    if (one(v, 13, 3)) face.paint = of([0xc0502a, 0xe8e0d0, 0x8a2a24], v, 14);
    w.shin = hv(v, 15) % 3 ? dark(fur, 0.9) : skin;
    w.boot = dark(fur, 0.8); w.shoe = 'wrap'; w.strap = ROPE;
  } else if (era === 1) {
    // tunique ceinturée à manches courtes (chiton long pour les femmes), bordée d'une couleur, drapé retenu par une fibule ou
    // manteau sur le dos, bourse, collier et boucles d'oreilles d'or ; sandales lacées sur le mollet
    const tunic = of([0xf2ece0, 0xe0c890, 0xc8643a, 0x6a8ac8, 0xb84a4a, 0x8ab06a, 0xd8d0b8], v, 10), drape = of([0xb84a4a, 0x4a6ab8, 0xe8c66a, 0x6a4a8a, 0x3a6a4a], v, 12);
    const trim = of([GOLD, 0x8a2a2a, 0x2a4a8a, 0x3a3a3a], v, 17);
    slab(p, 0.076, woman ? 0.16 : 0.13, 0.052, 0, woman ? 0.05 : 0.07, 0, tunic, 1.06, 1.04);
    if (woman) { p.cyl(0.042, 0.05, 0.06, 8, 0, 0.005, 0, tunic); p.cyl(0.0512, 0.0512, 0.007, 8, 0, 0.005, 0, trim); }
    else p.box(0.08, 0.008, 0.056, 0, 0.07, 0, trim);
    p.box(0.032, 0.006, 0.004, 0, 0.193, 0.0262, trim);
    p.box(0.082, 0.01, 0.056, 0, 0.125, 0, of([LEATHER, GOLD], v, 13));
    if (hv(v, 14) % 2) {
      p.add(new THREE.BoxGeometry(0.026, 0.13, 0.058), 0.008, 0.11, 0, drape, 0, false, 0.55);
      p.sphere(0.0065, -0.026, 0.196, 0.026, GOLD);
    } else if (!woman && one(v, 18, 2)) {
      p.box(0.084, 0.13, 0.008, 0, 0.075, -0.031, drape);
      for (const s of [-1, 1]) p.sphere(0.006, s * 0.03, 0.195, 0.024, GOLD);
    }
    if (!woman) pouch(p, 0.024, 0.098, LEATHER);
    if (woman) { if (one(v, 19, 2)) p.box(0.034, 0.004, 0.004, 0, 0.19, 0.027, GOLD); face.ears = GOLD; }
    w.arm = tunic; w.fore = skin; w.boot = 0x8a5a34; w.shoe = 'sandal';
  } else if (era === 2) {
    // cotte à mi-cuisse, fente lacée, ceinture à boucle, aumônière, chausses de couleur, poulaines ; robe longue au corsage lacé,
    // tablier et manches à revers pour les femmes
    const cote = of([0x5a7a3a, 0x8a4a3a, 0x4a5a8a, 0x8a7a4a, 0x7a3a5a, 0x6a5a4a, 0x3a5a5a], v, 10);
    slab(p, 0.078, woman ? 0.16 : 0.125, 0.054, 0, woman ? 0.05 : 0.07, 0, cote, 1.05, 1.03);
    if (woman) {
      p.cyl(0.044, 0.054, 0.06, 8, 0, 0.004, 0, cote);
      p.box(0.03, 0.05, 0.003, 0, 0.135, 0.0275, dark(cote, 0.78));
      for (let k = 0; k < 3; k++) p.box(0.022, 0.002, 0.003, 0, 0.142 + k * 0.014, 0.0292, ROPE);
    } else {
      p.box(0.004, 0.034, 0.003, 0, 0.158, 0.0278, dark(cote, 0.55));
      for (let k = 0; k < 2; k++) p.box(0.012, 0.002, 0.003, 0, 0.166 + k * 0.012, 0.0292, ROPE);
      p.box(0.082, 0.007, 0.057, 0, 0.07, 0, dark(cote, 0.8));
    }
    p.box(0.084, 0.01, 0.058, 0, 0.125, 0, LEATHER);
    p.box(0.01, 0.012, 0.004, 0, 0.124, 0.03, GOLD);
    pouch(p, 0.026, 0.096, of([LEATHER, 0x8a3a3a, 0x4a3a2a], v, 18));
    if (woman || hv(v, 15) % 3 === 0) p.box(0.056, woman ? 0.1 : 0.07, 0.004, 0, woman ? 0.03 : 0.07, 0.028, 0xe8e0c8);
    else if (one(v, 20, 2)) {
      // dague au côté : fourreau, garde, poignée
      p.add(new THREE.BoxGeometry(0.008, 0.036, 0.006), -0.03, 0.098, 0.026, 0x3a2a20, 0, false, -0.25);
      p.box(0.016, 0.004, 0.006, -0.034, 0.118, 0.026, 0xb8bcc2);
      p.box(0.005, 0.012, 0.005, -0.036, 0.121, 0.026, LEATHER);
    }
    w.arm = cote; w.cuff = woman ? dark(cote, 0.75) : one(v, 19, 2) ? 0xe8e0c8 : undefined;
    w.leg = of([0x5a4a3a, 0x3a4a5a, 0x7a3a3a, 0x4a5a3a, 0x8a6a3a], v, 16); w.boot = 0x4a3426; w.shoe = woman ? 'boot' : 'pointed';
  } else if (era === 3) {
    if (woman) {
      // corsage à col montant et camée, jupe longue à ourlet sombre, châle croisé ou tablier blanc noué, bottines lacées
      const skirt = of([0x2a2a3a, 0x4a2a2a, 0x2a3a4a, 0x5a4a3a, 0x3a4a3a], v, 10), blouse = of([0xe8dcc8, 0xd8c8e0, 0xc8d8e0, 0xe8d0c8], v, 11), shawl = of([0xb84a4a, 0x6a4a8a, 0x8a6a3a, 0x3a6a5a], v, 12);
      slab(p, 0.072, 0.1, 0.05, 0, 0.11, 0, blouse, 1.1, 1.06);
      p.box(0.026, 0.012, 0.026, 0, 0.194, 0, blouse);
      p.box(0.008, 0.01, 0.004, 0, 0.183, 0.0262, of([GOLD, 0xe8d8c8, 0x6a3a5a], v, 13));
      p.cyl(0.04, 0.058, 0.12, 8, 0, 0.0, 0, skirt);
      p.cyl(0.0592, 0.0592, 0.009, 8, 0, 0.0, 0, dark(skirt, 0.7));
      p.box(0.078, 0.012, 0.054, 0, 0.11, 0, dark(skirt, 0.85));
      if (hv(v, 14) % 2) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.03, 0.09, 0.056), s * 0.016, 0.16, 0.002, shawl, 0, false, s * 0.45);
      else {
        p.add(new THREE.BoxGeometry(0.05, 0.1, 0.004).translate(0, 0.05, 0), 0, 0.012, 0.057, WHITE, 0, false, 0, -0.15);
        p.box(0.082, 0.006, 0.056, 0, 0.116, 0, WHITE);
      }
      w.arm = blouse; w.cuff = WHITE; w.boot = BLACK; w.leg = skirt;
    } else {
      // chemise à col, gilet boutonné et chaîne de montre, bretelles, ou veste à revers ; foulard ; manches retroussées pour
      // certains ; pantalon, godillots ; culottes courtes et chaussettes hautes pour les garçons
      const shirt = of([0xece4d4, 0xd8d0c0, 0xc8d4e0, 0xe0d8c8], v, 10), vest = of([0x3a3a42, 0x5a4a3a, 0x4a3a5a, 0x2e3a2e, 0x6a5a48], v, 11);
      const trousers = of([0x5a5a5e, 0x6a5a48, 0x2e3448, 0x4a4038], v, 15), cut = hv(v, 16) % 3;
      slab(p, 0.074, 0.1, 0.05, 0, 0.1, 0, shirt, 1.1, 1.06);
      p.box(0.08, 0.03, 0.056, 0, 0.074, 0, trousers);
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.01, 0.008, 0.004), s * 0.007, 0.192, 0.0265, shirt, 0, false, s * 0.5);
      if (cut === 0) {
        slab(p, 0.078, 0.085, 0.054, 0, 0.105, 0, vest, 1.05, 1.03);
        p.box(0.022, 0.06, 0.004, 0, 0.14, 0.0275, shirt);
        for (let k = 0; k < 3; k++) p.box(0.005, 0.005, 0.004, 0.013, 0.13 + k * 0.02, 0.0285, GOLD);
        p.box(0.02, 0.002, 0.003, -0.018, 0.134, 0.0285, GOLD);
      } else if (cut === 1) {
        for (const s of [-1, 1]) {
          p.box(0.008, 0.09, 0.004, s * 0.018, 0.105, 0.0265, vest);
          p.box(0.008, 0.09, 0.004, s * 0.018, 0.105, -0.0265, vest);
          p.box(0.005, 0.005, 0.004, s * 0.018, 0.108, 0.0285, GOLD);
        }
      } else {
        slab(p, 0.082, 0.112, 0.058, 0, 0.085, 0, vest, 1.03, 1.02);
        p.box(0.02, 0.062, 0.004, 0, 0.135, 0.0295, shirt);
        for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.012, 0.05, 0.004), s * 0.013, 0.145, 0.0305, dark(vest, 0.8), 0, false, s * 0.28);
        p.box(0.016, 0.004, 0.004, 0.022, 0.12, 0.0305, dark(vest, 0.7));
        if (one(v, 19, 2)) p.box(0.007, 0.007, 0.004, -0.02, 0.172, 0.0315, of([0xd8443a, WHITE, 0xf2c23a], v, 20));
      }
      if (hv(v, 12) % 2) p.box(0.034, 0.014, 0.03, 0, 0.196, 0.018, of([0xc83a32, 0x3a5a9a, 0xd8b04a], v, 13));
      w.arm = cut === 2 ? vest : shirt;
      if (cut !== 2 && one(v, 14, 2)) { w.fore = skin; w.cuff = shirt; }
      w.leg = trousers;
      if (child) { w.leg = of([0x4a4038, 0x2e3448, 0x5a5a5e], v, 17); w.shin = of([0x6a6a6a, 0xd8d0c0, 0x3a3a42], v, 18); }
    }
    w.boot = BLACK;
  } else if (era === 4) {
    // tee-shirt imprimé, sweat à capuche (poche ventrale et cordons), blouson ouvert ou chemise ; jean ceinturé, baskets à
    // semelle blanche ; jupe pour certaines, short pour des enfants ; sac à dos, montre, lunettes, casque à musique
    const tee = of([0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860, 0xf2f2f2, 0x2a2a2e, 0x8a5ad8, 0xf28a3c, 0x2ab0b0], v, 10);
    const top = hv(v, 11) % 4, jacket = of([0x2a2a2e, 0x4a5a3a, 0x3a4a6a, 0x8a5a3a, 0x6a2a2a], v, 18);
    slab(p, 0.074, 0.1, 0.05, 0, 0.1, 0, top === 3 ? of([0xe8f0f8, 0xd8e8d8, 0x9ab8d8, 0xe8d8e8], v, 19) : tee, 1.1, 1.06);
    if (top === 0) p.box(0.024, 0.024, 0.004, 0, 0.15, 0.027, of([0xf2f2f2, 0x2a2a2e, 0xf2c23a, 0xd84a3e], v, 12));
    if (top === 1) {
      p.box(0.05, 0.03, 0.014, 0, 0.18, -0.03, tee);
      p.box(0.042, 0.022, 0.003, 0, 0.11, 0.0275, dark(tee, 0.85));
      for (const s of [-1, 1]) p.box(0.003, 0.026, 0.003, s * 0.007, 0.165, 0.0275, WHITE);
    }
    if (top === 2) {
      for (const s of [-1, 1]) p.box(0.026, 0.1, 0.054, s * 0.025, 0.1, 0, jacket);
      p.box(0.07, 0.1, 0.012, 0, 0.1, -0.022, jacket);
      for (const s of [-1, 1]) p.box(0.008, 0.012, 0.03, s * 0.022, 0.19, 0.012, dark(jacket, 0.8));
    }
    if (top === 3) {
      const sh = of([0xe8f0f8, 0xd8e8d8, 0x9ab8d8, 0xe8d8e8], v, 19);
      p.box(0.002, 0.09, 0.003, 0, 0.1, 0.0272, dark(sh, 0.8));
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.011, 0.008, 0.004), s * 0.007, 0.192, 0.0265, sh, 0, false, s * 0.5);
      p.box(0.012, 0.012, 0.003, -0.016, 0.16, 0.0272, dark(sh, 0.9));
    }
    const jeans = of([0x3a5a8a, 0x2a3a5a, 0x2a2a2e, 0x8a7a5a, 0x4a6a8a], v, 15);
    p.box(0.08, 0.02, 0.056, 0, 0.082, 0, jeans);
    p.box(0.082, 0.006, 0.058, 0, 0.098, 0, of([0x3a2a20, BLACK, 0x6a4a30], v, 20));
    p.box(0.008, 0.007, 0.004, 0, 0.0975, 0.03, 0xb8bcc2);
    if (woman && hv(v, 13) % 2) p.cyl(0.04, 0.05, 0.05, 8, 0, 0.055, 0, of([0x2a2a3a, 0xd84a3e, 0x4a6ab8, 0xe8c66a], v, 14));
    w.arm = top === 2 ? jacket : top === 3 ? of([0xe8f0f8, 0xd8e8d8, 0x9ab8d8, 0xe8d8e8], v, 19) : tee;
    if (top === 0) w.fore = skin;
    if (top === 1 || top === 2) w.cuff = dark(w.arm as number, 0.82);
    if (top === 3 && one(v, 21, 2)) { w.fore = skin; w.cuff = w.arm as number; }
    w.leg = jeans; w.boot = of([0xf2f2f2, 0xd84a3e, 0x2a2a2e, 0x3c7fd8, 0x4fa860], v, 16); w.shoe = 'sneaker';
    w.sole = of([0xf2f2f2, 0xf2f2f2, 0xc8a878], v, 22); w.strap = of([0xf2f2f2, 0xd84a3e, 0x2a2a2e, 0xf2c23a], v, 23);
    if (child && one(v, 24, 2)) { w.leg = of([0x3a5a8a, 0xd84a3e, 0x4fa860, 0x8a6a4a], v, 17); w.shin = skin; }
    if (child ? hv(v, 25) % 5 < 3 : one(v, 25, 6)) backpack(p, of([0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860, 0x8a5ad8, 0x2a2a2e], v, 26));
    else if (woman && !child && one(v, 35, 2)) {
      // sac en bandoulière : la courroie en travers du buste, le sac sur la hanche
      const bag = of([0x8a4a2a, 0x2a2a2e, 0xd84a3e, 0xe8d8b8, 0x6a3a5a], v, 36);
      for (const z of [0.0285, -0.0285]) p.add(new THREE.BoxGeometry(0.006, 0.124, 0.004), 0.004, 0.146, z, dark(bag, 0.8), 0, false, 0.56);
      p.box(0.012, 0.03, 0.03, 0.045, 0.078, 0.004, bag);
      p.box(0.013, 0.008, 0.03, 0.045, 0.1, 0.004, dark(bag, 0.8));
    }
    if (!child && one(v, 27, 3)) w.watch = of([BLACK, 0xb8bcc2, GOLD], v, 28);
    if (!child && one(v, 29, 4)) face.glasses = of([BLACK, 0x6a3a2a, 0x3a5a9a], v, 30);
    if (one(v, 31, 6)) face.phones = of([0x2a2a2e, 0xd84a3e, 0xf2f2f2, 0x3c7fd8], v, 32);
    if (woman && one(v, 33, 2)) face.ears = of([GOLD, 0xd8dce2], v, 34);
  } else {
    // combinaison d'une pièce aux épaules marquées, col montant, plastron, liseré lumineux sur la poitrine et à la ceinture,
    // boucle-console, genouillères, bracelet-écran au poignet, gants pour certains, bottes hautes souples ; longue tunique à
    // l'ourlet lumineux pour certaines, cape légère pour d'autres
    const suit = of([0xf2f4f6, 0xdce6ee, 0x9fd8e8, 0xd8c8f0, 0x2a2e3a, 0xf0d8e0, 0xbfe8d4], v, 10), neon = of([0x5af0ff, 0xff5ad8, 0x7affc0, 0xffd25a], v, 11);
    slab(p, 0.074, 0.11, 0.05, 0, 0.095, 0, suit, 1.1, 1.06);
    p.box(0.08, 0.03, 0.056, 0, 0.078, 0, suit);
    for (const s of [-1, 1]) p.box(0.03, 0.014, 0.058, s * 0.032, 0.196, 0, dark(suit, 0.84));
    p.box(0.028, 0.012, 0.028, 0, 0.192, 0, dark(suit, 0.9));
    p.box(0.03, 0.034, 0.003, -0.01, 0.14, 0.0272, dark(suit, 0.88));
    p.box(0.008, 0.07, 0.004, 0.012, 0.12, 0.0265, neon, 0, 'neon');
    p.box(0.082, 0.006, 0.056, 0, 0.116, 0, neon, 0, 'neon');
    p.box(0.016, 0.012, 0.004, 0, 0.113, 0.0295, 0x2a2e3a);
    if (woman && hv(v, 13) % 2) { p.cyl(0.042, 0.054, 0.07, 8, 0, 0.035, 0, suit); p.cyl(0.0545, 0.0545, 0.006, 8, 0, 0.035, 0, neon, 'neon'); }
    else if (one(v, 14, 4)) p.box(0.08, 0.12, 0.006, 0, 0.07, -0.031, mix(suit, neon, 0.35));
    const boot = of([0xf4f6f8, 0x2a2e3a, 0xb8c4d0], v, 16);
    w.arm = suit; w.leg = suit; w.boot = boot; w.shin = boot; w.sole = dark(neon, 0.75);
    w.cuff = dark(suit, 0.84);
    if (one(v, 15, 2)) w.knee = dark(suit, 0.8);
    if (one(v, 17, 3)) w.hand = dark(suit, 0.7);
    if (!child) w.watch = neon;
    if (one(v, 18, 3)) face.ears = neon;
  }
  return w;
}

/** Coiffe de l'époque (ou rien) ; vrai si elle cache les cheveux */
function hat(p: Parts, era: number, v: number, woman: boolean): boolean {
  const r = hv(v, 20) % 6;
  if (era === 0) {
    // bandeau, et parfois une plume
    if (r < 2) p.box(0.05, 0.008, 0.05, 0, 0.244, 0, of([0xc8643a, 0x8a6a4a, 0xd8b060], v, 21));
    if (r === 0 || r === 2) p.add(new THREE.BoxGeometry(0.005, 0.034, 0.009), 0.02, 0.254, -0.014, of([0xd8443a, 0xf2ece0, 0x3a6ab8, 0x2a2a2e], v, 22), 0, false, -0.45);
    return false;
  }
  if (era === 1) {
    if (woman) {
      // diadème d'or, ou voile drapé sur la tête
      if (r < 2) p.box(0.05, 0.006, 0.05, 0, 0.25, 0, GOLD);
      else if (r === 2) { const c = of([0xb84a4a, 0x4a6ab8, 0xe0c890, 0x6a4a8a], v, 23); hood(p, c); p.box(0.05, 0.07, 0.01, 0, 0.17, -0.026, c); return true; }
      return false;
    }
    // pétase de paille, couronne de laurier
    if (r < 2) { p.cyl(0.055, 0.055, 0.005, 10, 0, 0.25, 0, 0xd8c08a); p.sphere(0.024, 0, 0.256, 0, 0xd8c08a, 1, 0.7); p.cyl(0.0245, 0.0245, 0.005, 10, 0, 0.252, 0, 0x8a5a34); return true; }
    if (r === 2) p.add(new THREE.CylinderGeometry(0.026, 0.026, 0.009, 8, 1, true), 0, 0.247, 0, 0x5a8a3a);
    return false;
  }
  if (era === 2) {
    if (woman) {
      // guimpe blanche et voile
      if (r < 4) { hood(p, 0xf2ece0, 0.234, 0xf2ece0); p.box(0.05, 0.06, 0.01, 0, 0.18, -0.026, 0xf2ece0); return true; }
      return false;
    }
    const c = of([0x8a3a3a, 0x3a5a3a, 0x4a4a6a, 0x6a5a3a], v, 22);
    // chaperon, sa cornette et sa pèlerine sur les épaules ; bonnet de feutre à plume ; chapeau de paille à ruban
    if (r < 2) {
      hood(p, c);
      p.add(new THREE.ConeGeometry(0.01, 0.06, 5), 0, 0.23, -0.05, c, 0, false, 0, -1.2);
      slab(p, 0.092, 0.032, 0.064, 0, 0.17, 0, c, 0.62, 0.62);
      return true;
    }
    if (r < 3) { p.cyl(0.027, 0.03, 0.022, 8, 0, 0.246, 0, c); p.add(new THREE.BoxGeometry(0.005, 0.034, 0.009), 0.022, 0.262, -0.004, of([0xf2ece0, 0xd8443a, 0x2a2a2e], v, 23), 0, false, -0.6); return true; }
    if (r < 4) { p.cyl(0.06, 0.06, 0.005, 10, 0, 0.25, 0, 0xd8c08a); p.cone(0.03, 0.03, 8, 0, 0.255, 0, 0xd8c08a); p.cyl(0.024, 0.026, 0.006, 8, 0, 0.255, 0, 0x8a3a3a); return true; }
    return false;
  }
  if (era === 3) {
    if (woman) {
      // capote nouée d'un ruban, une fleur sur le côté
      if (r < 3) {
        hood(p, of([0x2a2a3a, 0xe8dcc8, 0x6a4a8a], v, 23), 0.238); p.box(0.05, 0.006, 0.01, 0, 0.21, 0.02, 0xb84a4a);
        p.sphere(0.007, 0.024, 0.248, 0.008, of([0xd8443a, 0xf2ece0, 0xf2c23a], v, 24));
        return true;
      }
      return false;
    }
    const c = of([0x3a3a42, 0x5a4a3a, 0x2a2a2e], v, 24);
    // casquette plate, melon à ruban, haut-de-forme
    if (r < 3) { p.box(0.05, 0.014, 0.052, 0, 0.25, -0.002, c); p.box(0.044, 0.004, 0.022, 0, 0.25, 0.028, c); p.box(0.006, 0.004, 0.006, 0, 0.264, 0, dark(c, 0.8)); return true; }
    if (r < 4) { p.sphere(0.026, 0, 0.252, 0, BLACK, 1, 0.85); p.cyl(0.038, 0.038, 0.004, 10, 0, 0.25, 0, BLACK); p.cyl(0.0262, 0.0262, 0.006, 10, 0, 0.253, 0, 0x5a2a2a); return true; }
    if (r < 5) { p.cyl(0.024, 0.024, 0.05, 10, 0, 0.252, 0, BLACK); p.cyl(0.038, 0.038, 0.004, 10, 0, 0.25, 0, BLACK); p.cyl(0.0245, 0.0245, 0.008, 10, 0, 0.258, 0, 0x8a2a2a); return true; }
    return false;
  }
  if (era >= 5) {
    // visière lumineuse sur les yeux, ou serre-tête
    if (r < 2) p.box(0.05, 0.01, 0.008, 0, 0.222, 0.023, of([0x5af0ff, 0xff5ad8, 0x7affc0], v, 26), 0, 'neon');
    else if (r === 2) p.box(0.05, 0.008, 0.05, 0, 0.246, 0, of([0xf2f4f6, 0x5af0ff, 0x2a2e3a], v, 27));
    return false;
  }
  // casquette à visière, bonnet à pompon
  const c = of([0xd84a3e, 0x3c7fd8, 0x2a2a2e, 0xf2c23a, 0x4fa860], v, 25);
  if (!woman && r < 2) { p.sphere(0.026, 0, 0.25, 0, c, 1, 0.6); p.box(0.04, 0.004, 0.026, 0, 0.252, 0.028, c); p.box(0.006, 0.004, 0.006, 0, 0.266, 0, dark(c, 0.7)); return true; }
  if (r === 2) { p.sphere(0.028, 0, 0.25, 0, c, 1, 0.75); p.box(0.05, 0.01, 0.05, 0, 0.238, 0, dark(c, 0.85)); p.sphere(0.009, 0, 0.274, 0, of([WHITE, 0xf2c23a, 0x2a2a2e], v, 28)); return true; }
  return false;
}

const STRAW = 0xd8c08a;

/**
 * Tenue des champs, par-dessus celle de l'époque : sarrau et tablier de toile dans l'Antiquité et au Moyen Âge, salopette de
 * toile bleue (bavette, bretelles, ceinture) à l'âge industriel, salopette de travail et bottes de caoutchouc à l'époque
 * moderne, un foulard au cou ; à la préhistoire et au futur, la tenue de tous les jours suffit
 */
function farmWear(p: Parts, era: number, v: number, woman: boolean, w: Wear) {
  if (era === 1 || era === 2) {
    p.box(0.058, woman ? 0.09 : 0.07, 0.004, 0, woman ? 0.04 : 0.06, 0.029, of([0xc8b48a, 0xb8a888, 0xd8c8a0], v, 40));
    w.fore = w.skin; w.cuff = typeof w.arm === 'number' ? dark(w.arm, 0.85) : undefined;
    return;
  }
  if (era !== 3 && era !== 4) return;
  if (era === 3 && woman) return;
  const c = era === 3 ? of([0x3a4a6a, 0x4a5a7a, 0x5a5048], v, 40) : of([0x3a6a3a, 0x2e4a7a, 0x8a5a2e, 0x4a4a52], v, 40);
  // ceinture de la salopette (elle couvre le haut des jambes), bavette et sa poche, bretelles croisées par-dessus les épaules
  p.box(0.082, 0.032, 0.058, 0, 0.084, 0, c);
  p.box(0.054, 0.066, 0.004, 0, 0.11, 0.0285, c);
  p.box(0.018, 0.016, 0.003, 0, 0.135, 0.031, dark(c, 0.8));
  for (const s of [-1, 1]) {
    p.box(0.01, 0.036, 0.004, s * 0.021, 0.175, 0.0285, c);
    p.box(0.01, 0.006, 0.058, s * 0.021, 0.207, 0, c);
    p.box(0.01, 0.11, 0.004, s * 0.021, 0.1, -0.0285, c);
    p.box(0.006, 0.006, 0.004, s * 0.021, 0.172, 0.031, GOLD);
  }
  if (one(v, 43, 2)) p.box(0.034, 0.014, 0.03, 0, 0.196, 0.018, of([0xc83a32, 0x3a5a9a, 0xd8b04a], v, 44));
  w.leg = c; w.shin = c; w.knee = dark(c, 0.82);
  if (era === 3) { w.fore = w.skin; w.cuff = typeof w.arm === 'number' ? w.arm : undefined; }
  if (era === 4) { w.boot = of([0x2e4a2e, 0x26262a, 0x8a2a24, 0xd8b030], v, 41); w.shin = w.boot; w.shoe = 'boot'; w.sole = dark(w.boot, 0.6); }
}

/**
 * Coiffe des champs : chapeau de paille contre le soleil (pétase dans l'Antiquité, grand bord au Moyen Âge, canotier ou
 * casquette à l'âge industriel, casquette ou chapeau de toile à l'époque moderne) ; vrai si elle cache les cheveux
 */
function farmHat(p: Parts, era: number, v: number, woman: boolean): boolean {
  const r = hv(v, 42) % 4;
  if (era === 0 || era >= 5) return hat(p, era, v, woman);
  if (era === 1) { p.cyl(0.058, 0.058, 0.005, 10, 0, 0.25, 0, STRAW); p.sphere(0.024, 0, 0.256, 0, STRAW, 1, 0.7); return true; }
  if (era === 2) {
    // fichu noué pour certaines, grand chapeau de paille pour les autres
    if (woman && r < 2) { hood(p, of([0xf2ece0, 0xc8443a, 0x4a6ab8], v, 43)); p.box(0.02, 0.02, 0.012, 0, 0.215, -0.03, 0xf2ece0); return true; }
    p.cyl(0.066, 0.066, 0.005, 10, 0, 0.25, 0, STRAW); p.cone(0.03, 0.035, 8, 0, 0.255, 0, STRAW); return true;
  }
  if (era === 3) {
    if (woman) { hood(p, of([0xe8dcc8, 0xd8c8a0], v, 44), 0.238); p.cyl(0.05, 0.05, 0.004, 10, 0, 0.244, 0.01, STRAW); return true; }
    if (r < 2) { p.cyl(0.056, 0.056, 0.004, 10, 0, 0.25, 0, STRAW); p.cyl(0.027, 0.027, 0.022, 10, 0, 0.252, 0, STRAW); p.cyl(0.0275, 0.0275, 0.006, 10, 0, 0.256, 0, 0x3a3a42); return true; }
    const c = of([0x3a3a42, 0x5a4a3a, 0x4a4a3a], v, 45);
    p.box(0.05, 0.014, 0.052, 0, 0.25, -0.002, c); p.box(0.044, 0.004, 0.022, 0, 0.25, 0.028, c); return true;
  }
  // époque moderne : casquette (visière devant) ou chapeau de toile
  if (r < 3) { const c = of([0x3a6a3a, 0xd84a3e, 0x2e4a7a, 0xf2c23a, 0xf2f2f2], v, 46); p.sphere(0.026, 0, 0.25, 0, c, 1, 0.6); p.box(0.04, 0.004, 0.028, 0, 0.252, 0.03, c); return true; }
  p.cyl(0.05, 0.05, 0.004, 10, 0, 0.248, 0, 0xd8d0b0); p.cyl(0.027, 0.03, 0.026, 10, 0, 0.25, 0, 0xd8d0b0); return true;
}

/** Les figures à part : leur buste, leur coiffe ; renvoie les couleurs du reste */
function figure(p: Parts, role: FolkRole, era: number, v: number, skin: number): Wear {
  const w: Wear = { leg: 0x4a3a2e, boot: LEATHER, shoe: 'boot', arm: skin, hand: skin, skin, hair: true };
  if (role === 'monk') {
    // bure brune jusqu'aux pieds, cordelière nouée, croix de bois, capuchon rabattu, tonsure, sandales
    const bure = 0x6a4a34;
    slab(p, 0.078, 0.15, 0.054, 0, 0.06, 0, bure, 1.05, 1.03); p.cyl(0.044, 0.054, 0.07, 8, 0, 0, 0, bure);
    p.box(0.084, 0.008, 0.058, 0, 0.125, 0, WHITE); p.box(0.006, 0.05, 0.006, 0.02, 0.08, 0.03, WHITE); p.box(0.009, 0.008, 0.008, 0.02, 0.08, 0.03, WHITE);
    p.box(0.006, 0.026, 0.004, 0, 0.15, 0.0285, 0x8a6a3a); p.box(0.018, 0.005, 0.004, 0, 0.165, 0.0285, 0x8a6a3a);
    p.box(0.05, 0.03, 0.03, 0, 0.18, -0.035, dark(bure, 0.9));
    p.box(0.048, 0.016, 0.048, 0, 0.232, 0, 0x8a6a4a); p.box(0.036, 0.006, 0.036, 0, 0.248, 0, skin);
    w.arm = bure; w.cuff = dark(bure, 0.85); w.leg = bure; w.boot = 0x5a4026; w.shoe = 'sandal'; w.hair = false;
  } else if (role === 'juggler') {
    // pourpoint mi-parti rouge et jaune, losanges, fraise à grelots, bonnet de fou à grelots, poulaines
    p.box(0.04, 0.1, 0.054, -0.02, 0.11, 0, 0xd8443a); p.box(0.04, 0.1, 0.054, 0.02, 0.11, 0, 0xf2c23a);
    for (const [x, y] of [[-0.02, 0.13], [0.02, 0.17]]) p.add(new THREE.BoxGeometry(0.014, 0.014, 0.004).rotateZ(Math.PI / 4), x, y, 0.028, x < 0 ? 0xf2c23a : 0xd8443a);
    p.box(0.07, 0.02, 0.05, 0, 0.09, 0, 0x3a3a8a);
    p.cyl(0.024, 0.034, 0.01, 8, 0, 0.192, 0, WHITE);
    for (const s of [-1, 1]) p.sphere(0.005, s * 0.02, 0.188, 0.03, GOLD);
    for (const s of [-1, 1]) { p.add(new THREE.ConeGeometry(0.014, 0.05, 5), s * 0.03, 0.258, 0, s < 0 ? 0xd8443a : 0xf2c23a, 0, false, s * 1.1); p.sphere(0.007, s * 0.056, 0.262, 0, GOLD); }
    p.box(0.048, 0.016, 0.048, 0, 0.248, 0, 0x3a3a8a);
    w.arm = [0xf2c23a, 0xd8443a]; w.cuff = WHITE; w.leg = [0xf2c23a, 0xd8443a]; w.boot = 0x3a3a8a; w.shoe = 'pointed'; w.hair = false;
  } else if (role === 'sage' || role === 'scholar') {
    if (role === 'sage' || era < 3) {
      // grande robe bleue bordée d'or et semée d'étoiles, ceinture, barbe blanche, chapeau pointu à large bord
      const robe = 0x2c3e7a;
      slab(p, 0.08, 0.15, 0.054, 0, 0.06, 0, robe, 1.04, 1.02); p.cyl(0.046, 0.058, 0.07, 8, 0, 0, 0, robe);
      p.box(0.012, 0.18, 0.004, 0, 0.02, 0.0275, GOLD);
      for (const [x, y] of [[-0.022, 0.15], [0.024, 0.09], [-0.018, 0.06]]) p.add(new THREE.BoxGeometry(0.008, 0.008, 0.003).rotateZ(Math.PI / 4), x, y, 0.028, GOLD);
      p.box(0.084, 0.008, 0.058, 0, 0.118, 0, dark(robe, 0.7));
      p.cyl(0.06, 0.06, 0.006, 10, 0, 0.25, 0, robe); p.cone(0.03, 0.09, 8, 0, 0.255, 0, robe); p.box(0.04, 0.008, 0.04, 0, 0.256, 0, GOLD);
      w.arm = robe; w.cuff = GOLD; w.leg = robe; w.hair = false;
    } else {
      // redingote noire, gilet, chaîne de montre, col blanc et lavallière, haut-de-forme, lorgnon
      slab(p, 0.076, 0.1, 0.052, 0, 0.11, 0, BLACK, 1.08, 1.04); p.box(0.03, 0.07, 0.004, 0, 0.14, 0.0265, WHITE); p.box(0.014, 0.01, 0.005, 0, 0.198, 0.027, 0x8a2a2a);
      p.box(0.02, 0.002, 0.003, -0.02, 0.135, 0.0285, GOLD);
      p.cyl(0.044, 0.05, 0.06, 8, 0, 0.05, 0, BLACK);
      p.cyl(0.024, 0.024, 0.05, 10, 0, 0.252, 0, BLACK); p.cyl(0.038, 0.038, 0.004, 10, 0, 0.25, 0, BLACK);
      for (const s of [-1, 1]) p.box(0.012, 0.012, 0.003, s * 0.011, 0.226, 0.0245, 0xd8e8f0);
      w.arm = BLACK; w.cuff = WHITE; w.leg = 0x4a4a52; w.boot = BLACK; w.hair = false;
    }
  } else if (role === 'nomad') {
    // grande cape à capuche, foulard sur le bas du visage, besace en bandoulière, bandes molletières
    const cape = of([0x5a4636, 0x4a4a44, 0x6a5038], v, 30);
    slab(p, 0.08, 0.14, 0.054, 0, 0.07, 0, cape, 1.04, 1.02); p.box(0.09, 0.15, 0.012, 0, 0.06, -0.032, dark(cape, 0.9));
    hood(p, cape);
    p.box(0.046, 0.016, 0.01, 0, 0.196, 0.02, of([0xb84a4a, 0x8a7a4a, 0x3a5a6a], v, 31));
    p.add(new THREE.BoxGeometry(0.008, 0.13, 0.004), 0, 0.13, 0.0285, LEATHER, 0, false, 0.6);
    p.box(0.024, 0.026, 0.012, 0.03, 0.08, 0.026, 0x8a6a48);
    w.arm = cape; w.leg = 0x8a7a64; w.shin = 0xa8987a; w.boot = 0x4a3426; w.shoe = 'wrap'; w.strap = 0x6a5a48; w.hair = false;
  } else if (role === 'thief') {
    // le cambrioleur : marinière noire et blanche, loup noir sur les yeux, béret, gants, sac de butin sur l'épaule
    slab(p, 0.076, 0.1, 0.052, 0, 0.11, 0, WHITE, 1.08, 1.04);
    for (let k = 0; k < 4; k++) p.box(0.08, 0.012, 0.054, 0, 0.115 + k * 0.024, 0, BLACK);
    p.box(0.05, 0.012, 0.004, 0, 0.224, 0.0235, BLACK);
    p.sphere(0.029, 0, 0.252, -0.002, BLACK, 1, 0.45); p.box(0.006, 0.01, 0.006, 0, 0.264, 0, BLACK);
    p.sphere(0.04, -0.03, 0.2, -0.045, 0xd8d0b8, 1, 1.1); p.box(0.012, 0.012, 0.012, -0.03, 0.245, -0.045, 0xb8ae94);
    w.arm = BLACK; w.leg = BLACK; w.boot = 0x3a3a3a; w.hand = 0x3a3a3a; w.hair = false;
  } else if (role === 'astronaut') {
    // scaphandre blanc, sac de survie sur le dos, drapeau et écusson, boîtier de poitrine, gants et bottes gris, casque rond à
    // visière dorée et ses lampes
    slab(p, 0.084, 0.13, 0.06, 0, 0.075, 0, WHITE, 1.06, 1.03); p.box(0.062, 0.1, 0.03, 0, 0.1, -0.045, 0xd8dce2);
    for (const s of [-1, 1]) p.box(0.012, 0.03, 0.012, s * 0.02, 0.19, -0.05, 0xb8bcc2);
    p.box(0.022, 0.014, 0.004, -0.02, 0.172, 0.031, 0x3a6ab8); p.box(0.022, 0.007, 0.005, -0.02, 0.172, 0.0315, 0xd8443a);
    p.box(0.02, 0.02, 0.004, 0.018, 0.14, 0.031, 0x2a2e3a); p.box(0.012, 0.004, 0.005, 0.018, 0.146, 0.0315, 0x5af0ff, 0, 'neon');
    p.box(0.09, 0.012, 0.064, 0, 0.11, 0, 0xb8bcc2);
    p.cyl(0.032, 0.034, 0.012, 8, 0, 0.188, 0, 0xb8bcc2);
    p.sphere(0.042, 0, 0.214, 0, WHITE, 1); p.box(0.05, 0.03, 0.012, 0, 0.21, 0.04, 0xe8b84a);
    for (const s of [-1, 1]) p.box(0.008, 0.012, 0.012, s * 0.042, 0.222, 0.008, 0xb8bcc2);
    w.arm = WHITE; w.cuff = 0xb8bcc2; w.leg = WHITE; w.knee = 0xd8dce2; w.boot = 0x9aa0a8; w.shin = 0x9aa0a8; w.hand = 0xb8bcc2; w.hair = false;
  } else if (role === 'drummer') {
    // gilet de fourrure ouvert, bras nus cerclés de cuir, collier de dents, bandeau, grande barbe
    p.box(0.078, 0.1, 0.052, 0, 0.11, 0, skin);
    for (const s of [-1, 1]) p.box(0.03, 0.11, 0.056, s * 0.025, 0.1, 0, 0x7a5a3a);
    p.box(0.082, 0.012, 0.056, 0, 0.11, 0, LEATHER);
    p.box(0.03, 0.003, 0.004, 0, 0.196, 0.0265, LEATHER);
    for (let k = 0; k < 3; k++) p.add(new THREE.ConeGeometry(0.004, 0.012, 3), (k - 1) * 0.009, 0.189, 0.028, BONE, 0, false, Math.PI);
    p.box(0.05, 0.008, 0.05, 0, 0.244, 0, 0xc8443a);
    w.leg = 0x5a4a3a; w.band = LEATHER; w.cuff = LEATHER; w.shoe = 'wrap'; w.boot = 0x6a4a30; w.strap = ROPE;
  } else {
    // pêcheur : vareuse et suroît cirés jaunes, bottes hautes à l'âge industriel et après ; chapeau de paille, chemise et
    // pantalon retroussé avant
    if (era >= 3) {
      const oil = 0xf2c23a;
      slab(p, 0.08, 0.12, 0.054, 0, 0.09, 0, oil, 1.05, 1.03); for (let k = 0; k < 3; k++) p.box(0.006, 0.006, 0.004, 0.012, 0.12 + k * 0.025, 0.028, BLACK);
      p.box(0.03, 0.012, 0.03, 0, 0.192, 0, dark(oil, 0.85));
      p.sphere(0.03, 0, 0.245, -0.011, oil, 1, 0.75); p.box(0.046, 0.008, 0.012, 0, 0.246, 0.016, oil); p.add(new THREE.CylinderGeometry(0.045, 0.05, 0.006, 10), 0, 0.236, -0.006, oil, 0, false, 0, -0.2);
      w.arm = oil; w.cuff = dark(oil, 0.85); w.leg = 0x2a3a5a; w.boot = BLACK; w.shin = BLACK; w.hair = false;
    } else {
      const shirt = of([0xe8dcc8, 0x8aa0b8, 0xc8b48a], v, 32);
      slab(p, 0.076, 0.11, 0.052, 0, 0.1, 0, shirt, 1.06, 1.04); p.box(0.082, 0.01, 0.056, 0, 0.12, 0, ROPE);
      p.cyl(0.06, 0.06, 0.005, 10, 0, 0.25, 0, 0xd8c08a); p.cone(0.028, 0.026, 8, 0, 0.255, 0, 0xd8c08a);
      w.arm = shirt; w.fore = skin; w.cuff = shirt; w.leg = 0x6a5a48; w.shin = skin; w.boot = era <= 1 ? 0x8a5a34 : LEATHER; w.shoe = 'sandal'; w.hair = false;
    }
  }
  return w;
}

/** La peau, les cheveux (gris pour les vieux ; bruns ou noirs pour les peaux foncées) d'un habitant, tirés de son numéro */
function looks(v: number, child: boolean) {
  const old = !child && hv(v, 4) % 6 === 0, si = hv(v, 2) % SKINS.length;
  const hair = old ? (hv(v, 8) % 3 ? GREY : 0xe4e0d8) : si >= 6 ? DARK_HAIRS[hv(v, 3) % DARK_HAIRS.length] : HAIRS[hv(v, 3) % HAIRS.length];
  return { skin: SKINS[si], hair, old };
}

/** Les traits d'un habitant (le portrait de sa fiche, le genre de son prénom), tirés comme dans `makeFolk` */
export function folkTraits(v: number, child: boolean) {
  return { woman: hv(v, 1) % 2 === 1, ...looks(v, child) };
}

/** Une jambe : cuisse, bas de la jambe, chaussure ; pivot à la hanche, `s` le côté (-1 : droite) */
function legGeo(w: Wear, i: number, s: number) {
  const lp = new FolkParts(), pair = (c: number | [number, number]) => (Array.isArray(c) ? c[i] : c);
  const thigh = pair(w.leg), shin = pair(w.shin ?? w.leg), b = w.boot, sole = w.sole ?? dark(b, 0.55);
  slab(lp, 0.03, 0.042, 0.034, 0, -0.042, 0, thigh, 1.08, 1.06);
  slab(lp, 0.027, 0.04, 0.031, 0, -0.08, 0, shin, 1.1, 1.08);
  if (w.knee !== undefined) lp.box(0.026, 0.014, 0.006, 0, -0.05, 0.0165, w.knee);
  if (w.shoe === 'sneaker') {
    lp.box(0.034, 0.008, 0.052, 0, -0.1, 0.006, sole);
    lp.box(0.03, 0.019, 0.044, 0, -0.093, 0.004, b);
    lp.box(0.002, 0.008, 0.022, s * 0.0155, -0.09, 0.006, w.strap ?? WHITE);
  } else if (w.shoe === 'sandal') {
    lp.box(0.026, 0.013, 0.044, 0, -0.096, 0.006, w.skin);
    lp.box(0.03, 0.005, 0.052, 0, -0.1, 0.006, b);
    lp.box(0.029, 0.005, 0.034, 0, -0.084, 0.002, b);
    lp.box(0.028, 0.004, 0.008, 0, -0.091, 0.02, b);
    lp.box(0.03, 0.004, 0.033, 0, -0.064, 0, b);
  } else if (w.shoe === 'wrap') {
    slab(lp, 0.036, 0.032, 0.048, 0, -0.1, 0.004, b, 0.9, 0.8);
    lp.box(0.034, 0.004, 0.04, 0, -0.08, 0.002, w.strap ?? ROPE);
    lp.box(0.031, 0.004, 0.035, 0, -0.058, 0, w.strap ?? ROPE);
  } else if (w.shoe === 'pointed') {
    lp.box(0.03, 0.024, 0.04, 0, -0.1, 0.002, b);
    slab(lp, 0.02, 0.012, 0.03, 0, -0.1, 0.03, b, 0.5, 0.4);
  } else {
    lp.box(0.032, 0.026, 0.04, 0, -0.1, 0.002, b);
    lp.box(0.028, 0.014, 0.016, 0, -0.1, 0.026, b);
    lp.box(0.034, 0.005, 0.054, 0, -0.1, 0.006, sole);
  }
  return lp.build(false).body;
}

/** Un bras : haut du bras, avant-bras, poignet, main et son pouce ; pivot à l'épaule, `s` le côté (-1 : droite) */
function armGeo(w: Wear, i: number, s: number) {
  const ap = new FolkParts(), pair = (c: number | [number, number]) => (Array.isArray(c) ? c[i] : c);
  slab(ap, 0.023, 0.048, 0.027, 0, -0.038, 0, pair(w.arm), 1.12, 1.08);
  slab(ap, 0.021, 0.038, 0.025, 0, -0.074, 0, pair(w.fore ?? w.arm), 1.08, 1.06);
  if (w.cuff !== undefined) ap.box(0.025, 0.008, 0.029, 0, w.fore !== undefined && pair(w.fore) === w.skin ? -0.04 : -0.074, 0, w.cuff);
  if (w.band !== undefined) ap.box(0.027, 0.007, 0.031, 0, -0.016, 0, w.band);
  if (w.watch !== undefined && i === 1) ap.box(0.024, 0.008, 0.02, 0, -0.068, 0.005, w.watch);
  ap.box(0.02, 0.022, 0.022, 0, -0.094, 0.002, w.hand);
  ap.box(0.007, 0.011, 0.008, -s * 0.011, -0.088, 0.009, w.hand);
  return ap.build(false).body;
}

/** Un habitant (ou une figure) de l'époque `age` ; `v` choisit son allure, sa tenue, ses couleurs */
export function makeFolk(look: FolkLook): Folk {
  const era = Math.min(5, Math.max(0, look.age)), v = look.v, role = look.role ?? 'villager', child = !!look.child;
  const woman = look.woman ?? (role === 'villager' && hv(v, 1) % 2 === 1);
  const { skin, hair, old } = looks(v, child);
  const p = new FolkParts(), face: Face = {};
  const w = role === 'villager' ? wear(p, era, v, woman, child, skin, face) : figure(p, role, era, v, skin);
  const farmer = !!look.farmer && role === 'villager' && !child;
  if (farmer) farmWear(p, era, v, woman, w);
  // la tête à part : celle des enfants est un peu plus grosse
  const hp = new FolkParts();
  const covered = role === 'villager' ? (farmer ? farmHat(hp, era, v, woman) : hat(hp, era, v, woman)) : !w.hair;
  // coiffure : longue, chignon, queue de cheval (nattes jusqu'au Moyen Âge) pour les femmes ; courte pour les hommes, en
  // bataille ou en épis pour certains, dégarnie pour des vieux
  const style = covered ? (role === 'villager' && woman ? 3 : -1)
    : woman ? [1, 2, 3, era <= 2 ? 4 : 1][hv(v, 5) % 4]
    : era === 0 && hv(v, 5) % 2 ? 1 : (era === 0 || era === 4) && one(v, 9, 3) ? 5 : 0;
  face.bald = !woman && old && one(v, 10, 2) && style === 0;
  face.fringe = !covered && (child || (woman ? one(v, 11, 2) : one(v, 11, 3)));
  face.blush = child || woman;
  if (old && era >= 3 && face.glasses === undefined && one(v, 12, 2)) face.glasses = of([BLACK, 0x8a6a3a, 0xb8bcc2], v, 13);
  if (covered && face.phones !== undefined) face.phones = undefined;
  const beard = child || woman ? 0 : role === 'sage' || (role === 'scholar' && era < 3) ? 3 : role === 'drummer' ? 1 : role === 'monk' || role === 'juggler' || role === 'astronaut' ? 0
    : old && era <= 2 ? 3 : [0, 0, 1, 2, 4][hv(v, 6) % 5] * (era === 4 && hv(v, 7) % 2 ? 0 : 1);
  head(hp, skin, hair, style, beard, face);
  const k = child ? CHILD_HEAD : 1, m = new THREE.Matrix4().makeTranslation(0, 0.2, 0).multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(new THREE.Matrix4().makeTranslation(0, -0.2, 0));
  for (const g of hp.body) { if (k !== 1) g.applyMatrix4(m); p.body.push(g); }
  for (const g of hp.glow) { if (k !== 1) g.applyMatrix4(m); p.glow.push(g); }
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(HUMAN_K * (look.size ?? 1) * (child ? 0.62 : 1));
  // corps et lumières (liserés lumineux du futur) dans un seul maillage : un appel de dessin de moins
  const built = p.build(false), lit = built.glow ? mergeLit(built.body, built.glow) : null;
  const hull = new THREE.Mesh(lit ?? built.body, lit ? mats.lit : mats.body);
  // (à lui seul : `disposeFolk` les libère)
  hull.geometry.userData.folk = true;
  hull.castShadow = true;
  body.add(hull);
  if (built.glow && !lit) { built.glow.userData.folk = true; body.add(new THREE.Mesh(built.glow, mats.glow)); }
  // jambes (pivot à la hanche) et bras (pivot à l'épaule), la main au bout du bras
  const legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [], hands: THREE.Object3D[] = [];
  [-1, 1].forEach((s, i) => {
    const leg = new THREE.Mesh(legGeo(w, i, s), mats.body);
    leg.geometry.userData.folk = true;
    leg.position.set(s * 0.019, 0.1, 0);
    leg.castShadow = true;
    root.add(leg);
    legs.push(leg);
  });
  [-1, 1].forEach((s, i) => {
    const arm = new THREE.Group();
    const am = new THREE.Mesh(armGeo(w, i, s), mats.body);
    am.geometry.userData.folk = true;
    am.castShadow = true;
    arm.add(am);
    arm.position.set(s * 0.052, 0.2, 0);
    const hand = new THREE.Group();
    hand.position.set(0, -0.09, 0.012);
    arm.add(hand);
    body.add(arm);
    arms.push(arm);
    hands.push(hand);
  });
  return { root, body, legs, arms, hands };
}

/** Lui met `m` dans la main (0 : droite, 1 : gauche), tenu comme il se doit */
export function holdFolk(f: Folk, side: 0 | 1, m: THREE.Object3D, how: FolkHold) {
  m.userData.hold = how;
  if (how === 'point') m.rotation.x = Math.PI / 2 - 0.3;
  f.hands[side].add(m);
}

/** Hauteur de la hanche au-dessus des pieds (repère du modèle, avant l'échelle) de l'habitant assis ou en selle */
export const FOLK_SEAT = 0.025;

/**
 * L'habitant au rythme de `phase` : son pas, sa course, l'ouvrage (l'outil qui monte et frappe), assis, en selle, bras
 * levés, mains qui parlent. En selle, `gallop` (0 au pas, 1 au galop) le penche vers l'avant
 */
export function folkStep(f: Folk, phase: number, pose: FolkPose, gallop = 0) {
  const [right, left] = f.arms, [l0, l1] = f.legs, b = f.body, sw = Math.sin(phase);
  const sit = pose === 'sit' || pose === 'ride';
  b.position.y = sit ? -0.075 : pose === 'walk' || pose === 'carry' ? Math.abs(sw) * 0.006 : pose === 'run' ? Math.abs(sw) * 0.012 : pose === 'cheer' ? Math.abs(Math.sin(phase * 2)) * 0.008 : Math.sin(phase * 0.3) * 0.0015;
  for (const l of f.legs) { l.position.y = sit ? FOLK_SEAT : 0.1; l.rotation.z = 0; }
  b.rotation.set(pose === 'run' ? 0.18 : 0, pose === 'talk' ? Math.sin(phase * 0.5) * 0.12 : 0, 0);
  b.position.z = 0;
  right.rotation.z = left.rotation.z = 0;
  // penché aux champs : le buste pivote à la hanche (pas aux pieds), le haut des jambes reste dessous
  const bend = (a: number) => { b.rotation.x = a; b.position.y = HIP * (1 - Math.cos(a)); b.position.z = -HIP * Math.sin(a); };
  if (pose === 'sow') {
    // le semeur à la volée : pas lents, la main droite puise au sac (tenu de la gauche) et lance le grain en arc de cercle
    l0.rotation.x = sw * 0.3; l1.rotation.x = -sw * 0.3;
    b.rotation.y = -0.2 * sw;
    right.rotation.x = -0.85 - 0.35 * sw; right.rotation.z = -0.27 - 0.62 * sw;
    left.rotation.x = -0.35; left.rotation.z = 0.08;
  } else if (pose === 'reap') {
    // la faux (ou la faucille) : penché, les deux mains devant, le buste lancé d'un grand geste de droite à gauche
    const s = Math.sin(phase + 0.45 * Math.sin(phase));
    bend(0.24);
    b.rotation.y = 0.55 * s;
    right.rotation.x = -0.7; left.rotation.x = -0.95;
    right.rotation.z = 0.22; left.rotation.z = -0.22;
    l0.rotation.x = -0.3; l1.rotation.x = 0.3;
  } else if (pose === 'gather') {
    // il ramasse : penché bas, la main droite cueille au ras du sol et remonte au panier tenu de la gauche
    const up = (Math.sin(phase * 1.2) + 1) / 2;
    bend(0.5 - up * 0.14);
    right.rotation.x = -0.2 - up * 0.75; right.rotation.z = 0.25 * up;
    left.rotation.x = -0.55; left.rotation.z = -0.12;
    l0.rotation.x = -0.28; l1.rotation.x = 0.32;
  } else if (pose === 'carry') {
    // il porte à deux bras, devant lui, au pas
    l0.rotation.x = sw * 0.5; l1.rotation.x = -sw * 0.5;
    right.rotation.x = left.rotation.x = -1.05 + Math.abs(sw) * 0.06;
    right.rotation.z = 0.34; left.rotation.z = -0.34;
    b.rotation.x = -0.06;
  } else if (pose === 'walk' || pose === 'run') {
    const a = pose === 'run' ? 0.95 : 0.55;
    l0.rotation.x = sw * a; l1.rotation.x = -sw * a;
    right.rotation.x = -sw * a * 0.8 - (pose === 'run' ? 0.35 : 0); left.rotation.x = sw * a * 0.8 - (pose === 'run' ? 0.35 : 0);
  } else if (pose === 'ride') {
    // à califourchon : les jambes de part et d'autre du flanc, un peu en avant ; le buste penché au galop, les mains aux rênes
    const lean = 0.08 + gallop * 0.24;
    b.rotation.x = lean; b.position.y = -0.075 + HIP * (1 - Math.cos(lean)); b.position.z = -HIP * Math.sin(lean);
    l0.rotation.x = l1.rotation.x = -0.45;
    l0.rotation.z = -0.62; l1.rotation.z = 0.62;
    right.rotation.x = left.rotation.x = -0.95 + gallop * Math.sin(phase) * 0.06;
    right.rotation.z = 0.16; left.rotation.z = -0.16;
  } else if (sit) {
    l0.rotation.x = l1.rotation.x = -1.45;
    right.rotation.x = left.rotation.x = -0.45 + Math.sin(phase * 0.3) * 0.03;
  } else if (pose === 'work') {
    // il lève l'outil et frappe, penché sur l'ouvrage, un pied en avant
    const up = (Math.sin(phase * 1.4) + 1) / 2;
    b.rotation.x = 0.12 + (1 - up) * 0.16;
    right.rotation.x = -0.45 - up * 1.5; left.rotation.x = -0.55 - up * 1.25;
    l0.rotation.x = -0.22; l1.rotation.x = 0.22;
  } else if (pose === 'cheer') {
    right.rotation.x = -2.7 + Math.sin(phase * 2) * 0.25; left.rotation.x = -2.6 - Math.sin(phase * 2) * 0.25;
    right.rotation.z = -0.25; left.rotation.z = 0.25;
    l0.rotation.x = l1.rotation.x = 0;
  } else if (pose === 'talk') {
    right.rotation.x = -0.75 + Math.sin(phase * 1.3) * 0.3; right.rotation.z = -0.15;
    left.rotation.x = -0.12 + Math.sin(phase * 0.7) * 0.06;
    l0.rotation.x = l1.rotation.x = 0;
  } else if (pose === 'box') {
    // en garde, poings devant le menton, sautillant ; un direct du gauche, puis du droit, et l'esquive du buste
    const jab = Math.max(0, Math.sin(phase * 1.7)), cross = Math.max(0, Math.sin(phase * 1.7 + Math.PI));
    b.position.y = Math.abs(Math.sin(phase * 3.4)) * 0.006;
    b.rotation.x = 0.1; b.rotation.y = 0.25 * (cross - jab);
    left.rotation.x = -1.2 - jab * 0.4; left.rotation.z = -0.35 + jab * 0.3;
    right.rotation.x = -1.2 - cross * 0.4; right.rotation.z = 0.35 - cross * 0.3;
    l0.rotation.x = -0.3; l1.rotation.x = 0.25;
  } else if (pose === 'juggle') {
    right.rotation.x = -1.15 + Math.sin(phase * 2.6) * 0.3; left.rotation.x = -1.15 - Math.sin(phase * 2.6) * 0.3;
    l0.rotation.x = l1.rotation.x = 0;
  } else {
    right.rotation.x = Math.sin(phase * 0.3) * 0.05; left.rotation.x = -Math.sin(phase * 0.3) * 0.05;
    l0.rotation.x = l1.rotation.x = 0;
  }
  // ce que tiennent les mains : torche, seau et panier restent droits ; l'outil suit le bras (et frappe à l'ouvrage)
  f.hands.forEach((h, i) => {
    const arm = f.arms[i];
    for (const c of h.children) {
      const how = c.userData.hold as FolkHold | undefined;
      if (how === 'upright') c.rotation.x = -arm.rotation.x - b.rotation.x;
      // la faux et la faucille, à la moisson : pointées devant, vers le sol
      else if (how === 'tool') c.rotation.x = pose === 'work' ? 1.3 : pose === 'reap' ? 2.1 - arm.rotation.x - b.rotation.x : -arm.rotation.x + 0.3;
    }
  });
}
