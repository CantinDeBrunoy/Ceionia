/**
 * Mesure d'audience : la connexion au back-office. La clé (`BO_KEY`) se donne par un formulaire POST, jamais dans l'adresse.
 * La session est un cookie signé `échéance.signature` (HMAC-SHA256 avec la clé et un sel, `BO_SALT`) : il expire de lui-même
 * au bout de `SESSION_DAYS`, et changer la clé ou le sel révoque toutes les sessions. Le cookie ne permet pas de retrouver
 * la clé. Testé dans tests/mesureAudience.test.ts
 */

export const COOKIE = 'ceionia_bo';
export const SESSION_DAYS = 7;
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

export interface Secrets { key: string; salt?: string }
const signer = (s: Secrets) => `${s.key}\u0000${s.salt ?? ''}`;

/** La clé donnée est-elle la bonne ? (empreintes de même longueur comparées à temps constant) */
export async function keyMatches(given: string, s: Secrets): Promise<boolean> {
  const [a, b] = await Promise.all([hmac('ceionia-bo-cle', given), hmac('ceionia-bo-cle', s.key)]);
  return same(a, b);
}

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

export const cookieOf = (header: string | null) => (header ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
export const setCookie = (value: string, maxAge: number) => `${COOKIE}=${value}; Path=/bo; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
