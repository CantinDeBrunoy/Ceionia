import * as THREE from 'three';
import { World } from '../world/world';
import { Agents } from '../sim/agents';
import { Expeditions, ActiveExpedition } from '../sim/expeditions';
import { HerdKind, penHerds } from '../sim/missions';
import { makeActor, play, hasModel, Actor } from './assets';
import { makeFolk, folkStep, Folk, FolkRole } from './folk';
import { Parts } from './parts';
import { mats } from './materials';
import { ExpeditionScene, ANIMAL, IdleRockets, sledGeo } from './expeditionScenes';
import { CombatFx } from './combatFx';
import { ARRIVALS, Arrival, penWay } from './pens';

/** Une suiveuse en marche : où elle est, son cap, sa vitesse lissée et son allure (0 à l'arrêt, 1 au pas, 2 au galop) */
export interface Walker { x: number; z: number; heading: number; sp: number; gait: number }

/**
 * Ce qui suit l'équipe au retour : une bête, le chariot, le traîneau, ou quelqu'un qu'elle ramène (le voyageur, les
 * jongleurs), à sa place dans la file (`gap` derrière le dernier de l'équipe). `kind` : l'espèce d'une bête ramenée ;
 * `home` : où elle va une fois au village (la porte de son enclos, ou un coin de pré), étape par étape
 */
interface Follower extends Walker { obj: THREE.Object3D; actor: Actor | null; folk?: Folk; gap: number; ph: number; kind?: HerdKind; home?: [number, number][] }

/** L'équipe s'éloigne d'autant du cœur de la scène : le décor s'efface derrière elle */
const LEAVE_DIST = 5;
/** au plus tard ce temps après son départ (secondes de jeu) */
const LEAVE_T = 30;
/** Allure (cases par seconde) d'une suiveuse qui rejoint la file, et d'une bête qui gagne son enclos, une fois au village */
const CATCH_UP = 1.1, STROLL = 0.42;
/** Les gestes d'une bête à chaque allure : arrêtée (elle broute), au pas, au galop (pour suivre l'équipe qui marche vite) */
const GAIT_ANIM = [['Idle', 'Idle_Eating', 'Eating'], ['Walk', 'WalkSlow', 'Idle'], ['Gallop', 'Run', 'Walk']];
/** Une bête ramenée attend au plus tant (secondes) que l'enclos ou le pré la reprenne */
const CLAIM_T = 3;

/**
 * Une suiveuse avance vers (tx, tz), à `pace` au plus (assez pour garder sa place dans la file), et tourne en douceur. Son
 * allure suit sa vitesse lissée, avec de la marge entre l'arrêt, le pas et le galop : elle ne bascule pas d'un geste à
 * l'autre à chaque image (la trace qu'elle suit avance par petits bonds, son pas restait sinon figé au début de la marche)
 */
export function stepWalker(f: Walker, tx: number, tz: number, pace: number, dt: number) {
  if (dt <= 0) return;
  const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz), step = Math.min(d, pace * dt);
  if (step > 1e-6) {
    f.x += (dx / d) * step; f.z += (dz / d) * step;
    const dh = Math.atan2(Math.sin(Math.atan2(dx, dz) - f.heading), Math.cos(Math.atan2(dx, dz) - f.heading));
    f.heading += Math.sign(dh) * Math.min(Math.abs(dh), dt * 7);
  }
  f.sp += (step / dt - f.sp) * Math.min(1, dt * 5);
  f.gait = f.sp > (f.gait === 2 ? 0.55 : 0.75) ? 2 : f.sp > (f.gait ? 0.04 : 0.1) ? 1 : 0;
}

/** Couleurs des fanions, une par équipe */
export const TEAM_COLORS = [0xe0574a, 0x4f86d8, 0xe8b33a, 0x5aae62];

/** Fanion porté par le chef d'expédition */
function pennantGeo(color: number) {
  const p = new Parts();
  p.cyl(0.005, 0.006, 0.42, 4, 0, 0, 0, 0x7a6355);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0.42, 0, 0, 0.32, 0, 0.13, 0.37, 0], 3)), 0, 0, 0, color);
  p.add(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0.42, 0, 0.13, 0.37, 0, 0, 0.32, 0], 3)), 0, 0, 0, color);
  return p.build(false).body;
}

