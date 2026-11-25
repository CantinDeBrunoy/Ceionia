import * as THREE from 'three';
import type { CameraRig } from './core/camera';
import { World, SEA } from './world/world';
import type { People } from './world/archipelago';
import { townPlans, type TownPlan } from './world/rivalTown';
import { DEEP, SHALLOW, nearestWater, navalSites, openSea, warshipKind, waterPath, resample, type NavalSites } from './sim/navalConflict';
import { warshipModel } from './render/warships';
import { vesselModel } from './render/seaTraffic';
import { mats } from './render/materials';
import { VOY_ACT2, actTotal, voyCaptionAt, voyShotAt, voyVeilAt, type VoyShot } from './voyageCine';
import { tr } from './i18n';
import { KINGDOM_TEXT } from './ui/kingdom';
import { skipAsk } from './ui/skipAsk';

/** Ce que la mise en scène demande au jeu */
export interface VoyageHost {
  cam: CameraRig;
  world: World;
  scene: THREE.Scene;
  /** où poser l'habillage (bandes, voiles, bandeaux) */
  root: HTMLElement;
  village(): [number, number] | null;
  age(): number;
  /** l'écran de la traversée (le film, puis sa brume) est encore là : le survol attend dessous, brume tenue */
  loading(): boolean;
  /** la partie agrandie est prête (le film peut encore jouer) : le survol peut préparer ses plans sous la brume */
  ready(): boolean;
  /** le joueur a passé le film : le survol ne se joue pas */
  skipped(): boolean;
}

