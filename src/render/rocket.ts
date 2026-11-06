import * as THREE from 'three';
import { Parts } from './parts';

/**
 * Les fusées de l'âge futuriste, debout sur leur base (y = 0), le nez vers +y. La fusée du premier vol : blanche à damier
 * noir, ailerons rouges, deux étages et sa coiffe. La fusée lunaire, à la façon des grandes fusées d'Apollon : trois étages
 * blancs cerclés de noir, cinq tuyères, l'adaptateur du module lunaire, la cabine et sa tour de sauvetage. Le vaisseau
 * colonial : un corps central liseré de lumière, quatre propulseurs d'appoint, l'anneau habité aux hublots allumés, la
 * coiffe et ses panneaux solaires repliés
 */

export type RocketKind = 'probe' | 'moon' | 'colony';

/** Hauteur de chaque fusée, et rayon de sa jupe (la flamme, la fumée et la caméra s'y règlent) */
export const ROCKET_H: Record<RocketKind, number> = { probe: 1.3, moon: 1.95, colony: 2.3 };
export const ROCKET_R: Record<RocketKind, number> = { probe: 0.075, moon: 0.12, colony: 0.27 };

const WHITE = 0xf4f6f8, BLACK = 0x26262a, STEEL = 0x8a8f96, RED = 0xd8443a, NEON = 0x5af0ff;

/** Tuyère : sa cloche sombre sous l'étage, en (x, z) */
function bell(p: Parts, x: number, z: number, r: number, h: number) {
  p.cyl(r * 0.45, r, h, 8, x, 0, z, 0x3c3c40);
  p.cyl(r * 0.5, r * 0.5, h * 0.3, 8, x, h, z, STEEL);
}

/** Ailerons autour de la jupe : `n` lames tournées vers l'extérieur */
function fins(p: Parts, n: number, r: number, h: number, color: number, y = 0, a0 = Math.PI / 4) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    p.add(new THREE.BoxGeometry(0.008, h, r * 0.9).translate(0, h / 2, r * 0.45), Math.sin(a) * r, y, Math.cos(a) * r, color, a);
  }
}

