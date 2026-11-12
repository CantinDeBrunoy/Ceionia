import { penHerds, HerdKind } from '../sim/missions';
import { claimArrival } from './pens';
import * as THREE from 'three';
import { World, N, SEA, BIOME_TEMPERATE, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH, VEG_VOLCANO, VEG_CAVE } from '../world/world';
import { KINDS, sizeOf } from '../build/catalog';
import { hash2, mulberry32 } from '../core/rng';
import { Parts } from './parts';
import { makeActor, play, hasModel, Actor, ModelName } from './assets';
import { CH, NC } from './vegetation';
import { makeBeast, BEAST_KINDS, GESTURES, beastYaw, BeastKind, FOWL_FLOAT } from './beasts';
import { Impostors } from './impostors';

type Kind = 'sheep' | 'cow' | 'pig' | 'hen' | 'rabbit' | 'deer' | 'horse' | 'llama' | 'fox' | 'wolf' | 'frog'
  | 'duck' | 'duckling' | 'bird' | 'songbird' | 'bee' | 'butterfly' | 'bat' | 'fish' | 'dolphin' | 'whale' | 'manta' | 'shark'
  | 'eagle' | 'gull' | 'ibex' | 'bear' | 'lizard' | 'crab' | 'turtle' | 'croc' | 'camel' | 'elephant' | 'giraffe' | 'moose' | 'dog' | 'goose';

interface Spec {
  /** forme instanciée (absente pour les bêtes articulées de beasts.ts) */
  geo?: () => THREE.BufferGeometry;
  max: number;
  colors: number[];
  /** vitesse de marche et de course (cases/s), pause entre deux déplacements (s) */
  speed: number;
  run?: number;
  idle: [number, number];
  /** case praticable */
  ok: (w: World, cx: number, cz: number) => boolean;
  /** hauteur des bonds (lapins, grenouilles), inclinaison pour brouter, picorage rapide */
  hop?: number;
  graze?: number;
  peck?: boolean;
  /** battement d'ailes : fréquence, amplitude, demi-largeur du corps */
  flap?: [number, number, number];
  scale?: number;
  /** distance à laquelle l'animal détale devant un prédateur (ou un villageois) */
  flee?: number;
}

/** Proies de chaque prédateur et distance à laquelle il les repère */
const PREY: Partial<Record<Kind, { kinds: Kind[]; sight: number }>> = {
  fox: { kinds: ['rabbit', 'hen', 'frog'], sight: 6 },
  wolf: { kinds: ['deer', 'sheep', 'llama', 'moose'], sight: 8 },
  croc: { kinds: ['frog'], sight: 2.5 },
};
/** Herbivores qui broutent l'herbe des prairies, animaux qui vont boire au bord de l'eau */
const GRAZERS = new Set<Kind>(['sheep', 'cow', 'pig', 'horse', 'deer', 'llama', 'rabbit', 'camel', 'elephant', 'giraffe', 'moose']);
const DRINKERS = new Set<Kind>(['sheep', 'cow', 'horse', 'deer', 'llama', 'fox', 'wolf', 'bear', 'camel', 'elephant', 'giraffe', 'moose', 'ibex']);
/** Bêtes sauvages qui se méfient des villageois (celles de la ferme, non) */
const WARY = new Set<Kind>(['rabbit', 'deer', 'frog', 'fox', 'wolf', 'bear', 'lizard', 'crab', 'turtle', 'moose', 'giraffe', 'ibex']);
const SWIMMERS = new Set<Kind>(['fish', 'dolphin', 'whale', 'manta', 'shark']);
/** Petites bêtes articulées, qu'on cesse d'animer et d'afficher plus tôt quand on s'éloigne */
const TINY = new Set<Kind>(['lizard', 'crab', 'turtle']);
/** Bêtes que ramènent les expéditions */
const HERDS = new Set<Kind>(['sheep', 'cow', 'pig', 'horse']);

interface Critter {
  kind: Kind;
  key: string;
  x: number; y: number; z: number;
  heading: number;
  pitch: number;
  tx: number; tz: number;
  moving: boolean;
  timer: number;
  phase: number;
  /** domaine : centre et rayon d'errance */
  hx: number; hz: number; radius: number;
  col: number;
  size: number;
  hidden: boolean;
  sleeping: boolean;
  /** caneton : suit la cane ; loup : suit le chef de meute */
  leader: Critter | null;
  /** vol : rang dans la nuée */
  slot: number;
  /** modèle animé importé (sinon rendu instancié procédural) */
  actor: Actor | null;
  // ---- vie sauvage
  /** court (fuite ou poursuite) */
  run: boolean;
  /** danger fui et durée de fuite restante */
  threat: { x: number; z: number } | null;
  fear: number;
  /** proie poursuivie, durée de poursuite restante, délai avant la prochaine chasse */
  prey: Critter | null;
  chase: number;
  hunger: number;
  /** attrapé : absent jusqu'à sa réapparition au domaine */
  dead: number;
  /** action sur place (manger sa prise, boire) et sa durée ; en route pour boire */
  act: 'eat' | 'drink' | null;
  actT: number;
  toDrink: boolean;
  thirst: number;
  /** nage : angle parcouru autour du domaine, accélération (banc en fuite) */
  ang: number;
  rush: number;
  /** trajet en vol (oiseau chanteur, abeille) : départ, arrivée, avancement ; posé ou en vol */
  ax: number; ay: number; az: number; by: number;
  flight: number; flightT: number;
  perched: boolean;
  /** battement d'ailes affiché (0 ailes repliées … 1) */
  flap: number;
  /** créneau du dernier geste joué au repos (bête articulée) */
  gestK?: number;
  /** temps cumulé depuis la dernière réflexion (bête loin de la vue, voir `FAR_WALK`) */
  lag?: number;
  /** cadence de réflexion en cours (une image sur `every`), revue toutes les quelques images */
  every?: number;
  /** bête articulée : sorte de sa silhouette lointaine et taille de son modèle, vue à la dernière image, ombre portée en cours */
  actorKey?: string;
  actorSize?: number;
  seen?: boolean;
  shadow?: boolean;
  /** nage : hors de l'eau à la dernière image (gerbe au passage), minuteur des effets d'eau (souffle, sillage, remous) */
  air?: boolean;
  seaT?: number;
}

/** Au-delà de cette distance à la caméra, les bêtes à terre et dans l'eau ne réfléchissent qu'une image sur trois */
const FAR_WALK = 70;
/**
 * Bêtes articulées, selon leur distance à la caméra (× la part de qualité `detail`) : au-delà de `SHADOW_D` plus d'ombre
 * portée, au-delà de `SLOW_D` l'animation n'avance qu'une image sur deux, au-delà de `IMPOSTOR_D` la bête n'est plus qu'une
 * silhouette figée dessinée par lots (voir `Impostors`), au-delà de `HIDE_D` (ou `HIDE_TINY_D` pour les petites) plus rien
 */
const SHADOW_D = 24, SLOW_D = 22, IMPOSTOR_D = 36, HIDE_D = 130, HIDE_TINY_D = 45;

/** Modèles animés Quaternius par espèce : longueur du corps visée, variante pour le premier du groupe (le cerf), correction de cap */
const MODELS: Partial<Record<Kind, { name: ModelName; length: number; lead?: ModelName; yaw?: number; pick?: ModelName[] }>> = {
  // un banc = une espèce
  fish: { name: 'fish', length: 0.15, pick: ['clownfish', 'yellow_tang', 'fish'] },
  dolphin: { name: 'dolphin', length: 0.7 },
  whale: { name: 'whale', length: 1.7 },
  manta: { name: 'manta', length: 0.55 },
  // (mouton, cochon et poule : bêtes articulées du jeu, voir `BEAST_KINDS`)
  cow: { name: 'cow', length: 0.3 },
  // shiba ou husky, cheval bai ou blanc : un modèle par groupe
  dog: { name: 'dog', length: 0.2, pick: ['dog', 'husky'] },
  deer: { name: 'deer', length: 0.3, lead: 'stag' },
  horse: { name: 'horse', length: 0.34, pick: ['horse', 'horse_white'] },
  llama: { name: 'llama', length: 0.24 },
  fox: { name: 'fox', length: 0.2 },
};

export type SeaFx = 'splash' | 'spout' | 'wake' | 'ripple';

interface Source { key: string; kind: Kind; hx: number; hz: number; n: number; radius: number }

const blocked = (w: World, cx: number, cz: number) => !w.inCells(cx, cz) || !!w.occ[w.ci(cx, cz)] || !!w.decor[w.ci(cx, cz)] || !!w.lake[w.ci(cx, cz)];
const land = (w: World, cx: number, cz: number) => !blocked(w, cx, cz) && w.cellAvg(cx, cz) >= 0.2 && w.cellSlope(cx, cz) < 1.1;
const water = (w: World, cx: number, cz: number) => w.inCells(cx, cz) && w.cellAvg(cx, cz) < -0.12;
/** le large : cases de mer à au moins `OPEN_SEA` cases de toute terre (dauphins, baleines) */
export const OPEN_SEA = 5;
/** La mer devant le village (`coast…`) : seulement si le large ou les hauts-fonds sont à moins de tant de cases de la place */
export const COAST_REACH = 70;
/**
 * Cases de mer (hors lacs) à au moins `r` cases de la terre, par parcours en largeur depuis les cases sèches. La mer des
 * continents ne descend guère sous −1,25 : un seuil de profondeur (−1,6 autrefois) n'y trouvait aucune case, et ni dauphin ni
 * baleine n'apparaissait
 */
export function openSea(w: World, r: number): number[] {
  const dist = new Uint8Array(N * N).fill(255), queue = new Int32Array(N * N);
  let head = 0, tail = 0;
  for (let k = 0; k < N * N; k++) if (!water(w, k % N, Math.floor(k / N)) || w.lake[k]) { dist[k] = 0; queue[tail++] = k; }
  while (head < tail) {
    const k = queue[head++], d = dist[k];
    if (d >= r) continue;
    const cx = k % N, cz = (k - cx) / N;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, z = cz + dz;
      if (!w.inCells(x, z) || dist[z * N + x] <= d + 1) continue;
      dist[z * N + x] = d + 1;
      queue[tail++] = z * N + x;
    }
  }
  const out: number[] = [];
  for (let k = 0; k < N * N; k++) if (dist[k] >= r) out.push(k);
  return out;
}
const pasture = (w: World, cx: number, cz: number) => land(w, cx, cz) && w.veg[w.ci(cx, cz)] !== 2 && w.veg[w.ci(cx, cz)] !== 3;
const wild = (w: World, cx: number, cz: number) => land(w, cx, cz) && !w.road[w.ci(cx, cz)] && w.veg[w.ci(cx, cz)] <= 1;
/** bêtes de la ferme : sur l'herbe, jamais sur les routes ni les places du village */
const farmland = (w: World, cx: number, cz: number) => pasture(w, cx, cz) && !w.road[w.ci(cx, cz)];
/** petites bêtes et bêtes sauvages : n'importe où sur la terre, sauf dans les rues */
const offRoad = (w: World, cx: number, cz: number) => land(w, cx, cz) && !w.road[w.ci(cx, cz)];
/** grenouilles : berges et eau peu profonde */
const bank = (w: World, cx: number, cz: number) => !blocked(w, cx, cz) && w.cellAvg(cx, cz) > -0.5 && w.cellAvg(cx, cz) < 1.5 && w.waterDist[w.ci(cx, cz)] <= 2;
/** crabes : la plage, tout contre l'eau */
const beach = (w: World, cx: number, cz: number) => offRoad(w, cx, cz) && w.waterDist[w.ci(cx, cz)] <= 2 && w.cellAvg(cx, cz) < 1.2;
const any = () => true;
/** hauts pâturages et éboulis des montagnes (bouquetins) */
const alpine = (w: World, cx: number, cz: number) => !blocked(w, cx, cz) && w.cellAvg(cx, cz) > 4.2 && w.cellSlope(cx, cz) < 2.2;

const ico = (r: number, sx: number, sy: number, sz: number, d = 1) => new THREE.IcosahedronGeometry(r, d).scale(sx, sy, sz);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const leg = (w: number, h: number) => new THREE.BoxGeometry(w, h, w).translate(0, h / 2, 0);
const tri = (pts: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g; };
const DARK = 0x3a3335;
/** façade des bâtiments selon leur rotation (comme BuildingView) */
const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];

function sheepGeo() {
  const p = new Parts();
  p.add(ico(0.07, 0.85, 0.72, 1.15), 0, 0.085, 0, 0xf6f3ec);
  p.add(ico(0.04, 1, 0.8, 1), 0, 0.125, 0.0, 0xffffff);
  p.add(ico(0.03, 0.85, 1, 1.25, 0), 0, 0.1, 0.085, DARK);
  for (const s of [-1, 1]) p.add(box(0.03, 0.012, 0.016), s * 0.028, 0.112, 0.072, DARK);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(leg(0.014, 0.05), x * 0.03, 0, z * 0.045, DARK);
  return p.build(false).body;
}

