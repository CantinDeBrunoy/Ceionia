import { describe, it, expect, beforeAll } from 'vitest';
import { setMapSize, World } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { War, startTroops } from '../src/sim/war';
import { HellMap, Z_EMBER } from '../src/world/hell';
import { Hell, DemonKind, zoneTier, FIRST_FORT, SITES } from '../src/sim/hell';
import { HellBase, SEUIL_FIRST, COUNTER_HOLD } from '../src/sim/hellBase';
import { troopStats, armySize } from '../src/sim/army';
import { nextGoal } from '../src/sim/objective';

/**
 * L'arrivée tardive aux Enfers (retour de l'auteur, 24 nov. 2026 : un joueur entré en fin de partie restait bloqué, quatre
 * soldats offerts devant la première forteresse). La troupe offerte suit l'âge, la zone 1 reste simple à tous les âges, le
 * camp du Seuil laisse au joueur le temps de se renforcer
 */
describe('l’arrivée tardive aux Enfers', () => {
  beforeAll(() => setMapSize(192));
  const tick = (war: War, age: number, s: number, until?: () => boolean) => { for (let i = 0; i < s * 10; i++) { war.update(0.1, age); if (until?.()) return true; } return false; };
  function arrive(age: number, seed = 2026) {
    const w = new World();
    newWorld(w, 3, seed, GEN);
    w.difficulty = 'normal';
    w.portalWoken = true;
    const war = new War(w);
    war.wake();
    war.welcome(age);
    war.hellInView = true;
    tick(war, age, 1);
    return war;
  }

  it('la troupe offerte grandit avec l’âge : huit troupes, des chevaliers dès le Médiéval', () => {
    expect(startTroops(1).length).toBeGreaterThanOrEqual(8);
    expect(startTroops(1)).not.toContain('knight');
    for (const age of [2, 3, 4, 5]) expect(startTroops(age).filter((k) => k === 'knight').length, `âge ${age}`).toBeGreaterThanOrEqual(2);
    const war = arrive(5);
    expect(war.army.troops.length).toBe(startTroops(5).length);
    // à la forme de l'âge (l'exo-lanceur du Futuriste)
    const k = war.army.troops.find((t) => t.kind === 'knight')!;
    expect(k.maxHp).toBe(troopStats('knight', 5).hp);
  });

  it('au-delà des quatre premières, la troupe offerte ne prend pas de place : on recrute toujours, et c’est relu', () => {
    const war = arrive(1);
    expect(armySize(war.army)).toBe(4);
    war.world.exp.gear.spear = 1;
    expect(war.recruitHell('soldier', 1, 200)).toBeNull();
    const again = new War(war.world);
    again.load(JSON.parse(JSON.stringify(war.save())));
    expect(again.army.troops.filter((t) => t.gift).length).toBe(startTroops(1).length - 4);
    expect(armySize(again.army)).toBe(5);
  });

  // le critère de l'auteur : avec la troupe offerte, la zone 1 se gagne d'une sortie, sans autre ordre que l'attaque de l'objectif
  for (const seed of [2026, 7]) for (const age of [1, 2, 3, 4, 5]) it(`zone 1 gagnée d’une sortie à l’âge ${age} (monde ${seed})`, () => {
    const war = arrive(age, seed), f = war.faction!;
    const fort = f.standing(Z_EMBER).find((b) => b.kind === 'fortress')!;
    let goal = '';
    tick(war, age, 400, () => {
      const us = war.troopsIn(f);
      if (!us.length || fort.down) return true;
      const g = nextGoal(f, [us[0].x, us[0].z]), key = `${g.kind}${g.x}`;
      // (un clic droit sur le 🎯 à chaque nouvel objectif, ou quand les troupes n'ont plus d'ordre)
      if (key !== goal || us.every((u) => !u.order)) { goal = key; f.order(us.map((u) => u.id), { kind: 'attack', x: g.x, z: g.z }); }
      return false;
    });
    expect(fort.down).toBe(true);
    expect(f.conquered[Z_EMBER]).toBe(true);
    expect(war.troopsIn(f).length).toBeGreaterThanOrEqual(2);
  });

  it('les sortes de démons suivent le numéro de zone : pas de seigneur-démon aux Grottes de braise, même au Futuriste', () => {
    expect(zoneTier(1, 5)).toBe(1);
    expect(zoneTier(2, 5)).toBe(2);
    // les zones profondes, comme avant
    expect(zoneTier(5, 5)).toBe(4);
    expect(zoneTier(4, 5)).toBe(4);
    expect(zoneTier(4, 3)).toBe(3);
    // une grosse armée futuriste aux Grottes de braise : le renfort est à sa mesure, mais fait de démons de la zone
    const h = new Hell(new HellMap(1));
    h.age = 5;
    for (let i = 0; i < 30; i++) h.addPlayerUnit('knight', troopStats('knight', 5), 32, 12 + (i % 5) * 0.6);
    const before = h.garrison(Z_EMBER).length;
    h.raiseAlert(Z_EMBER, 32, 22);
    const added = h.garrison(Z_EMBER).slice(before).map((u) => u.kind as DemonKind);
    expect(added.length).toBeGreaterThan(0);
    for (const k of ['golem', 'horned', 'lord', 'titan'] as DemonKind[]) expect(added).not.toContain(k);
  });

  it('la première forteresse est allégée ; une ancienne sauvegarde ne la remet pas à sa vie d’avant', () => {
    const m = new HellMap(1), h = new Hell(m);
    const fort = h.standing(Z_EMBER).find((b) => b.kind === 'fortress')!;
    expect(fort.maxHp).toBe(Math.round(SITES.fortress.hp * FIRST_FORT.hp));
    expect(fort.armor).toBe(FIRST_FORT.armor);
    const s = h.save();
    s.buildings = s.buildings.map(([id, hp]) => [id, id === fort.id ? SITES.fortress.hp : hp]);
    const again = Hell.load(new HellMap(1), s);
    expect(again.buildings.get(fort.id)!.hp).toBe(fort.maxHp);
  });

  it('le camp du Seuil : pas de contre-attaque avant SEUIL_FIRST, ni tant que toutes nos troupes sont à terre', () => {
    const m = new HellMap(1), h = new Hell(m), b = new HellBase(h, m);
    expect(b.build('camp', m.arrival[0], m.arrival[1] + 3)).not.toBeTypeOf('string');
    const run = (t: number) => { for (let i = 0; i < t * 10; i++) { h.step(0.1); b.step(0.1); } };
    // une troupe au camp
    const u = h.addPlayerUnit('soldier', troopStats('soldier', 1), m.arrival[0], m.arrival[1] + 1);
    run(SEUIL_FIRST - 5);
    expect(b.attackers.size).toBe(0);
    // la voilà à terre (en soins) : la contre-attaque attend
    u.hp = 0;
    run(30);
    expect(b.attackers.size).toBe(0);
    // de retour : elle part peu après
    h.addPlayerUnit('soldier', troopStats('soldier', 1), m.arrival[0], m.arrival[1] + 1);
    run(COUNTER_HOLD + 2);
    expect(b.attackers.size).toBeGreaterThan(0);
  });
});
