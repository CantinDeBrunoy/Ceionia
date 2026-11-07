import * as THREE from 'three';
import { World, SEA } from '../world/world';
import { Parts } from './parts';
import { mats } from './materials';
import { Puffs } from './particles';
import { freighter } from './models';

/**
 * La circulation en mer : les navires de l'époque qui sortent des chantiers navals (caravelle, galion, vapeur, cargo, navire
 * futuriste à foils) et les bateaux de pêche des halles aux poissons. Chacun gagne le large par le chenal le plus long (la
 * rivière, la côte) en rapetissant à l'horizon, reste quelque temps au loin, puis revient par la même route et se dissout
 * dans la grève. Les navires des ports (voir `Transports`) restent à quai ; ceux-ci ne font que passer
 */
export type VesselKind = 'caravel' | 'galleon' | 'steamer' | 'cargo' | 'hydro';

/** Le navire d'un chantier naval, selon l'âge du village et son rang (le second est un vapeur au premier âge industriel) */
export function merchantKind(age: number, i: number): VesselKind {
  if (age <= 2) return 'caravel';
  if (age === 3) return i % 2 ? 'steamer' : 'galleon';
  if (age === 4) return 'cargo';
  return 'hydro';
}
/** Le bateau de pêche d'une halle aux poissons : un petit voilier, un chalutier à vapeur ou un hydroglisseur */
export function fisherKind(age: number): VesselKind {
  return age <= 2 ? 'caravel' : age === 3 ? 'galleon' : age === 4 ? 'steamer' : 'hydro';
}

/** Coque effilée : pont de largeur w, profondeur d sous la flottaison, longueur L ; proue en pointe, poupe arrondie */
function hull(p: Parts, w: number, d: number, L: number, top: number, color: number, band: number | null, deck: number) {
  p.add(new THREE.BoxGeometry(w, top + d * 0.45, L), 0, (top - d * 0.45) / 2, 0, color);
  p.add(new THREE.BoxGeometry(w * 0.66, d * 0.6, L * 0.96), 0, -d * 0.7, 0, color);
  p.add(new THREE.ConeGeometry(w * 0.71, w, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2).scale(1, (d + top) / w, 1), 0, (top - d) / 2, L / 2 + w / 2 - 0.01, color);
  p.add(new THREE.CylinderGeometry((w / 2) * 0.7, (w / 2) * 0.5, d + top, 10, 1, false, Math.PI / 2, Math.PI), 0, (top - d) / 2, -L / 2, color);
  if (band !== null) p.box(w * 1.01, 0.025, L, 0, -0.03, 0, band);
  p.box(w * 0.94, 0.012, L + w * 0.3, 0, top, 0, deck);
}

const SMOKE = new THREE.Color(0.32, 0.3, 0.3);
const WOOD = 0x7a5236, DARK = 0x5a3e2e, SAIL = 0xf2e6d0, RED = 0xb8322c;

/** Caravelle : coque de bois, château arrière, trois mâts, voiles carrées à croix rouge et voile latine à l'artimon */
function caravel(p: Parts) {
  hull(p, 0.15, 0.07, 0.5, 0.05, WOOD, null, 0xa07850);
  p.box(0.14, 0.07, 0.15, 0, 0.05, -0.19, 0x8a6040); p.box(0.15, 0.01, 0.16, 0, 0.12, -0.19, DARK);
  p.box(0.11, 0.045, 0.09, 0, 0.05, 0.2, 0x8a6040);
  for (const [z, h] of [[0.04, 0.5], [0.17, 0.32], [-0.19, 0.34]]) p.cyl(0.008, 0.01, h, 5, 0, 0.05, z, DARK);
  // grand mât : voile carrée à croix rouge ; mât de misaine : voile plus petite ; artimon : voile latine
  p.box(0.27, 0.2, 0.008, 0, 0.22, 0.05, SAIL); p.box(0.03, 0.2, 0.01, 0, 0.22, 0.05, RED); p.box(0.27, 0.03, 0.01, 0, 0.3, 0.05, RED);
  p.box(0.19, 0.13, 0.008, 0, 0.2, 0.18, SAIL); p.box(0.02, 0.13, 0.01, 0, 0.2, 0.18, RED);
  p.box(0.012, 0.16, 0.2, 0, 0.2, -0.19, SAIL, 0, false, 0);
  p.add(new THREE.BoxGeometry(0.012, 0.012, 0.26), 0, 0.37, -0.19, DARK, 0, false, 0, 0.5);
  p.box(0.28, 0.012, 0.012, 0, 0.32, 0.05, DARK); p.box(0.28, 0.012, 0.012, 0, 0.11, 0.05, DARK);
  p.box(0.07, 0.035, 0.004, 0.035, 0.57, 0.04, 0x3a6ab8); p.box(0.07, 0.012, 0.005, 0.035, 0.58, 0.04, 0xe8c66a);
  p.box(0.05, 0.03, 0.004, 0.025, 0.37, 0.17, RED);
  p.add(new THREE.BoxGeometry(0.01, 0.01, 0.12), 0, 0.075, 0.33, DARK, 0, false, 0, -0.35);
}

