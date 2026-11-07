import { describe, it, expect, beforeAll } from 'vitest';
import { World, N, MAX_H, MIN_H, MOUNTAIN_H, SNOW_LINE, BIOME_DESERT, setMapSize, VEG_FIELD, VEG_GARDEN, VEG_VOLCANO, VEG_FOREST, VR, VS } from '../src/world/world';
import { findGardens, layoutGarden } from '../src/world/gardens';
import { genHeights, newWorld, addDefaultDecor, MAPS } from '../src/world/mapgen';
import { GEN, GEN_FIXED, GEN_PLAN, Zone, continentPlan, riverU, toPlan, fromPlan } from '../src/world/continent';
import { Sim } from '../src/sim/sim';
import { autoRoad } from '../src/build/autoroads';
import { facingRoadRot } from '../src/build/placement';
import { MISSIONS, mandatoryFor, mandatoriesFor, applyEffects, needBonus, penHerds, PEN_CAP, STABLE_CAP, redoEffects, REDO_DAYS, choiceAt } from '../src/sim/missions';
import { KINDS, KindId, UPGRADES, Building } from '../src/build/catalog';
import { Underground } from '../src/world/underground';
import { sculpt, brushOnBuilding } from '../src/world/terraform';
import { GameTime } from '../src/core/time';
import { Expeditions, Report, partyLimit } from '../src/sim/expeditions';
import { Agents } from '../src/sim/agents';
import { Railway } from '../src/sim/railway';
import { EVENTS } from '../src/sim/events';

/** Le continent, toujours la même graine : les tests ne dépendent pas du hasard */
function continent() {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, 2026);
  w.updateVis();
  return w;
}

/**
 * Première case de terre plate des basses terres (au moins `h` de haut, sous la montagne), entourée de cases où bâtir aussi,
 * pour y poser un bâtiment : le continent change de forme d'une version du générateur à l'autre
 */
function flatLand(w: World, h = 0.6) {
  const ok = (x: number, z: number) => w.cellSlope(x, z) < 0.2 && !w.veg[w.ci(x, z)] && !w.decor[w.ci(x, z)] && w.canPlace('house', x, z) === null;
  for (let z = 10; z < N - 10; z++)
    for (let x = 10; x < N - 10; x++)
      if (w.cellAvg(x, z) > h && w.cellAvg(x, z) < MOUNTAIN_H - 0.4 && ok(x, z) && [-1, 0, 1].every((dz) => [-1, 0, 1].every((dx) => ok(x + dx, z + dz)))) return [x, z];
  throw new Error('pas de terrain plat');
}

describe('génération des cartes', () => {
  it('une même graine donne toujours le même relief', () => {
    for (const m of MAPS) {
      setMapSize(m.size);
      const a = genHeights(m.id, 42), b = genHeights(m.id, 42);
      expect(a).toEqual(b);
      expect(genHeights(m.id, 43)).not.toEqual(a);
    }
  });

  it('le relief reste dans ses bornes et les montagnes sont hautes', () => {
    for (const m of MAPS) {
      setMapSize(m.size);
      const h = genHeights(m.id, m.defaultSeed);
      let lo = Infinity, hi = -Infinity;
      for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      // hauteurs stockées en flottants 32 bits
      expect(lo).toBeGreaterThanOrEqual(Math.fround(MIN_H));
      expect(hi).toBeLessThanOrEqual(MAX_H);
      expect(hi).toBeGreaterThan(8);
    }
  });
});

/** Continent d'une graine (par défaut, la version du générateur des nouvelles parties), relief affiché calculé */
function continentOf(seed: number, gen = GEN) {
  setMapSize(192);
  const w = new World();
  newWorld(w, 3, seed, gen);
  w.updateVis();
  return w;
}

/** Empreinte du relief de la graine 2026 en version 2, relevée avant l'arrivée de la version 3 */
const PLAN2_SIG = 2006609.137;

/** Case du plan d'une case du monde, selon l'orientation du continent de cette graine */
function planCell(seed: number) {
  const o = continentPlan(seed).orient;
  return (x: number, z: number) => toPlan(o, x + 0.5, z + 0.5, N).map(Math.floor) as [number, number];
}
/** Case du monde d'une case du plan */
function worldCell(seed: number) {
  const o = continentPlan(seed).orient;
  return (x: number, z: number) => fromPlan(o, x + 0.5, z + 0.5, N).map(Math.floor) as [number, number];
}

/** Étendues d'eau et de terre (cases voisines par un côté) : numéro de l'étendue de chaque case, taille, eau ou terre, au bord de la carte */
function regions(w: World) {
  const id = new Int32Array(N * N).fill(-1), size: number[] = [], water: boolean[] = [], edge: boolean[] = [];
  const wet = (k: number) => w.isWaterCell(k % N, Math.floor(k / N));
  for (let k0 = 0; k0 < N * N; k0++) {
    if (id[k0] >= 0) continue;
    const r = size.length, wt = wet(k0), q = [k0];
    id[k0] = r; size.push(0); water.push(wt); edge.push(false);
    while (q.length) {
      const k = q.pop()!, x = k % N, z = Math.floor(k / N);
      size[r]++;
      if (x === 0 || z === 0 || x === N - 1 || z === N - 1) edge[r] = true;
      for (const j of [x > 0 ? k - 1 : -1, x < N - 1 ? k + 1 : -1, z > 0 ? k - N : -1, z < N - 1 ? k + N : -1])
        if (j >= 0 && id[j] < 0 && wet(j) === wt) { id[j] = r; q.push(j); }
    }
  }
  let main = -1;
  for (let i = 0; i < size.length; i++) if (!water[i] && (main < 0 || size[i] > size[main])) main = i;
  return { id, size, water, edge, main };
}

/** Part des cases identiques entre deux grilles */
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) n++; return n / a.length; };
/** Empreinte d'une grille (somme pondérée par la position) */
const signature = (h: ArrayLike<number>) => { let s = 0; for (let i = 0; i < h.length; i++) s += h[i] * ((i % 101) + 1); return s; };

