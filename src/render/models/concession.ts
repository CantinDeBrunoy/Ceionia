import * as THREE from 'three';
import { Parts, type Glow } from '../parts';
import type { People } from '../../world/archipelago';
import { TEAM_A, TEAM_FLAG } from '../teamPaint';
import { Fr, person, tubeW, type ModelKit } from '../frame';
import { O, Face, bay, door, mosaic, merlons, mashrabiya, dome, finial, cypress, jar, dark } from './oriental';
import { A, hipRoof, lantern, rail } from './asian';

/**
 * Les bâtiments de la concession, la zone que le joueur bâtit chez le peuple allié de l'archipel (voir `docs/iles.md` et
 * `docs/diplomatie.md`). Ils prennent le style de l'allié (sable, faïence turquoise, arcs brisés et coupoles chez les
 * Orientaux ; brique grise, laque rouge et toits courbes chez les Asiatiques), un de nos drapeaux flotte à côté du sien.
 * La base arrière de la guerre (Médiéval au Futuriste) : la caserne alliée, le chantier naval allié, l'hôpital allié.
 * La paix (Industriel au Futuriste) : le port marchand et sa ligne de vapeurs (3 × 3), la halle des échanges, l'école
 * commune (une aile à notre style, une aile au leur), le dispensaire ; puis le centre de recherche commun (Moderne).
 * Mêmes conventions que `models.ts` : on dessine dans un `Parts`, origine au centre de l'emprise, façade (la porte) vers +z,
 * 1 = une case ; un 2 × 2 va de -1 à 1, un 3 × 3 de -1,5 à 1,5. Pas de dalle pleine : le sol du jeu se voit entre les
 * dallages, l'appelant fait `sink(0.012)`. Les aides du moteur (pièces qui se balancent ou tournent, fumée, personnages
 * animés) arrivent par `ConcessionKit`, pour ne pas importer models.ts
 */

/** Attitude d'un personnage animé (comme `Pose` de models.ts) */
export type Pose = 'idle' | 'cheer' | 'run';
/**
 * Le kit des modèles de la concession : celui de l'arène (`ARENA_KIT`), plus le personnage animé de models.ts (`figure`)
 * et la mise à la taille d'un enfant (`lifeSize`). Sans `figure`, des personnages figés (`person` de frame.ts)
 */
export interface ConcessionKit extends ModelKit {
  figure?: (p: Parts, x: number, z: number, body: number, ry?: number, sit?: boolean, hair?: number, pose?: Pose, up?: number) => void;
  life?: (p: Parts, x: number, y: number, z: number, draw: () => void, k?: number) => void;
}

type V3 = [number, number, number];
const PI = Math.PI;

// ---------- Palettes ----------

/** Palette de l'allié à un âge (comme `pal` de landmarks.ts, plus le sol, le bois et le drapeau) */
interface Pal {
  wall: number; trim: number; brick: number; roof: number; accent: number; accent2: number; glass: number; neon: number; metal: number;
  ground: number; ground2: number; wood: number; flag: number; arch: boolean;
}
function pal(people: People, age: number): Pal {
  const or = people === 'orient';
  if (age <= 2) return or
    ? { wall: O.white, trim: O.stone, brick: O.mudL, roof: 0x8a6a58, accent: O.turq, accent2: O.cobalt, glass: O.win, neon: O.turqL, metal: 0x4a4e54, ground: 0xdcc69a, ground2: 0xcdb487, wood: O.wood, flag: 0x2aa8a0, arch: true }
    : { wall: A.plaster, trim: A.stone, brick: 0x8e8278, roof: A.tile, accent: A.red, accent2: A.tileG, glass: A.win, neon: A.amber, metal: 0x3e4248, ground: 0xb8b0a0, ground2: 0xa8a294, wood: A.timber, flag: 0xc0392e, arch: false };
  if (age === 3) return or
    ? { wall: O.cream, trim: O.stone, brick: 0xc8946a, roof: 0x8a6a58, accent: O.turq, accent2: O.cobalt, glass: O.win, neon: O.turqL, metal: 0x4a4e54, ground: 0xd8c49a, ground2: 0xc9b38a, wood: O.wood, flag: 0x2aa8a0, arch: true }
    : { wall: 0xe6dccb, trim: 0xb8b2a8, brick: 0x8e8278, roof: A.tileG, accent: A.red, accent2: A.tile, glass: A.win, neon: A.amber, metal: 0x3e4248, ground: 0xb4aea2, ground2: 0xa29c90, wood: A.timber, flag: 0xc0392e, arch: false };
  if (age === 4) return or
    ? { wall: O.concrete, trim: O.sand, brick: 0xd8cbb0, roof: 0xb8bcc0, accent: O.turq, accent2: O.gold, glass: 0x8fb0c4, neon: O.turqL, metal: 0x9aa3a8, ground: 0xd4ccbc, ground2: 0xc4bcac, wood: O.wood, flag: 0x2aa8a0, arch: true }
    : { wall: A.concrete, trim: A.concreteD, brick: 0xa8a29a, roof: 0x9aa0a6, accent: A.red, accent2: A.tileG, glass: 0x9ec0b8, neon: A.pink, metal: A.steel, ground: 0xc4c2bc, ground2: 0xb4b2ac, wood: A.timber, flag: 0xc0392e, arch: false };
  return or
    ? { wall: O.marble, trim: 0xdfe6e6, brick: 0xeef2f2, roof: 0xd8dee0, accent: O.turqD, accent2: O.gold, glass: O.glass, neon: O.turqL, metal: 0xc9ced0, ground: 0xe6e4dc, ground2: 0xd6d4cc, wood: O.wood, flag: 0x2aa8a0, arch: true }
    : { wall: 0xf2f0ea, trim: 0xd8d8d0, brick: 0xe8e6e0, roof: A.tileB, accent: A.red, accent2: A.tileG, glass: A.glass, neon: A.cyan, metal: 0xc8ccd0, ground: 0xe2e0da, ground2: 0xd2d0ca, wood: A.timber, flag: 0xc0392e, arch: false };
}

/** Nos couleurs à un âge (celles de nos bâtiments, `C` de models.ts) */
interface Ours { wall: number; trim: number; roof: number; win: number; door: number; accent: number; neon: number }
function ours(age: number): Ours {
  if (age <= 2) return { wall: 0xf4e8d0, trim: 0xcfcac2, roof: 0xe39a86, win: 0x9db4c6, door: 0x7a5a48, accent: 0x7a6355, neon: 0xffb15c };
  if (age === 3) return { wall: 0xc98a72, trim: 0xf4e8d0, roof: 0x8e9bb4, win: 0x9db4c6, door: 0x3f5a4a, accent: 0xa85e50, neon: 0xffe2a0 };
  if (age === 4) return { wall: 0xe6e2da, trim: 0xc4c0b8, roof: 0x9a9aa0, win: 0x86b8cc, door: 0x3a4a5a, accent: 0xd8786c, neon: 0xffe2a0 };
  return { wall: 0xf4f4f0, trim: 0xdcdcd8, roof: 0x8fcf7e, win: 0x9fd8e6, door: 0x5a6a7a, accent: 0x86c4b8, neon: 0x6ae4ff };
}

const SKINS = [0xe8b894, 0xc89870, 0xf0c8a4, 0xa87850];
const HAIRS = [0x4a3426, 0x2a2a2e, 0x8a5a30, 0x1e1e22];
const CLOTH = [0x3a5a9a, 0xd84a3e, 0x6a8a4a, 0xf2c23a, 0x8a5a8a, 0xd8a03a, 0x86c4b8, 0xe8dcc0];
const RED_CROSS = 0xd8302a;
/** L'élément `i` d'une liste, en boucle */
const pick = <T,>(a: T[], i: number) => a[((Math.round(i) % a.length) + a.length) % a.length];

// ---------- Personnages ----------

/** Un habitant (animé si le kit le permet) ; `sit` : assis, `up` : posé plus haut */
function who(p: Parts, kit: ConcessionKit, x: number, z: number, body: number, ry = 0, o: { sit?: boolean; hair?: number; pose?: Pose; up?: number } = {}) {
  const hair = o.hair ?? pick(HAIRS, Math.round(x * 37 + z * 53));
  if (kit.figure) { kit.figure(p, x, z, body, ry, !!o.sit, hair, o.pose ?? 'idle', o.up ?? 0); return; }
  person(new Fr(p), x, z, ry, body, { y: (o.up ?? 0) + (o.sit ? -0.03 : 0), hair, arms: o.pose === 'cheer' ? 'up' : 'down' });
}
/** Un enfant (les trois quarts d'un habitant) */
function kid(p: Parts, kit: ConcessionKit, x: number, z: number, body: number, ry = 0, pose: Pose = 'idle') {
  const hair = pick(HAIRS, Math.round(x * 41 + z * 29));
  if (kit.figure && kit.life) { kit.life(p, x, 0.012, z, () => kit.figure!(p, x, z, body, ry, false, hair, pose, 0), 0.72); return; }
  person(new Fr(p, x, z, 0, 0.72), 0, 0, ry, body, { hair, arms: pose === 'cheer' ? 'up' : 'down' });
}

/** La tenue d'un soldat allié : tunique, ceinture, coiffe, jambes, arme */
interface Troop { coat: number; sash: number; hat: 'turban' | 'cone' | 'beret' | 'helmet'; hatC: number; legs: number; arm: 'spear' | 'rifle' | 'pulse'; neon?: number }
function troop(people: People, age: number): Troop {
  if (people === 'orient') {
    if (age <= 2) return { coat: 0xd8b47a, sash: 0x2fa8a0, hat: 'turban', hatC: 0xf2ece0, legs: 0xf2ece0, arm: 'spear' };
    if (age === 3) return { coat: 0xf2ece0, sash: 0x2fa8a0, hat: 'turban', hatC: 0x2fa8a0, legs: 0x2a3e6a, arm: 'rifle' };
    if (age === 4) return { coat: 0xc8a870, sash: 0x8a7a50, hat: 'beret', hatC: 0x2fa8a0, legs: 0xb89a62, arm: 'rifle' };
    return { coat: 0xeef0ee, sash: 0x8a9096, hat: 'helmet', hatC: 0xeef0ee, legs: 0xc8ccd0, arm: 'pulse', neon: O.turqL };
  }
  if (age <= 2) return { coat: 0xb02a22, sash: 0x24201e, hat: 'cone', hatC: 0xd8c080, legs: 0x24201e, arm: 'spear' };
  if (age === 3) return { coat: 0x24201e, sash: 0xb02a22, hat: 'cone', hatC: 0xd8c080, legs: 0x24201e, arm: 'rifle' };
  if (age === 4) return { coat: 0x3a8a6a, sash: 0x2a3a30, hat: 'helmet', hatC: 0x3a5a4a, legs: 0x2a3a30, arm: 'rifle' };
  return { coat: 0x24201e, sash: 0x3a3a40, hat: 'helmet', hatC: 0x2a2a30, legs: 0x2a2a30, arm: 'pulse', neon: A.pink };
}

/**
 * Soldat allié à l'exercice, tourné de `ry` : jambes, tunique et ceinture, tête et coiffe, l'arme au bras droit. Le kit
 * l'anime (le buste qui se balance, le bras de l'arme qui se lève et s'abaisse, `phase` le décale de ses voisins)
 */
function soldier(p: Parts, kit: ConcessionKit, people: People, age: number, x: number, z: number, ry: number, phase: number) {
  const t = troop(people, age), c = Math.cos(ry), s = Math.sin(ry), skin = pick(SKINS, Math.round(phase * 3));
  const at = (q: Parts) => new Fr(q, x, z, ry);
  const g = at(p);
  g.box(0.02, 0.07, 0.022, -0.014, 0, 0, t.legs); g.box(0.02, 0.07, 0.022, 0.014, 0, 0, t.legs);
  const torso = (q: Parts) => {
    const f = at(q);
    f.box(0.056, 0.075, 0.036, 0, 0.068, 0, t.coat);
    f.box(0.058, 0.014, 0.038, 0, 0.082, 0, t.sash, t.neon !== undefined ? 'neon' : false);
    f.box(0.032, 0.032, 0.032, 0, 0.143, 0, skin);
    f.box(0.016, 0.055, 0.018, -0.037, 0.083, 0, t.coat); f.box(0.018, 0.018, 0.02, -0.037, 0.068, 0, skin);
    if (t.hat === 'turban') { f.cyl(0.022, 0.019, 0.024, 6, 0, 0.168, 0, t.hatC); f.cone(0.016, 0.018, 4, 0, 0.192, 0, t.hatC); }
    else if (t.hat === 'cone') f.cone(0.046, 0.034, 6, 0, 0.17, 0, t.hatC);
    else if (t.hat === 'beret') f.box(0.038, 0.012, 0.038, 0.004, 0.175, 0, t.hatC);
    else f.ball(0.024, 0, 0.17, 0, t.hatC, false, 1, 0.8, 1);
  };
  const arm = (q: Parts) => {
    const f = at(q);
    f.box(0.016, 0.055, 0.018, 0.037, 0.083, 0, t.coat); f.box(0.018, 0.018, 0.02, 0.037, 0.068, 0.004, skin);
    if (t.arm === 'spear') { f.cyl(0.004, 0.004, 0.32, 4, 0.04, 0.02, 0.016, 0x6b4a30); f.cone(0.008, 0.03, 4, 0.04, 0.34, 0.016, 0xc4cad2); if (people === 'asie') f.ball(0.01, 0.04, 0.33, 0.016, 0xc0392e); }
    else {
      f.box(0.01, 0.15, 0.014, 0.04, 0.04, 0.016, t.arm === 'pulse' ? 0xd8dce0 : 0x5a3e2c);
      f.box(0.006, 0.05, 0.006, 0.04, 0.19, 0.016, 0xc4cad2);
      if (t.neon !== undefined) f.box(0.012, 0.03, 0.016, 0.04, 0.1, 0.016, t.neon, 'neon');
    }
  };
  if (!kit.fan) { torso(p); arm(p); return; }
  kit.fan(torso, [x, 0.012, z], [s, 0, c], 0.03, 0.5, phase, 0.003);
  const sh: V3 = [x + 0.037 * c, 0.012 + 0.135, z - 0.037 * s];
  kit.fan(arm, sh, [c, 0, -s], 0.32, 0.5, phase, 0.003);
}

// ---------- Drapeaux ----------

/** Mât et sa pomme ; rend le haut */
function mast(p: Parts, x: number, z: number, h: number, col: number, y = 0) {
  p.cyl(0.006, 0.009, h, 5, x, y, z, col);
  p.sphere(0.011, x, y + h + 0.008, z, O.gold);
  return y + h;
}
/** Un de nos drapeaux (au blason du village), qui flotte au vent */
function ourFlag(p: Parts, kit: ConcessionKit, x: number, z: number, h: number, col: number, k = 1, y = 0) {
  const top = mast(p, x, z, h, col, y);
  kit.sway([x, top - 0.01, z], [0, 1, 0], 0.35, 0.8 + x * 0.1).box(0.16 * k, 0.1 * k, 0.004, 0.08 * k, -0.1 * k, 0, TEAM_FLAG);
}
/** Le drapeau de l'allié : coupole blanche et épi d'or sur le turquoise, ou deux toits verts sur le rouge laqué */
function allyFlag(p: Parts, kit: ConcessionKit, people: People, x: number, z: number, h: number, col: number, k = 1, y = 0) {
  const top = mast(p, x, z, h, col, y), f = kit.sway([x, top - 0.01, z], [0, 1, 0], 0.35, 0.75 + z * 0.1);
  const c = pal(people, 3);
  f.box(0.16 * k, 0.1 * k, 0.004, 0.08 * k, -0.1 * k, 0, c.flag);
  f.box(0.16 * k, 0.008 * k, 0.005, 0.08 * k, -0.1 * k, 0, 0xd9a955);
  if (people === 'orient') {
    f.box(0.05 * k, 0.014 * k, 0.006, 0.08 * k, -0.07 * k, 0, 0xf4e6c4);
    f.add(new THREE.CircleGeometry(0.022 * k, 6, 0, PI), 0.08 * k, -0.056 * k, 0.0032, 0xf8f6f0);
    f.add(new THREE.CircleGeometry(0.022 * k, 6, 0, PI).rotateY(PI), 0.08 * k, -0.056 * k, -0.0032, 0xf8f6f0);
    f.box(0.006 * k, 0.012 * k, 0.006, 0.08 * k, -0.034 * k, 0, 0xe8b84a);
  } else for (const [y0, w] of [[-0.04, 0.09], [-0.07, 0.07]]) f.box(w * k, 0.014 * k, 0.006, 0.08 * k, y0 * k, 0, 0x2f7a5a);
}
/** Nos deux drapeaux côte à côte (le leur à gauche, le nôtre à droite), le long de x */
function twoFlags(p: Parts, kit: ConcessionKit, people: People, x: number, z: number, h: number, gap: number, col: number, k = 1, y = 0) {
  allyFlag(p, kit, people, x - gap / 2, z, h, col, k, y);
  ourFlag(p, kit, x + gap / 2, z, h, col, k, y);
}

// ---------- Végétation ----------

/** Pin aux étages de feuillage plats */
function pine(p: Parts, x: number, z: number, h: number, seed = 0) {
  p.cyl(0.022, 0.035, h * 0.7, 5, x, 0, z, 0x5e4130);
  for (let i = 0; i < 3; i++) {
    const a = seed + i * 2.1, r = h * (0.24 - i * 0.05), ox = Math.sin(a) * h * 0.1, oz = Math.cos(a) * h * 0.1;
    p.cyl(r * 0.7, r, h * 0.09, 7, x + ox, h * (0.42 + i * 0.2), z + oz, i % 2 ? dark(A.pine, 1.12) : A.pine);
  }
}
/** Touffe de bambous */
function bamboo(p: Parts, x: number, z: number, h: number, seed = 0) {
  for (let j = 0; j < 4; j++) {
    const a = seed + j * 1.7, ox = Math.sin(a) * 0.045, oz = Math.cos(a) * 0.045, hh = h * (0.8 + (j % 2) * 0.2);
    p.cyl(0.009, 0.01, hh, 4, x + ox, 0, z + oz, A.bamboo);
    p.sphere(0.045, x + ox, hh - 0.02, z + oz, dark(A.bamboo, 0.85), 0, 1.6);
  }
}
/** Notre arbre : tronc et feuillage en trois boules */
function ourTree(p: Parts, x: number, z: number, h: number, col = 0x8fbf72) {
  p.cyl(0.02, 0.03, h * 0.45, 5, x, 0, z, 0x7a6355);
  p.sphere(h * 0.24, x, h * 0.58, z, col, 0, 0.85);
  p.sphere(h * 0.16, x + h * 0.12, h * 0.5, z + h * 0.06, dark(col, 0.9), 0, 0.85);
}
/** Une palme : lame pliée sur sa nervure, qui monte puis retombe, visible des deux côtés (plus courte que celle d'oriental.ts) */
function frond(L: number, k: number) {
  const w = 0.035, up = L * 0.4 * k, B = [0, 0, 0], M = [0, up + 0.01, L * 0.8], ML = [-w, up - 0.008, L * 0.75], MR = [w, up - 0.008, L * 0.75];
  const T = [0, up - L * 0.5 * k, L * 1.4], tri = [B, M, ML, B, MR, M, ML, M, T, M, MR, T];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...tri, ...tri.slice().reverse()].flat()), 3));
  return g;
}
/** Palmier de cour : stipe un peu penché, couronne de sept palmes courtes (il reste sur la parcelle), régime de dattes */
function palmTree(p: Parts, x: number, z: number, h: number, seed: number, dates = true) {
  const lean = (((seed * 7) % 5) - 2) * 0.04, dir = seed * 1.7, lx = Math.cos(dir) * lean, lz = Math.sin(dir) * lean;
  p.add(new THREE.CylinderGeometry(0.022, 0.034, h, 5).translate(0, h / 2, 0), x, 0, z, 0x8a6a48, 0, false, -lx, lz);
  const tx = x + Math.sin(lx) * h, tz = z + Math.sin(lz) * h, ty = h * Math.cos(lean);
  p.add(new THREE.CylinderGeometry(0.03, 0.026, 0.03, 5, 1, true), tx, ty - 0.05, tz, 0x6e5438);
  p.sphere(0.034, tx, ty, tz, 0x6e5438);
  const L = 0.1 + h * 0.1;
  for (let i = 0; i < 7; i++) p.add(frond(L, i % 2 ? 0.8 : 1).rotateY((i / 7) * PI * 2 + seed), tx, ty, tz, i % 2 ? 0x5f9442 : dark(0x5f9442, 1.15));
  if (dates) p.sphere(0.03, tx + Math.sin(seed) * 0.04, ty - 0.05, tz + Math.cos(seed) * 0.04, 0xb5652a, 0, 1.4);
}
/** L'arbre de l'allié : palmier (un cyprès sur trois) chez les Orientaux, pin (ou bambous) chez les Asiatiques */
function tree(p: Parts, people: People, x: number, z: number, h: number, seed: number) {
  if (people === 'orient') { if (seed % 3 === 2) cypress(p, x, z, h * 0.8); else palmTree(p, x, z, h, seed, seed % 2 === 0); }
  else if (seed % 3 === 2) bamboo(p, x, z, h * 0.8, seed); else pine(p, x, z, h, seed);
}
/** Massif bas fleuri */
function shrub(p: Parts, x: number, z: number, r: number, seed: number, col = 0x6f9a4a) {
  p.sphere(r, x, r * 0.6, z, col, 0, 0.75);
  p.sphere(r * 0.6, x + r * 0.6, r * 0.5, z - r * 0.3, dark(col, 0.88), 0, 0.75);
  p.sphere(r * 0.22, x - r * 0.3, r * 1.1, z + r * 0.4, pick([0xd8577a, 0xe8c14a, 0xf2efe6, 0xb85ac0], seed));
}

// ---------- Sol et mobilier ----------

