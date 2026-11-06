import * as THREE from 'three';
import { World } from '../world/world';
import { sizeOf } from '../build/catalog';
import { Parts } from './parts';
import { mats } from './materials';
import { coasterPath, DROP_TOWER, slidePaths } from './models';
import type { BuildingView } from './buildings';

/** Écart entre deux wagons le long de la voie, nombre de wagons, arrêt en gare (s) */
const GAP = 0.085, CARS = 4, DWELL = 2.5;

interface Ride {
  root: THREE.Group;
  cars: THREE.Mesh[];
  pts: THREE.Vector3[];
  /** abscisse curviligne du début de chaque tronçon, longueur totale, point le plus haut */
  at: number[];
  total: number;
  top: number;
  station: number;
  s: number;
  wait: number;
  drop: THREE.Mesh | null;
  dropT: number;
  modern: boolean;
}

/** Wagon des montagnes russes, avant = +z : caisse peinte, banquette, deux passagers bras levés */
function carGeo(modern: boolean, i: number) {
  const p = new Parts(), col = modern ? [0xf2c23a, 0x3c7fd8, 0x4fa860, 0xb45ad8][i % 4] : [0xd84a3e, 0x2c5a8a, 0xd84a3e, 0x2c5a8a][i % 4];
  p.box(0.07, 0.035, 0.08, 0, 0.012, 0, col); p.box(0.072, 0.012, 0.082, 0, 0.044, 0, modern ? 0xf4f2ee : C_GOLD);
  for (const x of [-0.016, 0.016]) {
    p.box(0.022, 0.03, 0.02, x, 0.045, -0.008, [0x3a5a8a, 0x8a3a3a, 0xf4f2ee, 0x4a6a3a][(i + (x > 0 ? 1 : 0)) % 4]);
    p.box(0.018, 0.018, 0.018, x, 0.077, -0.008, 0xe8b894);
    p.box(0.006, 0.035, 0.006, x + (x > 0 ? 0.012 : -0.012), 0.085, -0.004, 0xe8b894);
  }
  return p.build(false).body;
}
const C_GOLD = 0xe8c66a;

/** Baigneur lancé sur un toboggan, avant = +z : à plat dos les pieds devant (kamikaze), assis dans sa bouée, ou trois sur un radeau */
function sliderGeo(kind: number, i: number) {
  const p = new Parts(), suit = [0xd84a3e, 0xf2c23a, 0x4a5ad8, 0x4fa860, 0xb45ad8, 0xf28a3c], skin = 0xe8b894, c = suit[i % suit.length];
  if (kind === 0) {
    p.box(0.03, 0.016, 0.06, 0, 0.01, 0.01, c); p.box(0.026, 0.012, 0.03, 0, 0.01, 0.055, skin); p.box(0.024, 0.024, 0.024, 0, 0.012, -0.035, skin);
  } else {
    p.add(new THREE.TorusGeometry(kind === 1 ? 0.032 : 0.055, kind === 1 ? 0.013 : 0.018, 4, 12).rotateX(Math.PI / 2), 0, 0.016, 0, kind === 1 ? suit[(i + 2) % suit.length] : 0xf2c23a);
    const seats = kind === 1 ? [[0, 0]] : [[0, 0.035], [-0.03, -0.02], [0.03, -0.02]];
    seats.forEach(([x, z], k) => { p.box(0.026, 0.03, 0.024, x, 0.016, z, suit[(i + k) % suit.length]); p.box(0.02, 0.02, 0.02, x, 0.046, z, skin); });
  }
  return p.build(false).body;
}

/** Gerbe d'eau à l'arrivée d'un toboggan : colonne d'écume et couronne de gouttes */
function splashGeo() {
  const p = new Parts();
  p.cyl(0.03, 0.05, 0.05, 8, 0, 0, 0, 0xf4fbfd);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.add(new THREE.IcosahedronGeometry(0.014, 0), Math.cos(a) * 0.06, 0.04, Math.sin(a) * 0.06, 0xe8f6fa); }
  return p.build(false).body;
}

/** Un toboggan du grand parc aquatique : sa ligne (abscisses, longueur, départ), son genre et sa gerbe d'eau à l'arrivée */
interface Slide { pts: THREE.Vector3[]; at: number[]; total: number; top: number; kind: number; splash: THREE.Mesh; splashT: number }
/** Le parc aquatique et ses baigneurs : chacun attend en haut son tour, descend, plonge, puis remonte */
interface Pool { root: THREE.Group; slides: Slide[]; riders: { mesh: THREE.Mesh; slide: Slide; s: number; wait: number }[] }

