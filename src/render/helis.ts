import * as THREE from 'three';
import { World } from '../world/world';
import { Parts } from './parts';
import { mats } from './materials';
import type { BuildingView } from './buildings';

/** Héliport sur le toit du centre hospitalier (repère du bâtiment : centre de l'emprise, façade vers +z) */
const PAD = new THREE.Vector3(-0.45, 0.889, -0.5);
/** Hauteur de vol au-dessus de l'héliport, vitesse de croisière (cases par seconde), vitesse des pales à plein régime */
const CRUISE = 2.6, SPEED = 2.2, ROTOR = 26;

type Phase = 'parked' | 'spin' | 'up' | 'out' | 'hover' | 'back' | 'down' | 'cool';

interface Heli {
  root: THREE.Group;
  /** caisse, inclinée en vol (nez qui pique, virage) */
  hull: THREE.Group;
  rotor: THREE.Mesh;
  tail: THREE.Mesh;
  phase: Phase;
  t: number;
  /** vitesse des pales (radians par seconde) */
  rpm: number;
  heading: number;
  /** où il va (en monde), et l'héliport (en monde) */
  goal: THREE.Vector3;
  pad: THREE.Vector3;
  pos: THREE.Vector3;
  bank: number;
}

/** Hélicoptère sanitaire, tourné vers +z : cabine blanche à bandeau rouge et croix, verrière, poutre de queue, patins, feux de position */
function heliGeo() {
  const p = new Parts();
  p.add(new THREE.IcosahedronGeometry(0.07, 1).scale(1, 0.82, 1.5), 0, 0.078, 0.03, 0xf4f2ee);
  p.add(new THREE.IcosahedronGeometry(0.052, 1).scale(1, 0.75, 1.1), 0, 0.09, 0.09, 0x86c4d8);
  p.box(0.142, 0.022, 0.19, 0, 0.042, 0.02, 0xd84a3e);
  for (const s of [-1, 1]) { p.box(0.004, 0.034, 0.012, s * 0.071, 0.065, -0.01, 0xd84a3e); p.box(0.004, 0.012, 0.034, s * 0.071, 0.076, -0.01, 0xd84a3e); }
  p.box(0.028, 0.03, 0.24, 0, 0.075, -0.18, 0xf4f2ee);
  p.box(0.03, 0.01, 0.1, 0, 0.096, -0.2, 0xd84a3e);
  p.box(0.008, 0.07, 0.045, 0, 0.08, -0.29, 0xd84a3e);
  p.box(0.07, 0.006, 0.025, 0, 0.09, -0.27, 0xf4f2ee);
  // patins et leurs jambes
  for (const s of [-1, 1]) {
    p.box(0.008, 0.008, 0.22, s * 0.055, 0, 0.02, 0x5d6878);
    for (const z of [-0.04, 0.08]) p.add(new THREE.BoxGeometry(0.006, 0.04, 0.006), s * 0.048, 0.022, z, 0x5d6878, 0, false, s * 0.25);
  }
  p.cyl(0.012, 0.016, 0.04, 6, 0, 0.12, 0.03, 0x8a8f96);
  p.box(0.06, 0.02, 0.09, 0, 0.118, -0.03, 0xe4e2dc);
  // feux de position : rouge à bâbord, vert à tribord, blanc à la queue
  p.box(0.012, 0.012, 0.012, 0.072, 0.06, 0.06, 0xff4a3a, 0, true);
  p.box(0.012, 0.012, 0.012, -0.072, 0.06, 0.06, 0x3aff7a, 0, true);
  p.box(0.01, 0.01, 0.01, 0, 0.12, -0.31, 0xfff4e0, 0, true);
  return p.build(false);
}

/** Pales du rotor principal (trois) et moyeu, centrées sur l'axe */
function rotorGeo() {
  const p = new Parts();
  for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.26, 0.004, 0.022).translate(0.13, 0, 0), 0, 0, 0, 0x3c3c40, (k * Math.PI * 2) / 3);
  p.cyl(0.016, 0.016, 0.014, 6, 0, -0.007, 0, 0x5d6878);
  return p.build(false).body;
}

/** Rotor de queue (deux pales), dans le plan vertical */
function tailGeo() {
  const p = new Parts();
  for (let k = 0; k < 2; k++) p.add(new THREE.BoxGeometry(0.004, 0.08, 0.012), 0, 0, 0, 0x3c3c40, 0, false, 0, (k * Math.PI) / 2);
  return p.build(false).body;
}

/**
 * Hélicoptères des centres hospitaliers (époque moderne) : chacun attend sur l'héliport du toit, pales à l'arrêt, puis
 * lance son rotor, décolle, part en vol vers un coin du village, s'y tient en vol stationnaire, revient, se pose et coupe le
 * moteur ; le nez pique en avançant, la caisse se couche dans les virages ; feux de position la nuit
 */
export class Helis {
  group = new THREE.Group();
  private helis = new Map<number, Heli>();
  private geo = heliGeo();
  private rotorG = rotorGeo();
  private tailG = tailGeo();
  private v = new THREE.Vector3();

  constructor(private world: World, private buildings: BuildingView) {}

