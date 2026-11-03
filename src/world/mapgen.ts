import { World, N, VEG_FOREST, VEG_ROCKS, VEG_CAVE, VEG_WRECK, VEG_FISSURE, VEG_VOLCANO, MIN_H, MAX_H, TREE_LINE, MOUNTAIN_H, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH } from './world';
import { raiseVolcano } from './terraform';
import { Simplex } from './noise';
import { mulberry32, smoothstep, clamp, lerp, hash2 } from '../core/rng';
import { GEN, GEN_FIXED, continentPlan, fixedHeight, plannedHeight } from './continent';

/** Carte jouable : `size` cases de côté */
export interface MapDef { id: number; name: string; desc: string; defaultSeed: number; size: number }

/** La carte jouable : le continent (il garde le numéro 3, celui des sauvegardes déjà faites) */
export const CONTINENT = 3;
export const MAPS: MapDef[] = [
  { id: CONTINENT, name: 'Continent', desc: 'Un grand continent, différent à chaque partie : plateaux, montagnes et rivière, île volcanique, grand lac, mesas et archipel.', defaultSeed: 2026, size: 192 },
];
/** La carte de ce numéro (null : une carte qui n'existe plus) */
export const mapDef = (id: number) => MAPS.find((m) => m.id === id) ?? null;
/** Graine d'une nouvelle partie : chacune a son continent (`defaultSeed` ne sert plus qu'aux tests et en secours) */
export const newSeed = () => Math.floor(Math.random() * 100000) + 1;

/**
 * Relief du continent pour une graine, selon la version du générateur (`GEN` pour une nouvelle partie) : la version 1 garde
 * ses contrées à la même place, la version 2 les place selon le plan tiré de la graine
 */
export function genHeights(mapId: number, seed: number, gen = GEN): Float32Array {
  const N = (mapDef(mapId) ?? MAPS[0]).size;
  const hts = new Float32Array((N + 1) * (N + 1));
  const s = new Simplex(seed);
  const s2 = new Simplex(seed * 7 + 13);
  if (gen === GEN_FIXED) {
    const rnd = mulberry32(seed);
    const phase = rnd() * 6.28;
    for (let z = 0; z <= N; z++)
      for (let x = 0; x <= N; x++) hts[z * (N + 1) + x] = clamp(fixedHeight(x, z, N, s, s2, phase), MIN_H, MAX_H);
    return hts;
  }
  const plan = continentPlan(seed);
  for (let z = 0; z <= N; z++)
    for (let x = 0; x <= N; x++) hts[z * (N + 1) + x] = clamp(plannedHeight(x, z, N, s, s2, plan), MIN_H, MAX_H);
  return hts;
}

