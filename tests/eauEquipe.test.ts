import { it, expect } from 'vitest';

/**
 * L'équipe dans l'eau (retour de l'auteur, nov. 2026 : marche dans l'eau, flottement, saccades, blocage). Sur toutes les
 * expéditions d'eau des âges 0 à 3, chaque choix joué de bout en bout : personne ne marche en eau profonde (plus de 0,2 sous
 * la surface), personne ne fait de bond (plus de 0,25 case d'une image à l'autre), personne ne reste planté en chemin
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
function village(age: number) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
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

it('l’équipe monte à bord et redescend au quai : ni eau profonde, ni bond, ni blocage', { timeout: 900000 }, () => {
  stubCanvas();
  const bad: string[] = [];
  for (const age of [0, 1, 2, 3]) {
    const v = village(age), w = v.w;
    const wet = (x: number, z: number) => { const cx = Math.floor(x), cz = Math.floor(z); if (!w.inCells(cx, cz)) return 0; const k = w.ci(cx, cz), lvl = w.lake[k] ? w.lakeLevel[k] : SEA; if (!w.lake[k] && !w.isWet(cx, cz)) return 0; return Math.max(0, lvl - w.hAt(x, z)); };
    for (const m of MISSIONS.filter((x) => x.age === age && !x.farewell)) m.choices.forEach((c, ci) => {
      if (c.dest !== 'river' && !c.sea) return;
      for (const g of v.agents.agents) g.rest = 0;
      v.w.exp.done = v.w.exp.done.filter((id) => id !== m.id);
      const a = v.ex.start(m, ci, m.age);
      if (!a) return;
      const last = new Map<number, [number, number]>(), still = new Map<number, number>();
      let deep = 0, jumps = 0, stuck = 0;
      for (let i = 0; i < 40000 && v.ex.active.includes(a); i++) {
        v.agents.update(0.05, 10, m.age, false, 40, 0);
        v.ex.update(0.05);
        if (a.wait) v.ex.decide(a, 0);
        v.view.update(0.05);
        for (const id of a.party) {
          const g = v.agents.agents.find((x) => x.id === id) as unknown as { x: number; z: number; ride: { move?: [number, number] } | null; hidden: boolean; state: string } | undefined;
          if (!g || g.hidden) { last.delete(id); continue; }
          // (à bord, le pas se compte par rapport au bateau qui l'emporte, `Ride.move`)
          const mv = g.ride?.move ?? [0, 0], p = last.get(id), moved = p ? Math.hypot(g.x - p[0] - mv[0], g.z - p[1] - mv[1]) : 1;
          if (p && moved > 0.25) jumps++;
          last.set(id, [g.x, g.z]);
          if (g.ride) continue;
          if (wet(g.x, g.z) > 0.2) deep++;
          if ((a.phase === 'out' || a.phase === 'back') && g.state === 'walking' && moved < 0.001) { const s2 = (still.get(id) ?? 0) + 0.05; still.set(id, s2); if (s2 > 5) stuck++; } else still.set(id, 0);
        }
      }
      if (deep || jumps || stuck) bad.push(`${m.id}:${ci} (âge ${age}) : eau profonde ${deep}, bonds ${jumps}, planté ${stuck}`);
    });
  }
  expect(bad.join('\n')).toBe('');
});