/**
 * Dallage d'un rectangle : des dalles plates (deux triangles chacune) de deux teintes, séparées par un joint où le sol du
 * jeu se voit ; jamais une dalle pleine
 */
function tiles(p: Parts, x0: number, z0: number, x1: number, z1: number, cell: number, c1: number, c2: number, y = 0.014) {
  const nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell)), dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const h = Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
    p.add(new THREE.PlaneGeometry(dx - 0.012, dz - 0.012).rotateX(-PI / 2), x0 + dx * (i + 0.5), y + h * 0.002, z0 + dz * (j + 0.5), h < 0.5 ? c1 : c2);
  }
}
/** Lampadaire selon le peuple et l'âge, allumé la nuit */
function lamp(p: Parts, people: People, age: number, x: number, z: number, h = 0.36) {
  const c = pal(people, age);
  if (age >= 5) { p.cyl(0.012, 0.016, h * 0.7, 6, x, 0, z, c.trim); p.add(new THREE.TorusGeometry(0.03, 0.006, 3, 10).rotateX(PI / 2), x, h * 0.7, z, c.neon, 0, 'neon'); p.sphere(0.014, x, h * 0.72, z, 0xffffff); return; }
  if (age === 4) { p.cyl(0.006, 0.008, h, 5, x, 0, z, c.metal); p.box(0.07, 0.012, 0.03, x + 0.03, h, z, c.metal); p.box(0.05, 0.006, 0.02, x + 0.04, h - 0.004, z, 0xfff0c0, 0, true); return; }
  p.cyl(0.006, 0.012, h + 0.03, 5, x, 0, z, c.metal);
  if (people === 'asie') { p.box(0.05, 0.006, 0.006, x + 0.02, h + 0.01, z, c.metal); lantern(p, x + 0.04, h - 0.03, z, 0.024); return; }
  p.cyl(0.018, 0.014, 0.045, 6, x, h + 0.02, z, 0xffe2a0, true);
  p.cone(0.026, 0.03, 6, x, h + 0.065, z, age <= 2 ? O.darkwood : O.gold);
}
/** Torche sur sa hampe (Médiéval) */
function torch(p: Parts, x: number, z: number, h = 0.26) {
  p.cyl(0.006, 0.008, h, 4, x, 0, z, O.darkwood);
  p.cyl(0.014, 0.01, 0.03, 5, x, h, z, 0x3a3a3e);
  p.cone(0.014, 0.04, 5, x, h + 0.03, z, 0xffa040, true);
}
/** Caisse (et sa sangle) */
function crate(p: Parts, x: number, z: number, s: number, col: number, y = 0, ry = 0, mark?: number) {
  p.box(s, s * 0.8, s, x, y, z, col, ry);
  p.box(s + 0.004, s * 0.12, s + 0.004, x, y + s * 0.34, z, dark(col, 0.7), ry);
  if (mark !== undefined) { const f = new Face(p, ry, x + Math.sin(ry) * (s / 2 + 0.003), z + Math.cos(ry) * (s / 2 + 0.003)); f.plane(s * 0.5, s * 0.16, 0, y + s * 0.4, 0, mark); f.plane(s * 0.16, s * 0.5, 0, y + s * 0.4, 0.001, mark); }
}
/** Tonneau cerclé */
function barrel(p: Parts, x: number, z: number, col = 0x8a5a3a, y = 0) {
  p.cyl(0.032, 0.028, 0.08, 7, x, y, z, col);
  p.add(new THREE.CylinderGeometry(0.034, 0.034, 0.008, 7, 1, true), x, y + 0.02, z, 0x3a3a3e);
  p.add(new THREE.CylinderGeometry(0.034, 0.034, 0.008, 7, 1, true), x, y + 0.062, z, 0x3a3a3e);
}
/** Sac de toile */
function sack(p: Parts, x: number, z: number, col = 0xd8c8a0, y = 0, ry = 0) {
  p.add(new THREE.IcosahedronGeometry(0.035, 0).scale(1.2, 0.8, 0.9), x, y + 0.028, z, col, ry);
}
/** Ballot de marchandises ficelé */
function bale(p: Parts, x: number, z: number, col: number, y = 0, ry = 0) {
  p.box(0.11, 0.07, 0.08, x, y, z, col, ry);
  p.box(0.008, 0.074, 0.084, x, y, z, 0x6a5038, ry);
}
/** Banc */
function bench(p: Parts, x: number, z: number, ry: number, col: number) {
  p.box(0.16, 0.014, 0.05, x, 0.045, z, col, ry);
  p.box(0.16, 0.04, 0.01, x - Math.sin(ry) * 0.024, 0.06, z - Math.cos(ry) * 0.024, col, ry);
  for (const u of [-0.06, 0.06]) p.box(0.012, 0.045, 0.04, x + u * Math.cos(ry), 0, z - u * Math.sin(ry), 0x4a4a50, ry);
}
/** Croix rouge sur fond blanc, sur une face (enseigne) */
function crossSign(f: Face, u: number, y: number, s: number, n = 0.004, lit = false) {
  f.plane(s, s, u, y, n, 0xf8f6f0, lit);
  f.plane(s * 0.7, s * 0.22, u, y, n + 0.003, RED_CROSS);
  f.plane(s * 0.22, s * 0.7, u, y, n + 0.004, RED_CROSS);
}
/** Brancard (et son malade couché, sa couverture) */
function stretcher(p: Parts, x: number, z: number, ry: number, y = 0.06, blanket = 0x6a8ac8) {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const u of [-0.03, 0.03]) p.box(0.006, 0.006, 0.3, x + u * c, y, z - u * s, 0x7a5a40, ry);
  p.box(0.06, 0.004, 0.22, x, y + 0.004, z, 0xe8e2d4, ry);
  p.box(0.05, 0.022, 0.15, x, y + 0.008, z + 0.02 * c, blanket, ry);
  p.box(0.03, 0.026, 0.03, x - 0.07 * s, y + 0.008, z - 0.07 * c, 0xe8b894, ry);
  if (y > 0.03) for (const u of [-0.03, 0.03]) for (const w of [-0.1, 0.1]) p.box(0.008, y, 0.008, x + u * c + w * s, 0, z - u * s + w * c, 0x5a5a60, ry);
}

// ---------- Toits, ailes ----------

/** Toit à deux pans de nos bâtiments, faîtage le long de x : pignons au mur, deux versants qui débordent, rangs, faîtage */
function gableRoof(p: Parts, x: number, y: number, z: number, w: number, d: number, h: number, roof: number, wall: number) {
  p.gable(w, h, d, x, y, z, wall);
  const a = Math.atan2(h, d / 2), L = Math.hypot(h, d / 2) + 0.05;
  for (const s of [-1, 1]) {
    p.add(new THREE.BoxGeometry(w + 0.08, 0.02, L).rotateX(s * a), x, y + h / 2 - 0.004, z + s * d / 4, roof);
    for (const t of [0.3, 0.62]) p.add(new THREE.BoxGeometry(w + 0.08, 0.008, 0.014).rotateX(s * a), x, y + h * t + 0.012, z + s * (d / 2) * (1 - t), dark(roof, 0.84));
  }
  p.box(w + 0.09, 0.024, 0.03, x, y + h - 0.006, z, dark(roof, 0.74));
}

/** Positions de `n` baies régulières sur `len`, sans celles qui tombent sur la porte */
function spread(len: number, n: number, skip?: number, gap = 0.12) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const u = -len / 2 + (len / n) * (i + 0.5); if (skip === undefined || Math.abs(u - skip) > gap) out.push(u); }
  return out;
}

/** Fenêtres d'une face au style de l'allié : arc brisé, croisée de papier, ou baie vitrée moderne ; allumées la nuit */
function allyWindows(f: Face, us: number[], y: number, ww: number, wh: number, people: People, age: number, sill = true) {
  const c = pal(people, age);
  for (const u of us) {
    if (age >= 4) {
      f.plane(ww + 0.024, wh + 0.024, u, y + wh / 2, 0.004, c.trim);
      f.plane(ww, wh, u, y + wh / 2, 0.008, c.glass, true);
      f.plane(0.008, wh, u, y + wh / 2, 0.011, age >= 5 ? c.trim : c.metal);
    } else if (people === 'orient') {
      bay(f, u, y, ww, wh, 'pointed', c.glass, { frame: c.trim, glow: true, seg: 4 });
      if (sill) f.box(ww + 0.03, 0.012, 0.02, u, y - 0.012, 0.01, c.trim); else f.plane(ww + 0.03, 0.014, u, y - 0.006, 0.008, c.trim);
      if (age === 2) f.plane(0.006, wh * 0.7, u, y + wh * 0.38, 0.012, O.darkwood);
    } else {
      f.plane(ww + 0.03, wh + 0.03, u, y + wh / 2, 0.004, A.redDark);
      f.plane(ww, wh, u, y + wh / 2, 0.008, A.paper, true);
      f.plane(ww, 0.007, u, y + wh * 0.5, 0.011, A.redDark);
      f.plane(0.007, wh, u, y + wh / 2, 0.011, A.redDark);
    }
  }
}

/** Options d'une aile : étages, hauteur d'étage, porte (position le long de la façade), fenêtres par étage devant et sur les côtés */
interface WingO { floors?: number; fh?: number; door?: number; win?: number; side?: number; roof?: boolean; mash?: boolean; band?: boolean; back?: boolean }

/**
 * Une aile au style de l'allié, w × d, centrée en (x, z), façade vers +z : socle, murs, bandeaux d'étage, fenêtres allumées,
 * porte ; chez les Orientaux corniche et merlons (Médiéval, Industriel), frise de faïence, moucharabieh, puis garde-corps
 * et liseré de lumière ; chez les Asiatiques colonnes laquées, poutre peinte et toit courbe (sans toit : `roof` faux).
 * Rend le haut des murs
 */
function allyWing(p: Parts, people: People, age: number, x: number, z: number, w: number, d: number, o: WingO = {}): number {
  const c = pal(people, age), or = people === 'orient', fl = o.floors ?? 1, fh = o.fh ?? 0.3, h = fl * fh + 0.04;
  p.box(w, h, d, x, 0, z, c.wall);
  p.box(w + 0.025, 0.05, d + 0.025, x, 0, z, age >= 4 ? c.trim : dark(c.trim, 0.9));
  const F = new Face(p, 0, x, z + d / 2), L = new Face(p, -PI / 2, x - w / 2, z), R = new Face(p, PI / 2, x + w / 2, z), B = new Face(p, PI, x, z - d / 2);
  const nw = o.win ?? Math.max(2, Math.round(w / 0.24)), ns = o.side ?? Math.max(1, Math.round(d / 0.3));
  const ww = age >= 4 ? 0.12 : 0.08, wh = Math.min(fh * 0.55, 0.17);
  for (let f = 0; f < fl; f++) {
    const y = 0.07 + f * fh;
    allyWindows(F, spread(w - 0.12, nw, f === 0 ? o.door : undefined, 0.13), y, ww, wh, people, age);
    for (const S of [L, R]) allyWindows(S, spread(d - 0.12, ns), y, ww, wh, people, age, false);
    if (o.back) allyWindows(B, spread(w - 0.12, Math.max(1, nw - 1)), y, ww, wh, people, age, false);
    if (f > 0) for (const [S, len] of [[F, w], [L, d], [R, d]] as const) S.plane(len, 0.022, 0, y - 0.035, 0.003, or ? c.trim : age <= 3 ? A.beam : c.trim);
  }
  // la porte
  if (o.door !== undefined) {
    const u = o.door;
    if (age >= 4) { F.plane(0.2, 0.22, u, 0.13, 0.004, c.trim); F.plane(0.16, 0.2, u, 0.12, 0.008, c.glass, true); F.plane(0.006, 0.2, u, 0.12, 0.011, c.metal); F.box(0.3, 0.02, 0.14, u, 0.24, 0.07, c.trim); }
    else if (or) door(F, u, 0.12, 0.2, 'pointed', c.trim, O.darkwood, { step: c.trim });
    else { F.plane(0.17, 0.22, u, 0.13, 0.004, A.redDark); F.plane(0.13, 0.19, u, 0.115, 0.008, A.red); F.plane(0.006, 0.19, u, 0.115, 0.011, A.redDark); F.box(0.2, 0.025, 0.06, u, 0, 0.03, A.stone); }
  }
  if (or) {
    // corniche, faïence, merlons, puis garde-corps et liseré
    p.box(w + 0.04, 0.03, d + 0.04, x, h, z, c.trim);
    if (age >= 3 && o.band !== false) mosaic(F, 0, w - 0.06, h - 0.045, 0.045, age >= 4 ? [c.accent, O.white, O.gold] : [O.turq, O.white, O.cobalt]);
    if (age <= 3) { merlons(F, w, h + 0.03, c.wall, age === 2 ? 'step' : 'round', 0.3, 0.07, 0.03); for (const S of [L, R]) merlons(S, d, h + 0.03, c.wall, 'tooth', 0.3, 0.05, 0.03); }
    else {
      for (const [S, len] of [[F, w], [L, d], [R, d], [B, w]] as const) S.box(len + 0.04, 0.05, 0.02, 0, h + 0.03, -0.01, c.wall);
      if (age >= 5) p.box(w + 0.05, 0.012, d + 0.05, x, h + 0.08, z, c.neon, 0, 'neon');
    }
    if (o.mash && age === 3 && fl >= 2) mashrabiya(F, (o.door ?? 0) + 0.001, 0.07 + fh + 0.02, 0.16, 0.16);
    return h + 0.03;
  }
  // chez les Asiatiques : poutre peinte et filet d'or, colonnes laquées devant, toit courbe
  p.box(w + 0.03, 0.05, d + 0.03, x, h - 0.05, z, age <= 3 ? A.beam : age === 4 ? c.accent : c.trim);
  p.box(w + 0.035, 0.01, d + 0.035, x, h - 0.03, z, A.gold);
  if (age <= 3) for (const u of spread(w, Math.max(2, Math.round(w / 0.32)) + 1).map((v, i, a) => (i === 0 ? -w / 2 : i === a.length - 1 ? w / 2 : v)))
    p.add(new THREE.CylinderGeometry(0.02, 0.023, h - 0.05, 6, 1, true).translate(0, (h - 0.05) / 2, 0), x + u, 0.05, z + d / 2 + 0.03, A.red);
  if (o.roof === false) { p.box(w + 0.02, 0.03, d + 0.02, x, h, z, c.trim); return h + 0.03; }
  const rh = age === 4 ? 0.12 : Math.min(0.34, d * 0.45);
  hipRoof(p, w + 0.2, d + 0.2, rh, x, h, z, c.roof, 0, { lod: true, rows: age === 4 ? 0 : 1, step: 0.12, hips: age !== 4, ...(age >= 5 ? { glow: 'neon' as Glow, edge: c.neon, t: 0.02 } : {}) });
  return h + rh;
}

/**
 * Une aile à notre style, w × d, centrée en (x, z), façade vers +z : enduit clair et colombages sous un toit de tuiles
 * (Médiéval), brique et cordons sous l'ardoise (Industriel), béton et bandeau vitré (Moderne), blanc, verre et toit vert
 * (Futuriste). Rend le haut des murs
 */
function ourWing(p: Parts, kit: ConcessionKit, age: number, x: number, z: number, w: number, d: number, o: WingO = {}): number {
  const c = ours(age), fl = o.floors ?? 1, fh = o.fh ?? 0.28, h = fl * fh + 0.04;
  p.box(w, h, d, x, 0, z, c.wall);
  p.box(w + 0.02, 0.05, d + 0.02, x, 0, z, age >= 4 ? c.trim : 0x9d9890);
  const F = new Face(p, 0, x, z + d / 2), sides = [new Face(p, -PI / 2, x - w / 2, z), new Face(p, PI / 2, x + w / 2, z)];
  const nw = o.win ?? Math.max(2, Math.round(w / 0.22)), ns = o.side ?? Math.max(1, Math.round(d / 0.3));
  if (age <= 3) {
    for (let f = 0; f < fl; f++) {
      const y = 0.08 + f * fh, wh = Math.min(0.14, fh * 0.5);
      for (const [S, us] of [[F, spread(w - 0.1, nw, f === 0 ? o.door : undefined)], ...sides.map((S) => [S, spread(d - 0.1, ns)] as const)] as const) for (const u of us) {
        S.plane(0.08, wh, u, y + wh / 2, 0.006, c.win, true);
        S.plane(0.006, wh, u, y + wh / 2, 0.009, c.trim);
        if (age === 2) for (const sh of [-1, 1]) S.plane(0.03, wh, u + sh * 0.056, y + wh / 2, 0.006, 0x3a6a5a);
        else S.plane(0.1, 0.02, u, y + wh + 0.01, 0.007, c.trim);
        if (S === F) S.box(0.1, 0.012, 0.022, u, y - 0.012, 0.011, c.trim); else S.plane(0.1, 0.014, u, y - 0.006, 0.008, c.trim);
      }
      if (f > 0) F.plane(w, 0.02, 0, y - 0.03, 0.004, age === 2 ? c.accent : c.trim);
    }
    if (age === 2) for (let i = 0; i <= 4; i++) F.plane(0.018, h - 0.06, -w / 2 + 0.01 + ((w - 0.02) * i) / 4, h / 2 + 0.03, 0.005, c.accent);
    gableRoof(p, x, h, z, w + 0.04, d + 0.06, Math.min(0.26, d * 0.5), c.roof, c.wall);
    if (age === 3) { const cx = x + w * 0.3; p.box(0.06, 0.24, 0.06, cx, h, z - d * 0.2, c.accent); p.box(0.075, 0.02, 0.075, cx, h + 0.24, z - d * 0.2, c.trim); kit.smoke(cx, h + 0.28, z - d * 0.2, 0); }
  } else {
    // bandeaux vitrés recoupés de meneaux, joint creux sous le toit plat, couvertine
    for (let f = 0; f < fl; f++) {
      const y = 0.1 + f * fh;
      p.box(w + 0.01, fh * 0.48, d + 0.01, x, y, z, c.win, 0, true);
      for (const u of spread(w, Math.max(3, Math.round(w / 0.14)))) F.plane(0.012, fh * 0.48, u, y + fh * 0.24, 0.008, c.trim);
    }
    p.box(w + 0.03, 0.035, d + 0.03, x, h, z, c.trim);
    p.box(w * 0.18, h - 0.06, 0.012, x - w / 2 + w * 0.12, 0.05, z + d / 2 + 0.002, c.accent);
    if (age >= 5) { p.box(w - 0.04, 0.03, d - 0.04, x, h + 0.035, z, c.roof); p.box(w + 0.035, 0.012, d + 0.035, x, h + 0.01, z, c.neon, 0, 'neon'); }
  }
  if (o.door !== undefined) {
    const u = o.door;
    F.plane(0.16, 0.22, u, 0.13, 0.004, c.trim);
    F.plane(0.12, 0.2, u, 0.12, 0.008, age >= 4 ? c.win : c.door, age >= 4);
    F.box(0.22, 0.016, 0.1, u, 0.24, 0.05, age >= 4 ? c.trim : c.accent);
    F.box(0.2, 0.02, 0.06, u, 0, 0.03, 0xcfcac2);
  }
  return h;
}

/** Coupole sur son tambour (Orientaux), turquoise, puis blanche ou dorée, puis de verre ; rend le sommet */
function drumDome(p: Parts, age: number, x: number, y: number, z: number, r: number) {
  const c = pal('orient', age);
  p.cyl(r * 1.05, r * 1.08, r * 0.5, 8, x, y, z, c.wall);
  for (let k = 0; k < 4; k++) { const a = (k * PI) / 2 + PI / 4; p.box(0.04, r * 0.3, 0.004, x + Math.sin(a) * r * 1.06, y + r * 0.1, z + Math.cos(a) * r * 1.06, c.glass, a, true); }
  const col = age <= 3 ? O.turq : age === 4 ? O.gold : O.glass;
  dome(p, r, r * 0.95, x, y + r * 0.5, z, col, 'persian', 8, age >= 5, age === 3 ? O.turqD : undefined);
  if (age >= 5) p.add(new THREE.TorusGeometry(r * 1.06, 0.01, 3, 12).rotateX(PI / 2), x, y + r * 0.5, z, c.neon, 0, 'neon');
  finial(p, x, y + r * 1.45, z, r * 2);
  return y + r * 1.45;
}

// =====================================================================================================================
// La caserne alliée (2 × 2, Médiéval au Futuriste)
// =====================================================================================================================

/**
 * La caserne alliée : le quartier des soldats au fond (deux étages dès l'Industriel), la tour de guet, la cour d'exercice
 * où deux rangs de soldats alliés présentent l'arme devant leur officier et notre officier de liaison, le râtelier, les cibles
 * de paille (puis le camion, puis le drone), le mur d'enceinte et sa porte gardée sous nos deux drapeaux
 */
