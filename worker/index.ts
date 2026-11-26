/**
 * Le Worker de Ceionia : la mesure d'audience (`POST /api/ping`) et son back-office (`/bo`). Tout le reste est servi par
 * les fichiers statiques de `dist` sans passer par ce code (`assets.run_worker_first` de wrangler.jsonc). Sans base D1
 * branchée, les signaux sont acceptés et ignorés, et `/bo` le dit : le jeu se déploie avant la base.
 * Voir docs/mesure-audience.md
 */
import { creditedSeconds, KEEP_DAYS, MAX_BODY, MAX_NEW_PLAYERS_DAY, MAX_NEW_SESSIONS_DAY, parisDay, parisMidnight, parsePing, readBody, type Ping } from './ping';
import { loadReport, purge } from './stats';
import { connectedPage, loginPage, noDbPage, reportPage } from './bo';
import { authorizeUrl, cookieOf, githubAccountId, newSession, newState, sessionValid, SESSION_DAYS, setCookie, setStateCookie, STATE_COOKIE, STATE_SECONDS, stateMatches, type GitHubApp, type Secrets } from './auth';
import type { D1Database, RateLimit } from './d1';

export interface Env {
  /** la base (absente tant qu'elle n'est pas créée et déclarée dans wrangler.jsonc) */
  DB?: D1Database;
  ASSETS?: { fetch(req: Request): Promise<Response> };
  /** l'application OAuth GitHub du back-office (secrets Wrangler) */
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  /** l'identifiant numérique du seul compte GitHub admis (variable de wrangler.jsonc) : le login, lui, peut changer */
  BO_GITHUB_ID?: string;
  /** sel des sessions (secret Wrangler) : le changer déconnecte tout le monde */
  BO_SALT?: string;
  /** débit par joueur (identifiant tiré au hasard) */
  PING_LIMIT?: RateLimit;
  /** débit par adresse IP : la clé ne vit qu'en mémoire chez Cloudflare, elle n'est jamais écrite */
  PING_IP?: RateLimit;
  /** connexions au back-office (/bo/login et /bo/callback), par adresse IP (en mémoire seulement) */
  BO_LOGIN?: RateLimit;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });
const html = (body: string, status = 200, extra: Record<string, string> = {}) => new Response(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", ...extra },
});
/** l'adresse IP, seulement comme clé des limiteurs (en mémoire chez Cloudflare) : elle n'est ni écrite ni enregistrée */
const ipKey = (req: Request) => req.headers.get('cf-connecting-ip') ?? 'inconnue';
const allowed = async (rl: RateLimit | undefined, key: string) => !rl || (await rl.limit({ key })).success;

export type PingResult = 'ok' | 'conflit' | 'inconnue' | 'plafond';

/**
 * Enregistre un signal : le joueur, sa partie et son jour, en une seule transaction. Seul un signal de lancement crée une
 * partie (et ne crédite rien) ; un autre signal d'une partie inconnue est refusé. Les créations ont un plafond par jour
 */
