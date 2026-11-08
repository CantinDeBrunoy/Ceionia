import { HellMap, HELL_ZONES, HELL_ZONE_N, Z_KINGDOM, ZONE_AGE, zoneOfZ, zoneOf, zoneThe } from '../world/hell';
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
  palisade: { kind: 'palisade', name: 'Palissade', icon: '🚧', r: 0.5, max: 60, cost: { wood: 8, stone: 0, ore: 0 }, desc: 'Cliquez et glissez pour tracer un mur de pieux : il bloque le passage et ralentit les démons qui le longent. Un clic de plus prolonge le mur ; Échap arrête. Laissez toujours un passage, ou posez une porte.' },
  gate: { kind: 'gate', name: 'Porte', icon: '🚪', r: 0.5, max: 8, cost: { wood: 14, stone: 0, ore: 0 }, desc: 'À poser sur un mur de palissade : vos troupes la franchissent librement, pas les démons, qui doivent l’abattre.' },
  brazier: { kind: 'brazier', name: 'Brasero', icon: '🔥', r: 0.35, max: 8, cost: { wood: 6, stone: 0, ore: 2 }, desc: 'Éclaire la base et fait reculer la brume rouge.' },
};
export const BASE_KINDS = Object.keys(BASE_DEFS) as BaseKind[];
export const isBaseKind = (k: unknown): k is BaseKind => typeof k === 'string' && k in BASE_DEFS;

/** Les bâtiments d'une base tiennent à BASE_R cases au plus de son camp ; soins et forge agissent à CARE_R cases d'eux */
export const BASE_R = 8, CARE_R = 6;
/** Un camp de base se pose à CAMP_MARGIN rangées au moins de la zone suivante, si elle est encore aux démons */
export const CAMP_MARGIN = 6;
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
/** Un village en retard d'âge sur la zone d'après (ses démons y sont plus forts que lui) : deux démons de plus par âge de retard */
export const LAG_BONUS = 2;
/**
 * Reprise d'une zone conquise que personne ne garde (ni camp de base, ni troupe) : la plus profonde est visée RECLAIM_FIRST
 * secondes après qu'elle a été laissée seule, le joueur est prévenu RECLAIM_WARN secondes avant ; une fois reprise, la
 * suivante n'est visée qu'après RECLAIM_COOLDOWN secondes. Un camp ou des troupes sur place annulent la menace
 */
export const RECLAIM_FIRST = 420, RECLAIM_WARN = 150, RECLAIM_COOLDOWN = 600;
/**
 * Le front : les démons ne remontent vers l'île du portail qu'après avoir repris tous les postes avancés du joueur (ses zones
 * conquises), un par un, le plus profond d'abord. Chaque assaut est annoncé COUNTER_WARN secondes avant. Un poste sans camp
 * dont les troupes sont toutes parties ou tombées pendant un assaut est perdu après FRONT_GRACE secondes
 */
export const COUNTER_WARN = 45, FRONT_GRACE = 30;

/** Taille d'une contre-attaque : selon la zone de la base, le nombre de vagues déjà venues et le retard d'âge */
export function counterSize(zone: number, n: number, lag = 0) { return Math.min(COUNTER_MAX + lag * LAG_BONUS, 2 + zone + n + lag * LAG_BONUS); }
/** Le retard d'âge d'un village (`age`) devant la zone `zone` (0 : à niveau) */
export const ageLag = (zone: number, age: number) => Math.max(0, (ZONE_AGE[zone] ?? 0) - age);

/** Ce que le village paie (le monde : son bois, sa pierre, son minerai ; le bac à sable ne paie rien) */
export interface Purse { wood: number; stone: number; ore: number; unlimited?: boolean }
export const canAfford = (p: Purse, c: BaseCost) => !!p.unlimited || (p.wood >= c.wood && p.stone >= c.stone && p.ore >= c.ore);
export function pay(p: Purse, c: BaseCost) { if (p.unlimited) return; p.wood -= c.wood; p.stone -= c.stone; p.ore -= c.ore; }
export function costText(c: BaseCost) {
  return [c.wood ? `${c.wood} bois` : '', c.stone ? `${c.stone} pierre` : '', c.ore ? `${c.ore} minerai` : ''].filter(Boolean).join(', ') || 'gratuit';
}

export type BaseEvent =
  | { type: 'built'; kind: BaseKind; zone: number }
  | { type: 'counterWarn'; zone: number }
  | { type: 'counter'; zone: number; n: number }
  /** le dernier poste avancé est tombé : les incursions sur l'île reprennent (après un temps de répit) */
  | { type: 'frontCleared' }
  | { type: 'counterEnd'; zone: number }
  | { type: 'campLost'; zone: number }
  | { type: 'zoneLost'; zone: number }
  | { type: 'reclaimWarn'; zone: number }
  | { type: 'convoy'; amount: number }
  | { type: 'lowSupply' }
  | { type: 'hungry' };

