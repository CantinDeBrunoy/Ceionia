import * as THREE from 'three';
import { World, N } from '../world/world';
import { Building, KINDS, KindId, sizeOf } from '../build/catalog';
import { hash2, mulberry32 } from '../core/rng';
import { makeActor, play, hasModel, Actor, AGE_VILLAGERS, SIT } from '../render/assets';
import { findGardens, layoutGarden, Spot, Act } from '../world/gardens';

const MAX_AGENTS = 90;
/** Animations des habitants, quel que soit le pack (premier nom disponible) */
const WALK = ['Walking_A', 'walk', 'Walk', 'Man_Walk', 'Female_Walk'];
const RUN = ['Running_A', 'sprint', 'Run', 'Man_Run', 'Female_Run'];
const IDLE = ['Idle', 'idle', 'Man_Idle', 'Female_Idle'];
const WORK = ['Interact', 'interact-right', 'Use_Item', 'pick-up', 'Man_Clapping', 'Female_Clapping', 'Wave', 'Idle'];
const CHEER = ['Cheer', 'emote-yes', 'Wave', 'Idle', 'idle'];
const HUMAN_HEIGHT = 0.3;

const BODY_COLS = [
  [0xb98a5e, 0xa07850, 0xc9a070],
  [0xf1e6d0, 0x9ec4d6, 0xe8b4a8],
  [0xc86a5a, 0x6f9f78, 0x8c7fb8, 0xd8b45a],
  [0x6f7a8a, 0x8a6f5f, 0x5f7f95, 0xb08a6a],
  [0xf09ab0, 0x7fc4e8, 0xf5d36a, 0x9fd49a, 0xffffff],
];
const SKIN = [0xf2cfb3, 0xe3b894, 0xc99973, 0x8d6445];
const TOOL_SCALE = [1.5, 0.9, 0.9, 0.5, 0];

type State = 'inside' | 'walking' | 'doing';
/**
 * Destination d'une sortie : case, caché à l'arrivée (dans un bâtiment), dernier pas hors de la route et cap, platelage ou assise ;
 * activité sur place et place prise dans un jardin
 */
interface Dest { cell: number; hidden: boolean; spot?: [number, number]; face?: number; deck?: number; act?: Act; hold?: string }
/** Places des pêcheurs sur le ponton (repère du bâtiment : x en travers, z vers l'eau) : radeau de la Préhistoire, platelage ensuite */
const RAFT_SPOTS = [[-0.03, 0.74], [0.02, 0.42]], DECK_SPOTS = [[-0.03, 0.66], [0.06, 0.46]];

interface Agent {
  id: number;
  home: number; // id bâtiment
  x: number; z: number;
  state: State;
  path: number[];
  pi: number;
  timer: number;
  hidden: boolean;
  speed: number;
  heading: number;
  phase: number;
  goingHome: boolean;
  targetHidden: boolean;
  skin: number; col: number;
  off: number;
  /** modèle animé de l'époque courante (sinon silhouette instanciée) */
  actor: Actor | null;
  actorKey: string;
  /** dernier pas après la route (bout d'un ponton…) et cap à prendre une fois arrivé */
  spot: [number, number] | null;
  face: number | null;
  /** hauteur du platelage quand il est sur un ponton */
  deck: number | null;
  /** enfant : plus petit, sans outil, il joue en courant autour de l'endroit où il s'arrête */
  child: boolean;
  ax: number; az: number;
  /** ce qu'il fait une fois arrivé (assis au feu, à l'ouvrage, il acclame les jouteurs…) */
  act: Act | null;
  /** place qu'il occupe (bout du ponton, abords d'un puits, banc d'un jardin…) : personne d'autre ne la prend */
  hold: string | null;
  /** membre d'une expédition : il suit les ordres de l'expédition, plus sa routine */
  mission: boolean;
  /** attente avant de se mettre en marche (l'équipe part en file) */
  delay: number;
  /** blessé : il se repose chez lui (secondes de jeu restantes) */
  rest: number;
}

