import { tr } from '../i18n';
import { KINDS } from '../build/catalog';
import type { War } from '../sim/war';

/**
 * La carte du choix du portail : dès que l'expédition « Le portail de l'autre rive » a réussi (puis quand le joueur la rouvre
 * depuis la barre Militaire ou le commandement de l'île). Le PvE (l'invasion, les Enfers, le royaume) est une option :
 * « Affronter les démons » le joue (la vue va sur l'île, où l'on bâtit ses défenses : `fought`), « Refermer le portail »
 * continue le jeu sans lui. La carte dit d'avance ce que demande le combat : les défenses se bâtissent sur l'île, pas au village.
 * Elle ne s'ouvre seule qu'une fois par partie (`war.choiceSeen`).
 */
export class PortalChoice {
  private el: HTMLElement;

  constructor(root: HTMLElement, private host: { war: War; age(): number; click(): void; fought(): void }) {
    this.el = document.createElement('div');
    this.el.id = 'portalChoice';
    this.el.className = 'panel';
    this.el.style.display = 'none';
    this.el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (!a) return;
      this.host.click();
      const w = this.host.war;
      this.hide();
      if (a === 'fight') { w.acceptPve(); this.host.fought(); } else if (a === 'close') w.closePortal();
    });
    root.append(this.el);
  }

  get visible() { return this.el.style.display !== 'none'; }

  /** Ouvre la carte (celle du portail refermé propose de le garder fermé) */
  show() {
    const w = this.host.war, closed = w.pve === 'off', age = this.host.age();
    const name = (k: 'watchtower' | 'barracks') => KINDS[k].names[Math.max(age, KINDS[k].minAge)];
    w.choiceSeen = true;
    const how = tr('🗼 Pour les affronter : « {tower} » et « {barracks} » sur l’île du portail, pas au village, puis une garnison.', { tower: name('watchtower'), barracks: name('barracks') });
    this.el.innerHTML = `<h4>${closed ? tr('🔒 Portail fermé') : tr('🌀 Le portail est ouvert !')}</h4><p>${closed ? tr('Rouvrir le portail pour affronter les démons ?') : tr('Des démons rôdent de l’autre côté.')}</p><p class="how">${how}</p><small>${tr('Vous pourrez changer d’avis dans l’onglet Militaire.')}</small><div class="tcbtn"><button data-a="fight" class="go">${tr('Affronter les démons')}</button>${closed ? `<button data-a="keep">${tr('Garder le portail fermé')}</button>` : `<button data-a="close">${tr('Fermer le portail')}</button>`}</div>`;
    this.el.style.display = '';
  }

  hide() { this.el.style.display = 'none'; }
}
