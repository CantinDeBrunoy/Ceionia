import * as THREE from 'three';
import { Parts } from './parts';
import { hash2 } from '../core/rng';
import { KindId } from '../build/catalog';
import { WALL_N, WALL_E, WALL_S, WALL_W } from './hellBase';

/**
 * Les décorations libres, d'un âge à l'autre (1 case, façade vers +z, origine au centre de la case) : haie, clôture, parterre
 * de fleurs, banc, statue, pavés, fontaine, et les lampadaires modernes. Haies et clôtures suivent leur masque (`mask` : les
 * côtés où elles rejoignent une voisine), comme les remparts. Les aides du moteur de modèles (flamme, eau, pièces qui se
 * balancent) arrivent par `DecorKit` pour ne pas importer models.ts.
 * Seconde passe de détails (demande de l'auteur, 20 nov. 2026 : « toutes les décorations manquent de détails ») : feuillage en
 * touffes et petites fleurs, bancs à lattes, accoudoirs et pieds de fonte, socles moulurés et personnages lisibles, fontaines à
 * margelle, vasque et jet. Chaque modèle reste sous 3 000 triangles (`tests/rendu.test.ts`)
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
const BRONZE = 0x6a8a74, LEAF = 0x5f9a52, LEAF2 = 0x4a8444, NEON = 0x5af0ff, PEARL = 0xe8eef2, WHITE = 0xf4f6f8, GOLD = 0xe8c66a;
const WATER = 0x6cc4e0, SPRAY = 0xd8f2fa;
/** quelques fleurs (les couleurs vives du jeu) */
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

// ---------------------------------------------------------------- petites pièces partagées

/** Une touffe de feuillage : quatre boules serrées de verts voisins, un peu aplaties, autour de (x, y, z) */
function tuft(p: Parts, x: number, y: number, z: number, r: number, c: number, seed: number) {
  for (let k = 0; k < 4; k++) {
    const t = seed * 1.7 + k * 1.9, d = k ? r * 0.55 : 0, s = r * (k ? 0.62 + H(seed, k) * 0.2 : 0.8);
    p.add(new THREE.IcosahedronGeometry(s, 0).scale(1, 0.82, 1), x + Math.cos(t) * d, y + (k ? -r * 0.15 + H(seed, k + 5) * r * 0.35 : r * 0.15), z + Math.sin(t) * d, vary(c, seed, k, 0.22), t);
  }
}
/** Une petite fleur posée sur un feuillage : corolle plate, cœur clair */
function flower(p: Parts, x: number, y: number, z: number, c: number, s = 1) {
  p.add(new THREE.IcosahedronGeometry(0.011 * s, 0).scale(1, 0.42, 1), x, y, z, c);
  p.add(new THREE.OctahedronGeometry(0.0045 * s, 0), x, y + 0.004 * s, z, c === 0xf2d24a ? 0xc8783a : 0xf8e070);
}
/** Une fleur sur sa tige, avec deux feuilles : la tige monte de y, la corolle (boule ou coupe) en haut */
function bloom(p: Parts, x: number, y: number, z: number, c: number, s = 1, cup = false) {
  p.cyl(0.002, 0.003, 0.045 * s, 3, x, y, z, LEAF2);
  for (const t of [0.4, 2.6]) p.add(new THREE.ConeGeometry(0.006 * s, 0.022 * s, 3).translate(0, 0.011 * s, 0), x, y + 0.012 * s, z, LEAF, t, false, 0.9);
  if (cup) {
    p.add(new THREE.CylinderGeometry(0.013 * s, 0.006 * s, 0.024 * s, 6), x, y + 0.055 * s, z, c);
    p.add(new THREE.OctahedronGeometry(0.004 * s, 0), x, y + 0.066 * s, z, 0x4a3a2a);
  } else flower(p, x, y + 0.047 * s, z, c, s);
}
/** Une touffe d'herbe : trois brins en éventail */
function grass(p: Parts, x: number, z: number, c = 0x6a9a42, h = 0.045, y = 0) {
  for (let k = 0; k < 3; k++) p.add(new THREE.ConeGeometry(0.006, h, 3).translate(0, h / 2, 0), x + (k - 1) * 0.006, y, z, c, k, false, (k - 1) * 0.35);
}
/** Un papillon posé, ailes ouvertes */
function butterfly(p: Parts, x: number, y: number, z: number, c: number) {
  for (const s of [-1, 1]) p.add(new THREE.CircleGeometry(0.011, 4).rotateX(-PI / 2), x + s * 0.009, y, z, c, 0, false, s * 0.5);
  p.cyl(0.002, 0.002, 0.016, 3, x, y - 0.002, z, 0x2a2a2e);
}

// ---------------------------------------------------------------- haies

/**
 * Haie, le long de chaque bras : d'épineux (touffes sombres de prunellier, baies noires, branches sèches, pieux pris dedans),
 * de myrtes (taillée ronde en touffes serrées, fleurs blanches, liseré de terre cuite), vive (charmes et églantiers en touffes de
 * tailles variées, églantines et aubépine en fleurs, un nid), de buis (taillée au cordeau, boule au nœud, liseré de fleurs), taillée
 * dans sa jardinière de béton (galets, bornes lumineuses), lumineuse (feuillage taillé, points de lumière, socle blanc à liseré)
 */
function hedge(p: Parts, age: number, mask: number, v: number) {
  const list = arms(mask), T = 0.16, Hh = [0.16, 0.14, 0.17, 0.15, 0.14, 0.14][age];
  // le pied : terre ou liseré, jardinière, socle blanc
  for (const [dx, dz] of list) {
    const [cx, cz] = at(dx, dz, 0.25, 0), ry = ryOf(dx);
    if (age === 4) { p.box(0.5, 0.05, T + 0.06, cx, 0, cz, 0xa8a49c, ry); p.box(0.5, 0.006, T + 0.02, cx, 0.05, cz, 0x5a4234, ry); }
    else if (age === 5) {
      p.box(0.5, 0.04, T + 0.05, cx, 0, cz, WHITE, ry);
      for (const s of [-1, 1]) { const [x, z] = at(dx, dz, 0.25, s * (T + 0.05) / 2); p.box(0.5, 0.008, 0.008, x, 0.022, z, NEON, ry, 'neon'); }
    } else if (age === 1) { p.box(0.5, 0.02, T + 0.07, cx, 0, cz, 0xc87a5a, ry); p.box(0.5, 0.006, T + 0.05, cx, 0.02, cz, 0x6a4a34, ry); }
    else if (age === 3) p.box(0.5, 0.014, T + 0.07, cx, 0, cz, 0xc8bca4, ry);
  }
  const base = age === 4 ? 0.056 : age === 5 ? 0.04 : age === 1 ? 0.026 : age === 3 ? 0.014 : 0;
  if (age >= 3) {
    // taillée au cordeau : un bloc par bras, chanfreiné, dessus plus clair ; des feuilles qui dépassent de la taille
    const c = age === 5 ? 0x4aa86a : age === 4 ? 0x4f8a48 : 0x3f7a42;
    const block = (x: number, z: number, w: number, ry: number) => {
      p.box(w, Hh - 0.03, T, x, base, z, c, ry);
      p.box(w, 0.02, T - 0.04, x, base + Hh - 0.03, z, dk(c, 1.12), ry);
      // les arêtes du haut arrondies par la cisaille, plus claires (la pousse de l'année)
      for (const s2 of [-1, 1]) { const ox = ry ? s2 * (T / 2 - 0.02) : 0, oz = ry ? 0 : s2 * (T / 2 - 0.02); p.add(new THREE.CylinderGeometry(0.02, 0.02, w, 6).rotateZ(PI / 2), x + ox, base + Hh - 0.03, z + oz, dk(c, 1.08), ry); }
    };
    for (const [dx, dz] of list) {
      const [cx, cz] = at(dx, dz, 0.25, 0);
      block(cx, cz, 0.5, ryOf(dx));
      // les arbustes qu'on devine dans la haie : un léger creux sombre tous les 12 cm, sur les deux faces
      for (let i = 1; i < 4; i++) for (const s2 of [-1, 1]) { const [x, z] = at(dx, dz, i * 0.125, s2 * (T / 2 + 0.001)); p.box(0.012, Hh - 0.05, 0.004, x, base + 0.012, z, dk(c, 0.78), ryOf(dx)); }
      for (let i = 0; i < 8; i++) {
        const u = 0.04 + i * 0.06, s = i % 2 ? 1 : -1, [x, z] = at(dx, dz, u, s * (T / 2 + 0.003));
        p.add(new THREE.IcosahedronGeometry(0.016, 0), x, base + 0.025 + H(i, dx + dz * 3) * (Hh - 0.06), z, vary(c, i, dx * 7 + dz), i);
      }
      for (let i = 0; i < 6; i++) {
        const u = 0.05 + i * 0.085, s = i % 2 ? 1 : -1, [x, z] = at(dx, dz, u, s * (T / 2 + 0.032));
        if (age === 3) { tuft(p, x, base + 0.02, z, 0.022, LEAF2, i + dx * 3 + 50); flower(p, x, base + 0.042, z, [0xf4f0e8, 0xf29ab0, 0xb07ad8][(i + dx + 3) % 3], 1.8); }
        else if (age === 4) { p.sphere(0.014, x, 0.05, z, vary(0xd8d4cc, i, dz + 5), 0, 0.5); if (i % 2) { const [gx, gz] = at(dx, dz, u + 0.03, s * (T / 2 + 0.03)); p.add(new THREE.ConeGeometry(0.006, 0.08, 3), gx, 0.056, gz, 0xc8b878, i, false, 0.2); p.add(new THREE.ConeGeometry(0.006, 0.07, 3), gx + 0.008, 0.056, gz, 0xb8a868, i, false, -0.25); } }
        else p.add(new THREE.OctahedronGeometry(0.008, 0), at(dx, dz, u, s * (T / 2))[0], base + 0.05 + (i % 3) * 0.028, at(dx, dz, u, s * (T / 2))[1], [NEON, 0xff5ad8, 0x7affc0][i % 3], 0, 'neon');
      }
      if (age === 4) { const [x, z] = at(dx, dz, 0.4, T / 2 + 0.04); p.cyl(0.008, 0.01, 0.055, 6, x, 0.05, z, 0x3a3a40); p.cyl(0.012, 0.012, 0.012, 6, x, 0.105, z, 0xfff1c9, true); }
    }
    block(0, 0, T, 0);
    // au nœud : une boule de buis sur sa tige (Industriel), un cube taillé (Moderne), une sphère qui luit (Futuriste)
    if (age === 3) { p.cyl(0.012, 0.014, 0.04, 5, 0, base + Hh - 0.01, 0, BARK); p.sphere(0.07, 0, base + Hh + 0.08, 0, 0x3f7a42, 1); for (let k = 0; k < 4; k++) flower(p, Math.cos(k * 1.6) * 0.05, base + Hh + 0.1 + (k % 2) * 0.03, Math.sin(k * 1.6) * 0.05, 0xf4f0e8); }
    else if (age === 4) { p.box(0.1, 0.07, 0.1, 0, base + Hh - 0.01, 0, 0x5a9450); p.box(0.08, 0.012, 0.08, 0, base + Hh + 0.06, 0, 0x6aa460); }
    else { p.cyl(0.02, 0.026, 0.05, 6, 0, base + Hh - 0.01, 0, WHITE); p.add(new THREE.IcosahedronGeometry(0.035, 1), 0, base + Hh + 0.08, 0, NEON, 0, 'neon'); p.add(new THREE.TorusGeometry(0.05, 0.003, 3, 16).rotateX(PI / 2), 0, base + Hh + 0.08, 0, 0xff5ad8, 0, 'neon'); }
    return;
  }
  // haies libres : des touffes serrées de tailles et de verts variés, plus hautes au milieu
  const greens = [0x4a6a34, 0x4f8a4a, 0x5f9a52][age];
  tuft(p, 0, base + Hh * 0.6, 0, T * 0.62, greens, v + 3);
  for (const [dx, dz] of list) {
    for (let i = 0; i < 4; i++) {
      const u = 0.1 + i * 0.115, j = i + dx * 5 + dz * 11 + 20 + v, r = T * (0.55 + H(j, 1) * 0.15);
      const [x, z] = at(dx, dz, u, (H(j, 2) - 0.5) * 0.03);
      tuft(p, x, base + r * 0.85 + (age === 2 ? H(j, 4) * 0.03 : 0), z, r, greens, j);
    }
    if (age === 0) {
      // branches sèches et ronces qui dépassent, baies noires et rouges de prunellier
      for (let i = 0; i < 4; i++) {
        const u = 0.08 + i * 0.12, s = i % 2 ? 1 : -1, [x, z] = at(dx, dz, u, s * 0.07);
        p.add(new THREE.CylinderGeometry(0.003, 0.005, 0.12, 3).translate(0, 0.06, 0), x, 0.1, z, 0x6a4a30, dx * 0.4 + i, false, s * 0.6);
        p.add(new THREE.CylinderGeometry(0.002, 0.003, 0.05, 3).translate(0, 0.025, 0), x, 0.16, z, 0x6a4a30, i, false, -s * 0.8);
      }
      for (let i = 0; i < 10; i++) { const [x, z] = at(dx, dz, 0.04 + i * 0.045, (i % 2 ? 1 : -1) * 0.075); p.sphere(0.008, x, 0.05 + H(i, dz + 4) * 0.1, z, i % 3 ? 0x2a2440 : 0x8a2a3a); }
      // le pieu au bout, que les ronces ont pris
      const [px, pz] = at(dx, dz, 0.44, 0); p.cyl(0.013, 0.017, Hh + 0.06, 5, px, 0, pz, BARK); p.cone(0.014, 0.035, 5, px, Hh + 0.06, pz, dk(BARK, 0.8));
    } else {
      // fleurs semées dans le feuillage, des deux côtés : myrtes blanches, églantines roses et aubépine blanche
      for (let i = 0; i < 9; i++) {
        const [x, z] = at(dx, dz, 0.04 + i * 0.052, (i % 2 ? 1 : -1) * (T * 0.5 + 0.005));
        flower(p, x, 0.06 + H(i, dz + 6 + dx) * 0.1, z, age === 1 ? 0xf8f4ea : i % 3 === 0 ? 0xf4f0e8 : 0xf29ab0, age === 1 ? 0.8 : 1.1);
      }
    }
    // des touffes d'herbe au pied
    for (let i = 0; i < 2; i++) { const [x, z] = at(dx, dz, 0.15 + i * 0.22, (i % 2 ? 1 : -1) * (T / 2 + 0.04)); grass(p, x, z, 0x7a9a42, 0.04, base); }
  }
  if (age === 2 && v % 2 === 0) {
    // un nid de brindilles dans la haie, trois œufs bleus, et le merle qui veille dessus
    const [x, z] = at(list[0][0], list[0][1], 0.22, 0), y = base + Hh + 0.01;
    p.cyl(0.032, 0.022, 0.022, 7, x, y, z, 0x8a6a48); p.cyl(0.024, 0.024, 0.004, 7, x, y + 0.02, z, 0x5a4230);
    for (let k = 0; k < 3; k++) p.sphere(0.008, x + (k - 1) * 0.011, y + 0.026, z, 0xa8d0e0, 0, 1.2);
    p.sphere(0.014, x + 0.04, y + 0.03, z, 0x2a2a2e, 0, 0.9); p.sphere(0.009, x + 0.052, y + 0.046, z, 0x2a2a2e); p.cone(0.004, 0.012, 3, x + 0.06, y + 0.044, z, 0xf2a03a);
  }
  if (age === 1) {
    // à l'angle ou au bout, une jarre de terre cuite
    const [x, z] = at(list[0][0], list[0][1], 0.42, -(T / 2 + 0.05));
    p.cyl(0.024, 0.018, 0.05, 8, x, 0, z, 0xc8784a); p.cyl(0.028, 0.024, 0.012, 8, x, 0.05, z, 0xb8683a); p.cyl(0.016, 0.02, 0.012, 8, x, 0.062, z, 0xc8784a);
  }
}

