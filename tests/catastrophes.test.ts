import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, VEG_FIELD, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32 } from '../src/core/rng';
import { Building, KindId } from '../src/build/catalog';
import { Sim } from '../src/sim/sim';
import { rulesOf, DIFFICULTIES } from '../src/sim/difficulty';
import { CALAM_DAYS, FLOOD_RISE, floodSite, growFlood, planAge, riverish, ruinedFields } from '../src/sim/calamity';

/**
 * Un monde plat (hauteur 1) traversé du nord au sud par une rivière (colonnes 40 à 42, sous l'eau), aux berges basses
 * (colonnes 36 à 39 et 43 à 46, à 0,3) ; des champs sur la berge ouest
 */
function riverWorld() {
  const w = new World();
  for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) {
    const h = x >= 40 && x <= 43 ? -0.9 : (x >= 36 && x <= 47 ? 0.3 : 1);
    w.heights[w.vi(x, z)] = h;
  }
  for (let z = 30; z < 50; z++) for (const x of [37, 38]) w.veg[z * N + x] = VEG_FIELD;
  return w;
}

function put(w: World, kind: KindId, x: number, z: number, age = 1): Building {
  const b: Building = { id: w.nextId++, kind, x, z, rot: 0, auto: true, age };
  w.buildings.set(b.id, b);
  w.occ[z * N + x] = b.id;
  return b;
}

describe('catastrophes : le programme', () => {
  it('une au plus par âge : quelques jours après le passage, ou pas du tout selon la chance', () => {
    expect(planAge(0, 130)).toBe(-1);
    for (let i = 0; i < 50; i++) {
      const d = planAge(1, 130);
      expect(d).toBeGreaterThanOrEqual(CALAM_DAYS[0] * 130);
      expect(d).toBeLessThanOrEqual(CALAM_DAYS[1] * 130);
    }
  });

  it('la difficulté : spectacle seul au bac à sable, un âge sur deux et peu de dégâts en Facile, tout en Normal', () => {
    expect(rulesOf('sandbox').calamity).toEqual({ chance: 1, harm: 'none' });
    expect(rulesOf('easy').calamity).toEqual({ chance: 0.5, harm: 'light' });
    expect(rulesOf('normal').calamity).toEqual({ chance: 1, harm: 'full' });
    for (const d of DIFFICULTIES) expect(rulesOf(d).calamity.chance).toBeGreaterThan(0);
  });
});

describe('catastrophes : la crue', () => {
  beforeAll(() => setMapSize(96));

  it('la rivière déborde sur les berges basses, pas au-delà', () => {
    const w = riverWorld();
    const s = floodSite(w, mulberry32(3))!;
    expect(s).toBeTruthy();
    expect(s.lake).toBe(false);
    expect(s.fields).toBeGreaterThan(0);
    for (const k of s.cells) expect(w.cellAvg(k % N, Math.floor(k / N))).toBeLessThan(s.level + FLOOD_RISE);
    // la plaine haute reste sèche
    expect(s.cells.some((k) => k % N < 36 || k % N > 47)).toBe(false);
  });

  it('une mer n’est pas une rivière : sa côte ne déborde pas', () => {
    const w = new World();
    for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) w.heights[w.vi(x, z)] = x < 48 ? -1 : 0.3;
    expect(riverish(w, 40, 48)).toBe(false);
    expect(floodSite(w, mulberry32(1))).toBeNull();
  });

  it('un rempart le long de la berge arrête l’eau (une digue)', () => {
    const w = riverWorld();
    // (la colonne 39 est déjà dans l'eau : la digue est sur la berge, colonne 38)
    const wall = put(w, 'wall', 38, 0);
    for (let z = 0; z < N; z++) w.occ[z * N + 38] = wall.id;
    const s = growFlood(w, 40 * N + 40)!;
    expect(s).toBeTruthy();
    expect(s.cells.some((k) => k % N <= 38)).toBe(false);
    expect(s.fields).toBe(0);
  });

  it('les bâtiments de la berge sont touchés, sauf ceux qui ont les pieds dans l’eau (ponton)', () => {
    const w = riverWorld();
    const hut = put(w, 'house', 38, 40), pier = put(w, 'pier', 39, 42);
    const s = growFlood(w, 40 * N + 40)!;
    expect(s.buildings).toContain(hut.id);
    expect(s.buildings).not.toContain(pier.id);
  });

  it('un champ noyé sur trois environ est à resemer', () => {
    const w = riverWorld(), s = growFlood(w, 40 * N + 40)!, rnd = mulberry32(9);
    let n = 0, all = 0;
    for (let i = 0; i < 40; i++) { n += ruinedFields(w, s.cells, rnd).length; all += s.fields; }
    expect(n / all).toBeGreaterThan(0.25);
    expect(n / all).toBeLessThan(0.42);
  });

  it('sur une carte générée, une crue trouve sa rivière', () => {
    const w = new World();
    newWorld(w, 3, 2026);
    w.updateVis();
    expect(floodSite(w, mulberry32(4))).toBeTruthy();
  });
});

describe('catastrophes : bâtiments abîmés et sauvegarde', () => {
  beforeAll(() => setMapSize(96));

  it('un bâtiment abîmé ne donne que la moitié ; un champ sous l’eau rien', () => {
    const w = riverWorld(), sim = new Sim(w);
    const b = put(w, 'house', 20, 20, 2);
    sim.recalc(); sim.evaluate();
    const before = sim.housing.cap, food = sim.food.cap;
    w.damaged.set(b.id, { t: 100, T: 130 });
    sim.recalc(); sim.evaluate();
    expect(sim.housing.cap).toBeLessThan(before);
    for (const k of [30 * N + 37, 31 * N + 37]) w.flooded[k] = 1;
    sim.recalc(); sim.evaluate();
    expect(sim.food.cap).toBeLessThanOrEqual(food);
  });

  it('les réparations, le programme et les fers célestes se sauvegardent ; une ancienne partie n’en a pas', () => {
    const w = new World();
    newWorld(w, 3, 2026);
    w.updateVis();
    const at = (() => { for (let z = 10; z < N - 10; z++) for (let x = 10; x < N - 10; x++) if (w.canPlace('house', x, z) === null) return [x, z]; return null; })()!;
    const b = w.place('house', at[0], at[1], 0, true, 1, false);
    w.damaged.set(b.id, { t: 40, T: 130 });
    w.calam = { age: 1, due: 512 };
    w.starIron = [1234];
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect([...back.damaged.values()]).toEqual([{ t: 40, T: 130 }]);
    expect(back.calam).toEqual({ age: 1, due: 512 });
    expect(back.starIron).toEqual([1234]);
    const old = JSON.parse(JSON.stringify(w.toJSON()));
    delete old.damaged; delete old.calam; delete old.starIron;
    const again = new World();
    again.fromJSON(old);
    expect(again.damaged.size).toBe(0);
    expect(again.calam).toBeNull();
    expect(again.starIron).toEqual([]);
  });
});
