/**
 * Le relevage du galion englouti : le calendrier du travail (sans rien de dessiné), pour que la mise en scène et les tests
 * s'appuient sur les mêmes chiffres. Tout se mesure à l'avancement `k` (0 … 1) du travail sur place.
 *
 * Le bateau de relevage arrive au large (k < W0), puis la grue remonte six charges (de deux pièces chacune), l'une après l'autre,
 * puis le coffre doré du fond (le grand final) ; le bateau repart ensuite (voir `stepBoat`, il rentre à partir de 0,8).
 */
export const W0 = 0.2;
/** Part du travail d'une charge, et nombre de charges ordinaires */
export const WH = 0.075;
export const NH = 6;
/** Début du grand final (le coffre doré), et sa fin : le butin est tout remonté */
export const WF = W0 + NH * WH;
export const WEND = 0.79;
/** Le plongeur remonte à bord, et l'équipe fête la trouvaille */
export const DIVE_UP = 0.77;
export const DIVE_DOWN = 0.19;
export const DIVE_BACK = 0.82;
/** Pièces de butin sur le pont (deux par charge) */
export const LOOT = NH * 2;

export const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (t: number) => Math.max(0, Math.min(1, t));

/** La charge en cours : son rang (NH : le coffre doré) et où l'on en est (0 … 1) */
export interface Haul { i: number; f: number }

/** Quelle charge la grue remonte-t-elle à l'avancement `k` ? Null avant l'arrivée et après le final */
export function haulAt(k: number): Haul | null {
  if (k < W0 || k >= WEND) return null;
  if (k < WF) { const u = (k - W0) / WH, i = Math.min(NH - 1, Math.floor(u)); return { i, f: Math.min(1, u - i) }; }
  return { i: NH, f: Math.min(1, (k - WF) / (WEND - WF)) };
}

/**
 * Le mouvement de la grue au long d'une charge (f : 0 … 1) : elle descend au fond (`lift` 0 → 1), accroche (`loaded` dès 0,3),
 * remonte, pivote jusqu'au pont (`toDeck`), s'abaisse (`low`) et lâche (`released` dès 0,8), se relève et revient au fond pour la
 * suivante (`toNext`)
 */
export interface Crane { lift: number; low: number; toDeck: number; toNext: number; loaded: boolean; released: boolean }
export function craneAt(f: number): Crane {
  const lift = f < 0.26 ? smooth(f / 0.26) : f < 0.34 ? 1 : f < 0.52 ? 1 - smooth((f - 0.34) / 0.18) : 0;
  const toDeck = f < 0.52 ? 0 : f < 0.72 ? smooth((f - 0.52) / 0.2) : 1;
  const toNext = f < 0.86 ? 0 : smooth((f - 0.86) / 0.14);
  const low = f < 0.72 ? 0 : f < 0.84 ? smooth(clamp((f - 0.72) / 0.08)) : f < 0.9 ? 1 - smooth((f - 0.84) / 0.06) : 0;
  return { lift, low, toDeck, toNext, loaded: f >= 0.3 && f < 0.8, released: f >= 0.8 };
}

/** Combien de pièces de butin sont déjà sur le pont à l'avancement `k`, et le coffre doré y est-il ? */
export function lootAt(k: number): { items: number; prize: boolean } {
  if (k >= WEND) return { items: LOOT, prize: true };
  const h = haulAt(k);
  if (!h) return { items: 0, prize: false };
  const done = craneAt(h.f).released;
  if (h.i >= NH) return { items: LOOT, prize: done };
  return { items: h.i * 2 + (done ? 2 : 0), prize: false };
}

/** Où en est le scaphandrier : à bord, il descend (u : 0 … 1), il travaille sur l'épave, il remonte (u), il est revenu */
export type DivePhase = { s: 'deck' } | { s: 'down'; u: number } | { s: 'work' } | { s: 'up'; u: number } | { s: 'back' };
export function diveAt(k: number): DivePhase {
  if (k < DIVE_DOWN) return { s: 'deck' };
  if (k < W0 + 0.04) return { s: 'down', u: (k - DIVE_DOWN) / (W0 + 0.04 - DIVE_DOWN) };
  if (k < DIVE_UP) return { s: 'work' };
  if (k < DIVE_BACK) return { s: 'up', u: (k - DIVE_UP) / (DIVE_BACK - DIVE_UP) };
  return { s: 'back' };
}

/**
 * Un angle ramené à [0, 2π[ : la grue pivote toujours dans le même sens entre l'épave et le pont (sans repasser par l'autre
 * côté quand le point visé est de l'autre côté de l'axe)
 */
export const turn = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

/** Position polaire (angle, portée) d'un point (x, z) autour du pivot (px, pz) de la flèche, portée bornée à celle de la flèche */
export function polar(x: number, z: number, px: number, pz: number, min = 0.08, max = 0.42): [number, number] {
  return [turn(Math.atan2(x - px, z - pz)), Math.max(min, Math.min(max, Math.hypot(x - px, z - pz)))];
}

/** Mélange deux positions polaires (le même sens de rotation) */
export function mixPolar(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
