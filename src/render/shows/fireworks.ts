import * as THREE from 'three';
import { tr } from '../../i18n';
import { puffTexture, type Kit, type ShowView } from './common';

/**
 * Le grand feu d'artifice de la fête foraine (repère du bâtiment) : un programme de tirs depuis le milieu du parc, au-dessus
 * des manèges. Chaque fusée monte en sifflant, laisse une traîne d'étincelles et éclate en l'air selon sa sorte : pivoine
 * (une boule), anneau (un cercle penché), saule (des traînes d'or qui retombent lentement), palmier (des branches de comètes),
 * cœur (tourné vers la caméra), scintillant (des étincelles qui clignotent), comète double. Les couleurs suivent l'âge (or et
 * rouge à l'âge industriel, toutes à l'époque moderne, néons au futur). Chaque éclat jette un éclair et laisse un peu de
 * fumée. Vient le bouquet final, une vingtaine de tirs en quelques secondes, puis la fumée se dissipe. Les étincelles sont
 * des points lumineux qu'on ajoute (`AdditiveBlending`) : elles brillent la nuit et restent visibles le jour
 */

type Shell = 'peony' | 'ring' | 'willow' | 'palm' | 'heart' | 'strobe' | 'comet';
interface Shot { at: number; kind: Shell; c: number; c2: number; x: number; z: number; h: number; big: number }
interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: THREE.Color; drag: number; grav: number; trail: number; acc: number; blink: boolean; rocket: Shot | null }
interface Puff { s: THREE.Sprite; t: number; life: number; big: number }

/** les couleurs des éclats, selon l'âge (3 : industriel, 4 : moderne, 5 : futuriste) */
const COLORS: Record<number, number[]> = {
  3: [0xffc04a, 0xff4a3a, 0xfff2d8, 0x4a8aff, 0xffd870],
  4: [0xff4a6a, 0x4aa8ff, 0x6aff8a, 0xffd04a, 0xd06aff, 0xff8a3a, 0xfff2e8, 0x4affe0],
  5: [0x40e8ff, 0xff4ad8, 0x8a6aff, 0x4affb0, 0xfff04a, 0xffffff],
};
const GOLD = 0xffc860;
const CAP = 5000;
/** l'éclat des étincelles */
const GLOW = 1.7;
/** l'attente des spectateurs, le programme, le bouquet final, la fumée qui se dissipe (secondes de jeu) */
const WAIT = 6, SHOW = 30, FINALE = 5, AFTER = 5;

export interface FireworksEvents { whistle?: () => void; bang?: (k: number) => void; roar?: (k: number) => void }

export class FireworksView implements ShowView {
  group = new THREE.Group();
  done = false;
  phase: 'wait' | 'show' | 'finale' | 'after' = 'wait';
  /** où est l'œil (la caméra), dans le repère du bâtiment : le cœur se tourne vers lui */
  eye = new THREE.Vector3(0, 10, 10);
  private shots: Shot[] = [];
  private sparks: Spark[] = [];
  private puffs: Puff[] = [];
  private points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private t = 0;
  private next = 0;
  private rnd: () => number;
  private colors: number[];

