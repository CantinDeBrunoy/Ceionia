import * as THREE from 'three';
import { Parts } from './parts';
import { hash2 } from '../core/rng';
import { KindId } from '../build/catalog';
import { WALL_N, WALL_E, WALL_S, WALL_W } from './hellBase';

/**
 * Les décorations libres, d'un âge à l'autre (1 case, façade vers +z, origine au centre de la case) : haie, clôture, parterre
 * de fleurs, banc, statue, pavés, fontaine. Haies et clôtures suivent leur masque (`mask` : les côtés où elles rejoignent une
 * voisine), comme les remparts. Les aides du moteur de modèles (flamme, eau, pièces qui se balancent) arrivent par `DecorKit`
 * pour ne pas importer models.ts
 */
type V3 = [number, number, number];
export interface DecorKit {
  flame: (x: number, y: number, z: number, s?: number) => void;
  waterPool: (p: Parts, x: number, y: number, z: number, r: number, seg?: number, foam?: boolean, ry?: number) => void;
  waterJet: (p: Parts, x: number, y: number, z: number, h: number) => void;
  sway: (pivot: V3, axis: V3, amp: number, freq: number) => Parts;
}

const PI = Math.PI;
const dk = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const H = (i: number, k: number, s = 0) => hash2(i, k, 91 + s);
/** une teinte qui varie un peu d'une pièce à l'autre (feuillage, pierres) */
const vary = (c: number, i: number, k: number, amp = 0.2) => dk(c, 1 - amp / 2 + H(i, k) * amp);

const STONE = 0xbab4aa, MOSS = 0x6f8a4a, BARK = 0x7a5636, OAK = 0x8a6440, MARBLE = 0xeee4d0, TRAV = 0xd8ccb4, IRON = 0x2e3632;
const BRONZE = 0x6a8a74, LEAF = 0x5f9a52, LEAF2 = 0x4a8444, NEON = 0x5af0ff, PEARL = 0xe8eef2, WHITE = 0xf4f6f8;
/** quelques fleurs, par âge (les couleurs vives du jeu) */
const BLOOMS = [0xf2d24a, 0xe85a6a, 0xf4f0e8, 0xb07ad8, 0xf29a3a, 0xff7ab8];

/** Les bras d'une haie ou d'une clôture : direction (dx, dz) de chaque côté relié */
function arms(mask: number): [number, number][] {
  const out: [number, number][] = [];
  if (mask & WALL_N) out.push([0, -1]);
  if (mask & WALL_E) out.push([1, 0]);
  if (mask & WALL_S) out.push([0, 1]);
  if (mask & WALL_W) out.push([-1, 0]);
  return out;
}
/** Un point du bras (dx, dz) : `u` le long du bras depuis le centre, `v` sur le côté */
const at = (dx: number, dz: number, u: number, v: number): [number, number] => [dx * u - dz * v, dz * u + dx * v];
/** La rotation d'une boîte allongée le long de x pour suivre le bras */
const ryOf = (dx: number) => (dx !== 0 ? 0 : PI / 2);

export function decorModel(p: Parts, kind: KindId, age: number, v: number, mask: number, kit: DecorKit) {
  const a = Math.max(0, Math.min(5, age));
  switch (kind) {
    case 'hedge': hedge(p, a, mask || WALL_E | WALL_W, v); break;
    case 'fence': fence(p, a, mask || WALL_E | WALL_W, v); break;
    case 'flowerbed': flowerbed(p, a, v); break;
    case 'bench': bench(p, a, v, kit); break;
    case 'statue': statue(p, a, v, kit); break;
    case 'paving': paving(p, a, v); break;
    case 'fountain': fountain(p, a, v, kit); break;
    default: break;
  }
}

// ---------------------------------------------------------------- haies

/**
 * Haie, le long de chaque bras : d'épineux (prunelliers noirs de baies, ronces, branches sèches), de myrtes (taillée ronde,
 * fleurs blanches), vive (charmes, églantines, aubépine en fleurs, un nid), de buis (taillée au cordeau, boule au nœud), taillée
 * dans sa jardinière de béton, lumineuse (feuillage taillé sur un socle blanc, liseré de néon)
 */
function hedge(p: Parts, age: number, mask: number, v: number) {
  const list = arms(mask), T = 0.15, Hh = [0.15, 0.13, 0.16, 0.14, 0.13, 0.13][age];
  // le pied : un liseré de terre ou de pierre, une jardinière, un socle blanc
  for (const [dx, dz] of list) {
    const [cx, cz] = at(dx, dz, 0.25, 0), ry = ryOf(dx);
    if (age === 4) { p.box(0.5, 0.045, T + 0.05, cx, 0, cz, 0xa8a49c, ry); p.box(0.5, 0.006, T + 0.016, cx, 0.045, cz, 0x6a5040, ry); }
    else if (age === 5) { p.box(0.5, 0.035, T + 0.04, cx, 0, cz, WHITE, ry); p.box(0.5, 0.008, 0.008, at(dx, dz, 0.25, (T + 0.04) / 2)[0], 0.02, at(dx, dz, 0.25, (T + 0.04) / 2)[1], NEON, ry, 'neon'); p.box(0.5, 0.008, 0.008, at(dx, dz, 0.25, -(T + 0.04) / 2)[0], 0.02, at(dx, dz, 0.25, -(T + 0.04) / 2)[1], NEON, ry, 'neon'); }
    else if (age === 1 || age === 3) p.box(0.5, 0.012, T + 0.06, cx, 0, cz, age === 1 ? 0xd8b48a : 0xc8bca4, ry);
  }
  const base = age === 4 ? 0.05 : age === 5 ? 0.035 : age === 1 || age === 3 ? 0.012 : 0;
  if (age === 3 || age === 4 || age === 5) {
    // taillée au cordeau : un bloc par bras, les angles un peu adoucis, la face du dessus d'un vert plus clair
    const c = age === 5 ? 0x5ab87a : age === 4 ? 0x4f8a48 : 0x3f7a42;
    for (const [dx, dz] of list) {
      const [cx, cz] = at(dx, dz, 0.25, 0), ry = ryOf(dx);
      p.box(0.5, Hh - 0.02, T, cx, base, cz, c, ry);
      p.box(0.5, 0.02, T - 0.02, cx, base + Hh - 0.02, cz, dk(c, 1.15), ry);
      // les feuilles qui dépassent un peu de la taille
      for (let i = 0; i < 5; i++) {
        const u = 0.05 + i * 0.1, s = i % 2 ? 1 : -1, [x, z] = at(dx, dz, u, s * (T / 2));
        p.add(new THREE.IcosahedronGeometry(0.018, 0), x, base + 0.03 + H(i, dx + dz * 3) * (Hh - 0.06), z, vary(c, i, dx * 7 + dz), i);
      }
      for (let i = 0; i < 6; i++) {
        const u = 0.05 + i * 0.085, s = i % 2 ? 1 : -1, [x, z] = at(dx, dz, u, s * (T / 2 + 0.03));
        if (age === 3) { p.cone(0.012, 0.03, 4, x, base, z, LEAF2); p.sphere(0.011, x, base + 0.032, z, [0xf4f0e8, 0xf29ab0, 0xb07ad8][(i + dx + 3) % 3]); }
        else if (age === 4) p.sphere(0.014, x, 0.045, z, vary(0xd8d4cc, i, dz + 5), 0, 0.5);
        else p.add(new THREE.OctahedronGeometry(0.007, 0), at(dx, dz, u, s * (T / 2))[0], base + 0.05 + (i % 3) * 0.025, at(dx, dz, u, s * (T / 2))[1], [NEON, 0xff5ad8, 0x7affc0][i % 3], 0, 'neon');
      }
      if (age === 4) { const [x, z] = at(dx, dz, 0.4, T / 2 + 0.035); p.cyl(0.008, 0.01, 0.05, 6, x, 0.045, z, 0x3a3a40); p.cyl(0.011, 0.011, 0.012, 6, x, 0.095, z, 0xfff1c9, true); }
    }
    p.box(T, Hh - 0.02, T, 0, base, 0, c);
    p.box(T - 0.02, 0.02, T - 0.02, 0, base + Hh - 0.02, 0, dk(c, 1.15));
    // au nœud : une boule de buis (Industriel), un cube (Moderne), une sphère qui luit (Futuriste)
    if (age === 3) { p.cyl(0.012, 0.012, 0.03, 5, 0, base + Hh, 0, BARK); p.sphere(0.065, 0, base + Hh + 0.08, 0, 0x3f7a42, 1); }
    else if (age === 4) p.box(0.1, 0.06, 0.1, 0, base + Hh, 0, 0x5a9450);
    else { p.cyl(0.02, 0.02, 0.05, 6, 0, base + Hh, 0, WHITE); p.add(new THREE.IcosahedronGeometry(0.035, 1), 0, base + Hh + 0.08, 0, NEON, 0, 'neon'); }
    return;
  }
  // haies libres : des touffes de feuillage serrées, de tailles et de verts variés, plus hautes au milieu
  const greens = [[0x4a6a34, 0x5a7a3a, 0x3f5a2e], [0x4f8a4a, 0x5f9a52, 0x46803e], [0x5f9a52, 0x6fa85a, 0x4a8444]][age];
  const blob = (x: number, y: number, z: number, r: number, i: number) => p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.85, 1), x, y, z, greens[i % 3], i * 0.7);
  blob(0, base + Hh * 0.55, 0, T * 0.62, 0);
  for (const [dx, dz] of list) {
    for (let i = 0; i < 5; i++) {
      const u = 0.07 + i * 0.1, j = i + dx * 5 + dz * 11 + 20, r = T * (0.5 + H(j, 1) * 0.18), [x, z] = at(dx, dz, u, (H(j, 2) - 0.5) * 0.04);
      blob(x, base + r * 0.8, z, r, j);
      if (i % 2 === 0) blob(at(dx, dz, u + 0.04, 0)[0], base + r * 0.8 + 0.05, at(dx, dz, u + 0.04, 0)[1], r * 0.7, j + 1);
    }
    if (age === 0) {
      // branches sèches qui dépassent, ronces, baies noires de prunellier
      for (let i = 0; i < 3; i++) {
        const u = 0.1 + i * 0.14, s = i % 2 ? 1 : -1, [x, z] = at(dx, dz, u, s * 0.06);
        p.add(new THREE.CylinderGeometry(0.003, 0.005, 0.12, 3).translate(0, 0.06, 0), x, 0.1, z, 0x6a4a30, dx * 0.4 + i, false, s * 0.6);
      }
      for (let i = 0; i < 6; i++) { const [x, z] = at(dx, dz, 0.06 + i * 0.075, (i % 2 ? 1 : -1) * 0.07); p.sphere(0.008, x, 0.06 + H(i, dz + 4) * 0.08, z, i % 3 ? 0x2a2440 : 0x8a2a3a); }
    } else if (age === 1) {
      for (let i = 0; i < 7; i++) { const [x, z] = at(dx, dz, 0.05 + i * 0.065, (i % 2 ? 1 : -1) * 0.068); p.sphere(0.008, x, 0.06 + H(i, dz + 5) * 0.08, z, 0xf8f4ea); }
    } else {
      // églantines roses et aubépine blanche ; un nid dans la haie
      for (let i = 0; i < 8; i++) { const [x, z] = at(dx, dz, 0.04 + i * 0.058, (i % 2 ? 1 : -1) * 0.075); p.sphere(0.01, x, 0.05 + H(i, dz + 6) * 0.11, z, i % 3 === 0 ? 0xf4f0e8 : 0xf29ab0); }
    }
  }
  if (age === 2 && (v % 2 === 0)) { const [x, z] = at(list[0][0], list[0][1], 0.2, 0); p.cyl(0.03, 0.022, 0.02, 7, x, Hh + 0.01, z, 0x8a6a48); for (let k = 0; k < 3; k++) p.sphere(0.008, x + (k - 1) * 0.01, Hh + 0.03, z, 0xb8d8e8); }
  // la haie d'épineux est faite de pieux plantés que les ronces ont pris
  if (age === 0) for (const [dx, dz] of list) { const [x, z] = at(dx, dz, 0.4, 0); p.cyl(0.012, 0.016, Hh + 0.05, 5, x, 0, z, BARK); p.cone(0.013, 0.03, 5, x, Hh + 0.05, z, dk(BARK, 0.8)); }
}

