import { describe, it, expect, afterEach } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { archLayout } from '../src/world/archipelago';
import { MISSIONS, applyEffects, redoEffects, isMilitary, readExpState } from '../src/sim/missions';
import { eventsFor } from '../src/sim/events';
import { Sim } from '../src/sim/sim';
import {
  newDiplo, readDiplo, saveDiplo, archipelagoOn, missionOffered, missionWhy, allyPending, chooseAlly, endgameOpen, choosePath,
  warEngaged, winAllyWar, tributePerDay, settleLate, ageGate, conflictState, conflictItem, rivalPost, kindOffered, spaceportWhy,
  onRival, isleOf, rivalOf, PEACE_CHAIN, PEACE_MISSION, WAR_MISSION, WAR_SPOILS, CONFLICT_LABEL, bindPostReady, endgameWhy, claimVictory, pathDue,
} from '../src/sim/diplomacy';

/** Un petit continent (192 cases), sans archipel */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  return w;
}
/** Le même, comme s'il avait accepté l'archipel (la place des îles d'une graine, l'île principale couvrant la carte) */
function withIsles(w = continent()) {
  w.isles = { ...archLayout(11), main: { x: 0, z: 0, n: N } };
  return w;
}
const done = (w: World, id: string) => { w.exp.done.push(id); };

describe('diplomatie : l’état sauvegardé', () => {
  it('une partie neuve n’a rencontré personne, et n’écrit rien dans la sauvegarde', () => {
    const w = continent();
    expect(w.diplo).toEqual(newDiplo());
    expect(saveDiplo(w.diplo)).toBeUndefined();
    expect('diplo' in w.toJSON()).toBe(false);
  });

  it('l’état se sauvegarde et se relit ; une ancienne sauvegarde ou un champ abîmé donnent l’état vierge', () => {
    const w = continent();
    Object.assign(w.diplo, { met: ['orient', 'asie'], ally: 'asie', path: 'peace', conflict: 'peace', asked: true, post: true, feast: false });
    const saved = JSON.parse(JSON.stringify(w.toJSON()));
    expect(saved.diplo.ally).toBe('asie');
    const r = new World();
    r.fromJSON(saved);
    expect(r.diplo).toEqual(w.diplo);
    const { diplo, ...old } = saved;
    void diplo;
    const o = new World();
    o.fromJSON(old);
    expect(o.diplo).toEqual(newDiplo());
    expect(readDiplo({ met: ['mars', 'asie'], ally: 'lune', path: 'x', conflict: 7, warned: 'oui' })).toEqual({ ...newDiplo(), met: ['asie'] });
    // un allié sans rencontre : la rencontre est sous-entendue
    expect(readDiplo({ ally: 'orient' }).met).toEqual(['orient', 'asie']);
  });

  it('une ancienne partie restée neutre doit choisir de nouveau (paix ou guerre), et la carte se rouvre', () => {
    const d = readDiplo({ met: ['orient', 'asie'], ally: 'orient', path: 'neutral', conflict: 'open', asked: true, warned: true });
    expect(d.path).toBeNull();
    expect(d.asked).toBe(false);
    expect('warned' in d).toBe(false);
  });
});

describe('diplomatie : le choix de l’allié', () => {
  it('sans l’archipel, rien de la diplomatie n’est proposé ; le premier contact n’existe plus', () => {
    const w = continent();
    expect(archipelagoOn(w)).toBe(false);
    expect(allyPending(w)).toBe(false);
    for (const id of [...PEACE_CHAIN, WAR_MISSION]) expect(missionOffered(w, id)).toBe(false);
    expect(missionOffered(w, 'mine')).toBe(true);
    expect(MISSIONS.find((m) => m.id === 'contact')).toBeUndefined();
    // une ancienne partie qui l'avait réussi : l'id s'oublie, rien ne casse
    expect(readExpState({ done: ['herd', 'contact'] }).done).toEqual(['herd']);
  });

  it('l’archipel accepté, la carte de l’allié attend tant qu’il n’est pas choisi ; le choix est définitif et rencontre les deux peuples', () => {
    const w = withIsles();
    expect(allyPending(w)).toBe(true);
    for (const id of [...PEACE_CHAIN, WAR_MISSION]) expect(missionOffered(w, id)).toBe(false);
    expect(chooseAlly(w.diplo, 'asie')).toBe(true);
    expect(w.diplo.met).toEqual(['orient', 'asie']);
    expect(allyPending(w)).toBe(false);
    expect(chooseAlly(w.diplo, 'orient')).toBe(false);
    expect(w.diplo.ally).toBe('asie');
    expect(rivalOf('asie')).toBe('orient');
    // une ancienne partie qui a rencontré les peuples (premier contact) sans choisir : la carte s'ouvre aussi
    const old = withIsles();
    old.diplo = readDiplo({ met: ['orient', 'asie'] });
    expect(allyPending(old)).toBe(true);
  });
});

