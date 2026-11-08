import { N, SEA, World } from './world';

/**
 * Franchissements d'eau par les routes : UNE détection et UN profil de tablier, lus à la fois par le dessin des ponts
 * (`render/roads.ts`) et par la simulation (`World.surfaceAt`, `bridgeY`, `passPoint` : les habitants et les véhicules
 * marchent exactement sur le tablier dessiné).
 *
 * Un franchissement = un groupe de cases de route portées par un pont (cases sur l'eau, et les une ou deux cases sèches
 * prises entre deux bras d'eau), découpé en tronçons d'une rive à l'autre ; là où une autre route touche le pont sur l'eau,
 * la case est un nœud (plateau carré) d'où partent plusieurs tronçons. L'axe d'un tronçon passe par les milieux des bords
 * entre cases successives (une route en escalier donne une diagonale, pas un serpent), part du chemin de la rive à
 * `RAMP_IN` du bord et y revient.
 *
 * Le profil en long d'un tronçon est la corde entre ses deux bouts (la chaussée des deux rives, ou le plateau d'un nœud),
 * relevée au-dessus de l'eau juste ce qu'il faut (`DECK_CLEAR`), par des rampes douces, et jamais sous le sol : sur une
 * rivière plate le tablier est à ras de l'eau, sur un ruisseau encaissé il va de rive à rive sans marche ni culée géante.
 */

/** Garde du tablier au-dessus de l'eau */
export const DECK_CLEAR = 0.24;
/** Cases sèches au plus qu'un pont enjambe d'un seul tenant entre deux bras d'eau le long de la même route */
export const MAX_DRY_GAP = 2;
/** Longueur de la rampe sur la case de la rive (depuis le bord) */
export const RAMP_IN = 0.45;
/** Le tablier déborde d'autant l'eau avant de redescendre */
const OVERHANG = 0.12;
/** Pas d'échantillonnage de l'axe */
const STEP = 0.2;
/** Marge du tablier au-dessus du sol */
const ABOVE_GROUND = 0.03;
/** Hauteur du pied de rampe au-dessus du sol (la chaussée est dessinée à +0,02) */
const FOOT = 0.04;
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface SpanEnd { kind: 'bank' | 'node' | 'open'; cell: number }

export interface Span {
  /** cases portées du tronçon, dans l'ordre (vide entre un nœud et une rive voisine) */
  cells: number[];
  from: SpanEnd;
  to: SpanEnd;
  /** axe échantillonné tous les ~0,2 : [x, y, z] */
  pts: number[][];
  /** abscisse curviligne de chaque point */
  S: number[];
  /** le point est au-dessus de l'eau franchie */
  wet: boolean[];
  /** intervalle d'abscisse du tablier au-dessus de l'eau, débords compris (a > b : aucun) */
  a: number;
  b: number;
  /** niveau de l'eau la plus haute franchie (−Infinity sans eau) */
  water: number;
}

export interface Crossing {
  cells: Set<number>;
  spans: Span[];
  /** nœuds (jonction sur l'eau) et hauteur de leur plateau */
  nodes: Map<number, number>;
}

const xz = (k: number): [number, number] => [k % N, Math.floor(k / N)];

/** Niveau de l'eau d'une case (lac, sinon la mer) */
export function waterLevel(w: World, k: number) { return w.lake[k] ? w.lakeLevel[k] : SEA; }

/**
 * Cases de route portées par un pont : celles qui passent sur l'eau (vraie eau, pas une flaque), et les cases sèches prises
 * entre deux d'entre elles le long de la même route (`MAX_DRY_GAP` au plus, tant que le sol n'y dépasse pas le tablier de
 * plus d'une demi-case) : un ruisseau qui serpente sous la route la mouille par endroits, on n'y jette qu'un seul ouvrage
 */
