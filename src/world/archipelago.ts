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
/**
 * Île rivale : son peuple, la place plate de son village (centre, rayon) et sa forme, l'union de quelques lobes (le premier
 * porte le village) : presqu'îles et baies, et une surface tenue à environ `RIVAL_LAND` cases de terre
 */
export interface RivalIsle extends Isle { people: People; village: Isle; lobes: Isle[] }
/** Cases de terre d'une île rivale : la moitié de l'île principale */
export const RIVAL_LAND = 11900;
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
const layouts = new Map<string, ArchLayout>();
export function archLayout(seed: number, n = ARCH_N): ArchLayout {
  const key = `${seed}|${n}`;
  let lay = layouts.get(key);
  if (!lay) { lay = drawLayout(seed, n); layouts.set(key, lay); }
  return lay;
}

function drawLayout(seed: number, n: number): ArchLayout {
  const rnd = mulberry32(seed * 613 + 2027), R = (a: number, b: number) => lerp(a, b, rnd());
  const k = n / ARCH_N, m = MAIN_N;
  const ox = Math.round(R(0, 12) * k), oz = Math.round(R(80, 112) * k);
  const rival = (x: number, z: number, people: People, toward: number): RivalIsle => {
    const r = 66 * k, cx = x * k, cz = z * k;
    // le village : un replat vers le bras de mer qui sépare les deux îles, sur le premier lobe (au centre)
    const lobes: Isle[] = [{ x: cx, z: cz, r: r * R(0.62, 0.72) }];
    for (let i = 2 + Math.floor(rnd() * 3), a0 = rnd() * 6.28; i > 0; i--) {
      const a = a0 + i * R(1.2, 2.2), d = r * R(0.35, 0.6);
      lobes.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, r: r * R(0.32, 0.55) });
    }
    return { x: cx, z: cz, r, people, village: { x: cx, z: cz + toward * r * 0.3, r: 9 }, lobes };
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
  const out: ArchLayout = {
    main: { x: Math.min(ax, bx), z: Math.min(az, bz), n: m },
    rivals: rivals.map((q) => ({ ...isle(q), village: isle(q.village), lobes: q.lobes.map(isle) })),
    small: small.map(isle),
  };
  // surface des îles rivales : les lobes grandissent ou rétrécissent (autour du centre) jusqu'à environ RIVAL_LAND cases
  const { s, s2 } = noises(seed);
  for (const q of out.rivals)
    for (let pass = 0; pass < 3; pass++) {
      let land = 0;
      const R = Math.ceil(q.r * 2);
      for (let z = Math.max(0, Math.floor(q.z - R)); z < Math.min(n, q.z + R); z++)
        for (let x = Math.max(0, Math.floor(q.x - R)); x < Math.min(n, q.x + R); x++) if (lobeT(q.lobes, x + 0.5, z + 0.5, s, s2) < 1.02) land++;
      const f = Math.sqrt((RIVAL_LAND * k * k) / Math.max(1, land));
      if (Math.abs(f - 1) < 0.02) break;
      q.lobes = q.lobes.map((l) => ({ x: q.x + (l.x - q.x) * f, z: q.z + (l.z - q.z) * f, r: l.r * f }));
      q.r *= f;
    }
  return out;
}

/** Bruits des îles d'une graine */
const noises = (seed: number) => ({ s: new Simplex(seed * 5 + 77), s2: new Simplex(seed * 11 + 91) });

/**
 * Distance rapportée au bord d'une île faite de lobes (1 sur la côte) : la plus petite parmi ses lobes, chacun au rayon
 * déformé par un bruit (grandes avancées et baies, petites anses)
 */
export function lobeT(lobes: Isle[], x: number, z: number, s: Simplex, s2: Simplex) {
  const warp = 0.9 + 0.24 * s2.fbm(x * 0.018 + 7, z * 0.018 - 3, 3) + 0.07 * s.fbm(x * 0.07 + 13, z * 0.07 + 5, 2);
  let t = Infinity;
  for (const l of lobes) t = Math.min(t, Math.hypot(x - l.x, z - l.z) / (l.r * warp));
  return t;
}

/**
 * Relief d'une île de l'archipel au sommet (x, z) : un plateau vallonné aux côtes découpées. Le peuple oriental a une longue
 * arête rocheuse et aride au cœur de son île ; le peuple asiatique, des pitons escarpés (loin de son village)
 */
