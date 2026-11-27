/**
 * Mesure d'audience anonyme (voir docs/mesure-audience.md) : combien de joueurs différents, combien de temps, jusqu'à quel âge.
 * Un identifiant de joueur tiré au hasard (gardé dans le localStorage), un identifiant par partie lancée, et un signal à
 * `POST /api/ping` au lancement, à chaque passage d'âge et toutes les 60 s de jeu, onglet visible. Ni nom, ni empreinte.
 * Le temps ne compte qu'avec un geste du joueur dans les 2 dernières minutes. L'identifiant change au bout de 13 mois.
 * Le joueur peut la refuser (Paramètres › Divers) : l'identifiant est alors effacé. Rien ne part en développement ni dans les tests, sauf `?mesure` en
 * développement (le serveur de Vite renvoie alors /api vers `wrangler dev`, port 8787)
 */
import { VERSION } from './version';

const KEY = 'ceionia.audience';
/** secondes de jeu entre deux signaux */
export const PING_EVERY = 60;
/** pas de l'horloge (secondes) : un minuteur léger, sans lien avec les images */
const STEP = 5;
/** secondes sans geste du joueur (souris, clavier, toucher) au-delà desquelles le temps ne compte plus */
export const IDLE_AFTER = 120;
/** durée de vie de l'identifiant du joueur, en jours (13 mois) */
export const ID_DAYS = 396;

export type AudienceMode = 'normal' | 'sandbox' | 'hell' | 'isle';
export interface AudienceState {
  age(): number;
  mode(): AudienceMode;
  difficulty(): 'normal' | 'easy' | 'sandbox';
  lang(): 'fr' | 'en';
}
/** `at` : création de l'identifiant (ms) ; refus : `{ off: true }` sans identifiant */
interface Store { id?: string; at?: number; off?: boolean }

/** Un UUID v4 (avec `crypto.randomUUID` si le navigateur l'a) */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function read(): Store | null {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    return o && typeof o === 'object' ? o : null;
  } catch { return null; }
}
function write(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* stockage indisponible */ } }
/**
 * L'identifiant du joueur : tiré la première fois, puis de nouveau au bout de `ID_DAYS` jours. Un identifiant sans date de
 * création (premier build de la mesure) prend la date du jour
 */
export function playerId(now = Date.now()): string {
  const s = read();
  if (s && typeof s.id === 'string' && !s.off) {
    if (typeof s.at !== 'number') { write({ id: s.id, at: now }); return s.id; }
    if (now - s.at < ID_DAYS * 86400e3) return s.id;
  }
  const id = uuid();
  write({ id, at: now });
  return id;
}

/** Le joueur a refusé la mesure */
export const audienceOff = (): boolean => !!read()?.off;
/** Refuse (l'identifiant est effacé) ou accepte de nouveau (un identifiant neuf sera tiré) */
export function setAudienceOff(off: boolean) {
  if (off) write({ off: true });
  else try { localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
}

/** La mesure part-elle ? En production seulement, ou avec `?mesure` en développement */
function wanted(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (import.meta.env.MODE === 'test') return false;
  if (import.meta.env.DEV) return new URLSearchParams(location.search).has('mesure');
  return import.meta.env.PROD;
}

/** Le signal envoyé (voir `worker/ping.ts` › `Ping`) */
export function payload(player: string, session: string, kind: 'start' | 'tick' | 'age', seconds: number, st: AudienceState, launch?: 'new' | 'continue') {
  const o: Record<string, unknown> = {
    p: player, s: session, k: kind, t: Math.max(0, Math.round(seconds)), a: st.age(), m: st.mode(), d: st.difficulty(), l: st.lang(),
    b: VERSION,
  };
  if (launch) o.r = launch;
  return JSON.stringify(o);
}

function send(body: string) {
  try {
    // (texte brut : pas de requête préalable du navigateur ; aucune erreur visible si le serveur ne répond pas)
    if (navigator.sendBeacon?.(new URL('api/ping', location.href).href, new Blob([body], { type: 'text/plain' }))) return;
    void fetch('api/ping', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
  } catch { /* rien */ }
}

export interface Audience { ageUp(): void; stop(): void }

/**
 * Lance la mesure pour une partie : un signal de lancement, puis toutes les `PING_EVERY` secondes d'onglet visible, et à
 * chaque passage d'âge (`ageUp`). L'onglet caché : le temps restant part, le compte s'arrête. Rien si refusée
 */
export function startAudience(st: AudienceState, launch: 'new' | 'continue'): Audience | null {
  if (!wanted() || audienceOff()) return null;
  const player = playerId(), session = uuid();
  let acc = 0, last = performance.now(), seen = last;
  // (le dernier geste du joueur : un joueur parti l'onglet ouvert ne compte plus au bout de `IDLE_AFTER` s)
  const onInput = () => { seen = performance.now(); };
  const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
  for (const e of INPUTS) window.addEventListener(e, onInput, { passive: true, capture: true });
  const visible = () => document.visibilityState === 'visible';
  // (le refus coché pendant la partie arrête tout de suite les envois)
  const out = (kind: 'start' | 'tick' | 'age', sec: number, r?: 'new' | 'continue') => { if (!audienceOff()) send(payload(player, session, kind, sec, st, r)); };
  const tick = () => {
    const t = performance.now(), dt = (t - last) / 1000;
    last = t;
    // (un minuteur en retard, ordinateur en veille : au plus deux pas comptés)
    if (visible() && t - seen < IDLE_AFTER * 1000) acc += Math.min(dt, STEP * 2);
    if (acc >= PING_EVERY) { out('tick', acc); acc = 0; }
  };
  const onVis = () => {
    if (visible()) { last = performance.now(); return; }
    tick();
    if (acc >= 1) { out('tick', acc); acc = 0; }
  };
  out('start', 0, launch);
  const timer = setInterval(tick, STEP * 1000);
  document.addEventListener('visibilitychange', onVis);
  return {
    ageUp() { tick(); out('age', acc); acc = 0; },
    stop() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      for (const e of INPUTS) window.removeEventListener(e, onInput, { capture: true });
    },
  };
}
