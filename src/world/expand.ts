import { World, setMapSize } from './world';
import { newWorld } from './mapgen';
import { GEN_VAR, GEN_ARCH } from './continent';
import { ARCH_N, MAIN_N, archLayout } from './archipelago';
import { smoothstep, lerp } from '../core/rng';

/**
 * Le monde s'agrandit (le joueur accepte d'explorer le monde) : une partie sur la carte de 192 (version 3) passe sur la carte
 * de l'archipel (384, version 4). Son île est posée telle quelle dans le cadre de l'île principale : c'est le même continent
 * pour la même graine, et tout ce que le joueur y a fait (relief, routes, bâtiments, végétation, lave, lignes de train…) est
 * décalé d'autant ; autour, la mer, les îles rivales et les petites îles d'une partie neuve de l'archipel
 */

/** La partie peut-elle s'agrandir ? Seulement le continent de la version 3, sur la carte de 192 */
export const canExpand = (world: { n?: number; gen?: number }) => world?.n === MAIN_N && world?.gen === GEN_VAR;

/**
 * Sauvegarde du monde (`World.toJSON`) agrandie à l'archipel, pour la carte `map` et la graine `seed`. Change la taille de la
 * carte du jeu (`setMapSize(ARCH_N)`) : à appeler juste avant de recharger la partie
 */
export function expandWorld(old: any, map: number, seed: number): any {
  if (!canExpand(old)) throw new Error('Seul le continent de la version 3, sur la carte de 192, peut s’agrandir');
  const n0 = MAIN_N, n = ARCH_N, f = archLayout(seed, n).main;
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
  // relief : l'ancien dans le cadre ; sur ses 12 dernières cases (déjà en mer), sa mer rejoint le fond du large comme dans une
  // partie neuve de l'archipel (`archHeights`)
  const S0 = n0 + 1, S = n + 1, heights: number[] = neu.heights.slice();
  for (let z = 0; z <= n0; z++)
    for (let x = 0; x <= n0; x++) {
      const i = (z + f.z) * S + x + f.x, hm = old.heights[z * S0 + x] / 100, deep = neu.heights[i] / 100;
      const hs = hm > -0.7 ? hm : Math.min(hm, lerp(-0.7, deep, smoothstep(-0.7, -1, hm)));
      heights[i] = Math.round(lerp(deep, hs, smoothstep(0, 12, Math.min(x, z, n0 - x, n0 - z))) * 100);
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
    heights,
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
    lines: (old.lines ?? []).map((l: any) => (Array.isArray(l?.v) ? { ...l, v: l.v.map((leg: unknown) => (Array.isArray(leg) ? leg.map(cell) : leg)) } : l)),
    portal: move(old.portal),
    war,
    // routes en courbe : points au centième, (x, z) à la suite
    curves: (old.curves ?? []).map((c: number[]) => c.map((v, i) => v + (i % 2 ? f.z : f.x) * 100)),
  };
}
