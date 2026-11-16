import { describe, it, expect } from 'vitest';
import { World, N, MOUNTAIN_H, setMapSize } from '../src/world/world';
import { newWorld } from '../src/world/mapgen';
import { Sim } from '../src/sim/sim';
import { Agents } from '../src/sim/agents';
import { autoRoad, unlayAccess } from '../src/build/autoroads';
import { Building, KINDS } from '../src/build/catalog';
import { Fires } from '../src/render/fires';
import { computeCoverage } from '../src/sim/coverage';
import { War } from '../src/sim/war';
import { hellFallen } from '../src/sim/kingdom';
import { isleOrigins } from '../src/build/zones';
import { GEN } from '../src/world/continent';
import { FREIGHT_BONUS } from '../src/sim/freight';
import { BIOME_SNOW, SEA } from '../src/world/world';
import { DECK_CLEAR } from '../src/world/crossings';
import { readFileSync } from 'fs';

/**
 * Les bugs relevés en écrivant le manuel `docs/` (section M du backlog) : chacun a son test, qui échouait avant la correction
 */

function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/** Première case de terre plate, entourée de cases où bâtir aussi (voir `world.test.ts`) */
function flatLand(w: World, h = 0.6, skip = 0) {
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  for (let z = 10; z < N - 10; z++)
    for (let x = 10; x < N - 10; x++)
      if (w.cellAvg(x, z) > h && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && ok(x, z) && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz))) && skip-- <= 0) return [x, z];
  throw new Error('pas de terrain plat');
}

describe('annuler', () => {
  it('rend les briques et rétablit les lignes de train', () => {
    const w = continent();
    w.brick = 30;
    w.lines = [{ id: 1, stops: [5, 6], color: 1, via: [[3]] }];
    const s = w.snapshot();
    w.brick = 4;
    w.lines[0].stops.push(7);
    w.lines.push({ id: 2, stops: [8, 9], color: 2 });
    w.restore(s);
    expect(w.brick).toBe(30);
    expect(w.lines).toEqual([{ id: 1, stops: [5, 6], color: 1, via: [[3]] }]);
  });
});

describe('les fondateurs', () => {
  it('sans maison, la place du village les loge : une équipe peut partir', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    w.place('gather', x, z, 0, true, 0, false);
    const ag = new Agents(w);
    for (let i = 0; i < 10; i++) ag.update(0.1, 10, 0, false, 4, 0);
    expect(ag.available()).toBe(2);
    expect(ag.recruit(2)).toHaveLength(2);
  });
});

describe('un habitant en chemin', () => {
  it('contourne un bâtiment posé sur son chemin au lieu d’« arriver » sur place', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    w.place('house', x, z, 0, true, 0, false);
    const ag = new Agents(w) as any;
    for (let i = 0; i < 10; i++) ag.update(0.1, 10, 0, false, 40, 0);
    const a = ag.agents[0];
    // il part de devant sa maison vers une case à 12 cases à l'est, sur un terrain plat
    a.x = x + 0.5; a.z = z + 1.5; a.hidden = false; a.state = 'doing';
    let goal = -1;
    for (let d = 10; d < 30 && goal < 0; d++) if (!w.occ[w.ci(x + d, z + 1)] && w.cellSlope(x + d, z + 1) < 0.3) goal = w.ci(x + d, z + 1);
    ag.pathBudget = 9;
    ag.startPath(a, goal, true);
    expect(a.state).toBe('walking');
    // un atelier tombe sur le milieu du chemin
    const mid = a.path[Math.floor(a.path.length / 2)], mx = mid % N, mz = Math.floor(mid / N);
    let placed = false;
    for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (!placed && w.canPlace('workshop', mx + ox, mz + oz) === null) { w.place('workshop', mx + ox, mz + oz, 0, true, 0, false); placed = true; }
    expect(placed).toBe(true);
    a.pi = Math.max(0, a.path.indexOf(mid) - 1);
    a.x = (a.path[a.pi] % N) + 0.5; a.z = Math.floor(a.path[a.pi] / N) + 0.5;
    const at = [a.x, a.z];
    ag.pathBudget = 9;
    ag.update(0.05, 10, 0, false, 40, 0);
    // toujours en route, par un chemin qui évite l'atelier, vers le même but
    expect(a.state).toBe('walking');
    expect(a.hidden).toBe(false);
    expect(a.path[a.path.length - 1]).toBe(goal);
    expect(a.path.some((k: number) => w.occ[k])).toBe(false);
    expect(Math.hypot(a.x - at[0], a.z - at[1])).toBeLessThan(0.5);
  });
});

