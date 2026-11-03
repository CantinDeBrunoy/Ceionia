import * as THREE from 'three';

/**
 * Effets des combats : étincelles d'un coup porté (or pour une lame, blanches pour un choc, rouges pour une morsure), éclair
 * d'un coup de feu, poussière soulevée ; et lances des chasseurs qui volent en arc, puis restent plantées un moment
 */

const CAP = 1500;

interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: THREE.Color; dust: boolean }
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
    for (const p of [this.glow, this.dust]) { p.frustumCulled = false; this.group.add(p); }
  }

  private sound(kind: 'blade' | 'shot' | 'bite') {
    if (this.soundT > 0) return;
    this.soundT = 0.12;
    this.onClash?.(kind);
  }

  /** Un coup qui porte en (x, y, z) : gerbe d'étincelles (couleur, nombre), un petit éclair au point d'impact */
  hit(x: number, y: number, z: number, color = 0xffd27a, n = 14, kind: 'blade' | 'shot' | 'bite' = 'blade') {
    const c = new THREE.Color(color);
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

  /** Poussière soulevée au sol (une bête qui tombe, une lance qui se plante) */
  puff(x: number, y: number, z: number, n = 8) {
    const c = new THREE.Color(0xc8b8a0);
    for (let i = 0; i < n && this.sparks.length < CAP; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.2 + Math.random() * 0.3;
      this.sparks.push({ x, y, z, vx: Math.cos(a) * sp, vy: 0.15 + Math.random() * 0.2, vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.4, max: 1, c, dust: true });
    }
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
    let n = 0, m = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) { this.sparks.splice(i, 1); continue; }
      if (!p.dust) p.vy -= 3.5 * dt;
      else { p.vx *= 0.94; p.vz *= 0.94; p.vy *= 0.96; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.min(1, (p.life / p.max) * 1.5);
      if (p.dust) { dpos.setXYZ(m, p.x, p.y, p.z); dcol.setXYZ(m, p.c.r * k + (1 - k) * 0.4, p.c.g * k + (1 - k) * 0.4, p.c.b * k + (1 - k) * 0.4); m++; }
      else { gpos.setXYZ(n, p.x, p.y, p.z); gcol.setXYZ(n, p.c.r * k, p.c.g * k, p.c.b * k); n++; }
    }
    this.glow.geometry.setDrawRange(0, n); gpos.needsUpdate = true; gcol.needsUpdate = true;
    this.dust.geometry.setDrawRange(0, m); dpos.needsUpdate = true; dcol.needsUpdate = true;
  }
}
