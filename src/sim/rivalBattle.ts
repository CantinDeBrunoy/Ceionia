import type { World } from '../world/world';
import type { HellZoneInfo } from '../world/hell';
import type { People } from '../world/archipelago';
import { townPlans, TownPlan, casemateSpots } from '../world/rivalTown';
import { CombatMap, Hell, HellUnit, HellBuilding, DemonKind, UnitStats } from './hell';
import { BALANCE_EASY, BALANCE_NORMAL, powerOf } from './hellBalance';
import { troopStats, TroopKind } from './army';
import type { Intel, Boons } from './diplomacy';
import { CORPS } from './campaign';
import { zoneOf } from '../world/concession';
import { FORGE_DMG } from './concession';

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

/**
 * Les objectifs, dans l'ordre : la plage, le port (hors les murs, au bout de la route de la porte), les remparts, le palais.
 * La campagne de l'île rivale (voir `sim/campaign.ts`) en ajoute deux : la tour du rempart (un avant-poste qui tire, hors les
 * murs) et le camp de la plage (à tenir contre une sortie rivale)
 */
export type BattleGoal = 'plage' | 'port' | 'tour' | 'remparts' | 'palais' | 'camp' | 'passage';
export const GOALS: BattleGoal[] = ['plage', 'port', 'remparts', 'palais'];
/**
 * Les batailles de la campagne : la bataille d'un seul tenant (`full`, celle d'avant la campagne : les essais, le bac à sable),
 * le débarquement, chaque avant-poste, la défense du camp, l'assaut final (l'ancien, gardé pour les essais) et **la bataille
 * des deux îles** (`epic`, chantier D : le passage de la tête de pont, les remparts et leurs casemates, le palais), qui règle
 * la guerre. Chacune joue ses objectifs dans l'ordre
 */
export type BattleKind = 'full' | 'landing' | 'port' | 'tour' | 'defend' | 'assault' | 'epic';
export const PLANS: Record<BattleKind, BattleGoal[]> = {
  full: GOALS, landing: ['plage'], port: ['port'], tour: ['tour'], defend: ['camp'], assault: ['remparts', 'palais'], epic: ['passage', 'remparts', 'palais'],
};

/**
 * La bataille des deux îles (chantier D du nouveau monde, plan partie 5). Quatre temps : **le plan** (une carte avant tout,
 * `Scheme`), **la mer** (la bataille navale du Moderne, `NavalKind` `isles`, jouée par `Game` avant : gagnée, les batteries
 * côtières se taisent ; perdue, elles tirent sur nos troupes, `opts.sea`), **le passage et les remparts** (le passage de la
 * tête de pont vers la ville, puis les remparts : la porte, les casemates qui tirent, un choix tactique `Tactic3`), **le
 * palais** (le chef, son cri, sa garde, la reddition). Au plus `EPIC_CAP` unités vivantes à la fois ; gagnable sans ordre
 * - `force` : débarquer en force (l'allié débarque sur une seconde plage, celle de la ville, et prend le passage à revers) ;
 * - `siege` : le siège (la flotte alliée et la batterie bombardent d'abord `SIEGE_T` s ; plus long, moins de pertes) ;
 * - `raid` : le coup de main (de nuit, par le col : `RAID_SHARE` de nos hommes, mais la porte surprise et le passage à demi gardé)
 */
export type Scheme = 'force' | 'siege' | 'raid';
export const SCHEMES: Scheme[] = ['force', 'siege', 'raid'];
/** Le choix des remparts : l'appui aérien (l'héliport bâti), la batterie qui pilonne (la batterie côtière bâtie), le bélier blindé (toujours) */
export type Tactic3 = 'air' | 'pound' | 'armor';
/** Ce que la bataille des deux îles reçoit : le plan, l'issue de la mer, l'héliport et la batterie bâtis */
export interface EpicOpts { scheme?: Scheme; sea?: 'won' | 'lost'; air?: boolean; battery?: boolean }
export const TACTICS3: Tactic3[] = ['air', 'pound', 'armor'];
/** Les défenseurs de la bataille des deux îles (soldats, archers) ; 3 vagues ; le chef en plus (64 en tout, sans avantages) */
export const EPIC_FOES = {
  passage: [9, 5], contre: [5, 3], remparts: [7, 5], vague: [3, 3], palais: [9, 5],
} as const satisfies Record<string, readonly [number, number]>;
export const EPIC_WAVES = 3, EPIC_WAVE_AT = [20, 70, 120];
/** L'allié : 12 avec nous (ou sur la seconde plage), 18 en renfort (30 en tout) */
export const EPIC_ALLY_FIRST: [number, number] = [7, 5], EPIC_ALLY_RELIEF: [number, number] = [11, 7];
/** Au plus tant d'unités vivantes à la fois (les deux camps) : les renforts attendent qu'il y ait de la place */
export const EPIC_CAP = 90;
/** Les casemates : deux, aux tours des remparts près de la porte ; leur vie (× une tour de garde) et la force de leur tir */
export const CASEMATE_HP = 5, CASEMATE_POWER = 1.5;
/** La contre-attaque du passage sort de la porte quand le passage faiblit (passé `EPIC_COUNTER_T` s), au plus tard à `EPIC_COUNTER_MAX` */
export const EPIC_COUNTER_T = 30, EPIC_COUNTER_MAX = 70;
/** Le siège : la durée du bombardement d'ouverture (s), son rythme, ce qu'un obus ôte */
export const SIEGE_T = 70, SIEGE_EVERY = 2, SIEGE_K = 0.55;
/** Le coup de main : la part de nos hommes, la vie de la porte surprise, la part du passage gardée */
export const RAID_SHARE = 0.65, RAID_GATE = 0.35, RAID_PASS = 0.5;
/** La mer perdue : les batteries côtières tirent sur nos troupes, un obus toutes les `BATTERY_EVERY` s */
export const BATTERY_EVERY = 14, BATTERY_K = 0.3, BATTERY_SPLASH = 1.4;
/** L'appui aérien : sa durée (s), une passe toutes les `AIR_EVERY` s ; ce qu'une bombe ôte à une casemate, aux hommes autour */
export const AIR_T = 36, AIR_EVERY = 6, AIR_FALL = 3.2, AIR_CASEMATE = 0.5, AIR_K = 0.8, AIR_SPLASH = 1.8;
/** La batterie pilonne : durée, rythme, ce qu'un obus ôte à une casemate, à la porte */
export const POUND_T = 30, POUND_EVERY = 3, POUND_CASEMATE = 0.3, POUND_GATE = 0.07;
/** Le bélier blindé : des blindés (nos cavaliers de l'âge) contre la porte, qui en sort entamée */
export const ARMOR_TANKS = 3, ARMOR_GATE = 0.6;
/** La reddition de la ville met fin à la bataille : la porte de l'épique tient un peu plus que l'ancienne (s sous 10 hommes) */
export const EPIC_GATE_T = 320;
/** Le chef de la bataille des deux îles tient plus longtemps (× `CHIEF_HP`) ; débarquer en force dégarnit le passage (part gardée) */
export const EPIC_CHIEF = 1.8, FORCE_PASS = 0.75, FORCE_ALLIES: [number, number] = [4, 2];
/** Les garnisons des avant-postes, quand on les prend un à un (soldats, archers) ; la tour a en plus son bâtiment, qui tire */
export const OUTPOST = { port: [12, 8], tour: [8, 9] } as const satisfies Record<string, readonly [number, number]>;
/**
 * Un avant-poste attaqué appelle la ville : `OUTPOST_HELP` (soldats, archers) sortent de la porte à chaque temps de `OUTPOST_HELP_T` (s). La
 * tour a `TOWER_HP` fois la vie d'une tour de garde. L'allié n'envoie qu'un détachement (`OUTPOST_ALLIES`, plus les renforts
 * gagnés sur les îles) : la vraie bataille de l'allié, c'est l'assaut
 */
