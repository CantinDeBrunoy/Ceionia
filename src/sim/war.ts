import type { World } from '../world/world';
import { HellMap } from '../world/hell';
import { isleDefenses, repelWave, ISLE_SECURE } from '../world/portal';
import { Hell, HellEvent, HellSave, HellUnit, RaidWave, DEMONS, DemonKind, demonStats, SECURE_WAVES, SITES, DEMON_POWER, INVASION_DELAY } from './hell';
import { IsleBattle, defenseK } from './isleBattle';
import { balanceOf, powerOf } from './hellBalance';
import { tr, plural } from '../i18n';
import { gearName, Army, Troop, TroopKind, TROOPS, newArmy, readArmy, stepArmy, troopStats, wound, ready, REGEN, RecruitCtx, recruit, isTroopKind, ageUp as ageUpArmy, HEAL_TIME, troopKit, troopName } from './army';
import { HellBase, HellBaseSave, SMITHY_ORE, Purse } from './hellBase';
import { HELL_ZONES, zoneOf, zoneThe, zoneAgeText } from '../world/hell';
import type { BaseKind } from './hell';
import { GEAR_BY } from './gear';
import { penHerds } from './missions';
import { Blight, isleBlight } from '../world/blight';
import { KingFight, KingSave, KingdomReward, claimKingdom } from './kingdom';

/**
 * La guerre contre les Enfers, côté simulation : la faction démoniaque (elle vit même quand on ne la regarde pas, à pas
 * allégés), ses incursions sur l'île du portail (la tour de garde tire, la garnison se bat, la vague est repoussée ou l'île
 * submergée), l'armée du joueur (recrues, blessés) et ses unités, sur l'île ou en expédition dans les Enfers. Jamais rien
 * sur l'île principale. Le jeu lit ses nouvelles (`news`) et ses alertes
 */

/** Pas de la simulation allégée (faction hors de vue) */
export const COARSE = 0.25;
/**
 * L'invasion : la première grosse vague, que le joueur doit repousser pour ouvrir les Enfers. `wait` : pas encore annoncée (il
 * manque la tour, la caserne ou la garnison) ; `coming` : annoncée, compte à rebours ; `raid` : la vague est sur l'île ; `done` :
 * repoussée (les Enfers s'ouvrent). Après une défaite, on revient à `wait` : elle sera ré-annoncée
 */
export type Invasion = 'wait' | 'coming' | 'raid' | 'done';
const INVASIONS: Invasion[] = ['wait', 'coming', 'raid', 'done'];
/** La force d'une vague, pour le joueur */
export type WaveForce = 'small' | 'medium' | 'big';
/** Soldats valides à la garnison pour que l'invasion soit annoncée (moins en Facile et au bac à sable) */
export const invasionTroops = (d: string) => (d === 'easy' || d === 'sandbox' ? 2 : 3);
/** Un compte à rebours en m:ss (secondes de jeu) */
export function clockText(s: number) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
/** Petite, moyenne ou grosse : par rapport à la première vague (deux diablotins) */
export function waveForce(kinds: DemonKind[]): WaveForce {
  const r = kinds.reduce((a, k) => a + DEMON_POWER[k], 0) / (2 * DEMON_POWER.imp);
  return r < 1.9 ? 'small' : r < 3 ? 'medium' : 'big';
}

/** L'incursion est annoncée (avec sa composition) cette durée (s) avant d'arriver */
export const WARN_TIME = 40;

/** « , dont 2 golems de lave et 1 démon cornu » : les gros monstres d'une vague (ceux qui pèsent plus de deux brutes) */
export function bigOf(kinds: DemonKind[]) {
  const counts = new Map<DemonKind, number>();
  for (const k of kinds) if (DEMON_POWER[k] >= DEMON_POWER.brute * 1.5 && k !== 'chief') counts.set(k, (counts.get(k) ?? 0) + 1);
  const parts = [...counts].sort((a, b) => DEMON_POWER[a[0]] - DEMON_POWER[b[0]]).map(([k, n]) => `${n} ${n > 1 ? DEMONS[k].plural : DEMONS[k].name}`);
  return parts.length ? tr(', dont {list}', { list: parts.length > 1 ? tr('{a} et {b}', { a: parts.slice(0, -1).join(', '), b: parts[parts.length - 1] }) : parts[0] }) : '';
}

export interface WarNews { text: string; kind: 'raid' | 'invasion' | 'invasionStart' | 'invasionDone' | 'repelled' | 'lost' | 'secured' | 'troop' | 'portal' | 'info' | 'counter' | 'zone' | 'boss' | 'victory' }

export interface WarSave {
  army: Army;
  faction: HellSave | null;
  /** la base avancée dans les Enfers */
  base?: HellBaseSave | null;
  /** la vague en cours : sa description, ses démons encore debout (positions sur l'île) */
  raid?: { w: RaidWave; units: { kind: DemonKind; x: number; z: number; hp: number }[]; t?: number } | null;
  /** le combat du roi des Enfers */
  king?: KingSave | null;
  /** les récompenses de la chute du royaume, quand son écran de victoire n'a pas encore été vu (partie quittée pendant la cinématique) */
  reward?: KingdomReward | null;
  /** la cinématique de fin du volet militaire a été lancée (elle ne se joue qu'une fois) */
  endSeen?: boolean;
  /** l'invasion du portail (absent d'une ancienne sauvegarde : déduit de l'historique de la partie) et les Enfers déjà visités */
  invasion?: Invasion;
  visited?: boolean;
}

