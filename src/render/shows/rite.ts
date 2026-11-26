import * as THREE from 'three';
import { Parts } from '../parts';
import { mats } from '../materials';
import { makeFolk, folkStep, holdFolk, type Folk, type FolkPose } from '../folk';
import { tr } from '../../i18n';
import { Puffs, Sparks, disposeTree, glowSprite, type ShowView } from './common';

/**
 * La fête au temple (repère du bâtiment, 2 × 2, l'entrée face à +z) : devant le parvis, une table d'offrandes nappée de blanc
 * et d'or, deux brûle-parfums sur trépied, le prêtre derrière la table et le chœur en blanc de part et d'autre. Les fidèles
 * arrivent des maisons en procession : chacun, à son arrivée, dépose son offrande (amphore, corbeille de fruits, pains, gerbe
 * de fleurs, cierge) et s'agenouille en arc devant le temple. Puis les chants s'élèvent, l'encens monte en grandes volutes, une
 * lueur d'or grandit au-dessus du temple. Pour finir, le prêtre lève les bras, la cloche sonne, une gerbe de poussière d'or
 * monte au ciel : la bénédiction
 */

/** l'attente de la procession (au plus), les chants, la bénédiction, la fin (secondes de jeu) */
const GATHER = 18, CHANT = 16, BLESS = 5.5, END = 2.5;
/** la table des offrandes et les deux brûle-parfums (devant le parvis), le prêtre et le chœur */
const TABLE_Z = 0.9, BURN: [number, number][] = [[-0.32, 0.98], [0.32, 0.98]], PRIEST_Z = 0.76;
const CHOIR: [number, number][] = [[-0.56, 0.86], [-0.72, 0.8], [0.56, 0.86], [0.72, 0.8]];
/** les robes : le prêtre selon l'âge (blanc et or, puis pourpre, puis noir), le chœur en blanc */
const PRIEST = [0xf2ead8, 0xf2ead8, 0x7a2a5a, 0x2a2a30, 0xf4f2ee, 0xe8ecf8];
const GOLD = 0xf2c23a;
/** encens : sa couleur, la lueur d'or */
const INCENSE = 0xeae4f2, HALO = 0xffd27a;

interface Singer { f: Folk; x: number; z: number; ph: number; heading: number }

export interface RiteEvents { chant?: (step: number) => void; bell?: (k: number) => void; roar?: (k: number) => void }

export class RiteView implements ShowView {
  group = new THREE.Group();
  done = false;
  phase: 'gather' | 'chant' | 'bless' | 'end' = 'gather';
  /** les offrandes déposées */
  offered = 0;
  private t = 0;
  private came = false;
  private offerings: { m: THREE.Mesh; t: number }[] = [];
  private flames: THREE.Mesh[] = [];
  private lights: THREE.Sprite[] = [];
  private halo: THREE.Sprite;
  private priest: Singer;
  private choir: Singer[] = [];
  private puffs = new Puffs();
  private motes = new Sparks(700, 0.06);
  private incT = 0;
  private chantT = 0;
  private step = 0;
  private bellT = -1;
  private rnd: () => number;

  /** ce qui se tient devant le parvis, posé sur le terrain (il peut monter devant le temple, posé plus bas) */
  private front = new THREE.Group();