type P = [number, number];
const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Un navire de la cinématique : un modèle qui suit un chemin sur l'eau, en grandissant au départ */
class Boat {
  root = new THREE.Group();
  s = 0;
  heading: number;
  constructor(geo: THREE.BufferGeometry, public path: P[], public speed: number, public size: number, public delay = 0, public grow = true) {
    const m = new THREE.Mesh(geo, mats.body);
    m.castShadow = true;
    this.root.add(m);
    const [x, z] = path[0], [x2, z2] = path[Math.min(path.length - 1, 2)];
    this.heading = Math.atan2(x2 - x, z2 - z);
    this.root.scale.setScalar(grow ? 0.001 : size);
    this.root.visible = false;
  }
  /** Montré à son départ, à sa taille (pour préparer son rendu sous la brume) ; `on` faux : caché de nouveau */
  show(on: boolean) {
    const [x, z] = this.at();
    this.root.visible = on;
    this.root.scale.setScalar(this.size);
    this.root.position.set(x, SEA, z);
    this.root.rotation.set(0, this.heading, 0);
  }
  /** La place du navire sur son chemin (x, z) */
  at(): P {
    const L = this.path.length - 1, i = Math.max(0, Math.min(L - 1, Math.floor(this.s))), f = Math.min(1, this.s - i);
    const a = this.path[i], b = this.path[Math.min(L, i + 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  step(dt: number, t: number, face: number | null = null) {
    if ((this.delay -= dt) > 0) return;
    const L = this.path.length - 1;
    this.s = Math.min(L, this.s + this.speed * 2 * dt);
    const i = Math.max(0, Math.min(L - 1, Math.floor(this.s))), a = this.path[i], b = this.path[Math.min(L, i + 1)];
    const course = face ?? Math.atan2(b[0] - a[0], b[1] - a[1]);
    this.heading += wrap(course - this.heading) * Math.min(1, dt * 1.5);
    const [x, z] = this.at();
    this.root.visible = true;
    this.root.scale.setScalar(this.size * (this.grow ? Math.min(1, 0.05 + this.s / 6) : 1));
    this.root.position.set(x, SEA + Math.sin(t * 1.3) * 0.015, z);
    this.root.rotation.set(Math.sin(t * 0.8) * 0.02, this.heading, Math.sin(t * 0.95) * 0.03);
  }
}

/** Un chemin droit (échantillonné tous les demi-cases) */
const line = (a: P, b: P): P[] => resample([a, b], 0.5);

/**
 * La route d'un navire du survol entre deux points : la ligne droite si elle reste sur l'eau à une case de toute terre,
 * sinon le chemin sur l'eau entre ces points ramenés au plus près dans l'eau libre ; null s'il n'y en a pas (le navire
 * n'est pas posé). Avant, des lignes droites tirées sans regarder la carte passaient parfois à travers un îlot de l'archipel
 * (retour de l'auteur, 17 nov. 2026 : « notre bateau passe dans l'île verte du milieu »)
 */
export function shipLane(w: World, a: P, b: P, nav = SHALLOW): P[] | null {
  const ok = (p: P) => nearestWater(w, p[0], p[1], nav, 1, 0) !== null, s = line(a, b);
  if (s.every(ok)) return s;
  const a2 = ok(a) ? a : nearestWater(w, a[0], a[1], nav, 1, 8), b2 = ok(b) ? b : nearestWater(w, b[0], b[1], nav, 1, 8);
  if (!a2 || !b2) return null;
  const p = waterPath(w, a2, b2, nav);
  return p && p.length > 1 ? p : null;
}

/**
 * Les routes des deux flottes face à face au milieu du bras de mer (`s.battle`) : trois navires par peuple, qui s'avancent
 * de 3,5 cases l'un vers l'autre ; `face` : le cap de la flotte. Un navire sans route sur l'eau n'est pas posé
 */
export function fleetLanes(w: World, s: NavalSites): { people: People; i: number; face: number; lane: P[] }[] {
  const [bx, bz] = s.battle, [ox, oz] = s.ports.orient, [ax, az] = s.ports.asie, l = Math.hypot(ax - ox, az - oz) || 1;
  const ux = (ax - ox) / l, uz = (az - oz) / l, px = -uz, pz = ux, out: { people: People; i: number; face: number; lane: P[] }[] = [];
  for (const people of ['orient', 'asie'] as People[]) {
    const side = people === 'orient' ? -1 : 1, face = Math.atan2(-side * ux, -side * uz);
    for (let i = 0; i < 3; i++) {
      const lat = (i - 1) * 3.2, back = i === 1 ? 0 : 1.6;
      const a: P = [bx + side * ux * (7.5 + back) + px * lat, bz + side * uz * (7.5 + back) + pz * lat];
      const b: P = [bx + side * ux * (4 + back) + px * lat, bz + side * uz * (4 + back) + pz * lat];
      const lane = shipLane(w, a, b);
      if (lane) out.push({ people, i, face, lane });
    }
  }
  return out;
}

/**
 * Le chemin du navire de l'horizon : il part de l'eau libre au large de l'île principale (dégagée sur 3 cases, reliée au
 * large) et file vers le milieu des deux îles rivales en suivant l'eau. Avant, un trait droit traversait parfois un îlot de
 * l'archipel : le premier plan en direct montrait des palmiers, et le navire caché dedans (signalé par l'auteur en ligne)
 */
export function horizonPath(w: World, mid: P): P[] {
  const f = w.isles!.main, c: P = [f.x + f.n / 2, f.z + f.n / 2];
  const d = Math.hypot(mid[0] - c[0], mid[1] - c[1]) || 1, u: P = [(mid[0] - c[0]) / d, (mid[1] - c[1]) / d];
  const sea = openSea(w, DEEP), at = (k: number): P => [c[0] + u[0] * k, c[1] + u[1] * k];
  const from = nearestWater(w, ...at(f.n * 0.62), DEEP, 3, 40, sea) ?? nearestWater(w, ...at(f.n * 0.62), DEEP, 1, 40, sea);
  if (!from) { const a = at(f.n * 0.62); return shipLane(w, a, at(f.n * 0.62 + 40), DEEP) ?? [a, a]; }
  const goal = nearestWater(w, from[0] + u[0] * 40, from[1] + u[1] * 40, DEEP, 2, 30, sea) ?? nearestWater(w, mid[0], mid[1], DEEP, 1, 30, sea);
  const path = goal ? waterPath(w, from, goal, DEEP) : null;
  // (au plus une quarantaine de cases : le plan ne dure que 5 s)
  return path && path.length > 4 ? path.slice(0, 90) : (shipLane(w, from, [from[0] + u[0] * 40, from[1] + u[1] * 40], DEEP) ?? [from, from]).slice(0, 90);
}

/** Les plans que le survol prépare sous la brume, une image chacun, avant de se lever (maillages, ombres, impostures) */
const PRIME: { shot: VoyShot; k: number }[] = [{ shot: 'asie', k: 0.5 }, { shot: 'fleets', k: 0.5 }, { shot: 'orient', k: 0 }];

/**
 * La mise en scène du survol en direct de la cinématique « Explorer le monde » (partition dans `voyageCine.ts`, le film dans
 * `ui/voyage.ts`) : les navires, la caméra plan par plan, l'habillage (bandes noires, brume, fondus, bandeaux, « Passer ») ;
 * la musique, `main.ts` la choisit (`voyage` tant que `playing`). `play` le lance dès la première image de la partie agrandie :
 * il attend sous l'écran de la traversée, prépare ses plans une fois la partie prête, puis se lève. `update` à chaque image
 */
export class VoyageStage {
  private on = false;
  private t = 0;
  private fromMist = true;
  private done: (() => void) | null = null;
  private boats: Boat[] = [];
  private group = new THREE.Group();
  private el: HTMLElement | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private shot: string | null = null;
  private back: ReturnType<CameraRig['view']> | null = null;
  private sites: NavalSites | null = null;
  private towns: TownPlan[] = [];
  /** le navire de l'horizon */
  private lead: Boat | null = null;
  private clock = 0;
  /** plans déjà préparés sous la brume (voir `PRIME`) */
  private primed = 0;

  constructor(private host: VoyageHost) {}

  get playing() { return this.on; }

  /**
   * Le survol : la brume se dissipe (`fromMist` ; sinon un fondu au noir l'ouvre), l'horizon recule, les deux îles, les deux
   * flottes, le retour au village ; `onEnd` à la fin (ou passé). Tenu sur la brume tant que l'écran de la traversée est là
   */
  play(fromMist: boolean, onEnd: () => void) {
    if (this.on) return;
    const h = this.host, w = h.world, lay = w.isles;
    if (!lay) { onEnd(); return; }
    this.back = h.cam.view();
    this.fromMist = fromMist;
    this.begin(onEnd);
    this.sites = navalSites(w);
    this.towns = townPlans(w);
    // le navire de l'horizon : du bord de l'île principale, cap sur le milieu des deux îles rivales, en pleine eau
    this.lead = this.boat(vesselModel('caravel').geo, horizonPath(w, this.mid()), 1.4, 2.2, 0, false);
    // les ports qui s'animent, puis les flottes : préparés d'avance (rien ne se calcule en plein plan)
    const age = Math.max(2, h.age());
    for (const people of ['orient', 'asie'] as People[]) this.portShips(people, age);
    this.fleets(age);
    this.place(0);
  }

  /** Passer : tout de suite au village (pendant le film, c'est l'écran de la traversée qui reçoit le geste) */
  skip() { if (this.on && !this.host.loading()) this.finish(); }

  /** Une image */
  update(dt: number) {
    if (!this.on) return;
    this.clock += dt;
    if (this.host.loading()) {
      // sous la brume : une fois la partie prête, chaque plan est montré une image (les îles et les flottes se préparent
      // pendant le film, pas en plein survol), puis la vue revient au départ
      // (les navires des ports, cachés jusqu'à leur départ, sont montrés aussi : leurs modèles partent au GPU d'avance)
      if (this.host.ready() && this.primed < PRIME.length) {
        const p = PRIME[this.primed++];
        for (const b of this.boats) if (b.root.userData.port) b.show(this.primed < PRIME.length);
        this.place(0, p.shot, p.k);
      } else this.place(0);
      this.paint(true);
      return;
    }
    // le film passé : pas de survol
    if (this.host.skipped()) { this.finish(); return; }
    this.t += dt;
    this.paint(false);
    if (this.t >= actTotal(VOY_ACT2)) { this.finish(); return; }
    this.place(dt);
  }

  // ---------- Les plans ----------

  /** La caméra et les navires du plan en cours (ou d'un plan imposé, à l'avancée `fk`, pour le préparer sous la brume) */
  private place(dt: number, force?: VoyShot, fk = 0) {
    const h = this.host, cam = h.cam, cur = force ? { shot: force, k: fk, local: 0 } : voyShotAt(VOY_ACT2, this.t);
    if (!cur) return;
    const first = !force && cur.shot !== this.shot;
    if (!force) this.shot = cur.shot;
    const e = ease(cur.k), lead = this.lead;
    if (cur.shot === 'horizon') {
      // derrière le navire, au ras de l'eau ; puis la vue recule et s'élève, toujours tournée vers l'avant : l'horizon s'ouvre,
      // les deux îles paraissent au loin
      if (!lead) return;
      lead.step(dt, this.clock);
      const [x, z] = lead.at(), hd = lead.heading, k = ease(Math.max(0, (cur.k - 0.15) / 0.85)), ahead = k * 18;
      cam.jump({ x: x + Math.sin(hd) * ahead, z: z + Math.cos(hd) * ahead, yaw: hd + Math.PI + 0.3 - k * 0.2, pitch: lerp(0.26, 0.42, k), dist: lerp(15, 62, k) }, SEA);
      return;
    }
    if (first && lead) { lead.root.visible = false; this.lead = null; }
    if (cur.shot === 'orient' || cur.shot === 'asie') {
      // la ville vue de la mer, en tournant lentement : son édifice religieux au centre, son port qui s'anime
      const plan = this.towns.find((p) => p.people === (cur.shot === 'orient' ? 'orient' : 'asie'));
      if (!force) for (const b of this.boats) if ((b.root.userData.people === cur.shot) && b.root.userData.port) b.step(dt, this.clock);
      if (!plan) return;
      const [tx, tz] = plan.points.temple, [qx, qz] = plan.points.port, yaw0 = Math.atan2(Math.cos(plan.seaAng), Math.sin(plan.seaAng));
      const x = lerp(tx, (tx + qx) / 2, e), z = lerp(tz, (tz + qz) / 2, e);
      cam.jump({ x, z, yaw: yaw0 - 0.35 + e * 0.6, pitch: lerp(0.72, 0.52, e), dist: lerp(52, 34, e) }, h.world.hAt(tx, tz));
      return;
    }
    if (cur.shot === 'fleets') {
      // au ras de l'eau, de côté : les deux flottes s'avancent l'une vers l'autre
      const s = this.sites;
      for (const b of this.boats) if (b.root.userData.fleet) b.step(force ? 0 : dt, this.clock, b.root.userData.face as number);
      if (!s) return;
      const [bx, bz] = s.battle, [ox, oz] = s.ports.orient, [ax, az] = s.ports.asie, l = Math.hypot(ax - ox, az - oz) || 1;
      const px = -(az - oz) / l, pz = (ax - ox) / l;
      cam.jump({ x: bx + ((ax - ox) / l) * (e - 0.5) * 3, z: bz + ((az - oz) / l) * (e - 0.5) * 3, yaw: Math.atan2(px, pz) + 0.55, pitch: lerp(0.42, 0.3, e), dist: lerp(30, 24, e) }, SEA);
      return;
    }
    // le retour : la vue revient au village, de haut, puis s'y pose
    const b = this.back, v = h.village();
    if (!b) return;
    const tx = v ? v[0] : b.x, tz = v ? v[1] : b.z;
    cam.jump({ x: lerp(tx, b.x, e), z: lerp(tz, b.z, e), yaw: b.yaw + (1 - e) * 0.4, pitch: lerp(1.0, b.pitch, e), dist: lerp(cam.maxDist * 0.45, b.dist, e) }, h.world.hAt(tx, tz));
  }

  /** Le milieu du bras de mer entre les deux îles rivales */
  private mid(): P {
    const s = this.sites;
    if (s) return s.battle;
    const r = this.host.world.isles!.rivals;
    return [(r[0].village.x + r[1].village.x) / 2, (r[0].village.z + r[1].village.z) / 2];
  }

  /** Deux navires sortent du port d'une ville, vers son mouillage puis le large */
  private portShips(people: People, age: number) {
    const w = this.host.world, plan = this.towns.find((p) => p.people === people), s = this.sites;
    if (!plan) return;
    const [qx, qz] = plan.points.port, from = nearestWater(w, qx, qz, SHALLOW, 1, 14);
    if (!from) return;
    const to: P = s?.ports[people] ?? [qx + Math.cos(plan.seaAng) * 16, qz + Math.sin(plan.seaAng) * 16];
    const path = waterPath(w, from, to, SHALLOW) ?? shipLane(w, from, to);
    if (!path) return;
    for (let i = 0; i < 2; i++) {
      const b = this.boat(warshipModel(warshipKind(people, age, i), people).body, path, 1.3, 2, i * 1.6);
      b.root.userData = { people, port: true };
    }
  }

  /** Les deux flottes face à face, au milieu du bras de mer : trois navires chacune, qui s'avancent lentement */
  private fleets(age: number) {
    const s = this.sites;
    if (!s) return;
    for (const f of fleetLanes(this.host.world, s)) {
      const boat = this.boat(warshipModel(warshipKind(f.people, age, f.i), f.people).body, f.lane, 0.26, 2.1, 0, false);
      boat.root.userData = { fleet: true, face: f.face };
      boat.heading = f.face;
    }
  }

  private boat(geo: THREE.BufferGeometry, path: P[], speed: number, size: number, delay = 0, grow = true) {
    const b = new Boat(geo, path, speed, size, delay, grow);
    this.group.add(b.root);
    this.boats.push(b);
    return b;
  }

  // ---------- L'habillage ----------

  private begin(done: () => void) {
    this.on = true; this.t = 0; this.done = done; this.shot = null; this.clock = 0; this.primed = 0;
    this.host.scene.add(this.group);
    document.body.classList.add('cinematic');
    const el = (this.el = document.createElement('div'));
    el.id = 'voyCine';
    el.innerHTML = `<div class="kc-veil vc-mist"></div><div class="kc-veil vc-black"></div><div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"><b></b><small></small></div><button class="kc-skip" type="button">${KINGDOM_TEXT.skip}</button>`;
    this.host.root.appendChild(el);
    // un clic n'importe où, Échap ou Espace : passer (la partie ne réagit pas dessous)
    // (en deux temps : le premier appui demande « Vraiment passer ? », voir `skipAsk`)
    const ask = skipAsk(el, () => this.skip());
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); ask(); });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      // (pendant le film, l'écran de la traversée a ses propres touches)
      if (this.host.loading()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) ask();
    };
    window.addEventListener('keydown', this.keyHandler, true);
    this.paint(true);
  }

  private paint(holding: boolean) {
    const el = this.el;
    if (!el) return;
    const veil = holding ? { mist: 1, black: 0 } : voyVeilAt(this.t, this.fromMist);
    (el.querySelector('.vc-mist') as HTMLElement).style.opacity = String(veil.mist);
    (el.querySelector('.vc-black') as HTMLElement).style.opacity = String(veil.black);
    const cap = holding ? null : voyCaptionAt(VOY_ACT2, this.t);
    const box = el.querySelector('.kc-cap') as HTMLElement;
    const text = cap ? tr(cap.text) : '', sub = cap?.sub ? tr(cap.sub) : '';
    const b = box.querySelector('b')!, s = box.querySelector('small')!;
    if (b.textContent !== text) b.textContent = text;
    if (s.textContent !== sub) s.textContent = sub;
    box.style.opacity = String(cap ? cap.alpha : 0);
  }

  /** Fin du survol : navires, habillage et touches retirés, la vue rendue au village (la musique de l'âge revient seule) */
  private finish() {
    const done = this.done, h = this.host;
    this.on = false; this.done = null;
    for (const b of this.boats) this.group.remove(b.root);
    this.boats = []; this.lead = null;
    h.scene.remove(this.group);
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler, true); this.keyHandler = null; }
    this.el?.remove(); this.el = null;
    if (!document.getElementById('kingCine')) document.body.classList.remove('cinematic');
    if (this.back) h.cam.jump(this.back, h.world.hAt(this.back.x, this.back.z));
    done?.();
  }
}