export class War {
  army: Army = newArmy();
  /** la faction des Enfers (créée à l'ouverture du portail) et sa carte */
  hellMap: HellMap | null = null;
  faction: Hell | null = null;
  /** la base avancée du joueur dans les Enfers (avec la faction) */
  base: HellBase | null = null;
  /** le combat du roi, au royaume (avec la faction) */
  king: KingFight | null = null;
  /** ce qu'a rapporté la chute du royaume, quand elle vient d'arriver (l'écran de victoire le lit, puis le remet à null) */
  reward: KingdomReward | null = null;
  /** la cinématique de la chute du roi a déjà été jouée (sauvegardé ; une partie où le royaume était déjà tombé ne la rejoue pas) */
  endSeen = false;
  isle: IsleBattle | null = null;
  /** où en est l'invasion du portail (voir `Invasion`) */
  inv: Invasion = 'wait';
  /** une ancienne sauvegarde : l'état de l'invasion est à déduire de l'historique à la première mise à jour */
  private legacyInv = false;
  /** le joueur est déjà allé dans les Enfers (ou y a envoyé une troupe) : le guidage vers eux s'efface */
  visited = false;
  /** troupe → unité au combat (sur l'île ou dans les Enfers), et l'inverse */
  unitOf = new Map<number, HellUnit>();
  troopOf = new Map<number, Troop>();
  /** unités en marche vers le portail pour le passer (vers les Enfers, ou vers l'île) */
  crossing = new Set<number>();
  /** nouvelles à afficher */
  news: WarNews[] = [];
  /** ce qui s'est passé au combat, à faire voir par les vues (vidé par elles ; borné quand on ne regarde pas) */
  isleFx: HellEvent[] = [];
  hellFx: HellEvent[] = [];
  /** la vue des Enfers est affichée : la faction y vit à chaque image */
  hellInView = false;
  private acc = 0;
  private pending: WarSave | null = null;

  constructor(private world: World) {}

  /** La guerre a commencé : le portail est ouvert sur une carte qui a son île */
  get active() { return !!this.world.portal && this.world.portalOpen; }

  /** Met en place la faction et l'île (une fois le portail ouvert), et reprend un état sauvegardé */
  ensure() {
    if (!this.active) return false;
    this.ensureFaction();
    if (!this.isle) {
      this.isle = new IsleBattle(this.world);
      const r = this.pending?.raid;
      if (r) {
        this.faction!.activeRaid = r.w;
        this.isle.raid = r.w;
        this.isle.raidT = Number.isFinite(r.t) ? r.t! : 0;
        for (const u of r.units) { const h = this.isle.sim.addRaider(u.kind, demonStats(u.kind, 1, this.faction!.balance.legacy), u.x, u.z); h.hp = Math.min(h.maxHp, u.hp); }
      }
    }
    this.pending = null;
    return true;
  }

  /** La faction des Enfers et sa carte (aussi sans portail ouvert : le mode développeur y entre) */
  ensureFaction() {
    if (!this.faction) {
      this.hellMap = new HellMap(this.world.seed);
      const p = this.pending;
      // (l'équilibre suit la difficulté de la partie : plein en Normal, ×0,6 en Facile, l'ancien en bac à sable)
      const bal = balanceOf(this.world.difficulty);
      this.faction = p?.faction ? Hell.load(this.hellMap, p.faction, bal) : new Hell(this.hellMap, this.hellMap.seed, bal);
      // les unités du joueur viennent de l'armée, pas de la sauvegarde de la faction
      for (const u of this.faction.alive('player')) this.faction.units.delete(u.id);
      this.base = HellBase.load(this.faction, this.hellMap, p?.base);
      this.king = KingFight.load(this.faction, p?.king);
    }
    return this.faction;
  }

  /** Nom d'une troupe à l'âge du village (« tirailleur »), pour les nouvelles */
  private nm(k: TroopKind) { return troopName(k, this.faction?.age ?? 1).toLowerCase(); }

  /** Casernes : celles de l'île et les casernes avancées des Enfers */
  private barracks() { return isleDefenses(this.world).barracks + (this.portalOut ? 0 : this.base?.posts() ?? 0); }

  /** Contexte de recrutement */
  recruitCtx(age: number, pop: number): RecruitCtx {
    const w = this.world;
    let stables = 0, horses = 0;
    for (const [, h] of penHerds(w).stables) { stables++; horses += h.length; }
    // un cheval monté est un cheval que l'écurie n'a plus (comme les expéditions montées : `exp.riding`)
    return { age, pop, stock: w.exp.gear, barracks: this.barracks(), unlimited: w.unlimited, stables, horses, ride: (d) => { w.exp.riding = Math.max(0, w.exp.riding + d); } };
  }

  /** Enrôle une recrue à la caserne (null : c'est fait ; sinon la raison du refus) */
  recruit(kind: TroopKind, age: number, pop: number) { return recruit(this.army, kind, this.recruitCtx(age, pop)); }

