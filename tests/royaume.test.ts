import { describe, it, expect, beforeAll } from 'vitest';
import { HellMap, Z_KINGDOM } from '../src/world/hell';
import { Hell, HellUnit, DEMONS } from '../src/sim/hell';
import { troopStats } from '../src/sim/army';
import {
  KingFight, KING_WAKE, KING_REACH, SUMMON_N, FIREBALL_DMG, FIREBALL_FALL, PATCH_WARM, PATCH_DPS, CITADEL_ARMOR_FALLEN,
  claimKingdom, hellFallen, KINGDOM_PERK, FORGE_PERK, KINGDOM_ORE, KingdomPurse,
} from '../src/sim/kingdom';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { zoneOrigins } from '../src/build/zones';
import { War } from '../src/sim/war';
import { trophiesWon } from '../src/render/trophies';

/** Les Enfers où seuls restent le roi et ses bâtiments (on y pose les soldats du test) */
const lone = (seed = 1) => {
  const h = new Hell(new HellMap(seed));
  for (const u of [...h.units.values()]) if (u.kind !== 'king') h.units.delete(u.id);
  const f = new KingFight(h);
  return { h, f, k: f.king! };
};
/** Un soldat du joueur à `d` cases au nord du roi (case praticable la plus proche) */
const soldierNear = (h: Hell, k: HellUnit, d: number) => {
  const c = h.map.nearestWalkable(k.x, k.z - d, 4), W = h.map.W;
  return h.addPlayerUnit('soldier', troopStats('soldier', 2), (c % W) + 0.5, Math.floor(c / W) + 0.5);
};
const stepFight = (f: KingFight, t: number) => { for (let i = 0; i < t * 20; i++) f.step(0.05); };

