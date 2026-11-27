import { describe, it, expect, afterEach } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { archLayout } from '../src/world/archipelago';
import { War } from '../src/sim/war';
import { hellWay, hellWayForced, waysTabShown, worldWay, type HellTrace } from '../src/sim/crossroads';
import { bindPostReady, chooseAlly, endgameOpen, endgameWhy, allyPostReadyNow, pathDue, choosePath } from '../src/sim/diplomacy';
import { peoplesView } from '../src/sim/peoples';
import type { Difficulty } from '../src/sim/difficulty';

/** Une carte avec l'île du portail, à la difficulté voulue */
function portalWorld(difficulty: Difficulty) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026, GEN);
  w.difficulty = difficulty;
  return w;
}

/** La même partie, rechargée depuis une sauvegarde de la guerre (`war`), puis un pas de jeu à l'âge `age` */
function reload(w: World, war: unknown, age: number) {
  const g = new War(w);
  g.load(war);
  g.update(0.1, age);
  return g;
}

describe('bac à sable : les deux voies du grand choix', () => {
  it('une partie neuve : les deux voies sont libres, l’onglet « Grands choix » est là dès le départ', () => {
    const w = portalWorld('sandbox');
    w.portalWoken = true;
    const war = new War(w);
    war.update(0.1, 3);
    expect(war.pve).toBe('ask');
    const hell = hellWay(w, war.pve), world = worldWay(w, true);
    expect(hell).toBe('open');
    expect(world).toBe('open');
    expect(waysTabShown(w, hell, world)).toBe(true);
  });

  it('une ancienne sauvegarde sans choix PvE, passé l’Antiquité : la voie des Enfers reste libre (avant : « Choix fait » d’office)', () => {
    const w = portalWorld('sandbox');
    w.portalWoken = true;
    const war = reload(w, {}, 3);
    expect(war.pve).toBe('ask');
    expect(hellWay(w, war.pve)).toBe('open');
    // (en Normal, rien ne change : une ancienne partie au Médiéval compte l'invasion faite et joue le PvE)
    const n = portalWorld('normal');
    n.exp.done.push('portal');
    expect(reload(n, {}, 3).pve).toBe('on');
  });

  it('une sauvegarde déjà prise d’office (choix `on` jamais fait, rien joué) se débloque, bâton compris', () => {
    const w = portalWorld('sandbox');
    w.portalWoken = true;
    w.staff = 'stolen';
    const war = reload(w, { invasion: 'done', pve: 'on', visited: true }, 3);
    expect(war.pve).toBe('ask');
    expect(war.inv).toBe('wait');
    expect(w.staff).toBe('home');
    expect(hellWay(w, war.pve)).toBe('open');
  });

  it('un vrai choix, ou des Enfers joués, ne sont jamais défaits ; hors bac à sable, rien ne bouge', () => {
    // le joueur a choisi lui-même
    const a = portalWorld('sandbox');
    a.portalWoken = true;
    expect(reload(a, { invasion: 'done', pve: 'on', choiceSeen: true }, 3).pve).toBe('on');
    // des troupes levées
    const b = portalWorld('sandbox');
    b.portalWoken = true;
    const army = { troops: [{ id: 1, kind: 'soldier', hp: 10, maxHp: 10, where: 'hell', heal: 0 }], queue: [], nextId: 2 };
    expect(reload(b, { invasion: 'done', pve: 'on', army }, 3).pve).toBe('on');
    // en Normal, même prise d'office
    const c = portalWorld('normal');
    c.exp.done.push('portal');
    c.staff = 'stolen';
    expect(reload(c, { invasion: 'done', pve: 'on', visited: true }, 3).pve).toBe('on');
    expect(c.staff).toBe('stolen');
  });

  it('la règle pure : seulement au bac à sable, sans réponse du joueur, sans rien de joué', () => {
    const t: HellTrace = { sandbox: true, choiceSeen: false, pve: 'on', troops: 0, queued: 0, towers: 0, barracks: 0, base: 0, conquered: false };
    expect(hellWayForced(t)).toBe(true);
    expect(hellWayForced({ ...t, sandbox: false })).toBe(false);
    expect(hellWayForced({ ...t, choiceSeen: true })).toBe(false);
    expect(hellWayForced({ ...t, pve: 'ask' })).toBe(false);
    expect(hellWayForced({ ...t, pve: 'off' })).toBe(false);
    for (const k of ['troops', 'queued', 'towers', 'barracks', 'base'] as const) expect(hellWayForced({ ...t, [k]: 1 })).toBe(false);
    expect(hellWayForced({ ...t, conquered: true })).toBe(false);
  });
});

describe('bac à sable : le conflit des deux îles', () => {
  /** L'archipel accepté, l'allié choisi, sans port ni comptoir chez lui */
  const allied = (difficulty: Difficulty) => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026);
    w.difficulty = difficulty;
    w.isles = { ...archLayout(11), main: { x: 0, z: 0, n: N } };
    chooseAlly(w.diplo, 'orient');
    bindPostReady(() => false);
    return w;
  };
  afterEach(() => bindPostReady(() => true));

  it('pas de port ni de comptoir à poser chez l’allié : le dénouement s’ouvre dès le Médiéval', () => {
    const w = allied('sandbox');
    expect(allyPostReadyNow(w)).toBe(true);
    expect(endgameWhy(w, 2)).toBeNull();
    expect(endgameOpen(w, 2)).toBe(true);
    expect(endgameOpen(w, 5)).toBe(true);
    expect(choosePath(w.diplo, 'war')).toBe(true);
    // (hors bac à sable, le port et le comptoir restent exigés)
    const n = allied('normal');
    expect(endgameOpen(n, 2)).toBe(false);
    expect(endgameWhy(n, 2)).toMatch(/port et un comptoir/);
  });

  it('avant le Médiéval, il dit qu’il suffit de changer d’âge (le texte du mode Normal ne change pas)', () => {
    expect(endgameWhy(allied('sandbox'), 1)).toMatch(/panneau de l’âge/);
    expect(endgameWhy(allied('normal'), 1)).toBe('Le conflit des deux îles s’ouvre au Médiéval.');
  });

  it('la carte paix ou guerre peut s’ouvrir d’elle-même (le bac à sable n’a pas d’autre condition d’âge)', () => {
    // (`Game.othersDone` vaut vrai au bac à sable)
    expect(pathDue(allied('sandbox'), 2, true)).toBe(true);
  });

  it('le panneau « Peuples » : les gestes du conflit sont ouverts au Médiéval sans port ni comptoir, et disent comment y aller avant', () => {
    const w = allied('sandbox');
    const ctx = { tradeOpen: false, postReady: allyPostReadyNow(w), canExplore: true, sandbox: true };
    const rival = (age: number) => peoplesView(w, { ...ctx, age }).cards.find((c) => c.people === 'asie')!;
    const war = (age: number) => rival(age).gestures.find((g) => g.id === 'war')!;
    expect(war(1).on).toBe(false);
    expect(war(1).why).toMatch(/changez d’âge/);
    expect(war(2).on).toBe(true);
    // (hors bac à sable, « Au Médiéval » tout court)
    const n = peoplesView(w, { ...ctx, sandbox: false, age: 1 }).cards.find((c) => c.people === 'asie')!;
    expect(n.gestures.find((g) => g.id === 'war')!.why).toBe('Au Médiéval');
  });
});
