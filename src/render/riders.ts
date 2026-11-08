import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import { HUMAN_K } from './assets';
import type { HoverParts } from './futureTroops';

/**
 * Cavaliers de la charge de cavalerie, dans le style des chevaliers qui joutent dans les jardins : cheval low-poly aux jambes
 * qui galopent, cavalier de l'époque aux couleurs du village (bleu et or) — cavalier romain au casque à crête dans
 * l'Antiquité, chevalier caparaçonné à la lance au Moyen Âge, cuirassier au casque à crinière et au sabre à l'âge
 * industriel ; à l'époque moderne, plus de chevaux : un char d'assaut, chenilles, tourelle et canon, fanion du village.
 * Sous terre, la colonne blindée moderne : gros chars de bataille, transports de troupes à huit roues, drones d'escorte,
 * projecteurs braqués
 */

export interface Rider {
  root: THREE.Group;
  /** cheval et cavalier (ou caisse du char), bercés par le galop ; les jambes (les galets) et l'arme (le canon) y sont accrochées */
  body: THREE.Group;
  legs: THREE.Object3D[];
  weapon: THREE.Object3D;
  tank: boolean;
  /** blindé de la colonne moderne : sa tourelle (elle pivote vers la cible, l'arme y est accrochée), le bout de son arme dans
   * le repère de la tourelle, les faisceaux de ses projecteurs, et son arme : canon du char, canon-mitrailleur du transport */
  turret?: THREE.Object3D;
  muzzle?: THREE.Vector3;
  beams?: THREE.Object3D[];
  gun?: 'cannon' | 'mg';
  /** flamme de bouche, montrée un instant après chaque tir */
  flare?: THREE.Object3D;
  /** char antigrav de l'âge futuriste (voir `futureTroops.ts`) : coussin d'énergie, bouclier, flammes de plasma */
  hover?: HoverParts;
}

/** Ce que fait le cavalier : en route (arme haute), à la charge (lance couchée, sabre en avant), au combat */
export type RiderMode = 'rest' | 'charge' | 'fight';

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const STEEL = 0xc4cad2, BLUE = 0x3a6ab8, GOLD = 0xe8c66a, SKIN = 0xe8b894, LEATHER = 0x4a3426, BLACK = 0x1e1e22, BRONZE = 0xc49a54;
const OLIVE = 0x66723f, OLIVE_D = 0x4c5630, KHAKI = 0x8a845a, TRACK = 0x2f2f2c;
/** robes des chevaux : bai, alezan, noir, gris */
const COATS = [0x8a6248, 0xa8683e, 0x3e3434, 0xd8d2c8];

/** Boîte tendue entre deux points (rênes, baudriers) */
function bar(p: Parts, a: THREE.Vector3, b: THREE.Vector3, w: number, color: number) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.BoxGeometry(w, w, len).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  p.add(g, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, color);
}

/** Le cheval, tourné vers +z : corps, encolure et crinière, tête, oreilles, yeux, bout du nez, queue, bride et rênes */
function horse(p: Parts, coat: number) {
  p.add(new THREE.IcosahedronGeometry(0.07, 1).scale(0.85, 0.85, 1.9), 0, 0.2, 0, coat);
  p.add(new THREE.BoxGeometry(0.05, 0.13, 0.06), 0, 0.27, 0.13, coat, 0, false, 0, 0.55);
  p.add(new THREE.BoxGeometry(0.014, 0.13, 0.026), 0, 0.29, 0.106, dark(coat, 0.5), 0, false, 0, 0.55);
  p.add(new THREE.BoxGeometry(0.048, 0.05, 0.11), 0, 0.32, 0.2, coat, 0, false, 0, 0.5);
  p.add(new THREE.BoxGeometry(0.046, 0.042, 0.036), 0, 0.296, 0.246, dark(coat, 0.78), 0, false, 0, 0.5);
  for (const s of [-1, 1]) {
    p.add(new THREE.ConeGeometry(0.011, 0.035, 4), s * 0.015, 0.365, 0.165, coat, 0, false, s * 0.2);
    p.box(0.005, 0.009, 0.01, s * 0.025, 0.325, 0.2, 0x1a1a1a);
  }
  p.add(new THREE.ConeGeometry(0.022, 0.12, 4), 0, 0.165, -0.175, dark(coat, 0.55), 0, false, 0, -2.5);
  // bride : muserolle et têtière de cuir, rênes jusqu'aux mains du cavalier
  p.add(new THREE.BoxGeometry(0.05, 0.008, 0.04), 0, 0.296, 0.244, LEATHER, 0, false, 0, 0.5);
  p.add(new THREE.BoxGeometry(0.052, 0.008, 0.012), 0, 0.338, 0.178, LEATHER, 0, false, 0, 0.5);
  for (const s of [-1, 1]) bar(p, new THREE.Vector3(s * 0.024, 0.292, 0.235), new THREE.Vector3(s * 0.03, 0.3, 0.075), 0.005, LEATHER);
}

/** Selle sur son tapis bordé, et étriers */
function saddle(p: Parts, cloth: number, trim: number) {
  p.box(0.142, 0.062, 0.132, 0, 0.204, -0.005, cloth);
  p.box(0.144, 0.012, 0.134, 0, 0.204, -0.005, trim);
  p.box(0.075, 0.026, 0.085, 0, 0.258, 0, LEATHER);
  p.box(0.045, 0.024, 0.016, 0, 0.27, 0.04, LEATHER);
  for (const s of [-1, 1]) p.box(0.022, 0.006, 0.03, s * 0.074, 0.15, 0.04, 0x8a8f96);
}

