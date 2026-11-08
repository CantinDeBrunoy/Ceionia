import { World, N, MAX_H, MIN_H, VEG_VOLCANO } from './world';
import { clamp, smoothstep } from '../core/rng';
import { Simplex } from './noise';

const ridges = new Simplex(31);

export type SculptTool = 'raise' | 'lower' | 'flatten' | 'cliff' | 'dig' | 'mountain' | 'volcano';

export interface SculptCtx { target: number }

/** Un sommet du relief qui borde une case bâtie (ou une route, avec roads) : le pinceau n'y touche pas */
function locked(world: World, vx: number, vz: number, roads = false) {
  for (let dz = -1; dz <= 0; dz++)
    for (let dx = -1; dx <= 0; dx++) {
      const cx = vx + dx, cz = vz + dz;
      if (!world.inCells(cx, cz)) continue;
      const k = world.ci(cx, cz);
      if (world.occ[k] || (roads && world.road[k])) return true;
    }
  return false;
}

/** Le pinceau (ou le volcan) de ce rayon touche-t-il un bâtiment ? Il ne modifie alors rien du tout (son cercle est rouge) */
export function brushOnBuilding(world: World, wx: number, wz: number, radius: number): boolean {
  for (let z = Math.max(0, Math.floor(wz - radius)); z <= Math.min(N, Math.ceil(wz + radius)); z++)
    for (let x = Math.max(0, Math.floor(wx - radius)); x <= Math.min(N, Math.ceil(wx + radius)); x++)
      if (Math.hypot(x - wx, z - wz) <= radius && locked(world, x, z)) return true;
  return false;
}

/** Rayon du volcan posé avec ce pinceau (la hauteur suit la largeur) */
export const volcanoRadius = (radius: number) => Math.max(5, radius * 2);

/** Rayon du volcan de la carte : jusque-là, le cône reste lisse ; au-delà (grands pinceaux), il prend ravines et bord dentelé */
const MAP_VOLCANO_R = 11;

/** Volcan : cône aux flancs concaves et cratère au sommet, d'un seul geste ; renvoie true si le relief a changé */
export function raiseVolcano(world: World, wx: number, wz: number, radius: number): boolean {
  // centré sur la case du cratère, là où se posent la lave et la fumée
  wx = Math.min(N - 1, Math.floor(wx)) + 0.5; wz = Math.min(N - 1, Math.floor(wz)) + 0.5;
  // la hauteur suit la largeur : un grand volcan domine la carte. Plus large que celui de la carte, il s'étale plus qu'il ne
  // monte : son sommet restait écrêté au plafond du relief (un dôme plat, aux flancs trop raides) ; son cratère s'élargit
  // moins vite, net et profond, au lieu d'une vaste cuvette
  const R = volcanoRadius(radius), over = Math.max(0, R - MAP_VOLCANO_R), big = smoothstep(MAP_VOLCANO_R, MAP_VOLCANO_R + 3, R);
  const H = R * 1.6 - over * 1.3, crater = Math.max(1.5, R * 0.25) - over * 0.13, pit = 1.2 + H * 0.1 + big * 0.6;
  // grille brute : le relief affiché n'est pas encore calculé quand la carte est générée
  const base = Math.max(0.3, world.cellAvg(Math.min(N - 1, Math.floor(wx)), Math.min(N - 1, Math.floor(wz))));
  // bord du cratère arasé sur près d'une case : sur la grille, les sommets proches du bord sont à des distances inégales
  // et le cône, raide en haut, y dessinerait des dents
  // (un grand volcan garde son bord sous le plafond du relief, que ses dents ne touchent pas)
  const cone = base + H * Math.pow(1 - (crater + 0.8) / R, 1.6), rim = big ? Math.min(MAX_H - 1.2, cone) : cone;
  // grands volcans : le rebord s'élargit aussi vers l'intérieur (sommets nombreux près du bord, paroi intérieure très haute)
  const inner = crater - Math.min(0.6, Math.max(0, (R - 9) * 0.1));
  // grands volcans : les flancs se creusent de ravines qui rayonnent du sommet (coulées anciennes, torrents de boue), séparées
  // par des arêtes ; elles serpentent un peu, s'ouvrent sous le bord du cratère et s'effacent au pied. Le bord du cratère
  // ondule, un peu plus haut ici, ébréché là
  // (assez larges pour que le relief affiché, lissé, les garde)
  const gullies = Math.round(R * 0.5);
  const ravine = (x: number, z: number, d: number) => {
    if (!big) return 0;
    const a = Math.atan2(z - wz, x - wx), t = clamp((d - crater) / (R - crater), 0, 1);
    const v = 0.5 + 0.5 * Math.cos(gullies * a + ridges.noise2(x * 0.12 + 13.1, z * 0.12 - 7.7) * 1.4);
    const deep = 0.7 + 0.3 * ridges.noise2(Math.cos(a) * 2.5 + 31, Math.sin(a) * 2.5 - 17);
    return big * (0.5 + R * 0.14) * smoothstep(0.4, 1, v) * deep * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1)), 0.6);
  };
  const lip = (x: number, z: number) => {
    const a = Math.atan2(z - wz, x - wx);
    return big * 0.45 * ridges.noise2(Math.cos(a) * 1.8 + 52, Math.sin(a) * 1.8 + 52);
  };
  const x0 = Math.max(0, Math.floor(wx - R)), x1 = Math.min(N, Math.ceil(wx + R));
  const z0 = Math.max(0, Math.floor(wz - R)), z1 = Math.min(N, Math.ceil(wz + R));
  let changed = false;
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - wx, z - wz);
      if (d > R || locked(world, x, z)) continue;
      const i = world.vi(x, z), h = world.heights[i], top = rim + lip(x, z);
      // cratère : cuvette sous le bord ; flancs : jamais plus bas que le relief existant
      // cratère à fond plat, où s'étale le lac de lave ; sa paroi tombe plus droit sous le bord des grands volcans
      const nh = d < inner ? top - (top - rim + pit) * Math.min(1, (1 - (d / inner) ** 2) * (1.6 + big * 2))
        : d < crater ? top : Math.max(h, Math.min(top, base + H * Math.pow(1 - d / R, 1.6)) - ravine(x, z, d));
      const c = Math.min(MAX_H, Math.max(MIN_H, nh));
      if (Math.abs(c - h) > 1e-5) { world.heights[i] = c; changed = true; }
    }
  if (!changed) return false;
  world.markTerrain(x0 - 1, z0 - 1, x1, z1);
  world.sanitize(x0 - 1, z0 - 1, x1, z1);
  // la moitié haute du cône est nue : plus d'arbres, de champs ni de rochers
  for (let cz = z0; cz < z1; cz++)
    for (let cx = x0; cx < x1; cx++)
      if (world.inCells(cx, cz) && world.veg[world.ci(cx, cz)] && Math.hypot(cx + 0.5 - wx, cz + 0.5 - wz) < R * 0.55) {
        world.veg[world.ci(cx, cz)] = 0;
        world.vegDirty = true;
      }
  const cx = Math.min(N - 1, Math.floor(wx)), cz = Math.min(N - 1, Math.floor(wz));
  if (!world.occ[world.ci(cx, cz)]) { world.veg[world.ci(cx, cz)] = VEG_VOLCANO; world.vegDirty = true; world.version++; }
  return true;
}

