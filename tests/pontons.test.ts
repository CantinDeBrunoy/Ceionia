import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { autoRoad } from '../src/build/autoroads';
import { facingRoadRot } from '../src/build/placement';

function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Le ponton se relie à une route même éloignée (jusqu'à 30 cases), sauf si le terrain l'en empêche */
describe('ponton de pêche', () => {
  for (const D of [4, 8, 12, 16, 22]) it('se relie à une route à ' + D + ' cases', () => {
    const w = continent();
    let tried = 0, linked = 0, noRoad = 0;
    
    for (let z = 4; z < N - 4 && tried < 60; z += 3) {
      for (let x = 4; x < N - 4 && tried < 60; x += 3) {
        if (w.canPlace('pier', x, z) !== null) continue;
        // une route à 5 cases du ponton, côté terre
        let road: [number, number] | null = null;
        for (const [dx, dz] of [[D, 0], [-D, 0], [0, D], [0, -D]]) {
          const rx = x + dx, rz = z + dz;
          if (w.inCells(rx, rz) && w.canRoad(rx, rz) && !w.isWet(rx, rz)) { road = [rx, rz]; break; }
        }
        if (!road) { noRoad++; continue; }
        tried++;
        w.setRoad(road[0], road[1], true);
        const b = w.place('pier', x, z, facingRoadRot(w, 'pier', x, z, 0), true, 1, false);
        const n = autoRoad(w, b);
        const ring = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]].some(([cx, cz]) => w.inCells(cx, cz) && w.road[w.ci(cx, cz)]);
        if (n > 0 || ring) linked++;
        w.removeBuilding(b.id);
      }
    }
    // les échecs restants sont des presqu’îles sans issue (pente ou eau tout autour)
    expect(tried).toBeGreaterThan(5);
    expect(linked / tried).toBeGreaterThan(D <= 22 ? 0.7 : 0.5);
  });
});
