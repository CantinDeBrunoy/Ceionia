import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { zoneOrigins } from '../src/build/zones';
import { TROOPS } from '../src/sim/army';
import { War } from '../src/sim/war';

/**
 * Le volet militaire joué de bout en bout : les blocages et les petits défauts relevés en jouant (accès aux Enfers, retour
 * des troupes à la chute du royaume…)
 */

/** Une partie à l'Antiquité, portail ouvert, une tour de garde et une caserne sur l'île */
const setup = () => {
  const w = new World();
  newWorld(w, 3, 2026, GEN);
  w.exp.done.push('portal');
  const t = zoneOrigins(w, 'watchtower')[0];
  w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
  const c = zoneOrigins(w, 'barracks').find((k) => w.canPlace('barracks', k % N, Math.floor(k / N)) === null)!;
  w.place('barracks', c % N, Math.floor(c / N), 0, true, 1, false);
  w.exp.gear.spear = 10; w.exp.gear.bow = 10;
  return w;
};
/** La guerre au pas de 1/10 s pendant `t` secondes (jusqu'à `until`) */
const tick = (war: War, t: number, until?: () => boolean) => { for (let i = 0; i < t * 10; i++) { war.update(0.1, 1); if (until?.()) return true; } return false; };

describe('volet militaire : passages entre l’île et les Enfers', () => {
  beforeAll(() => setMapSize(192));

  it('on peut toujours aller voir les troupes des Enfers, et faire venir la garnison de l’île en renfort', () => {
    const w = setup(), war = new War(w);
    war.recruit('soldier', 1, 80); war.recruit('soldier', 1, 80); war.recruit('archer', 1, 80);
    tick(war, 2 * TROOPS.soldier.time + TROOPS.archer.time + 2);
    // rien dans les Enfers : pas de bouton pour y aller
    expect(war.hellPresence()).toBe(false);
    const [first] = war.isle!.sim.alive('player');
    war.sendThroughPortal([first]);
    tick(war, 30, () => war.army.troops.some((t) => t.where === 'hell'));
    // une troupe y est (après une partie rechargée, sans la nouvelle du passage, on doit pouvoir y aller)
    expect(war.hellPresence()).toBe(true);
    // les renforts : les deux autres passent le portail d'un coup
    expect(war.callGarrison()).toBe(2);
    tick(war, 30, () => war.army.troops.every((t) => t.where === 'hell'));
    expect(war.army.troops.every((t) => t.where === 'hell')).toBe(true);
    expect(war.callGarrison()).toBe(0);
  }, 30000);

  it('le royaume tombé, le portail s’éteint : les troupes des Enfers rentrent sur l’île, plus personne n’y part', () => {
    const w = setup(), war = new War(w);
    war.recruit('soldier', 1, 80); war.recruit('soldier', 1, 80);
    tick(war, 2 * TROOPS.soldier.time + 2);
    war.sendThroughPortal(war.isle!.sim.alive('player'));
    tick(war, 30, () => war.army.troops.every((t) => t.where === 'hell'));
    // l'une est blessée (à l'infirmerie de la base), l'autre debout
    const [a, b] = war.army.troops;
    a.heal = 20; a.where = 'hell';
    war.army.queue.push({ kind: 'soldier', left: 50, at: 'hell' });
    war.faction!.victory = true;
    // (tant que la vue des Enfers montre l'effondrement, elles y restent)
    war.hellInView = true;
    war.update(0.1, 1);
    expect(b.where).toBe('hell');
    war.hellInView = false;
    war.update(0.1, 1);
    expect(war.army.troops.every((t) => t.where === 'isle')).toBe(true);
    expect(war.army.queue.every((r) => r.at !== 'hell')).toBe(true);
    expect(war.troopsIn(war.isle!.sim).map((u) => war.troopOf.get(u.id))).toContain(b);
    expect(war.troopsIn(war.faction)).toHaveLength(0);
    expect(war.news.some((n) => n.text.includes('rentrées sur l’île'))).toBe(true);
    // le portail éteint : on n'y repart plus, on ne recrute plus là-bas, plus de bouton pour y aller
    expect(war.portalOut).toBe(true);
    expect(war.hellPresence()).toBe(false);
    war.sendThroughPortal(war.isle!.sim.alive('player'));
    expect(war.crossing.size).toBe(0);
    expect(war.callGarrison()).toBe(0);
    expect(war.recruitHell('soldier', 1, 80)).toMatch(/éteint/);
  }, 30000);
});
