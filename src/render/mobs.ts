import * as THREE from 'three';
import { N } from '../world/world';
import { Underground, UZ_STONE, UZ_CRYSTAL, UZ_ICE, UZ_LUSH, UZ_MAGMA } from '../world/underground';
import { makeActor, play, hasModel, Actor, ModelName } from './assets';
import { batGeo, flapMaterial } from './fauna';
import { caveLit } from './caveLight';
import { mulberry32 } from '../core/rng';

export type MobKind = 'zombie' | 'skeleton' | 'spider' | 'slime' | 'mushnub' | 'ghost';

interface MobSpec {
  model: ModelName;
  size: number;
  fit: 'height' | 'length';
  /** vitesses de marche et de course */
  speed: number;
  run: number;
  /** cases de galerie par individu, selon la zone */
  density: Partial<Record<number, number>>;
  walk: string[];
  idle: string[];
  act: string[];
  hit: string[];
  runAnim?: string[];
  /** cadence de l'animation de marche (les zombies traînent des pieds) */
  walkRate: number;
  fly?: boolean;
  /** monstres : fuient les torches */
  hostile?: boolean;
  /** taille des groupes */
  group?: number;
}

const SPECS: Record<MobKind, MobSpec> = {
  zombie: { model: 'zombie', size: 0.36, fit: 'height', speed: 0.3, run: 0.6, density: { [UZ_STONE]: 110, [UZ_MAGMA]: 170, [UZ_ICE]: 170 }, walk: ['Run_Arms', 'Run'], idle: ['Idle'], act: ['Punch', 'Idle_Attack'], hit: ['HitReact'], walkRate: 0.42, hostile: true, group: 2 },
  skeleton: { model: 'skeleton', size: 0.36, fit: 'height', speed: 0.42, run: 0.95, density: { [UZ_STONE]: 150, [UZ_MAGMA]: 110, [UZ_CRYSTAL]: 190, [UZ_ICE]: 120 }, walk: ['Skeleton_Running'], idle: ['Skeleton_Idle'], act: ['Skeleton_Attack'], hit: ['Skeleton_Idle'], walkRate: 0.55, hostile: true },
  spider: { model: 'spider', size: 0.42, fit: 'length', speed: 0.5, run: 1.5, density: { [UZ_STONE]: 170, [UZ_LUSH]: 230, [UZ_CRYSTAL]: 210 }, walk: ['Spider_Walk'], idle: ['Spider_Idle'], act: ['Spider_Attack'], hit: ['Spider_Jump'], walkRate: 1, hostile: true },
  slime: { model: 'slime', size: 0.2, fit: 'height', speed: 0.35, run: 0.75, density: { [UZ_LUSH]: 90, [UZ_STONE]: 320, [UZ_CRYSTAL]: 260 }, walk: ['Slime_Walk'], idle: ['Slime_Idle'], act: ['Slime_Attack'], hit: ['Slime_Attack'], walkRate: 1 },
  mushnub: { model: 'mushnub', size: 0.26, fit: 'height', speed: 0.3, run: 0.8, density: { [UZ_LUSH]: 55 }, walk: ['Walk'], idle: ['Idle'], act: ['Dance', 'Yes'], hit: ['HitRecieve', 'No'], walkRate: 1, group: 3 },
  ghost: { model: 'ghost', size: 0.34, fit: 'height', speed: 0.28, run: 1.2, density: { [UZ_CRYSTAL]: 110, [UZ_ICE]: 200 }, walk: ['Flying_Idle'], idle: ['Flying_Idle'], act: ['Yes'], hit: ['HitReact', 'No'], runAnim: ['Fast_Flying'], walkRate: 1, fly: true },
};
const KINDS = Object.keys(SPECS) as MobKind[];
const MAX_MOBS = 90;
const SLIME_BIG = 1.7;
const BATS = 28;
/** Au-delà, les créatures ne réfléchissent plus (hors de vue) */
const ACTIVE_DIST = 42;