/** Le cavalier assis : cuisses sur la selle, jambes de part et d'autre, buste, bras ; couleurs données par l'époque */
function seated(p: Parts, o: { thigh: number; boot: number; coat: number; arm: number; glove: number }) {
  p.box(0.08, 0.03, 0.06, 0, 0.268, -0.005, o.thigh);
  for (const s of [-1, 1]) {
    p.box(0.03, 0.03, 0.075, s * 0.05, 0.268, 0.025, o.thigh);
    p.box(0.028, 0.1, 0.034, s * 0.072, 0.17, 0.045, o.boot);
  }
  p.box(0.085, 0.11, 0.06, 0, 0.285, 0, o.coat);
  // bras gauche aux rênes, bras droit vers l'arme
  for (const s of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.026, 0.07, 0.03), s * 0.056, 0.345, 0.008, o.arm, 0, false, 0, -0.35);
    p.add(new THREE.BoxGeometry(0.024, 0.024, 0.06), s * 0.05, 0.31, 0.045, o.arm);
    p.box(0.024, 0.022, 0.022, s * 0.045, 0.298, 0.08, o.glove);
  }
  p.box(0.046, 0.046, 0.046, 0, 0.395, 0.004, SKIN);
}

/** Lance rayée bleu et or (hampe de frêne pour les Romains), garde en cône ; tenue de la main droite, couchée vers +z */
function lance(a = BLUE, b = GOLD) {
  const p = new Parts();
  for (let k = 0; k < 5; k++) p.add(new THREE.CylinderGeometry(0.0075 - k * 0.0008, 0.0085 - k * 0.0008, 0.12, 5).rotateX(Math.PI / 2), 0, 0, k * 0.12, k % 2 ? b : a);
  p.add(new THREE.ConeGeometry(0.026, 0.05, 6).rotateX(Math.PI / 2), 0, 0, 0.03, STEEL);
  return p;
}

/** Sabre droit de cavalerie, lame vers +y depuis la main : poignée, garde de laiton */
function saber() {
  const p = new Parts();
  p.box(0.012, 0.03, 0.012, 0, -0.022, 0, LEATHER);
  p.box(0.034, 0.008, 0.014, 0, 0.004, 0, GOLD);
  p.box(0.006, 0.17, 0.014, 0, 0.008, 0, STEEL);
  p.add(new THREE.ConeGeometry(0.006, 0.02, 4), 0, 0.188, 0, STEEL);
  return p;
}

/** Carabine tenue canon en l'air : crosse, boîtier, chargeur, canon */
function carbine() {
  const p = new Parts();
  p.box(0.016, 0.05, 0.02, 0, -0.04, 0, 0x5a4636);
  p.box(0.018, 0.07, 0.024, 0, 0.0, 0, 0x3c3c40);
  p.box(0.012, 0.03, 0.02, 0, 0.02, 0.022, 0x2a2a2e);
  p.box(0.008, 0.08, 0.008, 0, 0.07, 0, 0x2a2a2e);
  return p;
}

/** Canon du char, vers +z depuis le masque de tourelle : masque, tube, frein de bouche */
function cannon() {
  const p = new Parts();
  p.box(0.05, 0.042, 0.04, 0, -0.021, 0, OLIVE_D);
  p.add(new THREE.CylinderGeometry(0.0105, 0.013, 0.22, 7).rotateX(Math.PI / 2), 0, 0, 0.13, OLIVE);
  p.box(0.028, 0.024, 0.034, 0, -0.012, 0.24, OLIVE_D);
  return p;
}

/**
 * Char d'assaut, tourné vers +z : chenilles et garde-boue, caisse et glacis, phares, tourelle et chef de char au tourelleau,
 * antenne au fanion bleu et or, écusson du village, taches de camouflage ; galets à part (ils roulent), canon à part
 */
function tank(v: number): Rider {
  const p = new Parts();
  for (const s of [-1, 1]) {
    p.box(0.07, 0.075, 0.44, s * 0.115, 0, 0, TRACK);
    p.box(0.072, 0.018, 0.4, s * 0.115, 0.075, 0, dark(TRACK, 1.3));
    p.box(0.086, 0.012, 0.46, s * 0.115, 0.093, 0, OLIVE_D);
    // barbotin à l'avant, roue folle à l'arrière
    for (const z of [0.2, -0.2]) p.add(new THREE.CylinderGeometry(0.034, 0.034, 0.074, 8).rotateZ(Math.PI / 2), s * 0.115, 0.045, z, dark(TRACK, 1.5));
  }
  p.box(0.17, 0.06, 0.4, 0, 0.04, 0, OLIVE_D);
  p.box(0.24, 0.045, 0.36, 0, 0.1, -0.015, OLIVE);
  p.add(new THREE.BoxGeometry(0.24, 0.012, 0.1), 0, 0.118, 0.19, OLIVE, 0, false, 0, -0.55);
  for (const s of [-1, 1]) p.box(0.026, 0.018, 0.012, s * 0.085, 0.1, 0.212, 0xfff1c9, 0, true);
  p.box(0.2, 0.035, 0.03, 0, 0.09, -0.2, OLIVE_D);
  for (const s of [-1, 1]) p.box(0.03, 0.03, 0.02, s * 0.06, 0.105, -0.218, dark(TRACK, 1.2));
  // taches de camouflage
  p.box(0.07, 0.004, 0.09, 0.05, 0.145, 0.06, KHAKI);
  p.box(0.06, 0.004, 0.07, -0.07, 0.145, -0.12, dark(OLIVE_D, 0.85));
  p.box(0.05, 0.004, 0.05, -0.05, 0.145, 0.1, dark(OLIVE_D, 0.85));
  // tourelle : biseautée, écusson bleu et or sur les flancs, tourelleau, chef de char casqué
  p.box(0.15, 0.055, 0.17, 0, 0.145, -0.03, OLIVE);
  p.box(0.13, 0.014, 0.15, 0, 0.2, -0.03, dark(OLIVE, 0.92));
  p.box(0.04, 0.008, 0.06, -0.035, 0.212, -0.09, KHAKI);
  for (const s of [-1, 1]) { p.box(0.004, 0.03, 0.03, s * 0.076, 0.157, -0.03, BLUE); p.box(0.005, 0.012, 0.012, s * 0.077, 0.166, -0.03, GOLD); }
  p.cyl(0.026, 0.028, 0.02, 8, 0.03, 0.214, -0.06, OLIVE_D);
  p.box(0.03, 0.026, 0.028, 0.03, 0.234, -0.06, SKIN);
  p.sphere(0.022, 0.03, 0.262, -0.062, OLIVE_D, 1, 0.75);
  // antenne et fanion du village
  p.box(0.004, 0.2, 0.004, -0.055, 0.214, -0.1, BLACK);
  p.box(0.003, 0.03, 0.05, -0.055, 0.384, -0.126, BLUE);
  p.box(0.0035, 0.01, 0.05, -0.055, 0.384, -0.126, GOLD);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  // un peu plus gros qu’un cheval et son cavalier
  root.scale.setScalar(((1 + HUMAN_K) / 2) * 1.25);
  const built = p.build(false);
  const hull = new THREE.Mesh(built.body, mats.body);
  hull.castShadow = true;
  body.add(hull);
  if (built.glow) body.add(new THREE.Mesh(built.glow, mats.glow));
  // galets de roulement, de part et d'autre : ils tournent quand le char avance (moyeu clair pour qu'on le voie)
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (const z of [-0.12, -0.04, 0.04, 0.12]) {
    const wp = new Parts();
    wp.add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8).rotateZ(Math.PI / 2), 0, 0, 0, dark(OLIVE_D, 0.9));
    wp.box(0.014, 0.034, 0.012, s * 0.002, -0.017, 0, KHAKI);
    const wheel = new THREE.Mesh(wp.build(false).body, mats.body);
    wheel.position.set(s * 0.152, 0.04, z);
    wheel.userData.ph = z * 9 + v;
    body.add(wheel);
    legs.push(wheel);
  }
  const wm = new THREE.Mesh(cannon().build(false).body, mats.body);
  wm.position.set(0, 0.17, 0.055);
  wm.rotation.order = 'YXZ';
  wm.userData.kind = 'cannon';
  wm.castShadow = true;
  body.add(wm);
  return { root, body, legs, weapon: wm, tank: true };
}

