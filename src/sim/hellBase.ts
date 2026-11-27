import { HellMap, HELL_ZONES, HELL_ZONE_N, Z_KINGDOM, ZONE_AGE, zoneOfZ, zoneOf, zoneThe } from '../world/hell';
import { Hell, HellBuilding, HellEvent, BaseKind, DemonKind, demonStats, raidKinds, DEMON_POWER, zoneTier } from './hell';
import { planWave } from './hellBalance';
import { tr, localize } from '../i18n';

/**
 * La base avancée du joueur dans les Enfers (expéditions facultatives) : dans une zone tenue (le seuil du portail, ou une zone
 * dont la forteresse est abattue), un camp de base puis quelques bâtiments militaires autour (caserne avancée, forge,
 * infirmerie, tour de guet, palissades, braseros), payés en bois, pierre et minerai du village ; les contre-attaques de la faction sur les bases du front (si le camp tombe, la zone est reperdue). Simulation
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
  smithy: { kind: 'smithy', name: 'Forge', icon: '⚒️', r: 1, max: 1, cost: { wood: 20, stone: 30, ore: 10 }, desc: 'Répare et affûte l’équipement des troupes de la base (+20 % de dégâts, coups reçus adoucis). Elle forge aussi, contre du minerai, les lances, arcs et armures qui manquent à la réserve du village pour recruter sur place.' },
  infirmary: { kind: 'infirmary', name: 'Infirmerie', icon: '🩹', r: 1, max: 1, cost: { wood: 30, stone: 20, ore: 0 }, desc: 'Soigne vite les troupes de la base. Un soldat tombé dans les Enfers y est soigné (deux fois plus vite) au lieu de rentrer sur l’île.' },
  tower: { kind: 'tower', name: 'Tour de guet', icon: '🏹', r: 0.6, max: 4, cost: { wood: 20, stone: 30, ore: 0 }, desc: 'Ses archers tirent sur les démons qui approchent.' },
  palisade: { kind: 'palisade', name: 'Palissade', icon: '🚧', r: 0.5, max: 60, cost: { wood: 8, stone: 0, ore: 0 }, desc: 'Cliquez et glissez pour tracer un mur de pieux : il bloque le passage et ralentit les démons qui le longent. Un clic de plus prolonge le mur, Échap arrête. Laissez toujours un passage, ou posez une porte.' },
  gate: { kind: 'gate', name: 'Porte', icon: '🚪', r: 0.5, max: 8, cost: { wood: 14, stone: 0, ore: 0 }, desc: 'À poser sur un mur de palissade : vos troupes la franchissent librement, pas les démons, qui doivent l’abattre.' },
  brazier: { kind: 'brazier', name: 'Brasero', icon: '🔥', r: 0.35, max: 8, cost: { wood: 6, stone: 0, ore: 2 }, desc: 'Éclaire la base et fait reculer la brume rouge.' },
};
// noms et descriptions des bâtiments : rendus dans la langue courante (dictionnaire src/i18n/en/war.ts)
for (const d of Object.values(BASE_DEFS)) localize(d, ['name', 'desc']);
export const BASE_KINDS = Object.keys(BASE_DEFS) as BaseKind[];
export const isBaseKind = (k: unknown): k is BaseKind => typeof k === 'string' && k in BASE_DEFS;

/** Les bâtiments d'une base tiennent à BASE_R cases au plus de son camp ; soins et forge agissent à CARE_R cases d'eux */
export const BASE_R = 14, CARE_R = 9;
/** Un mur peut enfermer jusqu'à ce nombre de cases contre la paroi (un recoin) sans être refusé pour le passage */
export const POCKET = 6;
/** Options de la pose : `path` faux, sans vérifier le passage (la ligne le vérifie d'un coup) ; `lone`, une porte sans pan voisin */
export interface BuildOpt { path?: boolean; lone?: boolean }
/** Un camp de base se pose à CAMP_MARGIN rangées au moins de la zone suivante, si elle est encore aux démons */
export const CAMP_MARGIN = 6;
/** Soins par seconde (points de vie) près du camp et de l'infirmerie */
export const CAMP_REGEN = 2, INFIRMARY_REGEN = 6;
/** La forge : dégâts portés, dégâts reçus des troupes de la base ; minerai pour forger une pièce d'équipement manquante */
export const SMITHY_BOOST = 1.2, SMITHY_GUARD = 0.85, SMITHY_ORE = 4;
/** Les démons qui longent une palissade (à moins d'une case de son bord) vont à cette allure */
export const PALISADE_SLOW = 0.55;
/**
 * Contre-attaques : une base du front (la zone d'après n'est pas conquise) reçoit une première vague COUNTER_FIRST secondes
 * après la pose de son camp, puis une toutes les COUNTER_EVERY secondes une fois la précédente repoussée
 */