function cowGeo() {
  const p = new Parts();
  p.add(box(0.09, 0.075, 0.17), 0, 0.085, 0, 0xffffff);
  p.add(box(0.094, 0.045, 0.05), 0, 0.09, -0.03, DARK);
  p.add(box(0.05, 0.03, 0.045), 0.012, 0.11, 0.045, DARK);
  p.add(box(0.06, 0.058, 0.065), 0, 0.12, 0.105, 0xffffff);
  p.add(box(0.05, 0.028, 0.025), 0, 0.104, 0.145, 0xe8a9a0);
  for (const s of [-1, 1]) {
    p.add(box(0.012, 0.026, 0.012), s * 0.024, 0.155, 0.098, 0xefe6cf);
    p.add(box(0.03, 0.012, 0.016), s * 0.042, 0.135, 0.092, 0xffffff);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(leg(0.02, 0.05), x * 0.03, 0, z * 0.06, 0x5a4a42);
  p.add(box(0.008, 0.06, 0.008), 0, 0.09, -0.09, DARK, 0, false, 0, 0.25);
  return p.build(false).body;
}

function henGeo() {
  const p = new Parts();
  p.add(ico(0.03, 0.85, 0.85, 1.1), 0, 0.04, 0, 0xffffff);
  p.add(ico(0.018, 0.8, 1.2, 0.9, 0), 0, 0.058, -0.03, 0xffffff, 0, false, 0, -0.4);
  p.add(ico(0.017, 1, 1, 1), 0, 0.072, 0.024, 0xffffff);
  p.add(box(0.006, 0.014, 0.018), 0, 0.09, 0.024, 0xe0453a);
  p.add(new THREE.ConeGeometry(0.007, 0.016, 4).rotateX(Math.PI / 2), 0, 0.07, 0.045, 0xf0a030);
  for (const s of [-1, 1]) p.add(leg(0.004, 0.016), s * 0.01, 0, 0, 0xf0a030);
  return p.build(false).body;
}

function rabbitGeo() {
  const p = new Parts();
  p.add(ico(0.032, 0.8, 0.75, 1.1), 0, 0.03, 0, 0xffffff);
  p.add(ico(0.021, 1, 1, 1), 0, 0.055, 0.032, 0xffffff);
  for (const s of [-1, 1]) p.add(box(0.008, 0.04, 0.013).translate(0, 0.02, 0), s * 0.008, 0.066, 0.028, 0xffffff, 0, false, s * 0.18);
  p.add(ico(0.011, 1, 1, 1, 0), 0, 0.036, -0.036, 0xfaf8f4);
  return p.build(false).body;
}

/** Bouquetin : corps trapu de cervidé, longues cornes recourbées vers l'arrière */
function ibexGeo() {
  const p = new Parts();
  p.add(box(0.075, 0.075, 0.15), 0, 0.12, 0, 0xffffff);
  p.add(box(0.068, 0.02, 0.11), 0, 0.09, 0, 0xe8dccb);
  p.add(box(0.036, 0.08, 0.036), 0, 0.18, 0.065, 0xffffff, 0, false, 0, -0.35);
  p.add(box(0.04, 0.04, 0.065), 0, 0.22, 0.095, 0xffffff);
  p.add(box(0.012, 0.03, 0.01), 0, 0.195, 0.125, 0x4a4036);
  for (const s of [-1, 1]) {
    p.add(box(0.012, 0.06, 0.012), s * 0.013, 0.255, 0.085, 0x5a4c3e, 0, false, 0, -0.5);
    p.add(box(0.011, 0.05, 0.011), s * 0.014, 0.29, 0.06, 0x5a4c3e, 0, false, 0, -1.2);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(leg(0.016, 0.09), x * 0.026, 0, z * 0.055, 0x4a4036);
  return p.build(false).body;
}

function deerGeo() {
  const p = new Parts();
  p.add(box(0.07, 0.07, 0.16), 0, 0.13, 0, 0xffffff);
  p.add(box(0.064, 0.02, 0.12), 0, 0.095, 0, 0xf4e6d2);
  p.add(box(0.034, 0.09, 0.034), 0, 0.19, 0.07, 0xffffff, 0, false, 0, -0.45);
  p.add(box(0.04, 0.04, 0.07), 0, 0.235, 0.1, 0xffffff);
  p.add(box(0.02, 0.016, 0.02), 0, 0.226, 0.138, DARK);
  for (const s of [-1, 1]) p.add(box(0.026, 0.012, 0.01), s * 0.03, 0.258, 0.088, 0xffffff, 0, false, s * 0.4);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.add(leg(0.015, 0.1), x * 0.024, 0, z * 0.06, 0x6a5040);
  p.add(ico(0.014, 1, 1, 1, 0), 0, 0.15, -0.084, 0xf8f4ee);
  return p.build(false).body;
}

function duckGeo() {
  const p = new Parts();
  p.add(ico(0.036, 0.8, 0.55, 1.2), 0, 0.012, 0, 0xffffff);
  p.add(ico(0.014, 0.8, 1.2, 0.9, 0), 0, 0.022, -0.038, 0xffffff, 0, false, 0, -0.5);
  p.add(ico(0.018, 1, 1, 1), 0, 0.045, 0.03, 0xffffff);
  p.add(box(0.014, 0.006, 0.02), 0, 0.042, 0.052, 0xf09a30);
  return p.build(false).body;
}

function birdGeo() {
  const p = new Parts();
  p.add(ico(0.022, 0.75, 0.65, 1.7, 0), 0, 0, 0, 0xffffff);
  p.add(ico(0.014, 1, 1, 1, 0), 0, 0.01, 0.04, 0xffffff);
  p.add(new THREE.ConeGeometry(0.006, 0.018, 4).rotateX(Math.PI / 2), 0, 0.008, 0.058, 0xf0a030);
  for (const s of [-1, 1]) {
    const rf = [s * 0.01, 0, 0.02], tip = [s * 0.15, 0, -0.01], tr = [s * 0.12, 0, -0.035], rb = [s * 0.01, 0, -0.02];
    p.add(tri([...rf, ...tip, ...tr, ...rf, ...tr, ...rb]), 0, 0, 0, 0xf2f2f2);
  }
  p.add(tri([0, 0, -0.03, -0.022, 0, -0.068, 0.022, 0, -0.068]), 0, 0, 0, 0xe6e6e6);
  return p.build(false).body;
}

/** Oiseau chanteur : petit corps rond, ventre clair, ailes courtes (repliées quand il est posé) */
function songbirdGeo() {
  const p = new Parts();
  p.add(ico(0.02, 0.85, 0.8, 1.25, 1), 0, 0.018, 0, 0xffffff);
  p.add(ico(0.015, 0.8, 0.7, 1, 0), 0, 0.012, 0.006, 0xfff4e0);
  p.add(ico(0.013, 1, 1, 1, 0), 0, 0.034, 0.02, 0xffffff);
  p.add(new THREE.ConeGeometry(0.004, 0.012, 4).rotateX(Math.PI / 2), 0, 0.033, 0.036, 0x3a3030);
  for (const s of [-1, 1]) {
    const rf = [s * 0.012, 0.022, 0.012], tip = [s * 0.07, 0.022, -0.006], rb = [s * 0.012, 0.022, -0.018];
    p.add(tri([...rf, ...tip, ...rb]), 0, 0, 0, 0xe8e8e8);
  }
  p.add(tri([0, 0.02, -0.02, -0.012, 0.024, -0.05, 0.012, 0.024, -0.05]), 0, 0, 0, 0xd8d8d8);
  return p.build(false).body;
}

/** Abeille : corps rayé et deux ailes translucides */
function beeGeo() {
  const p = new Parts();
  p.add(ico(0.009, 0.9, 0.85, 1.35, 0), 0, 0, 0, 0xf2c230);
  p.add(box(0.017, 0.016, 0.004), 0, 0, -0.002, 0x2a2420);
  p.add(box(0.016, 0.015, 0.004), 0, 0, -0.008, 0x2a2420);
  for (const s of [-1, 1]) p.add(tri([s * 0.003, 0.007, 0.002, s * 0.022, 0.009, 0.004, s * 0.018, 0.008, -0.01]), 0, 0, 0, 0xeef6ff);
  return p.build(false).body;
}

export function batGeo() {
  const p = new Parts();
  p.add(ico(0.016, 0.9, 0.8, 1.3, 0), 0, 0, 0, 0xffffff);
  for (const s of [-1, 1]) {
    p.add(new THREE.ConeGeometry(0.005, 0.014, 3), s * 0.007, 0.014, 0.012, 0xffffff);
    // aile en membrane festonnée
    p.add(tri([s * 0.008, 0, 0.012, s * 0.09, 0, 0.004, s * 0.055, 0, -0.016, s * 0.008, 0, 0.012, s * 0.055, 0, -0.016, s * 0.008, 0, -0.012,
      s * 0.055, 0, -0.016, s * 0.09, 0, 0.004, s * 0.08, 0, -0.022]), 0, 0, 0, 0xd8d0d8);
  }
  return p.build(false).body;
}

function fishGeo() {
  const p = new Parts();
  p.add(ico(0.03, 0.55, 0.8, 1.6, 0), 0, 0, 0, 0xffffff);
  p.add(tri([0, 0, -0.04, 0, 0.025, -0.075, 0, -0.025, -0.075]), 0, 0, 0, 0xe0e0e0);
  p.add(tri([0, 0.02, 0.01, 0, 0.042, -0.02, 0, 0.018, -0.03]), 0, 0, 0, 0xe0e0e0);
  return p.build(false).body;
}

function dolphinGeo() {
  const p = new Parts();
  p.add(ico(0.07, 0.62, 0.6, 2.3, 1), 0, 0, 0, 0xffffff);
  p.add(ico(0.06, 0.55, 0.35, 2, 1), 0, -0.018, 0.01, 0xe8eef2);
  p.add(new THREE.ConeGeometry(0.018, 0.08, 5).rotateX(Math.PI / 2), 0, -0.005, 0.19, 0xffffff);
  p.add(tri([0, 0.035, 0.03, 0, 0.1, -0.06, 0, 0.035, -0.07]), 0, 0, 0, 0xd0d6dc);
  p.add(tri([0, 0, -0.14, -0.07, 0.01, -0.2, 0, 0, -0.17, 0, 0, -0.14, 0, 0, -0.17, 0.07, 0.01, -0.2]), 0, 0, 0, 0xd0d6dc);
  for (const s of [-1, 1]) p.add(tri([s * 0.03, -0.02, 0.05, s * 0.08, -0.04, 0.0, s * 0.03, -0.02, 0.0]), 0, 0, 0, 0xd0d6dc);
  return p.build(false).body;
}

/**
 * Requin : corps gris fuselé (ventre clair) et grand aileron dorsal, environ 0,9 case de long. Nageant juste sous la
 * surface, seul l'aileron la fend (voir `swim`)
 */
function sharkGeo() {
  const p = new Parts();
  p.add(ico(0.1, 0.5, 0.42, 4.4, 1), 0, 0, 0, 0xffffff);
  p.add(ico(0.09, 0.42, 0.22, 3.8, 1), 0, -0.03, 0.02, 0xe6eaee);
  // aileron dorsal haut et recourbé, deux fois plus visible qu'une simple crête
  p.add(tri([0, 0.03, 0.08, 0, 0.22, -0.06, 0, 0.03, -0.08]), 0, 0, 0, 0xd8dde2);
  p.add(tri([0, 0.03, -0.08, 0, 0.22, -0.06, 0, 0.03, 0.08]), 0, 0, 0, 0xd8dde2);
  // queue en croissant, nageoires pectorales
  p.add(tri([0, 0, -0.4, 0, 0.16, -0.54, 0, 0.02, -0.46]), 0, 0, 0, 0xd8dde2);
  p.add(tri([0, 0, -0.4, 0, 0.02, -0.46, 0, 0.16, -0.54]), 0, 0, 0, 0xd8dde2);
  p.add(tri([0, 0, -0.4, 0, -0.1, -0.5, 0, -0.01, -0.45]), 0, 0, 0, 0xd8dde2);
  p.add(tri([0, 0, -0.4, 0, -0.01, -0.45, 0, -0.1, -0.5]), 0, 0, 0, 0xd8dde2);
  for (const k of [-1, 1]) {
    p.add(tri([k * 0.05, -0.03, 0.1, k * 0.2, -0.08, -0.04, k * 0.05, -0.03, -0.02]), 0, 0, 0, 0xd8dde2);
    p.add(tri([k * 0.05, -0.03, 0.1, k * 0.05, -0.03, -0.02, k * 0.2, -0.08, -0.04]), 0, 0, 0, 0xd8dde2);
  }
  return p.build(false).body;
}

function butterflyGeo() {
  const p = new Parts();
  p.add(box(0.006, 0.006, 0.03), 0, 0, 0, DARK);
  for (const s of [-1, 1]) {
    p.add(tri([s * 0.003, 0, 0.004, s * 0.036, 0, 0.024, s * 0.03, 0, -0.003]), 0, 0, 0, 0xffffff);
    p.add(tri([s * 0.003, 0, -0.002, s * 0.027, 0, -0.012, s * 0.012, 0, -0.024]), 0, 0, 0, 0xf2f2f2);
  }
  return p.build(false).body;
}

const SPECS: Record<Kind, Spec> = {
  sheep: { geo: sheepGeo, max: 80, colors: [0xffffff, 0xf3ece0, 0xfdfdfd, 0xe9e2d6, 0x5a5052], speed: 0.35, run: 1.2, idle: [3, 9], ok: farmland, graze: 0.14, flee: 2.5, scale: 0.91 },
  cow: { geo: cowGeo, max: 64, colors: [0xffffff, 0xb07850, 0xe8d8b8, 0x8a5a3a], speed: 0.3, idle: [4, 12], ok: farmland, graze: 0.1 },
  pig: { geo: sheepGeo, max: 48, colors: [0xf2b3b3, 0xb8664a, 0x3e3638], speed: 0.3, idle: [3, 8], ok: farmland, graze: 0.1, scale: 0.86 },
  hen: { geo: henGeo, max: 176, colors: [0xffffff, 0xc8763c, 0xe8d0a0, 0x4a4446], speed: 0.45, run: 0.9, idle: [1, 4], ok: offRoad, peck: true, flee: 1.4 },
  rabbit: { geo: rabbitGeo, max: 110, colors: [0xb08a68, 0x9a9690, 0xf2efe8, 0x8a6a4e], speed: 0.9, run: 1.75, idle: [2, 6], ok: offRoad, hop: 0.05, flee: 2.2 },
  deer: { geo: deerGeo, max: 72, colors: [0xb87a48, 0xa86c40, 0xc48a58], speed: 0.5, run: 1.9, idle: [4, 10], ok: wild, graze: 0.2, flee: 3.5 },
  horse: { geo: deerGeo, max: 24, colors: [0x8a5a3a, 0x5a3e2e, 0xd8c8a8], speed: 0.45, run: 2, idle: [4, 10], ok: farmland, graze: 0.2, flee: 3, scale: 1.2 },
  llama: { geo: deerGeo, max: 16, colors: [0xf2ece0, 0xb89878, 0x8a6a4e], speed: 0.38, run: 1.3, idle: [4, 10], ok: offRoad, graze: 0.12, flee: 3 },
  fox: { geo: deerGeo, max: 28, colors: [0xd8743a], speed: 0.5, run: 1.55, idle: [3, 8], ok: offRoad, scale: 0.6, flee: 1.5 },
  wolf: { geo: deerGeo, max: 24, colors: [0x8a8a90, 0x6a6a72, 0x9a8670], speed: 0.55, run: 1.75, idle: [3, 8], ok: offRoad, scale: 0.8, flee: 2 },
  frog: { geo: duckGeo, max: 110, colors: [0x6aa84a, 0xa87a4e, 0x8a9a4e], speed: 0.35, run: 0.7, idle: [2, 7], ok: bank, hop: 0.03, flee: 1.2 },
  duck: { geo: duckGeo, max: 40, colors: [0x8a6a4a, 0xa8a49c, 0xffffff], speed: 0.25, idle: [2, 6], ok: water },
  duckling: { geo: duckGeo, max: 100, colors: [0xf8dc6a], speed: 0.25, idle: [1, 1], ok: water, scale: 0.55 },
  bird: { geo: birdGeo, max: 70, colors: [0xffffff, 0xdfe4ea], speed: 0, idle: [1, 1], ok: any, flap: [9, 0.9, 0.012], scale: 2.3 },
  songbird: { geo: songbirdGeo, max: 90, colors: [0xe8553c, 0x4a8ce0, 0xf2c94c, 0x9a7458, 0x5abf8a], speed: 0, idle: [4, 14], ok: any, flap: [22, 1.2, 0.012], scale: 1.3 },
  bee: { geo: beeGeo, max: 48, colors: [0xffffff], speed: 0, idle: [1, 3], ok: any, flap: [40, 1.5, 0.003], scale: 2.2 },
  bat: { geo: batGeo, max: 24, colors: [0x3a3238, 0x2e282e, 0x4a3e3e], speed: 0, idle: [1, 1], ok: any, flap: [17, 1.4, 0.008], scale: 1.7 },
  fish: { geo: fishGeo, max: 170, colors: [0xf28c38, 0xc8d4dc, 0x5fa8d8, 0xf2d04a], speed: 0, idle: [1, 1], ok: water },
  whale: { geo: dolphinGeo, max: 4, colors: [0x55607a], speed: 0, idle: [1, 1], ok: water, scale: 4 },
  manta: { geo: dolphinGeo, max: 8, colors: [0x2c3d5c], speed: 0, idle: [1, 1], ok: water, scale: 1.2 },
  dolphin: { geo: dolphinGeo, max: 18, colors: [0x7f97ab, 0x8ea3b4], speed: 0, idle: [1, 1], ok: water, scale: 1.5 },
  shark: { geo: sharkGeo, max: 6, colors: [0x5d6b78, 0x6a7784], speed: 0, idle: [1, 1], ok: water },
  eagle: { geo: birdGeo, max: 12, colors: [0x5a4232, 0x6b4e38, 0x4e3a2c], speed: 0, idle: [1, 1], ok: any, flap: [3, 0.45, 0.012], scale: 3.6 },
  gull: { geo: birdGeo, max: 30, colors: [0xffffff, 0xf2f4f6], speed: 0, idle: [1, 1], ok: any, flap: [7, 0.9, 0.012], scale: 2 },
  bear: { max: 10, colors: [0x6a4a34, 0x7a5438, 0x3a302c], speed: 0.28, run: 1.5, idle: [5, 14], ok: wild, graze: 0.1, flee: 3, scale: 1.25 },
  ibex: { geo: ibexGeo, max: 24, colors: [0x8a7a68, 0x9c8b76, 0x6e6052], speed: 0.35, run: 1.6, idle: [3, 9], ok: alpine, graze: 0.15, flee: 2.6, scale: 1.1 },
  lizard: { max: 44, colors: [0x8aa050, 0xc8a860, 0x9a9a60, 0xa88a58], speed: 0.4, run: 1.5, idle: [2, 7], ok: offRoad, flee: 1.2 },
  crab: { max: 32, colors: [0xd8583a, 0xc8a070, 0xe07a50], speed: 0.35, run: 0.9, idle: [2, 6], ok: beach, flee: 1.1 },
  turtle: { max: 22, colors: [0x6a8a4a, 0x8a7a50, 0x5a7a58], speed: 0.1, run: 0.25, idle: [5, 14], ok: bank, flee: 0.9 },
  croc: { max: 6, colors: [0x6a8a4a, 0x5a7a3e, 0x7a8a58], speed: 0.18, run: 0.9, idle: [8, 22], ok: bank },
  camel: { max: 20, colors: [0xc8a070, 0xb89060, 0xd8b888], speed: 0.33, run: 1.2, idle: [5, 12], ok: offRoad, graze: 0.12, flee: 2.5, scale: 1.1 },
  elephant: { max: 14, colors: [0x8e8e94, 0x7a7a82, 0x9a9a9e], speed: 0.25, run: 0.8, idle: [6, 16], ok: offRoad, graze: 0.12, scale: 1.45 },
  giraffe: { max: 14, colors: [0xf0c460, 0xe8b858, 0xf4cc78], speed: 0.33, run: 1.5, idle: [5, 12], ok: offRoad, graze: 0.1, flee: 3, scale: 1.25 },
  moose: { max: 24, colors: [0x6a4e3a, 0x5a4232, 0x7a5a42], speed: 0.33, run: 1.5, idle: [5, 12], ok: wild, graze: 0.15, flee: 3, scale: 1.2 },
  dog: { geo: deerGeo, max: 16, colors: [0xb88a5a, 0x3a3335, 0xe8d8b8, 0x8a5a3a], speed: 0.6, run: 1.6, idle: [2, 6], ok: farmland, scale: 0.45 },
  goose: { geo: duckGeo, max: 40, colors: [0xffffff, 0xf0ece4, 0xb8b0a4], speed: 0.3, run: 0.8, idle: [2, 6], ok: farmland, peck: true, flee: 1.2, scale: 1.4 },
  butterfly: { geo: butterflyGeo, max: 64, colors: [0xf7d24c, 0xf29ab4, 0xffffff, 0x9fc8f0, 0xf09a50], speed: 0, idle: [1, 1], ok: any, flap: [26, 1.3, 0.003] },
};
const KIND_LIST = Object.keys(SPECS) as Kind[];
/** Rendu instancié de secours (modèle absent), ou espèces toujours procédurales */
const PROCEDURAL = new Set<Kind>(['bird', 'songbird', 'bee', 'butterfly', 'bat', 'eagle', 'gull', 'shark']);

/** Élément du décor ou zone auquel un groupe d'animaux est rattaché */
export type Anchor = 'edge' | 'meadow' | 'rocks' | 'banks' | 'ponds' | 'coast';
/** Zone de vie d'une espèce : ses biomes, les ancrages qu'elle cherche (le premier qui existe), un groupe par `per` cases */
export interface Zone { kind: Kind; biomes: number[]; anchors: Anchor[]; per: number; max: number; n: (i: number) => number; radius: number; salt: number; needs?: ModelName }
const ALL_BIOMES = [BIOME_TEMPERATE, BIOME_TAIGA, BIOME_DESERT, BIOME_TROPICAL, BIOME_MARSH];
export const ZONES: Zone[] = [
  // désert : lézards sur les rochers, chameaux aux lisières des oasis (cactus, palmiers)
  { kind: 'lizard', biomes: [BIOME_DESERT, BIOME_TROPICAL], anchors: ['rocks', 'edge'], per: 10, max: 6, n: (i) => 2 + (i % 2), radius: 1.3, salt: 300 },
  { kind: 'camel', biomes: [BIOME_DESERT], anchors: ['edge', 'meadow'], per: 60, max: 4, n: (i) => 2 + (i % 2), radius: 2.6, salt: 310 },
  // marais, fleuves et lacs : crocodiles sur les berges, tortues au bord des mares
  { kind: 'croc', biomes: [BIOME_MARSH, BIOME_TROPICAL, BIOME_DESERT], anchors: ['banks'], per: 40, max: 3, n: () => 1, radius: 1.4, salt: 320 },
  { kind: 'turtle', biomes: [BIOME_MARSH, BIOME_TROPICAL, BIOME_TEMPERATE, BIOME_DESERT], anchors: ['ponds', 'banks'], per: 14, max: 5, n: (i) => 1 + (i % 2), radius: 1.1, salt: 330 },
  // savane et plaines chaudes : éléphants et girafes à l'ombre des arbres
  { kind: 'elephant', biomes: [BIOME_TROPICAL], anchors: ['edge', 'meadow'], per: 60, max: 3, n: (i) => 2 + (i % 2), radius: 3, salt: 340 },
  { kind: 'giraffe', biomes: [BIOME_TROPICAL], anchors: ['edge', 'meadow'], per: 55, max: 3, n: (i) => 2 + (i % 2), radius: 3, salt: 350 },
  // taïga : élans aux lisières ; forêts tempérées : une petite meute de loups
  { kind: 'moose', biomes: [BIOME_TAIGA], anchors: ['edge'], per: 45, max: 5, n: (i) => 1 + (i % 2), radius: 2.8, salt: 360 },
  { kind: 'wolf', biomes: [BIOME_TEMPERATE], anchors: ['edge'], per: 140, max: 1, n: (i) => 3 + (i % 2), radius: 3, salt: 370 },
  // côtes : crabes sur les plages, quel que soit le biome
  { kind: 'crab', biomes: ALL_BIOMES, anchors: ['coast'], per: 20, max: 4, n: (i) => 2 + (i % 2), radius: 1.2, salt: 380 },
];
/** Espèces rattachées à un biome par la table des zones */
export const speciesIn = (biome: number): Kind[] => ZONES.filter((z) => z.biomes.includes(biome)).map((z) => z.kind);

/**
 * Bêtes sauvages des alentours du village et des visiteurs près de la vue, par biome (tempéré, taïga, désert, tropiques,
 * marais) : du gibier familier, qu'on croise souvent
 */
export const NEARBY: Record<number, Kind[]> = {
  [BIOME_TEMPERATE]: ['deer', 'rabbit', 'songbird', 'fox', 'rabbit', 'sheep', 'deer', 'songbird'],
  [BIOME_TAIGA]: ['moose', 'deer', 'rabbit', 'songbird', 'fox', 'rabbit'],
  [BIOME_DESERT]: ['camel', 'lizard', 'songbird', 'rabbit', 'camel', 'lizard'],
  [BIOME_TROPICAL]: ['giraffe', 'lizard', 'elephant', 'songbird', 'rabbit', 'lizard'],
  [BIOME_MARSH]: ['turtle', 'deer', 'rabbit', 'frog', 'songbird', 'frog'],
};
/**
 * Les bêtes qu'on laisse approcher du village selon l'âge : toutes à la Préhistoire et dans l'Antiquité, les petites et les
 * cerfs au Moyen Âge, seulement le petit gibier (oiseaux, lapins, lézards, grenouilles, tortues, moutons) dès l'ère industrielle :
 * un éléphant ne rôde pas entre les usines
 */
const SMALL_GAME = new Set<Kind>(['songbird', 'rabbit', 'lizard', 'frog', 'turtle', 'sheep']);
const BIG_GAME = new Set<Kind>(['elephant', 'giraffe', 'camel', 'moose']);
/** Gros gibier et prédateurs : dès le Moyen Âge, ils se tiennent loin du village (voir `group`) */
const KEEP_AWAY = new Set<Kind>(['elephant', 'giraffe', 'camel', 'moose', 'deer', 'fox', 'wolf']);
/** (les bêtes de la mer ne se soucient pas des usines : toujours admises) */
export const nearbyAllowed = (k: Kind, age: number) => SWIMMERS.has(k) || (age >= 3 ? SMALL_GAME.has(k) : age === 2 ? !BIG_GAME.has(k) : true);
/** Taille d'un groupe de ces bêtes */
export const nearbyGroup = (k: Kind) => (k === 'moose' || k === 'fox' ? 1 : k === 'sheep' ? 4 : k === 'songbird' ? 3 : 2);
/** Anneau des alentours du village (distance au centre, en cases) */
export const VILLAGE_RING: [number, number] = [5, 19];
/** Bêtes à terre qu'on veut voir près du centre de la vue, et rayon où on les compte */
export const SEEN_MIN = 6, SEEN_R = 10;
/** Groupes de visiteurs au plus (les plus anciens repartent quand d'autres arrivent) */
export const VISITORS = 5;

/** Centre du village : la place (le feu de camp, le forum), sinon le milieu de ses bâtiments ; null sans bâtiment */
export function villageCenter(w: World): [number, number] | null {
  let sx = 0, sz = 0, n = 0;
  for (const b of w.buildings.values()) {
    const s = sizeOf(b);
    if (b.kind === 'gather') return [b.x + s / 2, b.z + s / 2];
    sx += b.x + s / 2; sz += b.z + s / 2; n++;
  }
  return n ? [sx / n, sz / n] : null;
}

/**
 * Faut-il un groupe de visiteurs près de la vue ? Quand la vue est assez proche du sol pour voir des bêtes (`camDist`), et
 * qu'on en compte moins de `SEEN_MIN` à terre autour de son centre
 */
export const wantsVisitors = (seen: number, camDist: number) => camDist < 55 && seen < SEEN_MIN;

/**
 * Tanières des ours : à l'entrée de chaque grotte (devant l'ouverture) ou au bout d'une faille, sur la case praticable
 * la plus proche (à moins de trois cases) ; toutes les grottes n'en abritent pas
 */
export function bearDens(w: World): { key: string; x: number; z: number; cub: boolean }[] {
  const out: { key: string; x: number; z: number; cub: boolean }[] = [];
  // les entrées : chaque grotte, et chaque ravin (une faille) par son milieu
  const holes: [number, number[] | null][] = [];
  for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_CAVE) holes.push([k, null]);
  for (const g of w.riftGroups()) holes.push([w.riftMid(g), g]);
  for (const [k, group] of holes) {
    const cx = k % N, cz = Math.floor(k / N);
    if (hash2(cx, cz, 105) > 0.8) continue;
    let mx: number, mz: number;
    if (!group) {
      const f = w.caveFrame(cx, cz, () => 0);
      mx = f.x + Math.sin(f.yaw) * 1.5; mz = f.z + Math.cos(f.yaw) * 1.5;
    } else {
      // au bout du ravin : sa case la plus éloignée de son milieu, un peu au-delà
      const end = group.reduce((b, q) => (Math.hypot((q % N) - cx, Math.floor(q / N) - cz) > Math.hypot((b % N) - cx, Math.floor(b / N) - cz) ? q : b));
      const ex = (end % N) + 0.5, ez = Math.floor(end / N) + 0.5, l = Math.hypot(ex - cx - 0.5, ez - cz - 0.5) || 1;
      mx = ex + ((ex - cx - 0.5) / l) * 1.5; mz = ez + ((ez - cz - 0.5) / l) * 1.5;
    }
    let best: [number, number] | null = null, bd = 3.2;
    for (let dz = -3; dz <= 3; dz++)
      for (let dx = -3; dx <= 3; dx++) {
        const x = Math.floor(mx) + dx, z = Math.floor(mz) + dz;
        if (!wild(w, x, z)) continue;
        const d = Math.hypot(x + 0.5 - mx, z + 0.5 - mz);
        if (d < bd) { bd = d; best = [x + 0.5, z + 0.5]; }
      }
    if (best) out.push({ key: `den${k}`, x: best[0], z: best[1], cub: hash2(cx, cz, 109) < 0.45 });
  }
  return out.slice(0, 5);
}

export interface Person { x: number; z: number; hidden: boolean }

/**
 * Faune : troupeaux, basse-cour, gibier, prédateurs, oiseaux, abeilles et vie marine ; les bêtes broutent l'herbe,
 * vont boire, fuient les prédateurs (qui les chassent), les lapins pillent les potagers, les abeilles font fleurir
 * les prairies, les oiseaux se posent dans les arbres et s'envolent au moindre danger, les dauphins chassent les bancs
 */
export class Fauna {
  group = new THREE.Group();
  /** une meute de loups se met à hurler (pour le son) */
  onHowl: ((x: number, z: number) => void) | null = null;
  /**
   * Effets d'eau des bêtes marines, seulement près de la vue (bête réfléchie à chaque image) : gerbe d'un saut (`splash`,
   * `size` 0,5 poisson … 3 baleine), souffle de la baleine (`spout`), sillage d'un aileron (`wake`), remous d'un banc
   * (`ripple`). Branché sur `AmbientLife.seaFx` dans `main.ts`
   */
  onSea: ((fx: SeaFx, x: number, z: number, size: number) => void) | null = null;
  /** villageois, que les bêtes sauvages évitent */
  people: () => Person[] = () => [];
  /** volcan en éruption : tous les animaux qui craignent quelque chose s'en éloignent en courant */
  alarm: { x: number; z: number; r: number } | null = null;
  /** temps de la houle (celui du rendu de l'eau) */
  private elapsed = 0;
  private meshes = {} as Record<Kind, THREE.InstancedMesh>;
  private phases = {} as Record<Kind, THREE.InstancedBufferAttribute | undefined>;
  private flaps = {} as Record<Kind, THREE.InstancedBufferAttribute | undefined>;
  private critters: Critter[] = [];

  /** Grenouilles visibles autour d'un point (0 … 1) : leurs coassements */
  frogsNear(x: number, z: number, r: number) {
    let n = 0;
    for (const c of this.critters) if (c.kind === 'frog' && !c.hidden && Math.abs(c.x - x) < r && Math.abs(c.z - z) < r) n++;
    return Math.min(1, n / 4);
  }
  private homes = new Map<string, number>();
  private lastVersion = -1;
  private lastAge = -1;
  private refreshTimer = 0;
  /** recensement en cours, réparti sur plusieurs images */
  private refreshing: Generator<void, void, void> | null = null;
  private lifeTimer = 0;
  /** niveau de broutage et de floraison affiché par case (la végétation se refait quand il change) */
  private shownGraze = new Uint8Array(N * N);
  private shownBloom = new Uint8Array(N * N);
  private t = 0;
  /** altitude de chaque vol d'oiseaux (recalculée quand le monde change) */
  private flockAlt = new Map<string, number>();
  private uTime = { value: 0 };
  private rnd = mulberry32(4242);
  private d = new THREE.Object3D();
  private col = new THREE.Color();
  private frustum = new THREE.Frustum();
  private sphere = new THREE.Sphere();
  private pm = new THREE.Matrix4();
  private frame = 0;
  /** groupes venus près de la vue (voir `scout`), le plus ancien d'abord */
  private visitors: Source[] = [];
  private visitSerial = 0;
  private scoutTimer = 2;
  private look = new THREE.Vector3();
  /** prédateurs, et chef (rang 0) de chaque groupe : recensés à chaque image plutôt que cherchés parmi toutes les bêtes */
  private hunters: Critter[] = [];
  private leads = new Map<string, Critter>();
  /** qualité graphique : part de la distance à laquelle les bêtes articulées restent affichées et animées à chaque image */
  detail = 1;
  /** silhouettes figées des bêtes articulées lointaines, dessinées par lots */
  readonly impostors = new Impostors();
  /** un exemplaire caché de chaque bête articulée, pour préparer ses shaders au chargement (voir `bakeSilhouettes`) */
  readonly samples = new THREE.Group();

  constructor(private world: World, private veg: { perches: number[][]; flowers: number[][] }) {
    this.group.add(this.impostors.group);
    this.samples.visible = false;
    this.group.add(this.samples);
    for (const k of KIND_LIST) {
      const sp = SPECS[k];
      if (!sp.geo) continue;
      const g = sp.geo();
      let mat: THREE.MeshStandardMaterial;
      if (sp.flap) {
        const ph = new THREE.InstancedBufferAttribute(new Float32Array(sp.max), 1);
        const fl = new THREE.InstancedBufferAttribute(new Float32Array(sp.max).fill(1), 1);
        g.setAttribute('aPhase', ph);
        g.setAttribute('aFlap', fl);
        this.phases[k] = ph;
        this.flaps[k] = fl;
        mat = flapMaterial(this.uTime, sp.flap);
      } else mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.9 });
      const m = new THREE.InstancedMesh(g, mat, sp.max);
      // couleur par instance dès la création : le shader en tient compte. Créée au premier `setColorAt`, elle changeait le
      // shader à la première apparition de l'espèce (les chauves-souris : à la première nuit, une image figée)
      m.setColorAt(0, this.col.setRGB(1, 1, 1));
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = k !== 'butterfly' && k !== 'bee';
      m.receiveShadow = true;
      this.meshes[k] = m;
      this.group.add(m);
    }
    this.bakeSilhouettes();
  }

  /**
   * Toutes les bêtes articulées possibles (chaque robe des bêtes du jeu, chaque modèle), prises dès le départ : leur silhouette
   * lointaine (`Impostors.ensure`) et un exemplaire caché dans `samples`. Ainsi leurs shaders (articulé, instancié, et leurs
   * ombres) se préparent sous l'écran de chargement (voir `firstUseAll`, precompile.ts). Sans cela, une bête d'une sorte
   * encore jamais vue, ou sa silhouette, compilait au moment où elle paraissait : 100 à 150 ms figées, souvent à la
   * première rotation de la vue, quand des visiteurs arrivent. Les clés et tailles sont celles de `populate`
   */
  private bakeSilhouettes() {
    const keep = (a: Actor) => { a.root.visible = true; this.samples.add(a.root); };
    for (const kind of KIND_LIST) {
      const sp = SPECS[kind], md = MODELS[kind];
      if (BEAST_KINDS.has(kind as BeastKind)) {
        for (let coat = 0; coat < sp.colors.length; coat++) {
          const size = sp.scale ?? 1, a = makeBeast(kind as BeastKind, coat, size);
          this.impostors.ensure(`beast:${kind}:${coat}`, a, size);
          if (coat === 0) keep(a);
        }
      } else if (md && !PROCEDURAL.has(kind)) {
        for (const name of new Set([md.name, ...(md.lead ? [md.lead] : []), ...(md.pick ?? [])])) {
          const a = makeActor(name, md.length);
          if (!a) continue;
          this.impostors.ensure(`model:${name}`, a, md.length);
          keep(a);
        }
      }
    }
  }

  // ---------- Population ----------

  /** Cellule de domaine stable : on garde l'ancienne tant qu'elle reste valable */
  private home(key: string, list: number[], set: Set<number>, salt: number) {
    const prev = this.homes.get(key);
    if (prev !== undefined && set.has(prev)) return prev;
    const c = list[Math.floor(hash2(salt, list.length, 17) * list.length)];
    this.homes.set(key, c);
    return c;
  }

  /** Case libre la plus proche autour d'un bâtiment, de préférence devant sa façade, pour y loger ses bêtes */
  private near(x0: number, z0: number, s: number, rot: number, ok: Spec['ok']): [number, number] | null {
    const [fx, fz] = FRONT[rot], mx = x0 + s / 2, mz = z0 + s / 2;
    for (let r = 1; r <= 2; r++) {
      let best: [number, number] | null = null, score = -Infinity;
      for (let dz = -r; dz < s + r; dz++)
        for (let dx = -r; dx < s + r; dx++) {
          const cx = x0 + dx, cz = z0 + dz;
          if (!ok(this.world, cx, cz)) continue;
          const sc = (cx + 0.5 - mx) * fx + (cz + 0.5 - mz) * fz;
          if (sc > score) { score = sc; best = [cx + 0.5, cz + 0.5]; }
        }
      if (best) return best;
    }
    return null;
  }

  /** Recensement et réconciliation d'un coup (première fois, visiteurs, tests) */
  private refresh() {
    const g = this.refreshGen();
    while (!g.next().done);
  }

  /**
   * Recensement des lieux de vie (toute la carte) puis réconciliation des bêtes : en pas, pour se répartir sur plusieurs
   * images quand le monde change (sur un grand village, tout d'un coup coûtait un à-coup de 30 ms à chaque bâtiment posé)
   */
  private *refreshGen(): Generator<void, void, void> {
    const w = this.world;
    const src: Source[] = [];
    this.flockAlt.clear();
    /** prairies et lisières par biome */
    const meadow: number[][] = [[], [], [], [], []], edge: number[][] = [[], [], [], [], []];
    const forest: number[] = [], shore: number[] = [], gardens: number[] = [], caves: number[] = [], banks: number[] = [];
    /** rochers, berges, berges de mares et plages par biome (rattachement des zones de vie) */
    const rocks: number[][] = [[], [], [], [], []], bankB: number[][] = [[], [], [], [], []], pondB: number[][] = [[], [], [], [], []], coast: number[][] = [[], [], [], [], []];
    const pond = (k: number) => { const x = k % N, z = Math.floor(k / N); return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.inCells(x + dx, z + dz) && !!w.lake[w.ci(x + dx, z + dz)]); };
    /** mer : hauts-fonds pour les bancs de poissons, large pour les dauphins */
    const shallows: number[] = [], deep: number[] = [];
    for (let cz = 0; cz < N; cz++) {
      if (cz && cz % 24 === 0) yield;
      for (let cx = 0; cx < N; cx++) {
        const k = w.ci(cx, cz), v = w.veg[k], b = w.biome[k];
        if (v === 1) {
          forest.push(k);
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => wild(w, cx + dx, cz + dz) && w.veg[w.ci(cx + dx, cz + dz)] === 0)) edge[b].push(k);
        } else if (v === 3) gardens.push(k);
        else if (v === 5) caves.push(k);
        else if (v === 4 && land(w, cx, cz)) rocks[b].push(k);
        else if (v === 0 && pasture(w, cx, cz) && !w.road[k]) meadow[b].push(k);
        if (bank(w, cx, cz) && w.cellAvg(cx, cz) > 0.05) {
          bankB[b].push(k);
          if (b === BIOME_MARSH || b === BIOME_TROPICAL || b === BIOME_TEMPERATE) banks.push(k);
          const lake = pond(k);
          if (lake) pondB[b].push(k);
          if (!lake && w.waterDist[k] <= 1 && beach(w, cx, cz)) coast[b].push(k);
        }
        if (water(w, cx, cz)) {
          const a = w.cellAvg(cx, cz);
          if (a < -0.35) shallows.push(k);
          if (w.waterDist[k] === 0 && [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => w.inCells(cx + dx, cz + dz) && w.cellAvg(cx + dx, cz + dz) > 0.1)) shore.push(k);
        }
      }
    }
    yield;
    deep.push(...openSea(w, OPEN_SEA));
    yield;
    for (const b of w.buildings.values()) {
      const s = sizeOf(b);
      const hens = b.kind === 'farm' ? (b.age < 4 ? 4 : 0) : b.kind === 'house' && b.age <= 2 && hash2(b.x, b.z, 41) < 0.55 ? 3 : 0;
      if (hens) { const h = this.near(b.x, b.z, s, b.rot, offRoad); if (h) src.push({ key: `hen${b.id}`, kind: 'hen', hx: h[0], hz: h[1], n: hens, radius: 0.9 }); }
      // oies près des fermes et de quelques maisons, un chien devant certaines maisons (modèle importé seulement)
      if ((b.kind === 'farm' && b.age < 4) || (b.kind === 'house' && b.age <= 2 && hash2(b.x, b.z, 43) < 0.15)) {
        const h = this.near(b.x, b.z, s, b.rot, farmland);
        if (h) src.push({ key: `goose${b.id}`, kind: 'goose', hx: h[0], hz: h[1], n: 2, radius: 1.3 });
      }
      if ((b.kind === 'house' || b.kind === 'farm') && b.age <= 3 && hasModel('dog') && hash2(b.x, b.z, 47) < 0.3) {
        const h = this.near(b.x, b.z, s, b.rot, farmland);
        if (h) src.push({ key: `dog${b.id}`, kind: 'dog', hx: h[0], hz: h[1], n: 1, radius: 1.8 });
      }
      // la serre de l'époque moderne n'a pas de vaches
      if (b.kind === 'farm' && b.age >= 1 && b.age <= 3) {
        const h = this.near(b.x, b.z, s, b.rot, farmland);
        if (h) src.push({ key: `cow${b.id}`, kind: 'cow', hx: h[0], hz: h[1], n: 2, radius: 1.8 });
        // cochons seulement avec le modèle importé
        if (h && hasModel('pig') && b.age <= 3) src.push({ key: `pig${b.id}`, kind: 'pig', hx: h[0], hz: h[1], n: 2, radius: 1.2 });
      }
    }
    // bêtes ramenées par les expéditions : dans les enclos (PenView), et celles qui n'y ont pas de place paissent en petits
    // groupes près des fermes (des maisons, faute de ferme)
    const loose = penHerds(w).rest;
    if (loose.length) {
      const all = [...w.buildings.values()], farms = all.filter((b) => b.kind === 'farm');
      const hosts = farms.length ? farms : all.filter((b) => b.kind === 'house').slice(0, 3);
      const byKind = new Map<Kind, number>();
      for (const k of loose) byKind.set(k, (byKind.get(k) ?? 0) + 1);
      let i = 0;
      for (const [kind, n] of byKind) {
        for (let left = n, j = 0; left > 0 && hosts.length; j++) {
          const b = hosts[(i + j) % hosts.length], take = Math.min(left, 4);
          const h = this.near(b.x, b.z, sizeOf(b), b.rot, farmland);
          if (h) src.push({ key: `herd-${kind}-${j}`, kind, hx: h[0], hz: h[1], n: take, radius: 1.6 });
          left -= take;
        }
        i++;
      }
    }
    // bêtes apprivoisées : en plus de l'enclos, une part du troupeau pait dans les prés autour des fermes et des enclos
    const flock = w.exp.herd;
    if (flock.length) {
      const all = [...w.buildings.values()];
      const hosts = all.filter((b) => b.kind === 'farm' || b.kind === 'pen');
      const tame = new Map<Kind, number>();
      for (const k of flock) tame.set(k, (tame.get(k) ?? 0) + 1);
      let i = 0;
      for (const [kind, n] of tame) {
        // jusqu'à la moitié du troupeau (au plus six bêtes par espèce), en petits groupes
        for (let left = Math.min(6, Math.ceil(n / 2)), j = 0; left > 0 && hosts.length && j < 8; j++) {
          const b = hosts[(i + j) % hosts.length], take = Math.min(left, 3);
          const h = this.near(b.x, b.z, sizeOf(b), b.rot, farmland);
          if (h) src.push({ key: `field-${kind}-${j}`, kind, hx: h[0], hz: h[1], n: take, radius: 2 });
          left -= take;
        }
        i++;
      }
    }
    const at = (c: number) => [(c % N) + 0.5, Math.floor(c / N) + 0.5];
    /** groupes d'une espèce répartis sur une liste de cases */
    const group = (prefix: string, kind: Kind, list: number[], count: number, n: (i: number) => number, radius: number, salt: number) => {
      // le gros gibier reste loin du village dès le Moyen Âge (plus loin encore aux âges industriels), sauf à la Préhistoire
      const vc0 = this.lastAge >= 2 && KEEP_AWAY.has(kind) ? villageCenter(w) : null;
      if (vc0) {
        const far = this.lastAge >= 3 ? 34 : 18;
        const out = list.filter((k) => Math.hypot((k % N) + 0.5 - vc0[0], Math.floor(k / N) + 0.5 - vc0[1]) >= far);
        list = out;
      }
      if (!list.length) return;
      const set = new Set(list);
      for (let i = 0; i < count; i++) {
        const [x, z] = at(this.home(`${prefix}${i}`, list, set, salt + i));
        src.push({ key: `${prefix}${i}`, kind, hx: x, hz: z, n: n(i), radius });
      }
    };
    yield;
    const [mT, mTa, mD, mTr, mM] = meadow;
    const grass = mT.concat(mM), green = mT.concat(mTr), all = mT.concat(mTa, mTr, mM);
    group('sheep', 'sheep', grass, Math.min(12, Math.floor(grass.length / 90)), (i) => 3 + (i % 4), 2.2, 0);
    group('horse', 'horse', green, hasModel('horse') ? Math.min(3, Math.floor(green.length / 260)) : 0, (i) => 3 + (i % 2), 3, 30);
    group('llama', 'llama', mD.concat(mTa.filter((k) => w.cellAvg(k % N, Math.floor(k / N)) > 2)), hasModel('llama') ? Math.min(3, Math.floor((mD.length + mTa.length / 3) / 90)) : 0, () => 3, 2.4, 40);
    group('rabbit', 'rabbit', all, Math.min(40, Math.floor(all.length / 28)), (i) => 1 + (i % 3), 1.6, 50);
    // lapins chapardeurs : un terrier près de chaque potager (jusqu'à 4)
    for (let i = 0; i < Math.min(4, gardens.length); i++) {
      const g = gardens[Math.floor(hash2(i, gardens.length, 61) * gardens.length)];
      const gx = g % N, gz = Math.floor(g / N);
      let spot = -1;
      for (let r = 2; r <= 4 && spot < 0; r++) for (let a = 0; a < 8 && spot < 0; a++) {
        const x = Math.round(gx + Math.cos(a * 0.785) * r), z = Math.round(gz + Math.sin(a * 0.785) * r);
        if (pasture(w, x, z) && !w.road[w.ci(x, z)]) spot = w.ci(x, z);
      }
      if (spot >= 0) { const [x, z] = at(spot); src.push({ key: `raider${i}`, kind: 'rabbit', hx: x, hz: z, n: 2, radius: Math.hypot(gx + 0.5 - x, gz + 0.5 - z) + 1 }); }
    }
    const woods = edge[BIOME_TEMPERATE].concat(edge[BIOME_TAIGA]);
    group('deer', 'deer', woods, Math.min(18, Math.floor(forest.length / 26)), (i) => 2 + (i % 2), 2.5, 80);
    group('fox', 'fox', woods.concat(edge[BIOME_MARSH]), hasModel('fox') ? Math.min(12, Math.floor(woods.length / 22)) : 0, () => 1, 3.2, 90);
    // ours : à l'entrée des grottes et au bout des failles, seuls ou avec leur ourson ; ils rôdent aux alentours de jour
    for (const d of bearDens(w)) src.push({ key: d.key, kind: 'bear', hx: d.x, hz: d.z, n: d.cub ? 2 : 1, radius: 2.4 });
    // zones de vie : chaque espèce rattachée à son biome et à un élément du décor (rochers, lisières, berges, plages)
    const anchors: Record<Anchor, number[][]> = { edge, meadow, rocks, banks: bankB, ponds: pondB, coast };
    const scale = N > 128 ? 2 : 1;
    // plafond par espèce : le nombre que le rendu instancié peut montrer (la même faune, quel que soit l'ordre des biomes)
    const budget = {} as Record<Kind, number>;
    for (const k of KIND_LIST) budget[k] = Math.ceil(SPECS[k].max * 0.7);
    for (const [zi, z] of ZONES.entries()) {
      if (z.needs && !hasModel(z.needs)) continue;
      for (const b of z.biomes) {
        const list = z.anchors.map((a) => anchors[a][b]).find((l) => l.length);
        if (!list) continue;
        // au moins un groupe quand le décor existe, au plus `max` par biome ; et jamais plus que ce que le rendu peut montrer
        let count = Math.min(z.max * scale, Math.max(list.length >= 3 ? 1 : 0, Math.floor(list.length / z.per)));
        while (count > 0 && budget[z.kind] - Array.from({ length: count }, (_, i) => z.n(i)).reduce((s, n) => s + n, 0) < 0) count--;
        for (let i = 0; i < count; i++) budget[z.kind] -= z.n(i);
        group(`z${zi}b${b}-`, z.kind, list, count, z.n, z.radius, z.salt + b * 7);
      }
    }
    group('wolf', 'wolf', edge[BIOME_TAIGA], Math.min(2, Math.floor(edge[BIOME_TAIGA].length / 50)), (i) => 4 - (i % 2), 3.5, 100);
    // alentours du village : quelques groupes des bêtes du biome dans un anneau autour de la place, à l'écart des maisons,
    // pour qu'on en croise sans partir loin
    const vc = villageCenter(w);
    if (vc) {
      const ring: number[][] = [[], [], [], [], []];
      const clear = (cx: number, cz: number) => { for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (w.inCells(cx + dx, cz + dz) && w.occ[w.ci(cx + dx, cz + dz)]) return false; return true; };
      for (const b of [0, 1, 2, 3, 4])
        for (const k of meadow[b].concat(edge[b])) {
          const d = Math.hypot((k % N) + 0.5 - vc[0], Math.floor(k / N) + 0.5 - vc[1]);
          if (d >= VILLAGE_RING[0] && d <= VILLAGE_RING[1] && clear(k % N, Math.floor(k / N))) ring[b].push(k);
        }
      for (const b of [0, 1, 2, 3, 4]) {
        if (ring[b].length < 12) continue;
        const kinds = NEARBY[b].filter((k) => this.shows(k) && nearbyAllowed(k, this.lastAge));
        for (let i = 0; i < Math.min(8, 2 + Math.floor(ring[b].length / 25)) && kinds.length; i++) {
          const kind = kinds[i % kinds.length], n = nearbyGroup(kind);
          if (budget[kind] < n) continue;
          budget[kind] -= n;
          group(`near${b}-${i}-`, kind, ring[b], 1, () => n, 2.6, 400 + b * 13 + i);
        }
      }
    }
    // visiteurs : des bêtes venues près de la vue quand on n'en voit aucune (voir `scout`)
    for (const v of this.visitors) if (nearbyAllowed(v.kind, this.lastAge) && budget[v.kind] >= v.n) { budget[v.kind] -= v.n; src.push(v); }
    group('wolf', 'wolf', edge[BIOME_TAIGA], hasModel('wolf') ? Math.min(2, Math.floor(edge[BIOME_TAIGA].length / 50)) : 0, () => 3, 3.5, 100);
    // grenouilles : surtout au bord des mares et des étangs, et dans les marais
    const ponds = banks.filter(pond), frogBanks = ponds.concat(ponds, banks.filter((k) => w.biome[k] === BIOME_MARSH), banks.filter((_, i) => i % 4 === 0));
    group('frog', 'frog', frogBanks, Math.min(28, Math.floor(frogBanks.length / 5)), (i) => 2 + (i % 2), 1.3, 110);
    group('duck', 'duck', shore, Math.min(14, Math.floor(shore.length / 25)), () => 4, 2.5, 120);
    // oiseaux chanteurs : un par bosquet, ils se posent dans les arbres alentour
    group('song', 'songbird', forest.concat(gardens), Math.min(40, Math.floor(forest.length / 18)), (i) => 2 + (i % 2), 6, 140);
    // abeilles : essaims près des jardins et des prairies fleuries
    const flowery = gardens.concat(mT.filter((_, i) => i % 3 === 0), mTr);
    group('bees', 'bee', flowery, Math.min(9, Math.floor(flowery.length / 45) + Math.min(3, gardens.length)), () => 3, 5, 150);
    group('fly', 'butterfly', gardens.concat(green), Math.min(40, gardens.length + Math.floor(green.length / 70)), () => 1, 0.4, 160);
    group('fish', 'fish', shallows, Math.min(22, Math.floor(shallows.length / 22)), (i) => 5 + (i % 3), 1.3, 200);
    // les grands animaux décrivent de larges boucles : domaine loin des bords de la carte
    const open = (r: number) => deep.filter((k) => { const x = k % N, z = Math.floor(k / N); return x > r && z > r && x < N - 1 - r && z < N - 1 - r; });
    const deepD = open(4), deepW = open(6);
    group('dolphins', 'dolphin', deepD, deepD.length > 40 ? Math.min(3, Math.floor(deepD.length / 300) + 1) : 0, () => 3, 3.2, 230);
    // baleine au large, raies sur les hauts-fonds : seulement avec leurs modèles
    group('whale', 'whale', deepW, deepW.length > 60 && hasModel('whale') ? Math.min(2, Math.floor(deepW.length / 600) + 1) : 0, () => 1, 5, 240);
    group('mantas', 'manta', shallows.length ? shallows : deep, shallows.length + deep.length > 150 && hasModel('manta') ? 2 : 0, () => 2, 2.2, 250);
    // requins : un aileron qui fend la surface, au large
    group('sharks', 'shark', deepD, deepD.length > 80 ? Math.min(3, Math.floor(deepD.length / 900) + 1) : 0, () => 1, 4, 270);
    // la mer devant le village : un groupe de dauphins, une baleine, une raie et des bancs sur le large et les hauts-fonds les
    // plus proches du village (du milieu de la carte avant le feu de camp), pour qu'on les croise sans traverser la carte
    const port = vc ?? [N / 2, N / 2];
    const nearest = (list: number[], spread: number, reach: number) => {
      const d = (k: number) => Math.hypot((k % N) + 0.5 - port[0], Math.floor(k / N) + 0.5 - port[1]);
      let m = Infinity;
      for (const k of list) m = Math.min(m, d(k));
      return m > reach ? [] : list.filter((k) => d(k) <= m + spread);
    };
    const coastD = nearest(deepD, 10, COAST_REACH), coastW = nearest(deepW, 14, COAST_REACH), coastF = nearest(shallows, 12, COAST_REACH);
    group('coastD', 'dolphin', coastD, coastD.length > 8 ? 1 : 0, () => 3, 3.2, 280);
    group('coastW', 'whale', coastW, coastW.length > 12 && hasModel('whale') ? 1 : 0, () => 1, 5, 281);
    group('coastS', 'shark', coastD, coastD.length > 8 ? 1 : 0, () => 1, 3.5, 282);
    group('coastM', 'manta', coastF, coastF.length > 8 && hasModel('manta') ? 1 : 0, () => 2, 2.2, 283);
    group('coastF', 'fish', coastF, Math.min(4, Math.floor(coastF.length / 10)), (i) => 6 + (i % 3), 1.3, 284);
    // chauves-souris : trois par grotte, de sortie la nuit
    for (const k of caves.slice(0, 8)) { const [x, z] = at(k); src.push({ key: `bat${k}`, kind: 'bat', hx: x, hz: z, n: 3, radius: 0.8 }); }
    for (let i = 0; i < 4; i++) src.push({ key: `birds${i}`, kind: 'bird', hx: N / 2, hz: N / 2, n: 5 + i, radius: (12 + i * 6) * (N / 48) * 0.8 });
    // et deux vols plus petits qui tournent au-dessus du village
    if (vc) for (let i = 0; i < 3; i++) src.push({ key: `vbirds${i}`, kind: 'bird', hx: vc[0], hz: vc[1], n: 4 + i, radius: 9 + i * 6 });
    // montagnes : bouquetins sur les hauts pâturages, aigles qui tournoient autour des plus hauts sommets
    yield;
    const alp: number[] = [], tops: number[] = [], volcanoes: number[] = [];
    for (let k = 0; k < N * N; k++) if (w.veg[k] === VEG_VOLCANO) volcanoes.push(k);
    for (let k = 0; k < N * N; k++) {
      const cx = k % N, cz = Math.floor(k / N);
      // bouquetins et aigles : sur les montagnes, pas sur les flancs d'un volcan
      if (!volcanoes.every((v) => Math.hypot((v % N) - cx, Math.floor(v / N) - cz) > 14)) continue;
      if (alpine(w, cx, cz)) alp.push(k);
      if (w.cellAvg(cx, cz) > 7) tops.push(k);
    }
    group('ibex', 'ibex', alp, Math.min(N > 128 ? 8 : 5, Math.floor(alp.length / 50)), (i) => 2 + (i % 2), 3, 260);
    tops.sort((a, b) => w.cellAvg(b % N, Math.floor(b / N)) - w.cellAvg(a % N, Math.floor(a / N)));
    const eyries: number[] = [];
    for (const k of tops) {
      if (eyries.length >= (N > 128 ? 5 : 2)) break;
      if (eyries.every((e) => Math.hypot((e % N) - (k % N), Math.floor(e / N) - Math.floor(k / N)) > 14)) eyries.push(k);
    }
    for (const [i, k] of eyries.entries()) { const [x, z] = at(k); src.push({ key: `eagle${i}`, kind: 'eagle', hx: x, hz: z, n: 1 + (i % 2), radius: 3.5 + (i % 3) }); }
    // mouettes : au-dessus des rivages
    group('gull', 'gull', shore, Math.min(N > 128 ? 9 : 5, Math.floor(shore.length / 60)), () => 3, 3, 270);

    yield;
    // réconciliation : on garde les bêtes existantes, on ajoute ou retire l'écart
    const want = new Map(src.map((s) => [s.key, s]));
    for (const c of this.critters) if ((!want.has(c.key) || want.get(c.key)!.kind !== baseKind(c.kind)) && c.actor) { c.actor.mixer.stopAllAction(); this.group.remove(c.actor.root); }
    this.critters = this.critters.filter((c) => want.has(c.key) && want.get(c.key)!.kind === baseKind(c.kind));
    const have = new Map<string, Critter[]>();
    for (const c of this.critters) { const l = have.get(c.key) ?? []; l.push(c); have.set(c.key, l); }
    for (const c of this.critters) if (c.prey && !want.has(c.prey.key)) c.prey = null;
    for (const s of src) {
      const list = have.get(s.key) ?? [];
      for (const c of list) { c.hx = s.hx; c.hz = s.hz; c.radius = s.radius; }
      for (let i = list.length; i < s.n; i++) {
        const kind: Kind = s.kind === 'duck' && i > 0 ? 'duckling' : s.kind;
        const sp = SPECS[kind];
        const c: Critter = {
          kind, key: s.key, x: s.hx, y: 0, z: s.hz, heading: this.rnd() * 6.28, pitch: 0, tx: s.hx, tz: s.hz,
          moving: false, timer: this.rnd() * 3, phase: this.rnd() * 10, hx: s.hx, hz: s.hz, radius: s.radius,
          col: sp.colors[Math.floor(this.rnd() * sp.colors.length)], size: (sp.scale ?? 1) * (0.9 + this.rnd() * 0.2),
          hidden: false, sleeping: false, leader: kind === 'duckling' || ((kind === 'wolf' || kind === 'bear') && i > 0) ? list[kind === 'duckling' ? i - 1 : 0] : null, slot: i, actor: null,
          run: false, threat: null, fear: 0, prey: null, chase: 0, hunger: 20 + this.rnd() * 40, dead: 0, act: null, actT: 0, toDrink: false,
          thirst: 30 + this.rnd() * 90, ang: this.rnd() * 6.28, rush: 0, ax: s.hx, ay: 0, az: s.hz, by: 0, flight: 1, flightT: 1, perched: false, flap: 1,
        };
        // l'ourson suit sa mère
        if (kind === 'bear' && i > 0) c.size *= 0.55;
        const md = MODELS[kind];
        if (BEAST_KINDS.has(kind)) {
          // bête articulée dessinée par le jeu : sa robe suit sa couleur, sa nuance varie un peu
          const coat = Math.max(0, sp.colors.indexOf(c.col));
          c.actor = makeBeast(kind as BeastKind, coat, c.size, 0.9 + this.rnd() * 0.16);
          c.actorKey = `beast:${kind}:${coat}`; c.actorSize = c.size;
          this.group.add(c.actor.root);
          c.actor.mixer.setTime(this.rnd() * 3);
        } else if (md && !PROCEDURAL.has(kind)) {
          const name = md.pick ? md.pick[Math.floor(hash2(s.key.length, s.key.charCodeAt(s.key.length - 1), 9) * md.pick.length)] : i === 0 && md.lead ? md.lead : md.name;
          const size = md.length * (0.9 + this.rnd() * 0.2);
          c.actor = makeActor(name, size);
          c.actorKey = `model:${name}`; c.actorSize = size;
          if (c.actor) { this.group.add(c.actor.root); c.actor.mixer.setTime(this.rnd() * 3); }
        }
        // une bête qu'une expédition vient de ramener (sans place à l'enclos) part de là où l'équipe l'a laissée, et gagne son
        // pré à pied (voir `claimArrival`) ; les autres apparaissent dispersées autour de leur domaine
        const arr = s.key.startsWith('herd-') && HERDS.has(kind) ? claimArrival(kind as HerdKind, s.hx, s.hz) : null;
        if (arr) { c.x = c.tx = arr.x; c.z = c.tz = arr.z; c.heading = arr.heading; }
        else for (let k = 0; k < 6 && kind !== 'duckling' && kind !== 'bird'; k++) {
          const a = this.rnd() * 6.28, r = this.rnd() * s.radius * 0.6;
          const x = s.hx + Math.cos(a) * r, z = s.hz + Math.sin(a) * r;
          if (sp.ok(this.world, Math.floor(x), Math.floor(z))) { c.x = c.tx = x; c.z = c.tz = z; break; }
        }
        if (kind === 'duckling' && c.leader) { c.x = c.leader.x - Math.sin(c.leader.heading) * 0.07; c.z = c.leader.z - Math.cos(c.leader.heading) * 0.07; }
        c.ax = c.x; c.az = c.z;
        list.push(c);
        this.critters.push(c);
      }
    }
  }

  /** L'espèce a de quoi s'afficher : forme instanciée, bête articulée ou modèle chargé */
  private shows(k: Kind) {
    const md = MODELS[k];
    return !!SPECS[k].geo || BEAST_KINDS.has(k as BeastKind) || (!!md && hasModel(md.name));
  }

  /**
   * Toujours des bêtes à voir : toutes les trois secondes, si la vue est assez proche du sol et qu'on compte moins de
   * `SEEN_MIN` bêtes à terre dans le champ près de son centre, un petit groupe du biome (un banc de poissons sur l'eau)
   * s'installe à quatre à huit cases, juste hors du champ de préférence, et vient y errer ; au plus `VISITORS` groupes, les
   * plus anciens repartent
   */
  private scout(dt: number, camera: THREE.Camera) {
    this.scoutTimer -= dt;
    if (this.scoutTimer > 0) return;
    this.scoutTimer = 3;
    const w = this.world, cam = camera.position, dir = camera.getWorldDirection(this.look);
    if (dir.y > -0.05) return;
    // centre de la vue : là où son axe rencontre le sol (à peu près)
    const t = (SEA + 0.5 - cam.y) / dir.y, fx = cam.x + dir.x * t, fz = cam.z + dir.z * t;
    if (!w.inCells(Math.floor(fx), Math.floor(fz))) return;
    // bêtes à terre (ou dans l'eau) dans le champ, pas trop loin
    let seen = 0;
    for (const c of this.critters) {
      if (c.hidden || c.dead > 0 || SPECS[c.kind].flap || Math.abs(c.x - fx) > SEEN_R * 2 || Math.abs(c.z - fz) > SEEN_R * 2) continue;
      this.sphere.center.set(c.x, SWIMMERS.has(c.kind) ? c.y : w.hAt(c.x, c.z), c.z);
      this.sphere.radius = 0.1;
      if (this.frustum.intersectsSphere(this.sphere) && Math.hypot(c.x - fx, c.z - fz) < SEEN_R) seen++;
    }
    if (!wantsVisitors(seen, Math.hypot(cam.x - fx, cam.y - SEA, cam.z - fz))) return;
    // les visiteurs déjà là restent : on ne rappelle que le plus ancien, s'il est loin de la vue
    if (this.visitors.length >= VISITORS && Math.hypot(this.visitors[0].hx - fx, this.visitors[0].hz - fz) < 25) return;
    const wet = water(w, Math.floor(fx), Math.floor(fz)), ok = (cx: number, cz: number) => (wet ? water(w, cx, cz) : wild(w, cx, cz));
    // domaine dans le champ, à quelques cases du centre ; ils entrent par le bord, deux ou trois cases plus loin
    let best: [number, number] | null = null, inView = false;
    for (let i = 0; i < 24 && !inView; i++) {
      const a = this.rnd() * 6.28, r = 1.5 + this.rnd() * 3, x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r, cx = Math.floor(x), cz = Math.floor(z);
      if (!ok(cx, cz)) continue;
      this.sphere.center.set(x, w.hAt(x, z), z);
      this.sphere.radius = 0.3;
      inView = this.frustum.intersectsSphere(this.sphere);
      if (inView || !best) best = [cx + 0.5, cz + 0.5];
    }
    if (!best) return;
    let kind: Kind = 'fish';
    // sur l'eau libre, un visiteur sur deux est un groupe de dauphins (un banc de poissons, sous la surface, se voit mal)
    if (wet && this.visitSerial % 2 === 0 && [[3, 0], [-3, 0], [0, 3], [0, -3]].every(([dx, dz]) => water(w, Math.floor(best![0] + dx), Math.floor(best![1] + dz)))) kind = 'dolphin';
    if (!wet) {
      const list = NEARBY[w.biome[w.ci(Math.floor(best[0]), Math.floor(best[1]))]].filter((k) => this.shows(k) && nearbyAllowed(k, this.lastAge));
      if (!list.length) return;
      kind = list[this.visitSerial % list.length];
    }
    const key = `visit${this.visitSerial++}`;
    this.visitors.push({ key, kind, hx: best[0], hz: best[1], n: kind === 'fish' ? 6 : kind === 'dolphin' ? 3 : nearbyGroup(kind), radius: 3 });
    if (this.visitors.length > VISITORS) this.visitors.shift();
    this.refresh();
    this.refreshTimer = 0.5;
    this.lastVersion = w.version;
    // les nouveaux venus arrivent à pied de l'extérieur du champ (les poissons, eux, sont déjà là)
    if (wet) return;
    const ux = best[0] - fx, uz = best[1] - fz, l = Math.hypot(ux, uz) || 1;
    for (const c of this.critters) {
      if (c.key !== key) continue;
      for (const back of [3.5, 2.5, 1.5]) {
        const x = best[0] + (ux / l) * back + (this.rnd() - 0.5), z = best[1] + (uz / l) * back + (this.rnd() - 0.5);
        if (!ok(Math.floor(x), Math.floor(z))) continue;
        c.x = c.ax = x; c.z = c.az = z;
        c.tx = best[0] + (this.rnd() - 0.5); c.tz = best[1] + (this.rnd() - 0.5);
        c.heading = Math.atan2(c.tx - x, c.tz - z);
        c.moving = true;
        break;
      }
    }
  }

  // ---------- Comportements ----------

  update(dt: number, elapsed: number, hour: number, season: number, rain: number, age: number, camera?: THREE.Camera) {
    const w = this.world;
    this.refreshTimer -= dt;
    // la sculpture change le monde à chaque image : recensement au plus deux fois par seconde
    if ((w.version !== this.lastVersion && this.refreshTimer <= 0) || age !== this.lastAge) {
      const first = this.lastVersion < 0;
      this.lastVersion = w.version; this.lastAge = age; this.refreshTimer = 0.5;
      // la première fois d'un coup ; ensuite, quelques millisecondes par image
      if (first) this.refresh(); else this.refreshing = this.refreshGen();
    }
    if (this.refreshing) {
      const t0 = performance.now();
      let r = this.refreshing.next();
      while (!r.done && performance.now() - t0 < 4) r = this.refreshing.next();
      if (r.done) this.refreshing = null;
    }
    this.t += dt;
    this.uTime.value = this.t;
    const night = hour < 6 || hour > 21;
    const people = this.people().filter((p) => !p.hidden), cam = camera?.position;
    this.hunters.length = 0;
    this.leads.clear();
    for (const c of this.critters) {
      if (PREY[c.kind]) this.hunters.push(c);
      if (c.slot === 0 && !this.leads.has(c.key)) this.leads.set(c.key, c);
    }
    for (const c of this.critters) {
      if (c.dead > 0) {
        // proie attrapée : elle revient au domaine un peu plus tard
        c.dead -= dt;
        c.hidden = true;
        if (c.dead <= 0) { c.x = c.tx = c.hx; c.z = c.tz = c.hz; c.moving = c.run = false; c.fear = 0; c.threat = null; }
        continue;
      }
      // loin de la vue (une image sur trois) ou hors champ (une sur dix), la bête ne réfléchit que de temps en temps, à plus
      // grands pas ; le temps en retard est rattrapé dès son retour dans le champ, sans à-coup
      let step = dt;
      if (cam && c.kind !== 'duckling') {
        // la cadence (champ, distance) n'est revue qu'une image sur quatre : des milliers de bêtes, la plupart hors champ
        if (c.every === undefined || (this.frame + c.slot) % 4 === 0) c.every = this.pace(c, cam);
        const every = c.run ? 1 : c.every;
        c.lag = (c.lag ?? 0) + dt;
        if (every > 1 && (this.frame + c.slot + c.key.length) % every) continue;
        step = Math.min(0.25, c.lag);
        c.lag = 0;
      }
      if (c.kind === 'bird') this.fly(c, night || rain > 0.6);
      else if (c.kind === 'eagle') this.soar(c, night || rain > 0.7);
      else if (c.kind === 'gull') this.glide(c, night || rain > 0.7);
      else if (c.kind === 'songbird') this.songbird(c, step, night || rain > 0.6 || season === 3, people);
      else if (c.kind === 'bee') this.bee(c, step, night || rain > 0.3 || season === 3);
      else if (c.kind === 'butterfly') this.flutter(c, night || season > 1 || rain > 0.3);
      else if (c.kind === 'bat') this.flutter(c, !night, 0.6, 1.9);
      else if (SWIMMERS.has(c.kind)) this.swim(c, step, season);
      else if (c.kind === 'duckling') this.follow(c, dt);
      else this.walk(c, step, night, season, people);
    }
    if (camera) this.scout(dt, camera);
    this.life(dt);
    this.render(elapsed, dt, camera);
  }

  /**
   * Cadence de réflexion d'une bête : chaque image près de la vue, une sur trois au loin (à terre ou dans l'eau ; les vols,
   * calculés d'après l'heure, coûtent peu), une sur dix hors du champ de l'image précédente (avec une marge)
   */
  private pace(c: Critter, cam: THREE.Vector3) {
    const fly = !!SPECS[c.kind].flap;
    this.sphere.center.set(c.x, fly || SWIMMERS.has(c.kind) ? c.y : this.world.hAt(c.x, c.z), c.z);
    this.sphere.radius = 3;
    if (!this.frustum.intersectsSphere(this.sphere)) return 10;
    return !fly && (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 > FAR_WALK * FAR_WALK ? 3 : 1;
  }

  /** Prédateurs (et villageois) proches dont l'animal a peur */
  private danger(c: Critter, people: Person[]): { x: number; z: number } | null {
    const r = SPECS[c.kind].flee;
    if (!r) return null;
    const al = this.alarm;
    if (al && Math.hypot(c.x - al.x, c.z - al.z) < al.r) return al;
    let best: { x: number; z: number } | null = null, bd = r;
    for (const o of this.hunters) {
      if (o.dead > 0 || o.hidden || !PREY[o.kind]?.kinds.includes(c.kind)) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d < bd) { bd = d; best = o; }
    }
    // le gibier se méfie aussi des villageois (pas les bêtes de la ferme)
    if (!best && WARY.has(c.kind)) {
      for (const p of people) { const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < 1.3 && d < bd) { bd = d; best = p; } }
    }
    return best;
  }

  /** Cherche une cible praticable dans la direction voulue, en s'en écartant peu à peu si elle est bloquée */
  private steer(c: Critter, dir: number, dist: number) {
    const sp = SPECS[c.kind];
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
      const a = dir + off, tx = c.x + Math.sin(a) * dist, tz = c.z + Math.cos(a) * dist;
      if (sp.ok(this.world, Math.floor(tx), Math.floor(tz))) { c.tx = tx; c.tz = tz; c.moving = true; return true; }
    }
    return false;
  }

  private walk(c: Critter, dt: number, night: boolean, season: number, people: Person[]) {
    const w = this.world, sp = SPECS[c.kind];
    const nocturnal = c.kind === 'fox' || c.kind === 'wolf' || c.kind === 'frog';
    // les ours regagnent leur grotte la nuit et pour l'hiver ; lézards, tortues et crocodiles s'enterrent l'hiver
    const den = c.kind === 'bear' && (night || season === 3);
    c.hidden = (c.kind === 'hen' && night) || ((c.kind === 'duck' || c.kind === 'frog' || c.kind === 'lizard' || c.kind === 'turtle' || c.kind === 'croc') && season === 3) || (c.kind === 'lizard' && night) || den;
    if (den) { c.x = c.tx = c.hx; c.z = c.tz = c.hz; c.moving = c.run = false; c.prey = null; c.act = null; c.toDrink = false; }
    c.sleeping = night && c.kind !== 'duck' && !nocturnal;
    // un bâtiment ou de l'eau sous les pattes : retour au domaine
    if (!sp.ok(w, Math.floor(c.x), Math.floor(c.z))) { c.x = c.tx = c.hx; c.z = c.tz = c.hz; c.moving = c.run = false; c.prey = null; c.act = null; }
    if (c.hidden) return;
    c.hunger -= dt;
    c.thirst -= dt;

    // ---- danger : fuite en courant, et le troupeau détale avec
    const threat = this.danger(c, people);
    if (threat) {
      if (c.fear <= 0) for (const o of this.critters) if (o !== c && o.key === c.key && Math.hypot(o.x - c.x, o.z - c.z) < 3) { o.fear = Math.max(o.fear, 2); o.threat = threat; }
      c.fear = 2.5; c.threat = threat; c.sleeping = false;
    }
    if (c.fear > 0 && c.threat) {
      c.fear -= dt;
      c.act = null; c.toDrink = false; c.prey = null;
      c.run = true;
      c.timer -= dt;
      if (!c.moving || c.timer <= 0 || Math.hypot(c.tx - c.x, c.tz - c.z) < 0.2) {
        c.timer = 0.4;
        // les lapins zigzaguent
        const away = Math.atan2(c.x - c.threat.x, c.z - c.threat.z) + (c.kind === 'rabbit' ? (this.rnd() - 0.5) * 1.4 : (this.rnd() - 0.5) * 0.4);
        if (!this.steer(c, away, 1.5)) c.moving = false;
      }
      if (c.fear <= 0) { c.run = false; c.threat = null; c.timer = 1 + this.rnd() * 2; }
    } else if (c.sleeping) { c.moving = false; c.run = false; c.pitch = 0; return; }

    // ---- prédateur : repère une proie, la poursuit, la mange
    const hunt = PREY[c.kind];
    if (hunt && c.fear <= 0 && !c.act) {
      if (!c.prey && c.hunger <= 0) {
        // la meute chasse la proie du chef
        if (c.leader?.prey) { c.prey = c.leader.prey; c.chase = c.leader.chase; }
        else {
          let bd = hunt.sight;
          for (const o of this.critters) {
            if (o.dead > 0 || o.hidden || !hunt.kinds.includes(o.kind)) continue;
            const d = Math.hypot(o.x - c.x, o.z - c.z);
            if (d < bd) { bd = d; c.prey = o; }
          }
          if (c.prey) c.chase = 7 + this.rnd() * 3;
          else c.hunger = 4 + this.rnd() * 6;
        }
      }
      if (c.prey) {
        const p = c.prey;
        c.chase -= dt;
        const d = Math.hypot(p.x - c.x, p.z - c.z);
        if (p.dead > 0 || p.hidden || c.chase <= 0 || d > hunt.sight * 1.5) {
          // bredouille : il se repose avant de recommencer
          c.prey = null; c.run = false; c.hunger = 45 + this.rnd() * 45;
        } else if (d < 0.14 * c.size + 0.06) {
          // prise : la proie disparaît un moment, le prédateur mange sur place
          p.dead = 90 + this.rnd() * 60; p.hidden = true;
          for (const o of this.critters) if (o.prey === p) { o.prey = null; o.run = false; o.hunger = 120 + this.rnd() * 90; o.act = 'eat'; o.actT = 6; o.moving = false; }
        } else {
          c.run = true; c.moving = true;
          c.tx = p.x; c.tz = p.z;
        }
      }
    }

    // ---- boire : de temps en temps, une halte au bord de l'eau
    if (DRINKERS.has(c.kind) && c.thirst <= 0 && !c.run && !c.act && !c.toDrink) {
      c.thirst = 60 + this.rnd() * 90;
      const spot = this.drinkSpot(c);
      if (spot) { c.tx = spot[0]; c.tz = spot[1]; c.moving = true; c.toDrink = true; }
    }

    // ---- action sur place (manger, boire)
    if (c.act) {
      c.actT -= dt;
      c.moving = false;
      c.phase += dt * 2.5;
      c.pitch += (0.2 - c.pitch) * Math.min(1, dt * 6);
      if (c.act === 'drink') { const ws = this.waterDir(c); if (ws !== null) turn(c, ws, dt * 4); }
      if (c.actT <= 0) { c.act = null; c.timer = 1 + this.rnd() * 2; }
      return;
    }

    const speed = c.run ? sp.run ?? sp.speed * 2 : sp.speed;
    c.phase += dt * (c.moving ? (c.run ? 16 : 11) : 2.5);
    if (!c.moving) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = 1;
        // meute : les loups suivent leur chef ; l'ourson suit sa mère
        const L = c.kind === 'wolf' || c.kind === 'bear' ? c.leader : null;
        const hx = L ? L.x : c.hx, hz = L ? L.z : c.hz, rad = L ? 0.9 : c.radius;
        // les herbivores préfèrent l'herbe intacte, les lapins chapardeurs visent le potager
        let best = -1, bx = 0, bz = 0;
        for (let k = 0; k < 6; k++) {
          const a = this.rnd() * 6.28, r = (0.3 + this.rnd() * 0.7) * rad;
          const tx = hx + Math.cos(a) * r, tz = hz + Math.sin(a) * r, cx = Math.floor(tx), cz = Math.floor(tz);
          if (!sp.ok(w, cx, cz)) continue;
          const cell = w.ci(cx, cz);
          let score = 1 + this.rnd() * 0.3;
          if (GRAZERS.has(c.kind)) score -= w.grazed[cell];
          if (c.kind === 'rabbit' && c.key.startsWith('raider') && w.veg[cell] === 3) score += 1;
          if (score > best) { best = score; bx = tx; bz = tz; }
        }
        if (best >= 0) { c.tx = bx; c.tz = bz; c.moving = true; }
      }
    } else {
      const dx = c.tx - c.x, dz = c.tz - c.z, dist = Math.hypot(dx, dz), step = speed * dt;
      if (dist <= step) {
        c.x = c.tx; c.z = c.tz; c.moving = false; c.timer = sp.idle[0] + this.rnd() * (sp.idle[1] - sp.idle[0]);
        if (c.toDrink) { c.toDrink = false; c.act = 'drink'; c.actT = 4 + this.rnd() * 3; }
      } else {
        const nx = c.x + (dx / dist) * step, nz = c.z + (dz / dist) * step;
        // une bête égarée là où elle n'a rien à faire (une rue) peut en sortir
        if (sp.ok(w, Math.floor(nx), Math.floor(nz)) || !sp.ok(w, Math.floor(c.x), Math.floor(c.z))) { c.x = nx; c.z = nz; } else { c.moving = false; c.toDrink = false; c.timer = 0.5 + this.rnd(); }
        turn(c, Math.atan2(dx, dz), dt * (c.run ? 9 : 6));
      }
    }
    if (!c.moving && c.fear <= 0 && !c.prey) c.run = false;
    // broute ou picore à l'arrêt
    const grazing = !c.moving && !!sp.graze && Math.sin(c.phase * 0.5) > -0.3;
    const target = c.moving ? 0 : sp.peck ? Math.max(0, Math.sin(c.phase * 3)) * 0.6 : grazing ? sp.graze! : 0;
    c.pitch += (target - c.pitch) * Math.min(1, dt * 6);
    // l'herbe broutée raccourcit (les lapins grignotent aussi les potagers)
    if (GRAZERS.has(c.kind) && !c.moving && (grazing || c.kind === 'rabbit')) {
      const k = w.ci(Math.floor(c.x), Math.floor(c.z));
      w.grazed[k] = Math.min(1, w.grazed[k] + dt * (w.veg[k] === 3 ? 0.03 : 0.012));
    }
  }

  /** Point de la berge le plus proche (à moins de 7 cases), légèrement avancé vers l'eau */
  private drinkSpot(c: Critter): [number, number] | null {
    const w = this.world, sp = SPECS[c.kind], cx = Math.floor(c.x), cz = Math.floor(c.z);
    let best: [number, number] | null = null, bd = 7;
    for (let dz = -7; dz <= 7; dz++)
      for (let dx = -7; dx <= 7; dx++) {
        const x = cx + dx, z = cz + dz;
        if (!w.inCells(x, z) || w.waterDist[w.ci(x, z)] !== 1 || !sp.ok(w, x, z)) continue;
        const d = Math.hypot(dx, dz);
        if (d < bd) { bd = d; best = [x + 0.5, z + 0.5]; }
      }
    return best;
  }

  /** Cap vers l'eau voisine (pour boire face à elle) */
  private waterDir(c: Critter): number | null {
    const w = this.world, cx = Math.floor(c.x), cz = Math.floor(c.z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]])
      if (w.inCells(cx + dx, cz + dz) && w.isWaterCell(cx + dx, cz + dz)) return Math.atan2(dx, dz);
    return null;
  }

  /** Les canetons suivent en file indienne */
  private follow(c: Critter, dt: number) {
    const L = c.leader!;
    c.hidden = L.hidden;
    const fx = L.x - Math.sin(L.heading) * 0.065, fz = L.z - Math.cos(L.heading) * 0.065;
    const dx = fx - c.x, dz = fz - c.z;
    const k = Math.min(1, dt * 3);
    c.x += dx * k; c.z += dz * k;
    if (Math.hypot(dx, dz) > 0.004) turn(c, Math.atan2(dx, dz), dt * 6);
    c.phase += dt * 3;
  }

  /** Nuée en V qui tourne au-dessus de la carte */
  private fly(c: Critter, hide: boolean) {
    c.hidden = hide;
    const f = Number(c.key.slice(5)) || 0;
    const om = (f % 2 ? -1 : 1) * 0.06, th = this.t * om + f * 2.1;
    const R = c.radius;
    const dx = -Math.sin(th) * R * om, dz = Math.cos(th) * R * 0.8 * om;
    const h = Math.atan2(dx, dz);
    const side = c.slot === 0 ? 0 : (c.slot % 2 ? 1 : -1), rank = Math.ceil(c.slot / 2);
    const ox = side * rank * 0.55 + Math.sin(this.t * 1.1 + c.slot) * 0.08, oz = -rank * 0.45;
    c.x = N / 2 + Math.cos(th) * R + ox * Math.cos(h) + oz * Math.sin(h);
    c.z = N / 2 + Math.sin(th) * R * 0.8 - ox * Math.sin(h) + oz * Math.cos(h);
    c.y = this.flockAltitude(c.key, R) + f * 1.2 + Math.sin(this.t * 0.8 + c.slot * 0.7) * 0.15;
    c.heading = h;
    c.pitch = 0;
  }

  /** Altitude d'un vol : au-dessus des plus hauts sommets survolés par sa boucle */
  private flockAltitude(key: string, R: number) {
    let alt = this.flockAlt.get(key);
    if (alt === undefined) {
      let top = 0;
      for (let a = 0; a < Math.PI * 2; a += 0.1)
        for (const k of [0.8, 1, 1.2]) top = Math.max(top, this.world.hAt(N / 2 + Math.cos(a) * R * k, N / 2 + Math.sin(a) * R * 0.8 * k));
      alt = Math.max(6.5, top + 2.5);
      this.flockAlt.set(key, alt);
    }
    return alt;
  }

  /** Aigle : grands cercles planés autour d'un sommet, quelques battements d'ailes de temps en temps */
  private soar(c: Critter, hide: boolean) {
    c.hidden = hide;
    const dir = c.slot % 2 ? -1 : 1, a = this.t * (0.16 + c.slot * 0.05) * dir + c.phase;
    const R = c.radius * (1 + c.slot * 0.4) * (0.9 + 0.1 * Math.sin(this.t * 0.2 + c.phase));
    c.x = c.hx + Math.cos(a) * R; c.z = c.hz + Math.sin(a) * R;
    c.y = this.world.hAt(c.hx, c.hz) + 2.4 + c.slot * 0.8 + Math.sin(this.t * 0.3 + c.phase) * 0.4;
    c.heading = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
    c.pitch = 0;
    c.flap = Math.sin(this.t * 0.5 + c.phase) > 0.8 ? 1 : 0.15;
  }

  /** Mouette : vire au-dessus du rivage, monte et descend au gré du vent */
  private glide(c: Critter, hide: boolean) {
    c.hidden = hide;
    const a = this.t * (0.35 + (c.slot % 3) * 0.08) + c.slot * 2.1 + c.phase;
    const R = c.radius * (0.7 + 0.3 * Math.sin(this.t * 0.2 + c.slot));
    c.x = c.hx + Math.cos(a) * R; c.z = c.hz + Math.sin(a) * R * 0.8;
    c.y = Math.max(0, this.world.hAt(c.x, c.z)) + 1.5 + c.slot * 0.35 + Math.sin(this.t * 0.9 + c.slot) * 0.5;
    c.heading = Math.atan2(-Math.sin(a), Math.cos(a) * 0.8);
    c.pitch = 0;
    c.flap = Math.sin(this.t * 0.8 + c.slot * 1.7) > 0.3 ? 1 : 0.2;
  }

  /** Perchoirs (cimes des arbres) autour d'un point */
  private perchesNear(x: number, z: number, r: number) {
    const out: number[] = [];
    const c0 = Math.max(0, Math.floor((x - r) / CH)), c1 = Math.min(NC - 1, Math.floor((x + r) / CH));
    const r0 = Math.max(0, Math.floor((z - r) / CH)), r1 = Math.min(NC - 1, Math.floor((z + r) / CH));
    for (let cz = r0; cz <= r1; cz++)
      for (let cx = c0; cx <= c1; cx++) {
        const list = this.veg.perches[cz * NC + cx];
        for (let i = 0; i < list.length; i += 3) if (Math.abs(list[i] - x) < r && Math.abs(list[i + 2] - z) < r) out.push(list[i], list[i + 1], list[i + 2]);
      }
    return out;
  }

  private flowersNear(x: number, z: number, r: number) {
    const out: number[] = [];
    const c0 = Math.max(0, Math.floor((x - r) / CH)), c1 = Math.min(NC - 1, Math.floor((x + r) / CH));
    const r0 = Math.max(0, Math.floor((z - r) / CH)), r1 = Math.min(NC - 1, Math.floor((z + r) / CH));
    for (let cz = r0; cz <= r1; cz++)
      for (let cx = c0; cx <= c1; cx++) {
        const list = this.veg.flowers[cz * NC + cx];
        for (let i = 0; i < list.length; i += 3) if (Math.abs(list[i] - x) < r && Math.abs(list[i + 2] - z) < r) out.push(list[i], list[i + 1], list[i + 2]);
      }
    return out;
  }

  /** Vol en arc de cercle vers (bx, by, bz) */
  private takeOff(c: Critter, bx: number, by: number, bz: number, speed: number) {
    c.ax = c.x; c.ay = c.y; c.az = c.z;
    c.tx = bx; c.by = by; c.tz = bz;
    c.flight = 0;
    c.flightT = Math.max(0.6, Math.hypot(bx - c.x, bz - c.z) / speed);
    c.perched = false;
  }

  private airborne(c: Critter, dt: number, lift: number) {
    c.flight = Math.min(1, c.flight + dt / c.flightT);
    const u = c.flight, e = u * u * (3 - 2 * u);
    const x = c.ax + (c.tx - c.ax) * e, z = c.az + (c.tz - c.az) * e;
    const y = c.ay + (c.by - c.ay) * e + Math.sin(Math.PI * u) * lift;
    if (Math.hypot(x - c.x, z - c.z) > 1e-4) c.heading = Math.atan2(x - c.x, z - c.z);
    c.x = x; c.y = y; c.z = z;
    return c.flight >= 1;
  }

  /** Oiseau chanteur : posé à la cime d'un arbre, il s'envole vers un autre perchoir, plus loin s'il a eu peur */
  private songbird(c: Critter, dt: number, hide: boolean, people: Person[]) {
    c.hidden = hide;
    if (hide) return;
    c.phase += dt;
    if (c.perched) {
      c.flap = Math.max(0, c.flap - dt * 4);
      c.timer -= dt;
      // sautille et tourne la tête de temps en temps
      if (Math.sin(c.phase * 1.7 + c.slot) > 0.97) c.heading += (this.rnd() - 0.5) * 1.2;
      // un volcan qui gronde fait aussi s'envoler les oiseaux
      const al = this.alarm;
      let scared = !!al && Math.hypot(al.x - c.x, al.z - c.z) < al.r;
      if (!scared) for (const o of this.critters) if ((o.run || PREY[o.kind]) && !o.hidden && o.dead <= 0 && Math.hypot(o.x - c.x, o.z - c.z) < 1.6) { scared = true; break; }
      if (!scared) for (const p of people) if (Math.hypot(p.x - c.x, p.z - c.z) < 0.9) { scared = true; break; }
      if (c.timer <= 0 || scared) {
        const list = this.perchesNear(c.hx, c.hz, c.radius);
        if (list.length) {
          // effrayé : un perchoir éloigné ; sinon un arbre voisin
          let pick = -1;
          for (let k = 0; k < 6; k++) {
            const i = Math.floor(this.rnd() * (list.length / 3)) * 3, d = Math.hypot(list[i] - c.x, list[i + 2] - c.z);
            if (d > 0.3 && (!scared || d > 2.5)) { pick = i; break; }
          }
          if (pick >= 0) this.takeOff(c, list[pick], list[pick + 1], list[pick + 2], scared ? 3.2 : 2);
        }
        c.timer = SPECS.songbird.idle[0] + this.rnd() * (SPECS.songbird.idle[1] - SPECS.songbird.idle[0]);
      }
      return;
    }
    c.flap = Math.min(1, c.flap + dt * 6);
    if (c.flight >= 1) {
      // premier vol : vers un perchoir au hasard, ou en rond s'il n'y a pas d'arbre
      const list = this.perchesNear(c.hx, c.hz, c.radius);
      if (list.length) {
        const i = Math.floor(this.rnd() * (list.length / 3)) * 3;
        if (!c.y) { c.x = list[i]; c.y = list[i + 1]; c.z = list[i + 2]; c.perched = true; c.timer = this.rnd() * 6; return; }
        this.takeOff(c, list[i], list[i + 1], list[i + 2], 2);
      } else { this.flutter(c, false, 1.2, 0.8); return; }
    }
    if (this.airborne(c, dt, 0.5 + c.flightT * 0.3)) { c.perched = true; c.flap = 1; }
  }

  /** Abeille : de fleur en fleur autour de son essaim ; chaque visite fait fleurir un peu plus la prairie */
  private bee(c: Critter, dt: number, hide: boolean) {
    c.hidden = hide;
    if (hide) return;
    c.flap = 1;
    if (c.perched) {
      // butine : petit vol stationnaire au-dessus de la fleur
      c.timer -= dt;
      c.y = c.by + 0.04 + Math.sin(this.t * 9 + c.slot) * 0.01;
      c.x = c.tx + Math.sin(this.t * 5 + c.slot) * 0.02;
      if (c.timer <= 0) {
        const w = this.world, k = w.ci(Math.min(N - 1, Math.floor(c.x)), Math.min(N - 1, Math.floor(c.z)));
        w.bloom[k] = Math.min(1, w.bloom[k] + 0.06);
        c.perched = false;
        c.flight = 1;
      }
      return;
    }
    if (c.flight >= 1) {
      const list = this.flowersNear(c.hx, c.hz, c.radius);
      if (!list.length) { this.flutter(c, false, 0.35, 1.4); return; }
      const i = Math.floor(this.rnd() * (list.length / 3)) * 3;
      if (!c.y) { c.x = list[i]; c.z = list[i + 2]; c.y = list[i + 1] + 0.3; }
      this.takeOff(c, list[i], list[i + 1], list[i + 2], 1.3);
    }
    if (this.airborne(c, dt, 0.25)) { c.perched = true; c.timer = 1.2 + this.rnd() * 2; }
    c.y += Math.sin(this.t * 13 + c.slot * 2) * 0.006;
  }

  /**
   * Nage : le banc (ou le groupe de dauphins) tourne autour de son domaine en formation ;
   * de temps en temps un poisson saute hors de l'eau, les dauphins font des bonds réguliers ;
   * les dauphins traquent le banc le plus proche, qui s'enfuit en accélérant
   */
  private swim(c: Critter, dt: number, season: number) {
    const w = this.world, dolphin = c.kind === 'dolphin', shark = c.kind === 'shark', big = c.kind === 'whale' || c.kind === 'manta';
    if (c.slot === 0 && (dolphin || shark || c.kind === 'fish')) this.hunt(c, dt);
    const L = c.slot === 0 ? c : this.leads.get(c.key) ?? c;
    if (L !== c) { c.hx = L.hx; c.hz = L.hz; c.rush = L.rush; }
    const dir = hash2(Math.floor(c.key.length * 7 + c.key.charCodeAt(c.key.length - 1)), 3, 3) < 0.5 ? 1 : -1;
    const om = (c.kind === 'whale' ? 0.05 : shark ? 0.09 : dolphin ? 0.16 : big ? 0.12 : 0.32) * dir * (1 + c.rush * 1.5);
    c.ang += om * dt;
    const th = c.ang;
    const dx = -Math.sin(th) * om, dz = Math.cos(th) * om * 0.8;
    const h = Math.atan2(dx, dz);
    const R = c.radius * (1 + c.rush * 0.4);
    const lat = (c.slot % 2 ? 1 : -1) * Math.ceil(c.slot / 2) * (dolphin || big ? 0.4 : 0.12) * (1 + c.rush), back = -Math.ceil(c.slot / 2) * (dolphin || big ? 0.35 : 0.1);
    const wob = Math.sin(this.t * 2.3 + c.slot * 1.7) * (dolphin ? 0.05 : 0.04);
    c.x = c.hx + Math.cos(th) * R + (lat + wob) * Math.cos(h) + back * Math.sin(h);
    c.z = c.hz + Math.sin(th) * R * 0.8 - (lat + wob) * Math.sin(h) + back * Math.cos(h);
    c.heading = h + Math.sin(this.t * 6 + c.slot) * (dolphin ? 0.04 : shark ? 0.03 : 0.15);
    // l'hiver, les mantas partent ; il ne reste qu'un groupe de dauphins et une baleine sur deux (les clés en 0)
    const away = season === 3 && (c.kind === 'manta' || ((dolphin || c.kind === 'whale') && !c.key.endsWith('0')));
    // hors de l'eau (rive, île) : on ne l'affiche pas
    c.hidden = !water(w, Math.floor(c.x), Math.floor(c.z)) || away;
    // effets d'eau : seulement près de la vue (bête réfléchie à chaque image)
    const fx = (k: SeaFx, x: number, z: number, s: number) => { if (c.every === 1 && !c.hidden) this.onSea?.(k, x, z, s); };
    const wasAir = !!c.air;
    c.seaT = (c.seaT ?? this.rnd() * 3) - dt;
    if (c.kind === 'whale') {
      // longue nage profonde ; elle remonte respirer (le dos affleure, elle souffle), puis plonge, la queue levée ;
      // une remontée sur trois environ finit en saut, avec une grosse gerbe
      const p = this.t * 0.2 + c.key.charCodeAt(c.key.length - 1) * 1.7, s = Math.sin(p);
      const breathe = Math.pow(Math.max(0, s), 2);
      const leap = hash2(Math.floor(p / (Math.PI * 2)), c.key.length, 5) < 0.33 ? Math.pow(Math.max(0, s), 18) * 1.1 : 0;
      c.y = SEA - 0.6 + breathe * 0.55 + leap;
      c.pitch = -Math.cos(p) * (breathe * 0.5 + leap * 1.3);
      if (s > 0.93 && c.seaT <= 0) { c.seaT = 8; fx('spout', c.x + Math.sin(h) * 0.5, c.z + Math.cos(h) * 0.5, 1); }
      c.air = c.y > SEA + 0.2;
      if (c.air !== wasAir) fx('splash', c.x, c.z, 3);
    } else if (c.kind === 'manta') {
      // glisse juste sous la surface, le bout des ailes affleure ; de temps en temps un saut hors de l'eau
      c.timer -= dt;
      if (c.timer < -1.1) c.timer = 14 + this.rnd() * 26;
      const u = c.timer < 0 ? -c.timer / 1.1 : 0, jump = c.timer < 0 ? Math.sin(u * Math.PI) : 0;
      c.y = SEA - 0.1 + Math.sin(this.t * 0.7 + c.slot) * 0.03 + jump * 0.7;
      c.pitch = c.timer < 0 ? -Math.cos(u * Math.PI) * 0.7 : 0;
      c.air = jump > 0.15;
      if (c.air !== wasAir) fx('splash', c.x, c.z, 1.4);
    } else if (shark) {
      // juste sous la surface : seul l'aileron la fend, avec un sillage d'écume
      c.y = SEA - 0.1 + Math.sin(this.t * 0.5 + c.slot) * 0.015;
      c.pitch = 0;
      if (c.seaT <= 0) { c.seaT = 0.3; fx('wake', c.x, c.z, 1); }
    } else if (dolphin) {
      // à fleur d'eau, puis de grands bonds en arc : gerbe en sortant et en retombant
      const a = this.t * (1.1 + c.rush * 0.6) + c.slot * 0.9, lift = Math.max(0, (Math.sin(a) - 0.3) / 0.7);
      c.y = SEA - 0.12 + lift * 0.8;
      c.pitch = -Math.cos(a) * Math.min(1, lift * 3) * 0.95;
      c.air = c.y > SEA + 0.06;
      if (c.air !== wasAir) fx('splash', c.x, c.z, c.air ? 0.7 : 1);
    } else {
      c.timer -= dt;
      if (c.timer < -0.7) c.timer = (4 + this.rnd() * 14) / (1 + c.rush * 3);
      const jump = c.timer < 0 ? Math.sin((-c.timer / 0.7) * Math.PI) : 0;
      c.y = SEA - 0.08 - Math.sin(this.t + c.slot) * 0.02 + jump * 0.4;
      c.pitch = c.timer < 0 ? -Math.cos((-c.timer / 0.7) * Math.PI) * 1.1 : 0;
      c.air = jump > 0.2;
      if (c.air && !wasAir) fx('splash', c.x, c.z, 0.5);
      // le banc trouble la surface au-dessus de lui : un remous de temps en temps
      if (c.slot === 0 && c.seaT <= 0) { c.seaT = 1.6 + this.rnd() * 2; fx('ripple', c.x, c.z, 1); }
    }
  }

  /** Chef de banc ou de groupe : dauphins et requins se rapprochent du banc le plus proche, le banc s'écarte d'eux */
  private hunt(c: Critter, dt: number) {
    const w = this.world;
    const hunter = c.kind === 'dolphin' || c.kind === 'shark';
    const others = this.critters.filter((o) => o.slot === 0 && (hunter ? o.kind === 'fish' : o.kind === 'dolphin' || o.kind === 'shark'));
    let best: Critter | null = null, bd = hunter ? 14 : 4;
    for (const o of others) { const d = Math.hypot(o.hx - c.hx, o.hz - c.hz); if (d < bd) { bd = d; best = o; } }
    c.rush = Math.max(0, c.rush - dt * 0.3);
    if (!best) return;
    const sgn = hunter ? 1 : -1, sp = c.kind === 'dolphin' ? 0.35 : c.kind === 'shark' ? 0.2 : 0.8;
    if (c.kind === 'fish') c.rush = Math.min(1, c.rush + dt * 2);
    if (c.kind === 'dolphin' && bd < 4) c.rush = Math.min(1, c.rush + dt);
    const k = (sgn * sp * dt) / Math.max(0.01, bd);
    const nx = c.hx + (best.hx - c.hx) * k, nz = c.hz + (best.hz - c.hz) * k;
    // le domaine reste en eau libre
    let ok = true;
    for (const [ox, oz] of [[0, 0], [c.radius, 0], [-c.radius, 0], [0, c.radius], [0, -c.radius]]) if (!water(w, Math.floor(nx + ox), Math.floor(nz + oz))) { ok = false; break; }
    if (ok && (c.kind === 'fish' || bd > 1)) { c.hx = nx; c.hz = nz; }
  }

  /** Papillon (ou chauve-souris) : boucles irrégulières autour de son point d'attache */
  private flutter(c: Critter, hide: boolean, alt = 0.2, pace = 1) {
    c.hidden = hide;
    const p = c.phase, t = this.t * pace;
    const x = c.hx + Math.sin(t * 0.9 + p) * Math.min(1.5, c.radius) + Math.sin(t * 2.3 + p * 2) * 0.1;
    const z = c.hz + Math.cos(t * 0.7 + p * 1.7) * Math.min(1.5, c.radius) + Math.cos(t * 2.9 + p) * 0.1;
    if (Math.hypot(x - c.x, z - c.z) > 1e-4) c.heading = Math.atan2(x - c.x, z - c.z);
    c.x = x; c.z = z;
    c.y = this.world.hAt(x, z) + alt + Math.sin(t * 3.1 + p) * 0.07 * pace;
    c.flap = 1;
  }

  /** L'herbe repousse, les fleurs semées par les abeilles fanent lentement ; les cases dont l'aspect change sont signalées */
  private life(dt: number) {
    this.lifeTimer -= dt;
    if (this.lifeTimer > 0) return;
    const step = 1 - this.lifeTimer;
    this.lifeTimer = 1;
    const w = this.world;
    for (let k = 0; k < N * N; k++) {
      if (w.grazed[k] > 0) w.grazed[k] = Math.max(0, w.grazed[k] - step * (w.veg[k] === 3 ? 0.002 : 0.004));
      if (w.bloom[k] > 0) w.bloom[k] = Math.max(0, w.bloom[k] - step * 0.0015);
      const g = Math.round(w.grazed[k] * 4), b = Math.round(w.bloom[k] * 3);
      if (g !== this.shownGraze[k] || b !== this.shownBloom[k]) { this.shownGraze[k] = g; this.shownBloom[k] = b; w.lifeCells.add(k); }
    }
  }

  // ---------- Rendu ----------

  /**
   * Animal importé : position, cap et animation selon ce qu'il fait (marche, course, broute, boit, mange, dort) ; au loin
   * (`silhouette`), sa silhouette figée prend sa place dans les lots instanciés, et il quitte la scène
   */
  private animateActor(c: Critter, a: Actor, dt: number, visible: boolean, far: boolean, silhouette: boolean, d: number) {
    // hors champ ou en silhouette, la bête quitte la scène : ses dizaines d'os ne sont plus parcourus à chaque image par le moteur
    const want = visible && !silhouette;
    if (want !== (a.root.parent === this.group)) {
      if (want) this.group.add(a.root); else this.group.remove(a.root);
    }
    if (!visible) return;
    const swimmer = SWIMMERS.has(c.kind);
    // modèle sans animation de marche (cochon, lama) : petit trot simulé, rebond et roulis
    const gait = c.moving && !swimmer && !a.actions.has('Walk') && !a.actions.has('WalkSlow');
    const bob = gait ? Math.abs(Math.sin(c.phase * 0.9)) * (c.run ? 0.03 : 0.012) : 0;
    const ground = this.world.hAt(c.x, c.z), beast = BEAST_KINDS.has(c.kind);
    // grenouilles à fleur d'eau, crocodiles et tortues à demi immergés sur les hauts-fonds ; canards sur la houle, enfoncés
    // jusqu'au tiers du corps
    const wet = c.kind === 'frog' ? SEA - 0.01 : c.kind === 'croc' ? SEA - 0.035 : c.kind === 'turtle' ? SEA - 0.018 : -Infinity;
    const y = c.kind === 'duck' || c.kind === 'duckling' ? this.swell(c.x, c.z) - FOWL_FLOAT * c.size : swimmer ? c.y : Math.max(ground, wet);
    a.root.position.set(c.x, y + bob, c.z);
    a.root.rotation.set(swimmer ? c.pitch : 0, c.heading + (MODELS[c.kind]?.yaw ?? beastYaw(c.kind)), gait ? Math.sin(c.phase * 0.9) * 0.07 : 0, 'YXZ');
    if (silhouette) {
      a.root.updateMatrix();
      this.impostors.put(c.actorKey ?? c.kind, a, a.root.matrix, c.actorSize ?? 1);
      return;
    }
    // l'ombre portée ne vaut son appel de dessin que de près
    const shadow = d < SHADOW_D * this.detail;
    if (c.shadow !== shadow) { c.shadow = shadow; a.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = shadow; }); }
    if (swimmer) play(a, ['Swimming_Fast', 'Swimming_Normal', 'Swim', 'Idle'].slice(c.rush > 0.3 ? 0 : 1));
    else if (c.moving && c.run) play(a, ['Gallop', 'Run', 'Jump', 'Walk', 'Idle'], 0.15);
    else if (c.moving) play(a, c.kind === 'frog' ? ['Jump', 'Walk'] : ['Walk', 'WalkSlow', 'Idle']);
    else if (c.act === 'eat') play(a, ['Eating', 'Idle_Eating', 'Attack', 'Idle']);
    else if (c.act === 'drink') play(a, ['Drink', 'Eating', 'Idle_Eating', 'Bite_Front', 'Idle_Headlow', 'Idle']);
    else if (c.sleeping) play(a, beast ? ['Sleep', 'Idle'] : ['Idle_Headlow', 'Idle_2_HeadLow', 'Idle']);
    else if (c.pitch > 0.05) play(a, ['Eating', 'Idle_Eating', 'Bite_Front', 'Idle_Headlow', 'Idle']);
    else if (beast) this.idleBeast(c, a);
    else play(a, ['Idle', 'Idle_2']);
    const speedUp = c.run ? 1.3 : 1;
    // un peu loin, l'animation n'avance qu'une image sur deux
    if (!far) a.mixer.update(dt * speedUp);
    else if ((this.frame + c.slot) % 2 === 0) a.mixer.update(dt * 2 * speedUp);
  }

  /**
   * Repos d'une bête articulée : de temps en temps un geste joué une fois (l'ours se dresse ou hume l'air, l'éléphant
   * barrit…), qu'on laisse finir avant de revenir au repos
   */
  private idleBeast(c: Critter, a: Actor) {
    const cur = a.current?.getClip().name ?? '';
    if (GESTURES.has(cur) && a.current!.isRunning()) return;
    // la meute fait ses gestes ensemble : tous les loups au repos s'assoient et hurlent avec le chef
    const L = c.kind === 'wolf' ? c.leader ?? c : null;
    const k = L ? Math.floor(this.t / 9 + L.hx * 3.1 + L.hz * 1.7) : Math.floor(this.t / 7 + c.slot * 2.3 + c.hx * 3.1 + c.hz * 1.7);
    const want = k % 4 === 2 ? 'Idle_2' : k % 4 === 3 ? 'Idle_3' : 'Idle';
    // un seul geste par créneau : fini, on revient au repos jusqu'au créneau suivant
    const go = want !== 'Idle' && c.gestK !== k && a.actions.has(want);
    if (go) c.gestK = k;
    // le hurlement s'entend (une fois par meute, quand le chef s'y met)
    if (go && want === 'Idle_2' && c.kind === 'wolf' && !c.leader) this.onHowl?.(c.x, c.z);
    play(a, go ? [want] : ['Idle']);
  }

  /** Hauteur de l'eau en (x, z) : même houle que la surface (canards) */
  private swell(x: number, z: number) {
    const t = this.elapsed;
    return SEA + (Math.sin(x * 0.9 + t * 1.3) + Math.sin(z * 1.1 + t * 1.1) + Math.sin((x + z) * 0.5 + t * 0.7)) * 0.018;
  }

  private render(elapsed: number, dt: number, camera?: THREE.Camera) {
    const w = this.world, d = this.d;
    this.frame++;
    this.elapsed = elapsed;
    if (camera) this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const counts = {} as Record<Kind, number>;
    for (const k of KIND_LIST) counts[k] = 0;
    this.impostors.begin();
    for (const c of this.critters) {
      if (c.actor) {
        // hors champ : ni affiché ni animé (une bête hors champ ne revérifie qu'une image sur trois si elle y rentre)
        let visible = !c.hidden, far = false, silhouette = false, d = 0;
        if (visible && camera) {
          if (!c.seen && (this.frame + c.slot) % 3) visible = false;
          else {
            this.sphere.center.set(c.x, SWIMMERS.has(c.kind) ? c.y : w.hAt(c.x, c.z), c.z);
            this.sphere.radius = (MODELS[c.kind]?.length ?? 0.3) * 1.5 + 0.2;
            visible = this.frustum.intersectsSphere(this.sphere);
            d = this.sphere.center.distanceTo(camera.position);
            far = d > SLOW_D * this.detail;
            silhouette = d > IMPOSTOR_D * this.detail;
            // vue d'ensemble d'une grande carte : les bêtes ne seraient que des points (les petites, plus tôt)
            if (d > (TINY.has(c.kind) ? HIDE_TINY_D : HIDE_D) * this.detail) visible = false;
          }
        }
        c.seen = visible;
        this.animateActor(c, c.actor, dt, visible, far, silhouette, d);
        continue;
      }
      if (c.hidden) continue;
      const sp = SPECS[c.kind], m = this.meshes[c.kind];
      const n = counts[c.kind];
      if (n >= sp.max) continue;
      let y: number;
      if (c.kind === 'duck' || c.kind === 'duckling') y = this.swell(c.x, c.z);
      else if (sp.flap || SWIMMERS.has(c.kind)) y = c.y;
      else {
        y = w.hAt(c.x, c.z);
        if (c.moving) y += sp.hop ? Math.abs(Math.sin(c.phase * 0.7)) * sp.hop * (c.run ? 1.6 : 1) : Math.abs(Math.sin(c.phase)) * 0.006;
      }
      d.position.set(c.x, y, c.z);
      d.rotation.set(c.pitch, c.heading, c.moving && !sp.hop ? Math.sin(c.phase) * 0.05 : 0, 'YXZ');
      // couché la nuit
      d.scale.set(c.size, c.size * (c.sleeping ? 0.78 : 1), c.size);
      d.updateMatrix();
      m.setMatrixAt(n, d.matrix);
      m.setColorAt(n, this.col.setHex(c.col));
      const ph = this.phases[c.kind];
      if (ph) ph.setX(n, c.phase + c.slot * 1.3);
      this.flaps[c.kind]?.setX(n, c.flap);
      counts[c.kind] = n + 1;
    }
    this.impostors.end();
    for (const k of KIND_LIST) {
      const m = this.meshes[k];
      if (!m) continue;
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      const ph = this.phases[k];
      if (ph) ph.needsUpdate = true;
      const fl = this.flaps[k];
      if (fl) fl.needsUpdate = true;
    }
  }
}

/** Espèce du groupe (les canetons appartiennent au groupe de la cane) */
const baseKind = (k: Kind): Kind => (k === 'duckling' ? 'duck' : k);

function turn(c: Critter, target: number, k: number) {
  let dh = target - c.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  c.heading += dh * Math.min(1, k);
}

/**
 * Matériau à ailes battantes : les sommets loin du corps montent et descendent, avec des phases de plané ;
 * aFlap = 0 replie les ailes contre le corps (oiseau posé)
 */
export function flapMaterial(uTime: { value: number }, [freq, amp, body]: [number, number, number]) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute float aPhase;\nattribute float aFlap;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float span = max(abs(transformed.x) - ${body.toFixed(4)}, 0.0);
  float glide = clamp(sin(uTime * 0.6 + aPhase) * 1.5 + 0.6, 0.15, 1.0);
  transformed.y += sin(uTime * ${freq.toFixed(1)} + aPhase) * span * ${amp.toFixed(2)} * glide * aFlap;
  transformed.x -= sign(transformed.x) * span * 0.75 * (1.0 - aFlap);`);
  };
  m.customProgramCacheKey = () => `flap${freq}|${amp}|${body}`;
  return m;
}