/**
 * Rase un volcan : le cône retombe au niveau du sol alentour (le pied du volcan), avec un raccord doux ; la case du cratère
 * perd sa marque de volcan. Les sommets tenus par un bâtiment ne bougent pas. cell : la case du cratère (voir World.volcanoAt).
 * Renvoie true si un volcan a été effacé
 */
export function removeVolcano(world: World, cell: number): boolean {
  const cx = cell % N, cz = Math.floor(cell / N);
  if (world.veg[cell] !== VEG_VOLCANO) return false;
  const f = world.volcanoFrame(cx, cz), R = f.r + 1, wx = cx + 0.5, wz = cz + 0.5;
  const x0 = Math.max(0, Math.floor(wx - R)), x1 = Math.min(N, Math.ceil(wx + R));
  const z0 = Math.max(0, Math.floor(wz - R)), z1 = Math.min(N, Math.ceil(wz + R));
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - wx, z - wz);
      if (d > R || locked(world, x, z)) continue;
      const i = world.vi(x, z), h = world.heights[i];
      if (h <= f.foot) continue;
      // plat jusqu'à la moitié du rayon, puis le raccord remonte vers le relief d'origine
      const t = 1 - smoothstep(R * 0.5, R, d);
      world.heights[i] = clamp(h + (f.foot - h) * t, MIN_H, MAX_H);
    }
  world.veg[cell] = 0;
  world.vegDirty = true;
  world.markTerrain(x0 - 1, z0 - 1, x1, z1);
  world.sanitize(x0 - 1, z0 - 1, x1, z1);
  world.markVeg(x0, z0, x1, z1);
  world.version++;
  return true;
}

/** Applique un pas de pinceau. Retourne true si le relief a changé. */
export function sculpt(world: World, tool: SculptTool, wx: number, wz: number, radius: number, dt: number, ctx: SculptCtx): boolean {
  // sur un bâtiment, rien ne bouge : ni fosse autour, ni pilier sous la maison
  if (brushOnBuilding(world, wx, wz, radius)) return false;
  const x0 = Math.max(0, Math.floor(wx - radius)), x1 = Math.min(N, Math.ceil(wx + radius));
  const z0 = Math.max(0, Math.floor(wz - radius)), z1 = Math.min(N, Math.ceil(wz + radius));
  let changed = false;
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - wx, z - wz);
      if (d > radius) continue;
      // les routes gardent leur niveau : le village reste desservi
      if (locked(world, x, z, true)) continue;
      const w = smoothstep(0, 1, 1 - d / radius);
      const i = world.vi(x, z);
      const h = world.heights[i];
      let nh = h;
      switch (tool) {
        case 'raise': nh = h + 2.4 * dt * w; break;
        // montagne : pic pointu au centre du pinceau, crêtes irrégulières
        case 'mountain': nh = h + 4.2 * dt * Math.pow(w, 2.2) * (0.65 + 0.7 * Math.abs(ridges.noise2(x * 0.35, z * 0.35))); break;
        case 'lower': nh = h - 2.4 * dt * w; break;
        case 'dig': nh = h + (-1.3 - h) * Math.min(1, 5 * dt) * w; break;
        case 'flatten': nh = h + (ctx.target - h) * Math.min(1, 8 * dt) * w; break;
        case 'cliff': {
          const snapped = ctx.target + Math.round((h - ctx.target) / 1.0) * 1.0;
          nh = h + (snapped - h) * Math.min(1, 10 * dt) * (d < radius * 0.85 ? 1 : 0.4);
          break;
        }
      }
      nh = Math.min(MAX_H, Math.max(MIN_H, nh));
      if (Math.abs(nh - h) > 1e-5) { world.heights[i] = nh; changed = true; }
    }
  if (changed) {
    world.markTerrain(x0 - 1, z0 - 1, x1, z1);
    world.sanitize(x0 - 1, z0 - 1, x1, z1);
  }
  return changed;
}
