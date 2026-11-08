import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { zoneOrigins } from '../src/build/zones';
import { HellMap } from '../src/world/hell';
import { Hell, DEMONS, DemonKind, DEMON_POWER, demonStats, raidSize, raidKinds, SECURE_WAVES } from '../src/sim/hell';
import { War } from '../src/sim/war';
import { TroopKind, troopStats } from '../src/sim/army';
import { planWave, powerOf, compose, sumPower, BALANCE_NORMAL, BALANCE_EASY, BALANCE_LEGACY, balanceOf, ramp, WAVE_MAX } from '../src/sim/hellBalance';
import { HellBase } from '../src/sim/hellBase';
import type { Difficulty } from '../src/sim/difficulty';

/**
 * Simulations de bataille de l'équilibre des Enfers : une armée de N soldats d'un âge donné contre la vague qui lui correspond,
 * sur l'île du portail (avec une tour de garde et une caserne). Elles vérifient la forme de la courbe (taille, gros monstres,
 * montée progressive) et que l'issue reste serrée : ni raz-de-marée, ni promenade de santé.
 */

const POWERS = DEMON_POWER;
const count = (ks: DemonKind[]) => { const m: Partial<Record<DemonKind, number>> = {}; for (const k of ks) m[k] = (m[k] ?? 0) + 1; return m; };
const BIG: DemonKind[] = ['golem', 'horned', 'lord', 'titan'];

describe('équilibre : la taille des vagues', () => {
  const plan = (age: number, power: number, level = 6, balance = BALANCE_NORMAL, extra: { secured?: boolean; conquered?: number; losses?: number } = {}) =>
    planWave({ level, age, power, legacy: raidKinds(level, raidSize(level)), powers: POWERS, balance, ...extra });
  /** La puissance de 30 soldats d'un âge */
  const army = (age: number, n = 30) => n * powerOf(troopStats('soldier', age));

  it('chaque sorte de démon est plus massive et plus forte que la précédente de sa lignée', () => {
    const chain: DemonKind[] = ['imp', 'brute', 'golem', 'horned', 'lord', 'titan'];
    for (let i = 1; i < chain.length; i++) {
      const a = DEMONS[chain[i - 1]], b = DEMONS[chain[i]];
      expect(b.hp).toBeGreaterThan(a.hp * 1.5);
      expect(b.dmg).toBeGreaterThan(a.dmg);
      expect(b.radius).toBeGreaterThan(a.radius);
      expect(POWERS[chain[i]]).toBeGreaterThan(POWERS[chain[i - 1]]);
    }
    // les chefs de zone sont plus costauds, et de plus en plus avec la profondeur
    expect(demonStats('guardian', 5).hp).toBeGreaterThan(demonStats('guardian', 5, true).hp * 1.5);
    expect(demonStats('king', 6).hp).toBeGreaterThan(demonStats('king', 6, true).hp * 1.5);
    expect(demonStats('guardian', 5).hp).toBeGreaterThan(demonStats('guardian', 2).hp * 1.8);
  });

  it('trente soldats modernes : 40 à 80 ennemis, dont plusieurs gros monstres', () => {
    for (const age of [3, 4]) {
      const w = plan(age, army(age), 6);
      expect(w.length, `âge ${age}`).toBeGreaterThanOrEqual(40);
      expect(w.length, `âge ${age}`).toBeLessThanOrEqual(80);
      expect(w.filter((k) => BIG.includes(k)).length, `âge ${age}`).toBeGreaterThanOrEqual(3);
    }
    const w4 = plan(4, army(4), 6);
    expect(w4.some((k) => k === 'lord')).toBe(true);
    // au dernier âge : des titans
    expect(plan(5, army(5), 6)).toContain('titan');
  });

  it('les gros monstres arrivent avec l’âge, pas avant', () => {
    const has = (age: number, k: DemonKind) => plan(age, army(age), 8).includes(k);
    expect(has(1, 'golem')).toBe(false);
    expect(has(2, 'golem')).toBe(true);
    expect(has(2, 'horned')).toBe(false);
    expect(has(3, 'horned')).toBe(true);
    expect(has(3, 'lord')).toBe(false);
    expect(has(4, 'lord')).toBe(true);
    expect(has(4, 'titan')).toBe(false);
    expect(has(5, 'titan')).toBe(true);
  });

  it('la difficulté monte par paliers : la première vague pèse moins de la moitié de la cinquième', () => {
    const p = (lv: number) => sumPower(plan(4, army(4), lv), POWERS);
    expect(p(1)).toBeLessThan(p(5) * 0.5);
    for (let lv = 2; lv <= 5; lv++) expect(p(lv)).toBeGreaterThan(p(lv - 1));
    // pas de pic injuste : d'une vague à l'autre, au plus +50 %
    for (let lv = 2; lv <= 5; lv++) expect(p(lv)).toBeLessThan(p(lv - 1) * 1.5);
    expect(ramp(1)).toBeLessThan(ramp(3));
    expect(ramp(20)).toBe(1);
  });

  it('plus d’armée, plus d’ennemis, mais moins vite : l’armée garde de la marge ; pas de plafond bas', () => {
    const small = sumPower(plan(4, army(4, 10)), POWERS), big = sumPower(plan(4, army(4, 60)), POWERS);
    expect(big).toBeGreaterThan(small * 2);
    expect(big).toBeLessThan(small * 6);
    expect(plan(4, army(4, 150)).length).toBeGreaterThan(80);
    expect(plan(4, army(4, 500)).length).toBeLessThanOrEqual(WAVE_MAX);
  });

  it('Facile : environ ×0,6 sur les effectifs ; Normal par défaut ; bac à sable : l’ancien équilibre', () => {
    for (const age of [2, 3, 4]) {
      const n = plan(age, army(age), 6).length, e = plan(age, army(age), 6, BALANCE_EASY).length;
      expect(e / n, `âge ${age}`).toBeGreaterThan(0.5);
      expect(e / n, `âge ${age}`).toBeLessThan(0.7);
    }
    expect(balanceOf('normal')).toBe(BALANCE_NORMAL);
    expect(balanceOf('easy')).toBe(BALANCE_EASY);
    expect(balanceOf('sandbox')).toBe(BALANCE_LEGACY);
    expect(plan(4, army(4), 6, BALANCE_LEGACY)).toEqual(raidKinds(6, raidSize(6)));
    // une vraie partie : la difficulté choisie règle la faction
    const d: Difficulty = 'easy';
    expect(new Hell(new HellMap(1), 1, balanceOf(d)).balance.k).toBe(0.6);
  });

  it('sans armée, un plancher selon l’âge ; une défaite allège la vague suivante ; les zones conquises et l’île sécurisée aussi', () => {
    const floor = (age: number) => plan(age, 0, 6).length;
    expect(floor(1)).toBe(raidKinds(6, raidSize(6)).length);
    expect(sumPower(plan(4, 0, 6), POWERS)).toBeGreaterThan(sumPower(plan(1, 0, 6), POWERS) * 2);
    expect(sumPower(plan(4, army(4), 6, BALANCE_NORMAL, { losses: 2 }), POWERS)).toBeLessThan(sumPower(plan(4, army(4), 6), POWERS) * 0.8);
    expect(sumPower(plan(4, army(4), 6, BALANCE_NORMAL, { conquered: 3 }), POWERS)).toBeLessThan(sumPower(plan(4, army(4), 6), POWERS));
    expect(sumPower(plan(4, army(4), 6, BALANCE_NORMAL, { secured: true }), POWERS)).toBeLessThan(sumPower(plan(4, army(4), 6), POWERS) * 0.7);
  });

  it('une composition ne dépasse pas la puissance demandée de plus d’un gros monstre', () => {
    for (const age of [0, 2, 3, 4, 5]) for (const pw of [60, 200, 800, 2000]) {
      const ks = compose(pw, 6, age, POWERS), s = sumPower(ks, POWERS);
      expect(s).toBeLessThan(pw * 1.25 + 300);
    }
  });
});

