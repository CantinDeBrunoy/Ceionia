import * as THREE from 'three';
import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS, VEG_CAVE, VEG_FISSURE, Snapshot } from '../world/world';
import { sculpt, raiseVolcano, SculptTool, brushOnBuilding, volcanoRadius } from '../world/terraform';
import { TerrainView } from '../render/terrainView';
import { CameraRig, PointerInfo, ToolInput } from '../core/camera';
import { KINDS, KindId, Building, hasDoor, sizeOf, smallSize } from './catalog';
import { getModel } from '../render/models';
import { mats, setGhostValid } from '../render/materials';
import { facingRoadRot, footprintOrigin } from './placement';
import { autoRoad } from './autoroads';
import { planRoad, RoadPlan } from './freeRoad';
import { sampleCurve } from '../world/curves';
import { priceIn, canPay, pay, shortLabel } from '../sim/economy';
import { hash2 } from '../core/rng';
import { AudioEngine } from '../audio/audio';

export type ToolId = 'none' | SculptTool | 'forest' | 'field' | 'garden' | 'biome' | 'rocks' | 'cave' | 'fissure' | 'erase' | 'road' | 'build' | 'bulldoze' | 'move';

/** points verts des emplacements libres : jusqu'à tant, dans ce rayon autour du curseur (en cases) */
const MAX_SPOTS = 900, SPOTS_R = 10;