  /**
   * Enrôle une recrue à la caserne avancée des Enfers : elle arrive au camp. La forge de la base fabrique contre du minerai les
   * pièces d'équipement qui manquent à la réserve du village
   */
  recruitHell(kind: TroopKind, age: number, pop: number): string | null {
    const b = this.base, w = this.world;
    if (this.portalOut) return tr('Le portail est éteint : la guerre est finie.');
    if (!b || !b.posts()) return tr('Il faut une caserne avancée dans la base.');
    const ctx = this.recruitCtx(age, pop), miss = troopKit(kind, age).gear.filter((g) => (ctx.stock[g] ?? 0) < 1);
    if (miss.length && !w.unlimited && b.countOf('smithy') && w.ore >= miss.length * SMITHY_ORE) {
      // la forge forge ce qui manque, pour cette recrue (on le rend si elle est refusée)
      w.ore -= miss.length * SMITHY_ORE;
      for (const g of miss) ctx.stock[g] = (ctx.stock[g] ?? 0) + 1;
      const why = recruit(this.army, kind, ctx, 'hell');
      if (why) { w.ore += miss.length * SMITHY_ORE; for (const g of miss) ctx.stock[g]--; }
      return why;
    }
    const why = recruit(this.army, kind, ctx, 'hell');
    if (why && miss.length && b.countOf('smithy')) return tr('{why} (ou {n} minerai pour que la forge les fabrique : {items})', { why, n: miss.length * SMITHY_ORE, items: miss.map((g) => gearName(g)).join(', ') });
    return why;
  }

  /** Bâtit dans la base avancée, payé par le village : le bâtiment, ou la raison du refus */
  buildBase(kind: BaseKind, x: number, z: number) {
    const b = this.ensureFaction() && this.base;
    if (!b) return tr('Les Enfers ne sont pas ouverts.');
    return b.build(kind, x, z, this.world);
  }
  /** Pose une ligne de palissades (ou une case) : combien de cases posées, et la première raison de refus */
  buildBaseLine(kind: BaseKind, cells: [number, number][]) {
    const b = this.ensureFaction() && this.base;
    return b ? b.buildLine(kind, cells, this.world) : { built: 0, why: tr('Les Enfers ne sont pas ouverts.') as string | null };
  }
  /** L'aperçu d'une ligne à poser : refus par case, coût */
  planBaseLine(kind: BaseKind, cells: [number, number][]) { return this.base?.planLine(kind, cells, this.world) ?? null; }
  /** Ce que le village peut payer (bois, pierre, minerai ; le bac à sable, tout) */
  get purse(): Purse { return this.world; }
  /** Ce qu'il manque pour bâtir là (null : on peut) */
  canBuildBase(kind: BaseKind, x: number, z: number) { return this.base ? this.base.canBuild(kind, x, z, this.world) : tr('Les Enfers ne sont pas ouverts.'); }

  /** L'unité au combat d'une troupe valide, posée sur l'île ou dans les Enfers */
  private deploy(t: Troop, age: number) {
    const st = troopStats(t.kind, age);
    let u: HellUnit | null = null;
    if (t.where === 'hell' && this.faction && this.hellMap) {
      // au camp de base le plus avancé (sinon devant le portail)
      const m = this.hellMap, [ax, az] = this.base?.spawnPoint() ?? m.arrival, i = this.unitOf.size % 12;
      let x = t.x ?? ax + ((i % 3) - 1) * 0.6, z = t.z ?? az + Math.floor(i / 3) * 0.5;
      // jamais dans une emprise (un bâtiment de la base, une forteresse relevée)
      if (!m.walkableAt(x, z)) { const c = m.nearestWalkable(x, z, 4); if (c >= 0) { x = (c % m.W) + 0.5; z = Math.floor(c / m.W) + 0.5; } }
      u = this.faction.addPlayerUnit(t.kind, st, x, z);
    } else if (this.isle) {
      const [rx, rz] = this.isle.rallyPoint(), n = this.isle.sim.alive('player').length;
      const [x, z] = t.x !== undefined && t.z !== undefined && this.isle.map.walkableAt(t.x, t.z) ? [t.x, t.z] : this.isle.map.freeNear(rx + ((n % 4) - 1.5) * 0.6, rz + Math.floor(n / 4) * 0.6);
      u = this.isle.sim.addPlayerUnit(t.kind, st, x, z);
      t.where = 'isle';
    }
    if (!u) return;
    u.maxHp = st.hp;
    u.hp = Math.max(1, Math.min(st.hp, t.hp > 0 ? t.hp : st.hp));
    this.unitOf.set(t.id, u);
    this.troopOf.set(u.id, t);
  }

  /** Retire du combat l'unité d'une troupe */
  private undeploy(t: Troop) {
    const u = this.unitOf.get(t.id);
    if (!u) return;
    this.isle?.sim.units.delete(u.id);
    this.faction?.units.delete(u.id);
    this.unitOf.delete(t.id);
    this.troopOf.delete(u.id);
    this.crossing.delete(u.id);
  }

