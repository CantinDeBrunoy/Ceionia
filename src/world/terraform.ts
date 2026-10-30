import { World, N, MAX_H, MIN_H } from './world';
import { smoothstep } from '../core/rng';

export type SculptTool = 'raise' | 'lower' | 'flatten' | 'cliff' | 'dig';

export interface SculptCtx { target: number }

function locked(world: World, vx: number, vz: number) {
  for (let dz = -1; dz <= 0; dz++)
    for (let dx = -1; dx <= 0; dx++) {
      const cx = vx + dx, cz = vz + dz;
      if (world.inCells(cx, cz) && world.occ[world.ci(cx, cz)]) return true;
    }
  return false;
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
