import { World, setMapSize } from './world';
import { newWorld } from './mapgen';
import { GEN_FIXED, GEN_VAR, GEN_ARCH } from './continent';
import { ARCH_N, MAIN_N, archLayout } from './archipelago';
import { smoothstep, lerp } from '../core/rng';

/**
 * Le monde s'agrandit (le joueur accepte d'explorer le monde) : une partie sur la carte de 192 (version 3) passe sur la carte
 * de l'archipel (384, version 4). Son île est posée telle quelle dans le cadre de l'île principale : c'est le même continent
 * pour la même graine, et tout ce que le joueur y a fait (relief, routes, bâtiments, végétation, lave, lignes de train…) est
 * décalé d'autant ; autour, la mer, les îles rivales et les petites îles d'une partie neuve de l'archipel
 */

/**
 * L'archipel est-il ouvert dans cette partie ? (le joueur a accepté d'explorer le monde : la carte a ses îles). L'âge où il a
 * accepté : `World.exploredAt`
 */
/** Sous cette hauteur, la case de l'ancienne carte est en pleine mer : l'agrandissement peut la creuser ; au-dessus (terre, côte, hauts-fonds, rivières, lacs), elle reste telle quelle */
export const OPEN_SEA = -0.5;

export const archipelagoOn = (w: { isles: unknown }) => !!w.isles;

/**
 * La partie peut-elle s'agrandir ? Le continent sur la carte de 192, quelle que soit sa version (1, 2, 3 ou 5 ; une sauvegarde sans
 * version est de la 1) : son île garde la sienne (`World.mainGen`)
 */
export const canExpand = (world: { n?: number; gen?: number }) => world?.n === MAIN_N && (world.gen ?? GEN_FIXED) !== GEN_ARCH;

/**
 * Sauvegarde du monde (`World.toJSON`) agrandie à l'archipel, pour la carte `map` et la graine `seed`. Change la taille de la
 * carte du jeu (`setMapSize(ARCH_N)`) : à appeler juste avant de recharger la partie
 */
