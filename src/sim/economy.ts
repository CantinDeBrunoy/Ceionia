import { KINDS, KindId } from '../build/catalog';
import type { World } from '../world/world';

/**
 * Ressources du village : le bois des bûcherons, la pierre des carrières et des mines, le minerai des mines et des
 * profondeurs ; dès l'âge industriel, le pétrole brut des puits, que la raffinerie change en carburant (les automobiles en
 * brûlent chaque jour, et à l'époque moderne les blindés de l'expédition armée) ; dès l'âge industriel, les briques de la briqueterie, qu'exigent quelques grands bâtiments
 * (gares, usines, raffineries) et le passage à l'époque moderne. Bois et pierre ne servent qu'à bâtir les grands bâtiments
 * (2 × 2) ; la production est généreuse, pour ne jamais bloquer le village. Les petits bâtiments restent gratuits
 */

/** Prix d'un bâtiment : bois et pierre, et des briques pour quelques grands bâtiments industriels (absentes : aucune) */
export interface Cost { wood: number; stone: number; brick?: number }
export type Resource = 'wood' | 'stone' | 'ore' | 'crude' | 'fuel' | 'brick';

/** Stock au départ d'une partie (et d'une ancienne sauvegarde qui n'en avait pas) */
export const START_WOOD = 100, START_STONE = 100;

/**
 * Briques qu'exigent, en plus du bois et de la pierre, les grands bâtiments industriels (en partie normale) : les gares sont de
 * brique, l'usine automobile et la raffinerie de grands ateliers de brique. La briqueterie elle-même n'en demande pas (sans
 * quoi on n'en ferait jamais)
 */
export const BRICK_PRICE: Partial<Record<KindId, number>> = { station: 10, terminal: 30, carworks: 20, refinery: 30 };

/**
 * Prix d'un bâtiment à l'âge du village (null : gratuit) ; les enclos ne demandent presque pas de pierre. Seuls les grands
 * bâtiments se paient
 */
export function costOf(kind: KindId, age: number): Cost | null {
  const d = KINDS[kind];
  const a = Math.max(age, d.minAge), pens = kind === 'pen' || kind === 'stable';
  const brick = BRICK_PRICE[kind];
  // la place du village, première pose de la partie, est gratuite malgré ses 3 × 3 cases (une place dégagée, sans murs)
  if (d.size < 2 || kind === 'gather') return null;
  return { wood: 8 + a * 4, stone: pens ? 2 + a : 6 + a * 4, ...(brick ? { brick } : {}) };
}

/** Prix d'un bâtiment neuf dans cette partie : rien en ressources illimitées */
export function priceIn(w: World, kind: KindId, age: number): Cost | null {
  if (w.unlimited) return null;
  return costOf(kind, age);
}

export const canPay = (w: World, c: Cost | null) => !c || (w.wood >= c.wood && w.stone >= c.stone && w.brick >= (c.brick ?? 0));

export function pay(w: World, c: Cost | null) {
  if (!c) return;
  w.wood -= c.wood; w.stone -= c.stone; w.brick -= c.brick ?? 0;
}

export const costLabel = (c: Cost) => {
  const parts = [c.wood ? `${c.wood} bois` : '', c.stone ? `${c.stone} pierre` : '', c.brick ? `${c.brick} brique${c.brick > 1 ? 's' : ''}` : ''].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}` : parts[0] ?? '';
};

/** Ce qui manque pour payer, à dire au joueur */
export const shortLabel = (w: World, c: Cost) => `Il faut ${costLabel(c)} (vous avez ${Math.floor(w.wood)} bois${c.brick ? `, ${Math.floor(w.stone)} pierre et ${Math.floor(w.brick)} brique${Math.floor(w.brick) > 1 ? 's' : ''}` : ` et ${Math.floor(w.stone)} pierre`})`;

/** Production par jour d'un bâtiment, selon son âge */
export const YIELD: Partial<Record<KindId, Partial<Record<Resource, number[]>>>> = {
  // le double d'avant : la production venait trop lentement pour bâtir les grands bâtiments
  lumber: { wood: [8, 12, 16, 22, 28, 34] },
  quarry: { stone: [6, 10, 14, 18, 24, 30] },
  mine: { ore: [0, 0, 6, 10, 16, 20], stone: [0, 0, 4, 6, 8, 10] },
  // le marché du Moyen Âge (le lieu de rencontre de cet âge) fait du troc : un peu de bois et de pierre
  gather: { wood: [0, 0, 3, 0, 0, 0], stone: [0, 0, 2, 0, 0, 0] },
  oilwell: { crude: [0, 0, 0, 3, 4, 5] },
  // la briqueterie fabrique ses briques à partir de rien (l'argile ne se compte pas), à un rythme proche de la carrière
  brickworks: { brick: [0, 0, 0, 8, 12, 16] },
};

/** Raffinerie : pétrole brut qu'elle traite par jour, au plus, et carburant qu'elle tire de chaque baril */
export const REFINE_CRUDE = 12, FUEL_PER_CRUDE = 0.75;

/** Carburant que brûlent chaque jour les automobiles d'une usine automobile (sans carburant, elles restent au garage) */
export const CAR_FUEL = 2;

export const RES_NAME: Record<Resource, string> = { wood: 'bois', stone: 'pierre', ore: 'minerai', crude: 'pétrole brut', fuel: 'carburant', brick: 'briques' };
