import type { Choice, Effect } from './missions';

/**
 * La carte de choix de la fenêtre de départ, en trois infos : le style du choix (prudent, audacieux), ce qui le distingue en
 * deux ou trois mots, et un risque en trois pastilles. Tout se calcule à partir des données des choix d'une mission.
 */

/** Les pastilles de risque : 1 (faible), 2 (mesuré), 3 (élevé ou très élevé), sur les seuils des mots « faible / mesuré / élevé » */
export function riskDots(r: number): 1 | 2 | 3 {
  return r <= 0.12 ? 1 : r <= 0.22 ? 2 : 3;
}

/** Les blessés d'un choix (habitants à l'infirmerie en cas d'échec) */
export function injuredOf(c: Pick<Choice, 'lose'>): number {
  return c.lose.reduce((n, e) => n + (e.t === 'injured' ? e.n : 0), 0);
}

/** Ce que vaut une récompense, en unités comparables : une bête, un minerai ou un point de besoin = 1, un savoir-faire durable = 2 */
function gainOf(e: Effect): number {
  if (e.t === 'herd') return e.kinds.length;
  if (e.t === 'ore') return e.n;
  if (e.t === 'need') return e.n > 0 ? e.n : 0;
  if (e.t === 'perk') return 2;
  return 0;
}
/** Le total des gains d'un choix (ce qu'il rapporte si tout va bien) */
export function gainsOf(c: Pick<Choice, 'win'>): number {
  return c.win.reduce((n, e) => n + gainOf(e), 0);
}

/** Le style d'un choix parmi ceux de sa mission */
export type ChoiceStyleKind = 'cautious' | 'bold' | 'balanced';
/** Ce qui le distingue : « moins de blessés », « plus sûr » (prudent) ; « plus de récompenses », « plus risqué » (audacieux) */
export type ChoiceEffect = 'fewerInjuries' | 'safer' | 'moreRewards' | 'riskier';
export interface ChoiceStyle { style: ChoiceStyleKind | null; effect: ChoiceEffect | null }

const NONE: ChoiceStyle = { style: null, effect: null };

/**
 * L'étiquette de chaque choix d'une mission : le risque le plus bas est « prudent », le plus haut « audacieux », ceux du
 * milieu « équilibré » ; un seul choix, ou des risques tous égaux : rien. L'effet est vrai : « moins de blessés » seulement si
 * les blessés du prudent sont réellement moins nombreux que ceux de tous les audacieux (sinon « plus sûr »), « plus de
 * récompenses » seulement si l'audacieux rapporte réellement plus que tous les prudents (sinon « plus risqué »).
 */
export function choiceStyles(choices: Pick<Choice, 'risk' | 'win' | 'lose'>[]): ChoiceStyle[] {
  if (choices.length < 2) return choices.map(() => NONE);
  const risks = choices.map((c) => c.risk), lo = Math.min(...risks), hi = Math.max(...risks);
  if (lo === hi) return choices.map(() => NONE);
  const cautious = choices.filter((c) => c.risk === lo), bold = choices.filter((c) => c.risk === hi);
  const minBoldHurt = Math.min(...bold.map(injuredOf)), maxCautiousGain = Math.max(...cautious.map(gainsOf));
  return choices.map((c): ChoiceStyle => {
    if (c.risk === lo) return { style: 'cautious', effect: injuredOf(c) < minBoldHurt ? 'fewerInjuries' : 'safer' };
    if (c.risk === hi) return { style: 'bold', effect: gainsOf(c) > maxCautiousGain ? 'moreRewards' : 'riskier' };
    return { style: 'balanced', effect: null };
  });
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * La phrase de la carte : le texte du choix en entier s'il tient en `max` mots, sinon sa première phrase, sinon sa première
 * proposition (avant « : », « ; » ou un tiret) si elle a au moins trois mots ; sinon rien (tout est dans « Détails »).
 * Elle ne coupe donc jamais au milieu d'une idée.
 */
export function cardPhrase(text: string, max = 10): string {
  const t = text.trim();
  if (words(t) <= max) return t;
  const sentence = /^.*?[.!?…](?=\s|$)/s.exec(t)?.[0] ?? t;
  if (words(sentence) <= max) return sentence;
  const clause = sentence.split(/\s*[:;—–]\s+/)[0];
  return words(clause) >= 3 && words(clause) <= max ? clause : '';
}
