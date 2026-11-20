import * as THREE from 'three';
import { wrapAngle } from '../core/rng';
import { World } from '../world/world';
import { Parts } from './parts';
import { mats } from './materials';
import type { BuildingView } from './buildings';
import { HELIPADS } from './models';

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/** Héliport sur le toit du centre hospitalier (repère du bâtiment : centre de l'emprise, façade vers +z) */
const PAD = new THREE.Vector3(-0.45, 0.889, -0.5);
/**
 * À l'âge futuriste, la clinique n'a plus ce toit : son aire (sur l'aile des soins) est prise par l'ambulance volante qui y
 * est posée ; le drone sanitaire attend donc en vol stationnaire au-dessus d'elle
 */
const FUTURE_PAD = new THREE.Vector3(0.5, 0.84, -0.42);
/** Hauteur de vol au-dessus de l'héliport, vitesse de croisière (cases par seconde), vitesse des pales à plein régime */
const CRUISE = 2.6, SPEED = 2.2, ROTOR = 26;

type Phase = 'parked' | 'spin' | 'up' | 'out' | 'hover' | 'back' | 'down' | 'cool';

interface Heli {
  root: THREE.Group;
  /** caisse, inclinée en vol (nez qui pique, virage) */
  hull: THREE.Group;
  /** rotor principal (ou les quatre soufflantes carénées du drone futuriste) ; rotor de queue (aucun pour le drone) */
  rotors: THREE.Mesh[];
  tail: THREE.Mesh | null;
  phase: Phase;
  t: number;
  /** vitesse des pales (radians par seconde) */
  rpm: number;
  heading: number;
  /** où il va (en monde), et l'héliport (en monde) */
  goal: THREE.Vector3;
  pad: THREE.Vector3;
  pos: THREE.Vector3;
  bank: number;
  /** pas d'aire où se poser : il attend en vol stationnaire, soufflantes lancées */
  aloft: boolean;
}

/** Livrées : sanitaire (blanc à bandeau et croix rouges), héliport (jaune à bandeau bleu nuit, rouge à bandeau blanc) */
const LIVERIES: { body: number; band: number; cross: boolean }[] = [
  { body: 0xf4f2ee, band: 0xd84a3e, cross: true }, { body: 0xf2c23a, band: 0x22305a, cross: false }, { body: 0xd84a3e, band: 0xf4f2ee, cross: false },
];

/**
 * Une coque de révolution le long de z, tirée d'un profil (rayon, z) rangé de l'arrière vers l'avant : la tranche entre z0 et
 * z1 (rayon × k), en `segs` fuseaux depuis l'angle `phi` sur `len` (0 : le ventre, π/2 : le flanc +x, π : le dos)
 */
export function loft(prof: [number, number][], z0: number, z1: number, k = 1, phi = 0, len = Math.PI * 2, segs = 12) {
  const at = (z: number) => {
    for (let i = 0; i + 1 < prof.length; i++) {
      const [r0, a] = prof[i], [r1, b] = prof[i + 1];
      if (z >= a && z <= b) return r0 + ((r1 - r0) * (z - a)) / (b - a);
    }
    return 0;
  };
  const pts = prof.filter(([, z]) => z > z0 + 1e-6 && z < z1 - 1e-6).map(([r, z]) => new THREE.Vector2(r * k, z));
  pts.unshift(new THREE.Vector2(at(z0) * k, z0)); pts.push(new THREE.Vector2(at(z1) * k, z1));
  return new THREE.LatheGeometry(pts, segs, phi, len).rotateX(Math.PI / 2);
}

/** Une pièce plate tirée d'un contour (z, y), épaisse de `t` le long de x */
export function plate(pts: [number, number][], t: number) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y))), { depth: t, bevelEnabled: false });
  return g.translate(0, 0, -t / 2).rotateY(-Math.PI / 2);
}

