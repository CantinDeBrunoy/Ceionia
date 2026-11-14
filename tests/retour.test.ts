import { describe, it, expect } from 'vitest';
import { awayFromHome, eyeClick } from '../src/ui/homeButton';

describe('l’œil de la carte d’une équipe', () => {
  it('suit l’équipe ; sur l’équipe déjà suivie, ramène au village', () => {
    expect(eyeClick(null, 2)).toBe('follow');
    expect(eyeClick(1, 2)).toBe('follow');
    expect(eyeClick(2, 2)).toBe('home');
  });
});

describe('le bouton « Retourner au village »', () => {
  it('reste caché tant que la place est à l’écran, près du point visé', () => {
    expect(awayFromHome(0, 30, { x: 0, y: 0 })).toBe(false);
    expect(awayFromHome(8, 30, { x: 0.5, y: -0.4 })).toBe(false);
    // vue d'ensemble : le point visé peut être loin, la place reste au milieu de ce qu'on voit
    expect(awayFromHome(30, 120, { x: 0.3, y: 0.2 })).toBe(false);
  });
  it('apparaît quand la place sort de l’écran, passe derrière la caméra, ou que la vue s’en éloigne', () => {
    expect(awayFromHome(10, 12, { x: 1.4, y: 0 })).toBe(true);
    expect(awayFromHome(10, 12, { x: 0, y: -1.2 })).toBe(true);
    expect(awayFromHome(10, 12, null)).toBe(true);
    expect(awayFromHome(40, 20, { x: 0.2, y: 0.1 })).toBe(true);
  });
  it('ne clignote pas au bord : il faut revenir un peu plus près pour qu’il disparaisse', () => {
    expect(awayFromHome(15, 10, { x: 0, y: 0 }, false)).toBe(true);
    expect(awayFromHome(13, 10, { x: 0, y: 0 }, false)).toBe(false);
    expect(awayFromHome(13, 10, { x: 0, y: 0 }, true)).toBe(true);
    expect(awayFromHome(10, 10, { x: 0, y: 0 }, true)).toBe(false);
    expect(awayFromHome(5, 10, { x: 0.95, y: 0 }, true)).toBe(true);
    expect(awayFromHome(5, 10, { x: 0.95, y: 0 }, false)).toBe(false);
  });
});
