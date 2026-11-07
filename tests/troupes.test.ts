import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { zoneOrigins } from '../src/build/zones';
import { HellMap } from '../src/world/hell';
import { Hell, HellUnit, RAID_FIRST, SECURE_WAVES } from '../src/sim/hell';
import { Command, formation, unitAt, foeAt, inRect, SPACING } from '../src/sim/command';
import { TROOPS, newArmy, recruit, recruitWhy, cancelRecruit, dismiss, stepArmy, wound, troopStats, readArmy, troopCap, armyCap, RecruitCtx, HEAL_TIME } from '../src/sim/army';
import { emptyStock } from '../src/sim/gear';
import { War } from '../src/sim/war';
import { isleSecured } from '../src/world/portal';
import { Sim } from '../src/sim/sim';

/** Une simulation des Enfers sans démons ni bâtiments (on y pose ceux du test) */
const emptyHell = () => {
  const h = new Hell(new HellMap(1));
  h.units.clear();
  for (const b of h.buildings.values()) { b.down = true; h.map.unblock(b.site); }
  return h;
};
const run = (h: Hell, t: number) => { for (let i = 0; i < t * 20; i++) h.step(0.05); };

describe('contrôle des troupes : sélection et ordres', () => {
  it('la formation range les unités en rangs serrés autour du but, face à la marche', () => {
    const f = formation(6, 10, 10, 0, 1);
    expect(f).toHaveLength(6);
    const cx = f.reduce((s, p) => s + p[0], 0) / 6, cz = f.reduce((s, p) => s + p[1], 0) / 6;
    expect(Math.abs(cx - 10)).toBeLessThan(0.3); expect(Math.abs(cz - 10)).toBeLessThan(0.3);
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) expect(Math.hypot(f[i][0] - f[j][0], f[i][1] - f[j][1])).toBeGreaterThanOrEqual(SPACING - 1e-6);
    expect(formation(0, 0, 0)).toEqual([]);
    expect(formation(1, 3, 4)).toEqual([[3, 4]]);
  });

  it('clic, rectangle, double-clic (même sorte), groupes rappelés', () => {
    const h = emptyHell(), [ax, az] = h.map.arrival;
    const s = [0, 1, 2].map((i) => h.addPlayerUnit('soldier', troopStats('soldier', 1), ax - 1 + i, az));
    const a = h.addPlayerUnit('archer', troopStats('archer', 1), ax, az + 2);
    const us = h.alive('player'), c = new Command();
    expect(unitAt(us, s[1].x + 0.1, s[1].z)?.id).toBe(s[1].id);
    expect(unitAt(us, ax + 20, az)).toBeNull();
    // le rectangle à l'écran (ici : l'écran est la carte, ×10)
    const screen = (u: HellUnit): [number, number] => [u.x * 10, u.z * 10];
    const box = inRect(us, { x0: (ax - 1.5) * 10, y0: (az - 0.5) * 10, x1: (ax + 1.5) * 10, y1: (az + 0.5) * 10 }, screen);
    expect(box.map((u) => u.id).sort()).toEqual(s.map((u) => u.id).sort());
    c.select(box.map((u) => u.id));
    expect(c.selected.size).toBe(3);
    c.sameKind(us, 'archer', true);
    expect(c.selected.has(a.id)).toBe(true);
    c.setGroup(1);
    c.select([s[0].id]);
    c.setGroup(2);
    c.clear();
    expect(c.recall(1)).toBe(true);
    expect(c.selected.size).toBe(4);
    expect(c.recall(3)).toBe(false);
    // une unité tombée quitte la sélection et les groupes
    c.prune(new Set(us.filter((u) => u !== s[0]).map((u) => u.id)));
    expect(c.selected.has(s[0].id)).toBe(false);
    expect(c.groups[2]).toEqual([]);
  });

  it('ordres : se déplacer en formation, attaquer l’ennemi visé, tenir, se replier, attaquer en marchant', () => {
    const h = emptyHell(), [ax, az] = h.map.arrival;
    const us = [0, 1, 2, 3].map((i) => h.addPlayerUnit('soldier', { ...troopStats('soldier', 1), hp: 5000 }, ax + (i % 2) * 0.6, az + Math.floor(i / 2) * 0.6));
    const c = new Command();
    c.select(us.map((u) => u.id));
    // déplacer : chacun à sa place, en formation, autour du but
    const gx = ax, gz = az + 6;
    expect(c.orderAt(h, gx, gz)).toBe('move');
    run(h, 8);
    for (const u of us) expect(Math.hypot(u.x - gx, u.z - gz)).toBeLessThan(2);
    const cx = us.reduce((s, u) => s + u.x, 0) / 4, cz = us.reduce((s, u) => s + u.z, 0) / 4;
    expect(Math.hypot(cx - gx, cz - gz)).toBeLessThan(0.8);
    // attaquer l'ennemi visé
    const d = h.spawn('imp', gx + 2, gz + 1, 1);
    expect(foeAt(h, d.x, d.z)?.id).toBe(d.id);
    expect(c.orderAt(h, d.x, d.z)).toBe('attack');
    for (const u of us) expect(u.order).toMatchObject({ kind: 'attack', target: d.id });
    run(h, 6);
    expect(d.hp).toBeLessThanOrEqual(0);
    // tenir : on ne bouge plus, même un ennemi en vue
    c.hold(h);
    const before = us.map((u) => [u.x, u.z]);
    h.spawn('imp', gx + 4, gz + 2, 1);
    run(h, 0.5);
    us.forEach((u, i) => expect(Math.hypot(u.x - before[i][0], u.z - before[i][1])).toBeLessThan(0.3));
    // se replier : vers le point de ralliement (ici le portail)
    c.retreat(h);
    run(h, 8);
    for (const u of us) expect(Math.hypot(u.x - ax, u.z - az)).toBeLessThan(2);
    // attaquer en marchant (A puis clic) : un ordre d'attaque vers un point
    c.armed = 'attack';
    expect(c.orderAt(h, ax, az + 5)).toBe('attackMove');
    expect(us[0].order).toMatchObject({ kind: 'attack' });
    expect(us[0].order!.x).toBeDefined();
    expect(c.armed).toBeNull();
  });
});

