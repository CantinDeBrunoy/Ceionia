import { describe, it, expect, beforeAll } from 'vitest';
import { setMapSize, World, N } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { isleOrigins, zoneOrigins } from '../src/build/zones';
import { War } from '../src/sim/war';
import { Agents } from '../src/sim/agents';
import { Expeditions } from '../src/sim/expeditions';
import { GEAR_BY, GearId, gearCost } from '../src/sim/gear';
import { TROOPS, troopKit } from '../src/sim/army';
import { BASE_DEFS } from '../src/sim/hellBase';
import { planHellRecruit, orderHellRecruit, stepHellWaiting, Workshop } from '../src/sim/recruitPlan';

/** Recruter dans les Enfers d'un seul clic : réserve, sinon atelier du village (tout ou rien), raison en clair sinon */
describe('recrutement dans les Enfers', () => {
  beforeAll(() => setMapSize(192));
  const tick = (war: War, t: number, until?: () => boolean) => { for (let i = 0; i < t * 10; i++) { war.update(0.1, 1); if (until?.()) return true; } return false; };
  const AGE = 1, POP = 80;

  /** un village avec caserne et tour, la guerre lancée, un camp, et (option) une caserne avancée */
  function setup(post = true) {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.exp.done.push('portal');
    w.difficulty = 'normal';
    const t = isleOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
    const c = isleOrigins(w, 'barracks').find((k) => w.canPlace('barracks', k % N, Math.floor(k / N)) === null)!;
    w.place('barracks', c % N, Math.floor(c / N), 0, true, 1, false);
    w.wood = 500; w.stone = 500; w.ore = 50;
    const war = new War(w);
    tick(war, 1);
    const b = war.base!, m = war.hellMap!, [ax, az] = m.arrival;
    const spot = (kind: keyof typeof BASE_DEFS, x: number, z: number) => {
      for (let r = 0; r < 9; r += 0.5) for (let a = 0; a < 16; a++) {
        const px = x + Math.sin(a * 0.39) * r, pz = z + Math.cos(a * 0.39) * r;
        if (b.canBuild(kind, px, pz, { wood: 9999, stone: 9999, ore: 9999 }) === null) return [px, pz] as [number, number];
      }
      throw new Error('pas de place');
    };
    expect(typeof war.buildBase('camp', ...spot('camp', ax, az + 3))).not.toBe('string');
    if (post) expect(typeof war.buildBase('post', ...spot('post', ax + 2, az + 4))).not.toBe('string');
    const ex = new Expeditions(w, new Agents(w), () => 100);
    const wk: Workshop = {
      craft: (id: GearId) => { const why = ex.whyCraft(GEAR_BY[id], AGE); if (!why) ex.craft(id, AGE); return why; },
      craftCheck: (ids) => ex.whyCraftAll(ids, AGE),
      crafting: () => w.exp.craft,
    };
    return { w, war, wk, ex };
  }

  it('l’équipement en réserve est pris tout seul : un clic, la recrue arrive au camp', () => {
    const { w, war, wk } = setup();
    w.exp.gear.spear = 2;
    const p = planHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(p.state).toBe('ready');
    expect(p.sub).toMatch(/coûte : lance/);
    const r = orderHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(r.done).toBe(true);
    expect(w.exp.gear.spear).toBe(1);
    expect(war.army.queue[0].at).toBe('hell');
    tick(war, TROOPS.soldier.time, () => war.troopsIn(war.faction).length > 0);
    expect(war.troopsIn(war.faction)).toHaveLength(1);
  }, 60000);

  it('seul l’équipement manque : l’atelier le fabrique (prix payé tout de suite), la recrue part dès qu’il est prêt', () => {
    const { w, war, wk, ex } = setup();
    const price = gearCost(GEAR_BY.spear, w.difficulty), wood = w.wood, stone = w.stone;
    const p = planHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(p.state).toBe('craft');
    expect(p.sub).toMatch(/fabrique : lance, puis part/);
    const r = orderHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(r).toMatchObject({ done: true, waits: true });
    expect(w.exp.craft).toEqual(['spear']);
    expect(w.wood).toBe(wood - price.wood);
    expect(w.stone).toBe(stone - price.stone);
    expect(war.army.queue).toHaveLength(0);
    // l'atelier travaille
    expect(stepHellWaiting(war, 'soldier', AGE, POP, wk, [])).toBeNull();
    for (let i = 0; i < 400 && w.exp.craft.length; i++) ex.update(0.1);
    expect(w.exp.gear.spear).toBe(1);
    expect(stepHellWaiting(war, 'soldier', AGE, POP, wk, [])).toEqual({ go: true });
    expect(w.exp.gear.spear).toBe(0);
    expect(war.army.queue[0].at).toBe('hell');
    tick(war, TROOPS.soldier.time, () => war.troopsIn(war.faction).length > 0);
    expect(war.troopsIn(war.faction)).toHaveLength(1);
  }, 60000);

  it('ressources insuffisantes : refus précis, rien n’est payé à moitié', () => {
    const { w, war, wk } = setup();
    w.wood = 1; w.stone = 0;
    const p = planHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(p.state).toBe('off');
    expect(p.sub).toMatch(/^manque /);
    const r = orderHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(r.done).toBe(false);
    expect(r.msg).toMatch(/bois|pierre/);
    expect(w.exp.craft).toHaveLength(0);
    expect(w.wood).toBe(1);
    expect(war.army.queue).toHaveLength(0);
  }, 60000);

  it('sans caserne avancée : « Posez d’abord la caserne avancée », avec le raccourci de pose', () => {
    const { war, wk } = setup(false);
    const p = planHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(p).toMatchObject({ state: 'off', needPost: true, sub: 'Il faut une caserne avancée' });
    const r = orderHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(r).toMatchObject({ done: false, openPost: true, msg: 'Posez d’abord la caserne avancée.' });
  }, 60000);

  it('garnison au complet : la raison est écrite sur le bouton', () => {
    const { w, war, wk } = setup();
    w.exp.gear.spear = 99;
    for (let i = 0; i < 40 && !orderHellRecruit(war, 'soldier', AGE, POP, wk).msg.match(/complet|petit/); i++);
    const p = planHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(p.state).toBe('off');
    expect(p.sub).toMatch(/Garnison au complet|Village trop petit/);
  }, 60000);

  it('la forge de la base prend le relais sans atelier utilisable (minerai, tout de suite)', () => {
    const { w, war, wk } = setup();
    // pas de bois ni de pierre pour l'atelier, mais du minerai et une forge
    w.ore = 80;
    const b = war.base!, [ax, az] = war.hellMap!.arrival;
    let placed = false;
    for (let r = 0; r < 9 && !placed; r += 0.5) for (let a = 0; a < 16 && !placed; a++) placed = typeof war.buildBase('smithy', ax + Math.sin(a * 0.39) * r, az + 6 + Math.cos(a * 0.39) * r) !== 'string';
    expect(placed).toBe(true);
    expect(b.countOf('smithy')).toBe(1);
    w.wood = 0; w.stone = 0; w.ore += 0;
    const ore = w.ore, kit = troopKit('soldier', AGE).gear.length;
    const p = planHellRecruit(war, 'soldier', AGE, POP, wk);
    expect(p).toMatchObject({ state: 'craft', forge: true });
    expect(orderHellRecruit(war, 'soldier', AGE, POP, wk).done).toBe(true);
    expect(w.ore).toBe(ore - kit * 4);
    expect(war.army.queue[0].at).toBe('hell');
  }, 60000);
});