/** Galion marchand : haute coque sombre à liston d'or, gaillard arrière à fanal, trois mâts à deux étages de voiles, beaupré */
function galleon(p: Parts) {
  hull(p, 0.22, 0.1, 0.85, 0.08, DARK, 0xe8c66a, 0x8a6040);
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) p.box(0.004, 0.022, 0.03, s * 0.111, 0.03, -0.25 + k * 0.09, 0x1c1410);
  p.box(0.2, 0.14, 0.22, 0, 0.08, -0.34, 0x6a4430); p.box(0.18, 0.09, 0.14, 0, 0.22, -0.38, 0x8a6040); p.box(0.21, 0.012, 0.15, 0, 0.31, -0.38, DARK);
  p.box(0.03, 0.04, 0.03, 0, 0.31, -0.45, 0xffd890, 0, true);
  p.box(0.16, 0.07, 0.14, 0, 0.08, 0.34, 0x6a4430);
  p.add(new THREE.BoxGeometry(0.014, 0.014, 0.22), 0, 0.12, 0.52, DARK, 0, false, 0, -0.3);
  for (const [z, h] of [[0.06, 0.78], [0.26, 0.6], [-0.22, 0.58]]) p.cyl(0.01, 0.014, h, 5, 0, 0.08, z, DARK);
  // grand mât et misaine : deux voiles carrées et un hunier ; artimon : voile latine
  for (const [z, w, y] of [[0.06, 0.34, 0.2], [0.06, 0.3, 0.42], [0.06, 0.2, 0.62], [0.26, 0.26, 0.2], [0.26, 0.2, 0.4]]) {
    p.box(w, 0.17, 0.008, 0, y, z, SAIL); p.box(w * 1.06, 0.012, 0.012, 0, y + 0.17, z, DARK);
  }
  p.box(0.03, 0.17, 0.01, 0, 0.2, 0.06, RED); p.box(0.03, 0.17, 0.01, 0, 0.42, 0.06, RED);
  p.box(0.012, 0.2, 0.26, 0, 0.22, -0.22, SAIL);
  p.add(new THREE.BoxGeometry(0.012, 0.012, 0.32), 0, 0.44, -0.22, DARK, 0, false, 0, 0.5);
  p.box(0.09, 0.05, 0.004, 0.045, 0.84, 0.05, RED); p.box(0.09, 0.016, 0.005, 0.045, 0.85, 0.05, 0xe8c66a);
}

/** Navire futuriste : deux flotteurs blancs aux liserés lumineux, pont, cabine vitrée, mâts d'antennes et foils sous la coque */
function hydrofoil(p: Parts) {
  for (const s of [-1, 1]) {
    p.add(new THREE.CylinderGeometry(0.034, 0.034, 0.66, 8).rotateX(Math.PI / 2), s * 0.1, 0.055, 0, 0xf2f6fa);
    p.add(new THREE.ConeGeometry(0.034, 0.12, 8).rotateX(Math.PI / 2), s * 0.1, 0.055, 0.39, 0xf2f6fa);
    p.box(0.006, 0.006, 0.6, s * 0.134, 0.065, 0, 0x6ae4ff, 0, 'neon');
    p.box(0.02, 0.07, 0.04, s * 0.1, -0.03, 0.2, 0xaeb8c4);
  }
  p.box(0.34, 0.02, 0.5, 0, 0.1, -0.02, 0xdde8f0);
  p.box(0.2, 0.08, 0.26, 0, 0.12, -0.04, 0xf2f6fa);
  p.box(0.18, 0.045, 0.012, 0, 0.15, 0.092, 0x6ae4ff, 0, 'neon');
  for (const s of [-1, 1]) p.box(0.012, 0.04, 0.16, s * 0.1, 0.155, -0.04, 0x6ae4ff, 0, 'neon');
  p.box(0.22, 0.012, 0.28, 0, 0.2, -0.04, 0x8a96a2);
  p.cyl(0.006, 0.006, 0.2, 4, 0, 0.2, -0.12, 0xaeb8c4); p.sphere(0.014, 0, 0.4, -0.12, 0xff3a2a);
  p.box(0.4, 0.008, 0.07, 0, -0.02, 0.2, 0xaeb8c4);
  p.box(0.16, 0.008, 0.14, 0, 0.12, -0.3, 0x2a4a8a);
}

