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
 * dernier signal de la partie (plus 10 s de marge). Un signal de lancement ne compte rien
 */
export function creditedSeconds(ping: Pick<Ping, 'k' | 't'>, now: number, last: number): number {
  if (ping.k === 'start') return 0;
  const s = Math.min(ping.t, MAX_SECONDS, Math.max(0, now - last) + 10);
  return Math.max(0, Math.floor(s));
}

/** Plafonds par jour (heure de Paris) : au-delà, les nouveaux joueurs ou les nouvelles parties sont refusés jusqu'au lendemain */
export const MAX_NEW_PLAYERS_DAY = 3000;
export const MAX_NEW_SESSIONS_DAY = 15000;
/** Durée de conservation : l'identifiant du joueur est retiré, et les données effacées, après 13 mois (396 jours) */
export const KEEP_DAYS = 396;

// (un seul formateur pour tout le module : en créer un par appel coûte des dizaines de microsecondes)
const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function parisParts(sec: number) {
  const o: Record<string, string> = {};
  for (const p of PARIS.formatToParts(new Date(sec * 1000))) o[p.type] = p.value;
  return o;
}
/** Le jour (AAAA-MM-JJ) d'un instant en secondes, à l'heure de Paris */
export function parisDay(sec: number): string {
  const o = parisParts(sec);
  return `${o.year}-${o.month}-${o.day}`;
}
/** L'instant (secondes) du dernier minuit à Paris */
export function parisMidnight(sec: number): number {
  const o = parisParts(sec);
  return sec - (Number(o.hour) * 3600 + Number(o.minute) * 60 + Number(o.second));
}

/** Le corps d'une requête lu au plus `max` octets (nul au-delà, sans tout lire), avec ou sans `content-length` */
export async function readBody(body: ReadableStream<Uint8Array> | null, max: number): Promise<string | null> {
  if (!body) return '';
  const reader = body.getReader(), parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { await reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}
