import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Simplex } from '../world/noise';
import { smoothstep, hash2 } from '../core/rng';
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

// ---- Style « diorama ensoleillé » : cimes facettées en œuf, bouleaux blancs tachés de noir, sapins à étages francs.
// Toutes les faces sont plates (géométrie sans index, normales par face) et leur couleur est posée face par face.

const BIRCH = new THREE.Color(0xeeebe2), BIRCH_MARK = new THREE.Color(0x2c2b2a), BIRCH_FOOT = new THREE.Color(0xb9b2a4);
const BROWN = new THREE.Color(0x8a5a3a), BROWN_DARK = new THREE.Color(0x6a4430);

/** Couleur face par face (géométrie sans index) : fn reçoit le centre et la normale de la face */
function paintFaces(g: THREE.BufferGeometry, fn: (cx: number, cy: number, cz: number, ny: number, f: number) => THREE.Color | number) {
  const p = g.attributes.position, nrm = g.attributes.normal, c = new Float32Array(p.count * 3), tmp = new THREE.Color();
  for (let f = 0; f < p.count / 3; f++) {
    const i = f * 3;
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    const v = fn(cx, cy, cz, nrm.getY(i), f);
    if (typeof v === 'number') tmp.setScalar(v); else tmp.copy(v);
    for (let k = 0; k < 3; k++) tmp.toArray(c, (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Sans uv, sans index, normales par face */
function flat(g: THREE.BufferGeometry) {
  g.deleteAttribute('uv');
  const out = g.index ? g.toNonIndexed() : g;
  out.computeVertexNormals();
  return out;
}

/**
 * Cime facettée en œuf (pointe vers le haut), sommets un peu bousculés : de grandes facettes nettes, sombres dessous, claires
 * dessus. Les couleurs ne portent que l'ombre : la teinte vient de la palette de saison
 */
function facetCrown(rx: number, ry: number, x: number, y: number, z: number, seed: number) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1, ux = p.getX(i) / l, uy = p.getY(i) / l, uz = p.getZ(i) / l;
    const j = 1 + 0.13 * noise.noise2(ux * 2.3 + seed, uy * 2.1 + uz * 1.7 - seed);
    // plus large en bas, en pointe en haut
    const taper = uy > 0 ? 1 - 0.3 * uy * uy : 1 - 0.1 * uy * uy;
    p.setXYZ(i, ux * rx * j * taper, uy * ry * j, uz * rx * j * taper);
  }
  g = flat(g.translate(x, y, z));
  return paintFaces(g, (_x, cy, _z, ny, f) => (0.72 + 0.4 * smoothstep(y - ry, y + ry * 0.8, cy)) * (0.94 + 0.1 * ny) * (0.95 + 0.1 * hash2(f, seed * 31, 7)));
}

/** Tronc penché (cisaillé de lx, lz par unité de hauteur), facettes colorées face par face : color(rang, côté, hauteur 0…1) */
function trunkGeo(rt: number, rb: number, h: number, seg: number, hseg: number, x: number, z: number, lx: number, lz: number, color: (k: number, side: number, t: number) => THREE.Color) {
  const g = flat(new THREE.CylinderGeometry(rt, rb, h, seg, hseg, true).translate(0, h / 2, 0));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + lx * p.getY(i) + x, p.getY(i), p.getZ(i) + lz * p.getY(i) + z);
  g.computeVertexNormals();
  return paintFaces(g, (cx, cy, cz) => {
    const t = cy / h, ox = cx - x - lx * cy, oz = cz - z - lz * cy;
    const side = Math.floor((Math.atan2(oz, ox) / (Math.PI * 2) + 1) * seg) % seg;
    return color(Math.floor(t * hseg), side, t);
  });
}

/** Écorce de bouleau : blanche, tirets noirs épars, pied grisé */
const birchBark = (seed: number) => (k: number, side: number, t: number) => (t < 0.06 ? BIRCH_FOOT : hash2(k, side, seed) < 0.2 ? BIRCH_MARK : BIRCH);
const brownBark = (k: number, side: number) => (hash2(k, side, 3) < 0.25 ? BROWN_DARK : BROWN);

/** Bouleau (0 : un tronc et deux cimes, 1 : deux troncs qui s'écartent, 2 : trois tiges) ; hauteur ~1,25 */
export function birchShape(v: number) {
  const trunks: THREE.BufferGeometry[] = [], crowns: THREE.BufferGeometry[] = [];
  const stems: [number, number, number, number][] = v === 0 ? [[0.95, 0.04, 0.02, 0.034]]
    : v === 1 ? [[1, 0.13, 0.03, 0.03], [0.8, -0.14, -0.05, 0.028]]
    : [[1.02, 0.03, 0.12, 0.028], [0.84, 0.13, -0.08, 0.026], [0.7, -0.15, -0.05, 0.024]];
  stems.forEach(([h, lx, lz, r], i) => {
    trunks.push(trunkGeo(r * 0.55, r, h, 6, 12, 0, 0, lx, lz, birchBark(17 + v * 5 + i)));
    const cr = v === 0 ? 0.2 : 0.17 - i * 0.015;
    crowns.push(facetCrown(cr, cr * 1.9, lx * h, h - 0.02 + cr * 0.6, lz * h, v * 3.1 + i * 1.7));
  });
  if (v === 0) {
    // une petite cime de côté, sur une branche
    trunks.push(trunkGeo(0.008, 0.014, 0.3, 5, 2, 0.02, 0.01, 0.6, 0.15, birchBark(40)).translate(0, 0.45, 0));
    crowns.push(facetCrown(0.12, 0.2, 0.2, 0.78, 0.06, 9.3));
  }
  const canopy = mergeGeometries(crowns, false)!;
  canopy.computeBoundingBox();
  return { canopy, trunk: mergeGeometries(trunks, false)!, bottom: canopy.boundingBox!.min.y };
}

/** Feuillu à tronc brun : trois cimes facettées serrées, plus rondes (hauteur ~1,1) */
export function roundTreeShape(v: number) {
  const trunk = trunkGeo(0.03, 0.055, 0.55, 6, 3, 0, 0, 0.02 * (v - 0.5), 0, brownBark);
  const blobs = v === 0 ? [[0.27, 0.42, 0, 0.78, 0], [0.18, 0.3, 0.17, 0.62, 0.06], [0.17, 0.28, -0.15, 0.64, -0.07]]
    : [[0.22, 0.48, 0, 0.82, 0], [0.16, 0.3, 0.14, 0.58, -0.08], [0.15, 0.26, -0.1, 0.6, 0.12]];
  const canopy = mergeGeometries(blobs.map(([rx, ry, x, y, z], i) => facetCrown(rx, ry, x, y, z, 20 + v * 4 + i)), false)!;
  canopy.computeBoundingBox();
  return { canopy, trunk, bottom: canopy.boundingBox!.min.y };
}

/**
 * Fougère : six larges feuilles pliées en V, basses, qui s'arrondissent puis retombent, à grandes facettes, un peu plus
 * sombres au cœur (hauteur ~0,08, rayon ~0,15). La teinte vient du matériau (saison)
 */
export function fernShape() {
  const pos: number[] = [], SEG = 3, FRONDS = 6;
  for (let f = 0; f < FRONDS; f++) {
    const a = (f / FRONDS) * Math.PI * 2 + (f % 2) * 0.35, ca = Math.cos(a), sa = Math.sin(a);
    const L = 0.13 + (f % 3) * 0.015, H = 0.055 + (f % 2) * 0.02, W = 0.055;
    // le long de la fronde : nervure (qui monte puis retombe) et ses deux bords, un peu plus bas (pli en V)
    const at = (t: number, side: number): [number, number, number] => {
      const d = L * t, w = W * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.6) * side;
      const y = H * 4 * t * (1 - t) + 0.01 * (1 - t) - Math.abs(w) * 0.25;
      return [ca * d - sa * w, y, sa * d + ca * w];
    };
    for (let k = 0; k < SEG; k++) {
      const t0 = k / SEG, t1 = (k + 1) / SEG;
      for (const side of [-1, 1]) {
        const s0 = at(t0, 0), s1 = at(t1, 0), e0 = at(t0, side), e1 = at(t1, side);
        // sens des faces : vers le ciel des deux côtés de la nervure
        const tri = side > 0 ? [s0, e0, s1, s1, e0, e1] : [s0, s1, e0, s1, e1, e0];
        for (const p of tri) pos.push(...p);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return paintFaces(g, (cx, _y, cz, ny, f) => (0.78 + 0.32 * smoothstep(0, 0.13, Math.hypot(cx, cz))) * (0.9 + 0.12 * Math.abs(ny)) * (0.95 + 0.1 * hash2(f, 5, 13)));
}

/** Bouleau nu de l'hiver : tronc blanc tacheté et quelques branches fines (hauteur ~1,05) */
export function bareBirchShape() {
  const parts = [trunkGeo(0.018, 0.034, 1.05, 6, 12, 0, 0, 0.03, 0.01, birchBark(61))];
  for (let i = 0; i < 6; i++) {
    // branches courtes qui montent en biais
    const a = i * 2.4, y = 0.45 + i * 0.09, len = 0.2 - i * 0.018;
    parts.push(trunkGeo(0.004, 0.01, len, 4, 2, 0, 0, Math.cos(a) * 0.55, Math.sin(a) * 0.55, birchBark(70 + i)).translate(0.03 * y, y, 0.01 * y));
  }
  return mergeGeometries(parts, false)!;
}

/**
 * Étage de sapin : n branches en étoile qui pointent et retombent, encoches entre elles, profil un peu creusé, dessous en
 * cône plat. Pied à y, pointe à y + h ; faces plates (sans index)
 */
function pineTier(r: number, h: number, y: number, n: number, seed: number, hk: number) {
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[], hx: number, hy: number, hz: number) => {
    // sens des faces : la normale du côté de l'indice (hx, hy, hz)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const d = (uy * vz - uz * vy) * hx + (uz * vx - ux * vz) * hy + (ux * vy - uy * vx) * hz;
    pos.push(...a, ...(d >= 0 ? b : c), ...(d >= 0 ? c : b));
  };
  // anneaux de 2n points : pointe de branche (pair), encoche (impair)
  const ring = (rt: number, rn: number, yt: number, yn: number) => {
    const out: number[][] = [];
    for (let k = 0; k < n * 2; k++) {
      const tip = k % 2 === 0, j = noise.noise2(k * 0.9 + seed, seed * 1.3);
      const a = (k / (n * 2)) * Math.PI * 2 + (tip ? 0.12 * j : 0), rr = (tip ? rt * (1 + 0.1 * j) : rn);
      out.push([Math.cos(a) * rr, y + (tip ? yt - 0.012 * hk * (1 + j) : yn), Math.sin(a) * rr]);
    }
    return out;
  };
  const rim = ring(r * 1.04, r * 0.7, -0.07 * h, 0.08 * h), mid = ring(r * 0.5, r * 0.4, 0.45 * h, 0.5 * h);
  const apex = [0, y + h, 0], under = [0, y + 0.2 * h, 0];
  const m = n * 2;
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m, a = mid[k], b = mid[k1], c = rim[k], d = rim[k1];
    const hx = (a[0] + b[0]) / 2, hz = (a[2] + b[2]) / 2;
    tri(apex, a, b, hx, r * 0.4, hz);
    tri(a, c, d, hx, r * 0.3, hz);
    tri(a, d, b, hx, r * 0.3, hz);
    tri(under, c, d, 0, -1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Sapin à étages de cônes facettés (0 : ordinaire, 1 : élancé, 2 : trapu), bord des étages qui retombe, sombre dessous ;
 * avec snow, des calottes de neige sur chaque étage (maillage à part, matériau blanc)
 */
export function pineShape(v: number, snow = false) {
  const tiers = v === 1 ? 6 : v === 2 ? 4 : 5, wk = v === 2 ? 1.15 : v === 1 ? 0.85 : 1, hk = v === 1 ? 1.12 : v === 2 ? 0.88 : 1;
  const greens: THREE.BufferGeometry[] = [], caps: THREE.BufferGeometry[] = [];
  let top = 0;
  const y0 = 0.2 * hk, span = 0.66 * hk;
  for (let i = 0; i < tiers; i++) {
    const f = i / (tiers - 1), r = (0.29 - 0.19 * f) * wk, h = (0.32 - 0.12 * f) * hk, y = y0 + f * span * (1 - 0.18 * f);
    const g = pineTier(r, h, y, i < tiers - 1 ? 7 : 6, i * 1.7 + v * 5.3, hk);
    g.rotateY(i * 0.7 + v);
    const seed = 40 + v * 9 + i;
    paintFaces(g, (cx, cy, cz, ny, k) => {
      // dessous sombre, plus clair vers le cœur ; dessus : clair en haut de l'étage, un peu plus clair à la pointe des branches
      if (ny < -0.3) return 0.36 + 0.1 * (1 - Math.min(1, Math.hypot(cx, cz) / r));
      const tip = smoothstep(r * 0.55, r * 0.95, Math.hypot(cx, cz));
      return (0.58 + 0.42 * smoothstep(y, y + h, cy) + 0.08 * tip) * (0.88 + 0.12 * f) * (0.9 + 0.12 * ny) * (0.9 + 0.17 * hash2(k, seed, 23));
    });
    greens.push(g);
    if (snow) {
      const cap = flat(new THREE.ConeGeometry(r * 0.62, h * 0.5, i < tiers - 1 ? 7 : 6).translate(0, y + h * 0.75, 0).rotateY(i * 0.7 + v));
      paintFaces(cap, (_x, _y, _z, ny) => 0.9 + 0.1 * ny);
      caps.push(cap);
    }
    top = y + h;
  }
  const trunk = trunkGeo(0.022, 0.05, 0.4 * hk, 6, 3, 0, 0, 0, 0, brownBark);
  return { green: mergeGeometries(greens, false)!, snow: snow ? mergeGeometries(caps, false)! : null, trunk, top };
}

/** Buisson rond : trois ou quatre boules de feuillage serrées (hauteur ~0,15) */
export function bushShape() {
  const blobs = [[0.09, 0, 0.06, 0], [0.065, 0.075, 0.045, 0.02], [0.06, -0.065, 0.04, -0.03], [0.055, 0.01, 0.05, -0.08]];
  const g = mergeGeometries(blobs.map(([r, x, y, z], i) => leafBall(r, x, y, z, 0.85, 0.1, i * 5.1 + 20)), false)!;
  shade(g, -0.01, 0.14, 0.58, 1.02, 0.05);
  return g.index ? g.toNonIndexed() : g;
}

/**
 * Rochers : trois blocs anguleux à grandes facettes, dessus tranché (des dalles plutôt que des galets), plus clairs sur le
 * dessus ; et leur rayon au sol
 */
export function rockShapes() {
  const out: { geometry: THREE.BufferGeometry; radius: number }[] = [];
  for (let v = 0; v < 3; v++) {
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, v === 2 ? 1 : 0);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g = mergeVertices(g);
    const sx = [0.08, 0.065, 0.09][v], sy = [0.055, 0.065, 0.045][v], sz = [0.065, 0.058, 0.075][v];
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1, ux = p.getX(i) / l, uy = p.getY(i) / l, uz = p.getZ(i) / l;
      const d = 1 + 0.22 * noise.noise2(ux * 1.9 + v * 7, uy * 1.7 + uz * 1.3 - v * 3);
      // dessus tranché net, dessous à plat : le rocher est posé, pas une boule
      const yy = Math.min(uy * d, 0.62 + 0.08 * ux);
      p.setXYZ(i, ux * sx * d, (yy < 0 ? yy * 0.3 : yy) * sy, uz * sz * d);
    }
    g = flat(g);
    paintFaces(g, (_x, cy, _z, ny, f) => (0.74 + 0.22 * smoothstep(0, sy * 0.6, cy)) * (ny > 0.8 ? 1.06 : 0.97) * (0.96 + 0.08 * hash2(f, v, 11)));
    out.push({ geometry: g, radius: Math.max(sx, sz) * 1.1 });
  }
  return out;
}
