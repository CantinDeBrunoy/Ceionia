import { HellMap, HELL_ZONES, HELL_ZONE_N, zoneOfZ } from '../world/hell';
import { Hell, HellBuilding, HellEvent, BaseKind, DemonKind, demonStats, raidKinds } from './hell';

/**
 * La base avancée du joueur dans les Enfers (expéditions facultatives) : dans une zone tenue (le seuil du portail, ou une zone
 * dont la forteresse est abattue), un camp de base puis quelques bâtiments militaires autour (caserne avancée, forge,
 * infirmerie, tour de guet, palissades, braseros), payés en bois, pierre et minerai du village ; le ravitaillement (une jauge
 * de vivres et d'équipement, remplie par des convois venus du village par le portail : sans elle, les troupes s'affaiblissent
 * lentement) ; les contre-attaques de la faction sur les bases du front (si le camp tombe, la zone est reperdue). Simulation
 * pure : elle agit sur la faction (`Hell`) et sa carte. Temps en secondes de jeu, distances en cases
 */

export interface BaseCost { wood: number; stone: number; ore: number }
export interface BaseDef {
  kind: BaseKind; name: string; icon: string; desc: string; cost: BaseCost;
  /** rayon de l'emprise (cases) */
  r: number;
  /** au plus, par base */
  max: number;
}

export const BASE_DEFS: Record<BaseKind, BaseDef> = {
  camp: { kind: 'camp', name: 'Camp de base', icon: '⛺', r: 1.2, max: 1, cost: { wood: 30, stone: 10, ore: 0 }, desc: 'Le cœur de la base : point de ralliement et de repli, les troupes y réapparaissent et y pansent leurs blessures. À poser en premier.' },
  post: { kind: 'post', name: 'Caserne avancée', icon: '⚔️', r: 1, max: 1, cost: { wood: 40, stone: 30, ore: 0 }, desc: 'Recrute sur place : les recrues arrivent directement au camp, sans passer par l’île.' },
  smithy: { kind: 'smithy', name: 'Forge', icon: '⚒️', r: 1, max: 1, cost: { wood: 20, stone: 30, ore: 10 }, desc: 'Répare et affûte l’équipement des troupes de la base (+20 % de dégâts, coups reçus adoucis) ; forge contre du minerai les lances, arcs et armures qui manquent à la réserve du village pour recruter sur place.' },
  infirmary: { kind: 'infirmary', name: 'Infirmerie', icon: '🩹', r: 1, max: 1, cost: { wood: 30, stone: 20, ore: 0 }, desc: 'Soigne vite les troupes de la base ; un soldat tombé dans les Enfers y est soigné (deux fois plus vite) au lieu de rentrer sur l’île.' },
  tower: { kind: 'tower', name: 'Tour de guet', icon: '🏹', r: 0.6, max: 4, cost: { wood: 20, stone: 30, ore: 0 }, desc: 'Ses archers tirent sur les démons qui approchent.' },
  palisade: { kind: 'palisade', name: 'Palissade', icon: '🪵', r: 0.5, max: 20, cost: { wood: 8, stone: 0, ore: 0 }, desc: 'Un pan de pieux : bloque le passage et ralentit les démons qui la longent. Laissez toujours un passage.' },
  brazier: { kind: 'brazier', name: 'Brasero', icon: '🔥', r: 0.35, max: 8, cost: { wood: 6, stone: 0, ore: 2 }, desc: 'Éclaire la base et fait reculer la brume rouge.' },
};
export const BASE_KINDS = Object.keys(BASE_DEFS) as BaseKind[];
export const isBaseKind = (k: unknown): k is BaseKind => typeof k === 'string' && k in BASE_DEFS;

