import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import { HUMAN_K } from './assets';

/**
 * Les habitants, dessinés comme les soldats, les gendarmes et les pompiers : buste et tête, jambes qui pivotent à la hanche,
 * bras à l'épaule, et la tenue de leur époque (peaux de bêtes à la préhistoire, tunique et sandales dans l'Antiquité, cotte,
 * chaperon et tablier au Moyen Âge, gilet, casquette et jupe longue à l'âge industriel, tee-shirt, sweat et jean à l'époque
 * moderne, combinaison à liserés lumineux à l'âge futuriste), cheveux, barbe, coiffe et couleurs propres à chacun ; quelques
 * figures à part (moine, jongleur, sage, nomade, savant, pêcheur, tambour, astronaute). Posés à y = 0, tournés vers +z, à la
 * taille des soldats
 */

/** Qui est-ce : un habitant de l'époque, ou l'une des figures qu'on croise en expédition */
export type FolkRole = 'villager' | 'monk' | 'juggler' | 'sage' | 'nomad' | 'scholar' | 'fisher' | 'drummer' | 'thief' | 'astronaut';
/**
 * Ce qu'il fait : debout, au pas, à la course, à l'ouvrage, assis, bras levés, à parler, à jongler ; aux champs : semer à la
 * volée, faucher (ou couper à la faucille), ramasser penché, porter à deux bras (gerbe, panier, cagette) ; en garde, à boxer
 */
export type FolkPose = 'idle' | 'walk' | 'run' | 'work' | 'sit' | 'cheer' | 'talk' | 'juggle' | 'sow' | 'reap' | 'gather' | 'carry' | 'box';
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

/** `farmer` : un habitant qui travaille aux champs (chapeau de paille ou casquette, salopette à l'âge industriel et après) */
export interface FolkLook { age: number; v: number; child?: boolean; woman?: boolean; role?: FolkRole; size?: number; farmer?: boolean }

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const SKINS = [0xf0c8a8, 0xe8b894, 0xd8a07a, 0xc08a62, 0x8a5a3a];
const HAIRS = [0x2a1e16, 0x4a3020, 0x6a4a2a, 0xa8743a, 0xd8b060, 0x1a1a1e, 0x7a3a22];
const GREY = 0xb8b4ac, WHITE = 0xf2ece0, LEATHER = 0x6a4a30, BLACK = 0x26262a, GOLD = 0xe8c66a, ROPE = 0xc9b48a;
const EYES = 0x2a2a2e;
/** hauteur de la hanche (pivot des jambes, et du buste quand il se penche) */
const HIP = 0.1;

