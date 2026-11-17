import type { World } from '../world/world';
import type { HellZoneInfo } from '../world/hell';
import type { People } from '../world/archipelago';
import { townPlans, TownPlan } from '../world/rivalTown';
import { CombatMap, Hell, HellUnit, HellBuilding, DemonKind, UnitStats } from './hell';
import { BALANCE_EASY, BALANCE_NORMAL, powerOf } from './hellBalance';
import { troopStats, TroopKind } from './army';
import { defenseK } from './isleBattle';
import type { Intel } from './diplomacy';

/**
 * La bataille de l'archipel (la voie de la guerre, au Médiéval), « façon gouffre de Helm » (demande de l'auteur) : épique
 * avant d'être dure, jamais perdue d'office. Nos troupes et la première vague de l'allié débarquent sur la plage rivale
 * repérée par les éclaireurs, prennent la plage (une contre-attaque sort de la ville), le port, puis les remparts : la porte
 * principale tient tant qu'on ne l'a pas enfoncée (ou contournée par une brèche), des vagues de renfort sortent du palais, et
 * au moment de bascule le gros de l'allié débarque en renfort. Enfin l'assaut du palais et de son chef : quand il tombe, la
 * ville se rend. Entre les phases, deux choix tactiques. Même moteur de combat que l'île du portail et les Enfers (`Hell`),
 * sur une carte taillée autour de la ville rivale (`RivalMap`). Simulation pure : la vue (`BattleLayer`) la montre, le joueur
 * commande ses troupes ; l'allié est piloté par l'ordinateur ; sans ordre, nos troupes marchent sur l'objectif en cours
 */

/** Les objectifs, dans l'ordre : la plage, le port (hors les murs, au bout de la route de la porte), les remparts, le palais */
export type BattleGoal = 'plage' | 'port' | 'remparts' | 'palais';
export const GOALS: BattleGoal[] = ['plage', 'port', 'remparts', 'palais'];
/** Un objectif est pris quand ses défenseurs sont tombés et qu'une de nos troupes (ou de l'allié) est à moins de `TAKE_R` cases */
export const TAKE_R = 4;
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
        // (les portes sont fermées aussi : la principale par son bâtiment au combat, qu'on enfonce ; les autres barrées)
        const k = this.cell(x - this.ox, z - this.oz);
        if (!this.inside(x - this.ox, z - this.oz)) continue;
        this.block[k] = 1;
        if (gate !== null && Math.abs(u - 0.5) * len < 1.3) this.gateCells.push(k);
      }
    }
    this.arrival = this.local(p.plage);
    // (la plage, le port et le palais restent praticables, quoi qu'il arrive)
    for (const q of [p.plage, p.port, p.palais]) { const [x, z] = this.local(q); if (this.inside(x, z)) { this.land[this.cell(x, z)] = 1; this.block[this.cell(x, z)] = 0; } }
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

  /** cases des portes (fermées) */
  private gateCells: number[] = [];

  /**
   * Les cases qu'on atteint à pied depuis `from`, portes comprises (−1 : hors d'atteinte) : les objectifs s'y posent (un quai
   * sur l'eau, un palais derrière un ruisseau ne doivent pas rester hors de portée)
   */
  reach(from: [number, number]) {
    const keep = this.gateCells.map((k) => this.block[k]);
    for (const k of this.gateCells) this.block[k] = 0;
    const d = this.distances(this.nearestWalkable(from[0], from[1], 8));
    this.gateCells.forEach((k, i) => (this.block[k] = keep[i]));
    return d;
  }
  /** Le point atteignable le plus proche de `p` (dans `max` cases), d'après `reach` */
  snap(p: [number, number], reach: Int32Array, max = 12): [number, number] {
    let best: [number, number] = p, bd = Infinity;
    for (let dz = -max; dz <= max; dz++) for (let dx = -max; dx <= max; dx++) {
      const x = Math.floor(p[0]) + dx, z = Math.floor(p[1]) + dz, d = Math.hypot(dx, dz);
      if (d < bd && this.inside(x, z) && reach[z * this.W + x] >= 0) { bd = d; best = [x + 0.5, z + 0.5]; }
    }
    return best;
  }

  /** Une emprise abattue (la porte enfoncée) : ses cases de porte s'ouvrent, autour du bâtiment */
  unblock(site: { x: number; z: number; r: number }) {
    for (const k of this.gateCells) {
      const x = (k % this.W) + 0.5, z = Math.floor(k / this.W) + 0.5;
      if (Math.hypot(x - site.x, z - site.z) < site.r + 1.6) this.block[k] = 0;
    }
    this.version++;
  }

  /**
   * Une brèche (choix tactique « escalader ») : au milieu du côté de rempart sans porte le plus proche de `from`, trois
   * cases de large s'ouvrent
   */
  breach(plan: TownPlan, from: [number, number]) {
    const wall = plan.wall, n = wall.length;
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (plan.gates[i] !== null) continue;
      const a = this.local(wall[i]), b = this.local(wall[(i + 1) % n]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, d = Math.hypot(mx - from[0], mz - from[1]);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) return null;
    const a = this.local(wall[best]), b = this.local(wall[(best + 1) % n]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = mx + dx, z = mz + dz;
      if (Math.hypot(dx, dz) <= 1.8 && this.inside(x, z)) this.block[this.cell(x, z)] = 0;
    }
    this.version++;
    return [mx, mz] as [number, number];
  }

  /** Une case praticable près d'un point (coordonnées de la bataille) */
  freeNear(x: number, z: number, max = 6): [number, number] {
    const k = this.nearestWalkable(x, z, max);
    return k < 0 ? [x, z] : [(k % this.W) + 0.5, Math.floor(k / this.W) + 0.5];
  }
}

