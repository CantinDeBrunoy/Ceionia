import { souffle } from './souffle';
import { it, expect, afterAll } from 'vitest';

/**
 * Les visites sur les îles de l'archipel se jouent sur la mer ouverte (retour de l'auteur, 21 nov. 2026 : « Espionner leur
 * port » mouillait dans une flaque au milieu des roseaux de la presqu'île rivale, « j'ai un bateau dans une flaque d'eau »).
 * La route sur l'eau passait par toute case mouillée (rivières, marais, mares) et le point « au large » était le dernier de la
 * route avant le port. Ici, sur deux archipels et pour chaque façon de partir de chaque visite : toute la route du bateau est
 * sur la mer reliée au large (`openWater`), le tour de la régate aussi, et le mouillage au large du port est en eau libre, à
 * bonne distance du quai
 */
import { World, N, MOUNTAIN_H, SEA, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN_ARCH } from '../src/world/continent';
import { mulberry32 } from '../src/core/rng';
import { Expeditions, openWater, seaRoomMap, OPEN_SEA_SHORE } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { ISLE_MISSIONS } from '../src/sim/isleMissions';
import { ExpeditionView } from '../src/render/expeditionView';
import { offing, OFFING_NEAR, OFFING_FAR, OFFING_ROOM, LAGOON_REACH } from '../src/render/expeditionScenes';
import { MISSIONS } from '../src/sim/missions';

/** La fin d'une route à terre peut passer par la lagune d'un port, sur cette distance au plus (`SCOUT_REACH` de la scène) */
const SCOUT_REACH = 12;
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

const SEEDS = [11, 7313, 20974, 68380];

it('le mouillage au large d’un port : mer ouverte, eau libre autour, à bonne distance du quai', { timeout: 300000 }, async () => {
  for (const seed of SEEDS) {
    await souffle();
    const w = archipel(seed), sea = openWater(w), room = seaRoomMap(sea);
    for (const plan of townPlans(w)) {
      const p = offing(w, sea, plan.points.port);
      expect(p, `${seed} ${plan.people}`).not.toBeNull();
      const k = Math.floor(p![1]) * N + Math.floor(p![0]), d = Math.hypot(p![0] - plan.points.port[0], p![1] - plan.points.port[1]);
      expect(sea[k]).toBe(1);
      expect(d).toBeGreaterThanOrEqual(OFFING_NEAR - 1);
      // (un port au fond d'une lagune : la pleine mer la plus proche, plus loin, avec moins d'eau libre)
      if (d <= OFFING_FAR + 1) expect(room[k]).toBeGreaterThanOrEqual(OFFING_ROOM);
      else { expect(d).toBeLessThanOrEqual(LAGOON_REACH + 1); expect(room[k]).toBeGreaterThanOrEqual(1.5); }
    }
  }
});

it('chaque visite sur les îles navigue sur la mer ouverte, jamais dans une mare ou un marais', { timeout: 600000 }, async () => {
  stubCanvas();
  const bad: string[] = [];
  for (const seed of SEEDS) {
    await souffle();
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
      // (le premier point est le mouillage de départ, sur la côte de notre île ; un port au fond d'une lagune se gagne par
      // elle, sur la fin du trajet seulement)
      const v = m.choices[ci].visit!, ship = v.at === 'offport' || v.at === 'islet', end = trip.route[trip.route.length - 1];
      const off = trip.route.slice(1).filter(([x, z]) => !wet(x, z) && (ship || Math.hypot(x - end[0], z - end[1]) > SCOUT_REACH + 2));
      if (off.length) bad.push(`${seed} ${m.id}/${ci} : ${off.length} points de la route hors de la mer ouverte (${off[0].map((n) => n.toFixed(1))})`);
      const lp = trip.trip.loop?.route.slice(1, -1).filter(([x, z]) => !wet(x, z)) ?? [];
      if (lp.length) bad.push(`${seed} ${m.id}/${ci} : le tour de la régate sort de la mer ouverte`);
      if (v.at === 'offport' && !wet(trip.post[0], trip.post[1])) bad.push(`${seed} ${m.id}/${ci} : mouillage hors de la mer ouverte`);
      // (on rend l'équipe, la suivante part du même village)
      ex.active.length = 0;
    }
  }
  expect(bad.join('\n')).toBe('');
});

