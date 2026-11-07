import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { Sim, reqKindsOf } from '../src/sim/sim';
import { AGES, KINDS, KindId, Building } from '../src/build/catalog';
import { costOf, priceIn, canPay, pay, shortLabel } from '../src/sim/economy';
import { DIFFICULTIES, DIFF_TEXT, Difficulty, readDifficulty } from '../src/sim/difficulty';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { MISSIONS, mandatoriesFor } from '../src/sim/missions';
import { GEAR, GEAR_BY, gearCost, gearCostLabel } from '../src/sim/gear';

const ALL = Object.keys(KINDS) as KindId[];

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

describe('deux modes de jeu', () => {
  it('ne restent que le bac à sable et la partie normale, chacun avec ses textes', () => {
    expect(DIFFICULTIES).toEqual(['sandbox', 'normal']);
    for (const d of DIFFICULTIES) {
      expect(DIFF_TEXT.name[d]).toBeTruthy();
      expect(DIFF_TEXT.tagline[d]).toBeTruthy();
      expect(DIFF_TEXT.points[d].length).toBeGreaterThan(0);
    }
    expect(DIFF_TEXT.play('sandbox')).toBe('Jouer en Bac à sable');
    expect(DIFF_TEXT.play('normal')).toBe('Jouer en Normal');
  });
});

describe('prix des bâtiments', () => {
  it('petits bâtiments gratuits, grands au barème habituel', () => {
    for (const k of ALL) if (KINDS[k].size < 2) expect(costOf(k, 4)).toBeNull();
    expect(costOf('workshop', 0)).toEqual({ wood: 8, stone: 6 });
    expect(costOf('workshop', 3)).toEqual({ wood: 20, stone: 18 });
    expect(costOf('pen', 2)).toEqual({ wood: 16, stone: 4 });
    // un bâtiment pas encore de son âge se paie à son âge d'apparition
    expect(costOf('airport', 0)).toEqual(costOf('airport', 4));
  });

  it('au bac à sable rien ne se paie ; en partie normale, le réglage « ressources illimitées » décide', () => {
    const s = flatWorld('sandbox');
    expect(s.unlimited).toBe(true);
    s.unlimited = false;
    expect(s.unlimited).toBe(true);
    for (const k of ALL) expect(priceIn(s, k, 4)).toBeNull();
    const n = flatWorld('normal');
    expect(priceIn(n, 'workshop', 0)).toEqual({ wood: 8, stone: 6 });
    n.unlimited = true;
    expect(priceIn(n, 'workshop', 0)).toBeNull();
    expect(n.unlimitedSetting).toBe(true);
  });

  it('payer retire le prix ; sans de quoi payer, le refus dit ce qui manque', () => {
    const w = flatWorld('normal');
    w.wood = 3; w.stone = 50;
    const c = priceIn(w, 'workshop', 0)!;
    expect(canPay(w, c)).toBe(false);
    expect(shortLabel(w, c)).toBe(`Il faut ${c.wood} bois et ${c.stone} pierre (vous avez 3 bois et 50 pierre)`);
    w.wood = 100;
    expect(canPay(w, c)).toBe(true);
    pay(w, c);
    expect(w.wood).toBe(100 - c.wood);
    expect(w.stone).toBe(50 - c.stone);
  });
});

describe('nourriture, croissance et expéditions', () => {
  beforeAll(() => setMapSize(96));

  it('chaque habitant mange une part, plus une de réserve ; personne ne quitte le village faute de manger', () => {
    for (const d of DIFFICULTIES) {
      const w = flatWorld(d);
      put(w, [['house', 4], ['house', 4], ['well', 4]]);
      const sim = new Sim(w);
      sim.recalc();
      sim.pop = 20;
      sim.update(0, 1);
      expect(sim.food.demand).toBe(21);
      for (let i = 0; i < 50; i++) sim.update(1, 1);
      expect(sim.pop).toBe(20);
    }
  });

  it('le risque des expéditions ne dépend pas du mode', () => {
    const c = MISSIONS[0].choices[0];
    const risk = (d: Difficulty) => { const w = flatWorld(d); return new Expeditions(w, new Agents(w), () => 100).riskOf(c); };
    expect(risk('normal')).toBe(c.risk);
    expect(risk('sandbox')).toBe(c.risk);
  });
});

