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
    if (on !== this.shown) { this.shown = on; this.el.classList.toggle('show', on); }
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