export const OUTPOST_HELP: [number, number] = [5, 3], OUTPOST_HELP_T = [25, 60], TOWER_HP = 6;
/** Les temps du renfort comptent de l'arrivée de nos troupes à cette distance de l'avant-poste (cases) */
export const APPROACH_R = 16;
export const OUTPOST_ALLIES: [number, number] = [3, 2];
/** La tour prise, les remparts perdent ces archers à l'assaut final */
export const TOUR_CUT = 2;
/**
 * Une sortie rivale contre le camp (soldats, archers), en `RAID_WAVES` vagues espacées de `RAID_GAP` s ; plus forte de
 * `RAID_GROW` soldats à chaque sortie et à chaque avant-poste tenu (au plus `RAID_MAX` hommes par vague). La garde alliée
 * du camp (`CAMP_ALLIES`) se bat avec nous
 */
export const RAID: [number, number] = [5, 3], RAID_WAVES = 2, RAID_GAP = 25, RAID_GROW = 2, RAID_MAX = 14;
export const CAMP_ALLIES: [number, number] = [2, 2];
/** La vie du camp de la plage dans la défense (× celle du camp des Enfers) : abattu, la défense est perdue */
export const CAMP_HP = 1.6;
/** Le fort de la tête de pont : le camp a deux fois plus de vie */
export const FORT_HP = 2;
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
      // (l'eau aussi : la ria de la tête de pont, un bras de mer, ne se traverse pas tout droit)
      if (this.inside(x, z) && (this.block[this.cell(x, z)] || !this.land[this.cell(x, z)])) return false;
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
export const OURS: [number, number] = CORPS;
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
  /** un choix tactique attend le joueur (la bataille est suspendue jusqu'à `choose`) ; 3 : celui des remparts de l'épique */
  | { type: 'choice'; step: 1 | 2 | 3 }
  /** la bataille des deux îles : le siège commence ; un obus des batteries côtières ; une passe d'avions (x, z : la cible) ;
   * la batterie pilonne ; les blindés ; une casemate se tait */
  | { type: 'siege' } | { type: 'battery'; x: number; z: number } | { type: 'air'; x: number; z: number; n: number }
  | { type: 'pound' } | { type: 'armor' } | { type: 'casemate'; left: number }
  | { type: 'boat'; n: number } | { type: 'allyLands' }
  /** une contre-attaque, un renfort, une vague de sortie : d'où elle part (coordonnées de la bataille), pour que la vue y aille */
  | { type: 'counter'; x?: number; z?: number } | { type: 'wave'; n: number } | { type: 'relief' } | { type: 'gate' } | { type: 'breach' }
  | { type: 'bombard' } | { type: 'cry' } | { type: 'surrender' } | { type: 'tower' } | { type: 'raid'; n: number; x?: number; z?: number } | { type: 'campHit' }
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
/**
 * Les groupes ennemis, moins ceux que les expéditions des îles ont ôtés (`Boons.foes` : espionnage, sabotage, transfuge) :
 * on retire d'abord au port, puis à la contre-attaque, aux vagues (chacune), aux remparts, à la plage ; un soldat avant un
 * archer, et chaque groupe garde au moins un homme (un objectif sans défenseur se prendrait sans combat)
 */
export function foeGroups(cut: number): Record<keyof typeof FOES, [number, number]> {
  return cutGroups(FOES, ['port', 'contre', 'vague', 'remparts', 'plage'], WAVES, cut);
}
/** Les groupes de la bataille des deux îles, moins ceux que les expéditions ont ôtés (la contre-attaque, les vagues, les remparts, le passage) */
export function epicGroups(cut: number): Record<keyof typeof EPIC_FOES, [number, number]> {
  return cutGroups(EPIC_FOES, ['contre', 'vague', 'remparts', 'passage'], EPIC_WAVES, cut);
}
function cutGroups<K extends string>(base: Record<K, readonly [number, number]>, order: NoInfer<K>[], waves: number, cut: number): Record<K, [number, number]> {
  const g = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, [(v as [number, number])[0], (v as [number, number])[1]]])) as Record<K, [number, number]>;
  let left = Math.max(0, Math.floor(cut));
  for (const k of order) {
    const per = k === 'vague' ? waves : 1;
    while (left >= per && g[k][0] + g[k][1] > 1) {
      if (g[k][0] > 0 && g[k][0] >= g[k][1]) g[k][0]--; else g[k][1]--;
      left -= per;
    }
  }
  return g;
}
export const FOE_TOTAL = Object.entries(FOES).reduce((n, [k, [s, a]]) => n + (s + a) * (k === 'vague' ? WAVES : 1), 0) + 1;

export class RivalBattle {
  map: RivalMap;
  sim: Hell;
  /** les objectifs de cette bataille, dans l'ordre (`PLANS`) */
  readonly plan: BattleGoal[];
  /** l'objectif en cours (indice dans `plan`) ; au-delà : tous pris */
  goal = 0;
  /** la tour du rempart (avant-poste qui tire) ; le camp de la plage (à tenir) */
  tower: HellBuilding | null = null;
  camp: HellBuilding | null = null;
  /** sorties : vagues envoyées */
  private raidsSent = 0;
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
  waiting: 1 | 2 | 3 | null = null;
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
  private town: TownPlan;
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
  /** les groupes ennemis de cette bataille (`foeGroups`) ; les troupes alliées de la première vague (renforts des îles compris) */
  readonly sizes: Record<keyof typeof FOES, [number, number]>;
  private allyFirstWave: [number, number];
  /**
   * `boons` : les avantages des expéditions des îles (voir `Boons`) : troupes alliées de plus à la première vague, nos
   * soldats de plus (une barque de plus), ennemis en moins (`foeGroups`)
   */
  /**
   * `kind` : la bataille de la campagne (`PLANS`) ; `held` : les avant-postes déjà pris (ils affaiblissent l'assaut) ; `raid` :
   * la force d'une sortie contre le camp (le nombre de sorties déjà faites plus les avant-postes tenus)
   */
  readonly kind: BattleKind;
  private readonly held: BattleGoal[];
  private readonly raidLevel: number;
  private readonly easy: boolean;
  /** la forge du front : nos coups plus forts (× `FORGE_DMG`) */
  private ourDmg = 1;

