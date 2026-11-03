import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
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
