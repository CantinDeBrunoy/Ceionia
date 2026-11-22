import type { CameraRig } from './core/camera';
import type { War } from './sim/war';
import { HELL_ZONES } from './world/hell';
import { PORTAL_FILM, PORTAL_FALLBACK, fallbackAt, portalBlackAt, portalCaptionAt, portalFilmCaptionAt, portalShotAt } from './portalCine';
import { KINGDOM_TEXT } from './ui/kingdom';
import { tr } from './i18n';

/**
 * La mise en scène de la cinématique du portail (partition dans `portalCine.ts`) : une fois par partie, à l'ouverture du
 * portail (avant : au premier passage d'une recrue). D'abord **le film** (la vidéo de l'auteur, WebM puis MP4 de secours ; sans vidéo, le tourbillon peint qui
 * grandit, puis le noir), opaque par-dessus le jeu : derrière lui, l'entrée dans les Enfers se fait sans écran de chargement
 * (`enterHell(true)`). Puis **le direct**, qui s'ouvre sur le noir où le film a fini : le Seuil où les troupes sortent du
 * portail, la faille jusqu'aux Grottes de braise, le retour aux troupes. Habillage de la traversée et de la fin du royaume
 * (`#portalCine` partage les styles de `#kingCine`) : bandes noires, bandeau doré, « Passer » ; un clic n'importe où, Échap ou
 * Espace passent aussi (on finit dans les Enfers, au commandement)
 */
export interface PortalStageHost {
  cam: CameraRig;
  war: War;
  mode(): 'surface' | 'under' | 'hell';
  /** hauteur du sol des Enfers (null hors des Enfers) */
  hellY(x: number, z: number): number | null;
  /** le temps du jeu à ×1 pendant la cinématique (on voit les soldats sortir du portail), puis la vitesse d'avant */
  pace(cine: boolean): void;
  /** entre dans les Enfers ; `quiet` : sans écran de chargement (derrière le film), la vue et le guide attendent la fin */
  enterHell(quiet: boolean): void;
  /** la cinématique finie, dans les Enfers : la bannière, le chapitre du tutoriel */
  arrived(): void;
  ui: { root: HTMLElement };
}

/** Mouvement doux (départ et arrivée lents) */
const ease = (k: number) => k * k * (3 - 2 * k);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

type Pts = { portal: [number, number]; arrival: [number, number]; outpost: [number, number]; fort: [number, number] };
type View = { x: number; z: number; dist: number; pitch: number };

export class PortalStage {
  /** `film` : la vidéo (ou le fondu de remplacement) ; `wait` : le film fini, au noir, les Enfers pas encore prêts ; `live` : le direct */
  private phase: 'film' | 'wait' | 'live' | null = null;
  private t = 0;
  /** le fondu de remplacement (sans vidéo) et son temps */
  private plate = false;
  private plateT = 0;
  private shot: string | null = null;
  private el: { root: HTMLElement; veil: HTMLElement; cap: HTMLElement; film: HTMLElement; video: HTMLVideoElement; vortex: HTMLElement } | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private hp: Pts | null = null;
  /** la vue au bout du plan précédent, et au départ du plan en cours */
  private last: View = { x: 0, z: 0, dist: 13, pitch: 0.62 };
  private from: View = { x: 0, z: 0, dist: 13, pitch: 0.62 };
  /** passé pendant que les Enfers se préparaient : la vue se pose et le guide parle une fois arrivé (`tick`) */
  private pendingArrive = false;

  constructor(private host: PortalStageHost) {}

  get playing() { return !!this.el; }

  /** Lance la cinématique (la partie la note jouée tout de suite : une partie rechargée pendant elle ne la rejoue pas) */
  play() {
    const h = this.host;
    if (this.el) return;
    h.war.intro = 'seen';
    this.phase = 'film'; this.t = 0; this.shot = null; this.hp = null; this.plate = false; this.plateT = 0;
    document.body.classList.add('cinematic');
    h.pace(true);
    this.build();
    // les Enfers se préparent derrière le film (il est opaque : le changement de scène ne se voit pas)
    requestAnimationFrame(() => { if (this.el) h.enterHell(true); });
  }

