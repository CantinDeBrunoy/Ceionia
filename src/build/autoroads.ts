import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS } from '../world/world';
import { Building, sizeOf } from './catalog';
import { FRONT } from './placement';
import { Heap } from '../sim/agents';

/** Longueur maximale d'un chemin d'accès, et d'une jonction entre un hameau et le village */
const MAX_LINK = 14, MAX_JOIN = 18;
/** Un hameau isolé se relie au reste quand il compte autant de bâtiments */
const HAMLET = 3;
/** Surcoût d'un virage : les chemins vont droit, en L plutôt qu'en escalier */
const TURN = 0.6;
/** Surcoût d'une case au milieu d'un terrain libre, selon les emplacements de 3 × 3 et de 2 × 2 qu'elle gâcherait */
const OPEN3 = 1.6, OPEN2 = 0.6;
/** Surcoût d'un départ par un autre côté que la façade (la façade se tourne ensuite vers le chemin) */
const SIDE = 0.4;
/** Surcoût d'une arrivée contre deux routes à la fois (elle fermerait une boucle) */
const TWICE = 4;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Routes automatiques, à la pose d'un bâtiment : un seul chemin, le plus court et le plus droit possible, jusqu'à la route la
 * plus proche (ou, sans route encore, jusqu'au bâtiment le plus proche). Discrètes : rien si le bâtiment touche déjà une
 * route, rien pour un lampadaire, rien de plus long que quelques cases. Le chemin part du côté le plus commode (la façade se
 * tourne ensuite vers lui), longe les bâtiments plutôt que de couper les terrains libres où tiendrait un grand bâtiment, évite
 * champs, jardins, pentes et l'eau, ne longe jamais une route existante et ne la rejoint qu'en un point (ni doublon, ni
 * boucle, ni carré de route). Un hameau qui grandit (trois bâtiments) se relie une fois au village s'il en est proche.
 * Renvoie le nombre de cases de route posées
 */
export function autoRoad(w: World, b: Building): number {
  if (b.kind === 'lamp') return 0;
  const ring = ringCells(w, b);
  if (ring.some((k) => w.road[k])) return 0;
  // départ : de n'importe quel côté, la façade d'abord ; un bâtiment orienté à la main part de sa porte si possible. Le ponton
  // et le port ont leur façade sur l'eau : leur accès part de l'arrière, côté terre, et ne passe jamais sur l'eau (pas de pont
  // qui longe le quai)
  const shore = b.kind === 'pier' || b.kind === 'harbor';
  const f = shore ? [-FRONT[b.rot][0], -FRONT[b.rot][1]] : FRONT[b.rot], s = sizeOf(b);
  const dry = (k: number) => !shore || !w.isWet(k % N, Math.floor(k / N));
  const isFront = (k: number) => {
    const x = k % N, z = Math.floor(k / N);
    return f[0] ? x === (f[0] > 0 ? b.x + s : b.x - 1) : z === (f[1] > 0 ? b.z + s : b.z - 1);
  };
  const open = ring.filter((k) => w.canRoad(k % N, Math.floor(k / N)) && dry(k));
  const front = open.filter(isFront);
  const starts = (shore || !b.auto) && front.length ? front : open;
  if (!starts.length) return 0;
  let added = 0;
  const hasRoads = w.road.some((v) => v === 1);
  // vers le réseau, sinon vers le bâtiment voisin le plus proche
  const goal = hasRoads ? (k: number) => w.road[k] === 1 : nearBuilding(w, b);
  const first = (k: number, price: (k: number) => number) => price(k) + (isFront(k) ? 0 : SIDE);
  // un carré de route (une place) seulement si c'est le seul moyen de relier le bâtiment, coincé entre les routes
  const path = cheapest(w, starts, goal, MAX_LINK, first, shore) ?? cheapest(w, starts, goal, MAX_LINK, first, shore, true);
  if (path) added += lay(w, path);
  // un hameau qui atteint trois bâtiments se relie au village, une fois
  added += joinHamlet(w, b);
  return added;
}

/** Cases qui bordent l'emprise d'un bâtiment (4-voisinage) */
function ringCells(w: World, b: Building) {
  const s = sizeOf(b), out: number[] = [];
  for (let i = 0; i < s; i++) for (const [x, z] of [[b.x + i, b.z - 1], [b.x + i, b.z + s], [b.x - 1, b.z + i], [b.x + s, b.z + i]]) if (w.inCells(x, z)) out.push(w.ci(x, z));
  return out;
}

/** But « à côté d'un autre bâtiment » (hors lampadaires), pour les tout premiers chemins */
function nearBuilding(w: World, self: Building) {
  const ring = new Set<number>();
  for (const o of w.buildings.values()) if (o.id !== self.id && o.kind !== 'lamp') for (const k of ringCells(w, o)) ring.add(k);
  return (k: number) => ring.has(k);
}

/**
 * Chemin le moins coûteux (Dijkstra, 4-voisinage, en tenant compte des virages) depuis les départs jusqu'à une case qui
 * remplit le but ; null au-delà de `max` cases. `first` : coût d'une case de départ (`price` donne celui d'une case). Une case
 * qui touche le but n'a plus qu'à y entrer : le chemin ne longe jamais une route, et ne passe pas contre une route qui n'est
 * pas le but (le réseau du hameau qui se relie). Jamais de carré de route, sauf si `squares` (il coûte alors cher)
 */
function cheapest(w: World, starts: number[], goal: (k: number) => boolean, max: number, first: (k: number, price: (k: number) => number) => number, noWater = false, squares = false): number[] | null {
  // terrain fouillé : les départs et `max` cases autour
  let lx = N, lz = N, hx = 0, hz = 0;
  for (const k of starts) { const x = k % N, z = Math.floor(k / N); lx = Math.min(lx, x); hx = Math.max(hx, x); lz = Math.min(lz, z); hz = Math.max(hz, z); }
  lx = Math.max(0, lx - max); lz = Math.max(0, lz - max); hx = Math.min(N - 1, hx + max); hz = Math.min(N - 1, hz + max);
  const W = hx - lx + 1, cells = W * (hz - lz + 1), loc = (k: number) => (Math.floor(k / N) - lz) * W + (k % N) - lx;
  const prices = new Float32Array(cells).fill(-1), spoil = spoiled(w);
  const price = (k: number) => { const i = loc(k); if (prices[i] < 0) prices[i] = cost(w, k, spoil); return prices[i]; };
  /**
   * Surcoût d'une case neuve, venant de `c` (Infinity : pas de route ici) : pas de carré de route, pas contre une route qui
   * n'est pas le but ; contre deux routes du but à la fois, elle fermerait une boucle
   */
  const fresh = (n: number, c: number) => {
    const nx = n % N, nz = Math.floor(n / N), sq = square(w, n, c);
    if (w.road[n] || !w.canRoad(nx, nz) || (sq && !squares)) return Infinity;
    let touch = 0;
    for (const [ex, ez] of DIRS) {
      const mx = nx + ex, mz = nz + ez, m = mz * N + mx;
      if (!w.inCells(mx, mz) || m === c || !w.road[m]) continue;
      if (!goal(m)) return Infinity;
      touch++;
    }
    return (touch > 1 ? TWICE : 0) + (sq ? TWICE : 0);
  };
  // états : une case et la direction par laquelle on y est arrivé (un virage se paie)
  const dist = new Float32Array(cells * 4).fill(Infinity), prev = new Int32Array(cells * 4).fill(-1), steps = new Uint8Array(cells * 4), done = new Uint8Array(cells * 4);
  const isStart = new Set(starts), heap = new Heap();
  for (const k of isStart) {
    const c = first(k, price) + (w.road[k] ? 0 : fresh(k, -1));
    if (c === Infinity) continue;
    for (let d = 0; d < 4; d++) { dist[loc(k) * 4 + d] = c; heap.push(c, loc(k) * 4 + d); }
  }
  const cellOf = (st: number) => { const i = st >> 2; return (lz + Math.floor(i / W)) * N + lx + (i % W); };
  while (heap.size) {
    const st = heap.pop();
    if (done[st]) continue;
    done[st] = 1;
    const c = cellOf(st), d = st & 3;
    if (goal(c)) {
      const out: number[] = [];
      for (let t = st; t >= 0; t = prev[t]) out.push(cellOf(t));
      return out.reverse();
    }
    if (steps[st] >= max) continue;
    const x = c % N, z = Math.floor(c / N);
    // contre le but : on y entre, on ne le longe pas
    const last = !isStart.has(c) && DIRS.some(([dx, dz]) => w.inCells(x + dx, z + dz) && goal(w.ci(x + dx, z + dz)));
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DIRS[nd][0], nz = z + DIRS[nd][1];
      if (nx < lx || nx > hx || nz < lz || nz > hz || (noWater && w.isWet(nx, nz))) continue;
      const n = nz * N + nx, isGoal = goal(n);
      if (last && !isGoal) continue;
      let step = 0;
      if (!isGoal) {
        const extra = fresh(n, c);
        if (extra === Infinity) continue;
        step = price(n) + extra;
      }
      if (nd !== d) step += TURN;
      const ns = loc(n) * 4 + nd, nv = dist[st] + step;
      if (nv < dist[ns]) { dist[ns] = nv; prev[ns] = st; steps[ns] = steps[st] + 1; heap.push(nv, ns); }
    }
  }
  return null;
}

