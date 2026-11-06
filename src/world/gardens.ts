import { World, N, VEG_GARDEN } from './world';
import { mulberry32, clamp } from '../core/rng';

/**
 * Jardins : chaque zone d'un seul tenant peinte à l'outil Jardin devient un lieu qui évolue avec les âges et s'organise selon
 * sa taille et sa forme. Lieu de rassemblement autour des feux à la Préhistoire, jardin antique, lices de tournoi au Moyen Âge,
 * jardin à la française ou à l'anglaise à l'âge industriel, parc avec aire de jeux à l'époque moderne, jardin bioluminescent
 * sous sa serre-dôme à l'âge futuriste.
 * Tirage déterministe (même zone, même âge : même jardin) ; partagé par le rendu et par les habitants, qui y prennent place
 */

/** Zone de jardin : ses cases, son centre et son axe long */
export interface Garden {
  /** plus petite case de la zone : identifiant */
  id: number;
  cells: number[];
  set: Set<number>;
  cx: number; cz: number;
  /** axe long (angle de u dans le plan x, z), étendue le long de u et en travers, en cases */
  angle: number; len: number; wid: number;
  /** part du rectangle orienté couverte (1 : rectangle plein) */
  fill: number;
}

/** Ce que font les habitants sur place */
export type Act = 'sit' | 'work' | 'cheer' | 'play' | 'run' | 'stroll';
/** Élément du décor : sorte, position, cap (rotation y), échelle, variante ; w et d pour les éléments étirés (bassin, lice, gradins) */
export interface Item { k: string; x: number; z: number; r: number; s: number; v: number; w?: number; d?: number }
/** Place d'un habitant : position, cap une fois arrivé, activité ; seat : hauteur d'assise (banc, gradin) ; kid : pour les enfants */
export interface Spot { x: number; z: number; face: number; act: Act; kid?: boolean; seat?: number }
export interface Layout {
  g: Garden; age: number;
  /** camp, antique, tournoi, lices, francais, anglais, parc, futur */
  style: string;
  items: Item[];
  spots: Spot[];
  /** dalles des allées : x, z à la suite */
  paths: number[];
  /** couloirs de joute : x0, z0, x1, z1 à la suite */
  lanes: number[];
}

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** points candidats par case : centre et quatre quarts */
const SUB = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];

/** Toutes les zones de jardin de la carte */
export function findGardens(w: World): Garden[] {
  const out: Garden[] = [], seen = new Uint8Array(N * N);
  for (let k0 = 0; k0 < N * N; k0++) {
    if (seen[k0] || w.veg[k0] !== VEG_GARDEN) continue;
    const cells = [k0];
    seen[k0] = 1;
    for (let i = 0; i < cells.length; i++) {
      const x = cells[i] % N, z = Math.floor(cells[i] / N);
      for (const [dx, dz] of D4) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (w.inCells(nx, nz) && !seen[k] && w.veg[k] === VEG_GARDEN) { seen[k] = 1; cells.push(k); }
      }
    }
    out.push(describe(cells));
  }
  return out;
}

/** Centre, axe principal (moments d'inertie des cases) et étendues de la zone */
function describe(cells: number[]): Garden {
  const n = cells.length;
  let sx = 0, sz = 0;
  for (const c of cells) { sx += (c % N) + 0.5; sz += Math.floor(c / N) + 0.5; }
  const cx = sx / n, cz = sz / n;
  let xx = 0, zz = 0, xz = 0, bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (const c of cells) {
    const x = c % N, z = Math.floor(c / N), dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    xx += dx * dx; zz += dz * dz; xz += dx * dz;
    bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z);
  }
  const bw = bx1 - bx0 + 1, bd = bz1 - bz0 + 1;
  let angle: number;
  // zone qui remplit presque son rectangle (quelques cases manquent) : on garde l'axe de la grille
  if (n / (bw * bd) >= 0.7) angle = bw >= bd ? 0 : Math.PI / 2;
  else {
    // sinon l'axe principal (zone ronde : pas d'axe privilégié, celui de la grille) ; presque dans la grille : on s'y aligne
    angle = Math.abs(xx - zz) < 0.05 * n && Math.abs(xz) < 0.05 * n ? 0 : 0.5 * Math.atan2(2 * xz, xx - zz);
    for (const a of [0, Math.PI / 2, -Math.PI / 2]) if (Math.abs(angle - a) < 0.15) angle = a;
  }
  const ca = Math.cos(angle), sa = Math.sin(angle);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const c of cells) {
    const dx = (c % N) + 0.5 - cx, dz = Math.floor(c / N) + 0.5 - cz, u = dx * ca + dz * sa, v = -dx * sa + dz * ca;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const len = u1 - u0 + 1, wid = v1 - v0 + 1;
  return { id: Math.min(...cells), cells, set: new Set(cells), cx, cz, angle, len, wid, fill: Math.min(1, n / (len * wid)) };
}

/** Outils de placement d'un jardin : points candidats, emprises déjà prises, repère tourné selon l'axe de la zone */
class Ctx {
  readonly rnd: () => number;
  readonly size: number;
  readonly ca: number;
  readonly sa: number;
  /** emprises posées : x, z, rayon */
  private placed: number[] = [];
  /** points candidats (x, z), mélangés */
  private pts: number[] = [];

  constructor(readonly w: World, readonly g: Garden, readonly out: Layout) {
    this.rnd = mulberry32(g.id * 31 + out.age * 7919 + 1);
    this.size = g.cells.length;
    this.ca = Math.cos(g.angle); this.sa = Math.sin(g.angle);
    const p: [number, number][] = [];
    for (const c of g.cells) {
      const x = c % N, z = Math.floor(c / N);
      for (const [ox, oz] of SUB) p.push([x + ox + (this.rnd() - 0.5) * 0.12, z + oz + (this.rnd() - 0.5) * 0.12]);
    }
    for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (const [x, z] of p) this.pts.push(x, z);
  }

  /** point décalé de (u, v) depuis (x, z), dans le repère du jardin (u le long de l'axe long) */
  at(x: number, z: number, u: number, v: number): [number, number] { return [x + u * this.ca - v * this.sa, z + u * this.sa + v * this.ca]; }
  /** pente du terrain au point (les étangs cherchent le plat) */
  slope(x: number, z: number) { return this.w.cellSlope(Math.floor(x), Math.floor(z)); }
  /** cap qui fait regarder de (x, z) vers (tx, tz) */
  face(x: number, z: number, tx: number, tz: number) { return Math.atan2(tx - x, tz - z); }
  /** cap qui aligne l'axe x local d'un élément sur l'axe long du jardin */
  get along() { return -this.g.angle; }

  private inG(x: number, z: number) {
    const cx = Math.floor(x), cz = Math.floor(z), k = cz * N + cx;
    return this.w.inCells(cx, cz) && this.g.set.has(k) && !this.w.road[k] && !this.w.occ[k];
  }
  /** point dans le jardin, à au moins m de son bord */
  inside(x: number, z: number, m: number) {
    return this.inG(x, z) && this.inG(x + m, z) && this.inG(x - m, z) && this.inG(x, z + m) && this.inG(x, z - m)
      && (m < 0.2 || (this.inG(x + m * 0.7, z + m * 0.7) && this.inG(x - m * 0.7, z - m * 0.7) && this.inG(x + m * 0.7, z - m * 0.7) && this.inG(x - m * 0.7, z + m * 0.7)));
  }
  /** emprise libre de rayon r, à m du bord */
  fits(x: number, z: number, r: number, m = r) {
    if (!this.inside(x, z, m)) return false;
    const p = this.placed;
    for (let i = 0; i < p.length; i += 3) if ((p[i] - x) ** 2 + (p[i + 1] - z) ** 2 < (p[i + 2] + r) ** 2) return false;
    return true;
  }
  /** réserve une emprise sans rien y poser (couloir de joute, allée) */
  block(x: number, z: number, r: number) { this.placed.push(x, z, r); }

