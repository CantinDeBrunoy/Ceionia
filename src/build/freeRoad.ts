import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS } from '../world/world';
import { chaikin, rasterize, sampleCurve } from '../world/curves';
import { Heap } from '../sim/agents';

/** Longueur maximale d'une route libre (en cases, à vol d'oiseau) ; marge du terrain fouillé autour de A et B */
export const FREE_MAX = 80;
const MARGIN = 14;
/** Demi-largeur de chaussée gardée à l'écart des bâtiments, de part et d'autre de la ligne */
const BAND = 0.22;
/** Saut de hauteur au-delà duquel on ne passe pas d'une case à sa voisine */
const STEP_H = 0.75;

/** Route libre prévue de A à B : sa ligne (x, z à la suite), ses cases, et pourquoi on ne peut pas la poser (null : on peut) */
export interface RoadPlan { pts: number[]; cells: number[]; why: string | null }

/**
 * Route libre, façon Anno : du centre de la case de A à celui de la case de B, le chemin le moins coûteux (A*, 8-voisinage)
 * qui contourne bâtiments, pentes raides, cultures et eau profonde (un pont sur l'eau peu profonde, si l'on ne peut faire
 * autrement), puis tiré en lignes droites tant qu'elles restent praticables, et adouci comme la voie ferrée. La courbe la plus
 * douce dont toutes les cases sont praticables, et qui ne frôle aucun bâtiment, l'emporte
 */
export function planRoad(w: World, ax: number, az: number, bx: number, bz: number): RoadPlan {
  const x0 = Math.floor(ax), z0 = Math.floor(az), x1 = Math.floor(bx), z1 = Math.floor(bz);
  const A: [number, number] = [x0 + 0.5, z0 + 0.5], B: [number, number] = [x1 + 0.5, z1 + 0.5];
  const straight = (why: string): RoadPlan => ({ pts: [A[0], A[1], B[0], B[1]], cells: [], why });
  if (!w.inCells(x0, z0) || !w.inCells(x1, z1)) return straight('Hors de la carte.');
  if (Math.hypot(x1 - x0, z1 - z0) > FREE_MAX) return straight(`Trop loin : une route libre fait au plus ${FREE_MAX} cases.`);
  const ok = (k: number) => !!w.road[k] || w.canRoad(k % N, Math.floor(k / N));
  if (!ok(w.ci(x0, z0)) || !ok(w.ci(x1, z1))) return straight('On ne pose pas de route ici : bâtiment, pente trop raide ou eau trop profonde.');
  const cells = search(w, w.ci(x0, z0), w.ci(x1, z1));
  if (!cells) return straight('Pas de passage : des bâtiments, l’eau profonde ou des pentes trop raides barrent le chemin.');
  const centre = (k: number): [number, number] => [(k % N) + 0.5, Math.floor(k / N) + 0.5];
  // on garde les cases d'angle, on file tout droit ailleurs tant que la ligne reste praticable
  const keep: [number, number][] = [centre(cells[0])];
  for (let i = 0; i < cells.length - 1;) {
    let j = Math.min(cells.length - 1, i + 12);
    while (j > i + 1 && !fits(w, [...centre(cells[i]), ...centre(cells[j])], true)) j--;
    keep.push(centre(cells[j]));
    i = j;
  }
  // la ligne la plus douce qui passe : trois passes de Chaikin, sinon moins, sinon la ligne brisée
  // (jamais plus d'eau neuve que le chemin cherché : une courbe qui rogne un coin ne doit pas mouiller une case de plus)
  const wetN = (ks: number[]) => ks.filter((k) => w.isWet(k % N, Math.floor(k / N)) && !w.road[k]).length, base = wetN(cells);
  for (const it of [3, 2, 1, 0]) {
    const pts = chaikin(keep, it).flat();
    if (it === 0 || (fits(w, pts, false) && wetN(unique(rasterize(pts, N))) <= base)) return { pts, cells: unique(rasterize(pts, N)), why: null };
  }
  return straight('Pas de passage.');
}

/** Cases sans doublon, dans l'ordre */
const unique = (cells: number[]) => [...new Set(cells)];

