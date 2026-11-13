import { World, N } from './world';
import { riverCourse } from './continent';

/** Distance (cases) au tracé de la rivière en deçà de laquelle l'eau prend le sens du tracé */
const COURSE_REACH = 7;

let courseKey = '';
let courseDir: Float32Array | null = null;

/**
 * Sens de la rivière générée, case par case (x, z, 2 nombres par case ; 0, 0 loin du tracé) : la tangente du tracé de
 * la source vers l'embouchure, prise au point du tracé le plus proche, à `COURSE_REACH` cases au plus. Gardé en cache
 * pour la carte (le tracé ne dépend que de la graine)
 */
export function riverDirs(w: World): Float32Array {
  const key = `${w.mapId}|${w.seed}|${w.gen}|${N}`;
  if (key === courseKey && courseDir) return courseDir;
  const dir = new Float32Array(N * N * 2), best = new Float32Array(N * N).fill(Infinity);
  const pts = riverCourse(w.gen, w.seed, N);
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[Math.max(0, i - 2)], [bx, bz] = pts[Math.min(pts.length - 1, i + 2)];
    const tl = Math.hypot(bx - ax, bz - az);
    if (tl < 1e-6) continue;
    const [px, pz] = pts[i], tx = (bx - ax) / tl, tz = (bz - az) / tl;
    for (let z = Math.max(0, Math.floor(pz - COURSE_REACH)); z <= Math.min(N - 1, Math.ceil(pz + COURSE_REACH)); z++)
      for (let x = Math.max(0, Math.floor(px - COURSE_REACH)); x <= Math.min(N - 1, Math.ceil(px + COURSE_REACH)); x++) {
        const d = Math.hypot(x + 0.5 - px, z + 0.5 - pz), k = z * N + x;
        if (d > COURSE_REACH || d >= best[k]) continue;
        best[k] = d; dir[k * 2] = tx; dir[k * 2 + 1] = tz;
      }
  }
  courseKey = key; courseDir = dir;
  return dir;
}

/**
 * Courant des rivières (purement visuel), une case par texel dans `data` (RGBA, octets) : rg direction (0 … 255 pour
 * -1 … 1), b force, a = 255 sur l'eau qui coule. Seulement les cases d'eau (`cellAvg < -0.05`, hors lac) à 4 cases au plus
 * d'une rive. L'axe suit le bord de l'eau ; le sens va de la montagne à la mer : celui du tracé de la rivière générée
 * (`riverCourse`) près de lui, sinon (eau creusée par le joueur, anciennes cartes) vers les berges plus basses le long de l'axe
 */