/**
 * Cavalier de l'époque (âge 1 à 3 ; plus tôt, le cavalier romain ; à l'époque moderne, un char) ; `v` varie la robe du
 * cheval. Tourné vers +z, posé à y = 0, à l'échelle des habitants
 */
export function makeRider(age: number, v = 0, gendarme = false): Rider {
  const era = Math.min(4, Math.max(1, age)), coat = COATS[(v % COATS.length + COATS.length) % COATS.length];
  if (era === 4 && !gendarme) return tank(v);
  const p = new Parts();
  horse(p, coat);
  let weapon: Parts, kind: 'lance' | 'saber' | 'rifle', hand: [number, number, number];
  if (gendarme && era >= 3) {
    // gendarme à cheval : tapis bleu bordé de blanc, culotte de peau blanche et bottes noires, habit bleu de roi, baudrier
    // jaune bordé de blanc, trèfles d'argent, bicorne en bataille à cocarde (képi à l'époque moderne), sabre
    const navy = 0x22305a, buff = 0xe8c060, silver = 0xd8dce2;
    saddle(p, navy, 0xf0ece0);
    seated(p, { thigh: era >= 4 ? navy : 0xf0ece0, boot: BLACK, coat: navy, arm: navy, glove: era >= 4 ? BLACK : 0xf0ece0 });
    p.add(new THREE.BoxGeometry(0.02, 0.12, 0.003), 0, 0.32, 0.031, 0xf0ece0, 0, false, 0.6);
    p.add(new THREE.BoxGeometry(0.014, 0.12, 0.004), 0, 0.32, 0.032, buff, 0, false, 0.6);
    for (const s of [-1, 1]) p.box(0.03, 0.01, 0.04, s * 0.05, 0.345, 0, silver);
    if (era >= 4) { p.cyl(0.026, 0.024, 0.04, 10, 0, 0.42, 0, 0x1a2238); p.cyl(0.0265, 0.0265, 0.008, 10, 0, 0.425, 0, silver); p.box(0.04, 0.005, 0.022, 0, 0.42, 0.03, BLACK); }
    else {
      const half = (r: number) => new THREE.CylinderGeometry(r, r, 0.026, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1.25, 0.62, 1);
      p.add(half(0.046), 0, 0.422, 0, BLACK); for (const z of [-0.0135, 0.0135]) p.add(new THREE.TorusGeometry(0.045, 0.0025, 3, 14, Math.PI).scale(1.25, 0.62, 1), 0, 0.422, z, silver); p.box(0.11, 0.008, 0.03, 0, 0.418, 0, BLACK);
      p.add(new THREE.CylinderGeometry(0.011, 0.011, 0.004, 10).rotateX(Math.PI / 2), 0.026, 0.438, 0.016, 0xd8443a);
      p.add(new THREE.CylinderGeometry(0.0075, 0.0075, 0.005, 10).rotateX(Math.PI / 2), 0.026, 0.438, 0.017, 0xf0ece0);
      p.add(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 8).rotateX(Math.PI / 2), 0.026, 0.438, 0.018, 0x2c4a9a);
    }
    weapon = saber(); kind = 'saber'; hand = [-0.048, 0.3, 0.08];
  } else if (gendarme && era === 2) {
    // sergent à cheval du guet : tapis bleu, tabard bleu à la fleur d'or, chapel de fer, épée
    saddle(p, BLUE, GOLD);
    seated(p, { thigh: 0x6a6a72, boot: LEATHER, coat: BLUE, arm: 0x8f949c, glove: LEATHER });
    p.box(0.02, 0.02, 0.066, 0, 0.32, 0, GOLD);
    p.sphere(0.03, 0, 0.425, 0, STEEL, 1, 0.75); p.cyl(0.05, 0.044, 0.012, 10, 0, 0.412, 0, STEEL);
    weapon = saber(); kind = 'saber'; hand = [-0.048, 0.3, 0.08];
  } else if (era === 1) {
    // cavalier romain : tapis rouge bordé d'or, tunique rouge et cape, cotte de mailles, casque de bronze à crête rouge,
    // bouclier ovale bleu à l'umbo d'or, lance de frêne
    saddle(p, 0xb8322c, GOLD);
    seated(p, { thigh: SKIN, boot: LEATHER, coat: 0xb8322c, arm: SKIN, glove: SKIN });
    p.box(0.091, 0.072, 0.065, 0, 0.3, 0, 0x8f949c);
    p.box(0.093, 0.012, 0.067, 0, 0.296, 0, LEATHER);
    p.add(new THREE.BoxGeometry(0.09, 0.13, 0.012), 0, 0.33, -0.04, 0xa82a26, 0, false, 0, 0.22);
    p.sphere(0.03, 0, 0.44, 0.0, BRONZE, 1, 0.8);
    p.box(0.012, 0.024, 0.07, 0, 0.455, -0.006, 0xd84a3e);
    p.box(0.06, 0.008, 0.02, 0, 0.41, -0.028, BRONZE);
    for (const s of [-1, 1]) p.box(0.008, 0.026, 0.018, s * 0.026, 0.4, 0.012, BRONZE);
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10).rotateZ(Math.PI / 2).scale(1, 1.3, 1), 0.076, 0.3, 0.02, BLUE);
    p.sphere(0.014, 0.084, 0.3, 0.02, GOLD);
    weapon = lance(0x9a7452, 0x8a6448); kind = 'lance'; hand = [-0.05, 0.3, 0.06];
  } else if (era === 2) {
    // chevalier : caparaçon bleu bordé d'or, chanfrein d'acier, armure, heaume à fente et plumet, écu au bras gauche
    p.box(0.16, 0.1, 0.3, 0, 0.13, -0.005, BLUE);
    p.box(0.162, 0.025, 0.302, 0, 0.13, -0.005, GOLD);
    p.add(new THREE.BoxGeometry(0.05, 0.03, 0.08), 0, 0.338, 0.205, STEEL, 0, false, 0, 0.5);
    p.sphere(0.014, 0, 0.375, 0.17, GOLD, 0, 1.4);
    seated(p, { thigh: STEEL, boot: STEEL, coat: STEEL, arm: STEEL, glove: dark(STEEL, 0.8) });
    p.box(0.09, 0.075, 0.065, 0, 0.255, 0, BLUE);
    p.box(0.092, 0.018, 0.066, 0, 0.3, 0, GOLD);
    p.cyl(0.032, 0.034, 0.065, 7, 0, 0.38, 0, STEEL);
    p.box(0.04, 0.008, 0.01, 0, 0.415, 0.032, 0x3c4a54);
    p.sphere(0.025, 0, 0.465, -0.01, GOLD, 0, 1.3);
    p.box(0.012, 0.09, 0.07, 0.07, 0.24, 0.02, GOLD);
    p.box(0.014, 0.03, 0.072, 0.071, 0.27, 0.02, BLUE);
    weapon = lance(); kind = 'lance'; hand = [-0.05, 0.3, 0.06];
  } else if (era === 3) {
    // cuirassier : tapis bleu bordé d'or, culotte rouge, bottes noires, habit bleu, cuirasse d'acier, épaulettes rouges,
    // casque d'acier à cimier de laiton, crinière noire et plumet rouge
    saddle(p, 0x2c3e6a, GOLD);
    seated(p, { thigh: 0xb83a32, boot: BLACK, coat: 0x2c3e6a, arm: 0x2c3e6a, glove: 0xf0ece0 });
    p.box(0.092, 0.075, 0.066, 0, 0.3, 0, STEEL);
    p.box(0.094, 0.01, 0.068, 0, 0.372, 0, GOLD);
    for (const s of [-1, 1]) p.box(0.03, 0.014, 0.04, s * 0.05, 0.392, 0, 0xd84a3e);
    p.cyl(0.03, 0.033, 0.045, 7, 0, 0.405, 0.002, STEEL);
    p.box(0.05, 0.006, 0.022, 0, 0.408, 0.036, BLACK);
    p.box(0.014, 0.03, 0.064, 0, 0.445, 0.0, GOLD);
    p.add(new THREE.BoxGeometry(0.012, 0.1, 0.02), 0, 0.41, -0.05, 0x1a1a1a, 0, false, 0, -0.35);
    p.add(new THREE.ConeGeometry(0.009, 0.07, 4), 0.027, 0.455, 0.006, 0xd84a3e);
    weapon = saber(); kind = 'saber'; hand = [-0.048, 0.3, 0.08];
  } else {
    // garde à cheval : tapis marine liseré de blanc, culotte beige, bottes noires, veste marine et gilet fluo à bandes
    // grises, casque noir et lampe frontale, carabine
    saddle(p, 0x2a3448, 0xf0ece0);
    seated(p, { thigh: 0xd8c8a0, boot: BLACK, coat: 0x2a3448, arm: 0x2a3448, glove: BLACK });
    p.box(0.091, 0.08, 0.065, 0, 0.29, 0, 0xe8e040);
    for (const y of [0.3, 0.335]) p.box(0.093, 0.01, 0.067, 0, y, 0, 0xd0d4d8);
    p.sphere(0.031, 0, 0.432, -0.002, BLACK, 1, 0.7);
    p.box(0.046, 0.005, 0.014, 0, 0.42, 0.03, BLACK);
    p.box(0.016, 0.012, 0.008, 0, 0.435, 0.03, 0xfff4d0, 0, true);
    weapon = carbine(); kind = 'rifle'; hand = [-0.048, 0.3, 0.08];
  }
  // cheval et cavalier dessinés pour des habitants de 0,3 : le cavalier rapetisse avec eux, le cheval un peu moins
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar((1 + HUMAN_K) / 2);
  const built = p.build(false);
  const hull = new THREE.Mesh(built.body, mats.body);
  hull.castShadow = true;
  body.add(hull);
  if (built.glow) body.add(new THREE.Mesh(built.glow, mats.glow));
  // jambes : pivot à l'épaule et à la hanche ; balzanes blanches sur deux d'entre elles
  const legs: THREE.Object3D[] = [];
  for (const [x, z, ph, sock] of [[0.04, 0.09, 0, 1], [-0.04, 0.09, Math.PI, 0], [0.04, -0.09, Math.PI, 0], [-0.04, -0.09, 0, v % 2]]) {
    const lp = new Parts();
    lp.cyl(0.013, 0.015, 0.13, 5, 0, -0.13, 0, coat);
    if (sock) lp.cyl(0.0135, 0.0135, 0.03, 5, 0, -0.13, 0, 0xf2eee6);
    lp.box(0.03, 0.02, 0.03, 0, -0.145, 0, dark(coat, 0.45));
    const leg = new THREE.Mesh(lp.build(false).body, mats.body);
    leg.position.set(x, 0.14, z);
    leg.userData.ph = ph;
    leg.castShadow = true;
    body.add(leg);
    legs.push(leg);
  }
  const wm = new THREE.Mesh(weapon.build(false).body, mats.body);
  wm.position.set(...hand);
  wm.rotation.order = 'YXZ';
  wm.userData.kind = kind;
  wm.castShadow = true;
  body.add(wm);
  return { root, body, legs, weapon: wm, tank: false };
}

