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

const KINDS_SIZE = (k: keyof typeof KINDS) => KINDS[k].size;

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
    // pas la place de grandir : pas de flèche (retour de l'auteur, 24 nov. 2026). Une maison devient manoir (2 × 2) : entourée
    // de puits, elle ne peut pas ; une case libre suffit à rendre la flèche
    const w2 = new World();
    newWorld(w2, 3, 2026);
    w2.updateVis();
    let h: [number, number] | null = null;
    for (let z = 12; z < N - 12 && !h; z++) for (let x = 12; x < N - 12 && !h; x++) if ([-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => w2.canPlace('well', x + dx, z + dz) === null))) h = [x, z];
    const house = w2.place('house', h![0], h![1], 0, true, 2, false);
    w2.wood = 5000; w2.stone = 5000; w2.unlimited = true;
    expect(w2.upgradeRoom(house.id, 'manor')).not.toBeNull();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) w2.place('well', h![0] + dx, h![1] + dz, 0, true, 2, false);
    expect(w2.upgradeRoom(house.id, 'manor')).toBeNull();
    expect(UpgradeBadges.upgradable(w2, 2).length).toBe(0);
  });
});
