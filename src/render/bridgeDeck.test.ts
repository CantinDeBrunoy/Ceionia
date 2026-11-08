import { describe, expect, it } from 'vitest';
import { deckProfile } from './bridgeDeck';

const line = (n: number, step = 0.2) => Array.from({ length: n }, (_, i) => i * step);

describe('profil du tablier d\'un petit pont', () => {
  it('est plat au-dessus de l\'eau et rejoint le sol aux deux pieds, sans à-coup', () => {
    const S = line(21), wet = S.map((s) => s >= 1.4 && s <= 2.6), ground = S.map(() => 0.1);
    const p = deckProfile(S, wet, ground, 0.32, 0.14, 0.14);
    for (let i = 0; i < S.length; i++) if (S[i] >= p.a && S[i] <= p.b) expect(p.y[i]).toBeCloseTo(0.32);
    expect(p.y[0]).toBeCloseTo(0.14);
    expect(p.y[S.length - 1]).toBeCloseTo(0.14);
    // montée puis descente monotones
    const mid = p.y.indexOf(0.32);
    for (let i = 1; i <= mid; i++) expect(p.y[i]).toBeGreaterThanOrEqual(p.y[i - 1] - 1e-9);
    for (let i = p.y.length - 1; i > p.y.lastIndexOf(0.32); i--) expect(p.y[i - 1]).toBeGreaterThanOrEqual(p.y[i] - 1e-9);
  });

  it('ne passe jamais sous le sol, même quand la rive est plus haute que l\'eau', () => {
    const S = line(21), wet = S.map((s) => s >= 1.4 && s <= 2.6), ground = S.map((s) => 0.4 + 0.1 * Math.sin(s));
    const p = deckProfile(S, wet, ground, 0.32, 0.45, 0.45);
    p.y.forEach((y, i) => expect(y).toBeGreaterThanOrEqual(ground[i] + 0.03 - 1e-9));
    expect(p.deck).toBeGreaterThan(0.32);
  });

  it('sans eau, il n\'y a pas de tablier plat', () => {
    const S = line(5), p = deckProfile(S, S.map(() => false), S.map(() => 0), 0.32, 0, 0);
    expect(p.a).toBeGreaterThan(p.b);
  });
});
