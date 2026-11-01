import { Building, KINDS, KindId } from '../build/catalog';
import { Simplex } from './noise';
import { ExpState, newExpState, readExpState } from '../sim/missions';

/** Bâtiments passés de 1 × 1 à 2 × 2 : une ancienne sauvegarde les fait grandir sur place */
const GREW: KindId[] = ['health', 'school', 'fire'];

/** Côté de la carte en cases : propre à chaque carte, fixé (setMapSize) avant de créer le monde et ses vues */
export let N = 96;
export const SEA = 0;
export const MAX_H = 16;
export const MIN_H = -2.4;
/** Étages de montagne : plus d'arbres au-dessus de TREE_LINE ; neiges éternelles entre les deux altitudes de SNOW_LINE */
export const TREE_LINE = 5.8;
export const SNOW_LINE: [number, number] = [7, 8.2];
/** Relief affiché : VR sous-sommets par case, lissé (la grille de jeu reste N×N) */
export const VR = 2;
export let VS = N * VR + 1;

/** Taille de la carte choisie ; à appeler avant de construire le monde, ses vues et la caméra (tailles des tableaux) */
export function setMapSize(n: number) {
  N = n;
  VS = n * VR + 1;
}
const VIS_PASSES = 3;

export interface Snapshot {
  heights: Float32Array;
  road: Uint8Array;
  veg: Uint8Array;
  buildings: Building[];
  nextId: number;
}

export interface WorldListener {
  onAdd(b: Building, animate: boolean): void;
  onRemove(b: Building): void;
  onChange(b: Building): void;
  onReset(): void;
}

/**
 * Vegetation: 0 rien, 1 forêt, 2 champ, 3 jardin ; décors sans effet sur la simulation : 4 rocaille, 5 entrée de grotte,
 * 6 épave, 7 cratère de volcan, 8 faille ; grottes et failles mènent au monde souterrain
 */
export const VEG_FOREST = 1, VEG_FIELD = 2, VEG_GARDEN = 3, VEG_ROCKS = 4, VEG_CAVE = 5, VEG_WRECK = 6, VEG_VOLCANO = 7, VEG_FISSURE = 8;
/** Rayon de l'emprise d'une grotte (butte rocheuse autour de l'ouverture) */
export const CAVE_R = 1.15;
/**
 * Tunnel d'une grotte, dans son repère (ouverture vers +z, sol du tunnel en y = 0) : demi-largeur et demi-hauteur de l'arche,
 * hauteur de son centre, début et profondeur du tunnel ; le relief est ouvert à l'intérieur (TerrainView)
 */
export const CAVE_TUNNEL = { a: 0.3, b: 0.38, cy: 0.27, z0: 0.21, depth: 1.15, floor: 0.04 };

/** Rayon maximal du cône d'un volcan (outil Volcan au plus grand pinceau) */
export const VOLCANO_MAX_R = 17;
/** Volcan : centre du cratère, hauteurs du fond, du rebord et du pied, rayon du cône */
export interface VolcanoFrame { x: number; z: number; floor: number; rim: number; foot: number; r: number }

/** Faille (ravin façon Minecraft) : sillon sinueux de longueur `len`, tourné de `yaw`, large de 2 × `width`, profond de `depth` */
export interface FissureFrame { x: number; z: number; yaw: number; len: number; width: number; depth: number; phase: number }

/** Décalage latéral (méandres) et demi-largeur d'une faille à l'abscisse u (-len/2 … len/2) */
export function fissureAt(f: FissureFrame, u: number): [number, number] {
  const t = Math.min(1, Math.abs(u) / (f.len / 2));
  const off = Math.sin(u * 0.7 + f.phase) * 0.5 + Math.sin(u * 1.9 + f.phase * 2) * 0.15;
  return [off, f.width * Math.pow(Math.max(0, 1 - t * t), 0.45)];
}

const smooth01 = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Biomes, déduits du climat (température, humidité) et du relief : ils choisissent les essences, le sol et la faune */
export const BIOME_TEMPERATE = 0, BIOME_TAIGA = 1, BIOME_DESERT = 2, BIOME_TROPICAL = 3, BIOME_MARSH = 4;
export const BIOME_NAMES = ['Tempéré', 'Taïga', 'Désert', 'Tropical', 'Marais'];
/** Climat de chaque carte : axe froid → chaud (unitaire) et décalage de température ; le continent a son propre climat */
const CLIMATE: [number, number, number][] = [[0.33, 0.94, 0.02], [0, 1, 0], [0.96, -0.28, 0.04]];
const CONTINENT = 3;