/**
 * Cheval de trait des charrettes : la même bête que les montures (jambes qui marchent), avec son collier d'attelage, sa
 * sellette et sa sous-ventrière ; `v` varie la robe. Tourné vers +z, posé à y = 0
 */
export function makeDraftHorse(v = 0): Rider {
  const coat = COATS[(v % COATS.length + COATS.length) % COATS.length], p = new Parts();
  horse(p, coat);
  p.add(new THREE.TorusGeometry(0.045, 0.014, 5, 10), 0, 0.255, 0.115, LEATHER, 0, false, 0, -0.5);
  p.add(new THREE.TorusGeometry(0.047, 0.006, 4, 10), 0, 0.262, 0.11, GOLD, 0, false, 0, -0.5);
  p.box(0.07, 0.03, 0.05, 0, 0.27, -0.01, LEATHER);
  p.box(0.15, 0.012, 0.03, 0, 0.2, -0.01, LEATHER);
  for (const s of [-1, 1]) p.box(0.008, 0.008, 0.2, s * 0.06, 0.22, -0.06, LEATHER);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar((1 + HUMAN_K) / 2);
  const hull = new THREE.Mesh(p.build(false).body, mats.body);
  hull.castShadow = true;
  body.add(hull);
  const legs: THREE.Object3D[] = [];
  for (const [x, z, ph] of [[0.04, 0.09, 0], [-0.04, 0.09, Math.PI], [0.04, -0.09, Math.PI], [-0.04, -0.09, 0]]) {
    const lp = new Parts();
    lp.cyl(0.013, 0.015, 0.13, 5, 0, -0.13, 0, coat);
    lp.cyl(0.016, 0.0135, 0.03, 5, 0, -0.13, 0, v % 2 ? 0xf2eee6 : dark(coat, 0.8));
    lp.box(0.03, 0.02, 0.03, 0, -0.145, 0, dark(coat, 0.45));
    const leg = new THREE.Mesh(lp.build(false).body, mats.body);
    leg.position.set(x, 0.14, z);
    leg.userData.ph = ph;
    leg.castShadow = true;
    body.add(leg);
    legs.push(leg);
  }
  return { root, body, legs, weapon: new THREE.Object3D(), tank: false };
}

