import { describe, it, expect, beforeAll } from 'vitest';
import { World, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { canExpand, expandWorld } from '../src/world/expand';
import { CHOICE_LABEL, crossroadsDue, crossroadsSettled, hellWay, worldWay, waysTabShown, wayBadge, CROSSROADS_AGE } from '../src/sim/crossroads';
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
    // (ouvert sans choix : l'expédition d'une ancienne partie, le bac à sable ; il tombe dans le grand choix)
    expect(hellWay({ portal: {}, portalOpen: true }, 'ask')).toBe('open');
    expect(hellWay({ portal: {}, portalOpen: true }, 'on')).toBe('taken');
    expect(worldWay({ isles: null }, true)).toBe('open');
    expect(worldWay({ isles: null }, false)).toBe('none');
    expect(worldWay({ isles: {} }, false)).toBe('taken');
  });

  it('la carte s’ouvre à l’Antiquité quand le reste du passage est rempli (plus loin, tout de suite), jamais au bac à sable ni si une voie est déjà prise', () => {
    const w = { portal: {}, portalOpen: false, isles: null, sandbox: false, crossroads: false };
    expect(CROSSROADS_AGE).toBe(2);
    expect(crossroadsDue(w, 0, 'open', 'open', true)).toBe(false);
    // à l'Antiquité : seulement une fois les autres conditions du Médiéval remplies
    expect(crossroadsDue(w, 1, 'open', 'open', false)).toBe(false);
    expect(crossroadsDue(w, 1, 'open', 'open', true)).toBe(true);
    // une ancienne partie déjà plus loin, passée sans lui : tout de suite
    expect(crossroadsDue(w, 2, 'open', 'open', false)).toBe(true);
    expect(crossroadsDue(w, 5, 'open', 'none', false)).toBe(true);
    expect(crossroadsDue(w, 1, 'none', 'open', true)).toBe(true);
    // déjà répondu
    expect(crossroadsDue({ ...w, crossroads: true }, 1, 'open', 'open', true)).toBe(false);
    // bac à sable : les voies sont dans l'onglet des expéditions
    expect(crossroadsDue({ ...w, sandbox: true }, 1, 'open', 'open', true)).toBe(false);
    // un portail déjà ouvert (même refermé), un archipel déjà accepté : rien ne change
    for (const [h, m] of [['ask', 'open'], ['taken', 'open'], ['open', 'taken']] as const) {
      expect(crossroadsSettled(w, h, m)).toBe(true);
      expect(crossroadsDue(w, 1, h, m, true)).toBe(false);
    }
    // aucune voie possible sur cette carte : rien à choisir
    expect(crossroadsSettled(w, 'none', 'none')).toBe(true);
    expect(crossroadsSettled(w, 'open', 'open')).toBe(false);
  });

  it('l’onglet « Grands choix » : une fois le grand choix fait (au bac à sable, tout de suite), s’il reste une voie sur la carte', () => {
    expect(waysTabShown({ sandbox: false, crossroads: false }, 'open', 'open')).toBe(false);
    expect(waysTabShown({ sandbox: false, crossroads: true }, 'open', 'open')).toBe(true);
    expect(waysTabShown({ sandbox: true, crossroads: false }, 'open', 'open')).toBe(true);
    expect(waysTabShown({ sandbox: false, crossroads: true }, 'none', 'none')).toBe(false);
    // (les deux prises : l'onglet reste, il dit ce qui est fait)
    expect(waysTabShown({ sandbox: false, crossroads: true }, 'taken', 'taken')).toBe(true);
    expect(wayBadge('open')).toBe('free');
    expect(wayBadge('ask')).toBe('free');
    expect(wayBadge('taken')).toBe('taken');
    expect(wayBadge('none')).toBe('none');
  });
});

