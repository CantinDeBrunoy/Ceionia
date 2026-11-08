import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { Sim, reqKindsOf } from '../src/sim/sim';
import { AGES, KINDS, KindId, Building } from '../src/build/catalog';
import { costOf, priceIn, canPay, pay, shortLabel, PRODUCERS } from '../src/sim/economy';
import { DIFFICULTY, DIFFICULTIES, Difficulty, readDifficulty, DIFF_VERSION, DEFAULT_DIFFICULTY } from '../src/sim/difficulty';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { MISSIONS, mandatoriesFor } from '../src/sim/missions';
import { GEAR, GEAR_BY, gearCost, gearCostLabel } from '../src/sim/gear';

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
  it('en Facile, rien ne change : petits bâtiments gratuits, grands au barème habituel', () => {
    for (const k of ALL) if (KINDS[k].size < 2) expect(costOf(k, 4, 'easy')).toBeNull();
    expect(costOf('workshop', 0)).toEqual({ wood: 8, stone: 6 });
    expect(costOf('workshop', 3, 'easy')).toEqual({ wood: 20, stone: 18 });
    expect(costOf('pen', 2, 'easy')).toEqual({ wood: 16, stone: 4 });
    // un bâtiment pas encore de son âge se paie à son âge d'apparition
    expect(costOf('airport', 0, 'easy')).toEqual(costOf('airport', 4, 'easy'));
  });

  it('en Normal, chaque bâtiment se paie en bois et en pierre, à chaque âge', () => {
    for (const k of ALL) for (let a = 0; a < 5; a++) {
      const c = costOf(k, a, 'normal');
      expect(c, `${k} à l’âge ${a}`).not.toBeNull();
      expect(c!.wood).toBeGreaterThan(0);
      expect(c!.stone).toBeGreaterThan(0);
    }
  });

  it('en Normal, tout coûte plus cher qu’en Facile', () => {
    for (const k of ALL) for (let a = 0; a < 5; a++) {
      const n = costOf(k, a, 'easy'), c = costOf(k, a, 'normal')!;
      if (!n) continue;
      expect(c.wood).toBeGreaterThanOrEqual(n.wood);
      expect(c.stone).toBeGreaterThanOrEqual(n.stone);
      expect(total(c)).toBeGreaterThan(total(n));
    }
  });

  it('en Normal, le prix grandit avec l’emprise et avec l’âge', () => {
    // à âge égal : une case, 2 × 2, 3 × 3, 4 × 4
    const bySize = (['house', 'workshop', 'harbor', 'airport'] as KindId[]).map((k) => total(costOf(k, 4, 'normal')));
    for (let i = 1; i < bySize.length; i++) expect(bySize[i]).toBeGreaterThan(bySize[i - 1]);
    for (const k of ['house', 'farm', 'workshop', 'temple'] as KindId[])
      for (let a = Math.max(1, KINDS[k].minAge + 1); a < 5; a++) expect(total(costOf(k, a, 'normal'))).toBeGreaterThan(total(costOf(k, a - 1, 'normal')));
  });

  it('en Normal, le premier bûcheron et la première carrière sont offerts (on ne reste jamais sans rien pour bâtir)', () => {
    for (const k of PRODUCERS) {
      expect(costOf(k, 0, 'normal', 0)).toBeNull();
      expect(costOf(k, 0, 'normal', 1)).not.toBeNull();
    }
    const w = flatWorld('normal');
    expect(priceIn(w, 'lumber', 0)).toBeNull();
    put(w, [['lumber', 0]]);
    expect(priceIn(w, 'lumber', 0)).not.toBeNull();
    expect(priceIn(w, 'quarry', 0)).toBeNull();
  });

  it('au bac à sable rien ne se paie ; en Normal, le réglage « ressources illimitées » ne joue pas', () => {
    const s = flatWorld('sandbox');
    expect(s.unlimited).toBe(true);
    for (const k of ALL) expect(priceIn(s, k, 4)).toBeNull();
    const c = flatWorld('normal');
    c.unlimited = true;
    expect(c.unlimited).toBe(false);
    expect(priceIn(c, 'house', 0)).not.toBeNull();
    // en Facile, le réglage décide
    const n = flatWorld('easy');
    expect(priceIn(n, 'workshop', 0)).toEqual({ wood: 8, stone: 6 });
    n.unlimited = true;
    expect(priceIn(n, 'workshop', 0)).toBeNull();
    expect(n.unlimitedSetting).toBe(true);
  });

  it('payer retire le prix ; sans de quoi payer, le refus dit ce qui manque', () => {
    const w = flatWorld('normal');
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

  it('en Normal, chaque habitant mange plus', () => {
    for (const d of DIFFICULTIES) {
      const sim = hungry(d, 10);
      sim.update(0, 1);
      // en parts entières : 13,75 parts se comptent 14
      expect(sim.food.demand).toBe(Math.ceil(11 * DIFFICULTY[d].foodK));
    }
    expect(DIFFICULTY.normal.foodK).toBeGreaterThan(1);
    expect(DIFFICULTY.easy.foodK).toBe(1);
  });

  it('la disette fait partir des habitants en Normal seulement ; personne ne part en Facile ni au bac à sable', () => {
    for (const d of ['easy', 'sandbox'] as Difficulty[]) {
      const sim = hungry(d, 20);
      for (let i = 0; i < 50; i++) sim.update(1, 1);
      expect(sim.pop).toBe(20);
    }
    const sim = hungry('normal', 20);
    for (let i = 0; i < 50; i++) sim.update(1, 1);
    expect(sim.pop).toBeLessThan(20);
    expect(sim.pop).toBeGreaterThan(0);
    expect(sim.fled).toBeGreaterThan(1);
    expect(sim.message.startsWith('Disette')).toBe(true);
  });

  it('en Normal, plus le manque est grand, plus il en part', () => {
    const none = hungry('normal', 20), some = hungry('normal', 20, [['farm', 0]]);
    for (let i = 0; i < 30; i++) { none.update(1, 1); some.update(1, 1); }
    expect(some.pop).toBeGreaterThan(none.pop);
  });

  it('en Normal, le village grandit moins vite, et plus lentement encore après un manque', () => {
    const grow = (sim: Sim, s: number) => { const p0 = sim.pop; for (let i = 0; i < s * 4; i++) sim.update(0.25, 1); return sim.pop - p0; };
    const normal = grow(thriving('easy'), 16), challenge = grow(thriving('normal'), 16);
    expect(challenge).toBeLessThan(normal);
    expect(challenge).toBeGreaterThan(0);
    // un manque (plus d'eau) : le village met du temps à s'en remettre
    const sim = thriving('normal'), w = (sim as unknown as { world: World }).world;
    const well = [...w.buildings.values()].find((b) => b.kind === 'well')!;
    w.buildings.delete(well.id);
    sim.recalc(); sim.update(1, 1);
    expect(sim.water.ok).toBe(false);
    expect(sim.recovering).toBe(DIFFICULTY.normal.recoverT);
    w.buildings.set(well.id, well);
    sim.recalc();
    const after = grow(sim, 16);
    expect(after).toBeLessThan(challenge);
    expect(sim.recovering).toBeGreaterThan(0);
    // en Facile, aucune séquelle
    const n = thriving('easy'), wn = (n as unknown as { world: World }).world;
    wn.buildings.clear(); n.recalc(); n.update(1, 1);
    expect(n.recovering).toBe(0);
  });
});

