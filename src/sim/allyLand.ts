import type { World } from '../world/world';
import { smallIsleCells, type RivalIsle } from '../world/archipelago';
import { tr } from '../i18n';
import { KINDS } from '../build/catalog';
import { archipelagoOn, isleOf, isleName, onRival } from './diplomacy';
import { townCells, townPlan } from '../world/rivalTown';
import { inAllyZone, inFront, rivalZone } from './concession';
import { zoneOf } from '../world/concession';

/**
 * Bâtir chez l'allié. Avec l'archipel et un allié choisi, le joueur bâtit aussi sur l'île de son allié, hors de la ville de
 * décor (remparts, lots, champs, port et rues de `townPlan`) : routes, relief, plantations et biomes suivent la même règle
 * (`World.playable`). L'île de l'autre peuple reste interdite.
 * Les petites îles (`small` de l'archipel, sans peuple) se bâtissent dès que l'archipel est ouvert (demande de l'auteur du
 * 27 nov. 2026 : la grande île entre l'allié et le rival) : elles ne sont à personne, nul n'a à les céder. Les toutes
 * petites îles (rochers, îlots, atolls) restent du décor.
 * Le lien entre les îles : les ports suffisent, sans route continue. Chaque île a son réseau de routes ; les ressources
 * et les besoins sont communs (ils n'ont pas de portée), les habitants ne traversent pas la mer
 */

type Land = Pick<World, 'isles' | 'diplo' | 'seed' | 'inCells' | 'ci'>;

/** La petite île de cette case, sa terre et l'eau qui la borde (son numéro dans `isles.small`, -1 : aucune) */
export function smallIsleAt(w: Pick<World, 'isles' | 'seed' | 'inCells' | 'ci'>, x: number, z: number): number {
  if (!w.isles || !w.isles.small.length || !w.inCells(x, z)) return -1;
  // (le côté de la carte : `ci(0, 1)`)
  const k = w.ci(x, z), m = smallIsleCells(w.isles, w.seed, w.ci(0, 1));
  return m[k] ?? -1;
}

/**
 * L'île d'une case, pour les routes automatiques (chaque île a son réseau) : 0 l'île principale, 1 + son numéro une petite
 * île, -1 ailleurs (chez l'allié, dans la tête de pont)
 */
export function landOf(w: Pick<World, 'isles' | 'seed' | 'inCells' | 'ci' | 'inMain'>, x: number, z: number): number {
  if (w.inMain(x, z)) return 0;
  const i = smallIsleAt(w, x, z);
  return i >= 0 ? i + 1 : -1;
}

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

/**
 * La case est-elle jouable hors de l'île principale ? Les petites îles, la concession de l'allié (la zone bornée qu'il nous
 * cède, décision de l'auteur du 24 nov. 2026 : avant, toute son île hors de sa ville), et la tête de pont chez le rival une
 * fois la plage prise (voir `sim/concession.ts`). La terre est vérifiée à part
 */
export function allyLand(w: Land, x: number, z: number) {
  return smallIsleAt(w, x, z) >= 0 || inAllyZone(w as World, x, z) || inFront(w as World, x, z);
}

/** Pourquoi le joueur ne bâtit pas sur cette case hors de son île (null : il y bâtit) ; à n'appeler qu'hors de l'île principale */
export function awayWhy(w: Land, x: number, z: number): string | null {
  if (smallIsleAt(w, x, z) >= 0) return null;
  const isle = allyIsle(w);
  if (isle && onRival(isle, x + 0.5, z + 0.5)) {
    if (inAllyZone(w as World, x, z)) return null;
    return inAllyTown(w, x, z) ? tr('C’est la ville de vos alliés : on ne bâtit chez eux que dans la concession, la zone bornée qu’ils nous cèdent') : tr('Chez votre allié, on ne bâtit que dans la concession, la zone bornée qu’il nous cède');
  }
  const front = rivalZone(w as World);
  if (front && w.inCells(x, z) && front.cells.has(w.ci(x, z))) return inFront(w as World, x, z) ? null : tr('La tête de pont s’ouvre une fois la plage de l’île rivale prise (la voie de la guerre)');
  if (archipelagoOn(w) && !w.diplo.ally && w.isles!.rivals.some((r) => onRival(r, x + 0.5, z + 0.5))) return tr('Choisissez d’abord votre allié : vous bâtirez sur son île');
  return tr('Hors de votre île, on ne bâtit que sur les petites îles libres et chez votre allié');
}

/** Un point de l'île alliée où poser la vue pour y bâtir : le milieu de la concession (ou le lobe le plus loin de la ville) */
export function allyView(w: Pick<World, 'isles' | 'diplo'>): { x: number; z: number } | null {
  const isle = allyIsle(w);
  if (!isle) return null;
  const zone = zoneOf(w as World, isle.people);
  if (zone) return { x: zone.x, z: zone.z };
  const v = isle.village, lobe = [...isle.lobes].sort((a, b) => Math.hypot(b.x - v.x, b.z - v.z) - Math.hypot(a.x - v.x, a.z - v.z))[0];
  return lobe ? { x: lobe.x, z: lobe.z } : { x: v.x, z: v.z };
}

/**
 * Où poser le port chez l'allié : l'emprise valable (`canPlace`) la plus proche de notre île, son centre (null : aucune). On
 * n'examine que le carré qui entoure l'île (une vingtaine de milliers d'emprises, quelques dizaines de millisecondes) : à
 * appeler à la demande, pas à chaque image. La vue y va (`Game.goAlly`), la balise ⚓ la marque (`SpotBeacon`)
 */
export function allyHarborSpot(w: World): { x: number; z: number } | null {
  const isle = allyIsle(w);
  if (!isle) return null;
  const s = KINDS.harbor.size, m = w.isles!.main, hx = m.x + m.n / 2, hz = m.z + m.n / 2;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const l of isle.lobes) { x0 = Math.min(x0, l.x - l.r); x1 = Math.max(x1, l.x + l.r); z0 = Math.min(z0, l.z - l.r); z1 = Math.max(z1, l.z + l.r); }
  let best: { x: number; z: number } | null = null, bd = Infinity;
  for (let z = Math.floor(z0) - 4; z < z1 + 4; z++)
    for (let x = Math.floor(x0) - 4; x < x1 + 4; x++) {
      const d = Math.hypot(x + s / 2 - hx, z + s / 2 - hz);
      if (d >= bd || !w.inCells(x, z) || w.canPlace('harbor', x, z) !== null) continue;
      bd = d; best = { x: x + s / 2, z: z + s / 2 };
    }
  return best;
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