const BUILD: Record<VesselKind, (p: Parts) => [number, number, number] | null> = {
  caravel: (p) => { caravel(p); return null; },
  galleon: (p) => { galleon(p); return null; },
  steamer: (p) => freighter(p, 3),
  cargo: (p) => freighter(p, 4),
  hydro: (p) => { hydrofoil(p); return null; },
};
/** Vitesse (cases par seconde) : la voile est lente, le vapeur plus vif, le cargo et le navire à foils filent */
const SPEED: Record<VesselKind, number> = { caravel: 1.1, galleon: 1, steamer: 1.6, cargo: 2, hydro: 3 };

interface Vessel {
  root: THREE.Group;
  kind: VesselKind;
  funnel: THREE.Vector3 | null;
  state: 'wait' | 'out' | 'away' | 'in';
  t: number;
  /** distance parcourue le long du chemin, en points (un tous les demi-cases) */
  s: number;
  heading: number;
  size: number;
}
interface Lane {
  key: string;
  path: THREE.Vector3[];
  vessels: Vessel[];
}

/** Au départ et au bout de son chemin (huit points : quatre cases), le navire rapetisse : il se fond dans l'horizon ou la grève */
const FADE = 8;
/** Eau où l'on appareille : la moindre eau près du quai (comme `shipRoute`) */
const NAV = -0.08;
const SEARCH = 9;

export class SeaTraffic {
  group = new THREE.Group();
  private lanes = new Map<number, Lane>();
  private geos = new Map<VesselKind, { geo: THREE.BufferGeometry; funnel: [number, number, number] | null }>();
  private smoke = new Puffs(80, 0);
  private v = new THREE.Vector3();
  private clock = 0;

  /** `route` : le chenal depuis un poste d'amarrage (voir `shipRoute`) */
  constructor(private world: World, private route: (w: World, berth: [number, number], fx: number, fz: number) => [number, number][]) {
    this.group.add(this.smoke.mesh);
  }

  /** L'eau la plus proche de l'emprise (x, z, s × s), à `SEARCH` cases au plus : son centre et la direction qui y mène */
  private waterNear(x: number, z: number, s: number): { at: [number, number]; f: [number, number] } | null {
    const w = this.world, mx = x + s / 2, mz = z + s / 2;
    let best = Infinity, at: [number, number] | null = null;
    for (let cz = Math.floor(mz) - SEARCH; cz <= Math.floor(mz) + SEARCH; cz++)
      for (let cx = Math.floor(mx) - SEARCH; cx <= Math.floor(mx) + SEARCH; cx++) {
        if (!w.inCells(cx, cz) || !(w.lake[w.ci(cx, cz)] === 1 || w.cellAvg(cx, cz) < NAV)) continue;
        const d = Math.hypot(cx + 0.5 - mx, cz + 0.5 - mz);
        if (d < best) { best = d; at = [cx + 0.5, cz + 0.5]; }
      }
    if (!at) return null;
    const dx = at[0] - mx, dz = at[1] - mz, l = Math.hypot(dx, dz) || 1;
    return { at, f: [dx / l, dz / l] };
  }

  private waterY(x: number, z: number) {
    const w = this.world, cx = Math.floor(x), cz = Math.floor(z);
    if (!w.inCells(cx, cz)) return SEA;
    const k = w.ci(cx, cz);
    return w.lake[k] ? w.lakeLevel[k] : SEA;
  }

  private geoOf(kind: VesselKind) {
    let g = this.geos.get(kind);
    if (!g) { const p = new Parts(); const f = BUILD[kind](p); g = { geo: p.build(false).body, funnel: f }; this.geos.set(kind, g); }
    return g;
  }

  private makeVessel(kind: VesselKind, size: number, t: number): Vessel {
    const g = this.geoOf(kind), root = new THREE.Group(), mesh = new THREE.Mesh(g.geo, mats.body);
    mesh.castShadow = true;
    root.add(mesh);
    root.visible = false;
    root.scale.setScalar(size);
    this.group.add(root);
    return { root, kind, funnel: g.funnel ? new THREE.Vector3(...g.funnel) : null, state: 'wait', t, s: 0, heading: 0, size };
  }

