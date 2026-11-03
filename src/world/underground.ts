import { World, N, VR, VS, VEG_CAVE, VEG_FISSURE, VEG_VOLCANO, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH } from './world';
import { Simplex } from './noise';
import { hash2 } from '../core/rng';

/**
 * Zones du monde souterrain, tirées du biome de surface : galeries de pierre à minerais (tempéré), glace (taïga),
 * grotte luxuriante aux champignons lumineux (marais, tropiques), magma (désert, volcans) ; poches de cristaux partout
 */
export const UZ_STONE = 0, UZ_CRYSTAL = 1, UZ_ICE = 2, UZ_LUSH = 3, UZ_MAGMA = 4;
export const UZ_NAMES = ['Galeries', 'Grotte de cristal', 'Grotte de glace', 'Grotte luxuriante', 'Cavernes de magma'];
/** Hauteur des parois : leur dessus est la coupe sombre de la roche */
export const UWALL = 1.6;
export const POOL_WATER = 1, POOL_LAVA = 2;
/** Niveau des bassins (eau, lave) */
export const POOL_Y = [0, -0.2, -0.16];

export interface Entrance { x: number; z: number; cell: number; kind: 'cave' | 'fissure' }

/** Minerais des filons, du plus commun au plus rare : nom, rendement (unités de minerai) et poids du tirage */
export const ORE_KINDS: { name: string; amount: number; w: number }[] = [
  { name: 'charbon', amount: 1, w: 40 }, { name: 'fer', amount: 2, w: 28 }, { name: 'or', amount: 3, w: 10 }, { name: 'rubis', amount: 3, w: 8 },
  { name: 'lapis-lazuli', amount: 2, w: 7 }, { name: 'diamant', amount: 5, w: 5 }, { name: 'émeraude', amount: 5, w: 2 },
];
const ORE_W = ORE_KINDS.reduce((s, o) => s + o.w, 0);

/** Filons incrustés dans les parois (cases de galerie au pied de la roche ; plus précieux dans le magma), sauf ceux exploités */
export function oreVeins(u: Underground, mined: Set<number>): { k: number; ore: number }[] {
  const out: { k: number; ore: number }[] = [];
  for (let k = 0; k < N * N; k++) {
    if (!u.open[k] || u.wallDist[k] !== 1 || mined.has(k)) continue;
    const cx = k % N, cz = Math.floor(k / N), zone = u.zone[k];
    if (hash2(cx, cz, 200) > (zone === UZ_STONE ? 0.2 : 0.06)) continue;
    let r = hash2(cx, cz, 201) * ORE_W, ore = 0;
    if (zone === UZ_MAGMA) r = Math.min(ORE_W - 1, r + ORE_W * 0.3);
    for (let i = 0; i < ORE_KINDS.length; i++) { if (r < ORE_KINDS[i].w) { ore = i; break; } r -= ORE_KINDS[i].w; }
    out.push({ k, ore });
  }
  return out;
}

/** Étape du parcours d'une troupe armée : marche (de case en case du chemin), halte au filon, combat contre une embuscade */
export interface TroopLeg { from: number; to: number; kind: 'walk' | 'mine' | 'fight'; /** début de l'étape, en temps de parcours */ t0: number }
export interface TroopRoute { cells: number[]; legs: TroopLeg[]; total: number }
/** Durée d'une halte au filon et d'un combat, comptée comme une longueur de chemin (cases) */
export const MINE_HALT = 6, FIGHT_HALT = 20;

/**
 * Parcours d'une troupe armée : de la case où elle descend, de filon en filon (halte à chacun), puis jusqu'au front où elle
 * plante ses lanternes ; elle s'arrête pour combattre à chaque case d'embuscade. Le jeu (issue des combats) et la vue
 * souterraine (où est la troupe) le calculent de la même façon
 */