  /**
   * `front` : ce que la tête de pont apporte (chantier C, `sim/concession.ts` › `frontPerks`) : le fort (le camp deux fois
   * plus solide), la tour de guet (elle tire pendant une sortie), la forge du front (nos coups plus forts)
   */
  constructor(world: World, rival: People, readonly age: number, easy = false, troops: TroopKind[] = armyOf(age), readonly intel: Intel[] = [], readonly boons: Boons = { allies: 0, ours: 0, foes: 0, peace: 0 }, opts: { kind?: BattleKind; held?: BattleGoal[]; raid?: number; front?: { fort?: boolean; tower?: boolean; forge?: boolean }; epic?: EpicOpts } = {}) {
    this.kind = opts.kind ?? 'full';
    this.plan = PLANS[this.kind];
    this.held = opts.held ?? [];
    this.raidLevel = Math.max(0, opts.raid ?? 0);
    this.easy = easy;
    this.sizes = foeGroups(boons.foes);
    this.esizes = epicGroups(boons.foes);
    const epic = this.kind === 'epic', eo = opts.epic ?? {};
    this.scheme = eo.scheme ?? 'force';
    this.seaLost = eo.sea === 'lost';
    this.air = !!eo.air; this.battery = !!eo.battery;
    const ex = Math.max(0, Math.floor(boons.allies)), first = epic ? EPIC_ALLY_FIRST : ALLY_FIRST;
    this.allyFirstWave = [first[0] + Math.ceil(ex / 2), first[1] + Math.floor(ex / 2)];
    troops = [...troops, ...Array(Math.max(0, Math.floor(boons.ours))).fill(age >= 2 ? 'knight' : 'soldier')];
    // (le coup de main : une part de nos hommes seulement, par le col, de nuit)
    if (epic && this.scheme === 'raid') troops = troops.filter((_, i) => Math.floor((i + 1) * RAID_SHARE) > Math.floor(i * RAID_SHARE) || i === 0);
    const town = townPlans(world).find((p) => p.people === rival);
    if (!town) throw new Error('pas de ville rivale');
    // (le débarquement se fait sur la plage de la tête de pont, la zone de l'île tournée vers notre île, et le camp s'y pose :
    // décision de l'auteur, 24 nov. 2026 ; la carte de bataille l'englobe)
    const zone = zoneOf(world, rival);
    const plan: TownPlan = zone ? { ...town, points: { ...town.points, plage: zone.beach } } : town;
    this.ourDmg = opts.front?.forge ? FORGE_DMG : 1;
    this.town = plan;
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
    const plageAt = zone ? snapOut(this.map.freeNear(...this.map.local(zone.camp), 4)) : snapOut(this.inland(pts.plage, 5));
    // (la tour du rempart : le sommet des remparts le plus proche de la plage, hors de la porte ; on la prend du dehors)
    // (la plage de la ville, celle d'avant la tête de pont : la tour reste la même, face à la mer)
    const old = this.map.local(town.points.plage);
    const corner = pts.remparts.map((q) => this.map.local(q)).filter((q) => Math.hypot(q[0] - gate[0], q[1] - gate[1]) > 5)
      .sort((a, b) => Math.hypot(a[0] - old[0], a[1] - old[1]) - Math.hypot(b[0] - old[0], b[1] - old[1]))[0] ?? gate;
    // (le passage de la tête de pont vers la ville : le col, la langue de terre ; sans zone, à mi-chemin de la plage et de la porte)
    const pass = zone ? this.map.local([zone.gate[0], zone.gate[1]]) : [(beach[0] + gate[0]) / 2, (beach[1] + gate[1]) / 2] as [number, number];
    this.goalAt = { plage: plageAt, port: snapOut(this.map.local(pts.port)), tour: snapOut(this.toward(corner, old, 2.4)), remparts: inside, palais: snap(this.map.local(pts.palais)), camp: plageAt, passage: snapOut(this.toward(pass, gate, 2)) };
    this.outside = snapOut(this.toward(gate, beach, 2.5));
    this.sea = this.toward(this.map.local(pts.port), this.map.local([plan.x, plan.z]), -6);
    // (la seconde plage : la terre qu'on atteint du dehors la plus proche de la plage de la ville ; trop loin, l'allié débarque avec nous)
    const sb = this.map.snap(this.map.freeNear(old[0], old[1], 5), out, 40);
    this.secondBeach = out[this.map.cell(sb[0], sb[1])] >= 0 && Math.hypot(sb[0] - old[0], sb[1] - old[1]) < 20 ? sb : plageAt;
    const has = (g: BattleGoal) => this.plan.includes(g);
    // (les avant-postes et l'assaut partent du passage de la tête de pont, vers la ville : la marche depuis le camp, au fond
    // de la zone, égrenait nos troupes ; la défense, elle, se tient au camp ; la bataille des deux îles part du camp et passe
    // le passage en combattant)
    const start = zone && !has('camp') && !has('plage') && !epic ? snapOut(this.map.freeNear(...this.map.local([zone.gate[0], zone.gate[1]]), 4)) : plageAt;
    // nos troupes : en trois barques (la première tout de suite) pour un débarquement ; sinon toutes au camp de la plage
    this.beach = beach;
    this.boats = troops.slice();
    if (has('plage')) this.landBoat();
    else { this.boatN = BOATS.length; const all = this.boats.splice(0); all.forEach((k, i) => this.army.push(this.landUnit(k, this.ourStats(k), start, i).id)); }
    this.sim.rally = beach;
    // l'allié : sa première vague suit notre débarquement ; depuis le camp, elle est là d'emblée (la garde du camp, à la défense)
    const outpost = this.kind === 'port' || this.kind === 'tour';
    if (!has('plage')) {
      this.allyLanded = true;
      const extra = this.allyFirstWave[0] + this.allyFirstWave[1] - ALLY_FIRST[0] - ALLY_FIRST[1];
      // (débarquer en force : l'allié prend pied sur la seconde plage, celle de la ville, et prend le passage à revers)
      const force = epic && this.scheme === 'force' && this.secondBeach !== plageAt, at = force ? this.secondBeach : start;
      // (débarquer en force : l'allié vient plus nombreux sur sa plage)
      if (force) this.allyFirstWave = [this.allyFirstWave[0] + FORCE_ALLIES[0], this.allyFirstWave[1] + FORCE_ALLIES[1]];
      this.landAllies(has('camp') ? CAMP_ALLIES : outpost ? [OUTPOST_ALLIES[0] + Math.ceil(extra / 2), OUTPOST_ALLIES[1] + Math.floor(extra / 2)] : this.allyFirstWave, at);
    }
    // la porte principale : un bâtiment au combat, qui bouche le passage tant qu'il tient
    // (l'épique : un peu plus solide ; le coup de main la surprend, à demi ouverte)
    const gateK = epic ? (EPIC_GATE_T / GATE_T) * (this.scheme === 'raid' ? RAID_GATE : 1) : 1;
    const melee = troopStats(age >= 2 ? 'knight' : 'soldier', age), gateHp = GATE_T * GATE_MEN * (melee.dmg / melee.cooldown) * (intel.includes('scoutGate') ? WEAK_GATE_K : 1) * gateK;
    if (has('remparts')) {
      this.gate = this.sim.addPlayerBuilding('gate', gate[0], gate[1], 1.1, 1, gateHp / 300);
      this.gate.side = 'hell';
    }
    // les défenseurs : la plage (un peu en retrait), le port, les remparts (derrière la porte), le palais et le chef
    const sz = this.sizes, beachFoes: [number, number] = intel.includes('scoutBeach') ? [Math.max(1, sz.plage[0] - 2), Math.max(0, sz.plage[1] - 1)] : [...sz.plage];
    if (has('plage')) this.post('plage', beachFoes, this.goalAt.plage, true);
    if (has('port')) this.post('port', this.kind === 'port' ? OUTPOST.port : sz.port, this.goalAt.port, true);
    // la tour du rempart : ses archers et la tour elle-même, qui tire (comme l'avant-poste d'une zone des Enfers)
    if (has('tour')) {
      this.post('tour', OUTPOST.tour, this.goalAt.tour, true);
      // (la tour se dresse au sommet du rempart, où la ville a la sienne ; ses gardes se tiennent devant, dehors)
      const [tx, tz] = corner;
      this.tower = this.sim.addPlayerBuilding('watchtower', tx, tz, 1.1, 1, TOWER_HP);
      this.tower.side = 'hell';
    }
    // (la tour prise : des archers en moins sur les remparts)
    const es = this.esizes, rw = epic ? es.remparts : sz.remparts;
    const walls: [number, number] = this.held.includes('tour') ? [rw[0], Math.max(0, rw[1] - TOUR_CUT)] : [...rw];
    if (has('remparts')) this.post('remparts', walls, inside);
    // la bataille des deux îles : le passage gardé (à demi par le coup de main), les casemates des remparts, qui tirent
    if (has('passage')) {
      // (le coup de main surprend le passage à demi gardé ; débarquer en force en détourne une partie vers la seconde plage)
      const k = this.scheme === 'raid' ? RAID_PASS : this.scheme === 'force' && this.secondBeach !== plageAt ? FORCE_PASS : 1;
      this.post('passage', [Math.ceil(es.passage[0] * k), Math.ceil(es.passage[1] * k)], this.goalAt.passage, true);
      for (const q of casemateSpots(town)) {
        const [x, z] = this.map.local(q);
        const c = this.sim.addPlayerBuilding('watchtower', x, z, 1.1, CASEMATE_POWER, CASEMATE_HP);
        c.side = 'hell';
        this.casemates.push(c);
      }
      if (this.scheme === 'siege') { this.siegeT = SIEGE_T; this.shotT = 0; this.news.push({ type: 'siege' }); }
    }
    // le camp de la plage, à tenir : la sortie rivale vient de la porte (`moments`)
    if (has('camp')) {
      const [cx, cz] = this.map.freeNear(plageAt[0], plageAt[1], 4);
      this.camp = this.sim.addPlayerBuilding('camp', cx, cz, 1.2, 1, CAMP_HP * (opts.front?.fort ? FORT_HP : 1));
      // (la tour de guet du camp : elle tire sur les assaillants, du côté de la ville)
      if (opts.front?.tower) {
        const [tx, tz] = this.toward([cx, cz], gate, 2.6);
        this.sim.addPlayerBuilding('watchtower', tx, tz, 1.1, 1, 1.5);
      }
    }
    // l'assaut final : comment prendre les remparts se choisit d'emblée (la plage et le port sont déjà à nous)
    if (this.kind === 'assault') { this.waiting = 1; this.news.push({ type: 'choice', step: 1 }); }
    this.ready = true;
    this.drain();
    if (!has('palais')) return;
    // (la bataille des deux îles : la garde du palais prend son poste quand les remparts tombent, pour tenir sous `EPIC_CAP`)
    if (!epic) this.manPalace();
  }