export function carriedCells(w: World): Set<number> {
  const out = new Set<number>();
  const road = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1;
  for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) if (road(cx, cz) && w.realWater(cx, cz)) out.add(w.ci(cx, cz));
  const nbrs = (k: number) => D4.map(([dx, dz]) => [(k % N) + dx, Math.floor(k / N) + dz]).filter(([x, z]) => road(x, z)).map(([x, z]) => w.ci(x, z));
  for (const k of [...out]) for (const first of nbrs(k)) {
    // on suit la route depuis le pont, case sèche après case sèche, tant qu'elle ne bifurque pas
    const gap: number[] = [];
    let prev = k, cur = first;
    for (let step = 0; step <= MAX_DRY_GAP; step++) {
      if (out.has(cur)) { for (const c of gap) out.add(c); break; }
      const n = nbrs(cur);
      if (n.length !== 2 || step === MAX_DRY_GAP) break;
      // une colline entre deux bras : pas de tablier perché dessus
      if (w.cellAvg(cur % N, Math.floor(cur / N)) > waterLevel(w, k) + DECK_CLEAR + 0.5) break;
      gap.push(cur);
      const next = n[0] === prev ? n[1] : n[0];
      prev = cur; cur = next;
    }
  }
  return out;
}

/** Groupes de cases portées voisines entre elles (4-voisinage) : un groupe par ouvrage */
export function carriedGroups(w: World, cells: Set<number> = carriedCells(w)): number[][] {
  const seen = new Set<number>(), out: number[][] = [];
  for (const k of cells) {
    if (seen.has(k)) continue;
    const g = [k];
    seen.add(k);
    for (let i = 0; i < g.length; i++) {
      const [x, z] = xz(g[i]);
      for (const [dx, dz] of D4) { if (!w.inCells(x + dx, z + dz)) continue; const n = w.ci(x + dx, z + dz); if (cells.has(n) && !seen.has(n)) { seen.add(n); g.push(n); } }
    }
    out.push(g);
  }
  return out;
}

/** Milieu du bord entre deux cases voisines */
function edgeMid(a: number, b: number): [number, number] {
  const [ax, az] = xz(a), [bx, bz] = xz(b);
  return [(ax + bx) / 2 + 0.5, (az + bz) / 2 + 0.5];
}

