import { describe, it, expect } from 'vitest';
import { genHeights, CONTINENT } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';

const n = 192, S = n + 1;
const SEEDS = Array.from({ length: 16 }, (_, i) => 1 + i * 997);

/** Pour chaque bord : distance de la première terre depuis le bord, ligne par ligne (-1 : pas de terre dans le premier tiers) */
function coastLines(h: Float32Array) {
  const out: number[][] = [];
  for (let side = 0; side < 4; side++) {
    const c: number[] = [];
    for (let i = 0; i <= n; i++) {
      let f = -1;
      for (let d = 0; d < n * 0.3 && f < 0; d++) {
        const [x, z] = side === 0 ? [d, i] : side === 1 ? [n - d, i] : side === 2 ? [i, d] : [i, n - d];
        if (h[z * S + x] > 0.05) f = d;
      }
      c.push(f);
    }
    out.push(c);
  }
  return out;
}

/** Plus longue suite de lignes où la côte reste dans une bande de 2 cases : une côte droite, parallèle au bord */
function ruler(h: Float32Array) {
  let best = 0;
  for (const c of coastLines(h)) {
    let start = 0;
    for (let i = 0; i < c.length; i++) {
      if (c[i] < 0) { start = i + 1; continue; }
      for (;;) {
        let lo = Infinity, hi = -Infinity;
        for (let j = start; j <= i; j++) { lo = Math.min(lo, c[j]); hi = Math.max(hi, c[j]); }
        if (hi - lo <= 2) break;
        start++;
      }
      best = Math.max(best, i - start + 1);
    }
  }
  return best;
}

describe('côtes des nouvelles cartes', () => {
  const hs = SEEDS.map((s) => genHeights(CONTINENT, s, GEN, n));

  it('la terre ne touche jamais le bord de la carte', () => {
    for (const h of hs) for (const c of coastLines(h)) expect(c.every((d) => d < 0 || d >= 3)).toBe(true);
  });

  it('pas de longue côte droite le long d’un bord', () => {
    // (avant la marge de mer bruitée : jusqu'à 84 lignes, 46 en moyenne ; la terre était tranchée par la bande du bord)
    const r = hs.map(ruler);
    expect(Math.max(...r)).toBeLessThan(45);
    expect(r.reduce((a, b) => a + b, 0) / r.length).toBeLessThan(32);
  });
});
