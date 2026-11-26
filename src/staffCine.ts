/**
 * La cinématique du vol du bâton du fondateur (voir `docs/lore-enfers.md`) : sa partition, sans rien de graphique (la mise en
 * scène est dans `staffStage.ts`). Jouée en direct dans le moteur, comme celles du portail et de la chute du roi (l'auteur n'a
 * que l'offre gratuite de Flow : pas de vidéo), une fois par partie, juste avant la carte du grand choix de la fin de
 * l'Antiquité (ou, à défaut, juste avant la cinématique du portail). Quatre plans sur la grande place :
 * - **le calme** : la vue descend vers le bâton, planté sur la place depuis la fondation ; le ciel s'assombrit ;
 * - **la faille** : la terre tremble, une faille rouge s'ouvre à côté du bâton ;
 * - **les démons** : trois démons en sortent, le chef arrache le bâton ;
 * - **sous terre** : ils redescendent avec lui, la faille se referme, il ne reste qu'une brûlure et le socle vide.
 * Habillage des autres cinématiques : bandes noires, bandeaux dorés avec un sous-titre, « Passer » en deux temps.
 */

export type TheftShot = 'calm' | 'rift' | 'demons' | 'gone';

/** Les plans et leur durée (s), ≈ 15 s en tout */
export const THEFT_PLAN: readonly { id: TheftShot; dur: number }[] = [
  { id: 'calm', dur: 3.5 },
  { id: 'rift', dur: 2.8 },
  { id: 'demons', dur: 4.6 },
  { id: 'gone', dur: 4.2 },
];
export const THEFT_TOTAL = THEFT_PLAN.reduce((s, p) => s + p.dur, 0);

/** Les bandeaux : à quel moment du plan (s) ils paraissent, combien de temps ils restent ; textes français */
export const THEFT_CAPTIONS: { shot: TheftShot; at: number; dur: number; text: string; sub?: string }[] = [
  { shot: 'calm', at: 0.5, dur: 2.8, text: 'Le bâton du fondateur', sub: 'Planté le premier jour du village' },
  { shot: 'demons', at: 0.8, dur: 3.4, text: 'Les démons surgissent', sub: 'Ils arrachent le bâton' },
  { shot: 'gone', at: 1.2, dur: 2.8, text: 'Le bâton est aux Enfers', sub: 'Sous la terre, chez le roi démon' },
];

/** Les moments clés (s, au temps du plan) : le chef saisit le bâton, la faille commence à se refermer */
export const GRAB_AT = 2.6, CLOSE_AT = 1.9;
/** Le fondu au noir des dernières secondes, puis la main au joueur */
export const THEFT_FADE = 0.7;

/** Où en est la cinématique à l'instant t : le plan, son avancée (0 … 1) et le temps passé dedans ; null une fois finie */
export function theftShotAt(t: number): { shot: TheftShot; k: number; local: number } | null {
  let t0 = 0;
  for (const p of THEFT_PLAN) {
    if (t < t0 + p.dur) return { shot: p.id, k: Math.max(0, (t - t0) / p.dur), local: Math.max(0, t - t0) };
    t0 += p.dur;
  }
  return null;
}

/** L'instant où commence un plan */
export function theftShotStart(shot: TheftShot): number {
  let t0 = 0;
  for (const p of THEFT_PLAN) { if (p.id === shot) return t0; t0 += p.dur; }
  return 0;
}

/** Le bandeau visible à l'instant t (il paraît et s'efface en douceur), ou null */
export function theftCaptionAt(t: number): { text: string; sub?: string; alpha: number } | null {
  for (const c of THEFT_CAPTIONS) {
    const s = t - (theftShotStart(c.shot) + c.at);
    if (s >= 0 && s < c.dur) return { text: c.text, sub: c.sub, alpha: Math.min(1, s / 0.6, (c.dur - s) / 0.6) };
  }
  return null;
}

/** Le ciel qui s'assombrit (0 … 1) : il monte pendant le calme, tient, et se lève à peine à la fin */
export function theftTintAt(t: number): number {
  const rise = Math.min(1, Math.max(0, (t - 1.2) / 3));
  const fall = Math.min(1, Math.max(0, (t - (THEFT_TOTAL - 2)) / 2)) * 0.5;
  return rise * (1 - fall);
}

/** L'ouverture de la faille (0 … 1) : elle s'ouvre pendant son plan, tient, et se referme au plan « sous terre » */
export function riftOpenAt(t: number): number {
  const s = t - theftShotStart('rift'), dRift = THEFT_PLAN[1].dur;
  if (s < 0) return 0;
  const open = Math.min(1, s / (dRift * 0.75));
  const c = t - (theftShotStart('gone') + CLOSE_AT);
  return c > 0 ? Math.max(0, open * (1 - c / 1.4)) : open;
}

/** Le tremblement de la vue (0 … 1) : fort quand la faille s'ouvre, de nouveau quand elle se referme */
export function theftShakeAt(t: number): number {
  const s = t - theftShotStart('rift'), c = t - (theftShotStart('gone') + CLOSE_AT);
  const open = s >= 0 && s < 2.2 ? Math.sin(Math.min(1, s / 0.3) * Math.PI / 2) * (1 - s / 2.2) : 0;
  const close = c >= 0 && c < 1.2 ? (1 - c / 1.2) * 0.6 : 0;
  return Math.max(open, close);
}

/** Le voile noir (0 … 1) : un court fondu à la fin */
export function theftBlackAt(t: number): number {
  return Math.max(0, Math.min(1, (t - (THEFT_TOTAL - THEFT_FADE)) / THEFT_FADE));
}
