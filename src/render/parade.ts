import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { World, VEG_FOREST } from '../world/world';
import { Parts } from './parts';
import { mats } from './materials';
import { makeFolk, folkStep, holdFolk, Folk } from './folk';
import { tube, tri } from './festivities';

/**
 * La parade du grand départ, façon carnaval : le long de la route qui mène du cœur du village au pas de tir, deux haies de foule
 * (les habitants, et des figurants qui agitent des fanions), des mâts reliés de guirlandes de fanions et de lanternes qui
 * enjambent la route, des musiciens (tambours et trompettes) ; au milieu de la route, un char à plumes et à ampoules, ses
 * danseuses et ses tambours, qui précède les colons ; des confettis qui tombent, des pétards de confettis et des serpentins
 * lancés depuis la foule. La route est la plus courte que prennent les colons (cases de route de préférence) ; sans route, c'est
 * le tracé direct
 */

/** pas de l'échantillonnage de la route (en cases) */
const STEP = 0.25;
const CONF = [0xff4a6a, 0x4aa8ff, 0x6ad86a, 0xffd04a, 0xd06aff, 0xffffff, 0xff8a3a];
const PLUME = [0xff4a6a, 0xff8a3a, 0xffd04a, 0x4aff8a, 0x4aa8ff, 0xd06aff];
const BUNTING = [0xff5a6a, 0x4aa8ff, 0x6ad86a, 0xffd04a, 0xd06aff, 0xff8a3a];
const CONF_CAP = 1600, SERP_CAP = 36, SERP_PTS = 8;

/** une place de la haie : où, et vers où l'on regarde (la route) */
export interface Spot { x: number; z: number; face: number }
interface Cand extends Spot { s: number; row: number }
/** un figurant de la haie, d'un des trois rôles */
interface Fig { f: Folk; kind: 'flag' | 'drum' | 'horn'; ph: number; flag?: THREE.Object3D }
interface Conf { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; ph: number; c: THREE.Color }
interface Serp { trail: number[]; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: THREE.Color; acc: number }

/** Un nombre de 0 à 1, toujours le même pour (i, k) */
const hash = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };

export class Parade {
  group = new THREE.Group();
  /** joué à chaque pétard de confettis */
  onPop: (() => void) | null = null;
  private pts: number[][] = [];
  private len = 0;
  private on = false;
  private t = 0;
  private figs: Fig[] = [];
  /** le char (à l'origine : le centre de son plancher, l'avant vers +z) et ses danseuses ; les danseurs au sol devant lui */
  private float: THREE.Group | null = null;
  private riders: { f: Folk; i: number }[] = [];
  private walkers: { f: Folk; i: number }[] = [];
  private sF = 3;
  private fMove = 0;
  private spots: Cand[] = [];
  private conf: Conf[] = [];
  private serps: Serp[] = [];
  private confPts: THREE.Points;
  private serpLines: THREE.LineSegments;
  private rain = 0;
  private pop = 0;
  private own: { dispose(): void }[] = [];

