import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';

/**
 * Les îles flottantes (expédition de l'âge futuriste) : un archipel de plateformes de roche et de métal blanc suspendues à
 * fleur d'eau ou en l'air, jardins hydroponiques, dômes de verre, cascades qui tombent dans la mer, panneaux solaires,
 * éoliennes, ponts de lumière entre les îles. L'hydroglisseur accoste la grande île ; l'équipe y scanne le sol à la tablette,
 * pose des balises (qui s'allument une à une), plante des cultures (qui poussent), récolte des plantes lumineuses et charge
 * les caisses sur un drone-barge. Tout est fait de géométries fusionnées partagées, sans lumière par pièce.
 */

const ROCK = 0x7b848e, ROCK2 = 0x636b75, METAL = 0xe9eef1, GRASS = 0x72b552, GRASS2 = 0x5da042, CYAN = 0x62e6ff;
const TOP = 0.035;

const cache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: (p: Parts) => void) {
  let g = cache.get(key);
  if (!g) { const p = new Parts(); make(p); g = p.build(false).body; cache.set(key, g); }
  return g;
}

const DARK_LAMP = new THREE.MeshLambertMaterial({ color: 0x2c3a44 });
const LIT_LAMP = new THREE.MeshBasicMaterial({ color: 0x7dffd4 });
const HALO = new THREE.MeshBasicMaterial({ color: 0x7dffd4, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending });
const GLASS = new THREE.MeshLambertMaterial({ color: 0xbfeaf4, transparent: true, opacity: 0.38, depthWrite: false });
const FALL = new THREE.MeshBasicMaterial({ color: 0xdff4fb, transparent: true, opacity: 0.6, depthWrite: false });
const BRIDGE = new THREE.MeshBasicMaterial({ color: 0x7af0ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
const REFLECT = new THREE.MeshBasicMaterial({ color: 0x0c1c28, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const MIST = new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.13, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const PLANT = new THREE.MeshBasicMaterial({ vertexColors: true });

function tree(p: Parts, x: number, z: number, s: number, leaf: number) {
  p.box(0.012 * s, 0.05 * s, 0.012 * s, x, TOP, z, 0x7a5a3c);
  p.cone(0.045 * s, 0.07 * s, 6, x, TOP + 0.04 * s, z, leaf);
  p.cone(0.033 * s, 0.06 * s, 6, x, TOP + 0.085 * s, z, leaf);
}
function panel(p: Parts, x: number, z: number) {
  p.box(0.008, 0.035, 0.008, x, TOP, z, METAL);
  p.box(0.15, 0.007, 0.09, x, TOP + 0.04, z, 0x1d3b6b, 0, false, 0.3);
  p.box(0.15, 0.003, 0.012, x, TOP + 0.05, z, 0xbcd0ee, 0, false, 0.3);
}

type Variant = 'main' | 'garden' | 'wind' | 'pylon' | 'cliff';
/** La plateforme d'une île de rayon R : roche en pointe dessous, collerette de métal blanc à lisérés lumineux, pelouse dessus */
function isleGeo(variant: Variant, R: number) {
  return geo(`isle-${variant}`, (p) => {
    p.add(new THREE.ConeGeometry(R * 0.96, R * 1.05, 9).rotateX(Math.PI).translate(0, -R * 0.525, 0), 0, 0, 0, ROCK);
    p.add(new THREE.ConeGeometry(R * 0.42, R * 0.9, 7).rotateX(Math.PI).translate(0, -R * 0.45, 0), R * 0.3, -R * 0.35, R * 0.1, ROCK2);
    p.add(new THREE.ConeGeometry(R * 0.28, R * 0.7, 6).rotateX(Math.PI).translate(0, -R * 0.35, 0), -R * 0.35, -R * 0.4, -R * 0.2, ROCK2);
    p.cyl(R, R * 0.97, 0.05, 20, 0, -0.05, 0, METAL);
    p.cyl(R * 0.975, R * 0.975, 0.012, 20, 0, -0.064, 0, CYAN);
    p.cyl(R * 0.95, R * 0.95, TOP, 20, 0, 0, 0, GRASS);
    p.cyl(R * 0.55, R * 0.55, 0.006, 14, R * 0.2, TOP, -R * 0.15, GRASS2);
    if (variant === 'main') {
      // allée dallée de la passerelle au terminal, passerelle d'accostage
      p.box(0.1, 0.006, R * 0.9, 0, TOP, R * 0.5, 0xdfe5e8);
      p.cyl(0.2, 0.2, 0.006, 16, 0.4, TOP, 0.5, 0xdfe5e8);
      p.add(new THREE.BoxGeometry(0.14, 0.012, 0.22), 0, -0.05, R + 0.07, METAL, 0, false, 0, -0.5);
      // le terminal de scan : pied, écran sombre, voyant
      p.box(0.05, 0.07, 0.04, 0, TOP, -0.1, METAL);
      p.box(0.05, 0.03, 0.006, 0, TOP + 0.07, -0.1, 0x1b2a4a);
      p.box(0.02, 0.008, 0.02, 0, TOP + 0.1, -0.1, CYAN);
      // trois bacs hydroponiques à l'ouest
      for (const [bx, bz] of MAIN_BEDS) {
        p.box(0.2, 0.025, 0.11, bx, TOP, bz, METAL);
        p.box(0.18, 0.006, 0.09, bx, TOP + 0.025, bz, 0x4a3a2c);
        p.box(0.008, 0.03, 0.008, bx - 0.09, TOP + 0.025, bz - 0.045, METAL);
      }
      // panneaux solaires, arbres et massif de fleurs
      for (const x of [-0.05, 0.12, 0.29]) panel(p, x, -0.42);
      tree(p, -0.6, -0.4, 1.2, 0x4f9a3e); tree(p, 0.55, -0.55, 1, 0xf2a0b8); tree(p, -0.7, 0.2, 0.9, 0x4f9a3e); tree(p, 0.68, 0.0, 1.1, 0x4f9a3e);
      for (const [fx, fz, c] of [[0.2, -0.2, 0xffd05a], [0.25, -0.24, 0xff8aa8], [0.15, -0.25, 0xffffff]] as const) p.sphere(0.014, fx, TOP + 0.015, fz, c);
      p.cyl(0.1, 0.1, 0.008, 14, 0.45, TOP + 0.006, 0.5, 0x9aa6ae);
    } else if (variant === 'garden') {
      for (const bx of [-0.1, 0.1]) { p.box(0.14, 0.025, 0.2, bx, TOP, 0.0, METAL); p.box(0.12, 0.006, 0.18, bx, TOP + 0.025, 0, 0x5fb657); }
      tree(p, -0.3, -0.18, 1.2, 0xf2a0b8); tree(p, 0.3, 0.18, 1.0, 0x4f9a3e); tree(p, 0.25, -0.25, 0.9, 0x4f9a3e);
    } else if (variant === 'wind') {
      p.box(0.014, 0.3, 0.014, 0, TOP, 0, METAL); p.box(0.03, 0.03, 0.05, 0, TOP + 0.3, 0.01, 0xf4f6f8);
      panel(p, -0.22, 0.12); panel(p, 0.2, 0.18);
      tree(p, 0.2, -0.15, 1, 0x4f9a3e); tree(p, -0.2, -0.2, 0.8, 0xf2a0b8);
    } else if (variant === 'pylon') {
      p.box(0.02, 0.2, 0.02, 0, TOP, 0, METAL);
      p.add(new THREE.TorusGeometry(0.06, 0.006, 5, 14).rotateX(Math.PI / 2), 0, TOP + 0.16, 0, CYAN);
      p.add(new THREE.TorusGeometry(0.045, 0.005, 5, 12).rotateX(Math.PI / 2), 0, TOP + 0.21, 0, CYAN);
      tree(p, 0.1, 0.08, 0.7, 0xf2a0b8);
    } else {
      // l'îlot haut perché, tout en arbres, d'où tombe la cascade
      tree(p, -0.08, 0.05, 1.3, 0x4f9a3e); tree(p, 0.1, -0.06, 1.1, 0xf2a0b8); tree(p, 0.05, 0.12, 0.8, 0x4f9a3e);
      p.cyl(0.07, 0.07, 0.004, 10, 0, TOP + 0.002, 0, 0x6fd0e6);
    }
  });
}
const MAIN_BEDS: [number, number][] = [[-0.45, 0.4], [-0.45, 0.1], [-0.4, -0.2]];
const BEACONS: [number, number][] = [15, -25, -65, -105, -145, 120].map((d) => [Math.cos((d * Math.PI) / 180) * 0.7, Math.sin((d * Math.PI) / 180) * 0.7]);
const GLOWS: [number, number][] = [[0.3, -0.02], [0.42, 0.04], [0.34, 0.14]];
const PAD: [number, number] = [0.45, 0.5];

const poleGeo = () => geo('float-pole', (p) => {
  p.cyl(0.02, 0.025, 0.008, 8, 0, 0, 0, METAL);
  p.cyl(0.005, 0.007, 0.07, 6, 0, 0.008, 0, METAL);
  p.cyl(0.016, 0.016, 0.004, 8, 0, 0.078, 0, METAL);
});
const sproutGeo = () => geo('float-sprouts', (p) => {
  const cols = [0x4fbf5a, 0x6fd06a, 0x3fae52];
  [[-0.06, -0.025], [0.0, -0.02], [0.06, -0.025], [-0.03, 0.025], [0.03, 0.022]].forEach(([x, z], i) => {
    p.cone(0.016, 0.05 + (i % 2) * 0.012, 5, x, 0, z, cols[i % 3]);
    if (i % 2 === 0) p.sphere(0.009, x, 0.055, z, 0xffb0d0);
  });
});
const glowPlantGeo = () => geo('float-glowplant', (p) => {
  p.cyl(0.003, 0.004, 0.045, 5, 0, 0, 0, 0x3fae52);
  p.sphere(0.017, 0, 0.055, 0, 0xa6fff0, 1);
  p.sphere(0.008, 0.02, 0.035, 0.005, 0xa6fff0);
  p.sphere(0.008, -0.018, 0.03, -0.006, 0xa6fff0);
});
const rotorGeo = () => geo('float-rotor', (p) => {
  for (let i = 0; i < 3; i++) p.add(new THREE.BoxGeometry(0.014, 0.12, 0.004).translate(0, 0.06, 0), 0, 0, 0, 0xf4f6f8, 0, false, (i * Math.PI * 2) / 3);
  p.sphere(0.012, 0, 0, 0, 0xf4f6f8);
});
const droneGeo = () => geo('float-drone', (p) => {
  p.cyl(0.07, 0.08, 0.025, 14, 0, 0, 0, 0xe9eef1);
  p.cyl(0.05, 0.05, 0.008, 14, 0, 0.025, 0, 0x9aa6ae);
  p.cyl(0.062, 0.062, 0.006, 14, 0, -0.004, 0, CYAN);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4, x = Math.cos(a) * 0.1, z = Math.sin(a) * 0.1;
    p.box(0.09, 0.008, 0.012, Math.cos(a) * 0.06, 0.012, Math.sin(a) * 0.06, 0xc8d0d6, -a);
    p.cyl(0.012, 0.012, 0.02, 6, x, 0.008, z, 0x445060);
  }
});
const propellerGeo = () => geo('float-prop', (p) => {
  p.box(0.11, 0.003, 0.012, 0, 0, 0, 0x2a3440); p.box(0.012, 0.003, 0.11, 0, 0, 0, 0x2a3440);
});
const crateGeo = () => geo('float-crate', (p) => {
  p.box(0.05, 0.04, 0.05, 0, 0, 0, 0xc89a5a); p.box(0.052, 0.008, 0.052, 0, 0.016, 0, 0x8a6a3a); p.box(0.01, 0.042, 0.052, 0, 0, 0, 0x2f6f77);
});
const tabletGeo = () => geo('float-tablet', (p) => {
  p.box(0.038, 0.004, 0.052, 0, 0, 0, 0x2a3440); p.box(0.03, 0.005, 0.042, 0, 0, 0, 0x7af0ff);
});

/** Une île : son pied, son rayon, sa hauteur au-dessus de l'eau, sa phase de houle, et ce qui l'anime */
interface Isle {
  g: THREE.Group; x: number; z: number; r: number; base: number; hover: number; ph: number; amp: number;
}
interface Beacon { lamp: THREE.Mesh; halo: THREE.Mesh; at: [number, number]; lit: number; was: boolean }
interface Crop { obj: THREE.Mesh; plant: number; at: [number, number] }
interface Station { kind: 'scan' | 'beacon' | 'plant' | 'harvest' | 'load'; at: [number, number]; face: [number, number]; ref: number }

/** Où l'on est dans la mission (part du travail) : l'équipe débarque, s'affaire, acclame, regagne l'hydroglisseur */
export const FLOAT_LAND = 0.17, FLOAT_WORK = 0.72, FLOAT_CHEER = 0.76, FLOAT_BACK = 0.8;
/** part de chaque étape passée à marcher (le reste, à l'ouvrage) */
const WALK = 0.35;

export interface FloatPose { x: number; z: number; y: number; heading: number; act: 'stroll' | 'work' | 'cheer'; tool?: 'tablet' | 'crate' }

export class FloatIsles {
  readonly focus: [number, number];
  private isles: Isle[] = [];
  private main!: Isle;
  private rot = 0;
  private beacons: Beacon[] = [];
  private crops: Crop[] = [];
  private glows: { obj: THREE.Mesh; at: [number, number]; cut: number }[] = [];
  private routes: Station[][] = [];
  private crates: THREE.Mesh[] = [];
  private props: THREE.Mesh[] = [];
  private tablets = new Map<number, THREE.Mesh>();
  private carried = new Map<number, THREE.Mesh>();
  private rotors: THREE.Object3D[] = [];
  private fall: { m: THREE.Mesh; x: number; z: number; ph: number }[] = [];
  private mist: THREE.Mesh[] = [];
  private drone = new THREE.Group();
  private propellers: THREE.Mesh[] = [];
  private padWorld: [number, number] = [0, 0];
  private away: [number, number] = [0, 0];
  private t = 0;
  private spark = 0;

  /**
   * `out` : où l'hydroglisseur accoste (sur l'eau), `home` d'où il vient, `level` : niveau de l'eau, `surface` : hauteur du
   * terrain (les îles ne s'enfoncent pas dans un cap voisin), `n` : l'équipe
   */
  constructor(private group: THREE.Group, private objs: THREE.Object3D[], home: [number, number], private out: [number, number], private level: number, private surface: (x: number, z: number) => number, n: number) {
    let ux = out[0] - home[0], uz = out[1] - home[1];
    const l = Math.hypot(ux, uz);
    if (l < 0.01) { ux = 1; uz = 0; } else { ux /= l; uz /= l; }
    const RM = 0.85;
    const mx = out[0] + ux * (RM + 0.1), mz = out[1] + uz * (RM + 0.1);
    this.rot = Math.atan2(-ux, -uz);
    this.main = this.addIsle('main', mx, mz, RM, 0.1, 0.0);
    // le reste de l'archipel, derrière et sur les côtés de la grande île
    const ring = (ang: number, d: number) => { const c = Math.cos(ang), s = Math.sin(ang); return [mx + (ux * c - uz * s) * d, mz + (ux * s + uz * c) * d] as [number, number]; };
    const specs: [Variant, number, number, number, number, number][] = [
      ['garden', 0.5, 1.3, 0.9, 0.3, 1.7], ['wind', 0.42, 1.5, -0.85, 0.46, 3.1], ['pylon', 0.3, 1.95, 0.15, 0.22, 4.4], ['cliff', 0.34, 1.45, -2.0, 0.64, 5.2], ['garden', 0.26, 1.35, 2.3, 0.18, 0.6],
    ];
    const others = specs.map(([v, r, d, ang, hv, ph]) => { const [x, z] = ring(ang, d); return this.addIsle(v, x, z, r, hv, ph); });
    this.focus = [mx - ux * 0.35, mz - uz * 0.35];
    this.away = [ux, uz];
    // ponts de lumière de la grande île aux deux plus proches
    for (const o of [others[0], others[1]]) this.bridge(this.main, o);
    // dômes, éolienne, cascades
    const dome = (isle: Isle, lx: number, lz: number, r: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), GLASS);
      m.scale.setScalar(r); m.position.set(lx, TOP, lz);
      isle.g.add(m);
    };
    dome(this.main, -0.3, -0.5, 0.16); dome(others[0], 0, -0.25, 0.1);
    const wind = others[1], rotor = new THREE.Mesh(rotorGeo(), mats.body);
    rotor.position.set(0, TOP + 0.3, 0.04); wind.g.add(rotor); this.rotors.push(rotor);
    this.waterfall(others[3], 0.9, 0.27); this.waterfall(others[0], -0.7, 0.45); this.waterfall(this.main, 2.6, 0.84);
    // balises, cultures, plantes lumineuses sur la grande île
    BEACONS.forEach(([bx, bz]) => {
      const pole = new THREE.Mesh(poleGeo(), mats.body), lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.016, 1), DARK_LAMP), halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), HALO);
      pole.position.set(bx, TOP, bz); lamp.position.set(bx, TOP + 0.092, bz); halo.position.copy(lamp.position); halo.visible = false;
      this.main.g.add(pole, lamp, halo);
      this.beacons.push({ lamp, halo, at: [bx, bz], lit: 1, was: false });
    });
    MAIN_BEDS.forEach(([bx, bz]) => {
      const m = new THREE.Mesh(sproutGeo(), mats.body);
      m.position.set(bx, TOP + 0.031, bz); m.scale.setScalar(0.001);
      this.main.g.add(m);
      this.crops.push({ obj: m, plant: 1, at: [bx, bz] });
    });
    GLOWS.forEach(([gx, gz], i) => {
      const m = new THREE.Mesh(glowPlantGeo(), PLANT);
      m.position.set(gx, TOP, gz); m.scale.setScalar(1.15 - i * 0.1);
      this.main.g.add(m);
      this.glows.push({ obj: m, at: [gx, gz], cut: 1 });
    });
    this.routesFor(n);
    // le drone-barge de chargement, au-dessus de son aire d'envol, et ses caisses
    this.drone.add(new THREE.Mesh(droneGeo(), mats.body));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4, pr = new THREE.Mesh(propellerGeo(), mats.body);
      pr.position.set(Math.cos(a) * 0.1, 0.033, Math.sin(a) * 0.1);
      this.drone.add(pr); this.propellers.push(pr);
    }
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(crateGeo(), mats.body);
      c.position.set(-0.025 + (i % 3) * 0.052 - 0.026, 0.033 + Math.floor(i / 3) * 0.04, 0); c.rotation.y = (i % 2) * 0.2; c.visible = false;
      this.drone.add(c); this.crates.push(c);
    }
    this.drone.scale.setScalar(1.15);
    this.group.add(this.drone); this.objs.push(this.drone);
    // la brume et les ombres sur l'eau
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.9 + i * 0.35, 20).rotateX(-Math.PI / 2), MIST);
      m.position.set(mx + Math.cos(i * 1.7) * 0.9, level + 0.03 + i * 0.004, mz + Math.sin(i * 1.7) * 0.9);
      m.userData.flat = true; m.userData.o = [m.position.x, m.position.z, i];
      this.group.add(m); this.objs.push(m); this.mist.push(m);
    }
  }

  private addIsle(variant: Variant, x: number, z: number, r: number, hover: number, ph: number): Isle {
    let ground = this.level;
    for (let k = 0; k < 9; k++) ground = Math.max(ground, this.surface(x + Math.cos(k * 0.7) * r * 0.9, z + Math.sin(k * 0.7) * r * 0.9));
    ground = Math.max(ground, this.surface(x, z));
    const base = ground + 0.02, g = new THREE.Group(), body = new THREE.Mesh(isleGeo(variant, r), mats.body);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    g.position.set(x, base + hover, z);
    g.rotation.y = variant === 'main' ? this.rot : ph;
    this.group.add(g); this.objs.push(g);
    const isle: Isle = { g, x, z, r, base, hover, ph, amp: variant === 'main' ? 0.005 : 0.014 };
    this.isles.push(isle);
    // l'ombre qu'elle jette sur la mer : d'autant plus sombre et nette que l'île est proche de l'eau
    const sh = new THREE.Mesh(new THREE.CircleGeometry(r * 1.02, 20).rotateX(-Math.PI / 2), REFLECT);
    sh.position.set(x + 0.05, this.level + 0.006, z + 0.05); sh.userData.flat = true;
    this.group.add(sh); this.objs.push(sh);
    return isle;
  }

  private bridge(a: Isle, b: Isle) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), L = d - a.r - b.r + 0.12;
    if (L <= 0.05) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, L), BRIDGE);
    const cx = a.x + (dx / d) * (a.r + L / 2 - 0.06), cz = a.z + (dz / d) * (a.r + L / 2 - 0.06);
    const y = (a.base + a.hover + b.base + b.hover) / 2 + TOP;
    m.position.set(cx, y, cz);
    m.rotation.set(Math.atan2(-(b.base + b.hover - a.base - a.hover), L), Math.atan2(dx, dz), 0, 'YXZ');
    this.group.add(m); this.objs.push(m);
    this.bridges.push({ m, a, b });
  }
  private bridges: { m: THREE.Mesh; a: Isle; b: Isle }[] = [];

  /** Une cascade qui tombe du bord de l'île (angle `ang`) jusque dans la mer */
  private waterfall(isle: Isle, ang: number, _h: number) {
    void _h;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.012).translate(0, -0.5, 0), FALL);
    const lx = Math.sin(ang) * isle.r * 0.97, lz = Math.cos(ang) * isle.r * 0.97, h = isle.hover + isle.base - this.level + 0.04 + TOP;
    m.position.set(lx, TOP, lz); m.rotation.y = ang; m.scale.y = Math.max(0.05, h + 0.02);
    // (l'île tourne : la cascade tourne avec elle ; on la rend au sol à chaque image dans `update`)
    isle.g.add(m);
    this.fall.push({ m, x: 0, z: 0, ph: Math.random() * 6 });
    m.userData.isle = isle;
  }

  /** Les étapes de chacun : le scan (le premier), ses balises, ses cultures, ses plantes à récolter, puis la caisse au drone */
  private routesFor(n: number) {
    const inward = ([x, z]: [number, number], d: number): [number, number] => { const l = Math.hypot(x, z) || 1; return [x - (x / l) * d, z - (z / l) * d]; };
    const R = this.main.r;
    this.routes = [];
    for (let i = 0; i < n; i++) {
      const r: Station[] = [];
      if (i === 0) r.push({ kind: 'scan', at: [0.0, 0.05], face: [0, -0.1], ref: 0 });
      BEACONS.forEach((b, j) => { if (j % n === i) r.push({ kind: 'beacon', at: inward(b, 0.12), face: b, ref: j }); });
      MAIN_BEDS.forEach((b, j) => { if (j % n === i) r.push({ kind: 'plant', at: [b[0] + 0.17, b[1] + 0.02], face: b, ref: j }); });
      GLOWS.forEach((b, j) => { if (j % n === i) r.push({ kind: 'harvest', at: [b[0] - 0.14, b[1] + 0.02], face: b, ref: j }); });
      r.push({ kind: 'load', at: [PAD[0] - 0.17, PAD[1] - 0.04], face: PAD, ref: i });
      this.routes.push(r);
    }
    void R;
  }

  /** Repère de l'île principale vers le monde (x, z) */
  private world(lx: number, lz: number): [number, number] {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    return [this.main.x + lx * c + lz * s, this.main.z - lx * s + lz * c];
  }
  private headingTo(from: [number, number], to: [number, number]) {
    const a = this.world(...from), b = this.world(...to);
    return Math.atan2(b[0] - a[0], b[1] - a[1]);
  }
  private topY() { return this.main.g.position.y + TOP; }

  /** Le quai de la grande île, où l'on débarque (le i-ème sur n, côte à côte) */
  dockPoint(i: number, n: number): [number, number] {
    return this.world((i - (n - 1) / 2) * 0.07, this.main.r * 0.86);
  }

  /** Où est (et ce que fait) le i-ème membre à la part `k` du travail : tout est déduit de `k` (il n'y a pas d'état) */
  crew(i: number, n: number, k: number): FloatPose {
    const route = this.routes[i] ?? this.routes[0], S = route.length, y = this.topY();
    const dockL: [number, number] = [(i - (n - 1) / 2) * 0.07, this.main.r * 0.86];
    const pose = (l: [number, number], head: number, act: FloatPose['act'], tool?: FloatPose['tool']): FloatPose => { const [x, z] = this.world(...l); return { x, z, y, heading: head, act, tool }; };
    const lerp = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const lastAt = route[S - 1].at;
    if (k >= FLOAT_WORK) {
      // le travail est fini : on acclame au drone, puis on regagne le quai
      if (k < FLOAT_CHEER) return pose(lastAt, this.headingTo(lastAt, PAD), 'cheer');
      const u = Math.min(1, (k - FLOAT_CHEER) / (FLOAT_BACK - FLOAT_CHEER - 0.01));
      return pose(lerp(lastAt, dockL, smooth(u)), this.headingTo(lastAt, dockL), 'stroll');
    }
    const p = Math.max(0, (k - FLOAT_LAND) / (FLOAT_WORK - FLOAT_LAND)) * S, idx = Math.min(S - 1, Math.floor(p)), fr = p >= S ? 1 : p - idx;
    const st = route[idx], prev = idx === 0 ? dockL : route[idx - 1].at;
    if (fr < WALK) {
      const tool = st.kind === 'load' ? 'crate' : undefined;
      return pose(lerp(prev, st.at, smooth(fr / WALK)), this.headingTo(prev, st.at), 'stroll', tool);
    }
    // au poste : à la tablette (scan), à genoux aux balises, aux bacs, aux plantes ; la caisse en main jusqu'au drone
    const tool = st.kind === 'scan' ? 'tablet' : st.kind === 'load' && fr < 0.7 ? 'crate' : st.kind === 'harvest' && fr > 0.65 ? 'crate' : undefined;
    return pose(st.at, this.headingTo(st.at, st.face), 'work', tool);
  }

  /** Une étape est-elle faite (ou, à `at`, à quelle part de l'étape en est-on) : pour allumer, planter, couper, charger */
  private stageK(i: number, kind: Station['kind'], ref: number, at: number): number {
    const route = this.routes[i];
    if (!route) return 1e9;
    const idx = route.findIndex((s) => s.kind === kind && s.ref === ref);
    if (idx < 0) return 1e9;
    return FLOAT_LAND + ((idx + at) / route.length) * (FLOAT_WORK - FLOAT_LAND);
  }

  /** Place le geste (tablette, caisse) d'un membre à sa pose */
  tool(id: number, pose: FloatPose | null) {
    const hold = (map: Map<number, THREE.Mesh>, geom: () => THREE.BufferGeometry, want: boolean, up: number, fwd: number, tilt: number, scale = 1) => {
      let m = map.get(id);
      if (!m) { if (!want) return; m = new THREE.Mesh(geom(), mats.body); m.scale.setScalar(scale); this.group.add(m); this.objs.push(m); map.set(id, m); }
      m.visible = want && !!pose;
      if (!m.visible || !pose) return;
      m.position.set(pose.x + Math.sin(pose.heading) * fwd, pose.y + up, pose.z + Math.cos(pose.heading) * fwd);
      m.rotation.set(tilt, pose.heading, 0, 'YXZ');
    };
    hold(this.tablets, tabletGeo, pose?.tool === 'tablet', 0.09, 0.055, -0.5, 1.2);
    hold(this.carried, crateGeo, pose?.tool === 'crate', 0.085, 0.045, 0, 0.8);
  }

  /** Chaque image : les îles ballottent, la brume dérive, les balises s'allument, les cultures poussent, le drone charge */
  update(dt: number, k: number, onSite: boolean, puff: (x: number, y: number, z: number) => void) {
    this.t += dt;
    const t = this.t;
    for (const i of this.isles) i.g.position.y = i.base + i.hover + Math.sin(t * 0.55 + i.ph) * i.amp;
    for (const b of this.bridges) {
      const ya = b.a.g.position.y, yb = b.b.g.position.y, dx = b.b.x - b.a.x, dz = b.b.z - b.a.z, L = (b.m.geometry as THREE.BoxGeometry).parameters.depth;
      b.m.position.y = (ya + yb) / 2 + TOP;
      b.m.rotation.x = Math.atan2(-(yb - ya), Math.max(0.1, L));
      void dx; void dz;
      b.m.scale.x = 0.85 + Math.sin(t * 2 + b.a.ph) * 0.15;
    }
    for (const r of this.rotors) r.rotation.z += dt * 1.3;
    for (const f of this.fall) {
      f.m.scale.x = 0.9 + Math.sin(t * 7 + f.ph) * 0.12;
      if (Math.random() < dt * 3) {
        const isle = f.m.userData.isle as Isle, c = Math.cos(isle.g.rotation.y), s = Math.sin(isle.g.rotation.y);
        puff(isle.x + f.m.position.x * c + f.m.position.z * s, this.level + 0.02, isle.z - f.m.position.x * s + f.m.position.z * c);
      }
    }
    for (const m of this.mist) { const o = m.userData.o as number[]; m.position.x = o[0] + Math.sin(t * 0.07 + o[2]) * 0.3; m.position.z = o[1] + Math.cos(t * 0.05 + o[2]) * 0.3; }
    const n = this.routes.length;
    // les balises : allumées quand leur poseur a fini ; un éclat à l'allumage
    for (let j = 0; j < this.beacons.length; j++) {
      const b = this.beacons[j], lit = onSite && k >= this.stageK(j % n, 'beacon', j, 0.75);
      if (lit !== b.was) {
        b.was = lit;
        b.lamp.material = lit ? LIT_LAMP : DARK_LAMP;
        b.halo.visible = lit;
        if (lit) { const [x, z] = this.world(b.at[0], b.at[1]); puff(x, this.topY() + 0.12, z); }
      }
      if (lit) b.halo.scale.setScalar(1 + Math.sin(t * 3 + j) * 0.12);
    }
    // les cultures : plantées au poste, puis elles poussent jusqu'à la fin
    this.crops.forEach((c, j) => {
      const at = this.stageK(j % n, 'plant', j, 0.6);
      c.obj.scale.setScalar(onSite && k > at ? Math.max(0.001, Math.min(1, 0.25 + ((k - at) / 0.22) * 0.75)) : 0.001);
    });
    // les plantes lumineuses : coupées à la récolte, il n'en reste que le pied
    this.glows.forEach((g, j) => {
      const at = this.stageK(j % n, 'harvest', j, 0.6), cut = onSite && k > at;
      g.obj.scale.setScalar(cut ? 0.25 : 1.1 - j * 0.1 + Math.sin(t * 2 + j) * 0.05);
    });
    // le drone-barge : il charge les caisses, puis s'envole avec elles
    let loaded = 0;
    for (let i = 0; i < n; i++) if (onSite && k > this.stageK(i, 'load', i, 0.7)) loaded++;
    this.crates.forEach((c, i) => (c.visible = i < loaded * 2));
    const [px, pz] = this.world(PAD[0], PAD[1]);
    const lift = onSite ? Math.max(0, (k - FLOAT_CHEER + 0.02) / 0.2) : 0, e = Math.min(1, lift);
    this.drone.position.set(px + this.away[0] * e * e * 3, this.topY() + 0.07 + Math.sin(t * 2.2) * 0.008 + e * e * 0.8, pz + this.away[1] * e * e * 3);
    this.drone.rotation.y = -this.rot + e * 0.4;
    for (const p of this.propellers) p.rotation.y += dt * 32;
    // petits éclats lumineux sur les îles, de temps en temps
    if (onSite && (this.spark -= dt) < 0 && n) { this.spark = 1.2; const [x, z] = this.world(GLOWS[0][0], GLOWS[0][1]); puff(x, this.topY() + 0.1, z); }
  }
}
