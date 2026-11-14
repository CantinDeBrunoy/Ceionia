import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Parts } from './parts';
import { hash2, mulberry32 } from '../core/rng';

/**
 * États d'un lot des villes rivales, pour la bataille et l'après-guerre (voir `docs/iles.md`) : intact, en ruine (le haut
 * effondré en dents de scie, murs noircis, lumières éteintes, gravats et poutres brûlées au sol) ou en reconstruction
 * (moins abîmé, échafaudage de bambou, tas de matériaux). Le même traitement vaut pour tous les modèles des deux peuples
 */
export type TownState = 'intact' | 'ruin' | 'repair';

/** Bruit de valeur lissé (0 … 1) sur une grille de `cell` cases */
function noise(x: number, z: number, seed: number, cell = 0.55) {
  const u = x / cell, v = z / cell, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const s = (t: number) => t * t * (3 - 2 * t), a = s(fu), b = s(fv);
  const h = (di: number, dj: number) => hash2(i + di, j + dj, seed);
  return (h(0, 0) * (1 - a) + h(1, 0) * a) * (1 - b) + (h(0, 1) * (1 - a) + h(1, 1) * a) * b;
}

type V = number[];
/** Sommet interpolé (tous les attributs) entre a et b */
const lerpV = (a: V, b: V, t: number) => a.map((x, k) => x + (b[k] - x) * t);

/**
 * Découpe une géométrie non indexée : les grands triangles sont d'abord subdivisés (côtés de `maxEdge` au plus), puis chacun
 * est coupé à la hauteur `cut` (prise en son centre) ; le reste est recoloré par `tint`. Les sommets portent tous les
 * attributs à la suite (position en tête), pour que la coupe les interpole ensemble
 */
function clip(g: THREE.BufferGeometry, cut: (x: number, z: number) => number, maxEdge: number, tint?: (x: number, y: number, z: number, c: THREE.Color) => void, inside?: THREE.Color) {
  const names = Object.keys(g.attributes).sort((a, b) => (a === 'position' ? -1 : b === 'position' ? 1 : a.localeCompare(b)));
  const sizes = names.map((n) => (g.attributes[n] as THREE.BufferAttribute).itemSize), stride = sizes.reduce((a, b) => a + b, 0);
  const ni = names.indexOf('normal') >= 0 ? sizes.slice(0, names.indexOf('normal')).reduce((a, b) => a + b, 0) : -1;
  const ci = names.indexOf('color') >= 0 ? sizes.slice(0, names.indexOf('color')).reduce((a, b) => a + b, 0) : -1;
  const out: number[] = [];
  const vert = (t: number): V => { const v: V = []; names.forEach((n) => { const at = g.attributes[n] as THREE.BufferAttribute; for (let e = 0; e < at.itemSize; e++) v.push(at.getComponent(t, e)); }); return v; };
  const d2 = (a: V, b: V) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const c = new THREE.Color();
  const put = (v: V) => {
    if (tint && ci >= 0) { c.setRGB(v[ci], v[ci + 1], v[ci + 2]); tint(v[0], v[1], v[2], c); out.push(...v.slice(0, ci), c.r, c.g, c.b, ...v.slice(ci + 3)); }
    else out.push(...v);
  };
  const emit = (a: V, b: V, cc: V) => {
    // la part du triangle sous la cassure : une surface continue y = cut(x, z), évaluée aux sommets (Sutherland-Hodgman)
    const tri = [a, b, cc], f = tri.map((v) => (v[1] < 0.06 ? -1 : v[1] - cut(v[0], v[2]))), poly: V[] = [];
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3, pin = f[k] <= 0, qin = f[j] <= 0;
      if (pin) poly.push(tri[k]);
      if (pin !== qin) poly.push(lerpV(tri[k], tri[j], f[k] / (f[k] - f[j])));
    }
    if (poly.length < 3) return;
    const cutAway = poly.length !== 3 || f.some((x) => x > 0);
    for (let k = 1; k + 1 < poly.length; k++) for (const v of [poly[0], poly[k], poly[k + 1]]) put(v);
    // l'envers noirci des murs éventrés : on voit l'intérieur sombre, pas le sol à travers une coque de papier
    if (inside && ni >= 0 && ci >= 0 && Math.abs(a[ni + 1]) < 0.5 && (cutAway || Math.max(a[1], b[1], cc[1]) > 0.1))
      for (let k = 1; k + 1 < poly.length; k++)
        for (const v of [poly[0], poly[k + 1], poly[k]]) {
          const w = v.slice();
          for (let e = 0; e < 3; e++) w[ni + e] = -v[ni + e];
          w[ci] = inside.r; w[ci + 1] = inside.g; w[ci + 2] = inside.b;
          out.push(...w);
        }
  };
  const split = (a: V, b: V, cc: V, depth: number) => {
    const ab = d2(a, b), bc = d2(b, cc), ca = d2(cc, a), m = Math.max(ab, bc, ca);
    if (depth <= 0 || m <= maxEdge * maxEdge) return emit(a, b, cc);
    // coupe le plus grand côté en son milieu (l'ordre des sommets, donc l'orientation, est gardé)
    if (m === ab) { const n = lerpV(a, b, 0.5); split(a, n, cc, depth - 1); split(n, b, cc, depth - 1); }
    else if (m === bc) { const n = lerpV(b, cc, 0.5); split(a, b, n, depth - 1); split(a, n, cc, depth - 1); }
    else { const n = lerpV(cc, a, 0.5); split(a, b, n, depth - 1); split(n, b, cc, depth - 1); }
  };
  const pos = g.attributes.position;
  for (let t = 0; t < pos.count; t += 3) split(vert(t), vert(t + 1), vert(t + 2), 8);
  const r = new THREE.BufferGeometry(), n = out.length / stride;
  let off = 0;
  names.forEach((name, k) => {
    const arr = new Float32Array(n * sizes[k]);
    for (let i = 0; i < n; i++) for (let e = 0; e < sizes[k]; e++) arr[i * sizes[k] + e] = out[i * stride + off + e];
    r.setAttribute(name, new THREE.BufferAttribute(arr, sizes[k]));
    off += sizes[k];
  });
  return r;
}