describe('diplomatie : le dénouement (au Médiéval)', () => {
  const allied = () => { const w = withIsles(); chooseAlly(w.diplo, 'orient'); return w; };
  afterEach(() => bindPostReady(() => true));

  it('il s’ouvre au Médiéval, une fois l’allié installé chez lui (crochet `allyPostReady`) ; seulement la paix ou la guerre', () => {
    const w = allied();
    expect(endgameOpen(w, 1)).toBe(false);
    expect(endgameOpen(w, 2)).toBe(true);
    // le port et le comptoir chez l'allié manquent : la carte attend, et dit pourquoi
    bindPostReady(() => false);
    expect(endgameOpen(w, 2)).toBe(false);
    expect(endgameWhy(w, 2)).toMatch(/port et un comptoir/);
    bindPostReady((x) => x === w);
    expect(endgameOpen(w, 2)).toBe(true);
    expect(endgameWhy(w, 2)).toBeNull();
    // au-delà du Médiéval : plus de carte (le conflit y est réputé réglé, voir `settleLate`)
    expect(endgameOpen(w, 3)).toBe(false);
    expect(choosePath(w.diplo, 'neutral' as never)).toBe(false);
    expect(w.diplo.path).toBeNull();
    w.diplo.ally = null;
    expect(endgameOpen(w, 2)).toBe(false);
    expect(choosePath(w.diplo, 'peace')).toBe(false);
  });

  it('la carte s’ouvre d’elle-même quand les autres conditions de l’Industriel sont remplies, une seule fois (« Plus tard » ne la fait pas revenir)', () => {
    const w = allied();
    expect(pathDue(w, 2, false)).toBe(false);
    expect(pathDue(w, 2, true)).toBe(true);
    bindPostReady(() => false);
    expect(pathDue(w, 2, true)).toBe(false);
    bindPostReady(() => true);
    // montrée une fois (puis « Plus tard ») : elle ne revient plus seule
    w.diplo.asked = true;
    expect(pathDue(w, 2, true)).toBe(false);
    w.diplo.asked = false;
    expect(pathDue(w, 3, true)).toBe(false);
  });

  it('le conflit réglé est une condition de l’Industriel, seulement avec l’archipel', () => {
    const w = allied();
    expect(conflictItem(w, 2)).toBeNull();
    expect(conflictItem(w, 3)).toEqual({ have: 0, need: 1 });
    expect(conflictItem(w, 4)).toBeNull();
    expect(conflictItem(continent(), 3)).toBeNull();
    const sim = new Sim(w);
    sim.age = 2;
    sim.recalc();
    expect(sim.ageProgress()!.items.find((i) => i.label === CONFLICT_LABEL)).toMatchObject({ have: 0, need: 1 });
    expect(sim.ready).toBe(false);
    w.diplo.conflict = 'peace';
    expect(sim.ageProgress()!.items.find((i) => i.label === CONFLICT_LABEL)).toMatchObject({ have: 1, need: 1 });
    // sans archipel, la ligne n'existe pas
    const c = new Sim(continent());
    c.age = 2;
    expect(c.ageProgress()!.items.some((i) => i.label === CONFLICT_LABEL)).toBe(false);
  });

  it('la paix : deux pourparlers, sans échec ni blessé possible ; les émissaires ouvrent le comptoir, l’ambassade règle le conflit (fête, monument, cinématique)', () => {
    const w = allied();
    expect(choosePath(w.diplo, 'peace')).toBe(true);
    expect(missionOffered(w, WAR_MISSION)).toBe(false);
    expect(PEACE_CHAIN).toEqual(['envoys', PEACE_MISSION]);
    const [envoys, truce] = PEACE_CHAIN.map((id) => MISSIONS.find((x) => x.id === id)!);
    expect(truce.requires?.missions).toEqual(['envoys']);
    expect(truce.unlocks).toBe('concord');
    for (const m of [envoys, truce]) {
      expect(m.age).toBe(2);
      expect(m.talks).toBe(true);
      for (const c of m.choices) { expect(c.risk).toBe(0); expect(c.lose).toEqual([]); expect(c.win.some((e) => e.t === 'injured')).toBe(false); }
      // ses imprévus sont les siens : ni requin ni grain, et aucune option ne blesse
      const ev = eventsFor({ dest: 'river', mission: m.id, scene: 'voyage', age: 2, arrive: false, sea: true, own: true, at: 0.5 });
      expect(ev.length).toBeGreaterThan(0);
      expect(ev.every((e) => e.missions?.includes(m.id))).toBe(true);
      expect(ev.flatMap((e) => e.options).some((o) => o.hurt)).toBe(false);
      expect(missionOffered(w, m.id)).toBe(true);
    }
    expect(kindOffered(w, 'concord')).toBe(true);
    // les émissaires : le comptoir chez le rival ; le conflit dure encore
    expect(rivalPost(w)).toBeNull();
    applyEffects(w, envoys.choices[0].win, 100); done(w, 'envoys');
    expect(rivalPost(w)).toBe('asie');
    expect(w.diplo.conflict).toBe('open');
    expect(w.diplo.cine).toBe(false);
    // l'ambassade : la paix signée, la fête, la cinématique à jouer
    applyEffects(w, truce.choices[0].win, 100); done(w, PEACE_MISSION);
    expect(w.diplo.conflict).toBe('peace');
    expect(w.diplo.cine).toBe(true);
    expect(w.diplo.feast).toBe(true);
    expect(conflictState(w)).toEqual({ kind: 'peace' });
    expect(conflictItem(w, 3)).toEqual({ have: 1, need: 1 });
    expect(missionWhy(w, PEACE_MISSION)).toBeTruthy();
    // l'ancienne fête n'existe plus ; une ancienne partie garde ses émissaires et sa trêve (mêmes ids)
    expect(MISSIONS.some((x) => x.id === 'feast')).toBe(false);
    expect(readExpState({ done: ['envoys', 'truce', 'feast'] }).done).toEqual(['envoys', 'truce']);
  });

  it('la guerre : une expédition militaire (qui peut échouer) débarque les troupes ; la bataille règle le conflit', () => {
    const w = allied();
    const m = MISSIONS.find((x) => x.id === WAR_MISSION)!;
    expect(m.age).toBe(2);
    expect(m.mandatory).toBe(false);
    expect(m.talks).toBeFalsy();
    expect(isMilitary(m)).toBe(true);
    for (const c of m.choices) { expect(c.risk).toBeGreaterThan(0); expect(c.win).toContainEqual({ t: 'diplo', act: 'landing' }); }
    expect(missionOffered(w, WAR_MISSION)).toBe(false);
    expect(missionWhy(w, WAR_MISSION)).toMatch(/aider/);
    choosePath(w.diplo, 'war');
    expect(warEngaged(w.diplo)).toBe(true);
    expect(missionOffered(w, WAR_MISSION)).toBe(true);
    expect(missionWhy(w, WAR_MISSION)).toBeNull();
    expect(missionOffered(w, PEACE_MISSION)).toBe(false);
    expect(conflictState(w)).toEqual({ kind: 'war' });
    // ratée : rien ne change, on retente
    applyEffects(w, m.choices[0].lose, 100);
    expect(w.diplo.battle).toBe('none');
    // réussie : les troupes à terre, la bataille est prête ; l'expédition ne se propose plus
    applyEffects(w, m.choices[0].win, 100);
    expect(w.diplo.battle).toBe('ready');
    expect(w.diplo.conflict).toBe('open');
    expect(missionOffered(w, WAR_MISSION)).toBe(false);
    expect(missionWhy(w, WAR_MISSION)).toMatch(/bataille/);
    // la bataille gagnée : le butin, le conflit gagné, le tribut chaque jour
    const gold = w.gold;
    expect(claimVictory(w)).toBe(true);
    expect(w.diplo.conflict).toBe('won');
    expect(w.gold).toBe(gold + WAR_SPOILS.loot);
    expect(tributePerDay(w.diplo)).toBe(WAR_SPOILS.tribute);
    expect(conflictState(w)).toEqual({ kind: 'won', winner: 'orient' });
    expect(conflictItem(w, 3)).toEqual({ have: 1, need: 1 });
    expect(winAllyWar(w.diplo)).toBe(false);
  });

  it('une partie déjà au-delà du Médiéval avec un conflit ouvert : le conflit est réputé réglé, et la sauvegarde se relit', () => {
    const w = allied();
    expect(settleLate(w.diplo, 2, true)).toBe(false);
    expect(settleLate(w.diplo, 3, true)).toBe(true);
    expect(w.diplo.conflict).toBe('treaty');
    expect(conflictState(w)).toEqual({ kind: 'treaty' });
    expect(settleLate(w.diplo, 3, true)).toBe(false);
    // (une sauvegarde d'avant, à l'Industriel, sur la voie de la guerre : elle se relit)
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify({ ...withIsles().toJSON(), diplo: { ally: 'orient', path: 'war', conflict: 'open', battle: 'ready' } })));
    expect(r.diplo.battle).toBe('ready');
    expect(settleLate(r.diplo, 3, true)).toBe(true);
    expect(r.diplo.battle).toBe('none');
    const c = continent();
    expect(settleLate(c.diplo, 4, archipelagoOn(c))).toBe(false);
    expect(conflictState(c)).toBeNull();
  });

  it('le passage d’âge : jamais pendant une bataille (`beforeAdvance`)', () => {
    expect(ageGate(true)).toBeTruthy();
    expect(ageGate(false)).toBeNull();
    const w = continent();
    const sim = new Sim(w);
    sim.age = 2;
    sim.ageProgress = () => ({ next: 3, ratio: 1, items: [] });
    let asked = 0;
    sim.beforeAdvance = () => ++asked > 1;
    expect(sim.advance()).toBe(false);
    expect(sim.age).toBe(2);
    expect(sim.advance()).toBe(true);
    expect(sim.age).toBe(3);
  });
});

