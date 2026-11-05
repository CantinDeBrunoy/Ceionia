import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, setMapSize, VEG_FIELD } from '../src/world/world';
import { Agents } from '../src/sim/agents';
import { findPlots, fieldHands, shareHands, fieldTask, longestRun, rigAt, MAX_HANDS, HAND_POP, machineOf, rigShown, MAX_DRONES } from '../src/sim/fields';

/** Un village sur un monde plat : six maisons, une ferme (ou pas), et un champ de `fw` × `fd` cases un peu plus loin */
function village(age: number, farm = true, fw = 5, fd = 4) {
  const w = new World();
  w.heights.fill(1);
  for (const [x, z] of [[30, 30], [32, 30], [34, 30], [30, 32], [32, 32], [34, 32]]) w.place('house', x, z, 0, true, age, false);
  if (farm) w.place('farm', 37, 31, 0, true, age, false);
  for (let z = 36; z < 36 + fd; z++) for (let x = 30; x < 30 + fw; x++) w.setVeg(x, z, VEG_FIELD);
  return w;
}

/** Fait vivre le village `secs` secondes de jeu à l'heure, l'âge et la saison donnés ; `each` à chaque seconde */
function live(ag: Agents, secs: number, hour: number, age: number, season: number, each?: () => void, pop = 60) {
  for (let t = 0; t < secs * 10; t++) {
    ag.update(0.1, hour, age, false, pop, 0, season);
    if (each && t % 10 === 0) each();
  }
}

/** Ceux qu'on voit à l'ouvrage sur une case de champ */
const atWork = (w: World, ag: Agents) => ag.agents.filter((a) => !a.hidden && a.state === 'doing' && a.task && w.veg[Math.floor(a.z) * N + Math.floor(a.x)] === VEG_FIELD);