export function newWorld(world: World, mapId: number, seed: number, gen = GEN) {
  world.mapId = mapId;
  world.seed = seed;
  world.gen = gen;
  const plan = gen === GEN_FIXED ? null : continentPlan(seed);
  const heights = genHeights(mapId, seed, gen);
  world.restore({ heights, road: new Uint8Array(N * N), veg: new Uint8Array(N * N), buildings: [], nextId: 1 });
  world.oil.fill(0);
  world.computeBiomes();
  shapeBiomes(world, seed, plan ? plan.wind : null);
  world.computeBiomes();
  // forêts plus ou moins denses selon le biome (cactus clairsemés au désert, forêt dense en taïga et sous les tropiques)
  const dense = [0.12, 0, 0.42, 0.04, 0.1];
  const s = new Simplex(seed + 99);
  const rnd = mulberry32(seed + 5);
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const a = world.cellAvg(x, z), slope = world.cellSlope(x, z), b = world.biome[world.ci(x, z)];
      if (a < 0.12) continue;
      const r = s.fbm(x * 0.2 + 40, z * 0.2, 2);
      // rocaille : sommets, pentes raides, quelques plages, plus fréquente au désert
      const rocky = b === BIOME_DESERT ? 0.35 : b === BIOME_TAIGA ? 0.2 : 0.12;
      if ((a > 4.3 && r > 0 && rnd() < 0.3) || (slope > 0.8 && slope <= 1 && rnd() < rocky) || (a < 0.45 && r > 0.62 && b !== BIOME_TROPICAL)) { world.veg[world.ci(x, z)] = VEG_ROCKS; continue; }
      // au-dessus de la limite des arbres : alpages, éboulis et neige
      if (a > TREE_LINE) continue;
      if (a < 0.45 && b !== BIOME_TROPICAL && b !== BIOME_MARSH) continue;
      const n = s.fbm(x * 0.14, z * 0.14, 3);
      if (n > dense[b] && rnd() < (b === BIOME_DESERT ? 0.35 : 0.8)) world.veg[world.ci(x, z)] = VEG_FOREST;
      else if (n > dense[b] - 0.17 && rnd() < 0.04) world.veg[world.ci(x, z)] = VEG_FOREST;
    }
  world.vegDirty = true;
  // sanitize (pentes)
  world.sanitize(0, 0, N, N);
  // le volcan, au cœur de l'île volcanique
  if (plan) raiseVolcano(world, N * plan.volcano.u, N * plan.volcano.v, 5.5);
  else raiseVolcano(world, N * 0.22, N * 0.8, 5.5);
  carveTarns(world, seed, !!plan);
  addDefaultDecor(world, seed);
}

/**
 * Lacs de montagne : quelques cuvettes creusées sur des replats d'altitude, fermées à l'aval par un bourrelet de moraine ;
 * l'eau s'y pose d'elle-même (les creux du relief se remplissent jusqu'à leur point de débordement). `dry` (version 2) : pas
 * de cuvette près de l'eau, où sa moraine barrerait le lit d'une rivière
 */
function carveTarns(world: World, seed: number, dry: boolean) {
  const rnd = mulberry32(seed + 77), S = N + 1, want = 5;
  const volcanoes: number[] = [];
  for (let k = 0; k < N * N; k++) if (world.veg[k] === VEG_VOLCANO) volcanoes.push(k);
  const cand: number[] = [];
  for (let z = 5; z <= N - 5; z++)
    for (let x = 5; x <= N - 5; x++) {
      const h = world.h(x, z);
      if (h < 4 || h > 8.5) continue;
      let slope = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) slope = Math.max(slope, Math.abs(world.h(x + dx, z + dz) - h));
      if (slope > 0.9 || volcanoes.some((k) => Math.hypot((k % N) - x, Math.floor(k / N) - z) < 14)) continue;
      if (dry && world.waterDist[Math.min(N - 1, z) * N + Math.min(N - 1, x)] < 8) continue;
      cand.push(z * S + x);
    }
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const picked: number[] = [];
  for (const c of cand) {
    if (picked.length >= want) break;
    if (picked.every((p) => Math.hypot((p % S) - (c % S), Math.floor(p / S) - Math.floor(c / S)) > 14)) picked.push(c);
  }
  for (const c of picked) {
    const x0 = c % S, z0 = Math.floor(c / S), h0 = world.heights[c], R = 2.4 + rnd() * 0.8, D = 1.1 + rnd() * 0.4, L = R + 2;
    for (let z = Math.max(0, z0 - Math.ceil(L)); z <= Math.min(N, z0 + Math.ceil(L)); z++)
      for (let x = Math.max(0, x0 - Math.ceil(L)); x <= Math.min(N, x0 + Math.ceil(L)); x++) {
        const d = Math.hypot(x - x0, z - z0), i = z * S + x;
        if (d < R) world.heights[i] = Math.min(world.heights[i], h0 - D * (1 - (d / R) ** 2));
        else if (d < L) world.heights[i] = Math.min(MAX_H, Math.max(world.heights[i], h0 + 0.15 - (d - R) * 0.6));
      }
    // ni arbres ni rochers au fond de l'eau
    for (let z = Math.max(0, z0 - 3); z < Math.min(N, z0 + 3); z++)
      for (let x = Math.max(0, x0 - 3); x < Math.min(N, x0 + 3); x++)
        if (Math.hypot(x + 0.5 - x0, z + 0.5 - z0) < R && world.veg[world.ci(x, z)] < VEG_CAVE) world.veg[world.ci(x, z)] = 0;
    world.markTerrain(x0 - L - 1, z0 - L - 1, x0 + L, z0 + L);
  }
  if (picked.length) world.vegDirty = true;
}

