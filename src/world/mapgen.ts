import { World, N, VEG_FOREST, VEG_ROCKS, VEG_CAVE, VEG_WRECK, VEG_FISSURE, VEG_VOLCANO, MIN_H, MAX_H, TREE_LINE, MOUNTAIN_H, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH } from './world';
import { raiseVolcano } from './terraform';
import { addPortalIsland } from './portal';
import { Simplex } from './noise';
import { mulberry32, smoothstep, clamp, lerp, hash2 } from '../core/rng';
import { localize } from '../i18n';
import { GEN, GEN_FIXED, GEN_PLAN, GEN_VAR, continentPlan, fixedHeight, plannedHeight, toPlan, fromPlan } from './continent';

/** Carte jouable : `size` cases de côté */
export interface MapDef { id: number; name: string; desc: string; defaultSeed: number; size: number }

/** La carte jouable : le continent (il garde le numéro 3, celui des sauvegardes déjà faites) */
export const CONTINENT = 3;
export const MAPS: MapDef[] = [
  { id: CONTINENT, name: 'Continent', desc: 'Un grand continent, différent à chaque partie : plateaux, montagnes et rivière, île volcanique, grand lac, mesas et archipel.', defaultSeed: 2026, size: 192 },
];
for (const m of MAPS) localize(m, ['name', 'desc']);
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
  const plan = continentPlan(seed, gen);
  for (let z = 0; z <= N; z++)
    for (let x = 0; x <= N; x++) {
      // chaque sommet prend la hauteur de son point du plan, tourné ou retourné (version 3)
      const [px, pz] = toPlan(plan.orient, x, z, N);
      hts[z * (N + 1) + x] = clamp(plannedHeight(px, pz, N, s, s2, plan), MIN_H, MAX_H);
    }
  return hts;
}

/**
 * Crée le monde d'une graine. Sans `gen`, c'est le continent de référence des tests (version 2, qui ne bouge plus) ; une
 * nouvelle partie passe `GEN`
 */
export function newWorld(world: World, mapId: number, seed: number, gen = GEN_PLAN) {
  world.mapId = mapId;
  world.seed = seed;
  world.gen = gen;
  const plan = gen === GEN_FIXED ? null : continentPlan(seed, gen), v3 = gen >= GEN_VAR;
  const heights = genHeights(mapId, seed, gen);
  world.restore({ heights, road: new Uint8Array(N * N), veg: new Uint8Array(N * N), cleared: new Uint8Array(N * N), rift: new Uint8Array(N * N), buildings: [], nextId: 1 });
  world.oil.fill(0);
  world.decorDone = false;
  world.computeBiomes();
  shapeBiomes(world, seed, plan ? plan.wind : null);
  if (v3) carveCanyon(world, mulberry32(seed + 61));
  world.computeBiomes();
  // forêts plus ou moins denses selon le biome (cactus clairsemés au désert, forêt dense en taïga et sous les tropiques) ;
  // version 3 : chaque partie a ses forêts, plus ou moins étendues ; de vrais massifs pleins, séparés par des plaines
  // dégagées (bruit lent, presque toutes les cases boisées au-dessus du seuil, une lisière étroite)
  const vary = mulberry32(seed + 6), dOff = v3 ? (vary() - 0.5) * 0.26 : 0, fq = v3 ? lerp(0.022, 0.038, vary()) : 0.14;
  // (version 3 : seuil abaissé de 0,12, la forêt couvre environ la moitié des terres boisables)
  const dense = [0.12, 0, 0.42, 0.04, 0.1].map((d, b) => d + dOff - (v3 && b !== BIOME_DESERT ? 0.12 : 0));
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
      const n = s.fbm(x * fq, z * fq, 3);
      if (n > dense[b] && rnd() < (b === BIOME_DESERT ? 0.35 : v3 ? 0.97 : 0.8)) world.veg[world.ci(x, z)] = VEG_FOREST;
      else if (v3 ? n > dense[b] - 0.04 && rnd() < 0.35 : n > dense[b] - 0.17 && rnd() < 0.04) world.veg[world.ci(x, z)] = VEG_FOREST;
    }
  if (v3) { gatherForests(world); addGroves(world, vary); rockyBanks(world, mulberry32(seed + 93)); }
  world.vegDirty = true;
  // sanitize (pentes)
  world.sanitize(0, 0, N, N);
  // le volcan, au cœur de l'île volcanique
  if (plan) { const [vx, vz] = fromPlan(plan.orient, N * plan.volcano.u, N * plan.volcano.v, N); raiseVolcano(world, vx, vz, 5.5); }
  else raiseVolcano(world, N * 0.22, N * 0.8, 5.5);
  if (v3) forestHearts(world, mulberry32(seed + 57));
  if (!v3) carveTarns(world, seed, !!plan);
  else {
    // lacs de montagne et étangs de plaine, plus ou moins nombreux
    const lr = mulberry32(seed + 81);
    carveTarns(world, seed, true, 2 + Math.floor(lr() * 6));
    world.computeBiomes();
    carveTarns(world, seed + 1, true, Math.floor(lr() * 5), 1, 3.2, 0.6);
  }
  addDefaultDecor(world, seed);
  // l'île du portail, au large, une fois le continent achevé (pas sur le continent figé de la version 1, qui ne change plus)
  if (plan) addPortalIsland(world, seed);
  if (v3) clearStart(world);
}

