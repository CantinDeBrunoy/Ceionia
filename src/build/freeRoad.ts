import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS, ROAD_SLOPE } from '../world/world';
import { chaikin, rasterize, sampleCurve } from '../world/curves';
import { Heap } from '../sim/agents';
import { tr } from '../i18n';

/** Longueur maximale d'une route libre (en cases, à vol d'oiseau) ; marge du terrain fouillé autour de A et B */
export const FREE_MAX = 80;
const MARGIN = 14;
/** Demi-largeur de chaussée gardée à l'écart des bâtiments, de part et d'autre de la ligne */
const BAND = 0.22;
/** Saut de hauteur au-delà duquel on ne passe pas d'une case à sa voisine */
const STEP_H = 0.75;
/**
 * Une case de pont neuf (eau ou faille) compte comme `GAP` cases de terre plate, et chaque nouveau franchissement coûte
 * `CROSS` de plus : le pont l'emporte dès qu'il est nettement plus court que le détour (retour de joueur, 22 nov. 2026 : « le
 * jeu propose souvent un détour quand je veux un pont » ; c'était +8 par case et +12 par franchissement)
 */
export const GAP = 2, CROSS = 3;
/**
 * Route en lacets (retour de joueur, 22 nov. 2026 : « routes sur une colline trop raide : impossible »). Sur une case plus
 * raide que `ROAD_SLOPE` (jusqu'à `SWITCH_SLOPE`, voir `World.canRoad`), un pas du tracé ne monte pas plus que `LACET_GRADE`
 * de hauteur par case de longueur. D'une case à sa voisine, on monterait de toute la pente : sur ces cases, le tracé fait
 * donc aussi des pas plus longs, en biais (jusqu'à `LACET_REACH` cases, `LONG`), qui prennent la pente en écharpe. Le
 * chemin le moins cher va d'écharpe en écharpe et tourne en épingle : les lacets viennent d'eux-mêmes
 */
export const LACET_GRADE = 0.5;
const LACET_REACH = 5;
/** Le long d'un pas de lacet, la pente mesurée sur une case de long ne dépasse pas tant (la pente se concentre parfois en un point) */
const LACET_LOCAL = 0.7;
/** Une courbe adoucie peut monter un peu plus vite dans un virage, mesuré sur une case de long */
const LACET_CURVE = 0.75;
/** Les pas longs, en biais : (dx, dz) premiers entre eux, hors des huit voisines */
const LONG: [number, number][] = [];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
for (let dz = -LACET_REACH; dz <= LACET_REACH; dz++) for (let dx = -LACET_REACH; dx <= LACET_REACH; dx++)
  if (Math.max(Math.abs(dx), Math.abs(dz)) >= 2 && gcd(Math.abs(dx), Math.abs(dz)) === 1) LONG.push([dx, dz]);

/** Une case de lacet : une pente au-delà de celle d'une route ordinaire (pas l'eau ni une faille, qu'on franchit en pont) */
const steepAt = (w: World, x: number, z: number) => !w.isGap(x, z) && w.cellSlope(x, z) >= ROAD_SLOPE;
/** Hauteur du relief de jeu au point (x, z) (bilinéaire entre les sommets) */
function groundAt(w: World, x: number, z: number) {
  const cx = Math.max(0, Math.min(N - 1, Math.floor(x))), cz = Math.max(0, Math.min(N - 1, Math.floor(z)));
  const fx = Math.max(0, Math.min(1, x - cx)), fz = Math.max(0, Math.min(1, z - cz)), H = w.heights, i = w.vi(cx, cz), j = i + N + 1;
  return (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fz) + (H[j] * (1 - fx) + H[j + 1] * fx) * fz;
}

/** Route libre prévue de A à B : sa ligne (x, z à la suite), ses cases, et pourquoi on ne peut pas la poser (null : on peut) */
export interface RoadPlan { pts: number[]; cells: number[]; why: string | null }

