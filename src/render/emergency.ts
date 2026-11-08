import * as THREE from 'three';
import { tr } from '../i18n';
import { World, N } from '../world/world';
import { Building, KindId, sizeOf } from '../build/catalog';
import { Parts } from './parts';
import { mats } from './materials';
import { Puffs } from './particles';
import type { Fires } from './fires';
import { makeSoldier, soldierStep, Soldier, SoldierMode } from './soldiers';
import { makeFolk, folkStep, Folk, FolkPose } from './folk';
import { makeDraftHorse, rideStep, Rider } from './riders';
import { fireEngine, fireLadder, LADDER_AT } from './fireEngine';

/** Portée des secours (cases) : celle de la caserne pour les incendies, la même pour l'hôpital et la police */
const RANGE = 14;
/** Au-delà de ce temps sur place, on remballe quoi qu'il arrive */
const GIVE_UP = 60;
const WATER = new THREE.Color(0.85, 0.93, 1), COAL = new THREE.Color(0.32, 0.3, 0.3);
/** Le pas des secouristes, leur course (cases par seconde) */
const WALK = 0.34, RUN = 0.66;

export type Service = 'fire' | 'health' | 'police';
const HOME: Record<Service, KindId> = { fire: 'fire', health: 'health', police: 'police' };

/** Un secouriste (ou le cambrioleur) à pied : où il est, où il va, ce qu'il fait une fois arrivé */
interface Man {
  s: Soldier | null;
  f: Folk | null;
  x: number; z: number; h: number;
  tx: number; tz: number; face: number | null;
  /** ce qu'il fait arrivé ; en route : au pas, à la course, ou les brancards en main */
  mode: SoldierMode; pose: FolkPose; speed: number; carry: boolean; phase: number;
}

/** L'équipe descendue du véhicule et ce qu'elle fait : lance et tuyau, brancard et blessé, cambrioleur en fuite */
interface Crew {
  root: THREE.Group;
  men: Man[];
  stage: number;
  /** temps passé à l'étape en cours */
  t: number;
  /** d'où l'on descend du véhicule, et la façade de la cible (le pas de la porte) */
  exit: [number, number];
  door: [number, number];
  /** pompiers : le bout de la lance, l'eau déjà jetée (secondes), le tuyau */
  nozzle?: THREE.Vector3;
  spray: number;
  hose?: THREE.Group;
  /** ambulance : le blessé allongé, le brancard, et où on le pose */
  patient?: THREE.Object3D;
  stretcher?: THREE.Object3D;
  litter?: [number, number];
  /** police : le cambrioleur */
  thief?: Man;
}

interface Unit {
  service: Service;
  station: Building;
  root: THREE.Group;
  /** feux du toit (bleus, et rouge pour la police), qui clignotent en intervention */
  flash: THREE.Mesh[];
  path: number[];
  i: number;
  x: number;
  z: number;
  heading: number;
  state: 'go' | 'work' | 'back' | 'patrol';
  crew: Crew | null;
  /** temps passé à viser le même point du chemin (au-delà, on l'y pose) */
  stuck?: number;
  t: number;
  target: Building | null;
  /** case de route devant le poste */
  home: number;
  speed: number;
  /** le cheval attelé (âge industriel, avant les voitures), le pas de ses jambes */
  horse: Rider | null;
  phase: number;
  /** la grande échelle du camion moderne, qui se dresse vers le feu */
  ladder: THREE.Object3D | null;
  /** la cheminée de la pompe à vapeur (repère du véhicule), qui fume */
  chimney: [number, number, number] | null;
  /** la place où il se range, le long du trottoir devant la cible (côté cible vx, vz), et d'où il part pour s'y garer */
  park: { x: number; z: number; h: number; fx: number; fz: number; fh: number; vx: number; vz: number; t: number } | null;
}

const dark = (c: number, k: number) => new THREE.Color(c).multiplyScalar(k).getHex();
const RED = 0xd8382e, BRASS = 0xd8b050, GLASS = 0x9fc4dc, TINT = 0x3a5068, TYRE = 0x26262a, WHITE = 0xf4f2ee, SKIN = 0xe8b894;

/** Roue à rayons (voitures attelées, premières automobiles) : jante, moyeu, rayons ; l'essieu le long de x */
function spoked(p: Parts, x: number, z: number, r: number, rim: number, hub: number) {
  p.add(new THREE.TorusGeometry(r, r * 0.16, 4, 14).rotateY(Math.PI / 2), x, r, z, rim);
  p.add(new THREE.CylinderGeometry(r * 0.26, r * 0.26, 0.026, 6).rotateZ(Math.PI / 2), x, r, z, hub);
  for (let k = 0; k < 4; k++) p.add(new THREE.BoxGeometry(0.005, r * 1.9, 0.006), x, r, z, hub, 0, false, 0, (k * Math.PI) / 4);
}

/** Roue moderne : pneu, jante claire, moyeu */
function tyre(p: Parts, x: number, z: number, r: number) {
  p.add(new THREE.CylinderGeometry(r, r, 0.03, 12).rotateZ(Math.PI / 2), x, r, z, TYRE);
  p.add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.032, 8).rotateZ(Math.PI / 2), x, r, z, 0xc4cad2);
  p.add(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.034, 6).rotateZ(Math.PI / 2), x, r, z, 0x5d6168);
}

/** Le cocher ou le chauffeur assis, rênes ou volant en main (tourné vers +z) ; sa coiffe */
function driver(p: Parts, x: number, y: number, z: number, coat: number, hat: (p: Parts, y: number) => void) {
  p.box(0.05, 0.018, 0.05, x, y, z + 0.01, dark(coat, 0.75));
  p.box(0.052, 0.062, 0.034, x, y + 0.012, z - 0.012, coat);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.016, 0.045, 0.016), x + s * 0.031, y + 0.05, z + 0.012, coat, 0, false, 0, -0.9);
  p.box(0.032, 0.032, 0.032, x, y + 0.074, z - 0.01, SKIN);
  hat(p, y + 0.106);
}

const helmet = (x: number, z: number) => (p: Parts, y: number) => { p.sphere(0.02, x, y - 0.004, z - 0.01, BRASS, 0, 0.8); p.box(0.006, 0.01, 0.03, x, y + 0.008, z - 0.01, 0xe8c66a); };
const kepi = (x: number, z: number, c: number) => (p: Parts, y: number) => { p.cyl(0.018, 0.017, 0.024, 8, x, y - 0.006, z - 0.01, c); p.box(0.03, 0.004, 0.014, x, y - 0.006, z + 0.008, 0x1e1e22); };
const cap = (x: number, z: number, c: number) => (p: Parts, y: number) => { p.cyl(0.02, 0.02, 0.012, 8, x, y - 0.004, z - 0.01, c); p.cyl(0.03, 0.03, 0.004, 8, x, y - 0.006, z - 0.01, c); };

/** Lanterne de laiton à verre luisant, de part et d'autre de l'avant */
function lanterns(p: Parts, y: number, z: number, w: number) {
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.014, 0.012, 0.022, 8).rotateX(Math.PI / 2), s * w, y, z, BRASS);
    p.box(0.016, 0.016, 0.004, s * w, y - 0.008, z + 0.012, 0xfff1c9, 0, true);
  }
}

/** Croix rouge (sur un flanc tourné vers x, ou une face tournée vers z) */
function cross(p: Parts, x: number, y: number, z: number, onSide: boolean, s = 1) {
  if (onSide) { p.box(0.004, 0.06 * s, 0.018 * s, x, y, z, 0xd84a3e); p.box(0.004, 0.018 * s, 0.06 * s, x, y + 0.021 * s, z, 0xd84a3e); }
  else { p.box(0.018 * s, 0.06 * s, 0.004, x, y, z, 0xd84a3e); p.box(0.06 * s, 0.018 * s, 0.004, x, y + 0.021 * s, z, 0xd84a3e); }
}

interface UnitGeo {
  body: THREE.BufferGeometry;
  /** phares, feux arrière, liserés lumineux (qui luisent la nuit) */
  glow: THREE.BufferGeometry | null;
  /** feux : position et couleur (0 bleu, 1 rouge) */
  lights: [number, number, number, number][];
  /** voiture attelée : un cheval à l'avant */
  horse: boolean;
  ladder: THREE.BufferGeometry | null;
  ladderAt: [number, number, number];
  chimney: [number, number, number] | null;
}

/**
 * Véhicule de secours de l'époque, tourné vers +z : tant que l'usine automobile n'est pas bâtie, attelés, la pompe à vapeur rouge (chaudière de laiton
 * cerclée, cheminée, cylindres, dévidoir), la voiture d'ambulance blanche à toit cintré et croix rouges, le fourgon cellulaire
 * bleu nuit à lucarnes grillagées ; puis les premières automobiles (capot à persiennes, radiateur de laiton, ailes,
 * marchepieds, roues à rayons, phares) ; à l'époque moderne, le fourgon pompe-tonne et sa grande échelle, l'ambulance à
 * damier jaune et vert, la voiture de patrouille à bandes tricolores, tous avec leurs rampes de gyrophares ; à l'âge
 * futuriste, les secours glissent sur coussin d'air au ras de la chaussée (voir `futureUnit`)
 */
