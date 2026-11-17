import { it, expect } from 'vitest';

/**
 * L'antre du dragon (retour de l'auteur, 17 nov. 2026 : le dragon juché sur une crête, la grotte au fond du ravin, la troupe
 * sur le plateau). Sur plusieurs cartes, la gueule de l'antre et le dragon sont au niveau de la troupe.
 */
import { World, N, MOUNTAIN_H, setMapSize, SEA } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS } from '../src/sim/missions';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ExpeditionView } from '../src/render/expeditionView';

function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}
function village(age: number, seed = 2026) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, seed);
  w.updateVis();
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  let at: [number, number] | null = null;
  for (let z = 10; z < N - 10 && !at; z++) for (let x = 10; x < N - 10 && !at; x++)
    if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) at = [x, z];
  const [x, z] = at!;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, age, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, age, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(age + 1));
  ex.pop = () => 60; ex.missing = () => [];
  w.isles = { main: { x: 0, z: 0, n: N }, rivals: [], small: [] };
  w.diplo.met = ['orient', 'asie']; w.diplo.ally = 'orient'; w.diplo.path = 'peace';
  return { w, agents, ex, view: new ExpeditionView(w, agents, ex) };
}


it('l’antre du dragon, la bête et la troupe sont sur le même replat', { timeout: 900000 }, () => {
  stubCanvas();
  const bad: string[] = [];
  for (const seed of [2026, 11, 3, 4, 9]) {
    const v = village(2, seed), w = v.w, m = MISSIONS.find((x) => x.id === 'dragon')!;
    m.choices.forEach((_, ci) => {
      for (const g of v.agents.agents) g.rest = 0;
      w.exp.done = w.exp.done.filter((id) => id !== m.id);
      const a = v.ex.start(m, ci, 2);
      if (!a) return;
      let d: { mouth: [number, number]; home: [number, number] } | null = null;
      for (let i = 0; i < 40000 && v.ex.active.includes(a) && !d; i++) {
        v.agents.update(0.05, 10, 2, false, 40, 0); v.ex.update(0.05); if (a.wait) v.ex.decide(a, 0); v.view.update(0.05);
        d = (v.view as unknown as { shows: Map<number, { scene: { dragon: typeof d } | null }> }).shows.get(a.id)?.scene?.dragon ?? null;
      }
      expect(d, `graine ${seed}, choix ${ci}`).not.toBeNull();
      const hT = w.hAt(a.dest[0], a.dest[1]), hM = w.hAt(d!.mouth[0], d!.mouth[1]), hH = w.hAt(d!.home[0], d!.home[1]);
      if (Math.abs(hM - hT) > 0.4 || Math.abs(hH - hT) > 0.4) bad.push(`graine ${seed}, choix ${ci} : troupe ${hT.toFixed(2)}, gueule ${hM.toFixed(2)}, dragon ${hH.toFixed(2)}`);
      v.ex.active.splice(v.ex.active.indexOf(a), 1);
    });
  }
  expect(bad.join('\n')).toBe('');
});