/** Profil de la cabine (rayon, z), de l'arrière au nez ; son axe à HY, aplatie en largeur (SX) et en hauteur (SY) */
const CABIN: [number, number][] = [[0.03, -0.15], [0.048, -0.135], [0.066, -0.1], [0.078, -0.05], [0.082, 0.02], [0.08, 0.08], [0.072, 0.125], [0.055, 0.155], [0.03, 0.172], [0, 0.178]];
const HY = 0.105, SX = 0.82, SY = 0.9;
/** Où se posent les pales : le rotor principal sur son mât, le rotor de queue au flanc de la dérive */
const ROTOR_AT: [number, number, number] = [0, 0.214, 0.01], TAIL_AT: [number, number, number] = [0.016, 0.155, -0.35];

/**
 * Hélicoptère, tourné vers +z : cabine profilée à deux tons (bandeau de la livrée sous la ceinture), verrière enveloppante et
 * vitres latérales, porte coulissante, capot moteur à prises d'air et tuyères, mât et plateau cyclique, poutre de queue
 * effilée, dérive et sa quille, plan fixe à dérives d'extrémité, patins relevés à l'avant ; projecteur sous le nez, feux de
 * position et feu anticollision. Le sanitaire a ses croix rouges et son treuil de secours
 */
function heliGeo(livery = 0) {
  const p = new Parts(), { body, band, cross } = LIVERIES[livery];
  const glass = 0x2e4a5e, steel = 0x5d6878, grey = 0x8a8f96, hull = (g: THREE.BufferGeometry) => g.scale(SX, SY, 1).translate(0, HY, 0);
  // la cabine : le dessus à la couleur, le ventre au bandeau, la verrière qui enveloppe le nez, les vitres des flancs
  p.add(hull(loft(CABIN, -0.15, 0.075, 1, Math.PI * 0.36, Math.PI * 1.28)), 0, 0, 0, body);
  p.add(hull(loft(CABIN, 0.075, 0.178, 1, Math.PI * 0.36, Math.PI * 1.28)), 0, 0, 0, glass);
  p.add(hull(loft(CABIN, -0.15, 0.178, 1, -Math.PI * 0.36, Math.PI * 0.72, 6)), 0, 0, 0, band);
  for (const [a, b] of [[0.58, 0.8], [1.2, 1.42]]) p.add(hull(loft(CABIN, -0.02, 0.06, 1.03, Math.PI * a, Math.PI * (b - a), 2)), 0, 0, 0, glass);
  p.add(hull(loft(CABIN, 0.07, 0.08, 1.035, Math.PI * 0.36, Math.PI * 1.28)), 0, 0, 0, dark(body, 0.8));
  p.add(hull(loft(CABIN, 0.075, 0.178, 1.02, Math.PI - 0.03, 0.06, 1)), 0, 0, 0, dark(body, 0.8));
  for (const s of [-1, 1]) {
    // la porte coulissante : son contour, sa poignée, son rail ; le marchepied
    const x = s * 0.082 * SX;
    for (const z of [-0.07, 0.065]) p.box(0.003, 0.09, 0.004, x, HY - 0.05, z, dark(body, 0.65));
    p.box(0.003, 0.004, 0.13, x, HY + 0.034, -0.003, dark(body, 0.65));
    p.box(0.005, 0.006, 0.014, x + s * 0.002, HY, -0.055, grey);
    p.box(0.012, 0.005, 0.07, s * 0.07, 0.03, 0.0, steel);
    if (cross) { p.box(0.004, 0.04, 0.014, x + s * 0.001, HY - 0.016, -0.1, 0xd84a3e); p.box(0.004, 0.014, 0.04, x + s * 0.001, HY - 0.003, -0.1, 0xd84a3e); }
  }
  // le capot moteur, ses prises d'air et ses deux tuyères, le mât et le plateau cyclique
  p.add(hull(loft([[0.03, -0.13], [0.05, -0.1], [0.052, 0.02], [0.03, 0.06]], -0.13, 0.06, 1, Math.PI * 0.55, Math.PI * 0.9, 6)).translate(0, 0.045, 0), 0, 0, 0, body);
  p.box(0.07, 0.03, 0.12, 0, 0.15, -0.04, body);
  for (const s of [-1, 1]) {
    p.box(0.004, 0.016, 0.03, s * 0.036, 0.162, 0.0, 0x26262a);
    for (let k = 0; k < 3; k++) p.box(0.005, 0.002, 0.03, s * 0.0365, 0.157 + k * 0.005, 0.0, grey);
    p.add(new THREE.CylinderGeometry(0.008, 0.011, 0.03, 6).rotateX(-Math.PI / 2 - 0.3), s * 0.024, 0.172, -0.105, 0x3c3c40);
  }
  p.cyl(0.013, 0.016, 0.03, 6, 0, 0.18, 0.01, grey);
  p.cyl(0.02, 0.02, 0.006, 8, 0, 0.196, 0.01, 0x3c3c40);
  // la poutre de queue effilée, la dérive et sa quille, le plan fixe et ses dérives d'extrémité
  p.add(new THREE.CylinderGeometry(0.026, 0.012, 0.22, 8).rotateX(Math.PI / 2), 0, 0.122, -0.245, body);
  p.add(new THREE.CylinderGeometry(0.0265, 0.02, 0.06, 8, 1, true).rotateX(Math.PI / 2), 0, 0.122, -0.17, band);
  p.add(plate([[-0.31, 0.11], [-0.355, 0.11], [-0.375, 0.205], [-0.35, 0.205], [-0.322, 0.14]], 0.012), 0, 0, 0, band);
  p.add(plate([[-0.32, 0.12], [-0.35, 0.12], [-0.36, 0.075], [-0.342, 0.075]], 0.01), 0, 0, 0, body);
  p.box(0.13, 0.006, 0.034, 0, 0.12, -0.27, body);
  for (const s of [-1, 1]) p.box(0.005, 0.03, 0.03, s * 0.066, 0.112, -0.272, band);
  p.cyl(0.006, 0.006, 0.012, 6, 0.006, TAIL_AT[1] - 0.006, TAIL_AT[2], grey);
  // les patins, relevés à l'avant, et leurs traverses cintrées jusqu'au ventre
  for (const s of [-1, 1]) {
    p.box(0.009, 0.008, 0.22, s * 0.06, 0, -0.01, steel);
    p.add(new THREE.BoxGeometry(0.009, 0.008, 0.04), s * 0.06, 0.012, 0.11, steel, 0, false, 0, -0.6);
    for (const z of [-0.07, 0.06]) {
      p.add(new THREE.BoxGeometry(0.007, 0.05, 0.007), s * 0.053, 0.026, z, steel, 0, false, s * 0.3);
      p.box(0.06, 0.007, 0.007, s * 0.022, 0.048, z, steel);
    }
  }
  // le projecteur sous le nez, l'antenne, le treuil du sanitaire
  p.box(0.022, 0.012, 0.016, 0, 0.034, 0.12, 0x3c3c40);
  p.box(0.016, 0.008, 0.004, 0, 0.036, 0.129, 0xfff1c9, 0, true);
  p.cyl(0.0015, 0.0015, 0.04, 3, -0.02, 0.17, -0.12, 0x26262a);
  if (cross) {
    p.box(0.05, 0.008, 0.008, 0.075, HY + 0.05, 0.04, grey);
    p.cyl(0.01, 0.01, 0.016, 6, 0.098, HY + 0.04, 0.04, 0xd84a3e);
    p.cyl(0.001, 0.001, 0.05, 3, 0.098, HY - 0.01, 0.04, 0x26262a);
  }
  // feux de position : rouge à bâbord, vert à tribord, blanc à la queue ; le feu anticollision rouge sur la dérive
  p.box(0.01, 0.01, 0.012, 0.068, 0.12, 0.06, 0xff4a3a, 0, true);
  p.box(0.01, 0.01, 0.012, -0.068, 0.12, 0.06, 0x3aff7a, 0, true);
  p.box(0.008, 0.008, 0.008, 0, 0.13, -0.385, 0xfff4e0, 0, true);
  p.box(0.01, 0.01, 0.014, 0, 0.205, -0.37, 0xff3a2a, 0, true);
  return p.build(false);
}

