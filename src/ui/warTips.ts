/**
 * Les aides du volet militaire : de petites bulles facultatives qui n'apparaissent qu'au moment utile (jamais au démarrage) :
 * les défenses de l'île du portail, la garnison et ses ordres, la première visite des Enfers, la
 * base avancée, le royaume. Deux lignes au plus ; un clic mène où il faut (et ferme la bulle), la croix la ferme ; chacune ne
 * se montre qu'une fois. Elles se taisent pendant le tutoriel guidé, pendant une fenêtre ou une cinématique, et quand le
 * joueur a masqué les aides (le bouton des conseils, ou « Masquer les aides » dans la bulle)
 */

import { tr, localize } from '../i18n';
import { pic, leadPic } from './pics';

export type WarTipId = 'isle' | 'garrison' | 'orders' | 'hell' | 'ageLock' | 'base' | 'kingdom';

/** Ce que les aides regardent de la partie */
export interface WarTipState {
  age: number;
  /** le portail est ouvert */
  portalOpen: boolean;
  /** le joueur a choisi d'affronter les démons (faux : pas encore choisi, ou portail refermé : plus d'aide sur l'île) */
  pve?: boolean;
  towers: number;
  barracks: number;
  /** troupes valides sur l'île */
  isleTroops: number;
  /** où l'on commande : l'île, les Enfers, ou rien */
  commanding: 'isle' | 'hell' | null;
  /** la dernière zone ouverte des Enfers (1 : seule la première) */
  frontier: number;
  /** la zone suivante est fermée faute d'âge (les démons y sont trop forts) */
  ageLock?: boolean;
  /** la base avancée a un camp */
  camp: boolean;
  /** le royaume est tombé */
  victory: boolean;
}

export const WAR_TIP_TEXT: Record<WarTipId, string> = {
  isle: '🗼 Portail ouvert ! Posez une caserne sur son île pour y recruter. Cliquez pour y aller.',
  garrison: '⚔️ Vos soldats sont sur l’île : menez-les aux Enfers. Cliquez pour les commander.',
  orders: '🖱️ Clic ou cadre : choisir. Clic droit : aller, attaquer. « ? » : aide.',
  hell: '🔥 Les Enfers (facultatif) : abattez les forteresses. Chaque âge ouvre une zone. 🌀 Île : retour.',
  ageLock: '🔒 Les démons d’après sont trop forts : montez d’âge pour ouvrir la zone suivante.',
  base: '🏕️ Zone conquise ! Posez un camp de base (rangée « Base »), puis caserne et infirmerie.',
  kingdom: '👑 Le royaume est ouvert ! Fuyez les cercles rouges des boules de feu. Combat facultatif.',
};
// lues dans la langue courante (voir `localize`, src/i18n/index.ts)
localize(WAR_TIP_TEXT, Object.keys(WAR_TIP_TEXT) as never);
/** Une aide tient sur deux lignes : au plus ce nombre de caractères */
export const WAR_TIP_MAX = 100;

/** L'ordre où on les vérifie (la première qui convient s'affiche) */
const ORDER: WarTipId[] = ['kingdom', 'base', 'hell', 'ageLock', 'orders', 'garrison', 'isle'];

/** Le moment de chaque aide */
const WHEN: Record<WarTipId, (s: WarTipState) => boolean> = {
  isle: (s) => s.pve !== false && s.portalOpen && s.barracks === 0 && s.commanding === null,
  garrison: (s) => s.pve !== false && s.portalOpen && s.isleTroops > 0 && s.commanding === null,
  orders: (s) => s.commanding === 'isle',
  hell: (s) => s.commanding === 'hell',
  ageLock: (s) => s.commanding === 'hell' && !!s.ageLock && !s.victory,
  base: (s) => s.commanding === 'hell' && s.frontier >= 2 && !s.camp && !s.victory,
  kingdom: (s) => s.commanding === 'hell' && s.frontier >= 6 && !s.victory,
};

