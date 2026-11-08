import { World, N } from '../world/world';
import { Building, GARRISONS, sizeOf } from '../build/catalog';
import { mulberry32 } from '../core/rng';
import { sidewalkAt, sideStep } from './agents';
import type { SoldierRole } from '../render/soldiers';

/**
 * Les patrouilles du village : quand une tour de garde ou une caserne est bâtie au village (pas sur l'île du portail), un
 * petit groupe de soldats en sort et fait sa ronde dans les rues alentour : il marche le long des routes (sur le trottoir dès
 * la rue pavée), à dix cases au plus de son bâtiment, fait demi-tour au bout des rues et parfois aux carrefours, s'arrête de
 * temps en temps au garde-à-vous, porte une torche la nuit. Un groupe par bâtiment (deux soldats par tour, trois par caserne),
 * six groupes au plus. Ce ne sont pas les troupes du joueur (ni sélection ni recrutement) ni des habitants (hors du compte
 * des passants) : une petite simulation à part, sans chemin calculé, que la vue (render/patrols.ts) habille des soldats de
 * l'époque. Sans route autour du bâtiment, le groupe monte la garde devant sa porte
 */

/** Groupes au plus dans tout le village, et rayon de la ronde autour du bâtiment (cases) */
export const PATROL_MAX = 6;
export const PATROL_RADIUS = 10;
/** Allure d'une patrouille (cases par seconde de jeu) ; écart entre deux soldats de la file */
export const PATROL_SPEED = 0.5;
export const PATROL_GAP = 0.3;
/** Une pause au garde-à-vous toutes les 12 à 28 s, de 3 à 6 s */
const PAUSE_EVERY: [number, number] = [12, 28], PAUSE_FOR: [number, number] = [3, 6];
/** Pour trouver la rue la plus proche du bâtiment (cases) */
const ROAD_REACH = 6;

/** Soldats d'un groupe selon le bâtiment d'où il part */
export const patrolSize = (kind: Building['kind']) => (kind === 'barracks' ? 3 : 2);
/** La tenue de l'époque : lancier à l'Antiquité, chevalier au Moyen Âge, fusilier, fantassin, soldat futuriste ensuite */
export const patrolRole = (age: number): SoldierRole => (age <= 1 ? 'spearman' : 'soldier');

export type PatrolMode = 'walk' | 'guard';

export interface PatrolGroup {
  /** le bâtiment d'où part la ronde, et son centre */
  home: number; hx: number; hz: number;
  size: number;
  /** le meneur : où il est, où il va (centre de case visé, décalé sur le trottoir), d'où il vient */
  x: number; z: number; heading: number;
  cell: number; prev: number; tx: number; tz: number;
  /** ce qu'il fait, et les secondes avant de changer */
  mode: PatrolMode; timer: number;
  /** pas de rue autour : il monte la garde devant la porte */
  posted: boolean;
  /** la trace du meneur (x, z, en alternance), la plus récente à la fin : ceux qui le suivent y prennent leur place */
  trail: number[];
  /** phase du pas */
  phase: number;
}

/** Un soldat de la patrouille, pour la vue (`y` : sa hauteur quand il ne marche pas au sol, les sentinelles des remparts) */
export interface PatrolMember { x: number; y?: number; z: number; heading: number; mode: PatrolMode; phase: number }

export class Patrols {
  groups: PatrolGroup[] = [];
  private rnd = mulberry32(7);
  private version = -1;
  private age = 0;

  constructor(private world: World) {}

  /** Les bâtiments militaires du village (hors île du portail), dans l'ordre où ils ont été bâtis : un groupe chacun, PATROL_MAX au plus */
  static garrisons(w: World): Building[] {
    return [...w.buildings.values()].filter((b) => GARRISONS.includes(b.kind) && !w.onPortalIsland(b.x, b.z)).sort((a, b) => a.id - b.id).slice(0, PATROL_MAX);
  }

