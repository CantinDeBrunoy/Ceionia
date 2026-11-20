import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import { HUMAN_K } from './assets';
import type { HoverParts } from './futureTroops';

/**
 * Cavaliers de la charge de cavalerie, dans le style des chevaliers qui joutent dans les jardins : cheval low-poly aux jambes
 * qui galopent (corps en trois volumes, tête au chanfrein et au bout du nez, crinière en mèches, genoux, jarrets, boulets et
 * sabots), harnaché (bride, mors et rênes, bricole, selle à pommeau et troussequin, étriers) ; cavalier de l'époque aux
 * couleurs du village (bleu et or) — cavalier romain au casque à crête dans l'Antiquité, chevalier caparaçonné à la lance au
 * Moyen Âge, cuirassier au casque à crinière et au sabre à l'âge industriel ; à l'époque moderne, plus de chevaux : un char
 * d'assaut, chenilles, tourelle et canon, fanion du village
 */

export interface Rider {
  root: THREE.Group;
  /** cheval et cavalier (ou caisse du char), bercés par le galop ; les jambes (les galets) et l'arme (le canon) y sont accrochées */
  body: THREE.Group;
  legs: THREE.Object3D[];
  weapon: THREE.Object3D;
  tank: boolean;
  /** char antigrav de l'âge futuriste (voir `futureTroops.ts`) : coussin d'énergie, bouclier, flammes de plasma */
  hover?: HoverParts;
}

/** Ce que fait le cavalier : en route (arme haute), à la charge (lance couchée, sabre en avant), au combat */
export type RiderMode = 'rest' | 'charge' | 'fight';

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const STEEL = 0xc4cad2, BLUE = 0x3a6ab8, GOLD = 0xe8c66a, SKIN = 0xe8b894, LEATHER = 0x4a3426, BLACK = 0x1e1e22, BRONZE = 0xc49a54;
const OLIVE = 0x66723f, OLIVE_D = 0x4c5630, KHAKI = 0x8a845a, TRACK = 0x2f2f2c, IRON = 0x8a8f96, WHITE = 0xf0ece0;
/** robes des chevaux : bai, alezan, noir, gris ; et leurs crins (crinière, queue) */
const COATS = [0x8a6248, 0xa8683e, 0x3e3434, 0xd8d2c8];
const MANES = [0x2a2220, 0x7a4426, 0x1a1616, 0xa8a29a];
const HOOF = 0x2e2824;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(0, 0, 1);

/** Boîte tendue entre deux points (rênes, baudriers) */
function bar(p: Parts, a: THREE.Vector3, b: THREE.Vector3, w: number, color: number) {
  beam(p, a, b, w, w, color);
}
/** Boîte de largeur `w` (en travers) et d'épaisseur `h`, tendue entre deux points */
function beam(p: Parts, a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, color: number) {
  const d = b.clone().sub(a), len = d.length();
  p.add(new THREE.BoxGeometry(w, h, len).applyQuaternion(_q.setFromUnitVectors(_z, d.normalize())), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, color);
}
/** Membre conique tendu entre deux points (rayon `r0` au départ, `r1` à l'arrivée) ; `open` : sans fonds (caché aux deux bouts) */
function limb(p: Parts, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg: number, color: number, open = false) {
  const d = b.clone().sub(a), len = d.length();
  p.add(new THREE.CylinderGeometry(r1, r0, len, seg, 1, open).applyQuaternion(_q.setFromUnitVectors(_y, d.normalize())), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, color);
}

/**
 * Le cheval, tourné vers +z : ventre, poitrail et croupe ; encolure, crinière en mèches et toupet ; tête (chanfrein, ganaches,
 * bout du nez, naseaux, yeux, oreilles, liste blanche si `blaze`) ; queue
 */
function horse(p: Parts, coat: number, mane: number, blaze: boolean) {
  p.add(new THREE.IcosahedronGeometry(0.07, 1).scale(0.8, 0.78, 1.6), 0, 0.205, -0.005, coat);
  p.add(new THREE.IcosahedronGeometry(0.052, 1).scale(0.95, 1.05, 0.85), 0, 0.218, 0.1, coat);
  p.add(new THREE.IcosahedronGeometry(0.056, 1).scale(1, 0.92, 1), 0, 0.222, -0.098, coat);
  // encolure, crête de la crinière et ses mèches tombant d'un côté puis de l'autre
  limb(p, V(0, 0.226, 0.108), V(0, 0.338, 0.186), 0.047, 0.028, 6, coat, true);
  beam(p, V(0, 0.256, 0.086), V(0, 0.36, 0.168), 0.014, 0.022, mane);
  for (let k = 0; k < 5; k++) {
    const t = k / 5, s = k % 2 ? 1 : -1;
    p.add(new THREE.BoxGeometry(0.006, 0.034, 0.02), s * 0.011, 0.25 + t * 0.098, 0.092 + t * 0.074, mane, 0, false, s * 0.3, 0.62);
  }
  // tête : crâne, bout du nez plus sombre, ganaches, yeux, oreilles, naseaux, toupet
  beam(p, V(0, 0.362, 0.168), V(0, 0.318, 0.232), 0.046, 0.046, coat);
  beam(p, V(0, 0.322, 0.222), V(0, 0.292, 0.276), 0.036, 0.036, dark(coat, 0.8));
  for (const s of [-1, 1]) {
    p.sphere(0.019, s * 0.012, 0.318, 0.196, coat);
    p.box(0.004, 0.009, 0.012, s * 0.0235, 0.336, 0.194, 0x16120f);
    p.add(new THREE.ConeGeometry(0.01, 0.034, 4), s * 0.014, 0.392, 0.172, coat, 0, false, s * -0.22, -0.25);
    p.box(0.008, 0.008, 0.004, s * 0.009, 0.288, 0.29, 0x1a1414);
  }
  p.add(new THREE.BoxGeometry(0.014, 0.03, 0.006), 0, 0.37, 0.192, mane, 0, false, 0, 0.6);
  if (blaze) beam(p, V(0, 0.376, 0.186), V(0, 0.31, 0.276), 0.011, 0.006, 0xf2eee6);
  // queue : attache relevée, crins qui retombent en s'élargissant puis s'effilent
  limb(p, V(0, 0.258, -0.146), V(0, 0.244, -0.184), 0.017, 0.016, 5, mane);
  limb(p, V(0, 0.248, -0.18), V(0, 0.17, -0.206), 0.018, 0.026, 6, mane);
  limb(p, V(0, 0.172, -0.206), V(0, 0.1, -0.198), 0.026, 0.007, 6, mane);
}

