import { tr } from '../i18n';
import { hudPic } from './pics';

/**
 * La carte « Explorer le monde » : au passage au Médiéval (ou au chargement d'une partie qui l'a passé), une seule fois par
 * partie, elle propose d'agrandir le monde à l'archipel (deux îles et leurs peuples, au-delà de l'horizon). Rien n'oblige :
 * « Rester sur mon île » garde la partie telle quelle (pas d'îles, pas d'or), et une ligne du rayon Production permet
 * d'accepter plus tard. Même habillage que la carte du portail (`portalChoice.ts`), avec le diorama de la caravelle
 */
export class WorldChoice {
  private el: HTMLElement;

  constructor(root: HTMLElement, private host: { click(): void; explore(): void; stay(): void }) {
    this.el = document.createElement('div');
    this.el.id = 'worldChoice';
    this.el.className = 'panel';
    this.el.style.display = 'none';
    this.el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (!a) return;
      this.host.click();
      this.hide();
      if (a === 'go') this.host.explore(); else this.host.stay();
    });
    root.append(this.el);
  }

  get visible() { return this.el.style.display !== 'none'; }

  show() {
    const choice = (a: string, cls: string, icon: string, title: string, sub: string) => `<button data-a="${a}" class="${cls}">${hudPic(icon, 34)}<span><b>${title}</b><small>${sub}</small></span></button>`;
    this.el.innerHTML = `<img class="pcDio" src="./expeditions/dio-caravel.webp" alt="" draggable="false">
      <h4>${tr('Explorer le monde ?')}</h4>
      <p class="pcSub">${tr('Au-delà de l’horizon, d’autres îles et d’autres peuples.')}</p>
      <div class="pcHow"><p>${tr('Le monde s’agrandit : votre île reste telle quelle, et la mer s’ouvre sur deux grandes îles, chacune avec son peuple, et quelques îlots.')}</p></div>
      <small class="pcNote">${tr('Vous pourrez changer d’avis dans le rayon Production.')}</small>
      <div class="pcBtns">${choice('go', 'pcGo', 'boussole', tr('Explorer le monde'), tr('de nouvelles terres à découvrir'))}${choice('stay', 'pcNo', 'village', tr('Rester sur mon île'), tr('continuer comme avant'))}</div>`;
    this.el.style.display = '';
  }

  hide() { this.el.style.display = 'none'; }
}
