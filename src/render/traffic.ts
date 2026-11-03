import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N, SEA } from '../world/world';
import { Building } from '../build/catalog';
import { makeActor, play, hasModel, Actor, AGE_VILLAGERS, SIT, HUMAN } from './assets';
import { Parts } from './parts';
import { mats } from './materials';
import { makeDraftHorse, rideStep, Rider } from './riders';

const MAX_CARTS = 10, MAX_BOATS = 16, MAX_SAILS = 5;

interface Vehicle {
  path: number[]; i: number; x: number; z: number; heading: number; wait: number;
  /** attelage animé (charrette tirée par un cheval, de l'Antiquité à l'âge industriel) */
  rig?: CartRig | null;
}
interface CartRig { root: THREE.Group; horse: Rider; wheels: THREE.Object3D[]; driver: THREE.Object3D; phase: number }

/** Teintes des charretiers (blouse, chapeau) */
const DRIVERS: [number, number][] = [[0x5a7ab0, 0xd8c06a], [0x9a4a3a, 0x5a4636], [0x6a8a4a, 0xc8a870], [0x8a6a9a, 0x3c3c40], [0xc8b48a, 0x7a5a42]];

/**
 * Charrette attelée, avant = +z : plateau à ridelles et son chargement (amphores dans l'Antiquité, foin, sacs ou tonneaux
 * ensuite, bidons de lait à l'âge industriel), banc du charretier, brancards jusqu'au collier du cheval ; roues à rayons
 * et charretier à part, pour les animer
 */
