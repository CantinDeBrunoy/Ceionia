import type { BaseKind } from '../sim/hell';
import type { War } from '../sim/war';
import type { HellBase } from '../sim/hellBase';
import { BASE_DEFS, costText } from '../sim/hellBase';
import { Heap } from '../sim/agents';
import { tr } from '../i18n';

/**
 * La pose des murs de la base avancée (palissades, portes), sur le modèle de la route libre du village : un clic au point A,
 * un clic au point B (ou un glissé de A à B), et la palissade se pose d'un trait de l'un à l'autre, sur une ligne LIBRE (droite
 * ou diagonale) ; B devient le point A du mur suivant. Les cases se raccordent par les côtés (une diagonale est un escalier :
 * aucun démon ne s'y glisse). La paroi, la lave et les bâtiments sur la ligne ferment d'eux-mêmes : le tracé les saute. Un bout
 * lâché à une ou deux cases d'une paroi (ou de la lave, d'un bâtiment, d'un mur) s'y accroche, pour ne pas laisser de trou. Un
 * aperçu montre tout le tracé, case par case (vert : on peut ; rouge vif : la case qui refuse ; rouge sombre : le reste d'un
 * tracé refusé), avec ce qu'il coûte. Ce fichier ne sait rien de l'écran : l'interface lui donne les points du sol
 */

export type Cell = [number, number];
export interface GhostCell { x: number; z: number; ok: boolean; /** une porte, pas un pan */ gate?: boolean; /** refusée à cause d'une autre case (rouge sombre) */ dim?: boolean }

/** Les bâtiments qui se posent comme des murs (aperçu raccordé) */
export const isWallKind = (k: BaseKind | null): k is 'palisade' | 'gate' => k === 'palisade' || k === 'gate';
/** …et ceux qui se tracent en ligne (de A à B) */
export const isLineKind = (k: BaseKind | null): k is 'palisade' => k === 'palisade';

/** Un point du sol → le centre de sa case */
export const cellOf = (p: [number, number]): Cell => [Math.floor(p[0]) + 0.5, Math.floor(p[1]) + 0.5];

/** Longueur maximale d'un mur tracé d'un coup (cases) */
export const WALL_MAX = 40;
/** Marge de terrain fouillée autour de A et B pour contourner un obstacle */
const MARGIN = 12;
/** Jusqu'où un bout du mur va chercher la paroi pour s'y accrocher (cases) */
export const SNAP = 2;

/**
 * Les centres des cases d'une ligne droite LIBRE de `a` à `b` (a et b compris), raccordées par les côtés : la ligne idéale
 * est suivie au plus près, en escalier si elle est en diagonale
 */
export function wallLine(a: Cell, b: Cell): Cell[] {
  const dx = Math.round(b[0] - a[0]), dz = Math.round(b[1] - a[1]), nx = Math.abs(dx), nz = Math.abs(dz), sx = Math.sign(dx), sz = Math.sign(dz);
  const out: Cell[] = [[a[0], a[1]]];
  let x = a[0], z = a[1];
  for (let ix = 0, iz = 0; ix < nx || iz < nz;) {
    if ((0.5 + ix) * nz < (0.5 + iz) * nx) { x += sx; ix++; } else { z += sz; iz++; }
    out.push([x, z]);
  }
  return out;
}

/**
 * Le chemin le plus court de `a` à `b` par des cases où un mur peut passer (A*, par les côtés) : le tracé qui contourne
 * lave, parois et bâtiments. null : aucun passage
 */
