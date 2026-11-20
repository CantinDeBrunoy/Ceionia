import * as THREE from 'three';
import { World, SEA } from '../world/world';
import type { People } from '../world/archipelago';
import {
  ConflictState, NavalSites, WarshipKind, conflictShown, seaLife, warshipKind, WEAPON, WAR_SPEED, WAR_RANGE, navalSites, battleSpot,
  waterPath, landingSite, nextDelay, pickSkirmish, nearestWater, foe, DEEP, SHALLOW,
} from '../sim/navalConflict';
import { warshipModel, debrisGeo, WarshipModel } from './warships';
import { vesselModel, merchantKind } from './seaTraffic';
import { makeSoldier, soldierStep, Soldier, SoldierMode } from './soldiers';
import { peopleRole } from './peopleSoldiers';
import { CombatFx } from './combatFx';
import { Puffs } from './particles';
import { mats } from './materials';
import { archipelagoOn } from '../world/expand';

/**
 * Le conflit vivant entre les deux îles rivales, en décor : de temps en temps une escarmouche (une bataille navale entre deux
 * petites escadres au milieu du bras de mer, ou une incursion de quelques soldats sur une plage de l'autre île), puis, une fois
 * le conflit réglé, des navires de commerce entre les îles ou les patrouilles du vainqueur. Rien n'est sauvegardé ni ne touche
 * au village du joueur ; une seule escarmouche à la fois ; loin de la caméra, rien n'est dessiné ni animé (la scène avance
 * seulement son horloge). Voir docs/trafic.md
 */

type P = [number, number];
const rnd = Math.random;
const ease = (k: number) => k * k * (3 - 2 * k);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Taille d'un navire de guerre (le modèle fait environ une case de long) */
const SIZE: Record<WarshipKind, number> = { galley: 1.9, dhow: 2, junk: 2, frigate: 2.2, ironclad: 2.1, launch: 1.9, hover: 1.8 };
/** Les navires de commerce entre les îles (`vesselModel`), à la taille de ceux des chantiers (voir `YARD_SIZE`, `seaTraffic.ts`) */
const MERCHANT_SIZE = 1.6;
/** Points (un tous les demi-cases) pour sortir du port en grandissant, ou y rentrer en rapetissant */
const FADE = 6;
/** Distance (cases) de la caméra au-delà de laquelle une scène n'est ni dessinée ni animée */
const VIEW = 230;
/** Distance de la caméra (cases) en deçà de laquelle on entend les tirs */
const HEAR = 55;
/** Taille des soldats (comme ceux de la garnison) */
const TROOP_K = 1.6;
const WHITE = new THREE.Color(0xe8f4f8), SMOKE = new THREE.Color(0.28, 0.26, 0.26), FIRE = new THREE.Color(1.6, 0.6, 0.2), STEAM = new THREE.Color(0.55, 0.55, 0.56);

interface Ship {
  root: THREE.Group;
  model: WarshipModel;
  kind: WarshipKind | null;
  people: People;
  oars: THREE.Group[];
  drones: THREE.Mesh[];
  path: P[];
  /** avancement le long du chemin (points), sens de marche (1 : vers le bout, -1 : vers le départ) */
  s: number;
  dir: number;
  speed: number;
  size: number;
  heading: number;
  /** au poste (bataille), en route, coulé */
  state: 'go' | 'post' | 'sink' | 'wreck' | 'gone';
  t: number;
  reload: number;
  burst: number;
  /** en feu (0 … 1) */
  fire: number;
  seed: number;
  funnel: THREE.Vector3 | null;
}

interface Man {
  s: Soldier;
  people: People;
  archer: boolean;
  x: number; z: number;
  goal: P | null;
  speed: number;
  mode: SoldierMode;
  phase: number;
  /** temps avant la mort (une victime désignée), -1 sinon ; temps depuis la chute */
  doom: number;
  dead: number;
  foe: Man | null;
  reload: number;
  /** grandit en apparaissant, rapetisse en rembarquant (0 … 1) ; il disparaît à 0 en partant */
  k: number;
  leaving: boolean;
  /** la milice est partie à la rencontre des assaillants */
  sent: boolean;
  heading: number;
}

/** Une escarmouche (bataille navale ou incursion), ou la vie en mer d'après le conflit (commerce, patrouilles) */
interface Scene {
  kind: 'naval' | 'raid' | 'life';
  center: P;
  radius: number;
  ships: Ship[];
  men: Man[];
  phase: string;
  t: number;
  /** bataille : le navire qui coulera (ou null) ; incursion : peuples */
  victim: Ship | null;
  att: People;
  def: People;
  boat: Ship | null;
  beach: P | null;
  rally: P | null;
  debris: { m: THREE.Mesh; vx: number; vz: number; spin: number }[];
  /** impacts à venir : boulets, roquettes (secondes avant l'impact) */
  hits: { t: number; x: number; y: number; z: number; hit: boolean; big: boolean; plasma?: boolean }[];
  done: boolean;
  /** vie en mer : la clé de l'état qui l'a faite */
  key?: string;
  /** incursion : secondes avant que la milice sorte (pour arriver à l'orée du village en même temps que les assaillants) */
  wait?: number;
}

export class NavalConflict {
  group = new THREE.Group();
  /** l'état du conflit, donné par la diplomatie (en cours par défaut) */
  state: ConflictState = { kind: 'war' };
  /** la première bataille navale de la partie, vue de loin : (x, z) de l'action (une notification, une seule fois) */
  onFirst: ((x: number, z: number, seen: boolean) => void) | null = null;
  /** un bruit de combat proche (choc de lames, coup de feu) */
  onClash: ((k: 'blade' | 'shot' | 'bite') => void) | null = null;
  readonly fx = new CombatFx();
  private smoke = new Puffs(220, 0);
  private sites: NavalSites | null = null;
  private sitesOf: unknown = undefined;
  private skirmish: Scene | null = null;
  private life: Scene | null = null;
  private wait = nextDelay(rnd, true);
  /** la vie en mer déjà tentée pour cet état (sans chemin entre les ports, on ne la refait pas à chaque image) */
  private lifeKey = '';
  private age = 0;
  private frustum = new THREE.Frustum();
  private pv = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  private v = new THREE.Vector3();
  private cam = new THREE.Vector3();
  private clock = 0;
  private audible = false;
  /** coût de la dernière image (ms), pour la mesure */
  lastMs = 0;

