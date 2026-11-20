/**
 * La cinématique du portail des Enfers : sa partition, sans rien de graphique (la mise en scène est dans `portalStage.ts`).
 * Elle se joue une fois par partie, au premier passage d'une recrue (choix de l'auteur, 20 nov. 2026 : le joueur ne voyait
 * pas ce passage, un message disait seulement qu'un soldat attendait ses ordres « dans les Enfers ») :
 * - **l'arche s'éveille** : sur l'île, la vue tourne au ras du sol autour de l'arche, le tourbillon s'emballe ;
 * - **la plongée** : la vue plonge dans le tourbillon, un éclair violet, puis le noir (on passe dans les Enfers derrière lui) ;
 * - **le Seuil** : de haut au-dessus de l'arche des Enfers, la vue descend ; le soldat sort du portail ;
 * - **les Grottes de braise** : la vue file vers le sud le long de la faille, jusqu'à l'avant-poste et la forteresse ;
 * - **le retour** : la vue revient aux troupes, au Seuil, et s'y pose ; la barre de commandement revient.
 * Même habillage que la traversée et la fin du royaume : bandes noires, bandeaux dorés, fondus, « Passer ».
 */

export type PortalShot = 'awaken' | 'dive' | 'threshold' | 'embers' | 'back';

/** Durée de chaque plan, en secondes (24 s en tout) */
export const PORTAL_PLAN: readonly { id: PortalShot; dur: number }[] = [
  { id: 'awaken', dur: 5 },
  { id: 'dive', dur: 3.5 },
  { id: 'threshold', dur: 6 },
  { id: 'embers', dur: 6 },
  { id: 'back', dur: 3.5 },
];
export const PORTAL_TOTAL = PORTAL_PLAN.reduce((s, p) => s + p.dur, 0);

/** Les bandeaux : à quel moment du plan (s) ils paraissent, combien de temps ils restent ; textes français */
export const PORTAL_CAPTIONS: { shot: PortalShot; at: number; dur: number; text: string; sub?: string }[] = [
  { shot: 'awaken', at: 0.6, dur: 4, text: 'Le portail s’éveille', sub: 'Un premier soldat franchit l’arche' },
  { shot: 'threshold', at: 1, dur: 4.4, text: 'Les Enfers', sub: 'Le Seuil du portail' },
  { shot: 'embers', at: 0.8, dur: 4.6, text: 'Les Grottes de braise', sub: 'Leur forteresse garde le passage' },
];

/** L'instant où commence un plan */
export function portalShotStart(shot: PortalShot) {
  let t0 = 0;
  for (const p of PORTAL_PLAN) { if (p.id === shot) return t0; t0 += p.dur; }
  return t0;
}

/** Où en est la cinématique à l'instant t : le plan, son avancée (0 … 1) et le temps passé dedans ; null une fois finie */
export function portalShotAt(t: number): { shot: PortalShot; k: number; local: number } | null {
  let t0 = 0;
  for (const p of PORTAL_PLAN) {
    if (t < t0 + p.dur) return { shot: p.id, k: Math.max(0, (t - t0) / p.dur), local: Math.max(0, t - t0) };
    t0 += p.dur;
  }
  return null;
}

/** Le bandeau visible à l'instant t (il paraît et s'efface en douceur), ou null */
export function portalCaptionAt(t: number): { text: string; sub?: string; alpha: number } | null {
  let t0 = 0;
  for (const p of PORTAL_PLAN) {
    for (const c of PORTAL_CAPTIONS) {
      if (c.shot !== p.id) continue;
      const s = t - (t0 + c.at);
      if (s >= 0 && s < c.dur) return { text: c.text, sub: c.sub, alpha: Math.min(1, s / 0.6, (c.dur - s) / 0.6) };
    }
    t0 += p.dur;
  }
  return null;
}

/** Fin de la plongée : l'éclair violet monte (`PORTAL_FLASH` s), puis le noir (`PORTAL_BLACK` s) ; le noir se lève au Seuil */
export const PORTAL_FLASH = 1.6, PORTAL_BLACK = 0.6, PORTAL_LIFT = 0.9;

/**
 * Les voiles à l'instant t : `flash` (l'éclair violet du tourbillon, 0 … 1) et `black` (le noir, 0 … 1). Le noir couvre la
 * coupe entre la plongée et le Seuil (on y passe dans les Enfers), et se lève en `PORTAL_LIFT` secondes ; un fondu ouvre et
 * ferme la cinématique
 */
export function portalVeilAt(t: number): { flash: number; black: number } {
  const cut = portalShotStart('threshold');
  const flash = Math.max(0, Math.min(1, (t - (cut - PORTAL_BLACK - PORTAL_FLASH)) / PORTAL_FLASH)) * (t < cut ? 1 : 0);
  let black = 0;
  if (t < cut) black = Math.max(0, Math.min(1, (t - (cut - PORTAL_BLACK)) / PORTAL_BLACK));
  else black = Math.max(0, 1 - (t - cut) / PORTAL_LIFT);
  // (un court fondu ouvre la cinématique, un autre la ferme)
  black = Math.max(black, Math.max(0, 1 - t / 0.5), Math.max(0, 1 - (PORTAL_TOTAL - t) / 0.6));
  return { flash, black };
}

/** L'instant de la coupe vers les Enfers (le noir est complet : on y passe derrière lui) */
export const PORTAL_CUT = portalShotStart('threshold');

/**
 * La cinématique est-elle à jouer maintenant ? Elle est due (premier passage), et tout est calme : à la surface, ni fenêtre,
 * ni récit d'expédition qui attend, ni autre cinématique, ni geste ou outil en main (elle ne vole pas la caméra pendant une
 * pose). Sinon elle attend (les troupes, elles, sont déjà passées)
 */
export function portalCineReady(s: { due: boolean; surface: boolean; calm: boolean; reports: boolean; busyHands: boolean; otherCine: boolean }): boolean {
  return s.due && s.surface && s.calm && !s.reports && !s.busyHands && !s.otherCine;
}