export interface HellBaseSave {
  supply: number; weak: number;
  convoys: { left: number; amount: number }[];
  next: number[]; count: number[];
  /** zones dont une contre-attaque est en cours */
  active: number[];
  /** zone conquise non gardée que les démons s'apprêtent à reprendre, et quand */
  reclaim?: { zone: number; at: number } | null;
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
  /** la zone laissée seule que les démons vont reprendre (`at` : le moment) ; `cool` : pas de nouvelle menace avant ce moment */
  reclaim: { zone: number; at: number; warned: boolean } | null = null;
  private cool = 0;
  /** zones dont l'assaut à venir a été annoncé ; temps passé sans personne pour garder un poste assiégé */
  private warnedCounter: boolean[] = Array.from({ length: HELL_ZONE_N }, () => false);
  private abandoned = 0;
  private hadFront = false;
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
  /**
   * Le poste avancé le plus profond : la zone conquise la plus lointaine du portail (sans le royaume), 0 s'il n'y en a aucun.
   * Les démons doivent le reprendre avant de remonter vers les zones d'avant, puis vers l'île du portail
   */
  deepestPost() {
    const h = this.hell;
    if (h.victory) return 0;
    for (let z = Z_KINGDOM - 1; z >= 1; z--) if (h.conquered[z]) return z;
    return 0;
  }
  /** Nombre de postes avancés tenus (zones conquises) ; tant qu'il y en a, aucune incursion ne vise l'île */
  outposts() {
    const h = this.hell;
    if (h.victory) return 0;
    let n = 0;
    for (let z = 1; z < Z_KINGDOM; z++) if (h.conquered[z]) n++;
    return n;
  }
  /** Des troupes du joueur se tiennent dans cette zone (elles comptent pour sa défense) */
  troopsIn(zone: number) { return this.hell.alive('player').some((u) => zoneOfZ(Math.floor(u.z)) === zone); }
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
  canBuild(kind: BaseKind, x: number, z: number, purse?: Purse, planned = 0): string | null {
    const d = BASE_DEFS[kind], h = this.hell, m = this.map;
    const cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5, zone = zoneOfZ(Math.floor(cz));
    if (!m.inside(cx, cz)) return 'Hors de la carte';
    if (zone > h.frontier) return `La brume barre ${zoneThe(zone)} : conquérez d’abord la zone d’avant.`;
    if (!h.held(zone)) return `Il faut d’abord conquérir ${zoneThe(zone)} : abattez sa forteresse.`;
    const camp = this.camp(zone);
    if (kind === 'camp') {
      if (camp) return 'Cette zone a déjà son camp de base.';
      // tout contre une zone encore aux démons, sa garnison en alerte le rasait aussitôt, et la zone était reperdue
      if (zone + 1 < HELL_ZONE_N && !h.conquered[zone + 1] && HELL_ZONES[zone + 1].z0 - cz < CAMP_MARGIN) return `Trop près ${zoneOf(zone + 1)} : ses démons raseraient le camp. Posez-le un peu plus en arrière.`;
    }
    else if (!camp) return 'Posez d’abord un camp de base dans cette zone.';
    else if (Math.hypot(camp.site.x - cx, camp.site.z - cz) > BASE_R) return `Trop loin du camp de base (${BASE_R} cases au plus).`;
    if (this.countOf(kind, zone) + planned >= d.max) return `Au plus ${d.max === 1 ? 'un bâtiment de ce genre' : `${d.max} de ce genre`} par base.`;
    if (Math.hypot(m.portal[0] - cx, m.portal[1] - cz) < 3.2) return 'Trop près du portail : laissez le passage.';
    const cells = m.footprintCells({ x: cx, z: cz, r: d.r });
    for (const k of cells) if (m.gate[k]) return 'Il y a déjà une porte ici.';
    // une porte se pose sur un pan de palissade (elle le remplace), ou dans son prolongement
    const wall = kind === 'gate' ? this.wallAt(cx, cz) : null;
    if (kind === 'gate' && !wall && !this.wallNear(cx, cz)) return 'Une porte se pose sur une palissade, ou à son bout.';
    for (const k of cells) if (!wall && (!m.walkable(k % m.W, Math.floor(k / m.W)) || m.bridge[k])) return 'Il faut un sol libre (ni lave, ni pont, ni paroi, ni bâtiment).';
    // les troupes au combat ne se laissent pas emmurer : il faut une place libre (une porte laisse passer les nôtres)
    for (const u of h.alive()) if ((kind !== 'gate' || u.side === 'hell') && Math.hypot(u.x - cx, u.z - cz) < d.r + u.stats.radius - 0.1 && cells.includes(m.cell(u.x, u.z))) return 'Des troupes se tiennent là : choisissez une place libre.';
    if (purse && !canAfford(purse, d.cost)) return `Il faut ${costText(d.cost)}.`;
    if (kind !== 'gate' && !this.keepsPath(cells)) return 'Laissez un passage : ce bâtiment fermerait le chemin.';
    return null;
  }