export function allyBarracks(p: Parts, age: number, people: People, kit: ConcessionKit) {
  const a = Math.min(5, Math.max(2, age)), c = pal(people, a), or = people === 'orient';
  // le quartier, au fond, et sa tour de guet
  const top = allyWing(p, people, a, 0.18, -0.6, 1.3, 0.56, { floors: a >= 3 ? 2 : 1, door: 0, mash: true, back: false }), wallT = (a >= 3 ? 2 : 1) * 0.3 + 0.04;
  const F = new Face(p, 0, 0.18, -0.32);
  if (or) { F.plane(0.4, 0.06, 0, top - 0.11, 0.008, c.accent); for (let i = 0; i < 5; i++) F.plane(0.04, 0.03, -0.16 + i * 0.08, top - 0.11, 0.012, O.gold); }
  else { F.plane(0.3, 0.07, 0, (a >= 3 ? 0.68 : 0.36) - 0.02, 0.012, A.redDark); for (let i = 0; i < 3; i++) F.plane(0.05, 0.045, -0.08 + i * 0.08, (a >= 3 ? 0.68 : 0.36) - 0.02, 0.016, A.gold); }
  const tx = -0.72, tz = -0.68, th = a >= 4 ? 1.05 : 0.95;
  if (a <= 3) {
    if (or) {
      p.cyl(0.15, 0.17, th, 8, tx, 0, tz, c.wall);
      for (const y of [0.3, 0.6]) { p.cyl(0.155, 0.155, 0.02, 8, tx, y + 0.18, tz, c.trim); p.box(0.03, 0.09, 0.004, tx, y, tz + 0.165, 0x3b3029); }
      p.cyl(0.19, 0.19, 0.04, 8, tx, th, tz, c.trim);
      for (let k = 0; k < 8; k++) { const an = (k / 8) * PI * 2; p.box(0.05, 0.06, 0.03, tx + Math.sin(an) * 0.17, th + 0.04, tz + Math.cos(an) * 0.17, c.wall, an); }
      drumDome(p, a, tx, th + 0.04, tz, 0.11);
    } else {
      p.box(0.3, th * 0.66, 0.3, tx, 0, tz, c.brick);
      for (let k = 0; k < 4; k++) p.box(0.32, 0.015, 0.32, tx, 0.1 + k * 0.15, tz, dark(c.brick, 0.85));
      p.box(0.34, 0.03, 0.34, tx, th * 0.66, tz, A.darkwood);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(0.012, 0.012, 0.2, 5, tx + sx * 0.15, th * 0.66 + 0.03, tz + sz * 0.15, A.red);
      rail(p, 0.3, tx, th * 0.66 + 0.03, tz + 0.15, 0, A.red, 0.05, 0.1);
      hipRoof(p, 0.46, 0.46, 0.2, tx, th * 0.66 + 0.23, tz, c.roof, 0, { lod: true, rows: 0 });
      lantern(p, tx + 0.18, th * 0.66 + 0.12, tz + 0.18, 0.025);
    }
    who(p, kit, tx, tz + (or ? 0.13 : 0.05), troop(people, a).coat, 0.4, { up: or ? th + 0.04 : th * 0.66 + 0.03 });
  } else {
    // la tour des transmissions : fût de béton, vigie vitrée, antenne et feu
    p.box(0.22, th, 0.22, tx, 0, tz, c.wall);
    for (let k = 0; k < 3; k++) p.box(0.226, 0.06, 0.226, tx, 0.2 + k * 0.25, tz, c.glass, 0, true);
    p.box(0.32, 0.16, 0.32, tx, th, tz, c.glass, 0, true);
    p.box(0.34, 0.03, 0.34, tx, th + 0.16, tz, c.trim);
    if (or) dome(p, 0.12, 0.1, tx, th + 0.19, tz, a >= 5 ? O.glass : O.gold, 'persian', 8, a >= 5);
    else hipRoof(p, 0.36, 0.36, 0.1, tx, th + 0.19, tz, c.roof, 0, { lod: true, rows: 0, hips: false, ...(a >= 5 ? { glow: 'neon' as Glow, edge: c.neon, t: 0.02 } : {}) });
    p.cyl(0.006, 0.01, 0.45, 4, tx + 0.1, th + 0.19, tz - 0.1, c.metal);
    p.sphere(0.014, tx + 0.1, th + 0.64, tz - 0.1, 0xff3a2a);
    p.box(0.02, 0.02, 0.02, tx + 0.1, th + 0.63, tz - 0.1, 0xff3a2a, 0, true);
    if (a >= 5) p.add(new THREE.TorusGeometry(0.17, 0.008, 3, 12).rotateX(PI / 2), tx, th + 0.08, tz, c.neon, 0, 'neon');
  }
  // la cour d'exercice : dallage ou sable battu, deux rangs de trois soldats, l'officier et notre officier de liaison
  tiles(p, -0.7, -0.2, 0.62, 0.72, 0.22, c.ground, c.ground2);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) soldier(p, kit, people, a, -0.38 + i * 0.26, 0.28 + r * 0.24, PI, i * 0.3 + r * 0.9);
  who(p, kit, -0.12, -0.05, troop(people, a).coat, 0.15, { pose: 'cheer' });
  who(p, kit, 0.12, -0.08, TEAM_A, -0.3);
  // le râtelier d'armes et les cibles (puis le camion, puis le drone), les tonneaux et les sacs
  const rx = 0.82;
  p.box(0.04, 0.12, 0.3, rx, 0, -0.08, c.wood); p.box(0.05, 0.015, 0.32, rx, 0.14, -0.08, dark(c.wood, 0.8));
  for (let i = 0; i < 5; i++) p.add(new THREE.CylinderGeometry(0.004, 0.004, a <= 2 ? 0.34 : 0.2, 4).translate(0, a <= 2 ? 0.17 : 0.1, 0), rx - 0.02, 0.01, -0.2 + i * 0.06, a <= 2 ? 0x6b4a30 : 0x3a3a3e, 0, false, 0.12);
  if (a <= 3) {
    for (const [z, k] of [[0.25, 0], [0.55, 1]] as const) {
      p.box(0.02, 0.18, 0.02, 0.84, 0, z, c.wood);
      p.add(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10).rotateZ(PI / 2), 0.82, 0.18, z, 0xd8c080);
      for (const [r, col] of [[0.055, 0xf4efe4], [0.035, RED_CROSS], [0.015, 0xf4efe4]] as const) p.add(new THREE.CircleGeometry(r, 10).rotateY(-PI / 2), 0.799, 0.18, z, col);
      p.add(new THREE.CylinderGeometry(0.003, 0.003, 0.06, 3).rotateZ(PI / 2 - 0.2 * k), 0.78, 0.19 + k * 0.02, z + 0.01, 0x6b4a30);
    }
    for (let i = 0; i < 3; i++) barrel(p, 0.52 + i * 0.075, -0.24, i % 2 ? 0x8a5a3a : 0x7a4a2e);
    sack(p, 0.62, -0.17); sack(p, 0.7, -0.17, 0xc8b890);
    if (a === 2) {
      // la tente du corps de garde
      p.add(new THREE.ConeGeometry(0.16, 0.24, 4).rotateY(PI / 4), 0.78, 0.12, 0.76, or ? 0xe9e1cf : 0xd8c8a0);
      p.box(0.04, 0.08, 0.004, 0.78, 0, 0.88, 0x5a4a3a);
      p.cyl(0.004, 0.004, 0.1, 4, 0.78, 0.24, 0.76, O.darkwood);
      kit.sway([0.78, 0.33, 0.76], [0, 1, 0], 0.4, 1).box(0.07, 0.04, 0.003, 0.035, -0.04, 0, c.flag);
    }
  } else if (a === 4) {
    // le camion bâché de l'armée alliée
    const g = new Fr(p, 0.62, 0.45, -PI / 2);
    g.box(0.18, 0.13, 0.17, 0, 0.04, 0.2, troop(people, a).coat);
    g.box(0.172, 0.06, 0.004, 0, 0.11, 0.287, 0x2a3a4a, true);
    g.box(0.2, 0.17, 0.4, 0, 0.04, -0.12, dark(troop(people, a).coat, 0.85));
    g.box(0.206, 0.012, 0.41, 0, 0.13, -0.12, dark(troop(people, a).coat, 0.7));
    for (const sx of [-1, 1]) for (const sz of [0.2, -0.05, -0.25]) g.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8).rotateZ(PI / 2), sx * 0.1, 0.04, sz, 0x222226);
    g.box(0.04, 0.02, 0.004, 0.05, 0.08, 0.29, 0xfff0c0, true); g.box(0.04, 0.02, 0.004, -0.05, 0.08, 0.29, 0xfff0c0, true);
    for (let i = 0; i < 3; i++) crate(p, 0.48 + i * 0.1, -0.22, 0.08, 0x6a7a4a, 0, 0, 0xe8e0c8);
  } else {
    // le drone de surveillance au-dessus de son aire, ses quatre hélices qui tournent
    p.cyl(0.14, 0.14, 0.012, 10, 0.75, 0, 0.45, c.trim);
    p.add(new THREE.TorusGeometry(0.11, 0.006, 3, 12).rotateX(PI / 2), 0.75, 0.014, 0.45, c.neon, 0, 'neon');
    const dy = 0.42;
    p.box(0.08, 0.03, 0.08, 0.75, dy, 0.45, 0x2a2a30);
    p.box(0.02, 0.02, 0.02, 0.75, dy - 0.02, 0.49, c.neon, 0, 'neon');
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      p.box(0.07, 0.008, 0.008, 0.75 + sx * 0.035, dy + 0.02, 0.45 + sz * 0.035, 0x2a2a30, sx * sz * PI / 4);
      kit.turn([0.75 + sx * 0.06, dy + 0.03, 0.45 + sz * 0.06], [0, 1, 0], 3).box(0.07, 0.003, 0.012, 0, 0, 0, 0xc8ccd0);
    }
    for (let i = 0; i < 2; i++) crate(p, 0.52 + i * 0.12, -0.22, 0.09, 0xd8dce0, 0, 0, c.neon);
  }
  // le mur d'enceinte et sa porte gardée, nos deux drapeaux
  const wy = a <= 3 ? 0.16 : 0.1, wc = a <= 3 ? c.wall : c.trim;
  for (const s of [-1, 1]) {
    const x0 = s * 0.24, x1 = s * 0.94, len = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
    p.box(len, wy, 0.05, cx, 0, 0.92, wc);
    if (a <= 3) { if (or) merlons(new Face(p, 0, cx, 0.945), len, wy, wc, 'step', 0.2, 0.05, 0.05); else { p.box(len + 0.02, 0.02, 0.08, cx, wy, 0.92, dark(c.roof, 0.8)); p.box(len, 0.03, 0.03, cx, wy + 0.02, 0.92, c.roof); } }
    else { p.box(len, 0.012, 0.055, cx, wy, 0.92, a >= 5 ? c.neon : c.accent, 0, a >= 5 ? 'neon' : false); for (let k = 0; k < 4; k++) p.box(0.006, 0.12, 0.006, cx - len / 2 + 0.06 + k * (len - 0.12) / 3, wy, 0.92, c.metal); }
    p.box(0.08, wy + 0.1, 0.08, s * 0.24, 0, 0.92, c.trim);
    if (a <= 2) torch(p, s * 0.24, 0.98, 0.22); else lamp(p, people, a, s * 0.24, 0.98, 0.22);
    soldier(p, kit, people, a, s * 0.14, 0.86, 0, 2 + s);
  }
  twoFlags(p, kit, people, -0.45, 0.82, 0.62, 0.16, a <= 2 ? c.wood : c.metal);
  // les arbres, les massifs au pied des murs, les fanions sur le quartier
  tree(p, people, -0.8, 0.6, 0.62, 1); tree(p, people, -0.84, -0.22, 0.55, 3);
  if (a >= 3) tree(p, people, 0.86, 0.8, 0.5, 2); else tree(p, people, -0.82, 0.18, 0.5, 2);
  for (const x of [-0.3, 0.3]) shrub(p, x, -0.27, 0.045, Math.round(x * 10));
  // (seconde passe) les bannières de l'allié pendues à la façade, le tambour de l'exercice (puis le clairon sur son pied)
  for (const u of [-0.355, 0.355]) { F.plane(0.07, 0.2, u, wallT - 0.16, 0.012, c.flag); F.plane(0.08, 0.016, u, wallT - 0.06, 0.016, O.gold); F.plane(0.03, 0.03, u, wallT - 0.16, 0.016, or ? 0xf8f6f0 : 0x2f7a5a, false, PI / 4); }
  if (a <= 3) {
    p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8).rotateZ(PI / 2), -0.3, 0.1, -0.08, or ? O.gold : A.red);
    for (const s of [-1, 1]) p.box(0.006, 0.1, 0.006, -0.3 + s * 0.02, 0, -0.08, c.wood);
  } else { p.box(0.006, 0.14, 0.006, -0.3, 0, -0.08, c.metal); p.box(0.06, 0.04, 0.03, -0.3, 0.14, -0.08, 0x3a3a3e); }
  // (sur la terrasse, ou au faîtage du toit courbe)
  for (const [x, i] of [[-0.12, 0], [0.48, 1]] as const) { const top2 = mast(p, x, -0.6, 0.16, c.metal, or ? top : top - 0.01); kit.sway([x, top2, -0.6], [0, 1, 0], 0.4, 1.1 + i * 0.1).box(0.08, 0.05, 0.003, 0.04, -0.05, 0, i ? TEAM_FLAG : c.flag); }
  // la cheminée des cuisines : sur la terrasse, ou traversant le toit courbe près du faîtage
  if (a <= 3) {
    const cy = or ? top - 0.02 : wallT, ch = or ? 0.12 : top - wallT + 0.04;
    p.box(0.05, ch, 0.05, 0.66, cy, -0.62, dark(c.wall, 0.85)); p.box(0.06, 0.016, 0.06, 0.66, cy + ch, -0.62, c.trim);
    kit.smoke(0.66, cy + ch + 0.03, -0.62, 0);
  }
}

// =====================================================================================================================
// Le chantier naval allié (2 × 2, Médiéval au Futuriste)
// =====================================================================================================================

/** Coque vue de dessus (étrave pointue vers -z, poupe carrée vers +z) extrudée sur la hauteur h ; jonque : étrave carrée */
function hullGeo(len: number, w: number, h: number, sq: boolean) {
  const V = (x: number, y: number) => new THREE.Vector2(x, y);
  const pts = sq ? [V(-w / 2, -len / 2), V(w / 2, -len / 2), V(w / 2, len / 2 - w * 0.2), V(w * 0.32, len / 2), V(-w * 0.32, len / 2), V(-w / 2, len / 2 - w * 0.2)]
    : [V(-w / 2, -len / 2), V(w / 2, -len / 2), V(w / 2, len * 0.15), V(w * 0.22, len * 0.42), V(0, len / 2), V(-w * 0.22, len * 0.42), V(-w / 2, len * 0.15)];
  return new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h, bevelEnabled: false }).rotateX(-PI / 2);
}

/**
 * Le chantier naval allié : la cale de lancement qui descend vers +z, le navire de guerre allié en construction sur son
 * ber (couples à nu puis bordés, galère ou jonque de guerre, cuirassé à éperon et cheminée, destroyer gris et ses tourelles,
 * frégate blanche à liseré lumineux), les échafaudages, la chèvre de bois puis la grue à vapeur, le portique, le bras
 * robot ; l'atelier au style de l'allié, les piles de bois ou de tôles, les charpentiers, nos deux drapeaux
 */
