import type { BaseKind } from '../sim/hell';
import type { War } from '../sim/war';
import { BASE_DEFS, costText } from '../sim/hellBase';

/**
 * La pose des murs de la base avancée (palissades, portes) : on clique et on glisse pour tracer une ligne continue, alignée
 * sur la grille ; un simple clic pose une case, et le clic suivant prolonge le mur depuis la dernière case posée (on tourne
 * en cliquant ailleurs). Un aperçu montre toute la ligne, case par case (vert : on peut, rouge : non). Ce fichier ne sait
 * rien de l'écran : l'interface lui donne les points du sol
 */

export type Cell = [number, number];
export interface GhostCell { x: number; z: number; ok: boolean }

/** Les bâtiments qui se posent comme des murs (aperçu raccordé) */
export const isWallKind = (k: BaseKind | null): k is 'palisade' | 'gate' => k === 'palisade' || k === 'gate';
/** …et ceux qui se tracent en ligne (le glissé) */
export const isLineKind = (k: BaseKind | null): k is 'palisade' => k === 'palisade';

/** Un point du sol → le centre de sa case */
export const cellOf = (p: [number, number]): Cell => [Math.floor(p[0]) + 0.5, Math.floor(p[1]) + 0.5];

/** Longueur maximale d'une ligne tracée d'un coup (cases) */
export const WALL_MAX = 30;

/** Les centres des cases d'une ligne droite de `a` à `b`, sur l'axe où ils sont le plus éloignés (a et b compris, au plus `max`) */
export function wallCells(a: Cell, b: Cell, max = WALL_MAX): Cell[] {
  const dx = Math.round(b[0] - a[0]), dz = Math.round(b[1] - a[1]), alongX = Math.abs(dx) >= Math.abs(dz);
  const n = Math.min(max, (alongX ? Math.abs(dx) : Math.abs(dz)) + 1), sx = Math.sign(dx) || 1, sz = Math.sign(dz) || 1;
  return Array.from({ length: n }, (_, i): Cell => (alongX ? [a[0] + i * sx, a[1]] : [a[0], a[1] + i * sz]));
}

export class WallPlan {
  /** début du glissé en cours (l'appui) */
  from: Cell | null = null;
  /** la dernière case posée : le prochain clic prolonge le mur depuis elle */
  anchor: Cell | null = null;
  /** le pointeur a changé de case depuis l'appui (c'est un glissé, pas un clic) */
  moved = false;
  private last: Cell | null = null;

  get pressing() { return !!this.from; }
  reset() { this.from = null; this.anchor = null; this.moved = false; this.last = null; }

  press(p: [number, number]) { this.from = cellOf(p); this.moved = false; this.last = this.from; }
  drag(p: [number, number]) {
    if (!this.from) return;
    const c = cellOf(p);
    if (c[0] !== this.from[0] || c[1] !== this.from[1]) this.moved = true;
    this.last = c;
  }

  /** Les cases de la ligne en cours : le glissé, sinon du dernier mur posé jusqu'au pointeur, sinon la seule case visée */
  line(p: [number, number]): Cell[] {
    const c = cellOf(p);
    if (this.from && this.moved) return wallCells(this.from, this.last ?? c);
    if (this.anchor) return wallCells(this.anchor, c);
    return [c];
  }

  /** Relâchement : les cases à poser (un clic simple prolonge le mur depuis la dernière case, sinon pose la case cliquée) */
  release(p: [number, number]): Cell[] {
    this.drag(p);
    const cells = this.line(p);
    this.from = null; this.moved = false;
    return cells;
  }

  /** L'aperçu d'une ligne (par case : posable ou non) pour l'écran, avec ce qu'elle coûte et ce qui refuse */
  preview(war: War, kind: BaseKind, cells: Cell[]): { cells: GhostCell[]; n: number; cost: string; why: string | null } {
    const plan = war.planBaseLine(kind, cells);
    if (!plan) return { cells: cells.map(([x, z]) => ({ x, z, ok: false })), n: 0, cost: '', why: null };
    const why = plan.why.find((w) => w !== null && !w.startsWith('Il y a déjà un pan')) ?? null;
    return { cells: cells.map(([x, z], i) => ({ x, z, ok: plan.why[i] === null })), n: plan.n, cost: costText(plan.cost), why };
  }

  /** Pose la ligne : un message pour le joueur, et retient la dernière case posée pour prolonger le mur */
  build(war: War, kind: BaseKind, cells: Cell[]): string {
    const r = war.buildBaseLine(kind, cells);
    if (r.built > 0) {
      // (la dernière case posée, pas une case refusée)
      this.anchor = cells[cells.length - 1];
      const d = BASE_DEFS[kind];
      return `${d.icon} ${r.built > 1 ? `${r.built} pans de ${d.name.toLowerCase()} posés` : `${d.name} : c’est posé`}${r.why ? ` (${r.why})` : ''}. Cliquez plus loin pour prolonger le mur ; Échap pour arrêter.`;
    }
    return r.why ?? 'Rien à poser ici.';
  }
}
