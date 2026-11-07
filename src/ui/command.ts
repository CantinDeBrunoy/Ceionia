import type { Hell, HellUnit } from '../sim/hell';
import { Command, unitAt, foeAt, inRect } from '../sim/command';
import type { BattleLayer } from '../render/battleUnits';
import type { PointerInfo, ToolInput } from '../core/camera';
import { TROOPS, TROOP_KINDS, TroopKind, armySize, armyCap, recruitWhy, onlyGearMissing, gearToCraft } from '../sim/army';
import { GEAR_BY, GearId } from '../sim/gear';
import type { War } from '../sim/war';
import type { BaseKind } from '../sim/hell';
import { BASE_DEFS, BASE_KINDS, SUPPLY_MAX, CONVOY_COST, costText, canAfford } from '../sim/hellBase';
import { HELL_ZONES, zoneOfZ, zoneTo } from '../world/hell';

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
  /** le fantôme d'un bâtiment de la base avancée à poser (null : aucun) et le cercle de la base (Enfers seulement) */
  ghost?(kind: BaseKind | null, x?: number, z?: number, ok?: boolean, camp?: [number, number] | null): void;
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
  /** aller dans les Enfers (depuis l'île) */
  goHell(): void;
  /** met une pièce d'équipement en fabrication à l'atelier du village : null, ou la raison du refus */
  craft(id: GearId): string | null;
  /** les pièces en fabrication (la file de l'atelier) */
  crafting(): readonly GearId[];
  canvas: HTMLCanvasElement;
  /** les touches de déplacement de la caméra (on retire celles qu'un ordre a prises) */
  camKeys: Set<string>;
}

const LONG_PRESS = 450, DRAG = 6, DOUBLE = 320;

