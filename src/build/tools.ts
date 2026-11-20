import { strokeRoad } from './roadLine';
import * as THREE from 'three';
import { World, N, VEG_FOREST, VEG_FIELD, VEG_ROCKS, VEG_CAVE, Snapshot } from '../world/world';
import { sculpt, raiseVolcano, removeVolcano, SculptTool, SculptCtx, brushOnBuilding, volcanoRadius } from '../world/terraform';
import { TerrainView } from '../render/terrainView';
import { CameraRig, PointerInfo, ToolInput } from '../core/camera';
import { KINDS, KindId, Building, hasDoor, sizeOf, smallSize, isRampart, isLinear, isDecor } from './catalog';
import { getModel } from '../render/models';
import { mats, setGhostValid } from '../render/materials';
import { facingRoadRot, footprintOrigin, doorCells, doorSide, orientable, sideToward } from './placement';
import { autoRoad, unlayAccess } from './autoroads';
import { planRoad, RoadPlan } from './freeRoad';
import { sampleCurve } from '../world/curves';
import { priceIn, canPay, pay, shortLabel, refund, Cost } from '../sim/economy';
import { hash2 } from '../core/rng';
import { AudioEngine } from '../audio/audio';
import { ZoneHighlight } from './zones';
import { CoverageView } from '../render/coverageView';
import { isStart, startRefusal, START_KIND } from './startLock';
import { traceRampart, layRampart, rampartCost, RampartTrace, rampartMask, toggledTower } from './rampart';
import { linearMask } from './decor';
import { costLabel } from '../sim/economy';
import { tr } from '../i18n';

export type ToolId = 'none' | SculptTool | 'forest' | 'field' | 'biome' | 'rocks' | 'cave' | 'fissure' | 'erase' | 'road' | 'build' | 'bulldoze' | 'move';

export const SCULPT_TOOLS: ToolId[] = ['raise', 'lower', 'flatten', 'cliff', 'dig', 'mountain', 'volcano'];
export const VEG_TOOLS: ToolId[] = ['forest', 'field', 'rocks', 'cave', 'fissure', 'erase'];
/** Décors posés d'un clic, sans pinceau (la faille se creuse au pinceau, en glissant) */
export const SINGLE_TOOLS: ToolId[] = ['cave'];
/** Tracé des routes : en glissant, case par case (« Ligne »), ou d'un point A à un point B, en courbe (« Libre ») */
export type RoadMode = 'line' | 'free';

/**
 * Éditeur posé par-dessus les outils (tracé d'une voie ferrée) : il reçoit le clic en premier, et le garde (puis le glissé et
 * le relâcher) s'il le prend ; `hover` lui dit où est le pointeur et rend le curseur à afficher
 */
export interface Overlay {
  down(hit: THREE.Vector3): boolean;
  move(hit: THREE.Vector3): void;
  up(hit: THREE.Vector3 | null): void;
  hover(hit: THREE.Vector3 | null): string;
}

export interface ToolHost {
  world: World;
  /** un fer céleste à ramasser sous le pointeur (après une pluie de météorites) ; `collect` le ramasse */
  ironAt?: (x: number, z: number) => boolean;
  collect?: (x: number, z: number) => boolean;
  /** vrai si un torrent ou un ruisseau passe par cette case (rien ne se plante dans l'eau) */
  wetCell?: (k: number) => boolean;
  terrain: TerrainView;
  cam: CameraRig;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  audio: AudioEngine;
  getAge(): number;
  toast(msg: string): void;
  /** un geste sur la carte refusé : la raison, bien en vue sous le curseur (à défaut, un message) */
  refuse?(msg: string): void;
  changed(): void;
  /** un clic sur le portail des Enfers (hors bâtiment) : on y passe */
  openPortal?(): void;
  /** fait entrer en éruption le volcan posé sur la case */
  erupt(cell: number): void;
  /** routes automatiques jusqu'aux nouveaux bâtiments (réglage) */
  autoRoads: boolean;
  /** l'habitant sous ce point de l'écran (pixels du canevas), s'il y en a un */
  pickCitizen?(x: number, y: number): number | null;
  /** l'habitant choisi change (null : aucun) */
  onCitizen?(id: number | null): void;
}

/** Bâtiments de zone dont la surbrillance verte reste visible pendant la pose et à la sélection */
const STAY_ZONE: KindId[] = ['lumber', 'quarry'];

export class ToolController implements ToolInput {
  tool: ToolId = 'none';
  kind: KindId = 'house';
  radius = 3;
  /** biome que peint le pinceau de biome (null : rendre au climat) */
  biomeKind: number | null = 0;
  ghostRot = 0;
  rotManual = false;
  undoStack: Snapshot[] = [];
  redoStack: Snapshot[] = [];
  hit: THREE.Vector3 | null = null;
  private pressed = false;
  private touchMode = false;
  private pre: Snapshot | null = null;
  private strokeChanged = false;
  private ctx: SculptCtx = { target: 0 };
  private lastRoad: { x: number; z: number } | null = null;
  /** cases posées par le trait de route en cours (mode « Ligne ») */
  private roadStroke = new Set<number>();
  private vegTimer = 0;
  private moveOrigin: { kind: KindId; x: number; z: number; rot: number; auto: boolean; small: boolean } | null = null;
  /** bâtiment choisi d'un clic avec l'outil « Voir » : sa fiche s'affiche, on peut le déplacer, le tourner, le démolir */
  selected: number | null = null;
  /** l'habitant choisi d'un clic (sa fiche à la place de celle d'un bâtiment) */
  citizen: number | null = null;
  /** tracé d'une ligne de chemin de fer en cours : un clic sur un bâtiment le propose comme arrêt */
  picking = false;
  pickStop: ((b: Building | undefined) => void) | null = null;
  /** éditeur du tracé d'une voie ferrée, prioritaire sur l'outil ; il a pris le clic en cours */
  overlay: Overlay | null = null;
  private overlayHeld = false;
  /** où le clic a commencé (un glissé n'est pas un clic) */
  private downAt: [number, number] | null = null;
  /** un geste en cours : bouton enfoncé sur la carte (pose, tracé, glissé) */
  get pressing() { return !!this.downAt; }
  private lastToast = 0;
  /** mode de tracé des routes ; en mode libre, le point A choisi (centre de sa case) et la route prévue jusqu'au pointeur */
  roadMode: RoadMode = 'free';
  private freeFrom: [number, number] | null = null;
  private freePlan: RoadPlan | null = null;
  private freeKey = '';
  /** où le glissé du mode libre a commencé (relâcher loin de là pose la route) */
  private freeDrag: [number, number] | null = null;
  private freeLine: THREE.Mesh;
  private freeDot: THREE.Mesh;
  /** anneau qui bat autour du point A, et flèche de direction au bout de la route prévue */
  private freePulse: THREE.Mesh;
  private freeArrow: THREE.Mesh;
  private pulseT = 0;
  /** le tracé d'un rempart (point A dans `freeFrom`) : une tuile par case, verte si le pan s'y pose, rouge sinon */
  private wallCells: THREE.InstancedMesh;
  private wallTrace: RampartTrace | null = null;
  private wallKey = '';

  private ring: THREE.LineLoop;
  private marker: THREE.Mesh;
  private markerMat: THREE.MeshBasicMaterial;
  private ghost = new THREE.Group();
  private ghostBody: THREE.Mesh;
  private ghostGlow: THREE.Mesh;
  private ghostKey = '';
  /**
   * L'entrée du bâtiment en main, pour le tourner du bon côté : un seuil doré qui bat au sol devant la porte, la porte
   * soulignée d'un cadre lumineux sur la façade, et des chevrons qui sortent de la porte (le chemin d'accès esquissé)
   */
  private door = new THREE.Group();
  private doorTile: THREE.Mesh;
  private doorFrame: THREE.Mesh;
  private doorSteps: THREE.Mesh[] = [];
  private doorT = 0;
  /**
   * Pose en deux clics (bâtiment orientable, grotte) : le premier clic a fixé l'endroit (`x`, `z` : origine de l'emprise ; pour
   * la grotte, sa case), le second donne le côté de l'entrée ; entre les deux, l'aperçu se tourne vers la souris.
   * `keySide` : le côté que visait la souris quand R a tourné le bâtiment (R l'emporte tant qu'elle ne change pas de côté)
   */
  private anchor: { kind: KindId | 'cave'; x: number; z: number; keySide: number | null } | null = null;
  /** taille du pinceau de chaque outil (le grand volcan ne couvre pas ensuite le village de rochers) */
  private radii: Partial<Record<ToolId, number>> = { bulldoze: 1 };
  /** emplacements possibles du bâtiment en main quand il ne se pose qu'à des endroits précis (port, mine, bûcheron…) */
  private zones: ZoneHighlight;
  /** couverture des pompiers et de la police, surlignée depuis la fiche du besoin Sécurité */
  readonly coverage: CoverageView;
  /** la surbrillance s'éteint une fois le bâtiment posé, jusqu'au prochain choix dans la barre */
  private zonesOff = false;