/** Les bâtiments d'une base tiennent à BASE_R cases au plus de son camp ; soins et forge agissent à CARE_R cases d'eux */
export const BASE_R = 8, CARE_R = 6;
/** Soins par seconde (points de vie) près du camp (ravitaillé) et de l'infirmerie */
export const CAMP_REGEN = 2, INFIRMARY_REGEN = 6;
/** La forge : dégâts portés, dégâts reçus des troupes de la base ; minerai pour forger une pièce d'équipement manquante */
export const SMITHY_BOOST = 1.2, SMITHY_GUARD = 0.85, SMITHY_ORE = 4;
/** Les démons qui longent une palissade (à moins d'une case de son bord) vont à cette allure */
export const PALISADE_SLOW = 0.55;
/**
 * Ravitaillement : une jauge de SUPPLY_MAX, que chaque troupe dans les Enfers consomme (SUPPLY_DRAIN par seconde) ; un convoi
 * (CONVOY_COST, du village) arrive CONVOY_TIME secondes après son départ et la remonte de CONVOY_AMOUNT ; au plus CONVOY_MAX en
 * route. Jauge vide : les troupes s'affaiblissent peu à peu (jusqu'à WEAK_MAX de dégâts en moins, en WEAK_TIME secondes),
 * puis reprennent des forces une fois ravitaillées. Prévenu sous SUPPLY_LOW
 */
export const SUPPLY_MAX = 100, SUPPLY_DRAIN = 0.02, SUPPLY_LOW = 25;
export const CONVOY_COST: BaseCost = { wood: 25, stone: 0, ore: 0 }, CONVOY_TIME = 20, CONVOY_AMOUNT = 50, CONVOY_MAX = 2;
export const WEAK_MAX = 0.4, WEAK_TIME = 240;
/**
 * Contre-attaques : une base du front (la zone d'après n'est pas conquise) reçoit une première vague COUNTER_FIRST secondes
 * après la pose de son camp, puis une toutes les COUNTER_EVERY secondes une fois la précédente repoussée
 */
export const COUNTER_FIRST = 180, COUNTER_EVERY = 300, COUNTER_MAX = 10;

/** Taille d'une contre-attaque : selon la zone de la base et le nombre de vagues déjà venues */
export function counterSize(zone: number, n: number) { return Math.min(COUNTER_MAX, 2 + zone + n); }

/** Ce que le village paie (le monde : son bois, sa pierre, son minerai ; le bac à sable ne paie rien) */
export interface Purse { wood: number; stone: number; ore: number; unlimited?: boolean }
export const canAfford = (p: Purse, c: BaseCost) => !!p.unlimited || (p.wood >= c.wood && p.stone >= c.stone && p.ore >= c.ore);
export function pay(p: Purse, c: BaseCost) { if (p.unlimited) return; p.wood -= c.wood; p.stone -= c.stone; p.ore -= c.ore; }
export function costText(c: BaseCost) {
  return [c.wood ? `${c.wood} bois` : '', c.stone ? `${c.stone} pierre` : '', c.ore ? `${c.ore} minerai` : ''].filter(Boolean).join(', ') || 'gratuit';
}

export type BaseEvent =
  | { type: 'built'; kind: BaseKind; zone: number }
  | { type: 'counter'; zone: number; n: number }
  | { type: 'counterEnd'; zone: number }
  | { type: 'campLost'; zone: number }
  | { type: 'zoneLost'; zone: number }
  | { type: 'convoy'; amount: number }
  | { type: 'lowSupply' }
  | { type: 'hungry' };

export interface HellBaseSave {
  supply: number; weak: number;
  convoys: { left: number; amount: number }[];
  next: number[]; count: number[];
  /** zones dont une contre-attaque est en cours */
  active: number[];
  buildings: { kind: BaseKind; x: number; z: number; hp: number }[];
}

