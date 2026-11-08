import { describe, it, expect, beforeAll } from 'vitest';
import { HellMap, HW, HELL_ZONES, Z_EMBER, Z_RIVER, Z_CLIFFS, Z_BONES } from '../src/world/hell';
import { Hell } from '../src/sim/hell';
import { Balance, BALANCE_LEGACY } from '../src/sim/hellBalance';
import { troopStats, TROOPS, HEAL_TIME } from '../src/sim/army';
import {
  HellBase, BASE_DEFS, BASE_R, COUNTER_FIRST, 
  SMITHY_BOOST, PALISADE_SLOW, counterSize, Purse,
} from '../src/sim/hellBase';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { isleOrigins, zoneOrigins } from '../src/build/zones';
import { War } from '../src/sim/war';

const run = (h: Hell, b: HellBase | null, t: number, until?: () => boolean) => {
  for (let i = 0; i < t * 20; i++) { h.step(0.05); b?.step(0.05); h.events.length = 0; if (until?.()) return true; }
  return false;
};
const cellPos = (m: HellMap, k: number): [number, number] => [(k % HW) + 0.5, Math.floor(k / HW) + 0.5];
/** La faction, la base ; la zone `upTo` et celles d'avant conquises (forteresses abattues, garnisons balayées) */
const setup = (upTo = 0, seed = 1, balance?: Balance) => {
  const m = new HellMap(seed), h = new Hell(m, seed, balance), b = new HellBase(h, m);
  for (let z = 1; z <= upTo; z++) {
    for (const s of h.standing(z)) h.damage(s, 1e6, -1);
    for (const u of h.garrison(z)) u.hp = 0;
  }
  h.events.length = 0;
  return { m, h, b };
};
const rich = (): Purse => ({ wood: 9999, stone: 9999, ore: 9999 });
/** Une place libre pour un bâtiment, près d'un point (en s'écartant peu à peu) */
const spot = (b: HellBase, kind: keyof typeof BASE_DEFS, x: number, z: number) => {
  for (let r = 0; r < 9; r += 0.5)
    for (let a = 0; a < 16; a++) {
      const px = x + Math.sin(a * 0.39) * r, pz = z + Math.cos(a * 0.39) * r;
      if (b.canBuild(kind, px, pz, rich()) === null) return [px, pz] as [number, number];
    }
  throw new Error(`pas de place pour ${kind}`);
};
/** Le centre d'une zone, sur la faille */
const mid = (m: HellMap, zone: number): [number, number] => {
  const z = Math.floor((HELL_ZONES[zone].z0 + (HELL_ZONES[zone + 1]?.z0 ?? m.L)) / 2);
  return cellPos(m, m.nearestWalkable(m.spine[z] + 0.5, z + 0.5, 4));
};

describe('base avancée : progression de zone en zone', () => {
  it('le seuil et la première zone sont ouverts ; chaque forteresse abattue ouvre la suivante', () => {
    const { m, h } = setup();
    expect(h.frontier).toBe(Z_EMBER);
    expect(h.held(0)).toBe(true);
    expect(h.held(Z_EMBER)).toBe(false);
    // un ordre au-delà de la brume s'arrête devant elle
    const [ax, az] = m.arrival, u = h.addPlayerUnit('knight', { ...troopStats('knight', 1), hp: 1e6 }, ax, az);
    for (const d of h.alive('hell')) d.hp = 0;
    const far = mid(m, Z_RIVER);
    h.order([u.id], { kind: 'move', x: far[0], z: far[1] });
    expect(h.events.some((e) => e.type === 'sealed' && e.zone === Z_RIVER)).toBe(true);
    expect(u.order!.z!).toBeLessThan(HELL_ZONES[Z_RIVER].z0);
    run(h, null, 90, () => u.order === null);
    expect(h.map.zoneAt(u.z)).toBe(Z_EMBER);
    // même poussé tout droit, il ne passe pas la brume
    u.order = { kind: 'move', x: far[0], z: far[1] }; u.state = 'move';
    run(h, null, 20);
    expect(h.map.zoneAt(u.z)).toBeLessThanOrEqual(Z_EMBER);
    // la forteresse des grottes tombe : la rivière de lave s'ouvre
    h.damage(h.standing(Z_EMBER).find((s) => s.kind === 'fortress')!, 1e6, -1);
    expect(h.frontier).toBe(Z_RIVER);
    expect(h.held(Z_EMBER)).toBe(true);
    h.order([u.id], { kind: 'move', x: far[0], z: far[1] });
    expect(run(h, null, 120, () => u.order === null)).toBe(true);
    expect(Math.hypot(u.x - far[0], u.z - far[1])).toBeLessThan(1.2);
  });
});

