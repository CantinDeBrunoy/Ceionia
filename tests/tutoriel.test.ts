import { describe, it, expect } from 'vitest';
import { TUTO_TEXT, tutoGear, guidedState, guidedMode, parseState, startsOn, stepIndex, chapterDue, setAside } from '../src/ui/tutorial';
import { DEFAULT_DIFFICULTY } from '../src/sim/difficulty';
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

  it('les expéditions : ouvrir et lancer, sans suivre l’équipe à l’œil', () => {
    const t = TUTO_TEXT.steps.expeditions.tasks;
    expect(t).toEqual(['Ouvrir les expéditions', 'Lancer une expédition']);
    expect(t.join().includes('{eye}')).toBe(false);
  });

  it('le bûcheron et le pierrier ont une zone d’emplacements à montrer', () => {
    expect(isZoned('lumber')).toBe(true);
    expect(isZoned('quarry')).toBe(true);
  });
});

describe('tutoriel : l’équipement avant les expéditions', () => {
  it('fait fabriquer la pièce de « La grande cueillette » en forêt : la lance à la Préhistoire', () => {
    expect(tutoGear(0, () => false)).toBe('spear');
    expect(tutoGear(1, () => false)).toBe('bow');
    const ids = Object.keys(TUTO_TEXT.steps);
    expect(ids.indexOf('gear')).toBe(ids.indexOf('expeditions') - 1);
  });
});

describe('tutoriel : nouvelle partie guidée', () => {
  it('rejoue tout depuis la première étape, chapitres compris, même désactivé à l’accueil', () => {
    const s = parseState(JSON.parse(JSON.stringify(guidedState())))!;
    expect(s.off).toBeUndefined();
    expect(startsOn(s, true)).toBe(true);
    expect(setAside(s)).toBe(false);
    expect(stepIndex(s, Object.keys(TUTO_TEXT.steps))).toBe(0);
    expect(chapterDue(s, 'hell')).toBe(true);
  });

  it('garde le mode de la partie, sauf le bac à sable qui passe au mode conseillé', () => {
    expect(guidedMode('easy')).toBe('easy');
    expect(guidedMode('normal')).toBe('normal');
    expect(guidedMode('sandbox')).toBe(DEFAULT_DIFFICULTY);
  });
});
