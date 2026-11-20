import * as THREE from 'three';
import { Parts } from './parts';
import { loft, plate } from './helis';
import { mats } from './materials';
import { balloonBasketGeo, balloonEnvelopeGeo } from './balloon';
import { AirKind, BALLOON_SCALE } from '../sim/airlift';
import type { Expeditions } from '../sim/expeditions';

/** Les flammes du brûleur (comme celles de la montgolfière du premier envol) */
const FLAME = new THREE.MeshBasicMaterial({ color: 0xffa040 });
const FLAME_IN = new THREE.MeshBasicMaterial({ color: 0xffe08a });

/** Vitesse des pales à plein régime (radians par seconde) */
const ROTOR = 30;

/** Profil de la caisse de l'hélicoptère de transport (rayon, z), de l'arrière au nez ; son axe à HY, un peu plus étroite (SX) */
const HAUL: [number, number][] = [[0.07, -0.3], [0.12, -0.25], [0.155, -0.18], [0.17, -0.08], [0.17, 0.12], [0.158, 0.21], [0.128, 0.27], [0.08, 0.31], [0, 0.33]];
const HY = 0.2, SX = 0.95;
/** Le rotor principal sur son mât, le rotor de queue au flanc de la dérive */
const ROTOR_AT: [number, number, number] = [0, 0.415, -0.01], TAIL_AT: [number, number, number] = [0.03, 0.29, -0.77];

/**
 * L'hélicoptère de transport des expéditions, avant = +z, posé sur ses patins à y = 0, à l'échelle des habitants : caisse
 * profilée jaune ouverte sur les flancs du cockpit à l'arrière, deux bancs (trois places derrière, deux devant) où l'équipe prend place à la vue de
 * tous, portes coulissantes repoussées vers l'arrière ; nez vitré, tableau de bord et son
 * pilote ; capot moteur à prises d'air et tuyères, mât, poutre de queue effilée, dérive et quille, plan fixe, patins relevés,
 * réservoirs de flanc, marchepieds ; livrée jaune à bandeau bleu nuit ; projecteur, feux de position et feu anticollision
 */
