import * as THREE from 'three';
import { wrapAngle } from '../core/rng';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N, SEA } from '../world/world';
import { Building } from '../build/catalog';
import { makeActor, releaseActor, play, hasModel, Actor, HUMAN_K } from './assets';
import { makeFolk, disposeFolk, folkStep, Folk, FOLK_SEAT } from './folk';
import { Parts } from './parts';
import { mats } from './materials';
import { makeDraftHorse, rideStep, Rider } from './riders';
import { carGeos, rowboatGeo, sailboatGeo, Geo } from './roadVehicles';

const MAX_CARTS = 10, MAX_BOATS = 16, MAX_SAILS = 5;
/** Écart à l'axe de la rue des véhicules : la voie de droite, au milieu de la chaussée (les piétons longent le trottoir plus loin) */
const LANE = 0.15;

interface Vehicle {
  path: number[]; i: number; x: number; z: number; heading: number; wait: number;
  /** attelage animé (charrette tirée par un cheval, de l'Antiquité à l'âge industriel) */
  rig?: CartRig | null;
  /** le véhicule qui lui barre la route (il attend qu'il passe), et depuis combien de temps (s) */
  blockedBy?: Vehicle | null; stall?: number;
}
interface CartRig {
  root: THREE.Group; wheels: THREE.Object3D[]; phase: number;
  /** le charretier : un habitant de l'époque, assis sur son siège, rênes en main */
  driver: Folk;
  /** le cheval animé de la faune (robe baie ou blanche) ; à défaut de modèle, le cheval de trait dessiné (`draft`) */
  actor: Actor | null; draft: Rider | null;
  /** tangage et roulis lissés (pentes, rampes des ponts), écart du cheval dans les virages, cap de l'image d'avant */
  pitch: number; roll: number; lean: number; lastHeading: number;
}
/** Charrette, avant = +z : essieu en z = AXLE, sabots avant du cheval en z = HOOF (points d'appui pour suivre la pente) */
const AXLE = -0.16, HOOF = 0.3;
/** Le cheval attelé : longueur du modèle (celle de la faune), centre en z = HORSE_Z, garrot à la hauteur des brancards */
const HORSE_LEN = 0.34, HORSE_Z = 0.25;
/** Écart d'un attelage (charrette et cheval) ou d'une voiture à celui qui le précède sur sa voie : de quoi lui laisser faire demi-tour */
const CART_GAP = 0.82, CAR_GAP = 0.55;
/** Vitesse des attelages (case/s) ; le pas du cheval au naturel couvre WALK_SPEED case/s, son allure suit celle de la charrette */
const CART_SPEED = 0.6, WALK_SPEED = 0.118, WALK_PACE = 0.38;

/**
 * Le charretier assis (repère de la charrette) : le siège en z = SEAT_Z, son plateau à SEAT_Y ; le repose-pieds plus bas,
 * devant ; jambes inclinées de LEGS vers lui, mains aux rênes (bras levés de ARMS). Échelle de l'habitant : DRIVER_SIZE
 */
const SEAT_Z = -0.03, SEAT_Y = 0.28, LEGS = -0.8, ARMS = -0.85, DRIVER_SIZE = 1.15;
/** Échelle du charretier, et ses mains (repère de la charrette) : là où partent les rênes */
const DRIVER_K = HUMAN_K * DRIVER_SIZE;
const HANDS: [number, number, number] = [0.052 * DRIVER_K, SEAT_Y + (0.1 - 0.09 * Math.cos(-ARMS)) * DRIVER_K, SEAT_Z + 0.09 * Math.sin(-ARMS) * DRIVER_K];
/** Le repose-pieds : là où arrivent ses pieds, jambes inclinées de LEGS (longueur de jambe 0,12 avant l'échelle) */
const FOOT_Y = SEAT_Y - 0.12 * Math.cos(LEGS) * DRIVER_K, FOOT_Z = SEAT_Z + 0.12 * Math.sin(-LEGS) * DRIVER_K;

/**
 * Distance à laquelle `o` est devant `v`, sur sa voie (moins de 0,28 case de côté, jusqu'à 1,4 × `len`), sinon l'infini ; un
 * véhicule qui vient en face n'est pas compté (sur l'autre voie, il passe ; sur la même, après un demi-tour, `clash` règle
 * qui passe). Deux véhicules confondus : le premier créé est devant
 */
function gapTo(v: Vehicle, o: Vehicle, len: number) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading), rx = o.x - v.x, rz = o.z - v.z, ahead = rx * fx + rz * fz;
  if (ahead < 0 || ahead > len * 1.4 || Math.abs(rx * fz - rz * fx) > 0.28) return Infinity;
  if (Math.sin(o.heading) * fx + Math.cos(o.heading) * fz < -0.5) return Infinity;
  return ahead;
}

/** Au-delà de ce temps bloqué (s), un véhicule passe quand même (blocage à plusieurs, sans priorité claire) */
const STALL = 4;
/** Emprises au sol (demi-largeur, arrière, avant ; avant = +z) d'un attelage, cheval compris, et d'une voiture */
const CART_BOX: [number, number, number] = [0.11, -0.27, 0.42], CAR_BOX: [number, number, number] = [0.1, -0.22, 0.22];

/** Les quatre coins d'une emprise posée en (x, z), cap `h` */
function footprint(x: number, z: number, h: number, w: number, back: number, front: number): number[][] {
  const fx = Math.sin(h), fz = Math.cos(h);
  return [[-w, back], [w, back], [w, front], [-w, front]].map(([s, a]) => [x + fx * a + fz * s, z + fz * a - fx * s]);
}

/** Deux emprises (rectangles) se touchent-elles ? (axes séparateurs : les côtés de l'une et de l'autre) */
function boxesMeet(a: number[][], b: number[][]) {
  for (const poly of [a, b]) for (let i = 0; i < 2; i++) {
    const ax = poly[i + 1][0] - poly[i][0], az = poly[i + 1][1] - poly[i][1];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of a) { const p = x * ax + z * az; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const [x, z] of b) { const p = x * ax + z * az; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

/** Le charretier assis, jambes vers le repose-pieds, mains aux rênes ; `sway` : léger balancement des bras au pas */
function sitDriver(d: Folk, phase: number, sway: number) {
  folkStep(d, phase, 'sit');
  for (const l of d.legs) l.rotation.x = LEGS;
  for (const a of d.arms) { a.rotation.x = ARMS + Math.sin(phase) * 0.04 * sway; a.rotation.z = 0; }
  d.arms[0].rotation.z = 0.12; d.arms[1].rotation.z = -0.12;
}

/** Courroie ou rêne droite de `a` à `b` */
function strap(p: Parts, a: [number, number, number], b: [number, number, number], w: number, col: number) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.BoxGeometry(w, w, len).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()));
  p.add(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, col);
}