  constructor(private world: World) {
    this.group.add(this.fx.group, this.smoke.mesh);
    this.fx.onClash = (k) => { if (this.audible) this.onClash?.(k); };
  }

  /** Les places du conflit (refaites si l'archipel change) */
  private places() {
    const w = this.world;
    if (this.sitesOf !== w.isles) { this.sitesOf = w.isles; this.sites = navalSites(w); }
    return this.sites;
  }

  /** Où se passe l'action en cours (escarmouche, sinon la vie en mer), pour y mener la caméra */
  focus(): P | null {
    const s = this.skirmish ?? this.life;
    if (!s) return null;
    if (s.kind === 'raid' && s.rally && s.phase !== 'sail') return [(s.rally[0] + s.beach![0]) / 2, (s.rally[1] + s.beach![1]) / 2];
    if (s.kind === 'raid' && s.boat) { const b = s.boat, i = Math.max(0, Math.min(b.path.length - 1, Math.round(b.s))); return b.path[i]; }
    return s.center;
  }

  /** Mode développeur : une escarmouche tout de suite (la précédente s'efface) ; faux sans archipel ou hors guerre */
  trigger(kind: 'naval' | 'raid' = pickSkirmish(rnd), age = this.age): boolean {
    this.age = age;
    const shown = conflictShown(this.state, archipelagoOn(this.world), this.age);
    if (seaLife(shown) !== 'skirmish' || !this.places()) return false;
    if (this.skirmish) this.drop(this.skirmish);
    this.skirmish = kind === 'raid' ? this.raid() ?? this.naval() : this.naval();
    return !!this.skirmish;
  }

