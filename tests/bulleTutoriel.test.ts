import { describe, expect, it } from 'vitest';
import { bestSpot, inRect, GONE_MS, LATE_MS, type Spot } from '../src/ui/tutorial';

// testeurs v6 : la bulle cachait ce qu'elle montrait (conditions de l'âge, fiche, équipement, barre du bas)
describe('place de la bulle du tutoriel', () => {
  const W = 1280, H = 800, w = 390, h = 260;
  const a = { left: 10, right: 300, top: 110, bottom: 400 }; // la liste des conditions de l'âge, ouverte en haut à gauche
  const sides: Spot[] = [
    { x: 155 - w / 2, y: a.bottom + 16, side: 'below' }, { x: 155 - w / 2, y: a.top - 16 - h, side: 'above' },
    { x: a.right + 16, y: 255 - h / 2, side: 'right' }, { x: a.left - 16 - w, y: 255 - h / 2, side: 'left' },
  ];
  it('ne couvre jamais l’élément montré quand il y a de la place', () => {
    const p = bestSpot(W, H, w, h, a, [], sides);
    const x2 = p.x + w, y2 = p.y + h;
    expect(x2 <= a.left || p.x >= a.right || y2 <= a.top || p.y >= a.bottom).toBe(true);
  });
  it('évite un panneau ouvert à côté de l’élément', () => {
    const fiche = { left: a.right + 10, right: a.right + 420, top: 100, bottom: 420 };
    const p = bestSpot(W, H, w, h, a, [{ r: fiche, k: 1 }], sides);
    expect(p.side).not.toBe('right');
  });
  it('reste dans l’écran', () => {
    const p = bestSpot(W, H, w, h, a, [], sides);
    expect(p.x).toBeGreaterThanOrEqual(8);
    expect(p.y).toBeGreaterThanOrEqual(8);
    expect(p.x + w).toBeLessThanOrEqual(W - 8);
    expect(p.y + h).toBeLessThanOrEqual(H - 8);
  });
});

describe('la bulle partie ailleurs', () => {
  it('un appui à son ancienne place, « Suivant » compris, est reconnu quelques secondes', () => {
    const r = { left: 980, right: 1340, top: 150, bottom: 300 };
    expect(inRect(r, 1290, 270)).toBe(true);
    expect(inRect(r, 1344, 304)).toBe(true);
    expect(inRect(r, 700, 270)).toBe(false);
    expect(GONE_MS).toBeGreaterThanOrEqual(2000);
    // un joueur qui lit « Bien joué ! » clique « Suivant » deux ou trois secondes après (testeur débutant, 26 nov. 2026)
    expect(LATE_MS).toBeGreaterThanOrEqual(2500);
  });
});
