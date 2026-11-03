import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { autoRoad } from '../src/build/autoroads';
import { facingRoadRot, FRONT } from '../src/build/placement';
import { KINDS, KindId, Building, sizeOf } from '../src/build/catalog';
import { mulberry32 } from '../src/core/rng';

/** Le continent, toujours la même graine : les tests ne dépendent pas du hasard */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

type Snap = ReturnType<World['snapshot']>;
type RoadFn = (w: World, b: Building) => number;

/** Rayon (en cases) de la plaine où l'on bâtit le village */
const R = 18;

/** Centre de la plus grande plaine : la fenêtre de (2R + 1)² cases qui compte le plus de cases où bâtir une maison */
function plain(w: World): [number, number] {
  const S = N + 1, sum = new Int32Array(S * S);
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const ok = w.canPlace('house', x, z) === null && w.cellSlope(x, z) < 0.3 ? 1 : 0;
      sum[(z + 1) * S + x + 1] = ok + sum[z * S + x + 1] + sum[(z + 1) * S + x] - sum[z * S + x];
    }
  let best = -1, at: [number, number] = [0, 0];
  for (let z = R; z < N - R; z++)
    for (let x = R; x < N - R; x++) {
      const x0 = x - R, z0 = z - R, x1 = x + R + 1, z1 = z + R + 1;
      const n = sum[z1 * S + x1] - sum[z0 * S + x1] - sum[z1 * S + x0] + sum[z0 * S + x0];
      if (n > best) { best = n; at = [x, z]; }
    }
  return at;
}

/** Les vingt bâtiments d'un petit village, dans l'ordre où on les pose : surtout des maisons, quelques grands */
const VILLAGE: KindId[] = ['house', 'house', 'farm', 'well', 'house', 'workshop', 'house', 'farm', 'house', 'temple', 'house', 'house', 'school', 'farm', 'house', 'health', 'house', 'well', 'house', 'house'];

interface Spot { kind: KindId; x: number; z: number }

/**
 * Le village que veut un joueur (graine `seed`), sans route : chaque bâtiment près d'un autre déjà posé, à un écart de
 * `gap[0]` à `gap[1]` cases (0 : collé), comme on clique autour du village
 */
function wanted(w: World, cx: number, cz: number, seed: number, gap: [number, number]): Spot[] {
  const rnd = mulberry32(seed), out: Spot[] = [], snap = w.snapshot();
  for (const kind of VILLAGE) {
    const s = KINDS[kind].size;
    for (let t = 0; t < 200; t++) {
      let x = cx, z = cz;
      if (out.length) {
        const a = out[Math.floor(rnd() * out.length)], as = KINDS[a.kind].size;
        // un côté de l'ancre, un écart, un décalage le long de ce côté
        const side = Math.floor(rnd() * 4), g = gap[0] + Math.floor(rnd() * (gap[1] - gap[0] + 1)), along = Math.floor(rnd() * (as + s + 1)) - s;
        if (side === 0) { x = a.x + along; z = a.z + as + g; }
        else if (side === 1) { x = a.x + as + g; z = a.z + along; }
        else if (side === 2) { x = a.x + along; z = a.z - s - g; }
        else { x = a.x - s - g; z = a.z + along; }
      }
      if (Math.abs(x - cx) > R - 4 || Math.abs(z - cz) > R - 4 || w.canPlace(kind, x, z) !== null) continue;
      w.place(kind, x, z, 0, true, 0, false);
      out.push({ kind, x, z });
      break;
    }
  }
  w.restore(snap);
  return out;
}

/**
 * Pose ce village avec des routes automatiques, comme l'outil de pose (façade vers la route proche, puis le chemin). Une case
 * prise par une route : le joueur essaie juste à côté (refus comptés)
 */
function build(w: World, spots: Spot[], road: RoadFn = autoRoad) {
  let refused = 0, rot = 0;
  const placed: Building[] = [];
  for (const sp of spots) {
    let at: [number, number] | null = null;
    for (let r = 0; r <= 3 && !at; r++)
      for (let dz = -r; dz <= r && !at; dz++)
        for (let dx = -r; dx <= r && !at; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const why = w.canPlace(sp.kind, sp.x + dx, sp.z + dz);
          if (why === null) at = [sp.x + dx, sp.z + dz];
          else if (r === 0 && why === 'Une route est déjà ici') refused++;
        }
    if (!at) continue;
    rot = facingRoadRot(w, sp.kind, at[0], at[1], rot);
    const b = w.place(sp.kind, at[0], at[1], rot, true, 0, false);
    road(w, b);
    placed.push(b);
  }
  return { refused, placed };
}