function cartRig(age: number, v: number): CartRig {
  const root = new THREE.Group(), p = new Parts(), wood = 0xa07850, dk = 0x6a4a34, load = v % 3;
  const z0 = -0.14;
  p.box(0.2, 0.03, 0.27, 0, 0.13, z0, wood);
  for (const s of [-1, 1]) { p.box(0.012, 0.05, 0.27, s * 0.1, 0.17, z0, dk); for (const z of [-0.12, 0, 0.12]) p.box(0.016, 0.07, 0.016, s * 0.1, 0.16, z0 + z, dk); }
  p.box(0.2, 0.05, 0.012, 0, 0.17, z0 - 0.135, dk);
  p.box(0.24, 0.016, 0.016, 0, 0.075, z0 - 0.02, dk);
  // chargement
  if (age <= 1) for (const [x, z] of [[-0.05, -0.08], [0.05, -0.08], [-0.05, 0.02], [0.05, 0.02], [0, -0.03]]) { p.cyl(0.028, 0.02, 0.07, 7, x, 0.18, z0 + z, 0xc0704a); p.cyl(0.012, 0.016, 0.02, 6, x, 0.225, z0 + z, 0xa85a3a); }
  else if (load === 0) { p.add(new THREE.IcosahedronGeometry(0.1, 1).scale(1, 0.55, 1.35), 0, 0.2, z0 - 0.02, 0xd8c06a); for (const s of [-1, 1]) p.box(0.03, 0.006, 0.06, s * 0.05, 0.25, z0, 0xe8d488, 0.4); }
  else if (load === 1) for (const [x, z, r] of [[-0.05, -0.08, 0.2], [0.05, -0.07, -0.3], [0, 0.03, 0.1], [0.0, -0.06, 1.6]]) p.add(new THREE.IcosahedronGeometry(0.045, 0).scale(1, 0.75, 1.3), x, r > 1 ? 0.235 : 0.18, z0 + z, 0xd8c8a0, r);
  else if (age === 2) for (const [x, z] of [[-0.05, -0.07], [0.05, -0.07], [0, 0.04]]) { p.cyl(0.034, 0.034, 0.075, 8, x, 0.185, z0 + z, 0x8a5a3a); for (const y of [0.16, 0.21]) p.cyl(0.036, 0.036, 0.008, 8, x, y, z0 + z, 0x4a4a4e); }
  else { for (const [x, z] of [[-0.06, -0.08], [0, -0.08], [0.06, -0.08], [-0.03, 0.02], [0.03, 0.02]]) { p.cyl(0.022, 0.022, 0.07, 8, x, 0.18, z0 + z, 0xc4cad2); p.cyl(0.012, 0.014, 0.02, 6, x, 0.225, z0 + z, 0xa8aeb6); } }
  // banc, marchepied, brancards
  p.box(0.17, 0.018, 0.05, 0, 0.21, z0 + 0.12, dk);
  p.box(0.17, 0.01, 0.04, 0, 0.14, z0 + 0.165, wood);
  for (const s of [-1, 1]) p.add(new THREE.BoxGeometry(0.012, 0.012, 0.36), s * 0.062, 0.17, z0 + 0.3, dk, 0, false, 0, -0.08);
  const cart = new THREE.Mesh(p.build(false).body, mats.body);
  cart.castShadow = true;
  root.add(cart);
  // roues à rayons, qui tournent
  const wheels: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const wp = new Parts();
    wp.add(new THREE.TorusGeometry(0.062, 0.009, 4, 12).rotateY(Math.PI / 2), 0, 0, 0, dk);
    wp.add(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6).rotateZ(Math.PI / 2), 0, 0, 0, 0x4a4a4e);
    for (let k = 0; k < 4; k++) wp.add(new THREE.BoxGeometry(0.006, 0.12, 0.008), 0, 0, 0, wood, 0, false, 0, (k * Math.PI) / 4);
    const wh = new THREE.Mesh(wp.build(false).body, mats.body);
    wh.position.set(s * 0.115, 0.07, z0 - 0.02);
    wh.castShadow = true;
    root.add(wh);
    wheels.push(wh);
  }
  // le charretier sur son banc, rênes en main, chapeau de l'époque
  const [coat, hat] = DRIVERS[v % DRIVERS.length], dp = new Parts();
  dp.box(0.07, 0.025, 0.05, 0, 0.232, 0, 0x4a3c34);
  for (const s of [-1, 1]) { dp.box(0.026, 0.024, 0.06, s * 0.022, 0.232, 0.04, 0x4a3c34); dp.box(0.024, 0.07, 0.026, s * 0.022, 0.19, 0.07, 0x3a2e28); }
  dp.box(0.072, 0.09, 0.05, 0, 0.29, -0.005, coat);
  for (const s of [-1, 1]) { dp.add(new THREE.BoxGeometry(0.022, 0.065, 0.024), s * 0.045, 0.3, 0.025, coat, 0, false, 0, -0.9); dp.box(0.02, 0.02, 0.02, s * 0.04, 0.28, 0.06, 0xe8b894); }
  dp.box(0.042, 0.042, 0.042, 0, 0.36, 0, 0xe8b894);
  if (age <= 1) dp.box(0.05, 0.02, 0.05, 0, 0.385, -0.004, coat);
  else if (age === 2) { dp.cyl(0.05, 0.05, 0.006, 10, 0, 0.385, 0, hat); dp.cyl(0.024, 0.028, 0.026, 8, 0, 0.398, 0, hat); }
  else { dp.cyl(0.034, 0.034, 0.006, 10, 0, 0.383, 0, hat); dp.cyl(0.024, 0.024, 0.03, 8, 0, 0.4, 0, hat); }
  dp.box(0.004, 0.004, 0.2, -0.03, 0.27, 0.16, 0x3a2a20); dp.box(0.004, 0.004, 0.2, 0.03, 0.27, 0.16, 0x3a2a20);
  const driver = new THREE.Mesh(dp.build(false).body, mats.body);
  driver.position.set(0, 0, z0 + 0.1);
  driver.castShadow = true;
  root.add(driver);
  const horse = makeDraftHorse(v);
  horse.root.position.set(0, 0, z0 + 0.5);
  root.add(horse.root);
  return { root, horse, wheels, driver, phase: Math.random() * 6 };
}
interface Boat {
  home: Building | null; x: number; z: number; tx: number; tz: number; heading: number; wait: number; mx: number; mz: number; seed: number;
  /** le pêcheur assis dans la barque (habitant de l'époque) */
  actor?: Actor | null; actorKey?: string;
}
/** Place du pêcheur dans la barque : assis à l'arrière, tourné vers l'avant (repère de la barque) */
const SEAT = new THREE.Matrix4().makeTranslation(0, 0.02, -0.07);

/** Cap qui tourne vers `want` (par le plus court), d'au plus la fraction `k` de l'écart */
function turn(heading: number, want: number, k: number) {
  let da = want - heading;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  return heading + da * Math.min(1, k);
}

