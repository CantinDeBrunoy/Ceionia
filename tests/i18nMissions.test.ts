import { describe, it, expect, afterEach } from 'vitest';
import { setLang, i18nEntries } from '../src/i18n';
import '../src/i18n/en';
import { MISSIONS, effectSummary } from '../src/sim/missions';

afterEach(() => setLang('fr', false));

const FIELDS = ['label', 'text', 'doing', 'winText', 'loseText'] as const;

describe('i18n : missions en anglais', () => {
  it('chaque titre, récit et choix de mission a sa traduction, rendue à la lecture', () => {
    const fr = MISSIONS.map((m) => ({ title: m.title, intro: m.intro, choices: m.choices.map((c) => FIELDS.map((f) => c[f] ?? '')) }));
    const known = i18nEntries();
    const lacking: string[] = [];
    for (const m of fr) {
      for (const t of [m.title, m.intro, ...m.choices.flat()]) if (t && !known.has(t)) lacking.push(t);
    }
    expect(lacking).toEqual([]);
    setLang('en', false);
    MISSIONS.forEach((m, i) => {
      expect(m.title).toBe(known.get(fr[i].title));
      expect(m.intro).toBe(known.get(fr[i].intro));
      m.choices.forEach((c, j) => FIELDS.forEach((f, k) => { if (fr[i].choices[j][k]) expect(c[f]).toBe(known.get(fr[i].choices[j][k])); }));
    });
    setLang('fr', false);
    expect(MISSIONS[0].title).toBe(fr[0].title);
  });

  it('les résumés d’effets suivent la langue', () => {
    const eff = [{ t: 'herd' as const, kinds: ['sheep' as const, 'sheep' as const] }, { t: 'ore' as const, n: 3 }, { t: 'injured' as const, n: 1, days: 2 }, { t: 'perk' as const, id: 'furs' }];
    expect(effectSummary(eff)).toBe('2 moutons · +3 minerai · 1 blessé (2 j) · peaux de mammouth : des fourrures pour tout le camp');
    expect(effectSummary([])).toBe('rien');
    setLang('en', false);
    expect(effectSummary(eff)).toBe('2 sheep · +3 ore · 1 injured (2 d) · mammoth hides: furs for the whole camp');
    expect(effectSummary([])).toBe('nothing');
  });
});