function haulerGeo() {
  const p = new Parts(), body = 0xf2c23a, band = 0x22305a, steel = 0x5d6878, seat = 0x3a3f4e, glass = 0x35566c, grey = 0x8a8f96;
  const hull = (g: THREE.BufferGeometry) => g.scale(SX, 1, 1).translate(0, HY, 0), PI = Math.PI;
  // la caisse : le ventre jusqu'aux bancs, le compartiment moteur fermé, le toit ; ouverte sur les flancs entre les deux
  p.add(hull(loft(HAUL, -0.3, 0.33, 1, -PI * 0.42, PI * 0.84, 8)), 0, 0, 0, body);
  for (const a of [0.36, 1.58]) p.add(hull(loft(HAUL, -0.3, 0.3, 1.012, PI * a, PI * 0.06, 1)), 0, 0, 0, band);
  p.add(hull(loft(HAUL, -0.3, -0.16, 1, PI * 0.42, PI * 1.16, 8)), 0, 0, 0, body);
  p.add(hull(loft(HAUL, -0.16, 0.2, 1, PI * 0.7, PI * 0.6, 4)), 0, 0, 0, body);
  // le nez vitré et la nervure du pare-brise (le cockpit reste ouvert sur les flancs : on y voit le pilote)
  p.add(hull(loft(HAUL, 0.2, 0.33, 1, PI * 0.42, PI * 1.16, 8)), 0, 0, 0, glass);
  p.add(hull(loft(HAUL, 0.195, 0.33, 1.02, PI - 0.03, 0.06, 1)), 0, 0, 0, body);
  p.add(hull(loft(HAUL, 0.195, 0.205, 1.02, PI * 0.42, PI * 1.16, 8)), 0, 0, 0, body);
  // montants de l'ouverture, portes coulissantes repoussées, rails, plancher et marchepieds
  for (const s of [-1, 1]) {
    for (const z of [-0.16, 0.2]) p.box(0.014, 0.16, 0.014, s * 0.146, 0.15, z, body);
    p.box(0.012, 0.14, 0.12, s * 0.172, 0.15, -0.2, body);
    p.box(0.013, 0.05, 0.08, s * 0.173, 0.22, -0.2, glass);
    p.box(0.01, 0.008, 0.34, s * 0.168, 0.302, -0.06, steel);
    p.box(0.014, 0.006, 0.14, s * 0.13, 0.048, -0.02, steel);
    // le réservoir de flanc et ses sangles
    p.add(new THREE.CapsuleGeometry(0.026, 0.1, 3, 8).rotateX(PI / 2), s * 0.16, 0.08, -0.22, 0xe4e2dc);
    for (const z of [-0.25, -0.19]) p.add(new THREE.TorusGeometry(0.027, 0.003, 3, 8).rotateY(PI / 2).rotateZ(PI / 2), s * 0.16, 0.08, z, steel, 0, false, 0, PI / 2);
  }
  p.box(0.27, 0.012, 0.42, 0, 0.074, 0, 0x5a5e66);
  // bancs et dossiers : derrière (face à l'avant), devant
  p.box(0.26, 0.03, 0.05, 0, 0.084, -0.1, seat); p.box(0.26, 0.09, 0.012, 0, 0.114, -0.14, seat);
  p.box(0.2, 0.03, 0.05, 0, 0.084, 0.01, seat); p.box(0.2, 0.08, 0.012, 0, 0.114, -0.03, seat);
  // cockpit : tableau de bord et ses écrans, le pilote (veste orange, casque blanc) et le siège vide à côté
  p.box(0.24, 0.06, 0.03, 0, 0.11, 0.24, steel);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.04, 0.026, 0.004), s * 0.05, 0.155, 0.245, 0x6ad8ff, 0, true, 0, -0.5);
  p.box(0.07, 0.03, 0.05, -0.07, 0.084, 0.14, seat); p.box(0.07, 0.08, 0.012, -0.07, 0.114, 0.11, seat);
  p.box(0.05, 0.03, 0.06, -0.07, 0.114, 0.165, 0x3a3a48);
  p.box(0.055, 0.07, 0.035, -0.07, 0.125, 0.14, 0xe8742a);
  p.box(0.034, 0.034, 0.034, -0.07, 0.195, 0.14, 0xe8b894); p.sphere(0.024, -0.07, 0.228, 0.14, 0xf4f2ee, 1, 0.85);
  p.box(0.07, 0.03, 0.05, 0.07, 0.084, 0.14, seat); p.box(0.07, 0.08, 0.012, 0.07, 0.114, 0.11, seat);
  p.add(new THREE.BoxGeometry(0.006, 0.08, 0.006), -0.07, 0.13, 0.2, 0x26262a, 0, false, 0, 0.4);
  // le capot moteur, ses prises d'air, ses tuyères ; le mât et le plateau cyclique
  p.box(0.15, 0.05, 0.26, 0, 0.35, -0.1, body);
  p.box(0.12, 0.02, 0.2, 0, 0.4, -0.1, body);
  for (const s of [-1, 1]) {
    p.box(0.006, 0.03, 0.05, s * 0.076, 0.36, 0.0, 0x26262a);
    for (let k = 0; k < 3; k++) p.box(0.007, 0.003, 0.05, s * 0.077, 0.364 + k * 0.009, 0.0, grey);
    p.add(new THREE.CylinderGeometry(0.016, 0.022, 0.06, 8).rotateX(-PI / 2 - 0.3), s * 0.05, 0.38, -0.25, 0x3c3c40);
  }
  p.cyl(0.018, 0.024, 0.02, 8, 0, ROTOR_AT[1] - 0.025, ROTOR_AT[2], grey);
  p.cyl(0.03, 0.03, 0.008, 10, 0, ROTOR_AT[1] - 0.012, ROTOR_AT[2], 0x3c3c40);
  // la poutre de queue effilée, son bandeau, la dérive et sa quille, le plan fixe et ses dérives d'extrémité
  p.add(new THREE.CylinderGeometry(0.055, 0.024, 0.48, 8).rotateX(PI / 2), 0, 0.25, -0.5, body);
  p.add(new THREE.CylinderGeometry(0.056, 0.046, 0.1, 8, 1, true).rotateX(PI / 2), 0, 0.25, -0.33, band);
  p.add(plate([[-0.72, 0.23], [-0.8, 0.23], [-0.83, 0.42], [-0.79, 0.42], [-0.745, 0.3]], 0.018), 0, 0, 0, band);
  p.add(plate([[-0.73, 0.25], [-0.79, 0.25], [-0.81, 0.15], [-0.775, 0.15]], 0.014), 0, 0, 0, body);
  p.box(0.26, 0.01, 0.06, 0, 0.245, -0.64, body);
  for (const s of [-1, 1]) p.box(0.008, 0.06, 0.05, s * 0.13, 0.225, -0.645, band);
  p.cyl(0.01, 0.01, 0.022, 6, 0.012, TAIL_AT[1] - 0.011, TAIL_AT[2], grey);
  // les patins relevés à l'avant, leurs traverses cintrées jusqu'au ventre
  for (const s of [-1, 1]) {
    p.box(0.014, 0.012, 0.5, s * 0.14, 0, -0.04, steel);
    p.add(new THREE.BoxGeometry(0.014, 0.012, 0.08), s * 0.14, 0.022, 0.24, steel, 0, false, 0, -0.55);
    for (const z of [-0.14, 0.12]) {
      p.add(new THREE.BoxGeometry(0.012, 0.07, 0.012), s * 0.125, 0.035, z, steel, 0, false, s * 0.35);
      p.box(0.2, 0.012, 0.012, s * 0.02, 0.064, z, steel);
    }
  }
  // le projecteur sous le nez, l'antenne
  p.box(0.04, 0.02, 0.03, 0, 0.032, 0.25, 0x3c3c40);
  p.box(0.03, 0.014, 0.004, 0, 0.035, 0.266, 0xfff1c9, 0, true);
  p.cyl(0.002, 0.002, 0.07, 3, -0.04, 0.37, -0.32, 0x26262a);
  // feux de position : rouge à bâbord, vert à tribord, blanc à la queue ; le feu anticollision rouge sur la dérive
  p.box(0.016, 0.016, 0.016, 0.165, 0.17, 0.16, 0xff4a3a, 0, true);
  p.box(0.016, 0.016, 0.016, -0.165, 0.17, 0.16, 0x3aff7a, 0, true);
  p.box(0.014, 0.014, 0.014, 0, 0.25, -0.79, 0xfff4e0, 0, true);
  p.box(0.016, 0.016, 0.02, 0, 0.425, -0.82, 0xff3a2a, 0, true);
  return p.build(false);
}
/**
 * Le drone de passagers du droneport (âge futuriste), avant = +z, posé sur ses pieds à y = 0 : la même cabine à deux bancs que
 * l'hélicoptère, sans pilote, sous une bulle de verre ouverte sur les côtés ; coque blanche à liserés lumineux, quatre bras qui
 * portent chacun un rotor caréné (les pales tournent à part, voir `fanGeo`), écran de bord, feux de position
 */
