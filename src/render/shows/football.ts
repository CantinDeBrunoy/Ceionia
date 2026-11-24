import * as THREE from 'three';
import { Parts } from '../parts';
import { mats } from '../materials';
import { makeFolk, folkStep, type Folk, type FolkPose } from '../folk';
import { MATCH_TIME, type MatchPlan } from '../../sim/shows';
import { StandsFx, type Kit, type ShowView, disposeTree } from './common';

/**
 * Le match au stade de football, sur la pelouse du modèle (repère du bâtiment, voir `stadiumFoot` de models.ts) : deux
 * équipes de cinq (un gardien, quatre joueurs) aux couleurs du blason du village et des visiteurs, et l'arbitre. Les joueurs
 * entrent par le tunnel et se mettent en place, l'arbitre siffle. Ensuite un petit jeu suivi : celui qui a le ballon le pousse
 * vers le but adverse, passe à un coéquipier, tire ; le défenseur le plus proche vient le presser et le lui prend parfois ; les
 * autres suivent le jeu à leur poste ; le gardien glisse sur sa ligne et capte les tirs. Les buts sont ceux du déroulé tiré à
 * l'avance (`planMatch`) : quelques secondes avant, l'équipe qui doit marquer récupère le ballon, file au but et frappe, le
 * gardien plonge du mauvais côté. Le buteur court bras levés, ses coéquipiers le rejoignent, les tribunes se lèvent, et l'on
 * remet en jeu au rond central. Mi-temps, coup de sifflet final, les vainqueurs exultent
 */

/** Le terrain du modèle : demi-longueur, demi-largeur, demi-ouverture du but, hauteur de la pelouse */
const pitch = (age: number) => (age < 4 ? { hx: 0.55, hz: 0.36 } : { hx: 0.62, hz: 0.4 });
const GOAL = 0.085, Y = 0.026;
/** temps de l'entrée des joueurs, de la mi-temps, de la fête d'un but, de la fin */
const ENTER = 9, HALF = 4, CELEB = 4.5, END = 7;
/** allures (cases par seconde) : au trot, à la course, balle au pied ; vitesse d'une passe et d'un tir */
const JOG = 0.12, RUN = 0.24, DRIBBLE = 0.19, PASS = 0.75, SHOT = 1.25;

type Role = 'gk' | 'def' | 'mid' | 'fwd';
interface Player {
  f: Folk; team: 0 | 1; role: Role; n: number;
  x: number; z: number; heading: number; phase: number; speed: number;
  /** son poste (pour l'équipe 0 qui attaque vers +x ; miroir pour l'autre) */
  hx: number; hz: number;
  /** où il va en ce moment, et sa pose imposée (fête, plongeon) */
  tx: number; tz: number; pose: FolkPose | null; dive: number; diveDir: number;
}
interface Flight { x0: number; z0: number; x1: number; z1: number; t: number; dur: number; arc: number; to: Player | null; goal: boolean; saved: Player | null }

export interface MatchEvents {
  /** coup de sifflet (fort : début, mi-temps, fin) */
  whistle?: (long: boolean) => void;
  /** frappe du ballon (force 0 … 1) */
  kick?: (k: number) => void;
  /** un but : quelle équipe (0 : le village) et le nouveau score */
  goal?: (side: 0 | 1, score: [number, number]) => void;
  /** clameur de la foule (force 0 … 1) */
  roar?: (k: number) => void;
}

export class MatchView implements ShowView {
  group = new THREE.Group();
  done = false;
  /** le score affiché, et la minute de jeu (0 à 90) */
  score: [number, number] = [0, 0];
  minute = 0;
  /** où en est le match : entrée des joueurs, jeu, mi-temps, but, fin */
  phase: 'enter' | 'play' | 'half' | 'goal' | 'end' = 'enter';
  private players: Player[] = [];
  private ref: Player;
  private ball: THREE.Mesh;
  private bx = 0; bz = 0; private by = 0;
  private owner: Player | null = null;
  private flight: Flight | null = null;
  private t = 0;
  /** temps de jeu écoulé (sans l'entrée, la mi-temps ni les fêtes) */
  private clock = 0;
  private wait = 0;
  private next = 0;
  private halfDone = false;
  private think = 1;
  private tackleT = 0;
  private forced: { side: 0 | 1; t: number } | null = null;
  private kickoff: 0 | 1 = 0;
  private stands: StandsFx;
  private rnd: () => number;
  private P: { hx: number; hz: number };

