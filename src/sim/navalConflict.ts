import { World, N, VEG_FOREST } from '../world/world';
import type { People, RivalIsle, Isle } from '../world/archipelago';

/**
 * Le conflit vivant entre les deux îles rivales : ce qui se voit (escarmouches, commerce, patrouilles) selon l'état du conflit.
 * Rien n'est sauvegardé ici : c'est un décor animé (voir `render/navalConflict.ts`) qui ne touche jamais aux bâtiments ni aux
 * stocks du joueur. L'état du conflit appartient à la diplomatie, qui le donne à la vue (`NavalConflict.state`)
 */

/** L'état du conflit : en cours, paix signée par le joueur, guerre gagnée par un peuple, traité entre les îles (au Moderne) */
export type ConflictState = { kind: 'war' } | { kind: 'peace' } | { kind: 'won'; winner: People } | { kind: 'treaty' };

/** Âge du Moderne : la guerre qui dure encore s'y arrête d'elle-même, par un traité entre les deux îles */
export const TREATY_AGE = 4;

/**
 * Ce qui se voit en mer : rien sans l'archipel ; une guerre encore en cours au Moderne devient un traité (les deux îles font
 * la paix entre elles). Les autres états se montrent tels quels
 */
export function conflictShown(state: ConflictState, isles: boolean, age: number): ConflictState | null {
  if (!isles) return null;
  if (state.kind === 'war' && age >= TREATY_AGE) return { kind: 'treaty' };
  return state;
}

/** Ce que l'état met en mer : des escarmouches, des navires de commerce entre les îles, ou les patrouilles du vainqueur */
export function seaLife(state: ConflictState | null): 'skirmish' | 'trade' | 'patrol' | null {
  if (!state) return null;
  return state.kind === 'war' ? 'skirmish' : state.kind === 'won' ? 'patrol' : 'trade';
}

/**
 * Navire de guerre d'un peuple : galère (jusqu'à l'Antiquité), boutre oriental ou jonque asiatique (Médiéval), frégate à
 * canons ou vapeur cuirassé (Industriel, selon le rang), vedette (Moderne), vedette à coussin d'air et ses drones (Futuriste)
 */
export type WarshipKind = 'galley' | 'dhow' | 'junk' | 'frigate' | 'ironclad' | 'launch' | 'hover';
export function warshipKind(people: People, age: number, i = 0): WarshipKind {
  if (age <= 1) return 'galley';
  if (age === 2) return people === 'orient' ? 'dhow' : 'junk';
  if (age === 3) return i % 2 ? 'ironclad' : 'frigate';
  return age === 4 ? 'launch' : 'hover';
}
/** Arme d'un navire : flèches enflammées, canons, mitrailleuse et roquettes, drones et plasma */
export type ShipWeapon = 'arrows' | 'cannon' | 'guns' | 'plasma';
export const WEAPON: Record<WarshipKind, ShipWeapon> = { galley: 'arrows', dhow: 'arrows', junk: 'arrows', frigate: 'cannon', ironclad: 'cannon', launch: 'guns', hover: 'plasma' };
/** Vitesse (cases par seconde de jeu) : la rame et la voile vont doucement, la vapeur un peu plus vite, les vedettes filent */
export const WAR_SPEED: Record<WarshipKind, number> = { galley: 1.2, dhow: 1.1, junk: 1, frigate: 1.1, ironclad: 1.4, launch: 2.6, hover: 3.2 };
/** Portée de tir (cases) : les flèches portent près, le canon loin */
export const WAR_RANGE: Record<WarshipKind, number> = { galley: 4, dhow: 4.5, junk: 4.5, frigate: 6, ironclad: 6.5, launch: 7, hover: 8 };

/** Secondes de jeu entre deux escarmouches (après la fin de la précédente) */
export const SKIRMISH_MIN = 120, SKIRMISH_MAX = 240;
/** Secondes de jeu avant la première escarmouche d'une partie chargée */
export const FIRST_MIN = 50, FIRST_MAX = 110;
export const nextDelay = (rnd: () => number, first = false) => (first ? FIRST_MIN + (FIRST_MAX - FIRST_MIN) * rnd() : SKIRMISH_MIN + (SKIRMISH_MAX - SKIRMISH_MIN) * rnd());
/** Une escarmouche : bataille navale (deux fois sur trois) ou incursion sur la plage d'en face */
export const pickSkirmish = (rnd: () => number): 'naval' | 'raid' => (rnd() < 2 / 3 ? 'naval' : 'raid');

