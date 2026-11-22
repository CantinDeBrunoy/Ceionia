import { describe, it, expect, beforeAll } from 'vitest';
import { setMapSize, World, N } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { isleOrigins, zoneOrigins } from '../src/build/zones';
import { War, START_TROOPS } from '../src/sim/war';
import { HELL_ZONES } from '../src/world/hell';

/**
 * Le passage direct (décision de l'auteur, 22 nov. 2026) : plus d'étape sur l'île du portail. Le choix « Les Enfers » ouvre
 * le portail, la cinématique se joue, et l'on arrive au Seuil avec un camp, une caserne avancée et une petite troupe
 */
describe('le passage direct aux Enfers', () => {
  beforeAll(() => setMapSize(192));
  const tick = (war: War, s: number) => { for (let i = 0; i < s * 10; i++) war.update(0.1, 1); };

  function opened() {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.difficulty = 'normal';
    w.portalWoken = true;
    const war = new War(w);
    war.wake();
    return { w, war };
  }

  it('le choix « Les Enfers » ouvre les Enfers tout de suite : plus d’invasion ni de caserne de l’île à attendre', () => {
    const { war } = opened();
    expect(war.direct).toBe(true);
    expect(war.pve).toBe('on');
    expect(war.inv).toBe('done');
    expect(war.hellWhy()).toBeNull();
  });

  it('la première arrivée : un camp et une caserne avancée au Seuil, et la troupe de départ, sans rien payer', () => {
    const { w, war } = opened();
    const wood = w.wood, stone = w.stone, spear = w.exp.gear.spear ?? 0;
    expect(war.welcome(1)).toBe(true);
    const b = war.base!;
    expect(b.camp(0)).not.toBeNull();
    expect(b.camp(0)!.site.z).toBeLessThan(HELL_ZONES[1].z0);
    expect(b.posts()).toBe(1);
    expect(war.army.troops.map((t) => t.kind)).toEqual([...START_TROOPS]);
    expect(war.army.troops.every((t) => t.where === 'hell' && t.heal === 0)).toBe(true);
    expect([w.wood, w.stone, w.exp.gear.spear ?? 0]).toEqual([wood, stone, spear]);
    // une seule fois par partie
    expect(war.welcome(1)).toBe(false);
    expect(war.army.troops.length).toBe(START_TROOPS.length);
    // elles prennent place dans les Enfers, et l'on peut y recruter (la caserne avancée)
    tick(war, 1);
    expect(war.troopsIn(war.faction).length).toBe(START_TROOPS.length);
    expect(war.hellPresence()).toBe(true);
    w.exp.gear.spear = 1;
    expect(war.recruitHell('soldier', 1, 200)).toBeNull();
    expect(war.army.queue[0].at).toBe('hell');
  });

  it('les troupes restent dans les Enfers : un ordre sur l’arche ne les renvoie plus sur l’île', () => {
    const { war } = opened();
    war.welcome(1);
    tick(war, 1);
    const us = war.troopsIn(war.faction);
    war.sendThroughPortal(us);
    expect(war.crossing.size).toBe(0);
  });

  it('une troupe tombée sans infirmerie se soigne au camp, dans les Enfers', () => {
    const { war } = opened();
    war.welcome(1);
    tick(war, 1);
    const u = war.troopsIn(war.faction)[0];
    u.hp = 0;
    war.faction!.events.push({ type: 'death', id: u.id, side: 'player', kind: u.kind, x: u.x, z: u.z } as never);
    tick(war, 0.2);
    const t = war.army.troops.find((x) => x.heal > 0)!;
    expect(t.where).toBe('hell');
  });

  it('les casernes du village donnent des places même sans caserne sur l’île', () => {
    const { w, war } = opened();
    const before = war.recruitCtx(1, 200).barracks;
    const k = zoneOrigins(w, 'barracks').find((c) => w.canPlace('barracks', c % N, Math.floor(c / N)) === null)!;
    w.place('barracks', k % N, Math.floor(k / N), 0, true, 1, false);
    expect(war.recruitCtx(1, 200).barracks).toBe(before + 1);
  });

  it('une ancienne partie : la garnison de l’île et ses recrues passent aux Enfers, rien ne se perd', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.difficulty = 'normal';
    w.exp.done.push('portal');
    const c = isleOrigins(w, 'barracks').find((k) => w.canPlace('barracks', k % N, Math.floor(k / N)) === null)!;
    w.place('barracks', c % N, Math.floor(c / N), 0, true, 1, false);
    const old = new War(w);
    old.load({
      army: { troops: [{ id: 1, kind: 'soldier', hp: 50, maxHp: 110, where: 'isle', heal: 0 }, { id: 2, kind: 'archer', hp: 0, maxHp: 65, where: 'isle', heal: 20 }], queue: [{ kind: 'soldier', left: 5 }], nextId: 3 },
      faction: null, invasion: 'done', pve: 'on',
    });
    expect(old.welcomed).toBe(false);
    expect(old.intro).toBe('none');
    tick(old, 1);
    expect(old.army.troops.every((t) => t.where === 'hell')).toBe(true);
    expect(old.army.troops.find((t) => t.id === 1)!.hp).toBe(50);
    expect(old.army.queue.every((r) => r.at === 'hell')).toBe(true);
    // la caserne de l'île compte toujours (ses places) ; à la première entrée, ce qui manque est offert
    expect(old.recruitCtx(1, 200).barracks).toBeGreaterThanOrEqual(1);
    expect(old.welcome(1)).toBe(true);
    expect(old.base!.posts()).toBe(1);
    expect(old.army.troops.length).toBe(START_TROOPS.length);
    // relu : les dons ne reviennent pas
    const again = new War(w);
    again.load(JSON.parse(JSON.stringify(old.save())));
    expect(again.welcomed).toBe(true);
  });
});
