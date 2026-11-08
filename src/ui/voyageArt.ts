/**
 * Les images du grand voyage des colons, dessinées à la main sur un canvas 2D, dans l'esprit low-poly du jeu (des facettes
 * plates, deux tons par face) : la planète du village qui s'éloigne, l'arche et sa traînée de flamme, les étoiles qui
 * scintillent, le saut (un tunnel de lumière et une longue traînée), la planète bleue de l'étoile voisine (dégradé, ombre
 * portée, atmosphère, anneaux, lunes), l'entrée dans l'atmosphère, puis l'aube sur la nouvelle planète : la descente, la
 * poussière, la rampe, les colons qui sortent et le premier feu de camp qui s'allume
 */

import { tr as trx } from '../i18n';

type RGB = [number, number, number];
const W = 480, H = 270;

/** Un nombre de 0 à 1, toujours le même pour (i, k) : les étoiles, les facettes */
const rnd = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (t: number, a = 0, b = 1) => Math.min(b, Math.max(a, t));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mixc = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const css = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const hex = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

/** Un polygone plein (une facette) */
function poly(c: CanvasRenderingContext2D, pts: number[][], fill: string | CanvasGradient) {
  c.fillStyle = fill;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
/** Un halo de lumière (additif) */
function halo(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: RGB, a: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(col, a)); g.addColorStop(1, css(col, 0));
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
}

/** Vitesse de défilement des étoiles à l'instant u : lente au départ, vive pendant la traversée, énorme pendant le saut */
function speedAt(u: number, jump: boolean) {
  const e = jump ? warpAt(u) : 0;
  return (u < 0.16 ? 0.3 : u < 0.42 ? 1.4 : 0.5 * (1 - (u - 0.42) * 1.5)) + e * 9;
}
/** L'intensité du saut (0 … 1) : il monte d'un éclair, tient, puis retombe à l'arrivée */
function warpAt(u: number) { return smooth(clamp((u - 0.275) / 0.02)) * (1 - smooth(clamp((u - 0.385) / 0.025))); }
/** Le défilement cumulé, pour que les étoiles ne sautent pas quand la vitesse change */
function scrollAt(u: number, jump: boolean) { let s = 0; for (let i = 0; i < 48; i++) s += speedAt((i / 48) * u, jump) * (u / 48); return s * 24 * 40; }

/** Le champ d'étoiles : elles scintillent, les plus proches filent plus vite que les autres, les plus brillantes ont des branches */
function stars(c: CanvasRenderingContext2D, t: number, scroll: number, alpha: number, streak = 0) {
  for (let i = 0; i < 190; i++) {
    const depth = 0.25 + rnd(i, 5) * 0.75, x = (((rnd(i, 1) * W * 2 - scroll * depth) % W) + W) % W, y = rnd(i, 2) * H;
    const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * (0.9 + rnd(i, 6) * 2.2) + i * 1.7)), k = rnd(i, 7);
    const col: RGB = k < 0.2 ? [255, 222, 170] : k < 0.4 ? [170, 200, 255] : [235, 240, 255];
    const s = depth > 0.85 ? 2.2 : depth > 0.55 ? 1.5 : 1, len = s + streak * depth;
    c.fillStyle = css(col, alpha * tw * (0.35 + depth * 0.65));
    c.fillRect(x, y, len, s);
    if (depth > 0.92 && !streak) {
      c.strokeStyle = css(col, alpha * tw * 0.5); c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(x - 4 * tw - 1, y + s / 2); c.lineTo(x + 4 * tw + 2, y + s / 2); c.moveTo(x + s / 2, y - 4 * tw - 1); c.lineTo(x + s / 2, y + 4 * tw + 2); c.stroke();
    }
  }
}

/** Le fond de l'espace : un dégradé presque noir, une nébuleuse violette, une autre bleutée */
function space(c: CanvasRenderingContext2D, u: number) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#02030a'); g.addColorStop(1, '#0a1030');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  halo(c, W * (0.72 - u * 0.2), H * 0.3, 190, [120, 70, 210], 0.22);
  halo(c, W * (0.2 - u * 0.1), H * 0.8, 150, [40, 110, 200], 0.16);
}

interface PlanetLook {
  /** couleurs : océan (clair, moyen, sombre), terres (claire, sombre), atmosphère */
  sea: [RGB, RGB, RGB]; land: [RGB, RGB]; air: RGB;
  /** d'où vient la lumière (un vecteur de la planète vers l'étoile) */
  lx: number; ly: number;
  rings?: boolean; seed: number;
}
const BLUE_WORLD: PlanetLook = { sea: [[110, 190, 250], [44, 116, 210], [12, 28, 80]], land: [[120, 214, 128], [40, 130, 96]], air: [130, 200, 255], lx: -0.62, ly: -0.5, seed: 3 };
const HOME_WORLD: PlanetLook = { sea: [[90, 170, 240], [36, 100, 200], [10, 26, 70]], land: [[132, 200, 104], [60, 120, 70]], air: [140, 200, 255], lx: 0.7, ly: -0.45, seed: 8 };