  // ---------- La bataille des deux îles ----------
  /** les groupes de défenseurs de l'épique (moins les avantages des îles) */
  readonly esizes: Record<keyof typeof EPIC_FOES, [number, number]>;
  readonly scheme: Scheme;
  /** la mer perdue : les batteries côtières tirent sur nos troupes */
  readonly seaLost: boolean;
  /** l'héliport militaire (l'appui aérien) et la batterie côtière (elle pilonne) sont bâtis dans la tête de pont */
  readonly air: boolean;
  readonly battery: boolean;
  tactic3: Tactic3 | null = null;
  /** les casemates des remparts (bâtiments au combat, qui tirent) */
  casemates: HellBuilding[] = [];
  /** la seconde plage (celle de la ville : l'allié y débarque en force) */
  secondBeach: [number, number] = [0, 0];
  /** le bombardement du siège, l'appui aérien, la batterie qui pilonne (s restantes) ; le prochain obus des batteries côtières */
  siegeT = 0;
  airT = 0;
  poundT = 0;
  private batteryT = BATTERY_EVERY;
  private airN = 0;
  private casematesLeft = -1;
  /** Le choix des remparts : ce qui est possible (null), ou pourquoi pas (`heliport`, `battery`) */
  tactic3Why(c: Tactic3): string | null { return c === 'air' && !this.air ? 'heliport' : c === 'pound' && !this.battery ? 'battery' : null; }
  /** Le premier choix possible (les tests, sans ordre) */
  autoTactic3(): Tactic3 { return TACTICS3.find((c) => !this.tactic3Why(c))!; }

