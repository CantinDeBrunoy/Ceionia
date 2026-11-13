import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { zoneOrigins } from '../src/build/zones';
import { War } from '../src/sim/war';
import { HellMap } from '../src/world/hell';
import { Hell } from '../src/sim/hell';
import { CommandUI, Theater } from '../src/ui/command';

/** Le menu de l'île du portail : le même composant que « Ma base » des Enfers (onglets Bâtir et Recruter), sans bloc vide */

const fakeEl = (): Record<string, unknown> => {
  const el: Record<string, unknown> = { style: {}, dataset: {}, innerHTML: '', textContent: '', title: '', children: [] };
  el.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  el.append = () => {}; el.prepend = () => {}; el.setAttribute = () => {}; el.addEventListener = () => {}; el.querySelector = () => null; el.getBoundingClientRect = () => ({ top: 0, bottom: 0 });
  return el;
};

beforeAll(() => setMapSize(192));

const build = (kind: 'isle' | 'hell') => {
  (globalThis as any).document = { createElement: fakeEl, body: { classList: { toggle() {}, add() {}, remove() {} } } };
  const w = new World();
  newWorld(w, 3, 2026, GEN);
  w.exp.done.push('portal');
  const t = zoneOrigins(w, 'watchtower')[0];
  w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
  const war = new War(w);
  war.skipInvasion();
  war.update(0.1, 1);
  const sim = kind === 'isle' ? war.isle!.sim : new Hell(new HellMap(1));
  const host: any = {
    war, canvas: { style: {} }, camKeys: new Set(), toast() {}, click() {}, age: () => 1, pop: () => 10, paused: () => false,
    defenseInfo: (k: string) => ({ name: k, icon: '🏹', desc: '' }), defenseLock: () => null, defenseCount: () => 1, buildDefense() {},
  };
  const ui = new CommandUI(fakeEl() as unknown as HTMLElement, host);
  const theater: Theater = { kind, sim, layer: { selected: new Set() } as never, pick: () => null, screen: () => null, focus() {} };
  ui.setTheater(theater);
  ui.render();
  return { ui, html: () => (ui as any).bar.innerHTML as string };
};

describe('le menu de l’île', () => {
  it('« Ma garnison » a les onglets Bâtir et Recruter, comme « Ma base » des Enfers', () => {
    const isle = build('isle').html();
    expect(isle).toContain('Ma garnison');
    expect(isle).toContain('data-a="tab:build"');
    expect(isle).toContain('data-a="tab:rec"');
    expect(isle).toContain('class="tmenu panel tbase tbarr"');
    // les recrues se montrent dans les mêmes tuiles que les recrues des Enfers
    expect(isle).toMatch(/data-a="rec:soldier" class="trb tb rh /);
    // les onglets sont les deux modes du petit panneau de gauche, comme Bâtir / Paysage au village
    expect(isle).toMatch(/class="ttool panel"><span class="ttabs"><button data-a="tab:build"/);
    // dans les Enfers, la même barre : « Ma base » est ouverte d'emblée, avec les mêmes onglets à gauche (plus de tiroir)
    const { html } = build('hell');
    expect(html()).not.toContain('data-a="base"');
    expect(html()).toContain('Ma base');
    expect(html()).toContain('data-a="tab:build"');
    expect(html()).toContain('class="tmenu panel tbase tbarr"');
  });

  it('chaque onglet Bâtir montre aussi, grisés, les bâtiments de l’autre théâtre', () => {
    const isle = build('isle');
    (isle.ui as any).isleTab = 'build';
    (isle.ui as any).barKey = '';
    isle.ui.render();
    expect(isle.html()).toMatch(/class="trb tb tbv off far" disabled/);
    expect(build('hell').html()).toMatch(/class="trb tb tbv off far" disabled/);
  });

  it('les Enfers sans le superflu : ni carte de passage, ni « Suivre », ni bulle d’aide tant qu’on ne bâtit pas', () => {
    const { ui, html } = build('hell');
    (ui as any).units = () => [{ id: 1, kind: 'soldier', x: 30, z: 12, hp: 10, maxHp: 10 }];
    (ui as any).barKey = '';
    ui.render();
    const h = html();
    expect(h).not.toContain('data-a="portal"');
    expect(h).not.toContain('data-a="follow"');
    expect(h).not.toContain('class="tbub"');
    expect(h).toContain('class="tcard');
    // un bâtiment à poser : la bulle dit comment faire
    ui.startPlacing('camp');
    expect(html()).toContain('class="tmenu panel tbase tbarr"');
    expect(html()).toContain('class="tbub"');
  });

  it('l’onglet Bâtir propose les défenses de l’île ; plus d’ancien bloc « Caserne » sans onglets', () => {
    const { ui, html } = build('isle');
    expect(html()).not.toContain('<h5>Caserne');
    (ui as any).isleTab = 'build';
    ui.render();
    (ui as any).barKey = '';
    ui.render();
    const h = html();
    for (const k of ['watchtower', 'barracks', 'wall', 'gate']) expect(h).toContain(`data-a="ibuild:${k}"`);
  });

  it('le retour est « Retourner au village », sur l’île comme dans les Enfers', () => {
    expect(build('isle').html()).toContain('Retourner au village');
    expect(build('hell').html()).toMatch(/data-a="leave"[^>]*>.*Retourner au village/);
  });
});
