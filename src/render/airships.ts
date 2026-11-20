import * as THREE from 'three';
import { TEAM_A, TEAM_EMBLEM } from './teamPaint';
import { wrapAngle } from '../core/rng';
import { World, N } from '../world/world';
import { Building } from '../build/catalog';
import { Parts, Glow } from './parts';
import { mats } from './materials';
import { wind } from './wind';
import { balloonEnvelopeGeo, balloonBasketGeo } from './balloon';

/** Mât d'amarrage et aire des montgolfières dans le repère de l'aérodrome (centre de l'emprise, façade vers +z) */
const MAST = new THREE.Vector3(0.95, 1.05, -0.95), PAD = new THREE.Vector2(0.75, 0.05);
/** Rayon et hauteur du tour du dirigeable au-dessus de la région, sa vitesse (cases par seconde) */
const ORBIT = 11, ALT = 3.2, SHIP_SPEED = 1.1;

type ShipPhase = 'moored' | 'out' | 'back';
type BalloonPhase = 'ground' | 'inflate' | 'rise' | 'drift' | 'fall' | 'deflate';

interface Ship { root: THREE.Group; props: THREE.Mesh[]; phase: ShipPhase; t: number; pos: THREE.Vector3; heading: number; ang: number }
interface Balloon { root: THREE.Group; env: THREE.Mesh; flame: THREE.Mesh; phase: BalloonPhase; t: number; pos: THREE.Vector3; pad: THREE.Vector3; alt: number; seed: number }
interface Field { b: Building; ship: Ship; balloons: Balloon[] }

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

/** Profil de l'enveloppe (rayon, position le long de l'axe), de la queue (z = -0,96) au nez (z = +0,965) */
const HULL: [number, number][] = [
  [0, -0.96], [0.05, -0.93], [0.11, -0.86], [0.17, -0.74], [0.225, -0.56], [0.27, -0.32], [0.295, -0.08], [0.3, 0.12],
  [0.293, 0.36], [0.272, 0.56], [0.235, 0.72], [0.18, 0.84], [0.11, 0.92], [0.045, 0.955], [0, 0.965],
];
/** Rayon de l'enveloppe à la position z */
function hullR(z: number) {
  for (let i = 0; i + 1 < HULL.length; i++) {
    const [r0, a] = HULL[i], [r1, b] = HULL[i + 1];
    if (z >= a && z <= b) return r0 + ((r1 - r0) * (z - a)) / (b - a);
  }
  return 0;
}
/**
 * Une tranche de l'enveloppe entre z0 et z1 (rayon × k), en `segs` fuseaux depuis l'angle `phi` sur `len` ; l'axe le long de
 * z. L'angle 0 est le ventre, π/2 le flanc +x, π le dos
 */
function hullSlice(z0: number, z1: number, k = 1, phi = 0, len = Math.PI * 2, segs = 16) {
  const pts = HULL.filter(([, z]) => z > z0 + 1e-6 && z < z1 - 1e-6).map(([r, z]) => new THREE.Vector2(r * k, z));
  pts.unshift(new THREE.Vector2(hullR(z0) * k, z0)); pts.push(new THREE.Vector2(hullR(z1) * k, z1));
  return new THREE.LatheGeometry(pts, segs, phi, len).rotateX(Math.PI / 2);
}
/** Le point de la surface au flanc (côté s), à la hauteur y et à la position z */
const flank = (s: number, y: number, z: number) => s * Math.sqrt(Math.max(0, hullR(z) ** 2 - y * y));
/** Une plaque collée au flanc (côté s), centrée en (y, z), couchée sur la courbe de l'enveloppe */
function onFlank(p: Parts, s: number, y: number, z: number, w: number, h: number, l: number, color: number, glow: Glow = false) {
  p.add(new THREE.BoxGeometry(w, h, l), flank(s, y, z) + s * w * 0.3, y, z, color, 0, glow, s * Math.asin(Math.min(1, y / hullR(z))));
}

/**
 * Le nom « CEIONIA » en traits sur le flanc (côté s), centré en (y, zc) : jambages (gauche, milieu, droite), barres (haut,
 * milieu, bas) et la diagonale du N ; il se lit du nez vers la queue
 */
