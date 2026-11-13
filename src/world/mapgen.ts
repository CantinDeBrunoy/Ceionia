import { World, N, VEG_FOREST, VEG_ROCKS, VEG_CAVE, VEG_WRECK, VEG_FISSURE, VEG_VOLCANO, MIN_H, MAX_H, TREE_LINE, MOUNTAIN_H, BIOME_TEMPERATE, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH } from './world';
import { raiseVolcano } from './terraform';
import { addPortalIsland } from './portal';
import { Simplex } from './noise';
import { mulberry32, smoothstep, clamp, lerp, hash2 } from '../core/rng';
import { localize } from '../i18n';
import { GEN, GEN_FIXED, GEN_PLAN, GEN_VAR, continentPlan, fixedHeight, plannedHeight, toPlan, fromPlan } from './continent';

/**
 * Carte jouable : `size` cases de côté pour une nouvelle partie ; `sizes`, les tailles qu'une sauvegarde peut avoir (une
 * partie garde la taille qui l'a créée, lue dans sa sauvegarde)
 */
export interface MapDef { id: number; name: string; desc: string; defaultSeed: number; size: number; sizes: number[] }

/** La carte jouable : le continent (il garde le numéro 3, celui des sauvegardes déjà faites) */
export const CONTINENT = 3;
export const MAPS: MapDef[] = [
  { id: CONTINENT, name: 'Continent', desc: 'Un grand continent, différent à chaque partie : plateaux, montagnes et rivière, île volcanique, grand lac, mesas et archipel.', defaultSeed: 2026, size: 192, sizes: [192, 320] },
];
for (const m of MAPS) localize(m, ['name', 'desc']);
/** La carte de ce numéro (null : une carte qui n'existe plus) */
export const mapDef = (id: number) => MAPS.find((m) => m.id === id) ?? null;
/** Côté de la carte d'une partie : celui de sa sauvegarde pour une partie reprise, sinon celui d'une nouvelle partie */
export const playSize = (id: number, saved?: number) => {
  const def = mapDef(id) ?? MAPS[0];
  return saved !== undefined && def.sizes.includes(saved) ? saved : def.size;
};
/** Graine d'une nouvelle partie : chacune a son continent (`defaultSeed` ne sert plus qu'aux tests et en secours) */
export const newSeed = () => Math.floor(Math.random() * 100000) + 1;

/**
 * Relief du continent pour une graine, selon la version du générateur (`GEN` pour une nouvelle partie) : la version 1 garde
 * ses contrées à la même place, la version 2 les place selon le plan tiré de la graine. `n` : côté de la carte (par défaut,
 * celui d'une nouvelle partie)
 */
