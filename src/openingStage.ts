import type { CameraRig } from './core/camera';
import { OPEN_CLOUD, OPEN_LIVE, openCloudAt, openLiveCaptionAt, openViewAt } from './openingCine';
import { KINGDOM_TEXT } from './ui/kingdom';
import { tr } from './i18n';
import { skipAsk } from './ui/skipAsk';

/**
 * Le plan en direct de la cinématique d'ouverture (partition dans `openingCine.ts`), après le film (`ui/opening.ts`) : sur
 * la vraie carte de la partie neuve, la nuée se lève, la vue descend du ciel au-dessus d'une bête sauvage (un cerf de
 * préférence) et se pose sur la vue de départ de la partie, là où le joueur va allumer le premier feu de camp. Préparé sous
 * l'écran de chargement (`prepare`, la nuée opaque), il part quand l'écran s'en va. Passer (un clic n'importe où, Échap,
 * Espace) pose tout de suite la vue de départ. À la fin, la vue est exactement celle d'une partie neuve sans cinématique :
 * rien ne la reprend ensuite
 */
export interface OpeningHost {
  cam: CameraRig;
  root: HTMLElement;
  /** hauteur du sol */
  ground(x: number, z: number): number;
  /** une bête sauvage visible près de (x, z), au-dessus de laquelle passer (null : aucune) */
  wild(x: number, z: number): { x: number; z: number } | null;
  /** l'écran de chargement est encore là (le plan attend sous lui) */
  loading(): boolean;
  /** le temps du jeu à ×1 pendant le plan (les bêtes bougent), puis l'état d'avant (la pause du tutoriel) */
  pace(cine: boolean): void;
}

type View = { x: number; z: number; yaw: number; pitch: number; dist: number };

export class OpeningStage {
  /** `wait` : sous l'écran de chargement ; `live` : le plan */
  private phase: 'wait' | 'live' | null = null;
  private t = 0;
  private skipped: () => boolean = () => false;
  /** la vue de départ de la partie (là où tout finit), et le point de la faune au-dessus duquel on passe */
  private to: View | null = null;
  private from: { x: number; z: number } = { x: 0, z: 0 };
  private el: { root: HTMLElement; veil: HTMLElement; cap: HTMLElement } | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private ends: (() => void)[] = [];

  constructor(private host: OpeningHost) {}

  get playing() { return !!this.el; }

  /** Tenu jusqu'à la fin du plan (ou tout de suite s'il n'y en a pas) */
  finished(): Promise<void> { return this.el ? new Promise((r) => this.ends.push(r)) : Promise.resolve(); }

  /**
   * Avant que l'écran de chargement ne s'efface : la vue de départ est notée, la nuée posée par-dessus le jeu (sous l'écran),
   * les bandes noires en place. `skipped` : le joueur a passé le film (le plan ne se jouera pas)
   */
  prepare(skipped: () => boolean) {
    if (this.el) return;
    const v = this.host.cam.view();
    this.to = { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch, dist: v.dist };
    this.skipped = skipped;
    this.phase = 'wait'; this.t = 0;
    document.body.classList.add('cinematic');
    this.build();
  }

  /** Une image (temps réel, plafonné) ; la caméra est posée après sa propre mise à jour */
  update(dt: number) {
    const c = this.el, to = this.to;
    if (!c || !to) return;
    if (this.phase === 'wait') {
      if (this.host.loading()) return;
      // (le film passé : pas de plan, la partie commence)
      if (this.skipped()) { this.finish(); return; }
      this.from = this.pickFrom(to);
      this.phase = 'live'; this.t = 0;
      this.host.pace(true);
    }
    this.t += Math.min(dt, 0.1);
    const k = this.t / OPEN_LIVE;
    c.veil.style.opacity = String(openCloudAt(this.t));
    const cap = openLiveCaptionAt(this.t);
    const text = cap ? tr(cap.text) : '', b = c.cap.querySelector('b')!;
    if (b.textContent !== text) b.textContent = text;
    c.cap.style.opacity = cap ? String(cap.alpha) : '0';
    if (k >= 1) { this.finish(); return; }
    this.jump(openViewAt(k, this.from, to));
  }

  /** Passer : la vue de départ, tout de suite */
  skip() { if (this.el) this.finish(); }

  /** Le point de départ du survol : une bête sauvage près de la place à venir, sinon un point en arrière de la vue */
  private pickFrom(to: View): { x: number; z: number } {
    const w = this.host.wild(to.x, to.z);
    if (w) return w;
    const back = 16;
    return { x: to.x - Math.sin(to.yaw) * back, z: to.z - Math.cos(to.yaw) * back };
  }

  private finish() {
    const to = this.to;
    if (this.phase === 'live') this.host.pace(false);
    this.close();
    // la vue de départ exacte, sans les bornes relâchées du plan
    if (to) this.host.cam.jump(to, this.host.ground(to.x, to.z));
    for (const f of this.ends.splice(0)) f();
  }

  private close() {
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler, true); this.keyHandler = null; }
    this.el?.root.remove();
    this.el = null;
    this.phase = null;
    document.body.classList.remove('cinematic');
  }

  /** Pose la caméra (sans les bornes de zoom et d'inclinaison du joueur) */
  private jump(v: View) {
    const c = this.host.cam, md = c.minDist, mp = c.minPitch;
    c.minDist = 0.3; c.minPitch = 0.01;
    c.jump(v, this.host.ground(v.x, v.z));
    c.minDist = md; c.minPitch = mp;
  }

  // ---------- L'habillage : la nuée, les bandes noires, le bandeau, « Passer » ----------
  private build() {
    const root = document.createElement('div');
    root.id = 'openCine';
    root.innerHTML = `<div class="kc-veil" style="background:${OPEN_CLOUD};opacity:1"></div><div class="kc-bar t"></div><div class="kc-bar b"></div>
      <div class="kc-cap"><b></b></div><button class="kc-skip" type="button">${KINGDOM_TEXT.skip}</button>`;
    this.host.root.appendChild(root);
    // (en deux temps : le premier appui demande « Vraiment passer ? », voir `skipAsk`)
    const ask = skipAsk(root, () => this.skip());
    root.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); ask(); });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      // (sous l'écran de chargement, c'est le film qui prend la touche)
      if (this.phase !== 'live') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) ask();
    };
    window.addEventListener('keydown', this.keyHandler, true);
    this.el = { root, veil: root.querySelector('.kc-veil')!, cap: root.querySelector('.kc-cap')! };
  }
}
