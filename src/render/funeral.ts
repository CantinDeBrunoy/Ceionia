import * as THREE from 'three';
import { World } from '../world/world';
import { Parts } from './parts';
import { mats } from './materials';
import { makeFolk, folkStep, holdFolk, Folk, FolkRole } from './folk';

/**
 * Le cortège qui mène un défunt au cimetière (décès d'un malade resté sans soins, voir `mishaps.ts`). Une mise en scène
 * sobre : les proches sortent de la maison, quatre porteurs prennent la civière couverte d'un drap et de fleurs, un meneur
 * ouvre la marche une lanterne à la main, les autres suivent deux par deux, au pas lent. Au cimetière, on pose la civière
 * devant le monument, on se tient autour un moment, la civière s'efface sous un petit tertre fleuri, puis chacun repart et
 * rentre chez soi. Rien n'est gardé : le cortège ne vit pas dans la sauvegarde
 */

/** Le pas du cortège (cases par seconde de jeu), et la durée de la marche au plus (un long trajet presse un peu le pas) */
const PACE = 0.24, WALK_MAX = 55;
/** Les étapes : rassemblement devant la maison, halte au cimetière, adieu (la civière s'efface), dispersion */
const GATHER = 2.5, REST = 9, BURY = 3, LEAVE = 6;
/** Pas de l'échantillonnage du chemin (cases) */
const STEP = 0.2;
/** Hauteur de la civière portée (aux épaules), et à terre */
const CARRY_Y = 0.15, DOWN_Y = 0.02;

type Phase = 'gather' | 'walk' | 'rest' | 'bury' | 'leave';
interface Walker { f: Folk; x: number; z: number; face: number; ph: number }

/** Le drap de la civière et la lumière du meneur, selon l'âge */
const SHROUD = [0xd8c8a8, 0xf2ece0, 0x6a5a8a, 0x3a3e4a, 0xf2f2f0, 0xeef2f6];
const FLOWERS = [0xf25c7a, 0xffd24a, 0xfaf4ea, 0xb07ad8, 0xff9ac0];

export class Funeral {
  group = new THREE.Group();
  private pts: [number, number][] = [];
  private len = 0;
  private s = 0;
  private t = 0;
  private pace = PACE;
  private phase: Phase | null = null;
  private bearers: Walker[] = [];
  private mourners: Walker[] = [];
  private lead: Walker | null = null;
  private bier: THREE.Object3D | null = null;
  private mound: THREE.Object3D | null = null;
  private own: THREE.BufferGeometry[] = [];
  /** la halte : où l'on pose la civière, et vers où l'on regarde (le monument du cimetière) */
  private spot: [number, number] = [0, 0];
  private look = 0;

  constructor(private world: World) {}

  get active() { return this.phase !== null; }

  /** Où en est le cortège (pour la caméra) */
  where(): [number, number] | null {
    if (!this.phase) return null;
    if (this.phase === 'walk' || this.phase === 'gather') { const q = this.at(this.s); return [q.x, q.z]; }
    return this.spot;
  }

  /**
   * Le cortège part de la porte de la maison (`cells`[0]) et suit les cases jusqu'à la porte du cimetière, passe par `gate`
   * (devant l'entrée, dans l'axe) et entre jusqu'à la halte `spot`, tourné vers `look` (l'angle du monument depuis la halte).
   * Un cortège déjà en route est remplacé
   */
  start(cells: [number, number][], gate: [number, number], spot: [number, number], look: number, age: number, seed = 0) {
    this.stop();
    const pts = cells.map((c) => [c[0] + 0.5, c[1] + 0.5] as [number, number]);
    pts.push(gate, spot);
    if (pts.length < 2) pts.unshift([spot[0], spot[1] + 0.5]);
    this.lay(pts);
    this.spot = spot; this.look = look;
    this.pace = Math.max(PACE, this.len / WALK_MAX);
    this.phase = 'gather'; this.t = 0; this.s = Math.min(0.6, this.len * 0.3);
    const era = Math.min(5, Math.max(0, age));
    // les porteurs, le meneur et les proches (la famille d'abord : des femmes, un enfant)
    for (let i = 0; i < 4; i++) this.bearers.push(this.walker({ age: era, v: 900 + seed * 7 + i * 13, woman: false }));
    const role: FolkRole = era === 2 ? 'monk' : 'villager';
    this.lead = this.walker({ age: era, v: 950 + seed * 7, role });
    this.lead.f.root.userData.light = this.lantern(this.lead.f, era);
    const n = 5 + (seed % 3);
    for (let i = 0; i < n; i++) this.mourners.push(this.walker({ age: era, v: 970 + seed * 7 + i * 11, child: i === n - 1, woman: i % 2 === 0 }));
    this.bier = this.makeBier(era, seed);
    this.group.add(this.bier);
    this.place(0);
  }

