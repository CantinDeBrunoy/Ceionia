import { describe, it, expect } from 'vitest';
import { TROOPS, TROOP_KINDS, troopForm, troopName, troopLabel, troopStats, newArmy, recruit, recruitWhy, onlyGearMissing, gearToCraft, cancelRecruit, dismiss, stepArmy, readArmy, RecruitCtx } from '../src/sim/army';
import { emptyStock } from '../src/sim/gear';
import { troopLook } from '../src/render/battleUnits';

const ctx = (age: number, extra: Partial<RecruitCtx> = {}): RecruitCtx => ({ age, pop: 200, stock: emptyStock(), barracks: 3, stables: 1, horses: 3, ...extra });

describe('évolution des troupes avec l’âge', () => {
  it('l’archer devient tirailleur au fusil à l’âge industriel, et la caserne dit ce qui manque', () => {
    expect(troopName('archer', 2)).toBe('Archer');
    expect(troopLabel('archer', 3)).toBe('Tirailleur (ex-archer)');
    expect(troopForm('archer', 3).gear).toEqual(['rifle']);
    const a = newArmy(), c = ctx(3);
    c.stock.bow = 5;
    const why = recruitWhy(a, 'archer', c);
    expect(why).toContain('1 fusil');
    expect(onlyGearMissing(a, 'archer', c)).toBe(true);
    expect(gearToCraft('archer', c.stock, [], [], 3)).toEqual(['rifle']);
    expect(gearToCraft('archer', c.stock, [], [], 2)).toEqual([]);
    c.stock.rifle = 1;
    expect(recruit(a, 'archer', c)).toBeNull();
    expect(c.stock.rifle).toBe(0);
    expect(c.stock.bow).toBe(5);
  });

  it('le fusil change les stats : portée et dégâts en hausse, cadence plus lente', () => {
    const b = troopStats('archer', 2), r = troopStats('archer', 3);
    expect(r.range).toBeGreaterThan(b.range * 1.3);
    expect(r.dmg).toBeGreaterThan(b.dmg * 2);
    expect(r.cooldown).toBeGreaterThan(b.cooldown);
    expect(troopStats('archer', 5).range).toBeGreaterThan(r.range);
  });

  it('le chevalier devient hallebardier (bonus contre les grands), le cavalier un char sans cheval', () => {
    expect(troopName('knight', 3)).toBe('Hallebardier');
    expect(troopStats('knight', 3).big).toBeGreaterThan(1);
    expect(troopStats('knight', 2).big).toBeUndefined();
    expect(troopForm('cavalry', 3).mount).toBe(true);
    const f = troopForm('cavalry', 4);
    expect(f.name).toBe('Char léger');
    expect(f.mount).toBeFalsy();
    // pas d'écurie ni de cheval requis pour un char
    expect(recruitWhy(newArmy(), 'cavalry', ctx(4, { stables: 0, horses: 0, unlimited: true }))).toBeNull();
    expect(recruitWhy(newArmy(), 'cavalry', ctx(3, { stables: 0, horses: 0, unlimited: true }))).toContain('écurie');
  });

  it('chaque troupe garde son identité et ses stats montent avec l’âge', () => {
    for (const k of TROOP_KINDS) {
      expect(troopForm(k, TROOPS[k].age).name).toBe(TROOPS[k].name);
      let prev = 0;
      for (let age = TROOPS[k].age; age <= 5; age++) { const hp = troopStats(k, age).hp; expect(hp).toBeGreaterThanOrEqual(prev); prev = hp; }
    }
  });

  it('l’équipement pris est celui rendu, même si l’âge a changé depuis (pas de fusil gratuit)', () => {
    const a = newArmy(), c = ctx(2);
    c.stock.bow = 1;
    expect(recruit(a, 'archer', c)).toBeNull();
    // l'âge passe : la recrue arrive, puis est renvoyée -> un arc revient
    stepArmy(a, 999, 3, 3);
    expect(a.troops).toHaveLength(1);
    const t = a.troops[0];
    expect(troopStats(t.kind, 3).range).toBeGreaterThan(5.5 * 1.3);
    dismiss(a, t.id, c.stock);
    expect(c.stock.bow).toBe(1);
    expect(c.stock.rifle).toBe(0);
    // annuler une recrue en route rend aussi la même pièce
    c.stock.rifle = 1;
    expect(recruit(a, 'archer', ctx(3, { stock: c.stock }))).toBeNull();
    cancelRecruit(a, 0, c.stock);
    expect(c.stock.rifle).toBe(1);
  });

  it('une ancienne sauvegarde se relit (sans équipement noté) et se rend en équipement d’origine', () => {
    const a = readArmy({ troops: [{ id: 1, kind: 'archer', hp: 50, maxHp: 65, where: 'isle', heal: 0 }], queue: [{ kind: 'knight', left: 5 }], nextId: 2 });
    expect(a.troops[0].gear).toBeUndefined();
    const st = emptyStock();
    dismiss(a, 1, st);
    expect(st.bow).toBe(1);
    const b = readArmy({ troops: [{ id: 1, kind: 'archer', hp: 5, maxHp: 5, where: 'isle', heal: 0, gear: ['rifle', 'nimporte'] }], queue: [] });
    expect(b.troops[0].gear).toBeUndefined();
  });

  it('le modèle 3D suit l’âge', () => {
    expect(troopLook('archer', 2).role).toBe('archer');
    expect(troopLook('archer', 3).role).toBe('gunner');
    expect(troopLook('cavalry', 3).mount).toBe('horse');
    expect(troopLook('cavalry', 4).mount).toBe('tank');
    expect(troopLook('cavalry', 5).mount).toBe('mbt');
    expect(troopLook('knight', 1).era).toBe(2);
  });
});
