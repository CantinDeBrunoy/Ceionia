import { tr } from '../i18n';
import type { War } from '../sim/war';

/**
 * La carte du choix du portail : dès que l'expédition « Le portail de l'autre rive » a réussi (puis quand le joueur la rouvre
 * depuis la barre Militaire ou le commandement de l'île). Le PvE (l'invasion, les Enfers, le royaume) est une option :
 * « Affronter les démons » le joue (le guidage prend le relais), « Refermer le portail » continue le jeu sans lui.
 * La carte ne s'ouvre seule qu'une fois par partie (`war.choiceSeen`).
 */
export class PortalChoice {
  private el: HTMLElement;

  constructor(root: HTMLElement, private host: { war: War; click(): void; toast(m: string): void }) {
    this.el = document.createElement('div');
    this.el.id = 'portalChoice';
    this.el.className = 'panel';
    this.el.style.display = 'none';
    this.el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (!a) return;
      this.host.click();
      const w = this.host.war;
      if (a === 'fight') {
        w.acceptPve();
        this.host.toast(tr('⚔️ Posez une tour de garde et une caserne sur l’île du portail, puis recrutez une garnison.'));
      } else if (a === 'close') w.closePortal();
      this.hide();
    });
    root.append(this.el);
  }

  get visible() { return this.el.style.display !== 'none'; }

  /** Ouvre la carte (celle du portail refermé propose de le garder fermé) */
  show() {
    const w = this.host.war, closed = w.pve === 'off';
    w.choiceSeen = true;
    this.el.innerHTML = `<h4>${closed ? tr('🔒 Portail fermé') : tr('🌀 Le portail est ouvert !')}</h4><p>${closed ? tr('Rouvrir le portail pour affronter les démons ?') : tr('Des démons rôdent de l’autre côté.')}</p><small>${tr('Vous pourrez changer d’avis dans l’onglet Militaire.')}</small><div class="tcbtn"><button data-a="fight" class="go">${tr('Affronter les démons')}</button>${closed ? `<button data-a="keep">${tr('Garder le portail fermé')}</button>` : `<button data-a="close">${tr('Fermer le portail')}</button>`}</div>`;
    this.el.style.display = '';
  }

  hide() { this.el.style.display = 'none'; }
}