  /** Les groupes suivent les bâtiments : un nouveau par bâtiment militaire, ceux des bâtiments démolis disparaissent */
  private plan() {
    const w = this.world, homes = Patrols.garrisons(w), ids = new Set(homes.map((b) => b.id));
    this.groups = this.groups.filter((g) => ids.has(g.home));
    for (const b of homes) {
      const g = this.groups.find((x) => x.home === b.id);
      if (g) { this.station(g, b); continue; }
      const s = sizeOf(b), ng: PatrolGroup = { home: b.id, hx: b.x + s / 2, hz: b.z + s / 2, size: patrolSize(b.kind), x: b.x + s / 2, z: b.z + s / 2, heading: 0, cell: -1, prev: -1, tx: 0, tz: 0, mode: 'guard', timer: 1 + this.rnd() * 3, posted: true, trail: [], phase: this.rnd() * 6 };
      this.station(ng, b);
      // (il part de sa porte, déjà en file)
      ng.x = ng.tx; ng.z = ng.tz; ng.trail = [ng.x, ng.z];
      this.groups.push(ng);
    }
  }

  /** La rue la plus proche du bâtiment : la ronde y commence (sinon le groupe garde la porte) */
  private station(g: PatrolGroup, b: Building) {
    const w = this.world, s = sizeOf(b);
    let best = -1, bd = Infinity;
    for (let dz = -ROAD_REACH; dz < s + ROAD_REACH; dz++) for (let dx = -ROAD_REACH; dx < s + ROAD_REACH; dx++) {
      const cx = b.x + dx, cz = b.z + dz;
      if (!w.inCells(cx, cz) || !w.road[w.ci(cx, cz)] || w.onPortalIsland(cx, cz)) continue;
      const d = Math.hypot(cx + 0.5 - g.hx, cz + 0.5 - g.hz);
      if (d < bd) { bd = d; best = w.ci(cx, cz); }
    }
    const hadRoad = g.cell >= 0 && w.road[g.cell];
    if (best < 0) {
      // devant la porte (la façade regarde vers +z quand rot = 0)
      const f = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.rot];
      g.posted = true; g.cell = -1; g.prev = -1; g.mode = 'guard'; g.timer = 1e9;
      g.tx = g.hx + f[0] * (s / 2 + 0.45); g.tz = g.hz + f[1] * (s / 2 + 0.45);
      g.heading = Math.atan2(f[0], f[1]);
      return;
    }
    if (hadRoad) return;
    // (la rue vient d'apparaître, ou le groupe est neuf : il rejoint la rue la plus proche)
    g.posted = false; g.cell = best; g.prev = -1;
    g.tx = (best % N) + 0.5; g.tz = Math.floor(best / N) + 0.5;
    g.mode = 'walk'; g.timer = PAUSE_EVERY[0] + this.rnd() * (PAUSE_EVERY[1] - PAUSE_EVERY[0]);
  }

  /** Les cases de route voisines d'une case (quatre côtés) */
  private roadNeighbors(c: number): number[] {
    const w = this.world, x = c % N, z = Math.floor(c / N), out: number[] = [];
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const nx = x + dx, nz = z + dz; if (w.inCells(nx, nz) && w.road[w.ci(nx, nz)]) out.push(w.ci(nx, nz)); }
    return out;
  }

  /**
   * Arrivé au bout d'une case, le meneur choisit la suivante : tout droit de préférence, sans revenir sur ses pas sauf au bout
   * de la rue ; aux carrefours, il fait parfois demi-tour ; jamais à plus de PATROL_RADIUS cases de son bâtiment
   */
  private chooseNext(g: PatrolGroup): number {
    const w = this.world, c = g.cell, around = this.roadNeighbors(c);
    const inRange = (k: number) => Math.hypot((k % N) + 0.5 - g.hx, Math.floor(k / N) + 0.5 - g.hz) <= PATROL_RADIUS;
    let options = around.filter((k) => k !== g.prev && inRange(k));
    // (un carrefour : une fois sur trois, demi-tour ; un bout de rue : demi-tour)
    if (!options.length || (around.length >= 3 && this.rnd() < 0.33)) options = g.prev >= 0 && w.road[g.prev] ? [g.prev] : around.filter(inRange);
    if (!options.length) return -1;
    // tout droit si possible (la case dans le prolongement de prev → cell), sinon au hasard
    if (g.prev >= 0 && options.length > 1) {
      const straight = c + (c - g.prev);
      if (options.includes(straight) && this.rnd() < 0.7) return straight;
    }
    return options[Math.floor(this.rnd() * options.length)];
  }

  update(dt: number, age: number) {
    const w = this.world;
    this.age = age;
    if (w.version !== this.version) { this.version = w.version; this.plan(); }
    const lat = sidewalkAt(age);
    for (const g of this.groups) {
      if (g.posted) { g.x += (g.tx - g.x) * Math.min(1, dt * 4); g.z += (g.tz - g.z) * Math.min(1, dt * 4); continue; }
      g.timer -= dt;
      if (g.mode === 'guard') {
        if (g.timer <= 0) { g.mode = 'walk'; g.timer = PAUSE_EVERY[0] + this.rnd() * (PAUSE_EVERY[1] - PAUSE_EVERY[0]); }
        continue;
      }
      if (g.timer <= 0) { g.mode = 'guard'; g.timer = PAUSE_FOR[0] + this.rnd() * (PAUSE_FOR[1] - PAUSE_FOR[0]); continue; }
      const dx = g.tx - g.x, dz = g.tz - g.z, dist = Math.hypot(dx, dz), step = dt * PATROL_SPEED;
      if (dist > 1e-6) g.heading = Math.atan2(dx, dz);
      g.phase += dt * 8 * PATROL_SPEED * 1.6;
      if (dist <= step) {
        g.x = g.tx; g.z = g.tz;
        // la route sous ses pieds a disparu : il regagne la rue la plus proche
        if (!w.road[g.cell]) { const b = w.buildings.get(g.home); if (b) { g.cell = -1; this.station(g, b); } continue; }
        const next = this.chooseNext(g);
        if (next < 0) { g.mode = 'guard'; g.timer = PAUSE_FOR[1]; continue; }
        g.prev = g.cell; g.cell = next;
        const cx = (next % N) + 0.5, cz = Math.floor(next / N) + 0.5, ddx = cx - ((g.prev % N) + 0.5), ddz = cz - (Math.floor(g.prev / N) + 0.5);
        // sur une rue en ville (hors ponts), on longe le bord : le trottoir, à droite du sens de marche
        const onBridge = w.bridgeY(next % N, Math.floor(next / N)) !== null;
        [g.tx, g.tz] = onBridge ? [cx, cz] : sideStep(cx, cz, ddx, ddz, lat);
      } else {
        g.x += (dx / dist) * step; g.z += (dz / dist) * step;
      }
      // la trace du meneur, un point tous les 5 cm, longue de quoi placer la file
      const t = g.trail, n = t.length;
      if (n < 2 || Math.hypot(g.x - t[n - 2], g.z - t[n - 1]) > 0.05) { t.push(g.x, g.z); if (t.length > 2 * 60) t.splice(0, 2); }
    }
  }

  /** Les soldats d'un groupe : le meneur devant, les autres en file sur sa trace */
  members(g: PatrolGroup): PatrolMember[] {
    const out: PatrolMember[] = [{ x: g.x, z: g.z, heading: g.heading, mode: g.mode, phase: g.phase }];
    const t = g.trail;
    for (let i = 1; i < g.size; i++) {
      const want = PATROL_GAP * i;
      let acc = 0, px = g.x, pz = g.z, hx = g.heading, found = false;
      for (let k = t.length - 2; k >= 2; k -= 2) {
        const ax = t[k], az = t[k + 1], bx = t[k - 2], bz = t[k - 1], seg = Math.hypot(ax - bx, az - bz);
        if (acc + seg >= want) { const f = seg > 1e-6 ? (want - acc) / seg : 0; px = ax + (bx - ax) * f; pz = az + (bz - az) * f; hx = Math.atan2(ax - bx, az - bz); found = true; break; }
        acc += seg;
      }
      // (une trace trop courte, au départ : en file derrière le meneur, dans son dos)
      if (!found) { px = g.x - Math.sin(g.heading) * want; pz = g.z - Math.cos(g.heading) * want; hx = g.heading; }
      // au garde-à-vous, tous se tournent du même côté que le meneur
      out.push({ x: px, z: pz, heading: g.mode === 'guard' ? g.heading : hx, mode: g.mode, phase: g.phase + i * 1.7 });
    }
    return out;
  }

  /** Tous les soldats de toutes les rondes (au plus PATROL_MAX × 3) */
  all(): PatrolMember[] { return this.groups.flatMap((g) => this.members(g)); }
  get role() { return patrolRole(this.age); }
}
