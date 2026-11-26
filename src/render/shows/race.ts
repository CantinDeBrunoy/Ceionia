import * as THREE from 'three';
import { Parts } from '../parts';
import { mats } from '../materials';
import { makeFolk, folkStep, holdFolk, type Folk, type FolkPose } from '../folk';
import { firstName } from '../../sim/citizens';
import { tr } from '../../i18n';
import { StandsFx, disposeTree, puffTexture, type Kit, type ShowView } from './common';

/**
 * La course au stade d'athlétisme (voir `stadiumBig` de models.ts, ou le plan réduit `stadium`) : un tour de piste, six
 * coureurs, un par couloir, aux maillots de couleurs vives. Ils viennent à leur couloir, départs décalés (le couloir du dehors
 * est plus long : il part plus loin devant), s'accroupissent « à vos marques », le starter lève le bras, coup de pistolet et
 * sa fumée, puis la course : élan, foulées, des dépassements, et le sprint de la ligne droite vers la ligne d'arrivée, où
 * crépitent les flashs des photographes. Les temps sont tirés d'avance (`planRace`) : chacun passe la ligne à son temps (à
 * l'échelle du spectacle). Puis les trois premiers montent sur le podium au milieu de la pelouse, médaille au cou
 */

/** La piste du modèle : centre (z), petit couloir intérieur (demi-axes), largeur d'un couloir, abscisse de la ligne d'arrivée */
const TRACKS = {
  big: { cz: -0.08, rx: 0.94, rz: 0.54, lane: 0.043, line: 0.5, podium: [0, -0.08] as [number, number] },
  small: { cz: 0.1, rx: 0.68, rz: 0.44, lane: 0.037, line: 0.3, podium: [0, 0.1] as [number, number] },
};
const LANES = 6, Y = 0.026;
/** les secondes du chrono affiché valent tant de secondes de jeu (une course de 47 s se court en 21 s) */
const VIS = 0.45;
const ENTER = 8, SET = 2.6, AFTER = 4, PODIUM = 9;
/** les marches du podium (décalage en x, hauteur), de la première à la troisième, et les médailles */
const STEPS: [number, number][] = [[0, 0.075], [-0.115, 0.05], [0.115, 0.035]];
const MEDALS = [0xf2c23a, 0xdfe4ea, 0xd08a4a];
const SHIRTS = [0xe8322a, 0x2a8ae8, 0xf2c23a, 0x2ab84a, 0xa04ad8, 0xf08a2a];

interface Runner { f: Folk; lane: number; T: number; rank: number; wob: number; name: string; x: number; z: number; heading: number; phase: number; tx: number; tz: number; pose: FolkPose | null; speed: number; done: boolean }

export interface RaceEvents { gun?: () => void; roar?: (k: number) => void; whistle?: () => void }

export class RaceView implements ShowView {
  group = new THREE.Group();
  done = false;
  phase: 'enter' | 'set' | 'run' | 'after' | 'podium' = 'enter';
  /** le chrono (en secondes affichées) */
  chrono = 0;
  private runners: Runner[] = [];
  private starter: { f: Folk; x: number; z: number; heading: number; phase: number };
  private t = 0;
  private trk: typeof TRACKS.big;
  private len: number[] = [];
  private tables: Float32Array[] = [];
  private stands: StandsFx;
  private flashes: { s: THREE.Sprite; t: number }[] = [];
  private smoke: { s: THREE.Sprite; t: number }[] = [];
  private podium: THREE.Mesh;
  private medals: THREE.Mesh[] = [];
  private rnd: () => number;
  private finished = 0;