// ---------------------------------------------------------------- clôtures

/**
 * Clôture, le long de chaque bras : palissade de pieux pointus liés de lanières, crâne de bête et touffes au pied (Préhistoire),
 * muret de pierres sèches à couvertine, mousse et lierre (Antiquité), plessis de branches tressées entre des piquets et un
 * fagot (Moyen Âge), barrière blanche à lattes pointues, poteaux à chapeau et roses grimpantes (Industriel), grille de jardin
 * à barreaux de lance sur un muret, piliers à chaperon (Moderne), barrière de lumière à bornes blanches (Futuriste)
 */
function fence(p: Parts, age: number, mask: number, v: number) {
  const list = arms(mask);
  const tufts = () => { for (const [dx, dz] of list) for (let i = 0; i < 2; i++) { const [x, z] = at(dx, dz, 0.12 + i * 0.25, (i % 2 ? 1 : -1) * 0.04); grass(p, x, z, 0x7a9a42, 0.05); } };
  if (age === 0) {
    const post = (x: number, z: number, i: number) => { const h = 0.18 + H(i, 3) * 0.06; p.cyl(0.016, 0.02, h, 5, x, 0, z, vary(BARK, i, 2), false, i); p.cone(0.017, 0.045, 5, x, h, z, vary(0x9a7a52, i, 4), false, i); };
    post(0, 0, 0);
    for (const [dx, dz] of list) {
      for (let i = 1; i <= 6; i++) post(...at(dx, dz, i * 0.075, (H(i, dx + 9) - 0.5) * 0.012), i + dx * 7 + dz * 13);
      // deux lanières de cuir tressé, et leurs nœuds sur chaque pieu
      for (const y of [0.05, 0.14]) {
        const [x, z] = at(dx, dz, 0.25, 0.019); p.box(0.5, 0.012, 0.008, x, y, z, 0xb8945a, ryOf(dx));
        for (let i = 1; i <= 6; i += 2) { const [kx, kz] = at(dx, dz, i * 0.075, 0.021); p.add(new THREE.OctahedronGeometry(0.008, 0), kx, y + 0.006, kz, 0x9a7a42); }
      }
    }
    // un crâne de bête accroché au pieu du milieu, une peau qui sèche
    if (v % 3 === 0) { p.sphere(0.024, 0, 0.17, 0.03, 0xf0e8d8, 0, 0.8); p.box(0.02, 0.012, 0.018, 0, 0.15, 0.048, 0xf0e8d8); for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.006, 0.05, 4).translate(0, 0.025, 0), s * 0.02, 0.18, 0.03, 0xe8e0cc, 0, false, -s * 1.1); }
    else { const [x, z] = at(list[0][0], list[0][1], 0.2, 0.024); p.box(0.08, 0.07, 0.004, x, 0.07, z, 0xc8a07a, ryOf(list[0][0]), false, 0.06); }
    tufts();
    return;
  }
  if (age === 1) {
    // pierres sèches en deux assises, couvertine de pierres posées de chant ; mousse, lierre et une fleur au pied
    const stone = (x: number, y: number, z: number, i: number, ry: number) => p.add(new THREE.BoxGeometry(0.09 + H(i, 1) * 0.05, 0.05, 0.1).translate(0, 0.025, 0), x, y, z, vary(0xc8bca4, i, 3, 0.25), ry + (H(i, 2) - 0.5) * 0.2);
    stone(0, 0, 0, 0, 0); stone(0, 0.05, 0, 1, PI / 2);
    for (const [dx, dz] of list) {
      const ry = ryOf(dx);
      for (let i = 0; i < 4; i++) { const k = i + dx * 5 + dz * 9 + 30; stone(...at(dx, dz, 0.07 + i * 0.12, 0) as [number, number], 0, k, ry); }
      for (let i = 0; i < 4; i++) { const k = i + dx * 5 + dz * 9 + 60, [x, z] = at(dx, dz, 0.12 + i * 0.12, 0); stone(x, 0.05, z, k, ry); }
      for (let i = 0; i < 8; i++) { const [x, z] = at(dx, dz, 0.04 + i * 0.06, 0); p.box(0.03, 0.045, 0.11, x, 0.1, z, vary(0xb4a88e, i, dx + dz * 3 + 7, 0.25), ry, false, (H(i, 8) - 0.5) * 0.35); }
      for (let i = 0; i < 3; i++) { const [mx, mz] = at(dx, dz, 0.1 + i * 0.15, (i % 2 ? 1 : -1) * 0.052); p.sphere(0.018, mx, 0.03 + i * 0.03, mz, MOSS, 0, 0.5); }
      // le lierre qui court sur le mur
      for (let i = 0; i < 5; i++) { const [x, z] = at(dx, dz, 0.2 + i * 0.03, 0.053); p.add(new THREE.CircleGeometry(0.012, 4), x, 0.04 + i * 0.022, z, i % 2 ? 0x3f6a3a : 0x4f7a42, ryOf(dx) + (dx ? 0 : PI / 2)); }
    }
    tufts();
    const [fx, fz] = at(list[0][0], list[0][1], 0.3, -0.08); bloom(p, fx, 0, fz, 0xe85a6a, 1.2);
    return;
  }
  if (age === 2) {
    // plessis : piquets, branches tressées passant devant et derrière, un fagot appuyé
    p.cyl(0.015, 0.018, 0.19, 5, 0, 0, 0, BARK); p.cone(0.016, 0.02, 5, 0, 0.19, 0, dk(BARK, 0.85));
    for (const [dx, dz] of list) {
      for (const u of [0.24, 0.48]) { const [x, z] = at(dx, dz, u, 0); p.cyl(0.012, 0.015, 0.18, 5, x, 0, z, BARK); p.cone(0.013, 0.018, 5, x, 0.18, z, dk(BARK, 0.85)); }
      for (let r = 0; r < 6; r++) {
        const y = 0.025 + r * 0.023, s = r % 2 ? 1 : -1;
        for (let i = 0; i < 4; i++) {
          const [x, z] = at(dx, dz, 0.06 + i * 0.12, s * (i % 2 ? 0.009 : -0.009));
          p.add(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 4).rotateZ(PI / 2), x, y, z, vary(0x9a7a4a, r, i + dx * 3), ryOf(dx));
        }
      }
    }
    const [x, z] = at(list[0][0], list[0][1], 0.3, 0.05);
    for (let k = 0; k < 5; k++) p.add(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 4), x + (k - 2) * 0.008, 0.08, z + (k % 2) * 0.008, vary(0x8a6a3a, k, 2), ryOf(list[0][0]), false, 0.3);
    p.add(new THREE.TorusGeometry(0.018, 0.004, 3, 6), x, 0.09, z, 0xc9b48a, ryOf(list[0][0]) + PI / 2, false, 0.3);
    tufts();
    return;
  }
  if (age === 3) {
    // barrière blanche : poteau à chapeau, deux lisses, lattes pointues ; roses grimpantes
    const W = 0xf2efe6;
    p.box(0.034, 0.18, 0.034, 0, 0, 0, W); p.box(0.04, 0.01, 0.04, 0, 0.18, 0, dk(W, 0.95)); p.pyramid(0.036, 0.025, 0.036, 0, 0.19, 0, W);
    for (const [dx, dz] of list) {
      const ry = ryOf(dx);
      for (const y of [0.04, 0.115]) { const [x, z] = at(dx, dz, 0.25, -0.012); p.box(0.5, 0.016, 0.012, x, y, z, dk(W, 0.94), ry); }
      for (let i = 0; i < 6; i++) { const [x, z] = at(dx, dz, 0.06 + i * 0.08, 0); p.box(0.028, 0.13, 0.008, x, 0.012, z, W, ry); p.add(new THREE.ConeGeometry(0.02, 0.022, 4).rotateY(PI / 4).scale(1, 1, 0.3).translate(0, 0.011, 0), x, 0.142, z, W, ry); }
      const [px, pz] = at(dx, dz, 0.5, 0); p.box(0.03, 0.17, 0.03, px, 0, pz, W); p.pyramid(0.034, 0.022, 0.034, px, 0.17, pz, W);
    }
    // le rosier qui grimpe sur la barrière, ses feuilles et ses roses
    const [dx, dz] = list[(v % list.length)];
    for (let k = 0; k < 7; k++) { const [x, z] = at(dx, dz, 0.12 + k * 0.035, 0.014); p.add(new THREE.IcosahedronGeometry(0.014, 0), x, 0.03 + Math.sin(k) * 0.03 + k * 0.012, z, k % 2 ? LEAF : LEAF2); if (k % 2) flower(p, x, 0.05 + k * 0.014, at(dx, dz, 0, 0.026)[1] + z - at(dx, dz, 0, 0.014)[1], 0xe85a6a, 1.2); }
    tufts();
    return;
  }
  if (age === 4) {
    // grille de jardin : piliers à chaperon, muret de béton, barreaux de lance et deux lisses d'acier peint
    const G = 0x2e4a3a;
    p.box(0.07, 0.2, 0.07, 0, 0, 0, 0xb8b4ac); p.box(0.082, 0.014, 0.082, 0, 0.2, 0, 0x9a968e); p.pyramid(0.07, 0.02, 0.07, 0, 0.214, 0, 0x9a968e);
    for (const [dx, dz] of list) {
      const ry = ryOf(dx), [cx, cz] = at(dx, dz, 0.25, 0);
      p.box(0.5, 0.05, 0.05, cx, 0, cz, 0xb8b4ac, ry); p.box(0.5, 0.008, 0.058, cx, 0.05, cz, 0x9a968e, ry);
      for (const y of [0.075, 0.165]) p.box(0.5, 0.01, 0.012, cx, y, cz, G, ry);
      for (let i = 0; i < 9; i++) { const [x, z] = at(dx, dz, 0.045 + i * 0.054, 0); p.cyl(0.004, 0.004, 0.13, 4, x, 0.058, z, G); p.cone(0.008, 0.02, 4, x, 0.188, z, G); }
      for (let i = 0; i < 4; i++) { const [x, z] = at(dx, dz, 0.075 + i * 0.11, 0); p.add(new THREE.TorusGeometry(0.014, 0.0025, 3, 8), x, 0.12, z, G, ryOf(dx) + PI / 2); }
    }
    tufts();
    return;
  }
  // barrière de lumière : bornes blanches à tête lumineuse, faisceaux de néon, socle nacré
  p.cyl(0.022, 0.028, 0.17, 8, 0, 0, 0, WHITE); p.sphere(0.024, 0, 0.175, 0, PEARL); p.cyl(0.023, 0.023, 0.01, 8, 0, 0.13, 0, NEON, 'neon');
  for (const [dx, dz] of list) {
    const ry = ryOf(dx), [cx, cz] = at(dx, dz, 0.25, 0);
    for (const y of [0.05, 0.09, 0.13]) p.box(0.5, 0.01, 0.01, cx, y, cz, NEON, ry, 'neon');
    p.box(0.5, 0.022, 0.045, cx, 0, cz, PEARL, ry);
    p.box(0.5, 0.004, 0.006, at(dx, dz, 0.25, 0.024)[0], 0.016, at(dx, dz, 0.25, 0.024)[1], 0xff5ad8, ry, 'neon');
    const [ex, ez] = at(dx, dz, 0.48, 0); p.cyl(0.016, 0.02, 0.16, 6, ex, 0, ez, WHITE); p.sphere(0.017, ex, 0.165, ez, NEON);
  }
}