/**
 * Les effectifs (demande de l'auteur : 25 contre 25 contre 45, renforts compris) : nos 25 (15 chevaliers ou soldats, 10
 * archers) ; l'allié 25 (10 au débarquement, 15 en renfort au moment de bascule) ; l'ennemi 45, réparti par groupe
 */
export const OURS: [number, number] = [15, 10];
export const ALLY_FIRST: [number, number] = [6, 4];
export const ALLY_RELIEF: [number, number] = [9, 6];
/** Les groupes ennemis (soldats, archers) ; le chef s'ajoute au palais (45 en tout) */
export const FOES = {
  plage: [5, 3], contre: [4, 2], port: [3, 2], remparts: [5, 3], vague: [2, 2], palais: [6, 3],
} as const satisfies Record<string, readonly [number, number]>;
/** Vagues de renfort rivales pendant l'assaut des remparts (`FOES.vague` chacune), et leur écart (s de jeu) */
export const WAVES = 2;
/**
 * Les défenseurs : leur force (`powerOf` : √(vie × dégâts / cadence)) est tenue à une part de celle de nos troupes du même
 * âge, fantassin contre fantassin, archer contre archer, quels que soient leurs modèles (à l'Industriel, leurs soldats ont
 * des fusils) : la bataille garde la même allure à tous les âges. Ils frappent moins fort (`GUARD_DMG`) et durent davantage
 * (la vie fait le reste) : épique avant d'être dur, la bataille dure, nos pertes restent du spectacle
 */
export const FOE_MELEE = 0.62, FOE_ARCHER = 0.85, GUARD_HP = 1.2;
/**
 * Aux âges modernes, tout le monde tire de loin et les défenseurs, abrités derrière les remparts, en profitent : leur force
 * baisse d'autant (par âge ; la guerre se joue au Médiéval, ces âges ne viennent qu'au bac à sable)
 */
export const FOE_AGE = [1, 1, 1, 1, 0.8, 0.7];
/** Le chef rival : un fantassin rival (`foeOf`) dont la vie et les dégâts sont multipliés */
export const CHIEF_HP = 30, CHIEF_DMG = 1;
/** Notre débarquement, en trois barques (combien chacune, et leur écart en s) ; la première vague de l'allié, à ce temps */
export const BOATS = [9, 8, 8], BOAT_EVERY = 25, ALLY_LANDS = 45;
/** La contre-attaque sort de la ville quand la plage faiblit (passé `COUNTER_T` s), au plus tard à `COUNTER_MAX` */
export const COUNTER_T = 50, COUNTER_MAX = 80;
/**
 * La porte principale : elle tient environ `GATE_T` secondes sous les coups de `GATE_MEN` de nos fantassins de l'âge (sa vie
 * suit leurs dégâts par seconde, à tous les âges) ; le bélier, les éclaireurs (porte faible) l'entament d'avance.
 * (260 s jusqu'au 17 nov. 2026 : l'auteur la trouvait « trop tanky », on piétinait devant)
 */