export function allyShipyard(p: Parts, age: number, people: People, kit: ConcessionKit) {
  const a = Math.min(5, Math.max(2, age)), c = pal(people, a), or = people === 'orient', t = troop(people, a);
  // la cale : longrines, traverses, coulisses graissées
  const sx = -0.28, L = 1.34, W = 0.38;
  for (const s of [-1, 1]) p.box(0.06, 0.05, 1.82, sx + s * 0.16, 0, -0.05, a <= 2 ? c.wood : a === 3 ? 0x6a6660 : c.trim);
  for (let i = 0; i < 9; i++) p.box(0.5, 0.03, 0.05, sx, 0, -0.9 + i * 0.22, a <= 3 ? dark(c.wood, 0.85) : c.metal);
  // le ber et ses tins
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) p.box(0.06, 0.06, 0.06, sx + s * 0.1, 0.05, -0.55 + i * 0.32, dark(c.wood, 0.8));
  const hy = 0.11, hz = -0.12;
  // la quille, l'étrave
  p.box(0.05, 0.05, L, sx, hy - 0.04, hz, a <= 2 ? O.darkwood : 0x3a3a3e);
  if (a === 2) {
    // galère (Orientaux) ou jonque de guerre (Asiatiques) : coque bordée à moitié, couples à nu au-dessus
    p.add(hullGeo(L, W, 0.09, !or), sx, hy, hz, c.wood);
    for (let i = 0; i < 4; i++) p.add(hullGeo(L - 0.02, W + 0.006, 0.008, !or), sx, hy + 0.02 + i * 0.02, hz, dark(c.wood, 0.8));
    for (let i = 0; i < 9; i++) {
      const z = hz - L / 2 + 0.12 + i * 0.13, wk = z < hz + L * 0.15 ? W / 2 : (W / 2) * Math.max(0.2, 1 - (z - (hz + L * 0.15)) / (L * 0.35));
      p.add(new THREE.TorusGeometry(wk, 0.009, 3, 6, PI).rotateZ(PI), sx, hy + 0.22, z, 0xb08968);
    }
    p.box(0.012, 0.012, L * 0.9, sx, hy + 0.22, hz, 0xb08968);
    p.add(new THREE.BoxGeometry(0.03, 0.22, 0.03).rotateX(or ? -0.5 : 0), sx, hy + 0.06, hz + (or ? -L / 2 - 0.02 : -L / 2 + 0.02), O.darkwood);
    // le mât couché le long de la cale, les rames ou les voiles de natte
    p.add(new THREE.CylinderGeometry(0.014, 0.02, 0.9, 5).rotateX(PI / 2), 0.05, 0.02, 0.1, 0xb08968);
    if (or) for (let i = 0; i < 4; i++) p.add(new THREE.BoxGeometry(0.012, 0.012, 0.36), 0.12, 0.01 + i * 0.012, 0.3 + i * 0.03, 0x9a7350, 0.15 * i);
    else for (let i = 0; i < 3; i++) p.add(new THREE.BoxGeometry(0.18, 0.008, 0.22), 0.14, 0.01 + i * 0.01, 0.42, i % 2 ? 0xa86a3a : 0x8a5a2e, 0.2 * i);
  } else if (a === 3) {
    // cuirassé : tôles noires rivetées à moitié posées, couples de fer à l'avant, éperon, cheminée et tourelle déjà là
    p.add(hullGeo(L, W, 0.14, false), sx, hy, hz, 0x3a3e44);
    p.add(hullGeo(L + 0.004, W + 0.004, 0.03, false), sx, hy, hz, 0x8a3a2e);
    for (let i = 0; i < 3; i++) p.add(hullGeo(L + 0.002, W + 0.008, 0.004, false), sx, hy + 0.05 + i * 0.03, hz, 0x2a2c30);
    for (let i = 0; i < 4; i++) p.add(new THREE.TorusGeometry(W / 2 - i * 0.03, 0.008, 3, 6, PI).rotateZ(PI), sx, hy + 0.28, hz - L / 2 + 0.12 + i * 0.1, 0x5a5e66);
    p.box(W * 0.7, 0.02, L * 0.55, sx, hy + 0.14, hz + 0.15, 0x6a6058);
    p.box(0.16, 0.08, 0.2, sx, hy + 0.16, hz + 0.18, 0x4a4e54);
    p.cyl(0.04, 0.045, 0.22, 8, sx, hy + 0.24, hz + 0.12, 0x2a2a2e); p.cyl(0.047, 0.047, 0.03, 8, sx, hy + 0.4, hz + 0.12, c.flag);
    p.cyl(0.07, 0.07, 0.05, 8, sx, hy + 0.16, hz + 0.45, 0x4a4e54);
    p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 5).rotateX(PI / 2), sx, hy + 0.19, hz + 0.53, 0x2a2a2e);
    kit.smoke(sx, hy + 0.45, hz + 0.12, 2);
  } else if (a === 4) {
    // destroyer : coque grise complète, superstructure en cours, tourelles, mât treillis, échafaudage
    p.add(hullGeo(L, W, 0.16, false), sx, hy, hz, 0x8a9096);
    p.add(hullGeo(L + 0.004, W + 0.004, 0.04, false), sx, hy, hz, 0x7a2a26);
    p.add(hullGeo(L + 0.006, W + 0.006, 0.012, false), sx, hy + 0.13, hz, 0x6a7076);
    p.box(0.2, 0.12, 0.34, sx, hy + 0.16, hz + 0.12, 0x9aa0a6);
    p.box(0.16, 0.06, 0.12, sx, hy + 0.28, hz + 0.02, 0x9aa0a6); p.box(0.162, 0.025, 0.122, sx, hy + 0.3, hz + 0.02, 0x2a3a4a, 0, true);
    for (const dz of [-0.4, 0.45]) { p.cyl(0.06, 0.07, 0.05, 8, sx, hy + 0.16, hz + dz, 0x7a8086); p.add(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4).rotateX(PI / 2), sx, hy + 0.19, hz + dz + (dz < 0 ? -0.08 : 0.08), 0x4a4e54); }
    tubeW(p, [sx, hy + 0.34, hz + 0.02], [sx, hy + 0.62, hz + 0.04], 0.008, 0x6a7076, false, 4);
    p.box(0.1, 0.006, 0.006, sx, hy + 0.54, hz + 0.04, 0x6a7076);
    p.box(0.07, 0.04, 0.012, sx, hy + 0.62, hz + 0.04, 0xd8dce0);
    p.cyl(0.035, 0.04, 0.1, 8, sx, hy + 0.28, hz + 0.24, 0x7a8086);
  } else {
    // frégate blanche aux lignes lisses, liseré lumineux, passerelle de verre, bras robot qui la soude
    p.add(hullGeo(L, W, 0.17, false), sx, hy, hz, 0xeef0f2);
    p.add(hullGeo(L + 0.006, W + 0.006, 0.012, false), sx, hy + 0.1, hz, c.neon, 0, 'neon');
    p.add(hullGeo(L * 0.55, W * 0.7, 0.12, false).scale(1, 1, 1), sx, hy + 0.17, hz + 0.1, 0xdfe4e8);
    p.box(0.2, 0.03, 0.12, sx, hy + 0.26, hz - 0.02, c.glass, 0, true);
    p.cyl(0.03, 0.05, 0.16, 6, sx, hy + 0.29, hz + 0.1, 0xdfe4e8);
    p.sphere(0.04, sx, hy + 0.46, hz + 0.1, 0xf4f6f8);
    for (const [bx, bz, k] of [[0.02, -0.45, 0], [-0.58, 0.25, 1]] as const) {
      p.cyl(0.04, 0.05, 0.05, 8, bx, 0, bz, c.trim);
      tubeW(p, [bx, 0.05, bz], [bx, 0.3, bz], 0.018, 0xe8eaee, false, 6);
      const arm = kit.swing ? kit.swing([bx, 0.3, bz], [0, 1, 0], 0.4, 0.25 + k * 0.05) : kit.sway([bx, 0.3, bz], [0, 1, 0], 0.3, 0.3);
      const dir = k ? 1 : -1;
      tubeW(arm, [0, 0, 0], [dir * 0.16, 0.06, 0], 0.014, 0xe8eaee, false, 6);
      tubeW(arm, [dir * 0.16, 0.06, 0], [dir * 0.24, -0.04, 0], 0.011, 0xe8eaee, false, 6);
      arm.box(0.02, 0.02, 0.02, dir * 0.24, -0.06, 0, c.neon, 0, 'neon');
    }
  }
  // les échafaudages le long de la coque (sauf au Futuriste : un portique)
  if (a <= 4) for (const s of [-1, 1]) {
    const x = sx + s * 0.29;
    for (let i = 0; i < 4; i++) p.box(0.012, 0.36, 0.012, x, 0, hz - 0.5 + i * 0.33, a <= 2 ? 0x9a7350 : 0x6a6e74);
    for (const y of [0.16, 0.32]) p.box(0.06, 0.012, 1.02, x - s * 0.01, y, hz, a <= 2 ? 0xb08968 : 0x8a7a60);
    p.add(new THREE.BoxGeometry(0.006, 0.006, 1.1).rotateX(0.32), x + s * 0.02, 0.2, hz, a <= 2 ? 0x9a7350 : 0x6a6e74);
  }
  // les engins de levage : chèvre de bois, grue à vapeur, portique, portique blanc à liseré
  if (a === 2) {
    // la chèvre au-dessus de la poupe : deux bigues, le hauban qui la retient, la poutre pendue au palan
    const gx = sx, gz = 0.74;
    for (const s of [-1, 1]) tubeW(p, [gx + s * 0.32, 0, gz], [gx, 0.78, gz - 0.24], 0.014, or ? 0x9a7350 : A.bamboo, false, 5);
    tubeW(p, [gx, 0, 0.97], [gx, 0.78, gz - 0.24], 0.006, 0x7a5a40, false, 3);
    for (const s of [-1, 1]) p.box(0.04, 0.03, 0.04, gx + s * 0.32, 0, gz, 0x6a6660);
    const hk = kit.sway([gx, 0.76, gz - 0.24], [1, 0, 0], 0.12, 0.5);
    hk.box(0.004, 0.34, 0.004, 0, -0.34, 0, 0x5a4636);
    hk.add(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 5).rotateZ(PI / 2), 0, -0.36, 0, 0xb08968);
    // le cabestan et ses deux hommes
    p.cyl(0.03, 0.03, 0.09, 6, gx + 0.4, 0, gz + 0.06, O.darkwood);
    for (let k = 0; k < 2; k++) p.add(new THREE.BoxGeometry(0.2, 0.01, 0.01), gx + 0.4, 0.07, gz + 0.06, 0x9a7350, k * PI / 2);
    tubeW(p, [gx + 0.4, 0.05, gz + 0.06], [gx, 0.7, gz - 0.22], 0.003, 0x5a4636, false, 3);
    who(p, kit, gx + 0.5, gz + 0.06, t.coat, -PI / 2, { pose: 'run' });
    // le chaudron de brai sur son feu, qui fume ; l'ancre et son câble lové
    p.cyl(0.05, 0.04, 0.06, 7, 0.1, 0.03, 0.3, 0x2a2a2e); for (let k = 0; k < 3; k++) p.box(0.012, 0.04, 0.012, 0.1 + Math.cos(k * 2.1) * 0.04, 0, 0.3 + Math.sin(k * 2.1) * 0.04, 0x3a3a3e);
    p.cone(0.03, 0.04, 5, 0.1, 0.0, 0.3, 0xffa040, true); kit.smoke(0.1, 0.12, 0.3, 1);
  } else if (a === 3) {
    // la grue à vapeur sur ses rails : socle, chaudière qui fume, cabine, flèche en treillis qui pivote
    const gx = 0.38, gz = 0.32;
    for (const s of [-1, 1]) p.box(0.02, 0.012, 0.9, gx + s * 0.07, 0, 0.2, 0x5a5a60);
    p.box(0.2, 0.06, 0.2, gx, 0.012, gz, 0x3a3a3e);
    for (const s of [-1, 1]) for (const t2 of [-1, 1]) p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 7).rotateZ(PI / 2), gx + s * 0.07, 0.03, gz + t2 * 0.07, 0x2a2a2e);
    const cr = kit.swing ? kit.swing([gx, 0.07, gz], [0, 1, 0], 0.5, 0.06) : kit.sway([gx, 0.07, gz], [0, 1, 0], 0.3, 0.1);
    cr.box(0.16, 0.14, 0.16, 0, 0, 0.02, or ? O.turqD : A.redDark);
    cr.box(0.165, 0.04, 0.165, 0, 0.06, 0.02, 0x2a3a4a, 0, true);
    cr.box(0.18, 0.02, 0.18, 0, 0.14, 0.02, 0x3a3a3e);
    cr.cyl(0.025, 0.025, 0.14, 6, 0.0, 0.16, 0.08, 0x2a2a2e);
    // (la flèche se tend vers la coque, vers -x)
    for (const s of [-1, 1]) tubeW(cr, [-0.06, 0.04, s * 0.04], [-0.5, 0.62, s * 0.012], 0.008, 0x4a4e54, false, 4);
    for (let i = 1; i < 5; i++) cr.box(0.006, 0.006, 0.07 - i * 0.012, -0.06 - i * 0.088, 0.04 + i * 0.116, 0, 0x4a4e54);
    tubeW(cr, [0.06, 0.14, 0], [-0.5, 0.62, 0], 0.003, 0x3a3a3e, false, 3);
    cr.box(0.004, 0.36, 0.004, -0.5, 0.26, 0, 0x2a2a2e);
    cr.box(0.06, 0.012, 0.16, -0.5, 0.24, 0, 0x2a2c30);
    kit.smoke(gx, 0.42, gz + 0.08, 2);
  } else {
    // le portique qui enjambe la cale : deux jambes, le pont, le chariot et son crochet
    const y = a === 4 ? 0.92 : 0.98, x0 = sx - 0.42, x1 = sx + 0.42, gz = 0.05, col = a === 4 ? 0xd8a43c : 0xf2f2f0;
    for (const x of [x0, x1]) { for (const dz of [-0.07, 0.07]) p.box(0.04, y, 0.04, x, 0, gz + dz, col); p.box(0.06, 0.04, 0.24, x, 0, gz, dark(col, 0.7)); p.add(new THREE.BoxGeometry(0.012, 0.012, 0.18).rotateX(0.7), x, y * 0.5, gz, col); }
    p.box(x1 - x0 + 0.1, 0.07, 0.18, sx, y, gz, col);
    if (a >= 5) p.box(x1 - x0 + 0.1, 0.012, 0.19, sx, y - 0.012, gz, c.neon, 0, 'neon');
    p.box(0.1, 0.06, 0.12, sx + 0.08, y - 0.06, gz, dark(col, 0.85));
    p.box(0.004, 0.3, 0.004, sx + 0.08, y - 0.36, gz, 0x2a2a2e);
    const ld = kit.sway([sx + 0.08, y - 0.36, gz], [1, 0, 0], 0.06, 0.4);
    ld.box(0.24, 0.05, 0.12, 0, -0.06, 0, a === 4 ? 0x8a9096 : 0xdfe4e8);
    p.box(0.08, 0.05, 0.06, x1, y + 0.07, gz, 0x2a3a4a, 0, true);
  }
  // l'atelier au style de l'allié, sa grande porte, ses fenêtres ; les piles de matériaux
  const wx = 0.56, wz = -0.56;
  const top = allyWing(p, people, a, wx, wz, 0.66, 0.6, { floors: 1, fh: 0.36, win: 3, side: 2, band: false });
  const F = new Face(p, 0, wx, wz + 0.3);
  F.plane(0.26, 0.26, 0.12, 0.15, 0.012, a <= 3 ? dark(c.wood, 0.7) : c.metal);
  for (let k = 1; k < 4; k++) F.plane(0.26, 0.008, 0.12, 0.03 + k * 0.065, 0.015, dark(c.wood, 0.5));
  if (or && a <= 3) drumDome(p, a, wx - 0.14, top, wz - 0.05, 0.09);
  if (a <= 3) { const cy = or ? top - 0.06 : 0.4, ch = or ? 0.16 : top - 0.4 + 0.08; p.box(0.06, ch, 0.06, wx + 0.22, cy, wz - 0.12, dark(c.wall, 0.8)); kit.smoke(wx + 0.22, cy + ch + 0.02, wz - 0.12, a === 3 ? 2 : 1); }
  if (a >= 4 && or) { p.box(0.5, 0.008, 0.3, wx, top + 0.005, wz, 0x24406a); for (let k = 0; k < 4; k++) p.box(0.004, 0.012, 0.3, wx - 0.18 + k * 0.12, top + 0.005, wz, 0xc8ccd0); }
  if (a <= 2) {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6).rotateX(PI / 2), 0.42 + i * 0.065 + r * 0.032, 0.03 + r * 0.052, 0.15, i % 2 ? 0x9a7350 : 0x8a6440);
    for (let i = 0; i < 4; i++) p.box(0.34, 0.014, 0.06, 0.6, i * 0.016, 0.52, 0xc8a070, 0.05 * i);
    p.box(0.1, 0.06, 0.06, 0.82, 0, 0.36, 0x6b4a30); p.box(0.04, 0.012, 0.012, 0.82, 0.075, 0.36, 0x9aa3ad);
  } else {
    for (let i = 0; i < 6; i++) p.box(0.32, 0.012, 0.22, 0.66, i * 0.014, 0.16, a === 3 ? 0x3a3e44 : a === 4 ? 0x8a9096 : 0xdfe4e8, 0.03 * (i % 2));
    for (let i = 0; i < 3; i++) p.box(0.4, 0.03, 0.03, 0.55, 0.01 + i * 0.03, 0.5, a >= 5 ? 0xe8eaee : 0x8a3a2e);
    if (a === 3) {
      // la forge des riveurs : le foyer qui rougeoit, le tonneau d'eau
      barrel(p, 0.88, 0.42, 0x3a3a3e); p.box(0.1, 0.1, 0.1, 0.88, 0, 0.64, 0x4a4a50); p.cone(0.03, 0.05, 5, 0.88, 0.1, 0.64, 0xffa040, true);
      p.box(0.012, 0.14, 0.012, 0.88, 0.1, 0.6, 0x3a3a3e); kit.smoke(0.88, 0.26, 0.6, 2);
    }
    if (a >= 4) {
      // les étincelles du soudeur sur le flanc, les projecteurs du chantier
      p.box(0.02, 0.02, 0.02, sx + 0.2, hy + 0.08, hz - 0.3, a >= 5 ? c.neon : 0xbfe8ff, 0, 'neon');
      who(p, kit, sx + 0.27, hz - 0.3, 0x3a5a7a, -PI / 2);
      for (const z of [-0.7, 0.5]) { p.cyl(0.006, 0.008, 0.5, 4, sx - 0.36, 0, z, c.metal); p.box(0.05, 0.04, 0.03, sx - 0.33, 0.48, z, 0xfff0c0, 0, true); }
    }
  }
  // les charpentiers, riveteurs ou soudeurs, et le nôtre qui surveille
  who(p, kit, sx + 0.36, -0.55, t.coat, -PI / 2, { pose: 'cheer' });
  who(p, kit, sx - 0.38, 0.0, a <= 3 ? 0x8a6a4a : 0x3a5a7a, PI / 2);
  who(p, kit, sx + 0.3, hz - 0.2, a <= 3 ? 0xd8c8a0 : 0xd8a43c, -PI / 2, { up: 0.16 });
  who(p, kit, 0.32, 0.8, TEAM_A, PI / 2);
  who(p, kit, 0.6, 0.8, t.coat, -PI / 2, { hair: 0x1e1e22 });
  // nos deux drapeaux, l'arbre, le feu de nuit, les bittes
  twoFlags(p, kit, people, 0.74, 0.9, 0.58, 0.16, a <= 2 ? c.wood : c.metal);
  tree(p, people, 0.8, -0.05, 0.6, 4);
  tree(p, people, -0.8, -0.85, 0.55, 5);
  if (a <= 2) torch(p, 0.12, -0.86); else lamp(p, people, a, 0.12, -0.86);
  lamp(p, people, a, -0.88, 0.6);
  for (const x of [-0.75, 0.18]) { p.add(new THREE.CylinderGeometry(0.03, 0.035, 0.07, 6, 1, true).translate(0, 0.035, 0), x, 0, 0.9, 0x3a3a3e); p.cyl(0.04, 0.04, 0.012, 6, x, 0.07, 0.9, 0x3a3a3e); }
  // (seconde passe) le cordage lové au pied des bittes, l'ancre couchée, la table des plans et son ingénieur, l'enseigne
  for (const x of [-0.62, 0.05]) for (let k = 0; k < 2; k++) p.add(new THREE.TorusGeometry(0.04 - k * 0.012, 0.01, 3, 8).rotateX(PI / 2), x, 0.012 + k * 0.014, 0.9, 0xc8b080);
  const an = new Fr(p, -0.68, 0.5, 0.6);
  an.box(0.02, 0.02, 0.24, 0, 0, 0, a <= 2 ? 0x4a4038 : 0x2a2a2e);
  an.add(new THREE.TorusGeometry(0.07, 0.012, 3, 6, PI).rotateX(-PI / 2), 0, 0.01, -0.1, a <= 2 ? 0x4a4038 : 0x2a2a2e);
  an.add(new THREE.TorusGeometry(0.025, 0.008, 3, 6).rotateX(-PI / 2), 0, 0.01, 0.14, a <= 2 ? 0x4a4038 : 0x2a2a2e);
  if (a <= 2) an.box(0.16, 0.02, 0.02, 0, 0.0, 0.1, O.darkwood);
  p.box(0.18, 0.08, 0.1, 0.46, 0, 0.84, c.wood); p.add(new THREE.PlaneGeometry(0.14, 0.07).rotateX(-PI / 2), 0.46, 0.082, 0.84, a >= 5 ? c.neon : 0xe8ecf2, 0, a >= 5 ? 'neon' : false);
  F.plane(0.42, 0.06, -0.1, 0.33, 0.014, a >= 5 ? 0x24303c : dark(c.wood, 0.8), a >= 5);
  for (let i = 0; i < 4; i++) F.plane(0.05, 0.03, -0.25 + i * 0.1, 0.33, 0.018, a >= 5 ? c.neon : O.gold, a >= 5 ? 'neon' : false);
  // les lanternes de l'échafaudage, allumées la nuit
  if (a <= 3) for (const z of [-0.6, 0.2]) { p.box(0.03, 0.04, 0.03, sx + 0.3, 0.36, z, 0xffe2a0, 0, true); p.box(0.034, 0.008, 0.034, sx + 0.3, 0.4, z, 0x3a3a3e); }
  for (const [x, z] of [[-0.9, 0.2], [0.12, 0.62]] as const) shrub(p, x, z, 0.045, Math.round(z * 10));
}

// =====================================================================================================================
// L'hôpital allié (2 × 2, Médiéval au Futuriste)
// =====================================================================================================================

/**
 * L'hôpital allié : le grand bâtiment à cour (deux étages, coupole ou toit courbe au-dessus de l'entrée), la croix rouge, le
 * porche, la tente des blessés, le jardin des simples et sa fontaine, les malades sur les bancs, les infirmières, nos
 * médecins, le brancard (puis la voiture d'ambulance, puis l'ambulance volante), le linge qui sèche, nos deux drapeaux
 */