// ---------------------------------------------------------------- parterres

/**
 * Parterre de fleurs : fleurs des champs en touffes dans un rond de pierres, graminées et papillon (Préhistoire), rosiers en
 * touffes fleuries dans une bordure de terre cuite, amphore couchée (Antiquité), jardin de simples en planche surélevée :
 * lavande, choux, sauge, soucis, étiquette et panier (Moyen Âge), rond de tulipes en couronnes autour d'un palmier, bordure de
 * briques (Industriel), massif fleuri en jardinière de béton, vivaces, graminées et galets (Moderne), jardin suspendu : coupe
 * blanche qui flotte, fleurs qui retombent, anneau de néon (Futuriste)
 */
function flowerbed(p: Parts, age: number, v: number) {
  const pal = (i: number) => BLOOMS[(i + v) % BLOOMS.length];
  if (age === 0) {
    for (let i = 0; i < 12; i++) { const t = (i / 12) * PI * 2; p.add(new THREE.DodecahedronGeometry(0.032 + H(i, 1) * 0.012, 0), Math.cos(t) * 0.35, 0.012, Math.sin(t) * 0.35, vary(STONE, i, 2, 0.3), t); }
    p.cyl(0.33, 0.33, 0.012, 12, 0, 0, 0, 0x6a8a3a);
    for (let i = 0; i < 7; i++) {
      const t = i * 0.9 + 0.3, r = i ? 0.18 + H(i, 5) * 0.06 : 0;
      tuft(p, Math.cos(t) * r, 0.04, Math.sin(t) * r, 0.045, 0x6a9a42, i + 40);
      for (let k = 0; k < 4; k++) flower(p, Math.cos(t) * r + Math.cos(k * 1.7) * 0.03, 0.07 + (k % 2) * 0.01, Math.sin(t) * r + Math.sin(k * 1.7) * 0.03, [0xf2d24a, 0xf4f0e8, 0xb07ad8, 0xe85a6a][(i + k) % 4], 1.1);
    }
    for (let i = 0; i < 6; i++) { const t = i * 1.1 + 0.6, r = 0.26; grass(p, Math.cos(t) * r, Math.sin(t) * r, 0xa8a050, 0.08, 0.012); }
    butterfly(p, 0.05, 0.1, -0.08, 0xf29a3a);
    return;
  }
  if (age === 1) {
    p.box(0.72, 0.05, 0.72, 0, 0, 0, 0xc87a5a); p.box(0.66, 0.012, 0.66, 0, 0.042, 0, 0x6a4a34);
    for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) { p.box(0.07, 0.07, 0.07, x, 0, z, 0xb86a4a); p.sphere(0.03, x, 0.09, z, 0xd88a6a); }
    for (let i = 0; i < 5; i++) {
      const x = -0.2 + (i % 3) * 0.2, z = i < 3 ? -0.15 : 0.15;
      p.cyl(0.008, 0.01, 0.05, 4, x, 0.05, z, BARK);
      tuft(p, x, 0.13, z, 0.07, 0x4f7a3e, i + 10);
      for (let k = 0; k < 7; k++) { const t = k * 0.9 + i; flower(p, x + Math.cos(t) * 0.06, 0.14 + (k % 3) * 0.025, z + Math.sin(t) * 0.06, i % 2 ? 0xd83a4a : 0xf29ab0, 1.5); }
    }
    // l'amphore couchée dans le coin, d'où débordent des fleurs
    p.add(new THREE.CylinderGeometry(0.03, 0.045, 0.12, 8).rotateZ(PI / 2), 0.22, 0.09, 0.24, 0xc8784a, 0.6);
    p.cyl(0.018, 0.02, 0.03, 6, 0.27, 0.075, 0.27, 0xc8784a);
    for (let k = 0; k < 3; k++) flower(p, 0.3 + k * 0.02, 0.06, 0.29, 0xf4f0e8);
    return;
  }
  if (age === 2) {
    // planche surélevée de bois, montants d'angle, rangs de simples
    p.box(0.7, 0.07, 0.6, 0, 0, 0, OAK); p.box(0.66, 0.012, 0.56, 0, 0.066, 0, 0x5a3a24);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { p.box(0.04, 0.1, 0.04, s * 0.33, 0, t * 0.28, dk(OAK, 0.8)); p.pyramid(0.044, 0.02, 0.044, s * 0.33, 0.1, t * 0.28, dk(OAK, 0.7)); }
    for (const t of [-1, 1]) p.box(0.7, 0.008, 0.01, 0, 0.035, t * 0.3, dk(OAK, 0.75));
    for (let r = 0; r < 4; r++) {
      const z = -0.21 + r * 0.14;
      for (let i = 0; i < 5; i++) {
        const x = -0.25 + i * 0.125;
        if (r === 0) { p.cyl(0.02, 0.026, 0.03, 5, x, 0.078, z, 0x6a8a5a); for (let k = 0; k < 5; k++) { p.cyl(0.003, 0.003, 0.05, 3, x + (k - 2) * 0.008, 0.1, z, 0x6a8a5a); p.cyl(0.005, 0.004, 0.022, 4, x + (k - 2) * 0.008, 0.15, z, 0xb07ad8); } }
        else if (r === 1) { p.sphere(0.034, x, 0.1, z, vary(0xa8c868, i, r), 0, 0.8); p.sphere(0.022, x, 0.125, z, vary(0xc8e088, i, r + 1), 0, 0.7); }
        else if (r === 2) tuft(p, x, 0.1, z, 0.03, 0x8aa87a, i + 60);
        else bloom(p, x, 0.078, z, i % 2 ? 0xf29a3a : 0xf2d24a, 1.3);
      }
    }
    // l'étiquette de bois, le panier de la cueillette et sa toile, l'arrosoir de terre
    p.box(0.004, 0.06, 0.004, 0.3, 0.07, 0.27, OAK); p.box(0.05, 0.03, 0.004, 0.3, 0.13, 0.27, 0xd8c8a0);
    p.cyl(0.04, 0.032, 0.04, 8, -0.4, 0, 0.36, 0xc8a070); p.add(new THREE.TorusGeometry(0.03, 0.004, 3, 8, PI), -0.4, 0.04, 0.36, 0xa88050); p.box(0.05, 0.008, 0.05, -0.4, 0.04, 0.36, 0xe8d8b8, 0.4);
    p.cyl(0.026, 0.03, 0.05, 8, 0.42, 0, -0.32, 0xb8683a); p.add(new THREE.CylinderGeometry(0.004, 0.006, 0.06, 4), 0.45, 0.04, -0.32, 0xb8683a, 0, false, -0.8);
    return;
  }
  if (age === 3) {
    // rond de tulipes : bordure de briques en dents de scie, couronnes de couleurs, palmier au centre
    p.cyl(0.38, 0.38, 0.03, 16, 0, 0, 0, 0x6a4a34);
    for (let i = 0; i < 20; i++) { const t = (i / 20) * PI * 2; p.box(0.05, 0.045, 0.02, Math.cos(t) * 0.38, 0, Math.sin(t) * 0.38, 0xb4685c, -t + PI / 2, false, 0.5); }
    for (const [r, n, c] of [[0.3, 14, 0xe83a3a], [0.2, 10, 0xf2d24a], [0.11, 6, 0xf4f0e8]] as [number, number, number][])
      for (let i = 0; i < n; i++) { const t = (i / n) * PI * 2 + r; bloom(p, Math.cos(t) * r, 0.03, Math.sin(t) * r, c, 1.3, true); }
    p.cyl(0.012, 0.018, 0.17, 5, 0, 0.03, 0, 0x8a7a5a);
    for (let k = 0; k < 3; k++) p.cyl(0.0185, 0.0185, 0.008, 5, 0, 0.06 + k * 0.04, 0, 0x6a5a3a);
    for (let k = 0; k < 7; k++) { const t = (k / 7) * PI * 2; p.add(new THREE.ConeGeometry(0.014, 0.15, 3).rotateZ(PI / 2).translate(0.075, 0, 0), 0, 0.2, 0, k % 2 ? 0x3f7a3a : 0x4f8a48, t, false, 0.4); }
    return;
  }
  if (age === 4) {
    // massif en jardinière de béton : vivaces en taches, graminées, galets, une plaque
    p.box(0.74, 0.08, 0.74, 0, 0, 0, 0xb4b0a8); p.box(0.78, 0.012, 0.78, 0, 0.08, 0, 0xc8c4bc); p.box(0.66, 0.012, 0.66, 0, 0.076, 0, 0x5a4234);
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 0.17 : -0.17, z = i < 2 ? -0.17 : 0.17;
      tuft(p, x, 0.13, z, 0.07, 0x5a8a48, i + 80);
      for (let k = 0; k < 7; k++) { const t = k * 0.9 + i; flower(p, x + Math.cos(t) * 0.06, 0.16 + (k % 2) * 0.02, z + Math.sin(t) * 0.06, pal(i + 1), 1.3); }
    }
    for (let k = 0; k < 9; k++) { const t = (k / 9) * PI * 2; p.add(new THREE.ConeGeometry(0.008, 0.17, 3), Math.cos(t) * 0.03, 0.17, Math.sin(t) * 0.03, 0xc8b878, 0, false, Math.cos(t) * 0.3, Math.sin(t) * 0.3); }
    for (let k = 0; k < 6; k++) p.sphere(0.016, -0.28 + k * 0.11, 0.085, 0.29, vary(0xd8d4cc, k, 3), 0, 0.5);
    p.box(0.1, 0.03, 0.004, 0, 0.03, 0.372, 0x8a8f96);
    butterfly(p, -0.1, 0.22, 0.05, 0x5a9ae8);
    return;
  }
  // jardin suspendu : socle, coupe blanche en lévitation, fleurs qui retombent, anneau de néon
  p.cyl(0.12, 0.16, 0.03, 10, 0, 0, 0, PEARL); p.cyl(0.1, 0.1, 0.006, 10, 0, 0.03, 0, NEON, 'neon');
  p.cyl(0.3, 0.16, 0.1, 12, 0, 0.12, 0, WHITE); p.cyl(0.28, 0.28, 0.01, 12, 0, 0.215, 0, 0x5a4234);
  p.add(new THREE.TorusGeometry(0.3, 0.008, 4, 24).rotateX(PI / 2), 0, 0.22, 0, NEON, 0, 'neon');
  for (let i = 0; i < 5; i++) { const t = i * 1.25, r = i ? 0.15 : 0; tuft(p, Math.cos(t) * r, 0.25, Math.sin(t) * r, 0.045, LEAF, i + 90); }
  for (let i = 0; i < 16; i++) { const t = i * 2.4, r = 0.04 + Math.sqrt(i / 16) * 0.2; flower(p, Math.cos(t) * r, 0.28 + (i % 3) * 0.01, Math.sin(t) * r, pal(i), 1.3); }
  for (let k = 0; k < 10; k++) { const t = (k / 10) * PI * 2 + 0.2; p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 1.6, 1), Math.cos(t) * 0.305, 0.18, Math.sin(t) * 0.305, k % 2 ? LEAF : LEAF2, t); flower(p, Math.cos(t) * 0.32, 0.15, Math.sin(t) * 0.32, pal(k + 2), 1.2); }
}