/** Chariot à bras chargé de minerai, avant = +z */
function cartGeo() {
  const p = new Parts();
  p.box(0.14, 0.06, 0.2, 0, 0.05, 0, 0x9a7452);
  for (const s of [-1, 1]) p.add(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8).rotateZ(Math.PI / 2), s * 0.08, 0.04, 0, 0x5a3e2e);
  for (const s of [-1, 1]) p.box(0.012, 0.012, 0.16, s * 0.05, 0.08, 0.15, 0x7a6355);
  for (const [x, z, c] of [[-0.03, -0.04, 0x7d838c], [0.03, 0.03, 0x9aa3ad], [0, -0.01, 0xb08a5a], [0.035, -0.05, 0x8a8178]] as [number, number, number][]) p.sphere(0.035, x, 0.12, z, c, 0, 0.8);
  return p.build(false).body;
}

/** Sac sur le dos */
function sackGeo() {
  const p = new Parts();
  p.add(new THREE.IcosahedronGeometry(0.045, 0).scale(1, 1.2, 0.8), 0, 0, 0, 0xd9c4a0);
  return p.build(false).body;
}

/**
 * Ce qu'une expédition montre sur la carte ; `trail` : la trace du dernier de l'équipe, et sa vitesse lissée (`v`, depuis
 * (`hx`, `hz`)), que la file doit pouvoir suivre
 */
interface Show { key: string; pennant: THREE.Mesh; followers: Follower[]; sacks: THREE.Mesh[]; trail: number[]; hx: number; hz: number; v: number; scene: ExpeditionScene | null; exp: ActiveExpedition | null }

/**
 * Les expéditions sur la carte : un fanion au-dessus de chaque chef ; sur place, l'équipe fait vraiment son travail (voir
 * ExpeditionScene) ; au retour, ce qu'elle rapporte suit l'équipe — les bêtes en file, le chariot de minerai, des sacs sur le dos
 */
export class ExpeditionView {
  group = new THREE.Group();
  /** coups, lances et étincelles des chasses */
  fx = new CombatFx();
  private shows = new Map<number, Show>();
  /** décors d'expéditions finies, qui achèvent de s'effacer */
  private fading: { scene: ExpeditionScene; exp: ActiveExpedition }[] = [];
  private pennantGeos = TEAM_COLORS.map(pennantGeo);
  private sackGeo = sackGeo();
  /** la fusée qui attend sur le pas de tir des cosmodromes */
  private idle: IdleRockets;
  /** bêtes ramenées par des expéditions finies, qui attendent que l'enclos ou le pré les reprenne */
  private waiting: { f: Follower; arr: Arrival; t: number }[] = [];

  constructor(private world: World, private agents: Agents, private exp: Expeditions) { this.idle = new IdleRockets(world, this.group); }

  /** Le cœur de la scène d'une expédition (ce que la caméra regarde quand on la suit sur place), ou null */
  focusOf(id: number): [number, number] | null { return this.shows.get(id)?.scene?.focus ?? null; }
  /** hauteur au-dessus du sol du cœur de la scène (la montgolfière en vol) */
  liftOf(id: number) { return this.shows.get(id)?.scene?.lift ?? 0; }

