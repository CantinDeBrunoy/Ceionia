import { clamp, hash2 } from './rng';

/**
 * Le programme des nuits : quelles nuits ont une aurore boréale, lesquelles des étoiles filantes. Le tirage ne dépend que du
 * numéro de la nuit, de la saison, du froid de la carte et d'un sel (tiré au lancement) : il ne clignote pas, on peut le tester.
 * Le temps qu'il fait n'entre pas ici : les nuages cachent le spectacle, ils ne le décident pas.
 */

/** Étoiles filantes d'une nuit : aucune, une isolée, quelques-unes, ou la grande nuit des étoiles filantes */
export type MeteorKind = 'none' | 'lone' | 'some' | 'shower';

export interface NightShow {
  /** force de l'aurore boréale (0 : pas d'aurore cette nuit) */
  aurora: number;
  meteors: MeteorKind;
}

/** Chance d'une aurore par saison (printemps, été, automne, hiver) sur une carte tempérée… */
export const AURORA_BASE = [0.06, 0.02, 0.1, 0.3];
/** … et en plus sur une carte froide (taïga, neiges éternelles) */
export const AURORA_COLD = [0.14, 0.05, 0.2, 0.35];
/** Part des terres froides à partir de laquelle la carte compte comme tout à fait froide */
export const COLD_FULL = 0.25;
/** Chance d'une grande nuit des étoiles filantes par saison : plus souvent l'été (Perséides) et l'hiver (Géminides) */
export const SHOWER = [0.05, 0.11, 0.05, 0.08];
/** Chance des nuits à quelques étoiles filantes, puis à une seule */
export const SOME = 0.18, LONE = 0.3;
/** Étoiles filantes par seconde de jeu au cœur de la nuit : une par nuit environ, quelques-unes, une averse */
export const METEOR_RATE: Record<MeteorKind, number> = { none: 0, lone: 0.045, some: 0.22, shower: 3 };

/** La nuit qui commence le soir du jour `day` : avant midi, on est encore dans celle de la veille */
export const nightOf = (day: number, hour: number) => (hour < 12 ? day - 1 : day);

/** Chance d'une aurore cette saison, selon la part des terres froides de la carte (0 … 1) */
export function auroraChance(season: number, cold: number) {
  return AURORA_BASE[season] + AURORA_COLD[season] * clamp(cold / COLD_FULL, 0, 1);
}

const showerRoll = (night: number, season: number, salt: number) => hash2(night, 2, salt) < SHOWER[season];

/** Le spectacle de la nuit `night` */
export function nightShow(night: number, season: number, cold: number, salt: number): NightShow {
  // une aurore plus ou moins vive : certaines nuits, un simple voile ; d'autres, tout le ciel
  const aurora = hash2(night, 1, salt) < auroraChance(season, cold) ? 0.6 + 0.4 * hash2(night, 4, salt) : 0;
  let meteors: MeteorKind = 'none';
  // jamais deux grandes nuits d'étoiles filantes de suite
  if (showerRoll(night, season, salt) && !showerRoll(night - 1, season, salt)) meteors = 'shower';
  else {
    const m = hash2(night, 3, salt);
    meteors = m < SOME ? 'some' : m < SOME + LONE ? 'lone' : 'none';
  }
  return { aurora, meteors };
}