/** Une jambe du cheval, pivot en haut : avant-bras et genou (devant) ou cuisse et jarret (derrière), canon, boulet, paturon, sabot */
function horseLeg(coat: number, front: boolean, sock: number | null, feather = false) {
  const lp = new Parts(), low = sock ?? coat;
  if (front) {
    limb(lp, V(0, 0.012, 0.002), V(0, -0.064, 0.006), 0.019, 0.012, 6, coat, true);
    lp.box(0.022, 0.016, 0.024, 0, -0.074, 0.006, coat);
    limb(lp, V(0, -0.066, 0.006), V(0, -0.114, 0.006), 0.0095, 0.009, 5, sock !== null && feather ? low : coat, true);
  } else {
    limb(lp, V(0, 0.012, -0.004), V(0, -0.058, -0.016), 0.022, 0.012, 6, coat, true);
    lp.box(0.02, 0.02, 0.028, 0, -0.074, -0.016, coat);
    limb(lp, V(0, -0.062, -0.014), V(0, -0.114, 0.002), 0.0095, 0.009, 5, coat, true);
  }
  lp.box(0.022, 0.016, 0.024, 0, -0.124, 0.004, low);
  limb(lp, V(0, -0.118, 0.004), V(0, -0.132, 0.009), 0.0095, 0.011, 5, low, true);
  if (feather) lp.cyl(0.015, 0.019, 0.026, 6, 0, -0.142, 0.008, 0xf2eee6);
  lp.cyl(0.0125, 0.0155, 0.016, 6, 0, -0.143, 0.01, HOOF);
  return lp;
}

/** Bride : muserolle, frontal, montants, sous-gorge, mors et rênes jusqu'aux mains du cavalier (`reins` faux : sans rênes) */
function bridle(p: Parts, c = LEATHER, metal = 0xc8ccd2, reins = true) {
  beam(p, V(0, 0.314, 0.236), V(0, 0.309, 0.245), 0.041, 0.041, c);
  p.add(new THREE.BoxGeometry(0.05, 0.006, 0.008), 0, 0.376, 0.19, c, 0, false, 0, 0.6);
  for (const s of [-1, 1]) {
    bar(p, V(s * 0.024, 0.382, 0.178), V(s * 0.0205, 0.302, 0.25), 0.005, c);
    bar(p, V(s * 0.023, 0.37, 0.172), V(s * 0.004, 0.318, 0.18), 0.004, c);
    p.box(0.006, 0.01, 0.01, s * 0.021, 0.293, 0.252, metal);
    if (reins) bar(p, V(s * 0.022, 0.298, 0.252), V(s * 0.032, 0.302, 0.078), 0.004, c);
  }
}

/** Bricole : courroie autour du poitrail, médaillon au milieu */
function breastplate(p: Parts, c = LEATHER, boss = GOLD) {
  for (const s of [-1, 1]) bar(p, V(s * 0.06, 0.246, 0.02), V(s * 0.036, 0.218, 0.134), 0.008, c);
  p.box(0.074, 0.01, 0.008, 0, 0.212, 0.142, c);
  p.add(new THREE.CylinderGeometry(0.01, 0.01, 0.004, 8).rotateX(Math.PI / 2), 0, 0.218, 0.148, boss);
}

/** Tapis bordé, selle (siège, pommeau, troussequin, quartiers), sangle, étrivières et étriers */
function saddle(p: Parts, cloth: number, trim: number) {
  p.box(0.15, 0.064, 0.13, 0, 0.2, -0.008, cloth);
  p.box(0.152, 0.01, 0.132, 0, 0.2, -0.008, trim);
  p.box(0.08, 0.016, 0.09, 0, 0.262, -0.002, LEATHER);
  p.box(0.058, 0.03, 0.018, 0, 0.264, 0.048, LEATHER);
  p.box(0.07, 0.028, 0.016, 0, 0.264, -0.05, LEATHER);
  for (const s of [-1, 1]) {
    p.box(0.008, 0.05, 0.05, s * 0.074, 0.214, -0.012, dark(LEATHER, 0.85));
    p.box(0.005, 0.07, 0.008, s * 0.077, 0.17, 0.04, LEATHER);
    p.box(0.024, 0.005, 0.03, s * 0.077, 0.158, 0.05, IRON);
    p.box(0.024, 0.016, 0.004, s * 0.077, 0.158, 0.064, IRON);
  }
  p.box(0.13, 0.014, 0.022, 0, 0.142, 0.03, LEATHER);
}

/** Le cavalier assis : bassin et cuisses sur la selle, bottes aux étriers, buste, bras aux rênes, tête (yeux, nez) */
function seated(p: Parts, o: { thigh: number; boot: number; coat: number; arm: number; glove: number; belt?: number }) {
  p.box(0.08, 0.03, 0.06, 0, 0.268, -0.005, o.thigh);
  for (const s of [-1, 1]) {
    p.box(0.03, 0.03, 0.075, s * 0.05, 0.268, 0.025, o.thigh);
    p.box(0.028, 0.098, 0.034, s * 0.072, 0.172, 0.045, o.boot);
    p.box(0.031, 0.014, 0.037, s * 0.072, 0.252, 0.045, dark(o.boot, 1.15));
    p.box(0.03, 0.016, 0.05, s * 0.072, 0.164, 0.056, o.boot);
  }
  p.box(0.085, 0.11, 0.06, 0, 0.285, 0, o.coat);
  p.box(0.09, 0.012, 0.064, 0, 0.29, 0, o.belt ?? LEATHER);
  // bras gauche aux rênes, bras droit vers l'arme
  for (const s of [-1, 1]) {
    p.add(new THREE.BoxGeometry(0.026, 0.07, 0.03), s * 0.056, 0.345, 0.008, o.arm, 0, false, 0, -0.35);
    p.add(new THREE.BoxGeometry(0.024, 0.024, 0.06), s * 0.05, 0.31, 0.045, o.arm);
    p.box(0.024, 0.022, 0.022, s * 0.045, 0.298, 0.08, o.glove);
  }
  face(p, 0.395, 0.004);
}