export const GATE_T = 120, GATE_MEN = 10, RAM_K = 0.65, WEAK_GATE_K = 0.7;
/** Les vagues de renfort : leur temps dans l'assaut des remparts (s) */
export const WAVE_AT = [20, 65];
/** L'allié arrive en renfort à ce temps (s) de l'assaut des remparts, ou plus tôt si nos forces fondent de moitié */
export const RELIEF_T = 90;
/** Le bombardement de la flotte alliée (choix tactique) : durée (s), un boulet toutes les `SHOT_EVERY` s, part de la vie retirée */
export const BOMBARD_T = 30, SHOT_EVERY = 2.5, SHOT_K = 0.45, SHOT_GATE = 0.04;
/** Regrouper et soigner (choix tactique) : durée (s), part des blessures refermées */
export const REGROUP_T = 30, REGROUP_HEAL = 0.6;
/** Une bataille qui traîne (une unité coincée) : au bout de ce temps (s de jeu), elle compte pour perdue (retraite) */
export const BATTLE_LIMIT = 1500;

/** Les choix tactiques : après la plage (contre les remparts), puis après le port (pour l'assaut final) */
export type Tactic1 = 'ram' | 'climb' | 'bombard';
export type Tactic2 = 'charge' | 'regroup' | 'allyLead';
export const TACTICS1: Tactic1[] = ['ram', 'climb', 'bombard'];
export const TACTICS2: Tactic2[] = ['charge', 'regroup', 'allyLead'];

export type BattleOutcome = 'won' | 'lost';
export type BattleNews =
  | { type: 'goal'; goal: BattleGoal; next: BattleGoal | null }
  /** un choix tactique attend le joueur (la bataille est suspendue jusqu'à `choose`) */
  | { type: 'choice'; step: 1 | 2 }
  | { type: 'boat'; n: number } | { type: 'allyLands' }
  | { type: 'counter' } | { type: 'wave'; n: number } | { type: 'relief' } | { type: 'gate' } | { type: 'breach' }
  | { type: 'bombard' } | { type: 'cry' } | { type: 'surrender' }
  | { type: 'end'; outcome: BattleOutcome };

/**
 * Un défenseur rival à cet âge : un soldat (ou un archer) de l'âge, frappant à `GUARD_DMG`, dont la vie est réglée pour que
 * sa force vaille `FOE_MELEE` (ou `FOE_ARCHER`) de celle de notre troupe correspondante (chevalier ou soldat, archer)
 */
export function foeOf(kind: 'soldier' | 'archer', age: number): UnitStats {
  // (même forme que notre troupe : portée, cadence, allure ; un soldat de l'Industriel porterait sinon un fusil contre nos épées)
  const ours = troopStats(kind === 'archer' ? 'archer' : age >= 2 ? 'knight' : 'soldier', age), base = ours;
  const want = powerOf(ours) * (kind === 'archer' ? FOE_ARCHER : FOE_MELEE) * (FOE_AGE[age] ?? 1), hp = Math.round(base.hp * GUARD_HP);
  // power = √(vie × dégâts / cadence) : la vie fixée (coriaces), les dégâts qui donnent la force voulue (ils frappent moins fort)
  const dmg = Math.round(((want * want * base.cooldown) / hp) * 10) / 10;
  return { ...base, hp, dmg };
}

/** L'armée débarquée : ses sortes, selon l'âge (le chevalier remplace le soldat dès qu'il existe) */
export function armyOf(age: number): TroopKind[] {
  const melee: TroopKind = age >= 2 ? 'knight' : 'soldier';
  return [...Array(OURS[0]).fill(melee), ...Array(OURS[1]).fill('archer')];
}
/** Nombre d'ennemis de toute la bataille (renforts et chef compris) */
export const FOE_TOTAL = Object.entries(FOES).reduce((n, [k, [s, a]]) => n + (s + a) * (k === 'vague' ? WAVES : 1), 0) + 1;

