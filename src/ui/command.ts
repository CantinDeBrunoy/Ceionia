import type { Hell, HellUnit } from '../sim/hell';
import { Command, unitAt, foeAt, inRect } from '../sim/command';
import type { BattleLayer } from '../render/battleUnits';
import type { PointerInfo, ToolInput } from '../core/camera';
import { TROOPS, TROOP_KINDS, TroopKind, armySize, armyCap, recruitWhy, onlyGearMissing, gearToCraft, troopForm, troopName, troopLabel, gearName, andJoin } from '../sim/army';
import type { GearId } from '../sim/gear';
import { tr, plural, nplural, pct } from '../i18n';
import { clockText, waveForce, WARN_TIME, type War } from '../sim/war';
import type { BaseKind } from '../sim/hell';
import { INVASION_DELAY, raidInterval } from '../sim/hell';
import { BASE_DEFS, costText, canAfford, COUNTER_WARN } from '../sim/hellBase';
import type { BaseCost } from '../sim/hellBase';
import { HELL_ZONES, ZONE_AGE, zoneOfZ, zoneOf, zoneTo, zoneThe, zoneAgeText } from '../world/hell';
import { planHellRecruit, orderHellRecruit, stepHellWaiting, shortWhy } from '../sim/recruitPlan';
import { WallPlan, isWallKind, isLineKind } from './wallPlan';
import { nextGoal, goalLine, zoneLine, HellGoal } from '../sim/objective';
import { pic, withPic } from './pics';
import { ic } from './icons';

/**
 * Le contrôle direct des troupes à l'écran, le même dans les Enfers et sur l'île du portail : sélection (clic, rectangle
 * par glissé ; double-clic = toutes celles de la même sorte en vue, Maj pour ajouter), ordres (clic droit ou appui long : se rendre, ou
 * attaquer l'ennemi visé ; A puis clic : attaquer en marchant ; H : tenir ; R : se replier), groupes (Ctrl ou Maj + 1…5 pour
 * le former, 1…5 pour le rappeler, deux fois pour y aller), pause active (Espace : les ordres se donnent en pause). L'interface :
 * tout en bas, une rangée : la carte de passage du portail à gauche, la bulle d'aide du moment, « Ma garnison » (île : cartes
 * de recrues à portrait, onglets Bâtir / Recruter à droite) ou les outils et « Ma base » (Enfers), puis Aide et le retour ;
 * au-dessus, les troupes sur le terrain (une carte par sorte, « Tous ») ; en haut le ruban d'état (île) ou la frise du front
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
  /** les défenses de l'île (onglet Bâtir) : nom, icône, texte ; pourquoi on ne peut pas encore la poser (null : on peut) ; combien sont bâties ; la poser */
  defenseInfo(kind: string): { name: string; icon: string; desc: string };
  defenseLock(kind: string): string | null;
  defenseCount(kind: string): number;
  buildDefense(kind: string): void;
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
  /** le portrait d'une troupe à cet âge (URL d'image), null tant qu'il n'est pas prêt : la carte garde alors son picto */
  portrait?(kind: TroopKind, age: number): string | null;
  /**
   * l'aperçu 3D d'une défense de l'île ou d'un bâtiment de la base des Enfers à cet âge (vignette de `Thumbs`, data URL), null
   * tant qu'il attend son tour : la carte garde son picto, puis `thumbsReady` le remplace sur place
   */
  defenseThumb?(kind: string, age: number): string | null;
  baseThumb?(kind: BaseKind, age: number): string | null;
}

/** Les outils de la base des Enfers : choisir les troupes (l'outil ordinaire), déplacer ou démolir un bâtiment */
export type BaseTool = 'select' | 'move' | 'demolish';

/** Un ordre de déplacement donné à moins de cette distance du portail (cases) le fait passer aux troupes choisies (et à elles seules) */
export const PORTAL_REACH = 2.6;