/** Tête du cavalier (base à `y`), deux yeux et le nez */
function face(p: Parts, y: number, z: number) {
  p.box(0.022, 0.01, 0.022, 0, y - 0.006, z, SKIN);
  p.box(0.046, 0.046, 0.046, 0, y, z, SKIN);
  for (const s of [-1, 1]) p.box(0.007, 0.007, 0.003, s * 0.011, y + 0.022, z + 0.023, 0x2a1e18);
  p.box(0.008, 0.012, 0.006, 0, y + 0.01, z + 0.024, dark(SKIN, 0.88));
}

/** Lance rayée (hampe de frêne pour les Romains), garde en cône, fer ; flamme bleu et or à deux pointes si `pennon` ; couchée vers +z */
function lance(a = BLUE, b = GOLD, pennon = false) {
  const p = new Parts();
  for (let k = 0; k < 5; k++) p.add(new THREE.CylinderGeometry(0.0075 - k * 0.0008, 0.0085 - k * 0.0008, 0.12, 5).rotateX(Math.PI / 2), 0, 0, k * 0.12, k % 2 ? b : a);
  p.add(new THREE.ConeGeometry(0.026, 0.05, 6).rotateX(Math.PI / 2), 0, 0, 0.03, STEEL);
  p.add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.03, 5).rotateX(Math.PI / 2), 0, 0, -0.07, dark(a, 0.8));
  p.add(new THREE.ConeGeometry(0.009, 0.05, 4).rotateX(Math.PI / 2), 0, 0, 0.565, STEEL);
  p.add(new THREE.BoxGeometry(0.012, 0.012, 0.012), 0, 0, 0.535, dark(STEEL, 0.75));
  if (pennon) {
    p.add(new THREE.BoxGeometry(0.003, 0.034, 0.05), 0, 0.02, 0.49, BLUE);
    p.add(new THREE.BoxGeometry(0.0035, 0.01, 0.05), 0, 0.02, 0.49, GOLD);
    for (const y of [0.03, 0.01]) p.add(new THREE.ConeGeometry(0.008, 0.03, 3).rotateX(-Math.PI / 2).scale(0.3, 1, 1), 0, y, 0.45, BLUE);
  }
  return p;
}

/** Sabre droit de cavalerie, lame vers +y depuis la main : pommeau, poignée, garde à branches de laiton, lame à gouttière */
function saber() {
  const p = new Parts();
  p.box(0.014, 0.008, 0.014, 0, -0.04, 0, GOLD);
  p.box(0.012, 0.03, 0.012, 0, -0.03, 0, LEATHER);
  p.box(0.034, 0.008, 0.014, 0, 0.0, 0, GOLD);
  p.box(0.004, 0.034, 0.004, 0, -0.03, 0.01, GOLD);
  p.box(0.006, 0.17, 0.014, 0, 0.008, 0, STEEL);
  p.box(0.0065, 0.15, 0.003, 0, 0.012, 0.002, dark(STEEL, 0.8));
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

/** Canon du char, vers +z depuis le masque de tourelle : masque boulonné, tube, évacuateur de fumée, frein de bouche */
function cannon() {
  const p = new Parts();
  p.box(0.05, 0.042, 0.04, 0, -0.021, 0, OLIVE_D);
  p.box(0.056, 0.03, 0.012, 0, -0.015, 0.016, dark(OLIVE_D, 0.9));
  for (const x of [-0.022, 0.022]) p.box(0.006, 0.006, 0.004, x, 0.004, 0.022, KHAKI);
  p.add(new THREE.CylinderGeometry(0.0105, 0.013, 0.22, 7).rotateX(Math.PI / 2), 0, 0, 0.13, OLIVE);
  p.add(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 7).rotateX(Math.PI / 2), 0, 0, 0.12, dark(OLIVE, 0.9));
  p.box(0.028, 0.024, 0.034, 0, -0.012, 0.24, OLIVE_D);
  for (const s of [-1, 1]) p.box(0.006, 0.016, 0.022, s * 0.016, -0.008, 0.242, dark(TRACK, 1.2));
  return p;
}

/** Géométries partagées d'un cavalier ou d'un char à la même époque et à la même robe (elles ne sont jamais libérées) */
const riderGeo = new Map<string, { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; legs: THREE.BufferGeometry[]; weapon: THREE.BufferGeometry }>();

/**
 * Char d'assaut, tourné vers +z : chenilles à patins, garde-boue et jupes, caisse, glacis aux maillons de rechange, phares sous
 * leur grille, coffres et jerricanes, échappements ; tourelle et son panier, lance-fumigènes, chef de char au tourelleau et sa
 * mitrailleuse, antenne au fanion bleu et or, écusson du village, taches de camouflage ; galets à part (ils roulent), canon à part
 */