function nameOn(p: Parts, s: number, y: number, zc: number, ink: number) {
  const d = -s;
  ['lhb', 'lhmb', 'c', 'lrhb', 'lrn', 'c', 'lrhm'].forEach((g, i) => {
    const z = zc + d * (i - 3) * 0.05;
    for (const [k, u] of [['l', -1], ['c', 0], ['r', 1]] as [string, number][]) if (g.includes(k)) onFlank(p, s, y, z + d * u * 0.012, 0.006, 0.046, 0.007, ink);
    for (const [k, v] of [['h', 0.02], ['m', 0], ['b', -0.02]] as [string, number][]) if (g.includes(k)) onFlank(p, s, y + v, z, 0.006, 0.007, 0.03, ink);
    if (g.includes('n')) p.add(new THREE.BoxGeometry(0.006, 0.05, 0.007), flank(s, y, z), y, z, ink, 0, false, s * Math.asin(y / hullR(z)), -d * 0.5);
  });
}

/** Empennage : un plan fixe et sa gouverne d'une autre couleur, tournés de `rz` autour de l'axe */
function fin(p: Parts, rz: number, color: number, trim: number, span: number) {
  const blade = (pts: [number, number][], c: number) => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, v]) => new THREE.Vector2(z, v))), { depth: 0.014, bevelEnabled: false });
    p.add(g.translate(0, 0, -0.007).rotateY(-Math.PI / 2), 0, 0, 0, c, 0, false, rz);
  };
  blade([[-0.86, hullR(-0.86) - 0.01], [-0.48, hullR(-0.48) - 0.01], [-0.77, span], [-0.86, span]], color);
  blade([[-0.95, 0.04], [-0.865, hullR(-0.865) - 0.01], [-0.865, span], [-0.93, span - 0.03]], trim);
  // le longeron du bord d'attaque, plus sombre
  const a = [-0.48, hullR(-0.48)], b = [-0.77, span], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  p.add(new THREE.BoxGeometry(0.018, len, 0.01).rotateX(Math.atan2(b[0] - a[0], b[1] - a[1])).translate(0, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2), 0, 0, 0, dark(color, 0.7), 0, false, rz);
}

/** Une nacelle moteur fuselée (axe le long de z) à (x, y, z), ses entretoises jusqu'à l'enveloppe ; l'hélice tourne à part, derrière */
function engineCar(p: Parts, x: number, y: number, z: number, body: number, strut: number) {
  const s = Math.sign(x);
  p.add(new THREE.CapsuleGeometry(0.034, 0.08, 3, 8).rotateX(Math.PI / 2), x, y, z, body);
  p.add(new THREE.CylinderGeometry(0.03, 0.036, 0.02, 8).rotateX(Math.PI / 2), x, y, z + 0.075, dark(body, 0.7));
  for (let k = 0; k < 3; k++) p.box(0.004, 0.004, 0.05, x + s * 0.033, y - 0.014 + k * 0.012, z, dark(body, 0.6));
  p.box(0.004, 0.016, 0.018, x + s * 0.034, y + 0.008, z + 0.035, 0xfff1c9, 0, true);
  const dx = -s * 0.1, dy = 0.11, len = Math.hypot(dx, dy);
  for (const dz of [-0.03, 0.03]) p.add(new THREE.BoxGeometry(0.008, len, 0.008), x + dx / 2, y + dy / 2, z + dz, strut, 0, false, -Math.atan2(dx, dy));
}

/** Les hélices tournent à part : leur place (repère du dirigeable) à chaque époque */
const PROPS: Record<'classic' | 'modern', [number, number, number][]> = {
  classic: [[0.2, -0.27, -0.33], [-0.2, -0.27, -0.33], [0.28, -0.2, 0.1], [-0.28, -0.2, 0.1]],
  modern: [[0.14, -0.36, -0.12], [-0.14, -0.36, -0.12]],
};

