import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize, VEG_CAVE, VEG_FISSURE, BIOME_DESERT, BIOME_MARSH, BIOME_TAIGA, BIOME_TROPICAL, BIOME_TEMPERATE } from '../src/world/world';
import { speciesIn, bearDens, ZONES } from '../src/render/fauna';

describe('faune : rattachement au décor', () => {
  beforeAll(() => setMapSize(96));

  it('chaque biome a ses espèces', () => {
    expect(speciesIn(BIOME_DESERT)).toEqual(expect.arrayContaining(['lizard', 'camel']));
    expect(speciesIn(BIOME_MARSH)).toEqual(expect.arrayContaining(['croc', 'turtle']));
    expect(speciesIn(BIOME_TROPICAL)).toEqual(expect.arrayContaining(['elephant', 'giraffe']));
    expect(speciesIn(BIOME_TAIGA)).toContain('moose');
    expect(speciesIn(BIOME_TEMPERATE)).toContain('wolf');
    // pas de chameau en taïga, pas d'éléphant au désert, des crabes partout
    expect(speciesIn(BIOME_TAIGA)).not.toContain('camel');
    expect(speciesIn(BIOME_DESERT)).not.toContain('elephant');
    for (const b of [0, 1, 2, 3, 4]) expect(speciesIn(b)).toContain('crab');
  });

  it('chaque zone est rattachée à un élément du décor', () => {
    for (const z of ZONES) { expect(z.anchors.length).toBeGreaterThan(0); expect(z.max).toBeGreaterThan(0); }
  });

  it('les ours vivent à l’entrée des grottes et au bout des failles', () => {
    const w = new World();
    w.heights.fill(1);
    const cave = w.ci(40, 40), fiss = w.ci(70, 60);
    w.veg[cave] = VEG_CAVE;
    w.veg[fiss] = VEG_FISSURE;
    w.computeDecor();
    // toutes les grottes ne sont pas habitées : on en pose assez pour en trouver
    for (let i = 0; i < 12; i++) { w.veg[w.ci(10 + i * 6, 20)] = VEG_CAVE; }
    w.computeDecor();
    const dens = bearDens(w);
    expect(dens.length).toBeGreaterThan(0);
    expect(dens.length).toBeLessThanOrEqual(5);
    const holes: [number, number][] = [];
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_CAVE || w.veg[k] === VEG_FISSURE) holes.push([k % N + 0.5, Math.floor(k / N) + 0.5]);
    for (const d of dens) {
      // sur une case libre, jamais dans le décor, et près d'une entrée
      expect(w.decor[w.ci(Math.floor(d.x), Math.floor(d.z))]).toBe(0);
      expect(Math.min(...holes.map(([x, z]) => Math.hypot(x - d.x, z - d.z)))).toBeLessThan(8);
    }
  });

  it('sans grotte, pas d’ours', () => {
    const w = new World();
    w.heights.fill(1);
    expect(bearDens(w)).toEqual([]);
  });
});