// ---------------------------------------------------------------- bancs

/**
 * Un banc à lattes : `n` lattes d'assise, `back` lattes de dossier, deux flancs de pieds (`leg` : fonte à volutes, bois ou
 * pierre), accoudoirs ; dossier vers -z, le long de x, longueur `L`
 */
function slatBench(p: Parts, o: { L?: number; wood: number; leg: number; cast?: boolean; n?: number; back?: number; arm?: boolean; y0?: number }) {
  const L = o.L ?? 0.4, n = o.n ?? 4, back = o.back ?? 3, y = (o.y0 ?? 0) + 0.06;
  for (let i = 0; i < n; i++) p.box(L, 0.008, 0.022, 0, y, 0.04 - i * 0.027, i % 2 ? o.wood : dk(o.wood, 0.93));
  for (let i = 0; i < back; i++) p.add(new THREE.BoxGeometry(L, 0.022, 0.007).translate(0, 0.011, 0), 0, y + 0.03 + i * 0.03, -0.062 - i * 0.004, i % 2 ? o.wood : dk(o.wood, 0.93), 0, false, 0, -0.15);
  for (const s of [-1, 1]) {
    const x = s * (L / 2 - 0.04);
    if (o.cast) {
      // flanc de fonte : pied avant galbé, pied arrière qui monte au dossier, volutes, patins
      p.add(new THREE.BoxGeometry(0.012, 0.07, 0.012).translate(0, 0.035, 0), x, (o.y0 ?? 0), 0.04, o.leg, 0, false, 0, 0.15);
      p.add(new THREE.BoxGeometry(0.012, 0.16, 0.012).translate(0, 0.08, 0), x, (o.y0 ?? 0), -0.04, o.leg, 0, false, 0, -0.18);
      p.box(0.012, 0.012, 0.1, x, y - 0.012, -0.005, o.leg);
      p.add(new THREE.TorusGeometry(0.018, 0.004, 3, 8, PI * 1.4), x, y - 0.03, 0.035, o.leg, PI / 2);
      p.add(new THREE.TorusGeometry(0.012, 0.0035, 3, 8, PI * 1.4), x, y + 0.07, -0.07, o.leg, PI / 2);
      for (const z of [0.045, -0.05]) p.box(0.02, 0.006, 0.02, x, (o.y0 ?? 0), z, dk(o.leg, 1.2));
    } else {
      p.box(0.02, 0.06, 0.012, x, (o.y0 ?? 0), 0.035, o.leg); p.box(0.02, 0.15, 0.012, x, (o.y0 ?? 0), -0.06, o.leg);
      p.box(0.02, 0.01, 0.1, x, y - 0.012, -0.012, o.leg); p.box(0.018, 0.008, 0.08, x, (o.y0 ?? 0) + 0.02, -0.012, o.leg);
    }
    if (o.arm !== false) {
      p.box(0.022, 0.01, 0.1, s * (L / 2 - 0.005), y + 0.075, -0.012, o.cast ? o.leg : o.wood);
      p.box(0.012, 0.075, 0.012, s * (L / 2 - 0.005), y, 0.03, o.leg);
    }
  }
}

/**
 * Banc : deux rondins sur des pierres, souche, foyer éteint et peau jetée (Préhistoire), banc de marbre à pieds de lion, dossier
 * mouluré et lauriers en pot (Antiquité), banc de chêne à dossier et accoudoirs, panier et cruche (Moyen Âge), banc de square à
 * lattes peintes et flancs de fonte à volutes, corbeille et réverbère (Industriel), banc public de lattes sur flancs d'acier,
 * corbeille, arbuste en bac (Moderne), banc blanc qui flotte sur un liseré de néon, tablette lumineuse (Futuriste)
 */