export class HellBase {
  supply = SUPPLY_MAX;
  /** affaiblissement des troupes, faute de vivres (0 à WEAK_MAX) */
  weak = 0;
  convoys: { left: number; amount: number }[] = [];
  /** contre-attaques, par zone : moment de la prochaine (-1 : pas de base au front), vagues déjà venues */
  next: number[] = Array.from({ length: HELL_ZONE_N }, () => -1);
  count: number[] = Array.from({ length: HELL_ZONE_N }, () => 0);
  /** démons d'une contre-attaque en cours → zone visée */
  attackers = new Map<number, number>();
  /** ce qui s'est passé (le jeu en tire ses nouvelles) */
  events: BaseEvent[] = [];
  private reach = { v: -1, n: 0 };
  private warned = false;
  /** événements de la faction déjà lus (elle en garde plusieurs pas, jusqu'à ce que la guerre les relève) */
  private seen = new WeakSet<HellEvent>();

  constructor(readonly hell: Hell, readonly map: HellMap) {}

  // ---------- Requêtes ----------

  /** Bâtiments de la base (debout, sauf `all`) */
  buildings(all = false): HellBuilding[] { return [...this.hell.buildings.values()].filter((b) => b.side === 'player' && b.kind in BASE_DEFS && (all || !b.down)); }
  /** Le camp de base d'une zone (debout) */
  camp(zone: number) { return this.buildings().find((b) => b.kind === 'camp' && b.zone === zone) ?? null; }
  /** Bâtiments debout d'une sorte, dans une zone (ou partout) */
  countOf(kind: BaseKind, zone?: number) { return this.buildings().filter((b) => b.kind === kind && (zone === undefined || b.zone === zone)).length; }
  /** La base la plus avancée (son camp) */
  front(): HellBuilding | null {
    let best: HellBuilding | null = null;
    for (const b of this.buildings()) if (b.kind === 'camp' && this.hell.held(b.zone) && (!best || b.zone > best.zone)) best = b;
    return best;
  }
  /** Où réapparaissent les troupes (et où elles se replient) : devant le camp le plus avancé, sinon au portail */
  spawnPoint(): [number, number] {
    const c = this.front();
    if (!c) return [this.map.arrival[0], this.map.arrival[1]];
    const k = this.map.nearestWalkable(c.site.x, c.site.z - c.site.r - 0.9, 3);
    return k >= 0 ? [(k % this.map.W) + 0.5, Math.floor(k / this.map.W) + 0.5] : [this.map.arrival[0], this.map.arrival[1]];
  }
  /** Un bâtiment d'une sorte, debout, près d'un point */
  near(kind: BaseKind, x: number, z: number, r = CARE_R) { return this.buildings().some((b) => b.kind === kind && Math.hypot(b.site.x - x, b.site.z - z) - b.site.r < r); }
  /** Casernes avancées debout (elles comptent comme des casernes pour le recrutement) */
  posts() { return this.countOf('post'); }

  /** Ce qu'il manque pour bâtir ici (null : on peut) ; `x`, `z` ramenés au centre de la case */
  canBuild(kind: BaseKind, x: number, z: number, purse?: Purse): string | null {
    const d = BASE_DEFS[kind], h = this.hell, m = this.map;
    const cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5, zone = zoneOfZ(Math.floor(cz));
    if (!m.inside(cx, cz)) return 'Hors de la carte';
    if (zone > h.frontier) return `La brume barre ${HELL_ZONES[zone].name} : conquérez d’abord la zone d’avant.`;
    if (!h.held(zone)) return `Il faut d’abord conquérir ${HELL_ZONES[zone].name} : abattez sa forteresse.`;
    const camp = this.camp(zone);
    if (kind === 'camp') { if (camp) return 'Cette zone a déjà son camp de base.'; }
    else if (!camp) return 'Posez d’abord un camp de base dans cette zone.';
    else if (Math.hypot(camp.site.x - cx, camp.site.z - cz) > BASE_R) return `Trop loin du camp de base (${BASE_R} cases au plus).`;
    if (this.countOf(kind, zone) >= d.max) return `Au plus ${d.max === 1 ? 'un bâtiment de ce genre' : `${d.max} de ce genre`} par base.`;
    if (Math.hypot(m.portal[0] - cx, m.portal[1] - cz) < 3.2) return 'Trop près du portail : laissez le passage.';
    const cells = m.footprintCells({ x: cx, z: cz, r: d.r });
    for (const k of cells) if (!m.walkable(k % m.W, Math.floor(k / m.W)) || m.bridge[k]) return 'Il faut un sol libre (ni lave, ni pont, ni paroi, ni bâtiment).';
    // les troupes au combat ne se laissent pas emmurer : il faut une place libre
    for (const u of h.alive()) if (Math.hypot(u.x - cx, u.z - cz) < d.r + u.stats.radius - 0.1 && cells.includes(m.cell(u.x, u.z))) return 'Des troupes se tiennent là : choisissez une place libre.';
    if (purse && !canAfford(purse, d.cost)) return `Il faut ${costText(d.cost)}.`;
    if (!this.keepsPath(cells)) return 'Laissez un passage : ce bâtiment fermerait le chemin.';
    return null;
  }

