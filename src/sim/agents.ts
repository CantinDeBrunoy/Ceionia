import * as THREE from 'three';
import { World, N, VEG_FIELD } from '../world/world';
import { Building, KINDS, KindId, hasDoor, sizeOf } from '../build/catalog';
import { hash2, mulberry32 } from '../core/rng';
import { makeActor, play, hasModel, Actor, HUMAN, HUMAN_K } from '../render/assets';
import { makeFolk, folkStep, holdFolk, Folk, FolkHold, FolkPose } from '../render/folk';
import { makeRider, rideStep, Rider } from '../render/riders';
import { makeSoldier, soldierStep, Soldier } from '../render/soldiers';
import { findGardens, layoutGarden, Spot, Act } from '../world/gardens';
import { Parts } from '../render/parts';
import { mats } from '../render/materials';
import { findPlots, fieldHands, shareHands, fieldSeason, fieldTask, longestRun, rigAt, runCells, Plot, Run, FieldTask, TRACTOR_CELLS, MACHINE_AGE, DRONE_AGE, MAX_DRONES, RigKind, machineOf, isAutoRig, isMotorRig, rigShown, RIG_SPEED } from './fields';
import { rigGeo, droneGeo, propellerGeo, PROP_SPOTS, seatOf } from '../render/farmRigs';

/** Ce que porte un membre d'expédition : son arme, une torche, une corde, une armure (il devient chevalier), son cheval */
/** Équipement d'un membre d'expédition ; `rider` : en selle, il devient le cavalier de l'époque (charge de cavalerie),
 * avec `tank` le blindé de l'époque moderne, qui roule au carburant, sans cheval */
export interface Kit { weapon?: 'spear' | 'bow' | 'sword' | 'rifle'; torch?: boolean; rope?: boolean; armor?: boolean; horse?: boolean; rider?: boolean; car?: boolean; tank?: boolean }

/** Objets tenus en main (géométries partagées, en unités du monde ; le long de +y, la poignée à l'origine) */
const propCache = new Map<string, THREE.BufferGeometry>();
function propGeo(key: string, make: (p: Parts) => void) {
  let g = propCache.get(key);
  if (!g) { const p = new Parts(); make(p); g = p.build(false).body; propCache.set(key, g); }
  return g;
}
/** Comment se tient chaque accessoire : droit (torche, seau, panier, livre, bouclier), en outil (qui frappe), pointé (arme) */
const HOLD: Record<string, FolkHold> = {
  sword: 'point', spear: 'point', bow: 'upright', rifle: 'point', torch: 'upright', shield: 'upright', rope: 'upright',
  hoe: 'tool', axe: 'tool', pick: 'tool', hammer: 'tool', rod: 'tool', bucket: 'upright', book: 'upright', crook: 'upright', basket: 'upright',
  stick: 'tool', spade: 'tool', sickle: 'tool', flint: 'tool', scythe: 'tool', sack: 'upright', sheaf: 'upright', crate: 'upright',
};
/** Faucille : le manche, la lame en croissant au bout (de silex emmanché à la préhistoire, de fer ensuite) */
function sickle(p: Parts, blade: number) {
  p.cyl(0.006, 0.007, 0.07, 5, 0, -0.03, 0, 0x7a5a3a);
  p.add(new THREE.TorusGeometry(0.032, 0.005, 3, 10, Math.PI * 1.1), 0.032, 0.04, 0, blade);
}
const PROPS = {
  sword: () => propGeo('sword', (p) => { p.box(0.01, 0.035, 0.01, 0, -0.012, 0, 0x6a4a34); p.box(0.045, 0.008, 0.012, 0, 0.022, 0, 0x8a8f96); p.box(0.014, 0.12, 0.005, 0, 0.03, 0, 0xd8dde2); p.box(0.006, 0.01, 0.006, 0, 0.15, 0, 0xd8dde2); }),
  spear: () => propGeo('spear', (p) => { p.cyl(0.005, 0.006, 0.34, 5, 0, -0.12, 0, 0x8a6a4a); p.cone(0.014, 0.05, 4, 0, 0.22, 0, 0xb8bec6); }),
  bow: () => propGeo('bow', (p) => { p.add(new THREE.TorusGeometry(0.1, 0.006, 4, 12, Math.PI).rotateZ(-Math.PI / 2), 0.02, 0.02, 0, 0x8a5a34); p.box(0.002, 0.2, 0.002, 0.02, -0.08, 0, 0xf2f2e8); }),
  rifle: () => propGeo('rifle', (p) => { p.box(0.018, 0.08, 0.022, 0, -0.04, 0, 0x6a4a34); p.box(0.01, 0.16, 0.01, 0, 0.04, 0, 0x3c3c40); }),
  torch: () => propGeo('torch', (p) => { p.box(0.009, 0.1, 0.009, 0, -0.03, 0, 0x6a4a34); p.cyl(0.013, 0.01, 0.02, 6, 0, 0.065, 0, 0x4a3a2e); }),
  shield: () => propGeo('shield', (p) => { p.add(new THREE.CylinderGeometry(0.055, 0.055, 0.01, 10).rotateZ(Math.PI / 2), 0, 0.02, 0, 0x4a6aa8); p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 8).rotateZ(Math.PI / 2), 0, 0.02, 0, 0xe8c66a); }),
  rope: () => propGeo('rope', (p) => { for (const r of [0.034, 0.028]) p.add(new THREE.TorusGeometry(r, 0.006, 4, 12), 0, 0, 0, 0xc9b48a); }),
  // outils des métiers
  hoe: () => propGeo('hoe', (p) => { p.cyl(0.005, 0.006, 0.3, 5, 0, -0.1, 0, 0x8a6a4a); p.box(0.05, 0.012, 0.03, 0.015, 0.19, 0, 0x8a8f96); }),
  axe: () => propGeo('axe', (p) => { p.cyl(0.005, 0.006, 0.2, 5, 0, -0.06, 0, 0x8a6a4a); p.box(0.012, 0.045, 0.04, 0, 0.11, 0.02, 0xb8bec6); }),
  pick: () => propGeo('pick', (p) => { p.cyl(0.005, 0.006, 0.2, 5, 0, -0.06, 0, 0x8a6a4a); p.add(new THREE.BoxGeometry(0.012, 0.012, 0.12).rotateX(0.3), 0, 0.13, 0, 0x8a8f96); }),
  hammer: () => propGeo('hammer', (p) => { p.cyl(0.005, 0.006, 0.12, 5, 0, -0.03, 0, 0x8a6a4a); p.box(0.025, 0.025, 0.05, 0, 0.09, 0, 0x5d6168); }),
  rod: () => propGeo('rod', (p) => { p.add(new THREE.CylinderGeometry(0.002, 0.005, 0.42, 4).translate(0, 0.15, 0).rotateX(0.5), 0, 0, 0, 0x8a6a4a); }),
  bucket: () => propGeo('bucket', (p) => { p.cyl(0.03, 0.022, 0.045, 8, 0, -0.07, 0, 0x9a6a44); p.cyl(0.026, 0.026, 0.004, 8, 0, -0.026, 0, 0x6cc4e0); }),
  book: () => propGeo('book', (p) => { p.box(0.04, 0.05, 0.012, 0, -0.02, 0, 0x8a3a2a); p.box(0.036, 0.046, 0.013, 0.002, -0.018, 0, 0xf2ead8); }),
  crook: () => propGeo('crook', (p) => { p.cyl(0.005, 0.006, 0.36, 5, 0, -0.12, 0, 0x8a6a4a); p.add(new THREE.TorusGeometry(0.025, 0.005, 4, 8, Math.PI), 0.025, 0.24, 0, 0x8a6a4a); }),
  basket: () => propGeo('basket', (p) => { p.cyl(0.035, 0.028, 0.04, 8, 0, -0.07, 0, 0xc8a070); for (let i = 0; i < 3; i++) p.sphere(0.012, -0.012 + i * 0.012, -0.025, 0, [0xd84a3e, 0x8ab84a, 0xf2a03a][i]); }),
  // outils des champs : bâton à fouir durci au feu, bêche, faucilles, faux (la lame à plat au bout du manche), sac de
  // semences, gerbe liée, cagette de légumes
  stick: () => propGeo('stick', (p) => { p.cyl(0.005, 0.007, 0.3, 5, 0, -0.08, 0, 0x7a5a3a); p.cone(0.005, 0.035, 5, 0, 0.22, 0, 0x4a3426); }),
  spade: () => propGeo('spade', (p) => { p.box(0.04, 0.008, 0.008, 0, -0.09, 0, 0x8a6a4a); p.cyl(0.005, 0.006, 0.25, 5, 0, -0.085, 0, 0x8a6a4a); p.box(0.045, 0.065, 0.006, 0, 0.16, 0, 0x8a8f96); }),
  sickle: () => propGeo('sickle', (p) => sickle(p, 0xb8bec6)),
  flint: () => propGeo('flint', (p) => sickle(p, 0x7a766e)),
  scythe: () => propGeo('scythe', (p) => {
    p.cyl(0.0045, 0.0055, 0.3, 5, 0, -0.05, 0, 0x8a6a4a);
    p.box(0.028, 0.006, 0.006, 0.012, 0.09, 0, 0x8a6a4a);
    p.box(0.15, 0.02, 0.004, 0.075, 0.24, 0, 0xc8ced6);
    p.add(new THREE.BoxGeometry(0.04, 0.014, 0.004), 0.16, 0.236, 0, 0xc8ced6, 0, false, -0.5);
  }),
  sack: () => propGeo('sack', (p) => { p.sphere(0.028, 0, -0.055, 0, 0xd8c8a0, 1, 1.2); p.cyl(0.012, 0.016, 0.018, 6, 0, -0.03, 0, 0xc8b48a); }),
  sheaf: () => propGeo('sheaf', (p) => {
    p.cyl(0.02, 0.014, 0.1, 7, 0, -0.07, 0, 0xd8b860);
    p.cyl(0.0205, 0.0205, 0.01, 7, 0, -0.02, 0, 0xa07840);
    p.cyl(0.032, 0.02, 0.045, 7, 0, 0.03, 0, 0xe8c66a);
    for (let i = 0; i < 5; i++) p.sphere(0.008, Math.cos(i * 1.26) * 0.022, 0.078, Math.sin(i * 1.26) * 0.022, 0xd8a84a);
  }),
  crate: () => propGeo('crate', (p) => { p.box(0.075, 0.035, 0.05, 0, -0.09, 0, 0x3a8a4a); for (let i = 0; i < 3; i++) p.sphere(0.014, -0.022 + i * 0.022, -0.052, 0, [0xd84a3e, 0x6ab84a, 0xe88a3a][i]); }),
};
type Prop = keyof typeof PROPS;
/** Les outils des travaux des champs selon l'époque : [main droite, main gauche] ; `v` varie la moisson (faux ou faucille) */
function fieldTools(task: FieldTask, age: number, v: number): [Prop | null, Prop | null] {
  if (task === 'hoe') return [age === 0 ? 'stick' : 'hoe', null];
  if (task === 'dig') return [age === 0 ? 'stick' : 'spade', null];
  if (task === 'sow') return [null, age === 0 ? 'basket' : 'sack'];
  if (task === 'reap') return [age === 0 ? 'flint' : age === 1 || v < 0.35 ? 'sickle' : 'scythe', null];
  if (task === 'gather') return [null, age >= 4 ? 'crate' : 'basket'];
  return [null, null];
}
/** Geste de chaque travail des champs, et sa cadence */
const FIELD_POSE: Record<FieldTask, [FolkPose, number]> = {
  hoe: ['work', 1], dig: ['work', 0.8], sow: ['sow', 0.55], reap: ['reap', 0.6], gather: ['gather', 0.8], drive: ['sit', 1],
};
/** Allure du semeur, du faucheur, de celui qui glane (cases par seconde, le long des sillons) */
const LANE_SPEED: Partial<Record<FieldTask, number>> = { sow: 0.07, reap: 0.045, gather: 0.025 };
/** Combien d'engins des champs au plus dans tout le village (tracteurs, moissonneuses, attelages de bœufs) */
const MAX_RIGS = 6;