describe('expéditions et sauvegarde selon la difficulté', () => {
  beforeAll(() => setMapSize(96));

  it('les expéditions sont plus risquées en Normal, inchangées ailleurs', () => {
    const c = MISSIONS[0].choices[0];
    const risk = (d: Difficulty) => { const w = flatWorld(d); return new Expeditions(w, new Agents(w), () => 100).riskOf(c); };
    expect(risk('easy')).toBe(c.risk);
    expect(risk('sandbox')).toBe(c.risk);
    expect(risk('normal')).toBeCloseTo(c.risk * DIFFICULTY.normal.riskK, 9);
    expect(risk('normal')).toBeGreaterThan(risk('easy'));
  });

  it('la difficulté se sauvegarde avec la partie, avec sa version', () => {
    for (const d of DIFFICULTIES) {
      const w = flatWorld(d), r = new World();
      const json = JSON.parse(JSON.stringify(w.toJSON()));
      expect(json.diffV).toBe(DIFF_VERSION);
      r.fromJSON(json);
      expect(r.difficulty).toBe(d);
    }
  });

  it('le tutoriel reste jouable en Normal : ses six bâtiments se paient avec la réserve de départ (bûcheron et carrière offerts)', () => {
    const r = DIFFICULTY.normal;
    let wood = r.startWood, stone = r.startStone;
    for (const k of ['gather', 'house', 'well', 'farm', 'lumber', 'quarry'] as KindId[]) {
      const c = costOf(k, 0, 'normal', PRODUCERS.includes(k) ? 0 : 1);
      wood -= c?.wood ?? 0; stone -= c?.stone ?? 0;
      expect(wood, k).toBeGreaterThanOrEqual(0);
      expect(stone, k).toBeGreaterThanOrEqual(0);
    }
  });

  it('une sauvegarde d’avant le changement de noms : « normal » se relit en facile, le Défi en normal', () => {
    // sans marqueur de version : « normal » était le mode facile, « challenge » le défi (aujourd'hui Normal)
    expect(readDifficulty('normal')).toBe('easy');
    expect(readDifficulty('challenge')).toBe('normal');
    expect(readDifficulty('defi')).toBe('normal');
    expect(readDifficulty('sandbox')).toBe('sandbox');
    expect(readDifficulty(undefined)).toBe('easy');
    expect(readDifficulty('nimporte')).toBe('easy');
    // avec le marqueur : les noms d'aujourd'hui, Normal pour une valeur inconnue
    for (const d of DIFFICULTIES) expect(readDifficulty(d, DIFF_VERSION)).toBe(d);
    expect(readDifficulty('nimporte', DIFF_VERSION)).toBe(DEFAULT_DIFFICULTY);
    expect(DEFAULT_DIFFICULTY).toBe('normal');
    // par la sauvegarde du monde
    const { difficulty, diffV, ...old } = flatWorld('normal').toJSON();
    void difficulty; void diffV;
    for (const [was, now] of [['normal', 'easy'], ['challenge', 'normal'], ['sandbox', 'sandbox']] as const) {
      const r = new World();
      r.fromJSON({ ...old, difficulty: was });
      expect(r.difficulty).toBe(now);
    }
    const r = new World();
    r.fromJSON(old);
    expect(r.difficulty).toBe('easy');
  });
});