  constructor(private plan: MatchPlan, private kit: Kit, private ev: MatchEvents = {}) {
    const { age, seed } = kit;
    let s = (seed >>> 0) || 1;
    this.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    this.P = pitch(age);
    this.group.scale.setScalar(kit.scale);
    const { hx, hz } = this.P;
    // les postes : gardien, deux défenseurs, un milieu, un avant
    const posts: [Role, number, number][] = [['gk', -hx + 0.05, 0], ['def', -hx * 0.55, -hz * 0.45], ['def', -hx * 0.55, hz * 0.45], ['mid', -hx * 0.2, -hz * 0.1], ['fwd', -hx * 0.05, hz * 0.25]];
    for (const team of [0, 1] as const) posts.forEach(([role, px, pz], i) => {
      const f = makeFolk({ age: Math.max(3, age), v: seed * 7 + team * 31 + i * 13, size: 0.92, woman: false });
      this.dress(f, team, role, i);
      this.group.add(f.root);
      const sx = team === 0 ? 1 : -1;
      // ils entrent par le tunnel (le côté -z, au milieu)
      const p: Player = { f, team, role, n: i, x: (team ? 0.04 : -0.04) - i * 0.005, z: -hz - 0.08 - i * 0.05, heading: 0, phase: this.rnd() * 6, speed: 0, hx: px * sx, hz: pz * sx, tx: 0, tz: 0, pose: null, dive: 0, diveDir: 0 };
      this.players.push(p);
    });
    // l'arbitre, tout de noir
    const rf = makeFolk({ age: Math.max(3, age), v: seed * 3 + 5, size: 0.84, woman: false });
    this.dress(rf, 2, 'mid', 0);
    this.group.add(rf.root);
    this.ref = { f: rf, team: 0, role: 'mid', n: 9, x: 0, z: -hz - 0.04, heading: 0, phase: 0, speed: 0, hx: 0, hz: 0, tx: 0, tz: 0, pose: null, dive: 0, diveDir: 0 };
    // le ballon (cuir lacé, puis blanc à pentagones noirs)
    const bp = new Parts();
    bp.add(new THREE.IcosahedronGeometry(0.018, 1), 0, 0, 0, age < 4 ? 0xf0dcae : 0xf8f6f0);
    if (age >= 4) for (const [x, y, z] of [[0.015, 0.008, 0], [-0.01, 0.013, 0.008], [0, -0.015, -0.008]]) bp.add(new THREE.IcosahedronGeometry(0.006, 0), x, y, z, 0x1a1a1e);
    this.ball = new THREE.Mesh(bp.build(false).body, mats.body);
    this.ball.castShadow = true;
    this.group.add(this.ball);
    this.stands = new StandsFx(kit, [kit.home, kit.away]);
    this.group.add(this.stands.group);
    for (const p of this.players) this.toPost(p);
    this.ref.tx = 0; this.ref.tz = -hz * 0.6;
  }

  /** Le maillot aux couleurs de l'équipe (un plastron sur le buste), un numéro clair dans le dos ; le gardien d'une autre couleur */
  private dress(f: Folk, team: 0 | 1 | 2, role: Role, i: number) {
    const k = this.kit, p = new Parts();
    const shirt = team === 2 ? 0x1a1a1e : role === 'gk' ? (team === 0 ? 0x3ad06a : 0xf2a23a) : team === 0 ? k.home : k.away;
    const trim = team === 2 ? 0x3a3a3e : team === 0 ? k.homeB : k.awayB;
    // (plus large que les habits de l'époque, qu'il couvre : à la même taille, le manteau passait au travers)
    p.box(0.1, 0.1, 0.07, 0, 0.096, 0, shirt);
    p.box(0.102, 0.014, 0.072, 0, 0.186, 0, trim);
    for (const s of [-1, 1]) p.box(0.034, 0.034, 0.05, s * 0.064, 0.162, 0, shirt);
    p.box(0.1, 0.04, 0.07, 0, 0.06, 0, team === 2 ? 0x1a1a1e : trim);
    if (team !== 2) p.box(0.03, 0.04, 0.004, 0, 0.13, -0.037, 0xf4f2ee);
    const m = new THREE.Mesh(p.build(false).body, mats.body);
    m.castShadow = true;
    f.body.add(m);
    void i;
  }