export function wallRoute(base: HellBase, a: Cell, b: Cell): Cell[] | null {
  const walls = base.wallCellSet();
  const ax = Math.floor(a[0]), az = Math.floor(a[1]), bx = Math.floor(b[0]), bz = Math.floor(b[1]);
  const lx = Math.min(ax, bx) - MARGIN, hx = Math.max(ax, bx) + MARGIN, lz = Math.min(az, bz) - MARGIN, hz = Math.max(az, bz) + MARGIN;
  const W = hx - lx + 1, H = hz - lz + 1, id = (x: number, z: number) => (z - lz) * W + (x - lx);
  const open = new Int8Array(W * H);
  const okAt = (x: number, z: number) => {
    if (x < lx || x > hx || z < lz || z > hz) return false;
    const i = id(x, z);
    if (!open[i]) open[i] = base.wallOk(x, z, walls) ? 1 : -1;
    return open[i] > 0;
  };
  if (!okAt(ax, az) || !okAt(bx, bz)) return null;
  const dist = new Float32Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1), heap = new Heap();
  const h = (x: number, z: number) => Math.abs(x - bx) + Math.abs(z - bz);
  dist[id(ax, az)] = 0;
  heap.push(h(ax, az), id(ax, az));
  while (heap.size) {
    const c = heap.pop(), x = (c % W) + lx, z = Math.floor(c / W) + lz;
    if (x === bx && z === bz) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!okAt(nx, nz)) continue;
      const n = id(nx, nz), nd = dist[c] + 1;
      if (nd < dist[n]) { dist[n] = nd; prev[n] = c; heap.push(nd + h(nx, nz), n); }
    }
  }
  if (!isFinite(dist[id(bx, bz)])) return null;
  const out: Cell[] = [];
  for (let c = id(bx, bz); c >= 0; c = prev[c]) out.push([(c % W) + lx + 0.5, Math.floor(c / W) + lz + 0.5]);
  return out.reverse();
}

/** Le tracé d'un mur de A à B : ses cases, et pourquoi on ne peut pas le poser (null : on peut) ; `bad` : les cases qui refusent */
export interface WallTrace { cells: Cell[]; why: string | null; bad?: boolean[] }

const key = (c: Cell) => `${Math.floor(c[0])},${Math.floor(c[1])}`;
const free = (k: string) => k === 'ok' || k === 'wall' || k === 'seal';

/**
 * Le prolongement d'un bout de mur (`cells[0]` si `start`, sinon la dernière case) jusqu'à la paroi la plus proche, à `SNAP`
 * cases au plus : les cases à ajouter, du bout vers la paroi ([] : déjà contre, ou rien d'assez près). On préfère aller
 * tout droit, dans le sens du tracé
 */
export function snapEnd(base: HellBase, cells: Cell[], start: boolean): Cell[] {
  const n = cells.length, e = start ? cells[0] : cells[n - 1];
  if (base.sealed(e[0], e[1])) return [];
  const prev = n > 1 ? (start ? cells[1] : cells[n - 2]) : null, dir = prev ? [e[0] - prev[0], e[1] - prev[1]] : [0, 0];
  const seen = new Set(cells.map(key)), from = new Map<string, Cell | null>([[key(e), null]]);
  let ring: Cell[] = [e];
  for (let depth = 1; depth <= SNAP; depth++) {
    const next: Cell[] = [], hits: Cell[] = [];
    for (const c of ring) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q: Cell = [c[0] + dx, c[1] + dz], k = key(q);
      if (from.has(k) || seen.has(k) || base.wallCell(q[0], q[1]) !== 'ok') continue;
      from.set(k, c); next.push(q);
      if (base.sealed(q[0], q[1])) hits.push(q);
    }
    if (hits.length) {
      const score = (q: Cell) => (q[0] - e[0]) * dir[0] + (q[1] - e[1]) * dir[1];
      let best = hits[0];
      for (const q of hits) if (score(q) > score(best)) best = q;
      const out: Cell[] = [];
      for (let c: Cell | null | undefined = best; c && key(c) !== key(e); c = from.get(key(c))) out.push(c);
      return out.reverse();
    }
    ring = next;
  }
  return [];
}

/**
 * Les cases d'un mur de `a` à `b` : la ligne libre, sans ses cases de paroi, de lave ou de bâtiment (elles ferment d'elles-mêmes),
 * accrochée à la paroi par ses bouts (`snap`) ; une case interdite (hors de portée du camp, pont…) : le chemin qui contourne,
 * sinon la ligne refusée, la case fautive marquée (`bad`) et nommée
 */