describe('l’armée : recrutement, file, blessés', () => {
  const ctx = (o: Partial<RecruitCtx> = {}): RecruitCtx => ({ age: 1, pop: 80, barracks: 1, stock: { ...emptyStock(), spear: 3, bow: 1 }, ...o });

  it('chaque troupe prend son équipement en réserve, selon l’âge, la caserne et le plafond', () => {
    const a = newArmy(), c = ctx();
    expect(recruitWhy(a, 'soldier', ctx({ barracks: 0 }))).toMatch(/caserne/);
    expect(recruitWhy(a, 'knight', c)).toMatch(/Moyen Âge/);
    expect(recruitWhy(a, 'knight', ctx({ age: 2 }))).toMatch(/épée.*armure/);
    expect(recruitWhy(a, 'soldier', ctx({ pop: 3 }))).toMatch(/trop petit/);
    expect(recruit(a, 'soldier', c)).toBeNull();
    expect(c.stock.spear).toBe(2);
    expect(recruit(a, 'archer', c)).toBeNull();
    expect(c.stock.bow).toBe(0);
    expect(recruitWhy(a, 'archer', c)).toMatch(/arc/);
    // annulée : l'équipement revient
    cancelRecruit(a, 1, c.stock);
    expect(c.stock.bow).toBe(1);
    // plafond : casernes et âge
    expect(troopCap(1, 1)).toBe(6);
    expect(troopCap(2, 2)).toBe(16);
    expect(armyCap(ctx({ pop: 12 }))).toBe(3);
    const full = newArmy(), big = ctx({ stock: { ...emptyStock(), spear: 99 } });
    for (let i = 0; i < 6; i++) expect(recruit(full, 'soldier', big)).toBeNull();
    expect(recruitWhy(full, 'soldier', big)).toMatch(/complet/);
    // ressources illimitées : rien n'est pris
    const u = ctx({ unlimited: true, stock: emptyStock() });
    expect(recruit(newArmy(), 'knight', { ...u, age: 2 })).toBeNull();
  });

  it('la file avance avec le temps (une recrue par caserne à la fois), les blessés guérissent', () => {
    const a = newArmy(), c = ctx({ stock: { ...emptyStock(), spear: 5 } });
    recruit(a, 'soldier', c); recruit(a, 'soldier', c);
    let r = stepArmy(a, TROOPS.soldier.time - 1, 1, 1);
    expect(r.joined).toHaveLength(0);
    r = stepArmy(a, 2, 1, 1);
    expect(r.joined).toHaveLength(1);
    expect(a.troops[0]).toMatchObject({ kind: 'soldier', where: 'isle', heal: 0, hp: troopStats('soldier', 1).hp });
    // sans caserne, la recrue attend
    expect(stepArmy(a, 999, 0, 1).joined).toHaveLength(0);
    expect(stepArmy(a, TROOPS.soldier.time, 1, 1).joined).toHaveLength(1);
    // blessé : il se soigne à la caserne, plus vite avec un lieu de soins
    wound(a, a.troops[0].id);
    expect(a.troops[0].heal).toBe(HEAL_TIME);
    stepArmy(a, HEAL_TIME / 2 - 1, 1, 1, 2);
    expect(a.troops[0].heal).toBeGreaterThan(0);
    const h = stepArmy(a, 1, 1, 1, 2);
    expect(h.healed).toHaveLength(1);
    expect(a.troops[0].hp).toBe(a.troops[0].maxHp);
    // renvoyé au village : il rapporte sa lance
    const before = c.stock.spear;
    dismiss(a, a.troops[0].id, c.stock);
    expect(c.stock.spear).toBe(before + 1);
    // les troupes montent avec l'âge
    expect(troopStats('soldier', 3).hp).toBeGreaterThan(troopStats('soldier', 1).hp);
    // relecture d'une sauvegarde abîmée
    expect(readArmy(null).troops).toEqual([]);
    const back = readArmy(JSON.parse(JSON.stringify(a)));
    expect(back.troops).toEqual(a.troops);
    expect(readArmy({ troops: [{ kind: 'dragon' }, { id: 4, kind: 'archer', hp: 30, maxHp: 65 }], queue: [{ kind: 'x' }] }).troops).toHaveLength(1);
  });
});

