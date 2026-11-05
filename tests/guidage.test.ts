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

describe('pastille d’évolution', () => {
  it('un puits peut évoluer en château d’eau à l’âge industriel, s’il y a de quoi payer', async () => {
    const { World, N, setMapSize } = await import('../src/world/world');
    const { newWorld } = await import('../src/world/mapgen');
    const { UpgradeBadges } = await import('../src/render/upgradeBadges');
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026);
    w.updateVis();
    let at: [number, number] | null = null;
    for (let z = 10; z < N - 10 && !at; z++) for (let x = 10; x < N - 10 && !at; x++) if (w.canPlace('well', x, z) === null) at = [x, z];
    w.place('well', at![0], at![1], 0, true, 3, false);
    w.wood = 0; w.stone = 0; w.brick = 0; w.unlimited = false;
    // un petit bâtiment ne coûte rien : la pastille est là dès que l'âge le permet
    expect(UpgradeBadges.upgradable(w, 3).length).toBe(1);
    w.wood = 500; w.stone = 500; w.brick = 500;
    expect(UpgradeBadges.upgradable(w, 3).length).toBe(1);
    // l'âge d'avant le château d'eau : rien à proposer
    expect(UpgradeBadges.upgradable(w, 2).length).toBe(0);
  });
});