function bench(p: Parts, age: number, v: number, kit: DecorKit) {
  if (age === 0) {
    for (const z of [-0.08, 0.12]) {
      for (const x of [-0.16, 0.16]) p.add(new THREE.DodecahedronGeometry(0.035, 0), x, 0.02, z, vary(STONE, x * 10 + z * 10, 1, 0.3));
      p.add(new THREE.CylinderGeometry(0.035, 0.038, 0.42, 7).rotateZ(PI / 2), 0, 0.075, z, vary(BARK, z * 10, 2), 0, false, 0, H(z * 10, 3) * 0.3);
      for (const s of [-1, 1]) { p.add(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 7).rotateZ(PI / 2), s * 0.211, 0.075, z, 0xd8b88a); p.add(new THREE.TorusGeometry(0.02, 0.002, 3, 7).rotateY(PI / 2), s * 0.213, 0.075, z, 0xa8885a); }
      // l'écorce qui se détache, une branche coupée
      p.add(new THREE.CylinderGeometry(0.008, 0.01, 0.05, 4).translate(0, 0.025, 0), 0.08, 0.1, z, BARK, 0, false, 0.6);
    }
    p.cyl(0.05, 0.06, 0.09, 7, 0.3, 0, -0.25, BARK); p.cyl(0.048, 0.048, 0.004, 7, 0.3, 0.09, -0.25, 0xd8b88a); p.add(new THREE.TorusGeometry(0.03, 0.002, 3, 7).rotateX(PI / 2), 0.3, 0.094, -0.25, 0xa8885a);
    // le foyer éteint devant, ses braises, la peau jetée sur le rondin, une écuelle
    for (let i = 0; i < 7; i++) { const t = (i / 7) * PI * 2; p.add(new THREE.DodecahedronGeometry(0.022, 0), Math.cos(t) * 0.07 - 0.2, 0.012, Math.sin(t) * 0.07 + 0.3, 0x8a847a); }
    p.cyl(0.05, 0.05, 0.008, 7, -0.2, 0, 0.3, 0x2a2420); for (let k = 0; k < 3; k++) p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 4).rotateZ(PI / 2), -0.2, 0.016, 0.3, 0x3a2a20, k * 1.05);
    p.box(0.14, 0.006, 0.09, 0.05, 0.112, 0.12, 0xc8a07a, 0.2); p.box(0.03, 0.005, 0.09, 0.13, 0.08, 0.15, 0xb8906a, 0.2, false, 1.2);
    p.cyl(0.03, 0.02, 0.02, 7, 0.25, 0, 0.3, 0x9a6a44);
    grass(p, -0.3, -0.2); grass(p, 0.36, 0.1);
    return;
  }
  if (age === 1) {
    // dalle de marbre sur deux pieds sculptés en pattes de lion, dossier mouluré à rouleaux
    p.box(0.46, 0.014, 0.2, 0, 0, 0, TRAV);
    for (const s of [-1, 1]) {
      p.box(0.05, 0.08, 0.12, s * 0.16, 0.014, 0, MARBLE);
      p.sphere(0.026, s * 0.16, 0.036, 0.062, MARBLE, 0, 0.8); for (let k = -1; k <= 1; k++) p.sphere(0.008, s * 0.16 + k * 0.012, 0.022, 0.082, dk(MARBLE, 0.95));
      p.box(0.06, 0.012, 0.13, s * 0.16, 0.094, 0, dk(MARBLE, 0.95));
      p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8).rotateX(PI / 2), s * 0.2, 0.2, -0.06, MARBLE);
    }
    p.box(0.42, 0.026, 0.14, 0, 0.106, 0, MARBLE); p.box(0.43, 0.008, 0.145, 0, 0.132, 0, dk(MARBLE, 0.96));
    p.box(0.4, 0.08, 0.022, 0, 0.13, -0.06, MARBLE); p.add(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 6).rotateZ(PI / 2), 0, 0.215, -0.06, MARBLE);
    p.box(0.3, 0.012, 0.004, 0, 0.16, -0.048, 0xc8b89a);
    // le laurier en pot, de chaque côté, et un coussin rouge
    for (const s of [-1, 1]) { p.cyl(0.04, 0.03, 0.06, 8, s * 0.34, 0.014, -0.02, 0xc8784a); p.cyl(0.044, 0.044, 0.01, 8, s * 0.34, 0.07, -0.02, 0xb8683a); p.cyl(0.006, 0.006, 0.05, 4, s * 0.34, 0.07, -0.02, BARK); tuft(p, s * 0.34, 0.15, -0.02, 0.05, 0x4f7a3e, s + 5); }
    p.box(0.12, 0.016, 0.09, -0.08, 0.135, 0.01, 0xb83a3a); for (const s of [-1, 1]) p.sphere(0.006, -0.08 + s * 0.06, 0.14, 0.055, GOLD);
    void v;
    return;
  }
  if (age === 2) {
    // banc de chêne à lattes, accoudoirs et entretoise ; panier d'osier et cruche
    slatBench(p, { L: 0.42, wood: OAK, leg: dk(OAK, 0.82), n: 4, back: 3 });
    p.box(0.36, 0.014, 0.014, 0, 0.025, -0.012, dk(OAK, 0.75));
    p.cyl(0.04, 0.034, 0.05, 8, 0.29, 0, 0.12, 0xc8a070); p.add(new THREE.TorusGeometry(0.035, 0.004, 3, 8, PI), 0.29, 0.05, 0.12, 0xa88050); p.box(0.05, 0.008, 0.05, 0.29, 0.05, 0.12, 0xe8d8b8, 0.4);
    for (let k = 0; k < 3; k++) p.sphere(0.012, 0.28 + k * 0.012, 0.06, 0.12, [0xd84a3e, 0x8ab84a, 0xf2a03a][k]);
    p.cyl(0.02, 0.026, 0.06, 7, -0.27, 0, 0.1, 0x9a6a44); p.cyl(0.01, 0.018, 0.02, 6, -0.27, 0.06, 0.1, 0x9a6a44); p.add(new THREE.TorusGeometry(0.012, 0.003, 3, 6, PI), -0.25, 0.05, 0.1, 0x9a6a44, 0, false, -PI / 2);
    grass(p, -0.33, -0.12); grass(p, 0.34, -0.08);
    return;
  }
  if (age === 3) {
    // banc de square : lattes peintes sur flancs de fonte à volutes ; corbeille de fonte et réverbère à gaz
    const wood = [0x5a8a5a, 0x8a5a3a, 0x3a5a7a][v % 3];
    slatBench(p, { L: 0.42, wood, leg: IRON, cast: true, n: 4, back: 4 });
    p.cyl(0.035, 0.03, 0.08, 8, 0.33, 0, 0.12, IRON); p.cyl(0.037, 0.037, 0.008, 8, 0.33, 0.08, 0.12, dk(IRON, 1.3));
    for (let k = 0; k < 8; k++) { const t = (k / 8) * PI * 2; p.box(0.003, 0.07, 0.003, 0.33 + Math.cos(t) * 0.033, 0.005, 0.12 + Math.sin(t) * 0.033, dk(IRON, 1.2)); }
    p.cyl(0.016, 0.02, 0.02, 6, -0.35, 0, -0.18, IRON); p.cyl(0.008, 0.012, 0.42, 6, -0.35, 0.02, -0.18, IRON); p.cyl(0.014, 0.014, 0.01, 6, -0.35, 0.25, -0.18, dk(IRON, 1.2));
    p.cyl(0.02, 0.015, 0.012, 6, -0.35, 0.44, -0.18, IRON); p.cyl(0.028, 0.02, 0.05, 6, -0.35, 0.452, -0.18, 0xffe2a0, true);
    for (let k = 0; k < 6; k++) { const t = (k / 6) * PI * 2; p.box(0.003, 0.05, 0.003, -0.35 + Math.cos(t) * 0.026, 0.452, -0.18 + Math.sin(t) * 0.026, IRON); }
    p.cone(0.036, 0.035, 6, -0.35, 0.502, -0.18, IRON); p.sphere(0.008, -0.35, 0.54, -0.18, IRON);
    // un journal oublié sur le banc, un pigeon
    p.box(0.06, 0.004, 0.045, 0.08, 0.068, 0.01, 0xe8e4d8, 0.3); p.sphere(0.013, -0.06, 0.012, 0.15, 0x9aa0a8, 0, 0.8); p.sphere(0.008, -0.05, 0.03, 0.16, 0x7a8088);
    return;
  }
  if (age === 4) {
    // banc public : lattes de bois sur flancs d'acier, accoudoir du milieu ; corbeille, arbuste en bac, un vélo appuyé
    slatBench(p, { L: 0.44, wood: 0xb08050, leg: 0x5d6168, n: 4, back: 3 });
    p.box(0.014, 0.05, 0.08, 0, 0.068, -0.01, 0x5d6168);
    p.cyl(0.035, 0.035, 0.1, 8, 0.35, 0, 0.12, 0x5d6168); p.cyl(0.03, 0.03, 0.004, 8, 0.35, 0.1, 0.12, 0x2a2a2e); p.box(0.03, 0.03, 0.004, 0.35, 0.05, 0.155, 0x3a7a4a);
    p.box(0.14, 0.08, 0.14, -0.33, 0, -0.2, 0x9a968e); p.cyl(0.008, 0.01, 0.06, 4, -0.33, 0.08, -0.2, BARK); tuft(p, -0.33, 0.18, -0.2, 0.06, 0x5a9450, 120);
    for (let k = 0; k < 4; k++) flower(p, -0.33 + Math.cos(k * 1.6) * 0.05, 0.2 + (k % 2) * 0.02, -0.2 + Math.sin(k * 1.6) * 0.05, 0xf29ab0);
    return;
  }
  // banc flottant : socles nacrés et liserés de néon, coque blanche, coussins bleus, accoudoirs ; tablette lumineuse et gobelet
  for (const x of [-0.12, 0.12]) { p.cyl(0.05, 0.06, 0.02, 8, x, 0, 0, PEARL); p.cyl(0.04, 0.04, 0.006, 8, x, 0.02, 0, NEON, 'neon'); }
  p.box(0.44, 0.03, 0.15, 0, 0.07, 0.01, WHITE);
  p.add(new THREE.BoxGeometry(0.44, 0.022, 0.03), 0, 0.072, 0.09, WHITE, 0, false, 0, 0.5);
  p.add(new THREE.BoxGeometry(0.44, 0.13, 0.03).translate(0, 0.065, 0), 0, 0.09, -0.065, WHITE, 0, false, 0, -0.22);
  for (const x of [-0.11, 0.11]) { p.box(0.2, 0.014, 0.12, x, 0.1, 0.012, 0x6ab8e8); p.add(new THREE.BoxGeometry(0.2, 0.08, 0.014).translate(0, 0.04, 0), x, 0.115, -0.045, 0x6ab8e8, 0, false, 0, -0.22); }
  for (const s of [-1, 1]) p.box(0.02, 0.06, 0.16, s * 0.23, 0.07, 0, PEARL);
  p.box(0.44, 0.004, 0.004, 0, 0.068, 0.088, NEON, 0, 'neon');
  p.cyl(0.035, 0.035, 0.008, 10, 0.32, 0.1, 0.05, WHITE); p.cyl(0.006, 0.01, 0.1, 5, 0.32, 0, 0.05, PEARL); p.cyl(0.034, 0.034, 0.003, 10, 0.32, 0.097, 0.05, NEON, 'neon');
  p.cyl(0.01, 0.008, 0.025, 6, 0.32, 0.108, 0.05, 0xf2a03a);
  // les coutures des coussins, le bac planté lumineux de l'autre côté, la borne d'information
  for (const x of [-0.11, 0.11]) p.box(0.004, 0.016, 0.12, x + 0.098, 0.1, 0.012, 0x4a98c8);
  p.cyl(0.05, 0.04, 0.07, 10, -0.33, 0, -0.08, WHITE); p.cyl(0.046, 0.046, 0.006, 10, -0.33, 0.07, -0.08, NEON, 'neon'); tuft(p, -0.33, 0.12, -0.08, 0.045, LEAF, 140);
  for (let k = 0; k < 4; k++) flower(p, -0.33 + Math.cos(k * 1.6) * 0.035, 0.15, -0.08 + Math.sin(k * 1.6) * 0.035, [0xff5ad8, 0xffd25a][k % 2]);
  p.box(0.03, 0.16, 0.02, 0.34, 0, -0.15, PEARL); p.box(0.05, 0.07, 0.006, 0.34, 0.14, -0.138, 0x2e3e50); p.box(0.04, 0.05, 0.007, 0.34, 0.15, -0.137, NEON, 0, 'neon');
  // un petit drone de service qui flotte au-dessus
  const d = kit.sway([0.1, 0.32, 0.05], [0, 1, 0], 0.5, 0.3);
  d.box(0.04, 0.012, 0.04, 0, 0, 0, WHITE); for (const [u, w] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) d.add(new THREE.TorusGeometry(0.012, 0.002, 3, 8).rotateX(PI / 2), u * 0.026, 0.006, w * 0.026, PEARL); d.box(0.012, 0.006, 0.012, 0, -0.01, 0, NEON, 0, 'neon');
}

// ---------------------------------------------------------------- statues

/** Socle mouluré : plinthe, tore, dé (avec une plaque), corniche et sa doucine ; rend la hauteur du dessus */
function plinth(p: Parts, w: number, h: number, stone: number, trim: number, plaque = 0): number {
  p.box(w + 0.08, 0.03, w + 0.08, 0, 0, 0, dk(stone, 0.9));
  p.box(w + 0.05, 0.02, w + 0.05, 0, 0.03, 0, trim);
  p.box(w + 0.03, 0.012, w + 0.03, 0, 0.05, 0, stone);
  p.box(w, h, w, 0, 0.062, 0, stone);
  if (plaque) { p.box(w * 0.6, h * 0.35, 0.006, 0, 0.062 + h * 0.4, w / 2, plaque); p.box(w * 0.45, 0.004, 0.007, 0, 0.062 + h * 0.56, w / 2, dk(plaque, 0.7)); p.box(w * 0.4, 0.004, 0.007, 0, 0.062 + h * 0.48, w / 2, dk(plaque, 0.7)); }
  const t = 0.062 + h;
  p.box(w + 0.02, 0.012, w + 0.02, 0, t, 0, trim);
  p.box(w + 0.05, 0.022, w + 0.05, 0, t + 0.012, 0, stone);
  return t + 0.034;
}