// ---------------------------------------------------------------- clôtures

/**
 * Clôture, le long de chaque bras : palissade de pieux pointus liés de lanières (Préhistoire), muret de pierres sèches à
 * couvertine (Antiquité), plessis de branches tressées entre des piquets (Moyen Âge), barrière blanche à lattes pointues
 * (Industriel), grille de jardin vert sombre sur un muret (Moderne), barrière de lumière (Futuriste)
 */
function fence(p: Parts, age: number, mask: number, v: number) {
  const list = arms(mask);
  if (age === 0) {
    const post = (x: number, z: number, i: number) => { const h = 0.17 + H(i, 3) * 0.05; p.cyl(0.016, 0.019, h, 5, x, 0, z, vary(BARK, i, 2), false, i); p.cone(0.017, 0.04, 5, x, h, z, vary(0x9a7a52, i, 4), false, i); };
    post(0, 0, 0);
    for (const [dx, dz] of list) {
      for (let i = 1; i <= 6; i++) post(...at(dx, dz, i * 0.075, (H(i, dx + 9) - 0.5) * 0.01), i + dx * 7 + dz * 13);
      for (const y of [0.05, 0.13]) { const [x, z] = at(dx, dz, 0.25, 0.018); p.box(0.5, 0.012, 0.008, x, y, z, 0xb8945a, ryOf(dx)); }
    }
    // un crâne de bête accroché au pieu du milieu
    if (v % 3 === 0) { p.sphere(0.024, 0, 0.17, 0.03, 0xf0e8d8, 0, 0.8); p.box(0.02, 0.012, 0.018, 0, 0.15, 0.048, 0xf0e8d8); }
    return;
  }
  if (age === 1) {
    // pierres sèches en deux assises, couvertine de pierres posées de chant
    const stone = (x: number, y: number, z: number, i: number, ry: number) => p.add(new THREE.BoxGeometry(0.09 + H(i, 1) * 0.05, 0.05, 0.1).translate(0, 0.025, 0), x, y, z, vary(0xc8bca4, i, 3, 0.25), ry + (H(i, 2) - 0.5) * 0.2);
    stone(0, 0, 0, 0, 0); stone(0, 0.05, 0, 1, PI / 2);
    for (const [dx, dz] of list) {
      const ry = ryOf(dx);
      for (let i = 0; i < 4; i++) { const k = i + dx * 5 + dz * 9 + 30; stone(...at(dx, dz, 0.07 + i * 0.12, 0) as [number, number], 0, k, ry); }
      for (let i = 0; i < 4; i++) { const k = i + dx * 5 + dz * 9 + 60, [x, z] = at(dx, dz, 0.12 + i * 0.12, 0); stone(x, 0.05, z, k, ry); }
      for (let i = 0; i < 8; i++) { const [x, z] = at(dx, dz, 0.04 + i * 0.06, 0); p.box(0.03, 0.04, 0.11, x, 0.1, z, vary(0xb4a88e, i, dx + dz * 3 + 7, 0.25), ry, false, (H(i, 8) - 0.5) * 0.3); }
      // de la mousse et une touffe d'herbe au pied
      const [mx, mz] = at(dx, dz, 0.3, 0.05); p.sphere(0.02, mx, 0.01, mz, MOSS, 0, 0.5);
    }
    return;
  }
  if (age === 2) {
    // plessis : piquets, branches tressées passant devant et derrière
    p.cyl(0.014, 0.016, 0.17, 5, 0, 0, 0, BARK);
    for (const [dx, dz] of list) {
      for (const u of [0.24, 0.48]) { const [x, z] = at(dx, dz, u, 0); p.cyl(0.012, 0.014, 0.16, 5, x, 0, z, BARK); }
      for (let r = 0; r < 6; r++) {
        const y = 0.025 + r * 0.022, s = r % 2 ? 1 : -1;
        for (let i = 0; i < 4; i++) {
          const [x, z] = at(dx, dz, 0.06 + i * 0.12, s * (i % 2 ? 0.008 : -0.008));
          p.add(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 4).rotateZ(PI / 2), x, y, z, vary(0x9a7a4a, r, i + dx * 3), ryOf(dx));
        }
      }
    }
    return;
  }
  if (age === 3) {
    // barrière blanche : poteau à chapeau, deux lisses, lattes pointues
    const W = 0xf2efe6;
    p.box(0.03, 0.17, 0.03, 0, 0, 0, W); p.pyramid(0.036, 0.025, 0.036, 0, 0.17, 0, W);
    for (const [dx, dz] of list) {
      const ry = ryOf(dx);
      for (const y of [0.04, 0.11]) { const [x, z] = at(dx, dz, 0.25, -0.012); p.box(0.5, 0.016, 0.01, x, y, z, dk(W, 0.94), ry); }
      for (let i = 0; i < 6; i++) { const [x, z] = at(dx, dz, 0.06 + i * 0.08, 0); p.box(0.028, 0.13, 0.008, x, 0.01, z, W, ry); p.add(new THREE.ConeGeometry(0.02, 0.022, 4).rotateY(PI / 4).scale(1, 1, 0.3).translate(0, 0.011, 0), x, 0.14, z, W, ry); }
      const [px, pz] = at(dx, dz, 0.5, 0); p.box(0.028, 0.16, 0.028, px, 0, pz, W);
    }
    // des roses grimpantes sur une latte, de temps en temps
    if (v % 2) { const [dx, dz] = list[0]; for (let k = 0; k < 4; k++) { const [x, z] = at(dx, dz, 0.15 + k * 0.03, 0.012); p.sphere(0.012, x, 0.05 + k * 0.025, z, k % 2 ? 0xe85a6a : LEAF); } }
    return;
  }
  if (age === 4) {
    // grille de jardin : muret de béton, barreaux et lisses d'acier peint
    const G = 0x2e4a3a;
    p.box(0.06, 0.18, 0.06, 0, 0, 0, 0xb8b4ac); p.box(0.07, 0.012, 0.07, 0, 0.18, 0, 0x9a968e);
    for (const [dx, dz] of list) {
      const ry = ryOf(dx), [cx, cz] = at(dx, dz, 0.25, 0);
      p.box(0.5, 0.05, 0.05, cx, 0, cz, 0xb8b4ac, ry); p.box(0.5, 0.006, 0.056, cx, 0.05, cz, 0x9a968e, ry);
      for (const y of [0.07, 0.16]) p.box(0.5, 0.01, 0.01, cx, y, cz, G, ry);
      for (let i = 0; i < 9; i++) { const [x, z] = at(dx, dz, 0.04 + i * 0.055, 0); p.cyl(0.004, 0.004, 0.13, 4, x, 0.056, z, G); p.cone(0.007, 0.016, 4, x, 0.186, z, G); }
    }
    return;
  }
  // barrière de lumière : bornes blanches, rayons de néon entre elles
  p.cyl(0.02, 0.026, 0.16, 8, 0, 0, 0, WHITE); p.sphere(0.022, 0, 0.165, 0, PEARL); p.cyl(0.021, 0.021, 0.01, 8, 0, 0.12, 0, NEON, 'neon');
  for (const [dx, dz] of list) {
    const ry = ryOf(dx), [cx, cz] = at(dx, dz, 0.25, 0);
    for (const y of [0.05, 0.09, 0.13]) p.box(0.5, 0.012, 0.012, cx, y, cz, NEON, ry, 'neon');
    p.box(0.5, 0.02, 0.04, cx, 0, cz, PEARL, ry);
    const [ex, ez] = at(dx, dz, 0.48, 0); p.cyl(0.014, 0.018, 0.15, 6, ex, 0, ez, WHITE); p.sphere(0.016, ex, 0.155, ez, NEON);
  }
}

