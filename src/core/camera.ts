import * as THREE from 'three';
import { clamp } from './rng';
import { N } from '../world/world';

/** Distances de caméra (zoom maximal, vue d'ensemble) à l'échelle de la carte */
const maxDistFor = () => 150 * (N / 48) * 0.8;
const homeFor = () => 62 * (N / 48) * 0.8;

export interface PointerInfo { x: number; y: number; touch: boolean; button: number }

export interface ToolInput {
  down(e: PointerInfo): void;
  move(e: PointerInfo): void;
  up(e: PointerInfo): void;
  cancel(): void;
  hover(e: PointerInfo): void;
}

/** Caméra orbitale : clic droit = tourner, milieu = déplacer, molette = zoom, 2 doigts = pinch/rotation/pan */
export class CameraRig {
  camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3(N / 2, 0, N / 2);
  yaw = 0.75;
  pitch = 0.85;
  dist = homeFor();
  private goal = { yaw: 0.75, pitch: 0.85, dist: homeFor(), x: N / 2, z: N / 2 };
  private pointers = new Map<number, { x: number; y: number; touch: boolean; button: number }>();
  private mode: 'none' | 'tool' | 'rotate' | 'pan' | 'gesture' = 'none';
  private gest = { d: 0, a: 0, mx: 0, my: 0 };
  private last = { x: 0, y: 0 };
  keys = new Set<string>();
  handler: ToolInput | null = null;
  enabled = true;
  /** bornes du zoom (resserrées sous terre) */
  minDist = 10;
  maxDist = maxDistFor();
  /** inclinaison minimale (vue plus plongeante sous terre, pour voir par-dessus les parois) */
  minPitch = 0.25;

