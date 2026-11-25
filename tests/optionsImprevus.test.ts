import { describe, it, expect } from 'vitest';
import { MISSIONS } from '../src/sim/missions';
import { EVENT_BY, eventsOfChoice, optionOpen, roadNeeds, roadTake } from '../src/sim/events';
import { GEAR, emptyStock, loadout, type Stock } from '../src/sim/gear';

/**
 * Une option d'imprévu qui demande une pièce n'est montrée que si l'équipe a une chance de l'emporter : ce qui pare les
 * dangers de son choix, ou une pièce « utile en route » que la fenêtre de départ propose. Testeur du 25 nov. 2026 : les loups
 * de « L'école du pugilat » proposaient « Monter la garde, armes en main », grisé, alors qu'aucune arme n'y part jamais
 */
/** une réserve pleine de tout ce que le village peut connaître à cet âge */
const full = (age: number): Stock => { const s = emptyStock(); for (const g of GEAR) if (g.age <= age) s[g.id] = 20; return s; };
const pack = (m: (typeof MISSIONS)[number], c: (typeof MISSIONS)[number]['choices'][number], age: number, stock: Stock) => {
  const l = loadout(c, stock);
  return { ...l.take, ...roadTake(roadNeeds(m, c, age, true), stock, l.take) };
};

describe('options des imprévus', () => {
  it('toute option montrée peut être suivie par une équipe bien munie', () => {
    const bad: string[] = [];
    for (const m of MISSIONS) for (const c of m.choices) for (let age = m.age; age <= 5; age++) {
      const take = pack(m, c, age, full(age));
      for (const e of eventsOfChoice(m, c, age)) {
        const open = e.options.filter((o) => optionOpen(c, e, o, age));
        if (!open.length) bad.push(`${m.id}/${c.label} : ${e.id} sans option`);
        for (const o of open) if (o.needs && !o.needs.some((g) => (take[g] ?? 0) > 0)) bad.push(`${m.id}/${c.label} âge ${age} : ${e.id} « ${o.label} »`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('les loups du pugilat : pas d’option armée, le feu et la fuite restent', () => {
    const m = MISSIONS.find((x) => x.id === 'pugilat')!, w = EVENT_BY.wolves;
    for (const c of m.choices) {
      expect(eventsOfChoice(m, c, 1)).toContain(w);
      expect(w.options.filter((o) => optionOpen(c, w, o, 1)).map((o) => o.needs ? 'armes' : 'libre')).toEqual(['libre', 'libre']);
    }
  });

  it('une chasse au loup garde l’option armée (les armes partent contre les bêtes)', () => {
    const m = MISSIONS.find((x) => x.id === 'wolf')!, p = EVENT_BY.pack;
    for (const c of m.choices) expect(optionOpen(c, p, p.options[0], 0)).toBe(true);
  });

  it('la corde du lasso est utile en route : proposée au départ, et l’équipe en emporte une', () => {
    const m = MISSIONS.find((x) => x.id === 'horses')!, c = m.choices[0];
    const road = roadNeeds(m, c, m.age);
    expect(road.map((r) => r.needs)).toContainEqual(['rope']);
    const stock = emptyStock();
    expect(pack(m, c, m.age, stock).rope ?? 0).toBe(0);
    stock.rope = 3;
    expect(pack(m, c, m.age, stock).rope).toBe(1);
    // (le risque ne bouge pas : la corde ne pare aucun danger du choix)
    expect(loadout(c, stock).k).toBe(loadout(c, emptyStock()).k);
  });
});
