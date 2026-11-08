import type { Hell, HellUnit } from '../sim/hell';
import { Command, unitAt, foeAt, inRect } from '../sim/command';
import type { BattleLayer } from '../render/battleUnits';
import type { PointerInfo, ToolInput } from '../core/camera';
import { TROOPS, TROOP_KINDS, TroopKind, armySize, armyCap, recruitWhy, onlyGearMissing, gearToCraft, troopForm, troopName, troopLabel, gearName, andJoin } from '../sim/army';
import type { GearId } from '../sim/gear';
import { tr, plural, nplural, pct } from '../i18n';
import { clockText, type War } from '../sim/war';
import type { BaseKind } from '../sim/hell';
import { BASE_DEFS, costText, canAfford, COUNTER_WARN } from '../sim/hellBase';
import type { BaseCost } from '../sim/hellBase';
import { HELL_ZONES, ZONE_AGE, zoneOfZ, zoneOf, zoneTo, zoneThe, zoneAgeText } from '../world/hell';
import { planHellRecruit, orderHellRecruit, stepHellWaiting } from '../sim/recruitPlan';
import { WallPlan, isWallKind, isLineKind } from './wallPlan';
import { nextGoal, goalLine, zoneLine, HellGoal } from '../sim/objective';

/**
 * Le contrôle direct des troupes à l'écran, le même dans les Enfers et sur l'île du portail : sélection (clic, rectangle
 * par glissé ; double-clic = toutes celles de la même sorte en vue, Maj pour ajouter), ordres (clic droit ou appui long : se rendre, ou
 * attaquer l'ennemi visé ; A puis clic : attaquer en marchant ; H : tenir ; R : se replier), groupes (Ctrl ou Maj + 1…5 pour
 * le former, 1…5 pour le rappeler, deux fois pour y aller), pause active (Espace : les ordres se donnent en pause). L'interface :
 * tout en bas, d'un seul bandeau : le bouton de passage du portail à gauche (les ordres : A, H, R, Espace), les cartes de troupes
 * au centre, la caserne (île) ou le menu de la base avancée (Enfers, onglets Bâtir / Recruter) à droite, puis Aide et Quitter ;
 * (groupes au clavier seulement) ; en haut le ruban d'état (île) ou la frise du front avec le nom de la zone (Enfers)
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
  /** le point de la bataille est sur le portail (un clic dessus mène aux Enfers ; un ordre dessus y envoie les troupes choisies) */
  atPortal?(x: number, z: number): boolean;
  /** pixel du canevas d'un point de la bataille, même hors de la vue (derrière la caméra : de l'autre côté) : pour la flèche d'objectif */
  screenRaw?(x: number, z: number): [number, number];
  /** centre la vue sur un point de la bataille */
  focus(x: number, z: number, dist?: number): void;
  /** le fantôme d'un bâtiment de la base avancée à poser (null : aucun) et le cercle de la base (Enfers seulement) */
  ghost?(kind: BaseKind | null, x?: number, z?: number, ok?: boolean, camp?: [number, number] | null, line?: { x: number; z: number; ok: boolean }[]): void;
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
  /** ouvre la carte du choix du PvE (« Affronter les démons » ou « Refermer le portail ») */
  openPortalChoice(): void;
  /** met une pièce d'équipement en fabrication à l'atelier du village : null, ou la raison du refus */
  craft(id: GearId): string | null;
  /** pourquoi tout ce lot de pièces ne peut pas être mis en fabrication d'un coup (atelier, prix total, file pleine) ; null : possible */
  craftCheck(ids: readonly GearId[]): string | null;
  /** pourquoi tout ce lot de pièces ne peut pas être mis en fabrication d'un coup (atelier, prix total, file pleine) ; null : possible */
  craftCheck(ids: readonly GearId[]): string | null;
  /** les pièces en fabrication (la file de l'atelier) */
  crafting(): readonly GearId[];
  canvas: HTMLCanvasElement;
  /** les touches de déplacement de la caméra (on retire celles qu'un ordre a prises) */
  camKeys: Set<string>;
  /** déplace la vue de dx, dy pixels (glissé du bouton gauche sur le sol vide) */
  pan(dx: number, dy: number): void;
  /** le nom de la zone regardée dans les Enfers (pour la frise) */
  zoneName?(): string | null;
  /** la vue suit les troupes (Enfers) : lire, ou la mettre en marche / l'arrêter */
  following?(): boolean;
  follow?(on: boolean): void;
}

/** Un ordre de déplacement donné à moins de cette distance du portail (cases) le fait passer aux troupes choisies (et à elles seules) */
export const PORTAL_REACH = 2.6;

/** Ce que fait Échap en commandement, dans l'ordre : lâcher le bâtiment, abandonner un mur, désarmer, désélectionner ; rien d'autre dans les Enfers */
export type EscapeAction = 'stopPlacing' | 'cancelTrace' | 'disarm' | 'deselect' | 'leaveIsle' | 'hint';
export function escapeAction(s: { kind: 'hell' | 'isle'; placing: boolean; trace: boolean; armed: boolean; selected: number }): EscapeAction {
  if (s.placing) return s.trace ? 'cancelTrace' : 'stopPlacing';
  if (s.armed) return 'disarm';
  if (s.selected) return 'deselect';
  // Échap sert partout à fermer ou lâcher : il ne quitte pas les Enfers (le bouton « Retourner sur l'île » s'en charge)
  return s.kind === 'isle' ? 'leaveIsle' : 'hint';
}

/** L'aide des contrôles se replie d'elle-même après ce temps (ms) */
const HELP_MS = 20000;
const LONG_PRESS = 450, DRAG = 6, DOUBLE = 320;
/** Une raison de refus sans sa fin « (à fabriquer… ) » (le français comme l'anglais) */
const noCraft = (s: string) => s.replace(/ \((?:à fabriquer|to craft).*\)$/, '');
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** Sans ordre ni clic pendant ce temps (ms), le mode ordres de l'île se range de lui-même */
export const IDLE_MS = 5000;

/** Le rappel des contrôles (le bouton « ? » de la barre des troupes) : touche ou geste, ce qu'il fait */
export const CONTROLS_HELP: [string, string][] = [
  ['Clic', 'choisir une troupe (double-clic : toutes celles de la même sorte ; Maj : ajouter)'],
  ['Glisser', 'tracer un cadre autour des troupes à choisir'],
  ['Clic droit', 'aller là, ou attaquer l’ennemi visé (au doigt : appui long)'],
  ['Clic droit sur le portail', 'les troupes choisies passent de l’autre côté'],
  ['A puis clic', 'attaquer en marchant : on combat ce qu’on croise'],
  ['H · R', 'tenir la position · se replier'],
  ['Clic droit glissé', 'tourner la vue ; en le montant ou le descendant, incliner la caméra (clavier : Page haut / Page bas)'],
  ['Flèches · ZQSD', 'déplacer la vue (aussi : Maj + clic droit glissé, ou clic milieu glissé)'],
  ['Molette', 'zoomer'],
  ['Espace', 'pause active : les ordres se donnent en pause'],
  ['🌀 · 🔥', 'passer le portail ; « Voir les Enfers » y mène, « Renforts » fait venir la garnison de l’île'],
];

