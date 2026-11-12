import { describe, it, expect } from 'vitest';
import { World, N, setMapSize, VEG_ROCKS } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN, GEN_PLAN, continentPlan, rockyBed } from '../src/world/continent';

/** Cases du lit de cailloux qui sont un haut-fond (là où le décor pose ses rochers) */
function shoals(w: World) {
  const out: number[] = [];
  for (let k = 0; k < N * N; k++) {
    const a = w.cellAvg(k % N, Math.floor(k / N));
    if (w.bed[k] > 128 && a > -0.6 && a < -0.05) out.push(k);
  }
  return out;
}

describe('lit de cailloux de l’amont de la rivière', () => {
  setMapSize(192);
  const make = (seed: number, gen: number) => { const w = new World(); newWorld(w, 3, seed, gen); w.updateVis(); return w; };

  it('seulement sur l’amont, à partir de la version 3', () => {
    const p = continentPlan(4242, GEN);
    expect(p.bed!.end).toBeGreaterThanOrEqual(0.3);
    expect(p.bed!.end).toBeLessThanOrEqual(0.4);
    expect(rockyBed(p, 0.1)).toBe(1);
    expect(rockyBed(p, 0.6)).toBe(0);
    expect(continentPlan(4242, GEN_PLAN).bed).toBeUndefined();
    expect(make(2026, GEN_PLAN).bed.every((b) => b === 0)).toBe(true);
  });

  it('un haut-fond qui reste de l’eau : on n’y bâtit pas, une route le passe sur un pont', () => {
    for (const seed of [2026, 17, 4242]) {
      const w = make(seed, GEN), s = shoals(w);
      expect(s.length).toBeGreaterThan(30);
      for (const k of s.slice(0, 20)) {
        const x = k % N, z = Math.floor(k / N);
        expect(w.isWet(x, z)).toBe(true);
        expect(w.canPlace('house', x, z)).not.toBeNull();
      }
      // des rives en rocaille, mais pas partout
      let banks = 0, rocks = 0;
      for (let k = 0; k < N * N; k++) if (w.bed[k] > 128 && w.cellAvg(k % N, Math.floor(k / N)) > 0.12) { banks++; if (w.veg[k] === VEG_ROCKS) rocks++; }
      expect(rocks).toBeGreaterThan(0);
      expect(rocks).toBeLessThan(banks * 0.5);
    }
  });

  it('même graine, même lit ; une partie relue (comme `main.ts` : carte et graine, puis `fromJSON`) garde son lit', () => {
    const a = make(4242, GEN), b = make(4242, GEN);
    expect(a.bed).toEqual(b.bed);
    const back = new World();
    back.mapId = 3; back.seed = 4242;
    back.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
    back.updateVis();
    expect(back.bed).toEqual(a.bed);
    expect(shoals(back).length).toBe(shoals(a).length);
  });
});
