import { World, N } from '../world/world';
import { Building, isRampart } from '../build/catalog';
import { mulberry32 } from '../core/rng';
import { WALK, rampartAge } from '../render/ramparts';
import type { PatrolMember, PatrolMode } from './patrols';

/**
 * Les sentinelles des remparts : sur chaque chaîne de remparts reliés (pans, portes, tours de garde) d'au moins CHAIN_MIN
 * cases, un ou deux soldats font les cent pas sur le chemin de ronde, à la hauteur du sommet du mur de l'âge (`WALK`),
 * passent les portes sur leur linteau, font demi-tour aux bouts et devant les tours, s'arrêtent parfois au garde-à-vous ; une
 * sentinelle immobile veille sur la plate-forme de chaque tour de garde. SENTINEL_MAX soldats au plus en tout. Comme les
 * patrouilles des rues : ni habitants ni troupes du joueur, une petite simulation à part que la vue habille des soldats de
 * l'époque (render/patrols.ts)
 */

export const SENTINEL_MAX = 12;
/** Longueur d'une chaîne pour avoir une sentinelle, et pour en avoir deux */
export const CHAIN_MIN = 3, CHAIN_LONG = 8;
export const SENTINEL_SPEED = 0.4;
const PAUSE_EVERY: [number, number] = [10, 24], PAUSE_FOR: [number, number] = [3, 6];

/** Une chaîne de remparts reliés : ses cases, dont celles des tours de garde */
export interface Chain { cells: number[]; towers: number[] }

export interface Sentinel {
  /** où elle est, où elle va (sur le chemin de ronde), d'où elle vient */
  x: number; y: number; z: number; heading: number;
  cell: number; prev: number; tx: number; tz: number; ty: number;
  mode: PatrolMode; timer: number; phase: number;
  /** en faction sur une tour de garde (sa case) ; -1 : elle marche sur les murs */
  tower: number;
}

export class Sentinels {
  sentinels: Sentinel[] = [];
  chains: Chain[] = [];
  private rnd = mulberry32(13);
  private version = -1;
  private age = 0;

  constructor(private world: World) {}