describe('déplacer un bâtiment', () => {
  it('efface son ancien chemin d’accès, sans toucher aux routes du joueur', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    // une route du joueur, puis une maison à quelques cases : son chemin d'accès la rejoint
    for (let i = -6; i <= 6; i++) w.setRoad(x + i, z - 5, true);
    const mine = [...w.road.keys()].filter((k) => w.road[k]);
    const b = w.place('house', x, z, 0, true, 0, false);
    expect(autoRoad(w, b)).toBeGreaterThan(0);
    const before = [...w.road.keys()].filter((k) => w.road[k]).length;
    expect(before).toBeGreaterThan(mine.length);
    // on la ramasse : son chemin s'en va, la route du joueur reste
    w.removeBuilding(b.id);
    expect(unlayAccess(w, b.id)).toBe(before - mine.length);
    expect([...w.road.keys()].filter((k) => w.road[k])).toEqual(mine);
  });

  it('garde le chemin qui sert encore un voisin', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    for (let i = -6; i <= 6; i++) w.setRoad(x + i, z - 5, true);
    const b = w.place('house', x, z, 0, true, 0, false);
    autoRoad(w, b);
    const laid = [...w.road.keys()].filter((k) => w.road[k]);
    // un voisin dont la porte borde le chemin
    const k = laid.find((c) => { const cx = c % N, cz = Math.floor(c / N); return cz > z - 5 && w.canPlace('house', cx + 1, cz) === null; });
    expect(k).toBeDefined();
    w.place('house', (k! % N) + 1, Math.floor(k! / N), 3, false, 0, false);
    w.removeBuilding(b.id);
    unlayAccess(w, b.id);
    expect(w.road[k!]).toBe(1);
  });
});

/** Un monde plat de 96 cases, sans eau, avec ces bâtiments */
function flat(list: Omit<Building, 'id' | 'rot' | 'auto'>[], disasters = true) {
  setMapSize(96);
  const w = new World();
  w.heights.fill(1);
  w.disasters = disasters;
  const out = list.map((o) => { const b: Building = { id: w.nextId++, rot: 0, auto: true, ...o }; w.buildings.set(b.id, b); return b; });
  return { w, out };
}

describe('les incendies', () => {
  it('ne brûlent pas en pause : le feu suit le temps de jeu, comme les secours', () => {
    const { w, out: [b] } = flat([{ kind: 'house', x: 40, z: 40, age: 4 }]);
    const fires = new Fires(w);
    fires.ignite(b);
    for (let t = 0; t < 200; t++) fires.update(1, 0);
    expect(fires.burning.map((f) => f.id)).toEqual([b.id]);
    expect(w.buildings.has(b.id)).toBe(true);
    // le jeu reprend : sans eau ni caserne, il finit par brûler
    for (let t = 0; t < 80; t++) fires.update(1, 1);
    expect(w.buildings.has(b.id)).toBe(false);
  });

  it('une caserne éteint les maisons que la jauge dit couvertes (même mesure, de centre à centre)', () => {
    // à 10 cases en diagonale : 14,1 cases de coin à coin, 13,4 de centre à centre
    const { w, out: [, h] } = flat([{ kind: 'fire', x: 40, z: 40, age: 1 }, { kind: 'house', x: 50, z: 50, age: 1 }]);
    expect(computeCoverage(w.buildings.values()).fire).toBe(1);
    const fires = new Fires(w);
    fires.ignite(h);
    for (let t = 0; t < 80; t++) fires.update(1, 1);
    expect(fires.burning).toEqual([]);
    expect(w.buildings.has(h.id)).toBe(true);
  });
});