describe('continent tiré de la graine', () => {
  const SEEDS = [2026, 7, 4242, 31337];
  const cache = new Map<number, World>();
  const shown = (seed: number) => cache.get(seed) ?? cache.set(seed, continentOf(seed)).get(seed)!;

  it('une même graine donne toujours le même continent : plan, relief, végétation et biomes', () => {
    expect(continentPlan(4242)).toEqual(continentPlan(4242));
    const a = continentOf(4242), b = continentOf(4242);
    expect(a.heights).toEqual(b.heights);
    expect(a.veg).toEqual(b.veg);
    expect(a.biome).toEqual(b.biome);
  });

  it('chaque graine a son continent : contrées déplacées et retaillées, côtes différentes', () => {
    const plans = SEEDS.map(continentPlan), hs = SEEDS.map((s) => genHeights(3, s));
    // chaque contrée change de place, de taille ou de forme, et la plupart sont à plusieurs cases de là
    const shift = (a: Zone, b: Zone) => Math.hypot(a.u - b.u, a.v - b.v) * 192;
    const changed = (a: Zone, b: Zone) => shift(a, b) > 2 || Math.abs(a.r - b.r) * 192 > 1 || Math.abs(a.e - b.e) > 0.1;
    const ZONES = ['mountains', 'plateaus', 'lake', 'volcano', 'mesas', 'archipelago'] as const;
    for (let i = 0; i < SEEDS.length; i++)
      for (let j = i + 1; j < SEEDS.length; j++) {
        for (const k of ZONES) expect(changed(plans[i][k], plans[j][k])).toBe(true);
        expect(ZONES.filter((k) => shift(plans[i][k], plans[j][k]) > 3).length).toBeGreaterThanOrEqual(4);
        expect(Math.abs(plans[i].river.mouth - plans[j].river.mouth) * 192).toBeGreaterThan(1);
        // plus d'un dixième des sommets du relief passent de la terre à la mer, ou l'inverse
        let diff = 0;
        for (let k = 0; k < hs[i].length; k++) if ((hs[i][k] > 0.08) !== (hs[j][k] > 0.08)) diff++;
        expect(diff / hs[i].length).toBeGreaterThan(0.1);
      }
    // le massif n'a pas toujours le même nombre de grands sommets ni la même orientation
    const many = Array.from({ length: 20 }, (_, i) => continentPlan(i + 1));
    expect(new Set(many.map((p) => p.mountains.peaks.length)).size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...many.map((p) => p.mountains.a)) - Math.min(...many.map((p) => p.mountains.a))).toBeGreaterThan(0.6);
  });

  it('chaque continent garde ses contrées : montagnes enneigées, plateaux, lac et îlot, île volcanique, mesas, archipel, cinq biomes', () => {
    for (const seed of SEEDS) {
      const w = shown(seed), g = regions(w), biomes = [0, 0, 0, 0, 0], isles = new Set<number>(), pc = planCell(seed);
      let snow = 0, terraces = 0, desert = 0, tables = 0, volcano = -1;
      for (let wz = 0; wz < N; wz++)
        for (let wx = 0; wx < N; wx++) {
          // les contrées se cherchent dans le repère du plan (le continent peut être tourné ou retourné)
          const k = wz * N + wx, a = w.cellAvg(wx, wz), [x, z] = pc(wx, wz), north = z < 0.45 * N;
          if (w.veg[k] === VEG_VOLCANO) volcano = k;
          if (a < 0.08) continue;
          biomes[w.biome[k]]++;
          if (north && a > SNOW_LINE[0]) snow++;
          // replats des gradins, au nord-ouest
          if (north && x < 0.42 * N && a > 1.2 && a < 6 && w.cellSlope(wx, wz) < 0.25) terraces++;
          // désert de l'est et tables de ses mesas
          if (x > 0.6 * N && z > 0.3 * N && z < 0.75 * N && w.biome[k] === BIOME_DESERT) { desert++; if (a > 2.2) tables++; }
          // îles de l'archipel, au sud-est
          if (x > 0.62 * N && z > 0.7 * N && g.id[k] !== g.main && g.size[g.id[k]] > 4) isles.add(g.id[k]);
        }
      expect(snow).toBeGreaterThan(250);
      expect(terraces).toBeGreaterThan(800);
      expect(desert).toBeGreaterThan(1500);
      expect(tables).toBeGreaterThan(150);
      expect(isles.size).toBeGreaterThanOrEqual(3);
      // le volcan, au sud-ouest du plan, sur son île
      const [vx, vz] = pc(volcano % N, Math.floor(volcano / N));
      expect(vx).toBeLessThan(0.4 * N);
      expect(vz).toBeGreaterThan(0.65 * N);
      expect(g.id[volcano]).not.toBe(g.main);
      // le grand lac, fermé, et son îlot
      const lakes = new Set(g.size.map((s, i) => (g.water[i] && !g.edge[i] && s > 400 ? i : -1)).filter((i) => i >= 0));
      expect(lakes.size).toBeGreaterThanOrEqual(1);
      let islet = 0;
      for (let k = 0; k < N * N; k++) {
        const r = g.id[k], x = k % N, z = Math.floor(k / N);
        if (g.water[r] || r === g.main || g.edge[r]) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.inCells(x + dx, z + dz) && lakes.has(g.id[(z + dz) * N + x + dx]))) islet = Math.max(islet, g.size[r]);
      }
      expect(islet).toBeGreaterThanOrEqual(15);
      // les cinq biomes, chacun sur au moins 1 % des terres
      const land = biomes.reduce((a, b) => a + b);
      for (const b of biomes) expect(b / land).toBeGreaterThan(0.01);
    }
  });

  it('la rivière descend des montagnes jusqu’à la mer, et l’on trouve où bâtir au bord de l’eau', () => {
    for (const seed of SEEDS) {
      const w = shown(seed), g = regions(w), r = continentPlan(seed).river, wc = worldCell(seed);
      /** case du monde de la case (x, z) du plan */
      const at = (x: number, z: number) => { const [a, b] = wc(x, z); return b * N + a; };
      // du massif à la côte, son lit est de l'eau qui rejoint la mer
      for (let z = Math.ceil((r.v + 0.1) * N); z < N - 4; z++) {
        const x = Math.round(riverU(r, z / N) * N), bed = [0, -1, 1, -2, 2].map((d) => at(x + d, z)).find((k) => g.water[g.id[k]]);
        expect(bed).toBeDefined();
        expect(g.edge[g.id[bed!]]).toBe(true);
      }
      // le fond de la vallée descend vers l'aval : ses berges s'abaissent d'un tronçon à l'autre
      const v0 = r.v + 0.06, len = (0.86 - v0) / 4;
      const banks = [0, 1, 2, 3].map((i) => {
        let s = 0, c = 0;
        for (let z = Math.floor((v0 + i * len) * N); z < Math.floor((v0 + (i + 1) * len) * N); z++) {
          const rx = Math.round(riverU(r, z / N) * N);
          for (let x = rx - 7; x <= rx + 7; x++) {
            if (x < 0 || x >= N) continue;
            const k = at(x, z), kx = k % N, kz = Math.floor(k / N);
            if (!w.isWaterCell(kx, kz)) { s += w.cellAvg(kx, kz); c++; }
          }
        }
        return s / c;
      });
      for (let i = 1; i < 4; i++) expect(banks[i]).toBeLessThan(banks[i - 1]);
      // assez de terrain plat au bord de l'eau pour fonder un village : un carré de 12 × 12 cases presque tout plat
      let best = 0;
      for (let z0 = 2; z0 < N - 14; z0 += 2)
        for (let x0 = 2; x0 < N - 14; x0 += 2) {
          let flat = 0, shore = false;
          for (let z = z0; z < z0 + 12; z++)
            for (let x = x0; x < x0 + 12; x++) {
              const a = w.cellAvg(x, z);
              if (a > 0.25 && a < 3.5 && w.cellSlope(x, z) < 0.3 && !w.decor[z * N + x]) flat++;
              if (w.waterDist[z * N + x] <= 1) shore = true;
            }
          if (shore) best = Math.max(best, flat);
        }
      expect(best).toBeGreaterThanOrEqual(130);
    }
  });

  it('une partie d’avant le plan du continent garde son climat : mêmes biomes, même souterrain', () => {
    const w = continentOf(2026, GEN_FIXED), u = new Underground(w);
    u.sync();
    const d = JSON.parse(JSON.stringify(w.toJSON()));
    delete d.gen;
    const load = (gen?: number) => {
      const w2 = new World();
      w2.mapId = 3; w2.seed = 2026;
      w2.fromJSON(gen === undefined ? d : { ...d, gen });
      w2.updateVis();
      const u2 = new Underground(w2);
      u2.sync();
      return { w2, u2 };
    };
    const old = load();
    expect(old.w2.gen).toBe(GEN_FIXED);
    // seuls les arrondis des hauteurs sauvegardées changent le biome de quelques cases
    expect(same(w.biome, old.w2.biome)).toBeGreaterThan(0.999);
    expect(same(u.zone, old.u2.zone)).toBeGreaterThan(0.999);
    expect(old.u2.open).toEqual(u.open);
    // avec le climat du plan, ce ne serait plus le même monde
    expect(same(w.biome, load(GEN_PLAN).w2.biome)).toBeLessThan(0.95);
  });

  it('le générateur d’avant le plan ne change pas', () => {
    setMapSize(192);
    // empreintes du relief, des biomes et de la végétation de la graine 2026, relevées avant l'arrivée du plan
    expect(signature(genHeights(3, 2026, GEN_FIXED))).toBeCloseTo(1916112.2364, 3);
    const w = continentOf(2026, GEN_FIXED), counts = [0, 0, 0, 0, 0];
    for (const b of w.biome) counts[b]++;
    expect(counts).toEqual([12140, 9652, 5221, 7694, 2157]);
    expect(signature(w.veg)).toBe(357195);
  });

  it('une nouvelle partie sauvegarde la version de son générateur et la retrouve', () => {
    const w = shown(4242), d = JSON.parse(JSON.stringify(w.toJSON()));
    expect(d.gen).toBe(GEN);
    const w2 = new World();
    w2.mapId = 3; w2.seed = 4242;
    w2.fromJSON(d);
    w2.updateVis();
    expect(w2.gen).toBe(GEN);
    expect(same(w.biome, w2.biome)).toBeGreaterThan(0.999);
  });

  it('d’une partie à l’autre, le continent se tourne ou se retourne, ses forêts changent, et la place du village reste libre', () => {
    // huit orientations, presque toutes tirées sur vingt-quatre parties
    const orients = new Set(Array.from({ length: 24 }, (_, i) => continentPlan(i + 1).orient));
    expect(orients.size).toBeGreaterThanOrEqual(6);
    for (let o = 0; o < 8; o++) expect(fromPlan(o, ...toPlan(o, 17, 120, 192), 192)).toEqual([17, 120]);
    const forest: number[] = [];
    for (const seed of SEEDS) {
      const w = shown(seed), [sx, sz] = w.startSpot();
      // la place du village, 3 × 3, près du milieu de la carte, sans arbres ni rochers à abattre
      expect(Math.hypot(sx + 1.5 - N / 2, sz + 1.5 - N / 2)).toBeLessThan(20);
      expect(w.canPlace('gather', sx, sz)).toBeNull();
      for (let z = sz; z < sz + 3; z++) for (let x = sx; x < sx + 3; x++) expect(w.veg[w.ci(x, z)]).toBe(0);
      let f = 0, land = 0;
      for (let k = 0; k < N * N; k++) if (w.cellAvg(k % N, Math.floor(k / N)) > 0.45) { land++; if (w.veg[k] === VEG_FOREST) f++; }
      forest.push(f / land);
    }
    // chaque partie a ses forêts, plus ou moins étendues
    expect(Math.max(...forest) - Math.min(...forest)).toBeGreaterThan(0.03);
  });

  it('le générateur de la version 2 ne change pas', () => {
    setMapSize(192);
    expect(signature(genHeights(3, 2026, GEN_PLAN))).toBeCloseTo(PLAN2_SIG, 2);
  });
});

