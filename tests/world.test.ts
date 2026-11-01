import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, MAX_H, MIN_H, setMapSize, VEG_FIELD } from '../src/world/world';
import { genHeights, newWorld, MAPS } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';

/** Carte de l'île, toujours la même graine : les tests ne dépendent pas du hasard */
function island() {
  setMapSize(96);
  const w = new World();
  newWorld(w, 0, 1234);
  w.updateVis();
  return w;
}

/** Première case de terre plate (au moins `h` de haut) entourée de terre, pour y poser un bâtiment */
function flatLand(w: World, h = 0.6) {
  for (let z = 10; z < N - 10; z++)
    for (let x = 10; x < N - 10; x++)
      if (w.cellAvg(x, z) > h && w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null) return [x, z];
  throw new Error('pas de terrain plat');
}

describe('génération des cartes', () => {
  it('une même graine donne toujours le même relief', () => {
    for (const m of MAPS) {
      setMapSize(m.size);
      const a = genHeights(m.id, 42), b = genHeights(m.id, 42);
      expect(a).toEqual(b);
      expect(genHeights(m.id, 43)).not.toEqual(a);
    }
  });

  it('le relief reste dans ses bornes et les montagnes sont hautes', () => {
    for (const m of MAPS) {
      setMapSize(m.size);
      const h = genHeights(m.id, m.defaultSeed);
      let lo = Infinity, hi = -Infinity;
      for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      // hauteurs stockées en flottants 32 bits
      expect(lo).toBeGreaterThanOrEqual(Math.fround(MIN_H));
      expect(hi).toBeLessThanOrEqual(MAX_H);
      expect(hi).toBeGreaterThan(8);
    }
  });
});

describe('sauvegarde', () => {
  let w: World;
  beforeAll(() => { w = island(); });

  it('relit exactement ce qu’elle a écrit (relief, végétation, bâtiments, lave, cendres, minerai)', () => {
    const [x, z] = flatLand(w);
    w.place('house', x, z, 0, true, 1, false);
    w.basalt[w.ci(5, 5)] = 0.42;
    w.ash[w.ci(6, 6)] = 1;
    w.ore = 17;
    w.mined.add(123);
    const data = JSON.parse(JSON.stringify(w.toJSON()));
    const r = new World();
    r.fromJSON(data);
    for (let i = 0; i < w.heights.length; i++) expect(r.heights[i]).toBeCloseTo(w.heights[i], 1);
    expect(Array.from(r.veg)).toEqual(Array.from(w.veg));
    expect([...r.buildings.values()].map((b) => [b.kind, b.x, b.z, b.age])).toEqual([...w.buildings.values()].map((b) => [b.kind, b.x, b.z, b.age]));
    expect(r.basalt[r.ci(5, 5)]).toBeCloseTo(0.42, 2);
    expect(r.ash[r.ci(6, 6)]).toBe(1);
    expect(r.ore).toBe(17);
    expect(r.mined.has(123)).toBe(true);
  });

  it('refuse une sauvegarde d’une autre taille de carte', () => {
    const data = w.toJSON();
    expect(() => new World().fromJSON({ ...data, n: 48 })).toThrow();
  });

  it('lit une ancienne sauvegarde sans lave, cendres ni minerai', () => {
    const { basalt, ash, ore, mined, ...old } = w.toJSON();
    void basalt; void ash; void ore; void mined;
    const r = new World();
    r.fromJSON(old);
    expect(r.ore).toBe(0);
    expect(r.ash.every((v) => v === 0)).toBe(true);
  });
});

describe('eau', () => {
  let w: World;
  beforeAll(() => { w = island(); });

  const findCell = (test: (x: number, z: number) => boolean) => {
    for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) if (test(x, z)) return [x, z];
    throw new Error('case introuvable');
  };

  it('une route franchit l’eau peu profonde sur un pont, pas le large', () => {
    const [sx, sz] = findCell((x, z) => w.cellAvg(x, z) < -0.3 && w.cellAvg(x, z) > -1.2);
    expect(w.canRoad(sx, sz)).toBe(true);
    expect(w.setRoad(sx, sz, true)).toBe(true);
    expect(w.bridgeY(sx, sz)).toBeGreaterThan(0.2);
    expect(w.surfaceAt(sx + 0.5, sz + 0.5)).toBeGreaterThan(0.2);
    const [dx, dz] = findCell((x, z) => w.cellAvg(x, z) < -1.9);
    expect(w.canRoad(dx, dz)).toBe(false);
  });

  it('le ponton de pêche se pose au bord de l’eau, pas dans les terres', () => {
    const [ix, iz] = flatLand(w, 1.5);
    expect(w.canPlace('pier', ix, iz)).not.toBeNull();
    const shore = findCell((x, z) => w.cellAvg(x, z) > 0.1 && w.cellSlope(x, z) < 0.5 && !w.occ[w.ci(x, z)] && !w.road[w.ci(x, z)] && !w.decor[w.ci(x, z)]
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => w.cellAvg(x + a, z + b) < -0.3));
    expect(w.canPlace('pier', shore[0], shore[1])).toBeNull();
  });

  it('on ne bâtit pas sur un lac', () => {
    const [x, z] = flatLand(w);
    const cells = new Uint8Array(N * N), level = new Float32Array(N * N);
    cells[w.ci(x, z)] = 1; level[w.ci(x, z)] = 3;
    w.setLakes(cells, level);
    expect(w.canPlace('house', x, z)).toBe('Un lac est ici');
    w.setLakes(new Uint8Array(N * N), new Float32Array(N * N));
  });
});

describe('volcans et récoltes', () => {
  it('la lave détruit un bâtiment seulement si les catastrophes sont activées', () => {
    const w = island();
    const [x, z] = flatLand(w);
    const b = w.place('house', x, z, 0, true, 1, false);
    w.disasters = false;
    w.coverLava(w.ci(x, z));
    expect(w.buildings.has(b.id)).toBe(true);
    w.disasters = true;
    w.coverLava(w.ci(x, z));
    expect(w.buildings.has(b.id)).toBe(false);
    expect(w.losses.length).toBe(1);
    expect(w.ash[w.ci(x, z)]).toBe(1);
  });

  it('un champ sur des cendres donne double récolte, la sécheresse la réduit', () => {
    const w = island();
    const [x, z] = flatLand(w);
    w.veg[w.ci(x, z)] = VEG_FIELD;
    const sim = new Sim(w);
    const food = (moisture: number) => { sim.moisture = moisture; sim.recalc(); sim.update(0, 1); return sim.food.cap; };
    const normal = food(1);
    w.ash[w.ci(x, z)] = 1;
    const fertile = food(1);
    expect(fertile).toBeCloseTo(normal * 2, 5);
    expect(food(0)).toBeLessThan(fertile * 0.6);
  });

  it('l’âge industriel demande du minerai', () => {
    const w = island();
    const sim = new Sim(w);
    sim.age = 2;
    const ore = () => sim.ageProgress()!.items.find((i) => i.label.startsWith('minerai'))!;
    expect(ore().need).toBeGreaterThan(0);
    w.ore = 99;
    expect(ore().have).toBe(99);
  });
});