describe('passage d’âge en Normal', () => {
  beforeAll(() => setMapSize(96));

  const many = (kind: KindId, n: number, age = 0) => Array.from({ length: n }, () => [kind, age] as [KindId, number]);
  /** Un village préhistorique qui a tout pour l'Antiquité, et bien plus : douze huttes, trois ateliers, deux feux de camp… */
  function stocked(d: Difficulty) {
    const w = flatWorld(d);
    put(w, [...many('house', 12), ['farm', 0], ['well', 0], ...many('workshop', 3), ...many('gather', 2), ['health', 0], ['school', 0]]);
    w.exp.done.push(...mandatoriesFor(0).map((m) => m.id));
    const sim = new Sim(w);
    sim.recalc();
    sim.pop = AGES[1].reqPop;
    return { w, sim };
  }
  const kinds = (sim: Sim) => sim.ageProgress()!.items.filter((i) => i.kind);

  /** Un village préhistorique qui a tout juste ce que demande l'Antiquité */
  function exact(d: Difficulty) {
    const w = flatWorld(d);
    put(w, [...many('house', 4), ['farm', 0], ['well', 0], ['workshop', 0]]);
    w.exp.done.push(...mandatoriesFor(0).map((m) => m.id));
    const sim = new Sim(w);
    sim.recalc();
    sim.pop = AGES[1].reqPop;
    return { w, sim };
  }

  it('en Normal, les bâtiments qui ont servi aux âges d’avant ne comptent plus ; ceux bâtis en avance comptent déjà', () => {
    const { sim: tight } = exact('normal');
    expect(tight.advance()).toBe(true);
    for (const i of kinds(tight)) expect(i.have, i.label).toBe(0);
    const { sim } = stocked('normal');
    expect(sim.advance()).toBe(true);
    expect(sim.age).toBe(1);
    const items = kinds(sim), of = (k: KindId) => items.find((i) => i.kind === k)!;
    expect(items.length).toBeGreaterThan(0);
    // douze huttes, dont quatre demandées par l'Antiquité : les huit autres, bâties en avance, comptent pour le Moyen Âge ;
    // de même deux des trois ateliers, et les deux feux de camp (que l'Antiquité ne demandait pas) ; aucun lieu de culte
    expect(of('house').have).toBe(8);
    expect(of('workshop').have).toBe(2);
    expect(of('gather').have).toBe(2);
    expect(of('temple').have).toBe(0);
    // le libellé le dit : ce sont des bâtiments à bâtir en plus
    expect(of('house').label).toBe('Maison antique (en plus)');
    // en Facile, comme avant : tout le village compte, des conditions sont cochées d'office
    const n = stocked('easy');
    expect(n.sim.advance()).toBe(true);
    expect(kinds(n.sim).find((i) => i.kind === 'house')).toMatchObject({ label: 'Maison antique', have: 12, need: AGES[2].reqKinds.house });
    expect(kinds(n.sim).filter((i) => i.have >= i.need).length).toBeGreaterThan(0);
  });

  it('en Normal, ce qu’on bâtit dans l’âge compte ; déplacer un ancien bâtiment ne compte pas', () => {
    const { w, sim } = exact('normal');
    sim.advance();
    const house = () => kinds(sim).find((i) => i.kind === 'house')!;
    // l'Antiquité demandait 4 maisons, le Moyen Âge 8 : 4 de plus
    expect(house().need).toBe(4);
    // un ancien bâtiment déplacé (retiré puis reposé) reste un ancien bâtiment
    const old = [...w.buildings.values()].find((b) => b.kind === 'house')!;
    w.buildings.delete(old.id);
    w.buildings.set(w.nextId, { ...old, id: w.nextId++, x: 70, age: 1 });
    sim.recalc();
    expect(house().have).toBe(0);
    put(w, many('house', 3, 1));
    sim.recalc();
    expect(house().have).toBe(3);
    put(w, many('house', 1, 1));
    sim.recalc();
    expect(house()).toMatchObject({ have: 4, need: 4 });
    // démolir une maison : il en manque de nouveau une
    const last = [...w.buildings.values()].filter((b) => b.kind === 'house').pop()!;
    w.buildings.delete(last.id);
    sim.recalc();
    expect(house().have).toBe(3);
  });

  it('en Normal, chaque âge ne demande que ce qu’il exige de plus que les âges d’avant ; au plus juste, on bâtit autant qu’en Facile', () => {
    for (let n = 1; n < AGES.length; n++) expect(reqKindsOf(n, 'easy')).toEqual(AGES[n].reqKinds);
    expect(reqKindsOf(1, 'normal')).toEqual(AGES[1].reqKinds);
    // l'église et le château, déjà exigés à l'âge d'avant, ne sont plus des conditions cochées d'office
    expect(reqKindsOf(3, 'normal').temple).toBeUndefined();
    expect(reqKindsOf(4, 'normal').landmark).toBeUndefined();
    expect(reqKindsOf(3, 'normal').house).toBe(AGES[3].reqKinds.house! - AGES[2].reqKinds.house!);
    for (const k of Object.keys(KINDS) as KindId[]) {
      let sum = 0, most = 0;
      for (let n = 1; n < AGES.length; n++) {
        const c = reqKindsOf(n, 'normal')[k] ?? 0;
        expect(c).toBeGreaterThanOrEqual(0);
        sum += c;
        most = Math.max(most, AGES[n].reqKinds[k] ?? 0);
      }
      expect(sum, k).toBe(most);
    }
  });

  it('les bâtiments retenus au passage d’âge se sauvegardent ; une ancienne sauvegarde n’en a pas', () => {
    const { w, sim } = stocked('normal');
    sim.advance();
    expect(w.ageBase).toMatchObject({ house: 12, workshop: 3, gather: 2 });
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(r.ageBase).toEqual(w.ageBase);
    const { ageBase, ...old } = w.toJSON();
    void ageBase;
    r.fromJSON(old);
    expect(r.ageBase).toEqual({});
  });
});

