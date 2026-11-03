import * as THREE from 'three';
import { World, WorldListener } from '../world/world';
import { Building, KINDS, sizeOf } from '../build/catalog';
import { getModel, ModelOpts } from './models';
import { mats } from './materials';
import { hash2 } from '../core/rng';
import { facingRoadRot } from '../build/placement';
import { wind } from './wind';

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
  /** fondation sous les murs quand le sol de l'emprise n'est pas plat, et sa hauteur */
  plinth: THREE.Mesh | null;
  plinthH: number;
  /** ailes du moulin, pales de l'éolienne, qui tournent autour de leur moyeu */
  rotor: THREE.Mesh | null;
  spin: { axis: THREE.Vector3; speed: number; phase: number } | null;
  /** tête tournée face au vent (éolienne, roue de pompage) : son pivot, sa tête, le cap du rotor, déjà orientée ou non */
  turn: THREE.Group | null;
  vane: THREE.Mesh | null;
  face: number;
  aimed: boolean;
}

/** Pierre sombre des fondations */
const PLINTH_MAT = new THREE.MeshStandardMaterial({ color: 0x7d766c, roughness: 1, flatShading: true });
/** Butte de terre sous un enclos posé en pente */
const EARTH_MAT = new THREE.MeshStandardMaterial({ color: 0x8a6f52, roughness: 1, flatShading: true });

const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

export class BuildingView implements WorldListener {
  group = new THREE.Group();
  entries = new Map<number, Entry>();
  private evoTimer = 0;
  private spinT = 0;
  private q = new THREE.Quaternion();
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
    const e: Entry = { b, group, body, glow: null, key: '', smoke: [], anim: animate ? { type: 'pop', t: 0, swapped: true, to: b.age } : null, plinth: null, plinthH: 0, rotor: null, spin: null, turn: null, vane: null, face: 0, aimed: false };
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
      if (m.rotor) {
        if (!e.rotor) { e.rotor = new THREE.Mesh(m.rotor.geo, mats.body); e.rotor.castShadow = true; e.group.add(e.rotor); }
        e.rotor.geometry = m.rotor.geo;
        e.rotor.position.set(...m.rotor.pivot);
        e.rotor.visible = true;
        e.spin = { axis: new THREE.Vector3(...m.rotor.axis), speed: m.rotor.speed * (0.85 + hash2(b.x, b.z, 11) * 0.3), phase: hash2(b.x, b.z, 12) * 6.28 };
      } else if (e.rotor) { e.rotor.visible = false; e.spin = null; }
      // tête face au vent : le rotor et la tête (ou tout le modèle) pendus à un pivot sur l'axe du mât
      const v = m.vane;
      if (v) {
        if (!e.turn) { e.turn = new THREE.Group(); e.group.add(e.turn); e.aimed = false; }
        const t = e.turn, hang = (o: THREE.Object3D, x: number, y: number, z: number) => { t.add(o); o.position.set(x - v.pivot[0], y, z - v.pivot[1]); };
        t.position.set(v.pivot[0], 0, v.pivot[1]);
        if (v.whole) { hang(e.body, 0, 0, 0); if (e.glow) hang(e.glow, 0, 0, 0); }
        if (v.geo) {
          if (!e.vane) { e.vane = new THREE.Mesh(v.geo, mats.body); e.vane.castShadow = true; }
          e.vane.geometry = v.geo;
          e.vane.visible = true;
          hang(e.vane, 0, 0, 0);
        } else if (e.vane) e.vane.visible = false;
        if (e.rotor && m.rotor) hang(e.rotor, ...m.rotor.pivot);
        e.face = v.face;
      } else if (e.turn) {
        e.group.add(e.body);
        if (e.glow) e.group.add(e.glow);
        if (e.rotor) { e.group.add(e.rotor); if (m.rotor) e.rotor.position.set(...m.rotor.pivot); }
        if (e.vane) { e.vane.removeFromParent(); e.vane = null; }
        e.group.remove(e.turn);
        e.turn = null;
      }
    }
    const s = sizeOf(b), w = this.world;
    // les lieux à ciel ouvert (place, feu, lampadaire, ponton) se posent au plus bas de leur emprise, sans socle : leurs
    // petits objets s'enfoncent à peine du côté haut. Les bâtiments à murs se posent à la hauteur médiane (un coin isolé plus
    // bas, tenu par un voisin, ne les soulève pas tout entiers) ; là où le sol descend, une fondation en retrait sous les murs
    const hs: number[] = [];
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) hs.push(w.h(b.x + i, b.z + j));
    hs.sort((p, q) => p - q);
    const open = b.kind === 'gather' || b.kind === 'lamp' || b.kind === 'pier';
    // l'enclos a un sol continu (son pré) : il se pose au plus haut de son emprise pour que le terrain ne le traverse pas,
    // sur une butte de terre à sa largeur
    const raised = b.kind === 'pen' || b.kind === 'stable';
    const mid = hs.length >> 1, lo = hs[0], base = open ? lo : raised ? hs[hs.length - 1] : hs.length % 2 ? hs[mid] : (hs[mid - 1] + hs[mid]) / 2;
    e.group.position.set(b.x + s / 2, base, b.z + s / 2);
    const ph = open || base - lo < 0.03 ? 0 : base - lo + 0.05;
    if (Math.abs(ph - e.plinthH) > 1e-3) {
      e.plinthH = ph;
      if (e.plinth) { e.group.remove(e.plinth); e.plinth.geometry.dispose(); e.plinth = null; }
      if (ph > 0) {
        const wd = s * (raised ? 0.92 : 0.8);
        const geo = new THREE.BoxGeometry(wd, ph, wd).translate(0, 0.01 - ph / 2, 0);
        e.plinth = new THREE.Mesh(geo, raised ? EARTH_MAT : PLINTH_MAT);
        e.plinth.receiveShadow = e.plinth.castShadow = true;
        e.group.add(e.plinth);
      }
    }
    e.group.rotation.y = b.rot * Math.PI / 2;
    const off = b.kind === 'lamp' ? 0.32 : 0;
    if (!m.vane?.whole) {
      e.body.position.set(off, 0, off);
      if (e.glow) e.glow.position.set(off, 0, off);
    }
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
    // les ailes et les pales tournent, chaque moulin à son rythme (les éoliennes plus vite quand le vent forcit) ; les
    // éoliennes et les roues de pompage se tournent lentement face au vent, le rotor du côté d'où il vient
    for (const e of this.entries.values()) {
      if (e.turn) {
        const want = wind.heading + Math.PI - e.group.rotation.y - e.face, d = Math.atan2(Math.sin(want - e.turn.rotation.y), Math.cos(want - e.turn.rotation.y));
        e.turn.rotation.y += e.aimed ? Math.sign(d) * Math.min(Math.abs(d), dt * 0.35) : d;
        e.aimed = true;
      }
      if (!e.rotor || !e.spin) continue;
      e.spin.phase += dt * e.spin.speed * (e.turn ? 0.4 + wind.speed * 1.2 : 1);
      e.rotor.quaternion.copy(this.q.setFromAxisAngle(e.spin.axis, e.spin.phase));
    }
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