export function unitGeo(service: Service, age: number, motor: boolean): UnitGeo {
  const p = new Parts(), lights: [number, number, number, number][] = [];
  const out: UnitGeo = { body: null!, glow: null, lights, horse: false, ladder: null, ladderAt: [0, 0, 0], chimney: null };
  if (age >= 5 && motor) {
    futureUnit(p, service, out);
    const g = p.build(false);
    out.body = g.body; out.glow = g.glow;
    return out;
  }
  if (!motor) {
    out.horse = true;
    // brancards jusqu'au cheval, siège du cocher
    for (const s of [-1, 1]) p.box(0.01, 0.01, 0.3, s * 0.06, 0.13, 0.27, 0x6a4a34);
    if (service === 'fire') {
      // pompe à vapeur : châssis rouge liseré de laiton, chaudière verticale cerclée, cheminée évasée, cylindres et balancier,
      // dévidoir à l'arrière, cloche, cocher casqué
      p.box(0.14, 0.025, 0.36, 0, 0.1, -0.03, RED);
      for (const s of [-1, 1]) p.box(0.006, 0.006, 0.36, s * 0.07, 0.125, -0.03, BRASS);
      p.cyl(0.042, 0.042, 0.13, 10, 0, 0.125, -0.12, BRASS);
      for (const y of [0.15, 0.2, 0.245]) p.cyl(0.044, 0.044, 0.008, 10, 0, y, -0.12, 0x8a6a2a);
      p.sphere(0.042, 0, 0.255, -0.12, BRASS, 1, 0.6);
      p.cyl(0.012, 0.012, 0.07, 6, 0, 0.27, -0.12, 0x2a2a2e); p.cyl(0.024, 0.013, 0.025, 8, 0, 0.335, -0.12, 0x2a2a2e);
      for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.018, 0.018, 0.08, 8).rotateX(Math.PI / 2), s * 0.042, 0.15, -0.01, BRASS);
      p.box(0.11, 0.008, 0.008, 0, 0.19, -0.01, 0x3c3c40); p.box(0.008, 0.06, 0.008, 0, 0.13, -0.01, 0x3c3c40);
      p.add(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10).rotateZ(Math.PI / 2), 0, 0.165, -0.225, 0xd8d0b8);
      for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.045, 0.045, 0.008, 10).rotateZ(Math.PI / 2), s * 0.054, 0.165, -0.225, RED);
      p.box(0.12, 0.02, 0.05, 0, 0.16, 0.1, 0x3a2a20); p.box(0.12, 0.04, 0.008, 0, 0.16, 0.074, RED);
      driver(p, 0, 0.18, 0.105, 0x22305a, helmet(0, 0.105));
      p.cyl(0.012, 0.018, 0.022, 8, 0.05, 0.2, 0.125, BRASS);
      lanterns(p, 0.16, 0.135, 0.064);
      for (const s of [-1, 1]) { spoked(p, s * 0.088, -0.13, 0.075, RED, 0x3c3c40); spoked(p, s * 0.08, 0.08, 0.055, RED, 0x3c3c40); }
      out.chimney = [0, 0.36, -0.12];
    } else {
      // caisse sur son plancher, toit cintré, porte arrière et marchepied, lucarnes
      const health = service === 'health', body = health ? WHITE : 0x1e2a48, roof = health ? 0xd8d4cc : 0x141c30;
      p.box(0.14, 0.02, 0.32, 0, 0.1, -0.04, 0x5a4030);
      p.box(0.15, 0.15, 0.25, 0, 0.12, -0.075, body);
      p.add(new THREE.CylinderGeometry(0.078, 0.078, 0.26, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.35, 1), 0, 0.27, -0.075, roof);
      for (const s of [-1, 1]) p.box(0.004, 0.006, 0.25, s * 0.076, 0.13, -0.075, health ? 0xd84a3e : BRASS);
      p.box(0.1, 0.13, 0.004, 0, 0.125, -0.201, dark(body, 0.92)); p.box(0.006, 0.012, 0.006, 0.035, 0.18, -0.205, BRASS);
      p.box(0.1, 0.008, 0.03, 0, 0.1, -0.215, 0x3c3c40);
      if (health) {
        // voiture d'ambulance : croix rouges, fenêtres à rideaux, cocher au chapeau
        for (const s of [-1, 1]) { cross(p, s * 0.076, 0.15, -0.1, true); for (const z of [-0.17, 0.02]) { p.box(0.004, 0.032, 0.036, s * 0.076, 0.215, z, GLASS); p.box(0.005, 0.012, 0.038, s * 0.077, 0.236, z, 0xe8d8b0); } }
        cross(p, 0, 0.16, -0.203, false, 0.8);
        driver(p, 0, 0.18, 0.105, 0x5a5a62, cap(0, 0.105, 0x2a2a2e));
      } else {
        // fourgon cellulaire : lucarnes grillagées, plaque « POLICE », lanterne bleue, cocher en képi
        for (const s of [-1, 1]) {
          for (const z of [-0.16, -0.075, 0.01]) { p.box(0.004, 0.026, 0.032, s * 0.076, 0.225, z, 0x141418); for (let k = 0; k < 3; k++) p.box(0.005, 0.026, 0.003, s * 0.077, 0.225, z - 0.01 + k * 0.01, 0x8a8f96); }
          p.box(0.004, 0.024, 0.11, s * 0.0765, 0.16, -0.075, WHITE);
          for (let k = 0; k < 6; k++) p.box(0.005, 0.012, 0.008, s * 0.077, 0.166, -0.11 + k * 0.014, 0x1e2a48);
        }
        driver(p, 0, 0.18, 0.105, 0x22305a, kepi(0, 0.105, 0x22305a));
        lights.push([0, 0.32, 0.04, 0]);
      }
      p.box(0.12, 0.02, 0.05, 0, 0.16, 0.1, 0x3a2a20);
      lanterns(p, 0.2, 0.06, 0.08);
      for (const s of [-1, 1]) { spoked(p, s * 0.088, -0.14, 0.07, 0x4a3a2e, 0x3c3c40); spoked(p, s * 0.08, 0.06, 0.055, 0x4a3a2e, 0x3c3c40); }
    }
  } else if (age === 3) {
    // les premières automobiles : capot à persiennes, radiateur de laiton à grille, phares, ailes et marchepieds, roues à
    // rayons, pare-brise et volant
    const front = (body: number) => {
      p.box(0.12, 0.065, 0.1, 0, 0.065, 0.135, body);
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) p.box(0.004, 0.004, 0.06, s * 0.061, 0.115 - k * 0.012, 0.135, dark(body, 0.65));
      p.box(0.1, 0.08, 0.014, 0, 0.055, 0.19, BRASS); for (let k = 0; k < 4; k++) p.box(0.08, 0.004, 0.016, 0, 0.07 + k * 0.016, 0.19, 0x8a6a2a);
      for (const s of [-1, 1]) { p.add(new THREE.CylinderGeometry(0.017, 0.014, 0.024, 8).rotateX(Math.PI / 2), s * 0.052, 0.13, 0.19, BRASS); p.box(0.02, 0.02, 0.004, s * 0.052, 0.12, 0.203, 0xfff1c9, 0, true); }
      for (const z of [-0.13, 0.12]) for (const s of [-1, 1]) { p.box(0.038, 0.008, 0.11, s * 0.08, 0.098, z, dark(body, 0.55)); spoked(p, s * 0.08, z, 0.045, TYRE, BRASS); }
      for (const s of [-1, 1]) p.box(0.032, 0.008, 0.15, s * 0.08, 0.05, 0, 0x2a2a2e);
      p.box(0.12, 0.05, 0.004, 0, 0.135, 0.07, GLASS); p.box(0.124, 0.006, 0.006, 0, 0.185, 0.07, BRASS);
      p.add(new THREE.TorusGeometry(0.016, 0.004, 3, 10), -0.03, 0.15, 0.055, 0x2a2a2e, 0, false, 0, -0.7);
    };
    if (service === 'fire') {
      // autopompe rouge : banquettes et deux pompiers casqués, grande échelle, dévidoir, cloche de laiton
      front(RED);
      p.box(0.15, 0.06, 0.25, 0, 0.06, -0.06, RED); p.box(0.152, 0.01, 0.25, 0, 0.12, -0.06, BRASS);
      driver(p, -0.032, 0.12, 0.035, 0x22305a, helmet(-0.032, 0.035));
      for (const [x, z] of [[0.035, 0.035], [-0.035, -0.06], [0.035, -0.06]]) driver(p, x, 0.12, z, 0x22305a, helmet(x, z));
      for (const s of [-1, 1]) p.box(0.008, 0.008, 0.38, s * 0.045, 0.215, -0.05, 0xb8bcc2);
      for (let k = 0; k < 9; k++) p.box(0.09, 0.006, 0.006, 0, 0.215, -0.22 + k * 0.045, 0xd8dde2);
      for (const s of [-1, 1]) p.box(0.006, 0.09, 0.006, s * 0.045, 0.12, 0.08, 0x8a8f96);
      p.add(new THREE.TorusGeometry(0.035, 0.014, 4, 12).rotateY(Math.PI / 2), 0, 0.15, -0.2, 0xe8d8b0);
      p.cyl(0.014, 0.02, 0.025, 8, 0.06, 0.13, 0.1, BRASS);
    } else if (service === 'health') {
      // voiture d'ambulance : caisse blanche haute à croix rouges, fenêtres dépolies, portes arrière, chauffeur
      front(0xe8e4dc);
      p.box(0.15, 0.16, 0.23, 0, 0.06, -0.085, WHITE); p.box(0.156, 0.016, 0.24, 0, 0.22, -0.085, 0xd8d4cc);
      for (const s of [-1, 1]) { cross(p, s * 0.076, 0.12, -0.1, true); p.box(0.004, 0.03, 0.05, s * 0.076, 0.18, -0.02, 0xe8eef2); }
      p.box(0.004, 0.14, 0.004, 0, 0.07, -0.2005, 0xb8b4ac); cross(p, 0, 0.13, -0.202, false, 0.7);
      driver(p, 0, 0.11, 0.035, 0x5a5a62, cap(0, 0.035, 0x2a2a2e));
    } else {
      // voiture de police : limousine noire, liseré bleu, plaque « POLICE », lanterne bleue sur le toit, agent en képi
      front(0x1e1e22);
      p.box(0.15, 0.14, 0.22, 0, 0.06, -0.09, 0x1e1e22); p.box(0.154, 0.012, 0.224, 0, 0.12, -0.09, 0x2c4a9a);
      p.box(0.156, 0.012, 0.23, 0, 0.2, -0.09, 0x141418);
      for (const s of [-1, 1]) { p.box(0.004, 0.035, 0.07, s * 0.076, 0.15, -0.06, TINT); p.box(0.004, 0.035, 0.05, s * 0.076, 0.15, -0.15, TINT); p.box(0.004, 0.018, 0.08, s * 0.0765, 0.085, -0.1, WHITE); }
      driver(p, 0, 0.11, 0.035, 0x22305a, kepi(0, 0.035, 0x22305a));
      lights.push([0, 0.22, -0.06, 0]);
    }
  } else if (service === 'fire') {
    // fourgon pompe-tonne (voir `fireEngine`, le même que ceux garés devant la caserne) ; la grande échelle sur sa tourelle,
    // qui se dresse vers le feu
    fireEngine(p, 0, 0, 0, lights);
    const lp = new Parts();
    fireLadder(lp);
    out.ladder = lp.build(false).body;
    out.ladderAt = [...LADDER_AT];
  } else if (service === 'health') {
    // ambulance : fourgon blanc, capot, pare-brise, damier jaune et vert, étoile de vie bleue, rampes avant et arrière
    p.box(0.15, 0.16, 0.28, 0, 0.035, -0.06, WHITE);
    p.box(0.146, 0.07, 0.1, 0, 0.035, 0.13, WHITE);
    p.add(new THREE.BoxGeometry(0.14, 0.06, 0.004), 0, 0.14, 0.084, GLASS, 0, false, 0, -0.6);
    for (const s of [-1, 1]) {
      p.box(0.004, 0.045, 0.05, s * 0.076, 0.13, 0.05, GLASS);
      for (let k = 0; k < 9; k++) p.box(0.004, 0.026, 0.031, s * 0.0765, 0.075 + (k % 2) * 0.026, -0.18 + k * 0.031, k % 2 ? 0xd8e83a : 0x2a9a5a);
      p.box(0.004, 0.03, 0.03, s * 0.077, 0.15, -0.08, 0x2c6ad8);
    }
    p.box(0.15, 0.03, 0.004, 0, 0.08, -0.2, 0xd8e83a); p.box(0.004, 0.13, 0.004, 0, 0.05, -0.2015, 0xb8b4ac);
    for (const s of [-1, 1]) p.box(0.05, 0.05, 0.004, s * 0.035, 0.13, -0.202, GLASS);
    p.box(0.155, 0.02, 0.012, 0, 0.025, 0.18, 0x2a2a2e); for (const s of [-1, 1]) p.box(0.026, 0.014, 0.004, s * 0.055, 0.075, 0.181, 0xfff1c9, 0, true);
    for (const z of [-0.14, 0.11]) for (const s of [-1, 1]) tyre(p, s * 0.075, z, 0.034);
    lights.push([-0.04, 0.2, 0.06, 0], [0.04, 0.2, 0.06, 0], [-0.05, 0.2, -0.19, 0], [0.05, 0.2, -0.19, 0]);
  } else {
    // voiture de patrouille : caisse blanche, capot bleu, vitres teintées, bandes tricolores et « POLICE », rampe bleue et rouge
    p.box(0.15, 0.055, 0.3, 0, 0.035, 0, WHITE);
    p.box(0.15, 0.012, 0.09, 0, 0.09, 0.105, 0x2c4a9a);
    p.box(0.13, 0.055, 0.15, 0, 0.09, -0.025, TINT); p.box(0.132, 0.008, 0.13, 0, 0.145, -0.03, WHITE);
    for (const s of [-1, 1]) {
      p.box(0.004, 0.022, 0.3, s * 0.0755, 0.05, 0, 0x2c4a9a);
      for (const [z, c] of [[0.02, 0x2c4a9a], [0.0, WHITE], [-0.02, 0xd84a3e]] as [number, number][]) p.box(0.005, 0.03, 0.02, s * 0.076, 0.05, z + 0.04, c);
      for (let k = 0; k < 6; k++) p.box(0.005, 0.01, 0.008, s * 0.077, 0.056, -0.11 + k * 0.014, WHITE);
      p.box(0.012, 0.01, 0.016, s * 0.082, 0.115, 0.05, 0x2a2a2e);
    }
    p.box(0.155, 0.02, 0.012, 0, 0.03, 0.152, 0x2a2a2e); p.box(0.155, 0.02, 0.012, 0, 0.03, -0.152, 0x2a2a2e);
    for (const s of [-1, 1]) { p.box(0.03, 0.014, 0.004, s * 0.05, 0.065, 0.1505, 0xfff1c9, 0, true); p.box(0.026, 0.014, 0.004, s * 0.055, 0.065, -0.1505, 0xd84a3e, 0, true); }
    for (const z of [-0.09, 0.09]) for (const s of [-1, 1]) tyre(p, s * 0.075, z, 0.035);
    p.box(0.1, 0.012, 0.03, 0, 0.153, -0.02, 0x2a2a2e);
    lights.push([0.03, 0.17, -0.02, 0], [-0.03, 0.17, -0.02, 1]);
  }
  const g = p.build(false);
  out.body = g.body; out.glow = g.glow;
  return out;
}