/** Eau navigable : la pleine mer (les escadres) ; près des côtes (une barque qui vient à la plage) */
export const DEEP = -0.35, SHALLOW = -0.18;

type P = [number, number];

/** Les places du conflit : le mouillage de chaque peuple (devant son village, côté bras de mer) et le milieu du bras de mer */
export interface NavalSites {
  ports: Record<People, P>;
  villages: Record<People, Isle>;
  rivals: Record<People, RivalIsle>;
  battle: P;
  /** la pleine mer reliée au large (cases navigables jointes au bord de la carte) : en eau profonde, et jusqu'aux côtes */
  deep: Uint8Array;
  shallow: Uint8Array;
}

/**
 * Les cases navigables reliées au large (au bord de la carte), par un côté : une lagune fermée ou un lac n'en font pas partie
 * (on n'y mouille pas, on n'en sort pas)
 */
export function openSea(w: World, nav: number): Uint8Array {
  const m = new Uint8Array(N * N), q = new Int32Array(N * N);
  let t = 0;
  const push = (x: number, z: number) => { const k = z * N + x; if (!m[k] && navigable(w, x, z, nav)) { m[k] = 1; q[t++] = k; } };
  for (let i = 0; i < N; i++) { push(i, 0); push(i, N - 1); push(0, i); push(N - 1, i); }
  for (let h = 0; h < t; h++) {
    const k = q[h], x = k % N, z = (k - x) / N;
    if (x > 0) push(x - 1, z); if (x < N - 1) push(x + 1, z); if (z > 0) push(x, z - 1); if (z < N - 1) push(x, z + 1);
  }
  return m;
}

const navigable = (w: World, x: number, z: number, nav: number) => w.inCells(x, z) && !w.lake[w.ci(x, z)] && w.cellAvg(x, z) < nav;
/** Toutes les cases à `r` cases autour de (x, z) sont navigables (et, avec `sea`, reliées au large) */
function clear(w: World, x: number, z: number, r: number, nav: number, sea?: Uint8Array) {
  if (sea && (!w.inCells(x, z) || !sea[z * N + x])) return false;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (!navigable(w, x + dx, z + dz, nav)) return false;
  return true;
}

/** La case navigable dégagée (`r` cases) la plus proche de (x, z), à `max` cases au plus */
export function nearestWater(w: World, x: number, z: number, nav = DEEP, r = 2, max = 30, sea?: Uint8Array): P | null {
  const cx = Math.floor(x), cz = Math.floor(z);
  for (let d = 0; d <= max; d++)
    for (let dz = -d; dz <= d; dz++)
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== d) continue;
        if (clear(w, cx + dx, cz + dz, r, nav, sea)) return [cx + dx + 0.5, cz + dz + 0.5];
      }
  return null;
}

/**
 * Les places du conflit, tirées du relief : le mouillage d'un peuple est l'eau profonde et dégagée la plus proche de son
 * village, du côté de l'autre île ; la bataille se livre au milieu des deux mouillages. Null sans archipel
 */
export function navalSites(w: World): NavalSites | null {
  const lay = w.isles;
  if (!lay || lay.rivals.length < 2) return null;
  const by = (p: People) => lay.rivals.find((q) => q.people === p)!;
  const or = by('orient'), as = by('asie');
  if (!or || !as) return null;
  const deep = openSea(w, DEEP), shallow = openSea(w, SHALLOW);
  const port = (q: RivalIsle, o: RivalIsle): P | null => {
    const v = q.village, R = 60;
    let best = Infinity, at: P | null = null;
    for (let z = Math.max(1, Math.floor(v.z - R)); z < Math.min(N - 1, v.z + R); z++)
      for (let x = Math.max(1, Math.floor(v.x - R)); x < Math.min(N - 1, v.x + R); x++) {
        const d = Math.hypot(x + 0.5 - v.x, z + 0.5 - v.z);
        if (d > R) continue;
        const s = d + 0.35 * Math.hypot(x + 0.5 - o.village.x, z + 0.5 - o.village.z);
        if (s < best && clear(w, x, z, 1, DEEP, deep)) { best = s; at = [x + 0.5, z + 0.5]; }
      }
    return at;
  };
  const po = port(or, as), pa = port(as, or);
  if (!po || !pa) return null;
  const battle = nearestWater(w, (po[0] + pa[0]) / 2, (po[1] + pa[1]) / 2, DEEP, 3, 40, deep);
  if (!battle) return null;
  return { ports: { orient: po, asie: pa }, villages: { orient: or.village, asie: as.village }, rivals: { orient: or, asie: as }, battle, deep, shallow };
}

