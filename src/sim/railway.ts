import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS, VEG_VOLCANO } from '../world/world';
import { Building, KINDS } from '../build/catalog';
import { ORE_KINDS, oreVeins } from '../world/underground';
import { Agents, Heap } from './agents';
import type { Expeditions } from './expeditions';

/** Le train : à quai en gare, en route vers l'avant-poste, à quai au pied de la grotte, en route vers la gare */
export type TrainPhase = 'station' | 'down' | 'post' | 'up';

/** Ligne de chemin de fer de la gare à l'avant-poste : son tracé lissé (en cases), ses longueurs cumulées */
export interface Line {
  station: Building; post: Building;
  /** case de galerie sous l'avant-poste, où les mineurs descendent */
  entry: number;
  pts: [number, number][]; cum: number[]; len: number;
  /** quai de la gare, où les mineurs attendent le train et d'où ils rentrent chez eux */
  board: [number, number];
}

/** Longueur du train (deux locomotives, la voiture des mineurs, deux wagons de minerai), en cases */
export const TRAIN_LEN = 2.3;
/** vitesse de pointe (cases par seconde de jeu), accélération, arrêt à quai, attente des retardataires */
const SPEED = 1.8, ACCEL = 0.7, DWELL = 6, BOARD_MAX = 30;
/** jours-mineur pour abattre un filon ; pierre taillée par mineur et par jour quand les galeries tenues n'en ont plus */
const VEIN_WORK = 1, STONE_DAY = 3, MAX_SHIFT = 8;
/** pas des mineurs dans les galeries (cases par seconde de jeu) : la vue les fait marcher au même pas */
export const MINER_SPEED = 0.6;

/** Gare du village : le bâtiment majeur, à l'âge industriel puis moderne */
export const isStation = (b: Building) => b.kind === 'landmark' && b.age >= 3;

/**
 * Chemin de fer entre la gare et l'avant-poste : la voie se pose d'elle-même entre les deux, le train descend une équipe de
 * mineurs et remonte celle d'avant avec ce qu'elle a tiré des galeries tenues (minerai des filons, pierre taillée)
 */
export class Railway {
  line: Line | null = null;
  phase: TrainPhase = 'station';
  /** bout du train côté gare, en cases le long de la ligne, et sa vitesse */
  pos = 0;
  speed = 0;
  /** à bord vers le fond, au travail sous terre, remontant au village */
  riders: number[] = [];
  below: number[] = [];
  up: number[] = [];
  /** à bord du train, et entassé au camp en attendant le prochain */
  cargo = { ore: 0, stone: 0 };
  pile = { ore: 0, stone: 0 };
  /** filon attaqué par les mineurs (-1 : aucun) et avancement (0 … 1) */
  vein = -1;
  dig = 0;
  /** remonté par le train depuis le début de la partie, et filons abattus par les mineurs */
  delivered = { ore: 0, stone: 0 };
  dug = 0;
  onNews: ((msg: string) => void) | null = null;
  /** pourquoi il n'y a pas de ligne (null : elle roule) */
  why: string | null = null;
  private t = 0;
  private veinOre = 0;
  private pickT = 0;
  /** où se tiennent les mineurs (case de galerie ; -1 : au camp), ce qu'il leur reste à marcher jusqu'au filon (secondes) */
  private spot = -1;
  private walk = 0;
  private veinsLeft = false;
  private refreshT = 0;
  private key = '';
  private newsT = 0;
  private dist: { key: string; d: Int32Array } | null = null;

  constructor(private world: World, private agents: Agents, private ex: Expeditions, private dayLen: () => number) {}

  update(dt: number) {
    this.newsT -= dt;
    if ((this.refreshT -= dt) <= 0) { this.refreshT = 2; this.refresh(); }
    const l = this.line;
    if (!l) return;
    this.mineStep(dt);
    this.t += dt;
    if (this.phase === 'station') {
      // on attend les mineurs sur le quai, puis on part
      if (this.t >= DWELL && (this.agents.partyDone(this.riders) || this.t > BOARD_MAX)) {
        this.agents.partyHide(this.riders, true);
        this.phase = 'down'; this.t = 0;
      }
    } else if (this.phase === 'post') {
      if (this.t >= DWELL) { this.phase = 'up'; this.t = 0; }
    } else {
      // il prend de la vitesse au départ, freine à l'approche du quai
      const goal = this.phase === 'down' ? this.end() : 0, left = Math.abs(goal - this.pos);
      this.speed = Math.min(this.speed + ACCEL * dt, SPEED, Math.sqrt(2 * ACCEL * left) + 0.08);
      const step = this.speed * dt;
      if (step >= left) { this.pos = goal; this.speed = 0; this.arrive(); }
      else this.pos += this.phase === 'down' ? step : -step;
    }
  }