/**
 * Une planète : sa mer en dégradé, ses continents en facettes et ses nuages qui défilent, l'ombre du côté de la nuit,
 * l'atmosphère lumineuse au bord, et son anneau (la moitié du fond avant la planète, celle du devant après)
 */
function planet(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, o: PlanetLook) {
  if (r < 1) return;
  const ring = (front: boolean) => {
    c.save();
    c.translate(x, y); c.rotate(-0.16);
    c.beginPath();
    c.rect(-r * 3, front ? 0 : -r * 3, r * 6, r * 3);
    c.clip();
    const bands: [number, number, number][] = [[1.38, 0.1, 0.5], [1.52, 0.16, 0.65], [1.74, 0.08, 0.4], [1.86, 0.12, 0.5]];
    for (const [k, wd, a] of bands) {
      c.strokeStyle = css(k > 1.7 ? [200, 170, 140] : [244, 220, 184], a);
      c.lineWidth = Math.max(1, r * wd * 0.5);
      c.beginPath(); c.ellipse(0, 0, r * k, r * k * 0.22, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  };
  if (o.rings) ring(false);
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
  const g = c.createRadialGradient(x + o.lx * r * 0.5, y + o.ly * r * 0.5, r * 0.05, x, y, r * 1.1);
  g.addColorStop(0, css(o.sea[0])); g.addColorStop(0.5, css(o.sea[1])); g.addColorStop(1, css(o.sea[2]));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  // les continents : des polygones à facettes, deux tons, qui dérivent (la planète tourne) ; chacun se répète d'un bord à l'autre
  for (let j = 0; j < 6; j++) {
    const cx = (((rnd(j + o.seed, 1) * 2 + t * 0.012 * (1 + rnd(j, 4) * 0.3)) % 2) - 1) * r * 1.5, cy = (rnd(j + o.seed, 2) - 0.5) * r * 1.5, rr = r * (0.18 + rnd(j + o.seed, 3) * 0.22);
    const n = 8, pts: number[][] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = 0.7 + rnd(i + j * 9, o.seed) * 0.5; pts.push([x + cx + Math.cos(a) * rr * k * 1.4, y + cy + Math.sin(a) * rr * k * 0.8]); }
    poly(c, pts, css(o.land[1]));
    poly(c, [pts[0], pts[1], pts[2], pts[3], [x + cx, y + cy]], css(o.land[0], 0.9));
    poly(c, [pts[4], pts[5], pts[6], pts[7], [x + cx, y + cy]], css(mixc(o.land[0], o.land[1], 0.5), 0.9));
  }
  // des bandes de nuages
  for (let j = 0; j < 7; j++) {
    const cx = (((rnd(j, 11) * 2 + t * 0.03 * (1 + rnd(j, 12))) % 2) - 1) * r * 1.4, cy = (rnd(j, 13) - 0.5) * r * 1.7, l = r * (0.3 + rnd(j, 14) * 0.4);
    poly(c, [[x + cx - l, y + cy], [x + cx - l * 0.6, y + cy - r * 0.05], [x + cx + l, y + cy - r * 0.02], [x + cx + l * 0.7, y + cy + r * 0.05]], 'rgba(255,255,255,0.5)');
  }
  // la nuit : l'ombre gagne du côté opposé à l'étoile
  const sh = c.createRadialGradient(x + o.lx * r * 0.7, y + o.ly * r * 0.7, r * 0.2, x + o.lx * r * 0.7, y + o.ly * r * 0.7, r * 2.1);
  sh.addColorStop(0, 'rgba(2,4,24,0)'); sh.addColorStop(0.55, 'rgba(2,4,24,0.16)'); sh.addColorStop(1, 'rgba(2,4,24,0.88)');
  c.fillStyle = sh; c.fillRect(x - r, y - r, r * 2, r * 2);
  // l'atmosphère, un liseré clair qui s'épaissit du côté éclairé
  const at = c.createRadialGradient(x, y, r * 0.84, x, y, r * 1.02);
  at.addColorStop(0, css(o.air, 0)); at.addColorStop(1, css(o.air, 0.55));
  c.fillStyle = at; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
  const ha = c.createRadialGradient(x, y, r * 0.98, x, y, r * 1.14);
  ha.addColorStop(0, css(o.air, 0.5)); ha.addColorStop(1, css(o.air, 0));
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = ha; c.beginPath(); c.arc(x, y, r * 1.14, 0, Math.PI * 2); c.fill(); c.restore();
  if (o.rings) ring(true);
}

/** Une petite lune, ses cratères et son ombre */
function moon(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: RGB, lx = -0.6, ly = -0.5) {
  const g = c.createRadialGradient(x + lx * r * 0.5, y + ly * r * 0.5, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, css(mixc(col, [255, 255, 255], 0.4))); g.addColorStop(0.6, css(col)); g.addColorStop(1, css(mixc(col, [10, 10, 40], 0.7)));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = css(mixc(col, [10, 10, 40], 0.35), 0.6);
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + (rnd(i, 3) - 0.5) * r, y + (rnd(i, 4) - 0.5) * r, r * 0.16, 0, Math.PI * 2); c.fill(); }
}

