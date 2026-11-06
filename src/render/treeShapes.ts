import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Simplex } from '../world/noise';
import { smoothstep } from '../core/rng';
import { Parts } from './parts';

/**
 * Formes de la végétation, façon diorama : feuillus ronds et touffus (grappe de boules de feuillage bosselées, sombres
 * dessous, claires dessus, sur un tronc bien visible), sapins à étages de cônes facettés, buissons ronds, rochers facettés.
 * Les couleurs de sommet ne portent que l'ombre et la lumière : la teinte vient du matériau (saison) ou de l'instance
 */

const noise = new Simplex(5150);
const BARK = 0x8a5a3c, ROOT = 0x6f4a33;

/** Boule de feuillage bosselée : icosaèdre (subdivisé pour les grosses), normales radiales (rendu lisse), un peu aplatie */
function leafBall(r: number, x: number, y: number, z: number, sy: number, bump: number, seed: number, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1, ux = p.getX(i) / l, uy = p.getY(i) / l, uz = p.getZ(i) / l;
    const d = 1 + bump * noise.noise2(ux * 2.1 + uz * 1.3 + seed, uy * 2.3 - uz * 0.7 + seed * 1.7);
    p.setXYZ(i, ux * r * d, uy * r * d * sy, uz * r * d);
    n.setXYZ(i, ux, uy, uz);
  }
  return g.translate(x, y, z);
}

/** Ombre portée par la hauteur : lo en y0, hi en y1, un peu mouchetée */
function shade(g: THREE.BufferGeometry, y0: number, y1: number, lo: number, hi: number, speck = 0.05) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = (lo + (hi - lo) * smoothstep(y0, y1, p.getY(i))) * (1 + speck * noise.noise2(p.getX(i) * 9 + p.getZ(i) * 3, p.getY(i) * 9));
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Feuillu : grosse ramure ronde et touffue, tronc évasé à racines et deux branches qui y plongent (hauteur ~1) */
export function broadleafShape() {
  const blobs = [
    [0.3, 0, 0.64, 0], [0.22, 0.21, 0.56, 0.08], [0.22, -0.19, 0.57, -0.1], [0.2, 0.05, 0.53, -0.23], [0.2, -0.06, 0.54, 0.23],
    [0.22, 0.09, 0.84, 0.05], [0.18, -0.12, 0.8, -0.07], [0.16, 0.18, 0.75, -0.14],
  ];
  // les petites boules, moins détaillées : la ramure reste légère à afficher en forêt
  const canopy = mergeGeometries(blobs.map(([r, x, y, z], i) => leafBall(r, x, y, z, 0.9, 0.13, i * 3.7, r >= 0.22 ? 1 : 0)), false)!;
  shade(canopy, 0.34, 0.98, 0.5, 1.02, 0.06);
  const t = new Parts();
  t.cyl(0.042, 0.068, 0.5, 7, 0, 0, 0, BARK);
  for (const [a, s] of [[0.5, 1], [2.6, -1]]) t.add(new THREE.CylinderGeometry(0.016, 0.03, 0.24, 5).translate(0, 0.12, 0), Math.cos(a) * 0.02, 0.36, Math.sin(a) * 0.02, BARK, -a, false, s * 0.65);
  // racines qui s'évasent au pied
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; t.add(new THREE.ConeGeometry(0.035, 0.13, 4).translate(0, 0.065, 0), Math.cos(a) * 0.045, -0.01, Math.sin(a) * 0.045, ROOT, Math.PI - a, false, 1.05); }
  // les boules d'icosaèdres fusionnées sont déjà sans index
  return { canopy: canopy.index ? canopy.toNonIndexed() : canopy, trunk: t.build(true).body, bottom: 0.32, top: 1.05 };
}

/**
 * Sapin à étages de cônes facettés (0 : ordinaire, 1 : élancé, 2 : trapu), sombres sous chaque étage ; avec snow, des
 * calottes de neige sur chaque étage (maillage à part, matériau blanc)
 */
export function pineShape(v: number, snow = false) {
  const tiers = v === 1 ? 5 : 4, wk = v === 2 ? 1.15 : v === 1 ? 0.82 : 1, hk = v === 1 ? 1.12 : v === 2 ? 0.85 : 1;
  const greens: THREE.BufferGeometry[] = [], caps: THREE.BufferGeometry[] = [];
  let top = 0;
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1), r = (0.27 - 0.16 * f) * wk, h = (0.34 - 0.1 * f) * hk, y = (0.2 + i * (0.5 / (tiers - 1))) * hk;
    const g = new THREE.ConeGeometry(r, h, 8).translate(0, y + h / 2, 0).rotateY(i * 0.45).toNonIndexed();
    g.deleteAttribute('uv');
    // sombre au bord de l'étage et dessous, clair vers la pointe ; les étages bas un peu plus sombres
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) c.fill((0.5 + 0.5 * Math.min(1, (p.getY(k) - y) / h)) * (0.85 + 0.15 * f), k * 3, k * 3 + 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.computeVertexNormals();
    greens.push(g);
    if (snow) {
      const cap = new THREE.ConeGeometry(r * 0.5, h * 0.47, 8).translate(0, y + h * 0.55 + h * 0.235, 0).rotateY(i * 0.45).toNonIndexed();
      cap.deleteAttribute('uv');
      cap.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cap.attributes.position.count * 3).fill(1), 3));
      cap.computeVertexNormals();
      caps.push(cap);
    }
    top = y + h;
  }
  const t = new Parts();
  t.cyl(0.03, 0.045, 0.24 * hk, 6, 0, 0, 0, BARK);
  return { green: mergeGeometries(greens, false)!, snow: snow ? mergeGeometries(caps, false)! : null, trunk: t.build(true).body, top };
}

/** Buisson rond : trois ou quatre boules de feuillage serrées (hauteur ~0,15) */
export function bushShape() {
  const blobs = [[0.09, 0, 0.06, 0], [0.065, 0.075, 0.045, 0.02], [0.06, -0.065, 0.04, -0.03], [0.055, 0.01, 0.05, -0.08]];
  const g = mergeGeometries(blobs.map(([r, x, y, z], i) => leafBall(r, x, y, z, 0.85, 0.1, i * 5.1 + 20)), false)!;
  shade(g, -0.01, 0.14, 0.58, 1.02, 0.05);
  return g.index ? g.toNonIndexed() : g;
}

/** Rochers : trois blocs arrondis et facettés, assis à plat, plus clairs sur le dessus ; et leur rayon au sol */
export function rockShapes() {
  const out: { geometry: THREE.BufferGeometry; radius: number }[] = [];
  for (let v = 0; v < 3; v++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    g.deleteAttribute('uv');
    const sx = [0.075, 0.062, 0.085][v], sy = [0.05, 0.058, 0.04][v], sz = [0.062, 0.055, 0.07][v];
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1, ux = p.getX(i) / l, uy = p.getY(i) / l, uz = p.getZ(i) / l;
      const d = 1 + 0.2 * noise.noise2(ux * 1.6 + v * 7, uy * 1.6 + uz * 1.3 - v * 3);
      // dessous aplati : le rocher est posé, pas une boule
      p.setXYZ(i, ux * sx * d, (uy < 0 ? uy * 0.3 : uy) * sy * d, uz * sz * d);
    }
    g.computeVertexNormals();
    shade(g, -0.01, sy, 0.78, 1.02, 0.06);
    out.push({ geometry: g, radius: Math.max(sx, sz) * 1.1 });
  }
  return out;
}
