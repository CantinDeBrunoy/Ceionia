import type * as THREE from 'three';
import type { CameraRig } from './core/camera';
import type { Trophies, TrophyId } from './render/trophies';
import { TrophyRise } from './render/trophyRise';
import { TrophyCineQueue, TrophyEntry, SHOT, cineView, riseAt, captionAt, CineView, pickAngle } from './trophyCine';
import { tr } from './i18n';
import { KINGDOM_TEXT } from './ui/kingdom';

/**
 * La petite cinématique (5 s) d'un trophée qui rejoint la grande place au retour d'une expédition légendaire (mammouth, kraken,
 * mégalodon, dragon) : la vue glisse vers la place et tourne autour, le trophée monte de terre dans la poussière et les
 * étincelles d'or, un bandeau dit ce que c'est, puis la vue revient où elle était. L'interface s'efface (`body.cinematic`), le
 * jeu continue. Un clic, Échap ou Espace la passe. Elle attend que le joueur soit tranquille (ni pose, ni fenêtre, en surface)
 */

export interface TrophyStageHost {
  cam: CameraRig;
  scene: THREE.Scene;
  root: HTMLElement;
  trophies: Trophies;
  audio: { sfxTrophy(delay?: number): void };
  /** les trophées gagnés */
  won: () => string[];
  /**
   * le joueur est tranquille : en surface, ni pose de bâtiment, ni fenêtre ouverte, ni autre cinématique (les notifications ne
   * comptent pas : l'interface s'efface). passing : compter aussi une bannière qui passe (elle s'en va d'elle-même)
   */
  calm: (passing?: boolean) => boolean;
  /** on est toujours en surface (sinon la cinématique s'arrête) */
  surface: () => boolean;
  /** hauteur du sol */
  ground: (x: number, z: number) => number;
  /** le haut de ce qui se dresse en ce point : le sol, un arbre, un bâtiment (pas la place) */
  top: (x: number, z: number) => number;
  /** repose les trophées de la place tout de suite */
  syncTrophies: () => void;
  /** la vue cesse de suivre quoi que ce soit (équipe, train, incident) */
  release: () => void;
  /** le village fait la fête sur la place (en relance une si elle dure déjà) */
  fest: (x: number, z: number) => void;
}

/** Le bandeau de chaque trophée */
const CAPTION: Record<string, () => string> = {
  mammoth: () => tr('Le trophée du mammouth rejoint la place'),
  kraken: () => tr('Le tentacule du kraken rejoint la place'),
  megalodon: () => tr('La dent du mégalodon rejoint la place'),
  dragon: () => tr('Le crâne du dragon rejoint la place'),
};

/** l'orientation des trophées, tournés vers la vue d'ensemble (voir trophies.ts) : on les voit de face de ce côté */
const FRONT_YAW = 0.75;

const CSS = `
#trophyCine { position: absolute; inset: 0; z-index: 35; pointer-events: none !important; }
#trophyCine .tc-bar { position: absolute; left: 0; right: 0; height: 6vh; background: #000; transition: transform 0.6s ease; }
#trophyCine .tc-bar.t { top: 0; transform: translateY(-100%); }
#trophyCine .tc-bar.b { bottom: 0; transform: translateY(100%); }
#trophyCine.on .tc-bar { transform: none; }
#trophyCine .tc-cap { position: absolute; left: 16px; right: 16px; bottom: calc(6vh + 7vh); text-align: center; font-family: var(--hSerif, Georgia, serif); font-size: clamp(20px, 3.4vw, 34px); font-weight: 800; letter-spacing: 0.01em; color: #fff1c8; text-shadow: 0 2px 14px rgba(0, 0, 0, 0.85), 0 0 26px rgba(255, 190, 70, 0.6); opacity: 0; }
#trophyCine .tc-cap::before, #trophyCine .tc-cap::after { content: ''; display: inline-block; vertical-align: middle; width: clamp(24px, 6vw, 70px); height: 2px; margin: 0 14px; background: linear-gradient(90deg, rgba(232, 190, 100, 0), #e8be64); }
#trophyCine .tc-cap::after { background: linear-gradient(90deg, #e8be64, rgba(232, 190, 100, 0)); }
#trophyCine .tc-skip { position: absolute; right: 16px; bottom: calc(6vh + 10px); pointer-events: auto !important; padding: 5px 12px; border-radius: 8px; border: 1px solid rgba(232, 190, 100, 0.5); background: rgba(20, 14, 6, 0.55); color: #f4e6c4; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; opacity: 0.75; }
#trophyCine .tc-skip:hover { opacity: 1; }
`;

interface Playing { e: TrophyEntry; from: CineView; close: CineView; h: number; fx: TrophyRise; chimed: boolean; cheered: boolean }

export class TrophyStage {
  readonly q: TrophyCineQueue;
  private cur: Playing | null = null;
  private el: { root: HTMLElement; cap: HTMLElement } | null = null;
  private off: (() => void) | null = null;

  constructor(private host: TrophyStageHost) { this.q = new TrophyCineQueue(host.won()); }

  get playing() { return !!this.cur; }

