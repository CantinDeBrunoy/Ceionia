import { HellSite, HellSiteKind, HellZoneInfo, Z_KINGDOM, HELL_ZONE_N, HELL_ZONES, zoneOfZ, zoneCapOfAge } from '../world/hell';
import { mulberry32 } from '../core/rng';

/**
 * La carte où se battent les unités : celle des Enfers (`HellMap`), ou celle de l'île du portail (`IsleMap`, voir
 * `isleBattle.ts`) ; cases numérotées `z * W + x`
 */
export interface CombatMap {
  readonly W: number;
  readonly L: number;
  readonly seed: number;
  version: number;
  zones: HellZoneInfo[];
  /** point d'arrivée (le portail des Enfers) : on s'y replie */
  arrival: [number, number];
  cell(x: number, z: number): number;
  /** (`foe` : pour un démon ; les portes du joueur, dans les Enfers, lui sont fermées) */
  walkable(cx: number, cz: number, foe?: boolean): boolean;
  walkableAt(x: number, z: number, foe?: boolean): boolean;
  nearestWalkable(x: number, z: number, max?: number, foe?: boolean): number;
  route(from: number, to: number, foe?: boolean): number[] | null;
  lineClear(x0: number, z0: number, x1: number, z1: number, foe?: boolean): boolean;
  unblock(site: { x: number; z: number; r: number }): void;
  /** remet une emprise (un bâtiment relevé) ; seulement dans les Enfers */
  reblock?(site: { x: number; z: number; r: number }): void;
}

/**
 * Bâtiments de la base avancée du joueur dans les Enfers (voir `hellBase.ts`) : camp de base, caserne avancée, forge,
 * infirmerie, tour de guet, palissade, porte, brasero
 */
export type BaseKind = 'camp' | 'post' | 'smithy' | 'infirmary' | 'tower' | 'palisade' | 'gate' | 'brazier';
/** Bâtiments du joueur pris dans les combats : la tour de garde (elle tire) et la caserne, sur l'île du portail ; ceux de la base avancée */
export type PlayerSiteKind = 'watchtower' | 'barracks' | BaseKind;
export type SiteKind = HellSiteKind | PlayerSiteKind;
/** Emplacement d'un bâtiment au combat (démoniaque, ou du joueur) */
export interface CombatSite { kind: SiteKind; x: number; z: number; zone: number; r: number }

/**
 * La faction des Enfers : ses démons (garnisons par zone, patrouilles, alerte, riposte), ses bâtiments (avant-postes qui
 * tirent, forges qui envoient des renforts, forteresses, la citadelle du royaume) et ses incursions sur l'île du portail.
 * Simulation pure (aucun rendu) : la vue infernale la montre, le contrôle des troupes (à venir) y place les unités du joueur
 * et leur donne des ordres. Temps en secondes de jeu, distances en cases
 */

export type DemonKind = 'imp' | 'brute' | 'archer' | 'chief' | 'guardian' | 'king' | 'elite';
/** Caractéristiques d'une unité : vie, dégâts par coup, portée (cases, depuis le bord de la cible), vitesse (cases/s), temps entre deux coups, vue, rayon */
export interface UnitStats { hp: number; dmg: number; range: number; speed: number; cooldown: number; sight: number; radius: number; /** multiplie les dégâts contre les grandes créatures (arme d'hast) */ big?: number }
/** Les grandes créatures des Enfers */
const BIG = new Set<string>(['brute', 'chief', 'guardian', 'king', 'elite']);
export const DEMONS: Record<DemonKind, UnitStats & { name: string; plural: string }> = {
  imp: { name: 'diablotin', plural: 'diablotins', hp: 30, dmg: 4, range: 0.5, speed: 2.6, cooldown: 0.8, sight: 7, radius: 0.22 },
  brute: { name: 'brute', plural: 'brutes', hp: 130, dmg: 14, range: 0.6, speed: 1.25, cooldown: 1.6, sight: 6, radius: 0.36 },
  archer: { name: 'archer de braise', plural: 'archers de braise', hp: 40, dmg: 7, range: 6, speed: 1.8, cooldown: 1.5, sight: 8, radius: 0.24 },
  chief: { name: 'démon-chef', plural: 'démons-chefs', hp: 220, dmg: 16, range: 0.7, speed: 1.8, cooldown: 1.2, sight: 8, radius: 0.34 },
  guardian: { name: 'gardien de la zone', plural: 'gardiens', hp: 650, dmg: 28, range: 0.9, speed: 1.3, cooldown: 2, sight: 8, radius: 0.55 },
  king: { name: 'roi des Enfers', plural: 'rois des Enfers', hp: 1600, dmg: 40, range: 1.2, speed: 1.1, cooldown: 2.2, sight: 10, radius: 0.75 },
  /** la garde du roi, dans la citadelle */
  elite: { name: 'garde d’élite', plural: 'gardes d’élite', hp: 300, dmg: 18, range: 0.8, speed: 1.6, cooldown: 1.3, sight: 8, radius: 0.38 },
};
/**
 * Bâtiments : vie, armure (retranchée de chaque coup reçu), tir (dégâts, portée, temps entre deux flèches de feu). Les
 * démoniaques, puis ceux du joueur sur l'île du portail (la tour de garde tire sur les démons à portée)
 */
export const SITES: Record<SiteKind, { name: string; hp: number; armor: number; dmg: number; range: number; cooldown: number }> = {
  outpost: { name: 'avant-poste', hp: 300, armor: 2, dmg: 6, range: 6, cooldown: 2 },
  forge: { name: 'forge infernale', hp: 420, armor: 3, dmg: 0, range: 0, cooldown: 0 },
  fortress: { name: 'forteresse', hp: 1200, armor: 5, dmg: 10, range: 7, cooldown: 1.6 },
  kingdom: { name: 'citadelle du royaume', hp: 4000, armor: 8, dmg: 16, range: 8, cooldown: 1.4 },
  spire: { name: 'tour de la citadelle', hp: 520, armor: 4, dmg: 7, range: 7, cooldown: 1.8 },
  watchtower: { name: 'tour de garde', hp: 360, armor: 3, dmg: 9, range: 6.5, cooldown: 1.5 },
  barracks: { name: 'caserne', hp: 520, armor: 4, dmg: 0, range: 0, cooldown: 0 },
  camp: { name: 'camp de base', hp: 500, armor: 3, dmg: 0, range: 0, cooldown: 0 },
  post: { name: 'caserne avancée', hp: 450, armor: 3, dmg: 0, range: 0, cooldown: 0 },
  smithy: { name: 'forge', hp: 400, armor: 3, dmg: 0, range: 0, cooldown: 0 },
  infirmary: { name: 'infirmerie', hp: 350, armor: 2, dmg: 0, range: 0, cooldown: 0 },
  tower: { name: 'tour de guet', hp: 300, armor: 3, dmg: 8, range: 6.5, cooldown: 1.5 },
  palisade: { name: 'palissade', hp: 260, armor: 4, dmg: 0, range: 0, cooldown: 0 },
  gate: { name: 'porte', hp: 300, armor: 4, dmg: 0, range: 0, cooldown: 0 },
  brazier: { name: 'brasero', hp: 120, armor: 1, dmg: 0, range: 0, cooldown: 0 },
};

