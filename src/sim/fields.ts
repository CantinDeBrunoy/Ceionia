import { World, N, VEG_FIELD } from '../world/world';
import { hash2 } from '../core/rng';

/**
 * Les travaux des champs : les parcelles (cases de champ d'un seul tenant, avec le sens de leurs sillons tel que le dessine la
 * végétation), combien de bras on y voit (à l'échelle des passants : les champs donnent un emploi pour deux cases), ce qu'on
 * y fait selon la saison, et le trajet du tracteur dans les grandes parcelles à l'âge industriel et après
 */

/** Part des emplois des champs qu'on voit à l'ouvrage (un passant pour quatre à cinq habitants ; un peu plus aux champs) */
export const HAND_SHARE = 0.35;
/** Bras aux champs au plus : sur tout le village, et par parcelle */
export const MAX_HANDS = 12, PLOT_HANDS = 3;
/** Part de la population qu'on peut voir aux champs au plus (pas tout le village) */
export const HAND_POP = 0.15;
/** Le tracteur : à partir de l'âge industriel, dans une parcelle d'au moins tant de cases, sur une file droite assez longue */
export const TRACTOR_AGE = 3, TRACTOR_CELLS = 10, TRACTOR_RUN = 3;

export interface Plot {
  /** sa plus petite case : celle d'où la végétation tire le sens des sillons */
  key: number;
  cells: number[];
  /** sens des sillons (angle de u dans le plan x, z) */
  angle: number;
  /** centre (moyenne des cases) */
  cx: number; cz: number;
  /** bras qui y travaillent */
  hands: number;
}

/** Ce qu'on fait aux champs : biner, semer à la volée, moissonner, ramasser, bêcher, conduire le tracteur */
export type FieldTask = 'hoe' | 'sow' | 'reap' | 'gather' | 'dig' | 'drive';

/** Les parcelles : cases de champ voisines par un côté */
export function findPlots(w: World): Plot[] {
  const seen = new Uint8Array(N * N), out: Plot[] = [];
  for (let k0 = 0; k0 < N * N; k0++) {
    if (seen[k0] || w.veg[k0] !== VEG_FIELD) continue;
    // parcourue dans l'ordre des cases : la première trouvée est la plus petite de sa parcelle
    const cells = [k0];
    seen[k0] = 1;
    let sx = 0, sz = 0;
    for (let i = 0; i < cells.length; i++) {
      const x = cells[i] % N, z = Math.floor(cells[i] / N);
      sx += x; sz += z;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (w.inCells(nx, nz) && !seen[k] && w.veg[k] === VEG_FIELD) { seen[k] = 1; cells.push(k); }
      }
    }
    const angle = (hash2(k0 % N, Math.floor(k0 / N), 77) - 0.5) * Math.PI;
    out.push({ key: k0, cells, angle, cx: sx / cells.length + 0.5, cz: sz / cells.length + 0.5, hands: 0 });
  }
  return out;
}

/** Combien de bras on voit aux champs : une part des emplois qu'ils donnent (un pour deux cases), bornée par la population */
export function fieldHands(fields: number, pop: number) {
  const jobs = Math.floor(fields / 2);
  return Math.max(0, Math.min(MAX_HANDS, Math.ceil(jobs * HAND_SHARE), Math.floor(pop * HAND_POP)));
}

/** Bras qu'une parcelle peut occuper : un pour trois cases, trois au plus */
export const plotCap = (p: Plot) => Math.min(PLOT_HANDS, Math.ceil(p.cells.length / 3));

/** Répartit `n` bras entre les parcelles, à la plus forte moyenne (cases par bras), chacune dans la limite de ce qu'elle occupe */
export function shareHands(plots: Plot[], n: number) {
  for (const p of plots) p.hands = 0;
  for (let i = 0; i < n; i++) {
    let best: Plot | null = null, bv = 0;
    for (const p of plots) {
      if (p.hands >= plotCap(p)) continue;
      const v = p.cells.length / (p.hands + 1);
      if (v > bv) { bv = v; best = p; }
    }
    if (!best) break;
    best.hands++;
  }
}

