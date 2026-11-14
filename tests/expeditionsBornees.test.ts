import { describe, it, expect } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { mulberry32, wrapAngle } from '../src/core/rng';
import { MISSIONS, Mission } from '../src/sim/missions';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ExpeditionView } from '../src/render/expeditionView';
import { GameTime } from '../src/core/time';

/**
 * Non-régression : un joueur a vu le jeu se figer en lançant « Le miel sauvage ». Chaque mission, chaque choix, se joue ici
 * de bout en bout (simulation, scène, vue) et doit finir en temps borné, sans boucle sans fin
 */
function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

/** Un village de quelques maisons et une écurie sur le continent de la graine 2026 */
function village(age: number) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  let at: [number, number] | null = null;
  for (let z = 10; z < N - 10 && !at; z++)
    for (let x = 10; x < N - 10 && !at; x++)
      if (w.cellAvg(x, z) > 0.6 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) at = [x, z];
  const [x, z] = at!;
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, age, false);
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, age, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(age + 1));
  ex.pop = () => 60;
  // (les bâtiments et missions exigés ne comptent pas ici : on veut voir chaque mission se jouer)
  ex.missing = () => [];
  return { w, agents, ex, view: new ExpeditionView(w, agents, ex) };
}

/** Joue un choix jusqu'au bout ; rend le nombre d'images (null : pas parti) */
function run(v: ReturnType<typeof village>, m: Mission, ci: number, pick: number) {
  for (const g of v.agents.agents) g.rest = 0;
  const a = v.ex.start(m, ci, m.age);
  if (!a) return null;
  let i = 0;
  for (; i < 50000 && v.ex.active.includes(a); i++) {
    v.agents.update(0.05, 10, m.age, false, 40, 0);
    v.ex.update(0.05);
    if (a.wait) { const o = a.wait.options.findIndex((_, j) => j >= pick % a.wait!.options.length && v.ex.canTake(a, j)); v.ex.decide(a, o >= 0 ? o : 0); }
    v.view.update(0.05);
  }
  // le décor achève de s'effacer
  for (let k = 0; k < 800; k++) v.view.update(0.05);
  expect(v.ex.active.includes(a), `${m.id} choix ${ci} encore en cours`).toBe(false);
  return i;
}

describe('chaque expédition se termine', () => {
  for (let age = 0; age <= 5; age++) {
    it(`les missions de l'âge ${age}, chaque choix, en temps borné`, { timeout: 120000 }, () => {
      stubCanvas();
      const v = village(age);
      const ran: string[] = [];
      for (const m of MISSIONS.filter((x) => x.age === age && !x.farewell))
        m.choices.forEach((_, ci) => {
          const t0 = performance.now();
          if (run(v, m, ci, ci) !== null) ran.push(`${m.id}:${ci}`);
          expect(performance.now() - t0, `${m.id} choix ${ci}`).toBeLessThan(30000);
        });
      // (sauf au futur : la fusée et la lune partent du cosmodrome, que ce village n'a pas)
      const all = MISSIONS.filter((x) => x.age === age && !x.farewell).reduce((n, m) => n + m.choices.length, 0);
      if (age < 5) expect(ran.length).toBe(all); else expect(ran.length).toBeGreaterThan(0);
      if (age === 0) expect(ran).toEqual(expect.arrayContaining(['honey:0', 'honey:1']));
    });
  }

  it('le miel sauvage : chaque décision possible, à chaque âge du village', { timeout: 120000 }, () => {
    stubCanvas();
    const m = MISSIONS.find((x) => x.id === 'honey')!;
    for (const age of [0, 3, 5]) {
      const v = village(age);
      for (const ci of [0, 1]) for (const pick of [0, 1, 2]) {
        for (const g of v.agents.agents) g.rest = 0;
        const a = v.ex.start(m, ci, age)!;
        expect(a).not.toBeNull();
        for (let i = 0; i < 50000 && v.ex.active.includes(a); i++) {
          v.agents.update(0.05, 10, age, false, 40, 0);
          v.ex.update(0.05);
          if (a.wait) v.ex.decide(a, v.ex.canTake(a, pick) ? pick : 0);
          v.view.update(0.05);
        }
        expect(v.ex.active.includes(a)).toBe(false);
      }
    }
  });
});

describe('gardes contre les boucles sans fin', () => {
  it('l’heure du jeu reste bornée même avec un pas de temps aberrant', () => {
    const t = new GameTime();
    t.update(1e12);
    expect(t.hour).toBeGreaterThanOrEqual(0);
    expect(t.hour).toBeLessThan(24);
    t.hour = Infinity;
    t.update(0.1);
    expect(Number.isFinite(t.hour)).toBe(true);
    t.update(NaN);
    expect(Number.isFinite(t.hour) && Number.isFinite(t.seasonT)).toBe(true);
  });

  it('un angle se ramène entre −π et π sans boucler, même énorme ou infini', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-3.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 9);
    expect(Math.abs(wrapAngle(1e20))).toBeLessThanOrEqual(Math.PI);
    expect(wrapAngle(Infinity)).toBe(0);
    expect(wrapAngle(NaN)).toBe(0);
  });
});
