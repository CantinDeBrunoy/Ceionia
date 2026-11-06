import { describe, it, expect } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS } from '../src/sim/missions';
import { EVENTS } from '../src/sim/events';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';

function village(age: number, seed = 5) {
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
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, age, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, age, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(seed));
  ex.pop = () => 60;
  return { w, agents, ex };
}

describe('attendre', () => {
  it('toute option dont le texte dit d’attendre est une attente', () => {
    const dit = /attendre|abriter|serrer sous|rester cach|passer son chemin|laisser filer|laisser la mère|regarder en silence|laisser un buisson|laisser les jongleurs|ne pas se disperser/i;
    for (const e of EVENTS) for (const o of e.options) if (dit.test(o.label)) expect(o.wait, `${e.id} › ${o.label}`).toBe(true);
  });

  /** Une équipe de la mission des bêtes, arrivée sur place et que l'on fait attendre une crue */
  function onSite() {
    const v = village(0), a = v.ex.start(MISSIONS.find((m) => m.id === 'herd')!, 0)!;
    for (let i = 0; i < 60000 && !a.wait; i++) { v.agents.update(0.05, 10, 0, false, 40, 0); v.ex.update(0.05); }
    expect(a.phase).toBe('work');
    a.wait = EVENTS.find((e) => e.id === 'flood')!;
    return { v, a };
  }
  const tick = (v: ReturnType<typeof village>, n: number) => { for (let i = 0; i < n; i++) { v.agents.update(0.05, 10, 0, false, 40, 0); v.ex.update(0.05); } };

  it('attendre suspend le travail le temps de l’attente, puis l’équipe s’y remet', () => {
    const { v, a } = onSite(), t0 = a.t, extra = a.extra;
    expect(v.ex.decide(a, 0)).toBe(true);
    expect(a.hold).toBeGreaterThanOrEqual(4);
    expect(a.extra).toBe(extra);
    tick(v, 20);
    expect(a.t).toBeCloseTo(t0, 5);
    while (a.hold > 0) tick(v, 1);
    tick(v, 20);
    expect(a.t).toBeGreaterThan(t0);
  });

  it('une autre option ne suspend rien', () => {
    const { v, a } = onSite();
    expect(v.ex.decide(a, 2)).toBe(true);
    expect(a.hold).toBe(0);
  });
});
