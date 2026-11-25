import { tr } from '../i18n';
import { OPEN_FALLBACK, OPEN_FILM, openFallbackPlan, openFilmCaptionAt } from '../openingCine';
import { KINGDOM_TEXT } from './kingdom';
import { FILM_WAIT, fetchFilm, filmOrder, firstFrames } from './filmLoad';
import { skipAsk } from './skipAsk';

/**
 * Le film de la cinématique d'ouverture (partition dans `openingCine.ts`) : deux plans faits par l'auteur avec Gemini
 * (`public/ouverture/`, WebM puis MP4 de secours). Il tient lieu d'écran de chargement d'une partie neuve. D'abord un vrai
 * chargement (l'emblème sur la nuée, les modèles et le film qui se téléchargent), puis le film part (`roll`), et le jeu ne se
 * bâtit derrière lui qu'une fois ses premières images à l'écran (voir `filmLoad.ts`). Sans vidéo (fichiers absents,
 * illisibles, ou trop lents à venir), le fondu de remplacement : l'image de l'accueil qui s'approche lentement, les mêmes
 * bandeaux, puis la nuée. Fini avant que la partie ne soit prête, il laisse la nuée et ses nuages de papier jusqu'au bout ;
 * le plan en direct (`openingStage.ts`) s'ouvre sur la même nuée
 */

/** La nuée sous le film : ce qui reste quand il est fini (styles « La cinématique d'ouverture » de `style.css`) */
const CLOUDS = '<div class="opSky" aria-hidden="true"><i class="opPuff p0"></i><i class="opPuff p1"></i><i class="opPuff p2"></i></div>';
/** Le fondu de remplacement : l'image de l'accueil retouchée sans village ni maison (une vallée sauvage), qui s'approche */
const STILL = '<div class="opStill" aria-hidden="true"><img src="./ouverture/vallee.webp" alt="" decoding="async"></div>';

type Caption = { text: string; sub?: string; delay: number; dur: number };

export class OpeningFilm {
  readonly video: HTMLVideoElement;
  private cap: HTMLElement;
  private sub: HTMLElement;
  private skipped = false;
  private ended = false;
  /** le fondu de remplacement joue (à la place de la vidéo), et sa minuterie de fin */
  private plating = false;
  private plateTimer = 0;
  private onEnd: (() => void)[] = [];
  private keyHandler: (e: KeyboardEvent) => void;
  /** le téléchargement du film : sa copie en mémoire (null : pas de film), et de quoi l'arrêter */
  private file: Promise<string | null>;
  private url: string | null = null;
  private abort = new AbortController();
  /** l'avancée du vrai chargement : les modèles (null : déjà chargés), le film */
  private modelsK: number | null = null;
  private modelsLabel = '';
  private fileK = 0;
  private loadStep: HTMLElement;
  private loadBar: HTMLElement;

  /**
   * `box` : l'emblème et le nom du jeu (ceux de l'écran de chargement), posés au-dessus de l'avancée du vrai chargement. Le
   * film se télécharge tout de suite, mais ne part qu'à l'appel de `roll`
   */
  constructor(private el: HTMLElement, box = '') {
    el.classList.add('wait');
    el.innerHTML = `${CLOUDS}${STILL}<video class="opFilm gone" muted playsinline preload="none" disablepictureinpicture aria-hidden="true"></video>
      <div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"><b></b><small></small></div>
      <button class="kc-skip opSkip" type="button">${KINGDOM_TEXT.skip}</button><div class="ldBar opFilet"><i></i></div><p class="ldStep" hidden></p>
      <div class="opLoad">${box}<p class="opLoadStep"></p><div class="opLoadBar"><i></i></div></div>`;
    this.video = el.querySelector('video')!;
    this.cap = el.querySelector('.kc-cap b')!;
    this.sub = el.querySelector('.kc-cap small')!;
    this.loadStep = el.querySelector('.opLoadStep')!;
    this.loadBar = el.querySelector('.opLoadBar i')!;
    const v = this.video;
    v.addEventListener('ended', () => this.finish());
    v.addEventListener('timeupdate', () => this.paint());
    // (le film en entier, en mémoire : rien ne l'arrêtera en route ; trop lent à venir, le fondu de remplacement)
    const late = window.setTimeout(() => this.abort.abort(), FILM_WAIT);
    this.file = fetchFilm(filmOrder(OPEN_FILM, (t) => v.canPlayType(t)), (k) => { this.fileK = k; this.drawLoad(); }, this.abort.signal)
      .then((url) => {
        clearTimeout(late);
        // (passé pendant le téléchargement : la copie ne servira pas)
        if (url && this.ended) { URL.revokeObjectURL(url); return null; }
        this.url = url;
        return url;
      });
    this.drawLoad();
    // (en deux temps : le premier appui demande « Vraiment passer ? », voir `skipAsk`)
    const ask = skipAsk(el, () => this.skip());
    el.querySelector<HTMLButtonElement>('.opSkip')!.onclick = (e) => { e.stopPropagation(); ask(); };
    // (pendant le vrai chargement, un clic ne passe rien : le joueur vient de cliquer pour lancer la partie)
    el.addEventListener('pointerdown', () => { if (!el.classList.contains('wait')) ask(); });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) ask();
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