/** L'aide à montrer maintenant (null : aucune) ; `seen` : celles déjà vues ; `quiet` : tutoriel, fenêtre, aides masquées */
export function nextWarTip(s: WarTipState, seen: ReadonlySet<string>, quiet = false): WarTipId | null {
  if (quiet) return null;
  return ORDER.find((id) => !seen.has(id) && WHEN[id](s)) ?? null;
}

const SEEN_KEY = 'ceionia.aidesMilitaires';
/** La clé des aides, partagée par le bouton des conseils (`ui.ts`) et ces bulles : '1' allumées, '0' ou absente éteintes */
export const HELP_KEY = 'ceionia.aides';
/** Les aides sont-elles allumées ? Un seul défaut partout : éteintes tant que le joueur ne les a pas allumées */
export function helpOn() { try { return localStorage.getItem(HELP_KEY) === '1'; } catch { return false; } }
export function setHelpOn(on: boolean) { try { localStorage.setItem(HELP_KEY, on ? '1' : '0'); } catch { /* sans stockage */ } }

export interface WarTipHost {
  root: HTMLElement;
  state(): WarTipState;
  /** le tutoriel guidé est affiché, une fenêtre est ouverte, une cinématique se joue */
  busy(): boolean;
  /** ce que fait un clic sur la bulle */
  act(id: WarTipId): void;
  /** masquer toutes les aides (les conseils aussi) */
  hideHelp(): void;
  click(): void;
}

/** La bulle à l'écran */
export class WarTips {
  el: HTMLElement;
  private seen: Set<string>;
  private shown: WarTipId | null = null;
  /** attente avant la bulle suivante (secondes), pour ne pas les enchaîner */
  private wait = 2;

  constructor(private host: WarTipHost) {
    this.seen = new Set(readSeen());
    this.el = document.createElement('div');
    this.el.id = 'warTip';
    this.el.className = 'panel';
    this.el.hidden = true;
    this.el.setAttribute('role', 'status');
    host.root.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const id = this.shown;
      if (!id) return;
      const t = e.target as HTMLElement;
      this.host.click();
      if (t.closest('.wtOff')) { this.host.hideHelp(); this.close(); return; }
      if (!t.closest('.wtX')) this.host.act(id);
      this.close();
    });
  }

  /** Une aide déjà dite autrement (une notification) : elle ne se montre plus */
  markSeen(id: WarTipId) { this.seen.add(id); writeSeen([...this.seen]); }

  /** Appelée quatre fois par seconde */
  update(dt: number) {
    const busy = this.host.busy(), allowed = helpOn();
    if (this.shown) {
      // une bulle dont le moment est passé (le joueur l'a fait) s'en va d'elle-même
      if (!allowed || !stillDue(this.shown, this.host.state())) { this.close(); return; }
      this.el.hidden = busy;
      return;
    }
    this.wait -= dt;
    if (this.wait > 0 || busy || !allowed) return;
    const id = nextWarTip(this.host.state(), this.seen);
    if (id) this.show(id);
  }

  private show(id: WarTipId) {
    this.shown = id;
    this.el.dataset.tip = id;
    this.el.innerHTML = `<p class="wtText"></p><button class="wtX" title="${tr('Fermer')}" aria-label="${tr('Fermer')}">✕</button><button class="wtOff">${tr('Masquer les aides')}</button>`;
    const tx = WAR_TIP_TEXT[id], lead = leadPic(tx), p = this.el.querySelector<HTMLElement>('.wtText')!;
    // l'émoji de tête devient un picto, le reste est posé en texte
    if (lead) { p.innerHTML = `${pic(lead[0], 20)} `; p.append(lead[1]); } else p.textContent = tx;
    this.el.hidden = false;
  }

  private close() {
    if (this.shown) { this.seen.add(this.shown); writeSeen([...this.seen]); }
    this.shown = null;
    this.el.hidden = true;
    this.wait = 3;
  }
}

/** Une bulle reste tant que son moment dure (sans l'ordre : une aide prioritaire ne la chasse pas) */
function stillDue(id: WarTipId, s: WarTipState) { return WHEN[id](s); }

function readSeen(): string[] {
  try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
function writeSeen(v: string[]) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(v)); } catch { /* sans stockage */ } }