/** Bleu nuit des carénages futuristes, chrome, cyan des patins */
const HULL = 0x2e3440, CHROME = 0xc8d0da, CYAN = 0x9ff8ff;

/** Patins de sustentation : carénage sombre de part et d'autre, semelle qui luit dessous, buses aux deux bouts */
function hoverPads(p: Parts, w: number, len: number, z = 0) {
  for (const s of [-1, 1]) {
    p.box(0.034, 0.022, len, s * w, 0.03, z, HULL);
    p.box(0.028, 0.004, len - 0.02, s * w, 0.026, z, CYAN, 0, 'neon');
    for (const e of [-1, 1]) p.cyl(0.016, 0.02, 0.012, 8, s * w, 0.018, z + e * (len / 2 - 0.022), 0x5a6270);
  }
}

/** Un secouriste debout (sur le marchepied arrière), une main à la rambarde : jambes, combinaison, casque à visière */
function stander(p: Parts, x: number, y: number, z: number, suit: number, helm: number) {
  for (const s of [-1, 1]) p.box(0.016, 0.05, 0.018, x + s * 0.012, y, z, dark(suit, 0.7));
  p.box(0.046, 0.06, 0.03, x, y + 0.05, z, suit);
  p.box(0.048, 0.008, 0.032, x, y + 0.075, z, 0xd8e83a);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.014, 0.05, 0.014), x + s * 0.03, y + 0.09, z + 0.006, suit, 0, false, s * -0.25, 0.4);
  p.box(0.028, 0.028, 0.028, x, y + 0.11, z, SKIN);
  p.sphere(0.02, x, y + 0.13, z, helm, 0, 0.85);
  p.box(0.034, 0.012, 0.006, x, y + 0.122, z + 0.016, TINT);
}

/** Tête et épaules d'un équipier assis, casque à visière (vue par la verrière ouverte ou le cockpit) */
function seated(p: Parts, x: number, y: number, z: number, suit: number, helm: number) {
  p.box(0.046, 0.04, 0.03, x, y, z, suit);
  p.box(0.026, 0.026, 0.026, x, y + 0.04, z + 0.002, SKIN);
  p.sphere(0.019, x, y + 0.058, z, helm, 0, 0.85);
  p.box(0.03, 0.01, 0.006, x, y + 0.052, z + 0.016, TINT);
}

/**
 * Les secours de l'âge futuriste, tournés vers +z, sur patins de sustentation qui luisent : l'aéroglisseur-pompe rouge
 * (cabine à verrière fumée, caissons à volets chromés, liseré orange lumineux, canon à eau sur tourelle, grande échelle
 * télescopique, deux pompiers debout sur le marchepied arrière, antenne, rampe de feux) ; le fourgon maglev d'ambulance
 * (caisse blanche à toit cintré, bandeau vert lumineux, damier, croix holographique sur le toit, cabine aux montants
 * ouverts où l'on voit le pilote) ; l'intercepteur de police (coque en coin bleu nuit et blanche, cockpit ouvert et ses
 * deux agents casqués, arceau porte-feux, ailerons, réacteurs arrière, antenne fouet)
 */
