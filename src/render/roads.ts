import * as THREE from 'three';
import { World, N } from '../world/world';
import { hash2, smoothstep } from '../core/rng';
import { Simplex } from '../world/noise';
import { KINDS, KindId, sizeOf } from '../build/catalog';
import { mats } from './materials';

const AGE_COL = [0xe6d0a4, 0xead8b2, 0xdccdb0, 0xb5aea6, 0x9ea3ac].map((c) => new THREE.Color(c));
/** Bord des chemins : terre plus sombre, puis bordures claires des rues pavées et des trottoirs */
const EDGE_COL = [0xcdb084, 0xd3bb90, 0xc6b597, 0xd2cbc0, 0xd8d6d0].map((c) => new THREE.Color(c));
/** Ponts : tablier de bois, puis de pierre, puis d'acier ; piles et garde-corps */
const DECK_COL = [0x9a7452, 0xa27c58, 0x8f7c66, 0xa39d95, 0xb4b9c0].map((c) => new THREE.Color(c));
const PILE_COL = [0x6f5640, 0x6f5640, 0x8a8178, 0x8a8178, 0x7d838c].map((c) => new THREE.Color(c));
const SNOW = new THREE.Color(0xf2f6fa);
const PEBBLE = [0xb3aba1, 0x9d9890, 0xc8c2b8].map((c) => new THREE.Color(c));
/** Finesse de la grille du chemin (sous-cases par case) */
const SUB = 6;
const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Bâtiments devant lesquels la terre est battue (une cour, une place) */
const YARD: Partial<Record<KindId, number>> = { workshop: 0.45, gather: 0.5, farm: 0.42, mill: 0.42, landmark: 0.5, temple: 0.4, health: 0.42, school: 0.42, fire: 0.5 };
/** Bâtiments au pied desquels traînent tonneaux, caisses et sacs */
const CLUTTER: KindId[] = ['house', 'workshop', 'farm', 'mill'];
const BARREL = 0x9a6a44, HOOP = 0x6f5640, CRATE = 0xb48a5e, SACK = 0xd9c4a0;

/**
 * Routes : de vrais chemins de terre. Chaque case de route est un point (un peu décalé, d'une case à l'autre) relié à ses
 * voisines par des courbes ; un virage s'arrondit, un escalier de cases devient un chemin qui serpente. Le chemin est un
 * décalque posé sur le relief, aux bords doux et irréguliers, liseré d'une terre plus sombre et semé de cailloux ;
 * plus droit et plus large à partir de l'âge industriel. Les ponts sont des ouvrages (tablier, rampes, piles, garde-corps) :
 * un pont simple suit une courbe douce d'une rive à l'autre, même tracé en escalier
 */
