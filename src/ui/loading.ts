import { tr } from '../i18n';

/**
 * Écran de chargement : le nom du jeu, l'étape en cours et une barre, aux couleurs de l'accueil. Il couvre la vue pendant le
 * chargement des modèles et la préparation du monde (construction, shaders du jour et de la nuit, premières images), puis
 * s'efface en fondu : la partie tourne déjà dessous. Aucune durée minimale : un chargement rapide reste rapide
 */
export class LoadingScreen {
  readonly el: HTMLElement;
  private label: HTMLElement;
  private bar: HTMLElement;
  /** avancée affichée (la barre ne recule jamais) */
  private k = 0;

  constructor(root: HTMLElement) {
    const el = (this.el = document.createElement('div'));
    el.id = 'loadScreen';
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="ldBox"><h1>Ceionia</h1><p class="ldStep"></p><div class="ldBar"><i></i></div></div>`;
    this.label = el.querySelector('.ldStep')!;
    this.bar = el.querySelector('.ldBar i')!;
    root.appendChild(el);
  }

  /** Étape en cours (texte français, traduit ici ; `detail` ajouté tel quel) et avancée de la barre, de 0 à 1 */
  step(label: string, k: number, detail = '') {
    const text = detail ? `${tr(label)} ${detail}` : tr(label);
    if (this.label.textContent !== text) this.label.textContent = text;
    this.k = Math.max(this.k, Math.min(1, k));
    this.bar.style.width = `${Math.round(this.k * 1000) / 10}%`;
  }

  /** La scène est prête : l'écran s'efface en fondu, puis disparaît (`now` : tout de suite, sans fondu) */
  done(now = false) {
    if (now) { this.el.remove(); return; }
    this.k = 1;
    this.bar.style.width = '100%';
    this.el.classList.add('out');
    setTimeout(() => this.el.remove(), 600);
  }
}

/** Attend que le navigateur ait affiché l'écran (avant un long calcul qui le figerait sans qu'on l'ait vu) */
export const painted = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
