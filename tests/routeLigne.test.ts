import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { strokeRoad } from '../src/build/roadLine';

/**
 * La route en mode « Ligne » : un trait à main levée ne fait plus de bande bosselée (des carrés de 2 × 2 cases, dessinés en
 * places pavées), et un pas en diagonale ne coupe plus le chemin en deux morceaux (retour de l'auteur, 19 nov. 2026)
 */

beforeAll(() => setMapSize(192));

/** Un monde plat et nu : toute case accepte une route */
const flat = () => {
  const w = new World();
  w.heights.fill(0.5);
  return w;
};
const roads = (w: World) => { const out: [number, number][] = []; for (let k = 0; k < N * N; k++) if (w.road[k]) out.push([k % N, Math.floor(k / N)]); return out; };
const squares = (w: World) => {
  let n = 0;
  for (let z = 0; z < N - 1; z++) for (let x = 0; x < N - 1; x++) if (w.road[w.ci(x, z)] && w.road[w.ci(x + 1, z)] && w.road[w.ci(x, z + 1)] && w.road[w.ci(x + 1, z + 1)]) n++;
  return n;
};
/** chaque case du trait touche la suivante par un côté (jamais par un coin seulement) */
const sideLinked = (w: World) => roads(w).every(([x, z]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.road[w.ci(x + dx, z + dz)]));

describe('route en mode « Ligne »', () => {
  it('une diagonale passe par des cases de côté : le chemin se touche partout par un côté', () => {
    const w = flat(), s = new Set<number>();
    strokeRoad(w, { x: 50, z: 50 }, { x: 60, z: 60 }, s);
    expect(w.road[w.ci(50, 50)]).toBe(1);
    expect(w.road[w.ci(60, 60)]).toBe(1);
    expect(sideLinked(w)).toBe(true);
    expect(squares(w)).toBe(0);
    // un escalier : une case de côté par pas
    expect(roads(w).length).toBe(21);
  });

  it('une main qui tremble ne remplit pas de carré de 2 × 2 cases', () => {
    const w = flat(), s = new Set<number>();
    // le pointeur va et vient autour d'une diagonale
    const path = [[50, 50], [51, 50], [51, 51], [50, 51], [51, 52], [52, 52], [52, 51], [53, 53], [52, 53], [54, 54], [54, 53], [55, 55]];
    let prev = { x: path[0][0], z: path[0][1] };
    for (const [x, z] of path) { strokeRoad(w, prev, { x, z }, s); prev = { x, z }; }
    expect(squares(w)).toBe(0);
    expect(w.road[w.ci(55, 55)]).toBe(1);
  });

  it('un carré voulu se fait toujours, en plusieurs traits ; un trait droit ne change pas', () => {
    const w = flat();
    strokeRoad(w, { x: 50, z: 50 }, { x: 51, z: 50 }, new Set());
    strokeRoad(w, { x: 50, z: 51 }, { x: 51, z: 51 }, new Set());
    expect(squares(w)).toBe(1);
    const v = flat();
    expect(strokeRoad(v, { x: 40, z: 40 }, { x: 40, z: 49 }, new Set())).toBe(10);
  });
});
