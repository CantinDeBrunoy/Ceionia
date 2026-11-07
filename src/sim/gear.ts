import type { KindId } from '../build/catalog';
import type { Choice, DestKind } from './missions';
import type { World } from '../world/world';
import { Difficulty, rulesOf } from './difficulty';

/**
 * Équipement des expéditions : armes contre les bêtes sauvages, cordes contre les chutes, torches dans le noir, barques sur
 * l'eau vive, trousse de soins. Le village les fabrique (du minerai pour le métal, un atelier pour les épées et les fusils ;
 * en défi, du bois et de la pierre pour le reste) ; une équipe emporte le meilleur de ce qu'il y a en réserve contre les
 * dangers de sa destination, et le rapporte au retour
 */

/** Dangers d'une expédition */
export type Danger = 'beast' | 'fall' | 'water' | 'dark' | 'weather' | 'monster';
export const DANGER_NAME: Record<Danger, string> = { beast: 'bêtes sauvages', fall: 'chutes', water: 'eau vive', dark: 'obscurité', weather: 'intempéries', monster: 'créatures des grottes' };
/** « Contre les bêtes sauvages », « Sur l'eau vive »… */
export const DANGER_VS: Record<Danger, string> = { beast: 'Contre les bêtes sauvages', fall: 'Contre les chutes', water: 'Sur l’eau vive', dark: 'Dans le noir', weather: 'Contre les intempéries', monster: 'Contre les créatures des grottes' };

export type GearId = 'spear' | 'bow' | 'sword' | 'rifle' | 'rope' | 'torch' | 'boat' | 'kit' | 'armor';

export interface Gear {
  id: GearId;
  name: string;
  plural: string;
  /** icône au trait (ui/icons) */
  icon: string;
  /** âge à partir duquel on sait le fabriquer */
  age: number;
  /** minerai par pièce */
  ore: number;
  /** bois et pierre par pièce, en défi seulement (les pièces sans métal, gratuites ailleurs) */
  wood?: number;
  stone?: number;
  /** temps de fabrication d'une pièce (secondes de jeu) */
  time: number;
  /** bâtiment nécessaire pour le fabriquer */
  needs?: KindId;
  /** danger qu'il pare (null : la trousse, qui aide partout), et un second qu'il pare aussi (les armes : les créatures) */
  guards: Danger | null;
  also?: Danger;
  /** part du risque de ce danger qu'il retire quand toute l'équipe en est munie */
  cut: number;
  /** pièces qu'il faut pour une équipe de n */
  per: (n: number) => number;
  desc: string;
}

export const GEAR: Gear[] = [
  { id: 'spear', name: 'Lance', plural: 'Lances', icon: 'spear', age: 0, ore: 0, wood: 2, stone: 1, time: 10, guards: 'beast', also: 'monster', cut: 0.25, per: (n) => n, desc: 'Un bâton durci au feu, une pointe de silex : les bêtes y regardent à deux fois.' },
  { id: 'bow', name: 'Arc', plural: 'Arcs', icon: 'bow', age: 1, ore: 0, wood: 4, time: 14, guards: 'beast', also: 'monster', cut: 0.38, per: (n) => n, desc: 'Tient les bêtes à distance, et rapporte parfois le dîner.' },
  { id: 'sword', name: 'Épée', plural: 'Épées', icon: 'sword', age: 2, ore: 1, time: 18, needs: 'workshop', guards: 'beast', also: 'monster', cut: 0.5, per: (n) => n, desc: 'Forgée à l’atelier : loups et sangliers n’ont qu’à bien se tenir.' },
  { id: 'rifle', name: 'Fusil', plural: 'Fusils', icon: 'rifle', age: 3, ore: 2, time: 22, needs: 'workshop', guards: 'beast', also: 'monster', cut: 0.65, per: (n) => n, desc: 'Un coup en l’air suffit souvent à disperser une meute.' },
  { id: 'rope', name: 'Corde', plural: 'Cordes', icon: 'rope', age: 0, ore: 0, wood: 2, time: 8, guards: 'fall', cut: 0.45, per: (n) => Math.ceil(n / 2), desc: 'On s’encorde deux par deux pour les passages au-dessus du vide.' },
  { id: 'torch', name: 'Torche', plural: 'Torches', icon: 'torch', age: 0, ore: 0, wood: 1, time: 6, guards: 'dark', cut: 0.45, per: (n) => Math.ceil(n / 2), desc: 'Pour ne pas se perdre dans les galeries.' },
  { id: 'boat', name: 'Barque', plural: 'Barques', icon: 'boat', age: 1, ore: 0, wood: 10, time: 30, guards: 'water', cut: 0.5, per: (n) => Math.ceil(n / 3), desc: 'Trois places : on traverse, on pêche au large, on passe les crues.' },
  { id: 'armor', name: 'Armure', plural: 'Armures', icon: 'shield', age: 2, ore: 2, time: 28, needs: 'workshop', guards: 'monster', cut: 0.6, per: (n) => n, desc: 'Cotte de mailles, casque et bouclier : griffes et crocs glissent dessus. De quoi affronter les monstres.' },
  { id: 'kit', name: 'Trousse de soins', plural: 'Trousses de soins', icon: 'kit', age: 2, ore: 1, time: 16, needs: 'health', guards: null, cut: 0.1, per: () => 1, desc: 'Un peu plus sûr partout ; les blessés guérissent deux fois plus vite.' },
];
export const GEAR_BY = Object.fromEntries(GEAR.map((g) => [g.id, g])) as Record<GearId, Gear>;