/** Un lieu de bataille un peu différent à chaque fois : à quelques cases du milieu du bras de mer, en eau dégagée */
export function battleSpot(w: World, s: NavalSites, rnd: () => number): P {
  const [ax, az] = s.ports.orient, [bx, bz] = s.ports.asie, l = Math.hypot(bx - ax, bz - az) || 1;
  const px = -(bz - az) / l, pz = (bx - ax) / l;
  for (let k = 0; k < 6; k++) {
    const off = (rnd() - 0.5) * 20, along = (rnd() - 0.5) * 8;
    const x = s.battle[0] + px * off + ((bx - ax) / l) * along, z = s.battle[1] + pz * off + ((bz - az) / l) * along;
    if (clear(w, Math.floor(x), Math.floor(z), 3, DEEP, s.deep)) return [x, z];
  }
  return s.battle;
}

/**
 * Chemin sur l'eau de `a` à `b` (parcours en largeur sur les cases navigables, huit voisins, sans couper les coins), tendu
 * (les points intermédiaires inutiles sautent) puis échantillonné tous les `step`. Null si `b` est hors d'atteinte
 */
export function waterPath(w: World, a: P, b: P, nav = DEEP, step = 0.5): P[] | null {
  const sx = Math.floor(a[0]), sz = Math.floor(a[1]), gx = Math.floor(b[0]), gz = Math.floor(b[1]);
  if (!navigable(w, sx, sz, nav) || !navigable(w, gx, gz, nav)) return null;
  const prev = new Int32Array(N * N).fill(-1), start = sz * N + sx, goal = gz * N + gx, q = new Int32Array(N * N);
  prev[start] = start;
  let h = 0, t = 0;
  q[t++] = start;
  while (h < t) {
    const k = q[h++];
    if (k === goal) break;
    const x = k % N, z = (k - x) / N;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (!navigable(w, nx, nz, nav)) continue;
        if (dx && dz && (!navigable(w, x + dx, z, nav) || !navigable(w, x, z + dz, nav))) continue;
        const nk = nz * N + nx;
        if (prev[nk] !== -1) continue;
        prev[nk] = k;
        q[t++] = nk;
      }
  }
  if (prev[goal] === -1) return null;
  const cells: P[] = [];
  for (let k = goal; ; k = prev[k]) { cells.push([(k % N) + 0.5, Math.floor(k / N) + 0.5]); if (k === start) break; }
  cells.reverse();
  cells[0] = [a[0], a[1]]; cells[cells.length - 1] = [b[0], b[1]];
  // tendu : du point courant, on saute au plus loin qu'on voit en ligne droite sur l'eau
  const sees = (p: P, q2: P) => {
    const d = Math.hypot(q2[0] - p[0], q2[1] - p[1]), n = Math.ceil(d / 0.35);
    for (let i = 1; i < n; i++) { const u = i / n; if (!navigable(w, Math.floor(p[0] + (q2[0] - p[0]) * u), Math.floor(p[1] + (q2[1] - p[1]) * u), nav)) return false; }
    return true;
  };
  const taut: P[] = [cells[0]];
  for (let i = 0; i < cells.length - 1;) {
    let j = cells.length - 1;
    while (j > i + 1 && !sees(cells[i], cells[j])) j--;
    taut.push(cells[j]);
    i = j;
  }
  return resample(taut, step);
}

