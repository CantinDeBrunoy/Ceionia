import { World } from '../world/world';
import { Building, KINDS, KindId, isRampart, sizeOf } from './catalog';
import { wallLine, Cell } from '../ui/wallPlan';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../render/hellBase';
import { TOWER_SHIFT, NODE_TOWER, NODE_PLAIN, NODE_FLIP_Z, NODE_FLIP_X, rampartNode } from '../render/ramparts';
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
  // (et le choix du joueur pour un pan : tour ou simple pilier)
  const node = b.kind !== 'wall' || b.tower === undefined ? 0 : b.tower ? NODE_TOWER : NODE_PLAIN;
  return m | node | rampartInside(w, b.x, b.z) | (((tower(n) ? WALL_N : 0) | (tower(e) ? WALL_E : 0) | (tower(s) ? WALL_S : 0) | (tower(o) ? WALL_W : 0)) << TOWER_SHIFT);
}

/** Ce qui arrête le remplissage depuis le dehors : un pan, une porte, une tour de garde */
const blocks = (b: Building | undefined) => !!b && (isRampart(b.kind) || b.kind === 'watchtower');

/**
 * Le dedans des enceintes : les cases que l'on n'atteint pas en partant du bord de la zone des remparts sans traverser de
 * rempart (un remplissage par les quatre côtés). Une enceinte percée (une rue sans porte) n'a pas de dedans : le repli, le
 * centre du village, décide alors. Avec le centre du village (barycentre des bâtiments qui ne sont pas des remparts). Gardé
 * tant que le plan du village ne bouge pas (`World.version`)
 */
interface Inside { key: string; inside: Set<number>; cx: number; cz: number }
const insides = new WeakMap<World, Inside>();
function insideOf(w: World): Inside {
  const key = `${w.version}|${w.buildings.size}|${w.nextId}`;
  const old = insides.get(w);
  if (old && old.key === key) return old;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, sx = 0, sz = 0, n = 0;
  for (const b of w.buildings.values()) {
    if (blocks(b)) { x0 = Math.min(x0, b.x); z0 = Math.min(z0, b.z); x1 = Math.max(x1, b.x); z1 = Math.max(z1, b.z); continue; }
    const s = sizeOf(b);
    sx += b.x + s / 2; sz += b.z + s / 2; n++;
  }
  const inside = new Set<number>();
  if (x1 >= x0) {
    // la zone des remparts, une case de marge autour : tout ce que le remplissage depuis son bord n'atteint pas est dedans
    x0 -= 1; z0 -= 1; x1 += 1; z1 += 1;
    const W = x1 - x0 + 1, H = z1 - z0 + 1, seen = new Uint8Array(W * H), stack: number[] = [];
    const wall = (x: number, z: number) => blocks(w.buildingAt(x, z));
    const push = (x: number, z: number) => { const k = (z - z0) * W + (x - x0); if (seen[k] || wall(x, z)) return; seen[k] = 1; stack.push(k); };
    for (let x = x0; x <= x1; x++) { push(x, z0); push(x, z1); }
    for (let z = z0; z <= z1; z++) { push(x0, z); push(x1, z); }
    while (stack.length) {
      const k = stack.pop()!, x = x0 + (k % W), z = z0 + Math.floor(k / W);
      if (x > x0) push(x - 1, z);
      if (x < x1) push(x + 1, z);
      if (z > z0) push(x, z - 1);
      if (z < z1) push(x, z + 1);
    }
    for (let k = 0; k < W * H; k++) {
      const x = x0 + (k % W), z = z0 + Math.floor(k / W);
      if (!seen[k] && !wall(x, z)) inside.add(z * 100000 + x);
    }
  }
  const r: Inside = { key, inside, cx: n ? sx / n : NaN, cz: n ? sz / n : NaN };
  insides.set(w, r);
  return r;
}

/**
 * Le côté intérieur d'un rempart en (x, z) : `NODE_FLIP_Z` si les bras est-ouest ont leur dedans au sud (+z) et non au nord,
 * `NODE_FLIP_X` si les bras nord-sud l'ont à l'est (+x) et non à l'ouest. Le dedans d'une enceinte fermée l'emporte : on
 * compte les cases du dedans dans les trois cases de chaque côté (les angles voient leur dedans en diagonale) ; sinon le côté
 * tourné vers le centre du village ; sans village, le nord et l'ouest
 */