  /** La carte reste d'un seul tenant (depuis le portail) si l'on bouche ces cases */
  private keepsPath(cells: number[]) {
    const m = this.map, start = m.nearestWalkable(m.arrival[0], m.arrival[1]);
    const count = () => { const d = m.distances(start); let n = 0; for (let k = 0; k < d.length; k++) if (d[k] >= 0) n++; return n; };
    if (this.reach.v !== m.version) this.reach = { v: m.version, n: count() };
    const saved = cells.map((k) => m.block[k]);
    for (const k of cells) m.block[k] = 1;
    const n = count();
    cells.forEach((k, i) => (m.block[k] = saved[i]));
    return n >= this.reach.n - cells.length;
  }

  /** Bâtit (payé par `purse`) : renvoie le bâtiment, ou la raison du refus */
  build(kind: BaseKind, x: number, z: number, purse?: Purse): HellBuilding | string {
    const why = this.canBuild(kind, x, z, purse);
    if (why) return why;
    if (purse) pay(purse, BASE_DEFS[kind].cost);
    return this.place(kind, Math.floor(x) + 0.5, Math.floor(z) + 0.5);
  }

  /** Pose un bâtiment (sans contrôle : sauvegarde reprise) */
  private place(kind: BaseKind, x: number, z: number, hp?: number) {
    const d = BASE_DEFS[kind], zone = zoneOfZ(Math.floor(z));
    // les ruines d'un bâtiment de la base au même endroit disparaissent
    for (const b of this.buildings(true)) if (b.down && Math.hypot(b.site.x - x, b.site.z - z) < b.site.r + d.r) this.hell.buildings.delete(b.id);
    const b = this.hell.addPlayerBuilding(kind, x, z, d.r);
    b.zone = zone; b.site.zone = zone;
    if (hp !== undefined) b.hp = Math.max(1, Math.min(b.maxHp, hp));
    this.map.reblock(b.site);
    this.events.push({ type: 'built', kind, zone });
    return b;
  }

  /** Envoie un convoi de ravitaillement depuis le village (payé par `purse`) : null, ou la raison du refus */
  sendConvoy(purse?: Purse): string | null {
    if (this.convoys.length >= CONVOY_MAX) return 'Deux convois sont déjà en route.';
    if (this.supply + this.convoys.reduce((s, c) => s + c.amount, 0) >= SUPPLY_MAX) return 'Les réserves de la base sont pleines.';
    if (purse && !canAfford(purse, CONVOY_COST)) return `Il faut ${costText(CONVOY_COST)} pour un convoi.`;
    if (purse) pay(purse, CONVOY_COST);
    this.convoys.push({ left: CONVOY_TIME, amount: CONVOY_AMOUNT });
    return null;
  }

  // ---------- Pas de simulation ----------