/** Cases qui bordent l'emprise d'un bâtiment */
function ring(w: World, b: Building) {
  const s = sizeOf(b), out: number[] = [];
  for (let i = 0; i < s; i++) for (const [x, z] of [[b.x + i, b.z - 1], [b.x + i, b.z + s], [b.x - 1, b.z + i], [b.x + s, b.z + i]]) if (w.inCells(x, z)) out.push(w.ci(x, z));
  return out;
}

/** Le cadre du village voulu, élargi de trois cases : là où l'on bâtira ensuite */
function around(spots: Spot[]) {
  let x0 = N, z0 = N, x1 = 0, z1 = 0;
  for (const sp of spots) { const s = KINDS[sp.kind].size; x0 = Math.min(x0, sp.x); z0 = Math.min(z0, sp.z); x1 = Math.max(x1, sp.x + s - 1); z1 = Math.max(z1, sp.z + s - 1); }
  return [x0 - 3, z0 - 3, x1 + 3, z1 + 3];
}

/**
 * Mesures de la voirie autour du village : cases de route, emplacements libres de 2 × 2 et de 3 × 3 dans le cadre, coudes,
 * carrés de route (deux routes côte à côte), boucles, bâtiments sans route contre eux, réseaux qui desservent le village
 */
function measure(w: World, box: number[], placed: Building[]) {
  const road = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1;
  let cells = 0, edges = 0, blocks = 0, turns = 0, free2 = 0, free3 = 0;
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      if (!road(x, z)) continue;
      cells++;
      if (road(x + 1, z)) edges++;
      if (road(x, z + 1)) edges++;
      if (road(x + 1, z) && road(x, z + 1) && road(x + 1, z + 1)) blocks++;
      // un coude : deux routes voisines, l'une en long, l'autre en travers (un escalier en compte beaucoup)
      const ew = +road(x - 1, z) + +road(x + 1, z), ns = +road(x, z - 1) + +road(x, z + 1);
      if (ew === 1 && ns === 1) turns++;
    }
  const net = new Int32Array(N * N).fill(-1);
  let nets = 0;
  for (let k0 = 0; k0 < N * N; k0++) {
    if (!w.road[k0] || net[k0] >= 0) continue;
    const q = [k0];
    net[k0] = nets;
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % N, z = Math.floor(q[i] / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (road(x + dx, z + dz) && net[w.ci(x + dx, z + dz)] < 0) { net[w.ci(x + dx, z + dz)] = nets; q.push(w.ci(x + dx, z + dz)); }
    }
    nets++;
  }
  let unlinked = 0;
  const served = new Set<number>();
  for (const b of placed) {
    const r = ring(w, b).filter((k) => w.road[k]);
    if (!r.length) unlinked++;
    for (const k of r) served.add(net[k]);
  }
  for (let z = box[1]; z <= box[3]; z++)
    for (let x = box[0]; x <= box[2]; x++) {
      if (w.canPlace('house', x, z, 2) === null) free2++;
      if (w.canPlace('house', x, z, 3) === null) free3++;
    }
  // boucles : cycles indépendants du réseau (arêtes − cases + composantes)
  return { cells, free2, free3, turns, blocks, loops: edges - cells + nets, unlinked, nets: served.size };
}

type Row = Record<string, number>;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Les villages des huit graines, bâtis avec ces routes automatiques ; une ligne de mesures par graine, et leur moyenne */
function villages(w: World, base: Snap, cx: number, cz: number, gap: [number, number], road: RoadFn) {
  const rows: Row[] = [];
  for (const seed of SEEDS) {
    w.restore(base);
    const spots = wanted(w, cx, cz, seed, gap), box = around(spots);
    // sans aucune route : la place qu'offre le village seul
    for (const sp of spots) w.place(sp.kind, sp.x, sp.z, 0, true, 0, false);
    const bare = measure(w, box, []);
    w.restore(base);
    const { refused, placed } = build(w, spots, road);
    rows.push({ seed, n: placed.length, ...measure(w, box, placed), refused, bare2: bare.free2, bare3: bare.free3 });
  }
  const avg: Row = {};
  for (const key of Object.keys(rows[0])) avg[key] = Math.round((rows.reduce((s, r) => s + r[key], 0) / rows.length) * 10) / 10;
  return { rows, avg };
}

