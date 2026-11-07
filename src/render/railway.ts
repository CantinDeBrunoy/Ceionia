import * as THREE from 'three';
import { World, N } from '../world/world';
import type { Streams } from './streams';
import { Building, sizeOf } from '../build/catalog';
import { Railway, Train, Stop, Seg, Leg, TRAIN_LEN, OVER, stopKey } from '../sim/railway';
import { Parts } from './parts';
import { mats } from './materials';
import { Puffs } from './particles';
import { hash2 } from '../core/rng';

/** pas d'échantillonnage de la voie (en cases) */
const STEP = 0.15;
/** voitures du train, d'un bout à l'autre : centre (cases depuis le bout du train) et demi-entraxe */
const CARS: { kind: 'loco' | 'coach' | 'wagon'; at: number; half: number }[] = [
  { kind: 'loco', at: 0.22, half: 0.14 },
  { kind: 'coach', at: 0.71, half: 0.13 },
  { kind: 'wagon', at: 1.16, half: 0.1 },
  { kind: 'wagon', at: 1.58, half: 0.1 },
  { kind: 'loco', at: 2.04, half: 0.14 },
];
/** Le train de marchandises, aux mêmes places : un fourgon couvert au lieu de la voiture, un wagon-citerne, un tombereau */
type CarKind = 'loco' | 'coach' | 'wagon' | 'van' | 'tank';
const FREIGHT: CarKind[] = ['loco', 'van', 'tank', 'wagon', 'loco'];
const SMOKE = new THREE.Color(0xdcd8d0);

/** Petit assembleur de géométrie colorée : quadrilatères et pavés orientés, sans index */
class Mesher {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  quad(a: number[], b: number[], c: number[], d: number[], color: number) {
    this.c.setHex(color);
    for (const p of [a, b, c, a, c, d]) { this.pos.push(p[0], p[1], p[2]); this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  /** pavé centré en (x, y bas, z), tourné de `h` autour de y (longueur `l` le long du cap) */
  block(x: number, y: number, z: number, h: number, w: number, ht: number, l: number, color: number) {
    const s = Math.sin(h), c = Math.cos(h);
    const P = (u: number, v: number, t: number) => [x + c * u + s * t, y + v, z - s * u + c * t];
    const [a, b, cc, d] = [P(-w / 2, ht, -l / 2), P(w / 2, ht, -l / 2), P(w / 2, ht, l / 2), P(-w / 2, ht, l / 2)];
    const [e, f, g, k] = [P(-w / 2, 0, -l / 2), P(w / 2, 0, -l / 2), P(w / 2, 0, l / 2), P(-w / 2, 0, l / 2)];
    this.quad(d, cc, b, a, color);
    const side = new THREE.Color(color).multiplyScalar(0.82).getHex();
    this.quad(k, g, cc, d, side); this.quad(f, e, a, b, side); this.quad(g, f, b, cc, side); this.quad(e, k, d, a, side);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Locomotive (avant = +z) : à vapeur, chaudière noire et roues rouges, à l'âge industriel ; diesel jaune ensuite ; bandeau à la couleur de la ligne */
export function locoGeo(age: number, line: number) {
  const p = new Parts();
  if (age >= 5) {
    // motrice de la rame à grande vitesse : caisse blanche, long nez profilé et son pare-brise enveloppant, bandeau à la
    // couleur de la ligne qui file jusqu'au nez, phares, grilles d'aération, pantographe, jupe qui cache les bogies
    const white = 0xf4f6f8, glass = 0x1e2a38;
    p.box(0.16, 0.035, 0.36, 0, 0.035, -0.03, 0x2e3238);
    p.box(0.155, 0.17, 0.27, 0, 0.06, -0.075, white);
    p.add(new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(0.97, 1.06, 1.85), 0, 0.145, 0.06, white);
    p.add(new THREE.SphereGeometry(0.081, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(0.8, 0.55, 1.5), 0, 0.19, 0.07, glass);
    for (const s of [-1, 1]) {
      p.box(0.004, 0.022, 0.27, s * 0.078, 0.1, -0.075, line);
      p.add(new THREE.BoxGeometry(0.004, 0.022, 0.13), s * 0.066, 0.1, 0.12, line, -s * 0.35);
      p.box(0.004, 0.035, 0.04, s * 0.078, 0.17, 0.04, glass);
      for (let k = 0; k < 5; k++) p.box(0.004, 0.05, 0.006, s * 0.0785, 0.12, -0.18 + k * 0.025, 0x8a929c);
      p.box(0.02, 0.012, 0.006, s * 0.04, 0.09, 0.2, 0xfff4d8, 0, true);
    }
    p.box(0.1, 0.02, 0.12, 0, 0.23, -0.12, 0xd8dce2);
    p.add(new THREE.BoxGeometry(0.004, 0.08, 0.004), 0, 0.27, -0.1, 0x3c3c40, 0, false, 0, 0.6);
    p.add(new THREE.BoxGeometry(0.004, 0.08, 0.004), 0, 0.27, -0.06, 0x3c3c40, 0, false, 0, -0.6);
    p.box(0.08, 0.006, 0.012, 0, 0.3, -0.08, 0x3c3c40);
    return p.build(false);
  }
  if (age >= 4) {
    const body = 0xf2f2ee, band = line;
    p.box(0.17, 0.035, 0.42, 0, 0.05, 0, 0x3c3c40);
    p.box(0.15, 0.16, 0.4, 0, 0.085, -0.01, body);
    p.box(0.152, 0.03, 0.402, 0, 0.13, -0.01, band);
    p.box(0.14, 0.1, 0.1, 0, 0.245, 0.12, body);
    p.box(0.12, 0.05, 0.004, 0, 0.27, 0.172, 0x2e3c48, 0, true);
    for (const s of [-1, 1]) p.box(0.004, 0.04, 0.07, s * 0.071, 0.27, 0.12, 0x2e3c48);
    for (let k = 0; k < 3; k++) p.box(0.1, 0.012, 0.05, 0, 0.245, -0.16 + k * 0.07, 0x5a5e66);
    p.box(0.03, 0.025, 0.006, 0, 0.17, 0.192, 0xfff0c0, 0, true);
    for (const z of [-0.13, 0.13]) { p.box(0.15, 0.05, 0.12, 0, 0.012, z, 0x2a2a2e); for (const s of [-1, 1]) for (const d of [-0.035, 0.035]) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 8).rotateZ(Math.PI / 2), s * 0.07, 0.035, z + d, 0x3c3c40); }
    return p.build(false);
  }
  const boiler = 0x2a2a2e, brass = 0xc8a050, red = 0xb83a2e;
  p.box(0.16, 0.03, 0.42, 0, 0.05, 0, 0x3c3c40);
  p.add(new THREE.CylinderGeometry(0.065, 0.065, 0.26, 12).rotateX(Math.PI / 2), 0, 0.15, 0.06, boiler);
  for (const z of [-0.02, 0.08]) p.add(new THREE.CylinderGeometry(0.067, 0.067, 0.012, 12).rotateX(Math.PI / 2), 0, 0.15, z, brass);
  p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12).rotateX(Math.PI / 2), 0, 0.15, 0.19, 0x3c3c40);
  p.cyl(0.022, 0.03, 0.1, 8, 0, 0.2, 0.15, boiler); p.cyl(0.036, 0.026, 0.02, 8, 0, 0.3, 0.15, boiler);
  p.sphere(0.03, 0, 0.215, 0.04, brass, 1, 0.8);
  // réservoirs latéraux et cabine
  for (const s of [-1, 1]) p.box(0.04, 0.08, 0.2, s * 0.06, 0.08, 0.04, 0x3f6a4a);
  p.box(0.16, 0.17, 0.13, 0, 0.08, -0.14, 0x3f6a4a); p.box(0.18, 0.02, 0.16, 0, 0.25, -0.14, line);
  p.box(0.162, 0.02, 0.132, 0, 0.13, -0.14, line);
  for (const s of [-1, 1]) p.box(0.004, 0.045, 0.06, s * 0.081, 0.18, -0.13, 0xffe2a0, 0, true);
  for (const z of [-0.12, 0.0, 0.12]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 10).rotateZ(Math.PI / 2), s * 0.075, 0.045, z, red);
  p.box(0.17, 0.035, 0.02, 0, 0.04, 0.205, red);
  p.add(new THREE.BoxGeometry(0.12, 0.05, 0.05), 0, 0.02, 0.23, red, 0, false, 0, -0.5);
  p.box(0.025, 0.025, 0.025, 0, 0.22, 0.2, 0xffe2a0, 0, true);
  return p.build(false);
}

