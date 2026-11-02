import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import { HUMAN_K } from './assets';

/**
 * Cavaliers de la charge de cavalerie, dans le style des chevaliers qui joutent dans les jardins : cheval low-poly aux jambes
 * qui galopent, cavalier de l'époque aux couleurs du village (bleu et or) — chevalier caparaçonné à la lance au Moyen Âge,
 * cuirassier au casque à crinière et au sabre à l'âge industriel, garde à cheval en gilet fluo et lampe frontale ensuite
 */

export interface Rider {
  root: THREE.Group;
  /** cheval et cavalier, bercés par le galop ; les jambes et l'arme y sont accrochées */
  body: THREE.Group;
  legs: THREE.Object3D[];
  weapon: THREE.Object3D;
}

/** Ce que fait le cavalier : en route (arme haute), à la charge (lance couchée, sabre en avant), au combat */
export type RiderMode = 'rest' | 'charge' | 'fight';

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const STEEL = 0xc4cad2, BLUE = 0x3a6ab8, GOLD = 0xe8c66a, SKIN = 0xe8b894, LEATHER = 0x4a3426, BLACK = 0x1e1e22;
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

/** Lance rayée bleu et or, garde en cône ; tenue de la main droite, couchée vers +z */
function lance() {
  const p = new Parts();
  for (let k = 0; k < 5; k++) p.add(new THREE.CylinderGeometry(0.0075 - k * 0.0008, 0.0085 - k * 0.0008, 0.12, 5).rotateX(Math.PI / 2), 0, 0, k * 0.12, k % 2 ? GOLD : BLUE);
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

/**
 * Cavalier de l'époque (âge 2 à 4 ; plus tôt, le chevalier) ; `v` varie la robe du cheval. Tourné vers +z, posé à y = 0,
 * à l'échelle des habitants
 */
export function makeRider(age: number, v = 0): Rider {
  const era = Math.min(4, Math.max(2, age)), coat = COATS[(v % COATS.length + COATS.length) % COATS.length];
  const p = new Parts();
  horse(p, coat);
  let weapon: Parts, kind: 'lance' | 'saber' | 'rifle', hand: [number, number, number];
  if (era === 2) {
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
  return { root, body, legs, weapon: wm };
}

/** Galop (`gait` 0 à l'arrêt … 1 au galop) au rythme de `phase`, et geste de l'arme selon ce que fait le cavalier */
export function rideStep(r: Rider, phase: number, gait: number, mode: RiderMode) {
  r.body.position.y = Math.abs(Math.sin(phase)) * 0.022 * gait;
  r.body.rotation.x = Math.sin(phase) * 0.04 * gait;
  for (const l of r.legs) l.rotation.x = Math.sin(phase + l.userData.ph) * 0.7 * gait;
  const w = r.weapon, beat = Math.sin(phase * 0.45) * 0.5 + 0.5;
  if (w.userData.kind === 'lance') w.rotation.x = mode === 'rest' ? -1.04 : mode === 'charge' ? -0.06 : -0.2 + beat * 0.25;
  else if (w.userData.kind === 'saber') w.rotation.x = mode === 'rest' ? 0.12 : mode === 'charge' ? 1.25 : 0.3 + beat * 1.3;
  else w.rotation.x = mode === 'rest' ? 0.1 : mode === 'charge' ? 0.35 : 1.42 + (beat > 0.9 ? 0.08 : 0);
}