  /** meilleur point candidat libre (le premier venu sans critère, sinon celui qui minimise le score) */
  find(r: number, m = r, score?: (x: number, z: number) => number): [number, number] | null {
    let bx = NaN, bz = 0, bs = Infinity;
    const p = this.pts;
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], z = p[i + 1];
      if (!this.fits(x, z, r, m)) continue;
      if (!score) return [x, z];
      const s = score(x, z);
      if (s < bs) { bs = s; bx = x; bz = z; }
    }
    return Number.isNaN(bx) ? null : [bx, bz];
  }
  /** point libre le plus proche du centre de la zone, le plus loin possible de ses bords */
  center(r: number): [number, number] | null {
    const g = this.g;
    if (this.fits(g.cx, g.cz, r)) return [g.cx, g.cz];
    for (const m of [r, r * 0.6, 0.15, 0]) {
      const p = this.find(Math.min(r, m), m, (x, z) => (x - g.cx) ** 2 + (z - g.cz) ** 2);
      if (p) return p;
    }
    return null;
  }

  put(k: string, x: number, z: number, r: number, s: number, rad: number, extra?: Partial<Item>) {
    this.out.items.push({ k, x, z, r, s, v: Math.floor(this.rnd() * 6), ...extra });
    if (rad > 0) this.placed.push(x, z, rad);
  }
  spot(x: number, z: number, face: number, act: Act, extra?: Partial<Spot>) {
    if (this.inside(x, z, 0)) this.out.spots.push({ x, z, face, act, ...extra });
  }
  path(x: number, z: number) { this.out.paths.push(x, z); }
}

/** Plan du jardin pour l'âge donné */
export function layoutGarden(w: World, g: Garden, age: number): Layout {
  const out: Layout = { g, age, style: '', items: [], spots: [], paths: [], lanes: [] };
  const c = new Ctx(w, g, out);
  if (age <= 0) camp(c);
  else if (age === 1) antique(c);
  else if (age === 2) medieval(c);
  // à la française sur un terrain carré ou rectangulaire, à l'anglaise sur une zone aux contours libres
  else if (age === 3) { if (c.size >= 6 && g.fill >= 0.85 && g.wid >= 2.5) french(c); else lawn(c, false); }
  else if (age === 4) park(c);
  else future(c);
  return out;
}

/**
 * Herbe plus riche : touffes et fleurs des champs dans les trous laissés libres (`k` : la sorte de touffe), sans gêner le reste
 */
function tufts(c: Ctx, n: number, k = 'tuft') {
  for (let i = 0; i < n; i++) { const p = c.find(0.06, 0.04); if (p) c.put(k, p[0], p[1], c.rnd() * 6.28, 0.8 + c.rnd() * 0.5, 0.06); }
}

/** Préhistoire : lieu de rassemblement, feux entourés de rondins, boucherie, taille du silex, séchage des peaux et de la viande */
function camp(c: Ctx) {
  c.out.style = 'camp';
  const size = c.size, fires: [number, number][] = [];
  const nFire = clamp(Math.round(size / 10), 1, 5);
  for (let i = 0; i < nFire; i++) {
    const p = i === 0 ? c.center(0.3) : c.find(0.62, 0.45, (x, z) => -Math.min(...fires.map(([fx, fz]) => Math.hypot(x - fx, z - fz))));
    if (!p) break;
    const [x, z] = p;
    fires.push(p);
    // une broche au-dessus du grand feu
    c.put('fire', x, z, c.rnd() * 6.28, 1, size >= 2 ? 0.62 : 0.3, { v: i === 0 && size >= 3 ? 1 : 0 });
    const n = size >= 2 ? 4 : 2, a0 = c.rnd() * 6.28;
    // peaux étendues au sol près du feu
    for (let j = 0; j < (size >= 4 ? 2 : 0); j++) { const a = a0 + 0.8 + j * 3.1, rx = x + Math.cos(a) * 0.78, rz = z + Math.sin(a) * 0.78; if (c.fits(rx, rz, 0.13, 0.1)) c.put('rug', rx, rz, c.rnd() * 6.28, 1, 0.13); }
    for (let j = 0; j < n; j++) {
      const a = a0 + (j / n) * 6.283 + (c.rnd() - 0.5) * 0.4, sx = x + Math.cos(a) * 0.47, sz = z + Math.sin(a) * 0.47;
      if (!c.inside(sx, sz, 0.04)) continue;
      // rondin couché tangent au cercle, ou pierre plate
      c.put(j % 3 === 2 ? 'stoneseat' : 'logseat', sx, sz, Math.atan2(-Math.cos(a), -Math.sin(a)), 1, 0);
      const px = x + Math.cos(a) * 0.36, pz = z + Math.sin(a) * 0.36;
      c.spot(px, pz, c.face(px, pz, x, z), 'sit');
    }
  }
  if (!fires.length) return;
  // ateliers autour des feux, l'artisan entre l'ouvrage et le feu
  const ORDER = ['butcher', 'flint', 'rack', 'hides', 'woodpile', 'pots', 'basket', 'spears', 'tent', 'butcher', 'rack', 'menhir', 'flint', 'basket', 'hides', 'tent', 'woodpile', 'pots'];
  const RAD: Record<string, number> = { butcher: 0.3, flint: 0.27, rack: 0.3, hides: 0.3, woodpile: 0.2, pots: 0.16, basket: 0.12, spears: 0.16, tent: 0.5, menhir: 0.28 };
  const SCALE: Record<string, number> = { tent: 1.25, menhir: 1.2 };
  const WORK: Record<string, 'work' | 'sit'> = { butcher: 'work', flint: 'sit', rack: 'work', hides: 'work' };
  const nSt = size < 2 ? 0 : Math.min(36, Math.round(size * 0.8));
  for (let i = 0; i < nSt; i++) {
    const k = ORDER[i % ORDER.length];
    if ((k === 'tent' && size < 8) || (k === 'menhir' && size < 10)) continue;
    const [fx, fz] = fires[i % fires.length], r = RAD[k];
    const p = c.find(r, r * 0.8, (x, z) => Math.abs(Math.hypot(x - fx, z - fz) - 1.05) + c.rnd() * 0.5);
    if (!p) continue;
    const [x, z] = p, toFire = c.face(x, z, fx, fz);
    c.put(k, x, z, toFire, (SCALE[k] ?? 1) * (0.9 + c.rnd() * 0.2), r);
    if (WORK[k]) {
      const sx = x + Math.sin(toFire) * r * 0.85, sz = z + Math.cos(toFire) * r * 0.85;
      c.spot(sx, sz, toFire + Math.PI, WORK[k]);
    }
  }
  // le mât totem du clan, peint d'ocre, au bord du grand feu
  if (size >= 6) {
    const [fx, fz] = fires[0], p = c.find(0.14, 0.12, (x, z) => Math.abs(Math.hypot(x - fx, z - fz) - 0.9) + c.rnd() * 0.3);
    if (p) c.put('totem', p[0], p[1], c.face(p[0], p[1], fx, fz), 1.1, 0.14);
  }
  // buissons de baies au bord du camp, où l'on cueille
  for (let i = 0; i < Math.min(6, Math.floor(size / 4)); i++) {
    const p = c.find(0.14, 0.1, (x, z) => -Math.min(...fires.map(([fx, fz]) => Math.hypot(x - fx, z - fz))) + c.rnd() * 0.4);
    if (p) c.put('berrybush', p[0], p[1], c.rnd() * 6.28, 0.9 + c.rnd() * 0.3, 0.14);
  }
  // os et cailloux qui traînent
  const nCl = Math.min(50, Math.round(size * 1.6));
  for (let i = 0; i < nCl; i++) { const p = c.find(0.07, 0.05); if (p) c.put(['pebbles', 'bones', 'pebbles', 'firewood'][i % 4], p[0], p[1], c.rnd() * 6.28, 0.8 + c.rnd() * 0.4, 0.07); }
  // des fougères et des herbes hautes qui repoussent dans les coins
  tufts(c, Math.min(30, size), 'fern');
  kids(c, Math.min(3, Math.ceil(size / 4)));
}