/**
 * Harnais du cheval de la faune (repère du modèle, avant = +z) : collier au cou, sellette sur le dos et sous-ventrière ; chaque
 * pièce suit l'os qui la porte (le cou qui balance au pas, le dos qui roule), pour ne pas rester figée dans la bête qui marche
 */
function harness(a: Actor) {
  const bones = new Map<string, THREE.Object3D>();
  a.root.traverse((o) => { if ((o as THREE.Bone).isBone) bones.set(o.name, o); });
  const neck = bones.get('Neck1'), back = bones.get('Torso2');
  if (!neck || !back) return;
  a.root.updateMatrixWorld(true);
  const leather = 0x4a3426, brass = 0xe8c66a;
  const collar = new Parts();
  collar.add(new THREE.TorusGeometry(0.03, 0.011, 5, 10), 0, 0.172, 0.07, leather, 0, false, 0, -0.45);
  collar.add(new THREE.TorusGeometry(0.032, 0.005, 4, 10), 0, 0.176, 0.073, brass, 0, false, 0, -0.45);
  const pad = new Parts();
  pad.box(0.06, 0.016, 0.04, 0, 0.196, -0.03, leather);
  pad.box(0.092, 0.012, 0.016, 0, 0.19, -0.03, leather);
  for (const s of [-1, 1]) pad.box(0.008, 0.075, 0.016, s * 0.043, 0.12, -0.03, leather);
  for (const [p, bone] of [[collar, neck], [pad, back]] as const) {
    const m = new THREE.Mesh(p.build(false).body, mats.body);
    m.castShadow = true;
    a.root.add(m);
    m.updateMatrixWorld(true);
    bone.attach(m);
  }
}

/**
 * Charrette attelée, avant = +z : plateau à ridelles et son chargement (amphores dans l'Antiquité, foin, sacs ou tonneaux
 * ensuite, bidons de lait à l'âge industriel), banc du charretier, brancards jusqu'aux épaules du cheval, rênes ; roues à
 * rayons, charretier et cheval à part, pour les animer. Le cheval est celui de la faune et des écuries (robe baie ou
 * blanche, il marche au pas) ; sans son modèle, le cheval de trait dessiné
 */
function cartRig(age: number, v: number): CartRig {
  const root = new THREE.Group(), p = new Parts(), wood = 0xa07850, dk = 0x6a4a34, load = v % 3;
  const z0 = -0.14;
  p.box(0.2, 0.03, 0.27, 0, 0.13, z0, wood);
  for (const s of [-1, 1]) { p.box(0.012, 0.05, 0.27, s * 0.1, 0.17, z0, dk); for (const z of [-0.12, 0, 0.12]) p.box(0.016, 0.07, 0.016, s * 0.1, 0.16, z0 + z, dk); }
  p.box(0.2, 0.05, 0.012, 0, 0.17, z0 - 0.135, dk);
  p.box(0.24, 0.016, 0.016, 0, 0.075, z0 - 0.02, dk);
  // chargement
  if (age <= 1) for (const [x, z] of [[-0.05, -0.08], [0.05, -0.08], [-0.05, 0.02], [0.05, 0.02], [0, -0.03]]) { p.cyl(0.028, 0.02, 0.07, 7, x, 0.18, z0 + z, 0xc0704a); p.cyl(0.012, 0.016, 0.02, 6, x, 0.225, z0 + z, 0xa85a3a); }
  else if (load === 0) { p.add(new THREE.IcosahedronGeometry(0.1, 1).scale(1, 0.55, 1.1), 0, 0.2, z0 - 0.05, 0xd8c06a); for (const s of [-1, 1]) p.box(0.03, 0.006, 0.06, s * 0.05, 0.25, z0 - 0.05, 0xe8d488, 0.4); }
  else if (load === 1) for (const [x, z, r] of [[-0.05, -0.08, 0.2], [0.05, -0.07, -0.3], [0, -0.01, 0.1], [0.0, -0.06, 1.6]]) p.add(new THREE.IcosahedronGeometry(0.045, 0).scale(1, 0.75, 1.3), x, r > 1 ? 0.235 : 0.18, z0 + z, 0xd8c8a0, r);
  else if (age === 2) for (const [x, z] of [[-0.05, -0.08], [0.05, -0.08], [0, 0.0]]) { p.cyl(0.034, 0.034, 0.075, 8, x, 0.185, z0 + z, 0x8a5a3a); for (const y of [0.16, 0.21]) p.cyl(0.036, 0.036, 0.008, 8, x, y, z0 + z, 0x4a4a4e); }
  else { for (const [x, z] of [[-0.06, -0.08], [0, -0.08], [0.06, -0.08], [-0.03, 0.02], [0.03, 0.02]]) { p.cyl(0.022, 0.022, 0.07, 8, x, 0.18, z0 + z, 0xc4cad2); p.cyl(0.012, 0.014, 0.02, 6, x, 0.225, z0 + z, 0xa8aeb6); } }
  // le siège du charretier à l'avant de la caisse (coffre, plateau, dossier qui le sépare du chargement), le repose-pieds
  // devant lui sur ses deux montants
  // (plateau et coffre en retrait sous lui : ses cuisses en dépassent, on les voit aussi de face)
  p.box(0.15, SEAT_Y - 0.012 - 0.16, 0.036, 0, 0.16, SEAT_Z - 0.018, dk);
  p.box(0.17, 0.012, 0.046, 0, SEAT_Y - 0.012, SEAT_Z - 0.016, wood);
  p.box(0.17, 0.05, 0.012, 0, SEAT_Y, SEAT_Z - 0.046, dk);
  p.box(0.15, 0.01, 0.05, 0, FOOT_Y - 0.012, FOOT_Z, wood);
  for (const s of [-1, 1]) p.box(0.01, FOOT_Y - 0.012 - 0.13, 0.01, s * 0.065, 0.13, FOOT_Z - 0.015, dk);
  // les brancards, de l'avant du plateau aux épaules du cheval, et leur traverse ; les rênes des mains du charretier au mors
  for (const s of [-1, 1]) {
    strap(p, [s * 0.075, 0.15, z0 + 0.1], [s * 0.056, 0.155, HORSE_Z + 0.065], 0.012, dk);
    strap(p, [s * 0.056, 0.155, HORSE_Z + 0.03], [s * 0.044, 0.19, HORSE_Z - 0.03], 0.006, 0x3a2a20);
    strap(p, [s * HANDS[0], HANDS[1], HANDS[2]], [s * 0.014, 0.232, HORSE_Z + 0.14], 0.004, 0x3a2a20);
  }
  p.box(0.15, 0.012, 0.012, 0, 0.144, z0 + 0.16, dk);
  const cart = new THREE.Mesh(p.build(false).body, mats.body);
  cart.castShadow = true;
  root.add(cart);
  // roues à rayons, qui tournent
  const wheels: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const wp = new Parts();
    wp.add(new THREE.TorusGeometry(0.062, 0.009, 4, 12).rotateY(Math.PI / 2), 0, 0, 0, dk);
    wp.add(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6).rotateZ(Math.PI / 2), 0, 0, 0, 0x4a4a4e);
    for (let k = 0; k < 4; k++) wp.add(new THREE.BoxGeometry(0.006, 0.12, 0.008), 0, 0, 0, wood, 0, false, 0, (k * Math.PI) / 4);
    const wh = new THREE.Mesh(wp.build(false).body, mats.body);
    wh.position.set(s * 0.115, 0.07, z0 - 0.02);
    wh.castShadow = true;
    root.add(wh);
    wheels.push(wh);
  }
  // le charretier : un habitant de l'époque (tenue, coiffe), corps entier, assis sur son siège (hanches sur le plateau)
  const driver = makeFolk({ age, v: v * 7919 + 13, size: DRIVER_SIZE });
  driver.root.position.set(0, SEAT_Y - FOLK_SEAT * DRIVER_K, SEAT_Z);
  sitDriver(driver, 0, 0);
  root.add(driver.root);
  const actor = hasModel('horse') ? makeActor(v % 3 === 2 && hasModel('horse_white') ? 'horse_white' : 'horse', HORSE_LEN) : null;
  let draft: Rider | null = null;
  if (actor) {
    harness(actor);
    actor.mixer.setTime(v * 0.37);
    actor.root.position.z = HORSE_Z;
    root.add(actor.root);
  } else {
    draft = makeDraftHorse(v);
    draft.root.position.z = HORSE_Z + 0.03;
    root.add(draft.root);
  }
  root.rotation.order = 'YXZ';
  return { root, wheels, driver, actor, draft, phase: Math.random() * 6, pitch: 0, roll: 0, lean: 0, lastHeading: NaN };
}
interface Boat {
  home: Building | null; x: number; z: number; tx: number; tz: number; heading: number; wait: number; mx: number; mz: number; seed: number;
  /** le pêcheur assis dans la barque (habitant de l'époque) */
  actor?: Folk | null; actorKey?: string; phase?: number;
}
/** Place du pêcheur dans la barque : assis à l'arrière, tourné vers l'avant (repère de la barque) */
const SEAT = new THREE.Matrix4().makeTranslation(0, 0.02, -0.07);
/** le pêcheur, à la taille des habitants (sa matrice est posée à la main : son échelle avec) */
const FOLK_K = new THREE.Matrix4().makeScale(HUMAN_K * 0.9, HUMAN_K * 0.9, HUMAN_K * 0.9);

