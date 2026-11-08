import { Building, KINDS, KindId, DEFENSES, hasDoor, sizeOf, smallSize } from '../build/catalog';
import { readPortal } from './portal';
import { tr } from '../i18n';
import { FRONT, doorSide, doorSpan } from '../build/placement';
import { START_WOOD, START_STONE } from '../sim/economy';
import { Difficulty, DIFF_VERSION, readDifficulty, rulesOf } from '../sim/difficulty';
import { GEN, GEN_FIXED, fillClimate } from './continent';
import { ExpState, newExpState, readExpState } from '../sim/missions';
import { RoadCurve, rasterize, roundPts, sampleCurve } from './curves';
import { Crossing, crossingMap, nearestOnDeck } from './crossings';

/** Bâtiments passés de 1 × 1 à 2 × 2 : une ancienne sauvegarde les fait grandir sur place s'ils ont la place */
/** Hauteur du quai d'un port au-dessus de la mer, au plus : plus haut, le navire ne serait plus qu'un jouet à son pied */
const QUAY_MAX = 0.32;
/** Bâtiments de la mer : chantier naval, phare, halle aux poissons, ferme marine (de l'eau à moins de SEA_REACH cases de leur emprise) */
export const SEASIDE: KindId[] = ['shipyard', 'lighthouse', 'fishmarket', 'offshore'];
export const SEA_REACH = 5;
const GREW: KindId[] = ['health', 'school', 'fire', 'temple', 'workshop', 'mill', 'stadium', 'football', 'funfair', 'harbor', 'airport', 'waterpark', 'terminal'];
/**
 * Places passées en 3 × 3 (la place du village, de 1 × 1 ; le forum, son amélioration, de 2 × 2) : les sauvegardes d'avant
 * (sans la marque `plaza3`) les font grandir autour de leur ancienne emprise, recentrée, s'ils ont la place
 */
const GREW3: KindId[] = ['gather', 'forum'];
/** Marque des sauvegardes où places et forums sont déjà en 3 × 3 */
const PLAZA3 = 1;

/** Côté de la carte en cases : propre à chaque carte, fixé (setMapSize) avant de créer le monde et ses vues */
export let N = 96;
export const SEA = 0;
export const MAX_H = 16;
export const MIN_H = -2.4;
/** Étages de montagne : plus d'arbres au-dessus de TREE_LINE ; neiges éternelles entre les deux altitudes de SNOW_LINE */
export const TREE_LINE = 5.8;
/** Altitude à partir de laquelle on est dans la montagne (mines, carrières) */
export const MOUNTAIN_H = 2.4;
/** Station de ski : un sommet d'au moins ALPINE_PEAK à moins de ALPINE_REACH cases */
export const ALPINE_PEAK = 5.2, ALPINE_REACH = 7;
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
  /** biomes peints au pinceau (absent : ceux d'avant restent) */
  biomePaint?: Uint8Array;
  buildings: Building[];
  nextId: number;
  /** stocks de bois et de pierre (un bâtiment annulé rend ce qu'il avait coûté) */
  wood?: number;
  stone?: number;
  /** routes en courbe (absent : celles d'avant restent) */
  curves?: RoadCurve[];
}

/**
 * Ligne de chemin de fer : ses arrêts dans l'ordre (gares, par numéro de bâtiment) et sa couleur ; `via` :
 * pour chaque tronçon (de l'arrêt i au suivant), les cases par où le joueur fait passer la voie, dans l'ordre (absent ou
 * vide : la voie se pose d'elle-même)
 */
/**
 * Ligne de chemin de fer : ses arrêts, sa couleur, les points de passage de ses tronçons ; `freight` : train de marchandises
 * (sinon de voyageurs) ; `ok` (non sauvegardé) : faux tant que son train ne peut pas rouler
 */
export interface RailLine { id: number; stops: number[]; color: number; via?: number[][]; freight?: boolean; ok?: boolean }

/**
 * L'île du portail (voir `portal.ts`) : le centre du portail (un sommet du relief, au coin de ses quatre cases) et le rayon de
 * l'île, en cases
 */
export interface PortalSite { x: number; z: number; r: number }
/** La garde de l'île du portail : vagues de démons repoussées, jours tenus (voir `World.isleGuard`) */
export interface IsleGuard { waves: number; days: number }

/** Case d'une route en courbe : les courbes qui y passent, et le point de leur ligne le plus proche du centre de la case */
export interface CurveCell { ids: number[]; at: [number, number] }

export interface WorldListener {
  onAdd(b: Building, animate: boolean): void;
  onRemove(b: Building): void;
  onChange(b: Building): void;
  onReset(): void;
}