  constructor(times: number[], big: boolean, private kit: Kit, private ev: RaceEvents = {}) {
    let s = (kit.seed >>> 0) || 5;
    this.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    this.trk = big ? TRACKS.big : TRACKS.small;
    const order = times.map((t, i) => [t, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    for (let i = 0; i < LANES; i++) this.measure(i);
    for (let i = 0; i < LANES; i++) {
      const woman = this.rnd() < 0.5;
      const f = makeFolk({ age: Math.max(3, kit.age), v: kit.seed * 5 + i * 17, size: 0.9, woman });
      this.dress(f, SHIRTS[i]);
      this.group.add(f.root);
      // ils entrent par la tribune (côté -z), au milieu
      const r: Runner = { f, lane: i, T: times[i] * VIS, rank: order.indexOf(i), wob: (this.rnd() - 0.5) * 2, name: firstName(kit.seed + i * 7, kit.age, woman), x: -0.2 + i * 0.07, z: this.trk.cz - this.trk.rz - 0.4, heading: 0, phase: this.rnd() * 6, tx: 0, tz: 0, pose: null, speed: 0, done: false };
      [r.tx, r.tz] = this.at(i, 0);
      this.runners.push(r);
    }
    // le starter, en blanc, pistolet en main, près de la ligne à l'intérieur
    const sf = makeFolk({ age: Math.max(3, kit.age), v: kit.seed + 99, size: 0.9, woman: false });
    this.dress(sf, 0xf4f2ee);
    const gun = new Parts(); gun.box(0.012, 0.03, 0.012, 0, 0, 0, 0x2a2a2e); gun.box(0.012, 0.012, 0.03, 0, 0.022, 0.01, 0x2a2a2e);
    const gm = new THREE.Mesh(gun.build(false).body, mats.body);
    holdFolk(sf, 0, gm, 'upright');
    this.group.add(sf.root);
    const [lx, lz] = this.at(0, 0);
    this.starter = { f: sf, x: lx - 0.05, z: lz - 0.09, heading: Math.PI, phase: 0 };
    // le podium au milieu de la pelouse : trois marches blanches, leurs numéros
    const pp = new Parts(), [px, pz] = this.trk.podium;
    STEPS.forEach(([dx, h], i) => {
      pp.box(0.11, h, 0.095, px + dx, Y, pz, 0xf4f2ee); pp.box(0.112, 0.01, 0.097, px + dx, Y + h - 0.01, pz, MEDALS[i]);
      // le numéro de la marche, face à la tribune
      pp.box(0.02, 0.026, 0.003, px + dx, Y + h * 0.3, pz - 0.049, 0x2a2a2e);
    });
    this.podium = new THREE.Mesh(pp.build(false).body, mats.body);
    this.podium.visible = false;
    this.group.add(this.podium);
    this.stands = new StandsFx(kit, [SHIRTS[order[0]], SHIRTS[order[1]]]);
    this.group.add(this.stands.group);
  }

  /** Le maillot de course (débardeur et short) */
  private dress(f: Folk, c: number) {
    const p = new Parts();
    // (plus large que les habits de l'époque, qu'il couvre)
    p.box(0.1, 0.1, 0.07, 0, 0.096, 0, c);
    p.box(0.1, 0.04, 0.07, 0, 0.06, 0, 0x2a2a2e);
    p.box(0.034, 0.03, 0.004, 0, 0.13, 0.037, 0xf4f2ee);
    const m = new THREE.Mesh(p.build(false).body, mats.body);
    m.castShadow = true;
    f.body.add(m);
  }

  /** Le tour de piste du couloir i : sa longueur, et une table pour y avancer à pas réguliers */
  private measure(i: number) {
    const n = 256, tb = new Float32Array(n + 1);
    let L = 0, [x0, z0] = this.ellipse(i, 0);
    for (let k = 1; k <= n; k++) {
      const [x, z] = this.ellipse(i, (k / n) * Math.PI * 2);
      L += Math.hypot(x - x0, z - z0); tb[k] = L; x0 = x; z0 = z;
    }
    this.len[i] = L; this.tables[i] = tb;
  }

  /** Un point du couloir i, à l'angle a compté depuis la ligne d'arrivée, dans le sens de la course (vers -x côté +z) */
  private ellipse(i: number, a: number): [number, number] {
    const t = this.trk, rx = t.rx + (i + 0.5) * t.lane, rz = t.rz + (i + 0.5) * t.lane;
    const a0 = Math.acos(Math.min(1, t.line / rx));
    return [rx * Math.cos(a0 + a), t.cz + rz * Math.sin(a0 + a)];
  }

  /** Le point du couloir i à la distance d (le long du couloir) de la ligne d'arrivée */
  private along(i: number, d: number): [number, number] {
    const tb = this.tables[i], L = this.len[i];
    d = ((d % L) + L) % L;
    let lo = 0, hi = tb.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tb[m] < d) lo = m; else hi = m; }
    const k = (lo + (d - tb[lo]) / Math.max(1e-6, tb[hi] - tb[lo])) / (tb.length - 1);
    return this.ellipse(i, k * Math.PI * 2);
  }