  /** Une image (`dt` : secondes de jeu) ; `visible` : la surface est à l'écran */
  update(dt: number, age: number, camera: THREE.Camera, visible: boolean) {
    const t0 = performance.now();
    this.age = age;
    this.clock += dt;
    // (les places du conflit se calculent à la première scène, pas au chargement : quelques dizaines de millisecondes)
    const shown = conflictShown(this.state, archipelagoOn(this.world), age), mode = seaLife(shown);
    if (!mode) {
      if (this.skirmish) { this.drop(this.skirmish); this.skirmish = null; }
      if (this.life) { this.drop(this.life); this.life = null; }
      this.group.visible = false;
      return;
    }
    // les escarmouches, pendant la guerre seulement (celle en cours finit tout de même)
    if (mode === 'skirmish' && !this.skirmish) {
      this.wait -= dt;
      if (this.wait <= 0 && this.places()) {
        this.skirmish = pickSkirmish(rnd) === 'raid' ? this.raid() ?? this.naval() : this.naval();
        this.wait = nextDelay(rnd);
      }
    }
    // la vie en mer d'après le conflit : refaite quand l'état ou l'âge change
    const key = mode === 'skirmish' ? '' : `${mode}|${shown!.kind === 'won' ? shown!.winner : ''}|${Math.min(5, age)}`;
    if (this.life && this.life.key !== key) { this.drop(this.life); this.life = null; this.lifeKey = ''; }
    if (!this.life && key && this.places() && this.lifeKey !== key) this.life = this.makeLife(mode === 'patrol' ? (shown as { winner: People }).winner : null, key);
    // ce que voit la caméra
    camera.updateMatrixWorld();
    this.cam.setFromMatrixPosition(camera.matrixWorld);
    this.pv.multiplyMatrices((camera as THREE.PerspectiveCamera).projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    let any = false;
    for (const sc of [this.skirmish, this.life]) {
      if (!sc) continue;
      const near = visible && this.near(sc);
      if (near) any = true;
      if (sc === this.skirmish) this.audible = near && this.cam.distanceTo(this.v.set(sc.center[0], 0, sc.center[1])) < HEAR + sc.radius * 0.5;
      if (sc.kind === 'naval') this.stepNaval(sc, dt, near);
      else if (sc.kind === 'raid') this.stepRaid(sc, dt, near);
      else this.stepLife(sc, dt, near);
      for (const sh of sc.ships) sh.root.visible = near && sh.state !== 'gone' && sh.root.scale.x > 0.002;
      for (const m of sc.men) m.s.root.visible = near && m.k > 0.002;
    }
    if (this.skirmish?.done) { this.drop(this.skirmish); this.skirmish = null; }
    this.group.visible = any;
    if (any) { this.fx.update(dt); this.smoke.update(dt); }
    this.lastMs = performance.now() - t0;
  }

  /** La scène est-elle assez près de la caméra et dans son champ ? */
  private near(sc: Scene) {
    this.sphere.center.set(sc.center[0], SEA, sc.center[1]);
    this.sphere.radius = sc.radius;
    return this.cam.distanceTo(this.sphere.center) - sc.radius < VIEW && this.frustum.intersectsSphere(this.sphere);
  }

  // ---------- Navires ----------

  private ship(kind: WarshipKind | null, people: People, path: P[], merchant?: ReturnType<typeof vesselModel>): Ship {
    const root = new THREE.Group(), model: WarshipModel = kind ? warshipModel(kind, people) : { body: merchant!.geo, glow: null, oars: null, oarAt: [0, 0, 0], muzzles: [], funnel: merchant!.funnel, drone: null };
    const hullM = new THREE.Mesh(model.body, mats.body);
    hullM.castShadow = true;
    root.add(hullM);
    if (model.glow) root.add(new THREE.Mesh(model.glow, mats.glow));
    const oars: THREE.Group[] = [];
    if (model.oars) for (const s of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(s * model.oarAt[0], model.oarAt[1], model.oarAt[2]);
      g.scale.x = s;
      g.add(new THREE.Mesh(model.oars, mats.body));
      root.add(g); oars.push(g);
    }
    const drones: THREE.Mesh[] = [];
    if (model.drone) for (let i = 0; i < 2; i++) { const d = new THREE.Mesh(model.drone, mats.body); d.visible = false; this.group.add(d); drones.push(d); }
    root.visible = false;
    root.scale.setScalar(0.001);
    this.group.add(root);
    const size = kind ? SIZE[kind] : MERCHANT_SIZE;
    const [x, z] = path[0], [x2, z2] = path[Math.min(path.length - 1, 2)];
    return {
      root, model, kind, people, oars, drones, path, s: 0, dir: 1, speed: kind ? WAR_SPEED[kind] : 1.4, size, heading: Math.atan2(x2 - x, z2 - z),
      state: 'go', t: 0, reload: 1 + rnd() * 2, burst: 0, fire: 0, seed: rnd() * 100, funnel: model.funnel ? new THREE.Vector3(...model.funnel) : null,
    };
  }

  /** Le navire avance le long de son chemin ; vrai une fois au bout (dans son sens de marche) */
  private sail(sh: Ship, dt: number) {
    const L = sh.path.length - 1;
    sh.s = Math.max(0, Math.min(L, sh.s + sh.dir * sh.speed * 2 * dt));
    return sh.dir > 0 ? sh.s >= L : sh.s <= 0;
  }

  /**
   * Place le navire : sur son chemin (`sway` : écart de son poste pendant le combat), cap vers où il va ou vers `face` ;
   * il grandit en quittant le port et rapetisse en y rentrant (`home` : bout du chemin qui est le port, 0 ou la fin)
   */
  private pose(sh: Ship, dt: number, near: boolean, face: number | null = null, sway = 0, homeAtEnd = false) {
    const L = sh.path.length - 1, i = Math.max(0, Math.min(L - 1, Math.floor(sh.s))), f = sh.s - i;
    const a = sh.path[i], b = sh.path[Math.min(L, i + 1)];
    let x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
    const course = Math.atan2(b[0] - a[0], b[1] - a[1]) + (sh.dir < 0 ? Math.PI : 0);
    if (sway) { x += Math.cos(sh.heading) * sway; z -= Math.sin(sh.heading) * sway; }
    const want = face ?? course;
    sh.heading += wrap(want - sh.heading) * Math.min(1, dt * 1.2);
    // (le port : au départ du chemin, ou à sa fin pour un navire de commerce qui arrive)
    const fromHome = homeAtEnd ? L - sh.s : sh.s, k = Math.max(0.001, Math.min(1, fromHome / FADE));
    sh.root.scale.setScalar(sh.size * k);
    if (!near) return;
    const t = this.clock + sh.seed;
    sh.root.position.set(x, SEA + Math.sin(t * 1.1) * 0.01, z);
    sh.root.rotation.set(Math.sin(t * 0.8) * 0.015, sh.heading, Math.sin(t * 0.9) * 0.02);
    for (let j = 0; j < sh.oars.length; j++) {
      const r = t * 3.2;
      sh.oars[j].rotation.set(0, Math.cos(r) * 0.3, Math.sin(r) * 0.18 * (j ? -1 : 1));
    }
    if (sh.funnel && Math.random() < dt * 6) {
      this.v.copy(sh.funnel).applyMatrix4(sh.root.matrixWorld);
      this.smoke.spawn(this.v.x, this.v.y, this.v.z, 0, 0.4, 0, 0.08, 3.5, SMOKE, 0, { grow: 3, drag: 0.2, wind: 0.25, alpha: 0.6 });
    }
  }

  /** Un point d'un navire dans le monde (repère du navire) */
  private world3(sh: Ship, p: [number, number, number], out = new THREE.Vector3()) {
    sh.root.updateMatrixWorld();
    return out.set(p[0], p[1], p[2]).applyMatrix4(sh.root.matrixWorld);
  }

  // ---------- Bataille navale ----------

  private naval(): Scene | null {
    const s = this.places()!, w = this.world, at = battleSpot(w, s, rnd);
    const [ax, az] = s.ports.orient, [bx, bz] = s.ports.asie, l = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / l, uz = (bz - az) / l;
    const ships: Ship[] = [];
    const n = 2 + (rnd() < 0.5 ? 1 : 0);
    for (const people of ['orient', 'asie'] as People[]) {
      const side = people === 'orient' ? -1 : 1, kind0 = warshipKind(people, this.age, 0), gap = Math.max(3.5, WAR_RANGE[kind0] * 0.75);
      for (let i = 0; i < n; i++) {
        // (les navires à canons se mettent en ligne de file, flanc à l'ennemi : plus d'écart entre eux)
        const kind = warshipKind(people, this.age, i), space = WEAPON[kind0] === 'cannon' ? 3.6 : 2.8, off = (i - (n - 1) / 2) * space + (rnd() - 0.5) * 0.6;
        let post: P | null = [at[0] + ux * side * gap / 2 - uz * off, at[1] + uz * side * gap / 2 + ux * off];
        post = nearestWater(w, post[0], post[1], DEEP, 1, 6, s.deep);
        const path = post && waterPath(w, s.ports[people], post);
        if (!path || path.length < FADE + 2) continue;
        const sh = this.ship(kind, people, path);
        sh.t = -i * (2 + rnd() * 3);
        ships.push(sh);
      }
    }
    if (!ships.some((x) => x.people === 'orient') || !ships.some((x) => x.people === 'asie')) { for (const sh of ships) this.dropShip(sh); return null; }
    const victim = rnd() < 0.75 ? ships[Math.floor(rnd() * ships.length)] : null;
    const r = Math.max(...ships.map((sh) => Math.hypot(sh.path[0][0] - at[0], sh.path[0][1] - at[1]))) + 4;
    return { kind: 'naval', center: at, radius: r, ships, men: [], phase: 'approach', t: 0, victim, att: 'orient', def: 'asie', boat: null, beach: null, rally: null, debris: [], hits: [], done: false };
  }

  private stepNaval(sc: Scene, dt: number, near: boolean) {
    sc.t += dt;
    if (sc.phase === 'approach') {
      let all = true;
      for (const sh of sc.ships) {
        sh.t += dt;
        if (sh.t < 0) { all = false; continue; }
        if (sh.state === 'go' && this.sail(sh, dt)) sh.state = 'post';
        if (sh.state !== 'post') all = false;
        this.pose(sh, dt, near, sh.state === 'post' ? this.faceFoe(sc, sh) : null);
      }
      if (all || sc.t > 120) {
        sc.phase = 'fight'; sc.t = 0;
        for (const sh of sc.ships) if (sh.state === 'go') sh.state = 'post';
        this.onFirst?.(sc.center[0], sc.center[1], near);
      }
    } else if (sc.phase === 'fight') {
      const dur = 32;
      for (const sh of sc.ships) {
        if (sh === sc.victim) sh.fire = Math.min(1, Math.max(sh.fire, (sc.t - dur * 0.45) / (dur * 0.4)));
        this.pose(sh, dt, near, this.faceFoe(sc, sh), Math.sin(sc.t * 0.25 + sh.seed) * 0.6);
        if (near) this.shoot(sc, sh, dt);
        this.burn(sh, dt, near);
      }
      if (sc.t > dur) {
        sc.phase = 'after'; sc.t = 0;
        for (const sh of sc.ships) {
          if (sh === sc.victim) { sh.state = 'sink'; sh.t = 0; if (near) this.spill(sc, sh); }
          else { sh.state = 'go'; sh.dir = -1; sh.t = -rnd() * 4; }
        }
      }
    } else {
      let busy = false;
      for (const sh of sc.ships) {
        if (sh.state === 'gone') continue;
        busy = true;
        if (sh.state === 'go') {
          sh.t += dt;
          if (sh.t > 0 && this.sail(sh, dt)) { sh.state = 'gone'; sh.root.visible = false; continue; }
          this.pose(sh, dt, near, sh.t > 0 ? null : this.faceFoe(sc, sh));
        } else this.sink(sh, dt, near);
      }
      this.drift(sc, dt, near);
      if (!busy && sc.t > 5) sc.done = true;
    }
    this.landHits(sc, dt, near);
  }

  /** Cap d'un navire au combat : flanc vers l'ennemi le plus proche (canons), proue vers lui (le reste) */
  private faceFoe(sc: Scene, sh: Ship): number | null {
    const f = this.nearestFoe(sc, sh);
    if (!f) return null;
    const a = Math.atan2(f.root.position.x - sh.root.position.x, f.root.position.z - sh.root.position.z);
    if (sh.kind && WEAPON[sh.kind] === 'cannon') { const b = a + Math.PI / 2, c = a - Math.PI / 2; return Math.abs(wrap(b - sh.heading)) < Math.abs(wrap(c - sh.heading)) ? b : c; }
    return a;
  }
  private nearestFoe(sc: Scene, sh: Ship) {
    let best: Ship | null = null, d = Infinity;
    for (const o of sc.ships) {
      if (o.people === sh.people || o.state === 'gone' || o.state === 'sink' || o.state === 'wreck') continue;
      const e = o.root.position.distanceToSquared(sh.root.position);
      if (e < d) { d = e; best = o; }
    }
    return best;
  }

  /** Un tir quand l'arme est prête : flèches enflammées, bordée de canon, rafale et roquette, drones à plasma */
  private shoot(sc: Scene, sh: Ship, dt: number) {
    if (!sh.kind || sh.state !== 'post') return;
    const target = this.nearestFoe(sc, sh);
    sh.reload -= dt;
    this.flyDrones(sh, target, dt);
    if (!target || sh.reload > 0) return;
    const weapon = WEAPON[sh.kind], tp = target.root.position, from = new THREE.Vector3();
    const aim = (spread: number) => {
      const hit = rnd() < 0.55 || target === sc.victim;
      const a = rnd() * Math.PI * 2, r = hit ? rnd() * 0.25 * target.size : (0.6 + rnd() * 1.2);
      return { hit, x: tp.x + Math.cos(a) * r * (hit ? 1 : spread), y: SEA + (hit ? 0.12 * target.size : 0.02), z: tp.z + Math.sin(a) * r * (hit ? 0.5 : spread) };
    };
    if (weapon === 'arrows') {
      // une volée de flèches enflammées depuis le pont
      for (let i = 0; i < 3; i++) {
        this.world3(sh, sh.model.muzzles[(sh.burst + i) % sh.model.muzzles.length], from);
        const q = aim(1);
        this.fx.arrow(from.x, from.y, from.z, q.x, q.y, q.z, true);
        sc.hits.push({ t: Math.max(0.25, Math.hypot(q.x - from.x, q.z - from.z) / 9), x: q.x, y: q.y, z: q.z, hit: q.hit, big: false });
      }
      sh.burst++;
      sh.reload = 1.4 + rnd() * 1.4;
    } else if (weapon === 'cannon') {
      // bordée : deux ou trois bouches du flanc tourné vers l'ennemi, coup sur coup
      const side = Math.sign(this.v.set(tp.x - sh.root.position.x, 0, tp.z - sh.root.position.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -sh.heading).x) || 1;
      const ports = sh.model.muzzles.filter((m) => Math.sign(m[0]) === side || sh.kind === 'ironclad');
      const k = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < k; i++) {
        const m = ports[Math.floor(rnd() * ports.length)] ?? sh.model.muzzles[0];
        this.world3(sh, m, from);
        const q = aim(1.4);
        this.fx.blast(from.x, from.y, from.z, q.x - from.x, q.z - from.z);
        this.smoke.spawn(from.x, from.y, from.z, (q.x - from.x) * 0.05, 0.08, (q.z - from.z) * 0.05, 0.22, 3, STEAM, 0, { grow: 3.5, drag: 0.6, wind: 0.2, alpha: 0.75 });
        sc.hits.push({ t: 0.25 + Math.hypot(q.x - from.x, q.z - from.z) / 14 + i * 0.12, x: q.x, y: q.y, z: q.z, hit: q.hit, big: true });
      }
      sh.reload = 2.6 + rnd() * 1.8;
    } else if (weapon === 'guns') {
      // rafale de la tourelle, et de temps en temps une roquette
      this.world3(sh, sh.model.muzzles[0], from);
      for (let i = 0; i < 5; i++) {
        const q = aim(1.2);
        this.fx.tracer(from.x, from.y, from.z, q.x, q.y + 0.05, q.z, 0xffc86a, 14);
        if (i === 4) sc.hits.push({ t: Math.hypot(q.x - from.x, q.z - from.z) / 14, x: q.x, y: q.y, z: q.z, hit: q.hit, big: false });
      }
      this.fx.flash(from.x, from.y, from.z);
      if (rnd() < 0.35) {
        this.world3(sh, sh.model.muzzles[1 + Math.floor(rnd() * 2)] ?? sh.model.muzzles[0], from);
        const q = aim(1);
        this.fx.tracer(from.x, from.y, from.z, q.x, q.y, q.z, 0xff8a3a, 6);
        this.smoke.spawn(from.x, from.y, from.z, 0, 0.2, 0, 0.12, 1.6, STEAM, 0, { grow: 3, alpha: 0.6 });
        sc.hits.push({ t: Math.hypot(q.x - from.x, q.z - from.z) / 6, x: q.x, y: q.y, z: q.z, hit: q.hit, big: true });
      }
      sh.reload = 1.6 + rnd() * 1.2;
    } else {
      // les drones et l'émetteur de proue tirent des traits de plasma
      const srcs = [this.world3(sh, sh.model.muzzles[0]), ...sh.drones.filter((d) => d.visible).map((d) => d.position.clone())];
      for (const f of srcs) {
        const q = aim(1);
        this.fx.tracer(f.x, f.y, f.z, q.x, q.y, q.z, 0x5af0ff, 10);
        sc.hits.push({ t: Math.hypot(q.x - f.x, q.y - f.y, q.z - f.z) / 10, x: q.x, y: q.y, z: q.z, hit: q.hit, big: false, plasma: true });
      }
      sh.reload = 1.5 + rnd() * 1.2;
    }
  }

