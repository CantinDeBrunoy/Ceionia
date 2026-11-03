import { World, N, RailLine, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS, VEG_VOLCANO, mergeVia } from '../world/world';
import { Building, KINDS } from '../build/catalog';
import { ORE_KINDS, oreVeins } from '../world/underground';
import { Agents, Heap } from './agents';
import type { Expeditions } from './expeditions';

/** Couleurs des lignes, dans l'ordre où on les trace */
export const LINE_COLORS = [0xd8553c, 0x3c7fd8, 0xe8b83c, 0x4fa860, 0x9a5ad8, 0xe87ab0];
/** Longueur du train (deux locomotives, la voiture des voyageurs et des mineurs, deux wagons de minerai), en cases */
export const TRAIN_LEN = 2.3;
/** vitesse de pointe (cases par seconde de jeu), accélération, arrêt à quai, attente des retardataires */
const SPEED = 1.8, ACCEL = 0.7, DWELL = 6, BOARD_MAX = 30;
/** un train n'entre pas sur un quai occupé : il attend au sien, au plus tant (puis part, pour ne jamais rester bloqué) */
const WAIT_MAX = 120;
/** jours-mineur pour abattre un filon ; pierre taillée par mineur et par jour quand les galeries tenues n'en ont plus */
const VEIN_WORK = 1, STONE_DAY = 3, MAX_SHIFT = 8;
/** pas des mineurs dans les galeries (cases par seconde de jeu) : la vue les fait marcher au même pas */
export const MINER_SPEED = 0.6;
/** la voie dépasse un peu le bout du quai : le train, plus long que lui, s'y arrête à cheval */
export const OVER = 0.3;

/** Gares : la petite gare, et le grand bâtiment devenu gare à l'âge industriel (les tours modernes ont la leur à leur pied) */
export const isStation = (b: Building) => b.kind === 'station' || b.kind === 'terminal' || b.kind === 'maglev';

/**
 * Arrêt d'une ligne : le quai d'une gare (sa voie, le long de x dans le repère du modèle, en z = 0.34) ou l'embranchement
 * posé au pied d'un avant-poste ; milieu, axe (unitaire) et demi-longueur du quai
 */
export interface Stop {
  b: Building;
  post: boolean;
  c: [number, number];
  u: [number, number];
  half: number;
  /** case de galerie sous l'avant-poste (-1 pour une gare) */
  entry: number;
  /** où les voyageurs attendent le train, à côté du quai (null : pas de place) */
  board: [number, number] | null;
}

/** Tronçon de voie entre deux arrêts : du bout `ea` du quai de `a` au bout `eb` du quai de `b` (±1 le long de l'axe) */
export interface Seg { a: number; b: number; ea: number; eb: number; pts: [number, number][]; cum: number[]; len: number }

/** Trajet du train d'un arrêt au suivant : le quai de départ, le tronçon, le quai d'arrivée */
export interface Leg {
  pts: [number, number][]; cum: number[]; len: number;
  /** milieu du train à quai au départ et à l'arrivée */
  s0: number; s1: number;
  from: Stop; to: Stop;
  /** tronçon parcouru (à rebours ou non) et où il commence ; bouts des quais par où l'on part et l'on arrive */
  seg: Seg; rev: boolean; segAt: number;
  ea: number; eb: number;
}

/** Habitants qui vont prendre le train : à quel arrêt ils descendront (-1 : la relève des mineurs) */
export interface Group { ids: number[]; to: number }

export interface Train {
  line: RailLine;
  /** arrêts en service de la ligne, dans l'ordre ; pourquoi le train ne roule pas (null : il roule) */
  stops: Stop[];
  /** points de passage de chaque tronçon entre ces arrêts (cases) */
  via: number[][];
  why: string | null;
  sig: string;
  /** arrêt où il est à quai (ou d'où il est parti), sens de parcours, trajet en cours et milieu du train sur ce trajet */
  at: number;
  dir: 1 | -1;
  leg: Leg | null;
  s: number;
  speed: number;
  t: number;
  phase: 'dwell' | 'run';
  /** le train a fait demi-tour : ses voitures sont dans l'autre sens sur le trajet ; bout du quai par où il est arrivé */
  flip: boolean;
  arrived: number | null;
  /** il attend que le quai suivant se libère */
  waiting: boolean;
  legs: Map<string, Leg>;
  /** voyageurs qui vont au quai, à bord ; relève des mineurs à bord, équipe au fond, équipe relevée qui remonte */
  boarding: Group[];
  aboard: Group[];
  relief: number[];
  crew: number[];
  back: number[];
  /** avant-poste de la ligne où descendent les mineurs (rang dans `stops`, -1 : aucun) */
  mine: number;
  cargo: { ore: number; stone: number };
  pile: { ore: number; stone: number };
  vein: number;
  dig: number;
  veinOre: number;
  spot: number;
  walk: number;
  veinsLeft: boolean;
  pickT: number;
  dist: { key: string; d: Int32Array } | null;
  /** remonté depuis le début de la partie, filons abattus, voyageurs menés à bon port */
  delivered: { ore: number; stone: number };
  dug: number;
  carried: number;
}

