import type { Hell, HellUnit } from '../sim/hell';
import { Command, unitAt, foeAt, inRect } from '../sim/command';
import type { BattleLayer } from '../render/battleUnits';
import type { PointerInfo, ToolInput } from '../core/camera';
import { TROOPS, TROOP_KINDS, TroopKind, armySize, armyCap, recruitWhy } from '../sim/army';
import type { War } from '../sim/war';

/**
 * Le contrôle direct des troupes à l'écran, le même dans les Enfers et sur l'île du portail : sélection (clic, rectangle,
 * double-clic = toutes celles de la même sorte en vue, Maj pour ajouter), ordres (clic droit ou appui long : se rendre, ou
 * attaquer l'ennemi visé ; A puis clic : attaquer en marchant ; H : tenir ; R : se replier), groupes (Ctrl ou Maj + 1…5 pour
 * le former, 1…5 pour le rappeler, deux fois pour y aller), pause active (Espace : les ordres se donnent en pause). La barre
 * des troupes, en bas : une carte par sorte (nombre, vie), « Tous », les ordres, les groupes ; sur l'île, la caserne (recrues)
 */

/** Le théâtre des opérations : la bataille commandée, et comment passer de l'écran au sol */
export interface Theater {
  kind: 'hell' | 'isle';
  sim: Hell;
  layer: BattleLayer;
  /** point du sol (coordonnées de la bataille) sous un pixel du canevas */
  pick(x: number, y: number): [number, number] | null;
  /** pixel du canevas d'un point de la bataille (null : hors de la vue) */
  screen(x: number, z: number): [number, number] | null;
  /** centre la vue sur un point de la bataille */
  focus(x: number, z: number): void;
}

export interface CommandHost {
  war: War;
  age(): number;
  pop(): number;
  paused(): boolean;
  togglePause(): void;
  toast(m: string): void;
  click(): void;
  /** quitter le commandement de l'île (la vue reste) */
  leaveIsle(): void;
  /** quitter les Enfers par le portail */
  leaveHell(): void;
  canvas: HTMLCanvasElement;
  /** les touches de déplacement de la caméra (on retire celles qu'un ordre a prises) */
  camKeys: Set<string>;
}

const LONG_PRESS = 450, DRAG = 6, DOUBLE = 320;

export class CommandUI implements ToolInput {
  cmd = new Command();
  theater: Theater | null = null;
  private bar: HTMLElement;
  private box: HTMLElement;
  private alertEl: HTMLElement;
  private start: { x: number; y: number; touch: boolean } | null = null;
  private dragging = false;
  private press = 0;
  private pressed = false;
  private lastClick = { t: 0, kind: '' };
  private lastGroup = { n: -1, t: 0 };
  private barKey = '';

  constructor(root: HTMLElement, private host: CommandHost) {
    this.bar = document.createElement('div');
    this.bar.id = 'troopBar';
    this.bar.className = 'panel';
    this.box = document.createElement('div');
    this.box.id = 'selBox';
    this.alertEl = document.createElement('div');
    this.alertEl.id = 'warAlert';
    this.alertEl.className = 'panel';
    root.append(this.bar, this.box, this.alertEl);
    this.bar.addEventListener('click', (e) => this.onBar(e));
  }

  get active() { return !!this.theater; }

  /** Prend le commandement d'une bataille (null : on le quitte) */
  setTheater(t: Theater | null) {
    if (this.theater?.layer && this.theater !== t) this.theater.layer.selected = new Set();
    this.theater = t;
    this.cmd.clear();
    this.cmd.groups = {};
    if (t) t.layer.selected = this.cmd.selected;
    this.box.style.display = 'none';
    this.barKey = '';
    document.body.classList.toggle('commanding', !!t);
    this.host.canvas.style.cursor = '';
    this.render();
  }

  /** Les unités qu'on commande : celles de l'armée (pas les essais du mode développeur… qui comptent aussi s'il n'y a qu'eux) */
  units(): HellUnit[] {
    const t = this.theater;
    if (!t) return [];
    return t.sim.alive('player');
  }

  // ---------- Souris et doigts ----------

  down(e: PointerInfo) {
    this.start = { x: e.x, y: e.y, touch: e.touch };
    this.dragging = false;
    this.pressed = false;
    clearTimeout(this.press);
    // au doigt : un appui long donne l'ordre (comme le clic droit)
    if (e.touch) this.press = window.setTimeout(() => { if (this.start && !this.dragging) { this.pressed = true; this.orderAt(this.start.x, this.start.y); } }, LONG_PRESS);
  }

