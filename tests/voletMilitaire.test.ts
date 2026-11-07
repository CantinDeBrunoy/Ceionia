import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { zoneOrigins } from '../src/build/zones';
import { TROOPS } from '../src/sim/army';
import { War } from '../src/sim/war';
import { HELL_ZONES, HellMap, zoneOf, zoneThe, zoneTo } from '../src/world/hell';
import { Hell } from '../src/sim/hell';
import { troopStats } from '../src/sim/army';
import { RAID_LIMIT } from '../src/sim/isleBattle';

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

describe('volet militaire : les textes', () => {
  it('les noms des zones prennent leur article (« des Grottes de braise », « de la Rivière de lave »)', () => {
    expect(zoneThe(1)).toBe('les Grottes de braise');
    expect(zoneOf(1)).toBe('des Grottes de braise');
    expect(zoneOf(2)).toBe('de la Rivière de lave');
    expect(zoneOf(0)).toBe('du Seuil du portail');
    expect(zoneTo(3)).toBe('aux Falaises cendrées');
    expect(zoneTo(6)).toBe('au Royaume démoniaque');
    for (let i = 0; i < HELL_ZONES.length; i++) expect(zoneThe(i)).toMatch(/^(le|la|les) /);
  });
});

describe('volet militaire : rien ne reste coincé', () => {
  beforeAll(() => setMapSize(192));

  /** Les Enfers vides (sans démons ni bâtiments debout), et une case libre `c` emmurée (hors d'atteinte du portail) */
  const walled = () => {
    const m = new HellMap(7), h = new Hell(m);
    h.units.clear();
    for (const b of h.buildings.values()) { b.down = true; m.unblock(b.site); }
    const [ax, az] = m.arrival, cx = Math.floor(ax) + 4, cz = Math.floor(az) + 3;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2) m.block[(cz + dz) * m.W + cx + dx] = 1;
    m.version++;
    expect(m.walkable(cx, cz)).toBe(true);
    return { m, h, c: [cx + 0.5, cz + 0.5] as [number, number], a: [ax, az] as [number, number] };
  };
  const run = (h: Hell, t: number) => { for (let i = 0; i < t * 20; i++) h.step(0.05); };

  it('un ordre vers un point hors d’atteinte tombe : l’unité ne reste pas plantée, sans se défendre', () => {
    const { h, c, a } = walled();
    const u = h.addPlayerUnit('soldier', troopStats('soldier', 1), a[0], a[1] + 1);
    h.order([u.id], { kind: 'move', x: c[0], z: c[1] });
    run(h, 1);
    expect(u.order).toBeNull();
    expect(u.state).toBe('idle');
    // attaquer en marchant vers ce point : pareil
    h.order([u.id], { kind: 'attack', x: c[0], z: c[1] });
    run(h, 1);
    expect(u.order).toBeNull();
  });

  it('une cible hors d’atteinte est laissée de côté : l’unité se bat contre celle qu’elle peut atteindre', () => {
    const { h, c, a } = walled();
    const u = h.addPlayerUnit('soldier', troopStats('soldier', 1), a[0] + 1, a[1] + 1);
    // un diablotin emmuré tout près, un autre plus loin mais atteignable
    const far = h.spawn('imp', a[0] - 3, a[1] + 2, 0), stuck = h.spawn('imp', c[0], c[1], 0);
    far.home = [far.x, far.z]; stuck.home = [stuck.x, stuck.z];
    far.stats.sight = 0; stuck.stats.sight = 0;
    run(h, 15);
    expect(far.hp).toBe(0);
    expect(stuck.hp).toBeGreaterThan(0);
    // l'ordre d'attaquer la cible emmurée tombe aussi
    h.order([u.id], { kind: 'attack', target: stuck.id });
    run(h, 1);
    expect(u.order).toBeNull();
    expect(u.target).not.toBe(stuck.id);
  });

  it('une vague qui traîne (un démon coincé) finit par compter pour repoussée : les vagues suivantes viennent', () => {
    const w = setup(), war = new War(w);
    tick(war, 1);
    war.callWave();
    tick(war, 1, () => !!war.isle!.raid);
    const isle = war.isle!;
    // les démons ne bougent plus (comme coincés hors d'atteinte des défenses)
    for (const u of isle.raiders()) { u.stats.speed = 0; u.stats.range = 0; u.x = isle.map.portal[0] + 0.5; u.z = isle.map.portal[1] - 1.5; }
    for (const b of isle.defs.values()) b.power = 0;
    expect(tick(war, RAID_LIMIT + 5, () => !isle.raid)).toBe(true);
    expect(war.faction!.raidsRepelled).toBe(1);
    expect(war.nextWaveIn()).not.toBeNull();
  }, 30000);

  it('la durée d’une vague en cours se sauvegarde', () => {
    const w = setup(), war = new War(w);
    tick(war, 1);
    war.callWave();
    tick(war, 3, () => !!war.isle!.raid);
    tick(war, 2);
    const t = war.isle!.raidT;
    expect(t).toBeGreaterThan(1);
    const back = new War(w);
    back.load(JSON.parse(JSON.stringify(war.save())));
    back.update(0, 1);
    expect(back.isle!.raidT).toBeCloseTo(t, -1);
  }, 30000);

  it('vue des Enfers à ×4 sur une machine lente : le temps de la faction suit celui du jeu', () => {
    const w = setup(), war = new War(w);
    tick(war, 1);
    war.hellInView = true;
    const t0 = war.faction!.time;
    for (let i = 0; i < 10; i++) war.update(0.4, 1);
    expect(war.faction!.time - t0).toBeCloseTo(4, 1);
  }, 30000);
});

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