describe('sauvegarde', () => {
  let w: World;
  beforeAll(() => { w = continent(); });

  it('relit exactement ce qu’elle a écrit (relief, végétation, bâtiments, lave, cendres, minerai)', () => {
    const [x, z] = flatLand(w);
    w.place('house', x, z, 0, true, 1, false);
    w.basalt[w.ci(5, 5)] = 0.42;
    w.ash[w.ci(6, 6)] = 1;
    w.ore = 17;
    const data = JSON.parse(JSON.stringify(w.toJSON()));
    const r = new World();
    r.fromJSON(data);
    for (let i = 0; i < w.heights.length; i++) expect(r.heights[i]).toBeCloseTo(w.heights[i], 1);
    expect(Array.from(r.veg)).toEqual(Array.from(w.veg));
    expect([...r.buildings.values()].map((b) => [b.kind, b.x, b.z, b.age])).toEqual([...w.buildings.values()].map((b) => [b.kind, b.x, b.z, b.age]));
    expect(r.basalt[r.ci(5, 5)]).toBeCloseTo(0.42, 2);
    expect(r.ash[r.ci(6, 6)]).toBe(1);
    expect(r.ore).toBe(17);
  });

  it('un biome peint au pinceau tient malgré le climat et le relief, se sauvegarde et s’annule', () => {
    const w = continent();
    let k = -1;
    for (let i = 0; i < N * N && k < 0; i++) if (w.cellAvg(i % N, Math.floor(i / N)) > 0.5 && w.biome[i] !== BIOME_DESERT) k = i;
    const cx = k % N, cz = Math.floor(k / N), before = w.biome[k], snap = w.snapshot();
    expect(w.paintBiome(cx, cz, BIOME_DESERT)).toBe(true);
    expect(w.paintBiome(cx, cz, BIOME_DESERT)).toBe(false);
    w.biomesChanged(cx, cz, cx, cz);
    expect(w.biome[k]).toBe(BIOME_DESERT);
    // le relief se recalcule (sculpture ailleurs) : le biome peint reste
    w.updateVis();
    expect(w.biome[k]).toBe(BIOME_DESERT);
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    r.updateVis();
    expect(r.biome[k]).toBe(BIOME_DESERT);
    // l'annulation rend la case à son climat
    w.restore(snap);
    w.computeBiomes();
    expect(w.biome[k]).toBe(before);
  });

  it('une ancienne sauvegarde du monde souterrain (camp, galeries, tunnels, avant-poste, troupes) se charge et reste jouable', () => {
    const v = continent(), [x, z] = flatLand(v);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (v.canPlace('house', x + dx, z + dz) === null) v.place('house', x + dx, z + dz, 0, true, 2, false);
    const data = JSON.parse(JSON.stringify(v.toJSON()));
    const houses = data.buildings.length;
    // ce qu'en gardait une partie d'avant : galeries tenues, filons abattus, tunnels et file des mineurs, niveau du camp,
    // missions et plan des galeries, un avant-poste (et sa ligne de chemin de fer), une troupe en route
    Object.assign(data, { mined: [10, 11], claimed: [12, 13, 14], dug: [15], digs: [16, 17] });
    data.exp = { ...data.exp, camp: 6, wins: 4, done: ['herd', 'scout', 'deep'], perks: ['map', 'seeds'], active: [{ m: 'deep', entry: 12 }] };
    data.buildings.push(['outpost', x + 6, z, 0, 1, 2]);
    data.lines = [{ c: 0x3c7fd8, s: [0, houses] }];
    data.linesAuto = false;
    const r = new World();
    expect(() => r.fromJSON(data)).not.toThrow();
    expect([...r.buildings.values()].map((b) => b.kind)).not.toContain('outpost');
    expect(r.buildings.size).toBe(houses);
    expect([r.mined.size, r.claimed.size, r.dug.size, r.digs.length]).toEqual([0, 0, 0, 0]);
    expect(r.exp.done).toEqual(['herd']);
    expect(r.exp.perks).toEqual(['seeds']);
    expect('camp' in r.exp).toBe(false);
    expect(r.exp.wins).toBe(4);
    // la ligne qui menait à l'avant-poste n'a plus qu'un arrêt : elle s'oublie
    expect(r.lines).toEqual([]);
    // la partie tourne : expéditions, chemin de fer, besoins et conseil de l'âge suivant
    const agents = new Agents(r), ex = new Expeditions(r, agents, () => 100, () => 0.5), rail = new Railway(r, agents, ex, () => 100), sim = new Sim(r);
    sim.age = 2;
    for (let i = 0; i < 40; i++) { agents.update(0.5, 10, 2, false, 20, 0); ex.update(0.5); rail.update(0.5); sim.update(0.5, 0.5); }
    expect(ex.start(MISSIONS.find((m) => m.id === 'herd')!, 0)).not.toBeNull();
    expect(sim.ageProgress()).not.toBeNull();
    expect(sim.message.length).toBeGreaterThan(0);
    // et elle se sauvegarde sans ses anciens champs
    const out = JSON.parse(JSON.stringify(r.toJSON()));
    for (const k of ['mined', 'claimed', 'dug', 'digs']) expect(k in out).toBe(false);
    expect('camp' in out.exp).toBe(false);
  });

  it('refuse une sauvegarde d’une autre taille de carte', () => {
    const data = w.toJSON();
    expect(() => new World().fromJSON({ ...data, n: 48 })).toThrow();
  });

  it('lit une ancienne sauvegarde sans lave, cendres ni minerai', () => {
    const { basalt, ash, ore, ...old } = w.toJSON();
    void basalt; void ash; void ore;
    const r = new World();
    r.fromJSON(old);
    expect(r.ore).toBe(0);
    expect(r.ash.every((v) => v === 0)).toBe(true);
  });
});

describe('eau', () => {
  let w: World;
  beforeAll(() => { w = continent(); });

  const findCell = (test: (x: number, z: number) => boolean) => {
    for (let z = 2; z < N - 2; z++) for (let x = 2; x < N - 2; x++) if (test(x, z)) return [x, z];
    throw new Error('case introuvable');
  };

  it('une route franchit l’eau peu profonde sur un pont, pas le large', () => {
    const [sx, sz] = findCell((x, z) => w.cellAvg(x, z) < -0.3 && w.cellAvg(x, z) > -1.2);
    expect(w.canRoad(sx, sz)).toBe(true);
    expect(w.setRoad(sx, sz, true)).toBe(true);
    expect(w.bridgeY(sx, sz)).toBeGreaterThan(0.2);
    expect(w.surfaceAt(sx + 0.5, sz + 0.5)).toBeGreaterThan(0.2);
    // le large : la mer du continent reste peu profonde, on y creuse une fosse
    const [dx, dz] = findCell((x, z) => w.cellAvg(x, z) < -0.95 && !w.lake[w.ci(x, z)]);
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) w.heights[(dz + j) * (N + 1) + dx + i] = -2.2;
    expect(w.canRoad(dx, dz)).toBe(false);
  });

  it('le ponton de pêche se pose au bord de l’eau, pas dans les terres', () => {
    const [ix, iz] = flatLand(w, 1.5);
    expect(w.canPlace('pier', ix, iz)).not.toBeNull();
    // (pas sur l'île du portail, où l'on ne bâtit que des défenses)
    const shore = findCell((x, z) => w.cellAvg(x, z) > 0.1 && w.cellSlope(x, z) < 0.5 && !w.occ[w.ci(x, z)] && !w.road[w.ci(x, z)] && !w.decor[w.ci(x, z)] && !w.onPortalIsland(x, z)
      && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => w.cellAvg(x + a, z + b) < -0.3));
    expect(w.canPlace('pier', shore[0], shore[1])).toBeNull();
  });

  it('on ne bâtit pas sur un lac', () => {
    const [x, z] = flatLand(w);
    const cells = new Uint8Array(N * N), level = new Float32Array(N * N);
    cells[w.ci(x, z)] = 1; level[w.ci(x, z)] = 3;
    w.setLakes(cells, level);
    expect(w.canPlace('house', x, z)).toBe('Un lac est ici');
    w.setLakes(new Uint8Array(N * N), new Float32Array(N * N));
  });

  it('le fond d’une faille n’est pas la mer : aucun bateau n’y navigue', () => {
    const i = w.ravine.findIndex((r) => r > 0.5);
    expect(i).toBeGreaterThanOrEqual(0);
    const x = (i % VS) / VR, z = Math.floor(i / VS) / VR;
    expect(w.seaAt(x, z, MAX_H)).toBe(false);
    const [sx, sz] = findCell((cx, cz) => w.cellAvg(cx, cz) < -0.95 && !w.lake[w.ci(cx, cz)]);
    expect(w.seaAt(sx + 0.5, sz + 0.5, -0.6)).toBe(true);
  });
});

describe('relief', () => {
  it('le pinceau qui touche un bâtiment ne modifie rien : ni fosse autour, ni pilier sous la maison', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    w.place('house', x, z, 0, true, 1, false);
    const before = w.heights.slice();
    expect(brushOnBuilding(w, x + 2, z + 0.5, 3)).toBe(true);
    expect(sculpt(w, 'dig', x + 2, z + 0.5, 3, 0.05, { target: 0 })).toBe(false);
    expect(w.heights).toEqual(before);
    // assez loin, le pinceau creuse
    expect(brushOnBuilding(w, x + 8, z + 0.5, 3)).toBe(false);
  });

  it('les routes gardent leur niveau : le pinceau creuse autour sans les couper', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    expect(w.setRoad(x, z, true)).toBe(true);
    const corner = w.h(x, z);
    sculpt(w, 'lower', x + 0.5, z + 0.5, 2.5, 0.05, { target: 0 });
    expect(w.h(x, z)).toBe(corner);
    expect(w.road[w.ci(x, z)]).toBeTruthy();
  });
});

describe('heure du jour', () => {
  it('la nuit passe plus vite que le jour, et une journée garde sa durée', () => {
    const t = new GameTime();
    t.dayLen = 100; t.hour = 12;
    let night = 0;
    for (let i = 0; i < 1000; i++) { t.update(0.1); if (t.hour < 6 || t.hour >= 18) night += 0.1; }
    expect(t.days).toBe(1);
    expect(t.hour).toBeCloseTo(12, 0);
    expect(night).toBeGreaterThan(25);
    expect(night).toBeLessThan(38);
  });
});

describe('volcans et récoltes', () => {
  it('la lave détruit un bâtiment seulement si les catastrophes sont activées', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    const b = w.place('house', x, z, 0, true, 1, false);
    w.disasters = false;
    w.coverLava(w.ci(x, z));
    expect(w.buildings.has(b.id)).toBe(true);
    w.disasters = true;
    w.coverLava(w.ci(x, z));
    expect(w.buildings.has(b.id)).toBe(false);
    expect(w.losses.length).toBe(1);
    expect(w.ash[w.ci(x, z)]).toBe(1);
  });

  it('un champ sur des cendres donne double récolte, la sécheresse la réduit', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    w.veg[w.ci(x, z)] = VEG_FIELD;
    const sim = new Sim(w);
    const food = (moisture: number) => { sim.moisture = moisture; sim.recalc(); sim.update(0, 1); return sim.food.cap; };
    const normal = food(1);
    w.ash[w.ci(x, z)] = 1;
    const fertile = food(1);
    expect(fertile).toBeCloseTo(normal * 2, 5);
    expect(food(0)).toBeLessThan(fertile * 0.6);
  });

  it('l’âge industriel demande du minerai', () => {
    const w = continent();
    const sim = new Sim(w);
    sim.age = 2;
    const ore = () => sim.ageProgress()!.items.find((i) => i.label.startsWith('minerai'))!;
    expect(ore().need).toBeGreaterThan(0);
    w.ore = 99;
    expect(ore().have).toBe(99);
  });
});

describe('routes automatiques', () => {
  /** Une bande de terre plate de `len` cases vers l'est (sur trois de large), débroussaillée pour y bâtir */
  function strip(w: World, len: number, from = 10) {
    for (let z = from; z < N - 10; z++)
      for (let x = 10; x < N - 10 - len; x++) {
        let ok = true;
        for (let i = 0; i <= len && ok; i++) for (let j = -1; j <= 1 && ok; j++)
          ok = w.cellAvg(x + i, z + j) > 0.5 && w.cellSlope(x + i, z + j) < 0.6 && !w.occ[w.ci(x + i, z + j)] && !w.road[w.ci(x + i, z + j)] && !w.isWet(x + i, z + j);
        if (!ok) continue;
        for (let i = 0; i <= len; i++) for (let j = -1; j <= 1; j++) { w.veg[w.ci(x + i, z + j)] = 0; w.decor[w.ci(x + i, z + j)] = 0; }
        return [x, z];
      }
    throw new Error('pas de bande plate');
  }
  const roads = (w: World) => w.road.reduce((n, v) => n + (v ? 1 : 0), 0);

  it('relie un bâtiment au voisin par un chemin court, rien de plus', () => {
    const w = continent();
    const [x, z] = strip(w, 8);
    // le tout premier bâtiment n'a personne à rejoindre
    expect(autoRoad(w, w.place('house', x, z, 0, true, 0, false))).toBe(0);
    const n = autoRoad(w, w.place('house', x + 6, z, 0, true, 0, false));
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(7);
    // un bâtiment qui touche déjà la route n'en pose pas
    const r = w.road.findIndex((v) => v === 1);
    const spot = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([a, b]) => [r % N + a, Math.floor(r / N) + b]).find(([a, b]) => w.canPlace('house', a, b) === null)!;
    const before = roads(w);
    expect(autoRoad(w, w.place('house', spot[0], spot[1], 0, true, 0, false))).toBe(0);
    expect(roads(w)).toBe(before);
  });

  it('ne trace rien pour un lampadaire ni vers un bâtiment trop loin', () => {
    const w = continent();
    const [x, z] = strip(w, 8);
    w.place('house', x, z, 0, true, 0, false);
    expect(autoRoad(w, w.place('lamp', x + 4, z, 0, true, 0, false))).toBe(0);
    const [fx, fz] = strip(w, 2, z + 25);
    expect(autoRoad(w, w.place('house', fx, fz, 0, true, 0, false))).toBe(0);
    expect(roads(w)).toBe(0);
  });
});