  constructor(age: number, seed: number, private ev: RiteEvents = {}, ground: (x: number, z: number) => number = () => 0) {
    let s = (seed >>> 0) || 11;
    this.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    this.group.add(this.front);
    this.front.position.y = ground(0, TABLE_Z);
    this.front.add(this.puffs.group, this.motes.points);
    // la table des offrandes : pierre (ou bois, au Moyen Âge), nappe blanche à liseré d'or, et les deux brûle-parfums
    const p = new Parts(), top = age === 2 ? 0x8a6040 : 0xe6dccb;
    p.box(0.42, 0.075, 0.16, 0, 0, TABLE_Z, top);
    p.box(0.44, 0.008, 0.18, 0, 0.075, TABLE_Z, 0xf6f2ea);
    p.box(0.445, 0.04, 0.005, 0, 0.042, TABLE_Z + 0.091, 0xf6f2ea); p.box(0.445, 0.008, 0.006, 0, 0.042, TABLE_Z + 0.092, GOLD);
    // sur la nappe, devant : un disque d'or rayonnant, et une guirlande de fleurs qui pend d'un coin à l'autre
    p.add(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 10).rotateX(Math.PI / 2), 0, 0.06, TABLE_Z + 0.096, GOLD);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.box(0.004, 0.012, 0.003, Math.cos(a) * 0.03, 0.054 + Math.sin(a) * 0.03, TABLE_Z + 0.096, GOLD, 0, false, a + Math.PI / 2); }
    for (let k = 0; k <= 12; k++) { const u = k / 12, x = -0.21 + u * 0.42; p.sphere(0.01, x, 0.07 - Math.sin(u * Math.PI) * 0.035, TABLE_Z + 0.098, [0xf24a6a, 0xffffff, 0xf2d04a, 0x6aa84a][k % 4]); }
    // les marches de la table : deux tapis pourpres de part et d'autre
    for (const s of [-1, 1]) p.box(0.12, 0.004, 0.2, s * 0.15, 0, TABLE_Z + 0.2, 0x7a2a5a);
    for (const [x, z] of BURN) {
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.4; p.add(new THREE.CylinderGeometry(0.005, 0.005, 0.2).rotateX(0.16).rotateY(a), x + Math.cos(a) * 0.022, 0.1, z + Math.sin(a) * 0.022, 0xa8783a); }
      p.cyl(0.05, 0.026, 0.04, 8, x, 0.19, z, 0xc8963a);
      p.cyl(0.052, 0.052, 0.008, 8, x, 0.228, z, GOLD);
    }
    // l'encensoir du prêtre (tenu à la main)
    const tab = new THREE.Mesh(p.build(false).body, mats.body);
    tab.castShadow = true;
    this.front.add(tab);
    // les braises des brûle-parfums et leur lueur
    for (const [x, z] of BURN) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 6), new THREE.MeshBasicMaterial({ color: 0xff9a3a, fog: false }));
      fl.position.set(x, 0.26, z);
      this.front.add(fl); this.flames.push(fl);
      const g = glowSprite(0xffa040, 0.32, 0.55);
      g.position.set(x, 0.27, z);
      this.front.add(g); this.lights.push(g);
    }
    // la grande lueur d'or au-dessus du temple (elle grandit avec les chants)
    this.halo = glowSprite(HALO, 0.1, 0);
    this.halo.position.set(0, 1.25, 0.1);
    this.front.add(this.halo);
    // le prêtre, l'encensoir à la main, et le chœur
    const pf = makeFolk({ age: Math.max(1, age), v: seed + 3, size: 1, role: 'monk' });
    robe(pf, PRIEST[Math.min(5, age)], GOLD);
    const cen = new Parts(); cen.cyl(0.016, 0.012, 0.022, 6, 0, -0.05, 0, GOLD); cen.box(0.002, 0.05, 0.002, 0, -0.03, 0, 0x8a6a3a);
    holdFolk(pf, 0, new THREE.Mesh(cen.build(false).body, mats.body), 'upright');
    this.priest = { f: pf, x: 0, z: PRIEST_Z, ph: 0, heading: 0 };
    this.front.add(pf.root);
    CHOIR.forEach(([x, z], i) => {
      const f = makeFolk({ age: Math.max(1, age), v: seed + 17 + i * 5, size: 0.92, woman: i % 2 === 0 });
      robe(f, 0xf8f6f0, i % 2 ? 0x6a8ad8 : GOLD);
      // chaque choriste tient un cierge allumé (sa petite lueur se voit la nuit)
      const c = new Parts(); c.cyl(0.006, 0.006, 0.05, 6, 0, -0.01, 0, 0xf6f0e0); c.cone(0.006, 0.016, 5, 0, 0.04, 0, 0xffc860);
      const candle = new THREE.Mesh(c.build(false).body, mats.body);
      const lit = glowSprite(0xffc070, 0.09, 0.7);
      lit.position.y = 0.05;
      candle.add(lit); this.lights.push(lit);
      holdFolk(f, 0, candle, 'upright');
      this.front.add(f.root);
      this.choir.push({ f, x, z, ph: i * 1.3, heading: 0 });
    });
  }

  /** la procession est arrivée : les chants commencent un instant après */
  ready() { this.came = true; }

  /** Un fidèle arrive : il dépose son offrande sur la table (ou au pied, quand elle est pleine) */
  arrived(i: number) {
    const k = this.offerings.length;
    const m = new THREE.Mesh(offering(k, this.rnd), mats.body);
    const row = k < 6 ? 0 : 1, col = row ? k - 6 : k;
    if (row === 0) m.position.set(-0.17 + col * 0.068, 0.083, TABLE_Z + (col % 2 ? 0.03 : -0.03));
    else m.position.set(-0.22 + (col % 6) * 0.09 + (col >= 6 ? 0.045 : 0), 0, TABLE_Z + 0.16 + (col >= 6 ? 0.07 : 0));
    m.rotation.y = this.rnd() * 6.28;
    m.scale.setScalar(0.01);
    m.castShadow = true;
    this.front.add(m);
    this.offerings.push({ m, t: 0 });
    this.offered++;
    // une petite gerbe d'or là où l'offrande se pose
    this.motes.burst(14, m.position.x, m.position.y + 0.05, m.position.z, GOLD, 0.25, 0.9, 0.2, 0.3, this.rnd);
    void i;
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    const T = this.t;
    if (this.phase === 'gather' && (T > GATHER || (this.came && T > 3))) { this.phase = 'chant'; this.t = 0; this.chantT = 0; this.ev.bell?.(0.6); }
    else if (this.phase === 'chant' && T > CHANT) { this.phase = 'bless'; this.t = 0; this.bellT = 0; this.bless(); }
    else if (this.phase === 'bless' && T > BLESS) { this.phase = 'end'; this.t = 0; }
    else if (this.phase === 'end' && T > END) { this.done = true; return; }
    // les chants, phrase après phrase
    if (this.phase === 'chant' && (this.chantT -= dt) <= 0) { this.chantT = 3.6; this.ev.chant?.(this.step++); }
    // trois coups de cloche à la bénédiction
    if (this.bellT >= 0) { const b = Math.floor(this.bellT / 0.9); this.bellT += dt; if (Math.floor(this.bellT / 0.9) > b && b < 2) this.ev.bell?.(1); }
    // l'encens : un filet pendant la procession, de grandes volutes pendant les chants
    const k = this.phase === 'gather' ? 1.5 : this.phase === 'chant' || this.phase === 'bless' ? 4 : 1;
    this.incT += dt * k;
    while (this.incT >= 1) {
      this.incT -= 1;
      const [x, z] = BURN[Math.floor(this.rnd() * 2)];
      const big = this.phase !== 'gather';
      this.puffs.add(x, 0.28, z, INCENSE, { life: big ? 5 : 3.5, vy: big ? 0.26 : 0.16, s0: 0.07, s1: big ? 0.5 : 0.35, opacity: big ? 0.4 : 0.35, drift: 0.08 }, this.rnd);
    }
    // la lueur d'or grandit avec les chants, éclate à la bénédiction, s'éteint à la fin
    const want = this.phase === 'chant' ? 0.4 + Math.min(1, this.t / CHANT) * 0.8 : this.phase === 'bless' ? 1.8 - this.t * 0.18 : this.phase === 'end' ? Math.max(0, 0.8 - this.t * 0.4) : 0.15;
    const pulse = 1 + Math.sin(this.t * 2.2) * 0.08;
    this.halo.scale.setScalar(Math.max(0.05, want * pulse));
    this.halo.material.opacity = Math.min(0.6, want * 0.4);
    if (this.phase === 'chant' && this.rnd() < dt * 6) this.motes.burst(1, (this.rnd() - 0.5) * 1.4, 0.3 + this.rnd() * 0.4, 0.75 + this.rnd() * 0.4, HALO, 0.05, 3.2, 0.32, 0, this.rnd);
    // les braises vacillent
    this.flames.forEach((f, i) => { const s = 1 + Math.sin(T * 13 + i * 2) * 0.15 + Math.sin(T * 7.3 + i) * 0.1; f.scale.set(1, s * (this.phase === 'gather' ? 0.8 : 1.2), 1); });
    this.lights.forEach((g, i) => { g.material.opacity = 0.45 + Math.sin(T * 9 + i * 3) * 0.08 + (this.phase === 'chant' ? 0.15 : 0); });
    // les offrandes apparaissent en grandissant
    for (const o of this.offerings) if (o.t < 1) { o.t = Math.min(1, o.t + dt * 3); const e = 1 + Math.sin(o.t * Math.PI) * 0.35; o.m.scale.setScalar(Math.max(0.01, o.t * e)); }
    this.stepFolk(dt);
    this.puffs.update(dt);
    this.motes.update(dt);
  }

  /** La bénédiction : une gerbe de poussière d'or monte du parvis au ciel, la foule exulte */
  private bless() {
    this.ev.bell?.(1);
    for (let i = 0; i < 6; i++) this.motes.burst(40, (this.rnd() - 0.5) * 1.2, 0.4, 0.6 + this.rnd() * 0.4, i % 2 ? GOLD : 0xfff2c8, 0.6, 2.6, 0.9, 0.25, this.rnd);
    this.ev.roar?.(0.7);
  }

  private stepFolk(dt: number) {
    const singing = this.phase === 'chant' || this.phase === 'bless';
    // le prêtre : il encense pendant la procession, chante, puis lève les bras pour bénir
    const p = this.priest, pose: FolkPose = this.phase === 'bless' ? 'cheer' : singing ? 'talk' : 'idle';
    p.ph += dt * (pose === 'cheer' ? 3 : 2);
    folkStep(p.f, p.ph, pose);
    if (pose !== 'cheer') p.f.arms[0].rotation.x = -0.5 + Math.sin(p.ph * 1.6) * 0.45;
    p.f.root.position.set(p.x, 0.02, p.z);
    p.f.root.rotation.set(0, p.heading, 0);
    // le chœur se balance en chantant
    for (const c of this.choir) {
      c.ph += dt * 2;
      folkStep(c.f, c.ph, singing ? 'talk' : 'idle');
      c.f.root.position.set(c.x, 0.01, c.z);
      c.f.root.rotation.set(0, c.heading + (singing ? Math.sin(c.ph * 0.9) * 0.18 : 0), singing ? Math.sin(c.ph * 0.9 + 1) * 0.05 : 0);
    }
  }

  board() {
    if (this.phase === 'gather') return `🕯️ <b>${tr('La procession arrive…')}</b><small>${tr('{n} offrandes', { n: this.offered })}</small>`;
    if (this.phase === 'chant') return `🕯️ <b>${tr('Les chants s’élèvent')}</b><small>${tr('{n} offrandes', { n: this.offered })}</small>`;
    return `🕯️ <b>${tr('Bénédiction !')}</b>`;
  }

  dispose() {
    this.puffs.dispose(); this.motes.dispose();
    for (const s of [...this.lights, this.halo]) s.material.dispose();
    for (const f of this.flames) (f.material as THREE.Material).dispose();
    disposeTree(this.group);
  }
}