class Heap {
  keys: number[] = []; vals: number[] = [];
  get size() { return this.keys.length; }
  push(k: number, v: number) {
    const K = this.keys, V = this.vals;
    let i = K.length; K.push(k); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= K[i]) break; [K[p], K[i]] = [K[i], K[p]]; [V[p], V[i]] = [V[i], V[p]]; i = p; }
  }
  pop(): number {
    const K = this.keys, V = this.vals; const top = V[0];
    const lk = K.pop()!, lv = V.pop()!;
    if (K.length) {
      K[0] = lk; V[0] = lv; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < K.length && K[l] < K[m]) m = l;
        if (r < K.length && K[r] < K[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [V[m], V[i]] = [V[i], V[m]]; i = m;
      }
    }
    return top;
  }
}

/** Habitants : agents instanciés qui marchent sur les routes et rentrent la nuit */
export class Agents {
  group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private head: THREE.InstancedMesh;
  private tool: THREE.InstancedMesh;
  agents: Agent[] = [];
  private nextId = 1;
  private rnd = mulberry32(99);
  private works: Building[] = [];
  /** lisières boisées proches des maisons : les bûcherons y vont couper du bois */
  private woods: number[] = [];
  private socials: Building[] = [];
  private fields: number[] = [];
  private roads: number[] = [];
  /** places des jardins (pour l'âge courant) et qui les occupe */
  private gspots: Spot[] = [];
  /** places occupées : clé → habitant */
  private held = new Map<string, number>();
  private spotKey = '';
  private lastVersion = -1;
  private lastAge = -1;
  private d = new THREE.Object3D();
  private col = new THREE.Color();
  private pathBudget = 0;