export function traceWall(base: HellBase | null, a: Cell, b: Cell, snap = { a: true, b: true }): WallTrace {
  let line = wallLine(a, b);
  if (!base) return { cells: line, why: null };
  const tooLong = (c: Cell[]) => (c.length > WALL_MAX ? tr('Trop long : {n} pans au plus d’un coup (cliquez plus près, puis prolongez).', { n: WALL_MAX }) : null);
  let kinds = line.map(([x, z]) => base.wallCell(x, z));
  // un bout interdit derrière une paroi (le pointeur lâché au-delà de la roche) : le mur s'arrête à la paroi
  const s0 = kinds.indexOf('seal'), s1 = kinds.lastIndexOf('seal');
  if (s1 >= 0 && kinds.slice(s1).some((k) => !free(k))) { line = line.slice(0, s1); kinds = kinds.slice(0, s1); }
  if (s0 >= 0 && s0 < kinds.length && kinds.slice(0, s0).some((k) => !free(k))) { line = line.slice(s0); kinds = kinds.slice(s0); }
  const bad = kinds.findIndex((k) => !free(k));
  const ends = (cells: Cell[]): WallTrace => {
    if (!cells.length) return { cells, why: tr('Rien à poser ici.') };
    const head = snap.a ? snapEnd(base, cells, true).reverse() : [];
    const tail = snap.b ? snapEnd(base, cells, false) : [];
    const out = [...head, ...cells, ...tail];
    return { cells: out.slice(0, WALL_MAX), why: tooLong(out) };
  };
  if (bad < 0) return ends(line.filter((_, i) => kinds[i] !== 'seal'));
  const route = wallRoute(base, a, b);
  if (route) return ends(route);
  const keep = line.map((_, i) => kinds[i] !== 'seal');
  const cells = line.filter((_, i) => keep[i]).slice(0, WALL_MAX);
  return { cells, why: kinds[bad], bad: kinds.filter((_, i) => keep[i]).map((k) => !free(k)).slice(0, WALL_MAX) };
}

export class WallPlan {
  /** le point A : où le mur en cours commence (null : pas de tracé) */
  a: Cell | null = null;
  /** le point A est déjà un mur posé (la fin du tracé précédent) : on ne le repose pas */
  built = false;
  /** appui en cours (le bouton est enfoncé depuis qu'on a choisi A, ou depuis le clic de B) */
  pressing = false;
  /** le pointeur a changé de case depuis l'appui (c'est un glissé, pas un clic) */
  moved = false;
  private key = '';
  private cache: { cells: GhostCell[]; n: number; cost: string; why: string | null; trace: WallTrace } | null = null;

  reset() { this.a = null; this.built = false; this.pressing = false; this.moved = false; this.key = ''; this.cache = null; }

  /** Appui : le premier choisit le point A (et le renvoie `start`) ; avec un point A, c'est le point B (`lay` : on pose) */
  press(p: [number, number]): 'start' | 'lay' | 'same' {
    const c = cellOf(p);
    this.moved = false;
    if (!this.a) { this.a = c; this.built = false; this.pressing = true; return 'start'; }
    // un clic sur A abandonne le tracé (comme la route libre)
    if (this.a[0] === c[0] && this.a[1] === c[1]) { this.a = null; this.built = false; return 'same'; }
    this.pressing = false;
    return 'lay';
  }
  drag(p: [number, number]) {
    if (!this.pressing || !this.a) return;
    const c = cellOf(p);
    if (c[0] !== this.a[0] || c[1] !== this.a[1]) this.moved = true;
  }
  /** Relâchement : vrai si c'était un glissé de A à B (le mur se pose), faux pour un simple clic (A reste choisi) */
  release(p: [number, number]): boolean {
    this.drag(p);
    const lay = this.pressing && this.moved;
    this.pressing = false; this.moved = false;
    return lay;
  }