function tank(v: number): Rider {
  let g = riderGeo.get('tank');
  if (!g) {
    const p = new Parts();
    for (const s of [-1, 1]) {
      p.box(0.07, 0.075, 0.44, s * 0.115, 0, 0, TRACK);
      // patins de la chenille sur le dessus et devant
      for (let k = 0; k < 9; k++) p.box(0.074, 0.006, 0.02, s * 0.115, 0.074, -0.18 + k * 0.045, dark(TRACK, 1.4));
      p.box(0.072, 0.018, 0.4, s * 0.115, 0.06, 0, dark(TRACK, 1.3));
      // garde-boue et jupe latérale boulonnée
      p.box(0.086, 0.012, 0.46, s * 0.115, 0.093, 0, OLIVE_D);
      p.box(0.008, 0.04, 0.36, s * 0.157, 0.056, -0.01, OLIVE);
      for (const z of [-0.15, -0.05, 0.05, 0.15]) p.box(0.004, 0.006, 0.006, s * 0.162, 0.084, z, KHAKI);
      // barbotin à l'avant, roue folle à l'arrière, rouleaux porteurs
      for (const z of [0.2, -0.2]) p.add(new THREE.CylinderGeometry(0.034, 0.034, 0.074, 8).rotateZ(Math.PI / 2), s * 0.115, 0.045, z, dark(TRACK, 1.5));
      for (const z of [0.2, -0.2]) p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.078, 6).rotateZ(Math.PI / 2), s * 0.115, 0.045, z, KHAKI);
    }
    p.box(0.17, 0.06, 0.4, 0, 0.04, 0, OLIVE_D);
    p.box(0.24, 0.045, 0.36, 0, 0.1, -0.015, OLIVE);
    p.add(new THREE.BoxGeometry(0.24, 0.012, 0.1), 0, 0.118, 0.19, OLIVE, 0, false, 0, -0.55);
    // maillons de rechange sur le glacis, crochets de remorquage
    for (const x of [-0.06, -0.03, 0, 0.03]) p.add(new THREE.BoxGeometry(0.026, 0.006, 0.018), x, 0.128, 0.2, dark(TRACK, 1.4), 0, false, 0, -0.55);
    for (const s of [-1, 1]) p.box(0.012, 0.02, 0.02, s * 0.06, 0.03, 0.21, OLIVE_D);
    // phares et leur grille, poste du pilote (épiscopes)
    for (const s of [-1, 1]) {
      p.box(0.026, 0.018, 0.012, s * 0.085, 0.1, 0.212, 0xfff1c9, 0, true);
      p.box(0.03, 0.022, 0.004, s * 0.085, 0.098, 0.22, dark(TRACK, 1.2));
    }
    p.box(0.05, 0.012, 0.03, -0.06, 0.145, 0.13, OLIVE_D);
    p.box(0.036, 0.006, 0.004, -0.06, 0.15, 0.146, 0x2e3c48);
    // arrière : plaque, échappements, coffre, jerricanes sur les garde-boue, câble de remorquage
    p.box(0.2, 0.035, 0.03, 0, 0.09, -0.2, OLIVE_D);
    for (const s of [-1, 1]) {
      p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.04, 6).rotateX(Math.PI / 2), s * 0.06, 0.122, -0.215, dark(TRACK, 1.2));
      p.box(0.026, 0.026, 0.004, s * 0.06, 0.109, -0.236, 0x3a3a36);
      p.box(0.03, 0.04, 0.014, s * 0.135, 0.105, -0.17, OLIVE_D);
      p.box(0.004, 0.012, 0.012, s * 0.15, 0.13, -0.17, KHAKI);
    }
    p.box(0.08, 0.03, 0.05, 0.05, 0.145, -0.17, dark(OLIVE, 0.85));
    for (const z of [-0.12, -0.06, 0, 0.06]) p.add(new THREE.TorusGeometry(0.014, 0.003, 3, 6).rotateY(Math.PI / 2), -0.1, 0.152, z, 0x5a5a52);
    // taches de camouflage
    p.box(0.07, 0.004, 0.09, 0.05, 0.145, 0.06, KHAKI);
    p.box(0.06, 0.004, 0.07, -0.07, 0.145, -0.12, dark(OLIVE_D, 0.85));
    p.box(0.05, 0.004, 0.05, -0.05, 0.145, 0.1, dark(OLIVE_D, 0.85));
    // tourelle : biseautée, panier arrière, écusson bleu et or sur les flancs, lance-fumigènes, tourelleau, chef de char
    p.box(0.15, 0.055, 0.17, 0, 0.145, -0.03, OLIVE);
    p.box(0.13, 0.014, 0.15, 0, 0.2, -0.03, dark(OLIVE, 0.92));
    p.box(0.04, 0.008, 0.06, -0.035, 0.212, -0.09, KHAKI);
    p.box(0.13, 0.006, 0.05, 0, 0.16, -0.14, dark(TRACK, 1.3));
    for (const s of [-1, 1]) p.box(0.006, 0.03, 0.05, s * 0.063, 0.16, -0.14, dark(TRACK, 1.3));
    p.box(0.1, 0.022, 0.03, 0, 0.166, -0.14, KHAKI);
    for (const s of [-1, 1]) {
      p.box(0.004, 0.03, 0.03, s * 0.076, 0.157, -0.03, BLUE); p.box(0.005, 0.012, 0.012, s * 0.077, 0.166, -0.03, GOLD);
      for (const k of [0, 1, 2]) p.add(new THREE.CylinderGeometry(0.006, 0.006, 0.026, 5).rotateX(1.2), s * (0.06 + k * 0.009), 0.195, 0.04, dark(OLIVE_D, 0.8), s * 0.4);
    }
    p.cyl(0.026, 0.028, 0.02, 8, 0.03, 0.214, -0.06, OLIVE_D);
    p.box(0.03, 0.006, 0.03, 0.03, 0.236, -0.098, OLIVE_D);
    p.box(0.03, 0.026, 0.028, 0.03, 0.234, -0.06, 0x4c5630);
    p.box(0.024, 0.024, 0.024, 0.03, 0.258, -0.058, SKIN);
    p.box(0.022, 0.006, 0.006, 0.03, 0.272, -0.044, 0x2a3a48);
    p.sphere(0.02, 0.03, 0.282, -0.062, OLIVE_D, 1, 0.75);
    // mitrailleuse du tourelleau
    p.box(0.008, 0.016, 0.008, -0.002, 0.234, -0.05, TRACK);
    p.box(0.012, 0.014, 0.03, -0.002, 0.25, -0.05, TRACK);
    p.box(0.005, 0.005, 0.06, -0.002, 0.256, -0.015, TRACK);
    // antenne et fanion du village
    p.box(0.004, 0.2, 0.004, -0.055, 0.214, -0.1, BLACK);
    p.box(0.003, 0.03, 0.05, -0.055, 0.384, -0.126, BLUE);
    p.box(0.0035, 0.01, 0.05, -0.055, 0.384, -0.126, GOLD);
    const built = p.build(false);
    // galets de roulement, de part et d'autre (moyeu clair pour qu'on les voie tourner)
    const legs = [-1, 1].map((s) => {
      const wp = new Parts();
      wp.add(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8).rotateZ(Math.PI / 2), 0, 0, 0, dark(OLIVE_D, 0.9));
      wp.add(new THREE.CylinderGeometry(0.012, 0.012, 0.016, 6).rotateZ(Math.PI / 2), s * 0.002, 0, 0, KHAKI);
      wp.box(0.014, 0.034, 0.012, s * 0.002, -0.017, 0, KHAKI);
      return wp.build(false).body;
    });
    g = { body: built.body, glow: built.glow, legs, weapon: cannon().build(false).body };
    riderGeo.set('tank', g);
  }
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  // un peu plus gros qu’un cheval et son cavalier
  root.scale.setScalar(((1 + HUMAN_K) / 2) * 1.25);
  const hull = new THREE.Mesh(g.body, mats.body);
  hull.castShadow = true;
  body.add(hull);
  if (g.glow) body.add(new THREE.Mesh(g.glow, mats.glow));
  // galets : ils tournent quand le char avance
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) for (const z of [-0.12, -0.04, 0.04, 0.12]) {
    const wheel = new THREE.Mesh(g.legs[s < 0 ? 0 : 1], mats.body);
    wheel.position.set(s * 0.152, 0.04, z);
    wheel.userData.ph = z * 9 + v;
    body.add(wheel);
    legs.push(wheel);
  }
  const wm = new THREE.Mesh(g.weapon, mats.body);
  wm.position.set(0, 0.17, 0.055);
  wm.rotation.order = 'YXZ';
  wm.userData.kind = 'cannon';
  wm.castShadow = true;
  body.add(wm);
  return { root, body, legs, weapon: wm, tank: true };
}

