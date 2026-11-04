import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS } from '../world/world';
import { Building, sizeOf } from './catalog';
import { FRONT, doorCells, doorSide, facingRoadRot, nearRoadSide, sideCells } from './placement';
import { Heap } from '../sim/agents';

/** Longueur maximale d'un chemin d'accès, et d'une jonction entre un hameau et le village */
const MAX_LINK = 14, MAX_JOIN = 18;
/** Un hameau isolé se relie au reste quand il compte autant de bâtiments */
const HAMLET = 3;
/** Surcoût d'un virage : les chemins vont droit, en L plutôt qu'en escalier */
const TURN = 0.6;
/** Surcoût d'une case au milieu d'un terrain libre, selon les emplacements de 3 × 3 et de 2 × 2 qu'elle gâcherait */
const OPEN3 = 1.6, OPEN2 = 0.6;
/**
 * Surcoût d'une porte sur un autre côté que la façade (qui se tourne ensuite vers le chemin) : faible si rien ne l'orientait,
 * plus fort si elle regardait déjà une route toute proche
 */
const SIDE = 0.4, AIMED = 2;
/** Surcoût d'une arrivée contre deux routes à la fois (elle fermerait une boucle) */
const TWICE = 4;
/**
 * Surcoût d'une case qui longe le flanc ou l'arrière d'un bâtiment, quand il n'y a pas d'autre tracé ; et le plus grand détour
 * (en surcoût) qu'on fait pour l'éviter
 */
const FLANK = 3, DETOUR = 7;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const isShore = (b: Building) => b.kind === 'pier' || b.kind === 'harbor';

/**
 * Routes automatiques, à la pose d'un bâtiment : un seul chemin, le plus court et le plus droit possible, de sa porte jusqu'à
 * la route la plus proche (ou, sans route encore, jusqu'à la porte du bâtiment le plus proche). Un bâtiment n'est relié au
 * réseau que par sa porte : orienté de lui-même, il l'ouvre côté route, ou d'un autre côté s'il est bien plus commode (sa
 * façade s'y tourne) ; orienté à la main, il garde la sienne. Discrètes : rien si la porte donne déjà sur une route, rien pour
 * un lampadaire, rien de plus long que quelques cases. Le chemin longe les façades plutôt que de couper les terrains libres où
 * tiendrait un grand bâtiment, jamais le flanc ni l'arrière d'un bâtiment (sauf s'il n'y a pas d'autre tracé), évite champs,
 * jardins, pentes et l'eau, ne longe jamais une route existante et ne la rejoint qu'en un point (ni doublon, ni boucle, ni
 * carré de route). Un hameau qui grandit (trois bâtiments) se relie une fois au village s'il en est proche. Renvoie le nombre
 * de cases de route posées
 */