/** La case `k` posée en route (avec `c`, la case d'avant), quatre cases de route feraient-elles un carré ? */
function square(w: World, k: number, c: number) {
  const x = k % N, z = Math.floor(k / N);
  const road = (cx: number, cz: number) => w.inCells(cx, cz) && (w.road[cz * N + cx] === 1 || cz * N + cx === c);
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (road(x + dx, z) && road(x, z + dz) && road(x + dx, z + dz)) return true;
  return false;
}

/** Coût d'une case : herbe 1, pente, forêt, rocaille, eau (pont) plus chères ; champs et jardins à éviter ; terrain libre aussi */
function cost(w: World, k: number, spoil: (x: number, z: number) => number) {
  const x = k % N, z = Math.floor(k / N), v = w.veg[k];
  let c = 1 + w.cellSlope(x, z) * 1.5;
  // (quelques arbres abattus valent mieux qu'un détour)
  if (v === VEG_FOREST) c += 0.8;
  else if (v === VEG_ROCKS) c += 0.8;
  else if (v === VEG_FIELD || v === VEG_GARDEN) c += 6;
  if (w.isWet(x, z)) c += 4;
  return c + spoil(x, z);
}

/**
 * Ce que gâcherait une route sur une case : la part des emplacements libres de 3 × 3 et de 2 × 2 qui la contiennent (au
 * milieu d'un pré, tous ; contre un bâtiment, un tiers ; entre deux bâtiments, aucun). Mémorisé le temps d'un tracé
 */