  /** Le poste d'un joueur, poussé vers le ballon (les lignes suivent le jeu) */
  private toPost(p: Player) {
    const { hx, hz } = this.P, side = p.team === 0 ? 1 : -1;
    if (p.role === 'gk') { p.tx = -side * (hx - 0.04); p.tz = Math.max(-GOAL, Math.min(GOAL, this.bz * 0.4)); return; }
    const push = this.bx * 0.55;
    p.tx = Math.max(-hx + 0.08, Math.min(hx - 0.08, p.hx + push));
    p.tz = Math.max(-hz + 0.04, Math.min(hz - 0.04, p.hz + (this.bz - p.hz) * 0.25));
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    this.stands.update(dt);
    const { hx, hz } = this.P;
    if (this.phase === 'enter') {
      this.ref.tx = 0; this.ref.tz = -hz * 0.55;
      if (this.t > ENTER) { this.phase = 'play'; this.restart(this.kickoff); this.ev.whistle?.(true); this.ev.roar?.(0.6); this.stands.cheer(-1, 0.7); }
    } else if (this.phase === 'half') {
      this.wait -= dt;
      if (this.wait <= 0) { this.phase = 'play'; this.restart(1); this.ev.whistle?.(true); }
    } else if (this.phase === 'goal') {
      this.wait -= dt;
      if (this.wait <= 0) { this.phase = 'play'; const g = this.plan.goals[this.next - 1]; this.restart(g.side === 0 ? 1 : 0); this.ev.whistle?.(false); }
    } else if (this.phase === 'end') {
      this.wait -= dt;
      if (this.wait <= 0) this.done = true;
    } else this.play(dt);
    this.minute = Math.min(90, Math.floor((this.clock / MATCH_TIME) * 90));
    for (const p of this.players) this.move(p, dt);
    // l'arbitre suit le jeu, un peu de côté
    if (this.phase !== 'enter') { this.ref.tx = this.bx * 0.7; this.ref.tz = Math.max(-hz + 0.05, Math.min(hz - 0.05, this.bz - 0.14 * Math.sign(this.bz || 1))); }
    this.move(this.ref, dt);
    this.placeBall(dt);
    void hx;
  }

  /** Remise en jeu au rond central : les joueurs à leur poste, le ballon à l'équipe qui engage */
  private restart(side: 0 | 1) {
    this.flight = null; this.bx = 0; this.bz = 0; this.by = 0;
    for (const p of this.players) { p.pose = null; p.dive = 0; }
    const fwd = this.players.find((p) => p.team === side && p.role === 'fwd')!;
    fwd.x = side === 0 ? -0.03 : 0.03; fwd.z = 0;
    this.owner = fwd;
    this.think = 0.8;
  }

  private play(dt: number) {
    this.clock += dt;
    const { hx } = this.P, g = this.plan.goals[this.next];
    // la mi-temps
    if (!this.halfDone && this.clock >= MATCH_TIME / 2 && (!g || g.t > this.clock + 3)) {
      this.halfDone = true; this.phase = 'half'; this.wait = HALF; this.owner = null; this.flight = null;
      this.ev.whistle?.(true);
      for (const p of this.players) { p.tx = p.hx * 0.7; p.tz = p.hz * 0.7; }
      return;
    }
    // la fin
    if (this.clock >= MATCH_TIME && !this.flight && (!g || g.t > this.clock)) { this.finish(); return; }
    // un but à venir : l'équipe qui doit marquer reprend le ballon et file au but
    if (g && this.clock >= g.t - 2.4 && !this.forced) {
      this.forced = { side: g.side, t: g.t };
      if (!this.owner || this.owner.team !== g.side) {
        const cands = this.players.filter((p) => p.team === g.side && p.role !== 'gk');
        const at = this.flight ? [this.flight.x1, this.flight.z1] : [this.bx, this.bz];
        const pick = cands.sort((a, b) => Math.hypot(a.x - at[0], a.z - at[1]) - Math.hypot(b.x - at[0], b.z - at[1]))[0];
        this.flight = null;
        this.gain(pick);
      }
    }
    for (const p of this.players) if (p !== this.owner && !p.pose) this.toPost(p);
    if (this.flight) return;
    const o = this.owner;
    if (!o) return;
    const side = o.team === 0 ? 1 : -1, goalX = side * hx;
    // le porteur pousse vers le but adverse, en ondulant
    o.tx = goalX - side * 0.12; o.tz = Math.sin(this.t * 0.9 + o.n) * 0.12 + (this.bz - o.z) * 0.2;
    if (this.forced && this.forced.side === o.team) {
      // il frappe pour que le ballon entre à l'heure dite
      if (this.clock >= this.forced.t - 0.55) this.shoot(o, true);
      return;
    }
    // le défenseur le plus proche le presse ; il lui prend parfois le ballon
    this.tackleT -= dt;
    const foe = this.players.filter((p) => p.team !== o.team && p.role !== 'gk').sort((a, b) => Math.hypot(a.x - o.x, a.z - o.z) - Math.hypot(b.x - o.x, b.z - o.z))[0];
    foe.tx = o.x - side * 0.03; foe.tz = o.z;
    const near = Math.hypot(foe.x - o.x, foe.z - o.z);
    const nextGoalSoon = g && g.t - this.clock < 5;
    if (near < 0.045 && this.tackleT <= 0 && !nextGoalSoon) {
      this.tackleT = 2;
      if (this.rnd() < 0.45) { this.gain(foe); this.ev.kick?.(0.2); return; }
    }
    this.think -= dt;
    if (this.think > 0) return;
    this.think = 0.9 + this.rnd() * 1.6;
    const dist = Math.abs(goalX - o.x);
    if (dist < 0.38 && this.rnd() < 0.55 && !nextGoalSoon) { this.shoot(o, false); return; }
    // une passe : vers un coéquipier, plutôt devant lui
    const mates = this.players.filter((p) => p.team === o.team && p !== o && p.role !== 'gk');
    mates.sort((a, b) => (b.x - a.x) * side - (this.rnd() - 0.3) * 0.6);
    if (this.rnd() < 0.75) this.pass(o, mates[0]);
  }

