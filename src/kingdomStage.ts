import * as THREE from 'three';
import type { War, WarNews } from './sim/war';
import type { CameraRig } from './core/camera';
import type { HellView } from './render/hellView';
import { Z_KINGDOM, zoneOfZ } from './world/hell';
import { hellFallen } from './sim/kingdom';
import { GoldenBurst } from './render/goldenBurst';
import { KingdomEndFx } from './render/kingdomEndFx';
import { END_PLAN, EndShot, endShotAt, endShotStart, endFlashAt, endBlackAt, endCaptionAt, shouldPlayKingdomEnd } from './kingdomEnd';
import { BossBar, KINGDOM_TEXT, showKingdomVictory } from './ui/kingdom';

/**
 * La mise en scène du royaume des Enfers : la bannière à l'arrivée, la barre de vie du roi (puis de sa citadelle), les
 * tambours de guerre pendant le combat, les cris du roi (la vue tremble un peu), la caméra qui va sur lui quand il se lève
 * ou enrage ; puis la victoire : la caméra s'éloigne pendant que le royaume s'effondre dans la lave, retour sur l'île où le
 * portail s'éteint dans une explosion de lumière dorée, et l'écran de victoire. Tout est facultatif
 *
 * La victoire est une vraie cinématique en cinq plans (la partition est dans kingdomEnd.ts, le jeu ne s'arrête pas après elle) :
 * l'effondrement vu des Enfers avec son onde de choc dorée, la remontée par le portail, le portail qui s'éteint (démons en
 * cendres, soldats aux armes levées), l'île qui reverdit, le village en fête. Échap, espace ou « Passer » la saute
 */

export interface StageHost {
  war: War;
  cam: CameraRig;
  world: { portal: { x: number; z: number } | null; exp: { perks: readonly string[] }; hAt(x: number, z: number): number };
  /** la scène de la surface (l'explosion dorée s'y pose) */
  scene: THREE.Scene;
  mode(): 'surface' | 'under' | 'hell';
  hellView(): HellView | null;
  exitHell(): void;
  /** les démons encore debout sur l'île (pour les dissoudre), l'âge du village (la tenue des soldats) */
  raiders(): { x: number; z: number }[];
  age(): number;
  /** le cœur du village ; la fête (feu d'artifice) qui s'y tient ; la foule qui saute de joie (true) ou rentre chez elle (false) */
  village(): [number, number] | null;
  fest(x: number, z: number): void;
  crowd(on: boolean, x: number, z: number): void;
  /** la vue revient sur la grande place */
  goHome(): void;
  ui: { root: HTMLElement; banner(title: string, sub: string): void; toast(m: string, act?: () => void, level?: 'info' | 'notice' | 'danger' | 'action'): void };
  audio: { sfxRoar(k?: number): void; sfxWarDrum(accent?: boolean): void; sfxGoldBurst(): void; sfxRumble(dur: number): void; sfxAgeUp(): void };
}

/** L'explosion dorée du portail, à ce moment du plan « portail » */
const BURST_AT = 1.1;

interface Finale {
  t: number; shot: EndShot | null; burst: GoldenBurst | null; fx: KingdomEndFx | null; dist: number;
  /** rediffusion du mode développeur */
  force: boolean;
  /** la contamination de l'île n'est pas encore levée */
  hold: boolean;
  yaw: number; dissolved: boolean; rocketAt: number;
}

export class KingdomStage {
  bar: BossBar;
  private bannerShown = false;
  private roars = 0;
  private shakeT = 0;
  private shakeK = 0;
  private drumT = 0;
  private beat = 0;
  private phase = 0;
  private fin: Finale | null = null;
  private cine: { el: HTMLElement; veil: HTMLElement; cap: HTMLElement } | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** le portail est éteint (à la surface) : dès l'explosion dorée, ou d'emblée pour une partie reprise */
  private portalOut = false;

  constructor(private host: StageHost) {
    this.bar = new BossBar(host.ui.root);
    this.bar.onFocus = () => this.focusFight();
  }