  /** Où est le coureur du couloir i à la part `f` de sa course : départ décalé de l'écart de longueur avec le premier couloir */
  private at(i: number, f: number): [number, number] {
    const L0 = this.len[0], start = this.len[i] - L0;
    return this.along(i, start + f * L0);
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    this.stands.update(dt);
    const ph = this.phase;
    if (ph === 'enter') {
      if (this.t > ENTER) { this.phase = 'set'; this.t = 0; this.ev.whistle?.(); for (const r of this.runners) r.pose = 'gather'; this.stands.heat = [0.15, 0.15]; }
    } else if (ph === 'set') {
      if (this.t > SET) { this.phase = 'run'; this.t = 0; this.ev.gun?.(); this.ev.roar?.(0.7); this.stands.cheer(-1, 0.8); this.puff(); for (const r of this.runners) r.pose = null; }
    } else if (ph === 'run') {
      this.chrono = this.t / VIS;
      for (const r of this.runners) {
        if (r.done) continue;
        const f = this.progress(r, this.t);
        if (f >= 1) {
          r.done = true; this.finished++;
          if (r.rank === 0) { this.ev.roar?.(1); this.stands.cheer(-1, 1.1); this.flash(30); }
          else this.flash(6);
        }
        [r.tx, r.tz] = this.at(r.lane, r.done ? 1.07 : f);
        // les foulées s'allongent dans la dernière ligne droite
        if (f > 0.75 && !r.done) this.stands.heat = [Math.max(this.stands.heat[0], 0.6), Math.max(this.stands.heat[1], 0.6)];
      }
      if (this.finished === LANES) { this.phase = 'after'; this.t = 0; }
    } else if (ph === 'after') {
      // ils ralentissent après la ligne, puis les trois premiers vont au podium
      if (this.t > AFTER) { this.phase = 'podium'; this.t = 0; this.toPodium(); }
    } else if (ph === 'podium') {
      if (this.t > PODIUM) this.done = true;
    }
    for (const r of this.runners) this.step(r, dt);
    this.stepStarter(dt);
    this.fx(dt);
  }

  /** La part de course faite au temps t : départ en accélération, de petits écarts qui se font et se défont, arrivée à son temps */
  private progress(r: Runner, t: number) {
    const u = Math.min(1, t / r.T);
    const accel = u < 0.08 ? (u * u) / 0.16 : u - 0.04;
    return Math.min(1, accel / 0.96 + r.wob * 0.035 * Math.sin(Math.PI * u) * Math.sin(Math.PI * u * 2));
  }

  /** Le coureur suit sa cible (son point de course), avec la pose qui va avec sa vitesse */
  private step(r: Runner, dt: number) {
    const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
    if (this.phase === 'run' && !r.done) {
      // en course : il est à sa place, au plus près
      const v = d / Math.max(dt, 1e-4);
      r.speed += (v - r.speed) * Math.min(1, dt * 6);
      r.x = r.tx; r.z = r.tz;
      if (d > 1e-4) r.heading = Math.atan2(dx, dz);
    } else {
      const want = this.phase === 'after' && r.done ? 0.18 : 0.14, v = d > 0.006 ? Math.min(want, d * 2.5) : 0;
      r.speed += (v - r.speed) * Math.min(1, dt * 3);
      if (d > 0.002) { r.x += (dx / d) * r.speed * dt; r.z += (dz / d) * r.speed * dt; }
      const look = d > 0.02 ? Math.atan2(dx, dz) : this.phase === 'set' ? this.runDir(r) : this.phase === 'podium' ? (r.rank < 3 ? Math.PI : Math.atan2(this.trk.podium[0] - r.x, this.trk.podium[1] - r.z)) : r.heading;
      let da = look - r.heading; da = Math.atan2(Math.sin(da), Math.cos(da));
      r.heading += da * Math.min(1, dt * 5);
    }
    const pose: FolkPose = r.pose && (r.pose !== 'gather' || d < 0.02) ? r.pose : r.speed > 0.12 ? 'run' : r.speed > 0.02 ? 'walk' : 'idle';
    r.phase += dt * (pose === 'run' ? Math.min(16, 6 + r.speed * 30) : pose === 'walk' ? 7 : pose === 'cheer' ? 5 : 1.5);
    folkStep(r.f, r.phase, pose);
    const up = this.phase === 'podium' && r.rank < 3 && d < 0.03 ? STEPS[r.rank][1] : 0;
    r.f.root.position.set(r.x, Y + up, r.z);
    r.f.root.rotation.set(0, r.heading, 0);
  }

  /** Le sens de la course, au point où se tient le coureur (accroupi sur la ligne, il regarde devant lui) */
  private runDir(r: Runner) {
    const [x0, z0] = this.at(r.lane, 0), [x1, z1] = this.at(r.lane, 0.01);
    return Math.atan2(x1 - x0, z1 - z0);
  }

