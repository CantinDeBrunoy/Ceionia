import { Z_KINGDOM } from '../world/hell';
import { mulberry32 } from '../core/rng';
import type { Hell, HellUnit, HellBuilding } from './hell';
import type { GearId } from './gear';
import type { NeedKey } from './missions';
import { SECURE_WAVES } from './hell';

/**
 * Le royaume des Enfers : le combat du roi, au pied de sa citadelle, et ce que rapporte sa chute. Le roi dort sur son trône
 * tant qu'on ne l'approche pas ; réveillé (phase 1), il invoque des diablotins et lance des boules de feu qui s'écrasent en
 * zone (un cercle rouge au sol prévient, on peut l'éviter) ; à mi-vie il enrage (phase 2) : plus fort, plus vif, il crie (la
 * vue tremble un peu) et le sol s'embrase par plaques autour des soldats (elles rougeoient avant de brûler : on s'en écarte).
 * Abattu (phase 3), la citadelle vacille (son armure tombe). Tout est facultatif : rien de tout cela n'est requis pour passer
 * d'âge. Simulation pure, pas à pas après celui de la faction ; temps en secondes de jeu, distances en cases
 */

/** Une unité du joueur à moins de KING_WAKE cases du roi le réveille (ou un coup porté à lui, à sa citadelle) */
export const KING_WAKE = 11;
/** Il enrage à cette part de sa vie */
export const ENRAGE_AT = 0.5;
/** Invocations : toutes les SUMMON_EVERY secondes (×1.4 en rage), SUMMON_N diablotins, au plus SUMMON_CAP à la fois */
export const SUMMON_EVERY = 13, SUMMON_N = 3, SUMMON_CAP = 8;
/** Boules de feu : temps entre deux (phase 1, phase 2), temps de chute (l'avertissement au sol), rayon et dégâts */
export const FIREBALL_EVERY: [number, number] = [5, 3.2];
export const FIREBALL_FALL = 1.5, FIREBALL_R = 1.5, FIREBALL_DMG = 26;
/** Sol qui s'embrase (rage) : une plaque toutes les PATCH_EVERY secondes ; elle rougeoit PATCH_WARM s, brûle PATCH_BURN s */
export const PATCH_EVERY = 2.4, PATCH_WARM = 1.4, PATCH_BURN = 6, PATCH_R = 1.3, PATCH_DPS = 10;
/** Un cri toutes les ROAR_EVERY secondes, en rage */
export const ROAR_EVERY = 9;
/** Portée des attaques du roi : il vise les soldats à moins de KING_REACH cases */
export const KING_REACH = 13;
/** La rage : dégâts, allure, cadence du roi */
const RAGE = { dmg: 1.35, speed: 1.3, cooldown: 0.8 };
/** L'armure de la citadelle une fois son roi abattu */
export const CITADEL_ARMOR_FALLEN = 3;

export type KingPhase = 0 | 1 | 2 | 3;
/** Une boule de feu qui tombe : où elle s'écrasera, dans combien de temps */
export interface Fireball { x: number; z: number; t: number; r: number }
/** Une plaque de sol qui s'embrase : où, son rayon, son âge (elle rougeoit, puis brûle) */
export interface Patch { x: number; z: number; r: number; age: number; tick: number }

export interface KingSave { phase: KingPhase; arrived: boolean; fallen?: boolean }

export class KingFight {
  phase: KingPhase = 0;
  /** le joueur est arrivé au royaume (la bannière s'est montrée) */
  arrived = false;
  /** la citadelle est tombée (la victoire a été comptée) */
  fallen = false;
  fireballs: Fireball[] = [];
  patches: Patch[] = [];
  /** nombre de cris poussés (la vue tremble à chaque nouveau) */
  roars = 0;
  private summoned = new Set<number>();
  private summonT = 4;
  private fireT = 2;
  private patchT = 1;
  private roarT = 0;
  private rnd = mulberry32(4242);

  constructor(readonly hell: Hell) {}

  /** Le roi, vivant (ou null) */
  get king(): HellUnit | null {
    for (const u of this.hell.units.values()) if (u.kind === 'king' && u.side === 'hell' && u.hp > 0) return u;
    return null;
  }
  /** La citadelle du royaume */
  get citadel(): HellBuilding | null {
    for (const b of this.hell.buildings.values()) if (b.kind === 'kingdom') return b;
    return null;
  }
  /** Le combat est en cours (le roi réveillé, vivant) */
  get fighting() { return this.phase === 1 || this.phase === 2; }

