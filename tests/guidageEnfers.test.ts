import { describe, it, expect, afterEach } from 'vitest';
import { HellMap, HELL_ZONES } from '../src/world/hell';
import { Hell } from '../src/sim/hell';
import { troopStats } from '../src/sim/army';
import { nextGoal, goalLine, zoneLine } from '../src/sim/objective';
import { escapeAction, CommandUI, CONTROLS_HELP, PORTAL_REACH, Theater } from '../src/ui/command';
import { WAR_TIP_TEXT, WAR_TIP_MAX } from '../src/ui/warTips';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';

afterEach(() => setLang('fr', false));

/** La faction, les zones 1 à `upTo` conquises (forteresses abattues, garnisons balayées) */
const setup = (upTo = 0, age = 1) => {
  const m = new HellMap(1), h = new Hell(m);
  h.age = age;
  for (let z = 1; z <= upTo; z++) {
    for (const s of h.standing(z)) h.damage(s, 1e6, -1);
    for (const u of h.garrison(z)) u.hp = 0;
  }
  h.events.length = 0;
  return { m, h };
};

describe('l’objectif suivant dans les Enfers', () => {
  it('à l’arrivée : l’avant-poste de la première zone, tout près ; puis la forteresse quand on est passé devant', () => {
    const { m, h } = setup(0);
    const g = nextGoal(h, m.arrival);
    expect(g.kind).toBe('outpost');
    expect(g.zone).toBe(1);
    // il est à portée de la vue (moins de vingt cases du point d’arrivée)
    expect(Math.hypot(g.x! - m.arrival[0], g.z! - m.arrival[1])).toBeLessThan(20);
    const fort = h.standing(1).find((b) => b.kind === 'fortress')!;
    const near = nextGoal(h, [fort.site.x, fort.site.z - 4]);
    expect(near.kind).toBe('fortress');
    expect([near.x, near.z]).toEqual([fort.site.x, fort.site.z]);
  });

  it('l’avant-poste abattu, la forteresse ; la forteresse abattue, la zone suivante', () => {
    const { m, h } = setup(0);
    h.damage(h.standing(1).find((b) => b.kind === 'outpost')!, 1e6, -1);
    expect(nextGoal(h, m.arrival).kind).toBe('fortress');
    const two = setup(1);
    const g = nextGoal(two.h, two.m.arrival);
    expect(g.zone).toBe(2);
    expect(g.kind).toBe('outpost');
  });

  it('les zones que l’âge ne permet pas d’ouvrir : pas de cible, et la phrase dit pourquoi', () => {
    const { m, h } = setup(2, 1);
    const g = nextGoal(h, m.arrival);
    expect(g.kind).toBe('locked');
    expect(g.x).toBeUndefined();
    expect(goalLine(g, null)).toMatch(/il faut l’âge/);
    // un âge de plus : la zone suivante s’ouvre
    h.age = 2;
    expect(nextGoal(h, m.arrival).kind).toBe('outpost');
  });

  it('le royaume : sa citadelle ; vaincu : plus rien à viser', () => {
    const { m, h } = setup(5, 5);
    const g = nextGoal(h, m.arrival);
    expect(g.kind).toBe('kingdom');
    expect(g.zone).toBe(6);
    h.victory = true;
    expect(nextGoal(h, m.arrival).kind).toBe('done');
  });

  it('les phrases : courtes, avec la distance, et la zone ouverte', () => {
    const { m, h } = setup(0);
    const g = nextGoal(h, m.arrival);
    expect(zoneLine(h)).toBe(`Zone ouverte : ${HELL_ZONES[1].name}`);
    expect(goalLine(g, 17.2)).toBe('Objectif : abattre l’avant-poste (à 17 cases)');
    expect(goalLine(g, 1)).toBe('Objectif : abattre l’avant-poste (à 1 case)');
    setLang('en', false);
    expect(goalLine(g, 17.2)).toBe('Goal: destroy the outpost (17 tiles away)');
    expect(zoneLine(h)).toBe('Open zone: Ember Caves');
  });
});

describe('Échap dans le commandement', () => {
  const s = (o: Partial<Parameters<typeof escapeAction>[0]> = {}) => escapeAction({ kind: 'hell', placing: false, trace: false, armed: false, selected: 0, ...o });
  it('lâche le bâtiment, abandonne le mur, désarme, désélectionne, dans cet ordre', () => {
    expect(s({ placing: true })).toBe('stopPlacing');
    expect(s({ placing: true, trace: true })).toBe('cancelTrace');
    expect(s({ armed: true, selected: 3 })).toBe('disarm');
    expect(s({ selected: 3 })).toBe('deselect');
  });
  it('ne quitte jamais les Enfers (un rappel à la place) ; sur l’île, il range le commandement', () => {
    expect(s()).toBe('hint');
    expect(s({ kind: 'isle' })).toBe('leaveIsle');
  });
});

