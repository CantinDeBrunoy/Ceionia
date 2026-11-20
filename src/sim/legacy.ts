import type { KindId } from '../build/catalog';

/**
 * Ce que laisse une expédition réussie, quand ce n'est pas un bâtiment à bâtir : un savoir-faire durable (`exp.perks`), qui
 * change une règle du village pour toujours. Demande de l'auteur (nov. 2026) : plus aucune expédition ne doit laisser rien
 * derrière elle. La mission qui le rapporte, son nom court (la ligne « Débloque : … » de sa carte) et ce qu'il fait.
 * Les nombres sont ici, lus par la simulation (`sim.ts`, `expeditions.ts`, `ledger.ts`, `freight.ts`, `railway.ts`,
 * `coverage.ts`) et par le jeu (`main.ts` : volcan, catastrophes)
 */

export interface Legacy {
  /** le savoir-faire gardé dans `exp.perks` */
  perk: string;
  /** la mission qui le rapporte */
  mission: string;
  /** l'émoji, que `pic` remplace par son picto peint */
  icon: string;
  /** nom court, pour la carte de la mission (« Débloque : … ») */
  label: string;
}

export const LEGACIES: Legacy[] = [
  { perk: 'sulfur', mission: 'ascent', icon: '⛏', label: 'mines +30 %' },
  { perk: 'hounds', mission: 'wolf', icon: '💂', label: 'chiens de garde' },
  { perk: 'coalfire', mission: 'coal', icon: '🏭', label: 'fourneaux au charbon' },
  { perk: 'railfast', mission: 'railway', icon: '🚂', label: 'trains plus rapides' },
  { perk: 'dikes', mission: 'eruption', icon: '🛡', label: 'digues et tranchées' },
  { perk: 'meteo', mission: 'summit', icon: '⛈', label: 'station météo' },
  { perk: 'trawlers', mission: 'trawl', icon: '🎣', label: 'chalutiers' },
  { perk: 'cropisles', mission: 'seafarm', icon: '🏝', label: 'îles de culture' },
  { perk: 'satellites', mission: 'rocket', icon: '🚀', label: 'satellites' },
  { perk: 'spices', mission: 'spice', icon: '🌶', label: 'cuisine aux épices' },
];
export const legacyOf = (mission: string) => LEGACIES.find((l) => l.mission === mission) ?? null;

type Perks = { exp: { perks: readonly string[] } };
export const hasPerk = (w: Perks, perk: string) => w.exp.perks.includes(perk);

/** Monter au cratère : le soufre du cratère fait sauter la roche, les mines donnent plus de minerai */
export const SULFUR_MINE = 1.3;
/** Prospection de charbon : fourneaux au charbon, l'équipement se fabrique plus vite et les briqueteries cuisent davantage */
export const COAL_CRAFT = 1.25, COAL_BRICKS = 1.3;
/** Production d'un bâtiment de ressources selon les savoir-faire (mines, briqueteries) */
export function perkYield(w: Perks, kind: KindId) {
  if (kind === 'mine' && hasPerk(w, 'sulfur')) return SULFUR_MINE;
  if (kind === 'brickworks' && hasPerk(w, 'coalfire')) return COAL_BRICKS;
  return 1;
}

/** Le tracé du chemin de fer : trains plus rapides, et un train de marchandises qui fait produire ×2 au lieu de ×1,75 */
export const RAIL_SPEED = 1.25, RAIL_FREIGHT = 1.0;

/**
 * Le loup des bois : les gardes ont des chiens. Un chien suit chaque patrouille ; tours de garde et commissariats gardent
 * plus loin (`HOUND_RANGE` cases de plus) ; les expéditions face aux bêtes sont plus sûres
 */
export const HOUND_RANGE = 4, HOUND_BEAST = 0.9;
/** Les cases de plus que gardent police et tours de garde (voir `rangeOf`, `coverage.ts`) */
export const guardReach = (w: Perks) => (hasPerk(w, 'hounds') ? HOUND_RANGE : 0);

/** Expédition au sommet : la station météo prévient des intempéries, et les clubs alpins attirent plus de monde */
export const METEO_WEATHER = 0.8, METEO_ALPINE = 3;
/** Les épices : la cuisine relevée des tavernes */
export const SPICE_TAVERN = 2;
/** Bien-être en plus d'un bâtiment selon les savoir-faire (clubs alpins, tavernes), s'il en donne déjà à son âge */
export function perkJoy(w: Perks, kind: KindId) {
  if (kind === 'alpine' && hasPerk(w, 'meteo')) return METEO_ALPINE;
  if (kind === 'tavern' && hasPerk(w, 'spices')) return SPICE_TAVERN;
  return 0;
}

/** La pêche en haute mer : les chalutiers, pontons, ports et halles aux poissons nourrissent davantage */
export const TRAWL_FOOD = 1.3;
export const TRAWL_KINDS: KindId[] = ['pier', 'harbor', 'fishmarket'];
/** Les îles flottantes : les îles de culture ancrées autour des fermes marines */
export const ISLES_FOOD = 1.5;
/** Nourriture d'un bâtiment selon les savoir-faire */
export function perkFood(w: Perks, kind: KindId) {
  if (TRAWL_KINDS.includes(kind) && hasPerk(w, 'trawlers')) return TRAWL_FOOD;
  if (kind === 'offshore' && hasPerk(w, 'cropisles')) return ISLES_FOOD;
  return 1;
}

/** Premier vol de fusée : les satellites guident les navires (expéditions en mer plus sûres) et voient venir les volcans */
export const SAT_SEA = 0.9;
/** Le volcan qui se réveille tremble d'abord : 18 s, ou une minute avec les satellites */
export const WAKE_WARN = 18, SAT_WAKE_WARN = 60;
/** Les crues et les séismes (`calamities.ts`) : annoncés trois fois plus tôt avec les satellites ; la pluie de météorites, au soir
 * comme avec un observatoire */
export const SAT_CALAM_WARN = 3;

/**
 * Anciennes sauvegardes : une partie qui a déjà réussi une de ces expéditions en reçoit le savoir-faire au chargement
 * (`readExpState`)
 */
export function grantLegacies(done: readonly string[], perks: string[]) {
  for (const l of LEGACIES) if (done.includes(l.mission) && !perks.includes(l.perk)) perks.push(l.perk);
}
