import * as THREE from 'three';
import type { CameraRig } from './core/camera';
import { World, N, SEA } from './world/world';
import type { People } from './world/archipelago';
import { townPlans, type TownPlan } from './world/rivalTown';
import { DEEP, SHALLOW, nearestWater, navalSites, warshipKind, waterPath, resample, type NavalSites } from './sim/navalConflict';
import { warshipModel } from './render/warships';
import { vesselModel } from './render/seaTraffic';
import { mats } from './render/materials';
import { VOY_ACT1, VOY_ACT2, VOY_WAIT, actTotal, voyCaptionAt, voyShotAt, voyVeilAt, type VoyPlan } from './voyageCine';
import { tr } from './i18n';
import { KINGDOM_TEXT } from './ui/kingdom';

/** Ce que la mise en scène demande au jeu */
export interface VoyageHost {
  cam: CameraRig;
  world: World;
  scene: THREE.Scene;
  /** où poser l'habillage (bandes, voiles, bandeaux) */
  root: HTMLElement;
  village(): [number, number] | null;
  age(): number;
  /** l'écran de chargement est encore là : l'acte II attend, brume tenue */
  loading(): boolean;
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
 * Le départ du navire : parmi seize directions autour du village, celle où la côte est la plus proche et d'où la mer reste
 * libre jusqu'au bord de la carte (ni lac ni rivière : un trait droit sur l'eau). Rend la première case d'eau profonde et un
 * point au large, sur ce trait (repli : vers le bord de carte le plus proche)
 */
export function seaRay(w: Pick<World, 'cellAvg' | 'inCells'>, v: P): [P, P] {
  let best: [P, P] | null = null, bestD = Infinity;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    let start: P | null = null, ok = true, d = 0;
    for (d = 2; d < N * 1.5; d += 0.5) {
      const x = v[0] + dx * d, z = v[1] + dz * d;
      if (!w.inCells(Math.floor(x), Math.floor(z))) break;
      const h = w.cellAvg(Math.floor(x), Math.floor(z));
      if (!start) { if (h < DEEP) start = [x, z]; }
      else if (h > SHALLOW) { ok = false; break; }
    }
    if (!start || !ok) continue;
    const dc = Math.hypot(start[0] - v[0], start[1] - v[1]);
    if (dc < bestD) { bestD = dc; const far = Math.min(34, d - dc - 3); best = [start, [start[0] + dx * Math.max(4, far), start[1] + dz * Math.max(4, far)]]; }
  }
  if (best) return best;
  const edges = [v[0], N - v[0], v[1], N - v[1]], e = edges.indexOf(Math.min(...edges));
  const dir: P = e === 0 ? [-1, 0] : e === 1 ? [1, 0] : e === 2 ? [0, -1] : [0, 1];
  return [[v[0] + dir[0] * edges[e] * 0.7, v[1] + dir[1] * edges[e] * 0.7], [v[0] + dir[0] * (edges[e] - 3), v[1] + dir[1] * (edges[e] - 3)]];
}

/**
 * La mise en scène de la cinématique « Explorer le monde » (partition dans `voyageCine.ts`) : les navires, la caméra plan par
 * plan, l'habillage (bandes noires, brume, fondus, bandeaux, « Passer ») ; la musique, `main.ts` la choisit (`voyage` tant que `playing`). `playAct1` sur le monde d'avant,
 * jusqu'à la brume ; `playAct2` sur le monde agrandi, de la brume au village. `update` à chaque image
 */
export class VoyageStage {
  private act: 1 | 2 | 0 = 0;
  private t = 0;
  private plan: readonly VoyPlan[] = VOY_ACT1;
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
  /** le navire suivi (acte I : celui du village ; acte II : celui qui ouvre l'horizon) */
  private lead: Boat | null = null;
  private clock = 0;

  constructor(private host: VoyageHost) {}

  get playing() { return this.act !== 0; }

  /** Acte I : le départ du navire, puis la brume ; `onMist` une fois la brume tombée (ou l'acte passé) */
  playAct1(onMist: () => void) {
    if (this.act) return;
    const h = this.host, w = h.world, v = h.village() ?? [h.cam.view().x, h.cam.view().z];
    this.begin(1, VOY_ACT1, onMist);
    // le navire part de la côte du village et file droit vers le large (`seaRay` : la mer libre jusqu'au bord de la carte)
    const ray = seaRay(w, v), path = line(ray[0], ray[1]);
    this.lead = this.boat(vesselModel('caravel').geo, path, 1.6, 2.2);
  }