/** On travaille aux champs du printemps à l'automne ; l'hiver, personne */
export const fieldSeason = (season: number) => season !== 3;

/**
 * Ce qu'on y fait selon la saison (`r` : tirage dans [0, 1[) : semer à la volée et biner au printemps, moissonner l'été (à
 * l'époque moderne, la moisson est au tracteur : on cueille à la main, en cagettes), ramasser et bêcher la terre à l'automne
 */
export function fieldTask(season: number, age: number, r: number): FieldTask | null {
  if (season === 0) return r < 0.45 ? 'sow' : 'hoe';
  if (season === 1) return r < 0.65 ? (age >= 4 ? 'gather' : 'reap') : 'hoe';
  if (season === 2) return r < 0.55 ? 'gather' : 'dig';
  return null;
}

/** File droite de cases d'une parcelle : sa première case, sa longueur, son sens (le long de x ou de z) */
export interface Run { x0: number; z0: number; len: number; alongX: boolean }

/** La plus longue file droite de cases de la parcelle (null si aucune n'est assez longue pour le tracteur) */
export function longestRun(p: Plot): Run | null {
  const set = new Set(p.cells);
  let best: Run | null = null;
  for (const k of p.cells) {
    const x = k % N, z = Math.floor(k / N);
    for (const alongX of [true, false]) {
      // seulement depuis le début d'une file
      if (set.has(alongX ? k - 1 : k - N) && (alongX ? x > 0 : z > 0)) continue;
      let len = 1;
      while (alongX ? x + len < N && set.has(k + len) : z + len < N && set.has(k + len * N)) len++;
      if (!best || len > best.len) best = { x0: x, z0: z, len, alongX };
    }
  }
  return best && best.len >= TRACTOR_RUN ? best : null;
}

/** Sillons du tracteur, en travers de la file (aller, retour…), rayon de ses demi-tours, marge laissée aux bouts */
const LANES = [-0.25, 0, 0.25, 0], TURN = 0.125, MARGIN = 0.24;

function runPoint(r: Run, d: number): [number, number] {
  const L = Math.max(0.1, r.len - 2 * MARGIN), seg = L + Math.PI * TURN, per = seg * LANES.length;
  const m = ((d % per) + per) % per, i = Math.floor(m / seg), rem = m - i * seg, fwd = i % 2 === 0;
  const a = LANES[i], b = LANES[(i + 1) % LANES.length];
  let along: number, across: number;
  if (rem < L) { along = fwd ? MARGIN + rem : MARGIN + L - rem; across = a; }
  else {
    // demi-tour au bout de la file, d'un sillon au suivant
    const t = (rem - L) / TURN, mid = (a + b) / 2;
    along = (fwd ? MARGIN + L : MARGIN) + (fwd ? 1 : -1) * TURN * Math.sin(t);
    across = mid + (a - mid) * Math.cos(t);
  }
  return r.alongX ? [r.x0 + along, r.z0 + 0.5 + across] : [r.x0 + 0.5 + across, r.z0 + along];
}

/** Où est le tracteur après `d` cases parcourues sur sa file (allers et retours d'un sillon à l'autre) : x, z, cap */
export function rigAt(r: Run, d: number): [number, number, number] {
  const [x, z] = runPoint(r, d), [x2, z2] = runPoint(r, d + 0.02);
  return [x, z, Math.atan2(x2 - x, z2 - z)];
}

/** Les cases de la file (le tracteur y passe : on n'y travaille pas à la main) */
export function runCells(r: Run): number[] {
  const out: number[] = [];
  for (let i = 0; i < r.len; i++) out.push(r.alongX ? r.z0 * N + r.x0 + i : (r.z0 + i) * N + r.x0);
  return out;
}
