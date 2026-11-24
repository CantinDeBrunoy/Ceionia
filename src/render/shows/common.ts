import * as THREE from 'three';
import { BLASON_COLORS, type Blason } from '../../sim/blason';

/**
 * Ce que partagent les spectacles des bâtiments (voir `sim/shows.ts`) : les couleurs des deux camps, les places des
 * tribunes où la foule s'anime (écharpes levées, fumigènes, confettis), et le ménage des maillages
 */

/** Une place de tribune (repère du bâtiment) et le camp qui l'occupe (0 : le village, 1 : les visiteurs) */
export interface Spot { x: number; y: number; z: number; side: 0 | 1 }

/** Ce qu'un spectacle reçoit : l'âge du bâtiment, une graine, l'échelle (plan réduit), les couleurs, les tribunes */
export interface Kit {
  age: number; seed: number; scale: number; home: number; homeB: number; away: number; awayB: number; spots: Spot[];
  /** la hauteur du terrain en (x, z) du repère du bâtiment, au-dessus de son sol : ce qui se tient devant la façade s'y pose */
  ground?: (x: number, z: number) => number;
}

export interface ShowView {
  group: THREE.Group;
  done: boolean;
  update(dt: number): void;
  dispose(): void;
  /** tous les spectateurs sont à leur place (ou on ne les attend plus) : la scène peut commencer */
  ready?(): void;
  /** le spectateur n° i vient d'arriver à sa place (au temple : il dépose son offrande) */
  arrived?(i: number): void;
  /**
   * où en sont les spectateurs d'un geste à file d'attente (le théâtre, `queue`) : `wait` dans la file devant l'entrée, `in` ils
   * entrent un à un, `show` tous dedans, `out` ils ressortent et se tiennent devant la façade
   */
  crowd?: 'wait' | 'in' | 'show' | 'out';
}

/** Un petit halo lumineux (texture ronde et floue, ajouté à l'image) : torches, lampes, encens, couronne */
export function glowSprite(color: number, size: number, opacity = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

/** Des points lumineux qui montent, retombent et s'éteignent (étincelles d'un coup, poussières d'or), par lots */
export class Sparks {
  points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private list: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: THREE.Color; g: number }[] = [];

  constructor(private cap = 600, size = 0.05) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, map: puffTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false;
  }

  /** n étincelles en (x, y, z), vitesse `v` dans toutes les directions (plus `up` vers le haut), pesanteur `g`, vie `life` s */
  burst(n: number, x: number, y: number, z: number, color: number, v: number, life: number, up = 0, g = 1, rnd = Math.random) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n && this.list.length < this.cap; i++) {
      const a = rnd() * Math.PI * 2, e = (rnd() - 0.3) * Math.PI * 0.8, vv = v * (0.5 + rnd() * 0.6);
      const l = life * (0.6 + rnd() * 0.6);
      this.list.push({ x, y, z, vx: Math.cos(a) * Math.cos(e) * vv, vy: Math.sin(e) * vv + up, vz: Math.sin(a) * Math.cos(e) * vv, life: l, max: l, c, g });
    }
  }

  update(dt: number) {
    let n = 0;
    this.list = this.list.filter((p) => (p.life -= dt) > 0);
    for (const p of this.list) {
      p.vy -= p.g * dt; p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const f = Math.min(1, (p.life / p.max) * 2) * 1.5;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = Math.max(0.01, p.y); this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.c.r * f; this.col[n * 3 + 1] = p.c.g * f; this.col[n * 3 + 2] = p.c.b * f;
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() { this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); }
}

/** Des bouffées qui montent, grossissent et s'effacent (encens, poussière d'un coup, fumée) */
export class Puffs {
  group = new THREE.Group();
  private list: { s: THREE.Sprite; t: number; life: number; vx: number; vy: number; vz: number; s0: number; s1: number; o: number }[] = [];

