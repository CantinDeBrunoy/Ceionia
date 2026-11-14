import { Simplex } from './noise';
import { mulberry32, smoothstep, lerp } from '../core/rng';

/**
 * L'archipel (version 4 du générateur, carte de `ARCH_N` cases) : l'île principale garde le continent de la version 3 à sa
 * taille d'origine, dans un carré de `MAIN_N` cases (son « cadre ») ; de l'autre côté de la mer, deux îles rivales, chacune
 * d'environ la moitié de sa surface, séparées par un bras de mer, et une à trois petites îles. Tout se tire de la graine ; la
 * sauvegarde garde aussi la place des îles (`World.isles`) pour les systèmes qui en auront besoin
 */

/** Côté de la carte de l'archipel */
export const ARCH_N = 384;
/** Côté du cadre de l'île principale : le continent de la version 3, à la taille de la carte de 192 */
export const MAIN_N = 192;

/** Peuple d'une île rivale : style oriental ou style chinois / asiatique (voir `.claude/ile-secondaire.md`) */
export type People = 'orient' | 'asie';

/** Une île : centre et rayon moyen (cases, coordonnées du monde) */
export interface Isle { x: number; z: number; r: number }
/** Île rivale : son peuple et la place plate de son village (centre, rayon) */
export interface RivalIsle extends Isle { people: People; village: Isle }
/** Cadre : coin et côté d'un carré de la carte (cases) */
export interface Frame { x: number; z: number; n: number }

export interface ArchLayout {
  /** cadre de l'île principale */
  main: Frame;
  rivals: RivalIsle[];
  small: Isle[];
}

/**
 * Place des îles pour une graine. Le tirage se fait dans un repère où l'île principale est à l'ouest et les îles rivales à
 * l'est, l'une au nord, l'autre au sud ; puis le tout est tourné ou retourné (huit orientations)
 */
export function archLayout(seed: number, n = ARCH_N): ArchLayout {
  const rnd = mulberry32(seed * 613 + 2027), R = (a: number, b: number) => lerp(a, b, rnd());
  const k = n / ARCH_N, m = MAIN_N;
  const ox = Math.round(R(0, 12) * k), oz = Math.round(R(80, 112) * k);
  const rival = (x: number, z: number, people: People, toward: number): RivalIsle => {
    // (environ 11 900 cases de terre : la moitié de l'île principale)
    const r = R(64, 72) * k;
    // le village : un replat vers le bras de mer qui sépare les deux îles
    return { x: x * k, z: z * k, r, people, village: { x: x * k, z: z * k + toward * r * 0.32, r: 9 } };
  };
  const first: People = rnd() < 0.5 ? 'orient' : 'asie', second: People = first === 'orient' ? 'asie' : 'orient';
  const rivals = [rival(R(278, 290), R(90, 106), first, 1), rival(R(278, 290), R(278, 294), second, -1)];
  // petites îles : une à trois, parmi quelques places libres (au nord et au sud de l'île principale, au large des rivales)
  const spots: [number, number][] = [[100, 40], [100, 350], [345, 192], [226, 192]];
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  const small = spots.slice(0, 1 + Math.floor(rnd() * 3)).map(([x, z]) => ({ x: (x + R(-6, 6)) * k, z: (z + R(-6, 6)) * k, r: R(16, 22) * k }));
  const o = Math.floor(rnd() * 8);
  // orientation : chaque point passe par le même miroir / échange d'axes que le plan du continent
  const turn = (x: number, z: number): [number, number] => {
    let a = o & 1 ? n - x : x, b = o & 2 ? n - z : z;
    if (o & 4) [a, b] = [b, a];
    return [a, b];
  };
  const isle = <T extends Isle>(q: T): T => { const [x, z] = turn(q.x, q.z); return { ...q, x, z }; };
  const [ax, az] = turn(ox, oz), [bx, bz] = turn(ox + m, oz + m);
  return {
    main: { x: Math.min(ax, bx), z: Math.min(az, bz), n: m },
    rivals: rivals.map((q) => ({ ...isle(q), village: isle(q.village) })),
    small: small.map(isle),
  };
}