  /** Un pas (après celui de la faction) */
  step(dt: number) {
    if (dt <= 0) return;
    const h = this.hell, k = this.king, troops = h.alive('player');
    // l'arrivée au royaume : une unité du joueur y entre
    if (!this.arrived && troops.some((u) => h.map.zones[Z_KINGDOM] && u.z >= h.map.zones[Z_KINGDOM].z0)) this.arrived = true;
    if (this.phase === 0) {
      if (!k) return;
      const cit = this.citadel;
      const near = troops.some((u) => Math.hypot(u.x - k.x, u.z - k.z) < KING_WAKE);
      if (near || k.hp < k.maxHp || (cit && !cit.down && cit.hp < cit.maxHp)) this.wake();
      return;
    }
    if (this.phase === 3) { this.fireballs.length = 0; this.patches.length = 0; return; }
    // le roi abattu
    if (!k) { this.fall(); return; }
    if (this.phase === 1 && k.hp <= k.maxHp * ENRAGE_AT) this.enrage(k);
    const rage = this.phase === 2;
    // les diablotins invoqués (on oublie ceux qui sont tombés)
    for (const id of [...this.summoned]) { const u = h.units.get(id); if (!u || u.hp <= 0) this.summoned.delete(id); }
    this.summonT -= dt;
    if (this.summonT <= 0) { this.summonT = SUMMON_EVERY * (rage ? 1.4 : 1); this.summon(k); }
    // les boules de feu : sur un soldat à portée ; elles tombent, puis s'écrasent
    const reach = troops.filter((u) => Math.hypot(u.x - k.x, u.z - k.z) < KING_REACH);
    this.fireT -= dt;
    if (this.fireT <= 0 && reach.length) {
      this.fireT = FIREBALL_EVERY[rage ? 1 : 0];
      const t = reach[Math.floor(this.rnd() * reach.length)];
      this.fireballs.push({ x: t.x, z: t.z, t: FIREBALL_FALL, r: FIREBALL_R });
    }
    for (const f of [...this.fireballs]) {
      f.t -= dt;
      if (f.t > 0) continue;
      this.fireballs.splice(this.fireballs.indexOf(f), 1);
      h.events.push({ type: 'blast', x: f.x, z: f.z, r: f.r });
      for (const u of h.alive('player')) if (Math.hypot(u.x - f.x, u.z - f.z) < f.r + u.stats.radius) h.damage(u, FIREBALL_DMG, k.id, true);
    }
    // la rage : le sol s'embrase par plaques près des soldats, le roi crie
    if (rage) {
      this.patchT -= dt;
      if (this.patchT <= 0 && reach.length) {
        this.patchT = PATCH_EVERY;
        const t = reach[Math.floor(this.rnd() * reach.length)], a = this.rnd() * Math.PI * 2, d = this.rnd() * 1.2;
        const c = h.map.nearestWalkable(t.x + Math.sin(a) * d, t.z + Math.cos(a) * d, 2), W = h.map.W;
        if (c >= 0) this.patches.push({ x: (c % W) + 0.5, z: Math.floor(c / W) + 0.5, r: PATCH_R, age: 0, tick: 0 });
      }
      this.roarT -= dt;
      if (this.roarT <= 0) this.roar(k);
    }
    for (const p of [...this.patches]) {
      p.age += dt;
      if (p.age > PATCH_WARM + PATCH_BURN) { this.patches.splice(this.patches.indexOf(p), 1); continue; }
      if (p.age < PATCH_WARM) continue;
      // les dégâts tombent par demi-seconde (une étincelle à chaque fois, pas à chaque image)
      p.tick -= dt;
      if (p.tick > 0) continue;
      p.tick = 0.5;
      for (const u of h.alive('player')) if (Math.hypot(u.x - p.x, u.z - p.z) < p.r + u.stats.radius * 0.5) h.damage(u, PATCH_DPS * 0.5, k.id, true);
    }
  }

  /** Le roi se réveille : le combat commence */
  wake() {
    if (this.phase !== 0 || !this.king) return;
    this.phase = 1;
    this.summonT = 4; this.fireT = 2;
    this.hell.raiseAlert(Z_KINGDOM, this.king.x, this.king.z);
    this.hell.events.push({ type: 'boss', phase: 1 });
  }

  /** La rage : plus fort, plus vif ; il crie aussitôt */
  private enrage(k: HellUnit) {
    this.phase = 2;
    this.boost(k);
    this.patchT = 1;
    this.hell.events.push({ type: 'boss', phase: 2 });
    this.roar(k);
  }
  private boost(k: HellUnit) {
    k.stats = { ...k.stats, dmg: k.stats.dmg * RAGE.dmg, speed: k.stats.speed * RAGE.speed, cooldown: k.stats.cooldown * RAGE.cooldown };
  }

  private roar(k: HellUnit) {
    this.roarT = ROAR_EVERY;
    this.roars++;
    this.hell.events.push({ type: 'roar', x: k.x, z: k.z });
  }

  /** Des diablotins sortent de terre autour du roi */
  private summon(k: HellUnit) {
    const h = this.hell, W = h.map.W;
    for (let i = 0; i < SUMMON_N && this.summoned.size < SUMMON_CAP; i++) {
      const a = this.rnd() * Math.PI * 2, c = h.map.nearestWalkable(k.x + Math.sin(a) * 1.8, k.z + Math.cos(a) * 1.8, 3);
      if (c < 0) continue;
      const x = (c % W) + 0.5, z = Math.floor(c / W) + 0.5, u = h.spawn('imp', x, z, Z_KINGDOM);
      u.home = [k.home[0], k.home[1]];
      this.summoned.add(u.id);
      h.events.push({ type: 'spawn', id: u.id, kind: 'imp', x, z });
    }
  }

