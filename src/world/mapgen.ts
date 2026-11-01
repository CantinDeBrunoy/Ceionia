import { World, N, VEG_FOREST, VEG_ROCKS, VEG_CAVE, VEG_WRECK, VEG_FISSURE, VEG_VOLCANO, MIN_H, MAX_H, TREE_LINE, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH } from './world';
import { raiseVolcano } from './terraform';
import { Simplex } from './noise';
import { mulberry32, smoothstep, clamp, lerp } from '../core/rng';

/** Carte jouable : `size` cases de côté */
export interface MapDef { id: number; name: string; desc: string; defaultSeed: number; size: number }

export const MAPS: MapDef[] = [
  { id: 0, name: 'Île flottante', desc: 'Une grande île : taïga au nord, plages tropicales et volcan au sud.', defaultSeed: 1234, size: 96 },
  { id: 1, name: 'Vallée', desc: 'Une rivière qui descend des montagnes enneigées jusqu’au désert, entre marais et prairies.', defaultSeed: 4242, size: 96 },
  { id: 2, name: 'Plateaux', desc: 'Un archipel de plateaux et de falaises, des pics froids aux lagons chauds.', defaultSeed: 777, size: 96 },
  { id: 3, name: 'Continent', desc: 'Quatre fois plus grand : plateaux, montagnes et rivière, île volcanique, et en plus un grand lac, des mesas et un archipel.', defaultSeed: 2026, size: 192 },
];
const CONTINENT = 3;

/** Crêtes : 1 sur les lignes de crête, 0 dans les creux */
const ridge = (s: Simplex, x: number, z: number, f: number) => 1 - Math.abs(s.noise2(x * f, z * f));

export function genHeights(mapId: number, seed: number): Float32Array {
  // la taille de la carte demandée (le menu dessine les aperçus de toutes les cartes)
  const N = MAPS[mapId].size;
  const hts = new Float32Array((N + 1) * (N + 1));
  const s = new Simplex(seed);
  const s2 = new Simplex(seed * 7 + 13);
  const rnd = mulberry32(seed);
  const phase = rnd() * 6.28;
  for (let z = 0; z <= N; z++)
    for (let x = 0; x <= N; x++) {
      const u = x / N, v = z / N;
      let h = 0;
      if (mapId === CONTINENT) h = continentHeight(x, z, N, s, s2, phase);
      else if (mapId === 0) {
        const wx = x + s2.fbm(x * 0.05, z * 0.05, 2) * 6, wz = z + s2.fbm(x * 0.05 + 9, z * 0.05, 2) * 6;
        const d = Math.hypot(wx - N / 2, wz - N / 2) / (N / 2);
        h = 3.0 * (1 - Math.pow(d / 0.8, 2)) + s.fbm(x * 0.07, z * 0.07, 4) * 1.5 - 0.5;
        // chaîne de montagnes au nord de l'île
        h += smoothstep(0.42, 0.18, v) * smoothstep(0.12, 0.3, u) * smoothstep(0.88, 0.7, u) * (1.4 + 7.6 * Math.pow(ridge(s2, x, z, 0.08), 1.5));
        h = lerp(h, Math.min(h, -0.6), smoothstep(0.7, 0.95, d));
      } else if (mapId === 1) {
        const edge = Math.pow(Math.abs(u - 0.5) * 2, 2.2);
        h = 0.9 + s.fbm(x * 0.06, z * 0.06, 4) * 2.6 + edge * 3.2;
        // chaînes de montagnes sur les deux rives éloignées
        h += Math.pow(edge, 1.3) * (1 + 6.5 * Math.pow(ridge(s2, x, z, 0.09), 1.4));
        const rx = N * (0.5 + 0.17 * Math.sin(z * 0.11 + phase) + 0.05 * Math.sin(z * 0.27 + phase * 2));
        const dr = Math.abs(x - rx);
        const bank = Math.exp(-(dr * dr) / (2 * 6 * 6));
        h = lerp(h, 0.45, bank * 0.75);
        const river = Math.exp(-(dr * dr) / (2 * 1.9 * 1.9));
        h = lerp(h, -0.9, river);
      } else {
        const d = Math.hypot(u - 0.5, v - 0.5) * 2;
        let n = s.fbm(x * 0.045, z * 0.045, 3) * 1.3 + 0.62 - d * 0.55;
        n += s2.fbm(x * 0.12, z * 0.12, 2) * 0.03;
        const t = n * 3.4 - 0.5;
        const f = t - Math.floor(t);
        h = Math.floor(t) * 1.1 + smoothstep(0.86, 1, f) * 1.1;
        h = h > 0 ? h + 0.35 : h * 0.8 - 0.1;
      }
      hts[z * (N + 1) + x] = clamp(h, MIN_H, MAX_H);
    }
  if (mapId === 2) plateauPeaks(hts, N, s, s2);
  return hts;
}

