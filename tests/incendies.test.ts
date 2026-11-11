import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Agents } from '../src/sim/agents';
import { Building } from '../src/build/catalog';
import { Fires } from '../src/render/fires';

/** Une maison seule sur un monde plat, loin de l'eau et de toute caserne */
function village(disasters: boolean) {
  const w = new World();
  w.heights.fill(1);
  w.disasters = disasters;
  const b: Building = { id: w.nextId++, kind: 'house', x: 40, z: 40, rot: 0, auto: true, age: 4 };
  w.buildings.set(b.id, b);
  return { w, b, fires: new Fires(w) };
}

describe('incendies', () => {
  beforeAll(() => setMapSize(96));

  it('catastrophes désactivées, aucun incendie ne se déclare (foudre, lave ou feu accidentel passent tous par là)', () => {
    const { b, fires } = village(false);
    expect(fires.ignite(b)).toBe(false);
    expect(fires.burning).toEqual([]);
    expect(fires.incidents()).toEqual([]);
    expect(fires.news).toEqual([]);
  });

  it('catastrophes activées, le feu prend ; sans eau ni caserne, le bâtiment finit par brûler', () => {
    const { w, b, fires } = village(true);
    expect(fires.ignite(b)).toBe(true);
    expect(fires.burning.map((f) => f.id)).toEqual([b.id]);
    for (let t = 0; t < 80; t++) fires.update(1);
    expect(fires.burning).toEqual([]);
    expect(w.buildings.has(b.id)).toBe(false);
  });

  it('les catastrophes désactivées en plein incendie : il s’éteint sans rien détruire, et aucun autre ne prend', () => {
    const { w, b, fires } = village(true);
    fires.ignite(b);
    w.disasters = false;
    for (let t = 0; t < 80; t++) fires.update(1);
    expect(fires.burning).toEqual([]);
    expect(w.buildings.has(b.id)).toBe(true);
    expect(fires.ignite(b)).toBe(false);
  });
});

/** Un petit village de maisons et ses habitants */
function town() {
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
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 1, true, 1, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, 1, false, 40, 0);
  return { w, agents, x, z };
}

describe('incendies : les habitants au seau', () => {
  it('les habitants restés à l’intérieur sortent avec leur seau, et l’appel ne rappelle pas ceux qui accourent déjà', () => {
    const { w, agents, x, z } = town();
    const list = (agents as unknown as { agents: { hidden: boolean; state: string }[] }).agents;
    expect(list.length).toBeGreaterThan(2);
    // tout le monde chez soi : avant, personne ne venait et le feu s'éteignait sans que rien ne bouge
    for (const a of list) { a.hidden = true; a.state = 'inside'; }
    const b = w.buildings.get(w.occ[w.ci(x, z)])!;
    agents.alert(b.z * N + b.x);
    const n = agents.responders(b);
    expect(n).toBeGreaterThan(0);
    // un second appel n'envoie que des renforts, jamais deux fois les mêmes
    agents.alert(b.z * N + b.x);
    expect(agents.responders(b)).toBeGreaterThanOrEqual(n);
    expect(agents.responders(b)).toBeLessThanOrEqual(list.length);
  });

  it('la nuit, ceux qui combattent le feu restent jusqu’à ce qu’il soit éteint, puis rentrent', () => {
    const { w, agents, x, z } = town();
    const b = w.buildings.get(w.occ[w.ci(x, z)])!;
    let burning = true;
    agents.burning = (id) => burning && id === b.id;
    agents.alert(b.z * N + b.x);
    expect(agents.responders(b)).toBeGreaterThan(0);
    // minuit : avant, tout le monde repartait se coucher en laissant brûler
    for (let i = 0; i < 400; i++) agents.update(0.1, 0, 1, false, 40, 1);
    expect(agents.responders(b)).toBeGreaterThan(0);
    burning = false;
    for (let i = 0; i < 400; i++) agents.update(0.1, 0, 1, false, 40, 1);
    expect(agents.responders(b)).toBe(0);
  });
});
