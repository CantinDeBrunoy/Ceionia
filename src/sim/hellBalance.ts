import type { DemonKind, UnitStats } from './hell';
import type { Difficulty } from './difficulty';

/**
 * L'équilibre des Enfers : la taille et la composition des vagues d'incursion, des contre-attaques et des garnisons, selon la
 * puissance de l'armée du joueur et l'âge du village. Calcul pur (aucune simulation).
 *
 * Principe : tout se mesure en « puissance » (racine de vie × dégâts par seconde, ce qui compte dans un combat de masse : la
 * loi de Lanchester). Une vague vaut une part de la puissance du joueur (son armée et ses défenses), qui monte avec le niveau
 * de la vague (montée progressive, pas de pic), avec un plancher selon l'âge pour que l'île ne soit jamais vide de menace.
 * La composition mêle d'autant plus de gros monstres que l'âge est avancé (diablotin, brute, golem de lave, démon cornu,
 * seigneur-démon, titan).
 */

/** Réglage de l'équilibre d'une partie : `k` multiplie les effectifs (Facile : 0,6) ; `legacy` : l'ancien équilibre (bac à sable) */
export interface Balance { k: number; legacy: boolean }
export const BALANCE_NORMAL: Balance = { k: 1, legacy: false };
export const BALANCE_EASY: Balance = { k: 0.6, legacy: false };
export const BALANCE_LEGACY: Balance = { k: 1, legacy: true };
/** L'équilibre de chaque difficulté du jeu : plein en Normal, ×0,6 en Facile, l'ancien en bac à sable */
export function balanceOf(d: Difficulty): Balance { return d === 'sandbox' ? BALANCE_LEGACY : d === 'easy' ? BALANCE_EASY : BALANCE_NORMAL; }

/** Puissance d'une unité : ce qu'elle pèse dans une mêlée de masse (√ vie × dégâts par seconde) */
export function powerOf(s: Pick<UnitStats, 'hp' | 'dmg' | 'cooldown'>) { return Math.sqrt(Math.max(0, s.hp) * Math.max(0, s.dmg) / Math.max(0.1, s.cooldown)); }

/** Une vague vaut cette part de la puissance du joueur (avant la montée du niveau) : un peu moins que lui, la tour et la caserne comblent le reste */
export const WAVE_RATIO = 0.95;
/** La puissance de référence : au-dessus, une vague grossit un peu moins vite que l'armée (plus de troupes, plus de marge) */
export const POWER_REF = 1000, POWER_EXP = 1;
/** Montée de la difficulté : la première vague pèse RAMP_START de la pleine, +RAMP_STEP à chaque niveau jusqu'à 1 */
export const RAMP_START = 0.5, RAMP_STEP = 0.125;
/** Les vagues d'après une défaite s'allègent (par défaite d'affilée, au plus trois) */
export const EASE_LOSS = 0.82;
/** Plafond d'ennemis dans une vague (le rendu en tient bien davantage) */
export const WAVE_MAX = 160;
/** Une zone d'Enfers qui se réveille se renforce de cette part de la puissance du joueur présent */
export const GARRISON_RATIO = 0.7;
/** Une unité du joueur ne pèse pas plus que ça dans le calcul (un soldat aux points de vie truqués ne doit pas déclencher une armée) */
export const MAX_UNIT_POWER = 300;
/** Une vague qui suit la sécurisation de l'île : de simples escarmouches */
export const SECURED_K = 0.65;
/** Le plancher monte d'autant par âge au-delà de l'Antiquité */
export const AGE_FLOOR = 0.75;

/** Montée du niveau : 0,4 à la première vague, 1 à la sixième */
export const ramp = (level: number) => Math.min(1, RAMP_START + RAMP_STEP * Math.max(0, level - 1));

/** Puissance d'une vague « d'après l'armée » : sous-linéaire, pour qu'une armée plus forte garde de la marge */
export function armyWave(power: number) { return power <= 0 ? 0 : WAVE_RATIO * POWER_REF * Math.pow(power / POWER_REF, POWER_EXP); }

/** À partir de quel âge et de quel niveau chaque sorte vient en vague, son poids dans la composition, et son effacement avec l'âge */
interface Entry { kind: DemonKind; minAge: number; minLevel: number; weight: number; fade: number }
const TABLE: Entry[] = [
  { kind: 'imp', minAge: 0, minLevel: 1, weight: 2.8, fade: 0.1 },
  { kind: 'archer', minAge: 0, minLevel: 4, weight: 1.5, fade: 0.05 },
  { kind: 'brute', minAge: 0, minLevel: 3, weight: 1.0, fade: 0.03 },
  { kind: 'chief', minAge: 1, minLevel: 7, weight: 0.5, fade: 0 },
  { kind: 'golem', minAge: 2, minLevel: 2, weight: 0.8, fade: 0 },
  { kind: 'horned', minAge: 3, minLevel: 2, weight: 0.7, fade: 0 },
  { kind: 'lord', minAge: 4, minLevel: 3, weight: 0.55, fade: 0 },
  { kind: 'titan', minAge: 5, minLevel: 4, weight: 0.5, fade: 0 },
];