/** Cavalier romain : selle à quatre cornes sur un tapis rouge à franges d'or, phalères, cotte de mailles, cape, casque à crête */
function romanRider(p: Parts) {
  saddle(p, 0xb8322c, GOLD);
  for (const x of [-0.03, 0.03]) for (const z of [0.05, -0.052]) p.add(new THREE.ConeGeometry(0.008, 0.03, 4), x, 0.29, z, LEATHER, 0, false, x * 8, z * 6);
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) p.box(0.004, 0.018, 0.008, s * 0.077, 0.186, -0.065 + k * 0.022, GOLD);
  breastplate(p, LEATHER, GOLD);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 8).rotateZ(Math.PI / 2), s * 0.052, 0.232, 0.085, GOLD, s * 0.5);
  bridle(p, LEATHER, BRONZE);
  seated(p, { thigh: SKIN, boot: LEATHER, coat: 0xb8322c, arm: SKIN, glove: SKIN });
  // cotte de mailles, ceinturon à lanières, épée au côté
  p.box(0.091, 0.072, 0.065, 0, 0.3, 0, 0x8f949c);
  p.box(0.093, 0.012, 0.067, 0, 0.296, 0, LEATHER);
  for (let k = 0; k < 4; k++) p.box(0.012, 0.03, 0.005, -0.03 + k * 0.02, 0.268, 0.032, LEATHER);
  for (const s of [-1, 1]) p.box(0.03, 0.02, 0.05, s * 0.05, 0.36, 0, 0x8f949c);
  p.add(new THREE.BoxGeometry(0.012, 0.11, 0.016), -0.058, 0.25, -0.02, 0x6a3a26, 0, false, 0, 0.9);
  p.box(0.016, 0.01, 0.02, -0.058, 0.286, 0.006, BRONZE);
  // cape rouge qui retombe sur la croupe, sa fibule
  p.add(new THREE.BoxGeometry(0.094, 0.13, 0.012), 0, 0.33, -0.042, 0xa82a26, 0, false, 0, 0.22);
  p.add(new THREE.BoxGeometry(0.1, 0.012, 0.06), 0, 0.27, -0.09, 0xa82a26, 0, false, 0, -0.35);
  p.sphere(0.008, 0.035, 0.375, 0.03, GOLD);
  // casque de bronze : bombe, crête rouge, couvre-joues, couvre-nuque, visière
  p.sphere(0.03, 0, 0.44, 0.004, BRONZE, 1, 0.8);
  p.box(0.012, 0.03, 0.07, 0, 0.455, -0.002, 0xd84a3e);
  p.box(0.06, 0.008, 0.02, 0, 0.41, -0.024, BRONZE);
  p.box(0.054, 0.006, 0.012, 0, 0.432, 0.03, BRONZE);
  for (const s of [-1, 1]) p.box(0.008, 0.026, 0.018, s * 0.026, 0.4, 0.016, BRONZE);
  // bouclier ovale bleu : bord de bronze, ombilic, éclairs d'or
  p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10).rotateZ(Math.PI / 2).scale(1, 1.3, 1), 0.076, 0.3, 0.02, BLUE);
  p.add(new THREE.TorusGeometry(0.049, 0.004, 3, 12).rotateY(Math.PI / 2).scale(1, 1.3, 1), 0.082, 0.3, 0.02, BRONZE);
  p.sphere(0.014, 0.084, 0.3, 0.02, GOLD);
  for (const r of [0.6, -0.6]) p.add(new THREE.BoxGeometry(0.004, 0.05, 0.008), 0.083, 0.3, 0.02, GOLD, 0, false, 0, r);
}

/**
 * Chevalier : caparaçon bleu semé de losanges d'or, bordé d'or et découpé en dents, chanfrein d'acier à plumet, flançois sur
 * l'encolure, armure de plates, cotte d'armes, grand heaume à fente et cimier, écu au bras gauche, éperons
 */
