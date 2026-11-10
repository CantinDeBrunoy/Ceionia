/**
 * Préparation de la scène derrière l'écran de chargement : les programmes encore en compilation, et le moment où les
 * premières images passent assez vite pour lever l'écran. Logique pure (pas de three.js) : testable
 */

/** Une image « fluide » : rendue en moins de ce temps (ms) */
export const SMOOTH_MS = 40;
/** Images fluides de suite qu'il faut avant de lever l'écran */
export const SMOOTH_RUN = 4;
/** Images d'essai au plus (ms en tout) : une machine lente ne reste pas bloquée derrière l'écran */
export const WARM_MAX_MS = 3000;

/** Les premières images, une à une : `feed` dit quand l'écran de chargement peut se lever */
export class WarmUp {
  private run = 0;
  private spent = 0;

  /** Une image de `ms` : true quand assez d'images fluides se sont suivies (ou que l'essai a assez duré) */
  feed(ms: number): boolean {
    this.spent += ms;
    this.run = ms < SMOOTH_MS ? this.run + 1 : 0;
    return this.run >= SMOOTH_RUN || this.spent >= WARM_MAX_MS;
  }
}

/** Un programme (shader) du moteur : prêt quand sa compilation est finie (toujours prêt si le navigateur ne compile pas en parallèle) */
export interface Compiling { isReady(): boolean }

/** Programmes encore en cours de compilation (les prêts sont retirés de la liste) */
export function stillCompiling(list: Compiling[]): number {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].isReady()) list.splice(i, 1);
  return list.length;
}
