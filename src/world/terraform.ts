import { World, N, MAX_H, MIN_H, VEG_VOLCANO } from './world';
import { smoothstep } from '../core/rng';
import { Simplex } from './noise';

const ridges = new Simplex(31);

export type SculptTool = 'raise' | 'lower' | 'flatten' | 'cliff' | 'dig' | 'mountain' | 'volcano';

export interface SculptCtx { target: number }

function locked(world: World, vx: number, vz: number) {
  for (let dz = -1; dz <= 0; dz++)
    for (let dx = -1; dx <= 0; dx++) {
      const cx = vx + dx, cz = vz + dz;
      if (world.inCells(cx, cz) && world.occ[world.ci(cx, cz)]) return true;
    }
  return false;
}

/** Volcan : cône aux flancs concaves et cratère au sommet, d'un seul geste ; renvoie true si le relief a changé */
export function raiseVolcano(world: World, wx: number, wz: number, radius: number): boolean {
  const R = Math.max(3.4, radius * 1.4), H = 4.6, crater = Math.max(1.3, R * 0.3);
  // grille brute : le relief affiché n'est pas encore calculé quand la carte est générée
  const base = Math.max(0.3, world.cellAvg(Math.min(N - 1, Math.floor(wx)), Math.min(N - 1, Math.floor(wz))));
  const rim = base + H * Math.pow(1 - crater / R, 1.6);
  const x0 = Math.max(0, Math.floor(wx - R)), x1 = Math.min(N, Math.ceil(wx + R));
  const z0 = Math.max(0, Math.floor(wz - R)), z1 = Math.min(N, Math.ceil(wz + R));
  let changed = false;
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - wx, z - wz);
      if (d > R || locked(world, x, z)) continue;
      const i = world.vi(x, z), h = world.heights[i];
      // cratère : cuvette sous le bord ; flancs : jamais plus bas que le relief existant
      const nh = d < crater ? rim - 1.4 * (1 - (d / crater) ** 2) : Math.max(h, base + H * Math.pow(1 - d / R, 1.6));
      const c = Math.min(MAX_H, Math.max(MIN_H, nh));
      if (Math.abs(c - h) > 1e-5) { world.heights[i] = c; changed = true; }
    }
  if (!changed) return false;
  world.terrainDirty = true;
  world.sanitize(x0 - 1, z0 - 1, x1, z1);
  const cx = Math.min(N - 1, Math.floor(wx)), cz = Math.min(N - 1, Math.floor(wz));
  if (!world.occ[world.ci(cx, cz)]) { world.veg[world.ci(cx, cz)] = VEG_VOLCANO; world.vegDirty = true; world.version++; }
  return true;
}

/** Applique un pas de pinceau. Retourne true si le relief a changé. */
export function sculpt(world: World, tool: SculptTool, wx: number, wz: number, radius: number, dt: number, ctx: SculptCtx): boolean {
  const x0 = Math.max(0, Math.floor(wx - radius)), x1 = Math.min(N, Math.ceil(wx + radius));
  const z0 = Math.max(0, Math.floor(wz - radius)), z1 = Math.min(N, Math.ceil(wz + radius));
  let changed = false;
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - wx, z - wz);
      if (d > radius) continue;
      if (locked(world, x, z)) continue;
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
    world.terrainDirty = true;
    world.sanitize(x0 - 1, z0 - 1, x1, z1);
  }
  return changed;
}
