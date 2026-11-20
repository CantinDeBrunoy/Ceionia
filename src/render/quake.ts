import * as THREE from 'three';
import { World } from '../world/world';
import { Puffs } from './particles';

const MAX_ROCKS = 64, MAX_CRACKS = 90;
const ROCK = new THREE.Color(0.5, 0.47, 0.43), ROCK_DARK = new THREE.Color(0.38, 0.35, 0.32), DUST = new THREE.Color(0.7, 0.64, 0.55);
const CRACK = new THREE.Color(0.16, 0.13, 0.11);
/** Les rochers dévalent tant de secondes au plus, restent au pied de la pente, puis s'enfoncent et s'effacent */
const ROLL = 7, STAY = 50, SINK = 6;
/** Les fissures du sol restent tant de secondes, puis se referment */
const CRACK_LIFE = 90, CRACK_CLOSE = 15;

interface Rock { x: number; y: number; z: number; vx: number; vz: number; vy: number; r: number; t: number; spin: number; rest: boolean }
interface Crack { x: number; z: number; a: number; len: number; t: number }

/**
 * Le décor d'un séisme : des rochers qui se détachent des pentes raides et dévalent en rebondissant (poussière dans leur
 * sillage), des fissures en zigzag autour de l'épicentre, qui se referment peu à peu. Rien de logique ici : le séisme est
 * mené par `Calamities`
 */
export class QuakeView {
  group = new THREE.Group();
  private rocks: Rock[] = [];
  private cracks: Crack[] = [];
  private rockMesh: THREE.InstancedMesh;
  private crackMesh: THREE.InstancedMesh;
  private dust = new Puffs(400, 0);
  private dummy = new THREE.Object3D();

