import { tr } from '../i18n';
import { VOY_FILM, VOY_WAIT, voyFilmCaptionAt } from '../voyageCine';
import { KINGDOM_TEXT } from './kingdom';
import { FILM_WAIT, fetchFilm, filmOrder, firstFrames } from './filmLoad';
import { skipAsk } from './skipAsk';

/** Les fichiers du film (`public/voyage/`) : la WebM, puis le MP4 de secours */
const VOY_FILES = { webm: './voyage/traversee.webm', mp4: './voyage/traversee.mp4' };

/**
 * Le film de la traversée (« Explorer le monde ») : une vidéo enregistrée, la même pour tous (une caravelle en pleine mer, puis
 * la brume ; `public/voyage/`, voir docs/grand-choix.md). Elle tient lieu d'écran de chargement : elle joue pendant la
 * sauvegarde, l'agrandissement du monde et le rechargement de la page, puis pendant la préparation de la partie agrandie. Le
 * rechargement la coupe : elle reprend après, là où elle s'était arrêtée (`VOY_KEY` dans `sessionStorage`). Finie avant que la partie ne
 * soit prête, elle laisse la brume peinte (navire en ombre, nappes qui passent) jusqu'au bout. Une vidéo joue même quand le
 * fil principal est pris (agrandissement, construction du monde, shaders) : c'est pour cela qu'elle remplace l'acte en direct
 */

/** Une caravelle en ombre chinoise (coque, trois mâts, voiles), sur fond transparent */
const SHIP = `<svg class="vyShip" viewBox="0 0 200 150" aria-hidden="true"><g fill="#5b6d76">
<path d="M18 104 L182 104 L166 128 Q100 138 34 128 Z"/><path d="M150 104 L176 92 L184 98 L170 106 Z"/>
<rect x="66" y="22" width="3" height="84"/><rect x="104" y="10" width="3.4" height="96"/><rect x="140" y="34" width="2.6" height="72"/>
<path d="M48 30 Q68 50 48 74 L88 74 Q96 52 88 30 Z"/><path d="M84 18 Q106 44 84 78 L128 78 Q136 48 128 18 Z"/>
<path d="M143 40 L170 86 L143 86 Z"/><path d="M106 6 L124 12 L106 16 Z"/></g></svg>`;

/** La brume et le navire, sous la vidéo : ce qui reste quand elle est finie (styles « La traversée » de `style.css`) */
export const VOYAGE_PLATE = `<div class="vyPlate" aria-hidden="true"><i class="vyMist m0"></i>${SHIP}<i class="vyMist m1"></i><i class="vyMist m2"></i></div>`;

/** Où en est le film d'une page à l'autre (`sessionStorage`) : le temps de la vidéo, l'heure où on l'a noté, passé ou non */
export const VOY_KEY = 'village-lowpoly:voyage';
interface FilmMark { t: number; at: number; skip?: boolean }

export function readFilmMark(): FilmMark | null {
  try {
    const m = JSON.parse(sessionStorage.getItem(VOY_KEY) ?? 'null');
    return m && Number.isFinite(m.t) && Number.isFinite(m.at) ? m : null;
  } catch { return null; }
}
const writeFilmMark = (m: FilmMark) => { try { sessionStorage.setItem(VOY_KEY, JSON.stringify(m)); } catch { /* sans stockage, le film repart du début */ } };
export const clearFilmMark = () => { try { sessionStorage.removeItem(VOY_KEY); } catch { /* rien */ } };

/**
 * Le moment où reprendre le film après le rechargement : là où il s'était arrêté (borné au film). Le temps du rechargement
 * n'est pas compté : en ligne, modèles et code se téléchargent, et le film sautait à sa fin avant d'avoir repris (le joueur
 * ne voyait que la brume). Rien d'autre ne suit le film : l'image continue simplement où elle en était
 */
export function resumeAt(m: FilmMark | null): number {
  if (!m) return 0;
  return Math.max(0, Math.min(VOY_FILM.dur, m.t));
}