  add(x: number, y: number, z: number, color: number, o: { life?: number; vy?: number; s0?: number; s1?: number; opacity?: number; drift?: number } = {}, rnd = Math.random) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color, transparent: true, opacity: 0, depthWrite: false }));
    s.position.set(x, y, z);
    this.group.add(s);
    const d = o.drift ?? 0.04;
    this.list.push({ s, t: 0, life: o.life ?? 3, vx: (rnd() - 0.5) * d, vy: o.vy ?? 0.12, vz: (rnd() - 0.5) * d, s0: o.s0 ?? 0.08, s1: o.s1 ?? 0.4, o: o.opacity ?? 0.6 });
  }

  update(dt: number) {
    this.list = this.list.filter((f) => {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.group.remove(f.s); f.s.material.dispose(); return false; }
      f.s.position.x += f.vx * dt; f.s.position.y += f.vy * dt; f.s.position.z += f.vz * dt;
      f.s.scale.setScalar(f.s0 + (f.s1 - f.s0) * k);
      f.s.material.opacity = Math.min(1, f.t * 3) * (1 - k) * f.o;
      return true;
    });
  }

  get count() { return this.list.length; }

  dispose() { for (const f of this.list) f.s.material.dispose(); }
}

/** Couleurs vives des visiteurs, dont on prend la plus éloignée de celles du village */
const AWAY = [0xf4f2ee, 0xf2c23a, 0x2ab84a, 0xe8322a, 0x2a8ae8, 0xa04ad8, 0xf08a2a];

const dist = (a: number, b: number) => {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b);
};

const lift = (c: number) => new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.18).getHex();

/** Les maillots : ceux du village aux couleurs de son blason ; les visiteurs, la couleur vive qui s'en distingue le mieux */
export function teamColors(b: Blason) {
  // (un peu éclaircies : vues d'en haut, au soleil, les teintes sombres du blason se perdaient)
  const home = lift(BLASON_COLORS[b.a]), homeB = lift(BLASON_COLORS[b.b]);
  const away = [...AWAY].sort((x, y) => Math.min(dist(y, home), dist(y, homeB)) - Math.min(dist(x, home), dist(x, homeB)))[0];
  const awayB = [...AWAY].filter((c) => c !== away).sort((x, y) => dist(y, away) - dist(x, away))[0];
  return { home, homeB, away, awayB };
}

/** Aplatissement des ovales des stades (`OV` de models.ts) */
const OV = 0.82;

/**
 * Les places des tribunes du stade de football (voir `stadiumFoot`) : l'anneau de gradins de bois à l'âge industriel, les
 * trois niveaux ensuite. Le village du côté -x, les visiteurs du côté +x (le virage derrière le but qu'ils attaquent)
 */
export function footSpots(age: number): Spot[] {
  const out: Spot[] = [];
  const tiers: [number, number, number, number, number][] = age < 4
    ? [[0.86, 0.012, 6, 0.045, 0.028]]
    : [[0.9, 0.012, 5, 0.032, 0.028], [1.1, 0.19, 5, 0.026, 0.03], [1.26, 0.36, 5, 0.022, 0.034]];
  let i = 0;
  for (const [r0, yb, rows, dr, dy] of tiers) for (let s = 0; s < rows; s += 2) {
    const r = r0 + (s + 0.55) * dr, y = yb + (s + 1) * dy + 0.05, n = Math.round(r * 30);
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5 + (s % 4) * 0.25) / n) * Math.PI * 2, x = r * Math.cos(t), z = OV * r * Math.sin(t);
      if (Math.abs(x) < 0.12 && z < 0 && age < 4) continue;
      out.push({ x, y, z, side: x < 0 ? 0 : 1 });
      i++;
    }
  }
  return out;
}

