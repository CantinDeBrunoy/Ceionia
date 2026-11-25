/**
 * Routes en courbe (mode « Libre » de l'outil Route) : une ligne adoucie d'un point à un autre. Pour la simulation, ce n'est
 * qu'une suite de cases de route ordinaires, voisines par un côté (habitants, charrettes et secours y passent comme ailleurs) ;
 * la vue des routes la dessine courbe, les trajets la suivent
 */

/** Route en courbe : sa ligne médiane (x, z à la suite, en cases, au centième) */
export interface RoadCurve { id: number; pts: number[] }

/** Pas d'échantillonnage d'une courbe (en cases) : sa rasterisation et son dessin en partent */
export const CURVE_STEP = 0.1;

/** Points de la ligne tous les `step` le long de son tracé (x, z à la suite), du premier au dernier point compris */
export function sampleCurve(pts: number[], step = CURVE_STEP): number[] {
  const out: number[] = [];
  if (pts.length < 2) return out;
  out.push(pts[0], pts[1]);
  let carry = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], dx = pts[i + 2] - ax, dz = pts[i + 3] - az, len = Math.hypot(dx, dz);
    if (len < 1e-9) continue;
    let t = step - carry;
    for (; t < len - 1e-9; t += step) out.push(ax + (dx * t) / len, az + (dz * t) / len);
    carry = len - (t - step);
  }
  const lx = pts[pts.length - 2], lz = pts[pts.length - 1];
  if (out[out.length - 2] !== lx || out[out.length - 1] !== lz) out.push(lx, lz);
  return out;
}

/**
 * Cases que couvre la ligne, dans l'ordre, chacune voisine de la précédente par un côté : quand la ligne passe d'une case à
 * sa voisine en diagonale (par un coin), elle prend aussi l'une des deux cases d'à côté, celle dont elle passe le plus près.
 * Hors de la carte (`n` cases de côté), rien
 */
export function rasterize(pts: number[], n: number): number[] {
  const s = sampleCurve(pts), out: number[] = [];
  const push = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= n || z >= n) return;
    const k = z * n + x;
    if (out[out.length - 1] !== k) out.push(k);
  };
  let px = 0, pz = 0;
  for (let i = 0; i + 1 < s.length; i += 2) {
    const x = Math.floor(s[i]), z = Math.floor(s[i + 1]);
    if (i > 0 && x !== px && z !== pz) {
      const mx = (s[i - 2] + s[i]) / 2, mz = (s[i - 1] + s[i + 1]) / 2;
      if (Math.hypot(x + 0.5 - mx, pz + 0.5 - mz) <= Math.hypot(px + 0.5 - mx, z + 0.5 - mz)) push(x, pz); else push(px, z);
    }
    push(x, z);
    px = x; pz = z;
  }
  return out;
}

/** Ligne adoucie (Chaikin, `iters` passes) ; les deux bouts restent en place */
export function chaikin(pts: [number, number][], iters: number): [number, number][] {
  let line = pts;
  for (let it = 0; it < iters && line.length > 2; it++) {
    const out: [number, number][] = [line[0]];
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i], b = line[i + 1];
      if (i > 0) out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (i < line.length - 2) out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(line[line.length - 1]);
    line = out;
  }
  return line;
}

/** Points d'une ligne au centième (une courbe sauvegardée se relit exactement, ses cases restent les mêmes) */
export const roundPts = (pts: number[]) => pts.map((v) => Math.round(v * 100) / 100);

/**
 * Ligne coupée là où elle traverse une case qui n'est plus une route (`alive` faux) : les morceaux qui restent, chacun d'au
 * moins deux points. On suit les cases comme `rasterize` (la case de coin d'un pas en diagonale compte aussi). Un morceau
 * garde un point tous les `CURVE_STEP` le long de son tracé, sauf ceux qui sont alignés avec leurs voisins
 */
export function cutCurve(pts: number[], n: number, alive: (k: number) => boolean): number[][] {
  const s = sampleCurve(pts), out: number[][] = [];
  const ok = (x: number, z: number) => x < 0 || z < 0 || x >= n || z >= n || alive(z * n + x);
  let cur: number[] = [], px = 0, pz = 0;
  const close = () => { if (cur.length >= 4) out.push(slim(cur)); cur = []; };
  for (let i = 0; i + 1 < s.length; i += 2) {
    const x = Math.floor(s[i]), z = Math.floor(s[i + 1]);
    let live = ok(x, z);
    if (live && i > 0 && x !== px && z !== pz) {
      const mx = (s[i - 2] + s[i]) / 2, mz = (s[i - 1] + s[i + 1]) / 2;
      live = Math.hypot(x + 0.5 - mx, pz + 0.5 - mz) <= Math.hypot(px + 0.5 - mx, z + 0.5 - mz) ? ok(x, pz) : ok(px, z);
    }
    if (live) cur.push(s[i], s[i + 1]); else close();
    px = x; pz = z;
  }
  close();
  return out;
}

/** Retire les points alignés avec leurs voisins (à moins d'un demi-centième de la corde) ; les deux bouts restent */
function slim(p: number[]): number[] {
  const out = [p[0], p[1]];
  for (let i = 2; i + 3 < p.length; i += 2) {
    const ax = out[out.length - 2], az = out[out.length - 1], bx = p[i + 2], bz = p[i + 3], dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len > 1e-9 && Math.abs((p[i] - ax) * dz - (p[i + 1] - az) * dx) / len < 0.005) continue;
    out.push(p[i], p[i + 1]);
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}