  /** Les chaînes de remparts reliés par les côtés (pans, portes, tours de garde), les plus longues d'abord */
  static chains(w: World): Chain[] {
    const cells = new Map<number, Building>();
    for (const b of w.buildings.values()) if (isRampart(b.kind) || b.kind === 'watchtower') cells.set(w.ci(b.x, b.z), b);
    const seen = new Set<number>(), out: Chain[] = [];
    for (const k of cells.keys()) {
      if (seen.has(k)) continue;
      const chain: Chain = { cells: [], towers: [] }, stack = [k];
      seen.add(k);
      while (stack.length) {
        const c = stack.pop()!, b = cells.get(c)!;
        chain.cells.push(c);
        if (b.kind === 'watchtower') chain.towers.push(c);
        for (const d of [-N, N, 1, -1]) { const n = c + d; if ((d === 1 && c % N === N - 1) || (d === -1 && c % N === 0)) continue; if (cells.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); } }
      }
      out.push(chain);
    }
    return out.sort((a, b) => b.cells.length - a.cells.length);
  }

  /** Combien de sentinelles marchent sur une chaîne de cette longueur */
  static walkers(n: number) { return n >= CHAIN_LONG ? 2 : n >= CHAIN_MIN ? 1 : 0; }

  private isTower(c: number) { const b = this.world.buildings.get(this.world.occ[c]); return !!b && b.kind === 'watchtower'; }

  /** Les cases de rempart voisines d'une case */
  private around(c: number): number[] {
    const w = this.world, x = c % N, z = Math.floor(c / N), out: number[] = [];
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, nz = z + dz;
      if (!w.inCells(nx, nz)) continue;
      const b = w.buildingAt(nx, nz);
      if (b && (isRampart(b.kind) || b.kind === 'watchtower')) out.push(w.ci(nx, nz));
    }
    return out;
  }

  /** Où marche la sentinelle sur cette case : au sommet du mur (ou de la porte), du côté intérieur du chemin de ronde */
  spot(c: number): [number, number, number] {
    const w = this.world, x = c % N, z = Math.floor(c / N), b = w.buildingAt(x, z), base = w.cellAvg(x, z);
    if (!b) return [x + 0.5, base, z + 0.5];
    const wk = WALK[rampartAge(b.age)];
    if (b.kind === 'watchtower') { const [tx, ty, tz] = wk.tower, c0 = Math.cos((b.rot * Math.PI) / 2), s0 = Math.sin((b.rot * Math.PI) / 2); return [x + 0.5 + tx * c0 + tz * s0, base + ty, z + 0.5 - tx * s0 + tz * c0]; }
    if (b.kind === 'gate') return [x + 0.5, base + wk.gate, z + 0.5];
    // le chemin de ronde est du côté −z d'un mur est-ouest, du côté −x d'un mur nord-sud (voir `orient`)
    const near = this.around(c), ns = near.some((n) => Math.abs(n - c) === N), ew = near.some((n) => Math.abs(n - c) === 1);
    return [x + 0.5 + (ns ? wk.z : 0), base + wk.y, z + 0.5 + (ew || !ns ? wk.z : 0)];
  }

  /** Les sentinelles suivent les remparts : autant que les chaînes en demandent, une par tour, SENTINEL_MAX au plus */
  private plan() {
    const w = this.world;
    this.chains = Sentinels.chains(w);
    const chainOf = new Map<number, number>();
    this.chains.forEach((ch, i) => ch.cells.forEach((c) => chainOf.set(c, i)));
    // celles dont le mur a disparu s'en vont ; les autres restent où elles sont
    this.sentinels = this.sentinels.filter((s) => chainOf.has(s.cell) && w.road[s.cell] !== 1 && (s.tower < 0 ? !this.isTower(s.cell) : this.isTower(s.cell)));
    const count = (i: number) => this.sentinels.filter((s) => s.tower < 0 && chainOf.get(s.cell) === i).length;
    const spawn = (c: number, tower: boolean): Sentinel => {
      const [x, y, z] = this.spot(c);
      return { x, y, z, heading: this.rnd() * 6.28, cell: c, prev: -1, tx: x, tz: z, ty: y, mode: 'guard', timer: 1 + this.rnd() * 4, phase: this.rnd() * 6, tower: tower ? c : -1 };
    };
    for (let i = 0; i < this.chains.length && this.sentinels.length < SENTINEL_MAX; i++) {
      const ch = this.chains[i], walls = ch.cells.filter((c) => !this.isTower(c));
      if (!walls.length) continue;
      for (let n = count(i); n < Sentinels.walkers(ch.cells.length) && this.sentinels.length < SENTINEL_MAX; n++) this.sentinels.push(spawn(walls[Math.floor(this.rnd() * walls.length)], false));
    }
    for (const ch of this.chains) for (const t of ch.towers) {
      if (this.sentinels.length >= SENTINEL_MAX) break;
      if (!this.sentinels.some((s) => s.tower === t)) this.sentinels.push(spawn(t, true));
    }
    while (this.sentinels.length > SENTINEL_MAX) this.sentinels.pop();
  }

  /** La case suivante d'une marcheuse : le long du mur, sans revenir sur ses pas sauf au bout ou devant une tour */
  private next(s: Sentinel): number {
    const near = this.around(s.cell).filter((c) => !this.isTower(c));
    let options = near.filter((c) => c !== s.prev);
    if (!options.length) options = near;
    if (!options.length) return -1;
    if (s.prev >= 0 && options.length > 1) { const straight = s.cell + (s.cell - s.prev); if (options.includes(straight) && this.rnd() < 0.75) return straight; }
    return options[Math.floor(this.rnd() * options.length)];
  }

  update(dt: number, age: number) {
    const w = this.world;
    this.age = age;
    if (w.version !== this.version) { this.version = w.version; this.plan(); }
    for (const s of this.sentinels) {
      if (s.tower >= 0) {
        // en faction : elle regarde dehors, et se tourne lentement d'un côté à l'autre
        const [x, y, z] = this.spot(s.cell);
        s.x = x; s.y = y; s.z = z; s.mode = 'guard';
        s.heading = Math.atan2(x - (s.cell % N) - 0.5, z - Math.floor(s.cell / N) - 0.5) + Math.sin(s.phase * 0.05) * 0.5;
        s.phase += dt;
        continue;
      }
      s.timer -= dt;
      if (s.mode === 'guard') {
        if (s.timer <= 0) { s.mode = 'walk'; s.timer = PAUSE_EVERY[0] + this.rnd() * (PAUSE_EVERY[1] - PAUSE_EVERY[0]); }
        continue;
      }
      if (s.timer <= 0) { s.mode = 'guard'; s.timer = PAUSE_FOR[0] + this.rnd() * (PAUSE_FOR[1] - PAUSE_FOR[0]); continue; }
      const dx = s.tx - s.x, dz = s.tz - s.z, dist = Math.hypot(dx, dz), step = dt * SENTINEL_SPEED;
      if (dist > 1e-6) s.heading = Math.atan2(dx, dz);
      s.phase += dt * 8 * SENTINEL_SPEED * 1.6;
      if (dist <= step) {
        s.x = s.tx; s.z = s.tz; s.y = s.ty;
        const n = this.next(s);
        if (n < 0) { s.mode = 'guard'; s.timer = PAUSE_FOR[1]; continue; }
        s.prev = s.cell; s.cell = n;
        [s.tx, s.ty, s.tz] = this.spot(n);
      } else {
        s.x += (dx / dist) * step; s.z += (dz / dist) * step;
        // la hauteur suit : on monte sur le linteau d'une porte, on en redescend
        s.y += (s.ty - s.y) * Math.min(1, step / dist);
      }
    }
  }

  /** Toutes les sentinelles, pour la vue (avec leur hauteur sur le mur) */
  all(): PatrolMember[] { return this.sentinels.map((s) => ({ x: s.x, y: s.y, z: s.z, heading: s.heading, mode: s.mode, phase: s.phase })); }
  get role() { return this.age; }
}
