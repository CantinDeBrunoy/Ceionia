import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize, VEG_FIELD } from '../src/world/world';
import { findPlots } from '../src/sim/fields';
import { Sim } from '../src/sim/sim';
import { KINDS, KindId, DECOR, DECOR_JOY_MAX, isDecor, hasDoor } from '../src/build/catalog';
import { linearMask } from '../src/build/decor';
import { WALL_N, WALL_E, WALL_S, WALL_W } from '../src/render/hellBase';
import { costOf } from '../src/sim/economy';
import { getModel } from '../src/render/models';

/** Un monde plat, et des bâtiments posés à la main */
function flat() {
  const w = new World();
  w.heights.fill(1);
  return w;
}
const put = (w: World, kind: KindId, x: number, z: number, age = 0, rot = 0) => { const id = w.nextId++; w.buildings.set(id, { id, kind, x, z, rot, auto: false, age }); w.occ[w.ci(x, z)] = id; return id; };

describe('décorations', () => {
  beforeAll(() => setMapSize(96));

  it('sept décorations d’une case, sans porte, au rayon Décorations, presque gratuites', () => {
    for (const k of DECOR) {
      expect(KINDS[k].size).toBe(1);
      expect(KINDS[k].cat).toBe('deco');
      expect(hasDoor(k)).toBe(false);
      expect(isDecor(k)).toBe(true);
      expect(costOf(k, 2, 'easy')).toBeNull();
      const n = costOf(k, 2, 'normal')!;
      expect(n.wood + n.stone).toBeLessThanOrEqual(costOf('house', 2, 'normal')!.wood);
    }
    expect(KINDS.lamp.cat).toBe('deco');
  });

  it('un modèle par âge, qui tient sous le plafond d’une case', () => {
    for (const k of DECOR) for (let a = 0; a < 6; a++) {
      const m = getModel(k, a, { v: 1, L: false, R: false, F: true });
      expect(m.body.attributes.position.count / 3).toBeLessThan(3000);
    }
  });

  it('haies et clôtures se raccordent à leurs voisines de même genre', () => {
    const w = flat();
    put(w, 'hedge', 20, 20); put(w, 'hedge', 21, 20); put(w, 'hedge', 21, 21); put(w, 'fence', 19, 20);
    const at = (x: number, z: number) => w.buildingAt(x, z)!;
    // au bout d'une ligne : elle traverse sa case ; à l'angle : est et sud ; une clôture voisine ne compte pas
    expect(linearMask(w, at(20, 20))).toBe(WALL_E | WALL_W);
    expect(linearMask(w, at(21, 20))).toBe(WALL_W | WALL_S);
    expect(linearMask(w, at(21, 21))).toBe(WALL_N | WALL_S);
    // seule, elle suit le sens qu'on lui donne
    expect(linearMask(w, { kind: 'hedge', x: 40, z: 40, rot: 1 })).toBe(WALL_N | WALL_S);
  });

  it('un petit bien-être, plafonné toutes ensemble', () => {
    const w = flat(), sim = new Sim(w);
    sim.recalc();
    const base = sim.joy.cap;
    for (let i = 0; i < 40; i++) put(w, 'fountain', 2 + (i % 20) * 2, 30 + Math.floor(i / 20) * 2);
    sim.recalc();
    expect(sim.joy.cap - base).toBeCloseTo(DECOR_JOY_MAX);
    expect(sim.needDetail('joy').rows.some((r) => r.v === DECOR_JOY_MAX)).toBe(true);
  });

  it('se pose, se sauvegarde et se recharge', () => {
    const w = flat();
    expect(w.canPlace('statue', 30, 30)).toBeNull();
    w.place('statue', 30, 30, 2, false, 3, false);
    w.place('paving', 31, 30, 0, false, 3, false);
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    const kinds = [...back.buildings.values()].map((b) => b.kind).sort();
    expect(kinds).toEqual(['statue']);
    expect(back.buildingAt(30, 30)?.rot).toBe(2);
    expect(back.paving[back.ci(31, 30)]).toBe(1);
  });
});

