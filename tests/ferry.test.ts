import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { ferryRoute } from '../src/world/ferry';

describe('la galère de l’île du portail', () => {
  beforeAll(() => setMapSize(192));
  const seeds = [1, 2, 3, 7, 42, 99, 123, 555, 2026, 1184, 2920];

  it('part d’une rive du continent, traverse tout droit sur l’eau et touche la plage de l’île', () => {
    let found = 0;
    for (const seed of seeds) {
      const w = new World();
      newWorld(w, 3, seed, GEN);
      const r = ferryRoute(w);
      if (!r) continue;
      found++;
      const at = ([x, z]: [number, number]) => w.cellAvg(Math.floor(x), Math.floor(z));
      // la rive : de la terre, hors de l'île ; la plage : la terre de l'île
      expect(at(r.shore), `graine ${seed}`).toBeGreaterThan(0.05);
      expect(w.onPortalIsland(Math.floor(r.shore[0]), Math.floor(r.shore[1]))).toBe(false);
      expect(at(r.beach), `graine ${seed}`).toBeGreaterThan(0.05);
      expect(w.onPortalIsland(Math.floor(r.beach[0]), Math.floor(r.beach[1]))).toBe(true);
      // les deux mouillages sont sur l'eau, et rien que de l'eau entre eux
      expect(at(r.from)).toBeLessThan(0);
      expect(at(r.to)).toBeLessThan(0);
      for (let t = 0; t <= 1; t += 0.02) expect(at([r.from[0] + (r.to[0] - r.from[0]) * t, r.from[1] + (r.to[1] - r.from[1]) * t]), `graine ${seed}`).toBeLessThan(0.05);
      // la plage est tout près du mouillage de l'île
      expect(Math.hypot(r.beach[0] - r.to[0], r.beach[1] - r.to[1])).toBeLessThan(5);
      // une traversée courte : à peine plus longue que le bras de mer, depuis la terre la plus proche de l'île
      const p = w.portal!;
      let near = Infinity;
      for (let z = 0; z < w.n; z++) for (let x = 0; x < w.n; x++) if (!w.onPortalIsland(x, z) && w.cellAvg(x, z) > 0.1) near = Math.min(near, Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z));
      expect(Math.hypot(r.shore[0] - p.x, r.shore[1] - p.z), `graine ${seed}`).toBeLessThan(near + 15);
    }
    // (la plupart des cartes ont leur traversée)
    expect(found).toBeGreaterThanOrEqual(seeds.length - 2);
  });

  it('sans île, pas de traversée', () => {
    const w = new World();
    newWorld(w, 3, 5, GEN);
    w.portal = null;
    expect(ferryRoute(w)).toBeNull();
  });
});
