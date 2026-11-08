/**
 * La cinématique de fin du volet militaire (la chute du roi des Enfers) : sa partition, sans rien de graphique. Cinq plans qui
 * s'enchaînent (l'effondrement vu des Enfers, la remontée par le portail, le portail qui s'éteint à la surface, l'île qui
 * reverdit, le village en fête), des bandeaux de texte, et les fondus. Le jeu ne s'arrête pas : après elle, l'écran des
 * récompenses puis la partie continue
 */

export type EndShot = 'collapse' | 'travel' | 'portal' | 'isle' | 'village';

/** Durée de chaque plan, en secondes (≈ 27 s en tout) */
export const END_PLAN: readonly { id: EndShot; dur: number }[] = [
  { id: 'collapse', dur: 8 },
  { id: 'travel', dur: 2 },
  { id: 'portal', dur: 5.5 },
  { id: 'isle', dur: 6 },
  { id: 'village', dur: 5.5 },
];
export const END_TOTAL = END_PLAN.reduce((s, p) => s + p.dur, 0);
/** Le dernier fondu au noir (secondes, à la fin du dernier plan) */
export const END_FADE = 1.6;

/** Les bandeaux : à quel moment du plan (secondes) ils paraissent, combien de temps ils restent */
export const END_CAPTIONS: { shot: EndShot; at: number; dur: number; text: string }[] = [
  { shot: 'collapse', at: 1, dur: 4.5, text: 'Le roi des Enfers est tombé' },
  { shot: 'portal', at: 0.4, dur: 4, text: 'Le portail s’éteint' },
  { shot: 'isle', at: 0.8, dur: 4.4, text: 'L’île est sauvée' },
];

/** Où en est la cinématique à l'instant t : le plan, et l'avancée dans ce plan (0 … 1) ; null une fois finie */
export function endShotAt(t: number): { shot: EndShot; k: number; local: number } | null {
  let t0 = 0;
  for (const p of END_PLAN) {
    if (t < t0 + p.dur) return { shot: p.id, k: (t - t0) / p.dur, local: t - t0 };
    t0 += p.dur;
  }
  return null;
}

/** L'instant où commence un plan (une cinématique lancée de la surface saute les plans des Enfers) */
export function endShotStart(shot: EndShot) {
  let t0 = 0;
  for (const p of END_PLAN) { if (p.id === shot) return t0; t0 += p.dur; }
  return 0;
}

/** Le bandeau visible à l'instant t (et son opacité : il apparaît et s'efface en douceur), ou null */
export function endCaptionAt(t: number): { text: string; alpha: number } | null {
  let t0 = 0;
  for (const p of END_PLAN) {
    for (const c of END_CAPTIONS) {
      if (c.shot !== p.id) continue;
      const s = t - (t0 + c.at);
      if (s >= 0 && s < c.dur) return { text: c.text, alpha: Math.min(1, s / 0.6, (c.dur - s) / 0.6) };
    }
    t0 += p.dur;
  }
  return null;
}

/** Le voile noir de la fin (0 : rien, 1 : noir total) : un fondu doux sur les dernières secondes */
export function endBlackAt(t: number) {
  return Math.max(0, Math.min(1, (t - (END_TOTAL - END_FADE)) / END_FADE));
}

/** Le voile de lumière du fondu enchaîné entre les Enfers et la surface (0 … 1) : monte sur la fin de l'effondrement, retombe dans le plan « remontée » */
export const END_FLASH_RISE = 1.2;
export function endFlashAt(t: number) {
  const s = t - endShotStart('travel'), d = END_PLAN[1].dur;
  if (s < -END_FLASH_RISE || s > d) return 0;
  return s < 0 ? (s + END_FLASH_RISE) / END_FLASH_RISE : 1 - s / d;
}

/**
 * La cinématique doit-elle se jouer ? Une seule fois par partie (le drapeau est sauvegardé avec la guerre : posé dès son
 * lancement, pour qu'une partie quittée ou rechargée en cours de route ne la rejoue pas) ; `force` : le mode développeur
 */
export function shouldPlayKingdomEnd(war: { endSeen: boolean }, force = false) {
  return force || !war.endSeen;
}