describe('façades et ponts', () => {
  it('un bâtiment se tourne sur place : même emprise, orientation gardée, annulable', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    const b = w.place('workshop', x, z, 0, true, 2, false);
    const occ = Array.from(w.occ).map((v, k) => (v === b.id ? k : -1)).filter((k) => k >= 0);
    const before = w.snapshot();
    w.rotateBuilding(b.id, b.rot + 1);
    expect(w.buildings.get(b.id)).toMatchObject({ rot: 1, auto: false, x, z });
    expect(Array.from(w.occ).map((v, k) => (v === b.id ? k : -1)).filter((k) => k >= 0)).toEqual(occ);
    w.rotateBuilding(b.id, 7);
    expect(w.buildings.get(b.id)!.rot).toBe(3);
    w.restore(before);
    expect([...w.buildings.values()].find((o) => o.kind === 'workshop')).toMatchObject({ rot: 0, auto: true });
  });

  it('la façade regarde le côté qui longe le plus la route, sinon la route la plus proche', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    const road = (cx: number, cz: number) => { w.road[w.ci(cx, cz)] = 1; };
    w.road.fill(0);
    // gare ou château (2 × 2) : une case de route devant (+z), deux à l'ouest (-x) : il se tourne vers l'ouest
    road(x, z + 2); road(x - 1, z); road(x - 1, z + 1);
    expect(facingRoadRot(w, 'landmark', x, z, 0)).toBe(3);
    // à égalité, il garde son orientation
    w.road.fill(0);
    road(x, z + 2); road(x + 2, z);
    expect(facingRoadRot(w, 'landmark', x, z, 1)).toBe(1);
    expect(facingRoadRot(w, 'landmark', x, z, 0)).toBe(0);
    // aucune route contre la maison : la plus proche, à l'est, décide ; trop loin, rien ne change
    w.road.fill(0);
    road(x + 3, z);
    expect(facingRoadRot(w, 'house', x, z, 2)).toBe(1);
    w.road.fill(0);
    road(x + 7, z);
    expect(facingRoadRot(w, 'house', x, z, 2)).toBe(2);
  });

  it('un atelier sans place pour grandir reste en 1 × 1, puis grandit quand la place se libère', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    // l'atelier d'une ancienne partie (1 × 1), cerné de maisons sur ses quatre places possibles
    const ring = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
    const houses = ring.filter(([dx, dz]) => w.canPlace('house', x + dx, z + dz) === null).map(([dx, dz]) => w.place('house', x + dx, z + dz, 0, true, 0, false));
    expect(houses.length).toBe(8);
    const d = w.toJSON();
    d.buildings.push(['workshop', x, z, 0, 1, 0]);
    const w2 = new World();
    w2.fromJSON(d);
    const ws = [...w2.buildings.values()].find((b) => b.kind === 'workshop')!;
    expect(ws.small).toBe(true);
    expect([ws.x, ws.z]).toEqual([x, z]);
    expect(w2.occ[w2.ci(x, z)]).toBe(ws.id);
    // il reste petit d'une sauvegarde à l'autre, puis grandit quand on retire la maison de l'est et celles du coin
    const d2 = w2.toJSON();
    expect(d2.buildings.find((r: unknown[]) => r[0] === 'workshop')[6]).toBe(1);
    d2.buildings = d2.buildings.filter((r: number[]) => !(r[0] === ('house' as unknown) && ((r[1] === x + 1 && r[2] === z) || (r[1] === x + 1 && r[2] === z + 1) || (r[1] === x && r[2] === z + 1))));
    const w3 = new World();
    w3.fromJSON(d2);
    const big = [...w3.buildings.values()].find((b) => b.kind === 'workshop')!;
    expect(big.small).toBeUndefined();
    expect([big.x, big.z]).toEqual([x, z]);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) expect(w3.occ[w3.ci(x + i, z + j)]).toBe(big.id);
  });

  it('poser un bâtiment entre deux voisins ne les soulève ni ne les enfonce', () => {
    const w = continent();
    let spot: number[] | null = null;
    for (let z = 10; z < N - 10 && !spot; z++) for (let x = 10; x < N - 12 && !spot; x++)
      if ([0, 1, 2].every((i) => w.canPlace('house', x + i, z) === null && w.cellSlope(x + i, z) < 0.3)) spot = [x, z];
    const [x, z] = spot!;
    const corners = (bx: number) => [w.h(bx, z), w.h(bx + 1, z), w.h(bx, z + 1), w.h(bx + 1, z + 1)];
    w.place('house', x, z, 0, true, 0, false);
    // un voisin plus haut, deux cases plus loin
    for (const [i, j] of [[2, 0], [3, 0], [2, 1], [3, 1]]) w.heights[w.vi(x + i, z + j)] += 0.4;
    w.place('house', x + 2, z, 0, true, 0, false);
    const a = corners(x), c = corners(x + 2);
    // la maison du milieu partage ses coins avec les deux : ni l'une ni l'autre ne bouge
    w.place('house', x + 1, z, 0, true, 0, false);
    expect(corners(x)).toEqual(a);
    expect(corners(x + 2)).toEqual(c);
  });

  it('un service posé en 1 × 1 dans une ancienne sauvegarde grandit en 2 × 2 sur une place libre voisine', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    // une maison à l'est empêche de grandir vers l'est : la caserne s'étend vers l'ouest ou le nord
    w.place('house', x + 1, z, 0, true, 0, false);
    const d = w.toJSON();
    d.buildings.push(['fire', x, z, 0, 1, 0]);
    const w2 = new World();
    w2.fromJSON(d);
    const f = [...w2.buildings.values()].find((b) => b.kind === 'fire')!;
    expect(f).toBeTruthy();
    expect(f.x <= x && x <= f.x + 1 && f.z <= z && z <= f.z + 1).toBe(true);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) expect(w2.occ[w2.ci(f.x + i, f.z + j)]).toBe(f.id);
    expect(w2.losses).toEqual([]);
  });

  it('sur un pont, on coupe les virages ; ailleurs, on passe au centre des cases', () => {
    const w = continent();
    let L: number[] | null = null;
    for (let z = 2; z < N - 3 && !L; z++) for (let x = 2; x < N - 3 && !L; x++) if (w.isWet(x, z) && w.isWet(x + 1, z) && w.isWet(x + 1, z + 1)) L = [x, z];
    const [x, z] = L!;
    const path = [w.ci(x, z), w.ci(x + 1, z), w.ci(x + 1, z + 1)];
    expect(w.passPoint(path, 1)).toEqual([x + 1.5, z + 0.5]);
    for (const c of path) w.road[c] = 1;
    expect(w.bridgeY(x + 1, z)).not.toBeNull();
    expect(w.passPoint(path, 1)).toEqual([x + 1.25, z + 0.75]);
    // tout droit ou au bout du trajet : le centre
    expect(w.passPoint(path, 0)).toEqual([x + 0.5, z + 0.5]);
    expect(w.passPoint(path, 2)).toEqual([x + 1.5, z + 1.5]);
  });
});

