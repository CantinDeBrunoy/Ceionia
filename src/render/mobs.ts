import * as THREE from 'three';
import { N } from '../world/world';
import { Underground, UZ_STONE, UZ_CRYSTAL, UZ_ICE, UZ_LUSH, UZ_MAGMA } from '../world/underground';
import { makeActor, play, hasModel, Actor, ModelName } from './assets';
import { batGeo, flapMaterial } from './fauna';
import { caveLit } from './caveLight';
import { mulberry32, wrapAngle } from '../core/rng';

export type MobKind = 'zombie' | 'skeleton' | 'spider' | 'slime' | 'mushnub' | 'ghost' | 'golem' | 'worm';

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
  /** créature dessinée et animée ici (pas de modèle animé) */
  drawn?: boolean;
  /** âge du village où elle apparaît, et ses zones (cases de galerie par individu) */
  from?: number;
}

const SPECS: Record<MobKind, MobSpec> = {
  zombie: { model: 'zombie', size: 0.36, fit: 'height', speed: 0.3, run: 0.6, density: { [UZ_STONE]: 110, [UZ_MAGMA]: 170, [UZ_ICE]: 170 }, walk: ['Run_Arms', 'Run'], idle: ['Idle'], act: ['Punch', 'Idle_Attack'], hit: ['HitReact'], walkRate: 0.42, hostile: true, group: 2 },
  skeleton: { model: 'skeleton', size: 0.36, fit: 'height', speed: 0.42, run: 0.95, density: { [UZ_STONE]: 150, [UZ_MAGMA]: 110, [UZ_CRYSTAL]: 190, [UZ_ICE]: 120 }, walk: ['Skeleton_Running'], idle: ['Skeleton_Idle'], act: ['Skeleton_Attack'], hit: ['Skeleton_Idle'], walkRate: 0.55, hostile: true },
  spider: { model: 'spider', size: 0.42, fit: 'length', speed: 0.5, run: 1.5, density: { [UZ_STONE]: 170, [UZ_LUSH]: 230, [UZ_CRYSTAL]: 210 }, walk: ['Spider_Walk'], idle: ['Spider_Idle'], act: ['Spider_Attack'], hit: ['Spider_Jump'], walkRate: 1, hostile: true },
  slime: { model: 'slime', size: 0.2, fit: 'height', speed: 0.35, run: 0.75, density: { [UZ_LUSH]: 90, [UZ_STONE]: 320, [UZ_CRYSTAL]: 260 }, walk: ['Slime_Walk'], idle: ['Slime_Idle'], act: ['Slime_Attack'], hit: ['Slime_Attack'], walkRate: 1 },
  mushnub: { model: 'mushnub', size: 0.26, fit: 'height', speed: 0.3, run: 0.8, density: { [UZ_LUSH]: 55 }, walk: ['Walk'], idle: ['Idle'], act: ['Dance', 'Yes'], hit: ['HitRecieve', 'No'], walkRate: 1, group: 3 },
  ghost: { model: 'ghost', size: 0.34, fit: 'height', speed: 0.28, run: 1.2, density: { [UZ_CRYSTAL]: 110, [UZ_ICE]: 200 }, walk: ['Flying_Idle'], idle: ['Flying_Idle'], act: ['Yes'], hit: ['HitReact', 'No'], runAnim: ['Fast_Flying'], walkRate: 1, fly: true },
  // gardien de pierre (dès l'âge médiéval) : le corps du zombie, pétrifié, cuirassé de rocs, un cristal planté dans le dos
  golem: { model: 'zombie', size: 0.62, fit: 'height', speed: 0.2, run: 0.5, density: { [UZ_STONE]: 300, [UZ_MAGMA]: 220, [UZ_CRYSTAL]: 320 }, walk: ['Walk', 'Run_Arms'], idle: ['Idle'], act: ['Punch', 'Run_Attack'], hit: ['HitReact'], walkRate: 0.45, hostile: true, from: 2 },
  // ver des profondeurs (dès l'âge industriel) : un long corps annelé qui ondule, une gueule ronde hérissée de crocs
  worm: { model: 'zombie', size: 1.1, fit: 'length', speed: 0.38, run: 0.9, density: { [UZ_STONE]: 360, [UZ_MAGMA]: 260, [UZ_LUSH]: 320, [UZ_ICE]: 360 }, walk: [], idle: [], act: [], hit: [], walkRate: 1, hostile: true, drawn: true, from: 3 },
};
/** Les créatures grandissent avec les âges du village (échelle selon l'âge, de la préhistoire au futur) */
const GROW = [1, 1.06, 1.16, 1.28, 1.4, 1.52];
/** Yeux luisants : à partir de l'âge médiéval, ambre, puis rouge braise, puis rouge sang */
const EYES = [0, 0, 0xffc04a, 0xff6a2a, 0xff2a2a, 0xff1040];
/** Teinte des corps aux âges avancés (plus sombres, plus malsains) */
const DARKEN: Partial<Record<MobKind, number>> = { zombie: 0x2d3a22, skeleton: 0x3a3028, spider: 0x2a0e12, slime: 0x1e4a1a, ghost: 0x40306a };
const KINDS = Object.keys(SPECS) as MobKind[];
const MAX_MOBS = 90;
const SLIME_BIG = 1.7;
/** Durée de la chute d'une créature terrassée (elle tourne, rapetisse et part en fumée) */
const DIE = 0.5;
/** Créatures en plus de la population, le temps d'une embuscade */
const MAX_FOES = 24;
const BATS = 28;
/** Au-delà, les créatures ne réfléchissent plus (hors de vue) */
const ACTIVE_DIST = 42;

