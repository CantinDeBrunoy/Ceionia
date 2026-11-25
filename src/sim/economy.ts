import { KINDS, KindId, isDecor } from '../build/catalog';
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
/** (l'or ne se produit pas : il ne vient que du comptoir des voisins, voir `trade.ts`) */
export type Resource = 'wood' | 'stone' | 'ore' | 'crude' | 'fuel' | 'brick' | 'gold';

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
  // (un pan de rempart : le tiers d'un petit bâtiment, un mur en compte des dizaines ; une décoration, le quart)
  const s = plaza ? 1 : kind === 'wall' ? 0.34 : isDecor(kind) ? 0.25 : d.size;
  // ce qui produit une matière ne la demande pas : jamais bloqué faute de la matière même qu'il donnerait (le bûcheron ne
  // coûte pas de bois, la carrière pas de pierre ; la briqueterie, sans briques, et la mine, sans minerai, l'étaient déjà)
  return { wood: kind === 'lumber' ? 0 : Math.max(1, Math.round(s * (p.wood + a * p.woodAge))), stone: kind === 'quarry' ? 0 : Math.max(1, Math.round(s * (pens ? p.penStone + a * p.penStoneAge : p.stone + a * p.stoneAge))), ...(brick ? { brick: Math.round(brick * 1.5) } : {}) };
}

/** Prix d'un bâtiment neuf dans cette partie : rien en ressources illimitées, sinon selon la difficulté */
export function priceIn(w: World, kind: KindId, age: number): Cost | null {
  if (w.unlimited) return null;
  let owned = 0;
  if (PRODUCERS.includes(kind)) for (const b of w.buildings.values()) if (b.kind === kind) owned++;
  return costOf(kind, age, w.difficulty, owned);
}

/**
 * Ce que rend la démolition d'un bâtiment : une part (`refund` de la difficulté : tout en Facile, la moitié en Normal) de
 * son prix à son âge, arrondie vers le bas ; rien en ressources illimitées. Le premier producteur, offert en Normal, ne
 * rend rien (`owned` compte les autres du même genre)
 */
export function refundOf(w: World, b: { id: number; kind: KindId; age: number }): Cost | null {
  const k = rulesOf(w.difficulty).refund;
  if (w.unlimited || !k) return null;
  let owned = 0;
  if (PRODUCERS.includes(b.kind)) for (const o of w.buildings.values()) if (o.kind === b.kind && o.id !== b.id) owned++;
  const c = costOf(b.kind, b.age, w.difficulty, owned);
  if (!c) return null;
  const r = { wood: Math.floor(c.wood * k), stone: Math.floor(c.stone * k), ...(c.brick ? { brick: Math.floor(c.brick * k) } : {}) };
  return r.wood || r.stone || r.brick ? r : null;
}

/** Rend au village ce que rapporte une démolition (voir `refundOf`) ; le prix rendu, ou null */
export function refund(w: World, b: { id: number; kind: KindId; age: number }): Cost | null {
  const r = refundOf(w, b);
  if (r) { w.wood += r.wood; w.stone += r.stone; w.brick += r.brick ?? 0; }
  return r;
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

/** Ce qui manque de chaque matériau pour payer ce prix (rien : 0), arrondi au-dessus (9,6 bois pour 10 : il en manque 1) */
export const missingOf = (w: World, c: Cost): Cost => {
  const gap = (need: number, have: number) => Math.max(0, Math.ceil(need - have - 1e-9));
  const m: Cost = { wood: gap(c.wood, w.wood), stone: gap(c.stone, w.stone) };
  if (c.brick) m.brick = gap(c.brick, w.brick);
  return m;
};

/**
 * Ce qui manque pour payer, à dire au joueur : seulement le matériau qui manque (« Il manque 12 briques »), plus tout le prix
 * et toute la réserve (« Il faut 40 bois, 30 pierre et 20 briques (vous avez…) » : retour de joueurs, 22 nov. 2026)
 */
export const shortLabel = (w: World, c: Cost) => tr('Il manque {cost}', { cost: costLabel(missingOf(w, c)) });

/**
 * Les ressources ne suivent pas tout à fait la vitesse du jeu (décision de l'auteur, 25 nov. 2026 : « en plus de ×4, on a trop
 * de ressources ») : à ×4, elles viennent trois fois plus vite qu'à ×1, à ×8 quatre fois (×1 et ×2 inchangés). Couples (vitesse,
 * rythme des ressources en temps réel), entre eux en ligne droite
 */
export const ECO_PACE: readonly (readonly [number, number])[] = [[1, 1], [2, 2], [4, 3], [8, 4]];

/** Part d'un jour de jeu que comptent la production et la consommation à cette vitesse (1 jusqu'à ×2, 0,75 à ×4, 0,5 à ×8) */
export function ecoPace(speed: number): number {
  if (!(speed > ECO_PACE[0][0])) return 1;
  for (let i = 1; i < ECO_PACE.length; i++) {
    const [s0, r0] = ECO_PACE[i - 1], [s1, r1] = ECO_PACE[i];
    if (speed <= s1) return (r0 + ((r1 - r0) * (speed - s0)) / (s1 - s0)) / speed;
  }
  const [s, r] = ECO_PACE[ECO_PACE.length - 1];
  return r / s;
}

/** Production par jour d'un bâtiment, selon son âge */
export const YIELD: Partial<Record<KindId, Partial<Record<Resource, number[]>>>> = {
  // le double d'avant : la production venait trop lentement pour bâtir les grands bâtiments. Puis 12 et 14 (au lieu de 8 et
  // 12) à la Préhistoire et à l'Antiquité : en Normal, on attendait le bois sans rien faire (testeurs v6, 19 nov. 2026)
  lumber: { wood: [12, 14, 16, 22, 28, 34] },
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

export const RES_NAME: Record<Resource, string> = { wood: 'bois', stone: 'pierre', ore: 'minerai', crude: 'pétrole brut', fuel: 'carburant', brick: 'briques', gold: 'or' };
