import { KINDS, KindId } from '../build/catalog';

/**
 * Ressources du village : le bois des bûcherons, la pierre des carrières et des mines, le minerai des mines et des
 * profondeurs. Bois et pierre ne servent qu'à bâtir les grands bâtiments (2 × 2) ; la production est généreuse, pour ne
 * jamais bloquer le village. Les petits bâtiments restent gratuits
 */

export interface Cost { wood: number; stone: number }
export type Resource = 'wood' | 'stone' | 'ore';

/** Stock au départ d'une partie (et d'une ancienne sauvegarde qui n'en avait pas) */
export const START_WOOD = 60, START_STONE = 60;

/** Prix d'un grand bâtiment à l'âge du village (null : petit bâtiment, gratuit) ; les enclos ne demandent presque pas de pierre */
export function costOf(kind: KindId, age: number): Cost | null {
  const d = KINDS[kind];
  if (d.size < 2) return null;
  const a = Math.max(age, d.minAge), pens = kind === 'pen' || kind === 'stable';
  return { wood: 8 + a * 4, stone: pens ? 2 + a : 6 + a * 4 };
}

export const costLabel = (c: Cost) => [c.wood ? `${c.wood} bois` : '', c.stone ? `${c.stone} pierre` : ''].filter(Boolean).join(' et ');

/** Production par jour d'un bâtiment, selon son âge */
export const YIELD: Partial<Record<KindId, Partial<Record<Resource, number[]>>>> = {
  lumber: { wood: [4, 6, 8, 11, 14] },
  quarry: { stone: [3, 5, 7, 9, 12] },
  mine: { ore: [0, 0, 3, 5, 8], stone: [0, 0, 2, 3, 4] },
};

export const RES_NAME: Record<Resource, string> = { wood: 'bois', stone: 'pierre', ore: 'minerai' };