/** Les démons s'éloignent au plus de LEASH cases de leur poste ; au-delà, ils y retournent */
export const LEASH = 16;
/** Durée d'une alerte de zone (relancée tant que l'ennemi est en vue) */
export const ALERT_TIME = 12;
/** Une forge envoie un renfort toutes les FORGE_EVERY secondes, tant que la garnison de sa zone est entamée */
export const FORGE_EVERY = 45;
/**
 * Incursions sur l'île du portail : la première RAID_FIRST secondes après son ouverture, puis toutes les RAID_EVERY (un peu
 * moins à chaque niveau, jusqu'à RAID_MIN) ; au plus RAID_MAX démons (RAID_SECURED_MAX une fois l'île sécurisée). L'île est
 * sécurisée après SECURE_WAVES vagues repoussées : réglé pour qu'une tour de garde, une caserne et sa garnison suffisent,
 * sans aucune expédition dans les Enfers (facultatives)
 */
/** Répit (s) laissé à l'île après la chute du dernier poste avancé, avant l'incursion suivante */
export const FRONT_RESPITE = 120;
export const RAID_FIRST = 300, RAID_EVERY = 240, RAID_MIN = 150, RAID_MAX = 10, RAID_SECURED_MAX = 6, SECURE_WAVES = 5;

export type Side = 'hell' | 'player';
/**
 * Ce que fait une unité : garde à son poste, patrouille, poursuite, attaque, retour au poste ; pour le joueur : marche vers
 * un point, tient sa position, se replie (vers le portail)
 */
/** Durée (s) pendant laquelle un mort reste affiché (chute puis fondu) avant d'être retiré */
export const DEAD_LIFE = 2;

export type UnitState = 'guard' | 'patrol' | 'chase' | 'attack' | 'return' | 'move' | 'hold' | 'retreat' | 'idle' | 'dead';
/**
 * Ordre donné à une unité du joueur (contrôle direct, chantier 4) : se déplacer (sans combattre en route), attaquer (une
 * cible, ou un point : on combat ce qu'on croise), tenir (ne frappe que ce qui est à portée), se replier (vers le portail)
 */
export interface HellOrder { kind: 'move' | 'attack' | 'hold' | 'retreat'; x?: number; z?: number; target?: number }

export interface HellUnit {
  id: number; side: Side; kind: string; stats: UnitStats;
  x: number; z: number; heading: number; hp: number; maxHp: number;
  /** zone de garnison (démons) ; -1 pour le joueur */
  zone: number;
  state: UnitState;
  /** poste de garde (démons) : on y revient après le combat */
  home: [number, number];
  /** cible : une unité ou un bâtiment (même suite d'identifiants) */
  target: number | null;
  /** temps avant le prochain coup */
  cool: number;
  /** chemin suivi (cases) et l'étape visée ; case du but et temps avant de recalculer le chemin */
  path: number[] | null; pathI: number; goal: number; repath: number;
  /** boucle de patrouille et l'étape visée */
  patrol: [number, number][] | null; patrolI: number;
  /** ordre en cours (joueur) */
  order: HellOrder | null;
  /** pour la vue : la marche (phase des pas), le temps depuis le dernier coup porté et depuis le dernier coup reçu */
  walk: number; moving: boolean; swing: number; hurt: number;
  /**
   * effets de la base avancée (remis à chaque pas par elle) : dégâts portés (forge, faim), dégâts reçus (forge), allure (les
   * démons qui longent une palissade)
   */
  boost?: number; guard?: number; paceK?: number;
  /** une cible hors d'atteinte (aucun chemin : lave, paroi) qu'on laisse de côté quelques secondes, pour en viser une autre */
  blocked?: number; blockedT?: number;
}

export interface HellBuilding {
  id: number; side: Side; kind: SiteKind; site: CombatSite; zone: number;
  hp: number; maxHp: number; armor: number; cool: number;
  /** multiplie ses dégâts (la tour de garde gagne en force avec les âges) */
  power?: number;
  /** abattu (ses ruines restent) */
  down: boolean;
  /** forge : temps avant le prochain renfort ; pour la vue : temps depuis le dernier tir, le dernier coup reçu */
  spawnT: number; swing: number; hurt: number;
  target: number | null;
}

export type HellEvent =
  | { type: 'hit'; x: number; z: number; target: number; source: number; dmg: number; ranged: boolean }
  | { type: 'shot'; x0: number; z0: number; y0: number; x1: number; z1: number; source: number; target: number; fire: boolean }
  | { type: 'death'; id: number; kind: string; side: Side; x: number; z: number }
  | { type: 'destroyed'; id: number; kind: SiteKind; x: number; z: number; zone: number }
  | { type: 'alert'; zone: number; x: number; z: number }
  | { type: 'spawn'; id: number; kind: DemonKind; x: number; z: number }
  | { type: 'conquered'; zone: number }
  /** une zone reperdue (sa base est tombée : la forteresse se relève) ; un ordre arrêté par la brume d'une zone fermée */
  | { type: 'lost'; zone: number }
  | { type: 'sealed'; zone: number; /** fermée faute d'âge (et non faute de conquête) */ byAge?: boolean }
  | { type: 'victory' }
  /** le combat du roi (voir `kingdom.ts`) : une phase qui commence (1 : réveil, 2 : rage, 3 : le roi abattu), un cri, une boule de feu qui s'écrase */
  | { type: 'boss'; phase: number }
  | { type: 'roar'; x: number; z: number }
  | { type: 'blast'; x: number; z: number; r: number }
  | { type: 'raid'; wave: number; n: number }
  | { type: 'raidEnd'; wave: number; repelled: boolean }
  | { type: 'secured' };

/**
 * Une incursion : la vague de démons qui passe le portail. Elle n'attaque QUE l'île du portail (jamais l'île principale) :
 * c'est à l'île de la placer devant son portail et de la faire combattre
 */
export interface RaidWave {
  wave: number;
  /** niveau de difficulté (vagues repoussées + 1) */
  level: number;
  target: 'portal-island';
  units: { kind: DemonKind; name: string; stats: UnitStats }[];
}

/** Garnison d'un bâtiment, selon sa sorte et sa zone */
function garrisonOf(kind: HellSiteKind, zone: number): DemonKind[] {
  const deep = Math.floor((zone - 1) / 2);
  switch (kind) {
    // (la première zone, sans démon-chef : la première expédition se gagne avec la garnison pleine de l'Antiquité)
    case 'fortress': return ['guardian', ...(zone >= 2 ? ['chief' as const] : []), ...rep('brute', 1 + deep), ...rep('archer', 2 + deep), ...rep('imp', 2)];
    case 'outpost': return ['archer', ...rep('imp', 2 + (zone >= 3 ? 1 : 0))];
    case 'forge': return ['brute', 'imp'];
    case 'kingdom': return ['king', ...rep('elite', 4), 'chief', ...rep('brute', 2), ...rep('archer', 3), ...rep('imp', 3)];
    case 'spire': return [];
  }
}
const rep = (v: DemonKind, n: number): DemonKind[] => Array.from({ length: n }, () => v);

