/**
 * Préparation de la scène derrière l'écran de chargement : les programmes encore en compilation, et le moment où les
 * premières images passent assez vite pour lever l'écran. Logique pure (pas de three.js) : testable
 */

/** Une image « fluide » : rendue en moins de ce temps (ms) */
export const SMOOTH_MS = 40;
/**
 * Durée d'images fluides de suite (ms) qu'il faut avant de lever l'écran. Assez longue pour couvrir ce qui se bâtit ou se
 * compile juste après les premières images (bêtes, chemins, un shader tardif) : avec 4 images seulement, l'écran se levait
 * en 70 ms et les premiers à-coups tombaient sous les yeux du joueur
 */
export const SMOOTH_SPAN_MS = 1200;
/** Images d'essai au plus (ms en tout) : une machine lente ne reste pas bloquée derrière l'écran */
export const WARM_MAX_MS = 8000;

/** Les premières images, une à une : `feed` dit quand l'écran de chargement peut se lever */
export class WarmUp {
  private smooth = 0;
  private spent = 0;

  /** Une image de `ms` : true quand assez d'images fluides se sont suivies (ou que l'essai a assez duré) */
  feed(ms: number): boolean {
    this.spent += ms;
    // une image lente remet le compte à zéro
    this.smooth = ms < SMOOTH_MS ? this.smooth + ms : 0;
    return this.smooth >= SMOOTH_SPAN_MS || this.spent >= WARM_MAX_MS;
  }

  /** Avancée de 0 à 1, pour la barre : la série fluide en cours, ou le temps déjà passé si c'est plus */
  get progress() { return Math.min(1, Math.max(this.smooth / SMOOTH_SPAN_MS, this.spent / WARM_MAX_MS)); }
}

/** Un programme (shader) du moteur : prêt quand sa compilation est finie (toujours prêt si le navigateur ne compile pas en parallèle) */
export interface Compiling { isReady(): boolean }

/** Programmes encore en cours de compilation (les prêts sont retirés de la liste) */
export function stillCompiling(list: Compiling[]): number {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].isReady()) list.splice(i, 1);
  return list.length;
}
