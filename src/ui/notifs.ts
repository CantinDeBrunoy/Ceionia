/**
 * La file des notifications : une seule logique pour tout ce qui s'affiche en message par-dessus le jeu.
 *  - quatre niveaux : `action` (une décision attend, un clic mène quelque part), `danger` (attaque, incendie, perte), `notice`
 *    (réponse directe à un geste du joueur : « pas assez de pierre ») et `info` (bravo, départ d'une équipe, sauvegarde) ;
 *  - seuls action, danger et notice font un message à l'écran ; l'info va seulement dans le centre de notifications (la cloche) ;
 *  - jamais plus de `max` messages visibles ; les autres attendent leur tour (priorité : décision, danger, geste du joueur) ;
 *  - le même message en moins de 10 s n'est pas redit (un « ×3 » s'ajoute s'il est encore à l'écran) ;
 *  - pendant qu'une fenêtre est ouverte, les messages automatiques attendent (le geste du joueur, lui, passe) et s'affichent
 *    groupés à la fermeture : les plus utiles à l'écran, le reste dans la cloche.
 * Sans DOM ni horloge propre : le temps (en ms) est donné à chaque appel, pour pouvoir tout tester.
 */

export type NotifLevel = 'info' | 'notice' | 'danger' | 'action';

export interface NotifItem {
  id: number;
  text: string;
  level: NotifLevel;
  act?: () => void;
  /** nombre de fois où le message a été dit dans la fenêtre de regroupement */
  count: number;
  /** instant d'apparition à l'écran puis de disparition (ms) ; 0 tant qu'il attend */
  shownAt: number;
  until: number;
}

export interface HistoryItem { id: number; text: string; level: NotifLevel; at: number; count: number; unread: boolean }

/** Plus le nombre est grand, plus le message passe devant */
export const PRIORITY: Record<NotifLevel, number> = { info: 0, notice: 1, danger: 2, action: 3 };
/** Le même message en moins de ce temps n'est pas redit */
export const DEDUP_MS = 10_000;
export const HISTORY_MAX = 30;

/** Temps d'affichage : de 3 à 5 s selon la longueur du texte ; un message qui mène quelque part reste un peu plus */
export function durationOf(text: string, level: NotifLevel, hasAct = false): number {
  const base = Math.min(5000, Math.max(3000, 2200 + text.length * 40));
  return hasAct || level === 'action' ? Math.max(base, 6500) : base;
}

