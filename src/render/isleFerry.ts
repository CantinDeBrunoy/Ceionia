import * as THREE from 'three';
import { World, SEA } from '../world/world';
import { ferryRoute, FerryRoute } from '../world/ferry';
import type { War } from '../sim/war';
import { TROOPS, TroopKind, Recruit } from '../sim/army';
import { CONVOY_TIME } from '../sim/hellBase';
import { galleyGeo } from './expeditionScenes';
import { makeSoldier, soldierStep, Soldier, SoldierRole } from './soldiers';
import { Parts } from './parts';
import { mats } from './materials';

/**
 * La galère qui traverse le bras de mer entre le continent et l'île du portail : elle emmène les recrues (dans les dernières
 * secondes de leur recrutement), les convois de ravitaillement des Enfers (leurs caisses), et ramène au village les soldats
 * qu'on y renvoie. Elle part du mouillage de la rive (ou du port), accoste au large de la plage de l'île, ses passagers
 * débarquent (ils gagnent la plage à gué), puis elle repart à vide. Pour la vue seulement : la simulation n'en dépend pas, et
 * la traversée suit le temps de jeu (pause, vitesse) quand elle accompagne une recrue ou un convoi
 */

/** Taille de la galère (le modèle des expéditions est fait pour des habitants) : ses soldats ont ainsi celle de la garnison */
const K = 2.2;
/** Secondes de jeu de traversée (la fin du recrutement, le début du convoi) */
export const CROSS = 8;
/** Secondes : débarquer (ou embarquer), et le retour à vide */
const WALK = 1.6, BACK = 7, GROW = 0.5;
/** Galères à la fois, passagers par galère */
const MAX_TRIPS = 4, SEATS = 6;
const ROLE: Record<TroopKind, SoldierRole> = { soldier: 'spearman', archer: 'archer', knight: 'knight', cavalry: 'spearman' };

type Phase = 'board' | 'sail' | 'land' | 'back';
interface Walker { s: Soldier; a: THREE.Vector3; b: THREE.Vector3 }
interface Trip {
  boat: THREE.Group;
  riders: Soldier[];
  /** vers l'île (recrues, convoi), ou vers le village (soldats renvoyés) */
  home: boolean;
  phase: Phase;
  /** secondes dans la phase ; avancement de la traversée (0 … 1) */
  t: number;
  k: number;
  /** ce qui mène la traversée (avancement selon le temps de jeu ; null : la chose est arrivée) ; sans lui, le temps réel */
  drive: (() => number | null) | null;
  route: FerryRoute;
  cargo: THREE.Object3D | null;
  walkers: Walker[];
  heading: number;
  seed: number;
  /** secondes depuis le départ */
  life: number;
}

let crateGeo: THREE.BufferGeometry | null = null;
/** Les caisses et tonneaux d'un convoi, sur le pont (repère de la galère) */
function crates() {
  if (!crateGeo) {
    const p = new Parts();
    for (const [x, z, s] of [[-0.035, -0.14, 0.05], [0.035, -0.12, 0.045], [0, -0.06, 0.05], [-0.03, 0.02, 0.045], [0.034, 0.05, 0.05]] as [number, number, number][]) p.box(s, s * 0.8, s, x, 0.05, z, 0xa87a4a, x * 9);
    for (const [x, z] of [[0.03, -0.02], [-0.035, 0.1]]) p.cyl(0.02, 0.02, 0.045, 7, x, 0.05, z, 0x7a5232);
    p.box(0.07, 0.012, 0.08, 0, 0.09, -0.1, 0xd8c8a0);
    crateGeo = p.build(false).body;
  }
  const m = new THREE.Mesh(crateGeo, mats.body);
  m.castShadow = true;
  return m;
}

const ease = (k: number) => k * k * (3 - 2 * k);

export class IsleFerry {
  group = new THREE.Group();
  private trips: Trip[] = [];
  private route: FerryRoute | null = null;
  private routeKey = '';
  /** recrues et convois déjà à bord d'une galère ; la garnison de l'île à l'image d'avant (pour voir qui rentre au village) */
  private carried = new WeakSet<object>();
  private army: unknown = null;
  private isle = new Map<number, TroopKind>();

  constructor(private world: World) {}

  /** La route de la galère (refaite quand la carte change) */
  private path() {
    const w = this.world, key = `${w.version}|${w.portal?.x}|${w.portal?.z}`;
    if (key !== this.routeKey) { this.routeKey = key; this.route = ferryRoute(w); }
    return this.route;
  }

  /** Une image : les nouveaux passagers (recrues, convois, renvoyés), puis les galères en route */
  update(dt: number, war: War, age: number) {
    if (war.active) this.watch(war, age);
    for (let i = this.trips.length - 1; i >= 0; i--) if (!this.step(this.trips[i], dt)) this.drop(i);
  }