/** L'étoile voisine : un disque chaud, ses rayons qui tournent, un halo */
function sun(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, a = 1) {
  halo(c, x, y, r * 5, [255, 190, 90], 0.3 * a);
  c.save(); c.translate(x, y); c.rotate(t * 0.15);
  for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); poly(c, [[r * 1.1, -r * 0.1], [r * (i % 2 ? 1.8 : 2.4), 0], [r * 1.1, r * 0.1]], `rgba(255,220,140,${0.5 * a})`); }
  c.restore();
  c.fillStyle = `rgba(255,240,190,${a})`; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = `rgba(255,205,110,${a})`; c.beginPath(); c.arc(x, y, r * 0.72, 0, Math.PI * 2); c.fill();
}

/**
 * L'arche des colons, de profil (le nez à droite), en (x, y), à l'échelle s, penchée de a ; `boost` : la flamme des moteurs
 * (2 : le saut). Une coque à deux tons, des ailerons, le dôme de ses serres, une verrière, des hublots, une flamme à trois couches
 */
export function ship(c: CanvasRenderingContext2D, x: number, y: number, s: number, a: number, boost: number, t: number, flame = true) {
  c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
  if (flame && boost > 0) {
    const fl = (15 + Math.sin(t * 41) * 3 + Math.cos(t * 57) * 2) * boost;
    halo(c, -42 - fl * 0.4, 0, 26 * boost, boost > 1 ? [150, 220, 255] : [255, 160, 70], 0.55);
    for (const dy of [-4.5, 4.5]) {
      poly(c, [[-42, dy - 3.2], [-42 - fl * 1.1, dy], [-42, dy + 3.2]], 'rgba(255,140,50,0.92)');
      poly(c, [[-42, dy - 2.2], [-42 - fl * 0.8, dy], [-42, dy + 2.2]], boost > 1 ? '#c8f4ff' : '#ffd27a');
      poly(c, [[-42, dy - 1.1], [-42 - fl * 0.45, dy], [-42, dy + 1.1]], '#ffffff');
    }
  }
  // les ailerons, du côté du fond d'abord
  poly(c, [[-36, -9], [-12, -9], [-30, -30], [-42, -30]], '#9aa6b8');
  poly(c, [[-36, 9], [-12, 9], [-30, 30], [-42, 30]], '#8896aa');
  poly(c, [[-36, -9], [-30, -30], [-42, -30]], '#7e8aa0');
  poly(c, [[-36, 9], [-30, 30], [-42, 30]], '#6a7890');
  // la coque : le dessus clair, le dessous plus sombre, le nez rouge
  poly(c, [[-42, -10], [18, -11.5], [52, 0], [-42, 0]], '#f6f8fc');
  poly(c, [[-42, 10], [18, 11.5], [52, 0], [-42, 0]], '#c4cedc');
  poly(c, [[18, -11.5], [34, -7], [52, 0], [34, 0]], '#e8e2d8');
  poly(c, [[36, -6], [52, 0], [36, 6]], '#e0524a');
  poly(c, [[-42, -3.4], [40, -3.4], [40, -1.4], [-42, -1.4]], '#3a6ab8');
  poly(c, [[-42, 0.6], [40, 0.6], [40, 1.8], [-42, 1.8]], '#e8b84a');
  // le bloc moteur et ses deux tuyères
  poly(c, [[-46, -9], [-42, -10], [-42, 10], [-46, 9]], '#5a6478');
  for (const dy of [-4.5, 4.5]) poly(c, [[-46, dy - 2], [-42, dy - 3], [-42, dy + 3], [-46, dy + 2]], '#2a3040');
  // les serres de l'arche : un dôme vert à facettes sur le dos
  poly(c, [[-22, -10.8], [-16, -19], [-4, -21], [4, -19], [10, -11.2]], 'rgba(122,226,168,0.9)');
  poly(c, [[-16, -19], [-4, -21], [-4, -11], [-22, -10.8]], 'rgba(170,245,200,0.85)');
  c.strokeStyle = 'rgba(40,110,80,0.7)'; c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(-4, -21); c.lineTo(-4, -11); c.moveTo(-16, -19); c.lineTo(-13, -11); c.moveTo(4, -19); c.lineTo(3, -11.4); c.stroke();
  // la verrière du poste de pilotage, ses reflets, et la rangée de hublots qui luisent
  const gl = c.createLinearGradient(0, -9, 0, -2);
  gl.addColorStop(0, '#bff4ff'); gl.addColorStop(1, '#3a8ad0');
  poly(c, [[20, -9], [34, -6.5], [38, -1.6], [20, -1.6]], gl);
  poly(c, [[22, -8], [28, -7], [24, -2.6]], 'rgba(255,255,255,0.55)');
  for (let k = 0; k < 5; k++) {
    c.fillStyle = '#ffeab4'; c.beginPath(); c.arc(-30 + k * 9, 5, 2.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#6a7486'; c.lineWidth = 0.9; c.stroke();
  }
  c.restore();
}

/** Un colon vu de face, de la hauteur de `s` : veste de couleur, sac, jambes qui marchent, bras levés quand on fête */
function settler(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: RGB, step: number, arms: number, face = 1) {
  c.save(); c.translate(x, y); c.scale(s * face, s);
  const sw = Math.sin(step) * 3;
  c.fillStyle = '#2e3446'; c.fillRect(-3.4, -8, 2.8, 8 + Math.max(0, sw) * 0.2); c.fillRect(0.6, -8, 2.8, 8 - Math.min(0, sw) * 0.2);
  c.fillStyle = '#1a1c24'; c.fillRect(-3.8, -1, 3.4, 1.6); c.fillRect(0.6, -1, 3.4, 1.6);
  poly(c, [[-4.6, -17], [4.6, -17], [3.6, -8], [-3.6, -8]], css(col));
  poly(c, [[-4.6, -17], [0, -17], [0, -8], [-3.6, -8]], css(mixc(col, [0, 0, 0], 0.22)));
  poly(c, [[-5.6, -16], [-4.6, -16.5], [-4.6, -9], [-5.8, -9.6]], '#7a5a3a');
  const lift = arms * 0.9;
  c.strokeStyle = css(col); c.lineWidth = 2.2; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-4.4, -16); c.lineTo(-5.6 - lift * 1.5, -16 + lerp(7, -6, lift)); c.moveTo(4.4, -16); c.lineTo(5.6 + lift * 1.5, -16 + lerp(7, -6, lift)); c.stroke();
  c.fillStyle = '#f2c8a0'; c.beginPath(); c.arc(0, -20, 3.3, 0, Math.PI * 2); c.fill();
  poly(c, [[-3.6, -20], [-3.2, -23.4], [0, -24.2], [3.2, -23.4], [3.6, -20], [0, -21.6]], css(mixc(col, [255, 255, 255], 0.45)));
  c.restore();
}

