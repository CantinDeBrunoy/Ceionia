import * as THREE from 'three';
import { Parts } from '../parts';
import { mats } from '../materials';
import { arenaBout, drawChampion, type ArenaKit, type BoutKind } from '../arena';
import { firstName } from '../../sim/citizens';
import { tr } from '../../i18n';
import { Puffs, Sparks, StandsFx, disposeTree, glowSprite, type Kit, type ShowView, type Spot } from './common';
import { esc } from '../../core/esc';

/**
 * Le tournoi de l'arène (repère du bâtiment, 3 × 3) : deux champions s'affrontent en manches, jusqu'à deux manches gagnées.
 * Le combat est celui de l'âge, avec les champions mêmes du modèle (`drawChampion` de arena.ts, dessinés par le kit de l'arène :
 * leurs bras, leur masse et leur scie deviennent ici des pièces animées) : pugilistes aux cestes dans le sable du Colisée,
 * chevaliers qui joutent de part et d'autre de la lice, lutteurs sur le ring de la salle de combat, boxeurs, puis robots dans
 * la fosse. Pendant le tournoi, le modèle se dessine sans ses propres combattants (`bare`). À chaque coup, une gerbe (poussière,
 * échardes de lance, étincelles) et la tribune du camp qui se lève ; à la fin de chaque manche, le perdant tombe (ou vacille
 * en selle) et le vainqueur lève les bras. Pour finir, une couronne descend du ciel sur la tête du vainqueur et toute l'arène
 * exulte (écharpes, fumigènes, confettis : `StandsFx`)
 */

const ENTER = 4, CROWN = 8;
/** une manche aux poings (ou de robots) : la garde, l'échange, le coup décisif et la chute, le relevé */
const GUARD = 1, FIGHT = 5, KO = 2.6, RISE = 1.2;
const ROUND = GUARD + FIGHT + KO + RISE;
/** une passe de joute : prêts, la charge (la rencontre au milieu), le retour au pas vers son bout de la lice */
const READY = 1, CHARGE = 2.2, BACK = 2.2;
const PASSE = READY + CHARGE + BACK;
/** la taille des champions (plus grands que ceux du modèle : ils doivent se voir de loin) */
const SCALE: Record<BoutKind, number> = { fist: 1.7, joust: 1.3, robot: 1.2 };
/** la hauteur du haut de la tête (repère du champion), où se pose la couronne */
const TOP: Record<BoutKind, number> = { fist: 0.19, joust: 0.3, robot: 0.41 };
const ROBOTS = ['Titan', 'Volt', 'Rouage', 'Méga', 'Boulon', 'Orage'];
const GOLD = 0xf2c23a;

interface Piece { o: THREE.Object3D; axis: THREE.Vector3; spin: boolean; amp: number; freq: number }
interface Champ {
  root: THREE.Group; tilt: THREE.Group; pieces: Piece[]; side: 0 | 1; name: string; wins: number;
  x: number; z: number; heading: number; lean: number; leanTo: number; arms: 'guard' | 'punch' | 'up'; bob: number; moving: boolean;
}

export interface TourneyEvents { hit?: (k: BoutKind) => void; bell?: () => void; roar?: (k: number) => void }

export class TourneyView implements ShowView {
  group = new THREE.Group();
  done = false;
  phase: 'enter' | 'round' | 'crown' = 'enter';
  /** la manche en cours (0, 1, 2) */
  round = 0;
  champs: Champ[] = [];
  private kind: BoutKind;
  private bout: ReturnType<typeof arenaBout>;
  private t = 0;
  private T = 0;
  private hits: { at: number; by: 0 | 1; done: boolean }[] = [];
  private stands: StandsFx;
  private puffs = new Puffs();
  private sparks = new Sparks(800, 0.045);
  private crown: THREE.Group | null = null;
  private crownGlow: THREE.Sprite | null = null;
  private rnd: () => number;
  private s: number;

