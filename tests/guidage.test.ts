import { describe, it, expect } from 'vitest';
import { MISSIONS } from '../src/sim/missions';
import { gearGaps, emptyStock } from '../src/sim/gear';
import { KINDS, KIND_ORDER, KIND_SUB, BUILD_SUBS } from '../src/build/catalog';

describe('guidage : menu et équipement', () => {
  it('chaque bâtiment est rangé dans un groupe de son rayon', () => {
    for (const k of KIND_ORDER) {
      const subs = BUILD_SUBS[KINDS[k].cat].map((s) => s.id);
      expect(subs, k).toContain(KIND_SUB[k]);
    }
  });

  it('les outils qui manquent à un choix : lances contre les bêtes, rien une fois l’équipe munie', () => {
    const c = MISSIONS.find((m) => m.id === 'mammoth')!.choices[0];
    const stock = emptyStock();
    const gaps = gearGaps(c, stock, [], 0, () => true);
    expect(gaps.map((g) => g.gear.id)).toContain('spear');
    const spear = gaps.find((g) => g.gear.id === 'spear')!;
    expect(spear.need).toBe(c.party);
    stock.spear = c.party;
    expect(gearGaps(c, stock, [], 0, () => true).some((g) => g.gear.id === 'spear')).toBe(false);
  });
});