/**
 * Route libre, façon Anno : du centre de la case de A à celui de la case de B, le chemin le moins coûteux (A*, 8-voisinage)
 * qui contourne bâtiments, pentes raides, cultures et eau profonde (un pont sur l'eau peu profonde ou sur une faille, quand
 * il est nettement plus court que le détour), puis tiré en lignes droites tant qu'elles restent praticables, et adouci comme la voie ferrée. La courbe la plus
 * douce dont toutes les cases sont praticables, et qui ne frôle aucun bâtiment, l'emporte
 */
export function planRoad(w: World, ax: number, az: number, bx: number, bz: number): RoadPlan {
  const x0 = Math.floor(ax), z0 = Math.floor(az), x1 = Math.floor(bx), z1 = Math.floor(bz);
  const A: [number, number] = [x0 + 0.5, z0 + 0.5], B: [number, number] = [x1 + 0.5, z1 + 0.5];
  const straight = (why: string): RoadPlan => ({ pts: [A[0], A[1], B[0], B[1]], cells: [], why });
  if (!w.inCells(x0, z0) || !w.inCells(x1, z1)) return straight(tr('Hors de la carte.'));
  if (Math.hypot(x1 - x0, z1 - z0) > FREE_MAX) return straight(tr('Trop loin : une route libre fait au plus {n} cases.', { n: FREE_MAX }));
  const ok = (k: number) => !!w.road[k] || w.canRoad(k % N, Math.floor(k / N), true);
  if (!ok(w.ci(x0, z0)) || !ok(w.ci(x1, z1))) return straight(tr('On ne pose pas de route ici : bâtiment, pente trop raide ou eau trop profonde.'));
  const nodes = search(w, w.ci(x0, z0), w.ci(x1, z1));
  if (!nodes) return straight(tr('Pas de passage : des bâtiments, l’eau profonde ou des pentes trop raides barrent le chemin.'));
  const centre = (k: number): [number, number] => [(k % N) + 0.5, Math.floor(k / N) + 0.5];
  // (les pas longs des lacets sautent des cases : le chemin cherché, case par case)
  const cells = unique(rasterize(nodes.flatMap(centre), N));
  // on garde les cases d'angle, on file tout droit ailleurs tant que la ligne reste praticable
  const keep: [number, number][] = [centre(nodes[0])];
  for (let i = 0; i < nodes.length - 1;) {
    let j = Math.min(nodes.length - 1, i + 12);
    while (j > i + 1 && !fits(w, [...centre(nodes[i]), ...centre(nodes[j])], true)) j--;
    keep.push(centre(nodes[j]));
    i = j;
  }
  // la ligne la plus douce qui passe : trois passes de Chaikin, sinon moins, sinon la ligne brisée
  // (jamais plus d'eau neuve que le chemin cherché : une courbe qui rogne un coin ne doit pas mouiller une case de plus)
  const wetN = (ks: number[]) => ks.filter((k) => w.isGap(k % N, Math.floor(k / N)) && !w.road[k]).length, base = wetN(cells);
  for (const it of [3, 2, 1, 0]) {
    const pts = chaikin(keep, it).flat();
    if (it === 0 || (fits(w, pts, false) && wetN(unique(rasterize(pts, N))) <= base)) return { pts, cells: unique(rasterize(pts, N)), why: null };
  }
  return straight(tr('Pas de passage.'));
}

/** Cases sans doublon, dans l'ordre */
const unique = (cells: number[]) => [...new Set(cells)];

/** Coût d'une case pour une route libre (Infinity : on n'y passe pas) */
function cost(w: World, k: number) {
  const x = k % N, z = Math.floor(k / N), v = w.veg[k];
  if (!w.road[k] && !w.canRoad(x, z, true)) return Infinity;
  // l'eau et les failles se franchissent en pont : deux cases de terre (ni pente ni végétation sous un tablier) ; un pont déjà
  // posé se réutilise comme une route
  if (w.isGap(x, z)) return w.road[k] ? 2.5 : GAP;
  let c = 1 + w.cellSlope(x, z) * 2.5;
  if (v === VEG_FOREST) c += 1.5;
  else if (v === VEG_ROCKS) c += 1;
  else if (v === VEG_FIELD || v === VEG_GARDEN) c += 4;
  // une route existante se croise, on ne la longe pas
  if (w.road[k]) c += 1.5;
  // on garde ses distances avec les bâtiments
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && w.inCells(x + dx, z + dz) && w.occ[w.ci(x + dx, z + dz)]) { c += 0.6; dz = 2; break; }
  return c;
}