  /** La vue va sur le combat : entre le roi et les soldats qui l'affrontent, d'assez haut pour voir les cercles au sol */
  focusFight() {
    const h = this.host, k = h.war.king?.king;
    if (!k || h.mode() !== 'hell') return;
    const near = h.war.faction?.alive('player').filter((u) => Math.hypot(u.x - k.x, u.z - k.z) < 16) ?? [];
    const x = near.length ? (k.x + near.reduce((s, u) => s + u.x, 0) / near.length) / 2 : k.x;
    const z = near.length ? (k.z + near.reduce((s, u) => s + u.z, 0) / near.length) / 2 : k.z;
    h.cam.goTo(x, z, Math.max(16, Math.min(22, h.cam.dist)));
  }

  /** La cinématique de la victoire est en cours */
  get playing() { return !!this.fin; }

  /** Le portail de l'île brûle encore (la vue du portail l'allume) */
  portalLit() {
    if (!hellFallen(this.host.world)) return true;
    // le royaume vient de tomber : il brûle jusqu'à l'explosion dorée
    if (this.fin && !this.portalOut) return true;
    this.portalOut = true;
    return false;
  }

  /** Une nouvelle de la guerre : true si la mise en scène s'en charge (le jeu ne l'affiche pas lui-même) */
  news(n: WarNews): boolean {
    const h = this.host;
    if (n.kind === 'boss') {
      h.ui.toast(n.text, undefined, 'danger');
      // le roi se lève, enrage : la vue va sur le combat
      if (h.mode() === 'hell' && h.war.king?.king && !n.text.startsWith('👑 Le roi des Enfers est abattu')) this.focusFight();
      return true;
    }
    if (n.kind === 'victory') { this.startFinale(); if (!this.fin) h.ui.toast(n.text, undefined, 'info'); return true; }
    return false;
  }

  /** Amplitude du tremblement de la vue (0 … 1) */
  shake() { return this.shakeT > 0 ? this.shakeK * Math.min(1, this.shakeT / 0.3) : 0; }

  update(dt: number) {
    const h = this.host, f = h.war.king, inHell = h.mode() === 'hell';
    this.shakeT = Math.max(0, this.shakeT - dt);
    // l'arrivée au royaume : la bannière (une fois par partie lancée)
    if (inHell && f && !f.fallen && !this.bannerShown && zoneOfZ(Math.floor(h.cam.target.z)) === Z_KINGDOM) {
      this.bannerShown = true;
      h.ui.banner(KINGDOM_TEXT.banner, KINGDOM_TEXT.bannerSub);
      h.audio.sfxRumble(3);
    }
    // les cris du roi : la vue tremble un peu
    if (f && f.roars !== this.roars) {
      if (f.roars > this.roars && inHell) { h.audio.sfxRoar(); this.shakeT = 0.9; this.shakeK = 0.45; }
      this.roars = f.roars;
    }
    // les tambours de guerre, tant que dure le combat (plus vite en rage)
    if (inHell && f?.fighting && !this.fin) {
      this.drumT -= dt;
      if (this.drumT <= 0) { this.drumT = f.phase === 2 ? 0.42 : 0.6; h.audio.sfxWarDrum(this.beat++ % 4 === 0); }
    } else this.beat = 0;
    if (f) this.phase = f.phase;
    // la barre de vie : le roi réveillé, puis sa citadelle quand il est tombé
    let bar: Parameters<BossBar['set']>[0] = null;
    if (inHell && f && !this.fin) {
      const k = f.king, c = f.citadel;
      if (f.fighting && k) bar = { name: KINGDOM_TEXT.king, frac: k.hp / k.maxHp, note: f.phase === 2 ? KINGDOM_TEXT.rage : KINGDOM_TEXT.wake, rage: f.phase === 2 };
      else if (f.phase === 3 && c && !c.down) bar = { name: KINGDOM_TEXT.citadel, frac: c.hp / c.maxHp, note: KINGDOM_TEXT.fallen, rage: false };
    }
    this.bar.set(bar);
    this.stepFinale(dt);
    // une partie quittée pendant la cinématique : l'écran de victoire (et ses récompenses, déjà touchées) au retour
    if (!this.fin && h.war.reward && h.mode() === 'surface') this.endFinale();
  }

  // ---------- La victoire : la cinématique de fin du volet militaire ----------

  /** Les nouvelles de la guerre lancent la cinématique (une seule fois : `war.endSeen`) ; sinon les récompenses d'emblée */
  private startFinale() {
    if (this.fin) return;
    if (!shouldPlayKingdomEnd(this.host.war)) { if (this.host.war.reward) this.endFinale(); return; }
    this.playEnd(false);
  }