/** Les places de la tribune d'honneur du stade d'athlétisme (voir `stadiumBig`), le long de x au fond (-z) */
export function trackSpots(big: boolean): Spot[] {
  const out: Spot[] = [];
  if (big) for (let r = 0; r < 6; r += 1) for (let x = -0.98; x <= 0.98; x += 0.07) out.push({ x: x + (r % 2) * 0.035, y: 0.012 + 0.05 * (r + 1) + 0.05, z: -1.0 - r * 0.08 + 0.01, side: x < 0 ? 0 : 1 });
  else for (let r = 0; r < 3; r++) for (let x = -0.6; x <= 0.6; x += 0.07) out.push({ x, y: 0.03 + 0.04 * (r + 1) + 0.04, z: -0.75 - r * 0.07, side: x < 0 ? 0 : 1 });
  return out;
}

let smokeTex: THREE.Texture | null = null;
/** Une bouffée ronde et floue (texture commune des fumigènes) */
export function puffTexture() {
  if (smokeTex) return smokeTex;
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) return (smokeTex = new THREE.Texture());
  c.width = c.height = 64;
  const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.5, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}

interface Puff { s: THREE.Sprite; t: number; life: number; vx: number; vz: number }
interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }

/** Couleurs des confettis, et de quoi les mêler à celles d'un camp */
const CONF = [0xff4a6a, 0x4aa8ff, 0x6ad86a, 0xffd04a, 0xd06aff, 0xffffff];
const CONF_CAP = 500;

/**
 * La foule des tribunes qui s'anime, par-dessus celle du modèle : une écharpe (ou un fanion) aux couleurs du camp à chaque
 * place, qui se balance doucement pendant le jeu et se lève bien haut quand le camp exulte ; des fumigènes de sa couleur
 * et une gerbe de confettis aux grands moments (`cheer`)
 */
export class StandsFx {
  group = new THREE.Group();
  /** l'ardeur de chaque camp (0 : calme, 1 et plus : debout), qui retombe d'elle-même */
  heat: [number, number] = [0.15, 0.15];
  private flags: THREE.InstancedMesh;
  private ph: Float32Array;
  private puffs: Puff[] = [];
  private bits: Bit[] = [];
  private conf: THREE.Points;
  private t = 0;
  private dummy = new THREE.Object3D();
  private rnd: () => number;

