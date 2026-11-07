import type { World } from '../world/world';
import { HellMap } from '../world/hell';
import { isleDefenses, repelWave } from '../world/portal';
import { Hell, HellEvent, HellSave, HellUnit, RaidWave, DEMONS, DemonKind, demonStats } from './hell';
import { IsleBattle } from './isleBattle';
import { Army, Troop, TroopKind, TROOPS, newArmy, readArmy, stepArmy, troopStats, wound, ready, REGEN, RecruitCtx, recruit, isTroopKind, ageUp as ageUpArmy } from './army';

/**
 * La guerre contre les Enfers, côté simulation : la faction démoniaque (elle vit même quand on ne la regarde pas, à pas
 * allégés), ses incursions sur l'île du portail (la tour de garde tire, la garnison se bat, la vague est repoussée ou l'île
 * submergée), l'armée du joueur (recrues, blessés) et ses unités, sur l'île ou en expédition dans les Enfers. Jamais rien
 * sur l'île principale. Le jeu lit ses nouvelles (`news`) et ses alertes
 */

/** Pas de la simulation allégée (faction hors de vue) */
export const COARSE = 0.25;

export interface WarNews { text: string; kind: 'raid' | 'repelled' | 'lost' | 'secured' | 'troop' | 'portal' | 'info' }

export interface WarSave {
  army: Army;
  faction: HellSave | null;
  /** la vague en cours : sa description, ses démons encore debout (positions sur l'île) */
  raid?: { w: RaidWave; units: { kind: DemonKind; x: number; z: number; hp: number }[] } | null;
}

