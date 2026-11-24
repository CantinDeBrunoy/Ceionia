import type { World } from './world';
import type { People, RivalIsle } from './archipelago';
import { zoneSite, type ZoneSite } from './archipelago';
import { townCells, townPlan } from './rivalTown';

/**
 * La zone de chaque île rivale (chantier C du nouveau monde) : la **concession** chez l'allié (on y bâtit, et seulement là
 * sur son île), la **tête de pont** chez le rival (la guerre : le débarquement, le camp, le fort, la ville de garnison).
 * Fonction pure, mise en cache comme le plan des villes (`townPlan`) : elle lit les hauteurs de la carte.
 * - Sur une carte neuve (`World.zoneGen`), la zone est le replat préparé par le générateur (`addZones`), au-delà de sa limite
 *   (une ria ou une arête) ; le passage est le col ou la langue de terre que la limite laisse.
 * - Sur une ancienne carte (relief déjà fait, on n'y touche pas), la meilleure zone libre du côté de notre île : de la terre
 *   en pente douce, hors de la ville, d'au moins `ZONE_MIN` cases, près d'une eau profonde. Un décor la borne (`render/concessionView.ts`).
 * Voir `docs/diplomatie.md`, « Les concessions et la tête de pont »
 */

/** Taille visée d'une zone (cases) : de quoi poser une dizaine de bâtiments de 2 × 2, quelques 3 × 3 et leurs routes */
export const ZONE_MIN = 300;

export interface Concession {
  people: People;
  /** les cases de la zone (indices `w.ci`) */
  cells: Set<number>;
  /** l'eau qui la borde, à 3 cases au plus (le quai d'un port, un ponton s'y avancent) */
  shore: Set<number>;
  /** le milieu de la zone (moyenne de ses cases) */
  x: number; z: number;
  /** la limite est dans le relief (carte neuve) ; sinon, seulement le décor */
  relief: boolean;
  /** les bords de la zone qui donnent sur la terre (où vont les bornes) : milieu du bord (x, z) et angle du bord */
  edges: [number, number, number][];
  /** tout le contour (bords de cases), pour le liseré doré : x1, z1, x2, z2 */
  outline: [number, number, number, number][];
  /** le passage vers la ville : milieu, angle du bord */
  gate: [number, number, number];
  /** la plage (au bord de l'eau, côté large) et le camp de la tête de pont (en retrait, sur la zone) */
  beach: [number, number];
  camp: [number, number];
}

const cache = new Map<string, Concession | null>();