// ---------------------------------------------------------------- parterres

/** Une fleur : tige, corolle (cône renversé ou boule), cœur */
function bloom(p: Parts, x: number, y: number, z: number, c: number, s = 1, cup = false) {
  p.cyl(0.002, 0.003, 0.04 * s, 3, x, y, z, LEAF2);
  if (cup) { p.add(new THREE.ConeGeometry(0.014 * s, 0.026 * s, 5).rotateX(PI).translate(0, 0.013 * s, 0), x, y + 0.04 * s, z, c); }
  else { p.add(new THREE.IcosahedronGeometry(0.012 * s, 0).scale(1, 0.55, 1), x, y + 0.042 * s, z, c); p.sphere(0.005 * s, x, y + 0.048 * s, z, 0xf8e070); }
}

/**
 * Parterre de fleurs : fleurs des champs dans un rond de pierres (Préhistoire), rosiers dans une bordure de terre cuite et une
 * amphore (Antiquité), jardin de simples en planche surélevée, lavande et choux, plessis bas (Moyen Âge), rond de tulipes en
 * couronnes autour d'un palmier, bordure de briques (Industriel), massif fleuri en jardinière de béton, graminées (Moderne),
 * jardin suspendu : coupe blanche qui flotte, fleurs qui retombent, anneau de néon (Futuriste)
 */
