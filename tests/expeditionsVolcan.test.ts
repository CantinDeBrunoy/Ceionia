import { describe, it, expect } from 'vitest';
import { World, N, setMapSize, MOUNTAIN_H, VEG_VOLCANO } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { MISSIONS, VOLCANIC } from '../src/sim/missions';
import { nearestVolcano, volcanoIsle } from '../src/sim/volcano';
import { ExpeditionView } from '../src/render/expeditionView';
import { mulberry32 } from '../src/core/rng';

function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

/** Un village de quelques maisons sur le continent (le volcan est sur son île, au loin) */
function village(seed: number, age: number) {
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
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, age, false);
  return w;
}

const VOLC = MISSIONS.filter((m) => m.choices.some((c) => VOLCANIC.has(c.scene)));

describe('les expéditions du volcan', () => {
  it('trois expéditions, à trois âges, qui ne sont pas obligatoires', () => {
    expect(VOLC.map((m) => [m.id, m.age, m.mandatory])).toEqual([['obsidian', 1, false], ['ascent', 2, false], ['eruption', 3, false]]);
  });

  it('on traverse en barque jusqu’à l’île du volcan, on monte au lieu du travail, on rentre au village', { timeout: 300000 }, () => {
    stubCanvas();
    for (const m of VOLC) for (let ci = 0; ci < m.choices.length; ci++) {
      const w = village(2026, m.age), agents = new Agents(w);
      for (let i = 0; i < 20; i++) agents.update(0.1, 10, m.age, false, 40, 0);
      const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
      ex.pop = () => 60;
      ex.missing = () => [];
      const view = new ExpeditionView(w, agents, ex);
      const a = ex.start(m, ci, m.age)!;
      const name = `${m.id} ${ci}`;
      expect(a, name).not.toBeNull();
      // la barque part de la rive d'en face : hors de l'île du volcan, au bord de la mer
      const v = nearestVolcano(w, a.dest[0], a.dest[1])!, isle = volcanoIsle(w, v.f);
      expect(a.sea, name).toBe(true);
      expect(isle[w.ci(Math.floor(a.dest[0]), Math.floor(a.dest[1]))], name).toBe(0);
      let near = 0, top = 0;
      for (let i = 0; i < 60000 && ex.active.includes(a); i++) {
        agents.update(0.1, 10, m.age, false, 40, 0); ex.update(0.1); view.update(0.1);
        if (a.wait) ex.decide(a, 0);
        // au milieu du travail, l'équipe est sur l'île, au lieu du travail
        const sc = (view as unknown as { shows: Map<number, { scene: { volc: { gate: [number, number] } | null } | null }> }).shows.get(a.id)?.scene;
        const gate = sc?.volc?.gate, k = a.phase === 'work' ? a.t / (a.c.work + a.extra) : 0;
        if (gate && k > 0.45 && k < 0.6) {
          const pos = agents.partyPositions(a.party);
          near = Math.max(near, pos.filter(([x, z]) => Math.hypot(x - gate[0], z - gate[1]) < 1).length);
          top = Math.max(top, ...pos.map(([x, z]) => w.surfaceAt(x, z)));
        }
      }
      expect(ex.active.includes(a), `${name} : l'équipe n'est pas rentrée`).toBe(false);
      expect(near, `${name} : personne au lieu du travail`).toBe(a.party.length);
      // (sur le flanc du volcan, au-dessus de la mer ; le village de pêcheurs est à son pied)
      expect(top, name).toBeGreaterThan(m.id === 'ascent' ? 6 : m.id === 'obsidian' ? 1 : 0.4);
    }
  });

  it('sans volcan sur la carte, on le dit au lieu de partir', () => {
    const w = village(2026, 1);
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_VOLCANO) w.veg[k] = 0;
    const agents = new Agents(w), ex = new Expeditions(w, agents, () => 100, mulberry32(7));
    ex.pop = () => 60;
    const m = VOLC[0];
    expect(ex.why(m, m.choices[0])).toBe('Il n’y a pas de volcan sur cette carte.');
  });
});
