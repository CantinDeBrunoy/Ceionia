/**
 * La cinématique du portail des Enfers : sa partition, sans rien de graphique (la mise en scène est dans `portalStage.ts`).
 * Elle se joue une fois par partie, dès que le portail s'ouvre (le choix « Les Enfers », passage direct décidé par l'auteur le
 * 22 nov. 2026 ; avant, au premier passage d'une recrue : choix de l'auteur, 20 nov. 2026, le joueur ne voyait
 * pas ce passage, un message disait seulement qu'un soldat attendait ses ordres « dans les Enfers »). Même schéma que la
 * traversée de l'archipel (`voyageCine.ts`), décision de l'auteur : « cinématique de l'exploration, vidéo Gemini, puis après
 * on voit en jeu » :
 * - **le film** (`PORTAL_FILM`, une vidéo faite par l'auteur, `public/portail/`) : l'arche de l'île qui s'allume, un soldat
 *   qui y entre, la plongée dans le tourbillon, et le noir. Il couvre la préparation des Enfers derrière lui. Sans vidéo, un
 *   fondu de remplacement (`PORTAL_FALLBACK` : le tourbillon peint qui grandit, puis le noir) ;
 * - **puis le direct** (`PORTAL_LIVE`), qui s'ouvre sur le même noir : le Seuil où les troupes sortent du portail, la faille
 *   jusqu'aux Grottes de braise et leur forteresse au loin, le retour aux troupes ; puis le joueur reprend la main.
 * Habillage de la traversée et de la fin du royaume : bandes noires, bandeaux dorés, fondus, « Passer ».
 */

export type PortalShot = 'threshold' | 'embers' | 'back';

/** Le film (s) : sa durée, et ses bandeaux, au temps de la vidéo ; fichiers et prompt : `.claude/prompts-video-portail.md` */
export const PORTAL_FILM = {
  dur: 20,
  webm: './portail/passage.webm',
  mp4: './portail/passage.mp4',
  captions: [
    // (le portail s'ouvre toujours après le vol du bâton du fondateur : voir `docs/lore-enfers.md`)
    { at: 1, dur: 5.5, text: 'Le portail s’éveille', sub: 'Au-delà, le bâton volé' },
  ] as { at: number; dur: number; text: string; sub?: string }[],
};

/** Le fondu de remplacement, sans vidéo (s) : le tourbillon peint grandit, puis le noir ; le même bandeau que le film */
export const PORTAL_FALLBACK = 4;

/** Le direct, dans les Enfers (secondes : 13,5 s en tout) */
export const PORTAL_LIVE: readonly { id: PortalShot; dur: number }[] = [
  { id: 'threshold', dur: 5 },
  { id: 'back', dur: 3 },
];
export const LIVE_TOTAL = PORTAL_LIVE.reduce((s, p) => s + p.dur, 0);

/** Les bandeaux du direct : à quel moment du plan (s) ils paraissent, combien de temps ils restent ; textes français */
export const PORTAL_CAPTIONS: { shot: PortalShot; at: number; dur: number; text: string; sub?: string }[] = [
  { shot: 'threshold', at: 0.9, dur: 3.8, text: 'Les Enfers', sub: 'Le Seuil du portail' },
];

/** Le noir du raccord se lève en `PORTAL_LIFT` secondes au début du direct ; un court fondu le ferme */
export const PORTAL_LIFT = 0.9, PORTAL_CLOSE = 0.5;

/** Le bandeau du film au temps `t` de la vidéo (ou du fondu de remplacement, dont le temps est ramené à celui du film) */
export function portalFilmCaptionAt(t: number): { text: string; sub?: string; alpha: number } | null {
  const c = PORTAL_FILM.captions.find((x) => t >= x.at && t < x.at + x.dur);
  return c ? { text: c.text, sub: c.sub, alpha: Math.min(1, (t - c.at) / 0.6, (c.at + c.dur - t) / 0.6) } : null;
}

/** Où en est le direct à l'instant t : le plan, son avancée (0 … 1) et le temps passé dedans ; null une fois fini */
export function portalShotAt(t: number): { shot: PortalShot; k: number; local: number } | null {
  let t0 = 0;
  for (const p of PORTAL_LIVE) {
    if (t < t0 + p.dur) return { shot: p.id, k: Math.max(0, (t - t0) / p.dur), local: Math.max(0, t - t0) };
    t0 += p.dur;
  }
  return null;
}

/** Le bandeau visible à l'instant t du direct (il paraît et s'efface en douceur), ou null */
export function portalCaptionAt(t: number): { text: string; sub?: string; alpha: number } | null {
  let t0 = 0;
  for (const p of PORTAL_LIVE) {
    for (const c of PORTAL_CAPTIONS) {
      if (c.shot !== p.id) continue;
      const s = t - (t0 + c.at);
      if (s >= 0 && s < c.dur) return { text: c.text, sub: c.sub, alpha: Math.min(1, s / 0.6, (c.dur - s) / 0.6) };
    }
    t0 += p.dur;
  }
  return null;
}

/** Le noir à l'instant t du direct (0 … 1) : il se lève au début (le film a fini au noir), un court fondu à la fin */
export function portalBlackAt(t: number): number {
  return Math.max(0, 1 - t / PORTAL_LIFT, 1 - (LIVE_TOTAL - t) / PORTAL_CLOSE);
}

/** Le fondu de remplacement à l'instant t : la taille du tourbillon peint (0 … 1) et le noir qui le recouvre (0 … 1) */
export function fallbackAt(t: number): { grow: number; black: number } {
  const k = Math.max(0, Math.min(1, t / PORTAL_FALLBACK));
  return { grow: k, black: Math.max(0, Math.min(1, (k - 0.7) / 0.3)) };
}

/**
 * La cinématique est-elle à jouer maintenant ? Elle est due (premier passage), et tout est calme : à la surface, ni fenêtre,
 * ni récit d'expédition qui attend, ni autre cinématique, ni geste ou outil en main (elle ne vole pas la caméra pendant une
 * pose). Sinon elle attend (les troupes, elles, sont déjà passées)
 */
export function portalCineReady(s: { due: boolean; surface: boolean; calm: boolean; reports: boolean; busyHands: boolean; otherCine: boolean }): boolean {
  return s.due && s.surface && s.calm && !s.reports && !s.busyHands && !s.otherCine;
}
