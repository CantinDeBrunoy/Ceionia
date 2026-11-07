import { World, PortalSite, VEG_FOREST, VEG_ROCKS, VEG_VOLCANO, VEG_CAVE, VEG_FISSURE, VEG_WRECK } from './world';
import { mulberry32, hash2, smoothstep, lerp } from '../core/rng';

/**
 * L'île du portail : une petite île au large du continent, de 12 à 17 cases de diamètre, séparée de lui par un bras de mer ;
 * en son centre, sur un replat, le portail qui mène aux Enfers. On y va en galère (expédition « Le portail de l'autre rive »),
 * on n'y bâtit que des défenses, et les démons n'attaqueront qu'elle, jamais le continent
 */

/** Rayon de l'île (en cases), au plus petit et au plus grand */
export const ISLE_R: [number, number] = [6, 8.5];
/** Largeur du bras de mer entre l'île et la terre la plus proche (cases), au moins */
export const STRAIT_MIN = 10;
/** Altitude du replat central (où se dresse le portail) */
export const ISLE_TOP = 1.15;

/** Le portail occupe les quatre cases autour de son centre (un sommet du relief) */
export const PORTAL_CELLS = (p: PortalSite): [number, number][] => [[p.x - 1, p.z - 1], [p.x, p.z - 1], [p.x - 1, p.z], [p.x, p.z]];

/**
 * Distance de chaque case à la terre la plus proche (cases, par le milieu des cases, à peu près euclidienne) : toute case
 * plus haute que le fond de la mer peu profonde compte comme terre, les lacs aussi ; le bord de la carte n'en est pas
 */
export function landDistance(w: World): Float32Array {
  const n = w.n, d = new Float32Array(n * n), D = Math.SQRT2;
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) d[z * n + x] = w.cellAvg(x, z) > -0.35 || w.lake[z * n + x] ? 0 : 1e9;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= n || z >= n ? 1e9 : d[z * n + x]);
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const k = z * n + x;
      if (d[k]) d[k] = Math.min(d[k], at(x - 1, z) + 1, at(x, z - 1) + 1, at(x - 1, z - 1) + D, at(x + 1, z - 1) + D);
    }
  for (let z = n - 1; z >= 0; z--)
    for (let x = n - 1; x >= 0; x--) {
      const k = z * n + x;
      if (d[k]) d[k] = Math.min(d[k], at(x + 1, z) + 1, at(x, z + 1) + 1, at(x + 1, z + 1) + D, at(x - 1, z + 1) + D);
    }
  return d;
}

/** Forme de l'île : son rayon dans la direction `a` (radians), festonné de quelques caps et anses tirés de la graine */
export function isleRadius(p: PortalSite, seed: number, a: number) {
  const p1 = hash2(p.x, p.z, seed + 31) * 6.28, p2 = hash2(p.x, p.z, seed + 37) * 6.28;
  return p.r * (0.86 + 0.1 * Math.sin(3 * a + p1) + 0.06 * Math.sin(5 * a + p2));
}

/**
 * Pose l'île du portail sur une carte neuve, de façon déterministe selon la graine : au plus loin de toute terre (le large
 * le plus vaste, à l'écart du bord de la carte), une île ronde aux bords festonnés, un replat au milieu pour le portail et
 * les défenses, une plage tout autour, quelques bosquets et rochers en lisière. Rien si la mer manque de place (jamais sur le
 * continent tel qu'il est généré). Elle ne touche qu'à la haute mer : rivières, lacs, volcan et montagnes restent tels quels
 */