/** Géométrie colorée (attribut de couleur par sommet) à partir de boîtes et de cylindres */
function colored(parts: [THREE.BufferGeometry, number][]) {
  const out = parts.map(([g, c]) => {
    const n = g.index ? g.toNonIndexed() : g, col = new THREE.Color(c), a = new Float32Array(n.attributes.position.count * 3);
    for (let i = 0; i < n.attributes.position.count; i++) col.toArray(a, i * 3);
    n.setAttribute('color', new THREE.BufferAttribute(a, 3));
    n.deleteAttribute('uv');
    return n;
  });
  return mergeGeometries(out)!;
}

/**
 * Charrette tirée par un cheval (âges antique à industriel), automobile ancienne (âge industriel, une fois la course
 * automobile gagnée) ou petite voiture (âge moderne) ; avant = +z
 */
function vehicleGeo(age: number, motor = false) {
  const wheel = (x: number, z: number, r: number) => new THREE.CylinderGeometry(r, r, 0.025, 8).rotateZ(Math.PI / 2).translate(x, r, z);
  if (age === 3 && motor) {
    const body = 0x1e2a24;
    return colored([
      [new THREE.BoxGeometry(0.14, 0.05, 0.24).translate(0, 0.07, -0.02), body],
      [new THREE.BoxGeometry(0.12, 0.045, 0.09).translate(0, 0.095, 0.11), 0x2a2a2e],
      [new THREE.BoxGeometry(0.09, 0.06, 0.012).translate(0, 0.09, 0.16), 0xc8a050],
      [new THREE.BoxGeometry(0.13, 0.06, 0.03).translate(0, 0.12, -0.09), 0x5a3a2a],
      [new THREE.BoxGeometry(0.12, 0.05, 0.004).translate(0, 0.14, 0.05), 0xcfe2f0],
      [wheel(-0.078, 0.1, 0.04), 0x2a2a2e], [wheel(0.078, 0.1, 0.04), 0x2a2a2e], [wheel(-0.078, -0.1, 0.04), 0x2a2a2e], [wheel(0.078, -0.1, 0.04), 0x2a2a2e],
      [new THREE.BoxGeometry(0.03, 0.008, 0.09).translate(-0.078, 0.085, 0.1), 0x1e1e22], [new THREE.BoxGeometry(0.03, 0.008, 0.09).translate(0.078, 0.085, 0.1), 0x1e1e22],
      [new THREE.BoxGeometry(0.03, 0.008, 0.09).translate(-0.078, 0.085, -0.1), 0x1e1e22], [new THREE.BoxGeometry(0.03, 0.008, 0.09).translate(0.078, 0.085, -0.1), 0x1e1e22],
      [new THREE.BoxGeometry(0.022, 0.022, 0.02).translate(-0.045, 0.105, 0.165), 0xffe8a0], [new THREE.BoxGeometry(0.022, 0.022, 0.02).translate(0.045, 0.105, 0.165), 0xffe8a0],
      [new THREE.BoxGeometry(0.05, 0.05, 0.04).translate(0, 0.12, -0.02), 0x5a4a3a], [new THREE.BoxGeometry(0.032, 0.032, 0.032).translate(0, 0.165, -0.02), 0xe8b894],
      [new THREE.BoxGeometry(0.036, 0.01, 0.042).translate(0, 0.186, -0.016), 0x3c3c40],
    ]);
  }
  if (age >= 4) {
    const body = 0xe8553c;
    return colored([
      [new THREE.BoxGeometry(0.15, 0.06, 0.28).translate(0, 0.07, 0), body],
      [new THREE.BoxGeometry(0.13, 0.05, 0.14).translate(0, 0.125, -0.02), 0xcfe2f0],
      [wheel(-0.075, 0.09, 0.035), 0x2e2a2c], [wheel(0.075, 0.09, 0.035), 0x2e2a2c], [wheel(-0.075, -0.09, 0.035), 0x2e2a2c], [wheel(0.075, -0.09, 0.035), 0x2e2a2c],
    ]);
  }
  return colored([
    [new THREE.BoxGeometry(0.14, 0.06, 0.18).translate(0, 0.1, -0.06), 0xb08968],
    [new THREE.BoxGeometry(0.12, 0.05, 0.14).translate(0, 0.15, -0.06), age >= 2 ? 0xd8c06a : 0x9ccf92],
    [wheel(-0.085, -0.06, 0.06), 0x7a6355], [wheel(0.085, -0.06, 0.06), 0x7a6355],
    [new THREE.BoxGeometry(0.012, 0.012, 0.14).translate(-0.04, 0.09, 0.08), 0x7a6355], [new THREE.BoxGeometry(0.012, 0.012, 0.14).translate(0.04, 0.09, 0.08), 0x7a6355],
    // cheval
    [new THREE.BoxGeometry(0.06, 0.07, 0.15).translate(0, 0.11, 0.2), 0x8a5a3a],
    [new THREE.BoxGeometry(0.035, 0.07, 0.05).translate(0, 0.17, 0.28), 0x8a5a3a],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [new THREE.BoxGeometry(0.018, 0.08, 0.018).translate(sx * 0.02, 0.04, 0.2 + sz * 0.05), 0x5a3e2e] as [THREE.BufferGeometry, number]),
  ]);
}