  move(e: PointerInfo) {
    const s = this.start;
    if (!s) return;
    if (!this.dragging && Math.hypot(e.x - s.x, e.y - s.y) > DRAG) { this.dragging = true; clearTimeout(this.press); }
    if (!this.dragging) return;
    const b = this.box.style;
    b.display = 'block';
    b.left = `${Math.min(s.x, e.x)}px`; b.top = `${Math.min(s.y, e.y)}px`;
    b.width = `${Math.abs(e.x - s.x)}px`; b.height = `${Math.abs(e.y - s.y)}px`;
  }

  up(e: PointerInfo) {
    const s = this.start, t = this.theater;
    clearTimeout(this.press);
    this.start = null;
    this.box.style.display = 'none';
    if (!s || !t || this.pressed) return;
    const add = this.shift;
    if (this.dragging) {
      const hit = inRect(this.units(), { x0: s.x, y0: s.y, x1: e.x, y1: e.y }, (u) => t.screen(u.x, u.z));
      this.cmd.select(hit.map((u) => u.id), add);
      if (hit.length) this.host.click();
      this.render();
      return;
    }
    this.clickAt(e.x, e.y, add);
  }

  cancel() { clearTimeout(this.press); this.start = null; this.box.style.display = 'none'; }

  hover(e: PointerInfo) {
    const t = this.theater;
    if (!t) return;
    const p = t.pick(e.x, e.y);
    let cur = '';
    if (this.cmd.armed) cur = 'crosshair';
    else if (p) {
      if (this.cmd.selected.size && foeAt(t.sim, p[0], p[1], 0.6)) cur = 'crosshair';
      else if (unitAt(this.units(), p[0], p[1], 0.5)) cur = 'pointer';
    }
    this.host.canvas.style.cursor = cur;
  }

  /** Clic droit (sans glisser : un glisser fait tourner la vue) */
  rightClick(e: PointerInfo) { this.orderAt(e.x, e.y); }

  private shift = false;
  /** Maj enfoncée (sélection ajoutée) */
  setShift(on: boolean) { this.shift = on; }

  private clickAt(x: number, y: number, add: boolean) {
    const t = this.theater!, p = t.pick(x, y);
    if (!p) return;
    // attaquer en marchant, armé : le clic donne l'ordre
    if (this.cmd.armed && this.cmd.selected.size) { this.orderAt(x, y); return; }
    const u = unitAt(this.units(), p[0], p[1], 0.5);
    const now = performance.now();
    if (u) {
      // double-clic : toutes celles de la même sorte, en vue
      if (now - this.lastClick.t < DOUBLE && this.lastClick.kind === u.kind) this.cmd.sameKind(this.visible(), u.kind, add);
      else if (add) this.cmd.toggle(u.id);
      else this.cmd.select([u.id]);
      this.lastClick = { t: now, kind: u.kind };
      this.host.click();
    } else if (!add) this.cmd.clear();
    this.render();
  }

  /** Les unités du joueur à l'écran */
  private visible() {
    const t = this.theater!, c = this.host.canvas;
    return this.units().filter((u) => { const p = t.screen(u.x, u.z); return !!p && p[0] >= 0 && p[1] >= 0 && p[0] <= c.clientWidth && p[1] <= c.clientHeight; });
  }

  private orderAt(x: number, y: number) {
    const t = this.theater;
    if (!t) return;
    const p = t.pick(x, y);
    if (!p || !this.cmd.selected.size) return;
    const r = this.cmd.orderAt(t.sim, p[0], p[1]);
    if (r) {
      t.layer.mark = { ...this.cmd.lastOrder!, t: 0 };
      this.host.click();
    }
    this.render();
  }

  // ---------- Clavier ----------

