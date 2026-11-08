import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { zoneOrigins } from '../src/build/zones';
import { HellMap } from '../src/world/hell';
import { Hell } from '../src/sim/hell';
import { War } from '../src/sim/war';
import { TroopKind, troopStats } from '../src/sim/army';
import { powerOf, BALANCE_NORMAL, BALANCE_EASY, BALANCE_LEGACY } from '../src/sim/hellBalance';
import { HellBase } from '../src/sim/hellBase';
import type { Difficulty } from '../src/sim/difficulty';

/** Équilibre des Enfers, suite : garnisons, renforts, contre-attaques, annonce, et batailles complètes sur l'île */

describe('équilibre : garnisons, renforts, contre-attaques', () => {
  const total = (h: Hell, z: number) => h.garrison(z).reduce((s, u) => s + powerOf(u.stats), 0);
  /** Des troupes du joueur d'un âge, posées devant la forteresse de la zone `z` : la garnison les voit */
  const invade = (h: Hell, z: number, n: number, age: number) => {
    const fort = h.map.zones[z].sites.find((s) => s.kind === 'fortress')!;
    for (let i = 0; i < n; i++) {
      const c = h.map.nearestWalkable(fort.x - 3 + (i % 8) * 0.8, fort.z - 6 - Math.floor(i / 8) * 0.8, 6);
      const u = h.addPlayerUnit('soldier', troopStats('soldier', age), (c % h.map.W) + 0.5, Math.floor(c / h.map.W) + 0.5);
      u.order = { kind: 'hold' };
    }
    h.raiseAlert(z, fort.x, fort.z - 5);
  };

  it('les garnisons profondes sont plus nombreuses et comptent de gros monstres ; l’ancien équilibre est intact', () => {
    const m = new HellMap(1), h = new Hell(m), old = new Hell(m, 1, BALANCE_LEGACY), easy = new Hell(m, 1, BALANCE_EASY);
    for (let z = 2; z <= 5; z++) expect(h.garrison(z).length, `zone ${z}`).toBeGreaterThan(old.garrison(z).length);
    expect(h.garrison(3).some((u) => u.kind === 'golem')).toBe(true);
    expect(h.garrison(4).some((u) => u.kind === 'horned')).toBe(true);
    expect(h.garrison(5).some((u) => u.kind === 'lord')).toBe(true);
    expect(h.garrison(6).some((u) => u.kind === 'titan')).toBe(true);
    expect(old.garrison(5).some((u) => u.kind === 'lord' || u.kind === 'golem')).toBe(false);
    for (let z = 1; z <= 6; z++) expect(easy.garrison(z).length, `zone ${z}`).toBeLessThan(h.garrison(z).length);
    const g = (hh: Hell, z: number) => hh.garrison(z).find((u) => u.kind === 'guardian')!.maxHp;
    expect(g(h, 5)).toBeGreaterThan(g(old, 5) * 1.5);
    expect(h.garrison(6).find((u) => u.kind === 'king')!.maxHp).toBeGreaterThan(old.garrison(6).find((u) => u.kind === 'king')!.maxHp * 1.5);
  });

  it('une zone qui voit une grosse armée se renforce, en proportion ; Facile moins ; pas de renforts en boucle', () => {
    const mk = (b = BALANCE_NORMAL) => { const h = new Hell(new HellMap(1), 1, b); h.age = 4; return h; };
    const a = mk(), base = total(a, 3);
    invade(a, 3, 4, 4);
    const small = total(a, 3);
    const b = mk();
    invade(b, 3, 60, 4);
    const big = total(b, 3);
    expect(big).toBeGreaterThan(small * 1.2);
    expect(big).toBeGreaterThan(base * 1.2);
    const c = mk(BALANCE_EASY);
    invade(c, 3, 60, 4);
    expect(total(c, 3)).toBeLessThan(big);
    const n0 = b.garrison(3).length;
    b.alert[3] = 0; b.raiseAlert(3, 10, 10);
    expect(b.garrison(3).length).toBe(n0);
  });

  it('une contre-attaque grossit avec les troupes du joueur dans les Enfers', () => {
    const counterN = (n: number) => {
      const m = new HellMap(1), h = new Hell(m);
      h.age = 3;
      for (let z = 1; z <= 2; z++) { for (const s of h.standing(z)) h.damage(s, 1e6, -1); for (const u of h.garrison(z)) u.hp = 0; }
      const b = new HellBase(h, m);
      for (let i = 0; i < n; i++) h.addPlayerUnit('soldier', troopStats('soldier', 3), m.arrival[0], m.arrival[1]);
      (b as unknown as { counter(z: number): void }).counter(2);
      return h.alive('hell').filter((u) => u.zone < 0).length;
    };
    const few = counterN(3), many = counterN(30);
    expect(many).toBeGreaterThan(few * 2);
    expect(many).toBeGreaterThan(20);
  });

  it('les anciennes sauvegardes se chargent (sans renforts enregistrés) ; la sauvegarde garde les renforts', () => {
    const h = new Hell(new HellMap(2));
    h.age = 4;
    invade(h, 3, 20, 4);
    const s = JSON.parse(JSON.stringify(h.save()));
    expect(s.reinforced[3]).toBeGreaterThan(0);
    const g = Hell.load(new HellMap(2), s);
    expect(g.alive('hell').length).toBe(h.alive('hell').length);
    delete s.reinforced;
    expect(() => Hell.load(new HellMap(2), s)).not.toThrow();
    expect(Hell.load(new HellMap(2), s).spawnRaid(10).units.length).toBeGreaterThan(0);
  });

  it('la difficulté de la partie règle la faction : Facile ×0,6, Normal plein, bac à sable ancien', () => {
    const w = new World();
    w.difficulty = 'easy';
    expect(new War(w).ensureFaction().balance.k).toBe(0.6);
    const n = new World(); n.difficulty = 'normal';
    expect(new War(n).ensureFaction().balance).toBe(BALANCE_NORMAL);
    const s = new World(); s.difficulty = 'sandbox';
    expect(new War(s).ensureFaction().balance.legacy).toBe(true);
  });
});

