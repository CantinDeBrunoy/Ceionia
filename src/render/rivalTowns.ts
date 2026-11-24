import * as THREE from 'three';
import type { World } from '../world/world';
import { N, VEG_FOREST, VEG_ROCKS } from '../world/world';
import { GeoBatch } from './batch';
import { mats, mergeLit } from './materials';
import { townPlans, townCells, inPoly, lotLives, type Lot, type TownPlan } from '../world/rivalTown';
import { campaignLots, campLotsAt, townRoles, townLotState, type CampLot, type TownWhen } from '../world/townCampaign';
import type { DiploState } from '../sim/diplomacy';
import { SEA } from '../world/world';
import { townModel, townWall, plinthGeo, townSmoke } from './townModels';
import { townProps } from './townProps';
import { RuinSmoke } from './isleRuins';
import { hash2 } from '../core/rng';

/** Distance de la caméra à une ville (cases) sous laquelle ses détails fins (réverbères, véhicules) se montrent */
export const FINE_DIST = 80;
/** Au-delà, les fumées des cheminées ne se dessinent plus */
const SMOKE_DIST = 300;

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
  lot: Lot | CampLot; plan: TownPlan;
  /** l'état du lot (la ville vaincue : en ruine, puis en reconstruction) */
  state: 'intact' | 'ruin' | 'repair';
  body: Piece | null; plinth: Piece | null;
  /** modèle à prendre (au milieu de l'animation), départ différé, temps de l'animation (-1 : au repos) */
  next: THREE.BufferGeometry | null; delay: number; t: number;
  /** le lot quitte la ville (rien ne le fait aujourd'hui, mais l'âge peut redescendre au bac à sable) */
  leave: boolean;
}

/** Les lots sans socle (posés à même le sol, sur l'eau, ou qui suivent la pente) */
const NO_PLINTH = new Set<string>(['field', 'port', 'tower', 'gate', 'paifang', 'pontoon', 'bridge', 'avenue', 'wire', 'ourFlags']);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/**
 * Les villes rivales sont des civilisations établies : on les découvre au plus tôt à la fin de l'Antiquité (cinématique
 * « Explorer le monde »), et elles montrent alors au moins le visage du Médiéval, avec les maisons d'une ville déjà dense
 */
export const RIVAL_MIN_AGE = 2, RIVAL_DENSE_AGE = 3;
/** L'âge que montrent les villes rivales quand le village est à l'âge `age` */
export const rivalAge = (age: number) => Math.max(RIVAL_MIN_AGE, Math.min(5, age));
/** Les lots présents à cet âge (la densité d'au moins l'Industriel) */
export const rivalLotsAge = (age: number) => Math.max(RIVAL_DENSE_AGE, rivalAge(age));

/** Sol de la ville dans les murs (terre battue, dallage), sous les rues : plus de pelouse entre les maisons */
function townGroundColor(people: TownPlan['people'], age: number) {
  if (people === 'orient') return [0xcdb488, 0xcdb488, 0xd2bc92, 0xcbb894, 0xc9bea8, 0xd4d0c6][age];
  return [0xa59a82, 0xa59a82, 0xa8a090, 0xa29c90, 0xa8a59e, 0xbcc0bc][age];
}

/**
 * Couleur du sol des rues et des places, par peuple et par âge : terre puis pavés, pavés sombres à l'Industriel, asphalte
 * au Moderne, dalles claires au Futuriste (assez loin du sol de la ville pour qu'on lise le tracé des rues de loin)
 */
function streetColor(people: TownPlan['people'], age: number) {
  if (people === 'orient') return [0xbfa478, 0xbfa478, 0xcbb68c, 0x9c8a72, 0x6e6a66, 0xf2f0ea][age];
  return [0xb8a888, 0xb8a888, 0xbab4a6, 0x7e7a74, 0x5e6066, 0xe8ecec][age];
}