/** Voiture des voyageurs et des mineurs : banquettes sous un auvent à la couleur de la ligne ; `riders` passagers casqués assis dedans */
function coachGeo(age: number, riders: number, line: number) {
  if (age >= 5) {
    // voiture de la rame à grande vitesse : caisse blanche au toit arrondi, bandeau vitré continu (éclairé le soir), liseré à
    // la couleur de la ligne, portes, soufflets d'intercirculation, jupe
    const p = new Parts(), white = 0xf4f6f8;
    p.box(0.16, 0.035, 0.38, 0, 0.035, 0, 0x2e3238);
    p.box(0.155, 0.15, 0.4, 0, 0.06, 0, white);
    p.add(new THREE.CylinderGeometry(0.0775, 0.0775, 0.4, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.35, 1), 0, 0.21, 0, white);
    for (const s of [-1, 1]) {
      p.box(0.004, 0.05, 0.36, s * 0.078, 0.14, 0, 0x1e2a38);
      for (let k = 0; k < 6; k++) p.box(0.004, 0.034, 0.04, s * 0.0785, 0.148, -0.15 + k * 0.06, 0xfff1c9, 0, true);
      p.box(0.004, 0.014, 0.4, s * 0.078, 0.11, 0, line);
      for (const z of [-0.17, 0.17]) p.box(0.005, 0.12, 0.03, s * 0.078, 0.07, z, 0xd8dce2);
    }
    for (const z of [-0.205, 0.205]) p.box(0.12, 0.13, 0.012, 0, 0.07, z, 0x3c3c40);
    return p.build(false);
  }
  const p = new Parts(), wood = age >= 4 ? 0x4a6a8a : 0x7a5a42, roofC = line;
  p.box(0.16, 0.03, 0.4, 0, 0.05, 0, 0x3c3c40);
  p.box(0.16, 0.012, 0.38, 0, 0.08, 0, dark(wood, 1.15));
  for (const s of [-1, 1]) p.box(0.012, 0.07, 0.38, s * 0.074, 0.08, 0, wood);
  for (const z of [-1, 1]) p.box(0.16, 0.07, 0.012, 0, 0.08, z * 0.185, wood);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.012, 0.16, 0.012, x * 0.07, 0.15, z * 0.17, 0x3c3c40);
  p.box(0.19, 0.016, 0.42, 0, 0.31, 0, roofC);
  for (let k = 0; k < 3; k++) p.box(0.14, 0.03, 0.04, 0, 0.09, -0.12 + k * 0.12, dark(wood, 0.8));
  const helmets = age >= 4 ? [0xf2c84b, 0xf2f2f2, 0xd8553c] : [0x8a6a3a, 0x5a5a62, 0x8a6a3a];
  for (let i = 0; i < Math.min(6, riders); i++) {
    const x = (i % 2 ? 1 : -1) * 0.035, z = -0.12 + Math.floor(i / 2) * 0.12;
    p.box(0.045, 0.06, 0.04, x, 0.12, z, [0x5a6a8a, 0x8a5a4a, 0x6a7a5a][i % 3]);
    p.sphere(0.022, x, 0.2, z, 0xf0c8a8, 1);
    p.sphere(0.026, x, 0.21, z, helmets[i % 3], 1, 0.6);
    p.box(0.012, 0.012, 0.008, x, 0.215, z + 0.024, 0xfff0c0, 0, true);
  }
  for (const z of [-0.13, 0.13]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8).rotateZ(Math.PI / 2), s * 0.075, 0.035, z, 0x2a2a2e);
  return p.build(false);
}