  /** Les drones d'une vedette futuriste : en vol au-dessus de l'ennemi, sinon en ronde au-dessus de leur navire */
  private flyDrones(sh: Ship, target: Ship | null, dt: number) {
    sh.drones.forEach((d, i) => {
      const home = this.world3(sh, [0, 0.13, -0.12]);
      const t = this.clock * 1.3 + i * Math.PI, o = target ?? sh, r = target ? 1.2 : 0.9;
      const goal = this.v.set(o.root.position.x + Math.cos(t) * r, SEA + (target ? 1.2 : 0.9) + Math.sin(t * 2) * 0.15, o.root.position.z + Math.sin(t) * r);
      if (!d.visible) { d.visible = true; d.position.copy(home); d.scale.setScalar(sh.size); }
      d.position.lerp(goal, Math.min(1, dt * 1.5));
      d.rotation.y = t;
    });
  }

  /** Les impacts arrivés : éclats et flammes sur la coque touchée, gerbe d'eau à côté */
  private landHits(sc: Scene, dt: number, near: boolean) {
    for (let i = sc.hits.length - 1; i >= 0; i--) {
      const h = sc.hits[i];
      h.t -= dt;
      if (h.t > 0) continue;
      sc.hits.splice(i, 1);
      if (!near) continue;
      if (h.hit) {
        if (h.plasma) this.fx.plasmaHit(h.x, h.y, h.z, SEA);
        else if (h.big) this.fx.boom(h.x, h.y, h.z);
        else this.fx.hit(h.x, h.y, h.z, 0xffa040, 8, 'shot');
        this.fx.chips(h.x, h.y, h.z, 0x7a5236, 5);
      } else this.splash(h.x, h.z, h.big ? 1 : 0.6);
    }
  }