/** Le village autour de (cx, cz), dessiné en texte : h petit bâtiment, B grand, = route, t arbres ou rochers, ~ eau */
function sketch(w: World, cx: number, cz: number) {
  const lines: string[] = [];
  for (let z = cz - R; z <= cz + R; z++) {
    let l = '';
    for (let x = cx - R; x <= cx + R; x++) {
      const k = w.ci(x, z), b = w.buildingAt(x, z);
      l += b ? (sizeOf(b) > 1 ? 'B' : 'h') : w.road[k] ? '=' : w.isWet(x, z) ? '~' : w.veg[k] ? 't' : '.';
    }
    lines.push(l);
  }
  return lines.join('\n');
}

/**
 * L'ancien tracé, gardé comme témoin des mesures : depuis la porte, le chemin le moins coûteux case par case jusqu'à la route
 * la plus proche, sans compter les virages ni les terrains libres (sa jonction des hameaux, qui ne joue pas dans ces villages
 * d'un seul tenant, est omise)
 */
function oldAutoRoad(w: World, b: Building): number {
  if (b.kind === 'lamp') return 0;
  const s = sizeOf(b), f = FRONT[b.rot], edge = ring(w, b);
  if (edge.some((k) => w.road[k])) return 0;
  const ok = (k: number) => w.canRoad(k % N, Math.floor(k / N));
  const front = edge.filter((k) => (f[0] ? k % N === (f[0] > 0 ? b.x + s : b.x - 1) : Math.floor(k / N) === (f[1] > 0 ? b.z + s : b.z - 1)) && ok(k));
  const starts = front.length ? front : edge.filter(ok);
  let goal = (k: number) => w.road[k] === 1;
  if (!w.road.some((v) => v === 1)) {
    const near = new Set<number>();
    for (const o of w.buildings.values()) if (o.id !== b.id && o.kind !== 'lamp') for (const k of ring(w, o)) near.add(k);
    goal = (k) => near.has(k);
  }
  const road = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1;
  const cost = (k: number, start: boolean) => {
    const x = k % N, z = Math.floor(k / N), v = w.veg[k];
    let c = 1 + w.cellSlope(x, z) * 1.5;
    if (v === VEG_FOREST) c += 1.5;
    else if (v === VEG_ROCKS) c += 1;
    else if (v === VEG_FIELD || v === VEG_GARDEN) c += 6;
    if (w.isWet(x, z)) c += 3;
    if (!start && (road(x + 1, z) || road(x - 1, z) || road(x, z + 1) || road(x, z - 1))) c += 1.5;
    return c;
  };
  const dist = new Float32Array(N * N).fill(Infinity), steps = new Uint16Array(N * N), prev = new Int32Array(N * N).fill(-1), open: number[] = [];
  for (const k of starts) { dist[k] = cost(k, true); open.push(k); }
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const c = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (goal(c) && !starts.includes(c)) {
      let n = 0;
      for (let k = c; k >= 0; k = prev[k]) if (!w.road[k] && w.setRoad(k % N, Math.floor(k / N), true)) n++;
      return n;
    }
    if (steps[c] >= 14) continue;
    const x = c % N, z = Math.floor(c / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!w.inCells(x + dx, z + dz)) continue;
      const k = w.ci(x + dx, z + dz), g = goal(k);
      if (!g && !w.canRoad(x + dx, z + dz)) continue;
      const d = dist[c] + (g ? 0 : cost(k, false));
      if (d < dist[k]) { dist[k] = d; steps[k] = steps[c] + 1; prev[k] = c; open.push(k); }
    }
  }
  return 0;
}

/** Un terrain plat de `wd` × `ht` cases où tout se bâtit, débroussaillé : son coin (x, z) */
function field(w: World, wd: number, ht: number): [number, number] {
  const ok = (x: number, z: number) => w.canPlace('house', x, z) === null && w.cellSlope(x, z) < 0.6;
  for (let z = 10; z < N - 10 - ht; z++)
    for (let x = 10; x < N - 10 - wd; x++) {
      let good = true;
      for (let j = -1; j <= ht && good; j++) for (let i = -1; i <= wd && good; i++) good = ok(x + i, z + j);
      if (!good) continue;
      for (let j = -1; j <= ht; j++) for (let i = -1; i <= wd; i++) w.veg[w.ci(x + i, z + j)] = 0;
      return [x, z];
    }
  throw new Error('pas de terrain plat');
}