/** Un nombre tiré de (v, k), toujours le même : la variété des habitants */
function hv(v: number, k: number) {
  let h = Math.imul((v | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}
const of = <T>(a: T[], v: number, k: number) => a[hv(v, k) % a.length];

/** Ce qu'on dessine : le buste (p), et les couleurs des jambes, des pieds, des bras, des mains, des manches courtes */
interface Wear { leg: number | [number, number]; boot: number; arm: number | [number, number]; hand: number; sleeve: number | null; hair: boolean }

/** La tête : visage, yeux, nez ; cheveux (courts, longs, chignon, queue de cheval) et barbe, sauf sous une coiffe qui les cache */
function head(p: Parts, skin: number, hair: number, style: number, beard: number) {
  p.box(0.044, 0.044, 0.044, 0, 0.21, 0, skin);
  for (const s of [-1, 1]) p.box(0.007, 0.009, 0.003, s * 0.011, 0.23, 0.0225, EYES);
  p.box(0.008, 0.01, 0.006, 0, 0.218, 0.024, dark(skin, 0.9));
  if (style >= 0) {
    p.box(0.048, 0.013, 0.048, 0, 0.252, 0, hair);
    p.box(0.048, 0.032, 0.01, 0, 0.222, -0.02, hair);
    for (const s of [-1, 1]) p.box(0.006, 0.02, 0.03, s * 0.024, 0.234, -0.006, hair);
    if (style === 1) { p.box(0.05, 0.07, 0.012, 0, 0.185, -0.022, hair); for (const s of [-1, 1]) p.box(0.008, 0.045, 0.024, s * 0.025, 0.205, -0.01, hair); }
    if (style === 2) p.sphere(0.017, 0, 0.262, -0.02, hair, 1);
    if (style === 3) p.box(0.014, 0.055, 0.012, 0, 0.19, -0.03, hair);
  }
  if (beard === 1) { p.box(0.046, 0.024, 0.012, 0, 0.192, 0.019, hair); p.box(0.03, 0.006, 0.005, 0, 0.214, 0.024, hair); }
  if (beard === 2) p.box(0.032, 0.006, 0.005, 0, 0.214, 0.024, hair);
  if (beard === 3) { p.box(0.046, 0.05, 0.012, 0, 0.17, 0.019, GREY); p.box(0.03, 0.006, 0.005, 0, 0.214, 0.024, GREY); }
}

/** Buste à la mode de l'époque ; renvoie les couleurs du reste */
function wear(p: Parts, era: number, v: number, woman: boolean, child: boolean, skin: number): Wear {
  const w: Wear = { leg: skin, boot: LEATHER, arm: skin, hand: skin, sleeve: null, hair: true };
  if (era === 0) {
    // peaux de bêtes, une épaule nue, ourlet découpé, ceinture de corde ; jambières de fourrure
    const fur = of([0x8a6a4a, 0x7a5a3a, 0xa08060, 0x6a5040], v, 10);
    p.box(0.078, 0.022, 0.052, 0, 0.188, 0, skin);
    p.box(0.08, woman ? 0.14 : 0.12, 0.054, 0, woman ? 0.05 : 0.07, 0, fur);
    p.add(new THREE.BoxGeometry(0.03, 0.05, 0.056), -0.022, 0.2, 0, fur, 0, false, 0.5);
    for (let k = 0; k < 4; k++) p.box(0.018, 0.016, 0.056, -0.03 + k * 0.02, (woman ? 0.038 : 0.058) - (k % 2) * 0.008, 0, dark(fur, 0.85));
    p.box(0.084, 0.008, 0.058, 0, 0.125, 0, ROPE);
    if (woman) for (let k = 0; k < 3; k++) p.sphere(0.005, -0.012 + k * 0.012, 0.192, 0.027, of([0xf2ece0, 0xd8443a, 0x4a9ac8], v, 11 + k));
    w.boot = dark(fur, 0.8);
  } else if (era === 1) {
    // tunique ceinturée à manches courtes (chiton long pour les femmes), drapé en écharpe, sandales
    const tunic = of([0xf2ece0, 0xe0c890, 0xc8643a, 0x6a8ac8, 0xb84a4a, 0x8ab06a], v, 10), drape = of([0xb84a4a, 0x4a6ab8, 0xe8c66a, 0x6a4a8a], v, 12);
    p.box(0.078, woman ? 0.16 : 0.13, 0.052, 0, woman ? 0.05 : 0.07, 0, tunic);
    if (woman) p.cyl(0.042, 0.05, 0.06, 8, 0, 0.005, 0, tunic);
    p.box(0.082, 0.01, 0.056, 0, 0.125, 0, of([LEATHER, GOLD], v, 13));
    if (hv(v, 14) % 2) p.add(new THREE.BoxGeometry(0.026, 0.13, 0.058), 0.008, 0.11, 0, drape, 0, false, 0.55);
    w.sleeve = tunic; w.boot = 0x8a5a34;
  } else if (era === 2) {
    // cotte à mi-cuisse, ceinture, chausses de couleur ; robe longue, tablier et guimpe pour les femmes
    const cote = of([0x5a7a3a, 0x8a4a3a, 0x4a5a8a, 0x8a7a4a, 0x7a3a5a, 0x6a5a4a], v, 10);
    p.box(0.08, woman ? 0.16 : 0.12, 0.054, 0, woman ? 0.05 : 0.075, 0, cote);
    if (woman) p.cyl(0.044, 0.054, 0.06, 8, 0, 0.004, 0, cote);
    p.box(0.084, 0.01, 0.058, 0, 0.125, 0, LEATHER);
    if (woman || hv(v, 15) % 3 === 0) p.box(0.056, woman ? 0.1 : 0.07, 0.004, 0, woman ? 0.03 : 0.07, 0.028, 0xe8e0c8);
    w.arm = cote; w.leg = of([0x5a4a3a, 0x3a4a5a, 0x7a3a3a, 0x4a5a3a], v, 16); w.boot = 0x4a3426;
  } else if (era === 3) {
    if (woman) {
      // jupe longue, corsage clair, châle croisé
      const skirt = of([0x2a2a3a, 0x4a2a2a, 0x2a3a4a, 0x5a4a3a, 0x3a4a3a], v, 10), blouse = of([0xe8dcc8, 0xd8c8e0, 0xc8d8e0], v, 11), shawl = of([0xb84a4a, 0x6a4a8a, 0x8a6a3a, 0x3a6a5a], v, 12);
      p.box(0.078, 0.1, 0.052, 0, 0.11, 0, blouse);
      p.cyl(0.04, 0.056, 0.12, 8, 0, 0.0, 0, skirt);
      for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.03, 0.09, 0.056), s * 0.016, 0.16, 0.002, shawl, 0, false, s * 0.45);
      w.arm = blouse;
    } else {
      // chemise, gilet boutonné, foulard, pantalon, godillots ; veste pour certains
      const shirt = of([0xece4d4, 0xd8d0c0, 0xc8d4e0], v, 10), vest = of([0x3a3a42, 0x5a4a3a, 0x4a3a5a, 0x2e3a2e, 0x6a5a48], v, 11);
      p.box(0.078, 0.1, 0.052, 0, 0.11, 0, shirt);
      p.box(0.08, 0.085, 0.054, 0, 0.115, 0, vest);
      p.box(0.022, 0.06, 0.004, 0, 0.14, 0.0275, shirt);
      for (let k = 0; k < 3; k++) p.box(0.005, 0.005, 0.004, 0.013, 0.13 + k * 0.02, 0.0285, GOLD);
      if (hv(v, 12) % 2) p.box(0.034, 0.014, 0.03, 0, 0.198, 0.018, of([0xc83a32, 0x3a5a9a, 0xd8b04a], v, 13));
      w.arm = hv(v, 14) % 3 ? shirt : vest;
    }
    w.leg = of([0x5a5a5e, 0x6a5a48, 0x2e3448, 0x4a4038], v, 15); w.boot = BLACK;
  } else if (era === 4) {
    // tee-shirt (ou sweat à capuche) imprimé, jean, baskets ; jupe pour certaines
    const tee = of([0xd84a3e, 0x3c7fd8, 0xf2c23a, 0x4fa860, 0xf2f2f2, 0x2a2a2e, 0x8a5ad8, 0xf28a3c, 0x2ab0b0], v, 10);
    const hoodie = hv(v, 11) % 3 === 0;
    p.box(0.078, 0.1, 0.052, 0, 0.11, 0, tee);
    p.box(0.024, 0.024, 0.004, 0, 0.15, 0.027, of([0xf2f2f2, 0x2a2a2e, 0xf2c23a, 0xd84a3e], v, 12));
    if (hoodie) { p.box(0.05, 0.03, 0.014, 0, 0.18, -0.03, tee); p.box(0.006, 0.03, 0.004, -0.01, 0.16, 0.027, WHITE); }
    if (woman && hv(v, 13) % 2) p.cyl(0.04, 0.05, 0.05, 8, 0, 0.055, 0, of([0x2a2a3a, 0xd84a3e, 0x4a6ab8, 0xe8c66a], v, 14));
    if (hoodie) w.arm = tee; else w.sleeve = tee;
    w.leg = of([0x3a5a8a, 0x2a3a5a, 0x2a2a2e, 0x8a7a5a, 0x4a6a8a], v, 15); w.boot = of([0xf2f2f2, 0xd84a3e, 0x2a2a2e, 0x3c7fd8], v, 16);
  } else {
    // combinaison d'une pièce aux épaules marquées, liseré lumineux sur la poitrine et à la ceinture, bottines souples ;
    // longue tunique à l'ourlet lumineux pour certaines
    const suit = of([0xf2f4f6, 0xdce6ee, 0x9fd8e8, 0xd8c8f0, 0x2a2e3a, 0xf0d8e0, 0xbfe8d4], v, 10), neon = of([0x5af0ff, 0xff5ad8, 0x7affc0, 0xffd25a], v, 11);
    p.box(0.078, 0.11, 0.052, 0, 0.1, 0, suit);
    for (const s of [-1, 1]) p.box(0.03, 0.014, 0.058, s * 0.032, 0.196, 0, dark(suit, 0.84));
    p.box(0.008, 0.07, 0.004, 0.012, 0.12, 0.0265, neon, 0, 'neon');
    p.box(0.082, 0.006, 0.056, 0, 0.116, 0, neon, 0, 'neon');
    if (woman && hv(v, 13) % 2) { p.cyl(0.042, 0.054, 0.07, 8, 0, 0.035, 0, suit); p.cyl(0.0545, 0.0545, 0.006, 8, 0, 0.035, 0, neon, 'neon'); }
    w.arm = suit; w.leg = suit; w.boot = of([0xf4f6f8, 0x2a2e3a, 0xb8c4d0], v, 16);
  }
  if (child && era >= 3) w.leg = of([0x3a5a8a, 0xd84a3e, 0x4fa860, 0x8a6a4a], v, 17);
  return w;
}

