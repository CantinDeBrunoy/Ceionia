import { World, N, VEG_VOLCANO, VolcanoFrame } from '../world/world';
import type { Choice } from './missions';

/**
 * Les expéditions du volcan (`VOLCANIC` : l'obsidienne, la montée au cratère, le village sous l'éruption). Le volcan de la
 * carte est sur une île : on y traverse en barque depuis la rive d'en face, on débarque, on monte à pied jusqu'au lieu du
 * travail. Un volcan posé par le joueur sur la terre du village se gagne à pied. La simulation (`Expeditions.volcanoTrip`) et
 * la scène (`ExpeditionScene`) lisent les mêmes repères : le volcan le plus proche, son île, le lieu du travail
 */

/** Les cases de cratère de la carte */
export function volcanoCells(w: World): number[] {
  const out: number[] = [];
  for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_VOLCANO) out.push(k);
  return out;
}

/** Le volcan le plus proche du point (sa case et son repère), ou null s'il n'y en a pas */
export function nearestVolcano(w: World, x: number, z: number): { k: number; f: VolcanoFrame } | null {
  let best = -1, bd = Infinity;
  for (const k of volcanoCells(w)) { const d = Math.hypot((k % N) + 0.5 - x, Math.floor(k / N) + 0.5 - z); if (d < bd) { bd = d; best = k; } }
  return best < 0 ? null : { k: best, f: w.volcanoFrame(best % N, Math.floor(best / N)) };
}

/** Terre ferme (pas la mer ni un lac) : de quoi poser le pied */
export const landCell = (w: World, x: number, z: number) => w.inCells(x, z) && !w.lake[w.ci(x, z)] && w.cellAvg(x, z) > 0.05;

/** La terre d'un seul tenant autour du volcan : son île (ou tout le continent, s'il est posé sur la terre du village) */
export function volcanoIsle(w: World, f: VolcanoFrame): Uint8Array {
  const isle = new Uint8Array(N * N), x0 = Math.floor(f.x), z0 = Math.floor(f.z);
  if (!landCell(w, x0, z0)) return isle;
  const q = [w.ci(x0, z0)];
  isle[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % N, z = Math.floor(c / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!landCell(w, nx, nz) || isle[w.ci(nx, nz)]) continue;
      isle[w.ci(nx, nz)] = 1;
      q.push(w.ci(nx, nz));
    }
  }
  return isle;
}

/**
 * Le lieu du travail sur le volcan, du côté d'où vient l'équipe (`from`) : l'obsidienne au bas des coulées (la coulée tiède
 * un peu plus haut), le bord du cratère (le bord du lac de lave, à l'intérieur), le village de pêcheurs au pied du cône
 */
export function volcanoGate(w: World, f: VolcanoFrame, c: Choice, from: [number, number]): [number, number] {
  const a = Math.atan2(from[1] - f.z, from[0] - f.x);
  // (un peu de côté : le chemin de la plage au lieu du travail monte en biais, on voit mieux le cône)
  const at = (r: number, da = 0): [number, number] => [f.x + Math.cos(a + da) * r, f.z + Math.sin(a + da) * r];
  if (c.scene === 'ascent') return c.variant === 'lava' ? at(2.1, 0.3) : at(3.4, 0.3);
  if (c.scene === 'obsidian') return c.variant === 'hot' ? at(f.r * 0.62, 0.45) : at(f.r * 0.78, 0.45);
  // le village : au pied du cône, du côté de la mer d'où l'on arrive, sur la terre de l'île
  for (const k of [0.95, 0.9, 1, 0.85, 1.05, 0.8]) for (const da of [0.25, -0.25, 0.5, -0.5, 0]) {
    const [x, z] = at(f.r * k, da);
    if (landCell(w, Math.floor(x), Math.floor(z)) && w.cellSlope(Math.floor(x), Math.floor(z)) < 1.4) return [x, z];
  }
  return at(f.r * 0.85, 0.25);
}

/**
 * La traversée vers l'île, tout droit depuis la rive (x, z) vers le volcan : la longueur d'eau avant d'aborder l'île, ou -1
 * si la ligne touche une autre terre en chemin (ou ne quitte pas la rive)
 */
export function crossTo(w: World, f: VolcanoFrame, isle: Uint8Array, x: number, z: number): number {
  const dx = f.x - x, dz = f.z - z, L = Math.hypot(dx, dz);
  let wet = false;
  for (let s = 0.5; s < L; s += 0.5) {
    const cx = Math.floor(x + (dx / L) * s), cz = Math.floor(z + (dz / L) * s);
    if (!w.inCells(cx, cz)) return -1;
    if (isle[w.ci(cx, cz)]) return wet ? s : -1;
    if (w.cellAvg(cx, cz) < -0.1) wet = true;
    else if (wet || s > 3.5) return -1;
  }
  return -1;
}