describe('base avancée : construction', () => {
  it('un camp d’abord, dans une zone tenue ; les bâtiments autour, payés, limités, qui bloquent le passage', () => {
    const { m, h, b } = setup();
    const p = rich();
    // pas dans une zone ennemie
    const [ex, ez] = mid(m, Z_EMBER);
    expect(b.canBuild('camp', ex, ez, p)).toMatch(/conquérir/);
    expect(b.canBuild('camp', ...mid(m, Z_RIVER), p)).toMatch(/brume/);
    // au seuil du portail : un camp, puis le reste autour
    const [ax, az] = m.arrival;
    expect(b.canBuild('tower', ax, az + 2, p)).toMatch(/camp de base/);
    expect(b.canBuild('camp', m.portal[0], m.portal[1] + 1, p)).toMatch(/portail/);
    const [cx, cz] = spot(b, 'camp', ax, az + 3);
    const camp = b.build('camp', cx, cz, p);
    expect(typeof camp).not.toBe('string');
    expect(p.wood).toBe(9999 - BASE_DEFS.camp.cost.wood);
    expect(m.walkableAt(cx, cz)).toBe(false);
    expect(b.canBuild('camp', cx + 3, cz, p)).toMatch(/déjà/);
    // trop loin du camp
    expect(b.canBuild('tower', cx + BASE_R + 2, cz, p)).toMatch(/loin/);
    // tous les bâtiments, chacun avec son modèle au combat
    for (const k of ['post', 'smithy', 'infirmary', 'tower', 'palisade', 'brazier'] as const) {
      const [x, z] = spot(b, k, cx + 2, cz + 2);
      const r = b.build(k, x, z, p);
      expect(typeof r, k).not.toBe('string');
    }
    expect(b.buildings()).toHaveLength(7);
    expect(b.posts()).toBe(1);
    // au plus une forge par base
    expect(b.canBuild('smithy', cx - 3, cz + 1, p)).toMatch(/Au plus/);
    // sans le sou : refus ; le bac à sable ne paie rien
    const poor: Purse = { wood: 2, stone: 0, ore: 0 };
    expect(b.canBuild('tower', ...spot(b, 'tower', cx - 2, cz + 3), poor)).toMatch(/Il faut/);
    const sand: Purse = { wood: 0, stone: 0, ore: 0, unlimited: true };
    expect(typeof b.build('tower', ...spot(b, 'tower', cx - 2, cz + 3), sand)).not.toBe('string');
    expect(sand.wood).toBe(0);
    // la base se bâtit dans une zone conquise
    h.damage(h.standing(Z_EMBER).find((s) => s.kind === 'fortress')!, 1e6, -1);
    expect(b.canBuild('camp', ...spot(b, 'camp', ex, ez), p)).toBeNull();
  });

  it('les palissades ne ferment jamais le chemin du royaume', () => {
    const { m, h, b } = setup(Z_CLIFFS);
    const fort = [...h.buildings.values()].find((s) => s.kind === 'fortress' && s.zone === Z_CLIFFS)!;
    b.build('camp', ...spot(b, 'camp', fort.site.x, fort.site.z), { ...rich(), unlimited: true });
    const camp = b.camp(Z_CLIFFS)!;
    // on tente de murer une rangée entière de la corniche, près du camp
    let placed = 0;
    for (let z = Math.floor(camp.site.z) - 6; z <= camp.site.z - 3; z++)
      for (let x = 0; x < HW; x++) if (m.walkable(x, z) && typeof b.build('palisade', x + 0.5, z + 0.5, { ...rich(), unlimited: true }) !== 'string') placed++;
    expect(placed).toBeGreaterThan(0);
    const d = m.distances(m.nearestWalkable(m.arrival[0], m.arrival[1]));
    const next = h.standing(Z_BONES).find((s) => s.kind === 'fortress')!;
    const c = m.nearestWalkable(next.site.x, next.site.z - next.site.r - 1, 3);
    expect(d[c]).toBeGreaterThanOrEqual(0);
  });
});