/** Antiquité : bassin, statue, colonnade, cyprès et oliviers, bancs de marbre, amphores, carrés d'herbes */
function antique(c: Ctx) {
  c.out.style = 'antique';
  const g = c.g, size = c.size, ctr = c.center(0.3);
  if (!ctr) return;
  const [x, z] = ctr;
  let basin = false;
  if (size >= 4) {
    for (let k = 0; k < 4 && !basin; k++) {
      const bw = clamp(g.len * 0.45, 0.6, 2.4) * (1 - k * 0.2), bd = clamp(g.wid * 0.4, 0.4, 1.2) * (1 - k * 0.2);
      if (![[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]].every(([a, b]) => { const [px, pz] = c.at(x, z, (a * bw) / 2, (b * bd) / 2); return c.inside(px, pz, 0.08); })) continue;
      basin = true;
      c.put('basin', x, z, c.along, 1, Math.hypot(bw, bd) / 2 + 0.05, { w: bw, d: bd });
      walk(c, x, z, bw / 2 + 0.22, bd / 2 + 0.22);
      // on s'assoit au bord de l'eau
      for (const side of [1, -1]) for (const u of bw > 1.2 ? [-bw / 3, 0, bw / 3] : [-bw / 4, bw / 4]) {
        const [sx, sz] = c.at(x, z, u, side * (bd / 2 + 0.1));
        c.spot(sx, sz, Math.atan2(side * c.sa, -side * c.ca), 'sit');
      }
      if (size >= 9) c.put('statue', x, z, Math.atan2(-c.sa, c.ca), 0.85, 0);
      // colonnades le long du bassin
      if (size >= 10 && g.wid >= 3) for (const side of [1, -1]) {
        const off = bd / 2 + 0.5, n = Math.max(2, Math.round(bw / 0.45) + 1), cols: [number, number][] = [];
        for (let i = 0; i < n; i++) cols.push(c.at(x, z, -bw / 2 + (i * bw) / (n - 1), side * off));
        if (!cols.every(([px, pz]) => c.fits(px, pz, 0.07, 0.08))) continue;
        for (const [px, pz] of cols) c.put('column', px, pz, c.along, 1, 0.08);
        const [mx, mz] = c.at(x, z, 0, side * off);
        c.put('beam', mx, mz, c.along, 1, 0, { w: bw + 0.1 });
      }
    }
  }
  if (!basin) {
    c.put('statue', x, z, c.rnd() * 6.28, 1, 0.2);
    for (let a = 0; a < 6.28; a += 0.45) { const px = x + Math.cos(a) * 0.4, pz = z + Math.sin(a) * 0.4; if (c.inside(px, pz, 0.04)) { c.path(px, pz); c.block(px, pz, 0.12); } }
    for (let i = 0; i < 3; i++) { const a = i * 2.1, sx = x + Math.cos(a) * 0.35, sz = z + Math.sin(a) * 0.35; c.spot(sx, sz, c.face(sx, sz, x, z), 'stroll'); }
  }
  const far = (px: number, pz: number) => -Math.hypot(px - x, pz - z) + c.rnd() * 0.3;
  for (let i = 0; i < Math.min(10, Math.ceil(size / 2.5)); i++) { const p = c.find(0.15, 0.12, far); if (p) c.put('cypress', p[0], p[1], c.rnd() * 6.28, 0.85 + c.rnd() * 0.3, 0.15); }
  for (let i = 0; i < Math.min(10, Math.floor(size / 3)); i++) { const p = c.find(0.3, 0.25); if (p) c.put('olive', p[0], p[1], c.rnd() * 6.28, 0.85 + c.rnd() * 0.3, 0.3); }
  for (let i = 0; i < Math.min(6, Math.floor(size / 4)); i++) {
    const p = c.find(0.2, 0.15, (px, pz) => Math.abs(Math.hypot(px - x, pz - z) - 1.1) + c.rnd() * 0.3);
    if (!p) continue;
    const r = c.face(p[0], p[1], x, z);
    c.put('marblebench', p[0], p[1], r, 1, 0.2);
    c.spot(p[0] + Math.sin(r) * 0.03, p[1] + Math.cos(r) * 0.03, r, 'sit', { seat: 0.075 });
  }
  for (let i = 0; i < Math.min(6, Math.floor(size / 3)); i++) { const p = c.find(0.1, 0.08); if (p) c.put('amphora', p[0], p[1], c.rnd() * 6.28, 0.9 + c.rnd() * 0.2, 0.1); }
  for (let i = 0; i < Math.min(6, Math.floor(size / 5)); i++) { const p = c.find(0.3, 0.25); if (p) c.put('herbbed', p[0], p[1], c.along + (i % 2) * Math.PI / 2, 1, 0.3); }
  if (size >= 6) {
    const p = c.find(0.15, 0.12, (px, pz) => Math.abs(Math.hypot(px - x, pz - z) - 1.5) + c.rnd() * 0.4);
    if (p) { const r = c.face(p[0], p[1], x, z); c.put('altar', p[0], p[1], r, 1, 0.15); c.spot(p[0] + Math.sin(r) * 0.22, p[1] + Math.cos(r) * 0.22, r + Math.PI, 'work'); }
  }
  // la treille : colonnes, poutres et vigne chargée de raisin, un banc à l'ombre
  if (size >= 8) {
    const p = c.find(0.34, 0.3, (px, pz) => -Math.hypot(px - x, pz - z) + c.rnd() * 0.6);
    if (p) { const r = c.face(p[0], p[1], x, z); c.put('pergola', p[0], p[1], r, 1, 0.34); c.spot(p[0], p[1], r, 'sit', { seat: 0.065 }); }
  }
  // grands vases fleuris et rosiers
  for (let i = 0; i < Math.min(6, Math.ceil(size / 4)); i++) { const p = c.find(0.09, 0.07); if (p) c.put('urn', p[0], p[1], c.rnd() * 6.28, 0.9 + c.rnd() * 0.25, 0.09); }
  for (let i = 0; i < Math.min(8, Math.ceil(size / 3)); i++) { const p = c.find(0.1, 0.08); if (p) c.put('rosebush', p[0], p[1], c.rnd() * 6.28, 0.85 + c.rnd() * 0.3, 0.1); }
  strolls(c, Math.min(4, Math.ceil(size / 3)));
  kids(c, Math.min(2, Math.floor(size / 5)));
  tufts(c, Math.min(40, Math.round(size * 1.2)));
}