  /** Gerbe d'eau : une colonne blanche qui monte et retombe en écume */
  private splash(x: number, z: number, k: number) {
    for (let i = 0; i < 5; i++) this.smoke.spawn(x + (rnd() - 0.5) * 0.15, SEA + 0.02, z + (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.3, (0.8 + rnd() * 0.8) * k, (rnd() - 0.5) * 0.3, 0.1 * k + 0.04, 0.9, WHITE, 0, { grow: 2.2, drag: 2.5, wind: 0.05, alpha: 0.85, fade: 0.3 });
    this.fx.chips(x, SEA + 0.05, z, 0xf4fbff, 6);
  }

  /** Un navire en feu : flammes et fumée noire sur le pont */
  private burn(sh: Ship, dt: number, near: boolean) {
    if (!near || sh.fire <= 0 || Math.random() > dt * 14 * sh.fire) return;
    const p = this.world3(sh, [(rnd() - 0.5) * 0.12, 0.12, (rnd() - 0.5) * 0.6]);
    this.smoke.spawn(p.x, p.y, p.z, 0, 0.5, 0, 0.12 * sh.size, 0.6, FIRE, 1, { grow: 1.6, alpha: 0.9, fade: 0.2 });
    this.smoke.spawn(p.x, p.y + 0.1, p.z, 0, 0.45, 0, 0.16 * sh.size, 4, SMOKE, 0, { grow: 3.4, drag: 0.15, wind: 0.35, alpha: 0.7 });
  }

  /** Le naufrage : le navire gîte, pique de l'avant et s'enfonce ; il reste une épave à fleur d'eau qui fume, puis plus rien */
  private sink(sh: Ship, dt: number, near: boolean) {
    sh.t += dt;
    const SINK = 9, WRECK = 45, k = ease(Math.min(1, sh.t / SINK));
    if (sh.state === 'sink' && sh.t > SINK) sh.state = 'wreck';
    const gone = sh.t > SINK + WRECK ? Math.min(1, (sh.t - SINK - WRECK) / 6) : 0;
    if (gone >= 1) { sh.state = 'gone'; return; }
    sh.fire = sh.state === 'sink' ? 1 : Math.max(0, 1 - (sh.t - SINK) / 12);
    if (!near) return;
    const t = this.clock + sh.seed;
    sh.root.position.y = SEA - k * 0.11 * sh.size - gone * 0.3 * sh.size + Math.sin(t) * 0.005;
    sh.root.rotation.set(-k * 0.22, sh.heading, k * 0.45 + Math.sin(t * 0.7) * 0.01);
    for (const o of sh.oars) o.rotation.set(0, 0, 0.5);
    for (const d of sh.drones) { d.position.y -= dt * 0.8; if (d.position.y < SEA) d.visible = false; }
    this.burn(sh, dt, near);
    // l'épave fume encore longtemps
    if (sh.state === 'wreck' && Math.random() < dt * 3 * (1 - gone)) {
      const p = this.world3(sh, [0, 0.1, 0]);
      this.smoke.spawn(p.x, Math.max(SEA, p.y), p.z, 0, 0.35, 0, 0.14 * sh.size, 5, SMOKE, 0, { grow: 3.6, drag: 0.15, wind: 0.4, alpha: 0.55 });
    }
  }

  /** Les débris d'un navire qui coule : planches, espars, tonneaux qui s'éloignent en dérivant */
  private spill(sc: Scene, sh: Ship) {
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(debrisGeo(), mats.body);
      m.position.set(sh.root.position.x + (rnd() - 0.5) * 0.6, SEA, sh.root.position.z + (rnd() - 0.5) * 0.6);
      m.rotation.y = rnd() * 6.28;
      m.scale.setScalar(sh.size * (0.6 + rnd() * 0.5));
      this.group.add(m);
      const a = rnd() * 6.28, v = 0.06 + rnd() * 0.12;
      sc.debris.push({ m, vx: Math.cos(a) * v, vz: Math.sin(a) * v, spin: (rnd() - 0.5) * 0.3 });
    }
    this.fx.boom(sh.root.position.x, SEA + 0.15, sh.root.position.z);
  }
  private drift(sc: Scene, dt: number, near: boolean) {
    for (const d of sc.debris) {
      d.m.position.x += d.vx * dt; d.m.position.z += d.vz * dt;
      d.vx *= 1 - dt * 0.03; d.vz *= 1 - dt * 0.03;
      d.m.rotation.y += d.spin * dt;
      // ils coulent avec l'épave
      d.m.position.y = SEA - 0.01 + Math.sin(this.clock * 1.4 + d.spin * 30) * 0.008 - Math.max(0, sc.t - 50) * 0.01;
      d.m.visible = near && d.m.position.y > SEA - 0.2;
    }
  }

