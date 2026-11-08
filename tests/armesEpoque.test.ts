import { describe, it, expect } from 'vitest';
import { MISSIONS, readExpState, newExpState } from '../src/sim/missions';
import { GEAR, GEAR_BY, emptyStock, gearGaps, loadout, gearCost, gearCurrent, gearObsolete, huntWeapon } from '../src/sim/gear';

const choice = MISSIONS.find((m) => m.id === 'mammoth')!.choices[0];

describe('armes de chaque époque', () => {
  it('chaque âge exige l’arme de son temps, et plus celles qui sont dépassées', () => {
    const want = (age: number) => gearGaps(choice, emptyStock(), [], age, () => true).map((g) => g.gear.id);
    expect(want(0)).toContain('spear');
    expect(want(2)).toContain('crossbow');
    expect(want(2)).not.toContain('spear');
    expect(want(3)).toContain('rifle');
    expect(want(4)).toContain('assault');
    expect(want(5)).toContain('plasma');
    for (const old of ['spear', 'bow', 'sword', 'crossbow', 'rifle', 'assault']) expect(want(5)).not.toContain(old);
  });

  it('de vieilles lances en réserve ne couvrent pas le danger à l’âge futuriste, mais partent en dernier recours', () => {
    const stock = emptyStock();
    stock.spear = 10;
    expect(gearGaps(choice, stock, [], 5, () => true).some((g) => g.gear.id === 'plasma')).toBe(true);
    expect(loadout(choice, stock).take.spear).toBe(choice.party);
    stock.plasma = choice.party;
    const l = loadout(choice, stock);
    expect(l.take.plasma).toBe(choice.party);
    expect(l.take.spear).toBeUndefined();
    expect(gearGaps(choice, stock, [], 5, () => true).some((g) => g.gear.id === 'plasma')).toBe(false);
  });

  it('les pièces modernes coûtent du minerai et du carburant, les anciennes restent fabricables', () => {
    expect(gearCost(GEAR_BY.plasma, 'normal').fuel).toBeGreaterThan(0);
    expect(gearCost(GEAR_BY.spear, 'normal').fuel).toBeUndefined();
    for (const g of GEAR) expect(gearCurrent(g, g.age) || gearObsolete(g, g.age)).toBe(true);
    expect(gearObsolete(GEAR_BY.spear, 5)).toBe(true);
    expect(gearObsolete(GEAR_BY.rope, 5)).toBe(false);
    expect(huntWeapon(5)).toBe('plasma');
    expect(huntWeapon(0)).toBe('spear');
  });

  it('une ancienne sauvegarde se charge : stocks conservés, nouvelles pièces à zéro', () => {
    const old = { gear: { spear: 3, bow: 1, sword: 0, rifle: 2, rope: 1, torch: 4, boat: 0, kit: 0, armor: 2 }, craft: ['spear'] };
    const s = readExpState(old);
    expect(s.gear.spear).toBe(3);
    expect(s.gear.rifle).toBe(2);
    expect(s.gear.plasma).toBe(0);
    expect(s.craft).toEqual(['spear']);
    expect(Object.keys(newExpState().gear).sort()).toEqual(GEAR.map((g) => g.id).sort());
  });
});
