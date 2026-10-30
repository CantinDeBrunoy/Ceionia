import { World, N, VEG_FOREST, MIN_H, MAX_H } from './world';
import { Simplex } from './noise';
import { mulberry32, smoothstep, clamp, lerp } from '../core/rng';

export interface MapDef { id: number; name: string; desc: string; defaultSeed: number }

export const MAPS: MapDef[] = [
  { id: 0, name: 'Île flottante', desc: 'Une petite île paisible entourée d’eau.', defaultSeed: 1234 },
  { id: 1, name: 'Vallée', desc: 'Une rivière sinueuse entre des collines douces.', defaultSeed: 4242 },
  { id: 2, name: 'Plateaux', desc: 'Un archipel de plateaux et de falaises.', defaultSeed: 777 },
];

export function genHeights(mapId: number, seed: number): Float32Array {
  const hts = new Float32Array((N + 1) * (N + 1));
  const s = new Simplex(seed);
  const s2 = new Simplex(seed * 7 + 13);
  const rnd = mulberry32(seed);
  const phase = rnd() * 6.28;
  for (let z = 0; z <= N; z++)
    for (let x = 0; x <= N; x++) {
      const u = x / N, v = z / N;
      let h = 0;
      if (mapId === 0) {
        const wx = x + s2.fbm(x * 0.05, z * 0.05, 2) * 6, wz = z + s2.fbm(x * 0.05 + 9, z * 0.05, 2) * 6;
        const d = Math.hypot(wx - N / 2, wz - N / 2) / (N / 2);
        h = 3.0 * (1 - Math.pow(d / 0.8, 2)) + s.fbm(x * 0.07, z * 0.07, 4) * 1.5 - 0.5;
        h = lerp(h, Math.min(h, -0.6), smoothstep(0.7, 0.95, d));
      } else if (mapId === 1) {
        const edge = Math.pow(Math.abs(u - 0.5) * 2, 2.2);
        h = 0.9 + s.fbm(x * 0.06, z * 0.06, 4) * 2.6 + edge * 3.2;
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
  return hts;
}

export function newWorld(world: World, mapId: number, seed: number) {
  world.mapId = mapId;
  world.seed = seed;
  const heights = genHeights(mapId, seed);
  const s = new Simplex(seed + 99);
  const rnd = mulberry32(seed + 5);
  const veg = new Uint8Array(N * N);
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const a = (heights[z * (N + 1) + x] + heights[z * (N + 1) + x + 1] + heights[(z + 1) * (N + 1) + x] + heights[(z + 1) * (N + 1) + x + 1]) / 4;
      if (a < 0.45) continue;
      const n = s.fbm(x * 0.14, z * 0.14, 3);
      if (n > 0.12 && rnd() < 0.8) veg[z * N + x] = VEG_FOREST;
      else if (n > -0.05 && rnd() < 0.04) veg[z * N + x] = VEG_FOREST;
    }
  world.restore({ heights, road: new Uint8Array(N * N), veg, buildings: [], nextId: 1 });
  // sanitize (pentes)
  world.sanitize(0, 0, N, N);
}