function spoiled(w: World) {
  const memo = [new Map<number, boolean>(), new Map<number, boolean>()];
  const fits = (x: number, z: number, s: 2 | 3) => {
    const m = memo[s - 2], key = z * N + x;
    let f = m.get(key);
    if (f === undefined) { f = w.canPlace('house', x, z, s) === null; m.set(key, f); }
    return f;
  };
  return (x: number, z: number) => {
    let n3 = 0, n2 = 0;
    for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) if (fits(x - dx, z - dz, 3)) n3++;
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) if (fits(x - dx, z - dz, 2)) n2++;
    return (n3 / 9) * OPEN3 + (n2 / 4) * OPEN2;
  };
}

/** Pose la route le long du chemin (les cases déjà en route ne comptent pas) */
function lay(w: World, path: number[]) {
  let n = 0;
  for (const k of path) if (!w.road[k] && w.setRoad(k % N, Math.floor(k / N), true)) n++;
  return n;
}

/** Composante de routes contenant une case (parcours du réseau) */
function component(w: World, k0: number) {
  const seen = new Set<number>([k0]), q = [k0];
  for (let i = 0; i < q.length; i++) {
    const x = q[i] % N, z = Math.floor(q[i] / N);
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz, k = nz * N + nx;
      if (w.inCells(nx, nz) && w.road[k] && !seen.has(k)) { seen.add(k); q.push(k); }
    }
  }
  return seen;
}

/** Hameau : réseau qui dessert exactement HAMLET bâtiments ; on le relie au réseau voisin le plus proche, s'il est assez près */
function joinHamlet(w: World, b: Building) {
  const touch = ringCells(w, b).find((k) => w.road[k]);
  if (touch === undefined) return 0;
  const net = component(w, touch);
  let served = 0;
  for (const o of w.buildings.values()) if (o.kind !== 'lamp' && ringCells(w, o).some((k) => net.has(k))) served++;
  if (served !== HAMLET) return 0;
  const path = cheapest(w, [...net], (k) => w.road[k] === 1 && !net.has(k), MAX_JOIN, () => 0);
  return path ? lay(w, path) : 0;
}