/** Une ligne brisée échantillonnée tous les `step` (le dernier point compris) */
export function resample(pts: P[], step: number): P[] {
  const out: P[] = [[pts[0][0], pts[0][1]]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], d = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    for (; s <= d; s += step) out.push([ax + ((bx - ax) * s) / d, az + ((bz - az) * s) / d]);
    carry = d - (s - step);
  }
  const last = pts[pts.length - 1], end = out[out.length - 1];
  if (Math.hypot(last[0] - end[0], last[1] - end[1]) > 1e-3) out.push([last[0], last[1]]);
  return out;
}

/** Un débarquement : la barque mouille en `boat`, les soldats prennent pied en `beach` et marchent jusqu'à `rally`, à l'entrée du village */
export interface Landing { boat: P; beach: P; rally: P }

/**
 * Plage de débarquement sur l'île d'un peuple : une case de côte (terre basse au bord de l'eau) dans la zone de son village,
 * à 3 à 30 cases de son bord, reliée à l'entrée du village par la terre ferme, sans aucun bâtiment du joueur à moins de 8
 * cases (jamais dans sa ville). La barque mouille dans l'eau la plus proche. Null si l'île n'en a pas
 */
export function landingSite(w: World, s: NavalSites, defender: People, rnd: () => number): Landing | null {
  const v = s.villages[defender], R = v.r + 30, cands: { beach: P; boat: P; score: number }[] = [];
  const land = (x: number, z: number) => w.inCells(x, z) && w.cellAvg(x, z) > 0.06;
  const shore = (x: number, z: number) => land(x, z) && w.cellAvg(x, z) < 1 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => navigable(w, x + dx, z + dz, -0.02));
  for (let z = Math.max(1, Math.floor(v.z - R)); z < Math.min(N - 1, v.z + R); z++)
    for (let x = Math.max(1, Math.floor(v.x - R)); x < Math.min(N - 1, v.x + R); x++) {
      const d = Math.hypot(x + 0.5 - v.x, z + 0.5 - v.z);
      if (d < v.r + 3 || d > R || !shore(x, z) || nearPlayer(w, x, z, 8)) continue;
      cands.push({ beach: [x + 0.5, z + 0.5], boat: [0, 0], score: d + rnd() * 10 });
    }
  cands.sort((a, b) => a.score - b.score);
  // parmi les plus proches, celle dont le chemin traverse le moins de forêt (on voit l'accrochage) ; la terre ferme d'un bout à
  // l'autre, sans falaise ; une eau assez proche pour la barque
  let best: Landing | null = null, bestScore = Infinity;
  for (const c of cands.slice(0, 60)) {
    const ux = c.beach[0] - v.x, uz = c.beach[1] - v.z, l = Math.hypot(ux, uz) || 1;
    const rally: P = [v.x + (ux / l) * (v.r - 2), v.z + (uz / l) * (v.r - 2)];
    let ok = true, prev = w.hAt(c.beach[0], c.beach[1]), trees = 0;
    const n = Math.ceil(l / 0.5);
    for (let i = 1; i <= n && ok; i++) {
      const u = i / n, x = c.beach[0] + (rally[0] - c.beach[0]) * u, z = c.beach[1] + (rally[1] - c.beach[1]) * u, h = w.hAt(x, z);
      if (!land(Math.floor(x), Math.floor(z)) || Math.abs(h - prev) > 0.45) ok = false;
      else if (w.veg[w.ci(Math.floor(x), Math.floor(z))] === VEG_FOREST) trees++;
      prev = h;
    }
    if (!ok) continue;
    const boat = nearestWater(w, c.beach[0] + (ux / l) * 2, c.beach[1] + (uz / l) * 2, SHALLOW, 1, 7, s.shallow);
    if (!boat || Math.hypot(boat[0] - c.beach[0], boat[1] - c.beach[1]) > 7) continue;
    const score = c.score + trees * 2.5;
    if (score < bestScore) { bestScore = score; best = { boat, beach: c.beach, rally }; }
  }
  return best;
}

/** Un bâtiment du joueur à moins de `r` cases de (x, z) */
function nearPlayer(w: World, x: number, z: number, r: number) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (w.inCells(x + dx, z + dz) && w.occ[w.ci(x + dx, z + dz)]) return true;
  return false;
}

/** L'autre peuple */
export const foe = (p: People): People => (p === 'orient' ? 'asie' : 'orient');