export function droneGeo() {
  const p = new Parts(), shell = 0xf2f6fa, trim = 0x6ae4ff, steel = 0x8a96a2, seat = 0x3a3f4e;
  // pieds et patins, coque basse arrondie, plancher
  for (const s of [-1, 1]) { p.box(0.012, 0.012, 0.36, s * 0.12, 0, 0, steel); for (const z of [-0.1, 0.1]) p.box(0.01, 0.06, 0.01, s * 0.115, 0.01, z, steel); }
  p.add(new THREE.CapsuleGeometry(0.13, 0.22, 4, 12).rotateX(Math.PI / 2).scale(1, 0.32, 1), 0, 0.075, 0, shell);
  p.box(0.27, 0.012, 0.42, 0, 0.074, 0, 0xd8dee4);
  p.box(0.275, 0.006, 0.44, 0, 0.068, 0, trim, 0, true);
  // les deux bancs et leurs dossiers, la console de bord et son écran
  p.box(0.26, 0.03, 0.05, 0, 0.084, -0.1, seat); p.box(0.26, 0.09, 0.012, 0, 0.114, -0.14, seat);
  p.box(0.2, 0.03, 0.05, 0, 0.084, 0.01, seat); p.box(0.2, 0.08, 0.012, 0, 0.114, -0.03, seat);
  p.box(0.22, 0.05, 0.04, 0, 0.084, 0.17, shell);
  p.add(new THREE.BoxGeometry(0.14, 0.05, 0.006), 0, 0.15, 0.165, trim, 0, true, 0, -0.4);
  // la bulle : une coupole de verre portée par deux arceaux, ouverte sur les côtés ; le toit et ses capteurs
  for (const z of [-0.16, 0.2]) p.add(new THREE.TorusGeometry(0.15, 0.008, 4, 14, Math.PI), 0, 0.08, z, shell);
  p.add(new THREE.SphereGeometry(0.15, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1.15), 0, 0.15, 0.13, 0x9fd8e6);
  // pas de toit plat (une dalle trop lourde au-dessus de la bulle, retour de l'auteur) : un moyeu central fuselé, porté par
  // l'arceau arrière, d'où partent les quatre bras ; son anneau lumineux, son capteur et son feu
  p.cyl(0.07, 0.085, 0.035, 12, 0, 0.2, -0.02, shell);
  p.add(new THREE.SphereGeometry(0.07, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1), 0, 0.235, -0.02, shell);
  p.add(new THREE.TorusGeometry(0.086, 0.005, 3, 18).rotateX(Math.PI / 2), 0, 0.22, -0.02, trim, 0, true);
  p.cyl(0.004, 0.004, 0.05, 4, 0, 0.255, -0.02, steel); p.sphere(0.01, 0, 0.31, -0.02, 0xff3a2a);
  // les quatre bras et leurs carénages (les pales sont à part, voir `fanGeo`)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 0.3, z = sz * 0.26;
    p.add(new THREE.BoxGeometry(0.03, 0.018, Math.hypot(x, z) - 0.06).translate(0, 0, (Math.hypot(x, z) - 0.06) / 2), sx * 0.08, 0.215, sz * 0.07, shell, Math.atan2(x, z));
    p.add(new THREE.TorusGeometry(0.1, 0.014, 5, 18).rotateX(Math.PI / 2), x, 0.225, z, shell);
    p.add(new THREE.TorusGeometry(0.1, 0.004, 3, 18).rotateX(Math.PI / 2), x, 0.236, z, trim, 0, true);
    p.cyl(0.02, 0.02, 0.03, 8, x, 0.205, z, steel);
  }
  // feux de position : rouge à bâbord, vert à tribord
  p.box(0.014, 0.014, 0.014, 0.4, 0.225, 0.26, 0xff4a3a, 0, true);
  p.box(0.014, 0.014, 0.014, -0.4, 0.225, 0.26, 0x3aff7a, 0, true);
  return p.build(false);
}
/** Les pales d'un rotor caréné du drone : trois, courtes, centrées sur l'axe */
export function fanGeo() {
  const p = new Parts();
  for (let k = 0; k < 3; k++) p.add(new THREE.BoxGeometry(0.085, 0.004, 0.024).translate(0.045, 0, 0), 0, 0, 0, 0x3c3c40, (k * Math.PI * 2) / 3);
  return p.build(false).body;
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
  /** les rotors carénés du drone */
  fans: THREE.Mesh[];
  env: THREE.Mesh | null;
  burner: THREE.Group | null;
  rpm: number;
}