/** Barque de pêche (le pêcheur est un habitant modélisé, assis dedans) et sa canne qui pointe vers l'avant ; avant = +z */
function rowboatGeo() {
  return colored([
    [new THREE.BoxGeometry(0.16, 0.05, 0.36).translate(0, 0.0, 0), 0x9a7452],
    [new THREE.ConeGeometry(0.08, 0.1, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.6, 1).translate(0, 0, 0.22), 0x9a7452],
    [new THREE.BoxGeometry(0.13, 0.012, 0.3).translate(0, 0.026, 0), 0xc9a27a],
    [new THREE.BoxGeometry(0.14, 0.02, 0.04).translate(0, 0.04, 0.08), 0x7a5a42],
    [new THREE.CylinderGeometry(0.004, 0.004, 0.32, 4).rotateX(-0.95).translate(0.05, 0.13, 0.04), 0x5a3e2e],
  ]);
}

/** Voilier : coque, mât et deux voiles ; avant = +z */
function sailboatGeo() {
  const sail = (pts: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); return g; };
  return colored([
    [new THREE.BoxGeometry(0.22, 0.08, 0.6).translate(0, 0.0, 0), 0xf7f3ec],
    [new THREE.ConeGeometry(0.11, 0.2, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.7, 1).translate(0, 0, 0.38), 0xf7f3ec],
    [new THREE.BoxGeometry(0.2, 0.02, 0.55).translate(0, 0.045, 0), 0xb08968],
    [new THREE.CylinderGeometry(0.008, 0.008, 0.75, 5).translate(0, 0.42, 0.04), 0x7a6355],
    [sail([0, 0.12, 0.02, 0, 0.78, 0.04, 0, 0.12, -0.26, 0, 0.12, -0.26, 0, 0.78, 0.04, 0, 0.12, 0.02]), 0xffffff],
    [sail([0, 0.12, 0.08, 0, 0.7, 0.06, 0, 0.12, 0.32, 0, 0.12, 0.32, 0, 0.7, 0.06, 0, 0.12, 0.08]), 0xf2e6c8],
  ]);
}

/**
 * Trafic : charrettes (puis voitures) qui parcourent le réseau de routes, barques des pêcheurs autour de leur ponton,
 * voiliers au large à partir du Moyen Âge ; tout le monde rentre la nuit
 */
export class Traffic {
  group = new THREE.Group();
  private carts: THREE.InstancedMesh;
  private boatsMesh: THREE.InstancedMesh;
  private sailsMesh: THREE.InstancedMesh;
  private vehicles: Vehicle[] = [];
  private boats: Boat[] = [];
  private sails: Boat[] = [];
  private roads: number[] = [];
  private builtVersion = -1;
  private builtAge = -1;
  private builtPop = -1;
  private dummy = new THREE.Object3D();
  private t = 0;
  private age = 0;

  /** cases à contourner (l'îlot d'un rond-point) */
  avoid = new Set<number>();
  /** la course automobile est gagnée : à l'âge industriel, les autos remplacent les charrettes */
  motor = false;
  private builtMotor = false;