export class RivalTowns {
  readonly group = new THREE.Group();
  readonly plans: TownPlan[];
  private batch = new GeoBatch(mats.lit, 1024, 1 << 19);
  private items: Item[] = [];
  private walls: Piece[] = [];
  private grounds: Piece[] = [];
  /**
   * Le niveau de détail : les objets des rues (`townProps`), une géométrie par ville dans un lot à part, sans ombre, montré
   * seulement quand la caméra est à moins de `FINE_DIST` de la ville
   */
  private fine = new GeoBatch(mats.lit, 4, 1 << 16);
  private props: { inst: number; geo: THREE.BufferGeometry; x: number; z: number }[] = [];
  /** fumées noires des cheminées (Industriel), vapeur blanche (Moderne) */
  private smoke = [new RuinSmoke(0x5a5550), new RuinSmoke(0xe8e8e4)];
  private age = -1;
  private visVersion = -1;

  constructor(private world: World) {
    this.plans = townPlans(world);
    this.group.add(this.batch.mesh);
    this.fine.mesh.castShadow = false;
    this.group.add(this.fine.mesh);
    for (const s of this.smoke) this.group.add(s.group);
    this.markGround();
  }

  /**
   * Les cases des villes : pas d'herbe ni de cailloux (`World.town`), pas de forêt ni de rocaille (retirées de `veg`, comme
   * le replat du village au générateur)
   */
  private markGround() {
    const w = this.world, mask = new Uint8Array(N * N);
    for (const p of this.plans)
      for (const k of townCells(w, p)) {
        mask[k] = 1;
        if (w.veg[k] === VEG_FOREST || w.veg[k] === VEG_ROCKS) { const x = k % N, z = Math.floor(k / N); w.veg[k] = 0; w.markVeg(x, z, x, z); w.vegDirty = true; }
      }
    w.town = mask;
    // la végétation déjà dessinée se refait sans l'herbe ni les cailloux des villes
    for (const p of this.plans) { const R = Math.ceil(p.r + 16); w.markVeg(Math.floor(p.x - R), Math.floor(p.z - R), Math.ceil(p.x + R), Math.ceil(p.z + R)); }
    w.vegDirty = true;
  }

  /** Hauteur du sol affiché */
  private h(x: number, z: number) { return this.world.hAt(x, z); }

