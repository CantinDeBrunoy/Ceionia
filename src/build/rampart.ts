import { World } from '../world/world';
import { Building, KINDS, isRampart } from './catalog';
import { wallLine, Cell } from '../ui/wallPlan';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../render/hellBase';
import { TOWER_SHIFT } from '../render/ramparts';
import { Cost, canPay, pay, priceIn } from '../sim/economy';
import { tr } from '../i18n';

/**
 * Les remparts du village : un pan de mur par case, tracé d'un trait du point A au point B (la ligne libre des murs des Enfers,
 * `wallLine`), et la porte de la ville. Un pan ne se pose jamais sur une route : le tracé saute les cases refusées (route,
 * bâtiment, eau, pente) et reprend derrière, si bien qu'un mur s'interrompt de lui-même là où passe une rue ; les habitants et
 * les véhicules, qui ne marchent que sur les routes, ne sont jamais gênés. La porte, elle, se pose sur une route et l'enjambe
 */

/** Longueur maximale d'un mur tracé d'un coup (cases) */
export const RAMPART_MAX = 60;

/** Les voisins auxquels un pan se raccorde : un autre pan, une porte, une tour de garde */
const joins = (b: Building | undefined) => !!b && (isRampart(b.kind) || b.kind === 'watchtower');

/**
 * Les côtés reliés d'un rempart (WALL_N, E, S, W) : les pans, portes et tours voisins ; une porte sans voisin se tourne dans
 * l'axe de la rue qu'elle enjambe (la route au nord et au sud : le mur court d'est en ouest)
 */
export function rampartMask(w: World, b: Building): number {
  const at = (dx: number, dz: number) => w.buildingAt(b.x + dx, b.z + dz);
  const n = at(0, -1), e = at(1, 0), s = at(0, 1), o = at(-1, 0);
  let m = (joins(n) ? WALL_N : 0) | (joins(e) ? WALL_E : 0) | (joins(s) ? WALL_S : 0) | (joins(o) ? WALL_W : 0);
  if (!m && b.kind === 'gate') {
    const road = (dx: number, dz: number) => w.inCells(b.x + dx, b.z + dz) && w.road[w.ci(b.x + dx, b.z + dz)] === 1;
    if (road(0, -1) || road(0, 1)) m = WALL_E | WALL_W;
    else if (road(1, 0) || road(-1, 0)) m = WALL_N | WALL_S;
  }
  // (les tours de garde voisines, à part : le mur vient se souder à leur face)
  const tower = (x: Building | undefined) => !!x && x.kind === 'watchtower';
  return m | (((tower(n) ? WALL_N : 0) | (tower(e) ? WALL_E : 0) | (tower(s) ? WALL_S : 0) | (tower(o) ? WALL_W : 0)) << TOWER_SHIFT);
}

/** Le tracé d'un mur de `a` à `b` : ses cases (centres), et pour chacune si un pan s'y pose (ou s'il y en a déjà un) */
export interface RampartTrace { cells: Cell[]; ok: boolean[]; had: boolean[]; why: string | null }

export function traceRampart(w: World, a: Cell, b: Cell): RampartTrace {
  const line = wallLine(a, b), why = line.length > RAMPART_MAX ? tr('Trop long : {n} pans au plus d’un coup (cliquez plus près, puis prolongez).', { n: RAMPART_MAX }) : null;
  const cells = line.slice(0, RAMPART_MAX);
  const had = cells.map(([x, z]) => { const o = w.buildingAt(Math.floor(x), Math.floor(z)); return !!o && isRampart(o.kind); });
  const ok = cells.map(([x, z], i) => had[i] || w.canPlace('wall', Math.floor(x), Math.floor(z)) === null);
  return { cells, ok, had, why };
}

/** Ce que coûte un tracé : le prix d'un pan fois les pans à poser (null : rien) */
export function rampartCost(w: World, t: RampartTrace, age: number): Cost | null {
  const unit = priceIn(w, 'wall', age), n = t.ok.filter((o, i) => o && !t.had[i]).length;
  return unit && n ? { wood: unit.wood * n, stone: unit.stone * n } : null;
}

/** Pose les pans du tracé qui le peuvent, dans l'ordre, tant qu'on peut les payer ; `built` : posés, `skipped` : cases sautées, `short` : le bois ou la pierre a manqué */
export function layRampart(w: World, t: RampartTrace, age: number): { built: number; skipped: number; short: boolean } {
  let built = 0, skipped = 0, short = false;
  for (let i = 0; i < t.cells.length; i++) {
    if (t.had[i]) continue;
    if (!t.ok[i]) { skipped++; continue; }
    const [x, z] = t.cells[i], cx = Math.floor(x), cz = Math.floor(z);
    if (w.canPlace('wall', cx, cz) !== null) { skipped++; continue; }
    const cost = priceIn(w, 'wall', age);
    if (!canPay(w, cost)) { short = true; break; }
    pay(w, cost);
    w.place('wall', cx, cz, 0, false, Math.max(age, KINDS.wall.minAge), built === 0);
    built++;
  }
  return { built, skipped, short };
}
