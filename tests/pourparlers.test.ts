import { it, expect, afterAll } from 'vitest';

/**
 * Les pourparlers de la paix de l'archipel (« Les émissaires », « L'ambassade de la paix ») vont vraiment sur les îles (retour
 * de l'auteur, 17 nov. 2026 : « ne vont pas sur l'île ») : chaque choix, sur une vraie carte, la route du bateau, l'équipe
 * au lieu de la rencontre (sur l'île rivale, sur la petite île, ou à bord au milieu du bras de mer), puis le retour au village,
 * sans bond
 */
import { World, N, MOUNTAIN_H, SEA, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { mulberry32 } from '../src/core/rng';
import { MISSIONS } from '../src/sim/missions';
import { Expeditions } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ExpeditionView } from '../src/render/expeditionView';
import { townPlans } from '../src/world/rivalTown';

function stubCanvas() {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

afterAll(() => setMapSize(192));

function setup() {
  const w = new World();
  w.seed = 11;
  newWorld(w, CONTINENT, 11, GEN_ARCH);
  w.updateVis();
  // le village sur l'île principale, près de sa côte (là où l'essai à l'écran l'avait posé)
  const free = (x: number, z: number) => w.cellSlope(x, z) < 0.25 && w.cellAvg(x, z) > 0.4 && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && !w.occ[w.ci(x, z)] && !w.isWet(x, z) && !w.lake[w.ci(x, z)];
  let at: [number, number] | null = null;
  for (let z = 200; z < 235 && !at; z++) for (let x = 275; x < 300 && !at; x++) {
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
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, 2, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
  ex.pop = () => 60; ex.missing = () => [];
  Object.assign(w.diplo, { met: ['orient', 'asie'], ally: 'orient', path: 'peace', conflict: 'open', asked: true });
  return { w, agents, ex };
}

const cases: [string, number, string][] = [['envoys', 0, 'envoy'], ['envoys', 1, 'envoy'], ['truce', 0, 'islet'], ['truce', 1, 'ship']];
for (const [id, ci, kind] of cases) it(`${id} (choix ${ci}) : l’équipe va jusqu’à la rencontre (${kind}) et revient`, { timeout: 300000 }, () => {
  stubCanvas();
  setMapSize(384);
  const { w, agents, ex } = setup();
  if (id === 'truce') w.exp.done.push('envoys');
  const view = new ExpeditionView(w, agents, ex);
  const m = MISSIONS.find((x) => x.id === id)!;
  const a = ex.start(m, ci, 2)!;
  expect(a).toBeTruthy();
  let trip: { route: [number, number][]; post: [number, number]; trip?: { kind: string } } | null = null, met = false, jumps = 0;
  const last = new Map<number, [number, number]>();
  for (let i = 0; i < 80000 && ex.active.includes(a); i++) {
    agents.update(0.05, 10, 2, false, 40, 0);
    ex.update(0.05);
    if (a.wait) ex.decide(a, 0);
    view.update(0.05);
    const sc = (view as unknown as { shows: Map<number, { scene: { scout: typeof trip; boat: { obj: { position: { x: number; z: number } } } } | null }> }).shows.get(a.id)?.scene;
    if (sc?.scout) trip = sc.scout;
    const k = a.phase === 'work' ? a.t / (a.c.work + a.extra) : 0;
    if (trip && a.phase === 'work' && k > 0.5 && k < 0.6 && !met) {
      met = true;
      // au lieu de la rencontre : l'équipe (ou, à bord, le bateau) y est
      const pos = kind === 'ship' ? [[sc!.boat.obj.position.x, sc!.boat.obj.position.z]] : agents.partyPositions(a.party);
      for (const [x, z] of pos) expect(Math.hypot(x - trip.post[0], z - trip.post[1]), `${id}:${ci}`).toBeLessThan(kind === 'ship' ? 1.5 : 2.5);
      // loin du village : de l'autre côté du bras de mer
      expect(Math.hypot(trip.post[0] - a.dest[0], trip.post[1] - a.dest[1])).toBeGreaterThan(15);
    }
    for (const id2 of a.party) {
      const g = agents.agents.find((x) => x.id === id2) as unknown as { x: number; z: number; hidden: boolean; ride: { move?: [number, number]; fixed?: boolean } | null } | undefined;
      if (!g || g.hidden) { last.delete(id2); continue; }
      const p = last.get(id2);
      if (p && !g.ride?.fixed && Math.hypot(g.x - p[0], g.z - p[1]) > 0.25) jumps++;
      last.set(id2, [g.x, g.z]);
    }
  }
  expect(trip?.trip?.kind).toBe(kind);
  expect(met).toBe(true);
  expect(ex.active.includes(a)).toBe(false);
  expect(jumps).toBe(0);
});