export interface Mob {
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
  /** à l'assaut d'une troupe armée : le point qu'elle charge (mis à jour par la vue) */
  foe: [number, number] | null;
  /** au contact d'une troupe : le soldat qu'elle attaque (pour lui faire face) */
  target?: [number, number] | null;
  /** terrassée : temps restant avant de disparaître (négatif : vivante) */
  dying: number;
  /** yeux luisants, et l'os de la tête qu'ils suivent */
  eyes?: THREE.Object3D | null;
  head?: THREE.Object3D | null;
  /** ver des profondeurs : ses anneaux, de la tête à la queue */
  segs?: THREE.Object3D[];
}

export interface Point { x: number; z: number }

const EYE_GEO = new THREE.SphereGeometry(1, 6, 4), ROCK_GEO = new THREE.DodecahedronGeometry(1, 0), SHARD_GEO = new THREE.OctahedronGeometry(1, 0);
const STONE_SKIN = new THREE.Color(0x7d786f), EYE_AT = new THREE.Vector3();

/**
 * Ver des profondeurs, dessiné anneau par anneau (même facture facettée que les bêtes) : une tête ronde à la gueule béante
 * hérissée de crocs, quatre yeux verts, des anneaux de plus en plus fins, chacun cerclé d'une plaque plus sombre. `size` :
 * sa longueur. L'animation est faite à la main (wormPose) : pas de squelette, un mélangeur vide
 */