export function autoRoad(w: World, b: Building): number {
  if (b.kind === 'lamp') return 0;
  const shore = isShore(b), side = new Map<number, number>();
  let starts: number[] = [];
  if (shore) {
    // le ponton et le port ont leur façade sur l'eau : leur accès part de l'arrière, côté terre (d'ailleurs s'il est pris), et
    // ne passe jamais sur l'eau (pas de pont qui longe le quai)
    const ring = ringCells(w, b);
    if (ring.some((k) => w.road[k])) return 0;
    const ok = (k: number) => w.canRoad(k % N, Math.floor(k / N)) && !w.isWet(k % N, Math.floor(k / N));
    const back = doors(w, b, doorSide(b.kind, b.rot)).filter(ok);
    starts = back.length ? back : ring.filter(ok);
  } else {
    // orienté de lui-même, la façade d'abord tournée vers la route la plus proche (comme on la voyait à la pose) ; une porte
    // qui donne déjà sur une route : la façade s'y tourne, rien à poser
    if (b.auto) b.rot = facingRoadRot(w, b.kind, b.x, b.z, b.rot, sizeOf(b));
    const sides = doorSides(b);
    for (const r of sides) if (doors(w, b, r).some((k) => w.road[k])) { b.rot = r; return 0; }
    // sinon on part de devant une porte : celle de la façade, ou, orienté de lui-même, celle d'un autre côté
    for (const r of sides) for (const k of doors(w, b, r)) if (w.canRoad(k % N, Math.floor(k / N)) && !side.has(k)) { starts.push(k); side.set(k, r); }
  }
  if (!starts.length) return 0;
  let added = 0;
  // vers le réseau, sinon vers la porte du bâtiment voisin le plus proche (rien pour le tout premier)
  const hasRoads = w.road.some((v) => v === 1), near = hasRoads ? null : nearDoor(w, b);
  if (near && !near.any) return 0;
  const goal = near ? near.goal : (k: number) => w.road[k] === 1;
  // une porte ailleurs que sur la façade se paie, davantage si la façade regarde une route toute proche
  const other = nearRoadSide(w, b.x, b.z, sizeOf(b)) < 0 ? SIDE : AIMED;
  const first = (k: number, price: (k: number) => number) => price(k) + ((side.get(k) ?? b.rot) === b.rot ? 0 : other);
  const path = wisest(w, starts, goal, MAX_LINK, first, b.id, shore);
  if (path) {
    added += lay(w, path);
    // la façade se tourne vers le chemin (et celle du voisin qui l'accueille, sans route encore)
    if (!shore) b.rot = side.get(path[0]) ?? b.rot;
    near?.welcome(path[path.length - 1]);
  }
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

/** Côtés où peut s'ouvrir la porte d'un bâtiment : le sien ; orienté de lui-même, n'importe lequel, le sien d'abord */
function doorSides(b: Building) {
  const d = doorSide(b.kind, b.rot);
  return b.auto && !isShore(b) ? [d, (d + 1) % 4, (d + 3) % 4, (d + 2) % 4] : [d];
}

/** Cases devant la porte d'un bâtiment, si elle s'ouvre du côté `side` (le ponton et le port : tout leur arrière, côté terre) */
function doors(w: World, b: Building, side: number) {
  const s = sizeOf(b), cells = isShore(b) ? sideCells(b.x, b.z, s, side) : doorCells(b.kind, b.x, b.z, s, side);
  return cells.filter(([x, z]) => w.inCells(x, z)).map(([x, z]) => w.ci(x, z));
}

/**
 * But « devant la porte d'un autre bâtiment » (hors lampadaires), pour les tout premiers chemins : orienté de lui-même, ce
 * voisin l'ouvre sur n'importe quel côté, et `welcome` (la case d'arrivée) tourne sa façade vers le chemin
 */
function nearDoor(w: World, self: Building) {
  const at = new Map<number, [Building, number]>();
  for (const o of w.buildings.values()) {
    if (o.id === self.id || o.kind === 'lamp') continue;
    const own = doorSide(o.kind, o.rot);
    // (une case devant deux portes : celle qui s'y ouvre déjà l'emporte)
    for (const r of doorSides(o)) for (const k of doors(w, o, r)) if (!at.has(k) || r === own) at.set(k, [o, r]);
  }
  return {
    any: at.size > 0,
    goal: (k: number) => at.has(k),
    welcome: (k: number) => { const e = at.get(k); if (e && !isShore(e[0])) e[0].rot = e[1]; },
  };
}

/**
 * La case longe-t-elle le flanc ou l'arrière d'un bâtiment (un côté sans porte) ? 0 : non ; 1 : celui d'un voisin ; 2 : celui
 * du bâtiment qu'on relie (`self`), qui ne se borde que devant ses portes (`doors`, les départs du chemin)
 */
function flank(w: World, k: number, self: number, doors: Set<number>) {
  const x = k % N, z = Math.floor(k / N);
  let out = 0;
  for (let r = 0; r < 4; r++) {
    // la case est du côté r du bâtiment qui la touche
    const o = w.buildingAt(x - FRONT[r][0], z - FRONT[r][1]);
    if (!o || o.kind === 'lamp') continue;
    if (o.id === self) { if (!doors.has(k)) return 2; } else if (r !== doorSide(o.kind, o.rot)) out = 1;
  }
  return out;
}

/**
 * Le tracé le plus sage : sans longer le flanc d'aucun bâtiment ni faire de carré de route, à moins que ce ne soit un grand
 * détour (une ruelle entre deux maisons vaut mieux que le tour du pâté) ; sinon, contre le flanc d'un voisin ; sinon (un
 * bâtiment coincé entre les routes), en faisant aussi un carré ; en dernier recours seulement, contre son propre flanc
 */
function wisest(w: World, starts: number[], goal: (k: number) => boolean, max: number, first: (k: number, price: (k: number) => number) => number, self: number, noWater = false) {
  const spoil = spoiled(w), run = (level: number) => cheapest(w, starts, goal, max, first, spoil, self, noWater, level);
  // le plus court en s'autorisant le flanc d'un voisin : s'il n'en longe aucun, c'est aussi le plus court sans
  const loose = run(1), doors = new Set(starts);
  if (!loose) return (run(2) ?? run(3))?.path ?? null;
  if (!loose.path.some((k) => !w.road[k] && !goal(k) && flank(w, k, self, doors))) return loose.path;
  const strict = run(0);
  return strict && strict.cost <= loose.cost + DETOUR ? strict.path : loose.path;
}

/**
 * Chemin le moins coûteux (Dijkstra, 4-voisinage, en tenant compte des virages) depuis les départs jusqu'à une case qui
 * remplit le but ; null au-delà de `max` cases. `first` : coût d'une case de départ (`price` donne celui d'une case). Une case
 * qui touche le but n'a plus qu'à y entrer : le chemin ne longe jamais une route, et ne passe pas contre une route qui n'est
 * pas le but (le réseau du hameau qui se relie). Ce qu'on s'autorise, selon `level` (et qui coûte alors cher) : 0, rien ; 1,
 * le flanc d'un voisin ; 2, et un carré de route ; 3, et le flanc du bâtiment qu'on relie (`self`)
 */
function cheapest(w: World, starts: number[], goal: (k: number) => boolean, max: number, first: (k: number, price: (k: number) => number) => number, spoil: (x: number, z: number) => number, self: number, noWater: boolean, level: number): { path: number[]; cost: number } | null {
  // terrain fouillé : les départs et `max` cases autour
  let lx = N, lz = N, hx = 0, hz = 0;
  for (const k of starts) { const x = k % N, z = Math.floor(k / N); lx = Math.min(lx, x); hx = Math.max(hx, x); lz = Math.min(lz, z); hz = Math.max(hz, z); }
  lx = Math.max(0, lx - max); lz = Math.max(0, lz - max); hx = Math.min(N - 1, hx + max); hz = Math.min(N - 1, hz + max);
  const W = hx - lx + 1, cells = W * (hz - lz + 1), loc = (k: number) => (Math.floor(k / N) - lz) * W + (k % N) - lx;
  const prices = new Float32Array(cells).fill(-1);
  const price = (k: number) => { const i = loc(k); if (prices[i] < 0) prices[i] = cost(w, k, spoil); return prices[i]; };
  const isStart = new Set(starts);
  /**
   * Surcoût d'une case neuve, venant de `c` (Infinity : pas de route ici) : pas de carré de route, pas contre une route qui
   * n'est pas le but, pas le long du flanc d'un bâtiment ; contre deux routes du but à la fois, elle fermerait une boucle
   */
  const fresh = (n: number, c: number) => {
    const nx = n % N, nz = Math.floor(n / N), sq = square(w, n, c);
    if (w.road[n] || !w.canRoad(nx, nz) || (sq && level < 2)) return Infinity;
    const side = flank(w, n, self, isStart);
    if ((side === 1 && level < 1) || (side === 2 && level < 3)) return Infinity;
    let touch = 0;
    for (const [ex, ez] of DIRS) {
      const mx = nx + ex, mz = nz + ez, m = mz * N + mx;
      if (!w.inCells(mx, mz) || m === c || !w.road[m]) continue;
      if (!goal(m)) return Infinity;
      touch++;
    }
    return (touch > 1 ? TWICE : 0) + (sq ? TWICE : 0) + (side ? FLANK : 0);
  };
  // états : une case et la direction par laquelle on y est arrivé (un virage se paie)
  const dist = new Float32Array(cells * 4).fill(Infinity), prev = new Int32Array(cells * 4).fill(-1), steps = new Uint8Array(cells * 4), done = new Uint8Array(cells * 4);
  const heap = new Heap();
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
      return { path: out.reverse(), cost: dist[st] };
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
  const path = wisest(w, [...net], (k) => w.road[k] === 1 && !net.has(k), MAX_JOIN, () => 0, -1);
  return path ? lay(w, path) : 0;
}
