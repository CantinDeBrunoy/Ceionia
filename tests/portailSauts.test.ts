import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS } from '../src/sim/missions';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ExpeditionView } from '../src/render/expeditionView';
import { writeSync } from 'fs';
const log = (s: string) => writeSync(1, s + '\n');
/**
 * « Le portail de l'autre rive » : l'équipe ne se téléporte plus. Elle montait à bord, débarquait sur l'île et redescendait
 * sur la berge d'un bond (jusqu'à une case d'une image à l'autre), et loin de l'île la galère traversait en quelques secondes
 */
const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
function village(seed: number) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, seed);
  w.updateVis();
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  let at: [number, number] | null = null;
  for (let z = 10; z < N - 10 && !at; z++)
    for (let x = 10; x < N - 10 && !at; x++)
      if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) at = [x, z];
  const [x, z] = at!;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 1, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, 1, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
  ex.pop = () => 60;
  return { w, agents, ex };
}

/** Le plus grand pas d'un membre visible entre deux images (0,05 s), tout le long de l'expédition */
function maxStep(seed: number, ci: number) {
  const m = MISSIONS.find((x) => x.id === 'portal')!, v = village(seed), a = v.ex.start(m, ci, 1)!;
  expect(a).not.toBeNull();
  const view = new ExpeditionView(v.w, v.agents, v.ex), prev = new Map<number, [number, number, boolean]>();
  let worst = 0;
  for (let i = 0; i < 40000 && v.ex.active.includes(a); i++) {
    v.agents.update(0.05, 10, 1, false, 40, 0);
    v.ex.update(0.05);
    if (a.wait) v.ex.decide(a, a.wait.options.findIndex((_, j) => v.ex.canTake(a, j)));
    view.update(0.05);
    for (const id of a.party) {
      const g = v.agents.agents.find((x) => x.id === id)!, p = prev.get(id);
      // (sauf à son apparition : il sort de chez lui, ou d'une cachette)
      // (à bord, le pas se compte par rapport au bateau qui l'emporte : la galère file vite, `Ride.move`)
      const mv = (g as unknown as { ride?: { move?: [number, number] } }).ride?.move ?? [0, 0];
      if (p && !g.hidden && !p[2]) worst = Math.max(worst, Math.hypot(g.x - p[0] - mv[0], g.z - p[1] - mv[1]));
      prev.set(id, [g.x, g.z, g.hidden]);
    }
  }
  expect(v.ex.active.includes(a)).toBe(false);
  return worst;
}

describe('le portail de l’autre rive : pas de téléportation', () => {
  // la graine 9 : un village loin de l'île, la galère traverse près de 40 cases
  for (const seed of [2026, 9]) {
    it(`graine ${seed} : aucun membre ne saute de plus de 0,25 case d'une image à l'autre`, { timeout: 60000 }, () => {
      expect(maxStep(seed, 0)).toBeLessThan(0.25);
    });
  }
});
