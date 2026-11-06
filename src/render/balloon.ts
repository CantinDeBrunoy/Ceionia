import * as THREE from 'three';
import { Parts } from './parts';

/**
 * La montgolfière, commune à l'expédition « Le premier envol » et aux aérodromes. L'enveloppe, posée sur son embouchure
 * (y = 0), en goutte d'eau : seize fuseaux de deux couleurs et leurs coutures, une ceinture décorée de losanges, la couronne
 * et sa soupape au sommet, la jupe qui protège la flamme. La nacelle d'osier tressé (y = 0 à son fond), son rebord de cuir
 * matelassé, les câbles qui la suspendent à l'embouchure, le cadre et ses deux brûleurs, les sacs de lest, un fanion ;
 * l'enveloppe se pose au-dessus de la nacelle à y = 0.18
 */

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
/** Profil de l'enveloppe (rayon, hauteur) de l'embouchure au sommet */
const PROFILE = [[0.1, 0.1], [0.15, 0.19], [0.25, 0.31], [0.33, 0.45], [0.37, 0.58], [0.36, 0.7], [0.31, 0.82], [0.22, 0.92], [0.1, 0.985], [0, 1]];
const lathe = (k: number, y0: number, y1: number, phi: number, len: number, segs = 2) => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i + 1 < PROFILE.length; i++) {
    const [r0, a] = PROFILE[i], [r1, b] = PROFILE[i + 1];
    for (const [r, y] of [[r0, a], [r1, b]]) if (y >= y0 - 1e-6 && y <= y1 + 1e-6 && !pts.some((p) => Math.abs(p.y - y) < 1e-6)) pts.push(new THREE.Vector2(r * k, y));
  }
  return new THREE.LatheGeometry(pts, segs, phi, len);
};

/** Rayon de l'enveloppe à la hauteur y */
function radiusAt(y: number) {
  for (let i = 0; i + 1 < PROFILE.length; i++) {
    const [r0, a] = PROFILE[i], [r1, b] = PROFILE[i + 1];
    if (y >= a && y <= b) return r0 + ((r1 - r0) * (y - a)) / (b - a);
  }
  return 0;
}

export function balloonEnvelopeGeo(a: number, b: number, trim = 0xf2c23a) {
  const p = new Parts(), n = 16, gore = (Math.PI * 2) / n;
  // les fuseaux, de deux couleurs, et leurs coutures (les sangles de charge), d'un ton plus sombre
  for (let k = 0; k < n; k++) {
    p.add(lathe(1, 0.1, 0.92, k * gore, gore), 0, 0, 0, k % 2 ? a : b);
    p.add(lathe(1.006, 0.1, 0.92, k * gore - 0.012, 0.024, 1), 0, 0, 0, dark(k % 2 ? a : b, 0.62));
  }
  // la ceinture et ses losanges, juste sous l'équateur
  p.add(lathe(1.008, 0.45, 0.58, 0, Math.PI * 2, 32), 0, 0, 0, trim);
  for (let k = 0; k < n; k++) {
    const ang = (k + 0.5) * gore, r = radiusAt(0.515) * 1.01;
    p.add(new THREE.BoxGeometry(0.045, 0.045, 0.006).rotateZ(Math.PI / 4), Math.sin(ang) * r, 0.515, Math.cos(ang) * r, k % 2 ? a : b, ang);
  }
  // la couronne au sommet, l'anneau de la soupape
  p.add(lathe(1.004, 0.92, 1, 0, Math.PI * 2, 16), 0, 0, 0, trim);
  p.add(new THREE.TorusGeometry(0.07, 0.008, 4, 16).rotateX(Math.PI / 2), 0, 0.99, 0, dark(trim, 0.7));
  // la jupe : toile qui descend de l'embouchure, l'anneau de charge
  p.add(new THREE.CylinderGeometry(0.1, 0.085, 0.12, 16, 1, true).translate(0, 0.04, 0), 0, 0, 0, dark(a, 0.85));
  p.add(new THREE.TorusGeometry(0.1, 0.006, 4, 16).rotateX(Math.PI / 2), 0, 0.1, 0, 0x5a4a3a);
  return p.build(false).body;
}