  /** La simulation où se bat une troupe */
  simOf(u: HellUnit): Hell | null {
    if (this.isle?.sim.units.get(u.id) === u) return this.isle.sim;
    if (this.faction?.units.get(u.id) === u) return this.faction;
    return null;
  }

  /** Le portail est éteint (le royaume est tombé) : on ne passe plus dans les Enfers */
  get portalOut() { return !!this.faction?.victory; }

  /** Des troupes (valides ou blessées) sont dans les Enfers, ou la base avancée y a des bâtiments : on peut aller les voir */
  hellPresence() { return !this.portalOut && (this.army.troops.some((t) => t.where === 'hell') || this.army.queue.some((r) => r.at === 'hell') || !!this.base?.buildings().length); }

  /** Les renforts : les troupes valides de l'île passent le portail vers les Enfers ; renvoie leur nombre */
  callGarrison() {
    if (!this.isle || this.portalOut) return 0;
    const us = this.troopsIn(this.isle.sim).filter((u) => !this.crossing.has(u.id));
    this.sendThroughPortal(us);
    return us.length;
  }

  /** Envoie des unités passer le portail (de l'île vers les Enfers, ou l'inverse) */
  sendThroughPortal(units: HellUnit[]) {
    for (const u of units) {
      const t = this.troopOf.get(u.id), sim = this.simOf(u);
      if (!t || !sim) continue;
      // (le portail éteint : plus personne ne part pour les Enfers)
      if (t.where === 'isle' && (this.portalOut || this.hellWhy())) continue;
      const goal = t.where === 'isle' ? this.isle!.map.portal : this.hellMap!.arrival;
      // devant l'arche (le portail lui-même est une emprise)
      const [gx, gz] = t.where === 'isle' ? this.isle!.map.freeNear(goal[0], goal[1] + 1.5, 3) : goal;
      sim.order([u.id], { kind: 'move', x: gx, z: gz });
      this.crossing.add(u.id);
    }
  }

  /** Le portail éteint : toutes les troupes des Enfers (blessées comprises, et les recrues en route) rentrent sur l'île */
  private bringHome(age: number) {
    let n = 0;
    for (const t of this.army.troops) {
      if (t.where !== 'hell') continue;
      const u = this.unitOf.get(t.id);
      if (u) t.hp = Math.max(1, Math.round(u.hp));
      this.undeploy(t);
      t.where = 'isle'; t.x = undefined; t.z = undefined;
      if (t.heal <= 0) this.deploy(t, age);
      n++;
    }
    for (const r of this.army.queue) if (r.at === 'hell') { delete r.at; n++; }
    if (n) this.news.push({ kind: 'info', text: tr('🌀 Avant que le portail ne s’éteigne, les troupes des Enfers sont rentrées sur l’île.') });
  }

  /** Une troupe passe le portail */
  private cross(t: Troop, age: number) {
    const u = this.unitOf.get(t.id);
    const hp = u ? u.hp : t.hp;
    // la lueur du passage, devant l'arche d'où l'on part puis là où l'on arrive
    const from = u ? this.simOf(u) : null;
    if (u && from) from.events.push({ type: 'portal', x: u.x, z: u.z });
    this.undeploy(t);
    t.where = t.where === 'isle' ? 'hell' : 'isle';
    if (t.where === 'hell') this.visited = true;
    t.hp = hp; t.x = undefined; t.z = undefined;
    this.deploy(t, age);
    const nu = this.unitOf.get(t.id), to = nu ? this.simOf(nu) : null;
    if (nu && to) to.events.push({ type: 'portal', x: nu.x, z: nu.z });
    this.news.push(t.where === 'hell' ? { kind: 'portal', text: tr('🌀 Un {troop} a passé le portail : il attend vos ordres dans les Enfers.', { troop: this.nm(t.kind) }) } : { kind: 'info', text: tr('🌀 Un {troop} est rentré des Enfers sur l’île.', { troop: this.nm(t.kind) }) });
  }