  /** Ce trophée attend sa cinématique : pas encore sur la place */
  hidden(id: string) { return this.q.hidden(id); }

  /**
   * Une expédition réussie revient : si elle rapporte un trophée et que le joueur est tranquille, la cinématique part et
   * `after` (le récit) attend sa fin ; rend vrai dans ce cas. Sinon le trophée attend son tour, et c'est à l'appelant de
   * montrer le récit tout de suite
   */
  report(after: () => void) { return this.q.detect(this.host.won(), after, this.host.calm(false) && !this.cur); }

  /** Un tour (temps réel, s) */
  update(dt: number) {
    const h = this.host;
    if (!this.cur) this.q.detect(h.won());
    if (this.cur && !h.surface()) { this.skip(); return; }
    const r = this.q.update(dt, !this.cur && h.calm(true));
    r.release?.();
    if (r.end) this.finish(r.end, false);
    if (r.start) this.begin(r.start);
    if (this.cur) this.step();
  }

  /** Passer la cinématique en cours */
  skip() {
    const e = this.q.skip();
    if (e) this.finish(e, true);
  }

  private begin(e: TrophyEntry) {
    const h = this.host, id = e.id as TrophyId;
    h.release();
    h.syncTrophies();
    const at = h.trophies.where(id);
    // (pas de place au village : rien à montrer)
    if (!at) { this.q.skip(); e.after?.(); return; }
    h.trophies.lift(id, -(at.h + 0.2));
    const from = h.cam.view();
    const dist = Math.max(3.3, 1.6 + at.h * 6), a = pickAngle(at, dist, FRONT_YAW, h.top);
    const close: CineView = { x: at.x, z: at.z, yaw: a.yaw, pitch: a.pitch, dist };
    const fx = new TrophyRise(at.x, at.y, at.z, at.h, SHOT.riseFrom, SHOT.riseTo, SHOT.burst);
    h.scene.add(fx.group);
    this.cur = { e, from, close, h: at.h, fx, chimed: false, cheered: false };
    this.show(CAPTION[id]?.() ?? '');
    h.cam.enabled = false;
  }

  private step() {
    const c = this.cur!, h = this.host, t = c.e.t, id = c.e.id as TrophyId;
    const v = cineView(t, c.from, c.close);
    // (de près, la vue vise un peu au-dessus du sol : le milieu du trophée)
    const span = Math.log(c.from.dist) - Math.log(c.close.dist), k = span > 0.01 ? Math.min(1, Math.max(0, (Math.log(c.from.dist) - Math.log(v.dist)) / span)) : 1;
    h.cam.jump(v, h.ground(v.x, v.z) + c.h * 0.4 * k);
    h.trophies.lift(id, -(c.h + 0.2) * (1 - riseAt(t)));
    c.fx.update(t);
    if (!c.chimed && t >= SHOT.riseFrom) { c.chimed = true; h.audio.sfxTrophy(SHOT.burst - SHOT.riseFrom); }
    if (!c.cheered && t >= SHOT.burst) { c.cheered = true; h.fest(c.close.x, c.close.z); }
    if (this.el) this.el.cap.style.opacity = String(captionAt(t));
  }

  private finish(e: TrophyEntry, skipped: boolean) {
    const h = this.host, c = this.cur;
    h.trophies.lift(e.id as TrophyId, 0);
    this.hide();
    h.cam.enabled = true;
    if (c) {
      c.fx.dispose();
      // la vue revient où elle était (après « Passer », elle y glisse)
      if (skipped) h.cam.aim(c.from); else h.cam.jump(c.from, h.ground(c.from.x, c.from.z));
    }
    this.cur = null;
    e.after?.();
  }

  // ---------- L'habillage : bandes, bandeau, « Passer » ----------

  private show(text: string) {
    const h = this.host;
    if (!document.getElementById('trophyCineCss')) {
      const s = document.createElement('style');
      s.id = 'trophyCineCss';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    document.body.classList.add('cinematic');
    const root = document.createElement('div');
    root.id = 'trophyCine';
    root.innerHTML = `<div class="tc-bar t"></div><div class="tc-bar b"></div><div class="tc-cap"></div><button class="tc-skip" type="button">${KINGDOM_TEXT.skip}</button>`;
    const cap = root.querySelector('.tc-cap') as HTMLElement;
    cap.textContent = text;
    h.root.appendChild(root);
    requestAnimationFrame(() => root.classList.add('on'));
    this.el = { root, cap };
    // un clic n'importe où, Échap ou Espace : passer (avant tout le reste : ni pause, ni outil, ni fenêtre)
    const key = (ev: KeyboardEvent) => {
      if (ev.code !== 'Escape' && ev.code !== 'Space') return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      this.skip();
    };
    const click = (ev: PointerEvent) => { ev.preventDefault(); ev.stopImmediatePropagation(); this.skip(); };
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', click, true);
    this.off = () => { window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown', click, true); };
  }

  private hide() {
    this.off?.();
    this.off = null;
    this.el?.root.remove();
    this.el = null;
    // (la cinématique du royaume pourrait l'avoir posée aussi : elle la retire elle-même)
    if (!document.getElementById('kingCine')) document.body.classList.remove('cinematic');
  }
}