/**
 * Vegetation: 0 rien, 1 forêt, 2 champ, 3 jardin ; décors sans effet sur la simulation : 4 rocaille, 5 entrée de grotte,
 * 6 épave, 7 cratère de volcan, 8 faille (grottes et failles : le moteur du monde souterrain y voit ses entrées)
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

/** Hash 0..1 d'une case (orientation des décors) */
const hashCell = (x: number, z: number) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class World {
  readonly n = N;
  mapId = 3;
  seed = 1;
  /** version du générateur qui a créé la carte : le climat s'en recalcule au chargement (sauvegardée ; 1 pour les anciennes parties) */
  gen = GEN;
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
  /** Biomes peints au pinceau (0 : celui du climat ; sinon biome + 1) : ils l'emportent sur le climat, même quand le relief change */
  biomePaint = new Uint8Array(N * N);
  /** change à chaque coup de pinceau de biome (la neige des toits se refait) */
  biomeVersion = 0;
  private temp = new Float32Array(N * N);
  private wet = new Float32Array(N * N);
  private climateKey = '';
  /** distances à l'eau déjà calculées (un recalcul partiel des biomes peut s'y fier) */
  private biomesDone = false;
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
  /** Catastrophes naturelles (réglage) : le volcan se réveille, les incendies prennent, la lave et le feu détruisent les bâtiments */
  disasters = true;
  /** Bâtiments perdus (lave), à annoncer */
  losses: string[] = [];
  /** Minerai en réserve (la mine en extrait chaque jour) */
  ore = 0;
  /** bois et pierre, pour bâtir les grands bâtiments */
  wood = START_WOOD;
  stone = START_STONE;
  /** pétrole brut tiré des puits, et carburant qu'en fait la raffinerie */
  crude = 0;
  fuel = 0;
  /** briques de la briqueterie (les anciennes sauvegardes n'en ont pas : zéro) */
  brick = 0;
  /** Gisements de pétrole : cases où le brut suinte (1), tirées de la graine de la carte ; seul un puits de pétrole s'y pose */
  oil = new Uint8Array(N * N);
  /** expéditions : missions réussies, bêtes ramenées, savoir-faire et bonus (sauvegardé) */
  exp: ExpState = newExpState();
  /** difficulté de la partie (sauvegardée) */
  /** (Facile par défaut ici : une partie neuve reçoit la sienne, `Normal` sans choix, à sa création dans `Game`) */
  difficulty: Difficulty = 'easy';
  /**
   * bâtiments du village, par genre, quand il est entré dans son âge (sauvegardés) : en Normal, seuls ceux bâtis depuis comptent
   * pour l'âge d'après
   */
  ageBase: Partial<Record<KindId, number>> = {};
  /** ressources illimitées (réglage) : bois, pierre et minerai ne manquent jamais */
  unlimitedSetting = false;
  /** ressources illimitées : toujours au bac à sable, jamais en Normal, selon le réglage en Facile */
  get unlimited() { return rulesOf(this.difficulty).unlimited ?? this.unlimitedSetting; }
  set unlimited(on: boolean) { this.unlimitedSetting = on; }
  /** lignes de chemin de fer (`linesAuto` : drapeau des anciennes sauvegardes, gardé tel quel) */
  lines: RailLine[] = [];
  linesAuto = true;
  /** routes tracées en courbe (mode libre) : leurs cases sont des routes ordinaires, la vue les dessine courbes */
  curves: RoadCurve[] = [];
  /** cases des courbes (recalculées quand elles changent) */
  private curveMap: Map<number, CurveCell> | null = null;
  /**
   * Moteur du monde souterrain (gardé pour les Enfers, hors de portée du joueur ; ni sauvegardé ni relu) : filons exploités,
   * galeries tenues, cases de roche percées (tunnels) et celles encore à creuser, dans l'ordre
   */
  mined = new Set<number>();
  claimed = new Set<number>();
  dug = new Set<number>();
  digs: number[] = [];
  /** l'île du portail (sauvegardée) ; null sur une carte d'avant l'île : la mission du portail n'y est pas disponible */
  portal: PortalSite | null = null;
  /**
   * La garde de l'île du portail (sauvegardée) : vagues de démons repoussées, jours tenus avec ses défenses debout ; l'île est
   * sécurisée (`isleSecured`, voir `portal.ts`) quand l'un ou l'autre suffit : la condition d'âge s'y branchera
   */
  isleGuard: IsleGuard = { waves: 0, days: 0 };
  /** la guerre contre les Enfers (armée, faction, vague en cours), sauvegardée telle quelle (voir `sim/war.ts`) */
  war: unknown = null;

  /** le portail est ouvert : l'expédition « Le portail de l'autre rive » a réussi (on peut bâtir sur l'île) */
  get portalOpen() { return !!this.portal && this.exp.done.includes('portal'); }

  /** La case est sur l'île du portail ou dans ses eaux (le bras de mer qui la sépare du continent est bien plus large) */
  onPortalIsland(cx: number, cz: number) {
    const p = this.portal;
    return !!p && Math.hypot(cx + 0.5 - p.x, cz + 0.5 - p.z) <= p.r + 2;
  }

  /** La case est sous le portail lui-même (ses quatre cases autour de son centre) */
  inPortal(cx: number, cz: number) {
    const p = this.portal;
    return !!p && cx >= p.x - 1 && cx <= p.x && cz >= p.z - 1 && cz <= p.z;
  }

  /**
   * Les cases de terre de l'île du portail (null sans île) : les incursions des démons ne visent qu'elles, jamais le continent
   */
  get portalIsland(): Uint8Array | null {
    const p = this.portal;
    if (!p) return null;
    const m = new Uint8Array(N * N), R = Math.ceil(p.r + 2);
    for (let cz = p.z - R; cz < p.z + R; cz++)
      for (let cx = p.x - R; cx < p.x + R; cx++) if (this.inCells(cx, cz) && this.onPortalIsland(cx, cz) && this.cellAvg(cx, cz) > 0.05) m[this.ci(cx, cz)] = 1;
    return m;
  }

  /**
   * Règle de l'île du portail pour un bâtiment : sur l'île, seulement des défenses (tour de garde, caserne, remparts), une
   * fois le portail ouvert ; les défenses se bâtissent aussi au village ; rien sur le portail lui-même
   */
  private portalRule(kind: KindId, x: number, z: number, s: number): string | null {
    let on = 0;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      if (this.inPortal(x + i, z + j)) return tr('Le portail se dresse ici');
      if (this.onPortalIsland(x + i, z + j)) on++;
    }
    if (!on) return null;
    if (DEFENSES.includes(kind)) {
      if (on < s * s) return tr('À cheval sur le rivage de l’île : posez-le tout entier sur l’île');
      if (!this.portalOpen) return tr('Il faut d’abord ouvrir le portail (expédition « Le portail de l’autre rive »)');
    } else return tr('Sur l’île du portail, on ne bâtit que des défenses');
    return null;
  }

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
      if (b) { this.losses.push(tr('🌋 La lave a englouti : {name}', { name: KINDS[b.kind].names[b.age] })); this.removeBuilding(b.id); }
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

  /** Abat les arbres et dégage les rochers à moins de `r` du point (x, z) (le passage d'une voie ferrée) ; vrai si l'on a dégagé */
  clearTrees(x: number, z: number, r: number) {
    let any = false;
    for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      if (!this.inCells(cx, cz)) continue;
      const k = this.ci(cx, cz), v = this.veg[k];
      if (v !== VEG_FOREST && v !== VEG_ROCKS) continue;
      // la case touche le disque : son point le plus proche du centre est à moins de r
      const px = Math.max(cx, Math.min(cx + 1, x)), pz = Math.max(cz, Math.min(cz + 1, z));
      if (Math.hypot(px - x, pz - z) > r) continue;
      this.veg[k] = 0;
      this.markVeg(cx, cz, cx, cz);
      any = true;
    }
    if (any) this.vegDirty = true;
    return any;
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

  /** Cases d'une végétation donnée à moins de `r` cases d'une emprise */
  vegAround(x: number, z: number, s: number, r: number, type: number) {
    let n = 0;
    for (let cz = z - r; cz < z + s + r; cz++) for (let cx = x - r; cx < x + s + r; cx++) if (this.inCells(cx, cz) && this.veg[cz * N + cx] === type) n++;
    return n;
  }

  /** Entrée (grotte ou faille) la plus proche, à deux cases au plus d'une emprise posée en (x, z), ou -1 (le lieu des expéditions vers une grotte) */
  outpostEntrance(x: number, z: number, s = 2) {
    let best = -1, bd = Infinity;
    for (let cz = z - 2; cz < z + s + 2; cz++)
      for (let cx = x - 2; cx < x + s + 2; cx++) {
        if (!this.inCells(cx, cz) || !this.decor[cz * N + cx]) continue;
        const e = this.entranceAt(cx + 0.5, cz + 0.5);
        if (e < 0) continue;
        const d = Math.hypot((e % N) + 0.5 - x - s / 2, Math.floor(e / N) + 0.5 - z - s / 2);
        if (d < bd) { bd = d; best = e; }
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
    this.computeBiomes(rect);
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

  /** Eau libre au point (x, z) : le sol affiché passe sous `depth`, hors du ravin d'une faille (son fond reste à sec) */
  seaAt(wx: number, wz: number, depth: number) {
    const x = Math.round(Math.min(Math.max(wx, 0), N) * VR), z = Math.round(Math.min(Math.max(wz, 0), N) * VR);
    return this.hAt(wx, wz) < depth && this.ravine[z * VS + x] <= 0.02;
  }

  biomeAt(x: number, z: number) {
    const cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
    return this.biome[cz * N + cx];
  }

  /**
   * Biomes : la température monte du nord au sud et vers l'est, et baisse avec l'altitude (taïga sur les sommets),
   * l'humidité monte près de l'eau ; le côté chaud se partage entre désert (sec) et tropiques (humide),
   * les basses terres humides au bord de l'eau deviennent des marais
   */
  /**
   * Biomes de chaque case ; `rect` (cases, bornes incluses) : seule cette zone a changé de relief. Si aucune case n'y a
   * changé d'état (eau ou terre), les distances à l'eau restent bonnes partout : seuls les biomes de la zone sont refaits
   * (sur un grand village, tout refaire à chaque bâtiment posé coûtait un à-coup)
   */
  computeBiomes(rect: [number, number, number, number] | null = null) {
    const key = `${this.mapId}|${this.seed}|${this.gen}`;
    if (key !== this.climateKey) {
      this.climateKey = key;
      fillClimate(this.gen, this.seed, N, this.temp, this.wet);
      rect = null;
    }
    const dist = this.waterDist;
    let x0 = 0, z0 = 0, x1 = N - 1, z1 = N - 1;
    if (rect && this.biomesDone) {
      x0 = Math.max(0, rect[0] - 1); z0 = Math.max(0, rect[1] - 1); x1 = Math.min(N - 1, rect[2] + 1); z1 = Math.min(N - 1, rect[3] + 1);
      for (let cz = z0; cz <= z1 && rect; cz++) for (let cx = x0; cx <= x1; cx++) if (this.isWaterCell(cx, cz) !== (dist[cz * N + cx] === 0)) { rect = null; break; }
    } else rect = null;
    if (!rect) {
      x0 = 0; z0 = 0; x1 = N - 1; z1 = N - 1;
      // distance à l'eau : parcours en largeur depuis les cases d'eau
      const queue = new Int32Array(N * N);
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
      this.biomesDone = true;
    }
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const k = cz * N + cx, h = this.cellAvg(cx, cz), d = dist[k];
      const t = this.temp[k] - Math.max(0, h - 2.6) * 0.22;
      const m = this.wet[k] + (d <= 2 ? 0.25 : d <= 5 ? 0.1 : 0);
      let b = BIOME_TEMPERATE;
      if (t < -0.36) b = BIOME_TAIGA;
      else if (t > 0.3) b = m < 0.08 ? BIOME_DESERT : BIOME_TROPICAL;
      else if (m > 0.32 && h < 1.4 && d <= 4) b = BIOME_MARSH;
      const f = this.biomePaint[k];
      this.biome[k] = f ? f - 1 : b;
    }
  }

  /** Peint le biome d'une case (null : la case retrouve celui de son climat) ; true si quelque chose change */
  paintBiome(cx: number, cz: number, b: number | null) {
    if (!this.inCells(cx, cz)) return false;
    const k = this.ci(cx, cz), v = b === null ? 0 : b + 1;
    if (this.biomePaint[k] === v) return false;
    this.biomePaint[k] = v;
    return true;
  }

  /** Après des coups de pinceau de biome dans une zone (cases) : le sol se reteinte, la végétation et les routes se refont */
  biomesChanged(x0: number, z0: number, x1: number, z1: number) {
    this.computeBiomes();
    this.markTerrain(x0 - 2, z0 - 2, x1 + 2, z1 + 2);
    this.markVeg(Math.max(0, x0 - 1), Math.max(0, z0 - 1), Math.min(N - 1, x1 + 1), Math.min(N - 1, z1 + 1));
    this.vegDirty = true;
    this.biomeVersion++;
    this.version++;
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
  /** Hauteur du tablier d'un pont posé sur une case d'eau (route ou voie ferrée), ou null si la case est sèche */
  deckY(cx: number, cz: number): number | null {
    if (!this.inCells(cx, cz) || !this.isWet(cx, cz)) return null;
    const k = this.ci(cx, cz);
    return (this.lake[k] ? this.lakeLevel[k] : SEA) + 0.32;
  }

  /** Eau qu'il faut vraiment franchir : ni une flaque, ni une rive qui trempe à peine (là, la route reste sur le sol) */
  realWater(cx: number, cz: number) {
    return this.lake[this.ci(cx, cz)] === 1 || this.cellAvg(cx, cz) < 0.02 || this.cellMin(cx, cz) <= -0.2;
  }

  /** Franchissements d'eau par les routes (voir `crossings.ts`), recalculés quand les routes ou le relief changent */
  private crossCache: { v: number; vis: number; map: ReturnType<typeof crossingMap> } | null = null;
  crossings(): Map<number, Crossing> { return this.crossMaps().cells; }
  private crossMaps() {
    const c = this.crossCache;
    if (!c || c.v !== this.version || c.vis !== this.visVersion) this.crossCache = { v: this.version, vis: this.visVersion, map: crossingMap(this) };
    return this.crossCache!.map;
  }
  /** Le pont qui porte la case, s'il y en a un */
  crossingAt(cx: number, cz: number): Crossing | undefined {
    return this.inCells(cx, cz) ? this.crossings().get(this.ci(cx, cz)) : undefined;
  }

  /** Hauteur du tablier du pont au centre de la case (null si la case n'est pas portée par un pont) */
  bridgeY(cx: number, cz: number): number | null {
    const cr = this.crossingAt(cx, cz);
    return cr ? nearestOnDeck(cr, cx + 0.5, cz + 0.5).y : null;
  }

  /**
   * Point de passage d'un trajet (suite de cases voisines) à sa i-ième case : le centre de la case, sauf sur un pont, où
   * l'on suit l'axe du tablier (un pont en escalier est une diagonale), et sur une route en courbe, où l'on suit sa ligne
   */
  passPoint(path: number[], i: number): [number, number] {
    const c = path[i], x = (c % N) + 0.5, z = Math.floor(c / N) + 0.5;
    const cr = this.crossingAt(c % N, Math.floor(c / N));
    if (cr) { const p = nearestOnDeck(cr, x, z); return [p.x, p.z]; }
    const cc = this.curveAt(c);
    if (cc) return [cc.at[0], cc.at[1]];
    return [x, z];
  }

  /** Sol où l'on marche : tablier des ponts (et sa rampe, sur la case de la rive), sinon le relief affiché */
  surfaceAt(x: number, z: number) {
    const cx = Math.floor(x), cz = Math.floor(z), h = this.hAt(x, z);
    if (!this.inCells(cx, cz)) return h;
    const m = this.crossMaps(), k = this.ci(cx, cz), cr = m.cells.get(k);
    if (cr) return Math.max(nearestOnDeck(cr, x, z).y, h);
    const bank = m.banks.get(k);
    if (!bank) return h;
    // sur la rive, seulement sous l'emprise de la rampe
    const d = nearestOnDeck(bank, x, z);
    return d.d <= 0.34 ? Math.max(d.y, h) : h;
  }

  // ---------- Constructions ----------
  /** De l'eau (mer ou lac) à `reach` cases au plus de l'emprise s × s en (x, z) ? */
  waterNear(x: number, z: number, s: number, reach: number): boolean {
    for (let cz = z - reach; cz < z + s + reach; cz++)
      for (let cx = x - reach; cx < x + s + reach; cx++)
        if (this.inCells(cx, cz) && (this.lake[this.ci(cx, cz)] || this.cellAvg(cx, cz) < -0.05)) return true;
    return false;
  }

  /** Une grosse montagne (sommet d'au moins ALPINE_PEAK) à moins de ALPINE_REACH cases */
  bigPeakNear(cx: number, cz: number): boolean {
    for (let z = Math.floor(cz - ALPINE_REACH); z <= Math.ceil(cz + ALPINE_REACH); z++)
      for (let x = Math.floor(cx - ALPINE_REACH); x <= Math.ceil(cx + ALPINE_REACH); x++)
        if (this.inCells(x, z) && Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= ALPINE_REACH && this.cellAvg(x, z) >= ALPINE_PEAK) return true;
    return false;
  }

  canPlace(kind: KindId, x: number, z: number, size = KINDS[kind].size): string | null {
    const s = size;
    if (!this.inCells(x, z) || !this.inCells(x + s - 1, z + s - 1)) return tr('Hors de la carte');
    let mn = 99, mx = -99;
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const cx = x + i, cz = z + j;
        const k = this.ci(cx, cz);
        if (this.occ[k]) return tr('Emplacement occupé');
        // (le lampadaire se pose au bord de la rue, la porte de la ville l'enjambe)
        if (this.road[k] && kind !== 'lamp' && kind !== 'gate') return tr('Une route est déjà ici');
        // la case devant la porte d'un bâtiment reste libre pour son chemin
        if (!this.road[k] && this.doorOf(cx, cz)) return tr('Devant la porte d’un bâtiment : son chemin passe ici');
        if (this.decor[k]) return tr('Une grotte ou une faille est ici');
        if (this.lake[k]) return tr('Un lac est ici');
        // le port bâtit son quai sur la rive, et même un peu dans l'eau peu profonde (il le remblaie) ; pas en eau profonde
        if (kind === 'harbor') { if (this.cellAvg(cx, cz) < -0.9) return tr('L’eau est trop profonde ici pour un quai : posez-le plus près de la rive'); continue; }
        if (this.cellMin(cx, cz) < 0.05 && (kind !== 'pier' || this.cellAvg(cx, cz) < 0.05)) return tr('Trop proche de l’eau : reculez sur la terre ferme');
      }
    // l'île du portail : des défenses seulement (et les défenses nulle part ailleurs)
    const isle = this.portalRule(kind, x, z, s);
    if (isle) return isle;
    // bâtiments de zone : la mine dans la montagne, les bûcherons en forêt, la carrière près des rochers ou dans la montagne
    const high = kind === 'mine' || kind === 'quarry' || kind === 'alpine' ? this.flatTarget(x, z, s) >= MOUNTAIN_H : false;
    if (kind === 'mine' && !high) return tr('Une mine ne se creuse que dans la montagne');
    if (kind === 'alpine' && !high) return tr('Un club alpin ne se pose que dans la montagne');
    // une station de ski : au pied d'une grosse montagne, pas d'une simple colline
    if (kind === 'alpine' && !this.bigPeakNear(x + s / 2, z + s / 2)) return tr('Une station de ski se pose au pied d’une grosse montagne, pas sur une simple colline');
    if (kind === 'lumber' && this.vegAround(x, z, s, 3, VEG_FOREST) < 5) return tr('À poser en lisière ou dans une forêt');
    if (kind === 'quarry' && !high && this.vegAround(x, z, s, 3, VEG_ROCKS) < 2) return tr('À poser près des rochers ou dans la montagne (des rochers se posent avec Nature › Rochers)');
    // le puits de pétrole se fore sur un gisement
    if (kind === 'oilwell' && !this.onOil(x, z, s)) return tr('Un puits de pétrole ne se fore que sur un gisement (les taches sombres où le brut suinte)');
    // le ponton de pêche s'avance sur l'eau : il lui faut une rive
    if (kind === 'pier' && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.inCells(x + dx, z + dz) && (this.cellAvg(x + dx, z + dz) < -0.05 || this.lake[this.ci(x + dx, z + dz)]))) return tr('À poser au bord de l’eau');
    // les bâtiments de la mer : de l'eau (mer ou lac) à quelques cases
    if (SEASIDE.includes(kind) && !this.waterNear(x, z, s, SEA_REACH)) return tr('À poser près de l’eau : la mer à 5 cases au plus');
    // le port : il lui suffit de toucher l'eau d'un côté (une case d'eau contre le quai) et d'avoir un pied sur la terre ferme
    if (kind === 'harbor') {
      // le niveau de l'eau qui borde le quai : la mer, ou la surface d'un lac (souvent perché bien plus haut)
      let level = SEA;
      const wet = (cx: number, cz: number) => {
        if (!this.inCells(cx, cz)) return false;
        const k = this.ci(cx, cz);
        if (this.lake[k]) { level = this.lakeLevel[k]; return true; }
        return this.cellAvg(cx, cz) < -0.05;
      };
      const side = [[0, s, 1, 0], [0, -1, 1, 0], [s, 0, 0, 1], [-1, 0, 0, 1]].some(([ox, oz, ux, uz]) => { for (let i = 0; i < s; i++) if (wet(x + ox + ux * i, z + oz + uz * i)) return true; return false; });
      let landed = false;
      for (let j = 0; j < s && !landed; j++) for (let i = 0; i < s; i++) if (this.cellAvg(x + i, z + j) >= level + 0.02) { landed = true; break; }
      if (!side) return tr('À poser au bord de l’eau : un côté du quai doit toucher l’eau');
      if (!landed) return tr('Le quai doit s’appuyer sur la rive');
      if (this.flatTarget(x, z, s) - level > 0.6) return tr('Le quai serait trop haut au-dessus de l’eau : posez-le plus près de la rive');
    }
    for (let j = 0; j <= s; j++)
      for (let i = 0; i <= s; i++) {
        const hh = this.h(x + i, z + j);
        mn = Math.min(mn, hh); mx = Math.max(mx, hh);
      }
    const target = this.flatTarget(x, z, s);
    // la mine et la carrière s'accrochent à la pente
    const steep = kind === 'mine' || kind === 'quarry' || kind === 'alpine' ? 1.7 : kind === 'harbor' ? 2.2 : 1;
    if (mx - target > 0.85 * s * steep || target - mn > 0.85 * s * steep) return tr('Terrain trop pentu');
    if (target < 0.05 && kind !== 'pier' && kind !== 'harbor') return tr('Trop proche de l’eau : reculez sur la terre ferme');
    return null;
  }

  /**
   * Où commencer une partie : l'emplacement de la place du village (3 × 3) le plus proche du milieu de la carte, sur un sol
   * libre (ni arbres ni rochers à abattre) et peu pentu de préférence ; le coin de son emprise. C'est là que la vue d'une
   * partie neuve se pose
   */
  startSpot(): [number, number] {
    const c = Math.floor(N / 2) - 1, S = KINDS.gather.size;
    let best: [number, number] = [c, c], score = Infinity;
    // (un anneau plus loin ne peut faire mieux que la distance déjà trouvée)
    for (let r = 0; r < N / 2 && r <= score; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || this.canPlace('gather', c + dx, c + dz) !== null) continue;
          let veg = 0, steep = 0;
          for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const x = c + dx + i, z = c + dz + j; if (this.veg[this.ci(x, z)]) veg++; steep = Math.max(steep, this.cellSlope(x, z)); }
          // un sol couvert ou pentu ne compte qu'à défaut d'autre chose à quelques cases de là
          const s = Math.hypot(dx, dz) + veg * 4 + (steep > 0.5 ? 8 : 0);
          if (s < score) { score = s; best = [c + dx, c + dz]; }
        }
    return best;
  }

  /** Bâtiment dont la porte donne sur cette case (sur sa façade ; à l'arrière, côté terre, pour le ponton et le port) */
  doorOf(cx: number, cz: number): Building | undefined {
    for (let r = 0; r < 4; r++) {
      // la case est du côté r du bâtiment qui la touche, au rang i le long de ce côté
      const o = this.buildingAt(cx - FRONT[r][0], cz - FRONT[r][1]);
      if (!o || !hasDoor(o.kind) || doorSide(o.kind, o.rot) !== r) continue;
      const [a, b] = doorSpan(sizeOf(o)), i = FRONT[r][0] ? cz - o.z : cx - o.x;
      if (i >= a && i <= b) return o;
    }
    return undefined;
  }

  /** L'emprise touche-t-elle un gisement de pétrole ? */
  onOil(x: number, z: number, s: number) {
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) if (this.inCells(x + i, z + j) && this.oil[this.ci(x + i, z + j)]) return true;
    return false;
  }

  /** Hauteur de nivellement : celle des coins déjà tenus par des voisins (pour rester raccordé), sinon la moyenne */
  flatTarget(x: number, z: number, s: number): number {
    let held = 0, nh = 0;
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) if (this.vertexHeld(x + i, z + j)) { held += this.h(x + i, z + j); nh++; }
    if (nh) return held / nh;
    let sum = 0, cnt = 0;
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) { sum += this.h(x + i, z + j); cnt++; }
    return sum / cnt;
  }

  /**
   * Emprises qui ne sont plus planes (un voisin posé plus tard a tiré sur leurs coins communs, dans d'anciennes parties) :
   * leurs coins libres rejoignent la hauteur des coins tenus par les voisins, et le bâtiment retrouve un sol plat
   */
  private repairFootprints() {
    for (const b of this.buildings.values()) {
      // le quai du port a son bord au fond du bassin : son emprise n'est pas plate exprès ; un quai trop haut au-dessus de
      // l'eau (anciennes parties) redescend, même aux coins qu'il partage avec un voisin plus haut (qui le hissait tout entier
      // au-dessus de l'eau) : ce voisin garde sa hauteur sur sa butte, le mur de soutènement du port retient le terrain
      if (b.kind === 'harbor') {
        const s = sizeOf(b);
        for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) {
          const k = this.vi(b.x + i, b.z + j);
          if (this.heights[k] > QUAY_MAX) this.heights[k] = QUAY_MAX;
        }
        // et son bassin, creusé devant le quai (les ports d'avant n'en avaient pas : le navire touchait le fond)
        this.dredge(b.x, b.z, s, b.rot, b.id);
        this.clearTalus(b.x, b.z, s);
        continue;
      }
      const s = sizeOf(b);
      let mn = Infinity, mx = -Infinity, held = 0, nh = 0;
      // (un coin partagé avec le port ne compte pas : le quai est au ras de l'eau, le voisin ne s'y aplanit pas)
      const others = (vx: number, vz: number) => {
        for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
          const cx = vx + dx, cz = vz + dz, o = this.inCells(cx, cz) ? this.occ[this.ci(cx, cz)] : 0;
          if (o && o !== b.id && this.buildings.get(o)?.kind !== 'harbor') return true;
        }
        return false;
      };
      for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) {
        const h = this.h(b.x + i, b.z + j);
        mn = Math.min(mn, h); mx = Math.max(mx, h);
        if (others(b.x + i, b.z + j)) { held += h; nh++; }
      }
      if (mx - mn < 0.01 || !nh) continue;
      const target = held / nh;
      for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) if (!others(b.x + i, b.z + j)) this.heights[this.vi(b.x + i, b.z + j)] = target;
    }
  }

  /** Autour du port : les talus qui descendent au quai sont pavés (perré) ; ni arbres ni rochers n'y restent */
  private clearTalus(x0: number, z0: number, s: number) {
    for (let z = z0 - 1; z <= z0 + s; z++) for (let x = x0 - 1; x <= x0 + s; x++) {
      if (!this.inCells(x, z) || (x >= x0 && x < x0 + s && z >= z0 && z < z0 + s)) continue;
      const hs = [this.h(x, z), this.h(x + 1, z), this.h(x, z + 1), this.h(x + 1, z + 1)];
      const v = this.veg[this.ci(x, z)];
      if (Math.max(...hs) - Math.min(...hs) > 0.12 && (v === VEG_FOREST || v === VEG_ROCKS)) { this.veg[this.ci(x, z)] = 0; this.vegDirty = true; }
    }
  }

  /** Sommet de la grille partagé avec l'emprise d'un autre bâtiment (on n'y touche pas : ce voisin resterait en l'air) */
  private vertexHeld(vx: number, vz: number) {
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) if (this.inCells(vx + dx, vz + dz) && this.occ[this.ci(vx + dx, vz + dz)]) return true;
    return false;
  }

  place(kind: KindId, x: number, z: number, rot: number, auto: boolean, age: number, animate = true, small = false): Building {
    const s = small ? smallSize(kind) : KINDS[kind].size;
    // Aplanit l'empreinte, sans toucher aux coins partagés avec les voisins ; le quai du port est remblayé au-dessus de l'eau
    const avg = kind === 'harbor' ? Math.min(QUAY_MAX, Math.max(this.flatTarget(x, z, s), 0.12)) : this.flatTarget(x, z, s);
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) {
      const k = this.vi(x + i, z + j);
      if (!this.vertexHeld(x + i, z + j)) this.heights[k] = avg;
      // le quai reste au ras de l'eau jusque dans ses coins partagés
      else if (kind === 'harbor' && this.heights[k] > QUAY_MAX) this.heights[k] = QUAY_MAX;
    }
    // le port creuse son bassin : devant le quai, sur trois rangs, le fond descend assez pour les grands navires (seulement là
    // où c'est déjà de l'eau ou la grève)
    if (kind === 'harbor') { this.dredge(x, z, s, rot); this.clearTalus(x, z, s); }
    const b: Building = { id: this.nextId++, kind, x, z, rot, auto, age, ...(small ? { small: true } : {}) };
    for (let j = 0; j < s; j++)
      for (let i = 0; i < s; i++) {
        const k = this.ci(x + i, z + j);
        this.occ[k] = b.id;
        this.veg[k] = 0;
      }
    this.buildings.set(b.id, b);
    this.vegDirty = true;
    if (kind === 'harbor') this.markTerrain(x - 4, z - 4, x + s + 3, z + s + 3);
    else this.markTerrain(x - 1, z - 1, x + s, z + s);
    this.markVeg(x - 1, z - 1, x + s, z + s);
    this.version++;
    for (const l of this.listeners) l.onAdd(b, animate);
    return b;
  }

  /**
   * Tourne un bâtiment sur place (en quarts de tour) : il garde son emprise, et sa façade ne suit plus la route d'elle-même ;
   * les maisons voisines se raccordent ou se séparent selon leur orientation
   */
  rotateBuilding(id: number, rot: number) {
    const b = this.buildings.get(id);
    if (!b) return;
    b.rot = ((rot % 4) + 4) % 4;
    b.auto = false;
    this.version++;
    const s = sizeOf(b);
    for (const n of this.buildings.values()) if (n.x >= b.x - 2 && n.x <= b.x + s + 1 && n.z >= b.z - 2 && n.z <= b.z + s + 1) for (const l of this.listeners) l.onChange(n);
  }

  /**
   * Transforme un bâtiment en un autre sur place (amélioration) : s'il est plus grand, son emprise s'étend sur l'une des places
   * qui contiennent l'ancienne, de préférence vers l'arrière (la façade reste sur la rue) ; il garde son orientation et son
   * âge, et les lignes de chemin de fer qui s'y arrêtaient s'arrêtent au nouveau. null s'il n'y a pas la place
   */
  upgrade(id: number, to: KindId): Building | null {
    const b = this.buildings.get(id);
    if (!b) return null;
    const s0 = sizeOf(b), s1 = KINDS[to].size, grow = Math.max(0, s1 - s0), f = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.rot];
    // la place idéale : l'ancienne façade reste où elle est, l'emprise s'étend derrière et de part et d'autre
    const ix = b.x - (f[0] > 0 ? grow : f[0] < 0 ? 0 : grow / 2), iz = b.z - (f[1] > 0 ? grow : f[1] < 0 ? 0 : grow / 2);
    const spots: [number, number][] = [];
    for (let dz = 0; dz <= grow; dz++) for (let dx = 0; dx <= grow; dx++) spots.push([b.x - dx, b.z - dz]);
    spots.sort((p, q) => Math.hypot(p[0] - ix, p[1] - iz) - Math.hypot(q[0] - ix, q[1] - iz));
    // l'ancien bâtiment ne gêne pas le nouveau : on libère son emprise le temps de chercher
    const cells: number[] = [];
    for (let j = 0; j < s0; j++) for (let i = 0; i < s0; i++) { const k = this.ci(b.x + i, b.z + j); cells.push(k); this.occ[k] = 0; }
    const spot = spots.find(([x, z]) => this.canPlace(to, x, z) === null);
    for (const k of cells) this.occ[k] = b.id;
    if (!spot) return null;
    const stops = this.lines.filter((l) => l.stops.includes(id));
    this.removeBuilding(id);
    const nb = this.place(to, spot[0], spot[1], b.rot, b.auto, Math.max(b.age, KINDS[to].minAge), true);
    for (const l of stops) l.stops = l.stops.map((s) => (s === id ? nb.id : s));
    return nb;
  }

  /**
   * Le port creuse son bassin : devant le quai, sur trois rangs, le fond descend assez pour les grands navires (seulement là
   * où c'est déjà de l'eau ou la grève) ; le bord du quai lui-même descend au fond, le mur de quai tombe droit dans l'eau.
   * `owner` : le port lui-même, qui ne compte pas comme un voisin (au chargement, il est déjà dans l'emprise)
   */
  private dredge(x: number, z: number, s: number, rot: number, owner = 0) {
    const f = [[0, 1], [1, 0], [0, -1], [-1, 0]][rot];
    const held = (vx: number, vz: number) => { for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) { const cx = vx + dx, cz = vz + dz; if (this.inCells(cx, cz) && this.occ[this.ci(cx, cz)] && this.occ[this.ci(cx, cz)] !== owner) return true; } return false; };
    for (let d = 0; d <= 3; d++) for (let i = d ? -1 : 0; i <= s + (d ? 1 : 0); i++) {
      const vx = f[0] ? (f[0] > 0 ? x + s + d : x - d) : x + i, vz = f[1] ? (f[1] > 0 ? z + s + d : z - d) : z + i;
      if (vx < 0 || vz < 0 || vx > N || vz > N || held(vx, vz)) continue;
      const k = this.vi(vx, vz);
      // le bord du quai ne descend que là où l'eau est juste devant (pas de fosse si le quai a été tourné vers la terre)
      const ahead = d === 0 ? this.h(vx + f[0], vz + f[1]) : this.heights[k];
      if (ahead < 0.1) this.heights[k] = Math.min(this.heights[k], -0.45 - d * 0.1);
    }
  }

  removeBuilding(id: number) {
    const b = this.buildings.get(id);
    if (!b) return;
    const s = sizeOf(b);
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

  /**
   * Pose une route en courbe : sa ligne (x, z à la suite, gardée au centième) devient une suite de cases de route (celles qui
   * en sont déjà une restent telles quelles). Renvoie le nombre de cases de route posées
   */
  addCurve(pts: number[]): number {
    const line = roundPts(pts);
    let n = 0;
    for (const k of rasterize(line, N)) if (this.setRoad(k % N, Math.floor(k / N), true)) n++;
    this.curves.push({ id: Math.max(0, ...this.curves.map((c) => c.id)) + 1, pts: line });
    this.curveMap = null;
    this.roadsDirty = true;
    this.version++;
    return n;
  }

  /** Courbes qui passent par cette case, si c'est encore une route (undefined sinon) */
  curveAt(k: number): CurveCell | undefined {
    if (!this.curves.length || !this.road[k]) return undefined;
    return this.curveCells().get(k);
  }

  /** Cases de toutes les courbes (même celles qui ne sont plus des routes : démolies, emportées par la sculpture) */
  curveCells(): Map<number, CurveCell> {
    if (this.curveMap) return this.curveMap;
    const out = new Map<number, CurveCell>();
    for (const c of this.curves) {
      // point de la ligne le plus proche du centre de chaque case : on regarde la case de chaque point et ses voisines (une
      // case prise dans un coin n'a aucun point à elle)
      const s = sampleCurve(c.pts), best = new Map<number, [number, number, number]>();
      for (let i = 0; i + 1 < s.length; i += 2) {
        const x = Math.floor(s[i]), z = Math.floor(s[i + 1]);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!this.inCells(x + dx, z + dz)) continue;
          const k = this.ci(x + dx, z + dz), d = Math.hypot(s[i] - x - dx - 0.5, s[i + 1] - z - dz - 0.5), b = best.get(k);
          if (!b || d < b[0]) best.set(k, [d, s[i], s[i + 1]]);
        }
      }
      for (const k of rasterize(c.pts, N)) {
        const e = out.get(k);
        if (e) { if (!e.ids.includes(c.id)) e.ids.push(c.id); continue; }
        const b = best.get(k)!;
        out.set(k, { ids: [c.id], at: [b[1], b[2]] });
      }
    }
    this.curveMap = out;
    return out;
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
      biomePaint: this.biomePaint.slice(),
      buildings: [...this.buildings.values()].map((b) => ({ ...b })),
      nextId: this.nextId,
      wood: this.wood,
      stone: this.stone,
      curves: this.curves.map((c) => ({ id: c.id, pts: c.pts.slice() })),
    };
  }

  restore(s: Snapshot) {
    this.heights.set(s.heights);
    this.road.set(s.road);
    this.veg.set(s.veg);
    if (s.biomePaint) { this.biomePaint.set(s.biomePaint); this.biomeVersion++; }
    this.occ.fill(0);
    this.buildings.clear();
    for (const b0 of s.buildings) {
      const b = { ...b0 };
      this.buildings.set(b.id, b);
      const sz = sizeOf(b);
      for (let j = 0; j < sz; j++) for (let i = 0; i < sz; i++) this.occ[this.ci(b.x + i, b.z + j)] = b.id;
    }
    this.repairFootprints();
    this.nextId = s.nextId;
    if (s.wood !== undefined) this.wood = s.wood;
    if (s.stone !== undefined) this.stone = s.stone;
    if (s.curves) { this.curves = s.curves.map((c) => ({ id: c.id, pts: c.pts.slice() })); this.curveMap = null; }
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
    const biomes: number[] = [];
    for (let i = 0; i < this.biomePaint.length; i++) if (this.biomePaint[i]) biomes.push(i, this.biomePaint[i]);
    const order = new Map([...this.buildings.keys()].map((id, i) => [id, i]));
    return {
      n: N,
      gen: this.gen,
      heights: Array.from(this.heights, (v) => Math.round(v * 100)),
      roads,
      veg,
      biomes,
      buildings: [...this.buildings.values()].map((b) => (b.small ? [b.kind, b.x, b.z, b.rot, b.auto ? 1 : 0, b.age, 1] : [b.kind, b.x, b.z, b.rot, b.auto ? 1 : 0, b.age])),
      nextId: this.nextId,
      plaza3: PLAZA3,
      torches: [...this.torches],
      basalt: lavaFields(this.basalt),
      ash: [...this.ash.keys()].filter((k) => this.ash[k]),
      ore: this.ore,
      wood: this.wood,
      stone: this.stone,
      crude: this.crude,
      fuel: this.fuel,
      brick: this.brick,
      oil: [...this.oil.keys()].filter((k) => this.oil[k]),
      exp: this.exp,
      difficulty: this.difficulty,
      diffV: DIFF_VERSION,
      ageBase: this.ageBase,
      // arrêts des lignes : par rang dans la liste des bâtiments (les numéros changent au chargement) ; points de passage des
      // tronçons : par case
      lines: this.lines.map((l) => {
        const kept = l.stops.map((id, i) => (order.has(id) ? i : -1)).filter((i) => i >= 0), via = mergeVia(l.via, kept);
        return { c: l.color, s: kept.map((i) => order.get(l.stops[i])!), ...(via ? { v: via } : {}), ...(l.freight ? { f: 1 } : {}) };
      }),
      linesAuto: this.linesAuto,
      portal: this.portal,
      isleGuard: { waves: this.isleGuard.waves, days: Math.round(this.isleGuard.days * 100) / 100 },
      ...(this.war ? { war: this.war } : {}),
      // routes en courbe (au centième) ; celles dont il ne reste aucune case de route s'oublient
      curves: this.curves.filter((c) => rasterize(c.pts, N).some((k) => this.road[k])).map((c) => c.pts.map((v) => Math.round(v * 100))),
    };
  }

  /**
   * Bâtiments devenus plus grands depuis la sauvegarde (soins, école, secours, lieux de culte, ateliers, moulins, passés en
   * 2 × 2) : chacun s'étend sur l'une des quatre places de 2 × 2 qui contiennent sa case, libre d'autres bâtiments et de routes,
   * hors de l'eau (de préférence sans champ ni forêt, qui s'effacent) ; le sol s'aplanit. Sans place, il reste en 1 × 1
   * (`small`) et réessaie au prochain chargement. De même pour la place du village (1 × 1 → 3 × 3) et le forum (2 × 2 → 3 × 3)
   * des sauvegardes d'avant (`plaza3` absent) : leur nouvelle emprise entoure l'ancienne, centrée sur elle de préférence ;
   * sans place, ils gardent l'ancienne taille, sans chevaucher personne
   */
  private growLarge(buildings: Building[], heights: Float32Array, road: Uint8Array, veg: Uint8Array, plaza3: boolean) {
    const owner = new Int32Array(N * N);
    const mark = (b: Building) => { const s = sizeOf(b); for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) if (this.inCells(b.x + i, b.z + j)) owner[this.ci(b.x + i, b.z + j)] = b.id; };
    const grows = (b: Building) => GREW.includes(b.kind) || (GREW3.includes(b.kind) && (!plaza3 || !!b.small));
    const grow = buildings.filter(grows);
    for (const b of buildings) if (!grows(b)) mark(b);
    // l'ancienne emprise de chacun lui appartient d'office : un voisin qui grandit ne la prend pas
    for (const b of grow) { const o = smallSize(b.kind); for (let j = 0; j < o; j++) for (let i = 0; i < o; i++) if (this.inCells(b.x + i, b.z + j)) owner[this.ci(b.x + i, b.z + j)] = b.id; }
    const avg = (x: number, z: number) => (heights[this.vi(x, z)] + heights[this.vi(x + 1, z)] + heights[this.vi(x, z + 1)] + heights[this.vi(x + 1, z + 1)]) / 4;
    const fits = (b: Building, x: number, z: number) => {
      const S = KINDS[b.kind].size;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const cx = x + i, cz = z + j;
        if (!this.inCells(cx, cz)) return false;
        const k = this.ci(cx, cz);
        if ((owner[k] && owner[k] !== b.id) || road[k] || avg(cx, cz) < 0.05) return false;
      }
      return true;
    };
    const vegIn = (x: number, z: number, S: number) => { let n = 0; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (veg[this.ci(x + i, z + j)]) n++; return n; };
    // d'abord ceux qui n'ont jamais été marqués « petits » (dont les vrais 2 × 2, en place), puis les petits qui réessaient
    for (const b of [...grow.filter((q) => !q.small), ...grow.filter((q) => q.small)]) {
      // les places qui contiennent l'ancienne emprise ; d'abord la plus centrée sur elle, puis la moins boisée
      const S = KINDS[b.kind].size, d = S - smallSize(b.kind), all: [number, number][] = [];
      for (let dz = 0; dz <= d; dz++) for (let dx = 0; dx <= d; dx++) all.push([b.x - dx, b.z - dz]);
      const off = (s: [number, number]) => Math.hypot(s[0] - (b.x - d / 2), s[1] - (b.z - d / 2));
      const spots = all.filter(([x, z]) => fits(b, x, z));
      if (!spots.length) { b.small = true; mark(b); continue; }
      const [x, z] = spots.reduce((best, s) => (off(s) * 10 + vegIn(s[0], s[1], S) < off(best) * 10 + vegIn(best[0], best[1], S) - 1e-9 ? s : best));
      delete b.small;
      b.x = x; b.z = z;
      mark(b);
      // aplanir sans toucher aux coins partagés avec un voisin ; les champs et les arbres de l'emprise s'effacent
      const held = (vx: number, vz: number) => { for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) { const cx = vx + dx, cz = vz + dz; if (this.inCells(cx, cz) && owner[this.ci(cx, cz)] && owner[this.ci(cx, cz)] !== b.id) return true; } return false; };
      let h = 0;
      for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) h += heights[this.vi(x + i, z + j)] / ((S + 1) * (S + 1));
      // le quai du port reste remblayé au-dessus de l'eau
      if (b.kind === 'harbor') h = Math.max(h, 0.12);
      for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) if (!held(x + i, z + j)) heights[this.vi(x + i, z + j)] = h;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) veg[this.ci(x + i, z + j)] = 0;
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
    const ids: number[] = [];
    for (const r of d.buildings ?? []) {
      ids.push(KINDS[r[0] as KindId] ? id : -1);
      if (!KINDS[r[0] as KindId]) continue;
      buildings.push({ id: id++, kind: r[0], x: r[1] | 0, z: r[2] | 0, rot: (r[3] | 0) & 3, auto: !!r[4], age: r[5] | 0, ...(r[6] ? { small: true } : {}) });
    }
    // le château devenait la gare à l'âge industriel : ceux qui servent d'arrêt à une ligne deviennent la gare centrale, les
    // autres redeviennent des châteaux
    const stops = new Set<number>();
    for (const l of Array.isArray(d.lines) ? d.lines : []) for (const i of Array.isArray(l?.s) ? l.s : []) if (ids[i] > 0) stops.add(ids[i]);
    for (const b of buildings) if (b.kind === 'landmark' && b.age >= 3 && stops.has(b.id)) b.kind = 'terminal';
    this.growLarge(buildings, heights, road, veg, d.plaza3 === PLAZA3);
    // les sauvegardes d'avant le plan du continent n'ont pas de version : leur climat reste celui de la version 1
    this.gen = Number.isInteger(d.gen) && d.gen > GEN_FIXED ? d.gen : GEN_FIXED;
    const biomePaint = new Uint8Array(N * N);
    for (let i = 0; i + 1 < (d.biomes ?? []).length; i += 2) if (d.biomes[i] >= 0 && d.biomes[i] < N * N && d.biomes[i + 1] >= 1 && d.biomes[i + 1] <= BIOME_NAMES.length) biomePaint[d.biomes[i]] = d.biomes[i + 1];
    this.restore({ heights, road, veg, biomePaint, buildings, nextId: id });
    this.torches = new Set((d.torches ?? []).filter((k: number) => k >= 0 && k < N * N));
    this.basalt.fill(0);
    const lava = d.basalt ?? [];
    for (let i = 0; i + 1 < lava.length; i += 2) if (lava[i] >= 0 && lava[i] < N * N) this.basalt[lava[i]] = Math.min(1, Math.max(0, lava[i + 1] / 100));
    this.ash.fill(0);
    for (const k of d.ash ?? []) if (k >= 0 && k < N * N) this.ash[k] = 1;
    this.ore = Math.max(0, +d.ore || 0);
    this.wood = d.wood === undefined ? START_WOOD : Math.max(0, +d.wood || 0);
    this.stone = d.stone === undefined ? START_STONE : Math.max(0, +d.stone || 0);
    this.crude = Math.max(0, +d.crude || 0);
    this.fuel = Math.max(0, +d.fuel || 0);
    this.brick = Math.max(0, +d.brick || 0);
    // une ancienne sauvegarde n'a pas de gisements : ils se tirent de la graine au chargement (addDefaultDecor)
    this.oil.fill(0);
    for (const k of Array.isArray(d.oil) ? d.oil : []) if (k >= 0 && k < N * N) this.oil[k] = 1;
    // le monde souterrain a été retiré du jeu : les galeries tenues, filons abattus et tunnels des anciennes sauvegardes
    // (`claimed`, `mined`, `dug`, `digs`) sont ignorés
    this.mined = new Set(); this.claimed = new Set(); this.dug = new Set(); this.digs = [];
    this.exp = readExpState(d.exp);
    this.difficulty = readDifficulty(d.difficulty, d.diffV);
    // une ancienne sauvegarde n'en a pas : tout le village compte pour l'âge suivant
    this.ageBase = {};
    for (const [k, n] of Object.entries(d.ageBase ?? {})) { const v = Math.floor(+(n as number)); if (KINDS[k as KindId] && Number.isFinite(v) && v > 0) this.ageBase[k as KindId] = v; }
    this.lines = [];
    for (const l of Array.isArray(d.lines) ? d.lines : []) {
      const all: number[] = (Array.isArray(l?.s) ? l.s : []).map((i: number) => ids[i] ?? -1);
      const kept = all.map((id, i) => (id > 0 ? i : -1)).filter((i) => i >= 0), stops = kept.map((i) => all[i]);
      // points de passage : des cases de la carte, un tronçon par paire d'arrêts (les anciennes parties n'en ont pas)
      const legs = Array.isArray(l?.v) ? all.slice(1).map((_, i) => (Array.isArray(l.v[i]) ? l.v[i] : []).filter((k: unknown) => Number.isInteger(k) && (k as number) >= 0 && (k as number) < N * N)) : undefined;
      const via = mergeVia(legs, kept);
      if (stops.length >= 2) this.lines.push({ id: this.lines.length + 1, stops, color: Number.isFinite(+l.c) ? +l.c : 0xd8553c, ...(via ? { via } : {}), ...(l.f ? { freight: true } : {}) });
    }
    this.linesAuto = d.linesAuto ?? !Array.isArray(d.lines);
    // une partie d'avant l'île du portail n'en a pas : elle se joue sans
    this.portal = readPortal(d.portal, N);
    const g = d.isleGuard ?? {};
    this.isleGuard = { waves: Math.max(0, Math.floor(+g.waves || 0)), days: Math.max(0, +g.days || 0) };
    this.war = d.war && typeof d.war === 'object' ? d.war : null;
    this.curves = [];
    for (const c of Array.isArray(d.curves) ? d.curves : []) {
      if (!Array.isArray(c) || c.length < 4 || c.length % 2 || !c.every((v) => Number.isFinite(+v))) continue;
      this.curves.push({ id: this.curves.length + 1, pts: c.map((v: number) => +v / 100) });
    }
    this.curveMap = null;
    this.roadsDirty = true;
  }
}

/**
 * Points de passage d'une ligne qui ne garde que certains de ses arrêts (`kept` : leurs rangs, dans l'ordre) : les tronçons
 * fondus en un seul mettent leurs points bout à bout. undefined s'il n'y en a aucun
 */
export function mergeVia(via: number[][] | undefined, kept: number[]): number[][] | undefined {
  if (!via?.some((v) => v.length)) return undefined;
  const out: number[][] = [];
  for (let j = 0; j + 1 < kept.length; j++) out.push(via.slice(kept[j], kept[j + 1]).flat());
  return out.some((v) => v.length) ? out : undefined;
}

/** Champs de lave à sauvegarder : paires (case, couverture en %) */
function lavaFields(basalt: Float32Array) {
  const out: number[] = [];
  for (let k = 0; k < basalt.length; k++) if (basalt[k] > 0.01) out.push(k, Math.round(basalt[k] * 100));
  return out;
}