  constructor(private kit: Kit, private ev: FireworksEvents = {}) {
    let s = (kit.seed >>> 0) || 7;
    this.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    this.colors = COLORS[Math.min(5, Math.max(3, kit.age))];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(CAP * 3); this.col = new Float32Array(CAP * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.2, map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.plan();
  }

  /** Le programme : des tirs de plus en plus serrés, chaque sorte à son tour, puis le bouquet final */
  private plan() {
    const R = this.rnd, kinds: Shell[] = ['peony', 'ring', 'willow', 'palm', 'strobe', 'comet', 'peony', 'heart'];
    const pick = () => this.colors[Math.floor(R() * this.colors.length)];
    let t = WAIT;
    for (let i = 0; t < WAIT + SHOW; i++) {
      const kind = i === 6 || i === 15 ? 'heart' : kinds[Math.floor(R() * kinds.length)];
      // parfois deux ou trois ensemble, en éventail
      const n = R() < 0.3 ? 3 : R() < 0.5 ? 2 : 1;
      for (let k = 0; k < n; k++) this.shots.push({ at: t + k * 0.25, kind: n > 1 && k ? this.shots[this.shots.length - 1].kind : kind, c: pick(), c2: pick(), x: (k - (n - 1) / 2) * 0.6 + (R() - 0.5) * 0.4, z: (R() - 0.5) * 0.6, h: 1.8 + R() * 1, big: 1 });
      t += Math.max(0.9, 2.4 - i * 0.06) + R() * 0.6;
    }
    // le bouquet final : une salve serrée, de plus en plus haute, et trois grands saules d'or pour finir
    for (let i = 0; i < 20; i++) this.shots.push({ at: WAIT + SHOW + (i / 20) * (FINALE - 1), kind: (['peony', 'ring', 'strobe', 'palm'] as Shell[])[i % 4], c: pick(), c2: pick(), x: (R() - 0.5) * 1.8, z: (R() - 0.5) * 1.2, h: 2 + R() * 1, big: 1.1 });
    for (let i = 0; i < 3; i++) this.shots.push({ at: WAIT + SHOW + FINALE - 0.8 + i * 0.15, kind: 'willow', c: GOLD, c2: GOLD, x: (i - 1) * 1.1, z: 0, h: 2.8, big: 1.25 });
    this.shots.sort((a, b) => a.at - b.at);
  }

  update(dt: number) {
    if (this.done) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const T = this.t;
    if (this.phase === 'wait' && T >= WAIT) this.phase = 'show';
    if (this.phase === 'show' && T >= WAIT + SHOW) { this.phase = 'finale'; this.ev.roar?.(0.6); }
    if (this.phase === 'finale' && T >= WAIT + SHOW + FINALE + 1.5) { this.phase = 'after'; this.ev.roar?.(1); }
    if (this.phase === 'after' && T >= WAIT + SHOW + FINALE + 1.5 + AFTER) this.done = true;
    // les départs
    while (this.next < this.shots.length && this.shots[this.next].at <= T) this.launch(this.shots[this.next++]);
    this.step(dt);
    this.stepPuffs(dt);
  }

  /** Une fusée part du milieu du parc, au-dessus des manèges */
  private launch(s: Shot) {
    // (il éclate à la hauteur `h`, en cases au-dessus du parc, au bout de `tUp` secondes)
    const tUp = 1 + s.h * 0.12, up = (s.h - 0.6) / tUp;
    this.sparks.push({ x: s.x * 0.2, y: 0.6, z: s.z * 0.2, vx: (s.x - s.x * 0.2) / tUp, vy: up, vz: (s.z - s.z * 0.2) / tUp, life: tUp, max: tUp, c: new THREE.Color(0xfff0c8), drag: 0, grav: 0, trail: 60, acc: 0, blink: false, rocket: s });
    if (this.rnd() < 0.6 || s.big > 1) this.ev.whistle?.();
  }

  /** L'éclat : les étincelles selon la sorte, l'éclair, la fumée, le bruit */
  private burst(s: Shot, x: number, y: number, z: number) {
    // (k : la taille de l'éclat ; ×0,75 : vus de la vue du parc, de plus grands débordaient de l'écran)
    const R = this.rnd, c = new THREE.Color(s.c), c2 = new THREE.Color(s.c2), k = s.big * 0.75;
    const add = (vx: number, vy: number, vz: number, col: THREE.Color, life: number, o: Partial<Spark> = {}) => {
      if (this.sparks.length >= CAP) return;
      this.sparks.push({ x, y, z, vx, vy, vz, life, max: life, c: col, drag: 1.2, grav: 0.9, trail: 0, acc: 0, blink: false, rocket: null, ...o });
    };
    const sphere = (n: number, v: number, col: (i: number) => THREE.Color, life: number, o: Partial<Spark> = {}) => {
      for (let i = 0; i < n; i++) {
        // des directions réparties sur la sphère (spirale de Fibonacci), un peu bousculées
        const yy = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - yy * yy), a = i * 2.39996 + R() * 0.2, vv = v * (0.9 + R() * 0.2);
        add(Math.cos(a) * r * vv, yy * vv, Math.sin(a) * r * vv, col(i), life * (0.85 + R() * 0.3), o);
      }
    };
    if (s.kind === 'peony') sphere(Math.round(110 * s.big), 1.7 * k, (i) => (i % 5 ? c : c2), 1.6);
    else if (s.kind === 'strobe') sphere(Math.round(90 * s.big), 1.5 * k, () => new THREE.Color(0xffffff), 2, { blink: true });
    else if (s.kind === 'willow') sphere(Math.round(80 * s.big), 1.3 * k, () => new THREE.Color(GOLD), 3.4, { drag: 2.2, grav: 0.55, trail: 14 });
    else if (s.kind === 'ring') {
      // un cercle dans un plan penché au hasard, et un cœur de l'autre couleur
      const ax = new THREE.Vector3(R() - 0.5, 1, R() - 0.5).normalize(), u = new THREE.Vector3(1, 0, 0).cross(ax).normalize(), w = ax.clone().cross(u);
      for (let i = 0; i < 70 * s.big; i++) { const a = (i / (70 * s.big)) * Math.PI * 2, v = 1.8 * k; add((u.x * Math.cos(a) + w.x * Math.sin(a)) * v, (u.y * Math.cos(a) + w.y * Math.sin(a)) * v, (u.z * Math.cos(a) + w.z * Math.sin(a)) * v, c, 1.5); }
      sphere(24, 0.5, () => c2, 1.2);
    } else if (s.kind === 'palm') {
      // des branches de comètes qui retombent en palmes
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + R() * 0.3, e = 0.35 + R() * 0.3, v = 2 * k;
        add(Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + 0.4, Math.sin(a) * Math.cos(e) * v, c, 2.2, { trail: 40, drag: 1.4, grav: 1.1 });
      }
      sphere(30, 0.6, () => new THREE.Color(GOLD), 1);
    } else if (s.kind === 'comet') {
      for (let i = 0; i < 2; i++) { const a = R() * Math.PI * 2; add(Math.cos(a) * 1.2, 1.4, Math.sin(a) * 1.2, i ? c2 : c, 2.4, { trail: 50, drag: 0.7, grav: 1.2 }); }
      sphere(40, 1.1, () => c, 1.2);
    } else {
      // le cœur, dans le plan qui fait face à la caméra
      const toEye = this.eye.clone().sub(new THREE.Vector3(x, y, z)).setY(0).normalize(), side = new THREE.Vector3(-toEye.z, 0, toEye.x);
      const pink = new THREE.Color(this.kit.age >= 5 ? 0xff4ad8 : 0xff4a6a);
      for (let i = 0; i < 80; i++) {
        const a = (i / 80) * Math.PI * 2, hx = 16 * Math.sin(a) ** 3, hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
        const v = 0.11 * k;
        add(side.x * hx * v, hy * v, side.z * hx * v, pink, 1.8, { drag: 1.6, grav: 0.25 });
      }
    }
    // l'éclair (une grosse lueur brève) et la fumée qui reste
    this.puff(x, y, z, true, s.c);
    for (let i = 0; i < 2; i++) this.puff(x + (R() - 0.5) * 0.6, y + (R() - 0.5) * 0.4, z + (R() - 0.5) * 0.6, false, 0x9a9aa4);
    this.ev.bang?.(Math.min(1, 0.5 * k + 0.2));
    if (R() < 0.35) this.ev.roar?.(0.3);
  }

  private puff(x: number, y: number, z: number, flash: boolean, color: number) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color, transparent: true, depthWrite: false, opacity: 0, blending: flash ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.position.set(x, y, z);
    this.group.add(s);
    this.puffs.push({ s, t: 0, life: flash ? 0.35 : 5 + this.rnd() * 3, big: flash ? 2.6 : 0.9 + this.rnd() * 0.6 });
  }

  private step(dt: number) {
    const out: Spark[] = [], pos = this.pos, col = this.col;
    let n = 0;
    for (const p of this.sparks) {
      p.life -= dt;
      if (p.rocket && p.life <= 0) { this.burst(p.rocket, p.x, p.y, p.z); continue; }
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      // les traînes : des braises laissées derrière
      if (p.trail) {
        p.acc += p.trail * dt;
        while (p.acc >= 1 && this.sparks.length + out.length < CAP) {
          p.acc -= 1;
          out.push({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, life: 0.5, max: 0.5, c: p.rocket ? p.c : p.c.clone().multiplyScalar(0.7), drag: 3, grav: 0.4, trail: 0, acc: 0, blink: false, rocket: null });
        }
      }
      out.push(p);
    }
    this.sparks = out;
    for (const p of this.sparks) {
      if (n >= CAP) break;
      // (plus fort que 1 : les points s'ajoutent à l'image et doivent percer le jour comme la nuit)
      const f = (p.rocket ? 1 : Math.min(1, (p.life / p.max) * 1.6)) * GLOW;
      const on = p.blink ? (Math.sin(p.life * 40 + p.x * 9) > 0.2 ? 1 : 0.08) : 1;
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      col[n * 3] = p.c.r * f * on; col[n * 3 + 1] = p.c.g * f * on; col[n * 3 + 2] = p.c.b * f * on;
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private stepPuffs(dt: number) {
    this.puffs = this.puffs.filter((f) => {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.group.remove(f.s); f.s.material.dispose(); return false; }
      const flash = f.life < 1;
      f.s.scale.setScalar(f.big * (flash ? 0.6 + k : 0.5 + k * 1.2));
      f.s.material.opacity = flash ? 0.9 * (1 - k) : 0.22 * Math.min(1, f.t * 2) * (1 - k);
      if (!flash) { f.s.position.y -= dt * 0.05; f.s.position.x += dt * 0.08; }
      return true;
    });
  }

  /** Le tableau : le feu, puis le bouquet final */
  board() {
    if (this.phase === 'wait') return `🎆 <b>${tr('La foule se rassemble…')}</b>`;
    if (this.phase === 'finale') return `🎆 <b>${tr('Le bouquet final !')}</b>`;
    if (this.phase === 'after') return `🎆 <b>${tr('Bravo !')}</b>`;
    // (pendant le feu, rien : le tableau cacherait les éclats)
    return '';
  }

  /** combien de fusées au programme (bouquet compris) */
  get count() { return this.shots.length; }

  dispose() {
    for (const f of this.puffs) f.s.material.dispose();
    this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose();
  }
}