  /** Hauteur où poser un lot, et le bas de son socle (le point le plus bas de son emprise) */
  private footing(l: Lot | CampLot): [number, number] {
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
    // (le ponton sur l'eau ; le pont à mi-hauteur de ses deux rives ; l'avenue et les barbelés à même le sol)
    if (l.kind === 'pontoon') return [SEA - 0.06, SEA - 0.06];
    if (l.kind === 'bridge') { const e1 = this.h(l.x - c * l.w * 0.55, l.z + s * l.w * 0.55), e2 = this.h(l.x + c * l.w * 0.55, l.z - s * l.w * 0.55); return [Math.max(SEA - 0.1, (e1 + e2) / 2 - 0.4), lo]; }
    if (l.kind === 'avenue' || l.kind === 'wire') return [mid, mid];
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
    const need = !NO_PLINTH.has(it.lot.kind) && y - low > 0.03;
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

  /**
   * La campagne du nouveau monde, vue des villes (chantier D) : le rôle de chaque ville (le rival en guerre, vaincu ; l'allié),
   * et l'état de la ville vaincue (en ruine, en reconstruction). Change, les villes se refont (`setAge`)
   */
  private roles = new Map<TownPlan, Set<TownWhen>>();
  private camp: { d: Pick<DiploState, 'ally' | 'path' | 'conflict' | 'victors' | 'wonAt'>; clock: number; dayLen: number } | null = null;
  private campKey = '';
  setCampaign(d: Pick<DiploState, 'ally' | 'path' | 'conflict' | 'victors' | 'wonAt'>, clock: number, dayLen: number) {
    this.camp = { d, clock, dayLen };
    for (const p of this.plans) this.roles.set(p, townRoles(d, p.people));
    // (la clé : les rôles, et l'état de la ville vaincue, qui change avec les jours)
    const st = this.plans.map((p) => `${[...this.roles.get(p)!].join(',')}:${d.ally !== p.people && d.conflict === 'won' ? townLotState(p, { kind: 'gate', x: p.x, z: p.z }, d, clock, dayLen) ?? 'up' : ''}`).join('|');
    if (st !== this.campKey) { this.campKey = st; if (this.age >= 0) this.setAge(this.age, false, true); }
  }

  /** L'âge des villes (celui du village du joueur, la Préhistoire montrant le bourg de l'Antiquité) ; `force` : refaire (la campagne a changé) */
  setAge(age: number, instant = false, force = false) {
    const a = rivalAge(age), dense = rivalLotsAge(age);
    if (a === this.age && !force) return;
    const first = this.age < 0;
    this.age = a;
    const have = new Map(this.items.map((it) => [it.lot, it]));
    for (const plan of this.plans) {
      // (les lots de la campagne, présents selon le rôle de la ville)
      const roles = this.roles.get(plan) ?? new Set<TownWhen>(), extra = campLotsAt(campaignLots(this.world, plan), a, roles);
      const camp = new Set<Lot | CampLot>(extra);
      for (const lot of [...plan.lots, ...extra] as (Lot | CampLot)[]) {
        const it = have.get(lot), want = camp.has(lot) || lotLives(lot as Lot, dense, a);
        const state = (this.camp && !camp.has(lot) ? townLotState(plan, lot as Lot, this.camp.d, this.camp.clock, this.camp.dayLen) : null) ?? 'intact';
        const geo = townModel(plan.people, lot.kind, a, lot.v, lot.w, lot.d, state);
        const delay = first || instant ? 0 : hash2(Math.round(lot.x * 7), Math.round(lot.z * 7), 41) * SPREAD;
        if (want && !it) {
          const n: Item = { lot, plan, state, body: null, plinth: null, next: geo, delay, t: first || instant ? -1 : 0.5 * MORPH, leave: false };
          if (n.t < 0) { n.body = this.addPiece(geo, lot.x, 0, lot.z, lot.rot); n.next = null; }
          else n.body = this.addPiece(geo, lot.x, 0, lot.z, lot.rot);
          this.items.push(n);
          this.place(n);
          if (n.t >= 0) this.morph(n, 1e-3);
        } else if (want && it) {
          it.leave = false;
          it.state = state;
          if (it.body && it.body.geo !== geo) {
            if (instant) { this.batch.swap(it.body.inst, it.body.geo, geo); it.body.geo = geo; this.setPiece(it.body); }
            else { it.next = geo; it.delay = delay; it.t = 0; }
          }
        } else if (!want && it) { it.leave = true; it.next = null; it.delay = delay; it.t = 0; }
      }
      // (les lots de campagne qui ne sont plus de mise s'en vont)
      for (const it of this.items) if (it.plan === plan && 'when' in it.lot && !camp.has(it.lot) && !it.leave) { it.leave = true; it.next = null; it.delay = 0; it.t = 0; }
    }
    this.buildWalls();
    this.buildGrounds();
    this.buildProps();
    this.buildSmoke();
  }

  /** Les objets des rues de chaque ville, pour l'âge des modèles */
  private buildProps() {
    for (const pr of this.props) { this.fine.remove(pr.inst, pr.geo); pr.geo.dispose(); }
    this.props = [];
    const dense = Math.max(3, this.age);
    for (const plan of this.plans) {
      const geo = townProps(plan, this.age, plan.lots.filter((l) => lotLives(l, dense, this.age)), (x, z) => this.h(x, z));
      if (!geo) continue;
      const inst = this.fine.add(geo);
      if (inst < 0) { geo.dispose(); continue; }
      this.fine.setMatrix(inst, _m.identity());
      this.props.push({ inst, geo, x: plan.x, z: plan.z });
    }
  }

  /** Les panaches des cheminées (usine, locomotive) à l'âge des modèles */
  private buildSmoke() {
    for (const s of this.smoke) s.clear();
    const sm = this.age <= 3 ? this.smoke[0] : this.smoke[1];
    let id = 0;
    for (const it of this.items) {
      if (it.leave) continue;
      const l = it.lot, c = Math.cos(l.rot), s = Math.sin(l.rot), [y] = this.footing(l);
      if ('when' in l) continue;
      for (const [lx, ly, lz] of townSmoke(l.kind, this.age)) sm.start(id++, l.x + lx * c + lz * s, y + ly, l.z - lx * s + lz * c, 0.55);
    }
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
            // (la ville vaincue : les pans du côté de l'assaut en ruine, puis en reconstruction)
            const st = this.camp ? townLotState(p, { kind: 'house', x, z }, this.camp.d, this.camp.clock, this.camp.dayLen) ?? 'intact' : 'intact';
            const pc = this.addPiece(townWall(p.people, this.age, step + 0.02, st, i * 7 + j), x, y + 0.02, z, rot);
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
      // la nappe du sol dans les murs, un peu sous les rues (une maille de 0,5 case, seulement les mailles tout à fait dedans)
      const fill: number[] = [], gc = new THREE.Color(townGroundColor(p.people, this.age)), st = 0.5;
      {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const [x, z] of p.wall) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        const P = (x: number, z: number) => [x, this.h(x, z) + 0.025, z];
        for (let z = Math.floor(z0 / st) * st; z < z1; z += st)
          for (let x = Math.floor(x0 / st) * st; x < x1; x += st) {
            if (!inPoly(x, z, p.wall) || !inPoly(x + st, z, p.wall) || !inPoly(x, z + st, p.wall) || !inPoly(x + st, z + st, p.wall)) continue;
            const a = P(x, z), b = P(x, z + st), c = P(x + st, z + st), d = P(x + st, z);
            fill.push(...a, ...b, ...c, ...a, ...c, ...d);
          }
      }
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
      const nStreet = pos.length;
      pos.push(...fill);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const c = new Float32Array(pos.length);
      for (let i = 0; i < pos.length; i += 3) {
        const base = i < nStreet ? col : gc, k = (i < nStreet ? 0.94 : 0.9) + hash2(Math.round(pos[i] * 2), Math.round(pos[i + 2] * 2), 77) * (i < nStreet ? 0.08 : 0.14);
        c[i] = base.r * k; c[i + 1] = base.g * k; c[i + 2] = base.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const lit = mergeLit(g, null) ?? g;
      if (lit !== g) g.dispose();
      const pc = this.addPiece(lit, 0, 0, 0, 0);
      if (pc) { pc.geo = lit; this.grounds.push(pc); }
    }
  }