describe('Le royaume des Enfers', () => {
  it('a sa citadelle, quatre tours au-delà des douves, des gardes d’élite et un seul roi', () => {
    const m = new HellMap(1), h = new Hell(m);
    const sites = m.zones[Z_KINGDOM].sites;
    expect(sites.filter((s) => s.kind === 'kingdom')).toHaveLength(1);
    const king = sites.find((s) => s.kind === 'kingdom')!, spires = sites.filter((s) => s.kind === 'spire');
    expect(spires).toHaveLength(4);
    for (const s of spires) expect(Math.hypot(s.x - king.x, s.z - king.z)).toBeGreaterThan(9.6);
    const g = h.garrison(Z_KINGDOM);
    expect(g.filter((u) => u.kind === 'king')).toHaveLength(1);
    expect(g.filter((u) => u.kind === 'elite').length).toBeGreaterThanOrEqual(4);
    expect(DEMONS.elite.hp).toBeGreaterThan(DEMONS.chief.hp);
    // les tours tirent
    expect(h.standing(Z_KINGDOM).filter((b) => b.kind === 'spire')).toHaveLength(4);
  });

  it('le roi dort tant qu’on ne l’approche pas, puis se réveille (phase 1) et invoque des diablotins', () => {
    const { h, f, k } = lone();
    soldierNear(h, k, KING_WAKE + 6);
    stepFight(f, 2);
    expect(f.phase).toBe(0);
    soldierNear(h, k, 5);
    f.step(0.05);
    expect(f.phase).toBe(1);
    expect(h.events.some((e) => e.type === 'boss' && e.phase === 1)).toBe(true);
    const imps = () => h.alive('hell').filter((u) => u.kind === 'imp').length;
    expect(imps()).toBe(0);
    stepFight(f, 5);
    expect(imps()).toBe(SUMMON_N);
  });

  it('ses boules de feu s’écrasent en zone, là où se tenait le soldat visé ; on les évite en s’écartant', () => {
    const { h, f, k } = lone();
    const near = soldierNear(h, k, 5), far = soldierNear(h, k, KING_REACH + 6);
    f.step(0.05);
    // la première boule part au bout de deux secondes : un cercle au sol, là où est le soldat
    stepFight(f, 2.1);
    expect(f.fireballs).toHaveLength(1);
    expect(Math.hypot(f.fireballs[0].x - near.x, f.fireballs[0].z - near.z)).toBeLessThan(0.01);
    const hp0 = near.hp;
    stepFight(f, FIREBALL_FALL);
    expect(near.hp).toBeCloseTo(hp0 - FIREBALL_DMG, 5);
    expect(h.events.some((e) => e.type === 'blast')).toBe(true);
    expect(far.hp).toBe(far.maxHp);
    // le soldat s'écarte pendant la chute : la boule tombe à côté
    stepFight(f, 5 - FIREBALL_FALL - 0.05);
    expect(f.fireballs).toHaveLength(1);
    near.x += 3;
    const hp1 = near.hp;
    stepFight(f, FIREBALL_FALL + 0.1);
    expect(near.hp).toBe(hp1);
  });

  it('à mi-vie il enrage (phase 2) : plus fort, il crie, le sol s’embrase par plaques qui brûlent après avoir rougeoyé', () => {
    const { h, f, k } = lone();
    const u = soldierNear(h, k, 5);
    f.step(0.05);
    const dmg = k.stats.dmg, speed = k.stats.speed;
    k.hp = k.maxHp * 0.45;
    f.step(0.05);
    expect(f.phase).toBe(2);
    expect(k.stats.dmg).toBeGreaterThan(dmg);
    expect(k.stats.speed).toBeGreaterThan(speed);
    expect(f.roars).toBe(1);
    expect(h.events.some((e) => e.type === 'roar')).toBe(true);
    stepFight(f, 1.2);
    expect(f.patches.length).toBeGreaterThan(0);
    // une plaque sous le soldat : rien tant qu'elle rougeoie, puis elle brûle
    f.fireballs.length = 0;
    f.patches = [{ x: u.x, z: u.z, r: 1.3, age: 0, tick: 0 }];
    const hp0 = u.hp;
    for (let i = 0; i < (PATCH_WARM - 0.2) * 20; i++) { f.step(0.05); f.fireballs.length = 0; f.patches.length = Math.min(f.patches.length, 1); }
    expect(u.hp).toBe(hp0);
    for (let i = 0; i < 0.5 * 20; i++) { f.step(0.05); f.fireballs.length = 0; f.patches.length = Math.min(f.patches.length, 1); }
    expect(u.hp).toBeCloseTo(hp0 - PATCH_DPS * 0.5, 5);
    // il crie de nouveau un peu plus tard
    stepFight(f, 10);
    expect(f.roars).toBeGreaterThan(1);
  });

  it('abattu (phase 3), sa citadelle vacille ; tombée, le royaume s’effondre : victoire, plus d’incursion', () => {
    const { h, f, k } = lone();
    const u = soldierNear(h, k, 5);
    f.step(0.05);
    h.damage(k, 1e6, u.id);
    f.step(0.05);
    expect(f.phase).toBe(3);
    expect(f.citadel!.armor).toBe(CITADEL_ARMOR_FALLEN);
    expect(h.events.some((e) => e.type === 'boss' && e.phase === 3)).toBe(true);
    // la citadelle tombe
    h.raidDue(10);
    h.damage(f.citadel!, 1e7, u.id);
    expect(h.victory).toBe(true);
    expect(h.events.some((e) => e.type === 'victory')).toBe(true);
    expect(f.collapse()).toBe(true);
    expect(f.collapse()).toBe(false);
    expect(h.garrison(Z_KINGDOM)).toHaveLength(0);
    expect(h.standing(Z_KINGDOM)).toHaveLength(0);
    // plus jamais d'incursion
    for (const t of [100, 1e4, 1e6]) expect(h.raidDue(t)).toBe(false);
  });

  it('se sauvegarde : la rage du roi se retrouve au chargement, la victoire aussi', () => {
    const { h, f, k } = lone();
    soldierNear(h, k, 5);
    f.step(0.05);
    k.hp = k.maxHp * 0.4;
    f.step(0.05);
    f.arrived = true;
    const hs = JSON.parse(JSON.stringify(h.save(false))), fs = JSON.parse(JSON.stringify(f.save()));
    const h2 = Hell.load(new HellMap(1), hs), f2 = KingFight.load(h2, fs);
    expect(f2.phase).toBe(2);
    expect(f2.arrived).toBe(true);
    expect(f2.king!.stats.dmg).toBeCloseTo(k.stats.dmg, 5);
    expect(f2.king!.hp).toBeCloseTo(k.hp, 0);
    // une ancienne sauvegarde, sans combat : le roi dort ; une faction victorieuse : le combat est fini
    expect(KingFight.load(h2, undefined).phase).toBe(0);
    h2.victory = true;
    const f3 = KingFight.load(h2, undefined);
    expect(f3.phase).toBe(3);
    expect(f3.fallen).toBe(true);
  });
});