  update(dt: number) {
    if (!this.fx.group.parent) this.group.add(this.fx.group);
    this.fx.update(dt);
    const live = new Set<number>();
    for (const a of this.exp.active) {
      live.add(a.id);
      let sh = this.shows.get(a.id);
      if (!sh) {
        const pennant = new THREE.Mesh(this.pennantGeos[(a.id - 1) % TEAM_COLORS.length], mats.body);
        pennant.castShadow = true;
        this.group.add(pennant);
        sh = { key: '', pennant, followers: [], sacks: [], trail: [], hx: 0, hz: 0, v: 0, scene: null, exp: a };
        this.shows.set(a.id, sh);
      }
      const key = `${a.phase === 'back' || a.phase === 'home' ? 'back' : 'out'}|${a.ok}`;
      if (key !== sh.key) { sh.key = key; this.rebuild(a, sh); }
      // la scène de la mission (galets, bêtes, éboulis, voisins…) est posée dès le départ de l'expédition : on la voit en
      // attendant l'équipe. Elle reste quand l'équipe repart (le loup détale, la pirogue chavire, les voisins saluent) et ne
      // s'efface, en douceur, qu'une fois l'équipe assez loin : on la voit s'en aller
      const away = a.phase === 'back' || a.phase === 'home';
      if (!away && !sh.scene && a.entry < 0) sh.scene = new ExpeditionScene(this.world, this.agents, this.group, a, this.fx);
      if (away && sh.scene) {
        const pos = this.agents.partyPositions(a.party), [fx, fz] = sh.scene.focus;
        if (a.phase === 'home' || a.t > LEAVE_T || pos.every(([x, z]) => Math.hypot(x - fx, z - fz) > LEAVE_DIST)) sh.scene.leave();
      }
      sh.scene?.update(dt, a);
      if (sh.scene?.gone) { sh.scene.dispose(a); sh.scene = null; }
      this.step(a, sh, dt);
    }
    // expéditions terminées : on range leurs objets ; leur décor, s'il est encore là, achève de s'effacer. Les bêtes ramenées
    // restent où elles sont, le temps que l'enclos ou le pré les reprenne
    for (const [id, sh] of this.shows) if (!live.has(id)) {
      if (sh.scene && sh.exp) { sh.scene.leave(); this.fading.push({ scene: sh.scene, exp: sh.exp }); }
      for (const f of sh.followers) if (f.kind) { const arr = { kind: f.kind, x: f.x, z: f.z, heading: f.heading, claimed: false }; ARRIVALS.push(arr); this.waiting.push({ f, arr, t: 0 }); }
      sh.followers = sh.followers.filter((f) => !f.kind);
      this.clear(sh); this.group.remove(sh.pennant); this.shows.delete(id);
    }
    this.waiting = this.waiting.filter((b) => {
      b.t += dt;
      if (!b.arr.claimed && b.t < CLAIM_T) { if (b.f.actor) { play(b.f.actor, GAIT_ANIM[0]); b.f.actor.mixer.update(dt); } return true; }
      // reprise (la même bête, au même endroit, par l'enclos ou le pré) : on retire la nôtre
      const i = ARRIVALS.indexOf(b.arr);
      if (i >= 0) ARRIVALS.splice(i, 1);
      b.f.actor?.mixer.stopAllAction();
      this.group.remove(b.f.obj);
      return false;
    });
    this.fading = this.fading.filter((f) => { f.scene.update(dt, f.exp); if (!f.scene.gone) return true; f.scene.dispose(f.exp); return false; });
    this.idle.update([...this.shows.values()].some((sh) => sh.scene?.launching));
  }

  private step(a: ActiveExpedition, sh: Show, dt: number) {
    const pos = this.agents.partyPositions(a.party);
    if (!pos.length) { sh.pennant.visible = false; return; }
    const w = this.world;
    // le fanion flotte au-dessus de l'épaule du chef, à pied, sur un ponton ou assis dans la barque
    const [lx, lz, lh] = pos[0], ly = this.agents.partyLeadY(a.party) ?? w.surfaceAt(lx, lz);
    sh.pennant.visible = true;
    sh.pennant.position.set(lx + Math.cos(lh) * 0.06, ly + 0.08, lz - Math.sin(lh) * 0.06);
    sh.pennant.rotation.y = lh + Math.PI / 2;
    // trace du dernier de la file, et son allure (la file doit tenir le rythme d'une équipe à cheval)
    const trail = sh.trail, [tx, tz] = pos[pos.length - 1], n = trail.length;
    if (!n || Math.hypot(tx - trail[n - 2], tz - trail[n - 1]) > 0.04) { trail.push(tx, tz); if (trail.length > 600) trail.splice(0, 2); }
    if (dt > 0) sh.v += (Math.hypot(tx - sh.hx, tz - sh.hz) / dt - sh.v) * Math.min(1, dt * 4);
    sh.hx = tx; sh.hz = tz;
    // au village, les bêtes ramenées quittent la file pour leur enclos
    if (a.phase === 'home' && sh.followers.some((f) => f.kind && !f.home)) this.settle(a, sh);
    const pace = Math.max(CATCH_UP, Math.min(sh.v, 4) * 1.25);
    // la suite marche dans les pas du dernier, jusqu'à lui (la trace avance par bonds, lui sans à-coups)
    for (const f of sh.followers) {
      const x0 = f.x, z0 = f.z;
      if (f.home) {
        const [hx, hz] = f.home[0];
        if (f.home.length > 1 && Math.hypot(hx - f.x, hz - f.z) < 0.05) f.home.shift();
        stepWalker(f, f.home[0][0], f.home[0][1], STROLL, dt);
      } else {
        // la trace encore trop courte (l'équipe vient de partir) : elle attend son tour, là où elle est
        const p = along(trail, f.gap, tx, tz);
        stepWalker(f, p ? p[0] : f.x, p ? p[1] : f.z, pace, dt);
      }
      f.obj.position.set(f.x, w.surfaceAt(f.x, f.z), f.z);
      f.obj.rotation.y = f.heading;
      if (f.actor) { play(f.actor, GAIT_ANIM[f.gait]); f.actor.mixer.update(dt); }
      // quelqu'un qu'on ramène : il marche au pas de l'équipe ; arrivé au village, il applaudit à la fête
      if (f.folk) { f.ph += f.gait ? Math.hypot(f.x - x0, f.z - z0) * 9 : dt * 1.6; folkStep(f.folk, f.ph, f.gait ? 'walk' : a.phase === 'home' ? 'cheer' : 'idle'); }
    }
    // sacs sur le dos des porteurs
    sh.sacks.forEach((s, i) => {
      const p = pos[i];
      if (!p) { s.visible = false; return; }
      s.visible = true;
      s.position.set(p[0] - Math.sin(p[2]) * 0.05, w.surfaceAt(p[0], p[1]) + 0.2, p[1] - Math.cos(p[2]) * 0.05);
      s.rotation.y = p[2];
    });
  }