  stop() {
    for (const w of this.all()) this.group.remove(w.f.root);
    if (this.bier) this.group.remove(this.bier);
    if (this.mound) this.group.remove(this.mound);
    for (const g of this.own) g.dispose();
    this.own = []; this.bearers = []; this.mourners = []; this.lead = null; this.bier = null; this.mound = null;
    this.phase = null;
  }

  /** `dt` : secondes de jeu (rien ne bouge en pause, tout va plus vite en accéléré) */
  update(dt: number) {
    if (!this.phase || dt <= 0) return;
    this.t += dt;
    if (this.phase === 'gather') {
      this.place(dt, true);
      if (this.t >= GATHER) { this.phase = 'walk'; this.t = 0; }
    } else if (this.phase === 'walk') {
      this.s = Math.min(this.len, this.s + this.pace * dt);
      this.place(dt);
      if (this.s >= this.len) { this.phase = 'rest'; this.t = 0; }
    } else if (this.phase === 'rest' || this.phase === 'bury') {
      this.stand(dt);
      if (this.phase === 'rest' && this.t >= REST) { this.phase = 'bury'; this.t = 0; this.raiseMound(); }
      else if (this.phase === 'bury') {
        const k = Math.min(1, this.t / BURY);
        if (this.bier) this.bier.position.y = this.world.surfaceAt(this.spot[0], this.spot[1]) + DOWN_Y - k * 0.12;
        if (this.mound) this.mound.scale.setScalar(Math.max(0.01, k));
        if (k >= 1) { if (this.bier) { this.group.remove(this.bier); this.bier = null; } this.phase = 'leave'; this.t = 0; }
      }
    } else {
      this.disperse(dt);
      if (this.t >= LEAVE) this.stop();
    }
  }

  // ---------- la marche ----------

  /** Le chemin : adouci (les angles des cases deviennent des courbes), échantillonné tous les STEP */
  private lay(raw: [number, number][]) {
    let p = raw;
    for (let k = 0; k < 2; k++) { const q = p; p = q.map((c, i) => (i === 0 || i === q.length - 1 ? c : [(q[i - 1][0] + 2 * c[0] + q[i + 1][0]) / 4, (q[i - 1][1] + 2 * c[1] + q[i + 1][1]) / 4] as [number, number])); }
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    this.len = cum[cum.length - 1];
    const n = Math.max(1, Math.ceil(this.len / STEP));
    this.pts = [];
    for (let i = 0, j = 0; i <= n; i++) {
      const s = (this.len * i) / n;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const k = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      this.pts.push([p[j][0] + (p[j + 1][0] - p[j][0]) * k, p[j][1] + (p[j + 1][1] - p[j][1]) * k]);
    }
  }