export class RivalBattle {
  map: RivalMap;
  sim: Hell;
  /** l'objectif en cours (indice dans `GOALS`) ; 4 : tous pris */
  goal = 0;
  outcome: BattleOutcome | null = null;
  /** les groupes ennemis (vivants ou morts), par nom */
  foes = new Map<string, number[]>();
  /** nos troupes, et celles de l'allié (pilotées par l'ordinateur) */
  army: number[] = [];
  allies: number[] = [];
  /** le chef rival */
  chief = -1;
  /** la porte principale (bâtiment au combat) */
  gate: HellBuilding | null = null;
  /** temps de bataille (s de jeu), et depuis le début de la phase en cours */
  t = 0;
  phaseT = 0;
  news: BattleNews[] = [];
  /** un choix attend (`choose`) : la bataille ne court pas */
  waiting: 1 | 2 | null = null;
  tactic1: Tactic1 | null = null;
  tactic2: Tactic2 | null = null;
  /** ce qui reste à jouer : la contre-attaque, les vagues, le renfort allié, le cri du chef */
  private countered = false;
  private wavesSent = 0;
  private relief = false;
  private cried = false;
  /** bombardement ou regroupement en cours (s restantes) ; prochain boulet */
  hold = 0;
  private shotT = 0;
  /** l'allié ouvre la voie : nos troupes partent après lui */
  private allyFirst = 0;
  readonly people: People;
  readonly ally: People;
  private plan: TownPlan;
  /** où se tient chaque objectif (coordonnées de la bataille) */
  goalAt: Record<BattleGoal, [number, number]>;
  /** où mouille la flotte alliée (au large du port) ; devant la porte, dehors (d'où sort la contre-attaque) */
  private sea: [number, number];
  private outside: [number, number] = [0, 0];
  /** ce qu'on atteint à pied depuis la plage, portes ouvertes (voir `RivalMap.reach`) */
  private reach: Int32Array = new Int32Array(0);
  private reachOut: Int32Array = new Int32Array(0);
  /** Une case praticable près d'un point, qu'on atteint depuis la plage */
  private spot(x: number, z: number, outside = false): [number, number] {
    const [fx, fz] = this.map.freeNear(x, z, 5), r = outside ? this.reachOut : this.reach;
    return r.length && r[this.map.cell(fx, fz)] < 0 ? this.map.snap([fx, fz], r) : [fx, fz];
  }

  /**
   * `intel` : ce que les éclaireurs ont appris (la plage moins gardée, les renforts plus tardifs, la porte affaiblie, le
   * chef moins coriace) ; `troops` : notre armée (par défaut celle de l'âge)
   */
  constructor(world: World, rival: People, readonly age: number, easy = false, troops: TroopKind[] = armyOf(age), readonly intel: Intel[] = []) {
    const plan = townPlans(world).find((p) => p.people === rival);
    if (!plan) throw new Error('pas de ville rivale');
    this.plan = plan;
    this.people = rival;
    this.ally = rival === 'orient' ? 'asie' : 'orient';
    this.map = new RivalMap(world, plan);
    this.sim = new Hell(this.map, world.seed, easy ? BALANCE_EASY : BALANCE_NORMAL);
    this.sim.units.clear();
    this.sim.buildings.clear();
    const pts = plan.points, beach = this.map.local(pts.plage), gate = this.map.local(pts.portes[0] ?? pts.remparts[0]);
    // (chaque objectif posé sur ce qu'on atteint à pied depuis la plage, portes ouvertes : un quai sur l'eau n'est pas un but)
    const reach = this.map.reach(beach), snap = (q: [number, number]) => this.map.snap(q, reach);
    // (hors les murs : ce qu'on atteint portes fermées ; la contre-attaque et le port y sont, sinon ils resteraient enfermés)
    const out = this.map.distances(this.map.nearestWalkable(beach[0], beach[1], 8)), snapOut = (q: [number, number]) => this.map.snap(q, out);
    this.reach = reach; this.reachOut = out;
    const inside = snap(this.toward(gate, this.map.local([plan.x, plan.z]), 2.2));
    this.goalAt = { plage: snapOut(this.inland(pts.plage, 5)), port: snapOut(this.map.local(pts.port)), remparts: inside, palais: snap(this.map.local(pts.palais)) };
    this.outside = snapOut(this.toward(gate, beach, 2.5));
    this.sea = this.toward(this.map.local(pts.port), this.map.local([plan.x, plan.z]), -6);
    // nos troupes débarquent en trois barques (la première tout de suite) ; l'allié les suit (sa première vague)
    this.beach = beach;
    this.boats = troops.slice();
    this.landBoat();
    this.sim.rally = beach;
    // la porte principale : un bâtiment au combat, qui bouche le passage tant qu'il tient
    const melee = troopStats(age >= 2 ? 'knight' : 'soldier', age), gateHp = GATE_T * GATE_MEN * (melee.dmg / melee.cooldown) * (intel.includes('scoutGate') ? WEAK_GATE_K : 1);
    this.gate = this.sim.addPlayerBuilding('gate', gate[0], gate[1], 1.1, 1, gateHp / 300);
    this.gate.side = 'hell';
    // les défenseurs : la plage (un peu en retrait), le port, les remparts (derrière la porte), le palais et le chef
    const beachFoes: [number, number] = intel.includes('scoutBeach') ? [FOES.plage[0] - 2, FOES.plage[1] - 1] : [...FOES.plage];
    this.post('plage', beachFoes, this.goalAt.plage, true);
    this.post('port', FOES.port, this.goalAt.port, true);
    this.post('remparts', FOES.remparts, inside);
    this.post('palais', FOES.palais, this.goalAt.palais);
    const cs = foeOf('soldier', age), ck = intel.includes('scoutChief') ? 0.75 : 1;
    const [cx, cz] = this.spot(this.goalAt.palais[0], this.goalAt.palais[1]);
    const chief = this.sim.addRaider('warlord' as unknown as DemonKind, { ...cs, hp: Math.round(cs.hp * CHIEF_HP * ck), dmg: Math.round(cs.dmg * CHIEF_DMG * 10) / 10, radius: cs.radius * 1.4 }, cx, cz);
    chief.zone = 0; chief.state = 'guard'; chief.home = [cx, cz];
    this.chief = chief.id;
    this.foes.get('palais')!.push(chief.id);
  }