/** Relief propre aux biomes : mares dans les marais, dunes au désert, en travers du vent `wind` (null : celui de la version 1) */
function shapeBiomes(world: World, seed: number, wind: number | null) {
  const pond = new Simplex(seed + 313), dune = new Simplex(seed + 317);
  const wx = wind === null ? 0.55 : Math.cos(wind) * 0.6, wz = wind === null ? 0.25 : Math.sin(wind) * 0.6;
  const biomeNear = (x: number, z: number, b: number) => {
    // un sommet appartient au biome si les quatre cases qui le touchent en font partie
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (!world.inCells(x + dx, z + dz) || world.biome[world.ci(x + dx, z + dz)] !== b) return false;
    return true;
  };
  for (let z = 1; z < N; z++)
    for (let x = 1; x < N; x++) {
      const i = world.vi(x, z), h = world.heights[i];
      if (biomeNear(x, z, BIOME_MARSH) && h < 1.2) {
        const p = pond.fbm(x * 0.22, z * 0.22, 2);
        if (p > 0.18) world.heights[i] = Math.min(h, lerp(0.1, -0.8, smoothstep(0.18, 0.38, p)));
        else world.heights[i] = lerp(h, 0.3, 0.5);
      } else if (biomeNear(x, z, BIOME_DESERT) && h > 0.4) {
        // longues ondulations de dunes, orientées par le vent
        const ph = (x * wx + z * wz) + dune.fbm(x * 0.05, z * 0.05, 2) * 4;
        world.heights[i] = Math.min(MAX_H, h + (Math.sin(ph) * 0.5 + 0.5) ** 2 * 0.45);
      }
    }
  world.markTerrainAll();
}

/**
 * Décors présents d'office : une ou deux grottes au pied des collines, failles en terrain plat (entrées du monde souterrain)
 * et quelques épaves au bord de l'eau, ajoutés à toute carte qui n'en a pas (y compris les anciennes sauvegardes)
 */
export function addDefaultDecor(world: World, seed: number) {
  const rnd = mulberry32(seed + 77);
  world.computeBiomes();
  world.computeDecor();
  /** `prefer` : les cases qui le vérifient passent en premier (tirage au sort à l'intérieur de chaque groupe) */
  const pick = (type: number, max: number, spacing: number, ok: (x: number, z: number) => boolean, prefer?: (x: number, z: number) => boolean) => {
    if (world.veg.includes(type)) return;
    const cand: number[] = [];
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) if (ok(x, z)) cand.push(z * N + x);
    for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
    if (prefer) {
      const pref = (k: number) => (prefer(k % N, Math.floor(k / N)) ? 1 : 0);
      cand.sort((a, b) => pref(b) - pref(a));
    }
    const placed: number[] = [];
    for (const k of cand) {
      if (placed.length >= max) break;
      const x = k % N, z = Math.floor(k / N);
      if (placed.some((p) => Math.hypot((p % N) - x, Math.floor(p / N) - z) < spacing)) continue;
      if (world.setVeg(x, z, type)) placed.push(k);
    }
  };
  const free = (x: number, z: number) => !world.occ[world.ci(x, z)] && !world.road[world.ci(x, z)];
  // grottes : deux au plus, éloignées l'une de l'autre, creusées de préférence dans un versant raide de colline ou de montagne
  pick(VEG_CAVE, 2, 30, (x, z) => free(x, z) && world.cellSlope(x, z) >= 0.25 && world.cellAvg(x, z) > 0.6 && world.cellAvg(x, z) < 5.5 && world.waterDist[z * N + x] >= 3,
    (x, z) => world.cellSlope(x, z) >= 0.7 && world.cellAvg(x, z) > 1.2);
  // failles : terrain assez plat, à l'écart de l'eau
  pick(VEG_FISSURE, 5, 20, (x, z) => free(x, z) && world.cellSlope(x, z) < 0.5 && world.cellAvg(x, z) > 0.5 && world.cellAvg(x, z) < 4 && world.waterDist[z * N + x] >= 6);
  // épave : eau peu profonde avec de la terre à côté
  pick(VEG_WRECK, 3, 14, (x, z) => {
    const a = world.cellAvg(x, z);
    if (!free(x, z) || a > 0.1 || a < -0.7) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => world.cellAvg(x + dx, z + dz) > 0.2);
  });
  addOilFields(world, seed);
}

