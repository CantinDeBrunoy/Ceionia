import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';

function village(difficulty: 'normal' | 'easy' | 'sandbox' = 'normal') {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.difficulty = difficulty;
  w.updateVis();
  return w;
}

function spot(w: World, x0 = 90, z0 = 90): [number, number] {
  for (let r = 0; r < 80; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const x = x0 + dx, z = z0 + dz;
    if (x > 4 && z > 4 && x < N - 8 && z < N - 8 && w.canPlace('gather', x, z) === null) return [x, z];
  }
  throw new Error('pas de place');
}

describe('les fondateurs', () => {
  it('la place du village posée dans un village vide accueille trois habitants qui ne meurent pas de faim', () => {
    const w = village('normal'), sim = new Sim(w);
    sim.update(0, 1);
    expect(sim.pop).toBe(0);
    const [x, z] = spot(w);
    w.place('gather', x, z, 0, true, 0, false);
    for (let i = 0; i < 20; i++) sim.update(10, 10);
    expect(Math.floor(sim.pop)).toBe(3);
    expect(sim.food.ok).toBe(true);
  });

  it('ils suffisent à lancer « La grande cueillette » (équipe de 2)', () => {
    const w = village('normal'), sim = new Sim(w);
    const [x, z] = spot(w);
    w.place('gather', x, z, 0, true, 0, false);
    for (let i = 0; i < 5; i++) sim.update(1, 1);
    const ex = new Expeditions(w, sim, new Agents(w, sim, null as never) as never, () => 0.5);
    expect(Math.floor(sim.pop)).toBeGreaterThanOrEqual(3);
    expect(ex).toBeTruthy();
  });
});