  /** Un point à `d` cases de `a` vers `b` (négatif : à l'opposé) */
  private toward(a: [number, number], b: [number, number], d: number): [number, number] {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    return this.map.freeNear(a[0] + (dx / l) * d, a[1] + (dz / l) * d, 4);
  }
  /** Un point à quelques cases de la mer vers l'intérieur (vers le centre de la ville) */
  private inland(q: [number, number], d: number): [number, number] {
    return this.toward(this.map.local(q), this.map.local([this.plan.x, this.plan.z]), d);
  }
  /** la plage ; nos troupes encore en mer (les barques suivantes), la barque suivante, la première vague de l'allié */
  private beach: [number, number] = [0, 0];
  private boats: TroopKind[] = [];
  private boatN = 0;
  private allyLanded = false;
  /** Une barque de nos troupes accoste */
  private landBoat() {
    const n = BOATS[this.boatN] ?? this.boats.length, start = this.army.length;
    this.boats.splice(0, n).forEach((k, i) => this.army.push(this.landUnit(k, troopStats(k, this.age), this.beach, start + i).id));
    this.boatN++;
    if (this.boatN > 1) this.news.push({ type: 'boat', n: this.boatN });
  }

  /** Une troupe débarquée (nous ou l'allié) près d'un point, en grappe */
  private landUnit(kind: string, stats: UnitStats, at: [number, number], i: number) {
    const a = i * 2.4, r = 0.8 + (i % 6) * 0.45 + Math.floor(i / 12) * 0.5;
    const [x, z] = this.map.freeNear(at[0] + Math.sin(a) * r, at[1] + Math.cos(a) * r, 6);
    return this.sim.addPlayerUnit(kind, stats, x, z);
  }
  /** Une vague de l'allié (ses sortes ont le préfixe `ally:` : la barre ne les commande pas, la vue leur met ses couleurs) */
  private landAllies([s, a]: readonly [number, number], at: [number, number]) {
    const melee: TroopKind = this.age >= 2 ? 'knight' : 'soldier';
    [...Array(s).fill(melee), ...Array(a).fill('archer')].forEach((k: TroopKind, i) => this.allies.push(this.landUnit(`ally:${k}`, troopStats(k, this.age), at, i + 7).id));
  }
  /** Un groupe ennemi, gardes à leur poste (zone 0 : alerte, laisse, pas de renfort du moteur) */
  private post(name: string, [s, a]: readonly [number, number], at: [number, number], outside = false) {
    const ids = this.foes.get(name) ?? [];
    this.foeStats(s, a).forEach((d, i) => {
      const ang = i * 2.1, r = 0.6 + (i % 4) * 0.7;
      const [x, z] = this.spot(at[0] + Math.sin(ang) * r, at[1] + Math.cos(ang) * r, outside);
      const u = this.sim.addRaider(d.kind as unknown as DemonKind, d.stats, x, z);
      u.zone = 0; u.state = 'guard'; u.home = [x, z];
      ids.push(u.id);
    });
    this.foes.set(name, ids);
  }
  /** Un groupe ennemi qui charge (contre-attaque, vague de renfort) : il fond sur nos troupes, d'où qu'il parte */
  private charge(name: string, [s, a]: readonly [number, number], at: [number, number]) {
    const ids = this.foes.get(name) ?? [];
    this.foeStats(s, a).forEach((d, i) => {
      const [x, z] = this.spot(at[0] + (i % 3) * 0.6, at[1] + Math.floor(i / 3) * 0.6, name === 'contre');
      ids.push(this.sim.addRaider(d.kind as unknown as DemonKind, d.stats, x, z).id);
    });
    this.foes.set(name, ids);
  }
  private foeStats(s: number, a: number): { kind: 'soldier' | 'archer'; stats: UnitStats }[] {
    const melee = foeOf('soldier', this.age), arch = foeOf('archer', this.age);
    return [...Array(s).fill(0).map(() => ({ kind: 'soldier' as const, stats: melee })), ...Array(a).fill(0).map(() => ({ kind: 'archer' as const, stats: arch }))];
  }