describe('sauvegarde et mode de jeu', () => {
  beforeAll(() => setMapSize(96));

  it('le mode se sauvegarde avec la partie ; une ancienne sauvegarde se relit en normal', () => {
    for (const d of DIFFICULTIES) {
      const w = flatWorld(d), r = new World();
      r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
      expect(r.difficulty).toBe(d);
    }
    const { difficulty, ...old } = flatWorld('sandbox').toJSON();
    void difficulty;
    const r = new World();
    r.difficulty = 'sandbox';
    r.fromJSON(old);
    expect(r.difficulty).toBe('normal');
    expect(readDifficulty('nimporte')).toBe('normal');
  });

  it('une partie en « Défi » (mode retiré) se reprend en normal, et tout le village compte pour l’âge suivant', () => {
    // un village antique qui a de quoi passer au Moyen Âge, sauvegardé en défi avec les bâtiments retenus à l'entrée dans l'âge
    const w = flatWorld('normal');
    put(w, [...Array.from({ length: 12 }, () => ['house', 1] as [KindId, number]), ['farm', 1], ['well', 1], ['workshop', 1], ['workshop', 1], ['gather', 1], ['temple', 1]]);
    const save = JSON.parse(JSON.stringify(w.toJSON()));
    save.difficulty = 'challenge';
    save.ageBase = { house: 12, workshop: 2, gather: 1, temple: 1 };
    const r = new World();
    expect(() => r.fromJSON(save)).not.toThrow();
    expect(r.difficulty).toBe('normal');
    expect(r.unlimited).toBe(false);
    // les bâtiments retenus ne s'oublient pas seulement : ils ne se réécrivent plus
    expect('ageBase' in r.toJSON()).toBe(false);
    const sim = new Sim(r);
    sim.age = 1;
    sim.recalc();
    const house = sim.ageProgress()!.items.find((i) => i.kind === 'house')!;
    expect(house).toMatchObject({ label: 'Maison antique', have: 12, need: AGES[2].reqKinds.house });
  });
});

describe('passage d’âge', () => {
  it('chaque âge demande ce qu’il demande, tout le village compte', () => {
    for (let n = 1; n < AGES.length; n++) expect(reqKindsOf(n)).toEqual(AGES[n].reqKinds);
    for (let n = 1; n < AGES.length; n++) expect(reqKindsOf(n, true)).toEqual(AGES[n].reqLate ?? {});
  });
});

describe('équipement des expéditions', () => {
  beforeAll(() => setMapSize(96));
  const expOf = (w: World) => new Expeditions(w, new Agents(w), () => 100);

  it('seul le métal se paie, en minerai', () => {
    for (const g of GEAR) expect(gearCost(g)).toEqual({ wood: 0, stone: 0, ore: g.ore });
    expect(gearCostLabel(gearCost(GEAR_BY.sword))).toBe('1 minerai');
    expect(gearCostLabel(gearCost(GEAR_BY.bow))).toBe('');
  });

  it('les pièces sans métal restent gratuites et le métal se paie en minerai', () => {
    const w = flatWorld('normal'), ex = expOf(w);
    put(w, [['workshop', 2]]);
    w.wood = 10; w.stone = 5; w.ore = 0;
    expect(ex.craft('spear', 0)).toBe(true);
    expect([w.wood, w.stone]).toEqual([10, 5]);
    expect(ex.whyCraft(GEAR_BY.sword, 2)).toBe('Il faut 1 minerai');
    w.ore = 3;
    expect(ex.craft('sword', 2)).toBe(true);
    expect(w.ore).toBe(2);
    ex.cancelCraft(1);
    expect(w.ore).toBe(3);
  });
});

describe('un bâtiment posé avant d’être demandé compte déjà', () => {
  beforeAll(() => setMapSize(96));

  it('pour l’âge suivant : le moulin et l’hôpital bâtis en avance, la place du village', () => {
    const w = flatWorld('normal');
    put(w, [['house', 0], ['house', 0], ['house', 0], ['house', 0], ['farm', 0], ['well', 0], ['workshop', 0], ['mill', 0], ['health', 0], ['gather', 0]]);
    w.exp.done.push(...mandatoriesFor(0).map((m) => m.id));
    const sim = new Sim(w);
    sim.recalc();
    sim.pop = AGES[1].reqPop;
    expect(sim.advance()).toBe(true);
    // au Moyen Âge, ce que l'âge industriel demande et qui est déjà là
    sim.age = 2;
    sim.recalc();
    const item = (k: KindId) => sim.ageProgress()!.items.find((i) => i.kind === k)!;
    expect(item('mill').have).toBe(1);
    expect(item('health').have).toBe(1);
    expect(item('gather').have).toBe(1);
    expect(sim.built('gather')).toBe(1);
  });

  it('pour une expédition : le cosmodrome déjà là ; une gare devenue gare centrale reste une gare', () => {
    const w = flatWorld('normal');
    put(w, [['house', 2], ['terminal', 3]]);
    const ex = new Expeditions(w, new Agents(w), () => 100);
    expect(ex.has('station')).toBe(true);
    expect(ex.has('terminal')).toBe(true);
    expect(ex.has('maglev')).toBe(false);
    const moon = MISSIONS.find((m) => m.requires?.kinds?.includes('spaceport'))!;
    expect(ex.missing(moon).some((s) => /cosmodrome|spatio/i.test(s))).toBe(true);
    put(w, [['spaceport', 5]]);
    expect(ex.missing(moon).some((s) => /cosmodrome|spatio/i.test(s))).toBe(false);
  });
});