export class CommandUI implements ToolInput {
  cmd = new Command();
  theater: Theater | null = null;
  private bar: HTMLElement;
  private box: HTMLElement;
  private alertEl: HTMLElement;
  private start: { x: number; y: number; touch: boolean; box: boolean; lx: number; ly: number } | null = null;
  private dragging = false;
  private press = 0;
  private lastAct = performance.now();
  private pressed = false;
  private lastClick = { t: 0, kind: '' };
  private lastGroup = { n: -1, t: 0 };
  private barKey = '';
  /** le bâtiment de la base avancée qu'on pose (clic au sol ; Échap ou clic droit : on arrête) */
  placing: BaseKind | null = null;
  /** la pose des murs (palissade glissée, porte) */
  wall = new WallPlan();
  /** l'aide « ? » des contrôles est dépliée */
  helpOpen = false;
  /** le prochain objectif dans les Enfers (recalculé à chaque rendu) et son marqueur à l'écran */
  goal: HellGoal | null = null;
  private goalEl: HTMLElement;
  /** le curseur est sur le portail, des troupes choisies : un ordre y fait passer le portail */
  private overPortal = false;

  constructor(root: HTMLElement, private host: CommandHost) {
    this.bar = document.createElement('div');
    this.bar.id = 'troopBar';
    this.bar.className = 'commandUI';
    this.box = document.createElement('div');
    this.box.id = 'selBox';
    this.alertEl = document.createElement('div');
    this.alertEl.id = 'warAlert';
    this.alertEl.className = 'panel';
    this.goalEl = document.createElement('div');
    this.goalEl.id = 'hellGoal';
    this.goalEl.innerHTML = '<i class="hgArrow"></i><span class="hgPin">🎯<b></b></span>';
    root.append(this.bar, this.box, this.alertEl, this.goalEl);
    this.bar.addEventListener('click', (e) => this.onBar(e));
  }

  get active() { return !!this.theater; }

  /** Prend le commandement d'une bataille (null : on le quitte) */
  setTheater(t: Theater | null) {
    if (this.theater?.layer && this.theater !== t) this.theater.layer.selected = new Set();
    this.placing = null;
    this.wall.reset();
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
    // l'aide des contrôles se replie dès qu'on joue (un clic sur la carte)
    if (this.helpOpen) this.closeHelp();
    this.start = { x: e.x, y: e.y, touch: e.touch, box: true, lx: e.x, ly: e.y };
    this.dragging = false;
    this.pressed = false;
    clearTimeout(this.press);
    // la pose d'un mur : le premier appui choisit le point A, le suivant le point B (le mur se pose), comme la route libre
    if (isLineKind(this.placing)) {
      const p = this.theater?.pick(e.x, e.y);
      if (!p) return;
      this.lastP = p;
      const r = this.wall.press(p);
      if (r === 'lay') this.placeWall(p);
      else { if (r === 'start') this.host.click(); this.ghostAt(p); }
      return;
    }
    // au doigt : un appui long donne l'ordre (comme le clic droit)
    if (e.touch) this.press = window.setTimeout(() => { if (this.start && !this.dragging) { this.pressed = true; this.orderAt(this.start.x, this.start.y); } }, LONG_PRESS);
  }