describe('base avancée : effets', () => {
  it('plus de vivres : les troupes ne s’affaiblissent jamais, même longtemps dans les Enfers', () => {
    const { m, h, b } = setup();
    const [ax, az] = m.arrival;
    const us = [0, 1, 2, 3, 4].map((i) => h.addPlayerUnit('soldier', troopStats('soldier', 1), ax + (i % 3) * 0.6, az + 1));
    run(h, b, 600);
    expect('supply' in b).toBe(false);
    expect(us[0].boost!).toBe(1);
  });

  it('le camp et l’infirmerie soignent, la forge renforce, la palissade ralentit les démons', () => {
    const { m, h, b } = setup();
    const p = { ...rich(), unlimited: true };
    const [ax, az] = m.arrival, [cx, cz] = spot(b, 'camp', ax, az + 3);
    b.build('camp', cx, cz, p);
    const u = h.addPlayerUnit('soldier', troopStats('soldier', 1), ...b.spawnPoint());
    u.hp = 20;
    run(h, b, 5);
    expect(u.hp).toBeGreaterThan(25);
    const slow = u.hp;
    b.build('infirmary', ...spot(b, 'infirmary', cx + 2, cz), p);
    run(h, b, 3);
    expect(u.hp - slow).toBeGreaterThan(3 * 4);
    b.build('smithy', ...spot(b, 'smithy', cx - 2, cz), p);
    run(h, b, 0.1);
    expect(u.boost).toBeCloseTo(SMITHY_BOOST, 5);
    expect(u.guard!).toBeLessThan(1);
    const w = b.build('palisade', ...spot(b, 'palisade', cx, cz + 3), p);
    if (typeof w === 'string') throw new Error(w);
    const imp = h.spawn('imp', w.site.x + 0.9, w.site.z, 1);
    run(h, b, 0.1);
    expect(imp.paceK).toBe(PALISADE_SLOW);
    // le point de ralliement et de réapparition : devant le camp
    expect(h.rally).toEqual(b.spawnPoint());
    expect(Math.hypot(b.spawnPoint()[0] - cx, b.spawnPoint()[1] - cz)).toBeLessThan(3);
  });
});

