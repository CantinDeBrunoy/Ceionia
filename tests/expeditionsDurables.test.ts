import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { MISSIONS, readExpState, effectSummary } from '../src/sim/missions';
import { KINDS, KindId, DECOR } from '../src/build/catalog';
import { LEGACIES, legacyOf, perkYield, perkFood, guardReach, SULFUR_MINE, TRAWL_FOOD, ISLES_FOOD, HOUND_RANGE } from '../src/sim/legacy';
import { freightBonus, FREIGHT_BONUS } from '../src/sim/freight';
import { flowOfBuilding } from '../src/sim/ledger';
import { computeCoverage, rangeOf, policeRange } from '../src/sim/coverage';
import { Patrols, HOUND_SIDE } from '../src/sim/patrols';
import { Sim } from '../src/sim/sim';
import { Parts } from '../src/render/parts';
import { pondModel, coralModel } from '../src/render/pond';
import { tr, setLang, i18nEntries } from '../src/i18n';
import '../src/i18n/en';

/**
 * Chaque expédition laisse quelque chose de durable (demande de l'auteur, nov. 2026) : un bâtiment ou une décoration à
 * bâtir, un savoir-faire (`legacy.ts`), des bêtes, un avantage pour l'archipel
 */

const perks = (...p: string[]) => ({ exp: { perks: p } });

