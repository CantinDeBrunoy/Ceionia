import { describe, it, expect } from 'vitest';
import { MISSIONS } from '../src/sim/missions';
import { GEAR, emptyStock, loadout, type Stock } from '../src/sim/gear';

const kraken = MISSIONS.find((m) => m.id === 'kraken')!;

describe('équipement emporté (testeurs v6 : le kraken passait de 42 à 51 % pendant la fabrication)', () => {
  it('deux arcs fabriqués ne chassent pas les lances : l’équipe part avec les deux', () => {
    const c = kraken.choices[0], s = emptyStock();
    s.spear = 3;
    const before = loadout(c, s);
    s.bow = 2;
    const after = loadout(c, s);
    expect(after.take.spear).toBeGreaterThan(0);
    expect(after.take.bow).toBe(2);
    expect(after.k).toBeLessThanOrEqual(before.k + 1e-12);
  });

  it('une pièce de plus en réserve ne fait jamais monter le risque', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const m of MISSIONS) for (const c of m.choices) {
      for (let n = 0; n < 4; n++) {
        const s: Stock = emptyStock();
        for (const g of GEAR) if (rnd() < 0.3) s[g.id] = Math.floor(rnd() * 6);
        const g = GEAR[Math.floor(rnd() * GEAR.length)];
        const k0 = loadout(c, s).k;
        s[g.id] += 1;
        expect(loadout(c, s).k, `${m.id} + ${g.id}`).toBeLessThanOrEqual(k0 + 1e-12);
      }
    }
  });

  it('la réserve pleine de la meilleure pièce : rien d’autre ne part', () => {
    const c = kraken.choices[0], s = emptyStock();
    s.bow = 20; s.spear = 20;
    const l = loadout(c, s);
    expect(l.take.spear ?? 0).toBe(0);
  });
});
