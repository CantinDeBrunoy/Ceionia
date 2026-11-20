import { describe, it, expect, afterAll } from 'vitest';
import { World, N, setMapSize } from '../src/world/world';
import { newWorld, CONTINENT } from '../src/world/mapgen';
import { GEN } from '../src/world/continent';
import { ARCH_N, MAIN_N, archLayout } from '../src/world/archipelago';
import { expandWorld, repairCoast, OPEN_SEA } from '../src/world/expand';
import { GEN_ARCH } from '../src/world/continent';
import { smoothstep, lerp } from '../src/core/rng';

const SEED = 4242;

/**
 * Bug de l'auteur (version en ligne, 21 nov. 2026) : après « Explorer le monde », une presqu'île bâtie au bord de la carte
 * était « en bazar » (palissades et pontons dans la mer, pilotis seuls, un bâtiment au bord d'une falaise). Le relief des
 * 12 dernières cases de l'ancienne carte était fondu vers celui d'une partie neuve de l'archipel, en supposant qu'elles
 * étaient déjà en mer
 */
describe('le monde s’agrandit : la côte du joueur reste telle quelle', () => {
  afterAll(() => setMapSize(192));

  it('une langue de terre bâtie jusqu’au bord de l’ancienne carte : relief, eau et occupation identiques après l’agrandissement', () => {
    setMapSize(MAIN_N);
    const w = new World();
    w.seed = SEED;
    newWorld(w, CONTINENT, SEED, GEN);
    // une langue de terre qui s'avance jusqu'à 3 cases du bord ouest, de part et d'autre la mer peu profonde
    const S0 = MAIN_N + 1, z0 = 90;
    for (let z = z0 - 8; z <= z0 + 8; z++)
      for (let x = 0; x <= 30; x++) w.heights[z * S0 + x] = Math.abs(z - z0) <= 4 && x >= 3 ? 0.6 : -0.4;
    // un bassin creusé au milieu de l'île, sous -1 (l'ancien agrandissement le ramenait vers le relief de la carte neuve)
    const [sx, sz] = w.startSpot(), bx = sx + 12, bz = sz + 12;
    for (let z = bz; z <= bz + 7; z++) for (let x = bx; x <= bx + 7; x++) w.heights[z * S0 + x] = -1.3;
    w.updateVis();
    // des biomes peints, des pavés, du fer céleste
    for (let x = 4; x < 12; x++) w.paintBiome(x, z0, 0);
    w.paving[w.ci(sx + 2, sz + 4)] = 1;
    w.starIron.push(w.ci(sx + 3, sz + 5));
    // des remparts le long de la langue, des maisons, un ponton au bout
    for (let x = 4; x < 28; x++) if (w.canPlace('wall', x, z0 - 3) === null) w.place('wall', x, z0 - 3, 0, true, 1, false);
    for (const x of [8, 14, 20]) if (w.canPlace('house', x, z0) === null) w.place('house', x, z0, 0, true, 1, false);
    const placed = w.buildings.size;
    expect(placed).toBeGreaterThan(10);
    const old = JSON.parse(JSON.stringify(w.toJSON()));
    // (la partie telle que le joueur la retrouve au chargement : le relief sauvegardé est arrondi au centième)
    const r = new World();
    r.seed = SEED;
    r.fromJSON(JSON.parse(JSON.stringify(old)));
    r.updateVis();
    const oldH = Float32Array.from(r.heights), oldOcc = Int32Array.from(r.occ as ArrayLike<number>);
    const oldWater: boolean[] = [];
    for (let z = 0; z < MAIN_N; z++) for (let x = 0; x < MAIN_N; x++) oldWater.push(r.isWaterCell(x, z));

    const f = archLayout(SEED, ARCH_N).main;
    const d = expandWorld(old, CONTINENT, SEED);
    expect(N).toBe(ARCH_N);
    const e = new World();
    e.seed = SEED;
    e.fromJSON(JSON.parse(JSON.stringify(d)));
    e.updateVis();
    const S = ARCH_N + 1;
    // le relief de toute la terre et des hauts-fonds de l'île, jusqu'au bord de son cadre : identique (au centième)
    let land = 0;
    for (let z = 0; z <= MAIN_N; z++)
      for (let x = 0; x <= MAIN_N; x++) {
        const h0 = oldH[z * S0 + x];
        if (h0 <= -0.5) continue;
        land++;
        expect(e.heights[(z + f.z) * S + x + f.x]).toBeCloseTo(h0, 1);
      }
    expect(land).toBeGreaterThan(1000);
    // la mer ne monte nulle part dans le cadre (pas de terre nouvelle contre la côte du joueur)
    for (let z = 0; z <= MAIN_N; z++)
      for (let x = 0; x <= MAIN_N; x++) expect(e.heights[(z + f.z) * S + x + f.x]).toBeLessThanOrEqual(Math.max(oldH[z * S0 + x], -0.5) + 0.01);
    // l'eau et la terre ferme case par case, l'occupation (bâtiments et remparts) décalée d'autant
    const diff: string[] = [];
    for (let z = 0; z < MAIN_N; z++)
      for (let x = 0; x < MAIN_N; x++) {
        const k = (z + f.z) * ARCH_N + x + f.x;
        if (e.isWaterCell(x + f.x, z + f.z) !== oldWater[z * MAIN_N + x]) diff.push(`eau ${x},${z}`);
        if (!!e.occ[k] !== !!oldOcc[z * MAIN_N + x]) diff.push(`occ ${x},${z}`);
      }
    expect(diff).toEqual([]);
    expect(e.buildings.size).toBe(placed);
    // le bassin creusé reste de l'eau profonde ; biomes peints, pavés et fer céleste décalés d'autant
    expect(e.heights[(bz + 3 + f.z) * S + bx + 3 + f.x]).toBeCloseTo(-1.3, 1);
    for (let x = 4; x < 12; x++) expect(e.biomePaint[(z0 + f.z) * ARCH_N + x + f.x]).toBe(r.biomePaint[z0 * MAIN_N + x]);
    expect(e.paving[(sz + 4 + f.z) * ARCH_N + sx + 2 + f.x]).toBe(1);
    expect(e.starIron).toEqual([(sz + 5 + f.z) * ARCH_N + sx + 3 + f.x]);
  }, 60000);

  it('une partie abîmée par l’ancien agrandissement se répare au chargement : la terre de la côte retrouve son relief', () => {
    setMapSize(MAIN_N);
    const w = new World();
    w.seed = SEED;
    newWorld(w, CONTINENT, SEED, GEN);
    const S0 = MAIN_N + 1, z0 = 90;
    for (let z = z0 - 8; z <= z0 + 8; z++) for (let x = 0; x <= 30; x++) w.heights[z * S0 + x] = Math.abs(z - z0) <= 4 && x >= 3 ? 0.6 : -0.4;
    const [sx, sz] = w.startSpot(), bx = sx + 12, bz = sz + 12;
    for (let z = bz; z <= bz + 7; z++) for (let x = bx; x <= bx + 7; x++) w.heights[z * S0 + x] = -1.3;
    w.updateVis();
    const old = JSON.parse(JSON.stringify(w.toJSON()));
    const f = archLayout(SEED, ARCH_N).main, S = ARCH_N + 1;
    const d = expandWorld(old, CONTINENT, SEED);
    // l'ancien agrandissement : le relief des 12 cases du bord fondu vers celui d'une partie neuve de l'archipel
    const fresh = new World();
    fresh.seed = SEED;
    newWorld(fresh, CONTINENT, SEED, GEN_ARCH);
    const neu = fresh.toJSON().heights as number[];
    for (let z = 0; z <= MAIN_N; z++)
      for (let x = 0; x <= MAIN_N; x++) {
        const i = (z + f.z) * S + x + f.x, hm = old.heights[z * S0 + x] / 100, deep = neu[i] / 100;
        const hs = hm > -0.98 ? hm : lerp(hm, deep, smoothstep(-0.98, -1.1, hm));
        d.heights[i] = Math.round(lerp(deep, hs, smoothstep(0, 12, Math.min(x, z, MAIN_N - x, MAIN_N - z))) * 100);
      }
    delete d.coast;
    d.exploredAt = 1;
    // abîmée : la langue de terre s'est enfoncée ou a bougé près du bord
    let broken = 0;
    for (let x = 3; x <= 12; x++) if (Math.abs(d.heights[(z0 + f.z) * S + x + f.x] / 100 - 0.6) > 0.05) broken++;
    expect(broken).toBeGreaterThan(5);
    const r = repairCoast(JSON.parse(JSON.stringify(d)), CONTINENT, SEED);
    expect(r.coast).toBe(1);
    // réparée : la terre et la côte reviennent (hors des deux sommets du bord même, refaits d'après le continent d'origine)
    for (let z = 0; z <= MAIN_N; z++)
      for (let x = 0; x <= MAIN_N; x++) {
        if (Math.min(x, z, MAIN_N - x, MAIN_N - z) < 2) continue;
        const h0 = old.heights[z * S0 + x] / 100;
        if (h0 <= OPEN_SEA) continue;
        expect(Math.abs(r.heights[(z + f.z) * S + x + f.x] / 100 - h0)).toBeLessThan(0.08);
      }
    // le bassin creusé, comblé vers la carte neuve par l'ancien agrandissement, redevient une eau profonde (sa profondeur
    // exacte est perdue)
    for (let z = bz + 1; z <= bz + 6; z++) for (let x = bx + 1; x <= bx + 6; x++) expect(r.heights[(z + f.z) * S + x + f.x] / 100).toBeLessThan(-0.98);
    // une partie déjà sûre, ou jamais agrandie, ne bouge pas
    expect(repairCoast(r, CONTINENT, SEED)).toBe(r);
    expect(repairCoast({ ...d, exploredAt: null }, CONTINENT, SEED).heights).toBe(d.heights);
  }, 90000);
});