  /** Le pan de palissade debout dans cette case (centre `cx`, `cz`), s'il y en a un */
  wallAt(cx: number, cz: number) { return this.buildings().find((b) => b.kind === 'palisade' && Math.abs(b.site.x - cx) < 0.5 && Math.abs(b.site.z - cz) < 0.5) ?? null; }
  /** Un pan de palissade ou une porte touche cette case par un côté */
  private wallNear(cx: number, cz: number) {
    return this.buildings().some((b) => (b.kind === 'palisade' || b.kind === 'gate') && Math.abs(Math.abs(b.site.x - cx) + Math.abs(b.site.z - cz) - 1) < 0.2);
  }

  /**
   * Pose en ligne (palissade glissée) : pour chaque case, la raison du refus (null : on peut) ; ce que cela coûte ; les cases
   * se comptent l'une après l'autre (argent, nombre permis, passage laissé libre), comme à la pose
   */
  planLine(kind: BaseKind, cells: [number, number][], purse?: Purse): { why: (string | null)[]; cost: BaseCost; n: number } {
    const d = BASE_DEFS[kind], m = this.map, cost: BaseCost = { wood: 0, stone: 0, ore: 0 }, why: (string | null)[] = [], blocked: number[] = [];
    let n = 0;
    try {
      for (const [x, z] of cells) {
        const sum: BaseCost = { wood: cost.wood + d.cost.wood, stone: cost.stone + d.cost.stone, ore: cost.ore + d.cost.ore };
        let r = this.sameWall(kind, x, z) ? 'Il y a déjà un pan ici.' : this.canBuild(kind, x, z, undefined, n);
        if (!r && purse && !canAfford(purse, sum)) r = `Il faut ${costText(sum)}.`;
        why.push(r);
        if (r) continue;
        n++; cost.wood = sum.wood; cost.stone = sum.stone; cost.ore = sum.ore;
        // (la case compte comme prise pour la suivante : le passage doit rester libre)
        if (kind !== 'gate') for (const k of m.footprintCells({ x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5, r: d.r })) { blocked.push(k, m.block[k]); m.block[k] = 1; }
        // (l'accessibilité de la carte est à refaire avec cette case prise)
        this.reach.v = -1;
      }
    } finally { for (let i = blocked.length - 2; i >= 0; i -= 2) m.block[blocked[i]] = blocked[i + 1]; this.reach.v = -1; }
    return { why, cost, n };
  }
  /** Un pan de palissade tient déjà dans cette case (on ne le repose pas) */
  private sameWall(kind: BaseKind, x: number, z: number) { return kind === 'palisade' && !!this.wallAt(Math.floor(x) + 0.5, Math.floor(z) + 0.5); }

  /** Bâtit une ligne (payée par `purse`) : combien de cases posées, et la première raison de refus rencontrée */
  buildLine(kind: BaseKind, cells: [number, number][], purse?: Purse): { built: number; why: string | null } {
    let built = 0, why: string | null = null;
    for (const [x, z] of cells) {
      if (this.sameWall(kind, x, z)) continue;
      const r = this.build(kind, x, z, purse);
      if (typeof r === 'string') { why ??= r; if (purse && !canAfford(purse, BASE_DEFS[kind].cost)) break; continue; }
      built++;
    }
    return { built, why };
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
    // une porte remplace le pan de palissade qu'elle coupe
    if (kind === 'gate') { const w = this.wallAt(x, z); if (w) { this.map.unblock(w.site as never); this.hell.buildings.delete(w.id); } }
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
    // le front : l'assaut vise le poste le plus profond (son camp, ou à défaut les troupes qui le tiennent) ; les autres suivent
    const deepest = this.deepestPost();
    for (let zone = 0; zone < HELL_ZONE_N; zone++) {
      const camp = this.camp(zone), guarded = !!camp || (zone >= 1 && h.conquered[zone] && this.troopsIn(zone));
      const front = guarded && h.held(zone) && zone + 1 < HELL_ZONE_N && zone === deepest && !h.victory;
      if (this.next[zone] === -2 && !live.has(zone)) { this.events.push({ type: 'counterEnd', zone }); this.next[zone] = now + COUNTER_EVERY; this.warnedCounter[zone] = false; }
      if (!front) { if (!live.has(zone)) { this.next[zone] = -1; this.warnedCounter[zone] = false; } continue; }
      if (this.next[zone] === -1) this.next[zone] = now + COUNTER_FIRST;
      if (this.next[zone] >= 0 && !live.has(zone)) {
        // préavis : les démons se rassemblent avant de marcher
        if (!this.warnedCounter[zone] && now >= this.next[zone] - COUNTER_WARN) { this.warnedCounter[zone] = true; this.events.push({ type: 'counterWarn', zone }); }
        if (now >= this.next[zone]) { this.warnedCounter[zone] = false; this.counter(zone); }
      }
    }
    this.stepSiege(live, deepest, now, dt);
    this.stepReclaim(now);
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
    // le front pour les incursions : tant qu'un poste avancé tient, l'île du portail est tranquille
    h.frontPosts = this.outposts();
    if (h.frontPosts > 0) this.hadFront = true;
    else if (this.hadFront) { this.hadFront = false; if (!h.victory) this.events.push({ type: 'frontCleared' }); }
  }