/** Gisements de pétrole d'une carte, au plus, dont ceux qu'on tire d'abord au désert et au marais ; écart entre deux nappes */
const OIL_FIELDS = 7, OIL_DRY = 3, OIL_SPACING = 26;

/**
 * Gisements de pétrole : quelques nappes de brut qui suintent en surface (taches sombres et flaques luisantes), tirées de la
 * graine, posés sur toute carte qui n'en a pas (y compris les anciennes sauvegardes). D'abord au désert et au marais, puis
 * dans les plaines : une dizaine de cases chacune, en tache irrégulière, à l'écart l'une de l'autre, sur la terre ferme,
 * assez plate pour y forer, hors des grottes, des failles, des lacs et des bâtiments
 */
export function addOilFields(world: World, seed: number) {
  if (world.oil.includes(1)) return;
  // chaque case a son rang tiré de la graine (pas un tirage à la suite) : un relief à peine différent (celui, arrondi, d'une
  // sauvegarde) donne les mêmes nappes, ou presque
  const rank = (k: number) => hash2(k % N, Math.floor(k / N), seed + 4243), blob = new Simplex(seed + 4247);
  const ok = (x: number, z: number) => {
    if (x < 2 || z < 2 || x >= N - 2 || z >= N - 2) return false;
    const k = world.ci(x, z), h = world.cellAvg(x, z);
    return h > 0.35 && h < MOUNTAIN_H && world.cellSlope(x, z) < 0.6 && !world.decor[k] && !world.lake[k] && !world.occ[k] && !world.road[k]
      && world.veg[k] !== VEG_VOLCANO && world.waterDist[k] >= 2;
  };
  // centres possibles : une case sur trois, dont tout le voisinage proche est praticable
  const cand: number[] = [];
  for (let z = 4; z < N - 4; z += 3) for (let x = 4; x < N - 4; x += 3) if ([[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dz]) => ok(x + dx, z + dz))) cand.push(z * N + x);
  cand.sort((a, b) => rank(a) - rank(b));
  const dry = (k: number) => { const b = world.biome[k]; return b === BIOME_DESERT || b === BIOME_MARSH; };
  const centers: number[] = [];
  const take = (max: number, want: (k: number) => boolean) => {
    for (const k of cand) {
      if (centers.length >= max) break;
      if (!want(k) || centers.includes(k) || centers.some((c) => Math.hypot((c % N) - (k % N), Math.floor(c / N) - Math.floor(k / N)) < OIL_SPACING)) continue;
      centers.push(k);
    }
  };
  take(OIL_DRY, dry);
  take(OIL_FIELDS, () => true);
  // chaque nappe : une tache aux bords déchiquetés par le bruit, de deux à trois cases et demie de rayon
  for (const c of centers) {
    const cx = c % N, cz = Math.floor(c / N), R = 2.2 + hash2(cx, cz, seed + 4251) * 1.3;
    for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const d = Math.hypot(x - cx, z - cz) / R;
        if (d <= 1 && (d < 0.45 || 1 - d + blob.fbm(x * 0.45, z * 0.45, 2) * 0.6 > 0.25) && ok(x, z)) world.oil[world.ci(x, z)] = 1;
      }
  }
}