/** Pales du rotor principal (quatre, extrémités peintes) et moyeu à bielles, centrées sur l'axe */
function rotorGeo() {
  const p = new Parts();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    p.add(new THREE.BoxGeometry(0.24, 0.004, 0.02).translate(0.14, 0, 0), 0, 0, 0, 0x3c3c40, a, false, 0, 0.05);
    p.add(new THREE.BoxGeometry(0.02, 0.0045, 0.0205).translate(0.25, 0, 0), 0, 0, 0, 0xf2c23a, a, false, 0, 0.05);
    p.add(new THREE.BoxGeometry(0.03, 0.006, 0.01).translate(0.025, 0, 0), 0, 0, 0, 0x8a8f96, a);
  }
  p.cyl(0.016, 0.014, 0.014, 8, 0, -0.007, 0, 0x5d6878);
  p.cone(0.01, 0.014, 6, 0, 0.007, 0, 0x8a8f96);
  return p.build(false).body;
}

/** Rotor de queue (deux pales), dans le plan vertical, et son moyeu */
function tailGeo() {
  const p = new Parts();
  for (let k = 0; k < 2; k++) p.add(new THREE.BoxGeometry(0.004, 0.09, 0.012), 0, 0, 0, 0x3c3c40, 0, false, 0, (k * Math.PI) / 2);
  p.add(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 6).rotateZ(Math.PI / 2), 0, 0, 0, 0x8a8f96);
  return p.build(false).body;
}