/**
 * Pas long d'un lacet, de (x, z) à (nx, nz) : son coût (Infinity : il ne passe pas). Il ne sert que sur une pente raide (une
 * de ses cases est une case de lacet), ne monte pas plus que `LACET_GRADE`, ne passe ni sur l'eau ni sur une route ni par une
 * case impraticable, et n’a pas de ressaut (`LACET_LOCAL`)
 */
function longStep(w: World, x: number, z: number, nx: number, nz: number, costAt: (k: number) => number) {
  const L = Math.hypot(nx - x, nz - z), h0 = groundAt(w, x + 0.5, z + 0.5), h1 = groundAt(w, nx + 0.5, nz + 0.5);
  if (Math.abs(h1 - h0) > LACET_GRADE * L) return Infinity;
  // (le relief le long du pas, tous les demi-cases : ni ressaut, ni crête, ni creux)
  const m = Math.ceil(L * 2);
  let g0 = h0, g1 = g0;
  for (let i = 1; i <= m; i++) {
    const t = i / m, g = groundAt(w, x + 0.5 + (nx - x) * t, z + 0.5 + (nz - z) * t);
    if (i >= 2 && Math.abs(g - g0) > LACET_LOCAL * (L * 2 / m)) return Infinity;
    g0 = g1; g1 = g;
  }
  const line = rasterize([x + 0.5, z + 0.5, nx + 0.5, nz + 0.5], N);
  let sum = 0, n = 0, steep = steepAt(w, x, z);
  for (const k of line) {
    const cx = k % N, cz = Math.floor(k / N);
    if (cx === x && cz === z) continue;
    const c = costAt(k);
    if (!isFinite(c) || w.isGap(cx, cz) || w.road[k]) return Infinity;
    steep ||= steepAt(w, cx, cz);
    sum += c; n++;
  }
  return steep && n ? (sum / n) * L : Infinity;
}

