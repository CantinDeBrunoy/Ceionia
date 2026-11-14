import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { canExpand, expandWorld } from '../src/world/expand';
import { crossroadsDue, crossroadsSettled, hellWay, worldWay, waysTabShown, CROSSROADS_AGE } from '../src/sim/crossroads';
import { War } from '../src/sim/war';
import { Sim } from '../src/sim/sim';
import { Agents } from '../src/sim/agents';
import { Expeditions } from '../src/sim/expeditions';
import { MISSIONS, mandatoriesFor } from '../src/sim/missions';
import { KINDS } from '../src/build/catalog';
import { waysHtml } from '../src/ui/ways';
import { tr, setLang } from '../src/i18n';
import '../src/i18n/en';

/** Une partie neuve sur le continent de 192 (île du portail, carte qui peut s'agrandir) */
function village(seed = 2026) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, seed, GEN);
  return w;
}
/** Relit une sauvegarde du monde (comme au chargement) */
function reload(w: World, patch: Record<string, unknown> = {}) {
  const back = new World();
  back.fromJSON({ ...(JSON.parse(JSON.stringify(w.toJSON())) as Record<string, unknown>), ...patch });
  return back;
}
const ways = (w: World, war: War) => ({ hell: hellWay(w, war.pve), world: worldWay(w, canExpand({ n: w.n, gen: w.gen })) });

describe('le grand choix : les règles', () => {
  beforeAll(() => setMapSize(192));

  it('les deux voies : à prendre, en suspens, prises, impossibles', () => {
    expect(hellWay({ portal: null, portalOpen: false }, 'ask')).toBe('none');
    expect(hellWay({ portal: {}, portalOpen: false }, 'ask')).toBe('open');
    expect(hellWay({ portal: {}, portalOpen: true }, 'off')).toBe('ask');
    expect(hellWay({ portal: {}, portalOpen: true }, 'ask')).toBe('ask');
    expect(hellWay({ portal: {}, portalOpen: true }, 'on')).toBe('taken');
    expect(worldWay({ isles: null }, true)).toBe('open');
    expect(worldWay({ isles: null }, false)).toBe('none');
    expect(worldWay({ isles: {} }, false)).toBe('taken');
  });

  it('la carte s’ouvre une fois, au Médiéval et après, jamais au bac à sable ni si une voie est déjà prise', () => {
    const w = { portal: {}, portalOpen: false, isles: null, sandbox: false, crossroads: false };
    expect(CROSSROADS_AGE).toBe(2);
    expect(crossroadsDue(w, 1, 'open', 'open')).toBe(false);
    expect(crossroadsDue(w, 2, 'open', 'open')).toBe(true);
    expect(crossroadsDue(w, 5, 'open', 'none')).toBe(true);
    expect(crossroadsDue(w, 2, 'none', 'open')).toBe(true);
    // déjà répondu
    expect(crossroadsDue({ ...w, crossroads: true }, 3, 'open', 'open')).toBe(false);
    // bac à sable : les voies sont dans l'onglet des expéditions
    expect(crossroadsDue({ ...w, sandbox: true }, 3, 'open', 'open')).toBe(false);
    // un portail déjà ouvert (même refermé), un archipel déjà accepté : rien ne change
    for (const [h, m] of [['ask', 'open'], ['taken', 'open'], ['open', 'taken']] as const) {
      expect(crossroadsSettled(w, h, m)).toBe(true);
      expect(crossroadsDue(w, 3, h, m)).toBe(false);
    }
    // aucune voie possible sur cette carte : rien à choisir
    expect(crossroadsSettled(w, 'none', 'none')).toBe(true);
    expect(crossroadsSettled(w, 'open', 'open')).toBe(false);
  });

  it('l’onglet « Voies » : passé l’Antiquité (au bac à sable, tout de suite), s’il reste une voie sur la carte', () => {
    expect(waysTabShown({ sandbox: false }, 1, 'open', 'open')).toBe(false);
    expect(waysTabShown({ sandbox: false }, 2, 'open', 'open')).toBe(true);
    expect(waysTabShown({ sandbox: true }, 0, 'ask', 'open')).toBe(true);
    expect(waysTabShown({ sandbox: false }, 3, 'none', 'none')).toBe(false);
    // (les deux prises : l'onglet reste, il dit ce qui est fait)
    expect(waysTabShown({ sandbox: false }, 3, 'taken', 'taken')).toBe(true);
  });
});

