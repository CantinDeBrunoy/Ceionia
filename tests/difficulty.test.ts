import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { Sim } from '../src/sim/sim';
import { KINDS, KindId, Building } from '../src/build/catalog';
import { costOf, priceIn, canPay, pay, shortLabel, PRODUCERS } from '../src/sim/economy';
import { DIFFICULTY, DIFFICULTIES, Difficulty, readDifficulty } from '../src/sim/difficulty';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { MISSIONS } from '../src/sim/missions';

const ALL = Object.keys(KINDS) as KindId[];
const total = (c: { wood: number; stone: number } | null) => (c ? c.wood + c.stone : 0);

/** Un monde plat et vide, où l'on pose les bâtiments à la main (sans relief ni placement) */
function flatWorld(d: Difficulty) {
  const w = new World();
  w.difficulty = d;
  w.heights.fill(1);
  return w;
}

/** Pose directement des bâtiments (genre et âge) sur une rangée de cases libres */
function put(w: World, list: [KindId, number][]) {
  let x = 10;
  for (const [kind, age] of list) {
    const b: Building = { id: w.nextId++, kind, x, z: 10, rot: 0, auto: true, age };
    w.buildings.set(b.id, b);
    x += KINDS[kind].size + 1;
  }
}

describe('prix des bâtiments selon la difficulté', () => {
  it('en partie normale, rien ne change : petits bâtiments gratuits, grands au barème habituel', () => {
    for (const k of ALL) if (KINDS[k].size < 2) expect(costOf(k, 4, 'normal')).toBeNull();
    expect(costOf('workshop', 0)).toEqual({ wood: 8, stone: 6 });
    expect(costOf('workshop', 3, 'normal')).toEqual({ wood: 20, stone: 18 });
    expect(costOf('pen', 2, 'normal')).toEqual({ wood: 16, stone: 4 });
    // un bâtiment pas encore de son âge se paie à son âge d'apparition
    expect(costOf('airport', 0, 'normal')).toEqual(costOf('airport', 4, 'normal'));
  });

  it('en défi, chaque bâtiment se paie en bois et en pierre, à chaque âge', () => {
    for (const k of ALL) for (let a = 0; a < 5; a++) {
      const c = costOf(k, a, 'challenge');
      expect(c, `${k} à l’âge ${a}`).not.toBeNull();
      expect(c!.wood).toBeGreaterThan(0);
      expect(c!.stone).toBeGreaterThan(0);
    }
  });

  it('en défi, tout coûte plus cher qu’en partie normale', () => {
    for (const k of ALL) for (let a = 0; a < 5; a++) {
      const n = costOf(k, a, 'normal'), c = costOf(k, a, 'challenge')!;
      if (!n) continue;
      expect(c.wood).toBeGreaterThanOrEqual(n.wood);
      expect(c.stone).toBeGreaterThanOrEqual(n.stone);
      expect(total(c)).toBeGreaterThan(total(n));
    }
  });

  it('en défi, le prix grandit avec l’emprise et avec l’âge', () => {
    // à âge égal : une case, 2 × 2, 3 × 3, 4 × 4
    const bySize = (['house', 'workshop', 'harbor', 'airport'] as KindId[]).map((k) => total(costOf(k, 4, 'challenge')));
    for (let i = 1; i < bySize.length; i++) expect(bySize[i]).toBeGreaterThan(bySize[i - 1]);
    for (const k of ['house', 'farm', 'workshop', 'temple'] as KindId[])
      for (let a = Math.max(1, KINDS[k].minAge + 1); a < 5; a++) expect(total(costOf(k, a, 'challenge'))).toBeGreaterThan(total(costOf(k, a - 1, 'challenge')));
  });

  it('en défi, le premier bûcheron et la première carrière sont offerts (on ne reste jamais sans rien pour bâtir)', () => {
    for (const k of PRODUCERS) {
      expect(costOf(k, 0, 'challenge', 0)).toBeNull();
      expect(costOf(k, 0, 'challenge', 1)).not.toBeNull();
    }
    const w = flatWorld('challenge');
    expect(priceIn(w, 'lumber', 0)).toBeNull();
    put(w, [['lumber', 0]]);
    expect(priceIn(w, 'lumber', 0)).not.toBeNull();
    expect(priceIn(w, 'quarry', 0)).toBeNull();
  });

  it('au bac à sable rien ne se paie ; en défi, le réglage « ressources illimitées » ne joue pas', () => {
    const s = flatWorld('sandbox');
    expect(s.unlimited).toBe(true);
    for (const k of ALL) expect(priceIn(s, k, 4)).toBeNull();
    const c = flatWorld('challenge');
    c.unlimited = true;
    expect(c.unlimited).toBe(false);
    expect(priceIn(c, 'house', 0)).not.toBeNull();
    // en partie normale, le réglage décide
    const n = flatWorld('normal');
    expect(priceIn(n, 'workshop', 0)).toEqual({ wood: 8, stone: 6 });
    n.unlimited = true;
    expect(priceIn(n, 'workshop', 0)).toBeNull();
    expect(n.unlimitedSetting).toBe(true);
  });

  it('payer retire le prix ; sans de quoi payer, le refus dit ce qui manque', () => {
    const w = flatWorld('challenge');
    w.wood = 3; w.stone = 50;
    const c = priceIn(w, 'house', 0)!;
    expect(canPay(w, c)).toBe(false);
    expect(shortLabel(w, c)).toBe(`Il faut ${c.wood} bois et ${c.stone} pierre (vous avez 3 bois et 50 pierre)`);
    w.wood = 100;
    expect(canPay(w, c)).toBe(true);
    pay(w, c);
    expect(w.wood).toBe(100 - c.wood);
    expect(w.stone).toBe(50 - c.stone);
  });
});

