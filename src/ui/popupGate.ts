/**
 * Porte des fenêtres qui s'ouvrent d'elles-mêmes (carte du portail, « Explorer le monde », conseils de guerre) : une seule à
 * la fois, jamais par-dessus une autre fenêtre. Elle est fermée tant que le jeu est occupé (une fenêtre ouverte, un fondu,
 * une cinématique, l'écran de chargement…), pendant un délai demandé (`hold` : la fenêtre d'un nouvel âge s'ouvre quelques
 * secondes après le passage), et ne s'ouvre qu'après `CALM` secondes de calme de suite : deux fenêtres ne s'enchaînent pas
 * dans la même image
 */
export const CALM = 1.2;

export class PopupGate {
  private calm = 0;
  private until = 0;
  private t = 0;

  /** Garde la porte fermée `secs` secondes à partir de maintenant (au moins) */
  hold(secs: number) { this.until = Math.max(this.until, this.t + secs); }

  /** Un pas de temps réel ; `busy` : le jeu montre déjà quelque chose */
  step(dt: number, busy: boolean) {
    this.t += dt;
    this.calm = busy || this.t < this.until ? 0 : this.calm + dt;
  }

  /** Une fenêtre automatique peut-elle s'ouvrir maintenant ? (celle qui s'ouvre referme la porte : elle compte comme occupée) */
  get open() { return this.calm >= CALM; }

  /** Une fenêtre vient de s'ouvrir : la suivante attendra qu'elle se ferme, puis le calme */
  taken() { this.calm = 0; }
}