export function allyHospital(p: Parts, age: number, people: People, kit: ConcessionKit) {
  const a = Math.min(5, Math.max(2, age)), c = pal(people, a), or = people === 'orient';
  const top = allyWing(p, people, a, 0, -0.56, 1.6, 0.6, { floors: 2, door: 0, win: 7, mash: true, back: false }), wallT = 0.64;
  const F = new Face(p, 0, 0, -0.26);
  // le corps d'entrée : coupole ou pavillon à double toit
  if (or) { p.box(0.42, top + 0.06, 0.4, 0, 0, -0.56, c.wall); p.box(0.44, 0.03, 0.42, 0, top + 0.06, -0.56, c.trim); drumDome(p, a, 0, top + 0.09, -0.56, 0.17); }
  else {
    // le pavillon d'entrée traverse le toit et s'élève au-dessus du faîtage
    p.box(0.46, top - wallT + 0.18, 0.4, 0, wallT, -0.56, a <= 3 ? A.red : c.wall);
    p.box(0.4, 0.08, 0.005, 0, top + 0.04, -0.358, a >= 4 ? c.glass : A.paper, 0, true);
    crossSign(new Face(p, 0, 0, -0.36), 0, top - 0.03, 0.1, 0.004, a >= 4);
    hipRoof(p, 0.62, 0.52, 0.22, 0, top + 0.16, -0.56, c.roof, 0, { lod: true, rows: 1, step: 0.12, ...(a >= 5 ? { glow: 'neon' as Glow, edge: c.neon, t: 0.02 } : {}) });
  }
  // le porche : colonnes ou poteaux laqués, dalle ou petit toit, la lanterne
  for (const s of [-1, 1]) {
    if (or) { p.cyl(0.018, 0.02, 0.26, 6, s * 0.16, 0, -0.08, c.trim); p.box(0.05, 0.03, 0.05, s * 0.16, 0.26, -0.08, c.trim); }
    else p.cyl(0.018, 0.02, 0.26, 6, s * 0.16, 0, -0.08, a <= 3 ? A.red : c.trim);
  }
  if (or) { p.box(0.13, 0.13, 0.012, 0, 0.33, -0.12, c.trim); crossSign(new Face(p, 0, 0, -0.114), 0, 0.395, 0.1, 0.001, a >= 4); p.box(0.42, 0.04, 0.24, 0, 0.29, -0.16, c.wall); if (a <= 3) for (let k = 0; k < 4; k++) p.box(0.06, 0.03, 0.02, -0.15 + k * 0.1, 0.33, -0.05, c.wall); else p.box(0.43, 0.012, 0.245, 0, 0.33, -0.16, a >= 5 ? c.neon : c.accent, 0, a >= 5 ? 'neon' : false); }
  else hipRoof(p, 0.48, 0.3, 0.1, 0, 0.27, -0.15, c.roof, 0, { lod: true, rows: 0 });
  if (people === 'asie' && a <= 3) for (const s of [-1, 1]) lantern(p, s * 0.16, 0.2, -0.06, 0.022);
  // le jardin des simples, la fontaine ou le bassin, l'allée
  tiles(p, -0.14, -0.04, 0.14, 0.88, 0.14, c.ground, c.ground2);
  for (const s of [-1, 1]) {
    p.box(0.42, 0.035, 0.26, s * 0.4, 0, 0.16, or ? O.stone : A.stone);
    p.box(0.38, 0.04, 0.22, s * 0.4, 0, 0.16, 0x6f9a4a);
    for (let k = 0; k < 4; k++) p.sphere(0.028, s * 0.4 - 0.13 + k * 0.087, 0.05, 0.16 + (k % 2 ? 0.04 : -0.04), pick([0x7aa060, 0x9ab86a, 0xc8a0d8, 0xe8e0a0], k + (s > 0 ? 1 : 0)), 0, 0.8);
  }
  if (or) {
    p.cyl(0.11, 0.115, 0.05, 8, 0, 0, 0.25, c.trim); p.cyl(0.095, 0.095, 0.052, 8, 0, 0, 0.25, O.water);
    p.cyl(0.015, 0.02, 0.12, 6, 0, 0.05, 0.25, c.trim); p.cyl(0.04, 0.012, 0.025, 8, 0, 0.17, 0.25, c.trim);
  } else {
    p.box(0.2, 0.04, 0.14, 0, 0, 0.25, A.stone); p.box(0.17, 0.042, 0.11, 0, 0, 0.25, A.water);
    for (let k = 0; k < 2; k++) p.cyl(0.018, 0.018, 0.003, 6, -0.04 + k * 0.07, 0.044, 0.24 + k * 0.02, A.lotus);
  }
  // les malades sur les bancs sous leur auvent, la cruche et les gobelets, l'infirmière, nos médecins
  const nurse = a <= 3 ? 0xf2ece0 : 0xf8f8f6;
  for (const s of [-1, 1]) {
    bench(p, s * 0.4, -0.06, 0, c.wood);
    for (const u of [-0.09, 0.09]) p.box(0.008, 0.26, 0.008, s * 0.4 + u, 0, 0.0, c.wood);
    p.add(new THREE.BoxGeometry(0.24, 0.008, 0.14), s * 0.4, 0.26, -0.06, a <= 3 ? (or ? 0xd9a43c : 0xb8402f) : c.trim, 0, false, 0, -0.25);
  }
  who(p, kit, -0.44, -0.07, 0x9ab0c8, 0, { sit: true }); who(p, kit, -0.36, -0.07, 0xc8b8a0, 0, { sit: true, hair: 0xa8a8a8 });
  who(p, kit, 0.4, -0.07, 0x9ab0c8, 0, { sit: true });
  p.box(0.06, 0.05, 0.05, 0.52, 0, -0.04, c.wood); jar(p, 0.52, -0.04, 0.3, or ? O.terra : 0x5a6a5a, 0.05);
  who(p, kit, -0.18, 0.3, nurse, 0.6); who(p, kit, 0.24, 0.74, TEAM_A, -2.8); who(p, kit, 0.15, 0.8, nurse, 2.4);
  // le brancard porté sur l'allée, puis l'ambulance à droite de l'entrée
  if (a === 2) {
    stretcher(p, 0, 0.64, 0, 0.075);
    who(p, kit, 0, 0.47, troop(people, a).coat, 0); who(p, kit, 0, 0.82, TEAM_A, PI);
    stretcher(p, 0.5, 0.42, PI / 2, 0.0);
    who(p, kit, 0.58, 0.58, nurse, -2.4);
  } else if (a === 3) {
    // la voiture d'ambulance à cheval
    const g = new Fr(p, 0.52, 0.62, PI / 2);
    g.box(0.18, 0.15, 0.3, 0, 0.07, 0, 0xf2ece0); g.box(0.19, 0.02, 0.31, 0, 0.22, 0, 0x6a6a60);
    crossSign(new Face(p, 0, 0.52, 0.62 + 0.091), 0, 0.15, 0.07, 0.0, false);
    for (const s of [-1, 1]) for (const z of [-0.1, 0.1]) g.add(new THREE.TorusGeometry(0.045, 0.008, 3, 8).rotateY(PI / 2), s * 0.1, 0.06, z, 0x3a3a3e);
    for (const s of [-1, 1]) g.box(0.008, 0.008, 0.18, s * 0.05, 0.07, 0.24, 0x7a5a40);
    g.box(0.06, 0.07, 0.18, 0, 0.08, 0.36, 0x8a5a3a); g.box(0.05, 0.06, 0.06, 0, 0.13, 0.46, 0x8a5a3a);
    for (const s of [-1, 1]) for (const z of [0.3, 0.42]) g.box(0.016, 0.08, 0.016, s * 0.02, 0, z, 0x6a4a2a);
    stretcher(p, 0.5, 0.42, PI / 2, 0.065);
  } else if (a === 4) {
    const g = new Fr(p, 0.6, 0.62, PI / 2);
    g.box(0.2, 0.17, 0.42, 0, 0.04, 0, 0xf6f6f2); g.box(0.21, 0.03, 0.43, 0, 0.09, 0, RED_CROSS);
    g.box(0.18, 0.07, 0.006, 0, 0.13, 0.213, 0x2a3a4a, true);
    g.box(0.06, 0.02, 0.06, 0, 0.21, 0.05, 0x3a7ad8, true);
    for (const s of [-1, 1]) for (const z of [-0.13, 0.13]) g.add(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8).rotateZ(PI / 2), s * 0.1, 0.04, z, 0x222226);
    stretcher(p, 0.5, 0.42, PI / 2, 0.07);
  } else {
    // l'ambulance volante au-dessus de son aire lumineuse
    p.cyl(0.16, 0.16, 0.01, 12, 0.62, 0, 0.62, c.trim); p.add(new THREE.TorusGeometry(0.13, 0.006, 3, 14).rotateX(PI / 2), 0.62, 0.012, 0.62, c.neon, 0, 'neon');
    p.box(0.1, 0.004, 0.03, 0.62, 0.012, 0.62, RED_CROSS); p.box(0.03, 0.004, 0.1, 0.62, 0.012, 0.62, RED_CROSS);
    p.add(new THREE.CapsuleGeometry(0.06, 0.2, 3, 8).rotateX(PI / 2), 0.62, 0.3, 0.62, 0xf6f6f2);
    p.box(0.1, 0.04, 0.16, 0.62, 0.31, 0.62, c.glass, 0, true);
    p.box(0.125, 0.012, 0.02, 0.62, 0.27, 0.51, RED_CROSS);
    for (const s of [-1, 1]) { p.box(0.2, 0.01, 0.02, 0.62, 0.3, 0.62 + s * 0.12, 0xdfe4e8); kit.turn([0.62 + s * 0.1, 0.32, 0.62 + s * 0.12], [0, 1, 0], 3).box(0.12, 0.003, 0.015, 0, 0, 0, 0xc8ccd0); }
    stretcher(p, 0.5, 0.4, PI / 2, 0.07, 0x9fd8e6);
  }
  // la tente des blessés (puis le pavillon préfabriqué, puis la bulle)
  const tx = -0.55, tz = 0.68;
  if (a <= 3) {
    p.add(new THREE.CylinderGeometry(0.001, 0.2, 0.22, 4, 1, true).rotateY(PI / 4).scale(1.2, 1, 0.9).translate(0, 0.11, 0), tx, 0, tz, or ? 0xeee6d4 : 0xe8dcc0);
    p.cyl(0.004, 0.004, 0.3, 4, tx, 0, tz, O.darkwood);
    p.box(0.05, 0.05, 0.004, tx, 0.1, tz + 0.12, RED_CROSS); p.box(0.016, 0.016, 0.006, tx, 0.115, tz + 0.12, 0xf8f6f0);
    stretcher(p, tx + 0.26, tz - 0.02, 0.1, 0.0);
  } else if (a === 4) {
    p.box(0.34, 0.16, 0.24, tx, 0, tz, 0xe8e6e0); p.add(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 8, 1, false, 0, PI).rotateZ(PI / 2).scale(1, 0.5, 1), tx, 0.16, tz, 0xdcd8d0);
    crossSign(new Face(p, 0, tx, tz + 0.12), 0, 0.09, 0.07); stretcher(p, tx + 0.28, tz - 0.08, 0.1, 0.0);
  } else {
    p.add(new THREE.SphereGeometry(0.2, 10, 5, 0, PI * 2, 0, PI / 2).scale(1, 0.8, 0.9), tx, 0, tz, 0xf4f6f8);
    p.add(new THREE.TorusGeometry(0.2, 0.006, 3, 14).rotateX(PI / 2).scale(1, 1, 0.9), tx, 0.01, tz, c.neon, 0, 'neon');
    crossSign(new Face(p, 0, tx, tz + 0.18), 0, 0.1, 0.06, 0, true);
  }
  // le linge qui sèche, nos deux drapeaux, les arbres, les lanternes
  for (const s of [-1, 1]) p.cyl(0.005, 0.006, 0.26, 4, -0.86, 0, 0.28 + s * 0.16, c.wood);
  p.box(0.004, 0.004, 0.32, -0.86, 0.25, 0.28, 0xd8d0c0);
  for (let i = 0; i < 3; i++) kit.sway([-0.86, 0.25, 0.18 + i * 0.1], [0, 0, 1], 0.25, 0.9 + i * 0.1).box(0.004, 0.09, 0.07, 0, -0.09, 0, i === 1 ? 0xd8e4f0 : 0xf8f6f0);
  twoFlags(p, kit, people, 0.7, -0.08, 0.6, 0.16, c.metal);
  tree(p, people, -0.84, -0.2, 0.6, 1); tree(p, people, 0.84, 0.3, 0.55, 2); tree(p, people, 0.82, 0.88, 0.5, 6);
  for (const s of [-1, 1]) { if (a <= 2) torch(p, s * 0.2, 0.92, 0.24); else lamp(p, people, a, s * 0.2, 0.92, 0.3); }
  // les lanternes de part et d'autre de la porte, allumées la nuit
  if (or) for (const s of [-1, 1]) { F.box(0.03, 0.05, 0.03, s * 0.26, 0.2, 0.03, 0xffe2a0, true); F.box(0.034, 0.012, 0.034, s * 0.26, 0.25, 0.03, O.gold); }
  for (const x of [-0.55, 0.55]) jar(p, x, -0.2, 0.5, or ? O.terra : 0x5a6a5a);
}

// =====================================================================================================================
// Le port marchand partagé (3 × 3, Industriel au Futuriste)
// =====================================================================================================================

/** Grue du quai sur ses rails (x, z), sa flèche qui pivote lentement, la charge pendue au crochet */
function quayCrane(p: Parts, kit: ConcessionKit, people: People, age: number, x: number, z: number, y: number, k: number) {
  const c = pal(people, age), col = age === 3 ? (people === 'orient' ? O.turqD : A.redDark) : age === 4 ? 0xd8a43c : 0xf2f2f0;
  // le portique à quatre pieds qui enjambe les rails
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.03, 0.34, 0.03, x + sx * 0.1, y, z + sz * 0.1, dark(col, 0.8));
  for (const sz of [-1, 1]) p.box(0.24, 0.03, 0.03, x, y + 0.04, z + sz * 0.1, dark(col, 0.7));
  p.box(0.26, 0.04, 0.26, x, y + 0.34, z, col);
  const hd = kit.swing ? kit.swing([x, y + 0.38, z], [0, 1, 0], 0.55, 0.05 + k * 0.01) : kit.sway([x, y + 0.38, z], [0, 1, 0], 0.3, 0.08);
  // la cabine, la chaudière qui fume (Industriel), la flèche en treillis, le crochet et sa charge
  hd.box(0.16, 0.14, 0.18, 0, 0, 0.03, col);
  hd.box(0.165, 0.05, 0.12, 0, 0.07, 0.05, age >= 5 ? c.neon : 0x2a3a4a, 0, age >= 5 ? 'neon' : true);
  hd.box(0.18, 0.02, 0.2, 0, 0.14, 0.03, dark(col, 0.7));
  if (age === 3) hd.cyl(0.022, 0.022, 0.12, 6, 0, 0.16, 0.09, 0x2a2a2e);
  for (const s of [-1, 1]) tubeW(hd, [s * 0.05, 0.05, -0.04], [s * 0.012, 0.58, -0.46], 0.009, col, false, 4);
  for (let i = 1; i < 5; i++) hd.box(0.08 - i * 0.014, 0.008, 0.008, 0, 0.05 + i * 0.105, -0.04 - i * 0.084, col);
  tubeW(hd, [0, 0.14, 0.12], [0, 0.6, -0.46], 0.004, 0x3a3a3e, false, 3);
  hd.box(0.004, 0.3, 0.004, 0, 0.28, -0.46, 0x2a2a2e);
  if (age === 3) bale(hd, 0, -0.46, 0xc8a070, 0.2);
  else if (age === 4) { hd.box(0.26, 0.11, 0.11, 0, 0.17, -0.46, pick([0x2f6f9e, 0xc0442a, 0x3f7a4a], k)); for (let i = 0; i < 5; i++) hd.box(0.006, 0.1, 0.114, -0.1 + i * 0.05, 0.175, -0.46, 0x2a2a2e); }
  else { hd.add(new THREE.CapsuleGeometry(0.05, 0.14, 2, 6).rotateZ(PI / 2), 0, 0.22, -0.46, 0xf4f6f8); hd.box(0.2, 0.01, 0.105, 0, 0.215, -0.46, c.neon, 0, 'neon'); }
  if (age === 3) kit.smoke(x, y + 0.66, z + 0.09, 2);
}

/**
 * Le port marchand partagé et la ligne de vapeurs : le grand quai du bord de la parcelle (côté +z), ses bittes, ses
 * défenses, ses échelles et ses rails ; la gare maritime au style de l'allié, sa tour de l'horloge et son hall des voyageurs
 * (fer et verre, puis auvent de béton, puis coque lisse), le bureau de la ligne à notre style, le hangar des marchandises,
 * deux grues, ballots, tonneaux, conteneurs ou capsules, la passerelle d'embarquement, nos deux pavillons sur leurs grands
 * mâts au pied de la passerelle, les kiosques, les voyageurs et leurs malles, les dockers
 */