function flowerbed(p: Parts, age: number, v: number) {
  const pal = (i: number) => BLOOMS[(i + v) % BLOOMS.length];
  if (age === 0) {
    for (let i = 0; i < 12; i++) { const t = (i / 12) * PI * 2; p.add(new THREE.DodecahedronGeometry(0.03 + H(i, 1) * 0.012, 0), Math.cos(t) * 0.34, 0.01, Math.sin(t) * 0.34, vary(STONE, i, 2, 0.3), t); }
    p.cyl(0.33, 0.33, 0.012, 12, 0, 0, 0, 0x6a8a3a);
    for (let i = 0; i < 26; i++) { const t = i * 2.4, r = 0.05 + Math.sqrt(i / 26) * 0.26; bloom(p, Math.cos(t) * r, 0.012, Math.sin(t) * r, [0xf2d24a, 0xf4f0e8, 0xb07ad8, 0xe85a6a][i % 4], 0.9 + H(i, 3) * 0.5); }
    for (let i = 0; i < 8; i++) { const t = i * 0.8 + 0.3, r = 0.12 + H(i, 5) * 0.18; p.cone(0.02, 0.07, 4, Math.cos(t) * r, 0.012, Math.sin(t) * r, vary(0x7a9a42, i, 6)); }
    return;
  }
  if (age === 1) {
    p.box(0.72, 0.05, 0.72, 0, 0, 0, 0xc87a5a); p.box(0.66, 0.012, 0.66, 0, 0.04, 0, 0x6a4a34);
    for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) p.sphere(0.03, x, 0.07, z, 0xd88a6a);
    for (let i = 0; i < 5; i++) {
      const x = -0.2 + (i % 3) * 0.2, z = i < 3 ? -0.14 : 0.14;
      p.add(new THREE.IcosahedronGeometry(0.08, 0).scale(1, 0.8, 1), x, 0.12, z, vary(0x4f7a3e, i, 1));
      for (let k = 0; k < 6; k++) { const t = k * 1.05 + i; p.sphere(0.016, x + Math.cos(t) * 0.07, 0.13 + (k % 3) * 0.025, z + Math.sin(t) * 0.07, i % 2 ? 0xd83a4a : 0xf29ab0); }
    }
    // l'amphore couchée dans le coin, d'où débordent des fleurs
    p.add(new THREE.CylinderGeometry(0.03, 0.045, 0.12, 8).rotateZ(PI / 2), 0.22, 0.09, 0.22, 0xc8784a, 0.6);
    p.cyl(0.018, 0.02, 0.03, 6, 0.27, 0.075, 0.25, 0xc8784a);
    return;
  }
  if (age === 2) {
    // planche surélevée de bois, plessis bas sur le devant, rangs de simples
    p.box(0.7, 0.07, 0.6, 0, 0, 0, OAK); p.box(0.66, 0.012, 0.56, 0, 0.065, 0, 0x5a3a24);
    for (const s of [-1, 1]) for (const t of [-1, 1]) p.box(0.04, 0.09, 0.04, s * 0.33, 0, t * 0.28, dk(OAK, 0.8));
    const rows = [[0xb07ad8, 'lav'], [0x6a9a5a, 'herb'], [0xa8c868, 'cab'], [0xf2d24a, 'flo']] as const;
    rows.forEach(([c, t], r) => {
      const z = -0.21 + r * 0.14;
      for (let i = 0; i < 6; i++) {
        const x = -0.26 + i * 0.104;
        if (t === 'lav') { p.cyl(0.02, 0.026, 0.03, 5, x, 0.077, z, 0x6a8a5a); for (let k = 0; k < 4; k++) p.cyl(0.004, 0.006, 0.06, 3, x + (k - 1.5) * 0.008, 0.1, z, c); }
        else if (t === 'cab') p.sphere(0.032, x, 0.1, z, vary(c, i, r), 0, 0.8);
        else if (t === 'herb') p.add(new THREE.IcosahedronGeometry(0.03, 0), x, 0.1, z, vary(c, i, r));
        else bloom(p, x, 0.077, z, i % 2 ? c : 0xf4f0e8, 1.2);
      }
    });
    // l'étiquette de bois et le panier de la cueillette
    p.box(0.004, 0.06, 0.004, 0.3, 0.07, 0.27, OAK); p.box(0.05, 0.03, 0.004, 0.3, 0.13, 0.27, 0xd8c8a0);
    p.cyl(0.04, 0.032, 0.04, 8, -0.4, 0, 0.36, 0xc8a070); p.add(new THREE.TorusGeometry(0.03, 0.004, 3, 8, PI), -0.4, 0.04, 0.36, 0xa88050);
    return;
  }
  if (age === 3) {
    // rond de tulipes : bordure de briques en dents de scie, couronnes de couleurs, palmier au centre
    p.cyl(0.38, 0.38, 0.03, 16, 0, 0, 0, 0x6a4a34);
    for (let i = 0; i < 20; i++) { const t = (i / 20) * PI * 2; p.box(0.05, 0.045, 0.02, Math.cos(t) * 0.38, 0, Math.sin(t) * 0.38, 0xb4685c, -t + PI / 2, false, 0.5); }
    for (const [r, n, c] of [[0.3, 16, 0xe83a3a], [0.2, 11, 0xf2d24a], [0.11, 6, 0xf4f0e8]] as [number, number, number][])
      for (let i = 0; i < n; i++) { const t = (i / n) * PI * 2 + r; bloom(p, Math.cos(t) * r, 0.03, Math.sin(t) * r, c, 1.3, true); }
    p.cyl(0.012, 0.018, 0.16, 5, 0, 0.03, 0, 0x8a7a5a);
    for (let k = 0; k < 7; k++) { const t = (k / 7) * PI * 2; p.add(new THREE.ConeGeometry(0.012, 0.14, 3).rotateZ(PI / 2).translate(0.07, 0, 0), 0, 0.19, 0, k % 2 ? 0x3f7a3a : 0x4f8a48, t, false, 0.4); }
    return;
  }
  if (age === 4) {
    // massif en jardinière de béton : vivaces en taches, graminées, galets
    p.box(0.74, 0.08, 0.74, 0, 0, 0, 0xb4b0a8); p.box(0.66, 0.012, 0.66, 0, 0.075, 0, 0x5a4234);
    for (let i = 0; i < 4; i++) { const x = i % 2 ? 0.16 : -0.16, z = i < 2 ? -0.16 : 0.16; p.add(new THREE.IcosahedronGeometry(0.1, 0).scale(1, 0.55, 1), x, 0.12, z, vary(0x5a8a48, i, 1)); for (let k = 0; k < 7; k++) { const t = k * 0.9 + i; p.sphere(0.014, x + Math.cos(t) * 0.07, 0.15 + (k % 2) * 0.015, z + Math.sin(t) * 0.07, pal(i + 1)); } }
    for (let k = 0; k < 9; k++) { const t = (k / 9) * PI * 2; p.add(new THREE.ConeGeometry(0.008, 0.16, 3), Math.cos(t) * 0.03, 0.16, Math.sin(t) * 0.03, 0xc8b878, 0, false, Math.cos(t) * 0.3, Math.sin(t) * 0.3); }
    for (let k = 0; k < 6; k++) p.sphere(0.016, -0.28 + k * 0.11, 0.085, 0.29, vary(0xd8d4cc, k, 3), 0, 0.5);
    return;
  }
  // jardin suspendu : socle, coupe blanche en lévitation, fleurs qui retombent, anneau de néon
  p.cyl(0.12, 0.16, 0.03, 10, 0, 0, 0, PEARL); p.cyl(0.1, 0.1, 0.006, 10, 0, 0.03, 0, NEON, 'neon');
  p.cyl(0.3, 0.16, 0.1, 12, 0, 0.12, 0, WHITE); p.cyl(0.28, 0.28, 0.01, 12, 0, 0.215, 0, 0x5a4234);
  p.add(new THREE.TorusGeometry(0.3, 0.008, 4, 24).rotateX(PI / 2), 0, 0.22, 0, NEON, 0, 'neon');
  for (let i = 0; i < 18; i++) { const t = i * 2.4, r = 0.04 + Math.sqrt(i / 18) * 0.2; bloom(p, Math.cos(t) * r, 0.22, Math.sin(t) * r, pal(i), 1.2); }
  // des retombées de feuillage fleuri sur le bord de la coupe
  for (let k = 0; k < 10; k++) { const t = (k / 10) * PI * 2 + 0.2; p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 1.6, 1), Math.cos(t) * 0.305, 0.18, Math.sin(t) * 0.305, k % 2 ? LEAF : LEAF2, t); p.sphere(0.011, Math.cos(t) * 0.32, 0.15, Math.sin(t) * 0.32, pal(k + 2)); }
}

// ---------------------------------------------------------------- bancs

/**
 * Banc : deux rondins sur des pierres et une souche (Préhistoire), banc de marbre à pieds de lion et un laurier en pot
 * (Antiquité), banc de chêne à dossier et un panier (Moyen Âge), banc de square de fonte et de lattes, corbeille et réverbère
 * (Industriel), banc public de lattes sur béton, corbeille et arbuste (Moderne), banc blanc qui flotte sur un liseré de néon
 * (Futuriste)
 */