/** Coiffe de l'époque (ou rien) ; vrai si elle cache les cheveux */
function hat(p: Parts, era: number, v: number, woman: boolean): boolean {
  const r = hv(v, 20) % 6;
  if (era === 0) { if (r < 2) p.box(0.05, 0.008, 0.05, 0, 0.244, 0, of([0xc8643a, 0x8a6a4a, 0xd8b060], v, 21)); return false; }
  if (era === 1) {
    if (woman) { if (r < 2) p.box(0.05, 0.006, 0.05, 0, 0.25, 0, GOLD); return false; }
    // pétase de paille
    if (r < 2) { p.cyl(0.055, 0.055, 0.005, 10, 0, 0.25, 0, 0xd8c08a); p.sphere(0.024, 0, 0.256, 0, 0xd8c08a, 1, 0.7); return true; }
    return false;
  }
  if (era === 2) {
    if (woman) {
      // guimpe blanche et voile
      if (r < 4) { p.sphere(0.032, 0, 0.234, -0.002, 0xf2ece0, 1, 1.05); p.box(0.05, 0.06, 0.01, 0, 0.19, -0.024, 0xf2ece0); return true; }
      return false;
    }
    const c = of([0x8a3a3a, 0x3a5a3a, 0x4a4a6a, 0x6a5a3a], v, 22);
    // chaperon et sa cornette, bonnet de feutre, chapeau de paille
    if (r < 2) { p.sphere(0.031, 0, 0.236, -0.002, c, 1, 1); p.add(new THREE.ConeGeometry(0.01, 0.06, 5), 0, 0.23, -0.05, c, 0, false, 0, -1.2); return true; }
    if (r < 3) { p.cyl(0.027, 0.03, 0.022, 8, 0, 0.246, 0, c); return true; }
    if (r < 4) { p.cyl(0.06, 0.06, 0.005, 10, 0, 0.25, 0, 0xd8c08a); p.cone(0.03, 0.03, 8, 0, 0.255, 0, 0xd8c08a); return true; }
    return false;
  }
  if (era === 3) {
    if (woman) {
      // capote nouée d'un ruban
      if (r < 3) { p.sphere(0.03, 0, 0.24, -0.008, of([0x2a2a3a, 0xe8dcc8, 0x6a4a8a], v, 23), 1, 0.95); p.box(0.05, 0.006, 0.01, 0, 0.21, 0.02, 0xb84a4a); return true; }
      return false;
    }
    const c = of([0x3a3a42, 0x5a4a3a, 0x2a2a2e], v, 24);
    // casquette plate, melon, haut-de-forme
    if (r < 3) { p.box(0.05, 0.014, 0.052, 0, 0.25, -0.002, c); p.box(0.044, 0.004, 0.022, 0, 0.25, 0.028, c); return true; }
    if (r < 4) { p.sphere(0.026, 0, 0.252, 0, BLACK, 1, 0.85); p.cyl(0.038, 0.038, 0.004, 10, 0, 0.25, 0, BLACK); return true; }
    if (r < 5) { p.cyl(0.024, 0.024, 0.05, 10, 0, 0.252, 0, BLACK); p.cyl(0.038, 0.038, 0.004, 10, 0, 0.25, 0, BLACK); p.cyl(0.0245, 0.0245, 0.008, 10, 0, 0.258, 0, 0x8a2a2a); return true; }
    return false;
  }
  if (era >= 5) {
    // visière lumineuse sur les yeux, ou serre-tête
    if (r < 2) p.box(0.05, 0.01, 0.008, 0, 0.226, 0.023, of([0x5af0ff, 0xff5ad8, 0x7affc0], v, 26), 0, 'neon');
    else if (r === 2) p.box(0.05, 0.008, 0.05, 0, 0.246, 0, of([0xf2f4f6, 0x5af0ff, 0x2a2e3a], v, 27));
    return false;
  }
  // casquette à visière, bonnet
  const c = of([0xd84a3e, 0x3c7fd8, 0x2a2a2e, 0xf2c23a, 0x4fa860], v, 25);
  if (!woman && r < 2) { p.sphere(0.026, 0, 0.25, 0, c, 1, 0.6); p.box(0.04, 0.004, 0.026, 0, 0.252, 0.028, c); return true; }
  if (r === 2) { p.sphere(0.028, 0, 0.25, 0, c, 1, 0.75); p.box(0.05, 0.01, 0.05, 0, 0.238, 0, dark(c, 0.85)); return true; }
  return false;
}