  /** Lance la cinématique (`force` : la rejouer, mode développeur, sans récompenses) */
  playEnd(force: boolean) {
    if (this.fin) return;
    const h = this.host, hv = h.hellView();
    h.war.endSeen = true;
    // l'interface s'efface le temps de la cinématique
    document.body.classList.add('cinematic');
    this.buildCine();
    const inHell = h.mode() === 'hell' && !!hv;
    if (force) this.portalOut = false;
    this.fin = { t: inHell ? 0 : endShotStart('portal'), shot: null, burst: null, fx: null, dist: h.cam.dist, force, hold: true, yaw: h.cam.view().yaw, dissolved: false, rocketAt: -9 };
    if (inHell) {
      hv!.startCollapse();
      h.audio.sfxRumble(END_PLAN[0].dur);
      this.shakeT = END_PLAN[0].dur * 0.7; this.shakeK = 0.35;
    }
  }

  /** Le tour de la cinématique (une image) */
  private stepFinale(dt: number) {
    const fin = this.fin, h = this.host;
    if (!fin) return;
    fin.t += dt;
    const cur = endShotAt(fin.t), p = h.world.portal;
    this.paintCine(fin.t);
    if (!cur) { this.endFinale(); return; }
    const first = cur.shot !== fin.shot;
    fin.shot = cur.shot;
    fin.fx?.update(dt);
    const surface = h.mode() === 'surface';
    if (cur.shot === 'collapse') {
      // la vue s'éloigne de la citadelle en tournant lentement autour
      const kb = [...(h.hellView()?.hell.buildings.values() ?? [])].find((b) => b.kind === 'kingdom')?.site ?? h.war.king?.citadel?.site;
      if (kb) { h.cam.goTo(kb.x, kb.z - 1, fin.dist + (34 - fin.dist) * Math.min(1, cur.local / (END_PLAN[0].dur * 0.85))); h.cam.rotate(dt * 0.16); }
      return;
    }
    if (cur.shot === 'travel') {
      // la lumière couvre l'écran : on remonte par le portail
      if (first && h.mode() === 'hell') h.exitHell();
      if (surface && p) h.cam.jump({ x: p.x, z: p.z + 0.5, yaw: fin.yaw, pitch: 0.55, dist: 6 + cur.k * 8 }, h.world.hAt(p.x, p.z));
      return;
    }
    // (sans portail, ou toujours aux Enfers : on laisse passer le temps, puis on conclut)
    if (!p || !surface) { if (!p || cur.local > 3) this.endFinale(); return; }
    const gy = h.world.hAt(p.x, p.z);
    if (cur.shot === 'portal') {
      if (first) this.ensureFx(p);
      // le portail s'éteint dans une explosion de lumière dorée ; les démons restants se dissolvent, les soldats lèvent leurs armes
      h.cam.jump({ x: p.x, z: p.z + 1, yaw: fin.yaw, pitch: 0.62, dist: 14 + cur.k * 3 }, gy);
      if (!fin.dissolved && cur.local >= 0.2) {
        fin.dissolved = true;
        const left = h.raiders();
        fin.fx!.dissolve(left.length ? left : [0, 1, 2, 3].map((i) => ({ x: p.x + Math.cos(i * 1.6 + 0.5) * 3.4, z: p.z + Math.sin(i * 1.6 + 0.5) * 3.4 })));
      }
      if (cur.local >= 0.8) fin.fx!.raiseSoldiers(fin.yaw);
      if (!fin.burst && cur.local >= BURST_AT) {
        fin.burst = new GoldenBurst(p.x, gy, p.z);
        h.scene.add(fin.burst.group);
        this.portalOut = true;
        h.audio.sfxGoldBurst();
        this.shakeT = 0.6; this.shakeK = 0.25;
      }
      if (fin.burst && !fin.burst.update(dt)) this.dropBurst();
      return;
    }
    if (fin.burst) this.dropBurst();
    this.ensureFx(p);
    if (cur.shot === 'isle') {
      // l'île reverdit : la contamination se lève, des anneaux dorés la balaient, la vue recule et s'élève au-dessus d'elle
      if (cur.local >= 0.5 && fin.hold) { fin.hold = false; fin.fx!.regreen(); h.audio.sfxAgeUp(); }
      const e = ease(cur.k);
      h.cam.jump({ x: p.x, z: p.z, yaw: fin.yaw + cur.local * 0.1, pitch: 0.62 + e * 0.4, dist: 17 + e * 20 }, gy);
      return;
    }
    // le village fête ses héros : la vue glisse jusqu'à lui, feux d'artifice et habitants qui sautent de joie
    if (fin.hold) { fin.hold = false; fin.fx!.regreen(); }
    const v = h.village();
    if (!v) return;
    const e = ease(Math.min(1, cur.k * 1.5)), x = p.x + (v[0] - p.x) * e, z = p.z + (v[1] - p.z) * e;
    h.cam.jump({ x, z, yaw: fin.yaw + cur.local * 0.06 + 0.1, pitch: 1.02 - e * 0.22, dist: 37 - e * 17 }, h.world.hAt(x, z));
    if (first) h.crowd(true, v[0], v[1]);
    if (cur.local - fin.rocketAt > 1.6) { fin.rocketAt = cur.local; h.fest(v[0], v[1]); }
  }

