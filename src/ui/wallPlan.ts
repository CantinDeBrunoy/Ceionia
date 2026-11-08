import type { BaseKind } from '../sim/hell';
import type { War } from '../sim/war';
import type { HellBase } from '../sim/hellBase';
import { BASE_DEFS, costText } from '../sim/hellBase';
import { Heap } from '../sim/agents';

/**
 * La pose des murs de la base avancée (palissades, portes), sur le modèle de la route libre du village : un clic au point A,
 * un clic au point B (ou un glissé de A à B), et la palissade se pose d'un trait de l'un à l'autre, sur une ligne LIBRE (droite,
 * diagonale ou contournant les obstacles) ; B devient le point A du mur suivant. Les cases se raccordent par les côtés (une
 * diagonale est un escalier : aucun démon ne s'y glisse). Un aperçu montre tout le tracé, case par case (vert : on peut, rouge :
 * non), avec ce qu'il coûte. Ce fichier ne sait rien de l'écran : l'interface lui donne les points du sol
 */

export type Cell = [number, number];
export interface GhostCell { x: number; z: number; ok: boolean; /** une porte, pas un pan */ gate?: boolean }

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

/** Le tracé d'un mur de A à B : ses cases, et pourquoi on ne peut pas le poser (null : on peut) */
export interface WallTrace { cells: Cell[]; why: string | null }

/** Les cases d'un mur de `a` à `b` : la ligne libre si elle passe, sinon le chemin qui contourne ; sinon la ligne, refusée */
export function traceWall(base: HellBase | null, a: Cell, b: Cell): WallTrace {
  const line = wallLine(a, b);
  if (!base) return { cells: line, why: null };
  const tooLong = (c: Cell[]) => (c.length > WALL_MAX ? `Trop long : ${WALL_MAX} pans au plus d’un coup (cliquez plus près, puis prolongez).` : null);
  const walls = base.wallCellSet();
  if (line.every(([x, z]) => base.wallOk(x, z, walls))) return { cells: line.slice(0, WALL_MAX), why: tooLong(line) };
  const route = wallRoute(base, a, b);
  if (route) return { cells: route.slice(0, WALL_MAX), why: tooLong(route) };
  return { cells: line.slice(0, WALL_MAX), why: 'Pas de passage : lave, paroi, bâtiment ou limite du camp barrent le mur.' };
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
  trace(base: HellBase | null, p: [number, number]): WallTrace {
    const c = cellOf(p);
    if (!this.a) return { cells: [c], why: null };
    const t = traceWall(base, this.a, c);
    return this.built && t.cells.length > 1 ? { cells: t.cells.slice(1), why: t.why } : t;
  }

  /** L'aperçu du tracé (par case : posable ou non) pour l'écran, avec ce qu'il coûte et ce qui refuse (gardé tant que rien ne change) */
  preview(war: War, kind: BaseKind, p: [number, number]): { cells: GhostCell[]; n: number; cost: string; why: string | null; trace: WallTrace } {
    const tr = this.trace(war.base, p), c = cellOf(p);
    const key = `${kind}|${this.a?.join(',')}|${this.built}|${c.join(',')}|${war.base?.map.version}|${war.base?.hell.buildings.size}`;
    if (key === this.key && this.cache) return this.cache;
    this.key = key;
    const plan = war.planBaseLine(kind, tr.cells);
    const out = !plan
      ? { cells: tr.cells.map(([x, z]): GhostCell => ({ x, z, ok: false })), n: 0, cost: '', why: null as string | null, trace: tr }
      : {
        cells: tr.cells.map(([x, z], i): GhostCell => ({ x, z, ok: !tr.why && (plan.why[i] === null || !!plan.why[i]?.startsWith('Il y a déjà un pan')) })),
        n: plan.n, cost: costText(plan.cost), why: tr.why ?? plan.why.find((w) => w !== null && !w.startsWith('Il y a déjà un pan')) ?? null, trace: tr,
      };
    this.cache = out;
    return out;
  }

  /** Pose le mur tracé : un message pour le joueur ; B devient le point A du suivant */
  build(war: War, kind: BaseKind, p: [number, number]): string {
    const tr = this.trace(war.base, p);
    if (tr.why) return tr.why;
    const r = war.buildBaseLine(kind, tr.cells);
    const d = BASE_DEFS[kind];
    if (r.built > 0 || (r.why === null && tr.cells.length)) {
      // (B, même s'il existait déjà : le mur suivant part de là)
      this.a = tr.cells[tr.cells.length - 1]; this.built = true; this.key = '';
      return r.built ? `${d.icon} ${r.built > 1 ? `${r.built} pans de ${d.name.toLowerCase()} posés` : `${d.name} : c’est posé`}${r.why ? ` (${r.why})` : ''}. Cliquez plus loin pour prolonger le mur ; G : porte ici ; Échap : arrêter.` : 'Déjà posé.';
    }
    return r.why ?? 'Rien à poser ici.';
  }

  /** « Porte ici » : le mur jusqu'au pointeur, dont la dernière case est une porte (une ouverture qui se ferme aux démons) */
  buildWithGate(war: War, p: [number, number]): string {
    const tr = this.trace(war.base, p);
    if (tr.why) return tr.why;
    const gate = tr.cells[tr.cells.length - 1], walls = tr.cells.slice(0, -1);
    if (walls.length) {
      const r = war.buildBaseLine('palisade', walls);
      if (r.built === 0 && r.why) return r.why;
    }
    const g = war.buildBase('gate', gate[0], gate[1]);
    if (typeof g === 'string') return g;
    this.a = gate; this.built = true; this.key = '';
    return `${BASE_DEFS.gate.icon} Porte posée. Cliquez plus loin pour prolonger le mur ; Échap : arrêter.`;
  }
}
