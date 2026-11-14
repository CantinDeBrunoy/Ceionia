import * as THREE from 'three';
import { Parts } from './parts';
import { mergeLit } from './materials';
import type { People } from '../world/archipelago';
import type { TownKind } from '../world/rivalTown';
import { orientModel, orientWall } from './models/oriental';
import * as asian from './models/asian';
import { withState, type TownState } from './townRuins';

/**
 * Les modèles des villes des deux peuples rivaux (décor de l'archipel, voir `rivalTowns.ts` et `docs/iles.md`) : un jeu
 * propre à chaque peuple, de l'Antiquité au Futuriste, sans reprendre nos modèles. Les dessins sont dans `models/oriental.ts`
 * (`orientModel`, `orientWall`) et `models/asian.ts` ; ici, l'aiguillage, l'état de bataille (`townRuins.ts`) et le cache.
 * Mêmes conventions que `models.ts` : coordonnées locales au lot, origine au centre, façade vers +z, 1 = une case
 */

// ---------- Cache ----------

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * Géométrie (corps et lumières fondus, voir `mergeLit`) d'un lot de la ville, à l'âge `age` (1 à 5), intact, en ruine ou en
 * reconstruction (`townRuins.ts`)
 */
export function townModel(people: People, kind: TownKind, age: number, v: number, w: number, d: number, state: TownState = 'intact'): THREE.BufferGeometry {
  const a = Math.max(1, Math.min(5, age));
  const qw = Math.round(w * 5) / 5, qd = Math.round(d * 5) / 5;
  const vv = kind === 'house' || kind === 'workshop' ? v % 12 : kind === 'garden' || kind === 'field' ? v % 4 : v % 3;
  const key = `${people}|${kind}|${a}|${vv}|${qw}|${qd}|${state}`;
  let g = cache.get(key);
  if (g) return g;
  const p = new Parts();
  if (people === 'orient') orientModel(p, kind, a, vv, qw, qd);
  else switch (kind) {
    case 'house': asian.aHouse(p, a, vv, qw, qd); break;
    case 'workshop': asian.aWorkshop(p, a, vv, qw, qd); break;
    case 'temple': asian.aTemple(p, a, vv); break;
    case 'palace': asian.aPalace(p, a, vv); break;
    // le peuple asiatique n'a ni caravansérail ni bains : son marché, si l'on en demandait un
    case 'market': case 'caravan': case 'baths': asian.aMarket(p, a, vv); break;
    case 'teahouse': asian.aTeahouse(p, a, vv, qw, qd); break;
    case 'paifang': asian.aPaifang(p, a, vv, qw); break;
    case 'port': asian.aPort(p, a, vv); break;
    case 'garden': asian.aGarden(p, a, vv, qw, qd); break;
    case 'field': asian.aField(p, a, vv, qw, qd); break;
    case 'tower': asian.aTower(p, a, vv); break;
    case 'gate': asian.aGate(p, a, vv); break;
  }
  const built = p.build(), { body, glow } = withState(built.body, built.glow, state, vv * 13 + kind.length, false, people);
  g = mergeLit(body, glow) ?? body;
  cache.set(key, g);
  return g;
}

/** Pan de rempart (longueur arrondie au quart de case), intact, en ruine (brèches) ou en reconstruction ; `seed` varie les brèches */
export function townWall(people: People, age: number, len: number, state: TownState = 'intact', seed = 0): THREE.BufferGeometry {
  const a = Math.max(1, Math.min(5, age)), L = Math.max(0.25, Math.round(len * 4) / 4), sd = state === 'intact' ? 0 : seed % 4;
  const key = `${people}|wall|${a}|${L}|${state}|${sd}`;
  let g = cache.get(key);
  if (g) return g;
  const p = new Parts();
  if (people === 'orient') orientWall(p, a, L, 1.5);
  else asian.aWallPiece(p, a, L, 1.5);
  const built = p.build(false), { body, glow } = withState(built.body, built.glow, state, 101 + sd * 17, true, people);
  g = mergeLit(body, glow) ?? body;
  cache.set(key, g);
  return g;
}

/** Socle de pierre d'un lot en pente : une boîte d'une case de côté et de haut, posée sur y = 0 (étirée par l'instance) */
export function plinthGeo(people: People): THREE.BufferGeometry {
  const key = `${people}|plinth`;
  let g = cache.get(key);
  if (g) return g;
  const p = new Parts();
  p.box(1, 1, 1, 0, 0, 0, people === 'orient' ? 0xc8b48a : 0x9a968c);
  const { body } = p.build(false);
  g = mergeLit(body, null) ?? body;
  cache.set(key, g);
  return g;
}

/** Nombre de triangles d'une géométrie (pour les tests) */
export const triCount = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