  /** Une image (temps réel, plafonné) ; la caméra est posée après sa propre mise à jour */
  step(dt: number) {
    const c = this.el, h = this.host;
    if (!c) return;
    if (this.phase === 'film') {
      if (this.plate) {
        this.plateT += dt;
        const f = fallbackAt(this.plateT);
        c.vortex.style.transform = `translate(-50%, -50%) scale(${0.25 + f.grow * 3}) rotate(${this.plateT * 140}deg)`;
        c.veil.style.background = '#000';
        c.veil.style.opacity = String(f.black);
        // (le bandeau du film, ramené à la durée du fondu)
        const cap = PORTAL_FILM.captions[0];
        this.paintFilmCap(cap ? cap.at + (this.plateT / PORTAL_FALLBACK) * cap.dur * 0.8 : 0);
        if (this.plateT >= PORTAL_FALLBACK) this.filmDone();
      } else this.paintFilmCap(c.video.currentTime || 0);
      return;
    }
    if (this.phase === 'wait') {
      if (h.mode() === 'hell') this.startLive();
      // (l'entrée refusée ou bloquée : on ne reste pas au noir)
      else if ((this.t += dt) > 8) this.close();
      return;
    }
    // le direct, dans les Enfers
    this.t += dt;
    const cur = portalShotAt(this.t);
    c.veil.style.opacity = String(portalBlackAt(this.t));
    const cap = portalCaptionAt(this.t);
    this.setCap(cap ? tr(cap.text) : '', cap?.sub ? tr(cap.sub) : '', cap ? cap.alpha : 0);
    if (!cur) { this.finish(); return; }
    const first = cur.shot !== this.shot;
    this.shot = cur.shot;
    const pts = this.hellPoints();
    if (!pts) return;
    if (first) this.from = { ...this.last };
    const e = ease(cur.k), f = this.from;
    if (cur.shot === 'threshold') {
      if (first) this.troopsOut(pts);
      // de haut au-dessus de l'arche, la vue descend vers le Seuil, où les soldats sortent du portail
      const x = mix(pts.portal[0], pts.arrival[0], e), z = mix(pts.portal[1] + 1, pts.arrival[1] + 1.5, e);
      this.last = { x, z, dist: mix(26, 13, e), pitch: mix(1.15, 0.62, e) };
      this.jump(this.last, Math.PI + mix(-0.25, 0, e), h.hellY(x, z) ?? 0);
      return;
    }
    if (cur.shot === 'embers') {
      // la vue file vers le sud le long de la faille : les braises, l'avant-poste, puis la forteresse dans la brume rouge
      const mid: [number, number] = [(pts.outpost[0] + pts.fort[0]) / 2, (pts.outpost[1] + pts.fort[1]) / 2];
      const x = mix(f.x, mid[0], e), z = mix(f.z, mid[1] - 3, e);
      this.last = { x, z, dist: mix(f.dist, 24, e), pitch: mix(f.pitch, 0.5, e) };
      this.jump(this.last, Math.PI + Math.sin(cur.local * 0.35) * 0.12, h.hellY(x, z) ?? 0);
      return;
    }
    // le retour aux troupes, au Seuil : la vue s'y pose comme à une entrée ordinaire
    const [tx, tz] = this.troopsCenter(pts);
    const x = mix(f.x, tx, e), z = mix(f.z, tz + 1.5, e);
    this.last = { x, z, dist: mix(f.dist, 16, e), pitch: mix(f.pitch, 0.72, e) };
    this.jump(this.last, Math.PI, h.hellY(x, z) ?? 0);
  }

  /** À appeler à chaque image : passé pendant la préparation des Enfers, on conclut une fois arrivé */
  tick() {
    if (this.pendingArrive && this.host.mode() === 'hell') { this.pendingArrive = false; this.settle(); this.host.arrived(); }
  }

  /** Passer : on finit dans les Enfers, au commandement */
  skip() {
    if (!this.el) return;
    const h = this.host;
    this.close();
    if (h.mode() === 'hell') { this.settle(); h.arrived(); }
    // (les Enfers se préparent encore derrière : la vue se pose dès qu'ils sont là)
    else this.pendingArrive = true;
  }

  /** Le film est fini (ou le fondu de remplacement) : au noir, le direct attend les Enfers */
  private filmDone() {
    const c = this.el;
    if (!c || this.phase !== 'film') return;
    c.video.pause();
    c.veil.style.background = '#000';
    c.veil.style.opacity = '1';
    c.film.style.display = 'none';
    this.setCap('', '', 0);
    this.phase = 'wait'; this.t = 0;
    if (this.host.mode() === 'hell') this.startLive();
  }

  private startLive() { this.phase = 'live'; this.t = 0; this.shot = null; }

  private finish() {
    this.close();
    this.settle();
    this.host.arrived();
  }

  /** La vue posée sur les troupes, comme à l'entrée dans les Enfers */
  private settle() {
    const h = this.host, pts = this.hellPoints();
    if (!pts || h.mode() !== 'hell') return;
    const [x, z] = this.troopsCenter(pts);
    h.cam.jump({ x, z: z + 1.5, yaw: Math.PI, pitch: 0.72, dist: 16 }, h.hellY(x, z + 1.5) ?? 0);
  }

