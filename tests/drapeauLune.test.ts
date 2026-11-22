import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { moonFlag } from '../src/ui/spaceViews';
import { BLASON_COLORS, DEFAULT_BLASON, EMBLEM_PATH, SHAPE_PATH, hex } from '../src/sim/blason';

/**
 * La retransmission « En direct de la Lune » plante le drapeau du village, son blason (notes de joueurs du 22 nov. 2026 : elle
 * montrait le drapeau de la France)
 */
describe('le drapeau planté sur la Lune', () => {
  it('prend les couleurs, l’emblème et la forme du blason', () => {
    const f = moonFlag({ a: 'vert', b: 'or', e: 'tour', s: 'aronde' });
    expect(f.field).toBe(hex(BLASON_COLORS.vert));
    expect(f.emblem).toBe(hex(BLASON_COLORS.or));
    expect(f.mark).toBe(EMBLEM_PATH.tour);
    expect(f.shape).toBe(SHAPE_PATH.aronde);
    expect(f.hole).toBeTruthy();
    // (forme découpée : l'emblème vers la hampe, comme en jeu)
    expect(f.cx).toBe(42);
  });

  it('sans blason, celui du village par défaut', () => {
    expect(moonFlag().field).toBe(hex(BLASON_COLORS[DEFAULT_BLASON.a]));
  });

  it('plus de bandes bleu, blanc, rouge dans la retransmission', () => {
    const src = readFileSync('src/ui/spaceViews.ts', 'utf8');
    expect(src).not.toMatch(/#d8443a/i);
  });
});