export function merchantPort(p: Parts, age: number, people: People, kit: ConcessionKit) {
  const a = Math.min(5, Math.max(3, age)), c = pal(people, a), o = ours(a), or = people === 'orient';
  // ---- le quai : bloc de pierre, puis de béton, puis blanc ; parement, chaperon, défenses, bittes, échelles
  const qz0 = 0.86, qz1 = 1.48, qy = 0.1, qc = a === 3 ? (or ? 0xd8c7a2 : 0xa8a49a) : a === 4 ? 0xc8c6c0 : 0xe8eaea;
  p.box(2.96, qy, qz1 - qz0, 0, 0, (qz0 + qz1) / 2, qc);
  p.box(2.98, 0.025, 0.08, 0, qy - 0.005, qz1 - 0.04, a === 3 ? dark(qc, 0.82) : a === 4 ? 0xd8a43c : c.neon, 0, a >= 5 ? 'neon' : false);
  const Q = new Face(p, 0, 0, qz1);
  for (let i = 0; i < 12; i++) Q.plane(0.006, qy, -1.43 + i * 0.26, qy / 2, 0.003, dark(qc, 0.8));
  Q.plane(2.96, 0.006, 0, qy * 0.5, 0.003, dark(qc, 0.8));
  for (let i = 0; i < 5; i++) Q.box(0.04, qy - 0.01, 0.025, -1.2 + i * 0.6, 0, 0.012, a === 3 ? 0x5a4636 : 0x2a2a2e);
  for (const x of [0.95]) for (let k = 0; k < 3; k++) Q.box(0.06, 0.008, 0.02, x, 0.012 + k * 0.03, 0.01, 0x3a3a3e);
  for (let i = 0; i < 5; i++) { const x = -1.3 + i * 0.65; p.add(new THREE.CylinderGeometry(0.026, 0.032, 0.06, 6, 1, true).translate(0, 0.03, 0), x, qy, qz1 - 0.12, 0x2a2a2e); p.cyl(0.036, 0.036, 0.012, 6, x, qy + 0.06, qz1 - 0.12, 0x2a2a2e); }
  // les rails des grues, le long du quai
  for (const z of [1.0, 1.24]) p.box(2.2, 0.008, 0.016, 0.35, qy, z, 0x5a5a60);
  // le dallage de la terre-plein, entre la gare et le quai (des dalles, le sol se voit entre elles)
  tiles(p, -1.42, 0.1, 0.72, 0.84, 0.24, c.ground, c.ground2);
  // ---- la gare maritime au style de l'allié : deux étages, tour de l'horloge, hall des voyageurs devant
  const gx = -0.3, gz = -0.82, gw = 1.6, gd = 0.8;
  const top = allyWing(p, people, a, gx, gz, gw, gd, { floors: 2, fh: 0.32, door: 0, win: 7, side: 2, mash: true });
  const G = new Face(p, 0, gx, gz + gd / 2);
  // l'enseigne de la ligne : bandeau, cheminée peinte (le signe de la ligne), lettres dorées
  G.plane(0.7, 0.08, 0, 0.66, 0.014, a >= 5 ? 0x24303c : c.accent2, a >= 5);
  for (let i = 0; i < 7; i++) G.plane(0.05, 0.04, -0.24 + i * 0.08, 0.66, 0.018, a >= 5 ? c.neon : O.gold, a >= 5 ? 'neon' : false);
  // la tour de l'horloge au milieu
  const tw = 0.3, th = top + 0.55;
  p.box(tw, th, tw, gx, 0, gz + 0.1, c.wall);
  p.box(tw + 0.03, 0.03, tw + 0.03, gx, top, gz + 0.1, c.trim);
  for (const [ry, ox, oz] of [[0, 0, tw / 2 + 0.002], [PI / 2, tw / 2 + 0.002, 0], [-PI / 2, -tw / 2 - 0.002, 0]] as const) {
    const f = new Face(p, ry, gx + ox, gz + 0.1 + oz);
    f.add(new THREE.CircleGeometry(0.09, 12), 0, th - 0.16, 0.002, 0xf6f0e0, true);
    f.add(new THREE.RingGeometry(0.09, 0.105, 10), 0, th - 0.16, 0.003, c.trim);
    f.plane(0.01, 0.07, 0, th - 0.135, 0.005, 0x2a2a2e); f.plane(0.05, 0.01, 0.02, th - 0.16, 0.005, 0x2a2a2e);
    if (a <= 4) f.plane(0.08, 0.14, 0, top + 0.12, 0.003, c.glass, true);
  }
  if (or) { p.box(tw + 0.04, 0.04, tw + 0.04, gx, th, gz + 0.1, c.trim); merlons(new Face(p, 0, gx, gz + 0.1 + tw / 2), tw, th + 0.04, c.wall, 'round', 0.1, 0.05, 0.03); drumDome(p, a, gx, th + 0.04, gz + 0.1, 0.13); }
  else { p.box(tw + 0.05, 0.05, tw + 0.05, gx, th - 0.03, gz + 0.1, a <= 3 ? A.beam : c.trim); hipRoof(p, tw + 0.26, tw + 0.26, 0.28, gx, th, gz + 0.1, a >= 4 ? c.accent2 : c.roof, 0, { lod: true, rows: 1, step: 0.1, ...(a >= 5 ? { glow: 'neon' as Glow, edge: c.neon, t: 0.02 } : {}) }); for (const s of [-1, 1]) lantern(p, gx + s * 0.22, th - 0.06, gz + 0.32, 0.025); }
  // le hall des voyageurs devant la gare : voûte de verre sur arcs de fer, auvent de béton, coque blanche
  const hz0 = gz + gd / 2, hz1 = 0.5, hl = hz1 - hz0, hc = (hz0 + hz1) / 2, hx = gx;
  if (a === 3) {
    p.add(new THREE.CylinderGeometry(0.38, 0.38, hl, 10, 1, true, PI / 2, PI).rotateX(PI / 2), hx, 0.3, hc, 0x9fb6c4, 0, true);
    for (let i = 0; i < 3; i++) {
      const z = hz0 + 0.04 + i * ((hl - 0.08) / 2);
      p.add(new THREE.TorusGeometry(0.39, 0.014, 3, 8, PI), hx, 0.3, z, c.metal);
      for (const s of [-1, 1]) p.box(0.03, 0.3, 0.03, hx + s * 0.38, 0, z, c.metal);
    }
    p.add(new THREE.CircleGeometry(0.38, 10, 0, PI), hx, 0.3, hz1 + 0.001, 0x9fb6c4, 0, true);
    for (let k = 0; k < 5; k++) p.box(0.006, 0.36, 0.008, hx - 0.3 + k * 0.15, 0.3, hz1 + 0.004, c.metal);
  } else if (a === 4) {
    p.box(1.0, 0.03, hl + 0.1, hx, 0.4, hc + 0.05, c.trim);
    p.box(1.01, 0.012, hl + 0.11, hx, 0.39, hc + 0.05, c.accent);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.cyl(0.012, 0.012, 0.4, 6, hx + s * 0.44, 0, hz0 + 0.1 + i * (hl - 0.1) / 2, c.metal);
    p.box(0.9, 0.3, 0.012, hx, 0.04, hz1 - 0.05, c.glass, 0, true);
    for (let k = 0; k < 7; k++) p.box(0.01, 0.3, 0.016, hx - 0.42 + k * 0.14, 0.04, hz1 - 0.05, c.metal);
  } else {
    p.add(new THREE.CylinderGeometry(0.4, 0.4, hl, 12, 1, true, PI / 2, PI).rotateX(PI / 2).scale(1, 0.85, 1), hx, 0.04, hc, c.glass, 0, true);
    for (let i = 0; i < 4; i++) p.add(new THREE.TorusGeometry(0.41, 0.014, 3, 12, PI).scale(1, 0.85, 1), hx, 0.04, hz0 + 0.04 + i * ((hl - 0.08) / 3), c.wall);
    p.add(new THREE.TorusGeometry(0.41, 0.008, 3, 12, PI).scale(1, 0.85, 1), hx, 0.04, hz1 + 0.004, c.neon, 0, 'neon');
    p.box(0.84, 0.04, hl, hx, 0, hc, c.trim);
  }
  // la passerelle d'embarquement : de l'étage du hall au bord du quai, sur ses poteaux, garde-corps, rampe qui descend
  const pz0 = hz1 + 0.02, pz1 = 1.3, py = 0.38, px = hx + 0.06, pl = pz1 - pz0;
  p.box(0.16, 0.025, pl, px, py, (pz0 + pz1) / 2, a === 3 ? 0x8a6a4a : c.trim);
  for (const s of [-1, 1]) {
    p.box(0.008, 0.06, pl, px + s * 0.075, py + 0.025, (pz0 + pz1) / 2, a >= 5 ? c.neon : c.metal, 0, a >= 5 ? 'neon' : false);
    for (let i = 0; i < 4; i++) p.box(0.008, 0.07, 0.008, px + s * 0.075, py + 0.025, pz0 + 0.05 + i * (pl - 0.1) / 3, c.metal);
  }
  if (a === 4) { p.box(0.17, 0.1, pl * 0.7, px, py + 0.04, pz0 + pl * 0.35, c.glass, 0, true); p.box(0.18, 0.012, pl * 0.7, px, py + 0.14, pz0 + pl * 0.35, c.trim); }
  for (const z of [pz0 + 0.05, pz0 + pl * 0.6]) p.box(0.03, z < qz0 ? py : py - qy, 0.03, px, z < qz0 ? 0 : qy, z, c.metal);
  p.add(new THREE.BoxGeometry(0.15, 0.015, 0.26).rotateX(0.95), px, (py + qy) / 2 + 0.02, pz1 + 0.06, a === 3 ? 0x8a6a4a : c.trim);
  // ---- nos deux pavillons sur leurs grands mâts, au pied de la passerelle
  for (const [x, ours2] of [[px - 0.28, false], [px + 0.28, true]] as const) {
    p.box(0.08, 0.04, 0.08, x, qy, 1.06, c.trim);
    if (ours2) ourFlag(p, kit, x, 1.06, 1.05, c.metal, 1.6, qy + 0.04); else allyFlag(p, kit, people, x, 1.06, 1.05, c.metal, 1.6, qy + 0.04);
  }
  // ---- le bureau de la ligne de vapeurs, à notre style, son enseigne, la cheminée peinte qui en est le signe
  const ox = 0.95, oz = -0.95;
  const otop = ourWing(p, kit, a, ox, oz, 0.8, 0.6, { floors: 2, fh: 0.26, door: 0 });
  const OF = new Face(p, 0, ox, oz + 0.3);
  OF.plane(0.5, 0.07, 0, 0.32, 0.016, a >= 4 ? 0x24303c : 0x2a3e5a, a >= 4);
  for (let i = 0; i < 5; i++) OF.plane(0.06, 0.035, -0.16 + i * 0.08, 0.32, 0.02, a >= 5 ? o.neon : 0xf2e2b8, a >= 5 ? 'neon' : false);
  p.cyl(0.04, 0.05, 0.18, 8, ox + 0.26, a <= 3 ? otop + 0.12 : otop + 0.03, oz + 0.1, 0x2a2a2e);
  p.cyl(0.052, 0.052, 0.05, 8, ox + 0.26, (a <= 3 ? otop + 0.12 : otop + 0.03) + 0.1, oz + 0.1, 0xc0442a);
  // (seconde passe) le mât des signaux du port sur le bureau : vergue et pavillons de signaux à leurs couleurs ; le radar qui
  // tourne au-dessus (Moderne), puis l'anneau lumineux (Futuriste)
  const sy = a <= 3 ? otop + 0.2 : otop + 0.035, sm = ox - 0.25;
  p.cyl(0.006, 0.008, 0.42, 4, sm, sy, oz, c.metal);
  p.box(0.2, 0.008, 0.008, sm, sy + 0.32, oz, c.metal);
  { const sg = kit.sway([sm, sy + 0.32, oz], [1, 0, 0], 0.3, 0.9); for (let k = 0; k < 3; k++) sg.box(0.004, 0.045, 0.05, -0.08 + k * 0.08, -0.06, 0, pick([0xe8c04a, 0x2f6fb8, 0xd84a3e], k)); }
  if (a === 4) { const rd = kit.turn([sm, sy + 0.44, oz], [0, 1, 0], 0.4); rd.box(0.16, 0.03, 0.012, 0, 0, 0, 0xe8eaee); rd.box(0.012, 0.03, 0.02, 0, -0.02, 0, 0x8a9096); }
  else if (a >= 5) p.add(new THREE.TorusGeometry(0.06, 0.006, 3, 10).rotateX(PI / 2), sm, sy + 0.44, oz, c.neon, 0, 'neon');
  // ---- le hangar des marchandises : ouvert, sur poteaux, toit à deux pans (fer), puis béton, puis blanc ; dedans les ballots
  const sxc = 1.05, szc = 0.12, sw = 0.76, sd = 0.9, shh = 0.4;
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) p.box(0.03, shh, 0.03, sxc + sx * (sw / 2 - 0.02), 0, szc - sd / 2 + 0.03 + i * (sd - 0.06) / 2, a === 3 ? c.metal : c.trim);
  p.box(sw - 0.04, shh * 0.6, 0.02, sxc, 0, szc - sd / 2 + 0.02, a === 3 ? c.brick : c.wall);
  if (a === 3) gableRoof(p, sxc, shh, szc, sw + 0.04, sd + 0.04, 0.16, 0x8a9096, c.brick);
  else { p.box(sw + 0.08, 0.035, sd + 0.08, sxc, shh, szc, c.trim); p.box(sw + 0.09, 0.012, sd + 0.09, sxc, shh - 0.012, szc, a >= 5 ? c.neon : c.accent, 0, a >= 5 ? 'neon' : false); }
  // les marchandises sous le hangar et sur le quai
  const goods = [0xc8a070, 0xd8c8a0, 0x9a7a5a, 0xb88a5a, 0xe0d0b0];
  if (a === 3) {
    for (let i = 0; i < 4; i++) bale(p, sxc - 0.15 + (i % 2) * 0.16, szc - 0.25 + Math.floor(i / 2) * 0.12, pick(goods, i), 0, 0.1 * i);
    for (let i = 0; i < 2; i++) bale(p, sxc - 0.07 + i * 0.14, szc - 0.25, pick(goods, i + 2), 0.07);
    for (let i = 0; i < 3; i++) barrel(p, sxc - 0.16 + i * 0.08, szc + 0.25, i % 2 ? 0x8a5a3a : 0x7a4a2e);
    for (let i = 0; i < 3; i++) bale(p, 0.76 + i * 0.12, 1.1, pick(goods, i + 1), qy, 0.2 * i);
    for (let i = 0; i < 3; i++) sack(p, -1.2 + i * 0.07, 1.14, 0xd8c8a0, qy);
    bale(p, 0.82, 1.1, pick(goods, 0), qy + 0.07, 0.4);
    // la voie du port et son wagon plat
    for (const s of [-1, 1]) p.box(0.85, 0.012, 0.012, 0.32, 0.012, 0.72 + s * 0.05, 0x5a5a60);
    for (let i = 0; i < 5; i++) p.box(0.035, 0.008, 0.15, -0.04 + i * 0.18, 0.008, 0.72, 0x5a4636);
    p.box(0.4, 0.04, 0.14, 0.2, 0.035, 0.72, 0x5a4a3e); for (const s of [-1, 1]) for (const dx of [-0.12, 0.12]) p.add(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 6, 1, true).rotateX(PI / 2), 0.2 + dx, 0.03, 0.72 + s * 0.06, 0x2a2a2e);
    for (let i = 0; i < 3; i++) crate(p, 0.08 + i * 0.12, 0.72, 0.09, pick([0x9a7a5a, 0x7a6a4a, 0xb8a070], i), 0.075);
  } else {
    const cols = a === 4 ? [0x2f6f9e, 0xc0442a, 0x3f7a4a, 0xd8a43c, 0x8a5a8a] : [0xf4f6f8, 0xe8eaee];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 2 - r; i++) {
      const x = -1.25 + i * 0.3 + r * 0.15, y = qy + r * 0.11, col = pick(cols, i + r * 2);
      if (a === 4) { p.box(0.28, 0.11, 0.12, x, y, 1.12, col); for (let k = 0; k < 4; k++) p.box(0.006, 0.1, 0.124, x - 0.1 + k * 0.067, y + 0.005, 1.12, dark(col, 0.75)); }
      else { p.add(new THREE.CapsuleGeometry(0.05, 0.16, 2, 6).rotateZ(PI / 2), x, y + 0.055, 1.12, col); p.box(0.2, 0.01, 0.105, x, y + 0.05, 1.12, c.neon, 0, 'neon'); }
    }
    for (let i = 0; i < 4; i++) crate(p, sxc - 0.2 + (i % 2) * 0.14, szc - 0.2 + Math.floor(i / 2) * 0.2, 0.11, a === 4 ? pick([0x9a7a5a, 0x6a7a4a], i) : 0xdfe4e8, 0, 0, a >= 5 ? c.neon : undefined);
    if (a === 4) {
      // le chariot élévateur et sa palette
      const g = new Fr(p, 0.62, 0.62, -PI / 2);
      g.box(0.12, 0.08, 0.16, 0, 0.02, 0, 0xd8a43c); g.box(0.1, 0.07, 0.008, 0, 0.1, -0.02, 0x2a3a4a, true); g.box(0.11, 0.008, 0.11, 0, 0.17, -0.03, 0x2a2a2e);
      for (const s of [-1, 1]) g.box(0.008, 0.2, 0.008, s * 0.04, 0, 0.09, 0x3a3a3e);
      g.box(0.1, 0.05, 0.1, 0, 0.03, 0.15, 0x9a7a5a);
      for (const s of [-1, 1]) for (const z of [-0.05, 0.05]) g.add(new THREE.CylinderGeometry(0.022, 0.022, 0.015, 7).rotateZ(PI / 2), s * 0.06, 0.022, z, 0x222226);
    } else {
      // le chariot autonome qui glisse sur son liseré
      p.box(0.22, 0.04, 0.14, 0.62, 0.03, 0.62, 0xf4f6f8); p.box(0.226, 0.01, 0.146, 0.62, 0.04, 0.62, c.neon, 0, 'neon');
      p.add(new THREE.CapsuleGeometry(0.04, 0.12, 2, 6).rotateZ(PI / 2), 0.62, 0.11, 0.62, 0xe8eaee);
      p.box(1.4, 0.004, 0.02, 0.0, 0.016, 0.7, c.neon, 0, 'neon');
    }
  }
  // ---- les deux grues
  quayCrane(p, kit, people, a, 0.55, 1.12, qy, 0);
  quayCrane(p, kit, people, a, 1.2, 1.12, qy, 1);
  // ---- les kiosques : le guichet au style de l'allié, le nôtre (journaux, poste) ; l'horaire des départs
  const kx = -1.22, kz = 0.3;
  if (or) {
    p.cyl(0.13, 0.14, 0.24, 8, kx, 0, kz, c.wall);
    for (let k = 0; k < 4; k++) { const an = (k * PI) / 2; bay(new Face(p, an, kx + Math.sin(an) * 0.135, kz + Math.cos(an) * 0.135), 0, 0.06, 0.08, 0.13, 'pointed', c.glass, { frame: c.accent, glow: true, seg: 4 }); }
    p.cyl(0.15, 0.15, 0.025, 8, kx, 0.24, kz, c.trim);
    dome(p, 0.13, 0.12, kx, 0.265, kz, a <= 3 ? O.turq : a === 4 ? O.gold : O.glass, 'persian', 8, a >= 5);
    finial(p, kx, 0.385, kz, 0.5);
  } else {
    p.box(0.24, 0.22, 0.22, kx, 0, kz, a <= 3 ? A.red : c.wall);
    p.box(0.18, 0.09, 0.005, kx, 0.1, kz + 0.111, a >= 4 ? c.glass : A.paper, 0, true);
    hipRoof(p, 0.38, 0.36, 0.15, kx, 0.22, kz, c.roof, 0, { lod: true, rows: 0, ...(a >= 5 ? { glow: 'neon' as Glow, edge: c.neon, t: 0.02 } : {}) });
    lantern(p, kx + 0.15, 0.17, kz + 0.15, 0.022);
  }
  const k2 = -1.22, kz2 = -0.12;
  p.box(0.2, 0.2, 0.18, k2, 0, kz2, a <= 3 ? 0x3f5a4a : o.wall);
  p.box(0.16, 0.08, 0.005, k2, 0.08, kz2 + 0.091, o.win, 0, true);
  for (let i = 0; i < 3; i++) p.box(0.04, 0.05, 0.004, k2 - 0.06 + i * 0.06, 0.03, kz2 + 0.093, pick([0xf2e2b8, 0xd8786c, 0x86c4b8], i));
  if (a <= 3) { p.pyramid(0.28, 0.12, 0.26, k2, 0.2, kz2, 0x3f5a4a); p.sphere(0.014, k2, 0.33, kz2, O.gold); } else { p.box(0.26, 0.025, 0.24, k2, 0.2, kz2, o.trim); p.box(0.18, 0.05, 0.01, k2, 0.225, kz2 + 0.09, o.accent, 0, a >= 5 ? 'neon' : false); }
  // le tableau des départs sur son pied, allumé
  p.box(0.02, 0.3, 0.02, -0.95, 0, 0.62, c.metal);
  p.box(0.26, 0.16, 0.02, -0.95, 0.22, 0.62, 0x24303c);
  for (let k = 0; k < 4; k++) p.box(0.2, 0.014, 0.004, -0.95, 0.25 + k * 0.03, 0.632, k % 2 ? 0xf2e2b8 : a >= 5 ? c.neon : 0xffe2a0, 0, a >= 5 ? 'neon' : true);
  // ---- les voyageurs et leurs malles, les porteurs, les dockers, notre agent de la ligne, l'officier du port allié
  const coat = or ? [0xf2ece0, 0x2fa8a0, 0xd8b47a] : [0x24201e, 0xb02a22, 0x3a8a6a];
  who(p, kit, -0.42, 0.62, coat[0], 0.2); who(p, kit, -0.3, 0.66, 0x3a5a9a, -2.6, { hair: 0x8a5a30 });
  for (const [x, z, col] of [[-0.36, 0.74, 0x6a4a2a], [-0.2, 0.7, 0x3a4a6a]] as const) { p.box(0.1, 0.06, 0.06, x, 0.014, z, col); p.box(0.104, 0.01, 0.064, x, 0.05, z, O.gold); }
  who(p, kit, -0.1, 0.4, coat[1], PI); who(p, kit, -0.6, 0.3, TEAM_A, 0.6);
  who(p, kit, 0.3, 0.98, coat[2], -PI / 2, { up: qy, pose: 'run' }); sack(p, 0.3, 0.98, 0xd8c8a0, qy + 0.17);
  who(p, kit, 0.95, 0.98, 0x5a6a7a, PI / 2, { up: qy });
  who(p, kit, 0.22, 1.24, coat[0], 0.4, { up: qy });
  // ---- le mobilier : réverbères du quai, bancs, bouée, cloche du port, bacs plantés ; les arbres
  for (const x of [-1.38, -0.75, 0.95]) lamp(p, people, a, x, 0.8, 0.36);
  bench(p, -0.86, 0.42, PI / 2, c.wood); bench(p, 0.36, 0.45, PI, c.wood);
  p.add(new THREE.TorusGeometry(0.035, 0.012, 3, 8), 1.42, qy + 0.12, 0.92, 0xd84a3e, PI / 2);
  p.box(0.01, 0.14, 0.01, 1.42, qy, 0.92, c.metal);
  p.box(0.08, 0.16, 0.02, -1.42, qy, 0.95, c.metal); p.cyl(0.03, 0.04, 0.05, 8, -1.42, qy + 0.11, 0.97, O.gold);
  for (const [x, z, s] of [[-1.3, -1.3, 0], [-1.3, -0.5, 1], [0.3, -0.25, 2], [1.25, -0.4, 3]] as const) tree(p, people, x, z, 0.72, s + 1);
  shrub(p, 0.56, -0.26, 0.05, 4);
  if (people === 'asie') for (const x of [-0.85, 0.25]) lantern(p, x, 0.34, -0.4, 0.024);
}

// =====================================================================================================================
// La halle des échanges (2 × 2, Industriel au Futuriste)
// =====================================================================================================================

/** Un étal : table, toile ou auvent, marchandises (épices en tas, rouleaux d'étoffe, sacs, caisses), son marchand */
function stall(p: Parts, kit: ConcessionKit, people: People, age: number, x: number, z: number, ry: number, k: number) {
  const c = pal(people, age), g = new Fr(p, x, z, ry), cloth = people === 'orient' ? pick([0xc7563e, 0xd9a43c, 0x2f6e6a, 0x8a4f7a], k) : pick([0xb8402f, 0x3f7262, 0xd8b04a, 0x4a5a74], k);
  g.box(0.26, 0.07, 0.12, 0, 0, 0, age >= 5 ? c.trim : c.wood);
  g.box(0.27, 0.012, 0.13, 0, 0.07, 0, age >= 4 ? c.trim : dark(c.wood, 0.8));
  if (age >= 5) g.box(0.272, 0.008, 0.132, 0, 0.06, 0, c.neon, 'neon');
  const kind = k % 4;
  if (kind === 0) for (let i = 0; i < 4; i++) g.cone(0.03, 0.04, 6, -0.09 + i * 0.06, 0.082, 0, pick([0xd8902a, 0xb8402a, 0xe0c040, 0x7a5a3a], i + k));
  else if (kind === 1) for (let i = 0; i < 4; i++) g.add(new THREE.CylinderGeometry(0.018, 0.018, 0.11, 6).rotateX(PI / 2), -0.09 + i * 0.06, 0.1, 0, pick([0xc0392e, 0x2f7a5a, 0xe8c04a, 0x6a4a9a], i + k));
  else if (kind === 2) for (let i = 0; i < 3; i++) sack(p, g.X(-0.08 + i * 0.08, 0), g.Z(-0.08 + i * 0.08, 0), pick([0x8a5a3a, 0xd8c8a0, 0x5a3a2a], i), 0.075);
  else for (let i = 0; i < 3; i++) g.box(0.06, 0.05, 0.07, -0.08 + i * 0.08, 0.075, 0, pick([0x9a7a5a, 0xc8a070, 0x6a8a4a], i));
  // la toile ou l'auvent au-dessus
  for (const s of [-1, 1]) g.box(0.01, 0.26, 0.01, s * 0.12, 0, -0.05, c.metal);
  g.add(new THREE.BoxGeometry(0.3, 0.008, 0.18).rotateX(-0.2), 0, 0.27, 0.0, age >= 5 ? c.glass : cloth, age >= 5);
  who(p, kit, g.X(0, -0.12), g.Z(0, -0.12), people === 'orient' ? pick([0xf2ece0, 0xd8b47a, 0x2fa8a0], k) : pick([0x24201e, 0x3f7262, 0xb8402f], k), ry);
}

/**
 * La halle des échanges : la halle couverte (arcades à coupoles chez les Orientaux, grande salle à double toit courbe sur
 * colonnes laquées chez les Asiatiques ; fer et verre à l'Industriel, béton au Moderne, coque blanche au Futuriste), ses
 * étals, le tableau des cours au fond et son horloge, la balance publique, nos deux drapeaux à l'entrée, la charrette, la
 * camionnette ou le chariot volant, les acheteurs
 */