  constructor(private age: number, private rounds: (0 | 1)[], private kit: Kit, private ev: TourneyEvents = {}) {
    let sd = (kit.seed >>> 0) || 17;
    this.rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    this.bout = arenaBout(age);
    this.kind = this.bout.kind;
    // (les pugilistes du Colisée, dans un grand cercle de sable, plus grands encore que les boxeurs sur leur ring)
    this.s = this.kind === 'fist' && age <= 1 ? 2.1 : SCALE[this.kind];
    for (const side of [0, 1] as const) {
      // (deux noms différents : le tableau doit les distinguer)
      let name = '';
      for (let k = 0; k < 8 && (!name || name === this.champs[0]?.name); k++) {
        name = this.kind === 'robot' ? `${ROBOTS[(kit.seed + side * 3 + k) % ROBOTS.length]}-${1 + ((kit.seed >> (side + 2)) % 9)}` : firstName(kit.seed + side * 31 + k * 13, age, false);
      }
      const c = this.rig(side, name);
      this.champs.push(c);
      this.group.add(c.root);
    }
    // ils entrent par les deux bouts de l'aire
    const b = this.bout;
    for (const c of this.champs) {
      const sg = c.side ? 1 : -1;
      if (this.kind === 'joust') { c.x = sg * b.half; c.z = b.lanes[c.side]; c.heading = -sg * Math.PI / 2; }
      else { c.x = sg * (b.half + (age <= 1 ? 0.35 : 0)); c.z = b.cz; c.heading = -sg * Math.PI / 2; }
      c.root.userData.from = c.x;
    }
    this.stands = new StandsFx({ ...kit, spots: arenaSpots(age) }, b.colors);
    this.group.add(this.stands.group, this.puffs.group, this.sparks.points);
    this.place(0);
  }

  /**
   * Un champion : le dessin du modèle (`drawChampion`), son corps en un maillage, chacune des pièces que le kit fait bouger
   * (bras, masse, scie) en un maillage à part, accroché à son pivot ; le tout penche autour de ses pieds (`tilt` : la chute)
   */
  private rig(side: 0 | 1, name: string): Champ {
    const pieces: { p: Parts; pivot: [number, number, number]; axis: [number, number, number]; spin: boolean; amp: number; freq: number }[] = [];
    const mk = (spin: boolean) => (pivot: [number, number, number], axis: [number, number, number], amp: number, freq: number) => { const p = new Parts(); pieces.push({ p, pivot, axis, spin, amp, freq }); return p; };
    const body = new Parts();
    const kit: ArenaKit = { sway: mk(false), swing: mk(false), turn: (pv, ax, sp) => mk(true)(pv, ax, 0, sp), smoke: () => {}, fan: (draw) => draw(body) };
    drawChampion(body, this.age, kit, side);
    const root = new THREE.Group(), tilt = new THREE.Group();
    root.add(tilt);
    tilt.scale.setScalar(this.s);
    const add = (parent: THREE.Object3D, p: Parts) => {
      const g = p.build(false);
      const m = new THREE.Mesh(g.body, mats.body); m.castShadow = true; parent.add(m);
      if (g.glow) parent.add(new THREE.Mesh(g.glow, mats.glow));
    };
    add(tilt, body);
    const out: Piece[] = pieces.map((q) => {
      const o = new THREE.Object3D();
      o.position.set(...q.pivot);
      add(o, q.p);
      tilt.add(o);
      return { o, axis: new THREE.Vector3(...q.axis).normalize(), spin: q.spin, amp: q.amp, freq: q.freq };
    });
    return { root, tilt, pieces: out, side, name, wins: 0, x: 0, z: 0, heading: 0, lean: 0, leanTo: 0, arms: 'guard', bob: this.rnd() * 6, moving: false };
  }

  update(dt: number) {
    if (this.done) return;
    dt = Math.min(dt, 0.1);
    this.t += dt; this.T += dt;
    if (this.phase === 'enter') {
      // ils s'avancent jusqu'au milieu (les chevaliers attendent à leur bout de la lice)
      if (this.kind !== 'joust') for (const c of this.champs) {
        const k = Math.min(1, this.t / (ENTER - 0.8)), to = (c.side ? 1 : -1) * (this.kind === 'robot' ? 0.15 : 0.075) * this.s;
        c.x = (c.root.userData.from as number) * (1 - k) + to * k; c.moving = k < 1;
      }
      if (this.t > ENTER) { this.phase = 'round'; this.t = 0; this.startRound(); }
    }
    else if (this.phase === 'round') this.stepRound();
    else if (this.phase === 'crown') this.stepCrown(dt);
    this.place(dt);
    this.stands.update(dt);
    this.puffs.update(dt);
    this.sparks.update(dt);
  }