/** Ce que fait Échap en commandement, dans l'ordre : lâcher le bâtiment, abandonner un mur, désarmer, désélectionner ; rien d'autre dans les Enfers */
export type EscapeAction = 'stopPlacing' | 'cancelTrace' | 'stopTool' | 'disarm' | 'deselect' | 'leaveIsle' | 'hint';
export function escapeAction(s: { kind: 'hell' | 'isle'; placing: boolean; trace: boolean; armed: boolean; selected: number; tool?: boolean }): EscapeAction {
  if (s.placing) return s.trace ? 'cancelTrace' : 'stopPlacing';
  // un outil de la base (déplacer, démolir) : on le lâche, on revient au choix des troupes
  if (s.tool) return 'stopTool';
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

/** Le rôle d'une troupe à cet âge, en deux ou trois mots et un picto (la pilule des cartes de recrues) */
export function troopRole(kind: TroopKind, age: number): { icon: string; text: string } {
  if (kind === 'soldier') return age >= 3 ? { icon: '🔫', text: 'Tir en rafales' } : { icon: '🛡', text: 'Corps à corps' };
  if (kind === 'archer') return age >= 5 ? { icon: '🤖', text: 'Tir rapide' } : age >= 3 ? { icon: '🎯', text: 'Tir lointain' } : { icon: '🏹', text: 'Tir à distance' };
  if (kind === 'knight') return age >= 4 ? { icon: '🚀', text: 'Tir lourd + armure' } : { icon: '⚔', text: 'Corps à corps + armure' };
  return age >= 4 ? { icon: '🚜', text: 'Blindé' } : { icon: '🐎', text: 'Charge rapide' };
}

/** Picto « personne + » de l'onglet Recruter */
const PERSON_PLUS = '<svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.6"/><path d="M2.5 20.5c0-3.8 2.9-6.2 6.5-6.2s6.5 2.4 6.5 6.2"/><path d="M19 8v6M16 11h6"/></svg>';

/** L'illustration de la carte de passage : un portail violet lumineux dans une arche dorée */
const PORTAL_ART = `<svg class="tpi" viewBox="0 0 120 60" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><defs><radialGradient id="tpiGlow" cx="50%" cy="58%" r="52%"><stop offset="0" stop-color="#fff6ff"/><stop offset=".3" stop-color="#e2b8ff"/><stop offset=".65" stop-color="#a55ff0" stop-opacity=".75"/><stop offset="1" stop-color="#6a2fc0" stop-opacity="0"/></radialGradient><linearGradient id="tpiVoid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c58cff"/><stop offset=".55" stop-color="#7b3fd6"/><stop offset="1" stop-color="#3d1a7a"/></linearGradient></defs><ellipse cx="60" cy="56" rx="50" ry="5" fill="#1e0b3c" opacity=".45"/><ellipse cx="60" cy="34" rx="50" ry="30" fill="url(#tpiGlow)"/><path d="M40 57V31a20 20 0 0 1 40 0v26z" fill="url(#tpiVoid)"/><path d="M60 37m-9 0a9 9 0 1 1 9 9a5.5 5.5 0 1 1-5.5-5.5" fill="none" stroke="#f6e2ff" stroke-width="2.4" stroke-linecap="round" opacity=".95"/><path d="M36 58V31a24 24 0 0 1 48 0v27" fill="none" stroke="#f6c35a" stroke-width="5" stroke-linejoin="round"/><path d="M36 58V31a24 24 0 0 1 48 0v27" fill="none" stroke="#fff2c8" stroke-width="1.2" opacity=".7"/><rect x="31" y="54" width="14" height="5" rx="1.5" fill="#e39a2f"/><rect x="75" y="54" width="14" height="5" rx="1.5" fill="#e39a2f"/><circle cx="60" cy="6.5" r="3" fill="#fff2c8"/><circle cx="22" cy="22" r="1.4" fill="#f3dcff"/><circle cx="99" cy="17" r="1.8" fill="#f3dcff"/><circle cx="104" cy="38" r="1.1" fill="#f3dcff"/><circle cx="16" cy="42" r="1.2" fill="#f3dcff"/></svg>`;
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
  /** l'outil de la base des Enfers (les boutons carrés à gauche de « Ma base ») */
  tool: BaseTool = 'select';
  /** le bâtiment qu'on déplace (son identifiant) ; la case où l'on a vérifié la place, et si elle convient */
  private moving: number | null = null;
  private moveAt = { cell: '', ok: false };
  /** le bâtiment désigné par un premier clic de démolition (un second clic, sous 4 s, le démolit) */
  private razeAsk: { id: number; t: number } | null = null;

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
    this.goalEl.innerHTML = `<i class="hgArrow"></i><span class="hgPin">${pic('🎯', 22)}<b></b></span>`;
    root.append(this.bar, this.box, this.alertEl, this.goalEl);
    this.bar.addEventListener('click', (e) => this.onBar(e));
  }

  get active() { return !!this.theater; }

  /** Prend le commandement d'une bataille (null : on le quitte) */
  setTheater(t: Theater | null) {
    if (this.theater?.layer && this.theater !== t) this.theater.layer.selected = new Set();
    this.placing = null;
    this.wall.reset();
    this.tool = 'select'; this.moving = null; this.razeAsk = null;
    this.theater?.ghost?.(null);
    this.theater = t;
    // hors des Enfers, `frame` n'est plus appelé : la cible du prochain bastion restait affichée à la surface
    if (t?.kind !== 'hell') this.goalEl.classList.remove('show');
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
    // un outil de la base : le bâtiment visé s'éclaire (vert : à déplacer, rouge : à démolir), le bâtiment déplacé suit le curseur
    if (this.tool !== 'select' && t.kind === 'hell') {
      if (p) this.toolHover(p);
      this.host.canvas.style.cursor = this.tool === 'move' ? (this.moving !== null ? 'copy' : 'grab') : 'crosshair';
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
    // un outil de la base : un bâtiment en main reste où il était ; sinon on lâche l'outil
    if (this.tool !== 'select') { this.dropTool(); return; }
    this.orderAt(e.x, e.y);
  }

  /** Prend un outil de la base (reprendre le même : on revient au choix des troupes) */
  setTool(tool: BaseTool) {
    const next = this.tool === tool ? 'select' : tool;
    if (this.placing) { this.placing = null; this.wall.reset(); }
    this.tool = next; this.moving = null; this.razeAsk = null; this.moveAt.cell = '';
    this.cmd.armed = null;
    this.theater?.ghost?.(null);
    this.host.canvas.style.cursor = '';
    if (next === 'move') this.host.toast(tr('Déplacer : cliquez un bâtiment de la base, puis sa nouvelle place. Échap ou clic droit : arrêter.'));
    else if (next === 'demolish') this.host.toast(tr('Démolir : cliquez un bâtiment de la base, puis encore une fois pour confirmer (rien n’est rendu). Échap ou clic droit : arrêter.'));
    this.barKey = '';
    this.render();
  }
  /** Échap ou clic droit avec un outil : le bâtiment en main reste à sa place ; sinon, retour au choix des troupes */
  private dropTool() {
    if (this.moving !== null) { this.moving = null; this.moveAt.cell = ''; this.theater?.ghost?.(null); this.render(); return; }
    this.setTool('select');
  }

  /** Le survol avec un outil de la base : le fantôme du bâtiment visé, ou du bâtiment déplacé à sa nouvelle place */
  private toolHover(p: [number, number]) {
    const t = this.theater, b = this.host.war.base;
    if (!t?.ghost || !b) return;
    if (this.moving !== null) {
      const it = b.hell.buildings.get(this.moving);
      if (!it || it.down) { this.moving = null; t.ghost(null); return; }
      // (la place n'est revérifiée que quand le curseur change de case)
      const cell = `${Math.floor(p[0])},${Math.floor(p[1])}`;
      if (cell !== this.moveAt.cell) this.moveAt = { cell, ok: b.relocateWhy(it, p[0], p[1]) === null };
      const camp = b.camp(zoneOfZ(Math.floor(p[1])));
      t.ghost(it.kind as BaseKind, p[0], p[1], this.moveAt.ok, camp ? [camp.site.x, camp.site.z] : null);
      return;
    }
    const it = b.at(p[0], p[1]);
    if (it) t.ghost(it.kind as BaseKind, it.site.x, it.site.z, this.tool === 'move' && it.kind !== 'camp');
    else t.ghost(null);
  }

  /** Un clic avec un outil de la base : prendre ou poser le bâtiment à déplacer ; désigner puis démolir */
  private toolAt(p: [number, number]) {
    const b = this.host.war.base;
    if (!b) return;
    const name = (k: string) => ({ icon: BASE_DEFS[k as BaseKind].icon, name: BASE_DEFS[k as BaseKind].name });
    if (this.tool === 'move' && this.moving !== null) {
      const it = b.hell.buildings.get(this.moving);
      if (!it || it.down) { this.moving = null; this.theater?.ghost?.(null); this.render(); return; }
      const why = b.relocate(it, p[0], p[1]);
      if (why) { this.host.toast(why); return; }
      this.host.click();
      this.host.toast(tr('{icon} {name} : déplacé.', name(it.kind)));
      this.moving = null; this.moveAt.cell = '';
      this.theater?.ghost?.(null);
      this.render();
      return;
    }
    const it = b.at(p[0], p[1]);
    if (!it) { this.host.toast(tr('Cliquez un bâtiment de votre base.')); return; }
    if (this.tool === 'move') {
      const why = it.kind === 'camp' ? tr('Le camp de base ne se déplace pas : c’est le cœur de la base.') : null;
      if (why) { this.host.toast(why); return; }
      this.moving = it.id; this.moveAt.cell = '';
      this.host.click();
      this.host.toast(tr('{icon} {name} : cliquez sa nouvelle place (Échap : le laisser où il est).', name(it.kind)));
      this.toolHover(p);
    } else {
      const now = performance.now();
      if (this.razeAsk?.id === it.id && now - this.razeAsk.t < 4000) {
        const why = b.demolish(it);
        this.razeAsk = null;
        if (why) this.host.toast(why);
        else { this.host.click(); this.host.toast(tr('{icon} {name} : démoli.', name(it.kind))); this.theater?.ghost?.(null); }
      } else {
        this.razeAsk = { id: it.id, t: now };
        this.host.toast(it.kind === 'camp' ? tr('Le camp de base ne se démolit pas : c’est le cœur de la base.') : tr('{icon} {name} : cliquez encore pour le démolir (rien n’est rendu).', name(it.kind)));
      }
    }
    this.render();
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
      this.tool = 'select'; this.moving = null; this.razeAsk = null;
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
    if (this.tool !== 'select' && t.kind === 'hell') { this.toolAt(p); return; }
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
      const a = escapeAction({ kind: t.kind, placing: !!this.placing, trace: !!this.wall.a, armed: !!this.cmd.armed, selected: this.cmd.selected.size, tool: this.tool !== 'select' });
      if (a === 'cancelTrace') this.cancelTrace();
      else if (a === 'stopPlacing') this.stopPlacing();
      else if (a === 'stopTool') { this.dropTool(); return true; }
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
    else if (a === 'tab:build' || a === 'tab:rec') { if (this.theater.kind === 'isle') this.isleTab = a === 'tab:rec' ? 'rec' : 'build'; else this.menuTab = a === 'tab:rec' ? 'rec' : 'build'; this.barKey = ''; this.render(); return; }
    else if (a.startsWith('ibuild:')) { const k = a.slice(7), why = this.host.defenseLock(k); if (why) this.host.toast(why); else { this.host.buildDefense(k); return; } }
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
    else if (a.startsWith('tool:')) { this.host.click(); this.setTool(a.slice(5) as BaseTool); return; }
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
    if (this.tool === 'move') return this.moving !== null ? tr('Cliquez la nouvelle place du bâtiment. Échap ou clic droit : le laisser où il est.') : tr('Déplacer : cliquez un bâtiment de la base (pas le camp). Échap pour arrêter.');
    if (this.tool === 'demolish') return tr('Démolir : cliquez un bâtiment, puis encore une fois pour confirmer. Rien n’est rendu.');
    if (this.overPortal) return tr('Clic droit : passer le portail');
    if (this.cmd.armed) return tr('Cliquez à l’endroit à attaquer : les soldats combattront ce qu’ils croisent.');
    if (n > 1) return tr('{n} soldats choisis : clic droit : envoyer · A attaquer · H tenir · R replier · glisser : tracer un cadre.', { n });
    if (n) return tr('{n} soldat choisi : clic droit : envoyer · A attaquer · H tenir · R replier · glisser : tracer un cadre.', { n });
    // sur l'île : le chemin des Enfers (la carte de passage est juste à gauche de la bulle)
    if (this.theater?.kind === 'isle' && !this.host.war.portalOut) return tr('Choisissez des soldats ci-dessus (clic), puis cliquez sur {btn} pour les envoyer.', { btn: `<b>${tr('Envoyer aux Enfers')}</b>` });
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
      return `<button class="tcard${on ? ' on' : ''}" data-a="kind:${k}" title="${tr('{who} : choisir (Maj : ajouter)', { who: `${troopForm(k, age).plural}${troopForm(k, age).name !== TROOPS[k].name ? tr(' (ex-{old})', { old: TROOPS[k].plural.toLowerCase() }) : ''}` })}"><span class="ti">${this.face(k, age, 30)}</span><span class="ttx"><b>${isle ? `${on ? `${on} / ` : ''}` : `${on} / `}${of.length}</b><span class="tn">${troopForm(k, age).plural}</span></span><i style="width:${Math.round(hp * 100)}%" class="${hp < 0.35 ? 'low' : ''}"></i></button>`;
    }).join('');
    const ctx = w.recruitCtx(this.host.age(), this.host.pop());
    // à droite : le même menu que dans les Enfers (« Ma garnison » sur l'île : Bâtir les défenses, Recruter), avec ses deux onglets
    const rec = isle ? this.isleRow(ctx, age) : this.baseRow();
    // en haut : le ruban d'état (vague et cor, garnison, zone suivante)
    const next = w.nextWaveIn(), raid = isle && w.isle?.raid;
    const wounded = w.army.troops.filter((x) => x.heal > 0).length;
    const status = isle ? this.waveStatus(next, !!raid) : '';
    // après la victoire sur l'invasion : le guidage pas à pas vers les Enfers (choisir les troupes, puis les envoyer)
    const step = isle ? w.guideStep(sel.selected.size) : null;
    // (la flèche émoji, bleue, cède la place à un picto du portail)
    const guide = step ? `<div class="tpill tguide">${pic('🌀', 16)} ${(step === 'select' ? tr('➡️ Vers les Enfers : choisissez vos troupes (bouton « Tous »).') : tr('➡️ Vers les Enfers : envoyez-les avec « Envoyer aux Enfers ».')).replace(/^➡️\s*/, '')}</div>` : '';
    // (accolées au panneau des vagues : la garnison et les blessés, en pastilles crème)
    const garrison = `<span class="tpill" title="${tr('Soldats de la garnison de l’île, sur le maximum que la caserne peut loger')}">${pic('🛡', 16)} ${tr('Garnison')} <b>${armySize(w.army)} / ${armyCap(ctx)}</b></span>`;
    const side = `<div class="twside">${garrison}${wounded ? `<span class="tpill twd" title="${tr('Blessés qui se soignent à la caserne')}">${pic('🩹', 16)} ${nplural(wounded, 'blessé', 'blessés')}</span>` : ''}</div>`;
    const ribbon = `${guide}${status}${side}`;
    const none = isle ? tr('Aucune troupe sur l’île : recrutez à la caserne (à droite).') : w.army.troops.some((x) => x.where === 'hell') ? tr('Aucune troupe debout ici : les blessés se soignent.') : tr('Aucune troupe ici : faites venir la garnison de l’île (Renforts, à gauche).');
    // dans les Enfers : une seule frise compacte (le front, l'alerte, l'armée) ; sur l'île, le ruban de pastilles
    this.bar.classList.toggle('inhell', !isle);
    // la bulle d'aide du moment (à droite de la carte de passage) ; sans troupe ici, ce qu'il faut faire pour en avoir
    const tip = !us.length && !this.placing && this.tool === 'select' ? none : this.hint();
    // au-dessus de la rangée : les troupes sur le terrain (une carte par sorte, « Tous »), seulement s'il y en a
    const field = us.length ? `<div class="tbot panel"><div class="tcards">${cards}<button class="tall${step === 'select' ? ' guide' : ''}" data-a="all" title="${tr('Toutes les troupes')}">${tr('Tous')}</button></div></div>` : '';
    const html = `${isle ? `<div class="tstate twtop">${ribbon}</div>` : this.frontBar(wounded)}
      <div class="tfoot ${isle ? 'tisle' : 'thell'}">
        ${field}
        ${this.passDock(isle, step)}
        <div class="tbub" role="status"><span class="tbi" aria-hidden="true">i</span><p class="thint">${tip}</p></div>
        ${isle ? '' : this.toolDock()}
        ${rec}
        <div class="tcorner panel"><button data-a="help" class="thb${this.helpOpen ? ' on' : ''}" title="${tr('Rappel des contrôles')}"><span class="tq">?</span><span class="tl">${tr('Aide')}</span></button><button data-a="leave" class="tx go" title="${isle ? tr('Retourner au village (Échap)') : tr('Quitter les Enfers et revenir sur l’île')}"><span class="oi">${pic(isle ? '🏠' : '🏝', 24)}</span><span class="tl">${isle ? tr('Retourner au village') : tr('Retourner sur l’île')}</span></button></div>
      </div>${this.helpOpen ? `<ul class="thelp panel">${CONTROLS_HELP.map(([k, t]) => `<li><b>${tr(k)}</b><span>${tr(t)}</span></li>`).join('')}</ul>` : ''}`;
    if (html !== this.barKey) { this.barKey = html; this.bar.innerHTML = html; }
  }

  /**
   * Le panneau des vagues, centré en haut de l'île (crème et or, comme la barre du bas) : un médaillon, un en-tête en petites
   * capitales, le compte à rebours en grand, la force prévue en pilule, une jauge du temps qui reste et le cor (« Appeler la
   * prochaine vague », terni avec sa raison en infobulle quand il ne sert pas). Vague en cours ou invasion annoncée : rouge
   * brique, les démons encore debout. Avant l'invasion : ce qu'il lui faut, coché au fur et à mesure. Portail fermé ou pas encore
   * choisi : le bouton qui rouvre le choix. Les états pressants gardent `wst hot` (le tutoriel s'y accroche)
   */
  private waveStatus(next: number | null, raid: boolean) {
    const w = this.host.war, f = w.faction;
    const esc = (s: string) => s.replace(/"/g, '&quot;');
    const box = (mod: string, hot: boolean, icon: string, head: string, main: string, foot = '', act = '') =>
      `<div class="twave ${mod} wst${hot ? ' hot' : ''}" role="status"><span class="twm" aria-hidden="true">${pic(icon, 30)}</span><div class="twc"><small class="twh">${head}</small><div class="twr">${main}</div>${foot}</div>${act ? `<div class="twa">${act}</div>` : ''}</div>`;
    const gauge = (k: number, tip: string) => `<span class="twg" title="${esc(tip)}"><i style="width:${Math.round(Math.max(0, Math.min(1, k)) * 100)}%"></i></span>`;
    const note = (s: string) => `<p class="twn">${s}</p>`;
    const btn = (a: string, icon: string, label: string, tip: string, off = false) => `<button data-a="${a}" class="twb${icon ? ' ico' : ''}${off ? ' off' : ''}" title="${esc(tip)}"${off ? ' aria-disabled="true"' : ''}>${icon ? pic(icon, 18) : ''}<span class="twl">${label}</span></button>`;
    const forceText = (v: ReturnType<typeof waveForce> | null) => v === 'big' ? tr('Grosse vague') : v === 'medium' ? tr('Vague moyenne') : v === 'small' ? tr('Petite vague') : '';
    const pill = (s: string, cls = '') => s ? `<span class="twp${cls ? ` ${cls}` : ''}">${s}</span>` : '';
    if (w.pve === 'off') return box('lock', true, '🔒', tr('Les vagues'), `<b class="twt sm">${tr('Portail fermé')}</b>`, note(tr('Aucune vague tant qu’il reste fermé.')), btn('pveChoice', '', tr('Rouvrir'), tr('Choisir à nouveau : affronter les démons ou garder le portail fermé')));
    if (w.pve === 'ask') return box('lock', true, '🌀', tr('Le portail'), `<b class="twt sm">${tr('Les Enfers')}</b>`, note(tr('Affronter les démons, ou refermer le portail.')), btn('pveChoice', '', tr('Affronter…'), tr('Choisir : affronter les démons ou fermer le portail')));
    if (w.inv === 'ready' && !raid) return box('ready', true, '⚔', tr('Invasion'), `<b class="twt sm">${tr('Prête')}</b>`, note(tr('Elle part sur votre signal, {s} s plus tard.', { s: INVASION_DELAY })), btn('fight', '⚔', tr('Affronter'), tr('Lancer l’invasion : les démons sortent du portail {s} s plus tard', { s: INVASION_DELAY })));
    if (raid) {
      // (les démons encore debout, sur ceux de la vague)
      const r = w.isle!.raid!, n = w.isle!.raiders().length, tot = Math.max(1, r.units.length);
      return box('alert', true, '🔥', w.inv === 'raid' ? tr('Invasion en cours') : tr('Vague en cours'), `<b class="twt">${n}<small>/${tot}</small></b><span class="twu">${plural(n, 'démon debout', 'démons debout')}</span>${pill(forceText(waveForce(r.units.map((u) => u.kind))))}`, gauge(n / tot, tr('Démons encore debout')));
    }
    if (next === null) {
      // avant l'invasion : ce qu'il lui faut (une tour, une caserne, des soldats valides sur l'île), coché au fur et à mesure
      if (w.active && w.pve === 'on' && w.inv === 'wait') {
        const need = w.invasionNeed(), g = w.garrison();
        const item = (ok: boolean, s: string) => `<span class="twk${ok ? ' ok' : ''}">${ok ? '✓' : '·'} ${s}</span>`;
        const list = item(this.host.defenseCount('watchtower') > 0, this.host.defenseInfo('watchtower').name) + item(this.host.defenseCount('barracks') > 0, this.host.defenseInfo('barracks').name) + item(g >= need, tr('{n} / {m} soldats', { n: Math.min(g, need), m: need }));
        return box('prep', true, '⚠', tr('Invasion à venir'), `<span class="twks">${list}</span>`);
      }
      // une zone des Enfers tenue suspend les vagues
      if (f && !f.victory && f.frontPosts > 0 && w.pve === 'on' && w.inv === 'done') return box('calm', false, '🌀', tr('Les vagues'), `<b class="twt sm">${tr('Suspendues')}</b>`, note(tr('Aucune vague tant que vous tenez une zone des Enfers.')));
      return '';
    }
    // le compte à rebours : la jauge se vide jusqu'à la vague (sur l'intervalle entre deux vagues, ou le délai de l'invasion)
    const coming = w.inv === 'coming', why = w.callWhy(), left = Math.ceil(next);
    const span = Math.max(left, 1, coming ? INVASION_DELAY : f ? raidInterval(f.raidLevel, f.islandSecured) : 0);
    // (dans les dernières secondes, la vague est composée et annoncée : son nombre de démons s'ajoute)
    const planned = !coming && f?.planned ? f.planned.length : 0;
    const near = coming ? 'alert' : next <= WARN_TIME ? 'next near' : 'next';
    const main = `<b class="twt">${clockText(next)}</b>${pill(forceText(w.nextForce()))}${planned ? pill(nplural(planned, 'démon', 'démons'), 'n') : ''}`;
    return box(near, coming, coming ? '🔥' : '🌀', coming ? tr('Invasion dans') : tr('Prochaine vague dans'), main, gauge(left / span, tr('Temps qui reste avant la vague')),
      btn('wave', '🎺', tr('Appeler la prochaine vague'), why ?? tr('Sonner le cor : faire venir la prochaine vague tout de suite, sans attendre'), !!why));
  }

  /** L'onglet ouvert du menu de la garnison (île) : recruter d'abord, c'est ce qu'on fait le plus souvent */
  private isleTab: 'build' | 'rec' = 'rec';
  /** Ouvre le menu de l'île sur cet onglet (l'île sans ses défenses : « Bâtir ») */
  isleMenu(tab: 'build' | 'rec') {
    if (this.isleTab === tab) return;
    this.isleTab = tab;
    this.barKey = '';
    this.render();
  }

  /**
   * Le menu de l'île, le même composant que « Ma base » des Enfers : « Ma garnison » avec les onglets Bâtir (les défenses de
   * l'île : tour de garde, caserne, remparts) et Recruter (les recrues, leur état et la file « en route »)
   */
  private isleRow(ctx: ReturnType<War['recruitCtx']>, age: number) {
    const w = this.host.war, tab = this.isleTab;
    const queue = w.army.queue.length || this.waiting.length
      ? `<small class="q">${tr('En route :')} ${[...this.waiting.map((k) => `${pic(troopForm(k, age).icon, 16)}${pic('🛠', 14)}`), ...w.army.queue.map((q) => `${pic(troopForm(q.kind, age).icon, 16)} ${Math.ceil(q.left)} s`)].join(' · ')}</small>` : '';
    const esc = (s: string) => s.replace(/"/g, '&quot;');
    let inner: string;
    if (tab === 'rec') {
      inner = `<div class="tfam"><div class="tbuilds">${TROOP_KINDS.filter((k) => age >= TROOPS[k].age).map((k) => {
        const why = recruitWhy(w.army, k, ctx);
        // il ne manque que l'équipement : un clic le fait fabriquer, la recrue part dès qu'il est prêt
        const craft = !!why && onlyGearMissing(w.army, k, ctx);
        const fm = troopForm(k, age);
        const tip = craft ? tr('{why} : cliquez, l’atelier du village fabrique l’équipement et la recrue part dès qu’il est prêt', { why: noCraft(why!) }) : why ?? tr('Recruter : {troop}. {desc} ({items}, {time} s)', { troop: troopLabel(k, age), desc: fm.desc, items: andJoin([...fm.gear.map((g) => `1 ${gearName(g)}`), ...(fm.mount ? [tr('1 cheval de l’écurie')] : [])]), time: TROOPS[k].time });
        const note = craft ? tr('à fabriquer') : why ? shortWhy(noCraft(why)) : '';
        return this.troopCard(`rec:${k}`, k, age, why ? (craft ? 'craft' : 'off') : 'go', `${tr('{name} : {tip}', { name: fm.name, tip })}${fm.name !== TROOPS[k].name ? tr(' (ex-{old})', { old: TROOPS[k].name.toLowerCase() }) : ''}`, note, TROOPS[k].time);
      }).join('')}</div></div>`;
    } else {
      // (poser une défense : on quitte le commandement, l'outil de construction du village prend la main)
      const tile = (k: string) => {
        const d = this.host.defenseInfo(k), why = this.host.defenseLock(k), n = this.host.defenseCount(k);
        return `<button data-a="ibuild:${k}" class="trb tb tbv${why ? ' off' : ''}" title="${esc(`${d.name}. ${why ?? d.desc}`)}">${this.preview(`d:${k}:${age}`, () => this.host.defenseThumb?.(k, age), d.icon)}<b>${d.name}</b><small class="co">${why ? `${pic('🔒', 12)} ${tr('verrouillé')}` : n ? tr('{n} en place', { n }) : tr('à poser')}</small></button>`;
      };
      // (les familles se lisent au filet qui les sépare ; leur nom est dans l'infobulle)
      const fam = (cls: string, title: string, inner2: string) => `<div class="tfam ${cls}" title="${tr(title)}"><div class="tbuilds">${inner2}</div></div>`;
      inner = `${fam('hold', 'Garder l’île', tile('watchtower') + tile('barracks'))}${fam('def', 'Remparts', tile('wall') + tile('gate'))}`;
    }
    const size = armySize(w.army), cap = armyCap(ctx);
    return `<div class="tmenu panel tbase tbarr"><div class="tmh"><h5>${pic('👥', 20)}<span class="tmt">${tr('Ma garnison')}</span><small>${size} / ${cap}</small></h5><i class="tprog" title="${tr('Soldats de la garnison de l’île, sur le maximum que la caserne peut loger')}"><i style="width:${cap ? Math.min(100, Math.round((size / cap) * 100)) : 0}%"></i></i>${queue}</div><div class="tmbody"><div class="tmrow">${inner}</div>${this.tabs(tab)}</div></div>`;
  }

  /** Les onglets Bâtir et Recruter (pilules empilées, l'ouvert doré) : à droite de « Ma garnison », à gauche de « Ma base » */
  private tabs(tab: 'build' | 'rec') {
    return `<span class="ttabs"><button data-a="tab:build" class="${tab === 'build' ? 'on' : ''}">${pic('🔨', 18)}<span>${tr('Bâtir')}</span></button><button data-a="tab:rec" class="${tab === 'rec' ? 'on' : ''}">${PERSON_PLUS}<span>${tr('Recruter')}</span></button></span>`;
  }

  /** Les aperçus en attente de leur vignette : clé → le HTML du picto de repli (tel qu'il est dans `barKey`) et de quoi relire la vignette */
  private thumbWait = new Map<string, { html: string; get: () => string | null | undefined }>();
  /** L'aperçu prêt : la vignette 3D en tête de carte */
  private static previewImg(url: string) { return `<span class="tic tpv"><img src="${url}" alt="" draggable="false"></span>`; }

  /**
   * L'aperçu 3D d'un bâtiment en tête de sa carte (onglet Bâtir) : la vignette de la barre de construction si elle est prête,
   * sinon le picto, gardé en attente (`thumbsReady` le remplace sur place quand elle arrive)
   */
  private preview(key: string, get: () => string | null | undefined, icon: string) {
    const url = get();
    if (url) return CommandUI.previewImg(url);
    const html = `<span class="tic" data-th="${key}">${pic(icon, 34)}</span>`;
    this.thumbWait.set(key, { html, get });
    return html;
  }

  /**
   * Une vignette 3D vient d'être rendue : les cartes qui l'attendaient prennent leur aperçu sur place (rien d'autre n'est
   * redessiné), et `barKey` suit, pour que le prochain `render` n'y voie aucun changement
   */
  thumbsReady() {
    for (const [key, w] of this.thumbWait) {
      const url = w.get();
      if (!url) continue;
      this.thumbWait.delete(key);
      if (!this.barKey.includes(w.html)) continue;
      const done = CommandUI.previewImg(url);
      this.barKey = this.barKey.split(w.html).join(done);
      this.bar.querySelectorAll(`[data-th="${key}"]`).forEach((el) => { el.outerHTML = done; });
    }
  }

  /** Le visage d'une troupe : son portrait (rendu du modèle 3D, ou dessin fourni) s'il est prêt, sinon son picto */
  private face(k: TroopKind, age: number, size: number) {
    const u = this.host.portrait?.(k, age);
    return u ? `<img class="tpimg" src="${u}" alt="" draggable="false" decoding="async">` : pic(troopForm(k, age).icon, size);
  }

  /**
   * Une carte de recrue, la même sur l'île et dans les Enfers : le portrait en pied à gauche ; le nom et le rôle en pilule à
   * droite ; en pied, ce qu'elle prend (une place, ses pièces, le cheval, le temps), ou la raison du refus (pilule rouge,
   * cadenas), ou « à fabriquer » (pilule ambrée)
   */
  private troopCard(a: string, k: TroopKind, age: number, state: 'go' | 'craft' | 'off', tip: string, note: string, time: number) {
    const fm = troopForm(k, age), r = troopRole(k, age), port = this.host.portrait?.(k, age);
    const foot = state === 'go' ? CommandUI.troopCost(k, age, time) : `<span class="tpill ${state}">${pic(state === 'off' ? '🔒' : '🛠', 13)}<span>${note}</span></span>`;
    return `<button data-a="${a}" class="trb tb rh trc ${state}" title="${tip.replace(/"/g, '&quot;')}"><span class="tpo${port ? '' : ' none'}">${port ? `<img class="tpimg" src="${port}" alt="" draggable="false" decoding="async">` : pic(fm.icon, 38)}</span><span class="ttx"><b>${fm.name}</b><span class="trole">${pic(r.icon, 14)}<span>${tr(r.text)}</span></span></span><span class="tco">${foot}</span></button>`;
  }

  /** Ce que prend une recrue, en pastilles : une place de la garnison, une de chaque pièce, le cheval, la durée */
  private static troopCost(k: TroopKind, age: number, time: number) {
    const fm = troopForm(k, age), it = (title: string, img: string, n: string) => `<span title="${title}">${img}${n}</span>`;
    return [
      it(tr('Une place de la garnison'), pic('👥', 14), '1'),
      ...fm.gear.map((g) => it(gearName(g), `<img class="pic" src="./icons/gear/${g}.webp" width="14" height="14" alt="" draggable="false" decoding="async">`, '1')),
      ...(fm.mount ? [it(tr('cheval'), pic('🐎', 14), '1')] : []),
      it(tr('Durée du recrutement'), pic('⏳', 13), `${time} s`),
    ].join('');
  }

  /**
   * Le seul dock de gauche : UN bouton pour faire passer les troupes choisies d'un monde à l'autre (les ordres se donnent au
   * clavier : A, H, R, Espace, et au clic droit) ; à côté, en plus discret, le lien « Voir les Enfers » (île) ou « Renforts » (Enfers)
   */
  private passDock(isle: boolean, step: 'select' | 'send' | null = null) {
    const w = this.host.war, n = this.cmd.selected.size, closed = isle ? w.hellWhy() : null;
    const main = isle && w.portalOut ? '' : `<button data-a="portal" class="tord prt${n ? '' : ' idle'}${closed ? ' closed' : ''}${step === 'send' ? ' guide' : ''}" title="${isle ? (closed ?? tr('Les troupes choisies passent le portail et partent en expédition dans les Enfers (facultatif)')) : tr('Les troupes choisies repassent le portail et rentrent sur l’île')}"><span class="oi">${pic('🌀', 24)}</span><span class="tpt"><b>${isle ? tr('Envoyer aux Enfers') : tr('Renvoyer les troupes sur l’île')}</b><small>${n > 1 ? tr('{n} troupes choisies', { n }) : n ? tr('{n} troupe choisie', { n }) : tr('choisir des troupes')}</small></span>${PORTAL_ART}</button>`;
    const links = this.hellLinks(isle);
    return main || links ? `<div class="tfl">${main}${links}</div>` : '';
  }

  /**
   * Les passages entre l'île et les Enfers : de l'île, aller voir les troupes et la base des Enfers (sans quoi on n'y entrait
   * qu'en cliquant la nouvelle d'un passage) ; des Enfers, faire venir en renfort les troupes valides de l'île
   */
  private hellLinks(isle: boolean) {
    const w = this.host.war;
    if (isle) return w.hellPresence() || (w.hellWhy() && w.pve === 'on') ? `<button data-a="goHell" class="tord gth sm${w.hellWhy() ? ' closed' : ''}" title="${w.hellWhy() ?? tr('Aller dans les Enfers, auprès des troupes et de la base avancée')}"><span class="oi">${pic('🔥', 20)}</span>${tr('Voir les Enfers')}</button>` : '';
    const n = w.portalOut || !w.isle ? 0 : w.troopsIn(w.isle.sim).filter((u) => !w.crossing.has(u.id)).length;
    return n ? `<button data-a="garrison" class="tord gar sm" title="${tr('Renforts : les {n} de l’île passent le portail et vous rejoignent', { n: `${n} ${plural(n, 'troupe', 'troupes')} ${plural(n, 'valide', 'valides')}` })}"><span class="oi">${pic('🌀', 20)}</span>${tr('Renforts')} +${n}</button>` : '';
  }

  /** L'onglet ouvert du menu de la base (Enfers) : bâtir ou recruter */
  private menuTab: 'build' | 'rec' = 'build';
  /** Les noms courts des bâtiments de la base dans la barre du bas (le nom entier est dans l'infobulle) */
  private static BSHORT: Record<BaseKind, string> = { camp: 'Camp', post: 'Caserne', smithy: 'Forge', infirmary: 'Infirmerie', tower: 'Tour', palisade: 'Mur', gate: 'Porte', brazier: 'Brasero' };
  /** Un coût en pastilles courtes (🌲 bois, ⛰️ pierre, ⛏️ minerai) */
  private static costIcons(c: BaseCost) { return [c.wood ? `<span>${pic('🌲', 14)}${c.wood}</span>` : '', c.stone ? `<span>${pic('⛰️', 14)}${c.stone}</span>` : '', c.ore ? `<span>${pic('⛏️', 14)}${c.ore}</span>` : ''].filter(Boolean).join(' ') || tr('gratuit'); }

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
      return `<button data-a="build:${k}" class="trb tb tbv${this.placing === k ? ' on' : ''}${why ? ' off' : ''}${extra}" title="${`${tr('{name} ({cost}) : {legend}', { name: d.name, cost: costText(d.cost), legend: tr(legend) })}. ${d.desc}${why ? ` — ${why}` : ''}`.replace(/"/g, '&quot;')}">${this.preview(`b:${k}:${age}`, () => this.host.baseThumb?.(k, age), d.icon)}<b>${tr(CommandUI.BSHORT[k])}</b><small class="co">${CommandUI.costIcons(d.cost)}</small></button>`;
    };
    // (les familles — tenir, défendre, éclairer — se lisent au filet qui les sépare ; leur nom est dans l'infobulle)
    const fam = (cls: string, title: string, tip: string, inner: string) => `<div class="tfam ${cls}" title="${tr(title)} : ${tr(tip)}"><div class="tbuilds">${inner}</div></div>`;
    const tab = this.menuTab;
    const inner = tab === 'build'
      ? `${fam('hold', 'Tenir', 'Tenir la zone', btn('camp', hasCamp ? 'point de repli' : 'à poser d’abord', hasCamp ? '' : ' first') + btn('post', 'recrues sur place') + btn('smithy', '+20 % de force') + btn('infirmary', 'soins rapides'))}${
        fam('def', 'Défendre', 'Se défendre', btn('tower', 'archers') + btn('palisade', 'glisser pour tracer') + btn('gate', 'sur un mur'))}${
        fam('lit', 'Éclairer', 'Éclairer : repousse la brume', btn('brazier', 'repousse la brume'))}`
      : `<div class="tfam"><div class="tbuilds">${TROOP_KINDS.filter((k) => age >= TROOPS[k].age).map((k) => {
        const p = this.hellPlan(k), fm = troopForm(k, age);
        return this.troopCard(`rech:${k}`, k, age, p.state === 'ready' ? 'go' : p.state === 'craft' ? 'craft' : 'off', `${troopLabel(k, age)}. ${fm.desc} — ${p.tip}`, p.sub, Math.round(TROOPS[k].time * 0.75));
      }).join('')}</div></div>`;
    return `<div class="tmenu panel tbase tbarr"><div class="tmh"><h5 title="${tr('La base avancée : bâtissez dans le seuil du portail ou dans une zone conquise ; la brume s’ouvre jusqu’{zone}', { zone: zoneTo(zi) })}">${pic('⛺', 20)}<span class="tmt">${tr('Ma base')}</span></h5>${this.hellQueue()}</div><div class="tmbody"><div class="tmrow">${inner}</div></div></div>`;
  }

  /**
   * À gauche de « Ma base » (Enfers) : les onglets Bâtir / Recruter, et dessous les outils de la base en boutons carrés :
   * choisir les troupes (l'outil ordinaire), déplacer un bâtiment, le démolir. (Pas de « tourner » : les bâtiments de la base
   * n'ont pas d'orientation, ils font face au portail d'eux-mêmes.)
   */
  private toolDock() {
    const btn = (k: BaseTool, icon: string, label: string) => `<button data-a="tool:${k}" class="ttl${this.tool === k ? ' on' : ''}" title="${label}" aria-label="${label}">${icon}</button>`;
    return `<div class="ttool panel">${this.tabs(this.menuTab)}<span class="ttools">${btn('select', ic('pointer', 22, 2), tr('Choisir les troupes (l’outil ordinaire)'))}${btn('move', ic('hand', 22, 2), tr('Déplacer un bâtiment de la base'))}${btn('demolish', ic('demolish', 22, 2), tr('Démolir un bâtiment de la base (rien n’est rendu)'))}</span></div>`;
  }

  /** La file des recrues des Enfers : « En route : 🛡️ 12 s » (et 🛠️ pour celles qui attendent l'atelier) */
  private hellQueue() {
    const w = this.host.war, age = this.host.age();
    const l = [...this.waitingHell.map((k) => `${pic(troopForm(k, age).icon, 16)}${pic('🛠', 14)}`), ...w.army.queue.filter((q) => q.at === 'hell').map((q) => `${pic(troopForm(q.kind, age).icon, 16)} ${Math.ceil(q.left)} s`)];
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
    const garr = `<span class="tfi" title="${tr('Soldats de l’armée, sur le maximum')}">${pic('🛡', 16)} <b>${armySize(w.army)} / ${armyCap(ctx)}</b></span>${wounded ? `<span class="tfi" title="${tr('Blessés qui se soignent à la caserne')}">${pic('🩹', 16)} ${wounded}</span>` : ''}`;
    const al = alerts[0];
    const zn = this.host.zoneName?.();
    // la deuxième ligne : la zone ouverte, l'objectif (la distance se met à jour à part, sans refaire la barre), centrer, suivre, recrues en route
    const g = this.goal, row = f ? `<div class="tgoal"><span class="tgz">${zoneLine(f)}</span>${g ? `<span class="tgo">${goalLine(g, null)}<b class="tgd"></b></span>` : ''}${g && g.x !== undefined ? `<button data-a="goal" class="tgb" title="${tr('Centrer la vue sur l’objectif')}">${pic('🎯', 16)} ${tr('Centrer')}</button>` : ''}<button data-a="follow" class="tgb${this.host.following?.() ? ' on' : ''}" title="${tr('La vue suit les troupes envoyées ; déplacer la vue reprend la main')}">📷 ${tr('Suivre')}</button>${this.recruitChip()}${al ? `<span class="tfa" title="${al.text.replace(/"/g, '&quot;')}">⚠️ ${al.text}</span>` : ''}</div>` : '';
    return `<div class="tstate tfcol"><div class="tfrise">${zn ? `<span class="tfn" title="${tr('La zone où se trouve la vue ; le portail ramène sur l’île (bouton Rentrer sur l’île)')}">🔥 ${zn}</span>` : ''}<div class="tfz">${nodes}</div><div class="tfs">${garr}</div></div>${row}</div>`;
  }

  /** Les recrues en route vers le camp (équipement en fabrication comprises) : « 2 recrues en route » */
  private hellQueueCount() { return this.waitingHell.length + this.host.war.army.queue.filter((q) => q.at === 'hell').length; }
  private recruitChip() {
    const n = this.hellQueueCount();
    return n ? `<span class="tgq" title="${tr('Elles arrivent au camp dès que leur équipement est prêt')}">${pic('⏳', 16)} ${tr('{n} en route', { n: nplural(n, 'recrue', 'recrues') })}</span>` : '';
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
