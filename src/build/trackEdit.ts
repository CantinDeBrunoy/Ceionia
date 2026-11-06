import * as THREE from 'three';
import { World, N } from '../world/world';
import { Railway } from '../sim/railway';
import type { Overlay } from './tools';

/**
 * Ligne en cours de tracé : ses arrêts (bâtiments), sa couleur, la ligne qu'on modifie (null : une nouvelle) et, pour chaque
 * tronçon (de l'arrêt i au suivant), les cases par où le joueur fait passer la voie
 */
export interface RailEditState { stops: number[]; line: number | null; color: number; via: number[][] }

/** Un tronçon tel que l'éditeur le montre : sa ligne (le tracé, ou les points reliés tout droit), où y tombent ses points */
interface LegShow { line: [number, number][]; cum: number[]; at: number[] }

const BAD = 0xe8443a;

/**
 * Éditeur du tracé d'une ligne de chemin de fer, façon Anno : la voie prévue s'affiche d'arrêt en arrêt ; on la saisit pour
 * la faire passer où l'on veut (un point de passage naît là où l'on clique, et suit le pointeur), on déplace un point en le
 * glissant, on le retire d'un clic. Un morceau qui ne passe pas (point sur un obstacle, rien ne relie deux points) est en
 * rouge, et la ligne ne se valide pas tant qu'il en reste
 */
export class TrackEditor implements Overlay {
  group = new THREE.Group();
  private legs: LegShow[] = [];
  private key = '';
  private drag: { leg: number; idx: number; moved: boolean; born: boolean } | null = null;
  private knob = new THREE.SphereGeometry(1, 14, 10);
  private mats = new Map<string, THREE.MeshBasicMaterial>();

  /** `edit` : la ligne en cours de tracé ; `reach` : rayon de saisie (en cases, selon le zoom) ; `changed` : l'éditeur a bougé un point */
  constructor(private world: World, private rail: Railway, private edit: () => RailEditState | null, private reach: () => number, private changed: () => void) {
    this.group.renderOrder = 8;
  }

  /** À chaque image : le tracé prévu se refait quand les arrêts, les points ou le terrain changent */
  update() {
    const e = this.edit(), w = this.world;
    const key = e ? `${e.stops.join('.')}|${e.via.map((v) => v.join(',')).join('/')}|${e.color}|${w.version}|${w.visVersion}|${this.rail.version}` : '';
    if (key === this.key) return;
    this.key = key;
    for (const o of [...this.group.children]) { this.group.remove(o); if ((o as THREE.Mesh).geometry !== this.knob) (o as THREE.Mesh).geometry?.dispose(); }
    this.legs = [];
    if (!e || e.stops.length < 2) return;
    const good: number[] = [], part: number[] = [], bad: number[] = [];
    for (let i = 0; i + 1 < e.stops.length; i++) {
      const a = w.buildings.get(e.stops[i]), b = w.buildings.get(e.stops[i + 1]), via = e.via[i] ?? [];
      const plan = a && b ? this.rail.plan(a, b, via) : null;
      const sa = a ? this.rail.stopOf(a) : null, sb = b ? this.rail.stopOf(b) : null;
      // les points du tronçon, d'arrêt en arrêt : milieu du quai, points de passage, milieu du quai suivant
      const ctrl: [number, number][] = [...(sa ? [sa.c] : []), ...via.map(centre), ...(sb ? [sb.c] : [])];
      if (plan?.seg) {
        this.legs.push(show(plan.seg.pts, via));
        ribbon(good, w, plan.seg.pts, 0.2);
      } else {
        this.legs.push(show(ctrl, via));
        // les morceaux qui passent, tracés ; ceux qui ne passent pas, tout droit et en rouge
        plan?.pieces.forEach((p, j) => {
          if (p) ribbon(part, w, p.map(centre), 0.14);
          else if (ctrl[j] && ctrl[j + 1]) ribbon(bad, w, [ctrl[j], ctrl[j + 1]], 0.16);
        });
        if (!plan) ribbon(bad, w, ctrl, 0.16);
      }
      // les points de passage : une poignée chacun (rouge si un morceau qui le touche ne passe pas)
      via.forEach((k, j) => {
        const [x, z] = centre(k), off = plan?.pieces[j] === null || plan?.pieces[j + 1] === null;
        const m = new THREE.Mesh(this.knob, this.mat(off ? BAD : 0xffffff, 0.95));
        m.scale.setScalar(0.2); m.position.set(x, w.hAt(x, z) + 0.45, z); m.renderOrder = 10;
        const ring = new THREE.Mesh(this.knob, this.mat(e.color, 0.9));
        ring.scale.set(0.28, 0.08, 0.28); ring.position.set(x, w.hAt(x, z) + 0.45, z); ring.renderOrder = 9;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6).translate(0, 0.2, 0), this.mat(0xffffff, 0.7));
        stem.position.set(x, w.hAt(x, z) + 0.05, z); stem.renderOrder = 8;
        this.group.add(m, ring, stem);
      });
    }
    for (const [pos, color, op] of [[good, e.color, 0.8], [part, e.color, 0.45], [bad, BAD, 0.85]] as [number[], number, number][]) {
      if (!pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const mesh = new THREE.Mesh(g, this.mat(color, op));
      mesh.renderOrder = 8; mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  /** Ce qui empêche de valider le tracé (null : il passe partout où le joueur a posé des points) */
  trouble(): string | null {
    const e = this.edit(), w = this.world;
    if (!e) return null;
    for (let i = 0; i + 1 < e.stops.length; i++) {
      if (!e.via[i]?.length) continue;
      const a = w.buildings.get(e.stops[i]), b = w.buildings.get(e.stops[i + 1]), plan = a && b ? this.rail.plan(a, b, e.via[i]) : null;
      if (a && b && !plan?.seg) return `La voie ne passe pas entre ${this.rail.stopName(a)} et ${this.rail.stopName(b)} (en rouge) : déplacez ou retirez le point de passage.`;
    }
    return null;
  }

  // ---------- Pointeur ----------

  hover(hit: THREE.Vector3 | null) {
    if (this.drag) return 'grabbing';
    if (!hit || !this.edit()) return '';
    return this.handleAt(hit) ? 'grab' : this.trackAt(hit) ? 'copy' : '';
  }

  down(hit: THREE.Vector3) {
    const e = this.edit();
    if (!e || e.stops.length < 2) return false;
    const h = this.handleAt(hit);
    if (h) { this.drag = { ...h, moved: false, born: false }; return true; }
    // un clic sur une gare la propose comme arrêt, même tout près de la voie
    const b = this.world.buildingAt(Math.floor(hit.x), Math.floor(hit.z));
    if (b && this.rail.stopOf(b)) return false;
    const t = this.trackAt(hit);
    if (!t) return false;
    // un nouveau point, là où l'on a saisi la voie, rangé à sa place le long du tronçon
    const via = e.via[t.leg] ?? (e.via[t.leg] = []), L = this.legs[t.leg], idx = L.at.filter((s) => s < t.s).length;
    via.splice(idx, 0, cellOf(hit.x, hit.z));
    this.drag = { leg: t.leg, idx, moved: false, born: true };
    this.changed();
    return true;
  }

  move(hit: THREE.Vector3) {
    const e = this.edit(), d = this.drag;
    if (!e || !d) return;
    const k = cellOf(hit.x, hit.z), via = e.via[d.leg];
    if (!via || k < 0 || via[d.idx] === k) return;
    via[d.idx] = k;
    d.moved = true;
    this.changed();
  }

  up() {
    const e = this.edit(), d = this.drag;
    this.drag = null;
    // un clic sur un point (sans le glisser) le retire
    if (e && d && !d.moved && !d.born) { e.via[d.leg]?.splice(d.idx, 1); this.changed(); }
  }

  /** Point de passage sous le pointeur (le plus proche, à portée) */
  private handleAt(hit: THREE.Vector3) {
    const e = this.edit();
    if (!e) return null;
    let best: { leg: number; idx: number } | null = null, bd = this.reach();
    e.via.forEach((v, leg) => v.forEach((k, idx) => {
      const [x, z] = centre(k), d = Math.hypot(x - hit.x, z - hit.z);
      if (d < bd) { bd = d; best = { leg, idx }; }
    }));
    return best as { leg: number; idx: number } | null;
  }

  /** Point de la voie prévue sous le pointeur : son tronçon, et où il tombe le long de lui */
  private trackAt(hit: THREE.Vector3) {
    let best: { leg: number; s: number } | null = null, bd = this.reach();
    this.legs.forEach((L, leg) => {
      const p = project(L.line, L.cum, hit.x, hit.z);
      if (p.d < bd) { bd = p.d; best = { leg, s: p.s }; }
    });
    return best as { leg: number; s: number } | null;
  }

  private mat(color: number, opacity: number) {
    const key = `${color}|${opacity}`;
    let m = this.mats.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide }); this.mats.set(key, m); }
    return m;
  }
}