  move(e: PointerInfo) {
    const s = this.start;
    if (!s) return;
    // la pose d'un mur : le tracé suit le doigt (pas de rectangle de sélection)
    if (isLineKind(this.placing)) { const p = this.theater?.pick(e.x, e.y); if (p) { this.wall.drag(p); this.ghostAt(p); } return; }
    if (!this.dragging && Math.hypot(e.x - s.x, e.y - s.y) > DRAG) { this.dragging = true; clearTimeout(this.press); }
    if (!this.dragging) return;
    // glissé simple sur le sol : on déplace la vue ; le cadre de sélection se trace avec Maj (ou Ctrl) enfoncée
    if (!s.box) {
      this.host.pan(e.x - s.lx, e.y - s.ly);
      s.lx = e.x; s.ly = e.y;
      this.host.canvas.style.cursor = 'grabbing';
      return;
    }
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
    // la pose d'un mur : un glissé relâché pose le mur de A à B ; un simple clic laisse A choisi
    if (isLineKind(this.placing)) { const p = t.pick(e.x, e.y); if (p && this.wall.release(p)) this.placeWall(p); return; }
    const add = this.shift || !!e.shift;
    if (this.dragging && !s.box) { this.host.canvas.style.cursor = ''; return; }
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
      if (p) this.ghostAt(p);
      this.host.canvas.style.cursor = 'copy';
      return;
    }
    const portal = !!p && !!t.atPortal?.(p[0], p[1]) && this.canCross();
    const pass = portal && this.cmd.selected.size > 0;
    if (pass !== this.overPortal) { this.overPortal = pass; this.host.canvas.title = pass ? tr('Clic droit : passer le portail') : ''; this.barKey = ''; this.render(); }
    if (this.cmd.armed) cur = 'crosshair';
    else if (p) {
      if (this.cmd.selected.size && foeAt(t.sim, p[0], p[1], 0.6)) cur = 'crosshair';
      // le portail avec des troupes choisies : curseur « passage » (flèche vers l'arche) ; sans troupes, sur l'île, un clic mène aux Enfers
      else if (pass) cur = 'alias';
      else if (unitAt(this.units(), p[0], p[1], 0.5)) cur = 'pointer';
      else if (t.kind === 'isle' && portal) cur = 'pointer';
    }
    this.host.canvas.style.cursor = cur;
  }

  /** Le fantôme du bâtiment qu'on pose, sous le curseur (un mur : toute la ligne, raccordée) */
  private ghostAt(p: [number, number]) {
    const t = this.theater, b = this.host.war.base, kind = this.placing;
    if (!t || !b || !kind) return;
    this.lastP = p;
    const camp = b.camp(zoneOfZ(Math.floor(p[1])));
    const ring: [number, number] | null = kind === 'camp' || !camp ? null : [camp.site.x, camp.site.z];
    let line: { x: number; z: number; ok: boolean; gate?: boolean }[] | undefined, ok: boolean | null = null;
    if (kind === 'palisade') {
      // le tracé de A au pointeur (un ruban de pans raccordés), son coût
      const pv = this.wall.preview(this.host.war, kind, p);
      line = pv.cells;
      this.wallInfo = !this.wall.a ? tr('Mur : cliquez pour choisir le début (A), puis la fin (B) ; ou glissez de A à B. G : porte ici.')
        : pv.why ? pv.why : tr('Mur de {len} : {cost}. Clic : poser jusqu’ici · G : porte ici · Échap : arrêter.', { len: nplural(pv.cells.length, 'case', 'cases'), cost: pv.n ? pv.cost : tr('rien à poser') });
      this.showInfo();
    } else if (kind === 'gate') {
      // la porte s'insère sur le pan de mur survolé (elle le remplace)
      const [x, z] = this.gateSpot(p);
      ok = this.host.war.canBuildBase(kind, x, z) === null;
      line = [{ x, z, ok, gate: true }];
    }
    t.ghost?.(kind, p[0], p[1], ok ?? (line ? line.some((c) => c.ok) : this.host.war.canBuildBase(kind, p[0], p[1]) === null), ring, line);
  }

  /** La phrase d'aide du tracé de mur, mise à jour sous le curseur sans refaire toute la barre */
  private wallInfo = '';
  private showInfo() {
    const el = this.bar.querySelector('.thint');
    if (el && this.placing === 'palisade' && el.textContent !== this.wallInfo) el.textContent = this.wallInfo;
  }
  /** le dernier point du sol visé (pour la touche « porte ici ») */
  private lastP: [number, number] | null = null;

  /** Où la porte s'insère : le centre du pan de palissade le plus proche du curseur (à une case), sinon la case visée */
  private gateSpot(p: [number, number]): [number, number] {
    const w = this.host.war.base?.wallNearest(p[0], p[1], 1.2);
    return w ? [w.site.x, w.site.z] : [Math.floor(p[0]) + 0.5, Math.floor(p[1]) + 0.5];
  }

  /** Pose le mur tracé de A au point `p` */
  private placeWall(p: [number, number]) {
    const kind = this.placing;
    if (!kind) return;
    const msg = this.wall.build(this.host.war, kind, p);
    if (msg.startsWith(BASE_DEFS[kind].icon)) this.host.click();
    this.host.toast(msg);
    this.ghostAt(p);
    this.render();
  }

  /** Touche G, pendant le tracé d'un mur : il s'arrête au pointeur par une porte (une ouverture que franchissent les nôtres) */
  private gateHere() {
    const p = this.lastP;
    if (this.placing !== 'palisade' || !this.wall.a || !p) { this.host.toast(tr('Porte : commencez un mur (clic au point A), puis G au point voulu ; ou choisissez « Porte » et survolez un pan.')); return; }
    const msg = this.wall.buildWithGate(this.host.war, p);
    if (msg.startsWith(`${BASE_DEFS.gate.icon} `)) this.host.click();
    this.host.toast(msg);
    this.ghostAt(p);
    this.render();
  }

  /** Clic droit (sans glisser : un glisser fait tourner la vue) : un tracé de mur en cours s'abandonne d'abord, puis la pose s'arrête */
  rightClick(e: PointerInfo) {
    if (this.placing) { if (this.cancelTrace()) return; this.stopPlacing(); return; }
    this.orderAt(e.x, e.y);
  }
  /** Abandonne le tracé de mur en cours (le point A) : vrai s'il y en avait un */
  private cancelTrace() {
    if (!this.wall.a) return false;
    this.wall.reset();
    if (this.lastP) this.ghostAt(this.lastP);
    this.render();
    return true;
  }

  /** Commence (ou arrête) la pose d'un bâtiment de la base avancée */
  startPlacing(kind: BaseKind | null) {
    this.placing = this.placing === kind ? null : kind;
    if (!this.placing) this.stopPlacing();
    else {
      this.cmd.armed = null; this.wall.reset();
      this.host.toast(kind === 'palisade' ? tr('{icon} Palissade : un clic au point A, un clic au point B (ou glissez) : le mur se pose en ligne libre, droite ou en diagonale ({cost} le pan). B devient le début du suivant ; G : porte ici ; Échap ou clic droit : arrêter.', { icon: BASE_DEFS.palisade.icon, cost: costText(BASE_DEFS.palisade.cost) }) : kind === 'gate' ? tr('{icon} Porte : survolez un pan de mur (elle s’y insère, en le remplaçant) et cliquez ({cost}). Échap ou clic droit : arrêter.', { icon: BASE_DEFS.gate.icon, cost: costText(BASE_DEFS.gate.cost) }) : tr('{icon} {name} : cliquez au sol pour le poser ({cost}). Échap ou clic droit : arrêter.', { icon: BASE_DEFS[kind!].icon, name: BASE_DEFS[kind!].name, cost: costText(BASE_DEFS[kind!].cost) }));
    }
    this.render();
  }
  stopPlacing() { this.placing = null; this.wall.reset(); this.theater?.ghost?.(null); this.host.canvas.style.cursor = ''; this.render(); }

  private placeAt(x: number, y: number) {
    const t = this.theater!, p = t.pick(x, y), kind = this.placing!;
    if (!p) return;
    const [px, pz] = kind === 'gate' ? this.gateSpot(p) : p;
    const r = this.host.war.buildBase(kind, px, pz);
    if (typeof r === 'string') { this.host.toast(r); return; }
    this.host.click();
    this.host.toast(kind === 'camp' ? tr('{icon} {name} : c’est posé ! La base peut s’étendre autour (cercle vert).', { icon: BASE_DEFS[kind].icon, name: BASE_DEFS[kind].name }) : tr('{icon} {name} : c’est posé.', { icon: BASE_DEFS[kind].icon, name: BASE_DEFS[kind].name }));
    // palissades, portes et braseros s'enchaînent ; le reste se pose une fois
    if (kind !== 'palisade' && kind !== 'gate' && kind !== 'brazier' && !this.shift) this.stopPlacing();
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
    // un ordre sur le portail : les troupes choisies le passent (elles marchent jusqu'à lui, puis disparaissent de l'autre côté)
    if (!this.cmd.armed && t.atPortal?.(p[0], p[1]) && this.canCross()) { this.crossPortal(); return; }
    const r = this.cmd.orderAt(t.sim, p[0], p[1]);
    if (r) {
      t.layer.mark = { ...this.cmd.lastOrder!, t: 0 };
      this.host.click();
      // dans les Enfers, la vue suit les troupes envoyées (un geste sur la vue reprend la main)
      if (t.kind === 'hell' && !this.host.following?.()) { this.host.follow?.(true); this.host.toast(tr('La vue suit vos troupes. Déplacez la vue pour reprendre la main.')); }
    }
    this.render();
  }

  /** On peut passer le portail (le royaume tombé, il est éteint : plus de passage vers les Enfers) */
  private canCross() {
    const t = this.theater, w = this.host.war;
    return !!t && !(t.kind === 'isle' && w.portalOut);
  }

  /** Envoie les troupes choisies (elles seules) de l'autre côté du portail ; ce qu'on dit au joueur */
  crossPortal(): number {
    const t = this.theater;
    if (!t) return 0;
    const us = this.units().filter((u) => this.cmd.selected.has(u.id));
    if (!us.length) return 0;
    const closed = t.kind === 'isle' ? this.host.war.hellWhy() : null;
    if (closed) { this.host.toast(closed); return 0; }
    this.host.war.sendThroughPortal(us);
    this.host.click();
    this.host.toast(t.kind === 'isle' ? tr('{n} en route vers le portail des Enfers.', { n: nplural(us.length, 'soldat', 'soldats') }) : tr('{n} en route pour rentrer sur l’île.', { n: nplural(us.length, 'soldat', 'soldats') }));
    this.render();
    return us.length;
  }

  // ---------- Clavier ----------

  /** Replie l'aide des contrôles (aussi toute seule après un moment) */
  closeHelp() { this.helpOpen = false; this.barKey = ''; this.render(); }
  private helpAt = 0;

  /** Une touche, en commandement : true si elle est prise (les autres raccourcis ne la voient pas) */
  key(e: KeyboardEvent): boolean {
    const t = this.theater;
    if (!t) return false;
    this.touch();
    const k = e.key.toLowerCase(), digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code)?.[1];
    this.shift = e.shiftKey;
    if (digit) {
      const n = +digit;
      if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); this.cmd.setGroup(n); this.host.toast(tr('Groupe {n} : {units}.', { n, units: nplural(this.cmd.selected.size, 'unité', 'unités') })); this.render(); return true; }
      if (e.altKey) return false;
      const now = performance.now(), again = this.lastGroup.n === n && now - this.lastGroup.t < 400;
      this.lastGroup = { n, t: now };
      if (this.cmd.recall(n) && again) this.focusSelection();
      this.render();
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const take = () => { this.host.camKeys.delete(e.code); return true; };
    if (k === 'g' && isWallKind(this.placing)) { this.gateHere(); return take(); }
    if (k === 'h') { this.hold(); return take(); }
    if (k === 'r') { this.retreat(); return take(); }
    if (k === 'a') { if (this.cmd.selected.size) { this.cmd.armed = 'attack'; this.host.canvas.style.cursor = 'crosshair'; this.render(); } return take(); }
    if (k === ' ') { e.preventDefault(); this.host.togglePause(); this.render(); return true; }
    if (k === 'escape' && this.helpOpen) { this.closeHelp(); return true; }
    if (k === 'escape') {
      const a = escapeAction({ kind: t.kind, placing: !!this.placing, trace: !!this.wall.a, armed: !!this.cmd.armed, selected: this.cmd.selected.size });
      if (a === 'cancelTrace') this.cancelTrace();
      else if (a === 'stopPlacing') this.stopPlacing();
      else if (a === 'disarm') this.cmd.armed = null;
      else if (a === 'deselect') this.cmd.clear();
      else if (a === 'leaveIsle') this.host.leaveIsle();
      else this.host.toast(tr('Échap ne quitte pas les Enfers : pour rentrer, cliquez « ↩ Retourner sur l’île ».'));
      this.render();
      return true;
    }
    return false;
  }

  hold() { const t = this.theater; if (t && this.cmd.hold(t.sim)) this.host.click(); this.render(); }
  retreat() { const t = this.theater; if (t && this.cmd.retreat(t.sim)) this.host.click(); this.render(); }
  /** Toutes les troupes du joueur, même hors de l'écran ; la vue se centre sur l'armée et recule au besoin pour la montrer entière */
  selectAll() {
    const us = this.units();
    this.cmd.select(us.map((u) => u.id));
    const t = this.theater;
    if (t && us.length) {
      const cx = us.reduce((s, u) => s + u.x, 0) / us.length, cz = us.reduce((s, u) => s + u.z, 0) / us.length;
      const r = Math.max(...us.map((u) => Math.hypot(u.x - cx, u.z - cz)));
      t.focus(cx, cz, 7 + r * 2.4);
    }
    this.render();
  }
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
    else if (a === 'tab:build' || a === 'tab:rec') { this.menuTab = a === 'tab:rec' ? 'rec' : 'build'; this.barKey = ''; this.render(); return; }
    else if (a === 'pause') this.host.togglePause();
    else if (a === 'help') { this.helpOpen = !this.helpOpen; this.helpAt = performance.now(); }
    else if (a === 'goal') { this.centerGoal(); return; }
    else if (a === 'follow') { const on = !this.host.following?.(); this.host.follow?.(on); this.host.toast(on ? tr('La vue suit vos troupes. Déplacez la vue pour reprendre la main.') : tr('La vue ne suit plus les troupes.')); }
    else if (a.startsWith('grp:')) { const n = +a.slice(4); if (e.shiftKey || e.ctrlKey) this.cmd.setGroup(n); else if (this.cmd.recall(n)) this.focusSelection(); }
    else if (a === 'portal') {
      const us = this.units().filter((u) => this.cmd.selected.has(u.id));
      if (this.theater.kind === 'isle' && w.hellWhy()) this.host.toast(w.hellWhy()!);
      else if (!us.length) this.host.toast(tr('Choisissez d’abord des troupes (clic, ou glisser pour un cadre).'));
      else { w.sendThroughPortal(us); this.host.toast(this.theater.kind === 'isle' ? tr('{n} en route vers le portail des Enfers.', { n: nplural(us.length, 'soldat', 'soldats') }) : tr('{n} en route pour rentrer sur l’île.', { n: nplural(us.length, 'soldat', 'soldats') })); }
    }
    else if (a.startsWith('rec:')) this.recruitOrCraft(a.slice(4) as TroopKind);
    else if (a === 'goHell') { this.host.goHell(); return; }
    else if (a === 'garrison') { const n = w.callGarrison(); this.host.toast(n > 1 ? tr('🌀 {n} troupes de l’île passent le portail : elles arrivent au seuil des Enfers.', { n }) : n ? tr('🌀 1 troupe de l’île passe le portail : elle arrive au seuil des Enfers.') : tr('Aucune troupe valide sur l’île.')); }
    else if (a === 'pveChoice') { this.host.openPortalChoice(); return; }
    else if (a === 'fight') w.startInvasion();
    else if (a === 'wave') { const why = w.callWhy(); if (why) this.host.toast(why); else { w.callWave(); this.host.toast(tr('🎺 Le cor sonne : la prochaine vague arrive !')); } }
    else if (a.startsWith('build:')) { this.startPlacing(a.slice(6) as BaseKind); return; }
    else if (a.startsWith('rech:')) { this.recruitHell(a.slice(5) as TroopKind); if (this.placing) { this.render(); return; } }
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
      const list = gearToCraft(kind, ctx.stock, this.host.crafting(), this.waiting, this.host.age());
      // tout ou rien : on ne commande pas l'épée si l'armure ne peut pas suivre
      const lot = this.host.craftCheck(list);
      if (lot) { this.host.toast(tr('{why} : {lot}.', { why: noCraft(why), lot: lowerFirst(lot) })); return; }
      for (const g of list) { const no = this.host.craft(g); if (no) { this.host.toast(tr('{why} : {lot}.', { why: noCraft(why), lot: lowerFirst(no) })); return; } }
      this.waiting.push(kind);
      const troop = troopName(kind, this.host.age()).toLowerCase();
      this.host.toast(list.length ? tr('🛠️ L’atelier fabrique {items} : la recrue ({troop}) partira dès que ce sera prêt.', { items: andJoin(list.map((g) => `1 ${gearName(g)}`)), troop }) : tr('🛠️ La recrue ({troop}) partira dès que son équipement sortira de l’atelier.', { troop }));
      return;
    }
    const no = w.recruit(kind, this.host.age(), this.host.pop());
    this.host.toast(no ?? `${tr('Recrue en route : {troop} (la galère l’amène sur l’île).', { troop: troopName(kind, this.host.age()).toLowerCase() })} · ${tr('{n} en route', { n: nplural(w.army.queue.length + this.waiting.length, 'recrue', 'recrues') })}`);
  }

  /** recrues des Enfers qui attendent que l'atelier du village ait fabriqué leur équipement (elles partent au camp dès qu'il est prêt) */
  waitingHell: TroopKind[] = [];

  /** Le plan d'un clic « Recruter » dans les Enfers (prêt, à fabriquer, impossible + raison) */
  hellPlan(kind: TroopKind) { return planHellRecruit(this.host.war, kind, this.host.age(), this.host.pop(), this.host, [...this.waiting, ...this.waitingHell]); }

  /**
   * Recruter à la caserne avancée des Enfers, d'un seul clic : l'équipement en réserve est pris ; sinon l'atelier du village le
   * fabrique (prix payé tout de suite) et la recrue part au camp dès qu'il est prêt ; sans caserne avancée, on passe à sa pose
   */
  recruitHell(kind: TroopKind) {
    const plan = this.hellPlan(kind);
    const r = orderHellRecruit(this.host.war, kind, this.host.age(), this.host.pop(), this.host, [...this.waiting, ...this.waitingHell]);
    if (r.waits) this.waitingHell.push(kind);
    // le retour : ce que ça coûte (équipement) et combien de recrues sont en route
    const n = this.hellQueueCount();
    this.host.toast(r.done ? `${r.msg}${plan.state === 'ready' ? ` (${plan.sub})` : ''} · ${tr('{n} en route', { n: nplural(n, 'recrue', 'recrues') })}` : r.msg);
    this.barKey = '';
    if (r.openPost) { this.menuTab = 'build'; if (this.placing !== 'post') this.startPlacing(this.host.war.base?.buildings().some((x) => x.kind === 'camp') ? 'post' : 'camp'); }
  }

  /** Les recrues qui attendaient leur équipement partent quand il est prêt (ou renoncent si autre chose manque) */
  private stepWaiting() {
    for (let i = 0; i < this.waitingHell.length;) {
      const kind = this.waitingHell[i], r = stepHellWaiting(this.host.war, kind, this.host.age(), this.host.pop(), this.host, [...this.waiting, ...this.waitingHell.slice(0, i)]);
      if (!r) { i++; continue; }
      this.waitingHell.splice(i, 1);
      this.host.toast(r.go ? tr('⚔️ Équipement prêt : la recrue ({troop}) est en route pour le camp.', { troop: troopName(kind, this.host.age()).toLowerCase() }) : tr('Recrue annulée ({troop}) : {why}.', { troop: troopName(kind, this.host.age()).toLowerCase(), why: r.why ?? '' }));
      this.barKey = '';
    }
    if (!this.waiting.length) return;
    const w = this.host.war, ctx = w.recruitCtx(this.host.age(), this.host.pop());
    for (let i = 0; i < this.waiting.length;) {
      const kind = this.waiting[i], why = recruitWhy(w.army, kind, ctx);
      if (!why) { w.recruit(kind, this.host.age(), this.host.pop()); this.waiting.splice(i, 1); this.host.toast(tr('⚔️ Équipement prêt : la recrue ({troop}) est en route pour l’île.', { troop: troopName(kind, this.host.age()).toLowerCase() })); this.barKey = ''; continue; }
      // plus de caserne, garnison au complet, ou l'équipement n'est plus en fabrication (commande annulée) : elle renonce
      if (!onlyGearMissing(w.army, kind, ctx) || gearToCraft(kind, ctx.stock, this.host.crafting(), this.waiting.slice(0, i), this.host.age()).length) { this.waiting.splice(i, 1); this.host.toast(tr('Recrue annulée ({troop}) : {why}.', { troop: troopName(kind, this.host.age()).toLowerCase(), why: lowerFirst(why) })); this.barKey = ''; continue; }
      i++;
    }
  }

  /** La phrase d'aide du moment : ce qu'on peut faire maintenant (remplace l'aide dépliante) */
  private hint(): string {
    const n = this.cmd.selected.size;
    if (this.placing === 'palisade') return this.wallInfo || tr('Mur : cliquez pour choisir le début (A), puis la fin (B).');
    if (this.placing === 'gate') return tr('Porte : survolez un pan de mur et cliquez : elle s’y insère. Échap ou clic droit pour arrêter.');
    if (this.placing) return tr('Cliquez au sol pour poser : {name}. Échap ou clic droit pour arrêter.', { name: BASE_DEFS[this.placing].name });
    if (this.overPortal) return tr('Clic droit : passer le portail');
    if (this.cmd.armed) return tr('Cliquez à l’endroit à attaquer : les soldats combattront ce qu’ils croisent.');
    if (n > 1) return tr('{n} soldats choisis : clic droit : envoyer · A attaquer · H tenir · R replier · glisser : tracer un cadre.', { n });
    if (n) return tr('{n} soldat choisi : clic droit : envoyer · A attaquer · H tenir · R replier · glisser : tracer un cadre.', { n });
    return tr('Choisissez des soldats (clic), puis clic droit où les envoyer · glisser : tracer un cadre · clic droit glissé : tourner.');
  }

  /** Remet l'interface à jour (appelée souvent : ne refait le contenu que s'il a changé) */
  render() {
    const t = this.theater;
    if (this.helpOpen && performance.now() - this.helpAt > HELP_MS) this.helpOpen = false;
    this.stepWaiting();
    this.bar.style.display = t ? '' : 'none';
    if (!t) return;
    const us = this.units(), sel = this.cmd;
    this.cmd.prune(new Set(us.map((u) => u.id)));
    const w = this.host.war, isle = t.kind === 'isle';
    this.goal = !isle && w.faction ? nextGoal(w.faction, this.center()) : null;
    // en bas : une carte par sorte (« choisis / total », nom, vie) ; la troupe porte le nom de l'âge du village
    const age = this.host.age();
    const cards = TROOP_KINDS.map((k) => {
      const of = us.filter((u) => u.kind === k);
      if (!of.length) return '';
      const hp = of.reduce((s, u) => s + u.hp, 0) / of.reduce((s, u) => s + u.maxHp, 0), on = of.filter((u) => sel.selected.has(u.id)).length;
      return `<button class="tcard${on ? ' on' : ''}" data-a="kind:${k}" title="${tr('{who} : choisir (Maj : ajouter)', { who: `${troopForm(k, age).plural}${troopForm(k, age).name !== TROOPS[k].name ? tr(' (ex-{old})', { old: TROOPS[k].plural.toLowerCase() }) : ''}` })}"><b>${isle ? `${on ? `${on} / ` : ''}` : `${on} / `}${of.length}</b><span class="tn"><span class="ti">${troopForm(k, age).icon}</span> ${troopForm(k, age).plural}</span><i style="width:${Math.round(hp * 100)}%" class="${hp < 0.35 ? 'low' : ''}"></i></button>`;
    }).join('');
    const ctx = w.recruitCtx(this.host.age(), this.host.pop());
    // à droite, sur l'île : la caserne (recruter, effectif)
    const rec = isle ? `<div class="tmenu panel tbarr"><div class="tmh"><h5>${tr('Caserne')} <small>${armySize(w.army)} / ${armyCap(ctx)}</small></h5>${w.army.queue.length || this.waiting.length ? `<small class="q">${tr('En route :')} ${[...this.waiting.map((k) => `${troopForm(k, age).icon}🛠️`), ...w.army.queue.map((q) => `${troopForm(q.kind, age).icon} ${Math.ceil(q.left)} s`)].join(' · ')}</small>` : ''}</div><div class="tmrow">${TROOP_KINDS.map((k) => {
      const why = recruitWhy(w.army, k, ctx);
      if (this.host.age() < TROOPS[k].age) return '';
      // il ne manque que l'équipement : un clic le fait fabriquer, la recrue part dès qu'il est prêt
      const craft = !!why && onlyGearMissing(w.army, k, ctx);
      const fm = troopForm(k, age), gear = [...fm.gear.map((g) => gearName(g)), ...(fm.mount ? [tr('cheval')] : [])].join(' + ');
      const tip = craft ? tr('{why} : cliquez, l’atelier du village fabrique l’équipement et la recrue part dès qu’il est prêt', { why: noCraft(why!) }) : why ?? tr('Recruter : {troop}. {desc} ({items}, {time} s)', { troop: troopLabel(k, age), desc: fm.desc, items: andJoin([...fm.gear.map((g) => `1 ${gearName(g)}`), ...(fm.mount ? [tr('1 cheval de l’écurie')] : [])]), time: TROOPS[k].time });
      const sub = craft ? tr('à fabriquer') : why ? tr('indisponible') : gear;
      return `<button data-a="rec:${k}" class="trb${why ? (craft ? ' craft' : ' off') : ''}" title="${`${tr('{name} : {tip}', { name: fm.name, tip })}${fm.name !== TROOPS[k].name ? tr(' (ex-{old})', { old: TROOPS[k].name.toLowerCase() }) : ''}`.replace(/"/g, '&quot;')}"><b>${fm.icon} ${fm.name}</b><small>${sub}</small></button>`;
    }).join('')}</div></div>` : this.baseRow();
    // en haut : le ruban d'état (vague et cor, contamination, garnison, zone suivante)
    const next = w.nextWaveIn(), raid = isle && w.isle?.raid;
    const wounded = w.army.troops.filter((x) => x.heal > 0).length;
    const status = isle ? this.waveStatus(next, !!raid) : '';
    // après la victoire sur l'invasion : le guidage pas à pas vers les Enfers (choisir les troupes, puis les envoyer)
    const step = isle ? w.guideStep(sel.selected.size) : null;
    const guide = step ? `<span class="wst guide">${step === 'select' ? tr('➡️ Vers les Enfers : choisissez vos troupes (bouton « Tous »).') : tr('➡️ Vers les Enfers : envoyez-les avec « Envoyer aux Enfers ».')}</span>` : '';
    // la contamination de l'île : elle recule à chaque défense, chaque vague repoussée, chaque zone des Enfers conquise
    const bl = isle && w.blight ? Math.round(w.blight.level * 100) : -1;
    const blight = bl >= 0 ? `<span class="tsup tblight${bl > 60 ? ' low' : ''}" title="${tr('Contamination de l’île : les Enfers débordent par le portail (près de lui, les démons frappent un peu plus fort). Elle recule à chaque tour de garde ou caserne bâtie, chaque vague repoussée, chaque zone des Enfers conquise ; l’île sécurisée reverdit. Les troupes se soignent plus vite dans la zone purifiée (anneaux dorés autour des défenses).')}">🔥 ${tr('Contamination')} <i><b style="width:${bl}%"></b></i>${pct(bl)}</span>` : '';
    const garrison = `<span class="wst" title="${isle ? tr('Soldats de la garnison de l’île, sur le maximum que la caserne peut loger') : tr('Soldats de l’armée, sur le maximum')}">🛡️ ${isle ? tr('Garnison') : tr('Armée')} <b>${armySize(w.army)} / ${armyCap(ctx)}</b></span>`;
    const ribbon = [guide, status, blight, garrison, wounded ? `<span class="twd" title="${tr('Blessés qui se soignent à la caserne')}">🩹 ${nplural(wounded, 'blessé', 'blessés')}</span>` : ''].filter(Boolean).map((x) => `<div class="tchip">${x}</div>`).join('');
    const none = isle ? tr('Aucune troupe sur l’île : recrutez à la caserne (à droite).') : w.army.troops.some((x) => x.where === 'hell') ? tr('Aucune troupe debout ici : les blessés se soignent.') : tr('Aucune troupe ici : faites venir la garnison de l’île (Renforts, à gauche).');
    // dans les Enfers : une seule frise compacte (le front, l'alerte, l'armée) ; sur l'île, le ruban de pastilles
    this.bar.classList.toggle('inhell', !isle);
    const html = `${isle ? `<div class="tstate">${ribbon}</div>` : this.frontBar(wounded)}
      <div class="tfoot">
        ${this.passDock(isle, step)}
        <div class="tbot panel"><div class="tcards">${cards || `<span class="tnone">${none}</span>`}${us.length ? `<button class="tall${step === 'select' ? ' guide' : ''}" data-a="all" title="${tr('Toutes les troupes')}">${tr('Tous')}</button>` : ''}</div><div class="thint">${this.hint()}</div></div>
        ${rec}
        <div class="tcorner"><button data-a="help" class="thb${this.helpOpen ? ' on' : ''}" title="${tr('Rappel des contrôles')}">${tr('Aide')}</button><button data-a="leave" class="tx${isle ? '' : ' go'}" title="${isle ? tr('Quitter le commandement (Échap)') : tr('Quitter les Enfers et revenir sur l’île')}">${isle ? tr('Quitter') : tr('↩ Retourner sur l’île')}</button></div>
      </div>${this.helpOpen ? `<ul class="thelp panel">${CONTROLS_HELP.map(([k, t]) => `<li><b>${tr(k)}</b><span>${tr(t)}</span></li>`).join('')}</ul>` : ''}`;
    if (html !== this.barKey) { this.barKey = html; this.bar.innerHTML = html; }
  }

  /**
   * La pastille des vagues : « Vague en cours », ou le compte à rebours (m:ss), la force prévue (petite, moyenne, grosse) et le
   * bouton qui la fait venir tout de suite ; avant l'invasion, ce qu'il lui faut pour être annoncée
   */
  private waveStatus(next: number | null, raid: boolean) {
    const w = this.host.war;
    if (w.pve === 'off') return `<span class="wst hot">${tr('🔒 Portail fermé')} · <button data-a="pveChoice">${tr('Rouvrir')}</button></span>`;
    if (w.pve === 'ask') return `<span class="wst hot">${tr('🌀 Les Enfers')} · <button data-a="pveChoice">${tr('Affronter…')}</button></span>`;
    if (w.inv === 'ready' && !raid) return `<span class="wst hot">${tr('⚔️ Invasion prête')} · <button data-a="fight">${tr('Affronter')}</button></span>`;
    if (raid) return `<span class="wst hot">${w.inv === 'raid' ? tr('🔥 Invasion : {n} démons', { n: w.isle!.raiders().length }) : tr('🔥 Vague en cours : {n} démons', { n: w.isle!.raiders().length })}</span>`;
    if (next === null) return w.active && w.pve === 'on' && w.inv === 'wait' ? `<span class="wst hot">${tr('⚠️ Invasion à venir : une tour de garde, une caserne et {n} soldats sur l’île.', { n: w.invasionNeed() })}</span>` : '';
    const f = w.nextForce(), force = f === 'big' ? tr('Grosse vague') : f === 'medium' ? tr('Vague moyenne') : f === 'small' ? tr('Petite vague') : '';
    const why = w.callWhy(), t = `<b>${clockText(next)}</b>`;
    const label = w.inv === 'coming' ? tr('⚠️ Invasion dans {t}', { t }) : tr('Prochaine vague dans {t}', { t });
    return `<span class="wst${w.inv === 'coming' ? ' hot' : ''}">${label}${force ? ` · ${force}` : ''} <button data-a="wave" class="${why ? 'off' : ''}" title="${why ?? tr('Sonner le cor : faire venir la prochaine vague tout de suite, sans attendre')}">${tr('🎺 Appeler la prochaine vague')}</button></span>`;
  }

  /**
   * Le seul dock de gauche : UN bouton pour faire passer les troupes choisies d'un monde à l'autre (les ordres se donnent au
   * clavier : A, H, R, Espace, et au clic droit) ; à côté, en plus discret, le lien « Voir les Enfers » (île) ou « Renforts » (Enfers)
   */
  private passDock(isle: boolean, step: 'select' | 'send' | null = null) {
    const w = this.host.war, n = this.cmd.selected.size, closed = isle ? w.hellWhy() : null;
    const main = isle && w.portalOut ? '' : `<button data-a="portal" class="tord prt${n ? '' : ' idle'}${closed ? ' closed' : ''}${step === 'send' ? ' guide' : ''}" title="${isle ? (closed ?? tr('Les troupes choisies passent le portail et partent en expédition dans les Enfers (facultatif)')) : tr('Les troupes choisies repassent le portail et rentrent sur l’île')}"><span class="oi">🌀</span><span>${isle ? tr('Envoyer aux Enfers') : tr('Renvoyer les troupes sur l’île')}<small>${n > 1 ? tr('{n} troupes choisies', { n }) : n ? tr('{n} troupe choisie', { n }) : tr('choisir des troupes')}</small></span></button>`;
    const links = this.hellLinks(isle);
    return main || links ? `<div class="tfl">${main}${links}</div>` : '';
  }

  /**
   * Les passages entre l'île et les Enfers : de l'île, aller voir les troupes et la base des Enfers (sans quoi on n'y entrait
   * qu'en cliquant la nouvelle d'un passage) ; des Enfers, faire venir en renfort les troupes valides de l'île
   */
  private hellLinks(isle: boolean) {
    const w = this.host.war;
    if (isle) return w.hellPresence() || (w.hellWhy() && w.pve === 'on') ? `<button data-a="goHell" class="tord gth sm${w.hellWhy() ? ' closed' : ''}" title="${w.hellWhy() ?? tr('Aller dans les Enfers, auprès des troupes et de la base avancée')}"><span class="oi">🔥</span>${tr('Voir les Enfers')}</button>` : '';
    const n = w.portalOut || !w.isle ? 0 : w.troopsIn(w.isle.sim).filter((u) => !w.crossing.has(u.id)).length;
    return n ? `<button data-a="garrison" class="tord gar sm" title="${tr('Renforts : les {n} de l’île passent le portail et vous rejoignent', { n: `${n} ${plural(n, 'troupe', 'troupes')} ${plural(n, 'valide', 'valides')}` })}"><span class="oi">🌀</span>${tr('Renforts')} +${n}</button>` : '';
  }

  /** L'onglet ouvert du menu de la base (Enfers) : bâtir ou recruter */
  private menuTab: 'build' | 'rec' = 'build';
  /** Les noms courts des bâtiments de la base dans la barre du bas (le nom entier est dans l'infobulle) */
  private static BSHORT: Record<BaseKind, string> = { camp: 'Camp', post: 'Caserne', smithy: 'Forge', infirmary: 'Infirmerie', tower: 'Tour', palisade: 'Mur', gate: 'Porte', brazier: 'Brasero' };
  /** Un coût en pastilles courtes (🌲 bois, ⛰️ pierre, ⛏️ minerai) */
  private static costIcons(c: BaseCost) { return [c.wood ? `🌲${c.wood}` : '', c.stone ? `⛰️${c.stone}` : '', c.ore ? `⛏️${c.ore}` : ''].filter(Boolean).join(' ') || tr('gratuit'); }

  /**
   * Le menu « Ma base » des Enfers, à droite de la barre du bas : deux onglets (Bâtir : tenir la zone, se défendre, éclairer ;
   * Recruter), des boutons compacts (nom court, coût en pastilles ; légende et raison du refus en infobulle). Grisé quand on ne
   * peut pas (le camp d'abord : les autres s'ouvrent après lui)
   */
  private baseRow() {
    const w = this.host.war, b = w.base;
    if (!b) return '';
    const world = w.purse, age = this.host.age();
    const zi = Math.min(HELL_ZONES.length - 1, Math.max(0, w.faction?.frontier ?? 0));
    const hasCamp = b.buildings().some((x) => x.kind === 'camp');
    const miss = (c: BaseCost) => costText({ wood: Math.max(0, c.wood - world.wood), stone: Math.max(0, c.stone - world.stone), ore: Math.max(0, c.ore - world.ore) });
    const btn = (k: BaseKind, legend: string, extra = '') => {
      const d = BASE_DEFS[k], afford = canAfford(world, d.cost), locked = k !== 'camp' && !hasCamp;
      const why = locked ? tr('d’abord le Camp') : afford ? '' : tr('manque {x}', { x: miss(d.cost) });
      return `<button data-a="build:${k}" class="trb tb${this.placing === k ? ' on' : ''}${why ? ' off' : ''}${extra}" title="${`${tr('{name} ({cost}) : {legend}', { name: d.name, cost: costText(d.cost), legend: tr(legend) })}. ${d.desc}${why ? ` — ${why}` : ''}`.replace(/"/g, '&quot;')}"><b>${d.icon} ${tr(CommandUI.BSHORT[k])}</b><small class="co">${CommandUI.costIcons(d.cost)}</small></button>`;
    };
    const fam = (cls: string, title: string, tip: string, inner: string) => `<div class="tfam ${cls}" title="${tr(tip)}"><h6>${tr(title)}</h6><div class="tbuilds">${inner}</div></div>`;
    const tab = this.menuTab;
    const inner = tab === 'build'
      ? `${fam('hold', 'Tenir', 'Tenir la zone', btn('camp', hasCamp ? 'point de repli' : 'à poser d’abord', hasCamp ? '' : ' first') + btn('post', 'recrues sur place') + btn('smithy', '+20 % de force') + btn('infirmary', 'soins rapides'))}${
        fam('def', 'Défendre', 'Se défendre', btn('tower', 'archers') + btn('palisade', 'glisser pour tracer') + btn('gate', 'sur un mur'))}${
        fam('lit', 'Éclairer', 'Éclairer : repousse la brume', btn('brazier', 'repousse la brume'))}`
      : `<div class="tfam"><div class="tbuilds">${TROOP_KINDS.filter((k) => age >= TROOPS[k].age).map((k) => {
        const p = this.hellPlan(k), fm = troopForm(k, age);
        return `<button data-a="rech:${k}" class="trb tb rh ${p.state === 'ready' ? 'go' : p.state === 'craft' ? 'craft' : 'off'}" title="${`${troopLabel(k, age)}. ${fm.desc} — ${p.tip}`.replace(/"/g, '&quot;')}"><b>${fm.icon} ${fm.name}</b><small class="co">${p.sub}</small></button>`;
      }).join('')}</div></div>`;
    return `<div class="tmenu panel tbase tbarr"><div class="tmh"><h5 title="${tr('La base avancée : bâtissez dans le seuil du portail ou dans une zone conquise ; la brume s’ouvre jusqu’{zone}', { zone: zoneTo(zi) })}">${tr('Ma base')}</h5><span class="ttabs"><button data-a="tab:build" class="${tab === 'build' ? 'on' : ''}">${tr('Bâtir')}</button><button data-a="tab:rec" class="${tab === 'rec' ? 'on' : ''}">${tr('Recruter')}</button></span>${this.hellQueue()}</div><div class="tmrow">${inner}</div></div>`;
  }

  /** La file des recrues des Enfers : « En route : 🛡️ 12 s » (et 🛠️ pour celles qui attendent l'atelier) */
  private hellQueue() {
    const w = this.host.war, age = this.host.age();
    const l = [...this.waitingHell.map((k) => `${troopForm(k, age).icon}🛠️`), ...w.army.queue.filter((q) => q.at === 'hell').map((q) => `${troopForm(q.kind, age).icon} ${Math.ceil(q.left)} s`)];
    return l.length ? `<small class="q">${tr('{n} en route :', { n: nplural(this.hellQueueCount(), 'recrue', 'recrues') })} ${l.join(' · ')}</small>` : '';
  }

  /** Le nom court de chaque zone dans la frise (le nom entier est dans l'infobulle) */
  private static ZSHORT = ['Portail', 'Braise', 'Lave', 'Cendres', 'Gorge', 'Cristaux', 'Royaume'];

  /**
   * La frise du front, en haut des Enfers : du portail au royaume, un rond par zone (vert : tenue, rouge qui pulse : attaquée,
   * gris pointillé : verrouillée par l'âge ou fermée par la forteresse d'avant) ; à côté, l'armée et les blessés, et la pastille
   * d'alerte quand une contre-attaque ou une reprise est annoncée
   */
  private frontBar(wounded: number) {
    const w = this.host.war, f = w.faction, base = w.base, age = this.host.age(), ctx = w.recruitCtx(age, this.host.pop());
    const att = new Map<number, number>();
    if (base) for (const z of base.attackers.values()) att.set(z, (att.get(z) ?? 0) + 1);
    // les alertes : assaut en cours, assaut annoncé (préavis), reprise annoncée ; la plus pressante d'abord
    const alerts: { zone: number; text: string; rank: number }[] = [];
    if (f && base) {
      for (const [z, n] of att) alerts.push({ zone: z, rank: -1, text: tr('Les démons attaquent ta base {zone} : {n}', { zone: zoneOf(z), n: nplural(n, 'démon', 'démons') }) });
      for (let z = 0; z < HELL_ZONES.length; z++) {
        const at = base.next[z];
        if (at >= 0 && !att.has(z) && f.time >= at - COUNTER_WARN) { const s = Math.max(0, Math.ceil(at - f.time)); alerts.push({ zone: z, rank: s, text: tr('Les démons marchent sur ta base {zone} dans {s} s', { zone: zoneOf(z), s }) }); }
      }
      const r = base.reclaim;
      if (r && r.warned) { const s = Math.max(0, Math.ceil(r.at - f.time)); alerts.push({ zone: r.zone, rank: s, text: tr('Les démons vont reprendre {zone} dans {s} s', { zone: zoneThe(r.zone), s }) }); }
    }
    alerts.sort((a, b) => a.rank - b.rank);
    const hot = new Set(alerts.map((a) => a.zone));
    let nodes = '';
    if (f && f.gate) {
      nodes = HELL_ZONES.map((zd, i) => {
        const held = f.held(i) || f.victory, ageLock = ZONE_AGE[i] > age;
        const st = hot.has(i) ? 'hot' : held ? 'ok' : i === f.frontier && !ageLock ? 'cur' : ageLock ? 'lock' : 'shut';
        const tip = tr('{name} : {state} ({age})', { name: zd.name, state: st === 'hot' ? tr('attaquée') : st === 'ok' ? tr('tenue') : st === 'cur' ? tr('ouverte : abattez sa forteresse') : ageLock ? tr('verrouillée : demande {age}', { age: zoneAgeText(i) }) : tr('fermée : abattez d’abord la forteresse de la zone d’avant'), age: zoneAgeText(i) });
        const link = i ? `<i class="zl${held ? ' ok' : ''}"></i>` : '';
        return `${link}<span class="zn ${st}" title="${tip.replace(/"/g, '&quot;')}"><span class="zc">${i ? i : 'P'}</span><span class="zt">${tr(CommandUI.ZSHORT[i])}</span></span>`;
      }).join('');
    }
    const garr = `<span class="tfi" title="${tr('Soldats de l’armée, sur le maximum')}">🛡️ <b>${armySize(w.army)} / ${armyCap(ctx)}</b></span>${wounded ? `<span class="tfi" title="${tr('Blessés qui se soignent à la caserne')}">🩹 ${wounded}</span>` : ''}`;
    const al = alerts[0];
    const zn = this.host.zoneName?.();
    // la deuxième ligne : la zone ouverte, l'objectif (la distance se met à jour à part, sans refaire la barre), centrer, suivre, recrues en route
    const g = this.goal, row = f ? `<div class="tgoal"><span class="tgz">${zoneLine(f)}</span>${g ? `<span class="tgo">${goalLine(g, null)}<b class="tgd"></b></span>` : ''}${g && g.x !== undefined ? `<button data-a="goal" class="tgb" title="${tr('Centrer la vue sur l’objectif')}">🎯 ${tr('Centrer')}</button>` : ''}<button data-a="follow" class="tgb${this.host.following?.() ? ' on' : ''}" title="${tr('La vue suit les troupes envoyées ; déplacer la vue reprend la main')}">📷 ${tr('Suivre')}</button>${this.recruitChip()}${al ? `<span class="tfa" title="${al.text.replace(/"/g, '&quot;')}">⚠️ ${al.text}</span>` : ''}</div>` : '';
    return `<div class="tstate tfcol"><div class="tfrise">${zn ? `<span class="tfn" title="${tr('La zone où se trouve la vue ; le portail ramène sur l’île (bouton Rentrer sur l’île)')}">🔥 ${zn}</span>` : ''}<div class="tfz">${nodes}</div><div class="tfs">${garr}</div></div>${row}</div>`;
  }

  /** Les recrues en route vers le camp (équipement en fabrication comprises) : « 2 recrues en route » */
  private hellQueueCount() { return this.waitingHell.length + this.host.war.army.queue.filter((q) => q.at === 'hell').length; }
  private recruitChip() {
    const n = this.hellQueueCount();
    return n ? `<span class="tgq" title="${tr('Elles arrivent au camp dès que leur équipement est prêt')}">⏳ ${tr('{n} en route', { n: nplural(n, 'recrue', 'recrues') })}</span>` : '';
  }

  /** Centre la vue sur l'objectif (la vue cesse de suivre les troupes) */
  centerGoal() {
    const t = this.theater, g = this.goal;
    if (!t || !g || g.x === undefined || g.z === undefined) return;
    this.host.follow?.(false);
    t.focus(g.x, g.z, 18);
    this.host.click();
    this.render();
  }

  /** Où la vue suit : le centre des troupes choisies (sinon de toutes) ; null s'il n'y en a plus */
  followPoint(): [number, number] | null {
    const all = this.units(), sel = all.filter((u) => this.cmd.selected.has(u.id)), us = sel.length ? sel : all;
    return us.length ? [us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.z, 0) / us.length] : null;
  }

  /** Le centre des troupes (ou le point d'arrivée des Enfers) : d'où l'on mesure l'objectif */
  center(): [number, number] {
    const us = this.units();
    if (us.length) return [us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.z, 0) / us.length];
    return (this.theater?.sim.map as { arrival?: [number, number] }).arrival ?? [0, 0];
  }

  /** Une image : le marqueur d'objectif (un anneau avec la distance, ou une flèche au bord de l'écran vers lui) et la distance de la frise */
  frame() {
    const t = this.theater, g = this.goal, el = this.goalEl;
    if (!t || t.kind !== 'hell' || !g || g.x === undefined || g.z === undefined || !t.screenRaw) { el.classList.remove('show'); return; }
    const c = this.host.canvas, W = c.clientWidth, H = c.clientHeight;
    const from = this.center(), dist = Math.hypot(g.x - from[0], g.z - from[1]);
    const label = nplural(Math.max(1, Math.round(dist)), 'case', 'cases');
    const [sx, sy] = t.screenRaw(g.x, g.z);
    // la zone libre de l'écran : sous le haut (ressources, frise) et au-dessus du bas (barre des troupes)
    const cr = c.getBoundingClientRect(), under = this.bar.querySelector('.tgoal')?.getBoundingClientRect(), over = this.bar.querySelector('.tfoot')?.getBoundingClientRect();
    const x0 = 28, x1 = W - 28, y0 = under ? under.bottom - cr.top + 34 : 130, y1 = Math.max(y0 + 40, over ? over.top - cr.top - 24 : H - 190);
    const inside = sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
    let px = sx, py = sy, ang = 0;
    if (!inside) {
      const cx = W / 2, cy = (y0 + y1) / 2, dx = sx - cx, dy = sy - cy;
      const k = Math.min(dx ? ((dx > 0 ? x1 : x0) - cx) / dx : Infinity, dy ? ((dy > 0 ? y1 : y0) - cy) / dy : Infinity);
      px = cx + dx * k; py = cy + dy * k; ang = Math.atan2(dy, dx);
    }
    el.classList.add('show');
    el.classList.toggle('edge', !inside);
    el.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
    (el.querySelector('.hgArrow') as HTMLElement).style.transform = `rotate(${ang}rad)`;
    const b = el.querySelector('.hgPin b') as HTMLElement;
    if (b.textContent !== label) b.textContent = label;
    const d = this.bar.querySelector('.tgd');
    const txt = ` (${tr('à {n}', { n: label })})`;
    if (d && d.textContent !== txt) d.textContent = txt;
  }

  /** L'alerte d'incursion (bannière et bouton « Voir l'île »), quand on ne regarde pas l'île */
  alert(text: string | null, onView?: () => void) {
    const el = this.alertEl;
    if (!text) { el.classList.remove('show'); return; }
    // le bouton reste en place (le compte à rebours change le texte chaque seconde : un bouton refait à chaque fois perdrait des clics)
    if (!el.querySelector('button')) el.innerHTML = `<span></span><button>${tr('Voir l’île')}</button>`;
    const span = el.querySelector('span')!;
    if (span.textContent !== text) span.textContent = text;
    el.querySelector('button')!.onclick = () => { this.host.click(); onView?.(); };
    el.classList.add('show');
  }
}