/** Nacelle d'osier, cadre et brûleurs, câbles, lest ; avec `crew`, deux aéronautes à bord */
export function balloonBasketGeo(crew = false) {
  const p = new Parts(), w1 = 0xb48a5a, w2 = 0x9a7448, metal = 0x8a8f96;
  // l'osier tressé : rangs alternés, montants plus sombres sur chaque face
  for (let k = 0; k < 5; k++) p.box(0.12, 0.016, 0.12, 0, k * 0.016, 0, k % 2 ? w1 : w2);
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) for (let i = 0; i < 5; i++) {
    const t = -0.04 + i * 0.02;
    p.box(nz ? 0.005 : 0.004, 0.08, nz ? 0.004 : 0.005, nx * 0.0605 + (nz ? t : 0), 0, nz * 0.0605 + (nx ? t : 0), dark(w2, 0.8));
  }
  // le rebord de cuir matelassé, les poignées de corde
  p.box(0.13, 0.016, 0.13, 0, 0.08, 0, 0x5a3e2c); p.box(0.11, 0.017, 0.11, 0, 0.08, 0, 0x4a3022);
  for (const s of [-1, 1]) p.add(new THREE.TorusGeometry(0.012, 0.003, 3, 8, Math.PI), s * 0.066, 0.05, 0, 0xc9b48a, Math.PI / 2);
  // les montants du cadre, le cadre et ses deux brûleurs, le serpentin de cuivre
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box(0.006, 0.11, 0.006, x * 0.05, 0.09, z * 0.05, metal);
  for (const s of [-1, 1]) { p.box(0.106, 0.006, 0.006, 0, 0.2, s * 0.05, metal); p.box(0.006, 0.006, 0.106, s * 0.05, 0.2, 0, metal); }
  for (const s of [-1, 1]) {
    p.cyl(0.014, 0.012, 0.03, 8, s * 0.018, 0.17, 0, 0x6a6f78);
    p.add(new THREE.TorusGeometry(0.014, 0.003, 3, 10).rotateX(Math.PI / 2), s * 0.018, 0.185, 0, 0xc8783a);
  }
  // les câbles : des coins du rebord à l'anneau de l'embouchure
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ax = x * 0.06, az = z * 0.06, bx = x * 0.072, bz = z * 0.072, ay = 0.09, by = 0.28, len = Math.hypot(bx - ax, by - ay, bz - az);
    p.add(new THREE.BoxGeometry(0.003, len, 0.003), (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, 0x4a4036, 0, false, -Math.atan2(bx - ax, by - ay), Math.atan2(bz - az, by - ay));
  }
  // les sacs de lest pendus au rebord, un fanion au coin
  for (const [x, z] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const ox = x * 0.068 + z * 0.03, oz = z * 0.068 + x * 0.03;
    p.box(0.003, 0.02, 0.003, ox, 0.065, oz, 0xc9b48a); p.sphere(0.012, ox, 0.055, oz, 0xd8c8a0, 0, 1.2);
  }
  p.box(0.003, 0.05, 0.003, 0.05, 0.2, 0.05, metal); p.box(0.003, 0.02, 0.03, 0.05, 0.235, 0.065, 0xd84a3e);
  if (crew) for (const [x, c] of [[-0.03, 0x8a3a3a], [0.03, 0x3a5a8a]] as number[][]) { p.box(0.03, 0.04, 0.03, x, 0.08, 0, c); p.box(0.024, 0.024, 0.024, x, 0.125, 0, 0xe8b894); p.box(0.026, 0.008, 0.026, x, 0.145, 0, 0x4a3426); }
  return p.build(false).body;
}