  constructor(private world: World) {
    this.body = new THREE.InstancedMesh(new THREE.ConeGeometry(0.075, 0.2, 6).translate(0, 0.1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }), MAX_AGENTS);
    this.head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.052, 0).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.9 }), MAX_AGENTS);
    this.tool = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.26, 0.014).translate(0, 0.13, 0), new THREE.MeshStandardMaterial({ color: 0x8a6a4e, flatShading: true }), MAX_AGENTS);
    for (const m of [this.body, this.head, this.tool]) { m.frustumCulled = false; m.castShadow = true; m.count = 0; this.group.add(m); }
  }

  reset() { for (const a of this.agents) this.dropActor(a); this.agents = []; this.held.clear(); this.lastVersion = -1; }

  private dropActor(a: Agent) {
    if (!a.actor) return;
    a.actor.mixer.stopAllAction();
    this.group.remove(a.actor.root);
    a.actor = null;
    a.actorKey = '';
  }

  private refreshTargets() {
    const w = this.world;
    this.works = []; this.socials = [];
    for (const b of w.buildings.values()) {
      if (['workshop', 'farm', 'mill', 'landmark', 'pier'].includes(b.kind)) this.works.push(b);
      else if (['well', 'gather', 'temple'].includes(b.kind)) this.socials.push(b);
    }
    this.fields = []; this.roads = []; this.woods = [];
    for (let i = 0; i < w.veg.length; i++) { if (w.veg[i] === 2) this.fields.push(i); if (w.road[i]) this.roads.push(i); }
    const houses = [...w.buildings.values()].filter((b) => b.kind === 'house');
    for (let i = 0; i < w.veg.length; i++) {
      if (w.veg[i] !== 1) continue;
      const x = i % N, z = (i / N) | 0;
      if (houses.some((h) => Math.abs(h.x - x) + Math.abs(h.z - z) < 12)) this.woods.push(i);
    }
  }

  private walkable(c: number, start: number, goal: number) {
    const w = this.world;
    const cx = c % N, cz = (c / N) | 0;
    // l'eau (mer, rivière, lac) ne se franchit que sur un pont
    if (!w.road[c] && (w.cellAvg(cx, cz) < 0.08 || w.lake[c])) return false;
    // ni dans un ravin ni à travers une grotte
    if (w.decor[c] && c !== start && c !== goal) return false;
    const o = w.occ[c];
    if (o && c !== start && c !== goal) {
      const b = w.buildings.get(o);
      if (!b || b.kind !== 'lamp') return false;
    }
    return true;
  }

  /** Dijkstra : routes privilégiées */
  findPath(start: number, goal: number): number[] | null {
    const w = this.world;
    if (start === goal) return [];
    const dist = new Float32Array(N * N).fill(1e9);
    const prev = new Int32Array(N * N).fill(-1);
    const heap = new Heap();
    dist[start] = 0; heap.push(0, start);
    const gx = goal % N, gz = (goal / N) | 0;
    let guard = 0;
    // garde-fou proportionnel à la carte : un trajet peut la traverser
    while (heap.size && guard++ < N * N) {
      const k = heap.keys[0];
      const c = heap.pop();
      const cx = c % N, cz = (c / N) | 0;
      // entrée périmée : la clé du tas inclut l'estimation restante, on la compare au coût connu plus cette estimation
      if (k > dist[c] + Math.abs(cx - gx) + Math.abs(cz - gz) + 1e-4) continue;
      if (c === goal) break;
      const ha = w.bridgeY(cx, cz) ?? w.cellAvg(cx, cz);
      for (let i = 0; i < 4; i++) {
        const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0), nz = cz + (i === 2 ? 1 : i === 3 ? -1 : 0);
        if (!w.inCells(nx, nz)) continue;
        const n = nz * N + nx;
        if (!this.walkable(n, start, goal)) continue;
        const hn = w.bridgeY(nx, nz) ?? w.cellAvg(nx, nz);
        const dh = Math.abs(hn - ha);
        if (dh > 1.0) continue;
        const nd = dist[c] + (w.road[n] ? 1 : 2.8) + dh * 3;
        if (nd < dist[n]) {
          dist[n] = nd; prev[n] = c;
          // estimation : une case de route au moins par pas restant (le coût minimal), pour rester exact
          heap.push(nd + Math.abs(nx - gx) + Math.abs(nz - gz), n);
        }
      }
    }
    if (prev[goal] < 0) return null;
    const out: number[] = [];
    for (let c = goal; c !== start && c >= 0; c = prev[c]) out.push(c);
    return out.reverse();
  }

  /** Un incendie : les habitants proches accourent avec des seaux */
  alert(cell: number) {
    const cx = cell % N + 0.5, cz = Math.floor(cell / N) + 0.5, b = this.world.buildings.get(this.world.occ[cell]);
    const near = this.agents.filter((a) => !a.hidden && Math.hypot(a.x - cx, a.z - cz) < 16).slice(0, 5);
    for (const a of near) {
      a.goingHome = false;
      if (!b) { this.startPath(a, cell, false); continue; }
      const d = this.beside(b);
      if (d) this.go(a, d);
    }
  }

  /**
   * Place à côté d'un bâtiment où l'on ne rentre pas (puits, feu de camp, ferme, bâtiment en feu) : les deux quarts de chaque
   * case qui le borde, du côté du bâtiment, de préférence devant ; le dernier pas vers lui, face à lui. Jamais au milieu du
   * modèle ni sur quelqu'un d'autre (null si tout est pris)
   */
  private beside(b: Building, approach = 0.25): Dest | null {
    const w = this.world, s = sizeOf(b), f = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.rot];
    const cx = b.x + s / 2, cz = b.z + s / 2, free: Dest[] = [], front: Dest[] = [];
    for (let i = 0; i < s; i++) for (const [x, z] of [[b.x + i, b.z - 1], [b.x + i, b.z + s], [b.x - 1, b.z + i], [b.x + s, b.z + i]]) {
      if (!w.inCells(x, z)) continue;
      const k = w.ci(x, z);
      if (w.occ[k] || w.decor[k] || w.lake[k] || (!w.road[k] && w.cellAvg(x, z) < 0.08)) continue;
      // quarts tournés vers le bâtiment : au sud de la case s'il est au sud, etc.
      const qs = z === b.z - 1 ? [2, 3] : z === b.z + s ? [0, 1] : x === b.x - 1 ? [1, 3] : [0, 2];
      for (const q of qs) {
        const key = `c${k}:${q}`;
        if (this.held.has(key)) continue;
        const [x0, z0] = this.quarter(k, q), px = x0 + (cx - x0) * approach, pz = z0 + (cz - z0) * approach;
        const d: Dest = { cell: k, hidden: false, spot: [px, pz], face: Math.atan2(cx - px, cz - pz), hold: key };
        free.push(d);
        if ((f[0] ? x + 0.5 - cx : z + 0.5 - cz) * (f[0] || f[1]) > 0) front.push(d);
      }
    }
    // devant une fois sur deux, sinon n'importe quel côté
    return (front.length && this.rnd() < 0.5 ? this.pick(front) : this.pick(free)) ?? null;
  }

  /** Centre d'un quart de case (0 : coin x-, z- ; 1 : x+ ; 2 : z+ ; 3 : x+, z+) */
  private quarter(k: number, q: number): [number, number] { return [(k % N) + 0.28 + (q % 2) * 0.44, Math.floor(k / N) + 0.28 + (q >> 1) * 0.44]; }

  /** Un quart de case libre parmi des cases (champ, lisière, chemin), un peu décalé ; null si celles tirées sont pleines */
  private cellDest(cells: number[]): Dest | null {
    for (let n = 0; n < 4; n++) {
      const k = this.pick(cells);
      if (k === undefined) return null;
      const q = this.pick([0, 1, 2, 3].filter((i) => !this.held.has(`c${k}:${i}`)));
      if (q === undefined) continue;
      const [x, z] = this.quarter(k, q);
      return { cell: k, hidden: false, spot: [x + (this.rnd() - 0.5) * 0.08, z + (this.rnd() - 0.5) * 0.08], hold: `c${k}:${q}` };
    }
    return null;
  }

  /** Le pêcheur va sur le ponton et regarde l'eau : deux places, au bout et un peu en retrait (null si elles sont prises) */
  private onPier(b: Building): Dest | null {
    const th = (b.rot * Math.PI) / 2, ca = Math.cos(th), sa = Math.sin(th), spots = b.age === 0 ? RAFT_SPOTS : DECK_SPOTS;
    const free = spots.map((_, i) => i).filter((i) => !this.held.has(`p${b.id}:${i}`));
    const i = this.pick(free);
    if (i === undefined) return null;
    const [lx, lz] = spots[i], x = b.x + 0.5 + lx * ca + lz * sa, z = b.z + 0.5 - lx * sa + lz * ca;
    return { cell: this.cellOf(b), hidden: false, spot: [x, z], face: th, deck: this.world.h(b.x, b.z) + (b.age === 0 ? 0.06 : 0.04), hold: `p${b.id}:${i}` };
  }

  private pick<T>(a: T[]): T | undefined { return a.length ? a[Math.floor(this.rnd() * a.length)] : undefined; }

  private cellOf(b: Building) { return b.z * N + b.x; }

  private chooseDest(hour: number, child = false): Dest | null {
    const r = this.rnd();
    // les enfants vont jouer près des lieux de rencontre, des champs ou au bord des chemins
    if (child) {
      // aire de jeux, pelouse du jardin
      if (this.rnd() < 0.5) { const d = this.gardenDest(true); if (d) return d; }
      const play = this.socials.filter((b) => b.kind !== 'temple');
      // à côté du puits ou du feu, sans s'en approcher : ils courent en rond autour de leur place
      if (play.length && r < 0.5) { const d = this.beside(this.pick(play)!, 0); if (d) return d; }
      if (r < 0.7) { const d = this.cellDest(this.fields); if (d) return d; }
      const d = this.cellDest(this.roads);
      if (d) return d;
    }
    // bûcherons à la lisière
    if (r > 0.86) { const d = this.cellDest(this.woods); if (d) return d; }
    const socialBias = hour >= 12 && hour < 14.5 ? 0.7 : hour >= 17 ? 0.65 : 0.3;
    if (r < socialBias && (this.socials.length || this.gspots.length)) {
      // le jardin : une place libre (autour du feu, à l'ouvrage, dans les gradins, sur un banc…)
      if (!this.socials.length || this.rnd() < 0.55) { const d = this.gardenDest(false); if (d) return d; }
      const b = this.pick(this.socials);
      // on entre au temple ; au puits, au feu de camp ou sur la place, on reste à côté
      if (b?.kind === 'temple') return { cell: this.cellOf(b), hidden: true };
      const d = b && this.beside(b);
      if (d) return d;
    }
    if (r < socialBias + 0.4 && this.rnd() < 0.5) { const d = this.cellDest(this.fields); if (d) return d; }
    if (this.works.length && this.rnd() < 0.8) {
      const b = this.pick(this.works)!;
      // pêcheurs sur le ponton, fermiers devant la ferme (s'il reste de la place), les autres entrent
      const d = b.kind === 'pier' ? this.onPier(b) : b.kind === 'farm' ? this.beside(b) : { cell: this.cellOf(b), hidden: true };
      if (d) return d;
    }
    return this.cellDest(this.roads);
  }

  private addAgent() {
    const houses = [...this.world.buildings.values()].filter((b) => b.kind === 'house');
    if (!houses.length) return;
    const h = this.pick(houses)!;
    const id = this.nextId++;
    this.agents.push({
      id, home: h.id, x: h.x + 0.5, z: h.z + 0.5, state: 'inside', path: [], pi: 0, timer: this.rnd() * 4, hidden: true, speed: 0.9 + this.rnd() * 0.5,
      heading: 0, phase: this.rnd() * 6, goingHome: false, targetHidden: false, skin: Math.floor(this.rnd() * SKIN.length), col: Math.floor(this.rnd() * 5), off: (this.rnd() - 0.5) * 0.28, actor: null, actorKey: '',
      spot: null, face: null, deck: null, child: this.rnd() < 0.22, ax: 0, az: 0, act: null, hold: null, mission: false, delay: 0, rest: 0,
    });
  }

  private sendHome(a: Agent) {
    const hb = this.world.buildings.get(a.home);
    if (!hb) { // maison détruite : en choisir une autre
      const houses = [...this.world.buildings.values()].filter((b) => b.kind === 'house');
      const h = this.pick(houses);
      if (!h) { a.state = 'inside'; a.hidden = true; return; }
      a.home = h.id;
      this.sendHome(a);
      return;
    }
    a.goingHome = true;
    this.release(a);
    this.startPath(a, this.cellOf(hb), true);
  }

  private go(a: Agent, d: Dest) {
    this.release(a);
    this.startPath(a, d.cell, d.hidden);
    // pas de chemin : il reste où il est, à terre
    if (a.state !== 'walking') return;
    a.spot = d.spot ?? null;
    a.face = d.face ?? null;
    a.deck = d.deck ?? null;
    a.act = d.act ?? null;
    if (d.hold) { a.hold = d.hold; this.held.set(d.hold, a.id); }
    // champ, lisière, chemin : pas tous au milieu de la case
    if (!d.spot && !d.hidden) { const cx = (d.cell % N) + 0.5, cz = Math.floor(d.cell / N) + 0.5; a.spot = [cx + (this.rnd() - 0.5) * 0.5, cz + (this.rnd() - 0.5) * 0.5]; }
  }

  // ---------- Expéditions ----------

  private byId(id: number) { return this.agents.find((a) => a.id === id); }

  /** Habitants adultes libres (ni en expédition, ni blessés) */
  available() { return this.agents.filter((a) => !a.child && !a.mission && a.rest <= 0).length; }

  /** Enrôle une équipe : d'abord ceux qui sont dehors, puis ceux qui sortent de chez eux ; null s'il n'y a pas assez de monde */
  recruit(n: number): number[] | null {
    const free = this.agents.filter((a) => !a.child && !a.mission && a.rest <= 0).sort((a, b) => +a.hidden - +b.hidden);
    if (free.length < n) return null;
    const team = free.slice(0, n);
    for (const a of team) {
      this.release(a);
      if (a.hidden) { const hb = this.world.buildings.get(a.home); if (hb) { a.x = hb.x + 0.5; a.z = hb.z + 0.5; } }
      a.mission = true; a.goingHome = false; a.hidden = false; a.delay = 0;
      a.state = 'doing'; a.timer = 1e9; a.act = null; a.path = []; a.spot = null; a.face = null; a.deck = null;
    }
    return team.map((a) => a.id);
  }

  /** L'équipe se rend en (x, z), en file, et s'y range en cercle, tournée vers le centre */
  partyGo(ids: number[], x: number, z: number, stagger = 0.7) {
    const cx = Math.min(N - 1, Math.max(0, Math.floor(x))), cz = Math.min(N - 1, Math.max(0, Math.floor(z)));
    ids.forEach((id, i) => {
      const a = this.byId(id);
      if (!a) return;
      this.startPath(a, cz * N + cx, false);
      a.act = null;
      if (a.state !== 'walking') return;
      const ang = (i / Math.max(1, ids.length)) * Math.PI * 2 + 0.4;
      a.spot = [x + Math.cos(ang) * 0.3, z + Math.sin(ang) * 0.3];
      a.face = Math.atan2(x - a.spot[0], z - a.spot[1]);
      a.delay = i * stagger;
    });
  }

  /** Toute l'équipe est arrivée (ou s'est arrêtée faute de chemin) */
  partyDone(ids: number[]) { return ids.every((id) => { const a = this.byId(id); return !a || a.state !== 'walking'; }); }

  /** L'équipe, sur place : au travail, en fête… */
  partyAct(ids: number[], act: Act | null) { for (const id of ids) { const a = this.byId(id); if (a) a.act = act; } }

  /** Positions des membres de l'équipe, dans l'ordre de marche */
  partyPositions(ids: number[]) { return ids.map((id) => this.byId(id)).filter((a): a is Agent => !!a && !a.hidden).map((a) => [a.x, a.z, a.heading] as [number, number, number]); }

  /** Fin de l'expédition : chacun rentre chez lui ; les premiers `injured` se reposent `rest` secondes de jeu */
  dismiss(ids: number[], injured = 0, rest = 0) {
    ids.forEach((id, i) => {
      const a = this.byId(id);
      if (!a) return;
      a.mission = false; a.act = null; a.delay = 0;
      if (i < injured) a.rest = rest;
      this.sendHome(a);
    });
  }

  /** Une place libre dans un jardin, pour un enfant ou un adulte */
  private gardenDest(kid: boolean): Dest | null {
    const free: number[] = [];
    for (let i = 0; i < this.gspots.length; i++) if (!!this.gspots[i].kid === kid && !this.held.has(`g${i}`)) free.push(i);
    const i = this.pick(free);
    if (i === undefined) return null;
    const s = this.gspots[i];
    return { cell: Math.floor(s.z) * N + Math.floor(s.x), hidden: false, spot: [s.x, s.z], face: s.face, deck: s.seat ? this.world.hAt(s.x, s.z) + s.seat : undefined, act: s.act, hold: `g${i}` };
  }

  private release(a: Agent) {
    if (a.hold && this.held.get(a.hold) === a.id) this.held.delete(a.hold);
    a.hold = null;
  }

  /** Places des jardins : refaites quand le monde ou l'âge change */
  private refreshGardens(age: number) {
    this.gspots = [];
    for (const g of findGardens(this.world)) this.gspots.push(...layoutGarden(this.world, g, age).spots);
    // les places des jardins sont refaites : on les libère toutes
    for (const k of this.held.keys()) if (k[0] === 'g') this.held.delete(k);
    for (const a of this.agents) if (a.hold?.[0] === 'g') a.hold = null;
  }

  private startPath(a: Agent, goal: number, hiddenAtEnd: boolean) {
    a.spot = null; a.face = null; a.deck = null; a.act = null;
    const start = Math.min(N - 1, Math.max(0, Math.floor(a.z))) * N + Math.min(N - 1, Math.max(0, Math.floor(a.x)));
    const p = this.findPath(start, goal);
    this.pathBudget--;
    if (!p) { a.state = 'doing'; a.timer = 2 + this.rnd() * 2; a.targetHidden = false; a.path = []; if (a.goingHome) { a.goingHome = false; a.state = 'inside'; a.hidden = true; } return; }
    a.path = p; a.pi = 0; a.state = 'walking'; a.hidden = false; a.targetHidden = hiddenAtEnd;
  }

  update(dt: number, hour: number, age: number, sheltering: boolean, popTarget: number, glowNight: number) {
    const w = this.world;
    if (w.version !== this.lastVersion) { this.lastVersion = w.version; this.refreshTargets(); }
    const key = `${w.version}|${age}`;
    if (key !== this.spotKey) { this.spotKey = key; this.refreshGardens(age); }
    const want = Math.min(MAX_AGENTS, Math.floor(popTarget * 0.85));
    while (this.agents.length < want) { const n = this.agents.length; this.addAgent(); if (this.agents.length === n) break; }
    // moins d'habitants : on retire d'abord ceux qui ne sont pas en expédition
    while (this.agents.length > want) {
      let i = this.agents.length - 1;
      while (i >= 0 && this.agents[i].mission) i--;
      if (i < 0) break;
      const [a] = this.agents.splice(i, 1);
      this.release(a); this.dropActor(a);
    }

    const night = hour >= 20.5 || hour < 5.5 || sheltering;
    this.pathBudget = 4;
    for (const a of this.agents) {
      a.phase += dt * 8 * a.speed;
      if (a.rest > 0) a.rest -= dt;
      if (a.state === 'inside') {
        a.timer -= dt;
        // un blessé reste chez lui le temps de guérir
        if (!night && a.timer <= 0 && a.rest <= 0 && this.pathBudget > 0) {
          const hb = w.buildings.get(a.home);
          if (!hb) { this.sendHome(a); continue; }
          a.x = hb.x + 0.5; a.z = hb.z + 0.5;
          const d = this.chooseDest(hour, a.child);
          a.goingHome = false;
          if (d) this.go(a, d); else a.timer = 3;
        }
      } else if (a.state === 'walking') {
        // l'équipe d'une expédition part en file, chacun à son tour
        if (a.mission && a.delay > 0) { a.delay -= dt; continue; }
        if (a.pi >= a.path.length) {
          // dernier pas hors de la route (bout du ponton)
          if (a.spot) {
            const dx = a.spot[0] - a.x, dz = a.spot[1] - a.z, dist = Math.hypot(dx, dz), step = dt * a.speed * 0.7;
            if (dist > step) { a.x += (dx / dist) * step; a.z += (dz / dist) * step; a.heading = Math.atan2(dx, dz); continue; }
            a.x = a.spot[0]; a.z = a.spot[1]; a.spot = null;
          }
          if (a.face !== null) { a.heading = a.face; a.face = null; }
          this.arrive(a, night);
          continue;
        }
        const c = a.path[a.pi];
        const last = a.pi === a.path.length - 1;
        const [px, pz] = w.passPoint(a.path, a.pi), tx = px + (last ? 0 : a.off), tz = pz + (last ? 0 : a.off * 0.7);
        const dx = tx - a.x, dz = tz - a.z, dist = Math.hypot(dx, dz);
        // l'équipe d'une expédition marche du même pas
        const step = dt * (a.mission ? 1.05 : a.speed) * (w.road[c] ? 1.1 : 0.8);
        if (dist <= step) { a.x = tx; a.z = tz; a.pi++; }
        else { a.x += (dx / dist) * step; a.z += (dz / dist) * step; a.heading = Math.atan2(dx, dz); }
        // le bâtiment visé cache l'habitant dès qu'il en atteint la case
        if (last && a.targetHidden && dist < 0.35) a.hidden = true;
        // un obstacle posé sur le chemin : on recalcule
        const nc = a.path[a.pi];
        if (nc !== undefined && w.occ[nc] && nc !== a.path[a.path.length - 1] && w.buildings.get(w.occ[nc])?.kind !== 'lamp') { a.path = []; a.pi = 0; }
        if (night && !a.goingHome && !a.mission && this.pathBudget > 0) this.sendHome(a);
      } else if (a.state === 'doing') {
        // en expédition : il fait ce qu'on lui a dit, jusqu'au prochain ordre
        if (a.mission) continue;
        a.timer -= dt;
        // l'enfant court en rond autour de l'endroit où il joue (sauf aux jeux, où il reste devant)
        if (a.child && !a.hidden && (!a.act || a.act === 'run')) {
          const t = a.phase * 0.18;
          a.x = a.ax + Math.cos(t) * 0.22; a.z = a.az + Math.sin(t) * 0.22;
          a.heading = Math.atan2(-Math.sin(t), Math.cos(t));
        }
        if (night && !a.goingHome) { if (this.pathBudget > 0) this.sendHome(a); }
        else if (a.timer <= 0 && this.pathBudget > 0) {
          a.hidden = false;
          const d = this.chooseDest(hour, a.child);
          if (d) this.go(a, d); else a.timer = 3;
        }
      }
    }
    this.render(age, dt);
  }

  private arrive(a: Agent, night: boolean) {
    if (a.mission) { a.state = 'doing'; a.timer = 1e9; a.hidden = false; a.ax = a.x; a.az = a.z; return; }
    if (a.goingHome) { a.goingHome = false; a.state = 'inside'; a.hidden = true; a.timer = 1 + this.rnd() * 5; return; }
    a.state = 'doing';
    // on s'attarde au coin du feu, sur un banc ou dans les gradins
    a.timer = (a.act === 'sit' || a.act === 'cheer' ? 10 : 4) + this.rnd() * 8;
    a.hidden = a.targetHidden;
    a.ax = a.x; a.az = a.z;
  }

  /** Sol sous l'habitant : platelage du ponton une fois sorti de la route, tablier des ponts, sinon le relief */
  private groundY(a: Agent) {
    return a.deck !== null && a.state !== 'inside' && a.pi >= a.path.length ? a.deck : this.world.surfaceAt(a.x, a.z);
  }

  /** Habitant modélisé : clone de l'époque, cap, animation selon l'activité */
  private animateActor(a: Agent, age: number, dt: number): boolean {
    const set = AGE_VILLAGERS[Math.min(age, 4)], name = set[(a.col + a.id) % set.length];
    if (!hasModel(name)) return false;
    const key = `${name}|${a.id}`;
    if (a.actorKey !== key) {
      this.dropActor(a);
      a.actor = makeActor(name, HUMAN_HEIGHT * (0.92 + (a.id % 5) * 0.04) * (a.child ? 0.62 : 1), 'height');
      if (!a.actor) return false;
      a.actorKey = key;
      // le pas des modèles est lent pour la vitesse de marche du jeu
      for (const n of WALK) a.actor.actions.get(n)?.setEffectiveTimeScale(1.4);
      a.actor.mixer.setTime(this.rnd() * 2);
      this.group.add(a.actor.root);
    }
    const act = a.actor!;
    act.root.visible = !a.hidden;
    if (a.hidden) return true;
    act.root.position.set(a.x, this.groundY(a), a.z);
    act.root.rotation.y = a.heading;
    const running = a.child && (!a.act || a.act === 'run');
    if (a.state === 'walking' || (running && a.state === 'doing')) play(act, running && a.state === 'doing' ? [...RUN, ...WALK] : WALK);
    else if (a.state === 'doing') play(act, a.act === 'sit' ? SIT : a.act === 'cheer' || a.act === 'play' ? CHEER : a.act === 'stroll' || (a.mission && !a.act) ? IDLE : WORK);
    else play(act, IDLE);
    act.mixer.update(dt);
    return true;
  }

  private render(age: number, dt: number) {
    const w = this.world, d = this.d;
    const palette = BODY_COLS[Math.min(age, 4)];
    let n = 0;
    for (const a of this.agents) {
      if (this.animateActor(a, age, dt)) continue;
      if (a.hidden) continue;
      const bob = a.state === 'walking' ? Math.abs(Math.sin(a.phase)) * 0.025 : a.state === 'doing' ? Math.abs(Math.sin(a.phase * 0.6)) * 0.012 : 0;
      d.position.set(a.x, this.groundY(a) + 0.02 + bob, a.z);
      d.rotation.set(a.state === 'walking' ? Math.sin(a.phase) * 0.08 : 0, a.heading, 0);
      const cs = a.child ? 0.65 : 1;
      d.scale.set(cs, cs * (1 + (a.state === 'walking' ? Math.sin(a.phase * 2) * 0.04 : 0)), cs);
      d.updateMatrix();
      this.body.setMatrixAt(n, d.matrix);
      this.head.setMatrixAt(n, d.matrix);
      this.col.setHex(palette[a.col % palette.length]);
      this.body.setColorAt(n, this.col);
      this.col.setHex(SKIN[a.skin]);
      this.head.setColorAt(n, this.col);
      // outil porté sur le côté
      const ts = a.child ? 0 : TOOL_SCALE[Math.min(age, 4)];
      d.translateX(0.1); d.translateY(0.02);
      d.rotation.z = a.state === 'doing' ? Math.sin(a.phase) * 0.8 : 0.1;
      d.scale.set(ts, ts, ts);
      d.updateMatrix();
      d.matrix.multiply(new THREE.Matrix4().makeTranslation(0, 0, 0));
      this.tool.setMatrixAt(n, d.matrix);
      n++;
    }
    for (const m of [this.body, this.head, this.tool]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