  /** La garde du palais et le chef rival, à leur poste */
  private manPalace() {
    const epic = this.kind === 'epic', age = this.age;
    if (epic) this.queue('palais', this.esizes.palais, this.goalAt.palais, false);
    else this.post('palais', this.sizes.palais, this.goalAt.palais);
    if (!this.foes.has('palais')) this.foes.set('palais', []);
    const cs = foeOf('soldier', age), ck = this.intel.includes('scoutChief') ? 0.75 : 1;
    const [cx, cz] = this.spot(this.goalAt.palais[0], this.goalAt.palais[1]);
    const chief = this.sim.addRaider('warlord' as unknown as DemonKind, { ...cs, hp: Math.round(cs.hp * CHIEF_HP * ck * (epic ? EPIC_CHIEF : 1)), dmg: Math.round(cs.dmg * CHIEF_DMG * 10) / 10, radius: cs.radius * 1.4 }, cx, cz);
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
    return this.toward(this.map.local(q), this.map.local([this.town.x, this.town.z]), d);
  }
  /** la plage ; nos troupes encore en mer (les barques suivantes), la barque suivante, la première vague de l'allié */
  private beach: [number, number] = [0, 0];
  private boats: TroopKind[] = [];
  private boatN = 0;
  private allyLanded = false;
  /** Une barque de nos troupes accoste */
  private landBoat() {
    const n = BOATS[this.boatN] ?? this.boats.length, start = this.army.length;
    this.boats.splice(0, n).forEach((k, i) => this.army.push(this.landUnit(k, this.ourStats(k), this.beach, start + i).id));
    this.boatN++;
    if (this.boatN > 1) this.news.push({ type: 'boat', n: this.boatN });
  }

