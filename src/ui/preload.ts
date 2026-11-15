/**
 * Les images des fenêtres, chargées et décodées d'avance, au repos. Sans cela, la première ouverture d'une fenêtre (grand
 * choix, carte de l'allié, portail, paramètres, expéditions) allait chercher ses images sur le réseau et les décodait à son
 * premier rendu : la fenêtre paraissait vide, les images arrivaient après, et l'image du jeu traînait.
 * Une image par moment de repos (`requestIdleCallback`) : rien ne se fait pendant une image chargée
 */

/** Les images des fenêtres qui s'ouvrent d'elles-mêmes, et celles des paramètres */
export const POPUP_PICS = [
  './ui/portail.webp', './expeditions/dio-caravel.webp',
  './icons/hud/boussole.webp', './icons/hud/militaire.webp', './icons/hud/village.webp', './icons/hud/parchemin.webp',
  './menu/popup/montagnes_entete.webp', './menu/popup/montagnes_lointaines.webp', './menu/popup/prairie_collines.webp',
  './menu/popup/icone_options.webp',
];

/** Les images déjà demandées (gardées : le navigateur les garde en mémoire tant qu'on les tient) */
const kept = new Map<string, HTMLImageElement>();
const queue: string[] = [];
let busy = false;

/** `f` au prochain moment de repos du navigateur (au plus tard après 2 s) */
export function whenIdle(f: () => void) {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(f, { timeout: 2000 });
  else setTimeout(f, 50);
}
const idle = whenIdle;

/** Une image de la file, puis la suivante au prochain repos, une fois celle-ci décodée */
function pump() {
  const u = queue.shift();
  if (u === undefined) { busy = false; return; }
  if (kept.has(u)) { pump(); return; }
  const img = new Image();
  img.decoding = 'async';
  img.src = u;
  kept.set(u, img);
  img.decode().catch(() => { /* une image absente ne bloque pas la suite */ }).finally(() => idle(pump));
}

/** Met ces images dans la file du préchargement (celles déjà demandées sont ignorées) */
export function preloadPics(urls: string[]) {
  if (typeof Image === 'undefined') return;
  for (const u of urls) if (!kept.has(u) && !queue.includes(u)) queue.push(u);
  if (!busy && queue.length) { busy = true; idle(pump); }
}