export const COUNTER_FIRST = 180, COUNTER_EVERY = 300, COUNTER_MAX = 10;
/**
 * La première contre-attaque sur le camp du Seuil, offert à l'arrivée : SEUIL_FIRST secondes après sa pose, le temps de prendre
 * la zone 1 et de recruter (retour de l'auteur, 24 nov. 2026). Aucune ne part tant que toutes nos troupes sont à terre : elle
 * attend COUNTER_HOLD secondes de plus, encore et encore
 */
export const SEUIL_FIRST = 360, COUNTER_HOLD = 20;
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
/**
 * Le camp sur les ruines (retour de l'auteur, 24 nov. 2026) : une forteresse abattue, le camp avancé se dresse de lui-même sur
 * ses ruines, à RAISE_R cases au plus de son centre. Un camp du Seuil abattu, ses ruines restent aux démons : elles se reprennent
 * quand plus aucun démon ne se tient à OCCUPY_R cases et qu'une de nos troupes s'en approche à HOLD_R cases
 */
export const RAISE_R = 6, OCCUPY_R = 7, HOLD_R = 5;

/** Taille d'une contre-attaque : selon la zone de la base, le nombre de vagues déjà venues et le retard d'âge */
export function counterSize(zone: number, n: number, lag = 0) { return Math.min(COUNTER_MAX + lag * LAG_BONUS, 2 + zone + n + lag * LAG_BONUS); }
/** Le retard d'âge d'un village (`age`) devant la zone `zone` (0 : à niveau) */
export const ageLag = (zone: number, age: number) => Math.max(0, (ZONE_AGE[zone] ?? 0) - age);

/** Ce que le village paie (le monde : son bois, sa pierre, son minerai ; le bac à sable ne paie rien) */
export interface Purse { wood: number; stone: number; ore: number; unlimited?: boolean }
export const canAfford = (p: Purse, c: BaseCost) => !!p.unlimited || (p.wood >= c.wood && p.stone >= c.stone && p.ore >= c.ore);
export function pay(p: Purse, c: BaseCost) { if (p.unlimited) return; p.wood -= c.wood; p.stone -= c.stone; p.ore -= c.ore; }
export function costText(c: BaseCost) {
  return [c.wood ? `${c.wood} ${tr('bois')}` : '', c.stone ? `${c.stone} ${tr('pierre')}` : '', c.ore ? `${c.ore} ${tr('minerai')}` : ''].filter(Boolean).join(', ') || tr('gratuit');
}

export type BaseEvent =
  | { type: 'built'; kind: BaseKind; zone: number }
  | { type: 'counterWarn'; zone: number }
  | { type: 'counter'; zone: number; n: number }
  /** le dernier poste avancé est tombé : les incursions sur l'île reprennent (après un temps de répit) */
  | { type: 'frontCleared' }
  | { type: 'counterEnd'; zone: number }
  | { type: 'campLost'; zone: number }
  /** le camp s'est dressé de lui-même sur les ruines d'une forteresse (`zone`), ou sur celles du camp du Seuil repris (`retaken`) */
  | { type: 'raised'; zone: number; retaken?: boolean }
  /** les démons ont pris les ruines du camp du Seuil : il faut les en chasser */
  | { type: 'occupied'; zone: number }
  /** les démons ont repris une zone ; `camp` : son camp de base est tombé (et non une zone laissée sans garde) */
  | { type: 'zoneLost'; zone: number; camp?: boolean }
  | { type: 'reclaimWarn'; zone: number };

export interface HellBaseSave {
  next: number[]; count: number[];
  /** zones dont une contre-attaque est en cours */
  active: number[];
  /** zone conquise non gardée que les démons s'apprêtent à reprendre, et quand */
  reclaim?: { zone: number; at: number } | null;
  /** les ruines du camp du Seuil, aux mains des démons ; absent : aucune */
  occupied?: { x: number; z: number } | null;
  buildings: { kind: BaseKind; x: number; z: number; hp: number }[];
}