  /** L'objectif en cours (null : la ville est prise) */
  get current(): BattleGoal | null { return GOALS[this.goal] ?? null; }
  /** Nos troupes encore debout */
  troops(): HellUnit[] { return this.alive(this.army); }
  /** Les troupes alliées encore debout */
  allied(): HellUnit[] { return this.alive(this.allies); }
  /** Les ennemis encore debout d'un groupe (ou de tous) */
  enemies(name?: string): HellUnit[] { return name ? this.alive(this.foes.get(name) ?? []) : this.sim.alive('hell'); }
  /** Les défenseurs encore debout d'un objectif (avec ses renforts) */
  defenders(g: BattleGoal): HellUnit[] {
    const groups: Record<BattleGoal, string[]> = { plage: ['plage', 'contre'], port: ['port'], remparts: ['remparts', 'vague'], palais: ['palais'] };
    // (un défenseur qu'on ne peut pas atteindre, coincé par le relief, ne retient pas l'objectif)
    const r = g === 'plage' || g === 'port' ? this.reachOut : this.reach;
    return groups[g].flatMap((n) => this.enemies(n)).filter((u) => !r.length || r[this.map.cell(u.x, u.z)] >= 0);
  }
  private alive(ids: number[]) { return ids.map((id) => this.sim.units.get(id)).filter((u): u is HellUnit => !!u && u.hp > 0); }

  /** Le joueur (ou les tests) fait le choix tactique en attente */
  choose(c: Tactic1 | Tactic2) {
    if (this.waiting === 1 && (TACTICS1 as string[]).includes(c)) {
      this.tactic1 = c as Tactic1;
      if (c === 'climb') { this.map.breach(this.plan, this.map.local(this.plan.points.port)); this.news.push({ type: 'breach' }); }
      if (c === 'ram' && this.gate) { this.gate.hp = Math.round(this.gate.hp * RAM_K); }
      if (c === 'bombard') { this.hold = BOMBARD_T; this.shotT = 0; this.news.push({ type: 'bombard' }); }
    } else if (this.waiting === 2 && (TACTICS2 as string[]).includes(c)) {
      this.tactic2 = c as Tactic2;
      if (c === 'regroup') this.hold = REGROUP_T;
      if (c === 'allyLead') this.allyFirst = 15;
    } else return false;
    this.waiting = null;
    this.phaseT = 0;
    return true;
  }