  /**
   * Acte II : la brume se dissipe (`fromMist` ; sinon un fondu au noir l'ouvre), l'horizon recule, les deux îles, les deux
   * flottes, le retour au village ; `onEnd` à la fin (ou passé). Tenue sur la brume tant que l'écran de chargement est là
   */
  playAct2(fromMist: boolean, onEnd: () => void) {
    if (this.act) return;
    const h = this.host, w = h.world, lay = w.isles;
    if (!lay) { onEnd(); return; }
    this.back = h.cam.view();
    this.fromMist = fromMist;
    this.begin(2, VOY_ACT2, onEnd);
    this.sites = navalSites(w);
    this.towns = townPlans(w);
    // le navire de l'horizon : du bord de l'île principale, cap sur le milieu des deux îles rivales
    const f = lay.main, c: P = [f.x + f.n / 2, f.z + f.n / 2], mid = this.mid();
    const d = Math.hypot(mid[0] - c[0], mid[1] - c[1]) || 1, u: P = [(mid[0] - c[0]) / d, (mid[1] - c[1]) / d];
    const from = nearestWater(w, c[0] + u[0] * f.n * 0.62, c[1] + u[1] * f.n * 0.62, DEEP, 1, 30) ?? [c[0] + u[0] * f.n * 0.62, c[1] + u[1] * f.n * 0.62] as P;
    this.lead = this.boat(vesselModel('caravel').geo, line(from, [from[0] + u[0] * 40, from[1] + u[1] * 40]), 1.4, 2.2, 0, false);
    // les ports qui s'animent, puis les flottes : préparés d'avance (rien ne se calcule en plein plan)
    const age = Math.max(2, h.age());
    for (const people of ['orient', 'asie'] as People[]) this.portShips(people, age);
    this.fleets(age);
    this.place(0);
  }

  /** Passer : l'acte I file à la brume, l'acte II au village (jamais pendant l'attente du chargement) */
  skip() {
    if (this.act === 1) { const cut = VOY_ACT1[0].dur + VOY_ACT1[1].dur * 0.85 - 0.4; if (this.t < cut) this.t = cut; return; }
    if (this.act === 2 && !this.host.loading()) this.finish();
  }

  /** Une image */
  update(dt: number) {
    if (!this.act) return;
    const holding = this.act === 2 && this.host.loading();
    if (!holding) this.t += dt;
    this.clock += dt;
    this.paint();
    if (this.t >= actTotal(this.plan)) { this.finish(); return; }
    this.place(holding ? 0 : dt);
  }

  // ---------- Les plans ----------

  private place(dt: number) {
    const h = this.host, cam = h.cam, cur = voyShotAt(this.plan, this.t);
    if (!cur) return;
    const first = cur.shot !== this.shot;
    this.shot = cur.shot;
    const e = ease(cur.k), lead = this.lead;
    if (cur.shot === 'depart' || cur.shot === 'mist') {
      // la caméra suit le navire de trois quarts arrière, basse, et s'élève un peu quand la brume monte
      if (!lead) return;
      lead.step(dt, this.clock);
      const [x, z] = lead.at(), hd = lead.heading, mist = cur.shot === 'mist';
      cam.jump({ x: x + Math.sin(hd) * 3, z: z + Math.cos(hd) * 3, yaw: hd + Math.PI + 0.55 - (mist ? e * 0.2 : 0), pitch: mist ? 0.42 + e * 0.12 : 0.4, dist: mist ? 24 + e * 6 : 16 + e * 8 }, SEA);
      return;
    }
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
      for (const b of this.boats) if ((b.root.userData.people === cur.shot) && b.root.userData.port) b.step(dt, this.clock);
      if (!plan) return;
      const [tx, tz] = plan.points.temple, [qx, qz] = plan.points.port, yaw0 = Math.atan2(Math.cos(plan.seaAng), Math.sin(plan.seaAng));
      const x = lerp(tx, (tx + qx) / 2, e), z = lerp(tz, (tz + qz) / 2, e);
      cam.jump({ x, z, yaw: yaw0 - 0.35 + e * 0.6, pitch: lerp(0.72, 0.52, e), dist: lerp(52, 34, e) }, h.world.hAt(tx, tz));
      return;
    }
    if (cur.shot === 'fleets') {
      // au ras de l'eau, de côté : les deux flottes s'avancent l'une vers l'autre
      const s = this.sites;
      for (const b of this.boats) if (b.root.userData.fleet) b.step(dt, this.clock, b.root.userData.face as number);
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
    const path = waterPath(w, from, to, SHALLOW) ?? line(from, to);
    for (let i = 0; i < 2; i++) {
      const b = this.boat(warshipModel(warshipKind(people, age, i), people).body, path, 1.3, 2, i * 1.6);
      b.root.userData = { people, port: true };
    }
  }