  private dropLane(l: Lane) { for (const v of l.vessels) this.group.remove(v.root); }

  /**
   * Chaque chantier naval arme deux navires de l'époque, chaque halle aux poissons un bateau de pêche ; le chenal se refait quand
   * le terrain change (visVersion) ou que l'âge change le navire
   */
  update(dt: number, age: number) {
    const w = this.world, live = new Set<number>();
    this.clock += dt;
    for (const b of w.buildings.values()) {
      const yard = b.kind === 'shipyard', market = b.kind === 'fishmarket';
      if ((!yard && !market) || age < 2) continue;
      live.add(b.id);
      const a = Math.min(5, age), key = `${b.x}|${b.z}|${a}|${w.visVersion}`;
      let lane = this.lanes.get(b.id);
      if (lane && lane.key !== key) { this.dropLane(lane); this.lanes.delete(b.id); lane = undefined; }
      if (!lane) {
        lane = { key, path: [], vessels: [] };
        this.lanes.set(b.id, lane);
        const s = yard ? 3 : 2, near = this.waterNear(b.x, b.z, s);
        const path = near ? this.route(w, near.at, near.f[0], near.f[1]).map(([x, z]) => new THREE.Vector3(x, 0, z)) : [];
        // un chenal trop court n'a pas de navire : rien à voir partir
        if (path.length > 12) {
          lane.path = path;
          const kinds = yard ? [merchantKind(a, 0), merchantKind(a, 1)] : [fisherKind(a)];
          kinds.forEach((k, i) => lane!.vessels.push(this.makeVessel(k, yard ? 1.25 : 0.7, 4 + i * 22 + (b.id % 5) * 3)));
        }
      }
      for (const v of lane.vessels) this.step(v, lane.path, b.id, dt);
    }
    for (const [id, lane] of this.lanes) if (!live.has(id)) { this.dropLane(lane); this.lanes.delete(id); }
    this.smoke.update(dt);
  }

  private step(v: Vessel, path: THREE.Vector3[], id: number, dt: number) {
    const L = path.length - 1;
    v.t -= dt;
    if (v.state === 'wait') { if (v.t <= 0) { v.state = 'out'; v.s = 0; v.root.visible = true; } }
    else if (v.state === 'out' || v.state === 'in') {
      v.s += dt * SPEED[v.kind] * 2 * (v.state === 'out' ? 1 : -1);
      if (v.state === 'out' && v.s >= L) { v.state = 'away'; v.t = 14 + Math.random() * 26; v.root.visible = false; }
      if (v.state === 'in' && v.s <= 0) { v.state = 'wait'; v.t = 16 + Math.random() * 24; v.root.visible = false; }
    } else if (v.t <= 0) { v.state = 'in'; v.s = L; v.root.visible = true; }
    if (!v.root.visible) return;
    const i = Math.max(0, Math.min(L - 1, Math.floor(v.s))), f = Math.max(0, Math.min(1, v.s - i));
    const a = path[i], c = path[Math.min(L, i + 1)];
    this.v.lerpVectors(a, c, f);
    // cap : dans l'axe du chenal, proue vers où il va (au retour, vers la grève)
    const away = Math.atan2(c.x - a.x, c.z - a.z), want = v.state === 'in' ? away + Math.PI : away;
    const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    v.heading += wrap(want - v.heading) * Math.min(1, dt * 1.5);
    // il sort de la grève en grandissant, et se fond à l'horizon
    const k = Math.max(0.001, Math.min(1, v.s / FADE, (L - v.s) / FADE));
    v.root.scale.setScalar(v.size * k);
    const t = this.clock;
    v.root.position.set(this.v.x, this.waterY(this.v.x, this.v.z) + Math.sin(t * 1.1 + id) * 0.006, this.v.z);
    v.root.rotation.set(Math.sin(t * 0.8 + id) * 0.01, v.heading, Math.sin(t * 0.9 + id * 2) * 0.015);
    if (v.funnel && Math.random() < dt * 7) {
      v.root.updateMatrixWorld();
      const q = v.funnel.clone().applyMatrix4(v.root.matrixWorld);
      this.smoke.spawn(q.x, q.y, q.z, 0, 0.35, 0, 0.06, 3.5, SMOKE, 0, { grow: 3, drag: 0.2, wind: 0.25, alpha: 0.6 });
    }
  }
}