/** Coût d'une case pour une route libre (Infinity : on n'y passe pas) */
function cost(w: World, k: number) {
  const x = k % N, z = Math.floor(k / N), v = w.veg[k];
  if (!w.road[k] && !w.canRoad(x, z)) return Infinity;
  let c = 1 + w.cellSlope(x, z) * 2.5;
  if (v === VEG_FOREST) c += 1.5;
  else if (v === VEG_ROCKS) c += 1;
  else if (v === VEG_FIELD || v === VEG_GARDEN) c += 4;
  // l'eau se franchit en pont, cher ; un pont déjà posé se réutilise sans surcoût
  if (w.isWet(x, z) && !w.road[k]) c += 8;
  // une route existante se croise, on ne la longe pas
  if (w.road[k]) c += 1.5;
  // on garde ses distances avec les bâtiments
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && w.inCells(x + dx, z + dz) && w.occ[w.ci(x + dx, z + dz)]) { c += 0.6; dz = 2; break; }
  return c;
}

/** Chemin le moins coûteux de la case `a` à la case `b` (A*, 8-voisinage, sans passer en diagonale entre deux obstacles) */
function search(w: World, a: number, b: number): number[] | null {
  const bx = b % N, bz = Math.floor(b / N), axx = a % N, azz = Math.floor(a / N);
  const lx = Math.max(0, Math.min(axx, bx) - MARGIN), hx = Math.min(N - 1, Math.max(axx, bx) + MARGIN);
  const lz = Math.max(0, Math.min(azz, bz) - MARGIN), hz = Math.min(N - 1, Math.max(azz, bz) + MARGIN);
  const W = hx - lx + 1, H = hz - lz + 1, loc = (k: number) => (Math.floor(k / N) - lz) * W + (k % N) - lx;
  const dist = new Float32Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1), cc = new Float32Array(W * H).fill(-1);
  const costAt = (k: number) => { const i = loc(k); if (cc[i] < 0) cc[i] = cost(w, k); return cc[i]; };
  const h = (k: number) => Math.hypot((k % N) - bx, Math.floor(k / N) - bz);
  const heap = new Heap();
  dist[loc(a)] = 0;
  heap.push(h(a), a);
  while (heap.size) {
    const c = heap.pop(), x = c % N, z = Math.floor(c / N), dc = dist[loc(c)];
    if (c === b) break;
    const hc = w.cellAvg(x, z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (nx < lx || nx > hx || nz < lz || nz > hz) continue;
      const n = nz * N + nx, cn = costAt(n);
      if (!isFinite(cn)) continue;
      const dh = Math.abs(w.cellAvg(nx, nz) - hc);
      if (dh > STEP_H && !w.isWet(nx, nz) && !w.isWet(x, z)) continue;
      if (dx && dz && (!isFinite(costAt(z * N + nx)) || !isFinite(costAt(nz * N + x)))) continue;
      // en diagonale entre deux cases sèches, on ne rogne pas le coin d'une case d'eau (la ligne la mouillerait : un pont de plus)
      if (dx && dz && !w.isWet(x, z) && !w.isWet(nx, nz) && (w.isWet(nx, z) || w.isWet(x, nz))) continue;
      // un nouveau franchissement (de la terre à l'eau, hors pont existant) coûte très cher : peu de ponts, et courts
      const cross = w.isWet(nx, nz) && !w.road[n] && !(w.isWet(x, z) || w.road[c]) ? 12 : 0;
      const nd = dc + cn * (dx && dz ? Math.SQRT2 : 1) + dh * 3 + cross;
      if (nd < dist[loc(n)]) { dist[loc(n)] = nd; prev[loc(n)] = c; heap.push(nd + h(n), n); }
    }
  }
  if (!isFinite(dist[loc(b)])) return null;
  const out: number[] = [];
  for (let c = b; c >= 0; c = prev[loc(c)]) out.push(c);
  return out.reverse();
}

/**
 * La ligne passe-t-elle ? Toutes ses cases praticables (et pas trop coûteuses, si `cheap` : une ligne droite ne coupe pas à
 * travers champs ce que le chemin contournait), et sa chaussée ne frôle aucun bâtiment ni décor
 */
function fits(w: World, pts: number[], cheap: boolean) {
  for (const k of rasterize(pts, N)) {
    const c = cost(w, k);
    if (!isFinite(c) || (cheap && c > 4)) return false;
  }
  const s = sampleCurve(pts);
  for (let i = 0; i + 3 < s.length; i += 2) {
    const dx = s[i + 2] - s[i], dz = s[i + 3] - s[i + 1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    for (const o of [-BAND, BAND]) {
      const x = Math.floor(s[i] + nx * o), z = Math.floor(s[i + 1] + nz * o);
      if (!w.inCells(x, z)) return false;
      const k = w.ci(x, z);
      if (w.occ[k] || w.decor[k]) return false;
    }
  }
  return true;
}
