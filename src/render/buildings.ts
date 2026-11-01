import * as THREE from 'three';
import { World, WorldListener } from '../world/world';
import { Building, KINDS, sizeOf } from '../build/catalog';
import { getModel, ModelOpts } from './models';
import { mats } from './materials';
import { hash2 } from '../core/rng';
import { facingRoadRot } from '../build/placement';

const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const RIGHT = [[1, 0], [0, -1], [-1, 0], [0, 1]];

interface Entry {
  b: Building;
  group: THREE.Group;
  body: THREE.Mesh;
  glow: THREE.Mesh | null;
  key: string;
  /** cheminées du modèle affiché (repère du bâtiment) */
  smoke: number[];
  anim: null | { type: 'pop' | 'evolve'; t: number; swapped: boolean; to: number };
  /** soubassement de pierre quand le sol de l'emprise n'est pas plat, et sa hauteur */
  plinth: THREE.Mesh | null;
  plinthH: number;
}

/** Pierre des soubassements */
const PLINTH_MAT = new THREE.MeshStandardMaterial({ color: 0xa39d93, roughness: 1, flatShading: true });

const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export class BuildingView implements WorldListener {
  group = new THREE.Group();
  entries = new Map<number, Entry>();
  private evoTimer = 0;
  onPlaced: ((b: Building) => void) | null = null;

  constructor(private world: World) {
    world.listeners.push(this);
    this.onReset();
  }

  private disposeEntry(e: Entry) { this.group.remove(e.group); e.plinth?.geometry.dispose(); }

  onReset() {
    for (const e of this.entries.values()) this.disposeEntry(e);
    this.entries.clear();
    for (const b of this.world.buildings.values()) this.create(b, false);
    this.refreshAll();
  }

  onAdd(b: Building, animate: boolean) {
    this.create(b, animate);
    this.refreshNear(b);
    if (animate && this.onPlaced) this.onPlaced(b);
  }

  onRemove(b: Building) {
    const e = this.entries.get(b.id);
    if (e) { this.disposeEntry(e); this.entries.delete(b.id); }
    this.refreshNear(b);
  }

  onChange(b: Building) { this.refresh(b); }

  private create(b: Building, animate: boolean) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BufferGeometry(), mats.body);
    body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    const e: Entry = { b, group, body, glow: null, key: '', smoke: [], anim: animate ? { type: 'pop', t: 0, swapped: true, to: b.age } : null, plinth: null, plinthH: 0 };
    if (animate) group.scale.setScalar(0.001);
    this.group.add(group);
    this.entries.set(b.id, e);
    this.refresh(b);
  }

  private opts(b: Building): ModelOpts {
    const o: ModelOpts = { v: Math.floor(hash2(b.x, b.z, 7) * 6), L: false, R: false, F: false, small: !!b.small };
    if (b.kind !== 'house') return o;
    const w = this.world;
    const f = FRONT[b.rot], r = RIGHT[b.rot];
    const isHouse = (x: number, z: number) => { const n = w.buildingAt(x, z); return !!n && n.kind === 'house' && n.rot === b.rot; };
    o.R = isHouse(b.x + r[0], b.z + r[1]);
    o.L = isHouse(b.x - r[0], b.z - r[1]);
    const fx = b.x + f[0], fz = b.z + f[1];
    o.F = w.inCells(fx, fz) && w.road[w.ci(fx, fz)] === 1;
    return o;
  }

  /** Oriente automatiquement vers la route voisine */
  private autoRot(b: Building) {
    if (!b.auto) return;
    b.rot = facingRoadRot(this.world, b.kind, b.x, b.z, b.rot, sizeOf(b));
  }

  refresh(b: Building) {
    const e = this.entries.get(b.id);
    if (!e) return;
    this.autoRot(b);
    const o = this.opts(b);
    const m = getModel(b.kind, b.age, o);
    const key = `${b.kind}|${b.age}|${o.v}|${+o.L}${+o.R}${+o.F}`;
    if (key !== e.key) {
      e.key = key;
      e.body.geometry = m.body;
      e.smoke = m.smoke;
      if (m.glow) {
        if (!e.glow) { e.glow = new THREE.Mesh(m.glow, mats.glow); e.glow.castShadow = false; e.group.add(e.glow); }
        e.glow.geometry = m.glow;
        e.glow.visible = true;
      } else if (e.glow) e.glow.visible = false;
    }
    const s = sizeOf(b), w = this.world;
    // posé sur le coin le plus haut de son emprise : jamais en l'air ; un soubassement rattrape le sol s'il n'est pas plat
    let hi = -Infinity, lo = Infinity;
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) { const h = w.h(b.x + i, b.z + j); hi = Math.max(hi, h); lo = Math.min(lo, h); }
    e.group.position.set(b.x + s / 2, hi, b.z + s / 2);
    const ph = b.kind === 'lamp' || b.kind === 'pier' || hi - lo < 0.03 ? 0 : hi - lo + 0.08;
    if (Math.abs(ph - e.plinthH) > 1e-3) {
      e.plinthH = ph;
      if (e.plinth) { e.group.remove(e.plinth); e.plinth.geometry.dispose(); e.plinth = null; }
      if (ph > 0) {
        e.plinth = new THREE.Mesh(new THREE.BoxGeometry(s * 0.94, ph, s * 0.94).translate(0, 0.02 - ph / 2, 0), PLINTH_MAT);
        e.plinth.receiveShadow = e.plinth.castShadow = true;
        e.group.add(e.plinth);
      }
    }
    e.group.rotation.y = b.rot * Math.PI / 2;
    const off = b.kind === 'lamp' ? 0.32 : 0;
    e.body.position.set(off, 0, off);
    if (e.glow) e.glow.position.set(off, 0, off);
  }

  refreshNear(b: Building) {
    const s = sizeOf(b);
    for (let dz = -1; dz <= s; dz++)
      for (let dx = -1; dx <= s; dx++) {
        const n = this.world.buildingAt(b.x + dx, b.z + dz);
        if (n && n.id !== b.id) this.refresh(n);
      }
  }

  refreshAll() { for (const e of this.entries.values()) this.refresh(e.b); }

  /** Cheminées de tous les bâtiments en monde : (x, y, z, sorte) à la suite */
  chimneys(out: number[]) {
    out.length = 0;
    const v = new THREE.Vector3();
    for (const e of this.entries.values()) {
      if (!e.smoke.length || e.anim) continue;
      e.group.updateMatrixWorld();
      for (let i = 0; i < e.smoke.length; i += 4) {
        v.set(e.smoke[i] + e.body.position.x, e.smoke[i + 1], e.smoke[i + 2] + e.body.position.z).applyMatrix4(e.group.matrixWorld);
        out.push(v.x, v.y, v.z, e.smoke[i + 3]);
      }
    }
    return out;
  }

  /** Appelé quand le relief change : replace verticalement */
  syncHeights() {
    for (const e of this.entries.values()) e.group.position.y = this.world.h(e.b.x, e.b.z);
  }

  update(dt: number, worldAge: number) {
    this.evoTimer -= dt;
    if (this.evoTimer <= 0) {
      this.evoTimer = 0.06;
      for (const e of this.entries.values()) {
        if (!e.anim && e.b.age < worldAge) { e.anim = { type: 'evolve', t: 0, swapped: false, to: worldAge }; break; }
      }
    }
    for (const e of this.entries.values()) {
      const a = e.anim;
      if (!a) continue;
      a.t += dt;
      if (a.type === 'pop') {
        const k = Math.min(1, a.t / 0.5);
        e.group.scale.setScalar(Math.max(0.001, easeOutBack(k)));
        if (k >= 1) { e.anim = null; e.group.scale.setScalar(1); }
      } else {
        if (a.t < 0.3) { const k = a.t / 0.3; e.group.scale.set(1 + 0.1 * k, Math.max(0.05, 1 - k * 0.95), 1 + 0.1 * k); }
        else {
          if (!a.swapped) { a.swapped = true; e.b.age = a.to; this.refresh(e.b); }
          const k = Math.min(1, (a.t - 0.3) / 0.5);
          const s = Math.max(0.001, easeOutBack(k));
          e.group.scale.set(s, s, s);
          if (k >= 1) { e.anim = null; e.group.scale.setScalar(1); }
        }
      }
    }
  }
}
