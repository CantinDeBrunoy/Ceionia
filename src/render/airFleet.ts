import * as THREE from 'three';
import { Parts } from './parts';
import { mats } from './materials';
import { balloonBasketGeo, balloonEnvelopeGeo } from './balloon';
import { AirKind, BALLOON_SCALE } from '../sim/airlift';
import type { Expeditions } from '../sim/expeditions';

/** Les flammes du brûleur (comme celles de la montgolfière du premier envol) */
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });
const FLAME_IN = new THREE.MeshBasicMaterial({ color: 0xffe08a });

/** Vitesse des pales à plein régime (radians par seconde) */
const ROTOR = 30;

/**
 * L'hélicoptère de transport des expéditions, avant = +z, posé sur ses patins à y = 0, à l'échelle des habitants : cabine
 * ouverte sur les côtés, deux bancs (trois places derrière, deux devant) où l'équipe prend place à la vue de tous, cockpit et
 * son pilote, toit porté par quatre montants, cloison du moteur, poutre de queue à dérive ; livrée jaune à bandeau bleu nuit
 */
function haulerGeo() {
  const p = new Parts(), body = 0xf2c23a, band = 0x22305a, steel = 0x5d6878, seat = 0x3a3f4e;
  // patins et leurs jambes, ventre de la caisse, plancher
  for (const s of [-1, 1]) {
    p.box(0.012, 0.012, 0.52, s * 0.14, 0, -0.02, steel);
    for (const z of [-0.12, 0.12]) p.add(new THREE.BoxGeometry(0.009, 0.075, 0.009), s * 0.133, 0.038, z, steel, 0, false, s * 0.18);
  }
  p.box(0.26, 0.04, 0.44, 0, 0.03, -0.02, body);
  p.box(0.28, 0.014, 0.48, 0, 0.07, 0, band);
  // bancs et dossiers : derrière (face à l'avant), devant ; cloison du moteur
  p.box(0.26, 0.03, 0.05, 0, 0.084, -0.1, seat); p.box(0.26, 0.09, 0.012, 0, 0.114, -0.14, seat);
  p.box(0.2, 0.03, 0.05, 0, 0.084, 0.01, seat); p.box(0.2, 0.08, 0.012, 0, 0.114, -0.03, seat);
  p.box(0.28, 0.23, 0.1, 0, 0.084, -0.2, body);
  p.box(0.284, 0.03, 0.102, 0, 0.17, -0.2, band);
  // bords de cabine, montants et toit
  for (const s of [-1, 1]) p.box(0.012, 0.03, 0.34, s * 0.14, 0.084, 0.02, band);
  for (const sx of [-1, 1]) for (const z of [-0.14, 0.2]) p.box(0.012, 0.216, 0.012, sx * 0.14, 0.084, z, steel);
  p.box(0.3, 0.012, 0.4, 0, 0.3, 0.02, body);
  p.box(0.16, 0.05, 0.2, 0, 0.312, -0.06, 0xe4e2dc);
  // cockpit : tableau de bord, pare-brise, le pilote (veste orange) et le siège vide à côté
  p.box(0.28, 0.06, 0.03, 0, 0.084, 0.22, steel);
  p.add(new THREE.BoxGeometry(0.28, 0.17, 0.008), 0, 0.14, 0.235, 0x86c4d8, 0, false, 0, -0.5);
  for (const s of [-1, 1]) p.box(0.012, 0.15, 0.012, s * 0.14, 0.15, 0.225, steel);
  p.box(0.07, 0.03, 0.05, -0.07, 0.084, 0.14, seat); p.box(0.07, 0.08, 0.012, -0.07, 0.114, 0.11, seat);
  p.box(0.05, 0.03, 0.06, -0.07, 0.114, 0.165, 0x3a3a48);
  p.box(0.055, 0.07, 0.035, -0.07, 0.125, 0.14, 0xe8742a);
  p.box(0.034, 0.034, 0.034, -0.07, 0.195, 0.14, 0xe8b894); p.box(0.038, 0.02, 0.038, -0.07, 0.222, 0.14, 0xf4f2ee);
  p.box(0.07, 0.03, 0.05, 0.07, 0.084, 0.14, seat); p.box(0.07, 0.08, 0.012, 0.07, 0.114, 0.11, seat);
  // poutre de queue, dérive, plan fixe, mât du rotor
  p.box(0.05, 0.05, 0.5, 0, 0.18, -0.5, body);
  p.box(0.012, 0.15, 0.09, 0, 0.18, -0.74, band);
  p.box(0.15, 0.008, 0.05, 0, 0.2, -0.68, body);
  p.cyl(0.012, 0.016, 0.05, 6, 0, 0.36, 0, steel);
  // feux de position : rouge à bâbord, vert à tribord, blanc à la queue
  p.box(0.014, 0.014, 0.014, 0.145, 0.12, 0.2, 0xff4a3a, 0, true);
  p.box(0.014, 0.014, 0.014, -0.145, 0.12, 0.2, 0x3aff7a, 0, true);
  p.box(0.012, 0.012, 0.012, 0, 0.27, -0.76, 0xfff4e0, 0, true);
  return p.build(false);
}
/** Pales du rotor principal (deux, plus longues que celles de l'hélicoptère de l'héliport) et moyeu, centrées sur l'axe */
function bladesGeo() {
  const p = new Parts();
  for (let k = 0; k < 2; k++) p.add(new THREE.BoxGeometry(0.6, 0.006, 0.04).translate(0.3, 0, 0), 0, 0, 0, 0x3c3c40, k * Math.PI);
  p.cyl(0.02, 0.02, 0.016, 6, 0, -0.008, 0, 0x5d6878);
  return p.build(false).body;
}
/** Rotor de queue : deux pales dans le plan vertical */
function tailBladesGeo() {
  const p = new Parts();
  for (let k = 0; k < 2; k++) p.add(new THREE.BoxGeometry(0.005, 0.1, 0.014), 0, 0, 0, 0x3c3c40, 0, false, 0, (k * Math.PI) / 2);
  return p.build(false).body;
}

