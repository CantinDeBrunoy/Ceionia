import { tr } from '../i18n';
import { VOY_FILM, VOY_WAIT, voyFilmCaptionAt } from '../voyageCine';
import { KINGDOM_TEXT } from './kingdom';

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
  readonly video: HTMLVideoElement;
  private cap: HTMLElement;
  private sub: HTMLElement;
  private skipped = false;
  private ended = false;
  private onEnd: (() => void)[] = [];
  private keyHandler: (e: KeyboardEvent) => void;

  constructor(private el: HTMLElement) {
    const m = readFilmMark();
    this.skipped = !!m?.skip;
    el.innerHTML = `${VOYAGE_PLATE}<video class="vyFilm" muted playsinline preload="auto" disablepictureinpicture aria-hidden="true">
        <source src="./voyage/traversee.webm" type="video/webm"><source src="./voyage/traversee.mp4" type="video/mp4"></video>
      <div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"><b></b><small></small></div>
      <button class="vyGo" type="button" hidden>▶ ${tr('Continuer la traversée')}</button>
      <button class="kc-skip vySkip" type="button">${KINGDOM_TEXT.skip}</button><div class="ldBar"><i></i></div><p class="ldStep" hidden></p>`;
    this.video = el.querySelector('video')!;
    this.cap = el.querySelector('.kc-cap b')!;
    this.sub = el.querySelector('.kc-cap small')!;
    const v = this.video, start = resumeAt(m);
    // (déjà passé, ou repris au-delà de la fin : la brume seule)
    if (this.skipped || start >= VOY_FILM.dur - 0.05) this.finish();
    else {
      v.addEventListener('loadedmetadata', () => { if (start > 0) v.currentTime = start; }, { once: true });
      v.addEventListener('ended', () => this.finish());
      // (la WebM illisible ici : le MP4 de secours, au même moment ; illisible lui aussi, ou introuvable : la brume seule)
      let fallback = false;
      const fail = () => {
        if (!fallback && !v.currentSrc.endsWith('.mp4')) {
          fallback = true;
          const at = v.currentTime || start;
          v.src = './voyage/traversee.mp4';
          v.addEventListener('loadedmetadata', () => { if (at > 0) v.currentTime = at; }, { once: true });
          void v.play().catch(() => this.finish());
          return;
        }
        this.finish();
      };
      v.addEventListener('error', fail);
      v.querySelectorAll('source')[1]?.addEventListener('error', fail);
      // Repris après le rechargement, sans geste du joueur depuis : le navigateur refuse le son (la musique ne repartait
      // qu'au premier clic, qui passait le film : le joueur voyait le début rejoué, muet). Le film attend donc, arrêté sur son
      // image, un clic sur « Continuer la traversée » : ce geste relance le film et la musique ensemble (17 nov. 2026)
      const go = el.querySelector<HTMLButtonElement>('.vyGo')!;
      if (start > 0 && !navigator.userActivation?.isActive && !navigator.userActivation?.hasBeenActive) {
        go.hidden = false;
        go.addEventListener('pointerdown', (e) => e.stopPropagation());
        go.onclick = (e) => { e.stopPropagation(); go.hidden = true; void v.play().catch(() => { /* lecture refusée : la brume reste */ }); };
      } else void v.play().catch(() => { /* lecture refusée : la brume reste */ });
      this.whenDone(() => { go.hidden = true; });
    }
    v.addEventListener('timeupdate', () => this.paint());
    this.paint();
    el.querySelector<HTMLButtonElement>('.vySkip')!.onclick = (e) => { e.stopPropagation(); this.skip(); };
    el.addEventListener('pointerdown', () => this.skip());
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.skip();
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  /** Le film est fini (ou passé) : il ne reste que la brume */
  get done() { return this.ended; }
  /** Le joueur a passé la cinématique (le survol des îles ne se jouera pas non plus) */
  get wasSkipped() { return this.skipped; }

  /** Appelé une fois le film fini (tout de suite s'il l'est déjà) */
  whenDone(f: () => void) { if (this.ended) f(); else this.onEnd.push(f); }

  /** La vidéo a commencé à jouer (ou ne jouera pas) : la promesse se tient */
  started(): Promise<void> {
    const v = this.video;
    if (this.ended || !v.paused) return Promise.resolve();
    return new Promise((r) => { v.addEventListener('playing', () => r(), { once: true }); this.whenDone(r); });
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
    this.video.pause();
    this.video.classList.add('gone');
    this.paint();
    for (const f of this.onEnd.splice(0)) f();
  }

  private paint() {
    const c = voyFilmCaptionAt(this.video.currentTime || 0, this.ended);
    const text = c ? tr(c.text) : '', sub = c?.sub ? tr(c.sub) : '';
    if (this.cap.textContent !== text) this.cap.textContent = text;
    if (this.sub.textContent !== sub) this.sub.textContent = sub;
    (this.cap.parentElement as HTMLElement).style.opacity = c ? '1' : '0';
  }

  /** L'écran s'en va : on rend les touches */
  dispose() { window.removeEventListener('keydown', this.keyHandler, true); }
}

export { VOY_WAIT };
