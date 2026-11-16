import { tr } from '../i18n';
import { KINDS } from '../build/catalog';
import type { War } from '../sim/war';
import { INVASION_WAVES } from '../sim/hell';
import { hudPic } from './pics';

/**
 * La carte du choix du portail : dès que l'expédition « Le portail de l'autre rive » a réussi (puis quand le joueur la rouvre
 * depuis la barre Militaire ou le commandement de l'île). Le PvE (l'invasion, les Enfers, le royaume) est une option :
 * « Affronter les démons » le joue (la vue va sur l'île, où l'on bâtit ses défenses : `fought`), « Refermer le portail »
 * continue le jeu sans lui. La carte dit d'avance ce que demande le combat : les défenses se bâtissent sur l'île, pas au village.
 * Elle ne s'ouvre seule qu'une fois par partie (`war.choiceSeen`). Le PvE en cours, « Refermer » (bandeau de l'île) l'ouvre
 * pour confirmer : elle dit ce que la fermeture fait (vague renvoyée, troupes des Enfers rapatriées, reprise à la même vague)
 */
export class PortalChoice {
  private el: HTMLElement;

  constructor(root: HTMLElement, private host: { war: War; age(): number; click(): void; fought(): void; closed?(): void; thumb?(k: 'watchtower' | 'barracks', age: number): string | null }) {
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
      if (a === 'fight') { w.acceptPve(); this.host.fought(); } else if (a === 'close' && w.closePortal()) this.host.closed?.();
    });
    root.append(this.el);
  }

  get visible() { return this.el.style.display !== 'none'; }

  /**
   * Ouvre la carte (celle du portail refermé propose de le garder fermé), d'après la maquette de l'auteur
   * (`.claude/maquettes-hud/gpt-exp/portail-gpt.png`) : le diorama peint du portail qui déborde en haut, le titre en Fraunces,
   * la consigne avec les vignettes 3D de la tour de garde et de la caserne (à l'âge du village), puis deux choix distincts :
   * « Affronter les démons » en or, « Fermer le portail » en crème
   */
  show() {
    const w = this.host.war;
    w.choiceSeen = true;
    this.render();
    this.el.style.display = '';
  }

  /** les vignettes qui n'étaient pas encore rendues : on redessine la carte quand elles arrivent (quelques essais) */
  private tries = 0;

  private render() {
    const w = this.host.war, closed = w.pve === 'off', age = this.host.age();
    if (w.pve === 'on') { this.renderShut(); return; }
    const name = (k: 'watchtower' | 'barracks') => KINDS[k].names[Math.max(age, KINDS[k].minAge)];
    const fig = (k: 'watchtower' | 'barracks') => {
      const th = this.host.thumb?.(k, age);
      return `<figure>${th ? `<img src="${th}" alt="" draggable="false">` : `<span class="pcPh"></span>`}<figcaption>${name(k)}</figcaption></figure>`;
    };
    const missing = !this.host.thumb?.('watchtower', age) || !this.host.thumb?.('barracks', age);
    const choice = (a: string, cls: string, icon: string, title: string, sub: string) => `<button data-a="${a}" class="${cls}">${hudPic(icon, 34)}<span><b>${title}</b><small>${sub}</small></span></button>`;
    this.el.innerHTML = `<img class="pcDio" src="./ui/portail.webp" alt="" draggable="false">
      <h4>${closed ? tr('Portail fermé') : tr('Le portail est ouvert !')}</h4>
      <p class="pcSub">${closed ? tr('Rouvrir le portail pour affronter les démons ?') : tr('Des démons rôdent de l’autre côté.')}</p>
      <div class="pcHow"><p>${tr('Pour les affronter, bâtissez sur l’île du portail (pas au village) :')}</p><div class="pcB">${fig('watchtower')}${fig('barracks')}</div><p>${tr('puis recrutez une garnison.')}</p></div>
      <small class="pcNote">${tr('Vous pourrez changer d’avis plus tard.')}</small>
      <div class="pcBtns">${choice('fight', 'pcGo', 'militaire', tr('Affronter les démons'), tr('invasions, Enfers, royaume'))}${closed ? choice('keep', 'pcNo', 'cadenas', tr('Garder le portail fermé'), tr('continuer sans combats')) : choice('close', 'pcNo', 'cadenas', tr('Fermer le portail'), tr('continuer sans combats'))}</div>`;
    if (missing && this.tries++ < 8) setTimeout(() => { if (this.visible) this.render(); }, 700);
    else if (!missing) this.tries = 0;
  }

  /** Le PvE en cours : confirmer « Refermer le portail », en disant ce que cela fait maintenant */
  private renderShut() {
    const w = this.host.war, k = w.invStep();
    const lines = [tr('Plus aucune vague ne viendra tant qu’il reste fermé.')];
    if (w.isle?.raid) lines.push(tr('Les démons sur l’île repartent par le portail.'));
    if (w.army.troops.some((t) => t.where === 'hell') || w.army.queue.some((r) => r.at === 'hell')) lines.push(tr('Vos troupes des Enfers rentrent sur l’île.'));
    if (w.base?.buildings().length) lines.push(tr('La base avancée reste dans les Enfers, telle quelle.'));
    lines.push(w.inv === 'done' ? tr('Rouvert, les Enfers vous attendront tels que vous les avez laissés.') : tr('Rouvert, l’invasion reprendra à la vague {k}/{m}.', { k, m: INVASION_WAVES }));
    const choice = (a: string, cls: string, icon: string, title: string, sub: string) => `<button data-a="${a}" class="${cls}">${hudPic(icon, 34)}<span><b>${title}</b><small>${sub}</small></span></button>`;
    this.el.innerHTML = `<img class="pcDio" src="./ui/portail.webp" alt="" draggable="false">
      <h4>${tr('Refermer le portail ?')}</h4>
      <div class="pcHow">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
      <small class="pcNote">${tr('Vous pourrez le rouvrir quand vous voulez.')}</small>
      <div class="pcBtns">${choice('close', 'pcGo', 'cadenas', tr('Refermer le portail'), tr('continuer sans combats'))}${choice('keep', 'pcNo', 'militaire', tr('Le laisser ouvert'), tr('continuer le combat'))}</div>`;
  }

  hide() { this.el.style.display = 'none'; }
}
