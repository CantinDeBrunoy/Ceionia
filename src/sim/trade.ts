import { AGES } from '../build/catalog';
import type { World } from '../world/world';

/**
 * L'or et le comptoir des voisins. L'or ne s'obtient que par l'échange avec le peuple allié (pas de mine d'or) : on lui vend
 * du bois, de la pierre, du minerai, des briques ou du carburant, ou on lui en achète. Il n'existe que dans une partie qui a
 * accepté d'explorer le monde (l'archipel) ; il sert alors à passer les âges (`reqGold`, en réserve).
 * Règles pures ici, sans interface ; la fiche « Les voisins » est dans `ui.ts`
 */

/** Ce qui s'échange au comptoir */
export type TradeRes = 'wood' | 'stone' | 'ore' | 'brick' | 'fuel';
export const TRADE_RES: TradeRes[] = ['wood', 'stone', 'ore', 'brick', 'fuel'];

/** Vendre : combien il en faut pour 1 or, au cours de départ */
export const SELL: Record<TradeRes, number> = { wood: 10, stone: 10, ore: 3, brick: 4, fuel: 2 };
/** Acheter : combien en donne 1 or (l'écart avec la vente fait que l'aller-retour ne rapporte rien) */
export const BUY: Record<TradeRes, number> = { wood: 6, stone: 6, ore: 2, brick: 2, fuel: 1 };

/** Saturation : chaque or vendu d'une ressource baisse son cours de 1 %, jusqu'à −40 % ; il remonte de 5 % par jour de jeu */
export const SAT_STEP = 0.01, SAT_MAX = 0.4, SAT_RECOVER = 0.05;

/**
 * L'archipel s'offre en entrant au Médiéval : qui l'accepte alors (ou avant, au bac à sable) doit réunir l'or dès le
 * passage à l'âge industriel. Qui accepte plus tard n'est pas bloqué au passage qui suit : la condition ne compte qu'à
 * partir de l'âge d'après (accepté à l'âge industriel : rien pour le Moderne, de l'or pour le Futuriste)
 */
export const GOLD_OFFER_AGE = 2;
/** Premier âge (à atteindre) dont l'or est demandé, selon l'âge du village quand l'archipel a été accepté */
export const firstGoldAge = (since: number) => (since <= GOLD_OFFER_AGE ? GOLD_OFFER_AGE + 1 : since + 2);

/** État du comptoir, sauvegardé : saturation de chaque ressource (0 … `SAT_MAX`) */
export interface TradeState { sat: Partial<Record<TradeRes, number>> }
export const newTradeState = (): TradeState => ({ sat: {} });

/** Relit l'état d'une sauvegarde (absent dans une ancienne partie : rien de saturé) */
export function readTradeState(d: unknown): TradeState {
  const t = newTradeState(), o = (d ?? {}) as { sat?: Record<string, unknown> };
  for (const r of TRADE_RES) { const v = Number(o.sat?.[r]); if (v > 0) t.sat[r] = Math.min(SAT_MAX, v); }
  return t;
}

/**
 * Âge du village quand l'archipel a été accepté (`World.exploredAt`, posé à l'agrandissement). Une partie qui a ses îles
 * sans cette date (une partie d'essai créée d'emblée sur l'archipel) compte comme acceptée dès le début
 */
export const goldSince = (w: Pick<World, 'exploredAt'>) => w.exploredAt ?? 0;

/** Combien de `r` il faut vendre pour 1 or, saturation comprise */
export const sellRate = (r: TradeRes, sat = 0) => SELL[r] / (1 - Math.min(SAT_MAX, sat));

/** Vendre `n` or de `r` : ce qu'il en coûte (chaque or vendu sature un peu plus le cours du suivant) et la saturation d'après */
export function sellQuote(r: TradeRes, sat: number, n: number) {
  let cost = 0, s = Math.min(SAT_MAX, Math.max(0, sat));
  for (let i = 0; i < n; i++) { cost += sellRate(r, s); s = Math.min(SAT_MAX, s + SAT_STEP); }
  return { cost, sat: s };
}

/** Acheter `n` or de `r` : ce qu'on en reçoit (l'achat ne change pas les cours) */
export const buyQuote = (r: TradeRes, n: number) => BUY[r] * n;

/** Le cours remonte avec le temps : `days` jours de jeu effacent `SAT_RECOVER` de saturation chacun */
export function recover(t: TradeState, days: number) {
  for (const r of TRADE_RES) {
    const v = t.sat[r];
    if (!v) continue;
    const s = v - days * SAT_RECOVER;
    if (s > 1e-9) t.sat[r] = s; else delete t.sat[r];
  }
}

/** Stocks échangeables : ceux du monde */
type Stocks = Pick<World, TradeRes | 'gold'> & { trade: TradeState };

/** Vend `n` or de `r` si le village en a assez ; true si c'est fait */
export function sell(w: Stocks, r: TradeRes, n = 1) {
  const q = sellQuote(r, w.trade.sat[r] ?? 0, n);
  if (n <= 0 || w[r] + 1e-9 < q.cost) return false;
  w[r] = Math.max(0, w[r] - q.cost);
  w.gold += n;
  w.trade.sat[r] = q.sat;
  return true;
}

/** Achète `r` pour `n` or si le village en a assez ; true si c'est fait */
export function buy(w: Stocks, r: TradeRes, n = 1) {
  if (n <= 0 || w.gold + 1e-9 < n) return false;
  w.gold = Math.max(0, w.gold - n);
  w[r] += buyQuote(r, n);
  return true;
}

/**
 * L'or demandé pour atteindre l'âge `next` : rien sans archipel, rien pour un âge qui suit de trop près une acceptation
 * tardive (`since` : l'âge du village à l'acceptation, `goldSince`), sinon `reqGold` de l'âge
 */
export function goldNeed(next: number, on: boolean, since: number) {
  const need = AGES[next]?.reqGold ?? 0;
  if (!on || !need) return 0;
  return next >= firstGoldAge(since) ? need : 0;
}