/** Le rappel des contrôles (le bouton « ? » de la barre des troupes) : touche ou geste, ce qu'il fait */
export const CONTROLS_HELP: [string, string][] = [
  ['Clic', 'choisir une troupe (double-clic : toutes celles de la même sorte ; Maj : ajouter)'],
  ['Glisser', 'tracer un cadre autour des troupes à choisir'],
  ['Clic droit', 'aller là, ou attaquer l’ennemi visé (au doigt : appui long)'],
  ['A puis clic', 'attaquer en marchant : on combat ce qu’on croise'],
  ['H · R', 'tenir la position · se replier'],
  ['Ctrl + 1…5', 'former un groupe ; 1…5 le rappelle, deux fois pour y aller'],
  ['Espace', 'pause active : les ordres se donnent en pause'],
];

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
  /** le bâtiment de la base avancée qu'on pose (clic au sol ; Échap ou clic droit : on arrête) */
  placing: BaseKind | null = null;
  /** l'aide « ? » des contrôles est dépliée */
  helpOpen = false;

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
    this.placing = null;
    this.theater?.ghost?.(null);
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
    // la pose d'un bâtiment de la base : son fantôme suit le curseur
    if (this.placing) {
      const b = this.host.war.base;
      if (p && b) {
        const camp = b.camp(zoneOfZ(Math.floor(p[1])));
        t.ghost?.(this.placing, p[0], p[1], this.host.war.canBuildBase(this.placing, p[0], p[1]) === null, this.placing === 'camp' || !camp ? null : [camp.site.x, camp.site.z]);
      }
      this.host.canvas.style.cursor = 'copy';
      return;
    }
    if (this.cmd.armed) cur = 'crosshair';
    else if (p) {
      if (this.cmd.selected.size && foeAt(t.sim, p[0], p[1], 0.6)) cur = 'crosshair';
      else if (unitAt(this.units(), p[0], p[1], 0.5)) cur = 'pointer';
    }
    this.host.canvas.style.cursor = cur;
  }

  /** Clic droit (sans glisser : un glisser fait tourner la vue) */
  rightClick(e: PointerInfo) { if (this.placing) { this.stopPlacing(); return; } this.orderAt(e.x, e.y); }

  /** Commence (ou arrête) la pose d'un bâtiment de la base avancée */
  startPlacing(kind: BaseKind | null) {
    this.placing = this.placing === kind ? null : kind;
    if (!this.placing) this.stopPlacing();
    else { this.cmd.armed = null; this.host.toast(`${BASE_DEFS[kind!].icon} ${BASE_DEFS[kind!].name} : cliquez au sol pour le poser (${costText(BASE_DEFS[kind!].cost)}). Échap ou clic droit : arrêter.`); }
    this.render();
  }
  stopPlacing() { this.placing = null; this.theater?.ghost?.(null); this.host.canvas.style.cursor = ''; this.render(); }

  private placeAt(x: number, y: number) {
    const t = this.theater!, p = t.pick(x, y), kind = this.placing!;
    if (!p) return;
    const r = this.host.war.buildBase(kind, p[0], p[1]);
    if (typeof r === 'string') { this.host.toast(r); return; }
    this.host.click();
    this.host.toast(`${BASE_DEFS[kind].icon} ${BASE_DEFS[kind].name} : c’est posé${kind === 'camp' ? ' ! La base peut s’étendre autour (cercle vert).' : '.'}`);
    // palissades et braseros s'enchaînent ; le reste se pose une fois
    if (kind !== 'palisade' && kind !== 'brazier' && !this.shift) this.stopPlacing();
    else this.render();
  }

  private shift = false;
  /** Maj enfoncée (sélection ajoutée) */
  setShift(on: boolean) { this.shift = on; }

  private clickAt(x: number, y: number, add: boolean) {
    const t = this.theater!, p = t.pick(x, y);
    if (!p) return;
    if (this.placing) { this.placeAt(x, y); return; }
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
      if (this.placing) { this.stopPlacing(); return true; }
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
    else if (a === 'help') this.helpOpen = !this.helpOpen;
    else if (a.startsWith('grp:')) { const n = +a.slice(4); if (e.shiftKey || e.ctrlKey) this.cmd.setGroup(n); else if (this.cmd.recall(n)) this.focusSelection(); }
    else if (a === 'portal') {
      const us = this.units().filter((u) => this.cmd.selected.has(u.id));
      if (!us.length) this.host.toast('Choisissez d’abord des troupes (clic, ou glisser un cadre).');
      else { w.sendThroughPortal(us); this.host.toast(this.theater.kind === 'isle' ? `${us.length} soldat${us.length > 1 ? 's' : ''} en route vers le portail des Enfers.` : `${us.length} soldat${us.length > 1 ? 's' : ''} en route pour rentrer sur l’île.`); }
    }
    else if (a.startsWith('rec:')) this.recruitOrCraft(a.slice(4) as TroopKind);
    else if (a === 'goHell') { this.host.goHell(); return; }
    else if (a === 'garrison') { const n = w.callGarrison(); this.host.toast(n ? `🌀 ${n} troupe${n > 1 ? 's' : ''} de l’île passe${n > 1 ? 'nt' : ''} le portail : elle${n > 1 ? 's' : ''} arrive${n > 1 ? 'nt' : ''} au seuil des Enfers.` : 'Aucune troupe valide sur l’île.'); }
    else if (a === 'wave') { w.callWave(); this.host.toast('🎺 Le cor sonne : la prochaine vague arrive !'); }
    else if (a.startsWith('build:')) { this.startPlacing(a.slice(6) as BaseKind); return; }
    else if (a === 'convoy') { const why = w.sendConvoy(); this.host.toast(why ?? '📦 Convoi parti du village : il passe le portail et rejoint l’expédition.'); }
    else if (a.startsWith('rech:')) {
      const k = a.slice(5) as TroopKind, why = w.recruitHell(k, this.host.age(), this.host.pop());
      this.host.toast(why ?? `Recrue en route à la caserne avancée : ${TROOPS[k].name.toLowerCase()} (elle arrivera au camp).`);
    }
    else if (a === 'leave') { if (this.theater.kind === 'isle') this.host.leaveIsle(); else this.host.leaveHell(); return; }
    this.host.click();
    this.barKey = '';
    this.render();
  }

  /** recrues qui attendent que l'atelier du village ait fabriqué leur équipement (elles partent dès qu'il est prêt) */
  waiting: TroopKind[] = [];

  /**
   * Recruter à la caserne de l'île ; s'il ne manque que l'équipement (lance, arc…), l'atelier du village le fabrique et la recrue
   * part dès qu'il est prêt (on devait aller le commander soi-même dans le menu des expéditions)
   */
  recruitOrCraft(kind: TroopKind) {
    const w = this.host.war, ctx = w.recruitCtx(this.host.age(), this.host.pop());
    const why = recruitWhy(w.army, kind, ctx);
    if (why && onlyGearMissing(w.army, kind, ctx) && armySize(w.army) + this.waiting.length < armyCap(ctx)) {
      const list = gearToCraft(kind, ctx.stock, this.host.crafting(), this.waiting);
      for (const g of list) { const no = this.host.craft(g); if (no) { this.host.toast(`${why.replace(/ \(à fabriquer.*\)$/, '')} : ${no.charAt(0).toLowerCase()}${no.slice(1)}.`); return; } }
      this.waiting.push(kind);
      this.host.toast(list.length ? `🛠️ L’atelier fabrique ${list.map((g) => `1 ${GEAR_BY[g].name.toLowerCase()}`).join(' et ')} : la recrue (${TROOPS[kind].name.toLowerCase()}) partira dès que ce sera prêt.` : `🛠️ La recrue (${TROOPS[kind].name.toLowerCase()}) partira dès que son équipement sortira de l’atelier.`);
      return;
    }
    const no = w.recruit(kind, this.host.age(), this.host.pop());
    this.host.toast(no ?? `Recrue en route : ${TROOPS[kind].name.toLowerCase()} (la galère l’amène sur l’île).`);
  }

  /** Les recrues qui attendaient leur équipement partent quand il est prêt (ou renoncent si autre chose manque) */
  private stepWaiting() {
    if (!this.waiting.length) return;
    const w = this.host.war, ctx = w.recruitCtx(this.host.age(), this.host.pop());
    for (let i = 0; i < this.waiting.length;) {
      const kind = this.waiting[i], why = recruitWhy(w.army, kind, ctx);
      if (!why) { w.recruit(kind, this.host.age(), this.host.pop()); this.waiting.splice(i, 1); this.host.toast(`⚔️ Équipement prêt : la recrue (${TROOPS[kind].name.toLowerCase()}) est en route pour l’île.`); this.barKey = ''; continue; }
      // plus de caserne, garnison au complet, ou l'équipement n'est plus en fabrication (commande annulée) : elle renonce
      if (!onlyGearMissing(w.army, kind, ctx) || gearToCraft(kind, ctx.stock, this.host.crafting(), this.waiting.slice(0, i)).length) { this.waiting.splice(i, 1); this.host.toast(`Recrue annulée (${TROOPS[kind].name.toLowerCase()}) : ${why.charAt(0).toLowerCase()}${why.slice(1)}.`); this.barKey = ''; continue; }
      i++;
    }
  }

  /** Remet la barre à jour (appelée souvent : ne refait le contenu que s'il a changé) */
  render() {
    const t = this.theater;
    this.stepWaiting();
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
      // il ne manque que l'équipement : un clic le fait fabriquer, la recrue part dès qu'il est prêt
      const craft = !!why && onlyGearMissing(w.army, k, ctx);
      const tip = craft ? `${why!.replace(/ \(à fabriquer.*\)$/, '')} : cliquez, l’atelier du village le fabrique et la recrue part dès qu’il est prêt` : why ?? `Recruter : ${TROOPS[k].desc} (${TROOPS[k].gear.map((g) => g === 'spear' ? 'une lance' : g === 'bow' ? 'un arc' : g === 'sword' ? 'une épée' : 'une armure').join(' et ')} de la réserve, ${TROOPS[k].time} s)`;
      return `<button data-a="rec:${k}" class="${why ? (craft ? 'craft' : 'off') : ''}" title="${tip.replace(/"/g, '&quot;')}">${TROOPS[k].icon} +</button>`;
    }).join('')}${w.army.queue.length || this.waiting.length ? `<small class="q">${[...this.waiting.map((k) => `${TROOPS[k].icon}🛠️`), ...w.army.queue.map((q) => `${TROOPS[q.kind].icon}${Math.ceil(q.left)}s`)].join(' ')}</small>` : ''}</div>` : '';
    const next = w.nextWaveIn(), raid = isle && w.isle?.raid;
    const status = isle ? (raid ? `<span class="wst hot">🔥 Incursion : ${w.isle!.raiders().length} démons</span>` : next !== null ? `<span class="wst">Prochaine vague : ${Math.ceil(next)} s <button data-a="wave" title="Sonner le cor : faire venir la prochaine vague tout de suite">🎺</button></span>` : '') : '';
    // la contamination de l'île : elle recule à chaque défense, chaque vague repoussée, chaque zone des Enfers conquise
    const bl = isle && w.blight ? Math.round(w.blight.level * 100) : -1;
    const blight = bl >= 0 ? `<span class="tsup tblight${bl > 60 ? ' low' : ''}" title="Contamination de l’île : les Enfers débordent par le portail (près de lui, les démons frappent un peu plus fort). Elle recule à chaque tour de garde ou caserne bâtie, chaque vague repoussée, chaque zone des Enfers conquise ; l’île sécurisée reverdit. Les troupes se soignent plus vite dans la zone purifiée (anneaux dorés autour des défenses).">🔥 Contamination <i><b style="width:${bl}%"></b></i>${bl}%</span>` : '';
    const html = `<div class="trow">${cards || `<span class="tnone">${isle ? 'Aucune troupe sur l’île : recrutez à la caserne.' : w.army.troops.some((x) => x.where === 'hell') ? 'Aucune troupe debout ici : les blessés se soignent.' : 'Aucune troupe ici : faites venir la garnison de l’île (🌀 Renforts).'}</span>`}${us.length ? `<button class="tall" data-a="all" title="Toutes les troupes">Tous</button>` : ''}${wounded ? `<span class="twd" title="Blessés qui se soignent à la caserne">🩹 ${wounded}</span>` : ''}${blight}${status}</div>
      <div class="trow">
        <button data-a="attack" class="${sel.armed ? 'on' : ''}" title="Attaquer en marchant : A puis clic au sol (on combat ce qu’on croise)">⚔️ <kbd>A</kbd></button>
        <button data-a="hold" title="Tenir la position (H)">🛡️ <kbd>H</kbd></button>
        <button data-a="retreat" title="${isle ? 'Se replier vers la caserne (R)' : 'Se replier vers le portail (R)'}">↩️ <kbd>R</kbd></button>
        ${isle && w.portalOut ? '' : `<button data-a="portal" title="${isle ? 'Passer le portail : les troupes choisies partent en expédition dans les Enfers (facultatif)' : 'Rentrer sur l’île par le portail'}">🌀 ${isle ? 'Enfers' : 'Île'}</button>`}${this.hellLinks(isle)}
        <span class="grps">${groups}</span>
        <button data-a="pause" class="${this.host.paused() ? 'on' : ''}" title="Pause active (Espace) : les ordres se donnent en pause">${this.host.paused() ? '▶' : '⏸'}</button>
        ${rec}
        <button data-a="help" class="thb${this.helpOpen ? ' on' : ''}" title="Rappel des contrôles">?</button>
        <button data-a="leave" class="tx" title="${isle ? 'Quitter le commandement (Échap)' : 'Quitter les Enfers'}">✕</button>
      </div>${isle ? '' : this.baseRow()}${this.helpOpen ? `<ul class="thelp">${CONTROLS_HELP.map(([k, t]) => `<li><b>${k}</b><span>${t}</span></li>`).join('')}</ul>` : ''}`;
    if (html !== this.barKey) { this.barKey = html; this.bar.innerHTML = html; }
  }

  /**
   * Les passages entre l'île et les Enfers : de l'île, aller voir les troupes et la base des Enfers (sans quoi on n'y entrait
   * qu'en cliquant la nouvelle d'un passage) ; des Enfers, faire venir en renfort les troupes valides de l'île
   */
  private hellLinks(isle: boolean) {
    const w = this.host.war;
    if (isle) return w.hellPresence() ? '<button data-a="goHell" title="Aller dans les Enfers, auprès des troupes et de la base avancée">🔥 Voir les Enfers</button>' : '';
    const n = w.portalOut || !w.isle ? 0 : w.troopsIn(w.isle.sim).filter((u) => !w.crossing.has(u.id)).length;
    return n ? `<button data-a="garrison" title="Renforts : les ${n} troupe${n > 1 ? 's' : ''} valide${n > 1 ? 's' : ''} de l’île passent le portail et vous rejoignent">🌀 Renforts +${n}</button>` : '';
  }

  /**
   * La rangée de la base avancée (Enfers) : la jauge de vivres et le convoi, les bâtiments à poser (un petit menu à elle, pas
   * celui du village), la caserne avancée (recrues sur place)
   */
  private baseRow() {
    const w = this.host.war, b = w.base;
    if (!b) return '';
    const world = w.purse;
    const sup = Math.round((b.supply / SUPPLY_MAX) * 100), low = sup < 25;
    const enRoute = b.convoys.length ? `<small>📦 ${b.convoys.map((c) => `${Math.ceil(c.left)}s`).join(' ')}</small>` : '';
    const gauge = `<span class="tsup${low ? ' low' : ''}" title="Vivres et équipement de l’expédition : chaque troupe en consomme ; à vide, elles s’affaiblissent peu à peu${b.weak > 0 ? ` (en ce moment : −${Math.round(b.weak * 100)} % de force)` : ''}">🍞 <i><b style="width:${sup}%"></b></i>${sup}%</span>
      <button data-a="convoy" title="Envoyer un convoi de ravitaillement depuis le village (${costText(CONVOY_COST)}) : il arrive par le portail">📦 Ravitailler</button>${enRoute}`;
    const zi = Math.min(HELL_ZONES.length - 1, Math.max(0, w.faction?.frontier ?? 0));
    const builds = BASE_KINDS.map((k) => {
      const d = BASE_DEFS[k], afford = canAfford(world, d.cost);
      return `<button data-a="build:${k}" class="tb${this.placing === k ? ' on' : ''}${afford ? '' : ' off'}" title="${`${d.name} (${costText(d.cost)}) : ${d.desc}`.replace(/"/g, '&quot;')}">${d.icon}</button>`;
    }).join('');
    const posts = b.posts(), ctx = w.recruitCtx(this.host.age(), this.host.pop());
    const rec = posts ? `<span class="trec"><b>Caserne avancée</b>${TROOP_KINDS.filter((k) => this.host.age() >= TROOPS[k].age).map((k) => `<button data-a="rech:${k}" class="${recruitWhy(w.army, k, ctx) && !b.countOf('smithy') ? 'off' : ''}" title="Recruter sur place : ${TROOPS[k].desc.replace(/"/g, '&quot;')}">${TROOPS[k].icon} +</button>`).join('')}</span>` : '';
    return `<div class="trow tbase"><b class="tbt" title="La base avancée : bâtissez dans le seuil du portail ou dans une zone conquise ; la brume s’ouvre jusqu’${zoneTo(zi)}">🏕️ Base</b>${builds}<span class="tsep"></span>${gauge}${rec}</div>`;
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