/** Nacelle de la tour de chute : anneau de sièges autour du pylône, passagers les jambes dans le vide, feux */
function dropGeo() {
  const p = new Parts();
  p.cyl(0.13, 0.13, 0.04, 12, 0, 0, 0, 0xf2c23a);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, x = Math.cos(a) * 0.13, z = Math.sin(a) * 0.13;
    p.box(0.03, 0.04, 0.02, x, -0.03, z, [0xd84a3e, 0x3a6ab8, 0x4fa860, 0xf4f2ee][k % 4], -a);
    p.box(0.018, 0.018, 0.018, x, 0.012, z, 0xe8b894, -a);
    p.box(0.01, 0.04, 0.01, x, -0.07, z, 0x3c3c48, -a);
  }
  return p.build(false).body;
}

/**
 * Manèges de la grande fête foraine qui ne font pas que tourner : le train des montagnes russes file sur sa voie (il monte
 * lentement les côtes, dévale les pentes, s'arrête un instant en gare), et à l'époque moderne la nacelle de la tour de chute
 * monte doucement au sommet, s'y arrête, tombe d'un coup et rebondit. Au grand parc aquatique, les baigneurs dévalent les
 * toboggans et plongent dans une gerbe d'eau. Accrochés au bâtiment (son repère, son animation)
 */
export class Fairground {
  private rides = new Map<number, Ride>();
  private pools = new Map<number, Pool>();

  constructor(private world: World, private buildings: BuildingView) {}

  update(dt: number) {
    const live = new Set<number>();
    for (const b of this.world.buildings.values()) {
      if ((b.kind !== 'funfair' && b.kind !== 'waterpark') || sizeOf(b) !== 3) continue;
      const g = this.buildings.entries.get(b.id)?.group;
      if (!g) continue;
      live.add(b.id);
      if (b.kind === 'waterpark') {
        let pl = this.pools.get(b.id);
        if (pl && pl.root.parent !== g) { this.drop(pl); pl = undefined; }
        if (!pl) { pl = this.makePool(g); this.pools.set(b.id, pl); }
        this.stepPool(pl, dt);
        continue;
      }
      const modern = b.age >= 4;
      let r = this.rides.get(b.id);
      if (r && (r.modern !== modern || r.root.parent !== g)) { this.drop(r); r = undefined; }
      if (!r) { r = this.make(g, modern); this.rides.set(b.id, r); }
      this.step(r, dt);
    }
    for (const [id, r] of this.rides) if (!live.has(id)) { this.drop(r); this.rides.delete(id); }
    for (const [id, pl] of this.pools) if (!live.has(id)) { this.drop(pl); this.pools.delete(id); }
  }