describe('après la chute du royaume', () => {
  it('le portail éteint ne mène plus aux Enfers, et le dit', () => {
    setMapSize(192);
    const w = new World();
    newWorld(w, 3, 2026, GEN);
    w.exp.done.push('portal');
    const t = isleOrigins(w, 'watchtower')[0];
    w.place('watchtower', t % N, Math.floor(t / N), 0, true, 1, false);
    const war = new War(w);
    const tick = (n: number) => { for (let i = 0; i < n * 10; i++) war.update(0.1, 1); };
    tick(0.5);
    war.faction!.damage(war.king!.citadel!, 1e7, -1);
    tick(0.3);
    expect(hellFallen(w)).toBe(true);
    expect(war.portalOut).toBe(true);
    expect(war.hellWhy()).toBe('Le portail est éteint : la guerre est finie.');
  });
});

describe('le bonus du fret', () => {
  it('la fiche du carburant annonce le pourcentage de la constante', () => {
    const ui = readFileSync('src/ui/ui.ts', 'utf-8');
    const pct = /la fait raffiner (\d+) % de plus/.exec(ui)?.[1];
    expect(Number(pct)).toBe(Math.round(FREIGHT_BONUS * 100));
    expect(readFileSync('src/sim/freight.ts', 'utf-8')).not.toMatch(/: 1,5 s'il/);
  });
});

describe('les tracteurs', () => {
  it('ne roulent pas sans carburant : même règle que les voitures', () => {
    const main = readFileSync('src/main.ts', 'utf-8');
    expect(main).toMatch(/this\.agents\.motor = this\.expeditions\.cars\(\)/);
  });
});

describe('un bâtiment qui change d’âge', () => {
  it('refait le compte des capacités sans attendre la pose suivante', () => {
    const { w, out: [, h] } = flat([{ kind: 'gather', x: 30, z: 30, age: 0 }, { kind: 'house', x: 40, z: 40, age: 0 }]);
    const sim = new Sim(w);
    sim.update(1, 1);
    const cap0 = sim.housing.cap;
    w.evolve(h, 3);
    sim.update(1, 1);
    expect(sim.housing.cap - cap0).toBe(KINDS.house.housing![3] - KINDS.house.housing![0]);
  });
});

describe('démolir des maisons', () => {
  it('les habitants sans logis partent, et on le dit', () => {
    const { w, out } = flat([{ kind: 'gather', x: 30, z: 30, age: 3 }, { kind: 'house', x: 40, z: 40, age: 3 }, { kind: 'house', x: 44, z: 40, age: 3 }]);
    const sim = new Sim(w);
    sim.update(1, 1);
    sim.pop = sim.housing.cap;
    sim.news.length = 0;
    w.removeBuilding(out[2].id);
    sim.update(0, 1);
    expect(sim.pop).toBe(sim.housing.cap);
    expect(sim.news).toHaveLength(1);
    expect(sim.news[0]).toMatch(/quitté le village/);
  });
});

describe('le conseil du moment', () => {
  it('n’a plus de branche morte (seconde condition « maison », île du portail)', () => {
    const src = readFileSync('src/sim/sim.ts', 'utf-8');
    expect(src.match(/if \(!this\.counts\.house\) return/g)).toHaveLength(1);
    expect(src).not.toMatch(/messageIsle/);
  });
});

describe('la neige par biome', () => {
  it('une seule table pour le sol et les plantes', () => {
    expect(readFileSync('src/render/vegetation.ts', 'utf-8')).toMatch(/const snowy = \(b: number\) => BIOME_SNOW\[b\]/);
    expect(readFileSync('src/render/terrainView.ts', 'utf-8')).toMatch(/export const SNOWY = BIOME_SNOW;/);
    expect(BIOME_SNOW).toHaveLength(5);
  });
});

describe('la hauteur des ponts', () => {
  it('le tablier du chemin de fer est à la hauteur de celui des routes', () => {
    const w = continent();
    let k = -1;
    for (let i = 0; i < N * N && k < 0; i++) if (w.isWet(i % N, Math.floor(i / N)) && !w.lake[i]) k = i;
    expect(w.deckY(k % N, Math.floor(k / N))).toBeCloseTo(SEA + DECK_CLEAR);
  });
});
