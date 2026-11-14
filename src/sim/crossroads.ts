import { archipelagoOn } from '../world/expand';

/**
 * Le grand choix de la fin de l'Antiquité : une seule carte, trois réponses (les Enfers, explorer le monde, ni l'un ni
 * l'autre). C'est une condition du passage au Médiéval (`CHOICE_LABEL` dans `Sim.ageProgress`) : la carte s'ouvre quand
 * toutes les autres sont remplies, et « Ni l'un ni l'autre » compte comme un choix. Rien n'est exclusif : la voie non prise
 * se lance plus tard depuis l'onglet « Voies » des expéditions, que le jeu ne montre pas du doigt. Règles pures, sans
 * interface (voir `main.ts › stepCrossroads`, `ui/worldChoice.ts`)
 */

/** Le libellé de la condition de passage au Médiéval (texte français, traduit à l'affichage) */
export const CHOICE_LABEL = 'le grand choix';

/** Les deux voies */
export type Way = 'hell' | 'world';

/**
 * Où en est une voie : `none` : impossible sur cette carte (pas d'île du portail ; carte qui ne peut plus s'agrandir) ;
 * `open` : à prendre (le portail fermé, ou ouvert sans que le joueur ait choisi : l'expédition d'une ancienne partie, le bac à
 * sable ; tant qu'il n'a pas choisi, aucune invasion) ; `ask` : le portail est ouvert et le joueur l'a refermé ; `taken` :
 * prise (il affronte les démons)
 */
export type WayState = 'none' | 'open' | 'ask' | 'taken';

/** Ce que lisent ces règles du monde */
export interface CrossWorld {
  portal: unknown;
  portalOpen: boolean;
  isles: unknown;
  sandbox: boolean;
  /** le grand choix a été fait (ou n'a plus lieu d'être) : la carte ne s'ouvre plus d'elle-même */
  crossroads: boolean;
}

/** La voie des Enfers, d'après le portail et le choix PvE (`War.pve`) */
export function hellWay(w: Pick<CrossWorld, 'portal' | 'portalOpen'>, pve: 'ask' | 'on' | 'off'): WayState {
  if (!w.portal) return 'none';
  if (!w.portalOpen || pve === 'ask') return 'open';
  return pve === 'on' ? 'taken' : 'ask';
}

/** La voie du monde : l'archipel accepté, ou la carte qui peut encore s'agrandir (`canExplore`) */
export function worldWay(w: Pick<CrossWorld, 'isles'>, canExplore: boolean): WayState {
  if (archipelagoOn(w)) return 'taken';
  return canExplore ? 'open' : 'none';
}

/** Âge que le grand choix ouvre : on le fait à l'Antiquité (âge 1), pour passer au Médiéval */
export const CROSSROADS_AGE = 2;

/**
 * Le grand choix est-il déjà joué sans avoir été posé ? Un portail dont on affronte les démons ou qu'on a refermé, ou un
 * archipel déjà accepté, reste tel quel : la carte ne s'ouvre pas (un portail ouvert sans choix, lui, y tombe). Une carte où aucune voie n'est possible non plus. Vrai : marquer
 * `crossroads` et ne plus y revenir
 */
export function crossroadsSettled(w: CrossWorld, hell: WayState, world: WayState): boolean {
  if (w.crossroads) return true;
  if (hell === 'ask' || hell === 'taken' || world === 'taken') return true;
  return hell === 'none' && world === 'none';
}

/**
 * La carte du grand choix est-elle à montrer d'elle-même ? À l'Antiquité, quand toutes les autres conditions du passage au
 * Médiéval sont remplies (`othersDone`) ; plus loin (une ancienne partie passée sans lui), tout de suite. Jamais au bac à
 * sable (les voies sont dans l'onglet des expéditions), ni si le choix est fait ou une voie déjà prise
 */
export function crossroadsDue(w: CrossWorld, age: number, hell: WayState, world: WayState, othersDone: boolean): boolean {
  if (w.sandbox || crossroadsSettled(w, hell, world)) return false;
  return age >= CROSSROADS_AGE || (age === CROSSROADS_AGE - 1 && othersDone);
}

/** La condition de passage est-elle remplie ? (le choix fait, une voie déjà prise, ou aucune possible sur cette carte) */
export const crossroadsMet = crossroadsSettled;

/**
 * L'onglet « Voies » des expéditions : dès l'Antiquité (au bac à sable, tout de suite), dès qu'une voie existe sur la carte.
 * Avant le grand choix, ses voies y sont annoncées « pas encore » (`waysSoon`) ; le jeu ne mène jamais à l'onglet
 */
export function waysTabShown(w: Pick<CrossWorld, 'sandbox'>, age: number, hell: WayState, world: WayState): boolean {
  return (w.sandbox || age >= CROSSROADS_AGE - 1) && (hell !== 'none' || world !== 'none');
}

/** Les voies ne se prennent pas encore : le grand choix de la fin de l'Antiquité n'a pas eu lieu (jamais au bac à sable) */
export function waysSoon(w: Pick<CrossWorld, 'sandbox' | 'crossroads'>, age: number): boolean {
  return !w.sandbox && !w.crossroads && age < CROSSROADS_AGE;
}

/** L'état affiché d'une voie dans l'onglet : déjà ouverte, à prendre, pas encore, ou impossible sur cette carte */
export type WayBadge = 'taken' | 'free' | 'soon' | 'none';
export function wayBadge(st: WayState, soon: boolean): WayBadge {
  if (st === 'none') return 'none';
  if (st === 'taken') return 'taken';
  return soon ? 'soon' : 'free';
}