export class War {
  army: Army = newArmy();
  /** la faction des Enfers (créée à l'ouverture du portail) et sa carte */
  hellMap: HellMap | null = null;
  faction: Hell | null = null;
  isle: IsleBattle | null = null;
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
        for (const u of r.units) { const h = this.isle.sim.addRaider(u.kind, demonStats(u.kind, 1), u.x, u.z); h.hp = Math.min(h.maxHp, u.hp); }
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
      this.faction = p?.faction ? Hell.load(this.hellMap, p.faction) : new Hell(this.hellMap);
      // les unités du joueur viennent de l'armée, pas de la sauvegarde de la faction
      for (const u of this.faction.alive('player')) this.faction.units.delete(u.id);
    }
    return this.faction;
  }

  /** Contexte de recrutement */
  recruitCtx(age: number, pop: number): RecruitCtx {
    return { age, pop, stock: this.world.exp.gear, barracks: isleDefenses(this.world).barracks, unlimited: this.world.unlimited };
  }

  /** Enrôle une recrue à la caserne (null : c'est fait ; sinon la raison du refus) */
  recruit(kind: TroopKind, age: number, pop: number) { return recruit(this.army, kind, this.recruitCtx(age, pop)); }

  /** L'unité au combat d'une troupe valide, posée sur l'île ou dans les Enfers */
  private deploy(t: Troop, age: number) {
    const st = troopStats(t.kind, age);
    let u: HellUnit | null = null;
    if (t.where === 'hell' && this.faction && this.hellMap) {
      const [ax, az] = this.hellMap.arrival, i = this.unitOf.size;
      u = this.faction.addPlayerUnit(t.kind, st, t.x ?? ax + ((i % 3) - 1) * 0.6, t.z ?? az + Math.floor(i / 3) * 0.5);
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

  /** Envoie des unités passer le portail (de l'île vers les Enfers, ou l'inverse) */
  sendThroughPortal(units: HellUnit[]) {
    for (const u of units) {
      const t = this.troopOf.get(u.id), sim = this.simOf(u);
      if (!t || !sim) continue;
      const goal = t.where === 'isle' ? this.isle!.map.portal : this.hellMap!.arrival;
      // devant l'arche (le portail lui-même est une emprise)
      const [gx, gz] = t.where === 'isle' ? this.isle!.map.freeNear(goal[0], goal[1] + 1.5, 3) : goal;
      sim.order([u.id], { kind: 'move', x: gx, z: gz });
      this.crossing.add(u.id);
    }
  }

  /** Une troupe passe le portail */
  private cross(t: Troop, age: number) {
    const u = this.unitOf.get(t.id);
    const hp = u ? u.hp : t.hp;
    this.undeploy(t);
    t.where = t.where === 'isle' ? 'hell' : 'isle';
    t.hp = hp; t.x = undefined; t.z = undefined;
    this.deploy(t, age);
    this.news.push(t.where === 'hell' ? { kind: 'portal', text: `🌀 Un ${TROOPS[t.kind].name.toLowerCase()} a passé le portail : il attend vos ordres dans les Enfers.` } : { kind: 'info', text: `🌀 Un ${TROOPS[t.kind].name.toLowerCase()} est rentré des Enfers sur l’île.` });
  }

  /**
   * Un pas de guerre (`dt` : secondes de jeu, 0 en pause). Renvoie la vague qui vient d'arriver, s'il y en a une
   */
  update(dt: number, age: number, healK = 1): RaidWave | null {
    if (!this.ensure()) {
      // (mode développeur : les Enfers visités sans portail ouvert)
      if (this.faction && this.hellInView) { this.faction.step(Math.min(dt, COARSE)); this.collect(this.faction, this.hellFx); }
      return null;
    }
    const f = this.faction!, isle = this.isle!, w = this.world;
    isle.syncDefenses(age);
    // l'armée : recrues qui arrivent, blessés qui guérissent
    const d = isleDefenses(w);
    const { joined, healed } = stepArmy(this.army, dt, d.barracks, age, healK);
    for (const t of joined) this.news.push({ kind: 'troop', text: `⚔️ Un ${TROOPS[t.kind].name.toLowerCase()} a débarqué sur l’île du portail : il rejoint la garnison.` });
    void healed;
    // les troupes valides sans unité prennent place ; celles qui n'existent plus quittent le combat
    for (const t of ready(this.army)) if (!this.unitOf.has(t.id)) this.deploy(t, age);
    for (const [id, u] of [...this.unitOf]) {
      const t = this.troopOf.get(u.id);
      if (!t || !this.army.troops.includes(t) || t.heal > 0) { this.unitOf.delete(id); this.troopOf.delete(u.id); isle.sim.units.delete(u.id); f.units.delete(u.id); }
    }
    // la faction : à chaque image quand on la regarde, à pas allégés sinon
    if (this.hellInView) f.step(Math.min(dt, COARSE));
    else {
      this.acc += dt;
      for (let i = 0; i < 4 && this.acc >= COARSE; i++) { this.acc -= COARSE; f.step(COARSE); }
      if (this.acc > COARSE) this.acc = 0;
    }
    // l'île : le combat (les blessures légères se referment hors incursion)
    isle.step(Math.min(dt, COARSE), REGEN);
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
    if (d.towers > 0 && f.raidDue(f.time)) {
      arrived = f.spawnRaid(f.time);
      isle.startRaid(arrived);
      this.news.push({ kind: 'raid', text: `🔥 Incursion ! ${arrived.units.length} démons sortent du portail et attaquent l’île.` });
    }
    const out = isle.outcome();
    if (out) {
      const sec = f.endRaid(out === 'repelled', f.time);
      isle.endRaid();
      if (out === 'repelled') {
        repelWave(w);
        this.news.push({ kind: 'repelled', text: `🛡️ Vague repoussée ! L’île tient bon (${w.isleGuard.waves} vague${w.isleGuard.waves > 1 ? 's' : ''} repoussée${w.isleGuard.waves > 1 ? 's' : ''}).` });
      } else this.news.push({ kind: 'lost', text: '💥 Les démons ont submergé les défenses de l’île, puis sont repartis par le portail. La tour et la caserne se relèvent : on se prépare pour la prochaine vague.' });
      if (sec) this.news.push({ kind: 'secured', text: '🏰 L’île du portail est sécurisée !' });
    }
    // les relevés de la garnison (vie, position) pour la sauvegarde
    for (const [id, u] of this.unitOf) { const t = this.army.troops.find((x) => x.id === id); if (t) { t.hp = Math.round(u.hp); t.x = +u.x.toFixed(2); t.z = +u.z.toFixed(2); } }
    return arrived;
  }

  /** Les événements de combat : les soldats abattus sont ramenés blessés à la caserne ; le reste va aux vues */
  private collect(sim: Hell, fx: HellEvent[]) {
    for (const e of sim.events.splice(0)) {
      if (e.type === 'death' && e.side === 'player') {
        const t = this.troopOf.get(e.id);
        if (t) {
          this.unitOf.delete(t.id); this.troopOf.delete(e.id); this.crossing.delete(e.id);
          wound(this.army, t.id);
          this.news.push({ kind: 'info', text: `🩹 Un ${TROOPS[t.kind].name.toLowerCase()} est tombé : on le ramène blessé à la caserne, il s’y soigne.` });
        }
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

  /** Appelle la prochaine vague tout de suite (sonner le cor) */
  callWave() { if (this.faction && !this.faction.activeRaid && this.faction.nextRaid >= 0) this.faction.nextRaid = this.faction.time; }
  /** Secondes de jeu avant la prochaine vague (null : pas encore d'incursion prévue, ou une en cours) */
  nextWaveIn() { const f = this.faction; return !f || f.activeRaid || f.nextRaid < 0 ? null : Math.max(0, f.nextRaid - f.time); }

  /** Relevé des unités (pour la barre des troupes) : unités du joueur d'une simulation, avec leur troupe */
  troopsIn(sim: Hell | null) { return sim ? sim.alive('player').filter((u) => this.troopOf.has(u.id)) : []; }

  save(): WarSave {
    const f = this.faction, isle = this.isle;
    return {
      army: JSON.parse(JSON.stringify(this.army)),
      faction: f ? f.save(false) : this.pending?.faction ?? null,
      raid: isle?.raid ? { w: isle.raid, units: isle.raiders().map((u) => ({ kind: u.kind as DemonKind, x: +u.x.toFixed(2), z: +u.z.toFixed(2), hp: Math.round(u.hp) })) } : null,
    };
  }

  load(d: unknown) {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    this.army = readArmy(o.army);
    const fac = o.faction && typeof o.faction === 'object' ? (o.faction as HellSave) : null;
    const r = o.raid && typeof o.raid === 'object' ? (o.raid as WarSave['raid']) : null;
    const raid = r && r.w && Array.isArray(r.units) ? { w: r.w, units: r.units.filter((u) => u && u.kind in DEMONS) } : null;
    this.pending = { army: this.army, faction: fac && Array.isArray(fac.units) && Array.isArray(fac.buildings) ? fac : null, raid };
    this.faction = null; this.hellMap = null; this.isle = null;
    this.unitOf.clear(); this.troopOf.clear(); this.crossing.clear();
  }
}

export { isTroopKind };