/** Les soufflantes du drone futuriste (x, z dans le repère de la caisse), bien dégagées de la cabine ; leur hauteur, leur carène */
const FANS: [number, number][] = [[-0.17, 0.13], [0.17, 0.13], [-0.17, -0.12], [0.17, -0.12]];
const FAN_Y = 0.13, DUCT = 0.062;

/**
 * Drone sanitaire de l'âge futuriste, tourné vers +z : cabine blanche effilée à verrière fumée qui coiffe le nez, dérive à
 * l'arrière, bandeaux et croix vertes lumineuses ; quatre bras chromés portant chacun sa carène profonde (les soufflantes à
 * part), bien à l'écart de la cabine ; sous le ventre, la civière suspendue (brancards orange, blessé sous sa couverture) entre
 * les deux patins ; feux de position au bord des carènes, projecteur sous le nez, antenne
 */
function droneGeo() {
  const p = new Parts(), WHITE = 0xf2f4f6, CHROME = 0xc8d0da, NEON = 0x3aff9a, DARK = 0x3a4250, Y = 0.105;
  // la cabine : un fuseau blanc, la verrière fumée sur le nez, la dérive
  p.add(new THREE.SphereGeometry(0.058, 14, 8).scale(1, 0.85, 2.1), 0, Y, -0.01, WHITE);
  p.add(new THREE.SphereGeometry(0.047, 12, 8).scale(1, 0.78, 1.45), 0, Y + 0.012, 0.05, 0x24384c);
  p.box(0.006, 0.05, 0.05, 0, Y + 0.02, -0.12, WHITE);
  p.box(0.008, 0.008, 0.03, 0, Y + 0.068, -0.13, NEON, 0, 'neon');
  // le bandeau lumineux qui fait le tour de la cabine, croix vertes sur les flancs et sur le dos
  p.add(new THREE.TorusGeometry(0.054, 0.003, 3, 28).rotateX(Math.PI / 2).scale(1, 1, 2.1), 0, Y - 0.018, -0.01, NEON, 0, 'neon');
  for (const s of [-1, 1]) {
    p.box(0.004, 0.032, 0.011, s * 0.054, Y - 0.008, -0.06, 0x2a9a5a); p.box(0.004, 0.011, 0.032, s * 0.054, Y + 0.003, -0.06, 0x2a9a5a);
  }
  p.box(0.011, 0.004, 0.034, 0, Y + 0.044, -0.06, NEON, 0, 'neon'); p.box(0.034, 0.004, 0.011, 0, Y + 0.044, -0.06, NEON, 0, 'neon');
  // bras chromés (du dos de la cabine aux moyeux), carènes profondes à liseré lumineux, moteurs
  for (const [x, z] of FANS) {
    const len = Math.hypot(x, z);
    p.add(new THREE.BoxGeometry(0.014, 0.01, len - DUCT).translate(0, 0, (len - DUCT) / 2), 0, FAN_Y - 0.004, 0, CHROME, Math.atan2(x, z));
    p.add(new THREE.TorusGeometry(DUCT, 0.008, 6, 22).rotateX(Math.PI / 2).scale(1, 2.2, 1), x, FAN_Y, z, 0xe4e8ee);
    p.add(new THREE.TorusGeometry(DUCT, 0.003, 3, 20).rotateX(Math.PI / 2), x, FAN_Y - 0.021, z, 0x9ff8ff, 0, 'neon');
    // les croisillons qui tiennent le moteur au milieu de la carène
    for (const a of [0, Math.PI / 2]) p.add(new THREE.BoxGeometry(DUCT * 2, 0.004, 0.006), x, FAN_Y - 0.012, z, DARK, a + Math.PI / 4);
    p.cyl(0.013, 0.015, 0.022, 8, x, FAN_Y - 0.02, z, 0x5a6270);
  }
  // la civière suspendue sous le ventre : sangles, brancards orange, toile blanche, le blessé sous sa couverture
  const sy = 0.028;
  for (const s of [-1, 1]) {
    p.box(0.005, 0.007, 0.17, s * 0.029, sy, -0.01, 0xf08a2a);
    for (const z of [-0.07, 0.05]) p.box(0.003, Y - 0.045 - sy, 0.003, s * 0.026, sy + 0.006, z, 0x2a2a2e);
  }
  p.box(0.054, 0.004, 0.16, 0, sy + 0.002, -0.01, 0xf4f4f0);
  p.box(0.042, 0.012, 0.1, 0, sy + 0.006, -0.03, 0x3a6ab8);
  p.sphere(0.011, 0, sy + 0.014, 0.045, 0xe8b894, 1);
  p.box(0.03, 0.006, 0.022, 0, sy + 0.006, 0.045, 0xf4f4f0);
  // patins de part et d'autre de la civière, et leurs jambes jusqu'au ventre
  for (const s of [-1, 1]) {
    p.box(0.008, 0.008, 0.22, s * 0.062, 0, -0.01, 0x5d6878);
    for (const z of [-0.07, 0.06]) p.add(new THREE.BoxGeometry(0.006, 0.075, 0.006).translate(0, 0.0375, 0), s * 0.062, 0.004, z, 0x5d6878, 0, false, s * 0.32);
  }
  // projecteur sous le nez, antenne, feux de position (rouge à bâbord, vert à tribord, blanc à la dérive)
  p.box(0.026, 0.01, 0.012, 0, Y - 0.05, 0.085, 0xfff1c9, 0, true);
  p.cyl(0.0015, 0.0015, 0.06, 4, 0.018, Y + 0.035, -0.085, 0x2a2a2e);
  p.box(0.012, 0.012, 0.012, 0.17 + DUCT + 0.012, FAN_Y - 0.01, 0.13, 0xff4a3a, 0, true);
  p.box(0.012, 0.012, 0.012, -0.17 - DUCT - 0.012, FAN_Y - 0.01, 0.13, 0x3aff7a, 0, true);
  p.box(0.01, 0.01, 0.01, 0, Y + 0.07, -0.145, 0xfff4e0, 0, true);
  return p.build(false);
}