/**
 * Le film dans un élément (l'écran de chargement en mode traversée) : la brume peinte dessous, la vidéo dessus, les bandes
 * noires, le bandeau (suivant le temps de la vidéo), « Passer » et le filet d'avancée
 */
export class VoyageFilm {
  /**
   * Le son attend encore un geste du joueur (le navigateur a refusé la lecture automatique après le rechargement) : un clic
   * sur le film lance alors la musique sans le passer ; Échap, Espace et « Passer » le passent toujours. Posé par `main.ts`
   */
  static soundLocked: () => boolean = () => false;
  readonly video: HTMLVideoElement;
  private cap: HTMLElement;
  private sub: HTMLElement;
  private skipped = false;
  private ended = false;
  private onEnd: (() => void)[] = [];
  private keyHandler: (e: KeyboardEvent) => void;
  /** où reprendre le film (s) ; le téléchargement : sa copie en mémoire (null : pas de film), et de quoi l'arrêter */
  private start = 0;
  /** avant le rechargement : la brume seule, le film ne part pas */
  private held = false;
  private file: Promise<string | null>;
  private url: string | null = null;
  private abort = new AbortController();
  /** l'avancée du téléchargement (0 … 1), montrée avec celle des modèles tant que le film n'est pas parti (`LoadingScreen`) */
  fileK = 0;
  rolled = false;
  onProgress = () => {};

  /**
   * `hold` : avant le rechargement, rien que la brume (le film ne commence qu'après). Avant (retour de l'auteur, 17 nov. 2026 :
   * « tu play plusieurs fois la même scène sans musique »), le film jouait deux secondes, se figeait le temps du
   * rechargement, puis reprenait muet : on croyait le voir recommencer
   */
  constructor(private el: HTMLElement, hold = false) {
    const m = readFilmMark();
    this.skipped = !!m?.skip;
    el.innerHTML = `${VOYAGE_PLATE}<video class="vyFilm gone" muted playsinline preload="none" disablepictureinpicture aria-hidden="true">
        </video>
      <div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"><b></b><small></small></div>
      <button class="kc-skip vySkip" type="button">${KINGDOM_TEXT.skip}</button><div class="ldBar"><i></i></div><p class="ldStep" hidden></p>`;
    this.video = el.querySelector('video')!;
    this.cap = el.querySelector('.kc-cap b')!;
    this.sub = el.querySelector('.kc-cap small')!;
    const v = this.video;
    this.start = resumeAt(m);
    // (déjà passé, ou repris au-delà de la fin : la brume seule)
    if (this.skipped || this.start >= VOY_FILM.dur - 0.05) { this.file = Promise.resolve(null); this.finish(); }
    // (avant le rechargement : la brume, le film attend la page d'après)
    else if (hold) { this.held = true; this.file = Promise.resolve(null); v.classList.add('gone'); this.paint(); }
    else {
      v.addEventListener('ended', () => this.finish());
      // Le film en entier, en mémoire, avant de partir (`roll`) : rien ne l'arrête plus en route, et il part avant que le
      // jeu ne se bâtisse. Avant, il démarrait pendant la construction du monde agrandi (8 s d'un seul tenant) : le joueur
      // voyait le navire en ombre immobile dans la brume (« un navire immobile sur une mer plate », notes de joueurs du
      // 19 nov. 2026), puis la vidéo sautait de 8 s. Trop lent à venir : la brume seule
      const late = window.setTimeout(() => this.abort.abort(), FILM_WAIT);
      this.file = fetchFilm(filmOrder(VOY_FILES, (t) => v.canPlayType(t)), (k) => { this.fileK = k; this.onProgress(); }, this.abort.signal)
        .then((url) => {
          clearTimeout(late);
          if (url && this.ended) { URL.revokeObjectURL(url); return null; }
          this.url = url;
          return url;
        });
    }
    v.addEventListener('timeupdate', () => this.paint());
    this.paint();
    // (en deux temps : le premier appui demande « Vraiment passer ? », voir `skipAsk`)
    const ask = skipAsk(el, () => this.skip());
    el.querySelector<HTMLButtonElement>('.vySkip')!.onclick = (e) => { e.stopPropagation(); ask(); };
    // (le son d'abord : avant, ce clic coupait le film, et le joueur ne l'entendait jamais en musique)
    el.addEventListener('pointerdown', () => { if (!VoyageFilm.soundLocked()) ask(); });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) ask();
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  /** Le film est fini (ou passé) : il ne reste que la brume */
  get done() { return this.ended; }
  /** Le joueur a passé la cinématique (le survol des îles ne se jouera pas non plus) */
  get wasSkipped() { return this.skipped; }

