import { archipelagoOn } from '../world/expand';

/**
 * Le grand choix de la fin de l'Antiquité : une seule carte, trois réponses (les Enfers, explorer le monde, ni l'un ni
 * l'autre). Rien n'est exclusif : la voie non prise se lance plus tard depuis l'onglet « Voies » des expéditions, que le jeu
 * ne montre pas du doigt. Règles pures, sans interface (voir `main.ts › stepCrossroads`, `ui/worldChoice.ts`)
 */

/** Les deux voies */
export type Way = 'hell' | 'world';

/**
 * Où en est une voie : `none` : impossible sur cette carte (pas d'île du portail ; carte qui ne peut plus s'agrandir) ;
 * `open` : à prendre ; `ask` : le portail est ouvert mais le joueur n'affronte pas les démons (refermé, ou pas encore
 * choisi : ancienne partie, bac à sable) ; `taken` : prise
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
  if (!w.portalOpen) return 'open';
  return pve === 'on' ? 'taken' : 'ask';
}

/** La voie du monde : l'archipel accepté, ou la carte qui peut encore s'agrandir (`canExplore`) */
export function worldWay(w: Pick<CrossWorld, 'isles'>, canExplore: boolean): WayState {
  if (archipelagoOn(w)) return 'taken';
  return canExplore ? 'open' : 'none';
}

/** Âge où le grand choix s'ouvre : le passage au Médiéval */
export const CROSSROADS_AGE = 2;

/**
 * Le grand choix est-il déjà joué sans avoir été posé ? Un portail déjà ouvert (même refermé) ou un archipel déjà accepté
 * reste tel quel : la carte ne s'ouvre pas. Une carte où aucune voie n'est possible non plus. Vrai : marquer
 * `crossroads` et ne plus y revenir
 */
export function crossroadsSettled(w: CrossWorld, hell: WayState, world: WayState): boolean {
  if (w.crossroads) return true;
  if (hell === 'ask' || hell === 'taken' || world === 'taken') return true;
  return hell === 'none' && world === 'none';
}

/**
 * La carte du grand choix est-elle à montrer ? Une fois, au Médiéval ou après (une partie chargée déjà plus loin la voit
 * aussi), hors bac à sable (on y trouve les voies dans l'onglet des expéditions), si aucune voie n'est déjà prise
 */
export function crossroadsDue(w: CrossWorld, age: number, hell: WayState, world: WayState): boolean {
  return !w.sandbox && age >= CROSSROADS_AGE && !crossroadsSettled(w, hell, world);
}

/** L'onglet « Voies » des expéditions : au Médiéval et après (au bac à sable, tout de suite), dès qu'une voie existe */
export function waysTabShown(w: Pick<CrossWorld, 'sandbox'>, age: number, hell: WayState, world: WayState): boolean {
  return (w.sandbox || age >= CROSSROADS_AGE) && (hell !== 'none' || world !== 'none');
}
