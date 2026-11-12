import type { Building, KindId } from '../build/catalog';
import { sizeOf } from '../build/catalog';
import { clamp, smoothstep } from '../core/rng';

/**
 * Bruitages de proximité : quels sons entendre autour du point visé. Module pur (sans Web Audio) : il dresse la liste des
 * sources candidates (bâtiments, volcans), les note selon la distance, le zoom et l'heure, et garde les meilleures.
 * Les voix qui les jouent sont dans `voices.ts`.
 */
export type SpotKind =
  | 'flint' | 'pottery' | 'forge' | 'factory' | 'mill' | 'wind' | 'axe' | 'saw' | 'quarry' | 'mine'
  | 'sheep' | 'hens' | 'cows' | 'horses' | 'bees' | 'crowd' | 'tavern' | 'harbor' | 'machine' | 'volcano';

/** Une source posée dans le monde (centre, en cases) */
export interface Spot { kind: SpotKind; x: number; z: number }

/** Une voix retenue : sa force (0 … 1) et la position de la source la plus proche (pour le panoramique) */
export interface SpotVoice { kind: SpotKind; k: number; x: number; z: number }

/** Ce qui module les sons : lumière du jour (0 … 1), pluie (0 … 1), hiver */
export interface SpotEnv { daylight: number; rain: number; winter: boolean }

/** Quand une source se fait entendre */
type When = 'day' | 'always' | 'evening' | 'mostlyDay';

interface SpotDef {
  /** force à bout portant */
  loud: number;
  /** portée : pleine force jusqu'à `r0`, muet au-delà de `r1` (cases, depuis le centre de la source) */
  r0: number;
  r1: number;
  when: When;
  /** se tait sous la pluie (en partie) */
  rainy?: boolean;
}

export const SPOT_DEFS: Record<SpotKind, SpotDef> = {
  flint: { loud: 0.7, r0: 1.5, r1: 11, when: 'day' },
  pottery: { loud: 0.6, r0: 1.5, r1: 10, when: 'day' },
  forge: { loud: 1, r0: 2, r1: 15, when: 'day' },
  factory: { loud: 0.9, r0: 2.5, r1: 17, when: 'always' },
  mill: { loud: 0.7, r0: 2, r1: 12, when: 'always' },
  wind: { loud: 0.7, r0: 2.5, r1: 15, when: 'always' },
  axe: { loud: 0.8, r0: 2, r1: 14, when: 'day' },
  saw: { loud: 0.8, r0: 2, r1: 14, when: 'day' },
  quarry: { loud: 0.8, r0: 2.5, r1: 15, when: 'day' },
  mine: { loud: 0.7, r0: 2, r1: 12, when: 'day' },
  sheep: { loud: 0.8, r0: 2, r1: 13, when: 'mostlyDay' },
  hens: { loud: 0.7, r0: 1.5, r1: 10, when: 'day' },
  cows: { loud: 0.8, r0: 2, r1: 14, when: 'mostlyDay' },
  horses: { loud: 0.7, r0: 2, r1: 13, when: 'mostlyDay' },
  bees: { loud: 0.5, r0: 1, r1: 7, when: 'day', rainy: true },
  crowd: { loud: 0.9, r0: 3, r1: 17, when: 'day', rainy: true },
  tavern: { loud: 0.8, r0: 2, r1: 12, when: 'evening' },
  harbor: { loud: 0.8, r0: 3, r1: 16, when: 'always' },
  machine: { loud: 0.8, r0: 2.5, r1: 15, when: 'always' },
  volcano: { loud: 1, r0: 5, r1: 38, when: 'always' },
};