function bench(p: Parts, age: number, v: number, kit: DecorKit) {
  if (age === 0) {
    for (const z of [-0.08, 0.12]) {
      for (const x of [-0.16, 0.16]) p.add(new THREE.DodecahedronGeometry(0.035, 0), x, 0.02, z, vary(STONE, x * 10 + z * 10, 1, 0.3));
      p.add(new THREE.CylinderGeometry(0.035, 0.038, 0.42, 7).rotateZ(PI / 2), 0, 0.075, z, vary(BARK, z * 10, 2), 0, false, 0, H(z * 10, 3) * 0.3);
      for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 7).rotateZ(PI / 2), s * 0.211, 0.075, z, 0xd8b88a);
    }
    p.cyl(0.05, 0.06, 0.09, 7, 0.3, 0, -0.25, BARK); p.cyl(0.048, 0.048, 0.004, 7, 0.3, 0.09, -0.25, 0xd8b88a);
    // le foyer éteint devant, et une peau jetée sur le rondin
    for (let i = 0; i < 6; i++) { const t = (i / 6) * PI * 2; p.add(new THREE.DodecahedronGeometry(0.02, 0), Math.cos(t) * 0.06 - 0.2, 0.01, Math.sin(t) * 0.06 + 0.3, 0x8a847a); }
    p.cyl(0.04, 0.04, 0.008, 6, -0.2, 0, 0.3, 0x2a2420);
    p.box(0.14, 0.006, 0.08, 0.05, 0.11, 0.12, 0xc8a07a, 0.2);
    return;
  }
  if (age === 1) {
    // dalle de marbre sur deux pieds sculptés en pattes de lion
    p.box(0.42, 0.012, 0.18, 0, 0, 0, TRAV);
    for (const s of [-1, 1]) {
      p.box(0.05, 0.08, 0.12, s * 0.15, 0.012, 0, MARBLE);
      p.sphere(0.025, s * 0.15, 0.03, 0.06, MARBLE, 0, 0.8);
      p.box(0.06, 0.012, 0.13, s * 0.15, 0.09, 0, dk(MARBLE, 0.95));
    }
    p.box(0.4, 0.025, 0.14, 0, 0.1, 0, MARBLE);
    p.box(0.4, 0.07, 0.02, 0, 0.125, -0.06, MARBLE); p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 6).rotateZ(PI / 2), 0, 0.2, -0.06, MARBLE);
    // le laurier en pot, de chaque côté
    for (const s of [-1, 1]) { p.cyl(0.04, 0.03, 0.06, 8, s * 0.32, 0.012, -0.02, 0xc8784a); p.add(new THREE.IcosahedronGeometry(0.06, 0), s * 0.32, 0.13, -0.02, 0x4f7a3e); p.cyl(0.006, 0.006, 0.05, 4, s * 0.32, 0.07, -0.02, BARK); }
    return;
  }
  if (age === 2) {
    p.box(0.42, 0.02, 0.12, 0, 0.07, 0.01, OAK);
    for (const s of [-1, 1]) { p.box(0.025, 0.07, 0.11, s * 0.17, 0, 0.01, dk(OAK, 0.85)); p.box(0.025, 0.18, 0.025, s * 0.17, 0.07, -0.05, dk(OAK, 0.85)); }
    p.box(0.42, 0.06, 0.016, 0, 0.15, -0.05, OAK); p.box(0.44, 0.014, 0.03, 0, 0.21, -0.05, dk(OAK, 0.8));
    p.box(0.38, 0.012, 0.012, 0, 0.03, 0.01, dk(OAK, 0.75));
    // le panier d'osier et sa toile, une cruche
    p.cyl(0.04, 0.034, 0.05, 8, 0.27, 0, 0.12, 0xc8a070); p.add(new THREE.TorusGeometry(0.035, 0.004, 3, 8, PI), 0.27, 0.05, 0.12, 0xa88050); p.box(0.05, 0.008, 0.05, 0.27, 0.05, 0.12, 0xe8d8b8, 0.4);
    p.cyl(0.02, 0.026, 0.06, 7, -0.25, 0, 0.1, 0x9a6a44); p.cyl(0.01, 0.018, 0.02, 6, -0.25, 0.06, 0.1, 0x9a6a44);
    return;
  }
  if (age === 3) {
    // banc de square : pieds de fonte à volutes, lattes peintes, accoudoirs ; corbeille et réverbère à gaz
    const wood = [0x5a8a5a, 0x8a5a3a, 0x3a5a7a][v % 3];
    for (const s of [-1, 1]) {
      p.box(0.014, 0.06, 0.1, s * 0.17, 0, 0, IRON); p.add(new THREE.TorusGeometry(0.02, 0.004, 3, 8, PI), s * 0.17, 0.02, 0.05, IRON, PI / 2);
      p.box(0.014, 0.1, 0.014, s * 0.17, 0.06, -0.045, IRON, 0, false, 0); p.box(0.014, 0.012, 0.09, s * 0.17, 0.1, 0, IRON);
    }
    for (let i = 0; i < 3; i++) p.box(0.38, 0.008, 0.026, 0, 0.06, 0.03 - i * 0.03, wood);
    for (let i = 0; i < 3; i++) p.box(0.38, 0.022, 0.006, 0, 0.09 + i * 0.03, -0.055, wood);
    p.cyl(0.035, 0.03, 0.08, 8, 0.32, 0, 0.1, IRON); p.cyl(0.037, 0.037, 0.008, 8, 0.32, 0.08, 0.1, dk(IRON, 1.3));
    p.cyl(0.008, 0.012, 0.42, 6, -0.34, 0, -0.18, IRON); p.cyl(0.02, 0.015, 0.012, 6, -0.34, 0.42, -0.18, IRON);
    p.cyl(0.028, 0.02, 0.05, 6, -0.34, 0.432, -0.18, 0xffe2a0, true); p.cone(0.035, 0.03, 6, -0.34, 0.482, -0.18, IRON);
    return;
  }
  if (age === 4) {
    // lattes de bois sur deux blocs de béton, corbeille d'acier, arbuste en bac
    for (const s of [-1, 1]) p.box(0.06, 0.07, 0.14, s * 0.15, 0, 0, 0xb4b0a8);
    for (let i = 0; i < 4; i++) p.box(0.44, 0.01, 0.028, 0, 0.07, 0.05 - i * 0.034, i % 2 ? 0xb08050 : 0xa07040);
    for (let i = 0; i < 3; i++) p.box(0.44, 0.024, 0.008, 0, 0.1 + i * 0.03, -0.075, 0xa07040, 0, false, 0);
    for (const s of [-1, 1]) p.box(0.01, 0.12, 0.01, s * 0.15, 0.07, -0.075, 0x5d6168);
    p.cyl(0.035, 0.035, 0.1, 8, 0.34, 0, 0.12, 0x5d6168); p.cyl(0.03, 0.03, 0.004, 8, 0.34, 0.1, 0.12, 0x2a2a2e);
    p.box(0.14, 0.08, 0.14, -0.32, 0, -0.2, 0x9a968e); p.add(new THREE.IcosahedronGeometry(0.075, 0), -0.32, 0.15, -0.2, 0x5a9450);
    return;
  }
  // banc flottant : socle bas et liseré de néon, coque blanche au-dessus du sol, assise et dossier courbés, coussins bleus
  p.cyl(0.05, 0.06, 0.02, 8, -0.12, 0, 0, PEARL); p.cyl(0.05, 0.06, 0.02, 8, 0.12, 0, 0, PEARL);
  for (const x of [-0.12, 0.12]) p.cyl(0.04, 0.04, 0.006, 8, x, 0.02, 0, NEON, 'neon');
  p.box(0.44, 0.03, 0.15, 0, 0.07, 0.01, WHITE);
  p.add(new THREE.BoxGeometry(0.44, 0.022, 0.03), 0, 0.072, 0.09, WHITE, 0, false, 0, 0.5);
  p.add(new THREE.BoxGeometry(0.44, 0.13, 0.03).translate(0, 0.065, 0), 0, 0.09, -0.065, WHITE, 0, false, 0, -0.22);
  for (const x of [-0.11, 0.11]) { p.box(0.2, 0.014, 0.12, x, 0.1, 0.012, 0x6ab8e8); p.add(new THREE.BoxGeometry(0.2, 0.08, 0.014).translate(0, 0.04, 0), x, 0.115, -0.045, 0x6ab8e8, 0, false, 0, -0.22); }
  for (const s of [-1, 1]) p.box(0.02, 0.06, 0.16, s * 0.23, 0.07, 0, PEARL);
  p.box(0.44, 0.004, 0.004, 0, 0.068, 0.088, NEON, 0, 'neon');
  // la tablette lumineuse à côté, et son gobelet
  p.cyl(0.035, 0.035, 0.008, 10, 0.32, 0.1, 0.05, WHITE); p.cyl(0.006, 0.01, 0.1, 5, 0.32, 0, 0.05, PEARL); p.cyl(0.034, 0.034, 0.003, 10, 0.32, 0.097, 0.05, NEON, 'neon');
  p.cyl(0.01, 0.008, 0.025, 6, 0.32, 0.108, 0.05, 0xf2a03a);
  void kit;
}

// ---------------------------------------------------------------- statues

/** Une figure debout (statue) : socle des pieds, robe, buste, tête, bras ; `arm` : le bras droit levé (radians) */
function figureStatue(p: Parts, y: number, c: number, s = 1, arm = -0.6, robe = true) {
  if (robe) p.cyl(0.03 * s, 0.05 * s, 0.13 * s, 7, 0, y, 0, c);
  else for (const x of [-1, 1]) p.cyl(0.012 * s, 0.014 * s, 0.11 * s, 5, x * 0.018 * s, y, 0, c);
  p.cyl(0.035 * s, 0.03 * s, 0.07 * s, 7, 0, y + 0.12 * s, 0, c);
  p.sphere(0.022 * s, 0, y + 0.215 * s, 0, c, 1);
  p.add(new THREE.CylinderGeometry(0.009 * s, 0.009 * s, 0.08 * s, 5).translate(0, 0.04 * s, 0), 0.04 * s, y + 0.17 * s, 0, c, 0, false, arm);
  p.add(new THREE.CylinderGeometry(0.009 * s, 0.009 * s, 0.075 * s, 5).translate(0, -0.037 * s, 0), -0.04 * s, y + 0.18 * s, 0.005 * s, c, 0, false, -0.15);
}

/**
 * Statue : totem de bois sculpté de trois visages, ailes et bec, peint d'ocre (Préhistoire), figure de marbre drapée sur un
 * piédestal mouluré, lauriers (Antiquité), saint de pierre à l'auréole dorée devant sa niche, bougies (Moyen Âge), figure de
 * bronze patiné sur un socle de granit à plaque (Industriel), sculpture d'acier rouge en ruban (Moderne), figure de lumière sur
 * un piédestal blanc à anneaux (Futuriste)
 */