  /** L'explosion dorée se retire (l'effet de surface, lui, reste jusqu'à la fin) */
  private dropBurst() {
    const f = this.fin;
    if (!f?.burst) return;
    this.host.scene.remove(f.burst.group);
    f.burst.dispose();
    f.burst = null;
  }

  private ensureFx(p: { x: number; z: number; r?: number }) {
    const f = this.fin!, h = this.host;
    if (f.fx) return;
    f.fx = new KingdomEndFx(p.x, p.z, p.r ?? 12, (x, z) => h.world.hAt(x, z), h.age());
    h.scene.add(f.fx.group);
  }

  /** Passer : tout de suite à la fin (depuis les Enfers, on remonte) */
  skip() { if (this.fin) this.endFinale(); }

  /** La contamination de l'île reste telle quelle tant que la cinématique ne l'a pas levée (une rediffusion ne la touche pas) */
  holdingBlight() { return !!this.fin?.hold && !this.fin.force; }

  // ---------- L'habillage : voile, bandeaux, bouton « Passer » ----------

  private buildCine() {
    if (this.cine) return;
    const el = document.createElement('div');
    el.id = 'kingCine';
    el.innerHTML = `<div class="kc-veil"></div><div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"></div><button class="kc-skip" type="button">${KINGDOM_TEXT.skip}</button>`;
    this.host.ui.root.appendChild(el);
    (el.querySelector('.kc-skip') as HTMLButtonElement).onclick = () => this.skip();
    // Échap ou espace : passer (avant tout le reste : la partie ne doit ni se mettre en pause ni réagir)
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.skip();
    };
    window.addEventListener('keydown', this.keyHandler, true);
    this.cine = { el, veil: el.querySelector('.kc-veil') as HTMLElement, cap: el.querySelector('.kc-cap') as HTMLElement };
  }

  private paintCine(t: number) {
    const c = this.cine;
    if (!c) return;
    const flash = endFlashAt(t), black = endBlackAt(t);
    c.veil.style.background = black > flash ? '#000' : 'radial-gradient(circle, #fff6d8 0%, #ffd890 70%, #ffc060 100%)';
    c.veil.style.opacity = String(Math.max(flash, black));
    const cap = endCaptionAt(t);
    c.cap.textContent = cap ? cap.text : '';
    c.cap.style.opacity = String(cap ? cap.alpha : 0);
  }

  private endFinale() {
    const h = this.host, f = this.fin;
    if (f) {
      this.dropBurst();
      if (f.fx) { h.scene.remove(f.fx.group); f.fx.dispose(); }
      this.portalOut = true;
    }
    h.crowd(false, 0, 0);
    this.fin = null;
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler, true); this.keyHandler = null; }
    this.cine?.el.remove();
    this.cine = null;
    document.body.classList.remove('cinematic');
    // « Passer » depuis les Enfers : on remonte
    if (h.mode() === 'hell') h.exitHell();
    // (la rediffusion du mode développeur ne touche ni aux récompenses ni à l'écran de victoire)
    if (f?.force) return;
    h.audio.sfxAgeUp();
    const r = h.war.reward;
    h.war.reward = null;
    showKingdomVictory(h.ui.root, r, () => {}, () => h.goHome());
  }
}

/** Mouvement doux (départ et arrivée lents) */
const ease = (k: number) => k * k * (3 - 2 * k);
