import type { World } from '../world/world';
import type { Underground } from '../world/underground';

/**
 * Le camp souterrain : sous terre on ne bâtit pas, le camp grandit tout seul à mesure qu'on accomplit ses quêtes. Il se dresse
 * au pied du puits du premier avant-poste ; chaque quête accomplie lui ajoute des bâtiments et des gardes, posés d'eux-mêmes,
 * et un avantage durable pour les expéditions armées
 */

/** Ce que mesurent les quêtes : galeries tenues, filons abattus, embuscades repoussées, zones où l'on tient des galeries */
export interface DepthStats { held: number; veins: number; wins: number; zones: number }

export interface CampQuest {
  id: string;
  title: string;
  text: string;
  /** objectif : valeur atteinte et cible */
  goal: (s: DepthStats) => [number, number];
  /** ce que le camp y gagne, et l'avantage qui en découle */
  builds: string;
  perk: string;
}

export const CAMP_QUESTS: CampQuest[] = [
  {
    id: 'camp', title: 'Le premier camp', text: 'Bâtir un avant-poste devant une grotte ou une faille : sa garnison descend dresser le camp au pied du puits.',
    goal: (s) => [Math.min(1, s.held), 1], builds: 'tentes, feu de camp, réserve de vivres et deux gardes',
    perk: 'Les expéditions armées partent du camp : plus de marche depuis le village jusqu’à l’avant-poste.',
  },
  {
    id: 'hold', title: 'Tenir les galeries', text: 'Étendre les galeries tenues : chaque expédition armée victorieuse prend les galeries jusqu’à son front (12 cases plus loin à cheval, 9 en armure, 6 avec les mineurs).',
    goal: (s) => [s.held, 150], builds: 'tour de guet, barricades, bannière et deux gardes de plus',
    perk: 'Les guetteurs repèrent les embuscades : les créatures sont moins redoutables (−15 %).',
  },
  {
    id: 'veins', title: 'Les premiers filons', text: 'Abattre des filons : chaque expédition armée victorieuse abat ceux de son chemin (jusqu’à 6 en armure, 4 à cheval, 3 avec les mineurs).',
    goal: (s) => [s.veins, 8], builds: 'forge, rails et wagonnets, tas de minerai',
    perk: 'Chaque filon abattu rapporte 1 minerai de plus.',
  },
  {
    id: 'horde', title: 'Repousser la horde', text: 'Sortir victorieux des embuscades tendues aux expéditions armées dans les galeries sauvages : armures, armes et torches y aident.',
    goal: (s) => [s.wins, 3], builds: 'caserne, braseros et deux gardes de plus',
    perk: 'Les troupes armées partent mieux entraînées : force au combat +2.',
  },
  {
    id: 'zones', title: 'Au cœur des profondeurs', text: 'Tenir des galeries dans trois zones différentes (roche, cristal, glace, grotte luxuriante ou magma), en poussant le front d’expédition en expédition.',
    goal: (s) => [s.zones, 3], builds: 'infirmerie et lampes de cristal',
    perk: 'Les blessés des expéditions armées guérissent deux fois plus vite.',
  },
  {
    id: 'base', title: 'La grande base', text: 'Tenir 600 cases de galeries.',
    goal: (s) => [s.held, 600], builds: 'monte-charge vers la surface et deux gardes de plus',
    perk: 'Le monte-charge remonte 2 minerai par jour.',
  },
  {
    id: 'all', title: 'Les cinq profondeurs', text: 'Tenir des galeries dans les cinq zones du souterrain : roche, cristal, glace, grotte luxuriante et magma.',
    goal: (s) => [s.zones, 5], builds: 'sanctuaire au cristal lumineux',
    perk: 'Le village est fier de ses profondeurs : bien-être +3, pour toujours.',
  },
  {
    id: 'mine', title: 'La grande mine', text: 'Abattre 30 filons dans les galeries.',
    goal: (s) => [s.veins, 30], builds: 'fonderie et entrepôt',
    perk: 'La fonderie tire encore 1 minerai de plus de chaque filon abattu.',
  },
  {
    id: 'realm', title: 'Le royaume souterrain', text: 'Tenir 1 000 cases de galeries.',
    goal: (s) => [s.held, 1000], builds: 'donjon de pierre, statue du premier chevalier et quatre gardes de plus',
    perk: 'Les galeries sont sûres : les créatures des embuscades sont bien moins redoutables (−30 % en tout), et les troupes plus fortes encore (+2).',
  },
];

/**
 * Rente du sous-sol : une fois le camp dressé, les galeries tenues et les filons abattus rapportent chaque jour, pour toujours,
 * de la pierre (galeries étayées, déblais) et du minerai (filons exploités) : 1 pierre pour 40 cases tenues, 1 minerai pour 4 filons
 */
export const HELD_PER_STONE = 40, VEINS_PER_ORE = 4;
export function depthIncome(w: World, camp: number): { stone: number; ore: number } {
  if (camp < 1) return { stone: 0, ore: 0 };
  return { stone: Math.floor(w.claimed.size / HELD_PER_STONE), ore: Math.floor(w.mined.size / VEINS_PER_ORE) };
}

/** Bien-être que le village tire de ses profondeurs, une fois la quête « Les cinq profondeurs » accomplie (niveau 7 du camp) */
export const CAMP_JOY = 3; // (le texte de la quête « all » le dit en clair)

/** Gardes du camp selon son niveau (nombre de quêtes accomplies) */
export const CAMP_GUARDS = [0, 2, 4, 4, 6, 6, 8, 8, 8, 12];

/** Mesures des quêtes (les zones ne se comptent qu'avec le monde souterrain) */
export function depthStats(w: World, u: Underground | null): DepthStats {
  const zones = new Set<number>();
  if (u) for (const k of w.claimed) zones.add(u.zone[k]);
  return { held: w.claimed.size, veins: w.mined.size, wins: w.exp.wins, zones: zones.size };
}