/**
 * Chemin de fer : des lignes tracées par le joueur d'une gare à l'autre (A → B → … → X), avec des avant-postes pour arrêts.
 * La voie se pose d'elle-même entre deux arrêts successifs ; sur chaque ligne, un train fait la navette d'un bout à l'autre.
 * Il prend et dépose des voyageurs aux gares, descend une équipe de mineurs à l'avant-poste et remonte celle d'avant avec
 * ce qu'elle a tiré des galeries tenues (minerai des filons, pierre taillée)
 */
export class Railway {
  trains = new Map<number, Train>();
  onNews: ((msg: string) => void) | null = null;
  /** change à chaque fois que les voies changent (la vue les redessine) */
  version = 0;
  private stops = new Map<number, Stop | null>();
  private segs = new Map<string, Seg | null>();
  /** cases des embranchements d'avant-postes : aucune autre voie n'y passe */
  private spurs = new Map<number, number>();
  private entries = new Map<number, number>();
  /** tracés calculés pour l'éditeur de ligne (le même tronçon se redemande à chaque image) */
  private plans = new Map<string, { seg: Seg | null; pieces: (number[] | null)[] }>();
  private key = '';
  private refreshT = 0;
  private newsT = 0;

  constructor(private world: World, private agents: Agents, private ex: Expeditions, private dayLen: () => number, private rnd: () => number = Math.random) {}

  update(dt: number) {
    this.newsT -= dt;
    if ((this.refreshT -= dt) <= 0) { this.refreshT = 2; this.refresh(); }
    for (const tr of this.trains.values()) {
      if (tr.why) continue;
      this.mineStep(tr, dt);
      this.step(tr, dt);
    }
  }

  // ---------- Lignes (le joueur les trace) ----------

  /** Nouvelle ligne par ces arrêts, dans l'ordre (et, tronçon par tronçon, par ces points de passage) */
  addLine(stops: number[], via?: number[][]): RailLine {
    const w = this.world, used = new Set(w.lines.map((l) => l.color));
    const l: RailLine = { id: Math.max(0, ...w.lines.map((x) => x.id)) + 1, stops: [...stops], color: LINE_COLORS.find((c) => !used.has(c)) ?? LINE_COLORS[w.lines.length % LINE_COLORS.length] };
    if (via?.some((v) => v.length)) l.via = via.map((v) => [...v]);
    w.lines.push(l);
    w.linesAuto = false;
    this.refresh(true);
    return l;
  }

  /** La ligne passe désormais par ces arrêts (et par ces points de passage ; sans eux, la voie se pose d'elle-même) */
  setStops(id: number, stops: number[], via?: number[][]) {
    const l = this.world.lines.find((x) => x.id === id);
    if (!l) return;
    l.stops = [...stops];
    if (via?.some((v) => v.length)) l.via = via.map((v) => [...v]); else delete l.via;
    this.refresh(true);
  }

  /**
   * Tracé d'un tronçon pour l'éditeur de ligne, de l'arrêt `a` à l'arrêt `b` par les cases `via` : le tronçon (null s'il ne
   * passe pas) et, morceau par morceau (d'un point au suivant), ses cases, ou null pour un morceau impossible ; null si l'un
   * des deux bâtiments ne fait pas d'arrêt
   */
  plan(a: Building, b: Building, via: number[]): { seg: Seg | null; pieces: (number[] | null)[] } | null {
    const A = this.stopOf(a), B = this.stopOf(b), w = this.world;
    if (!A || !B) return null;
    const key = `${a.id}>${b.id}|${via.join(',')}|${w.version}|${w.visVersion}|${this.version}`;
    let p = this.plans.get(key);
    if (!p) {
      if (this.plans.size > 48) this.plans.clear();
      p = this.lay(A, B, via);
      this.plans.set(key, p);
    }
    return p;
  }

  removeLine(id: number) {
    const w = this.world;
    w.lines = w.lines.filter((l) => l.id !== id);
    w.linesAuto = false;
    this.refresh(true);
  }

  /** Ligne qui fait déjà ce parcours (les mêmes arrêts, dans un sens ou dans l'autre), hors `except` */
  sameAs(stops: number[], except?: number): RailLine | undefined {
    const key = stops.join('.'), rev = [...stops].reverse().join('.');
    return this.world.lines.find((l) => l.id !== except && (l.stops.join('.') === key || l.stops.join('.') === rev));
  }

  /** Lignes qui s'arrêtent à ce bâtiment */
  linesAt(b: Building) { return this.world.lines.filter((l) => l.stops.includes(b.id)); }

  /** Nom d'un arrêt : gare centrale, petite gare (numérotée s'il y en a plusieurs), avant-poste */
  stopName(b: Building) {
    const same = [...this.world.buildings.values()].filter((x) => x.kind === b.kind).sort((p, q) => p.id - q.id), k = same.indexOf(b) + 1;
    const base = b.kind === 'terminal' ? KINDS.terminal.names[Math.max(3, b.age)] : b.kind === 'outpost' ? 'Avant-poste' : KINDS[b.kind].names[Math.max(b.age, KINDS[b.kind].minAge)];
    return same.length > 1 ? `${base} ${k}` : base;
  }

  /** Arrêts d'une ligne, en clair */
  lineLabel(l: RailLine) {
    return l.stops.map((id) => this.world.buildings.get(id)).map((b) => (b ? this.stopName(b) : 'arrêt démoli')).join(' → ');
  }

  // ---------- Le train ----------