function knightRider(p: Parts) {
  // le caparaçon : devant et derrière (les jambes passent dessous), bordure d'or, dents du bas
  p.box(0.166, 0.11, 0.12, 0, 0.13, 0.065, BLUE);
  p.box(0.166, 0.11, 0.15, 0, 0.13, -0.085, BLUE);
  p.box(0.168, 0.016, 0.3, 0, 0.13, -0.01, GOLD);
  p.box(0.15, 0.03, 0.2, 0, 0.24, -0.04, BLUE);
  for (let k = 0; k < 7; k++) for (const s of [-1, 1]) {
    p.add(new THREE.ConeGeometry(0.012, 0.02, 3).rotateX(Math.PI), s * 0.084, 0.122, -0.14 + k * 0.045, GOLD);
    if (k % 2 === 0) p.add(new THREE.BoxGeometry(0.004, 0.016, 0.016), s * 0.084, 0.19, -0.14 + k * 0.045, GOLD, 0, false, Math.PI / 4);
  }
  p.box(0.13, 0.03, 0.02, 0, 0.17, 0.12, BLUE);
  // la tête couverte : chanfrein d'acier, oreillettes, plumet ; flançois de lames sur l'encolure
  beam(p, V(0, 0.368, 0.17), V(0, 0.308, 0.258), 0.05, 0.03, STEEL);
  p.box(0.01, 0.012, 0.014, 0, 0.35, 0.208, GOLD);
  p.sphere(0.014, 0, 0.395, 0.17, GOLD, 0, 1.4);
  for (let k = 0; k < 4; k++) beam(p, V(0, 0.262 + k * 0.022, 0.094 + k * 0.016), V(0, 0.278 + k * 0.022, 0.108 + k * 0.016), 0.05, 0.012, k % 2 ? STEEL : dark(STEEL, 0.85));
  bridle(p, 0x2a2a3a, GOLD);
  p.box(0.08, 0.016, 0.09, 0, 0.262, -0.002, LEATHER);
  p.box(0.07, 0.04, 0.018, 0, 0.268, -0.052, LEATHER);
  seated(p, { thigh: STEEL, boot: STEEL, coat: STEEL, arm: STEEL, glove: dark(STEEL, 0.8), belt: GOLD });
  for (const s of [-1, 1]) {
    p.box(0.024, 0.006, 0.03, s * 0.077, 0.158, 0.05, IRON);
    p.box(0.004, 0.004, 0.02, s * 0.072, 0.17, 0.025, GOLD);
    p.sphere(0.024, s * 0.05, 0.36, 0, dark(STEEL, 0.9), 0, 0.75);
    p.sphere(0.014, s * 0.05, 0.278, 0.05, dark(STEEL, 0.9));
  }
  // cotte d'armes bleue à bande d'or, ceinture, fourreau
  p.box(0.09, 0.075, 0.065, 0, 0.255, 0, BLUE);
  p.box(0.092, 0.018, 0.066, 0, 0.3, 0, GOLD);
  p.box(0.02, 0.07, 0.067, 0, 0.32, 0, GOLD);
  p.add(new THREE.BoxGeometry(0.012, 0.12, 0.014), -0.058, 0.24, -0.03, 0x2a2a3a, 0, false, 0, 0.9);
  // grand heaume : fente et trous d'aération, cimier à plumes
  p.cyl(0.032, 0.034, 0.065, 8, 0, 0.385, 0.004, STEEL);
  p.cyl(0.024, 0.032, 0.012, 8, 0, 0.45, 0.004, STEEL);
  p.box(0.042, 0.008, 0.01, 0, 0.42, 0.036, 0x2a2e34);
  p.box(0.006, 0.026, 0.01, 0, 0.398, 0.036, 0x2a2e34);
  p.add(new THREE.IcosahedronGeometry(0.022, 0).scale(0.7, 1.5, 1.2), 0, 0.485, -0.008, GOLD);
  p.add(new THREE.IcosahedronGeometry(0.015, 0).scale(0.7, 1.4, 1.2), 0, 0.495, 0.01, 0xf0ece0);
  // écu bleu à la bande d'or et au losange
  p.box(0.012, 0.09, 0.07, 0.072, 0.24, 0.02, GOLD);
  p.box(0.014, 0.08, 0.062, 0.073, 0.245, 0.02, BLUE);
  p.add(new THREE.ConeGeometry(0.035, 0.035, 4).rotateZ(Math.PI).rotateY(Math.PI / 4), 0.073, 0.232, 0.02, BLUE);
  p.add(new THREE.BoxGeometry(0.015, 0.09, 0.012), 0.073, 0.25, 0.02, GOLD, 0, false, 0, 0.7);
}

/**
 * Cuirassier : schabraque bleue à pointes et galon d'or, peau de mouton sur la selle, manteau roulé en croupe, fontes, culotte
 * et bottes à l'écuyère, cuirasse rivetée, épaulettes, casque à cimier, crinière et plumet, fourreau du sabre
 */
