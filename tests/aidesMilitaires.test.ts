import { describe, it, expect } from 'vitest';
import { nextWarTip, WarTipState, WAR_TIP_TEXT, WAR_TIP_MAX } from '../src/ui/warTips';
import { CONTROLS_HELP } from '../src/ui/command';

const base = (o: Partial<WarTipState> = {}): WarTipState => ({
  age: 0, portalOpen: false, portalUnderway: false, towers: 0, barracks: 0, isleTroops: 0, commanding: null, frontier: 1, camp: false, victory: false, ...o,
});
const none = new Set<string>();

describe('les aides du volet militaire', () => {
  it('rien au démarrage (Préhistoire) ; la mission du portail à l’Antiquité, tant qu’aucune équipe n’est partie', () => {
    expect(nextWarTip(base(), none)).toBeNull();
    expect(nextWarTip(base({ age: 1 }), none)).toBe('portal');
    expect(nextWarTip(base({ age: 1, portalUnderway: true }), none)).toBeNull();
  });

  it('au moment utile : les défenses de l’île, la garnison, ses ordres, les Enfers, la base, le royaume', () => {
    expect(nextWarTip(base({ age: 1, portalOpen: true }), none)).toBe('isle');
    expect(nextWarTip(base({ age: 1, portalOpen: true, towers: 1, barracks: 1 }), none)).toBeNull();
    expect(nextWarTip(base({ age: 1, portalOpen: true, towers: 1, barracks: 1, isleTroops: 3 }), none)).toBe('garrison');
    expect(nextWarTip(base({ age: 1, portalOpen: true, towers: 1, barracks: 1, isleTroops: 3, commanding: 'isle' }), none)).toBe('orders');
    const hell = base({ age: 2, portalOpen: true, towers: 1, barracks: 1, commanding: 'hell' });
    expect(nextWarTip(hell, none)).toBe('hell');
    expect(nextWarTip({ ...hell, frontier: 2 }, new Set(['hell']))).toBe('base');
    expect(nextWarTip({ ...hell, frontier: 2, camp: true }, new Set(['hell']))).toBeNull();
    expect(nextWarTip({ ...hell, frontier: 6, camp: true }, new Set(['hell', 'base']))).toBe('kingdom');
    // le royaume tombé : plus rien à en dire
    expect(nextWarTip({ ...hell, frontier: 6, camp: true, victory: true }, new Set(['hell', 'base']))).toBeNull();
  });

  it('chacune ne se montre qu’une fois ; rien pendant le tutoriel ou quand les aides sont masquées', () => {
    const s = base({ age: 1 });
    expect(nextWarTip(s, new Set(['portal']))).toBeNull();
    expect(nextWarTip(s, none, true)).toBeNull();
  });

  it('courtes (deux lignes au plus) ; la barre des troupes rappelle tous les contrôles', () => {
    for (const t of Object.values(WAR_TIP_TEXT)) expect(t.length, t).toBeLessThanOrEqual(WAR_TIP_MAX);
    const all = CONTROLS_HELP.map(([k, t]) => `${k} ${t}`).join(' ');
    for (const w of ['Clic', 'Glisser', 'Clic droit', 'H', 'R', 'A puis clic', 'Espace']) expect(all).toContain(w);
  });
});
