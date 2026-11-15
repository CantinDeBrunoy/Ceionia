import type { World } from '../world/world';
import type { RivalIsle } from '../world/archipelago';
import { tr } from '../i18n';
import { KINDS } from '../build/catalog';
import { archipelagoOn, isleOf, isleName, onRival } from './diplomacy';
import { townCells, townPlan } from '../world/rivalTown';

/**
 * Bâtir chez l'allié. Avec l'archipel et un allié choisi, le joueur bâtit aussi sur l'île de son allié, hors de la ville de
 * décor (remparts, lots, champs, port et rues de `townPlan`) : routes, relief, plantations et biomes suivent la même règle
 * (`World.playable`). L'île de l'autre peuple et les petites îles restent interdites.
 * Le lien entre les deux îles : les ports suffisent, sans route continue. Chaque île a son réseau de routes ; les ressources
 * et les besoins sont communs (ils n'ont pas de portée), les habitants ne traversent pas la mer
 */

type Land = Pick<World, 'isles' | 'diplo' | 'seed' | 'inCells' | 'ci'>;

/** L'île de l'allié (null sans archipel ou sans allié) */
export function allyIsle(w: Pick<World, 'isles' | 'diplo'>): RivalIsle | null {
  return archipelagoOn(w) && w.diplo.ally ? isleOf(w, w.diplo.ally) : null;
}

/** La case est-elle dans la ville de décor de l'allié ? */
export function inAllyTown(w: Land, x: number, z: number) {
  const isle = allyIsle(w);
  if (!isle || !w.inCells(x, z)) return false;
  return townCells(w as World, townPlan(w as World, isle)).has(w.ci(x, z));
}

/** La case est-elle sur l'île de l'allié, hors de sa ville ? (la terre est vérifiée à part) */
export function allyLand(w: Land, x: number, z: number) {
  const isle = allyIsle(w);
  return !!isle && onRival(isle, x + 0.5, z + 0.5) && !inAllyTown(w, x, z);
}

/** Pourquoi le joueur ne bâtit pas sur cette case hors de son île (null : il y bâtit) ; à n'appeler qu'hors de l'île principale */
export function awayWhy(w: Land, x: number, z: number): string | null {
  const isle = allyIsle(w);
  if (isle && onRival(isle, x + 0.5, z + 0.5)) return inAllyTown(w, x, z) ? tr('C’est la ville de vos alliés : bâtissez hors de ses murs, de ses champs et de ses rues') : null;
  if (archipelagoOn(w) && !w.diplo.ally && w.isles!.rivals.some((r) => onRival(r, x + 0.5, z + 0.5))) return tr('Choisissez d’abord votre allié : vous bâtirez sur son île');
  return tr('Hors de votre île : on ne bâtit pas sur les autres îles');
}

/** Un point de l'île alliée où poser la vue pour y bâtir : le centre de son lobe le plus loin de la ville */
export function allyView(w: Pick<World, 'isles' | 'diplo'>): { x: number; z: number } | null {
  const isle = allyIsle(w);
  if (!isle) return null;
  const v = isle.village, lobe = [...isle.lobes].sort((a, b) => Math.hypot(b.x - v.x, b.z - v.z) - Math.hypot(a.x - v.x, a.z - v.z))[0];
  return lobe ? { x: lobe.x, z: lobe.z } : { x: v.x, z: v.z };
}

/** Le bâtiment est-il sur l'île de l'allié ? (son coin et son coin opposé) */
export function onAllyIsle(w: Pick<World, 'isles' | 'diplo'>, x: number, z: number, s = 1) {
  const isle = allyIsle(w);
  return !!isle && onRival(isle, x + 0.5, z + 0.5) && onRival(isle, x + s - 0.5, z + s - 0.5);
}

/**
 * L'installation chez l'allié est-elle faite ? Un allié choisi, un port sur son île et un comptoir (il ne se pose que là).
 * Lue par la diplomatie : la carte de la paix ou de la guerre s'ouvre ensuite
 */
export function allyPostReady(w: Pick<World, 'isles' | 'diplo' | 'buildings'>): boolean {
  if (!allyIsle(w)) return false;
  let harbor = false, post = false;
  for (const b of w.buildings.values()) {
    if (b.kind === 'tradepost') post = true;
    else if (b.kind === 'harbor' && onAllyIsle(w, b.x, b.z, KINDS.harbor.size)) harbor = true;
  }
  return harbor && post;
}

/** Pourquoi le comptoir ne se pose pas ici (null : il se pose) : seulement sur l'île de l'allié */
export function tradepostWhy(w: Pick<World, 'isles' | 'diplo'>, x: number, z: number, s: number): string | null {
  if (!archipelagoOn(w)) return tr('Le comptoir se bâtit chez un peuple allié : explorez d’abord le monde');
  const ally = w.diplo.ally;
  if (!ally) return tr('Le comptoir se bâtit chez votre allié : choisissez-le d’abord');
  if (!onAllyIsle(w, x, z, s)) return tr('Le comptoir se bâtit sur l’île de votre allié ({isle})', { isle: isleName(ally) });
  return null;
}