export class HellBase {
  /** contre-attaques, par zone : moment de la prochaine (-1 : pas de base au front), vagues déjà venues */
  next: number[] = Array.from({ length: HELL_ZONE_N }, () => -1);
  count: number[] = Array.from({ length: HELL_ZONE_N }, () => 0);
  /** démons d'une contre-attaque en cours → zone visée */
  attackers = new Map<number, number>();
  /** ce qui s'est passé (le jeu en tire ses nouvelles) */
  events: BaseEvent[] = [];
  /** la zone laissée seule que les démons vont reprendre (`at` : le moment) ; `cool` : pas de nouvelle menace avant ce moment */
  reclaim: { zone: number; at: number; warned: boolean } | null = null;
  /** les ruines du camp du Seuil, prises par les démons (null : aucune) */
  occupied: { x: number; z: number } | null = null;
  private cool = 0;
  /** zones dont l'assaut à venir a été annoncé ; temps passé sans personne pour garder un poste assiégé */
  private warnedCounter: boolean[] = Array.from({ length: HELL_ZONE_N }, () => false);
  private abandoned = 0;
  private hadFront = false;
  private reach = { v: -1, n: 0 };
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
  canBuild(kind: BaseKind, x: number, z: number, purse?: Purse, planned = 0, opt: BuildOpt = {}): string | null {
    const d = BASE_DEFS[kind], h = this.hell, m = this.map;
    const cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5, zone = zoneOfZ(Math.floor(cz));
    if (!m.inside(cx, cz)) return tr('Hors de la carte');
    if (zone > h.frontier) return tr('La brume barre {zone} : conquérez d’abord la zone d’avant.', { zone: zoneThe(zone) });
    if (!h.held(zone)) return tr('Il faut d’abord conquérir {zone} : abattez sa forteresse.', { zone: zoneThe(zone) });
    const camp = this.camp(zone);
    if (kind === 'camp') {
      if (camp) return tr('Cette zone a déjà son camp de base.');
      // tout contre une zone encore aux démons, sa garnison en alerte le rasait aussitôt, et la zone était reperdue
      if (zone + 1 < HELL_ZONE_N && !h.conquered[zone + 1] && HELL_ZONES[zone + 1].z0 - cz < CAMP_MARGIN) return tr('Trop près {zone} : ses démons raseraient le camp. Posez-le un peu plus en arrière.', { zone: zoneOf(zone + 1) });
    }
    else if (!camp) return tr('Posez d’abord un camp de base dans cette zone.');
    else if (Math.hypot(camp.site.x - cx, camp.site.z - cz) > BASE_R) return tr('Trop loin du camp de base ({n} cases au plus).', { n: BASE_R });
    if (this.countOf(kind, zone) + planned >= d.max) return d.max === 1 ? tr('Au plus un bâtiment de ce genre par base.') : tr('Au plus {n} de ce genre par base.', { n: d.max });
    if (Math.hypot(m.portal[0] - cx, m.portal[1] - cz) < 3.2) return tr('Trop près du portail : laissez le passage.');
    const cells = m.footprintCells({ x: cx, z: cz, r: d.r });
    for (const k of cells) if (m.gate[k]) return tr('Il y a déjà une porte ici.');
    // une porte se pose sur un pan de palissade (elle le remplace), ou dans son prolongement
    const wall = kind === 'gate' ? this.wallAt(cx, cz) : null;
    if (kind === 'gate' && !wall && !opt.lone && !this.wallNear(cx, cz)) return tr('Une porte se pose sur une palissade, ou à son bout.');
    for (const k of cells) if (!wall && (!m.walkable(k % m.W, Math.floor(k / m.W)) || m.bridge[k])) return tr('Il faut un sol libre (ni lave, ni pont, ni paroi, ni bâtiment).');
    // les troupes au combat ne se laissent pas emmurer : il faut une place libre (une porte laisse passer les nôtres)
    for (const u of h.alive()) if ((kind !== 'gate' || u.side === 'hell') && Math.hypot(u.x - cx, u.z - cz) < d.r + u.stats.radius - 0.1 && cells.includes(m.cell(u.x, u.z))) return tr('Des troupes se tiennent là : choisissez une place libre.');
    if (purse && !canAfford(purse, d.cost)) return tr('Il faut {cost}.', { cost: costText(d.cost) });
    if (kind !== 'gate' && opt.path !== false && !this.keepsPath(cells)) return tr('Laissez un passage : ce bâtiment fermerait le chemin.');
    return null;
  }