/** Soufflante (cinq pales vrillées et moyeu) dans sa carène, centrée sur l'axe */
function fanGeo() {
  const p = new Parts();
  for (let k = 0; k < 5; k++) p.add(new THREE.BoxGeometry(DUCT - 0.012, 0.003, 0.016).translate((DUCT - 0.012) / 2 + 0.006, 0, 0), 0, 0, 0, 0x5a6270, (k * Math.PI * 2) / 5, false, 0, 0.3);
  p.cyl(0.012, 0.009, 0.012, 8, 0, -0.006, 0, 0xc8d0da);
  return p.build(false).body;
}

/**
 * Hélicoptères des centres hospitaliers (époque moderne) : chacun attend sur l'héliport du toit, pales à l'arrêt, puis
 * lance son rotor, décolle, part en vol vers un coin du village, s'y tient en vol stationnaire, revient, se pose et coupe le
 * moteur ; le nez pique en avançant, la caisse se couche dans les virages ; feux de position la nuit
 */
export class Helis {
  group = new THREE.Group();
  private helis = new Map<string, Heli>();
  private geos = [heliGeo(0), heliGeo(1), heliGeo(2)];
  private rotorG = rotorGeo();
  private tailG = tailGeo();
  private droneG = droneGeo();
  private fanG = fanGeo();
  private v = new THREE.Vector3();
  private clock = 0;