/** Les démons des zones profondes sont plus coriaces */
export function demonStats(kind: DemonKind, zone: number): UnitStats {
  const s = DEMONS[kind], lv = Math.max(0, zone - 1);
  // le gardien de la première zone, moins coriace : la première expédition se gagne avec la garnison pleine de l'Antiquité
  const first = kind === 'guardian' && zone === 1 ? 0.7 : 1;
  return { ...s, hp: Math.round(s.hp * (1 + 0.12 * lv) * first), dmg: Math.round(s.dmg * (1 + 0.1 * lv) * first * 10) / 10 };
}

/**
 * Taille d'une vague selon son niveau (vagues déjà repoussées + 1) : deux diablotins d'abord, un de plus à chaque niveau,
 * au plus RAID_MAX ; une fois l'île sécurisée, de simples escarmouches ; chaque zone des Enfers conquise l'affaiblit
 */
export function raidSize(level: number, conquered = 0, secured = false) {
  return Math.max(2, Math.min(secured ? RAID_SECURED_MAX : RAID_MAX, 1 + level) - conquered);
}

/** Composition d'une vague : diablotins ; une brute dès le niveau 3, des archers dès le 4, un chef dès le 7 */
export function raidKinds(level: number, n: number): DemonKind[] {
  const kinds: DemonKind[] = level >= 7 ? ['chief'] : [];
  for (let i = kinds.length; i < n; i++) kinds.push(level >= 4 && i % 4 === 2 ? 'archer' : level >= 3 && i % 4 === 3 ? 'brute' : 'imp');
  return kinds;
}

/** Temps jusqu'à la vague suivante (deux fois plus long une fois l'île sécurisée) */
export function raidInterval(level: number, secured = false) { return Math.max(RAID_MIN, RAID_EVERY - 10 * level) * (secured ? 2 : 1); }

/** Force d'une vague (pour régler les défenses de l'île) : vie totale, dégâts par seconde */
export function raidStrength(w: RaidWave) {
  return { hp: w.units.reduce((s, u) => s + u.stats.hp, 0), dps: w.units.reduce((s, u) => s + u.stats.dmg / u.stats.cooldown, 0) };
}

export class Hell {
  units = new Map<number, HellUnit>();
  buildings = new Map<number, HellBuilding>();
  /** ce qui s'est passé depuis la dernière lecture (la vue en tire coups, flèches, éclats ; le jeu, ses nouvelles) */
  events: HellEvent[] = [];
  time = 0;
  /** alerte de chaque zone : temps restant et où l'ennemi a été vu */
  alert = new Float32Array(HELL_ZONE_N);
  alertAt: [number, number][] = Array.from({ length: HELL_ZONE_N }, () => [0, 0]);
  conquered: boolean[] = Array.from({ length: HELL_ZONE_N }, () => false);
  victory = false;
  /** incursions : numéro de la dernière vague, moment de la suivante (-1 : pas encore fixé) */
  wave = 0;
  nextRaid = -1;
  /** vague en cours sur l'île (l'île signale son issue par `endRaid`) */
  activeRaid: RaidWave | null = null;
  /** vagues repoussées, vagues qui ont submergé l'île ; depuis quand l'île tient (-1 : pas encore menacée) */
  raidsRepelled = 0;
  raidsLost = 0;
  heldSince = -1;
  /**
   * postes avancés du joueur encore tenus dans les Enfers (rempli par la base) : tant qu'il y en a, les démons doivent d'abord
   * les reprendre un à un, et aucune incursion ne vise l'île du portail
   */
  frontPosts = 0;
  /** où se replient les unités du joueur (null : le point d'arrivée de la carte, le portail des Enfers) */
  rally: [number, number] | null = null;
  /**
   * Les zones s'ouvrent l'une après l'autre (carte des Enfers seulement) : le joueur n'entre dans une zone que si la
   * précédente est conquise ; une brume infernale lui barre le passage. Les démons, eux, passent
   */
  readonly gate: boolean;
  /** l'âge du village : il plafonne les zones où le joueur peut aller (les démons y sont trop forts au-delà) ; 99 : sans limite */
  age = 99;
  private nextId = 1;
  private rnd: () => number;
  /** nombre d'unités qui visent chaque cible (remis à chaque pas) */
  private load = new Map<number, number>();
  /** garnison initiale de chaque zone (les forges la complètent jusque-là) */
  private cap: number[] = [];
  private mapV = -1;

  constructor(readonly map: CombatMap, seed = map.seed) {
    this.rnd = mulberry32(seed * 977 + 13);
    this.gate = map.zones.length === HELL_ZONE_N;
    this.populate();
  }

  /**
   * La dernière zone où le joueur peut aller : le seuil du portail et la zone 1 sont ouverts d'emblée, chaque forteresse
   * abattue ouvre la suivante (une zone reperdue referme celles d'après)
   */
  get frontier() {
    if (!this.gate) return HELL_ZONE_N - 1;
    const c = this.conquestFrontier;
    // l'âge plafonne l'accès ; une zone déjà conquise reste toujours ouverte (ancienne sauvegarde, âge en retard)
    return Math.min(c, Math.max(this.ageCap, c - 1));
  }
  /** La première zone non conquise (la dernière que les conquêtes ouvrent), sans compter l'âge */
  get conquestFrontier() {
    let i = 1;
    while (i < Z_KINGDOM && this.conquered[i]) i++;
    return i;
  }
  /** La dernière zone où l'âge du village permet d'entrer */
  get ageCap() { return zoneCapOfAge(this.age); }
  /** Zone tenue par le joueur (on peut y bâtir sa base) : le seuil, et les zones conquises encore ouvertes */
  held(zone: number) { return zone >= 0 && zone <= this.frontier && (zone === 0 || this.conquered[zone]); }

  /** Une zone reperdue : sa forteresse se relève (à moitié) avec une petite garnison ; les zones d'après se referment */
  retake(zone: number) {
    if (zone <= 0 || !this.conquered[zone] || zone === Z_KINGDOM) return;
    this.conquered[zone] = false;
    for (const b of this.buildings.values()) {
      if (b.side !== 'hell' || b.zone !== zone || b.kind !== 'fortress' || !b.down) continue;
      b.down = false; b.hp = Math.round(b.maxHp * 0.5); b.target = null;
      this.map.reblock?.(b.site);
      const ring = this.postsAround(b.site as HellSite, 4);
      this.spawn('guardian', ...this.frontOf(b.site), zone);
      (['brute', 'imp', 'imp'] as DemonKind[]).forEach((k, i) => this.spawn(k, ring[i % ring.length][0], ring[i % ring.length][1], zone));
    }
    this.events.push({ type: 'lost', zone });
  }

  /** Un bâtiment abattu (la base qui tombe : ses bâtiments restants s'effondrent) */
  raze(b: HellBuilding) { if (!b.down) this.destroy(b); }

