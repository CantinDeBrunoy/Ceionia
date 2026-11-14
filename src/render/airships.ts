import * as THREE from 'three';
import { wrapAngle } from '../core/rng';
import { World, N } from '../world/world';
import { Building } from '../build/catalog';
import { Parts } from './parts';
import { mats } from './materials';
import { wind } from './wind';
import { balloonEnvelopeGeo, balloonBasketGeo } from './balloon';

/** Mât d'amarrage et aire des montgolfières dans le repère de l'aérodrome (centre de l'emprise, façade vers +z) */
const MAST = new THREE.Vector3(0.95, 1.05, -0.95), PAD = new THREE.Vector2(0.75, 0.05);
/** Rayon et hauteur du tour du dirigeable au-dessus de la région, sa vitesse (cases par seconde) */
const ORBIT = 11, ALT = 3.2, SHIP_SPEED = 1.1;

type ShipPhase = 'moored' | 'out' | 'back';
type BalloonPhase = 'ground' | 'inflate' | 'rise' | 'drift' | 'fall' | 'deflate';

interface Ship { root: THREE.Group; props: THREE.Mesh[]; phase: ShipPhase; t: number; pos: THREE.Vector3; heading: number; ang: number }
interface Balloon { root: THREE.Group; env: THREE.Mesh; flame: THREE.Mesh; phase: BalloonPhase; t: number; pos: THREE.Vector3; pad: THREE.Vector3; alt: number; seed: number }
interface Field { b: Building; ship: Ship; balloons: Balloon[] }

/** Dirigeable, nez vers +z : enveloppe argentée (blanche à bandeau bleu à l'époque moderne), anneaux, empennage, nacelle */
function shipGeo(modern: boolean) {
  const p = new Parts(), skin = modern ? 0xf4f2ee : 0xc8ccd2;
  p.add(new THREE.SphereGeometry(0.3, 16, 10).scale(1, 1, 3.2), 0, 0, 0, skin);
  for (let k = -3; k <= 3; k++) p.add(new THREE.TorusGeometry(0.3 * Math.sqrt(Math.max(0.05, 1 - (k / 3.6) ** 2)) + 0.004, 0.008, 3, 16), 0, 0, k * 0.26, modern ? 0x3a6ab8 : 0xa8aeb6);
  if (modern) p.add(new THREE.SphereGeometry(0.302, 16, 3, 0, Math.PI * 2, 1.35, 0.42).scale(1, 1, 3.2), 0, 0, 0, 0x3a6ab8);
  for (const [rz, w] of [[0, 0.32], [Math.PI / 2, 0.32]]) p.add(new THREE.BoxGeometry(w * 2.2, 0.012, 0.28).rotateZ(rz), 0, 0, -0.82, modern ? 0x3a6ab8 : 0xd84a3e);
  p.box(0.14, 0.08, 0.36, 0, -0.34, 0.12, modern ? 0xe8eaee : 0x5a4a3a);
  p.box(0.142, 0.03, 0.3, 0, -0.32, 0.12, 0x86c4d8);
  for (const s of [-1, 1]) p.box(0.04, 0.04, 0.08, s * 0.14, -0.3, -0.2, 0x5d6878);
  return p.build(false).body;
}

/** Hélices des moteurs du dirigeable, centrées */
function propGeo() { const p = new Parts(); p.box(0.16, 0.02, 0.006, 0, 0, 0, 0x3c3c40); return p.build(false).body; }

const FLAME = new THREE.MeshBasicMaterial({ color: 0xffb04a });
const COLORS: [number, number][] = [[0xd84a3e, 0xf2c23a], [0x3a6ab8, 0xf4f2ee], [0x4fa860, 0xf2c23a], [0xb45ad8, 0xf4f2ee]];

/**
 * Le ciel des aérodromes : le dirigeable amarré à son mât (nez au mât, corps sous le vent) largue les amarres, fait le tour de
 * la région et revient s'amarrer ; les montgolfières se gonflent sur leur aire, s'élèvent au brûleur, dérivent au gré du
 * vent puis redescendent, se dégonflent là où elles se posent et reparaissent à l'aérodrome. Tout le monde reste au sol la nuit
 */
export class Airships {
  group = new THREE.Group();
  private fields = new Map<number, Field>();
  private version = -1;
  private age = -1;

  constructor(private world: World) {}

