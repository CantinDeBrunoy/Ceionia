import * as THREE from 'three';
import { Parts, type Glow } from './parts';
import { hash2 } from '../core/rng';

/**
 * Outils communs des modèles dessinés hors de models.ts (maison des explorateurs, circuit automobile, centrale électrique) :
 * un repère local posé sur la parcelle (`Fr`), des tubes, des quadrilatères, de petits personnages figés. Les aides du moteur
 * de modèles (pièces qui se balancent ou tournent, fumée, personnages animés) arrivent par `ModelKit`, pour ne pas importer
 * models.ts (même contrat que `ArenaKit`)
 */
export type V3 = [number, number, number];
export interface ModelKit {
  sway: (pivot: V3, axis: V3, amp: number, freq: number) => Parts;
  turn: (pivot: V3, axis: V3, speed: number) => Parts;
  smoke: (x: number, y: number, z: number, kind: number) => void;
  swing?: (pivot: V3, axis: V3, amp: number, freq: number) => Parts;
  fan?: (draw: (q: Parts) => void, pivot: V3, axis: V3, amp: number, freq: number, phase: number, bounce?: number) => void;
}

export const PI = Math.PI;
export const H = (i: number, k: number) => hash2(i, k, 131);
export const dk = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
export const lt = (c: number, k: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), k).getHex();
export const SKIN = [0xe8b894, 0xc89870, 0xf0c8a4, 0xa87850];
export const HAIR = [0x4a3426, 0x2a2a2e, 0x8a5a30, 0xd8b060];

/** Tube de rayon r entre deux points (repère du modèle) */
export function tubeW(p: Parts, a: V3, b: V3, r: number, color: number, glow: Glow = false, seg = 5) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), L = d.length();
  if (L < 1e-4) return;
  const g = new THREE.CylinderGeometry(r, r, L, seg).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  p.add(g, A.x + d.x / 2, A.y + d.y / 2, A.z + d.z / 2, color, 0, glow);
}

/** Repère local posé sur la parcelle : origine (x0, z0), tourné de `ry`, agrandi de `k`, au ras du sol (y = `base`) */
export class Fr {
  private c: number; private s: number;
  constructor(readonly p: Parts, readonly x0 = 0, readonly z0 = 0, readonly ry = 0, readonly k = 1, readonly base = 0.012) {
    this.c = Math.cos(ry); this.s = Math.sin(ry);
  }
  X(x: number, z: number) { return this.x0 + (x * this.c + z * this.s) * this.k; }
  Z(x: number, z: number) { return this.z0 + (-x * this.s + z * this.c) * this.k; }
  w(x: number, y: number, z: number): V3 { return [this.X(x, z), this.base + y * this.k, this.Z(x, z)]; }
  sub(x: number, z: number, ry = 0, k = 1) { return new Fr(this.p, this.X(x, z), this.Z(x, z), this.ry + ry, this.k * k, this.base); }
  /** Même repère, dessiné dans d'autres pièces (une pièce qui tourne : son pivot devient l'origine) */
  on(q: Parts, pivot: V3) { return new Fr(q, this.x0 - pivot[0], this.z0 - pivot[2], this.ry, this.k, this.base - pivot[1]); }
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number, glow: Glow = false, rz = 0, ry = 0) {
    this.p.box(w * this.k, h * this.k, d * this.k, this.X(x, z), this.base + y * this.k, this.Z(x, z), color, this.ry + ry, glow, rz);
  }
  cyl(rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, color: number, glow: Glow = false) {
    this.p.cyl(rt * this.k, rb * this.k, h * this.k, seg, this.X(x, z), this.base + y * this.k, this.Z(x, z), color, glow, this.ry);
  }
  cone(r: number, h: number, seg: number, x: number, y: number, z: number, color: number, glow: Glow = false) {
    this.cyl(0, r, h, seg, x, y, z, color, glow);
  }
  /** Boule (ou ellipsoïde, `sx`, `sy`, `sz` : demi-axes relatifs) */
  ball(r: number, x: number, y: number, z: number, color: number, glow: Glow = false, sx = 1, sy = 1, sz = 1, detail = 0) {
    this.p.add(new THREE.IcosahedronGeometry(r * this.k, detail).scale(sx, sy, sz), this.X(x, z), this.base + y * this.k, this.Z(x, z), color, this.ry, glow);
  }
  add(g: THREE.BufferGeometry, x: number, y: number, z: number, color: number, glow: Glow = false, rz = 0, rx = 0, ry = 0) {
    if (this.k !== 1) g.scale(this.k, this.k, this.k);
    this.p.add(g, this.X(x, z), this.base + y * this.k, this.Z(x, z), color, this.ry + ry, glow, rz, rx);
  }
  tube(a: V3, b: V3, r: number, color: number, glow: Glow = false, seg = 5) {
    tubeW(this.p, this.w(...a), this.w(...b), r * this.k, color, glow, seg);
  }
  /** Toit à deux pans, faîtage le long de x du repère */
  gable(w: number, h: number, d: number, x: number, y: number, z: number, color: number) {
    this.p.gable(w * this.k, h * this.k, d * this.k, this.X(x, z), this.base + y * this.k, this.Z(x, z), color, this.ry);
  }
}