/**
 * La composition d'une vague de puissance `power` : des petits démons en nombre, des gros en proportion de l'âge, au moins un
 * représentant de chaque grande sorte permise quand la puissance le permet. `powers` : la puissance de chaque sorte
 */
export function compose(power: number, level: number, age: number, powers: Record<DemonKind, number>): DemonKind[] {
  const a = Math.max(0, Math.min(5, age));
  const els = TABLE.filter((e) => e.minAge <= a && e.minLevel <= level).map((e) => ({ e, w: e.weight * Math.max(0.3, 1 - e.fade * a * 1) }));
  const sum = els.reduce((s, x) => s + x.w, 0);
  const counts = new Map<DemonKind, number>();
  let left = power;
  // d'abord la part entière de chaque sorte
  for (const { e, w } of els) {
    const n = Math.floor((power * w / sum) / powers[e.kind]);
    if (n > 0) { counts.set(e.kind, n); left -= n * powers[e.kind]; }
  }
  // le reste : une unité de plus pour les plus gros d'abord, tant qu'il en couvre les trois quarts
  for (const { e } of [...els].sort((p, q) => powers[q.e.kind] - powers[p.e.kind])) {
    const pw = powers[e.kind];
    if (left >= pw * 0.75) { counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1); left -= pw; }
  }
  // les grosses sortes de l'âge ne manquent pas à l'appel (une au moins, à partir de trois fois leur puissance)
  for (const { e } of els) if (e.minAge >= 2 && !counts.get(e.kind) && power >= powers[e.kind] * 3) counts.set(e.kind, 1);
  const out: DemonKind[] = [];
  // (les petits d'abord : ils sortent du portail devant, les gros ensuite)
  for (const { e } of [...els].sort((p, q) => powers[p.e.kind] - powers[q.e.kind])) for (let i = 0; i < (counts.get(e.kind) ?? 0); i++) out.push(e.kind);
  if (!out.length) out.push('imp');
  // le plafond : on retire des petits d'abord
  if (out.length > WAVE_MAX) out.length = WAVE_MAX;
  return out;
}

/** La somme des puissances d'une liste de démons */
export const sumPower = (kinds: DemonKind[], powers: Record<DemonKind, number>) => kinds.reduce((s, k) => s + powers[k], 0);

/** Les données d'une vague à composer */
export interface WavePlan {
  level: number;
  /** âge de référence (la sorte de démons qui sortent) */
  age: number;
  /** puissance du joueur (armée et défenses) ; 0 : on ne la connaît pas, seul le plancher compte */
  power: number;
  /** la vague d'avant l'équilibre actuel (celle du plancher : sa taille et ses sortes) */
  legacy: DemonKind[];
  powers: Record<DemonKind, number>;
  balance: Balance;
  /** vagues déjà venues contre l'île sécurisée (escarmouches), zones conquises, défaites d'affilée */
  secured?: boolean; conquered?: number; losses?: number;
}

/**
 * La liste des démons d'une vague. Le plancher (la vague d'avant, un peu plus fournie à chaque âge) garantit une vraie menace
 * même sans armée ; au-dessus, la vague suit la puissance du joueur. Facile en retranche 40 % ; l'ancien équilibre (bac à sable)
 * rend simplement la vague d'avant
 */
export function planWave(p: WavePlan): DemonKind[] {
  if (p.balance.legacy) return p.legacy;
  const floorK = 1 + AGE_FLOOR * Math.max(0, p.age - 1);
  const floorP = sumPower(p.legacy, p.powers) * floorK;
  const eased = Math.pow(EASE_LOSS, Math.min(3, p.losses ?? 0));
  const army = armyWave(p.power) * ramp(p.level) * (p.secured ? SECURED_K : 1) * Math.max(0.5, 1 - 0.08 * (p.conquered ?? 0)) * eased;
  const k = p.balance.k;
  // jusqu'à l'Antiquité, le plancher seul : exactement la vague d'avant (les débuts restent doux)
  if (p.age <= 1 && army <= floorP) return k >= 1 ? p.legacy : p.legacy.slice(0, Math.max(2, Math.round(p.legacy.length * k)));
  const w = Math.max(floorP, army) * k;
  return compose(w, p.level, p.age, p.powers);
}

/** Âge qui règle les sortes d'une vague : l'âge du village (les Enfers vus sans village : l'Antiquité) */
export const tierAge = (age: number) => (age >= 90 ? 1 : age);