/** Moyen Âge : tournoi de joute si la zone est longue, sinon lices d'entraînement (quintaine, cibles de tir à l'arc) */
function medieval(c: Ctx) {
  const g = c.g, size = c.size;
  if (g.len >= 4.5 && g.wid >= 2 && size >= 7 && tourney(c)) return;
  c.out.style = 'lices';
  const ctr = c.center(0.25);
  if (!ctr) return;
  const [x, z] = ctr, qr = c.rnd() * 6.28;
  c.put('quintain', x, z, qr, 1, 0.28);
  c.spot(x + Math.sin(qr) * 0.34, z + Math.cos(qr) * 0.34, qr + Math.PI, 'work');
  for (let i = 0; i < clamp(Math.floor(size / 3), size >= 2 ? 1 : 0, 3); i++) {
    const p = c.find(0.15, 0.12, (px, pz) => -Math.hypot(px - x, pz - z) + c.rnd() * 0.5);
    if (!p) continue;
    // la cible regarde le centre ; l'archer se tient en face, à bonne distance
    const r = c.face(p[0], p[1], x, z);
    c.put('target', p[0], p[1], r, 1, 0.15);
    for (const d of [1.1, 0.8, 0.55]) {
      const ax = p[0] + Math.sin(r) * d, az = p[1] + Math.cos(r) * d;
      if (c.inside(ax, az, 0.05)) { c.spot(ax, az, r + Math.PI, 'work'); break; }
    }
  }
  if (size >= 3) { const p = c.find(0.32, 0.28); if (p) c.put('tent', p[0], p[1], c.face(p[0], p[1], x, z), 1, 0.32, { v: Math.floor(c.rnd() * 4) }); }
  for (let i = 0; i < Math.min(5, Math.ceil(size / 2)); i++) { const p = c.find(0.12, 0.1); if (p) c.put('hay', p[0], p[1], c.rnd() * 6.28, 1, 0.12); }
  for (let i = 0; i < Math.min(3, Math.ceil(size / 3)); i++) { const p = c.find(0.08, 0.06); if (p) c.put('banner', p[0], p[1], c.face(p[0], p[1], x, z), 1, 0.08, { v: i % 4 }); }
  if (size >= 4) { const p = c.find(0.16, 0.12); if (p) c.put('weaponrack', p[0], p[1], c.face(p[0], p[1], x, z), 1, 0.16, { v: 0 }); }
  fairground(c, x, z);
  strolls(c, Math.min(3, Math.ceil(size / 3)));
  kids(c, Math.min(2, Math.floor(size / 4)));
  tufts(c, Math.min(20, size));
}

/** Fête autour des lices : palissade ouverte sur les routes, pavillons, échoppes, tonneaux, braseros, guirlandes de fanions */
function fairground(c: Ctx, x: number, z: number) {
  const size = c.size, g = c.g, w = c.w, D = (px: number, pz: number) => Math.hypot(px - x, pz - z);
  // palissade de bois le long du bord du jardin, ouverte sur les routes et çà et là
  for (const k of g.cells) {
    const cx = k % N, cz = Math.floor(k / N);
    for (const [dx, dz] of D4) {
      const nx = cx + dx, nz = cz + dz, nk = nz * N + nx;
      if (g.set.has(nk) || (w.inCells(nx, nz) && w.road[nk]) || c.rnd() < 0.12) continue;
      c.put('fence', cx + 0.5 + dx * 0.43, cz + 0.5 + dz * 0.43, dx ? Math.PI / 2 : 0, 1, 0, { w: 1 });
    }
  }
  // pavillons des chevaliers et des visiteurs, plutôt vers le bord
  for (let i = 0; i < Math.floor(size / 7); i++) {
    const p = c.find(0.3, 0.26, (px, pz) => -D(px, pz) + c.rnd());
    if (p) c.put('tent', p[0], p[1], c.face(p[0], p[1], x, z), 1, 0.3, { v: 2 + (i % 2) });
  }
  // échoppes : le marchand derrière l'étal, un client devant
  for (let i = 0; i < 1 + Math.floor(size / 12); i++) {
    const p = c.find(0.24, 0.2, (px, pz) => Math.abs(D(px, pz) - 1.4) + c.rnd() * 0.6);
    if (!p) continue;
    const r = c.face(p[0], p[1], x, z);
    c.put('stall', p[0], p[1], r, 1, 0.24, { v: i });
    c.spot(p[0] - Math.sin(r) * 0.15, p[1] - Math.cos(r) * 0.15, r, 'work');
    c.spot(p[0] + Math.sin(r) * 0.3, p[1] + Math.cos(r) * 0.3, r + Math.PI, 'stroll');
  }
  for (let i = 0; i < Math.floor(size / 6); i++) { const p = c.find(0.12, 0.1); if (p) c.put('barrels', p[0], p[1], c.rnd() * 6.28, 1, 0.12); }
  // braseros, allumés la nuit
  for (let i = 0; i < Math.min(4, 1 + Math.floor(size / 8)); i++) {
    const p = c.find(0.1, 0.1, (px, pz) => Math.abs(D(px, pz) - 1.1) + c.rnd() * 0.8);
    if (p) c.put('brazier', p[0], p[1], 0, 1, 0.1);
  }
  // guirlandes de fanions tendues entre deux mâts
  for (let i = 0; i < Math.min(4, Math.floor(size / 6)); i++) {
    const p = c.find(0.15, 0.12);
    if (!p) continue;
    const r = c.rnd() * 6.28, hl = 0.55, ends = [-1, 1].map((s) => [p[0] + Math.cos(r) * hl * s, p[1] - Math.sin(r) * hl * s]);
    if (!ends.every(([ex, ez]) => c.fits(ex, ez, 0.05, 0.05))) continue;
    c.put('bunting', p[0], p[1], r, 1, 0, { w: hl * 2, v: i });
    for (const [ex, ez] of ends) c.block(ex, ez, 0.06);
  }
}