  /** Place d'un point du repère de l'aérodrome, en monde */
  private local(b: Building, x: number, y: number, z: number) {
    const r = (b.rot * Math.PI) / 2, c = Math.cos(r), s = Math.sin(r), cx = b.x + 1.5, cz = b.z + 1.5;
    return new THREE.Vector3(cx + x * c + z * s, this.world.surfaceAt(cx, cz) + y, cz - x * s + z * c);
  }

  private sync(age: number) {
    const w = this.world;
    for (const [id, f] of this.fields) if (!w.buildings.has(id) || age !== this.age) { this.drop(f); this.fields.delete(id); }
    for (const b of w.buildings.values()) {
      if (b.kind !== 'aerodrome' || b.small || this.fields.has(b.id)) continue;
      const ship: Ship = { root: new THREE.Group(), props: [], phase: 'moored', t: 10 + Math.random() * 20, pos: new THREE.Vector3(), heading: 0, ang: 0 };
      const hull = new THREE.Mesh(shipGeo(age >= 4), mats.body);
      hull.castShadow = true;
      ship.root.add(hull);
      for (const s of [-1, 1]) { const pr = new THREE.Mesh(propGeo(), mats.body); pr.position.set(s * 0.14, -0.3, -0.25); ship.root.add(pr); ship.props.push(pr); }
      this.group.add(ship.root);
      const balloons: Balloon[] = [];
      for (let i = 0; i < 2; i++) {
        const [a, c] = COLORS[(b.id + i) % COLORS.length];
        const root = new THREE.Group(), env = new THREE.Mesh(balloonEnvelopeGeo(a, c), mats.body), basket = new THREE.Mesh(balloonBasketGeo(true), mats.body);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 5).translate(0, 0.06, 0), FLAME);
        env.position.y = 0.18; flame.position.y = 0.19;
        env.castShadow = basket.castShadow = true;
        root.add(env, basket, flame);
        root.visible = false;
        this.group.add(root);
        const pad = this.local(b, PAD.x + (i ? 0.16 : -0.18), 0.02, PAD.y + (i ? -0.1 : 0.12));
        balloons.push({ root, env, flame, phase: 'ground', t: 4 + i * 14 + Math.random() * 6, pos: pad.clone(), pad, alt: 0, seed: Math.random() * 10 });
      }
      this.fields.set(b.id, { b, ship, balloons });
    }
    this.age = age;
  }

  private drop(f: Field) {
    for (const o of [f.ship.root, ...f.balloons.map((x) => x.root)]) {
      this.group.remove(o);
      o.traverse((m) => { if (m instanceof THREE.Mesh) m.geometry.dispose(); });
    }
  }

  update(dt: number, hour: number, age: number) {
    if (this.world.version !== this.version || age !== this.age) { this.version = this.world.version; this.sync(age); }
    const day = hour > 7 && hour < 19.5;
    for (const f of this.fields.values()) {
      this.stepShip(f, dt, day);
      for (const bl of f.balloons) this.stepBalloon(bl, dt, day);
    }
  }

  /** Amarré : nez au mât, le corps tourné sous le vent ; en vol, un grand tour au-dessus de la région, puis retour au mât */
  private stepShip(f: Field, dt: number, day: boolean) {
    const s = f.ship, mast = this.local(f.b, MAST.x, MAST.y, MAST.z), center = this.local(f.b, 0, 0, 0);
    const moored = new THREE.Vector3(mast.x + wind.dx * 0.98, mast.y - 0.05, mast.z + wind.dz * 0.98);
    s.t -= dt;
    for (const pr of s.props) pr.rotation.z += dt * (s.phase === 'moored' ? 0 : 30);
    if (s.phase === 'moored') {
      s.pos.copy(moored);
      s.heading = Math.atan2(-wind.dx, -wind.dz);
      s.pos.y += Math.sin(performance.now() * 0.0008 + f.b.id) * 0.03;
      if (s.t <= 0 && day) { s.phase = 'out'; s.t = 32; s.ang = Math.atan2(moored.z - center.z, moored.x - center.x); }
    } else {
      // le point visé : sur le cercle du tour (un peu en avant), ou la place d'amarrage au retour
      let goal: THREE.Vector3;
      if (s.phase === 'out') {
        s.ang += (dt * SHIP_SPEED) / ORBIT;
        goal = new THREE.Vector3(center.x + Math.cos(s.ang + 0.4) * ORBIT, mast.y + ALT, center.z + Math.sin(s.ang + 0.4) * ORBIT);
        if (s.t <= 0 || !day) s.phase = 'back';
      } else goal = moored.clone().add(new THREE.Vector3(wind.dx * 2, 0.4, wind.dz * 2).multiplyScalar(Math.min(1, s.pos.distanceTo(moored) / 4)));
      const d = goal.clone().sub(s.pos), dist = d.length();
      const want = Math.atan2(d.x, d.z);
      let da = want - s.heading;
      da = wrapAngle(da);
      s.heading += da * Math.min(1, dt * 0.6);
      const sp = s.phase === 'back' ? Math.min(SHIP_SPEED, 0.25 + dist * 0.4) : SHIP_SPEED;
      s.pos.x += Math.sin(s.heading) * sp * dt; s.pos.z += Math.cos(s.heading) * sp * dt;
      s.pos.y += (goal.y - s.pos.y) * Math.min(1, dt * 0.5);
      if (s.phase === 'back' && s.pos.distanceTo(moored) < 0.25) { s.phase = 'moored'; s.t = 12 + Math.random() * 18; }
    }
    s.root.position.copy(s.pos);
    s.root.rotation.set(0, s.heading, 0);
    s.root.rotation.z = s.phase === 'moored' ? 0 : Math.sin(performance.now() * 0.0006) * 0.04;
  }

  /** Une montgolfière : gonflée sur l'aire, elle monte au brûleur, dérive avec le vent, redescend, se dégonfle et repart */
  private stepBalloon(bl: Balloon, dt: number, day: boolean) {
    bl.t -= dt;
    const ground = (x: number, z: number) => this.world.surfaceAt(x, z) + 0.02;
    const burn = bl.phase === 'inflate' || bl.phase === 'rise' || (bl.phase === 'drift' && Math.sin(bl.t * 1.7 + bl.seed) > 0.6);
    bl.flame.visible = burn;
    bl.flame.scale.setScalar(0.8 + Math.random() * 0.5);
    if (bl.phase === 'ground') {
      bl.root.visible = false;
      if (bl.t <= 0 && day) { bl.phase = 'inflate'; bl.t = 6; bl.pos.copy(bl.pad); bl.alt = 0; bl.root.visible = true; }
    } else if (bl.phase === 'inflate') {
      bl.env.scale.set(1, Math.max(0.15, 1 - bl.t / 6), 1);
      if (bl.t <= 0) { bl.phase = 'rise'; bl.t = 9; }
    } else if (bl.phase === 'rise' || bl.phase === 'drift' || bl.phase === 'fall') {
      // le vent l'emporte ; on monte au brûleur, on se laisse redescendre
      const drift = bl.phase === 'rise' ? 0.15 : 0.3;
      bl.pos.x += wind.dx * drift * dt; bl.pos.z += wind.dz * drift * dt;
      const top = 3.2 + (bl.seed % 1) * 2;
      if (bl.phase === 'rise') { bl.alt = Math.min(top, bl.alt + dt * 0.42); if (bl.t <= 0) { bl.phase = 'drift'; bl.t = 12 + Math.random() * 10; } }
      else if (bl.phase === 'drift') { bl.alt = top + Math.sin(bl.t * 0.4 + bl.seed) * 0.25; if (bl.t <= 0 || !day) bl.phase = 'fall'; }
      else { bl.alt = Math.max(0, bl.alt - dt * 0.5); if (bl.alt <= 0) { bl.phase = 'deflate'; bl.t = 5; } }
      // pas au-delà de la carte : on redescend
      if (bl.pos.x < 3 || bl.pos.z < 3 || bl.pos.x > N - 3 || bl.pos.z > N - 3) bl.phase = bl.phase === 'rise' || bl.phase === 'drift' ? 'fall' : bl.phase;
    } else if (bl.phase === 'deflate') {
      bl.env.scale.set(1, Math.max(0.05, bl.t / 5), 1);
      if (bl.t <= 0) { bl.phase = 'ground'; bl.t = 8 + Math.random() * 12; bl.env.scale.set(1, 1, 1); }
    }
    bl.root.position.set(bl.pos.x, Math.max(ground(bl.pos.x, bl.pos.z), this.world.surfaceAt(bl.pos.x, bl.pos.z)) + bl.alt, bl.pos.z);
    bl.root.rotation.y += dt * 0.08;
  }
}