/** Cap qui tourne vers `want` (par le plus court), d'au plus la fraction `k` de l'écart */
function turn(heading: number, want: number, k: number, maxRad = Infinity) {
  let da = want - heading;
  da = wrapAngle(da);
  return heading + Math.max(-maxRad, Math.min(maxRad, da * Math.min(1, k)));
}

/** Géométrie colorée (attribut de couleur par sommet) à partir de boîtes et de cylindres */
function colored(parts: [THREE.BufferGeometry, number][]) {
  const out = parts.map(([g, c]) => {
    const n = g.index ? g.toNonIndexed() : g, col = new THREE.Color(c), a = new Float32Array(n.attributes.position.count * 3);
    for (let i = 0; i < n.attributes.position.count; i++) col.toArray(a, i * 3);
    n.setAttribute('color', new THREE.BufferAttribute(a, 3));
    n.deleteAttribute('uv');
    return n;
  });
  return mergeGeometries(out)!;
}

/**
 * Charrette tirée par un cheval, modèle de réserve du maillage de la flotte : sans usine automobile, ce sont les attelages
 * animés de `cartRig` qui roulent ; avant = +z
 */
function vehicleGeo(age: number) {
  const wheel = (x: number, z: number, r: number) => new THREE.CylinderGeometry(r, r, 0.025, 8).rotateZ(Math.PI / 2).translate(x, r, z);
  return colored([
    [new THREE.BoxGeometry(0.14, 0.06, 0.18).translate(0, 0.1, -0.06), 0xb08968],
    [new THREE.BoxGeometry(0.12, 0.05, 0.14).translate(0, 0.15, -0.06), age >= 2 ? 0xd8c06a : 0x9ccf92],
    [wheel(-0.085, -0.06, 0.06), 0x7a6355], [wheel(0.085, -0.06, 0.06), 0x7a6355],
    [new THREE.BoxGeometry(0.012, 0.012, 0.14).translate(-0.04, 0.09, 0.08), 0x7a6355], [new THREE.BoxGeometry(0.012, 0.012, 0.14).translate(0.04, 0.09, 0.08), 0x7a6355],
    // cheval
    [new THREE.BoxGeometry(0.06, 0.07, 0.15).translate(0, 0.11, 0.2), 0x8a5a3a],
    [new THREE.BoxGeometry(0.035, 0.07, 0.05).translate(0, 0.17, 0.28), 0x8a5a3a],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [new THREE.BoxGeometry(0.018, 0.08, 0.018).translate(sx * 0.02, 0.04, 0.2 + sz * 0.05), 0x5a3e2e] as [THREE.BufferGeometry, number]),
  ]);
}

const HULL = 0x2e3440, CHROME = 0xc8d0da, TINTED = 0x1c2836, SKIN = 0xe8b894;

/** Patins de sustentation des véhicules futuristes : carénage sombre de part et d'autre, semelle qui luit dessous */
function pads(p: Parts, w: number, len: number, z = 0) {
  for (const s of [-1, 1]) { p.box(0.03, 0.016, len, s * w, 0.042, z, HULL); p.box(0.026, 0.004, len - 0.02, s * w, 0.038, z, 0x9ff8ff, 0, 'neon'); }
}