  /** Une manche commence : la cloche, et les coups tirés d'avance (le dernier, décisif, au vainqueur de la manche) */
  private startRound() {
    this.ev.bell?.();
    this.hits = [];
    const w = this.rounds[this.round];
    if (this.kind === 'joust') { this.hits.push({ at: READY + CHARGE / 2, by: w, done: false }); return; }
    let t = GUARD + 0.5;
    while (t < GUARD + FIGHT - 0.6) { this.hits.push({ at: t, by: this.rnd() < 0.5 ? 0 : 1, done: false }); t += 0.65 + this.rnd() * 0.5; }
    this.hits.push({ at: GUARD + FIGHT + 0.15, by: w, done: false });
    for (const c of this.champs) { c.leanTo = 0; c.arms = 'guard'; }
  }

  private stepRound() {
    const u = this.t, b = this.bout, [A, B] = this.champs, w = this.rounds[this.round], last = this.round === this.rounds.length - 1;
    if (this.kind === 'joust') {
      // les deux chevaliers chargent l'un vers l'autre de part et d'autre de la lice, puis reviennent au pas à leur bout
      for (const c of this.champs) {
        const sg = c.side ? 1 : -1;
        c.z = b.lanes[c.side];
        if (u < READY) { c.x = sg * b.half; c.heading = -sg * Math.PI / 2; c.moving = false; }
        else if (u < READY + CHARGE) { const k = (u - READY) / CHARGE; c.x = sg * b.half * (1 - 2 * k); c.heading = -sg * Math.PI / 2; c.moving = true; }
        else { const k = Math.min(1, (u - READY - CHARGE) / (BACK * 0.9)); c.x = -sg * b.half * (1 - 2 * k); c.heading = sg * Math.PI / 2; c.moving = k < 1; }
      }
    } else {
      // aux poings (ou de robots) : face à face, en garde, ils tournent un peu l'un autour de l'autre
      const th = Math.sin(this.T * 0.35) * 0.35, gap = (this.kind === 'robot' ? 0.15 : 0.075) * this.s;
      const ox = Math.cos(th) * gap, oz = Math.sin(th) * gap;
      if (A.leanTo > -1) { A.x = -ox; A.z = b.cz - oz; }
      if (B.leanTo > -1) { B.x = ox; B.z = b.cz + oz; }
      A.heading = Math.atan2(B.x - A.x, B.z - A.z); B.heading = Math.atan2(A.x - B.x, A.z - B.z);
    }
    // les coups
    for (const h of this.hits) if (!h.done && u >= h.at) { h.done = true; this.strike(h.by, h === this.hits[this.hits.length - 1]); }
    // la manche est jouée : le vainqueur lève les bras, et la suivante, ou la couronne
    if (this.kind === 'joust') {
      // (le perdant de la passe se redresse en selle ; à la dernière, il reste désarçonné)
      if (u > READY + CHARGE / 2 + 0.9 && !last) for (const c of this.champs) c.leanTo = 0;
      if (u > READY + CHARGE / 2 + 0.5 && this.champs[w].wins < this.score(w)) { this.champs[w].wins = this.score(w); this.ev.roar?.(0.7); }
      if (u > PASSE) this.endRound(w, last);
    } else {
      if (u > GUARD + FIGHT + 0.8 && this.champs[w].arms !== 'up') { this.champs[w].arms = 'up'; this.champs[w].wins = this.score(w); }
      if (u > GUARD + FIGHT + KO && !last && this.champs[1 - w].leanTo < 0) this.champs[1 - w].leanTo = 0;
      if (u > (last ? GUARD + FIGHT + KO : ROUND)) this.endRound(w, last);
    }
  }

  /** les manches gagnées par ce champion, jusqu'à celle-ci comprise */
  private score(side: 0 | 1) { return this.rounds.slice(0, this.round + 1).filter((x) => x === side).length; }