function cuirassierRider(p: Parts) {
  saddle(p, 0x2c3e6a, GOLD);
  for (const s of [-1, 1]) {
    p.add(new THREE.ConeGeometry(0.03, 0.05, 3).rotateX(Math.PI).scale(0.2, 1, 1.4), s * 0.076, 0.19, -0.06, 0x2c3e6a);
    p.add(new THREE.ConeGeometry(0.02, 0.03, 3).rotateX(Math.PI).scale(0.2, 1, 1.4), s * 0.077, 0.19, -0.06, GOLD);
    p.add(new THREE.CylinderGeometry(0.012, 0.01, 0.05, 6), s * 0.03, 0.27, 0.075, BLACK, 0, false, 0, 0.5);
    p.sphere(0.009, s * 0.077, 0.23, -0.02, GOLD);
  }
  p.box(0.082, 0.014, 0.08, 0, 0.276, -0.004, 0xf0ece0);
  p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 7).rotateZ(Math.PI / 2), 0, 0.29, -0.07, 0x2c3e6a);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 7).rotateZ(Math.PI / 2), s * 0.05, 0.29, -0.07, LEATHER);
  breastplate(p, BLACK, GOLD);
  bridle(p, BLACK, STEEL);
  seated(p, { thigh: 0xf0ece0, boot: BLACK, coat: 0x2c3e6a, arm: 0x2c3e6a, glove: 0xf0ece0, belt: 0xf0ece0 });
  // cuirasse d'acier à rivets et bordure de laiton, épaulettes rouges
  p.box(0.094, 0.075, 0.068, 0, 0.3, 0, STEEL);
  p.box(0.096, 0.008, 0.07, 0, 0.372, 0, GOLD);
  for (const x of [-0.03, 0, 0.03]) p.box(0.005, 0.005, 0.004, x, 0.362, 0.034, GOLD);
  p.box(0.07, 0.006, 0.004, 0, 0.302, 0.034, dark(STEEL, 0.75));
  for (const s of [-1, 1]) { p.box(0.03, 0.014, 0.04, s * 0.05, 0.392, 0, 0xd84a3e); p.box(0.034, 0.01, 0.012, s * 0.05, 0.39, 0.02, GOLD); }
  // fourreau du sabre, sabretache
  p.add(new THREE.BoxGeometry(0.01, 0.15, 0.014), -0.06, 0.22, -0.03, STEEL, 0, false, 0, 0.8);
  p.box(0.004, 0.04, 0.03, -0.068, 0.2, -0.06, 0x2c3e6a);
  // casque : bombe, visière de cuir, jugulaires d'écailles, cimier de laiton, crinière noire, plumet rouge
  p.cyl(0.03, 0.033, 0.045, 7, 0, 0.405, 0.006, STEEL);
  p.sphere(0.03, 0, 0.448, 0.006, STEEL, 0, 0.5);
  p.box(0.05, 0.006, 0.022, 0, 0.408, 0.04, BLACK);
  for (const s of [-1, 1]) p.box(0.006, 0.03, 0.01, s * 0.026, 0.39, 0.02, GOLD);
  p.box(0.014, 0.03, 0.068, 0, 0.452, 0.002, GOLD);
  p.add(new THREE.BoxGeometry(0.012, 0.11, 0.02), 0, 0.41, -0.052, 0x1a1a1a, 0, false, 0, -0.35);
  p.add(new THREE.ConeGeometry(0.009, 0.07, 4), 0.027, 0.46, 0.01, 0xd84a3e);
}

/**
 * Cavalier de l'époque (âge 1 à 3 ; plus tôt, le cavalier romain ; à l'époque moderne, un char) ; `v` varie la robe du
 * cheval. Tourné vers +z, posé à y = 0, à l'échelle des habitants
 */
export function makeRider(age: number, v = 0, gendarme = false): Rider {
  const era = Math.min(4, Math.max(1, age)), ci = (v % COATS.length + COATS.length) % COATS.length, coat = COATS[ci];
  if (era === 4 && !gendarme) return tank(v);
  const key = `${era}|${ci}|${gendarme ? 'g' : ''}|${v % 2 ? 1 : 0}`;
  const kind: 'lance' | 'saber' | 'rifle' = gendarme ? (era === 4 ? 'rifle' : era >= 2 ? 'saber' : 'lance') : era <= 2 ? 'lance' : 'saber';
  let g = riderGeo.get(key);
  if (!g) {
    const p = new Parts();
    horse(p, coat, MANES[ci], ci !== 2 && v % 3 === 1);
    let weapon: Parts;
    if (gendarme && era >= 3) {
      // gendarme à cheval : tapis bleu bordé de blanc, culotte de peau blanche et bottes noires, habit bleu de roi, baudrier
      // jaune bordé de blanc, trèfles d'argent, bicorne en bataille à cocarde (képi à l'époque moderne), sabre
      const navy = 0x22305a, buff = 0xe8c060, silver = 0xd8dce2;
      saddle(p, navy, WHITE);
      bridle(p, BLACK, silver);
      breastplate(p, BLACK, silver);
      seated(p, { thigh: era >= 4 ? navy : WHITE, boot: BLACK, coat: navy, arm: navy, glove: era >= 4 ? BLACK : WHITE, belt: buff });
      p.add(new THREE.BoxGeometry(0.02, 0.12, 0.003), 0, 0.32, 0.031, WHITE, 0, false, 0.6);
      p.add(new THREE.BoxGeometry(0.014, 0.12, 0.004), 0, 0.32, 0.032, buff, 0, false, 0.6);
      for (const s of [-1, 1]) p.box(0.03, 0.01, 0.04, s * 0.05, 0.345, 0, silver);
      if (era >= 4) { p.cyl(0.026, 0.024, 0.04, 10, 0, 0.42, 0, 0x1a2238); p.cyl(0.0265, 0.0265, 0.008, 10, 0, 0.425, 0, silver); p.box(0.04, 0.005, 0.022, 0, 0.42, 0.03, BLACK); }
      else {
        const half = (r: number) => new THREE.CylinderGeometry(r, r, 0.026, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1.25, 0.62, 1);
        p.add(half(0.046), 0, 0.422, 0, BLACK); for (const z of [-0.0135, 0.0135]) p.add(new THREE.TorusGeometry(0.045, 0.0025, 3, 14, Math.PI).scale(1.25, 0.62, 1), 0, 0.422, z, silver); p.box(0.11, 0.008, 0.03, 0, 0.418, 0, BLACK);
        p.add(new THREE.CylinderGeometry(0.011, 0.011, 0.004, 10).rotateX(Math.PI / 2), 0.026, 0.438, 0.016, 0xd8443a);
        p.add(new THREE.CylinderGeometry(0.0075, 0.0075, 0.005, 10).rotateX(Math.PI / 2), 0.026, 0.438, 0.017, WHITE);
        p.add(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 8).rotateX(Math.PI / 2), 0.026, 0.438, 0.018, 0x2c4a9a);
      }
      weapon = era >= 4 ? carbine() : saber();
    } else if (gendarme && era === 2) {
      // sergent à cheval du guet : tapis bleu, tabard bleu à la fleur d'or, chapel de fer, épée
      saddle(p, BLUE, GOLD);
      bridle(p);
      seated(p, { thigh: 0x6a6a72, boot: LEATHER, coat: BLUE, arm: 0x8f949c, glove: LEATHER });
      p.box(0.02, 0.02, 0.066, 0, 0.32, 0, GOLD);
      p.sphere(0.03, 0, 0.425, 0, STEEL, 1, 0.75); p.cyl(0.05, 0.044, 0.012, 10, 0, 0.412, 0, STEEL);
      weapon = saber();
    } else if (era === 1) { romanRider(p); weapon = lance(0x9a7452, 0x8a6448); }
    else if (era === 2) { knightRider(p); weapon = lance(BLUE, GOLD, true); }
    else { cuirassierRider(p); weapon = saber(); }
    const built = p.build(false);
    // jambes : balzanes blanches sur deux d'entre elles
    const legs = ([[1, 1], [1, 0], [0, 0], [0, v % 2]] as [number, number][]).map(([front, sock]) => horseLeg(coat, !!front, sock ? 0xf2eee6 : null).build(false).body);
    g = { body: built.body, glow: built.glow, legs, weapon: weapon.build(false).body };
    riderGeo.set(key, g);
  }
  // cheval et cavalier dessinés pour des habitants de 0,3 : le cavalier rapetisse avec eux, le cheval un peu moins
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar((1 + HUMAN_K) / 2);
  const hull = new THREE.Mesh(g.body, mats.body);
  hull.castShadow = true;
  body.add(hull);
  if (g.glow) body.add(new THREE.Mesh(g.glow, mats.glow));
  // jambes : pivot à l'épaule et à la hanche
  const legs: THREE.Object3D[] = [];
  ([[0.04, 0.09, 0], [-0.04, 0.09, Math.PI], [0.04, -0.09, Math.PI], [-0.04, -0.09, 0]] as [number, number, number][]).forEach(([x, z, ph], i) => {
    const leg = new THREE.Mesh(g!.legs[i], mats.body);
    leg.position.set(x, 0.14, z);
    leg.userData.ph = ph;
    leg.castShadow = true;
    body.add(leg);
    legs.push(leg);
  });
  const wm = new THREE.Mesh(g.weapon, mats.body);
  wm.position.set(...((kind === 'lance' ? [-0.05, 0.3, 0.06] : [-0.048, 0.3, 0.08]) as [number, number, number]));
  wm.rotation.order = 'YXZ';
  wm.userData.kind = kind;
  wm.castShadow = true;
  body.add(wm);
  return { root, body, legs, weapon: wm, tank: false };
}

