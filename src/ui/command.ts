import type { Hell, HellUnit } from '../sim/hell';
import { Command, unitAt, foeAt, inRect } from '../sim/command';
import type { BattleLayer } from '../render/battleUnits';
import type { PointerInfo, ToolInput } from '../core/camera';
import { TROOPS, TROOP_KINDS, TroopKind, armySize, armyCap, recruitWhy, onlyGearMissing, gearToCraft } from '../sim/army';
import { GEAR_BY, GearId } from '../sim/gear';
import type { War } from '../sim/war';
import type { BaseKind } from '../sim/hell';
import { BASE_DEFS, BASE_KINDS, SUPPLY_MAX, CONVOY_COST, costText, canAfford } from '../sim/hellBase';
import { HELL_ZONES, ZONE_AGE, zoneOfZ, zoneTo, zoneThe, zoneAgeText } from '../world/hell';

/**
 * Le contrôle direct des troupes à l'écran, le même dans les Enfers et sur l'île du portail : sélection (clic, rectangle,
 * double-clic = toutes celles de la même sorte en vue, Maj pour ajouter), ordres (clic droit ou appui long : se rendre, ou
 * attaquer l'ennemi visé ; A puis clic : attaquer en marchant ; H : tenir ; R : se replier), groupes (Ctrl ou Maj + 1…5 pour
 * le former, 1…5 pour le rappeler, deux fois pour y aller), pause active (Espace : les ordres se donnent en pause). L'interface :
 * à gauche le bouton de passage du portail (les ordres : A, H, R, Espace), à droite la caserne (île) ou la base avancée (Enfers), en bas les cartes de troupes et
 * les groupes, en haut le ruban d'état, en bas à droite Aide et Quitter
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
  /** le point de la bataille est sur le portail (un clic dessus mène aux Enfers) */
  atPortal?(x: number, z: number): boolean;
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
/** Sans ordre ni clic pendant ce temps (ms), le mode ordres de l'île se range de lui-même */
export const IDLE_MS = 5000;

