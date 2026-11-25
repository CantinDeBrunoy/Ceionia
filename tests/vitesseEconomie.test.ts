import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ecoPace } from '../src/sim/economy';

/** Le continent des tests, toujours la même graine */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

describe('les ressources aux grandes vitesses', () => {
  it('×1 et ×2 comptent tout, ×4 compte trois quarts de jour, ×8 la moitié', () => {
    expect(ecoPace(1)).toBe(1);
    expect(ecoPace(2)).toBe(1);
    expect(ecoPace(4)).toBe(0.75);
    expect(ecoPace(8)).toBe(0.5);
    // en temps réel : ×4 donne trois fois ×1, ×8 quatre fois
    expect(4 * ecoPace(4)).toBe(3);
    expect(8 * ecoPace(8)).toBe(4);
    // une vitesse entre deux (ou la pause) reste sensée
    expect(ecoPace(3)).toBeCloseTo(2.5 / 3);
    expect(ecoPace(0)).toBe(1);
  });

  it('un bûcheron, sur une journée de jeu : tout à ×1, les trois quarts à ×4, la moitié à ×8', () => {
    const got: number[] = [];
    for (const speed of [1, 4, 8]) {
      const w = continent();
      let at: [number, number] | null = null;
      for (let z = 10; z < N - 10 && !at; z++) for (let x = 10; x < N - 10 && !at; x++) if (w.canPlace('lumber', x, z) === null) at = [x, z];
      w.place('lumber', at![0], at![1], 0, true, 3, false);
      const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
      ex.speed = speed;
      const w0 = w.wood;
      for (let t = 0; t < 100; t++) ex.update(1);
      got.push(w.wood - w0);
    }
    expect(got[0]).toBeCloseTo(22, 5);
    expect(got[1]).toBeCloseTo(22 * 0.75, 5);
    expect(got[2]).toBeCloseTo(22 * 0.5, 5);
  });
});
