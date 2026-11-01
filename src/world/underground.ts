import { World, N, VR, VS, VEG_CAVE, VEG_FISSURE, VEG_VOLCANO, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH } from './world';
import { Simplex } from './noise';

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

  /** Relief affiché : sol et parois interpolés aux sous-sommets puis lissés, crêtes des parois bosselées */
  private buildVis(noise: Simplex) {
    const vis = this.vis, tmp = new Float32Array(VS * VS);
    const val = (cx: number, cz: number) => {
      cx = Math.min(N - 1, Math.max(0, cx)); cz = Math.min(N - 1, Math.max(0, cz));
      const k = cz * N + cx;
      return this.open[k] ? this.floor[k] : UWALL;
    };
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        // centres de case en (i + 0.5)
        const fx = x / VR - 0.5, fz = z / VR - 0.5, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
        const a = val(ix, iz) + (val(ix + 1, iz) - val(ix, iz)) * u, b = val(ix, iz + 1) + (val(ix + 1, iz + 1) - val(ix, iz + 1)) * u;
        vis[z * VS + x] = a + (b - a) * v;
      }
    // un seul lissage : parois franches, pied adouci
    for (let pass = 0; pass < 1; pass++) {
      tmp.set(vis);
      for (let z = 1; z < VS - 1; z++)
        for (let x = 1; x < VS - 1; x++) {
          const i = z * VS + x;
          vis[i] = (4 * tmp[i] + 2 * (tmp[i - 1] + tmp[i + 1] + tmp[i - VS] + tmp[i + VS]) + tmp[i - VS - 1] + tmp[i - VS + 1] + tmp[i + VS - 1] + tmp[i + VS + 1]) / 16;
        }
    }
    // parois : relief rocheux (plus marqué en haut), sol : petites bosses
    for (let z = 0; z < VS; z++)
      for (let x = 0; x < VS; x++) {
        const i = z * VS + x, h = vis[i], wall = Math.min(1, Math.max(0, (h - 0.3) / (UWALL - 0.3)));
        vis[i] += noise.fbm(x * 0.21, z * 0.21, 2) * (0.04 + wall * 0.3) + noise.noise2(x * 0.7 + 40, z * 0.7) * wall * 0.12;
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