describe('pavés : un habillage du sol', () => {
  beforeAll(() => setMapSize(96));

  it('une case pavée n’est pas un bâtiment : on bâtit, pose une décoration ou trace une route par-dessus', () => {
    const w = flat();
    w.place('paving', 20, 20, 0, false, 2, false);
    w.place('paving', 21, 20, 0, false, 2, false);
    expect(w.buildings.size).toBe(0);
    expect(w.occ[w.ci(20, 20)]).toBe(0);
    expect(w.canPlace('paving', 20, 20)).toBe('Déjà pavé');
    expect(w.canPlace('fountain', 20, 20)).toBeNull();
    w.place('fountain', 20, 20, 0, false, 2, false);
    expect(w.canRoad(21, 20)).toBe(true);
    w.setRoad(21, 20, true);
    // le pavé reste dessous
    expect(w.paving[w.ci(20, 20)]).toBe(1);
    expect(w.paving[w.ci(21, 20)]).toBe(1);
    // et sous un bâtiment déjà posé, on peut encore paver
    w.place('house', 30, 30, 0, false, 2, false);
    expect(w.canPlace('paving', 30, 30)).toBeNull();
  });

  it('Ctrl+Z : la prise de vue du monde garde les pavés', () => {
    const w = flat(), before = w.snapshot();
    w.setPaving(10, 10, true);
    expect(w.paving[w.ci(10, 10)]).toBe(1);
    w.restore(before);
    expect(w.paving[w.ci(10, 10)]).toBe(0);
  });

  it('les anciennes sauvegardes : un pavé posé comme une décoration devient une case pavée, les lignes de train gardent leurs arrêts', () => {
    const w = flat();
    w.place('statue', 40, 40, 0, false, 1, false);
    const d = JSON.parse(JSON.stringify(w.toJSON()));
    d.buildings.unshift(['paving', 41, 40, 0, 0, 1], ['paving', 42, 40, 0, 0, 1]);
    const back = new World();
    back.fromJSON(d);
    expect([...back.buildings.values()].map((b) => b.kind)).toEqual(['statue']);
    expect(back.paving[back.ci(41, 40)] + back.paving[back.ci(42, 40)]).toBe(2);
    expect(back.toJSON().paving).toEqual([back.ci(41, 40), back.ci(42, 40)]);
  });
});

describe('décorations dans un champ', () => {
  beforeAll(() => setMapSize(96));

  it('une décoration posée dans le blé laisse le champ (et sa récolte), sa démolition le rend intact ; un bâtiment le retire', () => {
    const w = flat();
    for (let x = 10; x < 16; x++) for (let z = 10; z < 14; z++) w.veg[w.ci(x, z)] = VEG_FIELD;
    const sim = new Sim(w);
    sim.recalc();
    const food = sim.food.cap;
    const fence = w.place('fence', 11, 11, 0, false, 2, false), bench = w.place('bench', 13, 12, 0, false, 2, false);
    expect(w.veg[w.ci(11, 11)]).toBe(VEG_FIELD);
    expect(w.veg[w.ci(13, 12)]).toBe(VEG_FIELD);
    sim.recalc();
    expect(sim.food.cap).toBe(food);
    w.removeBuilding(fence.id); w.removeBuilding(bench.id);
    expect(w.veg[w.ci(11, 11)]).toBe(VEG_FIELD);
    w.place('house', 14, 10, 0, false, 2, false);
    expect(w.veg[w.ci(14, 10)]).toBe(0);
  });

  it('les bras des champs ne travaillent pas la case d’une décoration (les parcelles la contournent)', () => {
    const w = flat();
    for (let x = 10; x < 16; x++) w.veg[w.ci(x, 10)] = VEG_FIELD;
    w.place('statue', 12, 10, 0, false, 2, false);
    const cells = findPlots(w).flatMap((p) => p.cells);
    expect(cells).not.toContain(w.ci(12, 10));
    expect(cells).toContain(w.ci(11, 10));
  });
});
