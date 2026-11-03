import { World } from '../world/world';
import { KINDS, KindId } from './catalog';

export const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/**
 * Rotation qui tourne la façade vers la route : le côté qui la longe le plus (à égalité, la rotation actuelle) ;
 * sans route contre le bâtiment, vers la plus proche à quelques cases ; sinon rot inchangée
 */
export function facingRoadRot(world: World, kind: KindId, x: number, z: number, rot: number, size = KINDS[kind].size): number {
  if (kind === 'lamp') return rot;
  // le ponton s'avance vers l'eau, le quai du port la longe : le côté qui en borde le plus
  const s = size;
  if (kind === 'pier' || kind === 'harbor') {
    let best = rot, most = 0;
    for (let k = 0; k < 4; k++) {
      const r = (rot + k) % 4, f = FRONT[r];
      let n = 0;
      for (let i = 0; i < s; i++) {
        const cx = f[0] === 0 ? x + i : f[0] > 0 ? x + s : x - 1, cz = f[1] === 0 ? z + i : f[1] > 0 ? z + s : z - 1;
        if (world.inCells(cx, cz) && (world.cellAvg(cx, cz) < -0.05 || world.lake[world.ci(cx, cz)])) n++;
      }
      if (n > most) { most = n; best = r; }
    }
    return best;
  }
  const roadAt = (cx: number, cz: number) => world.inCells(cx, cz) && world.road[world.ci(cx, cz)] === 1;
  // cases de route le long de chaque côté
  const along = (r: number) => {
    const f = FRONT[r];
    let n = 0;
    for (let i = 0; i < s; i++) {
      const cx = f[0] === 0 ? x + i : f[0] > 0 ? x + s : x - 1;
      const cz = f[1] === 0 ? z + i : f[1] > 0 ? z + s : z - 1;
      if (roadAt(cx, cz)) n++;
    }
    return n;
  };
  let best = rot, most = along(rot);
  for (let k = 0; k < 4; k++) { const n = along(k); if (n > most) { most = n; best = k; } }
  if (most > 0) return best;
  // pas de route contre le bâtiment : la plus proche, à 4 cases au plus, décide du côté
  const mx = x + s / 2, mz = z + s / 2;
  let near = Infinity, dx = 0, dz = 0;
  for (let r = 1; r <= 4 && near === Infinity; r++)
    for (let cz = z - r; cz < z + s + r; cz++)
      for (let cx = x - r; cx < x + s + r; cx++) {
        if (cx > x - r && cx < x + s + r - 1 && cz > z - r && cz < z + s + r - 1) continue;
        if (!roadAt(cx, cz)) continue;
        const ex = cx + 0.5 - mx, ez = cz + 0.5 - mz, d = Math.hypot(ex, ez);
        if (d < near) { near = d; dx = ex; dz = ez; }
      }
  if (near === Infinity) return rot;
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 0 : 2);
}

/** Cellule d'origine de l'empreinte d'un bâtiment centré sous un point monde */
export function footprintOrigin(kind: KindId, px: number, pz: number) {
  const s = KINDS[kind].size;
  if (s === 1) return { x: Math.floor(px), z: Math.floor(pz) };
  if (s === 3) return { x: Math.floor(px) - 1, z: Math.floor(pz) - 1 };
  return { x: Math.round(px) - 1, z: Math.round(pz) - 1 };
}
