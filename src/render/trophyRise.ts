import * as THREE from 'three';

/**
 * Un trophée monte de terre sur la grande place : la poussière qui jaillit autour de son socle, une colonne de lumière dorée,
 * un halo au sol, une lueur qui enfle quand il arrive, et une gerbe d'étincelles d'or. Pas de vraie lampe (en ajouter une
 * ferait recompiler tous les matériaux de la scène, d'où un à-coup) : des surfaces additives. Mené par le temps de la
 * cinématique (`update(t)`), puis retiré par `dispose`
 */

const DUST = 160, SPARKS = 140;

let glowTex: THREE.Texture | null = null;
/** Une tache de lumière ronde, claire au centre */
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let fadeTex: THREE.Texture | null = null;
/** Un dégradé de bas en haut : la colonne de lumière s'éteint en montant */
function fadeTexture() {
  if (fadeTex) return fadeTex;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const g = c.getContext('2d')!, r = g.createLinearGradient(0, 0, 0, 64);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.6, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = r; g.fillRect(0, 0, 4, 64);
  fadeTex = new THREE.CanvasTexture(c);
  return fadeTex;
}

interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number }

export class TrophyRise {
  group = new THREE.Group();
  private dust: THREE.Points;
  private sparks: THREE.Points;
  private pillar: THREE.Mesh;
  private halo: THREE.Mesh;
  private glow: THREE.Sprite;
  private dustBits: Bit[] = [];
  private sparkBits: Bit[] = [];
  private last = 0;
  private burst = false;

  /**
   * (x, y, z) : le pied du trophée ; h : sa hauteur ; riseFrom / riseTo / burstAt : les instants (s) où il commence à monter,
   * où il arrive, et où jaillit la gerbe
   */
  constructor(x: number, y: number, z: number, private h: number, private riseFrom: number, private riseTo: number, private burstAt: number) {
    const add = (color: THREE.Color, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    const beam = add(new THREE.Color(1.2, 0.85, 0.3), 0);
    beam.map = fadeTexture();
    const r = Math.max(0.08, h * 0.4);
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, 2.6, 20, 1, true).translate(0, 1.3, 0), beam);
    this.halo = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(1.3, 0.95, 0.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.halo.position.y = 0.05;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(1.4, 1.05, 0.5), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.glow.position.y = h * 0.55;
    const pts = (n: number, mat: THREE.PointsMaterial) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-999), 3));
      const p = new THREE.Points(g, mat);
      p.frustumCulled = false;
      return p;
    };
    this.dust = pts(DUST, new THREE.PointsMaterial({ color: 0xa08a64, map: glowTexture(), size: 0.3, transparent: true, opacity: 1, depthWrite: false }));
    this.sparks = pts(SPARKS, new THREE.PointsMaterial({ color: new THREE.Color(1.8, 1.3, 0.4), map: glowTexture(), size: 0.1, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (const m of [this.pillar, this.halo, this.glow, this.dust, this.sparks]) { m.renderOrder = 12; this.group.add(m); }
    this.group.position.set(x, y, z);
  }

  /** Un tour, au temps t (s) de la cinématique */
  update(t: number) {
    const dt = Math.min(0.1, Math.max(0, t - this.last));
    this.last = t;
    const rising = t >= this.riseFrom && t < this.riseTo;
    // la poussière : des bouffées qui jaillissent du sol autour du socle tant qu'il monte
    if (rising) for (let i = 0; i < 4; i++) if (this.dustBits.length < DUST) {
      const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.2, out = 0.4 + Math.random() * 0.9;
      this.dustBits.push({ x: Math.cos(a) * r, y: 0.05, z: Math.sin(a) * r, vx: Math.cos(a) * out, vy: 0.6 + Math.random() * 0.9, vz: Math.sin(a) * out, life: 0, max: 0.9 + Math.random() * 0.8 });
    }
    // des étincelles qui montent déjà avec lui, puis la gerbe quand il arrive
    if (rising && Math.random() < 0.5 && this.sparkBits.length < SPARKS) this.spark(0.6);
    if (!this.burst && t >= this.burstAt) {
      this.burst = true;
      for (let i = 0; i < 70 && this.sparkBits.length < SPARKS; i++) this.spark(1);
    }
    this.step(this.dustBits, this.dust, dt, -1.2, 0.9, true);
    this.step(this.sparkBits, this.sparks, dt, -2.4, 0.99, false);
    // la lumière : la colonne et le halo montent avec le trophée, la lueur enfle à son arrivée, puis tout s'efface
    const up = Math.min(1, Math.max(0, (t - this.riseFrom + 0.3) / 0.6)), fade = Math.max(0, Math.min(1, (this.riseTo + 1.4 - t) / 1));
    const flash = Math.exp(-(((t - this.burstAt) / 0.35) ** 2));
    (this.pillar.material as THREE.MeshBasicMaterial).opacity = (0.3 * up * fade + 0.3 * flash) * (0.85 + 0.15 * Math.sin(t * 9));
    this.pillar.scale.set(1 + flash * 0.25, 0.4 + 0.6 * up, 1 + flash * 0.25);
    (this.halo.material as THREE.MeshBasicMaterial).opacity = (0.55 * up * fade + 0.4 * flash) * Math.max(fade, flash);
    // (petit : sur une pente, un grand disque plat s'enfoncerait d'un côté, en arête dure)
    this.halo.scale.setScalar(Math.max(0.3, this.h) * (0.9 + 0.4 * up + 0.6 * flash));
    (this.glow.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.2 * up * fade + 0.7 * flash);
    this.glow.scale.setScalar(this.h * (1.3 + 1.6 * flash));
  }

  private spark(k: number) {
    const a = Math.random() * Math.PI * 2, out = (0.3 + Math.random() * 1.2) * k;
    this.sparkBits.push({ x: Math.cos(a) * 0.15, y: this.h * (0.4 + Math.random() * 0.6), z: Math.sin(a) * 0.15, vx: Math.cos(a) * out, vy: (1.2 + Math.random() * 2.2) * k, vz: Math.sin(a) * out, life: 0, max: 1 + Math.random() * 1.2 });
  }

  /** Fait avancer des grains (pesanteur g, frottement drag), retire les morts et les recopie dans leur nuage */
  private step(bits: Bit[], pts: THREE.Points, dt: number, g: number, drag: number, ground: boolean) {
    const d = Math.pow(drag, dt * 60);
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.life += dt;
      if (b.life >= b.max) { bits.splice(i, 1); continue; }
      b.vy += g * dt; b.vx *= d; b.vy *= d; b.vz *= d;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (ground && b.y < 0.03) { b.y = 0.03; b.vy = 0; }
    }
    const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute, a = pos.array as Float32Array;
    a.fill(-999);
    bits.forEach((b, i) => { a[i * 3] = b.x; a[i * 3 + 1] = b.y; a[i * 3 + 2] = b.z; });
    pos.needsUpdate = true;
    // (les grains s'effacent ensemble : assez près de la fin de leur vie, à l'œil, c'est la même chose)
    (pts.material as THREE.PointsMaterial).opacity = bits.length ? 1 : 0;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      // (la géométrie d'un Sprite est partagée par tous : on ne jette que son matériau)
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) (o.material as THREE.Material).dispose();
    });
  }
}
