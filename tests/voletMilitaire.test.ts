import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { zoneOrigins } from '../src/build/zones';
import { TROOPS } from '../src/sim/army';
import { War } from '../src/sim/war';
import { HELL_ZONES, HellMap, zoneOf, zoneThe, zoneTo } from '../src/world/hell';
import { Hell, demonStats } from '../src/sim/hell';
import { Command } from '../src/sim/command';
import { troopStats, newArmy, onlyGearMissing, gearToCraft, RecruitCtx } from '../src/sim/army';
import { emptyStock } from '../src/sim/gear';
import { RAID_LIMIT } from '../src/sim/isleBattle';
import { HellBase, CAMP_MARGIN } from '../src/sim/hellBase';

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

describe('volet militaire : recruter sans équipement en réserve', () => {
  const ctx = (o: Partial<RecruitCtx> = {}): RecruitCtx => ({ age: 2, pop: 80, barracks: 1, stock: emptyStock(), ...o });

  it('seul l’équipement manque : un clic le fera fabriquer (pas s’il manque la caserne ou de la place)', () => {
    const a = newArmy();
    expect(onlyGearMissing(a, 'soldier', ctx())).toBe(true);
    expect(onlyGearMissing(a, 'soldier', ctx({ barracks: 0 }))).toBe(false);
    expect(onlyGearMissing(a, 'soldier', ctx({ pop: 3 }))).toBe(false);
    const s = emptyStock(); s.spear = 1;
    expect(onlyGearMissing(a, 'soldier', ctx({ stock: s }))).toBe(false);
  });

  it('les pièces à fabriquer tiennent compte de la réserve, de l’atelier et des recrues qui attendent déjà', () => {
    const s = emptyStock(); s.sword = 1;
    expect(gearToCraft('knight', s, [])).toEqual(['armor']);
    expect(gearToCraft('knight', s, ['armor'])).toEqual([]);
    // une autre recrue attend déjà l'épée et l'armure : il en faut deux de chaque
    expect(gearToCraft('knight', s, ['armor'], ['knight'])).toEqual(['sword', 'armor']);
    expect(gearToCraft('soldier', emptyStock(), ['spear'], ['soldier'])).toEqual(['spear']);
    expect(gearToCraft('archer', emptyStock(), ['spear'], ['soldier'])).toEqual(['bow']);
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

  it('la caserne abattue, le repli mène à la tour de garde, pas au portail d’où sortent les démons', () => {
    const w = setup(), war = new War(w);
    tick(war, 1);
    const isle = war.isle!, bar = [...isle.defs.values()].find((b) => b.kind === 'barracks')!, tower = [...isle.defs.values()].find((b) => b.kind === 'watchtower')!;
    const near = (p: [number, number], b: { site: { x: number; z: number; r: number } }) => Math.hypot(p[0] - b.site.x, p[1] - b.site.z) < b.site.r + 3;
    expect(near(isle.rallyPoint(), bar)).toBe(true);
    bar.down = true;
    expect(near(isle.rallyPoint(), tower)).toBe(true);
    // tout est tombé : devant les ruines de la caserne
    tower.down = true;
    expect(near(isle.rallyPoint(), bar)).toBe(true);
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

describe('volet militaire : l’équilibre de la première zone des Enfers', () => {
  it('sans démon-chef, avec un gardien moins coriace : une garnison pleine de l’Antiquité peut la prendre', () => {
    const h = new Hell(new HellMap(2));
    expect(h.garrison(1).some((u) => u.kind === 'chief')).toBe(false);
    expect(h.garrison(2).some((u) => u.kind === 'chief')).toBe(true);
    expect(demonStats('guardian', 1).hp).toBeLessThan(demonStats('guardian', 2).hp * 0.7);
    // douze soldats et archers de l'Antiquité, droit sur la forteresse : ils l'abattent
    const m = h.map as HellMap, c = new Command(), [ax, az] = m.arrival;
    const kinds = [...Array(8).fill('soldier'), ...Array(4).fill('archer')] as ('soldier' | 'archer')[];
    kinds.forEach((k, i) => h.addPlayerUnit(k, troopStats(k, 1), ax + (i % 4) * 0.6 - 1, az + 1 + Math.floor(i / 4) * 0.6));
    const fort = [...h.buildings.values()].find((b) => b.kind === 'fortress' && b.zone === 1)!;
    for (let t = 0; t < 600 && !fort.down && h.alive('player').length; t += 0.05) {
      if (Math.round(t * 20) % 100 === 0) {
        c.select(h.alive('player').map((u) => u.id));
        if (h.garrison(1).length) { c.armed = 'attack'; c.orderAt(h, fort.site.x, fort.site.z - 5); } else c.orderAt(h, fort.site.x, fort.site.z);
      }
      h.step(0.05);
    }
    expect(fort.down).toBe(true);
  }, 60000);
});

describe('volet militaire : la base avancée', () => {
  it('pas de camp tout contre une zone encore aux démons (sa garnison le rasait, la zone était reperdue)', () => {
    const m = new HellMap(3), h = new Hell(m);
    for (let z = 1; z <= 5; z++) h.conquered[z] = true;
    const b = new HellBase(h, m), z6 = HELL_ZONES[6].z0;
    const at = (z0: number, z1: number) => { for (let z = z0; z <= z1; z++) for (let x = 2; x < m.W - 2; x++) if (m.walkable(x, z)) return [x + 0.5, z + 0.5] as const; return null; };
    const near = at(z6 - 3, z6 - 1)!;
    expect(b.canBuild('camp', near[0], near[1])).toMatch(/Trop près du Royaume/);
    let ok = false;
    for (let z = z6 - CAMP_MARGIN - 4; z <= z6 - CAMP_MARGIN && !ok; z++) for (let x = 2; x < m.W - 2 && !ok; x++) ok = b.canBuild('camp', x + 0.5, z + 0.5) === null;
    expect(ok).toBe(true);
    // la zone d'après conquise : on peut camper au bord
    h.conquered[6] = true;
    expect(b.canBuild('camp', near[0], near[1]) ?? '').not.toMatch(/Trop près/);
  });
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

  it('partie quittée pendant la cinématique de la victoire : l’écran des récompenses n’est pas perdu', () => {
    const w = setup(), war = new War(w);
    tick(war, 1);
    war.reward = { ore: 250, gear: [['sword', 4]], joy: 3 };
    const back = new War(w);
    back.load(JSON.parse(JSON.stringify(war.save())));
    expect(back.reward).toEqual(war.reward);
    // une sauvegarde abîmée ou plus ancienne : rien
    back.load({ reward: { ore: 'x' } });
    expect(back.reward).toBeNull();
    back.load({});
    expect(back.reward).toBeNull();
  }, 30000);
});