export function computeFlow(w: World, data: Uint8Array) {
  const R = 4, S = N + 1;
  const wet = (k: number) => w.cellAvg(k % N, Math.floor(k / N)) < -0.05 && !w.lake[k];
  // tables cumulées : somme des hauteurs et nombre de cases de terre, pour une moyenne en carré en temps constant
  const sumH = new Float64Array(S * S), cnt = new Float64Array(S * S), land = new Int16Array(N * N).fill(-1), q: number[] = [];
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const k = z * N + x, dry = !wet(k), i = (z + 1) * S + x + 1;
      sumH[i] = (dry ? w.cellAvg(x, z) : 0) + sumH[i - 1] + sumH[i - S] - sumH[i - S - 1];
      cnt[i] = (dry ? 1 : 0) + cnt[i - 1] + cnt[i - S] - cnt[i - S - 1];
      if (dry) { land[k] = 0; q.push(k); }
    }
  const nb = (k: number) => { const x = k % N, z = Math.floor(k / N); return [x > 0 ? k - 1 : -1, x < N - 1 ? k + 1 : -1, z > 0 ? k - N : -1, z < N - 1 ? k + N : -1]; };
  // largeur : distance à la rive, au plus quelques cases
  for (let h = 0; h < q.length; h++) { const d = land[q[h]]; if (d >= 4) continue; for (const j of nb(q[h])) if (j >= 0 && land[j] < 0) { land[j] = d + 1; q.push(j); } }
  const bank = (x: number, z: number) => {
    const x0 = Math.max(0, x - R), z0 = Math.max(0, z - R), x1 = Math.min(N, x + R + 1), z1 = Math.min(N, z + R + 1);
    const c = cnt[z1 * S + x1] - cnt[z0 * S + x1] - cnt[z1 * S + x0] + cnt[z0 * S + x0];
    return c ? (sumH[z1 * S + x1] - sumH[z0 * S + x1] - sumH[z1 * S + x0] + sumH[z0 * S + x0]) / c : 0;
  };
  // axe du chenal : la pente moyenne des berges va surtout d'une rive à l'autre (une rive plus haute que l'autre) ; l'axe
  // vient donc du bord de l'eau. Part de terre en carré de rayon 2, son gradient (vers les rives), puis tenseur de
  // structure de ce gradient en carré de rayon 3 : son vecteur propre mineur suit le chenal, même en son milieu où le
  // gradient s'annule
  const box = (t: Float64Array, x: number, z: number, r: number) => {
    const x0 = Math.max(0, x - r), z0 = Math.max(0, z - r), x1 = Math.min(N, x + r + 1), z1 = Math.min(N, z + r + 1);
    return [t[z1 * S + x1] - t[z0 * S + x1] - t[z1 * S + x0] + t[z0 * S + x0], (x1 - x0) * (z1 - z0)];
  };
  const dryF = new Float32Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const [c, a] = box(cnt, x, z, 2); dryF[z * N + x] = c / a; }
  const jxx = new Float64Array(S * S), jxz = new Float64Array(S * S), jzz = new Float64Array(S * S);
  for (let z = 0; z < N; z++)
    for (let x = 0; x < N; x++) {
      const gx = dryF[z * N + Math.min(N - 1, x + 1)] - dryF[z * N + Math.max(0, x - 1)];
      const gz = dryF[Math.min(N - 1, z + 1) * N + x] - dryF[Math.max(0, z - 1) * N + x], i = (z + 1) * S + x + 1;
      jxx[i] = gx * gx + jxx[i - 1] + jxx[i - S] - jxx[i - S - 1];
      jxz[i] = gx * gz + jxz[i - 1] + jxz[i - S] - jxz[i - S - 1];
      jzz[i] = gz * gz + jzz[i - 1] + jzz[i - S] - jzz[i - S - 1];
    }
  const course = riverDirs(w);
  data.fill(0);
  for (let k = 0; k < N * N; k++) {
    if (!wet(k) || land[k] < 0) continue;
    const x = k % N, z = Math.floor(k / N);
    const a = box(jxx, x, z, 3)[0], b = box(jxz, x, z, 3)[0], c = box(jzz, x, z, 3)[0];
    if (a + c < 1e-6) continue;
    const th = 0.5 * Math.atan2(2 * b, a - c);
    let vx = -Math.sin(th), vz = Math.cos(th);
    const at = (s: number) => bank(Math.min(N - 1, Math.max(0, Math.round(x + vx * s))), Math.min(N - 1, Math.max(0, Math.round(z + vz * s))));
    const drop = at(-4) - at(4);
    // sens : celui du tracé de la rivière quand l'axe le suit à peu près ; sinon vers les berges plus basses, 4 cases
    // plus loin le long de l'axe
    const cx = course[k * 2], cz = course[k * 2 + 1], along = vx * cx + vz * cz;
    if (Math.abs(along) > 0.3 ? along < 0 : drop < 0) { vx = -vx; vz = -vz; }
    const narrow = Math.min(1, Math.max(0, (4.5 - land[k]) / 2.5)), strong = Math.min(1, 0.45 + Math.abs(drop) * 1.5);
    data[k * 4] = Math.round((vx * 0.5 + 0.5) * 255);
    data[k * 4 + 1] = Math.round((vz * 0.5 + 0.5) * 255);
    data[k * 4 + 2] = Math.round(narrow * strong * 255);
    data[k * 4 + 3] = 255;
  }
}
