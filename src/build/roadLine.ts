import type { World } from '../world/world';

/**
 * Route en mode « Ligne » : les cases d'un glissé, de la case précédente du trait jusqu'à celle du pointeur. Deux règles
 * (retour de l'auteur, 19 nov. 2026 : « bizarre la route pourquoi ? ») :
 * - un trait ne remplit jamais un carré de 2 × 2 cases avec ses propres cases. Une main qui tremble en posait à la suite, et
 *   le dessin fait de chaque carré une place pavée : la route devenait une bande large et bosselée ;
 * - un pas en diagonale passe par une case de côté (celle qui reste au plus près du trait). Deux cases qui ne se touchent que
 *   par un coin se dessinaient en deux morceaux, la route coupée (les habitants, eux, passaient).
 * Un carré voulu se fait toujours, en deux traits côte à côte. Rend le nombre de cases posées
 */
export function strokeRoad(w: World, from: { x: number; z: number }, to: { x: number; z: number }, stroke: Set<number>): number {
  let n = 0;
  const road = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1;
  /** la case fermerait un carré de 2 × 2 cases de route dont deux autres au moins sont de ce trait (un aller-retour) */
  const square = (x: number, z: number) => {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const q = [[x + sx, z], [x, z + sz], [x + sx, z + sz]];
      if (q.every(([a, b]) => road(a, b)) && q.filter(([a, b]) => stroke.has(w.ci(a, b))).length >= 2) return true;
    }
    return false;
  };
  const lay = (x: number, z: number) => {
    if (!w.inCells(x, z) || road(x, z) || square(x, z)) return false;
    if (!w.setRoad(x, z, true)) return false;
    stroke.add(w.ci(x, z));
    n++;
    return true;
  };
  let x0 = from.x, z0 = from.z;
  const dx = Math.abs(to.x - x0), dz = Math.abs(to.z - z0), sx = x0 < to.x ? 1 : -1, sz = z0 < to.z ? 1 : -1;
  let err = dx - dz;
  lay(x0, z0);
  for (let i = 0; i < 200 && (x0 !== to.x || z0 !== to.z); i++) {
    const e2 = 2 * err, mx = e2 > -dz, mz = e2 < dx;
    if (mx && mz) {
      // un pas en diagonale : d'abord la case de côté la plus proche du trait (l'autre si elle ne se pose pas) ; rien à
      // ajouter si l'une des deux est déjà une route
      const errX = Math.abs(err - dz), errZ = Math.abs(err + dx);
      const side: [number, number][] = errX <= errZ ? [[x0 + sx, z0], [x0, z0 + sz]] : [[x0, z0 + sz], [x0 + sx, z0]];
      if (!side.some(([a, b]) => road(a, b))) side.some(([a, b]) => lay(a, b));
    }
    if (mx) { err -= dz; x0 += sx; }
    if (mz) { err += dx; z0 += sz; }
    lay(x0, z0);
  }
  return n;
}
