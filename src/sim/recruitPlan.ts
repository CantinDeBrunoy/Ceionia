import type { World } from '../world/world';
import type { War } from './war';
import { TroopKind, TROOPS, armySize, armyCap, recruitWhy, onlyGearMissing, gearToCraft, troopForm, troopKit, troopName, gearName, andJoin } from './army';
import { tr } from '../i18n';
import { GEAR_BY, GearId, gearCost, gearCostLabel } from './gear';
import { SMITHY_ORE } from './hellBase';

/** L'atelier du village (expéditions), tel que l'interface le voit */
export interface Workshop {
  /** met une pièce en fabrication (son prix est payé) : null, ou la raison du refus */
  craft(id: GearId): string | null;
  /** pourquoi tout ce lot ne peut pas être mis en fabrication d'un coup (null : possible) */
  craftCheck(ids: readonly GearId[]): string | null;
  /** les pièces déjà en fabrication */
  crafting(): readonly GearId[];
}

/** prêt : un clic recrute ; craft : un clic fabrique ce qui manque puis la recrue part ; off : impossible (la raison est dite) */
export type PlanState = 'ready' | 'craft' | 'off';

export interface HellPlan {
  state: PlanState;
  /** la ligne du bouton : « coûte : lance », « fabrique : fusil, puis part », « manque 2 minerai » */
  sub: string;
  /** la phrase entière (infobulle, toast de refus) */
  tip: string;
  /** les pièces à faire fabriquer à l'atelier (état « craft ») */
  list: GearId[];
  /** la forge de la base fabrique les pièces tout de suite, contre du minerai (pas d'atelier utilisable) */
  forge: boolean;
  /** la caserne avancée manque : le bouton propose de la poser */
  needPost: boolean;
  /** les pièces que la forge fabrique (état « forge ») */
  made: string;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** La raison d'un refus, en quelques mots pour un bouton */
export function shortWhy(why: string): string {
  // (la raison peut déjà être dans la langue du jeu : on reconnaît les deux)
  if (/caserne avancée|forward barracks/i.test(why)) return tr('Il faut une caserne avancée');
  if (/Garnison au complet|Garrison full/.test(why)) return tr('Garnison au complet');
  if (/^Il faut une caserne|^You need a barracks/.test(why)) return tr('Il faut une caserne');
  if (/écurie|stable/.test(why)) return tr('Il faut une écurie');
  if (/trop petit|too small/.test(why)) return tr('Village trop petit');
  if (/Pas de cheval|No horse/.test(why)) return tr('Pas de cheval libre');
  if (/à partir du|available from/.test(why)) return tr('Pas encore connue');
  if (/portail est éteint|portal has gone out/.test(why)) return tr('Guerre finie');
  if (/atelier|workshop/i.test(why)) return tr('Il faut un atelier');
  if (/file de fabrication|crafting queue/i.test(why)) return tr('File de l’atelier pleine');
  return why;
}

/** Ce que coûte à fabriquer ce lot de pièces, et ce qui manque au village : « manque 2 minerai » (null : de quoi payer) */
function shortfall(w: World, ids: readonly GearId[]): string | null {
  if (w.unlimited) return null;
  const t = { wood: 0, stone: 0, ore: 0, fuel: 0 };
  for (const id of ids) { const c = gearCost(GEAR_BY[id], w.difficulty); t.wood += c.wood; t.stone += c.stone; t.ore += c.ore; t.fuel += c.fuel ?? 0; }
  const m = { wood: Math.max(0, t.wood - w.wood), stone: Math.max(0, t.stone - w.stone), ore: Math.max(0, t.ore - w.ore), fuel: Math.max(0, t.fuel - w.fuel) };
  const s = gearCostLabel({ wood: m.wood, stone: m.stone, ore: m.ore, ...(m.fuel ? { fuel: m.fuel } : {}) });
  return s ? tr('manque {x}', { x: s }) : null;
}

const names = (gs: readonly GearId[]) => andJoin(gs.map((g) => gearName(g)));

/**
 * Ce qui se passe quand on clique « Recruter » à la caserne avancée des Enfers : prêt (équipement en réserve), à fabriquer
 * (l'atelier du village le fabrique, la recrue part dès qu'il est prêt) ou impossible (avec la raison). `waiting` : les recrues
 * qui attendent déjà leur équipement
 */
export function planHellRecruit(war: War, kind: TroopKind, age: number, pop: number, wk: Workshop, waiting: readonly TroopKind[] = []): HellPlan {
  const off = (tip: string, needPost = false, sub = shortWhy(tip)): HellPlan => ({ state: 'off', sub, tip, list: [], forge: false, needPost, made: '' });
  const b = war.base, nm = troopName(kind, age).toLowerCase();
  if (war.portalOut) return off(tr('Le portail est éteint : la guerre est finie.'));
  if (!b || !b.posts()) return off(tr('Il faut une caserne avancée dans la base : posez-la d’abord.'), true);
  const ctx = war.recruitCtx(age, pop), why = recruitWhy(war.army, kind, ctx), kit = troopKit(kind, age);
  const kitName = [...kit.gear.map((g) => gearName(g)), ...(kit.mount ? [tr('cheval')] : [])].join(' + ');
  if (!why) return { state: 'ready', sub: tr('coûte : {kit}', { kit: kitName }), tip: tr('Recruter : {name}. Prend {kit} en réserve, arrive au camp en {s} s.', { name: troopForm(kind, age).name, kit: kitName, s: Math.round(TROOPS[kind].time * 0.75) }), list: [], forge: false, needPost: false, made: '' };
  if (!onlyGearMissing(war.army, kind, ctx)) return off(why);
  // seul l'équipement manque : l'atelier du village le fabrique (comme sur l'île)
  if (armySize(war.army) + waiting.length >= armyCap(ctx)) return off(tr('Garnison au complet : une recrue attend déjà son équipement.'));
  const list = gearToCraft(kind, ctx.stock, wk.crafting(), waiting, age);
  const lot = wk.craftCheck(list);
  if (!lot) {
    const sub = list.length ? tr('fabrique : {items}, puis part', { items: names(list) }) : tr('équipement en fabrication : part dès qu’il sort');
    const price = list.length ? gearCostLabel(list.reduce((c, g) => { const x = gearCost(GEAR_BY[g], (war.purse as World).difficulty), r = { wood: c.wood + x.wood, stone: c.stone + x.stone, ore: c.ore + x.ore, fuel: (c.fuel ?? 0) + (x.fuel ?? 0) }; return r; }, { wood: 0, stone: 0, ore: 0, fuel: 0 })) : '';
    return { state: 'craft', sub, tip: tr('{name} : l’atelier du village fabrique {what}, puis la recrue ({troop}) part pour le camp.', { name: troopForm(kind, age).name, what: list.length ? `${names(list)}${price ? ` (${price})` : ''}` : tr('l’équipement déjà commandé'), troop: nm }), list, forge: false, needPost: false, made: '' };
  }
  // pas d'atelier utilisable : la forge de la base, contre du minerai
  const miss = kit.gear.filter((g) => (ctx.stock[g] ?? 0) < 1), w = war.purse;
  if (b.countOf('smithy') && miss.length && w.ore >= miss.length * SMITHY_ORE) {
    return { state: 'craft', sub: tr('forge : {items} ({n} minerai)', { items: names(miss), n: miss.length * SMITHY_ORE }), tip: tr('{name} : la forge de la base fabrique {items} pour {n} minerai, puis la recrue part.', { name: troopForm(kind, age).name, items: names(miss), n: miss.length * SMITHY_ORE }), list: [], forge: true, needPost: false, made: names(miss) };
  }
  const need = shortfall(war.purse as World, list);
  return off(tr('{name} : {why}.', { name: troopForm(kind, age).name, why: lower(lot) }), false, need ?? shortWhy(lot));
}

export interface HellOrder {
  /** le toast : ce qui est lancé, ou ce qui manque */
  msg: string;
  /** quelque chose est lancé (recrue partie, ou équipement en fabrication) */
  done: boolean;
  /** le raccourci : poser la caserne avancée */
  openPost?: boolean;
  /** la recrue attend son équipement (à ajouter à la liste d'attente) */
  waits?: boolean;
}

/** Un clic sur « Recruter » : tout ou rien (le prix de l'atelier n'est payé que si tout le lot peut l'être) */
export function orderHellRecruit(war: War, kind: TroopKind, age: number, pop: number, wk: Workshop, waiting: readonly TroopKind[] = []): HellOrder {
  const p = planHellRecruit(war, kind, age, pop, wk, waiting), nm = troopName(kind, age).toLowerCase();
  if (p.needPost) return { msg: tr('Posez d’abord la caserne avancée.'), done: false, openPost: true };
  if (p.state === 'off') return { msg: p.tip, done: false };
  if (p.state === 'ready' || p.forge) {
    const no = war.recruitHell(kind, age, pop);
    if (no) return { msg: no, done: false };
    return { msg: p.forge ? tr('🔥 La forge fabrique {made} : recrue en route ({troop}), elle arrivera au camp.', { made: p.made, troop: nm }) : tr('Recrue en route à la caserne avancée : {troop} (elle arrivera au camp).', { troop: nm }), done: true };
  }
  // l'atelier du village : tout ou rien
  const lot = wk.craftCheck(p.list);
  if (lot) return { msg: lot, done: false };
  for (const g of p.list) { const no = wk.craft(g); if (no) return { msg: no, done: false }; }
  return { msg: p.list.length ? tr('🛠️ L’atelier fabrique {items} : la recrue ({troop}) partira pour le camp dès que ce sera prêt.', { items: andJoin(p.list.map((g) => `1 ${gearName(g)}`)), troop: nm }) : tr('🛠️ La recrue ({troop}) partira pour le camp dès que son équipement sortira de l’atelier.', { troop: nm }), done: true, waits: true };
}

/** Une recrue qui attendait son équipement : part si c'est prêt (true), reste (null), ou renonce avec la raison */
export function stepHellWaiting(war: War, kind: TroopKind, age: number, pop: number, wk: Workshop, before: readonly TroopKind[]): { go: boolean; why?: string } | null {
  if (war.portalOut || !war.base?.posts()) return { go: false, why: tr('plus de caserne avancée') };
  const ctx = war.recruitCtx(age, pop), why = recruitWhy(war.army, kind, ctx);
  if (!why) { const no = war.recruitHell(kind, age, pop); return no ? { go: false, why: lower(no) } : { go: true }; }
  if (!onlyGearMissing(war.army, kind, ctx) || gearToCraft(kind, ctx.stock, wk.crafting(), before, age).length) return { go: false, why: lower(why) };
  return null;
}