describe('jardins', () => {
  /** Un jardin rectangulaire de w × d cases peint sur de la terre plate et dégagée */
  function garden(w: World, gw: number, gd: number) {
    for (let z = 8; z < N - 8 - gd; z++)
      for (let x = 8; x < N - 8 - gw; x++) {
        let ok = true;
        for (let i = 0; i < gw && ok; i++) for (let j = 0; j < gd && ok; j++) ok = w.cellAvg(x + i, z + j) > 0.5 && w.cellSlope(x + i, z + j) < 0.6 && !w.occ[w.ci(x + i, z + j)] && !w.road[w.ci(x + i, z + j)] && !w.isWet(x + i, z + j);
        if (!ok) continue;
        for (let i = 0; i < gw; i++) for (let j = 0; j < gd; j++) { w.veg[w.ci(x + i, z + j)] = VEG_GARDEN; w.decor[w.ci(x + i, z + j)] = 0; }
        return findGardens(w).find((g) => g.set.has(w.ci(x, z)))!;
      }
    throw new Error('pas de place pour un jardin');
  }

  it('change de visage à chaque âge, toujours le même pour une zone donnée', () => {
    const w = continent(), g = garden(w, 4, 3);
    const styles = [0, 1, 2, 3, 4, 5].map((a) => layoutGarden(w, g, a).style);
    expect(styles[0]).toBe('camp');
    expect(styles[1]).toBe('antique');
    expect(styles[4]).toBe('parc');
    expect(styles[5]).toBe('futur');
    expect(new Set(styles).size).toBe(6);
    expect(layoutGarden(w, g, 2)).toEqual(layoutGarden(w, g, 2));
  });

  it('se remplit selon la taille et reste dans la zone', () => {
    const w = continent(), small = garden(w, 2, 1), big = garden(w, 6, 5);
    for (let a = 0; a <= 5; a++) {
      const s = layoutGarden(w, small, a), b = layoutGarden(w, big, a);
      expect(b.items.length).toBeGreaterThan(s.items.length);
      for (const l of [s, b]) for (const it of l.items) expect(l.g.set.has(w.ci(Math.floor(it.x), Math.floor(it.z)))).toBe(true);
      expect(b.spots.length).toBeGreaterThan(0);
    }
    // préhistoire : des feux et des places assises autour ; époque moderne : des jeux pour les enfants
    expect(layoutGarden(w, big, 0).items.filter((i) => i.k === 'fire').length).toBeGreaterThan(0);
    expect(layoutGarden(w, big, 0).spots.some((s) => s.act === 'sit')).toBe(true);
    expect(layoutGarden(w, big, 4).spots.some((s) => s.kid && s.act === 'play')).toBe(true);
  });

  it('à l’âge futuriste, un jardin lumineux qui ne ressemble pas au parc moderne', () => {
    const w = continent(), big = garden(w, 6, 5), small = garden(w, 2, 1);
    const f = layoutGarden(w, big, 5), m = layoutGarden(w, big, 4);
    expect(f.style).toBe('futur');
    const kinds = new Set(f.items.map((i) => i.k)), modern = new Set(m.items.map((i) => i.k));
    for (const k of ['dome', 'lighttree', 'hexbed', 'drone', 'pathlight', 'podbench', 'gravpool', 'hoverpad']) expect(kinds.has(k), k).toBe(true);
    // rien du parc moderne : ni toboggan, ni arbres ordinaires, ni lampadaires
    for (const k of ['slide', 'swings', 'tree', 'lamp', 'bench']) expect(kinds.has(k), k).toBe(false);
    expect([...kinds].filter((k) => modern.has(k) && k !== 'pond').length).toBeLessThan(3);
    // on s'y assoit, les enfants y jouent, et ça reste dans la zone même petite
    expect(f.spots.some((s) => s.act === 'sit')).toBe(true);
    expect(f.spots.some((s) => s.kid && s.act === 'play')).toBe(true);
    expect(f.paths.length).toBeGreaterThan(20);
    const s = layoutGarden(w, small, 5);
    expect(s.items.length).toBeGreaterThan(0);
    for (const l of [f, s]) for (const it of l.items) expect(l.g.set.has(w.ci(Math.floor(it.x), Math.floor(it.z)))).toBe(true);
    expect(layoutGarden(w, big, 5)).toEqual(f);
  });

  it('tous les âges ont de l’herbe plus riche et des détails propres', () => {
    const w = continent(), big = garden(w, 6, 5);
    const has = (a: number, k: string) => layoutGarden(w, big, a).items.some((i) => i.k === k);
    expect(has(0, 'fern') && has(0, 'berrybush') && has(0, 'totem')).toBe(true);
    expect(has(1, 'tuft') && has(1, 'urn') && has(1, 'rosebush')).toBe(true);
    expect(has(5, 'glowgrass')).toBe(true);
  });

  it('un jardin long accueille un tournoi au Moyen Âge, un petit des lices d’entraînement', () => {
    const w = continent(), long = garden(w, 8, 3), small = garden(w, 2, 2);
    const t = layoutGarden(w, long, 2);
    expect(t.style).toBe('tournoi');
    expect(t.lanes.length).toBe(4);
    expect(t.spots.some((s) => s.act === 'cheer')).toBe(true);
    expect(layoutGarden(w, small, 2).style).toBe('lices');
  });
});