  constructor(private world: World) {
    const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 });
    this.rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), mat, MAX_ROCKS);
    this.crackMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_CRACKS);
    for (const m of [this.rockMesh, this.crackMesh]) {
      m.setColorAt(0, ROCK);
      m.count = 0;
      m.frustumCulled = false;
    }
    this.rockMesh.castShadow = true;
    this.group.add(this.rockMesh, this.crackMesh, this.dust.mesh);
  }

  /** Un éboulement depuis ce point de pente : quatre à six rochers */
  rockfall(x: number, z: number) {
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n && this.rocks.length < MAX_ROCKS; i++) {
      const px = x + (Math.random() - 0.5) * 0.8, pz = z + (Math.random() - 0.5) * 0.8;
      this.rocks.push({ x: px, z: pz, y: this.world.hAt(px, pz) + 0.3, vx: 0, vz: 0, vy: 0, r: 0.28 + Math.random() * 0.26, t: -i * 0.35, spin: Math.random() * 6, rest: false });
    }
  }

  /** Les fissures autour de l'épicentre : quelques zigzags de 3 à 6 cases */
  crack(x: number, z: number) {
    for (let b = 0; b < 4; b++) {
      let a = Math.random() * Math.PI * 2, px = x + (Math.random() - 0.5) * 2, pz = z + (Math.random() - 0.5) * 2;
      const segs = 4 + Math.floor(Math.random() * 4);
      for (let s = 0; s < segs && this.cracks.length < MAX_CRACKS; s++) {
        const len = 0.5 + Math.random() * 0.5;
        this.cracks.push({ x: px + Math.cos(a) * len / 2, z: pz + Math.sin(a) * len / 2, a, len, t: -s * 0.12 });
        // la terre qui s'ouvre soulève de la poussière
        this.puff(px, pz, 0.6);
        px += Math.cos(a) * len; pz += Math.sin(a) * len;
        a += (Math.random() - 0.5) * 1.4;
      }
    }
  }

  /** De la poussière qui monte du sol à ce point (bâtiments secoués) */
  puff(x: number, z: number, s = 1) {
    const g = this.world.hAt(x, z);
    for (let i = 0; i < 5; i++) this.dust.spawn(x + (Math.random() - 0.5) * s, g + 0.05, z + (Math.random() - 0.5) * s, (Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.25, (Math.random() - 0.5) * 0.5, 0.22, 2.8, DUST, 0, { grow: 3, drag: 0.5, wind: 0.25, alpha: 0.55 });
  }

  get active() { return this.rocks.length > 0 || this.cracks.length > 0; }

  /** `gdt` : temps de jeu (rochers, fissures) ; `dt` : temps réel (poussière) */
  update(gdt: number, dt: number) {
    const w = this.world, d = this.dummy;
    let n = 0;
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.t += gdt;
      if (r.t < 0) continue;
      if (!r.rest) {
        // il dévale la plus grande pente, prend de la vitesse, rebondit sur les bosses
        const e = 0.3, gx = (w.hAt(r.x + e, r.z) - w.hAt(r.x - e, r.z)) / (2 * e), gz = (w.hAt(r.x, r.z + e) - w.hAt(r.x, r.z - e)) / (2 * e);
        r.vx = (r.vx - gx * 6 * gdt) * (1 - 0.8 * gdt);
        r.vz = (r.vz - gz * 6 * gdt) * (1 - 0.8 * gdt);
        r.x += r.vx * gdt; r.z += r.vz * gdt;
        const ground = w.hAt(r.x, r.z) + r.r * 0.8;
        r.vy -= 9.8 * gdt;
        r.y += r.vy * gdt;
        if (r.y < ground) {
          r.y = ground;
          const v = Math.hypot(r.vx, r.vz);
          r.vy = v > 0.6 ? Math.min(2.2, v * 0.45) : 0;
          if (v > 0.5 && Math.random() < 0.6) this.dust.spawn(r.x, ground - r.r * 0.6, r.z, 0, 0.25, 0, 0.12 + r.r * 0.5, 1.8, DUST, 0, { grow: 2.8, drag: 0.5, wind: 0.2, alpha: 0.5 });
        }
        r.spin += Math.hypot(r.vx, r.vz) * gdt / r.r;
        // à l'arrêt au pied de la pente, sous l'eau, ou au bout du temps : il se pose
        if (r.t > ROLL || (r.t > 1.5 && Math.hypot(r.vx, r.vz) < 0.08) || w.hAt(r.x, r.z) < -0.1) { r.rest = true; r.t = ROLL; r.y = w.hAt(r.x, r.z) + r.r * 0.6; }
      }
      const k = r.t > ROLL + STAY ? 1 - (r.t - ROLL - STAY) / SINK : 1;
      if (k <= 0) { this.rocks.splice(i, 1); continue; }
      d.position.set(r.x, r.y - (1 - k) * r.r * 2, r.z);
      d.rotation.set(r.spin, r.spin * 0.6, 0);
      d.scale.setScalar(r.r * 2);
      d.updateMatrix();
      this.rockMesh.setMatrixAt(n, d.matrix);
      this.rockMesh.setColorAt(n++, i % 3 ? ROCK : ROCK_DARK);
    }
    this.rockMesh.count = n;
    this.rockMesh.instanceMatrix.needsUpdate = true;
    if (this.rockMesh.instanceColor) this.rockMesh.instanceColor.needsUpdate = true;
    // les fissures s'ouvrent l'une après l'autre, puis se referment
    let c = 0;
    for (let i = this.cracks.length - 1; i >= 0; i--) {
      const f = this.cracks[i];
      f.t += gdt;
      if (f.t >= CRACK_LIFE) { this.cracks.splice(i, 1); continue; }
      if (f.t < 0) continue;
      const open = Math.min(1, f.t / 0.3) * (f.t > CRACK_LIFE - CRACK_CLOSE ? (CRACK_LIFE - f.t) / CRACK_CLOSE : 1);
      d.position.set(f.x, w.hAt(f.x, f.z) + 0.012, f.z);
      d.rotation.set(0, -f.a, 0);
      d.scale.set(f.len, 0.03, 0.15 * open + 0.01);
      d.updateMatrix();
      this.crackMesh.setMatrixAt(c, d.matrix);
      this.crackMesh.setColorAt(c++, CRACK);
    }
    this.crackMesh.count = c;
    this.crackMesh.instanceMatrix.needsUpdate = true;
    if (this.crackMesh.instanceColor) this.crackMesh.instanceColor.needsUpdate = true;
    this.dust.update(dt);
  }
}