/** Tournoi : lice au milieu, deux chevaliers qui chargent, tentes aux deux bouts, gradins et bannières de part et d'autre */
function tourney(c: Ctx) {
  const ctr = c.center(0.5);
  if (!ctr) return false;
  const [x, z] = ctr;
  // longueur libre de chaque côté du centre, couloir de joute compris
  const reach = (s: number) => {
    let d = 0;
    const ok = (u: number) => [0, 0.45, -0.45].every((v) => { const [px, pz] = c.at(x, z, s * u, v); return c.inside(px, pz, v ? 0.05 : 0.3); });
    while (d < 4 && ok(d + 0.1)) d += 0.1;
    return d;
  };
  const half = Math.min(reach(1), reach(-1), 3.2) - 0.45;
  if (half < 1.1) return false;
  c.out.style = 'tournoi';
  // la lice et les gradins par tronçons, qui suivent le terrain
  const nSeg = Math.max(1, Math.round((half * 2) / 0.75)), segL = (half * 2) / nSeg;
  for (let i = 0; i < nSeg; i++) { const [px, pz] = c.at(x, z, -half + (i + 0.5) * segL, 0); c.put('tilt', px, pz, c.along, 1, 0, { w: segL }); }
  for (let u = -half - 0.45; u <= half + 0.45; u += 0.3) { const [px, pz] = c.at(x, z, u, 0); c.block(px, pz, 0.42); }
  const [x0, z0] = c.at(x, z, -half - 0.15, 0), [x1, z1] = c.at(x, z, half + 0.15, 0);
  c.out.lanes.push(x0, z0, x1, z1);
  // tentes des deux champions, aux couleurs de chacun
  for (const s of [-1, 1]) {
    const [tx, tz] = c.at(x, z, s * (half + 0.75), s * 0.35);
    const p = c.find(0.3, 0.26, (px, pz) => Math.hypot(px - tx, pz - tz));
    if (p) c.put('tent', p[0], p[1], c.face(p[0], p[1], x, z), 1, 0.3, { v: s < 0 ? 0 : 1 });
  }
  // gradins d'un côté s'il y a la place, sinon des spectateurs debout ; bannières de l'autre côté
  const toLane = (side: number) => Math.atan2(side * c.sa, -side * c.ca);
  let stand = 0;
  for (const side of [1, -1]) {
    const sl = Math.min(half * 1.4, 2.4);
    const corners = [[-sl / 2, 0.68], [sl / 2, 0.68], [-sl / 2, 1.02], [sl / 2, 1.02], [0, 0.85]].map(([u, v]) => c.at(x, z, u, side * v));
    if (!corners.every(([px, pz]) => c.fits(px, pz, 0.08, 0.04))) continue;
    const nS = Math.max(1, Math.round(sl / 0.8)), sw = sl / nS, col = Math.floor(c.rnd() * 4);
    for (let i = 0; i < nS; i++) { const [sx, sz] = c.at(x, z, -sl / 2 + (i + 0.5) * sw, side * 0.85); c.put('stand', sx, sz, toLane(side), 1, 0, { w: sw, v: col }); }
    for (const [px, pz] of corners) c.block(px, pz, 0.25);
    for (let u = -sl / 2 + 0.14; u <= sl / 2 - 0.13; u += 0.2) {
      const [ax, az] = c.at(x, z, u, side * 0.79), [bx, bz] = c.at(x, z, u + 0.1, side * 0.91);
      c.spot(ax, az, toLane(side), 'cheer', { seat: 0.05 });
      if (u + 0.1 < sl / 2 - 0.1) c.spot(bx, bz, toLane(side), 'cheer', { seat: 0.1 });
    }
    stand = side;
    break;
  }
  const other = stand ? -stand : -1;
  for (let u = -half + 0.2; u <= half - 0.2; u += 0.9) {
    const [bx, bz] = c.at(x, z, u, other * 0.72);
    if (c.fits(bx, bz, 0.08, 0.05)) c.put('banner', bx, bz, toLane(other), 1, 0.08, { v: Math.floor(Math.abs(u) * 3) % 4 });
  }
  for (let u = -half + 0.3; u <= half - 0.2; u += 0.35) {
    const [sx, sz] = c.at(x, z, u + 0.15, other * 0.52);
    c.spot(sx, sz, toLane(other), 'cheer');
    if (!stand) { const [tx, tz] = c.at(x, z, u, -other * 0.52); c.spot(tx, tz, toLane(-other), 'cheer'); }
  }
  for (let i = 0; i < Math.min(6, Math.floor(c.size / 4)); i++) { const p = c.find(0.12, 0.1); if (p) c.put('hay', p[0], p[1], c.rnd() * 6.28, 1, 0.12); }
  for (let i = 0; i < 2; i++) { const p = c.find(0.16, 0.12); if (p) c.put('weaponrack', p[0], p[1], c.face(p[0], p[1], x, z), 1, 0.16, { v: i }); }
  fairground(c, x, z);
  kids(c, Math.min(4, Math.floor(c.size / 4)));
  tufts(c, Math.min(20, c.size));
  return true;
}

/** Âge industriel, jardin à la française : allées en croix, fontaine au centre, parterres bordés de buis, topiaires, statues */
function french(c: Ctx) {
  c.out.style = 'francais';
  const size = c.size, sp = size > 60 ? 0.3 : 0.22, pw = 0.15;
  const br = clamp(Math.sqrt(size) * 0.11, 0.28, 0.6), plaza = br + 0.42;
  const ctr = c.center(br) ?? c.center(0.1);
  if (!ctr) return;
  const [x0, z0] = ctr;
  c.put('fountain', x0, z0, c.along, br / 0.3, br + 0.1);
  // topiaires et réverbères aux coins de la place et le long de l'allée principale
  const keep: [number, number, string][] = [];
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    keep.push([(su * (plaza + 0.12)) / Math.SQRT2, (sv * (plaza + 0.12)) / Math.SQRT2, 'topiary']);
    keep.push([su * (plaza + 0.04), sv * (pw + 0.09), 'gaslamp']);
  }
  for (let u = plaza + 0.6; u < 6; u += 1.1) for (const su of [1, -1]) for (const sv of [1, -1]) keep.push([su * u, sv * (pw + 0.13), 'topiary']);
  let ti = 0;
  for (const [u, v, k] of keep) {
    const [x, z] = c.at(x0, z0, u, v);
    if (!c.inside(x, z, 0.1)) continue;
    c.put(k, x, z, c.along, 1, 0.06, { v: k === 'topiary' ? ti++ % 2 : 0 });
  }
  const reserved = (u: number, v: number) => keep.some(([ku, kv]) => Math.hypot(ku - u, kv - v) < 0.14);
  // grille tournée selon l'axe du jardin, centrée sur la fontaine
  const ext = Math.ceil(Math.max(c.g.len, c.g.wid) / sp) + 2;
  for (let iu = -ext; iu <= ext; iu++) for (let iv = -ext; iv <= ext; iv++) {
    const u = iu * sp, v = iv * sp, [x, z] = c.at(x0, z0, u, v);
    if (!c.inside(x, z, 0.05)) continue;
    const d = Math.hypot(u, v);
    if (d < br + 0.06) continue;
    if (d < plaza || Math.abs(u) < pw || Math.abs(v) < pw) { c.path(x, z); continue; }
    if (reserved(u, v)) continue;
    const e = Math.min(Math.abs(u) - pw, Math.abs(v) - pw, d - plaza);
    // bordure de buis le long des allées, autour de la place et au bord du jardin
    if (e < sp * 0.95 || !c.inside(x, z, sp * 0.9)) { c.put('hedge', x, z, c.along, 1, 0); continue; }
    // broderie : des motifs de fleurs dans les carrés
    const m = (Math.abs(iu) + Math.abs(iv) * 2) % 4;
    if (m === 0) c.put('fl', x, z, c.rnd() * 6.28, 1, 0, { v: Math.abs(iu * 7 + iv * 3) % 5 });
    else if (m === 2 && (iu + iv) % 2 === 0) c.put('lowbox', x, z, 0, 1, 0);
    else if (m === 2) c.put('fl', x, z, c.rnd() * 6.28, 0.85, 0, { v: Math.abs(iu * 3 + iv * 7) % 5 });
  }
  // bancs sur la place, tournés vers la fontaine ; statues au bout des allées
  for (const a of [0.785, 2.356, 3.927, 5.498]) {
    const [x, z] = c.at(x0, z0, Math.cos(a) * (br + 0.27), Math.sin(a) * (br + 0.27));
    if (!c.inside(x, z, 0.1)) continue;
    const r = c.face(x, z, x0, z0);
    c.put('bench', x, z, r, 1, 0);
    c.spot(x + Math.sin(r) * 0.03, z + Math.cos(r) * 0.03, r, 'sit', { seat: 0.065 });
  }
  for (const [su, sv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let far = 0;
    for (let d = plaza; d < 8; d += 0.1) { const [x, z] = c.at(x0, z0, su * d, sv * d); if (c.inside(x, z, 0.18)) far = d; else break; }
    if (far < plaza + 0.8) continue;
    const [x, z] = c.at(x0, z0, su * far, sv * far);
    c.put('statue', x, z, c.face(x, z, x0, z0), 0.8, 0.15);
  }
  const p = c.out.paths;
  for (let i = 0; i < Math.min(6, Math.ceil(size / 3)); i++) {
    const j = Math.floor(c.rnd() * (p.length / 2)) * 2;
    if (p.length) c.spot(p[j], p[j + 1], c.rnd() * 6.28, 'stroll');
  }
  for (let i = 0; i < 2; i++) { const a = c.rnd() * 6.28; c.spot(x0 + Math.cos(a) * (br + 0.2), z0 + Math.sin(a) * (br + 0.2), a, 'run', { kid: true }); }
}