export function rampartInside(w: World, x: number, z: number): number {
  const I = insideOf(w), at = (dx: number, dz: number) => (I.inside.has((z + dz) * 100000 + x + dx) ? 1 : 0);
  let south = 0, north = 0, east = 0, west = 0;
  for (const d of [-1, 0, 1]) { south += at(d, 1); north += at(d, -1); east += at(1, d); west += at(-1, d); }
  const cx = I.cx - (x + 0.5), cz = I.cz - (z + 0.5);
  const flipZ = south !== north ? south > north : Number.isFinite(cz) && cz > 0.01;
  const flipX = east !== west ? east > west : Number.isFinite(cx) && cx > 0.01;
  return (flipZ ? NODE_FLIP_Z : 0) | (flipX ? NODE_FLIP_X : 0);
}

/** Le pan porte-t-il une tour (choix du joueur, sinon aux bouts, aux angles et aux carrefours) ? */
export const rampartTower = (w: World, b: Building) => rampartNode(rampartMask(w, b)) !== 'straight';

/**
 * Le choix du joueur qui fait passer un pan de tour à simple pan, ou l'inverse : undefined (rendu au tracé) si le tracé
 * donne déjà ce résultat
 */
export function toggledTower(w: World, b: Building): boolean | undefined {
  const want = !rampartTower(w, b), auto = rampartNode(rampartMask(w, { ...b, tower: undefined })) !== 'straight';
  return want === auto ? undefined : want;
}

/** Le tracé d'un mur de `a` à `b` : ses cases (centres), et pour chacune si un pan s'y pose (ou s'il y en a déjà un) */
export interface RampartTrace { cells: Cell[]; ok: boolean[]; had: boolean[]; why: string | null; /** ce qu'on trace : un pan de rempart, une clôture, une haie */ kind?: KindId }

/**
 * Le tracé d'une ligne de `kind` (un pan de rempart par défaut, ou une clôture, une haie) de `a` à `b`, en escalier à angles
 * droits ; une case qui porte déjà ce genre (ou, pour un rempart, une porte ou un pan) compte comme posée
 */
export function traceRampart(w: World, a: Cell, b: Cell, kind: KindId = 'wall'): RampartTrace {
  const line = wallLine(a, b), why = line.length > RAMPART_MAX ? tr(kind === 'wall' ? 'Trop long : {n} pans au plus d’un coup (cliquez plus près, puis prolongez).' : 'Trop long : {n} cases au plus d’un coup (cliquez plus près, puis prolongez).', { n: RAMPART_MAX }) : null;
  const cells = line.slice(0, RAMPART_MAX);
  const had = cells.map(([x, z]) => { const o = w.buildingAt(Math.floor(x), Math.floor(z)); return !!o && (kind === 'wall' ? isRampart(o.kind) : o.kind === kind); });
  const ok = cells.map(([x, z], i) => had[i] || w.canPlace(kind, Math.floor(x), Math.floor(z)) === null);
  return { cells, ok, had, why, kind };
}

/** Ce que coûte un tracé : le prix d'une pièce fois les pièces à poser (null : rien) */
export function rampartCost(w: World, t: RampartTrace, age: number): Cost | null {
  const unit = priceIn(w, t.kind ?? 'wall', age), n = t.ok.filter((o, i) => o && !t.had[i]).length;
  if (!unit || !n) return null;
  return { wood: unit.wood * n, stone: unit.stone * n, ...(unit.brick ? { brick: unit.brick * n } : {}) };
}

/** Pose les pièces du tracé qui le peuvent, dans l'ordre, tant qu'on peut les payer ; `built` : posées, `skipped` : cases sautées, `short` : le bois ou la pierre a manqué */
export function layRampart(w: World, t: RampartTrace, age: number): { built: number; skipped: number; short: boolean } {
  const kind = t.kind ?? 'wall';
  let built = 0, skipped = 0, short = false;
  for (let i = 0; i < t.cells.length; i++) {
    if (t.had[i]) continue;
    if (!t.ok[i]) { skipped++; continue; }
    const [x, z] = t.cells[i], cx = Math.floor(x), cz = Math.floor(z);
    if (w.canPlace(kind, cx, cz) !== null) { skipped++; continue; }
    const cost = priceIn(w, kind, age);
    if (cost && !canPay(w, cost)) { short = true; break; }
    pay(w, cost);
    // (une clôture seule court dans le sens du tracé : d'est en ouest, ou du nord au sud)
    const p = t.cells[i - 1] ?? t.cells[i + 1], rot = kind !== 'wall' && p && Math.floor(p[0]) === cx ? 1 : 0;
    w.place(kind, cx, cz, rot, false, Math.max(age, KINDS[kind].minAge), built === 0);
    built++;
  }
  return { built, skipped, short };
}