/** La place du village (3 × 3, `startSpot`) et une case autour : ni arbres ni rochers à abattre au début d'une partie */
function clearStart(world: World) {
  const [sx, sz] = world.startSpot();
  let cut = false;
  for (let z = sz - 1; z <= sz + 3; z++)
    for (let x = sx - 1; x <= sx + 3; x++) {
      if (!world.inCells(x, z)) continue;
      const k = world.ci(x, z);
      if (world.veg[k] === VEG_FOREST || world.veg[k] === VEG_ROCKS) { world.veg[k] = 0; cut = true; }
    }
  if (cut) world.vegDirty = true;
}

/**
 * Forêts d'un seul tenant (version 3) : deux passes de lissage (une case entourée d'arbres se boise, une case boisée presque
 * seule redevient prairie), puis les îlots de moins de 20 cases disparaissent. Il reste des massifs nets et des plaines
 * dégagées, au lieu d'un semis d'arbres partout
 */
function gatherForests(world: World) {
  const wooded = (x: number, z: number) => world.inCells(x, z) && world.veg[world.ci(x, z)] === VEG_FOREST;
  const next = new Uint8Array(N * N);
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const k = world.ci(x, z);
        let n = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && wooded(x + dx, z + dz)) n++;
        const v = world.veg[k], a = world.cellAvg(x, z), b = world.biome[k];
        // (les cactus du désert restent clairsemés)
        if (v === VEG_FOREST) next[k] = n <= 2 && b !== BIOME_DESERT ? 0 : 1;
        else next[k] = !v && n >= 5 && a >= 0.45 && a <= TREE_LINE && b !== BIOME_DESERT && world.cellSlope(x, z) <= 1.2 ? 1 : 2;
      }
    for (let k = 0; k < N * N; k++) {
      if (next[k] === 1) world.veg[k] = VEG_FOREST;
      else if (next[k] === 0) world.veg[k] = 0;
    }
  }
  // îlots trop petits
  const seen = new Uint8Array(N * N);
  for (let k0 = 0; k0 < N * N; k0++) {
    if (seen[k0] || world.veg[k0] !== VEG_FOREST) continue;
    const cells = [k0];
    seen[k0] = 1;
    for (let i = 0; i < cells.length; i++) {
      const x = cells[i] % N, z = Math.floor(cells[i] / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!wooded(x + dx, z + dz)) continue;
        const j = world.ci(x + dx, z + dz);
        if (!seen[j]) { seen[j] = 1; cells.push(j); }
      }
    }
    if (cells.length < 20 && world.biome[k0] !== BIOME_DESERT) for (const k of cells) world.veg[k] = 0;
  }
}

/**
 * Cœur des forêts (version 3) : au milieu des grands massifs, de petites mares dans une clairière (en plaine, l'eau affleure
 * sous le niveau de la mer ; en altitude, un creux qui devient un petit lac) et des affleurements de rochers. Une case est
 * « au cœur » si toutes les cases à deux pas sont boisées
 */