function statue(p: Parts, age: number, v: number, kit: DecorKit) {
  if (age === 0) {
    for (let i = 0; i < 7; i++) { const t = (i / 7) * PI * 2; p.add(new THREE.DodecahedronGeometry(0.035, 0), Math.cos(t) * 0.09, 0.015, Math.sin(t) * 0.09, vary(STONE, i, 1, 0.3), t); }
    const W = 0x9a6a40, R = 0xb84a2a, K = 0x2a1a12, O = 0xd8a040;
    p.cyl(0.05, 0.055, 0.5, 7, 0, 0, 0, W);
    // trois visages l'un sur l'autre : yeux, bouche, nez ; le bas peint d'ocre rouge
    for (const [y, c] of [[0.1, R], [0.24, O], [0.38, W]] as [number, number][]) {
      p.cyl(0.056, 0.056, 0.012, 7, 0, y - 0.01, 0, dk(c, 0.75));
      for (const s of [-1, 1]) { p.box(0.022, 0.016, 0.01, s * 0.022, y + 0.05, 0.05, 0xf4ecdc); p.box(0.01, 0.01, 0.006, s * 0.022, y + 0.053, 0.055, K); }
      p.box(0.05, 0.012, 0.01, 0, y + 0.012, 0.052, K); p.cone(0.012, 0.03, 4, 0, y + 0.03, 0.05, dk(c, 0.9));
    }
    // ailes déployées et bec du grand oiseau au sommet
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.14, 0.05, 0.016).translate(s * 0.07, 0, 0), s * 0.04, 0.47, 0, s > 0 ? R : O, 0, false, s * 0.25);
    p.add(new THREE.ConeGeometry(0.02, 0.07, 4).rotateX(PI / 2), 0, 0.5, 0.06, O);
    p.sphere(0.05, 0, 0.53, 0, W, 0, 0.8); for (const s of [-1, 1]) p.sphere(0.01, s * 0.025, 0.54, 0.04, K);
    // plumes accrochées et une offrande au pied
    for (const s of [-1, 1]) { p.add(new THREE.BoxGeometry(0.008, 0.06, 0.002).translate(0, -0.03, 0), s * 0.06, 0.32, 0.02, s > 0 ? 0xf4f0e8 : 0x3a6a8a, 0, false, s * 0.3); }
    p.cyl(0.025, 0.02, 0.025, 6, 0.1, 0, 0.1, 0x9a6a44); for (let k = 0; k < 3; k++) p.sphere(0.008, 0.1 + (k - 1) * 0.01, 0.03, 0.1, 0xd84a3e);
    return;
  }
  if (age === 1) {
    p.box(0.36, 0.03, 0.36, 0, 0, 0, TRAV); p.box(0.3, 0.025, 0.3, 0, 0.03, 0, MARBLE);
    p.box(0.18, 0.02, 0.18, 0, 0.055, 0, TRAV); p.box(0.14, 0.15, 0.14, 0, 0.075, 0, MARBLE); p.box(0.17, 0.02, 0.17, 0, 0.225, 0, TRAV);
    p.box(0.1, 0.03, 0.004, 0, 0.13, 0.071, 0xc8b89a);
    figureStatue(p, 0.245, 0xf4ecdc, 1.15, -0.9);
    // la couronne de laurier dorée, la lance tenue droite
    p.add(new THREE.TorusGeometry(0.024, 0.004, 3, 8).rotateX(PI / 2), 0, 0.5, 0, 0xe8c66a);
    p.cyl(0.004, 0.004, 0.3, 4, -0.05, 0.25, 0.01, 0xd8ccb4);
    for (const s of [-1, 1]) { p.cyl(0.006, 0.008, 0.12, 4, s * 0.17, 0.03, 0.17, BARK); p.cone(0.04, 0.2, 6, s * 0.17, 0.1, 0.17, 0x3f6a3a); }
    return;
  }
  if (age === 2) {
    // la niche de pierre à arc, le saint en robe brune, l'auréole d'or ; marches, bougies
    p.box(0.34, 0.03, 0.26, 0, 0, 0.02, 0xa8a090); p.box(0.28, 0.03, 0.2, 0, 0.03, 0.02, 0xb8b0a0);
    p.box(0.3, 0.42, 0.06, 0, 0.06, -0.1, 0xb8b0a0);
    p.add(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10, 1, false, -PI / 2, PI).rotateX(PI / 2), 0, 0.48, -0.1, 0xb8b0a0);
    p.box(0.2, 0.36, 0.01, 0, 0.08, -0.068, 0x3a4a6a);
    p.add(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 10, 1, false, -PI / 2, PI).rotateX(PI / 2), 0, 0.44, -0.068, 0x3a4a6a);
    p.cyl(0.06, 0.07, 0.04, 8, 0, 0.06, 0, 0xc8c0b0);
    figureStatue(p, 0.1, 0xd8d0c0, 1.2, -2.6);
    p.add(new THREE.TorusGeometry(0.035, 0.005, 3, 12), 0, 0.37, -0.02, 0xe8c66a, 0, true);
    for (const s of [-1, 1]) { p.cyl(0.01, 0.01, 0.04, 6, s * 0.1, 0.06, 0.1, 0xf4f0e0); kit.flame(s * 0.1, 0.1, 0.1, 0.25); }
    p.add(new THREE.IcosahedronGeometry(0.03, 0), 0.13, 0.08, 0.06, 0xf29ab0);
    return;
  }
  if (age === 3) {
    // socle de granit à corniche, plaque de bronze ; figure de bronze patiné, en redingote, le bras tendu
    p.box(0.34, 0.03, 0.34, 0, 0, 0, 0x8a8a8e); p.box(0.22, 0.2, 0.22, 0, 0.03, 0, 0x9a9a9e); p.box(0.26, 0.03, 0.26, 0, 0.23, 0, 0x8a8a8e);
    p.box(0.1, 0.05, 0.004, 0, 0.12, 0.112, 0xb8843a);
    for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) { p.cyl(0.008, 0.01, 0.1, 5, x, 0.03, z, IRON); p.sphere(0.012, x, 0.135, z, IRON); }
    figureStatue(p, 0.26, BRONZE, 1.25, -1.5, true);
    // la redingote qui s'ouvre, le chapeau tenu à la main, les plis du manteau
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.03, 0.1, 0.012), s * 0.025, 0.29, 0.035, dk(BRONZE, 0.85), 0, false, s * 0.12);
    p.cyl(0.018, 0.018, 0.03, 7, -0.06, 0.4, 0.01, dk(BRONZE, 0.7)); p.cyl(0.028, 0.028, 0.004, 8, -0.06, 0.4, 0.01, dk(BRONZE, 0.7));
    // la couronne de fleurs déposée au pied du socle, et deux pots de géraniums
    p.add(new THREE.TorusGeometry(0.04, 0.012, 4, 10), 0, 0.075, 0.125, 0x3f6a3a, 0, false, 0, -0.3);
    for (let k = 0; k < 6; k++) { const t = (k / 6) * PI * 2; p.sphere(0.009, Math.cos(t) * 0.04, 0.075 + Math.sin(t) * 0.04 * 0.95, 0.128 + Math.sin(t) * 0.012, k % 2 ? 0xe83a3a : 0xf4f0e8); }
    for (const s of [-1, 1]) { p.cyl(0.03, 0.022, 0.04, 8, s * 0.13, 0.03, 0.13, 0xb8684a); p.add(new THREE.IcosahedronGeometry(0.032, 0), s * 0.13, 0.085, 0.13, LEAF); for (let k = 0; k < 3; k++) p.sphere(0.01, s * 0.13 + (k - 1) * 0.018, 0.105, 0.14, 0xe83a3a); }
    p.cyl(0.04, 0.045, 0.012, 7, 0, 0.42, 0, BRONZE);
    p.cyl(0.02, 0.026, 0.04, 6, 0, 0.53, 0, dk(BRONZE, 0.8));
    // un pigeon sur la tête
    p.sphere(0.012, 0, 0.56, 0.005, 0x9aa0a8, 0, 0.8);
    return;
  }
  if (age === 4) {
    // sculpture moderne : socle bas de béton, ruban d'acier rouge qui se tord en boucle, bloc de pierre polie
    p.box(0.3, 0.05, 0.3, 0, 0, 0, 0xc8c4bc);
    const red = [0xd83a2a, 0x2a6ad8, 0xf2c23a][v % 3];
    p.add(new THREE.TorusKnotGeometry(0.075, 0.014, 48, 5, 2, 3), 0, 0.2, 0, red, 0.4);
    p.cyl(0.016, 0.024, 0.09, 6, 0, 0.05, 0, 0x5d6168);
    p.box(0.08, 0.06, 0.06, 0.1, 0.05, 0.08, 0x3a3a40, 0.3);
    p.box(0.08, 0.004, 0.03, -0.1, 0.05, 0.13, 0xe8e4dc);
    return;
  }
  // figure de lumière, anneaux qui tournent autour du piédestal blanc
  p.cyl(0.14, 0.16, 0.04, 12, 0, 0, 0, WHITE); p.cyl(0.08, 0.1, 0.14, 10, 0, 0.04, 0, PEARL); p.cyl(0.11, 0.11, 0.008, 12, 0, 0.18, 0, NEON, 'neon');
  p.add(new THREE.TorusGeometry(0.15, 0.005, 4, 24).rotateX(PI / 2), 0, 0.05, 0, NEON, 0, 'neon');
  const spin = kit.sway([0, 0.3, 0], [0, 1, 0], 0.6, 0.15);
  spin.add(new THREE.TorusGeometry(0.11, 0.004, 4, 20).rotateX(1.2), 0, 0, 0, 0xff5ad8, 0, 'neon');
  figureStatue(p, 0.19, 0x8ae8ff, 1.15, -2.4);
  // (le corps de lumière brille la nuit : une copie fine, en néon, sur la figure)
  p.cyl(0.012, 0.03, 0.2, 6, 0, 0.2, 0, NEON, 'neon');
}

