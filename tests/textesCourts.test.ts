import { describe, expect, it } from 'vitest';
import { MISSIONS, choiceAt, splitIntro, effectChips } from '../src/sim/missions';
import { EVENTS } from '../src/sim/events';
import { GEAR } from '../src/sim/gear';

/**
 * Le menu Expéditions s'adresse aussi aux enfants : peu de texte à l'écran. Ce que montre une carte de mission (sa phrase
 * d'accroche) et un choix (titre, demi-phrase) est plafonné ; le reste de l'histoire est replié.
 */
describe('textes courts des expéditions', () => {
  const MAX_CARD = 160, MAX_HEAD = 100, MAX_CHOICE_TEXT = 75, MAX_LABEL = 50;

  it('une carte de mission : accroche courte (≤ 160 caractères hors titre), histoire repliée', () => {
    for (const m of MISSIONS) {
      const { head, rest } = splitIntro(m.intro);
      expect(head.length, m.id).toBeLessThanOrEqual(MAX_HEAD);
      expect(head.length, m.id).toBeLessThanOrEqual(MAX_CARD);
      // rien n'est perdu : l'histoire complète reste lisible sous « Lire l'histoire »
      expect(`${head} ${rest}`.trim(), m.id).toBe(m.intro);
    }
  });

  it('un choix : titre court et une demi-phrase, à chaque âge (≤ 160 caractères hors titre)', () => {
    for (const m of MISSIONS) for (let age = 0; age <= 7; age++) for (const c0 of m.choices) {
      const c = choiceAt(c0, age);
      expect(c.label.length, `${m.id}/${c.label}`).toBeLessThanOrEqual(MAX_LABEL);
      expect(c.text.length, `${m.id}/${c.label}`).toBeLessThanOrEqual(MAX_CHOICE_TEXT);
      expect(c.text.length, `${m.id}/${c.label}`).toBeLessThanOrEqual(MAX_CARD);
    }
  });

  it('les gains tiennent en pastilles d\'icônes (une par effet, sans phrase)', () => {
    for (const m of MISSIONS) for (const c of m.choices) for (const eff of [c.win, c.lose]) {
      for (const chip of effectChips(eff)) {
        expect(chip.icon.length).toBeGreaterThan(0);
        expect(chip.n.length).toBeLessThanOrEqual(12);
      }
    }
  });

  it('équipement et imprévus : descriptions et récits brefs', () => {
    for (const g of GEAR) expect(g.desc.length, g.id).toBeLessThanOrEqual(70);
    for (const e of EVENTS) expect(e.text.length, e.id).toBeLessThanOrEqual(125);
  });
});
