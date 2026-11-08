import { KINDS, KindId } from '../build/catalog';
import { tr } from '../i18n';
import { Difficulty, rulesOf } from './difficulty';
import type { World } from '../world/world';

/**
 * Ressources du village : le bois des bûcherons, la pierre des carrières et des mines, le minerai des mines et des
 * profondeurs ; dès l'âge industriel, le pétrole brut des puits, que la raffinerie change en carburant (les automobiles en
 * brûlent chaque jour) ; dès l'âge industriel, les briques de la briqueterie, qu'exigent quelques grands bâtiments
 * (gares, usines, raffineries) et le passage à l'époque moderne. Bois et pierre ne servent qu'à bâtir les grands bâtiments
 * (2 × 2) ; la production est généreuse, pour ne jamais bloquer le village. Les petits bâtiments restent gratuits (sauf en Normal, où tout se paie, et
 * plus cher)
 */

/** Prix d'un bâtiment : bois et pierre, et des briques pour quelques grands bâtiments industriels (absentes : aucune) */
export interface Cost { wood: number; stone: number; brick?: number }
export type Resource = 'wood' | 'stone' | 'ore' | 'crude' | 'fuel' | 'brick';

/** Stock au départ d'une partie (et d'une ancienne sauvegarde qui n'en avait pas) */
export const START_WOOD = 100, START_STONE = 100;

/** Ceux qui produisent bois et pierre : en Normal, le premier est offert, pour ne jamais rester sans rien pour bâtir */
export const PRODUCERS: KindId[] = ['lumber', 'quarry'];

/**
 * Briques qu'exigent, en plus du bois et de la pierre, les grands bâtiments industriels (en Facile) : les gares sont de
 * brique, l'usine automobile et la raffinerie de grands ateliers de brique. La briqueterie elle-même n'en demande pas (sans
 * quoi on n'en ferait jamais) ; en Normal, le prix est plus lourd de moitié
 */
export const BRICK_PRICE: Partial<Record<KindId, number>> = { station: 10, terminal: 30, carworks: 20, refinery: 30 };

/**
 * Prix d'un bâtiment à l'âge du village (null : gratuit) ; les enclos ne demandent presque pas de pierre. En Facile,
 * seuls les grands bâtiments se paient ; en Normal, tous, selon leur emprise et l'âge (`owned` : combien le village en a déjà)
 */
export function costOf(kind: KindId, age: number, diff: Difficulty = 'easy', owned = 1): Cost | null {
  const d = KINDS[kind], p = rulesOf(diff).price;
  const a = Math.max(age, d.minAge), pens = kind === 'pen' || kind === 'stable';
  const brick = BRICK_PRICE[kind];
  // la place du village, première pose de la partie, se paie comme un petit bâtiment malgré ses 3 × 3 cases (une place
  // dégagée, sans murs) : gratuite en Facile
  const plaza = kind === 'gather';
  if (!p) {
    if (d.size < 2 || plaza) return null;
    return { wood: 8 + a * 4, stone: pens ? 2 + a : 6 + a * 4, ...(brick ? { brick } : {}) };
  }
  if (!owned && PRODUCERS.includes(kind)) return null;
  const s = plaza ? 1 : d.size;
  return { wood: Math.round(s * (p.wood + a * p.woodAge)), stone: Math.round(s * (pens ? p.penStone + a * p.penStoneAge : p.stone + a * p.stoneAge)), ...(brick ? { brick: Math.round(brick * 1.5) } : {}) };
}

/** Prix d'un bâtiment neuf dans cette partie : rien en ressources illimitées, sinon selon la difficulté */
export function priceIn(w: World, kind: KindId, age: number): Cost | null {
  if (w.unlimited) return null;
  let owned = 0;
  if (PRODUCERS.includes(kind)) for (const b of w.buildings.values()) if (b.kind === kind) owned++;
  return costOf(kind, age, w.difficulty, owned);
}

export const canPay = (w: World, c: Cost | null) => !c || (w.wood >= c.wood && w.stone >= c.stone && w.brick >= (c.brick ?? 0));

export function pay(w: World, c: Cost | null) {
  if (!c) return;
  w.wood -= c.wood; w.stone -= c.stone; w.brick -= c.brick ?? 0;
}

export const costLabel = (c: Cost) => {
  const parts = [c.wood ? tr('{n} bois', { n: c.wood }) : '', c.stone ? tr('{n} pierre', { n: c.stone }) : '', c.brick ? tr(c.brick > 1 ? '{n} briques' : '{n} brique', { n: c.brick }) : ''].filter(Boolean);
  return parts.length > 1 ? tr('{list} et {last}', { list: parts.slice(0, -1).join(', '), last: parts[parts.length - 1] }) : parts[0] ?? '';
};

/** Ce que le village a en réserve des matériaux de ce prix (bois, pierre, et briques s'il en faut) */
export const haveLabel = (w: World, c: Cost) => c.brick
  ? tr(Math.floor(w.brick) > 1 ? '{wood} bois, {stone} pierre et {brick} briques' : '{wood} bois, {stone} pierre et {brick} brique', { wood: Math.floor(w.wood), stone: Math.floor(w.stone), brick: Math.floor(w.brick) })
  : tr('{wood} bois et {stone} pierre', { wood: Math.floor(w.wood), stone: Math.floor(w.stone) });

/** Ce qui manque pour payer, à dire au joueur */
export const shortLabel = (w: World, c: Cost) => tr('Il faut {cost} (vous avez {have})', { cost: costLabel(c), have: haveLabel(w, c) });

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
