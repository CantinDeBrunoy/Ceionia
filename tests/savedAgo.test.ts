import { describe, it, expect } from 'vitest';
import { savedAgo } from '../src/save/save';

describe('date de la sauvegarde, sur l’écran d’accueil', () => {
  const now = new Date(2026, 10, 7, 15, 0).getTime();
  const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).getTime();

  it('se dit simplement : à l’instant, en minutes, en heures, hier, en jours, puis la date', () => {
    expect(savedAgo(now - 20000, now)).toBe('sauvegardé à l’instant');
    expect(savedAgo(now - 5 * 60000, now)).toBe('sauvegardé il y a 5 min');
    expect(savedAgo(at(2026, 10, 7, 9), now)).toBe('sauvegardé il y a 6 h');
    expect(savedAgo(at(2026, 10, 6, 23, 30), now)).toBe('sauvegardé hier');
    expect(savedAgo(at(2026, 10, 3), now)).toBe('sauvegardé il y a 4 jours');
    expect(savedAgo(at(2026, 2, 1), now)).toBe('sauvegardé le 1er mars');
    expect(savedAgo(at(2025, 11, 24), now)).toBe('sauvegardé le 24 décembre 2025');
  });

  it('rien pour une sauvegarde sans date', () => {
    expect(savedAgo(0, now)).toBe('');
    expect(savedAgo(NaN, now)).toBe('');
  });
});
