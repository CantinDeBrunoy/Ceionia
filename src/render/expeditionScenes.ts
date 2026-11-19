import * as THREE from 'three';
import { World, N, SEA, VEG_FOREST, VEG_CAVE } from '../world/world';
import { Agents, type Act, type Ride } from '../sim/agents';
import { ActiveExpedition, seaClearance, SEA_CLEAR, openWater, seaRoomMap, huntSpot, PEACE_TRIPS, TRIP_OUT, TRIP_MEET, TRIP_LEAVE, TRIP_BOARD, TRIP_HOME } from '../sim/expeditions';
import { HerdKind, Scene, BoatKind, boatKindFor, VOLCANIC } from '../sim/missions';
import { nearestVolcano, volcanoGate, volcanoIsle } from '../sim/volcano';
import { VolcanoSite } from './volcanoSite';
import { makeActor, play, hasModel, Actor, ModelName } from './assets';
import { makeFolk, folkStep, Folk, FolkPose, FolkRole } from './folk';
import { balloonBasketGeo, balloonEnvelopeGeo } from './balloon';
import { locoGeo } from './railway';
import { Parts } from './parts';
import { mats } from './materials';
import type { CombatFx } from './combatFx';
import { rocketGeo, ROCKET_H, ROCKET_R, RocketKind } from './rocket';
import { SPACEPAD, sharkGeometry, sharkSwim, crocodile, tentacle, krakenHead, harpoon } from './models';
import { makeBeast } from './beasts';
import { Building, sizeOf } from '../build/catalog';
import { FloatIsles, FLOAT_LAND, FLOAT_BACK } from './floatIsles';
import { Salvage } from './galleon';
import { rod, sail3, shipHull, type V3 } from './models/orientShips';
import { townPlans } from '../world/rivalTown';

/** Modèle et taille (longueur du corps) des bêtes des expéditions */
export const ANIMAL: Record<HerdKind | 'wolf', [ModelName, number]> = { sheep: ['sheep', 0.2], cow: ['cow', 0.3], pig: ['pig', 0.17], horse: ['horse', 0.34], wolf: ['wolf', 0.3] };

/** Longueur du loup articulé à l'échelle 1 (de la truffe au bout de la queue) */
const WOLF_LEN = 0.34;
/**
 * Le loup des expéditions : la bête articulée de la faune (trot, galop, hurlement, morsure), longue de `len` ; ses gestes
 * répondent aussi aux noms de ceux des modèles importés (course, coup de tête, sursaut) qu'emploient les scènes
 */
function wolfActor(len: number, seed: number): Actor {
  const a = makeBeast('wolf', Math.floor(Math.abs(seed * 7)) % 3, len / WOLF_LEN, 0.92 + (Math.abs(seed * 13) % 1) * 0.14);
  for (const [alias, clip] of [['Run', 'Gallop'], ['Headbutt', 'Attack'], ['Jump_Start', 'Hit'], ['Idle_Eating', 'Eating'], ['WalkSlow', 'Walk']]) {
    const c = a.actions.get(clip);
    if (c && !a.actions.has(alias)) a.actions.set(alias, c);
  }
  return a;
}

// ---------------- Accessoires (géométries partagées, faites à la première demande) ----------------
const cache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: (p: Parts) => void) {
  let g = cache.get(key);
  if (!g) { const p = new Parts(); make(p); g = p.build(false).body; cache.set(key, g); }
  return g;
}
const tentGeo = () => geo('tent', (p) => {
  // toile rayée, entrée sombre, mâts qui dépassent
  p.gable(0.36, 0.3, 0.34, 0, 0, 0, 0xc8643a);
  p.gable(0.37, 0.12, 0.13, 0, 0.18, 0, 0xe8d6b0);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.181, 0, 0.07, 0.181, 0, -0.07, 0.181, 0.17, 0], 3)), 0, 0, 0, 0x3a2a22);
  p.box(0.014, 0.34, 0.014, 0.18, 0, 0, 0x7a6355);
  p.box(0.014, 0.34, 0.014, -0.18, 0, 0, 0x7a6355);
});
const fireGeo = () => geo('fire', (p) => {
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; p.sphere(0.025, Math.cos(a) * 0.075, 0.012, Math.sin(a) * 0.075, 0x8a857c); }
  for (const r of [0, 1.05, 2.1]) p.box(0.022, 0.022, 0.13, 0, 0.01, 0, 0x6a4a34, r);
});
/** Un triangle à deux faces (une voile, un fanion), dans un plan vertical x = constante */
function sailTri(p: Parts, x: number, pts: [number, number][], color: number) {
  const v = pts.flatMap(([y, z]) => [x, y, z]), r = pts.slice().reverse().flatMap(([y, z]) => [x, y, z]);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...v, ...r], 3)), 0, 0, 0, color);
}
/**
 * Les embarcations des expéditions, proue vers +z, ligne de flottaison à y = 0 (voir `boatKindFor`) : la pirogue creusée dans
 * un tronc, la barque à rames, le voilier à deux voiles, le vapeur à roues à aubes, la vedette moderne, l'hydroglisseur
 * futuriste, la galère à rames et boucliers
 */
const BOAT_MAKE: Record<BoatKind, (p: Parts) => void> = {
  canoe: (p) => {
    p.add(new THREE.IcosahedronGeometry(0.1, 1).scale(0.6, 0.4, 1.7), 0, 0.02, 0, 0x7a5a3c);
    p.add(new THREE.IcosahedronGeometry(0.08, 1).scale(0.5, 0.15, 1.5), 0, 0.055, 0, 0xa8845a);
    p.box(0.1, 0.008, 0.02, 0, 0.05, 0.04, 0x6a4a30);
    p.box(0.1, 0.008, 0.02, 0, 0.05, -0.06, 0x6a4a30);
  },
  rowboat: (p) => {
    const side = 0x9a6a44, dark = 0x6f4a30;
    p.box(0.15, 0.012, 0.3, 0, 0, 0, dark);
    for (const s of [-1, 1]) { p.box(0.014, 0.05, 0.3, s * 0.07, 0, 0, side); p.box(0.008, 0.008, 0.28, s * 0.11, 0.035, 0.01, 0xb08458, s * 0.45); }
    p.box(0.15, 0.05, 0.014, 0, 0, -0.15, side);
    p.box(0.1, 0.05, 0.05, 0, 0, 0.17, side);
    p.box(0.05, 0.05, 0.04, 0, 0, 0.21, side);
    p.box(0.13, 0.01, 0.045, 0, 0.032, 0.06, 0xb08458);
    p.box(0.13, 0.01, 0.045, 0, 0.032, -0.08, 0xb08458);
  },
  sail: (p) => {
    // caravelle latine : coque galbée de bois à liston et préceinte, petit château arrière à fenêtres et fanal, gouvernail,
    // beaupré ; trois mâts (grand mât, misaine, artimon) à voiles latines gonflées et laize rouge, flammes rouges, haubans. Le
    // milieu du pont reste libre : l'équipe s'y tient (`BOAT_SEAT`)
    const side = 0x8a5a38, dark = 0x5f3e28, wood = 0x5a3e2e, cloth = 0xf4ecdc, red = 0xc8443a, rope = 0x4a3a2c;
    const h = shipHull(p, { L: 0.5, B: 0.17, depth: 0.05, top: 0.07, bow: 0.04, stern: 0.04, transom: 0.66, fine: 1.2, under: 0x2e241c, side, band: 0xc9a46c, deck: 0xb08458, inner: dark, wales: [0.035], waleCol: dark });
    // le château arrière : deux fenêtres et le fanal à la poupe, la lisse, le gouvernail
    const cy = h(-0.2) - 0.022;
    p.box(0.11, 0.045, 0.1, 0, cy, -0.2, 0x9a6a44);
    p.box(0.116, 0.007, 0.104, 0, cy + 0.045, -0.2, 0xb08458);
    for (const x of [-0.022, 0.022]) p.box(0.016, 0.016, 0.004, x, cy + 0.016, -0.252, 0xe8b860);
    p.box(0.014, 0.022, 0.014, 0, cy + 0.052, -0.24, 0xe8c66a);
    p.cone(0.011, 0.014, 4, 0, cy + 0.074, -0.24, wood);
    for (const s of [-1, 1]) rod(p, [s * 0.055, cy + 0.065, -0.25], [s * 0.055, cy + 0.065, -0.15], 0.003, wood);
    p.box(0.01, 0.1, 0.026, 0, -0.05, -0.258, wood);
    // le beaupré
    rod(p, [0, h(0.22) - 0.01, 0.2], [0, 0.15, 0.36], 0.005, wood);
    // les mâts et leurs voiles latines : la vergue penchée, l'amure en avant, le point d'écoute en arrière
    const mast = (z: number, y0: number, H: number, sz: number) => {
      p.cyl(0.005, 0.008, H, 5, 0, y0, z, wood);
      const top = y0 + H, tack: V3 = [0.012, y0 + H * 0.24, z + sz * 0.75], peak: V3 = [0.012, top + 0.02, z - sz * 0.85];
      rod(p, [0.01, tack[1] - 0.01, tack[2] + 0.02], [0.01, peak[1] + 0.01, peak[2] - 0.02], 0.004, wood);
      sail3(p, tack, peak, [0.012, y0 + H * 0.12 + 0.02, z - sz * 0.6], cloth, sz * 0.18, red);
      sailTri(p, 0, [[top, z], [top - 0.02, z], [top - 0.012, z - 0.07]], red);
      for (const s of [-1, 1]) rod(p, [0, top - 0.02, z], [s * h.beam(z - 0.03) * 1.02, h(z - 0.03) - 0.01, z - 0.03], 0.0015, rope);
    };
    mast(0.04, h(0.04) - 0.022, 0.42, 0.2);
    mast(0.17, h(0.17) - 0.022, 0.3, 0.15);
    mast(-0.18, cy + 0.045, 0.24, 0.12);
    rod(p, [0, h(0.04) + 0.38, 0.04], [0, 0.15, 0.36], 0.0015, rope);
  },
  steam: (p) => {
    // coque de fer, flottaison rouge, roues à aubes, cabine blanche, cheminée noire à bague rouge
    const iron = 0x3a3f48;
    p.box(0.14, 0.05, 0.34, 0, 0, 0, iron);
    p.box(0.145, 0.012, 0.34, 0, 0.0, 0, 0xb0392e);
    p.box(0.1, 0.05, 0.07, 0, 0, 0.2, iron);
    p.box(0.05, 0.05, 0.05, 0, 0, 0.255, iron);
    p.box(0.13, 0.008, 0.34, 0, 0.05, 0, 0xa07850);
    p.box(0.1, 0.06, 0.12, 0, 0.056, -0.05, 0xece8de);
    p.box(0.11, 0.008, 0.13, 0, 0.116, -0.05, 0x8a8f96);
    p.box(0.07, 0.04, 0.05, 0, 0.056, 0.1, 0xece8de);
    for (const s of [-1, 1]) {
      p.add(new THREE.CylinderGeometry(0.052, 0.052, 0.014, 10).rotateZ(Math.PI / 2), s * 0.095, 0.05, -0.04, 0x8a5a38);
      p.add(new THREE.BoxGeometry(0.016, 0.1, 0.012), s * 0.095, 0.05, -0.04, 0x5a3e2e, 0, false, 0, 0.8);
      p.add(new THREE.BoxGeometry(0.016, 0.1, 0.012), s * 0.095, 0.05, -0.04, 0x5a3e2e, 0, false, 0, -0.8);
    }
    p.cyl(0.024, 0.03, 0.14, 8, 0, 0.12, -0.02, 0x2a2a2e);
    p.cyl(0.027, 0.027, 0.014, 8, 0, 0.215, -0.02, 0xb0392e);
    p.cyl(0.03, 0.026, 0.02, 8, 0, 0.234, -0.02, 0x2a2a2e);
  },
  launch: (p) => {
    // vedette : coque blanche à liseré bleu, étrave haute, cabine vitrée, radar, deux moteurs hors-bord
    p.box(0.13, 0.045, 0.34, 0, 0, -0.02, 0xf4f4f2);
    p.box(0.134, 0.012, 0.34, 0, 0.03, -0.02, 0x2a5ea8);
    p.add(new THREE.BoxGeometry(0.1, 0.04, 0.12), 0, 0.022, 0.2, 0xf4f4f2, 0, false, 0, -0.3);
    p.add(new THREE.BoxGeometry(0.05, 0.035, 0.08), 0, 0.03, 0.27, 0xf4f4f2, 0, false, 0, -0.35);
    p.box(0.1, 0.05, 0.12, 0, 0.045, -0.03, 0xf4f4f2);
    p.add(new THREE.BoxGeometry(0.09, 0.03, 0.01), 0, 0.085, 0.05, 0x86c4d8, 0, false, 0, 0.5);
    p.box(0.102, 0.012, 0.13, 0, 0.095, -0.03, 0x2a5ea8);
    p.cyl(0.004, 0.004, 0.06, 5, 0, 0.107, -0.04, 0x5d6878);
    p.box(0.05, 0.006, 0.012, 0, 0.165, -0.04, 0x8a8f96);
    for (const s of [-1, 1]) p.box(0.026, 0.06, 0.04, s * 0.035, 0.0, -0.205, 0x2a2a2e);
  },
  hover: (p) => {
    // hydroglisseur futuriste : jupe basse bleu nuit, coque blanche profilée, bulle de verre, deux grandes hélices carénées
    p.box(0.19, 0.022, 0.34, 0, 0, 0, 0x2f4a66);
    p.add(new THREE.BoxGeometry(0.15, 0.028, 0.26), 0, 0.034, -0.02, 0xf4f4f2);
    p.add(new THREE.BoxGeometry(0.11, 0.025, 0.1), 0, 0.03, 0.18, 0xf4f4f2, 0, false, 0, -0.3);
    p.add(new THREE.IcosahedronGeometry(0.055, 1).scale(1, 0.75, 1.5), 0, 0.075, 0.03, 0x7fd0e8);
    p.box(0.152, 0.006, 0.26, 0, 0.056, -0.02, 0x6af0ff);
    for (const s of [-1, 1]) {
      p.add(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 10).rotateX(Math.PI / 2), s * 0.05, 0.085, -0.165, 0x8a8f96);
      p.add(new THREE.BoxGeometry(0.06, 0.004, 0.006), s * 0.05, 0.085, -0.178, 0x3c3c40);
      p.box(0.01, 0.04, 0.02, s * 0.05, 0.05, -0.15, 0x5d6878);
    }
    p.box(0.012, 0.05, 0.03, 0, 0.056, -0.15, 0x6af0ff);
  },
  galley: (p) => {
    // galère de guerre : longue coque de bois, éperon, boucliers au bordage, rames, voile carrée rayée
    const side = 0x8a5a38, dark = 0x5f3e28;
    p.box(0.17, 0.012, 0.5, 0, 0, 0, dark);
    for (const s of [-1, 1]) p.box(0.016, 0.06, 0.5, s * 0.085, 0, 0, side);
    p.box(0.17, 0.06, 0.016, 0, 0, -0.25, side);
    p.box(0.13, 0.06, 0.06, 0, 0, 0.27, side);
    p.box(0.06, 0.05, 0.05, 0, 0, 0.325, side);
    p.add(new THREE.ConeGeometry(0.02, 0.09, 5).rotateX(Math.PI / 2), 0, 0.012, 0.405, 0x8a8f96);
    p.box(0.1, 0.1, 0.03, 0, 0, -0.27, side);
    p.box(0.06, 0.04, 0.03, 0, 0.1, -0.28, 0xe8c04a);
    p.box(0.15, 0.008, 0.46, 0, 0.045, 0, 0xc9a46c);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 8).rotateZ(Math.PI / 2), s * 0.095, 0.062, -0.2 + i * 0.075, i % 2 ? 0xc8443a : 0xe8c04a);
      p.box(0.12, 0.004, 0.008, s * 0.15, 0.03, -0.2 + i * 0.075, 0xb08458, 0, false, s * 0.35);
    }
    p.cyl(0.006, 0.009, 0.32, 5, 0, 0.05, 0.04, 0x5a3e2e);
    p.box(0.22, 0.008, 0.008, 0, 0.3, 0.04, 0x5a3e2e);
    for (let k = 0; k < 3; k++) p.box(0.21, 0.05, 0.006, 0, 0.18 + k * 0.05, 0.04, k % 2 ? 0xc8443a : 0xf4ecdc);
  },
};
const boatGeo = (kind: BoatKind = 'rowboat') => geo(`boat:${kind}`, BOAT_MAKE[kind]);
/** La galère de guerre (partagée avec la traversée vers l'île du portail, voir `isleFerry`) */
export const galleyGeo = () => boatGeo('galley');
/** Hauteur du siège des passagers au-dessus de l'eau selon l'embarcation, et haut de la cheminée du vapeur (pour sa fumée) */
const BOAT_SEAT: Record<BoatKind, number> = { canoe: 0.0, rowboat: 0.03, sail: 0.05, steam: 0.06, launch: 0.06, hover: 0.07, galley: 0.05 };
const STEAM_FUNNEL: [number, number, number] = [0, 0.26, -0.02];
/** La faune marine : à défaut du modèle de Quaternius, un dauphin, une baleine, une raie dessinés (longueur 1, nez vers +z) */
type SwimKind = 'dolphin' | 'whale' | 'manta' | 'school';
interface Swimmer {
  kind: SwimKind; obj: THREE.Group; actor: Actor | null; len: number;
  /** le centre de sa ronde, le niveau de l'eau, son rayon, son angle, son sens, sa vitesse (rad/s) */
  cx: number; cz: number; level: number; r: number; ang: number; dir: number; w: number;
  /** son saut en cours (0 … 1, -1 : il nage), la durée et la hauteur du prochain, l'attente avant lui */
  jump: number; next: number; dur: number; height: number;
  x: number; z: number; heading: number;
}
/**
 * Le monstre de la chasse en mer : le mégalodon (un aileron géant qui rôde, puis des bonds) ou le kraken (tentacules qui
 * jaillissent de l'eau, tête qui se dresse) ; son centre (la galère au large), le niveau de l'eau, le rayon de sa ronde,
 * l'angle, le bond en cours (0 … 1, -1 : aucun) et ceux déjà faits, les harpons reçus, son tressaillement, l'attente avant
 * le prochain harpon, la mort (secondes)
 */
interface Monster {
  kind: 'megalodon' | 'kraken'; obj: THREE.Group; cx: number; cz: number; level: number; r: number; ang: number;
  breach: number; bs: number; done: number; hits: number; flinch: number; dart: number; death: number;
  /** tentacules du kraken : leur base (angle, rayon), leur élan (0 … 1), le temps qu'elles repoussent après un coup de harpon */
  tents: { obj: THREE.Mesh; ang: number; r: number; up: number; cut: number; ph: number }[];
  /** les bras du kraken, attachés sous sa tête (ils ondulent sur l'eau autour d'elle) */
  arms: THREE.Object3D[];
  /** l'issue est tombée (voir `ActiveExpedition.fate`) : la dernière volée de harpons est partie */
  ended: boolean;
}
/** Écart entre le point de combat et chacune des deux galères qui encadrent le monstre des mers */
const DUEL_GAP = 1.6;
/** Hauteur des pieds des hommes d'armes debout dans la galère, en part de celle d'un rameur assis */
const WAR_STAND = 0.5;
/** Le dénivelé le plus fort (en hauteur de terrain) entre la troupe et l'antre du dragon ou la bête : au-delà, l'antre est posé au niveau de la troupe */
const LAIR_STEP = 0.35;
/** Avancement du travail où le mégalodon bondit hors de l'eau (le dernier bond retombe avant l'issue du combat) */
const MEGA_BREACH = [0.4, 0.56, 0.7];
// le bond : durée (s), vitesse horizontale (par seconde), profondeur de départ et hauteur de l'arc au-dessus de l'eau
const MEGA_LEAP = 2, MEGA_VH = 1.25, MEGA_Y0 = -0.45, MEGA_YH = 0.95;
const sharkGeo = (big = false) => sharkGeometry(big);
const krakenHeadGeo = () => geo('krakenHead', (p) => krakenHead(p));
const tentacleGeo = () => geo('tentacle', (p) => tentacle(p));
const harpoonGeo = () => geo('harpoon', (p) => harpoon(p));
const crocGeo = () => geo('croc', (p) => crocodile(p));
const crocJawGeo = () => geo('crocJaw', (p) => crocodile(p, true));
const swimGeo = (kind: 'dolphin' | 'whale' | 'manta') => geo(`swim:${kind}`, (p) => {
  if (kind === 'manta') {
    p.add(new THREE.BoxGeometry(0.62, 0.035, 0.62), 0, 0.01, 0, 0x2c3d5c, Math.PI / 4);
    p.add(new THREE.BoxGeometry(0.58, 0.03, 0.58), 0, -0.012, 0, 0xe8ecf0, Math.PI / 4);
    for (const s of [-1, 1]) p.box(0.1, 0.04, 0.16, s * 0.07, 0, 0.42, 0x2c3d5c);
    p.box(0.012, 0.012, 0.42, 0, 0, -0.62, 0x2c3d5c);
    return;
  }
  const whale = kind === 'whale', back = whale ? 0x55607a : 0x7f97ab, belly = whale ? 0xe4e8ee : 0xe0e8ee;
  p.add(new THREE.IcosahedronGeometry(0.5, 1).scale(whale ? 0.3 : 0.2, whale ? 0.26 : 0.22, 1), 0, 0, 0, back);
  p.add(new THREE.IcosahedronGeometry(0.46, 1).scale(whale ? 0.24 : 0.17, 0.13, 0.96), 0, -0.07, 0.01, belly);
  if (!whale) p.add(new THREE.ConeGeometry(0.05, 0.16, 5).rotateX(Math.PI / 2), 0, -0.02, 0.56, back);
  p.add(new THREE.ConeGeometry(0.07, 0.2, 3).scale(0.25, 1, 1), 0, whale ? 0.2 : 0.17, -0.05, back, 0, false, 0, -0.5);
  for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.05, 0.28, 3).scale(1, 1, 0.25), s * (whale ? 0.18 : 0.12), -0.06, 0.18, back, 0, false, s * 1.2, 0.3);
  // la queue : deux lobes horizontaux
  p.add(new THREE.ConeGeometry(0.08, whale ? 0.34 : 0.26, 3).scale(1, 1, 0.22), whale ? 0.17 : 0.13, 0.0, -0.5, back, 0, false, -1.35);
  p.add(new THREE.ConeGeometry(0.08, whale ? 0.34 : 0.26, 3).scale(1, 1, 0.22), whale ? -0.17 : -0.13, 0.0, -0.5, back, 0, false, 1.35);
  for (const s of [-1, 1]) p.box(0.014, 0.014, 0.014, s * (whale ? 0.12 : 0.085), 0.03, 0.4, 0x1a1a1e);
});
const rodGeo = () => geo('rod', (p) => p.add(new THREE.CylinderGeometry(0.003, 0.006, 0.42, 4).translate(0, 0.21, 0), 0, 0, 0, 0x6a4a34));
const bobberGeo = () => geo('bobber', (p) => { p.sphere(0.014, 0, 0.004, 0, 0xffffff); p.sphere(0.0145, 0, 0.012, 0, 0xd8443a, 0, 0.6); });
/** Pour les marins du large : la longue-vue de laiton (voyage) et la gaffe à crochet avec son grappin (épave) */
const glassGeo = () => geo('glass', (p) => {
  p.add(new THREE.CylinderGeometry(0.007, 0.0045, 0.15, 6).translate(0, 0.075, 0), 0, 0, 0, 0xb08a3c);
  p.add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.012, 6).translate(0, 0.15, 0), 0, 0, 0, 0x5a3e2e);
  p.add(new THREE.CylinderGeometry(0.0075, 0.0075, 0.02, 6).translate(0, 0.03, 0), 0, 0, 0, 0x6a4a34);
});
const gaffeGeo = () => geo('gaffe', (p) => {
  p.add(new THREE.CylinderGeometry(0.004, 0.006, 0.5, 5).translate(0, 0.25, 0), 0, 0, 0, 0x6a4a34);
  p.box(0.006, 0.03, 0.006, 0, 0.5, 0.0, 0x4a4e56);
  p.box(0.006, 0.006, 0.026, 0, 0.516, 0.013, 0x4a4e56);
});
const grappleGeo = () => geo('grapple', (p) => {
  p.sphere(0.01, 0, 0, 0, 0x3a3e46);
  for (const r of [0, 1.57, 3.14, 4.71]) p.box(0.004, 0.02, 0.004, Math.sin(r) * 0.012, -0.008, Math.cos(r) * 0.012, 0x3a3e46, r);
});
const fishGeo = () => geo('fish', (p) => {
  p.sphere(0.03, 0, 0, 0, 0xc9cdd2, 0, 0.55);
  p.add(new THREE.ConeGeometry(0.02, 0.035, 3).rotateX(-Math.PI / 2), 0, 0, -0.04, 0xa8adb4);
});
const rocksGeo = () => geo('rocks', (p) => {
  for (const [x, z, r, c] of [[0, 0, 0.13, 0x8d8a84], [0.13, 0.05, 0.09, 0x7d7a74], [-0.1, 0.08, 0.08, 0x9a958c], [0.04, -0.12, 0.085, 0x86827b], [-0.07, -0.06, 0.07, 0x7a766f]] as number[][])
    p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 1), x, r * 0.55, z, c);
  for (const [x, y, z, c] of [[0.05, 0.16, 0.03, 0xd8a64a], [-0.08, 0.1, 0.1, 0x8fb3c9], [0.14, 0.11, -0.02, 0xd8a64a], [-0.02, 0.13, -0.1, 0xb0574a]] as number[][])
    p.add(new THREE.IcosahedronGeometry(0.022, 0), x, y, z, c);
});
/** Pan de falaise : blocs gris dressés, rognons de silex noirs à cortex blanc sur la face */
const cliffGeo = () => geo('cliff', (p) => {
  for (const [x, h, r, c] of [[-0.24, 0.3, 0.13, 0x8d8a84], [-0.08, 0.44, 0.15, 0x9a958c], [0.09, 0.38, 0.14, 0x86827b], [0.24, 0.26, 0.12, 0x928e86], [0, 0.6, 0.11, 0xa29d94]] as number[][])
    p.add(new THREE.DodecahedronGeometry(r, 0).scale(1, h / r / 2, 0.8), x, h / 2, -0.04, c);
  for (const [x, y] of [[-0.2, 0.14], [-0.06, 0.28], [0.1, 0.18], [0.02, 0.42], [0.22, 0.1], [-0.12, 0.06]]) {
    p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 0.75, 0.6), x, y, 0.07, 0xe8e2d4);
    p.add(new THREE.IcosahedronGeometry(0.022, 0).scale(1, 0.75, 0.6), x, y, 0.088, 0x2e3038);
  }
});
const cartGeo = () => geo('cart', (p) => {
  p.box(0.14, 0.06, 0.2, 0, 0.05, 0, 0x9a7452);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8).rotateZ(Math.PI / 2), s * 0.08, 0.04, 0, 0x5a3e2e);
  for (const s of [-1, 1]) p.box(0.012, 0.012, 0.16, s * 0.05, 0.08, 0.15, 0x7a6355);
});
const bushGeo = () => geo('bush', (p) => {
  p.sphere(0.11, 0, 0.09, 0, 0x4f8a45, 1, 0.8);
  p.sphere(0.07, 0.07, 0.07, 0.04, 0x5c9a50, 1, 0.8);
  for (let i = 0; i < 11; i++) {
    const a = i * 2.4, y = 0.05 + (i % 4) * 0.03, r = 0.1 - Math.abs(y - 0.09) * 0.5;
    p.sphere(0.014, Math.cos(a) * r, y, Math.sin(a) * r, i % 3 ? 0xc8344a : 0x5a3a8a);
  }
});
const basketGeo = () => geo('basket', (p) => { p.cyl(0.06, 0.045, 0.06, 8, 0, 0, 0, 0xb08a5a); p.cyl(0.064, 0.064, 0.008, 8, 0, 0.056, 0, 0x8a6a44); });
const berriesGeo = () => geo('berries', (p) => { for (let i = 0; i < 9; i++) p.sphere(0.018, Math.cos(i * 2.1) * 0.03, (i % 3) * 0.012, Math.sin(i * 2.1) * 0.03, i % 3 ? 0xc8344a : 0x5a3a8a); });
const postGeo = () => geo('post', (p) => { p.box(0.026, 0.17, 0.026, 0, 0, 0, 0x8a6a4a); p.box(0.03, 0.012, 0.03, 0, 0.17, 0, 0x6f5238); });
const railGeo = () => geo('rail', (p) => p.box(0.01, 0.01, 1, 0, 0, -0.5, 0x9a7a5a));
const stoneGeo = () => geo('stone', (p) => { p.box(0.1, 0.05, 0.06, 0, 0, 0, 0x9a958c); p.box(0.07, 0.04, 0.055, 0.01, 0.05, 0, 0x8a857c); });
const trackGeo = () => geo('track', (p) => {
  for (const z of [0.07, 0.22]) p.box(0.17, 0.014, 0.035, 0, 0, z, 0x5a4232);
  for (const s of [-1, 1]) p.box(0.012, 0.016, 0.3, s * 0.05, 0.014, 0.15, 0x8a8f96);
});
const foamGeo = () => geo('foam', (p) => p.sphere(0.026, 0, 0, 0, 0xffffff, 0));
const puffGeo = () => geo('puff', (p) => p.sphere(0.03, 0, 0, 0, 0xb8b2a8, 0));
/** Tronçon de la voie qu'on pose (le long de +z, de 0 à 0,3) : ballast, quatre traverses, deux rails et leurs éclisses */
const laidGeo = () => geo('laid', (p) => {
  p.box(0.22, 0.012, 0.3, 0, 0, 0.15, 0xa8a29a);
  for (let k = 0; k < 4; k++) p.box(0.17, 0.014, 0.034, 0, 0.01, 0.04 + k * 0.074, 0x5a4232);
  for (const s of [-1, 1]) { p.box(0.012, 0.016, 0.3, s * 0.05, 0.024, 0.15, 0x8a8f96); p.box(0.016, 0.01, 0.03, s * 0.05, 0.024, 0.0, 0x5d6168); }
});
/** Plate-forme du train de chantier (avant = +z) : châssis, roues, rails et traverses chargés, ridelles */
const flatcarGeo = () => geo('flatcar', (p) => {
  p.box(0.15, 0.03, 0.26, 0, 0.045, 0, 0x4a4a4e);
  for (const z of [-0.08, 0.08]) for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.026, 0.026, 0.014, 8).rotateZ(Math.PI / 2), s * 0.05, 0.026, z, 0x2a2a2e);
  for (let k = 0; k < 3; k++) p.box(0.012, 0.012, 0.24, -0.04 + k * 0.04, 0.075 + (k % 2) * 0.012, 0, 0x8a8f96);
  for (let k = 0; k < 5; k++) p.box(0.14, 0.014, 0.03, 0, 0.087, -0.1 + k * 0.05, 0x5a4232);
  for (const s of [-1, 1]) p.box(0.006, 0.03, 0.26, s * 0.072, 0.075, 0, 0x6a4a34);
});
/** Les rails et les traverses en réserve au départ du chantier */
const railStockGeo = () => geo('railstock', (p) => {
  for (let k = 0; k < 4; k++) p.box(0.012, 0.012, 0.36, -0.03 + (k % 2) * 0.03, 0.012 * Math.floor(k / 2), 0, 0x8a8f96);
  for (let k = 0; k < 6; k++) p.box(0.17, 0.016, 0.034, 0.2, 0.016 * Math.floor(k / 2), -0.06 + (k % 2) * 0.05, 0x5a4232, 0.1);
});

// ---------------- Accessoires du cœur des missions ----------------
const sacksGeo = () => geo('sacks', (p) => {
  for (const [x, z, s] of [[0, 0, 1], [0.08, 0.05, 0.85], [-0.07, 0.06, 0.9], [0.02, -0.08, 0.8]] as number[][]) {
    p.sphere(0.05 * s, x, 0.045 * s, z, 0xd9c4a0, 0, 1.25);
    p.cyl(0.012 * s, 0.018 * s, 0.03 * s, 6, x, 0.1 * s, z, 0xb8a07a);
  }
});
const potsGeo = () => geo('pots', (p) => {
  for (const [x, z, s, c] of [[0, 0, 1, 0xc8743a], [0.09, 0.03, 0.8, 0xb8623a], [-0.08, 0.05, 0.75, 0xd88a50], [0.03, -0.08, 0.7, 0xa85a34]] as number[][]) {
    p.sphere(0.045 * s, x, 0.045 * s, z, c, 1, 1.1);
    p.cyl(0.022 * s, 0.03 * s, 0.035 * s, 7, x, 0.085 * s, z, c);
    p.add(new THREE.TorusGeometry(0.03 * s, 0.006, 3, 8).rotateX(Math.PI / 2), x, 0.035 * s, z, 0xf2e2c4);
  }
});
const foodGeo = () => geo('food', (p) => {
  p.box(0.12, 0.07, 0.09, 0, 0, 0, 0xb48a5e);
  for (const [x, z, c] of [[-0.03, -0.01, 0xd8443a], [0.02, 0.02, 0xe8b84a], [0.035, -0.02, 0x7cc46a]] as number[][]) p.sphere(0.022, x, 0.08, z, c);
  p.cyl(0.035, 0.035, 0.03, 8, 0.12, 0, 0.04, 0xe8c66a);
});
const blanketGeo = () => geo('blanket', (p) => {
  for (let i = 0; i < 6; i++) p.box(0.07, 0.006, 0.4, -0.175 + i * 0.07, 0.002, 0, [0xc8643a, 0xe8d6b0, 0x4a7aa8][i % 3]);
});
const hutGeo = () => geo('hut', (p) => {
  p.cyl(0.16, 0.17, 0.16, 9, 0, 0, 0, 0xb08a64);
  p.cone(0.22, 0.24, 9, 0, 0.16, 0, 0xdcc080);
  p.box(0.07, 0.11, 0.02, 0, 0, 0.165, 0x3a2a22);
});
const yurtGeo = () => geo('yurt', (p) => {
  p.cyl(0.19, 0.19, 0.15, 12, 0, 0, 0, 0xf0e8d8);
  for (const y of [0.05, 0.11]) p.cyl(0.192, 0.192, 0.012, 12, 0, y, 0, 0xc8643a);
  p.cone(0.21, 0.12, 12, 0, 0.15, 0, 0xe0d4bc);
  p.cyl(0.025, 0.025, 0.02, 6, 0, 0.27, 0, 0x7a6355);
  p.box(0.07, 0.11, 0.02, 0, 0, 0.19, 0xc8643a);
});
const poolGeo = (reeds: boolean) => geo(`pool${+reeds}`, (p) => {
  p.cyl(0.33, 0.33, 0.012, 14, 0, 0, 0, 0x5a8a8a);
  p.cyl(0.3, 0.3, 0.012, 14, 0, 0.012, 0, 0x7fd0dc);
  for (let i = 0; i < 13; i++) { const a = (i / 13) * Math.PI * 2; p.sphere(0.05 + (i % 3) * 0.012, Math.cos(a) * 0.34, 0.02, Math.sin(a) * 0.34, i % 2 ? 0x9d9890 : 0xb8b2a8, 0, 0.7); }
  if (reeds) for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3; p.box(0.008, 0.16 + (i % 3) * 0.04, 0.008, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 0x6a8a4a, 0, false, (i % 2 ? 0.15 : -0.15)); p.box(0.014, 0.04, 0.014, Math.cos(a) * 0.4, 0.16 + (i % 3) * 0.04, Math.sin(a) * 0.4, 0x6a4a2e); }
});
/** Rayon au sol du bassin de la source chaude, pierres et roseaux compris */
const POOL_R = 0.42;
/** Le socle du bassin, haut de 1 (étiré à la hauteur voulue) : un tertre de pierres grises, plus large au pied */
const poolBaseGeo = () => geo('poolBase', (p) => p.cyl(0.37, 0.44, 1, 13, 0, 0, 0, 0x8d877c));
const oakGeo = () => geo('oak', (p) => {
  p.cyl(0.08, 0.12, 0.42, 8, 0, 0, 0, 0x6a4a34);
  for (const a of [0.4, 2.3, 4.2]) p.box(0.05, 0.04, 0.14, Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1, 0x5a3e2e, -a);
  p.box(0.05, 0.08, 0.02, 0, 0.2, 0.08, 0x2a1e18);
  for (const [x, y, z, r] of [[0, 0.55, 0, 0.26], [0.18, 0.48, 0.08, 0.17], [-0.16, 0.5, -0.06, 0.18], [0.04, 0.68, -0.1, 0.15]] as number[][]) p.sphere(r, x, y, z, 0x4f7a3e, 1, 0.8);
});
const sproutTreeGeo = () => geo('sprout', (p) => {
  p.cyl(0.025, 0.035, 0.32, 6, 0, 0, 0, 0x7a5a3e);
  p.box(0.16, 0.02, 0.02, 0.08, 0.26, 0, 0x7a5a3e, 0, false, -0.2);
  for (const [x, y, z, r] of [[0, 0.42, 0, 0.14], [0.1, 0.36, 0.05, 0.1], [-0.08, 0.38, -0.04, 0.1]] as number[][]) p.sphere(r, x, y, z, 0x6a9a50, 1, 0.8);
});
const clusterGeo = () => geo('cluster', (p) => { p.sphere(0.045, 0, -0.05, 0, 0x9a6a2a, 1, 1.4); for (let i = 0; i < 8; i++) p.sphere(0.012, Math.cos(i) * 0.04, -0.05 + Math.sin(i * 1.7) * 0.05, Math.sin(i) * 0.04, 0xf0c040); });
const skepGeo = () => geo('skep', (p) => {
  p.add(new THREE.SphereGeometry(0.06, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1), 0, 0, 0, 0xdcc080);
  for (const h of [0.25, 0.5, 0.72]) p.add(new THREE.TorusGeometry(0.06 * Math.sqrt(1 - h * h) + 0.002, 0.006, 3, 10).rotateX(Math.PI / 2), 0, h * 0.078, 0, 0xb09a5a);
  p.box(0.024, 0.014, 0.01, 0, 0, 0.056, 0x2a2018);
});
const logHiveGeo = () => geo('loghive', (p) => { p.cyl(0.06, 0.065, 0.2, 8, 0, 0, 0, 0x6a4a34); p.cyl(0.075, 0.07, 0.022, 7, 0, 0.2, 0, 0x8d8a84); p.box(0.022, 0.018, 0.01, 0, 0.08, 0.06, 0x2a2018); });
const pebblesGeo = () => geo('pebbles', (p) => { for (let i = 0; i < 9; i++) p.sphere(0.022 + (i % 3) * 0.008, Math.cos(i * 2.3) * 0.09, 0.008, Math.sin(i * 2.3) * 0.09, [0x8d8a84, 0x6a6f78, 0xb8b2a8][i % 3], 0, 0.55); });
const flintsGeo = () => geo('flints', (p) => { for (let i = 0; i < 7; i++) p.add(new THREE.IcosahedronGeometry(0.017, 0).scale(1, 0.7, 1.3), Math.cos(i * 2.1) * 0.028, (i % 3) * 0.012, Math.sin(i * 2.1) * 0.028, i % 2 ? 0x4a4e58 : 0x6a6f78); });
const hopGeo = () => geo('hop', (p) => {
  p.box(0.016, 0.5, 0.016, 0, 0, 0, 0x8a6a4a);
  for (let i = 0; i < 12; i++) { const a = i * 0.9, y = 0.04 + i * 0.038; p.sphere(0.022, Math.cos(a) * 0.022, y, Math.sin(a) * 0.022, 0x5c9a50, 0, 0.8); if (i % 2) p.cone(0.014, 0.026, 5, Math.cos(a) * 0.04, y - 0.01, Math.sin(a) * 0.04, 0xb8d88a); }
});
const hopConesGeo = () => geo('hopcones', (p) => { for (let i = 0; i < 9; i++) p.cone(0.016, 0.03, 5, Math.cos(i * 2.1) * 0.03, (i % 3) * 0.012, Math.sin(i * 2.1) * 0.03, 0xb8d88a); });
const cairnGeo = () => geo('cairn', (p) => { for (const [y, r] of [[0, 0.09], [0.07, 0.07], [0.13, 0.055], [0.18, 0.04], [0.22, 0.03]]) p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.6, 1), 0, y + r * 0.4, 0, 0x9a958c); });
const copperGeo = () => geo('copper', (p) => {
  for (const [x, z, r] of [[0, 0, 0.12], [0.12, 0.05, 0.08], [-0.1, 0.07, 0.07], [0.03, -0.1, 0.08]] as number[][]) p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 1), x, r * 0.55, z, 0x7d7a74);
  for (const [x, y, z] of [[0.05, 0.15, 0.03], [-0.07, 0.1, 0.08], [0.13, 0.1, -0.01], [-0.01, 0.12, -0.09], [0.08, 0.06, 0.09]] as number[][]) p.add(new THREE.IcosahedronGeometry(0.024, 0), x, y, z, 0x3fa878);
});
const corralGeo = () => geo('corral', (p) => {
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; p.box(0.024, 0.16, 0.024, Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 0x8a6a4a); }
  for (const y of [0.07, 0.13]) p.add(new THREE.TorusGeometry(0.5, 0.006, 3, 20).rotateX(Math.PI / 2), 0, y, 0, 0xc9b48a);
});
const saltGeo = () => geo('salt', (p) => { p.box(0.08, 0.06, 0.07, 0, 0, 0, 0xf2f0ea, 0.3); p.box(0.05, 0.04, 0.05, 0.06, 0, 0.05, 0xe8e4dc, 0.9); });
/** Arche de départ de la course : deux poteaux, banderole à damier, fanions */
const raceArchGeo = () => geo('racearch', (p) => {
  for (const s of [-1, 1]) p.box(0.025, 0.42, 0.025, s * 0.3, 0, 0, 0x5a4a3a);
  for (let k = 0; k < 12; k++) for (let j = 0; j < 2; j++) p.box(0.05, 0.04, 0.008, -0.275 + k * 0.05, 0.36 + j * 0.04, 0, (k + j) % 2 ? 0x1e1e22 : 0xf4f2ee);
  for (const s of [-1, 1]) p.add(new THREE.ConeGeometry(0.03, 0.06, 3).rotateZ(-Math.PI / 2), s * 0.3 + 0.03, 0.44, 0, s > 0 ? 0xd84a3e : 0x3a6ab8);
});
/** Automobile ancienne, nez vers +z : caisse sombre, capot, radiateur de laiton, roues à rayons, phares */
const oldCarGeo = () => geo('oldcar', (p) => {
  p.box(0.13, 0.05, 0.22, 0, 0.05, -0.02, 0x1e2a24); p.box(0.11, 0.045, 0.09, 0, 0.075, 0.11, 0x2a2a2e);
  p.box(0.09, 0.055, 0.012, 0, 0.065, 0.16, 0xc8a050); p.box(0.12, 0.055, 0.028, 0, 0.1, -0.08, 0x5a3a2a);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.016, 10).rotateZ(Math.PI / 2), sx * 0.072, 0.04, sz * 0.09 - 0.01, 0x2a2a2e); p.box(0.026, 0.008, 0.08, sx * 0.072, 0.082, sz * 0.09 - 0.01, 0x1e1e22); }
  for (const sx of [-1, 1]) p.box(0.022, 0.022, 0.022, sx * 0.045, 0.09, 0.165, 0xffe8a0);
});
/** Bidon d'essence rouge */
const fuelCanGeo = () => geo('fuelcan', (p) => { p.box(0.05, 0.07, 0.03, 0, 0, 0, 0xc83a32); p.box(0.012, 0.02, 0.012, 0.015, 0.07, 0, 0x8a8f96); });
/** La montgolfière du premier envol : fuseaux rouges et or, ceinture bleue ; sa nacelle */
let balloonEnv: THREE.BufferGeometry | null = null, balloonBasket: THREE.BufferGeometry | null = null;
const BALLOON_ENV = () => (balloonEnv ??= balloonEnvelopeGeo(0xd84a3e, 0xf2c23a, 0x3a6ab8));
const BALLOON_BASKET = () => (balloonBasket ??= balloonBasketGeo());
const wagonGeo = () => geo('wagon', (p) => {
  p.box(0.36, 0.14, 0.2, 0, 0.07, 0, 0xc84a3e);
  p.box(0.38, 0.02, 0.22, 0, 0.21, 0, 0xe8c66a);
  for (let i = 0; i < 6; i++) p.add(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2), -0.15 + i * 0.06, 0.22, 0, i % 2 ? 0x4a7aa8 : 0xf2e8d0);
  for (const [x, z] of [[-0.12, 0.11], [0.12, 0.11], [-0.12, -0.11], [0.12, -0.11]]) p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10).rotateX(Math.PI / 2), x, 0.06, z, 0x6a4a34);
  p.box(0.1, 0.012, 0.012, 0.24, 0.06, 0.04, 0x6a4a34); p.box(0.1, 0.012, 0.012, 0.24, 0.06, -0.04, 0x6a4a34);
  for (let i = 0; i < 5; i++) p.sphere(0.012, -0.12 + i * 0.06, 0.18, 0.105, [0xd8443a, 0xe8b84a, 0x4a7aa8, 0x7cc46a, 0xd88ab8][i]);
});
const chapelGeo = () => geo('chapel', (p) => {
  p.box(0.34, 0.3, 0.26, 0, 0, 0, 0xcfcac2);
  p.gable(0.36, 0.16, 0.3, 0, 0.3, 0, 0x8e9bb4);
  p.box(0.1, 0.16, 0.1, 0.12, 0.38, 0, 0xcfcac2); p.pyramid(0.13, 0.1, 0.13, 0.12, 0.54, 0, 0x8e9bb4);
  p.box(0.04, 0.05, 0.012, 0.12, 0.44, 0.051, 0x3c3530);
  p.box(0.012, 0.14, 0.08, 0.171, 0, 0, 0x6a4a3a);
  p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 10).rotateZ(Math.PI / 2), 0.172, 0.21, 0, 0xc8a0d8);
  p.box(0.46, 0.08, 0.04, -0.06, 0, 0.26, 0x9d9890); p.box(0.46, 0.08, 0.04, -0.06, 0, -0.26, 0x9d9890);
});
const kettleGeo = () => geo('kettle', (p) => {
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.sphere(0.022, Math.cos(a) * 0.07, 0.01, Math.sin(a) * 0.07, 0x8a857c); }
  p.cyl(0.075, 0.06, 0.09, 10, 0, 0.03, 0, 0xc8783a);
  p.add(new THREE.TorusGeometry(0.075, 0.008, 4, 12).rotateX(Math.PI / 2), 0, 0.12, 0, 0xa85e2a);
  p.cyl(0.066, 0.066, 0.006, 10, 0, 0.112, 0, 0xc89a4a);
  for (const s of [-1, 1]) p.box(0.012, 0.18, 0.012, s * 0.1, 0, 0, 0x6a4a34);
  p.box(0.22, 0.012, 0.012, 0, 0.18, 0, 0x6a4a34);
});
const barrelsGeo = () => geo('barrels', (p) => { for (const [x, z] of [[0, 0], [0.09, 0.03]]) { p.cyl(0.04, 0.04, 0.09, 8, x, 0, z, 0x9a6a44); for (const y of [0.02, 0.065]) p.cyl(0.042, 0.042, 0.008, 8, x, y, z, 0x6f5640); } });
const galleryGeo = (stone: boolean) => geo(`gallery${+stone}`, (p) => {
  // entrée boisée (ou tunnel maçonné) dans la pente, gravats autour
  const c = stone ? 0x9d9890 : 0x7a5a3e;
  // la pente rocheuse où s'ouvre l'entrée
  for (const [x, yy, z, r] of [[0, 0.12, -0.12, 0.2], [-0.18, 0.06, -0.08, 0.13], [0.19, 0.07, -0.09, 0.14], [0.06, 0.26, -0.16, 0.12]] as number[][]) p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.85, 0.8), x, yy, z, [0x8d8a84, 0x7d7a74, 0x9a958c, 0x86827b][Math.round(r * 100) % 4]);
  p.box(0.2, 0.22, 0.05, 0, 0, 0.02, 0x1e1814);
  for (const s of [-1, 1]) p.box(0.04, 0.25, 0.05, s * 0.12, 0, 0.03, c);
  p.box(0.32, 0.05, 0.06, 0, 0.24, 0.03, c);
  if (stone) p.add(new THREE.TorusGeometry(0.12, 0.025, 4, 10, Math.PI), 0, 0.2, 0.04, 0x9d9890);
  for (let i = 0; i < 6; i++) p.add(new THREE.IcosahedronGeometry(0.03 + (i % 3) * 0.01, 0).scale(1, 0.6, 1), -0.2 + i * 0.08, 0.01, 0.1 + (i % 2) * 0.05, 0x8d8a84);
});
const stakeTorchGeo = () => geo('staketorch', (p) => { p.box(0.016, 0.24, 0.016, 0, 0, 0, 0x6a4a34); p.cyl(0.02, 0.014, 0.03, 6, 0, 0.24, 0, 0x4a3a2e); });
const deckGeo = (iron: boolean) => geo(`deck${+iron}`, (p) => {
  p.box(0.2, 0.02, 0.24, 0, 0, 0, iron ? 0x6a6f78 : 0x8a6a4a);
  for (const s of [-1, 1]) { p.box(0.2, 0.05, 0.016, 0, 0.02, s * 0.12, iron ? 0x4a5560 : 0x6a4a34); p.box(0.016, 0.1, 0.016, 0.09, 0.02, s * 0.12, iron ? 0x4a5560 : 0x6a4a34); }
  if (iron) for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.22, 0.012, 0.012), 0, 0.06, s * 0.12, 0x4a5560, 0, false, 0.4);
  p.box(0.04, 0.3, 0.04, 0, -0.3, 0, iron ? 0x4a5560 : 0x6a4a34);
});
const derrickGeo = () => geo('derrick', (p) => {
  for (const a of [0, 2.1, 4.2]) p.add(new THREE.BoxGeometry(0.02, 0.62, 0.02).translate(0, 0.31, 0), Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, 0x6a5040, 0, false, Math.cos(a) * 0.19, -Math.sin(a) * 0.19);
  p.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).rotateX(Math.PI / 2), 0, 0.6, 0, 0x8a8f96);
  p.box(0.006, 0.55, 0.006, 0, 0.05, 0, 0x2a2a2a);
  p.cyl(0.03, 0.03, 0.08, 8, 0, 0, 0, 0x4a5560);
});
const boilerGeo = () => geo('boiler', (p) => {
  p.add(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 10).rotateZ(Math.PI / 2), 0, 0.09, 0, 0x4a5560);
  for (const s of [-1, 1]) p.box(0.04, 0.03, 0.12, s * 0.07, 0, 0, 0x6a4a34);
  p.cyl(0.02, 0.022, 0.18, 6, 0.07, 0.14, 0, 0x2a2a2a);
  p.add(new THREE.TorusGeometry(0.03, 0.008, 4, 8), -0.09, 0.09, 0.06, 0xc8783a);
});
const coreGeo = () => geo('core', (p) => { p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6).rotateZ(Math.PI / 2), 0, 0.018, 0, 0x5a5650); p.add(new THREE.CylinderGeometry(0.019, 0.019, 0.04, 6).rotateZ(Math.PI / 2), 0.03, 0.018, 0, 0x2a2826); });
const stakeFlagGeo = () => geo('stakeflag', (p) => { p.box(0.02, 0.34, 0.02, 0, 0, 0, 0x8a6a4a); p.cone(0.012, 0.03, 4, 0, 0.34, 0, 0x6a4a34); p.box(0.005, 0.07, 0.1, 0, 0.25, 0.05, 0xf0902a); p.box(0.006, 0.02, 0.1, 0, 0.27, 0.05, 0xf8e0a0); });
const mapTableGeo = () => geo('maptable', (p) => {
  for (const s of [-1, 1]) { p.add(new THREE.BoxGeometry(0.012, 0.11, 0.1), s * 0.08, 0.05, 0, 0x6a4a34, 0, false, 0, 0); }
  p.box(0.22, 0.014, 0.14, 0, 0.1, 0, 0x9a7a5a); p.box(0.16, 0.003, 0.1, 0, 0.114, 0, 0xf2e8d0, 0.12);
  for (const [x, z, c] of [[-0.04, 0.02, 0xc8443a], [0.03, -0.02, 0x3c3530], [0.05, 0.03, 0xc8443a]] as [number, number, number][]) p.box(0.01, 0.01, 0.01, x, 0.117, z, c);
});
const flagGeo = () => geo('flag', (p) => { p.cyl(0.006, 0.008, 0.42, 5, 0, 0, 0, 0xd8d8d8); p.box(0.006, 0.08, 0.13, 0, 0.32, 0.065, 0xd8443a); p.sphere(0.012, 0, 0.43, 0, 0xe8c66a); });
const stationGeo = () => geo('station', (p) => {
  p.box(0.012, 0.36, 0.012, 0, 0, 0, 0xd8d8d8);
  p.box(0.1, 0.08, 0.08, 0.08, 0.14, 0, 0xf7f3ec); for (let i = 0; i < 3; i++) p.box(0.1, 0.005, 0.082, 0.08, 0.155 + i * 0.02, 0.0, 0xd8d0c0);
  for (const s of [-1, 1]) p.box(0.006, 0.14, 0.006, 0.08 + s * 0.04, 0, 0.03, 0xd8d8d8);
  p.add(new THREE.BoxGeometry(0.14, 0.008, 0.1), -0.06, 0.24, 0, 0x2c3e66, 0, false, 0.5);
});
const cupsGeo = () => geo('cups', (p) => { for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; p.box(0.08, 0.004, 0.004, Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04, 0x8a8f96, -a); p.sphere(0.014, Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08, 0xd84a3e); } });
const telescopeGeo = () => geo('telescope', (p) => {
  for (const a of [0, 2.1, 4.2]) p.add(new THREE.BoxGeometry(0.01, 0.2, 0.01).translate(0, 0.1, 0), Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05, 0x6a4a34, 0, false, Math.cos(a) * 0.25, -Math.sin(a) * 0.25);
  p.add(new THREE.CylinderGeometry(0.022, 0.03, 0.24, 8).rotateX(0.9), 0, 0.24, 0.04, 0xe8c66a);
  p.add(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 8).rotateX(0.9), 0, 0.31, 0.13, 0x2a2e38);
});
const craterGeo = () => geo('crater', (p) => {
  p.cyl(0.36, 0.38, 0.006, 14, 0, 0, 0, 0x4a3a30);
  p.add(new THREE.TorusGeometry(0.33, 0.06, 4, 16).rotateX(Math.PI / 2).scale(1, 0.5, 1), 0, 0.01, 0, 0x7a6a58);
  for (let i = 0; i < 8; i++) { const a = i * 0.8; p.add(new THREE.IcosahedronGeometry(0.03, 0).scale(1, 0.6, 1), Math.cos(a) * 0.48, 0.01, Math.sin(a) * 0.48, 0x6a5a48); }
});
const meteorGeo = () => geo('meteor', (p) => { p.add(new THREE.IcosahedronGeometry(0.09, 0).scale(1, 0.8, 1), 0, 0.06, 0, 0x3a3634); for (let i = 0; i < 4; i++) p.add(new THREE.IcosahedronGeometry(0.025, 0), Math.cos(i * 1.6) * 0.07, 0.1, Math.sin(i * 1.6) * 0.07, 0x5a5650); });
const drumGeo = () => geo('drum', (p) => { p.cyl(0.04, 0.04, 0.05, 10, 0, 0, 0, 0xc84a3e); p.cyl(0.041, 0.041, 0.006, 10, 0, 0.05, 0, 0xf2e8d0); });
/** Rayon du cercle de combat du pugilat */
const PIT_R = 0.34;
/**
 * Le cercle du pugilat : sable ratissé, piquets et double corde jusqu'au Moyen Âge ; ensuite un vrai ring, plancher, toile,
 * poteaux de coin rouge et bleu, trois rangs de cordes
 */
const fightPitGeo = (ring: boolean) => geo(`fpit${+ring}`, (p) => {
  if (!ring) {
    p.cyl(PIT_R + 0.04, PIT_R + 0.05, 0.012, 22, 0, 0, 0, 0xdcc69a);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; p.cyl(0.008, 0.01, 0.1, 5, Math.cos(a) * PIT_R, 0, Math.sin(a) * PIT_R, 0x7a5a3a); }
    for (const y of [0.05, 0.085]) p.add(new THREE.TorusGeometry(PIT_R, 0.004, 3, 30).rotateX(Math.PI / 2), 0, y, 0, 0xc9b48a);
    return;
  }
  const h = PIT_R * 0.95;
  p.box(h * 2 + 0.06, 0.05, h * 2 + 0.06, 0, 0, 0, 0x3a3a44);
  p.box(h * 2 + 0.03, 0.008, h * 2 + 0.03, 0, 0.05, 0, 0xece6d8);
  [0xd8443a, 0xf2f2f2, 0x3a6ab8, 0xf2f2f2].forEach((c, i) => { const a = (i / 4) * Math.PI * 2 + Math.PI / 4, r = h * Math.SQRT2; p.cyl(0.012, 0.012, 0.17, 6, Math.cos(a) * r, 0.05, Math.sin(a) * r, c); });
  for (const [k, y] of [[0, 0.1], [1, 0.14], [2, 0.18]]) for (let s = 0; s < 4; s++) {
    const c = [0xd8443a, 0xf2f2f2, 0x3a6ab8][k];
    if (s % 2) p.box(0.006, 0.006, h * 2, (s === 1 ? 1 : -1) * h, y, 0, c); else p.box(h * 2, 0.006, 0.006, 0, y, (s === 0 ? 1 : -1) * h, c);
  }
});
/** La stèle du vieux champion : un pilier, son buste, les cestes de cuir pendus */
const hermGeo = () => geo('herm', (p) => {
  p.box(0.07, 0.03, 0.07, 0, 0, 0, 0xcfc6b4); p.box(0.05, 0.2, 0.05, 0, 0.03, 0, 0xe2dccd);
  p.box(0.045, 0.05, 0.04, 0, 0.23, 0, 0xe2dccd); p.box(0.07, 0.03, 0.035, 0, 0.21, 0, 0xe2dccd);
  for (const s of [-1, 1]) p.box(0.016, 0.04, 0.016, s * 0.034, 0.12, 0.02, 0x8a5a34);
});
/** Le banc des combattants, et l'amphore d'eau fraîche à côté */
const fightBenchGeo = () => geo('fbench', (p) => {
  p.box(0.26, 0.016, 0.06, 0, 0.045, 0, 0x9a7452); for (const s of [-1, 1]) p.box(0.02, 0.045, 0.05, s * 0.11, 0, 0, 0x6f5640);
  p.cyl(0.018, 0.024, 0.07, 7, 0.17, 0, 0.01, 0xb8673e); p.cyl(0.008, 0.018, 0.02, 7, 0.17, 0.07, 0.01, 0xb8673e);
});
const steamGeo = () => geo('steam', (p) => p.sphere(0.035, 0, 0, 0, 0xf4f4f2, 1));
const smokeGeo = () => geo('smoke', (p) => p.sphere(0.04, 0, 0, 0, 0x8a8680, 1));
const cloudGeo = () => geo('cloud', (p) => p.sphere(0.05, 0, 0, 0, 0xf2f0ec, 1));
const bubbleGeo = () => geo('bubble', (p) => p.sphere(0.01, 0, 0, 0, 0xffffff, 0));
const ballGeo = (c: number) => geo(`ball${c}`, (p) => p.sphere(0.014, 0, 0, 0, c));
const tentGeoC = (c: number) => geo(`tent${c}`, (p) => {
  p.gable(0.3, 0.24, 0.3, 0, 0, 0, c);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.151, 0, 0.06, 0.151, 0, -0.06, 0.151, 0.14, 0], 3)), 0, 0, 0, 0x3a2a22);
});
// ---------------- Accessoires des imprévus ----------------
/** Entrée de grotte : butte de rochers, bouche sombre tournée vers +z, stalactites, blocs éboulés devant */
const caveMouthGeo = () => geo('cavemouth', (p) => {
  for (const [x, y, z, r, sx, sy, c] of [[0, 0.2, -0.3, 0.4, 1, 0.85, 0x8d8a84], [-0.36, 0.14, 0, 0.24, 1, 0.9, 0x7d7a74], [0.37, 0.15, 0, 0.25, 1, 0.9, 0x86827b],
    [0, 0.36, 0.02, 0.2, 1.5, 0.6, 0x9a958c], [0.06, 0.5, -0.16, 0.24, 1, 0.8, 0x928e86], [-0.24, 0.34, -0.12, 0.2, 1, 0.9, 0x8a857c]] as number[][])
    p.add(new THREE.DodecahedronGeometry(r, 0).scale(sx, sy, 0.9), x, y, z, c);
  // la bouche, et le noir derrière elle (sombre sous tous les angles)
  p.add(new THREE.CircleGeometry(0.17, 10, 0, Math.PI), 0, 0, 0.15, 0x120e0c);
  p.box(0.34, 0.17, 0.12, 0, 0, 0.08, 0x1a1512);
  for (const [x, h] of [[-0.1, 0.05], [-0.03, 0.07], [0.05, 0.045], [0.11, 0.06]]) p.add(new THREE.ConeGeometry(0.014, h, 4).rotateX(Math.PI), x, 0.165 - h / 2 + 0.01, 0.155, 0x7d7a74);
  for (const [x, z, r] of [[-0.2, 0.3, 0.05], [0.18, 0.28, 0.04], [0.05, 0.38, 0.035], [-0.08, 0.42, 0.03]]) p.add(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.7, 1), x, r * 0.5, z, 0x8a857c);
});
/** Nuage d'orage : boules grises tassées, plus sombres dessous */
const stormGeo = (light: boolean) => geo(`storm${+light}`, (p) => {
  for (const [x, y, z, r] of [[0, 0, 0, 0.55], [0.6, -0.05, 0.1, 0.45], [-0.55, -0.03, -0.1, 0.48], [0.2, 0.25, -0.15, 0.42], [-0.25, 0.2, 0.25, 0.38], [0.15, -0.12, 0.45, 0.36], [-0.1, -0.1, -0.5, 0.4]])
    p.add(new THREE.IcosahedronGeometry(r, 1).scale(1.3, 0.62, 1.1), x, y, z, light ? 0xc9ccd2 : y > 0.1 ? 0x6f7480 : 0x4c515c);
});
/** Éclair : un zigzag blanc, du nuage au sol (hauteur 1) */
const boltGeo = (seed: number) => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(i && i < 6 ? Math.sin(seed * 7.1 + i * 2.3) * 0.12 : 0, 1 - i / 6, i && i < 6 ? Math.cos(seed * 3.7 + i * 1.9) * 0.12 : 0));
  const g = new THREE.BufferGeometry().setFromPoints(pts.flatMap((v, i) => (i ? [pts[i - 1], v] : [])));
  return g;
};
/** Petit oiseau (ou chauve-souris) : deux ailes en V, le long de +z */
const wingGeo = (c: number) => geo(`wing${c}`, (p) => {
  p.sphere(0.012, 0, 0, 0, c);
  // chaque aile, recto et verso : on la voit d'en dessous comme d'au-dessus
  for (const s of [-1, 1]) for (const v of [[0, 0, 0.012, 0, 0, -0.012, s * 0.05, 0.012, -0.004], [0, 0, -0.012, 0, 0, 0.012, s * 0.05, 0.012, -0.004]])
    p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3)), 0, 0, 0, c);
});
/** Rocher où brille un filon : pierre grise, cristaux de couleur */
const glintGeo = () => geo('glint', (p) => {
  p.add(new THREE.DodecahedronGeometry(0.11, 0).scale(1, 0.8, 1), 0, 0.08, 0, 0x86827b);
  for (const [x, y, z, c] of [[0.05, 0.13, 0.05, 0x5ad8e8], [-0.04, 0.15, 0.04, 0xe8c64a], [0.02, 0.17, -0.03, 0x5ad8e8], [0.08, 0.09, -0.02, 0xd84a8a]] as number[][])
    p.add(new THREE.OctahedronGeometry(0.026, 0).scale(0.7, 1.3, 0.7), x, y, z, c);
});
/** Étai de galerie : deux poteaux et une traverse */
const proppingGeo = () => geo('propping', (p) => {
  for (const s of [-1, 1]) p.box(0.03, 0.3, 0.03, s * 0.16, 0, 0, 0x8a6a4a);
  p.box(0.4, 0.04, 0.05, 0, 0.3, 0, 0x7a5a3e);
});
/** Piège de corde : une boucle posée au sol, son piquet */
const snareGeo = () => geo('snare', (p) => { p.add(new THREE.TorusGeometry(0.06, 0.008, 3, 10).rotateX(Math.PI / 2), 0, 0.01, 0, 0xc9b48a); p.box(0.016, 0.08, 0.016, 0.07, 0, 0, 0x6a4a34); });
/** Empreinte de patte */
const pawGeo = () => geo('paw', (p) => { p.cyl(0.018, 0.018, 0.004, 6, 0, 0, 0, 0x4a3a2e); for (let i = 0; i < 4; i++) p.cyl(0.007, 0.007, 0.004, 5, -0.015 + i * 0.01, 0, 0.022 + (i % 3 ? 0.004 : 0), 0x4a3a2e); });
/** Branche que la crue emporte */
const branchGeo = () => geo('branch', (p) => { p.add(new THREE.CylinderGeometry(0.018, 0.022, 0.34, 5).rotateZ(Math.PI / 2), 0, 0, 0, 0x6a4a34); p.add(new THREE.CylinderGeometry(0.008, 0.01, 0.14, 4).rotateZ(Math.PI / 2 - 0.6), 0.06, 0.03, 0.02, 0x6a4a34); p.sphere(0.04, 0.12, 0.05, 0.02, 0x5c8a45, 0, 0.6); });
/** Filet de pêche tendu sur l'eau : un quadrillage de cordelettes et ses flotteurs */
const netGeo = () => geo('net', (p) => {
  for (let i = 0; i < 6; i++) { p.box(0.5, 0.004, 0.006, 0, 0, -0.25 + i * 0.1, 0xd8d0b8); p.box(0.006, 0.004, 0.5, -0.25 + i * 0.1, 0, 0, 0xd8d0b8); }
  for (const [x, z] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) p.sphere(0.02, x, 0.01, z, 0xe8843a);
});
/** Poissons pêchés, en tas sur la berge */
const catchGeo = () => geo('catch', (p) => { for (let i = 0; i < 7; i++) p.add(new THREE.SphereGeometry(0.026, 6, 4).scale(1, 0.5, 1.8), Math.cos(i * 2.2) * 0.04, 0.012 + (i % 3) * 0.01, Math.sin(i * 2.2) * 0.04, i % 2 ? 0xc9cdd2 : 0xa8adb4); });
/** Trois chopes sur un tonnelet */
const mugsGeo = () => geo('mugs', (p) => {
  p.cyl(0.05, 0.05, 0.08, 8, 0, 0, 0, 0x9a6a44);
  for (let i = 0; i < 3; i++) { const a = i * 2.1; p.cyl(0.016, 0.014, 0.04, 6, Math.cos(a) * 0.025, 0.08, Math.sin(a) * 0.025, 0xc8a050); p.cyl(0.015, 0.015, 0.006, 6, Math.cos(a) * 0.025, 0.12, Math.sin(a) * 0.025, 0xf6f0e0); }
});
/** Roue de charrette, à plat */
const wheelGeo = () => geo('wheel', (p) => { p.add(new THREE.TorusGeometry(0.06, 0.012, 4, 12).rotateX(Math.PI / 2), 0, 0.012, 0, 0x6a4a34); for (let i = 0; i < 3; i++) p.box(0.12, 0.008, 0.01, 0, 0.012, 0, 0x7a5a3e, (i * Math.PI) / 3); });
/** Cage du canari des mineurs */
const cageGeo = () => geo('cage', (p) => {
  p.cyl(0.04, 0.04, 0.008, 8, 0, 0, 0, 0x8a7a4a);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.004, 0.08, 0.004, Math.cos(a) * 0.038, 0.004, Math.sin(a) * 0.038, 0xc8a050); }
  p.add(new THREE.SphereGeometry(0.04, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.08, 0, 0xc8a050);
  p.sphere(0.016, 0, 0.03, 0, 0xf2d43a);
});
/** Seau d'eau */
const bucketGeo = () => geo('bucket', (p) => { p.cyl(0.03, 0.024, 0.05, 8, 0, 0, 0, 0x8a6a4a); p.cyl(0.027, 0.027, 0.004, 8, 0, 0.044, 0, 0x5a9ac8); });
const gasGeo = () => geo('gas', (p) => p.sphere(0.04, 0, 0, 0, 0xa8c46a, 1));
const leafGeo = () => geo('leaf', (p) => p.box(0.018, 0.003, 0.012, 0, 0, 0, 0x8a9a4a));
/** Caillou qui dévale */
const pebbleGeo = () => geo('pebble', (p) => p.add(new THREE.IcosahedronGeometry(0.035, 0).scale(1, 0.8, 1), 0, 0, 0, 0x8d8a84));
/** Rigole creusée dans la terre, le long de +z */
const ditchGeo = () => geo('ditch', (p) => { p.box(0.06, 0.006, 0.7, 0, 0, 0.35, 0x5a4232); p.box(0.03, 0.007, 0.7, 0, 0, 0.35, 0x5a8fb4); });
/** La recette du frère, roulée sur le tonnelet */
/** Des lingots d'or empilés : le trésor d'une épave */
const ingotsGeo = () => geo('ingots', (p) => { for (let i = 0; i < 5; i++) p.box(0.05, 0.018, 0.024, (i < 3 ? i - 1 : i - 3.5) * 0.03, i < 3 ? 0 : 0.018, 0, 0xf0c040); });
/** Un coffre de marin cerclé de fer */
const chestGeo = () => geo('chest', (p) => { p.box(0.09, 0.05, 0.06, 0, 0, 0, 0x7a5236); p.box(0.094, 0.018, 0.064, 0, 0.05, 0, 0x6a4630); for (const x of [-0.03, 0.03]) p.box(0.008, 0.07, 0.066, x, 0, 0, 0x5a5650); p.box(0.016, 0.016, 0.006, 0, 0.04, 0.032, 0xe8c04a, 0, true); });
/** Une ancre de fer */
const anchorGeo = () => geo('anchor', (p) => { p.box(0.012, 0.11, 0.012, 0, 0, 0, 0x4a4e58); p.box(0.05, 0.01, 0.012, 0, 0.085, 0, 0x4a4e58); p.box(0.08, 0.012, 0.012, 0, 0.004, 0, 0x4a4e58); for (const x of [-0.04, 0.04]) p.cone(0.012, 0.03, 4, x, 0.01, 0, 0x4a4e58); });
/** Un bouclier rond (les boucliers levés) */
const roundShieldGeo = () => geo('rshield', (p) => { p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 10).rotateX(Math.PI / 2), 0, 0.04, 0, 0xc8443a); p.sphere(0.012, 0, 0.04, 0.006, 0xe8c04a); });
/** Une table basse et ronde, ou longue (les pourparlers) */
const tableGeo = (round: boolean) => geo(`table${+round}`, (p) => { if (round) p.cyl(0.14, 0.14, 0.012, 14, 0, 0.07, 0, 0xb08458); else p.box(0.32, 0.012, 0.11, 0, 0.07, 0, 0xb08458); for (const [x, z] of round ? [[0.08, 0], [-0.08, 0], [0, 0.08], [0, -0.08]] : [[0.13, 0.04], [-0.13, 0.04], [0.13, -0.04], [-0.13, -0.04]]) p.box(0.012, 0.07, 0.012, x, 0, z, 0x6a4a34); });
/** Un gâteau à trois étages */
const cakeGeo = () => geo('cake', (p) => { p.cyl(0.07, 0.07, 0.04, 12, 0, 0, 0, 0xf2e8d0); p.cyl(0.05, 0.05, 0.035, 12, 0, 0.04, 0, 0xe8a0b0); p.cyl(0.03, 0.03, 0.03, 12, 0, 0.075, 0, 0xf2e8d0); p.sphere(0.01, 0, 0.11, 0, 0xc8344a); });
/** Le drapeau blanc de l'émissaire, au bout de sa hampe */
const whiteFlagGeo = () => geo('whiteflag', (p) => { p.cyl(0.006, 0.008, 0.36, 5, 0, 0, 0, 0x8a6a4a); p.box(0.006, 0.08, 0.13, 0, 0.27, 0.065, 0xf4f4f0); });
const scrollGeo = () => geo('scroll', (p) => { p.add(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6).rotateZ(Math.PI / 2), 0, 0.012, 0, 0xf2e8d0); p.box(0.006, 0.026, 0.004, 0.02, 0, 0, 0xc83a32); });
/** Manche de la torche de fortune (la flamme est à part : elle baisse et grandit) */
const handTorchGeo = () => geo('handtorch', (p) => { p.box(0.01, 0.08, 0.01, 0, 0, 0, 0x6a4a34); p.cyl(0.014, 0.01, 0.018, 6, 0, 0.065, 0, 0x4a3a2e); });

// ---------------- Les grands Jeux et le dragon ----------------
/** La vasque des Jeux : socle de marches, colonne blanche cannelée, coupe dorée (son bord à 0,43) */
const cauldronGeo = () => geo('cauldron', (p) => {
  p.cyl(0.13, 0.15, 0.03, 10, 0, 0, 0, 0xb8b2a6);
  p.cyl(0.1, 0.11, 0.03, 10, 0, 0.03, 0, 0xcac4b8);
  p.cyl(0.035, 0.045, 0.3, 10, 0, 0.06, 0, 0xeee8dc);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.box(0.008, 0.28, 0.008, Math.cos(a) * 0.04, 0.07, Math.sin(a) * 0.04, 0xd8d2c6); }
  p.cyl(0.065, 0.04, 0.03, 10, 0, 0.36, 0, 0xc89a3a);
  p.cyl(0.13, 0.07, 0.05, 12, 0, 0.385, 0, 0xe0b44a);
  p.cyl(0.125, 0.125, 0.006, 12, 0, 0.432, 0, 0x6a4a2a);
});
/** Un drapeau de nation sur son mât (le tissu dans le plan x = 0, flottant vers +z) */
const NATION: [number, number, number][] = [[0x2a5ea8, 0xf4f4f2, 0xc8443a], [0x3a9a5a, 0xf4f4f2, 0xe88a3a], [0xc8443a, 0xe8c04a, 0xc8443a], [0x1a1a1e, 0xc8443a, 0xe8c04a], [0x2a8ac8, 0xf4f4f2, 0x2a8ac8], [0xe8c04a, 0x3a9a5a, 0x2a5ea8]];
const gamesFlagGeo = (i: number) => geo(`gamesflag${i}`, (p) => {
  p.cyl(0.005, 0.006, 0.42, 5, 0, 0, 0, 0xd8dce0);
  p.sphere(0.009, 0, 0.42, 0, 0xe0b44a);
  const c = NATION[i % NATION.length];
  for (let j = 0; j < 3; j++) p.box(0.004, 0.09, 0.045, 0, 0.3, 0.025 + j * 0.045, c[j]);
});
/** Le podium : trois marches (la première au milieu), leurs chiffres d'or, d'argent et de bronze ; tourné vers +z */
const podiumGeo = () => geo('podium', (p) => {
  for (const [x, h, c] of [[0, 0.07, 0xe0b44a], [-0.12, 0.05, 0xc8ccd4], [0.12, 0.035, 0xc0804a]] as number[][]) {
    p.box(0.12, h, 0.12, x, 0, 0, 0xf2f0ea);
    p.box(0.03, 0.03, 0.004, x, h * 0.3, 0.061, c);
  }
});
/** Hauteur du dessus de chaque marche du podium (or, argent, bronze) et leur place le long de x */
const PODIUM: [number, number][] = [[0, 0.07], [-0.12, 0.05], [0.12, 0.035]];
/** Le trésor du dragon : un tas de pièces d'or, un coffre ouvert, des coupes, des gemmes, un crâne */
const hoardGeo = () => geo('hoard', (p) => {
  for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 0.04 + (i % 7) * 0.022; p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.005, 7), Math.cos(a) * r, 0.05 - r * 0.45 + (i % 3) * 0.004, Math.sin(a) * r, i % 4 ? 0xe8c04a : 0xd0a03a, a, false, 0.4 * Math.sin(i), 0.3 * Math.cos(i)); }
  p.add(new THREE.IcosahedronGeometry(0.11, 1).scale(1, 0.38, 1), 0, 0, 0, 0xd8a83a);
  p.box(0.11, 0.06, 0.07, 0.13, 0, -0.05, 0x7a4a2a, 0.4);
  p.box(0.115, 0.01, 0.075, 0.13, 0.06, -0.05, 0xc89a3a, 0.4);
  p.add(new THREE.BoxGeometry(0.11, 0.05, 0.012), 0.12, 0.09, -0.09, 0x6a3e22, 0.4, false, 0, -0.9);
  p.cyl(0.012, 0.018, 0.04, 6, -0.11, 0.02, 0.06, 0xe0b44a);
  p.cyl(0.022, 0.012, 0.02, 6, -0.11, 0.06, 0.06, 0xe0b44a);
  for (const [x, z, c] of [[0.03, 0.06, 0xc8443a], [-0.05, -0.04, 0x3a9a5a], [0.07, -0.02, 0x2a8ac8]] as number[][]) p.add(new THREE.OctahedronGeometry(0.016, 0), x, 0.05, z, c);
  p.sphere(0.03, -0.14, 0.02, -0.06, 0xe8e0cc, 0, 0.9);
  for (const s of [-1, 1]) p.box(0.008, 0.008, 0.004, -0.14 + s * 0.011, 0.025, -0.034, 0x2a2420);
});
/** Couleurs des étincelles des feux d'artifice, et celles du souffle du dragon */
const SPARK = [0xffe08a, 0xff6a6a, 0x8ad0ff, 0xb0ff8a, 0xffffff].map((c) => new THREE.MeshBasicMaterial({ color: c }));
const EMBER = [0xffa040, 0xffe08a, 0xff6a2a].map((c) => new THREE.MeshBasicMaterial({ color: c }));
const sparkGeo = new THREE.BoxGeometry(0.02, 0.02, 0.02);
const emberGeo = new THREE.IcosahedronGeometry(0.03, 0);

// ---------------- La chasse au mammouth ----------------
const FUR = 0x7a4a2a, FUR_DARK = 0x5a3620;
/** Taille du mammouth de `beasts.ts` pour une femelle adulte (0,5 au garrot, 0,7 des défenses à la queue) */
const MAMMOTH_SCALE = 1.5;
/** Un tronçon de cylindre de a à b, du rayon r0 au rayon r1 (pattes, trompe, queue, perches) */
function tube(p: Parts, a: number[], b: number[], r0: number, r1: number, c: number, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg).translate(0, len / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  p.add(g, a[0], a[1], a[2], c);
}
/** Fosse de chasse : le trou sombre, la terre rejetée autour */
const pitGeo = () => geo('pit', (p) => {
  p.cyl(0.25, 0.25, 0.006, 12, 0, 0, 0, 0x231a14);
  p.add(new THREE.TorusGeometry(0.28, 0.045, 4, 14).rotateX(Math.PI / 2).scale(1, 0.55, 1), 0, 0.008, 0, 0x6a5038);
});
/** Les branchages qui couvrent la fosse, et leurs feuilles */
const pitCoverGeo = () => geo('pitcover', (p) => {
  for (let i = 0; i < 5; i++) p.box(0.022, 0.02, 0.5, -0.16 + i * 0.08, 0.012, 0, 0x6a4a34, 0.2 + i * 0.55);
  for (let i = 0; i < 9; i++) p.sphere(0.04, Math.cos(i * 2.4) * 0.15, 0.03, Math.sin(i * 2.4) * 0.15, i % 2 ? 0x5c8a45 : 0x6a9a50, 0, 0.45);
});
/** Le ravin : une fente sombre le long de +z (son entrée en z = -0,2, son fond en z = 0,6), entre deux rangées de blocs */
const ravineGeo = () => geo('ravine', (p) => {
  p.box(0.36, 0.006, 0.8, 0, 0, 0.2, 0x2a2420);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++)
    p.add(new THREE.DodecahedronGeometry(0.13 + (i % 2) * 0.04, 0).scale(1, 1.3 + (i % 3) * 0.25, 1), s * (0.3 + (i % 2) * 0.05), 0.1 + (i % 3) * 0.04, -0.12 + i * 0.22, [0x8d8a84, 0x7d7a74, 0x9a958c][i % 3]);
});
/**
 * Le traîneau de perches que les chasseurs ramènent (avant = +z, d'où on le tire) : deux perches qui traînent au sol derrière,
 * des traverses, et sa charge : des peaux de mammouth roulées, des ballots de viande dans le cuir
 */
export const sledGeo = () => geo('sled', (p) => {
  for (const s of [-1, 1]) tube(p, [s * 0.035, 0.15, 0.22], [s * 0.11, 0, -0.24], 0.011, 0.013, 0x7a5a3e, 5);
  // (les perches montent de l'arrière à l'avant : y = 0,15 × (z + 0,24) / 0,46, écartées de 0,11 à 0,035)
  for (const z of [-0.15, -0.03, 0.08]) { const k = (z + 0.24) / 0.46, x = 0.11 - 0.075 * k; p.box(x * 2 + 0.02, 0.014, 0.018, 0, 0.15 * k - 0.004, z, 0x6a4a34); }
  for (const [z, r, c] of [[-0.14, 0.05, FUR], [-0.05, 0.045, FUR_DARK], [0.03, 0.04, FUR]] as number[][]) {
    const y = 0.15 * ((z + 0.24) / 0.46) + r * 0.8;
    p.add(new THREE.CylinderGeometry(r, r, 0.2, 8).rotateZ(Math.PI / 2), 0, y, z, c);
    p.add(new THREE.TorusGeometry(r + 0.003, 0.005, 3, 8).rotateY(Math.PI / 2), 0.06, y, z, 0xc9b48a);
  }
  for (const [x, z] of [[-0.06, -0.19], [0.06, -0.2]]) p.add(new THREE.IcosahedronGeometry(0.04, 0).scale(1, 0.8, 1.2), x, 0.06 + 0.15 * ((z + 0.24) / 0.46), z, 0xa0704a);
});

/** Volute de brume : un disque blanc au bord flou (dessiné une fois) */
let puffTex: THREE.Texture | null = null;
function softPuff() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!, gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

const STAR = new THREE.MeshBasicMaterial({ color: 0xfff4c0, transparent: true, opacity: 0.95, depthWrite: false });
const GLOW = new THREE.MeshBasicMaterial({ color: 0xff7a2a });
/** Lumières d'alerte et éclairs (ne s'éclairent pas : elles brillent) */
const RED = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
const GREEN = new THREE.MeshBasicMaterial({ color: 0x4aff7a });
const BOLT = new THREE.LineBasicMaterial({ color: 0xf8f8ff });
/** Gestes des habitants d'ailleurs (aventuriers KayKit, petits personnages de Kenney) */

/** Comment l'équipe se déplace selon le cœur de sa mission : autour des bêtes, de point de travail en point de travail… */
const BEHAVIOR: Record<Scene, string> = {
  herd: 'herd', corral: 'herd', salt: 'herd', roundup: 'herd', boat: 'boat', dive: 'boat', fish: 'fish',
  mine: 'mine', pass: 'mine', crater: 'mine', gather: 'gather', pebbles: 'gather', hops: 'gather', hunt: 'hunt',
  build: 'build', bridge: 'build', drill: 'build', summit: 'build', basecamp: 'build', rails: 'rails', camp: 'camp',
  smoke: 'tend', swarm: 'tend', trade: 'trade', spring: 'spring', gallery: 'delve', cave: 'delve', troupe: 'watch', abbey: 'watch', stars: 'watch',
  race: 'tend', balloon: 'tend', launch: 'watch', moon: 'watch', colony: 'watch', mammoth: 'mammoth', megalodon: 'boat', kraken: 'boat',
  dragon: 'dragon', games: 'games',
  // l'école du pugilat : le cercle de sable, et l'équipe qui boxe à tour de rôle (voir `stepPugilist`)
  pugilat: 'watch',
  // la galère traverse jusqu'à l'île du portail, l'équipe y débarque (voir `stepIsle`)
  portal: 'boat',
  // le volet maritime : au large, en bateau (voyage, chasse à l'épave, pêche en haute mer)
  voyage: 'boat', wreck: 'boat', trawl: 'boat',
  // les îles flottantes : l'hydroglisseur accoste l'archipel, l'équipe y débarque (voir `FloatIsles`)
  isles: 'boat',
  // les éclaireurs de l'archipel : la barque traverse jusqu'à l'île rivale, l'équipe y débarque (voir `stepScout`)
  scout: 'boat',
  // le volcan : la barque traverse jusqu'à son île, l'équipe y débarque et monte au lieu du travail (voir `VolcanoSite`) ; venue
  // à pied, elle y monte depuis le pied du cône (`volcano`)
  obsidian: 'boat', ascent: 'boat', eruption: 'boat',
};
/**
 * L'expédition du portail, en part du travail : la galère touche l'île, l'équipe arrive à l'arche, le tourbillon s'éveille,
 * elle redescend, elle remonte à bord (la galère rentre ensuite)
 */
export const ISLE_LAND = 0.22, ISLE_UP = 0.34, ISLE_WAKE = 0.6, ISLE_DOWN = 0.7, ISLE_BACK = 0.8;
/**
 * Les éclaireurs de l'archipel, en part du travail : la barque traverse jusqu'à la plage rivale (`SC_LAND`), l'équipe
 * débarque, remonte la plage et les dunes jusqu'à un poste d'observation face aux remparts (`SC_POST`), s'y tapit et observe
 * jusqu'au bout. Pas de retour : l'expédition s'achève là-bas
 */
export const SC_LAND = 0.42, SC_POST = 0.68;
/** jusqu'où chercher, autour de la plage rivale, l'eau où la barque accoste (cases) */
const SCOUT_REACH = 12;
/** à combien de cases de la porte rivale les éclaireurs se tapissent */
const SCOUT_GAP = 5;
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });
const FLAME_IN = new THREE.MeshBasicMaterial({ color: 0xffe08a });
const LINE = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.8 });
const ROPE = new THREE.LineBasicMaterial({ color: 0x6a5a48 });
/**
 * Le premier envol, selon l'avancement du travail : gonflée au sol jusqu'à B_FULL, les aéronautes s'approchent (B_BOARD) et
 * montent (B_IN), elle décolle (B_LIFT), revient se poser (B_LAND), ils en descendent (B_OUT)
 */
const B_FULL = 0.3, B_BOARD = 0.3, B_IN = 0.35, B_LIFT = 0.4, B_LAND = 0.86, B_OUT = 0.92;
/** La course : le pilote va à la portière (R_DOOR), s'installe (R_SEAT), la voiture part (R_GO), revient sur la ligne (R_END) */
const R_DOOR = 0.22, R_SEAT = 0.27, R_GO = 0.3, R_END = 0.92, R_OUT = 0.95;
const RING = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
/**
 * Le lancement, selon l'avancement du travail : les astronautes (ou les colons) gagnent la fusée (L_BOARD) et y montent
 * (L_IN), allumage (L_FIRE), la fusée quitte le pas de tir (L_LIFT) et sort du ciel (L_GONE). L'alunissage se suit ensuite en
 * direct (voir `SpaceCast`)
 */
export const L_BOARD = 0.16, L_IN = 0.26, L_FIRE = 0.3, L_LIFT = 0.35, L_GONE = 0.6;
/** Lueur des moteurs sur le pas de tir */
const GLARE = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
/**
 * La fusée d'une expédition spatiale : son corps (tourné comme le cosmodrome) dans un pivot qui l'incline en virage, ses
 * flammes, la lueur au sol, le pas de tir, son équipage (qui gagne la fusée puis y monte), le cap de son virage, sa fumée
 */
/** Où se dresse la fusée sur le pas de tir de ce cosmodrome (le modèle tourne avec le bâtiment) : x, y, z et cap */
export function padSpot(w: World, pad: Building): [number, number, number, number] {
  const s = sizeOf(pad), t = (pad.rot * Math.PI) / 2, c = Math.cos(t), sn = Math.sin(t), [lx, ly, lz] = SPACEPAD, hs: number[] = [];
  // le bâtiment se pose à la hauteur médiane des coins de son emprise
  for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) hs.push(w.h(pad.x + i, pad.z + j));
  hs.sort((p, q) => p - q);
  const base = hs.length % 2 ? hs[hs.length >> 1] : (hs[(hs.length >> 1) - 1] + hs[hs.length >> 1]) / 2;
  return [pad.x + s / 2 + lx * c + lz * sn, base + ly, pad.z + s / 2 - lx * sn + lz * c, t];
}

/** La fusée, son corps et ses lumières, prête à poser */
function rocketMesh(kind: RocketKind) {
  const inner = new THREE.Group(), g = rocketGeo(kind), body = new THREE.Mesh(g.body, mats.body);
  body.castShadow = true;
  inner.add(body);
  if (g.glow) inner.add(new THREE.Mesh(g.glow, mats.glow));
  return inner;
}

/**
 * Entre deux expéditions, la fusée de la prochaine mission spatiale attend sur le pas de tir de chaque cosmodrome : la
 * fusée-sonde, puis la fusée lunaire, puis le vaisseau colonial (le pas de tir reste vide une fois la colonie fondée). Une
 * scène de lancement la remplace le temps de l'expédition
 */
export class IdleRockets {
  private shown = new Map<number, { obj: THREE.Group; kind: RocketKind }>();
  constructor(private world: World, private group: THREE.Group) {}

  update(launching: boolean) {
    const w = this.world, done = w.exp.done, live = new Set<number>();
    const kind: RocketKind | null = launching ? null : !done.includes('rocket') ? 'probe' : !done.includes('moon') ? 'moon' : !done.includes('colony') ? 'colony' : null;
    if (kind) for (const b of w.buildings.values()) {
      if (b.kind !== 'spaceport') continue;
      live.add(b.id);
      let r = this.shown.get(b.id);
      if (r && r.kind !== kind) { this.group.remove(r.obj); r = undefined; }
      if (!r) { r = { obj: rocketMesh(kind), kind }; this.group.add(r.obj); this.shown.set(b.id, r); }
      const [x, y, z, ry] = padSpot(w, b);
      r.obj.position.set(x, y, z);
      r.obj.rotation.y = ry;
    }
    for (const [id, r] of this.shown) if (!live.has(id)) { this.group.remove(r.obj); this.shown.delete(id); }
  }
}

interface RocketShow {
  obj: THREE.Group; flame: THREE.Group; glare: THREE.Mesh; kind: RocketKind; x: number; z: number; y0: number; dir: number;
  crew: { n: { folk: Folk; pose: FolkPose; off: number }; from: [number, number] }[]; vapor: { every: number } | null; puff: number; trail: number;
}

/**
 * Bête de la scène ; `flee` : elle s'enfuit dans cette direction (la harde dispersée) ; `held` : un imprévu la mène (la bête
 * qui charge) ; `kind` : l'espèce d'une bête de la harde (celles qu'on ramène quittent la scène pour suivre l'équipe)
 */
interface Beast { obj: THREE.Object3D; actor: Actor | null; x: number; z: number; tx: number; tz: number; heading: number; wait: number; speed: number; flee?: number; fled?: number; held?: boolean; kind?: HerdKind | 'wolf' }
/**
 * Un mammouth de la scène : la bête (son groupe tourne et avance), ses pattes et sa trompe, sa taille, la cadence de son pas,
 * sa vitesse lissée, et ce qu'il fait : il barrit (trompe levée, 0 … 1), se couche (0 … 1), s'enfonce dans la fosse
 */
interface Mammoth { b: Beast; actor: Actor; size: number; ph: number; px: number; pz: number; v: number; trumpet: number; lie: number; sink: number }
/**
 * Le dragon de la grotte : la bête articulée, où elle se tient (devant la bouche de la grotte) et son cap, sa hauteur en vol,
 * ce qu'elle fait (dort, rugit, crache le feu, marche, vole, est touchée, meurt, s'enfuit) et depuis quand, le roulis de sa
 * chute, la bouche de l'antre et sa direction (vers l'équipe), le trésor, s'il faut l'enfumer, le souffle de feu en cours
 */
interface DragonLair {
  actor: Actor; x: number; z: number; heading: number; lift: number; act: 'sleep' | 'roar' | 'breath' | 'prowl' | 'fly' | 'hit' | 'dead' | 'flee'; actT: number;
  roll: number; mouth: [number, number]; face: number; home: [number, number]; hoard: THREE.Object3D; smoke: boolean; hits: number; ended: boolean; next: number;
}
/** Le décor s'efface en ce temps-là (secondes), une fois l'équipe repartie */
const FADE = 1.2;
interface Rod { rod: THREE.Mesh; bob: THREE.Mesh; line: THREE.Line }
interface Fx { obj: THREE.Object3D; t: number; life: number; kind: 'puff' | 'fish' | 'ring' | 'steam' | 'smoke' | 'bubble' | 'star' | 'plume' | 'trail' | 'rock' | 'gas' | 'leaf' | 'spark' | 'spray'; x: number; y: number; z: number; vx: number; vz: number; vy?: number }

/**
 * Un imprévu joué sur la scène : ce qu'on voit pendant que l'équipe attend la décision, puis la suite de l'option choisie
 * (le grand feu, la corde, la décrue…). `step` le fait vivre à chaque image et dit s'il dure encore ; à la fin, ses objets
 * rétrécissent et s'effacent
 */
interface Staging {
  id: string;
  /** option choisie (-1 : la décision se fait attendre) */
  pick: number;
  /** secondes depuis qu'il a surgi, depuis la décision, depuis qu'il s'efface (-1 : pas encore) */
  t: number;
  after: number;
  end: number;
  objs: THREE.Object3D[];
  step: (dt: number) => boolean;
  /** au départ de l'équipe : ce qui doit disparaître (le voyageur ramené au village, qui la suit désormais) */
  leave?: () => void;
  /** matériaux et géométries propres à l'imprévu, libérés à la fin */
  own: { dispose(): void }[];
}

/**
 * Ce que fait une équipe sur place, joué sur la carte, et pourquoi elle est venue : elle approche une harde ou la rabat dans
 * un enclos, attend les aurochs à la pierre à sel, part en barque ou plonge sur le récif, pioche un éboulis, cueille baies,
 * houblon ou galets, enfume le vieux chêne ou recueille un essaim, troque ses poteries chez les voisins, se baigne dans la
 * source chaude, entre et sort de la galerie avec le wagonnet, applaudit les jongleurs, écoute le frère brasseur, regarde
 * les étoiles filantes, dégage la météorite, jette un pont, carotte la roche, plante le drapeau au sommet, chasse le mammouth…
 */
export class ExpeditionScene {
  private props: THREE.Object3D[] = [];
  private beasts: Beast[] = [];
  /** la chasse : les chiens de la meute, ce que fait le loup, quand chaque chasseur lancera sa prochaine lance */
  private dogs: Beast[] = [];
  private hunt = { mode: 'prowl' as 'prowl' | 'charge' | 'bite' | 'back' | 'flee' | 'stand', t: 3, target: 0, ang: 0.5, flinch: 0 };
  private spearT = new Map<number, number>();
  private fx: Fx[] = [];
  private rods = new Map<number, Rod>();
  /** points de travail (buissons, éboulis, piquets…) et ce que chaque membre y fait */
  private spots: [number, number][] = [];
  private next = new Map<number, number>();
  private goal = new Map<number, number>();
  private flame: THREE.Mesh | null = null;
  private boat: { obj: THREE.Object3D; home: [number, number]; out: [number, number]; y: number; riders: number[] } | null = null;
  /** le galion englouti : l'épave, la gabare et sa grue, le butin, le scaphandrier (voir `Salvage`) */
  private salv: Salvage | null = null;
  /** l'île du portail : où l'équipe débarque, et le portail qu'elle va réveiller */
  private isle: { land: [number, number]; gate: [number, number] } | null = null;
  /** le décor d'une expédition du volcan (l'obsidienne, le cratère, le village sous l'éruption) */
  private volc: VolcanoSite | null = null;
  /** venue à pied au volcan : chacun a repris sa marche (le travail fini) */
  private volcFree = false;
  /** les éclaireurs : la route de la barque sur l'eau (jusqu'au mouillage de la plage rivale), puis la marche sur l'île */
  private scout: { route: [number, number][]; len: number[]; walk: [number, number][]; post: [number, number]; walls: [number, number]; trip?: { kind: 'envoy' | 'islet' | 'ship'; props: THREE.Object3D[] } } | null = null;
  /** les îles flottantes (scène `isles`) : l'archipel, que l'équipe visite à pied */
  private float: FloatIsles | null = null;
  /**
   * la chasse au monstre des mers : la seconde galère (ses hommes d'armes, pris parmi ceux de `boat`) et le point de combat,
   * entre les deux, où se tient le monstre
   */
  private escort: { obj: THREE.Object3D; home: [number, number]; out: [number, number]; riders: number[] } | null = null;
  private arena: [number, number] | null = null;
  /** la galère d'où part le prochain harpon (l'une, puis l'autre) */
  private volley = 0;
  /** l'embarcation de l'âge (pirogue, barque, voilier, vapeur, vedette, hydroglisseur, galère de guerre) */
  private boatKind: BoatKind = 'rowboat';
  /** l'expédition prend la mer : sa barque file bien plus loin que la rive, sur l'eau profonde, et revient au bout du travail */
  private offshore = false;
  /** avancement du travail (0 … 1) à la dernière image : la barque du large part, reste et revient avec lui */
  private workK = 0;
  /**
   * Où en est le bateau sur son trajet (0 … 1, comme `workK`) : il suit le travail, sauf quand la suite d'un imprévu le retient
   * (`moor` : on fouille l'épave, on jette l'ancre), et rattrape ensuite son retard sans bond
   */
  private boatK = 0;
  /** posés par les imprévus à chaque image : le bateau retenu, l'équipage qui rame, ce que fait l'équipage, un écart du bateau */
  private moor = false;
  private rowing = false;
  private crewAct: Act | null = null;
  private nudge = { x: 0, z: 0, yaw: 0, lift: 0 };
  private nudged = { x: 0, z: 0, yaw: 0, lift: 0 };
  /** où regarde l'équipage quand l'imprévu lui donne un geste (null : sa place habituelle), et le dernier coup de rame */
  private crewFace: number | null = null;
  /** l'embarquement : les quais (par amarrage), ceux qui y vont, ceux qui sont à bord, ceux qui sont redescendus, depuis quand */
  private docks = new Map<string, [number, number]>();
  private boarding = new Set<number>();
  private aboard = new Set<number>();
  private landed = new Set<number>();
  private boardT = 0;
  /** sur l'île du portail, l'équipe recule vers la plage (l'arche gronde) : de combien */
  private isleBack = 0;
  private stroke = 0;
  /** Le cap de chaque embarcation, qui tourne en douceur (elle pivotait d'un coup au demi-tour, l'équipage restait en arrière) */
  private yaws = new Map<THREE.Object3D, number>();
  /** la faune marine autour de la barque (dauphins, baleine, raies, bancs de poissons) */
  private swimmers: Swimmer[] = [];
  /** les harpons lancés sur le monstre, et le monstre (mégalodon ou kraken) de la chasse en mer */
  private darts: { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; life: number; ti: number }[] = [];
  private monster: Monster | null = null;
  /** l'eau près de la destination : un point mouillé et un point de berge, et le niveau de l'eau */
  private water: { wet: [number, number]; bank: [number, number]; level: number } | null = null;
  private built: THREE.Object3D[] = [];
  private basket: THREE.Mesh | null = null;
  private t = 0;
  private fxTimer = 0;
  readonly kind: string;
  /** le cœur de la mission (troc, source chaude, abbaye…) ; `kind` dit seulement comment l'équipe s'y déplace */
  readonly story: Scene;
  /** habitants d'ailleurs, pièces qui tournent, objets qui grandissent avec le travail, vapeur, fumée, étoiles */
  private npcs: { folk: Folk; pose: FolkPose; off: number }[] = [];
  private spins: { obj: THREE.Object3D; speed: number }[] = [];
  private grows: { obj: THREE.Object3D; from: number; to: number }[] = [];
  private emits: { x: number; y: number; z: number; kind: 'steam' | 'smoke' | 'puff' | 'bubble' | 'star'; every: number; t: number }[] = [];
  private jugglers: { x: number; y: number; z: number; face: number; balls: THREE.Mesh[] }[] = [];
  /** ce que regarde l'équipe (jongleurs, moine, ciel) ; places dans la source ; entrée de la galerie et tas de minerai */
  /** le cœur de l'action (l'enclos, la barque, la montgolfière…), que la caméra regarde quand on suit l'équipe */
  focus: [number, number] = [0, 0];
  /** sa hauteur au-dessus du sol (la montgolfière en vol), pour que la vue la garde dans le cadre */
  lift = 0;
  private bath: { at: [number, number][]; y: number; in: Set<number> } | null = null;
  /** le cercle du pugilat : son centre, la hauteur où l'on boxe, ceux qui y combattent */
  private pit: { x: number; z: number; y: number; in: Set<number> } | null = null;
  private mouth: { at: [number, number]; heap: [number, number] } | null = null;
  private delve = new Map<number, { phase: 'go' | 'in' | 'out' | 'heap'; t: number }>();
  private cartRun: { obj: THREE.Object3D; a: [number, number]; b: [number, number] } | null = null;
  private salts: [number, number][] = [];
  private corral: [number, number] | null = null;
  /** le tracé du chemin de fer : son départ et son cap, les jalons du géomètre, le train de chantier qui suit la tête de voie */
  private works: { x: number; z: number; dir: number; stakes: THREE.Object3D[]; train: THREE.Object3D; puff: number } | null = null;
  /** la montgolfière (nacelle, enveloppe, brûleur), d'où elle part, ses aéronautes, les cordes que tient l'équipe, son vol */
  private balloon: {
    obj: THREE.Group; env: THREE.Object3D; burner: THREE.Object3D; home: [number, number]; y0: number; riders: number[];
    stakes: [number, number][]; ropes: THREE.Line[]; drift: number; high: number; far: number;
  } | null = null;
  /** la voiture de course, sa ligne de départ, l'arche, son circuit (côté s, demi-axes rx, rz), ses tours, son pilote */
  private race: { obj: THREE.Object3D; x: number; z: number; ax: number; s: number; rx: number; rz: number; laps: number; driver: number | null; puff: number } | null = null;
  /**
   * Les grands Jeux : le centre du stade et son sol, la vasque (où, la hauteur de sa coupe, la direction du stade à elle), la
   * flamme de la vasque et celle du relais, les drapeaux, le podium, la course de chaque athlète sur la piste, le feu d'artifice
   */
  private games: {
    sx: number; sz: number; sy: number; half: number; cx: number; cz: number; cy: number; ux: number; uz: number;
    flame: THREE.Object3D; torch: THREE.Object3D; flags: THREE.Object3D[]; podium: THREE.Object3D; laps: Map<number, number>; lit: boolean; boom: number;
  } | null = null;
  /** Le dragon et son antre (voir `dragonLair`) */
  private dragon: DragonLair | null = null;
  /** où en est chaque membre de l'envol ou de la course (aux cordes, à la nacelle, au bord de la piste…) */
  private stage = new Map<number, string>();
  /** la fusée de l'expédition spatiale, sur son pas de tir puis dans le ciel */
  private rocket: RocketShow | null = null;
  /** imprévus joués sur place (pendant la décision, puis la suite de l'option choisie), et l'échec joué au départ */
  private stagings: Staging[] = [];
  /** temps passé à attendre (la barque reste amarrée pendant ce temps) */
  private idle = 0;
  private failed = false;
  /** on explore une grotte : chacun tient une torche de fortune ; leur éclat (1 : normal), et celui vers lequel il va */
  private lit = false;
  private torches = new Map<number, THREE.Object3D>();
  private torchK = 0;
  private torchTo = 1;
  private kindled = false;
  /** la roulotte des jongleurs ; la barque qui tangue plus fort (rapides), la montgolfière secouée (rafale), le ciel couvert */
  private wagon: THREE.Object3D | null = null;
  private rough = 0;
  private gustK = 0;
  private cloudy = false;
  /** les jongleurs et leur tambour, qui suivent l'équipe au village quand elle les ramène ; le frère brasseur */
  private guests: { folk: Folk; pose: FolkPose; off: number }[] = [];
  private monk: { folk: Folk; pose: FolkPose; off: number } | null = null;
  /**
   * La chasse au mammouth : la harde (le vieux mâle d'abord), où elle paît et de quel côté du camp, la façon de chasser
   * (fosses, ravin, ou la harde suivie de loin), le piège et son axe (de la harde vers lui), les fosses et leurs branchages,
   * l'avancement le plus loin atteint, le temps depuis le départ de l'équipe
   */
  private mammoths: Mammoth[] = [];
  private mam: {
    old: Mammoth; at: [number, number]; dir: number; way: 'pits' | 'ravine' | 'follow'; trap: [number, number]; axis: [number, number];
    pits: THREE.Object3D[]; covers: THREE.Object3D[]; k: number; back: number;
  } | null = null;
  /** l'équipe est repartie (une fois) : l'échec se joue, ce qui la suit quitte la scène */
  private departed = false;
  /** l'équipe est repartie : le décor rétrécit et s'efface (secondes depuis, -1 : pas encore) */
  private fade = -1;
  private fadeObjs: { o: THREE.Object3D; y: number }[] = [];
  /** une fusée est sur le pas de tir ou dans le ciel : celle qui attendait au cosmodrome s'efface */
  get launching() { return !!this.rocket; }

  /** l'âge de l'expédition : ce que tire l'équipe (lances, puis balles, puis plasma) */
  private ammo: 'spear' | 'bullet' | 'plasma' = 'spear';
  /** Un coup d'arme de l'équipe, de l'époque : lance (jusqu'au Moyen Âge), balle (industriel, moderne), plasma (futuriste) */
  private fire(from: THREE.Vector3, to: THREE.Vector3, onLand: (() => void) | null = null) { this.combat?.throw(from, to, onLand, this.ammo); }

  constructor(private world: World, private agents: Agents, private group: THREE.Group, a: ActiveExpedition, private combat: CombatFx | null = null) {
    this.ammo = a.age >= 5 ? 'plasma' : a.age >= 3 ? 'bullet' : 'spear';
    const [cx, cz] = a.dest;
    this.story = a.c.scene;
    this.offshore = !!a.sea;
    this.boatKind = boatKindFor(a.age, this.story === 'megalodon' || this.story === 'kraken' || this.story === 'portal');
    let kind = BEHAVIOR[this.story] ?? 'camp';
    // le volcan gagné à pied : pas de barque, l'équipe monte depuis le pied du cône
    if (VOLCANIC.has(this.story) && !a.sea) { kind = 'volcano'; this.volcanoSite(a, [cx, cz]); }
    if (kind === 'boat' || kind === 'fish' || this.story === 'bridge') { this.water = this.findWater(cx, cz); if (!this.water && kind !== 'build') kind = 'camp'; }
    this.kind = kind;
    this.focus = [cx, cz];
    if (kind === 'camp' || kind === 'hunt') this.camp(cx, cz);
    if (kind === 'herd') {
      // la harde sauvage compte plus de bêtes que celles qu'on ramènera
      const kinds = a.c.win.flatMap((e) => (e.t === 'herd' ? e.kinds : []));
      const base = kinds.length ? kinds : ['sheep' as HerdKind];
      for (let i = 0; i < Math.min(6, Math.max(4, base.length + 2)); i++) this.addBeast(base[i % base.length], cx, cz, 0.7 + (i % 3) * 0.35, i * 1.3);
    } else if (kind === 'hunt') {
      this.addBeast('wolf', cx, cz, 2.4, 0.5);
      // les chiens de la meute, qui arrivent avec les chasseurs
      for (let i = 0; i < 2; i++) {
        const actor = hasModel('dog') ? makeActor('dog', 0.2) : null;
        if (!actor) break;
        actor.root.visible = false;
        this.group.add(actor.root);
        this.dogs.push({ obj: actor.root, actor, x: cx + (i ? 0.2 : -0.2), z: cz, tx: cx, tz: cz, heading: 0, wait: 0, speed: 1.7 });
      }
    }
    else if (kind === 'boat') {
      this.launch(a); this.populateSea(a);
      if (this.story === 'isles' && this.boat) this.float = new FloatIsles(this.group, this.props, this.boat.home, this.boat.out, this.boat.y, (x, z) => this.world.surfaceAt(x, z), a.party.length);
      if (this.story === 'wreck' && this.offshore) this.salvage(a);
    }
    else if (kind === 'fish') this.spots = this.bankSpots(a.party.length);
    else if (kind === 'mine') {
      const [ux, uz] = this.uphill(cx, cz), [rx, rz] = this.near(cx + ux * 0.56, cz + uz * 0.56, cx, cz);
      this.put(this.story === 'pass' ? copperGeo() : this.story === 'crater' ? meteorGeo() : rocksGeo(), rx, rz, 0);
      if (this.story === 'pass') { const [qx, qz] = this.near(cx - 0.5, cz - 0.45, cx, cz); this.put(cairnGeo(), qx, qz, 0); }
      // le silex : un pan de falaise derrière le tas, face à l'équipe, même là où la pente est douce
      if (a.m.id === 'flint') { const [fx, fz] = this.near(cx + ux * 0.95, cz + uz * 0.95, cx, cz); this.put(cliffGeo(), fx, fz, Math.atan2(-ux, -uz)); }
      if (this.story === 'crater') {
        // le cratère encore fumant, la pierre tombée du ciel qui rougeoie
        this.put(craterGeo(), rx, rz, 0);
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), GLOW);
        core.position.set(rx + 0.03, this.world.surfaceAt(rx, rz) + 0.1, rz + 0.04);
        this.group.add(core); this.props.push(core);
        this.emits.push({ x: rx, y: this.world.surfaceAt(rx, rz) + 0.12, z: rz, kind: 'smoke', every: 0.5, t: 0 });
      }
      const [kx, kz] = this.near(cx - ux * 0.3 - uz * 0.45, cz - uz * 0.3 + ux * 0.45, cx, cz);
      this.put(cartGeo(), kx, kz, 0.6);
      for (let i = 0; i < 4; i++) { const ang = i * 1.57 + 0.6; this.spots.push([rx + Math.cos(ang) * 0.26, rz + Math.sin(ang) * 0.26]); }
    } else if (kind === 'gather') {
      // les buissons de baies poussent en lisière : dans la clairière la plus proche, où l'on voit les cueilleurs
      const w = this.world, open = (x: number, z: number) => this.free(x, z) && w.veg[w.ci(Math.floor(x), Math.floor(z))] !== VEG_FOREST;
      let gx = cx, gz = cz;
      for (let r = 0.5; r <= 2.5 && !open(gx, gz); r += 0.5)
        for (let k = 0; k < 8; k++) { const x = cx + Math.cos(k * 0.785) * r, z = cz + Math.sin(k * 0.785) * r; if (open(x, z)) { gx = x; gz = z; break; } }
      for (let i = 0; i < 5; i++) {
        const ang = i * 1.256 + 0.3, r = 0.55 + (i % 2) * 0.3;
        const [bx, bz] = this.near(gx + Math.cos(ang) * r, gz + Math.sin(ang) * r, gx, gz);
        if (!this.free(bx, bz)) continue;
        this.put(this.story === 'hops' ? hopGeo() : this.story === 'pebbles' ? pebblesGeo() : bushGeo(), bx, bz, ang);
        this.spots.push([bx - Math.cos(ang) * 0.2, bz - Math.sin(ang) * 0.2]);
      }
      this.put(basketGeo(), gx, gz, 0);
      this.basket = this.put(this.story === 'hops' ? hopConesGeo() : this.story === 'pebbles' ? flintsGeo() : berriesGeo(), gx, gz, 0);
      this.basket.scale.setScalar(0.001);
    }
    if (this.story === 'build' || this.story === 'corral') {
      // enclos : des piquets en cercle (pierres sèches à partir du Moyen Âge ; branchages où l'on rabat les bêtes), plantés au fil du travail
      const stone = this.story === 'build' && a.m.age >= 2, n = 12;
      // dans la clairière la plus proche, pas sous les arbres : là où l'on voit l'enclos sortir de terre
      const [ox, oz] = this.clearing(cx, cz, 0.95);
      this.focus = [ox, oz];
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2, x = ox + Math.cos(ang) * 0.95, z = oz + Math.sin(ang) * 0.95;
        if (!this.free(x, z)) continue;
        // un piquet et les deux traverses qui le relient au précédent
        const o = new THREE.Group();
        o.position.set(x, this.world.surfaceAt(x, z), z);
        const post = new THREE.Mesh(stone ? stoneGeo() : postGeo(), mats.body);
        post.rotation.y = -ang;
        post.castShadow = true;
        o.add(post);
        if (!stone && i > 0) {
          const pa = ((i - 1) / n) * Math.PI * 2, px = ox + Math.cos(pa) * 0.95, pz = oz + Math.sin(pa) * 0.95;
          for (const y of [0.06, 0.12]) {
            const r = new THREE.Mesh(railGeo(), mats.body);
            r.position.y = y;
            r.scale.z = Math.hypot(px - x, pz - z);
            r.rotation.y = Math.atan2(x - px, z - pz);
            o.add(r);
          }
        }
        this.group.add(o);
        this.props.push(o);
        o.visible = false;
        this.built.push(o);
        this.spots.push([ox + Math.cos(ang) * 0.7, oz + Math.sin(ang) * 0.7]);
      }
    } else if (kind === 'rails') {
      // voie ferrée : des tronçons posés l'un après l'autre, dans la direction la plus dégagée
      let best = 0, bestN = -1;
      for (let d = 0; d < 8; d++) {
        const ang = (d / 8) * Math.PI * 2;
        let n = 0;
        while (n < 10 && this.free(cx + Math.sin(ang) * 0.3 * (n + 1), cz + Math.cos(ang) * 0.3 * (n + 1))) n++;
        if (n > bestN) { bestN = n; best = ang; }
      }
      // le tracé : les jalons du géomètre balisent la voie devant les poseurs ; au bout, l'arpenteur à son théodolite ; au
      // départ, les rails et les traverses en réserve ; le train de chantier suit la tête de voie, sa plate-forme chargée
      const n = Math.max(4, bestN), sx = Math.sin(best), sz = Math.cos(best), px = Math.cos(best), pz = -Math.sin(best);
      const stakes: THREE.Object3D[] = [];
      for (let i = 0; i < n; i++) {
        const x = cx + sx * 0.3 * i, z = cz + sz * 0.3 * i;
        const o = this.put(laidGeo(), x, z, best);
        o.visible = false;
        this.built.push(o);
        this.spots.push([x + px * 0.2, z + pz * 0.2]);
        stakes.push(this.put(stakeFlagGeo(), x + sx * 0.15 + px * 0.16, z + sz * 0.15 + pz * 0.16, best + Math.PI / 2));
      }
      const [ex, ez] = this.near(cx + sx * 0.3 * n + px * 0.25, cz + sz * 0.3 * n + pz * 0.25, cx, cz);
      this.put(telescopeGeo(), ex, ez, best + Math.PI);
      this.npc('scholar', a.m.age, ex + px * 0.12, ez + pz * 0.12, best + Math.PI, 'talk');
      this.put(railStockGeo(), cx - sx * 0.3 - px * 0.3, cz - sz * 0.3 - pz * 0.3, best);
      const train = new THREE.Group(), loco = new THREE.Mesh(locoGeo(a.m.age, 0x3a6ab8).body, mats.body), car = new THREE.Mesh(flatcarGeo(), mats.body);
      loco.castShadow = car.castShadow = true;
      car.position.z = 0.36;
      train.add(loco, car);
      train.rotation.y = best;
      this.group.add(train); this.props.push(train);
      this.works = { x: cx, z: cz, dir: best, stakes, train, puff: 0 };
    }
    this.heart(a, cx, cz);
  }

  // ---------------- Le cœur de la mission ----------------
  /** Ce pour quoi l'équipe est venue : on le pose sur place */
  private heart(a: ActiveExpedition, cx: number, cz: number) {
    const w = this.world, age = a.m.age, st = this.story, y = (x: number, z: number) => w.surfaceAt(x, z);
    if (st === 'launch' || st === 'moon' || st === 'colony') this.launchpad(a, cx, cz);
    else if (st === 'mammoth') this.mammothHunt(a, cx, cz);
    else if (st === 'games') this.gamesStage(a, cx, cz);
    else if (st === 'dragon') this.dragonLair(a, cx, cz);
    else if (st === 'salt') {
      // pierres à sel au bord de l'eau ; l'équipe guette, cachée derrière les buissons
      for (let i = 0; i < 3; i++) { const [x, z] = this.near(cx + Math.cos(i * 2.1) * 0.35, cz + Math.sin(i * 2.1) * 0.35, cx, cz); this.put(saltGeo(), x, z, i); this.salts.push([x, z]); }
      for (const s of [-1, 1]) { const [x, z] = this.near(cx - 0.85, cz + s * 0.35, cx, cz); this.put(bushGeo(), x, z, s); this.spots.push([x - 0.18, z]); }
    } else if (st === 'roundup') {
      const [x, z] = this.near(cx + 0.9, cz - 0.2, cx, cz);
      this.put(corralGeo(), x, z, 0);
      this.corral = [x, z];
      for (const b of this.beasts) b.speed = 0.34;
    } else if (st === 'smoke' || st === 'swarm') {
      // le vieux chêne enfumé ou l'arbre où l'essaim s'est posé, en lisière (pas caché sous la forêt) ; les abeilles tournent autour
      const [ox, oz] = this.clearing(cx, cz, 0.6), [tx, tz] = this.near(ox + 0.35, oz - 0.3, ox, oz), ty = y(tx, tz);
      this.put(st === 'smoke' ? oakGeo() : sproutTreeGeo(), tx, tz, 0);
      const hive = st === 'smoke' ? [tx, ty + 0.22, tz + 0.1] : [tx + 0.16, ty + 0.2, tz];
      this.bees(hive[0], hive[1], hive[2]);
      if (st === 'smoke') {
        this.fireAt(tx, tz + 0.28);
        this.emits.push({ x: tx, y: ty + 0.06, z: tz + 0.28, kind: 'smoke', every: 0.28, t: 0 });
        const [hx, hz] = this.near(ox - 0.35, oz + 0.3, ox, oz);
        this.grows.push({ obj: this.put(logHiveGeo(), hx, hz, 0), from: 0.001, to: 1 });
      } else {
        // la grappe d'abeilles se vide dans le panier de paille posé dessous
        const c = new THREE.Mesh(clusterGeo(), mats.body);
        c.position.set(hive[0], hive[1], hive[2]);
        this.group.add(c); this.props.push(c);
        this.grows.push({ obj: c, from: 1, to: 0.25 });
        this.put(skepGeo(), tx + 0.16, tz + 0.05, 0);
      }
      for (let i = 0; i < 4; i++) { const ang = i * 1.57 + 0.4; this.spots.push(this.near(tx + Math.cos(ang) * 0.32, tz + Math.sin(ang) * 0.32, ox, oz)); }
      this.focus = [tx, tz];
    } else if (st === 'trade') {
      // chez les voisins (ou les mineurs nomades) : une natte, nos marchandises qui partent, les leurs qui arrivent au chariot
      const nomads = a.m.id === 'mine';
      this.put(blanketGeo(), cx, cz, 0);
      this.grows.push({ obj: this.put(nomads ? foodGeo() : potsGeo(), cx - 0.08, cz, 0), from: 1, to: 0.15 });
      const [kx, kz] = this.near(cx - 0.6, cz - 0.15, cx, cz);
      this.put(cartGeo(), kx, kz, 0.4);
      this.grows.push({ obj: this.put(nomads ? rocksGeo() : sacksGeo(), kx + 0.05, kz + 0.25, 0), from: 0.001, to: 1 });
      for (const [dx, dz] of [[0.78, -0.4], [0.72, 0.42]]) { const [hx, hz] = this.near(cx + dx, cz + dz, cx, cz); this.put(nomads ? yurtGeo() : hutGeo(), hx, hz, Math.atan2(cx - hx, cz - hz)); }
      const people: FolkRole[] = nomads ? ['nomad', 'drummer'] : ['villager', 'villager'];
      people.forEach((m, i) => this.npc(m, age, cx + 0.28, cz + (i ? 0.14 : -0.12), -Math.PI / 2, 'talk'));
      this.spots.push([cx - 0.24, cz - 0.08], [cx - 0.24, cz + 0.1], [kx + 0.15, kz + 0.12]);
      this.focus = [cx + 0.28, cz];
    } else if (st === 'pugilat') {
      // le cercle de sable (un ring dès l'âge industriel), sur le replat le plus plat ; deux par deux, ils y boxent à tour de rôle
      // sous l'œil du vieux champion, les autres crient autour ; la stèle, le banc et l'amphore au bord
      const ring = a.age >= 3, [px, pz] = this.flatSpot(cx, cz, PIT_R + 0.08), [, hi] = this.relief(px, pz, PIT_R + 0.05), py = hi + 0.002;
      this.put(fightPitGeo(ring), px, pz, 0).position.y = py;
      this.pit = { x: px, z: pz, y: py + (ring ? 0.058 : 0.012), in: new Set() };
      const [hx, hz] = this.near(px - PIT_R - 0.2, pz - 0.18, cx, cz);
      this.put(hermGeo(), hx, hz, Math.PI / 2);
      const [bx, bz] = this.near(px + 0.05, pz - PIT_R - 0.22, cx, cz);
      this.put(fightBenchGeo(), bx, bz, 0);
      this.npc('sage', age, px - PIT_R - 0.12, pz + 0.05, Math.PI / 2, 'talk');
      // quelques curieux venus voir
      for (const [ang, r] of [[0.5, 0.62], [2.4, 0.66], [3.9, 0.6]]) {
        const [x, z] = this.near(px + Math.cos(ang) * r, pz + Math.sin(ang) * r, cx, cz);
        this.npc('villager', age, x, z, Math.atan2(px - x, pz - z), 'cheer');
      }
      this.focus = [px, pz];
    } else if (st === 'spring') {
      // la source chaude : bassin fumant cerclé de pierres (de roseaux au bord de la rivière) ; on s'y baigne à tour de rôle. Sur
      // le replat le plus plat à portée, posé au plus haut du sol sous lui (jamais à moitié enterré dans la pente) ; un socle de
      // pierres le soutient du côté où le sol descend
      const [px, pz] = this.flatSpot(cx, cz, POOL_R), [lo, hi] = this.relief(px, pz, POOL_R), py = hi + 0.004;
      this.put(poolGeo(a.c.dest === 'river'), px, pz, 0).position.y = py;
      if (py - lo > 0.015) { const base = this.put(poolBaseGeo(), px, pz, 0.3); base.position.y = lo - 0.03; base.scale.y = py - lo + 0.03; }
      this.emits.push({ x: px, y: py + 0.05, z: pz, kind: 'steam', every: 0.18, t: 0 });
      this.bath = { at: [[px - 0.11, pz + 0.04], [px + 0.12, pz - 0.05]], y: py + 0.024 - 0.07, in: new Set() };
      for (let i = 0; i < 6; i++) { const ang = i * 1.05 + 0.3; this.spots.push([px + Math.cos(ang) * 0.5, pz + Math.sin(ang) * 0.5]); }
      this.focus = [px, pz];
    } else if (st === 'gallery' || st === 'cave') {
      // l'entrée : dans la pente pour une galerie ou un tunnel ; la bouche de la grotte voisine, sinon une entrée de grotte au
      // bord de la faille ou au pied de la paroi ; tas de minerai et wagonnet. Torches plantées de part et d'autre de la bouche
      let mx = cx, mz = cz, real = false, fissure = false;
      const e = st === 'gallery' ? -1 : w.outpostEntrance(Math.floor(cx), Math.floor(cz), 1);
      if (e >= 0 && w.veg[e] === VEG_CAVE) {
        // la bouche de la grotte, du côté de l'équipe
        const x = e % N, z = Math.floor(e / N), ang = Math.atan2(cx - x - 0.5, cz - z - 0.5);
        mx = x + 0.5 + Math.sin(ang) * 0.6; mz = z + 0.5 + Math.cos(ang) * 0.6; real = true;
      } else if (e >= 0) {
        // au bord de la faille la plus proche, entre elle et l'équipe : l'entrée de la grotte qui y descend
        let bd = Infinity, fx = cx, fz = cz;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz, d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (w.inCells(x, z) && w.decor[w.ci(x, z)] && d < bd) { bd = d; fx = x + 0.5; fz = z + 0.5; fissure = true; }
        }
        [mx, mz] = this.near(fx + (cx - fx) * 0.45, fz + (cz - fz) * 0.45, cx, cz);
      }
      if (!real && !fissure) {
        let best = 0, gain = -1e9;
        for (let d = 0; d < 8; d++) { const ang = (d / 8) * Math.PI * 2, g = y(cx + Math.sin(ang) * 0.8, cz + Math.cos(ang) * 0.8) - y(cx, cz); if (g > gain) { gain = g; best = ang; } }
        [mx, mz] = this.near(cx + Math.sin(best) * 0.6, cz + Math.cos(best) * 0.6, cx, cz);
      }
      // l'entrée qu'on bâtit (au bord de la faille, au pied de la paroi) : dans la clairière la plus proche, pas cachée sous les arbres
      if (st !== 'gallery' && !real) { const [qx, qz] = this.clearing(mx, mz, 0.8); if (Math.hypot(qx - cx, qz - cz) > 0.5) [mx, mz] = [qx, qz]; }
      // (l'entrée bâtie : la bouche s'ouvre à 0,22 devant la butte ; les torches se plantent devant ses rochers)
      const face = Math.atan2(cx - mx, cz - mz), built = st !== 'gallery' && !real, lip = built ? 0.22 : 0.12, ahead = built ? 0.42 : 0.07, side = built ? 0.36 : 0.2;
      if (st === 'gallery') this.put(galleryGeo(a.m.id === 'railway'), mx, mz, face);
      else if (built) this.put(caveMouthGeo(), mx, mz, face).scale.setScalar(1.6);
      if (st !== 'gallery') for (const s of [-1, 1]) { const tx = mx + Math.sin(face) * ahead + Math.cos(face) * s * side, tz = mz + Math.cos(face) * ahead - Math.sin(face) * s * side; this.put(stakeTorchGeo(), tx, tz, 0); this.flameAt(tx, y(tx, tz) + 0.26, tz, 0.6); }
      const found = st !== 'gallery';
      const hx = cx - Math.sin(face) * 0.3, hz = cz - Math.cos(face) * 0.3;
      this.grows.push({ obj: this.put(rocksGeo(), hx, hz, 0), from: 0.25, to: 1.1 });
      if (!found) {
        for (let i = 0; i < 3; i++) { const t = 0.15 + i * 0.3, x = mx + (cx - mx) * t, z = mz + (cz - mz) * t; this.put(trackGeo(), x, z, face + Math.PI); }
        this.cartRun = { obj: this.put(cartGeo(), mx, mz, face), a: [mx + Math.sin(face) * 0.12, mz + Math.cos(face) * 0.12], b: [hx + Math.sin(face) * 0.1, hz + Math.cos(face) * 0.1] };
      }
      this.emits.push({ x: hx, y: y(hx, hz) + 0.1, z: hz, kind: 'puff', every: 0.7, t: 0 });
      this.mouth = { at: [mx + Math.sin(face) * lip, mz + Math.cos(face) * lip], heap: [hx, hz] };
      this.focus = [(mx + hx) / 2, (mz + hz) / 2];
      // on explore la grotte à la lueur des torches : chacun a la sienne
      this.lit = st !== 'gallery';
    } else if (st === 'race') {
      // la ligne de départ de la course : arche à damier, la voiture sans chevaux qui pétarade, bidon d'essence ; l'équipe la
      // prépare tout autour, l'ingénieur donne ses consignes ; puis le pilote s'installe au volant et la voiture file faire ses
      // tours de circuit (un de plus si l'on pousse la machine à fond), repasse sous l'arche et revient sur la ligne
      const [ax, az] = this.near(cx + 0.55, cz, cx, cz);
      this.put(raceArchGeo(), ax, az, Math.PI / 2);
      const [vx, vz] = this.near(cx + 0.12, cz, cx, cz);
      const car = this.put(oldCarGeo(), vx, vz, Math.PI / 2);
      // le circuit : une boucle qui part de la ligne vers l'arche, du côté le plus dégagé, aussi grande que le terrain le permet
      let best = { s: 1, rx: 1, rz: 0.7, n: -1 };
      for (const s of [1, -1]) for (const rx of [1.7, 1.3, 1]) for (const rz of [1.2, 0.9, 0.7]) {
        let n = (rx + rz) * 0.1;
        for (let j = 0; j < 24; j++) { const th = (j / 24) * Math.PI * 2; if (this.free(vx + rx * Math.sin(th), vz + s * rz * (1 - Math.cos(th)))) n++; }
        if (n > best.n) best = { s, rx, rz, n };
      }
      this.race = { obj: car, x: vx, z: vz, ax, s: best.s, rx: best.rx, rz: best.rz, laps: a.c.risk > 0.3 ? 3 : 2, driver: a.party[0] ?? null, puff: 0 };
      this.put(fuelCanGeo(), vx - 0.04, vz - best.s * 0.2, 0.3);
      for (const [dx, dz] of [[-0.04, -0.2], [-0.24, 0.04], [0.02, 0.22], [0.2, -0.18]]) this.spots.push([vx + dx, vz + dz]);
      this.npc('scholar', age, vx - 0.32, vz - best.s * 0.2, 0.6, 'talk');
      this.focus = [vx, vz];
    } else if (st === 'balloon') {
      // la montgolfière : on la gonfle au sol (le brûleur rugit, l'enveloppe s'arrondit, l'équipe tient les cordes), deux
      // aéronautes montent dans la nacelle, elle s'élève, dérive au-dessus de la campagne (plus haut et plus loin dans les
      // vents de la montagne) et revient se poser près de l'équipe, qui l'a suivie des yeux
      const [bx, bz] = this.near(cx + 0.6, cz - 0.2, cx, cz), S = 1.6;
      const obj = new THREE.Group(), basket = new THREE.Mesh(BALLOON_BASKET(), mats.body), env = new THREE.Mesh(BALLOON_ENV(), mats.body), burner = new THREE.Group();
      basket.castShadow = env.castShadow = true;
      env.position.y = 0.18; burner.position.y = 0.19;
      const f = this.flameAt(0, 0, 0, 0.5);
      this.group.remove(f); burner.add(f);
      obj.add(basket, env, burner);
      obj.position.set(bx, y(bx, bz), bz); obj.scale.setScalar(S);
      this.group.add(obj); this.props.push(obj);
      const stakes: [number, number][] = [], ropes: THREE.Line[] = [];
      for (let i = 0; i < 4; i++) {
        const ang = i * 1.57 + 0.6;
        stakes.push(this.near(bx + Math.cos(ang) * 0.5, bz + Math.sin(ang) * 0.5, bx, bz));
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), ROPE);
        l.visible = false; l.userData.flat = true;
        this.group.add(l); this.props.push(l); ropes.push(l);
      }
      const windy = a.c.dest === 'mountain';
      this.balloon = {
        obj, env, burner, home: [bx, bz], y0: y(bx, bz), riders: a.party.slice(0, Math.min(2, a.party.length - 1)), stakes, ropes,
        drift: ((cx * 7.3 + cz * 3.1) % 6.283), high: windy ? 2 : 1.7, far: windy ? 2.4 : 1.6,
      };
      this.focus = [bx, bz];
    } else if (st === 'troupe') {
      // la roulotte des jongleurs, deux jongleurs et leurs balles, un tambour ; l'équipe applaudit en demi-cercle
      const [wx, wz] = this.near(cx + 0.6, cz - 0.4, cx, cz);
      this.wagon = this.put(wagonGeo(), wx, wz, 0.4);
      for (const [dx, dz] of [[0.2, -0.14], [0.24, 0.18]]) {
        const x = cx + dx, z = cz + dz;
        this.guests.push(this.npc('juggler', age, x, z, -Math.PI / 2, 'juggle'));
        const balls = [0xd8443a, 0xe8b84a, 0x4a7aa8].map((c) => { const m = new THREE.Mesh(ballGeo(c), mats.body); this.group.add(m); this.props.push(m); return m; });
        this.jugglers.push({ x, y: y(x, z), z, face: -Math.PI / 2, balls });
      }
      const [dx, dz] = this.near(cx + 0.45, cz + 0.4, cx, cz);
      this.put(drumGeo(), dx - 0.08, dz, 0);
      this.guests.push(this.npc('drummer', age, dx, dz, -Math.PI / 2 - 0.5, 'sit'));
      this.focus = [cx + 0.22, cz];
    } else if (st === 'abbey') {
      // la chapelle de l'abbaye, le frère qui touille sa cuve fumante, les tonneaux ; l'équipe écoute et goûte
      const [ax, az] = this.near(cx + 0.75, cz, cx, cz);
      this.put(chapelGeo(), ax, az, Math.PI);
      const kx = cx + 0.25, kz = cz;
      this.put(kettleGeo(), kx, kz, Math.PI / 2);
      this.emits.push({ x: kx, y: y(kx, kz) + 0.14, z: kz, kind: 'steam', every: 0.3, t: 0 });
      this.flameAt(kx, y(kx, kz) + 0.01, kz, 0.6);
      this.monk = this.npc('monk', age, kx + 0.13, kz + 0.02, -Math.PI / 2, 'talk');
      this.put(barrelsGeo(), cx + 0.42, cz + 0.32, 0);
      this.focus = [kx, kz];
    } else if (st === 'stars') {
      // lunettes braquées vers le ciel, l'astronome ; des étoiles filantes passent au-dessus
      for (const [dx, dz, r] of [[-0.32, -0.15, 0.4], [0.3, -0.2, -0.3], [0.02, 0.32, 2.8]]) { const [x, z] = this.near(cx + dx, cz + dz, cx, cz); this.put(telescopeGeo(), x, z, r); this.spots.push([x - Math.sin(r) * 0.12, z - Math.cos(r) * 0.12]); }
      this.npc('scholar', age, cx + 0.12, cz - 0.05, -0.8, 'talk');
      this.emits.push({ x: cx, y: y(cx, cz) + 2.4, z: cz, kind: 'star', every: 1.1, t: 0 });
    } else if (st === 'bridge') {
      // le tablier avance au-dessus de l'eau, travée après travée (de fer à l'âge industriel)
      const wat = this.water, from = wat ? wat.bank : [cx, cz] as [number, number], to = wat ? wat.wet : [cx + 1, cz] as [number, number];
      const d = Math.max(0.01, Math.hypot(to[0] - from[0], to[1] - from[1])), ux = (to[0] - from[0]) / d, uz = (to[1] - from[1]) / d, ry = Math.atan2(-uz, ux);
      let wet = false;
      for (let i = 0; i < 9; i++) {
        const x = from[0] + ux * (0.12 + i * 0.2), z = from[1] + uz * (0.12 + i * 0.2);
        const under = wat ? this.depth(x, z) : null;
        if (under !== null) wet = true; else if (wet && i > 2) break;
        const o = this.put(deckGeo(age >= 3), x, z, ry);
        o.position.y = Math.max(y(x, z), (wat?.level ?? 0) + 0.12);
        o.visible = false;
        this.built.push(o);
        this.spots.push([from[0] - ux * 0.15 + uz * (i % 2 ? 0.15 : -0.15), from[1] - uz * 0.15 - ux * (i % 2 ? 0.15 : -0.15)]);
      }
    } else if (st === 'drill') {
      // tour de sondage, chaudière qui fume, carottes de roche alignées au fil du travail
      this.put(derrickGeo(), cx, cz, 0);
      const [bx, bz] = this.near(cx - 0.4, cz + 0.12, cx, cz);
      this.put(boilerGeo(), bx, bz, 0);
      this.emits.push({ x: bx + 0.07, y: y(bx, bz) + 0.34, z: bz, kind: 'smoke', every: 0.4, t: 0 });
      for (let i = 0; i < 7; i++) {
        const [x, z] = this.near(cx + 0.3 + (i % 2) * 0.04, cz - 0.36 + i * 0.1, cx, cz), o = this.put(coreGeo(), x, z, 0);
        o.visible = false; this.built.push(o); this.spots.push([x - 0.14, z]);
      }
    } else if (st === 'summit' || st === 'basecamp') {
      // le drapeau planté, la station météo montée pièce à pièce, son anémomètre qui tourne ; le camp de base au pied
      // le drapeau au point le plus haut alentour ; depuis le camp de base, la station monte au sommet voisin
      let [sx, sz] = this.peak(cx, cz, 2, 0);
      if (st === 'basecamp') {
        [0xd8443a, 0xe8b84a, 0x4a7aa8].forEach((c, i) => { const [x, z] = this.near(cx + Math.cos(i * 2.1) * 0.4, cz + Math.sin(i * 2.1) * 0.4, cx, cz); this.put(tentGeoC(c), x, z, i * 2.1 + Math.PI / 2); });
        this.put(sacksGeo(), cx, cz, 0);
        [sx, sz] = this.peak(cx, cz, 3, 0.9);
      }
      this.focus = st === 'summit' ? [sx, sz] : [(cx + sx) / 2, (cz + sz) / 2];
      this.put(flagGeo(), sx, sz, 0.4);
      const [mx, mz] = this.near(sx + 0.28, sz + 0.1, sx, sz);
      const station = this.put(stationGeo(), mx, mz, 0);
      const cups = this.put(cupsGeo(), mx, mz, 0);
      cups.position.y += 0.37;
      this.spins.push({ obj: cups, speed: 4 });
      for (const o of [station, cups]) { o.visible = false; this.built.push(o); }
      this.spots.push([mx - 0.15, mz + 0.1], [mx + 0.12, mz + 0.14]);
    }
  }

  /**
   * Le cosmodrome : la fusée de la mission dressée sur le pas de tir (fusée-sonde du premier vol, fusée lunaire, vaisseau
   * colonial), la vapeur des ergols qui s'échappe de ses flancs ; les trois astronautes (ou les colons) attendent au pied de la
   * tour, en scaphandre, puis montent à bord. L'équipe suit le compte à rebours au bord du pas de tir
   */
  private launchpad(a: ActiveExpedition, cx: number, cz: number) {
    const w = this.world, st = this.story, kind: RocketKind = st === 'launch' ? 'probe' : st === 'moon' ? 'moon' : 'colony';
    // le cosmodrome le plus proche, et son pas de tir (le modèle tourne avec le bâtiment)
    let pad: Building | null = null, bd = Infinity;
    for (const b of w.buildings.values()) if (b.kind === 'spaceport') { const s = sizeOf(b), d = Math.hypot(b.x + s / 2 - cx, b.z + s / 2 - cz); if (d < bd) { bd = d; pad = b; } }
    const [px, y0, pz, ry] = pad ? padSpot(w, pad) : [cx + 1.2, w.surfaceAt(cx + 1.2, cz), cz, 0];
    const obj = new THREE.Group(), inner = rocketMesh(kind);
    inner.rotation.y = ry;
    // les flammes, sous chaque tuyère : un dard blanc dans un grand cône orangé
    const flame = new THREE.Group(), R = ROCKET_R[kind];
    const nozzles: [number, number, number][] = kind === 'colony' ? [[0, 0, 0.09], ...[0, 1, 2, 3].map((k): [number, number, number] => [Math.cos(k * Math.PI / 2 + Math.PI / 4) * 0.2, Math.sin(k * Math.PI / 2 + Math.PI / 4) * 0.2, 0.05])] : [[0, 0, kind === 'moon' ? 0.1 : 0.05]];
    for (const [fx, fz, r] of nozzles) {
      const out = new THREE.Mesh(new THREE.ConeGeometry(r, r * 9, 8).rotateX(Math.PI).translate(fx, -r * 4.5, fz), FLAME);
      out.add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, r * 5, 6).rotateX(Math.PI).translate(fx, -r * 2.5, fz), FLAME_IN));
      flame.add(out);
    }
    flame.scale.setScalar(0.001);
    inner.add(flame);
    obj.add(inner);
    obj.position.set(px, y0, pz);
    this.group.add(obj); this.props.push(obj);
    const glare = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), GLARE.clone());
    glare.position.set(px, y0 + 0.012, pz);
    this.group.add(glare); this.props.push(glare);
    // la vapeur des ergols, au flanc de la fusée, jusqu'à l'allumage
    const vapor = { x: px + R * 1.2, y: y0 + ROCKET_H[kind] * 0.55, z: pz, kind: 'steam' as const, every: 0.3, t: 0 };
    this.emits.push(vapor);
    // l'équipage attend au pied de la tour, du côté de l'équipe
    const toward = Math.atan2(cx - px, cz - pz), n = kind === 'probe' ? 0 : kind === 'moon' ? 3 : 6, crew: RocketShow['crew'] = [];
    for (let i = 0; i < n; i++) {
      const ang = toward + (i - (n - 1) / 2) * 0.28, rr = R + 0.42, x = px + Math.sin(ang) * rr, z = pz + Math.cos(ang) * rr;
      crew.push({ n: this.npc('astronaut', 5, x, z, ang + Math.PI, 'idle'), from: [x, z] });
    }
    this.rocket = { obj, flame, glare, kind, x: px, z: pz, y0, dir: toward + Math.PI + 0.6, crew, vapor, puff: 0, trail: 0 };
    this.focus = [px, pz];
  }

  /**
   * La chasse au mammouth : le camp des chasseurs (tente, feu, traîneau vide) et, plus loin du côté le plus dégagé, la harde
   * qui paît (le vieux mâle, une femelle, son petit). Entre les deux, le piège : trois fosses qu'on creuse puis qu'on couvre de
   * branchages (dans la plaine), ou le ravin entre ses deux rangées de blocs (dans la montagne, où les rabatteurs ont une
   * torche au poing) ; au-delà des collines, on suit la harde de loin, et le vieux mâle traîne derrière les autres
   */
  private mammothHunt(a: ActiveExpedition, cx: number, cz: number) {
    this.camp(cx, cz);
    const way = a.c.dest === 'mountain' ? 'ravine' : a.c.dest === 'far' ? 'follow' : 'pits';
    let dir = 0, best = -1;
    for (let d = 0; d < 12; d++) {
      const ang = (d / 12) * Math.PI * 2;
      let n = 0;
      while (n < 6 && this.free(cx + Math.sin(ang) * 0.5 * (n + 1), cz + Math.cos(ang) * 0.5 * (n + 1))) n++;
      if (n > best) { best = n; dir = ang; }
    }
    const sx = Math.sin(dir), sz = Math.cos(dir), px = Math.cos(dir), pz = -Math.sin(dir);
    const at = this.near(cx + sx * 2.4, cz + sz * 2.4, cx, cz);
    // le piège, entre le camp et la harde, un peu de côté (le ravin plus à l'écart) ; suivie de loin, là où le vieux mâle
    // s'attarde, derrière les autres
    const side = way === 'ravine' ? 0.9 : 0.4;
    const trap = way === 'follow' ? this.near(at[0] - sx * 0.7 + px * 0.6, at[1] - sz * 0.7 + pz * 0.6, cx, cz) : this.near(cx + sx * 1.3 + px * side, cz + sz * 1.3 + pz * side, cx, cz);
    // le piège s'ouvre face à la harde : le vieux mâle y arrive en venant d'elle
    const gd = Math.max(0.01, Math.hypot(trap[0] - at[0], trap[1] - at[1])), axis: [number, number] = [(trap[0] - at[0]) / gd, (trap[1] - at[1]) / gd];
    const herd = [[1.15, -0.5, 0], [0.95, 0.1, 0], [0.5, 0.45, 0.25]].map(([size, u, v], i) => {
      const [x, z] = this.near(at[0] + px * u + sx * v, at[1] + pz * u + sz * v, cx, cz);
      return this.addMammoth(x, z, size, dir + Math.PI + (i - 1) * 0.7);
    });
    const pits: THREE.Object3D[] = [], covers: THREE.Object3D[] = [];
    if (way === 'pits') for (let i = 0; i < 3; i++) {
      const o = i ? (i === 1 ? 0.62 : -0.62) : 0, [x, z] = i ? this.near(trap[0] + px * o - sx * 0.15, trap[1] + pz * o - sz * 0.15, cx, cz) : trap;
      pits.push(this.put(pitGeo(), x, z, i));
      const c = this.put(pitCoverGeo(), x, z, i * 1.3);
      c.visible = false;
      covers.push(c);
      // les creuseurs, de part et d'autre de chaque fosse
      for (const s of [-1, 1]) this.spots.push([x + px * s * 0.36, z + pz * s * 0.36]);
    } else if (way === 'ravine') {
      this.put(ravineGeo(), trap[0], trap[1], Math.atan2(axis[0], axis[1]));
      // les rabatteurs se postent derrière la harde, pour la pousser vers le ravin
      for (let i = 0; i < 5; i++) this.spots.push(this.near(at[0] - axis[0] * 0.95 + axis[1] * (i - 2) * 0.35, at[1] - axis[1] * 0.95 - axis[0] * (i - 2) * 0.35, cx, cz));
    } else for (let i = 0; i < 3; i++) this.spots.push(this.near(cx + sx * 1.1 + px * (i - 1) * 0.35, cz + sz * 1.1 + pz * (i - 1) * 0.35, cx, cz));
    this.lit = way === 'ravine';
    this.focus = [(cx + at[0]) / 2, (cz + at[1]) / 2];
    this.mam = { old: herd[0], at, dir, way, trap, axis, pits, covers, k: 0, back: 0 };
  }

  /**
   * Un mammouth de taille `size` (1 : une femelle adulte) en (x, z), tourné vers `heading` : la bête articulée de `beasts.ts`
   * (robe tirée de sa taille). Ses gestes sont menés par `stepMammoths`, pas par `sMove` (sa bête n'a pas d'`actor`)
   */
  private addMammoth(x: number, z: number, size: number, heading: number): Mammoth {
    const actor = makeBeast('mammoth', Math.floor(size * 7), MAMMOTH_SCALE * size, 0.94 + (size % 0.1));
    const o = actor.root;
    o.position.set(x, this.world.surfaceAt(x, z), z);
    o.rotation.y = heading;
    this.group.add(o);
    const b: Beast = { obj: o, actor: null, x, z, tx: x, tz: z, heading, wait: 1 + size * 2, speed: 0.1 };
    this.beasts.push(b);
    const m: Mammoth = { b, actor, size, ph: size * 3, px: x, pz: z, v: 0, trumpet: 0, lie: 0, sink: 0 };
    this.mammoths.push(m);
    play(actor, ['Idle']);
    return m;
  }

  /** Un habitant d'ailleurs (voisin, nomade, moine, jongleur, astronome) qui reste à sa place et fait son geste */
  private npc(role: FolkRole, age: number, x: number, z: number, face: number, pose: FolkPose) {
    const folk = makeFolk({ age, v: Math.floor(x * 131 + z * 17), role });
    folk.root.position.set(x, this.world.surfaceAt(x, z), z);
    folk.root.rotation.y = face;
    this.group.add(folk.root);
    const n = { folk, pose, off: x * 7 };
    this.npcs.push(n);
    return n;
  }

  /** Une flamme qui danse en (x, y, z) */
  private flameAt(x: number, y: number, z: number, s = 1) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.045 * s, 0.13 * s, 5).translate(0, 0.065 * s, 0), FLAME);
    f.add(new THREE.Mesh(new THREE.ConeGeometry(0.025 * s, 0.08 * s, 5).translate(0, 0.04 * s, 0), FLAME_IN));
    f.position.set(x, y, z);
    this.group.add(f); this.props.push(f);
    this.spins.push({ obj: f, speed: 0 });
    return f;
  }

  /** Un petit feu d'herbes humides */
  private fireAt(x: number, z: number) { this.put(fireGeo(), x, z, 0); this.flameAt(x, this.world.surfaceAt(x, z) + 0.015, z, 0.8); }

  /** Un nuage d'abeilles qui tourne autour de (x, y, z) */
  private bees(x: number, y: number, z: number) {
    const g = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39, r = 0.07 + (i % 4) * 0.04;
      const b = new THREE.Mesh(ballGeo(0xf0c040), mats.body);
      b.scale.setScalar(0.7);
      b.position.set(Math.cos(a) * r, Math.sin(i * 1.7) * 0.06, Math.sin(a) * r);
      g.add(b);
    }
    g.position.set(x, y, z);
    this.group.add(g); this.props.push(g);
    this.spins.push({ obj: g, speed: 2.2 });
  }

  // ---------------- Les imprévus, joués sur place ----------------
  /**
   * Un imprévu surgit : on le pose sur la scène. On le voit tout de suite (le jeu s'arrête pendant la décision) : le nuage
   * d'orage, les loups qui tournent autour de l'équipe, l'eau qui monte, le voyageur assis au bord du chemin…
   */
  private stageEvent(id: string, a: ActiveExpedition, fail = false) {
    const s: Staging = { id, pick: fail ? 0 : -1, t: 0, after: 0, end: -1, objs: [], own: [], step: () => false };
    const leader = (k: HerdKind, acts: ('calm' | 'lead' | 'flee')[]) => this.stageLeader(s, a, k, acts);
    const steps: Record<string, () => (dt: number) => boolean> = {
      winds: () => this.stageWinds(s, a), alarm: () => this.stageAlarm(s), boar: () => this.stageBoar(s, a), flood: () => this.stageFlood(s, a),
      ledge: () => this.stageRocks(s, a, 'ledge'), scree: () => this.stageRocks(s, a, 'scree'), rockfall: () => this.stageRocks(s, a, 'rockfall'),
      traveler: () => this.stageTraveler(s, a), hosts: () => this.stageHosts(s, a), storm: () => this.stageStorm(s, a, fail), fog: () => this.stageFog(s, a, fail),
      wolves: () => this.stageWolves(s, a), pack: () => this.stagePack(s, a),
      stallion: () => leader('horse', ['calm', 'lead', 'flee']), ram: () => leader('sheep', ['calm', 'lead', 'flee']),
      tusker: () => leader('pig', ['calm', 'flee', 'flee']), bull: () => leader('cow', ['calm', 'lead', 'flee']), lamb: () => this.stageLamb(s, a),
      shoal: () => this.stageShoal(s, a), rapids: () => this.stageRapids(s), deer: () => this.stageDeer(s, a), vein: () => this.stageVein(s, a),
      dark: () => this.stageDark(s, a), bats: () => this.stageBats(s), firedamp: () => this.stageFiredamp(s), seep: () => this.stageSeep(s, a),
      birds: () => this.stageBirds(s, a, fail), swarm: () => this.stageSwarm(s, a, fail), wheel: () => this.stageWheel(s, a), tasting: () => this.stageTasting(s, a),
      puncture: () => this.stagePuncture(s), gust: () => this.stageGust(s), clouds: () => this.stageClouds(s), cows: () => this.stageCows(s, a),
      tusks: () => this.stageTusks(s, a), blizzard: () => this.stageBlizzard(s, a, fail),
      shark: () => this.stageShark(s), croc: () => this.stageCroc(s, a), swell: () => this.stageSwell(s, 'swell'), wreck: () => this.stageWreck(s, false), derelict: () => this.stageWreck(s, true), squall: () => this.stageSwell(s, 'squall'),
      crossing: () => this.stageSwell(s, 'crossing'), lunge: () => this.stageLunge(s), runes: () => this.stageRunes(s), rumble: () => this.stageRumble(s, a),
      bones: () => this.stageBones(s, a), flames: () => this.stageFlames(s, a), flame: () => this.stageFlame(s, a), record: () => this.stageRecord(s, a),
      // la diplomatie de l'archipel : au large, contre le bateau de l'équipe
      mistrust: () => this.stageMistrust(s, a), grievance: () => this.stageGrievance(s, a), seat: () => this.stageSeat(s, a), menu: () => this.stageMenu(s, a),
      patrolboat: () => this.stagePatrol(s), cliffire: () => this.stageCliffire(s, a),
      music: () => this.stageMusic(s, a), blockade: () => this.stageBlockade(s, a), parley: () => this.stageParley(s, a), maelstrom: () => this.stageMaelstrom(s),
      // sur le volcan
      tremor: () => this.stageTremor(s, a), fumes: () => this.stageFumes(s, a), lavaflow: () => this.stageLavaflow(s, a), ash: () => this.stageAsh(s, a), islander: () => this.stageIslander(s, a),
      // les échecs, joués au départ de l'équipe
      rocks: () => this.stageRocks(s, a, 'fail'), capsize: () => this.stageCapsize(s), scatter: () => this.stageScatter(s, a), charge: () => this.stageCharge(s, a),
      stings: () => this.stageSwarm(s, a, true), blast: () => this.stageBlast(s), gone: () => this.stageGone(s),
    };
    const make = steps[id];
    if (!make) return;
    s.step = make();
    this.stagings.push(s);
  }

  /**
   * Les imprévus à chaque image : celui qui surgit se met en place ; la décision prise, la suite de l'option choisie se joue ;
   * fini, il rétrécit et s'efface. Au départ de l'équipe, un échec se joue lui aussi (l'orage, la pirogue qui chavire…)
   */
  private stepStagings(dt: number, a: ActiveExpedition) {
    // ce que les imprévus demandent au bateau est reposé à chaque image (le bateau les lit à l'image suivante)
    this.moor = false; this.rowing = false; this.crewAct = null; this.crewFace = null; this.isleBack = 0;
    this.nudge = { x: 0, z: 0, yaw: 0, lift: 0 };
    const ev = a.wait;
    if (ev && !this.stagings.some((s) => s.id === ev.id && s.pick < 0)) this.stageEvent(ev.id, a);
    if (!this.departed && (a.phase === 'back' || a.phase === 'home')) {
      this.departed = true;
      for (const s of this.stagings) s.leave?.();
      // les jongleurs ramenés suivent l'équipe (voir ExpeditionView) : ils quittent la scène
      if (a.ok && a.c.carry === 'guests') { for (const g of this.guests) g.folk.root.visible = false; for (const j of this.jugglers) for (const b of j.balls) b.visible = false; this.jugglers = []; }
      // (l'orage est déjà là : il disperse la harde)
      const f = a.c.fail;
      if (!a.ok && f) this.stageEvent(f === 'storm' && this.stagings.some((s) => s.id === 'storm' && s.end < 0) ? 'scatter' : f, a, true);
    }
    for (const s of this.stagings) {
      s.t += dt;
      if (s.pick < 0 && a.wait?.id !== s.id) { const j = a.seen.lastIndexOf(s.id); s.pick = Math.max(0, j >= 0 ? a.picks[j] : 0); }
      if (s.pick >= 0) s.after += dt;
      if (s.end < 0 && !s.step(dt)) {
        s.end = 0;
        s.objs.forEach((o) => { o.userData.s0 = o.scale.clone(); if (o.userData.flat) o.visible = false; });
      }
      if (s.end >= 0) {
        s.end += dt;
        const k = Math.max(0.001, 1 - smooth(Math.min(1, s.end)));
        for (const o of s.objs) if (o.userData.s0) o.scale.copy(o.userData.s0).multiplyScalar(k);
      }
    }
    this.stagings = this.stagings.filter((s) => { if (s.end < 1) return true; this.unstage(s); return false; });
  }

  /** On range un imprévu : ses objets, ses habitants d'ailleurs, ses matériaux */
  private unstage(s: Staging) {
    const gone = new Set(s.objs);
    for (const o of s.objs) this.group.remove(o);
    for (const d of s.own) d.dispose();
    this.npcs = this.npcs.filter((n) => !gone.has(n.folk.root));
    this.spins = this.spins.filter((x) => !gone.has(x.obj));
    this.props = this.props.filter((o) => !gone.has(o));
  }

  /** Le milieu de l'équipe (ses membres visibles), sinon le cœur de la scène */
  private teamAt(a: ActiveExpedition): [number, number] {
    const pos = this.agents.partyPositions(a.party);
    return pos.length ? [pos.reduce((s, p) => s + p[0], 0) / pos.length, pos.reduce((s, p) => s + p[1], 0) / pos.length] : [this.focus[0], this.focus[1]];
  }

  /** Le milieu de la harde (ou le cœur de la scène) */
  private herdAt(): [number, number] {
    const b = this.beasts;
    return b.length ? [b.reduce((s, x) => s + x.x, 0) / b.length, b.reduce((s, x) => s + x.z, 0) / b.length] : [this.focus[0], this.focus[1]];
  }

  /** Un objet de l'imprévu, posé au sol en (x, z) (ou `lift` au-dessus) ; il s'efface avec lui */
  private sPut(s: Staging, g: THREE.BufferGeometry, x: number, z: number, ry = 0, lift = 0) {
    const m = new THREE.Mesh(g, mats.body);
    m.castShadow = true;
    m.position.set(x, this.world.surfaceAt(x, z) + lift, z);
    m.rotation.y = ry;
    return this.sAdd(s, m);
  }
  private sAdd<T extends THREE.Object3D>(s: Staging, o: T) { this.group.add(o); s.objs.push(o); return o; }

  /** Une flamme de l'imprévu (le grand feu), qui danse */
  private sFlame(s: Staging, x: number, z: number, size: number) {
    const f = this.flameAt(x, this.world.surfaceAt(x, z) + 0.015, z, size);
    s.objs.push(f);
    return f;
  }

  /** Un habitant d'ailleurs le temps de l'imprévu (le voyageur, les voisins) */
  private sNpc(s: Staging, role: FolkRole, age: number, x: number, z: number, face: number, pose: FolkPose) {
    const n = this.npc(role, age, x, z, face, pose);
    s.objs.push(n.folk.root);
    return n;
  }

  /** Une bête de l'imprévu (loup, meneur du troupeau, laie, cerf…), à la taille voulue */
  private sBeast(s: Staging, k: HerdKind | 'wolf' | 'deer', x: number, z: number, size = 1): Beast {
    const [name, len]: [ModelName, number] = k === 'deer' ? ['deer', 0.3] : ANIMAL[k];
    const actor = k === 'wolf' ? wolfActor(len * size, x + z) : hasModel(name) ? makeActor(name, len * size) : null;
    const obj: THREE.Object3D = actor ? actor.root : new THREE.Mesh(new THREE.IcosahedronGeometry(len * size * 0.5, 0), mats.body);
    if (actor) { actor.mixer.setTime(x * 3); s.own.push({ dispose: () => actor.mixer.stopAllAction() }); } else s.own.push((obj as THREE.Mesh).geometry);
    obj.position.set(x, this.world.surfaceAt(x, z), z);
    this.sAdd(s, obj);
    return { obj, actor, x, z, tx: x, tz: z, heading: 0, wait: 0, speed: 0 };
  }

  /** La bête va vers (tx, tz) ; arrivée (ou immobile), elle joue `idle` ; `anyway` : sans regarder où elle met les pieds (elle s'enfuit) */
  private sMove(b: Beast, tx: number, tz: number, speed: number, dt: number, idle: string[] = ['Idle', 'Idle_Eating'], anyway = false) {
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    let moving = false;
    if (d > 0.03 && speed > 0) {
      const st = Math.min(d, speed * dt), nx = b.x + (dx / d) * st, nz = b.z + (dz / d) * st;
      if (anyway || this.free(nx, nz)) { b.x = nx; b.z = nz; moving = true; }
      b.heading = Math.atan2(dx, dz);
    }
    b.obj.position.set(b.x, this.world.surfaceAt(b.x, b.z), b.z);
    b.obj.rotation.y = b.heading;
    if (b.actor) { play(b.actor, moving ? (speed > 0.8 ? ['Gallop', 'Run', 'Walk'] : ['Walk', 'WalkSlow', 'Idle']) : idle); b.actor.mixer.update(dt); }
    return moving;
  }
  private sFace(b: Beast, x: number, z: number) { b.heading = Math.atan2(x - b.x, z - b.z); }
  /** Elle s'enfuit à l'opposé de (x, z) */
  private sFlee(b: Beast, x: number, z: number, speed: number, dt: number) { const ang = Math.atan2(b.x - x, b.z - z); this.sMove(b, b.x + Math.sin(ang) * 2, b.z + Math.cos(ang) * 2, speed, dt, ['Idle'], true); }

  /** Une corde tendue d'un point à l'autre (d'un membre à l'autre, d'un membre à la bête qu'il mène), refaite à chaque image */
  private sRope(s: Staging) {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 8), 3)), l = new THREE.Line(g, ROPE);
    l.frustumCulled = false; l.userData.flat = true; l.visible = false;
    this.sAdd(s, l); s.own.push(g);
    return (pts: [number, number][], h = 0.13) => {
      const p = g.attributes.position as THREE.BufferAttribute, n = Math.min(8, pts.length);
      l.visible = n > 1;
      if (!l.visible) return;
      for (let i = 0; i < 8; i++) { const [x, z] = pts[Math.min(i, n - 1)]; p.setXYZ(i, x, this.world.surfaceAt(x, z) + h, z); }
      p.needsUpdate = true;
    };
  }
  /** Les positions de l'équipe, pour la corde qui la relie */
  private ropeOf(a: ActiveExpedition): [number, number][] { return this.agents.partyPositions(a.party).map(([x, z]) => [x, z]); }

  /** Un nuage (noir d'orage, ou gris clair) en (x, z), à `h` au-dessus du sol : son ombre assombrit la scène */
  private sCloud(s: Staging, x: number, z: number, h: number, light = false, size = 1.6) {
    const m = this.sPut(s, stormGeo(light), x, z, (x * 7 + z * 3) % 6.28, h);
    m.scale.setScalar(size);
    return m;
  }

  /**
   * Le ciel qui s'assombrit sur l'équipe, et là seulement : un voile sombre et transparent tendu au-dessus de la scène (une
   * coupole très plate, au-dessus des têtes), sombre au milieu et effacé sur ses bords (k : sa force, 0 … 1)
   */
  private sGloom(s: Staging, cx: number, cz: number, r: number, y0?: number) {
    const g = new THREE.SphereGeometry(r, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.15, 1), p = g.attributes.position, col = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) { const d = Math.min(1, Math.hypot(p.getX(i), p.getZ(i)) / r); col.set([0.04, 0.05, 0.1, 0.45 * (1 - d) * (1 + d)], i * 4); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false });
    const m = this.sAdd(s, new THREE.Mesh(g, mat));
    m.position.set(cx, (y0 ?? this.world.surfaceAt(cx, cz)) + 0.9, cz);
    m.renderOrder = 3;
    m.userData.flat = true;
    s.own.push(g, mat);
    return (k: number) => { mat.opacity = k; m.visible = k > 0.01; };
  }

  /** La pluie qui tombe sur un disque de rayon r autour de (cx, cz) ; de quoi l'animer (k : sa force, 0 … 1) */
  private sRain(s: Staging, cx: number, cz: number, r: number, top: number, y0?: number) {
    const n = 160, pos = new Float32Array(n * 6), drop: number[] = [];
    // (en mer, elle tombe jusqu'à l'eau : `y0`, pas jusqu'au fond)
    for (let i = 0; i < n; i++) { const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r, x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d; drop.push(x, z, y0 ?? this.world.surfaceAt(x, z), Math.random()); }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xc4d8ee, transparent: true, opacity: 0.8, depthWrite: false });
    const l = new THREE.LineSegments(g, mat);
    // (après l'eau, transparente elle aussi, pour qu'elle ne passe pas par-dessus)
    l.frustumCulled = false; l.userData.flat = true; l.renderOrder = 3;
    this.sAdd(s, l); s.own.push(g, mat);
    return (dt: number, k: number) => {
      mat.opacity = 0.8 * k;
      l.visible = k > 0.02;
      if (!l.visible) return;
      for (let i = 0; i < n; i++) {
        let f = drop[i * 4 + 3] - dt * 1.7;
        if (f < 0) f += 1;
        drop[i * 4 + 3] = f;
        const x = drop[i * 4], z = drop[i * 4 + 1], y = drop[i * 4 + 2] + f * top;
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z; pos[i * 6 + 3] = x - 0.012; pos[i * 6 + 4] = y + 0.14; pos[i * 6 + 5] = z;
      }
      g.attributes.position.needsUpdate = true;
    };
  }

  /**
   * Une nappe de brouillard au ras du sol autour de (cx, cz) : des volutes blanches toujours tournées vers la vue, au bord
   * flou ; elles se chevauchent, la nappe s'épaissit au milieu et s'effiloche sur ses bords (k : son épaisseur)
   */
  private sFog(s: Staging, cx: number, cz: number, r: number) {
    const mat = new THREE.SpriteMaterial({ map: softPuff(), color: 0xf2f4f6, transparent: true, opacity: 0.5, depthWrite: false });
    s.own.push(mat);
    const blobs: { m: THREE.Sprite; a: number; d: number; y: number; sp: number }[] = [];
    for (let i = 0; i < 34; i++) {
      const m = new THREE.Sprite(mat);
      m.scale.set(1.3 + (i % 4) * 0.35, 0.7 + (i % 3) * 0.2, 1);
      m.renderOrder = 3;
      this.sAdd(s, m);
      blobs.push({ m, a: i * 2.4, d: 0.1 + Math.sqrt((i + 0.5) / 34) * r, y: 0.18 + (i % 4) * 0.09, sp: 0.04 + (i % 5) * 0.012 });
    }
    return (dt: number, k: number) => {
      mat.opacity = 0.5 * k;
      for (const b of blobs) {
        b.a += dt * b.sp;
        const x = cx + Math.cos(b.a) * b.d, z = cz + Math.sin(b.a) * b.d;
        b.m.position.set(x, this.world.surfaceAt(x, z) + b.y, z);
        b.m.visible = k > 0.02;
      }
    };
  }

  /** La neige qui tombe à gros flocons sur un disque de rayon r autour de (cx, cz), poussée par le vent ; de quoi l'animer (k : sa force, 0 … 1) */
  private sSnow(s: Staging, cx: number, cz: number, r: number, top: number) {
    const n = 260, pos = new Float32Array(n * 3), flake: number[] = [];
    for (let i = 0; i < n; i++) { const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r, x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d; flake.push(x, z, this.world.surfaceAt(x, z), Math.random(), Math.random() * 6.28); }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, map: softPuff(), transparent: true, opacity: 0.95, depthWrite: false });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false; pts.userData.flat = true; pts.renderOrder = 3;
    this.sAdd(s, pts); s.own.push(g, mat);
    return (dt: number, k: number) => {
      mat.opacity = 0.95 * k;
      pts.visible = k > 0.02;
      if (!pts.visible) return;
      for (let i = 0; i < n; i++) {
        let f = flake[i * 5 + 3] - dt * 0.3;
        if (f < 0) f += 1;
        flake[i * 5 + 3] = f;
        // le vent les pousse de travers ; chacun tourbillonne un peu en tombant
        const ph = flake[i * 5 + 4];
        pos[i * 3] = flake[i * 5] + (f - 0.5) * 0.6 + Math.sin(this.t * 2.1 + ph) * 0.05;
        pos[i * 3 + 1] = flake[i * 5 + 2] + f * top;
        pos[i * 3 + 2] = flake[i * 5 + 1] + Math.cos(this.t * 1.7 + ph) * 0.05;
      }
      g.attributes.position.needsUpdate = true;
    };
  }

  /** Une pierre qui dévale : elle part de (x, y, z) avec la vitesse (vx, vz), tombe, rebondit, roule et s'arrête */
  private rock(x: number, y: number, z: number, vx: number, vz: number, size = 1) {
    const o = new THREE.Mesh(pebbleGeo(), mats.body);
    o.scale.setScalar(size);
    o.castShadow = true;
    this.group.add(o);
    this.fx.push({ obj: o, t: 0, life: 2.6, kind: 'rock', x, y, z, vx, vz, vy: 0 });
  }
  /** Un petit nuage (poussière, écume, fumée) en (x, y, z) */
  private puffAt(x: number, y: number, z: number, kind: 'puff' | 'smoke' | 'gas' = 'puff', vx = (Math.random() - 0.5) * 0.08, vz = (Math.random() - 0.5) * 0.08) {
    const o = new THREE.Mesh(kind === 'gas' ? gasGeo() : kind === 'smoke' ? smokeGeo() : puffGeo(), mats.body);
    this.group.add(o);
    this.fx.push({ obj: o, t: 0, life: kind === 'puff' ? 1.2 : 2.4, kind, x, y, z, vx, vz });
  }
  /** Un poisson qui saute hors de l'eau en (x, z), et le rond qu'il laisse */
  private fishJump(x: number, z: number, level: number) {
    const ang = Math.random() * Math.PI * 2, f = new THREE.Mesh(fishGeo(), mats.body), ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 12).rotateX(-Math.PI / 2), RING);
    ring.renderOrder = 3;
    this.group.add(f, ring);
    const vx = Math.cos(ang + 1.2) * 0.25, vz = Math.sin(ang + 1.2) * 0.25;
    this.fx.push({ obj: f, t: 0, life: 0.7, kind: 'fish', x, y: level, z, vx, vz });
    this.fx.push({ obj: ring, t: 0, life: 1.2, kind: 'ring', x: x + vx * 0.7, y: level + 0.005, z: z + vz * 0.7, vx: 0, vz: 0 });
  }

  /** L'orage : un nuage noir sur l'équipe, la pluie, les éclairs ; il passe une fois l'abri trouvé (ou le travail fini) */
  private stageStorm(s: Staging, a: ActiveExpedition, fail: boolean) {
    const [cx, cz] = this.teamAt(a), h = 2.6, cloud = this.sCloud(s, cx, cz, h + 0.25, false, 1.3), rain = this.sRain(s, cx, cz, 1.8, h), gloom = this.sGloom(s, cx, cz, 3.2);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const flash = this.sAdd(s, new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), flashMat));
    flash.position.copy(cloud.position); flash.scale.set(2.2, 0.7, 2.2);
    const bolt = this.sAdd(s, new THREE.LineSegments(boltGeo(1), BOLT));
    bolt.userData.flat = true; bolt.visible = false;
    s.own.push(flash.geometry, flashMat, { dispose: () => bolt.geometry.dispose() });
    // l'orage du départ (un échec) disperse la harde
    if (fail) for (const b of this.beasts) b.flee = Math.atan2(b.x - cx, b.z - cz);
    let strike = 0.4, shown = 0, k = 1, drift = 0;
    return (dt: number) => {
      const wet = fail ? s.t < 9 : s.pick < 0 || (s.pick === 0 ? s.after < 8 : a.phase === 'work' && s.after < 40);
      k = wet ? Math.min(1, k + dt) : k - dt * 0.4;
      rain(dt, Math.max(0, k));
      gloom(Math.max(0, k) * (1 + flashMat.opacity * -1.2));
      // un éclair de temps en temps : un zigzag blanc jusqu'au sol, le nuage qui s'illumine
      if (wet && (strike -= dt) <= 0) {
        strike = 1.6 + Math.random() * 2.4; shown = 0.16;
        const ang = Math.random() * Math.PI * 2, d = 0.4 + Math.random(), x = cloud.position.x + Math.cos(ang) * d, z = cloud.position.z + Math.sin(ang) * d, y0 = this.world.surfaceAt(x, z);
        bolt.geometry.dispose(); bolt.geometry = boltGeo(Math.random() * 10);
        bolt.position.set(x, y0, z); bolt.scale.set(1, cloud.position.y - y0, 1);
        flashMat.opacity = 0.55;
      }
      shown -= dt;
      bolt.visible = shown > 0;
      flashMat.opacity *= Math.pow(0.02, dt);
      // l'orage passé, le nuage s'en va
      if (!wet) { drift += dt; cloud.position.x += dt * 0.5 * drift; flash.position.copy(cloud.position); }
      return k > 0 || drift < 4;
    };
  }

  /** Le brouillard : une nappe blanche sur l'équipe ; elle se lève quand on l'attend (ou une fois le travail fini) */
  private stageFog(s: Staging, a: ActiveExpedition, fail: boolean) {
    const [tx, tz] = this.teamAt(a), fog = this.sFog(s, (tx + this.focus[0]) / 2, (tz + this.focus[1]) / 2, 2.2);
    let k = 0.6;
    return (dt: number) => {
      const thick = fail ? s.t < 8 : s.pick < 0 || (s.pick === 0 ? s.after < 6 : a.phase === 'work' && s.after < 40);
      k = thick ? Math.min(1, k + dt * 0.5) : k - dt * 0.12;
      fog(dt, Math.max(0, k));
      return k > 0;
    };
  }

  /** Des loups tournent autour de l'équipe ; le grand feu (ou la garde) les tient à distance, puis ils filent */
  private stageWolves(s: Staging, a: ActiveExpedition) {
    const [cx, cz] = this.teamAt(a), pack = [0, 1, 2].map((i) => { const ang = i * 2.1, b = this.sBeast(s, 'wolf', cx + Math.cos(ang) * 1.7, cz + Math.sin(ang) * 1.7); b.wait = ang; return b; });
    let fire = false;
    return (dt: number) => {
      const p = s.pick, stay = p === 1 ? 10 : p === 0 ? 8 : 6, leave = p >= 0 && s.after > stay;
      // le grand feu, allumé au milieu de l'équipe : il brûle jusqu'à son départ
      if (p === 1 && !fire) {
        fire = true;
        const [fx, fz] = this.teamAt(a);
        this.sPut(s, fireGeo(), fx, fz, 0).scale.setScalar(1.6);
        [1.1, 1.5, 1].forEach((sz, i) => this.sFlame(s, fx + (i - 1) * 0.05, fz + (i % 2) * 0.04, sz * 1.4));
        const smoke = { x: fx, y: this.world.surfaceAt(fx, fz) + 0.25, z: fz, kind: 'smoke' as const, every: 0.35, t: 0 };
        this.emits.push(smoke);
        s.own.push({ dispose: () => { this.emits = this.emits.filter((e) => e !== smoke); } });
      }
      const r = p < 0 ? 1.7 : p === 0 ? 1.9 : p === 1 ? 2.4 : 1.1;
      pack.forEach((b, i) => {
        if (leave) { this.sFlee(b, cx, cz, 1.6, dt); return; }
        // à leur arrivée, ils s'assoient face à l'équipe et hurlent ensemble, avant de rôder
        if (p < 0 && s.t > 0.8 + i * 0.3 && s.t < 6.3 + i * 0.3) { this.sFace(b, cx, cz); this.sMove(b, b.x, b.z, 0, dt, ['Idle_2', 'Idle']); return; }
        b.wait += dt * (0.32 + i * 0.05);
        // (sur la terre ferme : là où le cercle passe dans l'eau, ils rôdent plus près)
        const [x, z] = this.near(cx + Math.cos(b.wait) * r, cz + Math.sin(b.wait) * r, cx, cz);
        this.sMove(b, x, z, 0.75, dt, ['Idle'], true);
      });
      if (leave && s.after > stay + 4) for (const b of pack) b.obj.visible = false;
      return !(leave && s.after > stay + 4) || (fire && a.phase === 'work');
    };
  }

  /** La meute du loup : deux autres loups tournent autour de lui, leurs traces au sol ; les pièges de corde posés autour */
  private stagePack(s: Staging, a: ActiveExpedition) {
    const w0 = this.beasts[0], [wx, wz] = w0 ? [w0.x, w0.z] : this.focus, [tx, tz] = this.teamAt(a);
    const extra = [0, 1].map((i) => this.sBeast(s, 'wolf', wx + (i ? 0.5 : -0.5), wz + 0.4));
    for (let i = 0; i < 8; i++) { const k = (i + 1) / 9, x = tx + (wx - tx) * k + (i % 2 ? 0.05 : -0.05), z = tz + (wz - tz) * k; this.sPut(s, pawGeo(), x, z, Math.atan2(wx - tx, wz - tz), 0.004); }
    let snares = false;
    return (dt: number) => {
      const lead = this.beasts[0], [cx, cz] = lead ? [lead.x, lead.z] : this.focus, stay = s.pick === 0 ? 2 : s.pick === 1 ? 10 : 12, flee = s.pick >= 0 && s.after > stay;
      extra.forEach((b, i) => {
        if (flee) { this.sFlee(b, tx, tz, 1.6, dt); return; }
        // la meute appelle : les deux loups s'assoient et hurlent avant de tourner autour du chef
        if (s.pick < 0 && s.t > 0.5 + i * 0.4 && s.t < 6 + i * 0.4) { this.sFace(b, tx, tz); this.sMove(b, b.x, b.z, 0, dt, ['Idle_2', 'Idle']); return; }
        const ang = this.t * 0.6 + i * Math.PI;
        this.sMove(b, cx + Math.cos(ang) * 0.6, cz + Math.sin(ang) * 0.6, 0.9, dt, ['Idle'], true);
      });
      if (s.pick === 1 && !snares) { snares = true; for (let i = 0; i < 3; i++) { const ang = i * 2.1 + 0.5; const [x, z] = this.near(cx + Math.cos(ang) * 1.1, cz + Math.sin(ang) * 1.1, cx, cz); this.sPut(s, snareGeo(), x, z, ang); } }
      if (flee && s.after > stay + 3) for (const b of extra) b.obj.visible = false;
      return !(flee && s.after > stay + 3) || (snares && a.phase === 'work');
    };
  }

  /**
   * Le meneur du troupeau (l'étalon, le bélier, le vieux sanglier, le grand taureau) : plus grand que les autres, il se dresse
   * entre l'équipe et les bêtes. Apaisé, il broute ; mené à la corde, il suit le premier de l'équipe ; sinon il détale
   */
  private stageLeader(s: Staging, a: ActiveExpedition, kind: HerdKind, acts: ('calm' | 'lead' | 'flee')[]) {
    const [tx, tz] = this.teamAt(a), [hx, hz] = this.herdAt(), ang = Math.atan2(tx - hx, tz - hz);
    const [lx, lz] = this.near(hx + Math.sin(ang) * 0.55, hz + Math.cos(ang) * 0.55, hx, hz), b = this.sBeast(s, kind, lx, lz, 1.45), rope = this.sRope(s);
    this.sFace(b, tx, tz);
    let gone = false;
    return (dt: number) => {
      const act = s.pick < 0 ? 'wait' : acts[s.pick] ?? 'calm', lead = this.agents.partyPositions(a.party)[0];
      if (act === 'wait') { if (lead) this.sFace(b, lead[0], lead[1]); this.sMove(b, b.x, b.z, 0, dt, Math.sin(this.t * 1.3) > 0.3 ? ['Headbutt', 'Idle'] : ['Idle']); }
      else if (act === 'calm') this.sMove(b, b.x, b.z, 0, dt, ['Idle_Eating', 'Eating', 'Idle']);
      else if (act === 'lead' && lead) {
        const d = Math.hypot(lead[0] - b.x, lead[1] - b.z), k = d > 0.38 ? (d - 0.38) / d : 0;
        this.sMove(b, b.x + (lead[0] - b.x) * k, b.z + (lead[1] - b.z) * k, 0.55, dt, ['Idle'], true);
        rope([[lead[0], lead[1]], [b.x, b.z]], 0.12);
      } else if (act === 'flee' && !gone) {
        this.sFlee(b, tx, tz, 1.5, dt);
        if (s.after > 3.5) { b.obj.visible = false; gone = true; }
        // on lui a ouvert l'enclos : deux bêtes filent avec lui
        if (s.id === 'tusker' && s.pick === 2) for (const x of this.beasts.slice(0, 2)) x.flee ??= Math.atan2(x.x - tx, x.z - tz);
      }
      // apaisé ou mené à la corde, il reste jusqu'au départ de l'équipe (ramené, il la suit au village)
      return !gone && a.phase === 'work';
    };
  }

  /** L'agneau pris dans les ronces, sa mère qui tourne autour du buisson ; libéré, il rejoint le troupeau */
  private stageLamb(s: Staging, a: ActiveExpedition) {
    const [hx, hz] = this.herdAt(), [bx, bz] = this.near(hx + 0.75, hz - 0.5, hx, hz);
    this.sPut(s, bushGeo(), bx, bz, 0.5);
    const lamb = this.sBeast(s, 'sheep', bx + 0.04, bz, 0.55), ewe = this.sBeast(s, 'sheep', bx + 0.32, bz, 1);
    let ang = 0, sent = false;
    return (dt: number) => {
      ang += dt * 0.9;
      const out = s.pick >= 0 && s.after > (s.pick === 0 ? 4 : 7);
      if (!out) {
        this.sMove(ewe, bx + Math.cos(ang) * 0.34, bz + Math.sin(ang) * 0.34, 0.45, dt, ['Idle'], true);
        this.sMove(lamb, lamb.x, lamb.z, 0, dt, ['Jump_Start', 'Idle']);
        lamb.obj.position.y += Math.abs(Math.sin(this.t * 6)) * 0.02;
      } else {
        this.sMove(lamb, hx + 0.15, hz, 0.35, dt, ['Idle_Eating'], true);
        this.sMove(ewe, hx + 0.32, hz + 0.1, 0.35, dt, ['Idle_Eating'], true);
      }
      // un membre va le dégager des ronces
      if (s.pick === 0 && !sent && a.phase === 'work') this.sendTo(a, a.party[0], bx - 0.2, bz, bx, bz, 6), sent = true;
      return a.phase === 'work';
    };
  }

  /** Un membre va en (x, z) et y travaille, tourné vers (fx, fz) ; il ne repart pas avant `stay` secondes */
  private sendTo(a: ActiveExpedition, id: number | undefined, x: number, z: number, fx: number, fz: number, stay: number) {
    if (id === undefined || this.kind === 'delve' || this.boat?.riders.includes(id) || this.bath?.in.has(id) || this.pit?.in.has(id)) return;
    this.agents.memberGo(id, x, z, Math.atan2(fx - x, fz - z));
    this.next.set(id, stay);
    this.goal.set(id, 1);
    void a;
  }

  /** La laie et ses marcassins sur le sentier : elle gronde, charge un instant si l'on passe sous son nez, puis s'en va */
  private stageBoar(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), [bx, bz] = this.near(tx + 0.9, tz + 0.5, tx, tz);
    const sow = this.sBeast(s, 'pig', bx, bz, 1.3), young = [0, 1, 2].map((i) => this.sBeast(s, 'pig', bx + Math.cos(i * 2.1) * 0.24, bz + Math.sin(i * 2.1) * 0.24, 0.5));
    this.sFace(sow, tx, tz);
    let around = false;
    return (dt: number) => {
      // le grand détour : l'équipe s'écarte loin de la laie, qui reste avec ses petits
      const p = s.pick, start = p === 1 ? 0 : p === 0 ? Infinity : 3, flee = p >= 0 && s.after > start;
      if (p === 0 && !around) { around = true; const d = Math.max(0.01, Math.hypot(tx - bx, tz - bz)); a.party.forEach((id, i) => this.sendTo(a, id, tx + (tx - bx) / d * 0.8 - (tz - bz) / d * (0.9 + i * 0.12), tz + (tz - bz) / d * 0.8 + (tx - bx) / d * (0.9 + i * 0.12), bx, bz, 5)); }
      if (p === 0 && s.after > 8) return false;
      if (flee) {
        [sow, ...young].forEach((b, i) => { const ang = Math.atan2(bx - tx, bz - tz) + (i - 1.5) * 0.25; this.sMove(b, b.x + Math.sin(ang) * 2, b.z + Math.cos(ang) * 2, p === 1 ? 1.5 : 0.6, dt, ['Idle'], true); });
        if (s.after > start + 4) { for (const b of [sow, ...young]) b.obj.visible = false; return false; }
        return true;
      }
      if (p === 2 && s.after < 2) {
        // elle charge, puis revient à ses petits
        const ang = Math.atan2(tx - bx, tz - bz), d = Math.sin(Math.min(1, s.after / 2) * Math.PI) * 0.5;
        this.sMove(sow, bx + Math.sin(ang) * d, bz + Math.cos(ang) * d, 1.6, dt, ['Idle'], true);
      } else this.sMove(sow, sow.x, sow.z, 0, dt, Math.sin(this.t * 1.7) > 0.4 ? ['Headbutt', 'Idle'] : ['Idle_Eating', 'Idle']);
      young.forEach((b, i) => { const ang = this.t * 0.8 + i * 2.1; this.sMove(b, sow.x + Math.cos(ang) * 0.24, sow.z + Math.sin(ang) * 0.24, 0.4, dt, ['Idle'], true); });
      return true;
    };
  }

  /**
   * Le voyageur blessé, assis au bord du chemin. Soigné, il se relève, salue et reprend sa route ; ramené au village, il suit
   * l'équipe au retour (voir ExpeditionView) ; laissé là, il y reste
   */
  private stageTraveler(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), ang = Math.atan2(a.base[0] - tx, a.base[1] - tz);
    const [vx, vz] = this.near(tx + Math.sin(ang) * 0.6 + Math.cos(ang) * 0.35, tz + Math.cos(ang) * 0.6 - Math.sin(ang) * 0.35, tx, tz);
    const man = this.sNpc(s, 'villager', a.age, vx, vz, ang + Math.PI, 'sit');
    let sent = false, x = vx, z = vz;
    s.leave = () => { if (s.pick === 1) man.folk.root.visible = false; };
    return (dt: number) => {
      if (s.pick !== 0) return man.folk.root.visible;
      if (!sent && a.phase === 'work') { sent = true; this.sendTo(a, a.party[0], vx + 0.17, vz, vx, vz, 6); }
      man.pose = s.after < 5 ? 'sit' : s.after < 7 ? 'cheer' : 'walk';
      if (s.after >= 7) {
        x -= Math.sin(ang) * dt * 0.35; z -= Math.cos(ang) * dt * 0.35;
        man.folk.root.position.set(x, this.world.surfaceAt(x, z), z);
        man.folk.root.rotation.y = ang + Math.PI;
      }
      return s.after < 14;
    };
  }

  /** Des voisins viennent saluer l'équipe, un panier à la main ; les cadeaux échangés, ils restent à bavarder (sinon ils s'en vont) */
  private stageHosts(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), ang = Math.atan2(tx - a.base[0], tz - a.base[1]);
    const people = [0, 1].map((i) => {
      const a0 = ang + (i - 0.5) * 0.5, x0 = tx + Math.sin(a0) * 2.2, z0 = tz + Math.cos(a0) * 2.2;
      return { n: this.sNpc(s, 'villager', a.age, x0, z0, a0 + Math.PI, 'walk'), from: [x0, z0] as [number, number], to: this.near(tx + Math.sin(a0) * 0.45, tz + Math.cos(a0) * 0.45, tx, tz), x: x0, z: z0 };
    });
    const basket = this.sPut(s, basketGeo(), people[0].to[0], people[0].to[1], 0), fruit = this.sPut(s, foodGeo(), people[0].to[0], people[0].to[1], 0, 0.06);
    fruit.scale.setScalar(0.5);
    basket.visible = fruit.visible = false;
    let gifts = false;
    return (dt: number) => {
      const leaving = s.pick === 1 && s.after > 3;
      let home = true;
      for (const p of people) {
        const [gx, gz] = leaving ? p.from : p.to, dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.03) { const st = Math.min(d, dt * 0.4); p.x += (dx / d) * st; p.z += (dz / d) * st; p.n.folk.root.rotation.y = Math.atan2(dx, dz); home = false; }
        else p.n.folk.root.rotation.y = Math.atan2(tx - p.x, tz - p.z);
        p.n.folk.root.position.set(p.x, this.world.surfaceAt(p.x, p.z), p.z);
        p.n.pose = d > 0.03 ? 'walk' : s.pick === 0 && s.after < 8 ? (Math.floor(this.t * 1.2) % 2 ? 'cheer' : 'talk') : s.pick === 1 ? 'cheer' : 'talk';
      }
      const at = !leaving && Math.hypot(people[0].x - people[0].to[0], people[0].z - people[0].to[1]) < 0.05;
      basket.visible = fruit.visible = at;
      // les cadeaux échangés : nos poteries, posées près d'eux
      if (s.pick === 0 && !gifts) { gifts = true; const [gx, gz] = people[1].to; this.sPut(s, potsGeo(), gx + 0.12, gz + 0.1, 0).scale.setScalar(0.8); }
      return !(leaving && home);
    };
  }

  /** Le banc de poissons : des sauts partout devant l'équipe ; les filets tendus, puis la pêche étalée sur la berge */
  private stageShoal(s: Staging, a: ActiveExpedition) {
    const wat = this.water ?? this.findWater(...this.teamAt(a));
    if (!wat) return () => false;
    const [wx, wz] = wat.wet, [bx, bz] = wat.bank, d = Math.max(0.01, Math.hypot(wx - bx, wz - bz)), ox = (wx - bx) / d, oz = (wz - bz) / d;
    let cx = wx + ox * 0.4, cz = wz + oz * 0.4, jt = 0, net = false, pile = false;
    return (dt: number) => {
      const on = s.pick < 0 || s.after < (s.pick === 0 ? 7 : 5);
      // on le laisse passer : il remonte le courant et s'éloigne
      if (s.pick === 1) { cx += -oz * dt * 0.3; cz += ox * dt * 0.3; }
      if (on && (jt -= dt) <= 0) {
        jt = 0.12;
        const x = cx + (Math.random() - 0.5) * 0.7, z = cz + (Math.random() - 0.5) * 0.7;
        if (this.depth(x, z) !== null) this.fishJump(x, z, wat.level);
      }
      if (s.pick === 0 && !net) { net = true; this.sPut(s, netGeo(), cx, cz, Math.atan2(ox, oz)).position.y = wat.level + 0.004; }
      if (s.pick === 0 && s.after > 7 && !pile) { pile = true; const [px, pz] = this.near(bx - ox * 0.2 + oz * 0.25, bz - oz * 0.2 - ox * 0.25, bx, bz); this.sPut(s, catchGeo(), px, pz, 0); }
      return s.pick === 0 ? a.phase === 'work' : on;
    };
  }

  /**
   * Un requin tourne autour du bateau, aileron dehors. Fuir : il suit, puis lâche prise ; la lance : il fonce, reçoit un
   * harpon et file ; l'appât : des poissons jetés au loin, il bondit dessus et s'éloigne
   */
  private stageShark(s: Staging) {
    const bt = this.boat;
    if (!bt) return () => false;
    const body = this.sAdd(s, new THREE.Mesh(sharkGeo(false), mats.body));
    body.castShadow = true;
    body.visible = false;
    let ang = Math.random() * Math.PI * 2, r = 1.3, lunge = -1, thrown = false;
    const baits: { o: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3 }[] = [];
    const spear = this.sAdd(s, new THREE.Mesh(harpoonGeo(), mats.body));
    spear.visible = false;
    let spearT = -1;
    return (dt: number) => {
      const o = bt.obj.position, pick = s.pick, t = s.after;
      // fuir vers la rive : à toutes rames, le bateau file vers la berge
      if (pick === 0 && t < 4.5) { this.rowing = true; const [bx, bz] = this.boatBase(), [hx, hz] = bt.home, d = Math.max(0.01, Math.hypot(hx - bx, hz - bz)), go = Math.min(1.1, t * 0.5, d); this.steerTo(bx + (hx - bx) / d * go, bz + (hz - bz) / d * go); }
      // il rôde de loin, puis resserre ses cercles ; selon le choix : il suit, il fonce, ou il part à l'appât
      const want = pick < 0 ? 0.42 : pick === 0 ? (t < 3 ? 0.55 : 2.2) : pick === 1 ? (t < 1.1 ? 0.16 : 2.2) : 1.1;
      r += (want - r) * Math.min(1, dt * (pick === 1 && t > 1.1 ? 2.5 : 1.4));
      ang += dt * (pick === 1 && t > 1.1 ? 2.4 : 1.3);
      let x = o.x + Math.cos(ang) * r, z = o.z + Math.sin(ang) * r, y = bt.y - 0.03, pitch = 0, h = Math.atan2(-Math.sin(ang), Math.cos(ang));
      // (jamais sur la berge : près de la rive, il tourne du côté du large)
      if (this.depth(x, z) === null) { const [hx, hz] = bt.home, [qx, qz] = bt.out, l = Math.max(0.01, Math.hypot(qx - hx, qz - hz)); for (let k = 0.3; k <= 1.5 && this.depth(x, z) === null; k += 0.3) { x += (qx - hx) / l * 0.3; z += (qz - hz) / l * 0.3; } }
      // l'appât : trois poissons jetés au loin, le requin bondit dessus
      if (pick === 2) {
        if (!thrown) {
          thrown = true;
          const a0 = ang + Math.PI, to = new THREE.Vector3(o.x + Math.cos(a0) * 1.15, bt.y, o.z + Math.sin(a0) * 1.15);
          for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(fishGeo(), mats.body); this.sAdd(s, f); baits.push({ o: f, from: new THREE.Vector3(o.x, bt.y + 0.14, o.z), to: to.clone().add(new THREE.Vector3((i - 1) * 0.08, 0, (i % 2) * 0.06)) }); }
        }
        const u = Math.min(1, t / 0.7);
        for (const b of baits) { b.o.position.lerpVectors(b.from, b.to, u); b.o.position.y += Math.sin(u * Math.PI) * 0.18; b.o.visible = t < 1.9; }
        if (t > 0.7 && t < 0.75) this.splash(baits[0].to.x, baits[0].to.z, bt.y);
        // il se dirige vers les appâts et bondit
        const bx = baits[0].to.x, bz = baits[0].to.z, k = Math.min(1, Math.max(0, (t - 0.8) / 1.0));
        if (t > 0.8) { x = o.x + (bx - o.x) * (0.5 + 0.5 * smooth(k)); z = o.z + (bz - o.z) * (0.5 + 0.5 * smooth(k)); h = Math.atan2(bx - o.x, bz - o.z); y += Math.sin(k * Math.PI) * 0.32; pitch = -Math.cos(k * Math.PI) * 0.9; if (lunge < 0 && k > 0.45) { lunge = 1; this.splash(bx, bz, bt.y, true); } }
      }
      // la lance : il fonce sur le bord, le harpon part de la barque et le touche au flanc
      if (pick === 1) {
        if (spearT < 0 && t > 0.7) spearT = 0;
        if (spearT >= 0) {
          spearT += dt;
          const u = Math.min(1, spearT / 0.35);
          spear.visible = u < 1;
          spear.position.set(o.x + (x - o.x) * u, bt.y + 0.2 - u * 0.14, o.z + (z - o.z) * u);
          spear.lookAt(x, bt.y, z);
          if (u >= 1 && lunge < 0) { lunge = 1; this.splash(x, z, bt.y); this.puffAt(x, bt.y + 0.05, z); }
        }
        if (t > 1.1) { y -= Math.min(0.08, (t - 1.1) * 0.05); }
      }
      body.visible = true;
      body.position.set(x, y, z);
      body.rotation.set(pitch, h, 0, 'YXZ');
      body.scale.setScalar(1);
      const bite = pick === 2 && t > 0.8 ? Math.sin(Math.min(1, (t - 0.8) / 1.0) * Math.PI) : pick === 1 && t > 1.1 && t < 1.7 ? 1 : 0;
      sharkSwim(body, this.t, 0.8, Math.max(0.05, bite), bite * 0.4, 5.5);
      // le sillage, et le bateau tangue quand il rôde de près
      if (Math.random() < dt * 4) this.puffAt(x - Math.sin(h) * 0.2, bt.y + 0.01, z - Math.cos(h) * 0.2);
      this.rough = pick < 0 || r < 0.7 ? 0.35 : Math.max(0, this.rough - dt * 0.4);
      return pick < 0 || t < (pick === 0 ? 5.5 : pick === 1 ? 3.2 : 3.4);
    };
  }

  /**
   * Un crocodile sort de l'eau et file sur l'équipe (ou sur la barque), mâchoires qui claquent. Fuir : il s'arrête à la rive
   * et retourne à l'eau ; la lance : il reçoit un coup au museau et plonge ; la viande : jetée dans l'eau, il se rue dessus
   */
  private stageCroc(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), wat = this.water ?? this.findWater(tx, tz);
    if (!wat) return () => false;
    const [wx, wz] = wat.wet, lvl = wat.level;
    const g = new THREE.Group(), body = new THREE.Mesh(crocGeo(), mats.body), jaw = new THREE.Mesh(crocJawGeo(), mats.body);
    body.castShadow = true;
    jaw.position.set(0, 0.024, 0.075);
    g.add(body, jaw);
    g.scale.setScalar(1.5);
    this.sAdd(s, g);
    let x = wx, z = wz, heading = Math.atan2(tx - wx, tz - wz), flinch = 0, meat: THREE.Mesh | null = null, spearT = -1, spoke = false, fled = false;
    const spear = this.sAdd(s, new THREE.Mesh(harpoonGeo(), mats.body));
    spear.visible = false;
    return (dt: number) => {
      const pick = s.pick, t = s.after, tgt = this.boat ? this.boat.obj.position : new THREE.Vector3(tx, 0, tz);
      // fuir loin de l'eau : l'équipe court vers l'intérieur des terres (une fois)
      if (pick === 0 && !fled) { fled = true; const d = Math.max(0.01, Math.hypot(tx - wx, tz - wz)); a.party.forEach((id, i) => this.sendTo(a, id, tx + (tx - wx) / d * 1.4 + (i - 1) * 0.2, tz + (tz - wz) / d * 1.4, wx, wz, 4)); }
      // où il va : vers sa proie ; fuite et coup de lance : il rebrousse chemin vers l'eau ; la viande : droit dessus
      let gx = tgt.x, gz = tgt.z, speed = 0.3, stop = this.boat ? 0.3 : 0.18;
      if (pick === 0 && t > 1.4) { gx = wx; gz = wz; speed = 0.45; stop = 0; }
      if (pick === 1 && t > 1.2) { gx = wx - (tgt.x - wx); gz = wz - (tgt.z - wz); speed = 0.7; stop = 0; }
      if (pick === 2) {
        if (!meat) { meat = new THREE.Mesh(ballGeo(0xc8443a), mats.body); meat.scale.setScalar(1.6); this.sAdd(s, meat); }
        const mx = x + Math.sin(heading) * 0.5 + 0.1, mz = z + Math.cos(heading) * 0.5, u = Math.min(1, t / 0.6);
        meat.position.set(tgt.x + (mx - tgt.x) * u, lvl + 0.15 * Math.sin(u * Math.PI) + 0.01, tgt.z + (mz - tgt.z) * u);
        meat.visible = t < 2.4;
        if (t < 2.4) { gx = mx; gz = mz; speed = 0.5; stop = 0.05; }
        else { gx = wx - (tgt.x - wx); gz = wz - (tgt.z - wz); speed = 0.35; stop = 0; }
      }
      const dx = gx - x, dz = gz - z, d = Math.hypot(dx, dz);
      if (d > stop) { x += (dx / d) * Math.min(d - stop, speed * dt); z += (dz / d) * Math.min(d - stop, speed * dt); heading += Math.atan2(Math.sin(Math.atan2(dx, dz) - heading), Math.cos(Math.atan2(dx, dz) - heading)) * Math.min(1, dt * 4); }
      // la lance : elle part de l'équipe et le touche au museau ; il se tord et recule
      if (pick === 1) {
        if (spearT < 0 && t > 0.6) spearT = 0;
        if (spearT >= 0) {
          spearT += dt;
          const u = Math.min(1, spearT / 0.3);
          spear.visible = u < 1;
          spear.position.set(tgt.x + (x - tgt.x) * u, lvl + 0.22 - u * 0.17, tgt.z + (z - tgt.z) * u);
          spear.lookAt(x, lvl, z);
          if (u >= 1 && !spoke) { spoke = true; flinch = 1; this.splash(x, z, lvl); }
        }
      }
      flinch = Math.max(0, flinch - dt * 1.5);
      // sur l'eau il ne montre que le dos et les yeux ; à la rive, il se dresse sur ses pattes
      const ground = this.world.surfaceAt(x, z), y = Math.max(lvl - 0.034, ground), near = d <= stop + 0.05;
      g.position.set(x, y, z);
      g.rotation.set(0, heading + Math.sin(this.t * 40) * 0.25 * flinch, 0);
      // gueule : elle claque quand il est sur sa proie, bée quand il se dresse
      jaw.rotation.x = near ? Math.max(0, Math.sin(this.t * 7)) * 0.55 : 0.08 + 0.05 * Math.sin(this.t * 3);
      if (y < lvl && Math.random() < dt * 3) this.puffAt(x, lvl + 0.005, z);
      return pick < 0 || t < (pick === 0 ? 4.2 : pick === 1 ? 3 : 3.6);
    };
  }

  /**
   * La tempête sur le bateau : un nuage noir, la pluie qui fouette la mer, des éclairs ; elle suit le bateau. Ramer (ou tenir la
   * barre, voile réduite) : l'équipage rame face aux vagues, de l'écume gicle à la proue, et la tempête passe. Attendre (se
   * mettre à la cape) : le bateau s'arrête, proue au vent, l'équipage assis à l'abri (boucliers dressés sur la galère) jusqu'à
   * la fin de l'attente. Foncer (forcer l'allure, hisser la voile) : il bondit en avant et la laisse derrière lui
   */
  private stageSwell(s: Staging, kind: 'swell' | 'squall' | 'crossing') {
    const bt = this.boat;
    if (!bt) return () => false;
    const [cx, cz] = this.boatBase(), h = 2.4, n0 = s.objs.length;
    const cloud = this.sCloud(s, cx, cz, 0, false, 1.6), rain = this.sRain(s, cx, cz, 2, h, bt.y), gloom = this.sGloom(s, cx, cz, 3.4, bt.y);
    cloud.position.y = bt.y + h + 0.25;
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const flash = this.sAdd(s, new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), flashMat));
    flash.position.copy(cloud.position); flash.scale.set(2.4, 0.7, 2.4); flash.renderOrder = 3;
    const bolt = this.sAdd(s, new THREE.LineSegments(boltGeo(1), BOLT));
    bolt.userData.flat = true; bolt.visible = false;
    s.own.push(flash.geometry, flashMat, { dispose: () => bolt.geometry.dispose() });
    // tout ce qui fait la tempête, dans un groupe qu'on déplace avec le bateau
    const storm = new THREE.Group();
    for (const o of s.objs.slice(n0)) { this.group.remove(o); o.position.x -= cx; o.position.z -= cz; storm.add(o); }
    storm.position.set(cx, 0, cz);
    this.sAdd(s, storm);
    // les boucliers dressés le long du bordage de la galère, pendant l'attente
    const shields = this.boatKind === 'galley' && kind !== 'squall' ? [0, 1, 2, 3].map(() => { const m = this.sAdd(s, new THREE.Mesh(roundShieldGeo(), mats.body)); m.visible = false; return m; }) : [];
    let pt = 0, k = 0, strike = 0.6, shown = 0, bow = 0, left: [number, number] | null = null;
    return (dt: number) => {
      const p = s.pick, wild = p < 0 || s.after < (p === 1 ? 7 : p === 2 ? 3.5 : 4.5);
      const [bx, bz] = this.boatBase(), hd = bt.obj.rotation.y, fx = Math.sin(hd), fz = Math.cos(hd), o = bt.obj.position;
      // elle suit le bateau, sauf quand il fonce : elle reste en arrière
      if (p === 2) left ??= [bx, bz];
      const [sx, sz] = left ?? [bx, bz];
      storm.position.x += (sx - storm.position.x) * Math.min(1, dt * 2); storm.position.z += (sz - storm.position.z) * Math.min(1, dt * 2);
      if (p === 0 && wild) {
        if (kind === 'squall') { this.crewAct = 'work'; this.crewFace = hd; } else this.rowing = true;
        // la proue face aux vagues : de l'écume y gicle à chaque vague
        if ((bow -= dt) <= 0) { bow = 0.8; this.splash(o.x + fx * 0.3, o.z + fz * 0.3, bt.y); }
      }
      if (p === 1 && wild) {
        this.moor = true; this.crewAct = 'sit';
        if (kind === 'squall') this.nudge.yaw = 1.1;
      }
      if (p === 2 && s.after < 3.5) {
        // il file droit devant, dans les paquets de mer
        const go = Math.min(1.3, s.after * 0.6);
        this.nudge.x = fx * go; this.nudge.z = fz * go; this.nudge.lift = Math.abs(Math.sin(this.t * 5)) * 0.03;
        if ((bow -= dt) <= 0) { bow = 0.45; this.splash(o.x + fx * 0.25, o.z + fz * 0.25, bt.y, true); }
      }
      shields.forEach((m, i) => {
        m.visible = p === 1 && wild;
        const sd = i % 2 ? 1 : -1, along = i < 2 ? 0.08 : -0.08;
        m.position.set(o.x + Math.cos(hd) * sd * 0.1 + fx * along, o.y + 0.02, o.z - Math.sin(hd) * sd * 0.1 + fz * along);
        m.rotation.set(0, hd + sd * Math.PI / 2, 0);
      });
      this.rough = wild ? (p === 2 ? 1 : p === 0 ? 0.5 : p === 1 ? 0.6 : 0.7) : Math.max(0, this.rough - dt * 0.3);
      k = wild ? Math.min(1, k + dt * 0.8) : Math.max(0, k - dt * 0.35);
      rain(dt, k);
      gloom(k * (1 - flashMat.opacity * 1.2));
      if (wild && (pt -= dt) <= 0) { pt = 0.09; const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.6, x = o.x + Math.cos(a) * r, z = o.z + Math.sin(a) * r; if (this.depth(x, z) !== null) this.puffAt(x, bt.y + 0.01, z); }
      if (wild && (strike -= dt) <= 0) {
        strike = 1.4 + Math.random() * 2.2; shown = 0.16;
        const ang = Math.random() * Math.PI * 2, d = 0.6 + Math.random() * 1.2, x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        bolt.geometry.dispose(); bolt.geometry = boltGeo(Math.random() * 10);
        bolt.position.set(x, bt.y, z); bolt.scale.set(1, cloud.position.y - bt.y, 1);
        flashMat.opacity = 0.55;
        if (this.depth(storm.position.x + x, storm.position.z + z) !== null) this.splash(storm.position.x + x, storm.position.z + z, bt.y, true);
      }
      shown -= dt;
      bolt.visible = shown > 0;
      flashMat.opacity *= Math.pow(0.02, dt);
      cloud.visible = flash.visible = k > 0.02;
      return wild || this.rough > 0.02 || k > 0.02;
    };
  }

  /**
   * Le tourbillon du kraken : la mer tourne autour de lui, trois bras d'écume s'enroulent vers un cœur sombre. Ramer : la galère
   * s'arrache vers le bord, à grands coups d'aviron, et il se referme. Harponner : trois harpons volent vers le cœur, le kraken
   * tressaille à chaque coup. L'ancre : elle plonge au bout de sa corde, la galère tourne sur elle-même le temps qu'il se referme
   */
  private stageMaelstrom(s: Staging) {
    const bt = this.boat, m = this.monster;
    if (!bt) return () => false;
    const o = bt.obj.position, cx = m ? (m.cx + o.x) / 2 : o.x, cz = m ? (m.cz + o.z) / 2 : o.z, R = 1.3, y = bt.y + 0.006;
    // trois bras d'écume en spirale, sur un ruban plat ; un cœur d'eau sombre
    const arms = 3, steps = 40, pos: number[] = [];
    for (let a = 0; a < arms; a++)
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps, r0 = 0.12 + t0 * R, r1 = 0.12 + t1 * R, a0 = a * (Math.PI * 2 / arms) + t0 * 4.2, a1 = a * (Math.PI * 2 / arms) + t1 * 4.2;
        const w0 = 0.02 + t0 * 0.07, w1 = 0.02 + t1 * 0.07;
        const p = (r: number, ang: number): [number, number, number] => [Math.cos(ang) * r, 0, Math.sin(ang) * r];
        const A = p(r0 - w0, a0), B = p(r0 + w0, a0), C = p(r1 - w1, a1), D = p(r1 + w1, a1);
        pos.push(...A, ...B, ...C, ...B, ...D, ...C);
      }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const foam = new THREE.MeshBasicMaterial({ color: 0xf2f8fb, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const swirl = this.sAdd(s, new THREE.Mesh(g, foam));
    swirl.position.set(cx, y, cz); swirl.renderOrder = 3; swirl.userData.flat = true;
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x0c2230, transparent: true, opacity: 0, depthWrite: false });
    const core = this.sAdd(s, new THREE.Mesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), coreMat));
    core.position.set(cx, y - 0.002, cz); core.renderOrder = 3; core.userData.flat = true;
    s.own.push(g, foam, core.geometry, coreMat);
    // les harpons, l'ancre et sa corde
    const target = () => (m && m.obj.visible ? m.obj.position.clone() : new THREE.Vector3(cx, y, cz));
    const throws = [0.4, 1.1, 1.8].map((at) => this.sThrow(s, at, 0.5, () => bt.obj.position.clone().add(new THREE.Vector3(0, 0.15, 0)), target, () => { const p = target(); this.splash(p.x, p.z, bt.y); if (m) m.flinch = 1; }));
    const anchor = this.sAdd(s, new THREE.Mesh(anchorGeo(), mats.body));
    anchor.visible = false;
    const rope = this.sRope(s);
    let k = 0, pt = 0, spin = 0, dropped = false;
    return (dt: number) => {
      const p = s.pick, open = p < 0 || s.after < (p === 0 ? 3 : p === 1 ? 3.5 : 6);
      k = open ? Math.min(1, k + dt * 0.6) : Math.max(0, k - dt * 0.4);
      spin += dt * (0.6 + 1.2 * k);
      swirl.rotation.y = spin;
      swirl.scale.setScalar(0.4 + 0.6 * k);
      foam.opacity = 0.6 * k; coreMat.opacity = 0.55 * k;
      this.rough = Math.max(this.rough, 0.75 * k);
      // des gerbes d'écume aspirées vers le cœur
      if (k > 0.2 && (pt -= dt) <= 0) {
        pt = 0.12;
        const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * R * 0.8, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (this.depth(x, z) !== null) this.puffAt(x, y + 0.004, z, 'puff', (cx - x) * 0.4 - Math.sin(a) * 0.3, (cz - z) * 0.4 + Math.cos(a) * 0.3);
      }
      const [bx, bz] = this.boatBase(), d = Math.max(0.01, Math.hypot(bx - cx, bz - cz));
      if (p === 0 && s.after < 4) {
        // à toutes rames, la galère s'écarte du cœur
        this.rowing = true;
        const go = Math.min(1, s.after * 0.35);
        this.steerTo(bx + (bx - cx) / d * go, bz + (bz - cz) / d * go);
      }
      if (p === 1) {
        if (s.after < 2.6) { const t = target(); this.crewAct = 'work'; this.crewFace = Math.atan2(t.x - bt.obj.position.x, t.z - bt.obj.position.z); }
        for (const th of throws) th();
      }
      if (p === 2) {
        const bp = bt.obj.position, ax = bp.x + Math.cos(bt.obj.rotation.y) * 0.15, az = bp.z - Math.sin(bt.obj.rotation.y) * 0.15;
        const u = Math.min(1, s.after / 0.8);
        anchor.visible = s.after < 6.5;
        anchor.position.set(ax, bp.y + 0.1 - u * 0.2, az);
        if (u >= 1 && !dropped) { dropped = true; this.splash(ax, az, bt.y); }
        rope(anchor.visible ? [[bp.x, bp.z], [ax, az]] : [], 0.05);
        if (s.after < 6.5) { this.moor = true; this.nudge.yaw = Math.sin(s.after * 0.9) * 0.6; this.crewAct = 'sit'; }
      }
      return open || k > 0.01 || (p === 2 && s.after < 7);
    };
  }

  /**
   * Le bateau de l'équipe sans l'écart qu'un imprévu lui donne : là où il serait sur sa route. Les décors s'y accrochent (la
   * tempête le suit), et c'est de là qu'on calcule l'écart à lui donner (`nudge`)
   */
  private boatBase(): [number, number] {
    const o = this.boat!.obj.position;
    return [o.x - this.nudged.x, o.z - this.nudged.z];
  }

  /** Pousse le bateau vers (x, z) le temps de l'imprévu (un écart, jamais sur la terre : voir `sail`) */
  private steerTo(x: number, z: number) {
    const [bx, bz] = this.boatBase();
    this.nudge.x = x - bx; this.nudge.z = z - bz;
  }

  /**
   * Un harpon lancé de `from` vers `to` en cloche, en `dur` secondes, `at` secondes après la décision ; à l'impact, `hit`.
   * Rend de quoi l'animer à chaque image
   */
  private sThrow(s: Staging, at: number, dur: number, from: () => THREE.Vector3, to: () => THREE.Vector3, hit: () => void) {
    const h = this.sAdd(s, new THREE.Mesh(harpoonGeo(), mats.body));
    h.visible = false;
    let done = false, a: THREE.Vector3 | null = null;
    return () => {
      const t = s.after - at;
      if (t < 0 || done) { h.visible = false; return; }
      a ??= from();
      const b = to(), u = Math.min(1, t / dur);
      h.visible = u < 1;
      h.position.lerpVectors(a, b, u);
      h.position.y += Math.sin(u * Math.PI) * 0.25;
      h.lookAt(b.x, b.y, b.z);
      if (u >= 1) { done = true; hit(); }
    };
  }

  /**
   * Le mégalodon fonce sur la galère, gueule ouverte. Virer de bord : la galère pivote à toutes rames, et la gueule claque sur
   * le vide dans une gerbe. Les harpons : l'équipage debout les lance, il tressaille. La viande : un quartier lancé au loin, il
   * plonge dessus
   */
  private stageLunge(s: Staging) {
    const bt = this.boat, m = this.monster;
    if (!bt) return () => false;
    const target = () => (m && m.obj.visible ? m.obj.position.clone() : bt.obj.position.clone().add(new THREE.Vector3(1, 0, 0)));
    const throws = [0.3, 0.9, 1.5].map((at) => this.sThrow(s, at, 0.45, () => bt.obj.position.clone().add(new THREE.Vector3(0, 0.15, 0)), target, () => { const p = target(); this.splash(p.x, p.z, bt.y); if (m) m.flinch = 1; }));
    const meat = this.sAdd(s, new THREE.Mesh(ballGeo(0xc8443a), mats.body));
    meat.scale.setScalar(2); meat.visible = false;
    let snap = false, gulp = false, from: THREE.Vector3 | null = null, to: THREE.Vector3 | null = null;
    return () => {
      const p = s.pick;
      if (p < 0) { this.rough = Math.max(this.rough, 0.5); return true; }
      const bp = bt.obj.position;
      if (p === 0) {
        if (s.after < 2.5) { this.rowing = true; this.nudge.yaw = Math.min(1.4, s.after * 1.4); }
        // la gueule se referme là où était la galère
        if (!snap && s.after > 0.9) { snap = true; const hd = bt.obj.rotation.y; this.splash(bp.x + Math.sin(hd) * 0.4, bp.z + Math.cos(hd) * 0.4, bt.y, true); if (m) m.flinch = 1; }
        return s.after < 3;
      }
      if (p === 1) {
        if (s.after < 2.2) { const t = target(); this.crewAct = 'work'; this.crewFace = Math.atan2(t.x - bp.x, t.z - bp.z); }
        for (const th of throws) th();
        return s.after < 2.6;
      }
      if (!from) {
        from = bp.clone().add(new THREE.Vector3(0, 0.15, 0));
        const a = bt.obj.rotation.y + Math.PI / 2;
        let x = bp.x + Math.sin(a) * 1.3, z = bp.z + Math.cos(a) * 1.3;
        if (this.depth(x, z) === null) { x = bp.x - Math.sin(a) * 1.3; z = bp.z - Math.cos(a) * 1.3; }
        to = new THREE.Vector3(x, bt.y, z);
      }
      const u = Math.min(1, s.after / 0.8);
      meat.visible = s.after < 1.6;
      meat.position.lerpVectors(from, to!, u); meat.position.y += Math.sin(u * Math.PI) * 0.3;
      if (u >= 1 && !gulp && s.after > 1.4) { gulp = true; this.splash(to!.x, to!.z, bt.y, true); if (m) m.flinch = 1; }
      if (s.after < 1) { this.crewAct = 'work'; this.crewFace = Math.atan2(to!.x - bp.x, to!.z - bp.z); }
      return s.after < 2.4;
    };
  }

  /**
   * Une barque d'ailleurs (gardes, chef, invités, musiciens) qui vient se ranger contre le bateau de l'équipe le temps d'un
   * imprévu de la diplomatie, avec ses gens à bord. `place` la pose à côté du bateau (`side` : à quelle distance du bord,
   * `along` : plus en avant ou en arrière) et les y assoit ; rend aussi ses gens, pour changer leur pose
   */
  private sVisitor(s: Staging, a: ActiveExpedition, n: number, role: FolkRole, kind: BoatKind = 'rowboat') {
    const bt = this.boat!, hull = this.sAdd(s, new THREE.Mesh(boatGeo(kind), mats.body));
    hull.castShadow = true;
    const folks = Array.from({ length: n }, (_, i) => this.sNpc(s, role, a.age, bt.obj.position.x + i * 0.05, bt.obj.position.z, 0, 'idle'));
    const place = (side: number, along = 0) => {
      const o = bt.obj.position, hd = bt.obj.rotation.y, px = Math.cos(hd), pz = -Math.sin(hd), fx = Math.sin(hd), fz = Math.cos(hd);
      let x = o.x + px * side + fx * along, z = o.z + pz * side + fz * along;
      if (this.depth(x, z) === null) { x = o.x - px * side + fx * along; z = o.z - pz * side + fz * along; }
      hull.position.set(x, bt.y + 0.005 + Math.sin(this.t * 1.6 + 1) * 0.006, z);
      hull.rotation.set(Math.sin(this.t * 1.2) * 0.03, hd, Math.sin(this.t) * 0.04);
      folks.forEach((f, i) => {
        const lz = (n > 1 ? 0.08 - i * (0.16 / (n - 1)) : 0) * hull.scale.x;
        f.folk.root.position.set(x + fx * lz, bt.y + BOAT_SEAT[kind] + 0.01, z + fz * lz);
        f.folk.root.rotation.y = Math.atan2(o.x - x, o.z - z);
      });
      return [x, z] as [number, number];
    };
    return { hull, folks, place };
  }

  /** Une table sur un radeau, à côté du bateau de l'équipe (les pourparlers de la paix) ; rend où elle est */
  private sRaft(s: Staging, round: boolean) {
    const bt = this.boat!, raft = this.sAdd(s, new THREE.Mesh(deckGeo(false), mats.body)), table = this.sAdd(s, new THREE.Mesh(tableGeo(round), mats.body));
    raft.scale.set(1.4, 1, 1.4);
    return () => {
      const o = bt.obj.position, hd = bt.obj.rotation.y;
      let x = o.x + Math.cos(hd) * 0.55, z = o.z - Math.sin(hd) * 0.55;
      if (this.depth(x, z) === null) { x = o.x - Math.cos(hd) * 0.55; z = o.z + Math.sin(hd) * 0.55; }
      raft.position.set(x, bt.y - 0.01, z); raft.rotation.y = hd;
      table.position.set(x, bt.y + 0.01, z); table.rotation.y = hd;
      return [x, z, hd] as [number, number, number];
    };
  }

  /**
   * Les gardes du quai (les émissaires) : une barque de gardes se range contre le bateau. Parler de paix : notre équipage
   * debout leur parle, puis ils s'écartent. Un présent : un panier passe d'un bord à l'autre, les gardes acclament. Attendre :
   * l'équipage reste assis, jusqu'à ce qu'un garde fasse signe d'approcher
   */
  private stageMistrust(s: Staging, a: ActiveExpedition) {
    if (!this.boat) return () => false;
    const v = this.sVisitor(s, a, 2, 'villager'), gift = this.sAdd(s, new THREE.Mesh(basketGeo(), mats.body));
    gift.visible = false;
    return () => {
      const p = s.pick, t = s.after, o = this.boat!.obj.position;
      const [x, z] = v.place(p === 0 && t > 3 ? 0.45 + (t - 3) * 0.4 : 0.45);
      this.moor = p < 0 || t < 6;
      if (p < 0) { v.folks.forEach((f) => (f.pose = 'talk')); return true; }
      const face = Math.atan2(x - o.x, z - o.z);
      if (p === 0) { this.crewAct = t < 3 ? 'work' : null; this.crewFace = face; v.folks.forEach((f) => (f.pose = t < 3 ? 'talk' : 'idle')); }
      if (p === 1) {
        const u = Math.min(1, t / 1.2);
        gift.visible = true;
        gift.position.set(o.x + (x - o.x) * u, o.y + 0.08 + Math.sin(u * Math.PI) * 0.12, o.z + (z - o.z) * u);
        this.crewAct = 'cheer'; this.crewFace = face;
        v.folks.forEach((f) => (f.pose = u >= 1 ? 'cheer' : 'idle'));
      }
      if (p === 2) { this.crewAct = 'sit'; v.folks[0].pose = t > 4 ? 'cheer' : 'idle'; v.folks[1].pose = 'idle'; }
      return t < 6.5;
    };
  }

  /**
   * La vieille querelle : le chef d'une autre île, dans sa barque. Chacun s'excuse : il s'incline, notre équipage aussi, puis on
   * se salue. Payer la barque : une barque neuve, à flot entre les deux bords. Changer de sujet : on parle, et sa barque s'éloigne
   */
  private stageGrievance(s: Staging, a: ActiveExpedition) {
    if (!this.boat) return () => false;
    const v = this.sVisitor(s, a, 1, 'sage'), gift = this.sAdd(s, new THREE.Mesh(boatGeo('canoe'), mats.body));
    gift.visible = false;
    return () => {
      const p = s.pick, t = s.after, o = this.boat!.obj.position;
      const [x, z] = v.place(p === 2 && t > 3 ? 0.5 + (t - 3) * 0.5 : p === 1 ? 0.7 : 0.5);
      this.moor = p < 0 || t < 6;
      const chief = v.folks[0], face = Math.atan2(x - o.x, z - o.z);
      if (p < 0) { chief.pose = 'talk'; return true; }
      if (p === 0) { chief.pose = t < 2.5 ? 'work' : 'cheer'; this.crewAct = t < 2.5 ? 'work' : 'cheer'; this.crewFace = face; }
      if (p === 1) {
        gift.visible = t > 1;
        gift.position.set((o.x + x) / 2, this.boat!.y + 0.004, (o.z + z) / 2); gift.rotation.y = this.boat!.obj.rotation.y;
        gift.scale.setScalar(Math.min(1, Math.max(0.001, t - 1)));
        chief.pose = t > 2 ? 'cheer' : 'idle';
      }
      if (p === 2) { chief.pose = t < 3 ? 'talk' : 'idle'; this.crewAct = 'sit'; this.crewFace = face; }
      return t < 6.5;
    };
  }

  /**
   * Qui s'assied où : une table sur un radeau contre le bateau, les deux chefs (et le nôtre). Table ronde : tous autour, à
   * égale distance. Côte à côte : une longue table, les deux chefs face à la mer. Notre chef au milieu : une longue table, lui
   * entre les deux
   */
  private stageSeat(s: Staging, a: ActiveExpedition) {
    if (!this.boat) return () => false;
    let raft: (() => [number, number, number]) | null = null;
    const chiefs = [0, 1, 2].map((i) => this.sNpc(s, i === 2 ? 'villager' : 'sage', a.age, this.focus[0], this.focus[1], 0, 'idle'));
    chiefs[2].folk.root.visible = false;
    let made = -2;
    return () => {
      const p = s.pick, t = s.after;
      this.moor = p < 0 || t < 7;
      if (made !== p) { made = p; if (p >= 0) raft = this.sRaft(s, p === 0); }
      const at = raft ? raft() : null, bt = this.boat!, o = bt.obj.position;
      if (!at) {
        // pendant la décision, les deux chefs se tournent le dos, debout sur le pont
        chiefs.slice(0, 2).forEach((c, i) => { c.folk.root.position.set(o.x + (i ? 0.08 : -0.08), bt.y + 0.06, o.z); c.folk.root.rotation.y = bt.obj.rotation.y + (i ? 0 : Math.PI); c.pose = 'talk'; });
        return true;
      }
      const [x, z, hd] = at, y = bt.y + 0.02;
      // (face : où il regarde ; null : vers le milieu de la table)
      const put = (c: (typeof chiefs)[number], dx: number, dz: number, face: number | null) => {
        const cx = x + Math.cos(hd) * dx + Math.sin(hd) * dz, cz = z - Math.sin(hd) * dx + Math.cos(hd) * dz;
        c.folk.root.visible = true; c.folk.root.position.set(cx, y, cz); c.folk.root.rotation.y = face ?? Math.atan2(x - cx, z - cz); c.pose = 'sit';
      };
      if (p === 0) [0, 1, 2].forEach((i) => { const ang = i * 2.094; put(chiefs[i], Math.cos(ang) * 0.17, Math.sin(ang) * 0.17, null); });
      if (p === 1) { put(chiefs[0], -0.06, -0.09, hd); put(chiefs[1], 0.06, -0.09, hd); chiefs[2].folk.root.visible = false; chiefs[0].pose = chiefs[1].pose = t > 3 ? 'cheer' : 'sit'; }
      if (p === 2) { put(chiefs[0], -0.14, -0.09, hd); put(chiefs[2], 0, -0.09, hd); put(chiefs[1], 0.14, -0.09, hd); chiefs[2].pose = 'talk'; }
      return t < 7.5;
    };
  }

  /**
   * Le menu de la fête : la table du radeau. Un plat de chaque peuple : trois plats différents. Notre spécialité : un seul grand
   * plat. Le gâteau : trois étages, et les invités acclament
   */
  private stageMenu(s: Staging, a: ActiveExpedition) {
    if (!this.boat) return () => false;
    const raft = this.sRaft(s, false), guests = [0, 1].map(() => this.sNpc(s, 'sage', a.age, this.focus[0], this.focus[1], 0, 'idle'));
    const dishes = [foodGeo(), berriesGeo(), fishGeo()].map((g) => { const m = this.sAdd(s, new THREE.Mesh(g, mats.body)); m.visible = false; return m; });
    const big = this.sAdd(s, new THREE.Mesh(foodGeo(), mats.body)), cake = this.sAdd(s, new THREE.Mesh(cakeGeo(), mats.body));
    big.visible = cake.visible = false; big.scale.setScalar(2);
    return () => {
      const p = s.pick, t = s.after, [x, z, hd] = raft(), y = this.boat!.y + 0.095;
      this.moor = p < 0 || t < 7;
      guests.forEach((g, i) => { g.folk.root.position.set(x + Math.sin(hd) * (i ? 0.16 : -0.16), this.boat!.y + 0.02, z + Math.cos(hd) * (i ? 0.16 : -0.16)); g.folk.root.rotation.y = hd + (i ? Math.PI : 0); g.pose = p === 2 && t > 1.5 ? 'cheer' : 'sit'; });
      const show = p >= 0 && t > 0.5;
      dishes.forEach((d, i) => { d.visible = show && p === 0; d.position.set(x + Math.cos(hd) * (i - 1) * 0.09, y, z - Math.sin(hd) * (i - 1) * 0.09); });
      big.visible = show && p === 1; big.position.set(x, y, z);
      cake.visible = show && p === 2; cake.position.set(x, y, z);
      return p < 0 || t < 7.5;
    };
  }

  /**
   * Trois musiques : les musiciens des trois peuples sur le radeau, tambours aux pieds. Tous ensemble : ils jouent ensemble et
   * notre équipage danse. Chacun son tour : un seul joue à la fois, les autres attendent assis
   */
  private stageMusic(s: Staging, a: ActiveExpedition) {
    if (!this.boat) return () => false;
    const raft = this.sRaft(s, true), band = [0, 1, 2].map(() => this.sNpc(s, 'drummer', a.age, this.focus[0], this.focus[1], 0, 'idle'));
    const drums = band.map(() => this.sAdd(s, new THREE.Mesh(drumGeo(), mats.body)));
    return () => {
      const p = s.pick, t = s.after, [x, z, hd] = raft(), y = this.boat!.y + 0.02;
      this.moor = p < 0 || t < 8;
      const turn = Math.floor(t / 2) % 3;
      band.forEach((b, i) => {
        const ang = hd + i * 2.094, bx = x + Math.cos(ang) * 0.15, bz = z + Math.sin(ang) * 0.15;
        b.folk.root.position.set(bx, y, bz); b.folk.root.rotation.y = Math.atan2(x - bx, z - bz);
        drums[i].position.set(bx + (x - bx) * 0.35, y, bz + (z - bz) * 0.35);
        b.pose = p < 0 ? 'idle' : p === 0 || turn === i ? 'cheer' : 'sit';
      });
      if (p === 0 && t < 8) this.crewAct = 'cheer';
      return p < 0 || t < 8.5;
    };
  }

  /**
   * La patrouille rivale (les éclaireurs) : une galère rivale, lanternes masquées, glisse vers la barque. Se cacher : la barque
   * s'arrête, l'équipage se tasse, la galère passe à distance et s'éloigne. La suivre : l'équipage la guette debout, elle file
   * vers les remparts rivaux et la barque reprend sa route dans son sillage
   */
  private stagePatrol(s: Staging) {
    const bt = this.boat;
    if (!bt) return () => false;
    const [bx, bz] = this.boatBase(), hd0 = bt.obj.rotation.y, fx = Math.sin(hd0), fz = Math.cos(hd0), px = Math.cos(hd0), pz = -Math.sin(hd0);
    const galley = this.sAdd(s, new THREE.Mesh(boatGeo('sail'), mats.body));
    const to = this.scout ? this.scout.walls : [bx + fx * 6, bz + fz * 6];
    return () => {
      const p = s.pick, t = s.after;
      // elle approche de biais, puis (selon le choix) passe au large ou file vers la ville
      let x = bx + fx * 2.2 + px * 1.2, z = bz + fz * 2.2 + pz * 1.2;
      if (p < 0) { const u = Math.min(1, s.t / 4); x -= px * 0.6 * u; z -= pz * 0.6 * u; }
      else if (p === 0) { const u = Math.min(1, t / 7); x += -px * 0.6 - fx * 3 * u + px * 1.4 * u; z += -pz * 0.6 - fz * 3 * u + pz * 1.4 * u; this.moor = t < 6; this.crewAct = t < 6 ? 'sit' : null; }
      else { const u = Math.min(1, t / 8), sx = bx + fx * 2.2 + px * 0.6, sz = bz + fz * 2.2 + pz * 0.6; x = sx + (to[0] - sx) * u * 0.5; z = sz + (to[1] - sz) * u * 0.5; this.crewAct = t < 3 ? 'work' : null; this.crewFace = Math.atan2(x - bt.obj.position.x, z - bt.obj.position.z); }
      if (this.depth(x, z) !== null) galley.position.set(x, bt.y + 0.005 + Math.sin(this.t * 1.3) * 0.006, z);
      galley.rotation.y = p === 0 ? hd0 + Math.PI : p === 1 ? Math.atan2(to[0] - x, to[1] - z) : hd0 + Math.PI / 2;
      return p < 0 || t < 8;
    };
  }

  /**
   * Le feu sur la falaise (les éclaireurs) : un grand feu sur la côte rivale, des silhouettes autour. Approcher : l'équipage
   * s'accroupit, tourné vers le feu, et les silhouettes tiennent conseil. Noter l'endroit et passer : on garde la route, le feu
   * baisse et fume, les silhouettes s'en vont
   */
  private stageCliffire(s: Staging, a: ActiveExpedition) {
    const [ox, oz] = this.focus, sc = this.scout;
    const c: [number, number] = sc ? [sc.post[0] + (sc.walls[0] - sc.post[0]) * 0.3 + 1.2, sc.post[1] + (sc.walls[1] - sc.post[1]) * 0.3] : [ox + 2.5, oz + 1.5];
    const f = this.sFlame(s, c[0], c[1], 1.2);
    const men = [0, 1, 2].map((i) => { const an = i * 2.1, x = c[0] + Math.cos(an) * 0.45, z = c[1] + Math.sin(an) * 0.45; return this.sNpc(s, 'villager', a.age, x, z, Math.atan2(c[0] - x, c[1] - z), 'talk'); });
    let pt = 0;
    return (dt: number) => {
      const p = s.pick, t = s.after, y = this.world.surfaceAt(c[0], c[1]);
      f.position.set(c[0], y + 0.3, c[1]);
      f.scale.setScalar(p === 1 ? Math.max(0.3, 1.2 - t * 0.2) : 1 + 0.2 * Math.sin(this.t * 17));
      men.forEach((m, i) => (m.pose = p === 1 ? (t > 2 + i ? 'idle' : 'talk') : p === 0 && t > 3 ? 'cheer' : 'talk'));
      if (p === 0) { this.moor = t < 6; this.crewAct = 'work'; const o = this.boat?.obj.position; if (o) this.crewFace = Math.atan2(c[0] - o.x, c[1] - o.z); }
      if (p === 1 && (pt -= dt) <= 0) { pt = 0.15; this.puffAt(c[0], y + 0.4, c[1], 'smoke', 0.3, 0.06); }
      return p < 0 || t < 7;
    };
  }

  /**
   * Le blocus : quatre navires rivaux bord contre bord devant le port allié. De front : notre bateau fonce sur la ligne, une
   * grande gerbe au choc, et les rivaux s'écartent. Attendre la flotte alliée : on reste à l'arrêt, et deux navires alliés
   * arrivent se ranger à nos côtés. Les récifs : on fait un grand détour par les rochers qui affleurent
   */
  private stageBlockade(s: Staging, a: ActiveExpedition) {
    const bt = this.boat;
    if (!bt) return () => false;
    const [bx, bz] = this.boatBase(), hd0 = bt.obj.rotation.y, fx = Math.sin(hd0), fz = Math.cos(hd0), px = Math.cos(hd0), pz = -Math.sin(hd0);
    const line = [-1.5, -0.5, 0.5, 1.5].map((k) => { const m = this.sAdd(s, new THREE.Mesh(boatGeo('sail'), mats.body)); m.userData.k = k; return m; });
    const allies = [0, 1].map(() => { const m = this.sAdd(s, new THREE.Mesh(boatGeo('sail'), mats.body)); m.visible = false; return m; });
    const reefs = [0, 1, 2].map((i) => { const x = bx + px * 1.4 + fx * (0.4 + i * 0.5), z = bz + pz * 1.4 + fz * (0.4 + i * 0.5); const r = this.sPut(s, rocksGeo(), x, z, i); r.position.y = bt.y - 0.03; r.scale.setScalar(0.5); return r; });
    let hit = false;
    return () => {
      const p = s.pick, t = s.after;
      line.forEach((m) => {
        const k = m.userData.k as number, open = p === 0 && hit ? Math.min(0.8, (t - 1.6) * 0.5) * Math.sign(k) : 0;
        m.position.set(bx + fx * 1.8 + px * (k * 0.32 + open), bt.y + 0.005 + Math.sin(this.t * 1.4 + k) * 0.006, bz + fz * 1.8 + pz * (k * 0.32 + open));
        m.rotation.y = hd0 + Math.PI / 2;
      });
      reefs.forEach((r) => (r.visible = p === 2 || p < 0));
      if (p < 0) return true;
      if (p === 0 && t < 4) {
        const go = Math.min(1.3, t * 0.9);
        this.nudge.x = fx * go; this.nudge.z = fz * go; this.crewAct = 'work';
        if (!hit && go >= 1.3) { hit = true; this.splash(bx + fx * 1.6, bz + fz * 1.6, bt.y, true); }
      }
      if (p === 1) {
        if (t < 7) { this.moor = true; this.crewAct = 'sit'; }
        allies.forEach((m, i) => {
          const u = Math.min(1, t / 5), sd = i ? 1 : -1;
          m.visible = true;
          m.position.set(bx + px * sd * 0.55 - fx * (2.5 - 2.5 * u), bt.y + 0.005, bz + pz * sd * 0.55 - fz * (2.5 - 2.5 * u));
          m.rotation.y = hd0;
        });
      }
      if (p === 2 && t < 5) {
        // un arc large par les récifs
        const u = Math.sin(Math.min(1, t / 5) * Math.PI);
        this.nudge.x = px * 1.1 * u + fx * t * 0.25; this.nudge.z = pz * 1.1 * u + fz * t * 0.25; this.nudge.yaw = 0.5 * Math.cos(Math.min(1, t / 5) * Math.PI);
      }
      return t < 8;
    };
  }

  /**
   * Un émissaire rival, drapeau blanc hissé sur sa barque. Exiger sa reddition : le drapeau s'abaisse jusqu'au pont, l'émissaire
   * s'assoit, tête basse. Refuser : sa barque fait demi-tour et file, notre bateau reprend sa route en avant
   */
  private stageParley(s: Staging, a: ActiveExpedition) {
    if (!this.boat) return () => false;
    const v = this.sVisitor(s, a, 1, 'villager'), flag = this.sAdd(s, new THREE.Mesh(whiteFlagGeo(), mats.body));
    return () => {
      const p = s.pick, t = s.after, bt = this.boat!;
      const [x, z] = v.place(p === 1 ? 0.6 + Math.max(0, t - 0.5) * 0.7 : 0.6, p === 1 ? -Math.max(0, t - 0.5) * 0.4 : 0);
      if (p === 1) v.hull.rotation.y += Math.min(Math.PI, Math.max(0, t - 0.5) * 2);
      const low = p === 0 ? Math.max(0.15, 1 - t * 0.3) : 1;
      flag.position.set(x, bt.y + 0.02, z); flag.scale.set(1, low, 1);
      v.folks[0].pose = p === 0 && t > 1 ? 'sit' : 'talk';
      this.moor = p < 0 || (p === 0 && t < 5);
      if (p === 1 && t < 4) { const hd = bt.obj.rotation.y, go = Math.min(0.8, t * 0.4); this.nudge.x = Math.sin(hd) * go; this.nudge.z = Math.cos(hd) * go; this.crewAct = 'work'; }
      return p < 0 || t < 5.5;
    };
  }
  /**
   * Des ossements et des boucliers fondus devant la grotte du dragon. Fouiller : deux membres y vont, la poussière vole, et un
   * tas de bon métal paraît. Serrer les rangs : l'équipe se serre en carré, boucliers levés devant elle. Avancer : elle passe à
   * côté sans s'arrêter, droit vers la grotte
   */
  private stageBones(s: Staging, a: ActiveExpedition) {
    const d = this.dragon, [tx, tz] = this.teamAt(a), [mx, mz] = d ? d.mouth : [tx + 1, tz];
    const [bx, bz] = this.near(tx + (mx - tx) * 0.45 + 0.3, tz + (mz - tz) * 0.45, tx, tz);
    for (let i = 0; i < 4; i++) { const o = this.sPut(s, i % 2 ? branchGeo() : roundShieldGeo(), bx + Math.cos(i * 1.7) * 0.15, bz + Math.sin(i * 1.7) * 0.12, i); o.rotation.x = i % 2 ? 0 : Math.PI / 2; o.scale.setScalar(i % 2 ? 0.6 : 1); }
    const metal = this.sPut(s, ingotsGeo(), bx, bz + 0.2, 0.4);
    metal.visible = false;
    const shields: THREE.Object3D[] = [];
    let sent = false;
    return () => {
      const p = s.pick, t = s.after;
      if (p < 0) return true;
      const [cx, cz] = this.teamAt(a), ux = mx - cx, uz = mz - cz, l = Math.max(0.01, Math.hypot(ux, uz));
      if (!sent) {
        sent = true;
        if (p === 0) a.party.slice(0, 2).forEach((id, i) => this.sendTo(a, id, bx + (i ? 0.12 : -0.12), bz - 0.12, bx, bz, 6));
        if (p === 1) a.party.forEach((id, i) => this.sendTo(a, id, cx + (i % 2) * 0.16 - 0.08, cz + Math.floor(i / 2) * 0.16 - 0.08, mx, mz, 6));
        if (p === 2) a.party.forEach((id, i) => this.sendTo(a, id, cx + ux / l * 1.2 + (i - 1) * 0.15, cz + uz / l * 1.2, mx, mz, 4));
        if (p === 1) for (let i = 0; i < 3; i++) shields.push(this.sPut(s, roundShieldGeo(), cx + ux / l * 0.2 + (uz / l) * (i - 1) * 0.12, cz + uz / l * 0.2 - (ux / l) * (i - 1) * 0.12, Math.atan2(ux, uz), 0.04));
      }
      if (p === 0) { if (t > 1 && t < 5 && Math.random() < 0.15) this.puffAt(bx, this.world.surfaceAt(bx, bz) + 0.04, bz); metal.visible = t > 4; }
      return t < (p === 0 ? 8 : 6);
    };
  }

  /**
   * Le dragon crache le feu : un torrent de flammes jaillit de sa gueule vers l'équipe. Les boucliers : l'équipe serrée derrière
   * ses boucliers, les flammes s'arrêtent net devant elle. Les rochers : des rochers tout près, l'équipe s'y jette, et le feu
   * passe au-dessus. Charger : elle court droit sur le dragon, à travers la fumée
   */
  private stageFlames(s: Staging, a: ActiveExpedition) {
    const d = this.dragon, [tx, tz] = this.teamAt(a), [mx, mz] = d ? d.mouth : [tx + 1.5, tz];
    const ux = tx - mx, uz = tz - mz, l = Math.max(0.01, Math.hypot(ux, uz));
    const [rx, rz] = this.near(tx - uz / l * 0.5, tz + ux / l * 0.5, tx, tz);
    const rocks = this.sPut(s, rocksGeo(), rx, rz, 0.3);
    rocks.scale.setScalar(1.6); rocks.visible = false;
    const jets = Array.from({ length: 6 }, () => { const f = this.sFlame(s, mx, mz, 0.9); f.visible = false; return f; });
    const shields: THREE.Object3D[] = [];
    let sent = false;
    return () => {
      const p = s.pick, t = s.after;
      // le torrent de flammes : de la gueule vers l'équipe, jusqu'où il porte selon le choix
      const reach = p < 0 ? 0.4 : p === 0 ? 0.8 : p === 1 ? 1.05 : 0.6, on = p < 0 || t < 3;
      jets.forEach((f, i) => {
        const k = (i + 1) / jets.length * reach, x = mx + ux * k, z = mz + uz * k;
        f.visible = on;
        f.position.set(x, this.world.surfaceAt(x, z) + (p === 1 ? 0.3 : 0.06) + Math.sin(this.t * 9 + i) * 0.02, z);
        f.scale.setScalar(0.8 + 0.4 * Math.sin(this.t * 13 + i));
      });
      if (p < 0) return true;
      if (!sent) {
        sent = true;
        if (p === 0) { a.party.forEach((id, i) => this.sendTo(a, id, tx + (i - 1) * 0.12, tz, mx, mz, 5)); for (let i = 0; i < 3; i++) shields.push(this.sPut(s, roundShieldGeo(), tx - ux / l * 0.15 + (uz / l) * (i - 1) * 0.12, tz - uz / l * 0.15 - (ux / l) * (i - 1) * 0.12, Math.atan2(-ux, -uz), 0.04)); }
        if (p === 1) { rocks.visible = true; a.party.forEach((id, i) => this.sendTo(a, id, rx + ux / l * 0.25 + (i - 1) * 0.1, rz + uz / l * 0.25, mx, mz, 5)); }
        if (p === 2) a.party.forEach((id, i) => this.sendTo(a, id, mx + ux / l * 0.6 + (i - 1) * 0.15, mz + uz / l * 0.6, mx, mz, 4));
      }
      if (p === 2 && t < 3 && Math.random() < 0.3) { const [cx, cz] = this.teamAt(a); this.puffAt(cx, this.world.surfaceAt(cx, cz) + 0.1, cz, 'smoke'); }
      return t < 6;
    };
  }

  /**
   * Des runes sur les rochers de la rive, face à l'île du portail, à côté du quai d'où part la galère. Recopier : on s'y arrête,
   * un parchemin au-dessus des pierres, et la galère attend. Les torches : deux flammes les éclairent, elles brillent deux fois
   * plus. Embarquer sans s'attarder : à toutes rames, les pierres luisent seules derrière
   */
  private stageRunes(s: Staging) {
    const bt = this.boat;
    if (!bt) return () => false;
    const [dx, dz] = this.dockOf(bt.home), [hx, hz] = bt.home, ux = dx - hx, uz = dz - hz, l = Math.max(0.01, Math.hypot(ux, uz));
    const stones: THREE.Object3D[] = [], glow: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const [x, z] = this.near(dx + ux / l * 0.35 - uz / l * (i - 1) * 0.3, dz + uz / l * 0.35 + ux / l * (i - 1) * 0.3, dx, dz);
      stones.push(this.sPut(s, stoneGeo(), x, z, i));
      const g = this.sAdd(s, new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), GREEN));
      g.position.set(x, this.world.surfaceAt(x, z) + 0.1, z); s.own.push(g.geometry); glow.push(g);
    }
    const scroll = this.sAdd(s, new THREE.Mesh(scrollGeo(), mats.body));
    scroll.visible = false;
    const fires = [0, 1].map(() => { const f = this.sFlame(s, dx, dz, 0.6); f.visible = false; return f; });
    return () => {
      const p = s.pick, t = s.after;
      glow.forEach((g, i) => g.scale.setScalar((p === 1 && t < 5 ? 2 : 1) * (0.8 + 0.3 * Math.sin(this.t * 3 + i))));
      if (p < 0) return true;
      if (p === 0 && t < 5) { this.moor = true; scroll.visible = true; scroll.position.set(stones[1].position.x, stones[1].position.y + 0.2, stones[1].position.z); scroll.rotation.y = this.t; } else scroll.visible = false;
      fires.forEach((f, i) => { f.visible = p === 1 && t < 5; f.position.set(stones[i * 2].position.x, stones[i * 2].position.y + 0.18, stones[i * 2].position.z); });
      if (p === 2 && t < 5) this.rowing = true;
      return t < 6;
    };
  }

  /**
   * L'arche gronde : des étincelles rouges et des jets de flamme jaillissent du portail. Reculer : l'équipe recule vers la plage
   * et s'assoit le temps qu'il s'apaise. Les boucliers : un bouclier levé devant chacun, elle reste à l'ouvrage. Finir au plus
   * vite : elle s'active sous une pluie d'étincelles bien plus drue
   */
  private stageRumble(s: Staging, a: ActiveExpedition) {
    const isle = this.isle;
    if (!isle) return () => false;
    const [gx, gz] = isle.gate, [lx, lz] = isle.land, gy = this.world.surfaceAt(gx, gz);
    const jets = [0, 1].map((i) => this.sFlame(s, gx + (i ? 0.3 : -0.3), gz, 1.1));
    const shields = (this.boat?.riders ?? []).map(() => { const m = this.sAdd(s, new THREE.Mesh(roundShieldGeo(), mats.body)); m.visible = false; return m; });
    let pt = 0;
    return (dt: number) => {
      const p = s.pick, t = s.after, wild = p < 0 || t < (p === 0 ? 6 : 5);
      jets.forEach((j) => { j.visible = wild; j.scale.setScalar(1 + 0.4 * Math.sin(this.t * 11)); });
      if (wild && (pt -= dt) <= 0) { pt = p === 2 ? 0.05 : 0.15; this.puffAt(gx + (Math.random() - 0.5) * 0.6, gy + 0.3 + Math.random() * 0.3, gz + (Math.random() - 0.5) * 0.3, 'smoke', (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3); }
      if (p === 0 && t < 6) { this.isleBack = Math.min(0.7, t * 0.4); this.crewAct = 'sit'; }
      if (p === 2 && t < 5) this.crewAct = 'work';
      // les boucliers levés devant chacun, entre lui et l'arche
      const pos = this.agents.partyPositions(this.boat?.riders ?? []);
      shields.forEach((m, i) => {
        const q = pos[i];
        m.visible = p === 1 && t < 5 && !!q;
        if (!q) return;
        const ux = gx - q[0], uz = gz - q[1], l = Math.max(0.01, Math.hypot(ux, uz));
        m.position.set(q[0] + ux / l * 0.08, this.world.surfaceAt(q[0], q[1]) + 0.05, q[1] + uz / l * 0.08);
        m.rotation.y = Math.atan2(ux, uz);
      });
      void lx; void lz;
      return wild;
    };
  }

  /**
   * Une pluie de cendres sur la rive : des flocons gris tombent autour de l'équipe. La bâche : tendue sur deux piquets, l'équipe
   * assise dessous. Partir : l'équipe court vers la barque sous la cendre qui tombe plus dru
   */
  private stageAsh(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), grey = new THREE.MeshLambertMaterial({ color: 0x8a8682 }), flake = new THREE.IcosahedronGeometry(0.012, 0);
    s.own.push(grey, flake);
    const flakes = Array.from({ length: 14 }, () => this.sAdd(s, new THREE.Mesh(flake, grey)));
    const tarp = this.sPut(s, new THREE.BoxGeometry(0.7, 0.01, 0.5), tx, tz, 0.4, 0.2);
    const canvas = new THREE.MeshLambertMaterial({ color: 0x9a8a5a });
    s.own.push(tarp.geometry, canvas);
    (tarp as THREE.Mesh).material = canvas;
    tarp.visible = false;
    return (dt: number) => {
      const p = s.pick, t = s.after, dense = p === 1 ? 2 : 1;
      flakes.forEach((m, i) => {
        const h = (this.t * 0.18 * dense + i * 0.071) % 1, x = tx + Math.sin(i * 2.3) * 0.6 + Math.sin(this.t + i) * 0.05, z = tz + Math.cos(i * 1.9) * 0.6;
        m.position.set(x, this.world.surfaceAt(x, z) + 0.6 * (1 - h), z);
        m.visible = i < (p === 1 ? 14 : 9);
      });
      tarp.visible = p === 0 && t < 8;
      if (p === 0 && t < 7) this.crewAct = 'sit';
      if (p === 1 && t < 4) this.crewAct = 'run';
      void dt;
      return p < 0 || t < 8;
    };
  }

  /**
   * Un vieux pêcheur de l'île raccommode ses filets sur la rive. Le guide : il marche jusqu'à la barque et y monte avec
   * l'équipe. Le poisson séché : un panier posé à côté de l'équipe. Le saluer : il agite la main, l'équipe part sans lui
   */
  private stageIslander(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), [hx, hz] = this.boat?.home ?? [tx + 0.6, tz];
    const ox = tx + (tz - hz) * 0.2 + 0.25, oz = tz - (tx - hx) * 0.2 + 0.1;
    const old = this.sNpc(s, 'fisher', Math.max(0, a.age - 1), ox, oz, Math.atan2(tx - ox, tz - oz), 'work');
    const basket = this.sPut(s, sacksGeo(), tx + 0.15, tz - 0.12, 0);
    basket.visible = false;
    return (dt: number) => {
      const p = s.pick, t = s.after, o = old.folk.root;
      if (p === 0) {
        // il rejoint la barque
        const u = Math.min(1, t / 4), x = ox + (hx - ox) * u, z = oz + (hz - oz) * u;
        o.position.set(x, this.world.surfaceAt(x, z), z);
        o.rotation.y = Math.atan2(hx - ox, hz - oz);
        old.pose = u < 1 ? 'walk' : 'idle';
      } else if (p === 1) { basket.visible = t > 0.5; old.pose = 'talk'; }
      else if (p === 2) { old.pose = 'cheer'; if (t < 4) this.crewAct = 'stroll'; }
      void dt;
      return p < 0 || t < 7;
    };
  }

  /**
   * Le volcan gronde : des pierres roulent sur la pente, au-dessus de l'équipe ; un gros rocher à côté d'elle. S'abriter :
   * l'équipe recule contre le rocher et s'accroupit. Courir : elle file entre deux pierres qui dévalent jusqu'à elle
   */
  private stageTremor(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), [ux, uz] = this.uphill(tx, tz);
    const boulder = this.sPut(s, rocksGeo(), tx - uz * 0.4 - ux * 0.15, tz + ux * 0.4 - uz * 0.15, tx * 3);
    boulder.scale.setScalar(1.7);
    // deux grosses pierres qui roulent jusqu'au sentier (la course les voit passer au ras de l'équipe)
    const stones = [0, 1].map((i) => { const m = this.sPut(s, pebbleGeo(), tx + ux * 1.4 + uz * (i ? 0.3 : -0.3), tz + uz * 1.4 - ux * (i ? 0.3 : -0.3), i); m.scale.setScalar(2.2); return m; });
    let rt = 0;
    return (dt: number) => {
      const p = s.pick, t = s.after, shaking = p < 0 || t < 6;
      if (shaking && (rt -= dt) <= 0) {
        rt = 0.35;
        const j = (Math.random() - 0.5) * 0.9, sx = tx + ux * 1.2 + uz * j, sz = tz + uz * 1.2 - ux * j;
        this.rock(sx, this.world.surfaceAt(sx, sz) + 0.3, sz, -ux * 0.8, -uz * 0.8, 0.8 + Math.random() * 0.5);
      }
      if (p === 0 && t < 6) { this.isleBack = 0.25; this.crewAct = 'sit'; }
      if (p === 1 && t < 5) {
        this.crewAct = 'run';
        // les deux pierres dévalent, l'une derrière l'équipe, l'autre devant
        stones.forEach((m, i) => {
          const u = Math.min(1, t / (2 + i)), x = tx + ux * (1.4 - u * 2.4) + uz * (i ? 0.3 : -0.3), z = tz + uz * (1.4 - u * 2.4) - ux * (i ? 0.3 : -0.3);
          m.position.set(x, this.world.surfaceAt(x, z) + 0.04, z);
          m.rotation.x += dt * 6;
        });
      }
      return shaking;
    };
  }

  /**
   * Des fumées jaunes sortent d'une fissure près du sentier. Le linge mouillé : une jarre d'eau à côté de l'équipe, qui
   * reste à l'ouvrage dans la fumée. Attendre le vent : l'équipe s'assied, la fumée part de l'autre côté. Retenir son souffle :
   * l'équipe traverse en courant, la fumée s'épaissit
   */
  private stageFumes(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), [ux, uz] = this.uphill(tx, tz), cx = tx + ux * 0.35 + uz * 0.3, cz = tz + uz * 0.35 - ux * 0.3;
    const crack = this.sPut(s, new THREE.BoxGeometry(0.5, 0.012, 0.05), cx, cz, Math.atan2(uz, -ux));
    s.own.push(crack.geometry);
    const rim = new THREE.MeshBasicMaterial({ color: 0x5a1a10 });
    s.own.push(rim);
    (crack as THREE.Mesh).material = rim;
    const clouds = [0, 1, 2, 3].map((i) => { const m = this.sAdd(s, new THREE.Mesh(gasGeo(), mats.body)); m.scale.setScalar(2 + i * 0.6); return m; });
    const jar = this.sPut(s, new THREE.CylinderGeometry(0.035, 0.045, 0.09, 7), tx - ux * 0.25, tz - uz * 0.25, 0, 0.045);
    const clay = new THREE.MeshLambertMaterial({ color: 0xb86a3a });
    s.own.push(jar.geometry, clay);
    (jar as THREE.Mesh).material = clay;
    jar.visible = false;
    return (dt: number) => {
      const p = s.pick, t = s.after, drift = p === 1 ? Math.min(2.5, t * 0.35) : 0, thick = p === 2 ? 1 + Math.min(0.8, t * 0.2) : 1;
      clouds.forEach((m, i) => {
        const h = ((this.t * 0.25 + i * 0.25) % 1), x = cx - uz * drift + Math.sin(i * 2.1) * 0.15, z = cz + ux * drift + Math.cos(i * 1.7) * 0.15;
        m.position.set(x, this.world.surfaceAt(cx, cz) + 0.05 + h * 0.4, z);
        m.scale.setScalar((2 + i * 0.6) * thick * (1 - h * 0.3));
      });
      jar.visible = p === 0 && t < 10;
      if (p === 0 && t < 8) this.crewAct = 'work';
      if (p === 1 && t < 8) this.crewAct = 'sit';
      if (p === 2 && t < 5) this.crewAct = 'run';
      void dt;
      return p < 0 || t < 9;
    };
  }

  /**
   * Une langue de lave coupe le sentier de la plage, entre l'équipe et la mer. Les pierres : on en pose une à une sur la
   * coulée. Attendre : la lave noircit et se fige (une croûte sombre la recouvre). Sauter : l'équipe court et franchit d'un
   * élan, des étincelles jaillissent
   */
  private stageLavaflow(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), [lx, lz] = this.volc?.land ?? this.focus;
    const d = Math.max(0.01, Math.hypot(lx - tx, lz - tz)), bx = (lx - tx) / d, bz = (lz - tz) / d;
    // la coulée passe en travers du sentier, à une demi-case vers la plage
    const mx = tx + bx * 0.55, mz = tz + bz * 0.55, hot = new THREE.MeshBasicMaterial({ color: 0xff6a1e }), crust = new THREE.MeshLambertMaterial({ color: 0x2a2222 });
    s.own.push(hot, crust);
    const segs: THREE.Mesh[] = [], crusts: THREE.Mesh[] = [];
    for (let i = -3; i <= 3; i++) {
      const x = mx - bz * i * 0.16, z = mz + bx * i * 0.16, g = new THREE.BoxGeometry(0.1, 0.025, 0.2);
      s.own.push(g);
      const m = this.sAdd(s, new THREE.Mesh(g, hot)), c = this.sAdd(s, new THREE.Mesh(g, crust));
      for (const o of [m, c]) { o.position.set(x, this.world.surfaceAt(x, z) + 0.013, z); o.rotation.y = Math.atan2(-bz, bx); }
      c.visible = false;
      segs.push(m); crusts.push(c);
    }
    const stones = [-0.12, 0, 0.12].map((o) => { const m = this.sPut(s, pebbleGeo(), mx + bx * o, mz + bz * o, o * 9, 0.02); m.scale.setScalar(1.5); m.visible = false; return m; });
    let pt = 0;
    return (dt: number) => {
      const p = s.pick, t = s.after;
      segs.forEach((m, i) => { m.scale.y = 1 + 0.4 * Math.sin(this.t * 4 + i); m.visible = !(p === 1 && t > 1 + i * 0.6); crusts[i].visible = !m.visible; });
      stones.forEach((m, i) => (m.visible = p === 0 && t > 1 + i * 1.2));
      if (p === 0 && t < 6) this.crewAct = 'work';
      if (p === 1 && t < 8) this.crewAct = 'sit';
      if (p === 2 && t < 4) {
        this.crewAct = 'run';
        if ((pt -= dt) <= 0) { pt = 0.12; this.puffAt(mx + (Math.random() - 0.5) * 0.4, this.world.surfaceAt(mx, mz) + 0.05, mz + (Math.random() - 0.5) * 0.4, 'puff'); }
      }
      return a.phase === 'work' && (p < 0 || t < 10);
    };
  }

  /**
   * La flamme du relais vacille. La lanterne de secours : une lanterne rejoint le porteur, et la flamme repart, grande. Courir
   * plus vite : la flamme n'est plus qu'une lueur, le vent arrache des fumerolles derrière le porteur
   */
  private stageFlame(s: Staging, a: ActiveExpedition) {
    const lamp = this.sAdd(s, new THREE.Mesh(stakeTorchGeo(), mats.body)), f = this.sFlame(s, this.focus[0], this.focus[1], 0.9);
    lamp.visible = false;
    let pt = 0;
    return (dt: number) => {
      const p = s.pick, t = s.after, q = this.agents.partyPositions(a.party.slice(0, 1))[0], [x, z] = q ? [q[0], q[1]] : this.focus, y = this.world.surfaceAt(x, z);
      f.position.set(x, y + 0.26, z);
      f.scale.setScalar(p < 0 ? 0.5 + 0.3 * Math.sin(this.t * 23) : p === 0 ? Math.min(1.8, 0.5 + t * 0.5) : 0.25);
      if (p === 0) { lamp.visible = t < 4; const u = Math.min(1, t / 1.5); lamp.position.set(x + 0.4 * (1 - u), y, z + 0.1); lamp.scale.set(0.6, 0.6, 0.6); }
      if (p === 1 && (pt -= dt) <= 0) { pt = 0.1; this.puffAt(x, y + 0.25, z, 'smoke', 0.25, 0.05); }
      return p < 0 || t < 6;
    };
  }

  /**
   * Un record en vue : des spectateurs au bord de la piste. Encourager : ils crient et sautent tout du long. Faire silence : assis,
   * immobiles, ils retiennent leur souffle, et n'acclament qu'à la fin
   */
  private stageRecord(s: Staging, a: ActiveExpedition) {
    const g = this.games, [cx, cz] = g ? [g.cx, g.cz] : this.focus;
    const fans = [0, 1, 2, 3].map((i) => { const [x, z] = this.near(cx + 0.9 + (i % 2) * 0.18, cz + (i - 1.5) * 0.2, cx, cz); return this.sNpc(s, 'villager', a.age, x, z, Math.atan2(cx - x, cz - z), 'idle'); });
    return () => {
      const p = s.pick, t = s.after;
      fans.forEach((n) => (n.pose = p < 0 ? 'idle' : p === 0 ? 'cheer' : t > 5 ? 'cheer' : 'sit'));
      return p < 0 || t < 7;
    };
  }

  /**
   * Une épave sur la route du large : coque brisée (une barque retournée ; une grande coque démâtée pour la coque à la dérive).
   * Fouiller : le bateau va s'y ranger, s'y arrête, l'équipage s'y penche, et le trésor (lingots, coffre) passe à bord.
   * Charger les harpons : on passe à côté, harpons dressés, l'équipage debout face à l'eau. Relever son nom : le bateau en
   * fait lentement le tour, un parchemin à bord. Passer : il s'en écarte et file, l'équipage assis la regarde
   */
  private stageWreck(s: Staging, big: boolean) {
    const bt = this.boat;
    if (!bt) return () => false;
    const [hx, hz] = bt.home, [ox, oz] = bt.out, len = Math.max(0.01, Math.hypot(ox - hx, oz - hz)), ux = (ox - hx) / len, uz = (oz - hz) / len;
    // là où le bateau passera : sur sa route vers le large, un peu de côté (sur l'eau), à deux cases environ de la rive pour
    // qu'on la voie dès qu'elle est annoncée ; à défaut, à côté du bateau
    const [bx0, bz0] = this.boatBase();
    let spot: [number, number] | null = null;
    for (const k of [2, 1.6, 2.4, 1.2, 2.8].map((d) => Math.min(0.7, d / len))) for (const side of [1, -1]) {
      const x = hx + (ox - hx) * k - uz * side * 0.55, z = hz + (oz - hz) * k + ux * side * 0.55;
      if (!spot && this.depth(x, z) !== null && Math.hypot(x - bx0, z - bz0) > 0.8) spot = [x, z];
    }
    for (let i = 0; i < 8 && !spot; i++) { const x = bx0 + Math.cos(i * 0.8) * 1.2, z = bz0 + Math.sin(i * 0.8) * 1.2; if (this.depth(x, z) !== null) spot = [x, z]; }
    if (!spot) return () => false;
    const [wx, wz] = spot, lvl = bt.y;
    const wreck = new THREE.Group(), hull = new THREE.Mesh(boatGeo(big ? 'sail' : 'rowboat'), mats.body);
    hull.rotation.z = big ? 0.9 : 2.5; hull.position.y = big ? -0.02 : 0.05; hull.scale.setScalar(big ? 1.3 : 1.7);
    wreck.add(hull);
    if (big) { const mast = new THREE.Mesh(branchGeo(), mats.body); mast.rotation.z = 1.2; mast.scale.setScalar(1.6); mast.position.set(0.15, 0.02, 0.1); wreck.add(mast); }
    for (let i = 0; i < 3; i++) { const pl = new THREE.Mesh(branchGeo(), mats.body); pl.position.set(Math.cos(i * 2.3) * 0.3, 0, Math.sin(i * 2.3) * 0.25); pl.rotation.y = i; pl.scale.setScalar(0.7); wreck.add(pl); }
    this.sAdd(s, wreck);
    const loot = new THREE.Group();
    loot.add(new THREE.Mesh(ingotsGeo(), mats.body));
    if (big) { const c = new THREE.Mesh(chestGeo(), mats.body); c.position.set(0.07, 0, 0.02); loot.add(c); }
    loot.visible = false;
    this.sAdd(s, loot);
    const scroll = this.sAdd(s, new THREE.Mesh(scrollGeo(), mats.body));
    scroll.visible = false;
    const pikes = [0, 1].map(() => { const h = this.sAdd(s, new THREE.Mesh(harpoonGeo(), mats.body)); h.visible = false; return h; });
    let found = -1;
    const from = new THREE.Vector3();
    return (dt: number) => {
      wreck.position.set(wx, lvl - 0.005 + Math.sin(this.t * 1.5) * 0.008, wz);
      wreck.rotation.set(Math.sin(this.t * 1.1) * 0.06, 0.7 + this.t * 0.03, Math.sin(this.t * 0.9) * 0.08);
      if (s.pick < 0) return true;
      const [bx, bz] = this.boatBase(), bp = bt.obj.position, d = Math.hypot(bx - wx, bz - wz), toW = Math.atan2(wx - bp.x, wz - bp.z);
      // (le bateau ne vient jamais : au bout d'un moment, l'imprévu s'achève quand même)
      if (s.after > 30 || (found < 0 && s.after > 15)) return false;
      if (s.pick === 0 || (big && s.pick === 1)) {
        // il va se ranger contre l'épave dès qu'elle est à portée, puis s'y arrête le temps de la fouille (ou d'en faire le tour)
        if (found < 0 && d < 1.7) found = s.after;
        if (found < 0) return true;
        const k = s.after - found, stay = 6.5;
        if (k < stay) {
          this.moor = true;
          this.crewAct = 'work'; this.crewFace = toW;
          if (s.pick === 0) {
            this.steerTo(wx + (bx - wx) / Math.max(0.01, d) * 0.42, wz + (bz - wz) / Math.max(0.01, d) * 0.42);
            if (Math.random() < dt * 3) this.puffAt(wx + (Math.random() - 0.5) * 0.25, lvl + 0.06, wz + (Math.random() - 0.5) * 0.25);
          } else {
            // le tour de l'épave, lentement, pour relever son nom sur la poupe
            const ang = Math.atan2(bz - wz, bx - wx) + dt * 0.7;
            this.steerTo(wx + Math.cos(ang) * 0.7, wz + Math.sin(ang) * 0.7);
            scroll.visible = true;
            scroll.position.set(bp.x, bp.y + 0.22, bp.z);
            scroll.rotation.y = this.t * 0.8;
          }
        } else scroll.visible = false;
        // le trésor : il paraît sur l'épave, puis passe à bord
        if (s.pick === 0) {
          loot.visible = k > 2 && k < stay + 0.5;
          if (k <= 4) { from.set(wx, lvl + 0.07, wz); loot.position.copy(from); }
          else { const u = Math.min(1, (k - 4) / 1.5); loot.position.lerpVectors(from, new THREE.Vector3(bp.x, bp.y + 0.1, bp.z), u); loot.position.y += Math.sin(u * Math.PI) * 0.15; }
          loot.rotation.y = this.t * 0.6;
        }
        return k < stay + 1;
      }
      if (s.pick === 1) {
        // harpons dressés à bord, l'équipage debout face à l'eau, tant que l'épave est proche
        const near = d < 2.4 || s.after < 3;
        this.crewAct = near ? 'work' : null; this.crewFace = near ? toW + Math.PI / 2 : null;
        pikes.forEach((h, i) => {
          h.visible = near;
          const sd = i ? 1 : -1, hd = bt.obj.rotation.y;
          h.position.set(bp.x + Math.cos(hd) * sd * 0.06, bp.y + 0.12, bp.z - Math.sin(hd) * sd * 0.06);
          h.rotation.set(-Math.PI / 2 + 0.3, hd, 0);
        });
        return near || s.after < 6;
      }
      // passer au large : un écart loin de l'épave, l'équipage assis qui la regarde
      if (d < 2.2) { this.steerTo(bx + (bx - wx) / Math.max(0.01, d) * 0.7, bz + (bz - wz) / Math.max(0.01, d) * 0.7); this.crewAct = 'sit'; this.crewFace = toW; }
      return d < 2.2 || s.after < 4;
    };
  }

  /**
   * Les rapides : l'eau écume autour de la barque. La porter le long de la berge : elle sort de l'eau, portée à bout de bras.
   * Attendre : amarrée à un piquet de la berge, l'équipage assis, l'écume retombe. Les sauter : elle bondit de rocher en
   * rocher dans de grandes gerbes, à toutes rames
   */
  private stageRapids(s: Staging) {
    const bt = this.boat;
    if (!bt) return () => false;
    const [hx, hz] = bt.home, [ox, oz] = bt.out;
    const rocks = [0, 1, 2].map((i) => { const k = 0.3 + i * 0.3, x = hx + (ox - hx) * k + (i % 2 ? 0.25 : -0.25), z = hz + (oz - hz) * k; const r = this.sPut(s, rocksGeo(), x, z, i); r.scale.setScalar(0.45); r.position.y = bt.y - 0.03; return [x, z] as [number, number]; });
    const post = this.sPut(s, postGeo(), hx, hz, 0);
    post.visible = false;
    const rope = this.sRope(s);
    let pt = 0, hop = 0;
    return (dt: number) => {
      const p = s.pick, wild = p < 0 || s.after < (p === 2 ? 6 : p === 1 ? 5 : 3);
      this.rough = wild ? (p === 2 ? 1 : p === 1 ? 0.3 : 0.6) : Math.max(0, this.rough - dt * 0.3);
      if (wild && (pt -= dt) <= 0) { pt = 0.07; const k = Math.random(), x = hx + (ox - hx) * k + (Math.random() - 0.5) * 0.6, z = hz + (oz - hz) * k + (Math.random() - 0.5) * 0.6; if (this.depth(x, z) !== null) this.puffAt(x, bt.y + 0.01, z); }
      const bp = bt.obj.position;
      if (p === 0 && s.after < 6) {
        // portée hors de l'eau, à bout de bras, le long de la berge
        this.moor = true; this.crewAct = 'work';
        this.nudge.lift = Math.min(0.14, s.after * 0.1);
        this.steerTo(hx + (ox - hx) * 0.1, hz + (oz - hz) * 0.1);
      }
      if (p === 1) {
        const tied = s.after < 5.5;
        if (tied) { this.moor = true; this.crewAct = 'sit'; }
        post.visible = tied;
        rope(tied ? [[hx, hz], [bp.x, bp.z]] : [], 0.06);
      }
      if (p === 2 && s.after < 6) {
        this.rowing = true;
        this.nudge.lift = Math.abs(Math.sin(s.after * 4)) * 0.06;
        // une gerbe à chaque rocher frôlé
        if ((hop -= dt) <= 0) { hop = 0.7; const r = rocks[Math.floor(s.after / 0.7) % rocks.length]; this.splash(r[0], r[1], bt.y, true); }
      }
      return wild || this.rough > 0 || (p === 0 && s.after < 6.5);
    };
  }

  /** La rivière gonfle : l'eau monte sur la berge, le courant emporte des branches ; elle redescend une fois la décrue attendue */
  private stageFlood(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), wat = this.water ?? this.findWater(tx, tz);
    const [wx, wz] = wat ? wat.wet : [tx + 0.6, tz], [bx, bz] = wat ? wat.bank : [tx, tz], level = wat ? wat.level : this.world.surfaceAt(tx, tz);
    const cx = (wx + bx) / 2, cz = (wz + bz) / 2, r = Math.max(1, Math.hypot(wx - bx, wz - bz) + 0.8);
    const g = new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2), mat = new THREE.MeshLambertMaterial({ color: 0x6f98a4, transparent: true, opacity: 0.68, depthWrite: false });
    const sheet = this.sAdd(s, new THREE.Mesh(g, mat));
    s.own.push(g, mat);
    const dd = Math.max(0.01, Math.hypot(wx - bx, wz - bz)), ux = -(wz - bz) / dd, uz = (wx - bx) / dd;
    const logs = [0, 1, 2].map((i) => ({ o: this.sPut(s, branchGeo(), wx, wz, i), u: -r + i * r * 0.7, off: (i - 1) * 0.25 }));
    let rise = 0.05, boat: THREE.Object3D | null = null;
    return (dt: number) => {
      const high = s.pick < 0 || (s.pick === 2 ? s.after < 9 : s.after < 3);
      rise += high ? Math.min(0.13 - rise, dt * 0.05) : -Math.min(rise, dt * 0.012);
      sheet.position.set(cx, level - 0.03 + rise, cz);
      for (const l of logs) {
        l.u += dt * 0.28;
        if (l.u > r) l.u -= 2 * r;
        const x = wx + ux * l.u + (wx - bx) / dd * l.off, z = wz + uz * l.u + (wz - bz) / dd * l.off;
        l.o.position.set(x, sheet.position.y + 0.02, z);
        l.o.rotation.y += dt * 0.4;
        l.o.visible = Math.abs(l.u) < r * 0.85;
      }
      // en barque : elle traverse l'eau haute
      if (s.pick === 1 && !boat && wat) boat = this.sPut(s, boatGeo(this.boatKind), wx, wz, Math.atan2(ux, uz));
      if (boat) { const k = Math.min(1, s.after / 6); boat.position.set(wx + ux * (k - 0.5) * 1.6, sheet.position.y + 0.01, wz + uz * (k - 0.5) * 1.6); }
      return high || rise > 0.002;
    };
  }

  /**
   * Des pierres dévalent : du haut de la pente vers l'équipe (la corniche, l'éboulis), ou de la paroi au-dessus de l'entrée de la
   * galerie. Étayer pose des poutres à l'entrée ; s'encorder tend une corde d'un membre à l'autre
   */
  private stageRocks(s: Staging, a: ActiveExpedition, kind: 'ledge' | 'scree' | 'rockfall' | 'fail') {
    const [tx, tz] = this.teamAt(a), src: [number, number] = this.mouth ? this.mouth.at : this.kind === 'mine' && this.props[0] ? [this.props[0].position.x, this.props[0].position.z] : [tx, tz];
    const [ux, uz] = this.uphill(src[0], src[1]), rope = kind === 'fail' ? null : this.sRope(s);
    let rt = 0, propped = false;
    return (dt: number) => {
      const falling = kind === 'fail' ? s.t < 3.5 : s.pick < 0 || s.after < (s.pick === 2 ? 5 : 2.5);
      if (falling && (rt -= dt) <= 0) {
        rt = kind === 'ledge' ? 0.55 : kind === 'fail' ? 0.14 : 0.3;
        const j = (Math.random() - 0.5) * 0.9, sx = src[0] + ux * 1.1 + uz * j, sz = src[1] + uz * 1.1 - ux * j, sp = kind === 'ledge' ? 0.55 : 0.9;
        this.rock(sx, this.world.surfaceAt(sx, sz) + (this.mouth ? 0.6 : 0.35), sz, -ux * sp + (Math.random() - 0.5) * 0.3, -uz * sp + (Math.random() - 0.5) * 0.3, kind === 'ledge' ? 0.6 : 0.9 + Math.random() * 0.7);
      }
      // étayer : des poutres à l'entrée, qui restent jusqu'au départ
      if (kind === 'rockfall' && s.pick === 0 && !propped) {
        propped = true;
        const [x, z] = this.mouth ? this.mouth.at : src, face = this.mouth ? Math.atan2(this.mouth.heap[0] - x, this.mouth.heap[1] - z) : 0;
        this.sPut(s, proppingGeo(), x + Math.sin(face) * 0.08, z + Math.cos(face) * 0.08, face).scale.setScalar(1.3);
      }
      const roped = kind !== 'fail' && (kind === 'ledge' ? s.pick === 0 : s.pick === 1) && a.phase === 'work' && s.after < 25;
      rope?.(roped ? this.ropeOf(a) : []);
      return falling || roped || (propped && a.phase === 'work') || s.t < 1;
    };
  }

  /** Un éclat dans la roche : un rocher où brillent des cristaux. On le creuse (un tas de minerai), ou l'on y plante un jalon */
  private stageVein(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), [ux, uz] = this.uphill(tx, tz), [gx, gz] = this.near(tx + ux * 0.6 + uz * 0.3, tz + uz * 0.6 - ux * 0.3, tx, tz);
    const rock = this.sPut(s, glintGeo(), gx, gz, gx * 5), spark = this.sAdd(s, new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), STAR));
    s.own.push(spark.geometry);
    spark.position.set(gx + 0.03, rock.position.y + 0.21, gz);
    let sent = false, pile = false, flag = false, pt = 0;
    return (dt: number) => {
      spark.scale.setScalar(0.4 + Math.max(0, Math.sin(this.t * 4)) * 1.3);
      spark.rotation.y += dt * 3;
      if (s.pick === 0) {
        if (!sent && a.phase === 'work') { sent = true; this.sendTo(a, a.party[0], gx - ux * 0.18, gz - uz * 0.18, gx, gz, 8); }
        if (s.after < 6 && (pt -= dt) <= 0) { pt = 0.3; this.puffAt(gx, rock.position.y + 0.1, gz); }
        if (s.after > 6 && !pile) { pile = true; rock.visible = spark.visible = false; this.sPut(s, rocksGeo(), gx, gz, 0).scale.setScalar(0.6); }
      } else if (s.pick === 1 && !flag) { flag = true; this.sPut(s, stakeFlagGeo(), gx + 0.14, gz + 0.06, 0); }
      return a.phase === 'work';
    };
  }

  /** Les torches faiblissent : les flammes baissent ; les bonnes torches flambent haut, ou l'on ressort refaire des torches au feu */
  private stageDark(s: Staging, a: ActiveExpedition) {
    let fire = false, cairn = false, lt = 0;
    s.own.push({ dispose: () => { this.torchTo = 1; } });
    // elles baissent d'un coup (on le voit pendant que le jeu attend la décision)
    this.torchTo = 0.3;
    if (this.kindled) this.torchK = 0.3;
    return (dt: number) => {
      if (s.pick < 0) this.torchTo = 0.3;
      else if (s.pick === 0) this.torchTo = 1.6;
      else if (s.pick === 1) {
        // le courant d'air : il sort de la grotte en soufflant feuilles et poussière
        this.torchTo = s.after < 5 ? 0.3 : 1;
        // (sans bouche de grotte, devant une faille : il souffle depuis le point de travail vers le campement) ; un petit tas de
        // pierres marque la fente d'où il sort, celle qu'on va suivre
        const [mx, mz] = this.mouth?.at ?? this.focus;
        if (!cairn) { cairn = true; const [px, pz] = this.near(mx + 0.25, mz + 0.15, mx, mz); this.sPut(s, pebbleGeo(), px, pz, 0).scale.set(1.2, 0.8, 1.2); }
        if (s.after < 8 && (lt -= dt) <= 0) {
          lt = 0.12;
          const [hx, hz] = this.mouth?.heap ?? this.teamAt(a);
          this.leaf(mx, this.world.surfaceAt(mx, mz) + 0.12, mz, (hx - mx) * 0.6 || 0.3, (hz - mz) * 0.6);
        }
      } else {
        this.torchTo = s.after < 6 ? 0.15 : 1;
        if (!fire && this.mouth) { fire = true; const [hx, hz] = this.mouth.heap, [x, z] = this.near(hx + 0.22, hz + 0.1, hx, hz); this.sPut(s, fireGeo(), x, z, 0); this.sFlame(s, x, z, 0.8); }
      }
      return s.pick < 0 || (s.pick === 0 ? a.phase === 'work' : s.after < 10);
    };
  }
  /** Une feuille (ou de la poussière) emportée par le vent */
  private leaf(x: number, y: number, z: number, vx: number, vz: number) {
    const o = new THREE.Mesh(leafGeo(), mats.body);
    this.group.add(o);
    this.fx.push({ obj: o, t: 0, life: 1.8, kind: 'leaf', x, y, z, vx: vx + (Math.random() - 0.5) * 0.2, vz: vz + (Math.random() - 0.5) * 0.2 });
  }

  /** La nuée de chauves-souris : elles jaillissent de la grotte, tourbillonnent devant l'entrée, puis s'égaillent vers le ciel */
  private stageBats(s: Staging) {
    const [mx, mz] = this.mouth?.at ?? this.focus, y0 = this.world.surfaceAt(mx, mz) + 0.15, dir = this.mouth ? Math.atan2(this.mouth.heap[0] - mx, this.mouth.heap[1] - mz) : 0;
    const bats = Array.from({ length: 24 }, (_, i) => ({ m: this.sAdd(s, new THREE.Mesh(wingGeo(0x2a2228), mats.body)), a: i * 0.9, r: 0.18 + (i % 5) * 0.12, h: 0.1 + (i % 4) * 0.12, sp: 2.2 + (i % 3) * 0.6 }));
    return (dt: number) => {
      const away = s.pick >= 0 ? s.after * (s.pick === 1 ? 1.4 : 0.9) : Math.max(0, 1 - s.t) * -0.4;
      const cx = mx + Math.sin(dir) * (0.5 + away * 0.6), cz = mz + Math.cos(dir) * (0.5 + away * 0.6);
      for (const b of bats) {
        b.a += dt * b.sp;
        const r = b.r * (1 + Math.max(0, away) * 0.8), x = cx + Math.cos(b.a) * r, z = cz + Math.sin(b.a) * r;
        b.m.position.set(x, y0 + b.h + Math.max(0, away) * 0.7 + Math.sin(b.a * 2) * 0.05, z);
        b.m.rotation.y = Math.atan2(-Math.sin(b.a), Math.cos(b.a));
        b.m.scale.set(1, 0.4 + Math.abs(Math.sin(this.t * 22 + b.a)) * 1.2, 1);
      }
      return s.pick < 0 || s.after < 4;
    };
  }

  /** Le grisou : une fumée verdâtre sort de la grotte ; on éteint les lampes, ou l'on descend le canari dans sa cage */
  private stageFiredamp(s: Staging) {
    const [mx, mz] = this.mouth?.at ?? this.focus;
    let gt = 0, cage = false;
    s.own.push({ dispose: () => { this.torchTo = 1; } });
    return (dt: number) => {
      const gas = s.pick < 0 || s.after < (s.pick === 2 ? 8 : 5);
      if (gas && (gt -= dt) <= 0) { gt = 0.2; this.puffAt(mx + (Math.random() - 0.5) * 0.2, this.world.surfaceAt(mx, mz) + 0.08, mz + (Math.random() - 0.5) * 0.2, 'gas'); }
      if (s.pick === 0) this.torchTo = s.after < 8 ? 0 : 1;
      if (s.pick === 1 && !cage) { cage = true; const [hx, hz] = this.mouth?.heap ?? [mx, mz]; this.sPut(s, cageGeo(), (mx + hx) / 2 + 0.12, (mz + hz) / 2, 0); }
      return gas || (s.pick === 0 && s.after < 9) || (cage && s.after < 14);
    };
  }

  /** L'eau envahit la galerie : une flaque grandit à l'entrée ; on écope au seau, ou l'on creuse une rigole pour la vider */
  private stageSeep(s: Staging, a: ActiveExpedition) {
    const m = this.mouth;
    if (!m) return () => false;
    const [mx, mz] = m.at, [hx, hz] = m.heap, g = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), mat = new THREE.MeshLambertMaterial({ color: 0x5a8fb4, transparent: true, opacity: 0.75, depthWrite: false });
    const cx = mx + (hx - mx) * 0.3, cz = mz + (hz - mz) * 0.3, puddle = this.sAdd(s, new THREE.Mesh(g, mat));
    s.own.push(g, mat);
    puddle.position.set(cx, this.world.surfaceAt(cx, cz) + 0.015, cz);
    let r = 0.2, extra = false, dt0 = 0;
    return (dt: number) => {
      const target = s.pick < 0 ? 0.55 : s.pick === 2 ? (a.phase === 'work' ? 0.55 : 0) : s.after > 2 ? 0 : 0.55;
      r += (target - r) * Math.min(1, dt * (target > r ? 0.6 : s.pick === 1 ? 0.3 : 0.18));
      puddle.scale.set(Math.max(0.001, r), 1, Math.max(0.001, r * 0.8));
      if (r > 0.1 && (dt0 -= dt) <= 0) { dt0 = 0.25; const o = new THREE.Mesh(bubbleGeo(), mats.body); this.group.add(o); this.fx.push({ obj: o, t: 0, life: 0.6, kind: 'bubble', x: cx + (Math.random() - 0.5) * r, y: puddle.position.y, z: cz + (Math.random() - 0.5) * r, vx: 0, vz: 0 }); }
      // le seau, ou la rigole qui file vers le bas de la pente
      if (!extra && s.pick === 0) { extra = true; this.sPut(s, bucketGeo(), cx + 0.3, cz + 0.12, 0); }
      if (!extra && s.pick === 1) { extra = true; const f = Math.atan2(hx - mx, hz - mz); this.sPut(s, ditchGeo(), cx, cz, f, 0.004); }
      return s.pick < 0 || r > 0.02 || s.after < 3;
    };
  }

  /** Les étourneaux s'abattent sur les buissons : on les chasse, ils restent picorer, ou on leur laisse un buisson */
  private stageBirds(s: Staging, a: ActiveExpedition, fail: boolean) {
    const perches = this.spots.length ? this.spots : [this.focus];
    const birds = Array.from({ length: 14 }, (_, i) => ({ m: this.sAdd(s, new THREE.Mesh(wingGeo(0x3a3440), mats.body)), p: perches[i % perches.length], a: i * 1.3, ox: (Math.random() - 0.5) * 0.18, oz: (Math.random() - 0.5) * 0.18 }));
    return (dt: number) => {
      const off = fail ? 0 : s.pick === 0 ? 0.5 : s.pick === 1 ? 8 : Infinity, leave = fail || (s.pick >= 0 && s.after > off), fly = fail ? s.t : leave ? s.after - off : 0, land = fail ? 1 : Math.min(1, s.t / 2.5);
      for (const b of birds) {
        b.a += dt * 3;
        const p = s.pick === 2 ? perches[0] : b.p, gy = this.world.surfaceAt(p[0], p[1]);
        let x = p[0] + b.ox + Math.cos(b.a) * 0.7 * (1 - land), z = p[1] + b.oz + Math.sin(b.a) * 0.7 * (1 - land), y = gy + 0.2 + 1.2 * (1 - land) + Math.abs(Math.sin(this.t * 9 + b.a)) * 0.02 * land;
        if (leave) { x += Math.cos(b.a * 0.2) * fly * 1.2; z += Math.sin(b.a * 0.2) * fly * 1.2; y += fly * 1.1; }
        b.m.position.set(x, y, z);
        b.m.rotation.y = leave || land < 1 ? Math.atan2(-Math.sin(b.a), Math.cos(b.a)) : b.a;
        b.m.scale.set(1, leave || land < 1 ? 0.4 + Math.abs(Math.sin(this.t * 20 + b.a)) * 1.2 : 0.35, 1);
      }
      return leave ? fly < 3 : a.phase === 'work';
    };
  }

  /** L'essaim se réveille : un nuage d'abeilles autour de l'équipe ; la fumée l'endort, il se calme, ou il poursuit un membre */
  private stageSwarm(s: Staging, a: ActiveExpedition, fail: boolean) {
    const cloud = this.sAdd(s, new THREE.Group());
    for (let i = 0; i < 34; i++) {
      const ang = i * 2.39, r = 0.12 + (i % 5) * 0.08, b = new THREE.Mesh(ballGeo(0xf0c040), mats.body);
      b.scale.setScalar(0.75);
      b.position.set(Math.cos(ang) * r, 0.15 + Math.sin(i * 1.7) * 0.12, Math.sin(ang) * r);
      cloud.add(b);
    }
    const [tx, tz] = this.teamAt(a);
    cloud.position.set(tx, this.world.surfaceAt(tx, tz), tz);
    let pt = 0;
    return (dt: number) => {
      const calm = fail ? Math.max(0, s.t - 3) / 4 : s.pick === 0 ? s.after / 6 : s.pick === 1 ? s.after / 8 : s.pick === 2 ? Math.max(0, s.after - 3) / 4 : 0;
      const lead = this.agents.partyPositions(a.party)[0], chase = (fail || s.pick === 2) && lead;
      const [gx, gz] = chase ? [lead[0], lead[1]] : this.teamAt(a);
      cloud.position.x += (gx - cloud.position.x) * Math.min(1, dt * 2);
      cloud.position.z += (gz - cloud.position.z) * Math.min(1, dt * 2);
      cloud.position.y = this.world.surfaceAt(cloud.position.x, cloud.position.z);
      cloud.rotation.y += dt * (4 - Math.min(1, calm) * 3);
      cloud.scale.setScalar(Math.max(0.001, 1 - calm) * (1 + Math.sin(this.t * 7) * 0.08));
      // plus de fumée : un feu d'herbes humides qui fume fort
      if (s.pick === 0 && !fail && s.after < 6 && (pt -= dt) <= 0) { pt = 0.12; const [fx, fz] = this.focus; this.puffAt(fx + (Math.random() - 0.5) * 0.3, this.world.surfaceAt(fx, fz) + 0.1, fz + (Math.random() - 0.5) * 0.3, 'smoke'); }
      return calm < 1;
    };
  }

  /** Les cerfs descendent boire à la source ; on les regarde, ou ils détalent (une lance lancée, si l'on chasse) */
  private stageDeer(s: Staging, a: ActiveExpedition) {
    const [px, pz] = this.focus, a0 = Math.random() * Math.PI * 2;
    const herd = [0, 1, 2].map((i) => this.sBeast(s, 'deer', px + Math.sin(a0 + i * 0.4) * 1.6, pz + Math.cos(a0 + i * 0.4) * 1.6, i ? 0.9 : 1.15));
    let thrown = false, fetched = false;
    return (dt: number) => {
      const flee = s.pick === 1 || s.pick === 2 || (s.pick === 0 && s.after > 10), start = s.pick === 0 ? 10 : 0;
      herd.forEach((b, i) => {
        // la chasse : la lance touche le grand cerf, qui tombe sur le flanc ; un chasseur va le chercher
        if (s.pick === 1 && i === 0 && s.after > 0.5) { b.obj.rotation.z = Math.min(Math.PI / 2, (s.after - 0.5) * 3); if (!fetched) { fetched = true; this.sendTo(a, a.party[0], b.x + 0.15, b.z, b.x, b.z, 4); } return; }
        if (flee) { this.sFlee(b, px, pz, s.pick === 0 ? 0.5 : 1.6, dt); return; }
        // ils descendent boire au bord du bassin (par les roseaux et les pierres mouillées s'il le faut)
        const ang = a0 + (i - 1) * 0.5;
        this.sMove(b, px + Math.sin(ang) * 0.45, pz + Math.cos(ang) * 0.45, 0.45, dt, ['Idle_Eating', 'Eating'], true);
      });
      if (s.pick === 1 && !thrown) {
        thrown = true;
        const p = this.agents.partyPositions(a.party)[0], g = this.world.surfaceAt.bind(this.world);
        if (p) this.fire(new THREE.Vector3(p[0], g(p[0], p[1]) + 0.17, p[1]), new THREE.Vector3(herd[0].x, g(herd[0].x, herd[0].z) + 0.1, herd[0].z));
      }
      if (flee && s.after > start + 4) { for (const b of herd) b.obj.visible = false; return false; }
      return true;
    };
  }

  /** Une roue cassée : la roulotte des jongleurs penche, la roue est au sol ; une fois réparée, la roulotte se redresse */
  private stageWheel(s: Staging, a: ActiveExpedition) {
    const wg = this.wagon;
    if (!wg) return () => false;
    const [wx, wz] = [wg.position.x, wg.position.z], y0 = wg.position.y, wheel = this.sPut(s, wheelGeo(), wx + 0.24, wz + 0.2, 0.5);
    wg.rotation.order = 'YXZ';
    s.own.push({ dispose: () => { wg.rotation.x = 0; wg.position.y = y0; } });
    let sent = false;
    return (dt: number) => {
      const fixed = s.pick === 0 ? s.after > 6 : s.pick === 2 ? s.after > 9 : false;
      wg.rotation.x = fixed ? 0 : 0.2;
      wg.position.y = y0 - (fixed ? 0 : 0.03);
      wheel.visible = !fixed;
      if (s.pick === 0 && !sent && a.phase === 'work') { sent = true; a.party.forEach((id, i) => this.sendTo(a, id, wx + 0.18 + i * 0.12, wz + 0.26, wx, wz, 7)); }
      for (const g of this.guests) if (g.pose !== 'sit') g.pose = s.pick === 2 && !fixed ? 'work' : 'juggle';
      return fixed ? s.after < 11 : a.phase === 'work';
    };
  }

  /** La dégustation : trois chopes sur un tonnelet ; le frère lève la sienne (ou recopie sa recette) */
  private stageTasting(s: Staging, a: ActiveExpedition) {
    const mk = this.monk, [mx, mz] = mk ? [mk.folk.root.position.x, mk.folk.root.position.z] : this.focus;
    const [bx, bz] = this.near(mx - 0.18, mz + 0.2, mx, mz);
    this.sPut(s, mugsGeo(), bx, bz, 0);
    let scroll = false;
    return () => {
      if (mk) mk.pose = s.pick < 0 ? 'cheer' : s.pick === 2 && s.after < 6 ? 'work' : s.pick === 0 && s.after < 8 && Math.floor(this.t) % 2 ? 'cheer' : 'talk';
      if (s.pick === 2 && !scroll) { scroll = true; this.sPut(s, scrollGeo(), bx, bz, 0.4, 0.13); }
      if (s.pick === 0 && s.after < 8) this.agents.partyAct(a.party, Math.floor(s.after * 1.2) % 2 ? 'cheer' : 'sit');
      return a.phase === 'work';
    };
  }

  /** Un pneu crevé : la voiture penche dans un nuage de fumée, sa roue au sol ; repartie sur la jante, elle crache des étincelles */
  private stagePuncture(s: Staging) {
    const r = this.race;
    if (!r) return () => false;
    const car = r.obj, wheel = this.sPut(s, wheelGeo(), car.position.x + 0.16, car.position.z + 0.12, 0);
    s.own.push({ dispose: () => { car.rotation.z = 0; } });
    let pt = 0;
    return (dt: number) => {
      const flat = s.pick < 0 || s.after < (s.pick === 0 ? 6 : s.pick === 1 ? 2.5 : 1);
      car.rotation.z = flat ? 0.08 : 0;
      wheel.visible = flat && s.pick !== 2;
      if ((pt -= dt) <= 0) {
        pt = flat ? 0.25 : 0.06;
        const p = car.position;
        if (flat) this.puffAt(p.x, p.y + 0.06, p.z, 'smoke');
        else if (s.pick === 2) { const o = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.06), STAR); this.group.add(o); this.fx.push({ obj: o, t: 0, life: 0.4, kind: 'star', x: p.x, y: p.y + 0.06, z: p.z, vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6 }); }
      }
      return flat || (s.pick === 2 && s.after < 7);
    };
  }

  /** Le coup de vent : la montgolfière tangue et dérive, des feuilles filent dans le vent */
  private stageGust(s: Staging) {
    let lt = 0;
    return (dt: number) => {
      const target = s.pick < 0 ? 1 : s.pick === 0 ? (s.after < 2 ? 0.7 : 0) : s.pick === 1 ? (s.after < 4 ? 0.5 : 0) : s.after < 6 ? 1.3 : 0;
      this.gustK += (target - this.gustK) * Math.min(1, dt * 1.5);
      const b = this.balloon;
      if (b && target > 0 && (lt -= dt) <= 0) { lt = 0.1; const o = b.obj.position, d = b.drift; this.leaf(o.x - Math.sin(d) * 1.2 + (Math.random() - 0.5), o.y + Math.random() * 0.8, o.z - Math.cos(d) * 1.2 + (Math.random() - 0.5), Math.sin(d) * 1.6, Math.cos(d) * 1.6); }
      return target > 0 || this.gustK > 0.02;
    };
  }

  /** Les nuages cachent le ciel : plus d'étoiles filantes tant qu'ils sont là ; l'éclaircie venue, ils s'en vont */
  private stageClouds(s: Staging) {
    const [cx, cz] = this.focus, cl = [0, 1, 2].map((i) => this.sCloud(s, cx + (i - 1) * 1.3, cz + (i % 2) * 0.7, 2.3 + i * 0.2, true, 1.3));
    s.own.push({ dispose: () => { this.cloudy = false; } });
    let drift = 0;
    return (dt: number) => {
      const clear = s.pick === 0 ? s.after > 6 : s.pick === 1 ? s.after > 12 : false;
      // on observe entre deux nuages : les étoiles reviennent par moments
      this.cloudy = !clear && !(s.pick === 1 && Math.sin(this.t * 0.8) > 0.3);
      if (clear) drift += dt;
      cl.forEach((c, i) => { c.position.x += dt * (clear ? 0.4 + drift * 0.3 : Math.sin(this.t * 0.2 + i) * 0.05); });
      return drift < 5;
    };
  }

  /** Des vaches sur le tracé : elles broutent devant la tête de voie, puis s'écartent (au coup de sifflet, elles détalent) */
  private stageCows(s: Staging, a: ActiveExpedition) {
    const wk = this.works;
    if (!wk) return () => false;
    const laid = this.built.filter((o) => o.visible).length, head = laid * 0.3 + 0.6, sx = Math.sin(wk.dir), sz = Math.cos(wk.dir), px = Math.cos(wk.dir), pz = -Math.sin(wk.dir);
    const cows = [0, 1, 2].map((i) => this.sBeast(s, 'cow', wk.x + sx * (head + i * 0.35) + px * (i - 1) * 0.14, wk.z + sz * (head + i * 0.35) + pz * (i - 1) * 0.14));
    let sent = false, blew = false;
    return (dt: number) => {
      const go = s.pick === 0 ? s.after > 6 : s.pick >= 0;
      cows.forEach((c, i) => {
        if (!go) { this.sMove(c, c.x, c.z, 0, dt, ['Idle_Eating', 'Eating']); return; }
        const side = i % 2 ? 1 : -1;
        this.sMove(c, c.x + px * side * 2, c.z + pz * side * 2, s.pick === 2 ? 1.2 : 0.35, dt, ['Idle_Eating'], true);
      });
      // le sifflet de la locomotive : un grand panache de vapeur
      if (s.pick === 2 && !blew) { blew = true; const o = wk.train.position; for (let i = 0; i < 8; i++) this.puffAt(o.x + sx * 0.1, o.y + 0.3 + i * 0.02, o.z + sz * 0.1, 'smoke', (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3); }
      if (s.pick === 1 && !sent) { sent = true; this.sendTo(a, a.party[0], cows[0].x - px * 0.3, cows[0].z - pz * 0.3, cows[0].x, cows[0].z, 6); }
      return !go || s.after < (s.pick === 0 ? 13 : 7);
    };
  }

  /** Vents violents au cosmodrome : de gros nuages noirs filent au-dessus du pas de tir ; on attend qu'ils passent, ou l'on part dessous */
  private stageWinds(s: Staging, a: ActiveExpedition) {
    const r = this.rocket, [px, pz] = r ? [r.x, r.z] : this.focus, H = r ? ROCKET_H[r.kind] : 2;
    const cl = [0, 1, 2, 3].map((i) => this.sCloud(s, px - 3 + i * 1.6, pz + (i % 2 ? 1 : -0.7), H + 1.2 + (i % 2) * 0.5, false, 2.2));
    return (dt: number) => {
      // attendre : les nuages filent ; corriger la trajectoire : ils s'écartent de part et d'autre de la fusée ; passer en force :
      // ils restent, et la fusée tremble sur son pas de tir
      const pass = s.pick === 0 && s.after > 2;
      cl.forEach((c, i) => { c.position.x += dt * (pass ? 1.4 : 0.3); if (s.pick === 1 && s.after < 4) c.position.z += dt * (i % 2 ? 0.5 : -0.5); });
      if (s.pick === 2 && s.after < 5 && r) { r.obj.position.x = r.x + Math.sin(this.t * 40) * 0.01; if (Math.random() < dt * 6) this.puffAt(r.x + (Math.random() - 0.5) * 0.3, r.y0 + 0.05, r.z + (Math.random() - 0.5) * 0.3, 'smoke'); } else if (r && s.pick === 2) r.obj.position.x = r.x;
      return s.pick < 0 || (pass ? s.after < 8 : a.phase === 'work' && s.after < 14);
    };
  }

  /** Un voyant rouge clignote au pied de la fusée ; la panne trouvée, il passe au vert */
  private stageAlarm(s: Staging) {
    const r = this.rocket, x = r ? r.x + ROCKET_R[r.kind] + 0.35 : this.focus[0], z = r ? r.z + 0.2 : this.focus[1];
    this.sPut(s, stakeTorchGeo(), x, z, 0).scale.set(1, 1.4, 1);
    const lamp = this.sAdd(s, new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), RED));
    s.own.push(lamp.geometry);
    lamp.position.set(x, this.world.surfaceAt(x, z) + 0.37, z);
    return () => {
      const okT = s.pick === 0 ? 7 : s.pick === 1 ? 3 : Infinity, fixed = s.pick >= 0 && s.after > okT;
      lamp.material = fixed ? GREEN : RED;
      lamp.visible = fixed || Math.sin(this.t * 10) > -0.2;
      lamp.scale.setScalar(fixed ? 1 : 1 + Math.max(0, Math.sin(this.t * 10)) * 0.5);
      return fixed ? s.after < okT + 3 : s.pick < 0 || s.after < 14;
    };
  }

  /**
   * Le vieux mâle charge : trompe levée, il barrit face aux chasseurs (des rochers tout près d'eux). La décision prise, il
   * fonce : les chasseurs se sont jetés derrière les rochers (il passe en trombe là où ils se tenaient), l'attendent serrés,
   * lances pointées (il pile net devant eux), ou tiennent bon (il les frôle) ; puis il fait demi-tour, au pas
   */
  private stageTusks(s: Staging, a: ActiveExpedition) {
    const m = this.mam?.old;
    if (!m || !m.b.obj.visible) return () => false;
    const b = m.b, [tx, tz] = this.teamAt(a), d0 = Math.max(0.3, Math.hypot(tx - b.x, tz - b.z)), ux = (tx - b.x) / d0, uz = (tz - b.z) / d0, x0 = b.x, z0 = b.z;
    const [rx, rz] = this.near(tx - uz * 0.5 + ux * 0.15, tz + ux * 0.5 + uz * 0.15, tx, tz);
    this.sPut(s, rocksGeo(), rx, rz, 0.7).scale.setScalar(1.8);
    // l'abri : derrière les rochers, vus du vieux mâle
    const rd = Math.max(0.3, Math.hypot(rx - x0, rz - z0)), hx = rx + ((rx - x0) / rd) * 0.28, hz = rz + ((rz - z0) / rd) * 0.28;
    b.held = true;
    this.sFace(b, tx, tz);
    s.own.push({ dispose: () => { b.held = false; } });
    // où il fonce : à travers la place qu'on a quittée, jusque devant le hérisson, ou en frôlant ceux qui tiennent bon
    const goal = (p: number): [number, number] => (p === 0 ? [tx + ux * 0.6, tz + uz * 0.6] : p === 1 ? [tx - ux * 0.5, tz - uz * 0.5] : [tx + ux * 0.5 - uz * 0.26, tz + uz * 0.5 + ux * 0.26]);
    let sent = false;
    return (dt: number) => {
      if (s.pick < 0) { m.trumpet = 1; this.sMove(b, b.x, b.z, 0, dt); return true; }
      if (!sent && a.phase === 'work') {
        sent = true;
        a.party.forEach((id, i) => {
          if (s.pick === 0) this.sendTo(a, id, hx + (i - 1) * 0.1 * uz, hz - (i - 1) * 0.1 * ux, rx, rz, 6);
          else if (s.pick === 1) { const ang = Math.atan2(-ux, -uz) + (i - (a.party.length - 1) / 2) * 0.5; this.sendTo(a, id, tx + Math.sin(ang) * 0.16, tz + Math.cos(ang) * 0.16, b.x, b.z, 6); }
        });
      }
      if (s.after < 0.7) { m.trumpet = 1; this.sMove(b, b.x, b.z, 0, dt); return true; }
      if (s.after < 4.5) {
        const [gx, gz] = goal(s.pick);
        if (this.sMove(b, gx, gz, 1.1, dt, [], true) && Math.random() < dt * 12) this.puffAt(b.x, this.world.surfaceAt(b.x, b.z) + 0.02, b.z);
        return true;
      }
      // demi-tour : il rejoint la harde, au pas, et l'imprévu le rend à la chasse
      if (s.after < 10 && this.sMove(b, x0, z0, 0.3, dt, [], true)) return true;
      b.held = false;
      return false;
    };
  }

  /**
   * La tempête de neige : les flocons tombent dru, une brume blanche avale le paysage et la harde. À l'abri, l'équipe se serre
   * autour du feu du camp, et la tempête passe ; si l'on suit les traces, elle dure encore un peu. À l'échec, la harde s'y
   * évanouit
   */
  private stageBlizzard(s: Staging, a: ActiveExpedition, fail: boolean) {
    const [tx, tz] = this.teamAt(a), cx = (tx + this.focus[0]) / 2, cz = (tz + this.focus[1]) / 2, [fx, fz] = a.dest;
    const snow = this.sSnow(s, cx, cz, 3, 2.4), fog = this.sFog(s, cx, cz, 2.6), gloom = this.sGloom(s, cx, cz, 3.4);
    if (fail) for (const m of this.mammoths) m.b.flee ??= Math.atan2(m.b.x - tx, m.b.z - tz);
    let k = 0.8, sent = false;
    return (dt: number) => {
      const thick = fail ? s.t < 9 : s.pick < 0 || (s.pick === 0 ? s.after < 8 : a.phase === 'work' && s.after < 14);
      k = thick ? Math.min(1, k + dt * 0.6) : k - dt * 0.25;
      const kk = Math.max(0, k);
      snow(dt, kk); fog(dt, kk * 0.9); gloom(kk * 0.35);
      // à l'abri : tout le monde se serre autour du feu du camp, assis sous les peaux
      if (s.pick === 0 && a.phase === 'work') {
        if (!sent) { sent = true; a.party.forEach((id, i) => { const ang = (i / a.party.length) * Math.PI * 2; this.sendTo(a, id, fx + Math.sin(ang) * 0.24, fz + Math.cos(ang) * 0.24, fx, fz, 8); }); }
        if (s.after > 2 && s.after < 8) this.agents.partyAct(a.party, 'sit');
      }
      return k > 0;
    };
  }

  // ---------------- Les échecs, joués au départ de l'équipe ----------------
  /** La pirogue chavire dans les rapides : elle se retourne dans une gerbe d'écume, et reste à flotter là, la quille en l'air */
  private stageCapsize(s: Staging) {
    const bt = this.boat;
    if (!bt) return () => false;
    return (dt: number) => {
      const k = smooth(Math.min(1, s.t / 1.2)), o = bt.obj;
      o.rotation.z = k * Math.PI * 0.95;
      o.position.y = bt.y - k * 0.03 + Math.sin(this.t * 2) * 0.005;
      if (s.t < 1.6 && Math.random() < dt * 14) this.puffAt(o.position.x + (Math.random() - 0.5) * 0.3, bt.y + 0.01, o.position.z + (Math.random() - 0.5) * 0.3);
      return s.t < 2;
    };
  }

  /** La harde s'enfuit au galop, de tous côtés */
  private stageScatter(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a);
    for (const b of this.beasts) b.flee = Math.atan2(b.x - tx, b.z - tz) + (Math.random() - 0.5) * 0.6;
    return () => s.t < 1;
  }

  /** Une bête charge l'équipe (le sanglier qui force l'enclos, l'aurochs), puis s'en va */
  private stageCharge(s: Staging, a: ActiveExpedition) {
    const [tx, tz] = this.teamAt(a), b = [...this.beasts].sort((p, q) => Math.hypot(p.x - tx, p.z - tz) - Math.hypot(q.x - tx, q.z - tz))[0];
    if (!b) return () => false;
    b.held = true;
    return (dt: number) => {
      if (s.t < 1.4) this.sMove(b, tx, tz, 1.7, dt, ['Headbutt', 'Idle'], true);
      else if (s.t < 2) this.sMove(b, b.x, b.z, 0, dt, ['Headbutt']);
      else { b.held = false; b.flee = Math.atan2(b.x - tx, b.z - tz); return false; }
      return true;
    };
  }

  /** Le coup de grisou : une flamme jaillit de la grotte dans un nuage de fumée noire */
  private stageBlast(s: Staging) {
    const [mx, mz] = this.mouth?.at ?? this.focus, y = this.world.surfaceAt(mx, mz);
    const f = this.sFlame(s, mx, mz, 3.5);
    for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; this.puffAt(mx, y + 0.1 + (i % 3) * 0.05, mz, 'smoke', Math.cos(ang) * 0.35, Math.sin(ang) * 0.35); }
    this.torchTo = 0;
    return () => { f.scale.multiplyScalar(0.94); return s.t < 1.5; };
  }

  /** Les jongleurs s'en vont sur la route, leur roulotte avec eux */
  private stageGone(s: Staging) {
    const walkers = [...this.guests], wg = this.wagon, ang = wg ? Math.atan2(wg.position.x - this.focus[0], wg.position.z - this.focus[1]) : 0;
    for (const j of this.jugglers) for (const b of j.balls) b.visible = false;
    this.jugglers = [];
    return (dt: number) => {
      const step = dt * 0.35, dx = Math.sin(ang) * step, dz = Math.cos(ang) * step;
      for (const g of walkers) { const o = g.folk.root; o.position.x += dx; o.position.z += dz; o.position.y = this.world.surfaceAt(o.position.x, o.position.z); o.rotation.y = ang; g.pose = 'walk'; }
      if (wg) { wg.position.x += dx; wg.position.z += dz; wg.position.y = this.world.surfaceAt(wg.position.x, wg.position.z); }
      return s.t < 20;
    };
  }

  /** Les torches de fortune des explorateurs : une flamme au poing de chacun (ceux qui ont emporté une vraie torche la tiennent déjà) */
  private stepTorches(dt: number, a: ActiveExpedition) {
    if (!this.lit) return;
    // allumées dès l'arrivée, sur place seulement (l'imprévu les fait baisser ou flamber) ; on les éteint en repartant
    if (a.phase === 'work' && !this.kindled) { this.kindled = true; this.torchK = this.torchTo; }
    const to = a.phase === 'work' ? this.torchTo : 0;
    this.torchK += Math.sign(to - this.torchK) * Math.min(Math.abs(to - this.torchK), dt * 0.9);
    const real = (a.gear.torch ?? 0) + (a.gear.lamp ?? 0);
    a.party.forEach((id, i) => {
      if (a.party.length - 1 - i < real) return;
      const p = this.agents.partyPositions([id])[0];
      let t = this.torches.get(id);
      if (!t) {
        t = new THREE.Group();
        t.add(new THREE.Mesh(handTorchGeo(), mats.body));
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 5).translate(0, 0.025, 0), FLAME);
        f.add(new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.03, 5).translate(0, 0.015, 0), FLAME_IN));
        f.position.y = 0.075;
        t.add(f);
        this.group.add(t); this.props.push(t); this.torches.set(id, t);
      }
      t.visible = !!p && this.torchK > 0.02;
      if (!p) return;
      const [x, z, h] = p, fl = this.torchK * (1 + Math.sin(this.t * 19 + id) * 0.15);
      t.position.set(x + Math.cos(h) * 0.055 + Math.sin(h) * 0.03, this.world.surfaceAt(x, z) + 0.1, z - Math.sin(h) * 0.055 + Math.cos(h) * 0.03);
      t.children[1].scale.set(Math.max(0.001, fl), Math.max(0.001, fl * (1.1 + Math.sin(this.t * 13 + id) * 0.2)), Math.max(0.001, fl));
      // une torche qui s'éteint fume un peu
      if (to < 0.05 && this.torchK > 0.1 && Math.random() < dt * 4) this.puffAt(t.position.x, t.position.y + 0.1, t.position.z, 'smoke');
    });
  }

  // ---------------- L'équipe repartie, le décor s'efface ----------------
  /** L'équipe est assez loin : le décor rétrécit en s'enfonçant un peu, puis disparaît (voir `gone`) */
  leave() {
    if (this.fade >= 0) return;
    this.fade = 0;
    const all = new Set<THREE.Object3D>([...this.props, ...this.npcs.map((n) => n.folk.root), ...this.beasts.map((b) => b.obj), ...this.dogs.map((b) => b.obj), ...this.stagings.flatMap((s) => s.objs), ...this.fx.map((f) => f.obj), ...this.darts.map((d) => d.obj)]);
    this.fadeObjs = [];
    for (const o of all) { if (o.userData.flat) o.visible = false; else { o.userData.s0 = o.scale.clone(); this.fadeObjs.push({ o, y: o.position.y }); } }
  }
  /** Le décor a fini de s'effacer : on peut le ranger */
  get gone() { return this.fade >= FADE; }
  private stepFade(dt: number) {
    this.fade += dt;
    const k = smooth(Math.min(1, this.fade / FADE));
    for (const f of this.fadeObjs) { f.o.scale.copy(f.o.userData.s0).multiplyScalar(Math.max(0.001, 1 - k)); f.o.position.y = f.y - k * 0.08; }
  }

  // ---------------- Mise en place ----------------
  private free(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    return w.inCells(cx, cz) && !w.occ[w.ci(cx, cz)] && !w.isWet(cx, cz) && !w.decor[w.ci(cx, cz)];
  }

  /** Le point voulu s'il est libre, sinon un point libre plus près du centre */
  /** Direction (unitaire) où le terrain monte le plus autour d'un point : vers la paroi ou le haut de la pente */
  private uphill(cx: number, cz: number): [number, number] {
    let best = -Infinity, dir: [number, number] = [1, 0];
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
      const up = this.world.hAt(cx + dx * 1.2, cz + dz * 1.2) + this.world.hAt(cx + dx * 2.2, cz + dz * 2.2) * 0.5;
      if (up > best) { best = up; dir = [dx, dz]; }
    }
    return dir;
  }

  /** Le centre de la clairière la plus proche (hors forêt, hors de tout) : un cercle de rayon `ring` y tient dégagé */
  private clearing(cx: number, cz: number, ring: number): [number, number] {
    const w = this.world, open = (x: number, z: number) => this.free(x, z) && w.veg[w.ci(Math.floor(x), Math.floor(z))] !== VEG_FOREST;
    let best: [number, number] = [cx, cz], score = -Infinity;
    for (let r = 0; r <= 2.5; r += 0.5) for (let j = 0; j < (r ? 8 : 1); j++) {
      const px = cx + Math.cos(j * 0.785) * r, pz = cz + Math.sin(j * 0.785) * r;
      let m = (open(px, pz) ? 2 : 0) - r * 0.6;
      for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; if (open(px + Math.cos(ang) * ring, pz + Math.sin(ang) * ring)) m++; }
      if (m > score) { score = m; best = [px, pz]; }
    }
    return best;
  }

  /** Le point libre le plus haut entre `min` et `r` de (cx, cz) : le sommet où planter le drapeau */
  private peak(cx: number, cz: number, r: number, min: number): [number, number] {
    let best: [number, number] = this.near(cx + min, cz, cx, cz), h = -Infinity;
    for (let dz = -r; dz <= r; dz += 0.25) for (let dx = -r; dx <= r; dx += 0.25) {
      const d = Math.hypot(dx, dz), x = cx + dx, z = cz + dz;
      if (d > r || d < min || !this.free(x, z)) continue;
      const y = this.world.hAt(x, z) - d * 0.03;
      if (y > h) { h = y; best = [x, z]; }
    }
    return best;
  }

  private near(x: number, z: number, cx: number, cz: number): [number, number] {
    for (let k = 1; k >= 0; k -= 0.25) { const px = cx + (x - cx) * k, pz = cz + (z - cz) * k; if (this.free(px, pz)) return [px, pz]; }
    return [cx, cz];
  }

  /** Le sol sous un disque de rayon `r` en (x, z) : sa hauteur la plus basse et la plus haute */
  private relief(x: number, z: number, r: number): [number, number] {
    let lo = Infinity, hi = -Infinity;
    // (assez de points pour ne pas manquer une bosse entre deux : le bassin n'y serait plus tout à fait au-dessus du sol)
    for (const [rr, n] of [[0, 1], [r * 0.35, 8], [r * 0.7, 16], [r, 24]] as [number, number][])
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, h = this.world.surfaceAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
    return [lo, hi];
  }

  /**
   * Le point le plus plat près de (cx, cz) où un disque de rayon `r` tient tout entier sur la terre ferme, hors de tout (le
   * plus proche, à pente égale) ; à défaut, le point libre le plus proche
   */
  private flatSpot(cx: number, cz: number, r: number): [number, number] {
    let best: [number, number] | null = null, bs = Infinity;
    for (let dz = -1.5; dz <= 1.5; dz += 0.25)
      for (let dx = -1.5; dx <= 1.5; dx += 0.25) {
        const x = cx + dx, z = cz + dz, d = Math.hypot(dx, dz);
        if (d > 1.5 || !this.free(x, z)) continue;
        let ok = true, trees = 0;
        for (let i = 0; i < 8 && ok; i++) {
          const px = x + Math.cos(i * 0.785) * r, pz = z + Math.sin(i * 0.785) * r;
          ok = this.free(px, pz);
          // (pas sous les arbres, s'il y a mieux)
          if (this.world.veg[this.world.ci(Math.floor(px), Math.floor(pz))] === VEG_FOREST) trees++;
        }
        if (!ok) continue;
        const [lo, hi] = this.relief(x, z, r), s = hi - lo + d * 0.02 + trees * 0.1;
        if (s < bs) { bs = s; best = [x, z]; }
      }
    return best ?? this.near(cx, cz, cx, cz);
  }

  private put(g: THREE.BufferGeometry, x: number, z: number, ry: number) {
    const m = new THREE.Mesh(g, mats.body);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(x, this.world.surfaceAt(x, z), z);
    m.rotation.y = ry;
    this.group.add(m);
    this.props.push(m);
    return m;
  }

  /** Tente et feu de camp ; l'équipe s'assied autour */
  private camp(cx: number, cz: number) {
    const [tx, tz] = this.near(cx + 0.7, cz - 0.35, cx, cz);
    this.put(tentGeo(), tx, tz, Math.atan2(cx - tx, cz - tz) + Math.PI / 2);
    const fire = this.put(fireGeo(), cx, cz, 0);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 5).translate(0, 0.065, 0), FLAME);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 5).translate(0, 0.04, 0), FLAME_IN);
    this.flame.add(inner);
    this.flame.position.y = 0.015;
    fire.add(this.flame);
  }

  private addBeast(k: HerdKind | 'wolf', cx: number, cz: number, r: number, ang: number) {
    const [name, len] = ANIMAL[k];
    const actor = k === 'wolf' ? wolfActor(len, cx + cz) : hasModel(name) ? makeActor(name, len) : null;
    const obj: THREE.Object3D = actor ? actor.root : new THREE.Mesh(new THREE.IcosahedronGeometry(len * 0.5, 0), mats.body);
    if (actor) actor.mixer.setTime(ang);
    const [x, z] = this.near(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, cx, cz);
    this.group.add(obj);
    this.beasts.push({ obj, actor, x, z, tx: x, tz: z, heading: ang, wait: 1 + ang, speed: k === 'wolf' ? 0.55 : 0.16, kind: k });
  }

  /** L'eau la plus proche : un point assez profond pour une barque, et le dernier point sec avant lui */
  private findWater(cx: number, cz: number) {
    const w = this.world;
    let best: { wet: [number, number]; bank: [number, number]; level: number } | null = null, bd = 1e9;
    for (let dz = -3.5; dz <= 3.5; dz += 0.25)
      for (let dx = -3.5; dx <= 3.5; dx += 0.25) {
        const x = cx + dx, z = cz + dz, d = Math.hypot(dx, dz), level = this.depth(x, z);
        if (level === null || d >= bd) continue;
        // dernier point sec sur la ligne du centre à l'eau
        let bank: [number, number] = [cx, cz];
        for (let k = 0; k <= 1; k += 0.05) { const px = cx + dx * k, pz = cz + dz * k; if (this.depth(px, pz) === null && this.free(px, pz)) bank = [px, pz]; else if (k > 0.2) break; }
        bd = d; best = { wet: [x, z], bank, level };
      }
    return best;
  }

  /** Niveau de l'eau en (x, z) s'il y a assez de fond pour une barque, sinon null */
  private depth(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    if (!w.inCells(cx, cz)) return null;
    const k = w.ci(cx, cz), level = w.lake[k] ? w.lakeLevel[k] : SEA;
    if (!w.lake[k] && !w.isWet(cx, cz)) return null;
    return level - w.hAt(x, z) > 0.07 ? level : null;
  }

  /** Points de berge, face à l'eau, pour les pêcheurs à la ligne */
  private bankSpots(n: number) {
    const wat = this.water!, out: [number, number][] = [];
    const [bx, bz] = wat.bank, [wx, wz] = wat.wet, ang = Math.atan2(wz - bz, wx - bx);
    for (let i = 0; i < n * 3 && out.length < n; i++) {
      const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.32, x = bx - Math.sin(ang) * off, z = bz + Math.cos(ang) * off;
      if (this.free(x, z)) out.push([x, z]);
    }
    return out.length ? out : [wat.bank];
  }

  /** La barque, amarrée au bord de l'eau ; deux membres y montent, les autres pêchent depuis la berge */
  private launch(a: ActiveExpedition) {
    const wat = this.water!;
    let [wx, wz] = wat.wet;
    const [bx, bz] = wat.bank;
    const dx = wx - bx, dz = wz - bz, d = Math.max(0.01, Math.hypot(dx, dz));
    let out: [number, number] = [wx, wz];
    for (let k = 0.4; k <= 2; k += 0.2) { const x = wx + (dx / d) * k, z = wz + (dz / d) * k; if (this.depth(x, z) === null) break; out = [x, z]; }
    // la chasse au monstre : en haute mer (reliée au large, pas un étang ni une mer intérieure), au plus proche point dégagé de
    // tout (aucune rive ni rocher dans le rayon du combat et de la caméra), atteint tout droit depuis le mouillage ; celui-là
    // même qu'a trouvé l'expédition (voir `offing`)
    const war = this.story === 'megalodon' || this.story === 'kraken';
    if (this.offshore && war) {
      const sea = openWater(this.world), room = seaRoomMap(sea), [cx, cz] = a.dest;
      const o = huntSpot(this.world, cx, cz, sea, room);
      if (o) { [wx, wz] = o.moor; out = o.at; wat.level = SEA; }
      else { const at = this.openSpot(wx, wz); if (at) out = at; }
    }
    // l'île du portail : tout droit jusqu'à sa plage, au plus près du portail (le dernier point d'eau avant la terre de l'île)
    else if (this.story === 'portal' && this.world.portal) {
      const p = this.world.portal, dx = p.x - wx, dz = p.z - wz, L = Math.max(0.01, Math.hypot(dx, dz));
      let land: [number, number] = [p.x, p.z];
      for (let k = 0.5; k < L; k += 0.25) {
        const x = wx + (dx / L) * k, z = wz + (dz / L) * k;
        if (this.depth(x, z) === null && this.world.onPortalIsland(Math.floor(x), Math.floor(z))) { land = [x + (dx / L) * 0.4, z + (dz / L) * 0.4]; break; }
        out = [x, z];
      }
      this.isle = { land, gate: [p.x, p.z] };
    }
    // les éclaireurs : une route sur l'eau jusqu'à la plage de l'île rivale (voir `scoutTrip`)
    // le volcan : tout droit vers lui jusqu'à la plage de son île (le dernier point d'eau avant sa terre)
    else if (VOLCANIC.has(this.story) && this.volcanoSite(a, [wx, wz])) {
      const [lx, lz] = this.isle!.land;
      out = [lx, lz];
      const dx = lx - wx, dz = lz - wz, L = Math.max(0.01, Math.hypot(dx, dz));
      for (let k = 0.25; k < L; k += 0.25) { const x = wx + (dx / L) * k, z = wz + (dz / L) * k; if (this.depth(x, z) === null) break; out = [x, z]; }
    }
    else if (this.story === 'scout' && this.scoutTrip(a, wx, wz)) out = this.scout!.route[this.scout!.route.length - 1];
    // les pourparlers de la paix : une route sur l'eau jusqu'aux îles, et retour (voir `tripSetup`)
    else if (PEACE_TRIPS.has(a.m.id) && this.tripSetup(a, wx, wz)) out = this.scout!.route[this.scout!.route.length - 1];
    // au large : le plus long trajet tout droit sur l'eau profonde, dans toutes les directions (la rive vers le large d'abord)
    else if (this.offshore) {
      let best = 0;
      for (let d = 0; d < 16; d++) {
        const ux = Math.cos((d * Math.PI) / 8), uz = Math.sin((d * Math.PI) / 8);
        let run = 0;
        for (let k = 0.5; k <= 12; k += 0.5) { if (this.depth(wx + ux * k, wz + uz * k) === null) break; run = k; }
        const score = run + Math.max(0, ux * (dx / d) + uz * (dz / d)) * 1.5;
        if (score > best) { best = score; out = [wx + ux * run, wz + uz * run]; }
      }
    }
    const hullOf = () => {
      const obj = new THREE.Group(), hull = new THREE.Mesh(boatGeo(this.boatKind), mats.body);
      hull.castShadow = true;
      obj.add(hull);
      // la chasse armée : des galères plus grandes
      obj.scale.setScalar(war ? 1.1 : 1);
      this.group.add(obj);
      this.props.push(obj);
      return obj;
    };
    const obj = hullOf();
    // la chasse armée : toute la troupe embarque, sur deux galères (`riders` : tout l'équipage ; la seconde a sa moitié) ;
    // l'équipe du portail aussi, sur une seule
    // (au galion englouti, tout l'équipage est à bord de la gabare de relevage)
    const riders = a.party.slice(0, war || this.isle || this.scout || this.story === 'isles' || (this.story === 'wreck' && this.offshore) ? a.party.length : Math.min(2, a.party.length));
    this.boat = { obj, home: [wx, wz], out, y: wat.level, riders };
    if (war && this.offshore) {
      // les deux galères encadrent le monstre, de part et d'autre du point de combat, chacune bord à bord face à lui
      const [cx, cz] = out, ax = cx - wx, az = cz - wz, al = Math.max(0.01, Math.hypot(ax, az)), px = -az / al, pz = ax / al;
      this.arena = [cx, cz];
      this.boat.out = [cx + px * DUEL_GAP, cz + pz * DUEL_GAP];
      const eh: [number, number] = this.depth(wx - px * 0.45, wz - pz * 0.45) !== null ? [wx - px * 0.45, wz - pz * 0.45] : [wx, wz];
      this.escort = { obj: hullOf(), home: eh, out: [cx - px * DUEL_GAP, cz - pz * DUEL_GAP], riders: riders.slice(Math.ceil(riders.length / 2)) };
    }
    this.spots = this.bankSpots(Math.max(1, a.party.length - riders.length));
  }

  /**
   * Le point de combat de la chasse au monstre : depuis le mouillage (wx, wz), le point d'eau le plus dégagé à portée (au plus
   * `SEA_CLEAR` cases de vide tout autour, le plus proche d'abord), atteint tout droit sur l'eau
   */
  private openSpot(wx: number, wz: number): [number, number] | null {
    let best: [number, number] | null = null, bs = -1;
    for (let dz = -22; dz <= 22; dz += 1)
      for (let dx = -22; dx <= 22; dx += 1) {
        const x = wx + dx, z = wz + dz, d = Math.hypot(dx, dz);
        if (d > 22 || this.depth(x, z) === null) continue;
        const c = seaClearance(this.world, x, z, SEA_CLEAR);
        const score = Math.min(c, SEA_CLEAR) * 10 - d * 0.15;
        if (score <= bs) continue;
        // la route depuis le mouillage reste sur l'eau
        let ok = true;
        for (let k = 0.1; k < 1 && ok; k += 0.1) if (this.depth(wx + dx * k, wz + dz * k) === null) ok = false;
        if (ok) { bs = score; best = [x, z]; }
      }
    return best;
  }

  /**
   * Le vide autour d'un point d'eau : de combien l'on peut s'en écarter, dans toutes les directions, sans toucher la rive
   * (au plus `max`)
   */
  private seaRoom(cx: number, cz: number, max = 2.4) {
    let room = max;
    for (let d = 0; d < 12; d++) {
      const ux = Math.cos((d * Math.PI) / 6), uz = Math.sin((d * Math.PI) / 6);
      let run = 0;
      for (let k = 0.2; k <= max; k += 0.2) { if (this.depth(cx + ux * k, cz + uz * k) === null) break; run = k; }
      room = Math.min(room, run);
    }
    return room;
  }

  /**
   * Le galion englouti : le bateau attend au mouillage, l'épave à demi coulée à son flanc, la gabare de relevage amarrée
   * entre les deux (voir `Salvage`). L'équipe y travaille toute entière
   */
  private salvage(a: ActiveExpedition) {
    const bt = this.boat!;
    // (le bateau est déjà au mouillage de départ, avant l'arrivée de l'équipe)
    bt.obj.position.set(bt.home[0], bt.y, bt.home[1]);
    bt.obj.rotation.y = Math.atan2(bt.out[0] - bt.home[0], bt.out[1] - bt.home[1]);
    const diver = a.c.variant === 'diver';
    this.salv = new Salvage({ world: this.world, agents: this.agents, group: this.group, depth: (x, z) => this.depth(x, z), splash: (x, z, lv, big) => this.splash(x, z, lv, big) }, bt, a.party, diver, a.age);
    for (const o of this.salv.objs) this.props.push(o);
    this.focus = this.salv.focus;
  }

  /**
   * Autour de la barque, au large : le récif grouille de vie (une baleine qui bondit, des dauphins qui sautent, des raies
   * qui planent, des bancs de poissons) ; en pêche au large, quelques dauphins et des bancs ; la chasse au monstre a le sien
   */
  private populateSea(a: ActiveExpedition) {
    const bt = this.boat;
    if (!bt) return;
    const war = this.story === 'megalodon' || this.story === 'kraken', [cx, cz] = this.arena ?? bt.out, room =this.seaRoom(cx, cz, war ? SEA_CLEAR : 2.4), level = bt.y;
    const reef = this.story === 'dive', fishing = this.story === 'boat' || this.story === 'trawl' || this.story === 'voyage' || this.story === 'wreck';
    if (this.story === 'megalodon' || this.story === 'kraken') { this.makeMonster(cx, cz, level, room); return; }
    if (!this.offshore || (!reef && !fishing)) return;
    // (au galion englouti, ni dauphins ni baleine dans les câbles de la grue : les bancs de l'épave suffisent)
    const plan: [SwimKind, number][] = reef ? [['whale', 1], ['dolphin', 3], ['manta', 2], ['school', 3]] : this.story === 'wreck' ? [['school', 2]] : [['dolphin', 2], ['school', 2]];
    let i = 0;
    for (const [kind, n] of plan) for (let j = 0; j < n; j++, i++) this.addSwimmer(kind, cx, cz, level, room, i, j);
    void a;
  }

  private addSwimmer(kind: SwimKind, cx: number, cz: number, level: number, room: number, i: number, j: number) {
    const len = { dolphin: 0.46, whale: 1.5, manta: 0.55, school: 0.05 }[kind];
    const model: ModelName | null = kind === 'school' ? null : kind;
    const actor = model && hasModel(model) ? makeActor(model, len) : null;
    const obj = new THREE.Group();
    if (actor) obj.add(actor.root);
    else if (kind === 'school') {
      // un banc : une grappe de petits poissons qui nagent ensemble
      for (let f = 0; f < 7; f++) { const m = new THREE.Mesh(fishGeo(), mats.body); m.position.set(Math.cos(f * 2.4) * 0.07, Math.sin(f * 1.7) * 0.01, Math.sin(f * 2.4) * 0.07); m.rotation.y = f * 0.3; m.scale.setScalar(0.9); obj.add(m); }
    } else { const m = new THREE.Mesh(swimGeo(kind), mats.body); m.scale.setScalar(len); m.castShadow = true; obj.add(m); }
    this.group.add(obj);
    this.props.push(obj);
    const big = kind === 'whale', ring = kind === 'school' ? room * (0.35 + 0.15 * j) : big ? room * 0.85 : kind === 'manta' ? room * (0.35 + 0.2 * j) : room * (0.5 + 0.12 * j);
    this.swimmers.push({
      kind, obj, actor, len, cx, cz, level, r: Math.max(0.3, ring), ang: i * 2.1 + j, dir: i % 2 ? 1 : -1, w: (kind === 'whale' ? 0.18 : kind === 'school' ? 0.5 : kind === 'manta' ? 0.3 : 0.55) * (0.85 + (j % 3) * 0.12),
      jump: -1, next: 1.5 + i * 1.3 + Math.random() * 2, dur: 1, height: 0, x: cx, z: cz, heading: 0,
    });
  }

  /** La faune marine nage en cercle autour de la barque, saute, plane ; chaque saut soulève des gerbes d'écume */
  private stepSwimmers(dt: number) {
    for (const s of this.swimmers) {
      s.ang += s.dir * s.w * dt;
      const ex = 1.25, c = Math.cos(s.ang), sn = Math.sin(s.ang);
      let x = s.cx + c * s.r * ex, z = s.cz + sn * s.r;
      // (la baleine et les raies au-dessus de la terre ne se montrent pas)
      const wet = this.depth(x, z) !== null;
      s.obj.visible = wet;
      const tx = -sn * s.r * ex * s.dir, tz = c * s.r * s.dir;
      s.heading = Math.atan2(tx, tz);
      let y = s.level - s.len * (s.kind === 'school' ? 0.15 : s.kind === 'whale' ? 0.1 : 0.06) + Math.sin(this.t * 1.6 + s.ang * 3) * 0.004, pitch = 0, roll = 0;
      if (s.kind === 'manta') y = s.level - 0.03 + Math.sin(this.t * 2 + s.ang) * 0.006;
      if (s.jump < 0) {
        if ((s.next -= dt) <= 0 && wet && s.kind !== 'school') {
          s.jump = 0; s.dur = s.kind === 'whale' ? 2.4 : s.kind === 'manta' ? 1.3 : 1.1; s.height = s.kind === 'whale' ? 0.5 : s.kind === 'manta' ? 0.12 : 0.26;
          this.splash(x, z, s.level, s.kind === 'whale');
        } else if (s.kind === 'school' && (s.next -= dt) <= 0) { s.next = 1.2 + Math.random() * 2; this.fishJump(x + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.3, s.level); }
      } else {
        s.jump += dt / s.dur;
        const u = Math.min(1, s.jump), arc = Math.sin(u * Math.PI);
        y += arc * s.height;
        // le nez monte puis plonge ; la raie fait un tonneau, la baleine retombe de tout son poids
        pitch = -Math.cos(u * Math.PI) * (s.kind === 'whale' ? 0.9 : 0.85);
        if (s.kind === 'manta') { roll = u * Math.PI * 2; pitch = 0; }
        if (u >= 1) { s.jump = -1; s.next = (s.kind === 'whale' ? 7 : 3) + Math.random() * 4; this.splash(x, z, s.level, s.kind === 'whale'); }
      }
      s.obj.position.set(x, y, z);
      s.obj.rotation.set(pitch, s.heading, roll, 'YXZ');
      if (s.actor) { s.actor.mixer.update(dt); play(s.actor, ['Swimming_Fast', 'Swimming_Normal', 'Swim', 'Idle'].slice(s.jump >= 0 ? 0 : 1)); }
      else if (s.kind !== 'school') s.obj.children[0].rotation.y = Math.sin(this.t * 5 + s.ang) * 0.06;
      s.x = x; s.z = z;
    }
  }

  /** Une gerbe d'écume et un rond dans l'eau en (x, z) */
  private splash(x: number, z: number, level: number, big = false) {
    // la gerbe : des gouttes d'écume blanche qui jaillissent, retombent en arc (et un petit nuage bas)
    const n = big ? 28 : 8;
    for (let i = 0; i < n; i++) {
      const o = new THREE.Mesh(foamGeo(), mats.body), a = Math.random() * Math.PI * 2, v = big ? 0.1 + Math.random() * 0.4 : 0.06 + Math.random() * 0.16;
      this.group.add(o);
      this.fx.push({ obj: o, t: 0, life: big ? 1 + Math.random() * 0.5 : 0.7 + Math.random() * 0.2, kind: 'spray', x: x + Math.cos(a) * 0.05, y: level + 0.01, z: z + Math.sin(a) * 0.05, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: big ? 0.7 + Math.random() * 1 : 0.35 + Math.random() * 0.4 });
    }
    this.puffAt(x, level + 0.01, z, 'puff', 0, 0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(big ? 0.08 : 0.04, big ? 0.11 : 0.055, 14).rotateX(-Math.PI / 2), RING);
    // (dessiné après l'eau, transparente elle aussi : sinon elle le recouvre)
    ring.renderOrder = 3;
    this.group.add(ring);
    this.fx.push({ obj: ring, t: 0, life: 1.4, kind: 'ring', x, y: level + 0.005, z, vx: 0, vz: 0 });
    if (big) {
      // un second remous, plus large et plus lent
      const r2 = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.16, 16).rotateX(-Math.PI / 2), RING);
      r2.renderOrder = 3;
      this.group.add(r2);
      this.fx.push({ obj: r2, t: 0, life: 2.2, kind: 'ring', x, y: level + 0.004, z, vx: 0, vz: 0 });
    }
  }

  // ---------------- La chasse au monstre des mers : le mégalodon et le kraken ----------------
  /**
   * Le monstre de la chasse, caché d'abord : le mégalodon (un aileron géant qui rôde, puis des bonds hors de l'eau) ou le kraken
   * (des tentacules qui jaillissent autour de la galère, puis la tête qui se dresse au large)
   */
  private makeMonster(cx: number, cz: number, level: number, room: number) {
    const r = Math.max(0.5, Math.min(0.9, room * 0.8)), obj = new THREE.Group();
    obj.visible = false;
    this.group.add(obj);
    this.props.push(obj);
    const tents: Monster['tents'] = [], arms: THREE.Object3D[] = [];
    if (this.story === 'megalodon') {
      const mesh = new THREE.Mesh(sharkGeo(true), mats.body);
      mesh.scale.setScalar(2.5);
      mesh.castShadow = true;
      obj.add(mesh);
    } else {
      const head = new THREE.Mesh(krakenHeadGeo(), mats.body);
      head.castShadow = true;
      head.scale.setScalar(1.3);
      obj.add(head);
      // le corps sous la tête : huit gros bras qui partent du manteau et s'étalent sur l'eau tout autour (la tête n'est plus posée
      // seule sur l'eau, coupée net à la flottaison)
      for (let i = 0; i < 8; i++) {
        const pivot = new THREE.Group(), arm = new THREE.Mesh(tentacleGeo(), mats.body);
        pivot.rotation.order = 'YXZ';
        pivot.rotation.y = (i / 8) * Math.PI * 2 + 0.2;
        pivot.position.y = 0.05;
        arm.castShadow = true;
        arm.scale.set(1.35, 0.95, 1.35);
        arm.rotation.order = 'YXZ';
        pivot.add(arm);
        obj.add(pivot);
        arms.push(pivot);
      }
      for (let i = 0; i < 7; i++) {
        const t = new THREE.Mesh(tentacleGeo(), mats.body);
        t.castShadow = true; t.visible = false;
        t.rotation.order = 'YXZ';
        this.group.add(t);
        this.props.push(t);
        tents.push({ obj: t, ang: (i / 7) * Math.PI * 2 + 0.4, r: r * (0.62 + (i % 3) * 0.14), up: 0, cut: 0, ph: i * 1.7 });
      }
    }
    this.monster = { kind: this.story === 'kraken' ? 'kraken' : 'megalodon', obj, cx, cz, level, r, ang: 0.6, breach: -1, bs: 0, done: 0, hits: 0, flinch: 0, dart: 1, death: 0, tents, arms, ended: false };
  }

  /**
   * L'issue du combat tombe (voir `ActiveExpedition.fate`) : toute la troupe lance ses harpons d'un coup sur le monstre, dans une
   * grande gerbe d'écume ; vaincu, il meurt sous ses yeux, sinon il s'échappe
   */
  private finalVolley(m: Monster, to: THREE.Vector3) {
    m.ended = true;
    for (let i = 0; i < 4; i++) { m.dart = 0; this.throwDarts(0, m, to.clone().add(new THREE.Vector3((i - 1.5) * 0.08, 0, (i % 2) * 0.06)), -1); }
    this.splash(to.x, to.z, m.level, true);
    m.flinch = 1;
  }

  /** Le monstre à chaque image (voir `makeMonster`) ; `k` : l'avancement du travail */
  private stepMonster(dt: number, a: ActiveExpedition, kIn: number) {
    const m = this.monster!, bt = this.boat;
    const over = a.phase === 'back' || a.phase === 'home', k = over ? 1 : kIn;
    if (!bt || (a.phase !== 'work' && !over)) return;
    m.flinch = Math.max(0, m.flinch - dt * 2.5);
    const shake = Math.sin(this.t * 38) * 0.14 * m.flinch;
    // l'issue du combat, tombée pendant le travail (ou, pour une ancienne équipe, au départ) : vaincu, ou échappé
    const fate = a.fate ?? (over ? a.ok : undefined), won = fate === true, lost = fate === false;
    if (fate !== undefined) m.death += dt;
    if (m.kind === 'megalodon') {
      const show = k > 0.1 || over, rad = m.r * (1 + (1 - smooth(Math.min(1, Math.max(0, (k - 0.1) / 0.2)))) * 1.6);
      m.obj.visible = show && (!lost || m.death < 2.6);
      // vivant, il tourne autour de la galère (blessé, il ralentit) ; mort, il ne bouge plus ; échappé, il file en plongeant
      if (!won) m.ang += m.breach >= 0 ? dt * MEGA_VH / (rad * 1.07) : dt * (lost ? 0.9 : k > 0.72 ? 0.3 : 0.65);
      const c = Math.cos(m.ang), sn = Math.sin(m.ang), x = m.cx + c * rad * 1.15, z = m.cz + sn * rad;
      if (this.depth(x, z) === null) { m.obj.visible = false; this.stepDarts(dt); return; }
      let y = m.level - 0.07 + Math.sin(this.t * 1.4) * 0.006, pitch = 0, roll = 0, jaw = 0.05, arch = 0, amp = won ? 0 : lost ? 0.6 : 1;
      if (m.breach < 0 && fate === undefined && m.done < MEGA_BREACH.length && k >= MEGA_BREACH[m.done]) { m.breach = 0; m.done++; m.bs = 0; }
      if (m.breach >= 0) {
        // il jaillit de l'eau, gueule ouverte, et retombe dans une grande gerbe : un arc de parabole, le museau en l'air à la
        // montée (45° environ), à plat au sommet, plongeant à la descente ; la galère roule
        m.breach += dt / MEGA_LEAP;
        const u = Math.min(1, m.breach), w = Math.min(1, u * 14, (1 - u) * 14), vy = MEGA_YH * 4 * (1 - 2 * u) / MEGA_LEAP;
        y = y + (m.level + MEGA_Y0 + MEGA_YH * 4 * u * (1 - u) - y) * w;
        pitch = -Math.atan2(vy, MEGA_VH) * w;
        jaw = Math.min(1, Math.sin(u * Math.PI) * 1.8); arch = Math.sin(u * Math.PI) * 0.9; amp = 0.4; roll = Math.sin(u * Math.PI * 2) * 0.12;
        // la gerbe à l'entrée du museau hors de l'eau, puis à la retombée (deux gerbes et un remous)
        if (m.bs === 0 && u > 0.14) { m.bs = 1; this.splash(x, z, m.level, true); }
        if (m.bs === 1 && u > 0.86) { m.bs = 2; this.splash(x, z, m.level, true); this.splash(x + Math.sin(m.obj.rotation.y) * 0.5, z + Math.cos(m.obj.rotation.y) * 0.5, m.level, true); }
        if (u >= 1 || fate !== undefined) { m.breach = -1; if (m.bs < 2) this.splash(x, z, m.level, true); }
      }
      // l'issue : toute la troupe lance ses harpons, il se débat un instant…
      const head = new THREE.Vector3(x + Math.sin(m.obj.rotation.y) * 0.25, y + 0.15, z + Math.cos(m.obj.rotation.y) * 0.25);
      if (fate !== undefined && !m.ended && m.obj.visible) this.finalVolley(m, head);
      if (won) {
        // … et meurt sous ses yeux : il se retourne d'un coup, le ventre en l'air, et flotte, immobile
        const u = smooth(Math.min(1, Math.max(0, (m.death - 0.4) / 1.1)));
        roll = Math.PI * u;
        y = m.level - 0.1 + (0.06 + Math.sin(this.t * 1.1) * 0.004) * u;
        if (m.death > 0.4 && m.death - dt <= 0.4) this.splash(x, z, m.level, true);
      } else if (lost) y -= m.death * 0.12;
      m.obj.position.set(x, y, z);
      // (vivant : le corps entier ondule en S, la queue bat d'un côté puis de l'autre ; mort, il flotte sans force, gueule pendante)
      m.obj.rotation.set(pitch, Math.atan2(-sn * 1.15, c) + shake, roll, 'YXZ');
      sharkSwim(m.obj.children[0] as THREE.Mesh, this.t, amp, won ? 0.35 : jaw, arch, m.breach >= 0 ? 6.5 : 4.6);
      // l'écume de son sillage (pas une fois mort)
      if (m.obj.visible && !won && !over && Math.random() < dt * 5) this.puffAt(x - Math.sin(m.obj.rotation.y) * 0.3, m.level + 0.01, z - Math.cos(m.obj.rotation.y) * 0.3);
      this.rough = m.breach >= 0 && m.breach < 0.6 ? 0.8 : won && m.death < 1.5 ? 0.6 : Math.max(0, this.rough - dt * 0.5);
      if (fate === undefined && !over && m.obj.visible && k > 0.18) this.throwDarts(dt, m, head, -1);
    } else {
      // le kraken : ses tentacules jaillissent, deux entourent la galère, les harpons les tranchent ; la tête se dresse au large
      const hug = k > 0.38 && fate === undefined && !over;
      let tip: THREE.Vector3 | null = null, tipI = -1;
      m.tents.forEach((tn, i) => {
        // vaincu, il lâche tout et ses tentacules replongent ; échappé, elles restent dressées
        const grab = hug && i < 2, want = (won ? 0 : lost ? 1 : k > 0.1 + i * 0.045 ? 1 : 0) * (tn.cut > 0 ? 0 : 1);
        if (tn.cut > 0) tn.cut -= dt;
        tn.up += (want - tn.up) * Math.min(1, dt * (tn.cut > 0 ? 6 : won ? 1.6 : 1.1));
        tn.ang += dt * 0.12 * (i % 2 ? 1 : -1);
        // deux galères : chacune a sa tentacule qui l'agrippe, sortie de l'eau à son bord, du côté du kraken
        const gb = grab ? (i === 1 && this.escort ? this.escort.obj : bt.obj).position : null;
        const rr = grab ? m.r * 0.42 : tn.r;
        let x = m.cx + Math.cos(tn.ang) * rr, z = m.cz + Math.sin(tn.ang) * rr;
        if (gb && this.escort) { const gx = m.cx - gb.x, gz = m.cz - gb.z, gl = Math.max(0.01, Math.hypot(gx, gz)); x = gb.x + (gx / gl) * 0.32 + Math.cos(tn.ang) * 0.06; z = gb.z + (gz / gl) * 0.32 + Math.sin(tn.ang) * 0.06; }
        const o = tn.obj;
        o.visible = tn.up > 0.03 && this.depth(x, z) !== null;
        o.position.set(x, m.level - 0.03, z);
        const s = (grab ? 1.15 : 0.95) * (0.9 + 0.1 * Math.sin(this.t + tn.ph));
        o.scale.set(s, s * Math.max(0.01, tn.up), s);
        const lean = gb && this.escort ? Math.atan2(gb.x - x, gb.z - z) : Math.atan2(m.cx - x, m.cz - z);
        o.rotation.set(Math.sin(this.t * 1.3 + tn.ph) * 0.22 + (tn.cut > 0 ? 0.9 : 0), lean + Math.sin(this.t * 0.8 + tn.ph) * 0.3 + shake * (i % 2 ? 1 : -1), 0, 'YXZ');
        if (o.visible && tn.up > 0.9 && (!tip || i < tipI)) { tip = new THREE.Vector3(x + Math.sin(o.rotation.y) * 0.25, m.level + 0.42 * s, z + Math.cos(o.rotation.y) * 0.25); tipI = i; }
        if (o.visible && Math.random() < dt * 0.8) this.puffAt(x, m.level + 0.01, z);
      });
      // la tête se dresse au large ; vaincu, elle s'enfonce lentement dans un nuage d'encre et de bulles
      const rise = smooth(Math.min(1, Math.max(0, (k - 0.5) / 0.2))), sink = won ? smooth(Math.min(1, Math.max(0, (m.death - 0.6) / 3))) : 0, head = rise * (1 - sink);
      m.obj.visible = head > 0.02;
      // (entre les deux galères, au point de combat ; seul contre une galère, au large d'elle)
      const off = this.escort ? 0 : m.r * 1.7, hx = m.cx - Math.cos(0.9) * off, hz = m.cz - Math.sin(0.9) * off;
      m.obj.position.set(hx, m.level - 0.32 + head * 0.3 + Math.sin(this.t * 1.1) * 0.01, hz);
      // (il fait face à une galère, puis se tourne lentement vers l'autre, en face)
      const foe = this.escort ? bt.obj.position : null;
      const turn = foe ? Math.atan2(foe.x - hx, foe.z - hz) + Math.PI * (0.5 - 0.5 * Math.cos(this.t * 0.3)) : Math.atan2(m.cx - hx, m.cz - hz);
      m.obj.rotation.set(sink * 0.35, turn + shake, 0);
      // ses bras ondulent sur l'eau autour de la tête, se tordent quand un harpon le touche
      m.arms.forEach((p, i) => {
        const arm = p.children[0];
        arm.rotation.x = 0.72 + Math.sin(this.t * 1.5 + i * 0.8) * 0.25 - m.flinch * 0.3 + sink * 0.5;
        arm.rotation.z = Math.sin(this.t * 0.9 + i * 1.3) * 0.22;
      });
      if (fate !== undefined && !m.ended && m.obj.visible) this.finalVolley(m, new THREE.Vector3(hx, m.level + 0.25, hz));
      if (won && m.obj.visible && Math.random() < dt * 6) this.puffAt(hx + (Math.random() - 0.5) * 0.5, m.level + 0.01, hz + (Math.random() - 0.5) * 0.5, 'smoke', 0, 0);
      this.rough = hug ? 0.55 : Math.max(0, this.rough - dt * 0.5);
      if (tip && fate === undefined && !over && k > 0.16) this.throwDarts(dt, m, tip, tipI);
    }
    this.stepDarts(dt);
  }

  /** Les hommes d'armes lancent un harpon de temps en temps vers `to` (le monstre, ou le bout d'une tentacule : `ti`) */
  private throwDarts(dt: number, m: Monster, to: THREE.Vector3, ti: number) {
    if ((m.dart -= dt) > 0 || !this.boat) return;
    m.dart = 1.1 + Math.random() * 0.8;
    // d'une galère, puis de l'autre
    const from0 = this.escort && this.volley++ % 2 ? this.escort.obj : this.boat.obj;
    const o = from0.position, g = new THREE.Mesh(harpoonGeo(), mats.body);
    this.group.add(g);
    const from = new THREE.Vector3(o.x + (Math.random() - 0.5) * 0.2, o.y + 0.22, o.z + (Math.random() - 0.5) * 0.2);
    this.darts.push({ obj: g, from, to: to.clone(), t: 0, life: 0.35 + from.distanceTo(to) * 0.3, ti });
  }

  private stepDarts(dt: number) {
    const m = this.monster!;
    this.darts = this.darts.filter((d) => {
      d.t += dt;
      const u = Math.min(1, d.t / d.life), at = (v: number) => new THREE.Vector3().lerpVectors(d.from, d.to, v).add(new THREE.Vector3(0, Math.sin(v * Math.PI) * 0.22, 0));
      const p = at(u);
      d.obj.position.copy(p);
      d.obj.lookAt(at(Math.min(1, u + 0.04)));
      if (u < 1) return true;
      // touché : l'écume, le monstre tressaille ; une tentacule touchée tombe, et repousse ailleurs
      this.splash(d.to.x, d.to.z, m.level);
      m.flinch = 1; m.hits++;
      if (d.ti >= 0 && m.tents[d.ti] && m.tents[d.ti].cut <= 0) { m.tents[d.ti].cut = 2.4; m.tents[d.ti].ang += 1.3; }
      this.group.remove(d.obj);
      return false;
    });
  }

  // ---------------- Animation ----------------
  update(dt: number, a: ActiveExpedition) {
    this.t += dt;
    // l'équipe repartie, le décor s'efface
    if (this.fade >= 0) { this.stepFade(dt); return; }
    // avant l'arrivée de l'équipe, le décor est déjà là et vit (bêtes, flammes, voisins) ; le travail n'a pas commencé
    const onSite = a.phase === 'work';
    const k = onSite ? Math.min(1, a.t / Math.max(1, a.c.work + a.extra)) : 0;
    if (this.flame) { const f = 1 + Math.sin(this.t * 17) * 0.12 + Math.sin(this.t * 29) * 0.08; this.flame.scale.set(f, 1.1 + Math.sin(this.t * 13) * 0.2, f); }
    if (this.mam) this.stepMammothHunt(dt, a, k);
    else if (this.kind === 'hunt' && (onSite || a.phase === 'back')) this.stepHunt(dt, a);
    else for (const b of this.beasts) this.stepBeast(b, dt, a);
    this.workK = k;
    if (this.boat && onSite) this.stepBoat(dt);
    // le travail fini avant que tout l'équipage soit redescendu au quai : il y redescend d'abord, puis rentre au village à pied
    // (avant, il partait à pied de sa place à bord et marchait dans l'eau jusqu'à la rive)
    else if (this.boat && (a.phase === 'back' || a.phase === 'home') && this.aboard.size > this.landed.size) {
      const left = [...this.aboard].filter((id) => !this.landed.has(id));
      this.embark(left, this.escort?.riders.includes(left[0]) ? this.escort.home : this.boat.home, true);
      for (const id of left) if (this.landed.has(id)) this.agents.partyGo([id], a.base[0], a.base[1]);
    }
    if (this.float) this.float.update(dt, k, onSite, (x, y, z) => this.puffAt(x, y, z));
    if (this.volc) {
      const away = a.phase === 'back' || a.phase === 'home';
      // venue à pied : sur place, chacun monte au lieu du travail, puis, le travail fini, reprend sa marche
      if (this.kind === 'volcano' && onSite && !a.wait) this.stepVolcano(k, a.party);
      else if (this.kind === 'volcano' && away && !this.volcFree) { this.volcFree = true; for (const id of a.party) this.agents.ride(id, null); }
      this.volc.update(dt, this.kind === 'volcano' ? k : onSite ? this.boatK : 0, this.agents.partyPositions(a.party).map((p): [number, number] => [p[0], p[1]]), onSite, away, a.ok);
      this.focus = this.volc.focus;
    }
    { const gone = a.phase === 'back' || a.phase === 'home'; this.salv?.update(dt, k, onSite, gone, gone && !a.ok); }
    if (this.swimmers.length) this.stepSwimmers(dt);
    if (this.monster) this.stepMonster(dt, a, k);
    if (this.balloon) this.stepBalloon(k, onSite);
    if (this.works) this.stepWorks(dt, a);
    if (this.race) this.stepRace(k, dt, onSite);
    if (this.games) this.stepGames(dt, a, k);
    if (this.dragon) this.stepDragon(dt, a, k);
    if (this.rocket) this.stepRocket(k, dt, onSite);
    // ouvrages qui avancent avec le travail, panier qui se remplit
    this.built.forEach((o, i) => (o.visible = k * this.built.length > i));
    if (this.basket) this.basket.scale.setScalar(Math.max(0.001, k));
    for (const s of this.spins) {
      if (s.speed) s.obj.rotation.y += dt * s.speed;
      else { const f = 1 + Math.sin(this.t * 17 + s.obj.position.x * 9) * 0.12; s.obj.scale.set(f, 1.1 + Math.sin(this.t * 13 + s.obj.position.z * 7) * 0.2, f); }
    }
    for (const g of this.grows) g.obj.scale.setScalar(Math.max(0.001, g.from + (g.to - g.from) * k));
    for (const n of this.npcs) folkStep(n.folk, this.t * 1.6 + n.off, n.pose);
    for (const j of this.jugglers) j.balls.forEach((b, i) => {
      const ph = this.t * 4.2 + i * 2.094, side = Math.cos(ph) * 0.06, fx = Math.sin(j.face), fz = Math.cos(j.face);
      b.position.set(j.x + fx * 0.07 + fz * side, j.y + 0.3 + Math.abs(Math.sin(ph)) * 0.16, j.z + fz * 0.07 - fx * side);
    });
    if (this.cartRun) {
      // le wagonnet sort de la galerie, vide son chargement au tas, y retourne
      const u = 0.5 - Math.cos(this.t * 0.45) * 0.5, c = this.cartRun, x = c.a[0] + (c.b[0] - c.a[0]) * u, z = c.a[1] + (c.b[1] - c.a[1]) * u;
      c.obj.position.set(x, this.world.surfaceAt(x, z), z);
    }
    // une attente choisie : l'équipe reste à l'arrêt (assise), la barque amarrée, et ne reprend l'ouvrage qu'ensuite
    const holding = a.hold > 0;
    if (holding) this.idle += dt;
    if (onSite && !a.wait && !holding) this.stepMembers(dt, a, k);
    // les pêcheurs repartis, leurs cannes s'en vont avec eux
    if (onSite) this.stepRods(a);
    else for (const r of this.rods.values()) r.rod.visible = r.bob.visible = r.line.visible = false;
    this.stepStagings(dt, a);
    // (les mammouths une fois menés, par la chasse ou par un imprévu : leurs pattes suivent leur pas)
    if (this.mammoths.length) this.stepMammoths(dt);
    this.stepTorches(dt, a);
    this.stepFx(dt, a);
  }

  /**
   * Au retour d'une expédition réussie, les bêtes qu'elle ramène quittent la harde pour suivre l'équipe (voir ExpeditionView) :
   * une bête de la harde par bête ramenée, de la même espèce. D'où chacune part (x, z, cap), ou null s'il n'y en avait pas
   * sur place
   */
  handOver(what: HerdKind[]): ([number, number, number] | null)[] {
    return what.map((k) => {
      const b = this.beasts.find((x) => x.kind === k && x.obj.visible && x.flee === undefined && !x.held);
      if (!b) return null;
      b.actor?.mixer.stopAllAction();
      this.group.remove(b.obj);
      this.beasts.splice(this.beasts.indexOf(b), 1);
      return [b.x, b.z, b.heading];
    });
  }

  private stepBeast(b: Beast, dt: number, a: ActiveExpedition) {
    // un imprévu la mène (elle charge) ; ou elle s'enfuit au galop, et disparaît au loin
    if (b.held) return;
    if (b.flee !== undefined) {
      if (!b.obj.visible) return;
      b.fled = (b.fled ?? 0) + dt;
      this.sMove(b, b.x + Math.sin(b.flee) * 2, b.z + Math.cos(b.flee) * 2, 1.4, dt, ['Idle'], true);
      if (b.fled > 4) b.obj.visible = false;
      return;
    }
    const w = this.world, [cx, cz] = a.dest, pos = this.agents.partyPositions(a.party);
    // un membre tout près : la bête s'arrête et se laisse approcher (le loup, lui, détale)
    const close = pos.find(([x, z]) => Math.hypot(x - b.x, z - b.z) < 0.45);
    const wolf = b.speed > 0.3;
    if (close && wolf) {
      const ang = Math.atan2(b.x - close[0], b.z - close[1]) + (Math.random() - 0.5);
      [b.tx, b.tz] = this.near(b.x + Math.sin(ang) * 1.6, b.z + Math.cos(ang) * 1.6, cx, cz);
      b.wait = 0;
    }
    let moving = false;
    if (close && !wolf) {
      b.heading = Math.atan2(close[0] - b.x, close[1] - b.z);
      b.tx = b.x; b.tz = b.z;
    } else {
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d > 0.03) {
        const s = Math.min(d, b.speed * dt);
        const nx = b.x + (dx / d) * s, nz = b.z + (dz / d) * s;
        if (this.free(nx, nz)) { b.x = nx; b.z = nz; b.heading = Math.atan2(dx, dz); moving = true; } else { b.tx = b.x; b.tz = b.z; }
      } else if ((b.wait -= dt) <= 0) {
        b.wait = wolf ? 1 + Math.random() * 2 : 2.5 + Math.random() * 4;
        const r = wolf ? 1.8 + Math.random() * 1.2 : 0.5 + Math.random() * 1.3, ang = Math.random() * Math.PI * 2;
        [b.tx, b.tz] = this.near(cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, cx, cz);
        const k = a.phase === 'work' ? Math.min(1, a.t / Math.max(1, a.c.work + a.extra)) : 0;
        if (this.salts.length && Math.random() < 0.7) { const s = this.salts[Math.floor(Math.random() * this.salts.length)]; [b.tx, b.tz] = [s[0] + Math.cos(ang) * 0.12, s[1] + Math.sin(ang) * 0.12]; }
        if (this.corral && k > 0.45) [b.tx, b.tz] = [this.corral[0] + Math.cos(ang) * 0.3 * Math.random(), this.corral[1] + Math.sin(ang) * 0.3 * Math.random()];
      }
    }
    b.obj.position.set(b.x, w.surfaceAt(b.x, b.z), b.z);
    b.obj.rotation.y = b.heading;
    if (b.actor) {
      play(b.actor, moving ? (wolf ? ['Gallop', 'Run', 'Walk'] : ['Walk', 'WalkSlow', 'Idle']) : close ? ['Idle', 'Idle_Eating'] : ['Idle_Eating', 'Eating', 'Idle']);
      b.actor.mixer.update(dt);
    }
  }

  /**
   * La chasse au loup : il rôde autour des chasseurs, fonce sur l'un d'eux, mord (la lame pare, ou la morsure porte), recule
   * et recommence ; les chasseurs lui lancent leurs lances (celles qui portent le font tressaillir), les chiens le harcèlent.
   * Au retour, l'issue : il détale loin dans la forêt, ou il tient tête et mord encore
   */
  private stepHunt(dt: number, a: ActiveExpedition) {
    const b = this.beasts[0];
    if (!b) return;
    const w = this.world, h = this.hunt, [cx, cz] = a.dest, pos = this.agents.partyPositions(a.party), g = (x: number, z: number) => w.surfaceAt(x, z);
    h.t -= dt; h.flinch = Math.max(0, h.flinch - dt);
    if (a.phase === 'back' && h.mode !== 'flee' && h.mode !== 'stand') {
      h.mode = a.ok ? 'flee' : 'stand'; h.t = a.ok ? 6 : 2; h.ang = Math.atan2(b.x - cx, b.z - cz);
      const p = pos[0];
      if (!a.ok && p) this.combat?.hit(p[0], g(p[0], p[1]) + 0.13, p[1], 0xff5a4a, 14, 'bite');
    }
    let tx = b.x, tz = b.z, speed = 0, anim = ['Idle'];
    if (h.mode === 'prowl') {
      h.ang += dt * 0.55;
      tx = cx + Math.sin(h.ang) * 1.5; tz = cz + Math.cos(h.ang) * 1.5; speed = 0.75; anim = ['Walk', 'Run'];
      if (h.t <= 0 && pos.length) { h.mode = 'charge'; h.target = Math.floor(Math.random() * pos.length); h.t = 3; }
    } else if (h.mode === 'charge') {
      const p = pos[h.target % Math.max(1, pos.length)];
      if (p) { tx = p[0]; tz = p[1]; }
      speed = 1.6; anim = ['Run'];
      if (p && Math.hypot(p[0] - b.x, p[1] - b.z) < 0.26) {
        h.mode = 'bite'; h.t = 0.8;
        const bite = Math.random() < 0.35;
        this.combat?.hit((p[0] + b.x) / 2, g(p[0], p[1]) + 0.13, (p[1] + b.z) / 2, bite ? 0xff5a4a : 0xf2f4ff, bite ? 12 : 9, bite ? 'bite' : 'blade');
      } else if (h.t <= 0) { h.mode = 'back'; h.t = 2; }
    } else if (h.mode === 'bite') {
      anim = ['Headbutt'];
      const p = pos[h.target % Math.max(1, pos.length)];
      if (p) b.heading = Math.atan2(p[0] - b.x, p[1] - b.z);
      if (h.t <= 0) { h.mode = 'back'; h.t = 2.5; }
    } else if (h.mode === 'back') {
      const ang = Math.atan2(b.x - cx, b.z - cz);
      tx = cx + Math.sin(ang) * 1.8; tz = cz + Math.cos(ang) * 1.8; speed = 1.3; anim = ['Run'];
      if (Math.hypot(tx - b.x, tz - b.z) < 0.1 || h.t <= 0) { h.mode = 'prowl'; h.ang = ang; h.t = 3 + Math.random() * 2.5; }
    } else if (h.mode === 'flee') {
      tx = cx + Math.sin(h.ang) * 9; tz = cz + Math.cos(h.ang) * 9; speed = 2.4; anim = ['Run'];
      if (h.t <= 0) b.obj.visible = false;
    } else {
      // il tient tête : il gronde face aux chasseurs qui s'en vont
      const p = pos[0];
      if (p) b.heading = Math.atan2(p[0] - b.x, p[1] - b.z);
      anim = h.t > 1.2 ? ['Headbutt'] : ['Idle'];
    }
    if (h.flinch > 0) { speed *= 0.25; anim = ['Jump_Start', 'Idle']; }
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
    if (speed > 0 && d > 0.02) {
      const st = Math.min(d, speed * dt), nx = b.x + (dx / d) * st, nz = b.z + (dz / d) * st;
      if (this.free(nx, nz) || h.mode === 'flee') { b.x = nx; b.z = nz; }
      else if (h.mode === 'prowl') h.ang += 0.6;
      b.heading = Math.atan2(dx, dz);
    }
    b.obj.position.set(b.x, g(b.x, b.z), b.z);
    b.obj.rotation.y = b.heading;
    if (b.actor) { play(b.actor, anim); b.actor.mixer.update(dt); }
    // les lances des chasseurs, lancées en avant du loup qui court
    if (a.phase === 'work' && h.mode !== 'bite')
      a.party.forEach((id, i) => {
        const p = pos[i];
        if (!p) return;
        let t = (this.spearT.get(id) ?? 1.2 + i * 0.9) - dt;
        if (t <= 0 && Math.hypot(p[0] - b.x, p[1] - b.z) < 2.8) {
          t = 2.4 + Math.random() * 1.6;
          const lx = b.x + (tx - b.x) * 0.25, lz = b.z + (tz - b.z) * 0.25;
          const to = new THREE.Vector3(lx + (Math.random() - 0.5) * 0.3, g(lx, lz) + 0.04, lz + (Math.random() - 0.5) * 0.3);
          this.fire(new THREE.Vector3(p[0], g(p[0], p[1]) + 0.17, p[1]), to, () => {
            if (Math.hypot(b.x - to.x, b.z - to.z) < 0.32) { this.combat?.hit(b.x, g(b.x, b.z) + 0.12, b.z, 0xffd27a, 12); h.flinch = 0.4; }
          });
          this.agents.partyAct([id], 'work');
        }
        this.spearT.set(id, t);
      });
    // les chiens harcèlent le loup, de part et d'autre ; il détale, ils le poursuivent un peu puis reviennent aux chasseurs
    this.dogs.forEach((dg, i) => {
      dg.obj.visible = true;
      const away = h.mode === 'flee' && h.t < 4.5;
      const side = i ? 1 : -1, back = b.heading + Math.PI + side * 0.8;
      const gx = away ? cx + side * 0.25 : b.x + Math.sin(back) * 0.38, gz = away ? cz + 0.2 : b.z + Math.cos(back) * 0.38;
      const ddx = gx - dg.x, ddz = gz - dg.z, dd = Math.hypot(ddx, ddz);
      let moving = false;
      if (dd > 0.06) { const st = Math.min(dd, dg.speed * dt); dg.x += (ddx / dd) * st; dg.z += (ddz / dd) * st; dg.heading = Math.atan2(ddx, ddz); moving = true; }
      else dg.heading = Math.atan2(b.x - dg.x, b.z - dg.z);
      dg.obj.position.set(dg.x, g(dg.x, dg.z), dg.z);
      dg.obj.rotation.y = dg.heading;
      if (dg.actor) { play(dg.actor, moving ? ['Run'] : Math.sin(this.t * 3 + i) > 0.6 ? ['Jump_Start', 'Idle'] : ['Idle']); dg.actor.mixer.update(dt); }
    });
  }

  /**
   * La chasse au mammouth, selon l'avancement : la harde paît pendant qu'on prépare la chasse (les fosses creusées puis
   * couvertes, les rabatteurs postés derrière elle, les guetteurs tapis) ; puis l'on pousse le vieux mâle vers le piège, ou on
   * l'encercle, et les autres s'écartent. Au retour, l'issue : il tombe dans la fosse, reste coincé au fond du ravin ou se
   * couche, épuisé ; à l'échec, la harde s'éloigne (un imprévu la mène d'abord : elle se disperse, le vieux mâle charge…)
   */
  private stepMammothHunt(dt: number, a: ActiveExpedition, k: number) {
    const h = this.mam!, old = h.old, away = a.phase === 'back' || a.phase === 'home', [cx, cz] = a.dest;
    const K = (h.k = Math.max(h.k, k)), sx = Math.sin(h.dir), sz = Math.cos(h.dir), chase = K >= 0.3 || away;
    if (away) h.back += dt;
    // les fosses se creusent au début du travail, puis on les couvre de branchages ; celle où tombe le vieux mâle cède
    h.pits.forEach((p, i) => { p.scale.setScalar(Math.max(0.001, smooth(Math.min(1, K / 0.22)))); h.covers[i].visible = K > 0.24 && !(i === 0 && old.sink > 0.01); });
    for (const m of this.mammoths) {
      const b = m.b;
      if (b.held || !b.obj.visible) continue;
      if (b.flee !== undefined) {
        b.fled = (b.fled ?? 0) + dt;
        this.sMove(b, b.x + Math.sin(b.flee) * 2, b.z + Math.cos(b.flee) * 2, 0.6 + m.size * 0.2, dt, [], true);
        if (b.fled > 7) b.obj.visible = false;
        continue;
      }
      // l'échec : ce qu'il reste de la harde s'éloigne de l'équipe qui repart
      if (away && !a.ok && h.back > 0.8) { const [tx, tz] = this.teamAt(a); b.flee = Math.atan2(b.x - tx, b.z - tz) + (m.size - 1) * 0.5; continue; }
      if (m === old && chase) { this.stepOldMale(dt, a, away); continue; }
      // les autres paissent, chacun de son côté ; la chasse lancée, ils s'écartent plus loin (suivie de loin, la harde prend de
      // l'avance)
      const far = chase ? (h.way === 'follow' ? 2.4 : 1.4) : 0, side = (this.mammoths.indexOf(m) - 1) * 0.55;
      this.graze(m, [h.at[0] + sx * far + sz * side, h.at[1] + sz * far - sx * side], chase ? 0.4 : 0.5, chase ? 0.3 : 0.1, dt, cx, cz);
    }
    // ils ne se marchent pas dessus : deux mammouths trop proches s'écartent (pas celui qui est pris, ni celui qu'un imprévu mène)
    const ms = this.mammoths;
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const p = ms[i].b, q = ms[j].b, d = Math.hypot(q.x - p.x, q.z - p.z), min = 0.26 * (ms[i].size + ms[j].size);
      if (d >= min || !p.obj.visible || !q.obj.visible) continue;
      const ux = d > 1e-3 ? (q.x - p.x) / d : 1, uz = d > 1e-3 ? (q.z - p.z) / d : 0, push = (min - d) * 0.5 * Math.min(1, dt * 4);
      for (const [mm, s] of [[ms[i], -1], [ms[j], 1]] as [Mammoth, number][]) {
        const b = mm.b, nx = b.x + ux * push * s, nz = b.z + uz * push * s;
        if (!b.held && !mm.lie && !mm.sink && this.free(nx, nz)) { b.x = nx; b.z = nz; }
      }
    }
    // la caméra garde le camp et le vieux mâle dans le cadre
    this.focus = [(cx + old.b.x) / 2, (cz + old.b.z) / 2];
    if (a.phase === 'work' && !a.wait && K >= 0.4) this.throwSpears(dt, a);
  }

  /** Un mammouth paît autour de `c` : il va d'une touffe à l'autre et s'arrête brouter ; le petit reste dans les pas de sa mère */
  private graze(m: Mammoth, c: [number, number], r: number, speed: number, dt: number, cx: number, cz: number) {
    const b = m.b, mom = this.mammoths[1]?.b;
    if (m.size < 0.7 && mom && mom !== b) {
      if (Math.hypot(mom.x - b.x, mom.z - b.z) > 0.45) this.sMove(b, mom.x, mom.z, 0.32, dt, [], true);
      else this.sMove(b, b.x, b.z, 0, dt);
      return;
    }
    if (!this.sMove(b, b.tx, b.tz, speed, dt) && (b.wait -= dt) <= 0) {
      b.wait = 2.5 + Math.random() * 4;
      const ang = Math.random() * Math.PI * 2, d = Math.random() * r;
      [b.tx, b.tz] = this.near(c[0] + Math.cos(ang) * d, c[1] + Math.sin(ang) * d, cx, cz);
    }
  }

  /**
   * Le vieux mâle, la chasse lancée : poussé vers le piège (au bord des fosses, à l'entrée du ravin) ou traînant derrière la
   * harde ; il s'agite et barrit. Au retour d'une chasse réussie, il tombe dans la fosse, s'engage au fond du ravin et y reste
   * coincé, ou se couche, épuisé
   */
  private stepOldMale(dt: number, a: ActiveExpedition, away: boolean) {
    const h = this.mam!, m = h.old, b = m.b, [tx, tz] = h.trap, [ux, uz] = h.axis, won = away && a.ok;
    if (h.way === 'pits') {
      if (!this.sMove(b, won ? tx : tx - ux * 0.42, won ? tz : tz - uz * 0.42, won ? 0.3 : 0.12, dt, [], true) && won) m.sink = Math.min(0.14, m.sink + dt * 0.12);
    } else if (h.way === 'ravine') {
      if (!this.sMove(b, tx + ux * (won ? 0.3 : -0.5), tz + uz * (won ? 0.3 : -0.5), won ? 0.45 : 0.16, dt, [], true) && won) m.sink = Math.min(0.05, m.sink + dt * 0.05);
    } else if (won) {
      // à bout de souffle, il se couche là où il est
      this.sMove(b, b.x, b.z, 0, dt);
      m.lie = Math.min(1, m.lie + dt * 0.4);
    } else this.sMove(b, tx, tz, 0.08, dt, [], true);
    // il s'agite : il barrit de temps en temps, plus souvent une fois pris (pas couché, épuisé)
    if (m.lie < 0.3 && Math.random() < dt * (won ? 0.5 : 0.22)) m.trumpet = 1;
  }

  /** Les chasseurs lancent leurs lances vers le vieux mâle, de près et à tour de rôle : elles se plantent à ses pieds, il barrit */
  private throwSpears(dt: number, a: ActiveExpedition) {
    const m = this.mam!.old, b = m.b, g = (x: number, z: number) => this.world.surfaceAt(x, z);
    if (b.held) return;
    const pos = this.agents.partyPositions(a.party);
    a.party.forEach((id, i) => {
      const p = pos[i];
      if (!p) return;
      let t = (this.spearT.get(id) ?? 1 + i * 0.8) - dt;
      if (t <= 0 && Math.hypot(p[0] - b.x, p[1] - b.z) < 1.6 && this.agents.memberDone(id)) {
        t = 2.6 + Math.random() * 2;
        const to = new THREE.Vector3(b.x + (Math.random() - 0.5) * 0.3, g(b.x, b.z) + 0.04, b.z + (Math.random() - 0.5) * 0.3);
        this.fire(new THREE.Vector3(p[0], g(p[0], p[1]) + 0.17, p[1]), to, () => { this.combat?.puff(to.x, to.y, to.z, 6); m.trumpet = 1; });
        this.agents.partyAct([id], 'work');
      }
      this.spearT.set(id, t);
    });
  }

  /**
   * Les mammouths vivent : ils marchent, chargent, paissent ou se reposent selon leur allure (les clips de `beasts.ts`, au
   * rythme de leur pas), barrissent trompe levée (avec un souffle de vapeur dans l'air froid) ; couché, il replie ses pattes ;
   * pris dans la fosse, il y est enfoncé
   */
  private stepMammoths(dt: number) {
    for (const m of this.mammoths) {
      const b = m.b, o = b.obj, a = m.actor, moved = Math.hypot(b.x - m.px, b.z - m.pz);
      m.px = b.x; m.pz = b.z;
      if (dt > 0) m.v += (moved / dt - m.v) * Math.min(1, dt * 6);
      m.ph += moved / (0.07 * m.size);
      // un mammouth qui charge barrit
      if (m.v > 0.8) m.trumpet = Math.max(m.trumpet, 0.7);
      const fresh = m.trumpet > 0.95;
      m.trumpet = Math.max(0, m.trumpet - dt * 0.8);
      const up = Math.sin(Math.min(1, m.trumpet) * Math.PI * 0.5);
      // l'allure : couché, au galop, au pas, ou à l'arrêt (il barrit, broute ou regarde autour de lui)
      const roar = a.actions.get('Idle_2')!, roaring = a.current === roar && roar.isRunning();
      const run = m.v > 0.3 * m.size, walk = m.v > 0.02 * m.size;
      if (m.lie > 0.05) play(a, ['Sleep'], 0.8);
      else if (run) play(a, ['Gallop']);
      else if (walk && !roaring) play(a, ['Walk']);
      else if (fresh && !roaring) { a.current?.fadeOut(0.2); a.current = null; play(a, ['Idle_2'], 0.2); }
      else if (!roaring) play(a, [Math.sin(this.t * 0.15 + m.size * 9) > 0.2 ? 'Eating' : 'Idle'], 0.5);
      // le pas suit la vitesse (calée sur la taille : un petit trottine)
      a.actions.get('Walk')!.timeScale = Math.min(1.8, Math.max(0.6, m.v / (0.15 * m.size)));
      a.actions.get('Gallop')!.timeScale = Math.min(1.6, Math.max(0.7, m.v / (0.43 * m.size)));
      a.mixer.update(dt);
      o.position.set(b.x, this.world.surfaceAt(b.x, b.z) - m.sink * m.size, b.z);
      if (up > 0.8 && o.visible && Math.random() < dt * 5) {
        const f = 0.5 * m.size;
        this.puffAt(b.x + Math.sin(b.heading) * f, o.position.y + 0.62 * m.size, b.z + Math.cos(b.heading) * f, 'puff', Math.sin(b.heading) * 0.1, Math.cos(b.heading) * 0.1);
      }
    }
  }

  /** La barque va et vient entre la berge et le large, en tanguant ; ses passagers y sont assis */
  private stepBoat(dt: number) {
    const bt = this.boat!;
    let u: number, back: boolean;
    // retenu par la suite d'un imprévu, il reste où il est ; libéré, il rattrape le travail en douceur
    // (il attend aussi au quai que tout l'équipage soit monté)
    this.boardT += dt;
    const boarding = !this.salv && [...bt.riders, ...(this.escort?.riders ?? [])].some((id) => !this.aboard.has(id));
    if (this.moor || boarding) this.idle += dt;
    else this.boatK = this.workK <= this.boatK ? this.workK : Math.min(this.workK, this.boatK + dt * 0.02 + (this.workK - this.boatK) * Math.min(1, dt * 0.6));
    if (this.scout) { if (this.scout.trip) this.stepTrip(dt, boarding); else this.stepScout(dt, boarding); return; }
    if (this.offshore) {
      // au large : elle file jusqu'à l'eau profonde, y reste tout le travail, et rentre à la rive quand il s'achève
      // (la galère de la chasse reste sur place jusqu'à ce que le monstre soit mort ou enfui, voir `FATE_AT`)
      const k = this.boatK, home = this.monster ? 0.87 : 0.8, go = this.isle ? ISLE_LAND : this.story === 'isles' ? FLOAT_LAND - 0.01 : 0.2;
      // (rentré au quai à 0,93 du travail : le temps que l'équipage redescende avant de repartir)
      u = k < go ? smooth(k / go) : k < home ? 1 : 1 - smooth(Math.min(1, (k - home) / (0.93 - home)));
      back = k >= home;
    } else {
      // aller-retour lent (une vingtaine de secondes), pause au large le temps de pêcher
      const ph = ((this.t - this.idle) / 22) % 1;
      // (à la fin du travail, elle revient au quai, où l'équipage redescend)
      u = (ph < 0.3 ? smooth(ph / 0.3) : ph < 0.75 ? 1 : 1 - smooth((ph - 0.75) / 0.25)) * Math.min(1, Math.max(0, (0.95 - this.workK) / 0.07));
      back = ph >= 0.75 || this.workK > 0.88;
    }
    const war = this.story === 'megalodon' || this.story === 'kraken', es = this.escort;
    // la seconde galère de la chasse part avec la première, avec sa part de l'équipage, et prend le monstre de l'autre côté
    // (l'équipe du portail débarque sur l'île le temps du travail : la galère l'attend, vide, au bord de la plage)
    const ashore = !!this.isle && this.offshore && this.boatK >= ISLE_LAND && this.boatK < ISLE_BACK;
    const afloat = !!this.float && this.offshore && this.boatK >= FLOAT_LAND && this.boatK < FLOAT_BACK;
    // on monte à bord depuis le quai (la berge au plus près de l'amarrage), et l'on y redescend, revenu, avant de rentrer à pied
    const docked = this.offshore ? this.boatK >= 0.93 || this.workK >= 0.985 : this.workK >= 0.96;
    const crew = ashore || afloat || this.salv ? [] : this.embark(es ? bt.riders.filter((id) => !es.riders.includes(id)) : bt.riders, bt.home, docked);
    const [px, pz] = this.sail(bt.obj, bt.home, bt.out, bt.y, u, back, dt, crew, war || !!this.isle, 0, this.salv ? 0.2 : 1);
    if (es) this.sail(es.obj, es.home, es.out, bt.y, u, back, dt, this.embark(es.riders, es.home, docked), war, 1.3);
    // la chasse : la vue garde le combat entier (les deux galères, le monstre entre elles)
    this.focus = this.arena && es ? [(px + es.obj.position.x) / 2, (pz + es.obj.position.z) / 2] : this.salv ? this.salv.focus : [px, pz];
    if (ashore) { if (this.volc) this.stepVolcano(this.boatK, bt.riders); else this.stepIsle(this.boatK); }
    if (this.float) this.stepFloat(afloat);
  }

  /**
   * La route des éclaireurs : depuis le mouillage (wx, wz), le plus court chemin sur l'eau (cases où une barque flotte) jusqu'à
   * l'eau la plus proche de la plage rivale (`TownPlan.points.plage`), allégé en points espacés ; puis, sur l'île, la marche
   * de la plage vers la ville et le poste d'observation, à mi-chemin des remparts. Faux s'il n'y a pas de route (la barque
   * reste alors au large, comme un voyage)
   */
  private scoutTrip(a: ActiveExpedition, wx: number, wz: number) {
    const w = this.world, ally = w.diplo.ally;
    const plan = ally ? townPlans(w).find((p) => p.people !== ally) : null;
    if (!plan) return false;
    const [bx, bz] = plan.points.plage, wet = (x: number, z: number) => w.inCells(x, z) && this.depth(x + 0.5, z + 0.5) !== null;
    // le départ : la case d'eau la plus proche du mouillage (il tombe souvent au coin d'une case de berge : on la refusait,
    // et la barque partait en simple voyage, deux à bord, le troisième éclaireur resté au quai)
    let start = -1, sd = Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = Math.floor(wx) + dx, z = Math.floor(wz) + dz, d = Math.hypot(x + 0.5 - wx, z + 0.5 - wz);
      if (d < sd && wet(x, z)) { sd = d; start = z * N + x; }
    }
    if (start < 0) return false;
    // toute l'eau que la barque peut atteindre (huit voisins, sans couper un coin de terre)
    const from = new Int32Array(N * N).fill(-1), q = [start];
    from[start] = start;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % N, z = (c / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N || from[k] >= 0 || !wet(nx, nz)) continue;
        if (dx && dz && (!wet(x + dx, z) || !wet(x, z + dz))) continue;
        from[k] = c; q.push(k);
      }
    }
    // le but : de cette eau-là, la case la plus proche de la plage (la plus proche tout court pouvait être une flaque
    // fermée au bord de la plage : plus de route, et la scène retombait en simple voyage)
    let goal = -1, gd = Infinity;
    for (let dz = -SCOUT_REACH; dz <= SCOUT_REACH; dz++) for (let dx = -SCOUT_REACH; dx <= SCOUT_REACH; dx++) {
      const x = Math.floor(bx) + dx, z = Math.floor(bz) + dz, d = Math.hypot(dx, dz);
      if (d < gd && w.inCells(x, z) && from[z * N + x] >= 0) { gd = d; goal = z * N + x; }
    }
    if (goal < 0) return false;
    const cells: number[] = [];
    for (let c = goal; c !== start; c = from[c]) cells.push(c);
    cells.push(start);
    cells.reverse();
    const route: [number, number][] = [[wx, wz]];
    for (let i = 4; i < cells.length - 1; i += 4) route.push([(cells[i] % N) + 0.5, ((cells[i] / N) | 0) + 0.5]);
    route.push([(goal % N) + 0.5, ((goal / N) | 0) + 0.5]);
    const len = [0];
    for (let i = 1; i < route.length; i++) len.push(len[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
    // sur l'île : la plage, puis vers la ville jusqu'au poste d'observation (à mi-chemin des remparts, sur la terre)
    const walls: [number, number] = plan.points.portes[0] ?? [plan.x, plan.z];
    const land: [number, number] = [bx, bz];
    // le poste : à `SCOUT_GAP` cases de la porte, côté plage, sur la terre ferme (à mi-chemin, il était à une vingtaine de
    // cases des remparts, hors de la vue ; et un creux sous le niveau de la mer les tapissait dans une flaque)
    const gl = Math.max(0.01, Math.hypot(walls[0] - bx, walls[1] - bz));
    let post: [number, number] = [(bx + walls[0]) / 2, (bz + walls[1]) / 2];
    for (const gap of [SCOUT_GAP, SCOUT_GAP + 1, SCOUT_GAP - 1, SCOUT_GAP + 2, SCOUT_GAP + 3, SCOUT_GAP + 5, SCOUT_GAP + 8]) {
      const k = Math.max(0.1, 1 - gap / gl), p: [number, number] = [bx + (walls[0] - bx) * k, bz + (walls[1] - bz) * k];
      if (this.dry(p[0], p[1])) { post = p; break; }
    }
    const mid: [number, number] = [(land[0] + post[0]) / 2 + (post[1] - land[1]) * 0.12, (land[1] + post[1]) / 2 - (post[0] - land[0]) * 0.12];
    // on met pied à terre sur la berge la plus proche de l'accostage, puis on remonte vers la plage
    const ashore = this.dockOf(route[route.length - 1]);
    const walk: [number, number][] = Math.hypot(ashore[0] - land[0], ashore[1] - land[1]) > 0.5 ? [ashore, land, mid, post] : [land, mid, post];
    this.scout = { route, len, walk, post, walls };
    void a;
    return true;
  }

  /**
   * Une route sur l'eau du point (wx, wz) jusqu'à l'eau la plus proche de (tx, tz), à `reach` cases au plus : le plus court
   * chemin sur les cases où un bateau flotte, allégé d'un point sur quatre ; null s'il n'y en a pas
   */
  private waterRoute(wx: number, wz: number, tx: number, tz: number, reach: number): [number, number][] | null {
    const w = this.world, wet = (x: number, z: number) => w.inCells(x, z) && this.depth(x + 0.5, z + 0.5) !== null;
    let start = -1, sd = Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = Math.floor(wx) + dx, z = Math.floor(wz) + dz, d = Math.hypot(x + 0.5 - wx, z + 0.5 - wz);
      if (d < sd && wet(x, z)) { sd = d; start = z * N + x; }
    }
    if (start < 0) return null;
    const from = new Int32Array(N * N).fill(-1), q = [start];
    from[start] = start;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % N, z = (c / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N || from[k] >= 0 || !wet(nx, nz)) continue;
        if (dx && dz && (!wet(x + dx, z) || !wet(x, z + dz))) continue;
        from[k] = c; q.push(k);
      }
    }
    let goal = -1, gd = Infinity;
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      const x = Math.floor(tx) + dx, z = Math.floor(tz) + dz, d = Math.hypot(dx, dz);
      if (d < gd && w.inCells(x, z) && from[z * N + x] >= 0) { gd = d; goal = z * N + x; }
    }
    if (goal < 0) return null;
    const cells: number[] = [];
    for (let c = goal; c !== start; c = from[c]) cells.push(c);
    cells.push(start);
    cells.reverse();
    const route: [number, number][] = [[wx, wz]];
    for (let i = 4; i < cells.length - 1; i += 4) route.push([(cells[i] % N) + 0.5, ((cells[i] / N) | 0) + 0.5]);
    route.push([(goal % N) + 0.5, ((goal / N) | 0) + 0.5]);
    return route;
  }

  /** Un point de terre ferme sur le segment (a → b), le plus près de `k` (part de a à b) qui convienne */
  private dryOn(a: [number, number], b: [number, number], ks: number[]): [number, number] | null {
    for (const k of ks) { const p: [number, number] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; if (this.dry(p[0], p[1])) return p; }
    return null;
  }

  /**
   * Les pourparlers de la paix (« Les émissaires », « L'ambassade de la paix ») vont vraiment sur les îles, et en reviennent
   * (retour de l'auteur, 17 nov. 2026 : « ne vont pas sur l'île »). La route sur l'eau, puis :
   * - les émissaires débarquent sur la plage rivale (par l'île alliée, `variant: 'ally'`) et montent jusque devant la porte
   *   de la ville, où une délégation les reçoit (le chef, deux gardes, une table dressée) ;
   * - la petite île (`islet`) : on accoste la plus proche des petites îles, où les deux chefs attendent sous une tente
   *   blanche, autour d'une table ronde, leurs deux voiliers mouillés à la plage ;
   * - à bord (`ship`) : le bateau s'arrête au milieu du bras de mer, les voiliers des deux chefs viennent se ranger de part
   *   et d'autre d'un radeau où l'on signe, puis repartent.
   * Faux s'il n'y a pas de route (la scène reste alors un simple voyage)
   */
  private tripSetup(a: ActiveExpedition, wx: number, wz: number) {
    const w = this.world, ally = w.diplo.ally;
    if (!ally || !w.isles) return false;
    const plans = townPlans(w), rival = plans.find((p) => p.people !== ally), friend = plans.find((p) => p.people === ally);
    if (!rival || !friend) return false;
    const v = a.c.variant, level = this.water!.level;
    let route: [number, number][] | null = null, kind: 'envoy' | 'islet' | 'ship' = 'envoy', meet: [number, number] = [wx, wz], face: [number, number] = [wx, wz];
    if (a.m.id === 'envoys') {
      const [px, pz] = rival.points.plage;
      // (par l'île alliée : on longe sa plage d'abord)
      const first = v === 'ally' ? this.waterRoute(wx, wz, friend.points.plage[0], friend.points.plage[1], SCOUT_REACH) : null;
      const from = first ? first[first.length - 1] : ([wx, wz] as [number, number]);
      const second = this.waterRoute(from[0], from[1], px, pz, SCOUT_REACH);
      if (!second) return false;
      route = first ? [...first, ...second.slice(1)] : second;
      const gate: [number, number] = rival.points.portes[0] ?? [rival.x, rival.z];
      face = gate;
      meet = this.dryOn([px, pz], gate, [0.75, 0.7, 0.8, 0.6, 0.85, 0.5]) ?? [px, pz];
    } else if (v === 'islet') {
      kind = 'islet';
      const mid: [number, number] = [(rival.x + friend.x) / 2, (rival.z + friend.z) / 2];
      const isle = [...w.isles.small].sort((p, q) => Math.hypot(p.x - mid[0], p.z - mid[1]) - Math.hypot(q.x - mid[0], q.z - mid[1]))[0];
      if (!isle) return false;
      route = this.waterRoute(wx, wz, isle.x, isle.z, Math.ceil(isle.r) + 8);
      if (!route) return false;
      const end = route[route.length - 1], shore = this.dockOf(end);
      face = [isle.x, isle.z];
      meet = this.dryOn(shore, [isle.x, isle.z], [0.12, 0.1, 0.16, 0.08, 0.2, 0.06]) ?? shore;
    } else {
      kind = 'ship';
      const mid: [number, number] = [(rival.x + friend.x) / 2, (rival.z + friend.z) / 2];
      route = this.waterRoute(wx, wz, mid[0], mid[1], 40);
      if (!route) return false;
      meet = route[route.length - 1];
      face = mid;
    }
    const len = [0];
    for (let i = 1; i < route.length; i++) len.push(len[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
    const end = route[route.length - 1];
    const ashore: [number, number] = kind === 'ship' ? end : this.dockOf(end);
    const walk: [number, number][] = kind === 'ship' ? [end, end] : [ashore, meet];
    // ceux qui les reçoivent, et le décor de la rencontre
    const props: THREE.Object3D[] = [];
    const ang = Math.atan2(face[0] - meet[0], face[1] - meet[1]), fx = Math.sin(ang), fz = Math.cos(ang), sx = Math.cos(ang), sz = -Math.sin(ang);
    const host = (role: FolkRole, x: number, z: number, y: number | null, look: number) => {
      const n = this.npc(role, a.age, x, z, look, 'idle');
      if (y !== null) n.folk.root.position.y = y;
      props.push(n.folk.root);
    };
    const prop = (g: THREE.BufferGeometry, x: number, z: number, ry: number, y: number | null = null, s = 1) => {
      const m = this.put(g, x, z, ry);
      if (y !== null) m.position.y = y;
      m.scale.setScalar(s);
      props.push(m);
      return m;
    };
    if (kind === 'envoy') {
      // la délégation rivale, à quelques pas devant la porte, face aux émissaires ; une table dressée entre eux
      const hx = meet[0] + fx * 1.1, hz = meet[1] + fz * 1.1, back = ang + Math.PI;
      host('sage', hx, hz, null, back);
      host('villager', hx + sx * 0.45, hz + sz * 0.45, null, back);
      host('villager', hx - sx * 0.45, hz - sz * 0.45, null, back);
      prop(tableGeo(false), meet[0] + fx * 0.55, meet[1] + fz * 0.55, ang + Math.PI / 2);
      prop(potsGeo(), meet[0] + fx * 0.55 + sx * 0.12, meet[1] + fz * 0.55 + sz * 0.12, 0, null, 0.6);
    } else if (kind === 'islet') {
      // la tente blanche, la table ronde, les deux chefs ; leurs voiliers mouillés à la plage
      prop(tentGeoC(0xf4f0e6), meet[0] + fx * 0.9, meet[1] + fz * 0.9, ang + Math.PI / 2, null, 1.6);
      prop(tableGeo(true), meet[0] + fx * 0.25, meet[1] + fz * 0.25, 0);
      host('sage', meet[0] + fx * 0.45 + sx * 0.25, meet[1] + fz * 0.45 + sz * 0.25, null, ang + Math.PI);
      host('scholar', meet[0] + fx * 0.45 - sx * 0.25, meet[1] + fz * 0.45 - sz * 0.25, null, ang + Math.PI);
      for (const s of [-1, 1]) {
        const bx = end[0] + sx * s * 1.1, bz = end[1] + sz * s * 1.1;
        if (this.depth(bx, bz) === null) continue;
        prop(boatGeo('sail'), bx, bz, ang + Math.PI, level + 0.005);
      }
    } else {
      // au milieu du bras de mer : le radeau de la signature et sa table, les voiliers des deux chefs de part et d'autre
      const rx = end[0] + sx * 0.6, rz = end[1] + sz * 0.6;
      prop(deckGeo(false), rx, rz, ang, level - 0.01, 1.4);
      prop(tableGeo(true), rx, rz, 0, level + 0.01);
      host('sage', rx + fx * 0.12, rz + fz * 0.12, level + 0.02, ang + Math.PI);
      host('scholar', rx - fx * 0.12, rz - fz * 0.12, level + 0.02, ang);
      for (const s of [1, 2.1]) {
        const bx = end[0] + sx * s * 1.1 + fx * (s > 1.5 ? 0.6 : -0.6), bz = end[1] + sz * s * 1.1 + fz * (s > 1.5 ? 0.6 : -0.6);
        prop(boatGeo('sail'), bx, bz, ang + (s > 1.5 ? Math.PI : 0), level + 0.005);
      }
    }
    for (const o of props) o.visible = false;
    this.scout = { route, len, walk, post: meet, walls: face, trip: { kind, props } };
    return true;
  }

  /**
   * Un pourparler de la paix : le bateau suit sa route jusqu'à l'île (la vue le suit), l'équipe débarque et marche jusqu'au lieu
   * de la rencontre, y reste face à ses hôtes, revient à bord ; le bateau refait la route en sens inverse et l'équipe redescend
   * au quai. À bord (`ship`), personne ne débarque : les hôtes viennent au bateau
   */
  private stepTrip(dt: number, boarding: boolean) {
    const bt = this.boat!, sc = this.scout!, tr = sc.trip!, w = this.world;
    if (!this.moor && !boarding) this.boatK = this.workK <= this.boatK ? this.workK : Math.min(this.workK, this.boatK + dt * 0.02 + (this.workK - this.boatK) * Math.min(1, dt * 0.6));
    const k = this.boatK, total = sc.len[sc.len.length - 1];
    const back = k >= TRIP_BOARD, f = k < TRIP_OUT ? smooth(k / TRIP_OUT) : back ? 1 - smooth(Math.min(1, (k - TRIP_BOARD) / (TRIP_HOME - TRIP_BOARD))) : 1, d = f * total;
    let i = 1;
    while (i < sc.len.length - 1 && sc.len[i] < d) i++;
    const seg = Math.max(0.001, sc.len[i] - sc.len[i - 1]), u = Math.min(1, Math.max(0, (d - sc.len[i - 1]) / seg));
    // les hôtes paraissent quand on approche, et s'en vont quand on repart
    const there = k >= TRIP_OUT * 0.8 && k < TRIP_BOARD + 0.06;
    for (const o of tr.props) o.visible = tr.kind === 'ship' ? there : k >= TRIP_OUT * 0.5;
    const ashore = tr.kind !== 'ship' && k >= TRIP_OUT && k < TRIP_BOARD;
    const docked = k >= TRIP_HOME || this.workK >= 0.985;
    const crew = ashore ? [] : this.embark(bt.riders, bt.home, docked);
    const [px, pz] = this.sail(bt.obj, sc.route[i - 1], sc.route[i], bt.y, u, back, dt, crew, false, 0);
    this.focus = [px, pz];
    if (!ashore) {
      // à bord, au milieu du bras de mer : debout, tournés vers le radeau, le temps de la signature
      if (tr.kind === 'ship' && k >= TRIP_OUT && k < TRIP_BOARD && !this.crewAct) { this.crewAct = 'cheer'; this.crewFace = Math.atan2(sc.walls[0] - px, sc.walls[1] - pz); }
      return;
    }
    const t = k < TRIP_MEET ? smooth((k - TRIP_OUT) / (TRIP_MEET - TRIP_OUT)) : k < TRIP_LEAVE ? 1 : 1 - smooth((k - TRIP_LEAVE) / (TRIP_BOARD - TRIP_LEAVE));
    const [ax, az] = sc.walk[0], [mx, mz] = sc.walk[sc.walk.length - 1], n = bt.riders.length;
    const hx = sc.walls[0] - mx, hz = sc.walls[1] - mz, hl = Math.max(0.01, Math.hypot(hx, hz));
    const going = k < TRIP_MEET, leaving = k >= TRIP_LEAVE;
    bt.riders.forEach((id, j) => {
      const off = (j - (n - 1) / 2) * 0.3, s = smooth(Math.max(0, Math.min(1, t * 1.15 - j * 0.05)));
      const x = ax + (mx - ax) * s - (hz / hl) * off * s, z = az + (mz - az) * s + (hx / hl) * off * s;
      const heading = going ? Math.atan2(mx - ax, mz - az) : leaving ? Math.atan2(ax - mx, az - mz) : Math.atan2(hx, hz);
      this.agents.ride(id, { x, z, y: w.surfaceAt(x, z), heading, act: this.crewAct ?? (going || leaving ? 'stroll' : k > TRIP_LEAVE - 0.05 ? 'cheer' : null) });
    });
    this.focus = [(mx * 2 + sc.walls[0]) / 3, (mz * 2 + sc.walls[1]) / 3];
  }

  /**
   * Les éclaireurs : la barque suit sa route jusqu'à la plage rivale (la vue la suit), puis l'équipe débarque, remonte la
   * plage et les dunes en file, et se tapit au poste d'observation, face aux remparts (la barque reste à la plage, vide)
   */
  private stepScout(dt: number, boarding: boolean) {
    const bt = this.boat!, sc = this.scout!, w = this.world, k = this.boatK;
    // (la barque attend au quai que les trois soient montés)
    if (!this.moor && !boarding) this.boatK = this.workK <= this.boatK ? this.workK : Math.min(this.workK, this.boatK + dt * 0.02 + (this.workK - this.boatK) * Math.min(1, dt * 0.6));
    const total = sc.len[sc.len.length - 1], d = smooth(Math.min(1, k / SC_LAND)) * total;
    let i = 1;
    while (i < sc.len.length - 1 && sc.len[i] < d) i++;
    const seg = Math.max(0.001, sc.len[i] - sc.len[i - 1]), u = Math.min(1, Math.max(0, (d - sc.len[i - 1]) / seg));
    const ashore = k >= SC_LAND;
    const [px, pz] = this.sail(bt.obj, sc.route[i - 1], sc.route[i], bt.y, u, false, dt, ashore ? [] : this.embark(bt.riders, bt.home, false), false, 0);
    this.focus = [px, pz];
    if (!ashore) return;
    // sur l'île : la marche (en file, de la plage au poste), puis à plat ventre face aux remparts
    const t = Math.min(1, (k - SC_LAND) / (SC_POST - SC_LAND)), n = bt.riders.length;
    const along = (s: number): [number, number] => {
      const p = sc.walk, f = Math.max(0, Math.min(1, s)) * (p.length - 1), j = Math.min(p.length - 2, Math.floor(f)), r = f - j;
      return [p[j][0] + (p[j + 1][0] - p[j][0]) * r, p[j][1] + (p[j + 1][1] - p[j][1]) * r];
    };
    bt.riders.forEach((id, j) => {
      const s = smooth(Math.max(0, t - j * 0.06)), [x, z] = along(s);
      const [ax, az] = along(Math.min(1, s + 0.05)), off = (j - (n - 1) / 2) * 0.35;
      const hx = sc.walls[0] - sc.post[0], hz = sc.walls[1] - sc.post[1], hl = Math.max(0.01, Math.hypot(hx, hz));
      const at: [number, number] = t >= 1 ? [x - (hz / hl) * off, z + (hx / hl) * off] : [x, z];
      const heading = t >= 1 ? Math.atan2(hx, hz) : Math.atan2(ax - x, az - z);
      this.agents.ride(id, { x: at[0], z: at[1], y: w.surfaceAt(at[0], at[1]), heading, act: this.crewAct ?? (t >= 1 ? 'work' : 'stroll') });
    });
    const [lx, lz] = along(smooth(t));
    this.focus = t >= 1 ? [(sc.post[0] * 2 + sc.walls[0]) / 3, (sc.post[1] * 2 + sc.walls[1]) / 3] : [lx, lz];
  }

  /** L'équipe sur les îles flottantes : chacun suit son parcours (scan, balises, cultures, récolte, caisses au drone) */
  private stepFloat(afloat: boolean) {
    const f = this.float!, riders = this.boat!.riders, n = riders.length;
    riders.forEach((id, i) => {
      const pose = afloat ? f.crew(i, n, this.workK) : null;
      if (pose) this.agents.ride(id, { x: pose.x, z: pose.z, y: pose.y, heading: pose.heading, act: pose.act });
      f.tool(id, pose);
    });
    if (afloat) this.focus = f.focus;
  }

  /**
   * Le décor d'une expédition du volcan : le volcan le plus proche, le lieu du travail du côté d'où l'on vient, et la plage où
   * l'on aborde (tout droit depuis le mouillage `from`, la première terre de son île) ; venue à pied, le pied du cône. Faux
   * sans volcan (la scène retombe alors en simple voyage)
   */
  private volcanoSite(a: ActiveExpedition, from: [number, number]) {
    const w = this.world, v = nearestVolcano(w, from[0], from[1]);
    if (!v) return false;
    const gate = volcanoGate(w, v.f, a.c, from);
    let land: [number, number] = from;
    if (a.sea) {
      const isle = volcanoIsle(w, v.f), dx = v.f.x - from[0], dz = v.f.z - from[1], L = Math.max(0.01, Math.hypot(dx, dz));
      land = [v.f.x, v.f.z];
      for (let k = 0.5; k < L; k += 0.25) {
        const x = from[0] + (dx / L) * k, z = from[1] + (dz / L) * k;
        if (isle[w.ci(Math.floor(x), Math.floor(z))] && this.depth(x, z) === null) { land = [x + (dx / L) * 0.3, z + (dz / L) * 0.3]; break; }
      }
      this.isle = { land, gate };
    }
    this.volc = new VolcanoSite(w, this.group, this.props, a, land, gate, [v.f.x, v.f.z], (x, y, z, kind, vx, vz) => this.puffAt(x, y, z, kind, vx, vz));
    return true;
  }

  /** L'équipe sur le volcan : de la plage au lieu du travail, l'ouvrage, la descente (voir `VolcanoSite.place`) */
  private stepVolcano(k: number, ids: number[]) {
    ids.forEach((id, i) => {
      const p = this.volc!.place(i, k, this.isleBack, this.crewAct);
      this.agents.ride(id, { x: p.x, z: p.z, y: this.world.surfaceAt(p.x, p.z), heading: p.heading, act: p.act });
    });
  }

  /**
   * L'équipe du portail sur l'île : elle débarque, monte jusqu'à l'arche, s'y affaire en arc de cercle face à elle (on
   * allume les braseros, on déchiffre les runes), acclame le tourbillon qui s'éveille, puis redescend à la galère
   */
  private stepIsle(k: number) {
    const { land, gate } = this.isle!, riders = this.boat!.riders, w = this.world, n = riders.length;
    const toBeach = Math.atan2(land[1] - gate[1], land[0] - gate[0]);
    const t = k < ISLE_UP ? smooth((k - ISLE_LAND) / (ISLE_UP - ISLE_LAND)) : k < ISLE_DOWN ? 1 : 1 - smooth((k - ISLE_DOWN) / (ISLE_BACK - ISLE_DOWN));
    const moving = k < ISLE_UP || k >= ISLE_DOWN;
    riders.forEach((id, i) => {
      const off = i - (n - 1) / 2, ang = toBeach + off * 0.5;
      // sa place devant l'arche, et d'où il part sur la plage (côte à côte)
      const sx = gate[0] + Math.cos(ang) * 1.5, sz = gate[1] + Math.sin(ang) * 1.5;
      const bx = land[0] - Math.sin(toBeach) * off * 0.18, bz = land[1] + Math.cos(toBeach) * off * 0.18;
      const back = this.isleBack, x = bx + (sx - bx) * t + Math.cos(toBeach) * back, z = bz + (sz - bz) * t + Math.sin(toBeach) * back;
      const heading = moving ? Math.atan2(k < ISLE_UP ? sx - bx : bx - sx, k < ISLE_UP ? sz - bz : bz - sz) : Math.atan2(gate[0] - x, gate[1] - z);
      this.agents.ride(id, { x, z, y: w.surfaceAt(x, z), heading, act: this.crewAct ?? (moving ? 'stroll' : k > ISLE_WAKE ? 'cheer' : 'work') });
    });
    this.focus = [gate[0] + Math.cos(toBeach) * 1.2, gate[1] + Math.sin(toBeach) * 1.2];
  }

  /**
   * Le quai d'un amarrage : le point de berge le plus proche (par où l'équipage monte à bord et redescend). Avant, l'équipe
   * s'arrêtait à deux cases du bateau et glissait jusqu'à sa place au-dessus de l'eau, puis, revenue, redescendait de sa place
   * et marchait dans l'eau jusqu'à la rive (retour de l'auteur, nov. 2026)
   */
  private dockOf(home: [number, number]): [number, number] {
    const key = `${home[0].toFixed(2)},${home[1].toFixed(2)}`, had = this.docks.get(key);
    if (had) return had;
    let dock: [number, number] = home;
    search: for (let r = 0.25; r <= 3; r += 0.25)
      for (let i = 0; i < 24; i++) {
        const x = home[0] + Math.cos((i / 24) * Math.PI * 2) * r, z = home[1] + Math.sin((i / 24) * Math.PI * 2) * r;
        if (this.dry(x, z)) { dock = [x, z]; break search; }
      }
    this.docks.set(key, dock);
    return dock;
  }

  /** Terre ferme : ni mer, ni lac, ni rivière, et le sol au-dessus de l'eau voisine (pas la vase de la rive) */
  private dry(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    if (!w.inCells(cx, cz)) return false;
    const k = w.ci(cx, cz);
    return !w.lake[k] && !w.isWet(cx, cz) && w.hAt(x, z) > SEA + 0.03;
  }

  /**
   * L'équipage d'un bateau : chacun va d'abord à pied jusqu'au quai, puis monte à bord (au bout de 8 s, il monte d'où il est) ;
   * `docked` : revenu au quai, chacun redescend sur la berge en glissant, puis y pose pied. Rend ceux qui sont à bord
   */
  private embark(ids: number[], home: [number, number], docked: boolean): number[] {
    const dock = this.dockOf(home), y = this.world.surfaceAt(dock[0], dock[1]), out: number[] = [];
    for (const id of ids) {
      const p = this.agents.partyPositions([id])[0];
      if (docked) {
        if (this.landed.has(id) || !this.aboard.has(id)) continue;
        if (!p || Math.hypot(p[0] - dock[0], p[1] - dock[1]) < 0.05) { this.agents.ride(id, null); this.landed.add(id); continue; }
        this.agents.ride(id, { x: dock[0], z: dock[1], y, heading: Math.atan2(dock[0] - p[0], dock[1] - p[1]), act: 'stroll' });
        continue;
      }
      if (this.aboard.has(id)) { out.push(id); continue; }
      if (!p || Math.hypot(p[0] - dock[0], p[1] - dock[1]) < 0.4 || this.boardT > 8) { this.aboard.add(id); out.push(id); continue; }
      if (!this.boarding.has(id)) { this.boarding.add(id); this.agents.memberGo(id, dock[0], dock[1], Math.atan2(home[0] - dock[0], home[1] - dock[1])); }
    }
    return out;
  }

  /**
   * Une place à bord : le bateau emporte son équipage (`move` : son déplacement depuis l'image d'avant, voir `Agents.ride`),
   * seul l'écart qui reste se glisse ; la barque des éclaireurs, qui file vite, l'emporte tout entier (`fixed`).
   * Sans cela, au départ et au retour vers la rive (la galère de chasse file alors bien plus vite que la glissade),
   * l'équipage traînait derrière, sur l'eau (retour de l'auteur, 17 nov. 2026)
   */
  private seat(id: number, r: Ride, move?: [number, number]) { this.agents.ride(id, this.scout ? { ...r, fixed: true } : move ? { ...r, move } : r); }

  /**
   * Une embarcation entre la rive (`home`) et le large (`out`), à `u` du trajet (`back` : elle rentre), qui tangue, et son
   * équipage `riders` assis à bord ; `ph` : son décalage de houle. Renvoie où elle est
   */
  private sail(obj: THREE.Object3D, home: [number, number], out: [number, number], level: number, u: number, back: boolean, dt: number, riders: number[], war: boolean, ph: number, calm = 1): [number, number] {
    const x = home[0] + (out[0] - home[0]) * u, z = home[1] + (out[1] - home[1]) * u, t = this.t + ph;
    // (au mouillage, le bateau de relevage reste bien en place : `calm` amortit sa houle)
    const sway = Math.sin(t * 0.4) * 0.12 * calm, dir = Math.atan2(out[0] - home[0], out[1] - home[1]);
    let px = x + Math.cos(dir) * sway, pz = z - Math.sin(dir) * sway;
    if (this.depth(px, pz) === null) { px = x; pz = z; }
    // le bateau de l'équipe s'écarte de sa route le temps d'un imprévu (il fuit, il vire, il longe une épave) ; jamais sur la terre
    const main = obj === this.boat?.obj, nd = this.nudged;
    if (main) {
      const k = Math.min(1, dt * 1.6);
      nd.x += (this.nudge.x - nd.x) * k; nd.z += (this.nudge.z - nd.z) * k; nd.yaw += (this.nudge.yaw - nd.yaw) * k; nd.lift += (this.nudge.lift - nd.lift) * Math.min(1, dt * 5);
      if (this.depth(px + nd.x, pz + nd.z) !== null) { px += nd.x; pz += nd.z; }
    }
    // dans les rapides, elle tangue et roule bien plus fort
    // (au demi-tour, elle vire en un peu plus d'une seconde au lieu de pivoter d'un coup)
    const aim = dir + (back ? Math.PI : 0), was = this.yaws.get(obj) ?? aim;
    const turn = Math.atan2(Math.sin(aim - was), Math.cos(aim - was)), yaw = was + Math.sign(turn) * Math.min(Math.abs(turn), dt * 2.4);
    this.yaws.set(obj, yaw);
    const rough = this.rough, heading = yaw + Math.sin(t * 0.4) * 0.15 * calm + Math.sin(t * 3.1) * 0.2 * rough + (main ? nd.yaw : 0);
    const y = level + 0.005 + Math.sin(t * 1.7) * 0.006 + Math.abs(Math.sin(t * 4.3)) * 0.02 * rough + (main ? nd.lift : 0);
    // (son déplacement depuis l'image d'avant : l'équipage le suit, voir `seat`)
    const prev = obj.position.x || obj.position.z ? [px - obj.position.x, pz - obj.position.z] as [number, number] : undefined;
    const move = prev && Math.hypot(prev[0], prev[1]) < 2 ? prev : undefined;
    obj.position.set(px, y, pz);
    obj.rotation.set(Math.sin(t * 1.3) * (0.03 * calm + 0.12 * rough), heading, Math.sin(t * 1.1 + rough * 2) * (0.04 * calm + 0.18 * rough));
    // le bateau à vapeur fume par sa cheminée
    if (this.boatKind === 'steam' && Math.random() < dt * 4) this.puffAt(px - Math.sin(heading) * 0.02, y + STEAM_FUNNEL[1] + 0.01, pz - Math.cos(heading) * 0.02, 'smoke', -Math.sin(heading) * 0.04, -Math.cos(heading) * 0.04);
    const sc = obj.scale.x, seat = BOAT_SEAT[this.boatKind], m = this.monster, mon = m && m.obj.visible ? m.obj.position : null;
    riders.forEach((id, i) => {
      // les hommes d'armes de la galère, répartis le long du bordage, face au monstre dès qu'il paraît ; sinon deux à bord :
      // le pêcheur à l'arrière
      // (sur la galère, deux par deux, un à chaque bord, les rangs serrés pour que tous tiennent dans la coque)
      const rows = Math.ceil(riders.length / 2), gap = rows > 1 ? Math.min(0.12, 0.34 / (rows - 1)) : 0;
      const lz = (war ? ((rows - 1) / 2 - Math.floor(i / 2)) * gap : i ? -0.08 : 0.06) * sc, sx = Math.sin(heading), cz = Math.cos(heading), side = war ? (i % 2 ? -0.04 : 0.04) * sc : 0;
      if (this.story === 'dive' && i === 1 && u > 0.97) {
        // le plongeur se met à l'eau, masque au ras de l'eau, à côté de la barque
        this.seat(id, { x: px + cz * 0.2, z: pz - sx * 0.2, y: y - 0.13, heading: heading + Math.PI / 2 }, move);
        return;
      }
      const rx = px + sx * lz + cz * side, rz = pz + cz * lz - sx * side;
      // à la rame, chacun tourne le dos à la proue et tire sur son aviron ; un geste demandé par l'imprévu (harpon levé,
      // acclamations) passe avant le reste
      if (main && this.rowing) { this.seat(id, { x: rx, z: rz, y: y + seat, heading: heading + Math.PI, act: 'work' }, move); return; }
      const face = war ? (mon && !back ? Math.atan2(mon.x - rx, mon.z - rz) : heading + (i % 2 ? -1 : 1) * Math.PI / 2) : heading + (i ? Math.PI / 2 : 0);
      if (main && this.crewAct) { this.seat(id, { x: rx, z: rz, y: y + seat * (this.crewAct === 'sit' ? 1 : WAR_STAND), heading: this.crewFace ?? face, act: this.crewAct }, move); return; }
      // (au combat, les hommes d'armes se dressent, harpon au poing, et frappent)
      this.seat(id, war && mon && !back ? { x: rx, z: rz, y: y + seat * WAR_STAND, heading: face, act: 'work' } : { x: rx, z: rz, y: y + seat, heading: face }, move);
    });
    // les avirons qui plongent : une gerbe de chaque bord, en cadence
    if (main && this.rowing && riders.length) {
      const beat = Math.floor(t * 1.6), sx = Math.sin(heading), cz = Math.cos(heading);
      if (beat !== this.stroke) {
        this.stroke = beat;
        for (const sd of [-1, 1]) this.puffAt(px + cz * sd * 0.2 * sc, level + 0.01, pz - sx * sd * 0.2 * sc, 'puff', -sx * 0.12, -cz * 0.12);
      }
    }
    return [px, pz];
  }

  /** Chaque membre (hors barque) va d'un point de travail à l'autre, ou reste au camp */
  private stepMembers(dt: number, a: ActiveExpedition, k: number) {
    // (sur le volcan, venue à pied : `stepVolcano` mène chacun)
    if (this.kind === 'volcano') return;
    const riders = this.boat?.riders ?? [];
    a.party.forEach((id, i) => {
      if (riders.includes(id)) return;
      if (this.balloon && this.stepAeronaut(id, i, k, dt)) return;
      if (this.race && this.stepRacer(id, i, k)) return;
      if (this.games && this.stepAthlete(id, i, k, dt)) return;
      if (this.dragon && this.stepKnight(id, i, a, k, dt)) return;
      if (this.kind === 'spring' && this.stepBather(id, i, a, dt)) return;
      if (this.pit && this.stepPugilist(id, i, a)) return;
      if (this.kind === 'delve' && this.mouth) { this.stepDelver(id, i, dt); return; }
      let left = (this.next.get(id) ?? i * 0.8) - dt;
      if (this.kind === 'camp' && left <= 0) {
        // au camp : chacun s'assied au feu ou s'affaire, à tour de rôle
        this.agents.partyAct([id], (i + Math.floor(this.t / 9)) % 3 ? 'sit' : 'work');
        left = 9;
      } else if (left <= 0) {
        const target = this.pick(id, i, a, k);
        if (target) this.agents.memberGo(id, target[0], target[1], target[2]);
        left = this.kind === 'hunt' ? 4 + Math.random() * 2 : this.mam ? 2.5 + Math.random() * 1.5 : this.kind === 'fish' || this.kind === 'boat' || this.kind === 'watch' || this.kind === 'spring' ? 1e9 : 5 + Math.random() * 3;
        this.goal.set(id, 1);
      } else if (this.goal.get(id) && this.agents.memberDone(id)) {
        this.goal.delete(id);
        this.agents.partyAct([id], this.actOf(i, k));
      } else if (this.kind === 'watch' && this.agents.memberDone(id)) this.agents.partyAct([id], this.actOf(i, k));
      this.next.set(id, left);
    });
  }

  /** Le geste d'un membre arrivé à sa place : au travail, assis à guetter ou à écouter, à applaudir les jongleurs… */
  private actOf(i: number, k: number): Act {
    const st = this.story;
    if (this.kind === 'hunt') return 'work';
    // les rabatteurs et les guetteurs attendent, accroupis, que la chasse commence ; les creuseurs creusent
    if (this.mam) return this.mam.k < 0.3 && this.mam.way !== 'pits' ? 'sit' : 'work';
    if (st === 'salt') return k < 0.75 ? 'sit' : 'work';
    if (st === 'troupe') return (i + Math.floor(this.t / 5)) % 2 ? 'cheer' : 'sit';
    if (st === 'pugilat') return (i + Math.floor(this.t / 3)) % 3 ? 'cheer' : 'stroll';
    if (st === 'abbey') return (i + Math.floor(this.t / 7)) % 3 ? 'sit' : 'cheer';
    if (st === 'stars') return i < 3 ? 'work' : 'sit';
    // au compte à rebours, on attend ; au décollage, on crie de joie
    if (this.rocket) return k >= L_FIRE ? 'cheer' : (i + Math.floor(this.t / 6)) % 3 ? 'stroll' : 'work';
    if (this.kind === 'spring') return 'sit';
    return 'work';
  }

  /**
   * La montgolfière : l'enveloppe se gonfle, puis elle s'élève, dérive au loin et revient se poser, en se balançant, le brûleur
   * qui rugit par bouffées ; les cordes que tient l'équipe jusqu'au décollage ; les aéronautes debout dans la nacelle
   */
  private stepBalloon(k: number, onSite: boolean) {
    const b = this.balloon!, w = this.world, o = b.obj, S = o.scale.x;
    const fill = k < B_FULL ? smooth(k / B_FULL) : k < B_OUT ? 1 : 1 - smooth(Math.min(1, (k - B_OUT) / (1 - B_OUT))) * 0.6;
    b.env.scale.setScalar(Math.max(0.001, 0.12 + 0.88 * fill));
    // u : le vol, du décollage (0) à l'atterrissage (1) ; elle monte, croise au loin en faisant un crochet, redescend
    const u = k <= B_LIFT ? 0 : k >= B_LAND ? 1 : (k - B_LIFT) / (B_LAND - B_LIFT);
    const up = u < 0.2 ? smooth(u / 0.2) : u > 0.8 ? 1 - smooth((u - 0.8) / 0.2) : 1;
    // un coup de vent la fait tanguer et la pousse de côté
    const g = this.gustK, gust = Math.sin(this.t * 2.3) * 0.18 * g;
    const out = Math.sin(u * Math.PI) * b.far, side = Math.sin(u * Math.PI * 2) * b.far * 0.35 + gust, dx = Math.sin(b.drift), dz = Math.cos(b.drift);
    const x = b.home[0] + dx * out + dz * side, z = b.home[1] + dz * out - dx * side;
    o.position.set(x, Math.max(w.surfaceAt(x, z), b.y0) + up * b.high + Math.sin(this.t * 0.7) * 0.05 * up, z);
    o.rotation.set(Math.sin(this.t * 1.9) * 0.12 * g, b.drift + u * 2.2, Math.sin(this.t * 0.9) * 0.035 * up + Math.sin(this.t * 3.1) * 0.22 * g);
    // le brûleur : il chauffe fort pour gonfler et monter, par bouffées en croisière, se tait pour redescendre
    const heat = !onSite ? 0.3 : k < B_LIFT ? 1.5 : u < 0.22 ? 1.8 : u < 0.75 ? (Math.sin(this.t * 1.7) > 0.2 ? 1.5 : 0.4) : k < B_LAND ? 0.3 : 0.001;
    b.burner.scale.setScalar(heat);
    this.focus = [x, z];
    this.lift = Math.max(0, o.position.y - w.surfaceAt(x, z)) + 0.8 * S * fill * (u > 0 && u < 1 ? 1 : 0.4);
    // les cordes, des coins de la nacelle aux mains de l'équipe, jusqu'au décollage
    const ry = o.rotation.y, cs = Math.cos(ry), sn = Math.sin(ry);
    b.ropes.forEach((l, i) => {
      l.visible = onSite && k < B_LIFT;
      if (!l.visible) return;
      const ang = i * 1.57 + 0.6, lx = Math.cos(ang) * 0.06 * S, lz = Math.sin(ang) * 0.06 * S, [sx, sz] = b.stakes[i];
      const pa = l.geometry.attributes.position as THREE.BufferAttribute;
      pa.setXYZ(0, x + lx * cs + lz * sn, o.position.y + 0.085 * S, z - lx * sn + lz * cs);
      pa.setXYZ(1, sx, w.surfaceAt(sx, sz) + 0.12, sz);
      pa.needsUpdate = true;
      l.geometry.computeBoundingSphere();
    });
    // les aéronautes, debout de part et d'autre du brûleur ; ils saluent ceux d'en bas
    if (onSite) b.riders.forEach((id, r) => {
      if (k < B_IN || k >= B_OUT) return;
      const lx = (r ? -0.032 : 0.032) * S, lz = (r ? -0.022 : 0.022) * S;
      this.agents.ride(id, { x: x + lx * cs + lz * sn, z: z - lx * sn + lz * cs, y: o.position.y + 0.012 * S, heading: ry + (r ? Math.PI : 0) + 0.6, act: u > 0.05 && u < 0.95 && Math.floor(this.t / 2.5 + r) % 2 ? 'cheer' : null });
    });
  }

  /**
   * Le lancement : l'équipage gagne la fusée et y monte ; allumage, les flammes grandissent et un grand nuage de fumée roule
   * sur le pas de tir ; la fusée s'arrache, accélère, s'incline dans son virage et sort du ciel en laissant sa traînée
   */
  private stepRocket(k: number, dt: number, onSite: boolean) {
    const r = this.rocket!, H = ROCKET_H[r.kind], big = r.kind === 'colony' ? 1.6 : r.kind === 'moon' ? 1.25 : 1;
    // l'équipage : il attend, marche jusqu'à la fusée, disparaît à bord
    r.crew.forEach((c, i) => {
      const u = onSite ? Math.min(1, Math.max(0, (k - L_BOARD - i * 0.008) / (L_IN - L_BOARD - 0.04))) : 0, f = c.n.folk.root;
      const x = c.from[0] + (r.x - c.from[0]) * u * 0.8, z = c.from[1] + (r.z - c.from[1]) * u * 0.8;
      f.position.set(x, this.world.surfaceAt(x, z) + (u > 0.6 ? (u - 0.6) * 0.3 : 0), z);
      f.visible = u < 1;
      c.n.pose = u > 0 && u < 1 ? 'walk' : Math.floor(this.t / 3 + i) % 3 === 0 ? 'cheer' : 'idle';
    });
    // l'ascension : lente au départ, de plus en plus vite ; le virage vers le large une fois la tour dépassée
    const u = !onSite || k <= L_LIFT ? 0 : Math.min(1, (k - L_LIFT) / (L_GONE - L_LIFT)), alt = 70 * Math.pow(u, 2.2);
    const tilt = Math.min(0.6, Math.max(0, alt - 3) * 0.02), off = Math.max(0, alt - 3) * tilt * 0.45;
    const x = r.x + Math.sin(r.dir) * off, z = r.z + Math.cos(r.dir) * off, y = r.y0 + alt + (onSite && k > L_FIRE && k < L_LIFT ? Math.sin(this.t * 60) * 0.003 : 0);
    r.obj.position.set(x, y, z);
    r.obj.rotation.set(Math.cos(r.dir) * tilt, 0, -Math.sin(r.dir) * tilt);
    r.obj.visible = u < 1;
    // les flammes : elles naissent à l'allumage, grandissent au décollage, s'allongent en altitude
    const th = !onSite || k < L_FIRE || u >= 1 ? 0 : k < L_LIFT ? 0.3 + 0.7 * smooth((k - L_FIRE) / (L_LIFT - L_FIRE)) : 1;
    const fl = 1 + Math.sin(this.t * 31) * 0.08 + Math.sin(this.t * 47) * 0.05;
    r.flame.scale.set(Math.max(0.001, th * fl), Math.max(0.001, th * (1.1 + Math.sin(this.t * 23) * 0.15) * (1 + u * 1.5)), Math.max(0.001, th * fl));
    (r.glare.material as THREE.MeshBasicMaterial).opacity = th * Math.max(0, 1 - alt / 5) * (0.55 + Math.sin(this.t * 37) * 0.08);
    r.glare.scale.setScalar(1.2 * big * (0.6 + th * 0.6));
    if (r.vapor && onSite && k >= L_FIRE) { r.vapor.every = 1e9; r.vapor = null; }
    // la fumée : un nuage qui roule sur le pas de tir tant qu'elle est basse, puis sa traînée dans le ciel
    if (th > 0) {
      if (alt < 4 && (r.puff -= dt) <= 0) {
        r.puff = 0.06 / big;
        for (let j = 0; j < 2; j++) {
          const ang = Math.random() * Math.PI * 2, sp = (0.25 + Math.random() * 0.35) * big, o = new THREE.Mesh(cloudGeo(), mats.body);
          this.group.add(o);
          this.fx.push({ obj: o, t: 0, life: 5 + Math.random() * 2, kind: 'plume', x: r.x, y: r.y0 + 0.03, z: r.z, vx: Math.cos(ang) * sp, vz: Math.sin(ang) * sp });
        }
      }
      if (alt > 0.3 && alt < 55 && (r.trail -= dt) <= 0) {
        r.trail = 0.08;
        // elle naît au bout des flammes : on voit le feu sous la tuyère
        const o = new THREE.Mesh(cloudGeo(), mats.body), dn = 0.45 * big * (1 + u * 1.5);
        this.group.add(o);
        this.fx.push({ obj: o, t: 0, life: 6, kind: 'trail', x: x - Math.sin(r.dir) * tilt * dn, y: y - dn, z: z - Math.cos(r.dir) * tilt * dn, vx: (Math.random() - 0.5) * 0.06, vz: (Math.random() - 0.5) * 0.06 });
      }
    }
    // la vue suit la fusée, le nez en l'air
    if (onSite && u < 1) { this.focus = [x, z]; this.lift = Math.min(alt + H * 0.5, 9); }
    else { this.focus = [r.x, r.z]; this.lift = H * 0.4; }
  }

  /** Un membre de l'envol : à sa corde pendant qu'on gonfle, à la nacelle s'il part, puis le nez en l'air à applaudir ; vrai s'il est pris en charge */
  private stepAeronaut(id: number, i: number, k: number, dt: number) {
    const b = this.balloon!, r = b.riders.indexOf(id), o = b.obj;
    if (r >= 0 && k >= B_IN && k < B_OUT) return true;
    if (r >= 0) this.agents.ride(id, null);
    const st = r >= 0 && k >= B_BOARD && k < B_IN ? 'board' : k < B_LIFT ? 'rope' : 'watch';
    let left = (this.next.get(id) ?? i * 0.5) - dt;
    if (this.stage.get(id) !== st || left <= 0) {
      this.stage.set(id, st);
      const p = this.agents.partyPositions([id])[0];
      const [tx, tz] = st === 'rope' ? b.stakes[i % b.stakes.length] : st === 'board' ? [b.home[0] + (r ? -0.17 : 0.17), b.home[1]] : p ? [p[0], p[1]] : b.home;
      this.agents.memberGo(id, tx, tz, Math.atan2(o.position.x - tx, o.position.z - tz));
      this.goal.set(id, 1);
      left = st === 'watch' ? 5 : 1e9;
    } else if (this.goal.get(id) && this.agents.memberDone(id)) {
      this.goal.delete(id);
      this.agents.partyAct([id], st === 'watch' ? 'cheer' : st === 'board' ? null : 'work');
    }
    this.next.set(id, left);
    return true;
  }

  /** La voiture de course : au départ elle pétarade sur place ; puis elle fait ses tours, accélère, ralentit, revient sur la ligne */
  private stepRace(k: number, dt: number, onSite: boolean) {
    const r = this.race!, w = this.world;
    const u = k <= R_GO ? 0 : k >= R_END ? 1 : smooth((k - R_GO) / (R_END - R_GO)), th = u * r.laps * Math.PI * 2;
    const x = r.x + r.rx * Math.sin(th), z = r.z + r.s * r.rz * (1 - Math.cos(th));
    const h = Math.atan2(r.rx * Math.cos(th), r.s * r.rz * Math.sin(th)), driving = onSite && u > 0 && u < 1;
    const gy = w.surfaceAt(x, z);
    r.obj.position.set(x, gy + (driving ? Math.abs(Math.sin(this.t * 23)) * 0.005 : 0), z);
    r.obj.rotation.y = h;
    if (driving) this.focus = [x, z];
    // pétarades au pot d'échappement, poussière derrière elle quand elle file
    if ((r.puff -= dt) <= 0) {
      r.puff = driving ? 0.1 : 0.45;
      const o = new THREE.Mesh(driving ? puffGeo() : smokeGeo(), mats.body);
      this.group.add(o);
      this.fx.push({ obj: o, t: 0, life: driving ? 1 : 1.6, kind: driving ? 'puff' : 'smoke', x: x - Math.sin(h) * 0.15, y: gy + 0.04, z: z - Math.cos(h) * 0.15, vx: 0, vz: 0 });
    }
    // le pilote au volant
    if (onSite && r.driver !== null) {
      if (k >= R_SEAT && k < R_OUT) this.agents.ride(r.driver, { x: x - Math.sin(h) * 0.03, z: z - Math.cos(h) * 0.03, y: gy + 0.04, heading: h });
      else if (k >= R_OUT) this.agents.ride(r.driver, null);
    }
  }

  /**
   * Le chantier de la voie : les jalons disparaissent à mesure qu'on pose les tronçons ; le train de chantier pousse sa
   * plate-forme jusqu'à la tête de voie, en fumant ; la vue suit la tête de voie
   */
  private stepWorks(dt: number, a: ActiveExpedition) {
    const wk = this.works!, w = this.world, laid = this.built.filter((o) => o.visible).length, sx = Math.sin(wk.dir), sz = Math.cos(wk.dir);
    wk.stakes.forEach((s, i) => (s.visible = !this.built[i].visible));
    const head = laid * 0.3, at = Math.max(0, head - 0.62), x = wk.x + sx * at, z = wk.z + sz * at;
    // le train avance en douceur jusqu'à sa place
    const o = wk.train, tx = x - o.position.x, tz = z - o.position.z, d = Math.hypot(tx, tz);
    if (!o.userData.set || d > 2) { o.position.set(x, w.surfaceAt(x, z) + 0.024, z); o.userData.set = true; }
    else if (d > 1e-3) { const st = Math.min(d, dt * 0.25); o.position.x += (tx / d) * st; o.position.z += (tz / d) * st; o.position.y = w.surfaceAt(o.position.x, o.position.z) + 0.024; }
    if (a.phase === 'work') this.focus = [wk.x + sx * head, wk.z + sz * head];
    if ((wk.puff -= dt) <= 0 && !a.wait) {
      wk.puff = d > 1e-3 ? 0.18 : 0.5;
      const f = new THREE.Mesh(smokeGeo(), mats.body), cx = o.position.x + sx * 0.12, cz = o.position.z + sz * 0.12;
      this.group.add(f);
      this.fx.push({ obj: f, t: 0, life: 2, kind: 'smoke', x: cx, y: o.position.y + 0.3, z: cz, vx: 0, vz: 0 });
    }
  }

  /** Le pilote va à sa portière ; les autres, une fois la voiture partie, applaudissent au bord de la piste, près de l'arche */
  private stepRacer(id: number, i: number, k: number) {
    const r = this.race!;
    if (id === r.driver) {
      if (k >= R_SEAT && k < R_OUT) return true;
      if (k < R_DOOR || k >= R_OUT) return false;
      if (this.stage.get(id) !== 'door') { this.stage.set(id, 'door'); this.agents.memberGo(id, r.x - 0.04, r.z - r.s * 0.14, r.s > 0 ? 0 : Math.PI); }
      return true;
    }
    if (k < R_GO) return false;
    if (this.stage.get(id) !== 'stand') {
      this.stage.set(id, 'stand');
      const [sx, sz] = this.near(r.ax + (i - 1.5) * 0.16, r.z - r.s * 0.3, r.x, r.z);
      this.agents.memberGo(id, sx, sz, r.s > 0 ? 0 : Math.PI);
      this.goal.set(id, 1);
    } else if (this.goal.get(id) && this.agents.memberDone(id)) {
      this.goal.delete(id);
      this.agents.partyAct([id], 'cheer');
    }
    return true;
  }

  // ---------------- Les grands Jeux ----------------
  /** Une gerbe de feu d'artifice qui éclate en (x, y, z) : des étincelles de couleur filent dans tous les sens et retombent */
  private firework(x: number, y: number, z: number) {
    const mat = SPARK[Math.floor(Math.random() * SPARK.length)];
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.2, v = 0.45 + Math.random() * 0.2;
      const o = new THREE.Mesh(sparkGeo, mat);
      this.group.add(o);
      this.fx.push({ obj: o, t: 0, life: 1.1, kind: 'spark', x, y, z, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(e) * v, vz: Math.sin(a) * Math.cos(e) * v });
    }
  }

  /**
   * Les Jeux au pied du stade : la vasque sur sa colonne, face au stade ; derrière elle, les drapeaux des nations ; plus loin,
   * la foule ; sur le côté, le podium. Le porteur de la flamme fait le tour du stade avant d'allumer la vasque, puis les
   * athlètes courent sur la piste ; à la fin, les trois premiers montent sur le podium sous le feu d'artifice
   */
  private gamesStage(a: ActiveExpedition, cx: number, cz: number) {
    const w = this.world;
    let st: Building | null = null, bd = 1e9;
    for (const b of w.buildings.values()) if (b.kind === 'stadium') { const s = sizeOf(b), d = Math.hypot(b.x + s / 2 - cx, b.z + s / 2 - cz); if (d < bd) { bd = d; st = b; } }
    const size = st ? sizeOf(st) : 3, sx = st ? st.x + size / 2 : cx + 2, sz = st ? st.z + size / 2 : cz;
    const dl = Math.max(0.01, Math.hypot(cx - sx, cz - sz)), ux = (cx - sx) / dl, uz = (cz - sz) / dl, px = -uz, pz = ux, face = Math.atan2(sx - cx, sz - cz);
    const base = this.put(cauldronGeo(), cx, cz, face), cy = base.position.y + 0.43;
    const flame = this.flameAt(cx, cy, cz, 2.6);
    flame.visible = false;
    // le flambeau du relais : la poignée, la coupe, la flamme
    const torch = new THREE.Group();
    torch.add(new THREE.Mesh(handTorchGeo(), mats.body));
    const tf = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 5).translate(0, 0.03, 0), FLAME);
    tf.add(new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.035, 5).translate(0, 0.017, 0), FLAME_IN));
    tf.position.y = 0.075;
    torch.add(tf);
    torch.visible = false;
    this.group.add(torch); this.props.push(torch);
    const flags: THREE.Object3D[] = [];
    for (let i = 0; i < 6; i++) {
      const o = (i - 2.5) * 0.17, [x, z] = this.near(cx + ux * 0.45 + px * o, cz + uz * 0.45 + pz * o, cx, cz);
      flags.push(this.put(gamesFlagGeo(i), x, z, face + Math.PI / 2));
    }
    // la foule, en arc derrière les drapeaux, qui acclame
    for (let i = 0; i < 9; i++) {
      const o = (i - 4) * 0.2, r = 0.8 + (i % 2) * 0.14, [x, z] = this.near(cx + ux * r + px * o, cz + uz * r + pz * o, cx, cz);
      this.npc('villager', a.age, x, z, Math.atan2(cx - x, cz - z), i % 3 ? 'cheer' : 'idle');
    }
    const [qx, qz] = this.near(cx + px * 0.75 + ux * 0.1, cz + pz * 0.75 + uz * 0.1, cx, cz);
    const podium = this.put(podiumGeo(), qx, qz, face);
    // les athlètes attendent en rang devant la vasque
    for (let i = 0; i < 6; i++) this.spots.push(this.near(cx - ux * 0.3 + px * (i - 2.5) * 0.15, cz - uz * 0.3 + pz * (i - 2.5) * 0.15, cx, cz));
    this.focus = [(cx + sx) / 2, (cz + sz) / 2];
    this.games = { sx, sz, sy: w.surfaceAt(sx, sz), half: size / 2, cx, cz, cy, ux, uz, flame, torch, flags, podium, laps: new Map(), lit: false, boom: 0 };
  }

  /** Le tour du stade du porteur de la flamme (u : 0 … 1), en partant de la vasque et en y revenant, au ras de son emprise */
  private relayAt(u: number): [number, number, number] {
    const g = this.games!, a0 = Math.atan2(g.cz - g.sz, g.cx - g.sx), ang = a0 + u * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
    // un carré aux coins arrondis, juste au-delà de l'emprise du stade
    const e = 0.35, R = g.half + 0.35, x = g.sx + R * Math.sign(c) * Math.pow(Math.abs(c), e), z = g.sz + R * Math.sign(s) * Math.pow(Math.abs(s), e);
    // les premiers et derniers pas : de la vasque au tour, du tour à la vasque
    const k = Math.min(1, u * 12, (1 - u) * 12);
    return [g.cx + (x - g.cx) * k, g.cz + (z - g.cz) * k, ang + Math.PI];
  }

  /** Les Jeux à chaque image : le flambeau suit son porteur, la vasque s'allume, les drapeaux flottent, le feu d'artifice */
  private stepGames(dt: number, a: ActiveExpedition, k: number) {
    const g = this.games!, bearer = a.party[0], away = a.phase === 'back' || a.phase === 'home';
    const p = bearer !== undefined ? this.agents.partyPositions([bearer])[0] : undefined;
    const carrying = a.phase === 'work' && k >= 0.04 && k < 0.31;
    g.torch.visible = carrying && !!p;
    if (g.torch.visible && p) {
      const [x, z, h] = p;
      g.torch.position.set(x + Math.cos(h) * 0.05, this.world.surfaceAt(x, z) + 0.2, z - Math.sin(h) * 0.05);
      g.torch.children[1].scale.setScalar(1 + Math.sin(this.t * 19) * 0.15);
      this.focus = [x, z];
    } else this.focus = [(g.cx + g.sx) / 2, (g.cz + g.sz) / 2];
    // la flamme arrive : la vasque s'embrase dans une gerbe d'étincelles
    if (!g.lit && a.phase === 'work' && k >= 0.31) { g.lit = true; g.boom = 4; for (let i = 0; i < 3; i++) this.puffAt(g.cx, g.cy + 0.05, g.cz, 'smoke'); this.firework(g.cx, g.cy + 0.5, g.cz); }
    // (une flamme éteinte par l'orage, quand les Jeux tournent mal)
    const out = away && !a.ok;
    g.flame.visible = g.lit && !out;
    if (out && g.lit && Math.random() < dt * 3) this.puffAt(g.cx, g.cy + 0.05, g.cz, 'smoke');
    for (const [i, f] of g.flags.entries()) f.rotation.y = Math.atan2(g.sx - g.cx, g.sz - g.cz) + Math.PI / 2 + Math.sin(this.t * 2.1 + i) * 0.25;
    // le feu d'artifice : à l'allumage, puis à la remise des médailles
    const finale = a.phase === 'work' && k >= 0.8 && a.ok !== false;
    if (g.boom > 0 || finale) {
      g.boom -= dt;
      if (Math.random() < dt * 2.2) { const ang = Math.random() * Math.PI * 2, r = Math.random() * g.half; this.firework(g.sx + Math.cos(ang) * r, g.sy + 1.1 + Math.random() * 0.6, g.sz + Math.sin(ang) * r); }
    }
  }

  /**
   * Un athlète : le premier porte la flamme autour du stade jusqu'à la vasque ; les autres attendent en rang, courent ensuite
   * sur la piste (chacun à son train) ; à la fin, les trois premiers montent sur le podium, les autres applaudissent
   */
  private stepAthlete(id: number, i: number, k: number, dt: number) {
    const g = this.games!, w = this.world;
    if (i === 0) {
      if (k >= 0.04 && k < 0.3) {
        const [x, z, h] = this.relayAt((k - 0.04) / 0.26);
        this.agents.ride(id, { x, z, y: w.surfaceAt(x, z), heading: h, act: 'run' });
        this.stage.set(id, 'relay');
        return true;
      }
      if (k >= 0.3 && this.stage.get(id) === 'relay') {
        // arrivé à la vasque, il lève la flamme, puis rejoint les autres
        this.agents.ride(id, null);
        this.stage.set(id, 'lit');
        const [x, z] = this.near(g.cx - g.ux * 0.18, g.cz - g.uz * 0.18, g.cx, g.cz);
        this.agents.memberGo(id, x, z, Math.atan2(g.cx - x, g.cz - z));
        this.goal.set(id, 1);
      }
      if (this.stage.get(id) === 'lit') {
        if (this.goal.get(id) && this.agents.memberDone(id)) { this.goal.delete(id); this.agents.partyAct([id], 'cheer'); }
        return true;
      }
      return k >= 0.04;
    }
    if (k < 0.33) return false;
    if (k < 0.78) {
      // la course sur la piste du stade : un ovale autour de la pelouse, chacun à son train
      const lap = (g.laps.get(id) ?? i * 0.45) + dt * (0.9 + ((i * 37) % 7) * 0.05);
      g.laps.set(id, lap);
      const r = g.half * 0.72 + (i % 3) * 0.05, x = g.sx + Math.cos(lap) * r, z = g.sz + Math.sin(lap) * r * 0.8;
      this.agents.ride(id, { x, z, y: g.sy + 0.02, heading: Math.atan2(-Math.sin(lap), Math.cos(lap) * 0.8), act: 'run' });
      return true;
    }
    if (this.stage.get(id) !== 'podium') {
      this.stage.set(id, 'podium');
      this.agents.ride(id, null);
      if (i > 3) {
        const [x, z] = this.near(g.podium.position.x + g.ux * 0.3 + (i - 4) * 0.12, g.podium.position.z + g.uz * 0.3, g.cx, g.cz);
        this.agents.memberGo(id, x, z, g.podium.rotation.y + Math.PI);
        this.goal.set(id, 1);
      }
    }
    if (i <= 3) {
      // sur sa marche, face à la foule, bras levés
      const [lx, top] = PODIUM[i - 1], f = g.podium.rotation.y, c = Math.cos(f), s = Math.sin(f), o = g.podium.position;
      this.agents.ride(id, { x: o.x + lx * c, z: o.z - lx * s, y: o.y + top, heading: f + Math.PI, act: 'cheer' });
    } else if (this.goal.get(id) && this.agents.memberDone(id)) { this.goal.delete(id); this.agents.partyAct([id], 'cheer'); }
    return true;
  }

  // ---------------- Le dragon dans sa grotte ----------------
  /**
   * L'antre du dragon : la bouche de la grotte (la vraie, si elle est là ; sinon un amas de rochers au pied de la pente), des
   * ossements devant, le trésor qui brille dans l'ombre, et le dragon endormi en travers de l'entrée (enfumé, il est encore
   * dedans : un feu d'herbes humides fume devant la bouche)
   */
  private dragonLair(a: ActiveExpedition, cx: number, cz: number) {
    const w = this.world, y = (x: number, z: number) => w.surfaceAt(x, z);
    let mx = cx, mz = cz, real = false;
    // l'antre, la bête et la troupe sur le même replat : à plus de `LAIR_STEP` de dénivelé, la vraie grotte (en contrebas d'une
    // falaise, ou au-dessus) laisse la place à l'amas de rochers, posé au niveau de l'équipe (retour de l'auteur, 17 nov. 2026 :
    // le dragon juché sur une crête, la grotte au fond du ravin, la troupe sur le plateau)
    const hT = w.hAt(cx, cz), gap = (x: number, z: number, fx: number, fz: number) => Math.max(Math.abs(w.hAt(x, z) - hT), Math.abs(w.hAt(x + fx * 1.05, z + fz * 1.05) - hT));
    const e = w.outpostEntrance(Math.floor(cx), Math.floor(cz), 1);
    if (e >= 0 && w.veg[e] === VEG_CAVE) {
      const x = e % N, z = Math.floor(e / N), ang = Math.atan2(cx - x - 0.5, cz - z - 0.5);
      mx = x + 0.5 + Math.sin(ang) * 0.6; mz = z + 0.5 + Math.cos(ang) * 0.6;
      const f = Math.atan2(cx - mx, cz - mz);
      real = gap(mx, mz, Math.sin(f), Math.cos(f)) <= LAIR_STEP;
    }
    if (!real) {
      // au pied de la pente de préférence, mais sur le replat de l'équipe : de tous les côtés, le plus plat d'abord
      const [ux, uz] = this.uphill(cx, cz), up = Math.atan2(ux, uz);
      let best = Infinity;
      for (let i = 0; i < 16; i++) for (const r of [0.9, 1.3]) {
        const ang = up + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8), [px, pz] = this.near(cx + Math.sin(ang) * r, cz + Math.cos(ang) * r, cx, cz);
        if (Math.hypot(px - cx, pz - cz) < 0.5) continue;
        const f = Math.atan2(cx - px, cz - pz), sc = gap(px, pz, Math.sin(f), Math.cos(f)) * 4 + Math.ceil(i / 2) * 0.05;
        if (sc < best) { best = sc; mx = px; mz = pz; }
      }
      if (best === Infinity) [mx, mz] = this.near(cx + ux * 0.9, cz + uz * 0.9, cx, cz);
    }
    const face = Math.atan2(cx - mx, cz - mz), fx = Math.sin(face), fz = Math.cos(face);
    if (!real) this.put(caveMouthGeo(), mx, mz, face).scale.setScalar(1.7);
    // le trésor, à l'entrée de l'antre ; des os devant
    const hoard = this.put(hoardGeo(), mx + fx * 0.7 - fz * 0.5, mz + fz * 0.7 + fx * 0.5, face);
    hoard.scale.setScalar(1.6);
    for (let i = 0; i < 4; i++) { const [bx, bz] = this.near(mx + fx * (1.5 + i * 0.15) + fz * (i - 1.5) * 0.2, mz + fz * (0.6 + i * 0.15) - fx * (i - 1.5) * 0.2, cx, cz); this.put(pebbleGeo(), bx, bz, i).scale.set(1.4, 0.4, 0.4); }
    const smoke = a.c.variant === 'smoke';
    if (smoke) { const [sx, sz] = this.near(mx + fx * 0.85, mz + fz * 0.85, cx, cz); this.fireAt(sx, sz); this.emits.push({ x: sx, y: y(sx, sz) + 0.08, z: sz, kind: 'smoke', every: 0.15, t: 0 }); }
    // le dragon, couché en travers de l'entrée, tête vers l'équipe (enfumé : encore dans le noir de la grotte)
    const actor = makeBeast('dragon', Math.floor(Math.abs(cx * 7 + cz * 3)) % 3, 1.5);
    const hx = mx + fx * (smoke ? 0.3 : 1.05), hz = mz + fz * (smoke ? 0.3 : 1.05);
    actor.root.position.set(hx, y(hx, hz), hz);
    actor.root.rotation.order = 'YXZ';
    actor.root.rotation.y = face;
    actor.root.visible = !smoke;
    this.group.add(actor.root); this.props.push(actor.root);
    play(actor, ['Sleep'], 0);
    this.lit = true;
    this.focus = [(cx + mx) / 2, (cz + mz) / 2];
    this.dragon = { actor, x: hx, z: hz, heading: face, lift: 0, act: 'sleep', actT: 0, roll: 0, mouth: [mx, mz], face, home: [mx + fx * 1.05, mz + fz * 1.05], hoard, smoke, hits: 0, ended: false, next: 0 };
  }

  /** Où est la gueule du dragon, dans le monde (pour son souffle de feu) */
  private dragonMouth(d: DragonLair) {
    const head = d.actor.root.getObjectByName('head'), v = new THREE.Vector3();
    if (head) { head.getWorldPosition(v); v.add(new THREE.Vector3(Math.sin(d.heading) * 0.12, -0.02, Math.cos(d.heading) * 0.12)); }
    else v.set(d.x + Math.sin(d.heading) * 0.6, this.world.surfaceAt(d.x, d.z) + 0.5, d.z + Math.cos(d.heading) * 0.6);
    return v;
  }

  /** Le dragon change de geste */
  private dragonDo(d: DragonLair, act: DragonLair['act'], clip: string[]) { d.act = act; d.actT = 0; play(d.actor, clip, 0.25); }

  /**
   * Le dragon, selon l'avancement du combat : il dort ; l'équipe approche, il se réveille en rugissant (enfumé, il sort de la
   * grotte en toussant) ; puis il crache le feu sur la troupe, rôde devant son antre, s'envole et revient se poser, tressaille
   * sous les lances. L'issue tombée : vaincu, il s'effondre et roule sur le flanc, le trésor brille à l'entrée ; sinon il
   * rugit et s'envole par-dessus la montagne
   */
  private stepDragon(dt: number, a: ActiveExpedition, k: number) {
    const d = this.dragon!, w = this.world, over = a.phase === 'back' || a.phase === 'home';
    const fate = a.fate ?? (over ? a.ok : undefined);
    d.actT += dt;
    const team = this.teamAt(a), toTeam = Math.atan2(team[0] - d.x, team[1] - d.z);
    if (fate !== undefined && !d.ended) {
      d.ended = true;
      // la dernière charge : toutes les lances volent d'un coup
      const at = new THREE.Vector3(d.x, w.surfaceAt(d.x, d.z) + 0.3, d.z);
      for (const p of this.agents.partyPositions(a.party)) this.fire(new THREE.Vector3(p[0], w.surfaceAt(p[0], p[1]) + 0.17, p[1]), at, () => this.combat?.puff(at.x, at.y, at.z, 6));
      d.actor.root.visible = true;
      if (fate) this.dragonDo(d, 'dead', ['Death']);
      else this.dragonDo(d, 'roar', ['Idle_2', 'Idle']);
    }
    if (d.act === 'sleep') {
      // (enfumé, il sort de la grotte à 0,2 en toussant de la fumée)
      if (k >= (d.smoke ? 0.2 : 0.12) && a.phase === 'work') {
        d.actor.root.visible = true;
        if (d.smoke) for (let i = 0; i < 4; i++) this.puffAt(d.mouth[0], w.surfaceAt(d.mouth[0], d.mouth[1]) + 0.2, d.mouth[1], 'smoke');
        this.dragonDo(d, 'roar', ['Idle_2', 'Idle']);
      }
    } else if (d.act === 'roar') {
      d.heading += Math.max(-dt * 2, Math.min(dt * 2, ((toTeam - d.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      if (d.actT > 3) {
        if (fate === false) this.dragonDo(d, 'flee', ['Fly']);
        else if (fate === undefined) this.dragonDo(d, 'breath', ['Attack']);
        else this.dragonDo(d, 'dead', ['Death']);
      }
    } else if (d.act === 'breath') {
      // le souffle : des braises et de la fumée jaillissent de la gueule vers la troupe
      d.heading += Math.max(-dt, Math.min(dt, ((toTeam - d.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      if (d.actT > 0.4 && d.actT < 2.4) {
        const m = this.dragonMouth(d);
        for (let i = 0; i < 2; i++) {
          if (Math.random() > dt * 30) continue;
          const sp = 1.1 + Math.random() * 0.5, h = d.heading + (Math.random() - 0.5) * 0.35, o = new THREE.Mesh(emberGeo, EMBER[Math.floor(Math.random() * EMBER.length)]);
          this.group.add(o);
          this.fx.push({ obj: o, t: 0, life: 0.7, kind: 'spark', x: m.x, y: m.y, z: m.z, vx: Math.sin(h) * sp, vy: -0.25 + Math.random() * 0.2, vz: Math.cos(h) * sp });
        }
        if (Math.random() < dt * 6) { const r = 0.6 + Math.random() * 0.4; this.puffAt(m.x + Math.sin(d.heading) * r, w.surfaceAt(d.x, d.z) + 0.1, m.z + Math.cos(d.heading) * r, 'smoke'); }
      }
      if (d.actT > 2.8) {
        // tantôt il rôde devant l'antre, tantôt il prend son envol (plutôt au milieu du combat)
        if (k > 0.45 && k < 0.65 && d.next <= 0) { d.next = 1; this.dragonDo(d, 'fly', ['Fly']); }
        else this.dragonDo(d, 'prowl', ['Walk']);
      }
    } else if (d.act === 'prowl') {
      // quelques pas de côté devant son antre, sans s'en éloigner
      const side = Math.sin(this.t * 0.4) > 0 ? 1 : -1, tx = d.home[0] + Math.cos(d.face) * side * 0.5, tz = d.home[1] - Math.sin(d.face) * side * 0.5;
      const dx = tx - d.x, dz = tz - d.z, dd = Math.hypot(dx, dz);
      if (dd > 0.05) { d.x += (dx / dd) * Math.min(dd, dt * 0.25); d.z += (dz / dd) * Math.min(dd, dt * 0.25); d.heading = Math.atan2(dx, dz); }
      if (d.actT > 3) this.dragonDo(d, 'breath', ['Attack']);
    } else if (d.act === 'fly') {
      // il s'envole, tourne au-dessus de la troupe, et revient se poser devant son antre
      const u = Math.min(1, d.actT / 6), ang = d.face + u * Math.PI * 2, r = 1.1 * Math.sin(u * Math.PI);
      const tx = d.home[0] + Math.sin(ang) * r, tz = d.home[1] + Math.cos(ang) * r;
      d.heading = Math.atan2(tx - d.x, tz - d.z) || d.heading;
      d.x = tx; d.z = tz;
      d.lift = Math.sin(u * Math.PI) * 0.9;
      if (u >= 1) { d.lift = 0; this.dragonDo(d, 'roar', ['Idle_2', 'Idle']); this.puffAt(d.x, w.surfaceAt(d.x, d.z) + 0.02, d.z); }
    } else if (d.act === 'hit') {
      if (d.actT > 0.7) this.dragonDo(d, 'breath', ['Attack']);
    } else if (d.act === 'dead') {
      // il s'effondre, puis roule sur le flanc dans un nuage de poussière
      d.lift = Math.max(0, d.lift - dt * 1.5);
      d.roll = 0.5 * smooth(Math.min(1, Math.max(0, (d.actT - 1.2) / 1.2)));
      if (d.actT > 1.2 && d.actT - dt <= 1.2) for (let i = 0; i < 5; i++) this.puffAt(d.x + (Math.random() - 0.5) * 0.6, w.surfaceAt(d.x, d.z) + 0.03, d.z + (Math.random() - 0.5) * 0.6);
    } else if (d.act === 'flee') {
      // il s'envole par-dessus la montagne, loin de la troupe, et disparaît
      d.lift += dt * 0.35;
      d.x -= Math.sin(toTeam) * dt * 0.5; d.z -= Math.cos(toTeam) * dt * 0.5;
      d.heading = toTeam + Math.PI;
      if (d.actT > 7) d.actor.root.visible = false;
    }
    d.next = Math.max(0, d.next - dt * 0.05);
    const o = d.actor.root;
    o.position.set(d.x, w.surfaceAt(d.x, d.z) + d.lift, d.z);
    o.rotation.set(0, d.heading, d.roll);
    d.actor.mixer.update(dt);
    this.focus = [(team[0] + d.x) / 2, (team[1] + d.z) / 2];
  }

  /**
   * Un chevalier : il approche de l'antre en silence ; le dragon réveillé, la troupe se déploie en arc face à lui et lance
   * ses lances (il tressaille) ; vaincu, on charge le trésor ; s'il s'enfuit, on recule
   */
  private stepKnight(id: number, i: number, a: ActiveExpedition, k: number, dt: number) {
    const d = this.dragon!, w = this.world, n = a.party.length, [hx, hz] = d.home;
    const fate = a.fate, phase = fate === true ? 'loot' : fate === false ? 'back' : k < 0.12 ? 'near' : 'fight';
    if (this.stage.get(id) !== phase || (phase === 'fight' && (this.next.get(id) ?? 0) <= 0)) {
      this.stage.set(id, phase);
      this.next.set(id, 5 + Math.random() * 3);
      let tx: number, tz: number;
      if (phase === 'loot') { const o = d.hoard.position; [tx, tz] = this.near(o.x + Math.cos(i * 1.3) * 0.28, o.z + Math.sin(i * 1.3) * 0.28, a.dest[0], a.dest[1]); }
      else {
        const r = phase === 'near' ? 1.7 : phase === 'back' ? 2 : 1.15 + (i % 2) * 0.12, ang = d.face + (i - (n - 1) / 2) * 0.42 + (phase === 'fight' ? (Math.random() - 0.5) * 0.2 : 0);
        [tx, tz] = this.near(hx + Math.sin(ang) * r, hz + Math.cos(ang) * r, a.dest[0], a.dest[1]);
      }
      this.agents.memberGo(id, tx, tz, phase === 'loot' ? null : Math.atan2(hx - tx, hz - tz));
      this.goal.set(id, 1);
    }
    this.next.set(id, (this.next.get(id) ?? 0) - dt);
    if (this.goal.get(id) && this.agents.memberDone(id)) {
      this.goal.delete(id);
      this.agents.partyAct([id], phase === 'loot' ? 'work' : phase === 'back' ? 'stroll' : phase === 'near' ? null : 'work');
    }
    // les lances : chacun à son tour, quand il est en place et que le dragon est à portée
    if (phase === 'fight' && d.act !== 'sleep' && d.act !== 'fly' && d.actor.root.visible && this.agents.memberDone(id)) {
      let t = (this.spearT.get(id) ?? 1.5 + i * 0.9) - dt;
      if (t <= 0) {
        t = 3 + Math.random() * 2.5;
        const p = this.agents.partyPositions([id])[0];
        if (p) {
          const to = new THREE.Vector3(d.x + (Math.random() - 0.5) * 0.3, w.surfaceAt(d.x, d.z) + 0.25, d.z + (Math.random() - 0.5) * 0.3);
          this.fire(new THREE.Vector3(p[0], w.surfaceAt(p[0], p[1]) + 0.17, p[1]), to, () => {
            this.combat?.puff(to.x, to.y, to.z, 5);
            d.hits++;
            if (d.act === 'prowl' || d.act === 'breath') this.dragonDo(d, 'hit', ['Hit']);
          });
          this.agents.partyAct([id], 'work');
        }
      }
      this.spearT.set(id, t);
    }
    return true;
  }

  /** Source chaude : deux membres se baignent, les autres attendent assis sur les pierres ; on change toutes les dix secondes */
  private stepBather(id: number, i: number, a: ActiveExpedition, dt: number) {
    const b = this.bath!, n = a.party.length, slot = (i + Math.floor(this.t / 10)) % n, inWater = slot < Math.min(2, n);
    if (inWater) {
      const [x, z] = b.at[slot];
      this.agents.ride(id, { x, z, y: b.y, heading: Math.atan2(this.focus[0] - x, this.focus[1] - z) + (slot ? 0.5 : -0.5) });
      b.in.add(id);
      return true;
    }
    if (b.in.has(id)) { b.in.delete(id); this.agents.ride(id, null); this.next.set(id, 0.3); this.goal.delete(id); }
    void dt;
    return false;
  }

  /**
   * Le pugilat : deux par deux, à tour de rôle (une reprise de 9 s), ils entrent dans le cercle et boxent face à face en
   * tournant l'un autour de l'autre ; la reprise finie, ils ressortent crier avec les autres
   */
  private stepPugilist(id: number, i: number, a: ActiveExpedition) {
    const p = this.pit!, n = a.party.length, round = Math.floor(this.t / 9), pairs = Math.max(1, Math.floor(n / 2));
    const slot = ((i - (round % pairs) * 2) % n + n) % n, fighting = a.phase === 'work' && slot < 2 && n >= 2;
    if (fighting) {
      // ils se tournent autour, se rapprochent pour frapper, reculent pour esquiver
      const ang = this.t * 0.45 + slot * Math.PI, r = 0.1 + Math.sin(this.t * 1.3 + slot) * 0.025;
      const x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r;
      this.agents.ride(id, { x, z, y: p.y, heading: Math.atan2(p.x - x, p.z - z), act: 'box' });
      p.in.add(id);
      return true;
    }
    if (p.in.has(id)) { p.in.delete(id); this.agents.ride(id, null); this.next.set(id, 0.3); this.goal.delete(id); }
    return false;
  }

  /** Galerie ou grotte : chacun y entre, disparaît le temps d'abattre la roche, ressort et vide sa charge au tas */
  private stepDelver(id: number, i: number, dt: number) {
    const m = this.mouth!, st = this.delve.get(id) ?? { phase: 'go' as const, t: i * 1.6 };
    st.t -= dt;
    if (st.phase === 'go' && st.t <= 0) {
      this.agents.memberGo(id, m.at[0], m.at[1], Math.atan2(m.at[0] - m.heap[0], m.at[1] - m.heap[1]));
      st.phase = 'in'; st.t = 0.6;
    } else if (st.phase === 'in' && st.t <= 0 && this.agents.memberDone(id)) {
      this.agents.partyHide([id], true);
      st.phase = 'out'; st.t = 4 + Math.random() * 3;
    } else if (st.phase === 'out' && st.t <= 0) {
      this.agents.partyHide([id], false);
      this.agents.memberGo(id, m.heap[0] + Math.cos(i * 2) * 0.16, m.heap[1] + Math.sin(i * 2) * 0.16, Math.atan2(m.heap[0] - m.at[0], m.heap[1] - m.at[1]));
      st.phase = 'heap'; st.t = 3.5;
    } else if (st.phase === 'heap' && this.agents.memberDone(id)) {
      this.agents.partyAct([id], 'work');
      if (st.t <= 0) { st.phase = 'go'; st.t = 0; }
    }
    this.delve.set(id, st);
  }

  /** Prochain point de travail d'un membre, et la direction à regarder une fois arrivé */
  private pick(id: number, i: number, a: ActiveExpedition, k: number): [number, number, number | null] | null {
    const [cx, cz] = a.dest;
    // à la pierre à sel, on guette d'abord, caché derrière les buissons
    if (this.story === 'salt' && k < 0.75 && this.spots.length) { const [x, z] = this.spots[i % this.spots.length]; return [x, z, Math.atan2(cx - x, cz - z)]; }
    if (this.kind === 'herd' && this.beasts.length) {
      const b = this.beasts[(i + Math.floor(this.t / 6)) % this.beasts.length];
      const ang = Math.atan2(cx - b.x, cz - b.z) + (i - 1) * 0.6;
      return [b.x + Math.sin(ang) * 0.24, b.z + Math.cos(ang) * 0.24, ang + Math.PI];
    }
    if (this.mam) {
      // la chasse au mammouth : on prépare d'abord (au bord des fosses, derrière la harde, tapi à distance)…
      const h = this.mam, b = h.old.b, n = a.party.length;
      if (h.k < 0.3 && this.spots.length) {
        const j = i % this.spots.length, [x, z] = this.spots[j], f = h.way === 'pits' ? h.pits[Math.floor(j / 2)].position : b.obj.position;
        return [x, z, Math.atan2(f.x - x, f.z - z)];
      }
      // … puis en arc derrière le vieux mâle (on le pousse vers le piège), ou tout autour de lui (on l'encercle)
      const toTrap = Math.atan2(h.trap[0] - b.x, h.trap[1] - b.z);
      const ang = h.way === 'follow' ? (i / n) * Math.PI * 2 + this.t * 0.04 : toTrap + Math.PI + (i - (n - 1) / 2) * 0.5;
      const r = 0.8 + (i % 2) * 0.15, [x, z] = this.near(b.x + Math.sin(ang) * r, b.z + Math.cos(ang) * r, b.x, b.z);
      return [x, z, Math.atan2(b.x - x, b.z - z)];
    }
    if (this.kind === 'hunt' && this.beasts.length) {
      const b = this.beasts[0], ang = Math.atan2(b.x - cx, b.z - cz) + (i - 1) * 0.35;
      const [x, z] = this.near(cx + Math.sin(ang) * 1.4, cz + Math.cos(ang) * 1.4, cx, cz);
      return [x, z, Math.atan2(b.x - x, b.z - z)];
    }
    if (this.kind === 'fish' || this.kind === 'boat') {
      const s = this.spots[i % this.spots.length], wat = this.water!;
      return [s[0], s[1], Math.atan2(wat.wet[0] - wat.bank[0], wat.wet[1] - wat.bank[1])];
    }
    if (this.rocket) {
      // en arc de cercle au bord du pas de tir, face à la fusée
      const r = this.rocket, d0 = Math.hypot(cx - r.x, cz - r.z), ang = Math.atan2(cx - r.x, cz - r.z) + (i - (a.party.length - 1) / 2) * 0.16, rr = Math.max(1.3, Math.min(2.2, d0));
      const [x, z] = this.near(r.x + Math.sin(ang) * rr, r.z + Math.cos(ang) * rr, cx, cz);
      return [x, z, Math.atan2(r.x - x, r.z - z)];
    }
    if (this.pit) {
      // tout autour du cercle, face aux combattants (pas du côté du vieux champion)
      const p = this.pit, n = a.party.length, ang = 0.9 + (i / Math.max(1, n - 1)) * 4.2, r = PIT_R + 0.2 + (i % 2) * 0.08;
      const [x, z] = this.near(p.x + Math.cos(ang) * r, p.z + Math.sin(ang) * r, cx, cz);
      return [x, z, Math.atan2(p.x - x, p.z - z)];
    }
    if (this.kind === 'watch' && !(this.story === 'stars' && i < 3)) {
      // en demi-cercle face aux jongleurs ou au frère brasseur (tournés vers -x), ou le nez au ciel
      const [fx, fz] = this.focus, ang = -Math.PI / 2 + (i - (a.party.length - 1) / 2) * 0.55, r = this.story === 'stars' ? 0.3 : 0.5;
      const [x, z] = this.near(fx + Math.sin(ang) * r, fz + Math.cos(ang) * r, cx, cz);
      return [x, z, Math.atan2(fx - x, fz - z)];
    }
    if (this.kind === 'spring') { const s = this.spots[i % this.spots.length]; return [s[0], s[1], Math.atan2(this.focus[0] - s[0], this.focus[1] - s[1])]; }
    if ((this.kind === 'trade' || this.kind === 'tend') && this.spots.length) {
      const [x, z] = this.spots[(i + Math.floor(this.t / 6)) % this.spots.length];
      return [x, z, Math.atan2(this.focus[0] - x, this.focus[1] - z)];
    }
    if (!this.spots.length) return null;
    // les ouvrages : au prochain piquet ou tronçon à poser ; ailleurs, de point en point
    const n = this.spots.length;
    const j = this.built.length ? Math.min(n - 1, Math.floor(k * n) + (i % 2)) : (i + Math.floor(this.t / 6)) % n;
    const [x, z] = this.spots[j];
    const face = this.kind === 'mine' ? Math.atan2(this.props[0].position.x - x, this.props[0].position.z - z) : this.built.length ? Math.atan2(this.built[j].position.x - x, this.built[j].position.z - z) : null;
    void id;
    return [x, z, face];
  }

  /** Cannes à pêche : le pêcheur à l'arrière de la barque, ceux de la berge une fois en place */
  private stepRods(a: ActiveExpedition) {
    // (pas de pêcheur à la ligne pendant la chasse au monstre : tout l'équipage est aux harpons)
    if ((this.kind !== 'boat' && this.kind !== 'fish') || this.monster) return;
    // l'outil selon l'ouvrage : longue-vue au grand voyage (rien à pêcher), gaffe et grappin sur l'épave, canne ailleurs
    const gear = this.story === 'isles' ? 'none' : this.story === 'voyage' ? (a.age <= 3 ? 'glass' : 'none') : this.story === 'wreck' ? (this.salv ? 'none' : 'gaffe') : 'rod';
    const fishers = this.kind === 'boat' ? [this.boat!.riders[this.boat!.riders.length - 1], ...a.party.filter((id) => !this.boat!.riders.includes(id))] : a.party;
    const w = this.world, wat = this.water!;
    for (const id of a.party) {
      const p = fishers.includes(id) && (this.boat?.riders.includes(id) || this.agents.memberDone(id)) ? this.agents.partyPositions([id])[0] : undefined;
      let r = this.rods.get(id);
      if (!p || gear === 'none') { if (r) r.rod.visible = r.bob.visible = r.line.visible = false; continue; }
      if (!r) {
        r = { rod: new THREE.Mesh(gear === 'glass' ? glassGeo() : gear === 'gaffe' ? gaffeGeo() : rodGeo(), mats.body), bob: new THREE.Mesh(gear === 'gaffe' ? grappleGeo() : bobberGeo(), mats.body), line: new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), LINE) };
        r.line.userData.flat = true;
        this.group.add(r.rod, r.bob, r.line);
        this.props.push(r.rod, r.bob, r.line);
        this.rods.set(id, r);
      }
      r.rod.visible = true; r.bob.visible = r.line.visible = gear !== 'glass';
      const [x, z, h] = p, inBoat = this.boat?.riders.includes(id);
      const base = new THREE.Vector3(x + Math.sin(h) * 0.06, (inBoat ? this.boat!.obj.position.y + 0.06 : w.surfaceAt(x, z)) + 0.1, z + Math.cos(h) * 0.06);
      r.rod.position.copy(base);
      r.rod.rotation.set(gear === 'glass' ? 1.25 + Math.sin(this.t * 0.5 + id) * 0.1 : gear === 'gaffe' ? 0.55 : 0.9, h, 0, 'YXZ');
      const tip = new THREE.Vector3(0, gear === 'gaffe' ? 0.5 : 0.42, 0).applyEuler(r.rod.rotation).add(base);
      const bx = tip.x + Math.sin(h) * 0.12, bz = tip.z + Math.cos(h) * 0.12;
      r.bob.position.set(bx, gear === 'gaffe' ? wat.level - 0.02 + Math.sin(this.t * 1.1 + id) * 0.012 : wat.level + 0.004 + Math.sin(this.t * 2.3 + id) * 0.004 - (Math.sin(this.t * 0.9 + id) > 0.93 ? 0.012 : 0), bz);
      const lp = r.line.geometry.attributes.position as THREE.BufferAttribute;
      lp.setXYZ(0, tip.x, tip.y, tip.z); lp.setXYZ(1, bx, r.bob.position.y + 0.01, bz); lp.needsUpdate = true;
      r.line.geometry.computeBoundingSphere();
    }
  }

  /** Poussière des pioches, poissons qui sautent hors de l'eau */
  private stepFx(dt: number, a: ActiveExpedition) {
    this.fxTimer -= dt;
    if (this.fxTimer <= 0 && !a.wait) {
      if (this.kind === 'mine' && this.props[0] && a.phase === 'work') {
        this.fxTimer = 0.35 + Math.random() * 0.5;
        const p = this.props[0].position, o = new THREE.Mesh(puffGeo(), mats.body);
        this.group.add(o);
        this.fx.push({ obj: o, t: 0, life: 1.2, kind: 'puff', x: p.x + (Math.random() - 0.5) * 0.25, y: p.y + 0.08, z: p.z + (Math.random() - 0.5) * 0.25, vx: (Math.random() - 0.5) * 0.08, vz: (Math.random() - 0.5) * 0.08 });
      } else if ((this.kind === 'boat' || this.kind === 'fish') && this.water) {
        this.fxTimer = 2.5 + Math.random() * 3.5;
        const c = this.boat ? this.boat.obj.position : new THREE.Vector3(this.water.wet[0], 0, this.water.wet[1]);
        const ang = Math.random() * Math.PI * 2, x = c.x + Math.cos(ang) * 0.4, z = c.z + Math.sin(ang) * 0.4;
        if (this.depth(x, z) !== null) this.fishJump(x, z, this.water.level);
      } else this.fxTimer = 1;
    }
    for (const e of this.emits) {
      // les nuages cachent les étoiles filantes
      if ((e.t -= dt) > 0 || a.wait || (e.kind === 'star' && this.cloudy)) continue;
      e.t = e.every * (0.7 + Math.random() * 0.6);
      const star = e.kind === 'star', o = new THREE.Mesh(star ? new THREE.BoxGeometry(0.012, 0.012, 0.5) : e.kind === 'steam' ? steamGeo() : e.kind === 'smoke' ? smokeGeo() : e.kind === 'bubble' ? bubbleGeo() : puffGeo(), star ? STAR : mats.body);
      this.group.add(o);
      if (star) {
        const ang = Math.random() * Math.PI * 2, vx = Math.cos(ang) * 2.4, vz = Math.sin(ang) * 2.4;
        o.lookAt(new THREE.Vector3(vx, -0.9, vz));
        this.fx.push({ obj: o, t: 0, life: 0.7, kind: 'star', x: e.x - vx * 0.35 + (Math.random() - 0.5) * 2, y: e.y + Math.random() * 0.8, z: e.z - vz * 0.35 + (Math.random() - 0.5) * 2, vx, vz });
      } else this.fx.push({ obj: o, t: 0, life: e.kind === 'puff' ? 1.2 : 2.2, kind: e.kind === 'puff' ? 'puff' : e.kind, x: e.x + (Math.random() - 0.5) * 0.12, y: e.y, z: e.z + (Math.random() - 0.5) * 0.12, vx: (Math.random() - 0.5) * 0.05, vz: (Math.random() - 0.5) * 0.05 });
    }
    if (this.story === 'dive' && this.boat && !a.wait && Math.random() < dt * 3) {
      const p = this.boat.obj.position, o = new THREE.Mesh(bubbleGeo(), mats.body);
      this.group.add(o);
      this.fx.push({ obj: o, t: 0, life: 0.9, kind: 'bubble', x: p.x + (Math.random() - 0.5) * 0.4, y: this.boat.y - 0.04, z: p.z + (Math.random() - 0.5) * 0.4, vx: 0, vz: 0 });
    }
    this.fx = this.fx.filter((f) => {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.group.remove(f.obj); if (f.kind === 'ring' || f.kind === 'star') (f.obj as THREE.Mesh).geometry.dispose(); return false; }
      if (f.kind === 'spray') { f.obj.position.set(f.x + f.vx * f.t, Math.max(f.y, f.y + (f.vy ?? 0) * f.t - 2.6 * f.t * f.t), f.z + f.vz * f.t); f.obj.scale.setScalar(Math.sin(Math.min(1, k * 1.15) * Math.PI) * (0.8 + k * 0.6)); }
      else if (f.kind === 'puff') { f.obj.position.set(f.x + f.vx * f.t, f.y + f.t * 0.12, f.z + f.vz * f.t); f.obj.scale.setScalar(Math.sin(k * Math.PI) * (1 + k)); }
      else if (f.kind === 'rock') {
        // la pierre tombe, rebondit en soulevant de la poussière, roule et s'arrête
        f.vy = (f.vy ?? 0) - dt * 6;
        f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
        const g = this.world.surfaceAt(f.x, f.z) + 0.025;
        if (f.y < g) {
          f.y = g;
          if (f.vy < -0.5) this.puffAt(f.x, g, f.z);
          f.vy = -f.vy * 0.35; f.vx *= 0.75; f.vz *= 0.75;
        }
        f.obj.position.set(f.x, f.y, f.z);
        f.obj.rotation.x += dt * 9 * Math.hypot(f.vx, f.vz);
        if (k > 0.85) f.obj.scale.multiplyScalar(0.9);
      } else if (f.kind === 'gas') { f.obj.position.set(f.x + f.vx * f.t, f.y + f.t * 0.1, f.z + f.vz * f.t); f.obj.scale.setScalar(Math.sin(k * Math.PI) * (1 + k * 2.5)); }
      else if (f.kind === 'leaf') { f.obj.position.set(f.x + f.vx * f.t, f.y + Math.sin(f.t * 5) * 0.03 + f.t * 0.05, f.z + f.vz * f.t); f.obj.rotation.set(f.t * 7, f.t * 3, f.t * 5); f.obj.scale.setScalar(k > 0.8 ? (1 - k) * 5 : 1); }
      else if (f.kind === 'fish') {
        f.obj.position.set(f.x + f.vx * f.t, f.y + Math.sin(k * Math.PI) * 0.16, f.z + f.vz * f.t);
        f.obj.rotation.set(-Math.cos(k * Math.PI) * 1.1, Math.atan2(f.vx, f.vz), 0, 'YXZ');
      } else if (f.kind === 'steam' || f.kind === 'smoke') {
        f.obj.position.set(f.x + f.vx * f.t, f.y + f.t * (f.kind === 'steam' ? 0.16 : 0.22), f.z + f.vz * f.t);
        f.obj.scale.setScalar(Math.sin(k * Math.PI) * (0.8 + k * 1.8));
      } else if (f.kind === 'bubble') { f.obj.position.set(f.x, f.y + k * 0.08, f.z); f.obj.scale.setScalar(1 - k * 0.5); }
      else if (f.kind === 'plume') {
        // le nuage du décollage roule au ras du sol, s'étale, s'élève un peu et se dissipe
        const e = 1 - (1 - k) * (1 - k);
        f.obj.position.set(f.x + f.vx * e * 3, f.y + k * 0.45, f.z + f.vz * e * 3);
        f.obj.scale.setScalar((2 + k * 9) * Math.min(1, (1 - k) * 3));
      } else if (f.kind === 'trail') {
        f.obj.position.set(f.x + f.vx * f.t, f.y - f.t * 0.04, f.z + f.vz * f.t);
        f.obj.scale.setScalar((0.8 + k * 7) * Math.min(1, (1 - k) * 2.5));
      }
      else if (f.kind === 'star') { f.obj.position.set(f.x + f.vx * f.t, f.y - f.t * 0.9, f.z + f.vz * f.t); f.obj.scale.setScalar(Math.sin(k * Math.PI)); }
      // une étincelle de feu d'artifice (ou une braise) : elle file, retombe et s'éteint
      else if (f.kind === 'spark') { f.obj.position.set(f.x + f.vx * f.t, f.y + (f.vy ?? 0) * f.t - 0.6 * f.t * f.t, f.z + f.vz * f.t); f.obj.scale.setScalar(Math.max(0.001, 1 - k)); }
      else { f.obj.position.set(f.x, f.y, f.z); f.obj.scale.setScalar(1 + k * 3); }
      return true;
    });
  }

  /**
   * On range tout. L'équipe encore sur place (une expédition interrompue) reprend pied : les passagers de la barque reviennent
   * sur la berge, ceux de la grotte en ressortent ; repartie, elle a déjà repris la route, et on ne la touche plus
   */
  dispose(a: ActiveExpedition) {
    if (a.phase === 'work' || a.phase === 'out' || a.phase === 'gather') {
      for (const id of this.boat?.riders ?? []) this.agents.ride(id, null);
      for (const id of this.bath?.in ?? []) this.agents.ride(id, null);
      for (const id of this.pit?.in ?? []) this.agents.ride(id, null);
      for (const id of this.balloon?.riders ?? []) this.agents.ride(id, null);
      if (this.race?.driver != null) this.agents.ride(this.race.driver, null);
      if (this.games || this.dragon) for (const id of a.party) this.agents.ride(id, null);
      if (this.mouth) this.agents.partyHide(a.party, false);
      if (this.salv) this.agents.partyHide(a.party, false);
    }
    for (const s of this.stagings) this.unstage(s);
    this.stagings = [];
    for (const l of this.balloon?.ropes ?? []) l.geometry.dispose();
    if (this.rocket) { this.rocket.glare.geometry.dispose(); (this.rocket.glare.material as THREE.Material).dispose(); }
    for (const n of this.npcs) this.group.remove(n.folk.root);
    for (const b of [...this.beasts, ...this.dogs]) { b.actor?.mixer.stopAllAction(); this.group.remove(b.obj); }
    for (const m of this.mammoths) m.actor.mixer.stopAllAction();
    for (const s of this.swimmers) s.actor?.mixer.stopAllAction();
    for (const d of this.darts) this.group.remove(d.obj);
    for (const o of this.props) this.group.remove(o);
    for (const f of this.fx) this.group.remove(f.obj);
    for (const r of this.rods.values()) r.line.geometry.dispose();
    this.flame?.geometry.dispose();
    this.salv?.dispose();
    void a;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);