/**
 * Retour de l'auteur (21 nov. 2026) : « les expéditions qui doivent aller chez nos alliés n'y arrivent jamais ». Chaque visite
 * chez l'allié, et les émissaires, jouées de bout en bout : l'équipe atteint le lieu de la visite (à terre, ou le bateau au
 * tour de la petite île), puis l'expédition se termine et rend son récit. Sur l'archipel de Bernard (graine 20974, allié les
 * Jadéens, dont le port donne sur une lagune), la route par la seule mer ouverte n'arrivait plus au port
 */
it('chaque visite chez l’allié arrive sur son île et se termine', { timeout: 900000 }, async () => {
  stubCanvas();
  const bad: string[] = [];
  for (const [seed, ally, lagoon] of [[11, 'orient', false], [11, 'orient', true], [20974, 'asie', false]] as const) {
    await souffle();
    const w = archipel(seed);
    w.diplo.ally = ally; w.diplo.path = 'peace';
    w.diplo.saga.sea.push('convoy');
    // (le port allié au fond d'une lagune, comme celui des Jadéens chez Bernard : l’eau à moins de 20 cases du port n'est pas
    // reliée au large, une eau fermée au niveau de la mer)
    if (lagoon) {
      const port = townPlans(w).find((p) => p.people === ally)!.points.port;
      for (let dz = -20; dz <= 20; dz++) for (let dx = -20; dx <= 20; dx++) {
        const x = Math.floor(port[0]) + dx, z = Math.floor(port[1]) + dz;
        if (Math.hypot(dx, dz) > 20 || !w.inCells(x, z) || w.cellAvg(x, z) >= -0.1) continue;
        w.lake[w.ci(x, z)] = 1; w.lakeLevel[w.ci(x, z)] = SEA;
      }
    }
    for (const m of [...ISLE_MISSIONS.filter((x) => x.isle!.to === 'ally'), MISSIONS.find((x) => x.id === 'envoys')!]) {
      const agents = new Agents(w);
      for (let i = 0; i < 20; i++) agents.update(0.1, 10, 2, false, 40, 0);
      const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
      ex.pop = () => 60; ex.missing = () => [];
      let told = false;
      ex.onReport = () => { told = true; };
      const view = new ExpeditionView(w, agents, ex);
      const a = ex.start(m, 0, 2);
      if (!a) { bad.push(`${seed}${lagoon ? ' lagune' : ''} ${m.id} : refusée`); continue; }
      let post: [number, number] | null = null, best = Infinity;
      for (let i = 0; i < 12000 && ex.active.includes(a); i++) {
        agents.update(0.1, 10, 2, false, 40, 0); ex.update(0.1); view.update(0.1);
        if (a.wait) ex.decide(a, 0);
        const sc = (view as unknown as { shows: Map<number, { scene: { scout: { post: [number, number] } | null } | null }> }).shows.get(a.id)?.scene;
        if (sc?.scout) post = sc.scout.post;
        if (post && a.phase === 'work') for (const [x, z] of agents.partyPositions(a.party)) best = Math.min(best, Math.hypot(x - post[0], z - post[1]));
      }
      if (!post) bad.push(`${seed}${lagoon ? ' lagune' : ''} ${m.id} : pas de route vers l'île (simple voyage)`);
      else if (best > 1.5) bad.push(`${seed}${lagoon ? ' lagune' : ''} ${m.id} : l'équipe n'a pas atteint le lieu (au plus près ${best.toFixed(1)} cases)`);
      if (ex.active.includes(a)) bad.push(`${seed}${lagoon ? ' lagune' : ''} ${m.id} : jamais finie (${a.phase})`);
      else if (!told) bad.push(`${seed}${lagoon ? ' lagune' : ''} ${m.id} : finie sans récit`);
      ex.active.length = 0;
    }
  }
  expect(bad.join('\n')).toBe('');
});

/**
 * La partie de l'auteur (21 nov. 2026) : le départ d'une expédition en mer était choisi dans les terres, à côté d'une mare,
 * la mer à quatre cases derrière une bande de terre (`openSea` acceptait la terre avant l'eau) ; le bateau partait de la mare
 * et y faisait des allers-retours. Le mouillage de chaque expédition en mer est maintenant au bord de la mer ouverte
 */
