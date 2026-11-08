import { describe, it, expect, afterAll } from 'vitest';
import { setLang } from '../src/i18n';
import '../src/i18n/en';
import { fmtNum } from '../src/i18n/format';
import { EVENTS } from '../src/sim/events';
import { GEAR, DANGER_NAME, DANGER_VS, gearCostLabel } from '../src/sim/gear';

/** tous les textes d'affichage des imprévus et de l'équipement, dans la langue courante */
const texts = () => [
  ...EVENTS.flatMap((e) => [e.title, e.text, ...e.options.flatMap((o) => [o.label, o.text])]),
  ...GEAR.flatMap((g) => [g.name, g.plural, g.desc]),
  ...Object.values(DANGER_NAME), ...Object.values(DANGER_VS),
];
/** mots identiques dans les deux langues */
const SAME = new Set(['Grenades', 'Torches']);

describe('anglais : imprévus et équipement', () => {
  afterAll(() => setLang('fr', false));

  it('chaque imprévu, option et pièce a sa traduction', () => {
    setLang('fr', false);
    const fr = texts();
    setLang('en', false);
    const en = texts();
    expect(en.length).toBe(fr.length);
    const bad = fr.filter((s, i) => s === en[i] && !SAME.has(s));
    expect(bad).toEqual([]);
  });

  it('prix en anglais et nombres', () => {
    setLang('en', false);
    expect(gearCostLabel({ wood: 2, stone: 1, ore: 0 })).toBe('2 wood and 1 stone');
    expect(fmtNum(1500.5)).toBe('1,500.5');
    setLang('fr', false);
    expect(gearCostLabel({ wood: 2, stone: 1, ore: 0 })).toBe('2 bois et 1 pierre');
    expect(fmtNum(1.5)).toBe('1.5');
  });
});
