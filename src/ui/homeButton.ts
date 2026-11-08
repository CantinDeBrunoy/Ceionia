import { ic } from './icons';
import { tr } from '../i18n';

/**
 * La vue s'est éloignée de la grande place : la place sort de l'écran (`ndc` : sa position à l'écran, de -1 à 1, null quand
 * elle est derrière la caméra), ou le point visé en est loin, plus loin que ce que l'on voit autour de lui. Un peu de marge
 * pour revenir (`shown` : le bouton est déjà là) : il ne clignote pas au bord
 */
export function awayFromHome(d: number, camDist: number, ndc: { x: number; y: number } | null, shown = false): boolean {
  const edge = shown ? 0.9 : 1.05, far = Math.max(14, camDist * 0.75) * (shown ? 0.8 : 1);
  return !ndc || Math.abs(ndc.x) > edge || Math.abs(ndc.y) > edge || d > far;
}

/** Le bouton « Retourner au village », discret mais bien visible, au-dessus de la barre de construction */
export class HomeButton {
  el: HTMLButtonElement;
  shown = false;
  constructor(root: HTMLElement, onClick: () => void) {
    const b = (this.el = document.createElement('button'));
    b.id = 'homeBack';
    b.type = 'button';
    b.title = tr('Ramener la vue sur la grande place (touche V)');
    b.innerHTML = `${ic('house', 15, 2)}${tr('Retourner au village')}`;
    b.onclick = onClick;
    (root.querySelector('#dock') ?? root).prepend(b);
  }
  set(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.el.classList.toggle('on', on);
  }
}