const STRAW = 0xd8c08a;

/**
 * Tenue des champs, par-dessus celle de l'époque : salopette de toile bleue (bavette, bretelles, ceinture) à l'âge industriel,
 * salopette de travail et bottes de caoutchouc à l'époque moderne ; avant, la tenue de tous les jours suffit
 */
function farmWear(p: Parts, era: number, v: number, woman: boolean, w: Wear) {
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
  w.leg = c;
  if (era === 4) w.boot = of([0x2e4a2e, 0x26262a, 0x8a2a24], v, 41);
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
    if (woman && r < 2) { p.sphere(0.03, 0, 0.238, -0.002, of([0xf2ece0, 0xc8443a, 0x4a6ab8], v, 43), 1, 0.95); p.box(0.02, 0.02, 0.012, 0, 0.215, -0.03, 0xf2ece0); return true; }
    p.cyl(0.066, 0.066, 0.005, 10, 0, 0.25, 0, STRAW); p.cone(0.03, 0.035, 8, 0, 0.255, 0, STRAW); return true;
  }
  if (era === 3) {
    if (woman) { p.sphere(0.03, 0, 0.24, -0.008, of([0xe8dcc8, 0xd8c8a0], v, 44), 1, 0.95); p.cyl(0.05, 0.05, 0.004, 10, 0, 0.244, 0.01, STRAW); return true; }
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
  const w: Wear = { leg: 0x4a3a2e, boot: LEATHER, arm: skin, hand: skin, sleeve: null, hair: true };
  if (role === 'monk') {
    // bure brune jusqu'aux pieds, cordelière, capuchon rabattu, tonsure
    const bure = 0x6a4a34;
    p.box(0.08, 0.15, 0.054, 0, 0.06, 0, bure); p.cyl(0.044, 0.054, 0.07, 8, 0, 0, 0, bure);
    p.box(0.084, 0.008, 0.058, 0, 0.125, 0, WHITE); p.box(0.006, 0.05, 0.006, 0.02, 0.08, 0.03, WHITE);
    p.box(0.05, 0.03, 0.03, 0, 0.18, -0.035, dark(bure, 0.9));
    p.box(0.048, 0.016, 0.048, 0, 0.232, 0, 0x8a6a4a); p.box(0.036, 0.006, 0.036, 0, 0.248, 0, skin);
    w.arm = bure; w.leg = bure; w.boot = 0x4a3426; w.hair = false;
  } else if (role === 'juggler') {
    // pourpoint mi-parti rouge et jaune, losanges, bonnet de fou à grelots
    p.box(0.04, 0.1, 0.054, -0.02, 0.11, 0, 0xd8443a); p.box(0.04, 0.1, 0.054, 0.02, 0.11, 0, 0xf2c23a);
    for (const [x, y] of [[-0.02, 0.13], [0.02, 0.17]]) p.add(new THREE.BoxGeometry(0.014, 0.014, 0.004).rotateZ(Math.PI / 4), x, y, 0.028, x < 0 ? 0xf2c23a : 0xd8443a);
    p.box(0.07, 0.02, 0.05, 0, 0.09, 0, 0x3a3a8a);
    for (const s of [-1, 1]) { p.add(new THREE.ConeGeometry(0.014, 0.05, 5), s * 0.03, 0.258, 0, s < 0 ? 0xd8443a : 0xf2c23a, 0, false, s * 1.1); p.sphere(0.007, s * 0.056, 0.262, 0, GOLD); }
    p.box(0.048, 0.016, 0.048, 0, 0.248, 0, 0x3a3a8a);
    w.arm = [0xf2c23a, 0xd8443a]; w.leg = [0xf2c23a, 0xd8443a]; w.boot = 0x3a3a8a; w.hair = false;
  } else if (role === 'sage' || role === 'scholar') {
    if (role === 'sage' || era < 3) {
      // grande robe bleue bordée d'or, barbe blanche, chapeau pointu à large bord
      const robe = 0x2c3e7a;
      p.box(0.08, 0.15, 0.054, 0, 0.06, 0, robe); p.cyl(0.046, 0.058, 0.07, 8, 0, 0, 0, robe);
      p.box(0.012, 0.18, 0.004, 0, 0.02, 0.0275, GOLD);
      p.cyl(0.06, 0.06, 0.006, 10, 0, 0.25, 0, robe); p.cone(0.03, 0.09, 8, 0, 0.255, 0, robe); p.box(0.04, 0.008, 0.04, 0, 0.256, 0, GOLD);
      w.arm = robe; w.leg = robe; w.hair = false;
    } else {
      // redingote noire, gilet, col blanc et lavallière, haut-de-forme, lorgnon
      p.box(0.078, 0.1, 0.052, 0, 0.11, 0, BLACK); p.box(0.03, 0.07, 0.004, 0, 0.14, 0.0265, WHITE); p.box(0.014, 0.01, 0.005, 0, 0.198, 0.027, 0x8a2a2a);
      p.cyl(0.044, 0.05, 0.06, 8, 0, 0.05, 0, BLACK);
      p.cyl(0.024, 0.024, 0.05, 10, 0, 0.252, 0, BLACK); p.cyl(0.038, 0.038, 0.004, 10, 0, 0.25, 0, BLACK);
      for (const s of [-1, 1]) p.box(0.012, 0.012, 0.003, s * 0.011, 0.23, 0.0245, 0xd8e8f0);
      w.arm = BLACK; w.leg = 0x4a4a52; w.boot = BLACK; w.hair = false;
    }
  } else if (role === 'nomad') {
    // grande cape à capuche, foulard sur le bas du visage, bandes molletières
    const cape = of([0x5a4636, 0x4a4a44, 0x6a5038], v, 30);
    p.box(0.08, 0.14, 0.054, 0, 0.07, 0, cape); p.box(0.09, 0.15, 0.012, 0, 0.06, -0.032, dark(cape, 0.9));
    p.sphere(0.031, 0, 0.236, -0.004, cape, 1, 1.05);
    p.box(0.046, 0.016, 0.01, 0, 0.198, 0.02, of([0xb84a4a, 0x8a7a4a, 0x3a5a6a], v, 31));
    w.arm = cape; w.leg = 0x8a7a64; w.boot = 0x4a3426; w.hair = false;
  } else if (role === 'thief') {
    // le cambrioleur : marinière noire et blanche, loup noir sur les yeux, béret, sac de butin sur l'épaule
    p.box(0.078, 0.1, 0.052, 0, 0.11, 0, WHITE);
    for (let k = 0; k < 4; k++) p.box(0.08, 0.012, 0.054, 0, 0.115 + k * 0.024, 0, BLACK);
    p.box(0.05, 0.012, 0.004, 0, 0.228, 0.0235, BLACK);
    p.sphere(0.029, 0, 0.252, -0.002, BLACK, 1, 0.45); p.box(0.006, 0.01, 0.006, 0, 0.264, 0, BLACK);
    p.sphere(0.04, -0.03, 0.2, -0.045, 0xd8d0b8, 1, 1.1); p.box(0.012, 0.012, 0.012, -0.03, 0.245, -0.045, 0xb8ae94);
    w.arm = BLACK; w.leg = BLACK; w.boot = 0x3a3a3a; w.hair = false;
  } else if (role === 'astronaut') {
    // scaphandre blanc, sac de survie sur le dos, drapeau et écusson, gants et bottes gris, casque rond à visière dorée
    p.box(0.086, 0.13, 0.06, 0, 0.075, 0, WHITE); p.box(0.062, 0.1, 0.03, 0, 0.1, -0.045, 0xd8dce2);
    p.box(0.022, 0.014, 0.004, -0.02, 0.172, 0.031, 0x3a6ab8); p.box(0.022, 0.007, 0.005, -0.02, 0.172, 0.0315, 0xd8443a);
    p.box(0.02, 0.02, 0.004, 0.018, 0.14, 0.031, 0x2a2e3a); p.box(0.012, 0.004, 0.005, 0.018, 0.146, 0.0315, 0x5af0ff, 0, 'neon');
    p.box(0.09, 0.012, 0.064, 0, 0.11, 0, 0xb8bcc2);
    p.sphere(0.042, 0, 0.214, 0, WHITE, 1); p.box(0.05, 0.03, 0.012, 0, 0.212, 0.04, 0xe8b84a);
    w.arm = WHITE; w.leg = WHITE; w.boot = 0x9aa0a8; w.hand = 0xb8bcc2; w.hair = false;
  } else if (role === 'drummer') {
    // gilet de fourrure ouvert, bras nus, bandeau, grande barbe
    p.box(0.078, 0.1, 0.052, 0, 0.11, 0, skin);
    for (const s of [-1, 1]) p.box(0.03, 0.11, 0.056, s * 0.025, 0.1, 0, 0x7a5a3a);
    p.box(0.082, 0.012, 0.056, 0, 0.11, 0, LEATHER);
    p.box(0.05, 0.008, 0.05, 0, 0.244, 0, 0xc8443a);
    w.leg = 0x5a4a3a;
  } else {
    // pêcheur : vareuse et suroît cirés jaunes à l'âge industriel et après, chapeau de paille avant
    if (era >= 3) {
      const oil = 0xf2c23a;
      p.box(0.08, 0.12, 0.054, 0, 0.09, 0, oil); for (let k = 0; k < 3; k++) p.box(0.006, 0.006, 0.004, 0.012, 0.12 + k * 0.025, 0.028, BLACK);
      p.sphere(0.03, 0, 0.245, -0.004, oil, 1, 0.75); p.add(new THREE.CylinderGeometry(0.045, 0.05, 0.006, 10), 0, 0.236, -0.006, oil, 0, false, 0, -0.2);
      w.arm = oil; w.leg = 0x2a3a5a; w.boot = BLACK; w.hair = false;
    } else {
      const shirt = of([0xe8dcc8, 0x8aa0b8, 0xc8b48a], v, 32);
      p.box(0.078, 0.11, 0.052, 0, 0.1, 0, shirt); p.box(0.082, 0.01, 0.056, 0, 0.12, 0, ROPE);
      p.cyl(0.06, 0.06, 0.005, 10, 0, 0.25, 0, 0xd8c08a); p.cone(0.028, 0.026, 8, 0, 0.255, 0, 0xd8c08a);
      w.arm = shirt; w.leg = 0x6a5a48; w.boot = era <= 1 ? 0x8a5a34 : LEATHER; w.hair = false;
    }
  }
  return w;
}