interface Craft {
  kind: AirKind;
  root: THREE.Group;
  /** caisse, qui pique du nez en avançant et se couche dans les virages */
  hull: THREE.Group;
  rotor: THREE.Mesh | null;
  tail: THREE.Mesh | null;
  env: THREE.Mesh | null;
  burner: THREE.Group | null;
  rpm: number;
}

let heli: { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; rotor: THREE.BufferGeometry; tail: THREE.BufferGeometry } | null = null;
let envelope: THREE.BufferGeometry | null = null, basket: THREE.BufferGeometry | null = null;

/**
 * Les appareils des expéditions qui volent (voir `airlift`) : l'hélicoptère de l'héliport, cabine ouverte où l'on voit l'équipe
 * assise, rotor qui monte en régime au décollage, nez qui pique en avançant ; la montgolfière de l'aérodrome, qui se gonfle
 * pendant qu'elle s'élève, flamme du brûleur par bouffées, et dont l'équipe se tient dans la nacelle. Ils attendent sur l'aire
 * d'envol, emmènent l'équipe, restent posés près du lieu de travail, puis la ramènent
 */
export class AirFleet {
  group = new THREE.Group();
  private crafts = new Map<number, Craft>();
  private t = 0;

  constructor(private exp: Expeditions) {}

  private make(kind: AirKind): Craft {
    const root = new THREE.Group(), hull = new THREE.Group();
    root.add(hull);
    if (kind === 'heli') {
      heli ??= (() => { const h = haulerGeo(); return { body: h.body, glow: h.glow, rotor: bladesGeo(), tail: tailBladesGeo() }; })();
      const body = new THREE.Mesh(heli.body, mats.body);
      body.castShadow = true;
      hull.add(body);
      if (heli.glow) hull.add(new THREE.Mesh(heli.glow, mats.glow));
      const rotor = new THREE.Mesh(heli.rotor, mats.body), tail = new THREE.Mesh(heli.tail, mats.body);
      rotor.position.set(0, 0.41, 0); tail.position.set(0.03, 0.2, -0.76);
      rotor.castShadow = true;
      hull.add(rotor, tail);
      this.group.add(root);
      return { kind, root, hull, rotor, tail, env: null, burner: null, rpm: 0 };
    }
    // la montgolfière : nacelle d'osier, enveloppe aux fuseaux rouges et or, brûleur
    basket ??= balloonBasketGeo();
    envelope ??= balloonEnvelopeGeo(0xd84a3e, 0xf2c23a, 0x3a6ab8);
    const bk = new THREE.Mesh(basket, mats.body), env = new THREE.Mesh(envelope, mats.body), burner = new THREE.Group();
    bk.castShadow = env.castShadow = true;
    env.position.y = 0.18; burner.position.y = 0.19;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 5).translate(0, 0.065, 0), FLAME);
    f.add(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 5).translate(0, 0.04, 0), FLAME_IN));
    burner.add(f);
    hull.add(bk, env, burner);
    hull.scale.setScalar(BALLOON_SCALE);
    this.group.add(root);
    return { kind, root, hull, rotor: null, tail: null, env, burner, rpm: 0 };
  }

  private drop(c: Craft) {
    this.group.remove(c.root);
  }

  update(dt: number) {
    this.t += dt;
    const live = new Set<number>();
    for (const a of this.exp.active) {
      const air = a.air, p = air ? this.exp.airPose(a) : null;
      if (!air || !p) continue;
      live.add(a.id);
      let c = this.crafts.get(a.id);
      if (c && c.kind !== air.kind) { this.drop(c); c = undefined; }
      if (!c) { c = this.make(air.kind); this.crafts.set(a.id, c); }
      this.step(c, p, air.leg === 'out' || air.leg === 'back', dt);
    }
    for (const [id, c] of this.crafts) if (!live.has(id)) { this.drop(c); this.crafts.delete(id); }
  }

  private step(c: Craft, p: { x: number; y: number; z: number; heading: number; up: number; moving: boolean }, flying: boolean, dt: number) {
    c.root.position.set(p.x, p.y, p.z);
    c.root.rotation.y = p.heading;
    if (c.kind === 'heli') {
      // les pales prennent leur régime au décollage, le perdent une fois posé ; le nez pique en avançant
      c.rpm += ((flying ? ROTOR : 0) - c.rpm) * Math.min(1, dt * (flying ? 1.2 : 0.5));
      c.hull.rotation.set(p.moving ? 0.1 : 0, 0, 0);
      c.hull.position.y = p.up > 0.9 ? Math.sin(this.t * 2.4) * 0.006 : 0;
      c.rotor!.rotation.y += c.rpm * dt;
      c.tail!.rotation.x += c.rpm * 1.6 * dt;
      return;
    }
    // la montgolfière se gonfle pendant qu'elle s'élève, se dégonfle en se posant ; le brûleur gronde au décollage, par bouffées en croisière
    const fill = flying ? Math.min(1, p.up * 2.2) : 0.12;
    c.env!.scale.setScalar(Math.max(0.001, 0.12 + 0.88 * (flying ? fill : 0)));
    c.burner!.scale.setScalar(!flying ? 0.001 : p.up < 0.6 ? 1.8 : p.up < 1 ? 0.3 : Math.sin(this.t * 1.7) > 0.2 ? 1.5 : 0.4);
    c.hull.rotation.set(Math.sin(this.t * 1.9) * 0.03 * p.up, 0, Math.sin(this.t * 0.9) * 0.04 * p.up);
  }
}
