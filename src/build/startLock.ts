import type { KindId } from './catalog';

/** Le bâtiment de départ : le feu de camp (la place du village), seul à poser dans un village vide */
export const START_KIND: KindId = 'gather';

/** Un village sans aucun bâtiment : tant que la place n'est pas posée, tout le reste est verrouillé (même hors tutoriel, même en bac à sable) */
export const isStart = (w: { buildings: { size: number } }) => w.buildings.size === 0;

/**
 * Pourquoi un outil est refusé dans un village vide (null : permis). Seul « ne rien tenir » et le bâtiment de départ passent ;
 * le relief, la nature, les routes, la démolition, le déplacement et tout autre bâtiment attendent la première pose.
 * `name` : le nom du bâtiment de départ à l'âge courant
 */
export function startRefusal(w: { buildings: { size: number } }, tool: string, kind: KindId | undefined, name: string): string | null {
  if (!isStart(w) || tool === 'none' || (tool === 'build' && kind === START_KIND)) return null;
  return startMessage(name);
}

export const startMessage = (name: string) => `Posez d’abord « ${name} » : c’est la place du village`;
