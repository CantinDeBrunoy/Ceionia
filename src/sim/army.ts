import type { UnitStats } from './hell';
import { GEAR_BY, GearId, Stock } from './gear';

/**
 * L'armée du joueur : la garnison de l'île du portail. Des habitants du village s'enrôlent à la caserne (sur l'île) : chacun
 * prend en réserve les pièces d'équipement de sa troupe (lance du soldat, arc de l'archer, épée et armure du chevalier, que le
 * village fabrique), traverse le bras de mer en galère et rejoint la garnison au bout de sa durée de recrutement. Un soldat
 * abattu n'est pas perdu : il est ramené blessé à la caserne et s'y soigne. Renvoyé au village, il rapporte son équipement.
 * Simulation pure (le combat est dans `hell.ts`, l'île dans `isleBattle.ts`)
 */

export type TroopKind = 'soldier' | 'archer' | 'knight';

export interface TroopDef {
  kind: TroopKind;
  name: string;
  plural: string;
  icon: string;
  /** âge à partir duquel on la recrute */
  age: number;
  /** pièces d'équipement prises en réserve, une de chaque */
  gear: GearId[];
  /** durée du recrutement (secondes de jeu : l'enrôlement, la traversée en galère) */
  time: number;
  /** caractéristiques à son premier âge (elles montent un peu à chaque âge) */
  base: UnitStats;
  desc: string;
}

export const TROOPS: Record<TroopKind, TroopDef> = {
  soldier: {
    kind: 'soldier', name: 'Soldat', plural: 'Soldats', icon: '🛡️', age: 1, gear: ['spear'], time: 20,
    base: { hp: 110, dmg: 11, range: 0.6, speed: 2, cooldown: 1.1, sight: 6, radius: 0.28 },
    desc: 'Lance et bouclier : il tient la ligne au corps à corps.',
  },
  archer: {
    kind: 'archer', name: 'Archer', plural: 'Archers', icon: '🏹', age: 1, gear: ['bow'], time: 26,
    base: { hp: 65, dmg: 8, range: 5.5, speed: 2, cooldown: 1.4, sight: 7, radius: 0.26 },
    desc: 'Tire de loin : à garder derrière les soldats.',
  },
  knight: {
    kind: 'knight', name: 'Chevalier', plural: 'Chevaliers', icon: '⚔️', age: 2, gear: ['sword', 'armor'], time: 40,
    base: { hp: 230, dmg: 20, range: 0.7, speed: 2.3, cooldown: 1.3, sight: 6, radius: 0.34 },
    desc: 'Épée et armure (à partir du Moyen Âge) : le plus solide de la garnison.',
  },
};
export const TROOP_KINDS = Object.keys(TROOPS) as TroopKind[];
export const isTroopKind = (k: unknown): k is TroopKind => typeof k === 'string' && k in TROOPS;

/** Gain par âge au-delà du premier âge de la troupe (vie et dégâts) */
const AGE_K = 0.12;

/** Caractéristiques d'une troupe à l'âge du village */
export function troopStats(kind: TroopKind, age: number): UnitStats {
  const d = TROOPS[kind], k = 1 + AGE_K * Math.max(0, age - d.age);
  return { ...d.base, hp: Math.round(d.base.hp * k), dmg: Math.round(d.base.dmg * k * 10) / 10 };
}

/** Soins d'un soldat abattu, ramené à la caserne (secondes de jeu) */
export const HEAL_TIME = 60;
/** Les blessures légères se referment d'elles-mêmes hors combat, sur l'île (points de vie par seconde) */
export const REGEN = 2;
/** Plus que ça de troupes en route ou recrutées à la fois, par caserne, selon l'âge */
export const troopCap = (barracks: number, age: number) => barracks * (4 + 2 * Math.max(1, age));
/** Le village garde ses bras : pas plus d'un habitant sur POP_SHARE dans la garnison */
export const POP_SHARE = 4;

/** Où se trouve une troupe : sur l'île du portail, dans les Enfers (expédition) */
export type TroopWhere = 'isle' | 'hell';

/** Un membre de la garnison */
export interface Troop {
  id: number;
  kind: TroopKind;
  /** vie (au dernier relevé), et vie pleine */
  hp: number;
  maxHp: number;
  where: TroopWhere;
  /** abattu : secondes de soins restantes à la caserne (0 : valide) */
  heal: number;
  /** position au dernier relevé (dans la carte de son lieu), pour la sauvegarde */
  x?: number;
  z?: number;
}

