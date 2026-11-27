import { describe, it, expect } from 'vitest';
import { HellMap, Z_EMBER, Z_RIVER } from '../src/world/hell';
import { Hell } from '../src/sim/hell';
import { HellBase } from '../src/sim/hellBase';

/**
 * Un seul gardien par zone (testeur des Enfers, 27 nov. 2026) : chaque reprise faisait naître un gardien sans retirer l'ancien
 * (trois vus dans la Forêt de cristaux), et le gardien survivant abattait le camp dressé sur les ruines de sa forteresse
 */
const setup = (seed = 1) => {
  const m = new HellMap(seed), h = new Hell(m);
  return { m, h, b: new HellBase(h, m) };
};
const fortOf = (h: Hell, zone: number) => h.standing(zone).find((s) => s.kind === 'fortress')!;

describe('les gardiens des Enfers', () => {
  it('le gardien tombe avec sa forteresse', () => {
    const { h } = setup();
    expect(h.guardians(Z_RIVER)).toHaveLength(1);
    h.damage(fortOf(h, Z_RIVER), 1e6, -1);
    expect(h.conquered[Z_RIVER]).toBe(true);
    expect(h.guardians(Z_RIVER)).toHaveLength(0);
    expect(h.events.some((e) => e.type === 'death' && e.kind === 'guardian')).toBe(true);
  });

  it('chaque reprise de la zone garde un seul gardien', () => {
    const { h, b } = setup();
    for (let i = 0; i < 4; i++) {
      h.damage(fortOf(h, Z_EMBER), 1e6, -1);
      h.step(0.1); b.step(0.1);
      h.retake(Z_EMBER);
      expect(h.guardians(Z_EMBER)).toHaveLength(1);
    }
  });

  it('un gardien encore debout à la reprise reprend sa place, sans second gardien', () => {
    const { h } = setup();
    const fort = fortOf(h, Z_EMBER);
    // (une forteresse abattue d'une autre façon, son gardien resté en vie : le cas d'avant la correction)
    fort.hp = 0; fort.down = true; h.conquered[Z_EMBER] = true;
    const g = h.guardians(Z_EMBER)[0];
    g.x += 3; g.home = [g.x, g.z];
    h.retake(Z_EMBER);
    expect(h.guardians(Z_EMBER)).toEqual([g]);
    expect(Math.hypot(g.home[0] - fort.site.x, g.home[1] - fort.site.z)).toBeLessThan(fort.site.r + 2);
  });

  it('une ancienne sauvegarde à plusieurs gardiens n’en garde qu’un, le plus solide, et aucun dans une zone conquise', () => {
    const { m, h } = setup();
    const g = h.guardians(Z_RIVER)[0];
    const extra = [h.spawn('guardian', g.x + 1, g.z, Z_RIVER), h.spawn('guardian', g.x - 1, g.z, Z_RIVER)];
    extra[1].hp = g.hp + 500; extra[1].maxHp = extra[1].hp;
    h.conquered[Z_EMBER] = true;
    const again = Hell.load(m, JSON.parse(JSON.stringify(h.save())));
    expect(again.guardians(Z_RIVER)).toHaveLength(1);
    expect(again.guardians(Z_RIVER)[0].hp).toBe(extra[1].hp);
    expect(again.guardians(Z_EMBER)).toHaveLength(0);
  });
});