/**
 * Un personnage de statue, face à +z, posé à la hauteur y, à l'échelle s : robe ou jambes, ceinture, buste, épaules, bras en deux
 * parties (`armR` : levée du bras droit, `armL` : du gauche), mains, cou, tête, nez, cheveux (ou capuche) ; `robe` faux : en
 * jambes, avec des chaussures
 */
function figure(p: Parts, y: number, c: number, s: number, o: { armR?: number; armL?: number; robe?: boolean; hair?: number; hood?: boolean } = {}) {
  const k = (n: number) => n * s, robe = o.robe !== false, hair = o.hair ?? dk(c, 0.85);
  if (robe) {
    p.cyl(k(0.032), k(0.05), k(0.13), 8, 0, y, 0, c);
    for (let i = 0; i < 4; i++) p.box(k(0.006), k(0.12), k(0.006), Math.cos(i * 0.7 + 1.2) * k(0.043), y, Math.sin(i * 0.7 + 1.2) * k(0.043), dk(c, 0.9));
  } else {
    for (const x of [-1, 1]) { p.cyl(k(0.013), k(0.015), k(0.12), 6, x * k(0.018), y, 0, c); p.box(k(0.022), k(0.012), k(0.034), x * k(0.018), y, k(0.006), dk(c, 0.8)); }
    p.cyl(k(0.034), k(0.03), k(0.03), 8, 0, y + k(0.1), 0, c);
  }
  p.cyl(k(0.035), k(0.035), k(0.008), 8, 0, y + k(0.122), 0, dk(c, 0.82));
  p.cyl(k(0.04), k(0.032), k(0.08), 8, 0, y + k(0.13), 0, c);
  for (const x of [-1, 1]) p.sphere(k(0.018), x * k(0.036), y + k(0.2), 0, c);
  // bras : le haut depuis l'épaule, l'avant-bras, la main
  const arm = (side: number, lift: number) => {
    const sx = side * k(0.042), sy = y + k(0.2), a = side * lift, ux = Math.sin(a) * k(0.055), uy = -Math.cos(a) * k(0.055);
    p.add(new THREE.CylinderGeometry(k(0.01), k(0.011), k(0.055), 6).translate(0, -k(0.0275), 0), sx, sy, 0, c, 0, false, a);
    const a2 = a + side * 0.25;
    p.add(new THREE.CylinderGeometry(k(0.008), k(0.01), k(0.05), 6).translate(0, -k(0.025), 0), sx + ux, sy + uy, k(0.004), c, 0, false, a2);
    p.sphere(k(0.011), sx + ux + Math.sin(a2) * k(0.052), sy + uy - Math.cos(a2) * k(0.052), k(0.006), c);
  };
  arm(1, o.armR ?? 0.15); arm(-1, o.armL ?? 0.15);
  p.cyl(k(0.011), k(0.013), k(0.02), 6, 0, y + k(0.21), 0, c);
  p.sphere(k(0.026), 0, y + k(0.25), 0, c, 1);
  p.box(k(0.008), k(0.012), k(0.008), 0, y + k(0.247), k(0.025), c);
  if (o.hood) p.add(new THREE.SphereGeometry(k(0.032), 8, 5, 0, PI * 2, 0, PI * 0.62), 0, y + k(0.252), -k(0.004), hair, 0, false, 0, -0.25);
  else p.add(new THREE.SphereGeometry(k(0.028), 8, 4, 0, PI * 2, 0, PI * 0.55), 0, y + k(0.254), -k(0.004), hair, 0, false, 0, -0.3);
}

/**
 * Statue : totem de bois sculpté de trois visages, ailes et bec, plumes, offrande (Préhistoire), figure de marbre drapée tenant
 * sa lance sur un piédestal mouluré, couronne d'or, cyprès (Antiquité), saint de pierre en robe et capuche, livre en main et
 * auréole dorée devant sa niche, cierges et fleurs (Moyen Âge), figure de bronze patiné en redingote, chapeau à la main, sur un
 * socle de granit à corniche et plaque, couronne de fleurs et bornes à chaîne (Industriel), sculpture d'acier en ruban sur
 * dalle, plaque, galets (Moderne), figure de lumière sur un piédestal blanc à anneaux (Futuriste)
 */
function statue(p: Parts, age: number, v: number, kit: DecorKit) {
  if (age === 0) {
    for (let i = 0; i < 8; i++) { const t = (i / 8) * PI * 2; p.add(new THREE.DodecahedronGeometry(0.036, 0), Math.cos(t) * 0.1, 0.015, Math.sin(t) * 0.1, vary(STONE, i, 1, 0.3), t); }
    const W = 0x9a6a40, R = 0xb84a2a, K = 0x2a1a12, O = 0xd8a040;
    p.cyl(0.05, 0.056, 0.5, 8, 0, 0, 0, W);
    // trois visages l'un sur l'autre : sourcils, yeux, nez, bouche dentée ; le bas peint d'ocre rouge
    for (const [y, c] of [[0.1, R], [0.24, O], [0.38, W]] as [number, number][]) {
      p.cyl(0.057, 0.057, 0.014, 8, 0, y - 0.012, 0, dk(c, 0.75));
      p.cyl(0.053, 0.053, 0.11, 8, 0, y, 0, c);
      for (const s of [-1, 1]) { p.box(0.024, 0.018, 0.012, s * 0.022, y + 0.05, 0.05, 0xf4ecdc); p.box(0.01, 0.01, 0.006, s * 0.022, y + 0.054, 0.057, K); p.box(0.028, 0.006, 0.01, s * 0.022, y + 0.07, 0.05, K, 0, false, s * 0.2); }
      p.box(0.05, 0.014, 0.01, 0, y + 0.012, 0.052, K); for (let t = -1; t <= 1; t++) p.box(0.006, 0.008, 0.004, t * 0.014, y + 0.015, 0.058, 0xf4ecdc);
      p.add(new THREE.ConeGeometry(0.012, 0.03, 4).rotateX(PI / 2), 0, y + 0.035, 0.062, dk(c, 0.9));
    }
    // ailes déployées et bec du grand oiseau au sommet, ses yeux
    for (const s of [-1, 1]) { p.add(new THREE.BoxGeometry(0.14, 0.05, 0.016).translate(s * 0.07, 0, 0), s * 0.04, 0.47, 0, s > 0 ? R : O, 0, false, s * 0.25); for (let f = 0; f < 3; f++) p.add(new THREE.BoxGeometry(0.03, 0.012, 0.018), s * (0.08 + f * 0.035), 0.47 + s * (0.02 + f * 0.009) - 0.02, 0, K, 0, false, s * 0.25); }
    p.add(new THREE.ConeGeometry(0.02, 0.07, 4).rotateX(PI / 2), 0, 0.5, 0.06, O);
    p.sphere(0.05, 0, 0.53, 0, W, 0, 0.8); for (const s of [-1, 1]) { p.sphere(0.012, s * 0.025, 0.54, 0.04, 0xf4ecdc); p.sphere(0.006, s * 0.025, 0.54, 0.05, K); }
    // plumes accrochées, l'offrande au pied : un bol de baies, une flèche de silex
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.01, 0.07, 0.002).translate(0, -0.035, 0), s * 0.06, 0.32, 0.02, s > 0 ? 0xf4f0e8 : 0x3a6a8a, 0, false, s * 0.3);
    p.cyl(0.025, 0.02, 0.025, 7, 0.1, 0, 0.11, 0x9a6a44); for (let k = 0; k < 4; k++) p.sphere(0.008, 0.1 + (k - 1.5) * 0.009, 0.03, 0.11, 0xd84a3e);
    p.add(new THREE.ConeGeometry(0.008, 0.03, 4).rotateZ(PI / 2), -0.11, 0.008, 0.1, 0x5a5a62); p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 3).rotateZ(PI / 2), -0.17, 0.008, 0.1, BARK);
    grass(p, 0.15, -0.08); grass(p, -0.14, -0.1);
    return;
  }
  if (age === 1) {
    const top = plinth(p, 0.16, 0.15, MARBLE, TRAV, 0xc8b89a);
    p.box(0.34, 0.02, 0.34, 0, -0.005, 0, TRAV);
    figure(p, top, 0xf4ecdc, 1.2, { armR: 2.4, armL: 0.35 });
    // la lance tenue droite, la couronne de laurier d'or, le manteau sur l'épaule
    p.cyl(0.004, 0.004, 0.36, 4, 0.09, top + 0.04, 0.01, 0xd8ccb4); p.cone(0.009, 0.03, 4, 0.09, top + 0.4, 0.01, 0xd8ccb4);
    p.add(new THREE.TorusGeometry(0.03, 0.005, 3, 10).rotateX(PI / 2), 0, top + 0.31, 0, GOLD);
    p.add(new THREE.BoxGeometry(0.06, 0.14, 0.012), -0.03, top + 0.12, -0.04, 0xe8dcc8, 0, false, 0.2);
    for (const s of [-1, 1]) { p.cyl(0.006, 0.008, 0.12, 4, s * 0.18, 0.02, 0.18, BARK); p.cone(0.04, 0.22, 6, s * 0.18, 0.1, 0.18, 0x3f6a3a); p.cone(0.03, 0.12, 6, s * 0.18, 0.26, 0.18, 0x4a7a42); }
    void v;
    return;
  }
  if (age === 2) {
    // la niche de pierre à arc, le saint en robe et capuche, le livre, l'auréole d'or ; marches, cierges, fleurs
    p.box(0.36, 0.03, 0.28, 0, 0, 0.02, 0xa8a090); p.box(0.3, 0.03, 0.22, 0, 0.03, 0.02, 0xb8b0a0);
    p.box(0.32, 0.44, 0.07, 0, 0.06, -0.1, 0xb8b0a0);
    for (let r = 0; r < 5; r++) p.box(0.322, 0.004, 0.072, 0, 0.1 + r * 0.08, -0.1, dk(0xb8b0a0, 0.88));
    p.add(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 12, 1, false, -PI / 2, PI).rotateX(PI / 2), 0, 0.5, -0.1, 0xb8b0a0);
    p.box(0.2, 0.36, 0.01, 0, 0.08, -0.06, 0x3a4a6a);
    p.add(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 12, 1, false, -PI / 2, PI).rotateX(PI / 2), 0, 0.44, -0.06, 0x3a4a6a);
    for (let k = 0; k < 7; k++) { const t = (k / 6) * PI; p.add(new THREE.OctahedronGeometry(0.006, 0), Math.cos(t) * 0.085, 0.44 + Math.sin(t) * 0.085, -0.054, GOLD); }
    p.cyl(0.06, 0.07, 0.04, 8, 0, 0.06, 0, 0xc8c0b0);
    figure(p, 0.1, 0xd8d0c0, 1.2, { armR: 0.9, armL: 0.9, hood: true, hair: 0xc8c0b0 });
    p.box(0.05, 0.036, 0.012, 0, 0.27, 0.05, 0x8a3a2a, 0, false, 0.1); p.box(0.046, 0.032, 0.013, 0.002, 0.272, 0.051, 0xf2ead8);
    p.add(new THREE.TorusGeometry(0.04, 0.005, 3, 14), 0, 0.42, -0.03, GOLD, 0, true);
    for (const s of [-1, 1]) { p.cyl(0.012, 0.012, 0.05 + (s + 1) * 0.01, 6, s * 0.11, 0.06, 0.1, 0xf4f0e0); kit.flame(s * 0.11, 0.11 + (s + 1) * 0.01, 0.1, 0.25); }
    tuft(p, 0.14, 0.09, 0.06, 0.03, LEAF, 7); for (let k = 0; k < 3; k++) flower(p, 0.13 + k * 0.012, 0.12, 0.07, 0xf4f0e8);
    p.cyl(0.02, 0.016, 0.04, 6, -0.14, 0.06, 0.06, 0x9a6a44); for (let k = 0; k < 3; k++) bloom(p, -0.14 + (k - 1) * 0.01, 0.1, 0.06, 0xf29ab0, 0.8);
    return;
  }
  if (age === 3) {
    // socle de granit à corniche et plaque de bronze ; figure de bronze patiné en redingote, le bras tendu, chapeau en main
    const top = plinth(p, 0.2, 0.18, 0x9a9a9e, 0x8a8a8e, 0xb8843a);
    p.box(0.38, 0.016, 0.38, 0, -0.004, 0, 0xb8b4ac);
    figure(p, top, BRONZE, 1.3, { armR: 1.6, armL: 0.25, robe: false, hair: dk(BRONZE, 0.75) });
    for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.032, 0.11, 0.012), s * 0.028, top + 0.1, 0.038, dk(BRONZE, 0.88), 0, false, s * 0.14);
    p.cyl(0.02, 0.02, 0.035, 8, -0.075, top + 0.12, 0.02, dk(BRONZE, 0.7)); p.cyl(0.032, 0.032, 0.004, 8, -0.075, top + 0.12, 0.02, dk(BRONZE, 0.7));
    // bornes à chaîne, couronne de fleurs déposée, deux pots de géraniums, un pigeon sur la tête
    for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) { p.cyl(0.008, 0.01, 0.1, 5, x, 0.012, z, IRON); p.sphere(0.012, x, 0.116, z, IRON); }
    for (const s of [-1, 1]) p.add(new THREE.TorusGeometry(0.17, 0.003, 3, 10, PI * 0.5), s * 0.17, 0.11, 0, IRON, s > 0 ? PI * 0.75 : -PI * 0.25, false, 0, PI / 2);
    p.add(new THREE.TorusGeometry(0.04, 0.012, 4, 10), 0, 0.08, 0.15, 0x3f6a3a, 0, false, 0, -0.3);
    for (let k = 0; k < 6; k++) { const t = (k / 6) * PI * 2; flower(p, Math.cos(t) * 0.04, 0.08 + Math.sin(t) * 0.038, 0.155 + Math.sin(t) * 0.012, k % 2 ? 0xe83a3a : 0xf4f0e8); }
    for (const s of [-1, 1]) { p.cyl(0.026, 0.02, 0.035, 8, s * 0.12, 0.012, 0.15, 0xb8684a); tuft(p, s * 0.12, 0.07, 0.15, 0.025, LEAF, s + 30); for (let k = 0; k < 3; k++) flower(p, s * 0.12 + (k - 1) * 0.015, 0.09, 0.16, 0xe83a3a, 1.2); }
    p.sphere(0.013, 0, top + 0.37, 0.005, 0x9aa0a8, 0, 0.8); p.sphere(0.008, 0.012, top + 0.385, 0.01, 0x7a8088);
    return;
  }
  if (age === 4) {
    // sculpture moderne : dalle de béton, ruban d'acier qui se tord en boucle sur son pivot, bloc poli, plaque, galets
    p.box(0.32, 0.05, 0.32, 0, 0, 0, 0xc8c4bc); p.box(0.34, 0.008, 0.34, 0, 0.05, 0, 0xd8d4cc);
    const red = [0xd83a2a, 0x2a6ad8, 0xf2c23a][v % 3];
    p.add(new THREE.TorusKnotGeometry(0.068, 0.013, 56, 5, 2, 3), 0, 0.2, 0, red, 0.4);
    p.cyl(0.014, 0.022, 0.09, 6, 0, 0.058, 0, 0x5d6168);
    p.box(0.08, 0.06, 0.06, 0.1, 0.058, 0.08, 0x3a3a40, 0.3); p.box(0.082, 0.004, 0.062, 0.1, 0.118, 0.08, 0x5a5a62, 0.3);
    p.box(0.09, 0.03, 0.004, -0.08, 0.06, 0.172, 0xe8e4dc); p.box(0.06, 0.003, 0.005, -0.08, 0.072, 0.173, 0x3a3a40);
    for (let k = 0; k < 6; k++) p.sphere(0.014, -0.15 + k * 0.012, 0.06, -0.12 + (k % 2) * 0.02, vary(0xd8d4cc, k, 2), 0, 0.5);
    return;
  }
  // figure de lumière, anneaux autour du piédestal blanc, marches lumineuses
  p.cyl(0.15, 0.17, 0.04, 12, 0, 0, 0, WHITE); p.cyl(0.13, 0.15, 0.03, 12, 0, 0.04, 0, PEARL);
  p.cyl(0.08, 0.1, 0.13, 10, 0, 0.07, 0, PEARL); p.cyl(0.11, 0.11, 0.008, 12, 0, 0.2, 0, NEON, 'neon');
  p.add(new THREE.TorusGeometry(0.16, 0.005, 4, 24).rotateX(PI / 2), 0, 0.04, 0, NEON, 0, 'neon');
  const spin = kit.sway([0, 0.34, 0], [0, 1, 0], 0.6, 0.15);
  spin.add(new THREE.TorusGeometry(0.12, 0.004, 4, 20).rotateX(1.2), 0, 0, 0, 0xff5ad8, 0, 'neon');
  figure(p, 0.208, 0x8ae8ff, 1.2, { armR: 2.6, armL: 0.5 });
  p.cyl(0.012, 0.03, 0.22, 6, 0, 0.21, 0, NEON, 'neon');
  // l'étoile tenue à bout de bras, les projecteurs du socle, la plaque lumineuse, les bornes autour
  p.add(new THREE.OctahedronGeometry(0.03, 0), 0.07, 0.5, 0.01, 0xffd25a, 0, 'neon');
  for (let k = 0; k < 4; k++) { const t = (k / 4) * PI * 2 + PI / 4; p.box(0.02, 0.012, 0.02, Math.cos(t) * 0.13, 0.07, Math.sin(t) * 0.13, 0x3a4250); p.box(0.014, 0.004, 0.014, Math.cos(t) * 0.13, 0.083, Math.sin(t) * 0.13, 0xfff1c9, 0, true); }
  p.box(0.08, 0.03, 0.004, 0, 0.1, 0.097, 0x2e3e50); p.box(0.06, 0.006, 0.005, 0, 0.115, 0.098, NEON, 0, 'neon');
  for (let k = 0; k < 6; k++) { const t = (k / 6) * PI * 2; p.cyl(0.01, 0.012, 0.07, 6, Math.cos(t) * 0.24, 0, Math.sin(t) * 0.24, WHITE); p.sphere(0.011, Math.cos(t) * 0.24, 0.075, Math.sin(t) * 0.24, NEON); }
}

