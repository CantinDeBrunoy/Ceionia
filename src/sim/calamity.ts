import { World, N, VEG_FIELD, VEG_CAVE, VEG_VOLCANO, VEG_FISSURE, SEASIDE } from '../world/world';
import { KINDS, isDecor, isRampart, sizeOf, type Building, type KindId } from '../build/catalog';
import { rulesOf } from './difficulty';

/**
 * Les catastrophes naturelles : la crue, le séisme et la pluie de météorites. Une au plus par âge (souhait de l'auteur), tirée
 * quelques jours après le passage d'âge, parmi celles que le joueur n'a pas coupées. Ici, la logique pure (où, quoi, combien),
 * testable ; la mise en scène est dans `render/calamities.ts`. Les dégâts suivent la difficulté (`rulesOf(...).calamity`)
 */

export type CalamityKind = 'flood' | 'quake' | 'meteor';
export const CALAMITIES: CalamityKind[] = ['flood', 'quake', 'meteor'];

/** Jours de jeu passés dans l'âge avant que la catastrophe puisse venir (tirés entre les deux) */
export const CALAM_DAYS: [number, number] = [4, 10];
/** Un bâtiment abîmé ne donne plus que cette part (logements, nourriture, emplois…) pendant les réparations */
export const DAMAGED_K = 0.5;
/** Durée des réparations, en journées de jeu */
export const REPAIR_DAYS = 1;

/** La crue : hauteur de l'eau au-dessus de son niveau, cases au plus depuis l'eau, rayon du tronçon qui déborde, cases au moins */
export const FLOOD_RISE = 0.6, FLOOD_REACH = 4, FLOOD_SPAN = 9, FLOOD_MIN = 5;
/** Part des champs noyés à resemer après la crue (dégâts complets) */
export const FLOOD_RUIN = 1 / 3;
/** Bâtiments abîmés par une crue au plus (les plus près de l'eau) */
export const FLOOD_HURT = 3;
/** Bâtiments les pieds dans l'eau, que la crue ne touche pas */
export const WATERPROOF: KindId[] = ['pier', 'harbor', ...SEASIDE];

/** Dégâts de la difficulté de la partie */
export const harmOf = (w: World) => rulesOf(w.difficulty).calamity.harm;

/**
 * Le programme d'un âge qui commence : dans combien de secondes de jeu la catastrophe peut venir, ou -1 si l'âge n'en aura
 * pas (Facile : un âge sur deux)
 */
export function planAge(chance: number, dayLen: number, rnd = Math.random): number {
  if (rnd() >= chance) return -1;
  return dayLen * (CALAM_DAYS[0] + rnd() * (CALAM_DAYS[1] - CALAM_DAYS[0]));
}

/** Une case d'eau (mer, rivière, mare ou lac) */
const wet = (w: World, x: number, z: number) => w.lake[z * N + x] === 1 || w.cellAvg(x, z) < -0.05;

/**
 * Une eau qui peut déborder : un lac, ou un chenal étroit (rivière, canyon) : moins d'un tiers d'eau dans un carré de 13
 * cases autour (la côte d'une mer en a la moitié), mais plus d'un dixième (une mare ne déborde pas)
 */
export function riverish(w: World, x: number, z: number): boolean {
  const k = z * N + x;
  if (w.lake[k]) return true;
  if (!wet(w, x, z)) return false;
  let water = 0, all = 0;
  for (let dz = -6; dz <= 6; dz += 2) for (let dx = -6; dx <= 6; dx += 2) {
    const nx = x + dx, nz = z + dz;
    all++;
    // hors de la carte : c'est la mer
    if (!w.inCells(nx, nz) || wet(w, nx, nz)) water++;
  }
  return water / all < 0.36 && water / all > 0.1;
}

/** Bâtiment qui arrête l'eau : un rempart (une digue) */
const dike = (b: Building | undefined) => !!b && isRampart(b.kind);

export interface FloodSite {
  /** cases noyées (terre ferme) */
  cells: number[];
  /** cases d'eau du tronçon qui déborde (le dessin de la nappe part d'elles) */
  water: number[];
  /** niveau de l'eau (0 la rivière, le niveau du lac) */
  level: number;
  /** milieu des cases noyées */
  x: number;
  z: number;
  /** un lac de montagne, un étang (une petite eau au niveau de la mer) ou une rivière */
  lake: boolean;
  pond: boolean;
  /** champs touchés, et bâtiments (les plus près de l'eau d'abord, `FLOOD_HURT` au plus) */
  fields: number;
  buildings: number[];
}

/**
 * La crue qui menace le village : une eau qui peut déborder au bord de laquelle il y a des champs ou des bâtiments bas ; à
 * défaut, n'importe quel bord de rivière ou de lac près du village (le spectacle). L'eau gagne les cases de terre basses
 * (moins de `FLOOD_RISE` au-dessus de son niveau) à `FLOOD_REACH` cases au plus ; un rempart l'arrête, une berge relevée
 * aussi. null : aucune eau ne peut déborder sur la carte
 */