export function drawRocket(p: Parts, kind: RocketKind, x = 0, y = 0, z = 0) {
  const q = new Parts();
  if (kind === 'probe') {
    const r = 0.075;
    bell(q, 0, 0, 0.05, 0.06);
    // premier étage à damier, l'inter-étage sombre, le second étage, la coiffe à pointe rouge
    q.cyl(r, r, 0.7, 12, 0, 0.06, 0, WHITE);
    for (let k = 0; k < 4; k++) q.add(new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.12, 6, 1, true, k * Math.PI / 2, Math.PI / 2).translate(0, 0.06, 0), 0, 0.12 + (k % 2) * 0.34, 0, BLACK);
    q.cyl(r, r, 0.04, 12, 0, 0.76, 0, BLACK);
    q.cyl(0.065, r, 0.3, 12, 0, 0.8, 0, WHITE);
    q.cyl(0.066, 0.066, 0.015, 12, 0, 0.98, 0, RED);
    q.cone(0.065, 0.2, 12, 0, 1.1, 0, WHITE);
    q.cone(0.022, 0.06, 8, 0, 1.24, 0, RED);
    fins(q, 4, r, 0.16, RED, 0.02);
    // l'écusson du village et son liseré lumineux
    q.box(0.05, 0.05, 0.006, 0, 0.6, r, 0x3a6ab8); q.box(0.03, 0.012, 0.007, 0, 0.62, r + 0.001, WHITE);
    q.box(0.006, 0.3, 0.006, 0, 0.82, 0.066, NEON, 0, 'neon');
  } else if (kind === 'moon') {
    const r = 0.12;
    for (const [bx, bz] of [[0, 0], [0.06, 0.06], [-0.06, 0.06], [0.06, -0.06], [-0.06, -0.06]]) bell(q, bx, bz, 0.035, 0.07);
    // premier étage : bandes noires, ailerons ; deuxième étage ; troisième étage qui s'affine
    q.cyl(r, r, 0.62, 14, 0, 0.07, 0, WHITE);
    for (let k = 0; k < 4; k++) q.add(new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.2, 6, 1, true, k * Math.PI / 2, Math.PI / 4).translate(0, 0.1, 0), 0, 0.12, 0, BLACK);
    q.cyl(r + 0.003, r + 0.003, 0.05, 14, 0, 0.62, 0, BLACK);
    fins(q, 4, r, 0.14, BLACK, 0.03);
    q.cyl(r, r, 0.42, 14, 0, 0.69, 0, WHITE);
    q.cyl(r + 0.002, r + 0.002, 0.03, 14, 0, 1.06, 0, BLACK);
    q.cyl(0.085, r, 0.08, 14, 0, 1.11, 0, WHITE);
    q.cyl(0.085, 0.085, 0.26, 12, 0, 1.19, 0, WHITE);
    q.cyl(0.086, 0.086, 0.025, 12, 0, 1.36, 0, BLACK);
    // l'adaptateur du module lunaire, la cabine conique, la tour de sauvetage et sa petite fusée
    q.cyl(0.065, 0.085, 0.16, 12, 0, 1.45, 0, 0xe8eaee);
    q.cone(0.065, 0.13, 12, 0, 1.61, 0, 0xd8dce2);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; q.add(new THREE.CylinderGeometry(0.003, 0.003, 0.16, 3).rotateZ(Math.cos(a) * 0.12).rotateX(-Math.sin(a) * 0.12), Math.cos(a) * 0.012, 1.8, Math.sin(a) * 0.012, RED); }
    q.cyl(0.014, 0.014, 0.1, 6, 0, 1.86, 0, RED);
    q.cone(0.014, 0.03, 6, 0, 1.92, 0, RED);
    q.box(0.004, 0.36, 0.05, r, 0.26, 0, BLACK);
    q.box(0.06, 0.04, 0.006, 0, 0.88, r, 0x3a6ab8); q.box(0.06, 0.012, 0.007, 0, 0.9, r + 0.001, RED);
  } else {
    const r = 0.13;
    // le corps central et ses liserés, les quatre propulseurs d'appoint, leurs tuyères
    bell(q, 0, 0, 0.09, 0.09);
    q.cyl(r, r, 1.35, 16, 0, 0.09, 0, WHITE);
    for (let k = 0; k < 4; k++) q.box(0.008, 1.2, 0.008, Math.cos(k * Math.PI / 2 + 0.4) * (r + 0.002), 0.15, Math.sin(k * Math.PI / 2 + 0.4) * (r + 0.002), NEON, 0, 'neon');
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4, bx = Math.cos(a) * 0.2, bz = Math.sin(a) * 0.2;
      bell(q, bx, bz, 0.05, 0.06);
      q.cyl(0.065, 0.065, 0.85, 10, bx, 0.06, bz, 0xe8eaee);
      q.cone(0.065, 0.16, 10, bx, 0.91, bz, WHITE);
      q.cyl(0.067, 0.067, 0.03, 10, bx, 0.5, bz, BLACK);
      q.add(new THREE.BoxGeometry(0.09, 0.04, 0.008), bx * 0.62, 0.75, bz * 0.62, STEEL, -a);
    }
    fins(q, 4, r, 0.18, 0x3a4250, 0.05, 0);
    // l'anneau habité : hublots qui s'allument, rayons vers le moyeu
    q.add(new THREE.TorusGeometry(0.27, 0.05, 6, 20).rotateX(Math.PI / 2), 0, 1.58, 0, WHITE);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; q.box(0.03, 0.02, 0.008, Math.cos(a) * 0.32, 1.57, Math.sin(a) * 0.32, 0xfff1c9, Math.PI / 2 - a, true); }
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; q.add(new THREE.BoxGeometry(0.24, 0.02, 0.02).translate(0.12, 0, 0), 0, 1.57, 0, 0xd8dce2, a); }
    q.cyl(r, r, 0.25, 16, 0, 1.44, 0, 0xe8eaee);
    q.add(new THREE.TorusGeometry(r + 0.01, 0.008, 4, 20).rotateX(Math.PI / 2), 0, 1.47, 0, NEON, 0, 'neon');
    // la coiffe et les panneaux solaires repliés
    q.cyl(0.1, r, 0.2, 16, 0, 1.69, 0, WHITE);
    q.cone(0.1, 0.36, 16, 0, 1.89, 0, WHITE);
    q.cone(0.03, 0.07, 8, 0, 2.23, 0, NEON, 'neon');
    for (const s of [-1, 1]) q.box(0.012, 0.32, 0.1, s * 0.105, 1.72, 0, 0x2a3a6a);
    q.box(0.08, 0.08, 0.006, 0, 0.9, r, 0x3a6ab8); q.box(0.05, 0.016, 0.007, 0, 0.93, r + 0.001, WHITE);
  }
  for (const g of q.body) { g.translate(x, y, z); p.body.push(g); }
  for (const g of q.glow) { g.translate(x, y, z); p.glow.push(g); }
}

const cache = new Map<RocketKind, { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null }>();
/** Géométries d'une fusée, partagées par toutes les scènes */
export function rocketGeo(kind: RocketKind) {
  let g = cache.get(kind);
  if (!g) { const p = new Parts(); drawRocket(p, kind); g = p.build(false); cache.set(kind, g); }
  return g;
}
