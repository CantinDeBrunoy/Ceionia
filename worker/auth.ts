/**
 * Mesure d'audience : la connexion au back-office, par GitHub (OAuth), réservée à un seul compte (`BO_GITHUB_ID`).
 * - `/bo/login` tire un `state` au hasard, le garde dans un cookie court et renvoie vers GitHub, sans aucun scope.
 * - `/bo/callback` vérifie le `state`, échange le `code` contre un jeton, lit l'identifiant numérique du compte, puis
 *   révoque le jeton : il ne sert qu'une fois et n'est jamais gardé.
 * La session est un cookie signé `échéance.signature` (HMAC-SHA256 avec le secret de l'application GitHub, le compte autorisé
 * et un sel, `BO_SALT`) : il expire de lui-même au bout de `SESSION_DAYS`, et changer le sel, le secret ou le compte révoque
 * toutes les sessions. Testé dans tests/mesureAudience.test.ts
 */

export const COOKIE = 'ceionia_bo';
export const STATE_COOKIE = 'ceionia_bo_etat';
export const SESSION_DAYS = 7;
/** durée de vie du `state` : le temps de passer par GitHub */
export const STATE_SECONDS = 600;
const enc = new TextEncoder();

async function hmac(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Comparaison à temps constant de deux textes de même longueur */
export function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

/** `key` : le secret qui signe les sessions (secret de l'application GitHub et compte autorisé), `salt` : `BO_SALT` */
export interface Secrets { key: string; salt?: string }
const signer = (s: Secrets) => `${s.key}\u0000${s.salt ?? ''}`;

/** Le cookie d'une session ouverte maintenant (`now` en secondes) */
export async function newSession(s: Secrets, now: number): Promise<string> {
  const exp = now + SESSION_DAYS * 86400;
  return `${exp}.${await hmac(signer(s), `session:${exp}`)}`;
}

/** Le cookie est-il une session valide et pas encore échue ? */
export async function sessionValid(cookie: string, s: Secrets, now: number): Promise<boolean> {
  const m = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(cookie);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp <= now || exp > now + SESSION_DAYS * 86400 + 60) return false;
  return same(m[2], await hmac(signer(s), `session:${exp}`));
}

export const cookieOf = (header: string | null, name = COOKIE) =>
  (header ?? '').split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
export const setCookie = (value: string, maxAge: number) => `${COOKIE}=${value}; Path=/bo; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
/** (Lax : le cookie doit revenir avec la navigation depuis github.com vers /bo/callback) */
export const setStateCookie = (value: string, maxAge: number) => `${STATE_COOKIE}=${value}; Path=/bo/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

/** Un `state` neuf : 32 octets tirés au hasard, en hexadécimal */
export function newState(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Le `state` revenu de GitHub est-il celui du cookie ? */
export const stateMatches = (given: string | null, cookie: string) => !!given && /^[0-9a-f]{64}$/.test(cookie) && same(given, cookie);

// --- GitHub ---
export const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
export const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
export const GITHUB_API = 'https://api.github.com';
/** un nom de client générique, sans rien qui désigne l'auteur */
const UA = 'ceionia-back-office';
const TIMEOUT = 8000;

export interface GitHubApp { clientId: string; clientSecret: string }

/** L'adresse de GitHub où l'auteur accepte la connexion : aucun scope (l'identifiant public suffit) */
export function authorizeUrl(app: GitHubApp, state: string, redirectUri: string): string {
  const q = new URLSearchParams({ client_id: app.clientId, redirect_uri: redirectUri, state, allow_signup: 'false' });
  return `${GITHUB_AUTHORIZE}?${q}`;
}

/**
 * Échange le `code` contre un jeton, lit l'identifiant numérique du compte, puis révoque le jeton.
 * `null` : GitHub a refusé le code ou répondu autre chose que prévu. Une panne du réseau lève une erreur
 */
export async function githubAccountId(app: GitHubApp, code: string, redirectUri: string): Promise<number | null> {
  const res = await fetch(GITHUB_TOKEN, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) return null;
  const token = ((await res.json()) as { access_token?: unknown }).access_token;
  if (typeof token !== 'string' || !token) return null;
  try {
    const user = await fetch(`${GITHUB_API}/user`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': UA },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!user.ok) return null;
    const id = ((await user.json()) as { id?: unknown }).id;
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
  } finally {
    // le jeton ne sert qu'une fois : révoqué tout de suite (une erreur ici ne change rien à la connexion)
    await fetch(`${GITHUB_API}/applications/${encodeURIComponent(app.clientId)}/token`, {
      method: 'DELETE',
      headers: { authorization: `Basic ${btoa(`${app.clientId}:${app.clientSecret}`)}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': UA },
      body: JSON.stringify({ access_token: token }),
      signal: AbortSignal.timeout(TIMEOUT),
    }).catch(() => undefined);
  }
}