it('chaque expédition qui traverse jusqu’aux îles part d’une côte au bord de la mer ouverte', { timeout: 600000 }, async () => {
  const bad: string[] = [];
  for (const seed of SEEDS) {
    await souffle();
    const w = archipel(seed), sea = openWater(w);
    const near = (x: number, z: number, r: number) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz; if (w.inCells(cx, cz) && sea[cz * N + cx]) return true; } return false; };
    for (const m of [...ISLE_MISSIONS, ...MISSIONS.filter((x) => ['envoys', 'allywar'].includes(x.id))]) {
      const agents = new Agents(w);
      for (let i = 0; i < 20; i++) agents.update(0.1, 10, 2, false, 40, 0);
      const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
      ex.pop = () => 60; ex.missing = () => [];
      const a = ex.start(m, 0, 2);
      if (!a) continue;
      if (a.sea && !near(a.dest[0], a.dest[1], OPEN_SEA_SHORE + 1)) bad.push(`${seed} ${m.id} : départ à ${a.dest.map((v) => v.toFixed(0))}, loin de la mer ouverte`);
    }
  }
  expect(bad.join('\n')).toBe('');
});

/**
 * Sans route par la mer vers l'île (ici, toute la mer changée en eau fermée) : l'équipe ne tourne pas en rond, elle rentre
 * aussitôt, sans rien gagner ni perdre, et le récit le dit
 */
it('une visite sans route par la mer rentre aussitôt et le dit', { timeout: 300000 }, async () => {
  stubCanvas();
  const w = archipel(11);
  w.diplo.ally = 'orient';
  for (let k = 0; k < N * N; k++) if (w.cellAvg(k % N, Math.floor(k / N)) < -0.1) { w.lake[k] = 1; w.lakeLevel[k] = SEA; }
  const agents = new Agents(w);
  for (let i = 0; i < 20; i++) agents.update(0.1, 10, 2, false, 40, 0);
  const ex = new Expeditions(w, agents, () => 100, mulberry32(7));
  ex.pop = () => 60; ex.missing = () => [];
  let text = '';
  ex.onReport = (r) => { text = r.text; };
  const view = new ExpeditionView(w, agents, ex);
  const before = JSON.stringify(w.diplo.boons), gold = w.gold;
  const a = ex.start(ISLE_MISSIONS.find((x) => x.id === 'isleFair')!, 0, 2)!;
  expect(a).toBeTruthy();
  let i = 0;
  for (; i < 12000 && ex.active.includes(a); i++) { agents.update(0.1, 10, 2, false, 40, 0); ex.update(0.1); view.update(0.1); if (a.wait) ex.decide(a, 0); }
  expect(a.noRoute).toBe(true);
  expect(ex.active.includes(a)).toBe(false);
  expect(text).toMatch(/Aucune route par la mer/);
  expect(JSON.stringify(w.diplo.boons)).toBe(before);
  expect(w.gold).toBe(gold);
  expect(w.exp.done).not.toContain('isleFair');
});

it('une côte ouverte : la mer commence dans les deux cases, pas derrière une bande de terre', { timeout: 300000 }, async () => {
  const w = archipel(11), agents = new Agents(w), ex = new Expeditions(w, agents, () => 100, mulberry32(7));
  const openSea = (x: number, z: number) => (ex as unknown as { openSea(x: number, z: number, len?: number, shore?: boolean): boolean }).openSea(x, z, 8, true);
  const land = (x: number, z: number) => w.inCells(x, z) && w.cellAvg(x, z) >= -0.1;
  // une case de terre dont la mer, vers le nord, ne commence qu'à trois cases (les deux premières sont de la terre)
  let inland: [number, number] | null = null, shore: [number, number] | null = null;
  for (let z = 20; z < N - 20 && !(inland && shore); z++) for (let x = 20; x < N - 20 && !(inland && shore); x++) {
    if (!land(x, z) || w.lake[w.ci(x, z)]) continue;
    const ray = Array.from({ length: 14 }, (_, s) => w.cellAvg(x, z - 1 - s));
    const sea = (s: number) => ray[s] < -0.1 && !w.lake[w.ci(x, z - 1 - s)];
    // (et aucune mer à deux cases dans les autres directions)
    let dry = true;
    for (let dz = -2; dz <= 2 && dry; dz++) for (let dx = -2; dx <= 2 && dry; dx++) if (w.inCells(x + dx, z + dz) && w.cellAvg(x + dx, z + dz) < -0.1) dry = false;
    if (!inland && dry && [3, 4, 5, 6, 7, 8, 9, 10].every(sea) && ray.some((h) => h < -0.5)) inland = [x, z];
    if (!shore && sea(0) && [1, 2, 3, 4, 5, 6, 7, 8].every(sea) && ray.some((h) => h < -0.5)) shore = [x, z];
  }
  expect(inland).not.toBeNull();
  expect(shore).not.toBeNull();
  expect(openSea(...inland!)).toBe(false);
  expect(openSea(...shore!)).toBe(true);
});