export function addPortalIsland(w: World, seed: number): PortalSite | null {
  w.portal = null;
  w.isleGuard = { waves: 0, days: 0 };
  const n = w.n, rnd = mulberry32(seed * 31 + 9001);
  let R = lerp(ISLE_R[0], ISLE_R[1], rnd());
  const dl = landDistance(w), M = Math.ceil(ISLE_R[1]) + 3;
  // le point de mer le plus éloigné de toute terre (à égalité, tiré de la graine)
  let best = -1, bs = -1;
  for (let z = M; z < n - M; z++)
    for (let x = M; x < n - M; x++) {
      const k = z * n + x, s = dl[k] + hash2(x, z, seed + 9011) * 0.5;
      if (s > bs) { bs = s; best = k; }
    }
  if (best < 0) return null;
  // la mer manque un peu de place : une île plus petite ; beaucoup : la côte la plus basse recule pour lui faire de la place
  if (dl[best] < R + STRAIT_MIN) R = Math.max(ISLE_R[0], dl[best] - STRAIT_MIN);
  if (dl[best] < R + STRAIT_MIN) best = carveStrait(w, dl, M, R + STRAIT_MIN, seed);
  if (best < 0) return null;
  // le centre du portail : un sommet du relief (le coin commun des quatre cases du portail)
  const p: PortalSite = { x: (best % n) + 1, z: Math.floor(best / n) + 1, r: Math.round(R * 10) / 10 };
  const reach = Math.ceil(p.r * 1.3) + 1;
  for (let vz = p.z - reach; vz <= p.z + reach; vz++)
    for (let vx = p.x - reach; vx <= p.x + reach; vx++) {
      if (vx < 0 || vz < 0 || vx > n || vz > n) continue;
      const dx = vx - p.x, dz = vz - p.z, d = Math.hypot(dx, dz) / isleRadius(p, seed, Math.atan2(dz, dx));
      if (d >= 1.25) continue;
      // le profil ne fait que descendre du centre vers le large : ni creux ni mare sur l'île
      const h = d < 0.5 ? ISLE_TOP : d < 0.92 ? lerp(ISLE_TOP, 0.3, smoothstep(0.5, 0.92, d)) : lerp(0.3, -1, smoothstep(0.92, 1.25, d));
      const i = w.vi(vx, vz);
      w.heights[i] = Math.max(w.heights[i], h);
    }
  // la végétation : rien sur le replat (le portail, les défenses), quelques bosquets et rochers vers le rivage
  for (let cz = p.z - reach; cz < p.z + reach; cz++)
    for (let cx = p.x - reach; cx < p.x + reach; cx++) {
      if (!w.inCells(cx, cz)) continue;
      const k = w.ci(cx, cz), dx = cx + 0.5 - p.x, dz = cz + 0.5 - p.z, d = Math.hypot(dx, dz) / isleRadius(p, seed, Math.atan2(dz, dx));
      w.veg[k] = 0; w.oil[k] = 0;
      if (w.cellAvg(cx, cz) < 0.2) continue;
      const r = hash2(cx, cz, seed + 9013);
      if (d > 0.6 && d < 0.86 && r < 0.3) w.veg[k] = VEG_FOREST;
      else if (d >= 0.8 && d < 0.95 && r > 0.88) w.veg[k] = VEG_ROCKS;
    }
  w.portal = p;
  w.markTerrainAll();
  w.markVeg(p.x - reach, p.z - reach, p.x + reach, p.z + reach);
  w.vegDirty = true;
  w.computeBiomes();
  w.version++;
  return p;
}

/**
 * Quand le large manque de place (un continent qui s'étend jusqu'au bord de la carte) : le point de mer où il en coûte le
 * moins de faire reculer la côte pour dégager `C` cases tout autour (des terres basses de préférence, jamais les hauteurs, le
 * volcan ni les grottes), puis la côte recule en pente douce jusqu'à ce cercle. Renvoie la case retenue (-1 : aucune)
 */
function carveStrait(w: World, dl: Float32Array, M: number, C: number, seed: number): number {
  const n = w.n, R = Math.ceil(C);
  let best = -1, bc = Infinity;
  for (let z = M; z < n - M; z += 2)
    for (let x = M; x < n - M; x += 2) {
      if (dl[z * n + x] < C * 0.45) continue;
      let cost = hash2(x, z, seed + 9017);
      for (let dz = -R; dz <= R && cost < bc; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const cx = x + dx, cz = z + dz;
          if (!w.inCells(cx, cz) || dx * dx + dz * dz > C * C) continue;
          const h = w.cellAvg(cx, cz), v = w.veg[w.ci(cx, cz)];
          if (h <= -0.35) continue;
          // des terres basses, pas les montagnes, ni le volcan, ni les grottes et failles
          cost += h > 2.4 || v === VEG_VOLCANO || v === VEG_CAVE || v === VEG_FISSURE || w.lake[w.ci(cx, cz)] ? 1000 : 1 + Math.max(0, h);
        }
      if (cost < bc) { bc = cost; best = z * n + x; }
    }
  if (best < 0 || bc >= 1000) return -1;
  const bx = best % n + 1, bz = Math.floor(best / n) + 1;
  for (let vz = bz - R - 3; vz <= bz + R + 3; vz++)
    for (let vx = bx - R - 3; vx <= bx + R + 3; vx++) {
      if (vx < 0 || vz < 0 || vx > n || vz > n) continue;
      const i = w.vi(vx, vz), d = Math.hypot(vx - bx, vz - bz);
      if (d < C + 3) w.heights[i] = Math.min(w.heights[i], lerp(-1.1, w.heights[i], smoothstep(C, C + 3, d)));
    }
  // rien ne reste sur l'eau (arbres, rochers, épaves, pétrole)
  for (let cz = bz - R - 3; cz < bz + R + 3; cz++)
    for (let cx = bx - R - 3; cx < bx + R + 3; cx++) {
      if (!w.inCells(cx, cz) || w.cellAvg(cx, cz) > 0.1) continue;
      const k = w.ci(cx, cz);
      if (w.veg[k] && w.veg[k] !== VEG_WRECK) w.veg[k] = 0;
      w.oil[k] = 0;
    }
  return best;
}

