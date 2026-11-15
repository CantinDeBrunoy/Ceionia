import { describe, it, expect } from 'vitest';
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
  onRival, isleOf, rivalOf, PEACE_CHAIN, WAR_MISSION, WAR_SPOILS, CONFLICT_LABEL,
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

describe('diplomatie : le dénouement (âge industriel)', () => {
  const allied = () => { const w = withIsles(); chooseAlly(w.diplo, 'orient'); return w; };

  it('il ne s’ouvre qu’à l’âge industriel, avec un allié, tant que le conflit dure ; seulement la paix ou la guerre', () => {
    const w = allied();
    expect(endgameOpen(w, 2)).toBe(false);
    expect(endgameOpen(w, 3)).toBe(true);
    expect(endgameOpen(w, 4)).toBe(false);
    expect(choosePath(w.diplo, 'neutral' as never)).toBe(false);
    expect(w.diplo.path).toBeNull();
    w.diplo.ally = null;
    expect(endgameOpen(w, 3)).toBe(false);
    expect(choosePath(w.diplo, 'peace')).toBe(false);
  });

  it('le conflit réglé est une condition du Moderne, seulement avec l’archipel', () => {
    const w = allied();
    expect(conflictItem(w, 3)).toBeNull();
    expect(conflictItem(w, 4)).toEqual({ have: 0, need: 1 });
    expect(conflictItem(continent(), 4)).toBeNull();
    const sim = new Sim(w);
    sim.age = 3;
    sim.recalc();
    expect(sim.ageProgress()!.items.find((i) => i.label === CONFLICT_LABEL)).toMatchObject({ have: 0, need: 1 });
    expect(sim.ready).toBe(false);
    w.diplo.conflict = 'peace';
    expect(sim.ageProgress()!.items.find((i) => i.label === CONFLICT_LABEL)).toMatchObject({ have: 1, need: 1 });
    // sans archipel, la ligne n'existe pas
    const c = new Sim(continent());
    c.age = 3;
    expect(c.ageProgress()!.items.some((i) => i.label === CONFLICT_LABEL)).toBe(false);
  });

  it('la paix : trois expéditions de pourparlers, dans l’ordre, sans échec ni blessé possible', () => {
    const w = allied();
    expect(choosePath(w.diplo, 'peace')).toBe(true);
    expect(missionOffered(w, WAR_MISSION)).toBe(false);
    const chain = PEACE_CHAIN.map((id) => MISSIONS.find((m) => m.id === id)!);
    for (const m of chain) {
      expect(m.age).toBe(3);
      expect(m.talks).toBe(true);
      for (const c of m.choices) { expect(c.risk).toBe(0); expect(c.lose).toEqual([]); expect(c.win.some((e) => e.t === 'injured')).toBe(false); }
      // ses imprévus sont les siens : ni requin ni grain, et aucune option ne blesse
      const ev = eventsFor({ dest: 'river', mission: m.id, scene: 'voyage', age: 3, arrive: false, sea: true, own: true, at: 0.5 });
      expect(ev.length).toBeGreaterThan(0);
      expect(ev.every((e) => e.missions?.includes(m.id))).toBe(true);
      expect(ev.flatMap((e) => e.options).some((o) => o.hurt)).toBe(false);
    }
    expect(chain[1].requires?.missions).toEqual(['envoys']);
    expect(chain[2].requires?.missions).toEqual(['truce']);
    for (const id of PEACE_CHAIN) expect(missionOffered(w, id)).toBe(true);
    // les émissaires : le comptoir chez le rival de l'allié
    expect(rivalPost(w)).toBeNull();
    applyEffects(w, chain[0].choices[0].win, 100); done(w, 'envoys');
    expect(rivalPost(w)).toBe('asie');
    // la trêve : le conflit est réglé par notre paix ; le monument de la concorde s'ouvre ; la fête reste à faire
    expect(kindOffered(w, 'concord')).toBe(true);
    applyEffects(w, chain[1].choices[1].win, 100); done(w, 'truce');
    expect(w.diplo.conflict).toBe('peace');
    expect(conflictState(w)).toEqual({ kind: 'peace' });
    expect(conflictItem(w, 4)).toEqual({ have: 1, need: 1 });
    expect(missionWhy(w, 'feast')).toBeNull();
    applyEffects(w, chain[2].choices[0].win, 100); done(w, 'feast');
    expect(w.diplo.feast).toBe(true);
  });

  it('la guerre : une expédition militaire, qui peut échouer ; réussie, la guerre est gagnée (butin, puis tribut)', () => {
    const w = allied();
    const m = MISSIONS.find((x) => x.id === WAR_MISSION)!;
    expect(m.age).toBe(3);
    expect(m.mandatory).toBe(false);
    expect(m.talks).toBeFalsy();
    expect(isMilitary(m)).toBe(true);
    for (const c of m.choices) { expect(c.risk).toBeGreaterThan(0); expect(c.win).toContainEqual({ t: 'diplo', act: 'victory' }); }
    expect(missionOffered(w, WAR_MISSION)).toBe(false);
    expect(missionWhy(w, WAR_MISSION)).toMatch(/aider/);
    choosePath(w.diplo, 'war');
    expect(warEngaged(w.diplo)).toBe(true);
    expect(missionOffered(w, WAR_MISSION)).toBe(true);
    expect(missionWhy(w, WAR_MISSION)).toBeNull();
    for (const id of PEACE_CHAIN) expect(missionOffered(w, id)).toBe(false);
    expect(conflictState(w)).toEqual({ kind: 'war' });
    expect(tributePerDay(w.diplo)).toBe(0);
    // ratée : rien ne change, on retente
    applyEffects(w, m.choices[0].lose, 100);
    expect(w.diplo.conflict).toBe('open');
    // réussie : le butin, le conflit gagné, le tribut chaque jour
    const gold = w.gold;
    applyEffects(w, m.choices[0].win, 100); done(w, WAR_MISSION);
    expect(w.diplo.conflict).toBe('won');
    expect(w.gold).toBe(gold + WAR_SPOILS.loot);
    expect(tributePerDay(w.diplo)).toBe(WAR_SPOILS.tribute);
    expect(conflictState(w)).toEqual({ kind: 'won', winner: 'orient' });
    expect(conflictItem(w, 4)).toEqual({ have: 1, need: 1 });
    expect(missionWhy(w, WAR_MISSION)).toBeTruthy();
    // une seconde victoire ne double pas le butin
    applyEffects(w, m.choices[0].win, 100);
    expect(w.gold).toBe(gold + WAR_SPOILS.loot);
    expect(winAllyWar(w.diplo)).toBe(false);
  });

  it('une partie déjà au-delà de l’Industriel avec un conflit ouvert est réglée d’office, sans blocage', () => {
    const w = allied();
    expect(settleLate(w.diplo, 3, true)).toBe(false);
    expect(settleLate(w.diplo, 4, true)).toBe(true);
    expect(w.diplo.conflict).toBe('treaty');
    expect(conflictState(w)).toEqual({ kind: 'treaty' });
    expect(settleLate(w.diplo, 4, true)).toBe(false);
    const c = continent();
    expect(settleLate(c.diplo, 4, archipelagoOn(c))).toBe(false);
    expect(conflictState(c)).toBeNull();
  });

  it('le passage d’âge : jamais pendant une bataille (`beforeAdvance`)', () => {
    expect(ageGate(true)).toBeTruthy();
    expect(ageGate(false)).toBeNull();
    const w = continent();
    const sim = new Sim(w);
    sim.age = 3;
    sim.ageProgress = () => ({ next: 4, ratio: 1, items: [] });
    let asked = 0;
    sim.beforeAdvance = () => ++asked > 1;
    expect(sim.advance()).toBe(false);
    expect(sim.age).toBe(3);
    expect(sim.advance()).toBe(true);
    expect(sim.age).toBe(4);
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

  it('sur l’archipel, le cosmodrome est la seule pose permise sur l’île alliée', () => {
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
    expect(w.canPlace('house', at![0], at![1])).toMatch(/Hors de votre île/);
    setMapSize(192);
  });
});