/**
 * L'engin d'une grande parcelle : sa file de cases, le chemin parcouru, son rang parmi les plus grandes parcelles, son genre du
 * moment (selon l'âge et la saison, voir `machineOf`), son modèle, et qui le conduit (ou va le prendre)
 */
interface Rig { key: number; run: Run; d: number; mesh: THREE.Mesh; by: number | null; geoKey: string; rank: number; kind: RigKind | null }
/** Le drone agricole d'une grande parcelle : il en survole la file de cases, ses hélices tournent */
interface Drone { key: number; run: Run; d: number; mesh: THREE.Mesh; props: THREE.Mesh[] }

/**
 * Les métiers : chaque habitant en âge de travailler est attaché à un lieu de travail ; aux heures de travail il y va, outil
 * en main, et l'on voit ce qu'il y fait (le paysan bêche son champ, le bûcheron abat à la lisière, le forgeron frappe devant
 * l'atelier, le prêtre attend sur le parvis, le garde fait sa ronde, le pompier prend son seau…)
 */
type JobKind = 'farmer' | 'woodcutter' | 'quarry' | 'fisher' | 'smith' | 'miller' | 'priest' | 'healer' | 'teacher' | 'guard' | 'firefighter' | 'merchant' | 'herder' | 'keeper' | 'servant';
const JOB_OF: Partial<Record<KindId, JobKind>> = {
  farm: 'farmer', lumber: 'woodcutter', quarry: 'quarry', mine: 'quarry', pier: 'fisher', workshop: 'smith', mill: 'miller',
  temple: 'priest', health: 'healer', school: 'teacher', police: 'guard', fire: 'firefighter',
  gather: 'merchant', forum: 'merchant', tavern: 'merchant', barber: 'merchant', harbor: 'merchant',
  pen: 'herder', stable: 'herder', apiary: 'keeper',
  baths: 'servant', theater: 'servant', senate: 'servant', landmark: 'servant', station: 'servant', terminal: 'servant', observatory: 'servant',
  carworks: 'smith', lab: 'healer', aerodrome: 'servant', heliport: 'servant', airport: 'servant', oilwell: 'smith', refinery: 'smith', brickworks: 'smith',
  arcology: 'merchant', vfarm: 'farmer', fusion: 'smith', spaceport: 'servant', research: 'teacher', maglev: 'servant',
};
const TOOL_OF: Record<JobKind, keyof typeof PROPS | null> = {
  farmer: 'hoe', woodcutter: 'axe', quarry: 'pick', fisher: 'rod', smith: 'hammer', miller: 'basket', priest: 'book', healer: 'basket', teacher: 'book',
  guard: 'spear', firefighter: 'bucket', merchant: 'basket', herder: 'crook', keeper: null, servant: null,
};
/** Ce qu'il fait une fois à sa place : à l'ouvrage, debout à attendre (prêtre, garde), à parler aux passants (marchand, maître) */
const JOB_ACT: Record<JobKind, Act> = {
  farmer: 'work', woodcutter: 'work', quarry: 'work', fisher: 'stroll', smith: 'work', miller: 'work', priest: 'stroll', healer: 'work', teacher: 'cheer',
  guard: 'stroll', firefighter: 'work', merchant: 'cheer', herder: 'work', keeper: 'work', servant: 'work',
};
/**
 * Ordre de priorité des métiers quand il y a plus de lieux de travail que d'habitants : les secours, les champs et l'église
 * d'abord, puis le reste ; les paysans comptent double (on en voit toujours plusieurs aux champs)
 */
const JOB_RANK: JobKind[] = ['firefighter', 'farmer', 'priest', 'guard', 'healer', 'teacher', 'smith', 'merchant', 'fisher', 'woodcutter', 'quarry', 'herder', 'miller', 'keeper', 'servant'];
const JOB_SHARE: Partial<Record<JobKind, number>> = { farmer: 2 };
/** Où l'on habite : les maisons, et les manoirs qu'on en a faits */
const isHome = (b: Building) => b.kind === 'house' || b.kind === 'manor';
/** Heures de travail (matin, puis après le repas de midi) */
const working = (h: number) => (h >= 7.5 && h < 12) || (h >= 13.5 && h < 18);
const PROP_FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });
/** hauteur de la selle (le cavalier y est assis) et allure à cheval */
/** hauteur de la selle (le cheval garde sa taille ; un cavalier plus petit s'assied plus haut sur son pas) */
const SADDLE = 0.12 + 0.42 * (0.3 - HUMAN), RIDE_SPEED = 1.6;
/** au volant d'une petite voiture d'expédition : hauteur du siège, allure */
const CAR_SEAT = 0.035, CAR_SPEED = 2.1;

/**
 * Petite voiture tout-terrain de l'âge industriel, pour les expéditions (avant = +z) : caisse ouverte, capot et calandre,
 * pare-brise rabattable, banquette de cuir, ailes, roues à rayons, roue de secours, bidon, phares
 */
function jeepGeo(v: number) {
  const p = new Parts(), body = [0x4a5a3a, 0x5a4a32, 0x3a4a5a, 0x6a2a24][v % 4];
  p.box(0.15, 0.05, 0.26, 0, 0.045, -0.01, body);
  p.box(0.13, 0.045, 0.09, 0, 0.07, 0.1, body); p.box(0.004, 0.03, 0.08, 0.066, 0.08, 0.1, dark(body, 0.8));
  p.box(0.1, 0.055, 0.012, 0, 0.06, 0.148, 0x3c3c40); for (let k = 0; k < 4; k++) p.box(0.004, 0.045, 0.014, -0.03 + k * 0.02, 0.064, 0.149, 0x8a8f96);
  p.box(0.14, 0.045, 0.004, 0, 0.12, 0.052, 0x9fc4dc); p.box(0.15, 0.006, 0.012, 0, 0.165, 0.052, 0x3c3c40);
  p.box(0.13, 0.03, 0.06, 0, 0.095, -0.05, 0x6a4a34); p.box(0.13, 0.05, 0.014, 0, 0.11, -0.085, 0x6a4a34);
  p.cyl(0.006, 0.006, 0.05, 5, -0.035, 0.1, 0.04, 0x2a2a2e); p.add(new THREE.TorusGeometry(0.018, 0.004, 3, 10), -0.035, 0.14, 0.035, 0x2a2a2e, 0, false, 0, -0.6);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.036, 0.036, 0.022, 10).rotateZ(Math.PI / 2), sx * 0.078, 0.036, sz * 0.085, 0x2a2a2e);
    p.add(new THREE.CylinderGeometry(0.013, 0.013, 0.024, 6).rotateZ(Math.PI / 2), sx * 0.078, 0.036, sz * 0.085, 0x8a8f96);
    p.box(0.032, 0.008, 0.08, sx * 0.078, 0.078, sz * 0.085, dark(body, 0.85));
  }
  p.add(new THREE.CylinderGeometry(0.034, 0.034, 0.018, 10).rotateX(Math.PI / 2), 0, 0.075, -0.15, 0x2a2a2e);
  p.box(0.03, 0.045, 0.02, 0.055, 0.07, -0.145, 0x4a6a3a);
  for (const s of [-1, 1]) { p.add(new THREE.CylinderGeometry(0.013, 0.011, 0.016, 8).rotateX(Math.PI / 2), s * 0.05, 0.1, 0.15, 0xc8a050); p.box(0.016, 0.016, 0.004, s * 0.05, 0.1, 0.159, 0xfff1c9, 0, true); }
  const b = p.build(false);
  return b.body;
}
const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();

const MAX_AGENTS = 90;
/** Écart à l'axe de la rue où l'on marche : le trottoir (la chaussée fait 0,3 de demi-largeur), dès la rue pavée (âge 3) */
export const SIDEWALK = 0.37;
export const sidewalkAt = (age: number) => (age >= 3 ? SIDEWALK : 0);
/** Le point (px, pz) décalé de `lat` vers la droite du sens de marche (dx, dz) : le même côté que les véhicules, au sens près */
export function sideStep(px: number, pz: number, dx: number, dz: number, lat: number): [number, number] {
  const l = Math.hypot(dx, dz);
  return l < 1e-6 ? [px, pz] : [px - (dz / l) * lat, pz + (dx / l) * lat];
}
/** Part de la population qu'on voit dehors (un passant pour quatre à cinq habitants), et leur nombre au plus */
const SHOWN = 0.85 / 4, MAX_SHOWN = Math.floor(MAX_AGENTS / 4);
/** Part de la population en âge et en état de partir en expédition */
const ABLE = 0.6;
const HUMAN_HEIGHT = HUMAN;
/** les bancs sont faits pour des habitants de 0,3 : assis, un habitant plus petit se pose un peu plus haut */
const SIT_LIFT = 0.4 * (0.3 - HUMAN);

const BODY_COLS = [
  [0xb98a5e, 0xa07850, 0xc9a070],
  [0xf1e6d0, 0x9ec4d6, 0xe8b4a8],
  [0xc86a5a, 0x6f9f78, 0x8c7fb8, 0xd8b45a],
  [0x6f7a8a, 0x8a6f5f, 0x5f7f95, 0xb08a6a],
  [0xf09ab0, 0x7fc4e8, 0xf5d36a, 0x9fd49a, 0xffffff],
  [0xf4f6f8, 0x9fe8f0, 0xd8c8f4, 0xf2f2f2, 0xa8f0d0],
];
const SKIN = [0xf2cfb3, 0xe3b894, 0xc99973, 0x8d6445];
const TOOL_SCALE = [1.5, 0.9, 0.9, 0.5, 0, 0];

type State = 'inside' | 'walking' | 'doing';
/**
 * Destination d'une sortie : case, caché à l'arrivée (dans un bâtiment), dernier pas hors de la route et cap, platelage ou assise ;
 * activité sur place et place prise dans un jardin
 */
interface Dest {
  cell: number; hidden: boolean; spot?: [number, number]; face?: number; deck?: number; act?: Act; hold?: string; tool?: keyof typeof PROPS | null; work?: boolean; urgent?: boolean; blaze?: number;
  /** aux champs : le travail, l'outil de la main gauche, la grange où porter la récolte ; il y porte sa charge ; le tracteur qu'il va prendre */
  task?: FieldTask; tool2?: Prop | null; barn?: number | null; carry?: boolean; rig?: number;
}
/** Places des pêcheurs sur le ponton (repère du bâtiment : x en travers, z vers l'eau) : radeau de la Préhistoire, platelage ensuite */
const RAFT_SPOTS = [[-0.03, 0.74], [0.02, 0.42]], DECK_SPOTS = [[-0.03, 0.66], [0.06, 0.46]];