  /**
   * Un pas de guerre (`dt` : secondes de jeu, 0 en pause). Renvoie la vague qui vient d'arriver, s'il y en a une
   */
  update(dt: number, age: number, healK = 1): RaidWave | null {
    if (!this.ensure()) {
      // (mode développeur : les Enfers visités sans portail ouvert)
      if (this.faction && this.hellInView) { this.faction.age = age; this.stepHell(Math.min(dt, COARSE)); this.collect(this.faction, this.hellFx); this.baseNews(); }
      return null;
    }
    const f = this.faction!, isle = this.isle!, w = this.world;
    f.age = age;
    f.armyPower = this.power(age);
    if (this.legacyInv) this.readLegacyInvasion(age);
    // une vague déjà repoussée (ou le royaume tombé) : l'invasion est faite, quoi qu'en dise l'état
    if (this.inv !== 'done' && (f.raidsRepelled > 0 || f.victory)) this.inv = 'done';
    if (this.hellInView) this.visited = true;
    isle.syncDefenses(age);
    isle.blight = this.refreshBlight();
    // l'armée : recrues qui arrivent, blessés qui guérissent
    const d = isleDefenses(w);
    const { joined, healed } = stepArmy(this.army, dt, this.barracks(), age, healK);
    for (const t of joined) this.news.push(t.where === 'hell' ? { kind: 'portal', text: tr('⚔️ Un {troop} a rejoint la base avancée des Enfers.', { troop: this.nm(t.kind) }) } : { kind: 'troop', text: tr('⚔️ Un {troop} a débarqué sur l’île du portail : il rejoint la garnison.', { troop: this.nm(t.kind) }) });
    for (const t of healed) if (t.where === 'hell') this.news.push({ kind: 'info', text: tr('🩹 Un {troop} sort de l’infirmerie avancée, prêt à se battre.', { troop: this.nm(t.kind) }) });
    // le royaume tombé, le portail s'éteint : les troupes des Enfers rentrent sur l'île (une fois la vue revenue à la surface)
    if (f.victory && !this.hellInView) this.bringHome(age);
    // les troupes valides sans unité prennent place ; celles qui n'existent plus quittent le combat
    for (const t of ready(this.army)) if (!this.unitOf.has(t.id)) this.deploy(t, age);
    for (const [id, u] of [...this.unitOf]) {
      const t = this.troopOf.get(u.id);
      if (!t || !this.army.troops.includes(t) || t.heal > 0) { this.unitOf.delete(id); this.troopOf.delete(u.id); isle.sim.units.delete(u.id); f.units.delete(u.id); }
    }
    // la faction : à chaque image quand on la regarde (en plusieurs pas si l'image est longue : à ×4 sur une machine lente, le
    // temps des Enfers prenait du retard), à pas allégés sinon
    if (this.hellInView) for (let left = Math.min(dt, 4 * COARSE); left > 1e-6; left -= COARSE) this.stepHell(Math.min(left, COARSE));
    else {
      this.acc += dt;
      for (let i = 0; i < 4 && this.acc >= COARSE; i++) { this.acc -= COARSE; this.stepHell(COARSE); }
      if (this.acc > COARSE) this.acc = 0;
    }
    this.baseNews();
    // l'île : le combat (les blessures légères se referment hors incursion)
    for (let left = Math.min(dt, 4 * COARSE); left > 1e-6; left -= COARSE) isle.step(Math.min(left, COARSE), REGEN);
    this.collect(f, this.hellFx);
    this.collect(isle.sim, this.isleFx);
    // le passage du portail : arrivées devant l'arche
    for (const id of [...this.crossing]) {
      const t = this.troopOf.get(id), u = t ? this.unitOf.get(t.id) : undefined;
      if (!t || !u || u.hp <= 0) { this.crossing.delete(id); continue; }
      if (u.order) continue;
      this.crossing.delete(id);
      const goal = t.where === 'isle' ? isle.map.portal : this.hellMap!.arrival;
      if (Math.hypot(u.x - goal[0], u.z - goal[1]) < 3.2) this.cross(t, age);
    }
    // les incursions : une fois la première tour de garde dressée, à l'heure dite
    let arrived: RaidWave | null = null;
    // l'invasion d'abord : tant qu'elle n'est pas annoncée, aucune vague ne vient ; elle l'est quand tout est prêt
    this.stepInvasion(d, f);
    const waiting = this.inv === 'wait';
    // (annoncée un moment d'avance : la vague est composée à l'annonce, le joueur sait ce qui vient)
    const left = this.nextWaveIn();
    if (!waiting && d.towers > 0 && left !== null && left <= WARN_TIME && !f.planned) {
      f.planned = f.planRaid();
      this.news.push({ kind: 'raid', text: tr('⚠️ Les démons se rassemblent devant le portail : une vague de {n} démons{big} arrive dans quelques instants. Prépare ta garnison !', { n: f.planned.length, big: bigOf(f.planned) }) });
    }
    if (!waiting && d.towers > 0 && f.raidDue(f.time)) {
      arrived = f.spawnRaid(f.time);
      isle.startRaid(arrived);
      const big = bigOf(arrived.units.map((u) => u.kind));
      if (this.inv === 'coming') {
        this.inv = 'raid';
        this.news.push({ kind: 'invasionStart', text: tr('🔥 L’invasion commence ! {n} démons{big} sortent du portail : défendez l’île !', { n: arrived.units.length, big }) });
      } else this.news.push({ kind: 'raid', text: tr('🔥 Incursion ! {n} démons{big} sortent du portail et attaquent l’île.', { n: arrived.units.length, big }) });
    }
    const out = isle.outcome();
    if (out) {
      const sec = f.endRaid(out === 'repelled', f.time);
      isle.endRaid();
      const inv = this.inv === 'raid';
      // (l'invasion perdue : on se prépare et elle sera ré-annoncée ; repoussée : les Enfers s'ouvrent)
      if (inv) this.inv = out === 'repelled' ? 'done' : 'wait';
      if (out === 'repelled' && inv) {
        repelWave(w);
        this.news.push({ kind: 'invasionDone', text: tr('🛡️ Invasion repoussée ! Le portail est affaibli.') });
      } else if (out === 'repelled') {
        repelWave(w);
        this.news.push({ kind: 'repelled', text: tr('🛡️ Vague repoussée ! L’île tient bon ({n}).', { n: `${w.isleGuard.waves} ${plural(w.isleGuard.waves, 'vague', 'vagues')} ${plural(w.isleGuard.waves, 'repoussée', 'repoussées')}` }) });
      } else this.news.push({ kind: 'lost', text: tr('💥 Les démons ont submergé les défenses de l’île, puis sont repartis par le portail. La tour et la caserne se relèvent : on se prépare pour la prochaine vague.') });
      if (sec) this.news.push({ kind: 'secured', text: tr('🏰 L’île du portail est sécurisée !') });
    }
    // les relevés de la garnison (vie, position) pour la sauvegarde
    for (const [id, u] of this.unitOf) { const t = this.army.troops.find((x) => x.id === id); if (t) { t.hp = Math.round(u.hp); t.x = +u.x.toFixed(2); t.z = +u.z.toFixed(2); } }
    return arrived;
  }