function forestHearts(world: World, rnd: () => number) {
  const S = N + 1, heart: number[] = [];
  const wooded = (x: number, z: number) => world.inCells(x, z) && world.veg[world.ci(x, z)] === VEG_FOREST;
  for (let z = 3; z < N - 3; z++)
    for (let x = 3; x < N - 3; x++) {
      const b = world.biome[world.ci(x, z)];
      if (b === BIOME_DESERT || b === BIOME_MARSH || !wooded(x, z) || world.cellSlope(x, z) > 0.6) continue;
      let all = true;
      for (let dz = -2; dz <= 2 && all; dz++) for (let dx = -2; dx <= 2 && all; dx++) all = wooded(x + dx, z + dz);
      if (all) heart.push(z * N + x);
    }
  for (let i = heart.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [heart[i], heart[j]] = [heart[j], heart[i]]; }
  const ponds = Math.min(14, Math.round(heart.length / 160)), outcrops = Math.min(18, Math.round(heart.length / 110));
  const used: number[] = [];
  const far = (k: number, d: number) => used.every((u) => Math.hypot((u % N) - (k % N), Math.floor(u / N) - Math.floor(k / N)) > d);
  let madePonds = 0, madeRocks = 0;
  for (const k of heart) {
    if (madePonds >= ponds && madeRocks >= outcrops) break;
    const x0 = k % N, z0 = Math.floor(k / N), h0 = world.cellAvg(x0, z0);
    const low = h0 < 0.9, high = h0 > 2.8 && h0 < TREE_LINE - 0.3;
    if (madePonds < ponds && (low || high) && far(k, 10)) {
      // mare : fond plat sous l'eau, berges en pente douce ; une petite clairière autour
      // (contour irrégulier : le rayon ondule avec l'angle)
      const cx = x0 + 0.5, cz = z0 + 0.5, R0 = (low ? 1.6 : 2) + rnd() * 0.9, bottom = low ? -0.8 : h0 - 0.9;
      const p1 = rnd() * 6.28, p2 = rnd() * 6.28, a1 = 0.12 + rnd() * 0.12, a2 = 0.06 + rnd() * 0.1, R = R0 * (1 + a1 + a2);
      for (let z = Math.max(0, Math.floor(cz - R)); z <= Math.min(N, Math.ceil(cz + R)); z++)
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(N, Math.ceil(cx + R)); x++) {
          const t = Math.atan2(z - cz, x - cx), r = R0 * (1 + a1 * Math.sin(2 * t + p1) + a2 * Math.sin(3 * t + p2));
          const d = Math.hypot(x - cx, z - cz), i = z * S + x;
          if (d < r) world.heights[i] = Math.min(world.heights[i], lerp(bottom, world.heights[i], smoothstep(r * 0.35, r, d)));
        }
      for (let z = Math.floor(cz - R - 1); z <= Math.ceil(cz + R); z++)
        for (let x = Math.floor(cx - R - 1); x <= Math.ceil(cx + R); x++)
          if (world.inCells(x, z) && Math.hypot(x + 0.5 - cx, z + 0.5 - cz) < R + 0.4 && world.veg[world.ci(x, z)] === VEG_FOREST) world.veg[world.ci(x, z)] = 0;
      world.markTerrain(cx - R - 1, cz - R - 1, cx + R + 1, cz + R + 1);
      used.push(k); madePonds++;
    } else if (madeRocks < outcrops && far(k, 6)) {
      // affleurement : deux à quatre cases de rochers serrées, au milieu des arbres
      const n = 2 + Math.floor(rnd() * 3);
      let x = x0, z = z0;
      for (let i = 0; i < n; i++) {
        if (wooded(x, z)) world.veg[world.ci(x, z)] = VEG_ROCKS;
        const dir = Math.floor(rnd() * 4);
        x += dir === 0 ? 1 : dir === 1 ? -1 : 0; z += dir === 2 ? 1 : dir === 3 ? -1 : 0;
      }
      used.push(k); madeRocks++;
    }
  }
  if (madePonds || madeRocks) world.vegDirty = true;
}

