import { tr } from '../i18n';
import type { Way, WayState } from '../sim/crossroads';
import { hudPic } from './pics';

/** Ce que la carte demande au jeu */
export interface WorldChoiceHost {
  click(): void;
  /** où en sont les deux voies (voir `sim/crossroads.ts`) */
  ways(): { hell: WayState; world: WayState };
  /** « Les Enfers » : le portail s'ouvre, le joueur affronte les démons */
  hell(): void;
  /** « Explorer le monde » : la cinématique, puis le monde agrandi */
  world(): void;
  /** « Ni l'un ni l'autre » : on reste sur son île (le grand choix est fait) */
  neither(): void;
}

/**
 * La carte du grand choix, à la fin de l'Antiquité (au passage au Médiéval, ou au chargement d'une partie qui l'a passé sans
 * l'avoir vue) : une seule fois par partie, trois réponses. « Les Enfers » ouvre le portail et lance le volet PvE ;
 * « Explorer le monde » agrandit la carte à l'archipel ; « Ni l'un ni l'autre » garde la partie telle quelle. Rien n'est
 * exclusif : la voie non prise se lance plus tard depuis l'onglet « Grands choix » des expéditions, qui rouvre cette carte sur une
 * seule voie (`show(way)` : la voie et « Pas maintenant »). Même habillage que la carte du portail (`portalChoice.ts`)
 */
export class WorldChoice {
  private el: HTMLElement;

  constructor(root: HTMLElement, private host: WorldChoiceHost) {
    this.el = document.createElement('div');
    this.el.id = 'worldChoice';
    this.el.className = 'panel';
    this.el.style.display = 'none';
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-a]');
      const a = b?.dataset.a;
      if (!a || b.disabled) return;
      this.host.click();
      this.hide();
      if (a === 'hell') this.host.hell();
      else if (a === 'world') this.host.world();
      else if (a === 'neither') this.host.neither();
    });
    root.append(this.el);
  }

  get visible() { return this.el.style.display !== 'none'; }

  /** Ouvre la carte : le grand choix (sans `way`), ou une seule voie à prendre (depuis l'onglet des expéditions) */
  show(way?: Way) {
    this.el.innerHTML = way ? this.single(way) : this.grand();
    this.el.classList.toggle('grand', !way);
    this.el.classList.toggle('hellOne', way === 'hell');
    this.el.style.display = '';
  }

  hide() { this.el.style.display = 'none'; }

  /** Les trois réponses : les deux voies en tuiles illustrées, puis « Ni l'un ni l'autre » sur toute la largeur */
  private grand() {
    const ways = this.host.ways();
    const tile = (a: Way, img: string, icon: string, title: string, text: string, none: string) => {
      const off = ways[a] === 'none';
      return `<button data-a="${a}" class="wcWay ${a}"${off ? ' disabled' : ''}><img src="${img}" alt="" draggable="false"><span class="wcT">${hudPic(icon, 26)}<b>${title}</b></span><small>${off ? none : text}</small></button>`;
    };
    return `<button class="x wcX" data-a="close" aria-label="${tr('Fermer')}" title="${tr('Fermer : la carte se rouvre depuis la condition de l’âge suivant')}">✕</button>
      <h4>${tr('Le grand choix')}</h4>
      <p class="pcSub">${tr('L’Antiquité s’achève. Quelle voie pour votre peuple ?')}</p>
      <div class="wcWays">
        ${tile('hell', './ui/portail.webp', 'militaire', tr('Les Enfers'), tr('Le portail s’ouvre sur l’île au large : défendez-la contre les démons, puis passez de l’autre côté.'), tr('Cette carte n’a pas d’île du portail.'))}
        ${tile('world', './expeditions/dio-caravel.webp', 'boussole', tr('Explorer le monde'), tr('La carte s’agrandit : au-delà de l’horizon, deux grandes îles et leurs peuples.'), tr('Ce monde ne peut plus s’agrandir.'))}
      </div>
      <small class="pcNote">${tr('Il faut choisir pour passer au Médiéval. Rien n’est définitif : l’autre voie restera ouverte.')}</small>
      <div class="pcBtns"><button data-a="neither" class="pcNo">${hudPic('village', 34)}<span><b>${tr('Ni l’un ni l’autre')}</b><small>${tr('rester sur mon île et bâtir en paix')}</small></span></button></div>`;
  }

  /** Une seule voie, prise plus tard : son illustration, ce qu'elle fait, et « Pas maintenant » */
  private single(way: Way) {
    const choice = (a: string, cls: string, icon: string, title: string, sub: string) => `<button data-a="${a}" class="${cls}">${hudPic(icon, 34)}<span><b>${title}</b><small>${sub}</small></span></button>`;
    const later = choice('later', 'pcNo', 'village', tr('Pas maintenant'), tr('rester sur mon île'));
    if (way === 'hell') return `<img class="pcDio" src="./ui/portail.webp" alt="" draggable="false">
      <h4>${tr('Les Enfers')}</h4>
      <p class="pcSub">${tr('Ouvrir le portail de l’île au large ?')}</p>
      <div class="pcHow"><p>${tr('Des démons rôdent de l’autre côté. Pour les affronter, bâtissez une tour de garde et une caserne sur l’île du portail, puis recrutez une garnison.')}</p></div>
      <div class="pcBtns">${choice('hell', 'pcGo', 'militaire', tr('Ouvrir le portail'), tr('invasions, Enfers, royaume'))}${later}</div>`;
    return `<img class="pcDio" src="./expeditions/dio-caravel.webp" alt="" draggable="false">
      <h4>${tr('Explorer le monde ?')}</h4>
      <p class="pcSub">${tr('Au-delà de l’horizon, d’autres îles et d’autres peuples.')}</p>
      <div class="pcHow"><p>${tr('Le monde s’agrandit : votre île reste telle quelle, et la mer s’ouvre sur deux grandes îles, chacune avec son peuple, et quelques îlots.')}</p></div>
      <div class="pcBtns">${choice('world', 'pcGo', 'boussole', tr('Explorer le monde'), tr('de nouvelles terres à découvrir'))}${later}</div>`;
  }
}