  private stepStarter(dt: number) {
    const s = this.starter, gun = this.phase === 'set' && this.t > SET - 1.2 || this.phase === 'run' && this.t < 0.8;
    s.phase += dt * 2;
    folkStep(s.f, s.phase, gun ? 'cheer' : 'idle');
    // un seul bras levé : le droit, pistolet au ciel
    if (gun) s.f.arms[1].rotation.x = 0;
    s.f.root.position.set(s.x, Y, s.z);
    s.f.root.rotation.set(0, s.heading, 0);
  }

  /** Les trois premiers montent sur le podium, médaille au cou ; les autres se rangent à côté et applaudissent */
  private toPodium() {
    this.podium.visible = true;
    const [px, pz] = this.trk.podium;
    for (const r of this.runners) {
      if (r.rank < 3) {
        r.tx = px + STEPS[r.rank][0]; r.tz = pz; r.pose = r.rank === 0 ? 'cheer' : null;
        const m = new Parts(); m.add(new THREE.CylinderGeometry(0.014, 0.014, 0.005, 10).rotateX(Math.PI / 2), 0, 0.125, 0.038, MEDALS[r.rank]);
        const mesh = new THREE.Mesh(m.build(false).body, mats.body);
        r.f.body.add(mesh); this.medals.push(mesh);
      } else { r.tx = px + 0.25 + (r.rank - 3) * 0.09; r.tz = pz + 0.06; r.pose = 'cheer'; }
    }
    this.ev.roar?.(0.8);
    this.stands.cheer(-1, 1);
  }

  /** La fumée du coup de pistolet */
  private puff() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0xf4f2ee, transparent: true, depthWrite: false }));
    s.position.set(this.starter.x, 0.3, this.starter.z);
    this.group.add(s);
    this.smoke.push({ s, t: 0 });
  }

  /** Les flashs des photographes dans la tribune */
  private flash(n: number) {
    for (let i = 0; i < n; i++) {
      const p = this.kit.spots[Math.floor(this.rnd() * this.kit.spots.length)];
      if (!p) return;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(p.x, p.y + 0.04, p.z);
      s.scale.setScalar(0.0001);
      this.group.add(s);
      this.flashes.push({ s, t: -this.rnd() * 1.2 });
    }
  }

  private fx(dt: number) {
    this.flashes = this.flashes.filter((f) => {
      f.t += dt;
      if (f.t < 0) return true;
      if (f.t > 0.18) { this.group.remove(f.s); f.s.material.dispose(); return false; }
      f.s.scale.setScalar(0.12 * (1 - f.t / 0.18) + 0.02);
      return true;
    });
    this.smoke = this.smoke.filter((f) => {
      f.t += dt;
      if (f.t > 2.5) { this.group.remove(f.s); f.s.material.dispose(); return false; }
      f.s.scale.setScalar(0.05 + f.t * 0.08); f.s.position.y += dt * 0.04; f.s.material.opacity = 0.8 * (1 - f.t / 2.5);
      return true;
    });
  }

  /** Le tableau : le chrono en course, puis les trois premiers et leurs temps */
  board() {
    const fmt = (t: number) => t.toFixed(2).replace('.', tr(','));
    if (this.phase === 'enter') return `🏃 <b>${tr('Les coureurs entrent')}</b>`;
    if (this.phase === 'set') return `🏃 <b>${tr('À vos marques…')}</b>`;
    if (this.phase === 'run') return `🏃 <span class="sc">${fmt(this.chrono)}</span><small>${tr('{n} arrivés sur {m}', { n: this.finished, m: LANES })}</small>`;
    const top = this.runners.filter((r) => r.rank < 3).sort((a, b) => a.rank - b.rank);
    return `<ol>${top.map((r) => `<li>${['🥇', '🥈', '🥉'][r.rank]}</li><li><i style="background:#${SHIRTS[r.lane].toString(16).padStart(6, '0')}"></i> ${r.name}</li><li>${fmt(r.T / VIS)} s</li>`).join('')}</ol>`;
  }

  /** le nom et le temps du vainqueur */
  winner() { const r = this.runners.find((x) => x.rank === 0)!; return { name: r.name, t: r.T / VIS }; }

  dispose() {
    for (const f of [...this.flashes, ...this.smoke]) f.s.material.dispose();
    disposeTree(this.group); this.stands.dispose();
  }
}