describe('base avancée : contre-attaques', () => {
  it('la faction contre-attaque la base du front, des vagues locales selon la zone (ancien équilibre : celui du bac à sable)', () => {
    const { m, h, b } = setup(Z_EMBER, 1, BALANCE_LEGACY);
    const p = { ...rich(), unlimited: true };
    const fort = [...h.buildings.values()].find((s) => s.kind === 'fortress' && s.zone === Z_EMBER)!;
    b.build('camp', ...spot(b, 'camp', fort.site.x, fort.site.z), p);
    const camp = b.camp(Z_EMBER)!;
    for (let i = 0; i < 3; i++) b.build('tower', ...spot(b, 'tower', camp.site.x + (i - 1) * 2, camp.site.z + 3), p);
    const guard = [0, 1, 2, 3, 4, 5].map((i) => h.addPlayerUnit(i < 3 ? 'knight' : 'archer', { ...troopStats(i < 3 ? 'knight' : 'archer', 2), hp: 2000 }, ...b.spawnPoint()));
    for (const u of guard) h.order([u.id], { kind: 'hold' });
    // la zone de la rivière dort : seuls les démons de la contre-attaque viennent
    for (const d of h.alive('hell')) if (d.zone === Z_RIVER) { d.home = [d.x, d.z]; }
    const seen: string[] = [];
    let n = 0;
    for (let i = 0; i < (COUNTER_FIRST + 120) * 20; i++) {
      h.step(0.05); b.step(0.05); h.events.length = 0;
      for (const e of b.events.splice(0)) { seen.push(e.type); if (e.type === 'counter') n = e.n; }
      if (seen.includes('counterEnd')) break;
    }
    expect(seen).toContain('counter');
    expect(n).toBe(counterSize(Z_EMBER, 0));
    expect(seen).toContain('counterEnd');
    expect(b.camp(Z_EMBER)).not.toBeNull();
    expect(b.count[Z_EMBER]).toBe(1);
    // la suivante est plus forte
    expect(counterSize(Z_EMBER, 1)).toBeGreaterThan(counterSize(Z_EMBER, 0));
    expect(counterSize(Z_RIVER, 0)).toBeGreaterThan(counterSize(Z_EMBER, 0));
  });

  it('le camp tombe : la base s’effondre, la zone est reperdue, sa forteresse se relève', () => {
    const { m, h, b } = setup(Z_EMBER);
    const p = { ...rich(), unlimited: true };
    const fort = [...h.buildings.values()].find((s) => s.kind === 'fortress' && s.zone === Z_EMBER)!;
    b.build('camp', ...spot(b, 'camp', fort.site.x, fort.site.z - 3), p);
    const camp = b.camp(Z_EMBER)!;
    const tower = b.build('tower', ...spot(b, 'tower', camp.site.x + 2, camp.site.z), p);
    if (typeof tower === 'string') throw new Error(tower);
    expect(h.frontier).toBe(Z_RIVER);
    h.damage(camp, 1e6, -1);
    run(h, b, 0.2);
    expect(tower.down).toBe(true);
    expect(h.conquered[Z_EMBER]).toBe(false);
    expect(h.frontier).toBe(Z_EMBER);
    expect(fort.down).toBe(false);
    expect(fort.hp).toBeLessThan(fort.maxHp);
    expect(m.walkableAt(fort.site.x, fort.site.z)).toBe(false);
    expect(h.garrison(Z_EMBER).some((u) => u.kind === 'guardian')).toBe(true);
    // on la reprend : la zone se rouvre
    h.damage(fort, 1e6, -1);
    expect(h.held(Z_EMBER)).toBe(true);
    expect(b.canBuild('camp', ...spot(b, 'camp', fort.site.x, fort.site.z - 3), p)).toBeNull();
  });
});

describe('base avancée : sauvegarde', () => {
  it('la base et une zone reperdue se reprennent', () => {
    const { m, h, b } = setup(Z_EMBER);
    const p = { ...rich(), unlimited: true };
    const [ax, az] = m.arrival;
    b.build('camp', ...spot(b, 'camp', ax, az + 3), p);
    b.build('brazier', ...spot(b, 'brazier', ax + 2, az + 3), p);
    const fort = [...h.buildings.values()].find((s) => s.kind === 'fortress' && s.zone === Z_EMBER)!;
    b.build('camp', ...spot(b, 'camp', fort.site.x, fort.site.z), p);
    run(h, b, 1);
    const hs = JSON.parse(JSON.stringify(h.save())), bs = JSON.parse(JSON.stringify(b.save()));
    const m2 = new HellMap(1), h2 = Hell.load(m2, hs), b2 = HellBase.load(h2, m2, bs);
    expect(b2.buildings().map((x) => x.kind).sort()).toEqual(b.buildings().map((x) => x.kind).sort());
    expect(h2.frontier).toBe(Z_RIVER);
    for (const x of b2.buildings()) expect(m2.walkableAt(x.site.x, x.site.z)).toBe(false);
    // une vieille sauvegarde, sans base : une base vide
    expect(HellBase.load(h2, m2, undefined)).toBeInstanceOf(HellBase);
    // une ancienne sauvegarde avec vivres, convois et faiblesse : les champs sont ignorés
    const b4 = HellBase.load(h2, m2, { ...bs, supply: 3, weak: 0.4, convoys: [{ left: 5, amount: 50 }] });
    expect(b4.buildings().length).toBe(b2.buildings().length);
  });
});