  // ---------- Incursion ----------

  private raid(): Scene | null {
    const s = this.places()!, w = this.world;
    let att: People = rnd() < 0.5 ? 'orient' : 'asie', land = landingSite(w, s, foe(att), rnd);
    // (une île sans plage abordable : c'est l'autre peuple qui débarque)
    if (!land) { att = foe(att); land = landingSite(w, s, foe(att), rnd); }
    if (!land) return null;
    const def = foe(att);
    const path = waterPath(w, s.ports[att], land.boat, SHALLOW);
    if (!path || path.length < FADE + 2) return null;
    const boat = this.ship(warshipKind(att, this.age, 0), att, path);
    boat.size *= 0.85;
    boat.speed *= 1.1;
    const c: P = [(land.beach[0] + s.villages[def].x) / 2, (land.beach[1] + s.villages[def].z) / 2];
    return { kind: 'raid', center: c, radius: 26, ships: [boat], men: [], phase: 'sail', t: 0, victim: null, att, def, boat, beach: land.beach, rally: land.rally, debris: [], hits: [], done: false };
  }

  private man(people: People, archer: boolean, x: number, z: number): Man {
    const s = makeSoldier(this.age, Math.floor(rnd() * 4), false, peopleRole(people, archer));
    s.root.scale.setScalar(0.001);
    s.root.visible = false;
    this.group.add(s.root);
    return { s, people, archer, x, z, goal: null, speed: 0.9, mode: 'idle', phase: rnd() * 6, doom: -1, dead: -1, foe: null, reload: 0.5 + rnd(), k: 0, leaving: false, sent: false, heading: 0 };
  }