/** Galop (`gait` 0 à l'arrêt … 1 au galop) au rythme de `phase`, et geste de l'arme selon ce que fait le cavalier */
export function rideStep(r: Rider, phase: number, gait: number, mode: RiderMode) {
  if (r.tank) {
    // le char vibre à peine ; ses galets roulent ; le canon se lève en route, pointe à la charge, recule à chaque tir
    const beat = Math.sin(phase * 0.45) * 0.5 + 0.5, recoil = mode === 'fight' && beat > 0.92 ? 0.03 : 0;
    r.body.position.y = Math.abs(Math.sin(phase * 3)) * 0.004 * gait;
    r.body.rotation.x = Math.sin(phase) * 0.012 * gait;
    if (gait > 0) for (const l of r.legs) l.rotation.x = phase * 0.9 + l.userData.ph;
    r.weapon.rotation.x = mode === 'rest' ? -0.12 : mode === 'charge' ? -0.02 : -0.06 - beat * 0.06;
    r.weapon.position.z = 0.055 - recoil;
    return;
  }
  r.body.position.y = Math.abs(Math.sin(phase)) * 0.022 * gait;
  r.body.rotation.x = Math.sin(phase) * 0.04 * gait;
  for (const l of r.legs) l.rotation.x = Math.sin(phase + l.userData.ph) * 0.7 * gait;
  const w = r.weapon, beat = Math.sin(phase * 0.45) * 0.5 + 0.5;
  if (w.userData.kind === 'lance') w.rotation.x = mode === 'rest' ? -1.04 : mode === 'charge' ? -0.06 : -0.2 + beat * 0.25;
  else if (w.userData.kind === 'saber') w.rotation.x = mode === 'rest' ? 0.12 : mode === 'charge' ? 1.25 : 0.3 + beat * 1.3;
  else w.rotation.x = mode === 'rest' ? 0.1 : mode === 'charge' ? 0.35 : 1.42 + (beat > 0.9 ? 0.08 : 0);
}

// ---------- Colonne blindée de l'époque moderne (sous terre) ----------

/** Lampes des blindés et des drones (phares, projecteurs, feux de position) : elles luisent de jour comme de nuit, sous terre */
const LAMP = new THREE.MeshBasicMaterial({ vertexColors: true });
/** Faisceaux des projecteurs : lumière additive, vive à la source, qui s'éteint au bout */
const BEAM = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const LIGHT = 0xf4f8ff;

/** Faisceau d'un projecteur, long de `len`, large de `r` au bout : cône ouvert, sommet à l'origine, tourné vers +z */
function beam(len: number, r: number, tint = 0xdfeaff) {
  const g = new THREE.ConeGeometry(r, len, 14, 4, true).translate(0, -len / 2, 0).rotateX(-Math.PI / 2);
  const pos = g.attributes.position, c = new THREE.Color(tint), col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const k = Math.pow(1 - Math.min(1, Math.max(0, pos.getZ(i) / len)), 1.6); col.set([c.r * k, c.g * k, c.b * k], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, BEAM);
  m.renderOrder = 4;
  return m;
}

