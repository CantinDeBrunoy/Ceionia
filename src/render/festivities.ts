import * as THREE from 'three';
import { World } from '../world/world';

/**
 * La fête du retour d'une expédition réussie, au cœur du village, selon l'âge : un grand feu de joie et ses étincelles, une
 * ronde de danseurs, des torches (dès l'Antiquité), des pétales qui tombent (Antiquité), des fusées d'or (Moyen Âge), des
 * lanternes et des confettis (âge industriel), un grand feu d'artifice multicolore (époque moderne). Tout brille assez pour
 * se voir de loin, de jour comme de nuit
 */

const CAP = 6000;
/** couleurs des gerbes, de l'or seul (Moyen Âge) à toutes les couleurs (époque moderne) */
const BURSTS: number[][] = [
  [], [], [0xffc04a, 0xff7a3a], [0xffc04a, 0xff4a4a, 0xf8f4e8, 0x6ad0ff],
  [0xff4a6a, 0x4aa8ff, 0x6aff8a, 0xffd04a, 0xd06aff, 0xff8a3a, 0xf8f4e8],
];
const CONFETTI = [0xff5a6a, 0x4aa8ff, 0x6ad86a, 0xffd04a, 0xd06aff, 0xffffff];
const PETALS = [0xf8c8d8, 0xffffff, 0xf2a6c8];

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: THREE.Color; kind: 'spark' | 'rocket' | 'flake'; drag: number; trail: number }

interface Fest {
  x: number; y: number; z: number; age: number; t: number; dur: number; next: number;
  /** équipes de plus fêtées en même temps : la fête dure et s'intensifie au lieu de s'empiler */
  boost: number;
  group: THREE.Group; flames: THREE.Mesh[]; dancers: THREE.InstancedMesh; lanterns: THREE.Mesh[];
}