interface Mob {
  kind: MobKind;
  actor: Actor;
  x: number;
  z: number;
  heading: number;
  state: 'idle' | 'walk' | 'run' | 'act' | 'hit';
  /** cases à suivre (balade) */
  path: number[];
  /** but direct (poursuite, fuite), et distance d'arrêt */
  goal: [number, number] | null;
  stop: number;
  timer: number;
  cool: number;
  /** fuite en cours (s) */
  fear: number;
  scale: number;
  /** slime géant : temps avant de se diviser */
  split: number;
  phase: number;
  prey: Mob | null;
  /** cible à regarder pendant une action */
  face: [number, number] | null;
  alive: boolean;
}

export interface Point { x: number; z: number }

const turnTo = (m: Mob, target: number, k: number) => {
  let d = target - m.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  m.heading += d * Math.min(1, k);
};

/**
 * Créatures du souterrain, façon Minecraft : zombies, squelettes, araignées, slimes, champignons vivants, fantômes
 * et chauves-souris. Les zombies suivent la lanterne du joueur, les monstres fuient les torches (où les champignons
 * vivants viennent danser), les araignées bondissent sur les slimes et les champignons, squelettes et zombies se
 * chamaillent, deux petits slimes fusionnent en un gros qui finit par se diviser
 */
export class UnderMobs {
  group = new THREE.Group();
  mobs: Mob[] = [];
  private rnd = mulberry32(99);
  private t = 0;
  private frame = 0;
  private version = -1;
  private bats: THREE.InstancedMesh;
  private batPhase: THREE.InstancedBufferAttribute;
  private batHomes: [number, number, number][] = [];
  private uTime = { value: 0 };
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private d = new THREE.Object3D();
  private seen = new Int32Array(N * N);
  private from = new Int32Array(N * N);
  private dist = new Int32Array(N * N);
  private q = new Int32Array(N * N);
  private mark = 0;

  constructor(private under: Underground) {
    const g = batGeo();
    this.batPhase = new THREE.InstancedBufferAttribute(new Float32Array(BATS), 1);
    g.setAttribute('aPhase', this.batPhase);
    g.setAttribute('aFlap', new THREE.InstancedBufferAttribute(new Float32Array(BATS).fill(1), 1));
    this.bats = new THREE.InstancedMesh(g, caveLit(flapMaterial(this.uTime, [17, 1.4, 0.008]), 'bat'), BATS);
    this.bats.count = 0;
    this.bats.frustumCulled = false;
    this.group.add(this.bats);
  }

  // ---------- Population ----------

  /** Peuple les galeries : chaque espèce dans ses zones, en groupes, à l'écart des entrées */
  private populate() {
    for (const m of this.mobs) this.remove(m);
    this.mobs = [];
    const u = this.under;
    this.rnd = mulberry32(u.version * 7919 + 17);
    const byZone: number[][] = [[], [], [], [], []];
    for (let k = 0; k < N * N; k++) {
      const x = k % N, z = Math.floor(k / N);
      if (!u.walkable(x, z) || u.wallDist[k] < 1) continue;
      if (u.entrances.some((e) => Math.hypot(e.x - x - 0.5, e.z - z - 0.5) < 4)) continue;
      byZone[u.zone[k]].push(k);
    }
    for (const kind of KINDS) {
      const sp = SPECS[kind];
      for (const [zone, per] of Object.entries(sp.density)) {
        const cells = byZone[+zone];
        let n = Math.floor(cells.length / (per as number));
        while (n > 0 && cells.length) {
          const k = cells[Math.floor(this.rnd() * cells.length)];
          const size = Math.min(n, sp.group ? 1 + Math.floor(this.rnd() * sp.group) : 1);
          for (let i = 0; i < size; i++) this.spawn(kind, (k % N) + 0.3 + this.rnd() * 0.4 + (i % 2) * 0.3, Math.floor(k / N) + 0.3 + this.rnd() * 0.4);
          n -= size;
        }
      }
    }
    // chauves-souris : quelques colonies dans les grandes salles
    this.batHomes = [];
    const halls: number[] = [];
    for (let k = 0; k < N * N; k++) if (u.walkable(k % N, Math.floor(k / N)) && u.wallDist[k] >= 3) halls.push(k);
    for (let i = 0; i < BATS / 4 && halls.length; i++) {
      const k = halls[Math.floor(this.rnd() * halls.length)];
      for (let j = 0; j < 4; j++) this.batHomes.push([(k % N) + 0.5, Math.floor(k / N) + 0.5, this.rnd() * 10]);
    }
  }