/** Les pièces dessinées, accrochées au groupe : la caisse (ombres portées) et ses lampes qui luisent */
function hang(p: Parts, g: THREE.Object3D) {
  const built = p.build(false), m = new THREE.Mesh(built.body, mats.body);
  m.castShadow = true;
  g.add(m);
  if (built.glow) g.add(new THREE.Mesh(built.glow, LAMP));
}

/** Arme d'un blindé, accrochée à sa tourelle en (x, y, z), tournée vers +z */
function mountGun(p: Parts, turret: THREE.Object3D, x: number, y: number, z: number) {
  const wm = new THREE.Mesh(p.build(false).body, mats.body);
  wm.position.set(x, y, z);
  wm.rotation.order = 'YXZ';
  wm.userData.z0 = z;
  wm.castShadow = true;
  turret.add(wm);
  return wm;
}

/** Flamme de bouche (étoile de feu jaune et orange, large de `r`), au bout de l'arme en `z` ; cachée entre deux tirs */
function muzzleFlare(gun: THREE.Object3D, z: number, r: number) {
  const p = new Parts();
  p.add(new THREE.ConeGeometry(r, r * 3.2, 6).rotateX(Math.PI / 2), 0, 0, r * 1.6, 0xffe08a);
  for (const a of [0, Math.PI / 2]) p.add(new THREE.BoxGeometry(r * 2.6, r * 0.5, r * 0.6), 0, 0, r * 0.3, 0xffa040, 0, false, a);
  p.add(new THREE.IcosahedronGeometry(r * 0.9, 0), 0, 0, 0, 0xfff4c0);
  const m = new THREE.Mesh(p.build(false).body, LAMP);
  m.position.z = z;
  m.visible = false;
  gun.add(m);
  return m;
}

/** Roue ou galet (il tourne autour de x quand le blindé roule), moyeu clair pour qu'on le voie tourner */
function wheel(body: THREE.Object3D, legs: THREE.Object3D[], r: number, w: number, x: number, y: number, z: number, ph: number) {
  const wp = new Parts();
  wp.add(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2), 0, 0, 0, dark(TRACK, 1.15));
  wp.box(w * 0.4 + 0.004, r * 1.1, r * 0.4, Math.sign(x) * w * 0.35, -r * 0.55, 0, KHAKI);
  const m = new THREE.Mesh(wp.build(false).body, mats.body);
  m.position.set(x, y, z);
  m.userData.ph = ph;
  body.add(m);
  legs.push(m);
}

/**
 * Char de bataille, plus gros que le char de la charge : larges chenilles et leurs jupes de blindage, caisse à plage avant
 * inclinée, phares et feux arrière ; tourelle à part (elle pivote vers la cible) aux joues biseautées, nuque et panier,
 * tourelleau du chef casqué et sa mitrailleuse, lance-pots fumigènes, rampe de projecteurs au-dessus du long canon à
 * évacuateur et frein de bouche, antennes au fanion du village ; camouflage et écusson bleu et or
 */
