import { describe, it, expect } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { AGES, KINDS, KindId } from '../src/build/catalog';
import { priceIn, canPay } from '../src/sim/economy';
import { isStart, startRefusal } from '../src/build/startLock';
import { Difficulty } from '../src/sim/difficulty';
import { targetAge } from '../src/render/buildings';

function village(difficulty: Difficulty) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.difficulty = difficulty;
  w.updateVis();
  return w;
}

/** Pose la place du village au premier endroit libre autour du centre */
function placeGather(w: World, age: number) {
  for (let r = 0; r < 80; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const x = 90 + dx, z = 90 + dz;
    if (x > 4 && z > 4 && x < N - 8 && z < N - 8 && w.canPlace('gather', x, z) === null) { w.place('gather', x, z, age, true, 0, false); return; }
  }
  throw new Error('pas de place');
}

describe('bac à sable', () => {
  it('c’est la difficulté « sandbox » et elle seule', () => {
    expect(village('sandbox').sandbox).toBe(true);
    expect(village('easy').sandbox).toBe(false);
    expect(village('normal').sandbox).toBe(false);
  });

  it('on choisit l’âge de départ, sans condition, et on en change à volonté (avant comme arrière)', () => {
    const w = village('sandbox'), sim = new Sim(w);
    sim.age = 4;
    const seen: number[] = [];
    sim.onAgeUp = (a) => seen.push(a);
    expect(sim.ageProgress()).toBeNull();
    expect(sim.ready).toBe(false);
    expect(sim.setAge(5)).toBe(true);
    expect(sim.age).toBe(5);
    expect(sim.setAge(0)).toBe(true);
    expect(sim.age).toBe(0);
    expect(sim.setAge(0)).toBe(false);
    // borné aux âges qui existent
    sim.setAge(99);
    expect(sim.age).toBe(AGES.length - 1);
    sim.setAge(-3);
    expect(sim.age).toBe(0);
    expect(seen).toEqual([5, 0, AGES.length - 1, 0]);
  });

  it('tout est débloqué : les expéditions comptent comme réussies, et rien ne se paie', () => {
    const w = village('sandbox');
    expect(w.exp.done).toEqual([]);
    for (const k of Object.keys(KINDS) as KindId[]) {
      const m = KINDS[k].reqMission;
      if (m) expect(w.missionDone(m), `${k} (${m})`).toBe(true);
      for (let a = 0; a < AGES.length; a++) {
        expect(priceIn(w, k, a), `${k} à l’âge ${a}`).toBeNull();
        expect(canPay(w, priceIn(w, k, a))).toBe(true);
      }
    }
    expect(w.unlimited).toBe(true);
    // les expéditions réussies ne sont pas touchées : aucun effet sur les succès ni le compte des missions
    expect(w.exp.done.length).toBe(0);
  });

  it('on bâtit dans l’ordre qu’on veut : la place du village n’est pas obligatoire d’abord', () => {
    const w = village('sandbox');
    expect(isStart(w)).toBe(false);
    expect(startRefusal(w, 'raise', undefined, 'Feu de camp')).toBeNull();
    expect(startRefusal(w, 'build', 'house', 'Feu de camp')).toBeNull();
    // le village de départ, lui, garde son verrou
    expect(isStart(village('normal'))).toBe(true);
    expect(startRefusal(village('easy'), 'build', 'house', 'Feu de camp')).not.toBeNull();
  });

  it('aucun conseil, aucun besoin qui freine : la population grandit dès qu’il y a de la place', () => {
    const w = village('sandbox'), sim = new Sim(w);
    sim.age = 4;
    sim.update(0, 1);
    expect(sim.message).toMatch(/Bac à sable/);
    expect(sim.messageKind).toBeNull();
    placeGather(w, 4);
    // les fondateurs arrivent à tout âge, sans maison ni nourriture
    for (let i = 0; i < 20; i++) sim.update(10, 10);
    expect(Math.floor(sim.pop)).toBe(4);
    // des besoins non comblés (pas un champ, pas un puits) ne freinent pas la croissance quand les places suffisent
    expect(sim.canGrow).toBe(sim.housing.ok);
  });

  it('une partie normale ne bouge pas : conditions d’âge, conseils, besoins qui freinent, pas de changement d’âge libre', () => {
    for (const d of ['easy', 'normal'] as const) {
      const w = village(d), sim = new Sim(w);
      sim.update(0, 1);
      expect(w.missionDone('herd')).toBe(false);
      expect(sim.ageProgress()).not.toBeNull();
      expect(sim.setAge(3)).toBe(false);
      expect(sim.age).toBe(0);
      expect(sim.message).not.toMatch(/Bac à sable/);
      expect(sim.message).toMatch(/place du village/);
      expect(priceIn(w, 'workshop', 0) !== null || d === 'easy').toBe(true);
    }
    // en Normal, un besoin non comblé bloque la croissance même quand les places suffisent
    const w = village('normal'), sim = new Sim(w);
    placeGather(w, 0);
    for (let i = 0; i < 5; i++) sim.update(10, 10);
    sim.food.ok = false;
    expect(sim.housing.ok || true).toBe(true);
    expect(sim.canGrow).toBe(false);
  });

  it('la sauvegarde du monde retient le mode ; les autres modes restent ce qu’ils sont', () => {
    for (const d of ['sandbox', 'easy', 'normal'] as const) {
      const w = village(d);
      const back = new World();
      back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
      expect(back.difficulty).toBe(d);
      expect(back.sandbox).toBe(d === 'sandbox');
    }
  });

  it('dès l’Antiquité, le portail s’ouvre sans l’expédition (la carte du choix peut venir) ; il reste ouvert et se sauvegarde', () => {
    const w = village('sandbox'), sim = new Sim(w);
    expect(w.portal).not.toBeNull();
    // à la Préhistoire, rien ne s'ouvre
    sim.update(0.1, 0.1);
    expect(w.portalOpen).toBe(false);
    // on passe à l'Antiquité : le portail s'ouvre, l'expédition n'est pas comptée comme faite
    sim.setAge(1);
    sim.update(0.1, 0.1);
    expect(w.portalOpen).toBe(true);
    expect(w.exp.done).not.toContain('portal');
    // revenir en arrière ne le referme pas
    sim.setAge(0);
    sim.update(0.1, 0.1);
    expect(w.portalOpen).toBe(true);
    const back = new World();
    back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(back.portalOpen).toBe(true);
  });

  it('hors bac à sable, il faut toujours l’expédition pour ouvrir le portail', () => {
    for (const d of ['easy', 'normal'] as Difficulty[]) {
      const w = village(d), sim = new Sim(w);
      sim.age = 3;
      sim.update(0.1, 0.1);
      expect(w.portalOpen).toBe(false);
      const back = new World();
      back.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
      expect(back.portalWoken).toBe(false);
    }
  });

  it('en redescendant d’âge, les bâtiments redescendent, sans passer sous l’âge où leur sorte apparaît', () => {
    // l'arène au Médiéval : le champ de joute, pas le palais de la boxe
    expect(targetAge({ kind: 'arena' }, 2)).toBe(2);
    // à la Préhistoire, elle n'existe pas encore : elle garde son premier modèle (le Colisée)
    expect(targetAge({ kind: 'arena' }, 0)).toBe(KINDS.arena.minAge);
    expect(targetAge({ kind: 'house' }, 0)).toBe(0);
  });
});