/** Une recrue en route : sorte, temps restant ; recrutée à la caserne avancée des Enfers, elle y arrive (`at`) */
export interface Recruit { kind: TroopKind; left: number; at?: TroopWhere }

export interface Army {
  troops: Troop[];
  queue: Recruit[];
  nextId: number;
}

export const newArmy = (): Army => ({ troops: [], queue: [], nextId: 1 });

/** Ce que l'on sait du village pour recruter */
export interface RecruitCtx { age: number; stock: Stock; barracks: number; pop: number; unlimited?: boolean }

/** Troupes recrutées et en route */
export const armySize = (a: Army) => a.troops.length + a.queue.length;
/** Plafond en vigueur : casernes et âge, et la part du village */
export const armyCap = (c: RecruitCtx) => Math.min(troopCap(c.barracks, c.age), Math.floor(c.pop / POP_SHARE));

/** Pourquoi l'on ne peut pas recruter cette troupe (null : on peut) */
export function recruitWhy(a: Army, kind: TroopKind, c: RecruitCtx): string | null {
  const d = TROOPS[kind];
  if (c.age < d.age) return `${d.plural} : à partir du Moyen Âge`;
  if (c.barracks <= 0) return 'Il faut une caserne sur l’île du portail';
  if (armySize(a) >= troopCap(c.barracks, c.age)) return `Garnison au complet (${troopCap(c.barracks, c.age)} places : une autre caserne en ajouterait)`;
  if (armySize(a) >= Math.floor(c.pop / POP_SHARE)) return `Le village est trop petit pour une recrue de plus (un habitant sur ${POP_SHARE} au plus)`;
  if (!c.unlimited) {
    const miss = d.gear.filter((g) => (c.stock[g] ?? 0) < 1);
    if (miss.length) return `Il faut ${miss.map((g) => `1 ${GEAR_BY[g].name.toLowerCase()}`).join(' et ')} en réserve (à fabriquer, menu Expéditions › Équipement)`;
  }
  return null;
}

/** Seul l'équipement manque pour recruter cette troupe (caserne, place et habitants sont là) */
export function onlyGearMissing(a: Army, kind: TroopKind, c: RecruitCtx) {
  return recruitWhy(a, kind, c) !== null && recruitWhy(a, kind, { ...c, unlimited: true }) === null;
}

/**
 * Les pièces à faire fabriquer pour recruter cette troupe : celles qui manquent, une fois comptées la réserve, les pièces déjà en
 * fabrication (`crafting`) et celles promises aux recrues qui attendent déjà leur équipement (`waiting`)
 */
export function gearToCraft(kind: TroopKind, stock: Stock, crafting: readonly GearId[], waiting: readonly TroopKind[] = []): GearId[] {
  const out: GearId[] = [];
  for (const g of TROOPS[kind].gear) {
    const need = 1 + waiting.filter((k) => TROOPS[k].gear.includes(g)).length;
    if ((stock[g] ?? 0) + crafting.filter((x) => x === g).length < need) out.push(g);
  }
  return out;
}

/** Enrôle une recrue : son équipement quitte la réserve, elle se met en route. Renvoie la raison d'un refus, ou null */
export function recruit(a: Army, kind: TroopKind, c: RecruitCtx, at?: TroopWhere): string | null {
  const why = recruitWhy(a, kind, c);
  if (why) return why;
  if (!c.unlimited) for (const g of TROOPS[kind].gear) c.stock[g]--;
  // à la caserne avancée, pas de traversée : un peu plus vite
  a.queue.push(at === 'hell' ? { kind, left: Math.round(TROOPS[kind].time * 0.75), at } : { kind, left: TROOPS[kind].time });
  return null;
}

/** Annule une recrue en route : son équipement revient en réserve */
export function cancelRecruit(a: Army, i: number, stock: Stock, unlimited = false) {
  const r = a.queue[i];
  if (!r) return;
  a.queue.splice(i, 1);
  if (!unlimited) for (const g of TROOPS[r.kind].gear) stock[g]++;
}

/** Renvoie un soldat au village : il rapporte son équipement */
export function dismiss(a: Army, id: number, stock: Stock, unlimited = false) {
  const i = a.troops.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const t = a.troops[i];
  a.troops.splice(i, 1);
  if (!unlimited) for (const g of TROOPS[t.kind].gear) stock[g]++;
  return t;
}