/** Phares en bandeau à l'avant (z0), feux arrière rouges (z1), à la hauteur y, écartés de ±x */
function lamps(p: Parts, x: number, y: number, z0: number, z1: number) {
  for (const s of [-1, 1]) { p.box(0.036, 0.01, 0.006, s * x, y, z0, 0xfff1c9, 0, true); p.box(0.03, 0.01, 0.006, s * x, y, z1, 0xff3a2a, 0, true); }
}

/**
 * Voiture volante, avant = +z : coque en goutte, verrière fumée à arête chromée, liseré lumineux à la couleur de la voiture,
 * quatre petites soufflantes carénées aux coins, aileron à deux dérives, deux réacteurs arrière qui luisent, phares en
 * bandeau et feux arrière, antenne, patins
 */
function flyCarGeo(body: number, accent: number): Geo {
  const p = new Parts();
  p.add(new THREE.SphereGeometry(0.1, 12, 8).scale(0.78, 0.42, 1.45), 0, 0.11, 0, body);
  p.add(new THREE.SphereGeometry(0.062, 10, 6).scale(1, 0.72, 1.55), 0, 0.145, -0.01, TINTED);
  p.box(0.006, 0.004, 0.15, 0, 0.186, -0.01, CHROME);
  p.box(0.162, 0.005, 0.2, 0, 0.098, 0, accent, 0, 'neon');
  p.box(0.1, 0.004, 0.006, 0, 0.094, 0.143, accent, 0, 'neon');
  // soufflantes carénées aux quatre coins
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.add(new THREE.TorusGeometry(0.024, 0.006, 4, 12).rotateX(Math.PI / 2), sx * 0.068, 0.088, sz * 0.095, HULL);
    p.box(0.04, 0.003, 0.006, sx * 0.068, 0.086, sz * 0.095, 0x5a6270, Math.PI / 4); p.box(0.04, 0.003, 0.006, sx * 0.068, 0.086, sz * 0.095, 0x5a6270, -Math.PI / 4);
  }
  // aileron, réacteurs
  p.box(0.13, 0.006, 0.03, 0, 0.17, -0.128, body);
  for (const s of [-1, 1]) {
    p.box(0.004, 0.034, 0.04, s * 0.06, 0.136, -0.13, accent);
    p.add(new THREE.CylinderGeometry(0.016, 0.013, 0.03, 8).rotateX(Math.PI / 2), s * 0.035, 0.1, -0.145, 0x5a6270);
    p.add(new THREE.CircleGeometry(0.012, 8).rotateY(Math.PI), s * 0.035, 0.1, -0.161, accent, 0, 'neon');
  }
  lamps(p, 0.042, 0.11, 0.142, -0.142);
  p.cyl(0.0015, 0.0015, 0.05, 4, 0.03, 0.15, -0.1, 0x2a2a2e);
  pads(p, 0.05, 0.2);
  return p.build(false);
}

/**
 * Bus volant, avant = +z : longue caisse blanche à toit arrondi, bandeau de vitres fumées à montants chromés, pare-brise et
 * son pilote, girouette lumineuse, liseré cyan, porte à deux vantaux, nacelles et soufflantes sur le toit, patins
 */
function flyBusGeo(): Geo {
  const p = new Parts(), W = 0xf2f4f6;
  p.box(0.17, 0.03, 0.5, 0, 0.045, 0, HULL);
  p.box(0.168, 0.12, 0.48, 0, 0.07, 0, W);
  p.add(new THREE.CylinderGeometry(0.084, 0.084, 0.48, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.25, 1), 0, 0.19, 0, 0xe4e8ec);
  for (const s of [-1, 1]) {
    p.box(0.004, 0.05, 0.38, s * 0.085, 0.12, -0.03, TINTED);
    for (let k = 0; k < 7; k++) p.box(0.005, 0.05, 0.006, s * 0.0855, 0.12, -0.21 + k * 0.06, CHROME);
    p.box(0.004, 0.006, 0.46, s * 0.085, 0.105, 0, 0x5af0ff, 0, 'neon');
  }
  // la porte (côté trottoir), deux vantaux vitrés
  for (const z of [0.15, 0.19]) p.box(0.005, 0.1, 0.036, 0.0855, 0.075, z, TINTED);
  // avant : pare-brise, pilote, girouette ; arrière : lunette
  p.add(new THREE.BoxGeometry(0.15, 0.09, 0.004), 0, 0.14, 0.24, TINTED, 0, false, 0, -0.25);
  p.box(0.024, 0.024, 0.024, -0.04, 0.15, 0.2, SKIN); p.box(0.04, 0.03, 0.026, -0.04, 0.12, 0.2, 0x2c4a9a);
  p.box(0.11, 0.016, 0.004, 0, 0.198, 0.241, 0xffb040, 0, 'neon');
  p.box(0.13, 0.04, 0.004, 0, 0.13, -0.241, TINTED);
  lamps(p, 0.06, 0.07, 0.242, -0.242);
  // le toit : deux nacelles de batteries, deux soufflantes carénées, antenne
  for (const z of [-0.12, 0.06]) p.box(0.08, 0.02, 0.1, 0, 0.21, z, 0xd8dde2);
  for (const z of [-0.2, 0.17]) { p.add(new THREE.TorusGeometry(0.03, 0.008, 4, 12).rotateX(Math.PI / 2), 0, 0.218, z, HULL); p.box(0.05, 0.003, 0.008, 0, 0.214, z, 0x5a6270); }
  p.cyl(0.0015, 0.0015, 0.06, 4, 0.05, 0.21, -0.2, 0x2a2a2e);
  pads(p, 0.065, 0.42);
  return p.build(false);
}

/**
 * Camion volant, avant = +z : cabine jaune avancée à pare-brise fumé et déflecteur, chauffeur, caisson chromé à nervures et
 * liseré orange lumineux, portes arrière, feux de gabarit, antenne, patins
 */
