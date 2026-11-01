import * as THREE from 'three';
import { World, N, VolcanoFrame } from '../world/world';
import { smoothstep } from '../core/rng';
import { Puffs } from './particles';

/** Durée d'une éruption (s) : grondement, paroxysme, puis la lave s'essouffle */
export const ERUPTION_DUR = 16;
const MAX_BOMBS = 320, MAX_PUFFS = 180;
const GRAVITY = 9.8;
const HOT = new THREE.Color(2.6, 1, 0.22), BASALT = new THREE.Color(0.16, 0.13, 0.12);

/** Bombe de lave (ou goutte de la fontaine) : vole, retombe, refroidit puis s'efface */
interface Bomb { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; landed: number; spin: number; spray: boolean }
/**
 * Coulée de lave : ruban drapé sur le flanc, dont le front avance puis qui refroidit et s'efface ; les cases qu'il recouvre
 * (triées le long de la coulée) deviennent des champs de lave refroidie
 */
interface Flow {
  mesh: THREE.Mesh; len: number; delay: number; speed: number;
  u: { uFront: { value: number }; uCool: { value: number }; uFade: { value: number } };
  cells: number[]; cellD: number[]; covered: number;
}
interface Eruption { cell: number; f: VolcanoFrame; t: number; flows: Flow[]; bombAcc: number; sprayAcc: number; ashAcc: number; blast: boolean }

/** Force de l'éruption : rien pendant le grondement, explosion, paroxysme puis déclin */
const power = (t: number) => (t < 1.2 ? 0 : t < 2 ? (t - 1.2) / 0.8 : t < ERUPTION_DUR * 0.55 ? 1 : Math.max(0, 1 - (t - ERUPTION_DUR * 0.55) / (ERUPTION_DUR * 0.45)));
/** Secousses : montent pendant le grondement, suivent ensuite la force */
const rumble = (t: number) => (t < 1.2 ? t / 1.2 : power(t));

/**
 * Éruptions volcaniques, déclenchées d'un clic sur un volcan : bombes de lave et fontaine au-dessus du cratère, panache de cendres,
 * coulées qui descendent les flancs, lueur orangée ; purement visuel (le relief ne change pas)
 */
export class Eruptions {
  group = new THREE.Group();
  /** une bombe de lave retombe sur une case (pour mettre le feu à un bâtiment) */
  onImpact: ((k: number) => void) | null = null;
  private list: Eruption[] = [];
  private bombs: Bomb[] = [];
  private puffs = new Puffs(MAX_PUFFS);
  private bombMesh: THREE.InstancedMesh;
  private light = new THREE.PointLight(0xff7a30, 0, 36, 1.4);
  private uTime = { value: 0 };
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();