  /**
   * Un poste assiégé (assaut en cours) que personne ne garde plus (ni camp, ni troupe) : après FRONT_GRACE secondes, les démons
   * le reprennent, et le front recule jusqu'au poste suivant
   */
  private stepSiege(live: Set<number>, deepest: number, now: number, dt: number) {
    if (deepest < 1 || !live.has(deepest) || this.camp(deepest) || this.troopsIn(deepest)) { this.abandoned = 0; return; }
    this.abandoned += dt;
    if (this.abandoned < FRONT_GRACE) return;
    this.abandoned = 0;
    this.fall(deepest);
    this.cool = Math.max(this.cool, now + COUNTER_FIRST / 2);
  }

  /** Une zone conquise que personne ne garde finit par être reprise par les démons (une à la fois, avec préavis) */
  private stepReclaim(now: number) {
    const h = this.hell;
    let target = -1;
    if (h.gate && !h.victory) {
      // le plus profond d'abord : un poste en retrait n'est repris qu'une fois les postes plus avancés tombés
      const z = this.deepestPost();
      if (z >= 1 && !this.camp(z) && !this.troopsIn(z) && !this.attackers.size) target = z;
    }
    if (target < 0) { this.reclaim = null; return; }
    if (now < this.cool) return;
    if (!this.reclaim || this.reclaim.zone !== target) { this.reclaim = { zone: target, at: now + RECLAIM_FIRST, warned: false }; return; }
    const r = this.reclaim;
    if (!r.warned && now >= r.at - RECLAIM_WARN) { r.warned = true; this.events.push({ type: 'reclaimWarn', zone: target }); }
    if (now >= r.at) {
      this.reclaim = null; this.cool = now + RECLAIM_COOLDOWN;
      this.hell.retake(target);
      this.events.push({ type: 'zoneLost', zone: target });
    }
  }

  /** Une contre-attaque sur la base d'une zone : des démons de la zone d'après, devant sa forteresse ou à son entrée */
  private counter(zone: number) {
    const h = this.hell, m = this.map, from = zone + 1, n = counterSize(zone, this.count[zone], ageLag(from, h.age));
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
      reclaim: this.reclaim ? { zone: this.reclaim.zone, at: this.reclaim.at } : null,
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
    if (o.reclaim && Number.isInteger(o.reclaim.zone) && Number.isFinite(o.reclaim.at) && o.reclaim.zone >= 1 && o.reclaim.zone < Z_KINGDOM) b.reclaim = { zone: o.reclaim.zone, at: o.reclaim.at, warned: false };
    // camps d'abord (les autres bâtiments se posent autour)
    const list = Array.isArray(o.buildings) ? o.buildings.filter((r) => r && isBaseKind(r.kind) && Number.isFinite(r.x) && Number.isFinite(r.z)) : [];
    list.sort((p, q) => (p.kind === 'camp' ? 0 : 1) - (q.kind === 'camp' ? 0 : 1));
    for (const r of list) if (map.inside(r.x, r.z)) b.place(r.kind, r.x, r.z, r.hp);
    b.events.length = 0;
    // les démons d'une contre-attaque en cours (repris par la faction, sans zone) la poursuivent
    const zones = Array.isArray(o.active) ? o.active.filter((z) => Number.isInteger(z)) : [];
    // (avec leur force : celle de la zone d'où ils viennent, la faction les reprend sans zone)
    if (zones.length) for (const u of hell.alive('hell')) {
      if (u.zone >= 0) continue;
      b.attackers.set(u.id, zones[0]);
      const st = demonStats(u.kind as DemonKind, Math.min(HELL_ZONE_N - 1, zones[0] + 1));
      u.stats = st; u.maxHp = st.hp; u.hp = Math.min(u.hp, st.hp);
    }
    return b;
  }
}