function battleTank(v: number): Rider {
  const p = new Parts();
  for (const s of [-1, 1]) {
    p.box(0.085, 0.08, 0.6, s * 0.14, 0, 0, TRACK);
    p.box(0.087, 0.016, 0.56, s * 0.14, 0.08, 0, dark(TRACK, 1.3));
    p.box(0.1, 0.01, 0.62, s * 0.14, 0.1, 0, OLIVE_D);
    p.box(0.014, 0.055, 0.5, s * 0.19, 0.045, 0.02, OLIVE_D);
    for (let k = 0; k < 5; k++) p.box(0.016, 0.05, 0.004, s * 0.191, 0.048, -0.18 + k * 0.1, dark(OLIVE_D, 0.8));
    for (const z of [0.27, -0.27]) p.add(new THREE.CylinderGeometry(0.036, 0.036, 0.086, 8).rotateZ(Math.PI / 2), s * 0.14, 0.045, z, dark(TRACK, 1.5));
  }
  p.box(0.2, 0.07, 0.58, 0, 0.035, 0, OLIVE_D);
  p.box(0.27, 0.05, 0.5, 0, 0.1, -0.02, OLIVE);
  p.add(new THREE.BoxGeometry(0.27, 0.012, 0.12), 0, 0.128, 0.26, OLIVE, 0, false, 0, -0.42);
  for (let k = 0; k < 3; k++) p.box(0.18, 0.004, 0.03, 0, 0.15, -0.16 - k * 0.045, dark(OLIVE_D, 0.75));
  for (const s of [-1, 1]) {
    p.box(0.036, 0.026, 0.01, s * 0.1, 0.098, 0.296, BLACK);
    p.box(0.03, 0.018, 0.01, s * 0.1, 0.102, 0.3, LIGHT, 0, true);
    p.box(0.02, 0.014, 0.01, s * 0.12, 0.1, -0.272, 0xff3a2a, 0, true);
    p.box(0.003, 0.03, 0.03, s * 0.137, 0.11, 0.17, BLUE);
    p.box(0.004, 0.012, 0.012, s * 0.138, 0.119, 0.17, GOLD);
  }
  p.box(0.08, 0.004, 0.1, 0.06, 0.15, 0.08, KHAKI);
  p.box(0.07, 0.004, 0.08, -0.08, 0.15, -0.14, dark(OLIVE_D, 0.85));
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(((1 + HUMAN_K) / 2) * 1.2);
  hang(p, body);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) wheel(body, legs, 0.032, 0.02, s * 0.178, 0.035, -0.21 + k * 0.084, k * 0.7 + v);
  // tourelle, qui pivote d'elle-même vers la cible
  const turret = new THREE.Group();
  turret.position.set(0, 0.15, -0.03);
  body.add(turret);
  const t = new Parts();
  t.box(0.2, 0.065, 0.24, 0, 0, 0, OLIVE);
  for (const s of [-1, 1]) t.add(new THREE.BoxGeometry(0.06, 0.06, 0.09).translate(0, 0.03, 0), s * 0.075, 0.002, 0.13, OLIVE, -s * 0.45);
  t.box(0.17, 0.05, 0.09, 0, 0.005, -0.16, dark(OLIVE, 0.9));
  t.box(0.19, 0.03, 0.05, 0, 0.012, -0.225, 0x4a4a3a);
  t.box(0.18, 0.012, 0.22, 0, 0.065, -0.01, dark(OLIVE, 0.92));
  t.box(0.06, 0.006, 0.07, -0.04, 0.077, -0.06, KHAKI);
  t.cyl(0.032, 0.034, 0.025, 8, 0.045, 0.077, -0.05, OLIVE_D);
  t.box(0.03, 0.028, 0.03, 0.045, 0.1, -0.05, SKIN);
  t.sphere(0.022, 0.045, 0.13, -0.052, OLIVE_D, 1, 0.75);
  t.box(0.006, 0.006, 0.07, 0.07, 0.11, -0.02, BLACK);
  t.cyl(0.026, 0.026, 0.01, 8, -0.05, 0.077, -0.02, OLIVE_D);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) t.add(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6), s * 0.1, 0.05, 0.03 + k * 0.018, OLIVE_D, 0, false, s * 0.6);
  t.box(0.15, 0.022, 0.02, 0, 0.068, 0.1, BLACK);
  for (const x of [-0.05, 0, 0.05]) t.box(0.036, 0.016, 0.006, x, 0.071, 0.111, LIGHT, 0, true);
  t.box(0.03, 0.024, 0.026, 0.045, 0.13, -0.01, BLACK);
  t.box(0.022, 0.016, 0.005, 0.045, 0.134, 0.004, LIGHT, 0, true);
  for (const [x, h] of [[-0.07, 0.24], [0.07, 0.18]]) t.box(0.004, h, 0.004, x, 0.077, -0.18, BLACK);
  t.box(0.003, 0.03, 0.05, -0.07, 0.29, -0.205, BLUE);
  t.box(0.0035, 0.01, 0.05, -0.07, 0.29, -0.205, GOLD);
  hang(t, turret);
  const g = new Parts();
  g.box(0.07, 0.05, 0.04, 0, -0.025, 0, OLIVE_D);
  g.add(new THREE.CylinderGeometry(0.011, 0.014, 0.4, 8).rotateX(Math.PI / 2), 0, 0, 0.22, OLIVE);
  g.add(new THREE.CylinderGeometry(0.019, 0.019, 0.07, 8).rotateX(Math.PI / 2), 0, 0, 0.2, OLIVE_D);
  g.box(0.03, 0.026, 0.04, 0, -0.013, 0.43, OLIVE_D);
  const gun = mountGun(g, turret, 0, 0.035, 0.12);
  const flare = muzzleFlare(gun, 0.46, 0.03);
  const b = beam(1.7, 0.45);
  b.position.set(0, 0.079, 0.115);
  b.rotation.x = 0.1;
  turret.add(b);
  return { root, body, legs, weapon: gun, tank: true, turret, muzzle: new THREE.Vector3(0, 0.035, 0.58), beams: [b], gun: 'cannon', flare };
}

/**
 * Transport de troupes à huit roues : haute caisse à flancs droits, nez incliné, hublots de vision, porte arrière, phares ;
 * petite tourelle au canon-mitrailleur et son projecteur, le tireur dans sa trappe, antenne au fanion ; camouflage, écusson
 */
function troopCarrier(v: number): Rider {
  const p = new Parts();
  p.box(0.22, 0.04, 0.48, 0, 0.02, -0.01, OLIVE_D);
  p.box(0.25, 0.1, 0.52, 0, 0.05, -0.01, OLIVE);
  p.add(new THREE.BoxGeometry(0.25, 0.012, 0.13), 0, 0.12, 0.25, OLIVE, 0, false, 0, -0.55);
  p.box(0.23, 0.03, 0.36, 0, 0.15, -0.07, dark(OLIVE, 0.92));
  p.box(0.2, 0.08, 0.008, 0, 0.055, -0.272, OLIVE_D);
  p.box(0.06, 0.03, 0.004, 0, 0.1, -0.277, 0x2a3a44);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) p.box(0.004, 0.014, 0.03, s * 0.126, 0.125, -0.15 + k * 0.12, 0x2a3a44);
    p.box(0.036, 0.024, 0.01, s * 0.09, 0.098, 0.27, BLACK);
    p.box(0.03, 0.016, 0.01, s * 0.09, 0.102, 0.274, LIGHT, 0, true);
    p.box(0.02, 0.014, 0.01, s * 0.1, 0.11, -0.276, 0xff3a2a, 0, true);
    p.box(0.003, 0.034, 0.034, s * 0.126, 0.08, 0.06, BLUE);
    p.box(0.004, 0.014, 0.014, s * 0.127, 0.09, 0.06, GOLD);
    p.box(0.012, 0.02, 0.44, s * 0.13, 0.085, -0.01, dark(OLIVE_D, 0.9));
  }
  p.box(0.09, 0.004, 0.12, 0.05, 0.165, -0.12, KHAKI);
  p.box(0.07, 0.004, 0.08, -0.06, 0.165, 0.02, dark(OLIVE_D, 0.85));
  p.cyl(0.026, 0.026, 0.012, 8, -0.06, 0.18, -0.18, OLIVE_D);
  p.box(0.028, 0.03, 0.028, -0.06, 0.18, -0.18, SKIN);
  p.sphere(0.02, -0.06, 0.215, -0.18, OLIVE_D, 1, 0.75);
  p.box(0.004, 0.22, 0.004, 0.08, 0.18, -0.2, BLACK);
  p.box(0.003, 0.026, 0.045, 0.08, 0.37, -0.222, BLUE);
  p.box(0.0035, 0.009, 0.045, 0.08, 0.37, -0.222, GOLD);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(((1 + HUMAN_K) / 2) * 1.15);
  hang(p, body);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (const z of [-0.19, -0.07, 0.07, 0.19]) wheel(body, legs, 0.045, 0.036, s * 0.13, 0.045, z, z * 9 + v);
  const turret = new THREE.Group();
  turret.position.set(0, 0.165, 0.05);
  body.add(turret);
  const t = new Parts();
  t.box(0.11, 0.045, 0.12, 0, 0, 0, OLIVE);
  t.box(0.09, 0.01, 0.1, 0, 0.045, 0, dark(OLIVE, 0.9));
  t.box(0.03, 0.022, 0.024, 0.05, 0.03, 0.03, BLACK);
  t.box(0.022, 0.014, 0.005, 0.05, 0.034, 0.043, LIGHT, 0, true);
  hang(t, turret);
  const g = new Parts();
  g.box(0.03, 0.03, 0.03, 0, -0.015, 0, OLIVE_D);
  g.add(new THREE.CylinderGeometry(0.006, 0.007, 0.2, 6).rotateX(Math.PI / 2), 0, 0, 0.11, BLACK);
  const gun = mountGun(g, turret, 0, 0.022, 0.06);
  const flare = muzzleFlare(gun, 0.21, 0.016);
  const b = beam(1.4, 0.34);
  b.position.set(0.05, 0.041, 0.045);
  b.rotation.x = 0.12;
  turret.add(b);
  return { root, body, legs, weapon: gun, tank: true, turret, muzzle: new THREE.Vector3(0, 0.022, 0.27), beams: [b], gun: 'mg', flare };
}