  /** L'avancée du chargement des modèles (`k` de 0 à 1), montrée avec celle du film tant qu'il n'est pas parti */
  models(label: string, k: number) {
    this.modelsK = k;
    this.modelsLabel = label;
    this.drawLoad();
  }

  /**
   * Le film part : une fois téléchargé, il démarre, ses bandeaux sont posés, et la promesse se tient quand ses premières
   * images sont à l'écran. Le jeu peut alors se bâtir derrière lui : ses longs calculs ne figent plus la vidéo. Sans film,
   * le fondu de remplacement part de même
   */
  async roll(): Promise<void> {
    const url = await this.file;
    this.el.classList.remove('wait');
    if (this.ended) return;
    if (!url) { this.plate(); await firstFrames(null, 300); return; }
    const v = this.video;
    v.src = url;
    try { await v.play(); } catch { this.plate(); await firstFrames(null, 300); return; }
    if (this.ended) return;
    v.classList.remove('gone');
    // (les bandeaux en animations CSS, réglés sur la vidéo : ils passent même quand le jeu calcule)
    const at = v.currentTime || 0;
    this.animCaptions(OPEN_FILM.captions.map((c) => ({ text: c.text, sub: c.sub, delay: c.at - at, dur: c.dur })));
    await firstFrames(v);
  }

  /** « Passer » : le film s'arrête sur la nuée ; le chargement, lui, va au bout */
  skip() {
    if (this.skipped) return;
    this.skipped = true;
    this.finish();
  }

  /** L'avancée du vrai chargement, avant le film : les modèles et le film ensemble */
  private drawLoad() {
    const m = this.modelsK, k = m === null ? this.fileK : (Math.min(1, m) + this.fileK) / 2;
    this.loadBar.style.width = `${Math.round(k * 1000) / 10}%`;
    const text = m !== null && m < 1 ? this.modelsLabel : tr('Chargement de la cinématique…');
    if (this.loadStep.textContent !== text) this.loadStep.textContent = text;
  }

  /** Les bandeaux en animations CSS (`delay` en secondes depuis maintenant) : ils passent même quand le fil principal est pris */
  private animCaptions(list: Caption[]) {
    for (const c of list) {
      const d = document.createElement('div');
      d.className = 'kc-cap opCapAnim';
      d.style.animation = `opCap ${c.dur}s linear ${c.delay}s both`;
      d.innerHTML = '<b></b><small></small>';
      d.querySelector('b')!.textContent = tr(c.text);
      d.querySelector('small')!.textContent = c.sub ? tr(c.sub) : '';
      this.el.appendChild(d);
    }
    this.paint();
  }

  /**
   * Le fondu de remplacement, à la place de la vidéo : l'image de l'accueil qui s'approche, les bandeaux, puis la nuée, tout
   * en animations CSS réglées d'avance (`openFallbackPlan`) : elles jouent même pendant la construction du monde
   */
  private plate() {
    if (this.ended || this.plating) return;
    this.plating = true;
    this.video.pause();
    this.video.classList.add('gone');
    this.el.classList.remove('wait');
    const p = openFallbackPlan(), el = this.el;
    this.animCaptions(p.captions);
    el.style.setProperty('--opCloudAt', `${p.cloudAt}s`);
    el.style.setProperty('--opCloudDur', `${p.cloudDur}s`);
    el.classList.add('plate');
    this.plateTimer = window.setTimeout(() => this.finish(), OPEN_FALLBACK * 1000);
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.abort.abort();
    clearTimeout(this.plateTimer);
    this.video.pause();
    this.video.classList.add('gone');
    this.el.classList.remove('wait');
    this.el.classList.add('ended');
    this.paint();
    for (const f of this.onEnd.splice(0)) f();
  }

  /**
   * Le bandeau tenu par le temps de la vidéo : aucun quand les bandeaux animés sont posés (le film parti, ou le fondu de
   * remplacement), ni une fois fini
   */
  private paint() {
    const c = this.ended || this.el.querySelector('.opCapAnim') ? null : openFilmCaptionAt(this.video.currentTime || 0);
    const text = c ? tr(c.text) : '', sub = c?.sub ? tr(c.sub) : '';
    if (this.cap.textContent !== text) this.cap.textContent = text;
    if (this.sub.textContent !== sub) this.sub.textContent = sub;
    (this.cap.parentElement as HTMLElement).style.opacity = c ? String(c.alpha) : '0';
  }

  /** L'écran s'en va : on rend les touches et la mémoire du film */
  dispose() {
    clearTimeout(this.plateTimer);
    this.abort.abort();
    window.removeEventListener('keydown', this.keyHandler, true);
    if (this.url) { this.video.removeAttribute('src'); this.video.load(); URL.revokeObjectURL(this.url); this.url = null; }
  }
}