describe('diplomatie : le monument de la concorde et le cosmodrome', () => {
  it('le monument n’est proposé que sur la voie de la paix', () => {
    const w = continent();
    expect(kindOffered(w, 'concord')).toBe(false);
    expect(kindOffered(w, 'house')).toBe(true);
    withIsles(w);
    expect(kindOffered(w, 'concord')).toBe(false);
    w.diplo.ally = 'orient'; w.diplo.path = 'peace';
    expect(kindOffered(w, 'concord')).toBe(true);
  });

  it('sans archipel, le cosmodrome se pose sur l’île principale ; avec, seulement sur l’île alliée', () => {
    expect(spaceportWhy(continent(), 40, 40, 4)).toBeNull();
    const w = withIsles();
    expect(spaceportWhy(w, 40, 40, 4)).toMatch(/allié/);
    w.diplo.met = ['orient', 'asie']; w.diplo.ally = 'asie';
    const isle = isleOf(w, 'asie')!, other = isleOf(w, 'orient')!;
    const [x, z] = [Math.floor(isle.x), Math.floor(isle.z)];
    expect(onRival(isle, x, z)).toBe(true);
    expect(spaceportWhy(w, x, z, 4)).toBeNull();
    expect(spaceportWhy(w, Math.floor(other.x), Math.floor(other.z), 4)).toMatch(/allié/);
    expect(spaceportWhy(w, 5, 5, 4)).toMatch(/allié/);
  });

  it('sur l’archipel, le cosmodrome se pose chez l’allié, comme le reste, hors de sa ville', () => {
    setMapSize(384);
    const w = new World();
    w.seed = 11;
    newWorld(w, CONTINENT, 11, GEN_ARCH);
    w.diplo.met = ['orient', 'asie']; w.diplo.ally = 'asie';
    const isle = isleOf(w, 'asie')!;
    let at: [number, number] | null = null;
    for (let dz = -30; dz <= 30 && !at; dz += 2) for (let dx = -30; dx <= 30 && !at; dx += 2) {
      const x = Math.round(isle.x + dx), z = Math.round(isle.z + dz);
      if (w.canPlace('spaceport', x, z) === null) at = [x, z];
    }
    expect(at).not.toBeNull();
    // une maison aussi, depuis la construction chez l'allié ; pas dans sa ville
    expect(w.canPlace('house', at![0], at![1])).toBeNull();
    expect(w.canPlace('house', Math.floor(isle.village.x), Math.floor(isle.village.z))).toMatch(/ville de vos alliés/);
    // l'autre île reste interdite
    const other = isleOf(w, 'orient')!.village;
    expect(w.canPlace('house', Math.floor(other.x), Math.floor(other.z))).toMatch(/Hors de votre île/);
    setMapSize(192);
  });
});