function flyTruckGeo(): Geo {
  const p = new Parts(), Y = 0xf2c23a;
  p.box(0.16, 0.024, 0.46, 0, 0.045, 0, HULL);
  p.box(0.16, 0.11, 0.11, 0, 0.065, 0.17, Y);
  p.add(new THREE.BoxGeometry(0.15, 0.06, 0.004), 0, 0.15, 0.226, TINTED, 0, false, 0, -0.3);
  for (const s of [-1, 1]) p.box(0.004, 0.04, 0.06, s * 0.0805, 0.13, 0.17, TINTED);
  p.box(0.024, 0.024, 0.024, -0.035, 0.145, 0.18, SKIN); p.box(0.04, 0.03, 0.026, -0.035, 0.115, 0.18, 0xd8382e);
  p.add(new THREE.BoxGeometry(0.15, 0.03, 0.08), 0, 0.19, 0.15, Y, 0, false, 0, 0.3);
  p.box(0.17, 0.15, 0.3, 0, 0.06, -0.075, CHROME);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) p.box(0.005, 0.15, 0.008, s * 0.0855, 0.06, -0.21 + k * 0.054, 0xa8b0ba);
    p.box(0.004, 0.008, 0.29, s * 0.0858, 0.17, -0.075, 0xff8a3a, 0, 'neon');
    for (const z of [-0.22, 0.07]) p.box(0.01, 0.01, 0.01, s * 0.08, 0.21, z, 0xffa040, 0, true);
  }
  p.box(0.004, 0.14, 0.004, 0, 0.065, -0.2265, 0x8a929c);
  lamps(p, 0.055, 0.08, 0.226, -0.228);
  p.cyl(0.0015, 0.0015, 0.06, 4, 0.06, 0.18, 0.13, 0x2a2a2e);
  pads(p, 0.062, 0.4);
  return p.build(false);
}

/**
 * Les modèles du trafic, avec l'usine automobile : à l'âge futuriste, trois voitures volantes, un bus et un camion ; avant,
 * les voitures de l'époque (`carGeos`) ; sans usine, la charrette de réserve (les attelages animés la remplacent)
 */
function fleetGeos(age: number, motor: boolean): Geo[] {
  if (age >= 5 && motor) return [flyCarGeo(0xf2f4f6, 0x5af0ff), flyCarGeo(0x3a4250, 0xff8a3a), flyBusGeo(), flyCarGeo(0xd8382e, 0xfff1c9), flyTruckGeo()];
  if (motor) return carGeos(age);
  return [{ body: vehicleGeo(age), glow: null }];
}

/**
 * Trafic : charrettes (puis voitures) qui parcourent le réseau de routes, barques des pêcheurs autour de leur ponton,
 * voiliers au large à partir du Moyen Âge ; tout le monde rentre la nuit
 */
export class Traffic {
  group = new THREE.Group();
  /** un maillage par modèle de véhicule (et ses lumières), le nombre posé de chacun à cette image */
  private fleets: { body: THREE.InstancedMesh; glow: THREE.InstancedMesh | null }[] = [];
  private fleetN: number[] = [];
  private mat: THREE.MeshStandardMaterial;
  private boatsMesh: THREE.InstancedMesh;
  private sailsMesh: THREE.InstancedMesh;
  private vehicles: Vehicle[] = [];
  private boats: Boat[] = [];
  private sails: Boat[] = [];
  private roads: number[] = [];
  private builtVersion = -1;
  private builtAge = -1;
  private builtPop = -1;
  private dummy = new THREE.Object3D();
  private t = 0;
  private age = 0;

  /** cases à contourner (l'îlot d'un rond-point) */
  avoid = new Set<number>();
  /** l'usine automobile est bâtie : les autos (puis les voitures volantes) remplacent les charrettes ; sans elle, des attelages à tout âge */
  motor = false;
  private builtMotor = false;