  /** Le pan de palissade debout dans cette case (centre `cx`, `cz`), s'il y en a un */
  wallAt(cx: number, cz: number) { return this.buildings().find((b) => b.kind === 'palisade' && Math.abs(b.site.x - cx) < 0.5 && Math.abs(b.site.z - cz) < 0.5) ?? null; }
  /** La porte debout dans cette case, s'il y en a une */
  gateAt(cx: number, cz: number) { return this.buildings().find((b) => b.kind === 'gate' && Math.abs(b.site.x - cx) < 0.5 && Math.abs(b.site.z - cz) < 0.5) ?? null; }
  /** Le pan de palissade debout le plus proche d'un point, à `r` cases au plus (pour insérer une porte d'un survol) */
  wallNearest(x: number, z: number, r = 1.2) {
    let best: HellBuilding | null = null, bd = r;
    for (const b of this.buildings()) { if (b.kind !== 'palisade') continue; const d = Math.hypot(b.site.x - x, b.site.z - z); if (d <= bd) { bd = d; best = b; } }
    return best;
  }
  /** Les cases (`x,z` entières) qui portent un pan ou une porte */
  wallCellSet() {
    const s = new Set<string>();
    for (const b of this.buildings()) if (b.kind === 'palisade' || b.kind === 'gate') s.add(`${Math.floor(b.site.x)},${Math.floor(b.site.z)}`);
    return s;
  }
  /**
   * Un mur peut-il passer par cette case ? (test léger pour chercher un tracé : la zone tenue, la portée du camp, un sol libre ;
   * `walls` : les cases déjà murées, que le tracé peut longer ou reprendre) ; la pose, elle, refait tous les contrôles
   */
  wallOk(x: number, z: number, walls?: Set<string>) {
    const m = this.map, h = this.hell, cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    if (!m.inside(cx, cz)) return false;
    const zone = zoneOfZ(Math.floor(cz)), camp = this.camp(zone);
    if (zone > h.frontier || !h.held(zone) || !camp || Math.hypot(camp.site.x - cx, camp.site.z - cz) > BASE_R) return false;
    if (Math.hypot(m.portal[0] - cx, m.portal[1] - cz) < 3.2) return false;
    if (walls?.has(`${Math.floor(x)},${Math.floor(z)}`)) return true;
    const k = m.cell(cx, cz);
    return m.walkable(Math.floor(x), Math.floor(z)) && !m.bridge[k] && !m.gate[k];
  }
  /** Un pan de palissade ou une porte touche cette case par un côté */
  private wallNear(cx: number, cz: number) {
    return this.buildings().some((b) => (b.kind === 'palisade' || b.kind === 'gate') && Math.abs(Math.abs(b.site.x - cx) + Math.abs(b.site.z - cz) - 1) < 0.2);
  }

