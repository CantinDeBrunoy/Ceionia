import { tr } from '../i18n';
import { KINDS, Building } from '../build/catalog';
import { costOf, canPay, shortLabel, Cost } from './economy';
import { PATROLS_MAX, PATROL_REACH, patrolsOf, rangeOf } from './coverage';
import { guardReach } from './legacy';
import type { World } from '../world/world';

/**
 * Les patrouilles d'un poste de police ou d'une caserne de pompiers (demande de l'auteur, 27 nov. 2026 : « améliorer le poste
 * en y ajoutant des patrouilles, et que chaque patrouille augmente sa portée »). Règles pures ; le nombre vit sur le bâtiment
 * (`Building.patrols`, sauvegardé), la portée se lit dans `rangeOf` (`coverage.ts`). Voir `docs/incidents.md`.
 * - Trois patrouilles au plus par poste (`PATROLS_MAX`), chacune +3 cases de portée (`PATROL_REACH`).
 * - Chacune coûte le prix du poste à l'âge du village, une fois pour la première, deux pour la deuxième, trois pour la
 *   troisième (`PATROL_PRICE`), et dès l'âge industriel 5 briques de plus par rang (`PATROL_BRICK`) : les matériaux de l'âge.
 * - Chacune emploie un habitant de plus (+1 emploi, `Sim`).
 * - Rien à payer en ressources illimitées. La démolition rend leur part, comme celle du poste.
 */

/** Le multiple du prix du poste pour la 1re, 2e, 3e patrouille */
export const PATROL_PRICE = [1, 2, 3];
/** Les briques de plus par rang de patrouille, dès l'âge industriel */
export const PATROL_BRICK = 5;
/** Les emplois de chaque patrouille */
export const PATROL_JOBS = 1;

/** Ce bâtiment peut-il avoir des patrouilles ? */
export const hasPatrols = (b: { kind: string }) => b.kind === 'fire' || b.kind === 'police';

/**
 * Le prix de la patrouille de rang `n` (1, 2 ou 3) pour ce genre de poste à l'âge `age` du village, selon la difficulté
 * (null : gratuite, en ressources illimitées)
 */
export function patrolCostOf(kind: 'fire' | 'police', n: number, age: number, w: Pick<World, 'unlimited' | 'difficulty'>): Cost | null {
  if (w.unlimited) return null;
  const a = Math.max(age, KINDS[kind].minAge), base = costOf(kind, a, w.difficulty, 1) ?? { wood: 8 + a * 4, stone: 6 + a * 4 };
  const k = PATROL_PRICE[Math.max(0, Math.min(PATROL_PRICE.length - 1, n - 1))];
  const brick = a >= 3 ? PATROL_BRICK * n : 0;
  return { wood: Math.round(base.wood * k), stone: Math.round(base.stone * k), ...(brick ? { brick } : {}) };
}

/** Le prix de la prochaine patrouille de ce poste (null : gratuite, ou plus possible) */
export function nextPatrolCost(w: World, b: Building, age: number): Cost | null {
  if (!hasPatrols(b) || patrolsOf(b) >= PATROLS_MAX) return null;
  return patrolCostOf(b.kind as 'fire' | 'police', patrolsOf(b) + 1, age, w);
}

/** Pourquoi on ne peut pas ajouter de patrouille à ce poste (null : on peut) */
export function patrolWhy(w: World, b: Building, age: number): string | null {
  if (!hasPatrols(b)) return tr('Ce bâtiment n’a pas de patrouille.');
  if (patrolsOf(b) >= PATROLS_MAX) return tr('Trois patrouilles au plus : le poste est au complet.');
  const c = nextPatrolCost(w, b, age);
  if (c && !canPay(w, c)) return shortLabel(w, c);
  return null;
}

/** La portée du poste aujourd'hui, et avec une patrouille de plus (cases) */
export function patrolRanges(w: World, b: Building): [number, number] {
  const r = rangeOf(b, guardReach(w));
  return [r, r + PATROL_REACH];
}

/** Ce qu'ont coûté ses patrouilles, au prix de l'âge du poste (pour ce que rend une démolition) */
export function patrolsSpent(w: Pick<World, 'unlimited' | 'difficulty'>, b: { kind: string; age: number; patrols?: number }): Cost | null {
  const n = patrolsOf(b);
  if (!n || w.unlimited) return null;
  const t: Cost = { wood: 0, stone: 0, brick: 0 };
  for (let i = 1; i <= n; i++) { const c = patrolCostOf(b.kind as 'fire' | 'police', i, b.age, w); if (c) { t.wood += c.wood; t.stone += c.stone; t.brick! += c.brick ?? 0; } }
  return t;
}