  private endRound(w: 0 | 1, last: boolean) {
    this.champs[w].wins = this.score(w);
    if (last) { this.phase = 'crown'; this.t = 0; this.toCrown(); return; }
    this.round++; this.t = 0;
    for (const c of this.champs) { c.leanTo = 0; c.arms = 'guard'; }
    this.startRound();
  }

  /** Un coup porté par `by` : il se fend vers l'autre, la gerbe du coup, le bruit, la tribune de son camp ; `ko` : le coup décisif */
  private strike(by: 0 | 1, ko: boolean) {
    const a = this.champs[by], d = this.champs[1 - by], b = this.bout;
    const x = (a.x + d.x) / 2, z = this.kind === 'joust' ? b.cz : (a.z + d.z) / 2, y = b.y + TOP[this.kind] * this.s * (this.kind === 'joust' ? 0.75 : 0.7);
    if (this.kind === 'joust') {
      // la lance se brise : des échardes, des étincelles ; le perdant vacille en selle
      this.sparks.burst(40, x, y, z, 0x9a6a3a, 0.7, 1.2, 0.3, 1.2, this.rnd);
      this.sparks.burst(20, x, y, z, 0xfff2c8, 0.5, 0.5, 0.2, 0.5, this.rnd);
      this.puffs.add(x, b.y + 0.02, z, 0xd8c8a0, { life: 1.6, vy: 0.05, s0: 0.1, s1: 0.45, opacity: 0.5 }, this.rnd);
      d.leanTo = ko && this.round === this.rounds.length - 1 ? -0.75 : -0.5;
      setLean(d, 0.9);
    } else {
      a.arms = 'punch'; setPunch(a, 0.35);
      d.lean = Math.min(d.lean, -0.3);
      if (this.kind === 'robot') { this.sparks.burst(ko ? 60 : 24, x, y, z, this.rnd() < 0.5 ? 0xffd24a : 0x6ae8ff, 0.8, 0.7, 0.2, 1, this.rnd); this.puffs.add(x, y, z, 0x8a8a92, { life: 1.4, vy: 0.1, s0: 0.05, s1: 0.25, opacity: 0.5 }, this.rnd); }
      else { this.sparks.burst(ko ? 30 : 10, x, y, z, 0xffffff, 0.5, 0.4, 0.1, 0.6, this.rnd); this.puffs.add(x, b.y + 0.02, z, 0xe0d0b0, { life: 1, vy: 0.04, s0: 0.05, s1: 0.22, opacity: 0.45 }, this.rnd); }
      if (ko) d.leanTo = -1.45;
    }
    this.ev.hit?.(this.kind);
    this.stands.cheer(by, ko ? 1.1 : 0.55);
    if (ko || this.rnd() < 0.3) this.ev.roar?.(ko ? 0.9 : 0.35);
  }

