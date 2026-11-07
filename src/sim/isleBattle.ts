import type { World } from '../world/world';
import type { HellZoneInfo } from '../world/hell';
import { sizeOf } from '../build/catalog';
import { CombatMap, Hell, HellBuilding, HellUnit, RaidWave, PlayerSiteKind } from './hell';
import { Blight, demonBoost, healBoost } from '../world/blight';

/**
 * Les combats sur l'île du portail : une petite carte de cases taillée autour de l'île (sa terre, moins le portail et les
 * emprises des défenses), la même simulation de combat que dans les Enfers (`Hell`), sans démons à demeure : seulement ceux
 * des incursions, qui sortent du portail et fondent sur la tour de garde, la caserne et la garnison. Coordonnées locales
 * (`ox`, `oz` : la case de la carte du monde où commence la carte de l'île)
 */

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class IsleMap implements CombatMap {
  readonly W: number;
  readonly L: number;
  readonly seed: number;
  version = 0;
  zones: HellZoneInfo[] = [];
  /** le point de ralliement (devant la caserne, sinon au bord de l'île face au continent) ; le portail, où sortent les démons */
  arrival: [number, number];
  portal: [number, number];
  readonly ox: number;
  readonly oz: number;
  /** terre où l'on marche, emprises (bâtiments debout, portail) */
  land: Uint8Array;
  block: Uint8Array;

  constructor(private world: World) {
    const p = world.portal!;
    const R = Math.ceil(p.r + 3);
    this.ox = p.x - R; this.oz = p.z - R;
    this.W = this.L = 2 * R;
    this.seed = world.seed;
    this.land = new Uint8Array(this.W * this.L);
    this.block = new Uint8Array(this.W * this.L);
    this.portal = [p.x - this.ox, p.z - this.oz];
    this.arrival = [this.portal[0], this.portal[1] + 3];
    this.refresh();
  }

  /** Relit la terre et les emprises sur la carte du monde (les défenses posées ou rasées) */
  refresh() {
    const w = this.world;
    for (let z = 0; z < this.L; z++)
      for (let x = 0; x < this.W; x++) {
        const cx = x + this.ox, cz = z + this.oz, k = z * this.W + x;
        const on = w.inCells(cx, cz) && w.onPortalIsland(cx, cz) && w.cellAvg(cx, cz) > 0.08;
        this.land[k] = on ? 1 : 0;
        this.block[k] = on && (w.inPortal(cx, cz) || w.occ[w.ci(cx, cz)] !== 0) ? 1 : 0;
      }
    this.version++;
  }

  inside(x: number, z: number) { return x >= 0 && z >= 0 && x < this.W && z < this.L; }
  cell(x: number, z: number) { return Math.floor(z) * this.W + Math.floor(x); }
  walkable(cx: number, cz: number) {
    if (!this.inside(cx, cz)) return false;
    const k = cz * this.W + cx;
    return this.land[k] === 1 && this.block[k] === 0;
  }
  walkableAt(x: number, z: number) { return this.walkable(Math.floor(x), Math.floor(z)); }

  /** Distance en pas depuis une case, -1 hors d'atteinte */
  distances(from: number) {
    const W = this.W, n = W * this.L, d = new Int32Array(n).fill(-1), q = new Int32Array(n);
    let h = 0, t = 0;
    if (from >= 0 && from < n) { d[from] = 0; q[t++] = from; }
    while (h < t) {
      const k = q[h++], x = k % W, z = (k - x) / W;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz, m = nz * W + nx;
        if (!this.walkable(nx, nz) || d[m] >= 0) continue;
        d[m] = d[k] + 1; q[t++] = m;
      }
    }
    return d;
  }

  route(from: number, to: number): number[] | null {
    if (from === to) return [from];
    const d = this.distances(to), W = this.W;
    if (d[from] < 0) return null;
    const out = [from];
    for (let k = from, guard = 0; k !== to && guard < W * this.L; guard++) {
      const x = k % W, z = (k - x) / W;
      let next = -1;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz, m = nz * W + nx;
        if (!this.inside(nx, nz)) continue;
        if ((this.walkable(nx, nz) || m === to) && d[m] === d[k] - 1) { next = m; break; }
      }
      if (next < 0) return null;
      out.push(next); k = next;
    }
    return out;
  }

  nearestWalkable(x: number, z: number, max = 6) {
    const cx = Math.floor(x), cz = Math.floor(z);
    let best = -1, bd = Infinity;
    for (let dz = -max; dz <= max; dz++)
      for (let dx = -max; dx <= max; dx++) {
        if (!this.walkable(cx + dx, cz + dz)) continue;
        const d = Math.hypot(cx + dx + 0.5 - x, cz + dz + 0.5 - z);
        if (d < bd) { bd = d; best = (cz + dz) * this.W + cx + dx; }
      }
    return best;
  }

  lineClear(x0: number, z0: number, x1: number, z1: number) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d * 3);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.walkableAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    }
    return true;
  }

  /** Une défense rasée : ses ruines se traversent */
  unblock(s: { x: number; z: number; r: number }) {
    for (let z = Math.floor(s.z - s.r - 1); z <= s.z + s.r + 1; z++)
      for (let x = Math.floor(s.x - s.r - 1); x <= s.x + s.r + 1; x++)
        if (this.inside(x, z) && Math.hypot(x + 0.5 - s.x, z + 0.5 - s.z) <= s.r + 0.2) this.block[z * this.W + x] = 0;
    this.version++;
  }

  /** Case libre (centre) la plus proche d'un point, ou le point lui-même */
  freeNear(x: number, z: number, max = 5): [number, number] {
    const c = this.nearestWalkable(x, z, max);
    return c >= 0 ? [(c % this.W) + 0.5, Math.floor(c / this.W) + 0.5] : [x, z];
  }
}