  /** Un pas (juste après celui de la faction, dont il lit les événements sans les consommer) */
  step(dt: number) {
    if (dt <= 0) return;
    const h = this.hell, now = h.time;
    // un camp abattu : la base tombe, la zone est reperdue
    for (const e of h.events) {
      if (this.seen.has(e)) continue;
      this.seen.add(e);
      if (e.type === 'destroyed' && e.kind === 'camp') this.fall(e.zone);
    }
    // les contre-attaques en cours : repoussées quand leurs démons sont tous abattus
    const live = new Set<number>();
    for (const [id, zone] of this.attackers) { const u = h.units.get(id); if (u && u.hp > 0) live.add(zone); else this.attackers.delete(id); }
    for (let zone = 0; zone < HELL_ZONE_N; zone++) {
      const camp = this.camp(zone), front = !!camp && h.held(zone) && zone + 1 < HELL_ZONE_N && !h.conquered[zone + 1] && !h.victory;
      if (this.next[zone] === -2 && !live.has(zone)) { this.events.push({ type: 'counterEnd', zone }); this.next[zone] = now + COUNTER_EVERY; }
      if (!front) { if (!live.has(zone)) this.next[zone] = -1; continue; }
      if (this.next[zone] === -1) this.next[zone] = now + COUNTER_FIRST;
      if (this.next[zone] >= 0 && now >= this.next[zone] && !live.has(zone)) this.counter(zone);
    }
    // le ravitaillement
    const troops = h.alive('player');
    if (troops.length) this.supply = Math.max(0, this.supply - troops.length * SUPPLY_DRAIN * dt);
    for (const c of [...this.convoys]) {
      c.left -= dt;
      if (c.left > 0) continue;
      this.convoys.splice(this.convoys.indexOf(c), 1);
      this.supply = Math.min(SUPPLY_MAX, this.supply + c.amount);
      this.events.push({ type: 'convoy', amount: c.amount });
    }
    if (this.supply < SUPPLY_LOW && troops.length && !this.warned && !this.convoys.length) { this.warned = true; this.events.push({ type: 'lowSupply' }); }
    if (this.supply >= SUPPLY_LOW) this.warned = false;
    const wasWeak = this.weak;
    this.weak = this.supply <= 0 && troops.length ? Math.min(WEAK_MAX, this.weak + (WEAK_MAX / WEAK_TIME) * dt) : Math.max(0, this.weak - (WEAK_MAX / 60) * dt);
    if (wasWeak === 0 && this.weak > 0) this.events.push({ type: 'hungry' });
    // les effets sur les troupes : forge, soins, faim
    for (const u of troops) {
      const forge = this.near('smithy', u.x, u.z);
      u.boost = (1 - this.weak) * (forge ? SMITHY_BOOST : 1);
      u.guard = forge ? SMITHY_GUARD : 1;
      if (u.state === 'attack' || u.hp >= u.maxHp) continue;
      const regen = this.near('infirmary', u.x, u.z) ? INFIRMARY_REGEN : this.supply > 0 && this.near('camp', u.x, u.z) ? CAMP_REGEN : 0;
      if (regen) u.hp = Math.min(u.maxHp, u.hp + regen * dt);
    }
    // les palissades ralentissent les démons qui les longent
    const walls = this.buildings().filter((b) => b.kind === 'palisade');
    for (const u of h.alive('hell')) u.paceK = walls.length && walls.some((b) => Math.hypot(b.site.x - u.x, b.site.z - u.z) - b.site.r < 1) ? PALISADE_SLOW : 1;
    h.rally = this.front() ? this.spawnPoint() : null;
  }

  /** Une contre-attaque sur la base d'une zone : des démons de la zone d'après, devant sa forteresse ou à son entrée */
  private counter(zone: number) {
    const h = this.hell, m = this.map, from = zone + 1, n = counterSize(zone, this.count[zone]);
    const fort = h.standing(from).find((b) => b.kind === 'fortress' || b.kind === 'kingdom');
    const z0 = HELL_ZONES[from].z0 + 3, sx = fort ? fort.site.x : m.spine[z0] + 0.5, sz = fort ? fort.site.z - fort.site.r - 1.5 : z0 + 0.5;
    const kinds: DemonKind[] = raidKinds(zone + this.count[zone] + 1, n);
    kinds.forEach((k, i) => {
      const c = m.nearestWalkable(sx + ((i % 4) - 1.5) * 0.7, sz - Math.floor(i / 4) * 0.7, 4);
      const [x, z] = c >= 0 ? [(c % m.W) + 0.5, Math.floor(c / m.W) + 0.5] : [sx, sz];
      const u = h.addRaider(k, demonStats(k, from), x, z);
      this.attackers.set(u.id, zone);
    });
    this.count[zone]++;
    this.next[zone] = -2;
    this.events.push({ type: 'counter', zone, n });
  }