/**
 * Bosquets (version 3) : quelques touffes d'arbres semées dans les prés, hors des forêts, du désert et des hauteurs, pour que
 * les clairières ne se ressemblent pas d'une partie à l'autre
 */
function addGroves(world: World, rnd: () => number) {
  const want = 2 + Math.floor(rnd() * 5);
  for (let i = 0, made = 0; i < want * 30 && made < want; i++) {
    const cx = 4 + Math.floor(rnd() * (N - 8)), cz = 4 + Math.floor(rnd() * (N - 8)), k = world.ci(cx, cz), a = world.cellAvg(cx, cz);
    if (world.veg[k] || a < 0.5 || a > TREE_LINE - 0.5 || world.cellSlope(cx, cz) > 0.7 || world.biome[k] === BIOME_DESERT) continue;
    const R = 1 + rnd() * 1.8;
    for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        if (!world.inCells(x, z) || Math.hypot(x - cx, z - cz) > R || rnd() > 0.75) continue;
        const j = world.ci(x, z), h = world.cellAvg(x, z);
        if (!world.veg[j] && h > 0.45 && h < TREE_LINE && world.cellSlope(x, z) <= 0.8) world.veg[j] = VEG_FOREST;
      }
    made++;
  }
}

/**
 * Rives du lit de cailloux (version 3) : une case de rive sur trois environ, au bord de l'eau, devient de la rocaille (on peut
 * l'enlever, elle sert aux carrières) ; les rochers du lit lui-même ne sont qu'un décor (`VegView.riverbed`)
 */
function rockyBanks(world: World, rnd: () => number) {
  for (let z = 1; z < N - 1; z++)
    for (let x = 1; x < N - 1; x++) {
      const k = world.ci(x, z), a = world.cellAvg(x, z);
      if (world.bed[k] < 40 || a < 0.12 || a > 3.5 || world.cellSlope(x, z) > 1 || (world.veg[k] && world.veg[k] !== VEG_FOREST)) continue;
      let wet = false;
      for (let dz = -1; dz <= 1 && !wet; dz++) for (let dx = -1; dx <= 1; dx++) if (world.cellAvg(x + dx, z + dz) < -0.05) { wet = true; break; }
      if (wet && rnd() < 0.35 * (world.bed[k] / 255)) world.veg[k] = VEG_ROCKS;
    }
}

/**
 * Lacs de montagne : quelques cuvettes creusées sur des replats d'altitude, fermées à l'aval par un bourrelet de moraine ;
 * l'eau s'y pose d'elle-même (les creux du relief se remplissent jusqu'à leur point de débordement). `dry` (version 2) : pas
 * de cuvette près de l'eau, où sa moraine barrerait le lit d'une rivière. Version 3 : `want` cuvettes, entre les hauteurs
 * `lo` et `hi` (des étangs en plaine), de taille `k` fois celle d'un lac de montagne
 */
function carveTarns(world: World, seed: number, dry: boolean, want = 5, lo = 4, hi = 8.5, k = 1) {
  const rnd = mulberry32(seed + 77), S = N + 1;
  if (want <= 0) return;
  const volcanoes: number[] = [];
  for (let k = 0; k < N * N; k++) if (world.veg[k] === VEG_VOLCANO) volcanoes.push(k);
  const cand: number[] = [];
  for (let z = 5; z <= N - 5; z++)
    for (let x = 5; x <= N - 5; x++) {
      const h = world.h(x, z);
      if (h < lo || h > hi) continue;
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
    const x0 = c % S, z0 = Math.floor(c / S), h0 = world.heights[c], R = (2.4 + rnd() * 0.8) * (k === 1 ? 1 : k + rnd() * 0.8), D = 1.1 + rnd() * 0.4, L = R + 2;
    for (let z = Math.max(0, z0 - Math.ceil(L)); z <= Math.min(N, z0 + Math.ceil(L)); z++)
      for (let x = Math.max(0, x0 - Math.ceil(L)); x <= Math.min(N, x0 + Math.ceil(L)); x++) {
        const d = Math.hypot(x - x0, z - z0), i = z * S + x;
        if (d < R) world.heights[i] = Math.min(world.heights[i], h0 - D * (1 - (d / R) ** 2));
        else if (d < L) world.heights[i] = Math.min(MAX_H, Math.max(world.heights[i], h0 + 0.15 - (d - R) * 0.6));
      }
    // ni arbres ni rochers au fond de l'eau
    const C = k === 1 ? 3 : Math.ceil(R);
    for (let z = Math.max(0, z0 - C); z < Math.min(N, z0 + C); z++)
      for (let x = Math.max(0, x0 - C); x < Math.min(N, x0 + C); x++)
        if (Math.hypot(x + 0.5 - x0, z + 0.5 - z0) < R && world.veg[world.ci(x, z)] < VEG_CAVE) world.veg[world.ci(x, z)] = 0;
    world.markTerrain(x0 - L - 1, z0 - L - 1, x0 + L, z0 + L);
  }
  if (picked.length) world.vegDirty = true;
}

