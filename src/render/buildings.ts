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
  /** drapeaux, enseignes, linge, cloches qui se balancent */
  sways: { mesh: THREE.Mesh; axis: THREE.Vector3; amp: number; freq: number; phase: number }[];
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
/** Butte de terre battue sous les huttes et les abris des premiers âges (pas de fondation de pierre) */
const MOUND_MAT = new THREE.MeshStandardMaterial({ color: 0x9c7c58, roughness: 1, flatShading: true });
/** Pied rocheux de l'acropole : son rocher se prolonge jusqu'au sol, jamais une fondation de pierre taillée */
const ROCK_MAT = new THREE.MeshStandardMaterial({ color: 0xa8906a, roughness: 1, flatShading: true });

/**
 * Emprise au sol d'un modèle (centre et demi-largeurs de ses sommets les plus bas) : la fondation se glisse dessous, à sa
 * mesure, au lieu d'un carré fixe qui dépasserait en dalle grise autour d'un puits ou d'une petite maison
 */
const footCache = new WeakMap<THREE.BufferGeometry, [number, number, number, number]>();
function footprint(g: THREE.BufferGeometry): [number, number, number, number] {
  let f = footCache.get(g);
  if (f) return f;
  const pos = g.attributes.position;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0.06) continue;
    const x = pos.getX(i), z = pos.getZ(i);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  f = x0 > x1 ? [0, 0, 0.4, 0.4] : [(x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2];
  footCache.set(g, f);
  return f;
}

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
    const e: Entry = { b, group, body, glow: null, key: '', smoke: [], anim: animate ? { type: 'pop', t: 0, swapped: true, to: b.age } : null, plinth: null, plinthH: 0, rotor: null, spin: null, sways: [], turn: null, vane: null, face: 0, aimed: false };
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
      // les pièces qui se balancent, chacune à son rythme
      for (const sw of e.sways) e.group.remove(sw.mesh);
      e.sways = (m.sways ?? []).map((sw, i) => {
        const mesh = new THREE.Mesh(sw.geo, mats.body);
        mesh.castShadow = true;
        mesh.position.set(...sw.pivot);
        e.group.add(mesh);
        return { mesh, axis: new THREE.Vector3(...sw.axis).normalize(), amp: sw.amp, freq: sw.freq * (0.85 + hash2(b.x + i, b.z, 13) * 0.3), phase: hash2(b.x, b.z + i, 14) * 6.28 };
      });
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
    // le lampadaire et le ponton se posent au plus bas de leur emprise, sans socle : leurs petits objets s'enfoncent à peine
    // du côté haut. Les bâtiments à murs se posent à la hauteur médiane (un coin isolé plus
    // bas, tenu par un voisin, ne les soulève pas tout entiers) ; là où le sol descend, une fondation en retrait sous les murs
    const hs: number[] = [];
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) hs.push(w.h(b.x + i, b.z + j));
    hs.sort((p, q) => p - q);
    const low = b.kind === 'lamp' || b.kind === 'pier', open = low || b.kind === 'gather';
    // l'enclos a un sol continu (son pré) : il se pose au plus haut de son emprise pour que le terrain ne le traverse pas,
    // sur une butte de terre à sa largeur
    const raised = b.kind === 'pen' || b.kind === 'stable';
    // aux premiers âges, pas de fondation : la hutte s'enfonce un peu côté pente, sur une petite butte de terre
    const early = b.age <= 1 && !raised;
    const rocky = b.kind === 'acropolis';
    const mid = hs.length >> 1, lo = hs[0], median = hs.length % 2 ? hs[mid] : (hs[mid - 1] + hs[mid]) / 2;
    // le lieu de rencontre (feu, agora, marché, parc) ne descend jamais bien au-dessous de la médiane : sur une forte pente, posé
    // au plus bas, le marché s'enfonçait presque en entier ; il garde alors un socle du côté où le sol descend
    const base = low ? lo : open ? Math.max(lo, median - 0.08) : raised ? hs[hs.length - 1] : early ? (median + lo) / 2 : median;
    e.group.position.set(b.x + s / 2, base, b.z + s / 2);
    const ph = low || base - lo < 0.03 ? 0 : base - lo + 0.05;
    // la hauteur et la sorte de socle (butte ou fondation) : refait quand l'une ou l'autre change
    const pk = ph + (early && ph > 0 ? 100 : 0) + (rocky && ph > 0 ? 200 : 0);
    if (Math.abs(pk - e.plinthH) > 1e-3) {
      e.plinthH = pk;
      if (e.plinth) { e.group.remove(e.plinth); e.plinth.geometry.dispose(); e.plinth = null; }
      if (ph > 0) {
        const wd = s * (raised ? 0.92 : rocky ? 0.95 : 0.8);
        // butte ronde aux flancs en pente aux premiers âges (et pied rocheux de l'acropole) ; ensuite une fondation de pierre
        // juste sous les murs, à la mesure du modèle (ronde sous un puits), qui ne dépasse jamais en dalle autour
        let geo: THREE.BufferGeometry;
        if (early || rocky) geo = new THREE.CylinderGeometry(wd * 0.48, wd * 0.48 + ph * 0.9, ph, rocky ? 13 : 9).translate(0, 0.01 - ph / 2, 0);
        else if (raised) geo = new THREE.BoxGeometry(wd, ph, wd).translate(0, 0.01 - ph / 2, 0);
        else {
          const [fx, fz, hx, hz] = footprint(m.body), cap = wd / 2;
          geo = b.kind === 'well'
            ? new THREE.CylinderGeometry(Math.min(cap, Math.max(hx, hz) * 0.94), Math.min(cap, Math.max(hx, hz) * 0.94), ph, 12).translate(fx, -0.005 - ph / 2, fz)
            : new THREE.BoxGeometry(Math.min(cap, hx * 0.96) * 2, ph, Math.min(cap, hz * 0.96) * 2).translate(fx, -0.005 - ph / 2, fz);
        }
        e.plinth = new THREE.Mesh(geo, raised ? EARTH_MAT : rocky ? ROCK_MAT : early ? MOUND_MAT : PLINTH_MAT);
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

  private swayT = 0;

  update(dt: number, worldAge: number) {
    // drapeaux, enseignes et linge flottent, plus fort quand le vent forcit ; les cloches branlent à leur rythme
    this.swayT += dt;
    const gust = 0.55 + wind.speed * 0.9;
    for (const e of this.entries.values()) for (const sw of e.sways) sw.mesh.quaternion.setFromAxisAngle(sw.axis, (Math.sin(this.swayT * sw.freq * 6.28 + sw.phase) + Math.sin(this.swayT * sw.freq * 11.3 + sw.phase * 2) * 0.3) * sw.amp * gust);
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