  constructor(private world: World) {
    this.bombMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_BOMBS);
    // couleur par instance dès la création (le shader en tient compte), particules mobiles : pas de culling
    this.bombMesh.setColorAt(0, this.col.setRGB(1, 1, 1));
    this.bombMesh.count = 0;
    this.bombMesh.frustumCulled = false;
    this.bombMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // la lumière existe dès le départ (éteinte) : l'allumer ne recompile pas les matériaux de la scène
    this.group.add(this.bombMesh, this.puffs.mesh, this.light);
  }

  /** Lance l'éruption du volcan posé sur la case ; false s'il est déjà en éruption */
  start(cell: number) {
    if (this.list.some((e) => e.cell === cell && e.t < ERUPTION_DUR)) return false;
    const f = this.world.volcanoFrame(cell % N, Math.floor(cell / N));
    const e: Eruption = { cell, f, t: 0, flows: [], bombAcc: 0, sprayAcc: 0, ashAcc: 0, blast: false };
    // des coulées sur plusieurs flancs, l'une après l'autre
    const n = f.r > 12 ? 4 : 3, a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const flow = this.flow(f, a0 + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.8, 2.2 + i * 1.4 + Math.random());
      if (flow) { e.flows.push(flow); this.group.add(flow.mesh); }
    }
    this.list.push(e);
    return true;
  }

  get active() { return this.list.some((e) => e.t < ERUPTION_DUR); }

  /** Volcan en éruption dont les animaux s'enfuient : centre et rayon */
  alarm(): { x: number; z: number; r: number } | null {
    const e = this.list.find((q) => q.t < ERUPTION_DUR);
    return e ? { x: e.f.x, z: e.f.z, r: e.f.r + 6 } : null;
  }

  /** Secousse ressentie au point visé par la caméra (0 … 1) */
  shakeAt(x: number, z: number) {
    let s = 0;
    for (const e of this.list) if (e.t < ERUPTION_DUR) s = Math.max(s, rumble(e.t) * (1 - smoothstep(15, 70, Math.hypot(x - e.f.x, z - e.f.z))));
    return s;
  }

  update(dt: number) {
    this.uTime.value += dt;
    let glow = 0, gx = 0, gy = 0, gz = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i], f = e.f;
      e.t += dt;
      const p = power(e.t), live = e.t < ERUPTION_DUR;
      // explosion d'ouverture
      if (!e.blast && e.t >= 1.2) {
        e.blast = true;
        for (let k = 0; k < 45; k++) this.launch(f, false);
        for (let k = 0; k < 14; k++) this.ash(f, 1.6);
      }
      if (live) {
        // tirs par salves, fontaine continue, panache nourri dès le grondement
        e.bombAcc += dt * 18 * p * (0.5 + 0.9 * Math.max(0, Math.sin(e.t * 2.3)));
        e.sprayAcc += dt * 45 * p;
        e.ashAcc += dt * (p > 0 ? 11 * p + 2 : 3);
        for (; e.bombAcc >= 1; e.bombAcc--) this.launch(f, false);
        for (; e.sprayAcc >= 1; e.sprayAcc--) this.launch(f, true);
        for (; e.ashAcc >= 1; e.ashAcc--) this.ash(f, p);
      }
      // coulées : le front avance tant que le volcan crache, puis la lave refroidit et s'efface
      for (let k = e.flows.length - 1; k >= 0; k--) {
        const fl = e.flows[k], u = fl.u;
        if (e.t > fl.delay && e.t < ERUPTION_DUR + 2) u.uFront.value = Math.min(fl.len, u.uFront.value + fl.speed * dt);
        // le sol que la lave a recouvert reste un champ de basalte
        for (; fl.covered < fl.cells.length && fl.cellD[fl.covered] <= u.uFront.value; fl.covered++) this.world.coverLava(fl.cells[fl.covered]);
        if (e.t > ERUPTION_DUR) u.uCool.value = Math.min(1, u.uCool.value + dt / 10);
        if (e.t > ERUPTION_DUR + 14) u.uFade.value = Math.max(0, u.uFade.value - dt / 4);
        if (u.uFade.value <= 0) {
          this.group.remove(fl.mesh);
          fl.mesh.geometry.dispose();
          (fl.mesh.material as THREE.Material).dispose();
          e.flows.splice(k, 1);
        }
      }
      // la lueur suit l'éruption la plus forte, puis les coulées tant qu'elles sont chaudes
      const hot = e.flows.reduce((a, fl) => Math.max(a, fl.u.uFront.value > 0 ? 1 - fl.u.uCool.value : 0), 0) * 0.35;
      const g = Math.max(p, hot);
      if (g > glow) { glow = g; gx = f.x; gy = f.rim + 1.5; gz = f.z; }
      if (e.t > ERUPTION_DUR && !e.flows.length) this.list.splice(i, 1);
    }
    this.light.position.set(gx, gy, gz);
    this.light.intensity = glow * (55 + 20 * Math.sin(this.uTime.value * 13) * Math.sin(this.uTime.value * 7.3));
    this.stepBombs(dt);
    this.puffs.update(dt);
  }

  /** Projette une bombe de lave (ou une goutte de la fontaine) depuis le fond du cratère */
  private launch(f: VolcanoFrame, spray: boolean) {
    if (this.bombs.length >= MAX_BOMBS) return;
    const a = Math.random() * Math.PI * 2, s = Math.max(0.6, f.r / 9);
    const hs = spray ? 0.3 + Math.random() * 1.1 : (1 + Math.random() * 3.4) * s;
    const vy = spray ? 4 + Math.random() * 3.5 : (6.5 + Math.random() * 5) * Math.sqrt(s);
    this.bombs.push({
      x: f.x + Math.cos(a) * 0.3, y: f.floor + 0.4, z: f.z + Math.sin(a) * 0.3,
      vx: Math.cos(a) * hs, vy, vz: Math.sin(a) * hs,
      size: spray ? 0.1 + Math.random() * 0.1 : 0.16 + Math.random() * 0.22, landed: -1, spin: Math.random() * 6, spray,
    });
  }

  /** Bouffée du panache, rougeoyante à la sortie du cratère */
  private ash(f: VolcanoFrame, p: number) {
    const g = 0.24 + Math.random() * 0.2;
    this.puff(f.x + (Math.random() - 0.5) * 1.2, f.rim + 0.2, f.z + (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.5, 2.2 + Math.random() * 2 + p * 1.2, (Math.random() - 0.5) * 1.5,
      0.6 + Math.random() * 0.9, 7 + Math.random() * 3, this.col.setRGB(g, g * 0.95, g * 0.93), 0.4 + p * 0.6);
  }

  private puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, col: THREE.Color, glow: number) {
    this.puffs.spawn(x, y, z, vx, vy, vz, size, life, col, glow);
  }

  private stepBombs(dt: number) {
    const w = this.world, d = this.dummy, m = this.bombMesh;
    let n = 0;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      let k = 0;
      if (b.landed < 0) {
        b.vy -= GRAVITY * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.spin += dt * 6;
        const out = b.x < 0 || b.z < 0 || b.x > N || b.z > N;
        const ground = w.hAt(b.x, b.z);
        if (out || b.y <= ground) {
          b.y = ground; b.landed = 0;
          // dans l'eau : un nuage de vapeur ; sur la terre : un peu de poussière
          if (out || ground < 0.02) {
            if (!out && !b.spray) this.puff(b.x, 0.1, b.z, 0, 1.2, 0, 0.35, 1.6, this.col.setRGB(0.95, 0.95, 0.95), 0);
            this.bombs.splice(i, 1);
            continue;
          }
          if (!b.spray && b.size > 0.26) this.onImpact?.(Math.floor(b.z) * N + Math.floor(b.x));
          if (!b.spray && Math.random() < 0.5) this.puff(b.x, b.y + 0.1, b.z, 0, 0.6, 0, 0.35, 1.2, this.col.setRGB(0.42, 0.36, 0.32), 0.2);
        }
      } else {
        b.landed += dt;
        // les gouttes de la fontaine se perdent dans le lac de lave ; les bombes refroidissent sur le flanc
        if (b.landed > (b.spray ? 0.4 : 5)) { this.bombs.splice(i, 1); continue; }
        k = b.spray ? b.landed / 0.4 : Math.min(1, b.landed / 2.5);
      }
      const shrink = b.spray ? 1 - k : 1 - smoothstep(3.5, 5, b.landed);
      d.position.set(b.x, b.y + (b.landed >= 0 ? b.size * 0.25 : 0), b.z);
      d.rotation.set(b.spin, b.spin * 0.7, 0);
      d.scale.setScalar(b.size * Math.max(0.01, shrink));
      d.updateMatrix();
      m.setMatrixAt(n, d.matrix);
      m.setColorAt(n++, this.col.copy(HOT).lerp(BASALT, b.spray ? 0 : k));
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** Coulée : part du rebord dans la direction donnée et suit la ligne de plus grande pente jusqu'au pied du cône */
  private flow(f: VolcanoFrame, dir: number, delay: number): Flow | null {
    const w = this.world;
    let r0 = 1.5, top = -Infinity;
    for (let q = 1.5; q <= 5; q += 0.25) {
      const h = w.hAt(f.x + Math.cos(dir) * q, f.z + Math.sin(dir) * q);
      if (h > top) { top = h; r0 = q; }
    }
    let x = f.x + Math.cos(dir) * r0, z = f.z + Math.sin(dir) * r0, dx = Math.cos(dir), dz = Math.sin(dir);
    const pts: [number, number][] = [[x, z]];
    // la lave s'étale un peu au-delà du pied du cône, sans traverser toute l'île
    const maxLen = f.r * 1.2 + 3;
    for (let i = 0; i < maxLen / 0.35; i++) {
      const e = 0.3, gx = (w.hAt(x + e, z) - w.hAt(x - e, z)) / (2 * e), gz = (w.hAt(x, z + e) - w.hAt(x, z - e)) / (2 * e), g = Math.hypot(gx, gz);
      // la lave suit la pente, avec un peu d'élan et de méandres
      if (g > 0.04) { dx = dx * 0.55 - (gx / g) * 0.45; dz = dz * 0.55 - (gz / g) * 0.45; }
      const wob = (Math.random() - 0.5) * 0.3, c = Math.cos(wob), s = Math.sin(wob);
      [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      x += dx * 0.35; z += dz * 0.35;
      if (x < 0.5 || z < 0.5 || x > N - 0.5 || z > N - 0.5) break;
      pts.push([x, z]);
      const h = w.hAt(x, z);
      if (h < 0.05 || (h < f.foot + 0.25 && g < 0.15)) break;
    }
    if (pts.length < 4) return null;
    // ruban de trois sommets de large, drapé sur le relief, qui s'élargit en descendant
    const n = pts.length, pos = new Float32Array(n * 9), along = new Float32Array(n * 3), side = new Float32Array(n * 3);
    const under = new Map<number, number>();
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const [px, pz] = pts[i], [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(n - 1, i + 1)];
      if (i > 0) dist += Math.hypot(px - ax, pz - az);
      const tx = bx - ax, tz = bz - az, tl = Math.hypot(tx, tz) || 1, hw = 0.26 + 0.24 * (i / (n - 1));
      for (let j = 0; j < 3; j++) {
        const o = (j - 1) * hw, vx = px - (tz / tl) * o, vz = pz + (tx / tl) * o, k = i * 3 + j;
        pos[k * 3] = vx; pos[k * 3 + 1] = w.hAt(vx, vz) + 0.07; pos[k * 3 + 2] = vz;
        along[k] = dist; side[k] = j - 1;
        const cx = Math.floor(vx), cz = Math.floor(vz);
        if (cx >= 0 && cz >= 0 && cx < N && cz < N && !under.has(cz * N + cx)) under.set(cz * N + cx, dist);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < 2; j++) {
        const a = i * 3 + j, b = a + 1, c = a + 3, d = a + 4;
        idx.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const u = { uFront: { value: 0 }, uCool: { value: 0 }, uFade: { value: 1 } };
    const mesh = new THREE.Mesh(geo, flowMaterial(u, this.uTime));
    mesh.renderOrder = 2;
    const cells = [...under.keys()].sort((a, b) => under.get(a)! - under.get(b)!);
    return { mesh, len: dist, delay, speed: 0.9 + Math.random() * 0.5, u, cells, cellD: cells.map((c) => under.get(c)!), covered: 0 };
  }
}

/** Lave en fusion : jaune et orange qui ondulent, croûte sombre veinée de rouge en refroidissant ; rien au-delà du front */
function flowMaterial(u: Flow['u'], uTime: { value: number }) {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uTime });
    sh.vertexShader = 'attribute float aAlong;\nattribute float aSide;\nvarying float vAlong;\nvarying float vSide;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vAlong = aAlong; vSide = aSide;`);
    sh.fragmentShader = 'uniform float uFront;\nuniform float uCool;\nuniform float uFade;\nuniform float uTime;\nvarying float vAlong;\nvarying float vSide;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  if (vAlong > uFront) discard;
  float behind = uFront - vAlong;
  float flick = 0.5 + 0.5 * sin(vAlong * 4.0 - uTime * 2.5 + vSide * 2.0);
  vec3 hot = mix(vec3(1.5, 0.4, 0.06), vec3(1.7, 1.0, 0.3), flick * 0.55 + smoothstep(1.2, 0.0, behind) * 0.45);
  float vein = smoothstep(0.8, 1.0, sin(vAlong * 6.3 + sin(vSide * 3.0 + vAlong) * 2.0) * 0.5 + 0.5);
  vec3 crust = mix(vec3(0.14, 0.11, 0.1), hot * 0.7, vein * (1.0 - uCool));
  diffuseColor.rgb = mix(hot * 1.6, crust, smoothstep(0.0, 1.0, clamp(uCool * 1.2 + behind * 0.04 - 0.1, 0.0, 1.0)));
  diffuseColor.a *= uFade * (1.0 - smoothstep(0.7, 1.0, abs(vSide)));`);
  };
  m.customProgramCacheKey = () => 'lavaflow';
  return m;
}