  /**
   * L'équipe est rentrée : chaque bête ramenée quitte la file pour la place qui l'attend — devant la porte de l'enclos (ou de
   * l'écurie) où elle vivra, puis sur le seuil ; sans place à l'enclos, un coin de pré près du cœur du village, à l'écart de la
   * fête (elle paîtra ensuite près des fermes)
   */
  private settle(a: ActiveExpedition, sh: Show) {
    const w = this.world, mine = sh.followers.filter((f) => f.kind && !f.home);
    const now = penHerds(w), then = penHerds(w, [...w.exp.herd, ...mine.map((f) => f.kind!)]);
    // les places qui s'ouvrent dans chaque enclos et chaque écurie, espèce par espèce
    const room: { id: number; kind: HerdKind }[] = [];
    for (const [id, list] of [...then.stables, ...then.pens]) {
      const before = [...(now.stables.get(id) ?? now.pens.get(id) ?? [])];
      for (const k of list) { const j = before.indexOf(k); if (j >= 0) before.splice(j, 1); else room.push({ id, kind: k }); }
    }
    mine.forEach((f, i) => {
      const j = room.findIndex((p) => p.kind === f.kind), b = j >= 0 ? w.buildings.get(room.splice(j, 1)[0].id) : undefined;
      if (b) {
        // elle contourne l'enclos, se présente au portail et entre (dans le repère de l'enclos, tourné avec lui, comme PenView)
        const r = (b.rot * Math.PI) / 2, c = Math.cos(r), s = Math.sin(r), dx = f.x - b.x - 1, dz = f.z - b.z - 1;
        const way = penWay(dx * c - dz * s, dx * s + dz * c).map(([x, z]): [number, number] => [b.x + 1 + x * c + z * s, b.z + 1 - x * s + z * c]);
        f.home = way.length ? way : [[f.x, f.z]];
        return;
      }
      const [bx, bz] = a.base;
      for (let k = 0; k < 8; k++) {
        const ang = i * 1.3 + k * 0.8 + a.id, x = bx + Math.cos(ang) * 1.3, z = bz + Math.sin(ang) * 1.3, cx = Math.floor(x), cz = Math.floor(z);
        if (k === 7 || (w.inCells(cx, cz) && !w.occ[w.ci(cx, cz)] && !w.isWet(cx, cz))) { f.home = [[x, z]]; break; }
      }
    });
  }

  private clear(sh: Show) {
    for (const f of sh.followers) { f.actor?.mixer.stopAllAction(); this.group.remove(f.obj); }
    for (const s of sh.sacks) this.group.remove(s);
    sh.followers = []; sh.sacks = [];
  }