export function floodSite(w: World, rnd = Math.random): FloodSite | null {
  // les enjeux : les champs et les bâtiments bas au bord d'une eau qui peut déborder
  const centers: number[] = [];
  const seen = new Set<number>();
  const pad = new Set<number>();
  for (let k = 0; k < N * N; k++) {
    if (w.veg[k] !== VEG_FIELD && !w.occ[k]) continue;
    const x = k % N, z = Math.floor(k / N);
    if (wet(w, x, z)) continue;
    for (let dz = -FLOOD_REACH; dz <= FLOOD_REACH; dz++) for (let dx = -FLOOD_REACH; dx <= FLOOD_REACH; dx++) {
      const nx = x + dx, nz = z + dz;
      if (!w.inCells(nx, nz)) continue;
      const c = nz * N + nx;
      if (seen.has(c)) { if (pad.has(c)) centers.push(c); continue; }
      seen.add(c);
      if (wet(w, nx, nz) && riverish(w, nx, nz)) { pad.add(c); centers.push(c); }
    }
  }
  // essais : d'abord les eaux qui bordent le plus d'enjeux (elles reviennent plus souvent dans la liste)
  for (let i = 0; i < 12 && centers.length; i++) {
    const s = growFlood(w, centers[Math.floor(rnd() * centers.length)]);
    if (s && (s.fields || s.buildings.length)) return s;
  }
  // pas d'enjeu : une rivière ou un lac près du village (à défaut, du milieu de la carte)
  const [vx, vz] = villageMid(w);
  const near: number[] = [];
  for (let k = 0; k < N * N; k += 1) {
    const x = k % N, z = Math.floor(k / N);
    if (Math.abs(x - vx) > 40 || Math.abs(z - vz) > 40 || (x + z) % 2) continue;
    if (wet(w, x, z) && riverish(w, x, z)) near.push(k);
  }
  for (let i = 0; i < 12 && near.length; i++) {
    const s = growFlood(w, near[Math.floor(rnd() * near.length)]);
    if (s) return s;
  }
  return null;
}

/** Le milieu du village (moyenne des bâtiments), le milieu de la carte sans bâtiment */
export function villageMid(w: World): [number, number] {
  let x = 0, z = 0, n = 0;
  for (const b of w.buildings.values()) { const s = sizeOf(b); x += b.x + s / 2; z += b.z + s / 2; n++; }
  return n ? [x / n, z / n] : [N / 2, N / 2];
}

/** La crue qui part de cette case d'eau : les cases basses qu'elle gagne de proche en proche, null si trop peu */
export function growFlood(w: World, c: number): FloodSite | null {
  const cx = c % N, cz = Math.floor(c / N), lake = !!w.lake[c];
  const level = lake ? w.lakeLevel[c] : 0, top = level + FLOOD_RISE;
  const dist = new Map<number, number>(), water: number[] = [], q: number[] = [];
  // le tronçon qui déborde : l'eau de la même sorte à moins de FLOOD_SPAN cases
  for (let dz = -FLOOD_SPAN; dz <= FLOOD_SPAN; dz++) for (let dx = -FLOOD_SPAN; dx <= FLOOD_SPAN; dx++) {
    const x = cx + dx, z = cz + dz;
    if (!w.inCells(x, z) || dx * dx + dz * dz > FLOOD_SPAN * FLOOD_SPAN) continue;
    const k = z * N + x;
    if (lake ? !w.lake[k] : w.lake[k] || w.cellAvg(x, z) >= -0.05) continue;
    water.push(k); dist.set(k, 0); q.push(k);
  }
  const cells: number[] = [];
  for (let i = 0; i < q.length; i++) {
    const k = q[i], d = dist.get(k)!;
    if (d >= FLOOD_REACH) continue;
    const x = k % N, z = Math.floor(k / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!w.inCells(nx, nz)) continue;
      const n = nz * N + nx;
      if (dist.has(n) || wet(w, nx, nz)) continue;
      if ((nx - cx) ** 2 + (nz - cz) ** 2 > (FLOOD_SPAN + FLOOD_REACH) ** 2) continue;
      // trop haut (une berge relevée), une digue, l'entrée d'une grotte ou un volcan : l'eau s'arrête
      const v = w.veg[n];
      if (w.cellAvg(nx, nz) >= top || dike(w.buildings.get(w.occ[n])) || v === VEG_CAVE || v === VEG_VOLCANO || v === VEG_FISSURE) continue;
      dist.set(n, d + 1);
      cells.push(n);
      q.push(n);
    }
  }
  if (cells.length < FLOOD_MIN) return null;
  let sx = 0, sz = 0, fields = 0;
  const ids = new Set<number>();
  for (const k of cells) {
    sx += (k % N) + 0.5; sz += Math.floor(k / N) + 0.5;
    if (w.veg[k] === VEG_FIELD) fields++;
    const b = w.buildings.get(w.occ[k]);
    if (b && !isDecor(b.kind) && !WATERPROOF.includes(b.kind)) ids.add(b.id);
  }
  // (les cases sont dans l'ordre où l'eau les gagne : les premiers bâtiments sont les plus près de l'eau)
  return { cells, water, level, x: sx / cells.length, z: sz / cells.length, lake, pond: !lake && waterSize(w, c, POND) < POND, fields, buildings: [...ids].slice(0, FLOOD_HURT) };
}

/** Moins de cases d'eau d'un seul tenant : un étang, pas une rivière */
const POND = 120;

/** Cases d'eau d'un seul tenant autour de la case (on s'arrête à `max`) */
function waterSize(w: World, c: number, max: number) {
  const seen = new Set([c]), q = [c];
  for (let i = 0; i < q.length && seen.size < max; i++) {
    const x = q[i] % N, z = Math.floor(q[i] / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = nz * N + nx;
      if (!w.inCells(nx, nz) || seen.has(k) || !wet(w, nx, nz)) continue;
      seen.add(k); q.push(k);
    }
  }
  return seen.size;
}

/** Les champs noyés à resemer (dégâts complets) : un sur trois, tirés au hasard */
export function ruinedFields(w: World, cells: number[], rnd = Math.random): number[] {
  return cells.filter((k) => w.veg[k] === VEG_FIELD && rnd() < FLOOD_RUIN);
}

/** Nom d'un bâtiment, pour les messages */
export const nameOf = (b: Building) => KINDS[b.kind].names[b.age];
