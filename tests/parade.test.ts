import { describe, it, expect } from 'vitest';
import { World, N, setMapSize, MOUNTAIN_H } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Parade } from '../src/render/parade';

/** Une droite de cases de terre plate : de quoi tracer une route de quelques dizaines de cases */
function strip(w: World, len: number) {
  for (let z = 12; z < N - 12; z++)
    for (let x = 12; x < N - 12 - len; x++) {
      let ok = true;
      for (let i = 0; i <= len && ok; i++) for (let dz = -1; dz <= 1 && ok; dz++) {
        const cx = x + i, cz = z + dz;
        ok = w.cellAvg(cx, cz) > 0.3 && w.veg[w.ci(cx, cz)] !== 1 && w.cellAvg(cx, cz) < MOUNTAIN_H - 0.4 && !w.decor[w.ci(cx, cz)] && !w.occ[w.ci(cx, cz)] && !w.isWet(cx, cz);
      }
      if (ok) return [x, z];
    }
  throw new Error('pas de terrain plat');
}

describe('la parade du grand départ', () => {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();

  it('range la foule de part et d’autre de la route, sans toucher au cœur du village ni au pas de tir', () => {
    const [x, z] = strip(w, 18);
    const cells: [number, number][] = Array.from({ length: 19 }, (_, i) => [x + i + 0.5, z + 0.5]);
    const base: [number, number] = [x + 0.5, z + 0.5], dest: [number, number] = [x + 18.5, z + 0.5];
    const p = new Parade(w);
    const spots = p.start(cells, base, dest, 5, 20);
    expect(spots.length).toBe(20);
    // des deux côtés de la route
    expect(spots.some((s) => s.z < z + 0.5)).toBe(true);
    expect(spots.some((s) => s.z > z + 0.5)).toBe(true);
    for (const s of spots) {
      expect(Math.hypot(s.x - base[0], s.z - base[1])).toBeGreaterThanOrEqual(2.4);
      expect(Math.hypot(s.x - dest[0], s.z - dest[1])).toBeGreaterThanOrEqual(4);
      // tournés vers la route
      expect(Math.cos(s.face) * (z + 0.5 - s.z)).toBeGreaterThan(-0.01);
    }
    expect(p.length).toBeCloseTo(18, 0);
    // quelques secondes de parade : tout s'anime, puis tout se démonte
    for (let i = 0; i < 200; i++) p.update(0.05, [x + 6 + i * 0.05, z + 0.5], i > 100 ? 1 : 0.4);
    expect(p.active).toBe(true);
    p.stop();
    expect(p.active).toBe(false);
    expect(p.group.children.length).toBe(2);
  });

  it('une route trop courte ne plante pas : la foule n’y trouve simplement pas de place', () => {
    const [x, z] = strip(w, 8);
    const p = new Parade(w);
    const spots = p.start([[x + 0.5, z + 0.5], [x + 5.5, z + 0.5]], [x + 0.5, z + 0.5], [x + 5.5, z + 0.5], 5, 20);
    expect(spots.length).toBeLessThanOrEqual(20);
    p.update(0.05, null, 0.5);
    p.stop();
  });
});