export function isleHeight(lobes: Isle[], x: number, z: number, s: Simplex, s2: Simplex, hills: number, q?: RivalIsle) {
  const t = lobeT(lobes, x, z, s, s2), inner = Math.max(0, 1 - t);
  let land = 0.7 + Math.pow(inner, 0.6) * (0.8 + hills * (0.5 + 0.5 * s.fbm(x * 0.045 + 31, z * 0.045, 3)));
  if (q) {
    const far = smoothstep(q.village.r + 6, q.village.r + 16, Math.hypot(x - q.village.x, z - q.village.z));
    if (q.people === 'orient') {
      // arête : crête du bruit, étirée, dans l'intérieur des terres
      const ridge = 1 - Math.abs(s2.fbm(x * 0.022 + 55, z * 0.011 - 21, 3));
      land += smoothstep(0.75, 0.95, ridge) * smoothstep(0.15, 0.5, inner) * 2.6 * far;
    } else {
      // pitons : sommets étroits et raides, semés par plaques
      const spot = s.fbm(x * 0.03 - 70, z * 0.03 + 12, 2), peak = Math.pow(smoothstep(0.3, 0.75, s2.noise2(x * 0.11 + 9, z * 0.11 - 40)), 1.6);
      land += peak * smoothstep(-0.1, 0.2, spot) * smoothstep(0.12, 0.4, inner) * 4.5 * far;
    }
  }
  return lerp(land, -1.3, smoothstep(0.92, 1.12, t));
}

/** Les îles rivales et les petites îles, posées sur le relief (le plus haut l'emporte) */
export function addIsles(hts: Float32Array, n: number, seed: number, lay: ArchLayout) {
  const { s, s2 } = noises(seed), S = n + 1;
  const all: [Isle, Isle[], number, RivalIsle?][] = [
    ...lay.rivals.map((q): [Isle, Isle[], number, RivalIsle] => [q, q.lobes, 2, q]),
    ...lay.small.map((q): [Isle, Isle[], number] => [q, [q], 1.4]),
  ];
  for (const [q, lobes, hills, rv] of all) {
    const R = Math.ceil(q.r * 2);
    for (let z = Math.max(0, Math.floor(q.z - R)); z <= Math.min(n, Math.ceil(q.z + R)); z++)
      for (let x = Math.max(0, Math.floor(q.x - R)); x <= Math.min(n, Math.ceil(q.x + R)); x++) {
        const h = isleHeight(lobes, x, z, s, s2, hills, rv);
        if (h > hts[z * S + x]) hts[z * S + x] = h;
      }
  }
}

/**
 * Climat de fond (température, humidité) d'une case hors du cadre de l'île principale : l'île du peuple oriental est
 * chaude et sèche (sable, palmiers), celle du peuple asiatique tempérée et humide (bambous, rizières, un peu de tropiques au
 * sud), les petites îles tropicales (récifs de corail autour) ; le large tempéré
 */
export function isleClimate(lay: ArchLayout, wx: number, wz: number, st: Simplex, sm: Simplex, seed: number): [number, number] {
  const x = wx + 0.5, z = wz + 0.5, { s, s2 } = noises(seed);
  // le large : tempéré et peu humide (sous les seuils des tropiques, 0,3, et du marais, 0,32 avec le bonus du bord de l'eau) ;
  // sinon l'eau y prendrait par plaques la teinte du marais, et des récifs de corail y pousseraient
  let t = 0.02 + st.fbm(x * 0.03, z * 0.03, 3) * 0.2, m = -0.2 + sm.fbm(x * 0.04 + 50, z * 0.04, 3) * 0.2;
  for (const q of lay.rivals) {
    // (jusqu'à la côte et un peu au-delà : plus loin, l'eau garderait la teinte du marais de l'île humide)
    if (Math.hypot(x - q.x, z - q.z) > q.r * 2) continue;
    const w = smoothstep(1.2, 0.95, lobeT(q.lobes, x, z, s, s2));
    if (w <= 0) continue;
    const [qt, qm] = q.people === 'orient' ? [0.5, -0.12] : [0.12, 0.38];
    t = lerp(t, qt + st.fbm(x * 0.03, z * 0.03, 3) * 0.25, w);
    m = lerp(m, qm + sm.fbm(x * 0.04 + 50, z * 0.04, 3) * 0.35, w);
  }
  for (const q of lay.small) {
    const w = smoothstep(1.4, 1.0, Math.hypot(x - q.x, z - q.z) / q.r);
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
