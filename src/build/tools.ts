import * as THREE from 'three';
import { World, N, VEG_FOREST, VEG_FIELD, VEG_GARDEN, Snapshot } from '../world/world';
import { sculpt, SculptTool } from '../world/terraform';
import { TerrainView } from '../render/terrainView';
import { CameraRig, PointerInfo, ToolInput } from '../core/camera';
import { KINDS, KindId } from './catalog';
import { getModel } from '../render/models';
import { mats, setGhostValid } from '../render/materials';
import { facingRoadRot, footprintOrigin } from './placement';
import { hash2 } from '../core/rng';
import { AudioEngine } from '../audio/audio';

export type ToolId = 'none' | SculptTool | 'forest' | 'field' | 'garden' | 'erase' | 'road' | 'build' | 'bulldoze' | 'move';

export const SCULPT_TOOLS: ToolId[] = ['raise', 'lower', 'flatten', 'cliff', 'dig'];
export const VEG_TOOLS: ToolId[] = ['forest', 'field', 'garden', 'erase'];

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
}

export class ToolController implements ToolInput {
  tool: ToolId = 'none';
  kind: KindId = 'house';
  radius = 3;
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
  private moveOrigin: { kind: KindId; x: number; z: number; rot: number; auto: boolean } | null = null;
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
    this.tool = t;
    if (kind) this.kind = kind;
    this.ghostKey = '';
    this.refreshVisuals();
    this.h.changed();
  }

  rotate() {
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

  hover(e: PointerInfo) { this.pickAt(e); this.refreshVisuals(); }

  down(e: PointerInfo) {
    this.pickAt(e);
    this.pressed = true;
    this.touchMode = e.touch;
    this.refreshVisuals();
    if (!this.hit) return;
    const t = this.tool;
    this.beginStroke();
    if (SCULPT_TOOLS.includes(t)) this.ctx.target = this.hit.y;
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
    if (VEG_TOOLS.includes(t)) this.applyVeg();
    else if (t === 'road') this.applyRoad();
    else if (t === 'bulldoze') this.applyBulldoze();
  }

  up(e: PointerInfo) {
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
    if (SCULPT_TOOLS.includes(t)) {
      const w = this.h.world;
      const changed = sculpt(w, t as SculptTool, this.hit.x, this.hit.z, this.radius, Math.min(dt, 0.05), this.ctx);
      if (changed) this.mark();
    } else if (VEG_TOOLS.includes(t)) {
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
    const r = Math.max(0.6, this.radius * 0.8);
    const type = this.tool === 'forest' ? VEG_FOREST : this.tool === 'field' ? VEG_FIELD : this.tool === 'garden' ? VEG_GARDEN : 0;
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
    else if (w.veg[k]) { this.mark(); w.setVeg(c.x, c.z, 0); }
  }

  private pickUp() {
    const c = this.cell();
    if (!c) return;
    const w = this.h.world;
    const b = w.buildingAt(c.x, c.z);
    if (!b) return;
    this.mark();
    this.moveOrigin = { kind: b.kind, x: b.x, z: b.z, rot: b.rot, auto: b.auto };
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
    if (!w.canPlace(o.kind, o.x, o.z)) return;
    w.place(o.kind, o.x, o.z, o.rot, o.auto, this.h.getAge(), false);
  }

  private tryPlace() {
    const hit = this.hit;
    if (!hit) return;
    const w = this.h.world;
    const o = footprintOrigin(this.kind, hit.x, hit.z);
    const reason = w.canPlace(this.kind, o.x, o.z);
    if (reason) {
      const now = performance.now();
      if (now - this.lastToast > 1200) { this.h.toast(reason); this.lastToast = now; }
      return;
    }
    this.mark();
    const rot = this.rotManual ? this.ghostRot : facingRoadRot(w, this.kind, o.x, o.z, this.ghostRot);
    w.place(this.kind, o.x, o.z, rot, !this.rotManual, this.h.getAge(), true);
    this.moveOrigin = null;
    if (this.tool === 'move') { this.tool = 'none'; this.h.changed(); }
    this.h.audio.sfxPlace();
  }

  // ---------- Visuels ----------
  private refreshVisuals() {
    const hit = this.hit, t = this.tool, w = this.h.world;
    this.ring.visible = this.marker.visible = this.ghost.visible = false;
    if (!hit || t === 'none') return;
    if (SCULPT_TOOLS.includes(t) || VEG_TOOLS.includes(t)) {
      const r = VEG_TOOLS.includes(t) ? Math.max(0.6, this.radius * 0.8) : this.radius;
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
      setGhostValid(!reason);
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
