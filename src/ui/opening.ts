import { tr } from '../i18n';
import { OPEN_FALLBACK, OPEN_FILM, openFallbackPlan, openFilmCaptionAt } from '../openingCine';
import { KINGDOM_TEXT } from './kingdom';

/**
 * Le film de la cinématique d'ouverture (partition dans `openingCine.ts`) : deux plans faits par l'auteur avec Gemini
 * (`public/ouverture/`, WebM puis MP4 de secours). Il tient lieu d'écran de chargement d'une partie neuve : la vidéo joue même
 * quand le jeu calcule (construction du monde, shaders), comme le film de la traversée (`voyage.ts`). Sans vidéo (fichiers
 * absents, illisibles, ou qui tardent à démarrer), le fondu de remplacement : l'image de l'accueil qui s'approche lentement,
 * les mêmes bandeaux, puis la nuée. Fini avant que la partie ne soit prête, il laisse la nuée et ses nuages de papier
 * jusqu'au bout ; le plan en direct (`openingStage.ts`) s'ouvre sur la même nuée
 */

/** La nuée sous le film : ce qui reste quand il est fini (styles « La cinématique d'ouverture » de `style.css`) */
const CLOUDS = '<div class="opSky" aria-hidden="true"><i class="opPuff p0"></i><i class="opPuff p1"></i><i class="opPuff p2"></i></div>';
/** Le fondu de remplacement : l'image de l'accueil (sans le village au loin, coupé par le cadrage), qui s'approche */
const STILL = '<div class="opStill" aria-hidden="true"><img src="./menu/fond.webp" alt="" decoding="async"></div>';

/** Une vidéo qui n'a pas démarré au bout de ce temps (ms) laisse la place au fondu de remplacement */
const START_MS = 4000;

export class OpeningFilm {
  readonly video: HTMLVideoElement;
  private cap: HTMLElement;
  private sub: HTMLElement;
  private skipped = false;
  private ended = false;
  /** le fondu de remplacement joue (à la place de la vidéo), et sa minuterie de fin */
  private plating = false;
  private plateTimer = 0;
  private startTimer = 0;
  private onEnd: (() => void)[] = [];
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(private el: HTMLElement) {
    el.innerHTML = `${CLOUDS}${STILL}<video class="opFilm" muted playsinline preload="auto" disablepictureinpicture aria-hidden="true">
        <source src="${OPEN_FILM.webm}" type="video/webm"><source src="${OPEN_FILM.mp4}" type="video/mp4"></video>
      <div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"><b></b><small></small></div>
      <button class="kc-skip opSkip" type="button">${KINGDOM_TEXT.skip}</button><div class="ldBar"><i></i></div><p class="ldStep" hidden></p>`;
    this.video = el.querySelector('video')!;
    this.cap = el.querySelector('.kc-cap b')!;
    this.sub = el.querySelector('.kc-cap small')!;
    const v = this.video;
    v.addEventListener('ended', () => this.finish());
    // (la WebM illisible ici : le MP4 de secours ; illisible lui aussi, ou introuvable : le fondu de remplacement)
    let fallback = false;
    const fail = () => {
      if (this.ended || this.plating) return;
      if (!fallback && !v.currentSrc.endsWith('.mp4')) {
        fallback = true;
        v.src = OPEN_FILM.mp4;
        void v.play().catch(() => this.plate());
        return;
      }
      this.plate();
    };
    v.addEventListener('error', fail);
    v.querySelectorAll('source')[1]?.addEventListener('error', fail);
    v.addEventListener('timeupdate', () => this.paint());
    v.addEventListener('playing', () => clearTimeout(this.startTimer), { once: true });
    // (une vidéo qui tarde, réseau lent : le fondu de remplacement plutôt qu'un écran figé)
    this.startTimer = window.setTimeout(() => { if (v.paused || v.currentTime === 0) this.plate(); }, START_MS);
    void v.play().catch(() => this.plate());
    this.paint();
    el.querySelector<HTMLButtonElement>('.opSkip')!.onclick = (e) => { e.stopPropagation(); this.skip(); };
    el.addEventListener('pointerdown', () => this.skip());
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.skip();
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  /** Le film est fini (ou passé) : il ne reste que la nuée */
  get done() { return this.ended; }
  /** Le joueur l'a passé : le plan en direct ne se jouera pas non plus */
  get wasSkipped() { return this.skipped; }
  /** Le fondu de remplacement a joué à la place de la vidéo */
  get plated() { return this.plating; }

  /** Appelé une fois le film fini (tout de suite s'il l'est déjà) */
  whenDone(f: () => void) { if (this.ended) f(); else this.onEnd.push(f); }

  /** « Passer » : le film s'arrête sur la nuée ; le chargement, lui, va au bout */
  skip() {
    if (this.skipped) return;
    this.skipped = true;
    this.finish();
  }

  /**
   * Le fondu de remplacement, à la place de la vidéo : l'image de l'accueil qui s'approche, les bandeaux, puis la nuée, tout
   * en animations CSS réglées d'avance (`openFallbackPlan`) : elles jouent même pendant la construction du monde
   */
  private plate() {
    if (this.ended || this.plating) return;
    clearTimeout(this.startTimer);
    this.plating = true;
    this.video.pause();
    this.video.classList.add('gone');
    this.paint();
    const p = openFallbackPlan(), el = this.el;
    for (const c of p.captions) {
      const d = document.createElement('div');
      d.className = 'kc-cap opCapAnim';
      d.style.animation = `opCap ${c.dur}s linear ${c.delay}s both`;
      d.innerHTML = '<b></b><small></small>';
      d.querySelector('b')!.textContent = tr(c.text);
      d.querySelector('small')!.textContent = c.sub ? tr(c.sub) : '';
      el.appendChild(d);
    }
    el.style.setProperty('--opCloudAt', `${p.cloudAt}s`);
    el.style.setProperty('--opCloudDur', `${p.cloudDur}s`);
    el.classList.add('plate');
    this.plateTimer = window.setTimeout(() => this.finish(), OPEN_FALLBACK * 1000);
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.startTimer);
    clearTimeout(this.plateTimer);
    this.video.pause();
    this.video.classList.add('gone');
    this.el.classList.add('ended');
    this.paint();
    for (const f of this.onEnd.splice(0)) f();
  }

  /** Le bandeau du moment, au temps de la vidéo ; aucun une fois fini, ni pendant le fondu de remplacement (les siens sont animés) */
  private paint() {
    const c = this.ended || this.plating ? null : openFilmCaptionAt(this.video.currentTime || 0);
    const text = c ? tr(c.text) : '', sub = c?.sub ? tr(c.sub) : '';
    if (this.cap.textContent !== text) this.cap.textContent = text;
    if (this.sub.textContent !== sub) this.sub.textContent = sub;
    (this.cap.parentElement as HTMLElement).style.opacity = c ? String(c.alpha) : '0';
  }

  /** L'écran s'en va : on rend les touches */
  dispose() {
    clearTimeout(this.startTimer);
    clearTimeout(this.plateTimer);
    window.removeEventListener('keydown', this.keyHandler, true);
  }
}