/** La robe (du cou aux pieds) et son étole de couleur, par-dessus les habits de l'époque */
export function robe(f: Folk, c: number, trim: number) {
  const p = new Parts();
  p.box(0.1, 0.21, 0.075, 0, -0.02, 0, c);
  p.box(0.102, 0.012, 0.077, 0, -0.02, 0, trim);
  p.box(0.022, 0.17, 0.004, 0, 0.0, 0.039, trim);
  const m = new THREE.Mesh(p.build(false).body, mats.body);
  m.castShadow = true;
  f.body.add(m);
}

/** Une offrande (la n-ième) : amphore, corbeille de fruits, pains, gerbe de fleurs, cierge, à tour de rôle */
function offering(n: number, rnd: () => number) {
  const p = new Parts(), kind = n % 5;
  if (kind === 0) { p.cyl(0.016, 0.022, 0.04, 7, 0, 0, 0, 0xc8643a); p.cyl(0.009, 0.015, 0.02, 6, 0, 0.04, 0, 0xc8643a); p.box(0.004, 0.02, 0.012, 0.016, 0.035, 0, 0xb85a32); }
  else if (kind === 1) {
    p.cyl(0.028, 0.02, 0.018, 8, 0, 0, 0, 0xb88a4a);
    for (let i = 0; i < 5; i++) p.sphere(0.011, Math.cos(i * 1.26) * 0.012, 0.022, Math.sin(i * 1.26) * 0.012, [0xd84a3e, 0xf2a03c, 0x7cc46a, 0x8a4ab8, 0xf2d04a][i]);
  } else if (kind === 2) { for (let i = 0; i < 2; i++) p.add(new THREE.SphereGeometry(0.018, 7, 5).scale(1.3, 0.6, 0.9), 0, 0.008 + i * 0.012, (i - 0.5) * 0.012, 0xd8a050); }
  else if (kind === 3) {
    for (let i = 0; i < 5; i++) { const a = i * 1.26 + rnd(); p.box(0.003, 0.05, 0.003, Math.cos(a) * 0.006, 0, Math.sin(a) * 0.006, 0x4a8a3a); p.sphere(0.012, Math.cos(a) * 0.012, 0.05, Math.sin(a) * 0.012, [0xf28aa8, 0xffffff, 0xf2d04a, 0xd84a6a, 0xb48ad8][i]); }
  } else { p.cyl(0.008, 0.008, 0.05, 6, 0, 0, 0, 0xf6f0e0); p.cone(0.007, 0.018, 5, 0, 0.05, 0, 0xffc860); }
  return p.build(false).body;
}
