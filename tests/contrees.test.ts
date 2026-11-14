import { describe, it, expect } from 'vitest';
import { World, N, setMapSize, SNOW_LINE, BIOME_DESERT, VEG_VOLCANO } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN, GEN_SLOTS, continentPlan, riverCourse } from '../src/world/continent';

/** Une nouvelle partie (version 5) */
function partie(seed: number) {
  setMapSize(192);
  const w = new World();
  w.seed = seed;
  newWorld(w, CONTINENT, seed, GEN_SLOTS);
  w.updateVis();
  return w;
}

/** Étendues d'eau reliées au bord de la carte (la mer) */
function sea(w: World) {
  const out = new Uint8Array(N * N), q: number[] = [];
  for (let k = 0; k < N * N; k++) {
    const x = k % N, z = Math.floor(k / N);
    if ((x === 0 || z === 0 || x === N - 1 || z === N - 1) && w.isWaterCell(x, z)) { out[k] = 1; q.push(k); }
  }
  while (q.length) {
    const k = q.pop()!, x = k % N, z = Math.floor(k / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, zz = z + dz, j = zz * N + xx;
      if (w.inCells(xx, zz) && !out[j] && w.isWaterCell(xx, zz)) { out[j] = 1; q.push(j); }
    }
  }
  return out;
}

describe('version 5 : les contrées changent de place', () => {
  it('c’est la version des nouvelles parties, et chaque graine trouve un plan (jamais celui de secours)', () => {
    expect(GEN).toBe(GEN_SLOTS);
    for (let s = 1; s <= 120; s++) expect(continentPlan(s, GEN_SLOTS).coast.capes.length).toBeGreaterThan(0);
  });

  it('les contrées ne sont pas toujours au même endroit', () => {
    const at = (q: { u: number; v: number }) => `${Math.round(q.u * 5)},${Math.round(q.v * 5)}`;
    const lakes = new Set<string>(), mesas = new Set<string>(), plateaus = new Set<string>(), volcano = new Set<string>(), all = new Set<string>();
    for (let s = 1; s <= 60; s++) {
      const p = continentPlan(s, GEN_SLOTS);
      lakes.add(at(p.lake)); mesas.add(at(p.mesas)); plateaus.add(at(p.plateaus)); volcano.add(at(p.volcano));
      all.add([p.lake, p.mesas, p.plateaus, p.volcano, p.mountains].map(at).join(' '));
    }
    expect(lakes.size).toBeGreaterThanOrEqual(4);
    expect(mesas.size).toBeGreaterThanOrEqual(3);
    expect(plateaus.size).toBeGreaterThanOrEqual(3);
    expect(volcano.size).toBeGreaterThanOrEqual(2);
    expect(all.size).toBeGreaterThanOrEqual(25);
  });

  it('chaque carte garde toutes ses contrées : neige, désert et tables, lac fermé et son îlot, île au volcan, rivière jusqu’à la mer, cinq biomes', () => {
    for (const seed of [11, 2026, 4242, 777]) {
      const w = partie(seed), wet = sea(w), biomes = [0, 0, 0, 0, 0];
      let snow = 0, desert = 0, tables = 0, volcano = -1;
      for (let k = 0; k < N * N; k++) {
        const x = k % N, z = Math.floor(k / N), a = w.cellAvg(x, z);
        if (w.veg[k] === VEG_VOLCANO) volcano = k;
        if (a < 0.08) continue;
        biomes[w.biome[k]]++;
        if (a > SNOW_LINE[0]) snow++;
        if (w.biome[k] === BIOME_DESERT) { desert++; if (a > 2.2) tables++; }
      }
      expect(snow).toBeGreaterThan(150);
      expect(desert).toBeGreaterThan(1000);
      expect(tables).toBeGreaterThan(100);
      expect(volcano).toBeGreaterThanOrEqual(0);
      // un lac fermé : de l'eau qui ne touche pas la mer, sur une grande étendue
      let lake = 0;
      for (let k = 0; k < N * N; k++) if (w.isWaterCell(k % N, Math.floor(k / N)) && !wet[k]) lake++;
      expect(lake).toBeGreaterThan(300);
      // la rivière : son embouchure est dans la mer
      const course = riverCourse(GEN_SLOTS, seed, N), end = course[course.length - 6];
      const ex = Math.min(N - 1, Math.floor(end[0])), ez = Math.min(N - 1, Math.floor(end[1]));
      let mouth = false;
      for (let dz = -3; dz <= 3 && !mouth; dz++) for (let dx = -3; dx <= 3; dx++) if (w.inCells(ex + dx, ez + dz) && wet[(ez + dz) * N + ex + dx]) { mouth = true; break; }
      expect(mouth).toBe(true);
      const land = biomes.reduce((a, b) => a + b);
      for (const b of biomes) expect(b / land).toBeGreaterThan(0.01);
    }
  }, 60000);
});
