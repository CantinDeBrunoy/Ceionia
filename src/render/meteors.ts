import * as THREE from 'three';
import { World, N } from '../world/world';
import { Puffs } from './particles';

const MAX_CRATERS = 12, RIM = 7;
/** Le bolide met tant de secondes à traverser le ciel jusqu'au sol */
export const FALL = 2.6;
/** Le cratère fume tant de secondes de jeu, puis s'estompe (le fer céleste reste jusqu'à ce qu'on le ramasse) */
const SMOKE_T = 150, CRATER_T = 260, CRATER_FADE = 40;
const HEAD = new THREE.Color(3.2, 2.2, 1.2), TRAIL = new THREE.Color(2.4, 1.1, 0.35), EMBER = new THREE.Color(2.8, 1.0, 0.25);
const SMOKE = new THREE.Color(0.25, 0.23, 0.22), DIRT = new THREE.Color(0.42, 0.34, 0.25), SPARK = new THREE.Color(1.2, 1.6, 3.2);
const UP = new THREE.Vector3(0, 1, 0);
const SCORCH = new THREE.Color(0.13, 0.11, 0.1), RIMC = new THREE.Color(0.36, 0.3, 0.25);

interface Bolide { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t: number; onHit: () => void; hit: boolean }
interface Crater { x: number; z: number; y: number; t: number; seed: number }

/**
 * Le décor d'une pluie de météorites : des bolides, boules de feu qui traversent le ciel en laissant une traînée et frappent le
 * sol (éclair, onde de choc, gerbe de terre et de braises), les cratères sombres qui fument, et les fers célestes qui luisent
 * au fond (bleutés, ils scintillent pour qu'on les remarque). Rien de logique ici : la pluie est menée par `Calamities`
 */
export class MeteorView {
  group = new THREE.Group();
  private bolides: Bolide[] = [];
  private craters: Crater[] = [];
  private head: THREE.InstancedMesh;
  private scorch: THREE.InstancedMesh;
  private rim: THREE.InstancedMesh;
  private iron: THREE.InstancedMesh;
  private ring: THREE.Mesh;
  private ringT = 99;
  private flash = new THREE.PointLight(0xffb070, 0, 40, 1.3);
  private flashT = 99;
  private puffs = new Puffs(420, 0);
  private dummy = new THREE.Object3D();
  private nrm = new THREE.Vector3();
  private spin = new THREE.Quaternion();
  private t = 0;