  /** Le point du chemin à l'abscisse s (bornée), et sa direction */
  private at(s: number) {
    const f = Math.min(this.pts.length - 1.001, Math.max(0, (s / Math.max(1e-6, this.len)) * (this.pts.length - 1))), i = Math.floor(f), k = f - i;
    const a = this.pts[i], b = this.pts[i + 1] ?? a, dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * k, z: a[1] + dz * k, tx: dx / d, tz: dz / d };
  }

  /** Une place dans le cortège : `back` cases derrière la civière, `side` à gauche (−) ou à droite (+) */
  private slot(back: number, side: number): [number, number, number] {
    const q = this.at(this.s - back);
    return [q.x - q.tz * side, q.z + q.tx * side, Math.atan2(q.tx, q.tz)];
  }

  /** Chacun à sa place dans la file (`still` : on attend, debout, devant la maison) */
  private place(dt: number, still = false) {
    const go = (w: Walker, [x, z, face]: [number, number, number]) => {
      const moved = Math.hypot(x - w.x, z - w.z);
      w.x = x; w.z = z; w.face = face;
      w.ph += still ? dt : moved * 34;
      this.pose(w, still ? 'idle' : 'walk');
    };
    const L = 0.13, W = 0.065;
    this.bearers.forEach((w, i) => go(w, this.slot((i < 2 ? -L : L), i % 2 ? W : -W)));
    if (this.lead) go(this.lead, this.slot(-0.42, 0));
    this.mourners.forEach((w, i) => go(w, this.slot(0.42 + Math.floor(i / 2) * 0.2, i % 2 ? 0.06 : -0.06)));
    if (this.bier) {
      const q = this.at(this.s);
      this.bier.position.set(q.x, this.world.surfaceAt(q.x, q.z) + CARRY_Y + Math.sin(this.bearers[0]?.ph ?? 0) * 0.002, q.z);
      this.bier.rotation.y = Math.atan2(q.tx, q.tz);
    }
  }

  /** La halte : la civière posée, chacun en demi-cercle tourné vers elle, le meneur au bout, devant le monument */
  private stand(dt: number) {
    const [sx, sz] = this.spot, f = this.look;
    const fx = Math.sin(f), fz = Math.cos(f);
    if (this.bier && this.phase === 'rest') {
      const k = Math.min(1, this.t / 1.5);
      this.bier.position.set(sx, this.world.surfaceAt(sx, sz) + CARRY_Y + (DOWN_Y - CARRY_Y) * k, sz);
      this.bier.rotation.y = f + Math.PI / 2;
    }
    const people = [...this.bearers, ...this.mourners];
    people.forEach((w, i) => {
      // en arc de cercle derrière la civière (du côté de l'entrée)
      const a = Math.PI + ((i + 0.5) / people.length - 0.5) * 1.7, r = 0.22 + (i % 2) * 0.11;
      const tx = sx + Math.sin(f + a) * r, tz = sz + Math.cos(f + a) * r;
      this.toward(w, tx, tz, dt, Math.atan2(sx - tx, sz - tz));
    });
    if (this.lead) this.toward(this.lead, sx + fx * 0.22, sz + fz * 0.22, dt, f + Math.PI);
  }

  /** Après l'adieu : chacun ressort par où il est venu, et s'efface au loin */
  private disperse(dt: number) {
    const back = this.at(Math.max(0, this.len - 1.6));
    for (const w of this.all()) {
      this.toward(w, back.x + (w.ph % 1 - 0.5) * 0.4, back.z + ((w.ph * 7) % 1 - 0.5) * 0.4, dt, null, 0.5);
      if (this.t > LEAVE * 0.6) w.f.root.scale.multiplyScalar(Math.max(0.5, 1 - dt * 1.5));
      if (this.t > LEAVE * 0.85) w.f.root.visible = false;
    }
    if (this.mound) this.mound.visible = this.t < LEAVE * 0.85;
  }

  /** Un pas vers (x, z), au pas lent ; arrivé, il se tourne vers `face` et se recueille */
  private toward(w: Walker, x: number, z: number, dt: number, face: number | null, speed = 0.4) {
    const dx = x - w.x, dz = z - w.z, d = Math.hypot(dx, dz), step = Math.min(d, speed * dt);
    if (d > 0.01) { w.x += (dx / d) * step; w.z += (dz / d) * step; w.face = Math.atan2(dx, dz); w.ph += step * 34; this.pose(w, 'walk'); }
    else { if (face !== null) w.face = face; w.ph += dt; this.pose(w, 'idle'); }
  }

  private pose(w: Walker, pose: 'walk' | 'idle') {
    w.f.root.position.set(w.x, this.world.surfaceAt(w.x, w.z), w.z);
    w.f.root.rotation.y = w.face;
    folkStep(w.f, w.ph, pose);
    // les porteurs gardent les bras levés vers la civière
    if (this.bearers.includes(w) && (this.phase === 'walk' || this.phase === 'gather')) { w.f.arms[0].rotation.x = -2.6; w.f.arms[1].rotation.x = -2.6; }
  }

  private all(): Walker[] { return [...this.bearers, ...(this.lead ? [this.lead] : []), ...this.mourners]; }

  private walker(look: Parameters<typeof makeFolk>[0]): Walker {
    const f = makeFolk(look);
    this.group.add(f.root);
    return { f, x: 0, z: 0, face: 0, ph: (look.v % 7) * 0.9 };
  }

  // ---------- les objets ----------

  /** Ce que porte le meneur : une torche (avant l'Antiquité comprise), une lanterne, une sphère de lumière au futur */
  private lantern(f: Folk, era: number) {
    const p = new Parts();
    if (era <= 1) { p.cyl(0.006, 0.008, 0.2, 5, 0, 0, 0, 0x6a4a30); p.cone(0.02, 0.05, 6, 0, 0.2, 0, 0xffb84a, true); }
    else if (era >= 5) { p.cyl(0.004, 0.004, 0.16, 5, 0, 0, 0, 0xc8d2dc); p.sphere(0.024, 0, 0.18, 0, 0x7af0e0, 1); }
    else { p.cyl(0.004, 0.004, 0.12, 5, 0, 0, 0, 0x3a3a40); p.box(0.04, 0.05, 0.04, 0, 0.1, 0, 0xffd27a, 0, true); p.cone(0.03, 0.025, 4, 0, 0.15, 0, 0x3a3a40); }
    const b = p.build(false), m = new THREE.Mesh(b.body, mats.body);
    this.own.push(b.body);
    if (b.glow) { const g = new THREE.Mesh(b.glow, mats.glow); m.add(g); this.own.push(b.glow); }
    holdFolk(f, 0, m, 'upright');
    return m;
  }

  /** La civière : brancards, plateau, drap qui retombe, couronne et bouquets */
  private makeBier(era: number, seed: number) {
    const p = new Parts(), wood = era >= 4 ? 0xb8bcc4 : 0x7a5a3a;
    for (const s of [-1, 1]) p.box(0.012, 0.012, 0.36, s * 0.05, -0.006, 0, wood);
    for (const z of [-0.1, 0.1]) p.box(0.1, 0.008, 0.012, 0, -0.004, z, wood);
    p.box(0.085, 0.04, 0.24, 0, 0, 0, SHROUD[era]);
    p.box(0.095, 0.006, 0.25, 0, 0.034, 0, SHROUD[era]);
    p.box(0.02, 0.003, 0.25, 0, 0.04, 0, era === 2 ? 0xe8d8a0 : 0xfaf4ea);
    p.add(new THREE.TorusGeometry(0.03, 0.008, 4, 10).rotateX(Math.PI / 2), 0, 0.045, -0.05, 0x4a7a3a);
    for (let i = 0; i < 9; i++) p.sphere(0.009, Math.sin(i * 2.4) * 0.03, 0.05, 0.05 + Math.cos(i * 2.4) * 0.03 - 0.0, FLOWERS[(i + seed) % FLOWERS.length]);
    const b = p.build(false), m = new THREE.Mesh(b.body, mats.body);
    this.own.push(b.body);
    return m;
  }

  /** Le petit tertre fleuri qui reste à la place de la civière, le temps que chacun s'en aille */
  private raiseMound() {
    const p = new Parts();
    p.add(new THREE.SphereGeometry(0.11, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.7, 0.35, 1.2), 0, 0, 0, 0x7a6a52);
    for (let i = 0; i < 10; i++) p.sphere(0.01, Math.sin(i * 2.1) * 0.05, 0.03, Math.cos(i * 1.7) * 0.09, FLOWERS[i % FLOWERS.length]);
    const b = p.build(false), m = new THREE.Mesh(b.body, mats.body);
    this.own.push(b.body);
    m.position.set(this.spot[0], this.world.surfaceAt(this.spot[0], this.spot[1]), this.spot[1]);
    m.rotation.y = this.look + Math.PI / 2;
    m.scale.setScalar(0.01);
    this.mound = m;
    this.group.add(m);
  }
}