export async function recordPing(db: D1Database, ping: Ping, now: number): Promise<PingResult> {
  const sess = await db.prepare('SELECT player, last_at FROM sessions WHERE id = ?1').bind(ping.s).first<{ player: string; last_at: number }>();
  if (sess && sess.player !== ping.p) return 'conflit';
  if (!sess) {
    if (ping.k !== 'start') return 'inconnue';
    const c = await db.prepare(`SELECT (SELECT COUNT(*) FROM sessions WHERE started_at >= ?1) AS s, (SELECT COUNT(*) FROM players WHERE first_at >= ?1) AS p,
      EXISTS (SELECT 1 FROM players WHERE id = ?2) AS known`).bind(parisMidnight(now), ping.p).first<{ s: number; p: number; known: number }>();
    if (!c || c.s >= MAX_NEW_SESSIONS_DAY || (!c.known && c.p >= MAX_NEW_PLAYERS_DAY)) return 'plafond';
  }
  const sec = sess ? creditedSeconds(ping, now, sess.last_at) : 0;
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

const STATUS: Record<PingResult, number> = { ok: 204, conflit: 409, inconnue: 409, plafond: 429 };

export async function ping(req: Request, env: Env, now = nowSec()): Promise<Response> {
  if (req.method !== 'POST') return empty(405, { allow: 'POST' });
  // (une page d'un autre site ne fait pas envoyer de signaux par ses visiteurs ; un script sans Origin passe par les limiteurs)
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return empty(403);
  if (!(await allowed(env.PING_IP, ipKey(req)))) return empty(429);
  const text = await readBody(req.body, MAX_BODY * 2);
  if (text === null) return empty(413);
  const p = parsePing(text);
  if (typeof p === 'string') return new Response(p, { status: 400 });
  if (!(await allowed(env.PING_LIMIT, p.p))) return empty(429);
  // (la base pas encore branchée : le signal est ignoré sans erreur)
  if (!env.DB) return empty(204);
  try {
    return empty(STATUS[await recordPing(env.DB, p, now)]);
  } catch {
    return empty(503);
  }
}

export async function backOffice(req: Request, env: Env, now = nowSec()): Promise<Response> {
  const url = new URL(req.url);
  const allowedId = env.BO_GITHUB_ID?.trim() ?? '';
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !/^\d+$/.test(allowedId)) {
    return html('<p>Back-office fermé : la connexion GitHub n’est pas configurée (voir docs/mesure-audience.md).</p>', 503);
  }
  const app: GitHubApp = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  // (le compte admis signe aussi les sessions : le changer les révoque toutes)
  const secrets: Secrets = { key: `${app.clientSecret}\u0000${allowedId}`, salt: env.BO_SALT };
  const redirectUri = `${url.origin}/bo/callback`;
  const clearState = setStateCookie('', 0);

  if (url.pathname === '/bo/sortie') {
    if (req.method !== 'POST') return empty(405, { allow: 'POST' });
    return empty(303, { location: '/bo', 'set-cookie': setCookie('', 0) });
  }
  // la connexion : un aller et retour par GitHub, quelques essais par minute
  if (url.pathname === '/bo/login' || url.pathname === '/bo/callback') {
    if (req.method !== 'GET') return empty(405, { allow: 'GET' });
    if (!(await allowed(env.BO_LOGIN, ipKey(req)))) return html(loginPage('lent'), 429);
    if (url.pathname === '/bo/login') {
      const state = newState();
      return empty(302, { location: authorizeUrl(app, state, redirectUri), 'set-cookie': setStateCookie(state, STATE_SECONDS), 'cache-control': 'no-store' });
    }
    const q = url.searchParams;
    if (!stateMatches(q.get('state'), cookieOf(req.headers.get('cookie'), STATE_COOKIE))) return html(loginPage('expire'), 400, { 'set-cookie': clearState });
    if (q.get('error')) return html(loginPage('annule'), 403, { 'set-cookie': clearState });
    const code = q.get('code') ?? '';
    if (!code || code.length > 256) return html(loginPage('expire'), 400, { 'set-cookie': clearState });
    let id: number | null;
    try { id = await githubAccountId(app, code, redirectUri); } catch { id = null; }
    if (id === null) return html(loginPage('github'), 502, { 'set-cookie': clearState });
    // le même refus pour tout autre compte, sans rien dire du compte admis
    if (String(id) !== allowedId) return html(loginPage('refuse'), 403, { 'set-cookie': clearState });
    const res = html(connectedPage(), 200, { 'set-cookie': clearState });
    res.headers.append('set-cookie', setCookie(await newSession(secrets, now), SESSION_DAYS * 86400));
    return res;
  }
  if (url.pathname !== '/bo') return html('<p>Page inconnue.</p>', 404);
  if (req.method !== 'GET') return empty(405, { allow: 'GET' });
  if (!(await sessionValid(cookieOf(req.headers.get('cookie')), secrets, now))) return html(loginPage(), 401);
  if (!env.DB) return html(noDbPage());
  const page = Math.max(0, Math.min(10000, Math.floor(Number(url.searchParams.get('page')) || 0)));
  try {
    return html(reportPage(await loadReport(env.DB, now, page)));
  } catch {
    return html('<p>La base ne répond pas (schéma appliqué ?). Voir docs/mesure-audience.md.</p>', 503);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/ping') return ping(req, env);
    if (url.pathname === '/bo' || url.pathname.startsWith('/bo/')) return backOffice(req, env);
    // (ne devrait pas arriver : seules ces adresses passent par le Worker)
    return env.ASSETS ? env.ASSETS.fetch(req) : empty(404);
  },
  /** la tâche planifiée de chaque nuit : efface ce qui a plus de 13 mois */
  async scheduled(_event: unknown, env: Env): Promise<void> {
    if (env.DB) await purge(env.DB, nowSec(), KEEP_DAYS);
  },
};