/**
 * Dirigeable, nez vers +z. Argenté à l'âge industriel, à la façon des grands zeppelins : enveloppe facettée à fuseaux de deux
 * tons et ses couples, cône d'amarrage au nez, empennage en croix (plans rouges, gouvernes argentées), le nom en lettres
 * sombres et la cocarde, une nacelle de commandement vitrée sous l'avant, la cabine des passagers logée sous le ventre
 * (fenêtres qui luisent le soir), quatre nacelles moteur sur leurs entretoises. À l'époque moderne, le ballon souple blanc à
 * bandeau bleu liseré d'or, nez bleu nuit à baleines, empennage en X, panneau lumineux sur les flancs, la nacelle profilée aux
 * vitres teintées et sa roue, deux hélices carénées sur pylônes. Feux de position aux deux époques
 */
function shipGeo(modern: boolean) {
  const p = new Parts();
  if (!modern) {
    const skin = 0xc8ccd2, skin2 = 0xb8bdc4, frame = 0x9aa0a8, red = 0xd84a3e, wood = 0x5a4a3a;
    // l'enveloppe : fuseaux de deux tons, couples, le cône d'amarrage et sa pointe
    for (let k = 0; k < 16; k++) p.add(hullSlice(-0.96, 0.965, 1, (k * Math.PI) / 8, Math.PI / 8, 1), 0, 0, 0, k % 2 ? skin : skin2);
    for (let k = -3; k <= 3; k++) { const z = k * 0.26, r = hullR(z); if (r > 0.1) p.add(new THREE.TorusGeometry(r + 0.002, 0.006, 3, 16).translate(0, 0, z), 0, 0, 0, frame); }
    p.add(hullSlice(0.9, 0.965, 1.02), 0, 0, 0, 0x6a6f78);
    p.add(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 5).rotateX(Math.PI / 2), 0, 0, 0.98, 0x3c3c40);
    // empennage en croix : plans rouges, gouvernes argentées
    for (let k = 0; k < 4; k++) fin(p, (k * Math.PI) / 2, red, frame, k % 2 ? 0.36 : 0.4);
    // le nom en lettres sombres sur les deux flancs, la cocarde du village
    for (const s of [-1, 1]) {
      nameOn(p, s, 0.06, 0.36, 0x2a2e36);
      onFlank(p, s, 0.012, 0.3, 0.006, 0.008, 0.5, red);
      p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 12).rotateZ(Math.PI / 2), flank(s, 0.06, -0.45), 0.06, -0.45, TEAM_EMBLEM, 0, false, s * 0.21);
    }
    // la nacelle de commandement : coque à nez arrondi, rang de vitres, verrière du nez, carénage, guide-rope et sa boule
    const gy = -0.36, gz = 0.42;
    p.box(0.1, 0.07, 0.2, 0, gy, gz, wood);
    p.add(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 10, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.035, 0), 0, gy, gz + 0.1, wood);
    p.add(new THREE.CylinderGeometry(0.052, 0.052, 0.026, 10, 1, true, -Math.PI / 2 + 0.25, Math.PI - 0.5).translate(0, 0.013, 0), 0, gy + 0.032, gz + 0.1, 0x86c4d8);
    p.box(0.08, 0.05, 0.18, 0, gy + 0.06, gz - 0.01, skin2);
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) p.box(0.004, 0.026, 0.026, s * 0.051, gy + 0.03, gz - 0.08 + k * 0.036, 0xfff1c9, 0, true);
    p.box(0.104, 0.008, 0.204, 0, gy - 0.004, gz, 0x3c3c40);
    p.cyl(0.003, 0.003, 0.05, 4, 0, gy - 0.05, gz - 0.06, 0x3c3c40); p.sphere(0.012, 0, gy - 0.055, gz - 0.06, 0x3c3c40);
    // la cabine des passagers sous le ventre : flancs à fenêtres, liseré, porte
    p.box(0.13, 0.055, 0.3, 0, -0.335, 0.02, skin2);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 7; k++) p.box(0.004, 0.022, 0.026, s * 0.066, -0.318, -0.1 + k * 0.038, 0xfff1c9, 0, true);
      p.box(0.006, 0.006, 0.3, s * 0.066, -0.33, 0.02, frame);
    }
    p.box(0.004, 0.044, 0.03, 0.067, -0.333, -0.14, wood);
    // quatre nacelles moteur sur leurs entretoises (les hélices tournent à part, derrière elles)
    for (const [x, y, z] of PROPS.classic) engineCar(p, x, y, z + 0.085, skin2, frame);
    // feux de position : rouge à bâbord, vert à tribord, blanc à la queue
    p.box(0.014, 0.014, 0.014, hullR(0.5) + 0.002, -0.007, 0.5, 0xff4a3a, 0, true);
    p.box(0.014, 0.014, 0.014, -hullR(0.5) - 0.002, -0.007, 0.5, 0x3aff7a, 0, true);
    p.box(0.012, 0.012, 0.012, 0, 0.4, -0.86, 0xfff4e0, 0, true);
    return p.build(false);
  }
  const white = 0xf4f2ee, white2 = 0xe6e4de, blue = TEAM_A, navy = 0x22305a, gold = 0xf2c23a;
  // l'enveloppe souple : fuseaux blancs, bandeau bleu liseré d'or sous l'équateur, le nez bleu nuit et ses baleines
  for (let k = 0; k < 16; k++) p.add(hullSlice(-0.96, 0.965, 1, (k * Math.PI) / 8, Math.PI / 8, 1), 0, 0, 0, k % 2 ? white : white2);
  for (const [a0, a1] of [[0.3, 0.48], [1.52, 1.7]]) {
    p.add(hullSlice(-0.72, 0.78, 1.006, a0 * Math.PI, (a1 - a0) * Math.PI, 4), 0, 0, 0, blue);
    for (const a of [a0, a1]) p.add(hullSlice(-0.7, 0.76, 1.01, a * Math.PI - 0.015, 0.03, 1), 0, 0, 0, gold);
  }
  p.add(hullSlice(0.86, 0.965, 1.008), 0, 0, 0, navy);
  for (let k = 0; k < 12; k++) p.add(hullSlice(0.7, 0.88, 1.008, (k * Math.PI) / 6 - 0.012, 0.024, 1), 0, 0, 0, navy);
  for (const s of [-1, 1]) nameOn(p, s, -0.1, 0.05, 0xf4f2ee);
  // le panneau lumineux sur chaque flanc, au-dessus du bandeau (il luit le soir)
  for (const s of [-1, 1]) {
    onFlank(p, s, 0.1, 0, 0.008, 0.1, 0.42, navy);
    for (let i = 0; i < 6; i++) onFlank(p, s, 0.1, -0.15 + i * 0.06, 0.012, 0.05, 0.045, i % 2 ? gold : 0x6ad8ff, 'neon');
  }
  // empennage en X : plans blancs, gouvernes bleues
  for (let k = 0; k < 4; k++) fin(p, Math.PI / 4 + (k * Math.PI) / 2, white2, blue, 0.37);
  // la nacelle profilée : coque blanche à liseré bleu, vitres teintées qui l'entourent, toit caréné, porte, antenne, roue
  const gy = -0.38, gz = 0.12;
  p.add(new THREE.CapsuleGeometry(0.06, 0.24, 4, 10).rotateX(Math.PI / 2).scale(1, 0.85, 1), 0, gy + 0.05, gz, white);
  p.add(new THREE.CapsuleGeometry(0.061, 0.18, 4, 10).rotateX(Math.PI / 2).scale(1, 0.36, 1), 0, gy + 0.062, gz + 0.04, 0x2e3c48);
  p.add(new THREE.CapsuleGeometry(0.062, 0.25, 3, 10).rotateX(Math.PI / 2).scale(1, 0.12, 1), 0, gy + 0.03, gz, blue);
  p.box(0.08, 0.05, 0.22, 0, gy + 0.08, gz, white2);
  p.box(0.004, 0.05, 0.03, 0.061, gy + 0.025, gz - 0.09, white2);
  p.cyl(0.0015, 0.0015, 0.05, 3, 0.02, gy - 0.05, gz + 0.1, 0x3c3c40);
  p.cyl(0.004, 0.004, 0.04, 4, 0, gy - 0.03, gz - 0.06, 0x3c3c40);
  p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10).rotateZ(Math.PI / 2), 0, gy - 0.032, gz - 0.06, 0x26262a);
  // les deux hélices carénées sur leurs pylônes, à l'arrière de la nacelle
  for (const [x, y, z] of PROPS.modern) {
    p.add(new THREE.TorusGeometry(0.06, 0.011, 5, 16).scale(1, 1, 2.2), x, y, z, white2);
    p.add(new THREE.TorusGeometry(0.062, 0.003, 3, 16), x, y, z + 0.024, blue);
    p.add(new THREE.BoxGeometry(Math.abs(x) - 0.06, 0.012, 0.03), x / 2 + Math.sign(x) * 0.02, y + 0.01, z + 0.01, white2);
    p.add(new THREE.CapsuleGeometry(0.014, 0.03, 2, 6).rotateX(Math.PI / 2), x, y, z + 0.035, 0x8a8f96);
    for (const a of [0, Math.PI / 2]) p.add(new THREE.BoxGeometry(0.11, 0.004, 0.004), x, y, z + 0.02, 0x5a6270, 0, false, a);
  }
  // feux de position, feu anticollision rouge sur le dos
  p.box(0.014, 0.014, 0.014, hullR(0.3) + 0.002, 0, 0.3, 0xff4a3a, 0, true);
  p.box(0.014, 0.014, 0.014, -hullR(0.3) - 0.002, 0, 0.3, 0x3aff7a, 0, true);
  p.box(0.014, 0.014, 0.014, 0, 0.3, 0.1, 0xff3a2a, 0, true);
  return p.build(false);
}