/** Cases de route posées depuis un état, en (x, z) */
const laidSince = (w: World, before: Uint8Array) => [...w.road.keys()].filter((k) => w.road[k] && !before[k]).map((k) => [k % N, Math.floor(k / N)]);

describe('routes automatiques discrètes', () => {
  let w: World, base: Snap, cx: number, cz: number;
  beforeAll(() => {
    w = continent();
    [cx, cz] = plain(w);
    base = w.snapshot();
  });

  // Mesures sur huit villages de vingt bâtiments (ROUTES_MESURES=1 les affiche, ROUTES_DESSIN=1 dessine les trois premiers)
  for (const [name, gap] of [['serré', [0, 4]], ['aéré', [2, 7]]] as [string, [number, number]][])
    it(`village ${name} : moins de routes, plus de place pour les grands bâtiments, chacun relié`, () => {
      const before = villages(w, base, cx, cz, gap, oldAutoRoad), after = villages(w, base, cx, cz, gap, autoRoad);
      if (import.meta.env.ROUTES_MESURES) {
        console.log(`village ${name}, ancien tracé puis nouveau`);
        console.table([before.avg, after.avg]);
        console.table(after.rows);
      }
      if (import.meta.env.ROUTES_DESSIN) for (const seed of [1, 2, 3]) for (const [label, road] of [['ancien', oldAutoRoad], ['nouveau', autoRoad]] as [string, RoadFn][]) {
        w.restore(base);
        build(w, wanted(w, cx, cz, seed, gap), road);
        console.log(`graine ${seed}, ${label}\n${sketch(w, cx, cz)}`);
      }
      // chaque bâtiment a une route contre lui, et tout le village tient sur un seul réseau
      for (const r of after.rows) {
        expect(r.n).toBe(20);
        expect(r.unlinked).toBe(0);
        expect(r.nets).toBe(1);
      }
      expect(after.avg.cells).toBeLessThan(before.avg.cells);
      expect(after.avg.free2).toBeGreaterThan(before.avg.free2);
      expect(after.avg.free3).toBeGreaterThan(before.avg.free3);
      expect(after.avg.turns).toBeLessThan(before.avg.turns);
      // ni routes en double, ni boucles : un carré de route seulement quand c'est le seul moyen de relier un bâtiment coincé
      expect(after.avg.blocks).toBeLessThanOrEqual(0.5);
      expect(after.avg.loops).toBeLessThanOrEqual(0.5);
    });

  it('part du côté de la route, sans faire le tour du bâtiment ; orienté à la main, il part de sa porte', () => {
    w.restore(base);
    const [x, z] = field(w, 7, 9);
    for (let i = 0; i < 7; i++) w.setRoad(x + i, z, true);
    const snap = w.snapshot(), roads = w.road.slice();
    // la façade regarde à l'opposé de la route : le chemin part quand même tout droit vers elle
    expect(autoRoad(w, w.place('house', x + 3, z + 3, 0, true, 0, false))).toBe(2);
    expect(laidSince(w, roads)).toEqual([[x + 3, z + 1], [x + 3, z + 2]]);
    // orientée à la main, la maison garde sa porte : le chemin en part et contourne la maison
    w.restore(snap);
    expect(autoRoad(w, w.place('house', x + 3, z + 3, 0, false, 0, false))).toBeGreaterThan(2);
    expect(laidSince(w, roads)).toContainEqual([x + 3, z + 4]);
  });

  it('longe les bâtiments plutôt que de couper le pré', () => {
    w.restore(base);
    const [x, z] = field(w, 13, 7);
    // deux routes, à gauche et à droite ; à mi-chemin, une maison ; à droite, deux rangées de maisons bordent un couloir
    for (let j = 0; j < 7; j++) { w.setRoad(x, z + j, true); w.setRoad(x + 12, z + j, true); }
    for (let i = 7; i <= 11; i++) { w.place('house', x + i, z + 2, 0, true, 0, false); w.place('house', x + i, z + 4, 0, true, 0, false); }
    const roads = w.road.slice();
    // aussi court d'un côté que de l'autre (cinq cases) : le chemin prend le couloir et laisse le pré libre
    expect(autoRoad(w, w.place('house', x + 6, z + 3, 0, true, 0, false))).toBe(5);
    for (const [cx] of laidSince(w, roads)) expect(cx).toBeGreaterThan(x + 6);
  });
});