describe('la défense de l’île du portail', () => {
  beforeAll(() => setMapSize(192));

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
  /** La guerre au pas de 1/10 s pendant `t` secondes */
  const tick = (war: War, t: number, until?: () => boolean) => { for (let i = 0; i < t * 10; i++) { war.update(0.1, 1); if (until?.()) return true; } return false; };

  it('les vagues arrivent à l’heure, sortent du portail, ne touchent que l’île ; la garnison et la tour les repoussent', () => {
    const w = setup(), war = new War(w);
    for (let i = 0; i < 4; i++) expect(war.recruit('soldier', 1, 80)).toBeNull();
    for (let i = 0; i < 2; i++) expect(war.recruit('archer', 1, 80)).toBeNull();
    expect(w.exp.gear.spear).toBe(6);
    tick(war, 2);
    expect(war.isle!.defs.size).toBe(2);
    // la première vague : RAID_FIRST secondes après la première tour
    expect(war.nextWaveIn()).toBeGreaterThan(RAID_FIRST - 5);
    // (une recrue à la fois par caserne)
    tick(war, 4 * TROOPS.soldier.time + 2 * TROOPS.archer.time - 2 + 5);
    expect(war.isle!.sim.alive('player')).toHaveLength(6);
    expect(war.isle!.raid).toBeNull();
    let waves = 0;
    for (let n = 0; n < SECURE_WAVES; n++) {
      war.callWave();
      expect(tick(war, 2, () => !!war.isle!.raid)).toBe(true);
      const isle = war.isle!;
      // les démons sortent devant le portail, sur l'île
      for (const u of isle.raiders()) {
        const [x, z] = isle.toWorld(u.x, u.z);
        expect(w.onPortalIsland(Math.floor(x), Math.floor(z))).toBe(true);
        expect(Math.hypot(u.x - isle.map.portal[0], u.z - isle.map.portal[1])).toBeLessThan(4);
      }
      // ils ne quittent jamais l'île (la carte de combat n'est faite que de ses cases)
      tick(war, 120, () => !war.isle!.raid);
      expect(war.isle!.raid).toBeNull();
      waves = w.isleGuard.waves;
      // les blessés guérissent entre deux vagues
      tick(war, HEAL_TIME + 5);
    }
    expect(waves).toBe(SECURE_WAVES);
    expect(war.faction!.raidsRepelled).toBe(SECURE_WAVES);
    expect(isleSecured(w)).toBe(true);
    expect(war.news.some((x) => x.kind === 'secured')).toBe(true);
  }, 60000);

  it('la tour de garde tire seule sur les démons à portée ; les défenses tombées font perdre la vague, puis se relèvent', () => {
    const w = setup(), war = new War(w);
    tick(war, 1);
    const isle = war.isle!, tower = [...isle.defs.values()].find((b) => b.kind === 'watchtower')!;
    war.callWave();
    tick(war, 1, () => !!isle.raid);
    expect(isle.raid).not.toBeNull();
    // la tour tire (des flèches, pas de feu)
    tick(war, 6);
    expect(war.isleFx.some((e) => e.type === 'shot' && e.source === tower.id && !e.fire)).toBe(true);
    // les défenses tombent : la vague est perdue, les démons repartent, la tour se relève
    for (const b of isle.defs.values()) isle.sim.damage(b, 99999, -1);
    tick(war, 0.5);
    expect(isle.raid).toBeNull();
    expect(war.faction!.raidsLost).toBe(1);
    expect(w.isleGuard.waves).toBe(0);
    expect(isle.raiders()).toHaveLength(0);
    expect(tower.down).toBe(false);
    expect(tower.hp).toBeLessThan(tower.maxHp);
    tick(war, 60);
    expect(tower.hp).toBe(tower.maxHp);
  }, 30000);

  it('sans tour de garde, aucune incursion ; jamais de démons sur le continent', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.exp.done.push('portal');
    const war = new War(w);
    tick(war, RAID_FIRST + 30);
    expect(war.faction!.wave).toBe(0);
    expect(war.nextWaveIn()).toBeNull();
  }, 30000);

  it('des troupes passent le portail vers les Enfers, et en reviennent', () => {
    const w = setup(), war = new War(w);
    war.recruit('soldier', 1, 80); war.recruit('soldier', 1, 80);
    tick(war, 2 * TROOPS.soldier.time + 2);
    const us = war.isle!.sim.alive('player');
    expect(us).toHaveLength(2);
    war.sendThroughPortal(us);
    tick(war, 30, () => war.army.troops.every((t) => t.where === 'hell'));
    expect(war.army.troops.every((t) => t.where === 'hell')).toBe(true);
    const inHell = war.troopsIn(war.faction);
    expect(inHell).toHaveLength(2);
    for (const u of inHell) expect(Math.hypot(u.x - war.hellMap!.arrival[0], u.z - war.hellMap!.arrival[1])).toBeLessThan(3);
    war.sendThroughPortal(inHell);
    tick(war, 10, () => war.army.troops.every((t) => t.where === 'isle'));
    expect(war.army.troops.every((t) => t.where === 'isle')).toBe(true);
    expect(war.isle!.sim.alive('player')).toHaveLength(2);
  }, 30000);

  it('se sauvegarde et se reprend : armée, recrues en route, faction, vague en cours', () => {
    const w = setup(), war = new War(w);
    war.recruit('soldier', 1, 80); war.recruit('archer', 1, 80);
    tick(war, TROOPS.soldier.time + 1);
    war.recruit('soldier', 1, 80);
    war.callWave();
    tick(war, 1, () => !!war.isle!.raid);
    const raiders = war.isle!.raiders().length;
    expect(raiders).toBeGreaterThan(0);
    const json = JSON.parse(JSON.stringify(war.save()));
    w.war = json;
    const v = new World();
    v.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    const back = new War(v);
    back.load(v.war);
    back.update(0, 1);
    expect(back.army.troops.map((t) => t.kind)).toEqual(war.army.troops.map((t) => t.kind));
    expect(back.army.queue).toHaveLength(war.army.queue.length);
    expect(back.isle!.raid).not.toBeNull();
    expect(back.isle!.raiders()).toHaveLength(raiders);
    expect(back.faction!.activeRaid?.wave).toBe(war.faction!.activeRaid?.wave);
    expect(back.faction!.time).toBeCloseTo(war.faction!.time, 0);
    // une vieille sauvegarde, sans guerre : tout est vide
    const old = new War(v);
    old.load(undefined);
    old.update(0.1, 1);
    expect(old.army.troops).toEqual([]);
  }, 30000);
});

