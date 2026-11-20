import type { CameraRig } from './core/camera';
import type { War } from './sim/war';
import { HELL_ZONES } from './world/hell';
import { PORTAL_CUT, portalCaptionAt, portalShotAt, portalVeilAt, PORTAL_PLAN } from './portalCine';
import { KINGDOM_TEXT } from './ui/kingdom';
import { tr } from './i18n';

/**
 * La mise en scène de la cinématique du portail (partition dans `portalCine.ts`) : une fois par partie, au premier passage
 * d'une recrue. En direct dans le jeu : l'arche de l'île qui s'emballe, la plongée dans le tourbillon, puis (derrière le noir)
 * l'entrée dans les Enfers sans écran de chargement, le Seuil où sort le soldat, les Grottes de braise, et le retour aux
 * troupes, où la barre de commandement revient. Habillage de la fin du royaume (`#kingCine`) : bandes noires, bandeau doré,
 * « Passer » ; un clic n'importe où, Échap ou Espace passent aussi (on finit dans les Enfers, au commandement)
 */
export interface PortalStageHost {
  cam: CameraRig;
  war: War;
  mode(): 'surface' | 'under' | 'hell';
  /** l'arche de l'île (centre, sol) et la direction où elle regarde (vers le continent) */
  portal(): { x: number; z: number; y: number; facing: number } | null;
  /** hauteur du sol des Enfers (null hors des Enfers) */
  hellY(x: number, z: number): number | null;
  /** l'arche s'emballe (0 … 1) */
  surge(k: number): void;
  /** le temps du jeu à ×1 pendant la cinématique (on voit le soldat sortir du portail), puis la vitesse d'avant */
  pace(cine: boolean): void;
  /** entre dans les Enfers sans écran de chargement (derrière le noir de la cinématique) ; `normal` : comme d'habitude */
  enterHell(quiet: boolean): void;
  /** la cinématique finie, dans les Enfers : la bannière, le chapitre du tutoriel, la vue posée sur les troupes */
  arrived(): void;
  ui: { root: HTMLElement };
  audio: { sfxRumble(dur: number): void; sfxRoar(k?: number): void };
}