describe('équilibre : batailles sur l’île du portail', () => {
  beforeAll(() => setMapSize(192));
  const island = (age: number) => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.exp.done.push('portal');
    const t = zoneOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, age, false);
    const c = zoneOrigins(w, 'barracks').find((k) => w.canPlace('barracks', k % N, Math.floor(k / N)) === null)!;
    w.place('barracks', c % N, Math.floor(c / N), 0, true, age, false);
    return w;
  };
  const fight = (age: number, n: number, level: number, difficulty: Difficulty = 'normal') => {
    const w = island(age);
    w.difficulty = difficulty;
    const war = new War(w); war.skipInvasion();
    const tick = (t: number, until?: () => boolean) => { for (let i = 0; i < t * 10; i++) { war.update(0.1, age); if (until?.()) return; } };
    tick(1);
    for (let i = 0; i < n; i++) {
      const kind: TroopKind = i % 4 === 3 ? 'archer' : 'soldier', st = troopStats(kind, age);
      war.army.troops.push({ id: war.army.nextId++, kind, hp: st.hp, maxHp: st.hp, where: 'isle', heal: 0 });
    }
    tick(1);
    const f = war.faction!;
    f.raidsRepelled = level - 1;
    war.callWave();
    tick(3, () => !!war.isle!.raid);
    const foes = war.isle!.raiders().length, start = war.isle!.sim.alive('player').length;
    tick(400, () => !war.isle!.raid);
    return { won: f.raidsLost === 0 && f.raidsRepelled === level, left: war.isle!.sim.alive('player').length, start, foes };
  };

  it('trente soldats industriels ou modernes face à la vague pleine : victoire serrée, ni promenade ni raz-de-marée', () => {
    for (const age of [3, 4]) {
      const r = fight(age, 31, 5);
      expect(r.foes, `âge ${age}`).toBeGreaterThanOrEqual(40);
      expect(r.won, `âge ${age}`).toBe(true);
      expect(r.left / r.start, `âge ${age}`).toBeLessThan(0.85);
      expect(r.left / r.start, `âge ${age}`).toBeGreaterThan(0.05);
    }
  }, 120000);

  it('la montée est progressive : la première vague est une victoire facile, la quatrième coûte des soldats', () => {
    const a = fight(4, 31, 1), b = fight(4, 31, 4);
    expect(a.won && b.won).toBe(true);
    expect(a.left / a.start).toBeGreaterThan(0.9);
    expect(b.left / b.start).toBeLessThan(a.left / a.start);
  }, 120000);

  it('Facile : des vagues nettement plus petites et plus douces ; l’île sécurisée : des escarmouches', () => {
    const n = fight(4, 31, 5), e = fight(4, 31, 5, 'easy'), s = fight(4, 31, 8);
    expect(e.foes / n.foes).toBeLessThan(0.7);
    expect(e.won).toBe(true);
    expect(e.left / e.start).toBeGreaterThan(n.left / n.start);
    expect(s.won).toBe(true);
    expect(s.foes).toBeLessThan(n.foes);
  }, 180000);

  it('l’annonce : la vague est composée avant d’arriver, et c’est elle qui arrive', () => {
    const w = island(3), war = new War(w); war.skipInvasion();
    for (let i = 0; i < 20; i++) war.army.troops.push({ id: war.army.nextId++, kind: 'soldier', hp: 130, maxHp: 130, where: 'isle', heal: 0 });
    for (let i = 0; i < 20; i++) war.update(0.1, 3);
    const f = war.faction!;
    f.nextRaid = f.time + 30;
    for (let i = 0; i < 20; i++) war.update(0.1, 3);
    expect(f.planned).not.toBeNull();
    const plan = [...f.planned!];
    expect(war.news.some((x) => x.text.includes('se rassemblent'))).toBe(true);
    war.callWave();
    for (let i = 0; i < 20; i++) war.update(0.1, 3);
    expect(f.activeRaid!.units.map((u) => u.kind)).toEqual(plan);
    expect(f.planned).toBeNull();
  }, 30000);

  it('beaucoup de monde (100+ unités) : la simulation reste rapide', () => {
    const w = island(4), war = new War(w); war.skipInvasion();
    for (let i = 0; i < 80; i++) war.army.troops.push({ id: war.army.nextId++, kind: 'soldier', hp: 150, maxHp: 150, where: 'isle', heal: 0 });
    for (let i = 0; i < 20; i++) war.update(0.1, 4);
    war.faction!.raidsRepelled = 4;
    war.callWave();
    for (let i = 0; i < 30; i++) war.update(0.1, 4);
    expect(war.isle!.raiders().length + war.isle!.sim.alive('player').length).toBeGreaterThan(100);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) war.update(0.05, 4);
    expect(performance.now() - t0).toBeLessThan(2500);
  }, 60000);
});
