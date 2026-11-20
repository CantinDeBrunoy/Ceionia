import { it, expect, afterAll } from 'vitest';

/**
 * Les visites sur les îles de l'archipel se jouent sur la mer ouverte (retour de l'auteur, 21 nov. 2026 : « Espionner leur
 * port » mouillait dans une flaque au milieu des roseaux de la presqu'île rivale, « j'ai un bateau dans une flaque d'eau »).
 * La route sur l'eau passait par toute case mouillée (rivières, marais, mares) et le point « au large » était le dernier de la
 * route avant le port. Ici, sur deux archipels et pour chaque façon de partir de chaque visite : toute la route du bateau est
 * sur la mer reliée au large (`openWater`), le tour de la régate aussi, et le mouillage au large du port est en eau libre, à
 * bonne distance du quai
 */
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { mulberry32 } from '../src/core/rng';
import { Expeditions, openWater, seaRoomMap } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ISLE_MISSIONS } from '../src/sim/isleMissions';
import { ExpeditionView } from '../src/render/expeditionView';
import { offing, OFFING_NEAR, OFFING_FAR, OFFING_ROOM } from '../src/render/expeditionScenes';
import { townPlans } from '../src/world/rivalTown';

function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

afterAll(() => setMapSize(192));

/** Un archipel et un village sur l'île principale, près de sa côte */
function archipel(seed: number) {
  setMapSize(384);
  const w = new World();
  w.seed = seed;
  newWorld(w, CONTINENT, seed, GEN_ARCH);
  w.updateVis();
  const free = (x: number, z: number) => w.cellSlope(x, z) < 0.25 && w.cellAvg(x, z) > 0.4 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && !w.occ[w.ci(x, z)] && !w.isWet(x, z) && !w.lake[w.ci(x, z)];
  const main = w.isles!.main;
  let at: [number, number] | null = null;
  for (let z = main.z + 20; z < main.z + main.n - 20 && !at; z += 2) for (let x = main.x + 20; x < main.x + main.n - 20 && !at; x += 2) {
    let ok = true;
    for (let dz = 0; dz < 6 && ok; dz++) for (let dx = 0; dx < 6 && ok; dx++) if (!w.inCells(x + dx, z + dz) || !free(x + dx, z + dz)) ok = false;
    if (ok) at = [x, z];
  }
  expect(at).not.toBeNull();
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) {
    const k = w.ci(at![0] + dx, at![1] + dz);
    w.veg[k] = 0; w.decor[k] = 0;
    if (w.canPlace('house', at![0] + dx, at![1] + dz) === null) w.place('house', at![0] + dx, at![1] + dz, 0, true, 2, false);
  }
  Object.assign(w.diplo, { met: ['orient', 'asie'], ally: 'orient', path: 'war', conflict: 'open', asked: true });
  return w;
}

const SEEDS = [11, 7313];

it('le mouillage au large d’un port : mer ouverte, eau libre autour, à bonne distance du quai', { timeout: 300000 }, () => {
  for (const seed of SEEDS) {
    const w = archipel(seed), sea = openWater(w), room = seaRoomMap(sea);
    for (const plan of townPlans(w)) {
      const p = offing(w, sea, plan.points.port);
      expect(p, `${seed} ${plan.people}`).not.toBeNull();
      const k = Math.floor(p![1]) * N + Math.floor(p![0]), d = Math.hypot(p![0] - plan.points.port[0], p![1] - plan.points.port[1]);
      expect(sea[k]).toBe(1);
      expect(room[k]).toBeGreaterThanOrEqual(OFFING_ROOM);
      expect(d).toBeGreaterThanOrEqual(OFFING_NEAR - 1);
      expect(d).toBeLessThanOrEqual(OFFING_FAR + 1);
    }
  }
});

it('chaque visite sur les îles navigue sur la mer ouverte, jamais dans une mare ou un marais', { timeout: 600000 }, () => {
  stubCanvas();
  const bad: string[] = [];
  for (const seed of SEEDS) {
    const w = archipel(seed), sea = openWater(w), wet = (x: number, z: number) => sea[Math.floor(z) * N + Math.floor(x)] === 1;
    for (const m of ISLE_MISSIONS) for (let ci = 0; ci < m.choices.length; ci++) {
      const agents = new Agents(w);
      for (let i = 0; i < 20; i++) agents.update(0.1, 10, 2, false, 40, 0);
      const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
      ex.pop = () => 60; ex.missing = () => [];
      const view = new ExpeditionView(w, agents, ex);
      const a = ex.start(m, ci, 2);
      if (!a) { bad.push(`${seed} ${m.id}/${ci} : refusée`); continue; }
      view.update(0.05);
      const sc = (view as unknown as { shows: Map<number, { scene: { scout: { route: [number, number][]; post: [number, number]; trip?: { kind: string; loop?: { route: [number, number][] } } } | null } | null }> }).shows.get(a.id)?.scene;
      const trip = sc?.scout;
      if (!trip?.trip) { bad.push(`${seed} ${m.id}/${ci} : pas de visite sur l'île`); continue; }
      // (le premier point est le mouillage de départ, sur la côte de notre île)
      const off = trip.route.slice(1).filter(([x, z]) => !wet(x, z));
      if (off.length) bad.push(`${seed} ${m.id}/${ci} : ${off.length} points de la route hors de la mer ouverte (${off[0].map((v) => v.toFixed(1))})`);
      const lp = trip.trip.loop?.route.slice(1, -1).filter(([x, z]) => !wet(x, z)) ?? [];
      if (lp.length) bad.push(`${seed} ${m.id}/${ci} : le tour de la régate sort de la mer ouverte`);
      if (m.choices[ci].visit!.at === 'offport' && !wet(trip.post[0], trip.post[1])) bad.push(`${seed} ${m.id}/${ci} : mouillage hors de la mer ouverte`);
      // (on rend l'équipe, la suivante part du même village)
      ex.active.length = 0;
    }
  }
  expect(bad.join('\n')).toBe('');
});
