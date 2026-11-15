import type { World } from '../world/world';
import type { HellZoneInfo } from '../world/hell';
import type { People } from '../world/archipelago';
import { townPlans, TownPlan } from '../world/rivalTown';
import { CombatMap, Hell, HellUnit, DemonKind, UnitStats } from './hell';
import { BALANCE_EASY, BALANCE_NORMAL } from './hellBalance';
import { troopStats, TroopKind } from './army';

/**
 * La bataille de l'archipel (la voie de la guerre, au Médiéval) : nos troupes, débarquées par l'expédition « Aux côtés de
 * notre allié », prennent la ville du rival, objectif après objectif : la plage, les remparts (une porte), le port, puis le
 * palais. Même moteur de combat que l'île du portail et les Enfers (`Hell`), sur une petite carte taillée autour de la ville
 * rivale (`RivalMap`) : la terre, moins les remparts, qu'on ne franchit que par leurs portes. Les défenseurs sont des soldats
 * du peuple rival, postés à chaque objectif (ils gardent leur poste et accourent à l'alerte). Simulation pure : la vue
 * (`BattleLayer`) la montre et le joueur commande ses troupes ; sans ordre, elles marchent sur l'objectif en cours
 */

/** Les objectifs, dans l'ordre */
export type BattleGoal = 'plage' | 'remparts' | 'port' | 'palais';
export const GOALS: BattleGoal[] = ['plage', 'remparts', 'port', 'palais'];
/** Un objectif est pris quand ses défenseurs sont tombés et qu'une de nos troupes est à moins de `TAKE_R` cases de lui */
export const TAKE_R = 4;
/** Défenseurs à chaque objectif (soldats, archers) */
export const GUARDS: Record<BattleGoal, [number, number]> = { plage: [4, 2], remparts: [4, 3], port: [4, 2], palais: [5, 3] };
/** Nos troupes débarquées (soldats ou chevaliers, archers) */
export const ARMY: [number, number] = [8, 4];
/** Les défenseurs sont un peu moins forts que nos troupes du même âge (la ville a ses murs, nous l'initiative) */
export const GUARD_K = 0.9;
/** Une bataille qui traîne (une unité coincée) : au bout de ce temps (s de jeu), elle compte pour perdue (retraite) */
export const BATTLE_LIMIT = 900;
/** Marge autour de la ville (cases) */
const MARGIN = 8;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class RivalMap implements CombatMap {
  readonly W: number;
  readonly L: number;
  readonly seed: number;
  version = 0;
  zones: HellZoneInfo[] = [];
  /** point de repli : la plage (on y rembarque) */
  arrival: [number, number];
  readonly ox: number;
  readonly oz: number;
  land: Uint8Array;
  block: Uint8Array;

  constructor(world: World, readonly plan: TownPlan) {
    const p = plan.points, pts: [number, number][] = [p.plage, p.port, p.palais, ...p.remparts];
    const x0 = Math.floor(Math.min(...pts.map((q) => q[0])) - MARGIN), z0 = Math.floor(Math.min(...pts.map((q) => q[1])) - MARGIN);
    const x1 = Math.ceil(Math.max(...pts.map((q) => q[0])) + MARGIN), z1 = Math.ceil(Math.max(...pts.map((q) => q[1])) + MARGIN);
    this.ox = Math.max(0, x0); this.oz = Math.max(0, z0);
    this.W = x1 - this.ox; this.L = z1 - this.oz;
    this.seed = world.seed;
    this.land = new Uint8Array(this.W * this.L);
    this.block = new Uint8Array(this.W * this.L);
    for (let z = 0; z < this.L; z++)
      for (let x = 0; x < this.W; x++) {
        const cx = x + this.ox, cz = z + this.oz;
        // (le quai et la plage sont au bord de l'eau : la terre un peu basse compte, pas la mer)
        this.land[z * this.W + x] = world.inCells(cx, cz) && world.cellAvg(cx, cz) > -0.12 ? 1 : 0;
      }
    // les remparts : chaque côté sans porte bloque ; un côté percé d'une porte laisse passer autour de son milieu
    const wall = plan.wall, n = wall.length;
    for (let i = 0; i < n; i++) {
      const a = wall[i], b = wall[(i + 1) % n], gate = plan.gates[i];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.ceil(len * 3);
      for (let s = 0; s <= steps; s++) {
        const u = s / steps, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
        if (gate !== null && Math.abs(u - 0.5) * len < 1.3) continue;
        const k = this.cell(x - this.ox, z - this.oz);
        if (this.inside(x - this.ox, z - this.oz)) this.block[k] = 1;
      }
    }
    this.arrival = this.local(p.plage);
    // (la plage et les portes restent praticables, quoi qu'il arrive)
    for (const q of [p.plage, p.port, p.palais, ...p.portes]) { const [x, z] = this.local(q); if (this.inside(x, z)) { this.land[this.cell(x, z)] = 1; this.block[this.cell(x, z)] = 0; } }
  }

  /** Coordonnées de la bataille d'un point du monde */
  local(q: [number, number]): [number, number] { return [q[0] - this.ox, q[1] - this.oz]; }
  inside(x: number, z: number) { return x >= 0 && z >= 0 && x < this.W && z < this.L; }
  cell(x: number, z: number) { return Math.floor(z) * this.W + Math.floor(x); }
  walkable(cx: number, cz: number) {
    if (!this.inside(cx, cz)) return false;
    const k = cz * this.W + cx;
    return this.land[k] === 1 && this.block[k] === 0;
  }
  walkableAt(x: number, z: number) { return this.walkable(Math.floor(x), Math.floor(z)); }

  /** Distances (en pas) depuis une case, sur la terre praticable (−1 : hors d'atteinte) */
  distances(from: number) {
    const d = new Int32Array(this.W * this.L).fill(-1), q = [from];
    d[from] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % this.W, z = (c / this.W) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!this.walkable(nx, nz)) continue;
        const k = nz * this.W + nx;
        if (d[k] < 0) { d[k] = d[c] + 1; q.push(k); }
      }
    }
    return d;
  }

  route(from: number, to: number): number[] | null {
    if (from === to) return [to];
    const d = this.distances(to);
    if (d[from] < 0) return null;
    const out: number[] = [];
    let c = from;
    while (c !== to) {
      const x = c % this.W, z = (c / this.W) | 0;
      let next = -1;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!this.inside(nx, nz)) continue;
        const k = nz * this.W + nx;
        if (d[k] >= 0 && d[k] < d[c]) { next = k; break; }
      }
      if (next < 0) return null;
      out.push(next);
      c = next;
    }
    return out;
  }

  nearestWalkable(x: number, z: number, max = 6) {
    const cx = Math.floor(x), cz = Math.floor(z);
    for (let r = 0; r <= max; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.walkable(cx + dx, cz + dz)) return (cz + dz) * this.W + cx + dx;
        }
    return -1;
  }

  lineClear(x0: number, z0: number, x1: number, z1: number) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) * 2);
    for (let i = 1; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      if (this.inside(x, z) && this.block[this.cell(x, z)]) return false;
    }
    return true;
  }

  unblock() { /* (pas de bâtiment au combat) */ }

  /** Une case praticable près d'un point (coordonnées de la bataille) */
  freeNear(x: number, z: number, max = 6): [number, number] {
    const k = this.nearestWalkable(x, z, max);
    return k < 0 ? [x, z] : [(k % this.W) + 0.5, Math.floor(k / this.W) + 0.5];
  }
}

