import type { World } from './world';

/**
 * La traversée en galère entre le continent et l'île du portail (pour la vue seulement : les recrues, les convois, les
 * soldats renvoyés au village) : la rive du continent d'où l'on part (au port s'il y en a un sur la bonne côte, sinon la
 * rive la plus proche de l'île), le mouillage au large de cette rive, celui au large de la plage de l'île, et cette plage.
 * Tout droit sur l'eau entre les deux mouillages
 */
export interface FerryRoute {
  /** la rive du continent (où l'on embarque, où l'on débarque au retour) */
  shore: [number, number];
  /** le mouillage au large de la rive du continent */
  from: [number, number];
  /** le mouillage au large de la plage de l'île */
  to: [number, number];
  /** la plage de l'île (où l'on débarque) */
  beach: [number, number];
}

/** Profondeur où mouille la galère (hauteur moyenne de la case, sous le niveau de la mer) */
const DEEP = -0.3;

/** La route de la galère, null sans île ni rive d'où l'on gagne l'île tout droit sur l'eau */
export function ferryRoute(w: World): FerryRoute | null {
  const p = w.portal;
  if (!p) return null;
  const n = w.n, wet = (x: number, z: number) => !w.inCells(Math.floor(x), Math.floor(z)) || (w.cellAvg(Math.floor(x), Math.floor(z)) < DEEP && !w.lake[w.ci(Math.floor(x), Math.floor(z))]);
  // les rives du continent : terre au bord de la mer (pas un lac), hors de l'île
  const harbors = [...w.buildings.values()].filter((b) => b.kind === 'harbor' && !w.onPortalIsland(b.x, b.z));
  const cand: [number, number, number][] = [];
  for (let z = 1; z < n - 1; z++)
    for (let x = 1; x < n - 1; x++) {
      if (w.onPortalIsland(x, z) || w.cellAvg(x, z) < 0.1 || w.lake[w.ci(x, z)]) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.cellAvg(x + dx, z + dz) < -0.05 && !w.lake[w.ci(x + dx, z + dz)])) continue;
      const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z);
      // un port, pas trop loin du plus court chemin, passe devant
      const port = harbors.some((b) => Math.hypot(b.x - x, b.z - z) < 4) ? 12 : 0;
      cand.push([x + 0.5, z + 0.5, d - port]);
    }
  cand.sort((a, b) => a[2] - b[2]);
  for (const [sx, sz] of cand.slice(0, 400)) {
    const r = straight(w, p.x, p.z, sx, sz, wet);
    if (r) return { shore: [sx, sz], ...r };
  }
  return null;
}

/**
 * Depuis la rive (sx, sz), tout droit vers le portail : le premier point d'eau profonde (le mouillage du continent), puis,
 * sans toucher d'autre terre que l'île, le dernier point d'eau avant elle et sa plage. Null si la ligne touche une autre terre
 */
function straight(w: World, px: number, pz: number, sx: number, sz: number, wet: (x: number, z: number) => boolean) {
  const dx = px - sx, dz = pz - sz, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  let from: [number, number] | null = null, to: [number, number] | null = null;
  for (let s = 0.5; s < L; s += 0.25) {
    const x = sx + ux * s, z = sz + uz * s, cx = Math.floor(x), cz = Math.floor(z);
    const isle = w.onPortalIsland(cx, cz);
    if (!from) {
      if (wet(x, z)) from = [x + ux * 0.6, z + uz * 0.6];
      else if (s > 6 || w.cellAvg(cx, cz) > 0.12) { if (s > 1) return null; }
      continue;
    }
    if (wet(x, z)) { to = [x, z]; continue; }
    // (un haut-fond : on passe)
    if (w.inCells(cx, cz) && w.cellAvg(cx, cz) < 0.05 && !w.lake[w.ci(cx, cz)]) continue;
    // de la terre : l'île (on y touche), sinon un autre rivage en travers de la route
    if (!isle) return null;
    if (!to) return null;
    // la plage : un peu plus loin, sur la terre ferme de l'île
    let bx = x, bz = z;
    for (let k = 0; k < 12 && w.cellAvg(Math.floor(bx), Math.floor(bz)) < 0.15; k++) { bx += ux * 0.25; bz += uz * 0.25; }
    // le mouillage de l'île : un peu en retrait de l'eau peu profonde
    return { from, to: [to[0] - ux * 0.4, to[1] - uz * 0.4] as [number, number], beach: [bx + ux * 0.3, bz + uz * 0.3] as [number, number] };
  }
  return null;
}
