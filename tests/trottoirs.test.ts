import { describe, it, expect } from 'vitest';
import { sideStep, sidewalkAt, SIDEWALK } from '../src/sim/agents';

describe('trottoirs', () => {
  it('pas de trottoir sur les routes de terre, un trottoir dès les pavés', () => {
    expect(sidewalkAt(0)).toBe(0);
    expect(sidewalkAt(2)).toBe(0);
    expect(sidewalkAt(3)).toBe(SIDEWALK);
    expect(sidewalkAt(5)).toBe(SIDEWALK);
    // le trottoir est hors de la chaussée (demi-largeur 0,32 au plus) et dans la case
    expect(SIDEWALK).toBeGreaterThan(0.32);
    expect(SIDEWALK).toBeLessThan(0.5);
  });

  it('le décalage est perpendiculaire au sens de marche, de part et d’autre', () => {
    // vers l'est (+x) : à droite = +z ; vers le sud (+z) : à droite = -x
    const [ex, ez] = sideStep(10, 10, 1, 0, 0.37);
    expect(ex).toBeCloseTo(10); expect(ez).toBeCloseTo(10.37);
    const [sx, sz] = sideStep(10, 10, 0, 1, 0.37);
    expect(sx).toBeCloseTo(9.63); expect(sz).toBeCloseTo(10);
    // l'autre trottoir : écart négatif ; direction non unitaire ou nulle
    const [lx, lz] = sideStep(10, 10, 5, 0, -0.37);
    expect(lx).toBeCloseTo(10); expect(lz).toBeCloseTo(9.63);
    expect(sideStep(3, 4, 0, 0, 0.37)).toEqual([3, 4]);
    // diagonale : l'écart reste de 0,37
    const [dx, dz] = sideStep(0, 0, 1, 1, 0.37);
    expect(Math.hypot(dx, dz)).toBeCloseTo(0.37);
  });
});