  /** Le tournoi est gagné : le vainqueur va au milieu, face à la foule ; le perdant se relève à côté */
  private toCrown() {
    const w = this.champs.find((c) => c.wins >= 2) ?? this.champs[this.rounds[this.rounds.length - 1]];
    const l = this.champs[1 - w.side], b = this.bout;
    w.x = 0; w.z = this.kind === 'joust' ? b.lanes[w.side] : b.cz; w.heading = 0; w.leanTo = 0; w.arms = 'up';
    l.leanTo = 0; l.arms = 'guard';
    if (this.kind === 'joust') { l.x = (l.side ? 1 : -1) * b.half * 0.8; l.heading = 0; }
    else { l.x = (w.side ? -1 : 1) * 0.2 * this.s; l.z = b.cz + 0.02; l.heading = 0; }
    // la couronne de l'âge, au-dessus de sa tête : laurier, couronne d'or, anneau de lumière
    const p = new Parts();
    if (this.age <= 1) { p.add(new THREE.TorusGeometry(0.03, 0.007, 4, 12).rotateX(Math.PI / 2), 0, 0, 0, 0x4a9a3a); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.add(new THREE.SphereGeometry(0.009, 5, 4).scale(1.6, 0.6, 1), Math.cos(a) * 0.032, 0.004, Math.sin(a) * 0.032, i % 2 ? 0x5aaa4a : GOLD); } }
    else if (this.age >= 5) { p.add(new THREE.TorusGeometry(0.035, 0.004, 4, 16).rotateX(Math.PI / 2), 0, 0, 0, GOLD); p.add(new THREE.TorusGeometry(0.035, 0.006, 4, 16).rotateX(Math.PI / 2), 0, 0.01, 0, 0x9ae8ff, 0, 'neon'); }
    else {
      p.add(new THREE.CylinderGeometry(0.03, 0.028, 0.02, 10, 1, true), 0, 0.01, 0, GOLD);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; p.cone(0.009, 0.022, 4, Math.cos(a) * 0.029, 0.02, Math.sin(a) * 0.029, GOLD); p.sphere(0.005, Math.cos(a) * 0.03, 0.012, Math.sin(a) * 0.03, i % 2 ? 0xd83a3a : 0x3a6ad8); }
    }
    const g = p.build(false), crown = new THREE.Group();
    crown.add(new THREE.Mesh(g.body, mats.body));
    if (g.glow) crown.add(new THREE.Mesh(g.glow, mats.glow));
    crown.scale.setScalar(this.s * 1.3);
    this.crownGlow = glowSprite(0xffe08a, 0.5, 0.8);
    crown.add(this.crownGlow);
    this.crown = crown;
    this.group.add(crown);
    this.ev.roar?.(1);
  }

  private stepCrown(dt: number) {
    const w = this.champs.find((c) => c.arms === 'up')!, u = this.t, b = this.bout;
    const top = b.y + TOP[this.kind] * this.s + 0.012;
    const k = Math.max(0, Math.min(1, (u - 0.8) / 1.6)), e = 1 - (1 - k) ** 3;
    if (this.crown) {
      this.crown.position.set(w.x, top + (1 - e) * 1.1, w.z);
      this.crown.rotation.y += dt * (k < 1 ? 3 : 0.6);
      if (this.crownGlow) { this.crownGlow.scale.setScalar(k < 1 ? 0.5 : 0.28 + Math.sin(this.T * 3) * 0.04); this.crownGlow.material.opacity = k < 1 ? 0.8 : 0.5; }
    }
    // la couronne se pose : la gerbe d'or, toute l'arène debout
    if (k >= 1 && this.crown && !this.crown.userData.on) {
      this.crown.userData.on = true;
      this.sparks.burst(80, w.x, top + 0.05, w.z, GOLD, 0.8, 1.6, 0.6, 0.6, this.rnd);
      this.stands.cheer(-1, 1.3);
      this.ev.roar?.(1); this.ev.bell?.();
    }
    if (u > 3 && this.rnd() < dt * 0.6) this.stands.cheer(-1, 1);
    if (u > CROWN) this.done = true;
  }

  /** Chaque champion à sa place : il avance au pas (ou au galop), penche quand il tombe, frappe, lève les bras */
  private place(dt: number) {
    const b = this.bout;
    for (const c of this.champs) {
      c.bob += dt * (this.kind === 'joust' ? (c.moving ? 13 : 3) : 7);
      c.lean += (c.leanTo - c.lean) * Math.min(1, dt * (c.leanTo < c.lean ? 6 : 2.5));
      const hop = this.kind === 'joust' ? (c.moving ? Math.abs(Math.sin(c.bob)) * 0.025 : 0) : this.phase === 'round' && c.leanTo === 0 ? Math.abs(Math.sin(c.bob)) * 0.008 : 0;
      c.root.position.set(c.x, b.y + hop, c.z);
      c.root.rotation.set(0, c.heading, 0);
      c.tilt.rotation.x = c.lean;
      // les pièces : en garde, elles battent doucement ; en frappant, vite ; bras levés à la victoire ; la scie tourne
      const punch = (c.tilt.userData.punch ?? 0) as number;
      if (punch > 0) c.tilt.userData.punch = Math.max(0, punch - dt);
      for (const [i, q] of c.pieces.entries()) {
        let a: number;
        if (q.spin) a = this.T * q.freq * (this.phase === 'round' ? 6 : 2);
        else if (c.arms === 'up' && c.leanTo === 0) a = -1.35 + Math.sin(this.T * 6 + i) * 0.15;
        else if (punch > 0) a = Math.sin(this.T * 30 + i * Math.PI) * 0.7;
        else a = Math.sin(this.T * Math.PI * 2 * q.freq * 0.5 + i * 1.7) * q.amp * 0.4;
        q.o.quaternion.setFromAxisAngle(q.axis, a);
      }
      if (c.arms === 'punch' && punch <= 0) c.arms = 'guard';
    }
    // le perdant à terre : il glisse un peu en arrière en tombant
    void b;
  }

  board() {
    const chip = (c: number) => `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>`;
    const [A, B] = this.champs, cols = this.bout.colors;
    if (this.phase === 'enter') return `🏆 <b>${tr('Les champions entrent dans l’arène')}</b>`;
    if (this.phase === 'crown') { const w = this.champs.find((c) => c.arms === 'up') ?? A; return `🏆 <b>${tr('{name} est couronné !', { name: esc(w.name) })}</b>`; }
    return `${chip(cols[0])}<b class="tm">${esc(A.name)}</b><span class="sc">${A.wins} – ${B.wins}</span><b class="tm">${esc(B.name)}</b>${chip(cols[1])}<small>${tr('Manche {n}', { n: this.round + 1 })}</small>`;
  }

  /** le nom du vainqueur (à la fin) */
  winner() { return this.champs[this.rounds[this.rounds.length - 1]].name; }

  dispose() {
    this.stands.dispose(); this.puffs.dispose(); this.sparks.dispose();
    this.crownGlow?.material.dispose();
    disposeTree(this.group);
  }
}