  constructor(private world: World) {
    this.head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: HEAD }), 6);
    this.scorch = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 9).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAX_CRATERS);
    this.rim = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), MAX_CRATERS * RIM);
    // le fer céleste : un éclat de métal sombre, facetté, qui luit d'un bleu froid (il rayonne au halo de nuit)
    this.iron = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.5, 0).scale(1, 0.75, 0.85), new THREE.MeshStandardMaterial({ color: 0x3a3f52, metalness: 0.7, roughness: 0.3, flatShading: true, emissive: new THREE.Color(0.25, 0.45, 1.3), emissiveIntensity: 1 }), 24);
    for (const m of [this.head, this.scorch, this.rim, this.iron]) { m.count = 0; m.frustumCulled = false; }
    this.scorch.setColorAt(0, SCORCH);
    this.rim.setColorAt(0, RIMC);
    this.rim.castShadow = this.iron.castShadow = true;
    // l'onde de choc : un anneau posé au sol qui s'élargit et s'efface
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.8), transparent: true, opacity: 0, depthWrite: false }));
    this.ring.frustumCulled = false;
    // (tout est là dès le départ, éteint : rien ne se compile à la première météorite)
    this.group.add(this.head, this.scorch, this.rim, this.iron, this.ring, this.flash, this.puffs.mesh);
  }

  /** Un bolide qui tombe en (x, z) dans `FALL` secondes, venu du ciel de biais ; `onHit` à l'impact */
  fall(x: number, z: number, onHit: () => void) {
    const a = Math.random() * Math.PI * 2, y1 = this.world.hAt(x, z);
    this.bolides.push({ x0: x + Math.cos(a) * 26, y0: y1 + 34, z0: z + Math.sin(a) * 26, x1: x, y1, z1: z, t: 0, onHit, hit: false });
  }

  get busy() { return this.bolides.length > 0; }

  /** L'impact : éclair, onde de choc, gerbe de terre et de braises, cratère qui fume */
  private impact(x: number, z: number, y: number) {
    this.flash.position.set(x, y + 2, z);
    this.flashT = 0;
    this.ring.position.set(x, y + 0.05, z);
    this.ringT = 0;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.5;
      this.puffs.spawn(x, y + 0.1, z, Math.cos(a) * v, 1.5 + Math.random() * 2.5, Math.sin(a) * v, 0.12 + Math.random() * 0.1, 1.2 + Math.random(), i % 3 ? DIRT : EMBER, i % 3 ? 0 : 0.8, { grow: 2, drag: 1.2, wind: 0.1, alpha: 0.9 });
    }
    for (let i = 0; i < 10; i++) this.puffs.spawn(x + (Math.random() - 0.5), y + 0.2, z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, 0.35, 4, SMOKE, 0, { grow: 3.4, drag: 0.3, wind: 0.25, alpha: 0.7 });
    if (this.craters.length >= MAX_CRATERS) this.craters.shift();
    this.craters.push({ x, z, y, t: 0, seed: Math.random() * 10 });
  }

  /** `gdt` : temps de jeu (chute, fumée des cratères) ; `dt` : temps réel (scintillement) ; `irons` : cases des fers à ramasser */
  update(gdt: number, dt: number, irons: readonly number[]) {
    this.t += dt;
    const d = this.dummy, w = this.world;
    // les bolides
    let h = 0;
    for (let i = this.bolides.length - 1; i >= 0; i--) {
      const b = this.bolides[i];
      b.t += Math.min(gdt, dt * 2);
      const k = Math.min(1, b.t / FALL), e = k * k * (0.4 + 0.6 * k);
      const x = b.x0 + (b.x1 - b.x0) * e, y = b.y0 + (b.y1 - b.y0) * e, z = b.z0 + (b.z1 - b.z0) * e;
      if (k >= 1) { this.bolides.splice(i, 1); this.impact(b.x1, b.z1, b.y1); b.onHit(); continue; }
      if (h < 6) {
        d.position.set(x, y, z); d.rotation.set(0, 0, 0); d.scale.setScalar(0.42 + 0.1 * Math.sin(this.t * 40)); d.updateMatrix();
        this.head.setMatrixAt(h++, d.matrix);
      }
      // la traînée : des braises qui restent derrière et s'éteignent
      for (let j = 0; j < 3; j++) this.puffs.spawn(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.3, 0, 0, 0, 0.28 + Math.random() * 0.18, 1.6, TRAIL, 1, { grow: 0.2, drag: 1, wind: 0, alpha: 0.9, fade: 0.15 });
      if (Math.random() < 0.5) this.puffs.spawn(x, y, z, 0, 0.1, 0, 0.6, 3, SMOKE, 0, { grow: 2, drag: 0.6, wind: 0.2, alpha: 0.35 });
    }
    this.head.count = h;
    this.head.instanceMatrix.needsUpdate = true;
    // l'éclair et l'onde de choc
    this.flashT += dt;
    this.flash.intensity = this.flashT < 1.2 ? 60 * Math.max(0, 1 - this.flashT / 1.2) ** 2 : 0;
    this.ringT += dt;
    const ringK = Math.min(1, this.ringT / 1.1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = this.ringT < 1.1 ? 0.8 * (1 - ringK) : 0;
    this.ring.scale.setScalar(0.5 + ringK * 6);
    // les cratères : disque brûlé, rebord de mottes et de pierres, fumée qui monte longtemps
    let s = 0, r = 0;
    for (let i = this.craters.length - 1; i >= 0; i--) {
      const c = this.craters[i];
      c.t += gdt;
      if (c.t > CRATER_T) { this.craters.splice(i, 1); continue; }
      const fade = c.t > CRATER_T - CRATER_FADE ? (CRATER_T - c.t) / CRATER_FADE : 1;
      // le disque brûlé épouse la pente : penché selon le sol autour du point d'impact
      const e = 0.8, gx = (w.hAt(c.x + e, c.z) - w.hAt(c.x - e, c.z)) / (2 * e), gz = (w.hAt(c.x, c.z + e) - w.hAt(c.x, c.z - e)) / (2 * e);
      this.nrm.set(-gx, 1, -gz).normalize();
      d.quaternion.setFromUnitVectors(UP, this.nrm).multiply(this.spin.setFromAxisAngle(UP, c.seed));
      d.position.set(c.x, w.hAt(c.x, c.z) + 0.04, c.z); d.scale.set(2.4 * fade + 0.01, 1, 2.4 * fade + 0.01); d.updateMatrix();
      this.scorch.setMatrixAt(s, d.matrix); this.scorch.setColorAt(s++, SCORCH);
      for (let j = 0; j < RIM; j++) {
        const a = c.seed + (j / RIM) * Math.PI * 2, rr = 1.15 + 0.12 * Math.sin(c.seed * 3 + j), px = c.x + Math.cos(a) * rr, pz = c.z + Math.sin(a) * rr;
        d.position.set(px, w.hAt(px, pz) + 0.03, pz); d.rotation.set(a, a * 1.7, 0); d.scale.setScalar((0.24 + 0.1 * ((j * 5) % 3)) * fade + 0.001); d.updateMatrix();
        this.rim.setMatrixAt(r, d.matrix); this.rim.setColorAt(r++, j % 2 ? RIMC : DIRT);
      }
      if (c.t < SMOKE_T && Math.random() < gdt * 5 * (1 - c.t / SMOKE_T))
        this.puffs.spawn(c.x + (Math.random() - 0.5) * 0.6, c.y + 0.1, c.z + (Math.random() - 0.5) * 0.6, 0, 0.5 + Math.random() * 0.3, 0, 0.3, 5, SMOKE, 0, { grow: 3.6, drag: 0.15, wind: 0.3, alpha: 0.6 });
      if (c.t < 20 && Math.random() < gdt * 3) this.puffs.spawn(c.x + (Math.random() - 0.5) * 0.5, c.y + 0.05, c.z + (Math.random() - 0.5) * 0.5, 0, 0.3, 0, 0.06, 0.8, EMBER, 1, { grow: 0.5, drag: 1, wind: 0, alpha: 0.9 });
    }
    this.scorch.count = s; this.rim.count = r;
    for (const m of [this.scorch, this.rim]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    // les fers célestes à ramasser : posés au fond du cratère, ils tournent un peu et scintillent
    let n = 0;
    for (const k of irons) {
      if (n >= 24) break;
      const x = (k % N) + 0.5, z = Math.floor(k / N) + 0.5, y = w.hAt(x, z);
      d.position.set(x, y + 0.12 + 0.03 * Math.sin(this.t * 2 + k), z); d.rotation.set(0.3, this.t * 0.5 + k, 0.2); d.scale.setScalar(0.42); d.updateMatrix();
      this.iron.setMatrixAt(n++, d.matrix);
      if (Math.random() < dt * 1.5) this.puffs.spawn(x + (Math.random() - 0.5) * 0.3, y + 0.25, z + (Math.random() - 0.5) * 0.3, 0, 0.35, 0, 0.05, 1.1, SPARK, 1, { grow: 0.4, drag: 0.6, wind: 0, alpha: 0.9 });
    }
    this.iron.count = n;
    this.iron.instanceMatrix.needsUpdate = true;
    (this.iron.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + 0.5 * Math.sin(this.t * 3);
    this.puffs.update(dt);
  }
}
