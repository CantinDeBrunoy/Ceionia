import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { KINDS, KindId, Building } from '../src/build/catalog';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { newArmy, recruit, recruitWhy, onlyGearMissing, gearToCraft, troopKit, TROOP_KINDS, TROOPS, RecruitCtx } from '../src/sim/army';
import { GEAR_BY, GearId } from '../src/sim/gear';
import { troopGearNeeded } from '../src/sim/army';
import { Difficulty } from '../src/sim/difficulty';

/** Recruter au Moyen Âge : l'équipement manquant se fabrique (même les pièces « dépassées »), puis la recrue part */

function village(d: Difficulty, kinds: KindId[]) {
  const w = new World();
  w.difficulty = d;
  w.heights.fill(1);
  let x = 10;
  for (const kind of kinds) {
    const b: Building = { id: w.nextId++, kind, x, z: 10, rot: 0, auto: true, age: 2 };
    w.buildings.set(b.id, b);
    x += KINDS[kind].size + 1;
  }
  return w;
}

describe('Moyen Âge : recruter puis fabriquer l’équipement', () => {
  beforeAll(() => setMapSize(96));
  const AGE = 2;

  for (const d of ['easy', 'normal'] as Difficulty[]) for (const kind of ['soldier', 'archer', 'knight'] as const) {
    it(`${d} : ${kind}, l’équipement se fabrique puis la recrue part`, () => {
      const w = village(d, ['workshop']);
      w.wood = 200; w.stone = 200; w.ore = 50;
      const ex = new Expeditions(w, new Agents(w), () => 100);
      const army = newArmy();
      const ctx = (): RecruitCtx => ({ age: AGE, pop: 80, barracks: 1, stock: w.exp.gear });
      expect(recruitWhy(army, kind, ctx())).toMatch(/il faut/);
      expect(onlyGearMissing(army, kind, ctx())).toBe(true);
      const list = gearToCraft(kind, w.exp.gear, w.exp.craft, [], AGE);
      expect(list.length).toBe(troopKit(kind, AGE).gear.length);
      for (const g of list) {
        expect(ex.whyCraft(GEAR_BY[g], AGE), g).toBeNull();
        expect(ex.craft(g, AGE), g).toBe(true);
      }
      for (let i = 0; i < 4000 && w.exp.craft.length; i++) ex.update(0.5);
      expect(w.exp.craft).toEqual([]);
      expect(recruitWhy(army, kind, ctx())).toBeNull();
      expect(recruit(army, kind, ctx())).toBeNull();
      expect(army.queue.length).toBe(1);
    });
  }

  it('sans atelier, le refus dit précisément ce qui manque (atelier, puis minerai)', () => {
    const w = village('normal', []);
    w.wood = 200; w.stone = 200; w.ore = 0;
    const ex = new Expeditions(w, new Agents(w), () => 100);
    expect(ex.whyCraft(GEAR_BY.sword, AGE)).toMatch(/atelier/i);
    const w2 = village('normal', ['workshop']);
    const ex2 = new Expeditions(w2, new Agents(w2), () => 100);
    expect(ex2.whyCraft(GEAR_BY.sword, AGE)).toBe('Il faut 1 minerai');
  });

  it('le lot de pièces du chevalier se commande en entier ou pas du tout (minerai, file)', () => {
    const w = village('easy', ['workshop']);
    w.ore = 2;
    const ex = new Expeditions(w, new Agents(w), () => 100);
    // épée (1 minerai) + armure (2 minerai) : 3 minerai en tout
    expect(ex.whyCraftAll(['sword', 'armor'], AGE)).toBe('Il faut 3 minerai en tout pour épée et armure');
    w.ore = 3;
    expect(ex.whyCraftAll(['sword', 'armor'], AGE)).toBeNull();
    w.exp.craft.push('spear', 'spear', 'spear', 'spear', 'spear');
    expect(ex.whyCraftAll(['sword', 'armor'], AGE)).toMatch(/file de fabrication est pleine/);
  });

  it('les pièces « dépassées » que les troupes exigent (lance, arc) sont signalées comme nécessaires au Moyen Âge', () => {
    const need = troopGearNeeded(AGE);
    for (const g of ['spear', 'bow', 'sword', 'armor'] as GearId[]) expect(need.has(g), g).toBe(true);
    expect(need.has('plasma')).toBe(false);
  });

  it('toute pièce dont une troupe de l’âge a besoin reste fabricable à chaque âge (avec l’atelier)', () => {
    for (let age = 1; age <= 5; age++) {
      const w = village('normal', ['workshop']);
      w.wood = 500; w.stone = 500; w.ore = 500; w.fuel = 500;
      const ex = new Expeditions(w, new Agents(w), () => 100);
      for (const k of TROOP_KINDS) if (age >= TROOPS[k].age) for (const g of troopKit(k, age).gear as GearId[]) expect(ex.whyCraft(GEAR_BY[g], age), `${k} ${g} âge ${age}`).toBeNull();
    }
  });
});
