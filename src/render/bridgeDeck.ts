import { World, N } from '../world/world';

/**
 * Profil en long du tablier d'un petit pont : plat au-dessus de l'eau (et un peu sur les rives), rampes douces jusqu'au pied
 * du chemin aux deux bouts, jamais sous le sol.
 * `S` : abscisses (longueur cumulée) des points de l'axe ; `wet` : le point est au-dessus de l'eau ; `ground` : hauteur du sol
 * sous chaque point ; `deckY` : hauteur voulue du tablier ; `y0`, `y1` : hauteur des deux pieds de rampe.
 * Renvoie les hauteurs et l'intervalle [a, b] (en abscisse) du tablier plat, vide (a > b) s'il n'y a pas d'eau.
 */
export function deckProfile(S: number[], wet: boolean[], ground: number[], deckY: number, y0: number, y1: number): { y: number[]; a: number; b: number; deck: number } {
  const n = S.length, iw = wet.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (!iw.length) return { y: ground.map((g) => g + 0.03), a: 1, b: 0, deck: deckY };
  const a = Math.max(0, S[iw[0]] - 0.12), b = Math.min(S[n - 1], S[iw[iw.length - 1]] + 0.12);
  // le tablier ne passe jamais sous le sol (ruisseau dont la rive est plus haute que l'eau)
  let dk = deckY;
  for (let i = 0; i < n; i++) if (S[i] >= a && S[i] <= b) dk = Math.max(dk, ground[i] + 0.03);
  const sm = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
  const y = S.map((s, i) => {
    if (s >= a && s <= b) return dk;
    let v: number;
    if (s < a) { const t = sm(s / a); v = dk * t + y0 * (1 - t); } else { const t = sm((s - b) / Math.max(0.001, S[n - 1] - b)); v = dk * (1 - t) + y1 * t; }
    return Math.max(v, ground[i] + 0.03);
  });
  return { y, a, b, deck: dk };
}

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Combien de cases sèches au plus un pont enjambe d'un seul tenant entre deux bras d'eau le long de la même route */
export const MAX_DRY_GAP = 4;

/**
 * Cases de route portées par un pont : celles qui passent sur l'eau (vraie eau, pas une flaque), et les cases sèches prises
 * entre deux d'entre elles le long de la même route (quatre au plus, tant que le sol n'y dépasse pas le tablier de plus d'une
 * demi-case) : un ruisseau qui serpente sous la route la mouille par endroits, on n'y jette qu'un seul ouvrage d'une rive à
 * l'autre, dans l'axe de la route, au lieu de plusieurs petits ponts rapprochés
 */
export function bridgeCells(w: World): Set<number> {
  const out = new Set<number>();
  const road = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1;
  for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) if (road(cx, cz) && w.bridgeY(cx, cz) !== null) out.add(w.ci(cx, cz));
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
      if (w.cellAvg(cur % N, Math.floor(cur / N)) > (w.bridgeY(k % N, Math.floor(k / N)) ?? 0) + 0.5) break;
      gap.push(cur);
      const next = n[0] === prev ? n[1] : n[0];
      prev = cur; cur = next;
    }
  }
  return out;
}

/** Ouvrages d'art : groupes de cases de route portées par un pont, voisines entre elles (4-voisinage) */
export function bridgeGroups(w: World, cells: Set<number> = bridgeCells(w)): number[][] {
  const seen = new Set<number>(), out: number[][] = [];
  for (const k of cells) {
    if (seen.has(k)) continue;
    const g = [k];
    seen.add(k);
    for (let i = 0; i < g.length; i++) {
      const x = g[i] % N, z = Math.floor(g[i] / N);
      for (const [dx, dz] of D4) { if (!w.inCells(x + dx, z + dz)) continue; const n = w.ci(x + dx, z + dz); if (cells.has(n) && !seen.has(n)) { seen.add(n); g.push(n); } }
    }
    out.push(g);
  }
  return out;
}