describe('textes d’aide', () => {
  it('l’annonce du portail dit où il mène et que faire, en une phrase courte, traduite', () => {
    const fr = WAR_TIP_TEXT.portal;
    expect(fr).toMatch(/Enfers/);
    expect(fr).toMatch(/Le portail de l’autre rive/);
    expect(fr.length).toBeLessThanOrEqual(WAR_TIP_MAX);
    setLang('en', false);
    expect(tr(fr)).toMatch(/Hell/);
  });
  it('l’aide des contrôles dit comment déplacer la vue, zoomer et passer le portail', () => {
    const all = CONTROLS_HELP.map(([k, t]) => `${k} ${t}`).join(' ');
    for (const w of ['Flèches', 'Maj + clic droit', 'clic milieu', 'Molette', 'tourner la vue', 'portail']) expect(all).toContain(w);
    // (le glisser du clic gauche trace un cadre : il ne déplace pas la vue)
    expect(all).not.toContain('déplacer la vue (sur le sol)');
  });
});

/** Un faux document, assez pour construire l'interface hors navigateur */
const fakeEl = (): Record<string, unknown> => {
  const el: Record<string, unknown> = { style: {}, dataset: {}, innerHTML: '', textContent: '', title: '', children: [] };
  el.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  el.append = () => {}; el.prepend = () => {}; el.setAttribute = () => {}; el.addEventListener = () => {}; el.querySelector = () => null; el.getBoundingClientRect = () => ({ top: 0, bottom: 0 });
  return el;
};

describe('le portail, cible d’un ordre de déplacement', () => {
  const build = (kind: 'hell' | 'isle') => {
    (globalThis as any).document = { createElement: fakeEl, body: { classList: { toggle() {}, add() {}, remove() {} } } };
    const m = new HellMap(1), h = new Hell(m);
    const us = [0, 1, 2].map((i) => h.addPlayerUnit('soldier', troopStats('soldier', 1), 30 + i, 12));
    const sent: number[][] = [];
    const [px, pz] = m.portal;
    const host: any = {
      war: { portalOut: false, hellWhy: () => null, sendThroughPortal: (l: { id: number }[]) => sent.push(l.map((u) => u.id)) },
      canvas: { style: {} }, camKeys: new Set(), toast() {}, click() {}, age: () => 1, pop: () => 10, paused: () => false,
      went: [] as string[], goHell() { this.went.push('hell'); }, leaveHell() { this.went.push('village'); },
    };
    const ui = new CommandUI(fakeEl() as unknown as HTMLElement, host);
    ui.render = () => {};
    // le « pixel » est directement le point de la carte
    const t: Theater = { kind, sim: h, layer: { selected: new Set() } as never, pick: (x, y) => [x, y], screen: () => null, focus() {}, atPortal: (x, z) => Math.hypot(x - px, z - pz) < PORTAL_REACH };
    ui.setTheater(t);
    return { ui, us, sent, m, h, portal: [px, pz] as const };
  };

  it('un ordre sur le portail envoie la sélection, et seulement elle', () => {
    for (const kind of ['hell', 'isle'] as const) {
      const { ui, us, sent, portal } = build(kind);
      ui.cmd.select([us[0].id, us[2].id]);
      ui.rightClick({ x: portal[0] + 1, y: portal[1], touch: false, button: 2 });
      expect(sent, kind).toEqual([[us[0].id, us[2].id]]);
    }
  });

  it('hors du portail, rien ne passe : l’ordre est un déplacement ordinaire ; sans sélection, rien', () => {
    const { ui, us, sent, m } = build('hell');
    ui.cmd.select([us[0].id]);
    ui.rightClick({ x: m.arrival[0] + 6, y: m.arrival[1] + 4, touch: false, button: 2 });
    expect(sent).toEqual([]);
    expect(us[0].order?.kind).toBe('move');
    ui.cmd.clear();
    ui.rightClick({ x: m.portal[0], y: m.portal[1], touch: false, button: 2 });
    expect(sent).toEqual([]);
  });

  it('un clic sur le portail passe de l’autre côté : de l’île aux Enfers, des Enfers au village', () => {
    for (const [kind, to] of [['isle', 'hell'], ['hell', 'village']] as const) {
      const { ui, us, portal } = build(kind);
      // (même avec des troupes choisies : le clic gauche n'est pas un ordre)
      ui.cmd.select([us[0].id]);
      const e = { x: portal[0] + 0.5, y: portal[1], touch: false, button: 0 };
      ui.down(e); ui.up(e);
      expect((ui as any).host.went, kind).toEqual([to]);
    }
  });

  it('un clic hors du portail ne quitte pas les Enfers', () => {
    const { ui, m } = build('hell');
    const e = { x: m.arrival[0] + 6, y: m.arrival[1] + 4, touch: false, button: 0 };
    ui.down(e); ui.up(e);
    expect((ui as any).host.went).toEqual([]);
  });

  it('le royaume tombé, le portail de l’île est éteint : plus de passage vers les Enfers', () => {
    const { ui, us, sent, portal } = build('isle');
    (ui as any).host.war.portalOut = true;
    ui.cmd.select([us[0].id]);
    ui.rightClick({ x: portal[0], y: portal[1], touch: false, button: 2 });
    expect(sent).toEqual([]);
  });
});
