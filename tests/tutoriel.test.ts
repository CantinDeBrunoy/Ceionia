import { describe, it, expect } from 'vitest';
import { TUTO_TEXT } from '../src/ui/tutorial';
import { isZoned } from '../src/build/zones';

describe('tutoriel : une phrase simple par étape', () => {
  it('chaque étape tient en une phrase courte', () => {
    for (const [id, st] of Object.entries(TUTO_TEXT.steps)) {
      const t = (st as { text: string }).text;
      expect(t.length, id).toBeLessThan(120);
      // une seule phrase : pas de point au milieu du texte
      expect(t.replace(/«[^»]*»/g, '').slice(0, -1).includes('. '), id).toBe(false);
    }
  });

  it('commence par le but du jeu', () => {
    const ids = Object.keys(TUTO_TEXT.steps);
    expect(ids[0]).toBe('welcome');
    expect(TUTO_TEXT.steps.welcome.text).toMatch(/village/);
  });

  it('le bûcheron et le pierrier ont une zone d’emplacements à montrer', () => {
    expect(isZoned('lumber')).toBe(true);
    expect(isZoned('quarry')).toBe(true);
  });
});
