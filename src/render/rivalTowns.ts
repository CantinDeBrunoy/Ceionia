import * as THREE from 'three';
import type { World } from '../world/world';
import { N, VEG_FOREST, VEG_ROCKS } from '../world/world';
import { GeoBatch } from './batch';
import { mats, mergeLit } from './materials';
import { townPlans, inPoly, type Lot, type TownPlan } from '../world/rivalTown';
import { townModel, townWall, plinthGeo } from './townModels';
import { hash2 } from '../core/rng';

/**
 * Les villes des deux peuples rivaux de l'archipel, en décor (voir `world/rivalTown.ts` pour le plan, `townModels.ts` pour les
 * modèles, `docs/iles.md`). Tout est dans un seul lot (`GeoBatch`, matériau `mats.lit` : fenêtres allumées la nuit) : les
 * lots de la ville, leurs socles sur les pentes, les pans de remparts, et le sol des rues et des places (une géométrie drapée
 * par ville). La ville suit l'âge du village du joueur : au passage d'un âge, ses bâtiments s'écrasent puis regonflent un par
 * un dans leur nouveau modèle, et les maisons de l'âge sortent de terre dans les vides
 */

/** Durée de l'écrasement puis du regonflement d'un bâtiment qui change d'âge (s), et étalement des départs (s) */
const MORPH = 0.8, SPREAD = 5;

interface Piece {
  inst: number; geo: THREE.BufferGeometry;
  /** place (monde), rotation, échelle (le socle s'étire) */
  x: number; y: number; z: number; rot: number; sx: number; sy: number; sz: number;
}
interface Item {
  lot: Lot; plan: TownPlan;
  body: Piece | null; plinth: Piece | null;
  /** modèle à prendre (au milieu de l'animation), départ différé, temps de l'animation (-1 : au repos) */
  next: THREE.BufferGeometry | null; delay: number; t: number;
  /** le lot quitte la ville (rien ne le fait aujourd'hui, mais l'âge peut redescendre au bac à sable) */
  leave: boolean;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** Couleur du sol des rues et des places, par peuple et par âge */
function streetColor(people: TownPlan['people'], age: number) {
  if (people === 'orient') return [0xbfa478, 0xbfa478, 0xcbb68c, 0xc2b090, 0xa9a49a, 0xdedad2][age];
  return [0xb8a888, 0xb8a888, 0xbab4a6, 0xaca89e, 0x9a9a98, 0xd8dcdc][age];
}

export class RivalTowns {
  readonly group = new THREE.Group();
  readonly plans: TownPlan[];
  private batch = new GeoBatch(mats.lit, 1024, 1 << 19);
  private items: Item[] = [];
  private walls: Piece[] = [];
  private grounds: Piece[] = [];
  private age = -1;
  private visVersion = -1;

  constructor(private world: World) {
    this.plans = townPlans(world);
    this.group.add(this.batch.mesh);
    this.markGround();
  }