  /**
   * Au retour : ce que l'expédition rapporte si elle a réussi (les bêtes, celle qu'on a menée à la corde comprise, le chariot,
   * le traîneau, les sacs, les jongleurs invités), et le voyageur blessé qu'on a choisi de ramener au village, quoi qu'il
   * arrive. Les bêtes de la harde rejoignent la file de là où elles paissaient (elles ne surgissent pas toutes ensemble au
   * même endroit) ; le reste part de derrière le dernier de l'équipe, chacun à sa place dans la file
   */
  private rebuild(a: ActiveExpedition, sh: Show) {
    this.clear(sh);
    if (!(a.phase === 'back' || a.phase === 'home')) { sh.trail = []; return; }
    const pos = this.agents.partyPositions(a.party);
    const last = pos[pos.length - 1] ?? [a.dest[0], a.dest[1], 0];
    sh.trail = [last[0], last[1]];
    sh.hx = last[0]; sh.hz = last[1]; sh.v = 0;
    let gap = 0.32;
    const follow = (obj: THREE.Object3D, actor: Actor | null, step: number, folk?: Folk, kind?: HerdKind, from?: [number, number, number] | null) => {
      // (sans place d'où partir : derrière le dernier de l'équipe, à sa place dans la file)
      const [x, z, heading] = from ?? [last[0] - Math.sin(last[2]) * gap, last[1] - Math.cos(last[2]) * gap, last[2]];
      obj.position.set(x, this.world.surfaceAt(x, z), z);
      obj.rotation.y = heading;
      this.group.add(obj);
      sh.followers.push({ obj, actor, folk, gap, x, z, heading, sp: 0, gait: 0, ph: gap * 7, kind });
      gap += step;
    };
    const person = (role: FolkRole, v: number) => { const f = makeFolk({ age: role === 'villager' ? a.age : a.m.age, v, role }); follow(f.root, null, 0.26, f); };
    const j = a.seen.indexOf('traveler');
    if (j >= 0 && a.picks[j] === 1) person('villager', a.id * 31 + 7);
    if (!a.ok) return;
    if (a.c.carry === 'animals') {
      const kinds = [...a.c.win, ...a.bonus].flatMap((e) => (e.t === 'herd' ? e.kinds : []));
      const from = sh.scene?.handOver(kinds) ?? [];
      kinds.forEach((k, i) => {
        const [name, len] = ANIMAL[k];
        const actor = hasModel(name) ? makeActor(name, len) : null;
        const obj: THREE.Object3D = actor ? actor.root : new THREE.Mesh(new THREE.IcosahedronGeometry(len * 0.5, 0), mats.body);
        if (actor) actor.mixer.setTime(i * 0.7);
        follow(obj, actor, 0.3, undefined, k, from[i]);
      });
    } else if (a.c.carry === 'sledge') {
      // le traîneau chargé de viande et de peaux, que tire le dernier chasseur
      const sled = new THREE.Mesh(sledGeo(), mats.body);
      sled.castShadow = true;
      follow(sled, null, 0.34);
    } else if (a.c.carry === 'cart') {
      const cart = new THREE.Mesh(cartGeo(), mats.body);
      cart.castShadow = true;
      follow(cart, null, 0.3);
    } else if (a.c.carry === 'sacks') {
      for (let i = 0; i < a.party.length; i++) { const s = new THREE.Mesh(this.sackGeo, mats.body); s.castShadow = true; this.group.add(s); sh.sacks.push(s); }
    } else if (a.c.carry === 'guests') {
      // les jongleurs et leur tambour, qui viennent faire la fête au village
      (['juggler', 'juggler', 'drummer'] as FolkRole[]).forEach((r, i) => person(r, a.id * 17 + i));
    }
  }
}

/**
 * Point de la trace (x, z à la suite, la plus récente à la fin), prolongée jusqu'à (hx, hz) où se tient le dernier de la
 * file, à `gap` derrière lui ; null tant que la trace est plus courte que cela
 */
export function along(t: number[], gap: number, hx: number, hz: number): [number, number] | null {
  let left = gap, x = hx, z = hz;
  for (let i = t.length - 2; i >= 0; i -= 2) {
    const d = Math.hypot(t[i] - x, t[i + 1] - z);
    if (d >= left) { const k = left / d; return [x + (t[i] - x) * k, z + (t[i + 1] - z) * k]; }
    left -= d; x = t[i]; z = t[i + 1];
  }
  return null;
}