  /**
   * La puissance du joueur dans la guerre : son armée (blessés pour moitié, recrues en route pour moitié) et les tours de
   * l'île, mesurée comme celle des démons (voir `hellBalance.ts`) ; elle règle la taille des incursions
   */
  power(age: number) {
    let p = 0;
    for (const t of this.army.troops) p += powerOf(troopStats(t.kind, age)) * (t.heal > 0 ? 0.5 : 1);
    for (const r of this.army.queue) p += powerOf(troopStats(r.kind, age)) * 0.5;
    const tw = SITES.watchtower;
    return p + isleDefenses(this.world).towers * powerOf({ hp: tw.hp, dmg: tw.dmg, cooldown: tw.cooldown }) * defenseK(age);
  }

  /** Zones des Enfers conquises (elles font reculer la contamination de l'île) */
  conqueredZones() { return this.faction ? this.faction.conquered.filter(Boolean).length : 0; }

  /** La contamination de l'île, refaite seulement quand ce dont elle dépend change (bâtiments, vagues, zones conquises) */
  refreshBlight() {
    const w = this.world, k = `${w.version}|${w.portalOpen}|${w.isleGuard.waves}|${this.conqueredZones()}`;
    if (k !== this.blightKey) { this.blightKey = k; this.blight = isleBlight(w, this.conqueredZones()); }
    return this.blight;
  }
  /** la contamination de l'île du portail (jauge, bonus des démons, soins) */
  blight: Blight | null = null;
  private blightKey = '';

  /** Un pas de la faction des Enfers, et de la base avancée */
  private stepHell(dt: number) {
    this.faction!.step(dt);
    this.base?.step(dt);
    this.king?.step(dt);
  }

  /**
   * La citadelle est tombée : le royaume s'effondre, le village touche ses récompenses (une fois), plus aucune incursion ne
   * viendra sur l'île du portail (elle compte pour sécurisée)
   */
  private conquerKingdom() {
    const f = this.faction!;
    this.king?.collapse();
    f.raidsRepelled = Math.max(f.raidsRepelled, SECURE_WAVES);
    const r = claimKingdom(this.world, ISLE_SECURE.waves);
    if (r) this.reward = r;
    this.news.push({ kind: 'victory', text: tr('👑 Le royaume des Enfers est tombé ! Le portail s’éteint : plus aucune incursion ne menacera l’île.') });
  }

  /** Les nouvelles de la base avancée : contre-attaques, zones */
  private baseNews() {
    const b = this.base;
    if (!b) return;
    for (const e of b.events.splice(0)) {
      if (e.type === 'counterWarn') this.news.push({ kind: 'counter', text: tr('⚠️ Les démons se rassemblent : ils vont marcher sur ta base {zone}. Prépare tes troupes !', { zone: zoneOf(e.zone) }) });
      else if (e.type === 'counter') this.news.push({ kind: 'counter', text: tr('🔥 Les démons marchent sur ta base {zone} ! {n} démons approchent : tes troupes sur place comptent pour la défense.', { zone: zoneOf(e.zone), n: e.n }) });
      else if (e.type === 'frontCleared') this.news.push({ kind: 'zone', text: tr('🌋 Les démons ont repris tous tes postes avancés : le front est revenu au portail. Les incursions sur l’île reprendront bientôt.') });
      else if (e.type === 'counterEnd') this.news.push({ kind: 'repelled', text: tr('🛡️ Contre-attaque repoussée : la base {zone} tient bon.', { zone: zoneOf(e.zone) }) });
      else if (e.type === 'zoneLost') this.news.push({ kind: 'zone', text: tr('💥 Les démons ont repris la zone {zone} : sa forteresse se relève, le front recule. Tu peux la reprendre quand tu voudras.', { zone: zoneOf(e.zone) }) });
      else if (e.type === 'reclaimWarn') this.news.push({ kind: 'zone', text: tr('⚠️ Les démons se rassemblent pour reprendre la zone {zone}, que personne ne garde ! Posez-y un camp de base ou envoyez des troupes.', { zone: zoneOf(e.zone) }) });
      else if (e.type === 'campLost') this.news.push({ kind: 'zone', text: tr('💥 Le camp de base {zone} est tombé. Rebâtissez-le pour rouvrir la base.', { zone: zoneOf(e.zone) }) });
      // (une construction : l'interface le dit elle-même)
    }
  }