  private gain(p: Player) { this.owner = p; this.think = 0.6 + this.rnd() * 0.8; }

  private pass(from: Player, to: Player) {
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    // il vise un peu devant le receveur, qui court au ballon
    const lead = to.team === 0 ? 0.04 : -0.04;
    this.kickTo(from, to.x + lead, to.z, d / PASS, d > 0.45 ? 0.1 : 0.02, to, false, null);
    this.ev.kick?.(0.3);
  }

  private shoot(o: Player, goal: boolean) {
    const { hx } = this.P, side = o.team === 0 ? 1 : -1;
    const keeper = this.players.find((p) => p.team !== o.team && p.role === 'gk')!;
    const corner = (this.rnd() < 0.5 ? -1 : 1) * GOAL * 0.7;
    const x1 = side * (hx + 0.02), z1 = goal ? corner : keeper.z + (this.rnd() - 0.5) * 0.04;
    const d = Math.hypot(x1 - o.x, z1 - o.z);
    this.kickTo(o, x1, z1, Math.max(0.25, d / SHOT), 0.05, null, goal, goal ? null : keeper);
    // le gardien plonge : du bon côté s'il arrête, du mauvais s'il encaisse
    keeper.dive = 0.9; keeper.diveDir = goal ? -Math.sign(corner) : Math.sign(z1 - keeper.z || 1);
    this.ev.kick?.(1);
    this.ev.roar?.(0.35);
  }

  private kickTo(from: Player, x1: number, z1: number, dur: number, arc: number, to: Player | null, goal: boolean, saved: Player | null) {
    this.owner = null;
    void from;
    this.flight = { x0: this.bx, z0: this.bz, x1, z1, t: 0, dur, arc, to, goal, saved };
  }

