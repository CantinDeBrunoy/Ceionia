import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { KindId } from '../src/build/catalog';
import { boostedBuildings } from '../src/sim/freight';
import { RailBoost } from '../src/render/railBoost';

function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}
function spot(w: World, kind: KindId, x0 = 10, z0 = 10): [number, number] {
  for (let z = z0; z < N - 10; z++) for (let x = x0; x < N - 10; x++) if (w.canPlace(kind, x, z) === null) return [x, z];
  throw new Error(`pas de place pour ${kind}`);
}

describe('bâtiments boostés par le rail (animation)', () => {
  it('seuls les bâtiments servis par une ligne en service sont retenus', () => {
    const w = continent();
    const [x, z] = spot(w, 'brickworks', 40, 40);
    const bw = w.place('brickworks', x, z, 0, true, 3, false);
    const [sx, sz] = spot(w, 'station', x + 3, z);
    const st = w.place('station', sx, sz, 0, true, 3, false);
    const [fx, fz] = spot(w, 'station', x + 30, z + 30);
    const far = w.place('station', fx, fz, 0, true, 3, false);
    expect(boostedBuildings(w)).toEqual([]);
    // voyageurs : une briqueterie n'en tire rien
    w.lines.push({ id: 1, stops: [st.id, far.id], color: 0 });
    expect(boostedBuildings(w)).toEqual([]);
    w.lines[0].freight = true;
    const r = boostedBuildings(w);
    expect(r.map((e) => e.b.id)).toEqual([bw.id]);
    expect(r[0].station.id).toBe(st.id);
    expect(r[0].freight).toBe(true);
    // ligne en panne : l'effet s'éteint
    w.lines[0].ok = false;
    expect(boostedBuildings(w)).toEqual([]);
  });

  it('le cosmodrome est boosté par une ligne de voyageurs, sans chariot', () => {
    const w = continent();
    const [x, z] = spot(w, 'spaceport', 40, 40);
    const sp = w.place('spaceport', x, z, 0, true, 3, false);
    const [sx, sz] = spot(w, 'station', x + 4, z);
    const st = w.place('station', sx, sz, 0, true, 3, false);
    const [fx, fz] = spot(w, 'station', x + 30, z + 30);
    const far = w.place('station', fx, fz, 0, true, 3, false);
    w.lines.push({ id: 1, stops: [st.id, far.id], color: 0 });
    const r = boostedBuildings(w);
    expect(r.map((e) => [e.b.id, e.freight])).toEqual([[sp.id, false]]);
  });

  it('on n’anime que les plus proches de la caméra, dans la limite du plafond', () => {
    const mk = (id: number, x: number) => ({ b: { id, kind: 'brickworks', x, z: 0, rot: 0, auto: true, age: 3 } as any, station: {} as any, freight: true });
    const list = [mk(1, 50), mk(2, 5), mk(3, 20), mk(4, 100)];
    expect(RailBoost.pick(list, 0, 0, 60, 2).map((e) => e.b.id)).toEqual([2, 3]);
    expect(RailBoost.pick(list, 0, 0, 10, 5).map((e) => e.b.id)).toEqual([2]);
    expect(RailBoost.pick(list, 0, 0, 200, 9).length).toBe(4);
  });
});