  private stepRaid(sc: Scene, dt: number, near: boolean) {
    sc.t += dt;
    const boat = sc.boat!, v = this.places()!.villages[sc.def], beach = sc.beach!, rally = sc.rally!;
    if (sc.phase === 'sail') {
      if (this.sail(boat, dt)) {
        sc.phase = 'land'; sc.t = 0;
        // les assaillants sautent à l'eau et gagnent la plage ; la milice sort du village
        const n = 4 + Math.floor(rnd() * 3), bp = boat.path[boat.path.length - 1];
        for (let i = 0; i < n; i++) {
          const m = this.man(sc.att, i % 3 === 2, bp[0] + (rnd() - 0.5) * 0.8, bp[1] + (rnd() - 0.5) * 0.8);
          m.goal = [beach[0] + (rnd() - 0.5) * 1.2, beach[1] + (rnd() - 0.5) * 1.2];
          m.phase = -i * 0.5;
          sc.men.push(m);
        }
        // (les assaillants : la barque à la plage, puis la plage à l'orée du village ; la milice : le cœur du village à son orée)
        const lb = Math.hypot(beach[0] - v.x, beach[1] - v.z);
        sc.wait = Math.max(0, Math.hypot(bp[0] - beach[0], bp[1] - beach[1]) / 0.9 + (lb - v.r) / 0.9 - v.r / 1.2 - 2);
        const d = 3 + Math.floor(rnd() * 3);
        for (let i = 0; i < d; i++) {
          const m = this.man(sc.def, i % 3 === 1, v.x + (rnd() - 0.5) * 3, v.z + (rnd() - 0.5) * 3);
          m.speed = 1.2;
          sc.men.push(m);
        }
      }
      this.pose(boat, dt, near);
    } else {
      this.pose(boat, dt, near, sc.phase === 'leave' ? null : boat.heading);
      if (sc.phase === 'leave' && this.sail(boat, dt)) boat.state = 'gone';
    }
    const atk = sc.men.filter((m) => m.people === sc.att), dfn = sc.men.filter((m) => m.people === sc.def);
    if (sc.phase === 'land') {
      // à la plage, les assaillants marchent sur l'entrée du village ; la milice vient à leur rencontre
      for (const m of atk) if (m.goal && Math.hypot(m.goal[0] - m.x, m.goal[1] - m.z) < 0.3) m.goal = [rally[0] + (rnd() - 0.5) * 2, rally[1] + (rnd() - 0.5) * 2];
      const front = atk.reduce((a, m) => a + Math.hypot(m.x - beach[0], m.z - beach[1]), 0) / atk.length;
      // (la rencontre : à l'orée du village, sur son replat dégagé)
      const lb = Math.hypot(beach[0] - v.x, beach[1] - v.z) || 1, meet: P = [v.x + ((beach[0] - v.x) / lb) * (v.r + 0.5), v.z + ((beach[1] - v.z) / lb) * (v.r + 0.5)];
      if (sc.t > (sc.wait ?? 3)) for (const m of dfn) if (!m.sent) { m.sent = true; m.goal = [meet[0] + (rnd() - 0.5) * 2, meet[1] + (rnd() - 0.5) * 2]; }
      if (front > lb - v.r - 2.5 || sc.t > 40) {
        sc.phase = 'clash'; sc.t = 0;
        // une ou deux victimes de chaque côté, à des moments tirés au sort
        for (const side of [atk, dfn]) {
          const k = 1 + (rnd() < 0.5 ? 1 : 0);
          for (const m of [...side].sort(() => rnd() - 0.5).slice(0, Math.min(k, side.length - 1))) m.doom = 4 + rnd() * 12;
        }
      }
    } else if (sc.phase === 'clash') {
      for (const m of sc.men) {
        if (m.dead >= 0) continue;
        if (!m.foe || m.foe.dead >= 0) m.foe = this.closest(m, m.people === sc.att ? dfn : atk);
        const f = m.foe;
        if (!f) { m.goal = null; continue; }
        const d = Math.hypot(f.x - m.x, f.z - m.z), reach = m.archer || this.age >= 3 ? 2.6 : 0.4;
        m.goal = d > reach ? [f.x - ((f.x - m.x) / d) * reach * 0.9, f.z - ((f.z - m.z) / d) * reach * 0.9] : null;
        m.heading = Math.atan2(f.x - m.x, f.z - m.z);
        if (d <= reach + 0.2) { m.mode = 'fight'; this.strike(m, f, dt, near, reach > 1); }
        if (m.doom > 0) { m.doom -= dt; if (m.doom <= 0) { m.dead = 0; m.goal = null; } }
      }
      if (sc.t > 20) {
        sc.phase = 'retreat'; sc.t = 0;
        for (const m of atk) if (m.dead < 0) m.goal = [beach[0], beach[1]], m.speed = 1.5, m.leaving = true, m.foe = null;
        for (const m of dfn) if (m.dead < 0) m.goal = [v.x + (rnd() - 0.5) * 2, v.z + (rnd() - 0.5) * 2], m.foe = null;
      }
    } else if (sc.phase === 'retreat') {
      // à la plage, ils retournent à la barque par l'eau, et disparaissent à bord
      const bp = boat.path[boat.path.length - 1];
      for (const m of atk) if (m.leaving && m.goal && Math.hypot(m.goal[0] - m.x, m.goal[1] - m.z) < 0.3 && m.goal[0] !== bp[0]) m.goal = [bp[0], bp[1]];
      if (atk.every((m) => m.dead >= 0 || m.k <= 0.002) || sc.t > 30) {
        sc.phase = 'leave'; sc.t = 0;
        boat.dir = -1;
      }
    }
    // la milice rentre au village ; les morts restent un moment, puis on les emporte (ils s'effacent)
    for (const m of sc.men) this.walk(m, sc, dt, near);
    if (sc.phase === 'leave' && boat.state === 'gone' && sc.men.every((m) => m.k <= 0.002)) sc.done = true;
    if (sc.t > 150) sc.done = true;
  }

  private closest(m: Man, list: Man[]) {
    let best: Man | null = null, d = Infinity;
    for (const o of list) { if (o.dead >= 0) continue; const e = (o.x - m.x) ** 2 + (o.z - m.z) ** 2; if (e < d) { d = e; best = o; } }
    return best;
  }

  /** Un coup : lame (étincelles), flèche, balle ou plasma selon l'époque */
  private strike(m: Man, f: Man, dt: number, near: boolean, ranged: boolean) {
    m.reload -= dt;
    if (m.reload > 0 || !near) return;
    m.reload = ranged ? 1.4 + rnd() * 1.2 : 0.8 + rnd() * 0.6;
    const y0 = this.groundY(m.x, m.z), y1 = this.groundY(f.x, f.z);
    if (!ranged) { this.fx.hit((m.x + f.x) / 2, y0 + 0.25, (m.z + f.z) / 2, 0xffd27a, 6, 'blade'); return; }
    const from = new THREE.Vector3(m.x, y0 + 0.3, m.z), to = new THREE.Vector3(f.x + (rnd() - 0.5) * 0.3, y1 + 0.2, f.z + (rnd() - 0.5) * 0.3);
    if (this.age <= 2) this.fx.arrow(from.x, from.y, from.z, to.x, to.y, to.z);
    else if (this.age >= 5) this.fx.throw(from, to, null, 'plasma');
    else this.fx.shot(from.x, from.y, from.z, to.x, to.y, to.z);
  }

  private groundY(x: number, z: number) { return Math.max(this.world.hAt(x, z), SEA - 0.12); }

