import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, N, SEA } from '../world/world';
import { Building } from '../build/catalog';
import { makeActor, play, hasModel, Actor, AGE_VILLAGERS, SIT, HUMAN } from './assets';

const MAX_CARTS = 10, MAX_BOATS = 16, MAX_SAILS = 5;

interface Vehicle { path: number[]; i: number; x: number; z: number; heading: number; wait: number }
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

/** Charrette tirée par un cheval (âges antique à industriel) ou petite voiture (âge moderne) ; avant = +z */
function vehicleGeo(age: number) {
  const wheel = (x: number, z: number, r: number) => new THREE.CylinderGeometry(r, r, 0.025, 8).rotateZ(Math.PI / 2).translate(x, r, z);
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
    if (w.version !== this.builtVersion || age !== this.builtAge || Math.floor(pop / 10) !== this.builtPop) { this.builtPop = Math.floor(pop / 10); this.refresh(age, pop); }
    const day = hour > 6 && hour < 21;
    this.moveCarts(dt, day);
    this.moveBoats(dt, day);
    this.moveSails(dt);
  }

  /** Recensement : routes, pontons et large ; nombre de véhicules selon la population et l'âge */
  private refresh(age: number, pop: number) {
    const w = this.world;
    if (age !== this.builtAge) {
      this.carts.geometry.dispose();
      this.carts.geometry = vehicleGeo(age);
    }
    this.builtVersion = w.version; this.builtAge = age; this.age = age;
    this.roads = [];
    for (let k = 0; k < N * N; k++) if (w.road[k]) this.roads.push(k);
    const nCarts = age >= 1 && pop >= 8 ? Math.min(MAX_CARTS, Math.floor(this.roads.length / 18)) : 0;
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
      if (!day) continue;
      if (v.i >= v.path.length) {
        v.wait -= dt;
        if (v.wait > 0) { this.place(v, n++); continue; }
        const start = Math.floor(v.z) * N + Math.floor(v.x), goal = this.roads[Math.floor(Math.random() * this.roads.length)];
        v.path = this.roadPath(start, goal) ?? [];
        v.i = 0; v.wait = 2 + Math.random() * 6;
      }
      const c = v.path[v.i];
      if (c === undefined) { this.place(v, n++); continue; }
      const [cx, cz] = this.world.passPoint(v.path, v.i);
      // tenir sa droite : décalage perpendiculaire au sens de marche
      const hx = Math.sin(v.heading), hz = Math.cos(v.heading), tx = cx - hz * 0.14, tz = cz + hx * 0.14;
      const dx = tx - v.x, dz = tz - v.z, dist = Math.hypot(dx, dz), step = dt * (this.builtAge >= 4 ? 1.6 : 0.8);
      if (dist <= step) { v.x = tx; v.z = tz; v.i++; }
      else {
        v.x += (dx / dist) * step; v.z += (dz / dist) * step;
        v.heading = turn(v.heading, Math.atan2(dx, dz), dt * 6);
      }
      this.place(v, n++);
    }
    this.carts.count = n;
    this.carts.instanceMatrix.needsUpdate = true;
  }

  private place(v: Vehicle, i: number) {
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
        if (nx < 0 || nz < 0 || nx >= N || nz >= N || !w.road[k] || prev.has(k)) continue;
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