  /** Le roi est tombé : la citadelle vacille */
  private fall() {
    this.phase = 3;
    this.fireballs.length = 0; this.patches.length = 0;
    const c = this.citadel;
    if (c) c.armor = Math.min(c.armor, CITADEL_ARMOR_FALLEN);
    this.hell.events.push({ type: 'boss', phase: 3 });
  }

  /**
   * La citadelle est tombée : le royaume s'effondre, ses démons avec lui (ceux de sa zone) ; renvoie true la première fois
   */
  collapse(): boolean {
    if (this.fallen) return false;
    this.fallen = true;
    if (this.phase !== 3) { this.phase = 3; this.fireballs.length = 0; this.patches.length = 0; }
    const h = this.hell;
    for (const u of h.garrison(Z_KINGDOM)) {
      u.hp = 0; u.state = 'dead'; u.target = null; u.path = null; u.hurt = 0;
      h.events.push({ type: 'death', id: u.id, kind: u.kind, side: 'hell', x: u.x, z: u.z });
    }
    for (const b of h.standing(Z_KINGDOM)) if (b.side === 'hell') h.raze(b);
    return true;
  }

  save(): KingSave { return { phase: this.phase, arrived: this.arrived, fallen: this.fallen }; }

  /** Reprend un état sauvegardé (la faction a déjà été rechargée) */
  static load(hell: Hell, s: KingSave | null | undefined): KingFight {
    const f = new KingFight(hell);
    if (!s || typeof s !== 'object') { if (hell.victory) { f.phase = 3; f.fallen = true; } return f; }
    const ph = [0, 1, 2, 3].includes(s.phase) ? s.phase : 0;
    f.arrived = !!s.arrived;
    f.fallen = !!s.fallen || hell.victory;
    const k = f.king;
    // le roi n'est plus là (abattu avant la sauvegarde) : le combat est fini
    f.phase = f.fallen || (ph > 0 && !k) ? 3 : ph;
    if (f.phase === 2 && k) f.boost(k);
    if (f.phase === 3) { const c = f.citadel; if (c && !c.down) c.armor = Math.min(c.armor, CITADEL_ARMOR_FALLEN); }
    return f;
  }
}

// ---------- La victoire et ses récompenses ----------

/** Le savoir-faire (et le trophée) rapporté de la chute du royaume ; la forge infernale du village */
export const KINGDOM_PERK = 'hellking', FORGE_PERK = 'hellforge';
/** Le butin : minerai, équipement rare, et la joie durable du village */
export const KINGDOM_ORE = 250;
export const KINGDOM_GEAR: [GearId, number][] = [['sword', 4], ['armor', 4], ['kit', 3]];
export const KINGDOM_JOY = 3;
/** La forge infernale : le village fabrique son équipement plus vite, les expéditions sont plus sûres */
export const FORGE_CRAFT = 1.5, FORGE_RISK = 0.85;

/** Le royaume des Enfers est tombé dans cette partie (l'île du portail est purifiée, le portail éteint) */
export function hellFallen(w: { exp: { perks: readonly string[] } }) { return w.exp.perks.includes(KINGDOM_PERK); }

export interface KingdomReward { ore: number; gear: [GearId, number][]; joy: number }

/** Ce que touche le village pour la chute du royaume */
export interface KingdomPurse {
  ore: number;
  exp: { perks: string[]; gear: Record<GearId, number>; bonus: Record<NeedKey, number> };
  isleGuard: { waves: number; days: number };
}

/**
 * Le village touche ses récompenses (une seule fois par partie : null si c'est déjà fait) : le trophée et la forge infernale
 * (savoir-faire durables), le minerai, l'équipement rare, la joie ; l'île du portail compte pour sécurisée (plus aucune
 * incursion n'y viendra) : `secure`, les vagues qu'il faut pour cela (voir `ISLE_SECURE`)
 */
export function claimKingdom(w: KingdomPurse, secure = SECURE_WAVES): KingdomReward | null {
  if (w.exp.perks.includes(KINGDOM_PERK)) return null;
  w.exp.perks.push(KINGDOM_PERK);
  if (!w.exp.perks.includes(FORGE_PERK)) w.exp.perks.push(FORGE_PERK);
  w.ore += KINGDOM_ORE;
  for (const [g, n] of KINGDOM_GEAR) w.exp.gear[g] = (w.exp.gear[g] ?? 0) + n;
  w.exp.bonus.joy += KINGDOM_JOY;
  w.isleGuard.waves = Math.max(w.isleGuard.waves, secure);
  return { ore: KINGDOM_ORE, gear: KINGDOM_GEAR.map(([g, n]) => [g, n]), joy: KINGDOM_JOY };
}