/** Hash 0..1 d'une case (orientation des décors) */
const hashCell = (x: number, z: number) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class World {
  readonly n = N;
  mapId = 0;
  seed = 1;
  heights = new Float32Array((N + 1) * (N + 1));
  occ = new Int32Array(N * N);
  road = new Uint8Array(N * N);
  veg = new Uint8Array(N * N);
  buildings = new Map<number, Building>();
  nextId = 1;
  terrainDirty = true;
  roadsDirty = true;
  vegDirty = true;
  /** Incrémenté à chaque modification structurelle (pour la simulation) */
  version = 0;
  listeners: WorldListener[] = [];
  /** Hauteurs affichées (grille VS×VS) : relief adouci, emprises des bâtiments gardées à plat */
  vis = new Float32Array(VS * VS);
  /** Change à chaque recalcul du relief affiché (lacs et torrents s'en déduisent) */
  visVersion = 0;
  private visTmp = new Float32Array(VS * VS);
  private visWork = new Float32Array(VS * VS);
  /** Sous-sommets recalculés par le dernier updateVis (bornes incluses) */
  visWindow: [number, number, number, number] = [0, 0, 0, 0];
  /** Zone (cases, bornes incluses) dont le relief a changé depuis le dernier affichage ; null avec terrainDirty = tout */
  terrainRect: [number, number, number, number] | null = null;
  private terrainAll = true;
  private visUp = new Float32Array(VS * VS);
  private visPin = new Uint8Array(VS * VS);
  /** Biome de chaque case, et le climat de fond (sans le relief) dont il découle */
  biome = new Uint8Array(N * N);
  private temp = new Float32Array(N * N);
  private wet = new Float32Array(N * N);
  private climateKey = '';
  /** Distance (en cases, plafonnée) à l'eau la plus proche */
  waterDist = new Uint8Array(N * N);
  /** Vie sauvage, non sauvegardée : herbe broutée (0 intacte … 1 rase) et fleurs semées par les abeilles */
  grazed = new Float32Array(N * N);
  bloom = new Float32Array(N * N);
  /** Zone (cases, bornes incluses) dont la végétation est à refaire, et cases dont la vie sauvage a changé l'aspect */
  vegRect: [number, number, number, number] | null = null;
  lifeCells = new Set<number>();
  /** Cases couvertes par une grotte ou une faille (on n'y bâtit pas, la végétation s'en écarte) */
  decor = new Uint8Array(N * N);
  /** Torches posées dans le monde souterrain (cases) */
  torches = new Set<number>();
  /** Par sous-sommet du relief affiché : creusement des ravins (0 hors d'une faille … 1 au fond) */
  ravine = new Float32Array(VS * VS);
  /** Lacs de montagne : cases noyées et niveau de leur eau (non sauvegardés, déduits du relief) */
  lake = new Uint8Array(N * N);
  lakeLevel = new Float32Array(N * N);
  /** Champs de lave refroidie laissés par les éruptions (0 … 1) : la mousse, l'herbe puis la forêt les recolonisent peu à peu */
  basalt = new Float32Array(N * N);
  /** Zone (cases, bornes incluses) dont la teinte des champs de lave a changé */
  basaltRect: [number, number, number, number] | null = null;
  /** Cendres volcaniques : un champ semé sur une ancienne coulée donne double récolte (sauvegardé) */
  ash = new Uint8Array(N * N);
  /** Catastrophes naturelles (réglage) : la lave et le feu détruisent alors les bâtiments */
  disasters = true;
  /** Bâtiments perdus (lave), à annoncer */
  losses: string[] = [];
  /** Minerai extrait du monde souterrain, et filons déjà exploités (cases du souterrain) */
  ore = 0;
  /** expéditions : missions réussies, bêtes ramenées, savoir-faire et bonus (sauvegardé) */
  exp: ExpState = newExpState();
  mined = new Set<number>();

  /**
   * La lave recouvre la case : les arbres brûlent, le sol devient basalte puis cendre fertile ; les routes sont épargnées,
   * et, sans catastrophes naturelles, les bâtiments, champs et jardins aussi
   */
  coverLava(k: number) {
    const v = this.veg[k];
    if (this.basalt[k] >= 0.99 || this.road[k] || v >= VEG_CAVE) return;
    if (this.cellAvg(k % N, Math.floor(k / N)) < 0.05) return;
    if (this.occ[k] || v === VEG_FIELD || v === VEG_GARDEN) {
      if (!this.disasters) return;
      const b = this.buildings.get(this.occ[k]);
      if (b) { this.losses.push(`🌋 La lave a englouti : ${KINDS[b.kind].names[b.age]}`); this.removeBuilding(b.id); }
    }
    this.basalt[k] = 1;
    this.ash[k] = 1;
    if (v === VEG_FOREST || v === VEG_FIELD || v === VEG_GARDEN) { this.veg[k] = 0; this.version++; }
    this.markBasalt(k);
  }

  /** Recolonisation des champs de lave : `step` = part regagnée (1 = tout) */
  regrow(step: number) {
    for (let k = 0; k < N * N; k++) {
      const b = this.basalt[k];
      if (b <= 0) continue;
      const nb = Math.max(0, b - step);
      this.basalt[k] = nb;
      // l'aspect ne change que par paliers : on ne refait que les cases qui en franchissent un
      if (Math.ceil(nb * 10) !== Math.ceil(b * 10)) this.markBasalt(k);
    }
  }

  private markBasalt(k: number) {
    const cx = k % N, cz = Math.floor(k / N), r = this.basaltRect;
    this.basaltRect = r ? [Math.min(r[0], cx), Math.min(r[1], cz), Math.max(r[2], cx), Math.max(r[3], cz)] : [cx, cz, cx, cz];
    this.markVeg(cx, cz, cx, cz);
    this.vegDirty = true;
  }

  /** Relief modifié dans une zone (cases) */
  markTerrain(x0: number, z0: number, x1: number, z1: number) {
    this.terrainDirty = true;
    if (this.terrainAll) return;
    const r = this.terrainRect;
    x0 = Math.max(0, Math.floor(x0)); z0 = Math.max(0, Math.floor(z0)); x1 = Math.min(N - 1, Math.ceil(x1)); z1 = Math.min(N - 1, Math.ceil(z1));
    this.terrainRect = r ? [Math.min(r[0], x0), Math.min(r[1], z0), Math.max(r[2], x1), Math.max(r[3], z1)] : [x0, z0, x1, z1];
  }

  /** Relief modifié partout (chargement, annulation, génération) */
  markTerrainAll() { this.terrainDirty = true; this.terrainAll = true; this.terrainRect = null; }

  /** Zone de relief à refaire (null = toute la carte), remise à zéro */
  takeTerrainRect() {
    const r = this.terrainAll ? null : this.terrainRect;
    this.terrainAll = false;
    this.terrainRect = null;
    return r;
  }

  markVeg(x0: number, z0: number, x1: number, z1: number) {
    const r = this.vegRect;
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(N - 1, x1); z1 = Math.min(N - 1, z1);
    this.vegRect = r ? [Math.min(r[0], x0), Math.min(r[1], z0), Math.max(r[2], x1), Math.max(r[3], z1)] : [x0, z0, x1, z1];
  }

  vi(x: number, z: number) { return z * (N + 1) + x; }
  ci(x: number, z: number) { return z * N + x; }
  inCells(x: number, z: number) { return x >= 0 && z >= 0 && x < N && z < N; }
  h(x: number, z: number) { return this.heights[this.vi(x, z)]; }

  cellCorners(cx: number, cz: number): [number, number, number, number] {
    return [this.h(cx, cz), this.h(cx + 1, cz), this.h(cx, cz + 1), this.h(cx + 1, cz + 1)];
  }
  cellAvg(cx: number, cz: number) {
    const c = this.cellCorners(cx, cz);
    return (c[0] + c[1] + c[2] + c[3]) / 4;
  }
  cellMin(cx: number, cz: number) { return Math.min(...this.cellCorners(cx, cz)); }
  cellSlope(cx: number, cz: number) {
    const c = this.cellCorners(cx, cz);
    return Math.max(...c) - Math.min(...c);
  }

  /** Hauteur affichée exacte (mêmes triangles que le maillage du relief) */
  hAt(wx: number, wz: number): number {
    const x = Math.min(Math.max(wx, 0), N - 1e-4) * VR, z = Math.min(Math.max(wz, 0), N - 1e-4) * VR;
    const cx = Math.floor(x), cz = Math.floor(z);
    const u = x - cx, v = z - cz;
    const i = cz * VS + cx, vis = this.vis;
    const h00 = vis[i], h10 = vis[i + 1], h01 = vis[i + VS], h11 = vis[i + VS + 1];
    if (u >= v) return h00 + u * (h10 - h00) + v * (h11 - h10);
    return h00 + u * (h11 - h01) + v * (h01 - h00);
  }

  /**
   * Repère d'une entrée de grotte : pied de l'ouverture au centre de la case, tournée vers l'aval (cap = atan2(dx, dz)) ;
   * sur le plat, un cap tiré de la case
   */
  caveFrame(cx: number, cz: number, at = (x: number, z: number) => this.hAt(x, z)) {
    const x = cx + 0.5, z = cz + 0.5, e = 0.6;
    // cap tiré du relief de jeu : la butte ajoutée derrière la grotte ne le fait pas tourner
    const gx = this.rawAt(x + e, z) - this.rawAt(x - e, z), gz = this.rawAt(x, z + e) - this.rawAt(x, z - e);
    const yaw = Math.hypot(gx, gz) > 0.08 ? Math.atan2(-gx, -gz) : hashCell(cx, cz) * Math.PI * 2;
    return { x, y: at(x, z), z, yaw };
  }

  /** Repère d'une faille : centrée sur sa case, orientation, longueur et profondeur tirées de la case */
  fissureFrame(cx: number, cz: number): FissureFrame {
    const h = hashCell(cx, cz);
    return { x: cx + 0.5, z: cz + 0.5, yaw: h * Math.PI, len: 7 + ((h * 7.31) % 1) * 3, width: 0.85 + ((h * 3.17) % 1) * 0.25, depth: 2.6 + ((h * 5.13) % 1) * 1.2, phase: h * 40 };
  }

  /**
   * Repère d'un volcan posé en (cx, cz) : fond du cratère, rebord, et pied du cône trouvé en descendant chaque flanc depuis le
   * rebord jusqu'à ce que le sol cesse de baisser (la taille du cône dépend du pinceau)
   */
  volcanoFrame(cx: number, cz: number): VolcanoFrame {
    const x = cx + 0.5, z = cz + 0.5;
    let foot = 0, reach = 0, rim = -Infinity, floor = Infinity;
    for (let dz = -1.2; dz <= 1.2; dz += 0.4) for (let dx = -1.2; dx <= 1.2; dx += 0.4) floor = Math.min(floor, this.hAt(x + dx, z + dz));
    for (let a = 0; a < 16; a++) {
      const ca = Math.cos((a / 16) * Math.PI * 2), sa = Math.sin((a / 16) * Math.PI * 2);
      let r = 1.5, y = -Infinity, flat = 0;
      for (const q of [1.5, 2.5, 3.5, 4.5]) { const hq = this.hAt(x + ca * q, z + sa * q); if (hq > y) { y = hq; r = q; } }
      const top = y;
      rim = Math.max(rim, y);
      while (r < VOLCANO_MAX_R) {
        const hn = this.hAt(x + ca * (r + 0.5), z + sa * (r + 0.5));
        // le rebord arasé est plat : on ne s'arrête qu'une fois descendu du sommet, ou après un long replat
        if (hn > y - 0.08) { if (top - y > 1 || ++flat > 3) break; } else flat = 0;
        y = Math.min(y, hn); r += 0.5;
      }
      foot += y; reach += r;
    }
    return { x, z, floor, rim, foot: foot / 16, r: reach / 16 + 1.5 };
  }

  /** Volcan dont le cône couvre le point : sa case, ou -1 */
  volcanoAt(x: number, z: number) {
    const cx = Math.floor(x), cz = Math.floor(z), R = Math.ceil(VOLCANO_MAX_R);
    let best = -1, bd = Infinity;
    for (let kz = Math.max(0, cz - R); kz <= Math.min(N - 1, cz + R); kz++)
      for (let kx = Math.max(0, cx - R); kx <= Math.min(N - 1, cx + R); kx++) {
        if (this.veg[kz * N + kx] !== VEG_VOLCANO) continue;
        const d = Math.hypot(x - kx - 0.5, z - kz - 0.5);
        if (d < bd && d < this.volcanoFrame(kx, kz).r * 0.85) { bd = d; best = kz * N + kx; }
      }
    return best;
  }

  /** Cases couvertes par la grotte ou la faille posée en (cx, cz) */
  decorCells(cx: number, cz: number, type: number): number[] {
    const out: number[] = [];
    if (type === VEG_CAVE) {
      // butte centrée un peu en retrait de l'ouverture
      const f = this.caveFrame(cx, cz, (x, z) => this.rawAt(x, z));
      const mx = f.x - Math.sin(f.yaw) * 0.35, mz = f.z - Math.cos(f.yaw) * 0.35;
      for (let z = cz - 2; z <= cz + 2; z++)
        for (let x = cx - 2; x <= cx + 2; x++) if (Math.hypot(x + 0.5 - mx, z + 0.5 - mz) < CAVE_R + 0.5) out.push(z * N + x);
    } else if (type === VEG_FISSURE) {
      const f = this.fissureFrame(cx, cz), c = Math.cos(f.yaw), s = Math.sin(f.yaw);
      for (let z = cz - 7; z <= cz + 7; z++)
        for (let x = cx - 7; x <= cx + 7; x++) {
          // repère de la faille : u le long, v en travers
          const dx = x + 0.5 - f.x, dz = z + 0.5 - f.z, u = dx * c + dz * s, v = -dx * s + dz * c;
          if (Math.abs(u) > f.len / 2 + 0.3) continue;
          const [off, hw] = fissureAt(f, u);
          if (Math.abs(v - off) < hw + 0.6) out.push(z * N + x);
        }
    }
    return out;
  }

  /** Emprise libre pour une grotte ou une faille : sur la terre ferme, sans bâtiment, route ni autre décor */
  decorFits(cx: number, cz: number, type: number) {
    const self = cz * N + cx;
    for (const k of this.decorCells(cx, cz, type)) {
      const x = k % N, z = Math.floor(k / N);
      if (x < 1 || z < 1 || x > N - 2 || z > N - 2) return false;
      if (this.occ[k] || this.road[k] || this.cellAvg(x, z) < 0.15) return false;
      if (k !== self && (this.decor[k] || this.veg[k] >= VEG_CAVE)) return false;
    }
    return true;
  }

  /** Entrée du souterrain (grotte ou faille) dont l'emprise couvre le point : sa case, ou -1 */
  entranceAt(x: number, z: number) {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (!this.inCells(cx, cz) || !this.decor[cz * N + cx]) return -1;
    let best = -1, bd = Infinity;
    for (let dz = -7; dz <= 7; dz++)
      for (let dx = -7; dx <= 7; dx++) {
        const kx = cx + dx, kz = cz + dz;
        if (!this.inCells(kx, kz)) continue;
        const t = this.veg[kz * N + kx];
        if ((t !== VEG_CAVE && t !== VEG_FISSURE) || !this.decorCells(kx, kz, t).includes(cz * N + cx)) continue;
        if (Math.hypot(dx, dz) < bd) { bd = Math.hypot(dx, dz); best = kz * N + kx; }
      }
    return best;
  }

  /** Recalcule l'emprise des grottes et des failles */
  computeDecor() {
    this.decor.fill(0);
    for (let k = 0; k < N * N; k++) {
      const t = this.veg[k];
      if (t !== VEG_CAVE && t !== VEG_FISSURE) continue;
      for (const c of this.decorCells(k % N, Math.floor(k / N), t)) if (c >= 0 && c < N * N) this.decor[c] = t;
    }
  }

  /** Hauteur brute de la grille de jeu (mêmes triangles que hAt) : utilisable avant le calcul du relief affiché */
  rawAt(wx: number, wz: number): number {
    const x = Math.min(Math.max(wx, 0), N - 1e-4), z = Math.min(Math.max(wz, 0), N - 1e-4);
    const cx = Math.floor(x), cz = Math.floor(z), u = x - cx, v = z - cz;
    const h00 = this.h(cx, cz), h10 = this.h(cx + 1, cz), h01 = this.h(cx, cz + 1), h11 = this.h(cx + 1, cz + 1);
    if (u >= v) return h00 + u * (h10 - h00) + v * (h11 - h10);
    return h00 + u * (h11 - h01) + v * (h01 - h00);
  }

  /** Recalcule le relief affiché : suréchantillonnage puis flou binomial, sauf sous les bâtiments ; sommets et falaises gardent leurs arêtes */
  updateVis(rect: [number, number, number, number] | null = null) {
    this.computeBiomes();
    this.computeDecor();
    // fenêtre recalculée (sous-sommets) : la zone retouchée et deux cases de marge (lissage) ; plus large, la fenêtre de calcul,
    // qui rétrécit d'un sommet à chaque passe de lissage pour que l'intérieur soit exact
    let ix0 = 0, iz0 = 0, ix1 = VS - 1, iz1 = VS - 1;
    if (rect) {
      ix0 = Math.max(0, (rect[0] - 2) * VR); iz0 = Math.max(0, (rect[1] - 2) * VR);
      ix1 = Math.min(VS - 1, (rect[2] + 3) * VR); iz1 = Math.min(VS - 1, (rect[3] + 3) * VR);
    }
    this.visWindow = [ix0, iz0, ix1, iz1];
    const grow = (v: number, d: number) => Math.min(VS - 1, Math.max(0, v + d));
    const ox0 = grow(ix0, -VIS_PASSES), oz0 = grow(iz0, -VIS_PASSES), ox1 = grow(ix1, VIS_PASSES), oz1 = grow(iz1, VIS_PASSES);
    const vis = this.vis, A = this.visWork, tmp = this.visTmp, pin = this.visPin, up = this.visUp;
    for (let z = oz0; z <= oz1; z++)
      for (let x = ox0; x <= ox1; x++) {
        const ix = Math.min(N - 1, Math.floor(x / VR)), iz = Math.min(N - 1, Math.floor(z / VR));
        const u = x / VR - ix, v = z / VR - iz;
        const a = this.h(ix, iz) + (this.h(ix + 1, iz) - this.h(ix, iz)) * u;
        const b = this.h(ix, iz + 1) + (this.h(ix + 1, iz + 1) - this.h(ix, iz + 1)) * u;
        const i = z * VS + x;
        A[i] = up[i] = a + (b - a) * v;
        pin[i] = 0;
      }
    // sous les bâtiments, le sol reste à plat
    for (let cz = Math.max(0, Math.floor(oz0 / VR) - 1); cz <= Math.min(N - 1, Math.ceil(oz1 / VR)); cz++)
      for (let cx = Math.max(0, Math.floor(ox0 / VR) - 1); cx <= Math.min(N - 1, Math.ceil(ox1 / VR)); cx++) {
        if (!this.occ[this.ci(cx, cz)]) continue;
        for (let z = Math.max(oz0, cz * VR); z <= Math.min(oz1, (cz + 1) * VR); z++)
          for (let x = Math.max(ox0, cx * VR); x <= Math.min(ox1, (cx + 1) * VR); x++) pin[z * VS + x] = 1;
      }
    // passes de lissage binomial ; au bord de la carte, la fenêtre ne rétrécit pas (voisins répétés)
    for (let pass = 1; pass <= VIS_PASSES; pass++) {
      const rx0 = ox0 === 0 ? 0 : ox0 + pass, rz0 = oz0 === 0 ? 0 : oz0 + pass;
      const rx1 = ox1 === VS - 1 ? VS - 1 : ox1 - pass, rz1 = oz1 === VS - 1 ? VS - 1 : oz1 - pass;
      for (let z = Math.max(0, rz0 - 1); z <= Math.min(VS - 1, rz1 + 1); z++) {
        const row = z * VS;
        tmp.set(A.subarray(row + Math.max(0, rx0 - 1), row + Math.min(VS - 1, rx1 + 1) + 1), row + Math.max(0, rx0 - 1));
      }
      for (let z = rz0; z <= rz1; z++)
        for (let x = rx0; x <= rx1; x++) {
          const i = z * VS + x;
          if (pin[i]) continue;
          const xl = x > 0 ? i - 1 : i, xr = x < VS - 1 ? i + 1 : i;
          const zu = z > 0 ? -VS : 0, zd = z < VS - 1 ? VS : 0;
          A[i] = (4 * tmp[i] + 2 * (tmp[xl] + tmp[xr] + tmp[i + zu] + tmp[i + zd])
            + tmp[xl + zu] + tmp[xr + zu] + tmp[xl + zd] + tmp[xr + zd]) / 16;
        }
    }
    // le lissage s'estompe en altitude (crêtes franches) et au bord des à-pics (falaises verticales)
    for (let z = iz0; z <= iz1; z++)
      for (let x = ix0; x <= ix1; x++) {
        const i = z * VS + x;
        if (!pin[i]) {
          let drop = 0;
          if (x > 0) drop = Math.max(drop, Math.abs(up[i] - up[i - 1]));
          if (x < VS - 1) drop = Math.max(drop, Math.abs(up[i] - up[i + 1]));
          if (z > 0) drop = Math.max(drop, Math.abs(up[i] - up[i - VS]));
          if (z < VS - 1) drop = Math.max(drop, Math.abs(up[i] - up[i + VS]));
          const a = Math.min(1, Math.max(0, (up[i] - 3) / 3)), c = Math.min(1, Math.max(0, (drop - 0.35) / 0.35));
          const k = Math.max(a * a * (3 - 2 * a) * 0.7, c * c * (3 - 2 * c) * 0.9);
          if (k > 0) A[i] += (up[i] - A[i]) * k;
        }
        vis[i] = A[i];
      }
    this.carveRavines(ix0, iz0, ix1, iz1);
    this.raiseCaveKnolls(ix0, iz0, ix1, iz1);
    this.visVersion++;
  }

  /**
   * Grottes : butte de terre derrière l'ouverture (nulle au seuil), qui recouvre le dos du rocher ; seule la façade rocheuse
   * et son arche dépassent, comme creusées dans la colline
   */
  private raiseCaveKnolls(wx0: number, wz0: number, wx1: number, wz1: number) {
    const vis = this.vis, H = 1.2;
    for (let k = 0; k < N * N; k++) {
      if (this.veg[k] !== VEG_CAVE) continue;
      const cx = k % N, cz = Math.floor(k / N), f = this.caveFrame(cx, cz, (x, z) => this.rawAt(x, z));
      const c = Math.cos(f.yaw), s = Math.sin(f.yaw), R = 4;
      for (let z = Math.max(wz0, Math.floor((f.z - R) * VR)); z <= Math.min(wz1, Math.ceil((f.z + R) * VR)); z++)
        for (let x = Math.max(wx0, Math.floor((f.x - R) * VR)); x <= Math.min(wx1, Math.ceil((f.x + R) * VR)); x++) {
          // repère de la grotte : lx de côté, lz vers l'avant (l'ouverture)
          const dx = x / VR - f.x, dz = z / VR - f.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
          const back = smooth01(0, -0.65, lz) * (1 - smooth01(-1.8, -3, lz)), side = 1 - smooth01(1.1, 2.3, Math.abs(lx));
          // le sol des bâtiments voisins reste à plat
          if (back * side > 0 && !this.visPin[z * VS + x]) vis[z * VS + x] += H * back * side;
        }
    }
  }

  /**
   * Failles : ravins façon Minecraft creusés dans le relief affiché, après le lissage pour garder des parois presque verticales ;
   * le sol de jeu (cases) ne change pas, le fond peut descendre sous le niveau de la mer sans se remplir d'eau
   */
  private carveRavines(wx0: number, wz0: number, wx1: number, wz1: number) {
    const vis = this.vis, rv = this.ravine;
    for (let z = wz0; z <= wz1; z++) rv.fill(0, z * VS + wx0, z * VS + wx1 + 1);
    for (let k = 0; k < N * N; k++) {
      if (this.veg[k] !== VEG_FISSURE) continue;
      const f = this.fissureFrame(k % N, Math.floor(k / N)), c = Math.cos(f.yaw), s = Math.sin(f.yaw), R = f.len / 2 + 1.5;
      for (let z = Math.max(wz0, Math.floor((f.z - R) * VR)); z <= Math.min(wz1, Math.ceil((f.z + R) * VR)); z++)
        for (let x = Math.max(wx0, Math.floor((f.x - R) * VR)); x <= Math.min(wx1, Math.ceil((f.x + R) * VR)); x++) {
          const dx = x / VR - f.x, dz = z / VR - f.z, u = dx * c + dz * s, v = -dx * s + dz * c;
          if (Math.abs(u) > f.len / 2) continue;
          const [off, hw] = fissureAt(f, u);
          // pleine profondeur au cœur, bord franc ; le ravin remonte vers ses extrémités
          const wgt = 1 - smooth01(hw * 0.35, hw + 0.4, Math.abs(v - off));
          if (wgt <= 0) continue;
          const t = Math.abs(u) / (f.len / 2), d = wgt * Math.min(1, (1 - t * t) * 1.8);
          const i = z * VS + x;
          if (d <= rv[i] || this.visPin[i]) continue;
          vis[i] -= f.depth * (d - rv[i]);
          rv[i] = d;
        }
    }
  }

  isWaterCell(cx: number, cz: number) { return this.cellAvg(cx, cz) < 0.08; }

  biomeAt(x: number, z: number) {
    const cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
    return this.biome[cz * N + cx];
  }

  /**
   * Biomes : la température suit un axe propre à chaque carte et baisse avec l'altitude (taïga sur les sommets),
   * l'humidité monte près de l'eau ; le côté chaud se partage entre désert (sec) et tropiques (humide),
   * les basses terres humides au bord de l'eau deviennent des marais
   */
  computeBiomes() {
    const key = `${this.mapId}|${this.seed}`;
    if (key !== this.climateKey) {
      this.climateKey = key;
      const st = new Simplex(this.seed * 13 + 5), sm = new Simplex(this.seed * 17 + 9);
      const [ax, az, bias] = CLIMATE[this.mapId] ?? CLIMATE[0];
      for (let cz = 0; cz < N; cz++)
        for (let cx = 0; cx < N; cx++) {
          const u = (cx + 0.5) / N - 0.5, v = (cz + 0.5) / N - 0.5;
          // continent : froid au nord, chaud au sud et à l'est (mesas du désert, archipel tropical)
          const base = this.mapId === CONTINENT ? v * 1.5 + Math.max(0, u) * 1.1 - 0.05 : (u * ax + v * az) * 1.7 + bias;
          this.temp[cz * N + cx] = base + st.fbm(cx * 0.03, cz * 0.03, 3) * 0.45;
          this.wet[cz * N + cx] = sm.fbm(cx * 0.04 + 50, cz * 0.04, 3) * 0.8;
        }
    }
    // distance à l'eau : parcours en largeur depuis les cases d'eau
    const dist = this.waterDist, queue = new Int32Array(N * N);
    let head = 0, tail = 0;
    for (let k = 0; k < N * N; k++) {
      if (this.isWaterCell(k % N, Math.floor(k / N))) { dist[k] = 0; queue[tail++] = k; } else dist[k] = 255;
    }
    while (head < tail) {
      const k = queue[head++], cx = k % N, cz = Math.floor(k / N), d = dist[k];
      if (d >= 12) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = cx + dx, z = cz + dz;
        if (!this.inCells(x, z) || dist[z * N + x] <= d + 1) continue;
        dist[z * N + x] = d + 1;
        queue[tail++] = z * N + x;
      }
    }
    for (let k = 0; k < N * N; k++) {
      const h = this.cellAvg(k % N, Math.floor(k / N)), d = dist[k];
      const t = this.temp[k] - Math.max(0, h - 2.6) * 0.22;
      const m = this.wet[k] + (d <= 2 ? 0.25 : d <= 5 ? 0.1 : 0);
      let b = BIOME_TEMPERATE;
      if (t < -0.36) b = BIOME_TAIGA;
      else if (t > 0.3) b = m < 0.08 ? BIOME_DESERT : BIOME_TROPICAL;
      else if (m > 0.32 && h < 1.4 && d <= 4) b = BIOME_MARSH;
      this.biome[k] = b;
    }
  }

  buildingAt(cx: number, cz: number): Building | undefined {
    if (!this.inCells(cx, cz)) return undefined;
    const id = this.occ[this.ci(cx, cz)];
    return id ? this.buildings.get(id) : undefined;
  }

  nearWater(cx: number, cz: number, r = 3) {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz;
        if (this.inCells(x, z) && (this.cellAvg(x, z) < -0.05 || this.lake[this.ci(x, z)])) return true;
      }
    return false;
  }

  /** Lacs de montagne (calculés à partir du relief affiché) : cases noyées et niveau de l'eau ; true si quelque chose a changé */
  setLakes(cells: Uint8Array, level: Float32Array) {
    let same = true;
    for (let k = 0; k < N * N && same; k++) if (cells[k] !== this.lake[k]) same = false;
    this.lakeLevel.set(level);
    if (same) return false;
    // la végétation se refait là où l'eau est montée ou s'est retirée
    let x0 = N, z0 = N, x1 = -1, z1 = -1;
    for (let k = 0; k < N * N; k++) if (cells[k] !== this.lake[k]) { const x = k % N, z = Math.floor(k / N); x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    this.lake.set(cells);
    this.markVeg(x0, z0, x1, z1);
    this.vegDirty = true;
    this.version++;
    return true;
  }

  /** Case d'eau (mer, rivière, mare ou lac) : une route ne la franchit que sur un pont */
  isWet(cx: number, cz: number) {
    return this.lake[this.ci(cx, cz)] === 1 || this.cellAvg(cx, cz) < 0.08 || this.cellMin(cx, cz) <= -0.15;
  }

  /** Tablier d'un pont posé sur la case (null si la case n'est pas un pont) */
  bridgeY(cx: number, cz: number): number | null {
    if (!this.inCells(cx, cz)) return null;
    const k = this.ci(cx, cz);
    if (!this.road[k] || !this.isWet(cx, cz)) return null;
    return (this.lake[k] ? this.lakeLevel[k] : SEA) + 0.32;
  }

  /**
   * Point de passage d'un trajet (suite de cases voisines) à sa i-ième case : le centre de la case, sauf dans un virage
   * sur un pont, où l'on coupe au plus court comme le tablier (un pont en escalier devient une diagonale)
   */
  passPoint(path: number[], i: number): [number, number] {
    const c = path[i], x = (c % N) + 0.5, z = Math.floor(c / N) + 0.5, p = path[i - 1], n = path[i + 1];
    if (p === undefined || n === undefined || n - c === c - p || this.bridgeY(c % N, Math.floor(c / N)) === null) return [x, z];
    return [x * 0.5 + ((p % N) + (n % N) + 1) * 0.25, z * 0.5 + (Math.floor(p / N) + Math.floor(n / N) + 1) * 0.25];
  }

  /** Sol où l'on marche : tablier des ponts, sinon le relief affiché */
  surfaceAt(x: number, z: number) {
    const b = this.bridgeY(Math.floor(x), Math.floor(z));
    return b === null ? this.hAt(x, z) : Math.max(b, this.hAt(x, z));
  }

  // ---------- Constructions ----------
  canPlace(kind: KindId, x: number, z: number): string | null {
    const s = KINDS[kind].size;
    if (!this.inCells(x, z) || !this.inCells(x + s - 1, z + s - 1)) return 'Hors de la carte';
    let mn = 99, mx = -99;
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const cx = x + i, cz = z + j;
        const k = this.ci(cx, cz);
        if (this.occ[k]) return 'Emplacement occupé';
        if (this.road[k] && kind !== 'lamp') return 'Une route est déjà ici';
        if (this.decor[k]) return 'Une grotte ou une faille est ici';
        if (this.lake[k]) return 'Un lac est ici';
        if (this.cellMin(cx, cz) < 0.05 && (kind !== 'pier' || this.cellAvg(cx, cz) < 0.05)) return 'Trop proche de l’eau';
      }
    // le ponton de pêche s'avance sur l'eau : il lui faut une rive
    if (kind === 'pier' && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.inCells(x + dx, z + dz) && (this.cellAvg(x + dx, z + dz) < -0.05 || this.lake[this.ci(x + dx, z + dz)]))) return 'À poser au bord de l’eau';
    for (let j = 0; j <= s; j++)
      for (let i = 0; i <= s; i++) {
        const hh = this.h(x + i, z + j);
        mn = Math.min(mn, hh); mx = Math.max(mx, hh);
      }
    const target = this.flatTarget(x, z, s);
    if (mx - target > 0.85 * s || target - mn > 0.85 * s) return 'Terrain trop pentu';
    if (target < 0.05 && kind !== 'pier') return 'Trop proche de l\u2019eau';
    return null;
  }

  /** Hauteur de nivellement : celle d'un bâtiment voisin (pour rester raccordé) sinon la moyenne */
  flatTarget(x: number, z: number, s: number): number {
    for (let dz = -1; dz <= s; dz++)
      for (let dx = -1; dx <= s; dx++) {
        const nb = this.buildingAt(x + dx, z + dz);
        if (nb) return this.h(nb.x, nb.z);
      }
    let sum = 0, cnt = 0;
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) { sum += this.h(x + i, z + j); cnt++; }
    return sum / cnt;
  }

  place(kind: KindId, x: number, z: number, rot: number, auto: boolean, age: number, animate = true): Building {
    const s = KINDS[kind].size;
    // Aplanit l'empreinte
    const avg = this.flatTarget(x, z, s);
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) this.heights[this.vi(x + i, z + j)] = avg;
    const b: Building = { id: this.nextId++, kind, x, z, rot, auto, age };
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const k = this.ci(x + i, z + j);
        this.occ[k] = b.id;
        this.veg[k] = 0;
      }
    this.buildings.set(b.id, b);
    this.vegDirty = true;
    this.markTerrain(x - 1, z - 1, x + s, z + s);
    this.markVeg(x - 1, z - 1, x + s, z + s);
    this.version++;
    for (const l of this.listeners) l.onAdd(b, animate);
    return b;
  }

  removeBuilding(id: number) {
    const b = this.buildings.get(id);
    if (!b) return;
    const s = KINDS[b.kind].size;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.occ[this.ci(b.x + i, b.z + j)] = 0;
    this.buildings.delete(id);
    this.vegDirty = true;
    this.markTerrain(b.x - 1, b.z - 1, b.x + s, b.z + s);
    this.markVeg(b.x - 1, b.z - 1, b.x + s, b.z + s);
    this.version++;
    for (const l of this.listeners) l.onRemove(b);
  }

  canRoad(cx: number, cz: number) {
    if (!this.inCells(cx, cz)) return false;
    const k = this.ci(cx, cz);
    if (this.occ[k] || this.decor[k]) return false;
    // sur l'eau : un pont, sauf au large
    if (this.isWet(cx, cz)) return this.lake[k] === 1 || this.cellAvg(cx, cz) > -1.7;
    return this.cellSlope(cx, cz) < 1.3;
  }

  setRoad(cx: number, cz: number, on: boolean): boolean {
    if (!this.inCells(cx, cz)) return false;
    const k = this.ci(cx, cz);
    if (on) {
      if (this.road[k] || !this.canRoad(cx, cz)) return false;
      this.road[k] = 1;
      this.veg[k] = 0;
      this.vegDirty = true;
    } else {
      if (!this.road[k]) return false;
      this.road[k] = 0;
    }
    this.markVeg(cx, cz, cx, cz);
    this.roadsDirty = true;
    this.version++;
    return true;
  }

  setVeg(cx: number, cz: number, type: number): boolean {
    if (!this.inCells(cx, cz)) return false;
    const k = this.ci(cx, cz);
    if (type !== 0) {
      if (this.occ[k] || this.road[k]) return false;
      if (!this.vegFits(type, this.cellAvg(cx, cz), this.cellSlope(cx, cz), true)) return false;
      if ((type === VEG_CAVE || type === VEG_FISSURE) && !this.decorFits(cx, cz, type)) return false;
    }
    if (this.veg[k] === type) return false;
    const special = type === VEG_CAVE || type === VEG_FISSURE || this.veg[k] === VEG_CAVE || this.veg[k] === VEG_FISSURE;
    this.veg[k] = type;
    this.vegDirty = true;
    // l'emprise d'une grotte ou d'une faille déborde de sa case, sa butte ou son ravin encore plus
    if (special) { this.computeDecor(); this.markVeg(cx - 7, cz - 7, cx + 7, cz + 7); this.markTerrain(cx - 7, cz - 7, cx + 7, cz + 7); }
    else this.markVeg(cx, cz, cx, cz);
    this.version++;
    return true;
  }

  /** Après sculpture : supprime routes/végétation devenues invalides */
  /** Terrain compatible avec un type de végétation (pose stricte, ou maintien plus tolérant après sculpture) */
  vegFits(type: number, avg: number, slope: number, placing: boolean) {
    // une grotte (butte rocheuse) tient sur la terre ferme, même en pente ; une faille fend un sol assez plat
    if (type === VEG_CAVE) return avg >= 0.3 && slope <= (placing ? 2.2 : 3);
    if (type === VEG_FISSURE) return avg >= 0.3 && slope <= (placing ? 0.9 : 1.3);
    // épave : eau peu profonde ou plage mouillée ; cratère : n'importe où hors de la mer
    if (type === VEG_WRECK) return avg >= -1 && avg <= 0.3;
    if (type === VEG_VOLCANO) return avg >= 0;
    // rien ne tient sur une paroi trop raide
    if (type === VEG_ROCKS) return avg >= (placing ? 0.12 : 0.08) && slope <= (placing ? 1 : 1.4);
    if (avg < (placing ? 0.2 : 0.1)) return false;
    return slope <= (type === VEG_FOREST ? (placing ? 1.4 : 1.8) : placing ? 0.6 : 0.9);
  }

  sanitize(x0: number, z0: number, x1: number, z1: number) {
    // le relief affiché est lissé : la retouche déborde de deux cases
    this.markVeg(x0 - 2, z0 - 2, x1 + 2, z1 + 2);
    for (let cz = Math.max(0, z0); cz <= Math.min(N - 1, z1); cz++)
      for (let cx = Math.max(0, x0); cx <= Math.min(N - 1, x1); cx++) {
        const k = this.ci(cx, cz);
        if (this.veg[k] && !this.vegFits(this.veg[k], this.cellAvg(cx, cz), this.cellSlope(cx, cz), false)) { this.veg[k] = 0; this.vegDirty = true; }
        if (this.road[k] && !this.canRoad(cx, cz)) { this.road[k] = 0; this.roadsDirty = true; }
      }
    this.version++;
  }

  // ---------- Snapshots / sérialisation ----------
  snapshot(): Snapshot {
    return {
      heights: this.heights.slice(),
      road: this.road.slice(),
      veg: this.veg.slice(),
      buildings: [...this.buildings.values()].map((b) => ({ ...b })),
      nextId: this.nextId,
    };
  }

  restore(s: Snapshot) {
    this.heights.set(s.heights);
    this.road.set(s.road);
    this.veg.set(s.veg);
    this.occ.fill(0);
    this.buildings.clear();
    for (const b0 of s.buildings) {
      const b = { ...b0 };
      this.buildings.set(b.id, b);
      const sz = KINDS[b.kind].size;
      for (let j = 0; j < sz; j++) for (let i = 0; i < sz; i++) this.occ[this.ci(b.x + i, b.z + j)] = b.id;
    }
    this.nextId = s.nextId;
    this.roadsDirty = this.vegDirty = true;
    this.markTerrainAll();
    this.markVeg(0, 0, N - 1, N - 1);
    this.grazed.fill(0);
    this.bloom.fill(0);
    this.version++;
    for (const l of this.listeners) l.onReset();
  }

  toJSON() {
    const veg: number[] = [];
    for (let i = 0; i < this.veg.length; i++) if (this.veg[i]) veg.push(i, this.veg[i]);
    const roads: number[] = [];
    for (let i = 0; i < this.road.length; i++) if (this.road[i]) roads.push(i);
    return {
      n: N,
      heights: Array.from(this.heights, (v) => Math.round(v * 100)),
      roads,
      veg,
      buildings: [...this.buildings.values()].map((b) => [b.kind, b.x, b.z, b.rot, b.auto ? 1 : 0, b.age]),
      nextId: this.nextId,
      torches: [...this.torches],
      basalt: lavaFields(this.basalt),
      ash: [...this.ash.keys()].filter((k) => this.ash[k]),
      ore: this.ore,
      mined: [...this.mined],
      exp: this.exp,
    };
  }

  /**
   * Bâtiments devenus plus grands depuis la sauvegarde (soins, école, secours, passés en 2 × 2) : chacun s'étend sur l'une des
   * quatre places de 2 × 2 qui contiennent sa case, libre d'autres bâtiments et hors de l'eau (la route dessous s'efface,
   * le sol s'aplanit) ; sans place, il disparaît et un message invite à le rebâtir
   */
  private growLarge(buildings: Building[], heights: Float32Array, road: Uint8Array) {
    const owner = new Int32Array(N * N);
    const mark = (b: Building, x: number, z: number, v: number) => { const s = KINDS[b.kind].size; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) if (this.inCells(x + i, z + j)) owner[this.ci(x + i, z + j)] = v; };
    for (const b of buildings) if (KINDS[b.kind].size === 1) mark(b, b.x, b.z, b.id);
    const avg = (x: number, z: number) => (heights[this.vi(x, z)] + heights[this.vi(x + 1, z)] + heights[this.vi(x, z + 1)] + heights[this.vi(x + 1, z + 1)]) / 4;
    // à sa place d'origine, il suffit que rien ne le chevauche ; ailleurs, il faut aussi de la terre ferme
    const fits = (x: number, z: number, dry: boolean) => {
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        if (!this.inCells(x + i, z + j) || owner[this.ci(x + i, z + j)] || (dry && avg(x + i, z + j) < 0.05)) return false;
      }
      return true;
    };
    for (const b of buildings) if (KINDS[b.kind].size === 2 && !GREW.includes(b.kind)) mark(b, b.x, b.z, b.id);
    for (let k = buildings.length - 1; k >= 0; k--) {
      const b = buildings[k];
      if (!GREW.includes(b.kind)) continue;
      const spot = [[b.x, b.z], [b.x - 1, b.z], [b.x, b.z - 1], [b.x - 1, b.z - 1]].find(([x, z], i) => fits(x, z, i > 0));
      if (!spot) { buildings.splice(k, 1); this.losses.push(`🏗️ ${KINDS[b.kind].names[b.age]} n’avait pas la place de s’agrandir : rebâtissez-le ailleurs.`); continue; }
      [b.x, b.z] = spot;
      mark(b, b.x, b.z, b.id);
      let h = 0;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) h += heights[this.vi(b.x + i, b.z + j)] / 9;
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) heights[this.vi(b.x + i, b.z + j)] = h;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) road[this.ci(b.x + i, b.z + j)] = 0;
    }
  }

  fromJSON(d: any) {
    if (!d || d.n !== N || !Array.isArray(d.heights) || d.heights.length !== this.heights.length) throw new Error('Sauvegarde incompatible');
    const heights = new Float32Array(d.heights.length);
    for (let i = 0; i < heights.length; i++) heights[i] = (+d.heights[i] || 0) / 100;
    const road = new Uint8Array(N * N), veg = new Uint8Array(N * N);
    for (const i of d.roads ?? []) if (i >= 0 && i < road.length) road[i] = 1;
    for (let i = 0; i + 1 < (d.veg ?? []).length; i += 2) if (d.veg[i] >= 0 && d.veg[i] < veg.length) veg[d.veg[i]] = d.veg[i + 1];
    const buildings: Building[] = [];
    let id = 1;
    for (const r of d.buildings ?? []) {
      if (!KINDS[r[0] as KindId]) continue;
      buildings.push({ id: id++, kind: r[0], x: r[1] | 0, z: r[2] | 0, rot: (r[3] | 0) & 3, auto: !!r[4], age: r[5] | 0 });
    }
    this.growLarge(buildings, heights, road);
    this.restore({ heights, road, veg, buildings, nextId: id });
    this.torches = new Set((d.torches ?? []).filter((k: number) => k >= 0 && k < N * N));
    this.basalt.fill(0);
    const lava = d.basalt ?? [];
    for (let i = 0; i + 1 < lava.length; i += 2) if (lava[i] >= 0 && lava[i] < N * N) this.basalt[lava[i]] = Math.min(1, Math.max(0, lava[i + 1] / 100));
    this.ash.fill(0);
    for (const k of d.ash ?? []) if (k >= 0 && k < N * N) this.ash[k] = 1;
    this.ore = Math.max(0, +d.ore || 0);
    this.mined = new Set((d.mined ?? []).filter((k: number) => k >= 0 && k < N * N));
    this.exp = readExpState(d.exp);
  }
}

/** Champs de lave à sauvegarder : paires (case, couverture en %) */
function lavaFields(basalt: Float32Array) {
  const out: number[] = [];
  for (let k = 0; k < basalt.length; k++) if (basalt[k] > 0.01) out.push(k, Math.round(basalt[k] * 100));
  return out;
}