  // ---------- Mise en place ----------

  /** Les bâtiments et leurs garnisons, les patrouilles ; la zone du seuil (le portail) est vide */
  private populate() {
    for (const zn of this.map.zones) {
      let n = 0;
      for (const s of zn.sites) {
        // les postes de garde : en cercle autour du bâtiment
        const g = garrisonOf(s.kind, zn.id), ring = this.postsAround(s, g.length);
        let post = 0;
        const nextPost = () => ring[post++ % ring.length];
        const st = SITES[s.kind];
        const b: HellBuilding = {
          id: this.nextId++, side: 'hell', kind: s.kind, site: s, zone: zn.id, hp: st.hp * (1 + 0.1 * Math.max(0, zn.id - 1)), maxHp: 0,
          armor: st.armor, cool: 0, down: false, spawnT: FORGE_EVERY, swing: 9, hurt: 9, target: null,
        };
        b.hp = Math.round(b.hp); b.maxHp = b.hp;
        this.buildings.set(b.id, b);
        for (const k of g) {
          // le gardien et le roi se tiennent devant leur bâtiment ; les autres à leurs postes
          const p: [number, number] = k === 'guardian' || k === 'king' ? this.frontOf(s) : nextPost();
          this.spawn(k, p[0], p[1], zn.id);
          n++;
        }
      }
      // une patrouille par zone (deux diablotins, une brute plus loin) le long de la faille
      if (zn.id > 0 && zn.id < Z_KINGDOM && zn.patrol.length) {
        const kinds: DemonKind[] = zn.id >= 3 ? ['brute', 'imp', 'imp'] : ['imp', 'imp'];
        kinds.forEach((k, i) => {
          const p = zn.patrol[0], u = this.spawn(k, p[0] + (i % 2 ? 0.6 : -0.6), p[1] - i * 0.7, zn.id);
          u.patrol = zn.patrol; u.patrolI = 1; u.state = 'patrol';
          n++;
        });
      }
      this.cap[zn.id] = n;
    }
  }