function setLean(c: Champ, back: number) { c.lean = Math.min(c.lean, -back * 0.6); }
function setPunch(c: Champ, t: number) { c.tilt.userData.punch = t; }

/**
 * Les places des gradins de l'arène à chaque âge (voir arena.ts), où la foule lève ses écharpes : les anneaux de l'ovale du
 * Colisée, du palais de la boxe et de l'arène des robots ; la grande tribune des lices ; les trois tribunes de la salle de combat.
 * Le camp 0 à gauche (-x), le camp 1 à droite
 */
export function arenaSpots(age: number): Spot[] {
  const out: Spot[] = [], a = Math.min(5, Math.max(1, age));
  const ring = (cz: number, ez: number, rows: [number, number][]) => {
    for (const [r, y] of rows) {
      const n = Math.round((Math.PI * 2 * r) / 0.075);
      for (let k = 0; k < n; k++) { const t = ((k + 0.5) / n) * Math.PI * 2, x = Math.sin(t) * r; out.push({ x, y: y + 0.03, z: cz + Math.cos(t) * r * ez, side: x < 0 ? 0 : 1 }); }
    }
  };
  const line = (x0: number, x1: number, z: number, y: number) => { for (let x = x0; x <= x1; x += 0.07) out.push({ x, y: y + 0.04, z, side: x < 0 ? 0 : 1 }); };
  if (a === 1) ring(-0.06, 0.8, [[0.83, 0.19], [0.93, 0.29], [1.07, 0.445], [1.24, 0.605]]);
  else if (a === 2) { line(-0.86, 0.86, -0.78, 0.09); line(-0.86, 0.86, -1.02, 0.17); line(-0.86, 0.86, -1.26, 0.25); }
  else if (a === 3) {
    for (const [z, y] of [[-0.7, 0.06], [-0.9, 0.12], [-1.1, 0.18]]) line(-0.44, 0.44, z, y);
    for (const s of [-1, 1]) for (const [d, y] of [[0.2, 0.06], [0, 0.12], [-0.2, 0.18]]) for (let k = -0.39; k <= 0.39; k += 0.07) out.push({ x: s * (0.88 - d), y: y + 0.04, z: -0.27 + k, side: s < 0 ? 0 : 1 });
  } else if (a === 4) ring(-0.12, 0.8, [[0.64, 0.073], [0.74, 0.127], [0.88, 0.207], [0.96, 0.253]]);
  else ring(-0.08, 0.86, [[0.72, 0.374], [0.8, 0.418], [0.95, 0.5], [1.14, 0.604]]);
  return out;
}