  /** Le ballon : au pied du porteur, en vol, ou au fond des filets */
  private placeBall(dt: number) {
    const f = this.flight;
    if (f) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      this.bx = f.x0 + (f.x1 - f.x0) * k; this.bz = f.z0 + (f.z1 - f.z0) * k; this.by = f.arc * 4 * k * (1 - k);
      if (f.to && this.phase === 'play') { f.to.tx = f.x1; f.to.tz = f.z1; }
      if (k >= 1) {
        this.flight = null;
        if (f.goal) this.scored();
        else if (f.saved) { this.gain(f.saved); this.ev.roar?.(0.25); }
        else if (f.to) this.gain(f.to);
        else this.gain(this.nearest(this.bx, this.bz));
      }
    } else if (this.owner) {
      const o = this.owner;
      // le ballon roule devant ses pieds, poussé à chaque foulée
      const lead = 0.035 + Math.abs(Math.sin(o.phase)) * 0.012;
      this.bx = o.x + Math.sin(o.heading) * lead; this.bz = o.z + Math.cos(o.heading) * lead; this.by = 0;
    } else if (this.phase === 'enter') { this.bx = 0; this.bz = 0; this.by = 0; }
    this.ball.position.set(this.bx, Y + 0.018 + this.by, this.bz);
    this.ball.rotation.x += dt * 8; this.ball.rotation.z += dt * 5;
  }

  private nearest(x: number, z: number) {
    return this.players.filter((p) => p.role !== 'gk').sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
  }

  private scored() {
    const g = this.plan.goals[this.next++];
    this.forced = null;
    this.score[g.side]++;
    this.phase = 'goal'; this.wait = CELEB; this.owner = null;
    this.ev.goal?.(g.side, [this.score[0], this.score[1]]);
    this.ev.roar?.(1);
    this.stands.cheer(g.side, 1);
    // le buteur court vers le poteau de corner, bras levés ; les siens le rejoignent ; les autres rentrent tête basse
    const { hx, hz } = this.P, side = g.side === 0 ? 1 : -1;
    const scorer = this.players.filter((p) => p.team === g.side && p.role !== 'gk').sort((a, b) => Math.abs(side * hx - a.x) - Math.abs(side * hx - b.x))[0];
    const cz = scorer.z > 0 ? hz - 0.06 : -hz + 0.06;
    for (const p of this.players) {
      if (p.team === g.side && p.role !== 'gk') { p.tx = side * (hx - 0.12) + (p === scorer ? 0 : -side * 0.06 * (p.n % 3)); p.tz = cz - Math.sign(cz) * 0.04 * (p.n % 3); p.pose = 'cheer'; }
      else { p.tx = p.hx * 0.8; p.tz = p.hz * 0.8; p.pose = null; }
    }
  }

  private finish() {
    this.phase = 'end'; this.wait = END; this.owner = null; this.flight = null; this.clock = MATCH_TIME;
    this.ev.whistle?.(true);
    const [a, b] = this.score, win = a > b ? 0 : b > a ? 1 : -1;
    this.ev.roar?.(win === 0 ? 1 : 0.5);
    if (win >= 0) this.stands.cheer(win as 0 | 1, 1.2); else this.stands.cheer(-1, 0.6);
    for (const p of this.players) {
      // les vainqueurs se rassemblent au rond central et sautent ; les autres saluent la foule à leur poste
      if (p.team === win || win < 0) { p.tx = (p.n - 2) * 0.085; p.tz = (p.team ? 0.08 : -0.08); p.pose = win < 0 ? null : 'cheer'; }
      else { p.tx = p.hx * 0.6; p.tz = p.hz * 0.6; p.pose = null; }
    }
  }

  /** Un pas vers sa cible, la pose qui va avec */
  private move(p: Player, dt: number) {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
    const busy = this.phase === 'play';
    const want = this.owner === p ? DRIBBLE : busy && (this.flight?.to === p || d > 0.12) ? RUN : JOG;
    const v = d > 0.008 ? Math.min(want, d * 3) : 0;
    p.speed += (v - p.speed) * Math.min(1, dt * 4);
    if (d > 0.002) { p.x += (dx / d) * p.speed * dt; p.z += (dz / d) * p.speed * dt; }
    // il regarde où il va, sinon le ballon
    const look = d > 0.02 && p.speed > 0.02 ? Math.atan2(dx, dz) : Math.atan2(this.bx - p.x, this.bz - p.z);
    let da = look - p.heading;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    p.heading += da * Math.min(1, dt * 6);
    const pose: FolkPose = p.pose ?? (p.speed > 0.1 ? 'run' : p.speed > 0.02 ? 'walk' : 'idle');
    p.phase += dt * (pose === 'run' ? 11 : pose === 'walk' ? 7 : pose === 'cheer' ? 5 : 2);
    folkStep(p.f, p.phase, pose);
    const r = p.f.root;
    r.position.set(p.x, Y, p.z);
    r.rotation.set(0, p.heading, 0);
    // le plongeon du gardien : couché sur le côté, puis il se relève
    if (p.dive > 0) {
      p.dive -= dt;
      const k = Math.sin(Math.min(1, (0.9 - p.dive) / 0.25) * Math.PI / 2) * (p.dive > 0.3 ? 1 : p.dive / 0.3);
      r.rotation.z = -p.diveDir * 1.3 * k * (p.team === 0 ? 1 : -1);
      r.position.z += p.diveDir * 0.05 * k;
      r.position.y = Y + 0.02 * k;
    }
  }

  /** Le texte du tableau d'affichage : « 2 – 1 · 63' » ou « Mi-temps », « Fin du match » */
  dispose() { disposeTree(this.group); this.stands.dispose(); }
}
