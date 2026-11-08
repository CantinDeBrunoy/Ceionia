import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { Patrols, PATROL_MAX, PATROL_RADIUS, patrolRole, patrolSize } from '../src/sim/patrols';
import { isleOrigins } from '../src/build/zones';
import { makeSoldier } from '../src/render/soldiers';

/**
 * Les patrouilles de soldats du village : une par tour de garde ou caserne du village (jamais pour celles de l'île), au plus
 * six, en file sur les routes autour de leur bâtiment, la tenue de l'époque
 */

/** Une carte, un replat au village avec une rue droite et une rue en travers */
const setup = () => {
  const w = new World();
  newWorld(w, 3, 2026, GEN);
  w.exp.done.push('portal');
  const [sx, sz] = w.startSpot();
  for (let z = sz - 6; z <= sz + 8; z++) for (let x = sx - 6; x <= sx + 8; x++) w.heights[z * (N + 1) + x] = 1.5;
  for (let z = sz - 6; z < sz + 8; z++) for (let x = sx - 6; x < sx + 8; x++) w.veg[w.ci(x, z)] = 0;
  for (let x = sx - 5; x < sx + 7; x++) w.setRoad(x, sz + 2, true);
  for (let z = sz - 5; z < sz + 7; z++) w.setRoad(sx + 1, z, true);
  return { w, sx, sz };
};
const run = (p: Patrols, t: number, age = 1) => { for (let i = 0; i < t * 20; i++) p.update(0.05, age); };

describe('patrouilles du village', () => {
  beforeAll(() => setMapSize(192));

  it('un groupe par tour ou caserne du village, de deux ou trois soldats ; rien pour les défenses de l’île ; six groupes au plus', () => {
    const { w, sx, sz } = setup();
    const p = new Patrols(w);
    run(p, 0.1);
    expect(p.groups).toEqual([]);
    w.place('watchtower', sx, sz, 0, true, 1, false);
    run(p, 0.1);
    expect(p.groups.length).toBe(1);
    expect(p.groups[0].size).toBe(patrolSize('watchtower'));
    expect(p.all().length).toBe(2);
    w.place('barracks', sx + 3, sz, 0, true, 1, false);
    run(p, 0.1);
    expect(p.groups.length).toBe(2);
    expect(p.all().length).toBe(5);
    // les défenses de l'île n'envoient personne dans les rues du village
    const t = isleOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
    run(p, 0.1);
    expect(p.groups.length).toBe(2);
    // dix tours : six groupes au plus, jamais plus de dix-huit soldats
    for (let i = 0; i < 10; i++) w.place('watchtower', sx - 5 + i, sz - 2, 0, true, 1, false);
    run(p, 0.1);
    expect(p.groups.length).toBe(PATROL_MAX);
    expect(Patrols.garrisons(w).length).toBe(PATROL_MAX);
    expect(p.all().length).toBeLessThanOrEqual(PATROL_MAX * 3);
    // une tour démolie : sa ronde s'arrête
    const first = p.groups[0].home;
    w.removeBuilding(first);
    run(p, 0.1);
    expect(p.groups.some((g) => g.home === first)).toBe(false);
  });

  it('la ronde suit les routes, à portée de son bâtiment, et marque des pauses au garde-à-vous', () => {
    const { w, sx, sz } = setup();
    w.place('barracks', sx + 3, sz - 1, 0, true, 1, false);
    const p = new Patrols(w);
    run(p, 0.1);
    const g = p.groups[0];
    expect(g.posted).toBe(false);
    expect(w.road[g.cell]).toBe(1);
    let moved = 0, guarded = 0, maxD = 0;
    const x0 = g.x, z0 = g.z;
    for (let i = 0; i < 20 * 90; i++) {
      p.update(0.05, 1);
      if (g.mode === 'guard') guarded++;
      // toujours sur une rue (à l'écart du trottoir près), jamais loin de la caserne
      const c = w.ci(Math.floor(g.x), Math.floor(g.z));
      expect(w.road[c] === 1 || w.road[g.cell] === 1).toBe(true);
      maxD = Math.max(maxD, Math.hypot(g.x - g.hx, g.z - g.hz));
      if (Math.hypot(g.x - x0, g.z - z0) > 2) moved++;
    }
    expect(moved).toBeGreaterThan(0);
    expect(guarded).toBeGreaterThan(0);
    expect(maxD).toBeLessThanOrEqual(PATROL_RADIUS + 1);
    // la file : chacun derrière l'autre, à un pas d'écart
    const m = p.members(g);
    expect(m.length).toBe(3);
    for (let i = 1; i < m.length; i++) expect(Math.hypot(m[i].x - m[i - 1].x, m[i].z - m[i - 1].z)).toBeLessThan(0.6);
  });

  it('sans rue autour, le groupe monte la garde devant la porte', () => {
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    const [sx, sz] = w.startSpot();
    for (let z = sz - 3; z <= sz + 5; z++) for (let x = sx - 3; x <= sx + 5; x++) w.heights[z * (N + 1) + x] = 1.5;
    for (let z = sz - 3; z < sz + 5; z++) for (let x = sx - 3; x < sx + 5; x++) { w.veg[w.ci(x, z)] = 0; w.setRoad(x, z, false); }
    w.place('watchtower', sx, sz, 0, false, 1, false);
    const p = new Patrols(w);
    run(p, 3);
    const g = p.groups[0];
    expect(g.posted).toBe(true);
    expect(g.mode).toBe('guard');
    expect(Math.hypot(g.x - g.hx, g.z - g.hz)).toBeLessThan(1.2);
  });

  it('la tenue et l’arme sont celles de l’âge : lance et bouclier, épée et armure, fusil, fusil d’assaut, soldat futuriste', () => {
    expect(patrolRole(0)).toBe('spearman');
    expect(patrolRole(1)).toBe('spearman');
    expect(patrolRole(2)).toBe('soldier');
    expect(patrolRole(5)).toBe('soldier');
    const holds = [1, 2, 3, 4, 5].map((age) => { const s = makeSoldier(age, 0, false, patrolRole(age)); return [s.arms[0].userData.hold, s.arms[1].userData.hold]; });
    expect(holds[0]).toEqual(['spear', 'shield']);
    expect(holds[1]).toEqual(['blade', 'shield']);
    expect(holds[2][0]).toBe('rifle');
    expect(holds[3][0]).toBe('rifle');
    expect(holds[4][0]).toBe('rifle');
    // la nuit, la torche dans la main gauche
    const night = makeSoldier(2, 0, true, patrolRole(2));
    expect(night.arms[1].userData.hold).toBe('torch');
    expect(night.flame).not.toBeNull();
  });
});