/** Plateaux : quatre pics posés sur les plus hauts plateaux, loin les uns des autres (la graine décide où sont les terres) */
function plateauPeaks(hts: Float32Array, N: number, s: Simplex, s2: Simplex) {
  const S = N + 1, score = new Float32Array(hts.length), order: number[] = [];
  for (let i = 0; i < hts.length; i++) {
    const x = i % S, z = Math.floor(i / S);
    if (hts[i] < 1.4 || x < 6 || z < 6 || x > N - 6 || z > N - 6) continue;
    // les gradins sont plats : un bruit départage les sommets d'un même niveau
    score[i] = hts[i] + s.noise2(x * 0.3, z * 0.3) * 0.5;
    order.push(i);
  }
  order.sort((a, b) => score[b] - score[a]);
  const peaks: [number, number][] = [];
  for (const i of order) {
    const x = i % S, z = Math.floor(i / S);
    if (peaks.every(([px, pz]) => Math.hypot(x - px, z - pz) > N * 0.22)) peaks.push([x, z]);
    if (peaks.length === 4) break;
  }
  for (let i = 0; i < hts.length; i++) {
    if (hts[i] <= 0.5) continue;
    const x = i % S, z = Math.floor(i / S);
    let h = hts[i];
    for (const [px, pz] of peaks) {
      const dp = Math.hypot(x - px, z - pz);
      if (dp < 12) h += 7.6 * Math.exp(-(dp * dp) / (2 * 3.6 * 3.6)) * (0.7 + 0.4 * ridge(s2, x, z, 0.2));
    }
    hts[i] = Math.min(MAX_H, h);
  }
}

export function newWorld(world: World, mapId: number, seed: number) {
  world.mapId = mapId;
  world.seed = seed;
  const heights = genHeights(mapId, seed);
  world.restore({ heights, road: new Uint8Array(N * N), veg: new Uint8Array(N * N), buildings: [], nextId: 1 });
  world.computeBiomes();
  shapeBiomes(world, seed);
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
  // un volcan au sud-est de l'île, côté chaud, laissant la place au village au milieu ; sur le continent, au cœur de l'île volcanique
  if (mapId === 0) raiseVolcano(world, N * 0.7, N * 0.66, 4.6);
  else if (mapId === CONTINENT) raiseVolcano(world, N * 0.22, N * 0.8, 5.5);
  carveTarns(world, seed);
  addDefaultDecor(world, seed);
}

/**
 * Continent : les trois cartes réunies (plateaux en gradins au nord-ouest, montagnes enneigées et leur rivière comme dans
 * la vallée, île volcanique au sud-ouest) et de nouvelles contrées : grand lac et son îlot, mesas du désert, archipel tropical
 */
