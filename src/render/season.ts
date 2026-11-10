import * as THREE from 'three';
import { GameTime } from '../core/time';
import { SEASONS, SeasonDef, PaletteDef } from './seasonConfig';

/** Fiche de saison « vivante » : les couleurs en THREE.Color, interpolées sur place (les uniforms des matériaux les lisent) */
type Live<T> = T extends string ? THREE.Color
  : T extends number ? number
  : T extends readonly (infer U)[] ? Live<U>[]
  : { -readonly [K in keyof T]: Live<T[K]> };

export type LivePalette = Live<PaletteDef>;

export interface SeasonState extends Live<SeasonDef> {
  /** saison qui domine le décor (0 printemps … 3 hiver) */
  index: number;
  /** raccourcis d'origine, vers les mêmes objets que la fiche : herbe, arbres fleuris, autres feuillus, cultures, ciel */
  grass: THREE.Color;
  foliage: THREE.Color;
  foliage2: THREE.Color;
  crop: THREE.Color;
  tint: THREE.Color;
  /** gel de l'eau du moment : celui de la saison, qui suit la neige (la glace fond avec elle) */
  iceNow: number;
}

/** Copie vivante d'une fiche : chaînes '#rrggbb' → couleurs, le reste recopié */
function live<T>(def: T): Live<T> {
  if (typeof def === 'string') return new THREE.Color(def) as Live<T>;
  if (typeof def === 'number') return def as Live<T>;
  if (Array.isArray(def)) return def.map((v) => live(v)) as Live<T>;
  const out: Record<string, unknown> = {};
  for (const k in def) out[k] = live(def[k]);
  return out as Live<T>;
}

/** out ← a…b en t, sur place (aucune allocation : appelé à chaque image) */
function lerpInto(out: any, a: any, b: any, t: number) {
  for (const k in a) {
    const o = out[k];
    if (typeof o === 'number') out[k] = a[k] + (b[k] - a[k]) * t;
    else if (o instanceof THREE.Color) o.copy(a[k]).lerp(b[k], t);
    else if (o && typeof o === 'object') lerpInto(o, a[k], b[k], t);
  }
}

const LIVE = SEASONS.map((d) => live(d));

export function makeSeasonState(): SeasonState {
  const s = live(SEASONS[0]) as SeasonState;
  s.index = 0;
  s.iceNow = 0;
  s.grass = s.terrain.grass;
  s.crop = s.terrain.crop;
  s.foliage = s.trees.blossom.colors[0];
  s.foliage2 = s.trees.leafy.colors[0];
  s.tint = s.light.sky;
  return s;
}

export function computeSeason(time: GameTime, out: SeasonState) {
  const { a, b, t } = time.mix();
  lerpInto(out, LIVE[a], LIVE[b], t);
  out.index = t < 0.5 ? a : b;
  // la neige ne tient que la première moitié de l'hiver : elle fond ensuite, sur le dernier quart avant le printemps
  if (time.seasonT >= 3.5) out.snow *= 1 - Math.min(1, (time.seasonT - 3.5) / 0.4) * 0.85;
  else if (time.seasonT < 0.2) out.snow *= 0.15;
  // la glace prend quand la neige tient, et fond avec elle
  out.iceNow = out.water.ice * Math.min(1, Math.max(0, (out.snow - 0.35) / 0.5));
  return out;
}

/** État d'une saison franche (0 … 3), hors du temps de jeu : décor de départ, tests */
export function seasonOf(i: number) {
  const time = new GameTime();
  time.setSeason(i);
  return computeSeason(time, makeSeasonState());
}