  /** l'usine automobile est bâtie */
  motor = false;

  constructor(private world: World, private buildings: BuildingView) {}

  private make(id: number, livery = 0, future = false): Heli {
    const root = new THREE.Group(), hull = new THREE.Group(), geo = future ? this.droneG : this.geos[livery];
    root.add(hull);
    const body = new THREE.Mesh(geo.body, mats.body);
    body.castShadow = true;
    hull.add(body);
    if (geo.glow) hull.add(new THREE.Mesh(geo.glow, mats.glow));
    let rotors: THREE.Mesh[], tail: THREE.Mesh | null = null;
    if (future) {
      // les quatre soufflantes, chacune dans sa carène
      rotors = FANS.map(([x, z]) => { const m = new THREE.Mesh(this.fanG, mats.body); m.position.set(x, FAN_Y, z); hull.add(m); return m; });
    } else {
      const rotor = new THREE.Mesh(this.rotorG, mats.body);
      tail = new THREE.Mesh(this.tailG, mats.body);
      rotor.position.set(...ROTOR_AT);
      tail.position.set(...TAIL_AT);
      rotor.castShadow = true;
      hull.add(rotor, tail);
      rotors = [rotor];
    }
    // un peu plus gros que les voitures, à la taille de l'héliport
    root.scale.setScalar(1.15);
    this.group.add(root);
    // chaque hôpital à son rythme : on ne part pas tous en même temps
    return { root, hull, rotors, tail, phase: 'parked', t: 8 + (id % 7) * 6, rpm: 0, heading: 0, goal: new THREE.Vector3(), pad: new THREE.Vector3(), pos: new THREE.Vector3(), bank: 0, aloft: false };
  }

  update(dt: number, age: number) {
    const w = this.world, live = new Set<string>();
    this.clock += dt;
    for (const b of w.buildings.values()) {
      // l'hélicoptère sanitaire du centre hospitalier ; les deux de l'héliport, à leurs couleurs
      const pads = b.kind === 'health' && !b.small ? [b.age >= 5 ? FUTURE_PAD : PAD] : b.kind === 'heliport' ? HELIPADS.map((q) => new THREE.Vector3(...q)) : null;
      // pas d'hélicoptère tant que l'usine automobile n'est pas bâtie (aucun moteur avant elle)
      if (!pads || b.age < 4 || age < 4 || !this.motor) continue;
      const g = this.buildings.entries.get(b.id)?.group;
      if (!g) continue;
      g.updateMatrixWorld();
      pads.forEach((pad, i) => {
        // à l'âge futuriste, le drone sanitaire et les drones de l'héliport remplacent les hélicoptères
        const future = age >= 5, key = `${b.id}:${i}:${+future}`;
        live.add(key);
        let h = this.helis.get(key);
        if (!h) { h = this.make(b.id + i * 5, b.kind === 'heliport' ? 1 + i : 0, future); h.heading = g.rotation.y + (i ? 0.6 : -0.4); this.helis.set(key, h); }
        h.pad.copy(pad).applyMatrix4(g.matrixWorld);
        h.aloft = pad === FUTURE_PAD;
        if (h.phase === 'parked') h.pos.copy(h.pad);
        this.step(h, dt);
      });
    }
    for (const [id, h] of this.helis) if (!live.has(id)) { this.group.remove(h.root); this.helis.delete(id); }
  }