function continentHeight(x: number, z: number, n: number, s: Simplex, s2: Simplex, phase: number) {
  const u = x / n, v = z / n;
  // coordonnées déformées : côtes, rives du lac et bords des contrées découpés
  const wu = u + s2.fbm(x * 0.012, z * 0.012, 3) * 0.13, wv = v + s2.fbm(x * 0.012 + 31, z * 0.012, 3) * 0.13;
  const ru = u + s.fbm(x * 0.03 + 17, z * 0.03, 2) * 0.035, rv = v + s.fbm(x * 0.03, z * 0.03 + 17, 2) * 0.035;
  /** 1 au cœur d'une contrée (centre cu, cv, rayon r en part de carte), 0 au-delà */
  const zone = (cu: number, cv: number, r: number) => smoothstep(1, 0.55, Math.hypot(ru - cu, rv - cv) / r);
  const d = Math.hypot((wu - 0.5) / 0.45, (wv - 0.47) / 0.43);
  let h = 0.9 + s.fbm(x * 0.03, z * 0.03, 4) * 1.6 + (1 - d) * 1.4;
  // montagnes enneigées au nord-est, où naît la rivière : massif plus haut en son cœur, grandes crêtes hérissées de pics
  const mnt = zone(0.7, 0.18, 0.26);
  if (mnt > 0) {
    const big = Math.pow(ridge(s2, x, z, 0.05), 1.5), peaks = Math.pow(ridge(s, x + 40, z, 0.13), 2) * (0.35 + 0.65 * big);
    h += mnt * (2.2 + mnt * 1.6 + 7.2 * big * (0.75 + 0.35 * s.fbm(x * 0.02 + 5, z * 0.02, 2)) + 3 * peaks);
  }
  // plateaux en gradins et falaises au nord-ouest
  const pla = zone(0.22, 0.26, 0.22);
  if (pla > 0) {
    const t = (1.4 + s.fbm(x * 0.045, z * 0.045, 3) * 1.6) * 1.5, f = t - Math.floor(t);
    h = lerp(h, Math.floor(t) * 1.1 + smoothstep(0.86, 1, f) * 1.1 + 0.4, pla);
  }
  // mesas du désert à l'est : tables à sommet plat, flancs abrupts
  const mes = zone(0.83, 0.55, 0.17);
  if (mes > 0) {
    const m = s2.fbm(x * 0.06 + 11, z * 0.06, 2);
    h = lerp(h, 0.9 + smoothstep(0.04, 0.12, m) * 2.6 + s.fbm(x * 0.1, z * 0.1, 2) * 0.15, mes);
  }
  // grand lac à l'ouest, avec un îlot boisé
  const lake = smoothstep(0.35, 0.85, zone(0.3, 0.55, 0.13)), islet = zone(0.285, 0.53, 0.028);
  h = lerp(h, lerp(-0.9, 1.1, islet), lake);
  // collines de l'île volcanique au sud-ouest (le volcan est ajouté ensuite)
  h += zone(0.22, 0.8, 0.16) * 0.8 * s.fbm(x * 0.07, z * 0.07, 3);
  // mer tout autour
  h = lerp(h, Math.min(h, -1), smoothstep(0.92, 1.08, d));
  // archipel au sud-est : îles semées dans la mer
  const arch = zone(0.84, 0.86, 0.15);
  if (arch > 0) {
    const a = s2.fbm(x * 0.09 + 70, z * 0.09, 3);
    h = Math.max(h, lerp(-1, smoothstep(0.1, 0.3, a) * (1.3 + a * 2) - 0.2, arch));
  }
  // rivière : des montagnes jusqu'à la côte sud, à travers les prairies
  if (v > 0.14) {
    const rx = n * (0.62 - (v - 0.16) * 0.12 + 0.05 * Math.sin(z * 0.045 + phase) + 0.02 * Math.sin(z * 0.11 + phase * 2));
    const dr = Math.abs(x - rx), w = smoothstep(0.14, 0.22, v);
    h = lerp(h, Math.min(h, 0.5), Math.exp(-(dr * dr) / (2 * 7 * 7)) * 0.7 * w);
    h = lerp(h, -0.9, Math.exp(-(dr * dr) / (2 * 2.1 * 2.1)) * w);
  }
  return h;
}

/**
 * Lacs de montagne : quelques cuvettes creusées sur des replats d'altitude, fermées à l'aval par un bourrelet de moraine ;
 * l'eau s'y pose d'elle-même (les creux du relief se remplissent jusqu'à leur point de débordement)
 */
function carveTarns(world: World, seed: number) {
  const rnd = mulberry32(seed + 77), S = N + 1, want = world.mapId === CONTINENT ? 5 : 2;
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

/** Relief propre aux biomes : mares dans les marais, dunes au désert */
function shapeBiomes(world: World, seed: number) {
  const pond = new Simplex(seed + 313), dune = new Simplex(seed + 317);
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
        const ph = (x * 0.55 + z * 0.25) + dune.fbm(x * 0.05, z * 0.05, 2) * 4;
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
  pick(VEG_FISSURE, world.mapId === CONTINENT ? 5 : 3, 20, (x, z) => free(x, z) && world.cellSlope(x, z) < 0.5 && world.cellAvg(x, z) > 0.5 && world.cellAvg(x, z) < 4 && world.waterDist[z * N + x] >= 6);
  // épave : eau peu profonde avec de la terre à côté
  pick(VEG_WRECK, 3, 14, (x, z) => {
    const a = world.cellAvg(x, z);
    if (!free(x, z) || a > 0.1 || a < -0.7) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => world.cellAvg(x + dx, z + dz) > 0.2);
  });
}
