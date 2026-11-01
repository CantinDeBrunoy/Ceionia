import * as THREE from 'three';
import { World, N } from '../world/world';
import { hash2, smoothstep } from '../core/rng';
import { Simplex } from '../world/noise';
import { KINDS, KindId } from '../build/catalog';
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
/** Bâtiments devant lesquels la terre est battue (une cour, une place) */
const YARD: Partial<Record<KindId, number>> = { workshop: 0.45, gather: 0.5, farm: 0.42, mill: 0.42, landmark: 0.5, temple: 0.4 };
/** Bâtiments au pied desquels traînent tonneaux, caisses et sacs */
const CLUTTER: KindId[] = ['house', 'workshop', 'farm', 'mill', 'gather'];
const BARREL = 0x9a6a44, HOOP = 0x6f5640, CRATE = 0xb48a5e, SACK = 0xd9c4a0;

/**
 * Routes : de vrais chemins de terre. Chaque case de route est un point (un peu décalé, d'une case à l'autre) relié à ses
 * voisines par des courbes ; un virage s'arrondit, un escalier de cases devient un chemin qui serpente. Le chemin est un
 * décalque posé sur le relief, aux bords doux et irréguliers, liseré d'une terre plus sombre et semé de cailloux ;
 * plus droit et plus large à partir de l'âge industriel. Les ponts restent des ouvrages (tablier, rampes, piles, garde-corps)
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

  /** Cours en terre battue devant les ateliers, places, fermes : (x, z, rayon) rangés par case */
  private yards() {
    const w = this.world, out = new Map<number, number[]>();
    for (const b of w.buildings.values()) {
      const r = YARD[b.kind];
      if (!r) continue;
      const s = KINDS[b.kind].size, f = FRONT[b.rot], x = b.x + s / 2 + f[0] * (s / 2 + 0.3), z = b.z + s / 2 + f[1] * (s / 2 + 0.3);
      const cx = Math.floor(x), cz = Math.floor(z);
      if (!w.inCells(cx, cz) || w.occ[w.ci(cx, cz)] || w.cellAvg(cx, cz) < 0.1) continue;
      const k = w.ci(cx, cz), l = out.get(k) ?? [];
      l.push(x, z, r * (s > 1 ? 1.4 : 1));
      out.set(k, l);
    }
    // un carré de 2 × 2 cases de route (ou une route de deux cases de large) : une placette pleine, sans trou d'herbe au milieu
    const plain = (x: number, z: number) => w.inCells(x, z) && w.road[w.ci(x, z)] === 1 && w.bridgeY(x, z) === null;
    for (let cz = 0; cz < N - 1; cz++)
      for (let cx = 0; cx < N - 1; cx++) {
        if (!plain(cx, cz) || !plain(cx + 1, cz) || !plain(cx, cz + 1) || !plain(cx + 1, cz + 1)) continue;
        const k = w.ci(cx, cz), l = out.get(k) ?? [];
        l.push(cx + 1, cz + 1, 0.45);
        out.set(k, l);
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
    for (let cz = 0; cz < N; cz++)
      for (let cx = 0; cx < N; cx++) {
        if (!w.road[w.ci(cx, cz)]) continue;
        const by = w.bridgeY(cx, cz);
        if (by !== null) bridge(cx, cz, by, (dx, dz) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1);
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
    // lanternes le long des chemins, à partir de l'Antiquité : poteau de bois et lanterne pendue, puis réverbère à gaz, puis lampadaire
    this.lights = [];
    if (age >= 1) for (const k of lines.keys()) {
      const cx = k % N, cz = Math.floor(k / N);
      if (hash2(cx, cz, 61) > 0.16) continue;
      const roadAt = (dx: number, dz: number) => w.inCells(cx + dx, cz + dz) && w.road[w.ci(cx + dx, cz + dz)] === 1;
      // du côté d'une case libre (ni route, ni bâtiment, ni eau)
      const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => !roadAt(dx, dz) && w.inCells(cx + dx, cz + dz) && !w.occ[w.ci(cx + dx, cz + dz)] && w.cellAvg(cx + dx, cz + dz) > 0.1);
      if (!side) continue;
      const n = this.node(cx, cz, age >= 3 ? 0.06 : 0.22), off = hw0 + 0.09, x = n[0] + side[0] * off, z = n[1] + side[1] * off, y = w.hAt(x, z);
      // le bras de la lanterne se tend vers le chemin
      const ry = Math.atan2(-side[0], -side[1]) - Math.PI / 2;
      this.lights.push(x - side[0] * 0.08, z - side[1] * 0.08);
      if (age <= 2) {
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
      const s = KINDS[b.kind].size, f = FRONT[b.rot], t = [f[1], -f[0]], side = hash2(b.x, b.z, 72) < 0.5 ? 1 : -1;
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