interface Agent {
  id: number;
  home: number; // id bâtiment
  x: number; z: number;
  state: State;
  path: number[];
  /** direction du pas en cours (unitaire), qui tourne en douceur vers la suivante */
  vx?: number;
  /** il accourt (incendie) : il court, deux fois plus vite, jusqu'à sa place */
  urgent?: boolean;
  vz?: number;
  pi: number;
  timer: number;
  hidden: boolean;
  speed: number;
  heading: number;
  phase: number;
  goingHome: boolean;
  targetHidden: boolean;
  skin: number; col: number;
  off: number;
  /** écart latéral actuel par rapport à l'axe de la rue (trottoir), lissé */
  lat: number;
  /** modèle animé de l'époque courante (sinon silhouette instanciée) */
  /** l'habitant dessiné (tenue de l'époque), et pour quelle époque */
  actor: Folk | null;
  actorKey: string;
  /** dernier pas après la route (bout d'un ponton…) et cap à prendre une fois arrivé */
  spot: [number, number] | null;
  face: number | null;
  /** hauteur du platelage quand il est sur un ponton */
  deck: number | null;
  /** enfant : plus petit, sans outil, il joue en courant autour de l'endroit où il s'arrête */
  child: boolean;
  ax: number; az: number;
  /** ce qu'il fait une fois arrivé (assis au feu, à l'ouvrage, il acclame les jouteurs…) */
  act: Act | null;
  /** place qu'il occupe (bout du ponton, abords d'un puits, banc d'un jardin…) : personne d'autre ne la prend */
  hold: string | null;
  /** membre d'une expédition : il suit les ordres de l'expédition, plus sa routine */
  mission: boolean;
  /** attente avant de se mettre en marche (l'équipe part en file) */
  delay: number;
  /** blessé : il se repose chez lui (secondes de jeu restantes) */
  rest: number;
  /** porté (assis dans une barque…) : position et cap imposés ; et l'endroit de la berge où il est monté */
  ride: Ride | null;
  shore: [number, number] | null;
  /** équipement d'expédition porté ; objets accrochés au modèle ; son cheval (monté en route, à brouter sur place) */
  kit: Kit | null;
  kitKey: string;
  props: THREE.Object3D[];
  mount: Actor | null;
  mounted: boolean;
  /** sa petite voiture d'expédition (après la course automobile) */
  car?: THREE.Mesh | null;
  parked: [number, number, number] | null;
  /** cavalier de l'époque, cheval compris, qui le remplace en selle (charge de cavalerie) */
  rider: Rider | null;
  /** en armure et à pied, le soldat de l'époque (légionnaire, chevalier, fantassin, militaire) prend sa place */
  soldier: Soldier | null;
  /** son métier et son lieu de travail (null : sans emploi, ou enfant) ; l'outil qu'il tient en ce moment */
  job?: { kind: JobKind; b: number } | null;
  tool?: keyof typeof PROPS | null;
  /** bâtiment en feu sur lequel il jette l'eau de son seau (il reste tant qu'il brûle) */
  blaze?: number | null;
  /** bras des champs (en plus des passants) : la parcelle où il travaille */
  hand?: boolean;
  plot?: number | null;
  /** aux champs : ce qu'il y fait, l'outil de sa main gauche, la grange où il porte la récolte, s'il la porte en ce moment */
  task?: FieldTask | null;
  tool2?: Prop | null;
  barn?: number | null;
  load?: boolean;
  /** semeur, faucheur : le sens des sillons qu'il suit, et le chemin fait (aller et retour) ; le tracteur qu'il conduit */
  lane?: [number, number] | null;
  lanePos?: number;
  rig?: number | null;
}

/** Place imposée à un membre d'expédition : il y est assis, sans marcher */
/** une place où l'on est porté (barque, nacelle, voiture) ; `act` : ce qu'on y fait (assis par défaut, null : debout) */
export interface Ride { x: number; z: number; y: number; heading: number; act?: Act | null }

export class Heap {
  keys: number[] = []; vals: number[] = [];
  get size() { return this.keys.length; }
  push(k: number, v: number) {
    const K = this.keys, V = this.vals;
    let i = K.length; K.push(k); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= K[i]) break; [K[p], K[i]] = [K[i], K[p]]; [V[p], V[i]] = [V[i], V[p]]; i = p; }
  }
  pop(): number {
    const K = this.keys, V = this.vals; const top = V[0];
    const lk = K.pop()!, lv = V.pop()!;
    if (K.length) {
      K[0] = lk; V[0] = lv; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < K.length && K[l] < K[m]) m = l;
        if (r < K.length && K[r] < K[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [V[m], V[i]] = [V[i], V[m]]; i = m;
      }
    }
    return top;
  }
}

/** Habitants : agents instanciés qui marchent sur les routes et rentrent la nuit */
export class Agents {
  group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private tool: THREE.InstancedMesh;
  agents: Agent[] = [];
  private nextId = 1;
  private rnd = mulberry32(99);
  private works: Building[] = [];
  /** lisières boisées proches des maisons : les bûcherons y vont couper du bois */
  private woods: number[] = [];
  private socials: Building[] = [];
  /** cases de champ où l'on peut se tenir (hors des files des tracteurs), et combien il y en a en tout */
  private fields: number[] = [];
  private fieldCount = 0;
  /** parcelles de champ, la parcelle de chaque case, les granges et séchoirs ; les tracteurs des grandes parcelles */
  private plots = new Map<number, Plot>();
  private plotAt = new Map<number, Plot>();
  private farms: Building[] = [];
  private rigs = new Map<number, Rig>();
  private drones = new Map<number, Drone>();
  private runSet = new Set<number>();
  private plotsDirty = true;
  /** saison (0 printemps … 3 hiver) et âge du village, donnés à chaque image */
  private season = 0;
  private age = 0;
  private roads: number[] = [];
  /** places des jardins (pour l'âge courant) et qui les occupe */
  private gspots: Spot[] = [];
  /** places occupées : clé → habitant */
  private held = new Map<string, number>();
  /** ce bâtiment brûle-t-il encore ? (branché sur les incendies) */
  burning: (id: number) => boolean = () => false;
  private spotKey = '';
  private lastVersion = -1;
  private lastAge = -1;
  private d = new THREE.Object3D();
  private col = new THREE.Color();
  /** population du village (donnée à chaque image) */
  private popTarget = 0;
  private pathBudget = 0;