  /** Point du trajet à la distance s, et cap */
  at(leg: Leg, s: number): [number, number, number] {
    const c = leg.cum;
    s = Math.max(0, Math.min(leg.len, s));
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const a = leg.pts[lo], b = leg.pts[hi], f = (s - c[lo]) / Math.max(1e-6, c[hi] - c[lo]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[0] - a[0], b[1] - a[1])];
  }

  /** Milieu du train (null : il ne roule pas) */
  trainAt(tr: Train): [number, number] | null {
    if (tr.why || !tr.leg) return null;
    const [x, z] = this.at(tr.leg, tr.s);
    return [x, z];
  }

  /** Habitants assis dans le train */
  seated(tr: Train) { return tr.aboard.reduce((n, g) => n + g.ids.length, 0) + tr.relief.length + tr.back.length; }

  /** Mineurs par équipe : deux, plus un par niveau du camp souterrain, sans vider le village */
  shiftSize() { return Math.max(0, Math.min(MAX_SHIFT, 2 + this.ex.camp(), this.agents.available() - 2)); }

  /** Ce que les mineurs de toutes les lignes tirent des galeries chaque jour, à peu près */
  daily(): { ore: number; stone: number } {
    const out = { ore: 0, stone: 0 };
    for (const tr of this.trains.values()) { const d = this.trainDaily(tr); out.ore += d.ore; out.stone += d.stone; }
    return out;
  }

  trainDaily(tr: Train): { ore: number; stone: number } {
    const n = tr.crew.length;
    if (!n || tr.why) return { ore: 0, stone: 0 };
    return tr.vein >= 0 || tr.veinsLeft ? { ore: Math.round((n / VEIN_WORK) * 3.5), stone: Math.round((n / VEIN_WORK) * 2) } : { ore: 0, stone: n * STONE_DAY };
  }

  private step(tr: Train, dt: number) {
    tr.t += dt;
    if (tr.phase === 'dwell') {
      // on attend les voyageurs et la relève sur le quai, puis on part
      if (tr.t < DWELL || (tr.t <= BOARD_MAX && !tr.boarding.every((g) => this.agents.partyDone(g.ids)))) return;
      for (const g of tr.boarding) {
        this.agents.partyHide(g.ids, true);
        if (g.to < 0) tr.relief.push(...g.ids); else tr.aboard.push(g);
      }
      tr.boarding = [];
      // au bout de la ligne, demi-tour ; le quai suivant doit être libre (un autre train y est, ou y va)
      const dir = tr.at + tr.dir < 0 || tr.at + tr.dir >= tr.stops.length ? (-tr.dir as 1 | -1) : tr.dir;
      tr.waiting = tr.t < WAIT_MAX && (this.busy(tr, tr.stops[tr.at + dir]) || this.onTrack(tr, tr.stops[tr.at], tr.stops[tr.at + dir]));
      if (tr.waiting) return;
      tr.dir = dir;
      const leg = this.legOf(tr, tr.at, tr.at + tr.dir);
      if (!leg) return;
      // repartir par le bout du quai par où l'on est arrivé, c'est faire demi-tour : les voitures restent où elles sont
      if (tr.arrived !== null && tr.arrived === leg.ea) tr.flip = !tr.flip;
      tr.leg = leg; tr.s = leg.s0; tr.phase = 'run'; tr.t = 0;
      return;
    }
    // il prend de la vitesse au départ, freine à l'approche du quai
    const leg = tr.leg!, left = leg.s1 - tr.s;
    tr.speed = Math.min(tr.speed + ACCEL * dt, SPEED, Math.sqrt(2 * ACCEL * Math.max(0, left)) + 0.08);
    const step = tr.speed * dt;
    if (step < left) { tr.s += step; return; }
    tr.s = leg.s1; tr.speed = 0; tr.at += tr.dir; tr.arrived = leg.eb; tr.phase = 'dwell'; tr.t = 0;
    this.arrive(tr);
  }

  /** À quai : relève des mineurs à l'avant-poste ; à une gare, on décharge, les voyageurs descendent et d'autres montent */
  private arrive(tr: Train) {
    const st = tr.stops[tr.at], w = this.world;
    if (st.post) {
      if (tr.at === tr.mine) {
        // l'équipe d'avant monte à bord avec ce qui attendait au camp, la relève descend au travail
        tr.back.push(...tr.crew);
        tr.crew = tr.relief; tr.relief = [];
        const ore = Math.floor(tr.pile.ore), stone = Math.floor(tr.pile.stone);
        tr.cargo.ore += ore; tr.cargo.stone += stone; tr.pile.ore -= ore; tr.pile.stone -= stone;
      }
      return;
    }
    // le minerai et la pierre rentrent au village
    const c = tr.cargo, off = [...tr.back], home = tr.back.length;
    w.ore += c.ore; w.stone += c.stone;
    tr.delivered.ore += c.ore; tr.delivered.stone += c.stone;
    if ((c.ore || c.stone) && this.newsT <= 0) {
      this.newsT = 120;
      const got = [c.ore ? `+${c.ore} minerai` : '', c.stone ? `+${c.stone} pierre` : ''].filter(Boolean).join(', ');
      this.onNews?.(`🚂 Le train remonte des profondeurs à ${this.stopName(st.b)} : ${got}${home ? ` ; ${home} mineur${home > 1 ? 's' : ''} rentre${home > 1 ? 'nt' : ''} au village` : ''}.`);
    }
    tr.cargo = { ore: 0, stone: 0 };
    tr.back = [];
    // on descend : voyageurs arrivés, mineurs relevés
    tr.aboard = tr.aboard.filter((g) => { if (g.to !== tr.at) return true; off.push(...g.ids); tr.carried += g.ids.length; return false; });
    this.release(off, st.board);
    if (!st.board) return;
    // on monte : la relève des mineurs si l'avant-poste est devant, quelques voyageurs pour une gare plus loin
    const n = tr.stops.length, dir = tr.at + tr.dir < 0 || tr.at + tr.dir >= n ? -tr.dir : tr.dir, ahead: number[] = [];
    for (let k = tr.at + dir; k >= 0 && k < n; k += dir) ahead.push(k);
    if (tr.mine >= 0 && ahead.includes(tr.mine) && !tr.relief.length) this.call(tr, st, this.shiftSize(), -1);
    const dest = ahead.filter((k) => !tr.stops[k].post);
    if (dest.length && this.agents.available() > 8 && this.rnd() < 0.85) this.call(tr, st, 1 + Math.floor(this.rnd() * 3), dest[Math.floor(this.rnd() * dest.length)]);
  }

  /** Des habitants se rendent sur le quai pour prendre le train */
  private call(tr: Train, st: Stop, n: number, to: number) {
    const ids = n > 0 ? this.agents.recruit(n) : null;
    if (!ids?.length || !st.board) return;
    this.agents.partyGo(ids, st.board[0], st.board[1], 0.5);
    tr.boarding.push({ ids, to });
  }

  /** Descendus du train (ou rendus quand la ligne ferme) : ils rentrent chez eux à pied */
  private release(ids: number[], at: [number, number] | null) {
    if (!ids.length) return;
    if (at) this.agents.partyPlace(ids, at[0], at[1]);
    this.agents.partyHide(ids, false);
    this.agents.dismiss(ids);
  }

  // ---------- Les mineurs au fond ----------

  private mineStep(tr: Train, dt: number) {
    const n = tr.crew.length, w = this.world;
    if (!n || !this.ex.under || tr.mine < 0) return;
    const day = dt / this.dayLen();
    if ((tr.vein < 0 || w.mined.has(tr.vein) || !w.claimed.has(tr.vein)) && (tr.pickT -= dt) <= 0) {
      tr.pickT = 3;
      tr.vein = this.pickVein(tr);
      tr.veinsLeft = tr.vein >= 0;
      tr.dig = 0;
    }
    // plus de filon dans les galeries tenues : on taille la roche au camp
    if (tr.vein < 0 || w.mined.has(tr.vein)) { tr.vein = -1; tr.spot = -1; tr.pile.stone += day * n * STONE_DAY; return; }
    // en chemin vers le filon
    if (tr.walk > 0) { tr.walk -= dt; return; }
    tr.dig += (day * n) / VEIN_WORK;
    if (tr.dig < 1) return;
    const camp = this.ex.camp();
    tr.pile.ore += ORE_KINDS[tr.veinOre].amount + 1 + (camp >= 3 ? 1 : 0) + (camp >= 8 ? 1 : 0);
    tr.pile.stone += 2;
    w.mined.add(tr.vein);
    w.version++;
    tr.dug++;
    // on passe aussitôt au filon suivant
    tr.spot = tr.vein;
    tr.dig = 0; tr.pickT = 3;
    tr.vein = this.pickVein(tr);
    tr.veinsLeft = tr.vein >= 0;
  }

  /**
   * Filon encore en place dans les galeries tenues, le plus proche de là où sont les mineurs (hors de ceux qu'une troupe
   * ou les mineurs d'une autre ligne vont abattre) ; on compte le chemin à faire jusqu'à lui
   */
  private pickVein(tr: Train) {
    const u = this.ex.under, w = this.world, entry = tr.stops[tr.mine]?.entry ?? -1;
    if (!u || entry < 0) return -1;
    const from = tr.spot >= 0 ? tr.spot : entry, key = `${from}|${u.version}`;
    if (tr.dist?.key !== key) tr.dist = { key, d: u.distances(from) };
    const d = tr.dist.d, taken = new Set([...this.ex.active.flatMap((a) => a.targets), ...[...this.trains.values()].filter((o) => o !== tr).map((o) => o.vein)]);
    let best = -1;
    for (const v of oreVeins(u, w.mined)) {
      if (!w.claimed.has(v.k) || taken.has(v.k) || d[v.k] < 0) continue;
      if (best < 0 || d[v.k] < d[best]) { best = v.k; tr.veinOre = v.ore; }
    }
    if (best >= 0) tr.walk = d[best] / MINER_SPEED;
    return best;
  }

  // ---------- Le réseau ----------

  /** Voies à dessiner : tronçons, arrêts desservis et bouts de quai où arrive une voie */
  network(): { segs: Seg[]; stops: Stop[]; used: Map<number, Set<number>> } {
    const stops = new Map<number, Stop>(), used = new Map<number, Set<number>>();
    for (const tr of this.trains.values()) if (!tr.why) for (const s of tr.stops) stops.set(s.b.id, s);
    const segs = [...this.segs.values()].filter((s): s is Seg => !!s && stops.has(s.a) && stops.has(s.b));
    for (const s of segs) for (const [id, e] of [[s.a, s.ea], [s.b, s.eb]]) { if (!used.has(id)) used.set(id, new Set()); used.get(id)!.add(e); }
    return { segs, stops: [...stops.values()], used };
  }

  /** Repose les voies quand les lignes, les bâtiments ou le relief changent ; `force` : tout de suite */
  refresh(force = false) {
    const w = this.world;
    const keyOf = () => {
      let key = `${w.visVersion}|${[...this.entries].join(',')}|${w.lines.map((l) => `${l.id}:${l.stops.join('.')}/${l.via?.map((v) => v.join(',')).join('/') ?? ''}`).join(';')}|`;
      for (const b of w.buildings.values()) key += `${b.id}:${b.x},${b.z},${b.rot},${b.age};`;
      return key;
    };
    this.entries = new Map(this.ex.under ? this.ex.outposts().map((p) => [p.b.id, p.entry]) : []);
    let key = keyOf();
    if (key === this.key && !force) return;
    this.stops.clear(); this.segs.clear(); this.spurs.clear();
    for (const b of w.buildings.values()) if (b.kind === 'outpost') this.stopOf(b);
    if (this.autoLine()) key = keyOf();
    this.key = key;
    this.version++;
    const live = new Set<number>();
    for (const l of w.lines) {
      live.add(l.id);
      // un arrêt hors service : les tronçons de part et d'autre n'en font qu'un, avec leurs points de passage bout à bout
      const all = l.stops.map((id) => w.buildings.get(id)).map((b) => (b ? this.stopOf(b) : null));
      const kept = all.map((s, i) => (s ? i : -1)).filter((i) => i >= 0), stops = kept.map((i) => all[i]!);
      const via = mergeVia(l.via, kept) ?? [];
      const sig = stops.map((s) => s.b.id).join('.');
      let tr = this.trains.get(l.id);
      if (tr && tr.sig !== sig) { this.reset(tr); tr = undefined; }
      if (!tr) { tr = this.newTrain(l, stops, sig); this.trains.set(l.id, tr); }
      tr.line = l; tr.stops = stops; tr.via = via; tr.legs.clear();
      tr.mine = stops.findIndex((s) => s.post);
      const was = tr.why;
      const twin = this.sameAs(l.stops, l.id);
      tr.why = stops.length < 2 ? (l.stops.length >= 2 ? 'Il lui manque des arrêts en service (gare démolie, avant-poste sans place pour un quai…).' : 'Il faut au moins deux arrêts.')
        : twin && twin.id < l.id ? 'Même parcours qu’une autre ligne : sur une voie unique, un seul train peut y rouler. Fermez l’une des deux.' : null;
      for (let i = 0; !tr.why && i + 1 < stops.length; i++) {
        if (this.seg(stops[i], stops[i + 1], via[i])) continue;
        const a = this.stopName(stops[i].b), b = this.stopName(stops[i + 1].b);
        tr.why = via[i]?.length ? `La voie ne passe pas par les points choisis entre ${a} et ${b} : un point est sur un obstacle, ou de l’eau, des bâtiments, des pentes trop raides barrent le chemin.`
          : `Pas de voie possible entre ${a} et ${b} : de l’eau, des bâtiments ou des pentes trop raides barrent le chemin.`;
      }
      if (tr.why) { this.reset(tr); continue; }
      if (was || !tr.leg) { this.start(tr); continue; }
      // le tracé a bougé : le train garde sa place sur son trajet, à proportion
      const from = tr.phase === 'run' ? tr.at : tr.at - tr.dir, to = tr.phase === 'run' ? tr.at + tr.dir : tr.at;
      const old = tr.leg, leg = from >= 0 && from < stops.length && to >= 0 && to < stops.length ? this.legOf(tr, from, to) : null;
      if (!leg) { this.reset(tr); this.start(tr); continue; }
      tr.s = leg.s0 + ((tr.s - old.s0) / Math.max(1e-6, old.s1 - old.s0)) * (leg.s1 - leg.s0);
      tr.leg = leg;
    }
    for (const [id, tr] of this.trains) if (!live.has(id)) { this.reset(tr); this.trains.delete(id); }
  }

  /** Tant que le joueur n'a tracé aucune ligne, la première relie d'elle-même la gare à l'avant-poste */
  private autoLine() {
    const w = this.world;
    if (!w.linesAuto || w.lines.length) return false;
    const all = [...w.buildings.values()], st = all.find((b) => isStation(b) && this.stopOf(b)), post = all.find((b) => b.kind === 'outpost' && this.stopOf(b));
    if (!st || !post) return false;
    w.lines.push({ id: 1, stops: [st.id, post.id], color: LINE_COLORS[0] });
    w.linesAuto = false;
    this.onNews?.('🚂 Une première ligne relie la gare à l’avant-poste. Choisissez une gare pour en tracer d’autres, de gare en gare.');
    return true;
  }

  private newTrain(line: RailLine, stops: Stop[], sig: string): Train {
    return {
      line, stops, via: [], why: null, sig, at: 0, dir: 1, leg: null, s: 0, speed: 0, t: 0, phase: 'dwell', flip: false, arrived: null, waiting: false, legs: new Map(),
      boarding: [], aboard: [], relief: [], crew: [], back: [], mine: -1, cargo: { ore: 0, stone: 0 }, pile: { ore: 0, stone: 0 },
      vein: -1, dig: 0, veinOre: 0, spot: -1, walk: 0, veinsLeft: false, pickT: 0, dist: null, delivered: { ore: 0, stone: 0 }, dug: 0, carried: 0,
    };
  }

  /** Un autre train est à quai à cet arrêt, ou y va */
  private busy(tr: Train, st: Stop | undefined) {
    if (!st) return false;
    for (const o of this.trains.values()) {
      if (o === tr || o.why || !o.leg) continue;
      const there = o.phase === 'dwell' ? o.stops[o.at] : o.stops[o.at + o.dir];
      if (there?.b.id === st.b.id) return true;
    }
    return false;
  }

  /** Un autre train roule sur le tronçon entre ces deux arrêts, dans un sens ou dans l'autre (voie unique) */
  private onTrack(tr: Train, a: Stop | undefined, b: Stop | undefined) {
    if (!a || !b) return false;
    for (const o of this.trains.values()) {
      if (o === tr || o.why || o.phase !== 'run') continue;
      const p = o.stops[o.at]?.b.id, q = o.stops[o.at + o.dir]?.b.id;
      if ((p === a.b.id && q === b.b.id) || (p === b.b.id && q === a.b.id)) return true;
    }
    return false;
  }

  /** Le train attend au premier arrêt libre de sa ligne (deux lignes peuvent partir de la même gare) */
  private start(tr: Train) {
    const n = tr.stops.length, k = Math.max(0, tr.stops.findIndex((s) => !this.busy(tr, s)));
    tr.at = k; tr.dir = k === n - 1 ? -1 : 1; tr.flip = false; tr.arrived = null; tr.phase = 'dwell'; tr.t = 0; tr.speed = 0; tr.waiting = false;
    tr.leg = this.legOf(tr, k, k + tr.dir);
    tr.s = tr.leg?.s0 ?? 0;
    this.arrive(tr);
  }

  /** Ligne fermée ou changée : tout le monde rentre au village, la cargaison aussi */
  private reset(tr: Train) {
    const at = tr.stops.find((s) => s.board)?.board ?? null;
    for (const ids of [tr.relief, tr.crew, tr.back, ...tr.aboard.map((g) => g.ids), ...tr.boarding.map((g) => g.ids)]) this.release(ids, at);
    tr.relief = []; tr.crew = []; tr.back = []; tr.aboard = []; tr.boarding = [];
    this.world.ore += tr.cargo.ore; this.world.stone += tr.cargo.stone;
    tr.cargo = { ore: 0, stone: 0 };
    tr.vein = -1; tr.dig = 0; tr.spot = -1; tr.walk = 0;
    tr.leg = null; tr.phase = 'dwell'; tr.at = 0; tr.dir = 1;
  }

  /** Trajet d'un arrêt à l'autre (du milieu d'un quai au milieu de l'autre) */
  private legOf(tr: Train, i: number, j: number): Leg | null {
    const key = `${i}>${j}`, known = tr.legs.get(key);
    if (known) return known;
    // les points de passage du tronçon sont rangés dans le sens de la ligne
    const P = tr.stops[i], Q = tr.stops[j], lo = Math.min(i, j), seg = P && Q ? this.seg(tr.stops[lo], tr.stops[lo + 1], tr.via[lo]) : null;
    if (!seg) return null;
    const rev = seg.a !== P.b.id, ea = rev ? seg.eb : seg.ea, eb = rev ? seg.ea : seg.eb, mid = rev ? [...seg.pts].reverse() : seg.pts;
    const along = (s: Stop, k: number): [number, number] => [s.c[0] + s.u[0] * k, s.c[1] + s.u[1] * k];
    const pts = [along(P, -ea * (P.half + OVER)), P.c, ...mid, Q.c, along(Q, -eb * (Q.half + OVER))], cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const leg: Leg = { pts, cum, len: cum[cum.length - 1], s0: cum[1], s1: cum[cum.length - 2], from: P, to: Q, seg, rev, segAt: cum[2], ea, eb };
    tr.legs.set(key, leg);
    return leg;
  }

  // ---------- Arrêts ----------

  /** L'arrêt que fait ce bâtiment (gare, ou avant-poste qui garde une entrée et a la place d'un quai), ou null */
  stopOf(b: Building): Stop | null {
    if (this.stops.has(b.id)) return this.stops.get(b.id)!;
    const s = isStation(b) ? this.stationStop(b) : b.kind === 'outpost' ? this.postStop(b) : null;
    this.stops.set(b.id, s);
    return s;
  }

  private stationStop(b: Building): Stop {
    const w = this.world, th = (b.rot * Math.PI) / 2, cs = Math.cos(th), sn = Math.sin(th), cx = b.x + 1, cz = b.z + 1;
    const c: [number, number] = [cx + 0.34 * sn, cz + 0.34 * cs], u: [number, number] = [cs, -sn], half = 0.95;
    // les voyageurs attendent au bout du quai, à côté de la voie, sur une case où l'on marche
    let board: [number, number] | null = null;
    for (const sg of [1, -1]) for (const side of [-1, 1]) {
      if (board) break;
      const p: [number, number] = [c[0] + u[0] * sg * (half + 0.5) - u[1] * side * 0.45, c[1] + u[1] * sg * (half + 0.5) + u[0] * side * 0.45];
      const x = Math.floor(p[0]), z = Math.floor(p[1]);
      if (w.inCells(x, z) && !w.occ[z * N + x] && !w.decor[z * N + x] && !w.isWet(x, z)) board = p;
    }
    return { b, post: false, c, u, half, entry: -1, board };
  }

  /**
   * Embranchement au pied de l'avant-poste : un quai droit sur une bande de terrain libre et à peu près plate tout autour
   * (jusqu'à quatre cases, dans un sens ou dans l'autre), au plus près des murs et loin de la grotte
   */
  private postStop(b: Building): Stop | null {
    const w = this.world, entry = this.entries.get(b.id) ?? -1;
    if (entry < 0) return null;
    const s = KINDS.outpost.size, cave = w.outpostEntrance(b.x, b.z, s), kx = (cave % N) + 0.5, kz = Math.floor(cave / N) + 0.5, half = 1.2;
    const ox = b.x + s / 2, oz = b.z + s / 2;
    let best: Stop | null = null, score = -Infinity;
    for (let cz = b.z - 4; cz < b.z + s + 4; cz++) for (let cx = b.x - 4; cx < b.x + s + 4; cx++) for (const u of [[1, 0], [0, 1]] as [number, number][]) {
      // le milieu du quai au milieu d'une case, ou entre deux cases dans le sens de la voie
      for (const off of [0, 0.5]) {
        const c: [number, number] = [cx + 0.5 + u[0] * off, cz + 0.5 + u[1] * off];
        const d = Math.hypot(c[0] - ox, c[1] - oz), sc = -d + Math.hypot(c[0] - kx, c[1] - kz) * 0.3;
        if (sc <= score) continue;
        let ok = true, lo = Infinity, hi = -Infinity;
        for (let t = -half - OVER + 0.05; t < half + OVER && ok; t += 0.25) {
          const x = Math.floor(c[0] + u[0] * t), z = Math.floor(c[1] + u[1] * t);
          ok = w.inCells(x, z) && !w.road[z * N + x] && !w.isWet(x, z) && isFinite(this.cost(z * N + x)) && w.cellSlope(x, z) < 0.6;
          if (ok) { const h = w.cellAvg(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        }
        if (!ok || hi - lo > 0.45) continue;
        score = sc;
        best = { b, post: true, c, u, half, entry, board: null };
      }
    }
    // les cases que couvre le quai (pas celle où il s'arrête pile sur la limite : la voie en repart)
    if (best) for (let t = -half - OVER + 0.05; t < half + OVER; t += 0.25) this.spurs.set(Math.floor(best.c[1] + best.u[1] * t) * N + Math.floor(best.c[0] + best.u[0] * t), b.id);
    return best;
  }

  // ---------- La voie ----------

  /** Coût d'une case pour la voie (Infinity : on n'y passe pas) */
  private cost(k: number) {
    const w = this.world, x = k % N, z = (k - x) / N, v = w.veg[k];
    if (w.occ[k] || w.decor[k] || v === VEG_VOLCANO) return Infinity;
    // sur l'eau, un pont (rivière, lac, mer peu profonde ; pas au large) : on y passe, mais la terre ferme coûte moins
    if (w.isWet(x, z)) return w.lake[k] === 1 || w.cellAvg(x, z) > -1.7 ? 5 : Infinity;
    return 1 + (v === VEG_FOREST ? 1.5 : v === VEG_FIELD || v === VEG_GARDEN ? 3 : v === VEG_ROCKS ? 1 : 0) + (w.road[k] ? 1.2 : 0) + w.cellSlope(x, z) * 5;
  }

  /** Hauteur de la voie sur une case : le sol, ou le tablier du pont au-dessus de l'eau */
  private railH(x: number, z: number) { return this.world.deckY(x, z) ?? this.world.cellAvg(x, z); }

  /**
   * Tronçon entre deux arrêts, par ces points de passage (rangés de A à B), calculé une fois pour les deux sens ; null s'il
   * n'y a pas de passage. Deux lignes qui relient les mêmes arrêts par des points différents ont chacune sa voie
   */
  private seg(A: Stop, B: Stop, via: number[] = []): Seg | null {
    const flip = A.b.id > B.b.id, [P, Q] = flip ? [B, A] : [A, B], v = flip ? [...via].reverse() : via;
    const key = `${P.b.id}|${Q.b.id}${v.length ? `|${v.join(',')}` : ''}`;
    if (!this.segs.has(key)) this.segs.set(key, this.lay(P, Q, v).seg);
    return this.segs.get(key)!;
  }

  /** Chemin le moins coûteux (Dijkstra, 8-voisinage) de l'une des cases de départ à l'une des cases d'arrivée, ou null */
  private route(starts: number[], goals: Set<number>, cost: (k: number) => number): number[] | null {
    const w = this.world, dist = new Float32Array(N * N).fill(Infinity), prev = new Int32Array(N * N).fill(-1), heap = new Heap();
    for (const s of starts) { dist[s] = 0; heap.push(0, s); }
    let hit = -1;
    while (heap.size) {
      const kk = heap.keys[0], c = heap.pop();
      if (kk > dist[c] + 1e-4) continue;
      if (goals.has(c)) { hit = c; break; }
      const x = c % N, z = (c - x) / N, hc = this.railH(x, z);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (!w.inCells(nx, nz)) continue;
        const n = nz * N + nx, cn = cost(n);
        const hn = this.railH(nx, nz);
        if (!isFinite(cn) || Math.abs(hn - hc) > 0.9) continue;
        // en diagonale, pas entre deux obstacles
        if (dx && dz && (!isFinite(cost(z * N + nx)) || !isFinite(cost(nz * N + x)))) continue;
        const nd = dist[c] + cn * (dx && dz ? Math.SQRT2 : 1) + Math.abs(hn - hc) * 4;
        if (nd < dist[n]) { dist[n] = nd; prev[n] = c; heap.push(nd, n); }
      }
    }
    if (hit < 0) return null;
    const cells: number[] = [];
    for (let c = hit; c >= 0; c = prev[c]) cells.push(c);
    return cells.reverse();
  }

  /**
   * Tracé le moins coûteux d'un bout de quai de A à un bout de quai de B, sortant dans l'axe des quais, lissé ; s'il y a des
   * points de passage, il va de l'un à l'autre dans l'ordre (un morceau de chemin pour chacun) et passe par chacun. Avec le
   * tronçon (null s'il ne passe pas), les cases de chaque morceau (null : morceau impossible, point posé sur un obstacle…)
   */
  private lay(A: Stop, B: Stop, via: number[] = []): { seg: Seg | null; pieces: (number[] | null)[] } {
    const w = this.world;
    const cellOf = (p: [number, number]) => (w.inCells(Math.floor(p[0]), Math.floor(p[1])) ? Math.floor(p[1]) * N + Math.floor(p[0]) : -1);
    const along = (s: Stop, k: number): [number, number] => [s.c[0] + s.u[0] * k, s.c[1] + s.u[1] * k];
    // on ne traverse pas l'embranchement d'un avant-poste
    const cost = (k: number) => (this.spurs.has(k) ? Infinity : this.cost(k));
    // sorties : dans l'axe du quai, sur deux cases si l'on peut (la courbe qui suit en est plus douce)
    const exits = (s: Stop) => [1, -1].flatMap((sg) => {
      // au-delà de l'emprise de la gare, ou du bout de l'embranchement de l'avant-poste
      const e = s.half + (s.post ? OVER : 0) + 0.55, p1 = along(s, sg * e), p2 = along(s, sg * (e + 1)), k1 = cellOf(p1), k2 = cellOf(p2);
      if (k1 < 0 || !isFinite(cost(k1))) return [];
      const far = k2 >= 0 && isFinite(cost(k2));
      return [{ sg, k: far ? k2 : k1, p: far ? p2 : p1 }];
    });
    const starts = exits(A), goals = new Map(exits(B).map((g) => [g.k, g])), from = new Map(starts.map((s) => [s.k, s]));
    // un morceau de chemin jusqu'à chaque point de passage, puis jusqu'au quai de B ; un morceau impossible n'empêche pas de
    // chercher les suivants (l'éditeur les montre tous)
    const ends = [...via.map((k) => new Set([k])), new Set(goals.keys())], pieces: (number[] | null)[] = [];
    let at = starts.map((s) => s.k);
    for (const end of ends) {
      const p = at.length ? this.route(at, end, cost) : null;
      pieces.push(p);
      at = p ? [p[p.length - 1]] : [...end].filter((k) => isFinite(cost(k)));
    }
    if (!starts.length || !goals.size || pieces.some((p) => !p)) return { seg: null, pieces };
    // les morceaux bout à bout ; les cases des points de passage restent des points de la voie
    const cells: number[] = [], ends2: number[] = [];
    for (const p of pieces as number[][]) {
      for (const k of cells.length && cells[cells.length - 1] === p[0] ? p.slice(1) : p) cells.push(k);
      ends2.push(cells.length - 1);
    }
    // les cases des points de passage restent des sommets de la voie, et aussi celles à trois pas de part et d'autre : le
    // lissage n'arrondit qu'un petit angle, la voie passe tout près du point choisi
    const must = [...new Set(ends2.flatMap((m) => (m === cells.length - 1 ? [m] : [m - 3, m, m + 3])))].filter((m) => m > 0 && m < cells.length).sort((p, q) => p - q);
    const hit = cells[cells.length - 1], sa = from.get(cells[0])!, sb = goals.get(hit)!;
    const centre = (k: number): [number, number] => [(k % N) + 0.5, Math.floor(k / N) + 0.5];
    // on garde les cases d'angle, on file tout droit ailleurs tant que la voie reste sur des cases praticables
    const clear = (a: [number, number], b: [number, number]) => {
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25);
      for (let i = 1; i < n; i++) {
        const k = cellOf([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
        if (k < 0 || cost(k) > 2.6) return false;
      }
      return true;
    };
    const keep: [number, number][] = [centre(cells[0])];
    for (let i = 0; i < cells.length - 1;) {
      let j = Math.min(must.find((m) => m > i) ?? cells.length - 1, i + 10);
      while (j > i + 1 && !clear(centre(cells[i]), centre(cells[j]))) j--;
      keep.push(centre(cells[j]));
      i = j;
    }
    // des bouts des quais aux sorties dans leur axe, puis courbes adoucies (Chaikin, bouts fixes)
    let pts: [number, number][] = [along(A, sa.sg * A.half), sa.p, ...keep.slice(1, -1), sb.p, along(B, sb.sg * B.half)];
    for (let it = 0; it < 3 && pts.length > 2; it++) {
      const out: [number, number][] = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (i > 0) out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        if (i < pts.length - 2) out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { seg: { a: A.b.id, b: B.b.id, ea: sa.sg, eb: sb.sg, pts, cum, len: cum[cum.length - 1] }, pieces };
  }
}