describe('le grand choix : une partie', () => {
  it('une partie neuve : les deux voies à prendre ; la carte au passage au Médiéval', () => {
    const w = village(), war = new War(w);
    expect(ways(w, war)).toEqual({ hell: 'open', world: 'open' });
    expect(crossroadsDue(w, 1, 'open', 'open')).toBe(false);
    expect(crossroadsDue(w, 2, 'open', 'open')).toBe(true);
  });

  it('« Les Enfers » : le portail s’ouvre sans expédition, les démons sont à affronter d’emblée (pas de seconde carte)', () => {
    const w = village(), war = new War(w);
    w.crossroads = true;
    w.portalWoken = true;
    war.wake();
    expect(w.portalOpen).toBe(true);
    expect(w.exp.done).not.toContain('portal');
    expect(war.active).toBe(true);
    expect(war.pve).toBe('on');
    // (la carte « affronter / refermer » ne s'ouvrira pas d'elle-même)
    expect(war.choiceSeen).toBe(true);
    war.update(0.1, 2);
    expect(war.pve).toBe('on');
    expect(war.inv).toBe('wait');
    expect(ways(w, war)).toEqual({ hell: 'taken', world: 'open' });
    // sauvegardé, rechargé : le portail reste ouvert, le choix aussi
    const back = reload(w);
    expect(back.portalOpen).toBe(true);
    expect(back.crossroads).toBe(true);
  });

  it('une ancienne sauvegarde du Médiéval sans état d’invasion : prendre les Enfers lance l’invasion au début (pas « faite »)', () => {
    const w = village(), war = new War(w);
    // (une partie d'avant l'invasion en trois vagues : `War.save` sans `invasion` ni `pve`)
    war.load({ army: { troops: [], queue: [] } });
    w.portalWoken = true;
    war.wake();
    war.update(0.1, 3);
    expect(war.inv).toBe('wait');
    expect(war.pve).toBe('on');
  });

  it('« Ni l’un ni l’autre » : la carte ne revient pas, les deux voies restent à prendre dans l’onglet', () => {
    const w = village(), war = new War(w);
    w.crossroads = true;
    const back = reload(w);
    expect(back.crossroads).toBe(true);
    expect(crossroadsDue(back, 3, 'open', 'open')).toBe(false);
    expect(waysTabShown(back, 3, 'open', 'open')).toBe(true);
    expect(ways(back, war)).toEqual({ hell: 'open', world: 'open' });
  });

  it('« Explorer le monde » : le monde agrandi garde le choix et laisse la voie des Enfers ouverte', () => {
    const w = village();
    w.crossroads = true;
    const big = expandWorld(JSON.parse(JSON.stringify(w.toJSON())), w.mapId, w.seed);
    setMapSize(big.n);
    const back = new World();
    back.fromJSON(big);
    expect(back.isles).toBeTruthy();
    expect(back.crossroads).toBe(true);
    const war = new War(back);
    expect(ways(back, war)).toEqual({ hell: 'open', world: 'taken' });
    setMapSize(192);
  });
});

