import type { KindId } from '../build/catalog';

/**
 * Le bâton du fondateur (voir `docs/lore-enfers.md`) : le chef des nomades le plante au bord de la rivière dans le film
 * d'ouverture, il reste sur la grande place à travers les âges, les démons le volent quand le joueur prend la voie des Enfers
 * (juste avant la cinématique du portail) et on le reprend au roi démon. Ici, les règles pures : son état, la relecture des
 * anciennes parties, quand le vol se joue, le bonus
 */

/** Sur la place (`home`), volé par les démons (`stolen`), repris au roi (`back`) */
export type StaffState = 'home' | 'stolen' | 'back';

/** Le savoir-faire gardé dans `exp.perks` une fois le bâton repris : il porte le bonus */
export const STAFF_PERK = 'staff';
/** Le bonus du bâton repris : la production de bois, de pierre, de minerai et de briques × 1,2 */
export const STAFF_YIELD = 1.2;
export const STAFF_KINDS: readonly KindId[] = ['lumber', 'quarry', 'mine', 'brickworks'];

/** L'état relu d'une sauvegarde (absent ou inconnu : null, l'état se déduit alors de la partie, `staffOfOld`) */
export function readStaff(v: unknown): StaffState | null {
  return v === 'home' || v === 'stolen' || v === 'back' ? v : null;
}

/**
 * L'état du bâton d'une partie d'avant lui. Le royaume tombé : repris. Les Enfers déjà visités (ou la cinématique du portail
 * déjà vue) : volé, sans cinématique. Sinon sur la place : le vol viendra en son temps, juste avant la cinématique du portail ;
 * jamais à l'improviste
 */
export function staffOfOld(s: { kingFallen: boolean; hellSeen: boolean }): StaffState {
  if (s.kingFallen) return 'back';
  return s.hellSeen ? 'stolen' : 'home';
}

/** L'état tenu à jour : le royaume tombé, le bâton est repris quoi qu'il arrive (mode développeur, sauvegarde bricolée) */
export function staffNow(state: StaffState, kingFallen: boolean): StaffState {
  return kingFallen ? 'back' : state;
}

/**
 * Le bâton d'une partie chargée dont les Enfers sont déjà ouverts (les démons affrontés, `pve` à `on`, ou le portail refermé
 * depuis, `off`) : volé, sans cinématique. Jusqu'au 26 nov. 2026, le vol se jouait avant la carte du grand choix, et une
 * partie pouvait ouvrir les Enfers avec le bâton encore sur la place (sauvegardée entre le choix et la cinématique) ;
 * maintenant les Enfers ne s'ouvrent jamais sans lui
 */
export function staffOfOpen(staff: StaffState, hellOpened: boolean): StaffState {
  return staff === 'home' && hellOpened ? 'stolen' : staff;
}

/**
 * Le vol se joue-t-il avant la cinématique du portail ? Toujours si le bâton est encore sur la place : c'est la première
 * partie de cette cinématique, au moment où le joueur prend la voie des Enfers (grand choix, onglet « Grands choix », bac à
 * sable). Le vol n'a plus lieu avant la carte du grand choix (retour de l'auteur, 26 nov. 2026) : « Explorer le monde » et
 * « Ni l'un ni l'autre » laissent le bâton sur la place
 */
export function theftBeforePortal(staff: StaffState): boolean {
  return staff === 'home';
}

/** La production de ce bâtiment × le bonus du bâton repris */
export function staffYield(w: { exp: { perks: readonly string[] } }, kind: KindId): number {
  return w.exp.perks.includes(STAFF_PERK) && STAFF_KINDS.includes(kind) ? STAFF_YIELD : 1;
}