  /** Une touche, en commandement : true si elle est prise (les autres raccourcis ne la voient pas) */
  key(e: KeyboardEvent): boolean {
    const t = this.theater;
    if (!t) return false;
    const k = e.key.toLowerCase(), digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code)?.[1];
    this.shift = e.shiftKey;
    if (digit) {
      const n = +digit;
      if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); this.cmd.setGroup(n); this.host.toast(`Groupe ${n} : ${this.cmd.selected.size} unité${this.cmd.selected.size > 1 ? 's' : ''}.`); this.render(); return true; }
      if (e.altKey) return false;
      const now = performance.now(), again = this.lastGroup.n === n && now - this.lastGroup.t < 400;
      this.lastGroup = { n, t: now };
      if (this.cmd.recall(n) && again) this.focusSelection();
      this.render();
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const take = () => { this.host.camKeys.delete(e.code); return true; };
    if (k === 'h') { this.hold(); return take(); }
    if (k === 'r') { this.retreat(); return take(); }
    if (k === 'a') { if (this.cmd.selected.size) { this.cmd.armed = 'attack'; this.host.canvas.style.cursor = 'crosshair'; this.render(); } return take(); }
    if (k === ' ') { e.preventDefault(); this.host.togglePause(); this.render(); return true; }
    if (k === 'escape') {
      if (this.cmd.armed) this.cmd.armed = null;
      else if (this.cmd.selected.size) this.cmd.clear();
      else if (t.kind === 'isle') this.host.leaveIsle();
      else this.host.leaveHell();
      this.render();
      return true;
    }
    return false;
  }

  hold() { const t = this.theater; if (t && this.cmd.hold(t.sim)) this.host.click(); this.render(); }
  retreat() { const t = this.theater; if (t && this.cmd.retreat(t.sim)) this.host.click(); this.render(); }
  selectAll() { this.cmd.select(this.units().map((u) => u.id)); this.render(); }
  private focusSelection() {
    const t = this.theater, us = this.units().filter((u) => this.cmd.selected.has(u.id));
    if (!t || !us.length) return;
    t.focus(us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.z, 0) / us.length);
  }

  // ---------- Barre des troupes ----------

  private onBar(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!el || !this.theater) return;
    const a = el.dataset.a!, w = this.host.war;
    if (a === 'all') this.selectAll();
    else if (a.startsWith('kind:')) { const k = a.slice(5); this.cmd.select(this.units().filter((u) => u.kind === k).map((u) => u.id), e.shiftKey); }
    else if (a === 'hold') this.hold();
    else if (a === 'retreat') this.retreat();
    else if (a === 'attack') { if (this.cmd.selected.size) this.cmd.armed = this.cmd.armed ? null : 'attack'; }
    else if (a === 'pause') this.host.togglePause();
    else if (a.startsWith('grp:')) { const n = +a.slice(4); if (e.shiftKey || e.ctrlKey) this.cmd.setGroup(n); else if (this.cmd.recall(n)) this.focusSelection(); }
    else if (a === 'portal') {
      const us = this.units().filter((u) => this.cmd.selected.has(u.id));
      if (!us.length) this.host.toast('Choisissez d’abord des troupes (clic, ou glisser un cadre).');
      else { w.sendThroughPortal(us); this.host.toast(this.theater.kind === 'isle' ? `${us.length} soldat${us.length > 1 ? 's' : ''} en route vers le portail des Enfers.` : `${us.length} soldat${us.length > 1 ? 's' : ''} en route pour rentrer sur l’île.`); }
    }
    else if (a.startsWith('rec:')) {
      const why = w.recruit(a.slice(4) as TroopKind, this.host.age(), this.host.pop());
      this.host.toast(why ?? `Recrue en route : ${TROOPS[a.slice(4) as TroopKind].name.toLowerCase()} (la galère l’amène sur l’île).`);
    }
    else if (a === 'wave') { w.callWave(); this.host.toast('🎺 Le cor sonne : la prochaine vague arrive !'); }
    else if (a === 'leave') { if (this.theater.kind === 'isle') this.host.leaveIsle(); else this.host.leaveHell(); return; }
    this.host.click();
    this.barKey = '';
    this.render();
  }

  /** Remet la barre à jour (appelée souvent : ne refait le contenu que s'il a changé) */
  render() {
    const t = this.theater;
    this.bar.style.display = t ? '' : 'none';
    if (!t) return;
    const us = this.units(), sel = this.cmd;
    this.cmd.prune(new Set(us.map((u) => u.id)));
    const w = this.host.war, isle = t.kind === 'isle';
    const cards = TROOP_KINDS.map((k) => {
      const of = us.filter((u) => u.kind === k);
      if (!of.length) return '';
      const hp = of.reduce((s, u) => s + u.hp, 0) / of.reduce((s, u) => s + u.maxHp, 0), on = of.filter((u) => sel.selected.has(u.id)).length;
      return `<button class="tcard${on ? ' on' : ''}" data-a="kind:${k}" title="${TROOPS[k].plural} : choisir (Maj : ajouter)"><span class="ti">${TROOPS[k].icon}</span><b>${on ? `${on}/` : ''}${of.length}</b><small>${TROOPS[k].plural}</small><i style="width:${Math.round(hp * 100)}%" class="${hp < 0.35 ? 'low' : ''}"></i></button>`;
    }).join('');
    const wounded = w.army.troops.filter((x) => x.heal > 0).length;
    const groups = [1, 2, 3, 4, 5].map((n) => { const g = sel.groups[n]?.length ?? 0; return `<button class="grp${g ? ' has' : ''}" data-a="grp:${n}" title="Groupe ${n} : Ctrl ou Maj + ${n} pour le former, ${n} pour le rappeler (deux fois : y aller)">${n}${g ? `<small>${g}</small>` : ''}</button>`; }).join('');
    const ctx = w.recruitCtx(this.host.age(), this.host.pop());
    const rec = isle ? `<div class="trec"><b>Caserne <small>${armySize(w.army)}/${armyCap(ctx)}</small></b>${TROOP_KINDS.map((k) => {
      const why = recruitWhy(w.army, k, ctx);
      if (this.host.age() < TROOPS[k].age) return '';
      return `<button data-a="rec:${k}" class="${why ? 'off' : ''}" title="${(why ?? `Recruter : ${TROOPS[k].desc} (${TROOPS[k].gear.map((g) => g === 'spear' ? 'une lance' : g === 'bow' ? 'un arc' : g === 'sword' ? 'une épée' : 'une armure').join(' et ')} de la réserve, ${TROOPS[k].time} s)`).replace(/"/g, '&quot;')}">${TROOPS[k].icon} +</button>`;
    }).join('')}${w.army.queue.length ? `<small class="q">${w.army.queue.map((q) => `${TROOPS[q.kind].icon}${Math.ceil(q.left)}s`).join(' ')}</small>` : ''}</div>` : '';
    const next = w.nextWaveIn(), raid = isle && w.isle?.raid;
    const status = isle ? (raid ? `<span class="wst hot">🔥 Incursion : ${w.isle!.raiders().length} démons</span>` : next !== null ? `<span class="wst">Prochaine vague : ${Math.ceil(next)} s <button data-a="wave" title="Sonner le cor : faire venir la prochaine vague tout de suite">🎺</button></span>` : '') : '';
    const html = `<div class="trow">${cards || `<span class="tnone">${isle ? 'Aucune troupe sur l’île : recrutez à la caserne.' : 'Aucune troupe ici.'}</span>`}${us.length ? `<button class="tall" data-a="all" title="Toutes les troupes">Tous</button>` : ''}${wounded ? `<span class="twd" title="Blessés qui se soignent à la caserne">🩹 ${wounded}</span>` : ''}${status}</div>
      <div class="trow">
        <button data-a="attack" class="${sel.armed ? 'on' : ''}" title="Attaquer en marchant : A puis clic au sol (on combat ce qu’on croise)">⚔️ <kbd>A</kbd></button>
        <button data-a="hold" title="Tenir la position (H)">🛡️ <kbd>H</kbd></button>
        <button data-a="retreat" title="${isle ? 'Se replier vers la caserne (R)' : 'Se replier vers le portail (R)'}">↩️ <kbd>R</kbd></button>
        <button data-a="portal" title="${isle ? 'Passer le portail : les troupes choisies partent en expédition dans les Enfers (facultatif)' : 'Rentrer sur l’île par le portail'}">🌀 ${isle ? 'Enfers' : 'Île'}</button>
        <span class="grps">${groups}</span>
        <button data-a="pause" class="${this.host.paused() ? 'on' : ''}" title="Pause active (Espace) : les ordres se donnent en pause">${this.host.paused() ? '▶' : '⏸'}</button>
        ${rec}
        <button data-a="leave" class="tx" title="${isle ? 'Quitter le commandement (Échap)' : 'Quitter les Enfers'}">✕</button>
      </div>`;
    if (html !== this.barKey) { this.barKey = html; this.bar.innerHTML = html; }
  }

  /** L'alerte d'incursion (bannière et bouton « Voir l'île »), quand on ne regarde pas l'île */
  alert(text: string | null, onView?: () => void) {
    const el = this.alertEl;
    if (!text) { el.classList.remove('show'); return; }
    if (el.dataset.v !== text) {
      el.dataset.v = text;
      el.innerHTML = `<span>${text}</span><button>Voir l’île</button>`;
      el.querySelector('button')!.onclick = () => { this.host.click(); onView?.(); };
    }
    el.classList.add('show');
  }
}