export function exchangeHall(p: Parts, age: number, people: People, kit: ConcessionKit) {
  const a = Math.min(5, Math.max(3, age)), c = pal(people, a), or = people === 'orient';
  const hx = 0, hz = -0.3, W = 1.6, D = 1.1, H = 0.46, x0 = hx - W / 2, z0 = hz - D / 2, z1 = hz + D / 2;
  tiles(p, x0, z0, x0 + W, z1, 0.2, c.ground, c.ground2);
  // le mur du fond et ses deux retours
  p.box(W, H, 0.06, hx, 0, z0 + 0.03, c.wall);
  for (const s of [-1, 1]) p.box(0.06, H, 0.36, hx + s * (W / 2 - 0.03), 0, z0 + 0.18, c.wall);
  // le tableau des cours : panneau sombre, lignes allumées (vertes et rouges), horloge au-dessus
  const B = new Face(p, 0, hx, z0 + 0.06);
  B.plane(0.9, 0.24, 0, 0.24, 0.004, a === 3 ? 0x2a3a30 : 0x1a1e24);
  B.plane(0.94, 0.28, 0, 0.24, 0.002, c.trim);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) {
    const col = a === 3 ? 0xf4f0e0 : k === 2 ? (r % 2 ? 0x4ae07a : 0xff5a4a) : a >= 5 ? c.neon : 0xffc060;
    B.plane(k === 0 ? 0.3 : 0.16, 0.022, -0.24 + k * 0.26, 0.15 + r * 0.04, 0.007, col, a === 3 ? false : a >= 5 ? 'neon' : true);
  }
  if (a === 3) for (const s of [-1, 1]) { B.box(0.006, 0.006, 0.06, s * 0.4, 0.4, 0.03, c.metal); B.box(0.03, 0.03, 0.03, s * 0.4, 0.37, 0.06, 0xffe2a0, true); }
  B.add(new THREE.CircleGeometry(0.06, 12), 0, H + 0.08, 0.01, 0xf6f0e0, true);
  B.add(new THREE.RingGeometry(0.06, 0.075, 12), 0, H + 0.08, 0.012, O.gold);
  B.plane(0.008, 0.045, 0, H + 0.1, 0.014, 0x2a2a2e); B.plane(0.035, 0.008, 0.014, H + 0.08, 0.014, 0x2a2a2e);
  p.box(0.2, 0.18, 0.06, hx, H - 0.02, z0 + 0.03, c.wall);
  // les supports du toit : colonnes de fonte, piliers de béton, fûts blancs
  const nx = 4, nz = 3;
  for (let i = 0; i <= nx; i++) for (let j = 1; j <= nz; j++) {
    const x = x0 + 0.04 + (i * (W - 0.08)) / nx, z = z0 + (j * D) / nz - (j === nz ? 0.04 : 0);
    if (or && a === 3) { p.add(new THREE.CylinderGeometry(0.03, 0.035, H, 6, 1, true).translate(0, H / 2, 0), x, 0, z, c.trim); p.box(0.07, 0.04, 0.07, x, H - 0.04, z, c.trim); }
    else if (!or && a === 3) { if (j === nz) p.box(0.06, 0.02, 0.06, x, 0, z, A.stone); p.add(new THREE.CylinderGeometry(0.022, 0.025, H, 6, 1, true).translate(0, H / 2, 0), x, 0, z, A.red); }
    else p.add(new THREE.CylinderGeometry(0.022, 0.03, H, 6, 1, true).translate(0, H / 2, 0), x, 0, z, a >= 5 ? c.trim : c.metal);
  }
  if (or) {
    // arcades en arc brisé sur la façade et les flancs, toit en terrasse, coupoles percées (puis dorées, puis de verre)
    const Fz = new Face(p, 0, hx, z1);
    for (let i = 0; i < nx; i++) {
      const u = -W / 2 + 0.04 + ((i + 0.5) * (W - 0.08)) / nx, bw = (W - 0.08) / nx;
      // le haut de chaque arcade : un bandeau de mur percé d'un arc brisé (l'ombre de l'arc, son encadrement de couleur)
      Fz.plane(bw, 0.2, u, H - 0.1, 0.0, c.wall);
      bay(Fz, u, H - 0.2, bw - 0.07, 0.16, 'pointed', 0x5a4a3a, { frame: c.accent, seg: 4 });
    }
    p.box(W + 0.04, 0.05, D + 0.04, hx, H, hz, c.trim);
    p.box(W, 0.06, D, hx, H - 0.06, hz, c.wall);
    mosaic(Fz, 0, W - 0.04, H - 0.02, 0.04, a >= 4 ? [c.accent, O.white, O.gold] : [O.turq, O.white, O.cobalt]);
    if (a === 3) for (let i = 0; i < 3; i++) { const x = hx - 0.5 + i * 0.5; p.add(new THREE.CylinderGeometry(0.17, 0.18, 0.06, 8, 1, true).translate(0, 0.03, 0), x, H + 0.05, hz, c.wall); dome(p, 0.17, 0.14, x, H + 0.11, hz, i === 1 ? O.turq : O.white, 'half', 8); p.box(0.03, 0.02, 0.03, x, H + 0.25, hz, 0xffe2a0, 0, true); }
    else if (a === 4) { for (let i = 0; i < 3; i++) { const x = hx - 0.5 + i * 0.5; dome(p, 0.2, 0.1, x, H + 0.05, hz, O.gold, 'saucer', 8); p.add(new THREE.TorusGeometry(0.2, 0.012, 3, 10).rotateX(PI / 2), x, H + 0.05, hz, c.glass, 0, true); } }
    else { p.cyl(0.36, 0.38, 0.06, 12, hx, H + 0.05, hz, c.wall); dome(p, 0.34, 0.26, hx, H + 0.11, hz, O.glass, 'persian', 12, true); p.add(new THREE.TorusGeometry(0.39, 0.012, 3, 14).rotateX(PI / 2), hx, H + 0.1, hz, c.neon, 0, 'neon'); finial(p, hx, H + 0.37, hz, 0.8); }
    for (const s of [-1, 1]) merlons(new Face(p, s * PI / 2, hx + s * (W / 2 + 0.02), hz), D, H + 0.05, c.wall, 'tooth', 0.3, 0.04, 0.03);
  } else {
    // la grande salle : poutre peinte, toit courbe, lanterneau à second toit (Industriel), puis toit de béton, puis coque
    p.box(W + 0.04, 0.06, D + 0.04, hx, H - 0.06, hz, a === 3 ? A.beam : a === 4 ? c.accent : c.trim);
    p.box(W + 0.05, 0.012, D + 0.05, hx, H - 0.04, hz, A.gold);
    hipRoof(p, W + 0.24, D + 0.24, a === 4 ? 0.16 : 0.34, hx, H, hz, c.roof, 0, { lod: true, rows: a === 4 ? 0 : 1, step: 0.13, hips: a !== 4, ...(a >= 5 ? { glow: 'neon' as Glow, edge: c.neon, t: 0.02 } : {}) });
    if (a !== 4) { p.box(0.5, 0.1, 0.24, hx, H + 0.3, hz, a >= 5 ? c.glass : A.paper, 0, true); hipRoof(p, 0.72, 0.42, 0.16, hx, H + 0.4, hz, c.roof, 0, { lod: true, rows: 0 }); }
    for (const s of [-1, 1]) for (const z of [z1 - 0.02]) lantern(p, hx + s * 0.5, H - 0.12, z, 0.03);
  }
  // les étals, deux rangées tournées vers l'allée du milieu
  // (le fond reste libre devant le tableau des cours)
  for (const s of [-1, 1]) stall(p, kit, people, a, hx + s * 0.56, hz - 0.32, 0, s + 1);
  for (let i = 0; i < 3; i++) stall(p, kit, people, a, hx - 0.56 + i * 0.56, i === 1 ? hz + 0.3 : hz + 0.36, PI, i + 3);
  // les lanternes pendues sous le toit, allumées la nuit
  for (const s of [-1, 1]) for (const z of [hz - 0.3, hz + 0.1]) {
    p.box(0.004, 0.1, 0.004, hx + s * 0.2, H - 0.16, z, 0x3a3a3e);
    if (or) { p.cyl(0.022, 0.016, 0.05, 6, hx + s * 0.2, H - 0.21, z, 0xffe2a0, true); p.cone(0.026, 0.03, 6, hx + s * 0.2, H - 0.16, z, O.gold); }
    else lantern(p, hx + s * 0.2, H - 0.2, z, 0.026);
  }
  // la balance publique au milieu, les acheteurs, nos marchands
  p.cyl(0.04, 0.05, 0.03, 8, hx, 0, hz + 0.08, c.trim); p.cyl(0.008, 0.008, 0.22, 4, hx, 0.03, hz + 0.08, O.gold);
  p.box(0.2, 0.008, 0.008, hx, 0.25, hz + 0.08, O.gold);
  for (const s of [-1, 1]) { p.box(0.002, 0.06, 0.002, hx + s * 0.09, 0.19, hz + 0.08, 0x3a3a3e); p.cyl(0.035, 0.025, 0.012, 8, hx + s * 0.09, 0.18, hz + 0.08, O.gold); }
  who(p, kit, hx + 0.14, hz + 0.1, TEAM_A, -PI / 2); who(p, kit, hx - 0.15, hz + 0.06, pal(people, a).flag, PI / 2, { pose: 'cheer' });
  who(p, kit, hx + 0.3, hz + 0.0, 0x3a5a9a, PI); who(p, kit, hx - 0.25, hz - 0.02, 0xd8a03a, 0.3);
  // le parvis : nos deux drapeaux, les réverbères, la charrette (puis la camionnette, puis le chariot volant)
  tiles(p, -0.36, z1 + 0.02, 0.36, 0.94, 0.18, c.ground2, c.ground);
  twoFlags(p, kit, people, 0, 0.78, 0.66, 0.5, c.metal);
  for (const s of [-1, 1]) lamp(p, people, a, s * 0.44, 0.84, 0.34);
  if (a === 3) {
    const g = new Fr(p, 0.68, 0.6, -0.4);
    g.box(0.2, 0.06, 0.3, 0, 0.07, 0, 0x8a6a4a);
    for (const s of [-1, 1]) { g.add(new THREE.TorusGeometry(0.06, 0.01, 3, 8).rotateY(PI / 2), s * 0.11, 0.06, 0.02, 0x5a4636); g.box(0.008, 0.008, 0.2, s * 0.04, 0.07, 0.24, 0x7a5a40); }
    for (let i = 0; i < 3; i++) sack(p, g.X(-0.05 + i * 0.05, 0), g.Z(-0.05 + i * 0.05, 0), pick([0xd8c8a0, 0xc8b890], i), 0.13);
  } else if (a === 4) {
    const g = new Fr(p, 0.66, 0.6, -PI / 2);
    g.box(0.18, 0.14, 0.16, 0, 0.04, 0.16, people === 'orient' ? 0xe8e4dc : 0xc0442a); g.box(0.172, 0.06, 0.004, 0, 0.12, 0.242, 0x2a3a4a, true);
    g.box(0.2, 0.18, 0.3, 0, 0.04, -0.07, 0xe8e4dc); g.box(0.204, 0.05, 0.25, 0, 0.12, -0.07, c.accent);
    for (const s of [-1, 1]) for (const z of [0.16, -0.15]) g.add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 7).rotateZ(PI / 2), s * 0.09, 0.035, z, 0x222226);
  } else {
    p.add(new THREE.CapsuleGeometry(0.06, 0.18, 3, 8).rotateZ(PI / 2), 0.66, 0.24, 0.6, 0xf4f6f8);
    p.box(0.16, 0.04, 0.125, 0.66, 0.24, 0.6, c.glass, 0, true);
    p.box(0.3, 0.008, 0.02, 0.66, 0.16, 0.6, c.neon, 0, 'neon');
    p.cyl(0.08, 0.1, 0.008, 10, 0.66, 0, 0.6, 0x2a2a30);
  }
  // les arbres, les bacs, les acheteurs sur le parvis
  tree(p, people, -0.82, 0.6, 0.6, 1); tree(p, people, 0.84, 0.88, 0.5, 2);
  for (const s of [-1, 1]) shrub(p, s * 0.86, 0.12, 0.05, s + 2);
  // (seconde passe) le porteur et son ballot, la pile de sacs à l'entrée, le panneau des horaires de la halle
  who(p, kit, 0.2, 0.62, people === 'orient' ? 0xd8b47a : 0x3f7262, -0.4, { pose: 'run' }); bale(p, 0.2, 0.62, 0xc8a070, 0.2, -0.4);
  for (let i = 0; i < 3; i++) sack(p, -0.5 + i * 0.07, 0.36, pick([0xd8c8a0, 0xc8b890, 0x8a5a3a], i));
  sack(p, -0.465, 0.36, 0xd8c8a0, 0.05);
  p.box(0.012, 0.24, 0.012, -0.36, 0, 0.42, c.metal); p.box(0.14, 0.1, 0.012, -0.36, 0.18, 0.42, a >= 5 ? 0x24303c : 0xf2e2b8, 0, a >= 5);
  for (let k = 0; k < 3; k++) p.box(0.1, 0.008, 0.004, -0.36, 0.2 + k * 0.025, 0.427, a >= 5 ? c.neon : 0x3a3030, 0, a >= 5 ? 'neon' : false);
  who(p, kit, -0.55, 0.6, 0xf2c23a, 0.4);
  for (let i = 0; i < 2; i++) crate(p, 0.3 + i * 0.12, 0.5, 0.08, pick([0x9a7a5a, 0xb8a070], i));
}

// =====================================================================================================================
// L'école commune (2 × 2, Industriel au Futuriste)
// =====================================================================================================================

/**
 * L'école commune : deux styles mêlés, une aile à notre style (à gauche) et une aile au style de l'allié (à droite), reliées
 * par le porche de la cloche (puis de l'horloge) sous nos deux drapeaux ; la cour commune, ses arbres des deux îles, la
 * marelle, les enfants des deux peuples qui jouent ensemble (la ronde, la corde, le ballon), les deux maîtres, la fontaine
 * à boire, la balançoire (Moderne)
 */
export function commonSchool(p: Parts, age: number, people: People, kit: ConcessionKit) {
  const a = Math.min(5, Math.max(3, age)), c = pal(people, a), o = ours(a), or = people === 'orient';
  // les deux ailes
  ourWing(p, kit, a, -0.54, -0.62, 0.72, 0.6, { floors: 2, fh: 0.26, door: 0.15 });
  const top = allyWing(p, people, a, 0.54, -0.62, 0.72, 0.6, { floors: 2, fh: 0.26, door: -0.15, mash: true });
  // le porche de liaison : la cloche ou l'horloge, nos deux drapeaux au-dessus
  const px = 0, pz = -0.6;
  p.box(0.34, 0.5, 0.4, px, 0, pz, a <= 3 ? 0xe8dcc8 : a === 4 ? 0xe6e2da : 0xf4f4f0);
  p.box(0.2, 0.26, 0.004, px, 0.05, pz + 0.2, 0x3a3030);
  p.box(0.36, 0.03, 0.42, px, 0.5, pz, c.trim);
  const P = new Face(p, 0, px, pz + 0.2);
  P.add(new THREE.CircleGeometry(0.055, 10), 0, 0.43, 0.004, 0xf6f0e0, a >= 4);
  P.add(new THREE.RingGeometry(0.055, 0.066, 10), 0, 0.43, 0.005, O.gold);
  P.plane(0.006, 0.04, 0, 0.445, 0.007, 0x2a2a2e); P.plane(0.03, 0.006, 0.012, 0.43, 0.007, 0x2a2a2e);
  // un rang de faïence à droite, nos briques ou nos colombages à gauche : les deux styles sur le porche même
  P.plane(0.16, 0.03, 0.09, 0.345, 0.004, or ? O.turq : A.red);
  P.plane(0.16, 0.03, -0.09, 0.345, 0.004, a <= 3 ? o.wall : o.accent);
  for (let i = 0; i < 3; i++) P.plane(0.02, 0.02, 0.04 + i * 0.05, 0.345, 0.007, or ? O.white : A.gold, false, PI / 4);
  if (a <= 3) {
    // le clocheton : quatre poteaux, la cloche qui se balance, un petit toit
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.02, 0.18, 0.02, px + sx * 0.09, 0.53, pz + sz * 0.09, o.accent);
    kit.sway([px, 0.68, pz], [1, 0, 0], 0.25, 0.6).cyl(0.02, 0.04, 0.06, 8, 0, -0.07, 0, O.gold);
    p.pyramid(0.26, 0.14, 0.26, px, 0.71, pz, o.roof);
  } else {
    p.box(0.12, 0.3, 0.12, px, 0.53, pz, a >= 5 ? c.glass : o.wall, 0, a >= 5);
    p.box(0.16, 0.02, 0.16, px, 0.83, pz, o.trim);
    if (a >= 5) p.add(new THREE.TorusGeometry(0.1, 0.006, 3, 10).rotateX(PI / 2), px, 0.86, pz, o.neon, 0, 'neon');
  }
  twoFlags(p, kit, people, px, pz + 0.22, 0.24, 0.24, c.metal, 0.8, 0.53);
  // la cour commune : dallage, marelle, la ronde, la corde à sauter, le ballon, les maîtres
  tiles(p, -0.9, -0.24, 0.9, 0.8, 0.24, a <= 3 ? 0xd8ccae : c.ground, a <= 3 ? 0xccc0a2 : c.ground2);
  for (let i = 0; i < 5; i++) p.add(new THREE.PlaneGeometry(0.07, 0.07).rotateX(-PI / 2), -0.25, 0.02, 0.0 + i * 0.085, 0xf8f6f0);
  p.add(new THREE.PlaneGeometry(0.07, 0.07).rotateX(-PI / 2), -0.29, 0.02, 0.26, 0xf8f6f0);
  const kc = [...CLOTH, troop(people, 3).coat];
  for (let k = 0; k < 5; k++) { const an = (k / 5) * PI * 2; kid(p, kit, 0.3 + Math.cos(an) * 0.1, 0.12 + Math.sin(an) * 0.1, pick(kc, k), -an - PI / 2, 'cheer'); }
  kid(p, kit, -0.5, 0.3, pick(kc, 5), PI / 2); kid(p, kit, -0.3, 0.3, pick(kc, 8), -PI / 2); kid(p, kit, -0.4, 0.3, pick(kc, 3), 0, 'run');
  p.add(new THREE.TorusGeometry(0.1, 0.003, 3, 10, PI), -0.4, 0.02, 0.3, 0xe8dcc0);
  kid(p, kit, 0.1, 0.5, pick(kc, 1), -0.6, 'run'); kid(p, kit, 0.26, 0.56, pick(kc, 6), 2.4, 'run');
  p.sphere(0.022, 0.18, 0.034, 0.52, 0xd84a3e);
  who(p, kit, -0.2, -0.16, a <= 3 ? 0x1e1e24 : 0x3a4a6a, 0.2); who(p, kit, 0.6, -0.16, troop(people, 3).coat, -0.3);
  // la fontaine à boire, les cartables, le banc ; la balançoire et le toboggan (Moderne)
  p.cyl(0.04, 0.05, 0.12, 8, -0.05, 0, 0.72, c.trim); p.box(0.01, 0.01, 0.03, -0.05, 0.13, 0.74, c.metal);
  for (const [x, z, col] of [[0.02, -0.18, 0x6a4a2a], [0.08, -0.16, 0x3a4a6a], [0.04, -0.12, 0x8a3a2a]] as const) p.box(0.04, 0.03, 0.015, x, 0.014, z, col, x * 10);
  bench(p, -0.55, 0.76, PI, c.wood); bench(p, 0.55, 0.76, PI, c.wood);
  if (a >= 4) {
    const sx = 0.66, sz = 0.42;
    for (const s of [-1, 1]) { tubeW(p, [sx + s * 0.14, 0, sz - 0.06], [sx + s * 0.14, 0.3, sz], 0.008, a >= 5 ? c.trim : 0xd84a3e); tubeW(p, [sx + s * 0.14, 0, sz + 0.06], [sx + s * 0.14, 0.3, sz], 0.008, a >= 5 ? c.trim : 0xd84a3e); }
    p.box(0.3, 0.012, 0.012, sx, 0.3, sz, a >= 5 ? c.neon : 0xd84a3e, 0, a >= 5 ? 'neon' : false);
    for (const s of [-1, 1]) { const sw = kit.swing ? kit.swing([sx + s * 0.06, 0.3, sz], [1, 0, 0], 0.4, 0.5) : kit.sway([sx + s * 0.06, 0.3, sz], [1, 0, 0], 0.2, 0.5); sw.box(0.003, 0.2, 0.003, -0.02, -0.2, 0, 0x5a5a60); sw.box(0.003, 0.2, 0.003, 0.02, -0.2, 0, 0x5a5a60); sw.box(0.06, 0.008, 0.03, 0, -0.21, 0, 0xf2c23a); }
    p.add(new THREE.BoxGeometry(0.06, 0.01, 0.3).rotateX(0.6), -0.72, 0.11, 0.32, 0x3c7fd8);
    p.box(0.06, 0.22, 0.06, -0.72, 0, 0.17, 0xf2c23a);
  } else {
    // le préau : la petite halle de bois à côté de notre aile
    for (const [x, z] of [[-0.86, 0.0], [-0.6, 0.0], [-0.86, 0.3], [-0.6, 0.3]]) p.box(0.025, 0.28, 0.025, x, 0, z, o.accent);
    p.add(new THREE.BoxGeometry(0.34, 0.02, 0.42), -0.73, 0.29, 0.15, o.roof, 0, false, -0.08);
  }
  // les arbres des deux îles : le nôtre à gauche, le leur à droite ; les massifs, les lanternes, la grille
  ourTree(p, -0.84, 0.62, 0.66); tree(p, people, 0.8, 0.1, 0.62, 1); tree(p, people, 0.84, 0.72, 0.5, 2);
  for (const x of [-0.25, 0.25]) shrub(p, x, -0.28, 0.04, Math.round(x * 8));
  for (let x = -0.92; x <= 0.92; x += 0.08) if (Math.abs(x) > 0.14) p.box(0.012, 0.1, 0.012, x, 0, 0.93, a >= 5 ? c.trim : 0x3a3a3e);
  for (const s of [-1, 1]) p.box(0.78, 0.01, 0.01, s * 0.53, 0.1, 0.93, a >= 5 ? c.neon : 0x3a3a3e, 0, a >= 5 ? 'neon' : false);
  for (const s of [-1, 1]) { p.box(0.05, 0.16, 0.05, s * 0.14, 0, 0.93, c.trim); if (s > 0 && !or && a <= 3) lantern(p, s * 0.14, 0.22, 0.93, 0.024); else p.sphere(0.022, s * 0.14, 0.18, 0.93, s > 0 ? (or ? O.gold : A.gold) : o.trim); }
  // (seconde passe) les jardinières fleuries sous nos fenêtres de l'étage, les dessins à la craie, les réverbères de la grille
  for (const u of [-0.207, 0, 0.207]) {
    p.box(0.1, 0.03, 0.03, -0.54 + u, 0.3, -0.305, a >= 4 ? o.trim : 0x8a5a3a);
    for (let k = 0; k < 3; k++) p.sphere(0.014, -0.54 + u - 0.03 + k * 0.03, 0.34, -0.305, k === 1 ? 0x6f9a4a : 0xd84a3e);
  }
  for (const [x, z, col, r] of [[0.0, 0.3, 0xf2c23a, 0.3], [0.06, 0.36, 0x86c4b8, -0.5], [-0.62, 0.1, 0xf1c9c4, 0.9]] as const) p.add(new THREE.PlaneGeometry(0.06, 0.04).rotateX(-PI / 2), x, 0.019, z, col, r);
  p.add(new THREE.CircleGeometry(0.03, 6).rotateX(-PI / 2), 0.0, 0.019, 0.22, 0xf2c23a);
  for (const s of [-1, 1]) lamp(p, people, a, s * 0.24, 0.86, 0.3);
  if (a >= 4) for (let i = 0; i < 3; i++) {
    // les vélos des maîtres et des grands, contre la grille
    const bx = -0.82 + i * 0.12, col = pick([0x3c7fd8, 0xd84a3e, 0x2a2a30], i);
    for (const dz of [-0.05, 0.05]) p.add(new THREE.TorusGeometry(0.028, 0.004, 3, 8), bx, 0.04, 0.86 + dz, 0x2a2a2e, PI / 2);
    p.box(0.006, 0.006, 0.1, bx, 0.06, 0.86, col); p.box(0.006, 0.03, 0.006, bx, 0.06, 0.83, col); p.box(0.03, 0.006, 0.006, bx, 0.09, 0.9, 0x2a2a2e);
  }
}

// =====================================================================================================================
// Le dispensaire (2 × 2, Industriel au Futuriste)
// =====================================================================================================================

/**
 * Le dispensaire, l'aide en cas de catastrophe : la petite maison de soins au style de l'allié et sa grande croix, le dépôt
 * des réserves (caisses marquées, sacs de grain, tonneaux d'eau, puis citerne), les tentes de secours, les brancards et leurs
 * blessés, la charrette à bras (puis le camion, puis le drone porteur), nos secouristes avec les infirmières alliées
 */