/** Mouvement doux (départ et arrivée lents) */
const ease = (k: number) => k * k * (3 - 2 * k);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export class PortalStage {
  private t = 0;
  private shot: string | null = null;
  private el: { root: HTMLElement; veil: HTMLElement; cap: HTMLElement } | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** l'entrée dans les Enfers est demandée (on attend qu'elle soit faite, le temps tenu au noir) */
  private entering = false;
  private wait = 0;
  private yaw = 0;
  /** d'où partent les plans des Enfers : le portail, l'arrivée, l'avant-poste et la forteresse des Grottes de braise */
  private hp: { portal: [number, number]; arrival: [number, number]; outpost: [number, number]; fort: [number, number] } | null = null;
  /** la dernière vue du Seuil (le retour y glisse depuis les Grottes) */
  private last = { x: 0, z: 0, dist: 20, pitch: 0.7 };

  constructor(private host: PortalStageHost) {}

  get playing() { return !!this.el; }

  /** Lance la cinématique (la partie la note jouée tout de suite : une partie rechargée pendant elle ne la rejoue pas) */
  play() {
    const h = this.host, p = h.portal();
    if (this.el || !p) return;
    h.war.intro = 'seen';
    this.t = 0; this.shot = null; this.entering = false; this.hp = null;
    this.yaw = p.facing;
    document.body.classList.add('cinematic');
    h.pace(true);
    this.build();
  }

  /** Une image (temps réel, plafonné) ; la caméra est posée après sa propre mise à jour */
  step(dt: number) {
    if (!this.el) return;
    const h = this.host;
    // la coupe vers les Enfers : on attend d'y être, au noir
    if (this.t + dt >= PORTAL_CUT && h.mode() !== 'hell') {
      this.t = Math.min(this.t + dt, PORTAL_CUT);
      this.paint();
      if (this.t >= PORTAL_CUT && !this.entering) { this.entering = true; this.wait = 0; h.surge(0); h.enterHell(true); }
      // (l'entrée refusée ou bloquée : on ne reste pas au noir, la cinématique s'arrête là)
      if (this.entering && (this.wait += dt) > 8) this.close();
      return;
    }
    this.t += dt;
    const cur = portalShotAt(this.t);
    this.paint();
    if (!cur) { this.finish(); return; }
    const first = cur.shot !== this.shot;
    this.shot = cur.shot;
    if (cur.shot === 'awaken' || cur.shot === 'dive') {
      const p = h.portal();
      if (!p || h.mode() !== 'surface') return;
      const vy = p.y + 1.25;
      if (cur.shot === 'awaken') {
        // la vue tourne bas autour de l'arche, de trois quarts vers la face ; le tourbillon s'emballe
        const e = ease(cur.k);
        h.surge(cur.k);
        if (first) h.audio.sfxRumble(PORTAL_PLAN[0].dur + PORTAL_PLAN[1].dur);
        this.jump({ x: p.x, z: p.z, yaw: this.yaw + mix(1.05, 0.22, e), pitch: mix(0.42, 0.24, e), dist: mix(15, 9.5, e) }, vy);
      } else {
        // la plongée : de plus en plus vite, droit dans le tourbillon
        const e = cur.k * cur.k;
        h.surge(1);
        this.jump({ x: p.x, z: p.z, yaw: this.yaw + mix(0.22, 0, ease(cur.k)), pitch: mix(0.24, 0.04, e), dist: mix(9.5, 0.45, e) }, vy);
      }
      return;
    }
    // dans les Enfers
    const pts = this.hellPoints();
    if (!pts) return;
    if (cur.shot === 'threshold') {
      if (first) this.troopsOut(pts);
      // de haut au-dessus de l'arche, la vue descend vers le Seuil, où le soldat sort du portail
      const e = ease(cur.k), x = mix(pts.portal[0], pts.arrival[0], e), z = mix(pts.portal[1] + 1, pts.arrival[1] + 1.5, e);
      this.last = { x, z, dist: mix(28, 13, e), pitch: mix(1.2, 0.62, e) };
      this.jump({ x, z, yaw: Math.PI + mix(-0.25, 0, e), pitch: this.last.pitch, dist: this.last.dist }, h.hellY(x, z) ?? 0);
      return;
    }
    if (cur.shot === 'embers') {
      if (first) h.audio.sfxRoar(0.5);
      // la vue file vers le sud le long de la faille : les braises, l'avant-poste, puis la forteresse dans la brume
      const e = ease(cur.k), mid: [number, number] = [(pts.outpost[0] + pts.fort[0]) / 2, (pts.outpost[1] + pts.fort[1]) / 2];
      const x = mix(this.last.x, mid[0], e), z = mix(this.last.z, mid[1] - 3, e);
      this.jump({ x, z, yaw: Math.PI + Math.sin(cur.local * 0.35) * 0.12, pitch: mix(0.62, 0.5, e), dist: mix(13, 24, e) }, h.hellY(x, z) ?? 0);
      if (cur.k > 0.98) this.last = { x, z, dist: 24, pitch: 0.5 };
      return;
    }
    // le retour aux troupes, au Seuil : la vue s'y pose comme à l'entrée dans les Enfers
    const e = ease(cur.k), [tx, tz] = this.troopsCenter(pts);
    const x = mix(this.last.x, tx, e), z = mix(this.last.z, tz + 1.5, e);
    this.jump({ x, z, yaw: Math.PI, pitch: mix(0.5, 0.72, e), dist: mix(24, 16, e) }, h.hellY(x, z) ?? 0);
  }

  /** Passer : on finit dans les Enfers, au commandement (par l'écran de chargement si l'on n'y est pas encore) */
  skip() {
    if (!this.el) return;
    const h = this.host;
    const inHell = h.mode() === 'hell';
    this.close();
    if (inHell) { this.settle(); h.arrived(); }
    else if (!this.entering) h.enterHell(false);
    // (l'entrée sans écran est déjà partie : elle finit seule, la vue est posée à l'arrivée)
    else this.pendingArrive = true;
  }
  /** passé pendant l'entrée silencieuse : la vue se pose et le guide parle une fois dans les Enfers (`arrivedLate`) */
  private pendingArrive = false;
  /** À appeler à chaque image : une entrée silencieuse passée en route se conclut une fois dans les Enfers */
  tick() {
    if (this.pendingArrive && this.host.mode() === 'hell') { this.pendingArrive = false; this.settle(); this.host.arrived(); }
  }

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
    const h = this.host;
    h.surge(0);
    h.pace(false);
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler, true); this.keyHandler = null; }
    this.el?.root.remove();
    this.el = null;
    document.body.classList.remove('cinematic');
  }

  /** Pose la caméra (sans les bornes de zoom et d'inclinaison du joueur : la plongée va jusque dans l'arche) */
  private jump(v: { x: number; z: number; yaw: number; pitch: number; dist: number }, y: number) {
    const c = this.host.cam, md = c.minDist, mp = c.minPitch;
    c.minDist = 0.3; c.minPitch = 0.01;
    c.jump(v, y);
    c.minDist = md; c.minPitch = mp;
  }

  /** Les repères des Enfers (null hors des Enfers) */
  private hellPoints() {
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
  private troopsOut(pts: NonNullable<PortalStage['hp']>) {
    const f = this.host.war.faction, us = this.host.war.troopsIn(f);
    if (!f || !us.length) return;
    us.forEach((u, i) => { u.x = pts.portal[0] + ((i % 3) - 1) * 0.6; u.z = pts.portal[1] + 1.2 + Math.floor(i / 3) * 0.5; });
    f.order(us.map((u) => u.id), { kind: 'move', x: pts.arrival[0], z: pts.arrival[1] + 0.5 });
  }

  /** Le centre des troupes dans les Enfers (sinon le point d'arrivée) */
  private troopsCenter(pts: NonNullable<PortalStage['hp']>): [number, number] {
    const us = this.host.war.troopsIn(this.host.war.faction);
    if (!us.length) return pts.arrival;
    return [us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.z, 0) / us.length];
  }

  // ---------- L'habillage : voile, bandeaux, « Passer » ----------

  private build() {
    const root = document.createElement('div');
    root.id = 'portalCine';
    root.innerHTML = `<div class="kc-veil"></div><div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"></div><button class="kc-skip" type="button">${KINGDOM_TEXT.skip}</button>`;
    this.host.ui.root.appendChild(root);
    // (un clic n'importe où passe, comme la traversée ; le bouton aussi)
    root.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.skip(); });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.skip();
    };
    window.addEventListener('keydown', this.keyHandler, true);
    this.el = { root, veil: root.querySelector('.kc-veil') as HTMLElement, cap: root.querySelector('.kc-cap') as HTMLElement };
  }

  private paint() {
    const c = this.el;
    if (!c) return;
    const v = portalVeilAt(this.t);
    c.veil.style.background = v.black >= v.flash ? '#000' : 'radial-gradient(circle, #f0c8ff 0%, #a04ee0 55%, #3a0a5a 100%)';
    c.veil.style.opacity = String(Math.max(v.flash, v.black));
    const cap = portalCaptionAt(this.t);
    const html = cap ? `${tr(cap.text)}${cap.sub ? `<small>${tr(cap.sub)}</small>` : ''}` : '';
    if (c.cap.innerHTML !== html) c.cap.innerHTML = html;
    c.cap.style.opacity = String(cap ? cap.alpha : 0);
  }
}