  constructor(private world: World) {
    const mat = (this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide }));
    this.setFleet(fleetGeos(1, false));
    this.boatsMesh = new THREE.InstancedMesh(rowboatGeo(), mat, MAX_BOATS);
    this.sailsMesh = new THREE.InstancedMesh(sailboatGeo(), mat, MAX_SAILS);
    for (const m of [this.boatsMesh, this.sailsMesh]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; }
    this.group.add(this.boatsMesh, this.sailsMesh);
  }

  /** Remplace les modèles du trafic (un maillage par modèle, et ses lumières) */
  private setFleet(geos: Geo[]) {
    for (const f of this.fleets) for (const m of [f.body, f.glow]) if (m) { this.group.remove(m); m.geometry.dispose(); m.dispose(); }
    this.fleets = geos.map((g) => {
      const body = new THREE.InstancedMesh(g.body, this.mat, MAX_CARTS), glow = g.glow ? new THREE.InstancedMesh(g.glow, mats.glow, MAX_CARTS) : null;
      for (const m of [body, glow]) if (m) { m.count = 0; m.frustumCulled = false; m.castShadow = m === body; this.group.add(m); }
      return { body, glow };
    });
    this.fleetN = this.fleets.map(() => 0);
  }

  update(dt: number, hour: number, age: number, pop: number) {
    const w = this.world;
    this.t += dt;
    // recensement quand le monde, l'âge ou la taille du village (par dizaines d'habitants) changent
    if (w.version !== this.builtVersion || age !== this.builtAge || this.motor !== this.builtMotor || Math.floor(pop / 10) !== this.builtPop) { this.builtPop = Math.floor(pop / 10); this.refresh(age, pop); }
    const day = hour > 6 && hour < 21;
    this.moveCarts(dt, day);
    this.moveBoats(dt, day);
    this.moveSails(dt);
  }

  /** Recensement : routes, pontons et large ; nombre de véhicules selon la population et l'âge */
  private refresh(age: number, pop: number) {
    const w = this.world;
    if (age !== this.builtAge || this.motor !== this.builtMotor) {
      this.builtMotor = this.motor;
      this.setFleet(fleetGeos(age, this.motor));
      // les attelages changent d'époque (ou laissent place aux voitures)
      for (const v of this.vehicles) this.dropRig(v);
    }
    this.builtVersion = w.version; this.builtAge = age; this.age = age;
    this.roads = [];
    for (let k = 0; k < N * N; k++) if (w.road[k]) this.roads.push(k);
    // sans écurie, pas de chevaux : pas d'attelages (les autos viennent avec l'usine automobile)
    const stabled = this.motor || [...w.buildings.values()].some((b) => b.kind === 'stable');
    const nCarts = age >= 1 && pop >= 8 && stabled ? Math.min(MAX_CARTS, Math.floor(this.roads.length / 18)) : 0;
    for (const v of this.vehicles.slice(nCarts)) this.dropRig(v);
    this.vehicles.length = Math.min(this.vehicles.length, nCarts);
    for (const v of this.vehicles) if (v.path.some((c) => !w.road[c])) { v.path = []; v.i = 0; }
    while (this.vehicles.length < nCarts) {
      const c = this.roads[Math.floor(Math.random() * this.roads.length)];
      this.vehicles.push({ path: [], i: 0, x: (c % N) + 0.5, z: Math.floor(c / N) + 0.5, heading: 0, wait: Math.random() * 3 });
    }
    // une barque par ponton qui donne sur la mer ou une rivière
    const piers = [...w.buildings.values()].filter((b) => b.kind === 'pier');
    for (const bt of this.boats) if (!bt.home || !w.buildings.has(bt.home.id)) this.dropFisher(bt);
    this.boats = this.boats.filter((bt) => bt.home && w.buildings.has(bt.home.id));
    for (const p of piers.slice(0, MAX_BOATS)) {
      if (this.boats.some((bt) => bt.home!.id === p.id)) continue;
      // amarrage le long du ponton, côté eau, là où elle est assez profonde
      const f = [[0, 1], [1, 0], [0, -1], [-1, 0]][p.rot];
      let mx = 0, mz = 0, ok = false;
      for (const along of [1.05, 1.4, 1.8]) for (const side of [0.3, -0.3]) {
        if (ok) break;
        mx = p.x + 0.5 + f[0] * along - f[1] * side; mz = p.z + 0.5 + f[1] * along + f[0] * side;
        ok = w.seaAt(mx, mz, SEA - 0.08);
      }
      if (!ok) continue;
      this.boats.push({ home: p, x: mx, z: mz, tx: mx, tz: mz, heading: Math.atan2(f[0], f[1]), wait: 2 + Math.random() * 4, mx, mz, seed: Math.random() * 10 });
    }
    // voiliers au large à partir du Moyen Âge, deux par port ou chantier naval : sans port, pas de voile
    const ports = [...w.buildings.values()].filter((b) => b.kind === 'harbor' || b.kind === 'shipyard').length;
    const nSails = age >= 2 ? Math.min(MAX_SAILS, ports * 2) : 0;
    this.sails = this.sails.filter((s) => w.seaAt(s.x, s.z, -0.6)).slice(0, nSails);
    for (let tries = 0; this.sails.length < nSails && tries < 200; tries++) {
      const x = 2 + Math.random() * (N - 4), z = 2 + Math.random() * (N - 4);
      if (w.seaAt(x, z, -1.2)) this.sails.push({ home: null, x, z, tx: x, tz: z, heading: Math.random() * 6.28, wait: 0, mx: x, mz: z, seed: Math.random() * 10 });
    }
  }

  /** Les charrettes vont d'un bout à l'autre du réseau, en tenant leur droite ; elles s'arrêtent la nuit */
  private moveCarts(dt: number, day: boolean) {
    this.fleetN.fill(0);
    for (const v of this.vehicles) {
      if (!day) { if (v.rig) v.rig.root.visible = false; continue; }
      if (v.i >= v.path.length) {
        v.wait -= dt;
        if (v.wait > 0) { this.place(v, dt, 0); continue; }
        const start = Math.floor(v.z) * N + Math.floor(v.x), goal = this.roads[Math.floor(Math.random() * this.roads.length)];
        // (un trajet d'une seule case n'en est pas un : sa cible, décalée selon la position du véhicule, le ferait tourner en rond)
        const path = this.roadPath(start, goal) ?? [];
        v.path = path.length > 1 ? path : [];
        v.i = 0; v.wait = 2 + Math.random() * 6;
      }
      const c = v.path[v.i];
      if (c === undefined) { this.place(v, dt, 0); continue; }
      const [cx, cz] = this.world.passPoint(v.path, v.i);
      // tenir sa droite : décalage perpendiculaire au sens de la rue (du point d'avant à celui-ci), pour ne pas tourner en rond
      const [px, pz] = v.i > 0 ? this.world.passPoint(v.path, v.i - 1) : v.path.length > 1 ? (([nx, nz]) => [cx * 2 - nx, cz * 2 - nz])(this.world.passPoint(v.path, 1)) : [v.x, v.z];
      const sl = Math.hypot(cx - px, cz - pz) || 1, hx = (cx - px) / sl, hz = (cz - pz) / sl, tx = cx - hz * LANE, tz = cz + hx * LANE;
      const dx = tx - v.x, dz = tz - v.z, dist = Math.hypot(dx, dz), step = dt * (this.horses ? CART_SPEED : this.builtAge >= 4 ? 1.6 : 1.2) * this.room(v);
      // le véhicule avance selon son cap, jamais de côté ni à reculons : il tourne vers sa cible (virage borné) et ralentit
      // d'autant plus qu'elle est loin de son axe ; un demi-tour se fait donc au pas, en tournant presque sur place
      const h0 = v.heading, x0 = v.x, z0 = v.z;
      if (dist > 0.04) v.heading = turn(v.heading, Math.atan2(dx, dz), dt * 6, dt * 3.5);
      const off = Math.abs(wrapAngle(Math.atan2(dx, dz) - v.heading)), ahead = Math.cos(Math.min(off, 1.45));
      const mv = Math.min(dist, step * (off < 0.25 ? 1 : Math.max(0.12, ahead)));
      v.x += Math.sin(v.heading) * mv; v.z += Math.cos(v.heading) * mv;
      // pas de pas (ni de virage sur place) qui mettrait le véhicule dans un autre : il attend
      // bloqué plus de STALL s derrière un véhicule lui-même en route : il passe (le compteur court tant que dure le contact,
      // sinon il se rebloquerait à l'image suivante)
      const by = this.clash(v, x0, z0, h0), pass = !!by && (v.stall ?? 0) > STALL && by.i < by.path.length;
      v.stall = by ? (v.stall ?? 0) + dt : 0; v.blockedBy = pass ? null : by;
      if (by && !pass) { v.x = x0; v.z = z0; v.heading = h0; this.place(v, dt, 0); continue; }
      // cible atteinte (ou dépassée de près) : la suivante prend le relais, sans saut de position
      if (dist - mv * ahead < Math.max(0.05, step)) v.i++;
      this.place(v, dt, mv);
    }
    this.fleets.forEach((f, k) => { for (const m of [f.body, f.glow]) if (m) { m.count = this.horses ? 0 : this.fleetN[k]; m.instanceMatrix.needsUpdate = true; } });
  }

  /**
   * Le pas que vient de faire `v` (depuis x0, z0, h0) le met-il dans l'emprise d'un autre véhicule ? Un recouvrement déjà là
   * n'empêche pas de s'en dégager (s'éloigner reste permis). Deux véhicules bloqués l'un par l'autre (face à face sur une voie
   * après un demi-tour, carrefour) : le premier de la liste passe quand même, l'autre attend ; et qui attend depuis plus de
   * STALL secondes derrière un véhicule lui-même en route passe aussi (blocage à plusieurs) : rien ne reste figé ; derrière
   * un véhicule à l'arrêt (halte au bout de son trajet), on attend qu'il reparte. Renvoie le véhicule qui gêne, sinon null
   */
  private clash(v: Vehicle, x0: number, z0: number, h0: number): Vehicle | null {
    const [w, b, f] = this.horses ? CART_BOX : CAR_BOX;
    const mine = footprint(v.x, v.z, v.heading, w, b, f), before = footprint(x0, z0, h0, w, b, f), vi = this.vehicles.indexOf(v);
    for (const o of this.vehicles) {
      if (o === v) continue;
      const theirs = footprint(o.x, o.z, o.heading, w, b, f);
      if (!boxesMeet(mine, theirs)) continue;
      if (boxesMeet(before, theirs) && Math.hypot(v.x - o.x, v.z - o.z) >= Math.hypot(x0 - o.x, z0 - o.z)) continue;
      // l'autre attend-il lui-même que ce véhicule passe ?
      if (o.blockedBy === v && this.vehicles.indexOf(o) > vi) continue;
      return o;
    }
    return null;
  }

  /**
   * Place devant soi (1 : la voie est libre, 0 : on attend) : un véhicule juste devant, sur sa voie ou qui s'y engage à un
   * carrefour, fait ralentir puis s'arrêter derrière lui (sinon deux attelages se traversaient, charretiers confondus). Celui
   * qui vient en face, sur l'autre voie, ne compte pas ; deux véhicules qui se barrent la route l'un à l'autre
   * (carrefour) : le premier de la liste passe. Le contact lui-même est empêché par `clash`
   */
  private room(v: Vehicle) {
    const len = this.horses ? CART_GAP : CAR_GAP;
    let k = 1;
    for (const o of this.vehicles) {
      if (o === v) continue;
      const d = gapTo(v, o, len);
      if (d === Infinity) continue;
      if (gapTo(o, v, len) !== Infinity && this.vehicles.indexOf(o) > this.vehicles.indexOf(v)) continue;
      k = Math.min(k, Math.max(0, (d - len) / (len * 0.4)));
    }
    return k;
  }

  /** Des charrettes attelées tant que l'usine automobile n'est pas bâtie, quel que soit l'âge */
  private get horses() { return !this.builtMotor; }

  /** Retire l'attelage d'une charrette (changement d'époque, charrette de trop) */
  private dropRig(v: Vehicle) {
    if (!v.rig) return;
    this.group.remove(v.rig.root);
    // le cheval animé partage la géométrie de son modèle : on ne libère que ce qui lui est propre (son harnais) et la charrette
    v.rig.actor?.root.traverse((o) => { if (o instanceof THREE.Mesh && !(o instanceof THREE.SkinnedMesh)) o.geometry.dispose(); });
    if (v.rig.actor) releaseActor(v.rig.actor);
    if (v.rig.actor) v.rig.root.remove(v.rig.actor.root);
    v.rig.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    v.rig = null;
  }

  /**
   * Pose la charrette (ou la voiture) : sans usine automobile, l'attelage animé — posé sur ses roues et les sabots du cheval,
   * il suit la pente (côtes, rampes des ponts) ; le cheval marche au pas, à l'allure de la charrette, et devance un peu les
   * virages ; les roues tournent de la distance parcourue ; le charretier, assis sur son banc, se balance à peine ; à
   * l'arrêt, le cheval attend
   */
  private place(v: Vehicle, dt = 0, moved = 0) {
    if (this.horses) {
      // un attelage dessiné faute de modèle à sa création prend le cheval animé dès que le modèle est là
      if (v.rig?.draft && hasModel('horse')) this.dropRig(v);
      if (!v.rig) { v.rig = cartRig(this.builtAge, this.vehicles.indexOf(v)); this.group.add(v.rig.root); }
      const r = v.rig, w = this.world, s = Math.sin(v.heading), c = Math.cos(v.heading);
      // appuis : l'essieu (et ses deux roues) derrière, les sabots avant du cheval devant
      const hr = w.surfaceAt(v.x + s * AXLE, v.z + c * AXLE), hf = w.surfaceAt(v.x + s * HOOF, v.z + c * HOOF);
      const hl = w.surfaceAt(v.x + s * AXLE - c * 0.115, v.z + c * AXLE + s * 0.115), hd = w.surfaceAt(v.x + s * AXLE + c * 0.115, v.z + c * AXLE - s * 0.115);
      const pitch = Math.max(-0.5, Math.min(0.5, Math.atan2(hf - hr, HOOF - AXLE))), roll = Math.max(-0.3, Math.min(0.3, Math.atan2(hd - hl, 0.23)));
      // tangage et roulis lissés (un pas de relief ne fait pas sauter la charrette) ; la hauteur suit l'essieu, sans retard
      const k = Number.isNaN(r.lastHeading) ? 1 : 1 - Math.exp(-dt * 12);
      r.pitch += (pitch - r.pitch) * k; r.roll += (roll - r.roll) * k;
      r.root.visible = true;
      r.root.position.set(v.x, Math.max(hr, hl, hd) - Math.tan(r.pitch) * AXLE + 0.005, v.z);
      r.root.rotation.set(-r.pitch, v.heading, r.roll);
      // vitesse de rotation (pour le pas du cheval quand il tourne presque sur place, et pour qu'il devance le virage)
      const yaw = Number.isNaN(r.lastHeading) || dt <= 0 ? 0 : wrapAngle(v.heading - r.lastHeading) / dt;
      r.lastHeading = v.heading;
      const speed = dt > 0 ? moved / dt : 0, pace = Math.max(speed, Math.abs(yaw) * 0.1);
      r.lean += (Math.max(-0.3, Math.min(0.3, yaw * 0.12)) - r.lean) * (1 - Math.exp(-dt * 6));
      r.phase += dt * (pace > 0.01 ? 9 : 2);
      if (r.actor) {
        const a = r.actor;
        a.root.rotation.y = r.lean;
        if (pace > 0.01) { play(a, ['Walk', 'Idle'], 0.25); a.mixer.timeScale = Math.max(0.6, (pace / WALK_SPEED) * WALK_PACE); }
        // attelé, il ne broute pas (les rênes resteraient en l'air) : il attend tête haute
        else { play(a, ['Idle'], 0.5); a.mixer.timeScale = 1; }
        a.mixer.update(dt);
      } else if (r.draft) {
        const gait = pace > 0.01 ? 0.55 : 0;
        r.draft.root.rotation.y = r.lean;
        rideStep(r.draft, r.phase, gait, 'rest');
        if (!gait) r.draft.body.rotation.x = Math.sin(r.phase * 0.7) * 0.03;
      }
      for (const wh of r.wheels) wh.rotation.x += moved / 0.062;
      // le charretier reste assis sur son banc : un léger cahot au pas, il se penche un peu dans les virages
      const going = speed > 0.01 ? 1 : 0;
      sitDriver(r.driver, r.phase, going);
      r.driver.body.position.y += Math.abs(Math.sin(r.phase)) * 0.006 * going;
      r.driver.body.rotation.z = Math.sin(r.phase * 0.5) * 0.02 * (going || 0.3) - r.lean * 0.15;
      return;
    }
    const d = this.dummy;
    // chaque véhicule a son modèle (voiture, bus, camion à l'âge futuriste), et à l'âge futuriste il flotte en ondulant à peine
    const vi = this.vehicles.indexOf(v), f = this.fleets[vi % this.fleets.length], i = this.fleetN[vi % this.fleets.length]++;
    const hover = this.builtAge >= 5 ? 0.012 + Math.sin(this.t * 2.4 + vi * 1.7) * 0.006 : 0;
    d.position.set(v.x, this.world.surfaceAt(v.x, v.z) + 0.01 + hover, v.z);
    d.rotation.set(0, v.heading, 0);
    d.scale.setScalar(1);
    d.updateMatrix();
    f.body.setMatrixAt(i, d.matrix);
    f.glow?.setMatrixAt(i, d.matrix);
  }

  /** Plus court chemin sur les seules routes (largeur d'abord) */
  private roadPath(start: number, goal: number, strict = true): number[] | null {
    const w = this.world;
    if (!w.road[start] || start === goal) return null;
    const prev = new Map<number, number>([[start, -1]]), q = [start];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === goal) {
        const out: number[] = [];
        for (let x = c; x !== start; x = prev.get(x)!) out.push(x);
        return out.reverse();
      }
      const x = c % N, z = Math.floor(c / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N || !w.road[k] || prev.has(k) || (strict && this.avoid.has(k) && k !== goal)) continue;
        prev.set(k, c); q.push(k);
      }
    }
    // l'îlot d'un rond-point se contourne ; s'il n'y a pas d'autre passage, on le traverse
    return strict ? this.roadPath(start, goal, false) : null;
  }

  /** Barques : le pêcheur rame vers un coin d'eau voisin, y reste à pêcher, recommence ; il rentre au ponton la nuit */
  private moveBoats(dt: number, day: boolean) {
    const d = this.dummy;
    let n = 0;
    for (const b of this.boats) {
      if (!day) { b.tx = b.mx; b.tz = b.mz; }
      const dx = b.tx - b.x, dz = b.tz - b.z, dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const step = Math.min(dist, dt * 0.45);
        b.x += (dx / dist) * step; b.z += (dz / dist) * step;
        b.heading = turn(b.heading, Math.atan2(dx, dz), dt * 2);
      } else if (day && (b.wait -= dt) <= 0) {
        b.wait = 5 + Math.random() * 8;
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 5, x = b.mx + Math.cos(a) * r, z = b.mz + Math.sin(a) * r;
          if (this.openWater(b.x, b.z, x, z, -0.3)) { b.tx = x; b.tz = z; break; }
        }
      }
      d.position.set(b.x, SEA + 0.02 + Math.sin(this.t * 1.6 + b.seed) * 0.012, b.z);
      d.rotation.set(Math.sin(this.t * 1.3 + b.seed) * 0.05, b.heading, Math.sin(this.t * 1.1 + b.seed) * 0.06);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.boatsMesh.setMatrixAt(n++, d.matrix);
      // la nuit, revenu au ponton, le pêcheur rentre chez lui
      this.fisher(b, d.matrix, dt, day || dist > 0.05);
    }
    this.boatsMesh.count = n;
    this.boatsMesh.instanceMatrix.needsUpdate = true;
  }

  /** Pêcheur assis dans la barque : un pêcheur de l'époque (suroît ciré, chapeau de paille), qui suit la barque et son roulis */
  private fisher(b: Boat, m: THREE.Matrix4, dt: number, visible: boolean) {
    const key = `${Math.min(this.age, 4)}`;
    if (b.actorKey !== key) {
      this.dropFisher(b);
      b.actorKey = key;
      b.actor = makeFolk({ age: this.age, v: Math.floor(b.seed * 9973), role: 'fisher', size: 0.9 });
      b.actor.root.matrixAutoUpdate = false;
      this.group.add(b.actor.root);
    }
    const a = b.actor;
    if (!a) return;
    a.root.visible = visible;
    if (!visible) return;
    a.root.matrix.copy(m).multiply(SEAT).multiply(FOLK_K);
    a.root.matrixWorldNeedsUpdate = true;
    b.phase = (b.phase ?? 0) + dt;
    folkStep(a, b.phase * 1.6, 'sit');
  }

  private dropFisher(b: Boat) {
    if (b.actor) { this.group.remove(b.actor.root); disposeFolk(b.actor); }
    b.actor = null; b.actorKey = '';
  }

  /** Voiliers : longues bordées d'un point du large à l'autre */
  private moveSails(dt: number) {
    const d = this.dummy;
    let n = 0;
    for (const s of this.sails) {
      const dx = s.tx - s.x, dz = s.tz - s.z, dist = Math.hypot(dx, dz);
      if (dist < 0.3) {
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 25, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
          if (x > 2 && z > 2 && x < N - 2 && z < N - 2 && this.openWater(s.x, s.z, x, z, -1)) { s.tx = x; s.tz = z; break; }
        }
      } else {
        s.x += (dx / dist) * dt * 0.7; s.z += (dz / dist) * dt * 0.7;
        s.heading = turn(s.heading, Math.atan2(dx, dz), dt * 0.8);
      }
      d.position.set(s.x, SEA + 0.03 + Math.sin(this.t * 1.2 + s.seed) * 0.02, s.z);
      d.rotation.set(Math.sin(this.t + s.seed) * 0.04, s.heading, 0.12 + Math.sin(this.t * 0.8 + s.seed) * 0.05);
      d.scale.setScalar(1.3);
      d.updateMatrix();
      this.sailsMesh.setMatrixAt(n++, d.matrix);
    }
    this.sailsMesh.count = n;
    this.sailsMesh.instanceMatrix.needsUpdate = true;
  }

  /** Ligne droite entièrement sur l'eau, plus profonde que `depth` (pas de lac : leur eau est plus haute ; pas de faille) */
  private openWater(x0: number, z0: number, x1: number, z1: number, depth: number) {
    const w = this.world, n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4);
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      if (x < 0.5 || z < 0.5 || x > N - 0.5 || z > N - 0.5 || !w.seaAt(x, z, depth)) return false;
    }
    return true;
  }
}