describe('équipement des expéditions selon la difficulté', () => {
  beforeAll(() => setMapSize(96));
  const expOf = (w: World) => new Expeditions(w, new Agents(w), () => 100);

  it('en Normal, aucune pièce n’est gratuite ; ailleurs, seul le métal se paie, en minerai, comme avant', () => {
    for (const g of GEAR) {
      const c = gearCost(g, 'normal');
      expect(c.wood + c.stone + c.ore, g.id).toBeGreaterThan(0);
      expect(c.ore).toBe(g.ore);
      for (const d of ['easy', 'sandbox'] as Difficulty[]) expect(gearCost(g, d)).toEqual({ wood: 0, stone: 0, ore: g.ore, ...(g.fuel ? { fuel: g.fuel } : {}) });
    }
    // le bois du manche et la pierre de la pointe pour la lance ; le minerai seul pour l'épée
    expect(gearCost(GEAR_BY.spear, 'normal')).toEqual({ wood: 2, stone: 1, ore: 0 });
    expect(gearCost(GEAR_BY.sword, 'normal')).toEqual({ wood: 0, stone: 0, ore: 1 });
    expect(gearCostLabel(gearCost(GEAR_BY.spear, 'normal'))).toBe('2 bois et 1 pierre');
    expect(gearCostLabel(gearCost(GEAR_BY.sword, 'easy'))).toBe('1 minerai');
    expect(gearCostLabel(gearCost(GEAR_BY.bow, 'easy'))).toBe('');
  });

  it('en Normal, fabriquer prend le prix, annuler le rend ; sans de quoi payer, on dit ce qui manque', () => {
    const w = flatWorld('normal'), ex = expOf(w);
    w.wood = 10; w.stone = 5;
    expect(ex.craft('spear', 0)).toBe(true);
    expect([w.wood, w.stone]).toEqual([8, 4]);
    ex.cancelCraft(0);
    expect([w.wood, w.stone]).toEqual([10, 5]);
    w.wood = 1;
    expect(ex.whyCraft(GEAR_BY.spear, 0)).toBe('Il faut 2 bois et 1 pierre');
    expect(ex.craft('spear', 0)).toBe(false);
    expect(w.exp.craft).toEqual([]);
    expect([w.wood, w.stone]).toEqual([1, 5]);
  });

  it('en Facile, les pièces sans métal restent gratuites et le métal se paie en minerai', () => {
    const w = flatWorld('easy'), ex = expOf(w);
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
    for (const d of ['easy', 'normal'] as Difficulty[]) {
      const w = flatWorld(d);
      put(w, [['house', 0], ['house', 0], ['house', 0], ['house', 0], ['farm', 0], ['well', 0], ['workshop', 0], ['mill', 0], ['health', 0], ['gather', 0]]);
      w.exp.done.push(...mandatoriesFor(0).map((m) => m.id));
      const sim = new Sim(w);
      sim.recalc();
      sim.pop = AGES[1].reqPop;
      expect(sim.advance(), d).toBe(true);
      // au Moyen Âge (on y entre comme au passage d'âge), ce que l'âge industriel demande et qui est déjà là
      sim.age = 2;
      w.ageBase = { ...sim.counts };
      sim.recalc();
      const item = (k: KindId) => sim.ageProgress()!.items.find((i) => i.kind === k)!;
      expect(item('mill').have, d).toBe(1);
      expect(item('health').have, d).toBe(1);
      // la place compte comme une place (en Normal, elle a déjà servi au Moyen Âge, qui en demandait une)
      expect(item('gather').have, d).toBe(d === 'easy' ? 1 : 0);
      expect(sim.built('gather')).toBe(1);
    }
  });

  it('pour une expédition : le cosmodrome déjà là ; une gare devenue gare centrale reste une gare', () => {
    const w = flatWorld('easy');
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