/**
 * Sécuriser l'île : l'étape obligatoire du volet militaire pour quitter l'Antiquité (les expéditions dans les Enfers, elles,
 * restent facultatives). Il faut le portail ouvert, au moins une tour de garde et une caserne debout sur l'île, puis repousser
 * `waves` vagues de démons (les jours tenus, `days`, ne sont plus qu'un relevé). `waves` vaut `SECURE_WAVES` (sim/hell)
 */
export const ISLE_SECURE = { waves: 5, days: 6 };
/** L'âge que la sécurisation de l'île ouvre : le Moyen Âge (on la demande pour quitter l'Antiquité) */
export const ISLE_AGE = 2;

/** Les défenses debout sur l'île du portail : tours de garde et casernes */
export function isleDefenses(w: World) {
  let towers = 0, barracks = 0;
  for (const b of w.buildings.values()) {
    if (!w.onPortalIsland(b.x, b.z)) continue;
    if (b.kind === 'watchtower') towers++;
    else if (b.kind === 'barracks') barracks++;
  }
  return { towers, barracks };
}

/** L'île a ses défenses : portail ouvert, une tour de garde et une caserne au moins */
export function isleManned(w: World) {
  if (!w.portalOpen) return false;
  const d = isleDefenses(w);
  return d.towers >= 1 && d.barracks >= 1;
}

/**
 * Le temps passe sur l'île : chaque jour de jeu où elle a ses défenses compte comme un jour tenu (`dt` en secondes de jeu,
 * `dayLen` : durée d'un jour). Les vagues repoussées s'ajoutent à part (`repelWave`), quand les démons attaqueront
 */
export function holdIsle(w: World, dt: number, dayLen: number) {
  if (dt > 0 && dayLen > 0 && isleManned(w)) w.isleGuard.days += dt / dayLen;
}

/** Une vague de démons repoussée sur l'île du portail (l'IA des Enfers l'appellera) */
export function repelWave(w: World) { w.isleGuard.waves++; }

/** Où en est la sécurisation de l'île, de 0 à 1 (les vagues repoussées), 0 sans défenses */
export function isleProgress(w: World) {
  if (!isleManned(w)) return 0;
  return Math.min(1, w.isleGuard.waves / ISLE_SECURE.waves);
}

/** L'île du portail est sécurisée (la condition d'âge) */
export const isleSecured = (w: World) => isleProgress(w) >= 1;

/**
 * Les étapes de la sécurisation de l'île, pour le panneau d'âge et le conseil : tour de garde bâtie, caserne bâtie, vagues
 * repoussées (leur libellé commence par « île du portail »)
 */
export function isleSteps(w: World): { label: string; have: number; need: number; kind?: 'watchtower' | 'barracks' }[] {
  const d = isleDefenses(w);
  return [
    { label: 'île du portail : une tour de garde', have: Math.min(1, d.towers), need: 1, kind: 'watchtower' },
    { label: 'île du portail : une caserne', have: Math.min(1, d.barracks), need: 1, kind: 'barracks' },
    { label: 'île du portail : vagues de démons repoussées', have: Math.min(ISLE_SECURE.waves, w.isleGuard.waves), need: ISLE_SECURE.waves },
  ];
}

/** Lit l'île du portail d'une sauvegarde (absente, ou abîmée : pas d'île, et la mission du portail n'est pas disponible) */
export function readPortal(d: unknown, n: number): PortalSite | null {
  if (!d || typeof d !== 'object') return null;
  const { x, z, r } = d as Record<string, unknown>;
  if (!Number.isInteger(x) || !Number.isInteger(z) || typeof r !== 'number' || !Number.isFinite(r)) return null;
  if ((x as number) < 2 || (z as number) < 2 || (x as number) > n - 2 || (z as number) > n - 2 || r < 2 || r > 20) return null;
  return { x: x as number, z: z as number, r };
}
