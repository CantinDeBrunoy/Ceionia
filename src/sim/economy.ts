import { KINDS, KindId } from '../build/catalog';
import { Difficulty, rulesOf } from './difficulty';
import type { World } from '../world/world';

/**
 * Ressources du village : le bois des bûcherons, la pierre des carrières et des mines, le minerai des mines et des
 * profondeurs. Bois et pierre ne servent qu'à bâtir les grands bâtiments (2 × 2) ; la production est généreuse, pour ne
 * jamais bloquer le village. Les petits bâtiments restent gratuits (sauf en défi, où tout se paie, et plus cher)
 */

export interface Cost { wood: number; stone: number }
export type Resource = 'wood' | 'stone' | 'ore';

/** Stock au départ d'une partie (et d'une ancienne sauvegarde qui n'en avait pas) */
export const START_WOOD = 60, START_STONE = 60;

/** Ceux qui produisent bois et pierre : en défi, le premier est offert, pour ne jamais rester sans rien pour bâtir */
export const PRODUCERS: KindId[] = ['lumber', 'quarry'];

/**
 * Prix d'un bâtiment à l'âge du village (null : gratuit) ; les enclos ne demandent presque pas de pierre. En partie normale,
 * seuls les grands bâtiments se paient ; en défi, tous, selon leur emprise et l'âge (`owned` : combien le village en a déjà)
 */
export function costOf(kind: KindId, age: number, diff: Difficulty = 'normal', owned = 1): Cost | null {
  const d = KINDS[kind], p = rulesOf(diff).price;
  const a = Math.max(age, d.minAge), pens = kind === 'pen' || kind === 'stable';
  if (!p) {
    if (d.size < 2) return null;
    return { wood: 8 + a * 4, stone: pens ? 2 + a : 6 + a * 4 };
  }
  if (!owned && PRODUCERS.includes(kind)) return null;
  const s = d.size;
  return { wood: Math.round(s * (p.wood + a * p.woodAge)), stone: Math.round(s * (pens ? p.penStone + a * p.penStoneAge : p.stone + a * p.stoneAge)) };
}

/** Prix d'un bâtiment neuf dans cette partie : rien en ressources illimitées, sinon selon la difficulté */
export function priceIn(w: World, kind: KindId, age: number): Cost | null {
  if (w.unlimited) return null;
  let owned = 0;
  if (PRODUCERS.includes(kind)) for (const b of w.buildings.values()) if (b.kind === kind) owned++;
  return costOf(kind, age, w.difficulty, owned);
}

export const canPay = (w: World, c: Cost | null) => !c || (w.wood >= c.wood && w.stone >= c.stone);

export function pay(w: World, c: Cost | null) {
  if (!c) return;
  w.wood -= c.wood; w.stone -= c.stone;
}

export const costLabel = (c: Cost) => [c.wood ? `${c.wood} bois` : '', c.stone ? `${c.stone} pierre` : ''].filter(Boolean).join(' et ');

/** Ce qui manque pour payer, à dire au joueur */
export const shortLabel = (w: World, c: Cost) => `Il faut ${costLabel(c)} (vous avez ${Math.floor(w.wood)} bois et ${Math.floor(w.stone)} pierre)`;

/** Production par jour d'un bâtiment, selon son âge */
export const YIELD: Partial<Record<KindId, Partial<Record<Resource, number[]>>>> = {
  lumber: { wood: [4, 6, 8, 11, 14] },
  quarry: { stone: [3, 5, 7, 9, 12] },
  mine: { ore: [0, 0, 3, 5, 8], stone: [0, 0, 2, 3, 4] },
};

export const RES_NAME: Record<Resource, string> = { wood: 'bois', stone: 'pierre', ore: 'minerai' };