/** Le son d'un bâtiment selon son genre et l'âge de son modèle (plusieurs pour un enclos : bêtes et poules) */
export function soundsOf(kind: KindId, age: number): SpotKind[] {
  switch (kind) {
    case 'workshop': return [(['flint', 'pottery', 'forge', 'factory'] as const)[age]].filter(Boolean);
    case 'mill': return age >= 4 ? ['wind'] : age === 3 ? ['factory'] : ['mill'];
    case 'lumber': return age <= 1 ? ['axe'] : ['saw'];
    case 'quarry': return ['quarry'];
    case 'mine': return ['mine'];
    case 'pen': return [age >= 3 ? 'cows' : 'sheep', ...(age >= 1 ? ['hens' as const] : [])];
    case 'stable': return ['horses'];
    case 'apiary': return ['bees'];
    case 'gather': return age === 0 || age === 3 ? [] : ['crowd'];
    case 'forum': return ['crowd'];
    case 'tavern': return ['tavern'];
    case 'harbor': return ['harbor'];
    case 'carworks': case 'refinery': case 'oilwell': case 'brickworks': return ['factory'];
    case 'lab': return age >= 4 ? ['machine'] : [];
    case 'fusion': case 'arcology': case 'research': case 'vfarm': case 'maglev': case 'spaceport': return ['machine'];
    default: return [];
  }
}

/** Les sources des bâtiments à moins de `reach` cases du point visé */
export function buildingSpots(buildings: Iterable<Building>, fx: number, fz: number, reach = 40): Spot[] {
  const out: Spot[] = [];
  for (const b of buildings) {
    const s = sizeOf(b), x = b.x + s / 2, z = b.z + s / 2;
    if (Math.abs(x - fx) > reach || Math.abs(z - fz) > reach) continue;
    for (const kind of soundsOf(b.kind, b.age)) out.push({ kind, x, z });
  }
  return out;
}

/** Facteur de l'heure (0 … 1) : les ateliers se taisent la nuit, la taverne s'anime le soir */
export function timeFactor(when: When, env: SpotEnv) {
  const day = clamp((env.daylight - 0.2) / 0.4, 0, 1);
  if (when === 'day') return day;
  if (when === 'mostlyDay') return 0.3 + 0.7 * day;
  if (when === 'evening') return 0.45 + 0.55 * (1 - day);
  return 1;
}

/**
 * Atténuation du zoom : les sons des bâtiments ne s'entendent que de près (pleins sous 21 de distance, muets au-delà de 56) ;
 * le volcan porte plus loin
 */
export function zoomFactor(kind: SpotKind, camDist: number) {
  return kind === 'volcano' ? clamp(1.5 - camDist / 110, 0.2, 1) : clamp(1.6 - camDist / 35, 0, 1);
}

/**
 * Les `max` voix les plus fortes, la première seule à pleine force. Une sorte n'occupe qu'une voix : plusieurs sources proches de la même sorte s'additionnent
 * (sans dépasser 1), la position retenue est celle de la plus proche
 */
export function pickVoices(spots: Spot[], fx: number, fz: number, camDist: number, env: SpotEnv, max: number): SpotVoice[] {
  const acc = new Map<SpotKind, { quiet: number; best: number; x: number; z: number }>();
  for (const s of spots) {
    const d = SPOT_DEFS[s.kind], dist = Math.hypot(s.x - fx, s.z - fz);
    const p = (1 - smoothstep(d.r0, d.r1, dist)) * d.loud;
    if (p <= 0) continue;
    const a = acc.get(s.kind);
    if (!a) acc.set(s.kind, { quiet: 1 - p, best: p, x: s.x, z: s.z });
    else {
      a.quiet *= 1 - p;
      if (p > a.best) { a.best = p; a.x = s.x; a.z = s.z; }
    }
  }
  const out: SpotVoice[] = [];
  for (const [kind, a] of acc) {
    const d = SPOT_DEFS[kind];
    if (kind === 'bees' && env.winter) continue;
    const k = (1 - a.quiet) * timeFactor(d.when, env) * zoomFactor(kind, camDist) * (d.rainy ? 1 - env.rain * 0.7 : 1);
    if (k >= 0.03) out.push({ kind, k: Math.min(1, k), x: a.x, z: a.z });
  }
  out.sort((a, b) => b.k - a.k);
  // une voix domine, les suivantes restent en retrait (sinon tout se mêle en tintamarre)
  return out.slice(0, max).map((v, i) => (i === 0 ? v : { ...v, k: v.k * 0.45 }));
}