const DANGER = /incendie|feu\b|flamme|brûl|incursion|attaqu|assaut|pill|cambriol|vol(é|eur)|perdu|détruit|ruine|s[’']effondr|éruption|volcan|tremble|inond|famine|épidémie|contamin|démons? |démon\b|échec|tombe|meurt|mort/i;
const INFO = /bon retour|sauvegard|bravo|félicit|c[’']est posé|recrue en route|équipement (prêt|commandé)|fabrique|groupe \d|le cor sonne|passe(nt)? par le portail|brouillard se lève|adieu|part (vers|en)|prêt pour les prochaines|ligne (ouverte|modifiée)|choisissez un bâtiment|commencez par/i;

/**
 * Le niveau d'un message dont l'appelant n'a rien dit : une phrase de refus ou de consigne reste un message (notice), les
 * annonces rassurantes passent dans la cloche, les mauvaises nouvelles gardent leur place
 */
export function levelOf(text: string, hasAct: boolean): NotifLevel {
  if (hasAct) return DANGER.test(text) ? 'danger' : 'action';
  if (INFO.test(text)) return 'info';
  return 'notice';
}

export class NotifQueue {
  /** messages à l'écran, du plus ancien au plus récent */
  visible: NotifItem[] = [];
  /** messages qui attendent une place */
  waiting: NotifItem[] = [];
  /** messages automatiques retenus pendant qu'une fenêtre est ouverte */
  held: NotifItem[] = [];
  history: HistoryItem[] = [];
  /** compteur de la cloche : messages non lus */
  unread = 0;
  /** Nombre maximal de messages visibles à la fois (1 sur un téléphone) */
  max = 2;
  /** une fenêtre est ouverte : les messages automatiques attendent */
  blocked = false;
  /** changement à redessiner */
  dirty = true;
  private nextId = 1;
  /** derniers messages dits (texte → instant), pour ne pas se répéter */
  private recent = new Map<string, number>();

  /** Un message arrive. Rend l'élément s'il est (ou sera) à l'écran, null sinon (cloche seulement ou doublon) */
  push(text: string, now: number, opts: { level?: NotifLevel; act?: () => void } = {}): NotifItem | null {
    const level = opts.level ?? levelOf(text, !!opts.act);
    const key = text.trim();
    // doublon : à l'écran ou en attente, on compte ; déjà disparu depuis peu, on se tait
    const live = this.visible.find((v) => v.text === key) ?? this.waiting.find((v) => v.text === key) ?? this.held.find((v) => v.text === key);
    if (live) {
      live.count++;
      if (opts.act) live.act = opts.act;
      if (this.visible.includes(live)) live.until = Math.max(live.until, now + durationOf(key, live.level, !!live.act) * 0.6);
      this.noteHistory(live.level, key, now, live.id);
      this.dirty = true;
      return live;
    }
    const last = this.recent.get(key);
    if (last !== undefined && now - last < DEDUP_MS) { this.noteHistory(level, key, now, 0); return null; }
    this.recent.set(key, now);
    const it: NotifItem = { id: this.nextId++, text: key, level, act: opts.act, count: 1, shownAt: 0, until: 0 };
    this.noteHistory(level, key, now, it.id);
    if (level === 'info') return null;
    // un message automatique attend la fermeture de la fenêtre ; la réponse à un geste du joueur passe tout de suite
    if (this.blocked && level !== 'notice') { this.held.push(it); return it; }
    this.waiting.push(it);
    this.pump(now);
    return it;
  }

  /** Le joueur a lu / fermé un message (clic) */
  dismiss(id: number) {
    this.visible = this.visible.filter((v) => v.id !== id);
    this.dirty = true;
  }

  /** Avance l'horloge : retire ce qui a fait son temps, place ce qui attend. `paused` : la souris est sur un message qui mène quelque part */
  tick(now: number, hovered: ReadonlySet<number> = new Set()) {
    const before = this.visible.length;
    this.visible = this.visible.filter((v) => v.until > now || hovered.has(v.id));
    if (this.visible.length !== before) this.dirty = true;
    this.pump(now);
  }

  /** Une fenêtre s'ouvre ou se ferme */
  setBlocked(on: boolean, now: number) {
    if (on === this.blocked) return;
    this.blocked = on;
    if (on) return;
    // à la fermeture : ce qui a été retenu, groupé ; les plus utiles d'abord, le reste reste dans la cloche
    const grouped = this.held.splice(0).sort((a, b) => PRIORITY[b.level] - PRIORITY[a.level] || a.id - b.id);
    this.waiting.push(...grouped.slice(0, this.max));
    this.pump(now);
  }

  /** Fait passer en tête ce qui a priorité, libère une place si besoin */
  private pump(now: number) {
    if (this.blocked) {
      // seuls les gestes du joueur s'affichent pendant une fenêtre
      if (!this.waiting.some((w) => w.level === 'notice')) return;
    }
    this.waiting.sort((a, b) => PRIORITY[b.level] - PRIORITY[a.level] || a.id - b.id);
    for (;;) {
      const i = this.waiting.findIndex((w) => !this.blocked || w.level === 'notice');
      if (i < 0) break;
      const w = this.waiting[i];
      if (this.visible.length >= this.max) {
        // plus important que ce qui est à l'écran : le plus faible s'efface vite (après un instant de lecture)
        for (const v of this.visible) if (PRIORITY[w.level] > PRIORITY[v.level]) v.until = Math.min(v.until, Math.max(now, v.shownAt + 1200));
        break;
      }
      this.waiting.splice(i, 1);
      w.shownAt = now;
      w.until = now + durationOf(w.text, w.level, !!w.act);
      this.visible.push(w);
      this.dirty = true;
    }
  }

  private noteHistory(level: NotifLevel, text: string, now: number, id: number) {
    const h = this.history.find((x) => x.text === text && now - x.at < DEDUP_MS);
    if (h) { h.count++; h.at = now; if (!h.unread) { h.unread = true; this.unread++; } return; }
    this.history.unshift({ id, text, level, at: now, count: 1, unread: true });
    this.unread++;
    if (this.history.length > HISTORY_MAX) {
      for (const g of this.history.splice(HISTORY_MAX)) if (g.unread) this.unread--;
    }
  }

  /** La cloche est ouverte : tout est lu */
  markRead() {
    for (const h of this.history) h.unread = false;
    this.unread = 0;
  }

  clearHistory() { this.history = []; this.unread = 0; }

  /** Un message est-il à l'écran ? (les aides se taisent alors) */
  get showing() { return this.visible.length > 0; }
}

/** Durée d'une bannière d'arrivée (ms) */
export const BANNER_MS = 3200;
const BANNER_KEY = 'ceionia.bannieres';

function readBanners(): string[] {
  try { const v = JSON.parse(localStorage.getItem(BANNER_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

/**
 * Les bannières d'arrivée (nouvel âge, Monde des Enfers…) : courtes, une à la fois, et celles qui disent « première fois »
 * ne reviennent plus ; pendant une fenêtre ouverte, la bannière attend la fermeture
 */
export class Banners {
  private seen = new Set(readBanners());
  private pending: { title: string; sub: string } | null = null;
  private timer = 0;
  private on = false;
  /** une fenêtre est ouverte */
  private blocked = false;

  constructor(private el: () => HTMLElement) {}

  show(title: string, sub: string, once?: string) {
    if (once) {
      if (this.seen.has(once)) return;
      this.seen.add(once);
      try { localStorage.setItem(BANNER_KEY, JSON.stringify([...this.seen])); } catch { /* sans stockage */ }
    }
    if (this.blocked) { this.pending = { title, sub }; return; }
    this.display(title, sub);
  }

  /** Appelée à chaque tour d'horloge : la bannière retenue sort à la fermeture de la fenêtre */
  tick(windowOpen: boolean) {
    this.blocked = windowOpen;
    if (windowOpen && this.on) this.hide();
    if (!windowOpen && this.pending) { const p = this.pending; this.pending = null; this.display(p.title, p.sub); }
  }

  showing() { return this.on; }

  private display(title: string, sub: string) {
    const b = this.el();
    b.querySelector('h2')!.textContent = title;
    b.querySelector('p')!.textContent = sub;
    b.classList.add('show');
    this.on = true;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), BANNER_MS);
  }

  private hide() { this.el().classList.remove('show'); this.on = false; clearTimeout(this.timer); }
}