/** Blindé de la colonne moderne : char de bataille (`mbt`) ou transport de troupes (`apc`) ; tourné vers +z, posé à y = 0 */
export function makeArmor(kind: 'mbt' | 'apc', v = 0): Rider {
  return kind === 'mbt' ? battleTank(v) : troopCarrier(v);
}

/**
 * Blindé en marche (`gait` 0 à l'arrêt … 1), au rythme de `phase` : il vibre à peine et ses roues roulent ; `elev` lève (< 0)
 * ou baisse l'arme, `recoil` (0 … 1) la fait reculer juste après le tir, la flamme de bouche encore à son bout
 */
export function armorStep(r: Rider, phase: number, gait: number, elev: number, recoil: number) {
  r.body.position.y = Math.abs(Math.sin(phase * 3)) * 0.004 * gait;
  r.body.rotation.x = Math.sin(phase) * 0.01 * gait;
  if (gait > 0) for (const l of r.legs) l.rotation.x = phase * 0.9 + l.userData.ph;
  r.weapon.rotation.x = elev;
  r.weapon.position.z = r.weapon.userData.z0 - recoil * 0.05;
  if (r.flare) { r.flare.visible = recoil > (r.gun === 'cannon' ? 0.72 : 0.3); r.flare.rotation.z = phase * 7; }
}

/** Drone d'escorte : son corps (qui tangue), ses quatre hélices, ses feux de position (le dernier clignote) et le faisceau de son projecteur */
export interface Drone { root: THREE.Group; body: THREE.Group; rotors: THREE.Object3D[]; blink: THREE.Object3D[]; beam: THREE.Object3D }

/**
 * Drone quadrirotor : corps gris et dôme bleu, bras en croix et moteurs, hélices qui tournent, nacelle de caméra et projecteur
 * sous le ventre (son faisceau descend devant lui), feux rouge et vert, flash blanc à l'arrière. Centré sur son corps
 */
export function makeDrone(): Drone {
  const p = new Parts();
  p.box(0.07, 0.024, 0.1, 0, -0.012, 0, 0x3c4048);
  p.sphere(0.03, 0, 0.012, 0.01, 0x2c4a7a, 1, 0.6);
  p.box(0.072, 0.006, 0.02, 0, 0.004, -0.035, GOLD);
  for (const a of [Math.PI / 4, -Math.PI / 4]) p.add(new THREE.BoxGeometry(0.012, 0.008, 0.22), 0, 0, 0, 0x2a2a2e, a);
  const arms: [number, number][] = [[0.078, 0.078], [-0.078, 0.078], [0.078, -0.078], [-0.078, -0.078]];
  for (const [x, z] of arms) p.cyl(0.012, 0.012, 0.014, 6, x, -0.004, z, 0x2a2a2e);
  p.sphere(0.018, 0, -0.03, 0.035, BLACK);
  p.box(0.03, 0.012, 0.03, 0, -0.042, -0.012, BLACK);
  p.box(0.022, 0.004, 0.022, 0, -0.046, -0.012, LIGHT, 0, true);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(1.6);
  hang(p, body);
  const rotors: THREE.Object3D[] = [];
  for (const [x, z] of arms) {
    const rp = new Parts();
    rp.box(0.075, 0.003, 0.012, 0, 0, 0, 0x2a2a2e);
    rp.cyl(0.04, 0.04, 0.001, 12, 0, 0.002, 0, 0x8a8f96);
    const r = new THREE.Mesh(rp.build(false).body, mats.body);
    r.position.set(x, 0.012, z);
    body.add(r);
    rotors.push(r);
  }
  const blink: THREE.Object3D[] = [];
  for (const [x, z, c] of [[-0.1, 0.1, 0xff3a2a], [0.1, 0.1, 0x3aff6a], [0, -0.052, 0xffffff]] as number[][]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: c }));
    l.position.set(x, -0.006, z);
    body.add(l);
    blink.push(l);
  }
  const b = beam(1.1, 0.32);
  b.position.set(0, -0.046, -0.012);
  b.rotation.x = Math.PI / 2 - 0.3;
  body.add(b);
  return { root, body, rotors, blink, beam: b };
}

/** Le drone en vol stationnaire : hélices qui tournent, léger tangage, feu flash qui clignote */
export function droneStep(d: Drone, t: number, v: number) {
  d.rotors.forEach((r, i) => (r.rotation.y = t * 38 * (i % 2 ? 1 : -1)));
  d.body.position.y = Math.sin(t * 2.1 + v) * 0.015;
  d.body.rotation.z = Math.sin(t * 1.3 + v) * 0.05;
  d.body.rotation.x = Math.sin(t * 0.9 + v * 2) * 0.04;
  d.blink[2].visible = Math.sin(t * 7 + v) > 0.75;
}