  /** Les événements de combat : les soldats abattus sont ramenés blessés à la caserne ; le reste va aux vues */
  private collect(sim: Hell, fx: HellEvent[]) {
    for (const e of sim.events.splice(0)) {
      if (e.type === 'death' && e.side === 'player') {
        const t = this.troopOf.get(e.id);
        if (t) {
          this.unitOf.delete(t.id); this.troopOf.delete(e.id); this.crossing.delete(e.id);
          // dans les Enfers, l'infirmerie de la base le soigne sur place (deux fois plus vite)
          if (sim === this.faction && this.base?.countOf('infirmary')) {
            wound(this.army, t.id, HEAL_TIME / 2, 'hell');
            this.news.push({ kind: 'info', text: tr('🩹 Un {troop} est tombé : on le porte à l’infirmerie de la base, il s’y soigne.', { troop: this.nm(t.kind) }) });
          } else {
            wound(this.army, t.id);
            this.news.push({ kind: 'info', text: tr('🩹 Un {troop} est tombé : on le ramène blessé à la caserne, il s’y soigne.', { troop: this.nm(t.kind) }) });
          }
        }
      }
      // la progression dans les Enfers
      if (sim === this.faction) {
        if (e.type === 'conquered' && e.zone + 1 < HELL_ZONES.length) this.news.push({ kind: 'zone', text: tr('🏴 La zone {zone} est conquise ! La brume se lève sur {next} ; vous pouvez bâtir une base avancée ici.', { zone: zoneOf(e.zone), next: zoneThe(e.zone + 1) }) });
        else if (e.type === 'sealed') this.news.push({ kind: 'info', text: e.byAge ? tr('🌫️ Les démons {zone} sont trop forts : montez à {age} pour y aller.', { zone: zoneOf(e.zone), age: zoneAgeText(e.zone) }) : tr('🌫️ La brume infernale barre {zone} : abattez d’abord la forteresse {prev}.', { zone: zoneThe(e.zone), prev: zoneOf(e.zone - 1) }) });
        // le combat du roi
        else if (e.type === 'boss') this.news.push({ kind: 'boss', text: e.phase === 1 ? tr('👑 Le roi des Enfers se lève de son trône ! Gare à ses boules de feu : écartez-vous des cercles rouges.') : e.phase === 2 ? tr('😡 Le roi des Enfers enrage : le sol s’embrase par plaques, sortez des zones qui rougeoient !') : tr('👑 Le roi des Enfers est abattu ! Sa citadelle vacille : abattez-la.') });
        else if (e.type === 'victory') this.conquerKingdom();
      }
      fx.push(e);
    }
    if (fx.length > 400) fx.splice(0, fx.length - 400);
  }

  /** Nouvel âge : la garnison gagne en vie et en force (au combat aussi) */
  ageUp(age: number) {
    ageUpArmy(this.army, age);
    for (const u of this.unitOf.values()) {
      const t = this.troopOf.get(u.id);
      if (!t) continue;
      u.stats = { ...troopStats(t.kind, age) };
      u.maxHp = t.maxHp; u.hp = Math.min(u.maxHp, Math.max(1, t.hp));
    }
  }

  /** Appelle la prochaine vague tout de suite (sonner le cor) ; sans effet tant que l'invasion n'est pas annoncée */
  callWave() { if (this.faction && this.inv !== 'wait' && !this.faction.activeRaid && this.faction.nextRaid >= 0 && this.faction.frontPosts <= 0) this.faction.nextRaid = this.faction.time; }
  /** Secondes de jeu avant la prochaine vague (null : pas encore d'incursion prévue, ou une en cours) */
  nextWaveIn() { const f = this.faction; return !f || f.victory || f.activeRaid || this.inv === 'wait' || f.nextRaid < 0 || f.frontPosts > 0 ? null : Math.max(0, f.nextRaid - f.time); }
  /** Soldats valides de la garnison de l'île */
  garrison() { return this.army.troops.filter((t) => t.where === 'isle' && t.heal <= 0).length; }
  /** Le bouton « Appeler la prochaine vague » : null si on peut, sinon la raison (une phrase) */
  callWhy(): string | null {
    if (this.faction?.activeRaid) return tr('Une vague est déjà en cours.');
    if (this.nextWaveIn() === null) return tr('Aucune vague n’est prévue pour le moment.');
    if (!this.garrison()) return tr('Il faut des soldats sur l’île pour appeler une vague.');
    return null;
  }
  /** La force de la prochaine vague (celle qui est annoncée, sinon celle qu'on prévoit) ; null : aucune prévue */
  nextForce(): WaveForce | null {
    const f = this.faction;
    if (!f || this.nextWaveIn() === null) return null;
    return waveForce(f.planned ?? (this.inv === 'coming' ? f.planInvasion() : f.planRaid()));
  }

  // ---------- L'invasion ----------

  /** Les Enfers sont fermés tant que l'invasion n'est pas repoussée : la raison en une phrase (null : ouverts) */
  hellWhy(): string | null {
    return this.active && this.inv !== 'done' && !this.portalOut ? tr('Repoussez d’abord l’invasion du portail.') : null;
  }

