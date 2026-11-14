import { describe, it, expect, afterAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH, GEN } from '../src/world/continent';
import { ARCH_N } from '../src/world/archipelago';
import { mulberry32 } from '../src/core/rng';
import {
  conflictShown, seaLife, warshipKind, WEAPON, navalSites, waterPath, landingSite, battleSpot, nextDelay, pickSkirmish,
  SKIRMISH_MIN, SKIRMISH_MAX, DEEP, SHALLOW, resample,
} from '../src/sim/navalConflict';

const cache = new Map<number, World>();
function archipel(seed: number) {
  if (!cache.has(seed)) {
    setMapSize(ARCH_N);
    const w = new World();
    w.seed = seed;
    newWorld(w, CONTINENT, seed, GEN_ARCH);
    w.updateVis();
    cache.set(seed, w);
  }
  setMapSize(ARCH_N);
  return cache.get(seed)!;
}

describe('conflit vivant entre les îles rivales', () => {
  afterAll(() => setMapSize(192));

  it('les états : rien sans archipel, traité au Moderne si la guerre dure, le reste tel quel', () => {
    expect(conflictShown({ kind: 'war' }, false, 3)).toBeNull();
    expect(seaLife(conflictShown({ kind: 'war' }, false, 3))).toBeNull();
    expect(conflictShown({ kind: 'war' }, true, 3)).toEqual({ kind: 'war' });
    expect(conflictShown({ kind: 'war' }, true, 4)).toEqual({ kind: 'treaty' });
    expect(conflictShown({ kind: 'won', winner: 'asie' }, true, 5)).toEqual({ kind: 'won', winner: 'asie' });
    expect(seaLife({ kind: 'war' })).toBe('skirmish');
    expect(seaLife({ kind: 'peace' })).toBe('trade');
    expect(seaLife({ kind: 'treaty' })).toBe('trade');
    expect(seaLife({ kind: 'won', winner: 'orient' })).toBe('patrol');
  });

  it('les navires de guerre suivent l’âge et le peuple', () => {
    expect(warshipKind('orient', 1)).toBe('galley');
    expect(warshipKind('orient', 2)).toBe('dhow');
    expect(warshipKind('asie', 2)).toBe('junk');
    expect([warshipKind('asie', 3, 0), warshipKind('asie', 3, 1)]).toEqual(['frigate', 'ironclad']);
    expect(warshipKind('asie', 4)).toBe('launch');
    expect(warshipKind('orient', 5)).toBe('hover');
    expect(WEAPON.galley).toBe('arrows');
    expect(WEAPON.frigate).toBe('cannon');
  });

  it('une escarmouche toutes les 2 à 4 minutes de jeu, navale le plus souvent', () => {
    const r = mulberry32(3);
    let naval = 0;
    for (let i = 0; i < 300; i++) {
      const d = nextDelay(r);
      expect(d).toBeGreaterThanOrEqual(SKIRMISH_MIN);
      expect(d).toBeLessThanOrEqual(SKIRMISH_MAX);
      if (pickSkirmish(r) === 'naval') naval++;
    }
    expect(naval).toBeGreaterThan(150);
    expect(naval).toBeLessThan(250);
  });

  it('échantillonne une ligne brisée à pas régulier', () => {
    const p = resample([[0, 0], [2, 0], [2, 1]], 0.5);
    expect(p.length).toBe(7);
    expect(p[6]).toEqual([2, 1]);
  });

  it('sans archipel, aucune place de conflit', () => {
    setMapSize(192);
    const w = new World();
    w.seed = 11;
    newWorld(w, CONTINENT, 11, GEN);
    expect(navalSites(w)).toBeNull();
  });

  for (const seed of [11, 4242, 77, 89441]) {
    it(`graine ${seed} : mouillages, bataille et débarquements sur l’eau et dans la zone des peuples`, () => {
      const w = archipel(seed), s = navalSites(w)!;
      expect(s).not.toBeNull();
      const rnd = mulberry32(seed);
      for (const p of ['orient', 'asie'] as const) {
        const [x, z] = s.ports[p];
        expect(w.cellAvg(Math.floor(x), Math.floor(z))).toBeLessThan(DEEP);
        // relié au large, devant son village
        expect(Math.hypot(x - s.villages[p].x, z - s.villages[p].z)).toBeLessThan(60);
        expect(s.deep[Math.floor(z) * ARCH_N + Math.floor(x)]).toBe(1);
        // les deux mouillages se rejoignent par la mer (commerce, patrouilles)
        expect(waterPath(w, s.ports.orient, s.ports.asie)).not.toBeNull();
        // chaque escadre rejoint la bataille par la mer
        const to = battleSpot(w, s, rnd), path = waterPath(w, s.ports[p], to)!;
        expect(path).not.toBeNull();
        expect(path.length).toBeGreaterThan(4);
        for (const [px, pz] of path) expect(w.cellAvg(Math.floor(px), Math.floor(pz))).toBeLessThan(DEEP);
        // un débarquement de l'autre peuple : la plage près du village, la barque atteignable depuis son mouillage
        const other = p === 'orient' ? 'asie' : 'orient', l = landingSite(w, s, p, rnd)!;
        expect(l).not.toBeNull();
        const v = s.villages[p];
        expect(Math.hypot(l.beach[0] - v.x, l.beach[1] - v.z)).toBeLessThan(v.r + 31);
        expect(Math.hypot(l.rally[0] - v.x, l.rally[1] - v.z)).toBeLessThan(v.r);
        expect(waterPath(w, s.ports[other], l.boat, SHALLOW)).not.toBeNull();
      }
    });
  }
});