describe('le grand choix : les anciennes sauvegardes', () => {
  it('sans le champ : chargée, la partie n’a pas encore choisi', () => {
    const w = village();
    const back = reload(w);
    expect(back.crossroads).toBe(false);
    expect(w.toJSON()).not.toHaveProperty('crossroads');
  });

  it('un portail déjà ouvert par l’expédition (même refermé) reste tel quel : pas de carte', () => {
    const w = village();
    w.exp.done.push('portal');
    const back = reload(w), war = new War(back);
    war.load({ army: { troops: [], queue: [] }, invasion: 'wait', pve: 'off', choiceSeen: true });
    expect(back.portalOpen).toBe(true);
    const s = ways(back, war);
    expect(s.hell).toBe('ask');
    expect(crossroadsSettled(back, s.hell, s.world)).toBe(true);
    expect(crossroadsDue(back, 3, s.hell, s.world)).toBe(false);
    // l'onglet propose de rouvrir (sa carte : « Affronter les démons »)
    expect(waysHtml(s)).toContain('data-way="hell"');
  });

  it('un archipel déjà accepté reste tel quel : pas de carte', () => {
    const w = village();
    w.explore = 'no';
    const big = expandWorld(JSON.parse(JSON.stringify(w.toJSON())), w.mapId, w.seed);
    setMapSize(big.n);
    const back = new World();
    back.fromJSON({ ...big, crossroads: undefined });
    const s = ways(back, new War(back));
    expect(s.world).toBe('taken');
    expect(crossroadsDue(back, 3, s.hell, s.world)).toBe(false);
    setMapSize(192);
  });

  it('une partie déjà au Médiéval ou plus, sans portail ni archipel (même restée sur son île à l’ancienne carte) : la carte, une fois', () => {
    const w = village();
    w.explore = 'no';
    const back = reload(w, { crossroads: undefined });
    const s = ways(back, new War(back));
    for (const age of [2, 3, 4]) expect(crossroadsDue(back, age, s.hell, s.world)).toBe(true);
    back.crossroads = true;
    expect(crossroadsDue(reload(back), 4, s.hell, s.world)).toBe(false);
  });

  it('une ancienne carte sans île du portail : seule la voie du monde est proposée', () => {
    const w = village();
    const back = reload(w, { portal: undefined });
    const s = ways(back, new War(back));
    expect(s.hell).toBe('none');
    expect(crossroadsDue(back, 2, s.hell, s.world)).toBe(true);
    const html = waysHtml(s);
    expect(html).not.toContain('data-way="hell"');
    expect(html).toContain('data-way="world"');
  });
});

describe('le grand choix : l’expédition du portail et l’Antiquité', () => {
  it('l’expédition du portail n’est plus obligatoire ni proposée (sauf en route dans une ancienne partie)', () => {
    const portal = MISSIONS.find((m) => m.id === 'portal')!;
    expect(portal.mandatory).toBe(false);
    expect(mandatoriesFor(1).map((m) => m.id)).not.toContain('portal');
    const w = village(), ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    expect(ex.list(1).map((m) => m.id)).not.toContain('portal');
    ex.active.push({ m: portal } as never);
    expect(ex.list(1).map((m) => m.id)).toContain('portal');
  });

  it('sortir de l’Antiquité ne demande rien du portail ; la tour de garde ne dépend plus d’aucune expédition', () => {
    const w = village();
    w.unlimited = true;
    const sim = new Sim(w);
    sim.age = 1;
    expect(sim.ageProgress()!.items.some((i) => i.label.includes('portail'))).toBe(false);
    expect(KINDS.watchtower.reqMission).toBeUndefined();
  });
});

describe('l’onglet « Voies » des expéditions', () => {
  it('chaque voie non prise a son bouton ; la voie prise le dit, sans bouton', () => {
    const open = waysHtml({ hell: 'open', world: 'open' });
    expect(open).toContain('data-way="hell"');
    expect(open).toContain('data-way="world"');
    expect(open).toContain('Ouvrir le portail');
    const taken = waysHtml({ hell: 'taken', world: 'open' });
    expect(taken).not.toContain('data-way="hell"');
    expect(taken).toContain('voie prise');
    expect(taken).toContain('data-way="world"');
    const both = waysHtml({ hell: 'taken', world: 'taken' });
    expect(both).not.toContain('data-way=');
    // le portail ouvert sans qu'on affronte ses démons
    expect(waysHtml({ hell: 'ask', world: 'none' })).toContain('Affronter les démons');
  });

  it('textes traduits en anglais', () => {
    setLang('en', false);
    try {
      const html = waysHtml({ hell: 'open', world: 'open' });
      expect(html).toContain('Open the portal');
      expect(html).toContain('Explore the world');
      expect(tr('Le grand choix')).toBe('The great choice');
      expect(tr('Ni l’un ni l’autre')).toBe('Neither');
    } finally { setLang('fr', false); }
  });
});
