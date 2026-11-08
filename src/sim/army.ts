import type { UnitStats } from './hell';
import { GEAR_BY, GearId, Stock } from './gear';

/**
 * L'armée du joueur : la garnison de l'île du portail. Des habitants du village s'enrôlent à la caserne (sur l'île) : chacun
 * prend en réserve les pièces d'équipement de sa troupe (lance du soldat, arc de l'archer, épée et armure du chevalier, que le
 * village fabrique ; lance et cheval de l'écurie pour le cavalier), traverse le bras de mer en galère et rejoint la garnison au bout de sa durée de recrutement. Un soldat
 * abattu n'est pas perdu : il est ramené blessé à la caserne et s'y soigne. Renvoyé au village, il rapporte son équipement (et son cheval).
 * Simulation pure (le combat est dans `hell.ts`, l'île dans `isleBattle.ts`)
 */

export type TroopKind = 'soldier' | 'archer' | 'knight' | 'cavalry';

/**
 * Une troupe garde son identité mais change de visage avec l'âge du village : nom, icône, équipement requis et caractéristiques
 * (l'archer devient tirailleur au fusil, le chevalier hallebardier, le cavalier char). `from` : premier âge de cette forme
 */
export interface TroopForm {
  from: number;
  name: string;
  plural: string;
  icon: string;
  gear: GearId[];
  mount?: boolean;
  /** multiplicateurs sur les caractéristiques de base (vie, dégâts, portée, cadence : `cooldown`, vitesse, taille), et bonus aux grandes créatures */
  adj?: Partial<Record<'hp' | 'dmg' | 'range' | 'cooldown' | 'speed' | 'radius', number>> & { big?: number };
  desc: string;
}

export interface TroopDef {
  kind: TroopKind;
  name: string;
  plural: string;
  icon: string;
  /** âge à partir duquel on la recrute */
  age: number;
  /** pièces d'équipement prises en réserve, une de chaque */
  gear: GearId[];
  /** monte un cheval de l'écurie du village (il y manque tant que la recrue est dans l'armée ; rendu au renvoi) */
  mount?: boolean;
  /** durée du recrutement (secondes de jeu : l'enrôlement, la traversée en galère) */
  time: number;
  /** caractéristiques à son premier âge (elles montent un peu à chaque âge) */
  base: UnitStats;
  desc: string;
  /** les formes successives selon l'âge (en plus de la troupe d'origine) ; absent : la troupe ne change pas */
  forms?: TroopForm[];
}