  constructor(private world: World) {
    this.body = new THREE.InstancedMesh(new THREE.ConeGeometry(0.075, 0.2, 6).translate(0, 0.1, 0).scale(HUMAN_K, HUMAN_K, HUMAN_K), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }), MAX_AGENTS);
    this.head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.052, 0).translate(0, 0.25, 0).scale(HUMAN_K, HUMAN_K, HUMAN_K), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }), MAX_AGENTS);
    this.tool = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.26, 0.014).translate(0, 0.13, 0).scale(HUMAN_K, HUMAN_K, HUMAN_K), new THREE.MeshStandardMaterial({ color: 0x8a6a4e, flatShading: true }), MAX_AGENTS);
    for (const m of [this.body, this.head, this.tool]) { m.frustumCulled = false; m.castShadow = true; m.count = 0; this.group.add(m); }
  }

  reset() {
    for (const a of this.agents) this.dropActor(a);
    for (const r of this.rigs.values()) this.group.remove(r.mesh);
    for (const d of this.drones.values()) this.group.remove(d.mesh);
    this.agents = []; this.held.clear(); this.rigs.clear(); this.drones.clear(); this.lastVersion = -1; this.spotKey = '';
  }

  private dropActor(a: Agent) {
    if (a.rider) { this.group.remove(a.rider.root); a.rider = null; }
    if (a.soldier) { this.group.remove(a.soldier.root); a.soldier = null; }
    if (!a.actor) return;
    this.group.remove(a.actor.root);
    a.actor = null;
    a.actorKey = '';
  }

  private refreshTargets() {
    const w = this.world;
    this.works = []; this.socials = [];
    for (const b of w.buildings.values()) {
      if (['workshop', 'farm', 'mill', 'landmark', 'terminal', 'pier'].includes(b.kind)) this.works.push(b);
      else if (['well', 'gather', 'temple'].includes(b.kind)) this.socials.push(b);
    }
    this.fields = []; this.roads = []; this.woods = [];
    for (let i = 0; i < w.veg.length; i++) { if (w.veg[i] === 2) this.fields.push(i); if (w.road[i]) this.roads.push(i); }
    this.fieldCount = this.fields.length;
    // les parcelles, et la grange ou le séchoir où chacune porte sa récolte
    this.plots.clear(); this.plotAt.clear();
    for (const p of findPlots(w)) { this.plots.set(p.key, p); for (const k of p.cells) this.plotAt.set(k, p); }
    this.farms = [...w.buildings.values()].filter((b) => b.kind === 'farm');
    this.plotsDirty = true;
    const houses = [...w.buildings.values()].filter(isHome);
    for (let i = 0; i < w.veg.length; i++) {
      if (w.veg[i] !== 1) continue;
      const x = i % N, z = (i / N) | 0;
      if (houses.some((h) => Math.abs(h.x - x) + Math.abs(h.z - z) < 12)) this.woods.push(i);
    }
    this.assignJobs();
  }

  /**
   * Répartit les métiers entre les habitants qu'on voit : chaque lieu de travail reçoit d'abord un employé, puis un deuxième
   * s'il offre assez d'emplois, et ainsi de suite ; ceux qui gardent leur poste le gardent
   */
  private assignJobs() {
    const w = this.world, slots: [Building, number][] = [];
    for (const b of w.buildings.values()) {
      const kind = JOB_OF[b.kind];
      if (!kind) continue;
      const jobs = KINDS[b.kind].jobs?.[b.age] ?? 0;
      slots.push([b, Math.max(1, Math.min(3, Math.round(jobs / 3)))]);
    }
    const taken = new Map<number, number>();
    // les bras des champs ont déjà leur parcelle
    const adults = this.agents.filter((a) => !a.child && !a.mission && !a.hand);
    // ceux dont le lieu de travail existe toujours le gardent (dans la limite des places)
    for (const a of adults) {
      const s = a.job ? slots.find(([b]) => b.id === a.job!.b) : null;
      if (!s || (taken.get(s[0].id) ?? 0) >= s[1]) { a.job = null; continue; }
      taken.set(s[0].id, (taken.get(s[0].id) ?? 0) + 1);
    }
    // les autres, tour à tour : le métier le moins représenté (dans l'ordre de priorité), à son lieu de travail le moins pourvu
    const perKind = new Map<JobKind, number>();
    for (const a of adults) if (a.job) perKind.set(a.job.kind, (perKind.get(a.job.kind) ?? 0) + 1);
    for (const a of adults) {
      if (a.job) continue;
      let best: [Building, number] | null = null, bk = Infinity, bn = Infinity;
      for (const s of slots) {
        const n = taken.get(s[0].id) ?? 0;
        if (n >= s[1]) continue;
        const kind = JOB_OF[s[0].kind]!, k = (perKind.get(kind) ?? 0) / (JOB_SHARE[kind] ?? 1) + JOB_RANK.indexOf(kind) * 0.01;
        if (k < bk || (k === bk && n < bn)) { bk = k; bn = n; best = s; }
      }
      if (!best) break;
      const kind = JOB_OF[best[0].kind]!;
      a.job = { kind, b: best[0].id };
      taken.set(best[0].id, bn + 1);
      perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
    }
  }

  /**
   * Les bras des champs : chaque parcelle en reçoit selon sa taille (voir `shareHands`) ; le premier d'une parcelle qui a son
   * tracteur en est le conducteur ; ceux dont la parcelle existe toujours la gardent
   */
  private assignPlots() {
    const hands = this.agents.filter((a) => a.hand && !a.mission), plots = [...this.plots.values()];
    shareHands(plots, hands.length);
    const taken = new Map<number, number>();
    for (const a of hands) {
      const p = a.plot != null ? this.plots.get(a.plot) : undefined;
      if (!p || (taken.get(p.key) ?? 0) >= p.hands) { a.plot = null; continue; }
      taken.set(p.key, (taken.get(p.key) ?? 0) + 1);
    }
    for (const a of hands) {
      if (a.plot != null) continue;
      const p = plots.find((q) => (taken.get(q.key) ?? 0) < q.hands);
      if (!p) break;
      a.plot = p.key;
      taken.set(p.key, (taken.get(p.key) ?? 0) + 1);
    }
  }

  /** La grange ou le séchoir le plus proche d'une parcelle (pas trop loin), où l'on porte gerbes et paniers */
  private barnOf(p: Plot): number | null {
    let best: Building | null = null, bd = 24;
    for (const b of this.farms) { const d = Math.abs(b.x + 0.5 - p.cx) + Math.abs(b.z + 0.5 - p.cz); if (d < bd) { bd = d; best = b; } }
    return best?.id ?? null;
  }

  /**
   * Un travail des champs parmi ces cases, selon la saison et l'âge : un quart de case libre, l'outil de l'époque en main ;
   * null l'hiver (personne aux champs) ou si tout est pris
   */
  private fieldDest(cells: number[], barn: number | null): Dest | null {
    const task = fieldTask(this.season, this.age, this.rnd());
    // plutôt du côté des autres cases du champ : au bord de la parcelle, les épis s'arrêtent avant la fin de la case
    const w = this.world, field = (x: number, z: number) => w.inCells(x, z) && w.veg[w.ci(x, z)] === VEG_FIELD;
    const d = task && this.cellDest(cells, (k, q) => field((k % N) + (q % 2 ? 1 : -1), Math.floor(k / N)) && field(k % N, Math.floor(k / N) + (q >> 1 ? 1 : -1)));
    if (!task || !d) return null;
    const [tool, tool2] = fieldTools(task, this.age, this.rnd());
    return { ...d, act: 'work', tool, tool2, task, barn, work: true };
  }

  /** Le bras des champs à sa parcelle : au volant du tracteur s'il y en a un (et qu'il est libre), sinon à l'ouvrage de la saison */
  private plotDest(a: Agent): Dest | null {
    const p = a.plot != null ? this.plots.get(a.plot) : undefined;
    if (!p) return null;
    // l'hiver, personne aux champs : on répare outils et clôtures devant la grange, ou l'on fait comme tout le monde
    if (!fieldSeason(this.season)) {
      const b = this.rnd() < 0.5 ? this.world.buildings.get(this.barnOf(p) ?? -1) : undefined, d = b && this.beside(b);
      return d ? { ...d, act: 'work', tool: 'hammer', work: true } : null;
    }
    const rig = this.rigs.get(p.key);
    if (rig && rig.kind && isMotorRig(rig.kind) && (rig.by === null || rig.by === a.id) && this.rnd() < 0.7) {
      // il rejoint le tracteur là où il est garé, et monte par le côté
      const [x, z, h] = rigAt(rig.run, rig.d), sx = x + Math.cos(h) * 0.15, sz = z - Math.sin(h) * 0.15;
      if (this.world.inCells(Math.floor(sx), Math.floor(sz))) return { cell: Math.floor(sz) * N + Math.floor(sx), hidden: false, spot: [sx, sz], face: h, act: 'work', task: 'drive', rig: p.key, work: true };
    }
    return this.fieldDest(p.cells.filter((k) => !this.runSet.has(k)), this.barnOf(p));
  }

  /** Après la moisson ou la cueillette, il porte le plus souvent sa gerbe (son panier, sa cagette) à la grange ou au séchoir */
  private carryDest(a: Agent): Dest | null {
    if ((a.task !== 'reap' && a.task !== 'gather') || a.barn == null || this.rnd() < 0.3) return null;
    const b = this.world.buildings.get(a.barn), d = b && this.beside(b);
    if (!d) return null;
    return { ...d, tool: a.task === 'reap' ? 'sheaf' : this.age >= 4 ? 'crate' : 'basket', carry: true };
  }

  /** Arrivé à son ouvrage des champs : combien de temps il y reste, tourné le long des sillons ; au tracteur, il monte */
  private startTask(a: Agent) {
    const t = a.task!, r = this.rnd();
    a.timer = t === 'drive' ? 26 + r * 16 : t === 'hoe' || t === 'dig' ? 12 + r * 8 : 8 + r * 6;
    if (t === 'drive') {
      const rig = a.rig != null ? this.rigs.get(a.rig) : undefined;
      if (!rig || (rig.by !== null && rig.by !== a.id)) { a.task = null; a.timer = 1; return; }
      rig.by = a.id;
      return;
    }
    const p = this.plotAt.get(Math.floor(a.z) * N + Math.floor(a.x)), flip = this.rnd() < 0.5 ? -1 : 1;
    const ux = Math.cos(p?.angle ?? 0) * flip, uz = Math.sin(p?.angle ?? 0) * flip;
    a.heading = Math.atan2(ux, uz);
    a.lane = LANE_SPEED[t] ? [ux, uz] : null;
    a.lanePos = this.rnd() * 0.36;
  }

  /** À l'ouvrage aux champs : le semeur, le faucheur, celui qui glane avancent pas à pas le long des sillons (aller et retour) ; le tracteur suit les siens */
  private fieldStep(a: Agent, dt: number) {
    if (a.task === 'drive') {
      const rig = a.rig != null ? this.rigs.get(a.rig) : undefined;
      if (!rig || rig.by !== a.id) { a.task = null; return; }
      rig.d += dt * RIG_SPEED[rig.kind ?? 'plough'];
      [a.x, a.z, a.heading] = rigAt(rig.run, rig.d);
      return;
    }
    if (!a.lane) return;
    a.lanePos = (a.lanePos ?? 0) + dt * (LANE_SPEED[a.task!] ?? 0);
    const L = 0.36, m = a.lanePos % (2 * L), fwd = m < L, o = fwd ? m - L / 2 : L / 2 - (m - L);
    a.x = a.ax + a.lane[0] * o; a.z = a.az + a.lane[1] * o;
    // demi-tour au bout du rang, sans pivoter d'un coup
    const want = fwd ? Math.atan2(a.lane[0], a.lane[1]) : Math.atan2(-a.lane[0], -a.lane[1]);
    let dh = want - a.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    a.heading += dh * Math.min(1, dt * 5);
  }

  /**
   * Les engins : un par grande parcelle, dès l'Antiquité (bœufs), puis le tracteur et la moissonneuse (leur genre change avec la
   * saison, voir `stepRigs`), avec sa file de cases ; à l'âge futuriste, un drone agricole survole les plus grandes ;
   * refaits quand le monde ou l'âge change
   */
  private refreshRigs(age: number) {
    const keep = new Set<number>(), keepDrones = new Set<number>();
    this.runSet.clear();
    // les plus grandes parcelles d'abord, et quelques engins au plus
    const big = [...this.plots.values()].filter((p) => p.cells.length >= TRACTOR_CELLS).sort((p, q) => q.cells.length - p.cells.length).slice(0, MAX_RIGS);
    if (age >= MACHINE_AGE) big.forEach((p, rank) => {
      const run = longestRun(p);
      if (!run) return;
      const old = this.rigs.get(p.key);
      if (old && JSON.stringify(old.run) === JSON.stringify(run)) { keep.add(p.key); old.rank = rank; }
      else {
        if (old) this.dropRig(old);
        const mesh = new THREE.Mesh(rigGeo(machineOf(age, this.season, rank) ?? 'plough', age), mats.body);
        mesh.castShadow = true;
        this.group.add(mesh);
        this.rigs.set(p.key, { key: p.key, run, d: hash2(p.key, 3, 91) * 8, mesh, by: null, geoKey: '', rank, kind: null });
        keep.add(p.key);
      }
      for (const k of runCells(run)) this.runSet.add(k);
      // le drone : sur les plus grandes parcelles seulement
      if (age >= DRONE_AGE && rank < MAX_DRONES) {
        const od = this.drones.get(p.key);
        if (od && JSON.stringify(od.run) === JSON.stringify(run)) keepDrones.add(p.key);
        else {
          if (od) this.group.remove(od.mesh);
          const mesh = new THREE.Mesh(droneGeo(), mats.body);
          mesh.castShadow = true;
          mesh.scale.setScalar(1.5);
          const props = PROP_SPOTS.map(([x, y, z]) => { const m = new THREE.Mesh(propellerGeo(), mats.body); m.position.set(x, y, z); mesh.add(m); return m; });
          this.group.add(mesh);
          this.drones.set(p.key, { key: p.key, run, d: hash2(p.key, 5, 17) * 8, mesh, props });
          keepDrones.add(p.key);
        }
      }
    });
    for (const r of [...this.rigs.values()]) if (!keep.has(r.key)) this.dropRig(r);
    for (const [k, d] of [...this.drones]) if (!keepDrones.has(k)) { this.group.remove(d.mesh); this.drones.delete(k); }
    // on ne se tient pas sur la file d'un engin
    this.fields = this.fields.filter((k) => !this.runSet.has(k));
  }

  private dropRig(r: Rig) {
    this.group.remove(r.mesh);
    this.rigs.delete(r.key);
    for (const a of this.agents) if (a.rig === r.key) { a.rig = null; if (a.task === 'drive') { a.task = null; a.timer = 0; } }
  }

  /**
   * Les engins à leur place sur leur file : le genre du moment selon la saison (charrue ou remorque, botteleuse, épandeur,
   * moissonneuse…), garés quand personne ne les conduit ; les attelages de bœufs avancent seuls le jour, à la belle saison ;
   * les drones font leur ronde au-dessus des parcelles, hélices en rotation
   */
  private stepRigs(age: number, dt: number, hour: number) {
    for (const r of this.rigs.values()) {
      const kind = machineOf(age, this.season, r.rank) ?? 'plough', gk = `${age}|${kind}`;
      r.kind = kind;
      if (r.geoKey !== gk) { r.geoKey = gk; r.mesh.geometry = rigGeo(kind, age); }
      // un attelage de bœufs mène seul son labour ; rentré la nuit et l'hiver
      const shown = rigShown(kind, this.season, hour);
      r.mesh.visible = shown;
      if (isAutoRig(kind) && shown && working(hour)) r.d += dt * RIG_SPEED[kind];
      const [x, z, h] = rigAt(r.run, r.d);
      r.mesh.position.set(x, this.world.surfaceAt(x, z), z);
      r.mesh.rotation.y = h;
    }
    const flying = age >= DRONE_AGE && fieldSeason(this.season) && hour >= 7 && hour < 19;
    for (const dr of this.drones.values()) {
      dr.mesh.visible = flying;
      if (!flying) continue;
      dr.d += dt * 0.55;
      const [x, z, h] = rigAt(dr.run, dr.d);
      dr.mesh.position.set(x, this.world.surfaceAt(x, z) + 0.3 + Math.sin(dr.d * 3) * 0.012, z);
      dr.mesh.rotation.set(0.12, h, Math.sin(dr.d * 2) * 0.05, 'YXZ');
      for (let i = 0; i < dr.props.length; i++) dr.props[i].rotation.y += dt * (i % 2 ? 60 : -60);
    }
  }

  /** Les tracteurs des champs (les engins à moteur) : position et cap de chacun */
  tractors() { return [...this.rigs.values()].filter((r) => r.kind && isMotorRig(r.kind)).map((r) => rigAt(r.run, r.d)); }
  /** Tous les engins des champs : leur genre du moment, position et cap */
  machines() { return [...this.rigs.values()].filter((r) => r.kind).map((r) => ({ kind: r.kind!, visible: r.mesh.visible, at: rigAt(r.run, r.d) })); }
  /** Les drones qui volent : position et cap */
  flyingDrones() { return [...this.drones.values()].filter((d) => d.mesh.visible).map((d) => rigAt(d.run, d.d)); }

  /**
   * Où va travailler un habitant, et ce qu'il y fait : son champ (près de la ferme), la lisière (près du bûcheron), le ponton,
   * une ronde sur les rues autour du poste, ou à côté de son bâtiment, l'outil en main
   */
  private jobDest(a: Agent): Dest | null {
    const j = a.job!, b = this.world.buildings.get(j.b);
    if (!b) { a.job = null; return null; }
    const near = (cells: number[], r: number) => cells.filter((k) => Math.abs((k % N) - b.x) + Math.abs(Math.floor(k / N) - b.z) <= r);
    let d: Dest | null = null;
    if (j.kind === 'farmer') {
      // aux champs près de la ferme, à l'ouvrage de la saison ; l'hiver, il répare outils et clôtures devant la ferme
      const f = near(this.fields, 8);
      if (!fieldSeason(this.season)) { const s = this.beside(b); if (s) return { ...s, act: 'work', tool: 'hammer', work: true }; }
      else if (f.length && this.rnd() < 0.8) { const fd = this.fieldDest(f, b.kind === 'farm' ? b.id : null); if (fd) return fd; }
    }
    else if (j.kind === 'woodcutter') { const f = near(this.woods, 6); d = f.length ? this.cellDest(f) : null; }
    else if (j.kind === 'fisher' && b.kind === 'pier') d = this.onPier(b);
    else if (j.kind === 'guard') { const f = near(this.roads, 7); d = f.length ? this.cellDest(f) : null; }
    d ??= this.beside(b);
    return d && { ...d, act: JOB_ACT[j.kind], tool: TOOL_OF[j.kind], work: true };
  }

  private walkable(c: number, start: number, goal: number) {
    const w = this.world;
    const cx = c % N, cz = (c / N) | 0;
    // l'eau (mer, rivière, lac) ne se franchit que sur un pont
    if (!w.road[c] && (w.cellAvg(cx, cz) < 0.08 || w.lake[c])) return false;
    // ni dans un ravin ni à travers une grotte
    if (w.decor[c] && c !== start && c !== goal) return false;
    const o = w.occ[c];
    if (o && c !== start && c !== goal) {
      const b = w.buildings.get(o);
      if (!b || b.kind !== 'lamp') return false;
    }
    return true;
  }

  /** Dijkstra : routes privilégiées */
  findPath(start: number, goal: number): number[] | null {
    const w = this.world;
    if (start === goal) return [];
    const dist = new Float32Array(N * N).fill(1e9);
    const prev = new Int32Array(N * N).fill(-1);
    const heap = new Heap();
    dist[start] = 0; heap.push(0, start);
    const gx = goal % N, gz = (goal / N) | 0;
    let guard = 0;
    // garde-fou proportionnel à la carte : un trajet peut la traverser
    while (heap.size && guard++ < N * N) {
      const k = heap.keys[0];
      const c = heap.pop();
      const cx = c % N, cz = (c / N) | 0;
      // entrée périmée : la clé du tas inclut l'estimation restante, on la compare au coût connu plus cette estimation
      if (k > dist[c] + Math.abs(cx - gx) + Math.abs(cz - gz) + 1e-4) continue;
      if (c === goal) break;
      const ha = w.bridgeY(cx, cz) ?? w.cellAvg(cx, cz);
      for (let i = 0; i < 4; i++) {
        const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0), nz = cz + (i === 2 ? 1 : i === 3 ? -1 : 0);
        if (!w.inCells(nx, nz)) continue;
        const n = nz * N + nx;
        if (!this.walkable(n, start, goal)) continue;
        const hn = w.bridgeY(nx, nz) ?? w.cellAvg(nx, nz);
        const dh = Math.abs(hn - ha);
        if (dh > 1.0) continue;
        const nd = dist[c] + (w.road[n] ? 1 : 2.8) + dh * 3;
        if (nd < dist[n]) {
          dist[n] = nd; prev[n] = c;
          // estimation : une case de route au moins par pas restant (le coût minimal), pour rester exact
          heap.push(nd + Math.abs(nx - gx) + Math.abs(nz - gz), n);
        }
      }
    }
    if (prev[goal] < 0) return null;
    const out: number[] = [];
    for (let c = goal; c !== start && c >= 0; c = prev[c]) out.push(c);
    return out.reverse();
  }

  /** Un incendie : les pompiers et les habitants proches accourent avec des seaux */
  alert(cell: number) {
    const cx = cell % N + 0.5, cz = Math.floor(cell / N) + 0.5, b = this.world.buildings.get(this.world.occ[cell]);
    // les pompiers accourent de leur caserne (même de chez eux), puis les voisins qui passent, tous seau en main
    const crew = this.agents.filter((a) => a.job?.kind === 'firefighter' && !a.mission && Math.hypot(a.x - cx, a.z - cz) < 30).slice(0, 4);
    const near = this.agents.filter((a) => !a.hidden && !a.mission && !crew.includes(a) && Math.hypot(a.x - cx, a.z - cz) < 16).slice(0, Math.max(2, 6 - crew.length));
    for (const a of [...crew, ...near]) {
      a.goingHome = false;
      if (!b) { this.startPath(a, cell, false); continue; }
      const d = this.beside(b);
      if (d) this.go(a, { ...d, act: 'work', tool: 'bucket', urgent: true, blaze: b.id });
    }
  }

  /** Où se tiennent ceux qui jettent l'eau de leur seau sur ce bâtiment en feu (arrivés sur place) */
  pails(b: Building): [number, number][] {
    return this.agents.filter((a) => a.blaze === b.id && a.state === 'doing' && !a.hidden).map((a) => [a.x, a.z]);
  }

  /**
   * Place à côté d'un bâtiment où l'on ne rentre pas (puits, feu de camp, ferme, bâtiment en feu) : les deux quarts de chaque
   * case qui le borde, du côté du bâtiment, de préférence devant ; le dernier pas vers lui, face à lui. Jamais au milieu du
   * modèle ni sur quelqu'un d'autre (null si tout est pris)
   */
  private beside(b: Building, approach = 0.25): Dest | null {
    const w = this.world, s = sizeOf(b), f = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.rot];
    const cx = b.x + s / 2, cz = b.z + s / 2, free: Dest[] = [], front: Dest[] = [];
    for (let i = 0; i < s; i++) for (const [x, z] of [[b.x + i, b.z - 1], [b.x + i, b.z + s], [b.x - 1, b.z + i], [b.x + s, b.z + i]]) {
      if (!w.inCells(x, z)) continue;
      const k = w.ci(x, z);
      if (w.occ[k] || w.decor[k] || w.lake[k] || (!w.road[k] && w.cellAvg(x, z) < 0.08)) continue;
      // quarts tournés vers le bâtiment : au sud de la case s'il est au sud, etc.
      const qs = z === b.z - 1 ? [2, 3] : z === b.z + s ? [0, 1] : x === b.x - 1 ? [1, 3] : [0, 2];
      for (const q of qs) {
        const key = `c${k}:${q}`;
        if (this.held.has(key)) continue;
        const [x0, z0] = this.quarter(k, q), px = x0 + (cx - x0) * approach, pz = z0 + (cz - z0) * approach;
        const d: Dest = { cell: k, hidden: false, spot: [px, pz], face: Math.atan2(cx - px, cz - pz), hold: key };
        free.push(d);
        if ((f[0] ? x + 0.5 - cx : z + 0.5 - cz) * (f[0] || f[1]) > 0) front.push(d);
      }
    }
    // devant une fois sur deux, sinon n'importe quel côté (la place du village n'a pas de devant : on s'y rassemble tout autour)
    return (front.length && hasDoor(b.kind) && this.rnd() < 0.5 ? this.pick(front) : this.pick(free)) ?? null;
  }

  /** Centre d'un quart de case (0 : coin x-, z- ; 1 : x+ ; 2 : z+ ; 3 : x+, z+) */
  private quarter(k: number, q: number): [number, number] { return [(k % N) + 0.28 + (q % 2) * 0.44, Math.floor(k / N) + 0.28 + (q >> 1) * 0.44]; }

  /**
   * Un quart de case libre parmi des cases (champ, lisière, chemin), un peu décalé ; de préférence l'un de ceux que `prefer`
   * retient ; null si celles tirées sont pleines
   */
  private cellDest(cells: number[], prefer?: (k: number, q: number) => boolean): Dest | null {
    for (let n = 0; n < 4; n++) {
      const k = this.pick(cells);
      if (k === undefined) return null;
      const free = [0, 1, 2, 3].filter((i) => !this.held.has(`c${k}:${i}`)), inner = prefer ? free.filter((i) => prefer(k, i)) : [];
      const q = this.pick(inner.length ? inner : free);
      if (q === undefined) continue;
      const [x, z] = this.quarter(k, q);
      return { cell: k, hidden: false, spot: [x + (this.rnd() - 0.5) * 0.08, z + (this.rnd() - 0.5) * 0.08], hold: `c${k}:${q}` };
    }
    return null;
  }

  /** Le pêcheur va sur le ponton et regarde l'eau : deux places, au bout et un peu en retrait (null si elles sont prises) */
  private onPier(b: Building): Dest | null {
    const th = (b.rot * Math.PI) / 2, ca = Math.cos(th), sa = Math.sin(th), spots = b.age === 0 ? RAFT_SPOTS : DECK_SPOTS;
    const free = spots.map((_, i) => i).filter((i) => !this.held.has(`p${b.id}:${i}`));
    const i = this.pick(free);
    if (i === undefined) return null;
    const [lx, lz] = spots[i], x = b.x + 0.5 + lx * ca + lz * sa, z = b.z + 0.5 - lx * sa + lz * ca;
    return { cell: this.cellOf(b), hidden: false, spot: [x, z], face: th, deck: this.world.h(b.x, b.z) + (b.age === 0 ? 0.06 : 0.04), hold: `p${b.id}:${i}` };
  }

  private pick<T>(a: T[]): T | undefined { return a.length ? a[Math.floor(this.rnd() * a.length)] : undefined; }

  private cellOf(b: Building) { return b.z * N + b.x; }

  private chooseDest(hour: number, child = false, a: Agent | null = null): Dest | null {
    // un habitant arrivé depuis la dernière répartition : on répartit de nouveau les métiers
    if (a && !a.child && !a.hand && a.job === undefined) this.assignJobs();
    // les bras des champs : à leur parcelle aux heures de travail, du printemps à l'automne (le reste du temps, comme tout le monde)
    if (a?.hand && working(hour) && this.rnd() < 0.9) { const d = this.plotDest(a); if (d) return d; }
    // aux heures de travail, chacun va le plus souvent à son poste
    if (a?.job && working(hour) && this.rnd() < 0.8) { const d = this.jobDest(a); if (d) return d; }
    // le matin, les enfants vont à l'école (qui écoute le maître, qui joue dans la cour)
    if (child && hour >= 8 && hour < 12 && this.rnd() < 0.7) {
      const sc = [...this.world.buildings.values()].filter((b) => b.kind === 'school');
      const b = this.pick(sc), d = b && this.beside(b, 0.15);
      if (d) return { ...d, act: this.rnd() < 0.5 ? 'cheer' : 'play' };
    }
    const r = this.rnd();
    // les enfants vont jouer près des lieux de rencontre, des champs ou au bord des chemins
    if (child) {
      // aire de jeux, pelouse du jardin
      if (this.rnd() < 0.5) { const d = this.gardenDest(true); if (d) return d; }
      const play = this.socials.filter((b) => b.kind !== 'temple');
      // à côté du puits ou du feu, sans s'en approcher : ils courent en rond autour de leur place
      if (play.length && r < 0.5) { const d = this.beside(this.pick(play)!, 0); if (d) return d; }
      if (r < 0.7) { const d = this.cellDest(this.fields); if (d) return d; }
      const d = this.cellDest(this.roads);
      if (d) return d;
    }
    // bûcherons à la lisière
    if (r > 0.86) { const d = this.cellDest(this.woods); if (d) return d; }
    const socialBias = hour >= 12 && hour < 14.5 ? 0.7 : hour >= 17 ? 0.65 : 0.3;
    if (r < socialBias && (this.socials.length || this.gspots.length)) {
      // le jardin : une place libre (autour du feu, à l'ouvrage, dans les gradins, sur un banc…)
      if (!this.socials.length || this.rnd() < 0.55) { const d = this.gardenDest(false); if (d) return d; }
      const b = this.pick(this.socials);
      // on entre au temple ; au puits, au feu de camp ou sur la place, on reste à côté
      if (b?.kind === 'temple') return { cell: this.cellOf(b), hidden: true };
      const d = b && this.beside(b);
      if (d) return d;
    }
    if (r < socialBias + 0.4 && this.rnd() < 0.5) { const d = this.cellDest(this.fields); if (d) return d; }
    if (this.works.length && this.rnd() < 0.8) {
      const b = this.pick(this.works)!;
      // pêcheurs sur le ponton, fermiers devant la ferme (s'il reste de la place), les autres entrent
      const d = b.kind === 'pier' ? this.onPier(b) : b.kind === 'farm' ? this.beside(b) : { cell: this.cellOf(b), hidden: true };
      if (d) return d;
    }
    return this.cellDest(this.roads);
  }

  /** Un habitant de plus, chez lui ; `hand` : un bras des champs (un adulte, sans autre métier) */
  private addAgent(hand = false) {
    const houses = [...this.world.buildings.values()].filter(isHome);
    if (!houses.length) return;
    const h = this.pick(houses)!;
    const id = this.nextId++;
    this.agents.push({
      id, home: h.id, x: h.x + 0.5, z: h.z + 0.5, state: 'inside', path: [], pi: 0, timer: this.rnd() * 4, hidden: true, speed: 0.9 + this.rnd() * 0.5,
      heading: 0, phase: this.rnd() * 6, goingHome: false, targetHidden: false, skin: Math.floor(this.rnd() * SKIN.length), col: Math.floor(this.rnd() * 5), off: (this.rnd() - 0.5) * 0.28, lat: 0, actor: null, actorKey: '',
      spot: null, face: null, deck: null, child: this.rnd() < 0.22 && !hand, ax: 0, az: 0, act: null, hold: null, mission: false, delay: 0, rest: 0, ride: null, shore: null,
      kit: null, kitKey: '', props: [], mount: null, mounted: false, parked: null, rider: null, soldier: null,
      ...(hand ? { hand: true, plot: null, job: null } : {}),
    });
    if (hand) this.plotsDirty = true;
  }

  private sendHome(a: Agent) {
    const hb = this.world.buildings.get(a.home);
    if (!hb) { // maison détruite : en choisir une autre
      const houses = [...this.world.buildings.values()].filter(isHome);
      const h = this.pick(houses);
      if (!h) { a.state = 'inside'; a.hidden = true; return; }
      a.home = h.id;
      this.sendHome(a);
      return;
    }
    a.goingHome = true;
    this.release(a);
    this.startPath(a, this.cellOf(hb), true);
  }

  private go(a: Agent, d: Dest) {
    this.release(a);
    this.startPath(a, d.cell, d.hidden);
    // pas de chemin : il reste où il est, à terre
    if (a.state !== 'walking') return;
    a.spot = d.spot ?? null;
    a.face = d.face ?? null;
    a.deck = d.deck ?? null;
    a.act = d.act ?? null;
    a.tool = d.tool ?? null;
    a.urgent = !!d.urgent;
    a.blaze = d.blaze ?? null;
    a.timer = d.work ? -1 : a.timer;
    if (d.hold) { a.hold = d.hold; this.held.set(d.hold, a.id); }
    // aux champs : son ouvrage, ce qu'il tient de la main gauche, la grange ; le tracteur qu'il va prendre lui est réservé
    a.task = d.task ?? null; a.tool2 = d.tool2 ?? null; a.barn = d.barn ?? null; a.load = !!d.carry; a.rig = d.rig ?? null;
    if (d.rig != null) { const r = this.rigs.get(d.rig); if (r) r.by = a.id; }
    // champ, lisière, chemin : pas tous au milieu de la case
    if (!d.spot && !d.hidden) { const cx = (d.cell % N) + 0.5, cz = Math.floor(d.cell / N) + 0.5; a.spot = [cx + (this.rnd() - 0.5) * 0.5, cz + (this.rnd() - 0.5) * 0.5]; }
  }

  // ---------- Expéditions ----------

  private byId(id: number) { return this.agents.find((a) => a.id === id); }

  /** Habitants blessés qui se reposent chez eux */
  injured() { return this.agents.reduce((n, a) => n + (a.rest > 0 ? 1 : 0), 0); }

  /** Habitants adultes libres (ni en expédition, ni blessés) */
  available() {
    const busy = this.agents.reduce((n, a) => n + (a.mission || a.rest > 0 ? 1 : 0), 0);
    return Math.max(0, Math.floor(this.popTarget * ABLE) - busy);
  }

  /**
   * Enrôle une équipe : d'abord les passants qu'on voit, puis d'autres habitants qui sortent de chez eux (on n'en montre
   * qu'une partie) ; null s'il n'y a pas assez de monde
   */
  recruit(n: number): number[] | null {
    if (this.available() < n) return null;
    const free = this.agents.filter((a) => !a.child && !a.mission && a.rest <= 0).sort((a, b) => +a.hidden - +b.hidden);
    while (free.length < n) {
      const before = this.agents.length;
      this.addAgent();
      if (this.agents.length === before) return null;
      const a = this.agents[this.agents.length - 1];
      a.child = false;
      free.push(a);
    }
    const team = free.slice(0, n);
    for (const a of team) {
      this.release(a);
      if (a.hidden) { const hb = this.world.buildings.get(a.home); if (hb) { a.x = hb.x + 0.5; a.z = hb.z + 0.5; } }
      a.mission = true; a.goingHome = false; a.hidden = false; a.delay = 0; a.ride = null; a.shore = null;
      a.state = 'doing'; a.timer = 1e9; a.act = null; a.path = []; a.spot = null; a.face = null; a.deck = null;
      // un bras des champs parti en expédition laisse sa place aux champs (un autre la prend) ; au retour, il est un habitant comme les autres
      if (a.hand) { a.hand = false; a.plot = null; a.job = undefined; this.plotsDirty = true; }
      a.task = null; a.tool2 = null; a.load = false; a.lane = null;
    }
    return team.map((a) => a.id);
  }

  /** L'équipe se rend en (x, z), en file, et s'y range en cercle, tournée vers le centre */
  partyGo(ids: number[], x: number, z: number, stagger = 0.7) {
    const cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
    ids.forEach((id, i) => {
      const a = this.byId(id);
      if (!a) return;
      this.ride(id, null);
      this.startPath(a, cz * N + cx, false);
      a.act = null;
      if (a.state !== 'walking') return;
      const ang = (i / Math.max(1, ids.length)) * Math.PI * 2 + 0.4;
      a.spot = [x + Math.cos(ang) * 0.3, z + Math.sin(ang) * 0.3];
      a.face = Math.atan2(x - a.spot[0], z - a.spot[1]);
      a.delay = i * stagger;
    });
  }

  /** Équipe un membre d'expédition (null : il rend tout, et son cheval rentre à l'écurie) */
  equip(id: number, kit: Kit | null) {
    const a = this.byId(id);
    if (!a) return;
    a.kit = kit;
    a.mounted = !!kit?.horse || !!kit?.car || !!kit?.tank;
    if (!kit?.car && a.car) { this.group.remove(a.car); a.car.geometry.dispose(); a.car = null; }
    if (!kit?.horse && a.mount) { a.mount.mixer.stopAllAction(); this.group.remove(a.mount.root); a.mount = null; a.parked = null; }
    if (!kit?.rider && a.rider) { this.group.remove(a.rider.root); a.rider = null; }
    if (!kit?.armor && a.soldier) { this.group.remove(a.soldier.root); a.soldier = null; }
  }

  /** En selle (en route) ou pied à terre (sur place, le cheval broute à côté) */
  mountParty(ids: number[], on: boolean) { for (const id of ids) { const a = this.byId(id); if (a?.kit?.horse || a?.kit?.car || a?.kit?.tank) a.mounted = on; } }

  /** L'équipe disparaît de la surface (descendue sous terre) ; elle réapparaît dès qu'elle se remet en route */
  partyHide(ids: number[], hidden: boolean) { for (const id of ids) { const a = this.byId(id); if (a) { a.hidden = hidden; a.targetHidden = hidden; } } }

  /** L'équipe posée en (x, z), à quelques pas les uns des autres (descendue d'un train) : elle repart de là */
  partyPlace(ids: number[], x: number, z: number) {
    ids.forEach((id, i) => {
      const a = this.byId(id);
      if (!a) return;
      const ang = i * 2.4;
      a.x = x + Math.cos(ang) * 0.18; a.z = z + Math.sin(ang) * 0.18;
      a.path = []; a.spot = null; a.ride = null; a.shore = null;
    });
  }

  /** Toute l'équipe est arrivée (ou s'est arrêtée faute de chemin) */
  partyDone(ids: number[]) { return ids.every((id) => { const a = this.byId(id); return !a || a.state !== 'walking'; }); }

  /** L'équipe, sur place : au travail, en fête… */
  partyAct(ids: number[], act: Act | null) { for (const id of ids) { const a = this.byId(id); if (a) a.act = act; } }

  /** Un membre de l'équipe se rend seul en (x, z) sur place (approcher une bête, passer d'un buisson à l'autre), tourné vers `face` */
  memberGo(id: number, x: number, z: number, face: number | null = null) {
    const a = this.byId(id);
    if (!a || a.ride || !a.mission) return;
    const cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
    this.startPath(a, cz * N + cx, false);
    a.act = null;
    if (a.state === 'walking') { a.spot = [x, z]; a.face = face; a.delay = 0; }
  }

  /** Ce membre est arrivé (ou ne marche pas) */
  memberDone(id: number) { const a = this.byId(id); return !a || a.state !== 'walking'; }

  /** Membre porté (assis dans une barque…) à la place donnée ; null le repose sur la berge, là où il est monté */
  ride(id: number, r: Ride | null) {
    const a = this.byId(id);
    if (!a) return;
    if (r) {
      if (!a.ride) a.shore = [a.x, a.z];
      a.ride = r; a.x = r.x; a.z = r.z; a.heading = r.heading;
      a.state = 'doing'; a.path = []; a.act = r.act === undefined ? 'sit' : r.act;
    } else if (a.ride) {
      a.ride = null;
      if (a.shore) { a.x = a.shore[0]; a.z = a.shore[1]; a.shore = null; }
      a.act = 'work';
    }
  }

  /** Hauteur où se tient le premier membre visible de l'équipe : assis dans une barque, sur un ponton, ou au sol */
  partyLeadY(ids: number[]) {
    const a = ids.map((id) => this.byId(id)).find((x): x is Agent => !!x && !x.hidden);
    if (!a) return null;
    return a.ride ? a.ride.y : a.deck ?? this.world.surfaceAt(a.x, a.z);
  }

  /**
   * Où est la main droite du porte-fanion (le premier membre visible de l'équipe), dans le monde : le fanion y est tenu et la
   * suit dans sa marche. Null si son corps n'est pas dessiné (à cheval, en cavalerie) : le fanion se pose alors près de lui
   */
  partyHand(ids: number[]): [number, number, number] | null {
    const a = ids.map((id) => this.byId(id)).find((x): x is Agent => !!x && !x.hidden);
    const f = a?.actor;
    if (!a || !f || !f.root.visible) return null;
    const v = new THREE.Vector3();
    f.hands[0].getWorldPosition(v);
    return [v.x, v.y, v.z];
  }

  /** Positions des membres de l'équipe, dans l'ordre de marche */
  partyPositions(ids: number[]) { return ids.map((id) => this.byId(id)).filter((a): a is Agent => !!a && !a.hidden).map((a) => [a.x, a.z, a.heading] as [number, number, number]); }

  /** Fin de l'expédition : chacun rentre chez lui ; les premiers `injured` se reposent `rest` secondes de jeu */
  dismiss(ids: number[], injured = 0, rest = 0) {
    ids.forEach((id, i) => {
      const a = this.byId(id);
      if (!a) return;
      this.ride(id, null);
      this.equip(id, null);
      a.mission = false; a.act = null; a.delay = 0;
      if (i < injured) a.rest = rest;
      this.sendHome(a);
    });
  }

  /** Une place libre dans un jardin, pour un enfant ou un adulte */
  private gardenDest(kid: boolean): Dest | null {
    const free: number[] = [];
    for (let i = 0; i < this.gspots.length; i++) if (!!this.gspots[i].kid === kid && !this.held.has(`g${i}`)) free.push(i);
    const i = this.pick(free);
    if (i === undefined) return null;
    const s = this.gspots[i];
    return { cell: Math.floor(s.z) * N + Math.floor(s.x), hidden: false, spot: [s.x, s.z], face: s.face, deck: s.seat ? this.world.hAt(s.x, s.z) + s.seat + (s.act === 'sit' ? SIT_LIFT : 0) : undefined, act: s.act, hold: `g${i}` };
  }

  private release(a: Agent) {
    if (a.hold && this.held.get(a.hold) === a.id) this.held.delete(a.hold);
    a.hold = null;
    // il laisse le tracteur (garé là où il s'arrête) et descend par le côté
    const r = a.rig != null ? this.rigs.get(a.rig) : undefined;
    if (r?.by === a.id) {
      r.by = null;
      if (a.task === 'drive' && a.state === 'doing') { a.x += Math.cos(a.heading) * 0.15; a.z -= Math.sin(a.heading) * 0.15; }
    }
    a.rig = null;
  }

  /** Places des jardins : refaites quand le monde ou l'âge change */
  private refreshGardens(age: number) {
    this.gspots = [];
    for (const g of findGardens(this.world)) this.gspots.push(...layoutGarden(this.world, g, age).spots);
    // les places des jardins sont refaites : on les libère toutes
    for (const k of this.held.keys()) if (k[0] === 'g') this.held.delete(k);
    for (const a of this.agents) if (a.hold?.[0] === 'g') a.hold = null;
  }

  private startPath(a: Agent, goal: number, hiddenAtEnd: boolean) {
    a.spot = null; a.face = null; a.deck = null; a.act = null;
    a.task = null; a.load = false; a.lane = null;
    const start = Math.min(N - 1, Math.max(0, Math.floor(a.z))) * N + Math.min(N - 1, Math.max(0, Math.floor(a.x)));
    const p = this.findPath(start, goal);
    this.pathBudget--;
    if (!p) { a.state = 'doing'; a.timer = 2 + this.rnd() * 2; a.targetHidden = false; a.path = []; if (a.goingHome) { a.goingHome = false; a.state = 'inside'; a.hidden = true; } return; }
    a.path = p; a.pi = 0; a.state = 'walking'; a.hidden = false; a.targetHidden = hiddenAtEnd;
  }

  /** `season` : 0 printemps, 1 été, 2 automne, 3 hiver (les travaux des champs en dépendent) */
  update(dt: number, hour: number, age: number, sheltering: boolean, popTarget: number, glowNight: number, season = 0) {
    const w = this.world;
    this.popTarget = popTarget;
    this.season = season; this.age = age;
    if (w.version !== this.lastVersion) { this.lastVersion = w.version; this.refreshTargets(); }
    const key = `${w.version}|${age}`;
    if (key !== this.spotKey) { this.spotKey = key; this.refreshGardens(age); this.refreshRigs(age); }
    // les passants qu'on voit, plus les bras des champs (autant que les champs en emploient, à l'échelle des passants), plus
    // les membres des expéditions en cours
    const away = this.agents.reduce((n, a) => n + (a.mission ? 1 : 0), 0);
    const hands = fieldHands(this.fieldCount, popTarget);
    let nh = this.agents.reduce((n, a) => n + (a.hand ? 1 : 0), 0);
    // des bras de trop (champs arrachés, village qui décline) : ils redeviennent de simples passants
    for (let i = this.agents.length - 1; i >= 0 && nh > hands; i--) {
      const a = this.agents[i];
      if (a.hand) { a.hand = false; a.plot = null; a.job = undefined; nh--; this.plotsDirty = true; }
    }
    const want = Math.min(MAX_AGENTS, Math.min(MAX_SHOWN, Math.floor(popTarget * SHOWN)) + hands + away);
    while (this.agents.length < want) { const n = this.agents.length; this.addAgent(nh < hands); if (this.agents.length === n) break; if (this.agents[n].hand) nh++; }
    // trop de monde dehors : on retire d'abord ceux qui sont chez eux, jamais ceux qui sont en expédition
    while (this.agents.length > want) {
      let i = this.agents.findIndex((a) => !a.mission && a.hidden);
      if (i < 0) { i = this.agents.length - 1; while (i >= 0 && this.agents[i].mission) i--; }
      if (i < 0) break;
      const [a] = this.agents.splice(i, 1);
      if (a.hand) this.plotsDirty = true;
      this.release(a); this.dropActor(a);
    }
    if (this.plotsDirty) { this.plotsDirty = false; this.assignPlots(); }

    const night = hour >= 20.5 || hour < 5.5 || sheltering;
    this.pathBudget = 4;
    for (const a of this.agents) {
      a.phase += dt * 8 * a.speed * (a.urgent ? 1.8 : 1);
      if (a.rest > 0) a.rest -= dt;
      if (a.state === 'inside') {
        a.timer -= dt;
        // un blessé reste chez lui le temps de guérir
        if (!night && a.timer <= 0 && a.rest <= 0 && this.pathBudget > 0) {
          const hb = w.buildings.get(a.home);
          if (!hb) { this.sendHome(a); continue; }
          a.x = hb.x + 0.5; a.z = hb.z + 0.5;
          const d = this.chooseDest(hour, a.child, a);
          a.goingHome = false;
          if (d) this.go(a, d); else a.timer = 3;
        }
      } else if (a.state === 'walking') {
        // l'équipe d'une expédition part en file, chacun à son tour
        if (a.mission && a.delay > 0) { a.delay -= dt; continue; }
        // le feu est éteint avant qu'il n'arrive : il ne court plus
        if (a.urgent && a.blaze != null && !this.burning(a.blaze)) a.urgent = false;
        if (a.pi >= a.path.length) {
          // dernier pas hors de la route (bout du ponton)
          if (a.spot) {
            const dx = a.spot[0] - a.x, dz = a.spot[1] - a.z, dist = Math.hypot(dx, dz), step = dt * a.speed * 0.7;
            if (dist > step) { a.x += (dx / dist) * step; a.z += (dz / dist) * step; a.heading = Math.atan2(dx, dz); continue; }
            a.x = a.spot[0]; a.z = a.spot[1]; a.spot = null;
          }
          if (a.face !== null) { a.heading = a.face; a.face = null; }
          this.arrive(a, night);
          continue;
        }
        const c = a.path[a.pi];
        const last = a.pi === a.path.length - 1;
        const [px, pz] = w.passPoint(a.path, a.pi);
        // sur une rue en ville (hors ponts), on longe le bord : le trottoir, d'un côté ou de l'autre ; l'écart se lisse d'une case à l'autre
        const walk = !last && !a.mission && w.road[c] && w.bridgeY(c % N, Math.floor(c / N)) === null ? sidewalkAt(this.age) * (a.off < 0 ? -1 : 1) : 0;
        a.lat += (walk - a.lat) * Math.min(1, dt * 3);
        let tx = px, tz = pz;
        if (!last) {
          // sens de la rue : du point d'avant à celui-ci (au premier pas, de celui-ci au suivant)
          const [qx, qz] = a.pi > 0 ? w.passPoint(a.path, a.pi - 1) : a.path.length > 1 ? w.passPoint(a.path, 1) : [px, pz];
          const k = 1 - Math.abs(a.lat) / SIDEWALK;
          [tx, tz] = sideStep(px + a.off * k, pz + a.off * 0.7 * k, a.pi > 0 ? px - qx : qx - px, a.pi > 0 ? pz - qz : qz - pz, a.lat);
        }
        const dx = tx - a.x, dz = tz - a.z, dist = Math.hypot(dx, dz);
        // l'équipe d'une expédition marche du même pas
        const step = dt * (a.mission ? (a.mounted ? (a.kit?.car ? CAR_SPEED : RIDE_SPEED) : 1.05) : a.speed * (a.urgent ? 2.2 : 1)) * (w.road[c] ? 1.1 : 0.8);
        if (dist <= step) { a.x = tx; a.z = tz; a.pi++; }
        else {
          // le pas tourne en douceur vers le point visé (droit dessus pour le dernier, quand on y est presque) ; et l'on vise
          // déjà le point suivant avant d'atteindre celui-ci : les virages s'arrondissent au lieu d'aller de case en case
          const ux = dx / dist, uz = dz / dist, k = (last && dist < 0.4) || a.vx === undefined ? 1 : 1 - Math.exp(-dt * 9);
          let vx = (a.vx ?? ux) + (ux - (a.vx ?? ux)) * k, vz = (a.vz ?? uz) + (uz - (a.vz ?? uz)) * k;
          const l = Math.hypot(vx, vz) || 1;
          vx /= l; vz /= l;
          a.vx = vx; a.vz = vz;
          a.x += vx * step; a.z += vz * step; a.heading = Math.atan2(vx, vz);
          if (!last && dist - step < 0.28) a.pi++;
        }
        // le bâtiment visé cache l'habitant dès qu'il en atteint la case
        if (last && a.targetHidden && dist < 0.35) a.hidden = true;
        // un obstacle posé sur le chemin : on recalcule
        const nc = a.path[a.pi];
        if (nc !== undefined && w.occ[nc] && nc !== a.path[a.path.length - 1] && w.buildings.get(w.occ[nc])?.kind !== 'lamp') { a.path = []; a.pi = 0; }
        if (night && !a.goingHome && !a.mission && this.pathBudget > 0) this.sendHome(a);
      } else if (a.state === 'doing') {
        // en expédition : il fait ce qu'on lui a dit, jusqu'au prochain ordre
        if (a.mission) continue;
        a.timer -= dt;
        // au seau, on ne s'en va pas tant que ça brûle
        if (a.blaze != null && this.burning(a.blaze)) a.timer = Math.max(a.timer, 1.5);
        // l'enfant court en rond autour de l'endroit où il joue (sauf aux jeux, où il reste devant)
        if (a.child && !a.hidden && (!a.act || a.act === 'run')) {
          const t = a.phase * 0.18;
          a.x = a.ax + Math.cos(t) * 0.22; a.z = a.az + Math.sin(t) * 0.22;
          a.heading = Math.atan2(-Math.sin(t), Math.cos(t));
        }
        // aux champs : le semeur et le faucheur suivent les sillons, le tracteur les siens
        if (a.task && !a.hidden) this.fieldStep(a, dt);
        if (night && !a.goingHome) { if (this.pathBudget > 0) this.sendHome(a); }
        else if (a.timer <= 0 && this.pathBudget > 0) {
          a.hidden = false;
          // la moisson faite, il porte sa gerbe à la grange ; sinon il choisit où aller
          const d = this.carryDest(a) ?? this.chooseDest(hour, a.child, a);
          if (d) this.go(a, d); else a.timer = 3;
        }
      }
    }
    this.stepRigs(age, dt, hour);
    this.render(age, dt);
  }

  private arrive(a: Agent, night: boolean) {
    a.urgent = false;
    if (a.mission) { a.state = 'doing'; a.timer = 1e9; a.hidden = false; a.ax = a.x; a.az = a.z; return; }
    if (a.goingHome) { a.goingHome = false; a.state = 'inside'; a.hidden = true; a.timer = 1 + this.rnd() * 5; return; }
    a.state = 'doing';
    // on s'attarde au coin du feu, sur un banc ou dans les gradins ; à l'ouvrage, bien plus longtemps
    a.timer = a.timer === -1 ? 14 + this.rnd() * 12 : (a.act === 'sit' || a.act === 'cheer' ? 10 : 4) + this.rnd() * 8;
    a.hidden = a.targetHidden;
    a.ax = a.x; a.az = a.z;
    // à la grange, il pose sa charge et repart ; aux champs, il se met à l'ouvrage
    if (a.load) { a.load = false; a.tool = null; a.timer = 1.5 + this.rnd() * 2; }
    else if (a.task) this.startTask(a);
  }

  /** Sol sous l'habitant : platelage du ponton une fois sorti de la route, tablier des ponts, sinon le relief */
  private groundY(a: Agent) {
    if (a.ride) return a.ride.y;
    return a.deck !== null && a.state !== 'inside' && a.pi >= a.path.length ? a.deck : this.world.surfaceAt(a.x, a.z);
  }

  /** Habitant dessiné : la tenue de son époque, son cap, son geste selon ce qu'il fait */
  private animateActor(a: Agent, age: number, dt: number): boolean {
    // ceux qui travaillent aux champs (bras des champs, paysans de la ferme) en ont la tenue
    const farmer = !!a.hand || a.job?.kind === 'farmer';
    const key = `${Math.min(age, 5)}|${a.child ? 1 : 0}|${farmer ? 1 : 0}`;
    if (a.actorKey !== key) {
      this.dropActor(a);
      a.actor = makeFolk({ age, v: a.id, child: a.child, size: 0.94 + (a.id % 5) * 0.03, farmer });
      a.actorKey = key;
      this.group.add(a.actor.root);
    }
    const act = a.actor!;
    const kitKey = `${a.actorKey}|${JSON.stringify(a.kit)}|${a.tool ?? ''}|${a.tool2 ?? ''}`;
    if (a.kitKey !== kitKey) { a.kitKey = kitKey; this.dress(a); }
    // charge de cavalerie : en selle, le cavalier de l'époque (cheval compris) prend sa place
    if (this.stepRider(a, age)) { act.root.visible = false; return true; }
    if (this.stepSoldier(a, age)) { act.root.visible = false; return true; }
    const riding = a.kit?.car ? this.stepCar(a) : this.stepMount(a, dt);
    act.root.visible = !a.hidden;
    if (a.hidden) return true;
    // aux champs : le geste de son ouvrage (au volant du tracteur, assis), sa charge portée à deux bras jusqu'à la grange
    const field = a.mission ? null : a.state === 'walking' && a.load ? (['carry', 1.6] as const) : a.state === 'doing' && a.task ? FIELD_POSE[a.task] : null;
    const lift = riding ? (a.kit?.car ? CAR_SEAT : SADDLE) : a.state === 'doing' && a.task === 'drive' ? seatOf(a.rig != null ? this.rigs.get(a.rig)?.kind : null) : 0;
    act.root.position.set(a.x, this.groundY(a) + lift, a.z);
    act.root.rotation.y = a.heading;
    const running = a.child && (!a.act || a.act === 'run');
    const pose: FolkPose = riding ? 'sit'
      : field ? field[0]
      : a.state === 'walking' || (running && a.state === 'doing') ? ((running && a.state === 'doing') || a.urgent ? 'run' : 'walk')
      : a.state === 'doing' ? (a.act === 'sit' ? 'sit' : a.act === 'cheer' || a.act === 'play' ? 'cheer' : a.act === 'stroll' || (a.mission && !a.act) ? (a.tool === 'book' || a.job?.kind === 'merchant' ? 'talk' : 'idle') : 'work')
      : 'idle';
    folkStep(act, a.phase * (field && !riding ? field[1] : pose === 'run' ? 1.1 : pose === 'walk' ? 1.6 : 1), pose);
    void dt;
    return true;
  }

  /**
   * Met dans les mains de l'habitant ce qu'il porte : l'arme ou l'outil de son métier dans la droite, la torche ou le
   * bouclier dans la gauche, la corde en bandoulière (les accessoires sont dessinés pour des habitants de 0,3 : à l'échelle
   * de son bras)
   */
  private dress(a: Agent) {
    for (const o of a.props) o.parent?.remove(o);
    a.props = [];
    const k = a.kit, f = a.actor;
    if ((!k && !a.tool && !a.tool2) || !f) return;
    const hold = (name: keyof typeof PROPS, side: 0 | 1, flame = false) => {
      const m = new THREE.Mesh(PROPS[name](), mats.body);
      m.castShadow = true;
      if (flame) m.add(new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.045, 5).translate(0, 0.095, 0), PROP_FLAME));
      holdFolk(f, side, m, HOLD[name]);
      a.props.push(m);
    };
    // hors expédition, l'outil de son métier ; aux champs, le sac de semences ou le panier dans la gauche
    if (!k) { if (a.tool) hold(a.tool, 0); if (a.tool2) hold(a.tool2, 1); return; }
    if (k.weapon) hold(k.weapon, 0);
    if (k.torch) hold('torch', 1, true);
    else if (k.armor) hold('shield', 1);
    if (k.rope) {
      const r = new THREE.Mesh(PROPS.rope(), mats.body);
      r.position.set(0, 0.16, -0.034);
      r.rotation.z = 0.5;
      f.body.add(r);
      a.props.push(r);
    }
  }

  /** Le cavalier de l'époque qui remplace un membre de la charge de cavalerie tant qu'il est en selle ; vrai s'il est affiché */
  private stepRider(a: Agent, age: number) {
    const on = !!a.kit?.rider && a.mounted && !a.ride && !a.hidden;
    if (a.rider && (!on || a.rider.root.userData.age !== Math.min(age, 4))) { this.group.remove(a.rider.root); a.rider = null; }
    if (!on) return false;
    if (!a.rider) {
      a.rider = makeRider(age, a.id);
      a.rider.root.userData.age = Math.min(age, 4);
      this.group.add(a.rider.root);
    }
    a.rider.root.position.set(a.x, this.groundY(a), a.z);
    a.rider.root.rotation.y = a.heading;
    rideStep(a.rider, a.phase * 1.6, a.state === 'walking' ? 1 : 0, 'rest');
    return true;
  }

  /** Le soldat de l'époque qui remplace un membre en armure tant qu'il va à pied ; vrai s'il est affiché */
  private stepSoldier(a: Agent, age: number) {
    const on = !!a.kit?.armor && !((a.kit.horse || a.kit.car) && a.mounted) && !a.ride && !a.hidden;
    if (a.soldier && (!on || a.soldier.root.userData.age !== Math.min(age, 5))) { this.group.remove(a.soldier.root); a.soldier = null; }
    if (!on) return false;
    if (!a.soldier) {
      a.soldier = makeSoldier(age, a.id, !!a.kit?.torch);
      a.soldier.root.userData.age = Math.min(age, 5);
      this.group.add(a.soldier.root);
    }
    a.soldier.root.position.set(a.x, this.groundY(a), a.z);
    a.soldier.root.rotation.y = a.heading;
    soldierStep(a.soldier, a.phase * 1.6, a.state === 'walking' ? 'walk' : a.act === 'cheer' ? 'cheer' : a.act === 'work' ? 'fight' : 'guard');
    return true;
  }

  /** Sa voiture : il est au volant en route ; sur place, elle reste garée à côté. Renvoie vrai s'il est au volant */
  private stepCar(a: Agent) {
    if (!a.car) { a.car = new THREE.Mesh(jeepGeo(a.id), mats.body); a.car.castShadow = true; this.group.add(a.car); }
    const c = a.car, driving = a.mounted && !a.ride && !a.hidden;
    c.visible = !a.hidden;
    if (driving) {
      // le volant devant lui : la voiture avance un peu sous lui
      const x = a.x + Math.sin(a.heading) * 0.045, z = a.z + Math.cos(a.heading) * 0.045;
      c.position.set(x, this.groundY(a), z);
      c.rotation.y = a.heading;
      // garée en retrait, un peu derrière et à côté de là où il met pied à terre : pas au milieu de ce que fait l'équipe
      a.parked = [x - Math.sin(a.heading) * 0.32 + Math.cos(a.heading) * 0.16, z - Math.cos(a.heading) * 0.32 - Math.sin(a.heading) * 0.16, a.heading + 0.5];
    } else if (a.parked) {
      const [x, z, h] = a.parked;
      c.position.set(x, this.world.surfaceAt(x, z), z);
      c.rotation.y = h;
    }
    return driving;
  }

  /** Son cheval : sous lui en route ; sur place, il broute là où il a mis pied à terre. Renvoie vrai s'il est en selle */
  private stepMount(a: Agent, dt: number) {
    if (!a.kit?.horse || !hasModel('horse')) return false;
    if (!a.mount) { a.mount = makeActor('horse', 0.34); if (!a.mount) return false; a.mount.mixer.setTime(a.id * 0.7); this.group.add(a.mount.root); }
    const m = a.mount, riding = a.mounted && !a.ride && !a.hidden;
    m.root.visible = !a.hidden;
    if (riding) {
      m.root.position.set(a.x, this.groundY(a), a.z);
      m.root.rotation.y = a.heading;
      a.parked = [a.x + Math.cos(a.heading) * 0.2, a.z - Math.sin(a.heading) * 0.2, a.heading + 0.6];
      play(m, a.state === 'walking' ? ['Run', 'Walk', 'Idle'] : ['Idle', 'Idle_Eating']);
    } else if (a.parked) {
      const [x, z, h] = a.parked;
      m.root.position.set(x, this.world.surfaceAt(x, z), z);
      m.root.rotation.y = h;
      play(m, ['Idle_Eating', 'Idle']);
    }
    m.mixer.update(dt);
    return riding;
  }

  private render(age: number, dt: number) {
    const w = this.world, d = this.d;
    const palette = BODY_COLS[Math.min(age, 5)];
    let n = 0;
    for (const a of this.agents) {
      if (this.animateActor(a, age, dt)) continue;
      if (a.hidden) continue;
      const bob = a.state === 'walking' ? Math.abs(Math.sin(a.phase)) * 0.025 : a.state === 'doing' ? Math.abs(Math.sin(a.phase * 0.6)) * 0.012 : 0;
      d.position.set(a.x, this.groundY(a) + 0.02 + bob, a.z);
      d.rotation.set(a.state === 'walking' ? Math.sin(a.phase) * 0.08 : 0, a.heading, 0);
      const cs = a.child ? 0.65 : 1;
      d.scale.set(cs, cs * (1 + (a.state === 'walking' ? Math.sin(a.phase * 2) * 0.04 : 0)), cs);
      d.updateMatrix();
      this.body.setMatrixAt(n, d.matrix);
      this.head.setMatrixAt(n, d.matrix);
      this.col.setHex(palette[a.col % palette.length]);
      this.body.setColorAt(n, this.col);
      this.col.setHex(SKIN[a.skin]);
      this.head.setColorAt(n, this.col);
      // outil porté sur le côté
      const ts = a.child ? 0 : TOOL_SCALE[Math.min(age, 5)];
      d.translateX(0.1); d.translateY(0.02);
      d.rotation.z = a.state === 'doing' ? Math.sin(a.phase) * 0.8 : 0.1;
      d.scale.set(ts, ts, ts);
      d.updateMatrix();
      d.matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0, 0));
      this.tool.setMatrixAt(n, d.matrix);
      n++;
    }
    for (const m of [this.body, this.head, this.tool]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
