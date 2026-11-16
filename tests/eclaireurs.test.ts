import { it, expect, afterAll } from 'vitest';

/**
 * Les éclaireurs de l'archipel (`allywar`) sur une vraie carte : vu à l'écran (nov. 2026), le mouillage tombait au coin d'une
 * case de berge et l'eau la plus proche de la plage rivale était une flaque fermée ; `scoutTrip` renonçait, la barque partait
 * en simple voyage, deux à bord, et le troisième éclaireur restait planté au quai. Ici : les trois montent, la barque suit
 * l'eau jusqu'à la plage rivale, et ils finissent tapis face aux remparts, sur la terre ferme
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

it('les trois éclaireurs traversent jusqu’à l’île rivale et se postent face aux remparts', { timeout: 300000 }, () => {
  stubCanvas();
  setMapSize(384);
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
  Object.assign(w.diplo, { met: ['orient', 'asie'], ally: 'orient', path: 'war', conflict: 'open', asked: true });
  const view = new ExpeditionView(w, agents, ex);
  const m = MISSIONS.find((x) => x.id === 'allywar')!;
  const a = ex.start(m, 1, 2)!;
  expect(a).toBeTruthy();
  const plan = townPlans(w).find((p) => p.people === 'asie')!;
  let scout: { route: [number, number][]; post: [number, number] } | null = null, posted = false;
  for (let i = 0; i < 60000 && ex.active.includes(a); i++) {
    agents.update(0.05, 10, 2, false, 40, 0);
    ex.update(0.05);
    if (a.wait) ex.decide(a, 0);
    view.update(0.05);
    const sc = (view as unknown as { shows: Map<number, { scene: { scout: typeof scout } | null }> }).shows.get(a.id)?.scene;
    if (sc?.scout) scout = sc.scout;
    if (scout && a.phase === 'work' && a.t > (a.c.work + a.extra) * 0.75 && !posted) {
      // tous les trois au poste : près de lui, sur la terre de l'île rivale
      const pos = agents.partyPositions(a.party);
      expect(pos).toHaveLength(3);
      for (const [x, z] of pos) {
        expect(Math.hypot(x - scout.post[0], z - scout.post[1])).toBeLessThan(2);
        expect(w.hAt(x, z), `${x} ${z}`).toBeGreaterThan(SEA);
      }
      posted = true;
    }
  }
  expect(scout).not.toBeNull();
  // l'aller simple fini, l'équipe est rentrée avec les troupes : elle repart du village, pas de l'île rivale
  expect(ex.active.includes(a)).toBe(false);
  for (const [x, z] of agents.partyPositions(a.party)) expect(Math.hypot(x - a.base[0], z - a.base[1])).toBeLessThan(3);
  // la barque a fini près de la plage rivale
  const end = scout!.route[scout!.route.length - 1];
  expect(Math.hypot(end[0] - plan.points.plage[0], end[1] - plan.points.plage[1])).toBeLessThan(13);
  expect(posted).toBe(true);
  // tapis près de la porte (à mi-chemin, ils étaient à vingt cases des remparts, hors de la vue)
  const gate = plan.points.portes[0];
  expect(Math.hypot(scout!.post[0] - gate[0], scout!.post[1] - gate[1])).toBeLessThan(9);
  void N;
});