/** Quadrilatère a b c d (repère du modèle) ; `both` : visible des deux côtés (toiles, drapeaux) */
export function quad(p: Parts, a: V3, b: V3, c: V3, d: V3, color: number, glow: Glow = false, both = false) {
  const t = [a, b, c, a, c, d];
  if (both) t.push(a, c, b, a, d, c);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(t.flat()), 3));
  p.add(g, 0, 0, 0, color, 0, glow);
}

export interface PersonO {
  y?: number; skin?: number; legs?: number; hair?: number; arms?: 'down' | 'up' | 'out' | 'one' | 'front';
  hat?: 'top' | 'cone' | 'cap' | 'brim' | 'helmet' | 'none'; hatColor?: number; pack?: number;
}
/** Petit personnage figé, de la taille des habitants (≈ 0,19) : jambes, buste, tête, cheveux, bras, chapeau, sac à dos */
export function person(f: Fr, x: number, z: number, ry: number, body: number, o: PersonO = {}) {
  const g = f.sub(x, z, ry), y = o.y ?? 0, skin = o.skin ?? SKIN[Math.floor(H(Math.round(x * 50), Math.round(z * 50)) * 4)], legs = o.legs ?? 0x3c3c48;
  g.box(0.02, 0.07, 0.022, -0.014, y, 0, legs); g.box(0.02, 0.07, 0.022, 0.014, y, 0, legs);
  g.box(0.055, 0.07, 0.035, 0, y + 0.07, 0, body);
  g.box(0.032, 0.032, 0.032, 0, y + 0.145, 0, skin);
  g.box(0.034, 0.012, 0.034, 0, y + 0.172, 0, o.hair ?? HAIR[Math.floor(H(Math.round(z * 40), Math.round(x * 40)) * 4)]);
  const arms = o.arms ?? 'down';
  for (const s of [-1, 1]) {
    if (arms === 'up' || (arms === 'one' && s > 0)) { g.box(0.016, 0.06, 0.018, s * 0.037, y + 0.135, 0, body); g.box(0.018, 0.018, 0.02, s * 0.037, y + 0.193, 0, skin); }
    else if (arms === 'out') { g.box(0.07, 0.016, 0.018, s * 0.075, y + 0.12, 0, body); g.box(0.018, 0.018, 0.02, s * 0.116, y + 0.119, 0, skin); }
    else if (arms === 'front') { g.box(0.016, 0.016, 0.05, s * 0.034, y + 0.115, 0.03, body); g.box(0.018, 0.018, 0.018, s * 0.03, y + 0.115, 0.06, skin); }
    else { g.box(0.016, 0.055, 0.018, s * 0.037, y + 0.075, 0, body); g.box(0.018, 0.018, 0.02, s * 0.037, y + 0.06, 0, skin); }
  }
  const hc = o.hatColor ?? 0x2a2a30;
  if (o.hat === 'top') { g.cyl(0.02, 0.02, 0.045, 7, 0, y + 0.18, 0, hc); g.cyl(0.032, 0.032, 0.006, 8, 0, y + 0.18, 0, hc); }
  else if (o.hat === 'cone') g.cone(0.022, 0.06, 6, 0, y + 0.18, 0, hc);
  else if (o.hat === 'cap') { g.box(0.038, 0.018, 0.038, 0, y + 0.18, 0, hc); g.box(0.03, 0.006, 0.03, 0, y + 0.186, 0.03, hc); }
  else if (o.hat === 'brim') { g.cyl(0.04, 0.04, 0.006, 9, 0, y + 0.176, 0, hc); g.cyl(0.018, 0.021, 0.026, 7, 0, y + 0.18, 0, hc); }
  else if (o.hat === 'helmet') g.ball(0.024, 0, y + 0.172, 0, hc, false, 1, 0.8, 1);
  if (o.pack !== undefined) { g.box(0.046, 0.06, 0.028, 0, y + 0.078, -0.03, o.pack); g.cyl(0.012, 0.012, 0.05, 6, 0, y + 0.14, -0.034, 0x8a8f72); }
}
