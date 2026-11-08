import { describe, it, expect } from 'vitest';
import { MISSIONS, choiceAt } from '../src/sim/missions';
import { choiceStyles, riskDots, injuredOf, gainsOf, cardPhrase } from '../src/sim/choiceStyle';

const mk = (risk: number, win: any[] = [], lose: any[] = []) => ({ risk, win, lose });

describe('style des choix (prudent, audacieux)', () => {
  it('un seul choix : aucune étiquette', () => {
    expect(choiceStyles([mk(0.2)])).toEqual([{ style: null, effect: null }]);
  });

  it('des risques égaux : aucune étiquette', () => {
    expect(choiceStyles([mk(0.2), mk(0.2)]).every((s) => !s.style)).toBe(true);
  });

  it('le plus bas est prudent, le plus haut audacieux, le milieu équilibré (dans l’ordre des choix)', () => {
    const s = choiceStyles([mk(0.3), mk(0.1), mk(0.2)]);
    expect(s.map((x) => x.style)).toEqual(['bold', 'cautious', 'balanced']);
    expect(s[2].effect).toBeNull();
  });

  it('« moins de blessés » seulement si les blessés du prudent sont moins nombreux', () => {
    const hurt = (n: number) => [{ t: 'injured', n, days: 3 }];
    expect(choiceStyles([mk(0.1, [], hurt(1)), mk(0.3, [], hurt(3))])[0].effect).toBe('fewerInjuries');
    expect(choiceStyles([mk(0.1, [], hurt(3)), mk(0.3, [], hurt(3))])[0].effect).toBe('safer');
    expect(choiceStyles([mk(0.1, [], hurt(4)), mk(0.3, [], hurt(1))])[0].effect).toBe('safer');
    expect(choiceStyles([mk(0.1), mk(0.3)])[0].effect).toBe('safer');
  });

  it('« plus de récompenses » seulement si l’audacieux rapporte plus', () => {
    const food = (n: number) => [{ t: 'need', need: 'food', n }];
    expect(choiceStyles([mk(0.1, food(2)), mk(0.3, food(5))])[1].effect).toBe('moreRewards');
    expect(choiceStyles([mk(0.1, food(5)), mk(0.3, food(5))])[1].effect).toBe('riskier');
    expect(choiceStyles([mk(0.1, food(5)), mk(0.3, food(2))])[1].effect).toBe('riskier');
  });

  it('les gains et les blessés se comptent', () => {
    expect(gainsOf(mk(0, [{ t: 'ore', n: 3 }, { t: 'herd', kinds: ['sheep', 'cow'] }, { t: 'perk', id: 'x' }]))).toBe(7);
    expect(injuredOf(mk(0, [], [{ t: 'injured', n: 2, days: 3 }, { t: 'unherd', kind: 'sheep', n: 1 }]))).toBe(2);
  });

  it('toutes les missions, à tous les âges : jamais d’étiquette fausse', () => {
    let seen = 0;
    for (const m of MISSIONS) for (const age of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      const cs = m.choices.map((c) => choiceAt(c, age)), st = choiceStyles(cs);
      expect(st.length).toBe(cs.length);
      if (cs.length < 2) { expect(st[0]).toEqual({ style: null, effect: null }); continue; }
      const risks = cs.map((c) => c.risk), lo = Math.min(...risks), hi = Math.max(...risks);
      cs.forEach((c, i) => {
        const s = st[i];
        if (lo === hi) return expect(s.style).toBeNull();
        if (c.risk === lo) {
          expect(s.style).toBe('cautious');
          if (s.effect === 'fewerInjuries') for (const o of cs.filter((x) => x.risk === hi)) expect(injuredOf(c)).toBeLessThan(injuredOf(o));
          else expect(s.effect).toBe('safer');
          seen++;
        } else if (c.risk === hi) {
          expect(s.style).toBe('bold');
          if (s.effect === 'moreRewards') for (const o of cs.filter((x) => x.risk === lo)) expect(gainsOf(c)).toBeGreaterThan(gainsOf(o));
          else expect(s.effect).toBe('riskier');
        } else expect(s.style).toBe('balanced');
      });
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('la mission du Kraken : prudent et audacieux bien distingués', () => {
    const k = MISSIONS.find((m) => m.id === 'kraken');
    if (!k) return;
    const st = choiceStyles(k.choices);
    expect(new Set(st.map((s) => s.style)).size).toBe(k.choices.length === 2 ? 2 : st.length > 2 ? 3 : 1);
  });
});

describe('pastilles de risque', () => {
  it('1 vert, 2 orange, 3 rouges, sur les seuils de faible / mesuré / élevé', () => {
    expect([0, 0.12].map(riskDots)).toEqual([1, 1]);
    expect([0.13, 0.22].map(riskDots)).toEqual([2, 2]);
    expect([0.23, 0.32, 0.5].map(riskDots)).toEqual([3, 3, 3]);
  });
});

describe('phrase de la carte', () => {
  it('une phrase courte reste entière', () => {
    expect(cardPhrase('Deux galères, harpons en main.')).toBe('Deux galères, harpons en main.');
  });
  it('une phrase longue : première phrase courte, sinon première proposition, sinon rien ; jamais coupée au milieu', () => {
    expect(cardPhrase('Une carcasse en appât entre les galères. Plus long, plus sûr, et très très très lent.')).toBe('Une carcasse en appât entre les galères.');
    expect(cardPhrase('Plus de poisson, plus de chemin : on prend le large, loin des côtes connues.')).toBe('Plus de poisson, plus de chemin');
    expect(cardPhrase('Long mais sûr : on creuse des fosses sur son passage, à la pelle.')).toBe('Long mais sûr');
    expect(cardPhrase('Un deux trois quatre cinq six sept huit neuf dix onze')).toBe('');
  });
  it('sur tout le jeu : la phrase est vide ou un début de phrase complet', () => {
    for (const m of MISSIONS) for (const c of m.choices) {
      const p = cardPhrase(c.text);
      expect(p.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(10);
      if (p) expect(c.text.startsWith(p)).toBe(true);
    }
  });
});
