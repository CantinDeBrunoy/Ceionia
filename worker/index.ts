/**
 * Le Worker de Ceionia : la mesure d'audience (`POST /api/ping`) et son back-office (`/bo`). Tout le reste est servi par
 * les fichiers statiques de `dist` sans passer par ce code (`assets.run_worker_first` de wrangler.jsonc).
 * Voir docs/mesure-audience.md
 */
import { creditedSeconds, parisDay, parsePing, type Ping } from './ping';
import { buildReport, dayBefore, type DayRow, type PlayerRow, type SessionRow } from './stats';
import { loginPage, reportPage } from './bo';

// (types minimaux de D1 et des liaisons : le projet n'embarque pas @cloudflare/workers-types)
interface D1Result<T> { results: T[] }
interface D1Statement {
  bind(...v: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
interface D1Database { prepare(sql: string): D1Statement; batch(s: D1Statement[]): Promise<unknown[]> }
interface RateLimit { limit(o: { key: string }): Promise<{ success: boolean }> }
export interface Env {
  DB: D1Database;
  ASSETS: { fetch(req: Request): Promise<Response> };
  /** la clé du back-office (secret Wrangler) */
  BO_KEY?: string;
  /** débit par joueur (liaison `ratelimits`), absente : pas de limite autre que celle des secondes créditées */
  PING_LIMIT?: RateLimit;
}

const COOKIE = 'ceionia_bo';
const nowSec = () => Math.floor(Date.now() / 1000);
const html = (body: string, status = 200, extra: Record<string, string> = {}) => new Response(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", ...extra },
});

/** Enregistre un signal : le joueur, sa partie et son jour, en une seule transaction */
export async function recordPing(db: D1Database, ping: Ping, now: number): Promise<'ok' | 'conflit'> {
  const sess = await db.prepare('SELECT player, last_at FROM sessions WHERE id = ?').bind(ping.s).first<{ player: string; last_at: number }>();
  if (sess && sess.player !== ping.p) return 'conflit';
  const sec = creditedSeconds(ping, now, sess?.last_at ?? null);
  // (au bac à sable, l'âge de départ se choisit : il ne dit pas où le joueur s'est arrêté)
  const age = ping.m === 'sandbox' || ping.d === 'sandbox' ? -1 : ping.a;
  await db.batch([
    db.prepare(`INSERT INTO players (id, first_at, last_at, seconds, max_age, lang, version, sessions) VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT (id) DO UPDATE SET last_at = excluded.last_at, seconds = seconds + excluded.seconds, max_age = MAX(max_age, excluded.max_age),
      lang = excluded.lang, version = excluded.version, sessions = sessions + excluded.sessions`)
      .bind(ping.p, now, sec, age, ping.l, ping.b, sess ? 0 : 1),
    db.prepare(`INSERT INTO sessions (id, player, started_at, last_at, seconds, start_age, max_age, mode, difficulty, launch, version) VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT (id) DO UPDATE SET last_at = excluded.last_at, seconds = seconds + excluded.seconds, max_age = MAX(max_age, excluded.max_age), mode = excluded.mode`)
      .bind(ping.s, ping.p, now, sec, ping.a, ping.m, ping.d, ping.r ?? null, ping.b),
    db.prepare('INSERT INTO days (day, player, seconds) VALUES (?1, ?2, ?3) ON CONFLICT (day, player) DO UPDATE SET seconds = seconds + excluded.seconds')
      .bind(parisDay(now), ping.p, sec),
  ]);
  return 'ok';
}

async function ping(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > 2048) return new Response(null, { status: 413 });
  const p = parsePing(await req.text());
  if (typeof p === 'string') return new Response(p, { status: 400 });
  if (env.PING_LIMIT && !(await env.PING_LIMIT.limit({ key: p.p })).success) return new Response(null, { status: 429 });
  const r = await recordPing(env.DB, p, nowSec());
  return new Response(null, { status: r === 'ok' ? 204 : 409 });
}

/** L'empreinte de la clé, gardée dans le cookie (la clé elle-même n'y est jamais) */
async function keyHash(key: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ceionia-bo:${key}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Comparaison à temps constant de deux textes de même longueur */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
const cookieOf = (req: Request) => (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';

async function backOffice(req: Request, env: Env, url: URL): Promise<Response> {
  if (!env.BO_KEY) return html('<p>Back-office fermé : le secret BO_KEY n’est pas posé.</p>', 503);
  const good = await keyHash(env.BO_KEY);
  const enter = () => new Response(null, { status: 303, headers: { location: '/bo', 'set-cookie': `${COOKIE}=${good}; Path=/bo; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`, 'cache-control': 'no-store' } });
  if (url.pathname === '/bo/sortie') return new Response(null, { status: 303, headers: { location: '/bo', 'set-cookie': `${COOKIE}=; Path=/bo; HttpOnly; Secure; SameSite=Strict; Max-Age=0` } });
  if (url.pathname !== '/bo') return html('<p>Page inconnue.</p>', 404);
  // la clé donnée (formulaire ou `?key=`) : un cookie, puis retour sur /bo sans la clé dans l'adresse
  let given: string | null = url.searchParams.get('key');
  if (req.method === 'POST') given = String((await req.formData()).get('key') ?? '');
  if (given !== null) return same(await keyHash(given), good) ? enter() : html(loginPage(true), 401);
  if (!same(cookieOf(req), good)) return html(loginPage(), 401);
  const now = nowSec();
  const [players, sessions, days] = await Promise.all([
    env.DB.prepare('SELECT id, first_at, last_at, seconds, max_age, lang, sessions FROM players').all<PlayerRow>(),
    env.DB.prepare('SELECT started_at, seconds FROM sessions').all<SessionRow>(),
    env.DB.prepare('SELECT day, COUNT(*) AS players, SUM(seconds) AS seconds FROM days WHERE day >= ? GROUP BY day').bind(dayBefore(parisDay(now), 29)).all<DayRow>(),
  ]);
  return html(reportPage(buildReport(players.results, sessions.results, days.results, now)));
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/ping') return ping(req, env);
    if (url.pathname === '/bo' || url.pathname.startsWith('/bo/')) return backOffice(req, env, url);
    // (ne devrait pas arriver : seules ces adresses passent par le Worker)
    return env.ASSETS.fetch(req);
  },
};