/** Hélice d'un moteur du dirigeable, centrée : deux pales de bois et leur moyeu (ancien), trois pales et la casserole (moderne) */
function propGeo(modern: boolean) {
  const p = new Parts(), n = modern ? 3 : 2, len = modern ? 0.05 : 0.075;
  for (let k = 0; k < n; k++) p.add(new THREE.BoxGeometry(len, 0.016, 0.004).translate(len / 2, 0, 0), 0, 0, 0, modern ? 0x3c3c40 : 0x6a4a34, 0, false, (k * Math.PI * 2) / n, 0.3);
  p.add(new THREE.ConeGeometry(0.012, 0.026, 6).rotateX(-Math.PI / 2), 0, 0, -0.012, modern ? 0xc8d0da : 0x8a8f96);
  return p.build(false).body;
}

const FLAME = new THREE.MeshBasicMaterial({ color: 0xffb04a });
const COLORS: [number, number][] = [[0xd84a3e, 0xf2c23a], [0x3a6ab8, 0xf4f2ee], [0x4fa860, 0xf2c23a], [0xb45ad8, 0xf4f2ee]];

/**
 * Le ciel des aérodromes : le dirigeable amarré à son mât (nez au mât, corps sous le vent) largue les amarres, fait le tour de
 * la région et revient s'amarrer ; les montgolfières se gonflent sur leur aire, s'élèvent au brûleur, dérivent au gré du
 * vent puis redescendent, se dégonflent là où elles se posent et reparaissent à l'aérodrome. Tout le monde reste au sol la nuit
 */