/** Simplification d'une ligne brisée (Douglas-Peucker) ; les points `keep` restent */
function simplify(pts: number[][], keep: boolean[], tol: number): number[][] {
  const n = pts.length, out = pts.map(() => false);
  out[0] = out[n - 1] = true;
  keep.forEach((k, i) => { if (k) out[i] = true; });
  const rec = (i0: number, i1: number) => {
    if (i1 - i0 < 2) return;
    const [ax, az] = pts[i0], [bx, bz] = pts[i1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    let best = -1, bd = tol;
    for (let i = i0 + 1; i < i1; i++) {
      const d = out[i] ? Infinity : Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / l;
      if (d > bd) { bd = d; best = i; }
    }
    if (best < 0) { for (let i = i0 + 1; i < i1; i++) if (out[i]) { rec(i0, i); rec(i, i1); return; } return; }
    out[best] = true;
    rec(i0, best); rec(best, i1);
  };
  rec(0, n - 1);
  return pts.filter((_, i) => out[i]);
}

/** Un passage de Chaikin (bouts fixes) : les coudes s'arrondissent */
function chaikin(line: number[][]): number[][] {
  if (line.length < 3) return line;
  const out = [line[0]];
  for (let i = 0; i + 1 < line.length; i++) {
    const p = line[i], q = line[i + 1];
    out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
  }
  out.push(line[line.length - 1]);
  return out;
}

/** Rééchantillonnage régulier d'une ligne brisée (x, z) */
function resample(line: number[][], step: number): number[][] {
  const out = [line[0]];
  for (let i = 0; i + 1 < line.length; i++) {
    const p = line[i], q = line[i + 1], m = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
    for (let k = 1; k <= m; k++) out.push([p[0] + ((q[0] - p[0]) * k) / m, p[1] + ((q[1] - p[1]) * k) / m]);
  }
  return out;
}

/**
 * Profil en long d'un tronçon : la poutre la plus basse tendue entre ses deux bouts (`y0`, `y1` : la chaussée des rives, ou
 * le plateau d'un nœud) au-dessus de toutes ses contraintes : l'eau plus sa garde (débords compris), le sol plus sa marge.
 * C'est l'enveloppe convexe supérieure de ces points : sur une rivière plate, un tablier au ras de l'eau et deux rampes
 * droites ; sur un ruisseau encaissé, la corde d'une rive à l'autre ; jamais de marche ni de creux
 */
export function deckProfile(S: number[], wet: boolean[], ground: number[], water: number[], y0: number, y1: number): { y: number[]; a: number; b: number } {
  const n = S.length, L = S[n - 1] || 1;
  const need = ground.map((g) => g + ABOVE_GROUND);
  const iw = wet.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  for (const j of iw) for (let i = 0; i < n; i++) if (Math.abs(S[i] - S[j]) <= OVERHANG + 1e-9) need[i] = Math.max(need[i], water[j] + DECK_CLEAR);
  need[0] = Math.max(need[0], y0); need[n - 1] = Math.max(need[n - 1], y1);
  // enveloppe convexe supérieure (chaîne monotone sur des abscisses croissantes)
  const hull: number[] = [];
  for (let i = 0; i < n; i++) {
    while (hull.length >= 2) {
      const p = hull[hull.length - 2], q = hull[hull.length - 1];
      if ((S[q] - S[p]) * (need[i] - need[p]) - (need[q] - need[p]) * (S[i] - S[p]) < 0) break;
      hull.pop();
    }
    hull.push(i);
  }
  const y = new Array<number>(n);
  for (let h = 0; h + 1 < hull.length; h++) {
    const p = hull[h], q = hull[h + 1];
    for (let i = p; i <= q; i++) y[i] = S[q] > S[p] ? need[p] + ((need[q] - need[p]) * (S[i] - S[p])) / (S[q] - S[p]) : Math.max(need[p], need[q]);
  }
  if (hull.length === 1) y[0] = need[0];
  if (!iw.length) return { y, a: 1, b: 0 };
  return { y, a: Math.max(0, S[iw[0]] - OVERHANG), b: Math.min(L, S[iw[iw.length - 1]] + OVERHANG) };
}

/** Détection et géométrie de tous les franchissements */
export function findCrossings(w: World): Crossing[] {
  const carried = carriedCells(w), out: Crossing[] = [];
  const roadsOf = (c: number) => { const [x, z] = xz(c); return D4.map(([dx, dz]) => (w.inCells(x + dx, z + dz) && w.road[w.ci(x + dx, z + dz)] === 1 ? w.ci(x + dx, z + dz) : -1)).filter((n) => n >= 0); };
  for (const group of carriedGroups(w, carried)) {
    const comp = new Set(group);
    const inner = (c: number) => roadsOf(c).filter((n) => comp.has(n));
    const nodes = new Set(group.filter((c) => roadsOf(c).length >= 3));
    const raw: { cells: number[]; from: SpanEnd; to: SpanEnd }[] = [];
    const visited = new Set<number>();
    const endOf = (c: number, not: number): SpanEnd => { const banks = roadsOf(c).filter((n) => !comp.has(n) && n !== not); return banks.length ? { kind: 'bank', cell: banks[0] } : { kind: 'open', cell: -1 }; };
    const walk = (start: number, prev: number, from: SpanEnd) => {
      const cells: number[] = [];
      let cur = start, p = prev;
      for (;;) {
        cells.push(cur); visited.add(cur);
        const nx = inner(cur).filter((n) => n !== p);
        if (!nx.length) { raw.push({ cells, from, to: endOf(cur, from.cell) }); return; }
        const n = nx[0];
        if (nodes.has(n) || visited.has(n)) { nodes.add(n); raw.push({ cells, from, to: { kind: 'node', cell: n } }); return; }
        p = cur; cur = n;
      }
    };
    // bouts de chaîne (une rive, ou une route qui s'arrête sur l'eau), puis ce qui part des nœuds, puis les boucles
    for (const c of group) if (!nodes.has(c) && inner(c).length <= 1 && !visited.has(c)) walk(c, -1, endOf(c, -1));
    for (const nd of nodes) for (const n of inner(nd)) if (!visited.has(n) && !nodes.has(n)) walk(n, nd, { kind: 'node', cell: nd });
    for (const c of group) if (!visited.has(c) && !nodes.has(c)) { nodes.add(c); for (const n of inner(c)) if (!visited.has(n) && !nodes.has(n)) walk(n, c, { kind: 'node', cell: c }); }
    // d'un nœud droit à une rive voisine : un tronçon sans case, juste la rampe ; entre deux nœuds voisins : le raccord des plateaux
    for (const nd of nodes) for (const b of roadsOf(nd)) {
      if (!comp.has(b)) raw.push({ cells: [], from: { kind: 'node', cell: nd }, to: { kind: 'bank', cell: b } });
      else if (nodes.has(b) && nd < b) raw.push({ cells: [], from: { kind: 'node', cell: nd }, to: { kind: 'node', cell: b } });
    }

    // pied de rampe sur la case de la rive, et sa hauteur (jamais sous l'eau)
    const foot = (bank: number, first: number): [number, number] => { const e = edgeMid(bank, first), [bx, bz] = xz(bank), [fx, fz] = xz(first); return [e[0] - (fx - bx) * RAMP_IN, e[1] - (fz - bz) * RAMP_IN]; };
    const footY = (bank: number, first: number) => { const [x, z] = foot(bank, first); return Math.max(w.hAt(x, z), waterLevel(w, first) + 0.02) + FOOT; };
    const banksY: number[] = [];
    for (const sp of raw) {
      if (sp.from.kind === 'bank') banksY.push(footY(sp.from.cell, sp.cells[0] ?? sp.to.cell));
      if (sp.to.kind === 'bank') banksY.push(footY(sp.to.cell, sp.cells[sp.cells.length - 1] ?? sp.from.cell));
    }
    const meanBank = banksY.length ? banksY.reduce((s, v) => s + v, 0) / banksY.length : -Infinity;
    const nodeY = new Map<number, number>();
    for (const nd of nodes) {
      const [x, z] = xz(nd);
      nodeY.set(nd, Math.max(waterLevel(w, nd) + DECK_CLEAR, w.hAt(x + 0.5, z + 0.5) + ABOVE_GROUND, meanBank));
    }

    const buildSpans = () => {
      const spans: Span[] = [];
      for (const sp of raw) {
        // suite de cases : la rive ou le nœud de départ, les cases portées, la rive ou le nœud d'arrivée
        const seq = [...(sp.from.cell >= 0 ? [sp.from.cell] : []), ...sp.cells, ...(sp.to.cell >= 0 ? [sp.to.cell] : [])];
        if (seq.length < 1) continue;
        const line: number[][] = [], keep: boolean[] = [];
        const push = (p: number[], k: boolean) => {
          const l = line[line.length - 1];
          if (l && Math.abs(l[0] - p[0]) < 1e-6 && Math.abs(l[1] - p[1]) < 1e-6) { keep[keep.length - 1] ||= k; return; }
          line.push(p); keep.push(k);
        };
        const centre = (c: number): [number, number] => { const [x, z] = xz(c); return [x + 0.5, z + 0.5]; };
        // départ
        if (sp.from.kind === 'bank') { push(foot(sp.from.cell, seq[1]), true); push(edgeMid(seq[0], seq[1]), true); }
        else if (sp.from.kind === 'node') { push(centre(sp.from.cell), true); if (seq.length > 1) push(edgeMid(seq[0], seq[1]), true); }
        // milieux des bords entre cases portées successives
        const i0 = sp.from.cell >= 0 ? 1 : 0, i1 = sp.to.cell >= 0 ? seq.length - 2 : seq.length - 1;
        for (let i = i0; i < i1; i++) push(edgeMid(seq[i], seq[i + 1]), false);
        // arrivée
        if (sp.to.kind === 'bank') { if (seq.length > 1) push(edgeMid(seq[seq.length - 2], seq[seq.length - 1]), true); push(foot(sp.to.cell, seq[seq.length - 2]), true); }
        else if (sp.to.kind === 'node') { if (seq.length > 1) push(edgeMid(seq[seq.length - 2], seq[seq.length - 1]), true); push(centre(sp.to.cell), true); }
        // bouts ouverts (la route s'arrête sur l'eau) : le tablier s'arrête un peu après le centre de la dernière case
        const open = (c: number, ref: number[] | undefined, atStart: boolean) => {
          const ct = centre(c);
          let dx = ref ? ct[0] - ref[0] : 1, dz = ref ? ct[1] - ref[1] : 0;
          const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const p = [ct[0] + dx * 0.32, ct[1] + dz * 0.32];
          if (atStart) { line.unshift(p); keep.unshift(true); } else { line.push(p); keep.push(true); }
        };
        if (sp.from.kind === 'open') open(seq[0], line[0], true);
        if (sp.to.kind === 'open') open(seq[seq.length - 1], line.length > 1 ? line[line.length - 1] : undefined, false);
        if (line.length < 2) continue;
        // axe : simplifié (une route en escalier devient une diagonale), coudes arrondis, puis recoupé en pas réguliers
        const axis = resample(chaikin(simplify(line, keep, 0.3)), STEP);
        const n = axis.length, S = [0];
        for (let i = 1; i < n; i++) S.push(S[i - 1] + Math.hypot(axis[i][0] - axis[i - 1][0], axis[i][1] - axis[i - 1][1]));
        const cellAt = (p: number[]) => { const x = Math.floor(p[0]), z = Math.floor(p[1]); return w.inCells(x, z) ? w.ci(x, z) : -1; };
        const wet = axis.map((p) => { const c = cellAt(p); return c >= 0 && comp.has(c) && w.realWater(c % N, Math.floor(c / N)); });
        const ground = axis.map((p) => w.hAt(p[0], p[1]));
        const water = axis.map((p) => { const c = cellAt(p); return c >= 0 ? waterLevel(w, c) : SEA; });
        const endY = (e: SpanEnd, first: number, i: number) => {
          if (e.kind === 'bank') return footY(e.cell, first);
          if (e.kind === 'node') return nodeY.get(e.cell)!;
          return Math.max(water[i] + DECK_CLEAR, ground[i] + ABOVE_GROUND);
        };
        const y0 = endY(sp.from, seq[sp.from.cell >= 0 ? 1 : 0] ?? seq[0], 0), y1 = endY(sp.to, seq[sp.to.cell >= 0 ? seq.length - 2 : seq.length - 1] ?? seq[0], n - 1);
        const prof = deckProfile(S, wet, ground, water, y0, y1);
        let top = -Infinity;
        wet.forEach((v, i) => { if (v) top = Math.max(top, water[i]); });
        spans.push({ cells: sp.cells, from: sp.from, to: sp.to, pts: axis.map((p, i) => [p[0], prof.y[i], p[1]]), S, wet, a: prof.a, b: prof.b, water: top });
      }
      return spans;
    };
    let spans = buildSpans();
    // un plateau se met à la hauteur du plus haut des tronçons qui en partent (le sol ou l'eau en ont relevé un) : seconde passe
    let raised = false;
    for (const sp of spans) for (const [e, i] of [[sp.from, 0], [sp.to, sp.pts.length - 1]] as const) {
      if (e.kind !== 'node') continue;
      const y = sp.pts[i][1];
      if (y > nodeY.get(e.cell)! + 1e-6) { nodeY.set(e.cell, y); raised = true; }
    }
    if (raised) spans = buildSpans();
    out.push({ cells: comp, spans, nodes: nodeY });
  }
  return out;
}

/** Franchissement par case portée */
export function crossingMap(w: World): Map<number, Crossing> {
  const out = new Map<number, Crossing>();
  for (const cr of findCrossings(w)) for (const c of cr.cells) out.set(c, cr);
  return out;
}

/** Point de l'axe du franchissement le plus proche de (x, z), et la hauteur du tablier en ce point */
export function nearestOnDeck(cr: Crossing, x: number, z: number): { x: number; y: number; z: number; d: number } {
  let best = { x, y: -Infinity, z, d: Infinity };
  const cx = Math.floor(x), cz = Math.floor(z);
  for (const [k, y] of cr.nodes) if (k % N === cx && Math.floor(k / N) === cz) best = { x: cx + 0.5, y, z: cz + 0.5, d: Math.hypot(x - cx - 0.5, z - cz - 0.5) };
  for (const sp of cr.spans) {
    const P = sp.pts;
    for (let i = 0; i + 1 < P.length; i++) {
      const ax = P[i][0], az = P[i][2], bx = P[i + 1][0] - ax, bz = P[i + 1][2] - az, l = bx * bx + bz * bz;
      const t = l ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l)) : 0;
      const px = ax + bx * t, pz = az + bz * t, d = Math.hypot(x - px, z - pz);
      if (d < best.d) best = { x: px, y: P[i][1] + (P[i + 1][1] - P[i][1]) * t, z: pz, d };
    }
  }
  return best;
}