  /** Nos troupes de l'âge (la forge du front : des coups plus forts) */
  private ourStats(k: TroopKind): UnitStats {
    const s = troopStats(k, this.age);
    return this.ourDmg === 1 ? s : { ...s, dmg: Math.round(s.dmg * this.ourDmg * 10) / 10 };
  }
  /** Une troupe débarquée (nous ou l'allié) près d'un point, en grappe */
  private landUnit(kind: string, stats: UnitStats, at: [number, number], i: number) {
    const a = i * 2.4, r = 0.8 + (i % 6) * 0.45 + Math.floor(i / 12) * 0.5;
    const [x, z] = this.map.freeNear(at[0] + Math.sin(a) * r, at[1] + Math.cos(a) * r, 6);
    return this.sim.addPlayerUnit(kind, stats, x, z);
  }
  /** Une vague de l'allié (ses sortes ont le préfixe `ally:` : la barre ne les commande pas, la vue leur met ses couleurs) */
  private landAllies([s, a]: readonly [number, number], at: [number, number]) {
    // (la bataille des deux îles : l'allié entre à mesure qu'il y a de la place, après les garnisons)
    if (this.kind === 'epic') { this.queue('ally', [s, a], at, true); return; }
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
  /** Les unités vivantes, des deux camps (la bataille des deux îles en tient au plus `EPIC_CAP`) */
  living() { let n = 0; for (const u of this.sim.units.values()) if (u.hp > 0) n++; return n; }
  /** La bataille des deux îles : la place qui reste sous `EPIC_CAP` (sans limite ailleurs) */
  private room() { return this.kind === 'epic' ? Math.max(0, EPIC_CAP - this.living()) : Infinity; }
  /**
   * Des renforts qui attendent la place (la bataille des deux îles) : ils entrent un à un dès qu'il y en a, au poste (`charge`
   * faux) ou à la charge. Nom `ally` : des troupes de l'allié
   */
  private waiting_: { name: string; kind: string; at: [number, number]; charge: boolean }[] = [];
  private queue(name: string, [s, a]: readonly [number, number], at: [number, number], charge: boolean) {
    const melee = name === 'ally' ? (this.age >= 2 ? 'knight' : 'soldier') : 'soldier';
    for (let i = 0; i < s; i++) this.waiting_.push({ name, kind: melee, at, charge });
    for (let i = 0; i < a; i++) this.waiting_.push({ name, kind: 'archer', at, charge });
    if (this.ready) this.drain();
  }
  /** le décor posé (les garnisons d'abord : les renforts entrent ensuite, sous `EPIC_CAP`) */
  private ready = false;
  /** Ceux qui attendent entrent, tant qu'il y a de la place */
  private drain() {
    let room = this.room(), i = 0;
    while (room > 0 && this.waiting_.length) {
      const w = this.waiting_.shift()!;
      const r = 0.6 + (i % 4) * 0.7, ang = i * 2.1;
      if (w.name === 'ally') { const k = w.kind as TroopKind; this.allies.push(this.landUnit(`ally:${k}`, troopStats(k, this.age), w.at, this.allies.length + 7).id); }
      else {
        const st = foeOf(w.kind as 'soldier' | 'archer', this.age);
        const [x, z] = this.spot(w.at[0] + Math.sin(ang) * r, w.at[1] + Math.cos(ang) * r, w.name === 'contre' || w.name === 'passage');
        const u = this.sim.addRaider(w.kind as unknown as DemonKind, st, x, z);
        if (!w.charge) { u.zone = 0; u.state = 'guard'; u.home = [x, z]; }
        const ids = this.foes.get(w.name) ?? [];
        ids.push(u.id); this.foes.set(w.name, ids);
      }
      room--; i++;
    }
  }
  /** Des renforts (des deux camps) attendent encore la place */
  get queued() { return this.waiting_.length; }

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

  /** L'objectif en cours (null : tous pris) */
  get current(): BattleGoal | null { return this.plan[this.goal] ?? null; }
  /** Nos troupes encore debout */
  troops(): HellUnit[] { return this.alive(this.army); }
  /** Les troupes alliées encore debout */
  allied(): HellUnit[] { return this.alive(this.allies); }
  /** Les ennemis encore debout d'un groupe (ou de tous) */
  enemies(name?: string): HellUnit[] { return name ? this.alive(this.foes.get(name) ?? []) : this.sim.alive('hell'); }
  /** Les défenseurs encore debout d'un objectif (avec ses renforts) */
  defenders(g: BattleGoal): HellUnit[] {
    const groups: Record<BattleGoal, string[]> = { plage: ['plage', 'contre'], port: ['port'], tour: ['tour'], remparts: ['remparts', 'vague'], palais: ['palais'], camp: ['raid'], passage: ['passage', 'contre'] };
    // (un défenseur qu'on ne peut pas atteindre, coincé par le relief, ne retient pas l'objectif)
    const r = g === 'plage' || g === 'port' || g === 'tour' || g === 'camp' || g === 'passage' ? this.reachOut : this.reach;
    return groups[g].flatMap((n) => this.enemies(n)).filter((u) => !r.length || r[this.map.cell(u.x, u.z)] >= 0);
  }
  private alive(ids: number[]) { return ids.map((id) => this.sim.units.get(id)).filter((u): u is HellUnit => !!u && u.hp > 0); }

  /** Le joueur (ou les tests) fait le choix tactique en attente */
  choose(c: Tactic1 | Tactic2 | Tactic3) {
    if (this.waiting === 3 && (TACTICS3 as string[]).includes(c)) {
      if (this.tactic3Why(c as Tactic3)) return false;
      this.tactic3 = c as Tactic3;
      if (c === 'air') { this.airT = AIR_T; this.shotT = 1; }
      if (c === 'pound') { this.poundT = POUND_T; this.shotT = 0; this.news.push({ type: 'pound' }); }
      if (c === 'armor') {
        // le bélier blindé : nos blindés (les cavaliers de l'âge) foncent sur la porte, qui en sort entamée
        if (this.gate) this.gate.hp = Math.round(this.gate.hp * ARMOR_GATE);
        const at = this.goalAt.passage;
        // (au plus ce que permet `EPIC_CAP` : la porte en sort entamée de toute façon)
        for (let i = 0; i < Math.min(ARMOR_TANKS, this.room()); i++) this.army.push(this.landUnit('cavalry', this.ourStats('cavalry'), at, i).id);
        this.news.push({ type: 'armor' });
      }
    } else if (this.waiting === 1 && (TACTICS1 as string[]).includes(c)) {
      this.tactic1 = c as Tactic1;
      if (c === 'climb') { this.map.breach(this.town, this.map.local(this.town.points.port)); this.news.push({ type: 'breach' }); }
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
    if (this.waiting) { if (pick) this.choose(this.waiting === 1 ? TACTICS1[0] : this.waiting === 2 ? TACTICS2[0] : this.autoTactic3()); else return; }
    this.t += dt; this.phaseT += dt;
    const g = this.current;
    this.moments(dt);
    if (this.kind === 'epic') this.epicMoments(dt);
    // en tenue (bombardement, regroupement, le siège) : on tient la plage ou le port, sans avancer
    if (g && this.hold <= 0 && this.siegeT <= 0) {
      const wall = g === 'remparts' && this.gate && !this.gate.down && this.tactic1 !== 'climb' ? this.gate : g === 'tour' && this.tower && !this.tower.down ? this.tower : null;
      // (la défense du camp : on marche sur l'assaillant le plus proche du camp ; sans cela, des tireurs abattaient le camp de loin)
      const raider = g === 'camp' ? this.enemies('raid').sort((p, q) => this.fromCamp(p) - this.fromCamp(q))[0] : undefined;
      const target = wall ? null : raider ? [raider.x, raider.z] as [number, number] : this.goalAt[g];
      const [gx, gz] = target ?? [wall!.site.x, wall!.site.z];
      const go = (us: HellUnit[]) => {
        const idle = us.filter((u) => !u.order && u.target === null);
        if (!idle.length) return;
        // (la porte : les fantassins la frappent ; les tireurs, eux, répondent aux défenseurs des remparts en marchant sur elle ;
        // sinon on marche sur le point en combattant ce qu'on croise)
        if (wall) {
          const archer = (u: HellUnit) => u.kind === 'archer' || u.kind === 'ally:archer';
          const melee = idle.filter((u) => !archer(u)), shoot = idle.filter(archer);
          // (la tour : les archers tirent sur elle et sur ses gardes, à portée ; la porte : sur les défenseurs des remparts)
          const [sx, sz] = wall === this.tower ? [gx, gz] : this.outside;
          if (melee.length) this.sim.order(melee.map((u) => u.id), { kind: 'attack', target: wall.id, x: gx, z: gz });
          // (plus un fantassin debout : les tireurs visent la tour elle-même, sinon elle tenait seule jusqu'au bout)
          const lone = wall === this.tower && !this.troops().some((u) => !archer(u)) && !this.allied().some((u) => !archer(u));
          if (shoot.length) this.sim.order(shoot.map((u) => u.id), lone ? { kind: 'attack', target: wall.id, x: gx, z: gz } : { kind: 'attack', x: sx, z: sz });
        } else this.sim.order(idle.map((u) => u.id), { kind: 'attack', x: gx, z: gz });
      };
      go(this.allied());
      if (auto && this.allyFirst <= 0) go(this.troops());
    }
    this.sim.step(dt);
    if (this.gate && this.gate.down && !this.gateSaid) { this.gateSaid = true; this.news.push({ type: 'gate' }); }
    if (this.tower && this.tower.down && !this.towerSaid) { this.towerSaid = true; this.news.push({ type: 'tower' }); }
    if (this.camp && !this.camp.down && this.camp.hp < this.camp.maxHp * 0.5 && !this.campSaid) { this.campSaid = true; this.news.push({ type: 'campHit' }); }
    // le camp abattu : la défense est perdue
    if (this.camp?.down) { this.end('lost'); return; }
    // l'objectif : ses défenseurs tombés, et l'un des nôtres (ou de l'allié) sur place ; la tour abattue ; la sortie toute venue
    const help = this.kind !== 'port' && this.kind !== 'tour' || this.helped >= OUTPOST_HELP_T.length;
    const ready = help && !(this.kind === 'epic' && this.waiting_.some((w) => w.name !== 'ally')) && (g === 'plage' || g === 'passage' ? this.countered : g === 'tour' ? !!this.tower?.down : g === 'camp' ? this.raidsSent >= RAID_WAVES : true);
    if (g && ready && !this.defenders(g).length) {
      const [gx, gz] = this.goalAt[g], near = [...this.troops(), ...this.allied()].some((u) => Math.hypot(u.x - gx, u.z - gz) < TAKE_R);
      if (near || g === 'camp' || (g === 'remparts' && this.gate?.down)) this.take(g, auto);
    }
    if (this.outcome) return;
    // (perdue seulement quand plus personne ne tient, ni nous ni l'allié, et que plus rien n'est à débarquer)
    const landing = this.boats.length > 0 || !this.allyLanded || (!this.relief && this.plan.includes('remparts') && this.current !== 'plage');
    if ((!this.troops().length && !this.allied().length && !landing) || this.t >= BATTLE_LIMIT) this.end('lost');
  }
  private gateSaid = false;
  /** l'avant-poste a appelé la ville à l'aide */
  private helped = 0;
  /** l'heure où nos troupes arrivent en vue de l'avant-poste (-1 : pas encore) */
  private near = -1;
  private towerSaid = false;
  private campSaid = false;

  /** Un objectif pris : le suivant, et les choix tactiques entre les phases */
  private take(g: BattleGoal, auto: boolean) {
    this.goal++;
    this.phaseT = 0;
    this.news.push({ type: 'goal', goal: g, next: this.current });
    if (!this.current) { this.end('won'); return; }
    if (g === 'plage' && this.plan.includes('remparts')) { this.waiting = 1; this.news.push({ type: 'choice', step: 1 }); }
    // (la bataille des deux îles : le passage pris, le choix des remparts ; les remparts pris, les casemates se taisent et la
    // garde du palais prend son poste)
    else if (g === 'passage') { this.waiting = 3; this.news.push({ type: 'choice', step: 3 }); }
    else if (g === 'remparts') {
      if (this.kind === 'epic') { for (const c of this.casemates) if (!c.down) { c.down = true; c.hp = 0; } this.manPalace(); }
      this.waiting = 2; this.news.push({ type: 'choice', step: 2 });
    }
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
    if (!this.allyLanded && this.t >= ALLY_LANDS) { this.allyLanded = true; this.landAllies(this.allyFirstWave, this.beach); this.news.push({ type: 'allyLands' }); }
    // la contre-attaque : elle sort de la ville vers la plage (quand la plage faiblit, passé `COUNTER_T`, au plus tard `COUNTER_MAX`)
    if (g === 'plage' && !this.countered && ((this.t >= COUNTER_T && this.enemies('plage').length <= 3) || this.t >= COUNTER_MAX)) {
      this.countered = true;
      // (de la tête de pont : du passage, plus près de la plage que la porte de la ville ; elle mettait longtemps à venir)
      const from = this.nearFrom();
      this.charge('contre', this.sizes.contre, from);
      this.news.push({ type: 'counter', x: from[0], z: from[1] });
    }
    // l'avant-poste attaqué appelle la ville : du renfort sort de la porte
    // (comptés de l'approche de nos troupes : la tête de pont est loin de la ville, le renfort n'attend pas qu'on arrive)
    if ((this.kind === 'port' || this.kind === 'tour') && g === this.kind && this.near < 0) {
      const [gx, gz] = this.goalAt[g];
      if (this.troops().some((u) => Math.hypot(u.x - gx, u.z - gz) < APPROACH_R)) this.near = this.t;
    }
    if ((this.kind === 'port' || this.kind === 'tour') && g === this.kind && this.near >= 0 && this.helped < OUTPOST_HELP_T.length && this.t >= this.near + OUTPOST_HELP_T[this.helped]) {
      this.helped++;
      this.charge(g, OUTPOST_HELP, this.outside);
      this.news.push({ type: 'counter', x: this.outside[0], z: this.outside[1] });
    }
    // la sortie rivale contre le camp : des vagues qui sortent de la porte (plus fortes à chaque sortie, à chaque avant-poste tenu)
    if (g === 'camp' && this.raidsSent < RAID_WAVES && this.t >= this.raidsSent * RAID_GAP) {
      this.raidsSent++;
      // (la sortie arrive par le passage de la tête de pont, pas de la porte de la ville : elle mettait longtemps à venir)
      const from = this.nearFrom();
      this.charge('raid', raidWave(this.raidLevel, this.easy), from);
      this.news.push({ type: 'raid', n: this.raidsSent, x: from[0], z: from[1] });
    }
    // les vagues de renfort : du palais vers les remparts, pendant leur assaut (plus tard si les éclaireurs ont compté la relève)
    const late = this.intel.includes('scoutGarrison') ? 25 : 0;
    if (g === 'remparts' && this.kind !== 'epic' && this.wavesSent < WAVES && this.phaseT >= late + WAVE_AT[this.wavesSent]) {
      this.wavesSent++;
      this.charge('vague', this.sizes.vague, this.goalAt.palais);
      this.news.push({ type: 'wave', n: this.wavesSent });
    }
    // le renfort allié : au moment de bascule (au plus tard `RELIEF_T` s dans l'assaut des remparts, ou quand nos forces fondent)
    const landed = this.army.length + this.allies.length, standing = this.troops().length + this.allied().length;
    const epic = this.kind === 'epic';
    if (!this.relief && g && this.plan.includes('remparts') && g !== 'plage' && (!epic || g !== 'passage') && ((g === 'remparts' && this.phaseT >= RELIEF_T) || standing < landed * 0.5 || g === 'palais')) {
      this.relief = true;
      // (l'épique : le gros de l'allié débarque sur la seconde plage, au pied de la ville)
      this.landAllies(epic ? EPIC_ALLY_RELIEF : ALLY_RELIEF, epic ? this.secondBeach : this.map.local(this.town.points.plage));
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
      this.goal = this.plan.length - 1;
      this.take('palais', true);
    }
  }

  /**
   * Les moments de la bataille des deux îles : les renforts qui attendent la place entrent ; la contre-attaque du passage ; les
   * vagues du palais ; le bombardement du siège ; les batteries côtières (la mer perdue) ; l'appui aérien ; la batterie qui
   * pilonne ; les casemates qui se taisent
   */
  private epicMoments(dt: number) {
    const g = this.current;
    this.drain();
    // la contre-attaque : elle sort de la porte vers le passage, quand il faiblit
    if (g === 'passage' && !this.countered && this.siegeT <= 0 && ((this.phaseT >= EPIC_COUNTER_T && this.enemies('passage').length <= 5) || this.phaseT >= EPIC_COUNTER_MAX)) {
      this.countered = true;
      this.queue('contre', this.esizes.contre, this.outside, true);
      this.news.push({ type: 'counter' });
    }
    // les vagues du palais, pendant l'assaut des remparts (plus tard si les éclaireurs ont compté la relève)
    const late = this.intel.includes('scoutGarrison') ? 25 : 0;
    if (g === 'remparts' && this.wavesSent < EPIC_WAVES && this.phaseT >= late + EPIC_WAVE_AT[this.wavesSent]) {
      this.wavesSent++;
      this.queue('vague', this.esizes.vague, this.goalAt.palais, true);
      this.news.push({ type: 'wave', n: this.wavesSent });
    }
    // le siège : la flotte alliée et notre batterie bombardent le passage et les remparts, nos troupes attendent
    const hit = (t: HellUnit | undefined, k: number) => {
      if (!t) return;
      this.sim.events.push({ type: 'shot', x0: this.sea[0], z0: this.sea[1], y0: 1.2, x1: t.x, z1: t.z, source: -1, target: t.id, fire: true });
      this.sim.damage(t, t.maxHp * k, -1, true);
    };
    const pick = <T>(xs: T[]) => xs[Math.floor(this.t * 7.3) % Math.max(1, xs.length)];
    const shell = (b: HellBuilding, k: number) => {
      this.sim.events.push({ type: 'shot', x0: this.sea[0], z0: this.sea[1], y0: 1.2, x1: b.site.x, z1: b.site.z, source: -1, target: b.id, fire: true });
      this.sim.damage(b, b.maxHp * k, -1, true);
    };
    if (this.siegeT > 0) {
      this.siegeT -= dt; this.shotT -= dt;
      if (this.shotT <= 0) {
        this.shotT = SIEGE_EVERY;
        const foes = [...this.enemies('passage'), ...this.enemies('remparts')], cm = this.casemates.filter((c) => !c.down);
        if (cm.length && Math.floor(this.t / SIEGE_EVERY) % 3 === 0) shell(pick(cm), 0.12);
        else hit(pick(foes), SIEGE_K);
        if (this.gate && !this.gate.down) this.sim.damage(this.gate, this.gate.maxHp * 0.005, -1, true);
      }
    }
    // la mer perdue : les batteries côtières tirent sur nos troupes (jusqu'aux remparts pris)
    if (this.seaLost && (g === 'passage' || g === 'remparts')) {
      this.batteryT -= dt;
      if (this.batteryT <= 0) {
        this.batteryT = BATTERY_EVERY;
        const ours = [...this.troops(), ...this.allied()], t = pick(ours);
        if (t) {
          this.sim.events.push({ type: 'shot', x0: this.sea[0], z0: this.sea[1], y0: 2, x1: t.x, z1: t.z, source: -1, target: t.id, fire: true });
          for (const u of ours) if (Math.hypot(u.x - t.x, u.z - t.z) < BATTERY_SPLASH) this.sim.damage(u, u.maxHp * (u === t ? BATTERY_K : BATTERY_K * 0.15), -1, true);
          this.news.push({ type: 'battery', x: t.x, z: t.z });
        }
      }
    }
    // l'appui aérien : une passe d'avions toutes les `AIR_EVERY` s, sur une casemate, puis sur les défenseurs
    if (this.airT > 0) {
      this.airT -= dt; this.shotT -= dt;
      if (this.shotT <= 0) {
        this.shotT = AIR_EVERY;
        const cm = this.casemates.find((c) => !c.down), foes = [...this.enemies('remparts'), ...this.enemies('vague')];
        const tg = cm ? [cm.site.x, cm.site.z] : foes.length ? [pick(foes).x, pick(foes).z] : null;
        if (tg) {
          this.airN++;
          // (la bombe tombe un peu après l'annonce : la vue montre les avions qui piquent, larguent, puis l'explosion)
          this.news.push({ type: 'air', x: tg[0], z: tg[1], n: this.airN });
          this.bombs.push({ x: tg[0], z: tg[1], t: AIR_FALL });
        }
      }
    }
    for (const b of this.bombs) b.t -= dt;
    for (const b of this.bombs.filter((x) => x.t <= 0)) {
      for (const c of this.casemates) if (!c.down && Math.hypot(c.site.x - b.x, c.site.z - b.z) < 1.5) this.sim.damage(c, c.maxHp * AIR_CASEMATE, -1, true);
      for (const u of this.enemies()) if (Math.hypot(u.x - b.x, u.z - b.z) < AIR_SPLASH && u.id !== this.chief) this.sim.damage(u, u.maxHp * AIR_K, -1, true);
      if (this.gate && !this.gate.down && Math.hypot(this.gate.site.x - b.x, this.gate.site.z - b.z) < 3) this.sim.damage(this.gate, this.gate.maxHp * 0.08, -1, true);
    }
    this.bombs = this.bombs.filter((x) => x.t > 0);
    // la batterie pilonne : des obus sur les casemates, puis sur la porte
    if (this.poundT > 0) {
      this.poundT -= dt; this.shotT -= dt;
      if (this.shotT <= 0) {
        this.shotT = POUND_EVERY;
        const cm = this.casemates.find((c) => !c.down);
        if (cm) shell(cm, POUND_CASEMATE); else if (this.gate && !this.gate.down) shell(this.gate, POUND_GATE);
      }
    }
    // une casemate abattue se tait
    const left = this.casemates.filter((c) => !c.down).length;
    if (this.casematesLeft >= 0 && left < this.casematesLeft) this.news.push({ type: 'casemate', left });
    this.casematesLeft = left;
  }
  /** les bombes de l'appui aérien en chute (s avant l'impact) */
  bombs: { x: number; z: number; t: number }[] = [];

  /**
   * D'où partent la contre-attaque de la plage et les sorties contre le camp : le passage de la tête de pont, s'il est plus près
   * du camp que la porte de la ville (retour de l'auteur, 24 nov. 2026 : les ennemis mettaient du temps à arriver, et on les
   * cherchait) ; sinon devant la porte
   */
  private nearFrom(): [number, number] {
    const p = this.goalAt.passage, c = this.goalAt.camp, o = this.outside;
    if (!p || this.reachOut[this.map.cell(p[0], p[1])] < 0) return o;
    return Math.hypot(p[0] - c[0], p[1] - c[1]) + 2 < Math.hypot(o[0] - c[0], o[1] - c[1]) ? p : o;
  }
  /** Le défenseur debout de l'objectif en cours le plus proche de nos troupes (pour que la vue aille le chercher), ou null */
  straggler(): HellUnit | null {
    const g = this.current;
    if (!g) return null;
    const foes = this.defenders(g), ours = [...this.troops(), ...this.allied()];
    if (!foes.length) return null;
    const d = (u: HellUnit) => Math.min(...ours.map((o) => Math.hypot(o.x - u.x, o.z - u.z)), 1e9);
    return foes.reduce((a, b) => (d(b) < d(a) ? b : a));
  }

  private end(o: BattleOutcome) { this.outcome = o; this.news.push({ type: 'end', outcome: o }); }

  /** Coordonnées du monde d'un point de la bataille */
  toWorld(x: number, z: number): [number, number] { return [x + this.map.ox, z + this.map.oz]; }
  /** Où mouille la flotte alliée (coordonnées de la bataille : le salut de la victoire en part) */
  get fleet(): [number, number] { return this.sea; }

  private fromCamp(u: HellUnit) { const [cx, cz] = this.goalAt.camp; return Math.hypot(u.x - cx, u.z - cz); }

  /** Nos troupes debout à la fin : fantassins, archers (le corps expéditionnaire en garde ce qui reste) */
  survivors(): [number, number] {
    const up = this.troops();
    return [up.filter((u) => u.kind !== 'archer').length, up.filter((u) => u.kind === 'archer').length];
  }
}

/** Une vague d'une sortie contre le camp (soldats, archers) : `level` sorties faites et avant-postes tenus la grossissent */
export function raidWave(level: number, easy = false): [number, number] {
  const s = Math.min(RAID_MAX - RAID[1], RAID[0] + RAID_GROW * level);
  return easy ? [Math.max(2, s - 2), Math.max(1, RAID[1] - 1)] : [s, RAID[1]];
}
