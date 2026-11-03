import type { ActiveExpedition } from '../sim/expeditions';
import { L_GONE } from '../render/expeditionScenes';

/**
 * Les grands moments de la conquête de l'espace, en images. Pendant l'expédition « Un homme sur la Lune », une fois la fusée
 * sortie du ciel, la retransmission « En direct de la Lune » : le module descend, flamme sous la tuyère, se pose dans un
 * nuage de poussière ; l'astronaute descend l'échelle, fait ses premiers bonds, plante le drapeau du village et salue, la
 * Terre au-dessus de l'horizon. Quand le vaisseau colonial atteint sa planète, l'écran de fin de partie
 */

/** Part du travail sur place où l'on suit l'alunissage (après la sortie du ciel de la fusée) */
const CAST_FROM = L_GONE + 0.02, CAST_TO = 0.985;
const W = 360, H = 216;

/** Un nombre de 0 à 1, toujours le même pour (i, k) : les étoiles, les cratères */
const rnd = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (t: number) => Math.min(1, Math.max(0, t));

export class SpaceCast {
  private el: HTMLElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private cap: HTMLElement;
  private shown = false;
  private t0 = performance.now();

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'spacecast panel';
    this.el.innerHTML = '<div class="sc-head"><i class="rec"></i>En direct de la Lune</div><canvas></canvas><div class="sc-cap"></div>';
    this.cv = this.el.querySelector('canvas')!;
    this.cv.width = W * 2; this.cv.height = H * 2;
    this.ctx = this.cv.getContext('2d');
    this.cap = this.el.querySelector('.sc-cap')!;
    root.appendChild(this.el);
  }

  /** À chaque image : la retransmission s'ouvre pendant l'alunissage, se ferme après */
  update(active: ActiveExpedition[]) {
    const a = active.find((e) => e.m.id === 'moon' && e.phase === 'work');
    const k = a ? Math.min(1, a.t / Math.max(1, a.c.work + a.extra)) : 0, on = !!a && k >= CAST_FROM && k < CAST_TO;
    if (on !== this.shown) { this.shown = on; this.el.classList.toggle('show', on); this.el.setAttribute('aria-hidden', String(!on)); }
    if (on) this.draw((k - CAST_FROM) / (CAST_TO - CAST_FROM), a!.c.label.includes('cratères'));
  }

  /** L'image de la retransmission à l'instant u (0 … 1) */
  private draw(u: number, craters: boolean) {
    const c = this.ctx;
    if (!c) return;
    const time = (performance.now() - this.t0) / 1000;
    c.setTransform(2, 0, 0, 2, 0, 0);
    // le ciel noir, ses étoiles, la Terre
    c.fillStyle = '#05070d'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${0.35 + rnd(i, 3) * 0.6})`; c.fillRect(rnd(i, 1) * W, rnd(i, 2) * H * 0.65, 1.2, 1.2); }
    const ex = W * 0.8, ey = H * 0.2, er = 20;
    c.fillStyle = '#2f6fd8'; c.beginPath(); c.arc(ex, ey, er, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5fb86a';
    for (const [dx, dy, r] of [[-6, -4, 7], [7, 5, 6], [2, -11, 4]]) { c.beginPath(); c.arc(ex + dx, ey + dy, r, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(ex - 14, ey + 2, 12, 2.5); c.fillRect(ex - 2, ey - 9, 14, 2.2);
    c.fillStyle = 'rgba(5,7,13,0.55)'; c.beginPath(); c.arc(ex + 8, ey + 3, er, 0, Math.PI * 2); c.fill();
    // le sol lunaire : facettes grises, cratères (plus nombreux au bord des grands cratères), rochers
    const gy = H * 0.72;
    c.fillStyle = '#8d9096'; c.beginPath(); c.moveTo(0, gy + 6);
    for (let x = 0; x <= W; x += 30) c.lineTo(x, gy + (rnd(x, 7) - 0.5) * (craters ? 14 : 6));
    c.lineTo(W, H); c.lineTo(0, H); c.fill();
    c.fillStyle = '#a7aab0'; c.beginPath(); c.moveTo(0, gy + 18);
    for (let x = 0; x <= W; x += 45) c.lineTo(x, gy + 14 + (rnd(x, 9) - 0.5) * 8);
    c.lineTo(W, H); c.lineTo(0, H); c.fill();
    for (let i = 0; i < (craters ? 9 : 5); i++) {
      const x = rnd(i, 11) * W, y = gy + 16 + rnd(i, 12) * (H - gy - 22), r = 6 + rnd(i, 13) * (craters ? 22 : 12);
      c.fillStyle = '#7e8187'; c.beginPath(); c.ellipse(x, y, r, r * 0.32, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#b4b7bc'; c.beginPath(); c.ellipse(x, y - r * 0.08, r * 0.8, r * 0.2, 0, 0, Math.PI); c.fill();
    }
    // le module : il descend (u < 0.4), se pose dans la poussière
    const land = 0.4, lx = W * 0.4, ly = gy + 10, du = clamp(u / land), alt = (1 - smooth(du)) * 140;
    const my = ly - alt, sway = alt > 1 ? Math.sin(time * 1.3) * 2 : 0;
    if (alt > 0.5) {
      const fl = 8 + Math.sin(time * 40) * 2 + alt * 0.04;
      c.fillStyle = '#ffb04a'; c.beginPath(); c.moveTo(lx - 5 + sway, my - 10); c.lineTo(lx + 5 + sway, my - 10); c.lineTo(lx + sway, my - 10 + fl * 2); c.fill();
      c.fillStyle = '#fff2c0'; c.beginPath(); c.moveTo(lx - 2.5 + sway, my - 10); c.lineTo(lx + 2.5 + sway, my - 10); c.lineTo(lx + sway, my - 10 + fl); c.fill();
    }
    this.lander(c, lx + sway, my);
    // la poussière soulevée au contact, qui retombe
    const dust = clamp((u - land + 0.06) / 0.2);
    if (dust > 0 && dust < 1) for (let i = 0; i < 10; i++) {
      const s = (rnd(i, 21) - 0.5) * 2, r = 4 + dust * 16 * rnd(i, 22);
      c.fillStyle = `rgba(200,202,206,${0.7 * (1 - dust)})`; c.beginPath(); c.arc(lx + s * dust * 60, ly - 2 - rnd(i, 23) * 8 * (1 - dust), r, 0, Math.PI * 2); c.fill();
    }
    // l'astronaute : il descend l'échelle, bondit jusqu'à sa place, plante le drapeau et salue
    const down = clamp((u - 0.55) / 0.08), walk = clamp((u - 0.64) / 0.16), plant = clamp((u - 0.8) / 0.06);
    const fx = W * 0.66;
    if (u > 0.55) {
      const ax = down < 1 ? lx + 16 : lx + 16 + (fx - 12 - lx - 16) * smooth(walk), hop = down < 1 ? 0 : Math.abs(Math.sin(walk * Math.PI * 5)) * 7 * (walk < 1 ? 1 : 0);
      const ay = down < 1 ? my - 22 + down * 22 : ly - hop;
      // les traces de pas
      c.fillStyle = '#6f7278';
      for (let x = lx + 22; x < ax - 4; x += 9) c.fillRect(x, ly + 1 + ((x / 9) % 2 ? 1 : 0), 3, 1.2);
      if (plant > 0) {
        // le drapeau du village qui se dresse et se déploie
        const ph = 34 * smooth(plant), fw = 20 * smooth(clamp((plant - 0.4) / 0.6));
        c.fillStyle = '#dcdcdc'; c.fillRect(fx, ly - ph, 1.6, ph);
        if (fw > 0) {
          const wave = Math.sin(time * 2) * 1.2;
          c.fillStyle = '#3a6ab8'; c.fillRect(fx + 1.6, ly - ph, fw / 3, 13);
          c.fillStyle = '#f4f6f8'; c.fillRect(fx + 1.6 + fw / 3, ly - ph + wave * 0.3, fw / 3, 13);
          c.fillStyle = '#d8443a'; c.fillRect(fx + 1.6 + (2 * fw) / 3, ly - ph + wave * 0.6, fw / 3, 13);
        }
      }
      this.astronaut(c, ax, ay, plant >= 1 ? Math.sin(time * 4) : 0, walk > 0 && walk < 1 ? time : 0);
    }
    // la mire de la retransmission
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = (time * 30) % 4; y < H; y += 4) c.fillRect(0, y, W, 1);
    this.cap.textContent = u < land - 0.08 ? `Descente vers ${craters ? 'les grands cratères' : 'la mer de la Tranquillité'}… altitude ${Math.max(0, Math.round(alt * 1.1))} m`
      : u < 0.55 ? 'Contact ! Le module s’est posé.'
      : u < 0.66 ? 'L’écoutille s’ouvre, l’astronaute descend l’échelle…'
      : u < 0.82 ? '« Un petit pas pour un habitant… »'
      : '« … un grand bond pour le village ! »';
  }

  /** Le module lunaire, ses pieds posés en (x, y) : étage de descente doré, étage de remontée, hublot, antenne, échelle */
  private lander(c: CanvasRenderingContext2D, x: number, y: number) {
    c.strokeStyle = '#c8ccd2'; c.lineWidth = 1.6;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 9, y - 12); c.lineTo(x + s * 17, y); c.stroke(); c.fillStyle = '#c8ccd2'; c.fillRect(x + s * 17 - 3, y - 1, 6, 1.6); }
    c.fillStyle = '#e0b040'; c.beginPath(); c.moveTo(x - 11, y - 10); c.lineTo(x + 11, y - 10); c.lineTo(x + 13, y - 20); c.lineTo(x - 13, y - 20); c.fill();
    c.fillStyle = '#b8892a'; c.fillRect(x - 13, y - 15, 26, 1.4);
    c.fillStyle = '#d8dce2'; c.beginPath(); c.moveTo(x - 9, y - 20); c.lineTo(x + 9, y - 20); c.lineTo(x + 7, y - 31); c.lineTo(x - 7, y - 31); c.fill();
    c.fillStyle = '#2a3442'; c.beginPath(); c.moveTo(x - 6, y - 23); c.lineTo(x - 1, y - 23); c.lineTo(x - 2, y - 28); c.lineTo(x - 5, y - 28); c.fill();
    c.strokeStyle = '#9aa0a8'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 4, y - 31); c.lineTo(x + 6, y - 37); c.stroke();
    c.fillStyle = '#9aa0a8'; c.beginPath(); c.arc(x + 6, y - 37, 2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8a8f96'; for (let k = 0; k < 4; k++) c.fillRect(x + 12, y - 3 - k * 4, 4, 1);
  }

  /** L'astronaute en scaphandre blanc, les pieds en (x, y) ; `wave` lève le bras, `step` le fait marcher */
  private astronaut(c: CanvasRenderingContext2D, x: number, y: number, wave: number, step: number) {
    const sw = step ? Math.sin(step * 9) * 2 : 0;
    c.fillStyle = '#f4f6f8';
    c.fillRect(x - 3 + sw, y - 7, 2.5, 7); c.fillRect(x + 0.5 - sw, y - 7, 2.5, 7);
    c.fillRect(x - 4, y - 16, 8, 10);
    c.fillStyle = '#d8dce2'; c.fillRect(x - 6.5, y - 16, 3, 8);
    c.fillStyle = '#f4f6f8'; c.beginPath(); c.arc(x, y - 19.5, 4.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e8b84a'; c.beginPath(); c.arc(x + 1.2, y - 19.5, 2.6, -1.2, 1.2); c.fill();
    c.fillStyle = '#f4f6f8';
    if (wave) { c.save(); c.translate(x + 4, y - 15); c.rotate(-2.4 + wave * 0.3); c.fillRect(-1, 0, 2.4, 8); c.restore(); }
    else c.fillRect(x + 4, y - 15, 2.2, 7);
    c.fillStyle = '#3a6ab8'; c.fillRect(x - 3, y - 14, 2.4, 1.6);
  }
}

/** Ce que l'on dit du village sur l'écran de fin */
export interface VictoryStats { name: string; pop: number; buildings: number; missions: number; days: number }

/**
 * L'écran de fin de partie : la planète bleue et le vaisseau colonial arrivé, le premier feu de camp des colons, et ce qu'a
 * accompli le village depuis ses huttes ; on peut continuer à bâtir
 */
export function showVictory(root: HTMLElement, s: VictoryStats, onClose?: () => void) {
  const ov = document.createElement('div');
  ov.className = 'overlay victory';
  ov.innerHTML = `<div class="modal panel victoryCard">
    <canvas width="1040" height="400"></canvas>
    <h2>Fin de partie : une nouvelle planète</h2>
    <p class="story">De la première hutte au vaisseau colonial, ${s.name} a traversé tous les âges. Les colons se sont posés sur la planète bleue de l’étoile voisine et y ont allumé leur premier feu de camp : l’histoire recommence, là-bas, parmi les étoiles.</p>
    <div class="vstats">
      <span><b>${Math.floor(s.pop)}</b>habitants</span><span><b>${s.buildings}</b>bâtiments</span>
      <span><b>${s.missions}</b>expéditions réussies</span><span><b>${s.days}</b>jours</span>
    </div>
    <div class="row"><span class="grow"></span><button class="active ok">Continuer à bâtir</button></div>
  </div>`;
  root.appendChild(ov);
  const cv = ov.querySelector('canvas')!, c = cv.getContext('2d'), t0 = performance.now();
  let raf = 0;
  const frame = () => {
    if (!ov.isConnected) return;
    if (c) drawPlanet(c, (performance.now() - t0) / 1000);
    raf = requestAnimationFrame(frame);
  };
  frame();
  const close = () => { cancelAnimationFrame(raf); ov.remove(); onClose?.(); };
  (ov.querySelector('.ok') as HTMLButtonElement).onclick = close;
}

/** La planète des colons, son anneau, ses deux lunes, le vaisseau en orbite, les dômes et le feu de camp sur l'horizon */
function drawPlanet(c: CanvasRenderingContext2D, t: number) {
  const w = 520, h = 200;
  c.setTransform(2, 0, 0, 2, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a0f24'); g.addColorStop(1, '#1e2a5a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 110; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t * (0.5 + rnd(i, 4)) + i))})`; c.fillRect(rnd(i, 1) * w, rnd(i, 2) * h, 1.3, 1.3); }
  // l'étoile voisine, la planète, son anneau
  c.fillStyle = 'rgba(255,210,120,0.25)'; c.beginPath(); c.arc(70, 46, 26, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(70, 46, 13, 0, Math.PI * 2); c.fill();
  const px = 330, py = 250, pr = 150;
  c.fillStyle = '#3a8ad8'; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#5fc47a';
  for (const [dx, dy, r] of [[-60, -110, 34], [40, -128, 26], [100, -90, 30], [-120, -70, 22]]) { c.beginPath(); c.ellipse(px + dx, py + dy, r, r * 0.55, 0.2, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.6)';
  for (const [dx, dy, l] of [[-90, -128, 60], [10, -140, 44], [70, -112, 52]]) c.fillRect(px + dx + Math.sin(t * 0.2) * 6, py + dy, l, 3);
  c.strokeStyle = 'rgba(255,230,190,0.55)'; c.lineWidth = 4; c.beginPath(); c.ellipse(px, py - 96, 230, 26, -0.08, Math.PI * 1.02, Math.PI * 1.98); c.stroke();
  for (const [a, r, s, col] of [[t * 0.15, 200, 7, '#d8d4cc'], [t * 0.1 + 2, 236, 5, '#c8b8a8']] as [number, number, number, string][]) { c.fillStyle = col; c.beginPath(); c.arc(px + Math.cos(a) * r, py - 120 + Math.sin(a) * r * 0.25, s, 0, Math.PI * 2); c.fill(); }
  // le vaisseau colonial en orbite, ses hublots
  const sx = 150 + Math.sin(t * 0.4) * 10, sy = 92 + Math.cos(t * 0.5) * 4;
  c.fillStyle = '#f4f6f8'; c.fillRect(sx - 22, sy - 4, 44, 8);
  c.beginPath(); c.moveTo(sx + 22, sy - 4); c.lineTo(sx + 32, sy); c.lineTo(sx + 22, sy + 4); c.fill();
  c.strokeStyle = '#f4f6f8'; c.lineWidth = 3; c.beginPath(); c.ellipse(sx - 4, sy, 6, 14, 0, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#5af0ff'; c.fillRect(sx - 30, sy - 2, 8, 4);
  c.fillStyle = '#fff1c9'; for (let k = 0; k < 4; k++) c.fillRect(sx - 14 + k * 8, sy - 1, 3, 2);
  // les dômes de la colonie et le premier feu de camp, sur l'horizon de la planète
  for (const [dx, r] of [[-20, 9], [-4, 6], [14, 8]]) { c.fillStyle = 'rgba(230,240,248,0.9)'; c.beginPath(); c.arc(px + dx, py - pr + 1, r, Math.PI, 0); c.fill(); }
  const f = 1 + Math.sin(t * 9) * 0.2;
  c.fillStyle = '#ffb04a'; c.beginPath(); c.moveTo(px + 30, py - pr + 1); c.lineTo(px + 36, py - pr + 1); c.lineTo(px + 33, py - pr - 8 * f); c.fill();
}

/** Durée du grand voyage jusqu'à la planète des colons, en secondes réelles (quelle que soit la vitesse du jeu) */
export const VOYAGE_S = 24;

/**
 * Le grand voyage, plein écran : le vaisseau colonial quitte la planète du village, file entre les étoiles (le moteur
 * expérimental plie l'espace d'un éclair), voit grossir la planète bleue de l'étoile voisine et s'y pose dans un nuage de
 * poussière ; les colons descendent la rampe et allument leur premier feu de camp. « Passer » mène tout de suite à la suite
 */
export function showVoyage(root: HTMLElement, jump: boolean, onDone: () => void) {
  const ov = document.createElement('div');
  ov.className = 'overlay voyage';
  ov.innerHTML = '<canvas width="960" height="540"></canvas><p class="cap"></p><button class="skip">Passer ›</button>';
  root.appendChild(ov);
  const cv = ov.querySelector('canvas')!, c = cv.getContext('2d'), cap = ov.querySelector('.cap')!, t0 = performance.now();
  let raf = 0, ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    ov.classList.add('out');
    setTimeout(() => { ov.remove(); onDone(); }, 600);
  };
  const frame = () => {
    if (!ov.isConnected || ended) return;
    const t = (performance.now() - t0) / 1000;
    if (c) cap.textContent = drawVoyage(c, Math.min(1, t / VOYAGE_S), t, jump);
    if (t >= VOYAGE_S) end(); else raf = requestAnimationFrame(frame);
  };
  frame();
  // onglet en arrière-plan (plus d'images) : le voyage se termine quand même
  setTimeout(end, VOYAGE_S * 1000 + 1500);
  (ov.querySelector('.skip') as HTMLButtonElement).onclick = end;
}

/** Une image du voyage à l'instant u (0 … 1), t en secondes ; renvoie la légende */
function drawVoyage(c: CanvasRenderingContext2D, u: number, t: number, jump: boolean): string {
  const w = 480, h = 270;
  c.setTransform(2, 0, 0, 2, 0, 0);
  if (u < 0.62) {
    // ---- dans l'espace : départ, traversée, approche ; les étoiles filent, d'autant plus vite pendant le saut
    c.fillStyle = '#03050d'; c.fillRect(0, 0, w, h);
    const warp = jump && u > 0.28 && u < 0.4, speed = u < 0.16 ? 0.3 : u < 0.42 ? (warp ? 6 : 1.4) : 0.4;
    for (let i = 0; i < 140; i++) {
      const depth = 0.3 + rnd(i, 5) * 0.7, x = (rnd(i, 1) * w * 3 - t * 40 * speed * depth) % w, y = rnd(i, 2) * h;
      const len = Math.max(1.2, speed * depth * (warp ? 26 : 5));
      c.fillStyle = `rgba(220,230,255,${0.35 + depth * 0.6})`; c.fillRect(x < 0 ? x + w : x, y, len, 1.2);
    }
    // une nébuleuse au loin
    const neb = c.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, 160);
    neb.addColorStop(0, 'rgba(140,90,220,0.18)'); neb.addColorStop(1, 'rgba(140,90,220,0)');
    c.fillStyle = neb; c.fillRect(0, 0, w, h);
    if (u < 0.16) {
      // la planète du village s'éloigne en bas à gauche
      const k = u / 0.16, pr = 150 - k * 60, px = 60 - k * 60, py = 300 + k * 40, f = pr / 150;
      c.fillStyle = '#2f6fd8'; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#5fb86a';
      for (const [dx, dy, r] of [[30, -110, 40], [90, -60, 30], [-20, -130, 26]]) { c.beginPath(); c.ellipse(px + dx * f, py + dy * f, r * f, r * 0.6 * f, 0.3, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(px + 10, py - pr * 0.8, 70 * f, 3);
      ship(c, 140 + k * 100, 190 - k * 70, 0.7 + k * 0.3, -0.5 + k * 0.5, 1);
      return 'Le vaisseau colonial quitte la planète du village…';
    }
    if (u < 0.42) {
      const k = (u - 0.16) / 0.26;
      ship(c, w / 2 - 20, h / 2 + Math.sin(t * 1.5) * 3, 1, 0, warp ? 2 : 1);
      // l'éclair du saut à travers l'espace
      if (jump && u > 0.27 && u < 0.31) { c.fillStyle = `rgba(255,255,255,${1 - Math.abs(u - 0.29) / 0.02})`; c.fillRect(0, 0, w, h); }
      return jump ? (k < 0.45 ? 'Allumage du moteur expérimental…' : 'L’espace se plie : l’étoile voisine est déjà là !')
        : (k < 0.5 ? 'Des années de voyage entre les étoiles…' : 'Dans les serres de l’arche, les graines du nouveau village attendent.');
    }
    // l'approche : l'étoile voisine, la planète bleue qui grossit
    const k = smooth((u - 0.42) / 0.2), pr = 14 + k * 190, px = w * 0.72, py = h * 0.5 + k * 120;
    c.fillStyle = 'rgba(255,210,120,0.25)'; c.beginPath(); c.arc(70, 50, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffd27a'; c.beginPath(); c.arc(70, 50, 14, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a8ad8'; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5fc47a';
    for (const [dx, dy, r] of [[-0.4, -0.5, 0.22], [0.2, -0.7, 0.16], [0.5, -0.3, 0.2]]) { c.beginPath(); c.ellipse(px + dx * pr, py + dy * pr, r * pr, r * 0.55 * pr, 0.2, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = 'rgba(255,230,190,0.5)'; c.lineWidth = 2 + k * 3; c.beginPath(); c.ellipse(px, py - pr * 0.1, pr * 1.5, pr * 0.18, -0.1, Math.PI * 1.04, Math.PI * 1.96); c.stroke();
    ship(c, w * 0.3 + k * 90, h * 0.45 + k * 20, 1 - k * 0.6, 0.15, 1);
    return 'La planète bleue de l’étoile voisine !';
  }
  // ---- sur la planète : le ciel, ses deux lunes et son anneau, la descente, les colons
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2a3a8a'); sky.addColorStop(0.6, '#6aa8d8'); sky.addColorStop(1, '#bfe3f0');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,240,210,0.6)'; c.lineWidth = 3; c.beginPath(); c.ellipse(w * 0.5, h * 0.62, w * 0.75, 70, -0.08, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
  c.fillStyle = '#e8e2f4'; c.beginPath(); c.arc(w * 0.18, 46, 14, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#d8c8b0'; c.beginPath(); c.arc(w * 0.82, 30, 8, 0, Math.PI * 2); c.fill();
  // collines au loin, plaine verte et ses herbes bleutées
  c.fillStyle = '#4f9a8a'; c.beginPath(); c.moveTo(0, h * 0.68);
  for (let x = 0; x <= w; x += 40) c.lineTo(x, h * 0.66 - rnd(x, 3) * 22);
  c.lineTo(w, h); c.lineTo(0, h); c.fill();
  const gy = h * 0.8;
  c.fillStyle = '#5fc47a'; c.fillRect(0, gy, w, h - gy);
  c.fillStyle = '#3fa2a0';
  for (let i = 0; i < 40; i++) { const x = rnd(i, 7) * w, y = gy + 4 + rnd(i, 8) * (h - gy - 6); c.fillRect(x, y - 4, 1.4, 4); c.fillRect(x + 2, y - 3, 1.4, 3); }
  // la descente, flamme sous les tuyères, le contact dans la poussière
  const land = smooth(Math.min(1, (u - 0.62) / 0.14)), lx = w * 0.42, ly = gy + 2, sy = ly - (1 - land) * 190;
  if (land < 1) {
    const fl = 10 + Math.sin(t * 40) * 3;
    c.fillStyle = '#ffb04a'; c.beginPath(); c.moveTo(lx - 10, sy); c.lineTo(lx + 10, sy); c.lineTo(lx, sy + fl * 2); c.fill();
    c.fillStyle = '#fff2c0'; c.beginPath(); c.moveTo(lx - 5, sy); c.lineTo(lx + 5, sy); c.lineTo(lx, sy + fl); c.fill();
  }
  lander(c, lx, sy);
  const dust = (u - 0.74) / 0.12;
  if (dust > 0 && dust < 1) for (let i = 0; i < 14; i++) {
    const s = (rnd(i, 21) - 0.5) * 2, r = 5 + dust * 18 * rnd(i, 22);
    c.fillStyle = `rgba(230,236,220,${0.75 * (1 - dust)})`; c.beginPath(); c.arc(lx + s * dust * 90, ly - 3 - rnd(i, 23) * 10 * (1 - dust), r, 0, Math.PI * 2); c.fill();
  }
  if (u < 0.8) return land < 1 ? 'Descente vers la plaine…' : 'Contact ! L’arche s’est posée.';
  // la rampe s'ouvre, cinq colons descendent et vont au feu, bras levés quand il prend
  const walk = Math.min(1, (u - 0.8) / 0.1), fx = w * 0.7;
  c.fillStyle = '#c8ccd2'; c.beginPath(); c.moveTo(lx + 12, ly - 6); c.lineTo(lx + 30, ly); c.lineTo(lx + 22, ly); c.lineTo(lx + 8, ly - 4); c.fill();
  // chacun prend sa place en arc de cercle autour du feu (les uns devant, les autres derrière)
  const spots = [[-34, 2], [-20, -6], [20, -6], [34, 2], [-48, 8]];
  for (let i = 0; i < 5; i++) {
    const k = Math.max(0, Math.min(1, walk * 1.6 - i * 0.15));
    if (k <= 0) continue;
    const e = smooth(k), x = lx + 28 + (fx + spots[i][0] - lx - 28) * e, y = ly + spots[i][1] * e - (k < 1 ? Math.abs(Math.sin(t * 9 + i)) * 3 : 0);
    const col = ['#f4f6f8', '#5af0ff', '#f4f6f8', '#ff7ab8', '#ffd04a'][i];
    c.save(); c.translate(x, y); c.scale(1.7, 1.7);
    c.fillStyle = col; c.fillRect(-2.5, -12, 5, 8); c.fillRect(-2, -4, 1.6, 4); c.fillRect(0.4, -4, 1.6, 4);
    c.fillStyle = '#f2c8a0'; c.beginPath(); c.arc(0, -14.5, 2.6, 0, Math.PI * 2); c.fill();
    // bras levés quand le feu a pris
    if (k >= 1 && u > 0.9) { c.fillStyle = col; c.fillRect(-4, -18 + Math.sin(t * 6 + i) * 1.5, 1.4, 6); c.fillRect(2.6, -18 + Math.cos(t * 6 + i) * 1.5, 1.4, 6); }
    c.restore();
  }
  if (u > 0.88) {
    const f = 1 + Math.sin(t * 11) * 0.2, k = Math.min(1, (u - 0.88) / 0.04);
    c.fillStyle = '#6a4a34'; c.fillRect(fx - 7, ly - 2, 14, 2.5);
    c.fillStyle = '#ffb04a'; c.beginPath(); c.moveTo(fx - 6, ly - 2); c.lineTo(fx + 6, ly - 2); c.lineTo(fx, ly - 2 - 16 * f * k); c.fill();
    c.fillStyle = '#fff2c0'; c.beginPath(); c.moveTo(fx - 3, ly - 2); c.lineTo(fx + 3, ly - 2); c.lineTo(fx, ly - 2 - 8 * f * k); c.fill();
    const glow = c.createRadialGradient(fx, ly - 6, 0, fx, ly - 6, 40);
    glow.addColorStop(0, `rgba(255,190,90,${0.35 * k})`); glow.addColorStop(1, 'rgba(255,190,90,0)');
    c.fillStyle = glow; c.fillRect(fx - 40, ly - 46, 80, 80);
  }
  // le noir final
  if (u > 0.95) { c.fillStyle = `rgba(3,5,13,${(u - 0.95) / 0.05})`; c.fillRect(0, 0, w, h); }
  return u < 0.88 ? 'La rampe s’ouvre : les colons foulent leur nouvelle planète.' : 'Ils allument leur premier feu de camp : un nouveau village est né.';
}

/** L'arche des colons vue de profil en (x, y), à l'échelle s et penchée de a ; `boost` : la flamme des moteurs (2 : le saut) */
function ship(c: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, boost: number) {
  c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
  const fl = (14 + Math.sin(performance.now() / 40) * 3) * boost;
  c.fillStyle = boost > 1 ? '#bff8ff' : '#5af0ff'; c.beginPath(); c.moveTo(-34, -5); c.lineTo(-34 - fl, 0); c.lineTo(-34, 5); c.fill();
  c.fillStyle = '#f4f6f8'; c.beginPath(); c.ellipse(0, 0, 34, 10, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(30, -6); c.lineTo(46, 0); c.lineTo(30, 6); c.fill();
  c.strokeStyle = '#d8dce2'; c.lineWidth = 4; c.beginPath(); c.ellipse(-6, 0, 8, 18, 0, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#7ad8a0'; c.beginPath(); c.ellipse(10, -6, 12, 5, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#fff1c9'; for (let k = 0; k < 5; k++) c.fillRect(-18 + k * 8, -1, 3, 2);
  c.restore();
}

/** L'arche posée (ou qui se pose), ses pieds en (x, y) */
function lander(c: CanvasRenderingContext2D, x: number, y: number) {
  c.strokeStyle = '#c8ccd2'; c.lineWidth = 2;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 14, y - 14); c.lineTo(x + s * 24, y); c.stroke(); }
  c.fillStyle = '#f4f6f8'; c.beginPath(); c.ellipse(x, y - 22, 22, 14, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.moveTo(x - 10, y - 34); c.lineTo(x, y - 52); c.lineTo(x + 10, y - 34); c.fill();
  c.fillStyle = '#7ad8a0'; c.beginPath(); c.ellipse(x, y - 30, 10, 6, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#5af0ff'; c.fillRect(x - 18, y - 22, 36, 2);
  c.fillStyle = '#fff1c9'; for (let k = 0; k < 4; k++) c.fillRect(x - 12 + k * 7, y - 18, 3, 2.5);
}
