import { World } from '../world/world';
import { KINDS, KindId } from './catalog';

export const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/** Retourne la rotation qui oriente la façade vers une route adjacente (sinon rot inchangée) */
export function facingRoadRot(world: World, kind: KindId, x: number, z: number, rot: number): number {
  if (kind === 'lamp') return rot;
  const s = KINDS[kind].size;
  const facing = (r: number) => {
    const f = FRONT[r];
    for (let i = 0; i < s; i++) {
      const cx = f[0] === 0 ? x + i : f[0] > 0 ? x + s : x - 1;
      const cz = f[1] === 0 ? z + i : f[1] > 0 ? z + s : z - 1;
      if (world.inCells(cx, cz) && world.road[world.ci(cx, cz)]) return true;
    }
    return false;
  };
  if (facing(rot)) return rot;
  for (let k = 0; k < 4; k++) if (facing(k)) return k;
  return rot;
}

/** Cellule d'origine de l'empreinte d'un bâtiment centré sous un point monde */
export function footprintOrigin(kind: KindId, px: number, pz: number) {
  const s = KINDS[kind].size;
  if (s === 1) return { x: Math.floor(px), z: Math.floor(pz) };
  return { x: Math.round(px) - 1, z: Math.round(pz) - 1 };
}