  private spawn(kind: MobKind, x: number, z: number): Mob | null {
    const sp = SPECS[kind];
    if (this.mobs.length >= MAX_MOBS || !hasModel(sp.model) || !this.free(x, z)) return null;
    const actor = makeActor(sp.model, sp.size * (0.92 + this.rnd() * 0.16), sp.fit);
    if (!actor) return null;
    actor.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = false;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) caveLit(mat, `mob-${kind}`);
    });
    this.group.add(actor.root);
    const m: Mob = {
      kind, actor, x, z, heading: this.rnd() * Math.PI * 2, state: 'idle', path: [], goal: null, stop: 0.1,
      timer: this.rnd() * 3, cool: 5 + this.rnd() * 10, fear: 0, scale: 1, split: 0, phase: this.rnd() * 10, prey: null, face: null, alive: true,
    };
    play(actor, sp.idle, 0);
    actor.mixer.update(this.rnd() * 2);
    this.mobs.push(m);
    return m;
  }

  private remove(m: Mob) {
    m.alive = false;
    m.actor.mixer.stopAllAction();
    this.group.remove(m.actor.root);
  }

  // ---------- Déplacements ----------

  /** Sol praticable : galerie ouverte, hors des bassins et du pied des parois */
  private free(x: number, z: number) {
    return this.under.walkable(Math.floor(x), Math.floor(z)) && this.under.heightAt(x, z) < 0.45;
  }

  /** Chemin (cases) vers une case praticable tirée entre 3 et r cases de marche */
  private wanderPath(m: Mob, r = 6): number[] {
    const u = this.under, start = Math.floor(m.z) * N + Math.floor(m.x);
    if (!u.walkable(Math.floor(m.x), Math.floor(m.z))) return [];
    const mark = ++this.mark, q = this.q, cand: number[] = [];
    let head = 0, tail = 0;
    q[tail++] = start; this.seen[start] = mark; this.from[start] = -1; this.dist[start] = 0;
    while (head < tail && tail < 500) {
      const k = q[head++], d = this.dist[k], x = k % N, z = Math.floor(k / N);
      if (d >= 3) cand.push(k);
      if (d >= r) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, nk = nz * N + nx;
        if (!u.walkable(nx, nz) || this.seen[nk] === mark || u.heightAt(nx + 0.5, nz + 0.5) > 0.45) continue;
        this.seen[nk] = mark; this.from[nk] = k; this.dist[nk] = d + 1;
        q[tail++] = nk;
      }
    }
    if (!cand.length) return [];
    let k = cand[Math.floor(this.rnd() * cand.length)];
    const path: number[] = [];
    while (k !== start && k >= 0) { path.push(k); k = this.from[k]; }
    return path.reverse();
  }

  /** Pas vers (tx, tz) en glissant le long des parois ; renvoie true une fois arrivé (ou bloqué) */
  private step(m: Mob, tx: number, tz: number, speed: number, dt: number, stop = 0.06): boolean {
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d <= stop) return true;
    const s = Math.min(d - stop, speed * dt), nx = m.x + (dx / d) * s, nz = m.z + (dz / d) * s;
    if (SPECS[m.kind].fly || this.free(nx, nz)) { m.x = nx; m.z = nz; }
    else if (this.free(nx, m.z)) m.x = nx;
    else if (this.free(m.x, nz)) m.z = nz;
    else return true;
    turnTo(m, Math.atan2(dx, dz), dt * 8);
    return d - s <= stop + 1e-3;
  }

  /** Fuite : vers le point praticable le plus éloigné de la menace, dans un éventail de huit directions */
  private flee(m: Mob, px: number, pz: number, time = 2.5) {
    const away = Math.atan2(m.x - px, m.z - pz);
    let best: [number, number] | null = null, bestScore = -Infinity;
    for (let i = 0; i < 8; i++) {
      const a = away + ((i - 3.5) / 3.5) * 1.6;
      for (let r = 2.6; r >= 0.8; r -= 0.6) {
        const x = m.x + Math.sin(a) * r, z = m.z + Math.cos(a) * r;
        if (!SPECS[m.kind].fly && !this.free(x, z)) continue;
        const score = r - Math.abs(a - away) * 0.8;
        if (score > bestScore) { bestScore = score; best = [x, z]; }
        break;
      }
    }
    m.goal = best;
    m.stop = 0.1;
    m.path = [];
    m.fear = time;
    m.state = 'run';
    m.prey = null;
  }

  private act(m: Mob, time: number, face: [number, number] | null, hit = false) {
    m.state = hit ? 'hit' : 'act';
    m.timer = time;
    m.face = face;
    m.goal = null;
    m.path = [];
  }

  /** Le joueur effraie les créatures autour d'un point (clic) ; renvoie leur nombre */
  scare(x: number, z: number, r = 2.2) {
    let n = 0;
    for (const m of this.mobs) {
      if (!m.alive || Math.hypot(m.x - x, m.z - z) > r) continue;
      this.act(m, 0.5, [x, z], true);
      m.fear = -1;
      m.goal = [x, z];
      n++;
    }
    return n;
  }

  /** Créature sous le rayon (clic) */
  hit(ray: THREE.Ray): Mob | null {
    let best: Mob | null = null, bd = Infinity;
    const p = new THREE.Vector3();
    for (const m of this.mobs) {
      if (!m.alive || !m.actor.root.visible) continue;
      const sp = SPECS[m.kind];
      p.set(m.x, m.actor.root.position.y + sp.size * 0.5 * m.scale, m.z);
      const d = ray.distanceToPoint(p);
      if (d < sp.size * 0.7 * m.scale && d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // ---------- Comportements ----------

  update(dt: number, camera: THREE.Camera, lantern: Point, torches: Point[]) {
    if (this.version !== this.under.version) { this.version = this.under.version; this.populate(); }
    this.t += dt;
    this.uTime.value = this.t;
    this.frame++;
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const far = Math.hypot(m.x - lantern.x, m.z - lantern.z);
      if (far < ACTIVE_DIST) this.think(m, dt, lantern, torches);
      this.render(m, dt, camera, far);
    }
    this.mobs = this.mobs.filter((m) => m.alive);
    this.renderBats();
  }

  private nearest(m: Mob, kinds: MobKind[], r: number, pred: (o: Mob) => boolean = () => true): Mob | null {
    let best: Mob | null = null, bd = r;
    for (const o of this.mobs) {
      if (o === m || !o.alive || !kinds.includes(o.kind) || !pred(o)) continue;
      const d = Math.hypot(o.x - m.x, o.z - m.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  private think(m: Mob, dt: number, lantern: Point, torches: Point[]) {
    const sp = SPECS[m.kind];
    m.timer -= dt; m.cool -= dt;
    // action ou sursaut en cours : on regarde sa cible
    if (m.state === 'act' || m.state === 'hit') {
      if (m.face) turnTo(m, Math.atan2(m.face[0] - m.x, m.face[1] - m.z), dt * 6);
      if (m.timer > 0) return;
      // après un sursaut, on détale
      if (m.state === 'hit' && m.goal) this.flee(m, m.goal[0], m.goal[1]);
      else { m.state = 'idle'; m.timer = 0.4 + this.rnd(); return; }
    }
    // fuite en cours
    if (m.fear > 0 && m.goal) {
      m.fear -= dt;
      m.state = 'run';
      if (this.step(m, m.goal[0], m.goal[1], sp.run, dt) || m.fear <= 0) { m.fear = 0; m.goal = null; m.state = 'idle'; m.timer = 0.5 + this.rnd(); }
      return;
    }
    const torch = torches.reduce<Point | null>((b, t) => (Math.hypot(t.x - m.x, t.z - m.z) < (b ? Math.hypot(b.x - m.x, b.z - m.z) : Infinity) ? t : b), null);
    const torchD = torch ? Math.hypot(torch.x - m.x, torch.z - m.z) : Infinity;
    // les monstres craignent la lumière des torches
    if (sp.hostile && torchD < 3.2) { this.flee(m, torch!.x, torch!.z, 3); return; }
    const lanternD = Math.hypot(lantern.x - m.x, lantern.z - m.z);
    switch (m.kind) {
      case 'zombie': {
        // attirés par la lanterne du joueur : ils s'en approchent en traînant des pieds et frappent l'air
        if (lanternD < 6) {
          if (lanternD < 1.15) {
            if (m.cool <= 0) { this.act(m, 1.2, [lantern.x, lantern.z]); m.cool = 2.5 + this.rnd() * 3; }
            else { m.state = 'idle'; turnTo(m, Math.atan2(lantern.x - m.x, lantern.z - m.z), dt * 4); }
          } else { m.state = 'walk'; m.path = []; this.step(m, lantern.x, lantern.z, sp.speed, dt, 1.1); }
          return;
        }
        break;
      }
      case 'ghost': {
        if (lanternD < 2.4) { this.flee(m, lantern.x, lantern.z, 2); return; }
        break;
      }
      case 'spider': {
        if (m.prey) {
          const p = m.prey;
          if (!p.alive || m.timer <= 0) { m.prey = null; m.cool = 8; break; }
          m.state = 'run';
          if (this.step(m, p.x, p.z, sp.run, dt, 0.3)) {
            // bond sur la proie, qui sursaute et s'enfuit
            this.act(m, 0.9, [p.x, p.z]);
            this.act(p, 0.45, [m.x, m.z], true);
            p.goal = [m.x, m.z];
            m.prey = null;
            m.cool = 25 + this.rnd() * 15;
          }
          return;
        }
        if (m.cool <= 0) {
          const prey = this.nearest(m, ['slime', 'mushnub'], 2.6);
          if (prey) { m.prey = prey; m.timer = 4; this.flee(prey, m.x, m.z, 2.2); return; }
        }
        break;
      }
      case 'mushnub': {
        const threat = this.nearest(m, ['zombie', 'spider'], 1.8);
        if (threat) { this.flee(m, threat.x, threat.z); return; }
        // une torche allumée : on vient danser autour
        if (torch && torchD < 5) {
          if (torchD < 0.9) this.act(m, 3 + this.rnd() * 3, [torch.x, torch.z]);
          else { m.state = 'walk'; m.path = []; this.step(m, torch.x, torch.z, sp.speed, dt, 0.85); }
          return;
        }
        break;
      }
      case 'slime': {
        if (m.scale > 1) {
          // le gros slime finit par se diviser en deux petits
          m.split -= dt;
          if (m.split <= 0) {
            m.scale = 1;
            const a = this.rnd() * Math.PI * 2;
            const twin = this.spawn('slime', m.x + Math.sin(a) * 0.3, m.z + Math.cos(a) * 0.3);
            if (twin) { twin.cool = m.cool = 20; this.flee(twin, m.x, m.z, 1); }
          }
        } else if (m.cool <= 0) {
          // deux petits slimes se cherchent, et fusionnent en se touchant
          const other = this.nearest(m, ['slime'], 4, (o) => o.scale === 1 && o.cool <= 0);
          if (other && Math.hypot(other.x - m.x, other.z - m.z) < 0.34) {
            this.remove(other);
            m.scale = SLIME_BIG;
            m.split = 40 + this.rnd() * 40;
            m.cool = 15;
            this.act(m, 0.8, null);
            return;
          }
          // une paroi les sépare : on renonce pour un temps
          if (other) { m.state = 'walk'; m.path = []; if (this.step(m, other.x, other.z, sp.speed, dt, 0.3) && Math.hypot(other.x - m.x, other.z - m.z) > 0.34) m.cool = 6; return; }
        }
        break;
      }
      case 'skeleton': {
        // un squelette va chercher querelle au zombie qu'il aperçoit
        if (m.cool <= 0) {
          const z = this.nearest(m, ['zombie'], 4, (o) => o.cool <= 0 && o.state !== 'act');
          if (z && Math.hypot(z.x - m.x, z.z - m.z) < 0.95) {
            this.act(m, 1.6, [z.x, z.z]);
            this.act(z, 1.6, [m.x, m.z]);
            m.cool = z.cool = 20 + this.rnd() * 10;
            return;
          }
          if (z) { m.state = 'walk'; m.path = []; if (this.step(m, z.x, z.z, sp.speed, dt, 0.8) && Math.hypot(z.x - m.x, z.z - m.z) > 0.95) m.cool = 6; return; }
        }
        break;
      }
    }
    // balade : un chemin dans les galeries, entrecoupé de pauses
    if (m.path.length) {
      const k = m.path[0], tx = (k % N) + 0.5, tz = Math.floor(k / N) + 0.5;
      m.state = 'walk';
      if (this.step(m, tx, tz, sp.speed * (m.kind === 'slime' ? 1 / Math.sqrt(m.scale) : 1), dt, 0.12)) m.path.shift();
      if (!m.path.length) { m.state = 'idle'; m.timer = 1 + this.rnd() * 3; }
      return;
    }
    m.state = 'idle';
    if (m.timer <= 0) {
      if (this.rnd() < 0.35) m.timer = 1.5 + this.rnd() * 3;
      else m.path = this.wanderPath(m, sp.fly ? 8 : 6);
    }
  }

  // ---------- Rendu ----------

  private render(m: Mob, dt: number, camera: THREE.Camera, lanternD: number) {
    const a = m.actor, sp = SPECS[m.kind];
    const y = this.under.heightAt(m.x, m.z) + (sp.fly ? 0.45 + Math.sin(this.t * 1.7 + m.phase) * 0.08 : 0);
    this.sphere.center.set(m.x, y + sp.size * 0.5, m.z);
    this.sphere.radius = sp.size * m.scale + 0.2;
    const visible = lanternD < ACTIVE_DIST + 6 && this.frustum.intersectsSphere(this.sphere);
    a.root.visible = visible;
    if (!visible) return;
    a.root.position.set(m.x, y, m.z);
    a.root.rotation.y = m.heading;
    a.root.scale.setScalar(m.scale);
    const anim = m.state === 'act' ? sp.act : m.state === 'hit' ? sp.hit : m.state === 'run' ? sp.runAnim ?? sp.walk : m.state === 'walk' ? sp.walk : sp.idle;
    play(a, anim, 0.2);
    if (a.current) a.current.timeScale = m.state === 'walk' ? sp.walkRate : m.state === 'run' ? sp.walkRate * 1.9 : 1;
    const far = camera.position.distanceTo(this.sphere.center) > 26;
    if (!far) a.mixer.update(dt);
    else if ((this.frame + Math.floor(m.phase * 10)) % 2 === 0) a.mixer.update(dt * 2);
  }

  /** Chauves-souris : boucles irrégulières sous la voûte de leur salle */
  private renderBats() {
    const d = this.d, t = this.t;
    let n = 0;
    for (const [hx, hz, p] of this.batHomes) {
      const x = hx + Math.sin(t * 0.8 + p) * 1.6 + Math.sin(t * 2.1 + p * 2) * 0.2;
      const z = hz + Math.cos(t * 0.65 + p * 1.7) * 1.6 + Math.cos(t * 2.7 + p) * 0.2;
      const nx = hx + Math.sin((t + 0.05) * 0.8 + p) * 1.6, nz = hz + Math.cos((t + 0.05) * 0.65 + p * 1.7) * 1.6;
      d.position.set(x, this.under.heightAt(x, z) + 1.3 + Math.sin(t * 2.3 + p) * 0.25, z);
      d.rotation.set(0, Math.atan2(nx - x, nz - z), 0);
      d.scale.setScalar(1.7);
      d.updateMatrix();
      this.bats.setMatrixAt(n, d.matrix);
      this.batPhase.setX(n, p * 3);
      n++;
    }
    this.bats.count = n;
    this.bats.instanceMatrix.needsUpdate = true;
    this.batPhase.needsUpdate = true;
  }
}
