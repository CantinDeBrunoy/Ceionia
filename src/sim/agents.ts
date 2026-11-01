import * as THREE from 'three';
import { World, N } from '../world/world';
import { Building, KINDS, KindId } from '../build/catalog';
import { hash2, mulberry32 } from '../core/rng';
import { makeActor, play, hasModel, Actor, ModelName } from '../render/assets';

const MAX_AGENTS = 90;
/** Habitants modélisés (Quaternius, CC0) : deux silhouettes par âge, la tenue change avec l'époque */
const AGE_MODELS: ModelName[][] = [
  ['adventurer', 'woman_dress'],
  ['farmer', 'woman_dress'],
  ['hooded', 'farmer'],
  ['worker', 'woman'],
  ['woman_casual', 'man'],
];
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
/** Destination d'une sortie : case, caché à l'arrivée (dans un bâtiment), dernier pas hors de la route et cap, platelage */
interface Dest { cell: number; hidden: boolean; spot?: [number, number]; face?: number; deck?: number }

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

  reset() { for (const a of this.agents) this.dropActor(a); this.agents = []; this.lastVersion = -1; }

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
    const cx = cell % N + 0.5, cz = Math.floor(cell / N) + 0.5;
    const near = this.agents.filter((a) => !a.hidden && Math.hypot(a.x - cx, a.z - cz) < 16).slice(0, 5);
    for (const a of near) { a.goingHome = false; this.startPath(a, cell, false); }
  }

  private pick<T>(a: T[]): T | undefined { return a.length ? a[Math.floor(this.rnd() * a.length)] : undefined; }

  private cellOf(b: Building) { return b.z * N + b.x; }

  private chooseDest(hour: number, child = false): Dest | null {
    const r = this.rnd();
    // les enfants vont jouer près des lieux de rencontre, des champs ou au bord des chemins
    if (child) {
      const play = this.socials.filter((b) => b.kind !== 'temple');
      if (play.length && r < 0.5) return { cell: this.cellOf(this.pick(play)!), hidden: false };
      if (this.fields.length && r < 0.7) return { cell: this.pick(this.fields)!, hidden: false };
      if (this.roads.length) return { cell: this.pick(this.roads)!, hidden: false };
    }
    // bûcherons à la lisière
    if (this.woods.length && r > 0.86) return { cell: this.pick(this.woods)!, hidden: false };
    const socialBias = hour >= 12 && hour < 14.5 ? 0.7 : hour >= 17 ? 0.65 : 0.3;
    if (r < socialBias && this.socials.length) {
      const b = this.pick(this.socials)!;
      return { cell: this.cellOf(b), hidden: b.kind === 'temple' };
    }
    if (r < socialBias + 0.4 && this.fields.length && this.rnd() < 0.5) return { cell: this.pick(this.fields)!, hidden: false };
    if (this.works.length && this.rnd() < 0.8) {
      const b = this.pick(this.works)!;
      // le pêcheur va au bout du ponton et regarde l'eau
      if (b.kind === 'pier') {
        const f = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.rot];
        return { cell: this.cellOf(b), hidden: false, spot: [b.x + 0.5 + f[0] * 0.75, b.z + 0.5 + f[1] * 0.75], face: Math.atan2(f[0], f[1]), deck: this.world.h(b.x, b.z) + 0.04 };
      }
      return { cell: this.cellOf(b), hidden: b.kind !== 'farm' };
    }
    if (this.roads.length) return { cell: this.pick(this.roads)!, hidden: false };
    return null;
  }

  private addAgent() {
    const houses = [...this.world.buildings.values()].filter((b) => b.kind === 'house');
    if (!houses.length) return;
    const h = this.pick(houses)!;
    const id = this.nextId++;
    this.agents.push({
      id, home: h.id, x: h.x + 0.5, z: h.z + 0.5, state: 'inside', path: [], pi: 0, timer: this.rnd() * 4, hidden: true, speed: 0.9 + this.rnd() * 0.5,
      heading: 0, phase: this.rnd() * 6, goingHome: false, targetHidden: false, skin: Math.floor(this.rnd() * SKIN.length), col: Math.floor(this.rnd() * 5), off: (this.rnd() - 0.5) * 0.28, actor: null, actorKey: '',
      spot: null, face: null, deck: null, child: this.rnd() < 0.22, ax: 0, az: 0,
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
    this.startPath(a, this.cellOf(hb), true);
  }

  private go(a: Agent, d: Dest) {
    this.startPath(a, d.cell, d.hidden);
    // pas de chemin : il reste où il est, à terre
    if (a.state !== 'walking') return;
    a.spot = d.spot ?? null;
    a.face = d.face ?? null;
    a.deck = d.deck ?? null;
  }

  private startPath(a: Agent, goal: number, hiddenAtEnd: boolean) {
    a.spot = null; a.face = null; a.deck = null;
    const start = Math.min(N - 1, Math.max(0, Math.floor(a.z))) * N + Math.min(N - 1, Math.max(0, Math.floor(a.x)));
    const p = this.findPath(start, goal);
    this.pathBudget--;
    if (!p) { a.state = 'doing'; a.timer = 2 + this.rnd() * 2; a.targetHidden = false; a.path = []; if (a.goingHome) { a.goingHome = false; a.state = 'inside'; a.hidden = true; } return; }
    a.path = p; a.pi = 0; a.state = 'walking'; a.hidden = false; a.targetHidden = hiddenAtEnd;
  }

  update(dt: number, hour: number, age: number, sheltering: boolean, popTarget: number, glowNight: number) {
    const w = this.world;
    if (w.version !== this.lastVersion) { this.lastVersion = w.version; this.refreshTargets(); }
    const want = Math.min(MAX_AGENTS, Math.floor(popTarget * 0.85));
    while (this.agents.length < want) { const n = this.agents.length; this.addAgent(); if (this.agents.length === n) break; }
    while (this.agents.length > want) this.dropActor(this.agents.pop()!);

    const night = hour >= 20.5 || hour < 5.5 || sheltering;
    this.pathBudget = 4;
    for (const a of this.agents) {
      a.phase += dt * 8 * a.speed;
      if (a.state === 'inside') {
        a.timer -= dt;
        if (!night && a.timer <= 0 && this.pathBudget > 0) {
          const hb = w.buildings.get(a.home);
          if (!hb) { this.sendHome(a); continue; }
          a.x = hb.x + 0.5; a.z = hb.z + 0.5;
          const d = this.chooseDest(hour, a.child);
          a.goingHome = false;
          if (d) this.go(a, d); else a.timer = 3;
        }
      } else if (a.state === 'walking') {
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
        const tx = (c % N) + 0.5 + (last ? 0 : a.off), tz = ((c / N) | 0) + 0.5 + (last ? 0 : a.off * 0.7);
        const dx = tx - a.x, dz = tz - a.z, dist = Math.hypot(dx, dz);
        const step = dt * a.speed * (w.road[c] ? 1.1 : 0.8);
        if (dist <= step) { a.x = tx; a.z = tz; a.pi++; }
        else { a.x += (dx / dist) * step; a.z += (dz / dist) * step; a.heading = Math.atan2(dx, dz); }
        // le bâtiment visé cache l'habitant dès qu'il en atteint la case
        if (last && a.targetHidden && dist < 0.35) a.hidden = true;
        // un obstacle posé sur le chemin : on recalcule
        const nc = a.path[a.pi];
        if (nc !== undefined && w.occ[nc] && nc !== a.path[a.path.length - 1] && w.buildings.get(w.occ[nc])?.kind !== 'lamp') { a.path = []; a.pi = 0; }
        if (night && !a.goingHome && this.pathBudget > 0) this.sendHome(a);
      } else if (a.state === 'doing') {
        a.timer -= dt;
        // l'enfant court en rond autour de l'endroit où il joue
        if (a.child && !a.hidden) {
          const t = a.phase * 0.18;
          a.x = a.ax + Math.cos(t) * 0.35; a.z = a.az + Math.sin(t) * 0.35;
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
    if (a.goingHome) { a.goingHome = false; a.state = 'inside'; a.hidden = true; a.timer = 1 + this.rnd() * 5; return; }
    a.state = 'doing';
    a.timer = 4 + this.rnd() * 8;
    a.hidden = a.targetHidden;
    a.ax = a.x; a.az = a.z;
  }

  /** Sol sous l'habitant : platelage du ponton une fois sorti de la route, tablier des ponts, sinon le relief */
  private groundY(a: Agent) {
    return a.deck !== null && a.state !== 'inside' && a.pi >= a.path.length ? a.deck : this.world.surfaceAt(a.x, a.z);
  }

  /** Habitant modélisé : clone de l'époque, cap, animation selon l'activité */
  private animateActor(a: Agent, age: number, dt: number): boolean {
    const name = AGE_MODELS[Math.min(age, 4)][a.col % 2];
    if (!hasModel(name)) return false;
    const key = `${name}|${a.id}`;
    if (a.actorKey !== key) {
      this.dropActor(a);
      a.actor = makeActor(name, HUMAN_HEIGHT * (0.92 + (a.id % 5) * 0.04) * (a.child ? 0.62 : 1), 'height');
      if (!a.actor) return false;
      a.actorKey = key;
      // le pas des modèles est lent pour la vitesse de marche du jeu
      for (const n of ['Walk', 'Man_Walk', 'Female_Walk']) a.actor.actions.get(n)?.setEffectiveTimeScale(1.6);
      a.actor.mixer.setTime(this.rnd() * 2);
      this.group.add(a.actor.root);
    }
    const act = a.actor!;
    act.root.visible = !a.hidden;
    if (a.hidden) return true;
    act.root.position.set(a.x, this.groundY(a), a.z);
    act.root.rotation.y = a.heading;
    if (a.state === 'walking' || (a.child && a.state === 'doing')) play(act, a.child && a.state === 'doing' ? ['Run', 'Man_Run', 'Female_Run', 'Walk'] : ['Walk', 'Man_Walk', 'Female_Walk']);
    else if (a.state === 'doing') play(act, ['Interact', 'Man_Clapping', 'Female_Clapping', 'Wave', 'Idle']);
    else play(act, ['Idle', 'Man_Idle', 'Female_Idle']);
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