  /** Les deux flottes face à face, au milieu du bras de mer : trois navires chacune, qui s'avancent lentement */
  private fleets(age: number) {
    const s = this.sites;
    if (!s) return;
    const [bx, bz] = s.battle, [ox, oz] = s.ports.orient, [ax, az] = s.ports.asie, l = Math.hypot(ax - ox, az - oz) || 1;
    const ux = (ax - ox) / l, uz = (az - oz) / l, px = -uz, pz = ux;
    for (const people of ['orient', 'asie'] as People[]) {
      const side = people === 'orient' ? -1 : 1, face = Math.atan2(-side * ux, -side * uz);
      for (let i = 0; i < 3; i++) {
        const lat = (i - 1) * 3.2, back = i === 1 ? 0 : 1.6;
        const a: P = [bx + side * ux * (7.5 + back) + px * lat, bz + side * uz * (7.5 + back) + pz * lat];
        const b: P = [bx + side * ux * (4 + back) + px * lat, bz + side * uz * (4 + back) + pz * lat];
        const boat = this.boat(warshipModel(warshipKind(people, age, i), people).body, line(a, b), 0.26, 2.1, 0, false);
        boat.root.userData = { fleet: true, face };
        boat.heading = face;
      }
    }
  }

  private boat(geo: THREE.BufferGeometry, path: P[], speed: number, size: number, delay = 0, grow = true) {
    const b = new Boat(geo, path, speed, size, delay, grow);
    this.group.add(b.root);
    this.boats.push(b);
    return b;
  }

  // ---------- L'habillage ----------

  private begin(act: 1 | 2, plan: readonly VoyPlan[], done: () => void) {
    this.act = act; this.plan = plan; this.t = 0; this.done = done; this.shot = null; this.clock = 0;
    this.host.scene.add(this.group);
    document.body.classList.add('cinematic');
    const el = (this.el = document.createElement('div'));
    el.id = 'voyCine';
    el.innerHTML = `<div class="kc-veil vc-mist"></div><div class="kc-veil vc-black"></div><div class="kc-bar t"></div><div class="kc-bar b"></div><div class="kc-cap"><b></b><small></small></div><button class="kc-skip" type="button">${KINGDOM_TEXT.skip}</button>`;
    this.host.root.appendChild(el);
    // un clic n'importe où, Échap ou Espace : passer (la partie ne réagit pas dessous)
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.skip(); });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.skip();
    };
    window.addEventListener('keydown', this.keyHandler, true);
    this.paint();
  }

  private paint() {
    const el = this.el;
    if (!el) return;
    const holding = this.act === 2 && this.host.loading();
    const veil = holding ? { mist: 1, black: 0 } : voyVeilAt(this.act as 1 | 2, this.t, this.fromMist);
    (el.querySelector('.vc-mist') as HTMLElement).style.opacity = String(veil.mist);
    (el.querySelector('.vc-black') as HTMLElement).style.opacity = String(veil.black);
    const cap = holding ? { ...VOY_WAIT, alpha: 1 } : voyCaptionAt(this.plan, this.t);
    const box = el.querySelector('.kc-cap') as HTMLElement;
    const text = cap ? tr(cap.text) : '', sub = cap?.sub ? tr(cap.sub) : '';
    const b = box.querySelector('b')!, s = box.querySelector('small')!;
    if (b.textContent !== text) b.textContent = text;
    if (s.textContent !== sub) s.textContent = sub;
    box.style.opacity = String(cap ? cap.alpha : 0);
    // (« Passer » : pas pendant l'attente du chargement)
    (el.querySelector('.kc-skip') as HTMLElement).style.visibility = holding ? 'hidden' : '';
  }

  /** Fin d'un acte : navires, habillage et touches retirés ; l'acte II rend la vue au village (la musique de l'âge revient seule) */
  private finish() {
    const act = this.act, done = this.done, h = this.host;
    this.act = 0; this.done = null;
    for (const b of this.boats) this.group.remove(b.root);
    this.boats = []; this.lead = null;
    h.scene.remove(this.group);
    if (this.keyHandler) { window.removeEventListener('keydown', this.keyHandler, true); this.keyHandler = null; }
    if (act === 2) {
      this.el?.remove(); this.el = null;
      if (!document.getElementById('kingCine')) document.body.classList.remove('cinematic');
      if (this.back) h.cam.jump(this.back, h.world.hAt(this.back.x, this.back.z));
    }
    // (acte I : la brume reste à l'écran jusqu'au rechargement)
    done?.();
  }
}