  /** Retire toutes les galères (partie rechargée) */
  clear() { for (let i = this.trips.length - 1; i >= 0; i--) this.drop(i); this.isle.clear(); this.army = null; }

  private watch(war: War, age: number) {
    const a = war.army, barracks = war.isle ? [...war.isle.defs.values()].filter((b) => b.kind === 'barracks').length : 0;
    // les recrues dans leurs dernières secondes : à bord (une galère en prend plusieurs quand elles partent ensemble)
    a.queue.forEach((r: Recruit, i) => {
      if (r.at === 'hell' || i >= barracks || this.carried.has(r)) return;
      const cross = Math.min(CROSS, TROOPS[r.kind].time);
      if (r.left > cross) return;
      const k = () => (a.queue.includes(r) ? Math.min(1, Math.max(0, 1 - r.left / cross)) : null);
      const join = this.trips.find((t) => !t.home && !t.cargo && t.phase === 'sail' && t.drive && t.k < 0.25 && t.riders.length < SEATS);
      if (join) { this.board(join, r.kind, age, i); this.carried.add(r); return; }
      const t = this.start(false, k, false);
      if (t) { this.board(t, r.kind, age, i); this.carried.add(r); }
    });
    // les convois de ravitaillement : leurs caisses traversent au début de leur route (elles passent ensuite le portail)
    for (const c of war.base?.convoys ?? []) {
      if (this.carried.has(c)) continue;
      this.carried.add(c);
      const list = war.base!.convoys;
      this.start(false, () => (list.includes(c) ? Math.min(1, Math.max(0, (CONVOY_TIME - c.left) / CROSS)) : null), true);
    }
    // les soldats de l'île renvoyés au village : une galère les ramène (pas ceux d'une partie rechargée)
    const now = new Map<number, TroopKind>();
    for (const t of a.troops) if (t.where === 'isle') now.set(t.id, t.kind);
    if (this.army === a) {
      const gone = [...this.isle].filter(([id]) => !now.has(id) && !a.troops.some((t) => t.id === id));
      if (gone.length) {
        const t = this.start(true, null, false);
        if (t) gone.slice(0, SEATS).forEach(([id, kind], i) => this.walkOn(t, kind, age, id, i));
      }
    }
    this.army = a;
    this.isle = now;
  }

  /** Une galère part (null : pas de route, ou déjà trop de galères) */
  private start(home: boolean, drive: (() => number | null) | null, cargo: boolean): Trip | null {
    const route = this.path();
    if (!route || this.trips.length >= MAX_TRIPS) return null;
    const boat = new THREE.Group(), hull = new THREE.Mesh(galleyGeo(), mats.body);
    hull.castShadow = true;
    boat.add(hull);
    boat.scale.setScalar(0.001);
    this.group.add(boat);
    const [ax, az] = home ? route.to : route.from, [bx, bz] = home ? route.from : route.to;
    const t: Trip = { boat, riders: [], home, phase: home ? 'board' : 'sail', t: 0, k: 0, drive, route, cargo: null, walkers: [], heading: Math.atan2(bx - ax, bz - az), seed: Math.random() * 10, life: 0 };
    if (cargo) { t.cargo = crates(); boat.add(t.cargo); }
    this.place(t, 0);
    this.trips.push(t);
    return t;
  }

  /** Un soldat à son banc, sur le pont (repère de la galère) */
  private seat(t: Trip, s: Soldier, i: number) {
    t.boat.add(s.root);
    s.root.scale.setScalar(0.7);
    s.root.position.set(i % 2 ? 0.035 : -0.035, 0.05, -0.17 + Math.floor(i / 2) * 0.12 + (i % 2) * 0.03);
    s.root.rotation.set(0, 0, 0);
    soldierStep(s, 0, 'guard');
  }

  private board(t: Trip, kind: TroopKind, age: number, v: number) {
    const s = makeSoldier(kind === 'knight' ? Math.max(2, age) : age, v, false, ROLE[kind]);
    this.seat(t, s, t.riders.length);
    t.riders.push(s);
  }

  /** Un soldat renvoyé au village : il part de la plage de l'île et monte à bord */
  private walkOn(t: Trip, kind: TroopKind, age: number, v: number, i: number) {
    const s = makeSoldier(kind === 'knight' ? Math.max(2, age) : age, v, false, ROLE[kind]);
    s.root.scale.setScalar(0.7 * K);
    this.group.add(s.root);
    const [bx, bz] = t.route.beach, a = new THREE.Vector3(bx + Math.sin(i * 2.1) * 0.35, 0, bz + Math.cos(i * 2.1) * 0.35);
    t.walkers.push({ s, a, b: new THREE.Vector3() });
    t.riders.push(s);
  }