/** Le feu de camp : les bûches croisées, trois couches de flammes qui dansent, des braises qui montent, une lueur sur le sol */
function campfire(c: CanvasRenderingContext2D, x: number, y: number, k: number, t: number) {
  halo(c, x, y - 8, 70 * k, [255, 170, 80], 0.5 * k);
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(255,170,80,0.22)'; c.beginPath(); c.ellipse(0, 3, 52 * k, 9 * k, 0, 0, Math.PI * 2); c.fill();
  for (const [a, col] of [[0.3, '#6a4a34'], [-0.3, '#5a3c2a']] as [number, string][]) { c.save(); c.rotate(a); c.fillStyle = col; c.fillRect(-10, -3, 20, 3.4); c.restore(); }
  for (const [h, w, col] of [[26, 9, '#ff7a2a'], [19, 7, '#ffb04a'], [11, 4.4, '#fff2c0']] as [number, number, string][]) {
    const f = (1 + Math.sin(t * 11 + h) * 0.18 + Math.sin(t * 17 + h * 2) * 0.1) * k, sw = Math.sin(t * 7 + h) * 2;
    poly(c, [[-w, -2], [-w * 0.6, -h * 0.5 * f], [sw, -h * f], [w * 0.5, -h * 0.55 * f], [w, -2]], col);
  }
  c.restore();
  for (let i = 0; i < 10; i++) {
    const p = (t * 0.7 + rnd(i, 31)) % 1;
    c.fillStyle = `rgba(255,200,110,${(1 - p) * k})`;
    c.fillRect(x + (rnd(i, 32) - 0.5) * 14 + Math.sin(p * 6 + i) * 4, y - 8 - p * 46, 1.6, 1.6);
  }
}