export function troopRoute(u: Underground, entry: number, targets: number[], front: number, ambush: number[] = []): TroopRoute {
  const cells = [entry], legs: TroopLeg[] = [], fights = new Set(ambush);
  let at = entry, t = 0;
  const push = (from: number, to: number, kind: TroopLeg['kind']) => {
    if (kind === 'walk' && to === from) return;
    legs.push({ from, to, kind, t0: t });
    t += kind === 'walk' ? to - from : kind === 'mine' ? MINE_HALT : FIGHT_HALT;
  };
  const go = (to: number) => {
    const r = u.route(at, to);
    if (!r) return;
    let from = cells.length - 1;
    for (let i = 1; i < r.length; i++) {
      cells.push(r[i]);
      if (fights.delete(r[i])) { push(from, cells.length - 1, 'walk'); push(cells.length - 1, cells.length - 1, 'fight'); from = cells.length - 1; }
    }
    push(from, cells.length - 1, 'walk');
    push(cells.length - 1, cells.length - 1, 'mine');
    at = to;
  };
  for (const v of targets) go(v);
  if (front >= 0 && front !== at) go(front);
  return { cells, legs, total: t };
}

/** Où en est la troupe au temps de parcours `s` : position sur le chemin (en cases, fractionnaire) et étape en cours */
export function routeAt(r: TroopRoute, s: number): { pos: number; leg: TroopLeg | null } {
  for (const l of r.legs) {
    const d = l.kind === 'walk' ? l.to - l.from : l.kind === 'mine' ? MINE_HALT : FIGHT_HALT;
    if (s <= l.t0 + d) return { pos: l.kind === 'walk' ? l.from + Math.max(0, s - l.t0) : l.to, leg: l };
  }
  return { pos: r.legs.length ? r.legs[r.legs.length - 1].to : 0, leg: null };
}

/** Champ d'ouverture adouci : roche pleine en dessous de ROCK_ISO, sol de galerie au-dessus de FLOOR_ISO, falaise entre les deux */
export const ROCK_ISO = 0.12, FLOOR_ISO = 0.42;

/** Bord de carte toujours rocheux */
const BORDER = 2;

/**
 * Monde souterrain sous la carte (mêmes cases) : grandes cavernes et tunnels sinueux façon Minecraft,
 * tous reliés entre eux et aux entrées de surface (grottes, failles) ; il se régénère quand les entrées changent
 */
export class Underground {
  open = new Uint8Array(N * N);
  zone = new Uint8Array(N * N);
  pool = new Uint8Array(N * N);
  floor = new Float32Array(N * N);
  /** distance (en cases, plafonnée) à la paroi la plus proche */
  wallDist = new Uint8Array(N * N);
  /** relief affiché (VS×VS), même échantillonnage que la surface */
  vis = new Float32Array(VS * VS);
  /**
   * Pour le rendu, par sommet : l'ouverture de la galerie (champ adouci, 0 dans la roche … 1 en galerie), le sol, et le
   * relief de la roche au sol et au sommet des parois — la vue en tire des contours de falaise lisses
   */
  vOpen = new Float32Array(VS * VS);
  vGround = new Float32Array(VS * VS);
  vBump0 = new Float32Array(VS * VS);
  vBump1 = new Float32Array(VS * VS);
  entrances: Entrance[] = [];
  /** incrémenté à chaque régénération */
  version = 0;
  private key = '';

  constructor(private world: World) {}

  /** Régénère si la carte ou ses entrées ont changé ; renvoie true dans ce cas */
  sync(): boolean {
    const w = this.world, ent: Entrance[] = [];
    for (let k = 0; k < N * N; k++) {
      const t = w.veg[k];
      if (t === VEG_CAVE || t === VEG_FISSURE) ent.push({ x: (k % N) + 0.5, z: Math.floor(k / N) + 0.5, cell: k, kind: t === VEG_CAVE ? 'cave' : 'fissure' });
    }
    const key = `${w.mapId}|${w.seed}|${ent.map((e) => e.cell).join(',')}`;
    if (key === this.key) return false;
    this.key = key;
    this.entrances = ent;
    this.generate();
    this.version++;
    return true;
  }

  isOpen(x: number, z: number) {
    const cx = Math.floor(x), cz = Math.floor(z);
    return cx >= 0 && cz >= 0 && cx < N && cz < N && this.open[cz * N + cx] === 1;
  }