/**
 * Canyon du désert (version 3) : une longue gorge sinueuse entre deux plateaux. Le tracé part d'une case de désert sèche et
 * serpente tant qu'il reste au désert, loin de l'eau ; on garde le plus long de quelques essais (au moins 24 cases). De part
 * et d'autre, la roche se dresse en plateau (2,4 au-dessus du fond), parois abruptes que le rendu teint de grès rouge strié ;
 * au milieu, un fond plat d'environ deux cases et demie, à la hauteur du désert alentour (lissée le long du tracé). Aux deux
 * bouts, le plateau s'abaisse et la gorge s'ouvre sur le désert
 */
function carveCanyon(world: World, rnd: () => number) {
  const S = N + 1;
  const desertAt = (x: number, z: number) => {
    const cx = Math.floor(x), cz = Math.floor(z);
    return world.inCells(cx, cz) && cx > 9 && cz > 9 && cx < N - 10 && cz < N - 10 && world.biome[world.ci(cx, cz)] === BIOME_DESERT && world.waterDist[world.ci(cx, cz)] >= 5;
  };
  const starts: number[] = [];
  for (let k = 0; k < N * N; k++) if (world.waterDist[k] >= 9 && desertAt(k % N, Math.floor(k / N))) starts.push(k);
  if (!starts.length) return;
  let best: [number, number][] = [];
  for (let t = 0; t < 16; t++) {
    const k = starts[Math.floor(rnd() * starts.length)];
    let x = (k % N) + 0.5, z = Math.floor(k / N) + 0.5, a = rnd() * 6.28, turn = 0;
    const path: [number, number][] = [[x, z]];
    for (let i = 0; i < 140; i++) {
      // virages doux qui changent de sens : des méandres
      turn = turn * 0.85 + (rnd() - 0.5) * 0.1;
      a += turn;
      const nx = x + Math.cos(a) * 0.5, nz = z + Math.sin(a) * 0.5;
      if (!desertAt(nx, nz)) break;
      x = nx; z = nz;
      path.push([x, z]);
    }
    if (path.length > best.length) best = path;
  }
  if (best.length < 48) return;
  // fond : hauteur du désert le long du tracé, lissée
  const raw = best.map(([x, z]) => world.cellAvg(Math.floor(x), Math.floor(z)));
  const floor = raw.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - 10); j <= Math.min(raw.length - 1, i + 10); j++) { sum += raw[j]; n++; }
    return Math.max(0.35, sum / n);
  });
  const G = 1.25, WALL = 1.15, TOP = 4, OUT = 2.8, R = G + WALL + TOP + OUT, rise = 2.4;
  const xs = best.map((p) => p[0]), zs = best.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - R - 1)), x1 = Math.min(N, Math.ceil(Math.max(...xs) + R + 1));
  const z0 = Math.max(0, Math.floor(Math.min(...zs) - R - 1)), z1 = Math.min(N, Math.ceil(Math.max(...zs) + R + 1));
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      let d = Infinity, at = 0;
      for (let j = 0; j < best.length; j++) {
        const e = Math.hypot(x - best[j][0], z - best[j][1]);
        if (e < d) { d = e; at = j; }
      }
      if (d >= R) continue;
      const i = z * S + x, h = world.heights[i], base = floor[at];
      // aux bouts, le plateau s'abaisse (les 12 derniers pas)
      const open = Math.min(1, Math.min(at, best.length - 1 - at) / 12), top = base + rise * open * (0.9 + 0.1 * Math.sin(at * 0.3));
      if (d < G) { world.heights[i] = Math.min(h, base); continue; }
      const p = d < G + WALL ? lerp(base, top, smoothstep(G, G + WALL, d)) : d < G + WALL + TOP ? top : lerp(top, h, smoothstep(G + WALL + TOP, R, d));
      world.heights[i] = Math.min(MAX_H, Math.max(h, p));
    }
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (world.veg[world.ci(x, z)] === VEG_FOREST) world.veg[world.ci(x, z)] = 0;
  world.markTerrain(x0, z0, x1, z1);
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
        // (le lit de cailloux reste dans l'eau : le marais ne l'aplanit pas)
        else if (!(h < 0 && world.bed[world.ci(Math.min(x, N - 1), Math.min(z, N - 1))])) world.heights[i] = lerp(h, 0.3, 0.5);
      } else if (biomeNear(x, z, BIOME_DESERT) && h > 0.4) {
        // longues ondulations de dunes, orientées par le vent
        const ph = (x * wx + z * wz) + dune.fbm(x * 0.05, z * 0.05, 2) * 4;
        world.heights[i] = Math.min(MAX_H, h + (Math.sin(ph) * 0.5 + 0.5) ** 2 * 0.45);
      }
    }
  world.markTerrainAll();
}