export const SCULPT_TOOLS: ToolId[] = ['raise', 'lower', 'flatten', 'cliff', 'dig', 'mountain', 'volcano'];
export const VEG_TOOLS: ToolId[] = ['forest', 'field', 'garden', 'rocks', 'cave', 'fissure', 'erase'];
/** Décors posés d'un clic, sans pinceau */
export const SINGLE_TOOLS: ToolId[] = ['cave', 'fissure'];
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
  terrain: TerrainView;
  cam: CameraRig;
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  audio: AudioEngine;
  getAge(): number;
  toast(msg: string): void;
  changed(): void;
  /** descend dans le monde souterrain par l'entrée (case) donnée */
  enterUnder(cell: number): void;
  /** fait entrer en éruption le volcan posé sur la case */
  erupt(cell: number): void;
  /** routes automatiques jusqu'aux nouveaux bâtiments (réglage) */
  autoRoads: boolean;
}

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
  private ctx = { target: 0 };
  private lastRoad: { x: number; z: number } | null = null;
  private vegTimer = 0;
  private moveOrigin: { kind: KindId; x: number; z: number; rot: number; auto: boolean; small: boolean } | null = null;
  /** bâtiment choisi d'un clic avec l'outil « Voir » : sa fiche s'affiche, on peut le déplacer, le tourner, le démolir */
  selected: number | null = null;
  /** tracé d'une ligne de chemin de fer en cours : un clic sur un bâtiment le propose comme arrêt */
  picking = false;
  pickStop: ((b: Building | undefined) => void) | null = null;
  /** éditeur du tracé d'une voie ferrée, prioritaire sur l'outil ; il a pris le clic en cours */
  overlay: Overlay | null = null;
  private overlayHeld = false;
  /** où le clic a commencé (un glissé n'est pas un clic) */
  private downAt: [number, number] | null = null;
  private lastToast = 0;
  /** mode de tracé des routes ; en mode libre, le point A choisi (centre de sa case) et la route prévue jusqu'au pointeur */
  roadMode: RoadMode = 'line';
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

  private ring: THREE.LineLoop;
  private marker: THREE.Mesh;
  private markerMat: THREE.MeshBasicMaterial;
  private ghost = new THREE.Group();
  private ghostBody: THREE.Mesh;
  private ghostGlow: THREE.Mesh;
  private ghostKey = '';
  /** points verts : où viser pour que le grand bâtiment en main tienne (le milieu de chaque emplacement libre alentour) */
  private spots: THREE.InstancedMesh;
  /** flèche posée au sol devant la façade du bâtiment en main : son entrée, pour le tourner du bon côté */
  private door: THREE.Mesh;
  private spotsKey = '';
  /** taille du pinceau de chaque outil (le grand volcan ne couvre pas ensuite le village de rochers) */
  private radii: Partial<Record<ToolId, number>> = { bulldoze: 1 };

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
    this.spots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.15, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x40e070, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }), MAX_SPOTS);
    this.spots.renderOrder = 8; this.spots.visible = false; this.spots.frustumCulled = false; this.spots.count = 0;
    // la flèche de l'entrée : un chevron jaune qui pointe vers la rue (vers +z avant d'être tourné avec le bâtiment)
    const arrow = new THREE.Shape([new THREE.Vector2(-0.22, 0), new THREE.Vector2(0, 0.26), new THREE.Vector2(0.22, 0), new THREE.Vector2(0.09, 0), new THREE.Vector2(0.09, -0.16), new THREE.Vector2(-0.09, -0.16), new THREE.Vector2(-0.09, 0)]);
    this.door = new THREE.Mesh(new THREE.ShapeGeometry(arrow).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd04a, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.door.renderOrder = 10; this.door.visible = false;
    h.scene.add(this.ring, this.marker, this.ghost, this.freeLine, this.freeDot, this.freePulse, this.freeArrow, this.spots, this.door);
  }

  // ---------- API ----------
  setTool(t: ToolId, kind?: KindId) {
    if (this.moveOrigin && (t !== 'move' && !(t === 'build'))) this.cancelMove();
    if (t !== 'none') this.selected = null;
    // nouvel outil ou autre bâtiment : la façade se tourne de nouveau d'elle-même vers la route
    if (t !== this.tool || (kind && kind !== this.kind)) this.rotManual = false;
    if (t !== this.tool) {
      this.freeFrom = null;
      // chaque pinceau retrouve sa propre taille
      this.radii[this.tool] = this.radius;
      this.radius = this.radii[t] ?? 3;
    }
    this.tool = t;
    if (kind) this.kind = kind;
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
    const hit = this.hit;
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
    if (this.moveOrigin) this.cancelMove();
    this.setTool('none');
    this.select(null);
  }

  // ---------- Bâtiment sélectionné ----------
  /** Choisit un bâtiment (ou aucun) : sa fiche s'affiche, son emprise s'éclaire */
  select(id: number | null) {
    if (this.selected === id) return;
    this.selected = id;
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

  /**
   * Améliore le bâtiment sélectionné en `to` (annulable) : au prix du nouveau bâtiment ; s'il manque de la place autour ou de
   * quoi payer, on le dit
   */
  upgradeSelected(to: KindId) {
    const b = this.selectedBuilding(), w = this.h.world;
    if (!b) return;
    const cost = priceIn(w, to, this.h.getAge());
    if (cost && !canPay(w, cost)) { this.h.toast(shortLabel(w, cost)); return; }
    this.beginStroke();
    const pre = this.pre;
    const nb = w.upgrade(b.id, to);
    if (!nb) { this.pre = null; this.h.toast(`Pas assez de place libre autour pour ${KINDS[to].names[Math.max(b.age, KINDS[to].minAge)].toLowerCase()} (${KINDS[to].size} × ${KINDS[to].size}, sans route ni bâtiment derrière).`); return; }
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
    if (!b || (sizeOf(b) >= 2 && !this.confirmed(b, true))) return;
    this.beginStroke();
    this.mark();
    this.endStroke();
    this.h.world.removeBuilding(b.id);
    this.h.audio.sfxDestroy();
    this.select(null);
  }

  /** grand bâtiment en attente de démolition : le premier clic le désigne, un second (dans les 6 s) le démolit */
  private doomed: { id: number; stroke: number; t: number } | null = null;
  private strokeN = 0;

  /** La démolition de ce grand bâtiment est-elle confirmée ? Sinon, le premier clic demande confirmation */
  private confirmed(b: Building, button = false) {
    const d = this.doomed, now = performance.now();
    if (d && d.id === b.id && now - d.t < 6000 && (button || d.stroke !== this.strokeN)) { this.doomed = null; return true; }
    if (!d || d.id !== b.id || now - d.t >= 6000) {
      this.doomed = { id: b.id, stroke: this.strokeN, t: now };
      const name = KINDS[b.kind].names[Math.max(b.age, KINDS[b.kind].minAge)];
      this.h.toast(`Démolir « ${name} » ? ${button ? 'Recliquez « Démolir »' : 'Cliquez de nouveau dessus'} pour confirmer (Ctrl+Z l’annulerait).`);
    }
    return false;
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
  private endStroke() { this.pre = null; this.lastRoad = null; }

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
    // une grotte ou une faille sous le curseur : on peut y descendre ; un volcan : on peut le réveiller
    const w = this.h.world, hit = this.hit;
    // l'éditeur du tracé d'une voie choisit son curseur (une poignée, la voie)
    const over = this.overlay?.hover(hit) ?? '';
    // et un bâtiment : un clic ouvre sa fiche
    this.h.canvas.style.cursor = over || (this.tool === 'none' && hit && (w.entranceAt(hit.x, hit.z) >= 0 || w.volcanoAt(hit.x, hit.z) >= 0 || this.hitBuilding) ? 'pointer' : '');
  }

  down(e: PointerInfo) {
    this.pickAt(e);
    this.strokeN++;
    this.pressed = true;
    this.touchMode = e.touch;
    this.refreshVisuals();
    if (!this.hit) return;
    if (this.overlay?.down(this.hit)) { this.overlayHeld = true; this.pressed = false; return; }
    const t = this.tool;
    // outil « Voir » : un clic sur une grotte ou une faille fait descendre sous terre, un clic sur un volcan le fait entrer en éruption
    if (t === 'none') {
      const cell = this.h.world.entranceAt(this.hit.x, this.hit.z);
      if (cell >= 0) { this.pressed = false; this.h.enterUnder(cell); return; }
      const vol = this.h.world.volcanoAt(this.hit.x, this.hit.z);
      if (vol >= 0) { this.pressed = false; this.h.erupt(vol); return; }
      // un bâtiment se choisit au relâcher, si le pointeur n'a presque pas bougé
      this.downAt = [e.x, e.y];
      return;
    }
    this.beginStroke();
    if (t === 'volcano') {
      // le volcan se pose d'un seul clic, à l'écart des bâtiments
      if (this.reliefBlocked()) this.h.toast(`Trop près des bâtiments : un volcan se pose à l’écart du village${this.radius > 3 ? ', ou réduisez la taille du pinceau (il fait la largeur du volcan)' : ''}.`);
      else if (raiseVolcano(this.h.world, this.hit.x, this.hit.z, this.radius)) { this.mark(); this.h.audio.sfxPlace(); }
    } else if (SCULPT_TOOLS.includes(t)) {
      this.ctx.target = this.hit.y;
      if (this.reliefBlocked()) this.h.toast('Le pinceau touche un bâtiment : le relief n’y change pas. Éloignez-le, ou réduisez sa taille ([ et ]).');
    }
    else if (t === 'biome') this.applyBiome();
    else if (VEG_TOOLS.includes(t)) this.applyVeg();
    else if (t === 'road' && this.roadMode === 'free') this.freeDown(e);
    else if (t === 'road') this.applyRoad();
    else if (t === 'bulldoze') this.applyBulldoze();
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
  }

  up(e: PointerInfo) {
    if (this.overlayHeld) {
      this.overlayHeld = false;
      this.pickAt(e);
      this.overlay?.up(this.hit);
      this.pressed = false;
      return;
    }
    // route libre tracée d'un seul glissé : on relâche sur le point B
    if (this.freeDrag && this.freeFrom && this.tool === 'road' && Math.hypot(e.x - this.freeDrag[0], e.y - this.freeDrag[1]) > 12) {
      this.pickAt(e);
      this.freeLay();
    }
    this.freeDrag = null;
    if (this.tool === 'none' && this.downAt && Math.hypot(e.x - this.downAt[0], e.y - this.downAt[1]) < 8) {
      this.pickAt(e);
      const c = this.cell(), b = c ? this.hitBuilding : undefined;
      if (this.picking && this.pickStop) this.pickStop(b);
      else this.select(b ? b.id : null);
    }
    this.downAt = null;
    if (this.pressed) {
      this.pickAt(e);
      if ((this.tool === 'build' || (this.tool === 'move' && this.moveOrigin)) && e.touch && this.hit) this.tryPlace();
    }
    this.pressed = false;
    this.endStroke();
    this.refreshVisuals();
  }

  /** Route libre : 0 rien, 1 le point A est à choisir, 2 le point A est posé, le point B reste à cliquer */
  get freeStage(): 0 | 1 | 2 { return this.tool !== 'road' || this.roadMode !== 'free' ? 0 : this.freeFrom ? 2 : 1; }

  update(dt: number) {
    // la pastille du point A bat doucement : on ne la perd pas de vue
    if (this.freePulse.visible) {
      this.pulseT += dt;
      const k = (this.pulseT * 1.3) % 1, f = 1 + k * 1.8;
      this.freePulse.scale.set(f, 1, f);
      (this.freePulse.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
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

  /** Points verts autour du curseur : le milieu de chaque emplacement où le grand bâtiment en main tiendrait */
  private showSpots(kind: KindId, ox: number, oz: number) {
    const w = this.h.world, s = KINDS[kind].size;
    this.spots.visible = true;
    // recalculés quand le curseur s'éloigne de quelques cases, ou que le village change
    const key = `${kind}|${Math.round(ox / 3)}|${Math.round(oz / 3)}|${w.version}`;
    if (key === this.spotsKey) return;
    this.spotsKey = key;
    const m = new THREE.Matrix4();
    let n = 0;
    for (let z = oz - SPOTS_R; z <= oz + SPOTS_R; z++)
      for (let x = ox - SPOTS_R; x <= ox + SPOTS_R && n < MAX_SPOTS; x++) {
        if (!w.inCells(x, z) || !w.inCells(x + s - 1, z + s - 1) || w.canPlace(kind, x, z) !== null) continue;
        this.spots.setMatrixAt(n++, m.makeTranslation(x + s / 2, w.flatTarget(x, z, s) + 0.08, z + s / 2));
      }
    this.spots.count = n;
    this.spots.instanceMatrix.needsUpdate = true;
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
    if (SINGLE_TOOLS.includes(this.tool)) {
      // une seule entrée du souterrain sous le curseur
      const cx = Math.floor(hit.x), cz = Math.floor(hit.z), cave = this.tool === 'cave';
      if (w.setVeg(cx, cz, cave ? VEG_CAVE : VEG_FISSURE)) { this.mark(); this.h.audio.sfxPlace(); }
      else this.h.toast(cave ? 'Une grotte se pose sur la terre ferme, à l’écart des bâtiments, des routes et des autres entrées.'
        : 'Une faille fend un sol assez plat, à l’écart des bâtiments, des routes et des autres entrées.');
      return;
    }
    const r = Math.max(0.6, this.radius * 0.8);
    const type = this.tool === 'forest' ? VEG_FOREST : this.tool === 'field' ? VEG_FIELD : this.tool === 'garden' ? VEG_GARDEN : this.tool === 'rocks' ? VEG_ROCKS : 0;
    for (let cz = Math.floor(hit.z - r); cz <= Math.ceil(hit.z + r); cz++)
      for (let cx = Math.floor(hit.x - r); cx <= Math.ceil(hit.x + r); cx++) {
        if (!w.inCells(cx, cz)) continue;
        if (Math.hypot(cx + 0.5 - hit.x, cz + 0.5 - hit.z) > r) continue;
        if (type === VEG_FOREST && hash2(cx, cz, (performance.now() / 150) | 0) > 0.7) continue;
        const k = w.ci(cx, cz);
        if (type === 0 ? w.veg[k] !== 0 : w.veg[k] !== type) {
          const prev = w.veg[k];
          if (type === 0 || (!w.occ[k] && !w.road[k])) {
            // simule pour savoir s'il y a changement
            if (w.setVeg(cx, cz, type) || prev !== w.veg[k]) this.mark();
          }
        }
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
    const from = this.lastRoad ?? c;
    // Bresenham
    let x0 = from.x, z0 = from.z;
    const dx = Math.abs(c.x - x0), dz = Math.abs(c.z - z0), sx = x0 < c.x ? 1 : -1, sz = z0 < c.z ? 1 : -1;
    let err = dx - dz;
    for (let i = 0; i < 200; i++) {
      if (w.setRoad(x0, z0, true)) this.mark();
      if (x0 === c.x && z0 === c.z) break;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
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
      if (!w.road[w.ci(c.x, c.z)] && !w.canRoad(c.x, c.z)) { this.h.toast('On ne pose pas de route ici : bâtiment, pente trop raide ou eau trop profonde.'); return; }
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
    if (plan.why) { this.h.toast(plan.why); return; }
    if (!this.pre) this.beginStroke();
    this.mark();
    this.h.world.addCurve(plan.pts);
    this.h.audio.sfxPlace();
    this.freeFrom = [c.x + 0.5, c.z + 0.5];
    this.freeKey = '';
    this.refreshVisuals();
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
        this.freeArrow.rotation.y = Math.atan2(dx, dz);
      }
    }
    this.freeLine.visible = true;
    this.freeArrow.visible = true;
  }

  /** Démolir : une case (pinceau à 1), ou tout un disque de la taille du pinceau (les parcs, les forêts, les routes d'un coup) */
  private applyBulldoze() {
    const c = this.cell();
    if (!c) return;
    const w = this.h.world, disc = this.radius > 1 && !!this.hit;
    const b = this.hitBuilding;
    if (b) {
      // un grand bâtiment ne se démolit qu'au second clic : on le regretterait
      if (sizeOf(b) >= 2 && !this.confirmed(b)) return;
      this.mark(); w.removeBuilding(b.id); this.h.audio.sfxDestroy();
      if (!disc) return;
    }
    if (disc) { this.bulldozeDisc(this.hit!.x, this.hit!.z, this.radius); return; }
    const k = w.inCells(c.x, c.z) ? w.ci(c.x, c.z) : -1;
    if (k < 0) return;
    if (w.road[k]) { this.mark(); w.setRoad(c.x, c.z, false); this.h.audio.sfxDestroy(); }
    else if (w.decor[k]) {
      // n'importe quelle case de l'emprise d'une grotte ou d'une faille la fait disparaître
      const e = w.entranceAt(c.x + 0.5, c.z + 0.5);
      if (e >= 0) { this.mark(); w.setVeg(e % N, Math.floor(e / N), 0); this.h.audio.sfxDestroy(); }
    } else if (w.veg[k]) { this.mark(); w.setVeg(c.x, c.z, 0); }
  }

  /**
   * Le pinceau de démolition sur un disque : routes, plantations (forêts, champs, jardins, rochers) et petits bâtiments partent
   * sans confirmation ; les grands bâtiments (2 × 2 et plus) et les entrées du souterrain restent : on les vise un à un
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
          this.mark(); w.removeBuilding(b.id); any = true;
          continue;
        }
        if (w.road[k]) { this.mark(); w.setRoad(cx, cz, false); any = true; }
        else if (w.veg[k] && !w.decor[k]) { this.mark(); w.setVeg(cx, cz, 0); any = true; }
      }
    if (any) this.h.audio.sfxDestroy();
    else if (big && performance.now() - this.lastToast > 1500) { this.h.toast('Les grands bâtiments se démolissent un à un : un clic dessus, avec confirmation.'); this.lastToast = performance.now(); }
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
    this.ghostKey = '';
    this.h.toast('Cliquez pour reposer le bâtiment (Échap pour annuler).');
  }

  private cancelMove() {
    const o = this.moveOrigin;
    this.moveOrigin = null;
    if (!o) return;
    const w = this.h.world;
    if (w.canPlace(o.kind, o.x, o.z, o.small ? smallSize(o.kind) : undefined)) w.place(o.kind, o.x, o.z, o.rot, o.auto, this.h.getAge(), false, o.small);
  }

  private tryPlace() {
    const hit = this.hit;
    if (!hit) return;
    const w = this.h.world;
    const o = footprintOrigin(this.kind, hit.x, hit.z);
    // un grand bâtiment neuf se paie en bois et en pierre, et tous en défi (déplacer est gratuit)
    const cost = this.moveOrigin ? null : priceIn(w, this.kind, this.h.getAge());
    const where = w.canPlace(this.kind, o.x, o.z), reason = where ?? (cost && !canPay(w, cost) ? shortLabel(w, cost) : null);
    if (reason) {
      const now = performance.now();
      // un grand bâtiment refusé ici : les points verts montrent où il tient
      const tip = where && KINDS[this.kind].size >= 2 ? (this.spots.count ? ' Visez un point vert : il y tient.' : ' Aucune place assez grande par ici : essayez plus loin du village.') : '';
      if (now - this.lastToast > 1200) { this.h.toast(reason + (tip ? `.${tip}` : '')); this.lastToast = now; }
      return;
    }
    this.mark();
    pay(w, cost);
    const rot = this.rotManual ? this.ghostRot : facingRoadRot(w, this.kind, o.x, o.z, this.ghostRot);
    const b = w.place(this.kind, o.x, o.z, rot, !this.rotManual, this.h.getAge(), true);
    // un chemin d'accès jusqu'au réseau (annulé avec le bâtiment)
    if (this.h.autoRoads) autoRoad(w, b);
    this.moveOrigin = null;
    if (this.tool === 'move') { this.tool = 'none'; this.h.changed(); }
    this.h.audio.sfxPlace();
  }

  // ---------- Visuels ----------
  /** Pourquoi le bâtiment en main ne se poserait pas sous le curseur (null : il se pose), montré dès le survol */
  placeWhy: string | null = null;

  private refreshVisuals() {
    const hit = this.hit, t = this.tool, w = this.h.world;
    this.placeWhy = null;
    this.spots.visible = false;
    this.door.visible = false;
    this.ring.visible = this.marker.visible = this.ghost.visible = this.freeLine.visible = this.freeDot.visible = this.freePulse.visible = this.freeArrow.visible = false;
    if (t === 'road' && this.roadMode === 'free') this.freePreview();
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
      const r = VEG_TOOLS.includes(t) || t === 'biome' ? Math.max(0.6, this.radius * 0.8) : t === 'volcano' ? volcanoRadius(this.radius) : this.radius;
      const pos = this.ring.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const x = hit.x + Math.cos(a) * r, z = hit.z + Math.sin(a) * r;
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
      const kind = this.kind, s = KINDS[kind].size;
      const o = footprintOrigin(kind, hit.x, hit.z);
      if (!w.inCells(o.x, o.z)) return;
      const reason = w.canPlace(kind, o.x, o.z);
      const age = this.h.getAge();
      const key = `${kind}|${age}`;
      if (key !== this.ghostKey) {
        this.ghostKey = key;
        const m = getModel(kind, age, { v: 0, L: false, R: false, F: true });
        this.ghostBody.geometry = m.body;
        if (m.glow) { this.ghostGlow.geometry = m.glow; this.ghostGlow.visible = true; } else this.ghostGlow.visible = false;
        const off = kind === 'lamp' ? 0.32 : 0;
        this.ghostBody.position.set(off, 0, off); this.ghostGlow.position.set(off, 0, off);
      }
      const cost = this.moveOrigin ? null : priceIn(w, kind, age);
      this.placeWhy = reason ?? (cost && !canPay(w, cost) ? shortLabel(w, cost) : null);
      if (s >= 2) this.showSpots(kind, o.x, o.z);
      setGhostValid(!this.placeWhy);
      const rot = this.rotManual ? this.ghostRot : facingRoadRot(w, kind, o.x, o.z, this.ghostRot);
      const y = w.flatTarget(o.x, o.z, s);
      this.ghost.position.set(o.x + s / 2, y, o.z + s / 2);
      this.ghost.rotation.y = rot * Math.PI / 2;
      this.ghost.visible = true;
      // l'entrée : la flèche devant la façade, côté rue (R tourne le bâtiment et la flèche avec lui) ; pas de flèche pour la
      // place du village, qu'on rejoint de tous côtés
      if (hasDoor(kind)) {
        const f = [[0, 1], [1, 0], [0, -1], [-1, 0]][rot], d = s / 2 + 0.5;
        this.door.position.set(o.x + s / 2 + f[0] * d, y + 0.08, o.z + s / 2 + f[1] * d);
        this.door.rotation.y = rot * Math.PI / 2;
        this.door.scale.setScalar(1.8 + s * 0.2);
        this.door.visible = true;
      }
      this.markerMat.color.setHex(reason ? 0xff5a5a : 0x40e070);
      this.marker.scale.set(s, 1, s);
      this.marker.position.set(o.x + s / 2, y + 0.05, o.z + s / 2);
      this.marker.visible = true;
    }
  }
}