/**
 * Cheval de trait des charrettes : la même bête que les montures (jambes qui marchent, fanons blancs sur les sabots), avec
 * son collier d'attelage et ses attelles de laiton, ses œillères, sa sellette et ses clés, sa sous-ventrière, son avaloire
 * autour de la croupe et ses traits ; `v` varie la robe. Tourné vers +z, posé à y = 0 (géométries propres à chaque cheval :
 * le trafic les libère)
 */
export function makeDraftHorse(v = 0): Rider {
  const ci = (v % COATS.length + COATS.length) % COATS.length, coat = COATS[ci], p = new Parts();
  horse(p, coat, MANES[ci], v % 3 === 1 && ci !== 2);
  bridle(p, LEATHER, GOLD, false);
  // œillères, rênes de guide qui filent vers la voiture
  for (const s of [-1, 1]) {
    p.box(0.004, 0.022, 0.024, s * 0.028, 0.33, 0.19, BLACK);
    bar(p, V(s * 0.022, 0.298, 0.252), V(s * 0.03, 0.29, -0.06), 0.004, LEATHER);
  }
  // collier rembourré, attelles de laiton dressées en pointe
  p.add(new THREE.TorusGeometry(0.045, 0.015, 5, 10), 0, 0.255, 0.115, LEATHER, 0, false, 0, -0.5);
  p.add(new THREE.TorusGeometry(0.047, 0.006, 4, 10), 0, 0.262, 0.11, GOLD, 0, false, 0, -0.5);
  for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.006, 0.05, 4), s * 0.02, 0.31, 0.096, GOLD, 0, false, s * -0.25, -0.5);
  // sellette, ses clés (anneaux du guide), sous-ventrière
  p.box(0.08, 0.03, 0.05, 0, 0.27, -0.01, LEATHER);
  p.box(0.06, 0.008, 0.052, 0, 0.3, -0.01, dark(LEATHER, 0.8));
  for (const s of [-1, 1]) p.add(new THREE.TorusGeometry(0.008, 0.002, 3, 8), s * 0.024, 0.315, -0.01, GOLD);
  p.box(0.15, 0.012, 0.03, 0, 0.2, -0.01, LEATHER);
  p.box(0.134, 0.012, 0.024, 0, 0.144, -0.01, LEATHER);
  // traits du collier vers l'arrière, avaloire autour de la croupe, croupière jusqu'à la queue
  for (const s of [-1, 1]) {
    p.box(0.008, 0.008, 0.2, s * 0.06, 0.22, -0.06, LEATHER);
    bar(p, V(s * 0.062, 0.232, -0.1), V(s * 0.05, 0.19, -0.15), 0.01, LEATHER);
    p.sphere(0.006, s * 0.062, 0.222, 0.0, GOLD);
  }
  p.add(new THREE.TorusGeometry(0.063, 0.005, 3, 10, Math.PI).rotateX(-Math.PI / 2), 0, 0.2, -0.1, LEATHER);
  bar(p, V(0, 0.285, -0.01), V(0, 0.27, -0.15), 0.008, LEATHER);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  root.scale.setScalar((1 + HUMAN_K) / 2);
  const hull = new THREE.Mesh(p.build(false).body, mats.body);
  hull.castShadow = true;
  body.add(hull);
  const legs: THREE.Object3D[] = [];
  for (const [x, z, ph, front] of [[0.04, 0.09, 0, 1], [-0.04, 0.09, Math.PI, 1], [0.04, -0.09, Math.PI, 0], [-0.04, -0.09, 0, 0]]) {
    const leg = new THREE.Mesh(horseLeg(coat, !!front, v % 2 ? 0xf2eee6 : null, true).build(false).body, mats.body);
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