export class Airships {
  group = new THREE.Group();
  private fields = new Map<number, Field>();
  private version = -1;
  private age = -1;

  constructor(private world: World) {}

  /** Place d'un point du repère de l'aérodrome, en monde */
  private local(b: Building, x: number, y: number, z: number) {
    const r = (b.rot * Math.PI) / 2, c = Math.cos(r), s = Math.sin(r), cx = b.x + 1.5, cz = b.z + 1.5;
    return new THREE.Vector3(cx + x * c + z * s, this.world.surfaceAt(cx, cz) + y, cz - x * s + z * c);
  }

  private sync(age: number) {
    const w = this.world;
    for (const [id, f] of this.fields) if (!w.buildings.has(id) || age !== this.age) { this.drop(f); this.fields.delete(id); }
    for (const b of w.buildings.values()) {
      if (b.kind !== 'aerodrome' || b.small || this.fields.has(b.id)) continue;
      const ship: Ship = { root: new THREE.Group(), props: [], phase: 'moored', t: 10 + Math.random() * 20, pos: new THREE.Vector3(), heading: 0, ang: 0 };
      const modern = age >= 4, g = shipGeo(modern), hull = new THREE.Mesh(g.body, mats.body);
      hull.castShadow = true;
      ship.root.add(hull);
      if (g.glow) ship.root.add(new THREE.Mesh(g.glow, mats.glow));
      for (const at of PROPS[modern ? 'modern' : 'classic']) { const pr = new THREE.Mesh(propGeo(modern), mats.body); pr.position.set(...at); ship.root.add(pr); ship.props.push(pr); }
      this.group.add(ship.root);
      const balloons: Balloon[] = [];
      for (let i = 0; i < 2; i++) {
        const [a, c] = COLORS[(b.id + i) % COLORS.length];
        const root = new THREE.Group(), env = new THREE.Mesh(balloonEnvelopeGeo(a, c), mats.body), basket = new THREE.Mesh(balloonBasketGeo(true), mats.body);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5).translate(0, 0.06, 0), FLAME);
        env.position.y = 0.18; flame.position.y = 0.19;
        env.castShadow = basket.castShadow = true;
        root.add(env, basket, flame);
        root.visible = false;
        this.group.add(root);
        const pad = this.local(b, PAD.x + (i ? 0.16 : -0.18), 0.02, PAD.y + (i ? -0.1 : 0.12));
        balloons.push({ root, env, flame, phase: 'ground', t: 4 + i * 14 + Math.random() * 6, pos: pad.clone(), pad, alt: 0, seed: Math.random() * 10 });
      }
      this.fields.set(b.id, { b, ship, balloons });
    }
    this.age = age;
  }

  private drop(f: Field) {
    for (const o of [f.ship.root, ...f.balloons.map((x) => x.root)]) {
      this.group.remove(o);
      o.traverse((m) => { if (m instanceof THREE.Mesh) m.geometry.dispose(); });
    }
  }

  update(dt: number, hour: number, age: number) {
    if (this.world.version !== this.version || age !== this.age) { this.version = this.world.version; this.sync(age); }
    const day = hour > 7 && hour < 19.5;
    for (const f of this.fields.values()) {
      this.stepShip(f, dt, day);
      for (const bl of f.balloons) this.stepBalloon(bl, dt, day);
    }
  }

  /** Amarré : nez au mât, le corps tourné sous le vent ; en vol, un grand tour au-dessus de la région, puis retour au mât */
  private stepShip(f: Field, dt: number, day: boolean) {
    const s = f.ship, mast = this.local(f.b, MAST.x, MAST.y, MAST.z), center = this.local(f.b, 0, 0, 0);
    const moored = new THREE.Vector3(mast.x + wind.dx * 0.98, mast.y - 0.05, mast.z + wind.dz * 0.98);
    s.t -= dt;
    for (const pr of s.props) pr.rotation.z += dt * (s.phase === 'moored' ? 0 : 30);
    if (s.phase === 'moored') {
      s.pos.copy(moored);
      s.heading = Math.atan2(-wind.dx, -wind.dz);
      s.pos.y += Math.sin(performance.now() * 0.0008 + f.b.id) * 0.03;
      if (s.t <= 0 && day) { s.phase = 'out'; s.t = 32; s.ang = Math.atan2(moored.z - center.z, moored.x - center.x); }
    } else {
      // le point visé : sur le cercle du tour (un peu en avant), ou la place d'amarrage au retour
      let goal: THREE.Vector3;
      if (s.phase === 'out') {
        s.ang += (dt * SHIP_SPEED) / ORBIT;
        goal = new THREE.Vector3(center.x + Math.cos(s.ang + 0.4) * ORBIT, mast.y + ALT, center.z + Math.sin(s.ang + 0.4) * ORBIT);
        if (s.t <= 0 || !day) s.phase = 'back';
      } else goal = moored.clone().add(new THREE.Vector3(wind.dx * 2, 0.4, wind.dz * 2).multiplyScalar(Math.min(1, s.pos.distanceTo(moored) / 4)));
      const d = goal.clone().sub(s.pos), dist = d.length();
      const want = Math.atan2(d.x, d.z);
      let da = want - s.heading;
      da = wrapAngle(da);
      s.heading += da * Math.min(1, dt * 0.6);
      const sp = s.phase === 'back' ? Math.min(SHIP_SPEED, 0.25 + dist * 0.4) : SHIP_SPEED;
      s.pos.x += Math.sin(s.heading) * sp * dt; s.pos.z += Math.cos(s.heading) * sp * dt;
      s.pos.y += (goal.y - s.pos.y) * Math.min(1, dt * 0.5);
      if (s.phase === 'back' && s.pos.distanceTo(moored) < 0.25) { s.phase = 'moored'; s.t = 12 + Math.random() * 18; }
    }
    s.root.position.copy(s.pos);
    s.root.rotation.set(0, s.heading, 0);
    s.root.rotation.z = s.phase === 'moored' ? 0 : Math.sin(performance.now() * 0.0006) * 0.04;
  }

  /** Une montgolfière : gonflée sur l'aire, elle monte au brûleur, dérive avec le vent, redescend, se dégonfle et repart */
  private stepBalloon(bl: Balloon, dt: number, day: boolean) {
    bl.t -= dt;
    const ground = (x: number, z: number) => this.world.surfaceAt(x, z) + 0.02;
    const burn = bl.phase === 'inflate' || bl.phase === 'rise' || (bl.phase === 'drift' && Math.sin(bl.t * 1.7 + bl.seed) > 0.6);
    bl.flame.visible = burn;
    bl.flame.scale.setScalar(0.8 + Math.random() * 0.5);
    if (bl.phase === 'ground') {
      bl.root.visible = false;
      if (bl.t <= 0 && day) { bl.phase = 'inflate'; bl.t = 6; bl.pos.copy(bl.pad); bl.alt = 0; bl.root.visible = true; }
    } else if (bl.phase === 'inflate') {
      bl.env.scale.set(1, Math.max(0.15, 1 - bl.t / 6), 1);
      if (bl.t <= 0) { bl.phase = 'rise'; bl.t = 9; }
    } else if (bl.phase === 'rise' || bl.phase === 'drift' || bl.phase === 'fall') {
      // le vent l'emporte ; on monte au brûleur, on se laisse redescendre
      const drift = bl.phase === 'rise' ? 0.15 : 0.3;
      bl.pos.x += wind.dx * drift * dt; bl.pos.z += wind.dz * drift * dt;
      const top = 3.2 + (bl.seed % 1) * 2;
      if (bl.phase === 'rise') { bl.alt = Math.min(top, bl.alt + dt * 0.42); if (bl.t <= 0) { bl.phase = 'drift'; bl.t = 12 + Math.random() * 10; } }
      else if (bl.phase === 'drift') { bl.alt = top + Math.sin(bl.t * 0.4 + bl.seed) * 0.25; if (bl.t <= 0 || !day) bl.phase = 'fall'; }
      else { bl.alt = Math.max(0, bl.alt - dt * 0.5); if (bl.alt <= 0) { bl.phase = 'deflate'; bl.t = 5; } }
      // pas au-delà de la carte : on redescend
      if (bl.pos.x < 3 || bl.pos.z < 3 || bl.pos.x > N - 3 || bl.pos.z > N - 3) bl.phase = bl.phase === 'rise' || bl.phase === 'drift' ? 'fall' : bl.phase;
    } else if (bl.phase === 'deflate') {
      bl.env.scale.set(1, Math.max(0.05, bl.t / 5), 1);
      if (bl.t <= 0) { bl.phase = 'ground'; bl.t = 8 + Math.random() * 12; bl.env.scale.set(1, 1, 1); }
    }
    bl.root.position.set(bl.pos.x, Math.max(ground(bl.pos.x, bl.pos.z), this.world.surfaceAt(bl.pos.x, bl.pos.z)) + bl.alt, bl.pos.z);
    bl.root.rotation.y += dt * 0.08;
  }
}
