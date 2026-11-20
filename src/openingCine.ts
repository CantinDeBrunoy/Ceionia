/**
 * La cinématique d'ouverture : sa partition, sans rien de graphique (le film dans `ui/opening.ts`, le plan en direct dans
 * `openingStage.ts`). Elle se joue une fois, au début d'une partie neuve, et raconte le passage des nomades aux sédentaires
 * (demande de l'auteur, 20 nov. 2026 : aux tests, le début de partie était le moment le plus fragile). Même schéma que la
 * traversée de l'archipel (`voyageCine.ts`) :
 * - **le film** (`OPEN_FILM`, deux plans faits par l'auteur avec Gemini, `public/ouverture/`) : la vallée sauvage au lever du
 *   jour (mammouths, cerfs, oiseaux), puis une tribu qui s'arrête au bord de la rivière, le chef qui plante son bâton, et la
 *   caméra qui monte dans les nuages. Il tient lieu d'écran de chargement. Sans vidéo, un fondu de remplacement
 *   (`OPEN_FALLBACK` : l'image de l'accueil qui s'approche lentement, puis la nuée) ;
 * - **puis le direct** (`OPEN_LIVE`), sur la vraie carte : la nuée se lève, la vue descend du ciel, passe au-dessus de la
 *   faune et se pose là où le joueur va allumer le premier feu de camp. Le tutoriel et le choix des contrôles viennent après.
 * Habillage de la traversée : bandes noires, bandeaux dorés, fondus, « Passer ».
 */

/** Le film (s) : sa durée, ses fichiers, et ses bandeaux, au temps de la vidéo (deux plans de 8 s collés) */
export const OPEN_FILM = {
  dur: 19.58,
  webm: './ouverture/ouverture.webm',
  mp4: './ouverture/ouverture.mp4',
  captions: [
    { at: 1, dur: 5.6, text: 'Il y a très longtemps…', sub: 'La terre était sauvage' },
    { at: 10.2, dur: 6, text: 'Un peuple errait', sub: 'cherchant sa terre' },
  ] as { at: number; dur: number; text: string; sub?: string }[],
};

/** Le fondu de remplacement, sans vidéo (s) : l'image de l'accueil s'approche, puis la nuée ; les bandeaux du film y tiennent */
export const OPEN_FALLBACK = 8;

/** La couleur de la nuée : la fin du film, le voile qui se lève au début du direct (voir `.claude/prompts-video-ouverture.md`) */
export const OPEN_CLOUD = '#ece9e2';

/** Le direct (s) : la vue descend du ciel sur la carte de la partie */
export const OPEN_LIVE = 6.5;
/** La nuée se lève en `OPEN_LIFT` secondes au début du direct */
export const OPEN_LIFT = 1.8;
/** Le bandeau du direct */
export const OPEN_LIVE_CAPTION = { at: 1.4, dur: 4.6, text: 'Ici, ils allaient bâtir leur foyer' };

const fade = (t: number, at: number, dur: number) => Math.max(0, Math.min(1, (t - at) / 0.6, (at + dur - t) / 0.6));

/** Le bandeau du film au temps `t` de la vidéo, avec son opacité ; null entre deux */
export function openFilmCaptionAt(t: number): { text: string; sub?: string; alpha: number } | null {
  const c = OPEN_FILM.captions.find((x) => t >= x.at && t < x.at + x.dur);
  return c ? { text: c.text, sub: c.sub, alpha: fade(t, c.at, c.dur) } : null;
}

/**
 * Le fondu de remplacement, réglé d'avance (secondes) : il se joue en animations CSS, qui tournent même quand le jeu calcule
 * (une minuterie restait figée des secondes entières pendant la construction du monde, et le second bandeau sautait). Les
 * bandeaux du film y passent à la même place, ramenés à sa durée ; la nuée recouvre l'image sur le dernier cinquième
 */
export function openFallbackPlan(): { captions: { text: string; sub?: string; delay: number; dur: number }[]; cloudAt: number; cloudDur: number } {
  const k = OPEN_FALLBACK / OPEN_FILM.dur;
  return {
    captions: OPEN_FILM.captions.map((c) => ({ text: c.text, sub: c.sub, delay: c.at * k, dur: c.dur * k })),
    cloudAt: OPEN_FALLBACK * 0.8, cloudDur: OPEN_FALLBACK * 0.2,
  };
}

/** Le bandeau du direct à l'instant t, ou null */
export function openLiveCaptionAt(t: number): { text: string; alpha: number } | null {
  const c = OPEN_LIVE_CAPTION;
  return t >= c.at && t < c.at + c.dur ? { text: c.text, alpha: fade(t, c.at, c.dur) } : null;
}

/** La nuée à l'instant t du direct (1 au début, 0 une fois levée) */
export const openCloudAt = (t: number) => Math.max(0, 1 - t / OPEN_LIFT);

/**
 * La vue du direct à l'avancée `k` (0 … 1), entre le ciel au-dessus de la faune et la vue de départ de la partie : la
 * hauteur descend d'abord vite puis se pose, le point visé glisse de la faune au feu de camp à venir, l'inclinaison passe de
 * plongeante à celle du jeu, le cap tourne doucement jusqu'au sien
 */
export function openViewAt(k: number, from: { x: number; z: number }, to: { x: number; z: number; yaw: number; pitch: number; dist: number }) {
  const e = Math.max(0, Math.min(1, k)), s = e * e * (3 - 2 * e), d = 1 - (1 - e) ** 3;
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  return {
    x: mix(from.x, to.x, s), z: mix(from.z, to.z, s),
    dist: mix(to.dist * 3.4, to.dist, d),
    pitch: mix(1.38, to.pitch, s),
    yaw: to.yaw - 0.9 * (1 - s),
  };
}

/**
 * La cinématique est-elle à jouer au lancement ? Seulement dans une partie neuve, hors bac à sable (rien à raconter quand on
 * commence à un autre âge que la Préhistoire, ou sans règles), au premier âge, et si le joueur ne l'a pas coupée dans les
 * paramètres. Jamais en reprenant une partie
 */
export function openingDue(s: { fresh: boolean; sandbox: boolean; age: number; off: boolean }): boolean {
  // (dans tous les modes et à tous les âges de départ, bac à sable compris : « c'est juste quand la partie se lance »,
  // demande de l'auteur du 20 nov. 2026 ; `sandbox` et `age` restent dans la signature pour les appels existants)
  void s.sandbox; void s.age;
  return s.fresh && !s.off;
}