describe('La victoire et ses récompenses', () => {
  const purse = (): KingdomPurse => ({ ore: 10, exp: { perks: [], gear: { spear: 0, bow: 0, sword: 0, rifle: 0, rope: 0, torch: 0, boat: 0, kit: 0, armor: 0 }, bonus: { food: 0, water: 0, jobs: 0, joy: 0 } }, isleGuard: { waves: 1, days: 0 } });

  it('ne se touchent qu’une fois : trophée, forge infernale, minerai, équipement rare, île sécurisée', () => {
    const w = purse();
    expect(hellFallen(w)).toBe(false);
    const r = claimKingdom(w, 5)!;
    expect(r).toBeTruthy();
    expect(hellFallen(w)).toBe(true);
    expect(w.exp.perks).toContain(KINGDOM_PERK);
    expect(w.exp.perks).toContain(FORGE_PERK);
    expect(w.ore).toBe(10 + KINGDOM_ORE);
    expect(w.exp.gear.sword).toBeGreaterThan(0);
    expect(w.exp.gear.armor).toBeGreaterThan(0);
    expect(w.exp.bonus.joy).toBeGreaterThan(0);
    expect(w.isleGuard.waves).toBe(5);
    // une seconde fois : rien de plus
    expect(claimKingdom(w, 5)).toBeNull();
    expect(w.ore).toBe(10 + KINGDOM_ORE);
    expect(w.exp.perks.filter((p) => p === KINGDOM_PERK)).toHaveLength(1);
    // le trophée se voit sur la place
    expect(trophiesWon({ done: [], perks: w.exp.perks })).toContain('hellking');
  });
});

describe('La guerre : la chute du royaume', () => {
  beforeAll(() => setMapSize(192));
  const tick = (war: War, t: number) => { for (let i = 0; i < t * 10; i++) war.update(0.1, 1); };

  it('la citadelle tombée : nouvelle, récompenses une seule fois, plus d’incursion, sauvegardé', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.exp.done.push('portal');
    const t = zoneOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
    const war = new War(w);
    tick(war, 0.5);
    const f = war.faction!, cit = war.king!.citadel!;
    const ore = w.ore;
    f.damage(cit, 1e7, -1);
    tick(war, 0.3);
    expect(war.news.some((n) => n.kind === 'victory')).toBe(true);
    expect(war.reward).toBeTruthy();
    expect(w.ore).toBe(ore + KINGDOM_ORE);
    expect(hellFallen(w)).toBe(true);
    expect(f.islandSecured).toBe(true);
    // plus aucune vague, même longtemps après
    f.nextRaid = f.time;
    tick(war, 5);
    expect(war.isle!.raid).toBeNull();
    expect(war.nextWaveIn()).toBeNull();
    // la sauvegarde : la victoire reste, les récompenses ne se touchent pas deux fois
    const json = JSON.parse(JSON.stringify(war.save()));
    const back = new War(w);
    back.load(json);
    back.update(0.1, 1);
    expect(back.faction!.victory).toBe(true);
    expect(back.king!.phase).toBe(3);
    expect(back.king!.fallen).toBe(true);
    tick(back, 1);
    expect(w.ore).toBe(ore + KINGDOM_ORE);
  }, 60000);
});