  constructor(private world: World) {
    const mk = (n: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setDrawRange(0, 0);
      return g;
    };
    this.confPts = new THREE.Points(mk(CONF_CAP), new THREE.PointsMaterial({ size: 0.075, vertexColors: true, transparent: true, depthWrite: false }));
    this.serpLines = new THREE.LineSegments(mk(SERP_CAP * (SERP_PTS - 1) * 2), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    for (const o of [this.confPts, this.serpLines]) { o.frustumCulled = false; o.visible = false; this.group.add(o); }
  }

  get active() { return this.on; }
  /** la longueur de la route (en cases) */
  get length() { return this.len; }
  /** le milieu de la route */
  middle(): [number, number] { const q = this.at(this.len / 2); return [q.x, q.z]; }

  // ---------- la route ----------

  /** La route : les centres des cases, adoucis (les angles de cases deviennent des courbes) puis échantillonnés tous les STEP */
  private lay(cells: [number, number][]) {
    let p = cells.map((c) => [c[0], c[1]]);
    for (let k = 0; k < 3; k++) { const q = p; p = q.map((c, i) => (i === 0 || i === q.length - 1 ? c : [(q[i - 1][0] + 2 * c[0] + q[i + 1][0]) / 4, (q[i - 1][1] + 2 * c[1] + q[i + 1][1]) / 4])); }
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    this.len = cum[cum.length - 1];
    const n = Math.max(1, Math.floor(this.len / STEP));
    this.pts = [];
    for (let i = 0, j = 0; i <= n; i++) {
      const s = Math.min(this.len, i * STEP);
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const k = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      this.pts.push([p[j][0] + (p[j + 1][0] - p[j][0]) * k, p[j][1] + (p[j + 1][1] - p[j][1]) * k]);
    }
  }

  /** Le point de la route à l'abscisse s, et sa direction (tx, tz) */
  at(s: number) {
    const f = Math.min(this.pts.length - 1.001, Math.max(0, s / STEP)), i = Math.floor(f), k = f - i, a = this.pts[i], b = this.pts[i + 1] ?? a;
    const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1;
    return { x: a[0] + dx * k, z: a[1] + dz * k, tx: dx / d, tz: dz / d };
  }
  /** Le point de la route le plus proche de (x, z) : son abscisse */
  project(x: number, z: number) {
    let best = 0, bd = 1e9;
    this.pts.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = i; } });
    return best * STEP;
  }
  /** Un point à côté de la route : de `off` cases, à gauche (side −1) ou à droite (+1) */
  private beside(s: number, side: number, off: number): [number, number] {
    const q = this.at(s);
    return [q.x - q.tz * side * off, q.z + q.tx * side * off];
  }

  /** (x, z) tombe-t-il sur un autre tronçon de la route que celui de l'abscisse s (dans un virage serré) ? */
  private crossed(x: number, z: number, s: number) {
    const k = Math.round(s / STEP);
    for (let i = 0; i < this.pts.length; i++) if (Math.abs(i - k) > 6 && Math.hypot(this.pts[i][0] - x, this.pts[i][1] - z) < 0.3) return true;
    return false;
  }

  /** Une place libre en (x, z) : ni bâtiment, ni eau, ni sous les arbres (on y voit la fête) */
  private free(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    return w.inCells(cx, cz) && !w.occ[w.ci(cx, cz)] && !w.isWet(cx, cz) && w.veg[w.ci(cx, cz)] !== VEG_FOREST && !w.decor[w.ci(cx, cz)];
  }

  // ---------- la mise en place ----------

  /**
   * Dresse la parade le long de la route (les centres de ses cases, du cœur du village au pas de tir) ; renvoie les places des
   * `crowdN` habitants qui font la haie. Elle laisse libres les abords du cœur du village (la fête) et du pas de tir (la fusée)
   */
  start(cells: [number, number][], base: [number, number], dest: [number, number], age: number, crowdN: number): Spot[] {
    this.stop();
    if (cells.length < 2) cells = [base, dest];
    this.lay(cells);
    this.on = true; this.t = 0; this.sF = 3; this.fMove = 0;
    this.confPts.visible = this.serpLines.visible = true;
    // les places candidates, de chaque côté, sur deux rangs (le premier au bord de la route)
    const cands: Cand[] = [];
    for (let s = 0, i = 0; s <= this.len; s += 0.34, i++) {
      for (const side of [-1, 1]) for (const row of [0, 1]) {
        const off = [0.42, 0.72][row] + (hash(i, side + row * 3) - 0.5) * 0.06, [x, z] = this.beside(s + (hash(i, 9 + side) - 0.5) * 0.1, side, off);
        if (Math.hypot(x - base[0], z - base[1]) < 2.4 || Math.hypot(x - dest[0], z - dest[1]) < 4) continue;
        if (!this.free(x, z) || this.crossed(x, z, s)) continue;
        const q = this.at(s), nx = -q.tz * side, nz = q.tx * side;
        cands.push({ x, z, s, row, face: Math.atan2(-nx, -nz) });
      }
    }
    this.spots = cands;
    // qui se tient où : le premier rang d'abord, le second pour ce qu'il reste à placer ; les habitants et les figurants alternent
    const own = Math.min(44, Math.max(8, crowdN)), total = crowdN + own;
    const r1 = cands.filter((c) => c.row === 0), r2 = cands.filter((c) => c.row === 1);
    const pick = (l: Cand[], n: number) => (n >= l.length ? l.slice() : Array.from({ length: n }, (_, i) => l[Math.floor(((i + 0.5) * l.length) / n)]));
    const chosen = (r1.length >= total ? pick(r1, total) : [...r1, ...pick(r2, total - r1.length)]).sort((a, b) => a.s - b.s);
    const crowd: Spot[] = [], figs: Cand[] = [];
    chosen.forEach((c, i) => { if (Math.floor(((i + 1) * own) / chosen.length) > Math.floor((i * own) / chosen.length)) figs.push(c); else if (crowd.length < crowdN) crowd.push(c); else figs.push(c); });
    this.dress(figs, age);
    this.buildDecor();
    this.buildFloat(age);
    return crowd;
  }

  /** Les figurants : surtout des porteurs de fanions, et de loin en loin un tambour ou une trompette */
  private dress(spots: Cand[], age: number) {
    const flagGeo = new Map<number, THREE.BufferGeometry>();
    spots.forEach((c, i) => {
      const kind: Fig['kind'] = i % 9 === 4 ? 'drum' : i % 9 === 8 ? 'horn' : 'flag';
      const f = makeFolk({ age, v: 700 + i * 13, role: kind === 'drum' ? 'drummer' : 'villager' });
      f.root.position.set(c.x, this.world.surfaceAt(c.x, c.z), c.z);
      f.root.rotation.y = c.face + (hash(i, 4) - 0.5) * 0.5;
      this.group.add(f.root);
      const fig: Fig = { f, kind, ph: hash(i, 1) * 6.3 };
      if (kind === 'flag') {
        // un fanion à la main : une hampe et sa flamme triangulaire, de la couleur de la foule
        const col = BUNTING[i % BUNTING.length];
        let g = flagGeo.get(col);
        if (!g) {
          const p = new Parts();
          p.cyl(0.006, 0.006, 0.34, 4, 0, 0, 0, 0x8a6a44);
          tri(p, [0, 0.34, 0], [0, 0.24, 0], [0.13, 0.29, 0], col);
          g = p.build(false).body; flagGeo.set(col, g); this.own.push(g);
        }
        const m = new THREE.Mesh(g, mats.body);
        holdFolk(f, 0, m, 'upright');
        fig.flag = m;
      } else if (kind === 'drum') {
        // le tambour pendu au ventre
        const p = new Parts();
        p.add(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 9).rotateX(Math.PI / 2), 0, 0, 0, 0xc84a3e);
        p.add(new THREE.CylinderGeometry(0.062, 0.062, 0.008, 9).rotateX(Math.PI / 2), 0, 0, 0.038, 0xf2e8d0);
        const m = new THREE.Mesh(p.build(false).body, mats.body);
        m.position.set(0, 0.13, 0.07);
        f.body.add(m);
        this.own.push(m.geometry);
      } else {
        // la trompette (de laiton), pointée devant
        const p = new Parts();
        p.add(new THREE.CylinderGeometry(0.005, 0.006, 0.11, 5), 0, 0.03, 0, 0xd8b04a);
        p.cone(0.02, 0.035, 7, 0, 0.09, 0, 0xe8c66a);
        const m = new THREE.Mesh(p.build(false).body, mats.body);
        holdFolk(f, 0, m, 'point');
        this.own.push(m.geometry);
      }
      this.figs.push(fig);
    });
  }

  /** Les mâts de chaque côté, leurs guirlandes de fanions, et celles qui enjambent la route, des lanternes qui luisent le soir */
  private buildDecor() {
    const p = new Parts(), g = new Parts(), H = 0.62;
    const poles: { l: [number, number, number] | null; r: [number, number, number] | null }[] = [];
    for (let s = 2.2; s < this.len - 3.2; s += 1.9) {
      const e = { l: null, r: null } as (typeof poles)[number];
      for (const side of [-1, 1]) {
        const [x, z] = this.beside(s, side, 1.12);
        if (!this.free(x, z)) continue;
        const y = this.world.surfaceAt(x, z);
        p.cyl(0.014, 0.018, H, 5, x, y, z, 0xf2ece0);
        p.sphere(0.03, x, y + H + 0.02, z, BUNTING[Math.floor(s) % BUNTING.length]);
        if (side < 0) e.l = [x, y + H, z]; else e.r = [x, y + H, z];
      }
      poles.push(e);
    }
    let kk = 0;
    // une guirlande : la corde qui pend de a à b, ses fanions et, de loin en loin, une lanterne
    const swag = (a: number[], b: number[], sag: number) => {
      const N = 10, q: number[][] = [];
      for (let k = 0; k <= N; k++) { const t = k / N; q.push([a[0] + (b[0] - a[0]) * t, a[1] - 0.03 + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t]); }
      for (let k = 0; k < N; k++) tube(p, q[k], q[k + 1], 0.004, 0.004, 0xb8a07a, 3);
      const dx = b[0] - a[0], dz = b[2] - a[2], d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      for (let k = 1; k < N; k++, kk++) {
        const [x, y, z] = q[k], c = BUNTING[kk % BUNTING.length];
        if (k % 3 === 0) { p.cyl(0.003, 0.003, 0.03, 3, x, y - 0.03, z, 0x3a3a3e); g.add(new THREE.IcosahedronGeometry(0.03, 1).scale(1, 1.2, 1), x, y - 0.065, z, k % 2 ? 0xffb050 : 0xff6a4a, 0, true); }
        else tri(p, [x - ux * 0.04, y, z - uz * 0.04], [x + ux * 0.04, y, z + uz * 0.04], [x, y - 0.08, z], c);
      }
    };
    poles.forEach((e, i) => {
      const n = poles[i + 1];
      if (n) { if (e.l && n.l) swag(e.l, n.l, 0.1); if (e.r && n.r) swag(e.r, n.r, 0.1); }
      // de deux mâts en deux mâts, une guirlande d'un côté à l'autre de la route
      if (i % 2 === 0 && e.l && e.r) swag(e.l, e.r, 0.14);
    });
    if (!p.body.length) return;
    const body = new THREE.Mesh(p.build(false).body, mats.body);
    body.castShadow = true;
    this.group.add(body);
    this.own.push(body.geometry);
    if (g.glow.length) {
      const lights = new THREE.Mesh(mergeGeometries(g.glow, false)!, mats.glow);
      for (const x of g.glow) x.dispose();
      this.group.add(lights);
      this.own.push(lights.geometry);
    }
  }

  /** Le char, du bois peint, un plancher doré, un éventail de plumes, des ampoules ; ses trois danseuses, son tambour ; et quatre danseurs devant lui */
  private buildFloat(age: number) {
    const p = new Parts(), g = new Parts(), root = new THREE.Group();
    p.box(0.46, 0.05, 0.95, 0, 0.045, 0, 0x6a4a30);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add(new THREE.CylinderGeometry(0.055, 0.055, 0.035, 8).rotateZ(Math.PI / 2), sx * 0.25, 0.055, sz * 0.3, 0x3a2a20);
    p.box(0.52, 0.03, 1.02, 0, 0.095, 0, 0xf2c23a);
    for (const sx of [-1, 1]) p.box(0.03, 0.05, 1.02, sx * 0.26, 0.095, 0, 0xd84a3e);
    p.box(0.52, 0.05, 0.03, 0, 0.095, 0.51, 0xd84a3e);
    p.box(0.3, 0.04, 0.3, 0, 0.125, -0.18, 0xd84a3e);
    // l'éventail de plumes derrière, entre deux piliers dorés
    for (const sx of [-1, 1]) p.cyl(0.015, 0.02, 0.36, 6, sx * 0.2, 0.125, -0.42, 0xe8c66a);
    for (let i = 0; i < 9; i++) {
      const a = -1.25 + (i / 8) * 2.5, c = PLUME[i % PLUME.length];
      p.add(new THREE.ConeGeometry(0.04, 0.42, 5).translate(0, 0.21, 0), 0, 0.46, -0.42, c, 0, false, -a);
      p.sphere(0.02, Math.sin(a) * 0.44, 0.46 + Math.cos(a) * 0.44, -0.42, 0xffffff);
    }
    // l'astre doré à l'avant, et les ampoules le long du plancher
    p.cyl(0.01, 0.01, 0.2, 5, 0, 0.11, 0.42, 0xe8c66a);
    g.add(new THREE.IcosahedronGeometry(0.07, 1), 0, 0.34, 0.42, 0xffd04a, 0, true);
    for (let k = 0; k < 10; k++) for (const sx of [-1, 1]) g.add(new THREE.IcosahedronGeometry(0.014, 0), sx * 0.27, 0.15, -0.46 + k * 0.1, [0xff4a6a, 0xffd04a, 0x4aa8ff, 0x6ad86a][k % 4], 0, true);
    const hull = new THREE.Mesh(p.build(false).body, mats.body);
    hull.castShadow = true;
    root.add(hull);
    this.own.push(hull.geometry);
    const lights = new THREE.Mesh(mergeGeometries(g.glow, false)!, mats.glow);
    for (const x of g.glow) x.dispose();
    root.add(lights);
    this.own.push(lights.geometry);
    // les danseuses sur le plancher (face à la foule, de part et d'autre), le tambour tout au fond
    const plume = (f: Folk, k: number) => {
      const q = new Parts();
      for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; q.add(new THREE.ConeGeometry(0.03, 0.22, 4).translate(0, 0.11, 0), 0, 0, 0, PLUME[(i + k) % PLUME.length], 0, false, -a); }
      const m = new THREE.Mesh(q.build(false).body, mats.body);
      m.position.set(0, 0.33, 0);
      f.body.add(m);
      this.own.push(m.geometry);
    };
    [[-0.14, 0.2, Math.PI / 2], [0.14, 0.2, -Math.PI / 2], [0, 0.17, 0]].forEach(([x, z, ry], i) => {
      const f = makeFolk({ age, v: 900 + i * 7, woman: true });
      f.root.position.set(x, i === 2 ? 0.145 : 0.11, i === 2 ? -0.17 : z);
      f.root.rotation.y = ry + (i === 2 ? 0 : 0);
      plume(f, i);
      root.add(f.root);
      this.riders.push({ f, i });
    });
    const dr = makeFolk({ age, v: 930, role: 'drummer' });
    dr.root.position.set(0, 0.11, 0.38);
    dr.root.rotation.y = Math.PI;
    root.add(dr.root);
    this.riders.push({ f: dr, i: 9 });
    this.group.add(root);
    this.float = root;
    for (let i = 0; i < 4; i++) {
      const f = makeFolk({ age, v: 950 + i * 11, woman: i % 2 === 0 });
      plume(f, i + 2);
      this.group.add(f.root);
      this.walkers.push({ f, i });
    }
  }

  // ---------- chaque image ----------

  /**
   * `lead` : le premier colon (le char le précède) ; `wild` : l'ambiance, de 0 (la haie qui attend) à 1 (le décollage, tout le monde
   * en délire : plus de confettis, de pétards et de serpentins)
   */
  update(dt: number, lead: [number, number] | null, wild: number) {
    if (!this.on) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const t = this.t, w = this.world;
    // la haie : fanions qui s'agitent, tambours qui battent, trompettes qui sonnent
    for (const g of this.figs) {
      const { f, ph } = g;
      if (g.kind === 'flag') {
        folkStep(f, t * 5 + ph, 'cheer');
        if (g.flag) g.flag.rotation.z = Math.sin(t * 6 + ph) * 0.4;
      } else if (g.kind === 'drum') {
        folkStep(f, t * 3 + ph, 'idle');
        const [r, l] = f.arms;
        r.rotation.x = -0.8 - Math.max(0, Math.sin(t * 10 + ph)) * 0.5; l.rotation.x = -0.8 - Math.max(0, -Math.sin(t * 10 + ph)) * 0.5;
        f.body.rotation.z = Math.sin(t * 5 + ph) * 0.06;
      } else {
        folkStep(f, t * 3 + ph, 'idle');
        const [r, l] = f.arms;
        r.rotation.x = -1.35 + Math.sin(t * 2.2 + ph) * 0.08; l.rotation.x = -1.25 + Math.sin(t * 2.2 + ph) * 0.08;
        f.body.rotation.z = Math.sin(t * 4 + ph) * 0.09;
      }
    }
    // le char va devant les colons, sans jamais les attendre loin derrière ni les dépasser du pas de tir
    const cap = Math.max(3, this.len - 5.4);
    const was = this.sF;
    this.sF = Math.max(this.sF, this.sF + (Math.min(cap, lead ? this.project(lead[0], lead[1]) + 2.6 : 3) - this.sF) * Math.min(1, dt * 1.5));
    this.fMove = Math.min(1, Math.max(0, this.fMove + (this.sF - was > dt * 0.05 ? dt * 3 : -dt * 1.5)));
    if (this.float) {
      const q = this.at(this.sF), y = w.surfaceAt(q.x, q.z);
      this.float.position.set(q.x, y, q.z);
      this.float.rotation.y = Math.atan2(q.tx, q.tz);
      this.float.position.y += Math.sin(t * 9) * 0.004 * (0.3 + wild);
      for (const { f, i } of this.riders) {
        if (i === 9) { folkStep(f, t * 3, 'idle'); f.arms[0].rotation.x = -0.9 - Math.max(0, Math.sin(t * 11)) * 0.5; f.arms[1].rotation.x = -0.9 - Math.max(0, -Math.sin(t * 11)) * 0.5; continue; }
        folkStep(f, t * 7 + i * 1.7, 'cheer');
        f.body.rotation.z = Math.sin(t * 5 + i) * 0.14;
        f.root.position.y = (i === 2 ? 0.145 : 0.11) + Math.abs(Math.sin(t * 6 + i)) * 0.012;
      }
    }
    // les danseurs devant le char : ils tournoient, tantôt les bras levés, tantôt au pas
    for (const { f, i } of this.walkers) {
      const s = Math.min(cap + 1.6, this.sF + 1.15 + i * 0.5), side = i % 2 ? 1 : -1, [x, z] = this.beside(s, side, 0.12 + Math.sin(t * 1.7 + i) * 0.1), q = this.at(s);
      f.root.position.set(x, w.surfaceAt(x, z), z);
      f.root.rotation.y = Math.atan2(q.tx, q.tz) + Math.sin(t * 2.4 + i * 2) * 1.1;
      folkStep(f, t * 8 + i * 2, Math.floor(t / 1.3 + i) % 2 ? 'cheer' : 'walk');
      f.body.rotation.z = Math.sin(t * 6 + i) * 0.1;
    }
    // des confettis qui tombent sur la route, des pétards et des serpentins lancés depuis la foule
    this.rain += dt * (10 + wild * 55);
    while (this.rain >= 1) {
      this.rain--;
      const s = Math.random() * this.len, [x, z] = this.beside(s, Math.random() < 0.5 ? -1 : 1, Math.random() * 1.2 - 0.1);
      this.spawnConf(x, w.surfaceAt(x, z) + 0.7 + Math.random() * 0.7, z, (Math.random() - 0.5) * 0.2, -0.3 - Math.random() * 0.2, (Math.random() - 0.5) * 0.2);
    }
    this.pop -= dt;
    if (this.pop <= 0 && this.spots.length) {
      this.pop = (0.6 + Math.random() * 0.8) / (0.4 + wild);
      const c = this.spots[Math.floor(Math.random() * this.spots.length)], y = w.surfaceAt(c.x, c.z) + 0.25;
      const ix = Math.sin(c.face), iz = Math.cos(c.face);
      for (let k = 0; k < 26; k++) this.spawnConf(c.x, y, c.z, ix * (0.2 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.9, 0.9 + Math.random() * 1.3, iz * (0.2 + Math.random() * 0.9) + (Math.random() - 0.5) * 0.9);
      for (let k = 0; k < 2; k++) this.spawnSerp(c.x, y, c.z, ix * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6, 1.8 + Math.random() * 1.2, iz * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6);
      this.onPop?.();
    }
    this.stepParticles(dt);
  }

  private spawnConf(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    if (this.conf.length >= CONF_CAP) return;
    this.conf.push({ x, y, z, vx, vy, vz, life: 4 + Math.random() * 2, ph: Math.random() * 6.3, c: new THREE.Color(CONF[Math.floor(Math.random() * CONF.length)]) });
  }
  private spawnSerp(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    if (this.serps.length >= SERP_CAP) return;
    this.serps.push({ trail: [x, y, z], x, y, z, vx, vy, vz, life: 3.2, max: 3.2, c: new THREE.Color(CONF[Math.floor(Math.random() * 5)]), acc: 0 });
  }

  private stepParticles(dt: number) {
    const w = this.world, cg = this.confPts.geometry, cp = cg.attributes.position as THREE.BufferAttribute, cc = cg.attributes.color as THREE.BufferAttribute;
    let n = 0;
    for (let i = this.conf.length - 1; i >= 0; i--) {
      const p = this.conf[i];
      p.life -= dt;
      const ground = w.surfaceAt(p.x, p.z) + 0.02;
      // les confettis plongent, puis flottent en se balançant ; au sol, ils restent un moment
      if (p.y > ground) {
        p.vy += (-0.45 - p.vy) * Math.min(1, dt * 1.6);
        p.vx *= Math.exp(-dt * 1.2); p.vz *= Math.exp(-dt * 1.2);
        p.ph += dt * 4;
        p.x += (p.vx + Math.sin(p.ph) * 0.18) * dt; p.y += p.vy * dt; p.z += (p.vz + Math.cos(p.ph * 0.8) * 0.18) * dt;
      } else p.y = ground;
      if (p.life <= 0) { this.conf.splice(i, 1); continue; }
      cp.setXYZ(n, p.x, p.y, p.z); cc.setXYZ(n, p.c.r, p.c.g, p.c.b); n++;
    }
    cg.setDrawRange(0, n); cp.needsUpdate = true; cc.needsUpdate = true;
    const sg = this.serpLines.geometry, sp = sg.attributes.position as THREE.BufferAttribute, sc = sg.attributes.color as THREE.BufferAttribute;
    let m = 0;
    for (let i = this.serps.length - 1; i >= 0; i--) {
      const s = this.serps[i];
      s.life -= dt;
      if (s.life <= 0) { this.serps.splice(i, 1); continue; }
      s.vy -= 2.2 * dt;
      const d = Math.exp(-dt * 0.9);
      s.vx *= d; s.vz *= d; s.vy *= d;
      s.x += s.vx * dt; s.y = Math.max(w.surfaceAt(s.x, s.z) + 0.03, s.y + s.vy * dt); s.z += s.vz * dt;
      s.acc += dt;
      if (s.acc > 0.04) { s.acc = 0; s.trail.push(s.x, s.y, s.z); if (s.trail.length > SERP_PTS * 3) s.trail.splice(0, 3); }
      const k = Math.min(1, s.life / 0.8), tr = s.trail;
      for (let j = 0; j + 5 < tr.length; j += 3) {
        const f = k * (0.4 + 0.6 * (j / tr.length));
        sp.setXYZ(m, tr[j], tr[j + 1], tr[j + 2]); sc.setXYZ(m, s.c.r * f, s.c.g * f, s.c.b * f); m++;
        sp.setXYZ(m, tr[j + 3], tr[j + 4], tr[j + 5]); sc.setXYZ(m, s.c.r * f, s.c.g * f, s.c.b * f); m++;
      }
    }
    sg.setDrawRange(0, m); sp.needsUpdate = true; sc.needsUpdate = true;
  }

  /** La parade est finie : on démonte tout (la haie, le char, les mâts, les confettis) */
  stop() {
    if (!this.on && !this.figs.length) return;
    this.on = false;
    for (const o of [...this.group.children]) if (o !== this.confPts && o !== this.serpLines) this.group.remove(o);
    for (const f of [...this.figs.map((x) => x.f), ...this.riders.map((x) => x.f), ...this.walkers.map((x) => x.f)]) f.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    for (const o of this.own) o.dispose();
    this.figs = []; this.riders = []; this.walkers = []; this.own = []; this.float = null; this.spots = [];
    this.conf = []; this.serps = [];
    this.confPts.visible = this.serpLines.visible = false;
    this.confPts.geometry.setDrawRange(0, 0); this.serpLines.geometry.setDrawRange(0, 0);
  }
}
