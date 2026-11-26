import { tr } from '../i18n';
import { filmOrder, type FilmFiles } from './filmLoad';
import { skipAsk } from './skipAsk';
import { KINGDOM_TEXT } from './kingdom';

/** Un film à revoir : ses fichiers, sa durée (s) et ses bandeaux, au temps de la vidéo */
export interface ReplayFilm extends FilmFiles { dur: number; captions: { at: number; dur: number; text: string; sub?: string }[] }

/**
 * Revoir le film d'une cinématique déjà jouée (onglet « Grands choix », retour de l'auteur du 26 nov. 2026 : « revoir la
 * cinématique d'un choix déjà fait »). Seulement le film, par-dessus le jeu : le plan en direct qui le suit dépend de la partie
 * (troupes qui sortent du portail, îles survolées au moment de la traversée), il ne se rejoue pas. Bandes noires, bandeaux
 * dorés, « Passer » en deux temps (clic, Échap, Espace), comme les autres cinématiques. `scene` : la scène musicale de la
 * cinématique (`data-scene`, lue par `main.ts`), sa musique joue pendant le film. La vidéo est lue au fil de l'eau (pas
 * de téléchargement préalable : rien ne calcule derrière). Introuvable ou illisible : la fenêtre se ferme d'elle-même
 */
export function replayFilm(film: ReplayFilm, done: () => void = () => {}, scene = ''): HTMLElement {
  document.getElementById('filmReplay')?.remove();
  const el = document.createElement('div');
  el.id = 'filmReplay';
  if (scene) el.dataset.scene = scene;
  el.innerHTML = `<video muted playsinline preload="auto" disablepictureinpicture aria-hidden="true"></video>
    <div class="kc-bar t"></div><div class="kc-bar b"></div>
    <button class="kc-skip" type="button">${KINGDOM_TEXT.skip}</button>`;
  const v = el.querySelector('video')!;
  for (const c of film.captions) {
    const d = document.createElement('div');
    d.className = 'kc-cap';
    d.innerHTML = '<b></b><small></small>';
    d.querySelector('b')!.textContent = tr(c.text);
    d.querySelector('small')!.textContent = c.sub ? tr(c.sub) : '';
    d.dataset.at = String(c.at); d.dataset.dur = String(c.dur);
    el.appendChild(d);
  }
  let over = false;
  const end = () => {
    if (over) return;
    over = true;
    window.removeEventListener('keydown', key, true);
    v.pause(); v.removeAttribute('src'); v.load();
    el.classList.add('gone');
    window.setTimeout(() => el.remove(), 400);
    done();
  };
  const ask = skipAsk(el, end);
  el.querySelector<HTMLButtonElement>('.kc-skip')!.onclick = (e) => { e.stopPropagation(); ask(); };
  el.addEventListener('pointerdown', () => ask());
  const key = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' && e.code !== 'Space') return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) ask();
  };
  window.addEventListener('keydown', key, true);
  // les bandeaux suivent le temps de la vidéo
  v.addEventListener('timeupdate', () => {
    const t = v.currentTime;
    for (const d of el.querySelectorAll<HTMLElement>('.kc-cap')) {
      const at = +d.dataset.at!, k = (t - at) / +d.dataset.dur!;
      d.style.opacity = String(k < 0 || k > 1 ? 0 : Math.min(1, k / 0.14, (1 - k) / 0.14));
    }
  });
  v.addEventListener('ended', end);
  // (la WebM illisible : le MP4 ; aucun des deux : on ferme)
  const files = filmOrder(film, (t) => v.canPlayType(t));
  const next = () => {
    const src = files.shift();
    if (!src || over) { end(); return; }
    v.src = src;
    v.play().catch(() => { /* (un fichier illisible : l'événement « error » passe au suivant) */ });
  };
  v.addEventListener('error', () => next());
  document.body.appendChild(el);
  next();
  return el;
}