  /** Les cases du tracé de A au pointeur (sans le point A s'il est déjà posé) */
  trace(base: HellBase | null, p: [number, number], snapB = true): WallTrace {
    const c = cellOf(p);
    if (!this.a) return { cells: [c], why: null };
    // (un mur qui prolonge le précédent part de son bout : on n'accroche que l'autre ; « porte ici » s'arrête au pointeur)
    const t = traceWall(base, this.a, c, { a: !this.built, b: snapB });
    const head = this.built && t.cells.length > 1 && key(t.cells[0]) === key(this.a);
    return head ? { cells: t.cells.slice(1), why: t.why, bad: t.bad?.slice(1) } : t;
  }

  /** L'aperçu du tracé (par case : posable ou non) pour l'écran, avec ce qu'il coûte et ce qui refuse (gardé tant que rien ne change) */
  preview(war: War, kind: BaseKind, p: [number, number]): { cells: GhostCell[]; n: number; cost: string; why: string | null; trace: WallTrace } {
    const tw = this.trace(war.base, p), c = cellOf(p);
    const key = `${kind}|${this.a?.join(',')}|${this.built}|${c.join(',')}|${war.base?.map.version}|${war.base?.hell.buildings.size}`;
    if (key === this.key && this.cache) return this.cache;
    this.key = key;
    const plan = war.planBaseLine(kind, tw.cells), same = tr('Il y a déjà un pan ici.');
    const out = !plan
      ? { cells: tw.cells.map(([x, z]): GhostCell => ({ x, z, ok: false })), n: 0, cost: '', why: null as string | null, trace: tw }
      : {
        cells: tw.cells.map(([x, z], i): GhostCell => {
          const ok = !tw.why && (plan.why[i] === null || plan.why[i] === same);
          return { x, z, ok, gate: ok && i === plan.gate, dim: !ok && !!tw.why && !tw.bad?.[i] };
        }),
        n: plan.n, cost: costText(plan.cost), why: tw.why ?? plan.why.find((w) => w !== null && w !== same) ?? null, trace: tw,
      };
    this.cache = out;
    return out;
  }

  /** Pose le mur tracé : un message pour le joueur ; B devient le point A du suivant */
  build(war: War, kind: BaseKind, p: [number, number]): string {
    const tw = this.trace(war.base, p);
    if (tw.why) return tw.why;
    const r = war.buildBaseLine(kind, tw.cells);
    const d = BASE_DEFS[kind];
    if (r.built > 0 || (r.why === null && tw.cells.length)) {
      // (B, même s'il existait déjà : le mur suivant part de là)
      this.a = tw.cells[tw.cells.length - 1]; this.built = true; this.key = '';
      const gate = r.gate ? tr(', avec une porte pour vos troupes') : '';
      return r.built ? `${d.icon} ${r.built > 1 ? tr('{n} pans de {name} posés', { n: r.built, name: d.name.toLowerCase() }) : tr('{name} : c’est posé', { name: d.name })}${gate}${r.why ? ` (${r.why})` : ''}${tr('. Cliquez plus loin pour prolonger le mur. G : porte ici. Échap : arrêter.')}` : tr('Déjà posé.');
    }
    return r.why ?? tr('Rien à poser ici.');
  }

  /** « Porte ici » : le mur jusqu'au pointeur, dont la dernière case est une porte (une ouverture qui se ferme aux démons) */
  buildWithGate(war: War, p: [number, number]): string {
    const tw = this.trace(war.base, p, false);
    if (tw.why) return tw.why;
    // (la porte au bout du tracé : la ligne n'en ajoute pas d'autre pour laisser le passage)
    const gate = tw.cells[tw.cells.length - 1], r = war.buildBaseLine('palisade', tw.cells, tw.cells.length - 1);
    if (!r.gate) return r.why ?? tr('Rien à poser ici.');
    this.a = gate; this.built = true; this.key = '';
    return `${BASE_DEFS.gate.icon} ${tr('Porte posée. Cliquez plus loin pour prolonger le mur. Échap : arrêter.')}`;
  }
}