  /**
   * Un pas de bataille. Les choix en attente suspendent tout (`pick` : les tests prennent le premier choix ; le jeu attend
   * celui du joueur). Puis : les ordres de l'ordinateur (l'allié marche toujours sur l'objectif ; nos troupes sans ordre aussi), les
   * moments de la bataille (contre-attaque, vagues, renfort allié, bombardement, cri du chef), le combat, les objectifs, l'issue
   */
  step(dt: number, auto = true, pick = auto) {
    if (this.outcome || dt <= 0) return;
    if (this.waiting) { if (pick) this.choose(this.waiting === 1 ? TACTICS1[0] : TACTICS2[0]); else return; }
    this.t += dt; this.phaseT += dt;
    const g = this.current;
    this.moments(dt);
    // en tenue (bombardement, regroupement) : on tient la plage ou le port, sans avancer
    if (g && this.hold <= 0) {
      const target = g === 'remparts' && this.gate && !this.gate.down && this.tactic1 !== 'climb' ? null : this.goalAt[g];
      const [gx, gz] = target ?? [this.gate!.site.x, this.gate!.site.z];
      const go = (us: HellUnit[]) => {
        const idle = us.filter((u) => !u.order && u.target === null);
        if (!idle.length) return;
        // (la porte : les fantassins la frappent ; les tireurs, eux, répondent aux défenseurs des remparts en marchant sur elle ;
        // sinon on marche sur le point en combattant ce qu'on croise)
        if (!target && this.gate) {
          const archer = (u: HellUnit) => u.kind === 'archer' || u.kind === 'ally:archer';
          const melee = idle.filter((u) => !archer(u)), shoot = idle.filter(archer);
          if (melee.length) this.sim.order(melee.map((u) => u.id), { kind: 'attack', target: this.gate.id, x: gx, z: gz });
          if (shoot.length) this.sim.order(shoot.map((u) => u.id), { kind: 'attack', x: this.outside[0], z: this.outside[1] });
        } else this.sim.order(idle.map((u) => u.id), { kind: 'attack', x: gx, z: gz });
      };
      go(this.allied());
      if (auto && this.allyFirst <= 0) go(this.troops());
    }
    this.sim.step(dt);
    if (this.gate && this.gate.down && !this.gateSaid) { this.gateSaid = true; this.news.push({ type: 'gate' }); }
    // l'objectif : ses défenseurs tombés, et l'un des nôtres (ou de l'allié) sur place
    if (g && !this.defenders(g).length && (g !== 'plage' || this.countered)) {
      const [gx, gz] = this.goalAt[g], near = [...this.troops(), ...this.allied()].some((u) => Math.hypot(u.x - gx, u.z - gz) < TAKE_R);
      if (near || (g === 'remparts' && this.gate?.down)) this.take(g, auto);
    }
    if (this.outcome) return;
    // (perdue seulement quand plus personne ne tient, ni nous ni l'allié, et que plus rien n'est à débarquer)
    const landing = this.boats.length > 0 || !this.allyLanded || (!this.relief && this.current !== 'plage');
    if ((!this.troops().length && !this.allied().length && !landing) || this.t >= BATTLE_LIMIT) this.end('lost');
  }
  private gateSaid = false;

  /** Un objectif pris : le suivant, et les choix tactiques entre les phases */
  private take(g: BattleGoal, auto: boolean) {
    this.goal++;
    this.phaseT = 0;
    this.news.push({ type: 'goal', goal: g, next: this.current });
    if (!this.current) { this.end('won'); return; }
    if (g === 'plage') { this.waiting = 1; this.news.push({ type: 'choice', step: 1 }); }
    else if (g === 'remparts') { this.waiting = 2; this.news.push({ type: 'choice', step: 2 }); }
    // l'objectif suivant : tout le monde y marche (le joueur peut commander les siens autrement)
    const [nx, nz] = this.goalAt[this.current];
    this.sim.order(this.allied().map((u) => u.id), { kind: 'attack', x: nx, z: nz });
    if (auto) this.sim.order(this.troops().map((u) => u.id), { kind: 'attack', x: nx, z: nz });
  }