describe('nourriture et croissance selon la difficulté', () => {
  beforeAll(() => setMapSize(96));

  /** Un village de deux grandes maisons sans rien à manger, `pop` habitants */
  function hungry(d: Difficulty, pop: number, food: [KindId, number][] = []) {
    const w = flatWorld(d);
    put(w, [['house', 4], ['house', 4], ['well', 4], ...food]);
    const sim = new Sim(w);
    sim.recalc();
    sim.pop = pop;
    return sim;
  }

  /** Un petit village qui a tout ce qu'il lui faut : il grandit */
  function thriving(d: Difficulty) {
    const w = flatWorld(d);
    put(w, [['house', 4], ['house', 4], ['farm', 4], ['well', 4], ['gather', 4], ['workshop', 4]]);
    const sim = new Sim(w);
    sim.recalc();
    sim.pop = 1;
    return sim;
  }

  it('en défi, chaque habitant mange plus', () => {
    for (const d of DIFFICULTIES) {
      const sim = hungry(d, 10);
      sim.update(0, 1);
      expect(sim.food.demand).toBeCloseTo(11 * DIFFICULTY[d].foodK, 6);
    }
    expect(DIFFICULTY.challenge.foodK).toBeGreaterThan(1);
    expect(DIFFICULTY.normal.foodK).toBe(1);
  });

  it('la disette fait partir des habitants en défi seulement ; personne ne part en partie normale ni au bac à sable', () => {
    for (const d of ['normal', 'sandbox'] as Difficulty[]) {
      const sim = hungry(d, 20);
      for (let i = 0; i < 50; i++) sim.update(1, 1);
      expect(sim.pop).toBe(20);
    }
    const sim = hungry('challenge', 20);
    for (let i = 0; i < 50; i++) sim.update(1, 1);
    expect(sim.pop).toBeLessThan(20);
    expect(sim.pop).toBeGreaterThan(0);
    expect(sim.fled).toBeGreaterThan(1);
    expect(sim.message.startsWith('Disette')).toBe(true);
  });

  it('en défi, plus le manque est grand, plus il en part', () => {
    const none = hungry('challenge', 20), some = hungry('challenge', 20, [['farm', 0]]);
    for (let i = 0; i < 30; i++) { none.update(1, 1); some.update(1, 1); }
    expect(some.pop).toBeGreaterThan(none.pop);
  });

  it('en défi, le village grandit moins vite, et plus lentement encore après un manque', () => {
    const grow = (sim: Sim, s: number) => { const p0 = sim.pop; for (let i = 0; i < s * 4; i++) sim.update(0.25, 1); return sim.pop - p0; };
    const normal = grow(thriving('normal'), 16), challenge = grow(thriving('challenge'), 16);
    expect(challenge).toBeLessThan(normal);
    expect(challenge).toBeGreaterThan(0);
    // un manque (plus d'eau) : le village met du temps à s'en remettre
    const sim = thriving('challenge'), w = (sim as unknown as { world: World }).world;
    const well = [...w.buildings.values()].find((b) => b.kind === 'well')!;
    w.buildings.delete(well.id);
    sim.recalc(); sim.update(1, 1);
    expect(sim.water.ok).toBe(false);
    expect(sim.recovering).toBe(DIFFICULTY.challenge.recoverT);
    w.buildings.set(well.id, well);
    sim.recalc();
    const after = grow(sim, 16);
    expect(after).toBeLessThan(challenge);
    expect(sim.recovering).toBeGreaterThan(0);
    // en partie normale, aucune séquelle
    const n = thriving('normal'), wn = (n as unknown as { world: World }).world;
    wn.buildings.clear(); n.recalc(); n.update(1, 1);
    expect(n.recovering).toBe(0);
  });
});

describe('expéditions et sauvegarde selon la difficulté', () => {
  beforeAll(() => setMapSize(96));

  it('les expéditions sont plus risquées en défi, inchangées ailleurs', () => {
    const c = MISSIONS[0].choices[0];
    const risk = (d: Difficulty) => { const w = flatWorld(d); return new Expeditions(w, new Agents(w), () => 100).riskOf(c); };
    expect(risk('normal')).toBe(c.risk);
    expect(risk('sandbox')).toBe(c.risk);
    expect(risk('challenge')).toBeCloseTo(c.risk * DIFFICULTY.challenge.riskK, 9);
    expect(risk('challenge')).toBeGreaterThan(risk('normal'));
  });

  it('la difficulté se sauvegarde avec la partie ; une ancienne sauvegarde se relit en normal', () => {
    for (const d of DIFFICULTIES) {
      const w = flatWorld(d), r = new World();
      r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
      expect(r.difficulty).toBe(d);
    }
    const { difficulty, ...old } = flatWorld('challenge').toJSON();
    void difficulty;
    const r = new World();
    r.difficulty = 'challenge';
    r.fromJSON(old);
    expect(r.difficulty).toBe('normal');
    expect(readDifficulty('nimporte')).toBe('normal');
  });
});