/** Petit disque lumineux au bord doux, pour que les étincelles soient rondes */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!, r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.85)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Festivities {
  group = new THREE.Group();
  /** joué à chaque gerbe de feu d'artifice (force 0 … 1), et au début d'une fête autour du feu */
  onBang: ((k: number) => void) | null = null;
  onFeast: ((age: number) => void) | null = null;
  private fests: Fest[] = [];
  private sparks: Particle[] = [];
  private flakes: Particle[] = [];
  private glowPts: THREE.Points;
  private flakePts: THREE.Points;
  private flashPts: THREE.Points;
  private flashes: { x: number; y: number; z: number; t: number; c: THREE.Color }[] = [];
  private flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false });
  private coreMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false });
  private lanternMat = new THREE.MeshBasicMaterial({ color: 0xffd68a, fog: false });
  private woodMat = new THREE.MeshLambertMaterial({ color: 0x6a4a34 });
  private dancerGeo: THREE.BufferGeometry;
  private dancerMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  constructor(private world: World) {
    const mk = (n: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setDrawRange(0, 0);
      return g;
    };
    const tex = dotTexture();
    this.glowPts = new THREE.Points(mk(CAP), new THREE.PointsMaterial({ size: 0.5, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    // l'éclair blanc au cœur de chaque gerbe
    this.flashPts = new THREE.Points(mk(64), new THREE.PointsMaterial({ size: 4, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flashPts.frustumCulled = false;
    this.group.add(this.flashPts);
    this.flakePts = new THREE.Points(mk(CAP / 2), new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false }));
    for (const p of [this.glowPts, this.flakePts]) { p.frustumCulled = false; this.group.add(p); }
    // danseur : jambes, tunique et tête d'un seul tenant, teinté par instance
    const body = new THREE.BoxGeometry(0.06, 0.09, 0.04).translate(0, 0.115, 0);
    const legs = new THREE.BoxGeometry(0.045, 0.07, 0.03).translate(0, 0.035, 0);
    const head = new THREE.BoxGeometry(0.035, 0.035, 0.035).translate(0, 0.18, 0);
    const parts = [legs, body, head].map((g) => g.toNonIndexed());
    const pos: number[] = [];
    for (const g of parts) pos.push(...(g.attributes.position.array as Float32Array));
    this.dancerGeo = new THREE.BufferGeometry();
    this.dancerGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.dancerGeo.computeVertexNormals();
  }

  /** Une fête commence en (x, z) : elle dure une trentaine de secondes */
  start(x: number, z: number, age: number) {
    // une autre équipe rentre pendant la fête : la même fête repart de plus belle, plus longue et plus fournie
    const near = this.fests.find((f) => Math.hypot(f.x - x, f.z - z) < 4);
    if (near) { near.dur = Math.max(near.dur, near.t + 28); near.boost = Math.min(3, near.boost + 1); near.next = Math.min(near.next, 0.3); return; }
    const y = this.world.surfaceAt(x, z), group = new THREE.Group();
    group.position.set(x, y, z);
    this.group.add(group);
    // le feu de joie : bûcher, flammes qui dansent
    const flames: THREE.Mesh[] = [];
    if (age <= 2) {
      for (let i = 0; i < 6; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 5), this.woodMat);
        log.position.set(0, 0.14, 0); log.rotation.set(0.5, (i / 6) * Math.PI * 2, 0, 'YXZ'); log.translateY(0.02);
        group.add(log);
      }
      for (const [r, h, m] of [[0.2, 0.55, this.flameMat], [0.12, 0.7, this.coreMat], [0.1, 0.45, this.flameMat]] as [number, number, THREE.Material][]) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6).translate(0, h / 2, 0), m);
        f.position.y = 0.04;
        group.add(f); flames.push(f);
      }
    }
    // torches autour de la ronde (dès l'Antiquité, jusqu'au Moyen Âge), lanternes en guirlande (âge industriel)
    const lanterns: THREE.Mesh[] = [];
    if (age >= 1 && age <= 2) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.4, 5).translate(0, 0.2, 0), this.woodMat);
      pole.position.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25); group.add(pole);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 5).translate(0, 0.05, 0), this.flameMat);
      f.position.set(pole.position.x, 0.4, pole.position.z); group.add(f); flames.push(f);
    }
    if (age >= 3) for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), this.lanternMat);
      l.position.set(Math.cos(a) * 1.3, 0.55 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * 1.3); group.add(l); lanterns.push(l);
    }
    // la ronde des danseurs, de toutes les couleurs
    const n = 14, dancers = new THREE.InstancedMesh(this.dancerGeo, this.dancerMat, n);
    const cols = [0xd8786c, 0x86c4b8, 0xf2ead8, 0xe8c66a, 0x8e9bb4, 0xc8a0d8, 0x6a8a4a];
    for (let i = 0; i < n; i++) dancers.setColorAt(i, new THREE.Color(cols[i % cols.length]));
    dancers.castShadow = true;
    group.add(dancers);
    this.fests.push({ x, y, z, age, t: 0, dur: age >= 3 ? 34 : 28, next: 1.2, group, flames, dancers, lanterns, boost: 0 });
    if (age <= 2) this.onFeast?.(age);
  }

  get active() { return this.fests.length > 0 || this.sparks.length > 0 || this.flakes.length > 0 || this.flashes.length > 0; }

  update(dt: number) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    for (let i = this.fests.length - 1; i >= 0; i--) {
      const f = this.fests[i];
      f.t += dt;
      const fade = Math.min(1, (f.dur - f.t) / 3);
      // flammes qui vacillent et étincelles qui montent du feu
      f.flames.forEach((m, j) => m.scale.set(1, (0.85 + Math.sin(f.t * 13 + j * 2.1) * 0.12 + Math.sin(f.t * 7.3 + j) * 0.08) * Math.max(0.05, fade), 1));
      if (f.age <= 2 && fade > 0) for (let k = 0; k < 3; k++) if (Math.random() < dt * 30) this.spark(f.x + (Math.random() - 0.5) * 0.2, f.y + 0.4, f.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 0.4, 0xffa040, 0.8 + Math.random() * 0.8, 0.4);
      // la ronde : on tourne, on saute, on lève les bras
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
      const n = f.dancers.count;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + f.t * 0.6, r = 0.75 + Math.sin(f.t * 1.3) * 0.06;
        v.set(Math.cos(a) * r, Math.abs(Math.sin(f.t * 6 + k)) * 0.06 * fade, Math.sin(a) * r);
        e.set(0, -a, Math.sin(f.t * 6 + k) * 0.15);
        f.dancers.setMatrixAt(k, m.compose(v, q.setFromEuler(e), s.setScalar(Math.max(0.01, fade))));
      }
      f.dancers.instanceMatrix.needsUpdate = true;
      f.lanterns.forEach((l, j) => (l.visible = fade > 0.05 && Math.sin(f.t * 2 + j) > -0.95));
      // fusées : de plus en plus nombreuses avec les âges
      const pal = BURSTS[Math.min(4, f.age)];
      if (pal.length && f.t < f.dur - 4) {
        f.next -= dt;
        if (f.next <= 0) {
          const salvo = (f.age >= 4 ? 1 + Math.floor(Math.random() * 3) : 1) + f.boost;
          for (let k = 0; k < salvo; k++) this.rocket(f.x + (Math.random() - 0.5) * 1.6, f.y + 0.2, f.z + (Math.random() - 0.5) * 1.6, pal, f.age);
          f.next = f.age >= 4 ? 0.45 + Math.random() * 0.6 : f.age === 3 ? 0.9 + Math.random() * 0.8 : 1.6 + Math.random() * 1.2;
        }
      }
      // pétales (Antiquité), confettis (âge industriel et moderne) qui tombent sur la place
      if ((f.age === 1 || f.age >= 3) && fade > 0) for (let k = 0; k < 3; k++) if (Math.random() < dt * (f.age >= 3 ? 40 : 25)) {
        const c = (f.age === 1 ? PETALS : CONFETTI)[Math.floor(Math.random() * (f.age === 1 ? PETALS.length : CONFETTI.length))];
        this.flake(f.x + (Math.random() - 0.5) * 2.4, f.y + 1.2 + Math.random() * 0.8, f.z + (Math.random() - 0.5) * 2.4, c);
      }
      if (f.t >= f.dur) {
        this.group.remove(f.group);
        f.group.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry !== this.dancerGeo) o.geometry.dispose(); });
        f.dancers.dispose();
        this.fests.splice(i, 1);
      }
    }
    this.step(dt);
  }

  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, drag = 0.6) {
    if (this.sparks.length >= CAP) return;
    this.sparks.push({ x, y, z, vx, vy, vz, life, max: life, c: new THREE.Color(color), kind: 'spark', drag, trail: 0 });
  }

  private flake(x: number, y: number, z: number, color: number) {
    if (this.flakes.length >= CAP / 2) return;
    this.flakes.push({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: -0.35 - Math.random() * 0.25, vz: (Math.random() - 0.5) * 0.3, life: 5, max: 5, c: new THREE.Color(color), kind: 'flake', drag: 0, trail: Math.random() * 6 });
  }

  private rocket(x: number, y: number, z: number, pal: number[], age: number) {
    if (this.sparks.length >= CAP) return;
    const c = pal[Math.floor(Math.random() * pal.length)];
    this.sparks.push({ x, y, z, vx: (Math.random() - 0.5) * 0.8, vy: 6.4 + Math.random() * 1.6 + age * 0.2, vz: (Math.random() - 0.5) * 0.8, life: 1.6 + Math.random() * 0.5, max: 10, c: new THREE.Color(c), kind: 'rocket', drag: 0, trail: age });
  }

  /** La gerbe d'une fusée : sphère d'étincelles, anneau, ou saule qui retombe en pluie d'or */
  private burst(p: Particle) {
    const age = p.trail, n = age >= 4 ? 170 + Math.floor(Math.random() * 80) : age === 3 ? 120 : 80;
    this.flashes.push({ x: p.x, y: p.y, z: p.z, t: 0, c: p.c.clone().lerp(new THREE.Color(0xffffff), 0.6) });
    const shape = Math.random(), speed = 3.4 + Math.random() * 1.8 + age * 0.3, second = age >= 4 && Math.random() < 0.4 ? BURSTS[4][Math.floor(Math.random() * 7)] : -1;
    for (let i = 0; i < n; i++) {
      let dx: number, dy: number, dz: number;
      if (shape < 0.25 && age >= 3) { const a = (i / n) * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a) * 0.35; dz = Math.sin(a); }
      else { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); dx = r * Math.cos(a); dy = u; dz = r * Math.sin(a); }
      const sp = speed * (0.85 + Math.random() * 0.3), willow = shape > 0.8;
      this.spark(p.x, p.y, p.z, dx * sp, dy * sp, dz * sp, second >= 0 && i % 2 ? second : p.c.getHex(), willow ? 2.8 + Math.random() : 1.7 + Math.random() * 0.8, willow ? 1.6 : 0.9);
    }
    this.onBang?.(age >= 4 ? 0.8 : 0.6);
  }

  private step(dt: number) {
    const sp = this.glowPts.geometry, pos = sp.attributes.position as THREE.BufferAttribute, col = sp.attributes.color as THREE.BufferAttribute;
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.kind === 'rocket') {
        p.vy -= 4 * dt;
        // traînée dorée sous la fusée
        for (let t = 0; t < 2; t++) this.spark(p.x, p.y, p.z, (Math.random() - 0.5) * 0.25, -0.4, (Math.random() - 0.5) * 0.25, 0xffc87a, 0.6, 2);
        if (p.life <= 0 || p.vy < 1.2) { this.burst(p); this.sparks.splice(i, 1); continue; }
      } else {
        p.vy -= 1.6 * dt;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d; p.vz *= d;
        if (p.life <= 0) { this.sparks.splice(i, 1); continue; }
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (n >= CAP) continue;
      const k = p.kind === 'rocket' ? 1 : Math.min(1, (p.life / p.max) * 1.6) * (0.75 + Math.random() * 0.25);
      pos.setXYZ(n, p.x, p.y, p.z); col.setXYZ(n, p.c.r * k, p.c.g * k, p.c.b * k); n++;
    }
    sp.setDrawRange(0, n); pos.needsUpdate = true; col.needsUpdate = true;
    const fg = this.flakePts.geometry, fpos = fg.attributes.position as THREE.BufferAttribute, fcol = fg.attributes.color as THREE.BufferAttribute;
    let m = 0;
    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const p = this.flakes[i];
      p.life -= dt; p.trail += dt * 3;
      const ground = this.world.surfaceAt(p.x, p.z) + 0.02;
      if (p.y > ground) { p.x += (p.vx + Math.sin(p.trail) * 0.25) * dt; p.y += p.vy * dt; p.z += (p.vz + Math.cos(p.trail * 0.8) * 0.25) * dt; } else p.y = ground;
      if (p.life <= 0) { this.flakes.splice(i, 1); continue; }
      fpos.setXYZ(m, p.x, p.y, p.z); fcol.setXYZ(m, p.c.r, p.c.g, p.c.b); m++;
    }
    fg.setDrawRange(0, m); fpos.needsUpdate = true; fcol.needsUpdate = true;
    const hg = this.flashPts.geometry, hpos = hg.attributes.position as THREE.BufferAttribute, hcol = hg.attributes.color as THREE.BufferAttribute;
    let h = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      if (f.t > 0.25 || h >= 64) { this.flashes.splice(i, 1); continue; }
      const k = 1 - f.t / 0.25;
      hpos.setXYZ(h, f.x, f.y, f.z); hcol.setXYZ(h, f.c.r * k, f.c.g * k, f.c.b * k); h++;
    }
    hg.setDrawRange(0, h); hpos.needsUpdate = true; hcol.needsUpdate = true;
  }
}
