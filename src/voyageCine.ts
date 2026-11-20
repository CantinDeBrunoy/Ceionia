/**
 * La cinématique « Explorer le monde » : sa partition, sans rien de graphique (la mise en scène est dans `voyageStage.ts`,
 * le film dans `ui/voyage.ts`). Elle fait office d'écran de chargement, en deux temps :
 * - **le film** : une vidéo enregistrée, la même pour tous (une caravelle en pleine mer, puis la brume ; `VOY_FILM`). Elle joue
 *   pendant la sauvegarde, l'agrandissement, le rechargement, la génération des îles et des villes et la préparation des
 *   shaders, sans à-coups (une vidéo joue même quand le jeu calcule). Finie avant la fin du chargement, la brume peinte tient ;
 * - **le survol en direct** (`VOY_ACT2`), une fois tout prêt et le film fini : la brume se dissipe et l'horizon recule, l'île
 *   d'Orient (sa mosquée, son port qui s'anime), l'île d'Asie (sa pagode, ses jonques), les deux flottes face à face, puis le
 *   retour au village.
 * Des bandeaux de texte courts, des fondus au noir entre les plans du survol. Passable partout (clic, Échap, Espace) : pendant
 * le film, il s'arrête sur la brume et le survol ne se jouera pas ; pendant le survol, on va tout de suite au village.
 *
 * (Avant, un acte en direct sur le monde d'avant ouvrait la cinématique, et l'attente était une brume animée en CSS : l'auteur
 * l'a vue saccader en partie réelle, le 15 nov. 2026. Mesure en build de production : voir docs/grand-choix.md)
 */

export type VoyShot = 'horizon' | 'orient' | 'asie' | 'fleets' | 'home';
export interface VoyPlan { id: VoyShot; dur: number }

/** Le film (s) : sa durée, et ses bandeaux, au temps de la vidéo (deux plans collés à 9,5 s ; la brume monte de 15,5 à 19,5 s, voir docs/grand-choix.md) */
export const VOY_FILM = {
  dur: 19.5,
  captions: [
    { at: 1.2, dur: 5.6, text: 'Un navire prend la mer', sub: 'Cap sur l’inconnu' },
    { at: 15.6, dur: 3.9, text: 'La brume se lève…' },
  ] as { at: number; dur: number; text: string; sub?: string }[],
};

/** Le survol en direct (secondes) : l'horizon, les deux îles, les deux flottes, le retour (≈ 30 s) */
// (sans le plan de l'horizon, une caravelle en pleine mer : il redisait le film, et le joueur voyait trois fois la même
// scène de suite, retour de l'auteur, 17 nov. 2026 ; le plan reste dans `VoyageStage.place` s'il revient)
export const VOY_ACT2: readonly VoyPlan[] = [
  { id: 'orient', dur: 7 },
  { id: 'asie', dur: 7 },
  { id: 'fleets', dur: 7 },
  { id: 'home', dur: 4.5 },
];
export const actTotal = (plan: readonly VoyPlan[]) => plan.reduce((s, p) => s + p.dur, 0);

/** Les bandeaux du survol : à quel moment du plan (s) ils paraissent, combien de temps ils restent ; textes français */
export const VOY_CAPTIONS: { shot: VoyShot; at: number; dur: number; text: string; sub?: string }[] = [
  { shot: 'horizon', at: 1.4, dur: 3.4, text: 'La mer s’ouvre', sub: 'et l’horizon recule' },
  { shot: 'orient', at: 0.9, dur: 5.4, text: 'Une île de sable et de palmiers', sub: 'Sa mosquée, son port, tout un peuple' },
  { shot: 'asie', at: 0.9, dur: 5.4, text: 'Une île verte aux pitons rocheux', sub: 'Sa pagode, ses jonques, un autre peuple' },
  { shot: 'fleets', at: 0.9, dur: 5.4, text: 'Deux peuples, deux flottes', sub: 'Une vieille rivalité les oppose' },
];
/** Le bandeau de l'attente (le film fini, la brume tient tant que le monde se prépare) */
export const VOY_WAIT = { text: 'Au-delà de la brume…', sub: 'le monde s’agrandit' };

/** Durée d'un fondu au noir entre deux plans du survol (s, de chaque côté de la coupe) */
export const VOY_DIP = 0.55;
/** La brume se dissipe au début du survol (s) */
export const VOY_LIFT = 2.6;

/** Le bandeau du film au temps `t` de la vidéo ; le film fini, celui de l'attente ; null entre deux */
export function voyFilmCaptionAt(t: number, ended: boolean): { text: string; sub?: string } | null {
  if (ended) return VOY_WAIT;
  return VOY_FILM.captions.find((c) => t >= c.at && t < c.at + c.dur) ?? null;
}

/** Où en est le survol à l'instant t : le plan, son avancée (0 … 1) et le temps passé dedans ; null une fois fini */
export function voyShotAt(plan: readonly VoyPlan[], t: number): { shot: VoyShot; k: number; local: number } | null {
  let t0 = 0;
  for (const p of plan) {
    if (t < t0 + p.dur) return { shot: p.id, k: Math.max(0, (t - t0) / p.dur), local: Math.max(0, t - t0) };
    t0 += p.dur;
  }
  return null;
}

/** Le bandeau visible à l'instant t du survol (il apparaît et s'efface en douceur), ou null */
export function voyCaptionAt(plan: readonly VoyPlan[], t: number): { text: string; sub?: string; alpha: number } | null {
  let t0 = 0;
  for (const p of plan) {
    for (const c of VOY_CAPTIONS) {
      if (c.shot !== p.id) continue;
      const s = t - (t0 + c.at);
      if (s >= 0 && s < c.dur) return { text: c.text, sub: c.sub, alpha: Math.min(1, s / 0.6, (c.dur - s) / 0.6) };
    }
    t0 += p.dur;
  }
  return null;
}

/**
 * Les voiles du survol à l'instant t : `mist` (la brume, 0 … 1) et `black` (le fondu au noir, 0 … 1). La brume se dissipe en
 * `VOY_LIFT` secondes (`fromMist` : on sort du film ; sinon, partie rechargée autrement, un fondu au noir ouvre le survol),
 * puis un fondu au noir à chaque coupe
 */
export function voyVeilAt(t: number, fromMist = true): { mist: number; black: number } {
  const mist = fromMist ? Math.max(0, 1 - t / VOY_LIFT) : 0;
  let black = fromMist ? 0 : Math.max(0, 1 - t / VOY_DIP);
  let t0 = 0;
  for (let i = 0; i < VOY_ACT2.length - 1; i++) {
    t0 += VOY_ACT2[i].dur;
    const d = Math.abs(t - t0);
    if (d < VOY_DIP) black = Math.max(black, 1 - d / VOY_DIP);
  }
  return { mist, black };
}

/** Le premier contact : la bannière qui suit la cinématique (textes français) */
export const VOY_CONTACT = { title: 'Le premier contact', sub: 'Un navire peut aller saluer ces deux peuples' };