  /**
   * Les cases des villes : pas d'herbe ni de cailloux (`World.town`), pas de forêt ni de rocaille (retirées de `veg`, comme
   * le replat du village au générateur)
   */
  private markGround() {
    const w = this.world, mask = new Uint8Array(N * N);
    const mark = (x: number, z: number) => {
      if (!w.inCells(x, z)) return;
      const k = w.ci(x, z);
      mask[k] = 1;
      if (w.veg[k] === VEG_FOREST || w.veg[k] === VEG_ROCKS) { w.veg[k] = 0; w.markVeg(x, z, x, z); w.vegDirty = true; }
    };
    for (const p of this.plans) {
      const R = Math.ceil(p.r + 8);
      for (let z = Math.floor(p.z - R); z <= p.z + R; z++)
        for (let x = Math.floor(p.x - R); x <= p.x + R; x++) if (inPoly(x + 0.5, z + 0.5, p.wall)) mark(x, z);
      for (const l of p.lots) {
        const r = Math.hypot(l.w, l.d) / 2 + 0.6;
        for (let z = Math.floor(l.z - r); z <= l.z + r; z++) for (let x = Math.floor(l.x - r); x <= l.x + r; x++) if (Math.hypot(x + 0.5 - l.x, z + 0.5 - l.z) < r) mark(x, z);
      }
      for (const s of p.streets)
        for (let i = 0; i + 1 < s.pts.length; i++) {
          const [a, b] = [s.pts[i], s.pts[i + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
          for (let j = 0; j <= n; j++) { const x = a[0] + ((b[0] - a[0]) * j) / n, z = a[1] + ((b[1] - a[1]) * j) / n; for (const o of [-0.6, 0, 0.6]) mark(Math.floor(x + o), Math.floor(z + o)); }
        }
    }
    w.town = mask;
    // la végétation déjà dessinée se refait sans l'herbe ni les cailloux des villes
    for (const p of this.plans) { const R = Math.ceil(p.r + 16); w.markVeg(Math.floor(p.x - R), Math.floor(p.z - R), Math.ceil(p.x + R), Math.ceil(p.z + R)); }
    w.vegDirty = true;
  }

  /** Hauteur du sol affiché */
  private h(x: number, z: number) { return this.world.hAt(x, z); }

  /** Hauteur où poser un lot, et le bas de son socle (le point le plus bas de son emprise) */
  private footing(l: Lot): [number, number] {
    const c = Math.cos(l.rot), s = Math.sin(l.rot), hs: number[] = [];
    for (const [u, v] of [[0, 0], [-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, -0.45], [0, 0.45], [-0.45, 0], [0.45, 0]]) {
      const lx = u * l.w, lz = v * l.d;
      hs.push(this.h(l.x + lx * c + lz * s, l.z - lx * s + lz * c));
    }
    hs.sort((a, b) => a - b);
    const lo = hs[0], hi = hs[hs.length - 1], mid = hs[Math.floor(hs.length / 2)];
    if (l.kind === 'port') {
      // le quai à fleur d'eau, l'entrepôt sur la rive
      const back = this.h(l.x - s * 1.1, l.z - c * 1.1);
      return [Math.max(0.16, Math.min(back, 0.6)), lo];
    }
    if (l.kind === 'field') return [mid - 0.01, mid];
    if (l.kind === 'tower' || l.kind === 'gate' || l.kind === 'paifang') return [mid, mid];
    // au-dessus de la plupart de l'emprise, sans flotter de toute la pente : un socle comble le reste
    return [Math.max(mid, hi - 0.25), lo - 0.08];
  }

  private setPiece(pc: Piece, k = 1) {
    _q.setFromAxisAngle(_up, pc.rot);
    _p.set(pc.x, pc.y, pc.z);
    // (un lot presque écrasé disparaît : son toit aplati ferait une tache au sol)
    if (k < 0.03) _s.set(0, 0, 0);
    else if (k < 1) _s.set(pc.sx * (0.6 + 0.4 * k), pc.sy * k, pc.sz * (0.6 + 0.4 * k));
    else _s.set(pc.sx, pc.sy, pc.sz);
    _m.compose(_p, _q, _s);
    this.batch.setMatrix(pc.inst, _m);
  }

  private addPiece(geo: THREE.BufferGeometry, x: number, y: number, z: number, rot: number, sx = 1, sy = 1, sz = 1): Piece | null {
    const inst = this.batch.add(geo);
    if (inst < 0) return null;
    const pc: Piece = { inst, geo, x, y, z, rot, sx, sy, sz };
    this.setPiece(pc);
    return pc;
  }

  private place(it: Item) {
    const [y, low] = this.footing(it.lot);
    if (it.body) it.body.y = y;
    const need = it.lot.kind !== 'field' && it.lot.kind !== 'port' && it.lot.kind !== 'tower' && it.lot.kind !== 'gate' && it.lot.kind !== 'paifang' && y - low > 0.03;
    if (need && !it.plinth) it.plinth = this.addPiece(plinthGeo(it.plan.people), it.lot.x, low, it.lot.z, it.lot.rot, it.lot.w * 0.94, y - low + 0.02, it.lot.d * 0.94);
    else if (need && it.plinth) { Object.assign(it.plinth, { y: low, sy: y - low + 0.02 }); this.setPiece(it.plinth); }
    else if (!need && it.plinth) { this.batch.remove(it.plinth.inst, it.plinth.geo); it.plinth = null; }

    this.morph(it, it.t >= 0 ? Math.max(1e-3, this.scaleAt(it)) : 1);
  }

  /** Le lot à l'échelle `k` de son animation (le socle avec lui) */
  private morph(it: Item, k: number) {
    if (it.body) this.setPiece(it.body, k);
    if (it.plinth) this.setPiece(it.plinth, k);
  }

  /** Échelle de l'animation de changement d'âge : écrasement (1 → 0) puis regonflement (0 → 1) */
  private scaleAt(it: Item) {
    const u = it.t / MORPH;
    return u < 0.5 ? 1 - u * 2 : (u - 0.5) * 2;
  }

  /** L'âge des villes (celui du village du joueur, la Préhistoire montrant le bourg de l'Antiquité) */
  setAge(age: number, instant = false) {
    const a = Math.max(1, Math.min(5, age));
    if (a === this.age) return;
    const first = this.age < 0;
    this.age = a;
    const have = new Map(this.items.map((it) => [it.lot, it]));
    for (const plan of this.plans)
      for (const lot of plan.lots) {
        const it = have.get(lot), want = lot.from <= a;
        const geo = townModel(plan.people, lot.kind, a, lot.v, lot.w, lot.d);
        const delay = first || instant ? 0 : hash2(Math.round(lot.x * 7), Math.round(lot.z * 7), 41) * SPREAD;
        if (want && !it) {
          const n: Item = { lot, plan, body: null, plinth: null, next: geo, delay, t: first || instant ? -1 : 0.5 * MORPH, leave: false };
          if (n.t < 0) { n.body = this.addPiece(geo, lot.x, 0, lot.z, lot.rot); n.next = null; }
          else n.body = this.addPiece(geo, lot.x, 0, lot.z, lot.rot);
          this.items.push(n);
          this.place(n);
          if (n.t >= 0) this.morph(n, 1e-3);
        } else if (want && it) {
          it.leave = false;
          if (it.body && it.body.geo !== geo) {
            if (instant) { this.batch.swap(it.body.inst, it.body.geo, geo); it.body.geo = geo; this.setPiece(it.body); }
            else { it.next = geo; it.delay = delay; it.t = 0; }
          }
        } else if (!want && it) { it.leave = true; it.next = null; it.delay = delay; it.t = 0; }
      }
    this.buildWalls();
    this.buildGrounds();
  }

  /** Les pans de remparts, entre les tours, interrompus aux portes ; chaque pan suit le sol par marches */
  private buildWalls() {
    for (const w of this.walls) this.batch.remove(w.inst, w.geo);
    this.walls = [];
    for (const p of this.plans) {
      const K = p.wall.length;
      for (let i = 0; i < K; i++) {
        const a = p.wall[i], b = p.wall[(i + 1) % K], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, rot = Math.atan2(-uz, ux);
        // les tronçons : de la tour à la porte et de la porte à la tour, ou d'une tour à l'autre
        const spans: [number, number][] = p.gates[i] !== null ? [[0.5, len / 2 - 1.15], [len / 2 + 1.15, len - 0.5]] : [[0.5, len - 0.5]];
        for (const [s0, s1] of spans) {
          const n = Math.max(1, Math.round((s1 - s0) / 1.6)), step = (s1 - s0) / n;
          for (let j = 0; j < n; j++) {
            const m = s0 + step * (j + 0.5), x = a[0] + ux * m, z = a[1] + uz * m;
            const y = Math.min(this.h(a[0] + ux * (m - step / 2), a[1] + uz * (m - step / 2)), this.h(x, z), this.h(a[0] + ux * (m + step / 2), a[1] + uz * (m + step / 2)));
            const pc = this.addPiece(townWall(p.people, this.age, step + 0.02), x, y + 0.02, z, rot);
            if (pc) this.walls.push(pc);
          }
        }
      }
    }
  }

  /** Le sol des rues et des places, drapé sur le relief (une géométrie par ville, refaite à chaque âge) */
  private buildGrounds() {
    for (const g of this.grounds) { this.batch.remove(g.inst, g.geo); g.geo.dispose(); }
    this.grounds = [];
    for (const p of this.plans) {
      const pos: number[] = [], col = new THREE.Color(streetColor(p.people, this.age)), lift = 0.045;
      // deux triangles tournés vers le ciel, quel que soit le sens où les coins sont donnés
      const quad = (a: number[], b: number[], c: number[], d: number[]) => {
        const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        if (up > 0) pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        else pos.push(...a, ...c, ...b, ...a, ...d, ...c);
      };
      const pt = (x: number, z: number) => [x, this.h(x, z) + lift, z];
      for (const s of p.streets) {
        if (s.from > this.age) continue;
        for (let i = 0; i + 1 < s.pts.length; i++) {
          const a = s.pts[i], b = s.pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(len / 0.5));
          const nx = (-(b[1] - a[1]) / len) * s.w / 2, nz = ((b[0] - a[0]) / len) * s.w / 2;
          // (les bouts dépassent un peu, pour que les tronçons se recouvrent aux coudes)
          const ex = ((b[0] - a[0]) / len) * s.w * 0.4, ez = ((b[1] - a[1]) / len) * s.w * 0.4;
          for (let j = 0; j < n; j++) {
            const t0 = j / n, t1 = (j + 1) / n;
            const x0 = a[0] + (b[0] - a[0]) * t0 - (j === 0 ? ex : 0), z0 = a[1] + (b[1] - a[1]) * t0 - (j === 0 ? ez : 0);
            const x1 = a[0] + (b[0] - a[0]) * t1 + (j === n - 1 ? ex : 0), z1 = a[1] + (b[1] - a[1]) * t1 + (j === n - 1 ? ez : 0);
            quad(pt(x0 - nx, z0 - nz), pt(x0 + nx, z0 + nz), pt(x1 + nx, z1 + nz), pt(x1 - nx, z1 - nz));
          }
        }
      }
      for (const q of p.plazas) {
        const rings = 3, seg = 20;
        for (let r = 0; r < rings; r++)
          for (let k = 0; k < seg; k++) {
            const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2, r0 = (q.r * r) / rings, r1 = (q.r * (r + 1)) / rings;
            const P = (rr: number, a: number) => pt(q.x + Math.cos(a) * rr, q.z + Math.sin(a) * rr);
            quad(P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1));
          }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const c = new Float32Array(pos.length);
      for (let i = 0; i < pos.length; i += 3) { const k = 0.94 + hash2(Math.round(pos[i] * 2), Math.round(pos[i + 2] * 2), 77) * 0.08; c[i] = col.r * k; c[i + 1] = col.g * k; c[i + 2] = col.b * k; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const lit = mergeLit(g, null) ?? g;
      if (lit !== g) g.dispose();
      const pc = this.addPiece(lit, 0, 0, 0, 0);
      if (pc) { pc.geo = lit; this.grounds.push(pc); }
    }
  }

  update(dt: number, age: number) {
    this.setAge(age);
    // le relief a changé (sculpté) : tout se repose
    if (this.world.visVersion !== this.visVersion) {
      const first = this.visVersion < 0;
      this.visVersion = this.world.visVersion;
      if (!first) { for (const it of this.items) this.place(it); this.buildWalls(); this.buildGrounds(); }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.t < 0) continue;
      if (it.delay > 0) { it.delay -= dt; continue; }
      const half = it.t < MORPH / 2;
      it.t += dt;
      // à mi-chemin : le nouveau modèle, ou le lot qui s'en va
      if (half && it.t >= MORPH / 2) {
        if (it.leave) {
          if (it.body) this.batch.remove(it.body.inst, it.body.geo);
          if (it.plinth) this.batch.remove(it.plinth.inst, it.plinth.geo);
          this.items.splice(i, 1);
          continue;
        }
        if (it.next && it.body && it.next !== it.body.geo && this.batch.swap(it.body.inst, it.body.geo, it.next)) it.body.geo = it.next;
        it.next = null;
      }
      if (it.t >= MORPH) { it.t = -1; this.morph(it, 1); continue; }
      this.morph(it, Math.max(1e-3, this.scaleAt(it)));
    }
  }

  dispose() {
    this.group.remove(this.batch.mesh);
    this.batch.mesh.dispose();
    for (const g of this.grounds) g.geo.dispose();
    if (this.world.town) this.world.town = null;
  }
}
