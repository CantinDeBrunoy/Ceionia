import { tr } from '../i18n';
import { hudPic } from './pics';
import type { People } from '../world/archipelago';
import { DiploState, Path, isleName, peopleName, rivalOf } from '../sim/diplomacy';

/**
 * Les cartes de la diplomatie de l'archipel, dans le style de la carte du choix du portail (parchemin bordé d'or, titre en
 * Fraunces, deux ou trois grands choix) :
 * - **le choix de l'allié**, à la fin de la cinématique des îles : les deux peuples côte à côte, chacun avec son blason, son
 *   île et ses mœurs ; le choix est obligatoire et définitif (la carte n'a pas de croix) ;
 * - **le dénouement**, au Médiéval (une fois l'allié installé chez lui) : négocier la paix (une ambassade, puis la
 *   cinématique de la paix) ou aider notre allié (une expédition militaire, puis la bataille). Il faut régler le conflit pour
 *   passer à l'Industriel. Elle s'ouvre d'elle-même une fois, quand le reste du passage est rempli ; « Plus tard » la referme
 *   (on reste au Médiéval). On la rouvre depuis la condition du panneau des âges, le conseil, l'onglet « Grands choix » ou la
 *   ligne en tête du rayon Vie ; on peut changer de voie tant que la bataille n'est pas engagée
 */
export class DiploChoice {
  private el: HTMLElement;
  private mode: 'ally' | 'path' = 'ally';

  constructor(root: HTMLElement, private host: { diplo(): DiploState; click(): void; ally(p: People): void; path(p: Path): void }) {
    this.el = document.createElement('div');
    this.el.id = 'diploChoice';
    this.el.className = 'panel';
    this.el.style.display = 'none';
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!b) return;
      this.host.click();
      const a = b.dataset.a!;
      this.hide();
      if (a === 'orient' || a === 'asie') this.host.ally(a);
      else if (a === 'peace' || a === 'war') this.host.path(a);
    });
    root.append(this.el);
  }

  get visible() { return this.el.style.display !== 'none'; }

  /** La carte du choix de l'allié */
  showAlly() { this.mode = 'ally'; this.render(); this.el.style.display = ''; }
  /** La carte du dénouement */
  showPath() { this.mode = 'path'; this.render(); this.el.style.display = ''; }

  private render() {
    const d = this.host.diplo();
    const choice = (a: string, cls: string, icon: string, title: string, sub: string, on = false) => `<button data-a="${a}" class="${cls}${on ? ' on' : ''}">${icon}<span><b>${title}</b><small>${sub}</small></span></button>`;
    if (this.mode === 'ally') {
      const card = (p: People) => choice(p, 'pcGo dcPeople', crest(p), cap(peopleName(p)), p === 'orient'
        ? tr('{isle} : dunes, palmiers et coupoles blanches ; marchands et navigateurs', { isle: cap(isleName(p)) })
        : tr('{isle} : forêts humides, pitons et pagodes ; artisans et jardiniers', { isle: cap(isleName(p)) }));
      this.el.innerHTML = `<div class="dcCrests">${crest('orient', 64)}${crest('asie', 64)}</div>
        <h4>${tr('Choisissez votre allié')}</h4>
        <p class="pcSub">${tr('Les Sablais et les Jadéens se font la guerre. Avec lequel de ces peuples ferez-vous alliance ?')}</p>
        <div class="pcBtns dcCol">${card('orient')}${card('asie')}</div>
        <small class="pcNote">${tr('Ce choix est définitif. Votre allié accueillera votre cosmodrome.')}</small>`;
      return;
    }
    const ally = d.ally ?? 'orient', rival = rivalOf(ally);
    this.el.innerHTML = `<div class="dcCrests">${crest(ally, 64)}<span class="dcVs">⚔</span>${crest(rival, 64)}</div>
      <h4>${tr('Le conflit des deux îles')}</h4>
      <p class="pcSub">${tr('Nos alliés, {ally}, sont toujours en guerre contre {rival}. Que fera notre village ?', { ally: peopleName(ally), rival: peopleName(rival) })}</p>
      <div class="pcBtns dcCol">
        ${choice('peace', 'pcGo', hudPic('parchemin', 34), tr('Négocier la paix'), tr('une ambassade, sans risque : un comptoir, un monument, une fête'), d.path === 'peace')}
        ${choice('war', 'pcNo', hudPic('militaire', 34), tr('Aider notre allié'), tr('une expédition militaire, puis la bataille : butin et tribut d’or'), d.path === 'war')}
        ${choice('later', 'pcNo dcLater', hudPic('sablier', 34), tr('Plus tard'), tr('rester au Médiéval et continuer à jouer'))}
      </div>
      <small class="pcNote">${tr('Il faut régler ce conflit pour passer à l’âge suivant. Pour y revenir : la condition « le conflit des deux îles », ou l’onglet « Grands choix » des expéditions.')}</small>`;
  }

  hide() { this.el.style.display = 'none'; }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Le blason d'un peuple, dessiné : un écu turquoise et sable à coupole et croissant pour les Sablais, un écu rouge laqué à
 * toit de pagode pour les Jadéens
 */
export function crest(p: People, size = 40) {
  const shield = 'M20 3 L35 8 V20 C35 29 28 35 20 38 C12 35 5 29 5 20 V8 Z';
  const body = p === 'orient'
    ? `<path d="${shield}" fill="#2aa8a0" stroke="#d9a955" stroke-width="2"/><path d="M11 29 H29 V25 H11 Z" fill="#f4e6c4"/><path d="M13 25 C13 17 27 17 27 25 Z" fill="#f8f6f0"/><path d="M20 13 V17" stroke="#e8b84a" stroke-width="2"/><circle cx="20" cy="12" r="2" fill="#e8b84a"/>`
    : `<path d="${shield}" fill="#c0392e" stroke="#d9a955" stroke-width="2"/><path d="M9 18 Q20 12 31 18 L27 18 L27 20 L13 20 L13 18 Z" fill="#2f7a5a"/><path d="M11 25 Q20 20 29 25 L25 25 L25 30 L15 30 L15 25 Z" fill="#2f7a5a"/><path d="M20 9 V14" stroke="#e8b84a" stroke-width="2"/>`;
  return `<svg class="dcCrest" width="${size}" height="${size}" viewBox="0 0 40 41" aria-hidden="true">${body}</svg>`;
}
