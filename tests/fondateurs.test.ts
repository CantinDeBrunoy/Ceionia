import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { MISSIONS } from '../src/sim/missions';
import { mulberry32 } from '../src/core/rng';

function village(difficulty: 'normal' | 'easy' | 'sandbox' = 'normal') {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.difficulty = difficulty;
  w.updateVis();
  return w;
}

function place(w: World) {
  for (let r = 0; r < 80; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const x = 90 + dx, z = 90 + dz;
    if (x > 4 && z > 4 && x < N - 8 && z < N - 8 && w.canPlace('gather', x, z) === null) { w.place('gather', x, z, 0, true, 0, false); return; }
  }
  throw new Error('pas de place');
}

describe('les fondateurs', () => {
  it('la place du village posée dans un village vide accueille quatre habitants qui ne meurent pas de faim', () => {
    const w = village('normal'), sim = new Sim(w);
    sim.update(0, 1);
    expect(sim.pop).toBe(0);
    place(w);
    for (let i = 0; i < 20; i++) sim.update(10, 10);
    expect(Math.floor(sim.pop)).toBe(4);
    expect(sim.food.ok).toBe(true);
    expect(sim.water.ok).toBe(true);
  });

  it('ils suffisent à lancer « La grande cueillette » (équipe de 2), sans maison ni tutoriel', () => {
    const w = village('normal'), sim = new Sim(w);
    place(w);
    for (let i = 0; i < 5; i++) sim.update(1, 1);
    const agents = new Agents(w);
    for (let i = 0; i < 40; i++) agents.update(0.1, 10, 0, false, 40, 0);
    const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
    ex.pop = () => sim.pop;
    const m = MISSIONS.find((x) => x.id === 'berries')!;
    expect(ex.why(m, m.choices[0])).toBeNull();
  });

  it('sans la place du village, personne n’arrive', () => {
    const w = village('normal'), sim = new Sim(w);
    for (let i = 0; i < 5; i++) sim.update(10, 10);
    expect(sim.pop).toBe(0);
  });
});