/** Wagon de minerai (tombereau) ; chargé, un tas de pierres et de minerai qui brille */
function wagonGeo(age: number, loaded: boolean) {
  if (age >= 5) {
    // wagon de fret caréné : coque argentée au toit arrondi, liseré bleu-vert, trappes de déchargement, témoin du chargement
    const p = new Parts(), shell = 0xd8dce2;
    p.box(0.15, 0.035, 0.3, 0, 0.035, 0, 0x2e3238);
    p.box(0.145, 0.12, 0.31, 0, 0.06, 0, shell);
    p.add(new THREE.CylinderGeometry(0.0725, 0.0725, 0.31, 12, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.4, 1), 0, 0.18, 0, shell);
    for (const s of [-1, 1]) { p.box(0.004, 0.012, 0.31, s * 0.073, 0.12, 0, 0x2ab0b0); for (const z of [-0.08, 0.08]) p.box(0.004, 0.06, 0.08, s * 0.0735, 0.07, z, 0xb8bec6); }
    p.box(0.03, 0.01, 0.03, 0, 0.215, 0.1, loaded ? 0x3aff7a : 0x8a929c, 0, loaded);
    return p.build(false);
  }
  const p = new Parts(), side = age >= 4 ? 0x9a5a44 : 0x6f5640;
  p.box(0.15, 0.03, 0.32, 0, 0.05, 0, 0x3c3c40);
  p.box(0.13, 0.012, 0.28, 0, 0.08, 0, dark(side, 0.8));
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.012, 0.1, 0.3), s * 0.072, 0.13, 0, side, 0, false, s * 0.18);
  for (const z of [-1, 1]) p.box(0.15, 0.1, 0.012, 0, 0.08, z * 0.145, side);
  if (age < 4) for (const z of [-0.08, 0.08]) p.box(0.162, 0.012, 0.014, 0, 0.15, z, 0x3c3c40);
  if (loaded) {
    p.sphere(0.075, 0, 0.16, -0.06, 0x6a6660, 0, 0.55); p.sphere(0.07, 0, 0.16, 0.07, 0x7a746c, 0, 0.55);
    for (let i = 0; i < 6; i++) p.sphere(0.016, (hash2(i, 1, 91) - 0.5) * 0.08, 0.19 + hash2(i, 2, 91) * 0.02, (hash2(i, 3, 91) - 0.5) * 0.22, [0xe8c66a, 0xd84a5a, 0x6ad8e8, 0x4a6ad8][i % 4], 0);
  }
  for (const z of [-0.1, 0.1]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8).rotateZ(Math.PI / 2), s * 0.07, 0.035, z, 0x2a2a2e);
  return p.build(false);
}

/**
 * Fourgon de marchandises (long comme la voiture des voyageurs) : caisse de planches rouge sombre à toit bombé et porte
 * coulissante à l'âge industriel ; conteneur bleu sur wagon plat à l'époque moderne ; bandeau à la couleur de la ligne
 */
function vanGeo(age: number, line: number) {
  if (age >= 5) return wagonGeo(age, true);
  const p = new Parts();
  p.box(0.16, 0.03, 0.4, 0, 0.05, 0, 0x3c3c40);
  if (age >= 4) {
    // conteneur nervuré sur son wagon plat
    p.box(0.15, 0.15, 0.36, 0, 0.08, 0, 0x3a6ab8);
    for (let k = 0; k < 7; k++) for (const s of [-1, 1]) p.box(0.004, 0.14, 0.012, s * 0.076, 0.085, -0.15 + k * 0.05, dark(0x3a6ab8, 0.8));
    p.box(0.152, 0.012, 0.362, 0, 0.23, 0, line);
    p.box(0.14, 0.13, 0.004, 0, 0.09, 0.181, dark(0x3a6ab8, 0.85));
  } else {
    const wood = 0x7a3a2e;
    p.box(0.15, 0.15, 0.38, 0, 0.08, 0, wood);
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) p.box(0.004, 0.15, 0.008, s * 0.076, 0.08, -0.16 + k * 0.08, dark(wood, 0.75));
    p.add(new THREE.CylinderGeometry(0.08, 0.08, 0.38, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.3, 1), 0, 0.23, 0, 0x8a8a86);
    for (const s of [-1, 1]) { p.box(0.006, 0.11, 0.12, s * 0.078, 0.095, 0, dark(wood, 0.85)); p.box(0.008, 0.012, 0.14, s * 0.08, 0.2, 0, 0x3c3c40); }
    p.box(0.152, 0.014, 0.382, 0, 0.12, 0, line);
  }
  for (const z of [-0.13, 0.13]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8).rotateZ(Math.PI / 2), s * 0.075, 0.035, z, 0x2a2a2e);
  return p.build(false);
}

/** Wagon-citerne : la citerne couchée sur son châssis, cerclée, son dôme et son échelle (noire, puis blanche à l'époque moderne) */
function tankGeo(age: number) {
  if (age >= 5) return wagonGeo(age, true);
  const p = new Parts(), tank = age >= 4 ? 0xe8e8e4 : 0x2a2a2e;
  p.box(0.15, 0.03, 0.32, 0, 0.05, 0, 0x3c3c40);
  p.add(new THREE.CylinderGeometry(0.068, 0.068, 0.3, 12).rotateX(Math.PI / 2), 0, 0.15, 0, tank);
  for (const z of [-1, 1]) p.add(new THREE.SphereGeometry(0.068, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX((z * Math.PI) / 2).scale(1, 1, 0.35), 0, 0.15, z * 0.15, tank);
  for (const z of [-0.08, 0.08]) p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 12).rotateX(Math.PI / 2), 0, 0.15, z, age >= 4 ? 0xd8553c : 0x5a5a5e);
  p.cyl(0.025, 0.025, 0.03, 8, 0, 0.21, 0, tank);
  p.box(0.004, 0.12, 0.02, 0.07, 0.08, 0.04, 0x8a8a86);
  for (const z of [-0.1, 0.1]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8).rotateZ(Math.PI / 2), s * 0.07, 0.035, z, 0x2a2a2e);
  return p.build(false);
}

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

interface Car { group: THREE.Group; meshes: THREE.Mesh[]; variants: { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }[]; shown: number }
interface TrainShow { group: THREE.Group; cars: Car[]; key: string; puffT: number }

/** Point d'une polyligne à la distance s, et cap */
function along(pts: [number, number][], cum: number[], s: number): [number, number, number] {
  s = Math.max(0, Math.min(cum[cum.length - 1], s));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], f = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[0] - a[0], b[1] - a[1])];
}

/**
 * Chemin de fer : les voies de chaque ligne (ballast, traverses et rails posés sur le relief adouci, platelage aux routes),
 * l'embranchement et le quai de chargement au pied des avant-postes, des butoirs aux bouts de quai sans suite, un train par
 * ligne à ses couleurs (fumée de la locomotive de tête), et l'aperçu de la ligne qu'on est en train de tracer
 */