export const TROOPS: Record<TroopKind, TroopDef> = {
  soldier: {
    kind: 'soldier', name: 'Soldat', plural: 'Soldats', icon: '🛡️', age: 1, gear: ['spear'], time: 20,
    base: { hp: 110, dmg: 11, range: 0.6, speed: 2, cooldown: 1.1, sight: 6, radius: 0.28 },
    desc: 'Lance et bouclier : il tient la ligne au corps à corps.',
    forms: [
      { from: 3, name: 'Fusilier', plural: 'Fusiliers', icon: '💂', gear: ['spear'], adj: { hp: 1.05, dmg: 1.2 }, desc: 'Fusil à baïonnette (la lance de la réserve s’y fixe) : il tient la ligne et pique à bout portant.' },
      { from: 4, name: 'Fantassin', plural: 'Fantassins', icon: '🪖', gear: ['spear'], adj: { hp: 1.15, dmg: 1.3 }, desc: 'Treillis, gilet pare-balles et fusil d’assaut à baïonnette : il tient la ligne.' },
      { from: 5, name: 'Soldat à impulsions', plural: 'Soldats à impulsions', icon: '🦾', gear: ['spear'], adj: { hp: 1.3, dmg: 1.4, speed: 1.1 }, desc: 'Exo-armure et fusil à impulsions : il tient la ligne, vite et dur.' },
    ],
  },
  archer: {
    kind: 'archer', name: 'Archer', plural: 'Archers', icon: '🏹', age: 1, gear: ['bow'], time: 26,
    base: { hp: 65, dmg: 8, range: 5.5, speed: 2, cooldown: 1.4, sight: 7, radius: 0.26 },
    desc: 'Tire de loin : à garder derrière les soldats.',
    forms: [
      { from: 3, name: 'Tirailleur', plural: 'Tirailleurs', icon: '🔫', gear: ['rifle'], adj: { dmg: 2.2, range: 1.45, cooldown: 1.7 }, desc: 'Un fusil à la place de l’arc (à fabriquer à l’atelier) : portée longue, coup dur, mais cadence lente. La poudre fait du bruit et de la fumée.' },
      { from: 4, name: 'Tireur d’élite', plural: 'Tireurs d’élite', icon: '🎯', gear: ['rifle'], adj: { hp: 1.1, dmg: 2.7, range: 1.7, cooldown: 1.45 }, desc: 'Fusil à lunette : très longue portée, chaque balle compte.' },
      { from: 5, name: 'Pilote de drones', plural: 'Pilotes de drones', icon: '🤖', gear: ['rifle'], adj: { hp: 1.2, dmg: 1.5, range: 1.9, cooldown: 0.5 }, desc: 'Combinaison à visière et deux drones de combat qui l’escortent (le fusil de la réserve devient son émetteur de pilotage) : portée immense, vie moyenne, dégâts modérés mais cadence rapide.' },
    ],
  },
  knight: {
    kind: 'knight', name: 'Chevalier', plural: 'Chevaliers', icon: '⚔️', age: 2, gear: ['sword', 'armor'], time: 40,
    base: { hp: 230, dmg: 20, range: 0.7, speed: 2.3, cooldown: 1.3, sight: 6, radius: 0.34 },
    desc: 'Épée et armure (à partir du Moyen Âge) : le plus solide de la garnison.',
    forms: [
      { from: 3, name: 'Hallebardier', plural: 'Hallebardiers', icon: '🪓', gear: ['sword', 'armor'], adj: { hp: 1.1, dmg: 1.15, speed: 0.95, big: 1.6 }, desc: 'Cuirasse et hallebarde (forgée à l’atelier) : lourd, son arme d’hast fend les grandes créatures.' },
      { from: 4, name: 'Bazooka', plural: 'Bazookas', icon: '🚀', gear: ['rifle', 'armor'], adj: { hp: 1.0, dmg: 3.2, range: 8, cooldown: 1.7, big: 1.5 }, desc: 'Lance-roquettes sur l’épaule (fusil et armure de l’atelier) : roquette lourde à moyenne portée, cadence lente, redoutable contre les grandes créatures.' },
      { from: 5, name: 'Exo-lanceur', plural: 'Exo-lanceurs', icon: '☄️', gear: ['rifle', 'armor'], adj: { hp: 1.2, dmg: 3.8, range: 10, cooldown: 1.5, big: 1.4 }, desc: 'Exo-armure et lanceur de missiles à tête chercheuse : portée longue, coup dévastateur.' },
    ],
  },
  cavalry: {
    kind: 'cavalry', name: 'Cavalier', plural: 'Cavaliers', icon: '🐎', age: 1, gear: ['spear'], mount: true, time: 34,
    base: { hp: 150, dmg: 16, range: 0.8, speed: 3.2, cooldown: 1.2, sight: 6, radius: 0.4 },
    desc: 'Un cheval de l’écurie et une lance : rapide, il charge et frappe fort au corps à corps, mais ne tient pas la ligne.',
    forms: [
      { from: 4, name: 'Char', plural: 'Chars', icon: '🚜', gear: ['rifle', 'armor'], adj: { hp: 1.6, dmg: 1.0, range: 5.5, cooldown: 1.5, speed: 0.95, radius: 1.15 }, desc: 'Plus de cheval : un blindé à chenilles (fusil et armure de l’atelier), canon à moyenne portée.' },
      { from: 5, name: 'Char antigrav', plural: 'Chars antigrav', icon: '🛸', gear: ['rifle', 'armor'], adj: { hp: 2.4, dmg: 1.5, range: 8, cooldown: 1.6, speed: 1.0, radius: 1.2 }, desc: 'Un char qui flotte sur un coussin d’énergie (fusil et armure de l’atelier) : bouclier énergétique, deux canons à plasma à longue portée.' },
    ],
  },
};
export const TROOP_KINDS = Object.keys(TROOPS) as TroopKind[];
export const isTroopKind = (k: unknown): k is TroopKind => typeof k === 'string' && k in TROOPS;

/** Gain par âge au-delà du premier âge de la troupe (vie et dégâts) */
const AGE_K = 0.12;