let drone: { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; fan: THREE.BufferGeometry } | null = null;
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
      rotor.position.set(...ROTOR_AT); tail.position.set(...TAIL_AT);
      rotor.castShadow = true;
      hull.add(rotor, tail);
      this.group.add(root);
      return { kind, root, hull, rotor, tail, fans: [], env: null, burner: null, rpm: 0 };
    }
    if (kind === 'drone') {
      drone ??= (() => { const d = droneGeo(); return { body: d.body, glow: d.glow, fan: fanGeo() }; })();
      const body = new THREE.Mesh(drone.body, mats.body);
      body.castShadow = true;
      hull.add(body);
      if (drone.glow) hull.add(new THREE.Mesh(drone.glow, mats.glow));
      const fans = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => { const f = new THREE.Mesh(drone!.fan, mats.body); f.position.set(sx * 0.3, 0.232, sz * 0.26); hull.add(f); return f; }));
      this.group.add(root);
      return { kind, root, hull, rotor: null, tail: null, fans, env: null, burner: null, rpm: 0 };
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
    return { kind, root, hull, rotor: null, tail: null, fans: [], env, burner, rpm: 0 };
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
    if (c.kind === 'drone') {
      // les rotors carénés montent en régime au décollage, deux à deux en sens contraires ; la caisse s'incline à peine
      c.rpm += ((flying ? ROTOR * 1.6 : 0) - c.rpm) * Math.min(1, dt * (flying ? 1.6 : 0.6));
      c.fans.forEach((f, i) => { f.rotation.y += (i % 3 === 0 ? 1 : -1) * c.rpm * dt; });
      c.hull.rotation.set(p.moving ? 0.06 : 0, 0, 0);
      c.hull.position.y = p.up > 0.9 ? Math.sin(this.t * 3.1) * 0.005 : 0;
      return;
    }
    // la montgolfière se gonfle pendant qu'elle s'élève, se dégonfle en se posant ; le brûleur gronde au décollage, par bouffées en croisière
    const fill = flying ? Math.min(1, p.up * 2.2) : 0.12;
    c.env!.scale.setScalar(Math.max(0.001, 0.12 + 0.88 * (flying ? fill : 0)));
    c.burner!.scale.setScalar(!flying ? 0.001 : p.up < 0.6 ? 1.8 : p.up < 1 ? 0.3 : Math.sin(this.t * 1.7) > 0.2 ? 1.5 : 0.4);
    c.hull.rotation.set(Math.sin(this.t * 1.9) * 0.03 * p.up, 0, Math.sin(this.t * 0.9) * 0.04 * p.up);
  }
}
