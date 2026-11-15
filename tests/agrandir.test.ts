import { describe, it, expect, afterAll } from 'vitest';
import { World, N, setMapSize, VEG_FOREST } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN, GEN_ARCH, GEN_FIXED, GEN_PLAN, GEN_VAR } from '../src/world/continent';
import { ARCH_N, MAIN_N, archLayout } from '../src/world/archipelago';
import { expandWorld, canExpand } from '../src/world/expand';

const SEED = 4242;

/** Une partie de 192 avec un petit village : place, maisons, une route droite, une route en courbe, un bosquet planté */
function village(gen = GEN) {
  setMapSize(MAIN_N);
  const w = new World();
  w.seed = SEED;
  newWorld(w, CONTINENT, SEED, gen);
  w.updateVis();
  const [sx, sz] = w.startSpot();
  w.place('gather', sx, sz, 0, true, 0, false);
  for (let i = 0; i < 3; i++) if (w.canPlace('house', sx + 5 + i, sz) === null) w.place('house', sx + 5 + i, sz, 0, true, 0, false);
  for (let i = -6; i < -1; i++) w.setRoad(sx + i, sz + 1, true);
  w.addCurve([sx - 2, sz + 6, sx + 2, sz + 8, sx + 6, sz + 6]);
  for (let i = 0; i < 3; i++) w.setVeg(sx - 4 - i, sz - 4, VEG_FOREST);
  return w;
}

describe('le monde s’agrandit : une partie de 192 passe sur l’archipel', () => {
  afterAll(() => setMapSize(192));

  it.each([['5', GEN], ['3', GEN_VAR], ['2', GEN_PLAN], ['1', GEN_FIXED]])('version %s : le village est intact, décalé dans le cadre de l’île principale, et les îles rivales l’entourent', (_, gen) => {
    const w = village(gen), old = JSON.parse(JSON.stringify(w.toJSON()));
    expect(canExpand(old)).toBe(true);
    const oldBiome = Array.from(w.biome), oldBuildings = [...w.buildings.values()].map((b) => [b.kind, b.x, b.z, b.rot] as const);
    const oldRoads = old.roads as number[], f = archLayout(SEED, ARCH_N).main;
    const d = expandWorld(old, CONTINENT, SEED);
    expect(N).toBe(ARCH_N);
    expect(d.n).toBe(ARCH_N);
    expect(d.gen).toBe(GEN_ARCH);
    const e = new World();
    e.seed = SEED;
    e.fromJSON(JSON.parse(JSON.stringify(d)));
    e.computeBiomes();
    // bâtiments : mêmes sortes, même orientation, décalés du coin du cadre
    const now = [...e.buildings.values()].map((b) => [b.kind, b.x - f.x, b.z - f.z, b.rot] as const);
    expect(now).toEqual(oldBuildings);
    // routes droites (et celles des courbes) : toutes là, décalées
    for (const k of oldRoads) expect(e.road[(Math.floor(k / MAIN_N) + f.z) * ARCH_N + (k % MAIN_N) + f.x]).toBe(1);
    expect(e.curves.length).toBe(1);
    // relief : le même dans le cadre, hors de sa bordure de mer ; seule la mer profonde descend au fond du large
    for (let z = 12; z <= MAIN_N - 12; z += 3)
      for (let x = 12; x <= MAIN_N - 12; x += 3) {
        const h0 = w.heights[z * (MAIN_N + 1) + x];
        if (h0 > -0.7) expect(e.heights[(z + f.z) * (ARCH_N + 1) + x + f.x]).toBeCloseTo(h0, 1);
      }
    // biomes : presque tous les mêmes (le relief sauvegardé est arrondi au centième)
    let same = 0;
    for (let z = 0; z < MAIN_N; z++) for (let x = 0; x < MAIN_N; x++) if (e.biome[(z + f.z) * ARCH_N + x + f.x] === oldBiome[z * MAIN_N + x]) same++;
    expect(same / (MAIN_N * MAIN_N)).toBeGreaterThan(0.99);
    // l'île du portail suit, les îles rivales sont là
    if (w.portal) expect([e.portal!.x - f.x, e.portal!.z - f.z]).toEqual([w.portal.x, w.portal.z]);
    else expect(e.portal).toBeNull();
    // l'île garde la version de son générateur
    expect(e.mainGen).toBe(gen);
    expect(e.isles!.rivals.length).toBe(2);
    for (const q of e.isles!.rivals) expect(e.isWaterCell(Math.round(q.village.x), Math.round(q.village.z))).toBe(false);
    // on continue de bâtir chez soi, pas chez les voisins (sans allié choisi : aucune île rivale)
    const g = [...e.buildings.values()].find((b) => b.kind === 'gather')!;
    expect(e.startSpot()).toBeDefined();
    expect(e.canPlace('house', Math.round(e.isles!.rivals[0].village.x), Math.round(e.isles!.rivals[0].village.z))).toMatch(/Choisissez d’abord votre allié/);
    expect(e.inMain(g.x, g.z)).toBe(true);
  }, 60000);

  it('une partie déjà agrandie ne s’agrandit pas ; les anciennes (versions 1 et 2, ou sans version) le peuvent', () => {
    expect(canExpand({ n: ARCH_N, gen: GEN_ARCH })).toBe(false);
    expect(canExpand({ n: MAIN_N, gen: 2 })).toBe(true);
    expect(canExpand({ n: MAIN_N })).toBe(true);
  });
});