/** Les collines d'une couche : une crête à facettes (des pics anguleux), remplie jusqu'au bas de l'image */
function ridge(c: CanvasRenderingContext2D, base: number, amp: number, step: number, seed: number, col: RGB, shade: RGB) {
  const pts: number[][] = [[0, H]];
  for (let x = -step; x <= W + step; x += step) pts.push([x, base - rnd(x + seed, seed) * amp]);
  pts.push([W, H]);
  poly(c, pts, css(col));
  for (let i = 1; i < pts.length - 2; i += 2) poly(c, [pts[i], pts[i + 1], [pts[i + 1][0], H], [pts[i][0], H]], css(shade, 0.25));
}

/**
 * Une image du voyage à l'instant u (0 … 1), t en secondes réelles ; renvoie la légende. `jump` : le moteur expérimental plie
 * l'espace (un saut au lieu de longues années de traversée)
 */
export function drawVoyage(c: CanvasRenderingContext2D, u: number, t: number, jump: boolean): string {
  c.setTransform(2, 0, 0, 2, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.lineCap = 'butt';
  if (u < 0.62) return spaceScene(c, u, t, jump);
  return surfaceScene(c, u, t);
}

/** Dans l'espace : le départ, la traversée (ou le saut), l'approche de la planète bleue, l'entrée dans l'atmosphère */
function spaceScene(c: CanvasRenderingContext2D, u: number, t: number, jump: boolean): string {
  space(c, u);
  const warp = jump ? warpAt(u) : 0, scroll = scrollAt(u, jump);
  stars(c, t, scroll, 1, warp * 70 + (u < 0.42 ? 3 : 0));
  // ---- le départ : la planète du village s'éloigne en bas à gauche, l'arche monte en laissant une traînée de flamme
  if (u < 0.16) {
    const k = u / 0.16, e = smooth(k), pr = 170 - e * 70, px = 70 - e * 70, py = 300 + e * 60;
    sun(c, W * 0.9, 24, 7, t, 0.9);
    planet(c, px, py, pr, t, HOME_WORLD);
    const sx = 130 + e * 140, sy = 170 - e * 90, at = -0.55 + e * 0.5, sc = 0.55 + e * 0.35;
    for (let j = 12; j >= 1; j--) {
      const kk = Math.max(0, k - j * 0.012), ee = smooth(kk), age = j / 12;
      halo(c, 130 + ee * 140 - 36 * sc, 170 - ee * 90 + 8 * sc, 8 + age * 14, [255, 170, 90], 0.4 * (1 - age));
    }
    ship(c, sx, sy, sc, at, 1.3, t);
    return trx('Le vaisseau colonial quitte la planète du village…');
  }
  // ---- la traversée : l'arche file entre les étoiles ; pendant le saut, un tunnel de lumière et une longue traînée
  if (u < 0.42) {
    const k = (u - 0.16) / 0.26, sx = W * 0.5 + (u > 0.16 ? 0 : 0), sy = H / 2 + Math.sin(t * 1.5) * 3;
    if (warp > 0) {
      const cx = W * 0.62, cy = H / 2;
      for (let i = 0; i < 110; i++) {
        const a = rnd(i, 1) * Math.PI * 2, p = (rnd(i, 2) + t * 1.7) % 1, r0 = 24 + p * p * 330, l = 24 + 170 * p * warp, hue = rnd(i, 3);
        const col: RGB = hue < 0.4 ? [190, 235, 255] : hue < 0.75 ? [255, 255, 255] : [200, 170, 255];
        const g = c.createLinearGradient(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.7, cx + Math.cos(a) * (r0 + l), cy + Math.sin(a) * (r0 + l) * 0.7);
        g.addColorStop(0, css(col, 0)); g.addColorStop(1, css(col, 0.8 * warp * p));
        c.strokeStyle = g; c.lineWidth = 0.6 + p * 1.6;
        c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.7); c.lineTo(cx + Math.cos(a) * (r0 + l), cy + Math.sin(a) * (r0 + l) * 0.7); c.stroke();
      }
      halo(c, cx, cy, 160 * warp, [170, 210, 255], 0.5 * warp);
      // la traînée de lumière : un long ruban qui s'étire derrière l'arche, bleu-blanc puis violet
      const tr = c.createLinearGradient(sx - 40, 0, -20, 0);
      tr.addColorStop(0, 'rgba(210,240,255,0.95)'); tr.addColorStop(0.35, 'rgba(120,190,255,0.5)'); tr.addColorStop(1, 'rgba(150,100,255,0)');
      c.fillStyle = tr; c.globalAlpha = warp;
      poly(c, [[sx - 40, sy - 7 * warp], [-20, sy - 22 * warp], [-20, sy + 22 * warp], [sx - 40, sy + 7 * warp]], tr);
      c.globalAlpha = 1;
      for (let i = 0; i < 6; i++) { c.strokeStyle = `rgba(255,255,255,${0.35 * warp})`; c.lineWidth = 0.8; const yy = sy + (rnd(i, 41) - 0.5) * 30 * warp; c.beginPath(); c.moveTo(sx - 40, yy * 0.3 + sy * 0.7); c.lineTo(-20, yy); c.stroke(); }
    } else {
      // sans saut : une longue flamme discrète, une comète qui passe au loin
      const p = (t * 0.18) % 1;
      c.strokeStyle = `rgba(200,230,255,${0.5 * (1 - p)})`; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(W * (1.1 - p * 1.4), H * (0.12 + p * 0.3)); c.lineTo(W * (1.1 - p * 1.4) + 46, H * (0.12 + p * 0.3) - 14); c.stroke();
    }
    ship(c, sx - 20, sy, 1 + warp * 0.25, 0, 1 + warp, t);
    if (jump) {
      const f1 = 1 - Math.abs(u - 0.282) / 0.012, f2 = 1 - Math.abs(u - 0.4) / 0.014;
      const fl = Math.max(0, f1, f2);
      if (fl > 0) { c.fillStyle = `rgba(255,255,255,${fl})`; c.fillRect(0, 0, W, H); }
    }
    return trx(jump ? (k < 0.45 ? 'Allumage du moteur expérimental…' : 'L’espace se plie : l’étoile voisine est déjà là !')
      : (k < 0.5 ? 'Des années de voyage entre les étoiles…' : 'Dans les serres de l’arche, les graines du nouveau village attendent.'));
  }
  // ---- l'approche : l'étoile voisine, la planète bleue (anneau, lunes) qui grossit, l'arche qui la survole puis plonge
  const k = smooth((u - 0.42) / 0.2), pr = 22 + k * 230, px = W * 0.7 - k * 40, py = H * 0.5 + k * 150;
  sun(c, 72, 52, 12, t);
  const look = { ...BLUE_WORLD, rings: true };
  planet(c, px, py, pr, t, look);
  const ma = t * 0.3;
  for (const [ph, rr, mr, col] of [[ma, 1.9, 7, [220, 214, 232]], [ma * 0.7 + 2.4, 2.4, 5, [200, 180, 150]]] as [number, number, number, RGB][]) {
    const mx = px + Math.cos(ph) * pr * rr, my = py - pr * 0.5 + Math.sin(ph) * pr * rr * 0.2;
    if (Math.sin(ph) < 0 || Math.hypot(mx - px, my - py) > pr) moon(c, mx, my, mr * (0.5 + k * 0.7), col);
  }
  // l'arche survole la planète, rapetisse, puis s'embrase en entrant dans l'atmosphère
  const en = clamp((u - 0.55) / 0.07), sx = lerp(W * 0.3, W * 0.62, k) + en * 20, sy = lerp(H * 0.45, H * 0.52, k) + en * 20, sc = 1 - k * 0.55 - en * 0.15;
  if (en > 0) {
    halo(c, sx + 30 * sc, sy, 40 * sc * (1 + en), [255, 140, 60], 0.7 * en);
    for (let i = 0; i < 8; i++) { const p = (t * 2 + i / 8) % 1; poly(c, [[sx + 40 * sc, sy + (i - 4) * 2 * sc], [sx - (30 + p * 70) * sc, sy + (i - 4) * 4 * sc], [sx - 20 * sc, sy + (i - 3.6) * 2 * sc]], `rgba(255,${150 + i * 10},60,${0.5 * en * (1 - p)})`); }
  }
  ship(c, sx, sy, sc, 0.15 + en * 0.4, 1, t, !en);
  if (en > 0.4) { c.fillStyle = `rgba(255,230,190,${(en - 0.4) * 1.2 * smooth(clamp((u - 0.6) / 0.02))})`; c.fillRect(0, 0, W, H); }
  return trx('La planète bleue de l’étoile voisine !');
}