// ---------------------------------------------------------------- fontaines

/** Bassin rond mouluré : socle, paroi, margelle en pierres posées en couronne, eau dedans ; rend la hauteur de l'eau */
function basin(p: Parts, kit: DecorKit, r: number, h: number, stone: number, seg = 12): number {
  p.cyl(r + 0.03, r + 0.04, 0.02, seg, 0, 0, 0, dk(stone, 0.85));
  p.cyl(r, r + 0.015, h, seg, 0, 0.02, 0, stone);
  for (let k = 0; k < seg; k++) { const t = (k / seg) * PI * 2 + PI / seg; p.add(new THREE.BoxGeometry(2 * PI * (r + 0.01) / seg * 0.96, 0.024, 0.05), Math.cos(t) * (r + 0.005), 0.02 + h, Math.sin(t) * (r + 0.005), vary(stone, k, 3, 0.12), -t + PI / 2); }
  kit.waterPool(p, 0, h + 0.012, 0, r - 0.025, seg);
  return h + 0.012;
}

/**
 * Fontaine : source dans un rond de pierres moussues, goulotte de bois sur sa fourche d'où coule l'eau, fougères (Préhistoire),
 * bassin de marbre, stèle à tête de lion qui crache, colonnettes, pigeon (Antiquité), bassin octogonal de pierre à margelle,
 * colonne, vasque à quatre becs et son jet, pomme de pin (Moyen Âge), fontaine de fonte à bassin mouluré, cariatides, deux
 * vasques dont l'eau déborde, jet (Industriel), bassin carré aux jets en ligne autour d'une sphère d'acier, projecteurs et
 * margelle (Moderne), sphère d'eau en apesanteur au-dessus d'un anneau de lumière (Futuriste)
 */
