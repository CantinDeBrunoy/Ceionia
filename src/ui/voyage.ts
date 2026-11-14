import { tr } from '../i18n';

/**
 * La cinématique « Explorer le monde » : elle remplace l'écran de chargement de l'agrandissement. Deux pièces :
 * - les bandes noires du cinéma (`Letterbox`), avec une légende dans la bande du bas : elles encadrent le départ vers le large,
 *   la traversée et le survol des îles ;
 * - la traversée (`VOYAGE_PLATE`) : la mer peinte en CSS, la caravelle qui tangue, la brume qui passe. Elle couvre la vue
 *   pendant que la partie est agrandie, rechargée et préparée (`LoadingScreen` en mode traversée), puis s'efface sur la mer
 *   des îles : la vue continue, sans écran de chargement entre les deux (voir `Game.exploreWorld`, `Game.revealIsles`)
 */

/** La traversée : ciel, soleil, houle, caravelle, brume (styles « La traversée » de `style.css`) */
export const VOYAGE_PLATE = `<div class="vyPlate" aria-hidden="true"><i class="vySun"></i><i class="vySea"></i><i class="vyWave w1"></i><i class="vyWave w2"></i>`
  + `<img class="vyShip" src="./expeditions/dio-caravel.webp" alt="" draggable="false"><i class="vyWave w3"></i><i class="vyMist m1"></i><i class="vyMist m2"></i></div>`;

/** Les bandes noires et la légende ; une seule à la fois dans la page */
export class Letterbox {
  readonly el: HTMLElement;
  private cap: HTMLElement;

  constructor(root: HTMLElement) {
    document.getElementById('cineBars')?.remove();
    const el = (this.el = document.createElement('div'));
    el.id = 'cineBars';
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<i class="cbTop"></i><div class="cbBot"><p></p></div>';
    this.cap = el.querySelector('p')!;
    root.appendChild(el);
    // (une image plus tard : les bandes glissent depuis les bords)
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  }

  /** La légende de la bande du bas (texte français, traduit ici ; vide : rien) */
  caption(text: string, sub = '') {
    this.cap.classList.remove('in');
    void this.cap.offsetWidth;
    this.cap.innerHTML = text ? `<b>${tr(text)}</b>${sub ? `<small>${tr(sub)}</small>` : ''}` : '';
    if (text) this.cap.classList.add('in');
  }

  /** Les bandes se retirent, puis disparaissent */
  close() {
    this.el.classList.remove('on');
    setTimeout(() => this.el.remove(), 900);
  }
}