  private step(h: Heli, dt: number) {
    const w = this.world;
    h.t -= dt;
    const fly = (to: THREE.Vector3, speed: number) => {
      const d = this.v.subVectors(to, h.pos), len = Math.hypot(d.x, d.z);
      if (len > 0.05) {
        const want = Math.atan2(d.x, d.z);
        let da = want - h.heading;
        da = wrapAngle(da);
        const turnRate = Math.max(-1.6, Math.min(1.6, da * 2));
        h.heading += turnRate * dt;
        h.bank += (-turnRate * 0.22 - h.bank) * Math.min(1, dt * 3);
        const go = Math.min(len, speed * dt * Math.max(0.2, Math.cos(da)));
        h.pos.x += Math.sin(h.heading) * go;
        h.pos.z += Math.cos(h.heading) * go;
      } else h.bank *= 1 - Math.min(1, dt * 3);
      // jamais trop près du sol en route
      const floor = w.surfaceAt(h.pos.x, h.pos.z) + 1.4;
      h.pos.y += (Math.max(to.y, floor) - h.pos.y) * Math.min(1, dt * 1.5);
      return len;
    };
    switch (h.phase) {
      case 'parked':
        // en vol stationnaire (pas d'aire libre) : soufflantes lancées, il se balance un peu
        if (h.aloft) { h.rpm = Math.min(ROTOR, h.rpm + dt * (ROTOR / 3)); h.pos.y += Math.sin(this.clock * 1.7 + h.pad.x) * 0.015; h.heading += dt * 0.15; }
        else h.rpm = Math.max(0, h.rpm - dt * 6);
        if (h.t <= 0) { h.phase = h.aloft ? 'up' : 'spin'; h.t = 3; }
        break;
      case 'spin':
        h.rpm = Math.min(ROTOR, h.rpm + dt * (ROTOR / 3));
        h.pos.copy(h.pad);
        if (h.t <= 0) { h.phase = 'up'; h.t = 3; }
        break;
      case 'up':
        h.pos.y = h.pad.y + CRUISE * (1 - Math.max(0, h.t) / 3) ** 1.5;
        if (h.t <= 0) {
          // un coin du village, à quelques cases : un tour au-dessus des toits
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 8;
          h.goal.set(h.pad.x + Math.sin(a) * r, h.pad.y + CRUISE + Math.random() * 0.6, h.pad.z + Math.cos(a) * r);
          h.phase = 'out';
        }
        break;
      case 'out':
        if (fly(h.goal, SPEED) < 0.2) { h.phase = 'hover'; h.t = 2.5 + Math.random() * 3; }
        break;
      case 'hover':
        h.heading += dt * 0.25;
        h.bank *= 1 - Math.min(1, dt * 3);
        h.pos.y += Math.sin(h.t * 2) * 0.002;
        if (h.t <= 0) { h.phase = 'back'; h.goal.set(h.pad.x, h.pad.y + CRUISE, h.pad.z); }
        break;
      case 'back':
        if (fly(h.goal, SPEED) < 0.08) { h.phase = 'down'; h.t = 3.5; }
        break;
      case 'down':
        h.pos.x += (h.pad.x - h.pos.x) * Math.min(1, dt * 2);
        h.pos.z += (h.pad.z - h.pos.z) * Math.min(1, dt * 2);
        h.pos.y = h.pad.y + CRUISE * (Math.max(0, h.t) / 3.5) ** 1.5;
        h.bank *= 1 - Math.min(1, dt * 3);
        if (h.t <= 0) { h.pos.copy(h.pad); h.phase = 'cool'; h.t = 4; }
        break;
      case 'cool':
        if (!h.aloft) h.rpm = Math.max(0, h.rpm - dt * (ROTOR / 4));
        if (h.t <= 0) { h.phase = 'parked'; h.t = 25 + Math.random() * 40; }
        break;
    }
    const moving = h.phase === 'out' || h.phase === 'back';
    h.root.position.copy(h.pos);
    h.root.rotation.y = h.heading;
    h.hull.rotation.set(moving ? 0.12 : 0, 0, h.bank);
    h.rotors.forEach((r, i) => { r.rotation.y += h.rpm * dt * (i % 2 ? -1 : 1); });
    if (h.tail) h.tail.rotation.x += h.rpm * 1.6 * dt;
  }
}