/**
 * Décors présents d'office : une ou deux grottes au pied des collines, failles en terrain plat et quelques épaves au bord de
 * l'eau. Posés une seule fois : à la création, ou au premier chargement d'une ancienne sauvegarde (sans la marque
 * `decorDone`), pour chaque type dont elle n'a aucun ; ceux que le joueur efface ensuite ne reviennent pas. Les gisements de
 * pétrole, eux, sont rendus à toute carte qui n'en a pas : l'âge moderne demande des puits (le joueur ne peut pas les effacer)
 */
export function addDefaultDecor(world: World, seed: number) {
  const done = world.decorDone;
  if (done && world.oil.includes(1)) return;
  world.decorDone = true;
  const rnd = mulberry32(seed + 77);
  world.computeBiomes();
  world.computeDecor();
  if (done) { addOilFields(world, seed); return; }
  /**
   * `prefer` : les cases qui le vérifient passent en premier (tirage au sort à l'intérieur de chaque groupe) ; une faille est
   * un ravin (ses cases dans `rift`), posé à la forme d'avant le pinceau
   */
  const fissure = (type: number) => type === VEG_FISSURE;
  const pick = (type: number, max: number, spacing: number, ok: (x: number, z: number) => boolean, prefer?: (x: number, z: number) => boolean) => {
    if (fissure(type) ? world.rift.includes(1) : world.veg.includes(type)) return;
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
      if (fissure(type) ? world.stampFissure(x, z) : world.setVeg(x, z, type)) placed.push(k);
    }
  };
  const free = (x: number, z: number) => !world.occ[world.ci(x, z)] && !world.road[world.ci(x, z)];
  // grottes : deux au plus, éloignées l'une de l'autre, creusées de préférence dans un versant raide de colline ou de montagne
  pick(VEG_CAVE, 2, 30, (x, z) => free(x, z) && world.cellSlope(x, z) >= 0.25 && world.cellAvg(x, z) > 0.6 && world.cellAvg(x, z) < 5.5 && world.waterDist[z * N + x] >= 3,
    (x, z) => world.cellSlope(x, z) >= 0.7 && world.cellAvg(x, z) > 1.2);
  // failles : terrain assez plat, à l'écart de l'eau ; une seule sur une nouvelle carte (version 3), cinq sur les cartes
  // des générateurs d'avant (inchangées)
  pick(VEG_FISSURE, world.gen >= GEN_VAR ? 1 : 5, 20, (x, z) => free(x, z) && world.cellSlope(x, z) < 0.5 && world.cellAvg(x, z) > 0.5 && world.cellAvg(x, z) < 4 && world.waterDist[z * N + x] >= 6);
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
