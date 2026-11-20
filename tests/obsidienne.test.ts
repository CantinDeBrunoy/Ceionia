import { describe, it, expect } from 'vitest';
import { MISSIONS, readExpState, newExpState } from '../src/sim/missions';
import { GEAR_BY, emptyStock, gearGaps, loadout, gearKnown, gearPower } from '../src/sim/gear';
import { newArmy, recruit, recruitWhy, cancelRecruit, stepArmy, troopStats, troopStatsOf, OBSIDIAN_DMG } from '../src/sim/army';

const choice = (id: string, ci: number) => MISSIONS.find((m) => m.id === id)!.choices[ci];
/** Le risque en Normal (×1,25), l'équipe munie de cette réserve (sans les bâtiments qui le baissent) */
const risk = (id: string, ci: number, st: Partial<ReturnType<typeof emptyStock>>) => choice(id, ci).risk * 1.25 * loadout(choice(id, ci), { ...emptyStock(), ...st }).k;

describe('les armes d’obsidienne', () => {
  it('« La pierre noire du volcan » en donne le savoir-faire, et rien d’autre ne le donne', () => {
    for (const c of MISSIONS.find((m) => m.id === 'obsidian')!.choices) expect(c.win).toContainEqual({ t: 'perk', id: 'obsidian' });
    expect(MISSIONS.filter((m) => m.choices.some((c) => c.win.some((e) => e.t === 'perk' && e.id === 'obsidian'))).map((m) => m.id)).toEqual(['obsidian']);
    for (const id of ['obsidianSpear', 'obsidianSword'] as const) {
      expect(gearKnown(GEAR_BY[id], [])).toBe(false);
      expect(gearKnown(GEAR_BY[id], ['obsidian'])).toBe(true);
    }
  });

  it('la lance à l’Antiquité, l’épée au Moyen Âge (à l’atelier) ; rien après', () => {
    const sp = GEAR_BY.obsidianSpear, sw = GEAR_BY.obsidianSword;
    expect([sp.age, sp.last, sp.ore, sp.needs]).toEqual([1, 2, 1, undefined]);
    expect([sw.age, sw.last, sw.ore, sw.needs]).toEqual([2, 2, 2, 'workshop']);
    // la lance passe devant l'épée de fer et l'arbalète, l'épée d'obsidienne devant la lance
    expect(gearPower(sp)).toBeGreaterThan(gearPower(GEAR_BY.crossbow));
    expect(gearPower(sw)).toBeGreaterThan(gearPower(sp));
  });

  it('une baisse du risque qui se voit : le mammouth prudent de 22 % à moins de 15 % en Normal', () => {
    expect(risk('mammoth', 0, { spear: 4 })).toBeCloseTo(0.219, 2);
    expect(risk('mammoth', 0, { obsidianSpear: 4 })).toBeLessThan(0.15);
    expect(risk('kraken', 1, { obsidianSpear: 6, boat: 2 })).toBeLessThan(risk('kraken', 1, { bow: 6, boat: 2 }) - 0.08);
    expect(risk('stag', 0, { obsidianSword: 4 })).toBeLessThan(risk('stag', 0, { crossbow: 4 }) - 0.07);
    // la moitié de l'équipe munie : la moitié du tranchant ; une lance de plus en réserve ne fait jamais monter le risque
    const half = risk('mammoth', 0, { obsidianSpear: 2 });
    expect(half).toBeLessThan(risk('mammoth', 0, {}));
    expect(half).toBeGreaterThan(risk('mammoth', 0, { obsidianSpear: 4 }));
    expect(risk('mammoth', 0, { obsidianSpear: 4, spear: 4 })).toBeLessThanOrEqual(risk('mammoth', 0, { obsidianSpear: 4 }));
  });

  it('la fenêtre de départ ne la propose qu’une fois le savoir-faire acquis', () => {
    const c = choice('kraken', 0), any = () => true;
    expect(gearGaps(c, emptyStock(), [], 1, any).map((g) => g.gear.id)).not.toContain('obsidianSpear');
    expect(gearGaps(c, emptyStock(), [], 1, any, ['obsidian']).map((g) => g.gear.id)).toContain('obsidianSpear');
  });

  it('une ancienne partie qui a rapporté la pierre noire en a le savoir-faire', () => {
    const old = { ...newExpState(), done: ['obsidian'], perks: [] as string[] };
    expect(readExpState(JSON.parse(JSON.stringify(old))).perks).toContain('obsidian');
    // une sauvegarde sans les nouvelles pièces : leur réserve à 0
    const s = readExpState({ done: [], perks: [], gear: { spear: 3 } });
    expect([s.gear.spear, s.gear.obsidianSpear, s.gear.obsidianSword]).toEqual([3, 0, 0]);
  });

  it('le chevalier prend l’épée d’obsidienne s’il y en a une, et frappe plus fort ; annulé, il la rend', () => {
    const a = newArmy(), stock = { ...emptyStock(), obsidianSword: 1, armor: 2, sword: 1 }, ctx = { age: 2, stock, barracks: 2, pop: 100 };
    expect(recruit(a, 'knight', ctx)).toBeNull();
    expect([stock.obsidianSword, stock.sword, stock.armor]).toEqual([0, 1, 1]);
    cancelRecruit(a, 0, stock);
    expect([stock.obsidianSword, stock.sword]).toEqual([1, 1]);
    // sans épée de fer, l'épée d'obsidienne suffit
    const s2 = { ...emptyStock(), obsidianSword: 1, armor: 1 };
    expect(recruitWhy(newArmy(), 'knight', { age: 2, stock: s2, barracks: 1, pop: 100 })).toBeNull();
    const b = newArmy();
    recruit(b, 'knight', { age: 2, stock: s2, barracks: 1, pop: 100 });
    const t = stepArmy(b, 1e4, 1, 2).joined[0];
    expect(t.gear).toContain('obsidianSword');
    expect(troopStatsOf(t, 2).dmg).toBeCloseTo(troopStats('knight', 2).dmg * OBSIDIAN_DMG, 1);
  });
});