function fountain(p: Parts, age: number, v: number, kit: DecorKit) {
  if (age === 0) {
    for (let i = 0; i < 12; i++) { const t = (i / 12) * PI * 2; p.add(new THREE.DodecahedronGeometry(0.05 + H(i, 1) * 0.02, 0), Math.cos(t) * 0.28, 0.02, Math.sin(t) * 0.28, i % 3 ? vary(STONE, i, 2, 0.3) : MOSS, t); if (i % 3 === 0) p.sphere(0.03, Math.cos(t) * 0.28, 0.06, Math.sin(t) * 0.28, MOSS, 0, 0.5); }
    kit.waterPool(p, 0, 0.02, 0, 0.25, 12);
    // la goulotte de bois creusée, posée sur une fourche, et le filet d'eau qui tombe en éclaboussant
    p.add(new THREE.BoxGeometry(0.045, 0.022, 0.26), 0, 0.15, -0.28, BARK, 0, false, 0, -0.3); p.add(new THREE.BoxGeometry(0.03, 0.006, 0.26), 0, 0.162, -0.28, WATER, 0, false, 0, -0.3);
    for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.006, 0.008, 0.15, 4).translate(0, 0.075, 0), s * 0.022, 0, -0.18, BARK, 0, false, s * 0.2);
    p.cyl(0.006, 0.01, 0.1, 4, 0, 0.02, -0.15, SPRAY); for (let k = 0; k < 4; k++) p.add(new THREE.OctahedronGeometry(0.006, 0), Math.cos(k * 1.6) * 0.02, 0.03, -0.15 + Math.sin(k * 1.6) * 0.02, 0xf2fbff);
    p.add(new THREE.DodecahedronGeometry(0.1, 0), 0, 0.05, -0.42, vary(STONE, 9, 3), 0.4); p.sphere(0.05, 0.04, 0.12, -0.42, MOSS, 0, 0.5);
    for (let i = 0; i < 4; i++) { const t = 0.5 + i * 1.6; for (let k = 0; k < 5; k++) p.add(new THREE.ConeGeometry(0.012, 0.1, 3).translate(0, 0.05, 0), Math.cos(t) * 0.38, 0.01, Math.sin(t) * 0.38, k % 2 ? LEAF2 : LEAF, k * 1.25, false, 0.6); }
    // une gourde de peau posée sur une pierre
    p.sphere(0.03, 0.3, 0.06, 0.15, 0xb8906a, 0, 1.2); p.cyl(0.008, 0.01, 0.02, 5, 0.3, 0.09, 0.15, 0x8a6a48);
    return;
  }
  if (age === 1) {
    p.box(0.64, 0.05, 0.52, 0, 0, 0.06, TRAV); p.box(0.58, 0.02, 0.46, 0, 0.03, 0.06, MARBLE);
    for (const s of [-1, 1]) { p.box(0.66, 0.03, 0.04, 0, 0.05, 0.06 + s * 0.25, MARBLE); p.box(0.04, 0.03, 0.5, s * 0.31, 0.05, 0.06, MARBLE); }
    p.box(0.52, 0.035, 0.4, 0, 0.028, 0.06, WATER); kit.waterPool(p, 0, 0.065, 0.08, 0.16, 10, true);
    p.box(0.42, 0.36, 0.09, 0, 0.05, -0.2, MARBLE); p.box(0.46, 0.03, 0.11, 0, 0.41, -0.2, TRAV);
    p.add(new THREE.ConeGeometry(0.26, 0.09, 4, 1).rotateY(PI / 4).scale(1, 1, 0.26), 0, 0.485, -0.2, TRAV);
    p.sphere(0.02, 0, 0.47, -0.15, GOLD);
    // la tête de lion qui crache : crinière, museau, yeux ; le filet d'eau et ses gouttes
    p.sphere(0.055, 0, 0.25, -0.15, 0xd8b048, 0); for (let k = 0; k < 8; k++) { const t = (k / 8) * PI * 2; p.sphere(0.016, Math.cos(t) * 0.05, 0.25 + Math.sin(t) * 0.05, -0.14, 0xc89838); }
    p.sphere(0.028, 0, 0.235, -0.11, 0xc8a038, 0, 0.8); for (const s of [-1, 1]) p.sphere(0.006, s * 0.02, 0.27, -0.105, 0x3a2a1a);
    p.add(new THREE.CylinderGeometry(0.006, 0.01, 0.18, 4).translate(0, -0.09, 0), 0, 0.225, -0.095, SPRAY, 0, false, 0, 0.7);
    for (let k = 0; k < 4; k++) p.add(new THREE.OctahedronGeometry(0.006, 0), Math.cos(k * 1.6) * 0.025, 0.07, 0.02 + Math.sin(k * 1.6) * 0.02, 0xf2fbff);
    for (const s of [-1, 1]) { p.cyl(0.022, 0.024, 0.32, 8, s * 0.17, 0.05, -0.145, MARBLE); p.box(0.05, 0.02, 0.05, s * 0.17, 0.37, -0.145, TRAV); p.box(0.05, 0.02, 0.05, s * 0.17, 0.05, -0.145, TRAV); }
    // une hydrie posée sur la margelle, un pigeon qui boit
    p.cyl(0.02, 0.026, 0.05, 8, 0.25, 0.08, 0.27, 0x3a2a20); p.cyl(0.012, 0.02, 0.02, 8, 0.25, 0.13, 0.27, 0x3a2a20); p.box(0.03, 0.01, 0.004, 0.25, 0.1, 0.296, 0xd8783a);
    p.sphere(0.014, -0.25, 0.09, 0.28, 0x9aa0a8, 0, 0.8); p.sphere(0.009, -0.24, 0.105, 0.29, 0x7a8088);
    void v;
    return;
  }
  if (age === 2) {
    // bassin octogonal à margelle, colonne, vasque à quatre becs et son jet, pomme de pin
    const S = 0xb8b0a0, top = basin(p, kit, 0.32, 0.07, S, 8);
    p.cyl(0.05, 0.065, 0.06, 8, 0, 0.02, 0, dk(S, 0.92)); p.cyl(0.04, 0.05, 0.16, 8, 0, 0.08, 0, 0xc8c0b0);
    for (const y of [0.12, 0.2]) p.cyl(0.046, 0.046, 0.012, 8, 0, y, 0, dk(S, 0.9));
    p.cyl(0.15, 0.06, 0.05, 10, 0, 0.24, 0, 0xc8c0b0); p.add(new THREE.TorusGeometry(0.148, 0.01, 3, 12).rotateX(PI / 2), 0, 0.29, 0, 0xc8c0b0); p.cyl(0.135, 0.135, 0.004, 10, 0, 0.286, 0, 0x5aa8c8);
    p.cyl(0.03, 0.04, 0.08, 8, 0, 0.29, 0, 0xc8c0b0); p.cone(0.04, 0.07, 8, 0, 0.37, 0, 0x8a8a7a);
    for (let r = 0; r < 3; r++) p.cyl(0.042 - r * 0.01, 0.042 - r * 0.01, 0.006, 8, 0, 0.38 + r * 0.02, 0, dk(0x8a8a7a, 0.85));
    kit.waterJet(p, 0, 0.44, 0, 0.07);
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * PI * 2 + PI / 4;
      p.add(new THREE.CylinderGeometry(0.008, 0.011, 0.05, 5).rotateZ(PI / 2), Math.cos(t) * 0.16, 0.265, Math.sin(t) * 0.16, 0x8a8a7a, -t);
      p.sphere(0.014, Math.cos(t) * 0.14, 0.265, Math.sin(t) * 0.14, 0x8a8a7a);
      p.cyl(0.006, 0.004, 0.2, 4, Math.cos(t) * 0.2, top, Math.sin(t) * 0.2, SPRAY);
      p.sphere(0.014, Math.cos(t) * 0.2, top + 0.002, Math.sin(t) * 0.2, 0xf2fbff, 0, 0.4);
    }
    // un seau de bois posé sur la margelle, de la mousse entre les pierres
    p.cyl(0.03, 0.024, 0.045, 8, 0.27, 0.1, 0.16, 0x8a6a48); p.add(new THREE.TorusGeometry(0.028, 0.003, 3, 8, PI), 0.27, 0.145, 0.16, IRON);
    for (let k = 0; k < 3; k++) { const t = 1 + k * 2; p.sphere(0.016, Math.cos(t) * 0.36, 0.03, Math.sin(t) * 0.36, MOSS, 0, 0.5); }
    return;
  }
  if (age === 3) {
    // fonte vert sombre : bassin mouluré, quatre cariatides, deux vasques dont l'eau déborde, dôme, fleuron, jet
    const G = 0x2c4a3e, top = basin(p, kit, 0.34, 0.06, 0x9a9a9e, 16);
    p.cyl(0.08, 0.1, 0.05, 8, 0, 0.04, 0, G); p.add(new THREE.TorusGeometry(0.085, 0.008, 3, 10).rotateX(PI / 2), 0, 0.09, 0, G);
    for (let k = 0; k < 4; k++) { const t = (k / 4) * PI * 2 + PI / 4, x = Math.cos(t) * 0.05, z = Math.sin(t) * 0.05; p.cyl(0.012, 0.018, 0.12, 6, x, 0.09, z, G); p.cyl(0.014, 0.012, 0.03, 6, x, 0.21, z, G); p.sphere(0.013, x, 0.255, z, G); for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.004, 0.005, 0.05, 4).translate(0, 0.025, 0), x + s * Math.sin(t) * 0.012, 0.22, z - s * Math.cos(t) * 0.012, G, 0, false, 0.2 * s); }
    p.cyl(0.19, 0.06, 0.04, 14, 0, 0.27, 0, G); p.add(new THREE.TorusGeometry(0.188, 0.008, 3, 16).rotateX(PI / 2), 0, 0.31, 0, G); p.cyl(0.17, 0.17, 0.004, 14, 0, 0.306, 0, 0x5aa8c8);
    p.cyl(0.025, 0.03, 0.1, 6, 0, 0.31, 0, G); p.cyl(0.09, 0.03, 0.03, 10, 0, 0.4, 0, G); p.add(new THREE.TorusGeometry(0.088, 0.005, 3, 12).rotateX(PI / 2), 0, 0.43, 0, G);
    p.add(new THREE.SphereGeometry(0.05, 8, 4, 0, PI * 2, 0, PI / 2), 0, 0.43, 0, G); p.sphere(0.012, 0, 0.49, 0, 0xc8a24a);
    kit.waterJet(p, 0, 0.5, 0, 0.06);
    for (let k = 0; k < 6; k++) { const t = (k / 6) * PI * 2; p.cyl(0.005, 0.003, 0.24, 4, Math.cos(t) * 0.19, top, Math.sin(t) * 0.19, SPRAY); p.sphere(0.012, Math.cos(t) * 0.19, top + 0.003, Math.sin(t) * 0.19, 0xf2fbff, 0, 0.4); p.cyl(0.004, 0.003, 0.03, 4, Math.cos(t + 0.5) * 0.088, 0.4, Math.sin(t + 0.5) * 0.088, SPRAY); }
    return;
  }
  if (age === 4) {
    p.box(0.8, 0.06, 0.6, 0, 0, 0, 0xc8c4bc); p.box(0.72, 0.02, 0.52, 0, 0.045, 0, 0x5aa8c8); p.box(0.68, 0.004, 0.48, 0, 0.06, 0, 0x8fd0e0);
    for (const i of [0, 1, 3, 4]) kit.waterJet(p, -0.28 + i * 0.14, 0.06, 0, 0.1 + (i % 2) * 0.08);
    for (const s of [-1, 1]) { p.box(0.82, 0.016, 0.05, 0, 0.06, s * 0.29, 0xd8d4cc); p.box(0.05, 0.016, 0.6, s * 0.39, 0.06, 0, 0xd8d4cc); }
    p.cyl(0.04, 0.05, 0.04, 8, 0, 0.05, 0, 0x8a8f96); p.sphere(0.075, 0, 0.16, 0, 0xc8d0d8, 1); p.sphere(0.03, 0.03, 0.2, 0.04, 0xeef4f8, 0);
    for (const i of [0, 1, 3, 4]) p.cyl(0.012, 0.012, 0.006, 6, -0.28 + i * 0.14, 0.058, 0.1, 0xfff1c9, true);
    for (const s of [-1, 1]) p.box(0.08, 0.004, 0.03, s * 0.3, 0.078, 0.29, 0xb8843a);
    // des pièces au fond, un bateau de papier qui flotte
    for (let k = 0; k < 5; k++) p.cyl(0.006, 0.006, 0.002, 6, -0.2 + k * 0.09, 0.05, -0.12 + (k % 2) * 0.05, 0xd8b048);
    p.add(new THREE.ConeGeometry(0.02, 0.03, 3).rotateX(PI), 0.2, 0.09, 0.12, 0xf4f0e8); p.box(0.04, 0.008, 0.016, 0.2, 0.062, 0.12, 0xf4f0e8);
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
  // la margelle blanche en dalles, les jets fins qui montent vers la sphère, des bancs courbes et des bacs plantés autour
  for (let k = 0; k < 16; k++) { const t = (k / 16) * PI * 2; p.add(new THREE.BoxGeometry(0.11, 0.012, 0.05), Math.cos(t) * 0.315, 0.04, Math.sin(t) * 0.315, k % 2 ? WHITE : PEARL, -t + PI / 2); }
  for (let k = 0; k < 6; k++) { const t = (k / 6) * PI * 2 + 0.5; p.cyl(0.002, 0.004, 0.18, 3, Math.cos(t) * 0.1, 0.05, Math.sin(t) * 0.1, SPRAY); p.cyl(0.008, 0.008, 0.004, 6, Math.cos(t) * 0.1, 0.05, Math.sin(t) * 0.1, NEON, 'neon'); }
  for (const t of [0.8, 2.9, 5.0]) { p.cyl(0.035, 0.03, 0.05, 8, Math.cos(t) * 0.42, 0, Math.sin(t) * 0.42, WHITE); tuft(p, Math.cos(t) * 0.42, 0.08, Math.sin(t) * 0.42, 0.035, LEAF, Math.round(t * 10)); flower(p, Math.cos(t) * 0.42, 0.11, Math.sin(t) * 0.42, 0xff5ad8, 1.3); }
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