  /** Bout du train côté gare quand il est à quai à l'avant-poste */
  end() { return Math.max(0, (this.line?.len ?? 0) - TRAIN_LEN); }

  /** Mineurs par équipe : deux, plus un par niveau du camp, sans vider le village */
  shiftSize() { return Math.max(0, Math.min(MAX_SHIFT, 2 + this.ex.camp(), this.agents.available() - 2)); }

  /** Ce que l'équipe au fond tire des galeries chaque jour, à peu près */
  daily(): { ore: number; stone: number } {
    const n = this.below.length;
    if (!n) return { ore: 0, stone: 0 };
    return this.vein >= 0 || this.veinsLeft ? { ore: Math.round((n / VEIN_WORK) * 3.5), stone: Math.round((n / VEIN_WORK) * 2) } : { ore: 0, stone: n * STONE_DAY };
  }

  /** Point de la ligne à la distance s (en cases depuis la gare) et cap vers l'avant-poste */
  at(s: number): [number, number, number] {
    const l = this.line!, c = l.cum;
    s = Math.max(0, Math.min(l.len, s));
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const a = l.pts[lo], b = l.pts[hi], f = (s - c[lo]) / Math.max(1e-6, c[hi] - c[lo]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[0] - a[0], b[1] - a[1])];
  }

  // ---------- Le train à quai ----------

  private arrive() {
    this.t = 0;
    if (this.phase === 'down') {
      // au pied de la grotte : l'équipe descend au travail, celle d'avant monte à bord avec ce qui attendait au camp
      this.up = this.below; this.below = this.riders; this.riders = [];
      this.cargo = { ore: Math.floor(this.pile.ore), stone: Math.floor(this.pile.stone) };
      this.pile.ore -= this.cargo.ore; this.pile.stone -= this.cargo.stone;
      this.phase = 'post';
    } else {
      this.unload();
      this.board();
      this.phase = 'station';
    }
  }

  /** En gare : le minerai et la pierre rentrent au village, les mineurs relevés rentrent chez eux */
  private unload() {
    const w = this.world, c = this.cargo, n = this.up.length;
    w.ore += c.ore; w.stone += c.stone;
    this.delivered.ore += c.ore; this.delivered.stone += c.stone;
    if ((c.ore || c.stone || n) && this.newsT <= 0) {
      this.newsT = 120;
      const got = [c.ore ? `+${c.ore} minerai` : '', c.stone ? `+${c.stone} pierre` : ''].filter(Boolean).join(', ');
      this.onNews?.(`🚂 Le train remonte des profondeurs${got ? ` : ${got}` : ''}${n ? ` ; ${n} mineur${n > 1 ? 's' : ''} rentre${n > 1 ? 'nt' : ''} au village` : ''}.`);
    }
    this.cargo = { ore: 0, stone: 0 };
    this.release(this.up);
    this.up = [];
  }

  /** La relève se rend sur le quai de la gare */
  private board() {
    const n = this.shiftSize(), ids = n > 0 ? this.agents.recruit(n) : null;
    this.riders = ids ?? [];
    if (this.riders.length && this.line) this.agents.partyGo(this.riders, this.line.board[0], this.line.board[1], 0.5);
  }

  private release(ids: number[]) {
    if (!ids.length) return;
    this.agents.partyHide(ids, false);
    this.agents.dismiss(ids);
  }

  // ---------- Les mineurs au fond ----------

  private mineStep(dt: number) {
    const n = this.below.length, w = this.world;
    if (!n || !this.ex.under) return;
    const day = dt / this.dayLen();
    if ((this.vein < 0 || w.mined.has(this.vein) || !w.claimed.has(this.vein)) && (this.pickT -= dt) <= 0) {
      this.pickT = 3;
      this.vein = this.pickVein();
      this.veinsLeft = this.vein >= 0;
      this.dig = 0;
    }
    // plus de filon dans les galeries tenues : on taille la roche au camp
    if (this.vein < 0 || w.mined.has(this.vein)) { this.vein = -1; this.spot = -1; this.pile.stone += day * n * STONE_DAY; return; }
    // en chemin vers le filon
    if (this.walk > 0) { this.walk -= dt; return; }
    this.dig += (day * n) / VEIN_WORK;
    if (this.dig < 1) return;
    const camp = this.ex.camp();
    this.pile.ore += ORE_KINDS[this.veinOre].amount + 1 + (camp >= 3 ? 1 : 0) + (camp >= 8 ? 1 : 0);
    this.pile.stone += 2;
    w.mined.add(this.vein);
    w.version++;
    this.dug++;
    // on passe aussitôt au filon suivant
    this.spot = this.vein;
    this.dig = 0; this.pickT = 3;
    this.vein = this.pickVein();
    this.veinsLeft = this.vein >= 0;
  }

  /**
   * Filon encore en place dans les galeries tenues, le plus proche de là où sont les mineurs (hors de ceux qu'une troupe
   * va abattre) ; on compte le chemin à faire jusqu'à lui
   */
  private pickVein() {
    const u = this.ex.under, l = this.line, w = this.world;
    if (!u || !l) return -1;
    const from = this.spot >= 0 ? this.spot : l.entry, key = `${from}|${u.version}`;
    if (this.dist?.key !== key) this.dist = { key, d: u.distances(from) };
    const d = this.dist.d, taken = new Set(this.ex.active.flatMap((a) => a.targets));
    let best = -1;
    for (const v of oreVeins(u, w.mined)) {
      if (!w.claimed.has(v.k) || taken.has(v.k) || d[v.k] < 0) continue;
      if (best < 0 || d[v.k] < d[best]) { best = v.k; this.veinOre = v.ore; }
    }
    if (best >= 0) this.walk = d[best] / MINER_SPEED;
    return best;
  }

  // ---------- La voie ----------

  /** Repose la voie quand la gare, l'avant-poste, les bâtiments ou le relief changent */
  private refresh() {
    const w = this.world, stations = [...w.buildings.values()].filter(isStation);
    const posts = this.ex.under ? this.ex.outposts() : [];
    let key = `${w.visVersion}|${posts.map((p) => p.entry).join(',')}|`;
    for (const b of w.buildings.values()) key += `${b.id}:${b.x},${b.z},${b.rot},${b.age};`;
    if (key === this.key) return;
    this.key = key;
    const old = this.line;
    this.why = !stations.length ? 'station' : !this.ex.under ? 'under' : !posts.length ? 'post' : null;
    this.line = this.why ? null : this.lay(stations[0], posts);
    if (!this.line && !this.why) this.why = 'path';
    if (this.line && old && this.line.station.id === old.station.id && this.line.post.id === old.post.id) {
      // le tracé a bougé : le train garde sa place à proportion
      this.pos = Math.min(this.end(), (this.pos / Math.max(1, old.len)) * this.line.len);
      if (this.phase === 'station') this.pos = 0;
      if (this.phase === 'post') this.pos = this.end();
      return;
    }
    // ligne perdue ou nouvelle : tout le monde rentre, le train repart de la gare
    for (const ids of [this.riders, this.below, this.up]) this.release(ids);
    this.riders = []; this.below = []; this.up = [];
    this.world.ore += this.cargo.ore; this.world.stone += this.cargo.stone;
    this.cargo = { ore: 0, stone: 0 };
    this.vein = -1; this.dig = 0; this.spot = -1; this.walk = 0;
    this.pos = 0; this.speed = 0; this.t = 0; this.phase = 'station';
    if (this.line) {
      if (!old) this.onNews?.('🚂 La voie ferrée relie la gare à l’avant-poste : le train y descend des mineurs et remonte minerai et pierre des galeries tenues.');
      this.board();
    }
  }

  /** Coût d'une case pour la voie (Infinity : on n'y passe pas) */
  private cost(k: number) {
    const w = this.world, x = k % N, z = (k - x) / N, v = w.veg[k];
    if (w.occ[k] || w.decor[k] || v === VEG_VOLCANO || w.isWet(x, z)) return Infinity;
    return 1 + (v === VEG_FOREST ? 1.5 : v === VEG_FIELD || v === VEG_GARDEN ? 3 : v === VEG_ROCKS ? 1 : 0) + (w.road[k] ? 1.2 : 0) + w.cellSlope(x, z) * 5;
  }

  /** Tracé le moins coûteux de la gare (par l'un des bouts de son quai) à l'un des avant-postes, lissé */
  private lay(st: Building, posts: { b: Building; entry: number }[]): Line | null {
    const w = this.world, th = (st.rot * Math.PI) / 2, cs = Math.cos(th), sn = Math.sin(th), cx = st.x + 1, cz = st.z + 1;
    // les deux bouts de la voie du quai (repère du modèle : voie le long de x, en z = 0.34)
    const local = (lx: number, lz: number): [number, number] => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
    const cellOf = (p: [number, number]) => (w.inCells(Math.floor(p[0]), Math.floor(p[1])) ? Math.floor(p[1]) * N + Math.floor(p[0]) : -1);
    const dist = new Float32Array(N * N).fill(Infinity), prev = new Int32Array(N * N).fill(-1), goal = new Int32Array(N * N).fill(-1);
    // départ : dans l'axe de la voie du quai, sur deux cases si l'on peut (la courbe qui suit en est plus douce)
    const heap = new Heap(), ends = new Map<number, [number, number]>();
    for (const sg of [1, -1]) {
      const k1 = cellOf(local(sg * 1.5, 0.34)), k2 = cellOf(local(sg * 2.5, 0.34));
      if (k1 < 0 || !isFinite(this.cost(k1))) continue;
      const far = k2 >= 0 && isFinite(this.cost(k2)), k = far ? k2 : k1;
      ends.set(k, [sg, far ? 2.5 : 1.5]); dist[k] = 0; heap.push(0, k);
    }
    // arrivée : une case libre au pied de l'un des avant-postes
    posts.forEach((p, i) => {
      const s = KINDS.outpost.size;
      for (let z = p.b.z - 1; z <= p.b.z + s; z++) for (let x = p.b.x - 1; x <= p.b.x + s; x++) if (w.inCells(x, z)) goal[z * N + x] = i;
    });
    let hit = -1;
    while (heap.size) {
      const kk = heap.keys[0], c = heap.pop();
      if (kk > dist[c] + 1e-4) continue;
      if (goal[c] >= 0 && isFinite(this.cost(c))) { hit = c; break; }
      const x = c % N, z = (c - x) / N, hc = w.cellAvg(x, z);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (!w.inCells(nx, nz)) continue;
        const n = nz * N + nx, cn = this.cost(n);
        if (!isFinite(cn) || Math.abs(w.cellAvg(nx, nz) - hc) > 0.9) continue;
        // en diagonale, pas entre deux obstacles
        if (dx && dz && (!isFinite(this.cost(z * N + nx)) || !isFinite(this.cost(nz * N + x)))) continue;
        const nd = dist[c] + cn * (dx && dz ? Math.SQRT2 : 1) + Math.abs(w.cellAvg(nx, nz) - hc) * 4;
        if (nd < dist[n]) { dist[n] = nd; prev[n] = c; heap.push(nd, n); }
      }
    }
    if (hit < 0) return null;
    const cells: number[] = [];
    for (let c = hit; c >= 0; c = prev[c]) cells.push(c);
    cells.reverse();
    const [sg, out0] = ends.get(cells[0])!, post = posts[goal[hit]];
    const centre = (k: number): [number, number] => [(k % N) + 0.5, Math.floor(k / N) + 0.5];
    // on garde les cases d'angle, on file tout droit ailleurs tant que la voie reste sur des cases praticables
    const clear = (a: [number, number], b: [number, number]) => {
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25);
      for (let i = 1; i < n; i++) {
        const k = cellOf([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
        if (k < 0 || this.cost(k) > 2.6) return false;
      }
      return true;
    };
    const keep: [number, number][] = [centre(cells[0])];
    for (let i = 0; i < cells.length - 1;) {
      let j = Math.min(cells.length - 1, i + 10);
      while (j > i + 1 && !clear(centre(cells[i]), centre(cells[j]))) j--;
      keep.push(centre(cells[j]));
      i = j;
    }
    // sortie du quai dans l'axe de la voie, puis courbes adoucies (Chaikin)
    const e0 = local(sg * 0.98, 0.34), e1 = local(sg * out0, 0.34);
    let pts: [number, number][] = [e0, e1, ...keep.slice(1)];
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
    const len = cum[cum.length - 1];
    if (len < TRAIN_LEN + 1) return null;
    // quai : à côté de la voiture des mineurs, du côté où l'on peut marcher
    const line: Line = { station: st, post: post.b, entry: post.entry, pts, cum, len, board: local(sg * 1.5, 0.34) };
    const [bx, bz, bh] = this.lineAt(line, 0.7);
    for (const side of [1, -1]) {
      const p: [number, number] = [bx + Math.cos(bh) * 0.5 * side, bz - Math.sin(bh) * 0.5 * side], k = cellOf(p);
      if (k >= 0 && !w.occ[k] && !w.isWet(k % N, Math.floor(k / N))) { line.board = p; break; }
    }
    return line;
  }

  private lineAt(l: Line, s: number) { const keep = this.line; this.line = l; const r = this.at(s); this.line = keep; return r; }
}
