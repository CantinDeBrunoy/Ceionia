import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN, GEN_FIXED, GEN_PLAN, riverCourse } from '../src/world/continent';
import { computeFlow, riverDirs } from '../src/world/flow';

describe('le courant des rivières', () => {
  it('va partout de la montagne à la mer sur le tracé de la rivière, quelle que soit la version de la carte', () => {
    for (const gen of [GEN, GEN_PLAN, GEN_FIXED]) for (const seed of [2026, 42, 77, 123]) {
      setMapSize(192);
      const w = new World();
      newWorld(w, 3, seed, gen);
      w.updateVis();
      // le tracé descend : sa source est plus haute que son embouchure
      const pts = riverCourse(gen, seed, N), [sx, sz] = pts[0], [ex, ez] = pts[pts.length - 1];
      expect(w.hAt(Math.min(N, Math.max(0, sx)), Math.min(N, Math.max(0, sz)))).toBeGreaterThan(w.hAt(Math.min(N, Math.max(0, ex)), Math.min(N, Math.max(0, ez))));
      const data = new Uint8Array(N * N * 4), dirs = riverDirs(w);
      computeFlow(w, data);
      let n = 0, down = 0;
      for (let k = 0; k < N * N; k++) {
        if (!data[k * 4 + 3] || data[k * 4 + 2] < 20) continue;
        const cx = dirs[k * 2], cz = dirs[k * 2 + 1];
        if (!cx && !cz) continue;
        const vx = data[k * 4] / 127.5 - 1, vz = data[k * 4 + 1] / 127.5 - 1;
        n++;
        if (vx * cx + vz * cz > 0) down++;
      }
      expect(n, `version ${gen}, graine ${seed}`).toBeGreaterThan(80);
      expect(down / n, `version ${gen}, graine ${seed}`).toBeGreaterThan(0.97);
    }
  });
});
