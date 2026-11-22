import { describe, it, expect, beforeEach } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS, readExpState } from '../src/sim/missions';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { woodsAround } from '../src/sim/expeditions';
import { VEG_FOREST } from '../src/world/world';

/**
 * Les arbres cachaient l'équipe : beaucoup d'expéditions se jouaient en forêt (notes de joueurs du 22 nov. 2026). Hors des
 * expéditions de la forêt, le lieu choisi est dégagé (`findDest` compte les arbres autour, `woodsAround`)
 */
function village(seed = 5) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  let at: number[] | null = null;
  for (let z = 10; z < N - 10 && !at; z++)
    for (let x = 10; x < N - 10 && !at; x++)
      if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && ok(x, z) && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) at = [x, z];
  const [x, z] = at!;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 0, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, 0, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
  ex.pop = () => 60;
  return { w, agents, ex };
}

/** Le lieu où part l'équipe de ce choix, puis l'équipe congédiée (pour en envoyer une autre) */
function destOf(seed: number, id: string, ci: number) {
  const { w, ex } = village(seed), m = MISSIONS.find((x) => x.id === id)!;
  const a = ex.start(m, ci, m.age)!;
  expect(a, `${id}/${ci}`).toBeTruthy();
  return { w, a };
}

describe('des lieux d’expédition dégagés', () => {
  it('woodsAround compte les cases de forêt autour d’un point', () => {
    setMapSize(192);
    const w = new World();
    for (let z = 10; z < 14; z++) for (let x = 10; x < 13; x++) w.veg[w.ci(x, z)] = VEG_FOREST;
    expect(woodsAround(w, 11.5, 11.5)).toBe(12);
    expect(woodsAround(w, 40, 40)).toBe(0);
    expect(woodsAround(w, 11, 11, 0)).toBe(1);
  });

  it('hors forêt, peu d’arbres autour de l’équipe ; en forêt, des arbres', () => {
    for (const seed of [1, 2]) {
      // (avant : 23 à 40 cases boisées sur 81 autour des lieux de plaine, autant qu'en forêt)
      for (const [id, ci] of [['herd', 0], ['motorcar', 0], ['mammoth', 0]] as const) {
        const { w, a } = destOf(seed, id, ci);
        expect(woodsAround(w, a.dest[0], a.dest[1]), `${id}/${ci}`).toBeLessThanOrEqual(18);
      }
      const { w, a } = destOf(seed, 'berries', 0);
      expect(a.site).toBe('forest');
      expect(woodsAround(w, a.dest[0], a.dest[1])).toBeGreaterThanOrEqual(20);
    }
  });
});