  /** Case où l'on peut marcher : ouverte et hors des bassins */
  walkable(cx: number, cz: number) {
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return false;
    const k = cz * N + cx;
    return this.open[k] === 1 && this.pool[k] === 0;
  }

  /** Hauteur affichée exacte (mêmes triangles que le maillage) */
  heightAt(wx: number, wz: number): number {
    const x = Math.min(Math.max(wx, 0), N - 1e-4) * VR, z = Math.min(Math.max(wz, 0), N - 1e-4) * VR;
    const cx = Math.floor(x), cz = Math.floor(z), u = x - cx, v = z - cz;
    const i = cz * VS + cx, vis = this.vis;
    const h00 = vis[i], h10 = vis[i + 1], h01 = vis[i + VS], h11 = vis[i + VS + 1];
    if (u >= v) return h00 + u * (h10 - h00) + v * (h11 - h10);
    return h00 + u * (h11 - h01) + v * (h01 - h00);
  }

  /** Distance en pas (cases où l'on marche) depuis une case, -1 hors d'atteinte */
  distances(from: number) {
    const d = new Int32Array(N * N).fill(-1), q = new Int32Array(N * N);
    let h = 0, t = 0;
    d[from] = 0; q[t++] = from;
    while (h < t) {
      const k = q[h++], x = k % N, z = (k - x) / N;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, n = nz * N + nx;
        if (!this.walkable(nx, nz) || d[n] >= 0) continue;
        d[n] = d[k] + 1; q[t++] = n;
      }
    }
    return d;
  }

  /**
   * Ce qu'une troupe partie de la case `from` peut prendre : distance en pas depuis les galeries tenues (`held`) d'un seul
   * tenant avec `from` (0 pour elles), jusqu'à `step` pas au-delà ; -1 plus loin ou hors d'atteinte
   */
  reach(held: Set<number>, from: number, step: number) {
    const d = new Int32Array(N * N).fill(-1), q = new Int32Array(N * N);
    let h = 0, t = 0;
    d[from] = 0; q[t++] = from;
    // d'abord toute la zone tenue reliée au départ, puis vague après vague au-delà du front
    for (const wild of [false, true]) {
      if (wild) h = 0;
      while (h < t) {
        const k = q[h++], x = k % N, z = (k - x) / N;
        if (wild && d[k] >= step) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz, n = nz * N + nx;
          if (!this.walkable(nx, nz) || d[n] >= 0 || (!wild && !held.has(n))) continue;
          d[n] = wild ? d[k] + 1 : 0; q[t++] = n;
        }
      }
    }
    return d;
  }

  /** Chemin de case en case entre deux cases où l'on marche (bornes comprises), ou null */
  route(from: number, to: number): number[] | null {
    const d = this.distances(to);
    if (d[from] < 0) return null;
    const out = [from];
    for (let k = from; k !== to;) {
      const x = k % N, z = (k - x) / N;
      let next = -1;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (z + dz) * N + x + dx; if (this.walkable(x + dx, z + dz) && d[n] === d[k] - 1) { next = n; break; } }
      if (next < 0) return null;
      out.push(next); k = next;
    }
    return out;
  }

  /** Case de galerie la plus proche d'une entrée (sous son puits de jour) */
  under(e: Entrance) {
    let best = -1, bd = 1e9;
    const cx = Math.floor(e.x), cz = Math.floor(e.z);
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (this.walkable(cx + dx, cz + dz) && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = (cz + dz) * N + cx + dx; }
    return best;
  }

  zoneAt(x: number, z: number) {
    const cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
    return this.zone[cz * N + cx];
  }

  private generate() {
    const w = this.world, seed = w.seed * 7 + w.mapId * 1013;
    const s1 = new Simplex(seed + 1), s2 = new Simplex(seed + 2), s3 = new Simplex(seed + 3), s4 = new Simplex(seed + 4), s5 = new Simplex(seed + 5);
    const open = this.open, inside = (x: number, z: number) => x >= BORDER && z >= BORDER && x < N - BORDER && z < N - BORDER;
    open.fill(0);
    // cavernes (« fromage ») et tunnels (« spaghettis ») : lignes de niveau zéro de deux bruits
    for (let z = BORDER; z < N - BORDER; z++)
      for (let x = BORDER; x < N - BORDER; x++) {
        const cheese = s1.fbm(x * 0.05, z * 0.05, 3);
        const worm = Math.abs(s2.fbm(x * 0.032, z * 0.032, 2)), worm2 = Math.abs(s3.fbm(x * 0.026 + 31, z * 0.026 - 17, 2));
        if (cheese > 0.17 || worm < 0.045 || worm2 < 0.04) open[z * N + x] = 1;
      }
    // automate cellulaire : bords adoucis, piliers isolés supprimés
    const tmp = new Uint8Array(N * N);
    for (let pass = 0; pass < 2; pass++) {
      tmp.set(open);
      for (let z = BORDER; z < N - BORDER; z++)
        for (let x = BORDER; x < N - BORDER; x++) {
          let n = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) n += tmp[(z + dz) * N + x + dx];
          if (n >= 5) open[z * N + x] = 1;
          else if (n <= 2) open[z * N + x] = 0;
        }
    }
    // salle dégagée sous chaque entrée
    const carve = (cx: number, cz: number, r: number) => {
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
          if (inside(x, z) && Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r) open[z * N + x] = 1;
    };
    for (const e of this.entrances) carve(e.x, e.z, 2.4);
    this.connect(s4, carve);

    // zones : biome de surface (domaine déformé pour des frontières naturelles), magma autour des volcans, poches de cristaux
    const volcanoes: [number, number][] = [];
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_VOLCANO) volcanoes.push([(k % N) + 0.5, Math.floor(k / N) + 0.5]);
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const k = z * N + x;
        const b = w.biomeAt(x + s1.noise2(x * 0.08, z * 0.08 + 100) * 6, z + s2.noise2(x * 0.08 + 100, z * 0.08) * 6);
        let zone = b === BIOME_TAIGA ? UZ_ICE : b === BIOME_DESERT ? UZ_MAGMA : b === BIOME_MARSH || b === BIOME_TROPICAL ? UZ_LUSH : UZ_STONE;
        if (volcanoes.some(([vx, vz]) => Math.hypot(x - vx, z - vz) < 13)) zone = UZ_MAGMA;
        else if (s3.fbm(x * 0.06 + 70, z * 0.06, 2) > 0.3) zone = UZ_CRYSTAL;
        this.zone[k] = zone;
      }

    // distance aux parois (parcours en largeur depuis la roche)
    const wd = this.wallDist, queue = new Int32Array(N * N);
    let head = 0, tail = 0;
    for (let k = 0; k < N * N; k++) if (!open[k]) { wd[k] = 0; queue[tail++] = k; } else wd[k] = 255;
    while (head < tail) {
      const k = queue[head++], x = k % N, z = Math.floor(k / N), d = wd[k];
      if (d >= 8) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const nk = nz * N + nx;
        if (wd[nk] > d + 1) { wd[nk] = d + 1; queue[tail++] = nk; }
      }
    }

    // sol ondulé ; lacs et bassins de lave au cœur des grandes salles, loin des entrées
    this.pool.fill(0);
    for (let z = 0; z < N; z++)
      for (let x = 0; x < N; x++) {
        const k = z * N + x;
        this.floor[k] = 0.1 + s5.fbm(x * 0.12, z * 0.12, 2) * 0.16;
        if (!open[k] || wd[k] < 3) continue;
        if (this.entrances.some((e) => Math.hypot(e.x - x - 0.5, e.z - z - 0.5) < 5)) continue;
        const lake = s4.fbm(x * 0.07 + 50, z * 0.07, 2);
        if (this.zone[k] === UZ_MAGMA ? lake > 0.1 : lake > 0.26) {
          this.pool[k] = this.zone[k] === UZ_MAGMA ? POOL_LAVA : POOL_WATER;
          this.floor[k] = -0.55;
        }
      }
    this.settlePools();
    this.buildVis(s5);
  }

  /**
   * Relie chaque poche de galeries (et chaque entrée) à la plus grande par un tunnel sinueux : chemin le moins coûteux
   * à travers la roche (coût bruité, les galeries existantes sont empruntées) ; les poches minuscules sont rebouchées
   */
  private connect(noise: Simplex, carve: (cx: number, cz: number, r: number) => void) {
    const open = this.open, comp = new Int32Array(N * N).fill(-1), sizes: number[] = [], queue = new Int32Array(N * N);
    for (let k = 0; k < N * N; k++) {
      if (!open[k] || comp[k] >= 0) continue;
      const id = sizes.length;
      let head = 0, tail = 0, size = 0;
      queue[tail++] = k; comp[k] = id;
      while (head < tail) {
        const c = queue[head++], x = c % N, z = Math.floor(c / N);
        size++;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = (z + dz) * N + x + dx;
          if (open[nk] && comp[nk] < 0) { comp[nk] = id; queue[tail++] = nk; }
        }
      }
      sizes.push(size);
    }
    if (!sizes.length) return;
    const main = sizes.indexOf(Math.max(...sizes));
    const hasEntrance = new Set(this.entrances.map((e) => comp[e.cell]));
    // Dijkstra depuis la grande galerie
    const cost = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1);
    const heap = new MinHeap();
    for (let k = 0; k < N * N; k++) if (comp[k] === main) { cost[k] = 0; heap.push(k, 0); }
    while (heap.size) {
      const [k, c] = heap.pop();
      if (c > cost[k]) continue;
      const x = k % N, z = Math.floor(k / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < BORDER || nz < BORDER || nx >= N - BORDER || nz >= N - BORDER) continue;
        const nk = nz * N + nx;
        const step = open[nk] ? 0.4 : 1 + 5 * (noise.noise2(nx * 0.17, nz * 0.17) * 0.5 + 0.5) ** 2;
        if (c + step < cost[nk]) { cost[nk] = c + step; from[nk] = k; heap.push(nk, c + step); }
      }
    }
    for (let id = 0; id < sizes.length; id++) {
      if (id === main) continue;
      if (sizes[id] < 14 && !hasEntrance.has(id)) {
        for (let k = 0; k < N * N; k++) if (comp[k] === id) open[k] = 0;
        continue;
      }
      // point de la poche le plus proche de la grande galerie, puis on remonte le chemin en creusant
      let best = -1;
      for (let k = 0; k < N * N; k++) if (comp[k] === id && (best < 0 || cost[k] < cost[best])) best = k;
      for (let k = best, guard = 0; k >= 0 && comp[k] !== main && guard < N * N; k = from[k], guard++) carve((k % N) + 0.5, Math.floor(k / N) + 0.5, 1.2);
    }
  }

  /**
   * Chaque lac d'un seul tenant devient tout d'eau ou tout de lave, selon la zone où il s'étend le plus ; l'eau qui
   * resterait à moins de trois cases d'une lave s'assèche (jamais de lac à moitié en feu)
   */
  private settlePools() {
    const pool = this.pool, seen = new Uint8Array(N * N), q = new Int32Array(N * N);
    for (let k0 = 0; k0 < N * N; k0++) {
      if (!pool[k0] || seen[k0]) continue;
      let h = 0, t = 0, lava = 0;
      seen[k0] = 1; q[t++] = k0;
      while (h < t) {
        const k = q[h++], x = k % N, z = (k - x) / N;
        if (this.zone[k] === UZ_MAGMA) lava++;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = (z + dz) * N + x + dx;
          if (x + dx < 0 || z + dz < 0 || x + dx >= N || z + dz >= N || !pool[n] || seen[n]) continue;
          seen[n] = 1; q[t++] = n;
        }
      }
      const kind = t < 12 ? 0 : lava * 2 >= t ? POOL_LAVA : POOL_WATER;
      for (let i = 0; i < t; i++) { pool[q[i]] = kind; if (!kind) this.floor[q[i]] = 0.1; }
    }
    for (let k = 0; k < N * N; k++) {
      if (pool[k] !== POOL_WATER) continue;
      const x = k % N, z = Math.floor(k / N);
      let near = false;
      for (let dz = -3; dz <= 3 && !near; dz++) for (let dx = -3; dx <= 3 && !near; dx++) near = pool[Math.min(N - 1, Math.max(0, z + dz)) * N + Math.min(N - 1, Math.max(0, x + dx))] === POOL_LAVA;
      if (near) { pool[k] = 0; this.floor[k] = 0.1; }
    }
  }

  /**
   * Relief affiché, aux contours organiques : la roche et les bassins sont des champs adoucis (1 en galerie, 0 dans la
   * roche), lus entre les centres de case en un point gauchi par un bruit doux ; la paroi monte franchement là où le champ
   * passe son seuil, le fond des bassins descend en pente douce ; crêtes des parois bosselées, sol à petites bosses
   */
  private buildVis(noise: Simplex) {
    const vis = this.vis;
    const blur = (src: Float32Array) => {
      const out = new Float32Array(N * N);
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++) {
          let s = 0;
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) s += src[Math.min(N - 1, Math.max(0, z + dz)) * N + Math.min(N - 1, Math.max(0, x + dx))] * (dx ? 1 : 2) * (dz ? 1 : 2);
          out[z * N + x] = s / 16;
        }
      return out;
    };
    const o0 = new Float32Array(N * N), b0 = new Float32Array(N * N), fl = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) { o0[k] = this.open[k]; b0[k] = this.pool[k] ? 1 : 0; fl[k] = this.pool[k] ? 0.1 : this.floor[k]; }
    const open = blur(blur(o0)), basin = blur(blur(b0));
    const sample = (f: Float32Array, fx: number, fz: number) => {
      const x = Math.min(N - 1.001, Math.max(0, fx)), z = Math.min(N - 1.001, Math.max(0, fz)), ix = Math.floor(x), iz = Math.floor(z), u = x - ix, v = z - iz, i = iz * N + ix;
      return (f[i] * (1 - u) + f[i + 1] * u) * (1 - v) + (f[i + N] * (1 - u) + f[i + N + 1] * u) * v;
    };
    const step = (a: number, b: number, t: number) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        // centres de case en (i + 0.5) ; le seuil (0.12 … 0.42) laisse dégagée une galerie large d'une seule case
        const wx = noise.noise2(x * 0.11, z * 0.11) * 0.3, wz = noise.noise2(x * 0.11 + 31, z * 0.11 - 17) * 0.3;
        const fx = x / VR - 0.5 + wx, fz = z / VR - 0.5 + wz;
        const op = sample(open, fx, fz), rock = 1 - step(ROCK_ISO, FLOOR_ISO, op), deep = step(0.25, 0.7, sample(basin, fx, fz));
        const ground = sample(fl, x / VR - 0.5, z / VR - 0.5) - deep * 0.68;
        const i = z * VS + x;
        // parois : relief rocheux (plus marqué en haut) ; sol : petites bosses
        const f = noise.fbm(x * 0.21, z * 0.21, 2), b0 = f * 0.03, b1 = f * 0.23 + noise.noise2(x * 0.7 + 40, z * 0.7) * 0.08;
        vis[i] = ground + (UWALL - ground) * rock + b0 + (b1 - b0) * rock;
        this.vOpen[i] = op; this.vGround[i] = ground; this.vBump0[i] = b0; this.vBump1[i] = b1;
      }
  }
}

/** Tas binaire minimal (Dijkstra) */
class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  get size() { return this.k.length; }
  push(key: number, pri: number) {
    const k = this.k, p = this.p;
    let i = k.length;
    k.push(key); p.push(pri);
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= p[i]) break;
      [k[i], k[j]] = [k[j], k[i]]; [p[i], p[j]] = [p[j], p[i]];
      i = j;
    }
  }
  pop(): [number, number] {
    const k = this.k, p = this.p, top: [number, number] = [k[0], p[0]];
    const lk = k.pop()!, lp = p.pop()!;
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[i], k[m]] = [k[m], k[i]]; [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}