  /** Après la victoire : l'étape du guidage vers les Enfers (choisir les troupes, puis les envoyer) ; null : rien à guider */
  guideStep(selected: number): 'select' | 'send' | null {
    if (!this.active || this.inv !== 'done' || this.visited || this.portalOut || !this.garrison()) return null;
    return selected > 0 ? 'send' : 'select';
  }

  /** Une partie en cours : l'invasion compte pour faite (tests, mode développeur) */
  skipInvasion() { this.inv = 'done'; this.legacyInv = false; }

  /** Ce que la garnison doit compter pour que l'invasion soit annoncée */
  invasionNeed() { return invasionTroops(this.world.difficulty); }

  /** Annonce l'invasion quand tout est prêt (tour, caserne, garnison) ; la rappelle si l'on défait ses défenses en l'attendant */
  private stepInvasion(d: { towers: number; barracks: number }, f: Hell) {
    const ready = d.towers >= 1 && d.barracks >= 1;
    if (this.inv === 'wait' && ready && this.garrison() >= this.invasionNeed()) {
      this.inv = 'coming';
      f.nextRaid = f.time + INVASION_DELAY;
      f.planned = f.planInvasion();
      this.news.push({ kind: 'invasion', text: tr('⚠️ Les démons vont attaquer : préparez la garnison ! La grosse vague arrive dans {t}.', { t: `${INVASION_DELAY} s` }) });
    } else if (this.inv === 'coming' && !ready) {
      // (la tour ou la caserne a disparu : le compte à rebours s'arrête, il repart quand elles sont rebâties)
      this.inv = 'wait';
      f.planned = null; f.nextRaid = -1;
    } else if (this.inv === 'coming' && !f.planned) f.planned = f.planInvasion();
  }

  /** Une ancienne sauvegarde (sans l'état de l'invasion) : faite si la partie a déjà vu une vague repoussée ou les Enfers ; ne bloque jamais */
  private readLegacyInvasion(age: number) {
    this.legacyInv = false;
    const f = this.faction!, w = this.world;
    const seen = f.raidsRepelled > 0 || f.raidsLost > 0 || f.victory || f.conquered.some(Boolean) || w.isleGuard.waves > 0 || age >= 2
      || this.visited || this.army.troops.some((t) => t.where === 'hell') || this.army.queue.some((r) => r.at === 'hell') || !!this.base?.buildings().length;
    this.inv = seen ? 'done' : f.activeRaid ? 'raid' : 'wait';
    if (this.inv === 'done') this.visited = true;
  }

  /** Relevé des unités (pour la barre des troupes) : unités du joueur d'une simulation, avec leur troupe */
  troopsIn(sim: Hell | null) { return sim ? sim.alive('player').filter((u) => this.troopOf.has(u.id)) : []; }

  save(): WarSave {
    const f = this.faction, isle = this.isle;
    return {
      army: JSON.parse(JSON.stringify(this.army)),
      faction: f ? f.save(false) : this.pending?.faction ?? null,
      base: this.base ? this.base.save() : this.pending?.base ?? null,
      king: this.king ? this.king.save() : this.pending?.king ?? null,
      reward: this.reward,
      endSeen: this.endSeen || undefined,
      invasion: this.legacyInv ? undefined : this.inv,
      visited: this.visited || undefined,
      raid: isle?.raid ? { w: isle.raid, units: isle.raiders().map((u) => ({ kind: u.kind as DemonKind, x: +u.x.toFixed(2), z: +u.z.toFixed(2), hp: Math.round(u.hp) })), t: Math.round(isle.raidT) } : null,
    };
  }

  load(d: unknown) {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    this.army = readArmy(o.army);
    const fac = o.faction && typeof o.faction === 'object' ? (o.faction as HellSave) : null;
    const r = o.raid && typeof o.raid === 'object' ? (o.raid as WarSave['raid']) : null;
    const raid = r && r.w && Array.isArray(r.units) ? { w: r.w, units: r.units.filter((u) => u && u.kind in DEMONS), t: r.t } : null;
    const base = o.base && typeof o.base === 'object' ? (o.base as HellBaseSave) : null;
    const king = o.king && typeof o.king === 'object' ? (o.king as KingSave) : null;
    this.pending = { army: this.army, faction: fac && Array.isArray(fac.units) && Array.isArray(fac.buildings) ? fac : null, raid, base, king };
    this.faction = null; this.hellMap = null; this.isle = null; this.base = null; this.king = null;
    this.endSeen = o.endSeen === true;
    // (sans l'état de l'invasion : une ancienne partie, qu'on ne bloque jamais ; voir `readLegacyInvasion`)
    const iv = INVASIONS.find((x) => x === o.invasion);
    this.inv = iv ?? 'wait'; this.legacyInv = !iv; this.visited = o.visited === true;
    const rw = o.reward as KingdomReward | null | undefined;
    this.reward = rw && typeof rw === 'object' && Number.isFinite(rw.ore) && Number.isFinite(rw.joy) && Array.isArray(rw.gear) ? { ore: rw.ore, joy: rw.joy, gear: rw.gear.filter((g) => Array.isArray(g) && typeof g[0] === 'string' && Number.isFinite(g[1])) } : null;
    this.unitOf.clear(); this.troopOf.clear(); this.crossing.clear();
  }
}

export { isTroopKind };