describe('le grand choix : une partie', () => {
  it('une partie neuve : les deux voies à prendre ; la carte au passage au Médiéval', () => {
    const w = village(), war = new War(w);
    expect(ways(w, war)).toEqual({ hell: 'open', world: 'open' });
    expect(crossroadsDue(w, 1, 'open', 'open', false)).toBe(false);
    expect(crossroadsDue(w, 1, 'open', 'open', true)).toBe(true);
  });

  it('« Les Enfers » : le portail s’ouvre sans expédition, les Enfers aussi (plus d’invasion à repousser, pas de seconde carte)', () => {
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
    expect(war.inv).toBe('done');
    expect(war.hellWhy()).toBeNull();
    expect(ways(w, war)).toEqual({ hell: 'taken', world: 'open' });
    // sauvegardé, rechargé : le portail reste ouvert, le choix aussi
    const back = reload(w);
    expect(back.portalOpen).toBe(true);
    expect(back.crossroads).toBe(true);
  });

  it('une ancienne sauvegarde du Médiéval sans état d’invasion : prendre les Enfers les ouvre', () => {
    const w = village(), war = new War(w);
    // (une partie d'avant l'invasion en trois vagues : `War.save` sans `invasion` ni `pve`)
    war.load({ army: { troops: [], queue: [] } });
    w.portalWoken = true;
    war.wake();
    war.update(0.1, 3);
    expect(war.inv).toBe('done');
    expect(war.pve).toBe('on');
  });

  it('« Ni l’un ni l’autre » : la carte ne revient pas, les deux voies restent à prendre dans l’onglet', () => {
    const w = village(), war = new War(w);
    w.crossroads = true;
    const back = reload(w);
    expect(back.crossroads).toBe(true);
    expect(crossroadsDue(back, 3, 'open', 'open', true)).toBe(false);
    expect(waysTabShown(back, 'open', 'open')).toBe(true);
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

  it('un portail déjà ouvert par l’expédition et refermé reste tel quel : pas de carte', () => {
    const w = village();
    w.exp.done.push('portal');
    const back = reload(w), war = new War(back);
    war.load({ army: { troops: [], queue: [] }, invasion: 'wait', pve: 'off', choiceSeen: true });
    expect(back.portalOpen).toBe(true);
    const s = ways(back, war);
    expect(s.hell).toBe('ask');
    expect(crossroadsSettled(back, s.hell, s.world)).toBe(true);
    expect(crossroadsDue(back, 3, s.hell, s.world, true)).toBe(false);
    // l'onglet propose de rouvrir (sa carte : « Affronter les démons »)
    expect(waysHtml(s)).toContain('data-way="hell"');
  });

  it('un portail ouvert en attente du choix (« ask ») tombe dans le grand choix ; affronté, il reste tel quel', () => {
    const w = village();
    w.exp.done.push('portal');
    const back = reload(w), war = new War(back);
    war.load({ army: { troops: [], queue: [] }, invasion: 'wait', pve: 'ask', choiceSeen: true });
    let s = ways(back, war);
    expect(s.hell).toBe('open');
    expect(crossroadsDue(back, 3, s.hell, s.world, true)).toBe(true);
    // pas d'invasion tant que le choix n'est pas fait
    war.update(0.1, 3);
    expect(war.pve).toBe('ask');
    expect(war.nextWaveIn()).toBeNull();
    // affronté dans une ancienne partie : rien ne change
    war.load({ army: { troops: [], queue: [] }, invasion: 'wait', pve: 'on', choiceSeen: true });
    s = ways(back, war);
    expect(s.hell).toBe('taken');
    expect(crossroadsDue(back, 3, s.hell, s.world, true)).toBe(false);
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
    expect(crossroadsDue(back, 3, s.hell, s.world, true)).toBe(false);
    setMapSize(192);
  });

  it('une partie déjà au Médiéval ou plus, sans portail ni archipel (même restée sur son île à l’ancienne carte) : la carte, une fois', () => {
    const w = village();
    w.explore = 'no';
    const back = reload(w, { crossroads: undefined });
    const s = ways(back, new War(back));
    for (const age of [2, 3, 4]) expect(crossroadsDue(back, age, s.hell, s.world, true)).toBe(true);
    back.crossroads = true;
    expect(crossroadsDue(reload(back), 4, s.hell, s.world, true)).toBe(false);
  });

  it('une ancienne carte sans île du portail : seule la voie du monde est proposée', () => {
    const w = village();
    const back = reload(w, { portal: undefined });
    const s = ways(back, new War(back));
    expect(s.hell).toBe('none');
    expect(crossroadsDue(back, 2, s.hell, s.world, true)).toBe(true);
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

describe('le grand choix : une condition du passage au Médiéval', () => {
  /** Une partie à l'Antiquité dont toutes les autres conditions du Médiéval sont remplies */
  const ready = (w = village()) => {
    w.unlimited = true;
    const sim = new Sim(w);
    sim.age = 1;
    for (const it of sim.ageProgress()!.items) if (it.kind) for (let i = 0; i < it.need; i++) sim.counts[it.kind] = it.need;
    return { w, sim };
  };
  const others = (sim: Sim) => sim.ageProgress()!.items.filter((i) => i.label !== CHOICE_LABEL);
  const choice = (sim: Sim) => sim.ageProgress()!.items.find((i) => i.label === CHOICE_LABEL);

  it('à l’Antiquité, la condition est là, en dernier ; tant qu’on n’a pas choisi, pas de Médiéval', () => {
    const { sim } = ready();
    const items = sim.ageProgress()!.items;
    expect(items[items.length - 1].label).toBe(CHOICE_LABEL);
    expect(choice(sim)).toMatchObject({ have: 0, need: 1 });
    // (les autres ne sont pas toutes remplies dans ce village de test : on ne regarde que celle-ci)
    expect(sim.ready).toBe(false);
  });

  it('« Ni l’un ni l’autre » compte comme un choix ; « Les Enfers » et « Explorer le monde » aussi', () => {
    const a = ready();
    a.w.crossroads = true;
    expect(choice(a.sim)!.have).toBe(1);
    // « Les Enfers » (`Game.openHell`) : le portail s'ouvre et le choix est marqué
    const b = ready();
    b.w.portalWoken = true;
    b.w.crossroads = true;
    expect(choice(b.sim)!.have).toBe(1);
  });

  it('le passage se fait quand le reste est rempli et le choix fait', () => {
    const { w, sim } = ready();
    // les autres conditions : forcées remplies (habitants, bâtiments, expéditions)
    sim.pop = 1e6;
    for (const it of others(sim)) if (it.kind) sim.counts[it.kind] = 99;
    w.exp.done.push(...mandatoriesFor(1).map((m) => m.id));
    const left = () => others(sim).filter((i) => i.have < i.need).map((i) => i.label);
    if (left().length) return; // (un village de test qui ne se laisse pas remplir : la règle est couverte ci-dessus)
    expect(sim.ready).toBe(false);
    w.crossroads = true;
    expect(sim.ageProgress()!.items.filter((i) => i.have < i.need)).toEqual([]);
    expect(sim.ready).toBe(true);
  });

  it('ni au Médiéval et après (rien à refaire), ni au bac à sable', () => {
    const { sim } = ready();
    sim.age = 2;
    expect(choice(sim)).toBeUndefined();
    const s = village();
    s.difficulty = 'sandbox';
    const sb = new Sim(s);
    sb.age = 1;
    expect(sb.ageProgress()).toBeNull();
  });

  it('une ancienne partie encore à l’Antiquité : la condition s’ajoute ; un portail ouvert sans choix y tombe aussi', () => {
    const w = village();
    const old = reload(w, { crossroads: undefined });
    const sim = new Sim(old);
    sim.age = 1;
    expect(choice(sim)!.have).toBe(0);
    const opened = reload(w, { crossroads: undefined, exp: { ...(w.toJSON() as { exp: Record<string, unknown> }).exp, done: ['portal'] } });
    const s2 = new Sim(opened);
    s2.age = 1;
    expect(opened.portalOpen).toBe(true);
    // (sans choix PvE, l'expédition d'avant ne fait pas le choix : il reste à faire ; affronté ou refermé, `stepCrossroads`
    // marque `crossroads`, et la condition est remplie)
    expect(choice(s2)!.have).toBe(0);
    expect(crossroadsDue(opened, 1, hellWay(opened, 'ask'), 'open', true)).toBe(true);
    expect(crossroadsSettled(opened, hellWay(opened, 'on'), 'open')).toBe(true);
    expect(crossroadsSettled(opened, hellWay(opened, 'off'), 'open')).toBe(true);
    opened.crossroads = true;
    expect(choice(s2)!.have).toBe(1);
  });

});

describe('l’onglet « Grands choix » des expéditions', () => {
  it('une carte par voie : image, phrase d’envie, état ; un bouton seulement si elle est disponible', () => {
    const open = waysHtml({ hell: 'open', world: 'open' });
    expect(open).toContain('data-way="hell"');
    expect(open).toContain('data-way="world"');
    expect(open).toContain('Ouvrir le portail');
    expect(open).toContain('./ui/portail.webp');
    expect(open).toContain('dio-caravel.webp');
    expect(open.match(/st-free/g)).toHaveLength(2);
    const taken = waysHtml({ hell: 'taken', world: 'open' });
    expect(taken).not.toContain('data-way="hell"');
    expect(taken).toContain('Choix fait');
    expect(taken).toContain('data-way="world"');
    expect(waysHtml({ hell: 'taken', world: 'taken' })).not.toContain('data-way=');
    // le portail refermé se rouvre ; une voie impossible sur la carte est grisée, sans bouton
    expect(waysHtml({ hell: 'ask', world: 'none' })).toContain('Rouvrir le portail');
    expect(waysHtml({ hell: 'ask', world: 'none' })).toContain('st-none');
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