function makeWorm(size: number) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const skin = caveLit(new THREE.MeshStandardMaterial({ color: 0x7a5f68, roughness: 0.85, flatShading: true }), 'worm-skin');
  const plate = caveLit(new THREE.MeshStandardMaterial({ color: 0x3e3036, roughness: 0.7, flatShading: true }), 'worm-plate');
  const fang = caveLit(new THREE.MeshStandardMaterial({ color: 0xece2c8, roughness: 0.6, flatShading: true }), 'worm-fang');
  const maw = new THREE.MeshBasicMaterial({ color: 0x5a0d14 }), eye = new THREE.MeshBasicMaterial({ color: 0xc6ff4a, fog: false });
  const n = 12, segs: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), r = size * (0.085 - 0.05 * t) * (i === 0 ? 1.15 : 1), s = new THREE.Group();
    const ball = new THREE.Mesh(ROCK_GEO, skin);
    ball.scale.set(r, r * 0.9, r * 1.15);
    s.add(ball);
    if (i === 0) { const collar = new THREE.Mesh(RING_GEO, plate); collar.scale.set(r * 1.12, r * 1.12, r * 0.7); collar.position.z = r * 0.5; s.add(collar); }
    if (i > 0) { const ringM = new THREE.Mesh(RING_GEO, plate); ringM.scale.set(r * 1.08, r * 1.08, r * 0.5); s.add(ringM); }
    else {
      // la gueule : un disque rouge sombre devant, une couronne de crocs tournés vers l'intérieur, les yeux au-dessus
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(r * 0.75, 10), maw);
      mouth.position.z = r * 1.1;
      s.add(mouth);
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2, f = new THREE.Mesh(FANG_GEO, fang);
        f.scale.set(r * 0.12, r * 0.45, r * 0.12);
        f.position.set(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, r * 1.08);
        f.rotation.set(Math.PI / 2, 0, a + Math.PI / 2);
        f.rotateX(0.5);
        s.add(f);
      }
      for (const [ex, ey] of [[-0.45, 0.55], [0.45, 0.55], [-0.75, 0.25], [0.75, 0.25]]) {
        const e = new THREE.Mesh(EYE_GEO, eye);
        e.scale.setScalar(r * 0.13);
        e.position.set(ex * r, ey * r, r * 0.85);
        s.add(e);
      }
    }
    s.userData.r = r;
    s.userData.len = size;
    body.add(s);
    segs.push(s);
  }
  root.userData.segs = segs;
  return { root, mixer: new THREE.AnimationMixer(root), actions: new Map<string, THREE.AnimationAction>(), current: null } as Actor;
}
const RING_GEO = new THREE.TorusGeometry(1, 0.18, 4, 9), FANG_GEO = new THREE.ConeGeometry(1, 1, 4);

