import { describe, it, expect } from 'vitest';
import { HellMap, HW, Z_EMBER, Z_RIVER } from '../src/world/hell';
import { Hell, FRONT_RESPITE, RAID_FIRST } from '../src/sim/hell';
import { troopStats } from '../src/sim/army';
import { HellBase, RECLAIM_FIRST, COUNTER_FIRST, COUNTER_WARN, FRONT_GRACE, HellBaseSave } from '../src/sim/hellBase';

/** La faction, la base ; les zones 1 à `upTo` conquises */
const setup = (upTo: number, seed = 1) => {
  const m = new HellMap(seed), h = new Hell(m), b = new HellBase(h, m);
  for (let z = 1; z <= upTo; z++) {
    for (const s of h.standing(z)) h.damage(s, 1e6, -1);
    for (const u of h.garrison(z)) u.hp = 0;
  }
  h.events.length = 0;
  return { m, h, b };
};
/** Fait tourner `t` secondes ; rend les événements de la base, dans l'ordre (« type:zone » quand il y a une zone) */
const run = (h: Hell, b: HellBase, t: number, until?: () => boolean) => {
  const seen: string[] = [];
  for (let i = 0; i < t * 10; i++) {
    h.step(0.1); b.step(0.1); h.events.length = 0;
    for (const e of b.events.splice(0)) seen.push('zone' in e ? `${e.type}:${e.zone}` : e.type);
    if (until?.()) break;
  }
  return seen;
};
const cellPos = (m: HellMap, k: number): [number, number] => [(k % HW) + 0.5, Math.floor(k / HW) + 0.5];

describe('le front : les démons reprennent les postes un par un', () => {
  it('tant qu’un poste avancé tient, aucune incursion ne vise l’île ; un répit après le dernier', () => {
    const { h, b } = setup(Z_RIVER);
    run(h, b, 0.2);
    expect(h.frontPosts).toBe(2);
    expect(h.raidDue(0)).toBe(false);
    expect(h.raidDue(RAID_FIRST * 5)).toBe(false);
    // le dernier poste tombe : le répit, puis l'incursion
    h.retake(Z_RIVER); h.retake(Z_EMBER);
    run(h, b, 0.2);
    expect(h.frontPosts).toBe(0);
    const t = RAID_FIRST * 5;
    expect(h.raidDue(t)).toBe(false);
    expect(h.raidDue(t + FRONT_RESPITE - 1)).toBe(false);
    expect(h.raidDue(t + FRONT_RESPITE + 1)).toBe(true);
  });

  it('sans aucun poste avancé, les incursions reprennent comme avant', () => {
    const { h, b } = setup(0);
    run(h, b, 0.2);
    expect(b.outposts()).toBe(0);
    expect(h.raidDue(10)).toBe(false);
    expect(h.raidDue(10 + RAID_FIRST)).toBe(true);
  });

  it('le poste le plus profond est repris d’abord, puis le suivant, puis le front est revenu au portail', () => {
    const { h, b } = setup(Z_RIVER);
    expect(b.deepestPost()).toBe(Z_RIVER);
    const seen = run(h, b, (RECLAIM_FIRST + 700) * 3, () => h.conquered[Z_EMBER] === false);
    // la rivière d'abord, puis les grottes ; jamais l'inverse
    expect(seen.indexOf(`zoneLost:${Z_RIVER}`)).toBeGreaterThanOrEqual(0);
    expect(seen.indexOf(`zoneLost:${Z_RIVER}`)).toBeLessThan(seen.indexOf(`zoneLost:${Z_EMBER}`));
    expect(h.conquered[Z_RIVER]).toBe(false);
    seen.push(...run(h, b, 1));
    expect(h.frontPosts).toBe(0);
    expect(seen).toContain('frontCleared');
  });

  it('un poste en retrait n’est jamais repris tant qu’un poste plus avancé tient (des troupes le gardent)', () => {
    const { m, h, b } = setup(Z_RIVER);
    const [x, z] = cellPos(m, m.nearestWalkable(m.spine[60] + 0.5, 60.5, 4));
    h.order([h.addPlayerUnit("knight", { ...troopStats("knight", 2), hp: 1e6 }, x, z).id], { kind: "hold" });
    for (const u of h.alive('hell')) u.hp = 0;
    run(h, b, RECLAIM_FIRST * 3);
    expect(h.conquered[Z_EMBER]).toBe(true);
    expect(h.conquered[Z_RIVER]).toBe(true);
  });

  it('un assaut sur des troupes qui tiennent un poste sans camp : annoncé à l’avance, et les troupes comptent pour la défense', () => {
    const { m, h, b } = setup(Z_EMBER);
    const [x, z] = cellPos(m, m.nearestWalkable(m.spine[30] + 0.5, 30.5, 4));
    const guards = [0, 1, 2, 3].map(() => h.addPlayerUnit('knight', { ...troopStats('knight', 2), hp: 2000, dmg: 40 }, x, z));
    for (const u of guards) h.order([u.id], { kind: 'hold' });
    for (const d of h.alive('hell')) d.home = [d.x, d.z];
    const seen = run(h, b, COUNTER_FIRST + 200);
    expect(seen).toContain(`counterWarn:${Z_EMBER}`);
    expect(seen.indexOf(`counterWarn:${Z_EMBER}`)).toBeLessThan(seen.indexOf(`counter:${Z_EMBER}`));
    expect(COUNTER_WARN).toBeLessThan(COUNTER_FIRST);
    expect(h.conquered[Z_EMBER]).toBe(true);
    expect(seen).not.toContain(`zoneLost:${Z_EMBER}`);
  });

  it('un poste assiégé que ses troupes ont déserté est perdu après un délai ; le joueur peut le reconquérir', () => {
    const { h, b } = setup(Z_EMBER);
    // un assaut en cours, sans personne sur place
    const u = h.addRaider('imp', { hp: 1e6, dmg: 0, range: 0.5, speed: 0.01, cooldown: 1, sight: 1, radius: 0.2 }, 30, 30);
    b.attackers.set(u.id, Z_EMBER);
    const seen = run(h, b, FRONT_GRACE + 5);
    expect(seen).toContain(`zoneLost:${Z_EMBER}`);
    expect(h.conquered[Z_EMBER]).toBe(false);
    // il reprend la forteresse : le terrain regagné
    for (const s of h.standing(Z_EMBER)) h.damage(s, 1e6, -1);
    expect(h.conquered[Z_EMBER]).toBe(true);
    run(h, b, 0.2);
    expect(h.frontPosts).toBe(1);
  });

  it('une ancienne sauvegarde (sans le front) se charge', () => {
    const { m, h, b } = setup(Z_EMBER);
    const old = { ...b.save() } as Partial<HellBaseSave>;
    delete old.reclaim;
    const h2 = Hell.load(m, h.save());
    const b2 = HellBase.load(h2, m, old);
    run(h2, b2, 0.5);
    expect(h2.frontPosts).toBe(1);
  });
});