// ---------- Batailles ----------

describe('équilibre : batailles sur l’île du portail', () => {
  beforeAll(() => setMapSize(192));

  /** Une île avec une tour de garde et une caserne, à l'âge `age` */
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
  const tick = (war: War, age: number, t: number, until?: () => boolean) => { for (let i = 0; i < t * 10; i++) { war.update(0.1, age); if (until?.()) return true; } return false; };

  /** `n` troupes (soldats, un archer sur quatre) en garnison, puis une vague de niveau `level` : issue, survivants, ennemis */
  const battle = (age: number, n: number, level: number, difficulty: Difficulty = 'normal') => {
    const w = island(age);
    w.difficulty = difficulty;
    const war = new War(w);
    tick(war, age, 1);
    for (let i = 0; i < n; i++) {
      const kind: TroopKind = i % 4 === 3 ? 'archer' : 'soldier', st = troopStats(kind, age);
      war.army.troops.push({ id: war.army.nextId++, kind, hp: st.hp, maxHp: st.hp, where: 'isle', heal: 0 });
    }
    tick(war, age, 1);
    const f = war.faction!;
    f.raidsRepelled = level - 1;
    war.callWave();
    const start = war.isle!.sim.alive('player').length;
    let foes = 0, big = 0, kinds: DemonKind[] = [];
    tick(war, age, 3, () => !!war.isle!.raid);
    if (war.isle!.raid) { kinds = war.isle!.raiders().map((u) => u.kind as DemonKind); foes = kinds.length; big = kinds.filter((k) => BIG.includes(k)).length; }
    const lost0 = f.raidsLost, rep0 = f.raidsRepelled;
    tick(war, age, 400, () => !war.isle!.raid);
    const left = war.isle!.sim.alive('player').length;
    const won = f.raidsRepelled > rep0 && f.raidsLost === lost0;
    return { won, start, left, foes, big, kinds, towerDown: [...war.isle!.defs.values()].some((b) => b.down), war };
  };

  it('journal de bord (réglage) : armées et vagues par âge', () => {
    const rows: string[] = [];
    for (const [age, n] of [[1, 8], [2, 14], [3, 31], [4, 15], [4, 31], [4, 60], [5, 31]] as const) for (const lv of [1, 3, 4, 5, 8]) {
      const r = battle(age, n, lv);
      rows.push(`âge ${age} ${n} troupes niv ${lv} : ${r.won ? 'VICTOIRE' : 'DÉFAITE'} ennemis ${r.foes} (gros ${r.big}) survivants ${r.left}/${r.start}`);
    }
    console.log(rows.join('\n'));
    expect(rows.length).toBe(35);
  }, 600000);
});