export function genHeights(mapId: number, seed: number, gen = GEN, n = (mapDef(mapId) ?? MAPS[0]).size): Float32Array {
  const N = n;
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
  const heights = genHeights(mapId, seed, gen, N);
  world.restore({ heights, road: new Uint8Array(N * N), veg: new Uint8Array(N * N), cleared: new Uint8Array(N * N), rift: new Uint8Array(N * N), buildings: [], nextId: 1 });
  world.oil.fill(0);
  world.biomePaint.fill(0);
  world.decorDone = false;
  world.computeBiomes();
  shapeBiomes(world, seed, plan ? plan.wind : null);
  const canyonFloor = v3 ? carveCanyon(world, seed, mulberry32(seed + 61)) : [];
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
  // quelques arbres au fond du canyon, au bord de la rivière
  const cr = mulberry32(seed + 67);
  for (const k of canyonFloor) if (cr() < 0.3) world.veg[k] = VEG_FOREST;
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
 * Hauteurs du canyon (version 3) : la rivière au fond, au niveau de la mer ; une étroite plaine verte de part et d'autre ; la
 * gorge intérieure jusqu'à la terrasse ; puis la grande paroi jusqu'au rebord du plateau. Les marches dépassent 1,3 : le
 * relief affiché les garde franches (pas de lissage au bord des à-pics). Plateau sous 3,8, où la roche virerait au gris
 */
const CANYON = { river: -0.45, bank: 0.25, floor: 0.5, bench: 1.8, foot: 2.05, rim: 3.35 };

/**
 * Canyon du désert (version 3), inspiré du Grand Canyon : une gorge à méandres taillée dans un large plateau, avec une rivière
 * au fond. Le tracé part d'une case de désert sèche, serpente (méandres réguliers et virages au hasard) et file vers l'eau la
 * plus proche, où la rivière se jette ; on garde le meilleur de quelques essais (d'abord ceux qui arrivent à l'eau, puis le
 * plus long). Autour, le désert devient un plateau plat ; la gorge y descend en gradins : paroi, terrasse (éboulis au pied de
 * la paroi suivante), gorge intérieure, plaine verte et rivière. Le bruit fait avancer ou reculer chaque gradin : éperons et
 * criques. Deux ou trois canyons affluents entaillent la paroi haute jusqu'à la terrasse. Le plateau s'efface près de l'eau
 * (la gorge s'ouvre sur la rive). Les cases du plateau et des parois sont peintes en désert (l'altitude et la rivière les
 * feraient changer de biome), celles du fond en prairie. Rend les cases du fond, où quelques arbres pousseront
 */
function carveCanyon(world: World, seed: number, rnd: () => number): number[] {
  const S = N + 1, C = CANYON;
  const inside = (cx: number, cz: number) => world.inCells(cx, cz) && cx > 12 && cz > 12 && cx < N - 13 && cz < N - 13;
  const dist = (x: number, z: number) => world.waterDist[world.ci(Math.floor(x), Math.floor(z))];
  const desertAt = (x: number, z: number) => {
    const cx = Math.floor(x), cz = Math.floor(z);
    return inside(cx, cz) && world.biome[world.ci(cx, cz)] === BIOME_DESERT;
  };
  const starts: number[] = [];
  for (let k = 0; k < N * N; k++) if (world.waterDist[k] >= 9 && desertAt(k % N, Math.floor(k / N))) starts.push(k);
  if (!starts.length) return [];
  // un essai : méandres réguliers (sinus d'amplitude et de période tirées) sur un cap qui dérive, attiré par l'eau ; il
  // s'arrête à l'eau (réussi), hors du désert loin de la rive, ou au bout de 220 pas
  let best: [number, number][] = [], bestWet = false;
  for (let t = 0; t < 24; t++) {
    const k = starts[Math.floor(rnd() * starts.length)];
    let x = (k % N) + 0.5, z = Math.floor(k / N) + 0.5, head = rnd() * 6.28, drift = 0, wet = false;
    const amp = 0.55 + rnd() * 0.35, per = 0.09 + rnd() * 0.06, ph = rnd() * 6.28;
    const path: [number, number][] = [[x, z]];
    for (let i = 0; i < 220; i++) {
      drift = drift * 0.9 + (rnd() - 0.5) * 0.05;
      head += drift;
      // pente de la distance à l'eau : le cap tourne doucement vers la rive
      const gx = dist(Math.min(N - 1, x + 2), z) - dist(Math.max(0, x - 2), z), gz = dist(x, Math.min(N - 1, z + 2)) - dist(x, Math.max(0, z - 2));
      if (i > 20 && (gx || gz)) {
        const want = Math.atan2(-gz, -gx);
        let da = want - head;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        head += da * 0.035;
      }
      const a = head + Math.sin(i * per + ph) * amp;
      const nx = x + Math.cos(a) * 0.5, nz = z + Math.sin(a) * 0.5, cx = Math.floor(nx), cz = Math.floor(nz);
      if (!inside(cx, cz)) break;
      if (world.isWaterCell(cx, cz)) { wet = true; break; }
      if (!desertAt(nx, nz) && dist(nx, nz) > 3) break;
      x = nx; z = nz;
      path.push([x, z]);
    }
    if (path.length < 60) continue;
    if ((wet && !bestWet) || (wet === bestWet && path.length > best.length)) { best = path; bestWet = wet; }
  }
  if (best.length < 60) return [];
  // affluents : deux ou trois courts canyons qui partent de la gorge, de biais, d'un côté ou de l'autre
  const tribs: [number, number][][] = [];
  const nt = 2 + Math.floor(rnd() * 2);
  for (let t = 0; t < nt; t++) {
    const j = Math.floor(best.length * (0.2 + 0.6 * rnd())), [px, pz] = best[j], [qx, qz] = best[Math.min(best.length - 1, j + 2)];
    let a = Math.atan2(qz - pz, qx - px) + (rnd() < 0.5 ? 1 : -1) * (1.1 + rnd() * 0.5), x = px, z = pz;
    const path: [number, number][] = [];
    const len = 18 + Math.floor(rnd() * 10);
    for (let i = 0; i < len; i++) {
      a += (rnd() - 0.5) * 0.35;
      x += Math.cos(a) * 0.5; z += Math.sin(a) * 0.5;
      if (!inside(Math.floor(x), Math.floor(z))) break;
      if (i > 4) path.push([x, z]);
    }
    if (path.length > 6) tribs.push(path);
  }
  const near = (p: [number, number][], x: number, z: number) => {
    let d = Infinity, at = 0;
    for (let j = 0; j < p.length; j++) {
      const e = (x - p[j][0]) ** 2 + (z - p[j][1]) ** 2;
      if (e < d) { d = e; at = j; }
    }
    return [Math.sqrt(d), at];
  };
  // le bruit avance ou recule chaque gradin (éperons, criques), le plateau a un bord découpé
  const n1 = new Simplex(seed + 611), n2 = new Simplex(seed + 613), n3 = new Simplex(seed + 617);
  const ramp = (a: number, b: number, d: number, e0: number, e1: number) => lerp(a, b, smoothstep(e0, e1, d));
  const R = 22;
  const xs = best.map((p) => p[0]), zs = best.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - R)), x1 = Math.min(N, Math.ceil(Math.max(...xs) + R));
  const z0 = Math.max(0, Math.floor(Math.min(...zs) - R)), z1 = Math.min(N, Math.ceil(Math.max(...zs) + R));
  const W = x1 - x0 + 1, out = new Float32Array(W * (z1 - z0 + 1)).fill(NaN);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const [d] = near(best, x, z);
      if (d >= R) continue;
      const i = z * S + x, h = world.heights[i];
      const e1 = 2.3 + n1.noise2(x * 0.3, z * 0.3) * 0.45;
      const e2 = e1 + 0.6 + Math.max(0.8, 3.2 + n2.noise2(x * 0.16, z * 0.16) * 2.2);
      const e3 = e2 + 0.6 + 7 + n3.fbm(x * 0.09, z * 0.09, 2) * 4;
      let p: number;
      if (d < 1.1) p = C.river;
      else if (d < 1.5) p = C.bank;
      else if (d < e1) p = C.floor;
      else if (d < e1 + 0.6) p = ramp(C.floor, C.bench, d, e1, e1 + 0.6);
      else if (d < e2) p = ramp(C.bench, C.foot, d, e2 - 0.9, e2);
      else if (d < e2 + 0.6) p = ramp(C.foot, C.rim, d, e2, e2 + 0.6);
      else p = C.rim;
      // affluents : la paroi haute entaillée jusqu'à la terrasse
      for (const tp of tribs) {
        const [dt, at] = near(tp, x, z), w = 0.7 + 0.5 * (1 - at / tp.length);
        if (dt < w) p = Math.min(p, C.foot);
        else if (dt < w + 0.6) p = Math.min(p, ramp(C.foot, C.rim, dt, w, w + 0.6));
      }
      // plateau : il s'efface près de l'eau et vers son bord découpé (talus de 2,5 cases)
      const k = smoothstep(2, 7, dist(Math.min(N - 1, x), Math.min(N - 1, z))) * (1 - smoothstep(e3, e3 + 2.5, d));
      out[(z - z0) * W + x - x0] = p < h ? p : lerp(h, p, k);
    }
  // (en deux temps : la distance à l'eau ne doit pas changer pendant le calcul) ; `lift` : de combien chaque sommet a bougé
  const lift = new Float32Array(out.length);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const o = (z - z0) * W + x - x0, v = out[o], i = z * S + x;
      if (Number.isNaN(v)) continue;
      lift[o] = v - world.heights[i];
      world.heights[i] = Math.min(MAX_H, v);
    }
  // biomes peints et rien de l'ancien décor, là où le relief a changé
  const floor: number[] = [];
  for (let z = z0; z < z1; z++)
    for (let x = x0; x < x1; x++) {
      const o = (z - z0) * W + x - x0, up = (lift[o] + lift[o + 1] + lift[o + W] + lift[o + W + 1]) / 4;
      const moved = Math.max(Math.abs(lift[o]), Math.abs(lift[o + 1]), Math.abs(lift[o + W]), Math.abs(lift[o + W + 1]));
      if (moved < 0.05) continue;
      const k = world.ci(x, z), a = world.cellAvg(x, z), [d] = near(best, x + 0.5, z + 0.5);
      world.veg[k] = 0;
      if (a < 0.08) continue;
      // (la paroi de la gorge intérieure reste au désert : son grès rouge et ses strates)
      if (d < 3.5 && a < 0.6) { world.paintBiome(x, z, BIOME_TEMPERATE); if (a > 0.4) floor.push(k); }
      else if (up > 0.3 || a > 0.6) world.paintBiome(x, z, BIOME_DESERT);
    }
  world.markTerrain(x0, z0, x1, z1);
  return floor;
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
