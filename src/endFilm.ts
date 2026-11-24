/**
 * Le film de la fin (la colonisation d'une autre planète) : sa partition, sans rien de graphique. Deux plans faits avec Flow
 * (Veo) d'après les modèles du jeu, collés par un fondu : la fusée coloniale décolle du cosmodrome et quitte la Terre, puis
 * elle se pose sur une planète inconnue, les colons descendent la rampe et plantent un drapeau blanc ; un fondu vers la
 * couleur de la nuée finit le film. Il remplace le voyage dessiné (`drawVoyage`), qui reste le secours si la vidéo ne se lit
 * pas. Fichiers : `public/fin/fin.webm` (lue en premier) et `fin.mp4`. Voir docs/fin-de-partie.md
 */

import { tr } from './i18n';

/** Le film (s) : sa durée, et ses bandeaux au temps de la vidéo (traduits à l'affichage) */
export const END_FILM = {
  dur: 12.71,
  /** les deux plans se fondent l'un dans l'autre à ce moment (s) */
  cut: 7.43,
  captions: [
    { at: 0.8, dur: 5.8, text: () => tr('Le grand départ'), sub: () => tr('Le vaisseau colonial quitte la Terre') },
    { at: 8.0, dur: 3.3, text: () => tr('Une terre nouvelle'), sub: () => tr('par-delà les étoiles') },
  ] as { at: number; dur: number; text: () => string; sub: () => string }[],
};

/** Les sources du film, dans l'ordre où les essayer */
export const END_FILM_SRC = [
  { src: './fin/fin.webm', type: 'video/webm' },
  { src: './fin/fin.mp4', type: 'video/mp4' },
] as const;

/** Le bandeau visible au temps `t` du film (il paraît et s'efface en douceur), ou null */
export function endFilmCaptionAt(t: number): { text: string; sub: string; alpha: number } | null {
  for (const c of END_FILM.captions) {
    const s = t - c.at;
    if (s >= 0 && s < c.dur) return { text: c.text(), sub: c.sub(), alpha: Math.min(1, s / 0.6, (c.dur - s) / 0.6) };
  }
  return null;
}