/** Le rappel des contrôles (le bouton « ? » de la barre des troupes) : touche ou geste, ce qu'il fait */
export const CONTROLS_HELP: [string, string][] = [
  ['Clic', 'choisir une troupe (double-clic : toutes celles de la même sorte ; Maj : ajouter)'],
  ['Glisser', 'tracer un cadre autour des troupes à choisir'],
  ['Clic droit', 'aller là, ou attaquer l’ennemi visé (au doigt : appui long)'],
  ['A puis clic', 'attaquer en marchant : on combat ce qu’on croise'],
  ['H · R', 'tenir la position · se replier'],
  ['Clic droit glissé', 'tourner la vue ; en le montant ou le descendant, incliner la caméra (clavier : Page haut / Page bas)'],
  ['Ctrl + 1…5', 'former un groupe ; 1…5 le rappelle, deux fois pour y aller'],
  ['Espace', 'pause active : les ordres se donnent en pause'],
  ['🌀 · 🔥', 'passer le portail ; « Voir les Enfers » y mène, « Renforts » fait venir la garnison de l’île'],
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
  private lastAct = performance.now();
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
    this.bar.className = 'commandUI';
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
    this.touch();
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

  /** Un ordre, un clic ou une touche en mode ordres : le minuteur d'inactivité repart de zéro */
  touch() { this.lastAct = performance.now(); }

  /** Le mode ordres de l'île est resté 5 s sans ordre ni clic (pas en pause, pas pendant un glisser) : on le range */
  idleExpired(now = performance.now()): boolean {
    const t = this.theater;
    if (!t || t.kind !== 'isle' || this.host.paused() || this.start || this.placing) { if (t) this.lastAct = now; return false; }
    return now - this.lastAct >= IDLE_MS;
  }

  down(e: PointerInfo) {
    this.touch();
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
      // le portail : un clic mène aux Enfers
      else if (t.kind === 'isle' && t.atPortal?.(p[0], p[1])) cur = 'pointer';
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
    // un clic sur le portail (sans unité dessus) : on passe dans les Enfers
    if (!u && t.kind === 'isle' && t.atPortal?.(p[0], p[1])) { this.host.click(); this.host.goHell(); return; }
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
    this.touch();
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
    this.touch();
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

  /** La phrase d'aide du moment : ce qu'on peut faire maintenant (remplace l'aide dépliante) */
  private hint(): string {
    const n = this.cmd.selected.size;
    if (this.placing) return `Cliquez au sol pour poser : ${BASE_DEFS[this.placing].name}. Échap ou clic droit pour arrêter.`;
    if (this.cmd.armed) return 'Cliquez à l’endroit à attaquer : les soldats combattront ce qu’ils croisent.';
    if (n) return `${n} soldat${n > 1 ? 's' : ''} choisi${n > 1 ? 's' : ''} : clic droit où les envoyer · A attaquer · H tenir · R replier · Espace pause · clic droit glissé : incliner la vue.`;
    return 'Choisissez des soldats (clic, ou cadre à la souris), puis clic droit où les envoyer. Clic droit glissé : tourner et incliner la vue.';
  }

  /** Remet l'interface à jour (appelée souvent : ne refait le contenu que s'il a changé) */
  render() {
    const t = this.theater;
    this.stepWaiting();
    this.bar.style.display = t ? '' : 'none';
    if (!t) return;
    const us = this.units(), sel = this.cmd;
    this.cmd.prune(new Set(us.map((u) => u.id)));
    const w = this.host.war, isle = t.kind === 'isle';
    // en bas : une carte par sorte (« choisis / total », nom, vie)
    const cards = TROOP_KINDS.map((k) => {
      const of = us.filter((u) => u.kind === k);
      if (!of.length) return '';
      const hp = of.reduce((s, u) => s + u.hp, 0) / of.reduce((s, u) => s + u.maxHp, 0), on = of.filter((u) => sel.selected.has(u.id)).length;
      return `<button class="tcard${on ? ' on' : ''}" data-a="kind:${k}" title="${TROOPS[k].plural} : choisir (Maj : ajouter)"><b>${on ? `${on} / ` : ''}${of.length}</b><span class="tn"><span class="ti">${TROOPS[k].icon}</span> ${TROOPS[k].plural}</span><i style="width:${Math.round(hp * 100)}%" class="${hp < 0.35 ? 'low' : ''}"></i></button>`;
    }).join('');
    const groups = [1, 2, 3, 4, 5].map((n) => { const g = sel.groups[n]?.length ?? 0; return `<button class="grp${g ? ' has' : ''}" data-a="grp:${n}" title="Groupe ${n} : Ctrl ou Maj + ${n} pour le former, ${n} pour le rappeler (deux fois : y aller)">${n}${g ? `<small>${g}</small>` : ''}</button>`; }).join('');
    const ctx = w.recruitCtx(this.host.age(), this.host.pop());
    // à droite, sur l'île : la caserne (recruter, effectif)
    const rec = isle ? `<div class="tdock tright"><h5>Caserne <small>${armySize(w.army)} / ${armyCap(ctx)}</small></h5>${TROOP_KINDS.map((k) => {
      const why = recruitWhy(w.army, k, ctx);
      if (this.host.age() < TROOPS[k].age) return '';
      // il ne manque que l'équipement : un clic le fait fabriquer, la recrue part dès qu'il est prêt
      const craft = !!why && onlyGearMissing(w.army, k, ctx);
      const gear = [...TROOPS[k].gear.map((g) => GEAR_BY[g].name.toLowerCase()), ...(TROOPS[k].mount ? ['cheval'] : [])].join(' + ');
      const tip = craft ? `${why!.replace(/ \(à fabriquer.*\)$/, '')} : cliquez, l’atelier du village fabrique l’équipement et la recrue part dès qu’il est prêt` : why ?? `Recruter : ${TROOPS[k].desc} (${[...TROOPS[k].gear.map((g) => g === 'spear' ? 'une lance' : g === 'bow' ? 'un arc' : g === 'sword' ? 'une épée' : 'une armure'), ...(TROOPS[k].mount ? ['un cheval de l’écurie'] : [])].join(' et ')}, ${TROOPS[k].time} s)`;
      const sub = craft ? `fabrique : ${gear}` : why ? why : `coûte : ${gear}`;
      return `<button data-a="rec:${k}" class="trb${why ? (craft ? ' craft' : ' off') : ''}" title="${tip.replace(/"/g, '&quot;')}"><b>${TROOPS[k].icon} + ${TROOPS[k].name}</b><small>${sub}</small></button>`;
    }).join('')}${w.army.queue.length || this.waiting.length ? `<small class="q">En route : ${[...this.waiting.map((k) => `${TROOPS[k].icon}🛠️`), ...w.army.queue.map((q) => `${TROOPS[q.kind].icon} ${Math.ceil(q.left)} s`)].join(' · ')}</small>` : ''}</div>` : this.baseRow();
    // en haut : le ruban d'état (vague et cor, contamination, garnison, zone suivante)
    const next = w.nextWaveIn(), raid = isle && w.isle?.raid;
    const wounded = w.army.troops.filter((x) => x.heal > 0).length;
    const status = isle ? (raid ? `<span class="wst hot">🔥 Incursion : ${w.isle!.raiders().length} démons</span>` : next !== null ? `<span class="wst">Prochaine vague dans <b>${Math.ceil(next)} s</b> <button data-a="wave" title="Sonner le cor : faire venir la prochaine vague tout de suite">🎺 Cor</button></span>` : '') : this.hellGate();
    // la contamination de l'île : elle recule à chaque défense, chaque vague repoussée, chaque zone des Enfers conquise
    const bl = isle && w.blight ? Math.round(w.blight.level * 100) : -1;
    const blight = bl >= 0 ? `<span class="tsup tblight${bl > 60 ? ' low' : ''}" title="Contamination de l’île : les Enfers débordent par le portail (près de lui, les démons frappent un peu plus fort). Elle recule à chaque tour de garde ou caserne bâtie, chaque vague repoussée, chaque zone des Enfers conquise ; l’île sécurisée reverdit. Les troupes se soignent plus vite dans la zone purifiée (anneaux dorés autour des défenses).">🔥 Contamination <i><b style="width:${bl}%"></b></i>${bl} %</span>` : '';
    const garrison = `<span class="wst" title="${isle ? 'Soldats de la garnison de l’île, sur le maximum que la caserne peut loger' : 'Soldats de l’armée, sur le maximum'}">🛡️ ${isle ? 'Garnison' : 'Armée'} <b>${armySize(w.army)} / ${armyCap(ctx)}</b></span>`;
    const ribbon = [status, blight, garrison, wounded ? `<span class="twd" title="Blessés qui se soignent à la caserne">🩹 ${wounded} blessé${wounded > 1 ? 's' : ''}</span>` : ''].filter(Boolean).map((x) => `<div class="tchip">${x}</div>`).join('');
    const none = isle ? 'Aucune troupe sur l’île : recrutez à la caserne (à droite).' : w.army.troops.some((x) => x.where === 'hell') ? 'Aucune troupe debout ici : les blessés se soignent.' : 'Aucune troupe ici : faites venir la garnison de l’île (Renforts, à gauche).';
    const html = `<div class="tstate">${ribbon}</div>
      ${this.passDock(isle)}
      ${rec}
      <div class="tbot panel"><div class="thint">${this.hint()}</div>
        <div class="tcards">${cards || `<span class="tnone">${none}</span>`}${us.length ? `<button class="tall" data-a="all" title="Toutes les troupes">Tous</button>` : ''}<span class="tgl">Groupes</span><span class="grps">${groups}</span></div></div>
      <div class="tcorner"><button data-a="help" class="thb${this.helpOpen ? ' on' : ''}" title="Rappel des contrôles">Aide</button><button data-a="leave" class="tx" title="${isle ? 'Quitter le commandement (Échap)' : 'Quitter les Enfers'}">Quitter</button></div>${this.helpOpen ? `<ul class="thelp panel">${CONTROLS_HELP.map(([k, t]) => `<li><b>${k}</b><span>${t}</span></li>`).join('')}</ul>` : ''}`;
    if (html !== this.barKey) { this.barKey = html; this.bar.innerHTML = html; }
  }

  /**
   * Le seul dock de gauche : UN bouton pour faire passer les troupes choisies d'un monde à l'autre (les ordres se donnent au
   * clavier : A, H, R, Espace, et au clic droit) ; à côté, en plus discret, le lien « Voir les Enfers » (île) ou « Renforts » (Enfers)
   */
  private passDock(isle: boolean) {
    const w = this.host.war, n = this.cmd.selected.size;
    const main = isle && w.portalOut ? '' : `<button data-a="portal" class="tord prt${n ? '' : ' idle'}" title="${isle ? 'Les troupes choisies passent le portail et partent en expédition dans les Enfers (facultatif)' : 'Les troupes choisies repassent le portail et rentrent sur l’île'}"><span class="oi">🌀</span><span>${isle ? 'Envoyer au portail : Enfers' : 'Rentrer sur l’île'}<small>${n ? `${n} troupe${n > 1 ? 's' : ''} choisie${n > 1 ? 's' : ''}` : 'choisissez d’abord des troupes'}</small></span></button>`;
    const links = this.hellLinks(isle);
    return main || links ? `<div class="tdock tleft">${main}${links}</div>` : '';
  }

  /**
   * Les passages entre l'île et les Enfers : de l'île, aller voir les troupes et la base des Enfers (sans quoi on n'y entrait
   * qu'en cliquant la nouvelle d'un passage) ; des Enfers, faire venir en renfort les troupes valides de l'île
   */
  private hellLinks(isle: boolean) {
    const w = this.host.war;
    if (isle) return w.hellPresence() ? '<button data-a="goHell" class="tord gth sm" title="Aller dans les Enfers, auprès des troupes et de la base avancée"><span class="oi">🔥</span>Voir les Enfers</button>' : '';
    const n = w.portalOut || !w.isle ? 0 : w.troopsIn(w.isle.sim).filter((u) => !w.crossing.has(u.id)).length;
    return n ? `<button data-a="garrison" class="tord gar sm" title="Renforts : les ${n} troupe${n > 1 ? 's' : ''} valide${n > 1 ? 's' : ''} de l’île passent le portail et vous rejoignent"><span class="oi">🌀</span>Renforts +${n}</button>` : '';
  }

  /**
   * Le dock droit des Enfers, la base avancée : les bâtiments à poser (un petit menu à elle, pas celui du village), la jauge
   * de vivres et le convoi, la caserne avancée (recrues sur place)
   */
  private baseRow() {
    const w = this.host.war, b = w.base;
    if (!b) return '';
    const world = w.purse;
    const sup = Math.round((b.supply / SUPPLY_MAX) * 100), low = sup < 25, lvl = sup < 25 ? 'low' : sup < 50 ? 'mid' : 'ok';
    const enRoute = b.convoys.length ? `<small class="q">Convoi en route : ${b.convoys.map((c) => `${Math.ceil(c.left)} s`).join(' · ')}</small>` : '';
    const gauge = `<span class="tsup ${lvl}" title="Vivres et équipement de l’expédition : chaque troupe en consomme ; à vide, elles s’affaiblissent peu à peu${b.weak > 0 ? ` (en ce moment : −${Math.round(b.weak * 100)} % de force)` : ''}">🍞 Vivres <i><b style="width:${sup}%"></b></i>${sup} %</span>
      <small class="tsupx${low ? ' low' : ''}">${low ? 'Presque plus de vivres ! ' : ''}Les soldats mangent : à zéro, ils s’affaiblissent.</small>
      <button data-a="convoy" class="trb tconv${low ? ' urgent' : sup < 50 ? ' soon' : ''}" title="Un convoi part du village avec des vivres : il passe le portail et réapprovisionne la base avancée"><b>📦 Envoyer des vivres à la base</b><small>${costText(CONVOY_COST)}</small></button>${enRoute}`;
    const zi = Math.min(HELL_ZONES.length - 1, Math.max(0, w.faction?.frontier ?? 0));
    const builds = BASE_KINDS.map((k) => {
      const d = BASE_DEFS[k], afford = canAfford(world, d.cost);
      return `<button data-a="build:${k}" class="trb tb${this.placing === k ? ' on' : ''}${afford ? '' : ' off'}" title="${`${d.name} (${costText(d.cost)}) : ${d.desc}`.replace(/"/g, '&quot;')}"><b>${d.icon} ${d.name}</b><small>${costText(d.cost)}</small></button>`;
    }).join('');
    const posts = b.posts(), ctx = w.recruitCtx(this.host.age(), this.host.pop());
    const rec = posts ? `<h5>Recruter ici</h5>${TROOP_KINDS.filter((k) => this.host.age() >= TROOPS[k].age).map((k) => `<button data-a="rech:${k}" class="trb${recruitWhy(w.army, k, ctx) && !b.countOf('smithy') ? ' off' : ''}" title="Recruter sur place : ${TROOPS[k].desc.replace(/"/g, '&quot;')}"><b>${TROOPS[k].icon} + ${TROOPS[k].name}</b><small>caserne avancée</small></button>`).join('')}` : '';
    return `<div class="tdock tright tbase"><h5 title="La base avancée : bâtissez dans le seuil du portail ou dans une zone conquise ; la brume s’ouvre jusqu’${zoneTo(zi)}">Base avancée</h5><div class="tbuilds">${builds}</div>${gauge}${rec}</div>`;
  }

  /**
   * Dans les Enfers : la zone suivante, et pourquoi elle est fermée (l'âge du village, ou la forteresse d'avant) ; l'infobulle
   * donne l'âge de chaque zone
   */
  private hellGate() {
    const f = this.host.war.faction;
    if (!f || !f.gate) return '';
    const next = f.frontier + 1, age = this.host.age();
    const tip = HELL_ZONES.map((z, i) => i ? `${zoneThe(i)} : ${zoneAgeText(i)}${ZONE_AGE[i] > age ? ' (verrouillée)' : ''}` : '').filter(Boolean).join(' ; ');
    const t = `Les démons deviennent trop forts pour un village trop jeune : chaque zone demande un âge. ${tip}`.replace(/"/g, '&quot;');
    if (next >= HELL_ZONES.length) return `<span class="wst" title="${t}">👑 Royaume ouvert</span>`;
    if (ZONE_AGE[next] > age) return `<span class="wst" title="${t}">🔒 ${zoneThe(next)} : ${zoneAgeText(next)}</span>`;
    return `<span class="wst" title="${t}">🌫️ Abattez la forteresse pour ouvrir ${zoneThe(next)}</span>`;
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