describe('expéditions', () => {
  it('chaque âge a au moins une expédition obligatoire (deux à la Préhistoire), et des choix bien formés', () => {
    for (let age = 0; age < 5; age++) {
      expect(mandatoriesFor(age).length).toBe(age === 3 || age === 1 ? 3 : age <= 2 ? 2 : 1);
      expect(mandatoryFor(age)).toBe(mandatoriesFor(age)[0]);
    }
    expect(mandatoriesFor(0).map((m) => m.id)).toEqual(['herd', 'mammoth']);
    for (const m of MISSIONS) {
      expect(m.choices.length).toBeGreaterThan(0);
      for (const c of m.choices) {
        expect(c.party).toBeGreaterThanOrEqual(2);
        expect(c.risk).toBeGreaterThanOrEqual(0);
        expect(c.risk).toBeLessThan(1);
        expect(c.win.length).toBeGreaterThan(0);
      }
    }
  });

  it('le port se pose facilement sur une rive, et son quai est remblayé au-dessus de l’eau', () => {
    const w = continent();
    const spots: [number, number][] = [];
    for (let z = 2; z < N - 3; z++) for (let x = 2; x < N - 3; x++) if (w.canPlace('harbor', x, z) === null) spots.push([x, z]);
    expect(spots.length).toBeGreaterThan(100);
    const [x, z] = spots[Math.floor(spots.length / 2)];
    w.place('harbor', x, z, 0, true, 2, false);
    // le sommet au milieu du quai n'est partagé avec aucun voisin : il est remblayé
    expect(w.h(x + 1, z + 1)).toBeGreaterThanOrEqual(0.12 - 1e-6);
  });

  it('le quai du port reste au ras de l’eau, même au coin qu’il partage avec un voisin plus haut', () => {
    const w = continent();
    let spot: [number, number] | null = null;
    for (let z = 4; z < N - 6 && !spot; z++) for (let x = 4; x < N - 6 && !spot; x++) if (w.canPlace('harbor', x, z) === null && w.canPlace('house', x + 3, z - 1) === null) spot = [x, z];
    expect(spot).not.toBeNull();
    const [x, z] = spot!;
    // une maison posée en hauteur, en diagonale du coin arrière du port
    const hw = w as unknown as { heights: Float32Array; vi(x: number, z: number): number };
    for (const [vx, vz] of [[x + 3, z - 1], [x + 4, z - 1], [x + 3, z], [x + 4, z]]) hw.heights[hw.vi(vx, vz)] = 1.2;
    w.place('house', x + 3, z - 1, 0, true, 2, false);
    w.place('harbor', x, z, 0, true, 3, false);
    expect(w.h(x + 3, z)).toBeLessThanOrEqual(0.32 + 1e-6);
    expect(w.h(x + 4, z - 1)).toBeGreaterThan(1);
  });

  it('le port creuse son bassin devant le quai : le premier rang d’eau est assez profond pour un grand navire', () => {
    const w = continent(), F = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    const front = (x: number, z: number, r: number, i: number): [number, number] => { const f = F[r]; return [f[0] ? (f[0] > 0 ? x + 3 : x - 1) : x + i, f[1] ? (f[1] > 0 ? z + 3 : z - 1) : z + i]; };
    let spot: [number, number, number] | null = null;
    for (let z = 2; z < N - 4 && !spot; z++) for (let x = 2; x < N - 4 && !spot; x++) {
      if (w.canPlace('harbor', x, z) !== null) continue;
      const r = facingRoadRot(w, 'harbor', x, z, 0);
      if ([0, 1, 2].every((i) => w.cellAvg(...front(x, z, r, i)) < -0.05)) spot = [x, z, r];
    }
    expect(spot).not.toBeNull();
    const [x, z, r] = spot!;
    w.place('harbor', x, z, r, true, 3, false);
    expect(w.cellAvg(...front(x, z, r, 1))).toBeLessThan(-0.35);
    expect(w.h(x + 1, z + 1)).toBeGreaterThanOrEqual(0.12 - 1e-6);
  });

  it('une maison devient un manoir qui s’étend derrière elle, une petite gare une grande gare que ses lignes desservent toujours', () => {
    const w = continent();
    const free = (k: KindId, s: number): [number, number] => {
      for (let z = 20; z < N - 20; z += 3) for (let x = 20; x < N - 20; x += 3) if (w.canPlace(k, x - s, z - s) === null && [...w.buildings.values()].every((o) => Math.hypot(o.x - x, o.z - z) > 8)) return [x, z];
      throw new Error('pas de place');
    };
    const [hx, hz] = free('manor', 1);
    const h = w.place('house', hx, hz, 0, false, 2, false);
    const m = w.upgrade(h.id, 'manor')!;
    expect(m.kind).toBe('manor');
    expect(w.buildings.has(h.id)).toBe(false);
    expect(m.z + 1).toBe(hz);
    const [ax, az] = free('terminal', 0), a = w.place('station', ax, az, 0, false, 3, false);
    const [bx, bz] = free('terminal', 0), b = w.place('station', bx, bz, 0, false, 3, false);
    w.lines.push({ id: 7, stops: [a.id, b.id], color: 0xd84a3e });
    const t = w.upgrade(a.id, 'terminal')!;
    expect(t.kind).toBe('terminal');
    expect(w.lines[w.lines.length - 1].stops).toEqual([t.id, b.id]);
  });

  it('le passage à l’âge suivant attend le joueur, même quand tout est réuni', () => {
    const w = continent(), sim = new Sim(w);
    let up = -1;
    sim.onAgeUp = (a) => { up = a; };
    sim.ageProgress = () => ({ next: 1, ratio: 1, items: [{ label: 'Habitants', have: 12, need: 12 }] });
    sim.update(1, 1);
    expect(sim.age).toBe(0);
    expect(sim.ready).toBe(true);
    expect(sim.advance()).toBe(true);
    expect(sim.age).toBe(1);
    expect(up).toBe(1);
  });

  it('les expéditions obligatoires conditionnent l’âge suivant : à la Préhistoire, les bêtes et le mammouth', () => {
    const w = continent(), sim = new Sim(w);
    const items = () => sim.ageProgress()!.items.filter((i) => i.label.startsWith('expédition'));
    expect(items().map((i) => i.label)).toEqual(['expédition « Apprivoiser des bêtes »', 'expédition « Chasser le mammouth »']);
    expect(items().map((i) => i.have)).toEqual([0, 0]);
    w.exp.done.push('herd');
    expect(items().map((i) => i.have)).toEqual([1, 0]);
    expect(sim.ready).toBe(false);
    w.exp.done.push('mammoth');
    expect(items().every((i) => i.have === i.need)).toBe(true);
  });

  it('le conseil nomme toutes les expéditions obligatoires qui restent', () => {
    const w = continent(), sim = new Sim(w);
    const [x, z] = flatLand(w);
    w.place('house', x, z, 0, true, 0, false);
    // un village qui a tout pour l'Antiquité (habitants, bâtiments, besoins comblés), sauf ses expéditions
    sim.pop = 12;
    sim.counts = { house: 4, farm: 1, well: 1, workshop: 1 };
    for (const n of [sim.housing, sim.food, sim.water, sim.jobs, sim.joy, sim.health]) { n.ok = true; n.cap = 100; }
    const message = () => (sim as unknown as { computeMessage(): string }).computeMessage();
    expect(message()).toBe('Pour l’âge suivant : réussissez les expéditions « Apprivoiser des bêtes » et « Chasser le mammouth » (menu Expéditions).');
    w.exp.done.push('mammoth');
    expect(message()).toBe('Pour l’âge suivant : réussissez l’expédition « Apprivoiser des bêtes » (menu Expéditions).');
    w.exp.done.push('herd');
    expect(message()).toMatch(/Tout est prêt pour l’âge suivant/);
  });

  it('une partie déjà à l’Antiquité (ou plus loin) n’a pas à chasser le mammouth', () => {
    const w = continent();
    // une sauvegarde d'avant la chasse au mammouth : seules les bêtes ont été apprivoisées
    w.exp.done.push('herd', 'seeds');
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    const sim = new Sim(r);
    for (const age of [1, 2, 3, 4]) {
      sim.age = age;
      const exp = sim.ageProgress()!.items.filter((i) => i.label.startsWith('expédition'));
      expect(exp.map((i) => i.label)).toEqual(mandatoriesFor(age).map((m) => `expédition « ${m.title} »`));
      expect(exp.some((i) => i.label.includes('mammouth'))).toBe(false);
    }
    // l'Antiquité ne demande que son blé des collines, déjà rapporté
    sim.age = 1;
    expect(sim.ageProgress()!.items.find((i) => i.label.startsWith('expédition'))!.have).toBe(1);
  });

  it('les effets s’appliquent : bêtes, minerai, savoir-faire, bonus durables et passagers', () => {
    const w = continent(), sim = new Sim(w);
    const [x, z] = flatLand(w);
    w.place('farm', x, z, 0, true, 0, false);
    sim.recalc(); sim.update(0, 1);
    const before = sim.food.cap;
    const r = applyEffects(w, [{ t: 'herd', kinds: ['sheep', 'sheep'] }, { t: 'ore', n: 5 }, { t: 'need', need: 'food', n: 3 }, { t: 'need', need: 'joy', n: 2, days: 1 }, { t: 'injured', n: 1, days: 2 }], 100);
    expect(w.exp.herd).toEqual(['sheep', 'sheep']);
    expect(w.ore).toBe(5);
    expect(r).toEqual({ injured: 1, days: 2 });
    sim.update(0, 1);
    expect(sim.food.cap).toBeCloseTo(before + 3, 5);
    expect(needBonus(w.exp, 'joy')).toBe(2);
    // un jour plus tard, l'effet passager s'est éteint
    sim.update(101, 1);
    expect(needBonus(w.exp, 'joy')).toBe(0);
    // et tout se retrouve à la relecture de la sauvegarde
    const w2 = new World();
    w2.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(w2.exp.herd.length).toBe(2);
    expect(w2.exp.bonus.food).toBe(3);
  });

  it('une équipe part, revient, et l’issue s’applique', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 0, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 0, false, 12, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.99);
    const m = mandatoryFor(0)!;
    expect(ex.start(m, 0)).not.toBeNull();
    let report: Report | null = null;
    ex.onReport = (r) => (report = r);
    const phases = new Set<string>();
    for (let i = 0; i < 40000 && !report; i++) { agents.update(0.05, 10, 0, false, 12, 0); ex.update(0.05); if (ex.active[0]) phases.add(ex.active[0].phase); }
    // l'équipe part aussitôt, sans se rassembler d'abord au village
    expect([...phases]).toEqual(['out', 'work', 'back', 'home']);
    expect(report!.ok).toBe(true);
    expect(w.exp.done).toContain(m.id);
    expect(w.exp.herd.length).toBeGreaterThan(0);
    expect(agents.available()).toBeGreaterThanOrEqual(m.choices[0].party);
  });

  it('le grand départ des colons : adieux au village, aucun échec possible, et pas de retour', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 5, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 5, false, 30, 0);
    // le hasard le plus défavorable : un tirage à 0 ferait échouer n'importe quelle autre expédition
    const ex = new Expeditions(w, agents, () => 100, () => 0);
    const colony = MISSIONS.find((mm) => mm.id === 'colony')!;
    expect(colony.farewell).toBe(true);
    // sans cosmodrome dans ce petit village : la même mission, menée dans la plaine
    const m = { ...colony, requires: undefined, choices: colony.choices.map((c) => ({ ...c, dest: 'plain' as const })) };
    const a = ex.start(m, 0, 5)!;
    expect(a).not.toBeNull();
    expect(ex.chance(a)).toBe(0);
    let report: Report | null = null;
    ex.onReport = (r) => (report = r);
    const phases: string[] = [];
    for (let i = 0; i < 40000 && !report; i++) {
      agents.update(0.05, 10, 5, false, 30, 0);
      ex.update(0.05);
      if (a.wait) ex.decide(a, 0);
      // le voyage vu (ou passé) : le travail sur place s'achève aussitôt
      if (a.phase === 'work' && a.t > 5) ex.landNow(a);
      if (phases[phases.length - 1] !== a.phase) phases.push(a.phase);
    }
    expect(phases).toEqual(['gather', 'out', 'work', 'home']);
    expect(report!.ok).toBe(true);
    expect(w.exp.done).toContain('colony');
  });

  it('plus le village est peuplé, plus il mène d’expéditions de front', () => {
    expect([0, 29, 30, 59, 60, 90, 500].map(partyLimit)).toEqual([1, 1, 2, 2, 3, 4, 4]);
    const w = continent();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 0, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 0, false, 14, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.5);
    const [a, b] = MISSIONS.filter((q) => q.age === 0);
    // une seule équipe à moins de trente habitants
    ex.pop = () => 12;
    expect(ex.start(a, 0)).not.toBeNull();
    expect(ex.why(b, b.choices[0])).toMatch(/équipes sont en route/);
    // la même mission ne part pas deux fois ; à trente habitants, une deuxième équipe peut partir
    ex.pop = () => 30;
    expect(ex.why(a, a.choices[1])).toMatch(/déjà en route/);
    const second = ex.start(b, 0);
    expect(second).not.toBeNull();
    expect(ex.active.map((e) => e.id)).toEqual([1, 2]);
    // une école rend les choix plus sûrs
    const risk = ex.riskOf(a.choices[2]);
    const [sx, sz] = flatLand(w);
    w.place('school', sx, sz, 0, true, 0, false);
    expect(ex.riskOf(a.choices[2])).toBeCloseTo(risk * 0.7);
  });

  it('l’équipement rend une expédition plus sûre, part avec l’équipe et revient', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 0, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 0, false, 12, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.99);
    const m = mandatoryFor(0)!, c = m.choices[2];
    const bare = ex.preview(c).risk;
    // fabrication : des lances (sans minerai) ; les épées attendent le Moyen Âge et un atelier
    expect(ex.craft('spear', 0)).toBe(true);
    expect(ex.craft('spear', 0)).toBe(true);
    expect(ex.craft('sword', 0)).toBe(false);
    for (let i = 0; i < 400; i++) ex.update(0.1);
    expect(w.exp.gear.spear).toBe(2);
    expect(ex.preview(c).risk).toBeLessThan(bare);
    // la réserve se relit avec la sauvegarde
    const w2 = new World();
    w2.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(w2.exp.gear.spear).toBe(2);
    // l'équipe emporte les lances : la réserve est vide le temps du voyage
    const a = ex.start(m, 2)!;
    expect(a.gear.spear).toBe(2);
    expect(w.exp.gear.spear).toBe(0);
    // une option qui demande une barque n'est pas possible sans barque ; les autres changent le risque et le temps
    a.wait = EVENTS.find((e) => e.id === 'flood')!;
    expect(ex.canTake(a, 1)).toBe(false);
    expect(ex.decide(a, 1)).toBe(false);
    const k = a.riskK;
    expect(ex.decide(a, 0)).toBe(true);
    expect(a.riskK).toBeCloseTo(k * 0.85);
    expect(a.extra).toBe(8);
    // sur place, un imprévu attend une décision ; sans réponse, l'équipe tranche seule et rentre avec ses lances
    let report: Report | null = null, asked = 0;
    ex.onReport = (r) => (report = r);
    ex.onEvent = () => asked++;
    for (let i = 0; i < 40000 && !report; i++) { agents.update(0.05, 10, 0, false, 12, 0); ex.update(0.05); }
    expect(asked).toBeGreaterThan(0);
    expect(report!.notes.length).toBe(asked + 1);
    expect(w.exp.gear.spear).toBe(2);
  });

  it('l’expédition des bêtes débloque l’enclos, où elles vivent (six par enclos)', () => {
    const w = continent();
    const herd = MISSIONS.find((m) => m.id === 'herd')!;
    expect(herd.unlocks).toBe('pen');
    w.exp.herd.push('sheep', 'sheep', 'sheep', 'sheep', 'pig', 'pig', 'cow', 'cow');
    expect(penHerds(w).rest.length).toBe(8);
    let spot: [number, number] | null = null;
    for (let z = 10; z < N - 10 && !spot; z++) for (let x = 10; x < N - 10 && !spot; x++) if (w.canPlace('pen', x, z) === null) spot = [x, z];
    expect(spot).not.toBeNull();
    const pen = w.place('pen', spot![0], spot![1], 0, true, 0, false)!;
    const r = penHerds(w);
    expect(r.pens.get(pen.id)!.length).toBe(PEN_CAP);
    expect(r.rest).toEqual(['cow', 'cow']);
  });

  it('chaque bâtiment à débloquer a son expédition, du même âge ou d’avant', () => {
    for (const k of Object.keys(KINDS) as KindId[]) {
      const d = KINDS[k];
      if (!d.reqMission) continue;
      const m = MISSIONS.find((x) => x.id === d.reqMission);
      expect(m?.unlocks).toBe(k);
      expect(m!.age).toBeLessThanOrEqual(d.minAge);
    }
    expect(MISSIONS.filter((m) => m.unlocks).length).toBeGreaterThanOrEqual(7);
  });

  it('les chevaux vivent à l’écurie (quatre par écurie), les autres bêtes à l’enclos', () => {
    const w = continent();
    w.exp.herd.push('horse', 'horse', 'horse', 'horse', 'horse', 'sheep', 'sheep');
    const free = (k: 'stable' | 'pen') => { for (let z = 10; z < N - 10; z++) for (let x = 10; x < N - 10; x++) if (w.canPlace(k, x, z) === null) return [x, z]; throw new Error('pas de place'); };
    const [sx, sz] = free('stable');
    const st = w.place('stable', sx, sz, 0, true, 1, false)!;
    const [px, pz] = free('pen');
    const pen = w.place('pen', px, pz, 0, true, 1, false)!;
    const r = penHerds(w);
    expect(r.stables.get(st.id)).toEqual(Array(STABLE_CAP).fill('horse'));
    expect(r.pens.get(pen.id)).toEqual(['sheep', 'sheep', 'horse']);
    expect(r.rest).toEqual([]);
  });

  it('une mission réussie se refait : de nouveau des bêtes, mais ses bonus durables ne durent que quelques jours', () => {
    const w = continent();
    const ex = new Expeditions(w, new Agents(w), () => 100);
    const horses = MISSIONS.find((m) => m.id === 'horses')!, c = horses.choices[0];
    w.exp.done.push('horses');
    expect(ex.list(2)).toContain(horses);
    expect(ex.why(horses, c) ?? '').not.toMatch(/déjà/);
    const eff = redoEffects(c.win);
    expect(eff.filter((e) => e.t === 'herd')).toEqual(c.win.filter((e) => e.t === 'herd'));
    expect(eff.filter((e) => e.t === 'need').every((e) => e.t === 'need' && e.days === REDO_DAYS)).toBe(true);
    expect(redoEffects(MISSIONS.find((m) => m.id === 'seeds')!.choices[0].win).some((e) => e.t === 'perk')).toBe(false);
  });

  it('les chevaux de l’écurie partent avec chaque expédition, et chacun porte ce qu’on lui confie', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 2, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 2, false, 30, 0);
    let spot: number[] | null = null;
    for (let zz = 10; zz < N - 10 && !spot; zz++) for (let xx = 10; xx < N - 10 && !spot; xx++) if (w.canPlace('stable', xx, zz) === null) spot = [xx, zz];
    w.place('stable', spot![0], spot![1], 0, true, 2, false);
    w.exp.herd.push('horse', 'horse');
    w.exp.gear.sword = 3;
    const ex = new Expeditions(w, agents, () => 100, () => 0.99);
    const wolf = MISSIONS.find((m) => m.id === 'wolf')!;
    expect(ex.preview(wolf.choices[0]).label).toMatch(/3 épées · 2 chevaux/);
    const a = ex.start(wolf, 0)!;
    expect(a.mounts).toBe(2);
    expect(w.exp.riding).toBe(2);
    const kits = a.party.map((id) => agents.agents.find((g) => g.id === id)!.kit!);
    expect(kits.filter((k) => k.horse).length).toBe(2);
    expect(kits.every((k) => k.weapon === 'sword')).toBe(true);
  });

  it('une décision prise en route ne fait pas reculer l’équipe, et les libellés suivent l’âge', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 2, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 2, false, 30, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.99);
    const m = MISSIONS.find((q) => q.id === 'coal')!;
    const a = ex.start(m, 0)!;
    for (let i = 0; i < 40000 && !(a.phase === 'work' && a.wait); i++) { agents.update(0.05, 10, 3, false, 30, 0); ex.update(0.05); }
    expect(a.wait).not.toBeNull();
    const longer = a.wait!.options.findIndex((o, i) => (o.work ?? 0) > 0 && ex.canTake(a, i));
    const before = ex.progress(a);
    // un choix qui allonge le chantier (ou, à défaut, le premier) : l'avancement reste où il était
    const pick = longer >= 0 ? longer : a.wait!.options.findIndex((_, i) => ex.canTake(a, i));
    expect(ex.decide(a, pick)).toBe(true);
    expect(ex.progress(a)).toBeCloseTo(before, 5);
    // les libellés d'un choix suivent l'âge (le plus proche, en dessous ou égal)
    const c = { ...m.choices[0], ages: { 3: { label: 'Âge industriel' }, 5: { label: 'Âge futuriste' } } };
    expect(choiceAt(c, 2).label).toBe(m.choices[0].label);
    expect(choiceAt(c, 4).label).toBe('Âge industriel');
    expect(choiceAt(c, 5).label).toBe('Âge futuriste');
  });

  it('une mine ne se creuse que dans la montagne, et rapporte généreusement minerai et pierre', () => {
    const w = continent();
    const [fx, fz] = flatLand(w);
    expect(w.canPlace('mine', fx, fz)).toMatch(/montagne/);
    let spot: number[] | null = null;
    for (let z = 10; z < N - 10 && !spot; z++) for (let x = 10; x < N - 10 && !spot; x++) if (w.canPlace('mine', x, z) === null) spot = [x, z];
    expect(spot).not.toBeNull();
    expect(w.flatTarget(spot![0], spot![1], 2)).toBeGreaterThanOrEqual(2.4);
    w.place('mine', spot![0], spot![1], 0, true, 2, false);
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    const ore = w.ore, stone = w.stone;
    for (let t = 0; t < 300; t++) ex.update(1);
    // production doublée : 6 minerai et 4 pierres par jour au Moyen Âge, trois jours
    expect(w.ore - ore).toBeCloseTo(18, 5);
    expect(w.stone - stone).toBeCloseTo(12, 5);
  });

  it('le club alpin ne se pose que dans la montagne ; le coiffeur se pose partout', () => {
    const w = continent();
    const [fx, fz] = flatLand(w);
    expect(w.canPlace('alpine', fx, fz)).toMatch(/montagne/);
    expect(w.canPlace('barber', fx, fz)).toBeNull();
    let spot: number[] | null = null;
    for (let z = 10; z < N - 10 && !spot; z++) for (let x = 10; x < N - 10 && !spot; x++) if (w.canPlace('alpine', x, z) === null) spot = [x, z];
    expect(spot).not.toBeNull();
    expect(w.flatTarget(spot![0], spot![1], 2)).toBeGreaterThanOrEqual(2.4);
  });

  it('les bûcherons se posent en forêt, la carrière près des rochers ; ils donnent bois et pierre', () => {
    const w = continent();
    const find = (k: 'lumber' | 'quarry') => { for (let z = 10; z < N - 10; z++) for (let x = 10; x < N - 10; x++) if (w.canPlace(k, x, z) === null) return [x, z]; return null; };
    const lu = find('lumber')!, qu = find('quarry')!;
    expect(w.vegAround(lu[0], lu[1], 1, 3, 1)).toBeGreaterThanOrEqual(5);
    w.place('lumber', lu[0], lu[1], 0, true, 1, false);
    w.place('quarry', qu[0], qu[1], 0, true, 1, false);
    // loin de toute forêt, pas de bûcherons
    let bare: number[] | null = null;
    for (let z = 10; z < N - 10 && !bare; z++) for (let x = 10; x < N - 10 && !bare; x++) if (w.canPlace('house', x, z) === null && w.vegAround(x, z, 1, 3, 1) === 0) bare = [x, z];
    expect(w.canPlace('lumber', bare![0], bare![1])).toMatch(/forêt/);
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    const wood = w.wood, stone = w.stone;
    for (let t = 0; t < 100; t++) ex.update(1);
    expect(w.wood - wood).toBeCloseTo(12, 5);
    expect(w.stone - stone).toBeCloseTo(10, 5);
  });

  it('la voie ferrée franchit une rivière ou un lac sur un pont, pas le large', () => {
    const w = continent();
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    const rail = new Railway(w, new Agents(w), ex, () => 100, () => 0.3);
    // deux places pour une gare, de part et d'autre d'une eau peu profonde (rivière, lac) de quelques cases, qui barre le
    // passage (elle continue au nord et au sud : la voie ne la contourne pas)
    const shallow = (x: number, z: number) => w.isWet(x, z) && (w.lake[w.ci(x, z)] === 1 || w.cellAvg(x, z) > -1.7);
    let pair: number[][] | null = null;
    for (let z = 12; z < N - 12 && !pair; z++) for (let x = 12; x < N - 20 && !pair; x++) {
      if (w.canPlace('station', x, z) !== null) continue;
      let k = x + 2;
      while (k < x + 6 && !w.isWet(k, z) && !w.isWet(k, z + 1)) k++;
      let wet = 0;
      while (wet < 7 && shallow(k + wet, z) && shallow(k + wet, z + 1)) wet++;
      if (wet < 2 || w.isWet(k + wet, z)) continue;
      if (![-8, -4, 4, 8].every((dz) => [0, 1, 2, 3, 4].some((d) => w.isWet(k + d, z + dz)))) continue;
      for (let x2 = k + wet; x2 < k + wet + 4 && !pair; x2++) if (w.canPlace('station', x2, z) === null) pair = [[x, z], [x2, z]];
    }
    expect(pair).not.toBeNull();
    const a = w.place('station', pair![0][0], pair![0][1], 0, false, 3, false), b = w.place('station', pair![1][0], pair![1][1], 0, false, 3, false);
    const line = rail.addLine([a.id, b.id]), tr = rail.trains.get(line.id)!;
    expect(tr.why).toBeNull();
    const g = rail.network().segs[0];
    let onWater = 0;
    for (let s = 0; s < g.len; s += 0.2) {
      const k = Math.max(1, g.cum.findIndex((c) => c >= s)), f = (s - g.cum[k - 1]) / (g.cum[k] - g.cum[k - 1]), p = g.pts[k - 1], q = g.pts[k];
      const x = Math.floor(p[0] + (q[0] - p[0]) * f), z = Math.floor(p[1] + (q[1] - p[1]) * f);
      if (w.isWet(x, z)) { onWater++; expect(shallow(x, z)).toBe(true); }
    }
    expect(onWater).toBeGreaterThan(0);
  });

  it('le chemin de fer se trace de gare en gare : aucune ligne d’office, des voyageurs vont de l’une à l’autre', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 3, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 3, false, 40, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.5);
    const rail = new Railway(w, agents, ex, () => 100, () => 0.3);
    rail.update(0.1);
    expect(w.lines.length).toBe(0);
    const near = (cx: number, cz: number, kind: 'terminal' | 'station' | 'maglev') => {
      const out: number[][] = [];
      for (let dz = -24; dz <= 24; dz++) for (let dx = -24; dx <= 24; dx++) if (Math.hypot(dx, dz) >= 8 && w.canPlace(kind, cx + dx, cz + dz) === null) out.push([cx + dx, cz + dz, Math.hypot(dx, dz)]);
      return out.sort((a, b) => a[2] - b[2]).slice(0, 30);
    };
    // la gare centrale, près du village : seule, elle n'a pas de ligne (plus de ligne tracée d'office)
    let station = null;
    for (const [sx, sz] of near(x, z, 'terminal')) { station = w.place('terminal', sx, sz, 0, true, 3, false); if (station) break; }
    expect(station).not.toBeNull();
    rail.update(2.1);
    expect(w.lines.length).toBe(0);
    expect(rail.stopName(station!)).toBe('Gare centrale');
    const run = (steps: number) => { for (let t = 0; t < steps; t++) { agents.update(0.5, 10, 3, false, 40, 0); ex.update(0.5); rail.update(0.5); } };
    // une petite gare plus loin : une ligne de la gare centrale à elle, des voyageurs vont de l'une à l'autre
    let line2 = null, small = null;
    for (const [sx, sz] of near(station!.x, station!.z, 'station')) {
      small = w.place('station', sx, sz, 0, true, 3, false);
      line2 = rail.addLine([station!.id, small.id]);
      if (!rail.trains.get(line2.id)!.why) break;
      rail.removeLine(line2.id);
      w.removeBuilding(small.id);
      line2 = small = null;
    }
    expect(line2).not.toBeNull();
    expect(rail.lineLabel(line2!)).toBe('Gare centrale → Petite gare');
    // la voie ne passe ni sur un bâtiment ni dans l'eau
    for (const g of rail.network().segs) for (let s = 0.4; s < g.len - 0.4; s += 0.25) {
      const k = Math.max(1, g.cum.findIndex((c) => c >= s)), f = (s - g.cum[k - 1]) / (g.cum[k] - g.cum[k - 1]), a = g.pts[k - 1], c = g.pts[k];
      const cx = Math.floor(a[0] + (c[0] - a[0]) * f), cz = Math.floor(a[1] + (c[1] - a[1]) * f);
      expect(w.occ[cz * N + cx]).toBe(0);
      expect(w.isWet(cx, cz)).toBe(false);
    }
    const tr2 = rail.trains.get(line2!.id)!;
    run(600);
    expect(tr2.carried).toBeGreaterThan(0);
    // la gare maglev de l'âge futuriste est une gare comme les autres : une ligne s'y arrête
    let line3 = null, mag = null;
    for (const [sx, sz] of near(small!.x, small!.z, 'maglev')) {
      mag = w.place('maglev', sx, sz, 0, true, 5, false);
      line3 = rail.addLine([small!.id, mag.id]);
      if (!rail.trains.get(line3.id)!.why) break;
      rail.removeLine(line3.id);
      w.removeBuilding(mag.id);
      line3 = mag = null;
    }
    expect(line3).not.toBeNull();
    expect(line3!.color).not.toBe(line2!.color);
    expect(rail.lineLabel(line3!)).toBe('Petite gare → Gare maglev');
    rail.removeLine(line3!.id);
    w.removeBuilding(mag!.id);
    // les lignes se sauvegardent avec leurs arrêts, même si les numéros des bâtiments changent au chargement
    const w2 = new World();
    w2.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(w2.lines.map((l) => l.stops.map((id) => w2.buildings.get(id)!.kind))).toEqual([['terminal', 'station']]);
    expect(w2.linesAuto).toBe(false);
    // la gare démolie : ses lignes ne roulent plus, tout le monde rentre au village
    w.removeBuilding(station!.id);
    rail.update(2.1);
    for (const l of w.lines) {
      const t = rail.trains.get(l.id)!;
      expect(t.why).not.toBeNull();
      expect(t.aboard.length + t.boarding.length).toBe(0);
    }
  }, 20000);
});