/** L'armée débarquée : ses sortes, selon l'âge (le chevalier remplace le soldat dès qu'il existe) */
export function armyOf(age: number): TroopKind[] {
  const melee: TroopKind = age >= 2 ? 'knight' : 'soldier';
  return [...Array(ARMY[0]).fill(melee), ...Array(ARMY[1]).fill('archer')];
}

/** Les défenseurs d'un objectif : soldats et archers du peuple rival, à l'âge du village */
export function guardsOf(goal: BattleGoal, age: number): { kind: 'soldier' | 'archer'; stats: UnitStats }[] {
  const [s, a] = GUARDS[goal], scale = (st: UnitStats): UnitStats => ({ ...st, hp: Math.round(st.hp * GUARD_K), dmg: Math.round(st.dmg * GUARD_K * 10) / 10 });
  // (le palais est tenu par la garde : des soldats d'élite, plus coriaces)
  const melee = goal === 'palais' && age >= 2 ? troopStats('knight', age) : troopStats('soldier', age);
  return [...Array(s).fill(0).map(() => ({ kind: 'soldier' as const, stats: scale(melee) })), ...Array(a).fill(0).map(() => ({ kind: 'archer' as const, stats: scale(troopStats('archer', age)) }))];
}

export type BattleOutcome = 'won' | 'lost';
export type BattleNews = { type: 'goal'; goal: BattleGoal; next: BattleGoal | null } | { type: 'end'; outcome: BattleOutcome };

export class RivalBattle {
  map: RivalMap;
  sim: Hell;
  /** l'objectif en cours (indice dans `GOALS`) ; 4 : tous pris */
  goal = 0;
  outcome: BattleOutcome | null = null;
  /** défenseurs de chaque objectif */
  guards = new Map<BattleGoal, number[]>();
  /** nos troupes */
  army: number[] = [];
  /** temps de bataille (s de jeu) */
  t = 0;
  news: BattleNews[] = [];
  readonly people: People;