/** Vie et force des défenses : un peu plus à chaque âge à partir de l'Antiquité */
export const defenseK = (age: number) => 1 + 0.25 * Math.max(0, age - 1);
/** Les défenses se réparent entre deux vagues (part de leur vie par seconde de jeu) ; une défense rasée se relève à REBUILD */
export const REPAIR = 0.02, REBUILD = 0.4;
/**
 * Une vague qui traîne (un démon coincé hors d'atteinte, qui ne meurt jamais) : au bout de RAID_LIMIT secondes de jeu, si l'île
 * tient encore, ses derniers démons repassent le portail et elle compte pour repoussée (sinon plus aucune vague ne venait)
 */
export const RAID_LIMIT = 180;

/** Issue d'une incursion sur l'île */
export type RaidOutcome = 'repelled' | 'lost';

export class IsleBattle {
  map: IsleMap;
  sim: Hell;
  /** défenses : bâtiment du monde → bâtiment au combat */
  defs = new Map<number, HellBuilding>();
  /** la vague en cours sur l'île, et depuis quand elle dure (secondes de jeu) */
  raid: RaidWave | null = null;
  raidT = 0;
  /** la contamination de l'île (bonus des démons près du portail, soins dans la zone purifiée) ; null : sans effet */
  blight: Blight | null = null;

  constructor(private world: World) {
    this.map = new IsleMap(world);
    this.sim = new Hell(this.map);
    this.sim.units.clear();
    this.sim.buildings.clear();
  }

  /**
   * Point de ralliement de la garnison : devant la première caserne debout ; sinon au pied d'une tour debout, sinon devant les
   * ruines d'une caserne (le repli menait droit au portail, d'où sortent les démons) ; sans défense, devant le portail
   */
  rallyPoint(): [number, number] {
    const defs = [...this.defs.values()];
    const b = defs.find((d) => d.kind === 'barracks' && !d.down) ?? defs.find((d) => !d.down) ?? defs.find((d) => d.kind === 'barracks');
    if (b) return this.map.freeNear(b.site.x, b.site.z + b.site.r + 0.8);
    return this.map.freeNear(this.map.arrival[0], this.map.arrival[1]);
  }