export function expandWorld(old: any, map: number, seed: number): any {
  if (!canExpand(old)) throw new Error('Seul le continent, sur la carte de 192, peut s’agrandir');
  const base = old.gen ?? GEN_FIXED;
  const n0 = MAIN_N, n = ARCH_N, f = archLayout(seed, n).main;
  // le continent tel que généré, avant toute retouche du joueur : un sommet qui en diffère a été sculpté (ou aplani sous un
  // bâtiment, creusé pour un port) et ne bouge pas d'un centième
  setMapSize(n0);
  const first = new World();
  first.seed = seed;
  newWorld(first, map, seed, base);
  const untouched = (x: number, z: number) => Math.abs(Math.round(first.heights[z * (n0 + 1) + x] * 100) - old.heights[z * (n0 + 1) + x]) <= 1;
  setMapSize(n);
  const fresh = new World();
  fresh.seed = seed;
  newWorld(fresh, map, seed, GEN_ARCH);
  const neu: any = fresh.toJSON();
  /** case de l'ancienne carte → case de la nouvelle */
  const cell = (k: number) => (Math.floor(k / n0) + f.z) * n + (k % n0) + f.x;
  /** case de la nouvelle carte hors du cadre de l'île principale (ce qu'on garde de la partie neuve) */
  const outside = (k: number) => { const x = k % n, z = Math.floor(k / n); return x < f.x || z < f.z || x >= f.x + f.n || z >= f.z + f.n; };
  const list = (a: unknown, b: unknown) => [...(Array.isArray(b) ? b.filter(outside) : []), ...(Array.isArray(a) ? a.map(cell) : [])];
  const pairs = (a: unknown, b: unknown) => {
    const out: number[] = [];
    if (Array.isArray(b)) for (let i = 0; i + 1 < b.length; i += 2) if (outside(b[i])) out.push(b[i], b[i + 1]);
    if (Array.isArray(a)) for (let i = 0; i + 1 < a.length; i += 2) out.push(cell(a[i]), a[i + 1]);
    return out;
  };
  // relief : l'ancien dans le cadre, tel quel. Seule sa pleine mer (sous `OPEN_SEA`) que le joueur n'a jamais retouchée peut
  // descendre vers le fond du large d'une partie neuve de l'archipel (`archHeights`), sur ses 12 dernières cases et sous -1,
  // jamais monter. Avant (bug de l'auteur, 21 nov. 2026 : « les zones abîmées sont celles que j'avais terraformées »), ces 12
  // cases étaient fondues vers la carte neuve en les croyant en mer, et toute mer sous -1 du cadre allait vers la carte neuve,
  // même là où elle était de la terre : une terre gagnée sur la mer s'enfonçait ou montait en gradins, un bassin creusé se
  // comblait, et remparts, pontons et bâtiments restaient sur place
  const S0 = n0 + 1, S = n + 1, heights: number[] = neu.heights.slice();
  // (un sommet n'est en pleine mer que si ses voisins à deux sommets le sont aussi : une case de côte garde tous ses coins,
  // et le relief affiché, lissé entre voisins, ne bouge pas sur la côte)
  const openSea = (x: number, z: number) => {
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const a = x + dx, b = z + dz;
        if (a >= 0 && b >= 0 && a <= n0 && b <= n0 && old.heights[b * S0 + a] / 100 > OPEN_SEA) return false;
      }
    return true;
  };
  for (let z = 0; z <= n0; z++)
    for (let x = 0; x <= n0; x++) {
      const i = (z + f.z) * S + x + f.x, raw = old.heights[z * S0 + x], hm = raw / 100;
      if (!openSea(x, z) || !untouched(x, z)) { heights[i] = raw; continue; }
      const deep = Math.min(hm, neu.heights[i] / 100);
      // (sous -0,98, la mer rejoint déjà le fond du large ; près du bord, elle s'y fond tout à fait)
      const hs = hm > -0.98 ? hm : lerp(hm, deep, smoothstep(-0.98, -1.1, hm));
      heights[i] = Math.round(Math.min(hm, lerp(deep, hs, smoothstep(0, 12, Math.min(x, z, n0 - x, n0 - z)))) * 100);
    }
  const move = (p: { x: number; z: number } | null | undefined) => (p ? { ...p, x: p.x + f.x, z: p.z + f.z } : p ?? null);
  const war = old.war && typeof old.war === 'object' ? { ...old.war } : old.war;
  if (war?.raid?.units) war.raid = { ...war.raid, units: war.raid.units.map((u: any) => move(u)) };
  return {
    ...old,
    n,
    gen: GEN_ARCH,
    isles: neu.isles,
    reveal: 1,
    // (l'île garde la version de son générateur : son climat, sa rivière et ses biomes ne changent pas)
    ...(base !== GEN_VAR ? { mainGen: base } : {}),
    heights,
    // (agrandie avec la côte gardée telle quelle : `repairCoast` n'a rien à faire)
    coast: 1,
    roads: list(old.roads, neu.roads),
    veg: pairs(old.veg, neu.veg),
    biomes: pairs(old.biomes, neu.biomes),
    cleared: list(old.cleared, neu.cleared),
    rift: list(old.rift, neu.rift),
    decor: 1,
    buildings: (old.buildings ?? []).map((b: any[]) => [b[0], b[1] + f.x, b[2] + f.z, ...b.slice(3)]),
    torches: list(old.torches, []),
    basalt: pairs(old.basalt, neu.basalt),
    ash: list(old.ash, neu.ash),
    oil: list(old.oil, []),
    // (oubliés jusqu'au 21 nov. 2026 : les pavés, le cap des grottes et le fer céleste restaient aux cases de l'ancienne carte)
    ...(Array.isArray(old.paving) ? { paving: list(old.paving, []) } : {}),
    ...(Array.isArray(old.caveYaw) ? { caveYaw: pairs(old.caveYaw, []) } : {}),
    ...(Array.isArray(old.starIron) ? { starIron: list(old.starIron, []) } : {}),
    lines: (old.lines ?? []).map((l: any) => (Array.isArray(l?.v) ? { ...l, v: l.v.map((leg: unknown) => (Array.isArray(leg) ? leg.map(cell) : leg)) } : l)),
    portal: move(old.portal),
    war,
    // routes en courbe : points au centième, (x, z) à la suite
    curves: (old.curves ?? []).map((c: number[]) => c.map((v, i) => v + (i % 2 ? f.z : f.x) * 100)),
  };
}