/** Relief d'une île de l'archipel au sommet (x, z) : un plateau vallonné aux côtes découpées, -Infinity loin d'elle */
export function isleHeight(q: Isle, x: number, z: number, s: Simplex, s2: Simplex, hills: number) {
  const d = Math.hypot(x - q.x, z - q.z);
  if (d > q.r * 1.6) return -Infinity;
  // rayon déformé : grandes avancées et baies, puis petites anses
  const rr = q.r * (0.9 + 0.24 * s2.fbm(x * 0.018 + q.x, z * 0.018 + q.z, 3) + 0.07 * s.fbm(x * 0.07 + 13, z * 0.07 - q.x, 2));
  const t = d / rr;
  const land = 0.7 + Math.pow(Math.max(0, 1 - t), 0.6) * (0.8 + hills * (0.5 + 0.5 * s.fbm(x * 0.045 + q.z, z * 0.045, 3)));
  return lerp(land, -1.3, smoothstep(0.92, 1.12, t));
}

/** Les îles rivales et les petites îles, posées sur le relief (le plus haut l'emporte) */
export function addIsles(hts: Float32Array, n: number, seed: number, lay: ArchLayout) {
  const s = new Simplex(seed * 5 + 77), s2 = new Simplex(seed * 11 + 91), S = n + 1;
  const all: [Isle, number][] = [...lay.rivals.map((q): [Isle, number] => [q, 2.6]), ...lay.small.map((q): [Isle, number] => [q, 1.4])];
  for (const [q, hills] of all) {
    const R = Math.ceil(q.r * 1.6);
    for (let z = Math.max(0, Math.floor(q.z - R)); z <= Math.min(n, Math.ceil(q.z + R)); z++)
      for (let x = Math.max(0, Math.floor(q.x - R)); x <= Math.min(n, Math.ceil(q.x + R)); x++) {
        const h = isleHeight(q, x, z, s, s2, hills);
        if (h > hts[z * S + x]) hts[z * S + x] = h;
      }
  }
}

/**
 * Climat de fond (température, humidité) d'une case hors du cadre de l'île principale : l'île du peuple oriental est
 * chaude et sèche (sable, palmiers), celle du peuple asiatique tempérée et humide (bambous, rizières, un peu de tropiques au
 * sud), les petites îles tropicales
 */
export function isleClimate(lay: ArchLayout, wx: number, wz: number, st: Simplex, sm: Simplex): [number, number] {
  const x = wx + 0.5, z = wz + 0.5;
  let t = 0.15 + st.fbm(x * 0.03, z * 0.03, 3) * 0.3, m = 0.1 + sm.fbm(x * 0.04 + 50, z * 0.04, 3) * 0.5;
  for (const q of lay.rivals) {
    const w = smoothstep(1.5, 1.0, Math.hypot(x - q.x, z - q.z) / q.r);
    if (w <= 0) continue;
    const [qt, qm] = q.people === 'orient' ? [0.5, -0.12] : [0.12, 0.38];
    t = lerp(t, qt + st.fbm(x * 0.03, z * 0.03, 3) * 0.25, w);
    m = lerp(m, qm + sm.fbm(x * 0.04 + 50, z * 0.04, 3) * 0.35, w);
  }
  for (const q of lay.small) {
    const w = smoothstep(1.6, 1.0, Math.hypot(x - q.x, z - q.z) / q.r);
    if (w > 0) { t = lerp(t, 0.42, w); m = lerp(m, 0.3, w); }
  }
  return [t, m];
}

/**
 * Le village de chaque peuple : un replat à 1,3 au rayon du village, raccordé en pente douce au relief alentour, sans arbres
 * ni rochers. Fait après les dunes, les forêts et les étangs, qui le recouvriraient
 */
export function flattenVillages(hts: Float32Array, veg: Uint8Array, n: number, lay: ArchLayout) {
  const S = n + 1;
  for (const q of lay.rivals) {
    const v = q.village, R = v.r + 5;
    for (let z = Math.max(0, Math.floor(v.z - R)); z <= Math.min(n, Math.ceil(v.z + R)); z++)
      for (let x = Math.max(0, Math.floor(v.x - R)); x <= Math.min(n, Math.ceil(v.x + R)); x++) {
        const d = Math.hypot(x - v.x, z - v.z), i = z * S + x;
        hts[i] = lerp(hts[i], 1.3, smoothstep(R, v.r, d));
        if (x < n && z < n && d < v.r + 1) veg[z * n + x] = 0;
      }
  }
}
