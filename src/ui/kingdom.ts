import type { KingdomReward } from '../sim/kingdom';
import { FORGE_CRAFT, FORGE_RISK } from '../sim/kingdom';
import { GEAR_BY } from '../sim/gear';
import { ic } from './icons';

/**
 * L'interface du royaume des Enfers : la barre de vie du roi (ou de sa citadelle) en haut de l'écran pendant le combat, et
 * l'écran de victoire quand le royaume tombe (facultatif : rien de tout cela n'est requis pour passer d'âge)
 */

export const KINGDOM_TEXT = {
  king: 'Le roi des Enfers',
  citadel: 'La citadelle du royaume',
  rage: 'Enragé !',
  wake: 'Réveillé',
  fallen: 'Le roi est tombé : abattez sa citadelle',
  focus: 'Centrer la vue sur le roi',
  banner: 'Le royaume des Enfers',
  bannerSub: 'La citadelle du roi se dresse derrière ses douves de lave. Approchez avec toute votre armée (facultatif).',
  title: 'Le royaume des Enfers est tombé',
  story: 'La citadelle s’est effondrée dans la lave, le roi des Enfers n’est plus. Sur l’île, le portail s’est éteint dans un éclat de lumière dorée : plus aucun démon ne viendra menacer vos rivages. Le village fête ses héros !',
  rewards: 'Récompenses',
  trophy: 'La couronne du roi : un trophée sur la grande place',
  forge: (craft: number, risk: number) => `La forge infernale : l’équipement se fabrique ${Math.round((craft - 1) * 100)} % plus vite, les expéditions sont ${Math.round((1 - risk) * 100)} % plus sûres`,
  ore: (n: number) => `${n} minerai`,
  joy: (n: number) => `+${n} bien-être, pour toujours`,
  isle: 'L’île du portail est purifiée : fini les incursions',
  cont: 'Continuer',
  home: 'Retour au village',
};

/** La barre de vie du boss, en haut au milieu ; un clic sur la couronne centre la vue sur lui */
export class BossBar {
  el: HTMLElement;
  private key = '';
  onFocus: (() => void) | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'bossBar';
    this.el.className = 'panel';
    this.el.hidden = true;
    root.appendChild(this.el);
    this.el.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.bfocus')) this.onFocus?.(); });
  }

  /** `s` null : cachée ; sinon le nom, la part de vie, l'état (rage) */
  set(s: { name: string; frac: number; note: string; rage: boolean } | null) {
    if (!s) { this.el.hidden = true; this.key = ''; return; }
    this.el.hidden = false;
    const pct = Math.max(0, Math.min(100, Math.round(s.frac * 1000) / 10));
    const key = `${s.name}|${pct}|${s.note}|${s.rage}`;
    if (key === this.key) return;
    const fresh = !this.key.startsWith(s.name);
    this.key = key;
    if (fresh || !this.el.querySelector('.bfill')) {
      this.el.innerHTML = `<button class="bfocus" title="${KINGDOM_TEXT.focus}">👑</button><div class="bmain"><div class="bhead"><b class="bname"></b><small class="bnote"></small></div><div class="btrack"><i class="bfill"></i></div></div>`;
    }
    this.el.classList.toggle('rage', s.rage);
    this.el.querySelector('.bname')!.textContent = s.name;
    this.el.querySelector('.bnote')!.textContent = s.note;
    (this.el.querySelector('.bfill') as HTMLElement).style.width = `${pct}%`;
  }
}

/**
 * L'écran de victoire : la couronne dans la lumière dorée au-dessus de la citadelle engloutie, le récit, les récompenses ;
 * « Continuer » (on reste où l'on est) ou « Retour au village » (la vue revient sur la grande place)
 */
export function showKingdomVictory(root: HTMLElement, r: KingdomReward | null, onContinue: () => void, onHome: () => void) {
  const T = KINGDOM_TEXT, ov = document.createElement('div');
  ov.className = 'overlay victory kingdomWin';
  const gear = r ? r.gear.map(([g, n]) => `${n} ${(n > 1 ? GEAR_BY[g].plural : GEAR_BY[g].name).toLowerCase()}`).join(', ') : '';
  const items = r ? [
    ['🏆', T.trophy], ['🔥', T.forge(FORGE_CRAFT, FORGE_RISK)], ['⛏️', T.ore(r.ore)], ['⚔️', gear], ['😊', T.joy(r.joy)], ['🌿', T.isle],
  ] : [['🌿', T.isle]];
  ov.innerHTML = `<div class="modal panel victoryCard">
    <canvas width="1040" height="400"></canvas>
    <h2>${T.title}</h2>
    <p class="story">${T.story}</p>
    <h4 class="kwHead">${T.rewards}</h4>
    <ul class="kwRewards">${items.map(([i, t]) => `<li><b>${i}</b><span>${t}</span></li>`).join('')}</ul>
    <div class="row"><button class="home">${ic('house', 16)} ${T.home}</button><span class="grow"></span><button class="active ok">${T.cont}</button></div>
  </div>`;
  root.appendChild(ov);
  const cv = ov.querySelector('canvas')!, c = cv.getContext('2d'), t0 = performance.now();
  let raf = 0;
  const frame = () => {
    if (!ov.isConnected) return;
    if (c) drawCrown(c, (performance.now() - t0) / 1000);
    raf = requestAnimationFrame(frame);
  };
  frame();
  const close = (fn: () => void) => { cancelAnimationFrame(raf); ov.remove(); fn(); };
  (ov.querySelector('.ok') as HTMLButtonElement).onclick = () => close(onContinue);
  (ov.querySelector('.home') as HTMLButtonElement).onclick = () => close(onHome);
  return ov;
}