/**
 * Chemin le moins coûteux de la case `a` à la case `b` (A*, 8-voisinage, sans passer en diagonale entre deux obstacles ; sur
 * les pentes raides, aussi des pas longs en biais, voir `LONG`) : la suite des cases d'angle, pas forcément voisines
 */
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
  // les cases raides de la zone fouillée, et leur nombre cumulé (une case loin de toute pente raide ne cherche pas de lacet)
  const steep = new Uint8Array(W * H), sum = new Int32Array((W + 1) * (H + 1));
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    steep[j * W + i] = steepAt(w, lx + i, lz + j) ? 1 : 0;
    sum[(j + 1) * (W + 1) + i + 1] = steep[j * W + i] + sum[j * (W + 1) + i + 1] + sum[(j + 1) * (W + 1) + i] - sum[j * (W + 1) + i];
  }
  const isSteep = (k: number) => steep[loc(k)] === 1;
  // (raide, ou au bord d'une case raide : c'est de là que partent les écharpes)
  const steepNear = (x: number, z: number) => {
    const i0 = Math.max(0, x - lx - 1), i1 = Math.min(W, x - lx + 2), j0 = Math.max(0, z - lz - 1), j1 = Math.min(H, z - lz + 2);
    return sum[j1 * (W + 1) + i1] - sum[j0 * (W + 1) + i1] - sum[j1 * (W + 1) + i0] + sum[j0 * (W + 1) + i0] > 0;
  };
  const relax = (c: number, n: number, nd: number) => { if (nd < dist[loc(n)]) { dist[loc(n)] = nd; prev[loc(n)] = c; heap.push(nd + h(n), n); } };
  // (une case déjà développée ne l'est plus : le tas garde d'anciennes entrées)
  const done = new Uint8Array(W * H);
  while (heap.size) {
    const c = heap.pop(), x = c % N, z = Math.floor(c / N), dc = dist[loc(c)];
    if (c === b) break;
    if (done[loc(c)]) continue;
    done[loc(c)] = 1;
    const hc = w.cellAvg(x, z), steepHere = isSteep(c);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (nx < lx || nx > hx || nz < lz || nz > hz) continue;
      const n = nz * N + nx, cn = costAt(n);
      if (!isFinite(cn)) continue;
      const dh = Math.abs(w.cellAvg(nx, nz) - hc), len = dx && dz ? Math.SQRT2 : 1;
      if (dh > STEP_H && !w.isGap(nx, nz) && !w.isGap(x, z)) continue;
      // (sur une pente raide, même d'une case à sa voisine : pas plus que la pente d'un lacet)
      if ((steepHere || isSteep(n)) && dh > LACET_GRADE * len) continue;
      if (dx && dz && (!isFinite(costAt(z * N + nx)) || !isFinite(costAt(nz * N + x)))) continue;
      // en diagonale entre deux cases sèches, on ne rogne pas le coin d'une case d'eau ou de faille (un pont de plus)
      if (dx && dz && !w.isGap(x, z) && !w.isGap(nx, nz) && (w.isGap(nx, z) || w.isGap(x, nz))) continue;
      // un nouveau franchissement (de la terre à l'eau ou à la faille, hors pont existant) coûte un peu : pas de pont pour rien
      const cross = w.isGap(nx, nz) && !w.road[n] && !(w.isGap(x, z) || w.road[c]) ? CROSS : 0;
      relax(c, n, dc + cn * len + dh * 3 + cross);
    }
    // les pas longs des lacets (`longStep` ne les permet que si l'une de leurs cases est raide)
    if (w.isGap(x, z) || !steepNear(x, z)) continue;
    for (const [dx, dz] of LONG) {
      const nx = x + dx, nz = z + dz;
      if (nx < lx || nx > hx || nz < lz || nz > hz) continue;
      const n = nz * N + nx;
      // (une case déjà atteinte moins cher que la longueur du pas, au mieux, n'a rien à y gagner)
      if (done[loc(n)] || dist[loc(n)] <= dc + Math.hypot(dx, dz) || !isFinite(costAt(n))) continue;
      const s = longStep(w, x, z, nx, nz, costAt);
      if (isFinite(s)) relax(c, n, dc + s + Math.abs(w.cellAvg(nx, nz) - hc) * 3);
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
  let steep = false;
  for (const k of rasterize(pts, N)) {
    const c = cost(w, k);
    if (!isFinite(c) || (cheap && c > 4)) return false;
    steep ||= steepAt(w, k % N, Math.floor(k / N));
  }
  const s = sampleCurve(pts);
  // sur une pente raide, une courbe qui couperait un lacet monterait trop d'un coup : on mesure sa pente case après case
  // (dix pas d'échantillon, mesurés le long de la courbe : un virage serré n'est pas une montée)
  if (steep) for (let i = 0; i + 21 < s.length; i += 4) {
    let run = 0;
    for (let j = i; j < i + 20; j += 2) run += Math.hypot(s[j + 2] - s[j], s[j + 3] - s[j + 1]);
    if (Math.abs(groundAt(w, s[i + 20], s[i + 21]) - groundAt(w, s[i], s[i + 1])) > LACET_CURVE * Math.max(run, 0.5)) return false;
  }
  for (let i = 0; i + 3 < s.length; i += 2) {
    const dx = s[i + 2] - s[i], dz = s[i + 3] - s[i + 1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    for (const o of [-BAND, BAND]) {
      const x = Math.floor(s[i] + nx * o), z = Math.floor(s[i + 1] + nz * o);
      if (!w.inCells(x, z)) return false;
      const k = w.ci(x, z);
      // (une faille n'arrête pas la chaussée : elle la franchit en pont)
      if (w.occ[k] || (w.decor[k] && !w.rift[k])) return false;
    }
  }
  return true;
}