/** Sur la planète, à l'aube : la descente, la poussière, la rampe, les colons qui sortent, le premier feu de camp */
function surfaceScene(c: CanvasRenderingContext2D, u: number, t: number): string {
  // l'aube : le ciel passe du violet nocturne à l'orange puis au bleu clair, le soleil se lève derrière les collines
  const d = smooth(clamp((u - 0.62) / 0.34)), gy = H * 0.8, hz = H * 0.68;
  const top = mixc([14, 20, 62], [58, 108, 190], d), mid = mixc([78, 46, 120], [128, 186, 230], d), low = mixc([232, 108, 120], [255, 226, 176], d);
  const sky = c.createLinearGradient(0, 0, 0, hz + 10);
  sky.addColorStop(0, css(top)); sky.addColorStop(0.6, css(mid)); sky.addColorStop(1, css(low));
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  stars(c, t, 0, 1 - d * 1.7);
  const sxn = W * 0.84, syn = lerp(hz + 26, hz - 70, d);
  halo(c, sxn, syn, 150, [255, 200, 130], 0.5 + 0.2 * (1 - d));
  c.fillStyle = '#fff0c4'; c.beginPath(); c.arc(sxn, syn, 15, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffd88a'; c.beginPath(); c.arc(sxn, syn, 10.5, 0, Math.PI * 2); c.fill();
  // l'anneau de la planète en travers du ciel et ses deux lunes
  c.save(); c.translate(W * 0.42, hz - 30); c.rotate(-0.22);
  for (const [rx, ry, col, a, lw] of [[W * 0.95, 56, [244, 220, 190], 0.55, 7], [W * 0.95, 56, [200, 160, 130], 0.4, 3]] as [number, number, RGB, number, number][]) {
    c.strokeStyle = css(col, a * (0.55 + 0.45 * d)); c.lineWidth = lw; c.beginPath(); c.ellipse(0, 70, rx, ry, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.translate(0, -4);
  }
  c.restore();
  moon(c, W * 0.18, 44, 15, [232, 226, 244], 0.7, -0.4);
  moon(c, W * 0.58, 30, 8, [216, 196, 172], 0.7, -0.4);
  // les collines de trois profondeurs, baignées de la lumière du matin
  const tint = (col: RGB, k: number) => mixc(col, low, k * (1 - d * 0.5));
  ridge(c, hz + 4, 34, 36, 3, tint([74, 90, 140], 0.45), [20, 20, 60]);
  ridge(c, hz + 18, 26, 30, 7, tint([60, 132, 150], 0.3), [10, 40, 60]);
  ridge(c, hz + 30, 14, 24, 11, tint([62, 160, 140], 0.18), [10, 50, 40]);
  // quelques arbres-bulbes de la planète, aux chapeaux luisants
  for (let i = 0; i < 9; i++) {
    const x = 20 + rnd(i, 51) * (W - 40), y = hz + 26 + rnd(i, 52) * 14, h = 14 + rnd(i, 53) * 16;
    c.fillStyle = '#2a6a64'; c.fillRect(x - 1, y - h, 2, h);
    poly(c, [[x - 7, y - h], [x - 3, y - h - 8], [x + 3, y - h - 8], [x + 7, y - h]], css(i % 2 ? [240, 130, 190] : [120, 230, 200]));
    poly(c, [[x - 7, y - h], [x - 3, y - h - 8], [x, y - h - 8], [x, y - h]], css(i % 2 ? [255, 180, 220] : [170, 250, 230]));
  }
  // la plaine, ses herbes bleutées
  const gg = c.createLinearGradient(0, gy - 12, 0, H);
  gg.addColorStop(0, css(mixc([60, 150, 120], low, 0.2 * (1 - d)))); gg.addColorStop(1, '#2f8a6e');
  c.fillStyle = gg; c.fillRect(0, gy - 12, W, H - gy + 12);
  poly(c, [[0, gy - 12], [W * 0.3, gy - 16], [W * 0.62, gy - 11], [W, gy - 15], [W, gy], [0, gy]], css([80, 176, 130], 0.5));
  c.fillStyle = '#2f9a9a';
  for (let i = 0; i < 46; i++) { const x = rnd(i, 7) * W, y = gy + 3 + rnd(i, 8) * (H - gy - 4); c.fillRect(x, y - 5, 1.4, 5); c.fillRect(x + 2, y - 4, 1.4, 4); }
  // la descente : l'arche, flamme sous la tuyère, ombre qui grandit, contact dans la poussière
  const lx = W * 0.3, ly = gy + 6, land = smooth(clamp((u - 0.62) / 0.14)), sy = ly - 50 - (1 - land) * 260;
  c.fillStyle = `rgba(10,30,40,${0.3 * land})`; c.beginPath(); c.ellipse(lx + 4, ly, 30 * (0.4 + land * 0.6), 5 * (0.4 + land * 0.6), 0, 0, Math.PI * 2); c.fill();
  const down = u < 0.755;
  if (down) {
    const fl = (28 + Math.sin(t * 40) * 5) * (1 - land * 0.5);
    halo(c, lx, sy + 52, 46, [255, 170, 80], 0.6);
    poly(c, [[lx - 11, sy + 44], [lx + 11, sy + 44], [lx, sy + 44 + fl * 1.7]], 'rgba(255,140,50,0.92)');
    poly(c, [[lx - 7, sy + 44], [lx + 7, sy + 44], [lx, sy + 44 + fl * 1.2]], '#ffd27a');
    poly(c, [[lx - 3, sy + 44], [lx + 3, sy + 44], [lx, sy + 44 + fl * 0.7]], '#ffffff');
  }
  arche(c, lx, sy, land, u);
  // la poussière soulevée au contact : des nuages qui s'étalent au ras du sol
  const dust = (u - 0.74) / 0.13;
  if (dust > 0 && dust < 1) for (let i = 0; i < 22; i++) {
    const side = rnd(i, 21) < 0.5 ? -1 : 1, e = smooth(dust), r = 5 + e * 20 * (0.4 + rnd(i, 22));
    c.fillStyle = `rgba(232,224,200,${0.7 * (1 - dust) * (0.5 + rnd(i, 24) * 0.5)})`;
    c.beginPath(); c.arc(lx + side * e * (30 + rnd(i, 23) * 120), ly - 2 - rnd(i, 25) * 12 * (1 - dust * 0.5), r, 0, Math.PI * 2); c.fill();
  }
  if (u < 0.78) return trx(land < 1 ? 'Descente vers la plaine, à l’aube…' : 'Contact ! L’arche s’est posée.');
  // la rampe s'ouvre, les colons descendent, vont au feu et le font prendre
  const fx = W * 0.7, ramp = smooth(clamp((u - 0.78) / 0.04)), walk = clamp((u - 0.81) / 0.1);
  const hx = lx + 11, hy = ly - 44, ex = lerp(hx + 1, hx + 46, ramp), ey = lerp(hy + 10, ly, ramp);
  poly(c, [[hx, hy + 6], [hx + 5, hy + 6], [ex + 6, ey], [ex, ey]], '#aab4c4');
  poly(c, [[hx, hy + 6], [hx + 2.5, hy + 6], [ex + 2, ey], [ex, ey]], '#8892a4');
  const spots = [[-36, 3], [-22, -5], [-6, 6], [22, -4], [36, 4], [-50, -2], [50, -2]];
  const cols = [[244, 244, 248], [90, 240, 255], [255, 122, 184], [255, 208, 74], [140, 230, 140], [244, 140, 70], [170, 150, 255]] as RGB[];
  for (let i = 0; i < 7; i++) {
    const kk = clamp(walk * 1.8 - i * 0.12);
    if (kk <= 0) continue;
    const e = smooth(kk), x0 = ex + 4, x = x0 + (fx + spots[i][0] - x0) * e, y = ly + 1 + spots[i][1] * e - (kk < 1 ? Math.abs(Math.sin(t * 9 + i)) * 2.5 : 0);
    settler(c, x, y, 1.8, cols[i], t * 9 + i, kk >= 1 && u > 0.9 ? 1 : 0, x < fx + spots[i][0] - 1 ? 1 : (i % 2 ? -1 : 1));
  }
  if (u > 0.87) campfire(c, fx, ly, clamp((u - 0.87) / 0.04), t);
  // un voile chaud sur l'image quand le feu prend, puis le noir final
  if (u > 0.9) { c.fillStyle = `rgba(255,170,90,${0.06 * Math.sin(t * 3) + 0.05})`; c.fillRect(0, 0, W, H); }
  if (u > 0.95) { c.fillStyle = `rgba(3,5,13,${(u - 0.95) / 0.05})`; c.fillRect(0, 0, W, H); }
  return trx(u < 0.88 ? 'La rampe s’ouvre : les colons foulent leur nouvelle planète.' : 'Ils allument leur premier feu de camp : un nouveau village est né.');
}

/** L'arche posée (ou qui se pose) debout, le nez en l'air, ses pieds en (x, y + 14) ; `land` : ses pieds se déploient (0 … 1) */
function arche(c: CanvasRenderingContext2D, x: number, y: number, land: number, u: number) {
  const foot = y + 44 + 6 * land, open = u > 0.78;
  c.save();
  // les pieds : des jambes à vérins, qui s'écartent à l'approche du sol
  c.strokeStyle = '#8a94a6'; c.lineWidth = 2.4; c.lineCap = 'round';
  const sp = 14 + land * 14;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 10, y + 30); c.lineTo(x + s * sp, foot); c.stroke(); c.fillStyle = '#c8d0dc'; c.fillRect(x + s * sp - 4, foot - 1, 8, 2.2); }
  c.lineCap = 'butt';
  c.translate(x, y); c.rotate(-Math.PI / 2); c.scale(1, -1); c.scale(0.95, 0.95);
  ship(c, 0, 0, 1, 0, 0, 0, false);
  c.restore();
  // la trappe de la rampe, sur le flanc droit, éclairée de l'intérieur quand elle s'ouvre
  poly(c, [[x + 9, y - 6], [x + 14, y - 6], [x + 14, y + 6], [x + 9, y + 6]], open ? '#ffe9b0' : '#8a94a6');
}