function futureUnit(p: Parts, service: Service, out: UnitGeo) {
  const lights = out.lights;
  if (service === 'fire') {
    hoverPads(p, 0.07, 0.42, -0.02);
    // coque : jupe sombre, caisse rouge, cabine à l'avant
    p.box(0.18, 0.024, 0.46, 0, 0.04, -0.02, HULL);
    p.box(0.17, 0.11, 0.3, 0, 0.064, -0.07, RED);
    p.box(0.17, 0.1, 0.12, 0, 0.064, 0.145, RED);
    p.add(new THREE.BoxGeometry(0.17, 0.05, 0.08), 0, 0.17, 0.155, RED, 0, false, 0, -0.35);
    p.add(new THREE.BoxGeometry(0.156, 0.06, 0.004), 0, 0.172, 0.2, TINT, 0, false, 0, -0.55);
    for (const s of [-1, 1]) p.box(0.004, 0.04, 0.07, s * 0.0855, 0.12, 0.15, TINT);
    // nez : bouclier chromé, phares en bandeau, liseré lumineux tout du long
    p.box(0.176, 0.022, 0.012, 0, 0.05, 0.208, CHROME);
    p.box(0.14, 0.012, 0.004, 0, 0.1, 0.207, 0xfff1c9, 0, true);
    for (const s of [-1, 1]) {
      p.box(0.004, 0.006, 0.44, s * 0.0855, 0.112, -0.02, 0xff7a3a, 0, 'neon');
      // caissons à volets chromés, poignées
      for (const z of [-0.18, -0.09, 0.0]) { p.box(0.004, 0.06, 0.08, s * 0.086, 0.07, z, 0x8a2a24); for (let k = 0; k < 4; k++) p.box(0.005, 0.003, 0.08, s * 0.087, 0.078 + k * 0.014, z, CHROME); }
    }
    // chevrons rouge et jaune à l'arrière, feux arrière, marchepied et rambarde, deux pompiers debout
    for (let k = 0; k < 6; k++) p.box(0.026, 0.04, 0.004, -0.065 + k * 0.026, 0.07, -0.222, k % 2 ? 0xf2c23a : 0xd8382e);
    for (const s of [-1, 1]) p.box(0.02, 0.012, 0.004, s * 0.072, 0.12, -0.222, 0xff3a2a, 0, true);
    p.box(0.17, 0.008, 0.04, 0, 0.05, -0.245, CHROME);
    p.box(0.15, 0.006, 0.006, 0, 0.16, -0.225, CHROME);
    for (const s of [-1, 1]) p.box(0.006, 0.1, 0.006, s * 0.075, 0.06, -0.225, CHROME);
    for (const s of [-1, 1]) stander(p, s * 0.04, 0.058, -0.248, 0x2a2e36, 0xf2c23a);
    // le dessus : canon à eau sur sa tourelle, antenne, rampe de feux sur la cabine
    p.cyl(0.03, 0.034, 0.016, 10, 0, 0.174, 0.04, 0x5a6270);
    p.add(new THREE.CylinderGeometry(0.008, 0.012, 0.08, 8).rotateX(Math.PI / 2 - 0.3), 0, 0.2, 0.08, CHROME);
    p.cyl(0.002, 0.002, 0.09, 4, 0.07, 0.19, 0.12, 0x2a2a2e);
    p.box(0.12, 0.012, 0.02, 0, 0.198, 0.13, HULL);
    for (const s of [-1, 1]) p.box(0.04, 0.004, 0.012, s * 0.035, 0.196, 0.142, CYAN, 0, 'neon');
    lights.push([-0.04, 0.21, 0.13, 0], [0.04, 0.21, 0.13, 1], [-0.07, 0.18, -0.2, 1], [0.07, 0.18, -0.2, 0]);
    // la grande échelle télescopique (repère de son pied), blanche à liseré lumineux
    const lp = new Parts();
    for (const s of [-1, 1]) { lp.box(0.01, 0.014, 0.38, s * 0.028, 0, 0.19, 0xe8ecf0); lp.box(0.003, 0.004, 0.36, s * 0.034, 0.008, 0.19, CYAN); }
    for (let k = 0; k < 10; k++) lp.box(0.056, 0.006, 0.006, 0, 0.004, 0.02 + k * 0.038, CHROME);
    lp.box(0.05, 0.016, 0.03, 0, 0.004, 0.38, 0x5a6270);
    lp.box(0.05, 0.03, 0.05, 0, -0.012, 0, 0x5a6270);
    out.ladder = lp.build(false).body;
    out.ladderAt = [0, 0.19, -0.15];
  } else if (service === 'health') {
    hoverPads(p, 0.068, 0.38, -0.02);
    p.box(0.168, 0.024, 0.42, 0, 0.04, -0.02, HULL);
    // caisse blanche à toit cintré, cabine en avant à montants ouverts (on y voit le pilote)
    p.box(0.16, 0.15, 0.27, 0, 0.064, -0.075, WHITE);
    p.add(new THREE.CylinderGeometry(0.08, 0.08, 0.27, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.3, 1), 0, 0.214, -0.075, 0xe4e8ec);
    p.box(0.156, 0.07, 0.12, 0, 0.064, 0.13, WHITE);
    p.add(new THREE.BoxGeometry(0.15, 0.07, 0.004), 0, 0.165, 0.135, TINT, 0, false, 0, -0.75);
    for (const s of [-1, 1]) { p.box(0.006, 0.075, 0.006, s * 0.075, 0.134, 0.17, WHITE); p.box(0.006, 0.08, 0.006, s * 0.075, 0.134, 0.065, WHITE); }
    p.box(0.156, 0.006, 0.11, 0, 0.21, 0.115, WHITE);
    seated(p, -0.032, 0.134, 0.1, 0x2a9a5a, WHITE);
    p.box(0.15, 0.012, 0.004, 0, 0.1, 0.191, 0xfff1c9, 0, true);
    p.box(0.162, 0.02, 0.012, 0, 0.05, 0.195, CHROME);
    for (const s of [-1, 1]) {
      // bandeau vert lumineux, damier jaune et vert, croix, hublot
      p.box(0.004, 0.006, 0.4, s * 0.0805, 0.11, -0.02, 0x3aff9a, 0, 'neon');
      for (let k = 0; k < 8; k++) p.box(0.004, 0.022, 0.032, s * 0.0805, 0.076 + (k % 2) * 0.022, -0.2 + k * 0.032, k % 2 ? 0xd8e83a : 0x2a9a5a);
      cross(p, s * 0.081, 0.14, -0.08, true);
      p.box(0.004, 0.03, 0.04, s * 0.081, 0.16, 0.0, TINT);
    }
    // portes arrière, feux, croix holographique sur le toit, antenne
    p.box(0.004, 0.13, 0.004, 0, 0.07, -0.2105, 0xb8bcc2);
    cross(p, 0, 0.14, -0.212, false, 0.7);
    for (const s of [-1, 1]) p.box(0.016, 0.03, 0.004, s * 0.07, 0.15, -0.212, 0xff3a2a, 0, true);
    p.box(0.012, 0.004, 0.05, 0, 0.246, -0.1, 0x3aff9a, 0, 'neon'); p.box(0.05, 0.004, 0.012, 0, 0.246, -0.09, 0x3aff9a, 0, 'neon');
    p.cyl(0.002, 0.002, 0.08, 4, -0.06, 0.24, -0.18, 0x2a2a2e);
    p.box(0.1, 0.012, 0.024, 0, 0.214, 0.12, HULL);
    lights.push([-0.035, 0.228, 0.12, 0], [0.035, 0.228, 0.12, 0], [-0.05, 0.25, -0.19, 0], [0.05, 0.25, -0.19, 0]);
  } else {
    hoverPads(p, 0.062, 0.3);
    // coque en coin : dessous bleu nuit, dessus blanc, nez effilé
    p.box(0.15, 0.04, 0.32, 0, 0.04, 0, 0x1c2a4a);
    p.add(new THREE.BoxGeometry(0.148, 0.036, 0.12), 0, 0.095, 0.1, WHITE, 0, false, 0, -0.18);
    p.box(0.148, 0.04, 0.16, 0, 0.08, -0.08, WHITE);
    p.add(new THREE.ConeGeometry(0.075, 0.06, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.4, 1), 0, 0.06, 0.185, 0x1c2a4a);
    // cockpit ouvert : pare-brise fumé, deux agents casqués, arceau et sa rampe de feux
    p.add(new THREE.BoxGeometry(0.12, 0.04, 0.004), 0, 0.132, 0.06, TINT, 0, false, 0, -0.6);
    p.box(0.12, 0.01, 0.1, 0, 0.12, -0.01, 0x1e1e22);
    for (const s of [-1, 1]) seated(p, s * 0.03, 0.124, -0.01, 0x22305a, 0x2c4a9a);
    for (const s of [-1, 1]) p.box(0.008, 0.06, 0.008, s * 0.065, 0.12, -0.06, CHROME);
    p.box(0.138, 0.012, 0.016, 0, 0.18, -0.06, HULL);
    // flancs : bande lumineuse bleue, tirets « POLICE », ailerons et réacteurs à l'arrière, phares et feux arrière
    for (const s of [-1, 1]) {
      p.box(0.004, 0.006, 0.3, s * 0.0755, 0.07, 0, 0x4a8aff, 0, 'neon');
      for (let k = 0; k < 6; k++) p.box(0.005, 0.01, 0.008, s * 0.0755, 0.095, -0.12 + k * 0.016, 0x1c2a4a);
      p.add(new THREE.BoxGeometry(0.006, 0.05, 0.05), s * 0.06, 0.135, -0.14, 0x1c2a4a, 0, false, s * 0.25);
      p.box(0.004, 0.004, 0.03, s * 0.063, 0.15, -0.15, s < 0 ? 0x4a8aff : 0xff4a3a, 0, 'neon');
      p.add(new THREE.CylinderGeometry(0.02, 0.016, 0.03, 8).rotateX(Math.PI / 2), s * 0.04, 0.07, -0.17, 0x5a6270);
      p.add(new THREE.CircleGeometry(0.014, 8).rotateY(Math.PI), s * 0.04, 0.07, -0.186, CYAN, 0, 'neon');
      p.box(0.034, 0.008, 0.004, s * 0.045, 0.07, 0.16, 0xfff1c9, 0, true);
    }
    p.cyl(0.0015, 0.0015, 0.12, 4, 0.06, 0.12, -0.12, 0x2a2a2e);
    lights.push([-0.035, 0.195, -0.06, 0], [0.035, 0.195, -0.06, 1]);
  }
}