  constructor(private kit: Kit, private colors: [number, number]) {
    let s = ((kit.seed * 7) >>> 0) || 3;
    this.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const n = kit.spots.length;
    this.flags = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.036, 0.005), new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.max(1, n));
    this.flags.count = n;
    this.ph = new Float32Array(n);
    const c = new THREE.Color(), b = [kit.homeB, kit.awayB];
    kit.spots.forEach((p, i) => {
      this.ph[i] = this.rnd() * 6.28;
      c.setHex(i % 3 === 0 ? b[p.side] : colors[p.side]);
      this.flags.setColorAt(i, c);
    });
    this.flags.frustumCulled = false;
    this.group.add(this.flags);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CONF_CAP * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CONF_CAP * 3), 3));
    g.setDrawRange(0, 0);
    this.conf = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, sizeAttenuation: true }));
    this.conf.frustumCulled = false;
    this.group.add(this.conf);
    this.update(0);
  }

  /** Un camp exulte (`side` -1 : les deux) : écharpes levées, fumigènes, confettis */
  cheer(side: 0 | 1 | -1, k: number) {
    const sides: (0 | 1)[] = side < 0 ? [0, 1] : [side as 0 | 1];
    for (const s of sides) {
      this.heat[s] = Math.max(this.heat[s], k);
      if (k < 0.9) continue;
      const mine = this.kit.spots.filter((p) => p.side === s);
      if (!mine.length) continue;
      for (let i = 0; i < 8; i++) this.flare(mine[Math.floor(this.rnd() * mine.length)], this.colors[s]);
      for (let i = 0; i < 160; i++) {
        const p = mine[Math.floor(this.rnd() * mine.length)];
        this.bits.push({ x: p.x, y: p.y + 0.03, z: p.z, vx: (this.rnd() - 0.5) * 0.25 - p.x * 0.15, vy: 0.35 + this.rnd() * 0.35, vz: (this.rnd() - 0.5) * 0.25 - p.z * 0.15, life: 3 + this.rnd() * 2 });
      }
    }
    if (this.bits.length > CONF_CAP) this.bits.splice(0, this.bits.length - CONF_CAP);
  }

  /** Un fumigène allumé dans la tribune : une colonne de fumée de la couleur du camp */
  private flare(p: Spot, color: number) {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color, transparent: true, opacity: 0, depthWrite: false }));
      s.position.set(p.x, p.y, p.z);
      this.group.add(s);
      this.puffs.push({ s, t: -i * 0.35, life: 3.5 + this.rnd(), vx: (this.rnd() - 0.5) * 0.03, vz: (this.rnd() - 0.5) * 0.03 });
    }
  }

  update(dt: number) {
    this.t += dt;
    for (const s of [0, 1]) this.heat[s] = Math.max(0.15, this.heat[s] - dt * 0.22);
    const d = this.dummy;
    this.kit.spots.forEach((p, i) => {
      const h = this.heat[p.side], ph = this.ph[i];
      // l'écharpe tenue à bout de bras : tout juste au-dessus des têtes au calme, bien haut et agitée quand le camp exulte
      const up = Math.min(1, h);
      d.position.set(p.x, p.y + 0.015 + up * 0.05 + Math.abs(Math.sin(this.t * (2 + h * 5) + ph)) * 0.012 * (0.3 + h), p.z);
      d.rotation.set(0, Math.atan2(-p.x, -p.z) + Math.PI / 2, Math.sin(this.t * (3 + h * 6) + ph) * (0.15 + h * 0.5));
      d.scale.setScalar(0.6 + up * 0.5);
      d.updateMatrix();
      this.flags.setMatrixAt(i, d.matrix);
    });
    this.flags.instanceMatrix.needsUpdate = true;
    // les fumigènes montent, grossissent et s'effacent
    this.puffs = this.puffs.filter((f) => {
      f.t += dt;
      if (f.t < 0) return true;
      const k = f.t / f.life;
      if (k >= 1) { this.group.remove(f.s); f.s.material.dispose(); return false; }
      f.s.position.x += f.vx * dt; f.s.position.z += f.vz * dt; f.s.position.y += dt * 0.07;
      f.s.scale.setScalar(0.1 + k * 0.4);
      f.s.material.opacity = Math.min(1, f.t * 3) * (1 - k) * 0.85;
      return true;
    });
    // les confettis tombent en voletant
    const pos = this.conf.geometry.getAttribute('position') as THREE.BufferAttribute, col = this.conf.geometry.getAttribute('color') as THREE.BufferAttribute;
    const c = new THREE.Color();
    this.bits = this.bits.filter((b) => (b.life -= dt) > 0);
    this.bits.forEach((b, i) => {
      b.vy -= dt * 0.5; b.vx *= 1 - dt * 1.2; b.vz *= 1 - dt * 1.2; b.vy = Math.max(b.vy, -0.12);
      b.x += (b.vx + Math.sin(this.t * 3 + i) * 0.03) * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      pos.setXYZ(i, b.x, Math.max(0.03, b.y), b.z);
      c.setHex(CONF[i % CONF.length]);
      col.setXYZ(i, c.r, c.g, c.b);
    });
    pos.needsUpdate = true; col.needsUpdate = true;
    this.conf.geometry.setDrawRange(0, this.bits.length);
  }

  dispose() {
    for (const f of this.puffs) f.s.material.dispose();
    this.flags.geometry.dispose(); (this.flags.material as THREE.Material).dispose();
    this.conf.geometry.dispose(); (this.conf.material as THREE.Material).dispose();
  }
}

/** Libère les géométries d'un groupe (les matériaux communs, `mats`, restent) */
export function disposeTree(g: THREE.Object3D) {
  g.traverse((o) => { if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) o.geometry.dispose(); });
}
