import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize, VEG_FIELD } from '../src/world/world';
import { Sim, NeedId } from '../src/sim/sim';
import { KINDS, KindId } from '../src/build/catalog';
import { DIFFICULTY, DIFFICULTIES, Difficulty } from '../src/sim/difficulty';
import { mulberry32 } from '../src/core/rng';

/** Un monde plat où l'on pose les bâtiments à la main (genre, âge, nombre), en rangées, et `fields` cases de champ */
function village(d: Difficulty, list: [KindId, number, number][], fields = 0) {
  const w = new World();
  w.difficulty = d;
  w.heights.fill(1);
  let x = 2, z = 2;
  for (const [kind, age, n] of list) for (let i = 0; i < n; i++) {
    const s = KINDS[kind].size;
    if (x + s >= 90) { x = 2; z += 4; }
    w.buildings.set(w.nextId, { id: w.nextId++, kind, x, z, rot: 0, auto: true, age });
    x += s + 1;
  }
  for (let i = 0; i < fields; i++) w.veg[w.ci(2 + (i % 80), 80 + Math.floor(i / 80))] = VEG_FIELD;
  return w;
}

describe('jauges des besoins', () => {
  beforeAll(() => setMapSize(96));

  it('la jauge de nourriture ne ment plus : plus de « 170 / 170, il manque 0.0 » quand un habitant a faim', () => {
    const w = village('normal', [['house', 5, 7], ['farm', 3, 7], ['well', 5, 2]], 10);
    const sim = new Sim(w);
    sim.pop = 135;
    // sept fermes à silo (140) et des champs qui donnent 29,98 : 169,98 pour un besoin de (135 + 1) × 1,25 = 170
    sim.moisture = (29.98 / 30 - 0.55) / 0.55;
    sim.update(0, 1);
    const d = sim.needDetail('food');
    expect(d.demand).toBe(170);
    expect(d.cap).toBe(169);
    expect(d.ok).toBe(false);
    // les sources s'additionnent juste (7 × 20, et 29 parts entières des champs) ; il manque une part : un affamé
    expect(d.rows.map((r) => r.v)).toEqual([140, 29]);
    expect(d.demand - d.cap).toBe(1);
  });

  it('nourriture, eau, emplois et soins se comptent en parts entières : jauge, manque et sources tombent juste', () => {
    const rnd = mulberry32(7), pick = (n: number) => Math.floor(rnd() * n);
    for (let k = 0; k < 150; k++) {
      const d = DIFFICULTIES[k % DIFFICULTIES.length];
      const w = village(d, [['house', 5, 8], ['farm', pick(6), 1 + pick(5)], ['well', 2, 1], ['workshop', 3, pick(4)], ['health', 3, pick(2)]], pick(40));
      const sim = new Sim(w);
      sim.recalc();
      // une disette en Normal laisse un nombre d'habitants à virgule (on n'en affiche que la partie entière)
      sim.pop = pick(150) + (d === 'normal' ? rnd() : 0);
      sim.moisture = rnd();
      sim.update(0, 1);
      const n = Math.floor(sim.pop);
      expect(sim.food.demand).toBe(Math.ceil((n + 1) * DIFFICULTY[d].foodK - 1e-9));
      for (const need of ['food', 'water', 'jobs', 'health'] as NeedId[]) {
        const nd = sim.needDetail(need), what = `${need}, ${d}, ${sim.pop} habitants`;
        expect(Number.isInteger(nd.cap), what).toBe(true);
        expect(Number.isInteger(nd.demand), what).toBe(true);
        expect(nd.ok, what).toBe(nd.cap >= nd.demand);
        // la somme des sources affichées est ce qui est disponible
        expect(nd.rows.reduce((s, r) => s + r.v, 0), what).toBe(nd.cap);
      }
    }
  });
});