  private make(id: number): Heli {
    const root = new THREE.Group(), hull = new THREE.Group();
    root.add(hull);
    const body = new THREE.Mesh(this.geo.body, mats.body);
    body.castShadow = true;
    hull.add(body);
    if (this.geo.glow) hull.add(new THREE.Mesh(this.geo.glow, mats.glow));
    const rotor = new THREE.Mesh(this.rotorG, mats.body), tail = new THREE.Mesh(this.tailG, mats.body);
    rotor.position.set(0, 0.145, 0.03);
    tail.position.set(0.012, 0.09, -0.29);
    rotor.castShadow = true;
    hull.add(rotor, tail);
    // un peu plus gros que les voitures, à la taille de l'héliport
    root.scale.setScalar(1.15);
    this.group.add(root);
    // chaque hôpital à son rythme : on ne part pas tous en même temps
    return { root, hull, rotor, tail, phase: 'parked', t: 8 + (id % 7) * 6, rpm: 0, heading: 0, goal: new THREE.Vector3(), pad: new THREE.Vector3(), pos: new THREE.Vector3(), bank: 0 };
  }

  update(dt: number, age: number) {
    const w = this.world, live = new Set<number>();
    for (const b of w.buildings.values()) {
      if (b.kind !== 'health' || b.age < 4 || b.small || age < 4) continue;
      const g = this.buildings.entries.get(b.id)?.group;
      if (!g) continue;
      live.add(b.id);
      let h = this.helis.get(b.id);
      g.updateMatrixWorld();
      if (!h) { h = this.make(b.id); h.heading = g.rotation.y; this.helis.set(b.id, h); }
      h.pad.copy(PAD).applyMatrix4(g.matrixWorld);
      if (h.phase === 'parked') h.pos.copy(h.pad);
      this.step(h, dt);
    }
    for (const [id, h] of this.helis) if (!live.has(id)) { this.group.remove(h.root); this.helis.delete(id); }
  }

  private step(h: Heli, dt: number) {
    const w = this.world;
    h.t -= dt;
    const fly = (to: THREE.Vector3, speed: number) => {
      const d = this.v.subVectors(to, h.pos), len = Math.hypot(d.x, d.z);
      if (len > 0.05) {
        const want = Math.atan2(d.x, d.z);
        let da = want - h.heading;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const turnRate = Math.max(-1.6, Math.min(1.6, da * 2));
        h.heading += turnRate * dt;
        h.bank += (-turnRate * 0.22 - h.bank) * Math.min(1, dt * 3);
        const go = Math.min(len, speed * dt * Math.max(0.2, Math.cos(da)));
        h.pos.x += Math.sin(h.heading) * go;
        h.pos.z += Math.cos(h.heading) * go;
      } else h.bank *= 1 - Math.min(1, dt * 3);
      // jamais trop près du sol en route
      const floor = w.surfaceAt(h.pos.x, h.pos.z) + 1.4;
      h.pos.y += (Math.max(to.y, floor) - h.pos.y) * Math.min(1, dt * 1.5);
      return len;
    };
    switch (h.phase) {
      case 'parked':
        h.rpm = Math.max(0, h.rpm - dt * 6);
        if (h.t <= 0) { h.phase = 'spin'; h.t = 3; }
        break;
      case 'spin':
        h.rpm = Math.min(ROTOR, h.rpm + dt * (ROTOR / 3));
        h.pos.copy(h.pad);
        if (h.t <= 0) { h.phase = 'up'; h.t = 3; }
        break;
      case 'up':
        h.pos.y = h.pad.y + CRUISE * (1 - Math.max(0, h.t) / 3) ** 1.5;
        if (h.t <= 0) {
          // un coin du village, à quelques cases : un tour au-dessus des toits
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 8;
          h.goal.set(h.pad.x + Math.sin(a) * r, h.pad.y + CRUISE + Math.random() * 0.6, h.pad.z + Math.cos(a) * r);
          h.phase = 'out';
        }
        break;
      case 'out':
        if (fly(h.goal, SPEED) < 0.2) { h.phase = 'hover'; h.t = 2.5 + Math.random() * 3; }
        break;
      case 'hover':
        h.heading += dt * 0.25;
        h.bank *= 1 - Math.min(1, dt * 3);
        h.pos.y += Math.sin(h.t * 2) * 0.002;
        if (h.t <= 0) { h.phase = 'back'; h.goal.set(h.pad.x, h.pad.y + CRUISE, h.pad.z); }
        break;
      case 'back':
        if (fly(h.goal, SPEED) < 0.08) { h.phase = 'down'; h.t = 3.5; }
        break;
      case 'down':
        h.pos.x += (h.pad.x - h.pos.x) * Math.min(1, dt * 2);
        h.pos.z += (h.pad.z - h.pos.z) * Math.min(1, dt * 2);
        h.pos.y = h.pad.y + CRUISE * (Math.max(0, h.t) / 3.5) ** 1.5;
        h.bank *= 1 - Math.min(1, dt * 3);
        if (h.t <= 0) { h.pos.copy(h.pad); h.phase = 'cool'; h.t = 4; }
        break;
      case 'cool':
        h.rpm = Math.max(0, h.rpm - dt * (ROTOR / 4));
        if (h.t <= 0) { h.phase = 'parked'; h.t = 25 + Math.random() * 40; }
        break;
    }
    const moving = h.phase === 'out' || h.phase === 'back';
    h.root.position.copy(h.pos);
    h.root.rotation.y = h.heading;
    h.hull.rotation.set(moving ? 0.12 : 0, 0, h.bank);
    h.rotor.rotation.y += h.rpm * dt;
    h.tail.rotation.x += h.rpm * 1.6 * dt;
  }
}
