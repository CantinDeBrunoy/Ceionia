import { describe, it, expect } from 'vitest';
import { MISSIONS, giftChips, effectChips } from '../src/sim/missions';

/**
 * Chaque expédition dit ce qu'elle rapporte : la fenêtre de départ montre trois récompenses par façon de partir
 * (`giftChips(…, 3)`), la carte de la liste toutes. « La pierre noire du volcan » n'y montrait pas les armes d'obsidienne
 * qu'elle débloque (notes de joueurs du 22 nov. 2026)
 */
describe('récompenses des expéditions', () => {
  it('toutes les façons de partir montrent au moins une récompense', () => {
    for (const m of MISSIONS) for (const c of m.choices) expect(giftChips(c.win, 3).length, `${m.id} › ${c.label}`).toBeGreaterThan(0);
  });

  it('le gain propre à la mission (savoir-faire, diplomatie, bêtes) est toujours parmi les trois montrées', () => {
    for (const m of MISSIONS) for (const c of m.choices) {
      const shown = giftChips(c.win, 3).map((x) => x.icon);
      for (const e of c.win.filter((e) => e.t === 'perk' || e.t === 'diplo')) expect(shown, `${m.id} › ${c.label}`).toContain(effectChips([e])[0].icon);
      if (c.win.some((e) => e.t === 'herd')) expect(shown.some((i) => effectChips(c.win.filter((e) => e.t === 'herd')).some((h) => h.icon === i)), `${m.id} › ${c.label}`).toBe(true);
    }
  });

  it('la pierre noire du volcan montre son savoir-faire, avec son nom au survol', () => {
    const m = MISSIONS.find((x) => x.id === 'obsidian')!;
    for (const c of m.choices) {
      const star = giftChips(c.win, 3).find((x) => x.icon === '⭐');
      expect(star).toBeTruthy();
      expect(star!.n).toBeTruthy();
      expect(star!.title).toMatch(/obsidienne/);
    }
  });

  it('sans doublon d’icône, dans l’ordre des gains propres', () => {
    const chips = giftChips([{ t: 'ore', n: 2 }, { t: 'ore', n: 3 }, { t: 'perk', id: 'obsidian' }]);
    expect(chips.map((c) => c.icon)).toEqual(['⭐', '⛏️']);
  });
});