  /** Les moments de la bataille, au fil du temps */
  private moments(dt: number) {
    const g = this.current;
    // les barques suivantes, puis la première vague de l'allié
    if (this.boats.length && this.t >= this.boatN * BOAT_EVERY) this.landBoat();
    if (!this.allyLanded && this.t >= ALLY_LANDS) { this.allyLanded = true; this.landAllies(ALLY_FIRST, this.beach); this.news.push({ type: 'allyLands' }); }
    // la contre-attaque : elle sort de la ville vers la plage (quand la plage faiblit, passé `COUNTER_T`, au plus tard `COUNTER_MAX`)
    if (g === 'plage' && !this.countered && ((this.t >= COUNTER_T && this.enemies('plage').length <= 3) || this.t >= COUNTER_MAX)) {
      this.countered = true;
      this.charge('contre', FOES.contre, this.outside);
      this.news.push({ type: 'counter' });
    }
    // les vagues de renfort : du palais vers les remparts, pendant leur assaut (plus tard si les éclaireurs ont compté la relève)
    const late = this.intel.includes('scoutGarrison') ? 25 : 0;
    if (g === 'remparts' && this.wavesSent < WAVES && this.phaseT >= late + WAVE_AT[this.wavesSent]) {
      this.wavesSent++;
      this.charge('vague', FOES.vague, this.goalAt.palais);
      this.news.push({ type: 'wave', n: this.wavesSent });
    }
    // le renfort allié : au moment de bascule (au plus tard `RELIEF_T` s dans l'assaut des remparts, ou quand nos forces fondent)
    const landed = this.army.length + this.allies.length, standing = this.troops().length + this.allied().length;
    if (!this.relief && g && g !== 'plage' && ((g === 'remparts' && this.phaseT >= RELIEF_T) || standing < landed * 0.5 || g === 'palais')) {
      this.relief = true;
      this.landAllies(ALLY_RELIEF, this.map.local(this.plan.points.plage));
      this.news.push({ type: 'relief' });
    }
    // le bombardement de la flotte alliée : des boulets depuis le large sur la porte et ses défenseurs
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.tactic1 === 'bombard' && g === 'port' || (this.tactic1 === 'bombard' && g === 'remparts')) {
        this.shotT -= dt;
        if (this.shotT <= 0) {
          this.shotT = SHOT_EVERY;
          const tg = [...this.enemies('remparts'), ...this.enemies('port')];
          const t = tg[Math.floor(this.t * 7.3) % Math.max(1, tg.length)];
          if (t) { this.sim.events.push({ type: 'shot', x0: this.sea[0], z0: this.sea[1], y0: 1.2, x1: t.x, z1: t.z, source: -1, target: t.id, fire: true }); this.sim.damage(t, t.maxHp * SHOT_K, -1, true); }
          if (this.gate && !this.gate.down) this.sim.damage(this.gate, this.gate.maxHp * SHOT_GATE, -1, true);
        }
      }
      // regrouper et soigner : les blessures se referment
      if (this.tactic2 === 'regroup' && g === 'palais') for (const u of [...this.troops(), ...this.allied()]) u.hp = Math.min(u.maxHp, u.hp + (u.maxHp - u.hp) * REGROUP_HEAL * (dt / REGROUP_T) * 3);
    }
    if (this.allyFirst > 0) this.allyFirst -= dt;
    // le chef rival : à mi-vie, son cri rallie ses gardes (ils se ruent) ; tombé, la ville se rend
    const chief = this.sim.units.get(this.chief);
    if (chief && chief.hp > 0 && chief.hp < chief.maxHp * 0.5 && !this.cried) {
      this.cried = true;
      for (const u of this.enemies('palais')) { u.zone = -1; u.state = 'chase'; }
      this.news.push({ type: 'cry' });
    }
    if (g === 'palais' && chief && chief.hp <= 0 && this.enemies().length) {
      // la reddition : les derniers défenseurs déposent les armes (ils quittent la bataille)
      for (const u of this.enemies()) this.sim.units.delete(u.id);
      this.news.push({ type: 'surrender' });
      this.goal = GOALS.length - 1;
      this.take('palais', true);
    }
  }

  private end(o: BattleOutcome) { this.outcome = o; this.news.push({ type: 'end', outcome: o }); }

  /** Coordonnées du monde d'un point de la bataille */
  toWorld(x: number, z: number): [number, number] { return [x + this.map.ox, z + this.map.oz]; }
  /** Où mouille la flotte alliée (coordonnées de la bataille : le salut de la victoire en part) */
  get fleet(): [number, number] { return this.sea; }
}