describe('travaux des champs', () => {
  beforeAll(() => setMapSize(96));

  it('les bras suivent les emplois des champs (un pour deux cases), sans jamais être tout le village', () => {
    expect(fieldHands(0, 100)).toBe(0);
    expect(fieldHands(1, 100)).toBe(0);
    expect(fieldHands(20, 100)).toBe(4);
    expect(fieldHands(40, 10)).toBe(1);
    expect(fieldHands(5000, 5000)).toBe(MAX_HANDS);
    for (const [f, p] of [[6, 30], [30, 30], [200, 40], [80, 300]]) {
      const n = fieldHands(f, p);
      expect(n).toBeLessThanOrEqual(Math.floor(f / 2));
      expect(n).toBeLessThanOrEqual(p * HAND_POP);
    }
  });

  it('chaque parcelle reçoit des bras selon sa taille, trois au plus', () => {
    const w = new World();
    w.heights.fill(1);
    for (let z = 10; z < 14; z++) for (let x = 10; x < 15; x++) w.setVeg(x, z, VEG_FIELD);
    for (let x = 20; x < 23; x++) w.setVeg(x, 10, VEG_FIELD);
    w.setVeg(30, 30, VEG_FIELD);
    const plots = findPlots(w);
    expect(plots.map((p) => p.cells.length)).toEqual([20, 3, 1]);
    shareHands(plots, 2);
    expect(plots.map((p) => p.hands)).toEqual([2, 0, 0]);
    shareHands(plots, 9);
    expect(plots.map((p) => p.hands)).toEqual([3, 1, 1]);
  });

  it('semer et biner au printemps, moissonner l’été, ramasser et bêcher l’automne ; l’hiver, rien', () => {
    const tasks = (s: number, age: number) => new Set([0, 0.2, 0.5, 0.7, 0.95].map((r) => fieldTask(s, age, r)));
    expect(tasks(0, 1)).toEqual(new Set(['sow', 'hoe']));
    expect(tasks(1, 1)).toEqual(new Set(['reap', 'hoe']));
    expect(tasks(1, 4)).toEqual(new Set(['gather', 'hoe']));
    expect(tasks(2, 2)).toEqual(new Set(['gather', 'dig']));
    expect(tasks(3, 2)).toEqual(new Set([null]));
  });

  it('le jour, des habitants vont travailler aux champs ; la nuit, ils sont tous rentrés', () => {
    const w = village(1), ag = new Agents(w);
    let most = 0;
    const seen = new Set<string>();
    live(ag, 90, 9.5, 1, 1, () => { const n = atWork(w, ag); most = Math.max(most, n.length); for (const a of n) seen.add(a.task!); });
    // vingt cases de champ : dix emplois, dont quatre qu'on voit, en plus des passants
    expect(ag.agents.filter((a) => a.hand).length).toBe(fieldHands(20, 60));
    expect(most).toBeGreaterThanOrEqual(2);
    expect(seen.has('reap')).toBe(true);
    // le soir tombe : plus personne aux champs, chacun chez soi
    live(ag, 60, 22, 1, 1);
    expect(atWork(w, ag)).toEqual([]);
    expect(ag.agents.every((a) => a.hidden)).toBe(true);
  });

  it('l’hiver, personne ne travaille aux champs', () => {
    const w = village(2), ag = new Agents(w);
    let most = 0;
    live(ag, 90, 10, 2, 3, () => { most = Math.max(most, atWork(w, ag).length); });
    expect(most).toBe(0);
  });

  it('les champs sans ferme ont aussi leurs bras ; un village sans champ n’en a aucun', () => {
    const w = village(0, false);
    const ag = new Agents(w);
    let most = 0;
    live(ag, 90, 9.5, 0, 0, () => { most = Math.max(most, atWork(w, ag).length); });
    expect(most).toBeGreaterThanOrEqual(1);
    const bare = new World();
    bare.heights.fill(1);
    for (const [x, z] of [[30, 30], [32, 30], [34, 30]]) bare.place('house', x, z, 0, true, 0, false);
    const ag2 = new Agents(bare);
    live(ag2, 20, 9.5, 0, 0);
    expect(ag2.agents.some((a) => a.hand)).toBe(false);
  });

  it('à l’époque moderne, la grande parcelle a son tracteur, qui laboure en allers et retours', () => {
    expect(new Agents(village(1)).tractors()).toEqual([]);
    const w = village(4), ag = new Agents(w);
    live(ag, 1, 9.5, 4, 0);
    expect(ag.tractors().length).toBe(1);
    const [x0, z0] = ag.tractors()[0];
    let moved = false;
    live(ag, 150, 9.5, 4, 0, () => { const [x, z] = ag.tractors()[0]; if (Math.hypot(x - x0, z - z0) > 0.5) moved = true; });
    expect(moved).toBe(true);
    // il reste dans le champ, sans à-coups
    const run = longestRun(findPlots(w)[0])!;
    let [px, pz] = rigAt(run, 0);
    for (let d = 0.05; d < 40; d += 0.05) {
      const [x, z] = rigAt(run, d);
      expect(Math.hypot(x - px, z - pz)).toBeLessThan(0.06);
      expect(w.veg[Math.floor(z) * N + Math.floor(x)]).toBe(VEG_FIELD);
      px = x; pz = z;
    }
  });
  it('les engins des champs suivent l’époque et la saison : bœufs, tracteur, moissonneuse-batteuse, botteleuse, épandeur', () => {
    expect(machineOf(0, 1, 0)).toBeNull();
    expect(machineOf(1, 0, 0)).toBe('ox');
    expect(machineOf(2, 2, 3)).toBe('ox');
    expect(machineOf(2, 1, 0)).toBe('haycart');
    expect(machineOf(3, 0, 0)).toBe('plough');
    expect(machineOf(3, 1, 1)).toBe('trailer');
    for (const age of [4, 5]) {
      expect(machineOf(age, 1, 0)).toBe('combine');
      expect(machineOf(age, 1, 1)).toBe('baler');
      expect(machineOf(age, 0, 0)).toBe('plough');
      expect(machineOf(age, 2, 1)).toBe('spreader');
    }
    // les attelages de bœufs ne sont dehors que le jour, à la belle saison ; les tracteurs restent garés dans le champ
    expect(rigShown('ox', 1, 10)).toBe(true);
    expect(rigShown('ox', 3, 10)).toBe(false);
    expect(rigShown('haycart', 1, 22)).toBe(false);
    expect(rigShown('plough', 3, 22)).toBe(true);
  });

  it('dès l’Antiquité des bœufs labourent la grande parcelle (sans tracteur) ; l’hiver et la nuit, ils sont rentrés', () => {
    const w = village(2), ag = new Agents(w);
    live(ag, 20, 9.5, 2, 0);
    expect(ag.tractors()).toEqual([]);
    expect(ag.machines().map((m) => m.kind)).toEqual(['ox']);
    const [x0, z0] = ag.machines()[0].at;
    live(ag, 60, 9.5, 2, 0);
    const [x1, z1] = ag.machines()[0].at;
    expect(Math.hypot(x1 - x0, z1 - z0)).toBeGreaterThan(0.5);
    live(ag, 5, 9.5, 2, 1);
    expect(ag.machines().map((m) => m.kind)).toEqual(['haycart']);
    live(ag, 5, 9.5, 2, 3);
    expect(ag.machines()[0].visible).toBe(false);
  });

  it('à la moisson, la moissonneuse-batteuse travaille la grande parcelle ; à l’âge futuriste, un drone la survole, de jour', () => {
    const w = village(4), ag = new Agents(w);
    live(ag, 5, 9.5, 4, 1);
    expect(ag.machines().map((m) => m.kind)).toEqual(['combine']);
    expect(ag.tractors().length).toBe(1);
    expect(ag.flyingDrones()).toEqual([]);
    const w5 = village(5), ag5 = new Agents(w5);
    live(ag5, 5, 9.5, 5, 1);
    expect(ag5.machines().map((m) => m.kind)).toEqual(['combine']);
    expect(ag5.flyingDrones().length).toBe(1);
    expect(ag5.flyingDrones().length).toBeLessThanOrEqual(MAX_DRONES);
    // la nuit et l'hiver, il est posé
    live(ag5, 5, 22, 5, 1);
    expect(ag5.flyingDrones()).toEqual([]);
    live(ag5, 5, 9.5, 5, 3);
    expect(ag5.flyingDrones()).toEqual([]);
  });
});