const RUBBLE = [0x8a847a, 0x9a8a78, 0x6f6a62, 0xa89a86, 0x7a6a58];
const SOOT = new THREE.Color(0x2a2622);

/**
 * Le modèle (corps et lumières de `Parts.build`) dans l'état voulu. `wall` : un pan de rempart (des brèches plutôt qu'un
 * effondrement d'ensemble). Les attributs restent ceux de `Parts.build`, pour que `mergeLit` les fonde comme les autres
 */
export function withState(body: THREE.BufferGeometry, glow: THREE.BufferGeometry | null, state: TownState, seed: number, wall = false) {
  if (state === 'intact') return { body, glow };
  const ruin = state === 'ruin';
  body.computeBoundingBox();
  const bb = body.boundingBox!, top = Math.max(0.2, bb.max.y);
  // la hauteur qui reste debout, en dents de scie ; les remparts ont des brèches franches
  const cut = (x: number, z: number) => {
    const n = noise(x, z, seed);
    if (wall) return ruin ? (n < 0.4 ? 0.12 : top * (0.55 + 0.35 * n)) : top * (0.7 + 0.3 * n);
    return Math.max(0.16, top * (ruin ? 0.12 + 0.42 * n : 0.42 + 0.4 * n));
  };
  const tint = (x: number, y: number, z: number, c: THREE.Color) => {
    // noirci par le feu vers la cassure, plus ou moins selon l'endroit
    const k = Math.min(1, Math.max(0, y / cut(x, z))) * (ruin ? 0.75 : 0.25) * (0.5 + noise(x + 7, z - 3, seed + 3, 0.4));
    c.lerp(SOOT, k);
  };
  const edge = wall ? 0.22 : 0.32;
  const kept = clip(body, cut, edge, tint, new THREE.Color(0x3a332c));
  // (en ruine, plus aucune lumière ; en reconstruction, celles du bas)
  const g2 = glow && !ruin ? clip(glow, cut, edge) : null;
  body.dispose(); glow?.dispose();

  // gravats, poutres brûlées ; ou échafaudage et matériaux
  const p = new Parts(), r = mulberry32(seed * 7 + 1);
  const x0 = bb.min.x + 0.1, x1 = bb.max.x - 0.1, z0 = Math.max(bb.min.z, -6) + 0.1, z1 = bb.max.z - 0.1;
  const W = Math.max(0.2, x1 - x0), D = Math.max(0.2, z1 - z0), n = Math.min(40, Math.round(W * D * (ruin ? 5 : 2)) + 2);
  if (ruin) {
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * W, z = z0 + r() * D, s = 0.04 + r() * 0.08;
      if (i % 4 === 3) p.add(new THREE.BoxGeometry(0.3 + r() * 0.4, 0.035, 0.035), x, 0.02, z, 0x2e2620, r() * Math.PI, false, (r() - 0.5) * 0.5);
      else p.add(new THREE.BoxGeometry(s * 1.4, s, s), x, s * 0.4, z, RUBBLE[i % RUBBLE.length], r() * Math.PI, false, (r() - 0.5) * 0.6);
    }
    for (let i = 0; i < Math.max(1, Math.round(n / 8)); i++) p.sphere(0.1 + r() * 0.1, x0 + r() * W, 0, z0 + r() * D, 0x7a7266, 0, 0.5);
  } else {
    // échafaudage de bambou sur le pourtour, deux lisses, quelques planches
    const ph = Math.min(top * 0.9, 1.6), poles: [number, number][] = [];
    for (const [xa, za, xb, zb] of [[x0, z1, x1, z1], [x1, z0, x1, z1], [x0, z0, x0, z1]] as const) {
      const len = Math.hypot(xb - xa, zb - za), k = Math.max(1, Math.round(len / 0.45));
      for (let i = 0; i <= k; i++) poles.push([xa + ((xb - xa) * i) / k, za + ((zb - za) * i) / k]);
      const ry = Math.atan2(-(zb - za), xb - xa);
      for (const y of [ph * 0.45, ph * 0.9]) p.add(new THREE.BoxGeometry(len, 0.016, 0.016), (xa + xb) / 2, y, (za + zb) / 2, 0x9a8a50, ry);
      p.add(new THREE.BoxGeometry(len * 0.9, 0.012, 0.09), (xa + xb) / 2, ph * 0.45 + 0.012, (za + zb) / 2, 0xb89a68, ry);
    }
    for (const [x, z] of poles) p.add(new THREE.CylinderGeometry(0.012, 0.012, ph, 4, 1, true).translate(0, ph / 2, 0), x, 0, z, 0x9a8a50);
    for (let i = 0; i < Math.min(6, n); i++) {
      const x = x0 + r() * W, z = z0 + r() * D;
      if (i % 2) p.add(new THREE.BoxGeometry(0.22, 0.08, 0.12), x, 0.04, z, 0xb4aa98, r() * Math.PI);
      else for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.34, 0.025, 0.06), x, 0.015 + k * 0.026, z + k * 0.01, 0xb08a5a, 0.2);
    }
  }
  const extra = p.build(false).body;
  const merged = mergeGeometries([kept, extra], false) ?? kept;
  kept.dispose(); extra.dispose();
  return { body: merged, glow: g2 && g2.attributes.position.count ? g2 : null };
}