/** La civière : toile tendue sur deux brancards ; le blessé allongé sous sa couverture bleue (le long de z) */
function stretcherGeo() {
  const p = new Parts();
  for (const s of [-1, 1]) p.box(0.008, 0.008, 0.24, s * 0.03, 0.02, 0, 0x8a6a4a);
  p.box(0.056, 0.004, 0.18, 0, 0.022, 0, 0xd8d0b8);
  for (const z of [-0.08, 0.08]) for (const s of [-1, 1]) p.box(0.006, 0.02, 0.006, s * 0.028, 0, z, 0x5a5650);
  return p.build(false).body;
}
function patientGeo() {
  const p = new Parts();
  p.box(0.05, 0.02, 0.15, 0, 0, -0.01, 0x3a4a6a); p.box(0.052, 0.024, 0.09, 0, 0.004, -0.03, 0x3c7fd8);
  p.box(0.034, 0.034, 0.034, 0, 0.004, 0.08, SKIN); p.box(0.036, 0.01, 0.036, 0, 0.034, 0.08, 0x4a3020);
  return p.build(false).body;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const turn = (from: number, to: number, k: number) => { let d = to - from; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return from + d * k; };

/**
 * Les secours en intervention : quand un bâtiment prend feu à portée d'une caserne, le camion (ou la pompe attelée) part
 * de la caserne par les routes, se range le long du trottoir devant le bâtiment ; les pompiers en descendent, déroulent le
 * tuyau, le porte-lance arrose les flammes en balayant la façade, un autre attaque la porte à la hache, l'échelle se dresse ;
 * le feu éteint, ils remballent. De temps en temps un habitant fait un malaise devant chez lui : les ambulanciers vont à lui
 * avec la civière, lui donnent les premiers soins, l'emportent ; un cambriolage est signalé : les agents frappent à la porte,
 * le voleur s'enfuit par la rue, l'un d'eux le rattrape, il lève les mains et on l'emmène. À l'époque moderne, la voiture de
 * patrouille fait sa ronde entre deux appels. Feux bleus (et rouges) qui clignotent en intervention
 */
export class Emergencies {
  group = new THREE.Group();
  /** messages à afficher (départ de l'ambulance, de la police) */
  news: string[] = [];
  /** met le feu à un bâtiment (donné par le jeu : alerte les habitants, joue le son) */
  ignite: ((b: Building) => void) | null = null;
  private units: Unit[] = [];
  private geos = new Map<string, UnitGeo>();
  private blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.55, 2.2) });
  private red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.3, 0.25) });
  private flashG = new THREE.BoxGeometry(0.035, 0.02, 0.03);
  private stretcherG = stretcherGeo();
  private patientG = patientGeo();
  private hoseMat = new THREE.MeshStandardMaterial({ color: 0xd8d0b0, roughness: 0.9 });
  private water = new Puffs(260, 0);
  /** prochains appels (secondes) : malaise, cambriolage, feu accidentel ; deux fois plus rares qu'avant */
  private timers: Record<Service | 'blaze', number> = { fire: 0, health: 140, police: 220, blaze: 400 };
  private time = 0;
  private age = -1;

  constructor(private world: World, private fires: Fires, private avoid: Set<number>) {
    this.group.add(this.water.mesh);
  }

  /** Les interventions de l'ambulance et de la police en cours, pour leurs cartes : où est le véhicule, ce qu'il fait, l'avancement */
  incidents(): { key: string; icon: string; title: string; status: string; progress: number; x: number; z: number }[] {
    return this.units.filter((u) => u.service !== 'fire' && u.target && (u.state === 'go' || u.state === 'work')).map((u) => {
      const health = u.service === 'health', go = u.state === 'go' || !u.crew, st = u.crew?.stage ?? 0;
      const progress = go ? 0.35 * (u.path.length ? u.i / u.path.length : 0) : 0.35 + 0.65 * Math.min(1, st / 4);
      const status = tr(health
        ? go ? 'L’ambulance arrive, sirène hurlante' : st < 1 ? 'Les ambulanciers accourent avec la civière' : st < 2 ? 'Premiers soins au blessé' : 'On l’emporte sur la civière'
        : go ? 'La police accourt' : st < 1 ? 'Les agents frappent à la porte' : st < 2 ? 'Le cambrioleur s’enfuit par la rue !' : st < 3 ? 'Rattrapé : il lève les mains' : 'On l’emmène au poste');
      const p = u.crew?.thief && st >= 1 ? u.crew.thief : null;
      return { key: `unit:${u.service}:${u.target!.id}`, icon: health ? '🚑' : '🚓', title: tr(health ? 'Un habitant a fait un malaise' : 'Cambriolage'), status, progress, x: p ? p.x : u.x, z: p ? p.z : u.z };
    });
  }

  /** Arrosage du feu de ce bâtiment par les pompiers : secondes d'eau déjà jetée, 0 en route, null sans camion */
  spraying(b: Building): number | null {
    const u = this.units.find((o) => o.service === 'fire' && o.target?.id === b.id);
    if (!u) return null;
    return u.state === 'work' ? u.crew?.spray ?? 0 : 0;
  }

  private geo(service: Service, age: number) {
    const k = `${service}|${age}|${+this.builtMotor}`;
    let g = this.geos.get(k);
    if (!g) { g = unitGeo(service, age, this.builtMotor); this.geos.set(k, g); }
    return g;
  }

  /** l'usine automobile est bâtie : les secours roulent en voiture ; sans elle, voitures attelées à tout âge */
  motor = false;
  private builtMotor = false;

  // ---------------- L'équipe à pied ----------------

  private man(kind: 'fireman' | 'medic' | 'police' | 'thief', v: number, x: number, z: number): Man {
    const s = kind === 'thief' ? null : makeSoldier(this.age, v, false, kind), f = kind === 'thief' ? makeFolk({ age: this.age, v, role: 'thief' }) : null;
    return { s, f, x, z, h: 0, tx: x, tz: z, face: null, mode: 'guard', pose: 'idle', speed: WALK, carry: false, phase: v * 1.3 };
  }

  /** Il va vers sa cible (au pas, à la course, ou la civière en main) et, arrivé, fait son geste ; vrai s'il est arrivé */
  private stepMan(m: Man, root: THREE.Group, dt: number) {
    const w = this.world, dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz), moving = d > 0.01;
    if (moving) { const st = Math.min(d, dt * m.speed); m.x += (dx / d) * st; m.z += (dz / d) * st; m.h = turn(m.h, Math.atan2(dx, dz), Math.min(1, dt * 12)); }
    else if (m.face !== null) m.h = turn(m.h, m.face, Math.min(1, dt * 6));
    m.phase += dt * (moving ? (m.speed > WALK ? 13 : 9) : 2.5);
    const o = (m.s ?? m.f)!.root;
    if (o.parent !== root) root.add(o);
    o.position.set(m.x, w.surfaceAt(m.x, m.z), m.z);
    o.rotation.y = m.h;
    if (m.s) soldierStep(m.s, m.phase, moving ? (m.carry ? 'carry' : m.speed > WALK ? 'run' : 'walk') : m.mode);
    else if (m.f) folkStep(m.f, m.phase, moving ? (m.speed > WALK ? 'run' : 'walk') : m.pose);
    return !moving;
  }

  private go(m: Man, x: number, z: number, face: number | null, speed = WALK) { m.tx = x; m.tz = z; m.face = face; m.speed = speed; }

  /** Les secouristes descendent du véhicule garé : du côté de la cible, à l'arrière */
  private crewFor(u: Unit, tb: Building): Crew {
    const s = sizeOf(tb), tx = tb.x + s / 2, tz = tb.z + s / 2, P = u.park!, fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    const exit: [number, number] = [u.x + P.vx * 0.12 - fx * 0.1, u.z + P.vz * 0.12 - fz * 0.1];
    // le pas de la porte : sur la façade tournée vers la rue, juste devant
    const half = s / 2 + 0.12, door: [number, number] = [tx - P.vx * half, tz - P.vz * half];
    const root = new THREE.Group();
    this.group.add(root);
    return { root, men: [], stage: 0, t: 0, exit, door, spray: 0 };
  }

  /**
   * Les pompiers : le porte-lance et son second vont jusqu'à un peu moins d'une case du feu, le tuyau déroulé derrière eux,
   * et arrosent en balayant la façade ; le troisième attaque la porte à la hache, revient à la pompe, y retourne. Le feu
   * éteint, ils remballent et remontent
   */
  private stepFire(u: Unit, tb: Building, dt: number) {
    const w = this.world, s = sizeOf(tb), tx = tb.x + s / 2, tz = tb.z + s / 2;
    if (!u.crew) {
      const c = (u.crew = this.crewFor(u, tb));
      for (let i = 0; i < 3; i++) c.men.push(this.man('fireman', u.home + i, c.exit[0], c.exit[1]));
    }
    const c = u.crew, [ex, ez] = c.exit, d = Math.hypot(tx - ex, tz - ez) || 1, dx = (tx - ex) / d, dz = (tz - ez) / d, px = -dz, pz = dx;
    const reach = Math.max(0.3, Math.min(5, d - (s / 2 + 0.3))), face = Math.atan2(dx, dz);
    const [lance, second, axe] = c.men;
    c.t += dt;
    const out = !this.fires.burning.some((b) => b.id === tb.id) || u.t > GIVE_UP;
    if (c.stage === 0) {
      // ils descendent, le tuyau sur l'épaule
      this.go(lance, ex + dx * reach + px * 0.02, ez + dz * reach + pz * 0.02, face, RUN);
      this.go(second, ex + dx * (reach - 0.15) - px * 0.06, ez + dz * (reach - 0.15) - pz * 0.06, face, RUN);
      this.go(axe, c.door[0] + px * 0.1, c.door[1] + pz * 0.1, Math.atan2(tx - c.door[0], tz - c.door[1]), RUN);
      lance.mode = second.mode = 'fight'; axe.mode = 'fight';
      c.stage = 1; c.t = 0;
    }
    const at = c.men.map((m) => this.stepMan(m, c.root, dt));
    if (c.stage === 1 && at[0]) {
      // le tuyau déroulé, du camion à la lance
      if (!c.hose) {
        c.hose = new THREE.Group();
        const pts = [0, 0.33, 0.66, 1].map((k, i) => new THREE.Vector3(ex + (lance.x - ex) * k + px * [0, 0.035, -0.04, 0][i], 0, ez + (lance.z - ez) * k + pz * [0, 0.035, -0.04, 0][i]));
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1], m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, a.distanceTo(b)), this.hoseMat);
          m.position.set((a.x + b.x) / 2, w.surfaceAt((a.x + b.x) / 2, (a.z + b.z) / 2) + 0.008, (a.z + b.z) / 2);
          m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
          c.hose.add(m);
        }
        c.root.add(c.hose);
        c.nozzle = new THREE.Vector3(lance.x + dx * 0.09, w.surfaceAt(lance.x, lance.z) + 0.13, lance.z + dz * 0.09);
      }
      // l'eau : le jet part de la lance et balaie la façade
      c.spray += dt;
      const n = c.nozzle!, sweep = Math.sin(this.time * 0.9) * 0.28 * s, ax = tx + px * sweep, az = tz + pz * sweep, y1 = w.h(tb.x, tb.z) + 0.35;
      lance.face = Math.atan2(ax - lance.x, az - lance.z);
      if (Math.random() < dt * 45) {
        const k = 0.9 + Math.random() * 0.3;
        this.water.spawn(n.x, n.y, n.z, (ax - n.x) * k, (y1 - n.y) * k + 0.3, (az - n.z) * k, 0.03, 1, WATER, 0, { grow: 1.6, drag: 0, wind: 0.05, alpha: 0.7 });
      }
      // la hache : à la porte, puis à la pompe, et ainsi de suite
      if (at[2] && c.t > 5) {
        c.t = 0;
        const atDoor = Math.hypot(axe.x - c.door[0], axe.z - c.door[1]) < 0.3;
        if (atDoor) { this.go(axe, ex - Math.sin(u.heading) * 0.08, ez - Math.cos(u.heading) * 0.08, u.heading + Math.PI / 2); axe.mode = 'guard'; }
        else { this.go(axe, c.door[0] + px * 0.1, c.door[1] + pz * 0.1, Math.atan2(tx - c.door[0], tz - c.door[1])); axe.mode = 'fight'; }
      }
      if (out) {
        // le feu est éteint : on enroule le tuyau, on remonte
        c.stage = 2; c.t = 0;
        if (c.hose) { c.root.remove(c.hose); c.hose.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); c.hose = undefined; }
        c.men.forEach((m, i) => { this.go(m, ex - px * 0.04 * i, ez - pz * 0.04 * i, null); m.mode = 'guard'; });
      }
    } else if (c.stage === 1 && out) { c.stage = 2; c.men.forEach((m) => this.go(m, ex, ez, null)); }
    if (c.stage === 2 && at.every(Boolean)) { this.recall(u); this.goHome(u); }
  }

  /**
   * Les ambulanciers : ils vont au blessé allongé devant chez lui, posent la civière, s'accroupissent pour les premiers soins,
   * le couchent sur la civière et la portent jusqu'à l'ambulance, où ils le chargent
   */
  private stepHealth(u: Unit, tb: Building, dt: number) {
    const w = this.world, s = sizeOf(tb), tx = tb.x + s / 2, tz = tb.z + s / 2;
    if (!u.crew) {
      const c = (u.crew = this.crewFor(u, tb));
      for (let i = 0; i < 2; i++) c.men.push(this.man('medic', u.home + i, c.exit[0], c.exit[1]));
      // le blessé, allongé le long de la façade
      const P = u.park!, ry = Math.atan2(-P.vz, P.vx);
      c.patient = new THREE.Mesh(this.patientG, mats.body);
      c.patient.position.set(c.door[0], w.surfaceAt(c.door[0], c.door[1]) + 0.012, c.door[1]);
      c.patient.rotation.y = ry;
      c.patient.castShadow = true;
      c.stretcher = new THREE.Mesh(this.stretcherG, mats.body);
      c.stretcher.visible = false;
      c.stretcher.castShadow = true;
      c.root.add(c.patient, c.stretcher);
      c.litter = [c.door[0] - P.vx * 0.12, c.door[1] - P.vz * 0.12];
    }
    const c = u.crew, [a, b] = c.men, P = u.park!, [lx, lz] = c.litter!, ry = Math.atan2(-P.vz, P.vx), fx = Math.sin(ry), fz = Math.cos(ry);
    c.t += dt;
    if (c.stage === 0) {
      // ils accourent, chacun d'un côté du blessé
      this.go(a, lx + fx * 0.11, lz + fz * 0.11, Math.atan2(c.door[0] - lx, c.door[1] - lz), RUN);
      this.go(b, lx - fx * 0.11, lz - fz * 0.11, Math.atan2(c.door[0] - lx, c.door[1] - lz), RUN);
      a.mode = b.mode = 'kneel';
      c.stage = 1; c.t = 0;
    }
    const at = c.men.map((m) => (c.stage === 3 ? true : this.stepMan(m, c.root, dt)));
    if (c.stage === 1 && at.every(Boolean)) {
      // la civière posée à côté de lui ; les premiers soins
      c.stretcher!.visible = true;
      c.stretcher!.position.set(lx, w.surfaceAt(lx, lz), lz);
      c.stretcher!.rotation.y = ry;
      if (c.t > 7) {
        // on le couche sur la civière, chacun prend un bout
        c.stage = 2; c.t = 0;
        this.go(a, lx + fx * 0.15, lz + fz * 0.15, ry + Math.PI); this.go(b, lx - fx * 0.15, lz - fz * 0.15, ry);
        a.mode = b.mode = 'carry';
      }
    } else if (c.stage === 1) c.t = Math.min(c.t, 0.5);
    if (c.stage === 2 && at.every(Boolean)) { c.stage = 3; c.t = 0; }
    if (c.stage === 2) { c.patient!.position.set(lx, w.surfaceAt(lx, lz) + 0.028, lz); c.patient!.rotation.y = ry; }
    if (c.stage === 3) {
      // la civière portée jusqu'à l'arrière de l'ambulance
      const [ex, ez] = c.exit, d = Math.hypot(ex - lx, ez - lz) || 1, k = Math.min(1, (c.t * WALK) / d), mx = lx + (ex - lx) * k, mz = lz + (ez - lz) * k;
      const h = Math.atan2(ex - lx, ez - lz), hx = Math.sin(h), hz = Math.cos(h), gy = w.surfaceAt(mx, mz);
      c.stretcher!.position.set(mx, gy + 0.07, mz); c.stretcher!.rotation.y = h;
      c.patient!.position.set(mx, gy + 0.098, mz); c.patient!.rotation.y = h;
      for (const [man, sg] of [[a, 1], [b, -1]] as [Man, number][]) {
        man.x = mx + hx * 0.14 * sg; man.z = mz + hz * 0.14 * sg; man.h = h; man.phase += dt * 9;
        const o = man.s!.root;
        o.position.set(man.x, w.surfaceAt(man.x, man.z), man.z); o.rotation.y = h;
        soldierStep(man.s!, man.phase, k < 1 ? 'carry' : 'guard');
      }
      if (k >= 1 && c.t > d / WALK + 1.2) { this.recall(u); this.goHome(u); }
    }
    if (u.t > GIVE_UP) { this.recall(u); this.goHome(u); }
  }

  /**
   * La police : un agent frappe à la porte, l'autre attend près de la voiture ; le cambrioleur jaillit et file par la rue,
   * l'agent lui court après et le rattrape ; il lève les mains ; on le ramène à la voiture, tout le monde remonte
   */
  private stepPolice(u: Unit, tb: Building, dt: number) {
    const s = sizeOf(tb), tx = tb.x + s / 2, tz = tb.z + s / 2;
    if (!u.crew) {
      const c = (u.crew = this.crewFor(u, tb));
      for (let i = 0; i < 2; i++) c.men.push(this.man('police', u.home + i, c.exit[0], c.exit[1]));
      c.thief = this.man('thief', tb.id * 7 + 3, c.door[0], c.door[1]);
    }
    const c = u.crew, [knock, chase] = c.men, th = c.thief!, P = u.park!;
    c.t += dt;
    if (c.stage === 0) {
      this.go(knock, c.door[0] - P.vx * 0.06, c.door[1] - P.vz * 0.06, Math.atan2(tx - c.door[0], tz - c.door[1]));
      knock.mode = 'idle';
      this.go(chase, c.exit[0] + Math.sin(u.heading) * 0.16, c.exit[1] + Math.cos(u.heading) * 0.16, Math.atan2(tx - c.exit[0], tz - c.exit[1]));
      chase.mode = 'guard';
      c.stage = 0.5;
    }
    const knockAt = this.stepMan(knock, c.root, dt), chaseAt = this.stepMan(chase, c.root, dt);
    // il frappe à la porte
    if (c.stage === 0.5 && knockAt) knock.mode = Math.floor(c.t * 2) % 3 === 0 ? 'fight' : 'idle';
    if (c.stage === 0.5 && knockAt && c.t > 4) {
      // le voleur jaillit et file par la rue, à l'opposé de la voiture
      c.stage = 1; c.t = 0;
      const sx = Math.sin(u.heading), sz = Math.cos(u.heading), away = (c.door[0] - u.x) * sx + (c.door[1] - u.z) * sz >= 0 ? 1 : -1;
      th.x = c.door[0]; th.z = c.door[1];
      this.go(th, c.door[0] - P.vx * 0.18 + sx * away * 1.5, c.door[1] - P.vz * 0.18 + sz * away * 1.5, null, RUN * 0.8);
      knock.mode = 'guard';
    }
    if (c.stage >= 1 && c.stage < 4) this.stepMan(th, c.root, dt);
    if (c.stage === 1) {
      // l'agent lui court après
      this.go(chase, th.x, th.z, null, RUN);
      if (Math.hypot(chase.x - th.x, chase.z - th.z) < 0.09 || (this.stepMan(th, c.root, 0) && c.t > 4)) {
        c.stage = 2; c.t = 0;
        this.go(th, th.x, th.z, Math.atan2(chase.x - th.x, chase.z - th.z)); th.pose = 'cheer';
        this.go(chase, chase.x, chase.z, Math.atan2(th.x - chase.x, th.z - chase.z)); chase.mode = 'guard';
        this.go(knock, c.exit[0] - Math.sin(u.heading) * 0.12, c.exit[1] - Math.cos(u.heading) * 0.12, null);
      }
    }
    if (c.stage === 2 && c.t > 1.8) {
      // on le ramène à la voiture, l'agent derrière lui
      c.stage = 3; c.t = 0;
      th.pose = 'idle';
    }
    if (c.stage === 3) {
      this.go(th, c.exit[0], c.exit[1], null);
      const hx = th.x - Math.sin(th.h) * 0.11, hz = th.z - Math.cos(th.h) * 0.11;
      this.go(chase, hx, hz, null);
      if (Math.hypot(th.x - c.exit[0], th.z - c.exit[1]) < 0.02 && knockAt) { c.stage = 4; c.t = 0; (th.f!.root).visible = false; }
    }
    if (c.stage === 4 && c.t > 0.8) { this.recall(u); this.goHome(u); }
    if (u.t > GIVE_UP) { this.recall(u); this.goHome(u); }
  }

  private recall(u: Unit) {
    if (!u.crew) return;
    this.group.remove(u.crew.root);
    u.crew.hose?.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    u.crew = null;
  }

  // ---------------- Routes ----------------

  /** Case de route la plus proche du bâtiment (à trois cases au plus), de préférence devant lui */
  private roadNear(b: Building) {
    const w = this.world, s = sizeOf(b);
    let best = -1, bd = Infinity;
    for (let z = b.z - 3; z < b.z + s + 3; z++) for (let x = b.x - 3; x < b.x + s + 3; x++) {
      if (!w.inCells(x, z) || !w.road[w.ci(x, z)] || this.avoid.has(w.ci(x, z))) continue;
      const d = Math.hypot(x + 0.5 - (b.x + s / 2), z + 0.5 - (b.z + s / 2));
      if (d < bd) { bd = d; best = w.ci(x, z); }
    }
    return best;
  }

  /** Case de route atteignable depuis `from` la plus proche de la cible (à six cases au plus), ou -1 */
  private reachNear(from: number, target: Building) {
    const w = this.world, s = sizeOf(target), tx = target.x + s / 2, tz = target.z + s / 2;
    if (from < 0) return -1;
    const seen = new Set([from]), q = [from];
    let best = -1, bd = 6;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % N, z = Math.floor(c / N), d = Math.hypot(x + 0.5 - tx, z + 0.5 - tz);
      if (d < bd) { bd = d; best = c; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz, k = nz * N + nx; if (w.inCells(nx, nz) && w.road[k] && !seen.has(k)) { seen.add(k); q.push(k); } }
    }
    return best;
  }

  /** Plus court chemin par les routes, en contournant l'îlot des ronds-points ; à travers lui s'il n'y a pas d'autre passage */
  private route(from: number, to: number, strict = true): number[] | null {
    const w = this.world;
    if (from < 0 || to < 0) return null;
    if (from === to) return [to];
    const prev = new Map<number, number>([[from, -1]]), q = [from];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === to) {
        const out: number[] = [];
        for (let x = c; x !== -1; x = prev.get(x)!) out.push(x);
        return out.reverse();
      }
      const x = c % N, z = Math.floor(c / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (!w.inCells(nx, nz) || !w.road[k] || prev.has(k) || (strict && this.avoid.has(k) && k !== to)) continue;
        prev.set(k, c); q.push(k);
      }
    }
    return strict ? this.route(from, to, false) : null;
  }

  /** Le plus proche poste du service (à l'âge industriel au moins), à portée de la cible */
  private stationFor(service: Service, target: Building) {
    let best: Building | null = null, bd = RANGE;
    for (const o of this.world.buildings.values()) {
      if (o.kind !== HOME[service] || o.age < 3 || o.small) continue;
      const d = Math.hypot(o.x - target.x, o.z - target.z);
      if (d <= bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Fait partir un véhicule du poste vers la cible ; faux si la route manque */
  private dispatch(service: Service, station: Building, target: Building) {
    const home = this.roadNear(station);
    let u: Unit | null | undefined = this.units.find((o) => o.service === service && o.station.id === station.id && (o.state === 'patrol' || o.state === 'back'));
    const start = u ? Math.floor(u.z) * N + Math.floor(u.x) : home, from = this.world.road[start] ? start : home;
    // la route devant la cible ; si elle n'est pas reliée au poste, la case de son réseau la plus proche de la cible (on finit à pied)
    let goal = this.roadNear(target), path = this.route(from, goal);
    if (!path) { goal = this.reachNear(from, target); path = goal >= 0 ? this.route(from, goal) : null; }
    if (!path) return false;
    if (!u) {
      u = this.make(service, station, home);
      if (!u) return false;
    }
    this.recall(u);
    u.path = path; u.i = 0; u.state = 'go'; u.target = target; u.t = 0; u.park = null;
    return true;
  }

  private make(service: Service, station: Building, home: number): Unit | null {
    if (home < 0) return null;
    const g = this.geo(service, this.age), root = new THREE.Group(), body = new THREE.Mesh(g.body, mats.body);
    body.castShadow = true;
    root.add(body);
    if (g.glow) root.add(new THREE.Mesh(g.glow, mats.glow));
    const flash = g.lights.map(([x, y, z, c]) => { const m = new THREE.Mesh(this.flashG, c ? this.red : this.blue); m.position.set(x, y, z); root.add(m); return m; });
    let horse: Rider | null = null, ladder: THREE.Object3D | null = null;
    if (g.horse) { horse = makeDraftHorse(station.id + (service === 'fire' ? 0 : service === 'health' ? 1 : 2)); horse.root.position.set(0, 0, 0.36); root.add(horse.root); }
    if (g.ladder) { ladder = new THREE.Mesh(g.ladder, mats.body); ladder.castShadow = true; ladder.position.set(...g.ladderAt); ladder.rotation.order = 'YXZ'; root.add(ladder); }
    this.group.add(root);
    const u: Unit = {
      service, station, root, flash, path: [], i: 0, x: (home % N) + 0.5, z: Math.floor(home / N) + 0.5, heading: 0, state: 'patrol', t: 0, target: null, home,
      speed: !this.builtMotor ? 0.9 : this.age >= 4 ? 1.7 : 1.4, crew: null, horse, phase: 0, ladder, chimney: g.chimney, park: null,
    };
    this.units.push(u);
    return u;
  }

  private drop(u: Unit) {
    this.recall(u);
    this.group.remove(u.root);
    this.units.splice(this.units.indexOf(u), 1);
  }

  /** La place où se ranger : le long du trottoir, du côté de la cible, parallèle à la rue, dans le sens où il arrive */
  private parkFor(u: Unit) {
    const tb = u.target!, s = sizeOf(tb), tx = tb.x + s / 2, tz = tb.z + s / 2;
    const c = u.path.length ? u.path[u.path.length - 1] : Math.floor(u.z) * N + Math.floor(u.x), gx = (c % N) + 0.5, gz = Math.floor(c / N) + 0.5;
    let vx = tx - gx, vz = tz - gz;
    if (Math.abs(vx) >= Math.abs(vz)) { vx = Math.sign(vx) || 1; vz = 0; } else { vz = Math.sign(vz) || 1; vx = 0; }
    const h1 = Math.atan2(-vz, vx), h2 = Math.atan2(vz, -vx), h = Math.abs(turn(u.heading, h1, 1) - u.heading) <= Math.abs(turn(u.heading, h2, 1) - u.heading) ? h1 : h2;
    return { x: gx + vx * 0.26, z: gz + vz * 0.26, h, fx: u.x, fz: u.z, fh: u.heading, vx, vz, t: 0 };
  }

  update(dt: number, age: number) {
    const w = this.world;
    this.time += dt;
    if (age !== this.age || this.motor !== this.builtMotor) { for (const u of [...this.units]) this.drop(u); this.age = age; this.builtMotor = this.motor; }
    if (age < 3) { this.water.update(dt); return; }
    // les postes démolis rappellent leurs véhicules
    for (const u of [...this.units]) if (!w.buildings.has(u.station.id) || u.station.age < 3) this.drop(u);
    // incendies : un camion pour chaque feu à portée d'une caserne
    for (const b of this.fires.burning) {
      if (this.units.some((u) => u.service === 'fire' && u.target?.id === b.id)) continue;
      const st = this.stationFor('fire', b);
      if (st) this.dispatch('fire', st, b);
    }
    // appels : malaise près d'une maison, cambriolage ; feu accidentel, toujours à portée d'une caserne
    const houses = [...w.buildings.values()].filter((b) => b.kind === 'house');
    for (const sv of ['health', 'police', 'blaze'] as const) {
      this.timers[sv] -= dt;
      if (this.timers[sv] > 0 || !houses.length) continue;
      this.timers[sv] = sv === 'health' ? 120 + Math.random() * 160 : sv === 'police' ? 160 + Math.random() * 200 : 300 + Math.random() * 300;
      const service: Service = sv === 'blaze' ? 'fire' : sv;
      if (this.units.some((u) => u.service === service && u.state !== 'patrol')) continue;
      const near = houses.filter((h) => !!this.stationFor(service, h));
      if (!near.length) continue;
      const h = near[Math.floor(Math.random() * near.length)];
      if (sv === 'blaze') { this.ignite?.(h); continue; }
      if (this.dispatch(service, this.stationFor(service, h)!, h)) this.news.push(tr(service === 'health' ? '🚑 Un habitant a fait un malaise : l’ambulance arrive' : '🚓 Cambriolage signalé : la police arrive'));
    }
    // à l'époque moderne, la voiture de patrouille fait sa ronde
    if (age >= 4) for (const st of w.buildings.values()) {
      if (st.kind !== 'police' || st.age < 4 || st.small || this.units.some((u) => u.service === 'police' && u.station.id === st.id)) continue;
      const u = this.make('police', st, this.roadNear(st));
      if (u) u.t = 2;
    }
    const blink = Math.floor(this.time * 6) % 2 === 0;
    for (const u of [...this.units]) {
      u.t += dt;
      const px = u.x, pz = u.z;
      if (u.state === 'go' && u.target && !w.buildings.has(u.target.id)) { this.recall(u); this.goHome(u); }
      if (u.state === 'go' || u.state === 'back' || u.state === 'patrol') {
        if (this.drive(u, dt)) {
          if (u.state === 'go') { u.state = 'work'; u.t = 0; u.park = this.parkFor(u); }
          else if (u.state === 'back') { if (u.service === 'police' && this.age >= 4) { u.state = 'patrol'; u.path = []; u.t = 0; } else { this.drop(u); continue; } }
          else if (u.state === 'patrol' && u.t > 2) {
            // ronde : une rue au hasard à portée du commissariat, puis une autre
            const roads: number[] = [];
            for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) { const x = u.station.x + dx, z = u.station.z + dz; if (w.inCells(x, z) && w.road[w.ci(x, z)] && !this.avoid.has(w.ci(x, z))) roads.push(w.ci(x, z)); }
            const goal = roads[Math.floor(Math.random() * roads.length)], p = goal !== undefined ? this.route(Math.floor(u.z) * N + Math.floor(u.x), goal) : null;
            u.path = p ?? []; u.i = 0; u.t = p ? 0 : 1;
          }
        }
      } else if (u.state === 'work') {
        const tb = u.target, P = u.park;
        if (!tb || !w.buildings.has(tb.id)) { this.recall(u); this.goHome(u); }
        else if (P && P.t < 1) {
          // il se range le long du trottoir, devant la cible
          P.t = Math.min(1, P.t + dt / 1.3);
          const k = smooth(P.t);
          u.x = P.fx + (P.x - P.fx) * k; u.z = P.fz + (P.z - P.fz) * k; u.heading = turn(P.fh, P.h, k);
        } else if (u.service === 'fire') this.stepFire(u, tb, dt);
        else if (u.service === 'health') this.stepHealth(u, tb, dt);
        else this.stepPolice(u, tb, dt);
      }
      if (u.crew && u.state !== 'work') this.recall(u);
      // à l'âge futuriste, il flotte sur son coussin d'air, qui ondule à peine
      const hover = this.age >= 5 && this.builtMotor ? 0.018 + Math.sin(this.time * 2.6 + u.home) * 0.005 : 0;
      u.root.position.set(u.x, w.surfaceAt(u.x, u.z) + 0.01 + hover, u.z);
      u.root.rotation.y = u.heading;
      // le cheval au pas (ou qui piaffe à l'arrêt), l'échelle qui se dresse vers le feu, la pompe à vapeur qui fume
      const moved = Math.hypot(u.x - px, u.z - pz);
      if (u.horse) {
        const gait = moved > 1e-4 ? 0.6 : 0;
        u.phase += dt * (gait ? 9 : 2);
        rideStep(u.horse, u.phase, gait, 'rest');
        if (!gait) u.horse.body.rotation.x = Math.sin(u.phase * 0.7) * 0.03;
      }
      if (u.ladder) {
        // la tourelle tourne l'échelle du côté du feu, puis elle se dresse
        const up = u.crew?.stage === 1 && u.park, side = up ? (u.park!.vx * Math.cos(u.heading) - u.park!.vz * Math.sin(u.heading) >= 0 ? 1 : -1) : 0, k = Math.min(1, dt * 1.2);
        u.ladder.rotation.y += (side * 1.2 - u.ladder.rotation.y) * k;
        u.ladder.rotation.x += ((up ? -0.55 : 0) - u.ladder.rotation.x) * k;
      }
      if (u.chimney && (u.state === 'go' || u.state === 'work') && Math.random() < dt * 8) {
        const [cx, cy, cz] = u.chimney, c = Math.cos(u.heading), s = Math.sin(u.heading);
        this.water.spawn(u.x + cx * c + cz * s, u.root.position.y + cy, u.z - cx * s + cz * c, (Math.random() - 0.5) * 0.05, 0.35, (Math.random() - 0.5) * 0.05, 0.05, 1.4, COAL, 0, { grow: 2.6, drag: 0.2, wind: 0.3, alpha: 0.7 });
      }
      const on = u.state === 'go' || u.state === 'work';
      u.flash.forEach((m, i) => { m.visible = on && (i % 2 === 0 ? blink : !blink); });
    }
    this.water.update(dt);
  }

  private goHome(u: Unit) {
    u.state = 'back'; u.target = null; u.park = null;
    u.path = this.route(Math.floor(u.z) * N + Math.floor(u.x), u.home) ?? [];
    u.i = 0;
  }

  /** Avance le long du chemin en tenant sa droite ; vrai à l'arrivée */
  private drive(u: Unit, dt: number) {
    if (u.i >= u.path.length) return true;
    const [cx, cz] = this.world.passPoint(u.path, u.i);
    // la droite de la chaussée se prend dans le sens de la rue (du point d'avant à celui-ci), pas dans celui du véhicule :
    // sinon, près du but, le point visé tourne avec lui et il tourne en rond sans jamais l'atteindre
    const [px, pz] = u.i > 0 ? this.world.passPoint(u.path, u.i - 1) : u.path.length > 1 ? (([nx, nz]) => [cx * 2 - nx, cz * 2 - nz])(this.world.passPoint(u.path, 1)) : [u.x, u.z];
    const sl = Math.hypot(cx - px, cz - pz) || 1, hx = (cx - px) / sl, hz = (cz - pz) / sl, tx = cx - hz * 0.14, tz = cz + hx * 0.14;
    const dx = tx - u.x, dz = tz - u.z, dist = Math.hypot(dx, dz), step = dt * u.speed;
    u.stuck = (u.stuck ?? 0) + dt;
    if (dist <= step || u.stuck > 4) { u.x = tx; u.z = tz; u.i++; u.stuck = 0; }
    else {
      u.x += (dx / dist) * step; u.z += (dz / dist) * step;
      u.heading = turn(u.heading, Math.atan2(dx, dz), Math.min(1, dt * 7));
    }
    return u.i >= u.path.length;
  }
}
