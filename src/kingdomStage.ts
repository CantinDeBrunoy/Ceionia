import * as THREE from 'three';
import type { War, WarNews } from './sim/war';
import type { CameraRig } from './core/camera';
import type { HellView } from './render/hellView';
import { Z_KINGDOM, zoneOfZ } from './world/hell';
import { hellFallen } from './sim/kingdom';
import { GoldenBurst } from './render/goldenBurst';
import { BossBar, KINGDOM_TEXT, showKingdomVictory } from './ui/kingdom';

/**
 * La mise en scène du royaume des Enfers : la bannière à l'arrivée, la barre de vie du roi (puis de sa citadelle), les
 * tambours de guerre pendant le combat, les cris du roi (la vue tremble un peu), la caméra qui va sur lui quand il se lève
 * ou enrage ; puis la victoire : la caméra s'éloigne pendant que le royaume s'effondre dans la lave, retour sur l'île où le
 * portail s'éteint dans une explosion de lumière dorée, et l'écran de victoire. Tout est facultatif
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
  /** la vue revient sur la grande place */
  goHome(): void;
  setPhoto(on: boolean): void;
  ui: { root: HTMLElement; banner(title: string, sub: string): void; toast(m: string, act?: () => void): void };
  audio: { sfxRoar(k?: number): void; sfxWarDrum(accent?: boolean): void; sfxGoldBurst(): void; sfxRumble(dur: number): void; sfxAgeUp(): void };
}

/** Durées de la cinématique : l'effondrement (vu des Enfers), le passage à la surface, l'explosion dorée avant l'écran */
const COLLAPSE = 6, TRAVEL = 1.4, PORTAL = 5.2, BURST_AT = 1.1;

export class KingdomStage {
  bar: BossBar;
  private bannerShown = false;
  private roars = 0;
  private shakeT = 0;
  private shakeK = 0;
  private drumT = 0;
  private beat = 0;
  private phase = 0;
  private fin: { t: number; stage: 'collapse' | 'travel' | 'portal'; burst: GoldenBurst | null; dist: number } | null = null;
  /** le portail est éteint (à la surface) : dès l'explosion dorée, ou d'emblée pour une partie reprise */
  private portalOut = false;

  constructor(private host: StageHost) {
    this.bar = new BossBar(host.ui.root);
    this.bar.onFocus = () => { const k = host.war.king?.king; if (k && host.mode() === 'hell') host.cam.goTo(k.x, k.z + 3, 16); };
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
      h.ui.toast(n.text);
      const k = h.war.king?.king;
      // le roi se lève, enrage : la vue va sur lui
      if (h.mode() === 'hell' && k && !n.text.startsWith('👑 Le roi des Enfers est abattu')) h.cam.goTo(k.x, k.z + 3, Math.max(14, Math.min(20, h.cam.dist)));
      return true;
    }
    if (n.kind === 'victory') { this.startFinale(); h.ui.toast(n.text); return true; }
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
  }

  // ---------- La victoire ----------

  private startFinale() {
    if (this.fin) return;
    const h = this.host, hv = h.hellView();
    h.setPhoto(true);
    if (h.mode() === 'hell' && hv) {
      hv.startCollapse();
      h.audio.sfxRumble(COLLAPSE);
      this.shakeT = COLLAPSE * 0.7; this.shakeK = 0.35;
      this.fin = { t: 0, stage: 'collapse', burst: null, dist: h.cam.dist };
    } else this.fin = { t: 0, stage: 'portal', burst: null, dist: h.cam.dist };
  }

  private stepFinale(dt: number) {
    const fin = this.fin, h = this.host;
    if (!fin) return;
    fin.t += dt;
    if (fin.stage === 'collapse') {
      // la vue s'éloigne de la citadelle en tournant lentement autour
      const c = h.war.king?.citadel;
      if (c) { h.cam.goTo(c.site.x, c.site.z - 1, fin.dist + (30 - fin.dist) * Math.min(1, fin.t / (COLLAPSE * 0.8))); h.cam.rotate(dt * 0.16); }
      if (fin.t >= COLLAPSE) { fin.stage = 'travel'; fin.t = 0; h.exitHell(); }
      return;
    }
    if (fin.stage === 'travel') {
      if (fin.t >= TRAVEL && h.mode() === 'surface') { fin.stage = 'portal'; fin.t = 0; }
      return;
    }
    // à la surface : la vue va sur le portail, qui s'éteint dans une explosion de lumière dorée
    const p = h.world.portal;
    if (!p) { this.endFinale(); return; }
    if (fin.t < BURST_AT + 0.5) h.cam.goTo(p.x, p.z + 1, 16);
    if (!fin.burst && fin.t >= BURST_AT) {
      fin.burst = new GoldenBurst(p.x, h.world.hAt(p.x, p.z), p.z);
      h.scene.add(fin.burst.group);
      this.portalOut = true;
      h.audio.sfxGoldBurst();
      this.shakeT = 0.6; this.shakeK = 0.25;
    }
    if (fin.burst && !fin.burst.update(dt)) { h.scene.remove(fin.burst.group); fin.burst.dispose(); fin.burst = null; fin.t = Math.max(fin.t, PORTAL); }
    if (fin.t >= PORTAL && !fin.burst) this.endFinale();
  }

  private endFinale() {
    const h = this.host;
    if (this.fin?.burst) { h.scene.remove(this.fin.burst.group); this.fin.burst.dispose(); }
    this.fin = null;
    h.setPhoto(false);
    h.audio.sfxAgeUp();
    const r = h.war.reward;
    h.war.reward = null;
    showKingdomVictory(h.ui.root, r, () => {}, () => h.goHome());
  }
}
