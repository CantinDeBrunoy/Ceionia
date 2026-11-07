import { describe, expect, it } from 'vitest';
import { brief, shortStop } from '../src/ui/brief';
import { KINDS } from '../src/build/catalog';

describe('fiche courte', () => {
  it('garde un texte court en entier', () => {
    expect(brief('Une maison.')).toEqual(['Une maison.', '']);
  });

  it('montre la première phrase, et replie la suite', () => {
    const [head, rest] = brief('Première phrase assez courte. Puis une seconde phrase bien plus longue qui ne tiendrait pas dans la fiche réduite, loin de là.', 60);
    expect(head).toBe('Première phrase assez courte.');
    expect(rest).toMatch(/^Puis une seconde/);
  });

  it('coupe une longue phrase à un deux-points, sans rien perdre', () => {
    const t = KINDS.terminal.desc, [head, rest] = brief(t);
    expect(head.length).toBeLessThanOrEqual(121);
    expect(head.endsWith('…')).toBe(true);
    expect(head.slice(0, -1) + ' : ' + rest.slice(1)).toBe(t);
  });

  it('chaque description et chaque conseil se replient en un début court', () => {
    for (const d of Object.values(KINDS)) {
      for (const t of [d.desc, d.perk ?? '']) {
        const [head, rest] = brief(t);
        expect(head.length).toBeLessThanOrEqual(121);
        if (!rest) expect(head).toBe(t.trim());
      }
    }
  });

  it('raccourcit les noms de gare', () => {
    expect(shortStop('Gare à grande vitesse 2')).toBe('GV 2');
    expect(shortStop('Gare intermodale')).toBe('Intermodale');
    expect(shortStop('Gare centrale 3')).toBe('Centrale 3');
    expect(shortStop('Petite gare')).toBe('Petite gare');
    expect(shortStop('Avant-poste 2')).toBe('Avant-poste 2');
  });
});
