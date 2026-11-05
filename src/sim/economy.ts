import { KINDS, KindId } from '../build/catalog';
import { Difficulty, rulesOf } from './difficulty';
import type { World } from '../world/world';

/**
 * Ressources du village : le bois des bûcherons, la pierre des carrières et des mines, le minerai des mines et des
 * profondeurs ; à l'époque moderne, le pétrole brut des puits, que la raffinerie change en carburant (les blindés de
 * l'expédition armée en consomment). Bois et pierre ne servent qu'à bâtir les grands bâtiments (2 × 2) ; la production est
 * généreuse, pour ne jamais bloquer le village. Les petits bâtiments restent gratuits (sauf en défi, où tout se paie, et
 * plus cher)
 */

export interface Cost { wood: number; stone: number }
export type Resource = 'wood' | 'stone' | 'ore' | 'crude' | 'fuel';

/** Stock au départ d'une partie (et d'une ancienne sauvegarde qui n'en avait pas) */
export const START_WOOD = 100, START_STONE = 100;

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
  // le double d'avant : la production venait trop lentement pour bâtir les grands bâtiments
  lumber: { wood: [8, 12, 16, 22, 28, 34] },
  quarry: { stone: [6, 10, 14, 18, 24, 30] },
  mine: { ore: [0, 0, 6, 10, 16, 20], stone: [0, 0, 4, 6, 8, 10] },
  // le marché du Moyen Âge (le lieu de rencontre de cet âge) fait du troc : un peu de bois et de pierre
  gather: { wood: [0, 0, 3, 0, 0, 0], stone: [0, 0, 2, 0, 0, 0] },
  oilwell: { crude: [0, 0, 0, 0, 4, 5] },
};

/** Raffinerie : pétrole brut qu'elle traite par jour, au plus, et carburant qu'elle tire de chaque baril */
export const REFINE_CRUDE = 12, FUEL_PER_CRUDE = 0.75;

export const RES_NAME: Record<Resource, string> = { wood: 'bois', stone: 'pierre', ore: 'minerai', crude: 'pétrole brut', fuel: 'carburant' };