  private makePool(g: THREE.Group): Pool {
    const root = new THREE.Group(), slides: Slide[] = [], riders: Pool['riders'] = [];
    for (const { pts, kind } of slidePaths()) {
      const at: number[] = [];
      let total = 0;
      for (let k = 0; k < pts.length; k++) { at.push(total); if (k + 1 < pts.length) total += pts[k].distanceTo(pts[k + 1]); }
      const end = pts[pts.length - 1], splash = new THREE.Mesh(splashGeo(), mats.body);
      splash.position.set(end.x, 0.04, end.z); splash.visible = false; root.add(splash);
      const sl: Slide = { pts, at, total, top: pts[0].y, kind, splash, splashT: 0 };
      slides.push(sl);
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(sliderGeo(kind, slides.length * 2 + i), mats.body);
        m.castShadow = true; root.add(m);
        riders.push({ mesh: m, slide: sl, s: i ? total * 0.5 : 0, wait: i ? 0 : 1 + Math.random() * 2 });
      }
    }
    g.add(root);
    return { root, slides, riders };
  }

  /** Point d'un toboggan à l'abscisse s (bornée au départ et à l'arrivée), et sa direction */
  private along(sl: Slide, s: number, out: THREE.Vector3, dir: THREE.Vector3) {
    s = Math.max(0, Math.min(sl.total, s));
    let k = 0;
    while (k < sl.at.length - 2 && sl.at[k + 1] <= s) k++;
    const a = sl.pts[k], b = sl.pts[k + 1], len = a.distanceTo(b);
    out.lerpVectors(a, b, len ? (s - sl.at[k]) / len : 0);
    dir.subVectors(b, a).normalize();
  }

  private stepPool(pl: Pool, dt: number) {
    const p = new THREE.Vector3(), d = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
    // chacun attend son tour en haut, puis file d'autant plus vite qu'il est descendu ; à l'arrivée, la gerbe d'eau
    for (const r of pl.riders) {
      const sl = r.slide;
      if (r.wait > 0) r.wait -= dt;
      else {
        this.along(sl, r.s, p, d);
        r.s += (0.15 + (sl.kind === 0 ? 1.4 : 0.9) * Math.sqrt(Math.max(0, sl.top - p.y))) * dt;
        if (r.s >= sl.total) { r.s = 0; r.wait = 1.5 + Math.random() * 3; sl.splashT = 0.7; }
      }
      this.along(sl, r.s, p, d);
      r.mesh.position.set(p.x, p.y + 0.005, p.z);
      r.mesh.quaternion.setFromUnitVectors(Z, d);
    }
    for (const sl of pl.slides) {
      sl.splashT = Math.max(0, sl.splashT - dt);
      sl.splash.visible = sl.splashT > 0;
      const t = 1 - sl.splashT / 0.7;
      sl.splash.scale.set(0.6 + t * 1.2, Math.max(0.05, 1.6 * (1 - t)), 0.6 + t * 1.2);
    }
  }

  private make(g: THREE.Group, modern: boolean): Ride {
    const pts = coasterPath(modern), at: number[] = [];
    let total = 0, top = 0, station = 0;
    for (let k = 0; k < pts.length; k++) { at.push(total); total += pts[k].distanceTo(pts[(k + 1) % pts.length]); top = Math.max(top, pts[k].y); if (pts[k].y < pts[station].y) station = k; }
    const root = new THREE.Group(), cars: THREE.Mesh[] = [];
    for (let i = 0; i < CARS; i++) { const m = new THREE.Mesh(carGeo(modern, i), mats.body); m.castShadow = true; root.add(m); cars.push(m); }
    let drop: THREE.Mesh | null = null;
    if (modern) { drop = new THREE.Mesh(dropGeo(), mats.body); drop.castShadow = true; root.add(drop); }
    g.add(root);
    return { root, cars, pts, at, total, top, station: at[station], s: at[station], wait: DWELL, drop, dropT: Math.random() * 10, modern };
  }

  private drop(r: { root: THREE.Group }) {
    r.root.removeFromParent();
    r.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  }

  /** Point de la voie à l'abscisse s (repère du bâtiment), et sa direction */
  private at(r: Ride, s: number, out: THREE.Vector3, dir: THREE.Vector3) {
    s = ((s % r.total) + r.total) % r.total;
    let k = 0;
    while (k < r.at.length - 1 && r.at[k + 1] <= s) k++;
    const a = r.pts[k], b = r.pts[(k + 1) % r.pts.length], len = a.distanceTo(b);
    out.lerpVectors(a, b, len ? (s - r.at[k]) / len : 0);
    dir.subVectors(b, a).normalize();
  }

  private step(r: Ride, dt: number) {
    const p = new THREE.Vector3(), d = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
    // le train : arrêt en gare, puis la vitesse vient de la hauteur perdue depuis le sommet (et d'une chaîne dans les montées)
    if (r.wait > 0) r.wait -= dt;
    else {
      this.at(r, r.s, p, d);
      const v = d.y > 0.05 ? 0.32 : 0.32 + 2.1 * Math.sqrt(Math.max(0, r.top - p.y));
      const before = r.s;
      r.s += v * dt;
      // passage en gare : on s'arrête
      const lap = (x: number) => ((x - r.station) % r.total + r.total) % r.total;
      if (lap(r.s) < lap(before)) { r.s = r.station + Math.floor((r.s - r.station) / r.total) * r.total; r.wait = DWELL; }
    }
    r.cars.forEach((c, i) => {
      this.at(r, r.s - i * GAP, p, d);
      c.position.set(p.x, p.y + 0.012, p.z);
      c.quaternion.setFromUnitVectors(Z, d);
    });
    // la tour de chute : lente montée, pause au sommet, chute, rebond, pause en bas
    if (r.drop) {
      r.dropT = (r.dropT + dt) % 11;
      const t = r.dropT, lo = 0.12, hi = DROP_TOWER.h - 0.12;
      const y = t < 5 ? lo + (hi - lo) * (t / 5) : t < 6.5 ? hi : t < 7.1 ? hi - (hi - lo) * ((t - 6.5) / 0.6) ** 2 : t < 7.7 ? lo + Math.sin(((t - 7.1) / 0.6) * Math.PI) * 0.06 : lo;
      r.drop.position.set(DROP_TOWER.x, y, DROP_TOWER.z);
    }
  }
}