describe('expéditions durables', () => {
  beforeAll(() => setMapSize(192));

  it('aucune expédition ne laisse rien derrière elle', () => {
    const unlocked = new Set(Object.values(KINDS).map((k) => k.reqMission).filter(Boolean));
    const lasting = new Set(['perk', 'herd', 'boon', 'diplo']);
    // (la pierre noire du volcan : ses armes d'obsidienne sont sur une autre branche, pas encore fusionnée)
    const elsewhere = new Set(['obsidian']);
    const empty = MISSIONS.filter((m) => !elsewhere.has(m.id) && !unlocked.has(m.id) && !legacyOf(m.id) && !m.choices.every((c) => c.win.some((e) => lasting.has(e.t))));
    expect(empty.map((m) => m.id)).toEqual([]);
  });

  it('chaque savoir-faire est rapporté par chaque choix réussi de sa mission, et nommé', () => {
    for (const l of LEGACIES) {
      const m = MISSIONS.find((x) => x.id === l.mission)!;
      expect(m, l.mission).toBeTruthy();
      for (const c of m.choices) expect(c.win.some((e) => e.t === 'perk' && e.id === l.perk), `${m.id} « ${c.label} »`).toBe(true);
      // (un nom en clair, pas l'identifiant, et sans point-virgule)
      const name = effectSummary([{ t: 'perk', id: l.perk }]);
      expect(name).not.toBe(l.perk);
      expect(name).not.toMatch(/;/);
    }
  });

  it('haies, statues, mares et bassins à coraux se débloquent par leur expédition, qui l’annonce', () => {
    const want: [KindId, string][] = [['hedge', 'berries'], ['statue', 'flint'], ['pond', 'fishing'], ['coralpool', 'reef']];
    for (const [k, m] of want) {
      expect(KINDS[k].reqMission).toBe(m);
      expect(MISSIONS.find((x) => x.id === m)!.unlocks).toBe(k);
      expect(DECOR).toContain(k);
    }
    // (le verrou et l'annonce restent d'accord pour tous les bâtiments débloqués)
    for (const k of Object.values(KINDS)) if (k.reqMission) expect(MISSIONS.find((x) => x.id === k.reqMission)?.unlocks, k.id).toBe(k.id);
  });

  it('une ancienne partie qui a déjà réussi ces expéditions en reçoit les savoir-faire au chargement', () => {
    const s = readExpState({ done: ['ascent', 'wolf', 'rocket', 'herd'], perks: ['seeds'] });
    expect(s.perks).toEqual(expect.arrayContaining(['seeds', 'sulfur', 'hounds', 'satellites']));
    expect(s.perks).not.toContain('trawlers');
    // relue deux fois, rien en double
    const again = readExpState({ done: s.done, perks: s.perks });
    expect(again.perks.filter((p) => p === 'sulfur').length).toBe(1);
  });

  it('les effets chiffrés : mines, briqueteries, gares de marchandises, pêche, fermes marines, garde', () => {
    expect(perkYield(perks(), 'mine')).toBe(1);
    expect(perkYield(perks('sulfur'), 'mine')).toBe(SULFUR_MINE);
    expect(perkYield(perks('coalfire'), 'brickworks')).toBeGreaterThan(1);
    expect(freightBonus(perks())).toBe(FREIGHT_BONUS);
    expect(freightBonus(perks('railfast'))).toBe(1);
    expect(perkFood(perks('trawlers'), 'fishmarket')).toBe(TRAWL_FOOD);
    expect(perkFood(perks('trawlers'), 'farm')).toBe(1);
    expect(perkFood(perks('cropisles'), 'offshore')).toBe(ISLES_FOOD);
    expect(guardReach(perks('hounds'))).toBe(HOUND_RANGE);
    expect(rangeOf({ kind: 'police', age: 3 }, guardReach(perks('hounds')))).toBe(policeRange(3) + HOUND_RANGE);
    expect(rangeOf({ kind: 'fire', age: 3 }, HOUND_RANGE)).toBe(rangeOf({ kind: 'fire', age: 3 }));
  });

  it('dans le village : la mine rapporte plus, la garde porte plus loin, le port nourrit davantage', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const [sx, sz] = w.startSpot();
    for (let z = sz - 30; z <= sz + 30; z++) for (let x = sx - 30; x <= sx + 30; x++) if (w.inCells(x, z)) w.heights[z * (N + 1) + x] = 1.5;
    for (let z = sz - 30; z < sz + 30; z++) for (let x = sx - 30; x < sx + 30; x++) if (w.inCells(x, z)) w.veg[w.ci(x, z)] = 0;
    const mine = w.place('mine', sx, sz, 0, true, 2, false);
    const before = flowOfBuilding(w, mine).ore ?? 0;
    w.exp.perks.push('sulfur');
    expect(flowOfBuilding(w, mine).ore).toBeCloseTo(before * SULFUR_MINE);
    // une tour de garde, une maison un peu trop loin pour elle : les chiens la couvrent
    const tower = w.place('watchtower', sx + 6, sz, 0, true, 2, false);
    const far = Math.ceil(policeRange(2)) + 2;
    const home = w.place('house', tower.x + far, tower.z, 0, true, 2, false);
    w.exp.perks = [];
    expect(computeCoverage([tower, home], guardReach(w)).police).toBe(0);
    w.exp.perks.push('hounds');
    expect(computeCoverage([tower, home], guardReach(w)).police).toBe(1);
    // la halle aux poissons : 30 % de nourriture en plus avec les chalutiers
    const sim = new Sim(w);
    const fish = KINDS.fishmarket.food?.[2] ?? 0;
    expect(fish).toBeGreaterThan(0);
    w.buildings.clear();
    w.buildings.set(1, { ...mine, id: 1, kind: 'fishmarket', age: 2 });
    sim.recalc();
    const plain = sim.food.cap;
    w.exp.perks.push('trawlers');
    sim.recalc();
    expect(sim.food.cap - plain).toBeCloseTo(fish * (TRAWL_FOOD - 1));
  });

  it('le chien de garde trotte au pied du meneur de chaque patrouille', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const [sx, sz] = w.startSpot();
    for (let z = sz - 6; z <= sz + 8; z++) for (let x = sx - 6; x <= sx + 8; x++) w.heights[z * (N + 1) + x] = 1.5;
    for (let z = sz - 6; z < sz + 8; z++) for (let x = sx - 6; x < sx + 8; x++) w.veg[w.ci(x, z)] = 0;
    for (let x = sx - 5; x < sx + 7; x++) w.setRoad(x, sz + 2, true);
    w.place('watchtower', sx, sz, 0, true, 2, false);
    const p = new Patrols(w);
    for (let i = 0; i < 400; i++) p.update(0.05, 2);
    expect(p.hounds().length).toBe(p.groups.length);
    const g = p.groups[0], d = p.hound(g);
    expect(Math.hypot(d.x - g.x, d.z - g.z)).toBeLessThan(0.4);
    expect(Math.hypot(d.x - g.x, d.z - g.z)).toBeGreaterThan(HOUND_SIDE * 0.5);
  });

  it('les modèles de la mare (cinq âges) et du bassin à coraux restent dans leur case', () => {
    const check = (make: (p: Parts) => void) => {
      const p = new Parts();
      make(p);
      const g = p.build(false).body;
      g.computeBoundingBox();
      const b = g.boundingBox!;
      for (const v of [b.min.x, b.min.z, b.max.x, b.max.z]) expect(Math.abs(v)).toBeLessThan(0.5);
      expect(b.max.y).toBeLessThan(0.4);
    };
    for (let a = 1; a <= 5; a++) for (let v = 0; v < 3; v++) check((p) => pondModel(p, a, v));
    for (let a = 4; a <= 5; a++) check((p) => coralModel(p, a, 1));
  });

  it('les textes ont leur traduction anglaise', () => {
    // (les noms du catalogue sont traduits sur place par `setLang` : on les vérifie dans le dictionnaire)
    const known = i18nEntries();
    for (const k of ['pond', 'coralpool'] as KindId[]) for (const n of [...KINDS[k].names.filter(Boolean), KINDS[k].desc]) expect(known.has(n), n).toBe(true);
    setLang('en', false);
    try {
      for (const l of LEGACIES) {
        if (l.label !== 'satellites') expect(tr(l.label), l.label).not.toBe(l.label);
        const full = effectSummary([{ t: 'perk', id: l.perk }]);
        expect(full).not.toMatch(/[àâéèêîôûç]/);
      }
    } finally { setLang('fr', false); }
  });
});
