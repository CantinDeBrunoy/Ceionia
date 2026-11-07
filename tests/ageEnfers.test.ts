import { describe, it, expect } from 'vitest';
import { HellMap, HELL_ZONES, HELL_ZONE_N, ZONE_AGE, Z_EMBER, Z_RIVER, Z_CLIFFS, Z_KINGDOM, zoneCapOfAge, zoneAgeText } from '../src/world/hell';
import { Hell } from '../src/sim/hell';
import { troopStats } from '../src/sim/army';
import { HellBase, counterSize, ageLag, RECLAIM_FIRST, RECLAIM_WARN, COUNTER_MAX, LAG_BONUS } from '../src/sim/hellBase';
import { AGES } from '../src/build/catalog';

const run = (h: Hell, b: HellBase | null, t: number) => { for (let i = 0; i < t * 10; i++) { h.step(0.1); b?.step(0.1); h.events.length = 0; } };
/** Les zones 1 à `upTo` conquises (forteresses abattues, garnisons balayées) */
const setup = (upTo: number, age: number, seed = 1) => {
  const m = new HellMap(seed), h = new Hell(m), b = new HellBase(h, m);
  for (let z = 1; z <= upTo; z++) {
    for (const s of h.standing(z)) h.damage(s, 1e6, -1);
    for (const u of h.garrison(z)) u.hp = 0;
  }
  h.events.length = 0;
  h.age = age;
  return { m, h, b };
};

describe('les Enfers : l’âge plafonne les zones', () => {
  it('le tableau : deux zones dès l’Antiquité, une de plus par âge, le royaume au Futuriste', () => {
    expect(ZONE_AGE).toHaveLength(HELL_ZONE_N);
    expect(AGES[ZONE_AGE[1]].name).toBe('Antiquité');
    expect(AGES[ZONE_AGE[2]].name).toBe('Antiquité');
    expect(AGES[ZONE_AGE[3]].name).toBe('Médiéval');
    expect(AGES[ZONE_AGE[Z_KINGDOM]].name).toBe('Futuriste');
    expect(ZONE_AGE[Z_KINGDOM]).toBe(AGES.length - 1);
    for (let i = 1; i < ZONE_AGE.length; i++) expect(ZONE_AGE[i]).toBeGreaterThanOrEqual(ZONE_AGE[i - 1]);
    expect([1, 2, 3, 4, 5].map(zoneCapOfAge)).toEqual([2, 3, 4, 5, 6]);
    expect(zoneAgeText(Z_CLIFFS)).toBe('l’âge Médiéval');
  });

  it('à l’Antiquité, on conquiert deux zones puis la brume reste fermée, avec un message « âge »', () => {
    const { m, h } = setup(Z_RIVER, 1);
    expect(h.conquestFrontier).toBe(Z_CLIFFS);
    expect(h.frontier).toBe(Z_RIVER);
    expect(h.held(Z_RIVER)).toBe(true);
    expect(h.held(Z_CLIFFS)).toBe(false);
    const [ax, az] = m.arrival, u = h.addPlayerUnit('knight', { ...troopStats('knight', 1), hp: 1e6 }, ax, az);
    h.order([u.id], { kind: 'move', x: m.spine[HELL_ZONES[Z_CLIFFS].z0 + 5], z: HELL_ZONES[Z_CLIFFS].z0 + 5 });
    expect(h.events.some((e) => e.type === 'sealed' && e.zone === Z_CLIFFS && e.byAge)).toBe(true);
    // un âge de plus : la zone s'ouvre
    h.age = 2;
    expect(h.frontier).toBe(Z_CLIFFS);
  });

  it('avant d’avoir conquis la zone d’avant, la brume est « de conquête », pas « d’âge »', () => {
    const { m, h } = setup(0, 1);
    const [ax, az] = m.arrival, u = h.addPlayerUnit('knight', { ...troopStats('knight', 1), hp: 1e6 }, ax, az);
    h.order([u.id], { kind: 'move', x: m.spine[HELL_ZONES[Z_RIVER].z0 + 5], z: HELL_ZONES[Z_RIVER].z0 + 5 });
    const e = h.events.find((x) => x.type === 'sealed');
    expect(e && e.type === 'sealed' && e.byAge).toBe(false);
  });

  it('le royaume exige l’âge Futuriste, même toutes les autres zones conquises', () => {
    const { h } = setup(Z_KINGDOM - 1, AGES.length - 2);
    expect(h.conquestFrontier).toBe(Z_KINGDOM);
    expect(h.frontier).toBe(Z_KINGDOM - 1);
    h.age = AGES.length - 1;
    expect(h.frontier).toBe(Z_KINGDOM);
  });

  it('ancienne sauvegarde : les zones déjà conquises le restent, même en retard d’âge', () => {
    const { m, h } = setup(Z_CLIFFS, 1);
    const h2 = Hell.load(m, JSON.parse(JSON.stringify(h.save())));
    h2.age = 1;
    expect(h2.conquered[Z_CLIFFS]).toBe(true);
    expect(h2.held(Z_CLIFFS)).toBe(true);
    // la suivante reste fermée par l'âge
    expect(h2.frontier).toBe(Z_CLIFFS);
    expect(h2.held(Z_CLIFFS + 1)).toBe(false);
    // sans âge connu (carte sans portail, tests) : aucune limite
    const h3 = new Hell(m);
    expect(h3.frontier).toBe(Z_EMBER);
  });
});

