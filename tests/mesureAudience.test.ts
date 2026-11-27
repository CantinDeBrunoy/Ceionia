import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGE_NAMES, creditedSeconds, MAX_NEW_PLAYERS_DAY, MAX_SECONDS, parisDay, parisMidnight, parsePing, readBody, type Ping } from '../worker/ping';
import { dayBefore, duration, loadReport, PAGE, purge } from '../worker/stats';
import { loginPage, playerColor, playerName, reportPage } from '../worker/bo';
import { newSession, sessionValid, SESSION_DAYS, STATE_SECONDS } from '../worker/auth';
import { backOffice, ping, recordPing, type Env } from '../worker/index';
import type { D1Database, D1Statement, RateLimit } from '../worker/d1';
import { AGES } from '../src/build/catalog';
import { audienceOff, ID_DAYS, payload, playerId, setAudienceOff, startAudience, uuid } from '../src/audience';

// ---------- un faux D1 : la vraie base SQLite en mémoire, avec le schéma des migrations ----------
function fakeD1(): D1Database & { sql: DatabaseSync } {
  const sql = new DatabaseSync(':memory:');
  for (const f of ['0001_mesure_audience.sql', '0002_index_rapport.sql', '0003_temps_par_age.sql']) sql.exec(readFileSync(`migrations/${f}`, 'utf8'));
  const stmt = (q: string, v: unknown[] = []): D1Statement & { exec(): unknown[] } => ({
    bind: (...b: unknown[]) => stmt(q, b),
    exec: () => sql.prepare(q).all(...(v as never[])).map((r) => ({ ...r })),
    first: async <T>() => ((sql.prepare(q).get(...(v as never[])) as T | undefined) ?? null),
    all: async <T>() => ({ results: sql.prepare(q).all(...(v as never[])).map((r) => ({ ...r })) as T[] }),
    run: async () => sql.prepare(q).run(...(v as never[])),
  });
  return {
    sql,
    prepare: (q: string) => stmt(q),
    batch: async (list: D1Statement[]) => {
      sql.exec('BEGIN');
      try { const out = list.map((s) => ({ results: (s as ReturnType<typeof stmt>).exec() })); sql.exec('COMMIT'); return out; }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
  };
}
const limiter = (max: number): RateLimit & { seen: string[] } => {
  const n = new Map<string, number>(), seen: string[] = [];
  return { seen, limit: async ({ key }) => { seen.push(key); n.set(key, (n.get(key) ?? 0) + 1); return { success: n.get(key)! <= max }; } };
};

const P = '0f8fad5b-d9cb-469f-a165-70867728950e', S = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ok = { p: P, s: S, k: 'tick', t: 60, a: 2, m: 'normal', d: 'easy', l: 'fr', b: '2026-11-26.972bc4e' };
const js = (o: object) => JSON.stringify(o);
const NOW = Date.UTC(2026, 10, 26, 14) / 1000;
const pingOf = (o: Partial<Ping>) => ({ ...ok, ...o }) as Ping;

describe('mesure d’audience : validation des signaux', () => {
  it('accepte un signal bien formé et ne garde que les champs connus', () => {
    expect(parsePing(js({ ...ok, extra: 'x', r: 'new' }))).toEqual({ ...ok, r: 'new' });
  });
  it('refuse les types, tailles et valeurs hors liste', () => {
    const bad: [string, object][] = [
      ['joueur', { p: 'pas-un-uuid' }], ['joueur', { p: P.toUpperCase() }], ['partie', { s: 3 }], ['type', { k: 'boom' }],
      ['secondes', { t: -1 }], ['secondes', { t: 1.5 }], ['secondes', { t: 99999 }], ['âge', { a: 6 }], ['âge', { a: '2' }],
      ['mode', { m: 'admin' }], ['difficulté', { d: 'hard' }], ['langue', { l: 'de' }], ['version', { b: '<script>' }],
      ['version', { b: 'x'.repeat(33) }], ['lancement', { r: 'peut-être' }],
    ];
    for (const [why, o] of bad) expect(parsePing(js({ ...ok, ...o }))).toBe(why);
    expect(parsePing('{')).toBe('JSON illisible');
    expect(parsePing('[1]')).toBe('pas un objet');
    expect(parsePing(js({ ...ok, pad: 'x'.repeat(700) }))).toBe('trop long');
  });
  it('les âges du serveur suivent ceux du jeu', () => {
    expect(AGE_NAMES).toEqual(AGES.map((a) => a.name));
  });
  it('borne les secondes créditées par le temps réel écoulé', () => {
    expect(creditedSeconds({ k: 'start', t: 60 }, 1000, 0)).toBe(0);
    expect(creditedSeconds({ k: 'tick', t: 60 }, 1000, 900)).toBe(60);
    expect(creditedSeconds({ k: 'tick', t: 60 }, 1000, 995)).toBe(15);
    expect(creditedSeconds({ k: 'tick', t: 3600 }, 10000, 0)).toBe(MAX_SECONDS);
    expect(creditedSeconds({ k: 'age', t: 30 }, 1000, 1010)).toBe(10);
  });
  it('jours et minuit à l’heure de Paris', () => {
    // 23 h 30 UTC le 26 novembre : déjà le 27 à Paris (UTC+1)
    const t = Date.UTC(2026, 10, 26, 23, 30) / 1000;
    expect(parisDay(t)).toBe('2026-11-27');
    expect(parisMidnight(t)).toBe(Date.UTC(2026, 10, 26, 23) / 1000);
    // l'été (UTC+2)
    expect(parisMidnight(Date.UTC(2026, 6, 14, 12) / 1000)).toBe(Date.UTC(2026, 6, 13, 22) / 1000);
    expect(dayBefore('2026-03-01', 1)).toBe('2026-02-28');
  });
  it('lit un corps borné, même sans content-length', async () => {
    const stream = (n: number) => new Response('x'.repeat(n)).body;
    expect(await readBody(stream(100), 600)).toBe('x'.repeat(100));
    expect(await readBody(stream(5000), 600)).toBeNull();
    expect(await readBody(null, 600)).toBe('');
  });
});

describe('mesure d’audience : enregistrement', () => {
  let db: ReturnType<typeof fakeD1>;
  beforeEach(() => { db = fakeD1(); });
  const row = (q: string) => ({ ...(db.sql.prepare(q).get() as object) }) as Record<string, number | string | null>;

  it('seul le lancement crée une partie, sans temps ; les secondes suivent ensuite le temps réel', async () => {
    expect(await recordPing(db, pingOf({ k: 'tick', t: 60 }), NOW)).toBe('inconnue');
    expect(row('SELECT COUNT(*) AS n FROM players').n).toBe(0);
    expect(await recordPing(db, pingOf({ k: 'start', t: 0, r: 'new', a: 1 }), NOW)).toBe('ok');
    expect(await recordPing(db, pingOf({ k: 'tick', t: 60, a: 1 }), NOW + 30)).toBe('ok');
    expect(await recordPing(db, pingOf({ k: 'age', t: 50, a: 3 }), NOW + 90)).toBe('ok');
    expect(row('SELECT seconds, max_age, sessions FROM players')).toEqual({ seconds: 40 + 50, max_age: 3, sessions: 1 });
    expect(row('SELECT seconds, start_age, max_age, launch FROM sessions')).toEqual({ seconds: 90, start_age: 1, max_age: 3, launch: 'new' });
    expect(row('SELECT day, seconds FROM days')).toEqual({ day: '2026-11-26', seconds: 90 });
    // le temps d'avant le changement d'âge reste à l'âge d'avant, la suite va au nouvel âge
    await recordPing(db, pingOf({ k: 'tick', t: 60, a: 3 }), NOW + 150);
    expect(db.sql.prepare('SELECT age, seconds FROM player_ages ORDER BY age').all().map((x) => ({ ...(x as object) })))
      .toEqual([{ age: 1, seconds: 90 }, { age: 3, seconds: 60 }]);
  });
  it('une partie d’un autre joueur est refusée, le bac à sable ne compte pas dans l’âge atteint', async () => {
    await recordPing(db, pingOf({ k: 'start', m: 'sandbox', d: 'sandbox', a: 5 }), NOW);
    expect(await recordPing(db, pingOf({ k: 'tick', p: uuid() }), NOW + 60)).toBe('conflit');
    expect(row('SELECT max_age FROM players').max_age).toBe(-1);
    await recordPing(db, pingOf({ k: 'tick', m: 'sandbox', d: 'sandbox', a: 5, t: 60 }), NOW + 60);
    expect(row('SELECT COUNT(*) AS n FROM player_ages').n).toBe(0);
  });
  it('plafond des nouveaux joueurs par jour', async () => {
    const ins = db.sql.prepare("INSERT INTO players VALUES (?, ?, ?, 0, -1, 'fr', 'x', 1)");
    for (let i = 0; i < MAX_NEW_PLAYERS_DAY; i++) ins.run(`j${i}`, NOW - 60, NOW - 60);
    expect(await recordPing(db, pingOf({ k: 'start', p: uuid(), s: uuid() }), NOW)).toBe('plafond');
    // un joueur déjà connu peut toujours lancer une partie
    ins.run(P, NOW - 3 * 86400, NOW - 3 * 86400);
    expect(await recordPing(db, pingOf({ k: 'start' }), NOW)).toBe('ok');
  });
  it('la purge efface ce qui a plus de 13 mois', async () => {
    const old = NOW - 400 * 86400;
    await recordPing(db, pingOf({ k: 'start' }), old);
    await recordPing(db, pingOf({ k: 'start', p: uuid(), s: uuid() }), NOW);
    await purge(db, NOW, 396);
    expect(row('SELECT COUNT(*) AS n FROM players').n).toBe(1);
    expect(row('SELECT COUNT(*) AS n FROM sessions').n).toBe(1);
    expect(row('SELECT COUNT(*) AS n FROM days').n).toBe(1);
    db.sql.exec("INSERT INTO player_ages VALUES ('parti', 0, 60)");
    await purge(db, NOW, 396);
    expect(row('SELECT COUNT(*) AS n FROM player_ages').n).toBe(0);
  });
});

describe('mesure d’audience : la requête /api/ping', () => {
  const req = (body: BodyInit | null, headers: Record<string, string> = {}, method = 'POST') =>
    new Request('https://ceionia.test/api/ping', { method, body, headers: { 'cf-connecting-ip': '203.0.113.7', ...headers } });
  const start = js({ ...ok, k: 'start', t: 0 });

  it('origine, méthode, taille, limiteurs', async () => {
    const env: Env = { DB: fakeD1(), PING_IP: limiter(2), PING_LIMIT: limiter(100) };
    expect((await ping(req(null, {}, 'GET'), env)).status).toBe(405);
    expect((await ping(req(start, { origin: 'https://ailleurs.example' }), env)).status).toBe(403);
    expect((await ping(req(start, { origin: 'https://ceionia.test' }), env)).status).toBe(204);
    expect((await ping(req('x'.repeat(5000)), env)).status).toBe(413);
    // la troisième requête de la même adresse dans la minute : refusée, quel que soit l'identifiant du joueur
    expect((await ping(req(js({ ...ok, k: 'start', p: uuid(), s: uuid() })), env)).status).toBe(429);
    expect((env.PING_IP as ReturnType<typeof limiter>).seen.every((k) => k === '203.0.113.7')).toBe(true);
  });
  it('par joueur aussi, et une partie inconnue est refusée', async () => {
    const env: Env = { DB: fakeD1(), PING_LIMIT: limiter(1) };
    expect((await ping(req(js(ok)), env)).status).toBe(409);
    expect((await ping(req(start), env)).status).toBe(429);
  });
  it('sans base : accepté et ignoré ; base en panne : 503', async () => {
    expect((await ping(req(start), {})).status).toBe(204);
    const broken = { prepare: () => { throw new Error('panne'); }, batch: async () => [] } as unknown as D1Database;
    expect((await ping(req(start), { DB: broken })).status).toBe(503);
  });
});

describe('mesure d’audience : connexion au back-office', () => {
  const sec = { key: 'secret-de-l-application\u000090508998', salt: 'sel' };
  it('session signée : échéance, falsification, révocation par le secret ou le sel', async () => {
    const c = await newSession(sec, NOW);
    expect(await sessionValid(c, sec, NOW + 60)).toBe(true);
    expect(await sessionValid(c, sec, NOW + SESSION_DAYS * 86400 + 1)).toBe(false);
    expect(await sessionValid(c.replace(/^\d+/, String(NOW + 9e6)), sec, NOW)).toBe(false);
    expect(await sessionValid(c, { ...sec, salt: 'autre' }, NOW)).toBe(false);
    expect(await sessionValid(c, { ...sec, key: 'autre' }, NOW)).toBe(false);
    expect(await sessionValid('', sec, NOW)).toBe(false);
    expect(c).not.toContain('secret');
  });
});

describe('mesure d’audience : connexion GitHub', () => {
  const ADMIS = 90508998, AUTRE = 4242;
  const base = (): Env => ({ DB: fakeD1(), GITHUB_CLIENT_ID: 'id-app', GITHUB_CLIENT_SECRET: 'secret-app', BO_GITHUB_ID: String(ADMIS), BO_SALT: 'sel', BO_LOGIN: limiter(50) });
  const r = (env: Env, path: string, init: RequestInit = {}) => backOffice(new Request(`https://ceionia.test${path}`, init), env, NOW);
  /** GitHub simulé : le jeton contre le bon code, puis le compte `account` ; chaque appel est noté */
  let calls: { url: string; init: RequestInit }[] = [];
  const github = (account: number | 'panne' | 'code refusé') => {
    calls = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      calls.push({ url, init });
      if (account === 'panne') throw new TypeError('réseau');
      if (url === 'https://github.com/login/oauth/access_token') {
        const code = new URLSearchParams(String(init.body)).get('code');
        return Response.json(code === 'bon-code' && account !== 'code refusé' ? { access_token: 'gho_jeton', token_type: 'bearer', scope: '' } : { error: 'bad_verification_code' });
      }
      if (url === 'https://api.github.com/user') return Response.json({ id: account, login: 'quelqu-un' });
      if (url === 'https://api.github.com/applications/id-app/token') return new Response(null, { status: 204 });
      return new Response('inconnu', { status: 404 });
    });
  };
  afterEach(() => vi.unstubAllGlobals());
  /** /bo/login, puis le retour de GitHub avec ce `state` et ce code */
  const login = async (env: Env) => {
    const res = await r(env, '/bo/login');
    const state = /ceionia_bo_etat=([0-9a-f]+)/.exec(res.headers.get('set-cookie') ?? '')![1];
    return { res, state, back: (q: string, cookie = `ceionia_bo_etat=${state}`) => r(env, `/bo/callback?${q}`, { headers: { cookie } }) };
  };

  it('sans session : la page propose GitHub, plus de clé', async () => {
    const env = base();
    const res = await r(env, '/bo');
    expect(res.status).toBe(401);
    const page = await res.text();
    expect(page).toContain('Se connecter avec GitHub');
    expect(page).not.toContain('type="password"');
    expect((await r(env, '/bo', { method: 'POST', body: new URLSearchParams({ key: 'x' }) })).status).toBe(405);
    expect((await r({ ...env, GITHUB_CLIENT_SECRET: undefined }, '/bo')).status).toBe(503);
    expect((await r({ ...env, BO_GITHUB_ID: 'CantinDeBrunoy' }, '/bo')).status).toBe(503);
  });

  it('/bo/login renvoie vers GitHub sans scope, avec un state gardé dans un cookie court', async () => {
    const { res, state } = await login(base());
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location')!);
    expect(to.origin + to.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(to.searchParams.get('client_id')).toBe('id-app');
    expect(to.searchParams.get('redirect_uri')).toBe('https://ceionia.test/bo/callback');
    expect(to.searchParams.get('state')).toBe(state);
    expect(to.searchParams.has('scope')).toBe(false);
    expect(state).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers.get('set-cookie')).toBe(`ceionia_bo_etat=${state}; Path=/bo/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=${STATE_SECONDS}`);
    expect((await login(base())).state).not.toBe(state);
  });

  it('state absent ou faux : refusé sans appeler GitHub', async () => {
    github(ADMIS);
    const { state, back } = await login(base());
    for (const res of [
      await back('code=bon-code'),
      await back(`code=bon-code&state=${state}`, ''),
      await back(`code=bon-code&state=${'0'.repeat(64)}`),
      await back(`code=bon-code&state=${state}`, `ceionia_bo_etat=${'0'.repeat(64)}`),
      await back('code=bon-code&state=', 'ceionia_bo_etat='),
    ]) {
      expect(res.status).toBe(400);
      expect(res.headers.get('set-cookie')).toContain('ceionia_bo_etat=; Path=/bo/callback');
      expect(res.headers.get('set-cookie')).not.toMatch(/ceionia_bo=\d/);
      expect(await res.text()).toContain('expiré');
    }
    expect(calls).toEqual([]);
  });

  it('compte refusé : 403, sans rien dire du compte admis, jeton révoqué', async () => {
    github(AUTRE);
    const { state, back } = await login(base());
    const res = await back(`code=bon-code&state=${state}`);
    expect(res.status).toBe(403);
    const page = await res.text();
    expect(page).toContain('Ce compte GitHub n’a pas accès');
    expect(page).not.toContain(String(ADMIS));
    expect(page).not.toContain('quelqu-un');
    expect(res.headers.get('set-cookie')).not.toMatch(/ceionia_bo=\d/);
    expect(calls.at(-1)!.url).toBe('https://api.github.com/applications/id-app/token');
    expect(calls.at(-1)!.init.method).toBe('DELETE');
  });

  it('compte accepté : le cookie de session est posé, le jeton ne sert qu’une fois', async () => {
    github(ADMIS);
    const env = base();
    const { state, back } = await login(env);
    const res = await back(`code=bon-code&state=${state}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('url=/bo');
    const cookies = res.headers.getSetCookie();
    expect(cookies).toContain('ceionia_bo_etat=; Path=/bo/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    const session = cookies.find((c) => c.startsWith('ceionia_bo='))!;
    expect(session).toMatch(/^ceionia_bo=\d+\.[0-9a-f]{64}; Path=\/bo; HttpOnly; Secure; SameSite=Strict; Max-Age=604800$/);
    expect(session).not.toContain('gho_jeton');
    // GitHub : le jeton contre le code (avec le secret), le compte (User-Agent générique), puis la révocation du jeton
    expect(calls.map((c) => c.url)).toEqual(['https://github.com/login/oauth/access_token', 'https://api.github.com/user', 'https://api.github.com/applications/id-app/token']);
    const token = new URLSearchParams(String(calls[0].init.body));
    expect(token.get('client_secret')).toBe('secret-app');
    expect(token.get('redirect_uri')).toBe('https://ceionia.test/bo/callback');
    const h = new Headers(calls[1].init.headers);
    expect(h.get('authorization')).toBe('Bearer gho_jeton');
    expect(h.get('user-agent')).toBe('ceionia-back-office');
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ access_token: 'gho_jeton' });
    // la session ouvre le rapport, plus rien avec un autre sel ou un autre compte admis
    const value = session.split(';')[0];
    const page = await r(env, '/bo', { headers: { cookie: value } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Joueurs différents');
    expect((await r({ ...env, BO_SALT: 'autre' }, '/bo', { headers: { cookie: value } })).status).toBe(401);
    expect((await r({ ...env, BO_GITHUB_ID: String(AUTRE) }, '/bo', { headers: { cookie: value } })).status).toBe(401);
    expect((await r(env, '/bo/sortie')).status).toBe(405);
    expect((await r(env, '/bo/sortie', { method: 'POST' })).headers.get('set-cookie')).toBe('ceionia_bo=; Path=/bo; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    expect((await r({ ...env, DB: undefined }, '/bo', { headers: { cookie: value } })).status).toBe(200);
  });

  it('code refusé, connexion annulée, GitHub en panne', async () => {
    github('code refusé');
    let l = await login(base());
    let res = await l.back(`code=bon-code&state=${l.state}`);
    expect(res.status).toBe(502);
    expect(calls.map((c) => c.url)).toEqual(['https://github.com/login/oauth/access_token']);
    l = await login(base());
    res = await l.back(`error=access_denied&state=${l.state}`);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('annulée');
    github('panne');
    l = await login(base());
    res = await l.back(`code=bon-code&state=${l.state}`);
    expect(res.status).toBe(502);
    expect(res.headers.get('set-cookie')).not.toMatch(/ceionia_bo=\d/);
  });

  it('le limiteur garde /bo/login et /bo/callback', async () => {
    github(ADMIS);
    const env = { ...base(), BO_LOGIN: limiter(2) };
    const { state, back } = await login(env);
    expect((await back(`code=faux&state=${state}`)).status).toBe(502);
    expect((await r(env, '/bo/login')).status).toBe(429);
    const late = await back(`code=bon-code&state=${state}`);
    expect(late.status).toBe(429);
    expect(late.headers.get('set-cookie')).toBeNull();
    expect((await r(env, '/bo/login', { method: 'POST' })).status).toBe(405);
  });
});

describe('mesure d’audience : rapport calculé par la base', () => {
  it('joueurs du jour et de la semaine, temps, médianes, âges, 30 jours, pages', async () => {
    const db = fakeD1(), day = 86400;
    const pl = db.sql.prepare('INSERT INTO players VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
    pl.run('a', NOW - day, NOW, 600, 1, 'fr', 'x');
    pl.run('b', NOW - 4 * day, NOW - 3 * day, 1200, 2, 'en', 'x');
    pl.run('c', NOW - 11 * day, NOW - 10 * day, 60, 0, '<b>', 'x');
    pl.run('d', NOW - 2 * day, NOW - 2 * day, 0, -1, 'fr', 'x');
    const se = db.sql.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, 0, ?, 'normal', 'normal', 'new', 'x')");
    se.run('s1', 'a', NOW, NOW, 300, 1); se.run('s2', 'a', NOW - day, NOW - day, 300, 0); se.run('s3', 'b', NOW - 3 * day, NOW - 3 * day, 1260, 2);
    db.sql.exec("INSERT INTO days VALUES ('2026-11-26', 'a', 600), ('2026-11-23', 'b', 1260), ('2026-01-01', 'z', 9)");
    const r = await loadReport(db, NOW);
    expect(r.players).toEqual({ today: 1, week: 3, total: 4, idle: 1 });
    expect(r.sessions).toEqual({ today: 1, total: 3 });
    expect(r.time.total).toBe(1860);
    expect(r.time.perPlayer).toEqual({ mean: 465, median: 330 });
    expect(r.time.perSession).toEqual({ mean: 620, median: 300 });
    expect(r.ages.map((a) => a.players)).toEqual([1, 1, 1, 0, 0, 0]);
    expect(r.sandboxOnly).toBe(1);
    expect(r.days).toHaveLength(30);
    expect(r.days[29]).toEqual({ day: '2026-11-26', players: 1, seconds: 600 });
    expect(r.days[26]).toEqual({ day: '2026-11-23', players: 1, seconds: 1260 });
    expect(r.list.map((p) => p.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(r.list[0].sessions).toBe(2);
    const html = reportPage(r);
    expect(html).toContain('&#60;b&#62;');
    expect(html).not.toContain('<td><b>');
    expect(html).toContain('10 min');
    expect(loginPage('refuse')).toContain('Ce compte GitHub n’a pas accès');
    expect(loginPage()).toContain('href="/bo/login"');
  });
  it('âge atteint en jouant : rouvrir une vieille sauvegarde ne compte pas (cas réel, 27 nov. 2026)', async () => {
    const db = fakeD1();
    db.sql.prepare("INSERT INTO players VALUES ('ami', ?, ?, 4269, 4, 'fr', 'x', 4)").run(NOW - 9000, NOW);
    const se = db.sql.prepare("INSERT INTO sessions VALUES (?, 'ami', ?, ?, ?, ?, ?, 'normal', 'normal', ?, 'x')");
    se.run('o1', NOW - 9000, NOW - 9000, 20, 4, 4, 'continue');
    se.run('o2', NOW - 8900, NOW - 8900, 53, 0, 0, 'new');
    se.run('o3', NOW - 8800, NOW - 7000, 1465, 0, 1, 'continue');
    se.run('o4', NOW - 7000, NOW, 2731, 1, 2, 'continue');
    // un autre joueur n'a fait que rouvrir une partie au Moderne : faute de mieux, cet âge
    db.sql.prepare("INSERT INTO players VALUES ('vieux', ?, ?, 30, 4, 'fr', 'x', 1)").run(NOW - 100, NOW - 100);
    db.sql.prepare("INSERT INTO sessions VALUES ('v1', 'vieux', ?, ?, 30, 4, 4, 'normal', 'normal', 'continue', 'x')").run(NOW - 100, NOW - 100);
    const r = await loadReport(db, NOW);
    expect(r.ages.map((a) => a.players)).toEqual([0, 0, 1, 0, 1, 0]);
    expect(r.list.find((p) => p.id === 'ami')?.max_age).toBe(2);
  });
  it('temps par âge : la reprise des anciennes parties, un morceau coloré par joueur et par âge joué', async () => {
    const db = fakeD1();
    db.sql.exec('DELETE FROM player_ages');
    db.sql.prepare("INSERT INTO players VALUES ('ami', ?, ?, 900, 2, 'fr', 'x', 2)").run(NOW - 900, NOW);
    db.sql.prepare("INSERT INTO players VALUES ('bac', ?, ?, 600, -1, 'fr', 'x', 1)").run(NOW - 600, NOW);
    const se = db.sql.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'x')");
    se.run('a1', 'ami', NOW, NOW, 600, 0, 2, 'normal', 'normal'); // 200 s dans chacun des trois âges
    se.run('a2', 'ami', NOW, NOW, 300, 2, 2, 'normal', 'normal');
    se.run('b1', 'bac', NOW, NOW, 600, 4, 4, 'sandbox', 'sandbox');
    // (la reprise de la migration, rejouée sur ces parties)
    const mig = readFileSync('migrations/0003_temps_par_age.sql', 'utf8');
    db.sql.exec(mig.slice(mig.indexOf('INSERT OR IGNORE')));
    const r = await loadReport(db, NOW);
    expect(r.ageTime).toEqual([{ player: 'ami', age: 0, seconds: 200 }, { player: 'ami', age: 1, seconds: 200 }, { player: 'ami', age: 2, seconds: 500 }]);
    const html = reportPage(r);
    // des noms et des couleurs, partout les mêmes : trois âges joués, plus la barre de l'âge atteint
    expect(r.reached).toEqual([{ player: 'ami', age: 2 }, { player: 'bac', age: -1 }]);
    expect(html.split(`title="${playerName('ami')} (ami) :`)).toHaveLength(4);
    expect(html.split(`background:${playerColor(0)}`)).toHaveLength(6);
    expect(html.split(`background:${playerColor(1)}`)).toHaveLength(3);
    // des voisins d'arrivée bien écartés
    const hue = (i: number) => Number(/hsl\((\d+)/.exec(playerColor(i))![1]);
    for (let i = 0; i < 20; i++) expect(Math.min(Math.abs(hue(i) - hue(i + 1)), 360 - Math.abs(hue(i) - hue(i + 1)))).toBeGreaterThan(100);
    expect(playerName('ami')).toBe(playerName('ami'));
    expect(new Set(Array.from({ length: 50 }, () => playerName(uuid()))).size).toBeGreaterThan(40);
  });
  it('médiane impaire et base vide, pagination', async () => {
    const db = fakeD1();
    expect((await loadReport(db, NOW)).time.perPlayer.median).toBe(0);
    const pl = db.sql.prepare("INSERT INTO players VALUES (?, ?, ?, ?, 0, 'fr', 'x', 0)");
    for (let i = 0; i < PAGE + 5; i++) pl.run(`j${i}`, NOW - i, NOW - i, i);
    const r = await loadReport(db, NOW, 1);
    expect(r.time.perPlayer.median).toBe(52);
    expect(r.list).toHaveLength(5);
    expect(r.list[0].id).toBe(`j${PAGE}`);
  });
  it('durées lisibles', () => {
    expect(duration(45)).toBe('45 s');
    expect(duration(720)).toBe('12 min');
    expect(duration(3 * 3600 + 5 * 60)).toBe('3 h 05');
    expect(duration(3599 + 3600)).toBe('2 h 00');
    expect(duration(27664 * 3600 + 28 * 60)).toBe('27 664 h 28');
  });
});

describe('mesure d’audience : côté jeu', () => {
  const st = { age: () => 3, mode: () => 'hell' as const, difficulty: () => 'normal' as const, lang: () => 'en' as const };
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
  beforeEach(() => store.clear());

  it('le signal du jeu passe la validation du serveur', () => {
    const p = parsePing(payload(uuid(), uuid(), 'start', 0, st, 'continue'));
    expect(p).toMatchObject({ k: 'start', a: 3, m: 'hell', l: 'en', r: 'continue' });
  });
  it('l’identifiant change au bout de 13 mois, le refus l’efface', () => {
    const t = Date.UTC(2026, 0, 1);
    const id = playerId(t);
    expect(playerId(t + 100 * 86400e3)).toBe(id);
    const next = playerId(t + ID_DAYS * 86400e3);
    expect(next).not.toBe(id);
    setAudienceOff(true);
    expect(audienceOff()).toBe(true);
    expect(store.get('ceionia.audience')).not.toContain(next);
    setAudienceOff(false);
    expect(audienceOff()).toBe(false);
    // un identifiant du premier build, sans date : gardé, daté du jour
    store.set('ceionia.audience', js({ id: P }));
    expect(playerId(t)).toBe(P);
    expect(JSON.parse(store.get('ceionia.audience')!).at).toBe(t);
  });
  it('rien ne part dans les tests', () => {
    expect(startAudience(st, 'new')).toBeNull();
  });
});
