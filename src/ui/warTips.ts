/**
 * Les aides du volet militaire : de petites bulles facultatives qui n'apparaissent qu'au moment utile (jamais au démarrage) :
 * la mission du portail à l'Antiquité, les défenses de l'île, la garnison et ses ordres, la première visite des Enfers, la
 * base avancée, le royaume. Deux lignes au plus ; un clic mène où il faut (et ferme la bulle), la croix la ferme ; chacune ne
 * se montre qu'une fois. Elles se taisent pendant le tutoriel guidé, pendant une fenêtre ou une cinématique, et quand le
 * joueur a masqué les aides (le bouton des conseils, ou « Masquer les aides » dans la bulle)
 */

export type WarTipId = 'portal' | 'isle' | 'garrison' | 'orders' | 'hell' | 'base' | 'kingdom';

/** Ce que les aides regardent de la partie */
export interface WarTipState {
  age: number;
  /** la mission du portail est réussie (le portail est ouvert) */
  portalOpen: boolean;
  /** une équipe est en route pour l'ouvrir */
  portalUnderway: boolean;
  towers: number;
  barracks: number;
  /** troupes valides sur l'île */
  isleTroops: number;
  /** où l'on commande : l'île, les Enfers, ou rien */
  commanding: 'isle' | 'hell' | null;
  /** la dernière zone ouverte des Enfers (1 : seule la première) */
  frontier: number;
  /** la base avancée a un camp */
  camp: boolean;
  /** le royaume est tombé */
  victory: boolean;
}

export const WAR_TIP_TEXT: Record<WarTipId, string> = {
  portal: '🌀 Expédition obligatoire : « Le portail de l’autre rive ». Cliquez pour la voir.',
  isle: '🗼 Portail ouvert ! Posez une tour de garde et une caserne sur son île. Cliquez pour y aller.',
  garrison: '⚔️ Vos soldats gardent l’île. Cliquez pour les commander.',
  orders: '🖱️ Clic ou cadre : choisir. Clic droit : aller, attaquer. 🎺 : vague suivante. « ? » : aide.',
  hell: '🔥 Les Enfers (facultatif) : abattez chaque forteresse pour lever la brume. 🌀 Île : retour.',
  base: '🏕️ Zone conquise ! Posez un camp de base (rangée « Base »), puis caserne et infirmerie.',
  kingdom: '👑 Le royaume est ouvert ! Fuyez les cercles rouges des boules de feu. Combat facultatif.',
};
/** Une aide tient sur deux lignes : au plus ce nombre de caractères */
export const WAR_TIP_MAX = 100;

/** L'ordre où on les vérifie (la première qui convient s'affiche) */
const ORDER: WarTipId[] = ['kingdom', 'base', 'hell', 'orders', 'garrison', 'isle', 'portal'];

/** Le moment de chaque aide */
const WHEN: Record<WarTipId, (s: WarTipState) => boolean> = {
  portal: (s) => s.age >= 1 && !s.portalOpen && !s.portalUnderway,
  isle: (s) => s.portalOpen && (s.towers === 0 || s.barracks === 0) && s.commanding === null,
  garrison: (s) => s.portalOpen && s.isleTroops > 0 && s.commanding === null,
  orders: (s) => s.commanding === 'isle',
  hell: (s) => s.commanding === 'hell',
  base: (s) => s.commanding === 'hell' && s.frontier >= 2 && !s.camp && !s.victory,
  kingdom: (s) => s.commanding === 'hell' && s.frontier >= 6 && !s.victory,
};

/** L'aide à montrer maintenant (null : aucune) ; `seen` : celles déjà vues ; `quiet` : tutoriel, fenêtre, aides masquées */
export function nextWarTip(s: WarTipState, seen: ReadonlySet<string>, quiet = false): WarTipId | null {
  if (quiet) return null;
  return ORDER.find((id) => !seen.has(id) && WHEN[id](s)) ?? null;
}

const SEEN_KEY = 'ceionia.aidesMilitaires';
/** Les aides se montrent tant que le joueur ne les a pas masquées (même clé que le bouton des conseils) */
export const HELP_KEY = 'ceionia.aides';
export function helpAllowed() { try { return localStorage.getItem(HELP_KEY) !== '0'; } catch { return true; } }

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

  /** Appelée quatre fois par seconde */
  update(dt: number) {
    const busy = this.host.busy(), allowed = helpAllowed();
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
    this.el.classList.toggle('low', id === 'orders' || id === 'hell' || id === 'base' || id === 'kingdom');
    this.el.innerHTML = `<p class="wtText"></p><button class="wtX" title="Fermer" aria-label="Fermer">✕</button><button class="wtOff">Masquer les aides</button>`;
    this.el.querySelector('.wtText')!.textContent = WAR_TIP_TEXT[id];
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