  constructor(private world: World) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, side: THREE.DoubleSide });
    this.carts = new THREE.InstancedMesh(vehicleGeo(1), mat, MAX_CARTS);
    this.boatsMesh = new THREE.InstancedMesh(rowboatGeo(), mat, MAX_BOATS);
    this.sailsMesh = new THREE.InstancedMesh(sailboatGeo(), mat, MAX_SAILS);
    for (const m of [this.carts, this.boatsMesh, this.sailsMesh]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; }
    this.group.add(this.carts, this.boatsMesh, this.sailsMesh);
  }

  update(dt: number, hour: number, age: number, pop: number) {
    const w = this.world;
    this.t += dt;
    // recensement quand le monde, l'âge ou la taille du village (par dizaines d'habitants) changent
    if (w.version !== this.builtVersion || age !== this.builtAge || this.motor !== this.builtMotor || Math.floor(pop / 10) !== this.builtPop) { this.builtPop = Math.floor(pop / 10); this.refresh(age, pop); }
    const day = hour > 6 && hour < 21;
    this.moveCarts(dt, day);
    this.moveBoats(dt, day);
    this.moveSails(dt);
  }

  /** Recensement : routes, pontons et large ; nombre de véhicules selon la population et l'âge */
  private refresh(age: number, pop: number) {
    const w = this.world;
    if (age !== this.builtAge || this.motor !== this.builtMotor) {
      this.builtMotor = this.motor;
      this.carts.geometry.dispose();
      this.carts.geometry = vehicleGeo(age, this.motor);
      // les attelages changent d'époque (ou laissent place aux voitures)
      for (const v of this.vehicles) this.dropRig(v);
    }
    this.builtVersion = w.version; this.builtAge = age; this.age = age;
    this.roads = [];
    for (let k = 0; k < N * N; k++) if (w.road[k]) this.roads.push(k);
    const nCarts = age >= 1 && pop >= 8 ? Math.min(MAX_CARTS, Math.floor(this.roads.length / 18)) : 0;
    for (const v of this.vehicles.slice(nCarts)) this.dropRig(v);
    this.vehicles.length = Math.min(this.vehicles.length, nCarts);
    for (const v of this.vehicles) if (v.path.some((c) => !w.road[c])) { v.path = []; v.i = 0; }
    while (this.vehicles.length < nCarts) {
      const c = this.roads[Math.floor(Math.random() * this.roads.length)];
      this.vehicles.push({ path: [], i: 0, x: (c % N) + 0.5, z: Math.floor(c / N) + 0.5, heading: 0, wait: Math.random() * 3 });
    }
    // une barque par ponton qui donne sur la mer ou une rivière
    const piers = [...w.buildings.values()].filter((b) => b.kind === 'pier');
    for (const bt of this.boats) if (!bt.home || !w.buildings.has(bt.home.id)) this.dropFisher(bt);
    this.boats = this.boats.filter((bt) => bt.home && w.buildings.has(bt.home.id));
    for (const p of piers.slice(0, MAX_BOATS)) {
      if (this.boats.some((bt) => bt.home!.id === p.id)) continue;
      // amarrage le long du ponton, côté eau, là où elle est assez profonde
      const f = [[0, 1], [1, 0], [0, -1], [-1, 0]][p.rot];
      let mx = 0, mz = 0, ok = false;
      for (const along of [1.05, 1.4, 1.8]) for (const side of [0.3, -0.3]) {
        if (ok) break;
        mx = p.x + 0.5 + f[0] * along - f[1] * side; mz = p.z + 0.5 + f[1] * along + f[0] * side;
        ok = w.seaAt(mx, mz, SEA - 0.08);
      }
      if (!ok) continue;
      this.boats.push({ home: p, x: mx, z: mz, tx: mx, tz: mz, heading: Math.atan2(f[0], f[1]), wait: 2 + Math.random() * 4, mx, mz, seed: Math.random() * 10 });
    }
    // voiliers au large à partir du Moyen Âge
    const nSails = age >= 2 ? MAX_SAILS : 0;
    this.sails = this.sails.filter((s) => w.seaAt(s.x, s.z, -0.6)).slice(0, nSails);
    for (let tries = 0; this.sails.length < nSails && tries < 200; tries++) {
      const x = 2 + Math.random() * (N - 4), z = 2 + Math.random() * (N - 4);
      if (w.seaAt(x, z, -1.2)) this.sails.push({ home: null, x, z, tx: x, tz: z, heading: Math.random() * 6.28, wait: 0, mx: x, mz: z, seed: Math.random() * 10 });
    }
  }

  /** Les charrettes vont d'un bout à l'autre du réseau, en tenant leur droite ; elles s'arrêtent la nuit */
  private moveCarts(dt: number, day: boolean) {
    let n = 0;
    for (const v of this.vehicles) {
      if (!day) { if (v.rig) v.rig.root.visible = false; continue; }
      if (v.i >= v.path.length) {
        v.wait -= dt;
        if (v.wait > 0) { this.place(v, n++, dt, 0); continue; }
        const start = Math.floor(v.z) * N + Math.floor(v.x), goal = this.roads[Math.floor(Math.random() * this.roads.length)];
        v.path = this.roadPath(start, goal) ?? [];
        v.i = 0; v.wait = 2 + Math.random() * 6;
      }
      const c = v.path[v.i];
      if (c === undefined) { this.place(v, n++, dt, 0); continue; }
      const [cx, cz] = this.world.passPoint(v.path, v.i);
      // tenir sa droite : décalage perpendiculaire au sens de marche
      const hx = Math.sin(v.heading), hz = Math.cos(v.heading), tx = cx - hz * 0.14, tz = cz + hx * 0.14;
      const dx = tx - v.x, dz = tz - v.z, dist = Math.hypot(dx, dz), step = dt * (this.builtAge >= 4 ? 1.6 : this.horses ? 0.8 : 1.2);
      if (dist <= step) { v.x = tx; v.z = tz; v.i++; }
      else {
        v.x += (dx / dist) * step; v.z += (dz / dist) * step;
        v.heading = turn(v.heading, Math.atan2(dx, dz), dt * 6);
      }
      this.place(v, n++, dt, Math.min(dist, step));
    }
    this.carts.count = this.horses ? 0 : n;
    this.carts.instanceMatrix.needsUpdate = true;
  }

  /** Des charrettes attelées (avant les automobiles) */
  private get horses() { return this.builtAge < 4 && !(this.builtAge === 3 && this.builtMotor); }

  /** Retire l'attelage d'une charrette (changement d'époque, charrette de trop) */
  private dropRig(v: Vehicle) {
    if (!v.rig) return;
    this.group.remove(v.rig.root);
    v.rig.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    v.rig = null;
  }

  /**
   * Pose la charrette (ou la voiture) : avant l'âge moderne, l'attelage animé — le cheval marche au pas, les roues tournent
   * de la distance parcourue, le charretier se balance ; à l'arrêt, le cheval secoue la tête
   */
  private place(v: Vehicle, i: number, dt = 0, moved = 0) {
    if (this.horses) {
      if (!v.rig) { v.rig = cartRig(this.builtAge, this.vehicles.indexOf(v)); this.group.add(v.rig.root); }
      const r = v.rig, gait = moved > 0 ? 0.55 : 0;
      r.root.visible = true;
      r.root.position.set(v.x, this.world.surfaceAt(v.x, v.z) + 0.01, v.z);
      r.root.rotation.y = v.heading;
      r.phase += dt * (gait ? 9 : 2);
      rideStep(r.horse, r.phase, gait, 'rest');
      if (!gait) r.horse.body.rotation.x = Math.sin(r.phase * 0.7) * 0.03;
      for (const wh of r.wheels) wh.rotation.x += moved / 0.062;
      r.driver.position.y = Math.abs(Math.sin(r.phase)) * 0.006 * (gait ? 1 : 0);
      r.driver.rotation.z = Math.sin(r.phase * 0.5) * 0.03 * (gait ? 1 : 0.3);
      return;
    }
    const d = this.dummy;
    d.position.set(v.x, this.world.surfaceAt(v.x, v.z) + 0.01, v.z);
    d.rotation.set(0, v.heading, 0);
    d.scale.setScalar(1);
    d.updateMatrix();
    this.carts.setMatrixAt(i, d.matrix);
  }

  /** Plus court chemin sur les seules routes (largeur d'abord) */
  private roadPath(start: number, goal: number): number[] | null {
    const w = this.world;
    if (!w.road[start] || start === goal) return null;
    const prev = new Map<number, number>([[start, -1]]), q = [start];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === goal) {
        const out: number[] = [];
        for (let x = c; x !== start; x = prev.get(x)!) out.push(x);
        return out.reverse();
      }
      const x = c % N, z = Math.floor(c / N);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nz * N + nx;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N || !w.road[k] || prev.has(k) || (this.avoid.has(k) && k !== goal)) continue;
        prev.set(k, c); q.push(k);
      }
    }
    return null;
  }

  /** Barques : le pêcheur rame vers un coin d'eau voisin, y reste à pêcher, recommence ; il rentre au ponton la nuit */
  private moveBoats(dt: number, day: boolean) {
    const d = this.dummy;
    let n = 0;
    for (const b of this.boats) {
      if (!day) { b.tx = b.mx; b.tz = b.mz; }
      const dx = b.tx - b.x, dz = b.tz - b.z, dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const step = Math.min(dist, dt * 0.45);
        b.x += (dx / dist) * step; b.z += (dz / dist) * step;
        b.heading = turn(b.heading, Math.atan2(dx, dz), dt * 2);
      } else if (day && (b.wait -= dt) <= 0) {
        b.wait = 5 + Math.random() * 8;
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 5, x = b.mx + Math.cos(a) * r, z = b.mz + Math.sin(a) * r;
          if (this.openWater(b.x, b.z, x, z, -0.3)) { b.tx = x; b.tz = z; break; }
        }
      }
      d.position.set(b.x, SEA + 0.02 + Math.sin(this.t * 1.6 + b.seed) * 0.012, b.z);
      d.rotation.set(Math.sin(this.t * 1.3 + b.seed) * 0.05, b.heading, Math.sin(this.t * 1.1 + b.seed) * 0.06);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.boatsMesh.setMatrixAt(n++, d.matrix);
      // la nuit, revenu au ponton, le pêcheur rentre chez lui
      this.fisher(b, d.matrix, dt, day || dist > 0.05);
    }
    this.boatsMesh.count = n;
    this.boatsMesh.instanceMatrix.needsUpdate = true;
  }

  /** Pêcheur assis dans la barque : un habitant de l'époque, qui suit la barque et son roulis */
  private fisher(b: Boat, m: THREE.Matrix4, dt: number, visible: boolean) {
    const set = AGE_VILLAGERS[Math.min(this.age, 4)], name = set[Math.floor(b.seed * 7) % set.length];
    if (b.actorKey !== name) {
      this.dropFisher(b);
      b.actorKey = name;
      b.actor = hasModel(name) ? makeActor(name, HUMAN * 0.9, 'height') : null;
      if (b.actor) {
        b.actor.root.matrixAutoUpdate = false;
        b.actor.mixer.setTime(b.seed);
        this.group.add(b.actor.root);
      }
    }
    const a = b.actor;
    if (!a) return;
    a.root.visible = visible;
    if (!visible) return;
    a.root.matrix.copy(m).multiply(SEAT);
    a.root.matrixWorldNeedsUpdate = true;
    play(a, SIT);
    a.mixer.update(dt);
  }

  private dropFisher(b: Boat) {
    if (b.actor) { b.actor.mixer.stopAllAction(); this.group.remove(b.actor.root); }
    b.actor = null; b.actorKey = '';
  }

  /** Voiliers : longues bordées d'un point du large à l'autre */
  private moveSails(dt: number) {
    const d = this.dummy;
    let n = 0;
    for (const s of this.sails) {
      const dx = s.tx - s.x, dz = s.tz - s.z, dist = Math.hypot(dx, dz);
      if (dist < 0.3) {
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 25, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
          if (x > 2 && z > 2 && x < N - 2 && z < N - 2 && this.openWater(s.x, s.z, x, z, -1)) { s.tx = x; s.tz = z; break; }
        }
      } else {
        s.x += (dx / dist) * dt * 0.7; s.z += (dz / dist) * dt * 0.7;
        s.heading = turn(s.heading, Math.atan2(dx, dz), dt * 0.8);
      }
      d.position.set(s.x, SEA + 0.03 + Math.sin(this.t * 1.2 + s.seed) * 0.02, s.z);
      d.rotation.set(Math.sin(this.t + s.seed) * 0.04, s.heading, 0.12 + Math.sin(this.t * 0.8 + s.seed) * 0.05);
      d.scale.setScalar(1.3);
      d.updateMatrix();
      this.sailsMesh.setMatrixAt(n++, d.matrix);
    }
    this.sailsMesh.count = n;
    this.sailsMesh.instanceMatrix.needsUpdate = true;
  }

  /** Ligne droite entièrement sur l'eau, plus profonde que `depth` (pas de lac : leur eau est plus haute ; pas de faille) */
  private openWater(x0: number, z0: number, x1: number, z1: number, depth: number) {
    const w = this.world, n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4);
    for (let i = 1; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      if (x < 0.5 || z < 0.5 || x > N - 0.5 || z > N - 0.5 || !w.seaAt(x, z, depth)) return false;
    }
    return true;
  }
}