// ---------------------------------------------------------------- pavés

/**
 * Pavés, d'un bord à l'autre de la case (deux cases voisines se suivent sans couture) : pierres plates dans la terre
 * (Préhistoire), dallage de marbre à joints (Antiquité), pavés de grès en rangs (Moyen Âge), briques en arêtes de poisson
 * (Industriel), dalles de béton à joints (Moderne), dalles blanches aux joints lumineux (Futuriste)
 */
function paving(p: Parts, age: number, v: number) {
  const Y = 0.008;
  if (age === 0) {
    // (pas de terre battue en dessous : les pierres sont posées dans l'herbe, qui pousse entre elles)
    for (let i = 0; i < 9; i++) {
      const x = -0.33 + (i % 3) * 0.33 + (H(i, v) - 0.5) * 0.08, z = -0.33 + Math.floor(i / 3) * 0.33 + (H(i, v + 1) - 0.5) * 0.08;
      p.cyl(0.12 + H(i, 3) * 0.03, 0.13 + H(i, 3) * 0.03, 0.014, 6, x, Y - 0.004, z, vary(0xb8b0a0, i, 4, 0.25), false, H(i, 5) * 2);
    }
    for (let i = 0; i < 6; i++) p.cone(0.02, 0.04, 3, -0.45 + H(i, 6) * 0.9, Y, -0.45 + H(i, 7) * 0.9, 0x7a9a42);
    return;
  }
  if (age === 1) {
    p.box(1, Y, 1, 0, 0, 0, 0xc8bca4);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) p.box(0.31, 0.01, 0.31, -0.33 + i * 0.33, Y, -0.33 + j * 0.33, vary(MARBLE, i, j, 0.12));
    p.add(new THREE.TorusGeometry(0.06, 0.008, 3, 12).rotateX(PI / 2), 0, Y + 0.01, 0, 0xb84a2a);
    return;
  }
  if (age === 2) {
    p.box(1, Y, 1, 0, 0, 0, 0x8a847a);
    for (let r = 0; r < 8; r++) for (let i = 0; i < 6; i++) {
      const x = -0.5 + (i + (r % 2 ? 0.5 : 0) + 0.5) * (1 / 6), z = -0.5 + (r + 0.5) / 8;
      if (x > 0.48) continue;
      p.box(0.15, 0.012, 0.11, x, Y, z, vary(0xa8a296, i + r * 7, v, 0.25));
    }
    return;
  }
  if (age === 3) {
    // briques en arêtes de poisson, bordure de briques de chant
    p.box(1, Y, 1, 0, 0, 0, 0x8a5a4a);
    for (let r = 0; r < 7; r++) for (let i = 0; i < 7; i++) {
      const x = -0.43 + i * 0.143, z = -0.43 + r * 0.143;
      p.box(0.12, 0.012, 0.055, x + 0.02, Y, z - 0.03, vary(0xc8705a, i, r, 0.25), (i + r) % 2 ? PI / 4 : -PI / 4);
    }
    return;
  }
  if (age === 4) {
    p.box(1, Y, 1, 0, 0, 0, 0x8a8884);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) p.box(0.235, 0.012, 0.235, -0.375 + i * 0.25, Y, -0.375 + j * 0.25, vary(0xc8c4bc, i, j + v, 0.12));
    // la grille d'égout, la plaque de regard, une touffe d'herbe entre deux dalles
    p.box(0.1, 0.004, 0.06, 0.25, Y + 0.012, -0.375, 0x5d6168); for (let k = 0; k < 4; k++) p.box(0.006, 0.005, 0.05, 0.215 + k * 0.023, Y + 0.013, -0.375, 0x2a2a2e);
    if (v % 2) p.cyl(0.05, 0.05, 0.004, 10, -0.25, Y + 0.012, 0.25, 0x6a6e76);
    for (let k = 0; k < 3; k++) p.cone(0.008, 0.04, 3, 0.002 + k * 0.006, Y, 0.002 - k * 0.005, 0x6a9a42);
    return;
  }
  p.box(1, Y, 1, 0, 0, 0, NEON, 0, 'neon');
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) p.box(0.32, 0.014, 0.32, -0.333 + i * 0.333, Y, -0.333 + j * 0.333, (i + j) % 2 ? WHITE : PEARL);
}

// ---------------------------------------------------------------- fontaines

/**
 * Fontaine : source dans un rond de pierres moussues, goulotte de bois d'où coule l'eau, fougères (Préhistoire), bassin de
 * marbre et stèle à tête de lion qui crache (Antiquité), bassin octogonal de pierre, colonne et vasque à quatre becs (Moyen
 * Âge), fontaine de fonte à deux vasques sur quatre cariatides (Industriel), bassin carré aux jets en ligne (Moderne), sphère
 * d'eau en apesanteur au-dessus d'un anneau de lumière (Futuriste)
 */
