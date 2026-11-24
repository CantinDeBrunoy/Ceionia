import { Simplex } from './noise';
import { mulberry32, smoothstep, lerp, wrapAngle } from '../core/rng';

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

/**
 * Toute petite île : rocher, îlot (1 à 6 cases), banc de sable allongé (`a` : son axe) ou atoll (anneau de récif et son
 * lagon). Plus nombreuses près des côtes des îles, quelques-unes au large ; jamais dans le cadre de l'île principale
 */
export interface TinyIsle extends Isle { kind: 'rock' | 'islet' | 'sandbar' | 'atoll'; a: number }

export interface ArchLayout {
  /** cadre de l'île principale */
  main: Frame;
  rivals: RivalIsle[];
  small: Isle[];
  tiny: TinyIsle[];
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
    // (rayon 15 : la ville d'un peuple, temple ou mosquée au centre, palais sur un point haut, marché, remparts, port sur la côte
    // à 20 ou 25 cases)
    return { x: cx, z: cz, r, people, village: { x: cx, z: cz + toward * r * 0.42, r: 15 }, lobes };
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
    tiny: [],
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
  out.tiny = drawTiny(seed, n, out, s, s2);
  return out;
}

/**
 * Toutes petites îles : des points tirés au hasard, gardés surtout près des côtes (entre 1,15 et 1,8 fois le bord d'une île),
 * rarement au large, à l'écart les uns des autres, hors du cadre de l'île principale et loin du bord de la carte
 */
function drawTiny(seed: number, n: number, lay: ArchLayout, s: Simplex, s2: Simplex): TinyIsle[] {
  const rnd = mulberry32(seed * 733 + 41), R = (a: number, b: number) => lerp(a, b, rnd()), out: TinyIsle[] = [], f = lay.main, k = n / ARCH_N;
  const shore = (x: number, z: number) => {
    let t = Infinity;
    for (const q of lay.rivals) if (Math.hypot(x - q.x, z - q.z) < q.r * 2.4) t = Math.min(t, lobeT(q.lobes, x, z, s, s2));
    for (const q of lay.small) t = Math.min(t, Math.hypot(x - q.x, z - q.z) / q.r);
    return t;
  };
  for (let i = 0; i < 2500 && out.length < 70 * k * k; i++) {
    const x = R(10, n - 10), z = R(10, n - 10);
    if (x > f.x - 8 && z > f.z - 8 && x < f.x + f.n + 8 && z < f.z + f.n + 8) continue;
    const t = shore(x, z);
    if (t < 1.15 || rnd() > (t < 1.8 ? 0.5 : 0.035)) continue;
    const roll = rnd();
    const kind: TinyIsle['kind'] = t > 1.8 && roll < 0.22 ? 'atoll' : roll < 0.3 ? 'sandbar' : roll < 0.55 ? 'rock' : 'islet';
    const r = kind === 'atoll' ? R(4, 7) : kind === 'sandbar' ? R(3, 5) : kind === 'rock' ? R(0.6, 1.1) : R(1, 2.6);
    if (out.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 4)) continue;
    out.push({ x, z, r, kind, a: R(0, Math.PI) });
  }
  return out;
}