  /** Le camp d'une zone est tombé : ses autres bâtiments s'effondrent ; la zone est reperdue (sauf le seuil du portail) */
  private fall(zone: number) {
    const h = this.hell;
    if (this.camp(zone)) return;
    for (const b of this.buildings()) if (b.zone === zone) h.raze(b);
    // les démons de la contre-attaque restent : ils gardent désormais la zone
    for (const [id, z] of this.attackers) {
      if (z !== zone) continue;
      const u = h.units.get(id);
      if (u && u.hp > 0) { u.zone = Math.max(1, zone); u.home = [u.x, u.z]; u.state = 'guard'; }
      this.attackers.delete(id);
    }
    this.next[zone] = -1;
    if (zone > 0 && h.conquered[zone]) { h.retake(zone); this.events.push({ type: 'zoneLost', zone }); }
    else this.events.push({ type: 'campLost', zone });
  }

  // ---------- Sauvegarde ----------

  save(): HellBaseSave {
    return {
      supply: +this.supply.toFixed(2), weak: +this.weak.toFixed(3), convoys: this.convoys.map((c) => ({ ...c })), next: [...this.next], count: [...this.count],
      active: [...new Set(this.attackers.values())],
      buildings: this.buildings().map((b) => ({ kind: b.kind as BaseKind, x: b.site.x, z: b.site.z, hp: Math.round(b.hp) })),
    };
  }

  /** Reprend une base sauvegardée sur la faction reprise (abîmée ou absente : une base vide) */
  static load(hell: Hell, map: HellMap, d: unknown): HellBase {
    const b = new HellBase(hell, map);
    if (!d || typeof d !== 'object') return b;
    const o = d as Partial<HellBaseSave>;
    if (Number.isFinite(o.supply)) b.supply = Math.min(SUPPLY_MAX, Math.max(0, o.supply!));
    if (Number.isFinite(o.weak)) b.weak = Math.min(WEAK_MAX, Math.max(0, o.weak!));
    if (Array.isArray(o.convoys)) b.convoys = o.convoys.filter((c) => c && Number.isFinite(c.left) && Number.isFinite(c.amount)).slice(0, CONVOY_MAX).map((c) => ({ left: c.left, amount: c.amount }));
    for (const [key, arr] of [['next', b.next], ['count', b.count]] as const) {
      const src = o[key];
      if (Array.isArray(src)) src.forEach((v, i) => { if (i < HELL_ZONE_N && Number.isFinite(v)) arr[i] = v; });
    }
    // camps d'abord (les autres bâtiments se posent autour)
    const list = Array.isArray(o.buildings) ? o.buildings.filter((r) => r && isBaseKind(r.kind) && Number.isFinite(r.x) && Number.isFinite(r.z)) : [];
    list.sort((p, q) => (p.kind === 'camp' ? 0 : 1) - (q.kind === 'camp' ? 0 : 1));
    for (const r of list) if (map.inside(r.x, r.z)) b.place(r.kind, r.x, r.z, r.hp);
    b.events.length = 0;
    // les démons d'une contre-attaque en cours (repris par la faction, sans zone) la poursuivent
    const zones = Array.isArray(o.active) ? o.active.filter((z) => Number.isInteger(z)) : [];
    if (zones.length) for (const u of hell.alive('hell')) if (u.zone < 0) b.attackers.set(u.id, zones[0]);
    return b;
  }
}