const centre = (k: number): [number, number] => [(k % N) + 0.5, Math.floor(k / N) + 0.5];
const cellOf = (x: number, z: number) => (x >= 0 && z >= 0 && x < N && z < N ? Math.floor(z) * N + Math.floor(x) : -1);

/** Le tronçon montré : sa ligne, ses longueurs cumulées, et où tombe chaque point de passage le long d'elle */
function show(pts: [number, number][], via: number[]): LegShow {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { line: pts, cum, at: via.map((k) => project(pts, cum, ...centre(k)).s) };
}

/** Point d'une ligne le plus proche de (x, z) : sa distance, et où il tombe le long d'elle */
function project(pts: [number, number][], cum: number[], x: number, z: number) {
  let d = Infinity, s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], bx = pts[i + 1][0] - ax, bz = pts[i + 1][1] - az, l = bx * bx + bz * bz;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / l)) : 0, dd = Math.hypot(x - ax - bx * t, z - az - bz * t);
    if (dd < d) { d = dd; s = cum[i] + t * Math.sqrt(l); }
  }
  return { d, s };
}

/** Ruban posé au-dessus du relief le long d'une ligne (triangles à la suite dans `out`) */
function ribbon(out: number[], w: World, pts: [number, number][], hw: number) {
  const y = (x: number, z: number) => Math.max(w.hAt(x, z), w.deckY(Math.floor(x), Math.floor(z)) ?? -Infinity) + 0.14;
  // pas fin : le ruban épouse le relief
  const fine: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3));
    for (let j = 0; j < n; j++) fine.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n]);
  }
  fine.push(pts[pts.length - 1]);
  for (let i = 0; i + 1 < fine.length; i++) {
    const [ax, az] = fine[i], [bx, bz] = fine[i + 1], l = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / l) * hw, nz = ((bx - ax) / l) * hw;
    const a = [ax + nx, y(ax + nx, az + nz), az + nz], b = [ax - nx, y(ax - nx, az - nz), az - nz], c = [bx - nx, y(bx - nx, bz - nz), bz - nz], d = [bx + nx, y(bx + nx, bz + nz), bz + nz];
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
}