/**
 * Le temps passe pour l'armée (`dt` en secondes de jeu) : les recrues avancent (autant à la fois que de casernes ; sans
 * caserne, elles attendent), les blessés se soignent (`healK` : plus vite avec un lieu de soins). Renvoie les nouvelles troupes
 * (arrivées sur l'île) et celles qui sortent de soins
 */
export function stepArmy(a: Army, dt: number, barracks: number, age: number, healK = 1): { joined: Troop[]; healed: Troop[] } {
  const joined: Troop[] = [], healed: Troop[] = [];
  if (dt <= 0) return { joined, healed };
  for (let i = 0; i < Math.min(barracks, a.queue.length); i++) a.queue[i].left -= dt;
  while (a.queue.length && a.queue[0].left <= 0) {
    const r = a.queue.shift()!, st = troopStats(r.kind, age);
    const t: Troop = { id: a.nextId++, kind: r.kind, hp: st.hp, maxHp: st.hp, where: r.at ?? 'isle', heal: 0 };
    a.troops.push(t);
    joined.push(t);
  }
  // une recrue plus loin dans la file a pu finir avant la première (plusieurs casernes)
  for (let i = a.queue.length - 1; i >= 0; i--) {
    if (a.queue[i].left > 0) continue;
    const r = a.queue.splice(i, 1)[0], st = troopStats(r.kind, age);
    const t: Troop = { id: a.nextId++, kind: r.kind, hp: st.hp, maxHp: st.hp, where: r.at ?? 'isle', heal: 0 };
    a.troops.push(t);
    joined.push(t);
  }
  for (const t of a.troops) {
    if (t.heal <= 0) continue;
    t.heal -= dt * healK;
    // (il reste où on le soigne : à la caserne de l'île, ou à l'infirmerie de la base avancée)
    if (t.heal <= 0) { t.heal = 0; t.hp = t.maxHp; healed.push(t); }
  }
  return { joined, healed };
}

/**
 * Un soldat abattu : ramené blessé à la caserne de l'île (des Enfers aussi, par le portail), il s'y soigne ; ou soigné sur
 * place, à l'infirmerie de la base avancée (`where` : 'hell')
 */
export function wound(a: Army, id: number, healTime = HEAL_TIME, where: TroopWhere = 'isle') {
  const t = a.troops.find((x) => x.id === id);
  if (!t) return;
  t.hp = 0; t.heal = healTime; t.where = where;
  t.x = undefined; t.z = undefined;
}

/** Les troupes valides (ni blessées, ni en route) d'un lieu */
export const ready = (a: Army, where?: TroopWhere) => a.troops.filter((t) => t.heal <= 0 && (!where || t.where === where));

/** Une nouvelle passe sur les caractéristiques quand l'âge change : la vie pleine suit (les blessures restent en proportion) */
export function ageUp(a: Army, age: number) {
  for (const t of a.troops) {
    const m = troopStats(t.kind, age).hp;
    t.hp = t.maxHp > 0 ? Math.round((t.hp / t.maxHp) * m) : m;
    t.maxHp = m;
  }
}

/** Relit une armée sauvegardée (abîmée ou absente : une armée vide) */
export function readArmy(d: unknown): Army {
  const a = newArmy();
  if (!d || typeof d !== 'object') return a;
  const o = d as Record<string, unknown>;
  for (const r of Array.isArray(o.troops) ? o.troops : []) {
    if (!r || typeof r !== 'object' || !isTroopKind(r.kind)) continue;
    const id = Number.isInteger(r.id) && r.id > 0 ? r.id : a.nextId;
    const maxHp = Math.max(1, +r.maxHp || TROOPS[r.kind as TroopKind].base.hp);
    a.troops.push({
      id, kind: r.kind, maxHp, hp: Math.min(maxHp, Math.max(0, +r.hp || 0)), where: r.where === 'hell' ? 'hell' : 'isle', heal: Math.max(0, +r.heal || 0),
      ...(Number.isFinite(r.x) && Number.isFinite(r.z) ? { x: +r.x, z: +r.z } : {}),
    });
    a.nextId = Math.max(a.nextId, id + 1);
  }
  for (const r of Array.isArray(o.queue) ? o.queue : []) if (r && isTroopKind(r.kind)) a.queue.push({ kind: r.kind, left: Math.max(0, +r.left || 0), ...(r.at === 'hell' ? { at: 'hell' as const } : {}) });
  if (Number.isInteger(o.nextId)) a.nextId = Math.max(a.nextId, o.nextId as number);
  return a;
}