/** La forme d'une troupe à l'âge du village (par défaut, la troupe d'origine) */
export function troopForm(kind: TroopKind, age: number): TroopForm {
  const d = TROOPS[kind];
  let f: TroopForm = { from: d.age, name: d.name, plural: d.plural, icon: d.icon, gear: d.gear, mount: d.mount, desc: d.desc };
  for (const x of d.forms ?? []) if (age >= x.from) f = x;
  return f;
}
/** Son nom à cet âge : « Tirailleur », « Cavalier » */
export const troopName = (kind: TroopKind, age: number) => troopForm(kind, age).name;
/** Son nom avec celui d'origine quand il a changé : « Tirailleur (ex-archer) » */
export function troopLabel(kind: TroopKind, age: number) {
  const f = troopForm(kind, age), d = TROOPS[kind];
  return f.name === d.name ? f.name : `${f.name} (ex-${d.name.toLowerCase()})`;
}
/** Équipement demandé à cet âge (pièces, cheval) */
export function troopKit(kind: TroopKind, age: number): { gear: GearId[]; mount: boolean } {
  const f = troopForm(kind, age);
  return { gear: f.gear, mount: !!f.mount };
}

/** Caractéristiques d'une troupe à l'âge du village (elles changent avec sa forme) */
export function troopStats(kind: TroopKind, age: number): UnitStats {
  const d = TROOPS[kind], k = 1 + AGE_K * Math.max(0, age - d.age), a = troopForm(kind, age).adj ?? {};
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const st: UnitStats = {
    ...d.base,
    hp: Math.round(d.base.hp * k * (a.hp ?? 1)), dmg: Math.round(d.base.dmg * k * (a.dmg ?? 1) * 10) / 10,
    range: r2(d.base.range * (a.range ?? 1)), cooldown: r2(d.base.cooldown * (a.cooldown ?? 1)),
    speed: r2(d.base.speed * (a.speed ?? 1)), radius: r2(d.base.radius * (a.radius ?? 1)),
  };
  if (a.big) st.big = a.big;
  return st;
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
  /** équipement pris à l'enrôlement (rendu au renvoi) : absent d'une ancienne sauvegarde (alors celui de la troupe d'origine) */
  gear?: GearId[];
  mount?: boolean;
  /** abattu : secondes de soins restantes à la caserne (0 : valide) */
  heal: number;
  /** position au dernier relevé (dans la carte de son lieu), pour la sauvegarde */
  x?: number;
  z?: number;
}

/** Une recrue en route : sorte, temps restant ; recrutée à la caserne avancée des Enfers, elle y arrive (`at`) */
export interface Recruit { kind: TroopKind; left: number; at?: TroopWhere; gear?: GearId[]; mount?: boolean }

export interface Army {
  troops: Troop[];
  queue: Recruit[];
  nextId: number;
}

export const newArmy = (): Army => ({ troops: [], queue: [], nextId: 1 });

/** Ce que l'on sait du village pour recruter */
export interface RecruitCtx {
  age: number; stock: Stock; barracks: number; pop: number; unlimited?: boolean;
  /** écuries du village, et chevaux qui s'y trouvent (ni en expédition, ni déjà montés) ; `ride` : prend (+1) ou rend (-1) un cheval */
  stables?: number; horses?: number; ride?: (d: number) => void;
}

/** Troupes recrutées et en route */
export const armySize = (a: Army) => a.troops.length + a.queue.length;
/** Plafond en vigueur : casernes et âge, et la part du village */
export const armyCap = (c: RecruitCtx) => Math.min(troopCap(c.barracks, c.age), Math.floor(c.pop / POP_SHARE));