export class RoadView {
  group = new THREE.Group();
  /** lanternes posées le long des chemins (x, z à la suite) : leur halo de lumière la nuit */
  lights: number[] = [];
  /** le chemin, en transparence sur ses bords */
  private path: THREE.Mesh;
  /** ponts, cailloux, lanternes, tonneaux et caisses */
  private solid: THREE.Mesh;
  /** verre des lanternes (s'allume la nuit) */
  private glow: THREE.Mesh;
  /** géométries de base des petits objets (non indexées) */
  private cyl = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0).toNonIndexed();
  private cube = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed();
  private ico = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  private noise = new Simplex(9137);

  constructor(private world: World) {
    const pathMat = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    // bord net : la transparence, douce d'un sommet à l'autre, est resserrée au pixel
    pathMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.a = smoothstep(0.38, 0.62, diffuseColor.a);');
    };
    this.path = new THREE.Mesh(new THREE.BufferGeometry(), pathMat);
    this.path.receiveShadow = true;
    this.path.renderOrder = 1;
    this.solid = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
    this.solid.receiveShadow = this.solid.castShadow = true;
    this.glow = new THREE.Mesh(new THREE.BufferGeometry(), mats.glow);
    for (const m of [this.path, this.solid, this.glow]) { m.frustumCulled = false; this.group.add(m); }
  }

  /** Point d'une case de route (son centre, décalé) et milieu du bord partagé avec la voisine, décalé aussi (le même des deux côtés) */
  private node(cx: number, cz: number, j: number): [number, number] {
    return [cx + 0.5 + (hash2(cx, cz, 11) - 0.5) * j, cz + 0.5 + (hash2(cx, cz, 12) - 0.5) * j];
  }
  private edgeMid(cx: number, cz: number, dx: number, dz: number, j: number): [number, number] {
    // bord entre la case et sa voisine : repéré par la case de plus petit indice
    const ax = dx < 0 ? cx - 1 : cx, az = dz < 0 ? cz - 1 : cz;
    const t = (hash2(ax * 2 + (dx ? 1 : 0), az * 2 + (dz ? 1 : 0), 13) - 0.5) * j;
    return dx ? [ax + 1, cz + 0.5 + t] : [cx + 0.5 + t, az + 1];
  }

  /**
   * Un pont d'un seul tenant (cases de route sur l'eau, `comp`) mis en file d'une rive à l'autre : la case de la rive de départ
   * (s'il y en a une), les cases du pont dans l'ordre, celle de la rive d'arrivée ; null pour un carrefour ou une boucle sur l'eau
   */
  private bridgeChain(comp: number[]): { cells: number[]; head: boolean; tail: boolean } | null {
    const w = this.world, set = new Set(comp);
    const at = (c: number, dx: number, dz: number) => { const x = (c % N) + dx, z = Math.floor(c / N) + dz; return w.inCells(x, z) ? w.ci(x, z) : -1; };
    const roads = (c: number) => D4.map(([dx, dz]) => at(c, dx, dz)).filter((n) => n >= 0 && w.road[n] === 1);
    if (comp.some((c) => roads(c).length > 2)) return null;
    const end = comp.find((c) => roads(c).filter((n) => set.has(n)).length <= 1);
    if (end === undefined) return null;
    const order = [end], seen = new Set(order);
    for (;;) {
      const next = roads(order[order.length - 1]).find((n) => set.has(n) && !seen.has(n));
      if (next === undefined) break;
      order.push(next); seen.add(next);
    }
    if (order.length !== comp.length) return null;
    const banks = (c: number) => roads(c).filter((n) => !set.has(n));
    const head = banks(order[0])[0], tail = order.length > 1 ? banks(order[order.length - 1])[0] : banks(order[0])[1];
    if (head === undefined && tail === undefined && order.length === 1) return null;
    return { cells: [...(head !== undefined ? [head] : []), ...order, ...(tail !== undefined ? [tail] : [])], head: head !== undefined, tail: tail !== undefined };
  }

  /** Cours en terre battue devant les ateliers, places, fermes : (x, z, rayon) rangés par case */
  private yards() {
    const w = this.world, out = new Map<number, number[]>();
    for (const b of w.buildings.values()) {
      const r = YARD[b.kind];
      if (!r) continue;
      const s = sizeOf(b), f = FRONT[b.rot], x = b.x + s / 2 + f[0] * (s / 2 + 0.3), z = b.z + s / 2 + f[1] * (s / 2 + 0.3);
      const cx = Math.floor(x), cz = Math.floor(z);
      if (!w.inCells(cx, cz) || w.occ[w.ci(cx, cz)] || w.cellAvg(cx, cz) < 0.1) continue;
      const k = w.ci(cx, cz), l = out.get(k) ?? [];
      l.push(x, z, r * (s > 1 ? 1.4 : 1));
      out.set(k, l);
    }
    const add = (k: number, x: number, z: number, r: number) => { const l = out.get(k) ?? []; l.push(x, z, r); out.set(k, l); };
    // un carré de 2 × 2 cases de route (ou une route de deux cases de large) : une placette pleine, sans trou d'herbe au milieu
    const plain = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1 && w.bridgeY(x, z) === null;
    for (let cz = 0; cz < N - 1; cz++)
      for (let cx = 0; cx < N - 1; cx++) {
        if (!plain(cx, cz) || !plain(cx + 1, cz) || !plain(cx, cz + 1) || !plain(cx + 1, cz + 1)) continue;
        add(w.ci(cx, cz), cx + 1, cz + 1, 0.45);
      }
    // la terre battue va de la rue jusqu'au mur des bâtiments qui la bordent : plus de liseré d'herbe entre les deux
    for (const b of w.buildings.values()) {
      if (b.kind === 'lamp' || b.kind === 'pier') continue;
      const s = sizeOf(b);
      for (const [dx, dz] of D4)
        for (let i = 0; i < s; i++) {
          const cx = dx === 0 ? b.x + i : dx > 0 ? b.x + s : b.x - 1, cz = dz === 0 ? b.z + i : dz > 0 ? b.z + s : b.z - 1;
          if (!plain(cx, cz)) continue;
          const ex = dx === 0 ? b.x + i + 0.5 : dx > 0 ? b.x + s : b.x, ez = dz === 0 ? b.z + i + 0.5 : dz > 0 ? b.z + s : b.z;
          add(w.ci(cx, cz), ex, ez, 0.24);
        }
    }
    // les poches d'herbe enclavées dans le village (entre routes et bâtiments) sont comblées
    const urban = (x: number, z: number) => {
      if (!w.inCells(x, z)) return false;
      const k = w.ci(x, z);
      return plain(x, z) || (!!w.occ[k] && w.buildingAt(x, z)?.kind !== 'lamp');
    };
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const k = w.ci(cx, cz);
        if (w.road[k] || w.occ[k] || w.veg[k] || w.lake[k] || w.cellAvg(cx, cz) < 0.1) continue;
        const e = urban(cx + 1, cz), o = urban(cx - 1, cz), s = urban(cx, cz + 1), n = urban(cx, cz - 1);
        if (!(plain(cx + 1, cz) || plain(cx - 1, cz) || plain(cx, cz + 1) || plain(cx, cz - 1))) continue;
        const c = +e + +o + +s + +n;
        // enclavée sur trois côtés, ou prise entre deux rues : toute la case
        if (c >= 3 || (e && o) || (n && s)) { add(k, cx + 0.5, cz + 0.5, 0.42); continue; }
        // un coin rentrant (deux côtés et la diagonale bâtis ou en rue) : le quart de case qui les rejoint
        if (c === 2) {
          const dx = e ? 1 : -1, dz = s ? 1 : -1;
          if (urban(cx + dx, cz + dz)) add(k, cx + (dx > 0 ? 1 : 0), cz + (dz > 0 ? 1 : 0), 0.3);
        }
      }
    return out;
  }

  /**
   * Cases de route qui reçoivent une lumière : d'abord les carrefours, puis les abords des portes et les virages, puis le reste,
   * une case sur deux environ le long des rues — des rues bien éclairées, sans en mettre sur chaque case
   */
  private lightCells(lines: Map<number, number[][]>) {
    const w = this.world, GAP = 1.75, out: number[] = [];
    const score = (k: number) => {
      const cx = k % N, cz = Math.floor(k / N);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1);
      const door = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => { const b = w.buildingAt(cx + dx, cz + dz); return !!b && b.kind !== 'lamp'; });
      const bend = dirs.length === 2 && dirs[0][0] !== -dirs[1][0];
      return (dirs.length >= 3 ? 3 : 0) + (door ? 2 : 0) + (bend ? 1 : 0) + hash2(cx, cz, 61) * 0.5;
    };
    const cand = [...lines.keys()].map((k) => [k, score(k)]).sort((a, b) => b[1] - a[1]);
    for (const [k] of cand) {
      const x = k % N, z = Math.floor(k / N);
      if (out.some((o) => Math.hypot((o % N) - x, Math.floor(o / N) - z) < GAP)) continue;
      out.push(k);
    }
    return out;
  }

  /** Tracé de chaque case : morceaux de ligne (x, z à la suite) qui forment le chemin */
  private skeleton(age: number) {
    const w = this.world, j = age >= 3 ? 0.06 : 0.22, lines = new Map<number, number[][]>();
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const k = w.ci(cx, cz);
        if (!w.road[k] || w.bridgeY(cx, cz) !== null) continue;
        const has = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => has(dx, dz));
        const n = this.node(cx, cz, j), out: number[][] = [];
        if (dirs.length === 2 && dirs[0][0] !== -dirs[1][0]) {
          // virage : une courbe d'un bord à l'autre, tirée par le point de la case
          const a = this.edgeMid(cx, cz, dirs[0][0], dirs[0][1], j), b = this.edgeMid(cx, cz, dirs[1][0], dirs[1][1], j), l: number[] = [];
          for (let s = 0; s <= 8; s++) { const t = s / 8, u = 1 - t; l.push(u * u * a[0] + 2 * u * t * n[0] + t * t * b[0], u * u * a[1] + 2 * u * t * n[1] + t * t * b[1]); }
          out.push(l);
        } else if (dirs.length === 2) {
          // tout droit : une ligne qui passe par le point de la case
          const a = this.edgeMid(cx, cz, dirs[0][0], dirs[0][1], j), b = this.edgeMid(cx, cz, dirs[1][0], dirs[1][1], j), l: number[] = [];
          for (let s = 0; s <= 6; s++) {
            const t = s / 6, u = 1 - t, m = 4 * t * u;
            l.push(u * a[0] + t * b[0] + m * (n[0] - (a[0] + b[0]) / 2), u * a[1] + t * b[1] + m * (n[1] - (a[1] + b[1]) / 2));
          }
          out.push(l);
        } else {
          // cul-de-sac, carrefour, case isolée : des branches depuis le point de la case
          for (const [dx, dz] of dirs) { const e = this.edgeMid(cx, cz, dx, dz, j); out.push([n[0], n[1], e[0], e[1]]); }
          if (!dirs.length) out.push([n[0], n[1], n[0] + 0.001, n[1]]);
        }
        // et vers la porte d'une maison voisine qui n'a pas d'autre route (chemin d'accès)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (has(dx, dz)) continue;
          const b = w.buildingAt(cx + dx, cz + dz);
          if (b && b.kind !== 'lamp') out.push([n[0], n[1], cx + 0.5 + dx * 0.55, cz + 0.5 + dz * 0.55]);
        }
        lines.set(k, out);
      }
    return lines;
  }

  rebuild(age: number, snow: number) {
    const w = this.world, a = Math.min(age, 4);
    const lines = this.skeleton(age), yards = this.yards();
    const base = AGE_COL[a].clone().lerp(SNOW, snow * 0.75), edge = EDGE_COL[a].clone().lerp(SNOW, snow * 0.7);
    const hw0 = age >= 4 ? 0.32 : age === 3 ? 0.3 : 0.25;
    // segments du chemin et cours autour d'une case (la case et ses voisines) : ax, az, bx, bz, rayon à la suite
    const near = (cx: number, cz: number) => {
      const out: number[] = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!w.inCells(cx + dx, cz + dz)) continue;
        const k = w.ci(cx + dx, cz + dz), ls = lines.get(k), ys = yards.get(k);
        if (ls) for (const l of ls) for (let i = 0; i + 3 < l.length; i += 2) out.push(l[i], l[i + 1], l[i + 2], l[i + 3], 0);
        if (ys) for (let i = 0; i < ys.length; i += 3) out.push(ys[i], ys[i + 1], ys[i], ys[i + 1], ys[i + 2]);
      }
      return out;
    };
    // distance du point au chemin (le bord d'une cour compte comme l'axe d'un chemin)
    const dist = (x: number, z: number, seg: number[]) => {
      let best = 9;
      for (let i = 0; i < seg.length; i += 5) {
        const ax = seg[i], az = seg[i + 1], bx = seg[i + 2] - ax, bz = seg[i + 3] - az, len = bx * bx + bz * bz;
        const t = len ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / len)) : 0;
        const ex = x - ax - bx * t, ez = z - az - bz * t;
        best = Math.min(best, Math.sqrt(ex * ex + ez * ez) - seg[i + 4]);
      }
      return Math.max(0, best);
    };
    // largeur qui varie un peu le long du chemin (pas pour l'asphalte)
    const half = (x: number, z: number) => hw0 * (1 + (age >= 4 ? 0 : 0.16 * this.noise.noise2(x * 1.1, z * 1.1)));

    // grille fine sur les cases de route et leurs voisines : couleur et transparence au sommet
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const vid = new Map<number, number>(), alpha: number[] = [];
    const S = N * SUB + 1, c = new THREE.Color();
    const vertex = (gx: number, gz: number, seg: number[]) => {
      const key = gz * S + gx;
      let id = vid.get(key);
      if (id !== undefined) return id;
      const x = gx / SUB, z = gz / SUB, d = dist(x, z, seg), h = half(x, z);
      // transparence étalée d'un sommet à l'autre, resserrée ensuite par le shader
      const al = 1 - smoothstep(h - 0.12, h + 0.12, d);
      // terre plus claire au milieu, plus sombre au bord, mouchetée
      c.copy(base).lerp(edge, smoothstep(h - 0.16, h - 0.02, d)).multiplyScalar(0.95 + 0.07 * this.noise.noise2(x * 5.3, z * 5.3));
      id = alpha.length;
      pos.push(x, w.hAt(x, z) + 0.02, z);
      col.push(c.r, c.g, c.b, al);
      alpha.push(al);
      vid.set(key, id);
      return id;
    };
    const cells = new Set<number>(), pathCell = (x: number, z: number) => { const k = z * N + x; return w.inCells(x, z) && (lines.has(k) || yards.has(k)); };
    for (const k of [...lines.keys(), ...yards.keys()]) {
      const cx = k % N, cz = Math.floor(k / N);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.inCells(cx + dx, cz + dz) && w.bridgeY(cx + dx, cz + dz) === null) cells.add(w.ci(cx + dx, cz + dz));
    }
    // le chemin déborde à peine d'une case de route : dans une case voisine, seule la lisière compte
    const OFF = [[0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45], [0.33, 0.33], [-0.33, 0.33], [0.33, -0.33], [-0.33, -0.33]];
    for (const k of cells) {
      const cx = k % N, cz = Math.floor(k / N), seg = near(cx, cz), own = pathCell(cx, cz);
      if (!seg.length) continue;
      for (let j = 0; j < SUB; j++) for (let i = 0; i < SUB; i++) {
        const gx = cx * SUB + i, gz = cz * SUB + j;
        if (!own) { const qx = (gx + 0.5) / SUB, qz = (gz + 0.5) / SUB; if (!OFF.some(([dx, dz]) => pathCell(Math.floor(qx + dx), Math.floor(qz + dz)))) continue; }
        const v00 = vertex(gx, gz, seg), v10 = vertex(gx + 1, gz, seg), v01 = vertex(gx, gz + 1, seg), v11 = vertex(gx + 1, gz + 1, seg);
        if (alpha[v00] + alpha[v10] + alpha[v01] + alpha[v11] < 0.01) continue;
        idx.push(v00, v11, v10, v00, v01, v11);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.path.geometry.dispose();
    this.path.geometry = g;

    // ponts et cailloux
    const sp: number[] = [], sc: number[] = [];
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, cl: THREE.Color) => {
      const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]])
        for (const i of [f[0], f[1], f[2], f[0], f[2], f[3]]) { sp.push(...v[i]); sc.push(cl.r, cl.g, cl.b); }
    };
    const deck = DECK_COL[a].clone().lerp(SNOW, snow * 0.6), pile = PILE_COL[a];
    /** Pont : tablier au-dessus de l'eau, rampes vers les rives, piles et garde-corps */
    const bridge = (cx: number, cz: number, y: number, has: (dx: number, dz: number) => boolean) => {
      const ew = has(-1, 0) || has(1, 0), ns = has(0, -1) || has(0, 1);
      const x0 = cx + (has(-1, 0) ? 0 : 0.18), x1 = cx + 1 - (has(1, 0) ? 0 : 0.18);
      const z0 = cz + (has(0, -1) ? 0 : 0.18), z1 = cz + 1 - (has(0, 1) ? 0 : 0.18);
      box(x0, y - 0.05, z0, x1, y, z1, deck);
      // rampes vers une route de la rive (plus basse ou plus haute que le tablier)
      const ramp = (dx: number, dz: number) => {
        if (!has(dx, dz) || w.bridgeY(cx + dx, cz + dz) !== null) return;
        const ex = dx > 0 ? cx + 1 : dx < 0 ? cx : 0, ez = dz > 0 ? cz + 1 : dz < 0 ? cz : 0;
        const fx = ex + dx * 0.45, fz = ez + dz * 0.45;
        // pente du tablier jusqu'à la route de la rive, à 0,45 case du bord
        const quad = dx
          ? [[ex, y, z0], [fx, w.hAt(fx, cz + 0.5) + 0.04, z0], [fx, w.hAt(fx, cz + 0.5) + 0.04, z1], [ex, y, z1]]
          : [[x0, y, ez], [x0, w.hAt(cx + 0.5, fz) + 0.04, fz], [x1, w.hAt(cx + 0.5, fz) + 0.04, fz], [x1, y, ez]];
        for (const i of [0, 1, 2, 0, 2, 3]) { sp.push(...quad[i]); sc.push(deck.r, deck.g, deck.b); }
      };
      ramp(-1, 0); ramp(1, 0); ramp(0, -1); ramp(0, 1);
      // piles plantées dans l'eau
      const foot = Math.min(y - 0.6, w.hAt(cx + 0.5, cz + 0.5));
      for (const [px, pz] of ew && !ns ? [[cx + 0.5, z0 + 0.06], [cx + 0.5, z1 - 0.06]] : [[x0 + 0.06, cz + 0.5], [x1 - 0.06, cz + 0.5]]) box(px - 0.05, foot, pz - 0.05, px + 0.05, y - 0.05, pz + 0.05, pile);
      // garde-corps le long des bords libres
      const rail = age >= 4 ? deck : pile;
      if (ew && !ns) for (const z of [z0 + 0.015, z1 - 0.015]) { box(x0, y + 0.1, z - 0.012, x1, y + 0.13, z + 0.012, rail); for (let x = x0 + 0.05; x < x1; x += 0.3) box(x - 0.012, y, z - 0.012, x + 0.012, y + 0.1, z + 0.012, rail); }
      if (ns && !ew) for (const x of [x0 + 0.015, x1 - 0.015]) { box(x - 0.012, y + 0.1, z0, x + 0.012, y + 0.13, z1, rail); for (let z = z0 + 0.05; z < z1; z += 0.3) box(x - 0.012, y, z - 0.012, x + 0.012, y + 0.1, z + 0.012, rail); }
    };
    /** Pavé orienté : centre (x, z), axe (ux, uz) sur ±hu, en travers sur ±hv, de y0 à y1 */
    const obox = (x: number, z: number, ux: number, uz: number, hu: number, hv: number, y0: number, y1: number, cl: THREE.Color) => {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [x + ux * hu * p - uz * hv * q, z + uz * hu * p + ux * hv * q]);
      const v = [...c.map(([px, pz]) => [px, y0, pz]), ...c.map(([px, pz]) => [px, y1, pz])];
      for (const f of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]])
        for (const i of [f[0], f[1], f[2], f[0], f[2], f[3]]) { sp.push(...v[i]); sc.push(cl.r, cl.g, cl.b); }
    };
    const quad = (q: number[][], cl: THREE.Color) => { for (const i of [0, 1, 2, 0, 2, 3]) { sp.push(...q[i]); sc.push(cl.r, cl.g, cl.b); } };
    const plank = new THREE.Color();
    /**
     * Pont simple : un axe qui part du pied de la rampe, sur le chemin de la rive, coupe les virages comme les habitants
     * (diagonale d'un tracé en escalier), rejoint l'autre rive ; adouci, puis tablier en ruban, garde-corps et piles
     */
    const smoothBridge = (ch: { cells: number[]; head: boolean; tail: boolean }) => {
      const cells = ch.cells, jit = age >= 3 ? 0.06 : 0.22, hw = age >= 4 ? 0.34 : 0.32, th = 0.055;
      const xz = (c: number) => [c % N, Math.floor(c / N)];
      const i0 = ch.head ? 1 : 0, i1 = cells.length - (ch.tail ? 2 : 1);
      const deckY = w.bridgeY(xz(cells[i0])[0], xz(cells[i0])[1])!;
      const pts: number[][] = [];
      for (let i = i0; i <= i1; i++) { const [px, pz] = w.passPoint(cells, i); pts.push([px, deckY, pz]); }
      // aux deux bouts : rampe jusqu'au chemin de la rive, ou tablier qui s'arrête au-dessus de l'eau
      const cap = (bank: number | undefined, first: number, toward: number[], atStart: boolean) => {
        const [fx, fz] = xz(first);
        if (bank !== undefined) {
          const [bx, bz] = xz(bank), dx = fx - bx, dz = fz - bz, e = this.edgeMid(bx, bz, dx, dz, jit);
          // la rampe descend tout droit du tablier sur le chemin de la rive (sans coude au bord, où le ruban se replierait)
          const px = e[0] - dx * 0.45, pz = e[1] - dz * 0.45, foot = [px, w.hAt(px, pz) + 0.04, pz];
          if (atStart) pts.unshift(foot); else pts.push(foot);
        } else {
          const ox = fx + 0.5 - toward[0], oz = fz + 0.5 - toward[2], l = Math.hypot(ox, oz) || 1;
          const p = [fx + 0.5 + (ox / l) * 0.32, deckY, fz + 0.5 + (oz / l) * 0.32];
          if (atStart) pts.unshift(p); else pts.push(p);
        }
      };
      const [ex, ez] = xz(cells[cells.length - 1]);
      cap(ch.head ? cells[0] : undefined, cells[i0], pts.length > 1 ? pts[1] : [ex + 0.5, 0, ez + 0.5], true);
      cap(ch.tail ? cells[cells.length - 1] : undefined, cells[i1], pts[pts.length - 2], false);
      // adoucir l'axe (deux passes de Chaikin, bouts fixes)
      let line = pts;
      for (let it = 0; it < 2; it++) {
        const out = [line[0]];
        for (let i = 0; i + 1 < line.length; i++) {
          const p = line[i], q = line[i + 1];
          out.push(p.map((v, k) => v * 0.75 + q[k] * 0.25), p.map((v, k) => v * 0.25 + q[k] * 0.75));
        }
        out.push(line[line.length - 1]);
        line = out;
      }
      // côtés du ruban ; au-dessus de l'eau (pas sur les rampes) : garde-corps et piles
      const n = line.length, L: number[][] = [], R: number[][] = [], wet: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const p = line[Math.max(0, i - 1)], q = line[Math.min(n - 1, i + 1)], tx = q[0] - p[0], tz = q[2] - p[2], tl = Math.hypot(tx, tz) || 1;
        const nx = -tz / tl, nz = tx / tl, c = line[i];
        L.push([c[0] + nx * hw, c[1], c[2] + nz * hw]); R.push([c[0] - nx * hw, c[1], c[2] - nz * hw]);
        wet.push(w.isWet(Math.floor(c[0]), Math.floor(c[2])) && c[1] > deckY - 0.05);
      }
      const rail = age >= 4 ? deck : pile;
      let run = 0, nextPost = 0.05, nextPile = 0.35;
      for (let i = 0; i + 1 < n; i++) {
        // tablier : planches de bois à la teinte qui varie, dalles de pierre, chaussée d'acier
        plank.copy(deck).multiplyScalar(a <= 2 ? 0.88 + 0.16 * hash2(i, cells[0], 81) : 0.96 + 0.06 * hash2(i, cells[0], 81));
        const l0 = L[i], l1 = L[i + 1], r0 = R[i], r1 = R[i + 1], down = (v: number[]) => [v[0], v[1] - th, v[2]];
        quad([l0, l1, r1, r0], plank);
        quad([down(l0), down(r0), down(r1), down(l1)], pile);
        quad([l0, down(l0), down(l1), l1], deck);
        quad([r0, r1, down(r1), down(r0)], deck);
        const p = line[i], q = line[i + 1], seg = Math.hypot(q[0] - p[0], q[2] - p[2]);
        if (!seg) continue;
        const ux = (q[0] - p[0]) / seg, uz = (q[2] - p[2]) / seg;
        if (wet[i] && wet[i + 1]) {
          // main courante continue et poteaux réguliers, des deux côtés, un peu en retrait du bord
          for (const s of [L, R]) {
            const s0 = s[i], s1 = s[i + 1], ml = Math.hypot(s1[0] - s0[0], s1[2] - s0[2]);
            const ix = ((p[0] - s0[0]) / hw) * 0.015, iz = ((p[2] - s0[2]) / hw) * 0.015;
            obox((s0[0] + s1[0]) / 2 + ix, (s0[2] + s1[2]) / 2 + iz, ux, uz, ml / 2 + 0.006, 0.012, p[1] + 0.1, p[1] + 0.13, rail);
          }
          for (; nextPost < run + seg; nextPost += 0.3) {
            const t = (nextPost - run) / seg, cx = p[0] + (q[0] - p[0]) * t, cz = p[2] + (q[2] - p[2]) * t;
            for (const s of [L, R]) {
              const x = s[i][0] + (s[i + 1][0] - s[i][0]) * t, z = s[i][2] + (s[i + 1][2] - s[i][2]) * t;
              obox(x + ((cx - x) / hw) * 0.015, z + ((cz - z) / hw) * 0.015, ux, uz, 0.012, 0.012, p[1], p[1] + 0.1, rail);
            }
          }
          // piles plantées dans l'eau : poteaux de bois par paires, piles de pierre en travers, fûts d'acier
          for (; nextPile < run + seg; nextPile += 0.8) {
            const t = (nextPile - run) / seg, x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t, y = p[1], foot = Math.min(y - 0.6, w.hAt(x, z));
            if (a === 2 || a === 3) obox(x, z, -uz, ux, hw * 0.82, 0.07, foot, y - th, pile);
            else for (const o of [-1, 1]) obox(x - uz * o * (hw - 0.07), z + ux * o * (hw - 0.07), ux, uz, a >= 4 ? 0.035 : 0.05, a >= 4 ? 0.035 : 0.05, foot, y - th, pile);
          }
        } else {
          nextPost = run + seg + 0.05;
          nextPile = Math.max(nextPile, run + seg + 0.2);
        }
        run += seg;
      }
    };
    // ponts : un pont simple suit sa courbe ; un carrefour ou une boucle sur l'eau reste un ouvrage case par case
    const isBridge = (cx: number, cz: number) => w.inCells(cx, cz) && w.road[w.ci(cx, cz)] === 1 && w.bridgeY(cx, cz) !== null;
    const done = new Set<number>();
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        const k = w.ci(cx, cz);
        if (done.has(k) || !isBridge(cx, cz)) continue;
        const comp = [k];
        done.add(k);
        for (let i = 0; i < comp.length; i++) {
          const x = comp[i] % N, z = Math.floor(comp[i] / N);
          for (const [dx, dz] of D4) { if (!isBridge(x + dx, z + dz)) continue; const nk = w.ci(x + dx, z + dz); if (!done.has(nk)) { done.add(nk); comp.push(nk); } }
        }
        const ch = this.bridgeChain(comp);
        if (ch) { smoothBridge(ch); continue; }
        for (const c of comp) {
          const x = c % N, z = Math.floor(c / N);
          bridge(x, z, w.bridgeY(x, z)!, (dx, dz) => w.inCells(x + dx, z + dz) && w.road[w.ci(x + dx, z + dz)] === 1);
        }
      }
    // cailloux au bord des chemins de terre (et quelques-uns dessus), pas sur l'asphalte ni sous la neige
    if (age < 4 && snow < 0.5) {
      const pebble = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(), pp = pebble.attributes.position;
      for (const [k, ls] of lines) for (const l of ls) for (let i = 0; i + 3 < l.length; i += 2) {
        const r = hash2(k, i, 41);
        if (r > 0.45) continue;
        const ax = l[i], az = l[i + 1], dx = l[i + 2] - ax, dz = l[i + 3] - az, len = Math.hypot(dx, dz) || 1;
        const side = r < 0.18 ? 0.25 : r < 0.36 ? -1 : 1, t = hash2(k, i, 42);
        const x = ax + dx * t + (-dz / len) * side * half(ax, az) * 1.02, z = az + dz * t + (dx / len) * side * half(ax, az) * 1.02;
        const s = 0.018 + hash2(k, i, 43) * 0.022, y = w.hAt(x, z), cl = PEBBLE[Math.floor(hash2(k, i, 44) * 3)];
        for (let v = 0; v < pp.count; v++) { sp.push(x + pp.getX(v) * s * 1.2, y + pp.getY(v) * s * 0.55, z + pp.getZ(v) * s); sc.push(cl.r, cl.g, cl.b); }
      }
    }
    // petits objets : une géométrie de base étirée, tournée, posée
    const gp: number[] = [], gc: number[] = [];
    const put = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, cl: THREE.Color | number, glow = false) => {
      const p = geo.attributes.position, co = Math.cos(ry), si = Math.sin(ry), col = typeof cl === 'number' ? new THREE.Color(cl) : cl;
      const P = glow ? gp : sp, Cc = glow ? gc : sc;
      for (let v = 0; v < p.count; v++) {
        const lx = p.getX(v) * sx, ly = p.getY(v) * sy, lz = p.getZ(v) * sz;
        P.push(x + lx * co + lz * si, y + ly, z - lx * si + lz * co);
        Cc.push(col.r, col.g, col.b);
      }
    };
    // éclairage automatique des chemins : torches à la Préhistoire, puis lanternes pendues, réverbères à gaz, lampadaires
    this.lights = [];
    for (const k of this.lightCells(lines)) {
      const cx = k % N, cz = Math.floor(k / N);
      const roadAt = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1;
      const dry = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && !w.isWet(cx + dx, cz + dz);
      // au bord du chemin, de préférence du côté d'une case libre, sinon le long d'un bâtiment (la lanterne reste sur la
      // case de la route) ; à un carrefour en croix, dans l'angle entre deux rues
      const side = D4.find(([dx, dz]) => !roadAt(dx, dz) && dry(dx, dz) && !w.occ[w.ci(cx + dx, cz + dz)])
        ?? D4.find(([dx, dz]) => !roadAt(dx, dz) && dry(dx, dz))
        ?? [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([dx, dz]) => [dx * 0.72, dz * 0.72, dx, dz]).find(([, , dx, dz]) => !roadAt(dx, dz) && dry(dx, dz));
      if (!side) continue;
      const n = this.node(cx, cz, age >= 3 ? 0.06 : 0.22), off = hw0 + 0.09, x = n[0] + side[0] * off, z = n[1] + side[1] * off, y = w.hAt(x, z);
      // le bras de la lanterne se tend vers le chemin
      const ry = Math.atan2(-side[0], -side[1]) - Math.PI / 2;
      this.lights.push(x - side[0] * 0.08, z - side[1] * 0.08);
      if (age === 0) {
        // torche : pieu de bois, tête de paille ficelée, flamme
        put(this.cube, x, y, z, 0.022, 0.3, 0.022, ry, 0x7a5a3e);
        put(this.cyl, x, y + 0.28, z, 0.026, 0.05, 0.026, 0, 0xc9a46a);
        put(this.ico, x, y + 0.36, z, 0.026, 0.045, 0.026, ry, 0xffb15c, true);
      } else if (age <= 2) {
        put(this.cube, x, y, z, 0.026, 0.36, 0.026, ry, 0x7a6355);
        put(this.cube, x + -side[0] * 0.05, y + 0.34, z + -side[1] * 0.05, side[0] ? 0.11 : 0.02, 0.018, side[0] ? 0.02 : 0.11, 0, 0x7a6355);
        put(this.cube, x + -side[0] * 0.09, y + 0.24, z + -side[1] * 0.09, 0.038, 0.05, 0.038, ry, 0xffd27a, true);
        put(this.cube, x + -side[0] * 0.09, y + 0.29, z + -side[1] * 0.09, 0.05, 0.012, 0.05, ry, 0x5a4636);
      } else if (age === 3) {
        put(this.cyl, x, y, z, 0.012, 0.38, 0.012, 0, 0x3c4a44);
        put(this.cube, x, y + 0.38, z, 0.036, 0.05, 0.036, ry, 0xffe2a0, true);
        put(this.cube, x, y + 0.43, z, 0.05, 0.014, 0.05, ry, 0x3c4a44);
      } else {
        put(this.cyl, x, y, z, 0.01, 0.42, 0.01, 0, 0x8a9098);
        put(this.cube, x + -side[0] * 0.04, y + 0.42, z + -side[1] * 0.04, side[0] ? 0.1 : 0.03, 0.012, side[0] ? 0.03 : 0.1, 0, 0x6b7280);
        put(this.cube, x + -side[0] * 0.07, y + 0.41, z + -side[1] * 0.07, 0.04, 0.008, 0.04, 0, 0xfff1c9, true);
      }
    }
    // tonneaux, caisses, sacs (ou bacs à fleurs) au pied des maisons et des ateliers, à côté de la porte
    if (age >= 1 && snow < 0.6) for (const b of w.buildings.values()) {
      if (!CLUTTER.includes(b.kind) || hash2(b.x, b.z, 71) > 0.6) continue;
      const s = sizeOf(b), f = FRONT[b.rot], t = [f[1], -f[0]], side = hash2(b.x, b.z, 72) < 0.5 ? 1 : -1;
      const n = 1 + Math.floor(hash2(b.x, b.z, 73) * 3);
      for (let i = 0; i < n; i++) {
        const lat = side * (0.3 + i * 0.09), fw = s / 2 + 0.1 + (i % 2) * 0.07;
        const x = b.x + s / 2 + f[0] * fw + t[0] * lat, z = b.z + s / 2 + f[1] * fw + t[1] * lat, cx = Math.floor(x), cz = Math.floor(z);
        if (!w.inCells(cx, cz) || (w.occ[w.ci(cx, cz)] && w.occ[w.ci(cx, cz)] !== b.id) || w.cellAvg(cx, cz) < 0.1) continue;
        const y = w.hAt(x, z), r = hash2(b.x + i, b.z, 74), ry = hash2(b.x, b.z + i, 75) * 6.28;
        if (age >= 4) { put(this.cube, x, y, z, 0.09, 0.05, 0.05, ry, 0xb4b0a8); put(this.ico, x, y + 0.07, z, 0.045, 0.03, 0.03, ry, 0x7cc46a); }
        else if (r < 0.45) { put(this.cyl, x, y, z, 0.038, 0.085, 0.038, 0, BARREL); put(this.cyl, x, y + 0.02, z, 0.04, 0.008, 0.04, 0, HOOP); put(this.cyl, x, y + 0.062, z, 0.04, 0.008, 0.04, 0, HOOP); }
        else if (r < 0.8) put(this.cube, x, y, z, 0.07, 0.06, 0.07, ry, CRATE);
        else put(this.ico, x, y + 0.03, z, 0.04, 0.035, 0.035, ry, SACK);
      }
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    gg.setAttribute('aLight', new THREE.Float32BufferAttribute(new Float32Array(gp.length / 3), 1));
    gg.computeVertexNormals();
    this.glow.geometry.dispose();
    this.glow.geometry = gg;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    sg.computeVertexNormals();
    this.solid.geometry.dispose();
    this.solid.geometry = sg;
  }
}
