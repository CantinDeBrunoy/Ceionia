import * as THREE from 'three';
import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, VEG_ROCKS, VEG_CAVE, VEG_FISSURE, Snapshot } from '../world/world';
import { sculpt, raiseVolcano, SculptTool } from '../world/terraform';
import { TerrainView } from '../render/terrainView';
import { CameraRig, PointerInfo, ToolInput } from '../core/camera';
import { KINDS, KindId, Building, sizeOf } from './catalog';
import { getModel } from '../render/models';
import { mats, setGhostValid } from '../render/materials';
import { facingRoadRot, footprintOrigin } from './placement';
import { autoRoad } from './autoroads';
import { costOf, costLabel } from '../sim/economy';
import { hash2 } from '../core/rng';
import { AudioEngine } from '../audio/audio';

export type ToolId = 'none' | SculptTool | 'forest' | 'field' | 'garden' | 'biome' | 'rocks' | 'cave' | 'fissure' | 'erase' | 'road' | 'build' | 'bulldoze' | 'move';

export const SCULPT_TOOLS: ToolId[] = ['raise', 'lower', 'flatten', 'cliff', 'dig', 'mountain', 'volcano'];
export const VEG_TOOLS: ToolId[] = ['forest', 'field', 'garden', 'rocks', 'cave', 'fissure', 'erase'];
/** Décors posés d'un clic, sans pinceau */
export const SINGLE_TOOLS: ToolId[] = ['cave', 'fissure'];

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
  /** où le clic a commencé (un glissé n'est pas un clic) */
  private downAt: [number, number] | null = null;
  private lastToast = 0;

  private ring: THREE.LineLoop;
  private marker: THREE.Mesh;
  private markerMat: THREE.MeshBasicMaterial;
  private ghost = new THREE.Group();
  private ghostBody: THREE.Mesh;
  private ghostGlow: THREE.Mesh;
  private ghostKey = '';

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
    h.scene.add(this.ring, this.marker, this.ghost);
  }

  // ---------- API ----------
  setTool(t: ToolId, kind?: KindId) {
    if (this.moveOrigin && (t !== 'move' && !(t === 'build'))) this.cancelMove();
    if (t !== 'none') this.selected = null;
    // nouvel outil ou autre bâtiment : la façade se tourne de nouveau d'elle-même vers la route
    if (t !== this.tool || (kind && kind !== this.kind)) this.rotManual = false;
    this.tool = t;
    if (kind) this.kind = kind;
    this.ghostKey = '';
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
    this.endStroke();
  }
  escape() {
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

  /** Démolit le bâtiment sélectionné (annulable) */
  demolishSelected() {
    const b = this.selectedBuilding();
    if (!b) return;
    this.beginStroke();
    this.mark();
    this.endStroke();
    this.h.world.removeBuilding(b.id);
    this.h.audio.sfxDestroy();
    this.select(null);
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
  }

  hover(e: PointerInfo) {
    this.pickAt(e);
    this.refreshVisuals();
    // une grotte ou une faille sous le curseur : on peut y descendre ; un volcan : on peut le réveiller
    const w = this.h.world, hit = this.hit;
    // et un bâtiment : un clic ouvre sa fiche
    this.h.canvas.style.cursor = this.tool === 'none' && hit && (w.entranceAt(hit.x, hit.z) >= 0 || w.volcanoAt(hit.x, hit.z) >= 0 || w.buildingAt(Math.floor(hit.x), Math.floor(hit.z))) ? 'pointer' : '';
  }

  down(e: PointerInfo) {
    this.pickAt(e);
    this.pressed = true;
    this.touchMode = e.touch;
    this.refreshVisuals();
    if (!this.hit) return;
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
      // le volcan se pose d'un seul clic
      if (raiseVolcano(this.h.world, this.hit.x, this.hit.z, this.radius)) { this.mark(); this.h.audio.sfxPlace(); }
    } else if (SCULPT_TOOLS.includes(t)) this.ctx.target = this.hit.y;
    else if (t === 'biome') this.applyBiome();
    else if (VEG_TOOLS.includes(t)) this.applyVeg();
    else if (t === 'road') this.applyRoad();
    else if (t === 'bulldoze') this.applyBulldoze();
    else if (t === 'build' && !e.touch) this.tryPlace();
    else if (t === 'move' && !this.moveOrigin) this.pickUp();
    else if (t === 'move' && this.moveOrigin && !e.touch) this.tryPlace();
  }

  move(e: PointerInfo) {
    this.pickAt(e);
    this.refreshVisuals();
    if (!this.pressed || !this.hit) return;
    const t = this.tool;
    if (t === 'biome') this.applyBiome();
    else if (VEG_TOOLS.includes(t) && !SINGLE_TOOLS.includes(t)) this.applyVeg();
    else if (t === 'road') this.applyRoad();
    else if (t === 'bulldoze') this.applyBulldoze();
  }

  up(e: PointerInfo) {
    if (this.tool === 'none' && this.downAt && Math.hypot(e.x - this.downAt[0], e.y - this.downAt[1]) < 8) {
      this.pickAt(e);
      const c = this.cell(), b = c ? this.h.world.buildingAt(c.x, c.z) : undefined;
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

  update(dt: number) {
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

  private applyBulldoze() {
    const c = this.cell();
    if (!c) return;
    const w = this.h.world;
    const b = w.buildingAt(c.x, c.z);
    if (b) { this.mark(); w.removeBuilding(b.id); this.h.audio.sfxDestroy(); return; }
    const k = w.inCells(c.x, c.z) ? w.ci(c.x, c.z) : -1;
    if (k < 0) return;
    if (w.road[k]) { this.mark(); w.setRoad(c.x, c.z, false); this.h.audio.sfxDestroy(); }
    else if (w.decor[k]) {
      // n'importe quelle case de l'emprise d'une grotte ou d'une faille la fait disparaître
      const e = w.entranceAt(c.x + 0.5, c.z + 0.5);
      if (e >= 0) { this.mark(); w.setVeg(e % N, Math.floor(e / N), 0); this.h.audio.sfxDestroy(); }
    } else if (w.veg[k]) { this.mark(); w.setVeg(c.x, c.z, 0); }
  }

  private pickUp(chosen?: Building) {
    const c = this.cell();
    const w = this.h.world;
    const b = chosen ?? (c ? w.buildingAt(c.x, c.z) : undefined);
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
    if (w.canPlace(o.kind, o.x, o.z, o.small ? 1 : undefined)) w.place(o.kind, o.x, o.z, o.rot, o.auto, this.h.getAge(), false, o.small);
  }

  private tryPlace() {
    const hit = this.hit;
    if (!hit) return;
    const w = this.h.world;
    const o = footprintOrigin(this.kind, hit.x, hit.z);
    // un grand bâtiment neuf se paie en bois et en pierre (déplacer est gratuit)
    const cost = this.moveOrigin || w.unlimited ? null : costOf(this.kind, this.h.getAge());
    const reason = w.canPlace(this.kind, o.x, o.z) ?? (cost && (w.wood < cost.wood || w.stone < cost.stone) ? `Il faut ${costLabel(cost)} (vous avez ${Math.floor(w.wood)} bois et ${Math.floor(w.stone)} pierre)` : null);
    if (reason) {
      const now = performance.now();
      if (now - this.lastToast > 1200) { this.h.toast(reason); this.lastToast = now; }
      return;
    }
    this.mark();
    if (cost) { w.wood -= cost.wood; w.stone -= cost.stone; }
    const rot = this.rotManual ? this.ghostRot : facingRoadRot(w, this.kind, o.x, o.z, this.ghostRot);
    const b = w.place(this.kind, o.x, o.z, rot, !this.rotManual, this.h.getAge(), true);
    // un chemin d'accès jusqu'au réseau (annulé avec le bâtiment)
    if (this.h.autoRoads) autoRoad(w, b);
    this.moveOrigin = null;
    if (this.tool === 'move') { this.tool = 'none'; this.h.changed(); }
    this.h.audio.sfxPlace();
  }

  // ---------- Visuels ----------
  private refreshVisuals() {
    const hit = this.hit, t = this.tool, w = this.h.world;
    this.ring.visible = this.marker.visible = this.ghost.visible = false;
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
    if (SCULPT_TOOLS.includes(t) || VEG_TOOLS.includes(t) || t === 'biome') {
      const r = VEG_TOOLS.includes(t) || t === 'biome' ? Math.max(0.6, this.radius * 0.8) : this.radius;
      const pos = this.ring.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const x = hit.x + Math.cos(a) * r, z = hit.z + Math.sin(a) * r;
        pos.setXYZ(i, x, w.hAt(Math.min(N, Math.max(0, x)), Math.min(N, Math.max(0, z))) + 0.12, z);
      }
      pos.needsUpdate = true;
      (this.ring.material as THREE.LineBasicMaterial).color.setHex(t === 'lower' || t === 'dig' || t === 'erase' ? 0xff9a8a : 0xffffff);
      this.ring.visible = true;
      return;
    }
    if (t === 'road' || t === 'bulldoze' || (t === 'move' && !this.moveOrigin)) {
      const c = this.cell();
      if (!c || !w.inCells(c.x, c.z)) return;
      let ok = true;
      if (t === 'road') ok = w.canRoad(c.x, c.z) && !w.road[w.ci(c.x, c.z)];
      else if (t === 'bulldoze') ok = false;
      else ok = !!w.buildingAt(c.x, c.z);
      this.markerMat.color.setHex(t === 'bulldoze' ? 0xff6a5a : ok ? 0x40e070 : 0xff5a5a);
      this.marker.scale.set(1, 1, 1);
      this.marker.position.set(c.x + 0.5, w.cellAvg(c.x, c.z) + 0.08, c.z + 0.5);
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
      const cost = this.moveOrigin || w.unlimited ? null : costOf(kind, age);
      setGhostValid(!reason && !(cost && (w.wood < cost.wood || w.stone < cost.stone)));
      const rot = this.rotManual ? this.ghostRot : facingRoadRot(w, kind, o.x, o.z, this.ghostRot);
      const y = w.flatTarget(o.x, o.z, s);
      this.ghost.position.set(o.x + s / 2, y, o.z + s / 2);
      this.ghost.rotation.y = rot * Math.PI / 2;
      this.ghost.visible = true;
      this.markerMat.color.setHex(reason ? 0xff5a5a : 0x40e070);
      this.marker.scale.set(s, 1, s);
      this.marker.position.set(o.x + s / 2, y + 0.05, o.z + s / 2);
      this.marker.visible = true;
    }
  }
}