  /** Un soldat : il apparaît, marche ou court vers son but, se bat, tombe, rembarque */
  private walk(m: Man, sc: Scene, dt: number, near: boolean) {
    m.phase += dt * (m.mode === 'run' ? 9 : 6);
    if (m.phase < 0) return;
    const bp = sc.boat!.path[sc.boat!.path.length - 1], home = sc.phase === 'retreat' || sc.phase === 'leave';
    if (m.dead >= 0) {
      m.dead += dt;
      if (m.dead > 18) m.k = Math.max(0, m.k - dt * 0.5);
    } else if (m.leaving && Math.hypot(bp[0] - m.x, bp[1] - m.z) < 0.4) m.k = Math.max(0, m.k - dt * 2);
    // (la milice rentrée au village s'efface)
    else if (home && m.people === sc.def && !m.goal) m.k = Math.max(0, m.k - dt * 1.5);
    else m.k = Math.min(1, m.k + dt * 2);
    if (m.dead < 0 && m.goal) {
      const dx = m.goal[0] - m.x, dz = m.goal[1] - m.z, d = Math.hypot(dx, dz);
      if (d < 0.08) m.goal = null;
      else {
        const sp = Math.min(d, m.speed * dt);
        m.x += (dx / d) * sp; m.z += (dz / d) * sp;
        if (sc.phase !== 'clash' || m.mode !== 'fight') m.heading = Math.atan2(dx, dz);
        m.mode = m.speed > 1.3 || (sc.phase === 'clash' && !m.archer) ? 'run' : 'walk';
      }
    } else if (m.dead < 0 && sc.phase !== 'clash') m.mode = 'idle';
    if (!near) return;
    const r = m.s.root, fall = m.dead >= 0 ? ease(Math.min(1, m.dead / 0.5)) : 0;
    r.position.set(m.x, this.groundY(m.x, m.z) - (m.dead > 18 ? (m.dead - 18) * 0.05 : 0), m.z);
    r.rotation.set(-fall * Math.PI / 2, m.heading, 0);
    r.scale.setScalar(0.7 * TROOP_K * Math.max(0.001, m.k));
    soldierStep(m.s, m.phase, m.dead >= 0 ? 'idle' : m.mode);
  }

  // ---------- Après le conflit : commerce, patrouilles ----------

  /** Deux navires font la navette entre les deux îles : de commerce (paix, traité), ou de guerre du vainqueur (patrouille) */
  private makeLife(winner: People | null, key: string): Scene | null {
    this.lifeKey = key;
    const s = this.places()!, w = this.world, a = Math.min(5, this.age), ships: Ship[] = [];
    const route = waterPath(w, s.ports.orient, s.ports.asie);
    if (!route || route.length < FADE * 2 + 2) return null;
    for (let i = 0; i < 2; i++) {
      const path = i ? [...route].reverse() : route;
      let sh: Ship;
      if (winner) {
        // la patrouille part du port du vainqueur, longe la côte du vaincu, et revient
        const from = s.ports[winner], to = s.ports[foe(winner)], mid: P | null = nearestWater(w, to[0] + (from[0] - to[0]) * 0.25 + (i ? 6 : -6), to[1] + (from[1] - to[1]) * 0.25, DEEP, 2, 10, s.deep);
        const p = mid && waterPath(w, from, mid);
        if (!p) continue;
        sh = this.ship(warshipKind(winner, a, i), winner, p);
      } else sh = this.ship(null, i ? 'asie' : 'orient', path, vesselModel(merchantKind(a, i)));
      sh.t = -i * 25 - rnd() * 10;
      ships.push(sh);
    }
    if (!ships.length) return null;
    const c: P = [(s.ports.orient[0] + s.ports.asie[0]) / 2, (s.ports.orient[1] + s.ports.asie[1]) / 2];
    return { kind: 'life', center: c, radius: Math.hypot(s.ports.orient[0] - c[0], s.ports.orient[1] - c[1]) + 8, ships, men: [], phase: winner ? 'patrol' : 'trade', t: 0, victim: null, att: 'orient', def: 'asie', boat: null, beach: null, rally: null, debris: [], hits: [], done: false, key };
  }

  private stepLife(sc: Scene, dt: number, near: boolean) {
    for (const sh of sc.ships) {
      sh.t += dt;
      // (au départ, il attend au port, invisible)
      if (sh.state === 'go' && sh.t < 0) { sh.root.scale.setScalar(0.001); continue; }
      if (sh.state === 'post') {
        // à quai ou au bout de la ronde : une pause, puis demi-tour
        if (sh.t > 0) { sh.state = 'go'; sh.dir = -sh.dir; }
      } else if (this.sail(sh, dt)) { sh.state = 'post'; sh.t = -(15 + rnd() * 25); }
      // le commerce disparaît dans les ports aux deux bouts ; la patrouille seulement dans le sien
      const L = sh.path.length - 1, end = Math.min(sh.s, sc.phase === 'trade' ? L - sh.s : Infinity);
      this.pose(sh, dt, near);
      if (near && sh.drones.length) this.flyDrones(sh, null, dt);
      for (const d of sh.drones) d.visible = near && end > FADE;
      sh.root.scale.setScalar(sh.size * Math.max(0.001, Math.min(1, end / FADE)));
    }
  }

  // ---------- Ménage ----------

  private dropShip(sh: Ship) {
    this.group.remove(sh.root);
    for (const d of sh.drones) this.group.remove(d);
  }
  private drop(sc: Scene) {
    for (const sh of sc.ships) this.dropShip(sh);
    for (const m of sc.men) this.group.remove(m.s.root);
    for (const d of sc.debris) this.group.remove(d.m);
  }

  /** Mesure : ce qui est en scène */
  stats() {
    const all = [this.skirmish, this.life].filter((s): s is Scene => !!s);
    return { skirmish: this.skirmish ? `${this.skirmish.kind}:${this.skirmish.phase}` : null, life: this.life?.phase ?? null, ships: all.reduce((a, s) => a + s.ships.length, 0), men: all.reduce((a, s) => a + s.men.length, 0), wait: Math.round(this.wait), ms: this.lastMs };
  }
}