  private close() {
    this.host.pace(false);
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler, true); this.keyHandler = null; }
    if (this.el) { this.el.video.pause(); this.el.root.remove(); }
    this.el = null;
    this.phase = null;
    document.body.classList.remove('cinematic');
  }

  /** Pose la caméra (sans les bornes de zoom et d'inclinaison du joueur) */
  private jump(v: View, yaw: number, y: number) {
    const c = this.host.cam, md = c.minDist, mp = c.minPitch;
    c.minDist = 0.3; c.minPitch = 0.01;
    c.jump({ x: v.x, z: v.z, dist: v.dist, pitch: v.pitch, yaw }, y);
    c.minDist = md; c.minPitch = mp;
  }

  /** Les repères des Enfers (null hors des Enfers) */
  private hellPoints(): Pts | null {
    if (this.hp) return this.hp;
    const w = this.host.war, m = w.hellMap, f = w.faction;
    if (!m || !f || this.host.mode() !== 'hell') return null;
    const site = (kind: string): [number, number] => {
      const b = [...f.buildings.values()].find((x) => x.site.kind === kind && x.site.zone === 1)?.site ?? m.zones[1]?.sites.find((s) => s.kind === kind);
      return b ? [b.x, b.z] : [m.arrival[0], HELL_ZONES[1].z0 + 10];
    };
    this.hp = { portal: [m.portal[0], m.portal[1]], arrival: [m.arrival[0], m.arrival[1]], outpost: site('outpost'), fort: site('fortress') };
    return this.hp;
  }

  /** Les troupes sortent du portail : posées devant l'arche, elles marchent jusqu'au point d'arrivée */
  private troopsOut(pts: Pts) {
    const f = this.host.war.faction, us = this.host.war.troopsIn(f);
    if (!f || !us.length) return;
    us.forEach((u, i) => { u.x = pts.portal[0] + ((i % 3) - 1) * 0.6; u.z = pts.portal[1] + 1.2 + Math.floor(i / 3) * 0.5; });
    f.order(us.map((u) => u.id), { kind: 'move', x: pts.arrival[0], z: pts.arrival[1] + 0.5 });
  }

  /** Le centre des troupes dans les Enfers (sinon le point d'arrivée) */
  private troopsCenter(pts: Pts): [number, number] {
    const us = this.host.war.troopsIn(this.host.war.faction);
    if (!us.length) return pts.arrival;
    return [us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.z, 0) / us.length];
  }

  // ---------- L'habillage : le film, le voile, les bandeaux, « Passer » ----------

  private build() {
    const root = document.createElement('div');
    root.id = 'portalCine';
    root.innerHTML = `<div class="ptFilm"><i class="ptVortex"></i><video muted playsinline preload="auto" disablepictureinpicture aria-hidden="true">
        <source src="${PORTAL_FILM.webm}" type="video/webm"><source src="${PORTAL_FILM.mp4}" type="video/mp4"></video></div>
      <div class="kc-veil"></div><div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"><b></b><small></small></div>
      <button class="kc-skip" type="button">${KINGDOM_TEXT.skip}</button>`;
    this.host.ui.root.appendChild(root);
    // (un clic n'importe où passe, comme la traversée ; le bouton aussi)
    root.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.skip(); });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.skip();
    };
    window.addEventListener('keydown', this.keyHandler, true);
    const video = root.querySelector('video')!;
    this.el = { root, veil: root.querySelector('.kc-veil')!, cap: root.querySelector('.kc-cap')!, film: root.querySelector('.ptFilm')!, video, vortex: root.querySelector('.ptVortex')! };
    // la WebM, puis le MP4 de secours ; illisibles, introuvables ou refusés : le fondu de remplacement
    let fallback = false;
    const toPlate = () => { if (this.el?.video === video && this.phase === 'film' && !this.plate) { this.plate = true; root.classList.add('plate'); } };
    const fail = () => {
      if (!fallback && !video.currentSrc.endsWith('.mp4')) {
        fallback = true;
        video.src = PORTAL_FILM.mp4;
        void video.play().catch(toPlate);
        return;
      }
      toPlate();
    };
    video.addEventListener('error', fail);
    video.querySelectorAll('source')[1]?.addEventListener('error', fail);
    video.addEventListener('ended', () => this.filmDone());
    void video.play().catch(toPlate);
  }

  private paintFilmCap(t: number) {
    const c = portalFilmCaptionAt(t);
    this.setCap(c ? tr(c.text) : '', c?.sub ? tr(c.sub) : '', c ? c.alpha : 0);
  }

  private setCap(text: string, sub: string, alpha: number) {
    const c = this.el;
    if (!c) return;
    const b = c.cap.querySelector('b')!, s = c.cap.querySelector('small')!;
    if (b.textContent !== text) b.textContent = text;
    if (s.textContent !== sub) s.textContent = sub;
    c.cap.style.opacity = String(alpha);
  }
}
