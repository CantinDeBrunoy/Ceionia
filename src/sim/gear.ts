import type { KindId } from '../build/catalog';
import type { Choice, DestKind } from './missions';

/**
 * Équipement des expéditions : armes contre les bêtes sauvages, cordes contre les chutes, torches dans le noir, barques sur
 * l'eau vive, trousse de soins. Le village les fabrique (du minerai pour le métal, un atelier pour les épées et les fusils) ;
 * une équipe emporte le meilleur de ce qu'il y a en réserve contre les dangers de sa destination, et le rapporte au retour
 */

/** Dangers d'une expédition */
export type Danger = 'beast' | 'fall' | 'water' | 'dark' | 'weather';
export const DANGER_NAME: Record<Danger, string> = { beast: 'bêtes sauvages', fall: 'chutes', water: 'eau vive', dark: 'obscurité', weather: 'intempéries' };
/** « Contre les bêtes sauvages », « Sur l'eau vive »… */
export const DANGER_VS: Record<Danger, string> = { beast: 'Contre les bêtes sauvages', fall: 'Contre les chutes', water: 'Sur l’eau vive', dark: 'Dans le noir', weather: 'Contre les intempéries' };

export type GearId = 'spear' | 'bow' | 'sword' | 'rifle' | 'rope' | 'torch' | 'boat' | 'kit';

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
  /** temps de fabrication d'une pièce (secondes de jeu) */
  time: number;
  /** bâtiment nécessaire pour le fabriquer */
  needs?: KindId;
  /** danger qu'il pare (null : la trousse, qui aide partout) */
  guards: Danger | null;
  /** part du risque de ce danger qu'il retire quand toute l'équipe en est munie */
  cut: number;
  /** pièces qu'il faut pour une équipe de n */
  per: (n: number) => number;
  desc: string;
}

export const GEAR: Gear[] = [
  { id: 'spear', name: 'Lance', plural: 'Lances', icon: 'spear', age: 0, ore: 0, time: 10, guards: 'beast', cut: 0.25, per: (n) => n, desc: 'Un bâton durci au feu, une pointe de silex : les bêtes y regardent à deux fois.' },
  { id: 'bow', name: 'Arc', plural: 'Arcs', icon: 'bow', age: 1, ore: 0, time: 14, guards: 'beast', cut: 0.38, per: (n) => n, desc: 'Tient les bêtes à distance, et rapporte parfois le dîner.' },
  { id: 'sword', name: 'Épée', plural: 'Épées', icon: 'sword', age: 2, ore: 1, time: 18, needs: 'workshop', guards: 'beast', cut: 0.5, per: (n) => n, desc: 'Forgée à l’atelier : loups et sangliers n’ont qu’à bien se tenir.' },
  { id: 'rifle', name: 'Fusil', plural: 'Fusils', icon: 'rifle', age: 3, ore: 2, time: 22, needs: 'workshop', guards: 'beast', cut: 0.65, per: (n) => n, desc: 'Un coup en l’air suffit souvent à disperser une meute.' },
  { id: 'rope', name: 'Corde', plural: 'Cordes', icon: 'rope', age: 0, ore: 0, time: 8, guards: 'fall', cut: 0.45, per: (n) => Math.ceil(n / 2), desc: 'On s’encorde deux par deux pour les passages au-dessus du vide.' },
  { id: 'torch', name: 'Torche', plural: 'Torches', icon: 'torch', age: 0, ore: 0, time: 6, guards: 'dark', cut: 0.45, per: (n) => Math.ceil(n / 2), desc: 'Pour ne pas se perdre dans les galeries.' },
  { id: 'boat', name: 'Barque', plural: 'Barques', icon: 'boat', age: 1, ore: 0, time: 30, guards: 'water', cut: 0.5, per: (n) => Math.ceil(n / 3), desc: 'Trois places : on traverse, on pêche au large, on passe les crues.' },
  { id: 'kit', name: 'Trousse de soins', plural: 'Trousses de soins', icon: 'kit', age: 2, ore: 1, time: 16, needs: 'health', guards: null, cut: 0.1, per: () => 1, desc: 'Un peu plus sûr partout ; les blessés guérissent deux fois plus vite.' },
];
export const GEAR_BY = Object.fromEntries(GEAR.map((g) => [g.id, g])) as Record<GearId, Gear>;

export type Stock = Record<GearId, number>;
export const emptyStock = (): Stock => ({ spear: 0, bow: 0, sword: 0, rifle: 0, rope: 0, torch: 0, boat: 0, kit: 0 });

/** Dangers selon la destination, quand le choix ne les précise pas */
const DEST_DANGER: Record<DestKind, Danger[]> = {
  plain: ['beast', 'weather'], forest: ['beast'], river: ['water'], mountain: ['fall', 'weather'], cave: ['dark', 'fall'], far: ['beast', 'weather'],
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
    const best = GEAR.filter((g) => g.guards === d && stock[g.id] > 0).sort((a, b) => b.cut - a.cut)[0];
    if (!best) continue;
    const need = best.per(c.party), n = Math.min(need, stock[best.id]);
    take[best.id] = n;
    cut += best.cut * (n / need);
  }
  let k = 1 - cut / Math.max(1, ds.length);
  if (stock.kit > 0) { take.kit = 1; k *= 1 - GEAR_BY.kit.cut; }
  return { take, k };
}

/** « 3 lances · 1 corde » */
export function packLabel(p: Pack) {
  return GEAR.filter((g) => (p[g.id] ?? 0) > 0).map((g) => `${p[g.id]} ${(p[g.id]! > 1 ? g.plural : g.name).toLowerCase()}`).join(' · ');
}