  /** `eye` : la position de la caméra (détails fins de près, fumées pas trop loin) */
  update(dt: number, age: number, eye?: THREE.Vector3) {
    this.setAge(age);
    // le relief a changé (sculpté) : tout se repose
    if (this.world.visVersion !== this.visVersion) {
      const first = this.visVersion < 0;
      this.visVersion = this.world.visVersion;
      if (!first) { for (const it of this.items) this.place(it); this.buildWalls(); this.buildGrounds(); this.buildProps(); this.buildSmoke(); }
    }
    let near = Infinity;
    for (const pl of this.plans) if (eye) near = Math.min(near, Math.hypot(eye.x - pl.x, eye.y, eye.z - pl.z));
    for (const pr of this.props) this.fine.mesh.setVisibleAt(pr.inst, !!eye && Math.hypot(eye.x - pr.x, eye.y, eye.z - pr.z) < FINE_DIST);
    for (const s of this.smoke) { s.group.visible = near < SMOKE_DIST; if (s.group.visible) s.update(dt); }
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
    this.fine.mesh.dispose();
    for (const s of this.smoke) s.clear();
    for (const g of this.grounds) g.geo.dispose();
    for (const pr of this.props) pr.geo.dispose();
    if (this.world.town) this.world.town = null;
  }
}
