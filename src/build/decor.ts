import { World } from '../world/world';
import { KindId, isLinear } from './catalog';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../render/hellBase';

/**
 * Les décorations libres (rayon Décorations) : haies, clôtures, parterres, bancs, statues, pavés, fontaines. Elles se posent
 * comme un bâtiment d'une case, sans porte ni chemin ; haies et clôtures se raccordent à leurs voisines de même genre
 */

/** Le côté opposé de chaque côté (N ↔ S, E ↔ O) */
const OPP: Record<number, number> = { [WALL_N]: WALL_S, [WALL_S]: WALL_N, [WALL_E]: WALL_W, [WALL_W]: WALL_E };

/**
 * Les côtés par où une haie (ou une clôture) rejoint ses voisines de même genre (WALL_N, E, S, W : nord = -z) ; seule, elle
 * court dans le sens qu'on lui a donné (rotation 0 : d'est en ouest) ; au bout d'une ligne, elle traverse toute sa case
 */
export function linearMask(w: World, b: { kind: KindId; x: number; z: number; rot: number }): number {
  if (!isLinear(b.kind)) return 0;
  const same = (dx: number, dz: number) => w.buildingAt(b.x + dx, b.z + dz)?.kind === b.kind;
  let m = (same(0, -1) ? WALL_N : 0) | (same(1, 0) ? WALL_E : 0) | (same(0, 1) ? WALL_S : 0) | (same(-1, 0) ? WALL_W : 0);
  if (!m) return b.rot % 2 ? WALL_N | WALL_S : WALL_E | WALL_W;
  if (OPP[m] !== undefined) m |= OPP[m];
  return m;
}
