import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize, ISLET_MIN, BIOME_TROPICAL, BIOME_DESERT, BIOME_TEMPERATE } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';

/**
 * Les palmiers suivent le biome tropical : une petite tache tropicale en plein pays tempéré faisait pousser des palmiers sans
 * neige au milieu d'une forêt enneigée. Plus de taches de climat chaud isolées (sauf l'oasis au désert, et les îles)
 */
describe('biomes : pas d’îlot tropical ni désertique en pays tempéré', () => {
  beforeAll(() => setMapSize(192));

  /** Taches tropicales ou désertiques de la terre ferme : biome, taille, voisins par biome */
  const patches = (w: World) => {
    const seen = new Uint8Array(N * N), out: { b: number; n: number; nb: number[] }[] = [];
    const land = (k: number) => !w.isWaterCell(k % N, Math.floor(k / N));
    for (let k0 = 0; k0 < N * N; k0++) {
      const b = w.biome[k0];
      if (seen[k0] || (b !== BIOME_TROPICAL && b !== BIOME_DESERT) || !land(k0)) continue;
      const cells = [k0], nb = [0, 0, 0, 0, 0];
      seen[k0] = 1;
      for (let i = 0; i < cells.length; i++) {
        const cx = cells[i] % N, cz = Math.floor(cells[i] / N);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!w.inCells(cx + dx, cz + dz)) continue;
          const j = w.ci(cx + dx, cz + dz);
          if (!land(j)) continue;
          if (w.biome[j] === b) { if (!seen[j]) { seen[j] = 1; cells.push(j); } } else nb[w.biome[j]]++;
        }
      }
      out.push({ b, n: cells.length, nb });
    }
    return out;
  };

  for (const seed of [2026, 777, 3472, 49443]) {
    it(`graine ${seed} : chaque petite tache chaude est une oasis ou une île`, { timeout: 30000 }, () => {
      const w = new World();
      newWorld(w, 3, seed, GEN);
      for (const p of patches(w)) {
        if (p.n >= ISLET_MIN || p.nb.every((c) => c === 0)) continue;
        // seule exception : la tache tropicale au désert (une oasis)
        expect(p.b, `tache ${p.b} de ${p.n} cases, voisins ${p.nb}`).toBe(BIOME_TROPICAL);
        expect(p.nb.indexOf(Math.max(...p.nb)), `tache tropicale de ${p.n} cases, voisins ${p.nb}`).toBe(BIOME_DESERT);
      }
    });
  }

  it('un îlot effacé ne revient pas après une retouche du relief, et le pinceau de biome passe toujours', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const before = w.biome.slice();
    w.computeBiomes([0, 0, N - 1, N - 1]);
    expect(Array.from(w.biome).every((b, k) => b === before[k])).toBe(true);
    // une case peinte en tropical au milieu du tempéré reste tropicale
    let k = 0;
    while (w.biome[k] !== BIOME_TEMPERATE || w.isWaterCell(k % N, Math.floor(k / N))) k++;
    w.paintBiome(k % N, Math.floor(k / N), BIOME_TROPICAL);
    w.computeBiomes();
    expect(w.biome[k]).toBe(BIOME_TROPICAL);
  });
});