  /** 
 postes de garde libres autour d'un bâtiment */
  private postsAround(s: HellSite, n: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4, rr = s.r + 1.2 + (i % 2) * 0.9;
      const c = this.map.nearestWalkable(s.x + Math.sin(a) * rr, s.z + Math.cos(a) * rr, 3), W = this.map.W;
      if (c >= 0) out.push([(c % W) + 0.5 + (this.rnd() - 0.5) * 0.4, Math.floor(c / W) + 0.5 + (this.rnd() - 0.5) * 0.4]);
    }
    return out.length ? out : [this.frontOf(s)];
  }

  /** Point libre devant un bâtiment, côté portail (nord) */
  private frontOf(s: CombatSite): [number, number] {
    const c = this.map.nearestWalkable(s.x, s.z - s.r - 1.2, 4), W = this.map.W;
    return c >= 0 ? [(c % W) + 0.5, Math.floor(c / W) + 0.5] : [s.x, s.z - s.r - 1];
  }

  /** Fait apparaître un démon (garnison de la zone `zone`) */
  spawn(kind: DemonKind, x: number, z: number, zone: number): HellUnit {
    const stats = demonStats(kind, zone);
    return this.addUnit('hell', kind, stats, x, z, zone);
  }

  /**
   * Unité du joueur dans les Enfers (le contrôle des troupes l'y place, au portail ou à une caserne) : `kind` est libre
   * (soldat, archer…), `stats` ses caractéristiques ; elle attend des ordres (`order`)
   */
  addPlayerUnit(kind: string, stats: UnitStats, x: number, z: number): HellUnit {
    const u = this.addUnit('player', kind, stats, x, z, -1);
    u.state = 'idle';
    return u;
  }

  /**
   * Un démon d'une incursion (zone -1) : sans poste ni laisse, il fond sur la défense la plus proche (unité ou bâtiment du
   * joueur), quelle que soit la distance
   */
  addRaider(kind: DemonKind, stats: UnitStats, x: number, z: number): HellUnit {
    const u = this.addUnit('hell', kind, stats, x, z, -1);
    u.state = 'chase';
    return u;
  }

  /**
   * Un bâtiment du joueur au combat (tour de garde, caserne) : son emprise (rayon `r`) bloque le passage ; `power` multiplie
   * ses dégâts, `hpK` sa vie
   */
  addPlayerBuilding(kind: PlayerSiteKind, x: number, z: number, r: number, power = 1, hpK = 1): HellBuilding {
    const st = SITES[kind], hp = Math.round(st.hp * hpK);
    const b: HellBuilding = {
      id: this.nextId++, side: 'player', kind, site: { kind, x, z, zone: -1, r }, zone: -1, hp, maxHp: hp, armor: st.armor, cool: 0, power,
      down: false, spawnT: 0, swing: 9, hurt: 9, target: null,
    };
    this.buildings.set(b.id, b);
    return b;
  }

  private addUnit(side: Side, kind: string, stats: UnitStats, x: number, z: number, zone: number): HellUnit {
    const u: HellUnit = {
      id: this.nextId++, side, kind, stats: { ...stats }, x, z, heading: side === 'hell' ? Math.PI : 0, hp: stats.hp, maxHp: stats.hp, zone,
      state: 'guard', home: [x, z], target: null, cool: 0, path: null, pathI: 0, goal: -1, repath: 0, patrol: null, patrolI: 0, order: null,
      walk: this.rnd() * 6, moving: false, swing: 9, hurt: 9,
    };
    this.units.set(u.id, u);
    return u;
  }

  /** Donne un ordre à des unités du joueur */
  order(ids: number[], o: HellOrder) {
    // un but au-delà de la brume : on s'arrête devant (la zone s'ouvrira quand la précédente sera conquise)
    if (this.gate && o.z !== undefined && zoneOfZ(Math.floor(o.z)) > this.frontier) {
      const f = this.frontier, W = this.map.W, ox = o.x ?? W / 2, byAge = f + 1 <= this.conquestFrontier;
      let best: [number, number] | null = null;
      // la case libre la plus proche du but, sur les rangées juste avant la brume
      for (let z = HELL_ZONES[f + 1].z0 - 2; z > HELL_ZONES[f + 1].z0 - 12 && !best; z--)
        for (let x = 0; x < W; x++) if (this.map.walkable(x, z) && (!best || Math.abs(x + 0.5 - ox) < Math.abs(best[0] - ox))) best = [x + 0.5, z + 0.5];
      o = { ...o, ...(best ? { x: best[0], z: best[1] } : {}) };
      this.events.push({ type: 'sealed', zone: f + 1, byAge });
    }
    for (const id of ids) {
      const u = this.units.get(id);
      if (!u || u.side !== 'player' || u.hp <= 0) continue;
      u.order = { ...o };
      u.target = o.kind === 'attack' && o.target !== undefined ? o.target : null;
      u.path = null;
      u.state = o.kind === 'hold' ? 'hold' : o.kind === 'retreat' ? 'retreat' : o.kind === 'move' ? 'move' : 'chase';
    }
  }

  // ---------- Requêtes ----------

  /** Unités vivantes d'un camp (ou de tous) */
  alive(side?: Side) { return [...this.units.values()].filter((u) => u.hp > 0 && (!side || u.side === side)); }
  /** Garnison vivante d'une zone */
  garrison(zone: number) { return this.alive('hell').filter((u) => u.zone === zone); }
  /** Bâtiments debout d'une zone */
  standing(zone?: number) { return [...this.buildings.values()].filter((b) => !b.down && (zone === undefined || b.zone === zone)); }
  /** Une unité ou un bâtiment, vivant, par son identifiant */
  entity(id: number | null): HellUnit | HellBuilding | null {
    if (id === null) return null;
    const u = this.units.get(id);
    if (u) return u.hp > 0 ? u : null;
    const b = this.buildings.get(id);
    return b && !b.down ? b : null;
  }
  private posOf(e: HellUnit | HellBuilding): [number, number, number] {
    return 'site' in e ? [e.site.x, e.site.z, e.site.r] : [e.x, e.z, e.stats.radius];
  }
  /** Distance d'une unité au bord d'une cible */
  private gap(u: HellUnit, e: HellUnit | HellBuilding) {
    const [x, z, r] = this.posOf(e);
    return Math.hypot(x - u.x, z - u.z) - r - u.stats.radius;
  }

  // ---------- Pas de simulation ----------

  step(dt: number) {
    if (dt <= 0) return;
    this.time += dt;
    // une emprise s'est libérée : les chemins en cours se refont
    if (this.map.version !== this.mapV) { this.mapV = this.map.version; for (const u of this.units.values()) u.path = null; }
    for (let z = 0; z < HELL_ZONE_N; z++) this.alert[z] = Math.max(0, this.alert[z] - dt);
    const live = this.alive();
    // combien d'unités visent chaque cible (pour répartir les assaillants au lieu de les voir tous sur la même)
    this.load.clear();
    for (const u of live) if (u.target !== null) this.load.set(u.target, (this.load.get(u.target) ?? 0) + 1);
    for (const b of this.buildings.values()) if (!b.down && b.target !== null) this.load.set(b.target, (this.load.get(b.target) ?? 0) + 1);
    // le chrono « touché » court aussi pour les morts : il pilote leur chute puis leur retrait
    for (const u of this.units.values()) if (u.hp <= 0) u.hurt += dt;
    for (const u of live) {
      u.cool -= dt; u.swing += dt; u.hurt += dt; u.repath -= dt;
      if (u.blockedT !== undefined && (u.blockedT -= dt) <= 0) { u.blocked = undefined; u.blockedT = undefined; }
      u.moving = false;
      if (u.side === 'hell') this.thinkDemon(u, dt, live);
      else this.thinkPlayer(u, dt, live);
    }
    this.separate(live);
    for (const b of this.buildings.values()) if (!b.down) this.thinkBuilding(b, dt, live);
    // les morts disparaissent un peu après (la vue montre leur chute)
    for (const u of [...this.units.values()]) if (u.hp <= 0 && u.hurt > DEAD_LIFE) this.units.delete(u.id);
  }

  /** Ennemi le plus proche en vue (unité, ou bâtiment du joueur) */
  private nearestFoe(u: HellUnit, live: HellUnit[], range: number): HellUnit | HellBuilding | null {
    let best: HellUnit | HellBuilding | null = null, bs = Infinity;
    // (une cible déjà assaillie par plusieurs compte comme un peu plus loin : la mêlée s'étale sur plusieurs cibles)
    const crowd = (id: number) => Math.max(0, (this.load.get(id) ?? 0) - (u.target === id ? 1 : 0)) * 0.4;
    for (const o of live) {
      if (o.side === u.side || o.hp <= 0 || o.id === u.blocked) continue;
      const d = this.gap(u, o), sc = d + (d < 4 ? crowd(o.id) : 0);
      if (d < range && sc < bs) { bs = sc; best = o; }
    }
    for (const b of this.buildings.values()) {
      if (b.down || b.side === u.side || b.id === u.blocked) continue;
      const d = this.gap(u, b), sc = d + (d < 4 ? crowd(b.id) : 0);
      if (d < range && sc < bs) { bs = sc; best = b; }
    }
    return best;
  }

  /** Lance l'alerte dans une zone : toute la garnison accourt vers l'ennemi vu */
  raiseAlert(zone: number, x: number, z: number) {
    if (zone < 0 || zone >= HELL_ZONE_N || (this.conquered[zone] && zone !== Z_KINGDOM)) return;
    if (this.alert[zone] <= 0) this.events.push({ type: 'alert', zone, x, z });
    this.alert[zone] = ALERT_TIME;
    this.alertAt[zone] = [x, z];
  }

  private thinkDemon(u: HellUnit, dt: number, live: HellUnit[]) {
    // un démon d'incursion : droit sur la défense la plus proche (il ne lâche sa cible que pour une plus proche qui le gêne)
    if (u.zone < 0) {
      let t = this.entity(u.target);
      const near = this.nearestFoe(u, live, t ? Math.min(this.gap(u, t), u.stats.sight) : Infinity);
      if (near) t = near;
      u.target = t ? t.id : null;
      if (t) this.fight(u, t, dt, true);
      else u.state = 'guard';
      return;
    }
    const dHome = Math.hypot(u.x - u.home[0], u.z - u.home[1]);
    // trop loin de son poste : il y retourne, sans se laisser distraire
    if (u.state === 'return') {
      if (dHome < 1.2) { u.state = u.patrol ? 'patrol' : 'guard'; u.path = null; }
      else { this.moveTo(u, u.home[0], u.home[1], dt); return; }
    }
    if (dHome > LEASH) { u.state = 'return'; u.target = null; u.path = null; this.moveTo(u, u.home[0], u.home[1], dt); return; }
    let t = this.entity(u.target);
    if (t && this.gap(u, t) > u.stats.sight * 1.6) t = null;
    // en alerte, la garnison voit plus loin
    const sight = u.stats.sight * (this.alert[u.zone] > 0 ? 1.5 : 1);
    if (!t) t = this.nearestFoe(u, live, sight);
    u.target = t ? t.id : null;
    if (t) {
      const [tx, tz] = this.posOf(t);
      this.raiseAlert(u.zone, tx, tz);
      this.fight(u, t, dt, true);
      return;
    }
    // l'alerte : on accourt là où l'ennemi a été vu
    if (this.alert[u.zone] > 0) {
      const [ax, az] = this.alertAt[u.zone];
      if (Math.hypot(ax - u.x, az - u.z) > 1.5 && Math.hypot(ax - u.home[0], az - u.home[1]) < LEASH - 1) { u.state = 'chase'; this.moveTo(u, ax, az, dt); return; }
    }
    if (u.patrol) {
      u.state = 'patrol';
      const p = u.patrol[u.patrolI % u.patrol.length];
      if (Math.hypot(p[0] - u.x, p[1] - u.z) < 0.8) u.patrolI++;
      // la patrouille avance au pas, son poste la suit (on ne la rappelle pas au premier point de la boucle)
      this.moveTo(u, p[0], p[1], dt, 0.6);
      u.home = [u.x, u.z];
      return;
    }
    u.state = 'guard';
    if (dHome > 0.5) this.moveTo(u, u.home[0], u.home[1], dt, 0.7);
  }

  private thinkPlayer(u: HellUnit, dt: number, live: HellUnit[]) {
    const o = u.order;
    // repli et déplacement : on marche sans combattre
    if (o && (o.kind === 'move' || o.kind === 'retreat')) {
      const [gx, gz] = o.kind === 'retreat' ? this.rally ?? this.map.arrival : [o.x ?? u.x, o.z ?? u.z];
      if (Math.hypot(gx - u.x, gz - u.z) < 0.6) { u.order = null; u.state = 'idle'; u.path = null; return; }
      u.state = o.kind === 'retreat' ? 'retreat' : 'move';
      // un but hors d'atteinte (de l'autre côté de la lave, dans la roche) : l'ordre tombe, l'unité ne reste pas plantée là
      // sans se défendre
      if (!this.moveTo(u, gx, gz, dt, o.kind === 'retreat' ? 1.15 : 1)) { u.order = null; u.state = 'idle'; }
      return;
    }
    // tenir : on frappe ce qui est à portée, sans bouger
    if (o && o.kind === 'hold') {
      u.state = 'hold';
      let t = this.entity(u.target);
      if (!t || this.gap(u, t) > u.stats.range) t = this.nearestFoe(u, live, u.stats.range + 0.05);
      u.target = t ? t.id : null;
      if (t) this.fight(u, t, dt, false);
      return;
    }
    let t = this.entity(u.target);
    // attaque d'une cible désignée : jusqu'à sa mort ; puis on reprend l'attaque du point, ou on attend
    if (o && o.kind === 'attack' && o.target !== undefined && !t) { u.order = o.x !== undefined ? { kind: 'attack', x: o.x, z: o.z } : null; }
    if (!t) t = this.nearestFoe(u, live, u.stats.sight);
    u.target = t ? t.id : null;
    if (t) { this.fight(u, t, dt, true); return; }
    if (u.order && u.order.kind === 'attack' && u.order.x !== undefined) {
      const gx = u.order.x, gz = u.order.z ?? u.z;
      if (Math.hypot(gx - u.x, gz - u.z) < 0.8) { u.order = null; u.state = 'idle'; return; }
      u.state = 'chase';
      if (!this.moveTo(u, gx, gz, dt)) { u.order = null; u.state = 'idle'; }
      return;
    }
    u.state = 'idle';
  }

  /** Combat : à portée, on frappe (ou on tire) ; sinon on s'approche (si l'on peut bouger) */
  private fight(u: HellUnit, t: HellUnit | HellBuilding, dt: number, mobile: boolean) {
    const [tx, tz, tr] = this.posOf(t);
    const gap = this.gap(u, t);
    if (gap <= u.stats.range) {
      u.state = 'attack';
      u.heading = Math.atan2(tx - u.x, tz - u.z);
      u.path = null;
      if (u.cool <= 0) { u.cool = u.stats.cooldown; u.swing = 0; this.strike(u, t); }
      return;
    }
    if (!mobile) return;
    u.state = 'chase';
    // un bâtiment : on vise le point libre de son pourtour le plus proche
    let ok: boolean;
    if ('site' in t) {
      const a = Math.atan2(u.x - tx, u.z - tz), c = this.map.nearestWalkable(tx + Math.sin(a) * (tr + 0.6), tz + Math.cos(a) * (tr + 0.6), 3, u.side === 'hell');
      ok = c >= 0 ? this.moveTo(u, (c % this.map.W) + 0.5, Math.floor(c / this.map.W) + 0.5, dt) : this.moveTo(u, tx, tz, dt);
    } else {
      // un adversaire au corps à corps : on vise sa « place » autour de lui (selon l'unité, d'un côté ou de l'autre) et non son
      // centre, pour que les assaillants l'entourent au lieu de s'empiler sur lui
      let gx = tx, gz = tz;
      if (u.stats.range <= 2 && gap < 4) {
        const a = Math.atan2(u.x - tx, u.z - tz) + (((u.id * 0.618034) % 1) - 0.5) * 2.4, r = tr + u.stats.radius + u.stats.range * 0.8;
        const px = tx + Math.sin(a) * r, pz = tz + Math.cos(a) * r;
        if (this.map.walkableAt(px, pz, u.side === 'hell')) { gx = px; gz = pz; }
      }
      ok = this.moveTo(u, gx, gz, dt);
    }
    // hors d'atteinte : on la laisse de côté un moment (sinon l'unité reste plantée devant, sans se battre contre ce qui
    // l'attaque) ; l'ordre de l'attaquer tombe
    if (!ok) {
      u.blocked = t.id; u.blockedT = 4; u.target = null; u.path = null;
      if (u.order?.kind === 'attack' && u.order.target === t.id) u.order = u.order.x !== undefined ? { kind: 'attack', x: u.order.x, z: u.order.z } : null;
    }
  }

  /** Un coup porté : au corps à corps, il porte tout de suite ; à distance, une flèche de feu (la vue la fait voler) */
  private strike(u: HellUnit, t: HellUnit | HellBuilding) {
    const [tx, tz] = this.posOf(t);
    const ranged = u.stats.range > 2;
    if (ranged) this.events.push({ type: 'shot', x0: u.x, z0: u.z, y0: 0.5, x1: tx, z1: tz, source: u.id, target: t.id, fire: u.side === 'hell' });
    // (l'arme d'hast : un bonus contre les grandes créatures, brutes, chefs, gardiens, rois)
    const big = u.stats.big && !('site' in t) && BIG.has(t.kind) ? u.stats.big : 1;
    this.damage(t, u.stats.dmg * (u.boost ?? 1) * big, u.id, ranged);
  }

  /** Inflige des dégâts (l'armure des bâtiments en retranche) ; la cible riposte, sa zone donne l'alerte */
  damage(t: HellUnit | HellBuilding, dmg: number, source: number, ranged = false) {
    const [x, z] = this.posOf(t);
    const real = 'site' in t ? Math.max(1, dmg - t.armor) : dmg * (t.guard ?? 1);
    t.hp -= real;
    t.hurt = 0;
    this.events.push({ type: 'hit', x, z, target: t.id, source, dmg: real, ranged });
    const src = this.units.get(source);
    if ('site' in t) {
      if (t.side === 'hell') this.raiseAlert(t.zone, src?.x ?? x, src?.z ?? z);
      if (t.hp <= 0) this.destroy(t);
      return;
    }
    // riposte : un démon frappé se tourne vers son agresseur (s'il n'a pas déjà une cible au contact)
    if (src && src.hp > 0 && t.hp > 0) {
      const cur = this.entity(t.target);
      if (!cur || this.gap(t, cur) > t.stats.range) t.target = source;
      if (t.side === 'hell') this.raiseAlert(t.zone, src.x, src.z);
    }
    if (t.hp <= 0) {
      t.hp = 0; t.state = 'dead'; t.target = null; t.path = null;
      this.events.push({ type: 'death', id: t.id, kind: t.kind, side: t.side, x: t.x, z: t.z });
    }
  }

  private destroy(b: HellBuilding) {
    b.hp = 0; b.down = true;
    this.map.unblock(b.site);
    this.events.push({ type: 'destroyed', id: b.id, kind: b.kind, x: b.site.x, z: b.site.z, zone: b.zone });
    if (b.side !== 'hell') return;
    if (b.kind === 'fortress' || b.kind === 'kingdom') {
      this.conquered[b.zone] = true;
      this.alert[b.zone] = 0;
      this.events.push({ type: 'conquered', zone: b.zone });
    }
    if (b.kind === 'kingdom') { this.victory = true; this.events.push({ type: 'victory' }); }
  }

  /** Bâtiments : les tours tirent sur l'ennemi à portée ; les forges envoient des renforts à leur zone */
  private thinkBuilding(b: HellBuilding, dt: number, live: HellUnit[]) {
    b.cool -= dt; b.swing += dt; b.hurt += dt;
    const st = SITES[b.kind];
    if (st.dmg > 0) {
      let t = this.entity(b.target) as HellUnit | null;
      if (t && Math.hypot(t.x - b.site.x, t.z - b.site.z) - b.site.r > st.range) t = null;
      if (!t) {
        let bd = st.range;
        for (const o of live) {
          if (o.side === b.side || o.hp <= 0) continue;
          const d = Math.hypot(o.x - b.site.x, o.z - b.site.z) - b.site.r;
          if (d < bd) { bd = d; t = o; }
        }
      }
      b.target = t ? t.id : null;
      if (t && b.cool <= 0) {
        b.cool = st.cooldown; b.swing = 0;
        const y0 = b.kind === 'kingdom' ? 4.2 : b.kind === 'fortress' || b.kind === 'spire' ? 2.6 : b.kind === 'watchtower' || b.kind === 'tower' ? 2.4 : 1.8;
        this.events.push({ type: 'shot', x0: b.site.x, z0: b.site.z, y0, x1: t.x, z1: t.z, source: b.id, target: t.id, fire: b.side === 'hell' });
        this.damage(t, st.dmg * (1 + 0.1 * Math.max(0, b.zone - 1)) * (b.power ?? 1), b.id, true);
        if (b.side === 'hell') this.raiseAlert(b.zone, t.x, t.z);
      }
    }
    if (b.kind === 'forge' && b.side === 'hell' && !this.conquered[b.zone]) {
      b.spawnT -= dt;
      if (b.spawnT <= 0) {
        b.spawnT = FORGE_EVERY;
        if (this.garrison(b.zone).length < (this.cap[b.zone] ?? 0)) {
          const kind: DemonKind = this.rnd() < 0.35 ? 'brute' : 'imp', p = this.frontOf(b.site);
          const zn = this.map.zones[b.zone], post = zn.posts[Math.floor(this.rnd() * zn.posts.length)] ?? p;
          const u = this.spawn(kind, p[0], p[1], b.zone);
          u.home = [post[0], post[1]];
          this.events.push({ type: 'spawn', id: u.id, kind, x: p[0], z: p[1] });
        }
      }
    }
  }

  // ---------- Déplacement ----------

  /**
   * Avance vers un point : tout droit si la ligne est libre, sinon par le chemin de case en case (recalculé quand le but
   * change de case, au plus deux fois par seconde) en coupant les virages ; glisse le long des obstacles. Renvoie false si le
   * but est hors d'atteinte (aucun chemin)
   */
  moveTo(u: HellUnit, gx: number, gz: number, dt: number, pace = 1): boolean {
    const m = this.map, d = Math.hypot(gx - u.x, gz - u.z), HW = m.W, foe = u.side === 'hell';
    if (d < 0.05) return true;
    let wx = gx, wz = gz;
    if (!(d < 12 && m.lineClear(u.x, u.z, gx, gz, foe))) {
      const gc = m.cell(Math.min(m.W - 1, Math.max(0, gx)), Math.min(m.L - 1, Math.max(0, gz)));
      if (!u.path || (gc !== u.goal && u.repath <= 0)) {
        const from = m.walkableAt(u.x, u.z, foe) ? m.cell(u.x, u.z) : m.nearestWalkable(u.x, u.z, 2, foe);
        const to = m.walkable(gc % HW, Math.floor(gc / HW), foe) ? gc : m.nearestWalkable(gx, gz, 3, foe);
        u.goal = gc; u.repath = 0.5;
        u.path = from >= 0 && to >= 0 ? m.route(from, to, foe) : null;
        u.pathI = 1;
        if (!u.path) return false;
      }
      const p = u.path;
      // on coupe les virages : on vise l'étape la plus lointaine visible (quelques-unes devant au plus)
      while (u.pathI + 1 < p.length && u.pathI < p.length && this.cellClear(u, p[u.pathI + 1])) u.pathI++;
      if (u.pathI >= p.length) { wx = gx; wz = gz; }
      else {
        wx = (p[u.pathI] % HW) + 0.5; wz = Math.floor(p[u.pathI] / HW) + 0.5;
        if (Math.hypot(wx - u.x, wz - u.z) < 0.3) u.pathI++;
      }
    }
    const dd = Math.hypot(wx - u.x, wz - u.z);
    if (dd < 1e-4) return true;
    const step = Math.min(dd, u.stats.speed * pace * (u.paceK ?? 1) * dt), nx = u.x + ((wx - u.x) / dd) * step, nz = u.z + ((wz - u.z) / dd) * step;
    u.heading = Math.atan2(wx - u.x, wz - u.z);
    // la brume d'une zone fermée repousse le joueur (on peut toujours en revenir)
    if (u.side === 'player' && this.gate && nz > u.z) {
      const zn = zoneOfZ(Math.floor(nz));
      if (zn > this.frontier && zn > zoneOfZ(Math.floor(u.z))) { u.path = null; return true; }
    }
    // (pris dans une emprise, une zone reperdue dont la forteresse se relève : il en sort)
    if (m.walkableAt(nx, nz, foe) || !m.walkableAt(u.x, u.z, foe)) { u.x = nx; u.z = nz; }
    else if (m.walkableAt(nx, u.z, foe)) u.x = nx;
    else if (m.walkableAt(u.x, nz, foe)) u.z = nz;
    else { u.path = null; return true; }
    u.moving = true;
    u.walk += step * 2.6;
    return true;
  }

  private cellClear(u: HellUnit, k: number) {
    const x = (k % this.map.W) + 0.5, z = Math.floor(k / this.map.W) + 0.5;
    return Math.hypot(x - u.x, z - u.z) < 7 && this.map.lineClear(u.x, u.z, x, z, u.side === 'hell');
  }

  /** Les unités ne s'empilent pas : celles qui se chevauchent s'écartent (sans entrer dans la roche ni la lave) */
  private separate(live: HellUnit[]) {
    const m = this.map;
    // deux passes, avec un peu de marge entre les corps : on voit qui est qui dans la mêlée
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j], dx = b.x - a.x, dz = b.z - a.z, min = (a.stats.radius + b.stats.radius) * 1.2 + 0.04;
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min) continue;
        const push = (min - d) * 0.5, ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0;
        // le plus lourd bouge moins
        const wa = b.stats.radius / (a.stats.radius + b.stats.radius), wb = a.stats.radius / (a.stats.radius + b.stats.radius);
        if (m.walkableAt(a.x - ux * push * wa, a.z - uz * push * wa, a.side === 'hell')) { a.x -= ux * push * wa; a.z -= uz * push * wa; }
        if (m.walkableAt(b.x + ux * push * wb, b.z + uz * push * wb, b.side === 'hell')) { b.x += ux * push * wb; b.z += uz * push * wb; }
      }
    }
  }

  // ---------- Incursions ----------

  /**
   * Une incursion est-elle due ? `time` : temps de jeu (secondes) ; le premier appel fixe la première vague (l'île vient
   * d'ouvrir). Jamais pendant une incursion en cours ; plus aucune une fois le royaume détruit
   */
  raidDue(time: number) {
    if (this.victory || this.activeRaid) return false;
    if (this.nextRaid < 0) { this.nextRaid = time + RAID_FIRST; this.heldSince = time; return false; }
    // le front tient : l'île attend ; une fois le dernier poste tombé, un répit avant la première incursion
    if (this.frontPosts > 0) { this.nextRaid = Math.max(this.nextRaid, time + FRONT_RESPITE); return false; }
    return time >= this.nextRaid;
  }

  /** Niveau de la prochaine vague : il ne monte qu'avec les vagues repoussées (une défaite ne rend pas la suivante plus dure) */
  get raidLevel() { return this.raidsRepelled + 1; }

  /** L'île du portail est sécurisée : SECURE_WAVES vagues repoussées (acquis pour de bon, l'étape du passage d'âge) */
  get islandSecured() { return this.raidsRepelled >= SECURE_WAVES; }

  /** Depuis combien de temps l'île tient (depuis la première menace, ou la dernière vague qui l'a submergée), en secondes */
  heldFor(time: number) { return this.heldSince < 0 ? 0 : Math.max(0, time - this.heldSince); }
  /** …en jours de jeu (`dayLen` : durée d'un jour, en secondes) */
  daysHeld(time: number, dayLen: number) { return Math.floor(this.heldFor(time) / Math.max(1, dayLen)); }

  /**
   * La vague suivante passe le portail : ses démons (quelques diablotins d'abord ; des brutes, des archers, puis un chef s'y
   * mêlent à mesure qu'on les repousse), à placer sur l'île du portail — jamais sur l'île principale ; fixe la vague d'après.
   * L'île signale ensuite son issue par `endRaid`
   */
  spawnRaid(time = this.nextRaid): RaidWave {
    this.wave++;
    const lv = this.raidLevel, conq = this.conquered.filter(Boolean).length, n = raidSize(lv, conq, this.islandSecured);
    const kinds = raidKinds(lv, n);
    this.nextRaid = Math.max(time, 0) + raidInterval(lv, this.islandSecured);
    this.events.push({ type: 'raid', wave: this.wave, n });
    const w: RaidWave = { wave: this.wave, level: lv, target: 'portal-island', units: kinds.map((k) => ({ kind: k, name: DEMONS[k].name, stats: demonStats(k, 1) })) };
    this.activeRaid = w;
    return w;
  }

  /**
   * Issue de l'incursion en cours, signalée par l'île : repoussée (tous ses démons abattus ou renvoyés au portail), ou l'île
   * submergée (sa garnison vaincue). Renvoie true si cette victoire vient de sécuriser l'île
   */
  endRaid(repelled: boolean, time: number): boolean {
    if (!this.activeRaid) return false;
    const was = this.islandSecured, wave = this.activeRaid.wave;
    this.activeRaid = null;
    if (repelled) this.raidsRepelled++;
    else { this.raidsLost++; this.heldSince = time; }
    this.events.push({ type: 'raidEnd', wave, repelled });
    if (!was && this.islandSecured) { this.events.push({ type: 'secured' }); return true; }
    return false;
  }
  // ---------- Sauvegarde ----------

  /**
   * État à sauvegarder : unités vivantes, vie des bâtiments, zones conquises, incursions (`players` : avec les unités du
   * joueur ; sans elles quand l'armée les sauvegarde elle-même)
   */
  save(players = true): HellSave {
    return {
      time: this.time, wave: this.wave, nextRaid: this.nextRaid, victory: this.victory, conquered: [...this.conquered],
      raidsRepelled: this.raidsRepelled, raidsLost: this.raidsLost, heldSince: this.heldSince,
      buildings: [...this.buildings.values()].filter((b) => b.side === 'hell').map((b) => [b.id, Math.max(0, Math.round(b.hp))]),
      units: this.alive().filter((u) => players || u.side !== 'player').map((u) => ({ side: u.side, kind: u.kind, zone: u.zone, x: +u.x.toFixed(2), z: +u.z.toFixed(2), hp: Math.round(u.hp), home: u.home, stats: u.side === 'player' ? u.stats : undefined, patrol: !!u.patrol })),
    };
  }

  /** Reprend un état sauvegardé sur une carte neuve (même graine) */
  static load(map: CombatMap, s: HellSave): Hell {
    const h = new Hell(map);
    h.time = s.time; h.wave = s.wave; h.nextRaid = s.nextRaid; h.victory = s.victory;
    h.raidsRepelled = s.raidsRepelled ?? 0; h.raidsLost = s.raidsLost ?? 0; h.heldSince = s.heldSince ?? -1;
    s.conquered.forEach((c, i) => (h.conquered[i] = c));
    for (const [id, hp] of s.buildings) { const b = h.buildings.get(id); if (b) { b.hp = hp; if (hp <= 0) { b.down = true; map.unblock(b.site); } } }
    h.units.clear();
    for (const r of s.units) {
      const u = r.side === 'player' ? h.addPlayerUnit(r.kind, r.stats ?? DEMONS.imp, r.x, r.z) : h.spawn(r.kind as DemonKind, r.x, r.z, r.zone);
      u.hp = r.hp; u.home = [r.home[0], r.home[1]];
      // (jamais plus de vie que sa vie pleine : la barre de vie déborderait)
      u.maxHp = Math.max(u.maxHp, u.hp);
      if (r.patrol) { const zn = map.zones[r.zone]; u.patrol = zn.patrol; u.state = 'patrol'; }
    }
    return h;
  }
}

export interface HellSave {
  time: number; wave: number; nextRaid: number; victory: boolean; conquered: boolean[];
  raidsRepelled?: number; raidsLost?: number; heldSince?: number;
  buildings: [number, number][];
  units: { side: Side; kind: string; zone: number; x: number; z: number; hp: number; home: [number, number]; stats?: UnitStats; patrol: boolean }[];
}
