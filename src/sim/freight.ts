import { Building, KindId, sizeOf } from '../build/catalog';
import type { World } from '../world/world';

/**
 * Le rail au service du village : une gare desservie par un train de marchandises fait produire davantage les ateliers et
 * les carrières à côté d'elle (le train emporte ce qu'ils font et leur amène ce qu'il leur faut) ; une gare desservie par un
 * train de voyageurs amène au cosmodrome ses équipes et ses visiteurs. « À côté » : à `RAIL_REACH` cases au plus, d'un bord
 * à l'autre des deux bâtiments
 */

/** Les gares : la petite gare, la gare centrale, la gare maglev */
export const STATION_KINDS: KindId[] = ['station', 'terminal', 'maglev'];
export const isStation = (b: Building) => STATION_KINDS.includes(b.kind);

/** Distance (en cases) jusqu'où une gare sert ses voisins */
export const RAIL_REACH = 5;
/** Production en plus d'un bâtiment servi par une gare de marchandises */
export const FREIGHT_BONUS = 0.5;
/** Les bâtiments qui produisent, que sert une gare de marchandises voisine */
export const FREIGHT_KINDS: KindId[] = ['brickworks', 'mine', 'quarry', 'lumber', 'oilwell', 'refinery'];
/** Les bâtiments qu'une gare de voyageurs voisine sert en leur amenant du monde */
export const PASSENGER_KINDS: KindId[] = ['spaceport'];
/** Cosmodrome servi par une gare de voyageurs : risque des expéditions spatiales et durée de leurs préparatifs */
export const SPACE_RAIL_RISK = 0.75, SPACE_RAIL_WORK = 0.25;

/** Cases vides entre deux bâtiments (0 : ils se touchent), en x comme en z, la plus grande des deux */
export function gap(a: Building, b: Building) {
  const sa = sizeOf(a), sb = sizeOf(b);
  const gx = Math.max(0, a.x - (b.x + sb), b.x - (a.x + sa)), gz = Math.max(0, a.z - (b.z + sb), b.z - (a.z + sa));
  return Math.max(gx, gz);
}

/**
 * Gares où s'arrête une ligne en service de ce genre (marchandises, ou voyageurs) ; une ligne dont le train ne roule pas
 * (voie impossible, arrêts démolis) ne compte pas
 */
export function servedStations(w: World, freight: boolean): Building[] {
  const ids = new Set<number>();
  for (const l of w.lines) {
    if (!!l.freight !== freight || l.ok === false || l.stops.length < 2) continue;
    for (const id of l.stops) ids.add(id);
  }
  const out: Building[] = [];
  for (const id of ids) { const b = w.buildings.get(id); if (b && isStation(b)) out.push(b); }
  return out;
}

/** La gare la plus proche, parmi celles-ci, à portée de ce bâtiment (null : aucune) */
export function nearest(b: Building, stations: Building[]): Building | null {
  let best: Building | null = null, d = Infinity;
  for (const s of stations) { const g = gap(b, s); if (g <= RAIL_REACH && g < d) { d = g; best = s; } }
  return best;
}

/** Ce qu'un bâtiment attend du rail : une gare de marchandises, une gare de voyageurs, ou rien */
export function railWant(kind: KindId): 'freight' | 'passenger' | null {
  return FREIGHT_KINDS.includes(kind) ? 'freight' : PASSENGER_KINDS.includes(kind) ? 'passenger' : null;
}

/** La gare qui sert ce bâtiment comme il l'attend (null : aucune, ou il n'attend rien du rail) */
export function railStation(w: World, b: Building, stations?: { freight: Building[]; passenger: Building[] }): Building | null {
  const want = railWant(b.kind);
  if (!want) return null;
  return nearest(b, stations ? stations[want] : servedStations(w, want === 'freight'));
}

/** Multiplicateur de production d'un bâtiment : 1,5 s'il est servi par une gare de marchandises, 1 sinon */
export function railBoost(w: World, b: Building, stations?: { freight: Building[]; passenger: Building[] }) {
  return railWant(b.kind) === 'freight' && railStation(w, b, stations) ? 1 + FREIGHT_BONUS : 1;
}

/** Les gares servies des deux genres, à calculer une fois pour tout le village */
export function allServed(w: World) { return { freight: servedStations(w, true), passenger: servedStations(w, false) }; }

/** Le village a-t-il un cosmodrome servi par une gare de voyageurs ? */
export function spaceRail(w: World) {
  const st = servedStations(w, false);
  for (const b of w.buildings.values()) if (PASSENGER_KINDS.includes(b.kind) && nearest(b, st)) return true;
  return false;
}