  constructor(private el: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 1800);
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.goal.dist = clamp(this.goal.dist * Math.exp(e.deltaY * 0.0012), this.minDist, this.maxDist); }, { passive: false });
    window.addEventListener('keydown', (e) => { if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    this.apply(1);
  }

  private info(e: PointerEvent): { x: number; y: number; touch: boolean; button: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, touch: e.pointerType === 'touch', button: e.button };
  }

  private touches() { return [...this.pointers.values()].filter((p) => p.touch); }

  private startGesture() {
    const t = this.touches();
    if (t.length < 2) return;
    const a = t[0], b = t[1];
    this.gest = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    if (this.mode === 'tool') this.handler?.cancel();
    this.mode = 'gesture';
  }

  private onDown(e: PointerEvent) {
    if (!this.enabled) return;
    this.el.setPointerCapture?.(e.pointerId);
    const i = this.info(e);
    this.pointers.set(e.pointerId, i);
    this.last = { x: i.x, y: i.y };
    if (i.touch) {
      if (this.touches().length >= 2) { this.startGesture(); return; }
      this.mode = 'tool';
      this.handler?.down(i);
      return;
    }
    if (e.button === 0) { this.mode = 'tool'; this.handler?.down(i); }
    else if (e.button === 2) this.mode = e.shiftKey ? 'pan' : 'rotate';
    else if (e.button === 1) this.mode = 'pan';
  }

  private onMove(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    const i = this.info(e);
    if (!p) {
      if (e.target === this.el && !i.touch && this.enabled) this.handler?.hover(i);
      return;
    }
    p.x = i.x; p.y = i.y;
    if (this.mode === 'gesture') {
      const t = this.touches();
      if (t.length < 2) return;
      const a = t[0], b = t[1];
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (this.gest.d > 10) this.goal.dist = clamp(this.goal.dist * (this.gest.d / Math.max(d, 10)), this.minDist, this.maxDist);
      let da = ang - this.gest.a;
      if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      this.goal.yaw += da;
      this.panScreen(mx - this.gest.mx, my - this.gest.my);
      this.gest = { d, a: ang, mx, my };
      this.apply(1);
      return;
    }
    const dx = i.x - this.last.x, dy = i.y - this.last.y;
    this.last = { x: i.x, y: i.y };
    if (this.mode === 'rotate') {
      this.goal.yaw -= dx * 0.006;
      this.goal.pitch = clamp(this.goal.pitch + dy * 0.005, this.minPitch, 1.5);
    } else if (this.mode === 'pan') this.panScreen(dx, dy);
    else if (this.mode === 'tool') this.handler?.move(i);
  }

  private onUp(e: PointerEvent, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const i = this.info(e);
    this.pointers.delete(e.pointerId);
    if (this.mode === 'tool') {
      if (cancelled) this.handler?.cancel(); else this.handler?.up(i);
    }
    if (this.mode === 'gesture') {
      if (this.touches().length < 2) this.mode = 'none';
      return;
    }
    if (this.pointers.size === 0) this.mode = 'none';
  }

  private panScreen(dx: number, dy: number) {
    const k = this.goal.dist * 0.0017;
    const c = Math.cos(this.goal.yaw), s = Math.sin(this.goal.yaw);
    this.goal.x += (-dx * c - dy * s) * k * -1 * -1;
    this.goal.z += (dx * s - dy * c) * k * -1 * -1;
    this.clampGoal();
  }

  private clampGoal() {
    this.goal.x = clamp(this.goal.x, 2, N - 2);
    this.goal.z = clamp(this.goal.z, 2, N - 2);
  }

  zoom(f: number) { this.goal.dist = clamp(this.goal.dist * f, this.minDist, this.maxDist); }

  /** Vue courante (pour y revenir) */
  view() { return { ...this.goal }; }

  /** Saute à une vue : position, angle et distance (sans glissement depuis la vue précédente) */
  jump(v: { x: number; z: number; yaw?: number; pitch?: number; dist?: number }, y = 0) {
    Object.assign(this.goal, v);
    this.goal.dist = clamp(this.goal.dist, this.minDist, this.maxDist);
    this.goal.pitch = clamp(this.goal.pitch, this.minPitch, 1.5);
    this.target.set(this.goal.x, y, this.goal.z);
    this.yaw = this.goal.yaw; this.pitch = this.goal.pitch; this.dist = this.goal.dist;
    this.apply(1);
  }
  rotate(d: number) { this.goal.yaw += d; }

  /** Vue d'ensemble */
  reset() { this.goal = { yaw: 0.75, pitch: 0.85, dist: this.homeDist(), x: N / 2, z: N / 2 }; }

  homeDist() { const home = homeFor(); return clamp(home * Math.max(1, 1.05 / Math.max(0.3, this.camera.aspect)), home, maxDistFor() * 0.93); }

  update(dt: number, groundY: (x: number, z: number) => number) {
    const k = this.keys;
    const sp = this.goal.dist * 0.7 * dt;
    let fx = 0, fz = 0;
    if (k.has('w') || k.has('arrowup')) fz -= 1;
    if (k.has('s') || k.has('arrowdown')) fz += 1;
    if (k.has('a') || k.has('arrowleft')) fx -= 1;
    if (k.has('d') || k.has('arrowright')) fx += 1;
    if (fx || fz) {
      const c = Math.cos(this.goal.yaw), s = Math.sin(this.goal.yaw);
      this.goal.x += (fx * c + fz * s) * sp * 0.6;
      this.goal.z += (-fx * s + fz * c) * sp * 0.6;
      this.clampGoal();
    }
    if (k.has('q')) this.goal.yaw += dt * 1.4;
    if (k.has('e')) this.goal.yaw -= dt * 1.4;
    if (k.has('+') || k.has('=')) this.goal.dist = clamp(this.goal.dist * (1 - dt * 1.2), this.minDist, this.maxDist);
    if (k.has('-')) this.goal.dist = clamp(this.goal.dist * (1 + dt * 1.2), this.minDist, this.maxDist);
    const f = 1 - Math.exp(-dt * 10);
    this.yaw += (this.goal.yaw - this.yaw) * f;
    this.pitch += (this.goal.pitch - this.pitch) * f;
    this.dist += (this.goal.dist - this.dist) * f;
    this.target.x += (this.goal.x - this.target.x) * f;
    this.target.z += (this.goal.z - this.target.z) * f;
    this.target.y += (Math.max(0, groundY(this.target.x, this.target.z)) - this.target.y) * f;
    this.apply(1);
    // la caméra passe par-dessus les sommets au lieu de les traverser
    const p = this.camera.position, floor = groundY(p.x, p.z) + 1.5;
    if (p.y < floor) { p.y = floor; this.camera.lookAt(this.target); }
  }

  apply(_: number) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + sp * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Rayon monde à partir d'une position pixel canvas */
  ray(x: number, y: number, w: number, h: number): THREE.Ray {
    const v = new THREE.Vector3((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5).unproject(this.camera);
    return new THREE.Ray(this.camera.position.clone(), v.sub(this.camera.position).normalize());
  }
}