/**
 * Jardin à l'anglaise (âge industriel) ou parc (moderne) : allée sinueuse, pelouse, bosquets d'arbres, massifs de fleurs, bancs
 * et réverbères le long de l'allée ; étang et kiosque au jardin, fontaine et tables de pique-nique au parc
 */
function lawn(c: Ctx, modern: boolean) {
  if (!c.out.style) c.out.style = modern ? 'parc' : 'anglais';
  const size = c.size, g = c.g;
  // allée : d'un bout à l'autre le long de l'axe, par quelques points tirés au hasard en travers, lissée
  const wp: [number, number][] = [];
  const nW = clamp(Math.round(g.len / 1.6), 2, 7);
  for (let i = 0; i < nW; i++) {
    const u = -g.len / 2 + 0.5 + ((g.len - 1) * i) / (nW - 1), tv = (c.rnd() - 0.5) * g.wid * 0.5;
    const p = c.find(0.25, 0.25, (x, z) => { const du = (x - g.cx) * c.ca + (z - g.cz) * c.sa - u, dv = -(x - g.cx) * c.sa + (z - g.cz) * c.ca; return Math.abs(du) * 3 + Math.abs(dv - tv); });
    if (p && !wp.some(([a, b]) => Math.hypot(a - p[0], b - p[1]) < 0.8)) wp.push(p);
  }
  const STEP = 0.1, along: [number, number, number][] = [];
  if (size >= 3 && wp.length >= 2) {
    let acc = STEP, px = wp[0][0], pz = wp[0][1];
    for (let i = 0; i < wp.length - 1; i++) {
      const p0 = wp[Math.max(0, i - 1)], p1 = wp[i], p2 = wp[i + 1], p3 = wp[Math.min(wp.length - 1, i + 2)];
      for (let t = 0.02; t <= 1.001; t += 0.02) {
        const t2 = t * t, t3 = t2 * t;
        const cr = (a: number, b: number, d: number, e: number) => 0.5 * (2 * b + (-a + d) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (-a + 3 * b - 3 * d + e) * t3);
        const x = cr(p0[0], p1[0], p2[0], p3[0]), z = cr(p0[1], p1[1], p2[1], p3[1]);
        acc += Math.hypot(x - px, z - pz);
        const dir = Math.atan2(x - px, z - pz);
        px = x; pz = z;
        if (acc < STEP) continue;
        acc = 0;
        // l'allée s'arrête au bord de l'aire de jeux
        if (!c.fits(x, z, 0.02, 0.04)) continue;
        c.path(x, z);
        along.push([x, z, dir]);
      }
    }
    for (const [x, z] of along) c.block(x, z, 0.14);
  }
  // le long de l'allée : bancs d'un côté, réverbères de l'autre
  const every = (d: number, period: number, off = 0) => Math.floor((d + off) / period) !== Math.floor((d + off - STEP) / period);
  for (let i = 1; i < along.length; i++) {
    const dist = i * STEP, [x, z, dir] = along[i], nx = Math.cos(dir), nz = -Math.sin(dir);
    if (every(dist, 1.7)) {
      const s = i % 2 ? 1 : -1, bx = x + nx * s * 0.33, bz = z + nz * s * 0.33;
      if (c.fits(bx, bz, 0.13, 0.08)) {
        const r = c.face(bx, bz, x, z);
        c.put('bench', bx, bz, r, 1, 0.15, { v: modern ? 1 : 0 });
        c.spot(bx + Math.sin(r) * 0.03, bz + Math.cos(r) * 0.03, r, 'sit', { seat: 0.065 });
        if (modern) { const tx = bx + Math.sin(dir) * 0.2, tz = bz + Math.cos(dir) * 0.2; if (c.fits(tx, tz, 0.05, 0.03)) c.put('bin', tx, tz, r, 1, 0.05); }
      }
    }
    if (every(dist, 2.3, 0.9)) {
      const s = i % 2 ? -1 : 1, lx = x + nx * s * 0.21, lz = z + nz * s * 0.21;
      if (c.fits(lx, lz, 0.05, 0.04)) c.put(modern ? 'lamp' : 'gaslamp', lx, lz, dir, 1, 0.05);
    }
  }
  // arches de rosiers qui enjambent l'allée
  if (along.length > 14) for (const f of modern ? [0.5] : [0.3, 0.7]) {
    const [x, z, dir] = along[Math.floor(along.length * f)];
    c.put('arch', x, z, dir, 1, 0, { v: modern ? 1 : 0 });
  }
  // l'étang, ses canards et, au jardin à l'anglaise, le saule pleureur penché sur l'eau
  if (size >= (modern ? 12 : 8)) {
    const p = c.find(0.55, 0.5, (x, z) => c.slope(x, z) + c.rnd() * 0.08);
    if (p) {
      const s = clamp(Math.sqrt(size) / 4, 0.85, 1.4);
      c.put('pond', p[0], p[1], c.rnd() * 6.28, s, 0.62 * s);
      for (let i = 0; i < 2; i++) { const a = c.rnd() * 6.28, sx = p[0] + Math.cos(a) * 0.68 * s, sz = p[1] + Math.sin(a) * 0.68 * s; c.spot(sx, sz, c.face(sx, sz, p[0], p[1]), 'stroll'); }
      if (!modern) { const q = c.find(0.26, 0.2, (x, z) => Math.abs(Math.hypot(x - p[0], z - p[1]) - 0.75 * s)); if (q) c.put('willow', q[0], q[1], c.face(q[0], q[1], p[0], p[1]), 1, 0.26); }
    }
  }
  if (!modern) {
    if (size >= 10) { const p = c.find(0.42, 0.38); if (p) { c.put('kiosk', p[0], p[1], c.rnd() * 6.28, 1, 0.42); c.spot(p[0] + 0.08, p[1], c.rnd() * 6.28, 'stroll', { seat: 0.05 }); } }
    if (size >= 18) { const p = c.find(0.38, 0.34); if (p) c.put('folly', p[0], p[1], c.rnd() * 6.28, 1, 0.38); }
  } else {
    if (size >= 14) { const p = c.find(0.5, 0.45); if (p) { c.put('fountain4', p[0], p[1], c.along, 1, 0.5); const a = c.rnd() * 6.28; c.spot(p[0] + Math.cos(a) * 0.55, p[1] + Math.sin(a) * 0.55, a + Math.PI, 'stroll'); } }
    for (let i = 0; i < Math.min(3, Math.floor(size / 8)); i++) {
      const p = c.find(0.3, 0.25);
      if (!p) continue;
      const r = c.rnd() * 6.28;
      c.put('picnic', p[0], p[1], r, 1, 0.3);
      for (const s of [1, -1]) c.spot(p[0] + Math.sin(r) * s * 0.13, p[1] + Math.cos(r) * s * 0.13, r + (s > 0 ? Math.PI : 0), 'sit', { seat: 0.06 });
    }
    // le marchand de glaces et son client ; des prés de fleurs sauvages laissés en friche
    if (size >= 10) {
      const p = c.find(0.2, 0.16, along.length ? (x, z) => Math.min(...along.filter((_, i) => i % 4 === 0).map(([ax, az]) => Math.abs(Math.hypot(x - ax, z - az) - 0.3))) : undefined);
      if (p) { const r = c.rnd() * 6.28; c.put('icecream', p[0], p[1], r, 1, 0.2); c.spot(p[0] - Math.sin(r) * 0.14, p[1] - Math.cos(r) * 0.14, r, 'work'); c.spot(p[0] + Math.sin(r) * 0.2, p[1] + Math.cos(r) * 0.2, r + Math.PI, 'stroll'); }
    }
    for (let i = 0; i < Math.min(5, Math.floor(size / 6)); i++) { const p = c.find(0.3, 0.24); if (p) c.put('meadow', p[0], p[1], c.rnd() * 6.28, 0.9 + c.rnd() * 0.3, 0.3); }
  }
  // bosquets : la moitié des arbres près d'un autre
  const trees: [number, number][] = [];
  const nT = clamp(Math.round(size / (modern ? 2 : 2.4)), 1, 30);
  for (let i = 0; i < nT; i++) {
    const near = trees.length && i % 2 ? trees[Math.floor(c.rnd() * trees.length)] : null;
    const p = c.find(0.3, 0.22, near ? (x, z) => Math.abs(Math.hypot(x - near[0], z - near[1]) - 0.65) + c.rnd() * 0.2 : undefined);
    if (!p) break;
    trees.push(p);
    c.put('tree', p[0], p[1], c.rnd() * 6.28, 0.8 + c.rnd() * 0.45, 0.3, { v: Math.floor(c.rnd() * 3) });
  }
  for (let i = 0; i < clamp(Math.round(size / 2), 1, 30); i++) { const p = c.find(0.12, 0.1); if (p) c.put('bush', p[0], p[1], c.rnd() * 6.28, 0.8 + c.rnd() * 0.5, 0.12); }
  for (let i = 0; i < clamp(Math.round(size / 3), 0, 14); i++) { const p = c.find(0.24, 0.2); if (p) c.put('bed', p[0], p[1], c.rnd() * 6.28, 0.9 + c.rnd() * 0.3, 0.24); }
  for (let i = 0; i < Math.min(6, Math.ceil(size / 3)) && along.length; i++) {
    const [x, z, dir] = along[Math.floor(c.rnd() * along.length)];
    c.spot(x, z, dir + (c.rnd() < 0.5 ? 0 : Math.PI), 'stroll');
  }
  kids(c, Math.min(3, Math.ceil(size / 5)));
  tufts(c, Math.min(50, Math.round(size * 1.5)));
}