describe('la condition d’âge : sécuriser l’île du portail pour quitter l’Antiquité', () => {
  beforeAll(() => setMapSize(192));

  it('le panneau d’âge montre les étapes de l’île ; sans elles, pas de Moyen Âge (les Enfers restent facultatifs)', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.unlimited = true;
    const sim = new Sim(w);
    sim.age = 1;
    const labels = sim.ageProgress()!.items.map((i) => i.label);
    expect(labels).toContain('expédition « Le portail de l’autre rive »');
    expect(labels.filter((l) => l.startsWith('île du portail'))).toHaveLength(3);
    const isle = (ap = sim.ageProgress()!) => ap.items.filter((i) => i.label.startsWith('île du portail'));
    expect(isle().every((i) => i.have < i.need)).toBe(true);
    w.exp.done.push('portal');
    const t = zoneOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
    const c = zoneOrigins(w, 'barracks').find((k) => w.canPlace('barracks', k % N, Math.floor(k / N)) === null)!;
    w.place('barracks', c % N, Math.floor(c / N), 0, true, 1, false);
    sim.recalc();
    expect(isle().map((i) => i.have)).toEqual([1, 1, 0]);
    w.isleGuard.waves = SECURE_WAVES;
    expect(isle().every((i) => i.have >= i.need)).toBe(true);
    // à un autre âge, rien de tout ça
    sim.age = 2;
    expect(sim.ageProgress()!.items.some((i) => i.label.startsWith('île du portail'))).toBe(false);
    // une carte sans île : ni portail ni île demandés
    const old = new World();
    old.fromJSON({ ...(w.toJSON() as Record<string, unknown>), portal: undefined });
    const s2 = new Sim(old);
    s2.age = 1;
    expect(s2.ageProgress()!.items.some((i) => i.label.includes('portail'))).toBe(false);
  }, 30000);
});