  constructor(world: World, rival: People, readonly age: number, easy = false, troops: TroopKind[] = armyOf(age)) {
    const plan = townPlans(world).find((p) => p.people === rival);
    if (!plan) throw new Error('pas de ville rivale');
    this.people = rival;
    this.map = new RivalMap(world, plan);
    this.sim = new Hell(this.map, world.seed, easy ? BALANCE_EASY : BALANCE_NORMAL);
    this.sim.units.clear();
    this.sim.buildings.clear();
    const pts = plan.points;
    // nos troupes : sur la plage, en grappe
    const [bx, bz] = this.map.local(pts.plage);
    troops.forEach((k, i) => {
      const a = i * 2.4, r = 0.8 + (i % 5) * 0.5;
      const [x, z] = this.map.freeNear(bx + Math.sin(a) * r, bz + Math.cos(a) * r, 5);
      this.army.push(this.sim.addPlayerUnit(k, troopStats(k, age), x, z).id);
    });
    this.sim.rally = [bx, bz];
    // les défenseurs : postés à chaque objectif (la plage : un peu en retrait, sur la terre)
    const at: Record<BattleGoal, [number, number]> = {
      plage: this.inland(pts.plage, plan, 5), remparts: this.map.local(pts.portes[0] ?? pts.remparts[0]), port: this.map.local(pts.port), palais: this.map.local(pts.palais),
    };
    for (const g of GOALS) {
      const ids: number[] = [];
      guardsOf(g, age).forEach((d, i) => {
        const a = i * 2.1, r = 0.6 + (i % 4) * 0.7;
        const [x, z] = this.map.freeNear(at[g][0] + Math.sin(a) * r, at[g][1] + Math.cos(a) * r, 5);
        // (un garde : il tient son poste et accourt à l'alerte, sans poursuivre au-delà de sa laisse ; zone 0 : pas de renfort)
        const u = this.sim.addRaider(d.kind as unknown as DemonKind, d.stats, x, z);
        u.zone = 0; u.state = 'guard'; u.home = [x, z];
        ids.push(u.id);
      });
      this.guards.set(g, ids);
    }
    this.goalAt = at;
  }

  /** où se tient chaque objectif (coordonnées de la bataille) */
  goalAt: Record<BattleGoal, [number, number]>;

  /** Un point à quelques cases de la mer vers l'intérieur (vers le centre de la ville) */
  private inland(q: [number, number], plan: TownPlan, d: number): [number, number] {
    const dx = plan.x - q[0], dz = plan.z - q[1], l = Math.hypot(dx, dz) || 1;
    return this.map.local([q[0] + (dx / l) * d, q[1] + (dz / l) * d]);
  }

  /** L'objectif en cours (null : la ville est prise) */
  get current(): BattleGoal | null { return GOALS[this.goal] ?? null; }

  /** Nos troupes encore debout */
  troops(): HellUnit[] { return this.army.map((id) => this.sim.units.get(id)).filter((u): u is HellUnit => !!u && u.hp > 0); }
  /** Les défenseurs encore debout d'un objectif */
  defenders(g: BattleGoal): HellUnit[] { return (this.guards.get(g) ?? []).map((id) => this.sim.units.get(id)).filter((u): u is HellUnit => !!u && u.hp > 0); }

  /**
   * Un pas de bataille : le combat, puis l'objectif (pris quand ses défenseurs sont tombés et qu'une troupe l'atteint), puis
   * l'issue (gagnée quand le palais est pris ; perdue quand nos troupes sont toutes tombées, ou au bout de `BATTLE_LIMIT`).
   * `auto` : les troupes sans ordre marchent sur l'objectif en cours (attaque d'un point : elles combattent en route)
   */
  step(dt: number, auto = true) {
    if (this.outcome || dt <= 0) return;
    this.t += dt;
    const g = this.current;
    if (auto && g) {
      const [gx, gz] = this.goalAt[g];
      const idle = this.troops().filter((u) => !u.order && u.target === null);
      if (idle.length) this.sim.order(idle.map((u) => u.id), { kind: 'attack', x: gx, z: gz });
    }
    this.sim.step(dt);
    if (g && !this.defenders(g).length) {
      const [gx, gz] = this.goalAt[g];
      if (this.troops().some((u) => Math.hypot(u.x - gx, u.z - gz) < TAKE_R)) {
        this.goal++;
        this.news.push({ type: 'goal', goal: g, next: this.current });
        if (!this.current) { this.outcome = 'won'; this.news.push({ type: 'end', outcome: 'won' }); return; }
        // l'objectif suivant : toutes les troupes y marchent (le joueur peut les commander autrement)
        if (auto) { const [nx, nz] = this.goalAt[this.current]; this.sim.order(this.troops().map((u) => u.id), { kind: 'attack', x: nx, z: nz }); }
      }
    }
    if (!this.troops().length || this.t >= BATTLE_LIMIT) { this.outcome = 'lost'; this.news.push({ type: 'end', outcome: 'lost' }); }
  }

  /** Coordonnées du monde d'un point de la bataille */
  toWorld(x: number, z: number): [number, number] { return [x + this.map.ox, z + this.map.oz]; }
}