function fountain(p: Parts, age: number, v: number, kit: DecorKit) {
  if (age === 0) {
    for (let i = 0; i < 11; i++) { const t = (i / 11) * PI * 2; p.add(new THREE.DodecahedronGeometry(0.05 + H(i, 1) * 0.02, 0), Math.cos(t) * 0.27, 0.02, Math.sin(t) * 0.27, i % 3 ? vary(STONE, i, 2, 0.3) : MOSS, t); }
    kit.waterPool(p, 0, 0.02, 0, 0.25, 12);
    // la goulotte de bois creusée, posée sur une fourche, et le filet d'eau
    p.add(new THREE.BoxGeometry(0.04, 0.02, 0.26), 0, 0.14, -0.28, BARK, 0, false, 0, -0.3);
    p.add(new THREE.CylinderGeometry(0.006, 0.008, 0.14, 4).translate(0, 0.07, 0), -0.02, 0, -0.18, BARK, 0, false, 0.2);
    p.add(new THREE.CylinderGeometry(0.006, 0.008, 0.14, 4).translate(0, 0.07, 0), 0.02, 0, -0.18, BARK, 0, false, -0.2);
    p.cyl(0.006, 0.01, 0.1, 4, 0, 0.02, -0.15, 0xd8f2fa);
    p.add(new THREE.DodecahedronGeometry(0.1, 0), 0, 0.05, -0.42, vary(STONE, 9, 3), 0.4);
    for (let i = 0; i < 4; i++) { const t = 0.5 + i * 1.6; for (let k = 0; k < 4; k++) p.add(new THREE.ConeGeometry(0.012, 0.09, 3).translate(0, 0.045, 0), Math.cos(t) * 0.36, 0.01, Math.sin(t) * 0.36, LEAF2, k * 1.5, false, 0.6); }
    return;
  }
  if (age === 1) {
    p.box(0.62, 0.05, 0.5, 0, 0, 0.06, TRAV); p.box(0.56, 0.02, 0.44, 0, 0.03, 0.06, MARBLE);
    kit.waterPool(p, 0, 0.06, 0.06, 0.2, 10, false);
    p.box(0.5, 0.035, 0.38, 0, 0.026, 0.06, 0x5aa8c8);
    p.box(0.4, 0.34, 0.08, 0, 0.05, -0.2, MARBLE); p.box(0.44, 0.03, 0.1, 0, 0.39, -0.2, TRAV);
    p.add(new THREE.ConeGeometry(0.25, 0.08, 4, 1).rotateY(PI / 4).scale(1, 1, 0.25), 0, 0.46, -0.2, TRAV);
    // la tête de lion qui crache
    p.sphere(0.05, 0, 0.24, -0.15, 0xd8b048, 0); p.sphere(0.028, 0, 0.23, -0.11, 0xc8a038, 0, 0.8);
    p.add(new THREE.CylinderGeometry(0.006, 0.01, 0.17, 4).translate(0, -0.085, 0), 0, 0.22, -0.1, 0xd8f2fa, 0, false, 0, 0.7);
    for (const s of [-1, 1]) { p.cyl(0.02, 0.022, 0.3, 8, s * 0.16, 0.05, -0.15, MARBLE); p.box(0.05, 0.02, 0.05, s * 0.16, 0.35, -0.15, TRAV); }
    return;
  }
  if (age === 2) {
    p.cyl(0.36, 0.38, 0.08, 8, 0, 0, 0, 0xb8b0a0, false, PI / 8); p.cyl(0.32, 0.32, 0.02, 8, 0, 0.07, 0, 0xa8a090, false, PI / 8);
    kit.waterPool(p, 0, 0.075, 0, 0.31, 8, true, PI / 8);
    p.cyl(0.05, 0.06, 0.22, 8, 0, 0.07, 0, 0xc8c0b0);
    p.cyl(0.14, 0.06, 0.05, 8, 0, 0.27, 0, 0xc8c0b0); p.cyl(0.12, 0.12, 0.004, 8, 0, 0.316, 0, 0x5aa8c8);
    p.cyl(0.03, 0.04, 0.1, 8, 0, 0.32, 0, 0xc8c0b0); p.cone(0.04, 0.06, 8, 0, 0.42, 0, 0x8a8a7a); p.sphere(0.015, 0, 0.49, 0, 0xe8c66a);
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * PI * 2;
      p.add(new THREE.CylinderGeometry(0.008, 0.01, 0.05, 5).rotateZ(PI / 2), Math.cos(t) * 0.15, 0.29, Math.sin(t) * 0.15, 0x8a8a7a, -t);
      p.add(new THREE.CylinderGeometry(0.008, 0.004, 0.04, 4).rotateZ(PI / 2), Math.cos(t) * 0.18, 0.285, Math.sin(t) * 0.18, 0xd8f2fa, -t);
      p.cyl(0.006, 0.004, 0.2, 4, Math.cos(t) * 0.2, 0.08, Math.sin(t) * 0.2, 0xd8f2fa);
      p.sphere(0.012, Math.cos(t) * 0.2, 0.08, Math.sin(t) * 0.2, 0xf2fbff, 0, 0.4);
    }
    return;
  }
  if (age === 3) {
    // fonte vert sombre : bassin rond à rebord, quatre cariatides, deux vasques, dôme et son fleuron
    const G = 0x2c4a3e;
    p.cyl(0.36, 0.37, 0.07, 14, 0, 0, 0, 0x9a9a9e); p.add(new THREE.TorusGeometry(0.35, 0.02, 4, 18).rotateX(PI / 2), 0, 0.07, 0, 0x8a8a8e);
    kit.waterPool(p, 0, 0.065, 0, 0.33, 14);
    p.cyl(0.08, 0.1, 0.05, 8, 0, 0.06, 0, G);
    for (let k = 0; k < 4; k++) { const t = (k / 4) * PI * 2 + PI / 4; p.cyl(0.012, 0.018, 0.14, 6, Math.cos(t) * 0.05, 0.11, Math.sin(t) * 0.05, G); p.sphere(0.014, Math.cos(t) * 0.05, 0.26, Math.sin(t) * 0.05, G); }
    p.cyl(0.18, 0.06, 0.04, 12, 0, 0.27, 0, G); p.cyl(0.16, 0.16, 0.004, 12, 0, 0.31, 0, 0x5aa8c8);
    p.cyl(0.025, 0.03, 0.1, 6, 0, 0.31, 0, G); p.cyl(0.09, 0.03, 0.03, 10, 0, 0.4, 0, G);
    p.add(new THREE.SphereGeometry(0.05, 8, 4, 0, PI * 2, 0, PI / 2), 0, 0.43, 0, G); p.sphere(0.012, 0, 0.49, 0, 0xc8a24a);
    // l'eau déborde de la vasque en six filets qui tombent droit dans le bassin
    for (let k = 0; k < 6; k++) { const t = (k / 6) * PI * 2; p.cyl(0.005, 0.003, 0.23, 4, Math.cos(t) * 0.185, 0.065, Math.sin(t) * 0.185, 0xd8f2fa); p.sphere(0.012, Math.cos(t) * 0.185, 0.068, Math.sin(t) * 0.185, 0xf2fbff, 0, 0.4); }
    kit.waterJet(p, 0, 0.5, 0, 0.06);
    return;
  }
  if (age === 4) {
    p.box(0.8, 0.06, 0.6, 0, 0, 0, 0xc8c4bc); p.box(0.72, 0.02, 0.52, 0, 0.045, 0, 0x5aa8c8);
    p.box(0.68, 0.004, 0.48, 0, 0.06, 0, 0x8fd0e0);
    for (const i of [0, 1, 3, 4]) kit.waterJet(p, -0.28 + i * 0.14, 0.06, 0, 0.1 + (i % 2) * 0.08);
    for (const s of [-1, 1]) { p.box(0.82, 0.014, 0.05, 0, 0.06, s * 0.29, 0xd8d4cc); p.box(0.05, 0.014, 0.6, s * 0.39, 0.06, 0, 0xd8d4cc); }
    // la sphère d'acier poli, posée sur son socle au milieu des jets, que l'eau fait briller
    p.cyl(0.04, 0.05, 0.04, 8, 0, 0.05, 0, 0x8a8f96); p.sphere(0.075, 0, 0.16, 0, 0xc8d0d8, 1); p.sphere(0.03, 0.03, 0.2, 0.04, 0xeef4f8, 0);
    for (const i of [0, 1, 3, 4]) p.cyl(0.012, 0.012, 0.006, 6, -0.28 + i * 0.14, 0.058, 0.1, 0xfff1c9, true);
    for (const s of [-1, 1]) { p.box(0.08, 0.004, 0.03, s * 0.3, 0.074, 0.29, 0xb8843a); }
    void v;
    return;
  }
  p.cyl(0.3, 0.32, 0.04, 16, 0, 0, 0, WHITE); p.cyl(0.26, 0.26, 0.01, 16, 0, 0.04, 0, NEON, 'neon');
  kit.waterPool(p, 0, 0.05, 0, 0.24, 14);
  for (let k = 0; k < 3; k++) { const t = (k / 3) * PI * 2; p.cyl(0.01, 0.016, 0.22, 6, Math.cos(t) * 0.2, 0.04, Math.sin(t) * 0.2, PEARL); p.sphere(0.014, Math.cos(t) * 0.2, 0.27, Math.sin(t) * 0.2, NEON); }
  // la sphère d'eau, qui tourne doucement, et ses gouttes en orbite
  const orb = kit.sway([0, 0.36, 0], [0, 1, 0], 0.8, 0.12);
  orb.add(new THREE.IcosahedronGeometry(0.1, 1), 0, 0, 0, 0x6ac4e8);
  orb.add(new THREE.IcosahedronGeometry(0.075, 1), 0, 0, 0, 0x9adcf2);
  for (let k = 0; k < 6; k++) { const t = (k / 6) * PI * 2; orb.sphere(0.014, Math.cos(t) * 0.16, Math.sin(t * 2) * 0.03, Math.sin(t) * 0.16, 0xd8f2fa); }
  p.add(new THREE.TorusGeometry(0.2, 0.006, 4, 24).rotateX(PI / 2), 0, 0.27, 0, NEON, 0, 'neon');
}