describe('les Enfers : les démons reprennent du terrain', () => {
  it('en retard d’âge, la contre-attaque est plus nombreuse', () => {
    expect(ageLag(Z_CLIFFS, 1)).toBe(1);
    expect(ageLag(Z_CLIFFS, 2)).toBe(0);
    expect(counterSize(2, 0, 1)).toBe(counterSize(2, 0) + LAG_BONUS);
    expect(counterSize(2, 99, 2)).toBe(COUNTER_MAX + 2 * LAG_BONUS);
    expect(counterSize(2, 99)).toBe(COUNTER_MAX);
  });

  it('une zone conquise que personne ne garde est reprise, après un préavis', () => {
    const { h, b } = setup(Z_EMBER, 5);
    expect(h.conquered[Z_EMBER]).toBe(true);
    run(h, b, RECLAIM_FIRST - RECLAIM_WARN - 5);
    expect(b.events.some((e) => e.type === 'reclaimWarn')).toBe(false);
    run(h, b, 10);
    // (les événements sont lus par le jeu : ici on les relève dans la base)
    expect(b.events.some((e) => e.type === 'reclaimWarn' && e.zone === Z_EMBER)).toBe(true);
    expect(h.conquered[Z_EMBER]).toBe(true);
    run(h, b, RECLAIM_WARN + 5);
    expect(h.conquered[Z_EMBER]).toBe(false);
    expect(b.events.some((e) => e.type === 'zoneLost' && e.zone === Z_EMBER)).toBe(true);
    // la forteresse s'est relevée avec une petite garnison
    expect(h.garrison(Z_EMBER).length).toBeGreaterThan(0);
  });

  it('des troupes dans la zone, ou un camp de base, annulent la menace', () => {
    const { m, h, b } = setup(Z_EMBER, 5);
    const k = m.nearestWalkable(m.spine[HELL_ZONES[Z_EMBER].z0 + 8] + 0.5, HELL_ZONES[Z_EMBER].z0 + 8.5, 4);
    h.addPlayerUnit('knight', { ...troopStats('knight', 1), hp: 1e6 }, (k % m.W) + 0.5, Math.floor(k / m.W) + 0.5);
    run(h, b, RECLAIM_FIRST + 60);
    expect(h.conquered[Z_EMBER]).toBe(true);
    expect(b.reclaim).toBeNull();
  });

  it('la menace se sauvegarde et se reprend ; une vieille sauvegarde sans elle charge sans erreur', () => {
    const { m, h, b } = setup(Z_EMBER, 5);
    run(h, b, 60);
    expect(b.reclaim).not.toBeNull();
    const bs = JSON.parse(JSON.stringify(b.save()));
    const h2 = Hell.load(m, JSON.parse(JSON.stringify(h.save())));
    const b2 = HellBase.load(h2, m, bs);
    expect(b2.reclaim?.zone).toBe(Z_EMBER);
    delete bs.reclaim;
    expect(() => HellBase.load(h2, m, bs)).not.toThrow();
  });
});