describe('améliorations', () => {
  it('à l’âge futuriste, la petite gare devient gare intermodale, puis gare maglev, et ses lignes la suivent', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    expect(UPGRADES.some((u) => u.from === 'terminal' && u.to === 'maglev')).toBe(true);
    const st = w.place('station', x, z, 0, true, 5, false);
    let other: Building | null = null;
    for (let dz = -20; dz <= 20 && !other; dz++) for (let dx = 8; dx <= 20 && !other; dx++) if (w.canPlace('station', x + dx, z + dz) === null) other = w.place('station', x + dx, z + dz, 0, true, 5, false);
    w.lines.push({ id: 1, stops: [st.id, other!.id], color: 0xff0000 });
    const term = w.upgrade(st.id, 'terminal');
    expect(term?.kind).toBe('terminal');
    const mag = w.upgrade(term!.id, 'maglev');
    expect(mag?.kind).toBe('maglev');
    expect(mag!.age).toBe(5);
    expect(w.lines[0].stops).toEqual([mag!.id, other!.id]);
  });
});

describe('pétrole', () => {
  /** Cases des gisements de pétrole */
  const oilCells = (w: World) => [...w.oil.keys()].filter((k) => w.oil[k]);

  it('les gisements sont tirés de la graine, sur la terre ferme, et se sauvegardent ; une ancienne partie en reçoit', () => {
    const w = continent(), cells = oilCells(w);
    expect(cells.length).toBeGreaterThan(40);
    // plusieurs nappes, à l'écart l'une de l'autre, dont au moins une au désert
    const fields: number[][] = [];
    for (const k of cells) if (!fields.some(([x, z]) => Math.hypot(x - (k % N), z - Math.floor(k / N)) < 10)) fields.push([k % N, Math.floor(k / N)]);
    expect(fields.length).toBeGreaterThanOrEqual(5);
    expect(cells.some((k) => w.biome[k] === BIOME_DESERT)).toBe(true);
    expect(cells.every((k) => w.cellAvg(k % N, Math.floor(k / N)) > 0.35 && !w.decor[k] && !w.lake[k])).toBe(true);
    // même graine, mêmes gisements ; autre graine, d'autres
    const same = new World();
    newWorld(same, 3, 2026);
    expect(oilCells(same)).toEqual(cells);
    const other = new World();
    newWorld(other, 3, 77);
    expect(oilCells(other)).not.toEqual(cells);
    // la sauvegarde les garde ; une sauvegarde d'avant le pétrole en reçoit au chargement, tirés de la graine sur son relief
    // (arrondi) : les mêmes nappes, ou presque, et toujours les mêmes pour la même sauvegarde
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect(oilCells(r)).toEqual(cells);
    const { oil, crude, fuel, ...old } = w.toJSON();
    void oil; void crude; void fuel;
    const o = new World();
    o.fromJSON(JSON.parse(JSON.stringify(old)));
    expect(oilCells(o)).toEqual([]);
    expect([o.crude, o.fuel]).toEqual([0, 0]);
    addDefaultDecor(o, 2026);
    const got = oilCells(o);
    expect(got.length).toBeGreaterThan(40);
    expect(got.filter((k) => w.oil[k]).length).toBeGreaterThan(cells.length / 2);
    const o2 = new World();
    o2.fromJSON(JSON.parse(JSON.stringify(old)));
    addDefaultDecor(o2, 2026);
    expect(oilCells(o2)).toEqual(got);
  });

  it('le puits de pétrole ne se fore que sur un gisement ; il tire du brut, que la raffinerie change en carburant', () => {
    const w = continent();
    const [fx, fz] = flatLand(w);
    expect(w.oil[w.ci(fx, fz)]).toBe(0);
    expect(w.canPlace('oilwell', fx, fz)).toMatch(/gisement/);
    const wells = [];
    for (const k of oilCells(w)) if (wells.length < 3 && w.canPlace('oilwell', k % N, Math.floor(k / N)) === null) wells.push(w.place('oilwell', k % N, Math.floor(k / N), 0, true, 4, false));
    expect(wells.length).toBe(3);
    const ex = new Expeditions(w, new Agents(w), () => 100, () => 0.5);
    const day = () => { for (let t = 0; t < 100; t++) ex.update(1); };
    // trois puits : 12 barils de brut par jour, pas encore de carburant
    expect(ex.daily()).toMatchObject({ crude: 12, fuel: 0 });
    day();
    expect(w.crude).toBe(12);
    expect(w.fuel).toBe(0);
    // la raffinerie traite 12 barils par jour (tant qu'il y a du brut) et en tire 9 de carburant
    let spot: number[] | null = null;
    for (let z = 10; z < N - 10 && !spot; z++) for (let x = 10; x < N - 10 && !spot; x++) if (w.canPlace('refinery', x, z) === null) spot = [x, z];
    w.place('refinery', spot![0], spot![1], 0, true, 4, false);
    expect(ex.daily()).toMatchObject({ crude: 0, fuel: 9 });
    day();
    expect(w.crude).toBeGreaterThanOrEqual(11);
    expect(w.crude).toBeLessThanOrEqual(13);
    expect(w.fuel).toBeGreaterThanOrEqual(8);
    expect(w.fuel).toBeLessThanOrEqual(10);
    // sans puits, elle finit le brut en réserve, puis s'arrête
    for (const b of wells) w.removeBuilding(b.id);
    for (let i = 0; i < 3; i++) day();
    const fuel = w.fuel;
    expect(w.crude).toBe(0);
    expect(fuel).toBeGreaterThan(15);
    day();
    expect(w.fuel).toBe(fuel);
    // brut et carburant se sauvegardent
    w.crude = 7;
    const r = new World();
    r.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
    expect([r.crude, r.fuel]).toEqual([7, fuel]);
  });

  it('un choix qui roule au carburant le demande avant de partir, et le prend au départ', () => {
    const w = continent();
    const [x, z] = flatLand(w);
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 0], [4, 2]]) if (w.canPlace('house', x + dx, z + dz) === null) w.place('house', x + dx, z + dz, 0, true, 4, false);
    const agents = new Agents(w);
    for (let i = 0; i < 20; i++) agents.update(0.1, 10, 4, false, 30, 0);
    const ex = new Expeditions(w, agents, () => 100, () => 0.99);
    const herd = MISSIONS.find((m) => m.id === 'herd')!, m = { ...herd, choices: [{ ...herd.choices[0], fuel: 12, mounts: 0 }] }, c = m.choices[0];
    expect(ex.why(m, c)).toMatch(/12 carburant.*0 pour l’instant.*raffinerie/);
    expect(ex.preview(c).label).toMatch(/12 carburant/);
    w.fuel = 20;
    expect(ex.why(m, c)).toBeNull();
    expect(ex.start(m, 0, 4)).not.toBeNull();
    expect(w.fuel).toBe(8);
    // en ressources illimitées, le carburant ne manque jamais
    w.unlimited = true;
    w.fuel = 0;
    expect(ex.why({ ...m, id: 'herd2' }, c) ?? '').not.toMatch(/carburant/);
  });

});