  constructor(private h: ToolHost) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) pts.push(new THREE.Vector3(Math.cos((i / 48) * Math.PI * 2), 0, Math.sin((i / 48) * Math.PI * 2)));
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
    this.ring.renderOrder = 10; this.ring.visible = false; this.ring.frustumCulled = false;
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0x40e070, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.markerMat);
    this.marker.visible = false; this.marker.renderOrder = 9;
    this.ghostBody = new THREE.Mesh(new THREE.BufferGeometry(), mats.ghost);
    this.ghostGlow = new THREE.Mesh(new THREE.BufferGeometry(), mats.ghost);
    this.ghost.add(this.ghostBody, this.ghostGlow);
    this.ghost.visible = false;
    // route libre : ruban de la route prévue, pastille sur le point A
    this.freeLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x40e070, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.freeLine.renderOrder = 9; this.freeLine.visible = false; this.freeLine.frustumCulled = false;
    this.freeDot = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.95, depthTest: false }));
    this.freeDot.renderOrder = 10; this.freeDot.visible = false;
    this.freePulse = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    this.freePulse.renderOrder = 10; this.freePulse.visible = false;
    // la flèche : un chevron jaune qui pointe vers +z avant d'être tourné dans le sens de la route
    const dir = new THREE.Shape([new THREE.Vector2(-0.5, -0.1), new THREE.Vector2(0, 0.55), new THREE.Vector2(0.5, -0.1), new THREE.Vector2(0.2, -0.1), new THREE.Vector2(0.2, -0.45), new THREE.Vector2(-0.2, -0.45), new THREE.Vector2(-0.2, -0.1)]);
    this.freeArrow = new THREE.Mesh(new THREE.ShapeGeometry(dir).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.freeArrow.renderOrder = 10; this.freeArrow.visible = false;
    this.wallCells = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.86, 0.86).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide }), 64);
    this.wallCells.renderOrder = 9; this.wallCells.visible = false; this.wallCells.frustumCulled = false; this.wallCells.count = 0;
    h.scene.add(this.wallCells);
    // l'entrée : dessinée pour une porte tournée vers +z, au bord de l'emprise (z = 0), puis tournée et placée avec le bâtiment
    const gold = (o: number) => new THREE.MeshBasicMaterial({ color: 0xffd04a, transparent: true, opacity: o, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    // le seuil : une dalle dorée sur la case devant la porte (élargie à deux cases pour une porte double)
    this.doorTile = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2).translate(0, 0, 0.5), gold(0.5));
    // le cadre de la porte, debout contre la façade : un arc doré (la porte en surbrillance, vue à travers le fantôme)
    const arch = new THREE.Shape(), hole = new THREE.Path(), W = 0.34, H = 0.62, T = 0.09;
    arch.moveTo(-W, 0); arch.lineTo(-W, H); arch.absarc(0, H, W, Math.PI, 0, true); arch.lineTo(W, 0); arch.lineTo(-W, 0);
    hole.moveTo(-W + T, 0); hole.lineTo(W - T, 0); hole.lineTo(W - T, H); hole.absarc(0, H, W - T, 0, Math.PI, false); hole.lineTo(-W + T, 0);
    arch.holes.push(hole);
    this.doorFrame = new THREE.Mesh(new THREE.ShapeGeometry(arch, 10).translate(0, 0, 0.04), gold(0.95));
    // le chemin esquissé : trois chevrons qui sortent de la porte et s'éloignent sur deux cases et demie (voir `update`)
    const chev = new THREE.Shape([new THREE.Vector2(-0.26, -0.12), new THREE.Vector2(0, 0.1), new THREE.Vector2(0.26, -0.12), new THREE.Vector2(0.26, 0.02), new THREE.Vector2(0, 0.24), new THREE.Vector2(-0.26, 0.02)]);
    const chevGeo = new THREE.ShapeGeometry(chev).rotateX(Math.PI / 2);
    for (let i = 0; i < 3; i++) this.doorSteps.push(new THREE.Mesh(chevGeo, gold(0.9)));
    for (const m of [this.doorTile, this.doorFrame, ...this.doorSteps]) { m.renderOrder = 10; m.frustumCulled = false; this.door.add(m); }
    this.door.visible = false;
    h.scene.add(this.ring, this.marker, this.ghost, this.freeLine, this.freeDot, this.freePulse, this.freeArrow, this.door);
    this.zones = new ZoneHighlight(() => this.h.world, h.scene);
    this.coverage = new CoverageView(() => this.h.world, h.scene);
    this.zones.onEmpty = (m) => this.h.toast(m);
  }

  // ---------- API ----------
  setTool(t: ToolId, kind?: KindId) {
    // village vide : seule la place du village se pose (la touche B, sans bâtiment précisé, prend d'office le feu de camp)
    if (t === 'build' && !kind && isStart(this.h.world)) kind = START_KIND;
    const why = startRefusal(this.h.world, t, kind, KINDS[START_KIND].names[Math.max(this.h.getAge(), KINDS[START_KIND].minAge)]);
    if (why) { this.h.toast(why); return; }
    if (this.moveOrigin && (t !== 'move' && !(t === 'build'))) this.cancelMove();
    if (t !== 'none') { this.selected = null; if (this.citizen !== null) { this.citizen = null; this.h.onCitizen?.(null); } }
    // nouvel outil ou autre bâtiment : la façade se tourne de nouveau d'elle-même vers la route
    if (t !== this.tool || (kind && kind !== this.kind)) this.rotManual = false;
    if (t !== this.tool || (kind && kind !== this.kind)) { this.freeFrom = null; this.anchor = null; }
    if (t !== this.tool) {
      // chaque pinceau retrouve sa propre taille
      this.radii[this.tool] = this.radius;
      this.radius = this.radii[t] ?? 3;
    }
    this.tool = t;
    if (kind) this.kind = kind;
    this.zonesOff = false;
    this.ghostKey = '';
    this.refreshVisuals();
    this.h.changed();
  }

  /** Mode de tracé des routes (le point A d'une route libre en cours s'oublie) */
  setRoadMode(m: RoadMode) {
    this.roadMode = m;
    this.freeFrom = null;
    this.refreshVisuals();
    this.h.changed();
  }

  /** Un bâtiment en main : à poser, ou ramassé pour le déplacer */
  holding() { return this.tool === 'build' || (this.tool === 'move' && !!this.moveOrigin); }

  /** Quart de tour du bâtiment en main, à partir de l'orientation affichée ; sinon, du bâtiment sélectionné */
  rotate() {
    if (!this.holding()) { this.rotateSelected(); return; }
    const hit = this.hit, an = this.anchor;
    // l'endroit est fixé : R tourne à partir de ce que montre l'aperçu, et l'emporte tant que la souris reste du même côté
    if (an && an.kind !== 'cave') {
      this.ghostRot = (this.anchorRot() + 1) % 4;
      this.rotManual = true;
      an.keySide = this.anchorSide();
      this.refreshVisuals();
      return;
    }
    if (!this.rotManual && hit) {
      const o = footprintOrigin(this.kind, hit.x, hit.z);
      this.ghostRot = facingRoadRot(this.h.world, this.kind, o.x, o.z, this.ghostRot);
    }
    this.ghostRot = (this.ghostRot + 1) % 4;
    this.rotManual = true;
    this.refreshVisuals();
  }

  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.h.world.snapshot());
    this.h.world.restore(s);
    this.h.changed();
  }
  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.h.world.snapshot());
    this.h.world.restore(s);
    this.h.changed();
  }
  cancel() {
    this.pressed = false;
    if (this.overlayHeld) { this.overlayHeld = false; this.overlay?.up(null); }
    this.freeDrag = null;
    this.endStroke();
  }
  escape() {
    // une route libre commencée : Échap oublie son point A, l'outil reste en main
    if (this.freeFrom) { this.freeFrom = null; this.refreshVisuals(); return; }
    // l'endroit d'un bâtiment (ou d'une grotte) est fixé : Échap le libère, l'outil reste en main
    if (this.anchor) { this.anchor = null; this.refreshVisuals(); this.h.changed(); return; }
    if (this.moveOrigin) this.cancelMove();
    this.setTool('none');
    this.select(null);
  }

  // ---------- Bâtiment sélectionné ----------
  /** Choisit un bâtiment (ou aucun) : sa fiche s'affiche, son emprise s'éclaire */
  select(id: number | null) {
    if (this.selected === id && this.citizen === null) return;
    this.selected = id;
    if (this.citizen !== null) { this.citizen = null; this.h.onCitizen?.(null); }
    this.refreshVisuals();
    this.h.changed();
  }

  /** Choisit un habitant : sa fiche s'ouvre (celle du bâtiment se ferme) */
  selectCitizen(id: number) {
    this.selected = null;
    this.citizen = id;
    this.h.onCitizen?.(id);
    this.h.audio.sfxClick();
    this.refreshVisuals();
    this.h.changed();
  }

  private selectedBuilding() { return this.selected === null ? undefined : this.h.world.buildings.get(this.selected); }

  /** Ramasse le bâtiment sélectionné : il suit le curseur, un clic le repose (Échap le remet en place) */
  moveSelected() {
    const b = this.selectedBuilding();
    if (!b) return;
    this.select(null);
    this.setTool('move');
    this.beginStroke();
    this.pickUp(b);
    this.endStroke();
  }

  /** Quart de tour du bâtiment sélectionné, sur place */
  rotateSelected() {
    const b = this.selectedBuilding();
    if (!b) return;
    this.beginStroke();
    this.mark();
    this.endStroke();
    this.h.world.rotateBuilding(b.id, b.rot + 1);
    this.h.audio.sfxClick();
    this.refreshVisuals();
    this.h.changed();
  }

  /** Fait passer le pan de rempart sélectionné de tour à simple pan, ou l'inverse (annulable, gratuit) */
  toggleSelectedTower() {
    const b = this.selectedBuilding();
    if (!b || b.kind !== 'wall') return;
    this.beginStroke();
    this.mark();
    this.endStroke();
    this.h.world.setRampartTower(b.id, toggledTower(this.h.world, b));
    this.h.audio.sfxClick();
    this.refreshVisuals();
    this.h.changed();
  }

  /**
   * Améliore le bâtiment sélectionné en `to` (annulable) : au prix du nouveau bâtiment ; s'il manque de la place autour ou de
   * quoi payer, on le dit
   */
  upgradeSelected(to: KindId) {
    const b = this.selectedBuilding(), w = this.h.world;
    if (!b) return;
    const cost = priceIn(w, to, this.h.getAge());
    if (cost && !canPay(w, cost)) { this.deny(shortLabel(w, cost)); return; }
    this.beginStroke();
    const pre = this.pre;
    const nb = w.upgrade(b.id, to);
    if (!nb) { this.pre = null; this.deny(tr('Pas assez de place libre autour pour {name} ({size} × {size}, sans route ni bâtiment derrière).', { name: KINDS[to].names[Math.max(b.age, KINDS[to].minAge)].toLowerCase(), size: KINDS[to].size })); return; }
    this.pre = pre;
    this.mark();
    this.endStroke();
    pay(w, cost);
    this.h.audio.sfxPlace();
    this.select(nb.id);
  }

  /** Démolit le bâtiment sélectionné (annulable) */
  demolishSelected() {
    const b = this.selectedBuilding();
    if (!b) return;
    this.beginStroke();
    this.mark();
    this.endStroke();
    this.refunded(refund(this.h.world, b));
    this.h.world.removeBuilding(b.id);
    this.h.audio.sfxDestroy();
    this.select(null);
  }

  /** Ce que les démolitions du geste en cours ont rendu, dit en une fois quand on lâche le bouton */
  private strokeBack: Cost | null = null;
  private addBack(r: Cost | null) {
    if (!r) return;
    const t = this.strokeBack ??= { wood: 0, stone: 0, brick: 0 };
    t.wood += r.wood; t.stone += r.stone; t.brick = (t.brick ?? 0) + (r.brick ?? 0);
  }

  /** Dit ce que la démolition a rendu (rien à dire si elle n'a rien rendu) */
  private refunded(c: Cost | null) {
    if (c && (c.wood || c.stone || c.brick)) this.h.toast(tr('Démolition : {cost} rendus.', { cost: costLabel(c) }));
  }

  // ---------- historique ----------
  private beginStroke() { this.pre = this.h.world.snapshot(); this.strokeChanged = false; }
  private mark() {
    if (!this.strokeChanged && this.pre) {
      this.strokeChanged = true;
      this.undoStack.push(this.pre);
      if (this.undoStack.length > 60) this.undoStack.shift();
      this.redoStack.length = 0;
      this.h.changed();
    }
  }
  /** cases déjà démolies pendant ce geste (une route, puis son pavé, demandent deux gestes) */
  private razed = new Set<number>();
  private endStroke() { this.razed.clear(); this.pre = null; this.lastRoad = null; this.lastRift = null; this.refunded(this.strokeBack); this.strokeBack = null; }

  // ---------- Entrées ----------
  private pickAt(e: PointerInfo) {
    const c = this.h.canvas;
    const ray = this.h.cam.ray(e.x, e.y, c.clientWidth, c.clientHeight);
    this.hit = this.h.terrain.pick(ray);
    this.hitBuilding = this.hit ? this.buildingOnRay(ray, this.hit) : undefined;
  }

  /** bâtiment visé par le curseur : le premier que traverse le rayon (son volume, pas seulement sa case au sol) */
  hitBuilding: Building | undefined;
  private tops = new Map<string, number>();

  /**
   * Premier bâtiment que traverse le rayon avant d'atteindre le sol : un grand bâtiment vu de biais se vise sur sa façade,
   * pas sur le terrain derrière lui
   */
  private buildingOnRay(ray: THREE.Ray, ground: THREE.Vector3) {
    const w = this.h.world, end = ray.origin.distanceTo(ground), p = new THREE.Vector3();
    for (let t = Math.max(0, end - 40); t <= end; t += 0.12) {
      ray.at(t, p);
      const cx = Math.floor(p.x), cz = Math.floor(p.z);
      if (!w.inCells(cx, cz)) continue;
      const b = w.buildingAt(cx, cz);
      if (b && p.y <= w.flatTarget(b.x, b.z, sizeOf(b)) + this.topOf(b)) return b;
    }
    return w.buildingAt(Math.floor(ground.x), Math.floor(ground.z));
  }

  /** hauteur du modèle d'un bâtiment (mise en cache par genre, âge et taille) */
  private topOf(b: Building) {
    const key = `${b.kind}|${b.age}|${sizeOf(b)}`;
    let h = this.tops.get(key);
    if (h === undefined) {
      const g = getModel(b.kind, b.age, { v: 0, L: false, R: false, F: true, small: b.small }).body;
      g.computeBoundingBox();
      h = Math.max(0.3, Math.min(6, g.boundingBox?.max.y ?? 0.6));
      this.tops.set(key, h);
    }
    return h;
  }

  hover(e: PointerInfo) {
    this.pickAt(e);
    this.refreshVisuals();
    // un volcan sous le curseur : on peut le réveiller (les grottes et failles ne mènent plus nulle part : pas de curseur main)
    const w = this.h.world, hit = this.hit;
    // l'éditeur du tracé d'une voie choisit son curseur (une poignée, la voie)
    const over = this.overlay?.hover(hit) ?? '';
    // et un bâtiment : un clic ouvre sa fiche
    this.h.canvas.style.cursor = over || (this.tool === 'none' && hit && (w.volcanoAt(hit.x, hit.z) >= 0 || !!this.h.ironAt?.(hit.x, hit.z) || this.hitBuilding || (!!w.portal && w.portalOpen && !!this.h.openPortal && Math.hypot(hit.x - w.portal.x, hit.z - w.portal.z) < 2.6)) ? 'pointer' : '');
  }

  down(e: PointerInfo) {
    this.pickAt(e);
    this.pressed = true;
    this.touchMode = e.touch;
    this.refreshVisuals();
    if (!this.hit) return;
    if (this.overlay?.down(this.hit)) { this.overlayHeld = true; this.pressed = false; return; }
    const t = this.tool;
    // outil « Voir » : un clic sur un volcan le fait entrer en éruption
    if (t === 'none') {
      // un fer céleste au fond d'un cratère : on le ramasse
      if (this.h.collect?.(this.hit.x, this.hit.z)) { this.pressed = false; return; }
      const vol = this.h.world.volcanoAt(this.hit.x, this.hit.z);
      if (vol >= 0) { this.pressed = false; this.h.erupt(vol); return; }
      // un bâtiment se choisit au relâcher, si le pointeur n'a presque pas bougé
      this.downAt = [e.x, e.y];
      return;
    }
    // archipel : les autres îles ne se bâtissent ni ne se transforment, sauf celle de l'allié hors de sa ville (voir `World.playable`)
    { const why = this.h.world.playWhy(Math.floor(this.hit.x), Math.floor(this.hit.z)); if (why) { this.pressed = false; this.deny(why); return; } }
    this.beginStroke();
    if (t === 'volcano') {
      // le volcan se pose d'un seul clic, à l'écart des bâtiments
      if (this.reliefBlocked()) this.deny(tr(this.radius > 3 ? 'Trop près des bâtiments : un volcan se pose à l’écart du village, ou réduisez la taille du pinceau (il fait la largeur du volcan).' : 'Trop près des bâtiments : un volcan se pose à l’écart du village.'));
      else if (raiseVolcano(this.h.world, this.hit.x, this.hit.z, this.radius)) {
        this.mark(); this.h.audio.sfxPlace();
        // on ne savait pas comment s'en défaire : on le dit dès la pose
        this.h.toast(tr('Volcan posé. Pour le retirer : la Gomme ou Démolir sur son cône le rase. Ctrl+Z annule.'));
      }
    } else if (SCULPT_TOOLS.includes(t)) {
      this.ctx.target = this.hit.y;
      // falaise : Maj enfoncée, le gradin se creuse au lieu de se dresser
      this.ctx.dig = !!e.shift;
      if (this.reliefBlocked()) this.deny(tr('Le pinceau touche un bâtiment : le relief n’y change pas. Éloignez-le, ou réduisez sa taille ([ et ]).'));
    }
    else if (t === 'biome') this.applyBiome();
    else if (VEG_TOOLS.includes(t)) this.applyVeg();
    else if (t === 'road' && this.roadMode === 'free') this.freeDown(e);
    else if (t === 'road') this.applyRoad();
    else if (t === 'bulldoze') this.applyBulldoze();
    else if (this.tracingWall) this.wallDown(e);
    else if (t === 'build' && !e.touch) this.tryPlace();
    else if (t === 'move' && !this.moveOrigin) this.pickUp();
    else if (t === 'move' && this.moveOrigin && !e.touch) this.tryPlace();
  }

  move(e: PointerInfo) {
    this.pickAt(e);
    if (this.overlayHeld) { if (this.hit) this.overlay?.move(this.hit); return; }
    this.refreshVisuals();
    if (!this.pressed || !this.hit) return;
    const t = this.tool;
    if (t === 'biome') this.applyBiome();
    else if (VEG_TOOLS.includes(t) && !SINGLE_TOOLS.includes(t)) this.applyVeg();
    else if (t === 'road' && this.roadMode === 'line') this.applyRoad();
    else if (t === 'bulldoze') this.applyBulldoze();
    // les petites décorations se posent aussi d'un glissé : une haie, une allée pavée, un parterre, case après case
    else if (t === 'build' && !e.touch && isDecor(this.kind) && this.kind !== 'lamp') this.paintDecor();
  }

  /** Pose au glissé : une décoration sur chaque case neuve sous la souris, sans redire « Emplacement occupé » à chaque case */
  private paintDecor() {
    const hit = this.hit;
    if (!hit) return;
    const o = footprintOrigin(this.kind, hit.x, hit.z), cost = priceIn(this.h.world, this.kind, this.h.getAge());
    if (this.placedAt === `${o.x},${o.z}` || this.h.world.canPlace(this.kind, o.x, o.z) || (cost && !canPay(this.h.world, cost))) return;
    this.tryPlace();
  }

  up(e: PointerInfo) {
    if (this.overlayHeld) {
      this.overlayHeld = false;
      this.pickAt(e);
      this.overlay?.up(this.hit);
      this.pressed = false;
      return;
    }
    // route libre (ou rempart) tracée d'un seul glissé : on relâche sur le point B
    if (this.freeDrag && this.freeFrom && (this.tool === 'road' || this.tracingWall) && Math.hypot(e.x - this.freeDrag[0], e.y - this.freeDrag[1]) > 12) {
      this.pickAt(e);
      if (this.tracingWall) this.wallLay(); else this.freeLay();
    }
    this.freeDrag = null;
    if (this.tool === 'none' && this.downAt && Math.hypot(e.x - this.downAt[0], e.y - this.downAt[1]) < 8) {
      this.pickAt(e);
      const c = this.cell(), b = c ? this.hitBuilding : undefined;
      const pt = this.h.world.portal, hp = this.hit;
      if (this.picking && this.pickStop) this.pickStop(b);
      else if (!b && pt && hp && this.h.world.portalOpen && this.h.openPortal && Math.hypot(hp.x - pt.x, hp.z - pt.z) < 2.6) this.h.openPortal();
      else {
        // un habitant sous le clic passe avant le bâtiment derrière lui
        const who = this.h.pickCitizen?.(e.x, e.y) ?? null;
        if (who !== null) this.selectCitizen(who); else this.select(b ? b.id : null);
      }
    }
    this.downAt = null;
    if (this.pressed) {
      this.pickAt(e);
      if ((this.tool === 'build' || (this.tool === 'move' && this.moveOrigin)) && e.touch && this.hit && !this.tracingWall) this.tryPlace();
    }
    this.pressed = false;
    this.endStroke();
    this.refreshVisuals();
  }

  /** Route libre ou rempart : 0 rien, 1 le point A est à choisir, 2 le point A est posé, le point B reste à cliquer */
  get freeStage(): 0 | 1 | 2 { return !(this.tool === 'road' && this.roadMode === 'free') && !this.tracingWall ? 0 : this.freeFrom ? 2 : 1; }

  /** Un rempart en main : il se trace d'un point A à un point B, comme la route libre */
  get tracingWall() { return this.tool === 'build' && this.kind === 'wall'; }

  update(dt: number) {
    // bûcheron et pierrier : la zone verte reste affichée après la pose (on en pose souvent plusieurs) et tant que l'un d'eux est sélectionné
    const sel = this.tool === 'none' ? this.selectedBuilding() : undefined;
    const stay = this.holding() && STAY_ZONE.includes(this.kind) ? this.kind : sel && STAY_ZONE.includes(sel.kind as KindId) ? (sel.kind as KindId) : null;
    this.zones.set(stay ?? (this.holding() && !this.zonesOff ? this.kind : null), !!stay);
    this.zones.update(dt);
    this.coverage.update(dt);
    // la pastille du point A bat doucement : on ne la perd pas de vue
    if (this.freePulse.visible) {
      this.pulseT += dt;
      const k = (this.pulseT * 1.3) % 1, f = 1 + k * 1.8;
      this.freePulse.scale.set(f, 1, f);
      (this.freePulse.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
    }
    // l'entrée du bâtiment en main : le seuil bat, les chevrons sortent de la porte l'un après l'autre et s'effacent au loin
    if (this.door.visible) {
      this.doorT += dt;
      (this.doorTile.material as THREE.MeshBasicMaterial).opacity = 0.32 + 0.3 * (0.5 + 0.5 * Math.sin(this.doorT * 4.5));
      this.doorSteps.forEach((m, i) => {
        const k = (this.doorT * 0.8 + i / 3) % 1;
        m.position.set(0, 0, 0.3 + k * 2.3);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.95 * Math.sin(Math.PI * k);
      });
    }
    if (!this.pressed || !this.hit) return;
    const t = this.tool;
    if (SCULPT_TOOLS.includes(t) && t !== 'volcano') {
      const w = this.h.world;
      const changed = sculpt(w, t as SculptTool, this.hit.x, this.hit.z, this.radius, Math.min(dt, 0.05), this.ctx);
      if (changed) this.mark();
    } else if (VEG_TOOLS.includes(t) && !SINGLE_TOOLS.includes(t)) {
      this.vegTimer -= dt;
      if (this.vegTimer <= 0) { this.vegTimer = 0.15; this.applyVeg(); }
    }
  }

  /** Le pinceau de relief (ou le volcan) sous le curseur touche un bâtiment : il ne fera rien */
  private reliefBlocked() {
    const hit = this.hit, t = this.tool;
    if (!hit || !SCULPT_TOOLS.includes(t)) return false;
    return t === 'volcano' ? brushOnBuilding(this.h.world, hit.x, hit.z, volcanoRadius(this.radius) + 1) : brushOnBuilding(this.h.world, hit.x, hit.z, this.radius);
  }

  // ---------- Actions ----------
  private cell() {
    if (!this.hit) return null;
    return { x: Math.floor(this.hit.x), z: Math.floor(this.hit.z) };
  }

  private applyVeg() {
    const hit = this.hit;
    if (!hit) return;
    const w = this.h.world;
    // la gomme rase aussi un volcan (la moindre case de son cône suffit)
    if (this.tool === 'erase' && this.eraseVolcanoUnderCursor()) return;
    if (this.tool === 'fissure') { this.applyRift(); return; }
    if (SINGLE_TOOLS.includes(this.tool)) {
      // une grotte en deux clics : le premier fixe sa case, le second le côté de son ouverture (vers la souris) ; un second
      // clic sur la case même la laisse s'ouvrir vers le bas de la pente, comme celles de la carte
      const refuse = () => this.deny(tr('Une grotte se pose sur la terre ferme, à l’écart des bâtiments, des routes et des autres entrées.'));
      const an = this.anchor;
      if (!an || an.kind !== 'cave') {
        const cx = Math.floor(hit.x), cz = Math.floor(hit.z);
        if (!w.inCells(cx, cz) || w.veg[w.ci(cx, cz)] >= VEG_CAVE || !w.decorFits(cx, cz, VEG_CAVE)) { refuse(); return; }
        this.anchor = { kind: 'cave', x: cx, z: cz, keySide: null };
        this.refreshVisuals();
        this.h.changed();
        return;
      }
      this.anchor = null;
      const k = w.ci(an.x, an.z), yaw = this.caveYawAt(an.x, an.z), old = w.caveYaw.get(k);
      if (yaw === null) w.caveYaw.delete(k); else w.caveYaw.set(k, yaw);
      if (w.setVeg(an.x, an.z, VEG_CAVE)) { this.mark(); this.h.audio.sfxPlace(); }
      else {
        // (tournée ainsi, la butte de la grotte touche quelque chose : on remet le cap d'avant)
        if (old === undefined) w.caveYaw.delete(k); else w.caveYaw.set(k, old);
        refuse();
      }
      this.refreshVisuals();
      this.h.changed();
      return;
    }
    const r = Math.max(0.6, this.radius * 0.8);
    const type = this.tool === 'forest' ? VEG_FOREST : this.tool === 'field' ? VEG_FIELD : this.tool === 'rocks' ? VEG_ROCKS : 0;
    for (let cz = Math.floor(hit.z - r); cz <= Math.ceil(hit.z + r); cz++)
      for (let cx = Math.floor(hit.x - r); cx <= Math.ceil(hit.x + r); cx++) {
        if (!w.inCells(cx, cz) || !w.playable(cx, cz)) continue;
        if (Math.hypot(cx + 0.5 - hit.x, cz + 0.5 - hit.z) > r) continue;
        if (type === VEG_FOREST && hash2(cx, cz, (performance.now() / 150) | 0) > 0.7) continue;
        // la gomme : plantations, et le décor sauvage de la carte (arbres isolés, buissons, cailloux), qui n'est pas dans veg
        if (type === 0) { if (w.erase(cx, cz)) this.mark(); continue; }
        const k = w.ci(cx, cz);
        if (w.veg[k] !== type) {
          // ni champ, ni forêt, ni rochers dans l'eau : lac, torrent ou ruisseau qui passe par la case, rive mouillée
          if (w.lake[k] || this.h.wetCell?.(k) || w.cellMin(cx, cz) < 0.05) continue;
          if (!w.occ[k] && !w.road[k] && w.setVeg(cx, cz, type)) this.mark();
        }
      }
  }

  /** dernier point du tracé de la faille en cours (le ravin se creuse d'un point au suivant, sans trou quand on glisse vite) */
  private lastRift: [number, number] | null = null;

  /** Demi-largeur du ravin que creuse la faille : la moitié du pinceau, une case de large au plus petit */
  private riftHalf() { return Math.max(0.75, this.radius * 0.5); }

  /** Pinceau Faille : on glisse, et un ravin se creuse le long du tracé (ni sur un bâtiment, une route, l'eau ou une grotte) */
  private applyRift() {
    const hit = this.hit;
    if (!hit) return;
    const w = this.h.world, from = this.lastRift ?? [hit.x, hit.z], first = !this.strokeChanged;
    const n = w.digRiftAlong(from[0], from[1], hit.x, hit.z, this.riftHalf(), (k) => !this.h.wetCell?.(k));
    this.lastRift = [hit.x, hit.z];
    if (n) { this.mark(); if (first) this.h.audio.sfxPlace(); return; }
    // rien de creusé là où l'on a cliqué (et ce n'est pas déjà un ravin) : on dit pourquoi
    const k = w.inCells(Math.floor(hit.x), Math.floor(hit.z)) ? w.ci(Math.floor(hit.x), Math.floor(hit.z)) : -1;
    if (first && k >= 0 && !w.rift[k] && performance.now() - this.lastToast > 1500) {
      this.deny(tr('Une faille se creuse dans la terre ferme, à l’écart des bâtiments, des routes, de l’eau et des grottes.'));
      this.lastToast = performance.now();
    }
  }

  /** Pinceau de biome : chaque case sous le pinceau prend le biome choisi (ou retrouve celui de son climat) */
  private applyBiome() {
    const hit = this.hit;
    if (!hit) return;
    const w = this.h.world, r = Math.max(0.6, this.radius * 0.8);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let cz = Math.floor(hit.z - r); cz <= Math.ceil(hit.z + r); cz++)
      for (let cx = Math.floor(hit.x - r); cx <= Math.ceil(hit.x + r); cx++) {
        if (Math.hypot(cx + 0.5 - hit.x, cz + 0.5 - hit.z) > r || !w.paintBiome(cx, cz, this.biomeKind)) continue;
        x0 = Math.min(x0, cx); z0 = Math.min(z0, cz); x1 = Math.max(x1, cx); z1 = Math.max(z1, cz);
      }
    if (x0 > x1) return;
    w.biomesChanged(x0, z0, x1, z1);
    this.mark();
  }

  private applyRoad() {
    const c = this.cell();
    if (!c) return;
    const w = this.h.world;
    if (!this.lastRoad) this.roadStroke.clear();
    // (sans carré de 2 × 2 dans un même trait, et sans pas en diagonale qui couperait le dessin : voir `strokeRoad`)
    if (strokeRoad(w, this.lastRoad ?? c, c, this.roadStroke)) this.mark();
    this.lastRoad = c;
    if (this.strokeChanged) this.h.audio.sfxClick();
  }

  /**
   * Route libre : un premier clic choisit le point A, un second (ou le relâcher d'un glissé) le point B, et la route se pose en
   * courbe de l'un à l'autre ; B devient le point A de la suivante (Échap, ou un clic sur A, arrête là)
   */
  private freeDown(e: PointerInfo) {
    const c = this.cell(), w = this.h.world;
    if (!c || !w.inCells(c.x, c.z)) return;
    if (!this.freeFrom) {
      if (!w.road[w.ci(c.x, c.z)] && !w.canRoad(c.x, c.z)) { this.deny(tr('On ne pose pas de route ici : bâtiment, pente trop raide ou eau trop profonde.')); return; }
      this.freeFrom = [c.x + 0.5, c.z + 0.5];
      this.freeDrag = [e.x, e.y];
      this.h.audio.sfxClick();
      this.refreshVisuals();
      return;
    }
    if (Math.floor(this.freeFrom[0]) === c.x && Math.floor(this.freeFrom[1]) === c.z) { this.freeFrom = null; this.refreshVisuals(); return; }
    this.freeLay();
  }

  /** Pose la route libre prévue du point A jusqu'au pointeur (annulable d'un coup), ou dit pourquoi elle ne passe pas */
  private freeLay() {
    const c = this.cell(), A = this.freeFrom;
    if (!c || !A || (Math.floor(A[0]) === c.x && Math.floor(A[1]) === c.z)) return;
    const plan = planRoad(this.h.world, A[0], A[1], c.x + 0.5, c.z + 0.5);
    if (plan.why) { this.deny(plan.why); return; }
    if (!this.pre) this.beginStroke();
    this.mark();
    this.h.world.addCurve(plan.pts);
    this.h.audio.sfxPlace();
    // la route est posée de A à B : on sort de l'outil (on ne reste pas coincé en mode route)
    this.freeFrom = null;
    this.freeKey = '';
    this.setTool('none');
  }

  /** Aperçu de la route libre : un ruban vert de A jusqu'au pointeur, rouge si elle ne passe pas */
  private freePreview() {
    const A = this.freeFrom, c = this.cell(), w = this.h.world;
    this.freeDot.visible = this.freePulse.visible = !!A;
    if (!A) return;
    this.freeDot.position.set(A[0], w.surfaceAt(A[0], A[1]) + 0.12, A[1]);
    this.freePulse.position.set(A[0], w.surfaceAt(A[0], A[1]) + 0.13, A[1]);
    if (!c || !w.inCells(c.x, c.z) || (Math.floor(A[0]) === c.x && Math.floor(A[1]) === c.z)) return;
    const key = `${A[0]},${A[1]}>${c.x},${c.z}|${w.version}|${w.visVersion}`;
    if (key !== this.freeKey) {
      this.freeKey = key;
      this.freePlan = planRoad(w, A[0], A[1], c.x + 0.5, c.z + 0.5);
      const s = sampleCurve(this.freePlan.pts, 0.2), pos: number[] = [];
      for (let i = 0; i + 3 < s.length; i += 2) {
        const p = [s[i], s[i + 1]], q = [s[i + 2], s[i + 3]], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = (-(q[1] - p[1]) / l) * 0.46, nz = ((q[0] - p[0]) / l) * 0.46;
        const y = (x: number, z: number) => w.surfaceAt(x, z) + 0.1;
        const a = [p[0] + nx, y(p[0] + nx, p[1] + nz), p[1] + nz], b = [p[0] - nx, y(p[0] - nx, p[1] - nz), p[1] - nz];
        const d = [q[0] + nx, y(q[0] + nx, q[1] + nz), q[1] + nz], e = [q[0] - nx, y(q[0] - nx, q[1] - nz), q[1] - nz];
        pos.push(...a, ...b, ...e, ...a, ...e, ...d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.freeLine.geometry.dispose();
      this.freeLine.geometry = g;
      (this.freeLine.material as THREE.MeshBasicMaterial).color.setHex(this.freePlan.why ? 0xff5a5a : 0x5dff8f);
      // la flèche au bout du ruban, dans le sens de la route (de A vers B)
      const n = s.length;
      if (n >= 4) {
        const ex = s[n - 2], ez = s[n - 1], dx = ex - s[n - 4], dz = ez - s[n - 3];
        this.freeArrow.position.set(ex, w.surfaceAt(ex, ez) + 0.14, ez);
        this.freeArrow.scale.setScalar(1);
        this.freeArrow.rotation.y = Math.atan2(dx, dz);
      }
    }
    this.freeLine.visible = true;
    this.freeArrow.visible = true;
  }

  /**
   * Rempart : un premier clic choisit le point A, un second (ou le relâcher d'un glissé) le point B, et les pans se posent d'un
   * trait de l'un à l'autre, en sautant les routes ; B devient le point A du mur suivant (Échap, ou un clic sur A, arrête là)
   */
  private wallDown(e: PointerInfo) {
    const c = this.cell(), w = this.h.world;
    if (!c || !w.inCells(c.x, c.z)) return;
    if (!this.freeFrom) {
      const here = w.buildingAt(c.x, c.z);
      if (!(here && (here.kind === 'wall' || here.kind === 'gate' || here.kind === 'watchtower')) && w.canPlace('wall', c.x, c.z) !== null) { this.deny(tr('Un rempart part d’une case libre (ou d’un pan déjà posé) : pas d’une route, d’un bâtiment ni de l’eau.')); return; }
      this.freeFrom = [c.x + 0.5, c.z + 0.5];
      this.freeDrag = [e.x, e.y];
      this.h.audio.sfxClick();
      this.refreshVisuals();
      return;
    }
    if (Math.floor(this.freeFrom[0]) === c.x && Math.floor(this.freeFrom[1]) === c.z) { this.freeFrom = null; this.refreshVisuals(); return; }
    this.wallLay();
  }

  /** Pose les pans du tracé de A jusqu'au pointeur (annulable d'un coup) ; dit ce qui a été posé, sauté, ou ce qui manque */
  private wallLay() {
    const c = this.cell(), A = this.freeFrom, w = this.h.world;
    if (!c || !A || (Math.floor(A[0]) === c.x && Math.floor(A[1]) === c.z)) return;
    const t = traceRampart(w, A, [c.x + 0.5, c.z + 0.5]);
    if (t.why) { this.deny(t.why); return; }
    const cost = rampartCost(w, t, this.h.getAge());
    if (cost && !canPay(w, cost)) { this.deny(shortLabel(w, cost)); return; }
    if (!this.pre) this.beginStroke();
    this.mark();
    const r = layRampart(w, t, this.h.getAge());
    this.endStroke();
    if (r.built) this.h.audio.sfxPlace();
    const msg = r.built === 0 ? tr('Rien à poser ici : le tracé ne passe que sur des routes, des bâtiments ou de l’eau.')
      : (r.built > 1 ? tr('{n} pans posés', { n: r.built }) : tr('Un pan posé')) + (r.skipped ? tr(' ({n} cases sautées : routes, bâtiments ou eau)', { n: r.skipped }) : '') + tr('. Cliquez plus loin pour prolonger le mur. Échap : arrêter.');
    this.h.toast(msg);
    // B devient le point A du mur suivant
    this.freeFrom = [c.x + 0.5, c.z + 0.5];
    this.wallKey = '';
    this.refreshVisuals();
  }

  /** Aperçu du rempart : une tuile par case du tracé (verte : un pan s'y posera, rouge : la case est sautée), et le prix */
  private wallPreview() {
    const A = this.freeFrom, c = this.cell(), w = this.h.world;
    this.freeDot.visible = this.freePulse.visible = !!A;
    if (!A) return;
    this.freeDot.position.set(A[0], w.surfaceAt(A[0], A[1]) + 0.12, A[1]);
    this.freePulse.position.set(A[0], w.surfaceAt(A[0], A[1]) + 0.13, A[1]);
    if (!c || !w.inCells(c.x, c.z) || (Math.floor(A[0]) === c.x && Math.floor(A[1]) === c.z)) return;
    const key = `${A[0]},${A[1]}>${c.x},${c.z}|${w.version}`;
    if (key !== this.wallKey) {
      this.wallKey = key;
      const t = this.wallTrace = traceRampart(w, A, [c.x + 0.5, c.z + 0.5]);
      const m = new THREE.Matrix4(), col = new THREE.Color();
      let n = 0;
      for (let i = 0; i < t.cells.length && n < 64; i++) {
        const [x, z] = t.cells[i];
        this.wallCells.setMatrixAt(n, m.makeTranslation(x, w.surfaceAt(x, z) + 0.1, z));
        this.wallCells.setColorAt(n, col.setHex(t.had[i] ? 0xfff2c0 : t.ok[i] ? 0x5dff8f : 0xff5a5a));
        n++;
      }
      this.wallCells.count = n;
      this.wallCells.instanceMatrix.needsUpdate = true;
      if (this.wallCells.instanceColor) this.wallCells.instanceColor.needsUpdate = true;
      const cost = rampartCost(w, t, this.h.getAge());
      this.placeWhy = t.why ?? (cost && !canPay(w, cost) ? shortLabel(w, cost) : null);
      this.wallCost = cost ? tr('{n} pans : {cost}', { n: t.ok.filter((o, i) => o && !t.had[i]).length, cost: costLabel(cost) }) : '';
    }
    this.wallCells.visible = this.wallCells.count > 0;
  }
  /** Le prix du tracé en cours, pour la fiche ('' : rien à payer ou pas de tracé) */
  wallCost = '';

  /** Un volcan sous le curseur : il est rasé (annulable avec Ctrl+Z) ; vrai si c'est fait */
  private eraseVolcanoUnderCursor(): boolean {
    const hit = this.hit, w = this.h.world;
    if (!hit) return false;
    const vol = w.volcanoAt(hit.x, hit.z);
    if (vol < 0) return false;
    this.mark();
    if (!removeVolcano(w, vol)) return false;
    this.h.audio.sfxDestroy();
    this.h.toast(tr('Le volcan est rasé.'));
    return true;
  }

  /** Démolir : une case (pinceau à 1), ou tout un disque de la taille du pinceau (les parcs, les forêts, les routes d'un coup) */
  private applyBulldoze() {
    const c = this.cell();
    if (!c) return;
    if (!this.hitBuilding && this.eraseVolcanoUnderCursor()) return;
    const w = this.h.world, disc = this.radius > 1 && !!this.hit;
    const b = this.hitBuilding;
    if (b) {
      // (plus de double confirmation : Ctrl+Z annule)
      this.mark(); this.addBack(refund(w, b)); w.removeBuilding(b.id); this.h.audio.sfxDestroy();
      if (!disc) return;
    }
    if (disc) { this.bulldozeDisc(this.hit!.x, this.hit!.z, this.radius); return; }
    const k = w.inCells(c.x, c.z) ? w.ci(c.x, c.z) : -1;
    if (k < 0) return;
    // (une couche par case et par geste : glisser sur une rue pavée retire la route, pas aussi le pavé dessous)
    if (this.razed.has(k)) return;
    if (w.road[k]) { this.mark(); w.setRoad(c.x, c.z, false); this.razed.add(k); this.h.audio.sfxDestroy(); }
    else if (w.paving[k]) { this.mark(); w.setPaving(c.x, c.z, false); this.razed.add(k); this.h.audio.sfxDestroy(); }
    else if (w.rift[k]) {
      // une case d'un ravin : tout le ravin se comble (la gomme, elle, comble case par case)
      this.mark(); w.fillRiftGroup(k); this.h.audio.sfxDestroy();
    } else if (w.decor[k]) {
      // n'importe quelle case de l'emprise d'une grotte la fait disparaître
      const e = w.entranceAt(c.x + 0.5, c.z + 0.5);
      if (e >= 0) { this.mark(); w.setVeg(e % N, Math.floor(e / N), 0); this.h.audio.sfxDestroy(); }
    } else if (w.erase(c.x, c.z)) this.mark();
  }

  /**
   * Le pinceau de démolition sur un disque : routes, plantations (forêts, champs, rochers) et petits bâtiments partent
   * sans confirmation ; les grands bâtiments (2 × 2 et plus), les grottes et les failles restent : on les vise un à un
   */
  private bulldozeDisc(hx: number, hz: number, r: number) {
    const w = this.h.world;
    let any = false, big = false;
    for (let cz = Math.floor(hz - r); cz <= Math.ceil(hz + r); cz++)
      for (let cx = Math.floor(hx - r); cx <= Math.ceil(hx + r); cx++) {
        if (!w.inCells(cx, cz) || Math.hypot(cx + 0.5 - hx, cz + 0.5 - hz) > r) continue;
        const k = w.ci(cx, cz), b = w.buildingAt(cx, cz);
        if (b) {
          if (sizeOf(b) >= 2) { big = true; continue; }
          this.mark(); this.addBack(refund(w, b)); w.removeBuilding(b.id); any = true;
          continue;
        }
        if (this.razed.has(k)) continue;
        if (w.road[k]) { this.mark(); w.setRoad(cx, cz, false); this.razed.add(k); any = true; }
        else if (w.paving[k]) { this.mark(); w.setPaving(cx, cz, false); this.razed.add(k); any = true; }
        else if (!w.decor[k]) {
          // plantations, et le décor sauvage de la carte (arbres isolés, buissons) : comme la gomme
          const had = !!w.veg[k];
          if (w.erase(cx, cz)) { this.mark(); if (had) any = true; }
        }
      }
    if (any) this.h.audio.sfxDestroy();
    else if (big && performance.now() - this.lastToast > 1500) { this.h.toast(tr('Les grands bâtiments se démolissent un à un : un clic dessus (Ctrl+Z annule).')); this.lastToast = performance.now(); }
  }

  /**
   * Les bâtiments que démolirait un clic ici : celui qu'on vise, et avec le pinceau large les petits bâtiments du disque
   * (comme `applyBulldoze` et `bulldozeDisc`). Sert à dire, avant le clic, ce que la démolition rendrait
   */
  bulldozeTargets(): Building[] {
    if (this.tool !== 'bulldoze' || !this.hit) return [];
    const w = this.h.world, out = new Map<number, Building>(), r = this.radius;
    if (this.hitBuilding) out.set(this.hitBuilding.id, this.hitBuilding);
    if (r > 1) {
      const hx = this.hit.x, hz = this.hit.z;
      for (let cz = Math.floor(hz - r); cz <= Math.ceil(hz + r); cz++)
        for (let cx = Math.floor(hx - r); cx <= Math.ceil(hx + r); cx++) {
          if (!w.inCells(cx, cz) || Math.hypot(cx + 0.5 - hx, cz + 0.5 - hz) > r) continue;
          const b = w.buildingAt(cx, cz);
          if (b && sizeOf(b) < 2) out.set(b.id, b);
        }
    }
    return [...out.values()];
  }

  private pickUp(chosen?: Building) {
    const c = this.cell();
    const w = this.h.world;
    const b = chosen ?? (c ? this.hitBuilding : undefined);
    if (!b) return;
    this.mark();
    this.moveOrigin = { kind: b.kind, x: b.x, z: b.z, rot: b.rot, auto: b.auto, small: !!b.small };
    this.kind = b.kind;
    this.ghostRot = b.rot;
    this.rotManual = !b.auto;
    w.removeBuilding(b.id);
    // son ancien chemin d'accès s'efface (le nouveau se trace à la pose)
    if (this.h.autoRoads) unlayAccess(w, b.id);
    this.ghostKey = '';
    this.h.toast(tr('Cliquez pour reposer le bâtiment (Échap pour annuler).'));
  }

  private cancelMove() {
    const o = this.moveOrigin;
    this.moveOrigin = null;
    if (!o) return;
    const w = this.h.world;
    if (w.canPlace(o.kind, o.x, o.z, o.small ? smallSize(o.kind) : undefined) !== null) return;
    const b = w.place(o.kind, o.x, o.z, o.rot, o.auto, this.h.getAge(), false, o.small);
    // (son chemin d'accès s'était effacé en le ramassant : il se retrace)
    if (this.h.autoRoads && b) autoRoad(w, b);
  }

  /** Un geste en cours sur la carte : l'endroit d'une pose fixé (le côté de l'entrée reste à cliquer), le début d'un tracé, un bâtiment ramassé */
  get midGesture() { return !!this.anchor || !!this.freeFrom || !!this.moveOrigin; }

  /** Pose en deux clics : 0 rien, 1 l'endroit est à cliquer, 2 l'endroit est fixé, le côté de l'entrée reste à cliquer */
  get placeStage(): 0 | 1 | 2 {
    if (this.tool === 'cave') return this.anchor ? 2 : 1;
    if (!this.holding() || !orientable(this.kind) || this.tracingWall) return 0;
    return this.anchor ? 2 : 1;
  }

  /** Côté visé par la souris depuis le centre de l'emprise fixée (-1 : près du centre, ou pas d'endroit fixé) */
  private anchorSide() {
    const an = this.anchor, hit = this.hit;
    if (!an || an.kind === 'cave' || !hit) return -1;
    const s = KINDS[an.kind].size;
    return sideToward(an.x + s / 2, an.z + s / 2, s, hit.x, hit.z);
  }

  /**
   * Rotation du bâtiment fixé, d'après la souris : l'entrée du côté qu'elle vise ; près du centre (ou tant que R l'emporte),
   * la rotation de R, sinon celle qui regarde la route
   */
  private anchorRot() {
    const an = this.anchor!, kind = an.kind as KindId, side = this.anchorSide();
    if (an.keySide !== null && side !== an.keySide) an.keySide = null;
    if (side >= 0 && an.keySide === null) return side;
    return this.rotManual ? this.ghostRot : facingRoadRot(this.h.world, kind, an.x, an.z, this.ghostRot);
  }

  /** Cap de l'ouverture d'une grotte vers la souris (au centième de radian, comme la sauvegarde) ; null : la souris est sur sa case */
  private caveYawAt(cx: number, cz: number) {
    const hit = this.hit;
    if (!hit) return null;
    const dx = hit.x - (cx + 0.5), dz = hit.z - (cz + 0.5);
    return Math.hypot(dx, dz) < 0.7 ? null : Math.round(Math.atan2(dx, dz) * 100) / 100;
  }

  /** Un geste refusé sur la carte : la raison sous le curseur, en rouge, avec un son (voir `ToolHost.refuse`) */
  private deny(msg: string) {
    if (this.h.refuse) this.h.refuse(msg); else this.h.toast(msg);
  }

  private tryPlace() {
    const hit = this.hit;
    if (!hit) return;
    const w = this.h.world;
    // un bâtiment orientable se pose en deux clics : l'endroit, puis le côté de l'entrée (l'aperçu se tourne vers la souris)
    const two = orientable(this.kind), an = this.anchor;
    const o = an && an.kind === this.kind ? { x: an.x, z: an.z } : footprintOrigin(this.kind, hit.x, hit.z);
    // un grand bâtiment neuf se paie en bois et en pierre, et tous en Normal (déplacer est gratuit)
    const cost = this.moveOrigin ? null : priceIn(w, this.kind, this.h.getAge());
    const where = w.canPlace(this.kind, o.x, o.z), reason = where ?? (cost && !canPay(w, cost) ? shortLabel(w, cost) : null);
    if (reason) {
      // (chaque clic refusé le redit sous le curseur : la bulle se remet à trembler)
      this.deny(tr(reason));
      // (l'endroit fixé ne tient plus, le village a changé entre les deux clics : on le libère)
      if (an) { this.anchor = null; this.refreshVisuals(); this.h.changed(); }
      return;
    }
    if (two && !an) {
      this.anchor = { kind: this.kind, x: o.x, z: o.z, keySide: null };
      this.h.audio.sfxClick();
      this.refreshVisuals();
      this.h.changed();
      return;
    }
    if (this.kind === 'paving') {
      // les pavés : la case se pave (un habillage du sol, sous ce qu'on y bâtira), sans bâtiment ni chemin
      this.mark();
      pay(w, cost);
      w.setPaving(o.x, o.z, true);
      this.placedAt = `${o.x},${o.z}`;
      this.h.audio.sfxPlace();
      return;
    }
    const rot = an ? this.anchorRot() : this.rotManual ? this.ghostRot : facingRoadRot(w, this.kind, o.x, o.z, this.ghostRot);
    // l'entrée choisie à la souris (ou par R) ne bouge plus ; près du centre sans R, la façade suit la route comme avant
    const auto = an ? this.anchorSide() < 0 && !this.rotManual : !this.rotManual;
    this.anchor = null;
    this.mark();
    pay(w, cost);
    const b = w.place(this.kind, o.x, o.z, rot, auto, this.h.getAge(), true);
    // un chemin d'accès jusqu'au réseau (annulé avec le bâtiment)
    if (this.h.autoRoads) autoRoad(w, b);
    this.moveOrigin = null;
    // (la case sous la souris au prochain survol : le second clic, celui de l'entrée, n'est pas sur l'endroit du bâtiment)
    this.placedAt = '?';
    // (la zone des emplacements reste affichée après la pose : on en pose souvent plusieurs, mines, ports…)
    if (this.tool === 'move') { this.tool = 'none'; this.h.changed(); }
    this.h.audio.sfxPlace();
  }

  // ---------- Visuels ----------
  /** Pourquoi le bâtiment en main ne se poserait pas sous le curseur (null : il se pose), montré dès le survol */
  placeWhy: string | null = null;
  /** la case (origine) du dernier bâtiment posé : tant que le curseur y reste, pas de refus « occupé » */
  private placedAt: string | null = null;

  /**
   * L'entrée d'un bâtiment posé en (x, z), tourné de `rot` : le seuil doré sur les cases devant la porte, le cadre de la porte
   * contre la façade, les chevrons du chemin qui en sort (le ponton et le port ont leur porte à l'arrière, côté terre)
   */
  private showDoor(kind: KindId, x: number, z: number, s: number, rot: number, y: number) {
    const side = doorSide(kind, rot), f = [[0, 1], [1, 0], [0, -1], [-1, 0]][side], cells = doorCells(kind, x, z, s, side).length || 1;
    this.door.position.set(x + s / 2 + f[0] * s / 2, y + 0.06, z + s / 2 + f[1] * s / 2);
    this.door.rotation.y = side * Math.PI / 2;
    this.doorTile.scale.set(cells, 1, 1);
    this.doorFrame.scale.setScalar(s <= 1 ? 0.62 : s === 2 ? 0.85 : 1.2);
    this.door.visible = true;
  }

  private refreshVisuals() {
    const hit = this.hit, t = this.tool, w = this.h.world;
    this.placeWhy = null;
    this.door.visible = false;
    this.ring.visible = this.marker.visible = this.ghost.visible = this.freeLine.visible = this.freeDot.visible = this.freePulse.visible = this.freeArrow.visible = this.wallCells.visible = false;
    this.wallCost = '';
    if (t === 'road' && this.roadMode === 'free') this.freePreview();
    else if (this.tracingWall) this.wallPreview();
    // le bâtiment sélectionné : son emprise s'éclaire
    const sel = t === 'none' ? this.selectedBuilding() : undefined;
    if (sel) {
      const s = sizeOf(sel);
      this.markerMat.color.setHex(0xfff2c0);
      this.marker.scale.set(s + 0.3, 1, s + 0.3);
      this.marker.position.set(sel.x + s / 2, w.flatTarget(sel.x, sel.z, s) + 0.05, sel.z + s / 2);
      this.marker.visible = true;
    }
    if (!hit || t === 'none') return;
    // démolir : le pinceau large montre son disque (rouge), et le bâtiment visé reste éclairé dessous
    const wide = t === 'bulldoze' && this.radius > 1;
    if (SCULPT_TOOLS.includes(t) || VEG_TOOLS.includes(t) || t === 'biome' || wide) {
      // (la faille : la largeur du ravin qu'elle creuse)
      const r = t === 'fissure' ? this.riftHalf() + 0.4 : VEG_TOOLS.includes(t) || t === 'biome' ? Math.max(0.6, this.radius * 0.8) : t === 'volcano' ? volcanoRadius(this.radius) : this.radius;
      // la grotte dont la case est fixée : le cercle y reste, une flèche montre où s'ouvrira l'entrée (vers la souris ; sur la
      // case même, vers le bas de la pente)
      const an = t === 'cave' && this.anchor?.kind === 'cave' ? this.anchor : null;
      const cx0 = an ? an.x + 0.5 : hit.x, cz0 = an ? an.z + 0.5 : hit.z;
      if (an) {
        const yaw = this.caveYawAt(an.x, an.z) ?? w.caveFrame(an.x, an.z).yaw, d = 1.7;
        const ax = cx0 + Math.sin(yaw) * d, az = cz0 + Math.cos(yaw) * d;
        this.freeArrow.position.set(ax, w.hAt(Math.min(N, Math.max(0, ax)), Math.min(N, Math.max(0, az))) + 0.15, az);
        this.freeArrow.rotation.set(0, yaw, 0);
        this.freeArrow.scale.setScalar(1.6);
        this.freeArrow.visible = true;
      }
      const pos = this.ring.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const x = cx0 + Math.cos(a) * r, z = cz0 + Math.sin(a) * r;
        pos.setXYZ(i, x, w.hAt(Math.min(N, Math.max(0, x)), Math.min(N, Math.max(0, z))) + 0.12, z);
      }
      pos.needsUpdate = true;
      // rouge : refusé, le pinceau ne modifiera rien (il touche un bâtiment)
      (this.ring.material as THREE.LineBasicMaterial).color.setHex(wide || this.reliefBlocked() ? 0xff5a5a : 0xffffff);
      this.ring.visible = true;
      if (!wide) return;
    }
    if (t === 'road' || t === 'bulldoze' || (t === 'move' && !this.moveOrigin)) {
      const c = this.cell();
      if (!c || !w.inCells(c.x, c.z)) return;
      let ok = true;
      // en mode libre, une route existante est un bon point de départ ; une fois A choisi, la case dit si la route passe
      if (t === 'road' && this.roadMode === 'free') ok = this.freeFrom && this.freePlan && this.freeLine.visible ? !this.freePlan.why : w.canRoad(c.x, c.z) || !!w.road[w.ci(c.x, c.z)];
      else if (t === 'road') ok = w.canRoad(c.x, c.z) && !w.road[w.ci(c.x, c.z)];
      else if (t === 'bulldoze') ok = false;
      else ok = !!this.hitBuilding;
      this.markerMat.color.setHex(t === 'bulldoze' ? 0xff6a5a : ok ? 0x40e070 : 0xff5a5a);
      // démolir, déplacer : le bâtiment visé s'éclaire en entier
      const hb = t !== 'road' ? this.hitBuilding : undefined;
      if (hb) {
        const s = sizeOf(hb);
        this.marker.scale.set(s + 0.2, 1, s + 0.2);
        this.marker.position.set(hb.x + s / 2, w.flatTarget(hb.x, hb.z, s) + 0.08, hb.z + s / 2);
      } else {
        this.marker.scale.set(1, 1, 1);
        this.marker.position.set(c.x + 0.5, w.cellAvg(c.x, c.z) + 0.08, c.z + 0.5);
      }
      this.marker.visible = true;
      return;
    }
    if (t === 'build' || (t === 'move' && this.moveOrigin)) {
      const kind = this.kind, s = KINDS[kind].size, an = this.anchor && this.anchor.kind === kind ? this.anchor : null;
      // l'endroit fixé au premier clic : l'aperçu y reste et se tourne vers la souris
      const o = an ? { x: an.x, z: an.z } : footprintOrigin(kind, hit.x, hit.z);
      if (!w.inCells(o.x, o.z)) return;
      const reason = w.canPlace(kind, o.x, o.z);
      const age = this.h.getAge();
      // un rempart : l'aperçu prend le masque qu'aurait la pièce posée ici (la porte se tourne dans l'axe du mur ou de la rue)
      const mask = isRampart(kind) ? rampartMask(w, { kind, x: o.x, z: o.z } as Building) : isLinear(kind) ? linearMask(w, { kind, x: o.x, z: o.z, rot: this.ghostRot }) : undefined;
      const key = `${kind}|${age}|${mask ?? ''}`;
      if (key !== this.ghostKey) {
        this.ghostKey = key;
        const m = getModel(kind, age, { v: 0, L: false, R: false, F: true, mask });
        this.ghostBody.geometry = m.body;
        if (m.glow) { this.ghostGlow.geometry = m.glow; this.ghostGlow.visible = true; } else this.ghostGlow.visible = false;
        const off = kind === 'lamp' ? 0.32 : 0;
        this.ghostBody.position.set(off, 0, off); this.ghostGlow.position.set(off, 0, off);
      }
      const cost = this.moveOrigin ? null : priceIn(w, kind, age);
      const why0 = reason ? tr(reason) : (cost && !canPay(w, cost) ? shortLabel(w, cost) : null);
      // juste après une pose, la case sous la souris (le bâtiment posé, son chemin d'accès) : un refus n'a rien à dire tant que
      // la souris n'a pas changé de case. « Une route est déjà ici » restait sur la fiche après une pose réussie (testeuse v6)
      const cellKey = `${o.x},${o.z}`;
      if (this.placedAt === '?') this.placedAt = cellKey;
      else if (this.placedAt !== cellKey) this.placedAt = null;
      // (un rempart en cours de tracé : l'aperçu du tracé a déjà dit ce qui manque ; une case occupée par un pan est son point de départ)
      const tracing = this.tracingWall && this.freeFrom;
      if (!tracing) this.placeWhy = this.placedAt === cellKey && reason ? null : this.tracingWall && this.hitBuilding && (this.hitBuilding.kind === 'wall' || this.hitBuilding.kind === 'gate') ? null : why0;
      setGhostValid(tracing ? !this.placeWhy : !why0);
      const rot = mask !== undefined ? 0 : an ? this.anchorRot() : this.rotManual ? this.ghostRot : facingRoadRot(w, kind, o.x, o.z, this.ghostRot);
      const y = w.flatTarget(o.x, o.z, s);
      this.ghost.position.set(o.x + s / 2, y, o.z + s / 2);
      this.ghost.rotation.y = rot * Math.PI / 2;
      this.ghost.visible = true;
      // l'entrée (R ou la souris tournent le bâtiment, l'entrée avec lui) ; rien pour la place du village, qu'on rejoint de
      // tous côtés
      if (hasDoor(kind)) this.showDoor(kind, o.x, o.z, s, rot, y);
      this.markerMat.color.setHex(tracing ? (this.placeWhy ? 0xff5a5a : 0x40e070) : reason ? 0xff5a5a : 0x40e070);
      this.marker.scale.set(s, 1, s);
      this.marker.position.set(o.x + s / 2, y + 0.05, o.z + s / 2);
      this.marker.visible = true;
    }
  }
}
