import { World } from '../world/world';
import { KINDS, KindId } from './catalog';

export const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/** Côté de la porte (indice dans FRONT) : la façade ; le ponton et le port, façade sur l'eau, l'ont à l'arrière, côté terre */
export const doorSide = (kind: KindId, rot: number) => (kind === 'pier' || kind === 'harbor' ? (rot + 2) % 4 : rot);

/** Cases qui longent le côté `side` d'une emprise de `s` cases (hors de l'emprise) */
export function sideCells(x: number, z: number, s: number, side: number): [number, number][] {
  const f = FRONT[side], out: [number, number][] = [];
  for (let i = 0; i < s; i++) out.push([f[0] === 0 ? x + i : f[0] > 0 ? x + s : x - 1, f[1] === 0 ? z + i : f[1] > 0 ? z + s : z - 1]);
  return out;
}

/** Rangs de la porte le long d'un côté de `s` cases : celui du milieu (les deux du milieu pour une emprise paire) */
export const doorSpan = (s: number) => [(s - 1) >> 1, s >> 1];

/**
 * Cases devant la porte, si elle est du côté `side` : au milieu du côté, une case (deux, celles du milieu, pour une emprise
 * paire). Le chemin d'accès n'arrive que là. Un lampadaire n'a pas de porte
 */
export function doorCells(kind: KindId, x: number, z: number, s: number, side: number): [number, number][] {
  if (kind === 'lamp') return [];
  const [a, b] = doorSpan(s);
  return sideCells(x, z, s, side).slice(a, b + 1);
}

/**
 * Rotation qui tourne la façade vers la route : le côté qui la longe le plus (à égalité, celui dont la porte donne sur la
 * route, puis la rotation actuelle) ; sans route contre le bâtiment, vers la plus proche à quelques cases ; sinon rot inchangée
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
  // cases de route le long de chaque côté (une demi de plus si la route passe devant la porte)
  const along = (r: number) => {
    let n = 0;
    for (const [cx, cz] of sideCells(x, z, s, r)) if (roadAt(cx, cz)) n++;
    return n && doorCells(kind, x, z, s, r).some(([cx, cz]) => roadAt(cx, cz)) ? n + 0.5 : n;
  };
  let best = rot, most = along(rot);
  for (let k = 0; k < 4; k++) { const n = along(k); if (n > most) { most = n; best = k; } }
  if (most > 0) return best;
  // pas de route contre le bâtiment : la plus proche, à 4 cases au plus, décide du côté
  const near = nearRoadSide(world, x, z, s);
  return near < 0 ? rot : near;
}

/** Côté de l'emprise tourné vers la route la plus proche, à 4 cases au plus (-1 s'il n'y en a pas) */
export function nearRoadSide(world: World, x: number, z: number, s: number): number {
  const roadAt = (cx: number, cz: number) => world.inCells(cx, cz) && world.road[world.ci(cx, cz)] === 1;
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
  if (near === Infinity) return -1;
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 0 : 2);
}

/** Cellule d'origine de l'empreinte d'un bâtiment centré sous un point monde */
export function footprintOrigin(kind: KindId, px: number, pz: number) {
  const s = KINDS[kind].size;
  if (s === 1) return { x: Math.floor(px), z: Math.floor(pz) };
  if (s === 3) return { x: Math.floor(px) - 1, z: Math.floor(pz) - 1 };
  if (s === 4) return { x: Math.round(px) - 2, z: Math.round(pz) - 2 };
  return { x: Math.round(px) - 1, z: Math.round(pz) - 1 };
}