/** Époque moderne : un vrai parc, aire de jeux (toboggan, balançoires, tourniquet…) au milieu des arbres */
function park(c: Ctx) {
  c.out.style = 'parc';
  const size = c.size;
  const eq = ['slide'];
  if (size >= 2) eq.push('spring');
  if (size >= 3) eq.push('swings');
  if (size >= 4) eq.push('seesaw');
  if (size >= 5) eq.push('sandbox');
  if (size >= 7) eq.push('roundabout');
  if (size >= 9) eq.push('climber');
  if (size >= 12) eq.push('spring');
  if (size >= 16) eq.push('swings');
  const RAD: Record<string, number> = { slide: 0.3, spring: 0.12, swings: 0.32, seesaw: 0.3, sandbox: 0.27, roundabout: 0.26, climber: 0.3 };
  const ctr = c.center(0.35);
  if (ctr) {
    const [x, z] = ctr;
    let pr = clamp(0.3 + 0.2 * eq.length, 0.45, 1.5);
    while (pr > 0.35 && !c.inside(x, z, pr)) pr -= 0.05;
    // sol souple sous les jeux
    c.put('pad', x, z, c.rnd() * 6.28, pr, 0, { v: Math.floor(c.rnd() * 2) });
    for (const e of eq) {
      const r = RAD[e], p = c.find(r, r * 0.7, (px, pz) => Math.hypot(px - x, pz - z) + c.rnd() * 0.15);
      if (!p) continue;
      const rot = c.along + Math.floor(c.rnd() * 4) * (Math.PI / 2);
      c.put(e, p[0], p[1], rot, 1, r);
      // les enfants jouent devant (ou de part et d'autre de la balançoire, de la bascule)
      const fronts = e === 'swings' ? [[-0.09, r + 0.05], [0.09, r + 0.05]] : e === 'seesaw' ? [[0, r + 0.04], [0, -r - 0.04]] : [[0, r + 0.06]];
      for (const [lx, lz] of fronts) {
        const sx = p[0] + lx * Math.cos(rot) + lz * Math.sin(rot), sz = p[1] - lx * Math.sin(rot) + lz * Math.cos(rot);
        c.spot(sx, sz, c.face(sx, sz, p[0], p[1]), 'play', { kid: true });
      }
    }
    // l'aire de jeux est à elle : ni allée, ni arbre, ni fontaine dessus
    c.block(x, z, pr + 0.05);
  }
  lawn(c, true);
}

/**
 * Âge futuriste : un jardin bioluminescent, rien de commun avec le parc moderne. Au milieu, la serre-dôme de verre et ses
 * plantes qui luisent ; autour, allées de lumière en rayons et en anneau, bornes lumineuses ; arbres-lumière, massifs
 * hexagonaux aux fleurs phosphorescentes que soignent des drones-jardiniers, jardinières qui flottent, bassin anti-gravité
 * (une bulle d'eau suspendue dans ses anneaux), bancs-cocons, trampoline lumineux et gyroscope pour les enfants
 */
