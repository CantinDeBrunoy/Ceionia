import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const BASE_C = new THREE.Color(1, 1, 1), FIRE_C = new THREE.Color(1.6, 0.55, 0.25), EMBER_C = new THREE.Color(1, 0.5, 0.15);

/**
 * Effets des combats : étincelles d'un coup porté (or pour une lame, blanches pour un choc, rouges pour une morsure), éclair
 * d'un coup de feu, poussière soulevée ; et lances des chasseurs qui volent en arc, puis restent plantées un moment. À
 * l'époque moderne : balles traçantes qui filent, souffle du canon des chars et explosion de l'obus
 */

const CAP = 1500;
/** Flèches en vol au plus */
const ARROWS = 128;
/** Densité des étincelles et de la poussière (qualité graphique : réduite, elles se font plus rares ; les flèches restent) */
let density = 1;
export function setFxDensity(d: number) { density = Math.max(0.35, Math.min(1, d)); }
const few = (n: number) => Math.max(1, Math.round(n * density));
interface Arrow { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t: number; dur: number; arc: number; fire: boolean }

/** `fly` : sans pesanteur (traçante) ; `big` : grosse lueur (bouche du canon, explosion) */
interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: THREE.Color; dust: boolean; fly?: boolean; big?: boolean }
interface Spear { mesh: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; stuck: number; onLand: (() => void) | null }

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!, r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class CombatFx {
  group = new THREE.Group();
  /** joué à chaque coup qui porte (lame, morsure) et à chaque coup de feu, au plus quelques fois par seconde */
  onClash: ((kind: 'blade' | 'shot' | 'bite') => void) | null = null;
  private sparks: Spark[] = [];
  private spears: Spear[] = [];
  private glow: THREE.Points;
  private dust: THREE.Points;
  private flare: THREE.Points;
  private soundT = 0;
  private shaftMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  private tipMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc4 });

  constructor() {
    const mk = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAP * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CAP * 3), 3));
      g.setDrawRange(0, 0);
      return g;
    };
    const tex = dotTexture();
    this.glow = new THREE.Points(mk(), new THREE.PointsMaterial({ size: 0.09, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.dust = new THREE.Points(mk(), new THREE.PointsMaterial({ size: 0.12, map: tex, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.7 }));
    this.flare = new THREE.Points(mk(), new THREE.PointsMaterial({ size: 0.34, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    for (const p of [this.glow, this.dust, this.flare]) { p.frustumCulled = false; this.group.add(p); }
    // les flèches : hampe de bois, pointe de fer, empennage blanc (le long de +z), toutes en un maillage instancié
    const part = (g: THREE.BufferGeometry, c: number) => {
      const n = g.index ? g.toNonIndexed() : g, col = new THREE.Color(c), a = new Float32Array(n.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; }
      n.deleteAttribute('uv'); n.deleteAttribute('normal');
      n.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return n;
    };
    const geo = mergeGeometries([
      part(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 4).rotateX(Math.PI / 2), 0x8a6238),
      part(new THREE.ConeGeometry(0.026, 0.07, 4).rotateX(Math.PI / 2).translate(0, 0, 0.2), 0xd8dce2),
      part(new THREE.BoxGeometry(0.06, 0.005, 0.07).translate(0, 0, -0.15), 0xf4f0e6),
      part(new THREE.BoxGeometry(0.005, 0.06, 0.07).translate(0, 0, -0.15), 0xd84a3e),
    ])!;
    geo.computeVertexNormals();
    this.arrowMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), ARROWS);
    this.arrowMesh.count = 0;
    this.arrowMesh.frustumCulled = false;
    this.arrowMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.group.add(this.arrowMesh);
  }

  private arrows: Arrow[] = [];
  private arrowMesh: THREE.InstancedMesh;
  private am = new THREE.Matrix4();
  private aq = new THREE.Quaternion();
  private av = new THREE.Vector3();
  private aw = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private fwd = new THREE.Vector3(0, 0, 1);

  /**
   * Une flèche tirée de (x0, y0, z0) vers (x1, y1, z1) : elle vole en cloche, pointe en avant, et se plante dans un petit
   * nuage (une flèche de feu des démons : rougeoyante, une traînée de braises, une gerbe à l'impact)
   */
  arrow(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, fire = false) {
    if (this.arrows.length >= ARROWS) this.arrows.shift();
    const d = Math.hypot(x1 - x0, z1 - z0);
    this.arrows.push({ x0, y0, z0, x1, y1, z1, t: 0, dur: Math.max(0.25, d / 9), arc: Math.min(1.4, d * 0.16), fire });
  }

  private stepArrows(dt: number) {
    const m = this.am, v = this.av, w = this.aw, q = this.aq, white = BASE_C, fire = FIRE_C;
    let n = 0;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.t += dt;
      const u = Math.min(1, a.t / a.dur), at = (k: number, out: THREE.Vector3) => out.set(a.x0 + (a.x1 - a.x0) * k, a.y0 + (a.y1 - a.y0) * k + Math.sin(k * Math.PI) * a.arc, a.z0 + (a.z1 - a.z0) * k);
      if (u >= 1) {
        // à l'impact : un éclat (de feu, ou de bois et de poussière)
        if (a.fire) this.hit(a.x1, a.y1, a.z1, 0xff7a2a, 6, 'bite'); else { this.chips(a.x1, a.y1, a.z1, 0xf4f0e6, 3); this.flash(a.x1, a.y1, a.z1, 0xfff0c0); }
        this.arrows.splice(i, 1);
        continue;
      }
      at(u, v); at(Math.min(1, u + 0.04), w);
      q.setFromUnitVectors(this.fwd, w.sub(v).normalize());
      this.arrowMesh.setMatrixAt(n, m.compose(v, q, this.one));
      this.arrowMesh.setColorAt(n, a.fire ? fire : white);
      n++;
      if (a.fire && this.sparks.length < CAP && Math.random() < 0.6) this.sparks.push({ x: v.x, y: v.y, z: v.z, vx: 0, vy: 0.2, vz: 0, life: 0.18, max: 0.18, c: EMBER_C, dust: false, fly: true });
    }
    this.arrowMesh.count = n;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
    if (this.arrowMesh.instanceColor) this.arrowMesh.instanceColor.needsUpdate = true;
  }

  private sound(kind: 'blade' | 'shot' | 'bite') {
    if (this.soundT > 0) return;
    this.soundT = 0.12;
    this.onClash?.(kind);
  }

  /** Un coup qui porte en (x, y, z) : gerbe d'étincelles (couleur, nombre), un petit éclair au point d'impact */
  hit(x: number, y: number, z: number, color = 0xffd27a, n = 14, kind: 'blade' | 'shot' | 'bite' = 'blade') {
    const c = new THREE.Color(color);
    n = few(n);
    for (let i = 0; i < n && this.sparks.length < CAP; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 0.8 + 0.2, sp = 0.6 + Math.random() * 0.9;
      this.sparks.push({ x, y, z, vx: Math.cos(a) * sp * u, vy: 0.5 + Math.random() * 1.1, vz: Math.sin(a) * sp * u, life: 0.25 + Math.random() * 0.3, max: 0.55, c, dust: false });
    }
    this.flash(x, y, z, color);
    this.sound(kind);
  }

  /** Éclair bref : la bouche d'un fusil, le choc d'une lame */
  flash(x: number, y: number, z: number, color = 0xffe8a0) {
    const c = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5);
    for (let i = 0; i < 4 && this.sparks.length < CAP; i++) this.sparks.push({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.08, max: 0.08, c, dust: false });
  }

  /** Coup de feu : éclair à la bouche du canon, traînée jusqu'à la cible, impact */
  shot(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number) {
    this.flash(fx, fy, fz, 0xfff0b0);
    const c = new THREE.Color(0xfff0c0);
    for (let i = 1; i < 8 && this.sparks.length < CAP; i++) {
      const u = i / 8;
      this.sparks.push({ x: fx + (tx - fx) * u, y: fy + (ty - fy) * u, z: fz + (tz - fz) * u, vx: 0, vy: 0, vz: 0, life: 0.06, max: 0.06, c, dust: false });
    }
    this.hit(tx, ty, tz, 0xffc070, 8, 'shot');
  }

  /** Balle traçante : un trait lumineux qui file de la bouche de l'arme jusqu'à la cible, à `speed` cases par seconde */
  tracer(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, color = 0xffc86a, speed = 11) {
    const dx = tx - fx, dy = ty - fy, dz = tz - fz, d = Math.hypot(dx, dy, dz) || 1, life = d / speed, c = new THREE.Color(color);
    for (let i = 0; i < 5 && this.sparks.length < CAP; i++) {
      const back = i * 0.035;
      this.sparks.push({ x: fx - (dx / d) * back, y: fy - (dy / d) * back, z: fz - (dz / d) * back, vx: (dx / d) * speed, vy: (dy / d) * speed, vz: (dz / d) * speed, life: life + back / speed, max: life + 0.05, c, dust: false, fly: true });
    }
  }

  /** Coup de canon : grosse lueur à la bouche, gerbe d'étincelles et fumée chassées vers l'avant (dx, dz) */
  blast(x: number, y: number, z: number, dx: number, dz: number) {
    const c = new THREE.Color(0xffe2a0), l = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 3 && this.sparks.length < CAP; i++) this.sparks.push({ x: x + (dx / l) * i * 0.05, y, z: z + (dz / l) * i * 0.05, vx: 0, vy: 0, vz: 0, life: 0.1, max: 0.1, c, dust: false, big: true });
    for (let i = 0; i < 16 && this.sparks.length < CAP; i++) {
      const a = (Math.random() - 0.5) * 1.1, sp = 1.5 + Math.random() * 2.5, ca = Math.cos(a), sa = Math.sin(a), ux = (dx * ca - dz * sa) / l, uz = (dx * sa + dz * ca) / l;
      this.sparks.push({ x, y, z, vx: ux * sp, vy: Math.random() * 0.8, vz: uz * sp, life: 0.12 + Math.random() * 0.15, max: 0.27, c, dust: false });
    }
    this.puff(x + (dx / l) * 0.1, y, z + (dz / l) * 0.1, 10);
    this.sound('shot');
  }

  /** L'obus éclate : boule de feu, éclats, et un nuage de poussière */
  boom(x: number, y: number, z: number) {
    const c = new THREE.Color(0xff9a3a);
    for (let i = 0; i < 4 && this.sparks.length < CAP; i++) this.sparks.push({ x: x + (Math.random() - 0.5) * 0.1, y: y + Math.random() * 0.1, z: z + (Math.random() - 0.5) * 0.1, vx: 0, vy: 0.3, vz: 0, life: 0.18 + i * 0.04, max: 0.3, c, dust: false, big: true });
    this.hit(x, y, z, 0xffb050, 26, 'shot');
    this.puff(x, y, z, 16);
  }

  /** Onde de choc : un anneau d'étincelles qui s'élargit à plat autour de (x, y, z) */
  ring(x: number, y: number, z: number, color = 0x5af0ff, speed = 2.4, n = 20) {
    const c = new THREE.Color(color);
    n = few(n);
    for (let i = 0; i < n && this.sparks.length < CAP; i++) {
      const a = (i / n) * Math.PI * 2;
      this.sparks.push({ x, y, z, vx: Math.cos(a) * speed, vy: 0, vz: Math.sin(a) * speed, life: 0.28, max: 0.3, c, dust: false, fly: true });
    }
  }

  /** Tête d'une boule de plasma en un point de sa course : gros éclat cyan, braise violette qui reste derrière (la traînée) */
  plasmaBead(x: number, y: number, z: number) {
    if (this.sparks.length >= CAP - 3) return;
    this.sparks.push({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.1, max: 0.1, c: new THREE.Color(0x8af4ff), dust: false, big: true });
    for (let i = 0; i < 2; i++) this.sparks.push({ x: x + (Math.random() - 0.5) * 0.04, y: y + (Math.random() - 0.5) * 0.04, z: z + (Math.random() - 0.5) * 0.04, vx: 0, vy: 0.05, vz: 0, life: 0.3 + Math.random() * 0.15, max: 0.45, c: new THREE.Color(0xb070ff), dust: false, fly: true });
  }

  /** Impact de plasma : onde au sol, gerbe cyan et violette, grosse lueur */
  plasmaHit(x: number, y: number, z: number, ground: number) {
    this.ring(x, ground + 0.05, z, 0x5af0ff, 2.6, 22);
    this.hit(x, y, z, 0x5af0ff, 14, 'shot');
    this.hit(x, y, z, 0xb070ff, 8, 'shot');
    for (let i = 0; i < 3 && this.sparks.length < CAP; i++) this.sparks.push({ x, y, z, vx: 0, vy: 0.2, vz: 0, life: 0.16 + i * 0.04, max: 0.28, c: new THREE.Color(0x9af0ff), dust: false, big: true });
  }

  /** Éclats de roche sous la pioche : ils sautent et retombent, sans éclair ni bruit */
  chips(x: number, y: number, z: number, color = 0xb8ab94, n = 6) {
    const c = new THREE.Color(color);
    n = few(n);
    for (let i = 0; i < n && this.sparks.length < CAP; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 0.6;
      this.sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 0.4 + Math.random() * 0.8, vz: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.3, max: 0.65, c, dust: false });
    }
  }

  /** Poussière soulevée au sol (une bête qui tombe, une lance qui se plante) */
  puff(x: number, y: number, z: number, n = 8) {
    const c = new THREE.Color(0xc8b8a0);
    n = few(n);
    for (let i = 0; i < n && this.sparks.length < CAP; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.2 + Math.random() * 0.3;
      this.sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 0.15 + Math.random() * 0.2, vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.4, max: 1, c, dust: true });
    }
  }

  /** Un filet de fumée (cheminée, brasero, forge) qui monte et se dissipe, teinté de `c` */
  plume(x: number, y: number, z: number, c = 0x3a3036) {
    if (this.sparks.length >= CAP) return;
    const col = new THREE.Color(c);
    this.sparks.push({ x, y, z, vx: (Math.random() - 0.5) * 0.08, vy: 0.28 + Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.08, life: 1.6 + Math.random() * 0.8, max: 2.4, c: col, dust: true });
  }

  /** Une braise ou une étincelle qui jaillit d'une forge, d'un foyer, d'une torchère */
  ember(x: number, y: number, z: number, c = 0xffb040) {
    if (this.sparks.length >= CAP) return;
    this.sparks.push({ x, y, z, vx: (Math.random() - 0.5) * 0.4, vy: 0.5 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.4, life: 0.5 + Math.random() * 0.5, max: 1, c: new THREE.Color(c), dust: false });
  }

  /** Une lance lancée de `from` vers `to` : elle vole en arc, se plante, puis disparaît ; `onLand` à l'arrivée */
  throw(from: THREE.Vector3, to: THREE.Vector3, onLand: (() => void) | null = null) {
    const mesh = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.3, 5).rotateX(Math.PI / 2), this.shaftMat);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4).rotateX(Math.PI / 2).translate(0, 0, 0.17), this.tipMat);
    mesh.add(shaft, tip);
    mesh.position.copy(from);
    this.group.add(mesh);
    this.spears.push({ mesh, from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.35, from.distanceTo(to) / 3.2), stuck: 0, onLand });
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05);
    this.soundT -= dt;
    this.stepArrows(dt);
    // lances : arc de vol, puis plantées quelques secondes
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const s = this.spears[i];
      if (s.stuck > 0) {
        s.stuck -= dt;
        if (s.stuck <= 0) { this.group.remove(s.mesh); s.mesh.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); this.spears.splice(i, 1); }
        continue;
      }
      s.t += dt;
      const u = Math.min(1, s.t / s.dur), arc = Math.sin(u * Math.PI) * s.from.distanceTo(s.to) * 0.25;
      const p = new THREE.Vector3().lerpVectors(s.from, s.to, u);
      p.y += arc;
      const ahead = new THREE.Vector3().lerpVectors(s.from, s.to, Math.min(1, u + 0.05));
      ahead.y += Math.sin(Math.min(1, u + 0.05) * Math.PI) * s.from.distanceTo(s.to) * 0.25;
      s.mesh.position.copy(p);
      if (u < 1) s.mesh.lookAt(ahead);
      if (u >= 1) { s.stuck = 4; s.mesh.position.y -= 0.03; this.puff(p.x, p.y - 0.03, p.z, 5); s.onLand?.(); }
    }
    const gpos = this.glow.geometry.attributes.position as THREE.BufferAttribute, gcol = this.glow.geometry.attributes.color as THREE.BufferAttribute;
    const dpos = this.dust.geometry.attributes.position as THREE.BufferAttribute, dcol = this.dust.geometry.attributes.color as THREE.BufferAttribute;
    const fpos = this.flare.geometry.attributes.position as THREE.BufferAttribute, fcol = this.flare.geometry.attributes.color as THREE.BufferAttribute;
    let n = 0, m = 0, f = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) { this.sparks.splice(i, 1); continue; }
      if (!p.dust && !p.fly) p.vy -= 3.5 * dt;
      else { p.vx *= 0.94; p.vz *= 0.94; p.vy *= 0.96; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.min(1, (p.life / p.max) * 1.5);
      if (p.dust) { dpos.setXYZ(m, p.x, p.y, p.z); dcol.setXYZ(m, p.c.r * k + (1 - k) * 0.4, p.c.g * k + (1 - k) * 0.4, p.c.b * k + (1 - k) * 0.4); m++; }
      else if (p.big) { fpos.setXYZ(f, p.x, p.y, p.z); fcol.setXYZ(f, p.c.r * k, p.c.g * k, p.c.b * k); f++; }
      else { gpos.setXYZ(n, p.x, p.y, p.z); gcol.setXYZ(n, p.c.r * (p.fly ? 1 : k), p.c.g * (p.fly ? 1 : k), p.c.b * (p.fly ? 1 : k)); n++; }
    }
    this.glow.geometry.setDrawRange(0, n); gpos.needsUpdate = true; gcol.needsUpdate = true;
    this.dust.geometry.setDrawRange(0, m); dpos.needsUpdate = true; dcol.needsUpdate = true;
    this.flare.geometry.setDrawRange(0, f); fpos.needsUpdate = true; fcol.needsUpdate = true;
  }
}
