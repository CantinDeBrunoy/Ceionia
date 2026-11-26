/**
 * Mesure d'audience : la forme d'un signal du jeu et sa validation (voir docs/mesure-audience.md).
 * Aucun champ personnel : un identifiant de joueur tiré au hasard par le navigateur, un identifiant de partie, et l'état du jeu.
 * Pur (sans D1 ni Request) : testé dans tests/mesureAudience.test.ts
 */

/** les âges du jeu, dans l'ordre de `AGES` (src/build/catalog.ts) */
export const AGE_NAMES = ['Préhistoire', 'Antiquité', 'Médiéval', 'Industriel', 'Moderne', 'Futuriste'];
export const KINDS = ['start', 'tick', 'age'] as const;
export const MODES = ['normal', 'sandbox', 'hell', 'isle'] as const;
export const DIFFS = ['normal', 'easy', 'sandbox'] as const;
export const LANGS = ['fr', 'en'] as const;

export type PingKind = (typeof KINDS)[number];
export interface Ping {
  /** joueur : UUID tiré au hasard, gardé dans le localStorage */
  p: string;
  /** partie : UUID tiré à chaque lancement */
  s: string;
  /** start : lancement d'une partie ; tick : signal de la minute ; age : passage d'âge */
  k: PingKind;
  /** secondes jouées (onglet visible) depuis le signal précédent */
  t: number;
  /** âge du village (indice de `AGE_NAMES`) */
  a: number;
  m: (typeof MODES)[number];
  d: (typeof DIFFS)[number];
  l: (typeof LANGS)[number];
  /** version du build */
  b: string;
  /** au lancement : partie neuve ou reprise */
  r?: 'new' | 'continue';
}

/** taille maximale d'un signal, en octets */
export const MAX_BODY = 600;
/** secondes créditées au plus par signal (un signal par minute, un peu de marge pour un onglet lent) */
export const MAX_SECONDS = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION = /^[A-Za-z0-9._-]{1,32}$/;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** Le signal lu d'un texte JSON, ou la raison du refus */
export function parsePing(text: string): Ping | string {
  if (text.length > MAX_BODY) return 'trop long';
  let o: any;
  try { o = JSON.parse(text); } catch { return 'JSON illisible'; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'pas un objet';
  if (typeof o.p !== 'string' || !UUID.test(o.p)) return 'joueur';
  if (typeof o.s !== 'string' || !UUID.test(o.s)) return 'partie';
  if (!oneOf(KINDS, o.k)) return 'type';
  if (!Number.isInteger(o.t) || o.t < 0 || o.t > 3600) return 'secondes';
  if (!Number.isInteger(o.a) || o.a < 0 || o.a >= AGE_NAMES.length) return 'âge';
  if (!oneOf(MODES, o.m)) return 'mode';
  if (!oneOf(DIFFS, o.d)) return 'difficulté';
  if (!oneOf(LANGS, o.l)) return 'langue';
  if (typeof o.b !== 'string' || !VERSION.test(o.b)) return 'version';
  if (o.r !== undefined && o.r !== 'new' && o.r !== 'continue') return 'lancement';
  const ping: Ping = { p: o.p, s: o.s, k: o.k, t: o.t, a: o.a, m: o.m, d: o.d, l: o.l, b: o.b };
  if (o.r) ping.r = o.r;
  return ping;
}

/**
 * Les secondes créditées pour un signal : celles annoncées, bornées par `MAX_SECONDS` et par le temps réel écoulé depuis le
 * dernier signal de la partie (plus 10 s de marge). Un signal de lancement ne compte rien. Une partie inconnue (`last` nul)
 * : seulement la borne fixe
 */
export function creditedSeconds(ping: Pick<Ping, 'k' | 't'>, now: number, last: number | null): number {
  if (ping.k === 'start') return 0;
  let s = Math.min(ping.t, MAX_SECONDS);
  if (last !== null) s = Math.min(s, Math.max(0, now - last) + 10);
  return Math.max(0, Math.floor(s));
}

/** Le jour (AAAA-MM-JJ) d'un instant en secondes, à l'heure de Paris */
export function parisDay(sec: number): string {
  // (la locale suédoise écrit les dates en AAAA-MM-JJ)
  return new Date(sec * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}