/** Pourquoi l'on ne peut pas recruter cette troupe (null : on peut) */
export function recruitWhy(a: Army, kind: TroopKind, c: RecruitCtx): string | null {
  const d = TROOPS[kind], f = troopForm(kind, c.age);
  if (c.age < d.age) return `${d.plural} : à partir du Moyen Âge`;
  if (f.mount && !(c.stables ?? 0)) return 'Il faut une écurie au village (la cavalerie monte les chevaux de l’écurie)';
  if (c.barracks <= 0) return 'Il faut une caserne sur l’île du portail';
  if (armySize(a) >= troopCap(c.barracks, c.age)) return `Garnison au complet (${troopCap(c.barracks, c.age)} places : une autre caserne en ajouterait)`;
  if (armySize(a) >= Math.floor(c.pop / POP_SHARE)) return `Le village est trop petit pour une recrue de plus (un habitant sur ${POP_SHARE} au plus)`;
  // (le cheval ne s'achète pas : même en ressources illimitées, il en faut un à l'écurie)
  if (f.mount && (c.horses ?? 0) < 1) return 'Pas de cheval disponible à l’écurie (en élever, ou attendre le retour d’une expédition montée)';
  if (!c.unlimited) {
    const miss = f.gear.filter((g) => (c.stock[g] ?? 0) < 1);
    if (miss.length) return `${f.name} : il faut ${miss.map((g) => `1 ${GEAR_BY[g].name.toLowerCase()}`).join(' et ')} en réserve (à fabriquer, menu Expéditions › Équipement)`;
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
export function gearToCraft(kind: TroopKind, stock: Stock, crafting: readonly GearId[], waiting: readonly TroopKind[] = [], age = 2): GearId[] {
  const out: GearId[] = [];
  for (const g of troopKit(kind, age).gear) {
    const need = 1 + waiting.filter((k) => troopKit(k, age).gear.includes(g)).length;
    if ((stock[g] ?? 0) + crafting.filter((x) => x === g).length < need) out.push(g);
  }
  return out;
}

/** Enrôle une recrue : son équipement quitte la réserve, elle se met en route. Renvoie la raison d'un refus, ou null */
export function recruit(a: Army, kind: TroopKind, c: RecruitCtx, at?: TroopWhere): string | null {
  const why = recruitWhy(a, kind, c);
  if (why) return why;
  const kit = troopKit(kind, c.age);
  if (!c.unlimited) { for (const g of kit.gear) c.stock[g]--; if (kit.mount) { c.ride?.(1); if (c.horses) c.horses--; } }
  // à la caserne avancée, pas de traversée : un peu plus vite (l'équipement pris est noté : on le rend tel quel)
  a.queue.push({ kind, left: at === 'hell' ? Math.round(TROOPS[kind].time * 0.75) : TROOPS[kind].time, ...(at === 'hell' ? { at } : {}), gear: [...kit.gear], ...(kit.mount ? { mount: true } : {}) });
  return null;
}

/** Annule une recrue en route : son équipement revient en réserve */
export function cancelRecruit(a: Army, i: number, stock: Stock, unlimited = false, ride?: (d: number) => void) {
  const r = a.queue[i];
  if (!r) return;
  a.queue.splice(i, 1);
  if (!unlimited) { for (const g of r.gear ?? TROOPS[r.kind].gear) stock[g]++; if (r.mount ?? TROOPS[r.kind].mount) ride?.(-1); }
}

/** Renvoie un soldat au village : il rapporte son équipement */
export function dismiss(a: Army, id: number, stock: Stock, unlimited = false, ride?: (d: number) => void) {
  const i = a.troops.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const t = a.troops[i];
  a.troops.splice(i, 1);
  if (!unlimited) { for (const g of t.gear ?? TROOPS[t.kind].gear) stock[g]++; if (t.mount ?? TROOPS[t.kind].mount) ride?.(-1); }
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
    const t: Troop = { id: a.nextId++, kind: r.kind, hp: st.hp, maxHp: st.hp, where: r.at ?? 'isle', heal: 0, ...(r.gear ? { gear: r.gear } : {}), ...(r.mount ? { mount: true } : {}) };
    a.troops.push(t);
    joined.push(t);
  }
  // une recrue plus loin dans la file a pu finir avant la première (plusieurs casernes)
  for (let i = a.queue.length - 1; i >= 0; i--) {
    if (a.queue[i].left > 0) continue;
    const r = a.queue.splice(i, 1)[0], st = troopStats(r.kind, age);
    const t: Troop = { id: a.nextId++, kind: r.kind, hp: st.hp, maxHp: st.hp, where: r.at ?? 'isle', heal: 0, ...(r.gear ? { gear: r.gear } : {}), ...(r.mount ? { mount: true } : {}) };
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

/** Équipement relu d'une sauvegarde (ignoré s'il est abîmé : on retombe sur celui de la troupe d'origine) */
const gearField = (g: unknown): { gear?: GearId[] } => Array.isArray(g) && g.every((x) => typeof x === 'string' && x in GEAR_BY) ? { gear: g as GearId[] } : {};

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
      ...gearField(r.gear), ...(r.mount === true ? { mount: true } : {}),
      ...(Number.isFinite(r.x) && Number.isFinite(r.z) ? { x: +r.x, z: +r.z } : {}),
    });
    a.nextId = Math.max(a.nextId, id + 1);
  }
  for (const r of Array.isArray(o.queue) ? o.queue : []) if (r && isTroopKind(r.kind)) a.queue.push({ kind: r.kind, left: Math.max(0, +r.left || 0), ...(r.at === 'hell' ? { at: 'hell' as const } : {}), ...gearField(r.gear), ...(r.mount === true ? { mount: true } : {}) });
  if (Number.isInteger(o.nextId)) a.nextId = Math.max(a.nextId, o.nextId as number);
  return a;
}