/** Un habitant (ou une figure) de l'époque `age` ; `v` choisit son allure, sa tenue, ses couleurs */
export function makeFolk(look: FolkLook): Folk {
  const era = Math.min(5, Math.max(0, look.age)), v = look.v, role = look.role ?? 'villager', child = !!look.child;
  const woman = look.woman ?? (role === 'villager' && hv(v, 1) % 2 === 1);
  const skin = SKINS[hv(v, 2) % SKINS.length];
  const old = !child && hv(v, 4) % 6 === 0, hair = old ? GREY : HAIRS[hv(v, 3) % HAIRS.length];
  const p = new Parts();
  const w = role === 'villager' ? wear(p, era, v, woman, child, skin) : figure(p, role, era, v, skin);
  const farmer = !!look.farmer && role === 'villager' && !child;
  if (farmer) farmWear(p, era, v, woman, w);
  const covered = role === 'villager' ? (farmer ? farmHat(p, era, v, woman) : hat(p, era, v, woman)) : !w.hair;
  // coiffure : longue, chignon ou queue de cheval pour les femmes, courte pour les hommes (en bataille à la préhistoire)
  const style = covered ? (role === 'villager' && woman ? 3 : -1) : woman ? [1, 2, 3][hv(v, 5) % 3] : era === 0 && hv(v, 5) % 2 ? 1 : 0;
  const beard = child || woman ? 0 : role === 'sage' || (role === 'scholar' && era < 3) ? 3 : role === 'drummer' ? 1 : role === 'monk' || role === 'juggler' || role === 'astronaut' ? 0
    : old && era <= 2 ? 3 : [0, 0, 1, 2][hv(v, 6) % 4] * (era === 4 && hv(v, 7) % 2 ? 0 : 1);
  head(p, skin, hair, style, beard);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(HUMAN_K * (look.size ?? 1) * (child ? 0.62 : 1));
  const built = p.build(false), hull = new THREE.Mesh(built.body, mats.body);
  hull.castShadow = true;
  body.add(hull);
  if (built.glow) body.add(new THREE.Mesh(built.glow, mats.glow));
  const pair = (c: number | [number, number], i: number) => (Array.isArray(c) ? c[i] : c);
  // jambes (pivot à la hanche) et bras (pivot à l'épaule), la main au bout du bras
  const legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [], hands: THREE.Object3D[] = [];
  [-1, 1].forEach((s, i) => {
    const lp = new Parts();
    lp.box(0.03, 0.078, 0.034, 0, -0.08, 0, pair(w.leg, i));
    lp.box(0.032, 0.026, 0.044, 0, -0.1, 0.006, w.boot);
    const leg = new THREE.Mesh(lp.build(false).body, mats.body);
    leg.position.set(s * 0.019, 0.1, 0);
    leg.castShadow = true;
    root.add(leg);
    legs.push(leg);
  });
  [-1, 1].forEach((s, i) => {
    const ap = new Parts();
    ap.box(0.024, 0.082, 0.028, 0, -0.072, 0, pair(w.arm, i));
    if (w.sleeve !== null) ap.box(0.028, 0.034, 0.032, 0, -0.024, 0, w.sleeve);
    ap.box(0.022, 0.022, 0.024, 0, -0.094, 0.002, w.hand);
    const arm = new THREE.Group();
    const am = new THREE.Mesh(ap.build(false).body, mats.body);
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

/** L'habitant au rythme de `phase` : son pas, sa course, l'ouvrage (l'outil qui monte et frappe), assis, bras levés, mains qui parlent */
export function folkStep(f: Folk, phase: number, pose: FolkPose) {
  const [right, left] = f.arms, [l0, l1] = f.legs, b = f.body, sw = Math.sin(phase);
  const sit = pose === 'sit';
  b.position.y = sit ? -0.075 : pose === 'walk' || pose === 'carry' ? Math.abs(sw) * 0.006 : pose === 'run' ? Math.abs(sw) * 0.012 : pose === 'cheer' ? Math.abs(Math.sin(phase * 2)) * 0.008 : Math.sin(phase * 0.3) * 0.0015;
  for (const l of f.legs) l.position.y = sit ? 0.025 : 0.1;
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