export function dispensary(p: Parts, age: number, people: People, kit: ConcessionKit) {
  const a = Math.min(5, Math.max(3, age)), c = pal(people, a), or = people === 'orient';
  const top = allyWing(p, people, a, -0.32, -0.6, 1.1, 0.6, { floors: a >= 4 ? 2 : 1, fh: 0.32, door: 0.15, band: true });
  const F = new Face(p, 0, -0.32, -0.3);
  crossSign(F, -0.22, (a >= 4 ? 0.68 : 0.36) - 0.1, 0.13, 0.012, a >= 4);
  // la grande croix sur le toit, lisible de loin
  if (or) { p.box(0.3, 0.01, 0.09, -0.32, top, -0.6, RED_CROSS); p.box(0.09, 0.011, 0.3, -0.32, top, -0.6, RED_CROSS); }
  // l'auvent de la porte et sa lanterne
  F.box(0.3, 0.02, 0.16, 0.15, 0.27, 0.08, a <= 3 ? c.wood : c.trim);
  for (const s of [-1, 1]) F.box(0.012, 0.27, 0.012, 0.15 + s * 0.13, 0, 0.15, a <= 3 ? c.wood : c.metal);
  if (people === 'asie' && a <= 3) lantern(p, -0.04, 0.2, -0.22, 0.022); else F.box(0.03, 0.04, 0.03, 0.15, 0.22, 0.03, 0xffe2a0, true);
  // le dépôt des réserves : caisses à croix, sacs, tonneaux d'eau (puis la citerne), sous un appentis
  const dx = 0.62, dz = -0.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.025, 0.32, 0.025, dx + sx * 0.25, 0, dz + sz * 0.22, c.wood);
  p.add(new THREE.BoxGeometry(0.6, 0.02, 0.54), dx, 0.33, dz, a <= 3 ? (or ? 0xd8c8a0 : A.tile) : a === 4 ? 0x8a9096 : c.trim, 0, false, 0, 0.1);
  if (a >= 5) p.box(0.6, 0.008, 0.008, dx, 0.32, dz + 0.27, c.neon, 0, 'neon');
  for (let r = 0; r < 2; r++) for (let i = 0; i < 3 - r; i++) crate(p, dx - 0.16 + i * 0.12 + r * 0.06, dz - 0.1, 0.1, a >= 5 ? 0xe8eaee : 0xb89a6a, r * 0.085, 0, RED_CROSS);
  for (let i = 0; i < 4; i++) sack(p, dx - 0.15 + i * 0.08, dz + 0.1, i % 2 ? 0xd8c8a0 : 0xc8b890, i > 1 ? 0.04 : 0, i);
  if (a === 3) for (let i = 0; i < 3; i++) barrel(p, dx + 0.2, dz - 0.15 + i * 0.08, 0x6a8ab0);
  else {
    // la citerne d'eau potable sur sa tour
    const tx = 0.86, tz = -0.12, th = 0.34;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.02, th, 0.02, tx + sx * 0.06, 0, tz + sz * 0.06, c.metal);
    p.cyl(0.1, 0.1, 0.16, 10, tx, th, tz, a === 4 ? 0x6a8ab0 : 0xf4f6f8);
    p.cone(0.11, 0.05, 10, tx, th + 0.16, tz, a === 4 ? c.metal : c.trim);
    if (a >= 5) p.add(new THREE.TorusGeometry(0.102, 0.006, 3, 12).rotateX(PI / 2), tx, th + 0.08, tz, c.neon, 0, 'neon');
    p.cyl(0.006, 0.006, th, 4, tx - 0.08, 0, tz + 0.06, 0x5a5a60); p.box(0.04, 0.012, 0.02, tx - 0.06, 0.08, tz + 0.08, 0x5a5a60);
  }
  // les tentes de secours (toile à croix, puis tente moderne, puis bulle)
  for (const [x, z, k] of [[-0.55, 0.42, 0], [0.12, 0.62, 1]] as const) {
    if (a === 3) {
      p.add(new THREE.CylinderGeometry(0.001, 0.2, 0.22, 4, 1, true).rotateY(PI / 4).scale(1.3, 1, 0.9).translate(0, 0.11, 0), x, 0, z, or ? 0xeee6d4 : 0xe8dcc0);
      p.cyl(0.004, 0.004, 0.3, 4, x, 0, z, O.darkwood);
      kit.sway([x, 0.3, z], [0, 1, 0], 0.4, 1 + k * 0.1).box(0.06, 0.04, 0.003, 0.03, -0.04, 0, k ? TEAM_FLAG : c.flag);
      p.box(0.05, 0.05, 0.004, x, 0.08, z + 0.135, RED_CROSS);
    } else if (a === 4) {
      p.add(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 8, 1, false, 0, PI).rotateZ(PI / 2), x, 0, z, 0xe8e6e0);
      for (let i = 0; i < 3; i++) p.add(new THREE.TorusGeometry(0.133, 0.005, 3, 6, PI).rotateY(PI / 2), x - 0.12 + i * 0.12, 0, z, 0x9a9a90);
      crossSign(new Face(p, PI / 2, x + 0.18, z), 0, 0.07, 0.06, 0.001);
    } else {
      p.add(new THREE.SphereGeometry(0.17, 10, 5, 0, PI * 2, 0, PI / 2).scale(1, 0.85, 1), x, 0, z, 0xf4f6f8);
      p.add(new THREE.TorusGeometry(0.17, 0.006, 3, 14).rotateX(PI / 2), x, 0.012, z, c.neon, 0, 'neon');
      crossSign(new Face(p, 0, x, z + 0.155), 0, 0.08, 0.06, 0, true);
    }
  }
  // les brancards et leurs blessés, les secouristes (les nôtres et les infirmières alliées)
  stretcher(p, -0.2, 0.2, PI / 2, 0.0); stretcher(p, 0.4, 0.3, 0.3, 0.0, 0xc8a070);
  stretcher(p, -0.05, -0.08, PI / 2, 0.075, 0x8aa070);
  who(p, kit, -0.21, -0.08, TEAM_A, -PI / 2); who(p, kit, 0.11, -0.08, c.flag, PI / 2);
  const nurse = 0xf8f8f6;
  who(p, kit, -0.25, 0.32, nurse, PI); who(p, kit, 0.5, 0.42, TEAM_A, -2.4); who(p, kit, 0.3, 0.15, nurse, 0.4);
  who(p, kit, -0.72, 0.15, 0x9ab0c8, 0.6, { sit: true });
  // la charrette à bras, puis le camion de secours, puis le drone porteur
  if (a === 3) {
    const g = new Fr(p, 0.62, 0.62, -0.6);
    g.box(0.18, 0.05, 0.26, 0, 0.06, 0, 0x8a6a4a);
    for (const s of [-1, 1]) { g.add(new THREE.TorusGeometry(0.055, 0.008, 3, 8).rotateY(PI / 2), s * 0.1, 0.055, 0, 0x5a4636); g.box(0.008, 0.008, 0.2, s * 0.06, 0.08, 0.22, 0x7a5a40); }
    crate(p, g.X(0, -0.04), g.Z(0, -0.04), 0.09, 0xb89a6a, 0.11, -0.6, RED_CROSS);
  } else if (a === 4) {
    const g = new Fr(p, 0.62, 0.66, -PI / 2);
    g.box(0.18, 0.14, 0.16, 0, 0.04, 0.2, 0xf6f6f2); g.box(0.172, 0.06, 0.004, 0, 0.12, 0.282, 0x2a3a4a, true);
    g.box(0.2, 0.17, 0.36, 0, 0.04, -0.06, 0xf6f6f2); g.box(0.204, 0.03, 0.364, 0, 0.11, -0.06, RED_CROSS);
    g.box(0.05, 0.02, 0.05, 0, 0.18, 0.2, 0xff7a3a, true);
    for (const s of [-1, 1]) for (const z of [0.2, -0.15]) g.add(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 7).rotateZ(PI / 2), s * 0.1, 0.035, z, 0x222226);
  } else {
    const dy = 0.46, x = 0.6, z = 0.62;
    p.box(0.1, 0.03, 0.1, x, dy, z, 0xf4f6f8); p.box(0.104, 0.008, 0.104, x, dy, z, c.neon, 0, 'neon');
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { p.box(0.08, 0.008, 0.008, x + sx * 0.04, dy + 0.02, z + sz * 0.04, 0xdfe4e8, sx * sz * PI / 4); kit.turn([x + sx * 0.075, dy + 0.035, z + sz * 0.075], [0, 1, 0], 3).box(0.08, 0.003, 0.014, 0, 0, 0, 0xc8ccd0); }
    p.box(0.003, 0.1, 0.003, x, dy - 0.1, z, 0x5a5a60);
    crate(p, x, z, 0.08, 0xe8eaee, dy - 0.17, 0, RED_CROSS);
  }
  // le puits ou la pompe, nos deux drapeaux, les arbres, l'éclairage
  const wx = -0.82, wz = -0.14;
  if (a === 3) { p.cyl(0.07, 0.075, 0.08, 8, wx, 0, wz, or ? O.stone : A.stone); p.cyl(0.058, 0.058, 0.082, 8, wx, 0, wz, 0x3a4a50); for (const s of [-1, 1]) p.box(0.012, 0.18, 0.012, wx + s * 0.07, 0.08, wz, c.wood); p.box(0.16, 0.012, 0.012, wx, 0.26, wz, c.wood); }
  else { p.box(0.05, 0.12, 0.05, wx, 0, wz, c.metal); p.box(0.012, 0.012, 0.05, wx, 0.1, wz + 0.03, c.metal); p.cyl(0.05, 0.05, 0.03, 8, wx, 0, wz + 0.08, c.trim); }
  twoFlags(p, kit, people, -0.78, 0.82, 0.56, 0.16, c.metal);
  tree(p, people, 0.8, 0.8, 0.55, 1); tree(p, people, 0.3, -0.2, 0.5, 2); tree(p, people, 0.84, 0.34, 0.45, 4);
  // (seconde passe) la cuisine de campagne et sa marmite qui fume, le cuisinier ; la file des gens aux seaux ; les couvertures
  // pliées ; l'avis placardé près de la porte
  p.cyl(0.06, 0.05, 0.07, 8, -0.5, 0.05, 0.04, 0x3a3a3e); p.cyl(0.062, 0.062, 0.006, 8, -0.5, 0.12, 0.04, 0xc8a060);
  for (let k = 0; k < 4; k++) p.box(0.04, 0.05, 0.04, -0.5 + Math.cos(k * PI / 2) * 0.07, 0, 0.04 + Math.sin(k * PI / 2) * 0.07, 0x8a8a84, k * 0.4);
  p.cone(0.04, 0.05, 5, -0.5, 0.0, 0.04, 0xffa040, true); kit.smoke(-0.5, 0.16, 0.04, 1);
  who(p, kit, -0.4, 0.1, c.flag, -2.2);
  for (const [x, z, col] of [[0.1, 0.04, 0x3a5a9a], [0.2, 0.08, 0xd8a03a]] as const) { who(p, kit, x, z, col, -2.47); p.cyl(0.018, 0.014, 0.03, 6, x + 0.04, 0.03, z - 0.01, 0x8a9096); }
  for (let i = 0; i < 4; i++) p.box(0.12, 0.018, 0.08, 0.52, i * 0.018, -0.3, pick([0x8a5a3a, 0x3a5a7a, 0x6a8a4a, 0xc8a070], i), 0.08 * (i % 2));
  F.plane(0.14, 0.12, 0.42, 0.15, 0.006, 0xf2ece0); for (let k = 0; k < 4; k++) F.plane(0.1, 0.008, 0.42, 0.11 + k * 0.025, 0.008, 0x3a3030);
  for (const x of [-0.45, 0.25]) lamp(p, people, a, x, 0.92, 0.3);
  shrub(p, -0.92, 0.5, 0.05, 3);
}

// =====================================================================================================================
// Le centre de recherche commun (2 × 2, Moderne et Futuriste)
// =====================================================================================================================

/**
 * Le centre de recherche commun : notre aile de laboratoires (béton et bandeaux vitrés) et l'aile de l'allié (arcs
 * vitrés et coupole d'observatoire, ou toit courbe et observatoire), reliées par une verrière ; le mât des transmissions,
 * la grande antenne parabolique qui pivote, la serre des essais, la station météo, les chercheurs en blouse, le robot
 * (Futuriste), nos deux drapeaux
 */
export function researchCenter(p: Parts, age: number, people: People, kit: ConcessionKit) {
  const a = Math.min(5, Math.max(4, age)), c = pal(people, a), o = ours(a), or = people === 'orient';
  const ot = ourWing(p, kit, a, -0.58, -0.58, 0.74, 0.66, { floors: 2, fh: 0.28, door: 0.1 });
  const at = allyWing(p, people, a, 0.58, -0.58, 0.74, 0.66, { floors: 2, fh: 0.28, door: -0.1, roof: or ? undefined : false });
  // la verrière qui les relie : toit de verre à deux pans sur fermes blanches
  const vx = 0, vz = -0.52, vw = 0.42, vd = 0.56, vh = 0.36;
  p.box(vw, vh, vd, vx, 0, vz, c.glass, 0, true);
  for (let k = 0; k < 4; k++) p.box(0.012, vh, vd + 0.004, vx - vw / 2 + 0.01 + k * (vw - 0.02) / 3, 0, vz, o.trim);
  p.gable(vd + 0.04, 0.14, vw + 0.04, vx, vh, vz, c.glass, PI / 2);
  for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.012, 0.012, vw * 0.62).rotateX(0.0), vx, vh + 0.07, vz - vd / 2 + k * vd / 3, o.trim, PI / 2);
  p.box(0.014, 0.016, vd + 0.04, vx, vh + 0.135, vz, o.trim);
  if (a >= 5) p.box(vw + 0.01, 0.01, vd + 0.01, vx, vh, vz, o.neon, 0, 'neon');
  // l'observatoire sur l'aile de l'allié : tambour, coupole fendue (blanche, puis de verre à liseré)
  const ox = 0.62, oz = -0.66, ory = or ? at : at + 0.06;
  p.cyl(0.18, 0.18, 0.1, 10, ox, ory, oz, c.wall);
  p.add(new THREE.SphereGeometry(0.18, 10, 5, 0, PI * 2, 0, PI / 2), ox, ory + 0.1, oz, a >= 5 ? c.glass : 0xf2f2f0, 0, a >= 5);
  p.box(0.05, 0.18, 0.012, ox, ory + 0.12, oz + 0.15, 0x2a2a30, 0.4, false, -0.5);
  if (!or) { hipRoof(p, 0.84, 0.78, 0.1, 0.58, at, -0.58, c.roof, 0, { lod: true, rows: 0, hips: false, ...(a >= 5 ? { glow: 'neon' as Glow, edge: c.neon, t: 0.02 } : {}) }); for (const s of [-1, 1]) lantern(p, 0.58 + s * 0.3, 0.3, -0.2, 0.022); }
  if (a >= 5) p.add(new THREE.TorusGeometry(0.19, 0.008, 3, 12).rotateX(PI / 2), ox, ory + 0.1, oz, c.neon, 0, 'neon');
  // le mât des transmissions sur notre aile : treillis, haubans, feux
  const mx = -0.78, mz = -0.78, mh = 0.9;
  for (const [dx, dz] of [[-0.04, -0.04], [0.04, -0.04], [0, 0.04]]) tubeW(p, [mx + dx, ot, mz + dz], [mx, ot + mh, mz], 0.006, 0xd84a3e, false, 3);
  for (let k = 1; k < 4; k++) p.cyl(0.04 * (1 - k / 4), 0.04 * (1 - k / 4), 0.008, 3, mx, ot + k * mh / 4, mz, 0xf2f2f0);
  p.box(0.024, 0.024, 0.024, mx, ot + mh, mz, 0xff3a2a, 0, true);
  p.box(0.02, 0.02, 0.02, mx, ot + mh * 0.5, mz, 0xff3a2a, 0, true);
  // la grande antenne parabolique sur son socle : elle pivote lentement
  const dx = 0.62, dz = 0.42;
  p.cyl(0.07, 0.09, 0.08, 8, dx, 0, dz, c.trim);
  p.cyl(0.025, 0.03, 0.18, 6, dx, 0.08, dz, o.trim);
  const dish = kit.swing ? kit.swing([dx, 0.26, dz], [0, 1, 0], 0.7, 0.04) : kit.sway([dx, 0.26, dz], [0, 1, 0], 0.4, 0.05);
  dish.add(new THREE.SphereGeometry(0.22, 12, 4, 0, PI * 2, 0, PI / 3.2).rotateX(PI).rotateX(-0.9), 0, 0.12, 0, 0xf4f4f0);
  dish.add(new THREE.SphereGeometry(0.22, 12, 4, 0, PI * 2, 0, PI / 3.2).rotateX(-0.9), 0, 0.12, -0.004, 0xdcdcd8);
  tubeW(dish, [0, 0.0, 0], [0, 0.12, 0.0], 0.02, o.trim, false, 6);
  for (const s of [-1, 1]) tubeW(dish, [s * 0.1, 0.18, 0.06], [0, 0.28, 0.2], 0.004, 0x8a9096, false, 3);
  dish.box(0.03, 0.03, 0.03, 0, 0.27, 0.19, a >= 5 ? c.neon : 0x3a3a3e, 0, a >= 5 ? 'neon' : false);
  // la serre des essais : vitrage sur ossature, rangs de plantes, allumée la nuit
  const gx = -0.6, gz = 0.36;
  p.box(0.5, 0.04, 0.34, gx, 0, gz, o.trim);
  p.box(0.48, 0.2, 0.32, gx, 0.04, gz, 0xbfe0ee, 0, true);
  p.gable(0.48, 0.1, 0.32, gx, 0.24, gz, 0xbfe0ee);
  for (let k = 0; k < 5; k++) p.box(0.008, 0.3, 0.33, gx - 0.24 + k * 0.12, 0.04, gz, o.trim);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) p.sphere(0.035, gx - 0.17 + k * 0.11, 0.09, gz - 0.07 + r * 0.14, pick([0x6f9a4a, 0x8ab060, 0x50783a], k + r), 0, 0.8);
  // la station météo : mât, anémomètre qui tourne, girouette ; les panneaux solaires (Futuriste)
  p.cyl(0.006, 0.006, 0.42, 4, -0.15, 0, 0.62, c.metal);
  { const an = kit.turn([-0.15, 0.43, 0.62], [0, 1, 0], 1.2); for (let k = 0; k < 3; k++) { const t2 = (k / 3) * PI * 2; an.box(0.05, 0.004, 0.004, Math.cos(t2) * 0.025, 0, -Math.sin(t2) * 0.025, 0x8a9096, t2); an.sphere(0.01, Math.cos(t2) * 0.05, 0, -Math.sin(t2) * 0.05, 0xf4f4f0); } }
  p.box(0.08, 0.06, 0.06, -0.15, 0.06, 0.62, 0xf4f4f0);
  if (a >= 5) for (let i = 0; i < 3; i++) { p.box(0.02, 0.08, 0.02, 0.3 + i * 0.16, 0, 0.86, c.metal); p.add(new THREE.BoxGeometry(0.14, 0.008, 0.1).rotateX(-0.5), 0.3 + i * 0.16, 0.09, 0.86, 0x24406a); }
  // les chercheurs en blouse, le nôtre et le leur, le robot (Futuriste) ; nos deux drapeaux, les arbres, l'éclairage
  const coat = 0xf4f4f0;
  who(p, kit, -0.1, 0.2, coat, -0.8); who(p, kit, 0.06, 0.12, coat, 2.2, { hair: 0x1e1e22 });
  who(p, kit, 0.4, 0.4, coat, PI / 2); who(p, kit, -0.5, 0.06, TEAM_A, 0.2);
  if (a >= 5) { p.cyl(0.04, 0.05, 0.1, 8, 0.2, 0, 0.5, 0xe8eaee); p.sphere(0.04, 0.2, 0.14, 0.5, 0xf4f6f8); p.box(0.05, 0.012, 0.01, 0.2, 0.14, 0.535, c.neon, 0, 'neon'); }
  else { p.box(0.16, 0.08, 0.08, 0.12, 0, 0.36, c.trim); p.box(0.12, 0.06, 0.004, 0.12, 0.08, 0.36, 0x2a3a4a, 0, true); }
  tiles(p, -0.28, -0.16, 0.28, 0.94, 0.16, c.ground, c.ground2);
  twoFlags(p, kit, people, 0.0, 0.84, 0.6, 0.2, c.metal);
  tree(p, people, 0.8, 0.0, 0.58, 1); ourTree(p, -0.8, -0.08, 0.6); tree(p, people, 0.8, 0.8, 0.5, 2);
  lamp(p, people, a, -0.3, 0.92, 0.32); lamp(p, people, a, 0.86, 0.6, 0.32);
  for (const [x, z] of [[-0.92, 0.9], [-0.62, 0.66]] as const) shrub(p, x, z, 0.045, Math.round(x * 10));
  // (seconde passe) la lunette sur son trépied, les caissons du toit, le câble de l'antenne ; le ballon-sonde (Moderne) ou
  // l'éolienne du toit (Futuriste) ; la voiture du centre, puis la capsule
  for (let k = 0; k < 3; k++) tubeW(p, [0.28 + Math.cos(k * 2.1) * 0.05, 0, 0.22 + Math.sin(k * 2.1) * 0.05], [0.28, 0.14, 0.22], 0.004, 0x3a3a3e, false, 3);
  p.add(new THREE.CylinderGeometry(0.014, 0.02, 0.14, 6).rotateX(-0.7), 0.28, 0.17, 0.2, a >= 5 ? 0xf4f6f8 : 0x2a3a5a);
  for (const [x, z] of [[-0.75, -0.45], [-0.42, -0.72]] as const) { p.box(0.1, 0.06, 0.08, x, ot, z, 0xc8ccd0); p.cyl(0.025, 0.025, 0.012, 8, x, ot + 0.06, z, 0x8a9096); }
  tubeW(p, [dx - 0.06, 0.02, dz - 0.06], [0.42, 0.02, -0.22], 0.006, 0x2a2a30, false, 3);
  if (a === 4) {
    const bl = kit.sway([0.16, 0, 0.62], [1, 0, 0], 0.06, 0.3);
    bl.box(0.002, 0.82, 0.002, 0, 0, 0, 0xd8d8d0); bl.sphere(0.06, 0, 0.88, 0, 0xf4f4f0, 1); bl.box(0.03, 0.02, 0.03, 0, 0.8, 0, 0xd84a3e);
    const g = new Fr(p, -0.66, 0.82, PI / 2);
    g.box(0.15, 0.06, 0.3, 0, 0.03, 0, 0x3a6ab8); g.box(0.13, 0.05, 0.16, 0, 0.09, -0.02, 0x2a3a4a, true);
    for (const sx of [-1, 1]) for (const z of [-0.1, 0.1]) g.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 7).rotateZ(PI / 2), sx * 0.075, 0.03, z, 0x222226);
  } else {
    const mx2 = -0.42, mz2 = -0.42;
    p.cyl(0.006, 0.01, 0.3, 5, mx2, ot, mz2, o.trim);
    const rt = kit.turn([mx2, ot + 0.3, mz2 + 0.03], [0, 0, 1], 0.8);
    for (let k = 0; k < 3; k++) rt.add(new THREE.BoxGeometry(0.02, 0.14, 0.006).translate(0, 0.07, 0), 0, 0, 0, 0xf4f4f0, 0, false, (k * PI * 2) / 3);
    p.add(new THREE.CapsuleGeometry(0.05, 0.18, 2, 8).rotateZ(PI / 2), -0.66, 0.16, 0.82, 0xf4f6f8);
    p.box(0.14, 0.03, 0.105, -0.66, 0.17, 0.82, c.glass, 0, true); p.box(0.24, 0.006, 0.02, -0.66, 0.1, 0.82, c.neon, 0, 'neon');
  }
}