export interface GearCost { wood: number; stone: number; ore: number }

/** Prix d'une pièce : son minerai, et en défi le bois et la pierre des pièces sans métal */
export function gearCost(g: Gear, d: Difficulty): GearCost {
  const p = rulesOf(d).gearPrice;
  return { wood: p ? g.wood ?? 0 : 0, stone: p ? g.stone ?? 0 : 0, ore: g.ore };
}

/** « 2 bois et 1 pierre », « 1 minerai » ; vide pour une pièce gratuite */
export function gearCostLabel(c: GearCost) {
  const parts = [c.wood ? `${c.wood} bois` : '', c.stone ? `${c.stone} pierre` : '', c.ore ? `${c.ore} minerai` : ''].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}` : parts.join('');
}

/** Ce qui manque au village pour fabriquer cette pièce, à dire au joueur (null : de quoi payer, ou ressources illimitées) */
export function gearShort(w: World, g: Gear): string | null {
  if (w.unlimited) return null;
  const c = gearCost(g, w.difficulty);
  return w.wood < c.wood || w.stone < c.stone || w.ore < c.ore ? `Il faut ${gearCostLabel(c)}` : null;
}

/** Prélève le prix d'une pièce mise en fabrication ; `back` : le rend (pièce annulée). Rien en ressources illimitées */
export function payGear(w: World, g: Gear, back = false) {
  if (w.unlimited) return;
  const c = gearCost(g, w.difficulty), s = back ? -1 : 1;
  w.wood -= s * c.wood; w.stone -= s * c.stone; w.ore -= s * c.ore;
}

export type Stock = Record<GearId, number>;
export const emptyStock = (): Stock => ({ spear: 0, bow: 0, sword: 0, rifle: 0, rope: 0, torch: 0, boat: 0, kit: 0, armor: 0 });

/** Dangers selon la destination, quand le choix ne les précise pas */
const DEST_DANGER: Record<DestKind, Danger[]> = {
  plain: ['beast', 'weather'], forest: ['beast'], river: ['water'], mountain: ['fall', 'weather'], cave: ['dark', 'fall'], far: ['beast', 'weather'],
  spaceport: ['weather'],
};
export const dangersOf = (c: Choice): Danger[] => c.danger ?? DEST_DANGER[c.dest];

export type Pack = Partial<Record<GearId, number>>;

/**
 * Ce qu'une équipe emporte : contre chaque danger du choix, le meilleur équipement en réserve (autant de pièces que possible),
 * plus une trousse s'il y en a. `k` multiplie le risque : chaque danger compte pour sa part, paré d'autant que l'équipe est munie
 */
export function loadout(c: Choice, stock: Stock): { take: Pack; k: number } {
  const take: Pack = {}, ds = dangersOf(c);
  let cut = 0;
  for (const d of ds) {
    const best = GEAR.filter((g) => (g.guards === d || g.also === d) && stock[g.id] > 0 && !take[g.id]).sort((a, b) => b.cut - a.cut)[0];
    if (!best) continue;
    const need = best.per(c.party), n = Math.min(need, stock[best.id]);
    take[best.id] = n;
    cut += best.cut * (n / need);
  }
  let k = 1 - cut / Math.max(1, ds.length);
  if (stock.kit > 0) { take.kit = 1; k *= 1 - GEAR_BY.kit.cut; }
  return { take, k };
}

/** Une pièce qui manque à une équipe : contre quel danger, combien il en faut, combien en réserve et en fabrication */
export interface GearGap { dangers: Danger[]; gear: Gear; need: number; have: number; queued: number }

/**
 * Ce qu'il faudrait fabriquer pour qu'une équipe parte bien munie : pour chaque danger du choix qu'aucune pièce en réserve ne
 * couvre en entier, la pièce la plus protectrice que le village sait faire (`usable` : l'atelier ou le lieu de soins est là)
 */
export function gearGaps(c: Choice, stock: Stock, queue: GearId[], age: number, usable: (g: Gear) => boolean): GearGap[] {
  const out: GearGap[] = [];
  for (const d of dangersOf(c)) {
    const cands = GEAR.filter((g) => (g.guards === d || g.also === d) && g.age <= age);
    if (!cands.length || cands.some((g) => stock[g.id] >= g.per(c.party))) continue;
    const pool = cands.filter(usable), pick = [...(pool.length ? pool : cands)].sort((a, b) => b.cut - a.cut)[0];
    const dup = out.find((o) => o.gear.id === pick.id);
    if (dup) dup.dangers.push(d);
    else out.push({ dangers: [d], gear: pick, need: pick.per(c.party), have: stock[pick.id], queued: queue.filter((q) => q === pick.id).length });
  }
  return out;
}

/** « 3 lances · 1 corde » */
export function packLabel(p: Pack) {
  return GEAR.filter((g) => (p[g.id] ?? 0) > 0).map((g) => `${p[g.id]} ${(p[g.id]! > 1 ? g.plural : g.name).toLowerCase()}`).join(' · ');
}