  /** Accorde les défenses au combat avec celles bâties sur l'île (posées, rasées au bulldozer, montées d'âge) */
  syncDefenses(age: number) {
    const w = this.world, seen = new Set<number>();
    let changed = false;
    for (const b of w.buildings.values()) {
      if ((b.kind !== 'watchtower' && b.kind !== 'barracks') || !w.onPortalIsland(b.x, b.z)) continue;
      seen.add(b.id);
      if (this.defs.has(b.id)) continue;
      const s = sizeOf(b), x = b.x + s / 2 - this.map.ox, z = b.z + s / 2 - this.map.oz, k = defenseK(age);
      this.defs.set(b.id, this.sim.addPlayerBuilding(b.kind as PlayerSiteKind, x, z, s * 0.5 + 0.05, k, k));
      changed = true;
    }
    for (const [id, hb] of this.defs) if (!seen.has(id)) { this.sim.buildings.delete(hb.id); this.defs.delete(id); changed = true; }
    if (changed) this.reblock();
    this.sim.rally = this.rallyPoint();
  }

  /** Les emprises : celles du monde, moins les défenses rasées */
  private reblock() {
    this.map.refresh();
    for (const b of this.defs.values()) if (b.down) this.map.unblock(b.site);
  }

  /** Défenses debout */
  standing() { return [...this.defs.values()].filter((b) => !b.down); }

  /** Une vague passe le portail : ses démons apparaissent devant l'arche, en grappe */
  startRaid(w: RaidWave): HellUnit[] {
    this.raid = w;
    this.raidT = 0;
    const [px, pz] = this.map.portal, out: HellUnit[] = [];
    w.units.forEach((u, i) => {
      const a = i * 2.4, r = 1.4 + (i % 3) * 0.45;
      const [x, z] = this.map.freeNear(px + Math.sin(a) * r, pz + Math.cos(a) * r, 4);
      out.push(this.sim.addRaider(u.kind, u.stats, x, z));
    });
    return out;
  }

  /** Démons encore debout sur l'île */
  raiders() { return this.sim.alive('hell'); }

  /**
   * Où en est la vague : repoussée quand tous ses démons sont abattus, perdue quand toutes les défenses sont tombées (les
   * démons repartent alors par le portail, la garnison se replie) ; null tant qu'elle dure
   */
  outcome(): RaidOutcome | null {
    if (!this.raid) return null;
    if (!this.raiders().length) return 'repelled';
    if (this.defs.size && !this.standing().length) return 'lost';
    // sans aucune défense ni garnison, l'île est submergée
    if (!this.defs.size && !this.sim.alive('player').length) return 'lost';
    // la vague traîne : l'île a tenu
    if (this.raidT >= RAID_LIMIT) return 'repelled';
    return null;
  }

  /** Fin de la vague : les démons restants repassent le portail ; les défenses rasées se relèvent (réparables) */
  endRaid() {
    this.raid = null;
    this.raidT = 0;
    for (const u of this.sim.alive('hell')) this.sim.units.delete(u.id);
    let up = false;
    for (const b of this.defs.values()) if (b.down) { b.down = false; b.hp = Math.round(b.maxHp * REBUILD); up = true; }
    if (up) this.reblock();
    this.sim.rally = this.rallyPoint();
  }

  /**
   * Un pas de combat ; hors incursion, les défenses se réparent et les blessures légères se referment (plus vite dans la zone
   * purifiée). Tant que la contamination est forte, les démons près du portail frappent un peu plus fort
   */
  step(dt: number, regen = 0) {
    const bl = this.blight, ox = this.map.ox, oz = this.map.oz;
    if (bl) for (const u of this.sim.alive('hell')) u.boost = demonBoost(bl, u.x + ox, u.z + oz);
    this.sim.step(dt);
    if (this.raid && dt > 0) this.raidT += dt;
    if (this.raid || dt <= 0) return;
    for (const b of this.defs.values()) if (!b.down) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * REPAIR * dt);
    if (regen > 0) for (const u of this.sim.alive('player')) u.hp = Math.min(u.maxHp, u.hp + regen * healBoost(bl, u.x + ox, u.z + oz) * dt);
  }

  /** Coordonnées du monde d'un point de la carte de l'île */
  toWorld(x: number, z: number): [number, number] { return [x + this.map.ox, z + this.map.oz]; }
  /** …et l'inverse */
  toLocal(x: number, z: number): [number, number] { return [x - this.map.ox, z - this.map.oz]; }
}