describe('base avancée : la guerre (armée, caserne avancée, infirmerie)', () => {
  beforeAll(() => setMapSize(192));
  const tick = (war: War, t: number, until?: () => boolean) => { for (let i = 0; i < t * 10; i++) { war.update(0.1, 1); if (until?.()) return true; } return false; };

  it('recrue sur place au camp, soignée à l’infirmerie, la base sauvegardée avec la guerre', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.exp.done.push('portal');
    const t = isleOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
    const c = isleOrigins(w, 'barracks').find((k) => w.canPlace('barracks', k % N, Math.floor(k / N)) === null)!;
    w.place('barracks', c % N, Math.floor(c / N), 0, true, 1, false);
    w.exp.gear.spear = 10; w.exp.gear.bow = 10;
    w.wood = 500; w.stone = 500; w.ore = 50;
    const war = new War(w);
    tick(war, 1);
    const m = war.hellMap!, b = war.base!;
    expect(war.recruitHell('soldier', 1, 80)).toMatch(/caserne avancée/);
    const [ax, az] = m.arrival;
    const camp = war.buildBase('camp', ...spot(b, 'camp', ax, az + 3));
    expect(typeof camp).not.toBe('string');
    expect(w.wood).toBe(500 - BASE_DEFS.camp.cost.wood);
    war.buildBase('post', ...spot(b, 'post', ax + 2, az + 4));
    war.buildBase('infirmary', ...spot(b, 'infirmary', ax - 2, az + 4));
    // la forge fabrique ce qui manque à la réserve, contre du minerai
    war.buildBase('smithy', ...spot(b, 'smithy', ax, az + 6));
    w.exp.gear.spear = 0;
    expect(war.recruitHell('soldier', 1, 80)).toBeNull();
    expect(w.ore).toBe(50 - BASE_DEFS.smithy.cost.ore - 4);
    expect(war.army.queue[0].at).toBe('hell');
    tick(war, TROOPS.soldier.time + 2, () => war.troopsIn(war.faction).length > 0);
    const [u] = war.troopsIn(war.faction);
    expect(u).toBeTruthy();
    expect(Math.hypot(u.x - b.spawnPoint()[0], u.z - b.spawnPoint()[1])).toBeLessThan(2);
    // tombé dans les Enfers : soigné sur place, il réapparaît au camp
    war.faction!.damage(u, 1e6, -1);
    tick(war, 0.2);
    expect(war.army.troops[0].heal).toBeGreaterThan(0);
    expect(war.army.troops[0].where).toBe('hell');
    tick(war, HEAL_TIME / 2 + 2, () => war.troopsIn(war.faction).length > 0);
    expect(war.troopsIn(war.faction)).toHaveLength(1);
    // la sauvegarde de la guerre garde la base
    const json = JSON.parse(JSON.stringify(war.save()));
    const back = new War(w);
    back.load(json);
    back.update(0, 1);
    expect(back.base!.buildings().map((x) => x.kind).sort()).toEqual(['camp', 'infirmary', 'post', 'smithy']);
    expect(back.troopsIn(back.faction)).toHaveLength(1);
  }, 60000);
});