export class RailView {
  group = new THREE.Group();
  private track: THREE.Mesh | null = null;
  /** lanternes et feux des signaux le long des voies (s'allument la nuit) */
  private lamps: THREE.Mesh | null = null;
  /** lanternes des voies et des signaux (x, z à la suite) : leur halo de lumière la nuit ; `lightsVersion` change avec elles */
  lights: number[] = [];
  lightsVersion = 0;
  private built = '';
  private age = -1;
  private stopY = new Map<number, number>();
  private segY = new WeakMap<Seg, Float32Array>();
  private shows = new Map<number, TrainShow>();
  private geos = new Map<string, { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }>();
  private puffs = new Puffs(240, 0);
  private preview = new THREE.Group();
  private previewKey = '';
  /** gares et avant-postes que la ligne en cours de tracé peut encore relier : un anneau doré qui pulse et une flèche qui sautille */
  private cands = new THREE.Group();
  private candKey = '';
  private candT = 0;
  private candMat = new THREE.MeshBasicMaterial({ color: 0xffc83a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  private candArrow = new THREE.MeshBasicMaterial({ color: 0xffb000, depthTest: false });
  private v = new THREE.Vector3();

  /** torrents du relief (donnés par le jeu) : la voie les enjambe sur un ponceau */
  streams: Streams | null = null;

  constructor(private world: World, private rail: Railway) {
    this.group.add(this.puffs.mesh, this.preview, this.cands);
  }

  update(dt: number, age: number) {
    const w = this.world, a = Math.min(age, 5), key = `${this.rail.version}|${w.visVersion}|${a}|${this.streams?.version ?? 0}`;
    if (key !== this.built) this.rebuild(key, a);
    const live = new Set<number>();
    for (const tr of this.rail.trains.values()) {
      if (tr.why || !tr.leg) continue;
      live.add(tr.line.id);
      this.place(tr, dt);
    }
    for (const [id, sh] of this.shows) if (!live.has(id)) { this.group.remove(sh.group); this.shows.delete(id); }
    this.puffs.update(dt);
    if (this.cands.children.length) {
      this.candT += dt;
      this.candMat.opacity = 0.38 + 0.26 * Math.sin(this.candT * 4);
      for (const o of this.cands.children) if (o.userData.bob !== undefined) o.position.y = o.userData.bob + 0.12 * Math.abs(Math.sin(this.candT * 4));
    }
  }

  /** Met en valeur les bâtiments que la ligne en cours de tracé peut relier (liste vide : plus rien) */
  setCandidates(list: Building[]) {
    const key = list.map((b) => b.id).join('.');
    if (key === this.candKey) return;
    this.candKey = key;
    for (const o of [...this.cands.children]) { this.cands.remove(o); (o as THREE.Mesh).geometry?.dispose(); }
    const w = this.world;
    for (const b of list) {
      const sz = sizeOf(b), x = b.x + sz / 2, z = b.z + sz / 2, y = w.hAt(x, z), r = sz * 0.75 + 0.55;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.22, r, 40).rotateX(-Math.PI / 2), this.candMat);
      ring.position.set(x, y + 0.08, z); ring.renderOrder = 6;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r - 0.22, 40).rotateX(-Math.PI / 2), this.candMat);
      disc.position.set(x, y + 0.07, z); disc.renderOrder = 6;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4).rotateX(Math.PI), this.candArrow);
      const top = y + 1.9 + sz * 0.3;
      arrow.position.set(x, top, z); arrow.userData.bob = top; arrow.renderOrder = 9;
      this.cands.add(ring, disc, arrow);
    }
  }

  /**
   * Aperçu de la ligne en cours de tracé : une borne à chaque arrêt, et un fil de sa couleur d'arrêt en arrêt (`links` ; sans
   * lui, c'est l'éditeur du tracé qui montre la voie prévue)
   */
  setPreview(stops: Building[], color: number, links = true) {
    const key = `${stops.map((b) => b.id).join('.')}|${color}|${links}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    for (const o of [...this.preview.children]) { this.preview.remove(o); (o as THREE.Mesh).geometry?.dispose(); }
    if (!stops.length) return;
    const w = this.world, mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false });
    const pts = stops.map((b) => { const s = sizeOf(b), x = b.x + s / 2, z = b.z + s / 2; return new THREE.Vector3(x, w.hAt(x, z) + 1.1, z); });
    pts.forEach((p, i) => {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.02, 0.5, 8).translate(0, -0.2, 0), mat);
      pin.position.copy(p); pin.renderOrder = 5; this.preview.add(pin);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14 + (i === 0 ? 0.05 : 0), 10, 8), mat);
      knob.position.copy(p).setY(p.y + 0.1); knob.renderOrder = 5; this.preview.add(knob);
      const q = pts[i + 1];
      if (!q || !links) return;
      const len = p.distanceTo(q), tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 6).rotateX(Math.PI / 2), mat);
      tube.position.copy(p).add(q).multiplyScalar(0.5); tube.lookAt(q); tube.renderOrder = 5;
      this.preview.add(tube);
    });
  }

  // ---------- Hauteurs ----------

  /** Tablier d'un pont en ce point : au-dessus de l'eau qui couvre vraiment le sol (rivière, lac, mer), ou d'un torrent ; null ailleurs (la plage reste à terre) */
  private deckAt(x: number, z: number): number | null {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z), d = w.deckY(cx, cz);
    if (d !== null && w.hAt(x, z) < d - 0.35) return d;
    if (this.streams?.covers(cz * N + cx)) return w.hAt(x, z) + 0.15;
    return null;
  }

  /** Hauteur des rails à quai : la dalle d'une gare ; le relief adouci le long de l'embranchement d'un avant-poste */
  private yOfStop(s: Stop) {
    const w = this.world;
    if (!s.post) {
      // comme la vue des bâtiments : le bâtiment se pose à la médiane des hauteurs des coins de son emprise
      const hs: number[] = [], n = sizeOf(s.b);
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) hs.push(w.h(s.b.x + i, s.b.z + j));
      hs.sort((p, q) => p - q);
      const mid = hs.length >> 1;
      return (hs.length % 2 ? hs[mid] : (hs[mid - 1] + hs[mid]) / 2) + 0.044;
    }
    let y = -Infinity;
    for (let t = -s.half - OVER; t <= s.half + OVER + 1e-6; t += 0.2) y = Math.max(y, w.hAt(s.c[0] + s.u[0] * t, s.c[1] + s.u[1] * t));
    return y + 0.04;
  }

  /** Hauteurs d'un tronçon au pas STEP : relief adouci, jamais sous le sol, raccordé à la hauteur des quais à ses bouts */
  private heights(g: Seg) {
    const known = this.segY.get(g);
    if (known) return known;
    const w = this.world, n = Math.max(2, Math.ceil(g.len / STEP) + 1), raw = new Float32Array(n), ys = new Float32Array(n);
    // sur l'eau, la voie passe sur le tablier d'un pont
    const deck: (number | null)[] = [];
    for (let i = 0; i < n; i++) { const p = along(g.pts, g.cum, i * STEP); deck.push(this.deckAt(p[0], p[1])); raw[i] = Math.max(w.hAt(p[0], p[1]), deck[i] ?? -Infinity); }
    // le tablier est tendu d'une rive à l'autre, à la hauteur des berges (le plus haut à une case et demie de l'eau), jamais
    // plus bas que le niveau d'un pont : la voie ne plonge pas vers l'eau pour remonter de l'autre côté
    const reach = Math.round(1.5 / STEP);
    for (let i = 0; i < n;) {
      if (deck[i] === null) { i++; continue; }
      let j = i;
      while (j + 1 < n && deck[j + 1] !== null) j++;
      let hl = -Infinity, hr = -Infinity;
      for (let k = Math.max(0, i - reach); k < i; k++) hl = Math.max(hl, raw[k]);
      for (let k = j + 1; k <= Math.min(n - 1, j + reach); k++) hr = Math.max(hr, raw[k]);
      if (!isFinite(hl)) hl = hr;
      if (!isFinite(hr)) hr = hl;
      if (isFinite(hl)) for (let k = i; k <= j; k++) raw[k] = Math.max(raw[k], hl + ((hr - hl) * (k - i + 1)) / (j - i + 2));
      // les abords montent au niveau du tablier en remblai
      for (let k = Math.max(0, i - reach); k < i; k++) raw[k] = Math.max(raw[k], raw[i] - (i - k) * STEP * 0.18);
      for (let k = j + 1; k <= Math.min(n - 1, j + reach); k++) raw[k] = Math.max(raw[k], raw[j] - (k - j) * STEP * 0.18);
      i = j + 1;
    }
    const ya = this.stopY.get(g.a) ?? raw[0] + 0.04, yb = this.stopY.get(g.b) ?? raw[n - 1] + 0.04;
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - 5); j <= Math.min(n - 1, i + 5); j++) { s += raw[j]; c++; }
      let y = Math.max(s / c, raw[i]) + 0.04;
      const da = i * STEP, db = g.len - i * STEP;
      if (da < 1.2) y = ya + (y - ya) * smooth(da / 1.2);
      if (db < 1.2) y = yb + (y - yb) * smooth(db / 1.2);
      ys[i] = y;
    }
    this.segY.set(g, ys);
    return ys;
  }

  private segAt(g: Seg, u: number) {
    const ys = this.heights(g), f = Math.max(0, Math.min(ys.length - 1.001, u / STEP)), i = Math.floor(f);
    return ys[i] + (ys[i + 1] - ys[i]) * (f - i);
  }

  /** Hauteur des rails à la distance s d'un trajet */
  private legY(l: Leg, s: number) {
    const u = s - l.segAt;
    if (u <= 0) return this.stopY.get(l.from.b.id) ?? 0;
    if (u >= l.seg.len) return this.stopY.get(l.to.b.id) ?? 0;
    return this.segAt(l.seg, l.rev ? l.seg.len - u : u);
  }

  // ---------- Les voies ----------

  private rebuild(key: string, age: number) {
    this.built = key;
    if (this.age !== age) {
      this.age = age;
      for (const sh of this.shows.values()) this.group.remove(sh.group);
      this.shows.clear();
    }
    if (this.track) { this.group.remove(this.track); this.track.geometry.dispose(); this.track = null; }
    if (this.lamps) { this.group.remove(this.lamps); this.lamps.geometry.dispose(); this.lamps = null; }
    const net = this.rail.network(), w = this.world, lights: number[] = [];
    this.stopY.clear();
    this.segY = new WeakMap();
    for (const s of net.stops) this.stopY.set(s.b.id, this.yOfStop(s));
    if (!net.segs.length) {
      if (this.lights.length) { this.lights = lights; this.lightsVersion++; }
      return;
    }
    const m = new Mesher(), gm = new Mesher(), sleeper = age >= 4 ? 0xb8b4ac : 0x6e5a4a;
    /** fil tendu à `o` du milieu de la voie, à `d0` puis `d1` au-dessus des rails : ruban à plat et de chant, visible de partout */
    const wire = (A: (o: number, dy: number) => number[], B: (o: number, dy: number) => number[], o: number, d0: number, d1: number, color: number) => {
      m.quad(A(o - 0.004, d0), B(o - 0.004, d1), B(o + 0.004, d1), A(o + 0.004, d0), color);
      m.quad(A(o, d0 - 0.004), A(o, d0 + 0.004), B(o, d1 + 0.004), B(o, d1 - 0.004), color);
    };
    // une voie : ballast et talus, rails, traverses, platelage aux routes, d'un point à l'autre de `at` (de a à b)
    const lay = (at: (s: number) => [number, number, number], yAt: (s: number) => number, a: number, b: number) => {
      const n = Math.max(1, Math.ceil((b - a) / STEP));
      for (let i = 0; i < n; i++) {
        const s0 = a + ((b - a) * i) / n, s1 = a + ((b - a) * (i + 1)) / n;
        const [x0, z0, h0] = at(s0), [x1, z1, h1] = at(s1), y0 = yAt(s0), y1 = yAt(s1);
        const ax = Math.cos(h0), az = -Math.sin(h0), bx = Math.cos(h1), bz = -Math.sin(h1);
        // point à `o` du milieu de la voie (vers la droite du sens de marche), `dy` au-dessus des rails, au début ou à la fin du pas
        const A = (o: number, dy: number) => [x0 + ax * o, y0 + dy, z0 + az * o], B = (o: number, dy: number) => [x1 + bx * o, y1 + dy, z1 + bz * o];
        const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, ym = (y0 + y1) / 2, hm = Math.atan2(x1 - x0, z1 - z0), len = Math.hypot(x1 - x0, z1 - z0) + 0.006;
        const bridge = this.deckAt(xm, zm) !== null;
        if (bridge) {
          // pont : tablier, poutres latérales (treillis d'acier à l'âge industriel, parapets de béton ensuite), piles plantées
          // dans le lit de la rivière ou le fond du lac
          const deck = age >= 4 ? 0xc8c4bc : 0x6a5a4c, beam = age >= 4 ? 0xd2cec6 : 0x3c4450, pier = age >= 4 ? 0xbab6ae : 0x9a958c;
          // tablier continu, qui suit les courbes : dessus, rives, dessous
          m.quad(A(-0.23, -0.02), B(-0.23, -0.02), B(0.23, -0.02), A(0.23, -0.02), deck);
          m.quad(A(-0.23, -0.02), A(-0.23, -0.09), B(-0.23, -0.09), B(-0.23, -0.02), dark(deck, 0.82));
          m.quad(A(0.23, -0.02), B(0.23, -0.02), B(0.23, -0.09), A(0.23, -0.09), dark(deck, 0.82));
          m.quad(A(-0.23, -0.09), A(0.23, -0.09), B(0.23, -0.09), B(-0.23, -0.09), dark(deck, 0.7));
          for (const sd of [-1, 1]) {
            const bx = xm + Math.cos(hm) * 0.215 * sd, bz = zm - Math.sin(hm) * 0.215 * sd;
            // parapet de béton, ou lisses d'acier sur leurs montants, en ruban le long de la voie
            const o = 0.215 * sd, top = age >= 4 ? 0.04 : 0.11, bot = age >= 4 ? -0.02 : 0.095;
            m.quad(A(o - 0.012, top), B(o - 0.012, top), B(o + 0.012, top), A(o + 0.012, top), beam);
            m.quad(A(o + 0.012, bot), A(o + 0.012, top), B(o + 0.012, top), B(o + 0.012, bot), dark(beam, 0.85));
            m.quad(A(o - 0.012, bot), B(o - 0.012, bot), B(o - 0.012, top), A(o - 0.012, top), dark(beam, 0.85));
            if (age < 4 && i % 2 === 0) m.block(bx, ym - 0.02, bz, hm, 0.018, 0.13, 0.018, beam);
          }
          if (Math.floor(s1 / 0.7) !== Math.floor(s0 / 0.7)) {
            const bed = Math.min(w.hAt(xm, zm), ym - 0.6);
            m.block(xm, bed, zm, hm, 0.3, ym - 0.09 - bed, 0.12, pier);
            m.block(xm, ym - 0.12, zm, hm, 0.4, 0.03, 0.14, dark(pier, 0.9));
          }
        } else {
          const g = hash2(Math.floor(x0 * 7), Math.floor(z0 * 7), 93) > 0.5 ? 0xa39a8e : dark(0xa39a8e, 0.94);
          m.quad(A(-0.2, -0.02), B(-0.2, -0.02), B(0.2, -0.02), A(0.2, -0.02), g);
          // talus jusque sous le sol, plus large et plus profond là où la voie passe en remblai
          const fill = Math.max(0, Math.min(0.5, y0 - 0.04 - w.hAt(x0, z0))), lo = -0.16 - fill, wide = 0.32 + fill * 0.8;
          m.quad(A(-0.2, -0.02), A(-wide, lo), B(-wide, lo), B(-0.2, -0.02), dark(g, 0.86));
          m.quad(A(0.2, -0.02), B(0.2, -0.02), B(wide, lo), A(wide, lo), dark(g, 0.86));
        }
        for (const sd of [-0.075, 0.075]) {
          m.quad(A(sd - 0.01, 0.022), B(sd - 0.01, 0.022), B(sd + 0.01, 0.022), A(sd + 0.01, 0.022), 0xc8ccd2);
          m.quad(A(sd + 0.01, -0.005), A(sd + 0.01, 0.022), B(sd + 0.01, 0.022), B(sd + 0.01, -0.005), 0x8a8e96);
          m.quad(A(sd - 0.01, -0.005), B(sd - 0.01, -0.005), B(sd - 0.01, 0.022), A(sd - 0.01, 0.022), 0x8a8e96);
        }
        // caténaire (époque moderne) : le câble porteur pend d'un poteau à l'autre et tient le fil de contact par ses
        // pendules ; poteaux télégraphiques et leurs deux fils à l'âge industriel ; une lanterne un poteau sur deux
        const side = bridge ? 0.24 : 0.3;
        const sag = (s: number) => { const f = (s % 1.4) / 1.4; return 0.56 - 0.28 * f * (1 - f); };
        if (age >= 4) {
          wire(A, B, 0, 0.4, 0.4, 0x2a2a2e);
          wire(A, B, 0, sag(s0), sag(s1), 0x3a3a40);
          if (Math.floor(s1 / 0.35) !== Math.floor(s0 / 0.35) && Math.floor(s1 / 1.4) === Math.floor(s0 / 1.4)) m.block(x1, y1 + 0.4, z1, h1, 0.005, sag(s1) - 0.4, 0.005, 0x4a4a50);
        } else for (const d of [-0.045, 0.045]) wire(A, B, side + 0.06 + d, 0.36, 0.36, 0x2a2a2e);
        if (Math.floor(s1 / 1.4) !== Math.floor(s0 / 1.4)) {
          const out = age >= 4 ? side : side + 0.06, cx = Math.cos(h1), cz = -Math.sin(h1), px = x1 + cx * out, pz = z1 + cz * out;
          const lamp = Math.floor(s1 / 1.4) % 2 === 0;
          if (age >= 4) {
            m.block(px, y1 - 0.1, pz, h1, 0.026, 0.7, 0.026, 0x8a96a2);
            // console : bras du porteur en haut, bras de rappel du fil de contact, hauban entre les deux, isolateurs
            m.block(x1 + cx * side * 0.5, y1 + 0.545, z1 + cz * side * 0.5, h1, side + 0.02, 0.016, 0.016, 0x8a96a2);
            m.block(x1 + cx * side * 0.5, y1 + 0.42, z1 + cz * side * 0.5, h1, side + 0.02, 0.014, 0.014, 0x8a96a2);
            m.block(x1 + cx * side * 0.55, y1 + 0.43, z1 + cz * side * 0.55, h1, 0.008, 0.12, 0.008, 0x6d7884);
            m.block(x1, y1 + 0.39, z1, h1, 0.012, 0.03, 0.012, 0x5d6878);
            m.block(x1, y1 + 0.53, z1, h1, 0.012, 0.03, 0.012, 0x5d6878);
            if (lamp) {
              // lampadaire au sommet du poteau, tourné vers la voie
              m.block(px - cx * 0.05, y1 + 0.6, pz - cz * 0.05, h1, 0.1, 0.012, 0.024, 0x6b7280);
              gm.block(px - cx * 0.09, y1 + 0.585, pz - cz * 0.09, h1, 0.04, 0.012, 0.032, 0xfff1c9);
              lights.push(px - cx * 0.12, pz - cz * 0.12);
            }
          } else {
            m.block(px, y1 - 0.1, pz, h1, 0.026, 0.5, 0.026, 0x6a5040);
            m.block(px, y1 + 0.34, pz, h1, 0.16, 0.016, 0.016, 0x6a5040);
            for (const d of [-0.045, 0.045]) m.block(px + cx * d, y1 + 0.355, pz + cz * d, h1, 0.01, 0.012, 0.01, 0xe8e4dc);
            if (lamp) {
              // lanterne pendue à une potence, côté voie
              m.block(px - cx * 0.05, y1 + 0.3, pz - cz * 0.05, h1, 0.1, 0.012, 0.012, 0x3c3c40);
              gm.block(px - cx * 0.09, y1 + 0.22, pz - cz * 0.09, h1, 0.032, 0.05, 0.032, 0xffd27a);
              m.block(px - cx * 0.09, y1 + 0.27, pz - cz * 0.09, h1, 0.044, 0.012, 0.044, 0x3c3c40);
              lights.push(px - cx * 0.12, pz - cz * 0.12);
            }
          }
        }
        if (i % 2 === 0) {
          m.block(x0, y0 - 0.02, z0, h0, 0.3, 0.025, 0.05, sleeper);
          if (w.road[Math.floor(z0) * N + Math.floor(x0)]) m.block(x0, y0 - 0.015, z0, h0, 0.42, 0.035, 0.3, 0x8a7a6a);
        }
      }
    };
    const buffer = (x: number, y: number, z: number, h: number) => {
      m.block(x, y - 0.02, z, h, 0.24, 0.12, 0.05, 0x3c3c40);
      m.block(x, y + 0.08, z, h, 0.3, 0.06, 0.03, 0xd8553c);
      for (const sd of [-0.08, 0.08]) m.block(x + Math.cos(h) * sd, y + 0.1, z - Math.sin(h) * sd, h, 0.06, 0.03, 0.035, 0xf2f2f2);
    };
    for (const g of net.segs) lay((s) => along(g.pts, g.cum, s), (s) => this.segAt(g, s), 0, g.len);
    // l'emprise de la voie est dégagée : ni arbres ni rochers sur le ballast, sous la caténaire ou contre les poteaux
    for (const g of net.segs) for (let s = 0; s <= g.len; s += 0.25) { const [x, z] = along(g.pts, g.cum, s); w.clearTrees(x, z, 0.42); }
    for (const s of net.stops) {
      const y = this.stopY.get(s.b.id)!, used = net.used.get(stopKey(s)) ?? new Set<number>(), h = Math.atan2(s.u[0], s.u[1]);
      const pt = (t: number): [number, number, number] => [s.c[0] + s.u[0] * t, s.c[1] + s.u[1] * t, h];
      if (s.post) {
        // embranchement de l'avant-poste, quai de planches côté murs, wagonnet et tas de minerai
        lay(pt, () => y, -s.half - OVER, s.half + OVER);
        const sx = s.b.x + 1 - s.c[0], sz = s.b.z + 1 - s.c[1], side = Math.cos(h) * sx - Math.sin(h) * sz > 0 ? 1 : -1;
        for (let t = -s.half; t < s.half; t += 0.3) {
          const [qx, qz] = pt(t + 0.15);
          m.block(qx + Math.cos(h) * side * 0.36, y - 0.06, qz - Math.sin(h) * side * 0.36, h, 0.26, 0.1, 0.29, dark(0xa07a56, 0.9 + hash2(Math.floor(t * 10), 5, 93) * 0.2));
        }
        const [ox, oz] = pt(s.half * 0.5), [cx, cz] = pt(-s.half * 0.4);
        m.block(ox + Math.cos(h) * side * 0.4, y + 0.04, oz - Math.sin(h) * side * 0.4, h + 0.3, 0.1, 0.08, 0.1, 0xa07a56);
        m.block(ox + Math.cos(h) * side * 0.4, y + 0.12, oz - Math.sin(h) * side * 0.4, h + 0.9, 0.07, 0.06, 0.07, 0x8a6a46);
        m.block(cx + Math.cos(h) * side * 0.4, y + 0.04, cz - Math.sin(h) * side * 0.4, h, 0.16, 0.06, 0.2, 0x4a4a50);
        m.block(cx + Math.cos(h) * side * 0.4, y + 0.1, cz - Math.sin(h) * side * 0.4, h + 0.4, 0.12, 0.05, 0.14, 0x6a6660);
        for (const e of [1, -1]) if (!used.has(e)) { const [bx, bz] = pt(e * (s.half + OVER)); buffer(bx, y, bz, h); }
      } else {
        // gare : à l'époque moderne, la caténaire passe au-dessus de la voie du quai, tendue entre deux portiques aux bouts
        // du quai, où elle rejoint celle des lignes (la gare centrale a ses voies, ses butoirs et sa halle dans son modèle)
        if (s.ends) {
          for (const e of s.ends) {
            if (!used.has(e)) continue;
            const [qx, qz] = pt(e * (s.half + 0.75)), cx = Math.cos(h), cz = -Math.sin(h), sx = qx - cx * 0.3, sz = qz - cz * 0.3, gy = w.hAt(sx, sz);
            m.block(sx, gy, sz, h, 0.024, 0.5, 0.024, 0x3c3c40);
            m.block(sx, gy + 0.4, sz, h, 0.06, 0.14, 0.035, 0x2a2a2e);
            m.block(sx, gy + 0.54, sz, h, 0.07, 0.012, 0.045, 0x2a2a2e);
            const go = hash2(s.b.id, s.lane, 97) < 0.5;
            (go ? m : gm).block(sx, gy + 0.49, sz, h, 0.034, 0.03, 0.04, go ? 0x5a2a26 : 0xff4a3a);
            (go ? gm : m).block(sx, gy + 0.43, sz, h, 0.034, 0.03, 0.04, go ? 0x3aff7a : 0x1e4a2a);
            if (age === 3) m.block(sx + cx * 0.06, gy + 0.36, sz + cz * 0.06, h, 0.12, 0.02, 0.012, 0xd8553c);
            lights.push(sx, sz);
          }
          continue;
        }
        if (age >= 4) {
          const cx = Math.cos(h), cz = -Math.sin(h), L = s.half + 0.02, n = Math.ceil((2 * L) / STEP);
          const P = (t: number) => (o: number, dy: number) => { const [x, z] = pt(t); return [x + cx * o, y + dy, z + cz * o]; };
          const sagS = (t: number) => 0.56 - 0.1 * (1 - (t / L) ** 2);
          for (let i = 0; i < n; i++) {
            const t0 = -L + (2 * L * i) / n, t1 = -L + (2 * L * (i + 1)) / n;
            wire(P(t0), P(t1), 0, 0.4, 0.4, 0x2a2a2e);
            wire(P(t0), P(t1), 0, sagS(t0), sagS(t1), 0x3a3a40);
            if (i < n - 1 && Math.floor(t1 / 0.35) !== Math.floor(t0 / 0.35)) { const [x, , z] = P(t1)(0, 0); m.block(x, y + 0.4, z, h, 0.005, sagS(t1) - 0.4, 0.005, 0x4a4a50); }
          }
          for (const e of [1, -1]) {
            const [x, , z] = P(e * L)(0, 0);
            for (const sd of [-1, 1]) m.block(x + cx * sd * 0.3, y - 0.1, z + cz * sd * 0.3, h, 0.026, 0.72, 0.026, 0x8a96a2);
            m.block(x, y + 0.6, z, h, 0.64, 0.022, 0.022, 0x8a96a2);
            m.block(x, y + 0.42, z, h, 0.5, 0.012, 0.012, 0x8a96a2);
            m.block(x, y + 0.56, z, h, 0.012, 0.04, 0.012, 0x5d6878);
            m.block(x, y + 0.39, z, h, 0.012, 0.03, 0.012, 0x5d6878);
          }
        }
        // la voie du quai se prolonge d'un bout de voie et d'un butoir là où aucune ligne ne repart ; un signal à chaque
        // sortie de quai (feu rouge et feu vert, et son bras de sémaphore à l'âge industriel)
        for (const e of [1, -1]) {
          if (!used.has(e)) {
            lay(pt, () => y, e > 0 ? s.half : -s.half - OVER - 0.1, e > 0 ? s.half + OVER + 0.1 : -s.half);
            const [bx, bz] = pt(e * (s.half + OVER + 0.1));
            buffer(bx, y, bz, h);
            continue;
          }
          const [qx, qz] = pt(e * (s.half + OVER + 0.3)), cx = Math.cos(h), cz = -Math.sin(h), sx = qx - cx * 0.3, sz = qz - cz * 0.3, gy = w.hAt(sx, sz);
          m.block(sx, gy, sz, h, 0.024, 0.5, 0.024, 0x3c3c40);
          m.block(sx, gy + 0.4, sz, h, 0.06, 0.14, 0.035, 0x2a2a2e);
          m.block(sx, gy + 0.54, sz, h, 0.07, 0.012, 0.045, 0x2a2a2e);
          const go = hash2(s.b.id, e, 97) < 0.5;
          (go ? m : gm).block(sx, gy + 0.49, sz, h, 0.034, 0.03, 0.04, go ? 0x5a2a26 : 0xff4a3a);
          (go ? gm : m).block(sx, gy + 0.43, sz, h, 0.034, 0.03, 0.04, go ? 0x3aff7a : 0x1e4a2a);
          if (age === 3) m.block(sx + cx * 0.06, gy + 0.36, sz + cz * 0.06, h, 0.12, 0.02, 0.012, 0xd8553c);
          lights.push(sx, sz);
        }
      }
    }
    this.track = new THREE.Mesh(m.geometry(), mats.body);
    this.track.receiveShadow = true;
    this.group.add(this.track);
    const lg = gm.geometry();
    lg.setAttribute('aLight', new THREE.Float32BufferAttribute(new Float32Array(gm.pos.length / 3), 1));
    this.lamps = new THREE.Mesh(lg, mats.glow);
    this.group.add(this.lamps);
    this.lights = lights;
    this.lightsVersion++;
  }

  // ---------- Les trains ----------

  private geo(kind: CarKind, variant: number, color: number) {
    const key = `${kind}|${variant}|${this.age}|${color}`;
    let g = this.geos.get(key);
    if (!g) {
      g = kind === 'loco' ? locoGeo(this.age, color) : kind === 'coach' ? coachGeo(this.age, variant ? 6 : 0, color) : kind === 'van' ? vanGeo(this.age, color) : kind === 'tank' ? tankGeo(this.age) : wagonGeo(this.age, !!variant);
      this.geos.set(key, g);
    }
    return g;
  }

  /** Voitures du train de cette ligne : de voyageurs (et de mineurs), ou de marchandises */
  private kinds(tr: Train): CarKind[] { return tr.line.freight ? FREIGHT : CARS.map((d) => d.kind); }

  private show(tr: Train): TrainShow {
    const key = `${this.age}|${tr.line.color}|${!!tr.line.freight}`;
    let sh = this.shows.get(tr.line.id);
    if (sh?.key === key) return sh;
    if (sh) this.group.remove(sh.group);
    const group = new THREE.Group(), kinds = this.kinds(tr);
    const cars = CARS.map((d, i) => {
      // le tombereau du train de marchandises roule toujours chargé
      const g = this.geo(kinds[i], kinds[i] === 'wagon' && tr.line.freight ? 1 : 0, tr.line.color), cg = new THREE.Group();
      const body = new THREE.Mesh(g.body, mats.body), glow = new THREE.Mesh(g.glow ?? new THREE.BufferGeometry(), mats.glow);
      body.castShadow = true;
      cg.add(body, glow);
      group.add(cg);
      return { group: cg, meshes: [body, glow], variants: [], shown: kinds[i] === 'wagon' && tr.line.freight ? 1 : 0 };
    });
    sh = { group, cars, key, puffT: 0 };
    this.group.add(group);
    this.shows.set(tr.line.id, sh);
    return sh;
  }

  /** Chaque voiture posée sur ses deux essieux, penchée dans les pentes ; fumée de la locomotive de tête */
  private place(tr: Train, dt: number) {
    const sh = this.show(tr), leg = tr.leg!, r = this.rail, k = tr.flip ? -1 : 1;
    const seated = r.seated(tr), loaded = tr.line.freight || tr.cargo.ore + tr.cargo.stone > 0, kinds = this.kinds(tr);
    CARS.forEach((d, i) => {
      const car = sh.cars[i], s = tr.s + (d.at - TRAIN_LEN / 2) * k;
      const f = r.at(leg, s + d.half), b = r.at(leg, s - d.half), yf = this.legY(leg, s + d.half), yb = this.legY(leg, s - d.half);
      car.group.position.set((f[0] + b[0]) / 2, (yf + yb) / 2, (f[1] + b[1]) / 2);
      car.group.rotation.set(0, 0, 0);
      car.group.rotateY(Math.atan2(f[0] - b[0], f[1] - b[1]));
      car.group.rotateX(-Math.atan2(yf - yb, d.half * 2));
      // les locomotives regardent vers l'extérieur du train
      const out = (d.at - TRAIN_LEN / 2) * k < 0;
      for (const mesh of car.meshes) mesh.rotation.y = d.kind === 'loco' && out ? Math.PI : 0;
      const kind = kinds[i], want = kind === 'coach' ? +(seated > 0) : kind === 'wagon' ? +loaded : 0;
      if (want !== car.shown) {
        car.shown = want;
        const g = this.geo(kind, want, tr.line.color);
        car.meshes[0].geometry = g.body;
        car.meshes[1].geometry = g.glow ?? new THREE.BufferGeometry();
      }
    });
    // à vapeur : la locomotive de tête fume, beaucoup au démarrage, un filet à quai
    if (this.age >= 4) return;
    const moving = tr.phase === 'run';
    sh.puffT -= dt * (moving ? 2 + tr.speed * 3 : 0.6);
    if (sh.puffT > 0) return;
    sh.puffT = 1;
    const lead = k > 0 ? 4 : 0, car = sh.cars[lead], ahead = (CARS[lead].at - TRAIN_LEN / 2) * k > 0;
    this.v.set(0, 0.32, ahead ? 0.15 : -0.15);
    car.group.localToWorld(this.v);
    this.puffs.spawn(this.v.x, this.v.y, this.v.z, (Math.random() - 0.5) * 0.06, 0.45 + Math.random() * 0.15, (Math.random() - 0.5) * 0.06, 0.045, 1.4 + Math.random() * 0.6, SMOKE, 0, { grow: 2.2, drag: 0.5, wind: 0.15, alpha: 0.45 });
  }
}

function smooth(t: number) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