/** La zone de l'île rivale `q` (null : l'île n'en a pas trouvé) */
export function concession(w: World, q: RivalIsle): Concession | null {
  const key = `${w.seed}|${q.people}|${w.zoneGen}|${q.village.x.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key)!;
  const out = findZone(w, q);
  cache.set(key, out);
  return out;
}

/** Oublie les zones calculées (tests : plusieurs cartes de même graine) */
export function forgetZones() { cache.clear(); last = null; }

/** La zone du peuple `people` (null sans archipel) ; la dernière demandée est gardée sous la main (la pose la lit souvent) */
let last: { w: World; people: People; seed: number; gen: number; z: Concession | null } | null = null;
export function zoneOf(w: World, people: People): Concession | null {
  if (last && last.w === w && last.people === people && last.seed === w.seed && last.gen === w.zoneGen && w.isles) return last.z;
  const q = w.isles?.rivals.find((r) => r.people === people);
  const z = q ? concession(w, q) : null;
  last = { w, people, seed: w.seed, gen: w.zoneGen, z };
  return z;
}

/** La case (x, z) est-elle dans la zone de ce peuple ? */
export function inZone(w: World, people: People, x: number, z: number) {
  if (!w.inCells(x, z)) return false;
  return !!zoneOf(w, people)?.cells.has(w.ci(x, z));
}

function findZone(w: World, q: RivalIsle): Concession | null {
  if (!w.isles) return null;
  const site = zoneSite(w.seed, q, w.isles.main), v = q.village;
  const town = townCells(w, townPlan(w, q));
  const relief = w.zoneGen === 1;
  const along = (x: number, z: number) => (x - v.x) * site.ux + (z - v.z) * site.uz;
  // (carte neuve : la zone commence au-delà de la limite et de son pied)
  const beyond = (x: number, z: number) => !relief || along(x + 0.5, z + 0.5) >= site.d0 + (site.limit === 'ria' ? 2.6 : 2.8);
  const ok = (x: number, z: number) => {
    if (!w.inCells(x, z)) return false;
    const k = w.ci(x, z), a = w.cellAvg(x, z);
    return a >= 0.15 && a <= 3.4 && w.cellSlope(x, z) <= 0.95 && !town.has(k) && !w.lake[k] && beyond(x, z);
  };
  /** la zone autour de (cx, cz), d'un seul tenant, dans un rayon R */
  const flood = (cx: number, cz: number, R: number) => {
    let start = -1, bd = Infinity;
    for (let z = Math.floor(cz - 3); z <= cz + 3; z++)
      for (let x = Math.floor(cx - 3); x <= cx + 3; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d < bd && ok(x, z)) { bd = d; start = w.ci(x, z); }
      }
    const cells = new Set<number>();
    if (start < 0) return cells;
    const queue = [start];
    cells.add(start);
    const N = Math.round(Math.sqrt(w.lake.length));
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i], x = k % N, z = Math.floor(k / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!w.inCells(nx, nz) || Math.hypot(nx + 0.5 - cx, nz + 0.5 - cz) > R) continue;
        const nk = w.ci(nx, nz);
        if (cells.has(nk) || !ok(nx, nz)) continue;
        cells.add(nk); queue.push(nk);
      }
    }
    return cells;
  };
  /** une eau profonde à quelques cases d'une case de la zone (le port, le quai, le débarquement) */
  const deepNear = (cells: Set<number>) => {
    const N = Math.round(Math.sqrt(w.lake.length));
    let n = 0;
    for (const k of cells) {
      const x = k % N, z = Math.floor(k / N);
      if (!coastal(w, x, z)) continue;
      for (let dz = -4; dz <= 4 && !n; dz++) for (let dx = -4; dx <= 4; dx++) if (w.inCells(x + dx, z + dz) && w.cellAvg(x + dx, z + dz) < -0.6) { n++; break; }
      if (n) break;
    }
    return n > 0;
  };

  let cells: Set<number>;
  if (relief) cells = flood(site.x, site.z, site.r * 1.2);
  else {
    // l'ancienne carte : des centres autour du village, du côté de notre île d'abord
    const a0 = Math.atan2(w.isles.main.z + w.isles.main.n / 2 - v.z, w.isles.main.x + w.isles.main.n / 2 - v.x);
    let best = new Set<number>(), bs = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const da = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.14;
      for (let d = v.r + 10; d <= v.r + 42; d += 3) {
        const cx = v.x + Math.cos(a0 + da) * d, cz = v.z + Math.sin(a0 + da) * d;
        const c = flood(cx, cz, 11.5);
        if (c.size < 120) continue;
        const sc = Math.min(c.size, 400) + (c.size >= ZONE_MIN ? 200 : 0) + (deepNear(c) ? 120 : 0) - Math.abs(da) * 60 - d * 0.6;
        if (sc > bs) { bs = sc; best = c; }
      }
    }
    cells = best;
  }
  if (!cells.size) return null;
  return shape(w, q, site, cells, relief);
}

/** La case touche-t-elle l'eau (mer, ria ; pas un lac) ? */
function coastal(w: World, x: number, z: number) {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, nz = z + dz;
    if (w.inCells(nx, nz) && w.isWaterCell(nx, nz) && !w.lake[w.ci(nx, nz)]) return true;
  }
  return false;
}

/** Le contour, les bornes, le passage, la plage et le camp d'une zone trouvée */
function shape(w: World, q: RivalIsle, site: ZoneSite, cells: Set<number>, relief: boolean): Concession {
  const N = Math.round(Math.sqrt(w.lake.length)), v = q.village;
  let sx = 0, sz = 0, mean = 0;
  for (const k of cells) { const x = k % N, z = Math.floor(k / N); sx += x + 0.5; sz += z + 0.5; mean += w.cellAvg(x, z); }
  const cx = sx / cells.size, cz = sz / cells.size;
  mean /= cells.size;
  const along = (x: number, z: number) => (x - v.x) * site.ux + (z - v.z) * site.uz;
  const edges: [number, number, number][] = [], outline: [number, number, number, number][] = [];
  // le passage : sur une carte neuve, le col ou la langue de terre ; ailleurs, le bord le plus proche de la ville
  const px = relief ? v.x + site.ux * site.d0 - site.uz * site.pass : v.x, pz = relief ? v.z + site.uz * site.d0 + site.ux * site.pass : v.z;
  let gate: [number, number, number] = [cx, cz, 0], gd = Infinity;
  for (const k of cells) {
    const x = k % N, z = Math.floor(k / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (w.inCells(nx, nz) && cells.has(w.ci(nx, nz))) continue;
      // le bord de case : son milieu, ses deux bouts, son angle (le long du bord)
      const mx = x + 0.5 + dx * 0.5, mz = z + 0.5 + dz * 0.5, ex = Math.abs(dz) * 0.5, ez = Math.abs(dx) * 0.5;
      outline.push([mx - ex, mz - ez, mx + ex, mz + ez]);
      if (!w.inCells(nx, nz)) continue;
      const a = w.cellAvg(nx, nz);
      // la mer, la ria ou l'arête font la limite d'elles-mêmes : pas de bornes (ni sur la grève, au bord de l'eau)
      if (a < 0.2 || a > mean + 1.2 || coastal(w, nx, nz)) continue;
      // (au pied de la limite, seulement le passage)
      if (relief && Math.abs(along(nx + 0.5, nz + 0.5) - site.d0) < 3.6 && Math.hypot(mx - px, mz - pz) > 4.6) continue;
      const ang = dx ? Math.PI / 2 : 0;
      edges.push([mx, mz, ang]);
      const d = Math.hypot(mx - px, mz - pz);
      if (d < gd) { gd = d; gate = [mx, mz, ang]; }
    }
  }
  // (carte neuve : la porte se tient au passage même, sur le bord de la zone le plus proche du col ou de la langue de terre)
  if (relief) {
    let od = Infinity;
    for (const [x1, z1, x2, z2] of outline) {
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, d = Math.hypot(mx - px, mz - pz);
      if (d < od) { od = d; gate = [mx, mz, x1 === x2 ? Math.PI / 2 : 0]; }
    }
  }
  // la plage : une case de la zone au bord de l'eau, l'eau profonde tout près, loin de la ville (côté large)
  let beach: [number, number] = [cx, cz], camp: [number, number] = [cx, cz], bs = -Infinity;
  for (const k of cells) {
    const x = k % N, z = Math.floor(k / N);
    if (!coastal(w, x, z)) continue;
    let deep = 9;
    for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) if (w.inCells(x + dx, z + dz) && w.cellAvg(x + dx, z + dz) < -0.7) deep = Math.min(deep, Math.hypot(dx, dz));
    // (une plage en pente douce : la case et sa voisine vers l'intérieur)
    const sc = -deep * 3 - w.cellSlope(x, z) * 4 + Math.hypot(x + 0.5 - v.x, z + 0.5 - v.z) * 0.15;
    if (sc <= bs) continue;
    bs = sc;
    // le point au bord de l'eau, sur la dernière case de terre (la bataille y débarque : une case praticable)
    let wx = 0, wz = 0, n = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.inCells(x + dx, z + dz) && w.isWaterCell(x + dx, z + dz)) { wx += dx; wz += dz; n++; }
    const l = Math.hypot(wx, wz) || 1;
    beach = [x + 0.5 + (wx / l) * 0.3, z + 0.5 + (wz / l) * 0.3];
  }
  // le camp : cinq cases en retrait de la plage, vers le milieu de la zone, sur une case de la zone
  {
    const dx = cx - beach[0], dz = cz - beach[1], l = Math.hypot(dx, dz) || 1, tx = beach[0] + (dx / l) * Math.min(5, l), tz = beach[1] + (dz / l) * Math.min(5, l);
    let cd = Infinity;
    for (const k of cells) { const x = k % N, z = Math.floor(k / N), d = Math.hypot(x + 0.5 - tx, z + 0.5 - tz); if (d < cd) { cd = d; camp = [x + 0.5, z + 0.5]; } }
  }
  const shore = new Set<number>();
  for (const k of cells) {
    const x = k % N, z = Math.floor(k / N);
    if (!coastal(w, x, z)) continue;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (w.inCells(x + dx, z + dz) && w.isWaterCell(x + dx, z + dz) && !w.lake[w.ci(x + dx, z + dz)]) shore.add(w.ci(x + dx, z + dz));
  }
  return { people: q.people, cells, shore, x: cx, z: cz, relief, edges, outline, gate, beach, camp };
}