function future(c: Ctx) {
  c.out.style = 'futur';
  const size = c.size;
  const ctr = c.center(size >= 6 ? 0.6 : 0.25) ?? c.center(0.15);
  if (!ctr) return;
  const [x, z] = ctr, D = (px: number, pz: number) => Math.hypot(px - x, pz - z);
  // la serre-dôme sur un grand jardin, sinon un grand arbre-lumière
  let core = 0.22;
  let s = clamp(Math.sqrt(size) / 4, 0.75, 1.4);
  while (s > 0.62 && !c.inside(x, z, 0.68 * s)) s -= 0.04;
  if (size >= 6 && s > 0.62) {
    core = 0.68 * s;
    c.put('dome', x, z, c.along, s, core + 0.04);
    // on y flâne entre les plantes, sous le verre
    c.spot(x + 0.28 * s, z + 0.1 * s, 1.2, 'stroll');
  } else c.put('lighttree', x, z, c.rnd() * 6.28, 1.35, 0.24, { v: 0 });
  // l'anneau de lumière autour, puis les allées en rayons jusqu'au bord, bordées de bornes lumineuses
  const ring = core + 0.2, step = 0.2;
  for (let a = 0; a < Math.PI * 2 - 1e-3; a += step / ring) {
    const px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
    if (c.inside(px, pz, 0.04)) { c.path(px, pz); c.block(px, pz, 0.1); }
  }
  for (const [su, sv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = ring + step, i = 0; d < 9; d += step, i++) {
    const [px, pz] = c.at(x, z, su * d, sv * d);
    if (!c.inside(px, pz, 0.04)) break;
    c.path(px, pz);
    c.block(px, pz, 0.1);
    if (i % 3 === 1) for (const side of [1, -1]) {
      const [lx, lz] = c.at(px, pz, -sv * side * 0.18, su * side * 0.18);
      if (c.fits(lx, lz, 0.03, 0.03)) c.put('pathlight', lx, lz, 0, 1, 0.04, { v: Math.abs(i) % 4 });
    }
  }
  // les bancs-cocons sur l'anneau, tournés vers le dôme
  for (const a of [0.785, 2.356, 3.927, 5.498]) {
    const [bx, bz] = c.at(x, z, Math.cos(a) * (ring + 0.24), Math.sin(a) * (ring + 0.24));
    if (!c.fits(bx, bz, 0.12, 0.08)) continue;
    const r = c.face(bx, bz, x, z);
    c.put('podbench', bx, bz, r, 1, 0.13, { v: Math.floor(a) % 4 });
    c.spot(bx + Math.sin(r) * 0.03, bz + Math.cos(r) * 0.03, r, 'sit', { seat: 0.065 });
  }
  // le bassin anti-gravité : on s'arrête autour pour regarder la bulle d'eau qui flotte
  if (size >= 10) {
    const p = c.find(0.5, 0.45, (px, pz) => Math.abs(D(px, pz) - (core + 1.3)) + c.rnd() * 0.3);
    if (p) {
      c.put('gravpool', p[0], p[1], c.rnd() * 6.28, 1, 0.52);
      for (let i = 0; i < 2; i++) { const a = c.rnd() * 6.28, sx = p[0] + Math.cos(a) * 0.56, sz = p[1] + Math.sin(a) * 0.56; c.spot(sx, sz, c.face(sx, sz, p[0], p[1]), 'stroll'); }
    }
  }
  // le trampoline lumineux et le gyroscope des enfants
  const play = size >= 9 ? ['hoverpad', 'gyro'] : size >= 4 ? ['hoverpad'] : [];
  for (const k of play) {
    const r = k === 'gyro' ? 0.26 : 0.28, p = c.find(r, r * 0.85, (px, pz) => Math.abs(D(px, pz) - (core + 0.9)) + c.rnd() * 0.4);
    if (!p) continue;
    c.put(k, p[0], p[1], c.rnd() * 6.28, 1, r, { v: Math.floor(c.rnd() * 4) });
    for (let i = 0; i < 2; i++) { const a = c.rnd() * 6.28, sx = p[0] + Math.cos(a) * (r + 0.05), sz = p[1] + Math.sin(a) * (r + 0.05); c.spot(sx, sz, c.face(sx, sz, p[0], p[1]), 'play', { kid: true }); }
  }
  // massifs hexagonaux phosphorescents ; les drones-jardiniers tournent au-dessus des premiers
  const beds: [number, number][] = [];
  for (let i = 0; i < clamp(Math.floor(size / 4), size >= 3 ? 1 : 0, 10); i++) {
    const p = c.find(0.22, 0.18);
    if (!p) continue;
    beds.push(p);
    c.put('hexbed', p[0], p[1], c.rnd() * 6.28, 0.9 + c.rnd() * 0.25, 0.22, { v: i % 4 });
  }
  for (let i = 0; i < Math.min(3, Math.ceil(beds.length / 2)); i++) c.put('drone', beds[i][0], beds[i][1], c.rnd() * 6.28, 1, 0, { v: i });
  // les jardinières qui flottent
  for (let i = 0; i < (size >= 8 ? Math.min(4, Math.floor(size / 8)) : 0); i++) { const p = c.find(0.18, 0.15); if (p) c.put('floater', p[0], p[1], c.rnd() * 6.28, 1, 0.18, { v: i % 4 }); }
  // les arbres-lumière, en bosquets
  const trees: [number, number][] = [];
  for (let i = 0; i < clamp(Math.round(size / 2.6), 1, 18); i++) {
    const near = trees.length && i % 2 ? trees[Math.floor(c.rnd() * trees.length)] : null;
    const p = c.find(0.2, 0.15, near ? (px, pz) => Math.abs(Math.hypot(px - near[0], pz - near[1]) - 0.5) + c.rnd() * 0.2 : undefined);
    if (!p) break;
    trees.push(p);
    c.put('lighttree', p[0], p[1], c.rnd() * 6.28, 0.8 + c.rnd() * 0.4, 0.2, { v: i % 4 });
  }
  // buissons de cristal, herbes lumineuses
  for (let i = 0; i < clamp(Math.round(size / 3), 0, 14); i++) { const p = c.find(0.1, 0.08); if (p) c.put('crystal', p[0], p[1], c.rnd() * 6.28, 0.8 + c.rnd() * 0.5, 0.1, { v: i % 4 }); }
  const p = c.out.paths;
  for (let i = 0; i < Math.min(6, Math.ceil(size / 3)) && p.length; i++) { const j = Math.floor(c.rnd() * (p.length / 2)) * 2; c.spot(p[j], p[j + 1], c.rnd() * 6.28, 'stroll'); }
  strolls(c, Math.min(3, Math.ceil(size / 5)));
  kids(c, Math.min(2, Math.floor(size / 6)));
  tufts(c, Math.min(45, Math.round(size * 1.3)), 'glowgrass');
}

/**
 * Allée de gravier autour d'un rectangle (demi-côtés hw, hd) centré en (x, z), puis le long de l'axe jusqu'aux bords du jardin,
 * bordée de cyprès
 */
function walk(c: Ctx, x: number, z: number, hw: number, hd: number) {
  const tile = (u: number, v: number) => { const [px, pz] = c.at(x, z, u, v); if (c.inside(px, pz, 0.04)) { c.path(px, pz); c.block(px, pz, 0.12); } };
  for (let u = -hw; u <= hw + 1e-6; u += 0.2) { tile(u, hd); tile(u, -hd); }
  for (let v = -hd + 0.2; v < hd - 0.1; v += 0.2) { tile(hw, v); tile(-hw, v); }
  for (const su of [1, -1]) for (let u = hw + 0.2, i = 0; u < 8; u += 0.2, i++) {
    const [px, pz] = c.at(x, z, su * u, 0);
    if (!c.inside(px, pz, 0.04)) break;
    tile(su * u, 0);
    if (i % 3 === 1) for (const sv of [1, -1]) { const [tx, tz] = c.at(x, z, su * u, sv * 0.36); if (c.fits(tx, tz, 0.12, 0.1)) c.put('cypress', tx, tz, c.rnd() * 6.28, 0.9 + c.rnd() * 0.2, 0.12); }
  }
}

/** Promenade : quelques places debout */
function strolls(c: Ctx, n: number) {
  for (let i = 0; i < n; i++) { const p = c.find(0.2, 0.15); if (p) c.spot(p[0], p[1], c.rnd() * 6.28, 'stroll'); }
}

/** Les enfants courent sur l'herbe dégagée */
function kids(c: Ctx, n: number) {
  for (let i = 0; i < n; i++) { const p = c.find(0.35, 0.3); if (p) c.spot(p[0], p[1], c.rnd() * 6.28, 'run', { kid: true }); }
}