/**
 * Répare une partie agrandie avant le 21 nov. 2026 (sans `coast`), dont la côte proche du bord de l'ancienne carte a été
 * abîmée : l'agrandissement d'alors y avait fondu le relief vers celui d'une partie neuve de l'archipel, sur 12 cases
 * (`h = lerp(neuve, ancienne, w)`, `w = smoothstep(0, 12, distance au bord)`). La carte neuve se refait à l'identique depuis
 * la graine : l'ancien relief se retrouve en défaisant ce fondu. Sur les deux sommets du bord même (w trop petit, l'erreur
 * d'arrondi y serait trop grande), c'est le relief du continent d'origine, refait lui aussi (ce que le joueur y avait
 * sculpté est perdu). Seules la terre, la côte et les hauts-fonds sont rétablis (au-dessus de `OPEN_SEA`). Rend la sauvegarde
 * du monde réparée et marquée (`coast`), ou telle quelle si elle n'a rien à réparer. Change la taille de la carte le temps
 * des deux générations, puis la remet à celle de l'archipel
 */
export function repairCoast(d: any, map: number, seed: number): any {
  if (!d || d.coast || d.gen !== GEN_ARCH || !d.isles || d.exploredAt === undefined || d.exploredAt === null || d.n !== ARCH_N) return d;
  const n0 = MAIN_N, n = ARCH_N, f = archLayout(seed, n).main, S0 = n0 + 1, S = n + 1;
  setMapSize(n0);
  const orig = new World();
  orig.seed = seed;
  newWorld(orig, map, seed, d.mainGen ?? GEN_VAR);
  const first = Array.from(orig.heights);
  setMapSize(n);
  const fresh = new World();
  fresh.seed = seed;
  newWorld(fresh, map, seed, GEN_ARCH);
  const heights: number[] = Array.from(d.heights as number[]);
  /** le voisinage du sommet (x, z) vaut partout la hauteur de la carte neuve (comblé d'un bloc par l'ancien agrandissement) */
  const sunk = (x: number, z: number) => {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const a = x + dx, b = z + dz;
        if (a < 0 || b < 0 || a > n0 || b > n0) continue;
        const j = (b + f.z) * S + a + f.x;
        if (Math.abs(d.heights[j] - Math.round(fresh.heights[j] * 100)) > 2) return false;
      }
    return true;
  };
  for (let z = 0; z <= n0; z++)
    for (let x = 0; x <= n0; x++) {
      const w = smoothstep(0, 12, Math.min(x, z, n0 - x, n0 - z));
      const i = (z + f.z) * S + x + f.x, cur = heights[i] / 100, deep = Math.round(fresh.heights[i] * 100) / 100, gen = first[z * S0 + x];
      let was = w >= 1 ? cur : w >= 0.07 ? (cur - (1 - w) * deep) / w : gen;
      // un bassin creusé par le joueur sous -1,1 avait pris la hauteur de la carte neuve, partout dans le cadre (souvent de la
      // terre) : il vaut exactement celle-ci alors que le continent d'origine était plus haut. Sa profondeur est perdue : il
      // redevient une eau profonde (-1,1)
      // (tout le voisinage 3 × 3 aussi : un plateau sculpté qui croise par hasard la hauteur de la carte neuve ne devient pas un trou)
      if (Math.abs(was - deep) < 0.02 && gen > -0.98 && Math.abs(gen - deep) > 0.1 && Math.abs(cur - gen) > 0.1 && sunk(x, z)) was = -1.1;
      else if (!(was > OPEN_SEA)) continue;
      if (Math.abs(was - cur) < 0.01) continue;
      heights[i] = Math.round(was * 100);
    }
  return { ...d, heights, coast: 1 };
}
