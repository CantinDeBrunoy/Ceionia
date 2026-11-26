import type { KindId } from '../build/catalog';

/**
 * Le bâton du fondateur (voir `docs/lore-enfers.md`) : le chef des nomades le plante au bord de la rivière dans le film
 * d'ouverture, il reste sur la grande place à travers les âges, les démons le volent à la fin de l'Antiquité et on le reprend
 * au roi démon. Ici, les règles pures : son état, la relecture des anciennes parties, quand le vol se joue, le bonus
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
 * déjà vue) : volé, sans cinématique. Sinon sur la place : le vol viendra en son temps, à la carte du grand choix (encore à
 * l'Antiquité) ou juste avant la cinématique du portail ; jamais à l'improviste
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
 * Le vol se joue-t-il avant la carte du grand choix ? Le bâton est sur la place, la voie des Enfers existe sur cette carte
 * (sinon le vol n'a pas de suite), et le village est encore à l'Antiquité (`age < crossroadsAge`) : une ancienne partie déjà
 * au Médiéval qui voit la carte tard ne le voit pas là, mais juste avant la cinématique du portail, si elle prend les Enfers
 */
export function theftBeforeChoice(s: { staff: StaffState; hellPossible: boolean; age: number; crossroadsAge: number }): boolean {
  return s.staff === 'home' && s.hellPossible && s.age < s.crossroadsAge;
}

/** Le vol se joue-t-il avant la cinématique du portail ? Toujours si le bâton est encore sur la place */
export function theftBeforePortal(staff: StaffState): boolean {
  return staff === 'home';
}

/** La production de ce bâtiment × le bonus du bâton repris */
export function staffYield(w: { exp: { perks: readonly string[] } }, kind: KindId): number {
  return w.exp.perks.includes(STAFF_PERK) && STAFF_KINDS.includes(kind) ? STAFF_YIELD : 1;
}