/** Relief d'une toute petite île au sommet (x, z) : -Infinity loin d'elle */
export function tinyHeight(q: TinyIsle, x: number, z: number, s: Simplex) {
  const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz);
  if (d > q.r * 2 + 3) return -Infinity;
  const j = 1 + 0.25 * s.noise2(x * 0.5 + q.x, z * 0.5 + q.z);
  switch (q.kind) {
    case 'rock': return lerp(1 + q.r * 0.5, -1, smoothstep(q.r * 0.6, q.r * 1.8, d / j));
    case 'islet': return lerp(0.45 + q.r * 0.3, -1, smoothstep(q.r * 0.5, q.r * 1.6, d / j));
    case 'sandbar': {
      // banc de sable : une longue bande basse, à peine sortie de l'eau, selon son axe
      const c = Math.cos(q.a), sn = Math.sin(q.a), al = (dx * c + dz * sn) / q.r, ac = (dz * c - dx * sn) / 1.1;
      return lerp(0.2, -1, smoothstep(0.7, 1.6, Math.hypot(al, ac) / j));
    }
    default: {
      // atoll : un anneau de récif à fleur d'eau, un lagon peu profond au milieu, la mer autour
      const ring = Math.abs(d / j - q.r);
      if (d / j < q.r) return Math.max(-0.6, lerp(0.25, -0.6, smoothstep(0.4, 1.8, ring)));
      return lerp(0.25, -1, smoothstep(0.4, 2.2, ring));
    }
  }
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
  for (const q of lay.tiny) {
    const R = Math.ceil(q.r * 2 + 3);
    for (let z = Math.max(0, Math.floor(q.z - R)); z <= Math.min(n, Math.ceil(q.z + R)); z++)
      for (let x = Math.max(0, Math.floor(q.x - R)); x <= Math.min(n, Math.ceil(q.x + R)); x++) {
        const h = tinyHeight(q, x, z, s);
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
  for (const q of lay.tiny) {
    if (q.kind !== 'atoll') continue;
    const w = smoothstep(q.r + 5, q.r + 2, Math.hypot(x - q.x, z - q.z));
    if (w > 0) { t = lerp(t, 0.45, w); m = lerp(m, 0.3, w); }
  }
  for (const q of lay.small) {
    const w = smoothstep(1.4, 1.0, Math.hypot(x - q.x, z - q.z) / q.r);
    if (w > 0) { t = lerp(t, 0.42, w); m = lerp(m, 0.3, w); }
  }
  return [t, m];
}

/**
 * Le village de chaque peuple : un replat à 1,3, tout plat au cœur (0,6 fois le rayon), qui garde 30 % du relief vers son
 * bord (un point haut pour le palais) et se raccorde en 8 cases au relief alentour, sans arbres
 * ni rochers. Fait après les dunes, les forêts et les étangs, qui le recouvriraient
 */
export function flattenVillages(hts: Float32Array, veg: Uint8Array, n: number, lay: ArchLayout) {
  const S = n + 1;
  for (const q of lay.rivals) {
    const v = q.village, R = v.r + 8;
    for (let z = Math.max(0, Math.floor(v.z - R)); z <= Math.min(n, Math.ceil(v.z + R)); z++)
      for (let x = Math.max(0, Math.floor(v.x - R)); x <= Math.min(n, Math.ceil(v.x + R)); x++) {
        const d = Math.hypot(x - v.x, z - v.z), i = z * S + x;
        // tout plat au cœur ; vers le bord, le replat garde 30 % du relief (un point haut pour le palais), puis se raccorde
        const w = d < v.r * 0.6 ? 1 : d < v.r ? lerp(1, 0.7, (d - v.r * 0.6) / (v.r * 0.4)) : 0.7 * smoothstep(R, v.r, d);
        hts[i] = lerp(hts[i], 1.3, w);
        if (x < n && z < n && d < v.r + 1) veg[z * n + x] = 0;
      }
  }
}

// ---------- La zone de chaque île : la concession (chez l'allié) ou la tête de pont (chez le rival) ----------

/**
 * Le nouveau monde (chantier C) : chaque île rivale reçoit une zone, sur la côte tournée vers notre île, à côté de la ville,
 * séparée d'elle par une limite nette et un seul passage. Sur les cartes créées depuis (`World.zoneGen`), la limite est dans
 * le relief : une ria (un bras de mer étroit, chez le peuple asiatique) ou une arête et son col (chez le peuple oriental), et
 * la zone un replat doux, une presqu'île au besoin. Tout se tire d'un générateur à part : la place des îles et des villages ne
 * bouge pas, ni le plan des villes (la limite passe au-delà de leurs champs). Les anciennes cartes gardent leur relief : la
 * zone y est cherchée sur le relief existant et bornée par un décor (voir `world/concession.ts`)
 */
export interface ZoneSite {
  /** centre et rayon de la zone (cases du monde) */
  x: number; z: number; r: number;
  /** direction de la ville vers la zone (vers notre île, tournée au besoin pour que l'île porte la limite) */
  ux: number; uz: number;
  /** la limite : à `d0` cases du centre du village, le long de la direction ; demi-longueur `half` ; le passage, à `pass` cases de son milieu */
  d0: number; half: number; pass: number;
  limit: 'ria' | 'ridge';
}
/** La limite passe à cette distance au-delà du rayon du village (ses champs, son usine et son arcologie restent en deçà) */
export const ZONE_GAP = 21;
/** Rayon de la zone (cases) */
export const ZONE_R = 11;

let zoneRelief = true;
/** Pour les tests : générer une carte sans la zone dans le relief (une « ancienne » carte) */
export function setZoneRelief(on: boolean) { zoneRelief = on; }
export const zoneReliefOn = () => zoneRelief;

/** La place de la zone d'une île rivale (pure : la graine et la place des îles ; son propre générateur) */
export function zoneSite(seed: number, q: RivalIsle, main: Frame): ZoneSite {
  const { s, s2 } = noises(seed), rnd = mulberry32(seed * 389 + (q.people === 'orient' ? 71 : 173));
  const v = q.village, d0min = v.r + ZONE_GAP, a0 = Math.atan2(main.z + main.n / 2 - v.z, main.x + main.n / 2 - v.x);
  const along = (a: number, t: number): [number, number] => [v.x + Math.cos(a) * t, v.z + Math.sin(a) * t];
  /** la côte, dans la direction a, en partant de la limite */
  const coast = (a: number) => { for (let t = d0min; t < 90; t += 0.5) if (lobeT(q.lobes, ...along(a, t), s, s2) >= 1) return t; return 90; };
  // la mer la plus proche du village (à peu près celle que prend le plan de la ville : son port, sa plage à 60° au plus)
  let sea = 0, sd = Infinity;
  for (let i = 0; i < 72; i++) {
    const b = (i / 72) * Math.PI * 2;
    for (let t = 4; t < sd; t += 0.5) if (lobeT(q.lobes, ...along(b, t), s, s2) >= 1) { sd = t; sea = b; break; }
  }
  // vers notre île ; tournée (jusqu'à ±1,5 radian) si l'île n'y porte pas la limite, si la mer est trop loin, ou pour rester
  // à l'écart de la plage et du port de la ville (le plan de la ville ne bouge pas)
  let a = a0, best = Infinity, ct = coast(a0);
  for (let k = 0; k <= 30; k++) {
    const da = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1, c = coast(a0 + da), off = Math.abs(wrapAngle(a0 + da - sea));
    const sc = Math.abs(da) * 10 + (c < d0min + 8 ? 1000 : 0) + Math.max(0, c - d0min - 26) * 3 + Math.max(0, 1.6 - off) * 400;
    if (sc < best) { best = sc; a = a0 + da; ct = c; }
  }
  const ux = Math.cos(a), uz = Math.sin(a), r = ZONE_R * (0.96 + rnd() * 0.1);
  // la zone touche la côte (sa pointe s'avance un peu sur la mer : la plage, l'eau profonde) ; la limite la suit, au-delà des champs de la ville
  const dc = Math.max(d0min + 9, ct - r * 0.75), d0 = Math.max(d0min, dc - r - 1.5);
  // la limite barre toute la largeur de l'île à cet endroit : le passage est le seul chemin de la ville à la zone
  let half = r + 5;
  for (const sg of [-1, 1]) {
    let t = 0;
    while (t < 34 && lobeT(q.lobes, v.x + ux * d0 - uz * t * sg, v.z + uz * d0 + ux * t * sg, s, s2) < 1.02) t += 0.5;
    half = Math.max(half, Math.min(34, t + 2));
  }
  // le passage : le point le plus intérieur de la limite, face à la zone (à 5 cases au plus de son axe)
  let pass = 0, inner = Infinity;
  for (let sd2 = -5; sd2 <= 5; sd2 += 0.5) {
    const t = lobeT(q.lobes, v.x + ux * d0 - uz * sd2, v.z + uz * d0 + ux * sd2, s, s2) + rnd() * 0.04;
    if (t < inner) { inner = t; pass = sd2; }
  }
  return { x: v.x + ux * dc, z: v.z + uz * dc, r, ux, uz, d0, half, pass, limit: q.people === 'asie' ? 'ria' : 'ridge' };
}

/** Le fond de la ria : une eau qu'on voit bien, qui ne se traverse pas */
export const RIA_H = -0.75;
/** Le replat de la zone, à cette hauteur */
export const ZONE_H = 1.1;

/**
 * Pose la zone de chaque île rivale dans le relief (cartes neuves de l'archipel) : le replat (une presqu'île s'il déborde sur
 * la mer, sa plage en pente douce), puis la limite, une ria ou une arête, coupée par un passage de trois cases
 */
export function addZones(hts: Float32Array, n: number, seed: number, lay: ArchLayout) {
  if (!zoneRelief) return;
  const { s } = noises(seed), S = n + 1;
  for (const q of lay.rivals) {
    const z0 = zoneSite(seed, q, lay.main), v = q.village, R = Math.ceil(z0.r * 1.4 + z0.half);
    const wx = -z0.uz, wz = z0.ux;
    for (let z = Math.max(0, Math.floor(z0.z - R)); z <= Math.min(n, Math.ceil(z0.z + R)); z++)
      for (let x = Math.max(0, Math.floor(z0.x - R)); x <= Math.min(n, Math.ceil(z0.x + R)); x++) {
        const i = z * S + x, along = (x - v.x) * z0.ux + (z - v.z) * z0.uz, side = (x - v.x) * wx + (z - v.z) * wz;
        let h = hts[i];
        const orig = h;
        // le replat : un disque déformé, seulement au-delà de la limite (rien ne bouge du côté de la ville)
        const dz = Math.hypot(x - z0.x, z - z0.z) / (z0.r * (1 + 0.12 * s.noise2(x * 0.09 + 17, z * 0.09 - 5)));
        const wp = smoothstep(1.2, 0.8, dz) * smoothstep(z0.d0 + 0.5, z0.d0 + 3, along);
        if (wp > 0) h = lerp(h, ZONE_H + 0.18 * s.fbm(x * 0.07 - 9, z * 0.07 + 3, 2), wp);
        // la limite : une bande le long de la direction perpendiculaire, coupée au passage
        if (Math.abs(side) <= z0.half) {
          const end = smoothstep(z0.half, z0.half - 3, Math.abs(side)), gap = smoothstep(1.2, 2.2, Math.abs(side - z0.pass));
          if (z0.limit === 'ria') {
            // une vraie eau (le plan de la ville n'y regarde pas : la zone se tient loin de sa mer, de son port et de sa plage)
            const k = smoothstep(2.3, 1.3, Math.abs(along - z0.d0)) * end * gap;
            if (k > 0 && h > RIA_H) h = lerp(h, RIA_H, k);
          } else {
            // l'arête : une crête rocheuse, au moins à 4, un col au passage ; elle descend dans l'eau peu profonde en un cap
            // rocheux (on ne la contourne pas par la plage)
            const k = smoothstep(2.6, 0.2, Math.abs(along - z0.d0)) * end * gap * smoothstep(-0.7, 0.1, orig);
            if (k > 0) h = lerp(h, Math.max(orig + 2.4, 4) + 0.5 * s.fbm(x * 0.2 + 3, z * 0.2 - 8, 2), k);
            // (le col, sur une terre déjà haute : abaissé au niveau du replat)
            const kc = smoothstep(2.6, 0.2, Math.abs(along - z0.d0)) * end * (1 - gap);
            if (kc > 0 && h > ZONE_H + 0.6) h = lerp(h, ZONE_H + 0.6, kc);
          }
        }
        hts[i] = h;
      }
  }
}

/**
 * Ni forêt ni rocher sur le replat de la zone ni dans la ria (cartes neuves), une fois la végétation posée. Rend le carré
 * retouché de chaque île (x0, z0, x1, z1, en cases)
 */
export function clearZones(veg: Uint8Array, n: number, seed: number, lay: ArchLayout): [number, number, number, number][] {
  if (!zoneRelief) return [];
  const out: [number, number, number, number][] = [];
  for (const q of lay.rivals) {
    const z0 = zoneSite(seed, q, lay.main), v = q.village, R = Math.ceil(z0.r * 1.4 + z0.half);
    const x0 = Math.max(0, Math.floor(z0.x - R)), zz0 = Math.max(0, Math.floor(z0.z - R)), x1 = Math.min(n - 1, Math.ceil(z0.x + R)), zz1 = Math.min(n - 1, Math.ceil(z0.z + R));
    out.push([x0, zz0, x1, zz1]);
    for (let z = zz0; z <= zz1; z++)
      for (let x = x0; x <= x1; x++) {
        const along = (x + 0.5 - v.x) * z0.ux + (z + 0.5 - v.z) * z0.uz, side = (x + 0.5 - v.x) * -z0.uz + (z + 0.5 - v.z) * z0.ux;
        const onZone = along > z0.d0 + 2 && Math.hypot(x + 0.5 - z0.x, z + 0.5 - z0.z) < z0.r * 1.2;
        const inRia = z0.limit === 'ria' && Math.abs(along - z0.d0) < 2.4 && Math.abs(side) < z0.half;
        if (onZone || inRia) veg[z * n + x] = 0;
      }
  }
  return out;
}