  /**
   * Ce qu'est une case pour un mur tracé : `ok` (un pan s'y pose), `wall` (un pan ou une porte y tient déjà), `seal` (la paroi,
   * la lave, un bâtiment : elle ferme d'elle-même, le tracé la saute sans laisser de trou), ou la raison qui l'interdit
   */
  wallCell(x: number, z: number): 'ok' | 'wall' | 'seal' | string {
    const m = this.map, h = this.hell, cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    if (!m.inside(cx, cz)) return 'seal';
    const k = m.cell(cx, cz);
    if (m.gate[k] || this.wallAt(cx, cz)) return 'wall';
    if (!m.walkable(Math.floor(cx), Math.floor(cz))) return 'seal';
    if (m.bridge[k]) return tr('Pas de mur sur un pont : fermez de part et d’autre.');
    const zone = zoneOfZ(Math.floor(cz)), camp = this.camp(zone);
    if (zone > h.frontier) return tr('La brume barre {zone} : conquérez d’abord la zone d’avant.', { zone: zoneThe(zone) });
    if (!h.held(zone)) return tr('Il faut d’abord conquérir {zone} : abattez sa forteresse.', { zone: zoneThe(zone) });
    if (!camp) return tr('Posez d’abord un camp de base dans cette zone.');
    if (Math.hypot(camp.site.x - cx, camp.site.z - cz) > BASE_R) return tr('Trop loin du camp de base ({n} cases au plus).', { n: BASE_R });
    if (Math.hypot(m.portal[0] - cx, m.portal[1] - cz) < 3.2) return tr('Trop près du portail : laissez le passage.');
    return 'ok';
  }
  /** Cette case touche par un côté ce qui ferme de soi-même (paroi, lave, bâtiment, mur) : un mur qui s'y arrête ne laisse pas de trou */
  sealed(x: number, z: number) {
    const ix = Math.floor(x), iz = Math.floor(z), m = this.map;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !m.walkable(ix + dx, iz + dz) || !!m.gate[(iz + dz) * m.W + ix + dx]);
  }

  /**
   * Pose en ligne (palissade glissée) : pour chaque case, la raison du refus (null : on peut) ; ce que cela coûte ; les cases
   * se comptent l'une après l'autre (argent, nombre permis), comme à la pose. Un mur qui fermerait tout le passage reçoit une
   * porte (`gate` : son rang ; la case la plus proche du chemin) : les nôtres passent, les démons non. `gateAt` : la porte
   * voulue (touche G, au bout du tracé)
   */
  planLine(kind: BaseKind, cells: [number, number][], purse?: Purse, gateAt = -1): { why: (string | null)[]; cost: BaseCost; n: number; gate: number } {
    const d = BASE_DEFS[kind], m = this.map, G = BASE_DEFS.gate, cost: BaseCost = { wood: 0, stone: 0, ore: 0 }, why: (string | null)[] = [], taken: number[] = [];
    const add = (c: BaseCost, s = 1) => { cost.wood += c.wood * s; cost.stone += c.stone * s; cost.ore += c.ore * s; };
    const plus = (a: BaseCost, b: BaseCost, s = 1): BaseCost => ({ wood: a.wood + b.wood * s, stone: a.stone + b.stone * s, ore: a.ore + b.ore * s });
    let n = 0, gates = 0;
    cells.forEach(([x, z], i) => {
      const gate = i === gateAt, k: BaseKind = gate ? 'gate' : kind, dk = BASE_DEFS[k];
      let r = !gate && this.sameWall(kind, x, z) ? tr('Il y a déjà un pan ici.') : this.canBuild(k, x, z, undefined, gate ? gates : n, { path: false, lone: gate });
      if (!r && purse && !canAfford(purse, plus(cost, dk.cost))) r = tr('Il faut {cost}.', { cost: costText(plus(cost, dk.cost)) });
      why.push(r);
      if (r) return;
      taken.push(i); add(dk.cost);
      if (gate) gates++; else n++;
    });
    const gateOk = () => (gateAt >= 0 && why[gateAt] === null ? gateAt : -1);
    if (kind === 'gate') return { why, cost, n, gate: -1 };
    const foot = (i: number) => m.footprintCells({ x: Math.floor(cells[i][0]) + 0.5, z: Math.floor(cells[i][1]) + 0.5, r: d.r });
    const walls = taken.filter((i) => i !== gateAt);
    if (!walls.length || this.keepsPath(walls.flatMap(foot))) return { why, cost, n, gate: gateOk() };
    // le mur ferme le passage : une porte sur la case la plus proche du chemin, si elle le rouvre
    if (gateAt < 0) {
      const off = (i: number) => Math.abs(cells[i][0] - m.spine[Math.min(m.L - 1, Math.max(0, Math.floor(cells[i][1])))] - 0.5);
      for (const g of [...walls].sort((a, b) => off(a) - off(b))) {
        const [x, z] = cells[g];
        if (this.canBuild('gate', x, z, undefined, 0, { path: false, lone: true })) continue;
        if (purse && !canAfford(purse, plus(plus(cost, d.cost, -1), G.cost))) continue;
        if (!this.keepsPath(walls.filter((i) => i !== g).flatMap(foot))) continue;
        add(d.cost, -1); add(G.cost); n--;
        return { why, cost, n, gate: g };
      }
    }
    // sinon, comme avant : les cases qui fermeraient le passage sont refusées, une à une
    const blocked: number[] = [];
    try {
      for (const i of walls) {
        const f = foot(i);
        if (!this.keepsPath(f)) { why[i] = tr('Laissez un passage : ce bâtiment fermerait le chemin.'); n--; add(d.cost, -1); continue; }
        for (const k of f) { blocked.push(k, m.block[k]); m.block[k] = 1; }
        this.reach.v = -1;
      }
    } finally { for (let i = blocked.length - 2; i >= 0; i -= 2) m.block[blocked[i]] = blocked[i + 1]; this.reach.v = -1; }
    return { why, cost, n, gate: gateOk() };
  }
  /** Un pan de palissade tient déjà dans cette case (on ne le repose pas) */
  private sameWall(kind: BaseKind, x: number, z: number) {
    const cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    return kind === 'palisade' && (!!this.wallAt(cx, cz) || !!this.gateAt(cx, cz));
  }

  /**
   * Bâtit une ligne (payée par `purse`), comme l'a prévue `planLine` (porte comprise) : combien de cases posées, la première
   * raison de refus rencontrée, et si une porte s'y est ouverte
   */
  buildLine(kind: BaseKind, cells: [number, number][], purse?: Purse, gateAt = -1): { built: number; why: string | null; gate: boolean } {
    const plan = this.planLine(kind, cells, purse, gateAt), same = tr('Il y a déjà un pan ici.');
    let built = 0, why: string | null = null, gate = false;
    cells.forEach(([x, z], i) => {
      if (plan.why[i] !== null) { if (plan.why[i] !== same) why ??= plan.why[i]; return; }
      if (i === plan.gate) return;
      const r = this.build(kind, x, z, purse);
      if (typeof r === 'string') why ??= r; else built++;
    });
    if (plan.gate >= 0) {
      const [x, z] = cells[plan.gate], r = this.build('gate', x, z, purse, { lone: true });
      if (typeof r === 'string') why ??= r; else { built++; gate = true; }
    }
    return { built, why, gate };
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
    return n >= this.reach.n - cells.length - POCKET;
  }

  /** Bâtit (payé par `purse`) : renvoie le bâtiment, ou la raison du refus */
  build(kind: BaseKind, x: number, z: number, purse?: Purse, opt: BuildOpt = {}): HellBuilding | string {
    const why = this.canBuild(kind, x, z, purse, 0, opt);
    if (why) return why;
    if (purse) pay(purse, BASE_DEFS[kind].cost);
    return this.place(kind, Math.floor(x) + 0.5, Math.floor(z) + 0.5);
  }

  /** Le bâtiment de la base, debout, sous un point (à son emprise près, plus `pad` cases) : le plus proche */
  at(x: number, z: number, pad = 0.3): HellBuilding | null {
    let best: HellBuilding | null = null, bd = Infinity;
    for (const b of this.buildings()) { const d = Math.hypot(b.site.x - x, b.site.z - z); if (d <= b.site.r + pad && d < bd) { bd = d; best = b; } }
    return best;
  }

  /** Démolit un bâtiment de la base ; rien n'est rendu (comme au village). Le camp, cœur de la base, reste : null, ou la raison du refus */
  demolish(b: HellBuilding): string | null {
    if (b.kind === 'camp') return tr('Le camp de base ne se démolit pas : c’est le cœur de la base.');
    if (b.down || !this.hell.buildings.has(b.id)) return tr('Ce bâtiment n’est plus là.');
    this.map.unblock(b.site as never);
    this.hell.buildings.delete(b.id);
    return null;
  }

  /** Ce qui empêche de déplacer ce bâtiment à ce point (null : on peut) ; les règles de la pose, le bâtiment ôté de sa place */
  relocateWhy(b: HellBuilding, x: number, z: number): string | null {
    if (b.kind === 'camp') return tr('Le camp de base ne se déplace pas : c’est le cœur de la base.');
    if (b.down || !this.hell.buildings.has(b.id)) return tr('Ce bâtiment n’est plus là.');
    this.hell.buildings.delete(b.id);
    this.map.unblock(b.site as never);
    try { return this.canBuild(b.kind as BaseKind, x, z); } finally { this.hell.buildings.set(b.id, b); this.map.reblock(b.site); }
  }

  /** Déplace un bâtiment de la base (gratuit, il garde sa vie) : null, ou la raison du refus */
  relocate(b: HellBuilding, x: number, z: number): string | null {
    const why = this.relocateWhy(b, x, z);
    if (why) return why;
    this.map.unblock(b.site as never);
    this.hell.buildings.delete(b.id);
    this.place(b.kind as BaseKind, Math.floor(x) + 0.5, Math.floor(z) + 0.5, b.hp);
    return null;
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

  // ---------- Pas de simulation ----------

  /** Un pas (juste après celui de la faction, dont il lit les événements sans les consommer) */
  step(dt: number) {
    if (dt <= 0) return;
    const h = this.hell, now = h.time;
    // un camp abattu : la base tombe, la zone est reperdue ; une forteresse abattue : le camp se dresse sur ses ruines
    const won: number[] = [];
    for (const e of h.events) {
      if (this.seen.has(e)) continue;
      this.seen.add(e);
      if (e.type === 'destroyed' && e.kind === 'camp') this.fall(e.zone, true);
      if (e.type === 'conquered' && e.zone >= 1 && e.zone < Z_KINGDOM) won.push(e.zone);
    }
    for (const z of won) this.raise(z);
    this.stepOccupied();
    // les contre-attaques en cours : repoussées quand leurs démons sont tous abattus
    const live = new Set<number>();
    for (const [id, zone] of this.attackers) { const u = h.units.get(id); if (u && u.hp > 0) live.add(zone); else this.attackers.delete(id); }
    // le front : l'assaut vise le poste le plus profond (son camp, ou à défaut les troupes qui le tiennent) ; les autres suivent
    const deepest = this.deepestPost(), troopsUp = h.alive('player').length > 0;
    for (let zone = 0; zone < HELL_ZONE_N; zone++) {
      const camp = this.camp(zone), guarded = !!camp || (zone >= 1 && h.conquered[zone] && this.troopsIn(zone));
      const front = guarded && h.held(zone) && zone + 1 < HELL_ZONE_N && zone === deepest && !h.victory;
      if (this.next[zone] === -2 && !live.has(zone)) { this.events.push({ type: 'counterEnd', zone }); this.next[zone] = now + COUNTER_EVERY; this.warnedCounter[zone] = false; }
      if (!front) { if (!live.has(zone)) { this.next[zone] = -1; this.warnedCounter[zone] = false; } continue; }
      if (this.next[zone] === -1) this.next[zone] = now + (zone === 0 ? SEUIL_FIRST : COUNTER_FIRST);
      // (toutes nos troupes à terre, en soins : les démons attendent leur retour, la base ne tombe pas d'un coup)
      if (this.next[zone] >= 0 && now >= this.next[zone] - 1 && !troopsUp) this.next[zone] = now + COUNTER_HOLD;
      if (this.next[zone] >= 0 && !live.has(zone)) {
        // préavis : les démons se rassemblent avant de marcher
        if (!this.warnedCounter[zone] && now >= this.next[zone] - COUNTER_WARN) { this.warnedCounter[zone] = true; this.events.push({ type: 'counterWarn', zone }); }
        if (now >= this.next[zone]) { this.warnedCounter[zone] = false; this.counter(zone); }
      }
    }
    this.stepSiege(live, deepest, now, dt);
    this.stepReclaim(now);
    // les effets sur les troupes : forge, soins
    const troops = h.alive('player');
    for (const u of troops) {
      const forge = this.near('smithy', u.x, u.z);
      u.boost = forge ? SMITHY_BOOST : 1;
      u.guard = forge ? SMITHY_GUARD : 1;
      if (u.state === 'attack' || u.hp >= u.maxHp) continue;
      const regen = this.near('infirmary', u.x, u.z) ? INFIRMARY_REGEN : this.near('camp', u.x, u.z) ? CAMP_REGEN : 0;
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
    const h = this.hell, m = this.map, from = zone + 1, n0 = counterSize(zone, this.count[zone], ageLag(from, h.age));
    const fort = h.standing(from).find((b) => b.kind === 'fortress' || b.kind === 'kingdom');
    const z0 = HELL_ZONES[from].z0 + 3, sx = fort ? fort.site.x : m.spine[z0] + 0.5, sz = fort ? fort.site.z - fort.site.r - 1.5 : z0 + 0.5;
    // la taille suit la puissance des troupes du joueur dans les Enfers (voir `hellBalance.ts`), l'âge de la zone visée et celui du
    // village ; sans troupe sur place, le plancher (l'ancienne taille) tient
    const lv = zone + this.count[zone] + 1, legacy = raidKinds(lv, n0);
    const kinds: DemonKind[] = planWave({
      level: lv, age: zoneTier(from, h.age), power: h.playerPower(), legacy, powers: DEMON_POWER, balance: h.balance,
      losses: h.lossStreak,
    });
    const n = kinds.length, side = Math.ceil(Math.sqrt(n * 1.6));
    kinds.forEach((k, i) => {
      const c = m.nearestWalkable(sx + ((i % side) - (side - 1) / 2) * 0.8, sz - Math.floor(i / side) * 0.8, 5);
      const [x, z] = c >= 0 ? [(c % m.W) + 0.5, Math.floor(c / m.W) + 0.5] : [sx, sz];
      const u = h.addRaider(k, demonStats(k, from, h.balance.legacy), x, z);
      this.attackers.set(u.id, zone);
    });
    this.count[zone]++;
    this.next[zone] = -2;
    this.events.push({ type: 'counter', zone, n });
  }

  /**
   * Le camp sur les ruines : la forteresse de la zone abattue, le camp de base se dresse de lui-même sur ses ruines (gratuit),
   * s'il n'y en a pas déjà un. Le plus avancé, il devient le point de ralliement, de soins et d'arrivée des recrues. Rend le camp
   */
  raise(zone: number): HellBuilding | null {
    const h = this.hell;
    if (h.victory || !h.gate || this.camp(zone)) return null;
    const fort = [...h.buildings.values()].find((b) => b.side === 'hell' && b.zone === zone && b.kind === 'fortress');
    if (!fort || !fort.down) return null;
    return this.raiseAt(zone, fort.site.x, fort.site.z, false);
  }

  /** Pose le camp offert au plus près d'un point (`retaken` : les ruines du Seuil reprises), annoncé à la vue et aux nouvelles */
  private raiseAt(zone: number, x: number, z: number, retaken: boolean): HellBuilding | null {
    const p = this.spotNear('camp', x, z, RAISE_R);
    if (!p) return null;
    const b = this.place('camp', p[0], p[1]);
    this.events.push({ type: 'raised', zone, ...(retaken ? { retaken } : {}) });
    // (la vue le fait sortir de terre lentement, dans la poussière)
    this.hell.events.push({ type: 'raised', id: b.id, x: b.site.x, z: b.site.z });
    return b;
  }

  /** La case libre la plus proche d'un point, à `r` cases au plus, où ce bâtiment se pose (règles de la pose, sans payer) */
  spotNear(kind: BaseKind, x: number, z: number, r: number): [number, number] | null {
    const cells: [number, number, number][] = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const cx = Math.floor(x) + dx + 0.5, cz = Math.floor(z) + dz + 0.5, d = Math.hypot(cx - x, cz - z);
      if (d <= r) cells.push([cx, cz, d]);
    }
    cells.sort((p, q) => p[2] - q[2]);
    const c = cells.find(([cx, cz]) => this.canBuild(kind, cx, cz) === null);
    return c ? [c[0], c[1]] : null;
  }

  /**
   * Les ruines du camp du Seuil aux mains des démons : reprises quand plus aucun démon ne s'y tient et qu'une de nos troupes s'en
   * approche ; le camp s'y relève alors de lui-même
   */
  private stepOccupied() {
    const o = this.occupied, h = this.hell;
    if (!o) return;
    if (this.camp(0)) { this.occupied = null; return; }
    if (h.alive('hell').some((u) => Math.hypot(u.x - o.x, u.z - o.z) < OCCUPY_R)) return;
    if (!h.alive('player').some((u) => Math.hypot(u.x - o.x, u.z - o.z) < HOLD_R)) return;
    if (this.raiseAt(0, o.x, o.z, true)) this.occupied = null;
  }

  /** Le camp d'une zone est tombé : ses autres bâtiments s'effondrent ; la zone est reperdue (sauf le seuil du portail) */
  private fall(zone: number, camp = false) {
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
    if (zone > 0 && h.conquered[zone]) {
      // la forteresse se relève là où était le camp (sur ses ruines) : il est devenu leur fort, il faut le reprendre
      h.retake(zone);
      const fort = [...h.buildings.values()].find((b) => b.side === 'hell' && b.zone === zone && b.kind === 'fortress');
      if (fort) for (const b of this.buildings(true)) if (b.down && b.zone === zone && Math.hypot(b.site.x - fort.site.x, b.site.z - fort.site.z) < fort.site.r + b.site.r) h.buildings.delete(b.id);
      this.events.push({ type: 'zoneLost', zone, ...(camp ? { camp } : {}) });
    } else if (zone === 0) {
      // au Seuil : les démons occupent les ruines du camp ; les en chasser le relève
      const ruin = this.buildings(true).find((b) => b.kind === 'camp' && b.zone === 0 && b.down);
      if (ruin) { this.occupied = { x: ruin.site.x, z: ruin.site.z }; this.events.push({ type: 'occupied', zone }); }
      else this.events.push({ type: 'campLost', zone });
    } else this.events.push({ type: 'campLost', zone });
  }

  // ---------- Sauvegarde ----------

  save(): HellBaseSave {
    return {
      next: [...this.next], count: [...this.count],
      active: [...new Set(this.attackers.values())],
      reclaim: this.reclaim ? { zone: this.reclaim.zone, at: this.reclaim.at } : null,
      occupied: this.occupied ? { ...this.occupied } : null,
      buildings: this.buildings().map((b) => ({ kind: b.kind as BaseKind, x: b.site.x, z: b.site.z, hp: Math.round(b.hp) })),
    };
  }

  /** Reprend une base sauvegardée sur la faction reprise (abîmée ou absente : une base vide) */
  static load(hell: Hell, map: HellMap, d: unknown): HellBase {
    const b = new HellBase(hell, map);
    if (!d || typeof d !== 'object') return b;
    const o = d as Partial<HellBaseSave>;
    for (const [key, arr] of [['next', b.next], ['count', b.count]] as const) {
      const src = o[key];
      if (Array.isArray(src)) src.forEach((v, i) => { if (i < HELL_ZONE_N && Number.isFinite(v)) arr[i] = v; });
    }
    // (une ancienne sauvegarde : aucune ruine occupée)
    if (o.occupied && Number.isFinite(o.occupied.x) && Number.isFinite(o.occupied.z)) b.occupied = { x: o.occupied.x, z: o.occupied.z };
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
      const st = demonStats(u.kind as DemonKind, Math.min(HELL_ZONE_N - 1, zones[0] + 1), hell.balance.legacy);
      u.stats = st; u.maxHp = st.hp; u.hp = Math.min(u.hp, st.hp);
    }
    return b;
  }
}
