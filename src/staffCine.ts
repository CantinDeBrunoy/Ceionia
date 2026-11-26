/**
 * La cinématique du vol du bâton du fondateur (voir `docs/lore-enfers.md`) : sa partition, sans rien de graphique (la mise en
 * scène est dans `staffStage.ts`). Une fois par partie, quand le joueur prend la voie des Enfers (au grand choix, ou plus tard
 * depuis l'onglet « Grands choix ») : c'est la première partie de la cinématique du portail, qui suit aussitôt. Le vol
 * justifie l'invasion sur le moment (retour de l'auteur, 26 nov. 2026 : avant, il se jouait juste avant la carte du grand
 * choix). Comme les autres films du jeu :
 * - **le film** (`STAFF_FILM`, une vidéo faite par l'auteur avec Flow, `public/vol/`) : la place de l'Antiquité, le bâton
 *   devant sa pierre levée, la terre qui tremble, la faille rouge, les démons qui l'arrachent et replongent, la faille qui se
 *   referme, le noir. Prompts : `.claude/prompts-video-vol-baton.md` ;
 * - **sans film** (fichier absent ou illisible), le **remplacement en direct**, joué dans le moteur sur la vraie place, en
 *   quatre plans :
 *   - **le calme** : la vue descend vers le bâton, planté sur la place depuis la fondation ; le ciel s'assombrit ;
 *   - **la faille** : la terre tremble, une faille rouge s'ouvre à côté du bâton ;
 *   - **les démons** : trois démons en sortent, le chef arrache le bâton ;
 *   - **sous terre** : ils redescendent avec lui, la faille se referme, il ne reste qu'une brûlure et le socle vide.
 * Habillage des autres cinématiques : bandes noires, bandeaux dorés avec un sous-titre, « Passer » en deux temps.
 */

/**
 * Le film (s) : sa durée prévue, ses fichiers, ses bandeaux et ses bruitages (la vidéo est muette), au temps de la vidéo. À
 * recaler sur la vraie vidéo une fois branchée (voir `docs/lore-enfers.md`, « La vidéo »)
 */
export const STAFF_FILM = {
  // (deux plans Flow de 8 s collés par un fondu d'une demi-seconde : la faille s'ouvre, puis les démons)
  dur: 15.5,
  webm: './vol/vol.webm',
  mp4: './vol/vol.mp4',
  captions: [
    { at: 0.8, dur: 3.6, text: 'Le bâton du fondateur', sub: 'Planté le premier jour du village' },
    { at: 8.2, dur: 3, text: 'Les démons surgissent', sub: 'Ils arrachent le bâton' },
    { at: 11.6, dur: 3.2, text: 'Le bâton est aux Enfers', sub: 'Sous la terre, chez le roi démon' },
  ] as { at: number; dur: number; text: string; sub?: string }[],
  /** le grondement de la terre (la faille s'ouvre, puis se referme) et le cri des démons, au temps de la vidéo */
  rumble: [3.5, 12.5] as number[],
  roar: 8.4,
};

/** Le film qui ne joue toujours pas au bout de ce temps (s, réseau lent, lecture bloquée) : le remplacement en direct */
export const STAFF_FILM_WAIT = 8;
/** Le noir du départ se lève en ce temps (s) au début du remplacement en direct */
export const THEFT_LIFT = 0.5;

/** Le bandeau du film au temps `t` de la vidéo, ou null */
export function staffFilmCaptionAt(t: number): { text: string; sub?: string; alpha: number } | null {
  const c = STAFF_FILM.captions.find((x) => t >= x.at && t < x.at + x.dur);
  return c ? { text: c.text, sub: c.sub, alpha: Math.min(1, (t - c.at) / 0.6, (c.at + c.dur - t) / 0.6) } : null;
}

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