  /** La galère à l'avancement `k` de sa traversée (aller), ou de son retour */
  private place(t: Trip, k: number) {
    const r = t.route, back = t.phase === 'back';
    const [ax, az] = t.home !== back ? r.to : r.from, [bx, bz] = t.home !== back ? r.from : r.to;
    const e = ease(k), x = ax + (bx - ax) * e, z = az + (bz - az) * e;
    // elle vire doucement vers son cap
    const want = Math.atan2(bx - ax, bz - az), d = Math.atan2(Math.sin(want - t.heading), Math.cos(want - t.heading));
    t.heading += Math.sign(d) * Math.min(Math.abs(d), 0.03);
    const time = performance.now() / 1000 + t.seed, moving = k > 0 && k < 1;
    t.boat.position.set(x, SEA - 0.01 + Math.sin(time * 1.9) * 0.015, z);
    t.boat.rotation.set(Math.sin(time * 1.3) * 0.025 + (moving ? -0.02 : 0), t.heading, Math.sin(time * 1.6) * 0.04, 'YXZ');
  }

  /** Une image d'une galère ; faux quand elle a fini (rentrée à vide) */
  private step(t: Trip, dt: number): boolean {
    t.t += dt;
    t.life += dt;
    // elle paraît au mouillage, disparaît en rentrant
    t.boat.scale.setScalar(K * Math.max(0.001, Math.min(1, t.phase === 'back' ? (BACK - t.t) / GROW : t.life / GROW)));
    const now = performance.now() / 1000;
    for (const [i, s] of t.riders.entries()) if (s.root.parent === t.boat) soldierStep(s, now * 2 + i, 'guard');
    if (t.phase === 'board') {
      // les renvoyés gagnent la galère à gué, puis s'assoient
      this.place(t, 0);
      this.walk(t, Math.min(1, t.t / WALK), true);
      if (t.t >= WALK) { t.walkers.forEach((w, i) => this.seat(t, w.s, i)); t.walkers = []; this.next(t, 'sail'); }
      return true;
    }
    if (t.phase === 'sail') {
      const k = t.drive ? t.drive() : Math.min(1, t.t / CROSS);
      if (k !== null) t.k = Math.max(t.k, k);
      // la chose est arrivée (recrue enrôlée, convoi passé) : la galère finit sa route en hâte
      else t.k = Math.min(1, t.k + dt / 1.2);
      this.place(t, t.k);
      if (t.k >= 1) this.unload(t);
      return true;
    }
    if (t.phase === 'land') {
      this.place(t, 1);
      this.walk(t, Math.min(1, t.t / WALK), false);
      if (t.t >= WALK + 0.4) {
        for (const w of t.walkers) this.group.remove(w.s.root);
        t.walkers = [];
        this.next(t, 'back');
      }
      return true;
    }
    this.place(t, Math.min(1, t.t / BACK));
    return t.t < BACK;
  }

  private next(t: Trip, phase: Phase) { t.phase = phase; t.t = 0; }

  /** Arrivée : les passagers descendent et gagnent la rive (la plage de l'île, la rive du village) ; les caisses sont déchargées */
  private unload(t: Trip) {
    const [lx, lz] = t.home ? t.route.shore : t.route.beach;
    t.boat.updateMatrixWorld(true);
    t.riders.forEach((s, i) => {
      const a = s.root.getWorldPosition(new THREE.Vector3());
      this.group.add(s.root);
      s.root.position.copy(a);
      s.root.scale.setScalar(0.7 * K);
      t.walkers.push({ s, a, b: new THREE.Vector3(lx + Math.sin(i * 2.1) * 0.35, 0, lz + Math.cos(i * 2.1) * 0.35) });
    });
    t.riders = [];
    if (t.cargo) { t.boat.remove(t.cargo); t.cargo = null; }
    this.next(t, 'land');
  }

  /** Les passagers à gué entre la rive et la galère (`toBoat` : ils montent à bord), puis, à terre, ils s'effacent */
  private walk(t: Trip, k: number, toBoat: boolean) {
    const w = this.world;
    for (const [i, wk] of t.walkers.entries()) {
      const s = wk.s;
      if (toBoat) { wk.b.copy(t.boat.position); wk.b.y = SEA; }
      const from = wk.a, to = wk.b, x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
      s.root.position.set(x, Math.max(SEA - 0.06, w.hAt(x, z)), z);
      s.root.rotation.set(0, Math.atan2(to.x - from.x, to.z - from.z), 0);
      soldierStep(s, t.t * 9 + i, k < 1 ? 'walk' : 'guard');
      // arrivés à terre, ils s'en vont (vers la caserne, vers le village)
      if (!toBoat) s.root.scale.setScalar(0.7 * K * Math.max(0.001, Math.min(1, (WALK + 0.4 - t.t) / 0.4)));
    }
  }

  private drop(i: number) {
    const t = this.trips[i];
    for (const w of t.walkers) this.group.remove(w.s.root);
    this.group.remove(t.boat);
    this.trips.splice(i, 1);
  }

  /** Galères en route (pour les essais) */
  get count() { return this.trips.length; }
}
