import { describe, it, expect } from 'vitest';
import { W0, WH, NH, WF, WEND, LOOT, haulAt, craneAt, lootAt, diveAt, turn, polar, mixPolar } from './salvage';

describe('le relevage du galion', () => {
  it('commence à l’arrivée du bateau et finit avant son départ', () => {
    expect(haulAt(0)).toBeNull();
    expect(haulAt(W0 - 0.01)).toBeNull();
    expect(haulAt(W0)).toEqual({ i: 0, f: 0 });
    expect(haulAt(WEND)).toBeNull();
    // le bateau rentre à partir de 0,8 (voir stepBoat) : tout est remonté avant
    expect(WEND).toBeLessThan(0.8);
    expect(WF).toBeCloseTo(W0 + NH * WH);
  });

  it('enchaîne les charges puis le coffre doré', () => {
    for (let i = 0; i < NH; i++) {
      const h = haulAt(W0 + (i + 0.5) * WH)!;
      expect(h.i).toBe(i);
      expect(h.f).toBeCloseTo(0.5);
    }
    expect(haulAt(WF + 0.001)!.i).toBe(NH);
    expect(haulAt(WEND - 0.001)!.f).toBeGreaterThan(0.95);
  });

  it('la grue descend, accroche, remonte, pivote, dépose, revient', () => {
    expect(craneAt(0).lift).toBe(0);
    expect(craneAt(0.3).lift).toBe(1);
    expect(craneAt(0.3).loaded).toBe(true);
    expect(craneAt(0.2).loaded).toBe(false);
    expect(craneAt(0.52).lift).toBe(0);
    expect(craneAt(0.62).toDeck).toBeGreaterThan(0.2);
    expect(craneAt(0.62).toDeck).toBeLessThan(0.8);
    expect(craneAt(0.8).low).toBe(1);
    expect(craneAt(0.79).released).toBe(false);
    expect(craneAt(0.8).released).toBe(true);
    expect(craneAt(0.8).loaded).toBe(false);
    expect(craneAt(1).toNext).toBeCloseTo(1);
    // jamais de saut : le crochet est à l'arrêt en haut quand il pivote
    for (let f = 0.5; f <= 0.88; f += 0.01) expect(craneAt(f).lift + craneAt(f).low).toBeLessThanOrEqual(1);
  });

  it('le butin sur le pont ne fait que croître jusqu’au coffre doré', () => {
    let last = 0;
    for (let k = 0; k <= 1; k += 0.005) {
      const l = lootAt(k);
      expect(l.items).toBeGreaterThanOrEqual(last);
      last = l.items;
    }
    expect(lootAt(0.1)).toEqual({ items: 0, prize: false });
    expect(lootAt(0.4).items).toBeGreaterThan(0);
    expect(lootAt(WF - 0.001).items).toBe(LOOT);
    expect(lootAt(WF + 0.01).prize).toBe(false);
    expect(lootAt(WEND)).toEqual({ items: LOOT, prize: true });
    // deux pièces par charge, déposées pendant le travail (pas toutes d'un coup)
    expect(lootAt(W0 + WH * 0.99).items).toBe(2);
    expect(lootAt(W0 + WH * 1.9).items).toBe(4);
  });

  it('le plongeur : à bord, descend, travaille, remonte, revient', () => {
    expect(diveAt(0.05).s).toBe('deck');
    expect(diveAt(0.2).s).toBe('down');
    expect(diveAt(0.4).s).toBe('work');
    expect(diveAt(0.79).s).toBe('up');
    expect(diveAt(0.9).s).toBe('back');
  });

  it('les angles de la flèche tournent toujours dans le même sens', () => {
    expect(turn(-0.5)).toBeCloseTo(Math.PI * 2 - 0.5);
    const wreck = polar(1, 0, 0, 0), deck = polar(-0.3, -1, 0, 0);
    // de l'épave (côté +x) au pont (côté -z) : jamais en repassant par l'avant
    expect(wreck[0]).toBeCloseTo(Math.PI / 2);
    expect(deck[0]).toBeGreaterThan(Math.PI);
    const mid = mixPolar(wreck, deck, 0.5);
    expect(mid[0]).toBeGreaterThan(wreck[0]);
    expect(mid[0]).toBeLessThan(deck[0]);
    // la portée reste celle de la flèche
    expect(polar(5, 0, 0, 0)[1]).toBeCloseTo(0.42);
    expect(polar(0.01, 0, 0, 0)[1]).toBeCloseTo(0.08);
  });
});