  /** Appelé une fois le film fini (tout de suite s'il l'est déjà) */
  whenDone(f: () => void) { if (this.ended) f(); else this.onEnd.push(f); }

  /**
   * Le film part, une fois téléchargé, là où il s'était arrêté ; la promesse se tient quand ses premières images sont à
   * l'écran (ou tout de suite s'il ne jouera pas). Le jeu se bâtit ensuite derrière lui sans le figer
   */
  async roll(): Promise<void> {
    const url = await this.file;
    this.rolled = true;
    if (!url || this.ended) { if (!this.ended && !this.held) this.finish(); return; }
    const v = this.video;
    v.src = url;
    if (this.start > 0) await new Promise<void>((r) => { v.addEventListener('loadedmetadata', () => { v.currentTime = this.start; r(); }, { once: true }); v.addEventListener('error', () => r(), { once: true }); });
    try { await v.play(); } catch { this.finish(); return; }
    if (this.ended) return;
    v.classList.remove('gone');
    // (les bandeaux en animations CSS, réglés sur la vidéo : ils passent même quand le jeu calcule)
    const at = v.currentTime || 0;
    for (const c of VOY_FILM.captions) {
      if (c.at + c.dur <= at) continue;
      const d = document.createElement('div');
      d.className = 'kc-cap vyCapAnim';
      d.style.animation = `opCap ${c.dur}s linear ${c.at - at}s both`;
      d.innerHTML = '<b></b><small></small>';
      d.querySelector('b')!.textContent = tr(c.text);
      d.querySelector('small')!.textContent = c.sub ? tr(c.sub) : '';
      this.el.appendChild(d);
    }
    this.paint();
    await firstFrames(v);
  }

  /** Note où en est le film, pour le reprendre après le rechargement */
  mark() { writeFilmMark({ t: this.ended ? VOY_FILM.dur : this.video.currentTime, at: Date.now(), skip: this.skipped }); }

  /** « Passer » : le film s'arrête sur la brume ; le survol des îles sera passé lui aussi */
  skip() {
    if (this.skipped) return;
    this.skipped = true;
    this.finish();
    this.mark();
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.abort.abort();
    this.el.classList.add('ended');
    this.video.pause();
    this.video.classList.add('gone');
    this.paint();
    for (const f of this.onEnd.splice(0)) f();
  }

  /** Le bandeau tenu par le temps de la vidéo : aucun quand les bandeaux animés sont posés ; le film fini, celui de l'attente */
  private paint() {
    const c = !this.ended && this.el.querySelector('.vyCapAnim') ? null : voyFilmCaptionAt(this.video.currentTime || 0, this.ended);
    const text = c ? tr(c.text) : '', sub = c?.sub ? tr(c.sub) : '';
    if (this.cap.textContent !== text) this.cap.textContent = text;
    if (this.sub.textContent !== sub) this.sub.textContent = sub;
    (this.cap.parentElement as HTMLElement).style.opacity = c ? '1' : '0';
  }

  /** L'écran s'en va : on rend les touches et la mémoire du film */
  dispose() {
    this.abort.abort();
    window.removeEventListener('keydown', this.keyHandler, true);
    if (this.url) { this.video.removeAttribute('src'); this.video.load(); URL.revokeObjectURL(this.url); this.url = null; }
  }
}

export { VOY_WAIT };