const turnTo = (m: Mob, target: number, k: number) => {
  let d = target - m.heading;
  d = wrapAngle(d);
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
  private puffs: { mesh: THREE.Mesh; t: number; vx: number; vz: number }[] = [];
  private puffGeo = new THREE.IcosahedronGeometry(0.06, 0);
  private puffMat = new THREE.MeshBasicMaterial({ color: 0xc4bed4, transparent: true, opacity: 0.85, depthWrite: false });
  /** galeries tenues par le village (lanternes, garnisons) : les créatures n'y naissent pas et n'y vont pas */
  held: () => Set<number> = () => new Set();
  private heldN = 0;
  /** âge du village (donné par la vue) : les créatures grandissent, s'assombrissent, de nouvelles espèces paraissent */
  age = 0;
  private bornAge = -1;

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
    // les créatures d'une embuscade restent jusqu'à la fin de leur combat (elles tombent ou s'enfuient) : le souterrain change
    // justement quand la troupe prend des galeries
    const fighting = this.mobs.filter((m) => m.alive && (m.foe || m.dying >= 0));
    for (const m of this.mobs) if (!fighting.includes(m)) this.remove(m);
    this.mobs = fighting;
    const u = this.under;
    this.rnd = mulberry32(u.version * 7919 + 17);
    const held = this.held();
    this.heldN = held.size;
    const byZone: number[][] = [[], [], [], [], []];
    for (let k = 0; k < N * N; k++) {
      const x = k % N, z = Math.floor(k / N);
      if (!u.walkable(x, z) || u.wallDist[k] < 1) continue;
      if (u.entrances.some((e) => Math.hypot(e.x - x - 0.5, e.z - z - 0.5) < 4) || held.has(k)) continue;
      byZone[u.zone[k]].push(k);
    }
    // chaque espèce dans ses zones, groupe après groupe et à tour de rôle : le plafond n'affame aucune espèce
    const tasks: { kind: MobKind; cells: number[]; n: number }[] = [];
    for (const kind of KINDS) {
      const sp = SPECS[kind];
      if ((sp.from ?? 0) > this.age) continue;
      for (const [zone, per] of Object.entries(sp.density)) {
        const cells = byZone[+zone];
        if (cells.length) tasks.push({ kind, cells, n: Math.floor(cells.length / (per as number)) });
      }
    }
    for (let more = true; more && this.mobs.length < MAX_MOBS;) {
      more = false;
      for (const t of tasks) {
        if (t.n <= 0) continue;
        const sp = SPECS[t.kind], k = t.cells[Math.floor(this.rnd() * t.cells.length)];
        const size = Math.min(t.n, sp.group ? 1 + Math.floor(this.rnd() * sp.group) : 1);
        for (let i = 0; i < size; i++) this.spawn(t.kind, (k % N) + 0.3 + this.rnd() * 0.4 + (i % 2) * 0.3, Math.floor(k / N) + 0.3 + this.rnd() * 0.4);
        t.n -= size;
        more = true;
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

  private spawn(kind: MobKind, x: number, z: number, foe = false): Mob | null {
    const sp = SPECS[kind];
    if (this.mobs.length >= MAX_MOBS + (foe ? MAX_FOES : 0) || (!sp.drawn && !hasModel(sp.model)) || !this.free(x, z)) return null;
    // plus l'âge avance, plus elles sont grosses (l'araignée devient géante)
    const age = Math.min(5, Math.max(0, this.age)), size = sp.size * GROW[age] * (kind === 'spider' && age >= 3 ? 1.35 : 1) * (0.92 + this.rnd() * 0.16);
    const actor = sp.drawn ? makeWorm(size) : makeActor(sp.model, size, sp.fit);
    if (!actor) return null;
    // aux âges avancés, les corps s'assombrissent : chacune a alors ses propres matériaux
    const own = kind === 'golem' || (age >= 3 && !!DARKEN[kind]);
    actor.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = false;
      if (own && !sp.drawn) mesh.material = Array.isArray(mesh.material) ? mesh.material.map((mt) => mt.clone()) : mesh.material.clone();
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        if (own && !sp.drawn) {
          // pétrifié : plus de texture ni de couleurs de sommet, une pierre grise (un peu plus claire ou sombre par pièce)
          if (kind === 'golem') { mat.map = null; mat.vertexColors = false; mat.color.copy(STONE_SKIN).multiplyScalar(0.85 + this.rnd() * 0.3); mat.flatShading = true; mat.needsUpdate = true; }
          else mat.color.lerp(new THREE.Color(DARKEN[kind]!), age >= 4 ? 0.72 : 0.5);
        }
        caveLit(mat, `mob-${kind}${own ? '-own' : ''}`);
      }
    });
    this.group.add(actor.root);
    const m: Mob = {
      kind, actor, x, z, heading: this.rnd() * Math.PI * 2, state: 'idle', path: [], goal: null, stop: 0.1,
      timer: this.rnd() * 3, cool: 5 + this.rnd() * 10, fear: 0, scale: 1, split: 0, phase: this.rnd() * 10, prey: null, face: null, alive: true,
      foe: null, dying: -1,
    };
    if (sp.drawn) m.segs = actor.root.userData.segs;
    else this.dress(m, size, age);
    play(actor, sp.idle, 0);
    actor.mixer.update(this.rnd() * 2);
    this.mobs.push(m);
    return m;
  }

  /**
   * Habille une créature selon l'âge : yeux luisants qui suivent sa tête (dès l'âge médiéval) ; le gardien de pierre se
   * couvre de rocs sur la tête, les épaules, le torse et les bras, un cristal lumineux planté entre les omoplates
   */
  private dress(m: Mob, size: number, age: number) {
    const root = m.actor.root, bones: Record<string, THREE.Object3D> = {};
    root.traverse((o) => { if ((o as THREE.Bone).isBone) bones[o.name] = o; });
    m.head = bones.Head ?? null;
    const eye = m.kind === 'golem' ? 0x7dfcff : EYES[age];
    // (l'araignée a déjà ses yeux rouges : elle s'assombrit et grandit)
    if (eye && m.kind !== 'slime' && m.kind !== 'mushnub' && m.kind !== 'spider') {
      const eyes = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: eye, fog: false }), s = size * 0.026;
      for (const side of [-1, 1]) {
        const e = new THREE.Mesh(EYE_GEO, mat);
        e.scale.setScalar(s);
        e.position.set(side * s * 1.3, 0, 0);
        eyes.add(e);
      }
      root.add(eyes);
      m.eyes = eyes;
    }
    if (m.kind !== 'golem') return;
    // les rocs sur les os : leur taille se compte en monde (l'os porte l'échelle du modèle)
    root.updateMatrixWorld(true);
    const ws = new THREE.Vector3(), rock = new THREE.MeshStandardMaterial({ color: 0x8a857c, roughness: 0.95, flatShading: true });
    caveLit(rock, 'golem-rock');
    const plates: [string, number, number][] = [['Head', 0.13, 0.05], ['ShoulderL', 0.15, 0], ['ShoulderR', 0.15, 0], ['Torso', 0.2, 0.02], ['UpperArmL', 0.1, 0], ['UpperArmR', 0.1, 0], ['LowerArmL', 0.12, 0.04], ['LowerArmR', 0.12, 0.04], ['Abdomen', 0.16, 0]];
    plates.forEach(([name, r, up], i) => {
      const b = bones[name];
      if (!b) return;
      b.getWorldScale(ws);
      const g = new THREE.Mesh(ROCK_GEO, rock), k = 1 / Math.max(1e-6, ws.x);
      g.scale.set(r * size * k * (0.9 + (i % 3) * 0.1), r * size * k * 0.8, r * size * k);
      g.position.set(0, up * size * k, 0);
      g.rotation.set(i * 1.3, i * 2.1, i * 0.7);
      b.add(g);
    });
    const torso = bones.Torso;
    if (torso) {
      torso.getWorldScale(ws);
      const k = 1 / Math.max(1e-6, ws.x), c = new THREE.Mesh(SHARD_GEO, new THREE.MeshBasicMaterial({ color: 0x7dfcff }));
      c.scale.set(size * 0.06 * k, size * 0.22 * k, size * 0.06 * k);
      c.position.set(0, size * 0.05 * k, -size * 0.12 * k);
      c.rotation.x = -0.5;
      torso.add(c);
    }
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
    const mark = ++this.mark, q = this.q, cand: number[] = [], held = this.held();
    let head = 0, tail = 0;
    q[tail++] = start; this.seen[start] = mark; this.from[start] = -1; this.dist[start] = 0;
    while (head < tail && tail < 500) {
      const k = q[head++], d = this.dist[k], x = k % N, z = Math.floor(k / N);
      if (d >= 3 && !held.has(k)) cand.push(k);
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
      if (!m.alive || m.foe || m.dying >= 0 || Math.hypot(m.x - x, m.z - z) > r) continue;
      this.act(m, 0.5, [x, z], true);
      m.fear = -1;
      m.goal = [x, z];
      n++;
    }
    return n;
  }

  // ---------- Embuscades ----------

  /**
   * Embuscade : `n` créatures surgissent des galeries à deux à quatre pas de `cell` (hors des galeries tenues) et chargent
   * vers elle par le plus court chemin ; la vue leur donne ensuite la troupe pour cible
   */
  ambush(kind: MobKind, n: number, cell: number): Mob[] {
    const u = this.under, d = u.distances(cell), held = this.held(), cand: number[] = [], out: Mob[] = [];
    for (let k = 0; k < N * N; k++) if (d[k] >= 2 && d[k] <= 4 && !held.has(k)) cand.push(k);
    for (let i = 0; i < n && cand.length; i++) {
      const k = cand.splice(Math.floor(this.rnd() * cand.length), 1)[0];
      const m = this.spawn(kind, (k % N) + 0.3 + this.rnd() * 0.4, Math.floor(k / N) + 0.3 + this.rnd() * 0.4, true);
      if (!m) { i--; continue; }
      m.path = u.route(k, cell)?.slice(1) ?? [];
      m.foe = [(cell % N) + 0.5, Math.floor(cell / N) + 0.5];
      out.push(m);
    }
    return out;
  }

  /** Une créature terrassée : elle tourne sur elle-même, rapetisse et part en fumée */
  kill(m: Mob) {
    if (!m.alive || m.dying >= 0) return;
    m.foe = null;
    m.dying = DIE;
    this.act(m, DIE, null, true);
    const y = this.under.heightAt(m.x, m.z) + 0.12;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this.rnd(), mesh = new THREE.Mesh(this.puffGeo, this.puffMat.clone());
      mesh.position.set(m.x, y + this.rnd() * 0.1, m.z);
      this.group.add(mesh);
      this.puffs.push({ mesh, t: -this.rnd() * 0.15, vx: Math.sin(a) * 0.5, vz: Math.cos(a) * 0.5 });
    }
  }

  /** La troupe a dû reculer : les créatures qui restent s'en retournent dans le noir */
  rout(m: Mob, x: number, z: number) {
    if (!m.alive || m.dying >= 0) return;
    m.foe = null;
    this.flee(m, x, z, 3);
  }

  /** Un coup porté à une créature à l'assaut : elle recule d'un pas, sursaute, puis repart à l'attaque */
  strike(m: Mob, fromX: number, fromZ: number) {
    if (!m.alive || m.dying >= 0) return;
    const d = Math.hypot(m.x - fromX, m.z - fromZ) || 1, nx = m.x + ((m.x - fromX) / d) * 0.07, nz = m.z + ((m.z - fromZ) / d) * 0.07;
    if (this.free(nx, nz)) { m.x = nx; m.z = nz; }
    m.state = 'hit'; m.timer = 0.32;
  }

  /** À l'assaut : par les galeries tant que la troupe est loin, puis droit sur elle ; au contact, on frappe sans relâche */
  private assault(m: Mob, dt: number) {
    // touchée : le sursaut se joue jusqu'au bout avant de repartir à l'attaque
    if (m.state === 'hit' && m.timer > 0) { if (m.face) turnTo(m, Math.atan2(m.face[0] - m.x, m.face[1] - m.z), dt * 6); return; }
    const [fx, fz] = m.foe!, d = Math.hypot(fx - m.x, fz - m.z), run = Math.max(SPECS[m.kind].run, 1.4) * 1.1;
    if (d > 0.55) {
      m.state = 'run';
      if (m.path.length && d > 1.5) {
        const k = m.path[0];
        if (this.step(m, (k % N) + 0.5, Math.floor(k / N) + 0.5, run, dt, 0.15)) m.path.shift();
      } else this.step(m, fx, fz, run, dt, 0.5);
      return;
    }
    // au contact : face à sa cible (le soldat le plus proche, s'il y en a un), on frappe sans relâche
    const tf = m.target ?? [fx, fz];
    turnTo(m, Math.atan2(tf[0] - m.x, tf[1] - m.z), dt * 6);
    if (m.state !== 'act' || m.timer <= 0) { m.state = 'act'; m.timer = 0.6 + this.rnd() * 0.5; m.face = tf; }
  }

  /** Fumée des créatures terrassées : elle s'étale, monte et s'efface */
  private stepPuffs(dt: number) {
    for (const p of this.puffs) {
      p.t += dt;
      if (p.t < 0) continue;
      const k = p.t / 0.7;
      p.mesh.scale.setScalar(0.6 + k * 2.4);
      p.mesh.position.x += p.vx * dt; p.mesh.position.z += p.vz * dt; p.mesh.position.y += dt * 0.35;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      if (k >= 1) { this.group.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); }
    }
    this.puffs = this.puffs.filter((p) => p.t < 0.7);
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
    // un nouvel âge : la population renaît, plus grosse et plus terrible
    if (this.version !== this.under.version || this.bornAge !== Math.min(5, this.age)) { this.version = this.under.version; this.bornAge = Math.min(5, this.age); this.populate(); }
    // de nouvelles galeries prises : les créatures qui s'y trouvaient ont fui
    const held = this.held();
    if (held.size !== this.heldN) {
      this.heldN = held.size;
      for (const m of this.mobs) if (!m.foe && m.dying < 0 && held.has(Math.floor(m.z) * N + Math.floor(m.x))) this.remove(m);
      this.mobs = this.mobs.filter((m) => m.alive);
    }
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
    this.stepPuffs(dt);
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
    if (m.dying >= 0) return;
    // à l'assaut d'une troupe armée : rien ne l'arrête, pas même les torches
    if (m.foe) { this.assault(m, dt); return; }
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
    if (m.dying >= 0) {
      m.dying -= dt;
      m.heading += dt * 12;
      if (m.dying <= 0) { this.remove(m); return; }
    }
    const y = this.under.heightAt(m.x, m.z) + (sp.fly ? 0.45 + Math.sin(this.t * 1.7 + m.phase) * 0.08 : 0);
    this.sphere.center.set(m.x, y + sp.size * 0.5, m.z);
    this.sphere.radius = sp.size * m.scale + 0.2;
    const visible = lanternD < ACTIVE_DIST + 6 && this.frustum.intersectsSphere(this.sphere);
    a.root.visible = visible;
    if (!visible) return;
    a.root.position.set(m.x, y, m.z);
    a.root.rotation.y = m.heading;
    a.root.scale.setScalar(m.scale * (m.dying >= 0 ? m.dying / DIE : 1));
    if (m.segs) { this.wormPose(m, dt); return; }
    const anim = m.state === 'act' ? sp.act : m.state === 'hit' ? sp.hit : m.state === 'run' ? sp.runAnim ?? sp.walk : m.state === 'walk' ? sp.walk : sp.idle;
    play(a, anim, 0.2);
    if (a.current) a.current.timeScale = m.state === 'walk' ? sp.walkRate : m.state === 'run' ? sp.walkRate * 1.9 : 1;
    const far = camera.position.distanceTo(this.sphere.center) > 26;
    if (!far) a.mixer.update(dt);
    else if ((this.frame + Math.floor(m.phase * 10)) % 2 === 0) a.mixer.update(dt * 2);
    // les yeux suivent la tête (un peu devant et au-dessus de son os)
    if (m.eyes) {
      const size = sp.size * GROW[Math.min(5, this.age)];
      if (m.head) { m.head.getWorldPosition(EYE_AT); a.root.worldToLocal(EYE_AT); }
      else EYE_AT.set(0, size * (m.kind === 'spider' ? 0.35 : 0.85), 0);
      const fwd = m.kind === 'skeleton' ? 0.13 : m.kind === 'ghost' ? 0.2 : 0.2, up = m.kind === 'skeleton' ? 0.12 : m.kind === 'ghost' ? -0.25 : 0.17;
      m.eyes.position.set(EYE_AT.x, EYE_AT.y + size * up, EYE_AT.z + size * fwd);
    }
  }

  /**
   * Le ver des profondeurs : ses anneaux ondulent derrière la tête, plus vite à la course ; à l'attaque, il se cabre et
   * plonge, la gueule ouverte ; touché, il se tord
   */
  private wormPose(m: Mob, dt: number) {
    const segs = m.segs!, n = segs.length, len = segs[0].userData.len as number;
    const k = m.state === 'run' ? 11 : m.state === 'walk' ? 6 : m.state === 'act' ? 4 : 1.5;
    m.phase += dt * k;
    const rear = m.state === 'act' ? Math.max(0, Math.sin(m.phase * 1.6)) : 0, writhe = m.state === 'hit' ? 1 : 0;
    segs.forEach((s, i) => {
      const t = i / (n - 1), amp = len * (0.05 + 0.07 * t) * (1 + writhe);
      const r = s.userData.r as number;
      s.position.set(Math.sin(m.phase - i * 0.75) * amp, r * 0.85 + (i < 4 ? rear * len * 0.22 * (1 - i / 4) : 0) + Math.max(0, Math.sin(m.phase * 0.5 - i * 0.6)) * r * 0.25, -i * len / n);
      s.rotation.y = Math.cos(m.phase - i * 0.75) * 0.35;
      s.rotation.x = i === 0 ? -rear * 0.7 : 0;
    });
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
