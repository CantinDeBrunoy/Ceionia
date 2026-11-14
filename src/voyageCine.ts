/**
 * La cinématique « Explorer le monde » : sa partition, sans rien de graphique (la mise en scène est dans `voyageStage.ts`).
 * Elle fait office d'écran de chargement et se joue en deux actes, de part et d'autre du rechargement de la partie agrandie :
 * - acte I, sur le monde d'avant : un navire quitte le village et prend le large, puis la brume se lève et couvre tout ;
 * - l'attente : la brume tient (le même voile, avec la silhouette du navire), aussi longtemps que l'agrandissement, le
 *   rechargement, la génération des îles et des villes et la préparation des shaders le demandent (`LoadingScreen` en mode
 *   traversée) ;
 * - acte II, sur le monde agrandi : la brume se dissipe et l'horizon recule, l'île d'Orient (sa mosquée, son port qui
 *   s'anime), l'île d'Asie (sa pagode, ses jonques), les deux flottes face à face, puis le retour au village.
 * Des bandeaux de texte courts, des fondus au noir entre les plans de l'acte II. Passable (clic, Échap, Espace) : l'acte I
 * file à l'attente, l'acte II au village ; jamais pendant l'attente (le chargement n'est pas fini)
 */

export type VoyShot = 'depart' | 'mist' | 'horizon' | 'orient' | 'asie' | 'fleets' | 'home';
export interface VoyPlan { id: VoyShot; dur: number }

/** Acte I (secondes) : le départ, puis la brume qui se lève (≈ 9 s) */
export const VOY_ACT1: readonly VoyPlan[] = [
  { id: 'depart', dur: 5.5 },
  { id: 'mist', dur: 3.5 },
];
/** Acte II (secondes) : l'horizon, les deux îles, les deux flottes, le retour (≈ 32 s) */
export const VOY_ACT2: readonly VoyPlan[] = [
  { id: 'horizon', dur: 6.5 },
  { id: 'orient', dur: 7 },
  { id: 'asie', dur: 7 },
  { id: 'fleets', dur: 7 },
  { id: 'home', dur: 4.5 },
];
export const actTotal = (plan: readonly VoyPlan[]) => plan.reduce((s, p) => s + p.dur, 0);

/** Les bandeaux : à quel moment du plan (s) ils paraissent, combien de temps ils restent ; textes français, traduits à l'affichage */
export const VOY_CAPTIONS: { shot: VoyShot; at: number; dur: number; text: string; sub?: string }[] = [
  { shot: 'depart', at: 0.8, dur: 4.2, text: 'Un navire prend la mer', sub: 'Cap sur l’inconnu' },
  { shot: 'mist', at: 0.4, dur: 3, text: 'La brume se lève…' },
  { shot: 'horizon', at: 1.6, dur: 4.4, text: 'La mer s’ouvre', sub: 'et l’horizon recule' },
  { shot: 'orient', at: 0.9, dur: 5.4, text: 'Une île de sable et de palmiers', sub: 'Sa mosquée, son port, tout un peuple' },
  { shot: 'asie', at: 0.9, dur: 5.4, text: 'Une île verte aux pitons rocheux', sub: 'Sa pagode, ses jonques, un autre peuple' },
  { shot: 'fleets', at: 0.9, dur: 5.4, text: 'Deux peuples, deux flottes', sub: 'Une vieille rivalité les oppose' },
];
/** Le bandeau de l'attente (la brume tient tant que le monde se prépare) */
export const VOY_WAIT = { text: 'Au-delà de la brume…', sub: 'le monde s’agrandit' };

/** Durée d'un fondu au noir entre deux plans de l'acte II (s, de chaque côté de la coupe) */
export const VOY_DIP = 0.55;
/** La brume se dissipe au début de l'acte II (s) */
export const VOY_LIFT = 2.6;

/** Où en est l'acte à l'instant t : le plan, son avancée (0 … 1) et le temps passé dedans ; null une fois l'acte fini */
export function voyShotAt(plan: readonly VoyPlan[], t: number): { shot: VoyShot; k: number; local: number } | null {
  let t0 = 0;
  for (const p of plan) {
    if (t < t0 + p.dur) return { shot: p.id, k: Math.max(0, (t - t0) / p.dur), local: Math.max(0, t - t0) };
    t0 += p.dur;
  }
  return null;
}

/** Le bandeau visible à l'instant t dans l'acte (il apparaît et s'efface en douceur), ou null */
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
 * Les voiles à l'instant t : `mist` (la brume, 0 … 1) et `black` (le fondu au noir, 0 … 1). Acte I : la brume monte sur le
 * plan « mist » et couvre tout à la fin. Acte II : elle se dissipe en `VOY_LIFT` secondes (`fromMist` : on sort de
 * l'attente ; sinon un fondu au noir ouvre l'acte), puis un fondu au noir à chaque coupe
 */
export function voyVeilAt(act: 1 | 2, t: number, fromMist = true): { mist: number; black: number } {
  if (act === 1) {
    const d = VOY_ACT1[0].dur, m = VOY_ACT1[1].dur;
    return { mist: Math.max(0, Math.min(1, (t - d) / (m * 0.85))), black: 0 };
  }
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
