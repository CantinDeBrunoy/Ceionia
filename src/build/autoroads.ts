import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS } from '../world/world';
import { Building, KINDS } from './catalog';
import { FRONT } from './placement';

/** Longueur maximale d'un chemin d'accès, et d'une jonction entre un hameau et le village */
const MAX_LINK = 14, MAX_JOIN = 18;
/** Un hameau isolé se relie au reste quand il compte autant de bâtiments */
const HAMLET = 3;

/**
 * Routes automatiques, à la pose d'un bâtiment : un seul chemin, depuis sa porte, jusqu'à la route la plus proche (ou, sans
 * route encore, jusqu'au bâtiment le plus proche). Mesurées : rien si le bâtiment touche déjà une route, rien pour un
 * lampadaire, rien de plus long que quelques cases ; le tracé évite champs, jardins, forêts, pentes et l'eau, et ne double pas
 * une route existante. Un hameau qui grandit (trois bâtiments) se relie une fois au village s'il en est proche.
 * Renvoie le nombre de cases de route posées
 */
export function autoRoad(w: World, b: Building): number {
  if (b.kind === 'lamp') return 0;
  const ring = ringCells(w, b);
  if (ring.some((k) => w.road[k])) return 0;
  // départ : devant la porte si possible, sinon tout autour
  const f = FRONT[b.rot], s = KINDS[b.kind].size;
  const front = ring.filter((k) => {
    const x = k % N, z = Math.floor(k / N);
    return f[0] ? x === (f[0] > 0 ? b.x + s : b.x - 1) : z === (f[1] > 0 ? b.z + s : b.z - 1);
  }).filter((k) => w.canRoad(k % N, Math.floor(k / N)));
  const starts = front.length ? front : ring.filter((k) => w.canRoad(k % N, Math.floor(k / N)));
  if (!starts.length) return 0;
  let added = 0;
  const hasRoads = w.road.some((v) => v === 1);
  // vers le réseau, sinon vers le bâtiment voisin le plus proche
  const goal = hasRoads ? (k: number) => w.road[k] === 1 : nearBuilding(w, b);
  const path = cheapest(w, starts, goal, MAX_LINK, new Set());
  if (path) added += lay(w, path);
  // un hameau qui atteint trois bâtiments se relie au village, une fois
  added += joinHamlet(w, b);
  return added;
}

/** Cases qui bordent l'emprise d'un bâtiment (4-voisinage) */
function ringCells(w: World, b: Building) {
  const s = KINDS[b.kind].size, out: number[] = [];
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
 * Chemin le moins coûteux (Dijkstra, 4-voisinage) depuis les départs jusqu'à une case qui remplit le but ; null au-delà
 * de `max` cases. Coûts : herbe 1, pente, forêt, rocaille, eau (pont) plus chères ; champs et jardins à éviter ; une case qui
 * longe une route existante est chère aussi (pas de routes en double)
 */
function cheapest(w: World, starts: number[], goal: (k: number) => boolean, max: number, avoid: Set<number>): number[] | null {
  const dist = new Float32Array(N * N).fill(Infinity), steps = new Uint16Array(N * N), prev = new Int32Array(N * N).fill(-1);
  const open: number[] = [];
  for (const k of starts) { dist[k] = cost(w, k, true); open.push(k); }
  while (open.length) {
    // petite file : on prend le moins cher (les chemins restent courts)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const c = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (goal(c) && !starts.includes(c)) {
      const out: number[] = [];
      for (let k = c; k >= 0; k = prev[k]) out.push(k);
      return out.reverse();
    }
    if (steps[c] >= max) continue;
    const x = c % N, z = Math.floor(c / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!w.inCells(nx, nz)) continue;
      const k = nz * N + nx;
      if (avoid.has(k)) continue;
      const isGoal = goal(k);
      if (!isGoal && !w.canRoad(nx, nz)) continue;
      const d = dist[c] + (isGoal ? 0 : cost(w, k, false));
      if (d < dist[k]) { dist[k] = d; steps[k] = steps[c] + 1; prev[k] = c; open.push(k); }
    }
  }
  return null;
}

function cost(w: World, k: number, start: boolean) {
  const x = k % N, z = Math.floor(k / N), v = w.veg[k];
  let c = 1 + w.cellSlope(x, z) * 1.5;
  if (v === VEG_FOREST) c += 1.5;
  else if (v === VEG_ROCKS) c += 1;
  else if (v === VEG_FIELD || v === VEG_GARDEN) c += 6;
  if (w.isWet(x, z)) c += 3;
  // pas de route qui en longe une autre
  if (!start && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.inCells(x + dx, z + dz) && w.road[w.ci(x + dx, z + dz)])) c += 1.5;
  return c;
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
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
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
  const path = cheapest(w, [...net], (k) => w.road[k] === 1 && !net.has(k), MAX_JOIN, new Set());
  return path ? lay(w, path) : 0;
}