const rnd = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

/** La couronne du roi qui flotte dans la lumière dorée, au-dessus des ruines de la citadelle noyées de lave */
function drawCrown(c: CanvasRenderingContext2D, t: number) {
  const w = 520, h = 200;
  c.setTransform(2, 0, 0, 2, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a0c1e'); g.addColorStop(0.6, '#5a1a24'); g.addColorStop(1, '#a8401a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // le halo doré
  const cx = w / 2, cy = 82, pulse = 1 + Math.sin(t * 2) * 0.05;
  const halo = c.createRadialGradient(cx, cy, 4, cx, cy, 120 * pulse);
  halo.addColorStop(0, 'rgba(255,236,170,0.95)'); halo.addColorStop(0.35, 'rgba(255,200,90,0.45)'); halo.addColorStop(1, 'rgba(255,170,60,0)');
  c.fillStyle = halo; c.fillRect(0, 0, w, h);
  // les rayons qui tournent lentement
  c.save(); c.translate(cx, cy); c.rotate(t * 0.15);
  for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); c.fillStyle = 'rgba(255,225,140,0.12)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-10, -170); c.lineTo(10, -170); c.fill(); }
  c.restore();
  // les ruines de la citadelle, noires sur la lave
  c.fillStyle = '#1a0a10';
  c.beginPath(); c.moveTo(0, h);
  const sky = [[0, 170], [60, 160], [80, 140], [96, 150], [120, 128], [140, 150], [170, 146], [190, 120], [205, 142], [240, 152], [300, 150], [320, 124], [338, 146], [370, 138], [392, 116], [410, 148], [460, 156], [490, 140], [520, 160]];
  for (const [x, y] of sky) c.lineTo(x, y + Math.sin(t * 0.8 + x) * 0.6);
  c.lineTo(w, h); c.fill();
  // la lave, qui ondule
  for (let i = 0; i < 3; i++) {
    c.fillStyle = ['#ff6a1a', '#ff9a2a', '#ffd060'][i];
    c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) c.lineTo(x, 178 + i * 6 + Math.sin(x * 0.05 + t * (1.5 + i * 0.4)) * 3);
    c.lineTo(w, h); c.fill();
  }
  // la couronne : l'anneau d'or, ses pointes, les cornes noires, le rubis
  c.save(); c.translate(cx, cy + Math.sin(t * 1.6) * 3);
  c.fillStyle = '#2a1a20';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 30, 6); c.quadraticCurveTo(s * 58, -4, s * 52, -44); c.quadraticCurveTo(s * 46, -12, s * 24, -2); c.fill(); }
  const gold = c.createLinearGradient(0, -30, 0, 22);
  gold.addColorStop(0, '#fff2b0'); gold.addColorStop(0.5, '#e8b84a'); gold.addColorStop(1, '#a8741a');
  c.fillStyle = gold;
  c.beginPath(); c.moveTo(-34, 20); c.lineTo(-36, -6);
  for (let i = 0; i < 7; i++) { const x = -36 + i * 12; c.lineTo(x + 6, -26 - (i % 2) * 8); c.lineTo(x + 12, -6); }
  c.lineTo(34, 20); c.closePath(); c.fill();
  c.fillStyle = '#c8902a'; c.fillRect(-36, 12, 72, 8);
  c.fillStyle = '#ff3a6a'; c.beginPath(); c.moveTo(0, -4); c.lineTo(7, 5); c.lineTo(0, 14); c.lineTo(-7, 5); c.fill();
  c.fillStyle = '#b050e0'; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 20, 6, 3.5, 0, Math.PI * 2); c.fill(); }
  c.restore();
  // les étincelles d'or qui montent
  for (let i = 0; i < 60; i++) {
    const p = (t * (0.08 + rnd(i, 3) * 0.12) + rnd(i, 1)) % 1;
    c.fillStyle = `rgba(255,230,150,${(1 - p) * 0.9})`;
    c.fillRect(rnd(i, 2) * w + Math.sin(t + i) * 6, h - p * h, 1.6, 1.6);
  }
}
